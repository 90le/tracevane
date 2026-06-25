import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  History,
  LifeBuoy,
  MessageSquare,
  Radio,
  RefreshCw,
  SquareTerminal,
  Timer,
  Workflow,
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
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import { useChannelConnectorsAgentSessionsQuery, useManageChannelConnectorsAgentSessionsMutation } from "@/lib/query/channel-connectors";
import { useChatBootstrapQuery, useOpenClawRecoveryStatusQuery } from "@/lib/query/dashboard";
import { useEndTerminalSessionMutation, useTerminalSessionsQuery } from "@/lib/query/terminal";

import { Panel, PanelHead, Row, StatTile, ToneBadge, formatTime, toneIconClass } from "@/features/cli-agents/views/_shared";

import type {
  LongTaskControl,
  LongTaskFilter,
  LongTaskIconKey,
  LongTaskRow,
} from "./types";
import {
  STATUS_LABEL,
  bucketCounts,
  buildLongTasks,
  filterRows,
} from "./views/aggregate";

/** Console auto-refresh cadence — refetch (NOT SSE), generous to avoid churn. */
const REFRESH_INTERVAL_MS = 20_000;

const ROW_ICON: Record<LongTaskIconKey, React.ComponentType<{ className?: string }>> = {
  overlay: Activity,
  session: MessageSquare,
  queue: Timer,
  channel: Radio,
  event: History,
  terminal: SquareTerminal,
  recovery: LifeBuoy,
};

const FILTERS: ReadonlyArray<{ id: LongTaskFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "运行中" },
  { id: "waiting", label: "等待" },
  { id: "attention", label: "需关注" },
  { id: "done", label: "已完成" },
];

type Confirm =
  | { kind: "channel-kill"; row: LongTaskRow; poolKey: string; sessionId: string }
  | { kind: "channel-reap" }
  | { kind: "terminal-end"; row: LongTaskRow; control: Extract<LongTaskControl, { kind: "terminal-end" }> };

/**
 * `/long-tasks` — compatibility deep-link for supervised work. It is no longer
 * a primary navigation domain; CLI Agents owns Agent Runs.
 *
 * Synthesizes four existing read sources (chat bootstrap, channel agent
 * sessions + events, terminal sessions, recovery status) into one honest
 * List-Detail roster. Selecting a row opens an inspector with full read-only
 * evidence + a deep-link to the owning domain.
 *
 * Honest supervision: silence and child-agent fan-out are NEVER treated as
 * failure (see `classifyStatus`). The ONLY authoritative in-page controls are
 * channel agent-session stop (kill) / reap-idle and terminal session end —
 * each behind confirmation with evidence on completion. Pause / retry /
 * restart / launch have no backend contract and are intentionally omitted in
 * favour of the deep-link to the owning domain.
 */
export function LongTasksPage() {
  const navigate = useNavigate();

  const chat = useChatBootstrapQuery({ refetchInterval: REFRESH_INTERVAL_MS });
  const channelSessions = useChannelConnectorsAgentSessionsQuery({ refetchInterval: REFRESH_INTERVAL_MS });
  const terminalSessions = useTerminalSessionsQuery({ refetchInterval: REFRESH_INTERVAL_MS });
  const recovery = useOpenClawRecoveryStatusQuery({ refetchInterval: REFRESH_INTERVAL_MS });

  const killMutation = useManageChannelConnectorsAgentSessionsMutation();
  const endMutation = useEndTerminalSessionMutation();

  const [filter, setFilter] = React.useState<LongTaskFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [evidence, setEvidence] = React.useState<{ tone: "ok" | "bad"; title: string; detail: string } | null>(null);

  const rows = React.useMemo(
    () =>
      buildLongTasks({
        chat: chat.data,
        channelSessions: channelSessions.data,
        terminalSessions: terminalSessions.data,
        recovery: recovery.data,
      }),
    [chat.data, channelSessions.data, terminalSessions.data, recovery.data],
  );

  const counts = React.useMemo(() => bucketCounts(rows), [rows]);
  const visible = React.useMemo(() => filterRows(rows, filter), [rows, filter]);

  const selected =
    visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  const sources = [chat, channelSessions, terminalSessions, recovery] as const;
  const anyLoading = sources.some((q) => q.isLoading);
  const allError = sources.every((q) => q.isError);
  const isFetching = sources.some((q) => q.isFetching);
  const pending = killMutation.isPending || endMutation.isPending;

  const refetchAll = React.useCallback(() => {
    void chat.refetch();
    void channelSessions.refetch();
    void terminalSessions.refetch();
    void recovery.refetch();
  }, [chat, channelSessions, terminalSessions, recovery]);

  const selectRow = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  // --- Authoritative controls -----------------------------------------------

  const runChannelKill = (poolKey: string, sessionId: string) => {
    killMutation.mutate(
      { action: "kill", poolKey, reason: "manual-stop-from-long-tasks" },
      {
        onSuccess: (result) => {
          const killed = result.killed?.killed === true;
          setEvidence({
            tone: killed ? "ok" : "bad",
            title: killed ? "已停止渠道 Agent 会话" : "未停止任何会话",
            detail: killed
              ? `sessionId ${result.killed?.sessionId ?? sessionId} · poolKey ${poolKey}`
              : `未找到匹配会话（poolKey ${poolKey}），可能已结束`,
          });
          if (killed) toast.success("已停止会话", { description: sessionId });
          else toast.warning("未停止任何会话", { description: "会话可能已结束" });
          void channelSessions.refetch();
        },
        onError: (error) => {
          setEvidence({ tone: "bad", title: "停止失败", detail: error.message });
          toast.error("停止失败", { description: error.message });
        },
        onSettled: () => setConfirm(null),
      },
    );
  };

  const runChannelReap = () => {
    killMutation.mutate(
      { action: "reap-idle", reason: "manual-reap-from-long-tasks" },
      {
        onSuccess: (result) => {
          setEvidence({
            tone: "ok",
            title: "已回收空闲渠道会话",
            detail: `reaped ${result.reaped ?? 0} 个空闲会话（运行中的会话不受影响）`,
          });
          toast.success("已回收空闲会话", { description: `reaped ${result.reaped ?? 0}` });
          void channelSessions.refetch();
        },
        onError: (error) => {
          setEvidence({ tone: "bad", title: "回收失败", detail: error.message });
          toast.error("回收失败", { description: error.message });
        },
        onSettled: () => setConfirm(null),
      },
    );
  };

  const runTerminalEnd = (control: Extract<LongTaskControl, { kind: "terminal-end" }>) => {
    const session = control.session;
    endMutation.mutate(
      { sid: session.sessionId },
      {
        onSuccess: (result) => {
          setEvidence({
            tone: result.ended ? "ok" : "bad",
            title: result.ended ? "已结束终端会话" : "终端会话未结束",
            detail: `sid ${result.sid} · ended=${result.ended}`,
          });
          if (result.ended) toast.success("已结束终端会话", { description: result.sid });
          else toast.error("会话未结束", { description: result.sid });
          void terminalSessions.refetch();
        },
        onError: (error) => {
          setEvidence({ tone: "bad", title: "结束失败", detail: error.message });
          toast.error("结束会话失败", { description: error.message });
        },
        onSettled: () => setConfirm(null),
      },
    );
  };

  // --- Render -----------------------------------------------------------------

  const list = (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="任务监督"
          sub="跨 Chat / IM 渠道 / 终端 / 恢复合成的受监督长任务；只展示真实状态，不把静默或子代理 fan-out 当作失败。"
          action={
            <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching}>
              <RefreshCw className={cn(isFetching && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <StatTile icon={<Activity />} label="运行中" value={counts.active} sub="running / streaming" />
          <StatTile icon={<Timer />} label="等待" value={counts.waiting} sub="queued / idle / pending（非失败）" />
          <StatTile icon={<AlertTriangle />} label="需关注" value={counts.attention} sub="failed / degraded" />
          <StatTile icon={<Workflow />} label="证据源" value={4} sub="Chat / IM / Terminal / Recovery" />
        </div>

        <div
          className="flex flex-wrap gap-1 border-t border-line px-3 py-2"
          role="tablist"
          aria-label="任务监督过滤"
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
              title="无法加载任务监督证据"
              description="四个证据源都不可用，请确认后端在线后重试。"
              action={
                <Button variant="outline" size="sm" onClick={refetchAll}>
                  重试
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="没有匹配的任务"
              description={
                filter === "all"
                  ? "当前没有受监督任务证据。切换过滤或刷新。"
                  : "切换过滤查看其它状态的长任务。"
              }
              icon={<Timer />}
            />
          ) : (
            visible.map((row) => {
              const Icon = ROW_ICON[row.icon];
              return (
                <Row
                  key={row.id}
                  icon={<Icon />}
                  iconClass={toneIconClass(row.tone)}
                  title={row.title}
                  subtitle={`${row.sourceLabel} · ${formatTime(row.updatedAt)}`}
                  trailing={
                    <>
                      <ToneBadge tone={row.tone}>{STATUS_LABEL[row.status]}</ToneBadge>
                      {row.control && <span className="text-xs text-muted">可控</span>}
                    </>
                  }
                  onClick={() => selectRow(row.id)}
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
      row={selected}
      pending={pending}
      evidence={evidence}
      onClose={() => setDetailOpen(false)}
      onDeepLink={(to) => navigate(to)}
      onControl={(control) => {
        setEvidence(null);
        if (control.kind === "channel-kill") {
          setConfirm({ kind: "channel-kill", row: selected, poolKey: control.poolKey, sessionId: control.sessionId });
        } else if (control.kind === "channel-reap") {
          setConfirm({ kind: "channel-reap" });
        } else {
          setConfirm({ kind: "terminal-end", row: selected, control });
        }
      }}
    />
  ) : (
    <div className="p-4">
      <EmptyState title="未选择任务" description="从左侧列表选择一个任务查看证据。" icon={<Workflow />} />
    </div>
  );

  return (
    <>
      <ListDetailLayout list={list} detail={detail} detailOpen={detailOpen} />

      {/* Channel stop confirmation */}
      <Dialog open={confirm?.kind === "channel-kill"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>停止渠道 Agent 会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            停止会立即结束该持久 Agent 会话进程，进行中的回合会被中断。这是唯一的权威停止操作。确认停止
            {confirm?.kind === "channel-kill" && (
              <code className="mx-1 rounded-sm bg-panel-3 px-1 py-0.5 font-mono text-xs">
                {confirm.sessionId} · {confirm.poolKey}
              </code>
            )}
            ？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => confirm?.kind === "channel-kill" && runChannelKill(confirm.poolKey, confirm.sessionId)}
            >
              {killMutation.isPending ? "停止中…" : "确认停止"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel reap confirmation */}
      <Dialog open={confirm?.kind === "channel-reap"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <Timer />
            </span>
            <DialogTitle>回收空闲渠道会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            将按空闲超时策略回收闲置的持久会话。正在运行的会话不受影响。确认回收？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={runChannelReap} disabled={pending}>
              {killMutation.isPending ? "回收中…" : "确认回收"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminal end confirmation */}
      <Dialog open={confirm?.kind === "terminal-end"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>结束终端会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            结束会话会终止其底层 PTY 进程，未保存的运行状态将丢失。确认结束
            {confirm?.kind === "terminal-end" && (
              <code className="mx-1 rounded-sm bg-panel-3 px-1 py-0.5 font-mono text-xs">
                {confirm.control.session.title || confirm.control.session.sessionId}
              </code>
            )}
            ？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => confirm?.kind === "terminal-end" && runTerminalEnd(confirm.control)}
            >
              {endMutation.isPending ? "结束中…" : "确认结束"}
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
  row,
  pending,
  evidence,
  onClose,
  onDeepLink,
  onControl,
}: {
  row: LongTaskRow;
  pending: boolean;
  evidence: { tone: "ok" | "bad"; title: string; detail: string } | null;
  onClose: () => void;
  onDeepLink: (to: string) => void;
  onControl: (control: LongTaskControl) => void;
}) {
  const Icon = ROW_ICON[row.icon];
  return (
    <div className="grid">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4",
            toneIconClass(row.tone),
          )}
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-md font-semibold text-ink-strong">{row.title}</h3>
          <span className="block truncate text-sm text-subtle">{row.sourceLabel}</span>
        </div>
        <ToneBadge tone={row.tone}>{STATUS_LABEL[row.status]}</ToneBadge>
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
        <p className="text-sm text-muted">{row.summary}</p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">原始状态 {row.rawStatus}</Badge>
          <Badge variant="outline">更新 {formatTime(row.updatedAt)}</Badge>
        </div>

        {/* Supervision boundary note */}
        <div className="rounded-sm border border-line bg-panel-2 p-3 text-xs text-muted">
          受监督任务以结构化状态和最近证据为准。TUI 静默或子代理 fan-out 不代表失败。本页唯一的权威写操作是
          停止 / 回收渠道会话与结束终端会话；暂停 / 重试 / 重启请前往所属域处理。
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
          <span className="mb-1.5 block text-xs font-medium text-subtle">证据 / Trace</span>
          <dl className="grid gap-px overflow-hidden rounded-sm border border-line bg-line">
            {row.evidence.map((e, i) => (
              <div key={`${e.label}-${i}`} className="grid grid-cols-[110px_1fr] gap-2 bg-panel px-3 py-2">
                <dt className="truncate text-xs text-subtle">{e.label}</dt>
                <dd className="break-words text-sm text-ink-strong">{e.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Controls */}
        <div className="grid gap-2 border-t border-line pt-3">
          {row.control ? (
            row.control.kind === "channel-kill" ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => onControl(row.control as LongTaskControl)}
              >
                <XCircle />
                停止会话（权威）
              </Button>
            ) : row.control.kind === "terminal-end" ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => onControl(row.control as LongTaskControl)}
              >
                <XCircle />
                结束终端会话（权威）
              </Button>
            ) : null
          ) : (
            <p className="text-xs text-subtle">此来源没有权威的页内控制，请使用下方深链到所属域操作。</p>
          )}
          <Button variant="outline" size="sm" onClick={() => onDeepLink(row.to)}>
            <ExternalLink />
            {row.toLabel}
            <ArrowUpRight className="ml-auto" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LongTasksPage;
