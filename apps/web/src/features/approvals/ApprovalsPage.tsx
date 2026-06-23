import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  History,
  Info,
  MessageSquare,
  Radio,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  XCircle,
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
import { ListDetailLayout } from "@/shared/layouts/ListDetailLayout";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useChannelConnectorsAgentSessionsQuery } from "@/lib/query/channel-connectors";
import { useChatBootstrapQuery } from "@/lib/query/dashboard";
import { usePatchChatControlsMutation } from "@/lib/query/chat";

import {
  Panel,
  PanelHead,
  Row,
  StatTile,
  ToneBadge,
  formatTime,
  toneIconClass,
} from "@/features/cli-agents/views/_shared";

import type { ApprovalAction, ApprovalFilter, ApprovalIconKey, ApprovalItem } from "./types";
import { RISK_LABEL, bucketCounts, buildApprovals, filterItems } from "./views/aggregate";

/** Console auto-refresh cadence — refetch (NOT SSE), generous to avoid churn. */
const REFRESH_INTERVAL_MS = 20_000;

const ROW_ICON: Record<ApprovalIconKey, React.ComponentType<{ className?: string }>> = {
  policy: ShieldCheck,
  run: MessageSquare,
  channel: Radio,
  event: History,
};

const FILTERS: ReadonlyArray<{ id: ApprovalFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "action-required", label: "待处理" },
  { id: "review", label: "建议复核" },
  { id: "info", label: "提示" },
];

type Confirm = {
  kind: "chat-host-exec-toggle";
  item: ApprovalItem;
  action: Extract<ApprovalAction, { kind: "chat-host-exec-toggle" }>;
};

/**
 * `/approvals` — in-context approval aggregation hub.
 *
 * Tracevane has NO dedicated approvals backend: approvals happen in-context (in
 * the chat tool-approval toolbar and in IM permission-card threads handled by
 * the channel daemon). This page is therefore an HONEST aggregation of the real
 * approval-adjacent signals that ARE queryable — the chat per-session
 * host-management-exec policy (the one gate with a real resolve endpoint),
 * active chat runs with tool calls, channel sessions' permission posture, and
 * recent channel turn failures — plus deep-links to act where the decision
 * actually lives.
 *
 * It never fabricates an approval queue and never renders a fake approve button:
 * the ONLY in-page action wired here is the chat host-exec policy toggle (real
 * `usePatchChatControlsMutation` contract, behind confirmation + evidence).
 * Everything else deep-links to its owning surface. An empty roster is the
 * common, correct state — approvals are handled in-context.
 */
export function ApprovalsPage() {
  const navigate = useNavigate();

  const chat = useChatBootstrapQuery({ refetchInterval: REFRESH_INTERVAL_MS });
  const channelSessions = useChannelConnectorsAgentSessionsQuery({ refetchInterval: REFRESH_INTERVAL_MS });

  const patchControls = usePatchChatControlsMutation();

  const [filter, setFilter] = React.useState<ApprovalFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [evidence, setEvidence] = React.useState<{ tone: "ok" | "bad"; title: string; detail: string } | null>(null);

  const items = React.useMemo(
    () => buildApprovals({ chat: chat.data, channelSessions: channelSessions.data }),
    [chat.data, channelSessions.data],
  );

  const counts = React.useMemo(() => bucketCounts(items), [items]);
  const visible = React.useMemo(() => filterItems(items, filter), [items, filter]);

  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  const sources = [chat, channelSessions] as const;
  const anyLoading = sources.some((q) => q.isLoading);
  const allError = sources.every((q) => q.isError);
  const isFetching = sources.some((q) => q.isFetching);
  const pending = patchControls.isPending;

  const refetchAll = React.useCallback(() => {
    void chat.refetch();
    void channelSessions.refetch();
  }, [chat, channelSessions]);

  const selectRow = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  // --- Authoritative resolve action (the ONLY one) --------------------------

  const runHostExecToggle = (action: Extract<ApprovalAction, { kind: "chat-host-exec-toggle" }>) => {
    const next = !action.current;
    patchControls.mutate(
      { sessionKey: action.sessionKey, payload: { allowHostManagementExec: next } },
      {
        onSuccess: (result) => {
          const applied = result.controls.allowHostManagementExec;
          setEvidence({
            tone: "ok",
            title: applied ? "已允许主机管理执行" : "已恢复逐次批准",
            detail: `session ${result.session.key} · allowHostManagementExec=${applied}`,
          });
          toast.success(applied ? "已允许主机管理执行" : "已恢复逐次批准", {
            description: result.session.key,
          });
          void chat.refetch();
        },
        onError: (error) => {
          setEvidence({ tone: "bad", title: "更新策略失败", detail: error.message });
          toast.error("更新策略失败", { description: error.message });
        },
        onSettled: () => setConfirm(null),
      },
    );
  };

  // --- Render ----------------------------------------------------------------

  const list = (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="审批中心"
          sub="审批在对话工具栏与 IM 权限卡片中就地处理；本页诚实聚合可查询的审批信号并深链到决策所在处，不伪造审批队列。"
          action={
            <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching}>
              <RefreshCw className={cn(isFetching && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <StatTile icon={<AlertTriangle />} label="待处理" value={counts["action-required"]} sub="需要决定的策略门" />
          <StatTile icon={<Info />} label="建议复核" value={counts.review} sub="就地审批的上下文" />
          <StatTile icon={<ShieldCheck />} label="提示" value={counts.info} sub="审批姿态信息" />
          <StatTile icon={<SquareTerminal />} label="证据源" value={2} sub="Chat / IM 渠道" />
        </div>

        <div
          className="flex flex-wrap gap-1 border-t border-line px-3 py-2"
          role="tablist"
          aria-label="审批过滤"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                  active
                    ? "bg-primary-soft text-ink-strong"
                    : "text-muted hover:bg-panel-2 hover:text-ink",
                )}
              >
                {f.label}
                <Badge variant="outline">{counts[f.id]}</Badge>
              </button>
            );
          })}
        </div>

        <div className="grid gap-0.5 p-1">
          {anyLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : allError ? (
            <ErrorState
              title="无法加载审批信号"
              description="Chat 与 IM 渠道证据源都不可用，请确认后端在线后重试。"
              action={
                <Button variant="outline" size="sm" onClick={refetchAll}>
                  重试
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="当前没有待审批项"
              description={
                filter === "all"
                  ? "审批在对话工具栏与 IM 权限卡片中就地处理。这里没有待办是正常状态，不是错误。"
                  : "切换过滤查看其它级别的审批信号。"
              }
              icon={<ShieldCheck />}
              action={
                filter === "all" ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate("/chat")}>
                      <MessageSquare />
                      前往对话工具栏
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate("/im-channels")}>
                      <Radio />
                      前往 IM 权限卡片
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : (
            visible.map((item) => {
              const Icon = ROW_ICON[item.icon];
              return (
                <Row
                  key={item.id}
                  icon={<Icon />}
                  iconClass={toneIconClass(item.tone)}
                  title={item.title}
                  subtitle={`${item.sourceLabel} · ${formatTime(item.updatedAt)}`}
                  trailing={
                    <>
                      <ToneBadge tone={item.tone}>{RISK_LABEL[item.risk]}</ToneBadge>
                      {item.action && <span className="text-xs text-muted">可处理</span>}
                    </>
                  }
                  onClick={() => selectRow(item.id)}
                />
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );

  const detail = selected ? (
    <DetailInspector
      item={selected}
      pending={pending}
      evidence={evidence}
      onClose={() => setDetailOpen(false)}
      onDeepLink={(to) => navigate(to)}
      onAction={(action) => {
        setEvidence(null);
        setConfirm({ kind: "chat-host-exec-toggle", item: selected, action });
      }}
    />
  ) : (
    <div className="p-4">
      <EmptyState
        title="未选择审批项"
        description="从左侧列表选择一项查看上下文与证据；或在对话 / IM 渠道中就地审批。"
        icon={<ShieldCheck />}
      />
    </div>
  );

  return (
    <>
      <ListDetailLayout list={list} detail={detail} detailOpen={detailOpen} />

      {/* Host-management-exec policy confirmation (the only real resolve action) */}
      <Dialog open={confirm?.kind === "chat-host-exec-toggle"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <ShieldCheck />
            </span>
            <DialogTitle>
              {confirm?.action.current ? "恢复逐次批准" : "允许主机管理执行"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {confirm?.action.current ? (
              <>
                关闭后，该会话内的主机管理执行将恢复为逐次在对话中请求批准。确认对会话
                <code className="mx-1 rounded-sm bg-panel-3 px-1 py-0.5 font-mono text-xs">
                  {confirm.action.sessionKey}
                </code>
                恢复逐次批准？
              </>
            ) : (
              <>
                允许后，该会话内的主机管理执行工具调用将被自动批准、不再逐次提示。这是一项授予权限的操作，请谨慎确认对会话
                <code className="mx-1 rounded-sm bg-panel-3 px-1 py-0.5 font-mono text-xs">
                  {confirm?.action.sessionKey}
                </code>
                开启。
                {confirm?.action.globalEnabled === false && (
                  <span className="mt-2 block text-amber">
                    注意：全局主机管理执行当前已禁用，开启会话策略不会立即生效。
                  </span>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant={confirm?.action.current ? "danger" : "primary"}
              size="sm"
              disabled={pending}
              onClick={() => confirm && runHostExecToggle(confirm.action)}
            >
              {pending ? "更新中…" : confirm?.action.current ? "确认恢复" : "确认允许"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail inspector
// ---------------------------------------------------------------------------

function DetailInspector({
  item,
  pending,
  evidence,
  onClose,
  onDeepLink,
  onAction,
}: {
  item: ApprovalItem;
  pending: boolean;
  evidence: { tone: "ok" | "bad"; title: string; detail: string } | null;
  onClose: () => void;
  onDeepLink: (to: string) => void;
  onAction: (action: Extract<ApprovalAction, { kind: "chat-host-exec-toggle" }>) => void;
}) {
  const Icon = ROW_ICON[item.icon];
  return (
    <div className="grid">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4",
            toneIconClass(item.tone),
          )}
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-md font-semibold text-ink-strong">{item.title}</h3>
          <span className="block truncate text-sm text-subtle">{item.sourceLabel}</span>
        </div>
        <ToneBadge tone={item.tone}>{RISK_LABEL[item.risk]}</ToneBadge>
        <button
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-sm text-muted outline-none hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] lg:hidden [&_svg]:size-4"
        >
          <XCircle />
        </button>
      </div>

      <div className="grid gap-3 p-4">
        <p className="text-sm text-muted">{item.summary}</p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">级别 {RISK_LABEL[item.risk]}</Badge>
          <Badge variant="outline">更新 {formatTime(item.updatedAt)}</Badge>
        </div>

        {/* In-context boundary note */}
        <div className="rounded-sm border border-line bg-panel-2 p-3 text-xs text-muted">
          Tracevane 没有独立的审批后端：审批在对话工具栏与 IM 权限卡片（渠道守护进程在 IM 会话线程内回复权限卡片）中就地处理。
          本页唯一的页内权威操作是切换 Chat 会话的「主机管理执行」策略；其余项请深链到所属处审批。
        </div>

        {/* Last action evidence */}
        {evidence && (
          <div className="grid gap-1 rounded-sm border border-line bg-panel-2 p-3">
            <div className="flex items-center gap-2">
              <Badge variant={evidence.tone}>{evidence.tone === "ok" ? "成功" : "失败"}</Badge>
              <span className="text-sm text-ink-strong">{evidence.title}</span>
            </div>
            <code className="block rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
              {evidence.detail}
            </code>
          </div>
        )}

        {/* Read-only evidence */}
        <div>
          <span className="mb-1.5 block text-xs font-medium text-subtle">上下文 / 证据</span>
          <dl className="grid gap-px overflow-hidden rounded-sm border border-line bg-line">
            {item.evidence.map((e, i) => (
              <div key={`${e.label}-${i}`} className="grid grid-cols-[110px_1fr] gap-2 bg-panel px-3 py-2">
                <dt className="truncate text-xs text-subtle">{e.label}</dt>
                <dd className="break-words text-sm text-ink-strong">{e.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Action */}
        <div className="grid gap-2 border-t border-line pt-3">
          {item.action ? (
            <Button
              variant={item.action.current ? "danger" : "primary"}
              size="sm"
              disabled={pending}
              onClick={() => onAction(item.action as Extract<ApprovalAction, { kind: "chat-host-exec-toggle" }>)}
            >
              <ShieldCheck />
              {item.action.current ? "恢复逐次批准（权威）" : "允许主机管理执行（权威）"}
            </Button>
          ) : (
            <p className="text-xs text-subtle">此来源没有页内审批接口；请使用下方深链到所属处就地审批。</p>
          )}
          <Button variant="outline" size="sm" onClick={() => onDeepLink(item.to)}>
            <ExternalLink />
            {item.toLabel}
            <ArrowUpRight className="ml-auto" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalsPage;
