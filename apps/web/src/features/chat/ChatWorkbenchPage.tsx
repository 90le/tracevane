import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Bot,
  FolderOpen,
  Menu,
  MessagesSquare,
  RefreshCw,
  Send,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Sheet, SheetContent } from "@/design/ui/sheet";
import { toast } from "@/design/ui/sonner";
import { ToneBadge } from "@/features/cli-agents/views/_shared";

import {
  useAbortChatSessionMutation,
  useChatBootstrapQuery,
  useChatStream,
  useResolveChatPermissionMutation,
  useSendChatMessageMutation,
  useUploadChatFileMutation,
} from "@/lib/query/chat";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@/lib/query/chat";

import {
  ConversationView,
  RuntimeInspectorView,
  SessionListView,
} from "./views";
import type {
  ChatMessageItem,
  ChatSendRequest,
  ChatStreamEvent,
  ChatPermissionRequestCard,
  ChatToolCard,
  LiveAssistantTurn,
} from "./types";
import {
  runStateTone,
  runtimeAgentLabel,
  sessionSourceLabel,
  sessionSourceDetail,
  sessionTitle,
  shouldShowRunState,
} from "./_shared";


function decodeSessionRef(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw?.startsWith("r1_")) return null;
  try {
    const base64Url = raw.slice(3);
    const padded = `${base64Url}${"=".repeat((4 - (base64Url.length % 4)) % 4)}`
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes) || null;
  } catch {
    return null;
  }
}

const EMPTY_TURN: LiveAssistantTurn = {
  runId: null,
  text: "",
  toolCards: [],
  permissions: [],
  done: false,
  error: null,
  aborted: false,
  finalMessage: null,
};


function isTerminalRuntimeState(state: string | null | undefined): boolean {
  return state === "completed" || state === "aborted" || state === "error";
}

/**
 * Chat Agent Operations Workbench (`/chat`).
 *
 * Layout: Domain Console prototype. A single primary stage owns the selected
 * Agent conversation; the session index is a bounded stage section and runtime
 * details open only on demand in a drawer. This intentionally avoids the old permanent
 * left-list / center-chat / right-inspector three-column admin shell.
 *
 * Data: the bootstrap query owns the roster + the selected session's read
 * snapshot (history, queue, diagnostics). Sending a message POSTs
 * `/send`; a live SSE subscription (`useChatStream`) renders the streaming
 * assistant turn (text + tool calls) as events arrive. On a terminal stream
 * event (`final` / `aborted` / `error`) we refetch the authoritative bootstrap
 * and clear the transient live turn — the stream is never the source of truth.
 */
export function ChatWorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const sessionParam = searchParams.get("session") ?? decodeSessionRef(searchParams.get("sessionRef"));
  const [listOpen, setListOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  const bootstrap = useChatBootstrapQuery({ sessionKey: sessionParam });

  const sessions = bootstrap.data?.sessions ?? [];
  const preferredSession = React.useMemo(
    () =>
      sessions.find(
        (s) => s.permissions?.canSend && !s.presentation?.archived,
      ) ??
      sessions.find(
        (s) =>
          s.runtime?.state &&
          s.runtime.state !== "unknown" &&
          !s.presentation?.archived,
      ) ??
      sessions.find((s) => !s.presentation?.archived) ??
      sessions[0] ??
      null,
    [sessions],
  );
  const selectedKey =
    sessionParam ??
    bootstrap.data?.selectedSessionKey ??
    preferredSession?.key ??
    null;

  const history = bootstrap.data?.history ?? null;
  const selectedSession =
    sessions.find((s) => s.key === selectedKey) ?? history?.session ?? null;
  const runtime = history?.runtime ?? selectedSession?.runtime ?? null;
  const permissions = selectedSession?.permissions ?? null;
  const diagnostics =
    history?.diagnostics ?? bootstrap.data?.diagnostics ?? null;
  const observability = history?.observability ?? null;
  const overlays = history?.overlays ?? [];
  const historyMessages: ChatMessageItem[] = history?.messages ?? [];
  const queueItems = bootstrap.data?.queue?.items ?? [];

  // --- Live streaming state -------------------------------------------------
  const [liveTurn, setLiveTurn] = React.useState<LiveAssistantTurn | null>(
    null,
  );
  // We only open the SSE stream while a send is in-flight / streaming.
  const [streamEnabled, setStreamEnabled] = React.useState(false);
  const activeRunIdRef = React.useRef<string | null>(null);

  const sendMutation = useSendChatMessageMutation();
  const uploadMutation = useUploadChatFileMutation();
  const abortMutation = useAbortChatSessionMutation();
  const resolvePermissionMutation = useResolveChatPermissionMutation();

  const refetchSelected = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: chatKeys.bootstrap(selectedKey),
    });
    void bootstrap.refetch();
  }, [queryClient, selectedKey, bootstrap]);

  // Reset live state when switching sessions.
  React.useEffect(() => {
    setLiveTurn(null);
    setStreamEnabled(false);
    activeRunIdRef.current = null;
  }, [selectedKey]);

  const handleStreamEvent = React.useCallback(
    (event: ChatStreamEvent) => {
      // Scope to the run we started; ignore unrelated chatter.
      const runId = "runId" in event ? event.runId : null;
      const activeRun = activeRunIdRef.current;

      switch (event.kind) {
        case "ack": {
          if (activeRun && runId && runId !== activeRun) return;
          if (isTerminalRuntimeState(event.runtime.state)) {
            setLiveTurn((prev) => ({
              ...(prev ?? EMPTY_TURN),
              runId: runId ?? prev?.runId ?? null,
              done: true,
              aborted: event.runtime.state === "aborted",
              error: event.runtime.state === "error" ? event.runtime.lastErrorMessage || "Agent 运行失败" : null,
            }));
            setStreamEnabled(false);
            activeRunIdRef.current = null;
            refetchSelected();
            window.setTimeout(() => setLiveTurn(null), 400);
          }
          break;
        }
        case "runtime":
        case "runtime.state": {
          if (activeRun && runId && runId !== activeRun) return;
          if (isTerminalRuntimeState(event.runtime.state)) {
            setLiveTurn((prev) => ({
              ...(prev ?? EMPTY_TURN),
              runId: runId ?? prev?.runId ?? null,
              done: true,
              aborted: event.runtime.state === "aborted",
              error: event.runtime.state === "error" ? event.runtime.lastErrorMessage || "Agent 运行失败" : null,
            }));
            setStreamEnabled(false);
            activeRunIdRef.current = null;
            refetchSelected();
            window.setTimeout(() => setLiveTurn(null), 400);
          }
          break;
        }
        case "delta":
        case "temporary.assistant": {
          if (activeRun && runId && runId !== activeRun) return;
          const accumulated = event.accumulatedText;
          setLiveTurn((prev) => ({
            ...(prev ?? EMPTY_TURN),
            runId: runId ?? prev?.runId ?? null,
            text: accumulated,
          }));
          break;
        }
        case "agent_assistant": {
          if (activeRun && runId && runId !== activeRun) return;
          setLiveTurn((prev) => ({
            ...(prev ?? EMPTY_TURN),
            runId: runId ?? prev?.runId ?? null,
            text: event.text,
          }));
          break;
        }

        case "agent_permission": {
          if (activeRun && runId && runId !== activeRun) return;
          const permission = event.permission as ChatPermissionRequestCard;
          setLiveTurn((prev) => {
            const base = prev ?? EMPTY_TURN;
            const existing = base.permissions.findIndex((item) => item.requestId === permission.requestId);
            const permissions = existing >= 0
              ? base.permissions.map((item, index) => (index === existing ? permission : item))
              : [...base.permissions, permission];
            return { ...base, runId: runId ?? base.runId, permissions };
          });
          break;
        }
        case "temporary.tool":
        case "agent_tool_call":
        case "agent_tool_result": {
          if (activeRun && runId && runId !== activeRun) return;
          const tool = event.tool as ChatToolCard;
          setLiveTurn((prev) => {
            const base = prev ?? EMPTY_TURN;
            const existing = base.toolCards.findIndex(
              (t) => t.toolCallId === tool.toolCallId,
            );
            const toolCards =
              existing >= 0
                ? base.toolCards.map((t, i) => (i === existing ? tool : t))
                : [...base.toolCards, tool];
            return { ...base, runId: runId ?? base.runId, toolCards };
          });
          break;
        }
        case "final": {
          if (activeRun && runId && runId !== activeRun) return;
          setLiveTurn((prev) => ({
            ...(prev ?? EMPTY_TURN),
            done: true,
            finalMessage: event.message,
          }));
          setStreamEnabled(false);
          activeRunIdRef.current = null;
          // Refetch authoritative history, then drop the transient turn.
          refetchSelected();
          window.setTimeout(() => setLiveTurn(null), 400);
          break;
        }
        case "aborted": {
          if (activeRun && runId && runId !== activeRun) return;
          setLiveTurn((prev) => ({
            ...(prev ?? EMPTY_TURN),
            done: true,
            aborted: true,
          }));
          setStreamEnabled(false);
          activeRunIdRef.current = null;
          refetchSelected();
          window.setTimeout(() => setLiveTurn(null), 400);
          break;
        }
        case "error": {
          setLiveTurn((prev) => ({
            ...(prev ?? EMPTY_TURN),
            done: true,
            error: event.error.message,
          }));
          setStreamEnabled(false);
          activeRunIdRef.current = null;
          break;
        }
        default:
          break;
      }
    },
    [refetchSelected],
  );

  const stream = useChatStream(selectedKey, streamEnabled, {
    onEvent: handleStreamEvent,
  });

  // If the SSE transport itself errors, stop trying and surface it.
  React.useEffect(() => {
    if (stream.status === "error") {
      setStreamEnabled(false);
      activeRunIdRef.current = null;
      setLiveTurn((prev) =>
        prev && !prev.done ? { ...prev, done: true } : prev,
      );
    }
  }, [stream.status]);

  const selectSession = (key: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("session", key);
        return next;
      },
      { replace: false },
    );
    setListOpen(false);
  };


  const handleResolvePermission = React.useCallback(async (permission: ChatPermissionRequestCard, decision: "allow" | "deny") => {
    if (!selectedKey || !permission.runId) return;
    try {
      await resolvePermissionMutation.mutateAsync({
        sessionKey: selectedKey,
        runId: permission.runId,
        requestId: permission.requestId,
        payload: { decision },
      });
      toast.success(decision === "allow" ? "已允许工具执行" : "已拒绝工具执行");
    } catch (error) {
      toast.error("审批操作失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [resolvePermissionMutation, selectedKey]);

  const handleSend = React.useCallback(async (payload: ChatSendRequest): Promise<boolean> => {
    if (!selectedKey) return false;
    setLiveTurn({ ...EMPTY_TURN });
    setStreamEnabled(true);
    try {
      const ack = await sendMutation.mutateAsync({ sessionKey: selectedKey, payload });
      activeRunIdRef.current = ack.runId;
      setLiveTurn((prev) => ({
        ...(prev ?? EMPTY_TURN),
        runId: ack.runId,
      }));
      if (ack.status === "duplicate_completed" || isTerminalRuntimeState(ack.runtime.state)) {
        setStreamEnabled(false);
        activeRunIdRef.current = null;
        setLiveTurn(null);
        refetchSelected();
        if (ack.runtime.state === "error") {
          toast.error("Agent 运行失败", { description: ack.runtime.lastErrorMessage || "请打开证据面板查看运行详情" });
        }
      }
      return true;
    } catch (error) {
      setStreamEnabled(false);
      activeRunIdRef.current = null;
      setLiveTurn(null);
      toast.error("发送失败", { description: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }, [selectedKey, sendMutation, refetchSelected]);

  const handleUploadFile = React.useCallback(
    async (file: File, signal?: AbortSignal) => {
      if (!selectedKey) throw new Error("请先选择一个会话");
      return await uploadMutation.mutateAsync({ sessionKey: selectedKey, file, signal });
    },
    [selectedKey, uploadMutation],
  );

  const handleAbort = () => {
    if (!selectedKey) return;
    abortMutation.mutate(selectedKey, {
      onSuccess: (res) => {
        toast.success(res.aborted ? "运行已中止" : "无活跃运行");
        setStreamEnabled(false);
        setLiveTurn((prev) =>
          prev ? { ...prev, done: true, aborted: true } : prev,
        );
      },
      onError: (error) =>
        toast.error("中止失败", { description: error.message }),
    });
  };

  const sendDisabledReason = !selectedKey
    ? "选择一个会话以发送"
    : permissions && !permissions.canSend
      ? "该会话不可写"
      : sendMutation.isPending || (streamEnabled && !liveTurn?.done)
        ? "运行进行中"
        : null;

  const selectedState = runStateTone(runtime?.state);
  const selectedSource = selectedSession
    ? sessionSourceLabel(selectedSession)
    : "Tracevane";
  const selectedSourceDetail = selectedSession
    ? sessionSourceDetail(selectedSession)
    : "Tracevane";
  const runtimeTarget = selectedSession?.runtimeTarget ?? null;
  const selectedAgent = runtimeAgentLabel(selectedSession);
  const selectedModel = runtimeTarget?.model || "使用默认模型路由";
  const selectedWorkdir =
    runtimeTarget?.workDir ||
    selectedSession?.deliveryContext?.threadId ||
    selectedSession?.deliveryContext?.to ||
    "当前工作区";

  const runDetailAttention = Boolean(
    runtime?.activeRunId ||
      runtime?.lastErrorMessage ||
      queueItems.length > 0 ||
      overlays.length > 0 ||
      (observability?.toolCards?.length ?? 0) > 0,
  );

  const inspector = (
    <RuntimeInspectorView
      sessionKey={selectedKey}
      session={selectedSession}
      runtime={runtime}
      observability={observability}
      overlays={overlays}
      diagnostics={diagnostics}
      queueItems={queueItems}
    />
  );

  const list = (
    <SessionListView
      sessions={sessions}
      organizer={bootstrap.data?.organizer ?? null}
      diagnostics={diagnostics}
      selectedKey={selectedKey}
      isLoading={bootstrap.isLoading}
      isFetching={bootstrap.isFetching}
      error={bootstrap.error ?? null}
      onSelect={selectSession}
      onRefresh={() => void bootstrap.refetch()}
    />
  );

  return (
    <div className="grid h-full min-h-0 min-w-0 overflow-hidden bg-panel md:grid-cols-[320px_minmax(0,1fr)]">
      {/* Conversation switcher: persistent on desktop, drawer on mobile. */}
      <aside className="hidden min-h-0 border-r border-line bg-panel md:block">
        {list}
      </aside>

      <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-panel">
        <header className="flex min-w-0 items-center gap-3 border-b border-line px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setListOpen(true)}
            aria-label="打开会话列表"
          >
            <Menu />
          </Button>
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary [&_svg]:size-4">
            <Bot />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-ink-strong">
                {selectedSession ? sessionTitle(selectedSession) : "Agent 会话"}
              </h1>
              {shouldShowRunState(runtime?.state) && (
                <ToneBadge tone={selectedState.tone}>
                  {selectedState.label}
                </ToneBadge>
              )}
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3.5">
                <Bot />
                <span className="truncate">
                  {selectedAgent}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3.5">
                <Activity />
                <span className="truncate">{selectedModel}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3.5">
                <MessagesSquare />
                <span className="truncate" title={selectedSourceDetail}>{selectedSourceDetail || selectedSource}</span>
              </span>
              <span className="hidden min-w-0 items-center gap-1 lg:inline-flex [&_svg]:size-3.5">
                <FolderOpen />
                <span className="max-w-[280px] truncate">
                  {selectedWorkdir}
                </span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void bootstrap.refetch()}
              title="刷新"
            >
              <RefreshCw
                className={bootstrap.isFetching ? "animate-spin" : undefined}
              />
            </Button>
            <Button
              variant={runDetailAttention ? "primary" : "outline"}
              size="sm"
              onClick={() => setInspectorOpen(true)}
              title="查看运行详情、队列和诊断"
            >
              <Activity />
              运行详情
            </Button>
          </div>
        </header>

        <div className="min-h-0 overflow-hidden">
          <ConversationView
            sessionKey={selectedKey}
            messages={historyMessages}
            permissions={permissions}
            fileCapability={diagnostics?.fileCapability ?? null}
            isLoading={bootstrap.isLoading && Boolean(selectedKey)}
            error={bootstrap.error ?? null}
            liveTurn={liveTurn}
            streaming={
              stream.status === "open" || stream.status === "connecting"
            }
            streamError={stream.status === "error" ? stream.error : null}
            sending={sendMutation.isPending}
            sendDisabledReason={sendDisabledReason}
            onSend={handleSend}
            onUploadFile={handleUploadFile}
            uploading={uploadMutation.isPending}
            onAbort={handleAbort}
            onResolvePermission={handleResolvePermission}
            resolvingPermission={resolvePermissionMutation.isPending}
            onRetry={() => void bootstrap.refetch()}
          />
        </div>
      </section>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="w-[min(92vw,360px)] p-0">
          <div className="h-full min-h-0 overflow-hidden">{list}</div>
        </SheetContent>
      </Sheet>

      {/* Run details are contextual and temporary, never a permanent third column. */}
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent side="right" className="w-[min(380px,92vw)] p-0">
          <div className="h-full min-h-0 overflow-hidden">{inspector}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ChatWorkbenchPage;
