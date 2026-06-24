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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design/ui/table";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { agentsKeys, useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { useDeleteTerminalSessionMutation, useEndTerminalSessionMutation } from "@/lib/query/terminal";

import type { AgentRuntimeRunSource, AgentRuntimeRunSummary, CliAgentsViewProps, WorkbenchTone } from "../types";
import { Fact, Panel, PanelHead, StatTile, ToneBadge, formatTime, toneIconClass } from "./_shared";

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
  if (run.source === "terminal") return "#/ide";
  if (run.source === "im-channel") return "#/im-channels?view=sessions";
  return "#/chat";
}

function visibleRows(rows: AgentRuntimeRunSummary[], filter: RunFilter): AgentRuntimeRunSummary[] {
  if (filter === "all") return rows;
  if (filter === "running") return rows.filter((run) => run.status === "running");
  if (filter === "failed") return rows.filter((run) => run.status === "failed" || run.status === "lost" || run.status === "aborted");
  return rows.filter((run) => run.source === filter);
}

function metadataText(run: AgentRuntimeRunSummary): string {
  const refs = run.evidenceRefs.map((ref) => ref.label).filter(Boolean);
  const origin = run.originId && !refs.includes(run.originId) ? [run.originId] : [];
  return [...origin, ...refs].slice(0, 2).join(" · ");
}

/**
 * Unified Agent Run view. This is intentionally a projection, not a fourth
 * owning runtime: IDE terminal sessions, IM agent sessions and chat sessions keep
 * their original owners while CLI Agents becomes the operator's runtime list.
 */
export function RunsView(_props: CliAgentsViewProps) {
  const runs = useAgentRuntimeRunsQuery();
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<RunFilter>("all");
  const [stopTarget, setStopTarget] = React.useState<AgentRuntimeRunSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AgentRuntimeRunSummary | null>(null);
  const rows = runs.data?.runs ?? [];
  const filteredRows = visibleRows(rows, filter);
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
        <div className="grid grid-cols-2 gap-2.5 border-b border-line p-4 sm:grid-cols-5">
          <StatTile icon={<Activity />} label="全部 Run" value={totals?.total ?? "—"} />
          <StatTile icon={<Activity />} label="运行中" value={totals?.running ?? "—"} />
          <StatTile icon={<SquareTerminal />} label="终端来源" value={totals?.terminal ?? "—"} />
          <StatTile icon={<RadioTower />} label="IM" value={totals?.imChannel ?? "—"} />
          <StatTile icon={<MessageSquare />} label="对话" value={totals?.chat ?? "—"} />
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              variant={filter === item.id ? "primary" : "outline"}
              size="sm"
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
            <EmptyState title="当前筛选无结果" description="切换筛选或刷新后再看。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Run</TableHead>
                  <TableHead className="min-w-[120px]">状态</TableHead>
                  <TableHead className="hidden min-w-[150px] md:table-cell">模型 / Agent</TableHead>
                  <TableHead className="hidden min-w-[220px] lg:table-cell">工作目录</TableHead>
                  <TableHead className="hidden min-w-[150px] xl:table-cell">更新时间</TableHead>
                  <TableHead className="min-w-[190px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((run) => {
                  const tone = runTone(run);
                  const href = targetHref(run);
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${toneIconClass(tone)}`}>
                            {sourceIcon(run.source)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-ink-strong">{run.title}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-muted">
                              <span>{run.sourceLabel || SOURCE_LABEL[run.source]}</span>
                              {run.cli ? <span>· {run.cli}</span> : null}
                              {run.model ? <span>· {run.model}</span> : null}
                              <span className="md:hidden">· {formatTime(run.updatedAt)}</span>
                            </div>
                            {run.lastErrorSummary ? (
                              <div className="mt-1 max-w-[42rem] truncate text-sm text-red">
                                {run.lastErrorSummary}
                              </div>
                            ) : null}
                            <div className="mt-1 max-w-[42rem] truncate text-xs text-subtle">
                              {metadataText(run)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={tone}>{run.statusLabel}</ToneBadge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="text-sm text-ink">{run.model || run.cli || run.agentId || "—"}</div>
                        <div className="text-xs text-subtle">{run.routeScope || "默认路由"}</div>
                      </TableCell>
                      <TableCell className="hidden max-w-[280px] truncate lg:table-cell">
                        {run.workspace || "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">{formatTime(run.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="边界说明" sub="为什么不是把三个域硬合并成一个页面。" />
        <dl className="grid gap-2.5 p-4 sm:grid-cols-3">
          <Fact label="Model Gateway">只管理模型、Provider、协议、路由和客户端配置。</Fact>
          <Fact label="IM Channels">只管理平台账号、绑定、IM 会话和消息投递。</Fact>
          <Fact label="CLI Agents">聚合 Agent 运行态、CLI 状态和证据；不管理通用终端。</Fact>
        </dl>
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
