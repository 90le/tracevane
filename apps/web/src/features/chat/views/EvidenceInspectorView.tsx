import * as React from "react";
import {
  Activity,
  ListChecks,
  RadioTower,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";

import { Fact, ToneBadge, formatTime } from "@/features/cli-agents/views/_shared";

import {
  useDeleteChatQueueEntryMutation,
  useResetChatSessionMutation,
} from "@/lib/query/chat";
import type {
  ChatDiagnostics,
  ChatInspectorTab,
  ChatObservabilityState,
  ChatQueuedMessageItem,
  ChatRunOverlay,
  ChatRuntimeState,
  ChatSessionRow,
} from "../types";
import { CHAT_INSPECTOR_TABS } from "../types";
import { boolTone, runStateTone, toolStatusTone } from "../_shared";

const TAB_META: Record<
  ChatInspectorTab,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  evidence: { label: "概览", icon: Activity },
  queue: { label: "队列", icon: ListChecks },
  diagnostics: { label: "诊断", icon: RadioTower },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 text-xs font-medium tracking-wide text-subtle">
      {children}
    </div>
  );
}

function InlineEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 text-sm text-muted">{children}</p>;
}

function EvidenceTab({
  runtime,
  session,
  observability,
  overlays,
}: {
  runtime: ChatRuntimeState | null;
  session: ChatSessionRow | null;
  observability: ChatObservabilityState | null;
  overlays: ChatRunOverlay[];
}) {
  const toolCards = observability?.toolCards ?? [];
  const timeline = observability?.timeline ?? [];
  const usage = observability?.usage ?? null;
  return (
    <div className="grid gap-2 pb-3">
      <SectionLabel>运行时</SectionLabel>
      <dl className="grid grid-cols-2 gap-3 px-3">
        <Fact label="代理">{session?.agentId ?? "—"}</Fact>
        <Fact label="状态">{runStateTone(runtime?.state).label}</Fact>
        <Fact label="活跃运行">{runtime?.activeRunId ?? "无"}</Fact>
        <Fact label="可写">{boolTone(runtime?.sessionWritable).label}</Fact>
        <Fact label="网关">{boolTone(runtime?.gatewayConnected).label}</Fact>
        <Fact label="最后事件">{formatTime(runtime?.lastEventAt)}</Fact>
      </dl>

      {usage && (
        <>
          <SectionLabel>用量</SectionLabel>
          <dl className="grid grid-cols-3 gap-3 px-3">
            <Fact label="输入">{usage.inputTokens}</Fact>
            <Fact label="输出">{usage.outputTokens}</Fact>
            <Fact label="合计">{usage.totalTokens}</Fact>
          </dl>
        </>
      )}

      {overlays.length > 0 && (
        <>
          <SectionLabel>运行投影</SectionLabel>
          <div className="grid gap-1 px-2">
            {overlays.slice(0, 8).map((o) => {
              const st = runStateTone(o.lifecycle === "running" ? "running" : o.lifecycle);
              return (
                <div
                  key={o.runId}
                  className="grid gap-0.5 rounded-sm border border-line bg-panel-2 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs text-ink-strong">{o.runId}</span>
                    <ToneBadge tone={st.tone}>{o.lifecycle}</ToneBadge>
                  </div>
                  {o.previewText && (
                    <span className="truncate text-xs text-muted">{o.previewText}</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {toolCards.length > 0 && (
        <>
          <SectionLabel>工具调用</SectionLabel>
          <div className="grid gap-1 px-2">
            {toolCards.slice(0, 10).map((t) => {
              const st = toolStatusTone(t.status);
              return (
                <div
                  key={t.toolCallId}
                  className="flex items-center gap-2 rounded-sm border border-line bg-panel-2 px-2.5 py-1.5"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-panel-3 text-muted [&_svg]:size-3">
                    <Wrench />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-strong">
                    {t.name}
                  </span>
                  <ToneBadge tone={t.isError ? "bad" : st.tone}>{st.label}</ToneBadge>
                </div>
              );
            })}
          </div>
        </>
      )}

      {timeline.length > 0 && (
        <>
          <SectionLabel>时间线</SectionLabel>
          <div className="grid gap-1 px-3">
            {timeline.slice(0, 10).map((item) => (
              <div key={item.id} className="grid gap-0.5">
                <strong className="text-sm text-ink-strong">{item.title}</strong>
                <span className="text-xs text-muted">
                  {item.detail ?? "—"} · {formatTime(item.emittedAt)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!usage && overlays.length === 0 && toolCards.length === 0 && timeline.length === 0 && (
        <InlineEmpty>当前没有运行投影、工具调用或时间线活动。</InlineEmpty>
      )}
    </div>
  );
}

function QueueTab({ sessionKey, items }: { sessionKey: string; items: ChatQueuedMessageItem[] }) {
  const deleteMutation = useDeleteChatQueueEntryMutation();
  const [confirm, setConfirm] = React.useState<ChatQueuedMessageItem | null>(null);

  const runDelete = (entry: ChatQueuedMessageItem) => {
    deleteMutation.mutate(
      { sessionKey, entryId: entry.id },
      {
        onSuccess: () => toast.success("已删除队列条目"),
        onError: (error) => toast.error("删除队列条目失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <div className="grid gap-1 p-2 pb-3">
      {items.length === 0 ? (
        <EmptyState icon={<ListChecks />} title="队列为空" description="待投递或被阻塞的消息会显示在这里。" />
      ) : (
        items.map((entry) => (
          <div
            key={entry.id}
            className="grid gap-0.5 rounded-sm border border-line bg-panel-2 px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              <Badge variant={entry.status === "blocked" ? "bad" : "warn"}>
                {entry.status === "blocked" ? "已阻塞" : "排队中"}
              </Badge>
              <span className="ml-auto text-xs text-subtle">{formatTime(entry.createdAt)}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-red hover:bg-red-soft"
                disabled={deleteMutation.isPending}
                onClick={() => setConfirm(entry)}
              >
                <Trash2 />
              </Button>
            </div>
            <span className="truncate text-sm text-ink-strong">{entry.previewText || entry.text}</span>
            {entry.blockedReason && (
              <span className="text-xs text-red">原因：{entry.blockedReason}</span>
            )}
          </div>
        ))
      )}

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <Trash2 />
            </span>
            <DialogTitle>删除队列条目</DialogTitle>
          </DialogHeader>
          <DialogBody>
            删除后该消息将不会被投递，且无法恢复。确认删除该排队消息？
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirm(null)}
              disabled={deleteMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => confirm && runDelete(confirm)}
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiagnosticsTab({ diagnostics }: { diagnostics: ChatDiagnostics | null }) {
  if (!diagnostics) {
    return <p className="p-3 text-sm text-muted">暂无诊断数据。</p>;
  }
  const rows: Array<[string, React.ReactNode]> = [
    ["网关可达", boolTone(diagnostics.gatewayReachable).label],
    ["传输", diagnostics.transport],
    ["鉴权", diagnostics.authMode],
    ["历史截断", boolTone(diagnostics.historyTruncated).label],
    ["截断模式", diagnostics.truncationMode],
    ["同源要求", boolTone(diagnostics.sameOriginRequired).label],
    ["暴露原始帧", boolTone(diagnostics.rawGatewayFramesExposed).label],
  ];
  return (
    <div className="grid gap-2 p-3 pb-4">
      <dl className="grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b border-line pb-1.5">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-sm text-ink-strong">{value}</dd>
          </div>
        ))}
      </dl>
      {diagnostics.notes.length > 0 && (
        <div className="grid gap-1">
          {diagnostics.notes.map((note, i) => (
            <p key={i} className="rounded-sm bg-panel-2 px-2.5 py-1.5 text-xs text-muted">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Temporary run details drawer. Tabs across run summary, the outbound
 * queue (delete is confirmed), and gateway diagnostics. Also owns the destructive
 * session reset (confirmed).
 */
export function EvidenceInspectorView({
  sessionKey,
  session,
  runtime,
  observability,
  overlays,
  diagnostics,
  queueItems,
}: {
  sessionKey: string | null;
  session: ChatSessionRow | null;
  runtime: ChatRuntimeState | null;
  observability: ChatObservabilityState | null;
  overlays: ChatRunOverlay[];
  diagnostics: ChatDiagnostics | null;
  queueItems: ChatQueuedMessageItem[];
}) {
  const [tab, setTab] = React.useState<ChatInspectorTab>("evidence");
  const [resetConfirm, setResetConfirm] = React.useState(false);
  const resetMutation = useResetChatSessionMutation();

  const runReset = () => {
    if (!sessionKey) return;
    resetMutation.mutate(sessionKey, {
      onSuccess: () => toast.success("会话已重置"),
      onError: (error) => toast.error("重置会话失败", { description: error.message }),
      onSettled: () => setResetConfirm(false),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-3 py-3">
        <div className="pr-8">
          <h2 className="text-md font-semibold text-ink-strong">运行详情</h2>
          <p className="mt-0.5 text-xs text-muted">只在需要排查执行、队列或网关问题时查看。</p>
        </div>
      </div>
      <div className="flex items-center gap-1 border-b border-line p-2">
        {CHAT_INSPECTOR_TABS.map((id) => {
          const meta = TAB_META[id];
          const active = tab === id;
          const Icon = meta.icon;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm outline-none transition-colors [&_svg]:size-3.5 focus-visible:shadow-[var(--ring)]",
                active
                  ? "bg-primary-soft text-ink-strong [&_svg]:text-primary"
                  : "text-muted hover:bg-panel-2 hover:text-ink",
              )}
            >
              <Icon />
              {meta.label}
            </button>
          );
        })}
        <span className="ml-auto" />
        <Button
          variant="ghost"
          size="sm"
          className="text-red hover:bg-red-soft"
          disabled={!sessionKey || resetMutation.isPending}
          onClick={() => setResetConfirm(true)}
        >
          <RotateCcw />
          重置
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!sessionKey ? (
          <EmptyState icon={<Activity />} title="未选择会话" description="选择会话以查看运行详情。" />
        ) : tab === "evidence" ? (
          <EvidenceTab
            runtime={runtime}
            session={session}
            observability={observability}
            overlays={overlays}
          />
        ) : tab === "queue" ? (
          <QueueTab sessionKey={sessionKey} items={queueItems} />
        ) : (
          <DiagnosticsTab diagnostics={diagnostics} />
        )}
      </div>

      <Dialog open={resetConfirm} onOpenChange={(o) => !o && setResetConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <RotateCcw />
            </span>
            <DialogTitle>重置会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            重置会清除该会话的运行状态与上下文，正在进行的运行将被中断。此操作不可恢复。确认重置？
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetConfirm(false)}
              disabled={resetMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={resetMutation.isPending}
              onClick={runReset}
            >
              {resetMutation.isPending ? "重置中…" : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EvidenceInspectorView;
