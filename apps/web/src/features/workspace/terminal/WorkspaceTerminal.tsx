import * as React from "react";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Plus, TerminalSquare, X } from "lucide-react";

import "@xterm/xterm/css/xterm.css";

import { apiRequest } from "@/lib/api/client";
import {
  useCreateTerminalSessionMutation,
  useDeleteTerminalSessionMutation,
  useEndTerminalSessionMutation,
  useTerminalSessionsQuery,
} from "@/lib/query/terminal";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { cn } from "@/design/lib/utils";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import type { TerminalSessionDescriptor } from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";

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

type StreamEvent =
  | { type: "session"; sid: string; instanceId: string; outputSeq: number }
  | { type: "output"; sid: string; seq: number; data: string }
  | { type: "reset"; sid: string; instanceId: string; reason?: string }
  | { type: "clear"; sid: string }
  | { type: "closed"; sid: string; reason?: string }
  | { type: "error"; message?: string }
  | { type: string; sid?: string };

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
}

export function WorkspaceTerminal({
  className,
  workspaceDirectory,
  onCommandsChange,
}: WorkspaceTerminalProps) {
  const sessionsQuery = useTerminalSessionsQuery();
  const sessions = sessionsQuery.data?.sessions ?? [];
  const attachableSessions = React.useMemo(
    () => sessions.filter((session) => session.canResume),
    [sessions],
  );
  const createSession = useCreateTerminalSessionMutation();
  const endSession = useEndTerminalSessionMutation();
  const deleteSession = useDeleteTerminalSessionMutation();
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    session: TerminalSessionDescriptor;
  } | null>(null);

  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );

  // Pick the first attachable session once loaded, if none chosen. Persisted
  // completed/lost sessions are evidence only; attaching them produces the raw
  // backend `terminal_session_not_found` error the user saw.
  React.useEffect(() => {
    if (activeSessionId || attachableSessions.length === 0) return;
    setActiveSessionId(attachableSessions[0].sessionId);
  }, [attachableSessions, activeSessionId]);

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
      deleteSession.mutate(sessionId, {
        onSuccess: () => {
          if (activeSessionId === sessionId) setActiveSessionId(null);
        },
      });
    },
    [activeSessionId, deleteSession.mutate],
  );

  const terminalCommands = React.useMemo(
    () =>
      createTerminalPanelCommands({
        activeSession,
        cwd: activeCwd,
        creating,
        createSession: () => void handleCreate(),
        endSession: handleEndSession,
        deleteSession: handleDeleteSession,
        copyCwd: (cwd) => void navigator.clipboard.writeText(cwd),
        diagnoseOutput: () =>
          toast.info("AI 终端诊断入口已预留", {
            description:
              "后续会接入 Tracevane Gateway 的 @terminal output / cwd / session context。",
          }),
      }),
    [
      activeCwd,
      activeSession,
      creating,
      handleCreate,
      handleDeleteSession,
      handleEndSession,
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
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={handleCreate}
        creating={creating}
        onOpenMenu={(event, session) => {
          event.preventDefault();
          setActiveSessionId(session.sessionId);
          setMenu({ x: event.clientX, y: event.clientY, session });
        }}
      />
      {menu ? (
        <TerminalSessionContextMenu
          x={menu.x}
          y={menu.y}
          session={menu.session}
          workspaceDirectory={workspaceDirectory}
          actions={createTerminalSessionActions({
            session: menu.session,
            cwd: menu.session.cwd || workspaceDirectory?.absolutePath || "",
            createSession: () => void handleCreate(),
            endSession: handleEndSession,
            deleteSession: handleDeleteSession,
            copyCwd: (cwd) => void navigator.clipboard.writeText(cwd),
          })}
          onActionComplete={() => setMenu(null)}
        />
      ) : null}
      <div className="min-h-0">
        {activeSessionId ? (
          <TerminalView
            sessionId={activeSessionId}
            workspaceDirectory={workspaceDirectory}
          />
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
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  creating: boolean;
  onOpenMenu: (
    event: React.MouseEvent,
    session: TerminalSessionDescriptor,
  ) => void;
}

function SessionRoster({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  creating,
  onOpenMenu,
}: SessionRosterProps) {
  return (
    <div className="flex h-8 items-center gap-1 border-b border-line bg-panel px-2">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {sessions.map((s) => (
          <button
            key={s.sessionId}
            type="button"
            onClick={() => {
              if (s.canResume) onSelect(s.sessionId);
            }}
            onContextMenu={(event) => onOpenMenu(event, s)}
            disabled={!s.canResume}
            className={cn(
              "flex h-6 items-center gap-1 rounded-sm px-2 text-2xs whitespace-nowrap text-muted transition-colors hover:bg-panel-2 hover:text-ink",
              activeSessionId === s.sessionId && "bg-panel-2 text-ink-strong",
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
            {s.title || s.sessionId.slice(0, 8)}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onCreate}
        disabled={creating}
        className="ml-auto h-6 px-2 text-2xs"
      >
        <Plus /> 新建
      </Button>
    </div>
  );
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
      className="fixed z-50 min-w-52 rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={{ left: x, top: y }}
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
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:text-muted"
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
}

/**
 * Renders a single xterm.js Terminal for the given session. The terminal is
 * created on mount (per sessionId) and disposed on unmount/session switch.
 */
function TerminalView({
  sessionId,
  workspaceDirectory,
}: {
  sessionId: string;
  workspaceDirectory?: WorkspaceTerminalProps["workspaceDirectory"];
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<XtermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const lastSeqRef = React.useRef<number>(0);
  // True once the backend `session` event arrives, signalling the PTY is
  // attached to this stream. Resize/input before attach return HTTP 400, so
  // we gate all `/resize` + `/input` POSTs on this flag.
  const attachedRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

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
      fontSize: 13,
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
    };
  }, [sessionId]);

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
      className="relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)]"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={insertDroppedTerminalPayload}
      data-workspace-terminal-drop-target
      data-workspace-terminal-cwd={workspaceDirectory?.absolutePath ?? ""}
    >
      <div ref={containerRef} className="min-h-0 overflow-hidden p-1" />
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
