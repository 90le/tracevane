import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  MessagesSquare,
  PanelLeft,
  RefreshCw,
  Send,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { Sheet, SheetContent } from "@/design/ui/sheet";
import { toast } from "@/design/ui/sonner";
import { StatTile } from "@/features/cli-agents/views/_shared";

import {
  useAbortChatSessionMutation,
  useChatBootstrapQuery,
  useChatStream,
  useSendChatMessageMutation,
} from "@/lib/query/chat";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@/lib/query/chat";

import {
  ConversationView,
  EvidenceInspectorView,
  SessionListView,
} from "./views";
import type {
  ChatMessageItem,
  ChatStreamEvent,
  ChatToolCard,
  LiveAssistantTurn,
} from "./types";
import { runStateTone, sessionTitle } from "./_shared";

const EMPTY_TURN: LiveAssistantTurn = {
  runId: null,
  text: "",
  toolCards: [],
  done: false,
  error: null,
  aborted: false,
  finalMessage: null,
};

/**
 * Chat Agent Operations Workbench (`/chat`).
 *
 * Layout: session roster (left) + conversation with the composer / run controls
 * (center) + the evidence inspector (right). On narrow viewports the roster and
 * inspector collapse into drawers.
 *
 * Data: the bootstrap query owns the roster + the selected session's read
 * snapshot (history, queue, controls, diagnostics). Sending a message POSTs
 * `/send`; a live SSE subscription (`useChatStream`) renders the streaming
 * assistant turn (text + tool calls) as events arrive. On a terminal stream
 * event (`final` / `aborted` / `error`) we refetch the authoritative bootstrap
 * and clear the transient live turn — the stream is never the source of truth.
 */
export function ChatWorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const sessionParam = searchParams.get("session");
  const [listOpen, setListOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  const bootstrap = useChatBootstrapQuery({ sessionKey: sessionParam });

  const sessions = bootstrap.data?.sessions ?? [];
  const selectedKey = sessionParam ?? bootstrap.data?.selectedSessionKey ?? null;

  const history = bootstrap.data?.history ?? null;
  const selectedSession =
    sessions.find((s) => s.key === selectedKey) ?? history?.session ?? null;
  const runtime = history?.runtime ?? selectedSession?.runtime ?? null;
  const permissions = selectedSession?.permissions ?? null;
  const diagnostics = history?.diagnostics ?? bootstrap.data?.diagnostics ?? null;
  const observability = history?.observability ?? null;
  const overlays = history?.overlays ?? [];
  const historyMessages: ChatMessageItem[] = history?.messages ?? [];
  const queueItems = bootstrap.data?.queue?.items ?? [];
  const controls = bootstrap.data?.controls ?? null;

  // --- Live streaming state -------------------------------------------------
  const [liveTurn, setLiveTurn] = React.useState<LiveAssistantTurn | null>(null);
  // We only open the SSE stream while a send is in-flight / streaming.
  const [streamEnabled, setStreamEnabled] = React.useState(false);
  const activeRunIdRef = React.useRef<string | null>(null);

  const sendMutation = useSendChatMessageMutation();
  const abortMutation = useAbortChatSessionMutation();

  const refetchSelected = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: chatKeys.bootstrap(selectedKey) });
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
          setLiveTurn((prev) => ({ ...(prev ?? EMPTY_TURN), done: true, aborted: true }));
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
      setLiveTurn((prev) => (prev && !prev.done ? { ...prev, done: true } : prev));
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

  const handleSend = (text: string) => {
    if (!selectedKey) return;
    setLiveTurn({ ...EMPTY_TURN });
    setStreamEnabled(true);
    sendMutation.mutate(
      { sessionKey: selectedKey, payload: { text } },
      {
        onSuccess: (ack) => {
          activeRunIdRef.current = ack.runId;
          setLiveTurn((prev) => ({ ...(prev ?? EMPTY_TURN), runId: ack.runId }));
          if (ack.status === "duplicate_completed") {
            setStreamEnabled(false);
            setLiveTurn(null);
            refetchSelected();
          }
        },
        onError: (error) => {
          setStreamEnabled(false);
          setLiveTurn(null);
          toast.error("发送失败", { description: error.message });
        },
      },
    );
  };

  const handleAbort = () => {
    if (!selectedKey) return;
    abortMutation.mutate(selectedKey, {
      onSuccess: (res) => {
        toast.success(res.aborted ? "运行已中止" : "无活跃运行");
        setStreamEnabled(false);
        setLiveTurn((prev) => (prev ? { ...prev, done: true, aborted: true } : prev));
      },
      onError: (error) => toast.error("中止失败", { description: error.message }),
    });
  };

  const sendDisabledReason = !selectedKey
    ? "选择一个会话以发送"
    : permissions && !permissions.canSend
      ? "该会话不可写"
      : sendMutation.isPending || (streamEnabled && !liveTurn?.done)
        ? "运行进行中"
        : null;

  const runningCount = sessions.filter((s) =>
    /running|streaming/.test(s.runtime?.state ?? ""),
  ).length;
  const writableCount = sessions.filter((s) => s.permissions?.canSend).length;
  const totalTokens = observability?.usage?.totalTokens ?? 0;

  const inspector = (
    <EvidenceInspectorView
      sessionKey={selectedKey}
      session={selectedSession}
      runtime={runtime}
      observability={observability}
      overlays={overlays}
      diagnostics={diagnostics}
      queueItems={queueItems}
      controls={controls}
    />
  );

  const list = (
    <SessionListView
      sessions={sessions}
      selectedKey={selectedKey}
      isLoading={bootstrap.isLoading}
      isFetching={bootstrap.isFetching}
      error={bootstrap.error ?? null}
      onSelect={selectSession}
      onRefresh={() => void bootstrap.refetch()}
    />
  );

  return (
    <div className="grid h-[calc(100dvh-7rem)] min-h-[560px] grid-rows-[auto_minmax(0,1fr)] gap-4">
      {/* Hero / roll-up */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink-strong">会话任务工作台</h1>
            <p className="truncate text-sm text-muted">
              {selectedSession
                ? `${sessionTitle(selectedSession)} · ${runStateTone(runtime?.state).label}`
                : "Agent 操作工作台：会话、运行、工具调用与证据。"}
            </p>
          </div>
          <span className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setListOpen(true)}
          >
            <PanelLeft />
            会话
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setInspectorOpen(true)}
          >
            <Activity />
            证据
          </Button>
          <Button variant="outline" size="sm" onClick={() => void bootstrap.refetch()}>
            <RefreshCw className={bootstrap.isFetching ? "animate-spin" : undefined} />
            刷新
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={<MessagesSquare />} label="会话" value={sessions.length} sub={`${runningCount} 运行中`} />
          <StatTile icon={<Send />} label="可写" value={writableCount} sub="允许发送" />
          <StatTile icon={<Activity />} label="队列" value={queueItems.length} sub="待投递 / 阻塞" />
          <StatTile icon={<Activity />} label="令牌" value={totalTokens} sub="当前历史" />
        </div>
      </section>

      {/* Three-column workbench */}
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className="hidden min-h-0 lg:block">{list}</div>
        <div className="min-h-0">
          <ConversationView
            sessionKey={selectedKey}
            messages={historyMessages}
            permissions={permissions}
            isLoading={bootstrap.isLoading && Boolean(selectedKey)}
            error={bootstrap.error ?? null}
            liveTurn={liveTurn}
            streaming={stream.status === "open" || stream.status === "connecting"}
            streamError={stream.status === "error" ? stream.error : null}
            sending={sendMutation.isPending}
            sendDisabledReason={sendDisabledReason}
            onSend={handleSend}
            onAbort={handleAbort}
            onRetry={() => void bootstrap.refetch()}
          />
        </div>
        <div className="hidden min-h-0 rounded-md border border-line bg-panel shadow-sm lg:block">
          {inspector}
        </div>
      </div>

      {/* Mobile drawers */}
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="p-0">
          <div className="h-full min-h-0 overflow-hidden">{list}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent side="right" className="p-0">
          <div className="h-full min-h-0 overflow-hidden">{inspector}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ChatWorkbenchPage;
