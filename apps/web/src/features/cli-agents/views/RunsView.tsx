import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ExternalLink,
  MessageSquare,
  RadioTower,
  RefreshCw,
  Square,
  SquareTerminal,
  Trash2,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
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
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { agentsKeys, useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { useDeleteTerminalSessionMutation, useEndTerminalSessionMutation } from "@/lib/query/terminal";

import type { AgentRuntimeRunSource, AgentRuntimeRunSummary, CliAgentsViewProps, WorkbenchTone } from "../types";
import { Panel, PanelHead, StatTile, ToneBadge, formatTime, toneIconClass } from "./_shared";

const SOURCE_LABEL: Record<AgentRuntimeRunSource, string> = {
  terminal: "终端",
  "im-channel": "IM",
  chat: "对话",
};

type RunFilter = "all" | "running" | "failed" | AgentRuntimeRunSource;

const FILTERS: ReadonlyArray<{ id: RunFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "running", label: "运行中" },
  { id: "failed", label: "异常" },
  { id: "terminal", label: "终端" },
  { id: "im-channel", label: "IM" },
  { id: "chat", label: "对话" },
];

function sourceIcon(source: AgentRuntimeRunSource): React.ReactNode {
  if (source === "terminal") return <SquareTerminal className="size-4" />;
  if (source === "im-channel") return <RadioTower className="size-4" />;
  return <MessageSquare className="size-4" />;
}

function runTone(run: AgentRuntimeRunSummary): WorkbenchTone {
  if (run.status === "failed" || run.status === "lost" || run.status === "aborted") return "bad";
  if (run.status === "running") return "ok";
  if (run.status === "detached") return "warn";
  if (run.status === "idle") return "info";
  return "mute";
}

function targetHref(run: AgentRuntimeRunSummary): string {
  if (run.primaryHref) return run.primaryHref;
  const first = run.evidenceRefs.find((ref) => ref.href)?.href;
  if (first) return first;
  if (run.source === "terminal") return "#/workspace?mode=terminal";
  if (run.source === "im-channel") return "#/im-channels?view=sessions";
  return "#/chat";
}

function rowMatchesFilter(run: AgentRuntimeRunSummary, filter: RunFilter): boolean {
  if (filter === "all") return true;
  if (filter === "running") return run.status === "running";
  if (filter === "failed") return run.status === "failed" || run.status === "lost" || run.status === "aborted";
  return run.source === filter;
}

function rowMatchesSearch(run: AgentRuntimeRunSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    run.title,
    run.sourceLabel,
    run.originId,
    run.agentId,
    run.cli,
    run.model,
    run.providerId,
    run.routeScope,
    run.workspace,
    run.statusLabel,
    run.lastErrorSummary,
    run.actionLabel,
    run.actionReason,
    ...run.evidenceRefs.map((ref) => `${ref.kind} ${ref.label}`),
    ...Object.values(run.metadata).map((value) => String(value ?? "")),
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

function visibleRows(rows: AgentRuntimeRunSummary[], filter: RunFilter, query: string): AgentRuntimeRunSummary[] {
  return rows.filter((run) => rowMatchesFilter(run, filter) && rowMatchesSearch(run, query));
}

function metadataText(run: AgentRuntimeRunSummary): string {
  const refs = run.evidenceRefs.map((ref) => ref.label).filter(Boolean);
  const origin = run.originId && !refs.includes(run.originId) ? [run.originId] : [];
  return [...origin, ...refs].slice(0, 2).join(" · ");
}

/**
 * Unified Agent Run view. This is intentionally a projection, not a fourth
 * owning runtime: Workspace terminal sessions, IM agent sessions and chat sessions keep
 * their original owners while CLI Agents becomes the operator's runtime list.
 */
export function RunsView(_props: CliAgentsViewProps) {
  const runs = useAgentRuntimeRunsQuery();
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<RunFilter>("all");
  const [query, setQuery] = React.useState("");
  const [stopTarget, setStopTarget] = React.useState<AgentRuntimeRunSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AgentRuntimeRunSummary | null>(null);
  const rows = runs.data?.runs ?? [];
  const filteredRows = visibleRows(rows, filter, query);
  const actionRows = rows.filter((run) =>
    run.status === "failed" || run.status === "lost" || run.status === "aborted" || run.canStop || run.canDelete,
  ).slice(0, 5);
  const totals = runs.data?.totals;

  const refreshRuns = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: agentsKeys.runtimeRuns() });
    void runs.refetch();
  }, [queryClient, runs]);

  const endSession = useEndTerminalSessionMutation({
    onSuccess: (result) => {
      toast.success(result.ended ? "已停止 Agent 终端会话" : "会话无需停止", {
        description: result.sid,
      });
      setStopTarget(null);
      refreshRuns();
    },
    onError: (error) => toast.error("停止失败", { description: error.message }),
  });

  const deleteSession = useDeleteTerminalSessionMutation({
    onSuccess: (_result, sessionId) => {
      toast.success("已删除终端会话记录", { description: sessionId });
      setDeleteTarget(null);
      refreshRuns();
    },
    onError: (error) => toast.error("删除失败", { description: error.message }),
  });

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="运行中 / Agent Runs"
          sub="统一展示终端来源、IM 渠道、对话三类 Agent 运行状态；只对 Agent 终端会话提供安全 stop/delete。"
          action={
            <Button variant="outline" size="sm" onClick={() => void runs.refetch()}>
              <RefreshCw />
              刷新
            </Button>
          }
        />
        <div className="flex flex-wrap overflow-hidden border-b border-line bg-panel-2/40">
          <StatTile icon={<Activity />} label="全部 Run" value={totals?.total ?? "—"} />
          <StatTile icon={<Activity />} label="运行中" value={totals?.running ?? "—"} />
          <StatTile icon={<SquareTerminal />} label="终端来源" value={totals?.terminal ?? "—"} />
          <StatTile icon={<RadioTower />} label="IM" value={totals?.imChannel ?? "—"} />
          <StatTile icon={<MessageSquare />} label="对话" value={totals?.chat ?? "—"} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 run / 模型 / 目录 / 错误 / session"
            className="min-w-0 flex-1 basis-[220px] sm:max-w-[420px]"
          />
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              variant={filter === item.id ? "primary" : "outline"}
              size="sm"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="p-4">
          {runs.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : runs.error ? (
            <ErrorState
              title="Agent Run 聚合不可用"
              description={runs.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void runs.refetch()}>
                  重试
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="暂无 Agent Run"
              description="启动 CLI 终端、触发 IM 任务或打开对话后会出现在这里。"
            />
          ) : filteredRows.length === 0 ? (
            <EmptyState title="当前筛选无结果" description="调整搜索关键词、切换筛选或刷新后再看。" />
          ) : (
            <div className="overflow-hidden rounded-md border border-line bg-panel shadow-sm" role="table" aria-label="Agent Runs">
              <div
                className="hidden border-b border-line bg-panel-2 px-4 py-2 text-xs font-semibold uppercase tracking-[.06em] text-subtle lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(84px,.45fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(150px,.8fr)] lg:gap-3"
                role="row"
              >
                <span role="columnheader">Run</span>
                <span role="columnheader">状态</span>
                <span role="columnheader">模型 / Agent</span>
                <span role="columnheader">工作目录</span>
                <span role="columnheader">更新时间</span>
                <span className="text-right" role="columnheader">操作</span>
              </div>
              <div className="divide-y divide-line" role="rowgroup">
                {filteredRows.map((run) => {
                  const tone = runTone(run);
                  const href = targetHref(run);
                  return (
                    <div
                      key={run.id}
                      className="grid min-w-0 gap-3 px-4 py-3 transition-colors hover:bg-panel-2 lg:grid-cols-[minmax(0,2fr)_minmax(84px,.45fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(150px,.8fr)] lg:items-center"
                      role="row"
                    >
                      <div className="flex min-w-0 items-start gap-3" role="cell">
                        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${toneIconClass(tone)}`}>
                          {sourceIcon(run.source)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-ink-strong">{run.title}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-muted">
                            <span>{run.sourceLabel || SOURCE_LABEL[run.source]}</span>
                            {run.cli ? <span>· {run.cli}</span> : null}
                            {run.model ? <span>· {run.model}</span> : null}
                            <span className="lg:hidden">· {formatTime(run.updatedAt)}</span>
                          </div>
                          {run.lastErrorSummary ? (
                            <div className="mt-1 truncate text-sm text-red">
                              {run.lastErrorSummary}
                            </div>
                          ) : null}
                          <div className="mt-1 truncate text-xs text-subtle">
                            {run.actionLabel} · {run.actionReason}
                            {metadataText(run) ? ` · ${metadataText(run)}` : ""}
                          </div>
                        </div>
                      </div>
                      <div role="cell">
                        <ToneBadge tone={tone}>{run.statusLabel}</ToneBadge>
                      </div>
                      <div className="hidden min-w-0 lg:block" role="cell">
                        <div className="truncate text-sm text-ink">{run.model || run.cli || run.agentId || "—"}</div>
                        <div className="truncate text-xs text-subtle">{run.routeScope || "默认路由"}</div>
                      </div>
                      <div className="hidden min-w-0 truncate text-sm text-muted lg:block" title={run.workspace || undefined} role="cell">
                        {run.workspace || "—"}
                      </div>
                      <div className="hidden min-w-0 truncate text-sm text-muted lg:block" role="cell">
                        {formatTime(run.updatedAt)}
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end" role="cell">
                        <Button variant="outline" size="sm" onClick={() => (window.location.hash = href)}>
                          打开
                          <ExternalLink />
                        </Button>
                        {run.canStop ? (
                          <Button variant="outline" size="sm" onClick={() => setStopTarget(run)}>
                            <Square />
                            停止
                          </Button>
                        ) : null}
                        {run.canDelete ? (
                          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(run)}>
                            <Trash2 />
                            删除
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="待处理操作"
          sub="失败、可停止、可删除的 Run 会出现在这里；正常历史不占首屏。"
          action={<ToneBadge tone={actionRows.length > 0 ? "warn" : "ok"}>{actionRows.length} 项</ToneBadge>}
        />
        {runs.isLoading ? (
          <div className="p-3"><SkeletonRow /></div>
        ) : actionRows.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted">当前没有需要处理的 Agent Run。</div>
        ) : (
          <div className="divide-y divide-line">
            {actionRows.map((run) => {
              const href = targetHref(run);
              const tone = runTone(run);
              return (
                <div key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-md ${toneIconClass(tone)}`}>{sourceIcon(run.source)}</span>
                  <span className="min-w-0 flex-1 basis-[180px]">
                    <strong className="block truncate text-sm text-ink-strong">{run.title}</strong>
                    <span className="block truncate text-xs text-muted">{run.actionLabel} · {run.lastErrorSummary || run.actionReason}</span>
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {run.canStop ? (
                      <Button variant="outline" size="sm" onClick={() => setStopTarget(run)}><Square />停止</Button>
                    ) : null}
                    {run.canDelete ? (
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(run)}><Trash2 />删除</Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => (window.location.hash = href)}>打开<ExternalLink /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Dialog open={Boolean(stopTarget)} onOpenChange={(open) => !open && setStopTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>停止 Agent 终端会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            将请求后端结束会话 <span className="font-mono text-ink">{stopTarget?.originId}</span>。
            这只适用于 CLI Agents 识别出的 Codex / Claude Code / OpenCode 终端会话。
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopTarget(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={!stopTarget || endSession.isPending}
              onClick={() => stopTarget && endSession.mutate({ sid: stopTarget.originId })}
            >
              确认停止
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除终端会话记录</DialogTitle>
          </DialogHeader>
          <DialogBody>
            将删除已结束/失败的持久化记录 <span className="font-mono text-ink">{deleteTarget?.originId}</span>。
            活跃会话不会被删除，需先停止。
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={!deleteTarget || deleteSession.isPending}
              onClick={() => deleteTarget && deleteSession.mutate(deleteTarget.originId)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RunsView;
