import * as React from "react";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import {
  ChevronLeft,
  Clipboard,
  Eraser,
  Expand,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Sparkles,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";

import "@xterm/xterm/css/xterm.css";

import { apiRequest } from "@/lib/api/client";
import {
  useCreateTerminalSessionMutation,
  useDeleteTerminalSessionMutation,
  useEndTerminalSessionMutation,
  useRenameTerminalSessionMutation,
  useTerminalSessionsQuery,
} from "@/lib/query/terminal";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { cn } from "@/design/lib/utils";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import type { TerminalSessionDescriptor } from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";
import { useVisualViewportKeyboardInset } from "../shared/useVisualViewportKeyboardInset";

import { createTerminalPanelCommands } from "./terminalPanelCommands";
import {
  createTerminalSessionActions,
  type TerminalSessionAction,
} from "./terminalSessionActions";

/**
 * Workspace terminal panel — xterm.js frontend over the node-pty backend
 * (`apps/api/modules/terminal`).
 *
 * Transport contract (see `apps/api/modules/terminal/routes.ts`):
 *  - GET  /api/terminal/sessions                    roster (persisted)
 *  - GET  /api/terminal/sessions/:id/stream         SSE output stream;
 *        opening it spawns/attaches the PTY (attachStreamClient). Events are
 *        SSE with `event: terminal` and a JSON payload. Output event shape:
 *        `{ type: "output", sid, seq, data, emittedAtMs }`. Other events:
 *        `session`, `reset`, `clear`, `closed`, `error`.
 *  - POST /api/terminal/sessions/:id/input          `{ data }` → term.write
 *  - POST /api/terminal/sessions/:id/resize         `{ cols, rows }` → term.resize
 *
 * xterm is created once per active session (useEffect keyed on sessionId) and
 * disposed on cleanup/session switch. Input/resize are best-effort POSTs.
 */

const STREAM_BASE = "/api/terminal/sessions";
const TERMINAL_FONT_SIZE_STORAGE_KEY =
  "tracevane.workspace.terminal.font-size.v1";
const TERMINAL_FLOATING_COLLAPSED_STORAGE_KEY =
  "tracevane.workspace.terminal-floating-collapsed.v1";
const TERMINAL_TOUCH_SCROLL_PX_PER_LINE = 10;
const TERMINAL_TOUCH_SCROLL_MIN_LINES = 1;
const TERMINAL_TOUCH_SCROLL_MAX_LINES = 18;
const TERMINAL_COMPACT_ROSTER_THRESHOLD = 4;
const TERMINAL_ICON_ONLY_ROSTER_THRESHOLD = 7;

type StreamEvent =
  | { type: "session"; sid: string; instanceId: string; outputSeq: number }
  | { type: "output"; sid: string; seq: number; data: string }
  | { type: "reset"; sid: string; instanceId: string; reason?: string }
  | { type: "clear"; sid: string }
  | { type: "closed"; sid: string; reason?: string }
  | { type: "error"; message?: string }
  | { type: string; sid?: string };

interface TerminalController {
  sessionId: string;
  clear: () => void;
  getVisibleOutput: () => string;
  paste: (value: string) => void;
}

interface WorkspaceTerminalProps {
  /** Optional className for the outer panel. */
  className?: string;
  /** Workspace directory used as default cwd for new terminals and drag/drop paste target context. */
  workspaceDirectory?: {
    rootId: string;
    rootAbsolutePath: string;
    relativePath: string;
    absolutePath: string;
  };
  /** Registers terminal commands with the Workspace command palette. */
  onCommandsChange?: (commands: WorkspaceCommand[]) => void;
  /** True when the terminal dock panel is in Workspace immersive mode. */
  maximized?: boolean;
  /** True when the terminal owns browser fullscreen. */
  browserFullscreen?: boolean;
  /** Browser Fullscreen API availability, surfaced by the workbench shell. */
  browserFullscreenAvailable?: boolean;
  /** Toggle terminal Workspace immersive mode. */
  onToggleMaximize?: () => void;
  /** Toggle terminal browser fullscreen mode. */
  onToggleBrowserFullscreen?: () => void;
  /** One-shot input request from another Workspace module, e.g. Search → Terminal. */
  inputRequest?: { id: string; value: string; label?: string } | null;
}

export function WorkspaceTerminal({
  className,
  workspaceDirectory,
  onCommandsChange,
  maximized = false,
  browserFullscreen = false,
  browserFullscreenAvailable = false,
  onToggleMaximize,
  onToggleBrowserFullscreen,
  inputRequest = null,
}: WorkspaceTerminalProps) {
  const sessionsQuery = useTerminalSessionsQuery();
  const sessions = sessionsQuery.data?.sessions ?? [];
  const attachableSessions = React.useMemo(
    () => sessions.filter((session) => session.canResume),
    [sessions],
  );
  const archivedSessions = React.useMemo(
    () => sessions.filter((session) => !session.canResume),
    [sessions],
  );
  const createSession = useCreateTerminalSessionMutation();
  const endSession = useEndTerminalSessionMutation();
  const deleteSession = useDeleteTerminalSessionMutation();
  const renameSession = useRenameTerminalSessionMutation();
  const terminalControllerRef = React.useRef<TerminalController | null>(null);
  const processedInputRequestRef = React.useRef<string | null>(null);
  const [terminalControllerVersion, setTerminalControllerVersion] =
    React.useState(0);
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    session: TerminalSessionDescriptor;
  } | null>(null);
  const [renameDialog, setRenameDialog] = React.useState<{
    session: TerminalSessionDescriptor;
    title: string;
  } | null>(null);
  const [terminalHistoryOpen, setTerminalHistoryOpen] = React.useState(false);

  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  const [fontSize, setFontSize] = React.useState(() => loadTerminalFontSize());
  const touchActionSurface = useTerminalTouchActionSurface();

  // Pick the first attachable session once loaded, if none chosen. Persisted
  // completed/lost sessions are evidence only; attaching them produces the raw
  // backend `terminal_session_not_found` error the user saw.
  React.useEffect(() => {
    if (activeSessionId || attachableSessions.length === 0) return;
    setActiveSessionId(attachableSessions[0].sessionId);
  }, [attachableSessions, activeSessionId]);

  React.useEffect(() => {
    saveTerminalFontSize(fontSize);
  }, [fontSize]);

  React.useEffect(() => {
    if (!activeSessionId) return;
    const selected = sessions.find(
      (session) => session.sessionId === activeSessionId,
    );
    if (selected && !selected.canResume) {
      setActiveSessionId(null);
    }
  }, [activeSessionId, sessions]);

  const [creating, setCreating] = React.useState(false);

  const activeSession = React.useMemo(
    () =>
      sessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const activeCwd =
    activeSession?.cwd || workspaceDirectory?.absolutePath || "";

  const handleOpenSessionActions = React.useCallback(
    (session: TerminalSessionDescriptor) => {
      setActiveSessionId(session.sessionId);
      setMenu({
        x: Math.max(16, window.innerWidth - 248),
        y: 48,
        session,
      });
    },
    [],
  );

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const handleCreate = React.useCallback(async () => {
    setCreating(true);
    try {
      const newId = `ide-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      await createSession.mutateAsync({
        sid: newId,
        targetKind: "local",
        pinned: false,
        cwd: workspaceDirectory?.absolutePath ?? null,
      });
      await sessionsQuery.refetch();
      setActiveSessionId(newId);
    } finally {
      setCreating(false);
    }
  }, [
    createSession.mutateAsync,
    sessionsQuery.refetch,
    workspaceDirectory?.absolutePath,
  ]);

  const handleEndSession = React.useCallback(
    (sessionId: string) => {
      endSession.mutate(
        { sid: sessionId },
        {
          onSuccess: () => {
            if (activeSessionId === sessionId) setActiveSessionId(null);
          },
        },
      );
    },
    [activeSessionId, endSession.mutate],
  );

  const handleDeleteSession = React.useCallback(
    (sessionId: string) => {
      const session = sessions.find(
        (candidate) => candidate.sessionId === sessionId,
      );
      const deletePersistedSession = () => {
        deleteSession.mutate(sessionId, {
          onSuccess: () => {
            if (activeSessionId === sessionId) setActiveSessionId(null);
            toast.success("终端记录已删除");
          },
          onError: (error) =>
            toast.error("删除终端记录失败", { description: error.message }),
        });
      };

      if (session?.canResume) {
        endSession.mutate(
          { sid: sessionId },
          {
            onSuccess: () => {
              if (activeSessionId === sessionId) setActiveSessionId(null);
              deletePersistedSession();
            },
            onError: (error) =>
              toast.error("关闭终端失败", { description: error.message }),
          },
        );
        return;
      }

      deletePersistedSession();
    },
    [activeSessionId, deleteSession, endSession, sessions],
  );

  const handleClearArchivedSessions = React.useCallback(() => {
    for (const session of archivedSessions) {
      deleteSession.mutate(session.sessionId, {
        onSuccess: () => {
          if (activeSessionId === session.sessionId) setActiveSessionId(null);
        },
      });
    }
    if (archivedSessions.length > 0) {
      toast.success("已清理终端历史记录", {
        description: `${archivedSessions.length} 条不可恢复记录已进入删除队列。`,
      });
    }
  }, [activeSessionId, archivedSessions, deleteSession.mutate]);

  const handleCloseOtherSessions = React.useCallback(
    (session: TerminalSessionDescriptor) => {
      const targets = attachableSessions.filter(
        (candidate) => candidate.sessionId !== session.sessionId,
      );
      for (const target of targets) {
        endSession.mutate({ sid: target.sessionId });
      }
      if (targets.length > 0) {
        toast.success("已关闭其它终端", {
          description: `保留 ${shortTerminalTitle(session)}，结束 ${targets.length} 个其它可恢复会话。`,
        });
      }
    },
    [attachableSessions, endSession.mutate],
  );
  const rightSessionsOf = React.useCallback(
    (session: TerminalSessionDescriptor | null) => {
      if (!session) return [];
      const index = attachableSessions.findIndex(
        (candidate) => candidate.sessionId === session.sessionId,
      );
      return index >= 0 ? attachableSessions.slice(index + 1) : [];
    },
    [attachableSessions],
  );

  const handleCloseRightSessions = React.useCallback(
    (session: TerminalSessionDescriptor) => {
      const targets = rightSessionsOf(session);
      for (const target of targets) {
        endSession.mutate({ sid: target.sessionId });
      }
      if (targets.length > 0) {
        toast.success("已关闭右侧终端", {
          description: `保留 ${shortTerminalTitle(session)}，结束右侧 ${targets.length} 个可恢复会话。`,
        });
      }
    },
    [endSession.mutate, rightSessionsOf],
  );

  const handleRenameSession = React.useCallback(
    (session: TerminalSessionDescriptor) => {
      setRenameDialog({
        session,
        title: session.title || shortTerminalTitle(session),
      });
    },
    [],
  );

  const submitRenameSession = React.useCallback(() => {
    if (!renameDialog) return;
    const title = renameDialog.title.trim();
    const currentTitle =
      renameDialog.session.title || renameDialog.session.sessionId;
    if (!title || title === currentTitle) {
      setRenameDialog(null);
      return;
    }
    renameSession.mutate(
      { sessionId: renameDialog.session.sessionId, title },
      {
        onSuccess: () => {
          toast.success("终端会话已重命名", { description: title });
          setRenameDialog(null);
        },
      },
    );
  }, [renameDialog, renameSession]);

  const handleSplitSession = React.useCallback(
    async (session: TerminalSessionDescriptor, direction: "right" | "down") => {
      if (!session.canResume || creating) return;
      setCreating(true);
      const cwd = session.cwd || workspaceDirectory?.absolutePath || null;
      const newId = `ide-split-${direction}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        await createSession.mutateAsync({
          sid: newId,
          targetKind: "local",
          pinned: false,
          cwd,
          handoffContext: {
            fromModule: "workspace-terminal",
            fromRoute: window.location.pathname,
            triggerType: "workspace-terminal-split",
            triggerLabel:
              direction === "right" ? "向右拆分终端" : "向下拆分终端",
            targetEntity: session.sessionId,
            recommendedCommand: "",
            relatedEventId: null,
          },
        });
        await sessionsQuery.refetch();
        setActiveSessionId(newId);
        toast.success(
          direction === "right" ? "已创建右侧拆分终端" : "已创建下方拆分终端",
          { description: cwd || "继承当前 Workspace 目录" },
        );
      } finally {
        setCreating(false);
      }
    },
    [
      createSession.mutateAsync,
      creating,
      sessionsQuery.refetch,
      workspaceDirectory?.absolutePath,
    ],
  );

  const handleMoveSessionToEditor = React.useCallback(
    (session: TerminalSessionDescriptor) => {
      if (!session.canResume) return;
      window.dispatchEvent(
        new CustomEvent("tracevane:workspace-terminal-move-to-editor", {
          detail: {
            sessionId: session.sessionId,
            cwd: session.cwd || workspaceDirectory?.absolutePath || "",
          },
        }),
      );
      toast.info("终端编辑区标签入口已预留", {
        description:
          "后续会接入 Dockview editor group；当前已记录移动意图，避免丢失会话。",
      });
    },
    [workspaceDirectory?.absolutePath],
  );

  const handleClearSession = React.useCallback((sessionId: string) => {
    if (terminalControllerRef.current?.sessionId !== sessionId) {
      setActiveSessionId(sessionId);
      return;
    }
    terminalControllerRef.current.clear();
  }, []);
  const handleCopyOutput = React.useCallback((sessionId: string) => {
    if (terminalControllerRef.current?.sessionId !== sessionId) {
      setActiveSessionId(sessionId);
      toast.info("已切换终端，请再次复制输出");
      return;
    }
    const output = terminalControllerRef.current.getVisibleOutput();
    if (!output.trim()) {
      toast.info("当前终端没有可复制的输出");
      return;
    }
    void navigator.clipboard.writeText(output).then(() => {
      toast.success("已复制终端输出");
    });
  }, []);
  const handleInsertCwd = React.useCallback(
    (sessionId: string, cwd: string) => {
      if (!cwd) {
        toast.info("当前终端没有 cwd");
        return;
      }
      if (terminalControllerRef.current?.sessionId !== sessionId) {
        setActiveSessionId(sessionId);
        toast.info("已切换终端，请再次插入 cwd");
        return;
      }
      terminalControllerRef.current.paste(shellQuotePath(cwd));
    },
    [],
  );

  const copyTerminalAiContext = React.useCallback(
    (session: TerminalSessionDescriptor | null) => {
      if (!session?.sessionId) {
        toast.info("当前没有可复制上下文的终端会话");
        return;
      }
      const controller = terminalControllerRef.current;
      const output =
        controller?.sessionId === session.sessionId
          ? controller.getVisibleOutput()
          : "";
      const context = formatTerminalAiContext(session, output);
      void navigator.clipboard.writeText(context).then(
        () =>
          toast.success("已复制 @terminal 上下文", {
            description: session.cwd || session.sessionId,
          }),
        () =>
          toast.error("复制 @terminal 上下文失败", {
            description: "请检查浏览器剪贴板权限。",
          }),
      );
    },
    [],
  );

  const handleDiagnoseOutput = React.useCallback(
    (session: TerminalSessionDescriptor | null) => {
      if (!session?.sessionId) {
        toast.info("当前没有可诊断的终端会话");
        return;
      }
      if (terminalControllerRef.current?.sessionId !== session.sessionId) {
        setActiveSessionId(session.sessionId);
        toast.info("已切换终端，请再次生成诊断上下文");
        return;
      }
      const output = terminalControllerRef.current.getVisibleOutput();
      if (!output.trim()) {
        toast.info("当前终端没有可诊断输出");
        return;
      }
      const context = formatTerminalDiagnosticContext(session, output);
      void navigator.clipboard.writeText(context).then(
        () =>
          toast.success("已复制终端诊断上下文", {
            description:
              "后续 Gateway AI 可直接使用 @terminal output / cwd / session context。",
          }),
        () =>
          toast.error("复制终端诊断上下文失败", {
            description: "请检查浏览器剪贴板权限。",
          }),
      );
    },
    [],
  );
  const handleTerminalControllerChange = React.useCallback(
    (controller: TerminalController | null) => {
      terminalControllerRef.current = controller;
      setTerminalControllerVersion((version) => version + 1);
    },
    [],
  );

  React.useEffect(() => {
    if (!inputRequest || processedInputRequestRef.current === inputRequest.id)
      return;
    const controller = terminalControllerRef.current;
    if (controller) {
      controller.paste(inputRequest.value);
      processedInputRequestRef.current = inputRequest.id;
      toast.success(inputRequest.label || "已插入到终端", {
        description: "命令已写入当前终端，确认后可执行。",
      });
      return;
    }
    if (!activeSessionId && !creating) {
      void handleCreate();
    }
  }, [
    activeSessionId,
    creating,
    handleCreate,
    inputRequest,
    terminalControllerVersion,
  ]);

  const activeRightSessionCount = rightSessionsOf(activeSession).length;

  const decreaseTerminalFontSize = React.useCallback(
    () => setFontSize((value) => clampTerminalFontSize(value - 1)),
    [],
  );
  const increaseTerminalFontSize = React.useCallback(
    () => setFontSize((value) => clampTerminalFontSize(value + 1)),
    [],
  );
  const resetTerminalFontSize = React.useCallback(
    () => setFontSize(getDefaultTerminalFontSize()),
    [],
  );

  const terminalCommands = React.useMemo(
    () =>
      createTerminalPanelCommands({
        activeSession,
        cwd: activeCwd,
        creating,
        archivedCount: archivedSessions.length,
        fontSize,
        createSession: () => void handleCreate(),
        closeOtherSessions: handleCloseOtherSessions,
        closeRightSessions: handleCloseRightSessions,
        rightSessionCount: activeRightSessionCount,
        renameSession: handleRenameSession,
        splitSession: (session, direction) =>
          void handleSplitSession(session, direction),
        moveSessionToEditor: handleMoveSessionToEditor,
        clearSession: handleClearSession,
        copyOutput: handleCopyOutput,
        copyAiContext: copyTerminalAiContext,
        insertCwd: handleInsertCwd,
        endSession: handleEndSession,
        deleteSession: handleDeleteSession,
        clearArchivedSessions: handleClearArchivedSessions,
        copyCwd: (cwd) => void navigator.clipboard.writeText(cwd),
        decreaseFontSize: decreaseTerminalFontSize,
        increaseFontSize: increaseTerminalFontSize,
        resetFontSize: resetTerminalFontSize,
        maximized,
        browserFullscreen,
        browserFullscreenAvailable,
        toggleMaximize: onToggleMaximize,
        toggleBrowserFullscreen: onToggleBrowserFullscreen,
        openActiveSessionActions: handleOpenSessionActions,
        diagnoseOutput: () => handleDiagnoseOutput(activeSession),
      }),
    [
      activeCwd,
      activeSession,
      archivedSessions.length,
      creating,
      copyTerminalAiContext,
      decreaseTerminalFontSize,
      fontSize,
      handleClearSession,
      handleClearArchivedSessions,
      handleCloseOtherSessions,
      handleCloseRightSessions,
      activeRightSessionCount,
      handleCreate,
      handleDeleteSession,
      handleEndSession,
      handleInsertCwd,
      handleCopyOutput,
      handleOpenSessionActions,
      increaseTerminalFontSize,
      browserFullscreen,
      browserFullscreenAvailable,
      handleDiagnoseOutput,
      handleMoveSessionToEditor,
      handleRenameSession,
      handleSplitSession,
      maximized,
      onToggleBrowserFullscreen,
      onToggleMaximize,
      resetTerminalFontSize,
    ],
  );

  React.useEffect(() => {
    onCommandsChange?.(terminalCommands);
    return () => onCommandsChange?.([]);
  }, [onCommandsChange, terminalCommands]);

  if (sessionsQuery.isLoading) {
    return <LoadingState title="加载终端会话…" />;
  }
  if (sessionsQuery.isError) {
    return (
      <ErrorState
        title="无法加载终端会话"
        description={(sessionsQuery.error as Error)?.message ?? "请稍后重试"}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => sessionsQuery.refetch()}
          >
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]",
        className,
      )}
    >
      <SessionRoster
        sessions={attachableSessions}
        archivedCount={archivedSessions.length}
        activeSessionId={activeSessionId}
        activeSession={activeSession}
        onSelect={setActiveSessionId}
        onCreate={handleCreate}
        onClearSession={handleClearSession}
        onCopyOutput={handleCopyOutput}
        onDiagnoseOutput={handleDiagnoseOutput}
        creating={creating}
        touchActionSurface={touchActionSurface}
        onOpenMenu={(event, session) => {
          event.preventDefault();
          setActiveSessionId(session.sessionId);
          setMenu({ x: event.clientX, y: event.clientY, session });
        }}
        onOpenSessionActions={handleOpenSessionActions}
        onOpenHistory={() => setTerminalHistoryOpen(true)}
      />
      <TerminalHistoryDialog
        open={terminalHistoryOpen}
        sessions={archivedSessions}
        pending={deleteSession.isPending}
        onOpenChange={setTerminalHistoryOpen}
        onDelete={handleDeleteSession}
        onClearAll={handleClearArchivedSessions}
      />
      {menu && touchActionSurface ? (
        <TerminalSessionActionSheet
          session={menu.session}
          workspaceDirectory={workspaceDirectory}
          actions={createTerminalSessionActions({
            session: menu.session,
            cwd: menu.session.cwd || workspaceDirectory?.absolutePath || "",
            createSession: () => void handleCreate(),
            closeOtherSessions: handleCloseOtherSessions,
            closeRightSessions: handleCloseRightSessions,
            rightSessionCount: rightSessionsOf(menu.session).length,
            renameSession: handleRenameSession,
            splitSession: (session, direction) =>
              void handleSplitSession(session, direction),
            moveSessionToEditor: handleMoveSessionToEditor,
            clearSession: handleClearSession,
            copyOutput: handleCopyOutput,
            copyAiContext: copyTerminalAiContext,
            insertCwd: handleInsertCwd,
            endSession: handleEndSession,
            deleteSession: handleDeleteSession,
            copyCwd: (cwd) => void navigator.clipboard.writeText(cwd),
          })}
          onActionComplete={() => setMenu(null)}
          onClose={() => setMenu(null)}
        />
      ) : menu ? (
        <TerminalSessionContextMenu
          x={menu.x}
          y={menu.y}
          session={menu.session}
          workspaceDirectory={workspaceDirectory}
          actions={createTerminalSessionActions({
            session: menu.session,
            cwd: menu.session.cwd || workspaceDirectory?.absolutePath || "",
            createSession: () => void handleCreate(),
            closeOtherSessions: handleCloseOtherSessions,
            closeRightSessions: handleCloseRightSessions,
            rightSessionCount: rightSessionsOf(menu.session).length,
            renameSession: handleRenameSession,
            splitSession: (session, direction) =>
              void handleSplitSession(session, direction),
            moveSessionToEditor: handleMoveSessionToEditor,
            clearSession: handleClearSession,
            copyOutput: handleCopyOutput,
            copyAiContext: copyTerminalAiContext,
            insertCwd: handleInsertCwd,
            endSession: handleEndSession,
            deleteSession: handleDeleteSession,
            copyCwd: (cwd) => void navigator.clipboard.writeText(cwd),
          })}
          onActionComplete={() => setMenu(null)}
        />
      ) : null}

      <TerminalRenameDialog
        value={renameDialog?.title ?? ""}
        sessionId={renameDialog?.session.sessionId ?? ""}
        open={renameDialog !== null}
        pending={renameSession.isPending}
        onChange={(title) =>
          setRenameDialog((state) => (state ? { ...state, title } : state))
        }
        onSubmit={submitRenameSession}
        onClose={() => setRenameDialog(null)}
      />
      <div className="relative min-h-0">
        {activeSessionId ? (
          <>
            <TerminalFontToolbar
              fontSize={fontSize}
              maximized={maximized}
              browserFullscreen={browserFullscreen}
              browserFullscreenAvailable={browserFullscreenAvailable}
              onDecrease={decreaseTerminalFontSize}
              onIncrease={increaseTerminalFontSize}
              onReset={resetTerminalFontSize}
              onToggleMaximize={onToggleMaximize}
              onToggleBrowserFullscreen={onToggleBrowserFullscreen}
              onOpenActions={
                activeSession
                  ? () => handleOpenSessionActions(activeSession)
                  : undefined
              }
            />
            <TerminalView
              sessionId={activeSessionId}
              workspaceDirectory={workspaceDirectory}
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              onControllerChange={handleTerminalControllerChange}
            />
          </>
        ) : (
          <EmptyState
            title="新建终端会话"
            description="打开一个终端会话以在 Workspace 内运行命令。"
            icon={<TerminalSquare />}
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={handleCreate}
                disabled={creating}
              >
                <Plus /> 新建
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

interface SessionRosterProps {
  sessions: TerminalSessionDescriptor[];
  archivedCount: number;
  activeSessionId: string | null;
  activeSession: TerminalSessionDescriptor | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClearSession: (sessionId: string) => void;
  onCopyOutput: (sessionId: string) => void;
  onDiagnoseOutput: (session: TerminalSessionDescriptor | null) => void;
  creating: boolean;
  touchActionSurface: boolean;
  onOpenMenu: (
    event: React.MouseEvent,
    session: TerminalSessionDescriptor,
  ) => void;
  onOpenSessionActions: (session: TerminalSessionDescriptor) => void;
  onOpenHistory: () => void;
}

function SessionRoster({
  sessions,
  archivedCount,
  activeSessionId,
  activeSession,
  onSelect,
  onCreate,
  onClearSession,
  onCopyOutput,
  onDiagnoseOutput,
  creating,
  touchActionSurface,
  onOpenMenu,
  onOpenSessionActions,
  onOpenHistory,
}: SessionRosterProps) {
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressStartRef = React.useRef<{
    x: number;
    y: number;
    sessionId: string;
  } | null>(null);
  const suppressClickRef = React.useRef<string | null>(null);

  const cancelLongPress = React.useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  React.useEffect(() => cancelLongPress, [cancelLongPress]);

  const startTouchLongPress = React.useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      session: TerminalSessionDescriptor,
    ) => {
      if (
        !touchActionSurface ||
        event.pointerType !== "touch" ||
        !session.canResume
      ) {
        return;
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
      cancelLongPress();
      longPressStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        sessionId: session.sessionId,
      };
      longPressTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = session.sessionId;
        onSelect(session.sessionId);
        onOpenSessionActions(session);
        cancelLongPress();
      }, 520);
    },
    [cancelLongPress, onOpenSessionActions, onSelect, touchActionSurface],
  );

  const moveTouchLongPress = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = longPressStartRef.current;
      if (!start || event.pointerType !== "touch") return;
      const distance = Math.hypot(
        event.clientX - start.x,
        event.clientY - start.y,
      );
      if (distance > 10) cancelLongPress();
    },
    [cancelLongPress],
  );

  const compactRoster = sessions.length >= TERMINAL_COMPACT_ROSTER_THRESHOLD;
  const iconOnlyRoster = sessions.length >= TERMINAL_ICON_ONLY_ROSTER_THRESHOLD;

  return (
    <div
      className="flex h-8 items-center gap-1 border-b border-line bg-panel px-2"
      data-terminal-roster-active-only
      data-terminal-roster-compact={compactRoster ? "true" : undefined}
      data-terminal-roster-icon-only={iconOnlyRoster ? "true" : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {sessions.map((s) => {
          const active = activeSessionId === s.sessionId;
          const title = shortTerminalTitle(
            s,
            iconOnlyRoster ? 0 : compactRoster ? 12 : 18,
          );
          return (
            <div
              key={s.sessionId}
              className={cn(
                "flex h-6 min-w-8 shrink overflow-hidden rounded-sm text-2xs text-muted transition-colors hover:bg-panel-2 hover:text-ink",
                iconOnlyRoster
                  ? "max-w-11 basis-9"
                  : compactRoster
                    ? "max-w-28 basis-20"
                    : "max-w-44 basis-32",
                active && "bg-panel-2 text-ink-strong",
              )}
              data-terminal-session-tab
              data-terminal-session-tab-compact={
                compactRoster ? "true" : undefined
              }
              data-terminal-session-tab-icon-only={
                iconOnlyRoster ? "true" : undefined
              }
            >
              <button
                type="button"
                onClick={() => {
                  if (suppressClickRef.current === s.sessionId) {
                    suppressClickRef.current = null;
                    return;
                  }
                  if (s.canResume) onSelect(s.sessionId);
                }}
                onPointerDown={(event) => startTouchLongPress(event, s)}
                onPointerMove={moveTouchLongPress}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onContextMenu={(event) => {
                  if (touchActionSurface) {
                    event.preventDefault();
                    setTimeout(() => onOpenSessionActions(s), 0);
                    return;
                  }
                  onOpenMenu(event, s);
                }}
                disabled={!s.canResume}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1 px-2 whitespace-nowrap",
                  !s.canResume &&
                    "cursor-not-allowed opacity-55 hover:bg-transparent hover:text-muted",
                )}
                title={
                  s.canResume
                    ? s.cwd || s.sessionId
                    : `${s.title || s.sessionId} 已不可恢复`
                }
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    s.canResume ? "bg-emerald" : "bg-muted",
                  )}
                />
                {!iconOnlyRoster ? (
                  <span className="min-w-0 truncate">{title}</span>
                ) : (
                  <span className="sr-only">{title}</span>
                )}
              </button>
              {touchActionSurface || activeSessionId === s.sessionId ? (
                <button
                  type="button"
                  className="grid w-7 shrink-0 place-items-center border-l border-line/70 text-subtle hover:text-ink sm:w-7"
                  aria-label="终端会话操作"
                  title="终端会话操作"
                  onClick={() => onOpenSessionActions(s)}
                  data-workspace-terminal-session-more
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <TerminalQuickActions
        activeSession={activeSession}
        archivedCount={archivedCount}
        creating={creating}
        onCreate={onCreate}
        onClearSession={onClearSession}
        onCopyOutput={onCopyOutput}
        onDiagnoseOutput={onDiagnoseOutput}
        onOpenHistory={onOpenHistory}
      />
    </div>
  );
}

function TerminalQuickActions({
  activeSession,
  archivedCount,
  creating,
  onCreate,
  onClearSession,
  onCopyOutput,
  onDiagnoseOutput,
  onOpenHistory,
}: {
  activeSession: TerminalSessionDescriptor | null;
  archivedCount: number;
  creating: boolean;
  onCreate: () => void;
  onClearSession: (sessionId: string) => void;
  onCopyOutput: (sessionId: string) => void;
  onDiagnoseOutput: (session: TerminalSessionDescriptor | null) => void;
  onOpenHistory: () => void;
}) {
  const canUseActive = Boolean(activeSession?.canResume);
  const activeSessionId = activeSession?.sessionId ?? null;
  return (
    <div
      className="ml-auto flex shrink-0 items-center gap-0.5"
      aria-label="终端快捷操作"
      data-workspace-terminal-quick-actions
    >
      <TerminalQuickActionButton
        label="复制输出"
        disabled={!canUseActive}
        onClick={() => activeSessionId && onCopyOutput(activeSessionId)}
        dataAttr="data-workspace-terminal-quick-copy-output"
      >
        <Clipboard className="size-3.5" />
      </TerminalQuickActionButton>
      <TerminalQuickActionButton
        label="清屏"
        disabled={!canUseActive}
        onClick={() => activeSessionId && onClearSession(activeSessionId)}
        dataAttr="data-workspace-terminal-quick-clear"
      >
        <Eraser className="size-3.5" />
      </TerminalQuickActionButton>
      <TerminalQuickActionButton
        label="AI 诊断"
        disabled={!canUseActive}
        onClick={() => onDiagnoseOutput(activeSession)}
        dataAttr="data-workspace-terminal-quick-ai-diagnose"
      >
        <Sparkles className="size-3.5" />
      </TerminalQuickActionButton>
      {archivedCount > 0 ? (
        <button
          type="button"
          className="rounded-full border border-line bg-panel-2 px-1.5 py-0.5 text-2xs text-subtle hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
          title="管理已结束/不可恢复的终端历史记录"
          onClick={onOpenHistory}
          data-terminal-archived-count
          data-terminal-history-trigger
        >
          历史 {archivedCount}
        </button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        onClick={onCreate}
        disabled={creating}
        className="h-6 px-2 text-2xs"
        data-workspace-terminal-quick-new
      >
        <Plus /> 新建
      </Button>
    </div>
  );
}

function TerminalQuickActionButton({
  label,
  disabled,
  onClick,
  dataAttr,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  dataAttr: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="grid size-6 place-items-center rounded text-subtle outline-none hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-subtle"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      {...{ [dataAttr]: true }}
    >
      {children}
    </button>
  );
}

function TerminalHistoryDialog({
  open,
  sessions,
  pending,
  onOpenChange,
  onDelete,
  onClearAll,
}: {
  open: boolean;
  sessions: TerminalSessionDescriptor[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (sessionId: string) => void;
  onClearAll: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose data-workspace-terminal-history-dialog>
        <DialogHeader>
          <DialogTitle>终端历史记录</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-panel-2 p-4 text-sm text-muted">
              没有已结束或不可恢复的终端记录。
            </div>
          ) : (
            <div
              className="max-h-[min(58dvh,24rem)] overflow-y-auto overscroll-contain pr-1"
              data-workspace-terminal-history-scrollport
            >
              <div className="grid gap-2">
                {sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="grid gap-2 rounded-lg border border-line bg-panel-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    data-workspace-terminal-history-row
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-1.5 shrink-0 rounded-full bg-muted" />
                        <span className="min-w-0 truncate text-sm font-medium text-ink-strong">
                          {shortTerminalTitle(session)}
                        </span>
                        <span className="shrink-0 rounded bg-panel px-1.5 py-0.5 text-[10px] uppercase text-subtle">
                          {session.status}
                        </span>
                      </div>
                      <div
                        className="mt-1 truncate font-mono text-[11px] text-subtle"
                        title={session.cwd || session.sessionId}
                      >
                        {session.cwd || session.sessionId}
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        最近活动：{formatTerminalTime(session.lastActiveAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => onDelete(session.sessionId)}
                      data-workspace-terminal-history-delete
                    >
                      <Trash2 className="size-3.5" /> 删除记录
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            variant="outline"
            disabled={pending || sessions.length === 0}
            onClick={onClearAll}
            data-workspace-terminal-history-clear-all
          >
            清理全部历史
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TerminalRenameDialog({
  open,
  value,
  sessionId,
  pending,
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  value: string;
  sessionId: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent showClose data-workspace-terminal-rename-dialog>
        <DialogHeader>
          <DialogTitle>重命名终端标签</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <label
              className="text-xs font-medium text-muted"
              htmlFor="workspace-terminal-rename-title"
            >
              标签名称
            </label>
            <Input
              id="workspace-terminal-rename-title"
              value={value}
              maxLength={40}
              autoFocus
              placeholder="例如 dev、build、server"
              onChange={(event) => onChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              data-workspace-terminal-rename-input
            />
            <p className="truncate font-mono text-[11px] text-subtle">
              会话：{sessionId || "未选择"}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={pending || value.trim().length === 0}
            data-workspace-terminal-rename-submit
          >
            {pending ? "保存中…" : "保存名称"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TerminalSessionActionSheet({
  session,
  workspaceDirectory,
  actions,
  onActionComplete,
  onClose,
}: {
  session: TerminalSessionDescriptor;
  workspaceDirectory?: WorkspaceTerminalProps["workspaceDirectory"];
  actions: TerminalSessionAction[];
  onActionComplete: () => void;
  onClose: () => void;
}) {
  const cwd = session.cwd || workspaceDirectory?.absolutePath || "";
  return (
    <div className="fixed inset-0 z-[90]" data-workspace-terminal-action-sheet>
      <button
        type="button"
        className="absolute inset-0 bg-black/25"
        aria-label="关闭终端操作面板"
        onClick={onClose}
      />
      <section
        className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line" />
        <div className="flex min-w-0 items-start gap-3 border-b border-line px-4 py-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <TerminalSquare className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">
              触屏终端操作 · {shortTerminalTitle(session)}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-subtle">
              {cwd || session.sessionId}
            </div>
          </div>
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-2xl border border-line bg-panel-2 text-muted"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>
        <div
          className="max-h-[min(70dvh,calc(100dvh-6rem))] overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          tabIndex={0}
          role="group"
          aria-label="终端会话操作列表"
          data-workspace-terminal-action-sheet-scrollport
        >
          <div className="grid gap-3">
            {groupTerminalSheetActions(actions).map((group, groupIndex) => (
              <div
                key={`terminal-sheet-action-group-${groupIndex}`}
                className="grid grid-cols-2 gap-2"
                data-terminal-session-sheet-action-group={groupIndex}
              >
                {group.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={action.disabled}
                    className="min-h-16 rounded-2xl border border-line bg-panel-2 px-3 py-3 text-left text-ink shadow-sm outline-none transition active:scale-[.98] hover:border-primary/30 hover:bg-primary-soft/50 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:text-muted"
                    onClick={() => {
                      action.run();
                      onActionComplete();
                    }}
                    data-terminal-session-sheet-action={action.id}
                    aria-keyshortcuts={action.shortcut}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {action.icon}
                      <span className="min-w-0 truncate">{action.label}</span>
                      {action.shortcut ? (
                        <kbd
                          className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
                          data-terminal-session-sheet-shortcut={action.id}
                        >
                          {action.shortcut}
                        </kbd>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-subtle">
                      {terminalSheetActionHint(action)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function groupTerminalSheetActions(
  actions: TerminalSessionAction[],
): TerminalSessionAction[][] {
  const groups: TerminalSessionAction[][] = [];
  for (const action of actions) {
    if (action.separatorBefore || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push(action);
  }
  return groups.filter((group) => group.length > 0);
}

function terminalSheetActionHint(action: TerminalSessionAction): string {
  if (action.disabled) return "当前会话不可用";
  if (action.id.includes("split")) return "新建同 cwd 会话";
  if (action.id.includes("copy")) return "复制到剪贴板";
  if (action.id.includes("insert")) return "写入当前终端";
  if (action.id.includes("delete")) return "移除历史记录";
  if (action.id.includes("end")) return "停止当前会话";
  return "触屏快捷操作";
}

function shortTerminalTitle(
  session: TerminalSessionDescriptor,
  maxLength = 18,
): string {
  const title = session.title || session.sessionId;
  const normalized = title.replace(/^Terminal\s+/i, "T");
  if (maxLength <= 0) return normalized.slice(0, 1).toUpperCase() || "T";
  if (normalized.length <= maxLength) return normalized;
  const head = Math.max(1, Math.ceil((maxLength - 1) * 0.58));
  const tail = Math.max(1, maxLength - head - 1);
  return `${normalized.slice(0, head)}…${normalized.slice(-tail)}`;
}

function formatTerminalTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value || "未知";
  return new Date(time).toLocaleString();
}

function TerminalSessionContextMenu({
  x,
  y,
  session,
  workspaceDirectory,
  actions,
  onActionComplete,
}: {
  x: number;
  y: number;
  session: TerminalSessionDescriptor;
  workspaceDirectory?: WorkspaceTerminalProps["workspaceDirectory"];
  actions: TerminalSessionAction[];
  onActionComplete: () => void;
}) {
  const cwd = session.cwd || workspaceDirectory?.absolutePath || "";
  return (
    <div
      role="menu"
      className="fixed z-50 max-h-[min(80vh,28rem)] min-w-52 overflow-y-auto rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={clampFloatingTerminalMenuPosition(x, y, 240, 392)}
      data-workspace-terminal-session-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <React.Fragment key={action.id}>
          {action.separatorBefore ? (
            <div className="my-1 h-px bg-line" />
          ) : null}
          <TerminalMenuButton
            action={action}
            onClick={() => {
              action.run();
              onActionComplete();
            }}
          />
        </React.Fragment>
      ))}
      <div
        className="max-w-64 truncate px-2 py-1 font-mono text-2xs text-subtle"
        title={cwd || session.sessionId}
      >
        {cwd || session.sessionId}
      </div>
    </div>
  );
}

function clampFloatingTerminalMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): React.CSSProperties {
  if (typeof window === "undefined") return { left: x, top: y };
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}

function TerminalMenuButton({
  action,
  onClick,
}: {
  action: TerminalSessionAction;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.disabled}
      onClick={onClick}
      data-terminal-session-action={action.id}
      aria-keyshortcuts={action.shortcut}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:text-muted"
    >
      {action.icon}
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {action.shortcut ? (
        <kbd
          className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
          data-terminal-session-action-shortcut={action.id}
        >
          {action.shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function TerminalFontToolbar({
  fontSize,
  maximized,
  browserFullscreen,
  browserFullscreenAvailable,
  onDecrease,
  onIncrease,
  onReset,
  onToggleMaximize,
  onToggleBrowserFullscreen,
  onOpenActions,
}: {
  fontSize: number;
  maximized: boolean;
  browserFullscreen: boolean;
  browserFullscreenAvailable: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset: () => void;
  onToggleMaximize?: () => void;
  onToggleBrowserFullscreen?: () => void;
  onOpenActions?: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(() =>
    loadTerminalFloatingCollapsed(),
  );
  const setFloatingCollapsed = React.useCallback((next: boolean) => {
    setCollapsed(next);
    saveTerminalFloatingCollapsed(next);
  }, []);
  if (collapsed) {
    return (
      <button
        type="button"
        className="absolute right-0 top-2 z-20 flex h-9 items-center gap-1 rounded-l-full border border-r-0 border-white/10 bg-black/55 px-2 text-xs font-medium text-white/80 shadow-lg backdrop-blur outline-none hover:bg-white/10 focus-visible:shadow-[var(--ring)]"
        onClick={() => setFloatingCollapsed(false)}
        aria-label="展开终端悬浮菜单"
        title="展开终端悬浮菜单"
        data-workspace-terminal-font-toolbar
        data-workspace-terminal-floating-collapsed="true"
        data-workspace-terminal-floating-edge-toggle="collapsed"
      >
        <ChevronLeft className="size-3.5" />
        终端
      </button>
    );
  }
  return (
    <div
      className="absolute right-0 top-2 z-20 flex items-center gap-1 rounded-l-full border border-r-0 border-white/10 bg-black/55 p-1 text-xs text-white/70 shadow-lg backdrop-blur"
      data-workspace-terminal-font-toolbar
      data-workspace-terminal-floating-collapsed="false"
    >
      <button
        type="button"
        className="grid size-7 place-items-center rounded hover:bg-white/10"
        onClick={() => setFloatingCollapsed(true)}
        aria-label="收起终端悬浮菜单"
        title="收起到右侧边缘"
        data-workspace-terminal-floating-edge-toggle="expanded"
      >
        <ChevronLeft className="size-3.5 rotate-180" />
      </button>
      <button
        type="button"
        className="grid size-7 place-items-center rounded hover:bg-white/10"
        onClick={onDecrease}
        aria-label="缩小终端字体"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-8 text-center" data-workspace-terminal-font-size>
        {fontSize}px
      </span>
      <button
        type="button"
        className="grid size-7 place-items-center rounded hover:bg-white/10"
        onClick={onIncrease}
        aria-label="放大终端字体"
      >
        <Plus className="size-3.5" />
      </button>
      <button
        type="button"
        className="grid size-7 place-items-center rounded hover:bg-white/10"
        onClick={onReset}
        aria-label="重置终端字体"
      >
        <RotateCcw className="size-3.5" />
      </button>
      <button
        type="button"
        className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-40"
        onClick={onOpenActions}
        disabled={!onOpenActions}
        aria-label="打开终端会话操作菜单"
        title="终端会话操作"
        data-workspace-terminal-floating-actions
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-white/15" />
      <button
        type="button"
        className={cn(
          "grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-40",
          maximized && "bg-white/15 text-white",
        )}
        onClick={onToggleMaximize}
        disabled={!onToggleMaximize}
        aria-label={maximized ? "恢复终端界面全屏" : "终端界面全屏"}
        title={maximized ? "恢复终端界面全屏" : "终端界面全屏"}
        data-workspace-terminal-interface-fullscreen
      >
        {maximized ? (
          <Minimize2 className="size-3.5" />
        ) : (
          <Expand className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        className={cn(
          "grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-40",
          browserFullscreen && "bg-white/15 text-white",
        )}
        onClick={onToggleBrowserFullscreen}
        disabled={!browserFullscreenAvailable || !onToggleBrowserFullscreen}
        aria-label={browserFullscreen ? "退出终端真实全屏" : "终端真实全屏"}
        title={
          browserFullscreenAvailable
            ? browserFullscreen
              ? "退出浏览器真实全屏"
              : "终端浏览器真实全屏"
            : "当前浏览器不支持真实全屏"
        }
        data-workspace-terminal-browser-fullscreen
      >
        {browserFullscreen ? (
          <Minimize2 className="size-3.5" />
        ) : (
          <Expand className="size-3.5" />
        )}
      </button>
    </div>
  );
}

/**
 * Renders a single xterm.js Terminal for the given session. The terminal is
 * created on mount (per sessionId) and disposed on unmount/session switch.
 */
function TerminalView({
  sessionId,
  workspaceDirectory,
  fontSize,
  onFontSizeChange,
  onControllerChange,
}: {
  sessionId: string;
  workspaceDirectory?: WorkspaceTerminalProps["workspaceDirectory"];
  fontSize: number;
  onFontSizeChange?: React.Dispatch<React.SetStateAction<number>>;
  onControllerChange?: (controller: TerminalController | null) => void;
}) {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<XtermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const lastSeqRef = React.useRef<number>(0);
  // True once the backend `session` event arrives, signalling the PTY is
  // attached to this stream. Resize/input before attach return HTTP 400, so
  // we gate all `/resize` + `/input` POSTs on this flag.
  const attachedRef = React.useRef(false);
  const pinchPointersRef = React.useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const pinchStartRef = React.useRef<{
    distance: number;
    fontSize: number;
  } | null>(null);
  const touchScrollRef = React.useRef<{ pointerId: number; y: number } | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const keyboardInset = useVisualViewportKeyboardInset(surfaceRef, {
    includeViewportOverlayInset: true,
    requireFocusedTarget: false,
  });

  // Create the terminal + attach input/resize/stream. Re-runs only on session
  // change; everything is disposed in cleanup.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setError(null);
    lastSeqRef.current = 0;
    attachedRef.current = false;

    const term = new XtermTerminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available — fall back to canvas renderer silently.
    }
    term.open(container);
    try {
      fit.fit();
    } catch {
      // Container may not be laid out yet; ResizeObserver will retry.
    }

    termRef.current = term;
    fitRef.current = fit;
    onControllerChange?.({
      sessionId,
      clear: () => term.clear(),
      getVisibleOutput: () => getTerminalVisibleOutput(term),
      paste: (value: string) => term.paste(value),
    });

    // NOTE: no initial resize here — the PTY isn't attached to this stream
    // yet and `/resize` would 400. We wait for the `session` attach event
    // (handled in the stream loop below) before sending any dimensions.

    // Input: forward keystrokes to the backend PTY. Guard on `attached` so we
    // don't write into a session whose PTY isn't attached to this stream.
    const inputDisposable = term.onData((data) => {
      if (!attachedRef.current) return;
      sendInput(sessionId, data);
    });

    // Resize: observe container size changes. Guard on `attached` so we don't
    // hit `/resize` before the stream's PTY is attached (the previous race
    // produced 3× HTTP 400 per Workspace load).
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
      if (!attachedRef.current) return;
      const d = safeProposeDimensions(fit);
      if (d) {
        sendResize(sessionId, d.cols, d.rows);
      }
    });
    resizeObserver.observe(container);

    // Output: consume the SSE stream.
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${STREAM_BASE}/${encodeURIComponent(sessionId)}/stream?resume=1&lastSeq=${lastSeqRef.current}`,
          {
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
          },
        );
        if (!response.ok || !response.body) {
          if (!cancelled) {
            setError(`终端流连接失败 (${response.status})`);
          }
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by blank lines. We only care about
          // `event: terminal` data lines (the backend also sends `ping`).
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const evt = parseSseFrame(frame);
            if (!evt) continue;
            handleStreamEvent(evt, term, lastSeqRef, () => {
              // First `session` event = PTY attached to this stream. Flip the
              // guard and send the initial dimensions so the PTY starts with
              // correct cols/rows right after attach.
              if (attachedRef.current) return;
              attachedRef.current = true;
              const d = safeProposeDimensions(fit);
              if (d) {
                sendResize(sessionId, d.cols, d.rows);
              }
            });
          }
        }
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== "AbortError") {
          // Best-effort: surface a non-fatal message; user can reopen.
          term.write(`\r\n\x1b[33m[stream disconnected]\x1b[0m\r\n`);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      onControllerChange?.(null);
    };
  }, [onControllerChange, sessionId]);

  React.useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    window.requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {}
    });
  }, [fontSize]);

  React.useEffect(() => {
    refitTerminalForViewportChange(
      fitRef.current,
      termRef.current,
      containerRef.current,
      keyboardInset,
    );
  }, [keyboardInset]);

  // Reconnect on window focus (best-effort).
  React.useEffect(() => {
    const onFocus = () => {
      // The main effect owns the stream; a focus-driven reconnect would need
      // a ref to the fetch loop. For now we rely on the session-keyed effect
      // plus the user reselecting the tab if the stream dropped.
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const insertDroppedTerminalPayload = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const transfer = event.dataTransfer;
      const explicitPath =
        transfer.getData("application/x-tracevane-file-absolute-path") ||
        transfer.getData("text/plain");
      const payloads: string[] = [];
      if (explicitPath.trim()) payloads.push(explicitPath.trim());
      for (const file of Array.from(transfer.files ?? [])) {
        payloads.push(shellQuotePath(file.name));
      }
      const data = payloads.filter(Boolean).join(" ");
      if (!data) return;
      // xterm paste flows through onData; sending manually would duplicate the dropped path.
      termRef.current?.paste(data);
    },
    [sessionId],
  );

  return (
    <div
      ref={surfaceRef}
      className="relative grid h-full min-h-0 grid-rows-[minmax(0,var(--workspace-terminal-visual-height,1fr))_auto]"
      onPointerDownCapture={(event) => {
        if (event.pointerType !== "touch") return;
        pinchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (pinchPointersRef.current.size === 1) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          touchScrollRef.current = {
            pointerId: event.pointerId,
            y: event.clientY,
          };
        }
        if (pinchPointersRef.current.size === 2) {
          touchScrollRef.current = null;
          const distance = distanceBetweenTouchPointers(
            pinchPointersRef.current,
          );
          if (distance) {
            pinchStartRef.current = { distance, fontSize };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }
        }
      }}
      onPointerMoveCapture={(event) => {
        if (event.pointerType !== "touch") return;
        if (!pinchPointersRef.current.has(event.pointerId)) return;
        pinchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const start = pinchStartRef.current;
        if (!start || pinchPointersRef.current.size < 2) {
          const scroll = touchScrollRef.current;
          if (scroll?.pointerId !== event.pointerId) return;
          const delta = event.clientY - scroll.y;
          const magnitude = Math.abs(delta);
          if (magnitude < TERMINAL_TOUCH_SCROLL_PX_PER_LINE) return;
          event.preventDefault();
          const lines = clampTerminalTouchScrollLines(
            Math.round(magnitude / TERMINAL_TOUCH_SCROLL_PX_PER_LINE),
          );
          termRef.current?.scrollLines(delta > 0 ? -lines : lines);
          touchScrollRef.current = {
            pointerId: event.pointerId,
            y: event.clientY,
          };
          return;
        }
        const distance = distanceBetweenTouchPointers(pinchPointersRef.current);
        if (!distance) return;
        event.preventDefault();
        const next = clampTerminalFontSize(
          Math.round(start.fontSize * (distance / start.distance)),
        );
        onFontSizeChange?.(next);
      }}
      onPointerUpCapture={(event) => {
        pinchPointersRef.current.delete(event.pointerId);
        if (touchScrollRef.current?.pointerId === event.pointerId) {
          touchScrollRef.current = null;
        }
        if (pinchPointersRef.current.size < 2) pinchStartRef.current = null;
      }}
      onPointerCancelCapture={(event) => {
        pinchPointersRef.current.delete(event.pointerId);
        if (touchScrollRef.current?.pointerId === event.pointerId) {
          touchScrollRef.current = null;
        }
        if (pinchPointersRef.current.size < 2) pinchStartRef.current = null;
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={insertDroppedTerminalPayload}
      data-workspace-terminal-drop-target
      data-workspace-terminal-pinch-zoom
      data-workspace-terminal-touch-scroll
      data-workspace-terminal-touch-scroll-capture
      data-workspace-terminal-keyboard-inset={
        keyboardInset > 0 ? "true" : "false"
      }
      data-workspace-terminal-keyboard-surface="outer"
      data-workspace-terminal-cwd={workspaceDirectory?.absolutePath ?? ""}
      style={
        {
          touchAction: "none",
          boxSizing: "border-box",
          "--workspace-terminal-visual-height": keyboardInset
            ? `calc(100% - ${keyboardInset}px)`
            : "1fr",
        } as React.CSSProperties
      }
    >
      <div
        ref={containerRef}
        className="min-h-0 overflow-hidden p-1"
        style={{
          height: "100%",
          minHeight: 0,
        }}
      />
      <div
        aria-hidden
        data-workspace-terminal-keyboard-spacer
        style={{ height: keyboardInset || 0 }}
      />
      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-sm border border-red-line bg-red-soft px-2 py-1 text-2xs text-red">
            {error}
            <button
              type="button"
              className="text-red/70 hover:text-red"
              onClick={() => setError(null)}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stream parsing / transport helpers
// ---------------------------------------------------------------------------

function getDefaultTerminalFontSize(): number {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 768px)").matches
  ) {
    return 11;
  }
  return 13;
}

function loadTerminalFloatingCollapsed(): boolean {
  try {
    return (
      window.localStorage.getItem(TERMINAL_FLOATING_COLLAPSED_STORAGE_KEY) ===
      "true"
    );
  } catch {
    return false;
  }
}

function saveTerminalFloatingCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      TERMINAL_FLOATING_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  } catch {
    // Floating toolbar collapsed state is convenience-only.
  }
}

function loadTerminalFontSize(): number {
  const fallback = getDefaultTerminalFontSize();
  try {
    const raw = window.localStorage.getItem(TERMINAL_FONT_SIZE_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) ? clampTerminalFontSize(parsed) : fallback;
  } catch {
    return fallback;
  }
}

function saveTerminalFontSize(value: number): void {
  try {
    window.localStorage.setItem(
      TERMINAL_FONT_SIZE_STORAGE_KEY,
      String(clampTerminalFontSize(value)),
    );
  } catch {}
}

function clampTerminalTouchScrollLines(value: number): number {
  return Math.min(
    TERMINAL_TOUCH_SCROLL_MAX_LINES,
    Math.max(TERMINAL_TOUCH_SCROLL_MIN_LINES, value),
  );
}

function clampTerminalFontSize(value: number): number {
  return Math.min(18, Math.max(9, value));
}

function useTerminalTouchActionSurface(): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(pointer: coarse), (max-width: 768px)");
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return matches;
}

function distanceBetweenTouchPointers(
  pointers: Map<number, { x: number; y: number }>,
): number | null {
  const [first, second] = Array.from(pointers.values());
  if (!first || !second) return null;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function shellQuotePath(path: string): string {
  return `'${path.replace(/'/g, `'\''`)}'`;
}

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (eventName !== "terminal" || dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as StreamEvent;
  } catch {
    return null;
  }
}

function handleStreamEvent(
  evt: StreamEvent,
  term: XtermTerminal,
  lastSeqRef: React.RefObject<number>,
  onAttach?: () => void,
): void {
  // The `session` event is the first frame the backend emits on stream attach
  // (service `buildAttachEvents` always pushes `{ type: "session" }` ahead of
  // any reset/output replay). Treat it as the attach signal.
  if (evt.type === "session") {
    onAttach?.();
    return;
  }
  if (evt.type === "output") {
    const out = evt as { data?: string; seq?: number };
    if (typeof out.data === "string") {
      term.write(out.data);
    }
    if (typeof out.seq === "number" && out.seq > lastSeqRef.current) {
      lastSeqRef.current = out.seq;
    }
    return;
  }
  if (evt.type === "reset") {
    term.reset();
    return;
  }
  if (evt.type === "clear") {
    term.clear();
    return;
  }
  if (evt.type === "closed") {
    term.write(`\r\n\x1b[90m[session closed]\x1b[0m\r\n`);
    return;
  }
  if (evt.type === "error") {
    const msg = (evt as { message?: string }).message ?? "unknown";
    term.write(`\r\n\x1b[31m[error: ${msg}]\x1b[0m\r\n`);
  }
}

function safeProposeDimensions(
  fit: FitAddon,
): { cols: number; rows: number } | null {
  try {
    const d = fit.proposeDimensions();
    if (d && d.cols > 0 && d.rows > 0) {
      return { cols: d.cols, rows: d.rows };
    }
  } catch {}
  return null;
}

function refitTerminalForViewportChange(
  fit: FitAddon | null,
  term: XtermTerminal | null,
  container: HTMLElement | null,
  keyboardInset: number,
): void {
  const helperTextarea = () =>
    container?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
  const fitAndRevealCursor = () => {
    try {
      fit?.fit();
      if (keyboardInset > 0) {
        term?.scrollToBottom();
        helperTextarea()?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    } catch {
      // xterm fit can race layout commits during mobile keyboard animation.
    }
  };

  fitAndRevealCursor();
  window.requestAnimationFrame(() => {
    fitAndRevealCursor();
    window.requestAnimationFrame(fitAndRevealCursor);
  });
  if (keyboardInset > 0) {
    window.setTimeout(fitAndRevealCursor, 80);
    window.setTimeout(fitAndRevealCursor, 220);
  }
}

function sendInput(sessionId: string, data: string): void {
  apiRequest(`${STREAM_BASE}/${encodeURIComponent(sessionId)}/input`, {
    method: "POST",
    body: JSON.stringify({ data }),
  }).catch(() => {
    // Best-effort; dropped keystrokes are tolerable for now.
  });
}

function sendResize(sessionId: string, cols: number, rows: number): void {
  apiRequest(`${STREAM_BASE}/${encodeURIComponent(sessionId)}/resize`, {
    method: "POST",
    body: JSON.stringify({ cols, rows }),
  }).catch(() => {
    // Best-effort.
  });
}

function formatTerminalAiContext(
  session: TerminalSessionDescriptor,
  output: string,
): string {
  const cwd = session.cwd || "";
  const title = session.title || shortTerminalTitle(session);
  return [
    "@terminal",
    `session: ${session.sessionId}`,
    `title: ${title}`,
    cwd ? `cwd: ${cwd}` : "cwd: (unknown)",
    `status: ${session.status}`,
    output.trim() ? "" : "visibleOutput: (empty or inactive session)",
    output.trim() ? "## Visible output" : "",
    output.trim() ? "" : "",
    output.trim() ? "```text" : "",
    output.trim() ? output.trimEnd() : "",
    output.trim() ? "```" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatTerminalDiagnosticContext(
  session: TerminalSessionDescriptor,
  output: string,
): string {
  const cwd = session.cwd || "";
  const title = session.title || shortTerminalTitle(session);
  return [
    "# Tracevane Terminal Diagnostic Context",
    "",
    `session: ${session.sessionId}`,
    `title: ${title}`,
    cwd ? `cwd: ${cwd}` : "cwd: (unknown)",
    `status: ${session.status}`,
    "",
    "## Visible output",
    "",
    "```text",
    output.trimEnd(),
    "```",
    "",
    "## Request",
    "",
    "请基于终端可见输出诊断错误原因，给出最小修复步骤、需要补充的命令和风险提示。",
  ].join("\n");
}

function getTerminalVisibleOutput(term: XtermTerminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index)?.translateToString(true) ?? "";
    lines.push(line);
  }
  return lines.join("\n").trimEnd();
}
