import * as React from "react";
import { Activity, Clock3, MessageSquare, RadioTower, RefreshCw, ScrollText, Server, ShieldCheck, Workflow } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import {
  useChannelConnectorsDaemonConfigQuery,
  useChannelConnectorsDaemonLogsQuery,
  useChannelConnectorsStatusQuery,
  useChannelConnectorsV3ConfigQuery,
} from "@/lib/query/channel-connectors";
import type {
  ChannelConnectorAccount,
  ChannelConnectorsDaemonRuntimeStatus,
} from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { DaemonServicePanel } from "./DaemonServicePanel";
import { Panel, PanelHead, Row, formatTime } from "@/design/ui/panel";
import { CountChip, StatusDot } from "./_shared";

function connectionState(
  account: ChannelConnectorAccount,
  runtime: ChannelConnectorsDaemonRuntimeStatus | null | undefined,
): { label: string; variant: "ok" | "warn" | "mute" | "info"; detail: string; receivedAt: string | null } {
  if (account.lifecycle !== "enabled") return { label: account.lifecycle === "draft" ? "草稿" : "停用", variant: "mute", detail: "没有活动连接", receivedAt: null };
  if (runtime?.reachable !== true) return { label: "守护离线", variant: "warn", detail: runtime?.error || "管理端点不可达", receivedAt: null };
  if (account.platform === "feishu") {
    const item = runtime.feishuConnectionDetails.find((connection) => connection.accountId === account.id || connection.externalAccountId === account.externalAccountId);
    if (!item) return { label: "未加载", variant: "info", detail: "配置已保存但运行时尚未建立连接", receivedAt: null };
    if (!item.connected) return { label: "异常", variant: "warn", detail: item.lastError || item.state, receivedAt: item.lastReceivedAt };
    if (!item.ingressVerified) return { label: "等待首条消息", variant: "warn", detail: "长连接在线；检查事件订阅、应用发布与机器人权限", receivedAt: item.lastReceivedAt };
    return { label: "接收中", variant: "ok", detail: `SDK ${item.state} · ${item.botName || item.botOpenId || "bot"}`, receivedAt: item.lastReceivedAt };
  }
  const item = runtime.octoConnectionDetails.find((connection) => connection.accountId === account.id || connection.externalAccountId === account.externalAccountId);
  if (!item) return { label: "未加载", variant: "info", detail: "配置已保存但运行时尚未建立连接", receivedAt: null };
  return item.connected
    ? { label: "接收中", variant: "ok", detail: `${item.receivedMessages} 条消息 · 重连 ${item.reconnects} 次`, receivedAt: item.lastConnectedAt }
    : { label: "异常", variant: "warn", detail: item.lastError || item.restHeartbeatLastError || item.state, receivedAt: item.lastDisconnectedAt };
}

function isProblem(line: string): boolean {
  return /\b(error|failed|failure|exception|fatal|timeout|denied|warn|502|500|401|403)\b/i.test(line);
}

function truncate(line: string, max = 260): string {
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

export function V3RuntimeView({ goToView, selectedAccount }: ChannelConnectorsViewProps) {
  const statusQuery = useChannelConnectorsStatusQuery({ refetchInterval: 8_000 });
  const configQuery = useChannelConnectorsV3ConfigQuery();
  const daemonConfigQuery = useChannelConnectorsDaemonConfigQuery();
  const logsQuery = useChannelConnectorsDaemonLogsQuery();
  const [showRawLogs, setShowRawLogs] = React.useState(false);
  const [showRuntimeConfig, setShowRuntimeConfig] = React.useState(false);
  const selectedRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (selectedAccount) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [selectedAccount, configQuery.dataUpdatedAt]);

  const loading = statusQuery.isLoading || configQuery.isLoading || daemonConfigQuery.isLoading || logsQuery.isLoading;
  const error = statusQuery.error ?? configQuery.error ?? daemonConfigQuery.error ?? logsQuery.error;
  if (loading) return <div className="grid gap-4" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  if (error || !configQuery.data) return <ErrorState title="无法加载运行中心" description={error?.message || "v3 配置不可用"} action={<Button variant="outline" size="sm" onClick={() => { void statusQuery.refetch(); void configQuery.refetch(); void daemonConfigQuery.refetch(); void logsQuery.refetch(); }}>重试</Button>} />;

  const status = statusQuery.data;
  const runtime = status?.runtime;
  const accounts = configQuery.data.config.accounts.map((account) => ({ account, state: connectionState(account, runtime) })).sort((left, right) => Number(right.account.id === selectedAccount) - Number(left.account.id === selectedAccount));
  const issues = accounts.filter(({ state }) => state.variant === "warn").length;
  const enabledCount = accounts.filter(({ account }) => account.lifecycle === "enabled").length;
  const receivingCount = accounts.filter(({ state }) => state.variant === "ok").length;
  const ingress = runtime?.ingressQueue;
  const reload = runtime?.reload;
  const lines = logsQuery.data?.lines ?? [];
  const problemLines = lines.filter(isProblem).slice(-10).reverse();
  const runtimeBindings = daemonConfigQuery.data?.config.projects.flatMap((project) => project.platformBindings.map((binding) => ({ project, binding }))) ?? [];

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold text-ink-strong">运行中心</h2><p className="text-sm text-muted">按渠道账号观察连接、入站队列、热重载、回复投递与日志。</p></div>
        <Button variant="outline" size="sm" disabled={statusQuery.isFetching} onClick={() => { void statusQuery.refetch(); void logsQuery.refetch(); }}><RefreshCw className={statusQuery.isFetching ? "animate-spin" : undefined} />刷新</Button>
      </div>

      <MetricRail>
        <MetricTile label="接收中账号" value={`${receivingCount}/${enabledCount}`} hint="真实入站已验证 / 已启用" tone={issues > 0 ? "warn" : "default"} icon={<RadioTower />} />
        <MetricTile label="入站排队" value={ingress?.queued ?? 0} hint={`${ingress?.duplicates ?? 0} 条重复事件已拦截`} tone={(ingress?.queued ?? 0) > 0 ? "warn" : "default"} icon={<Workflow />} />
        <MetricTile label="回复待发送" value={runtime?.replyOutbox.pending ?? 0} hint={`${runtime?.replyOutbox.deadLetter ?? 0} 条死信`} tone={(runtime?.replyOutbox.deadLetter ?? 0) > 0 ? "warn" : "default"} icon={<MessageSquare />} />
        <MetricTile label="待恢复任务" value={runtime?.pendingAgentRuns.count ?? 0} hint="进程中断后待恢复的 Agent 任务" tone={(runtime?.pendingAgentRuns.count ?? 0) > 0 ? "warn" : "default"} icon={<Clock3 />} />
      </MetricRail>

      <Panel>
        <PanelHead title="账号连接" sub={issues ? `${issues} 个账号需要处理` : "启用账号按一账号一连接运行"} chip={<CountChip tone={issues > 0 ? "warn" : "ok"}>{receivingCount}/{enabledCount} 接收中</CountChip>} action={<Button variant="ghost" size="sm" onClick={() => goToView("accounts")}><RadioTower />渠道账号</Button>} />
        {accounts.length === 0 ? <div className="p-4"><EmptyState title="暂无渠道账号" description="创建账号后，这里会显示连接与真实入站状态。" /></div> : <div className="divide-y divide-line">{accounts.map(({ account, state }) => (
          <div key={account.id} ref={account.id === selectedAccount ? selectedRef : undefined} className={account.id === selectedAccount ? "bg-primary-soft" : undefined}>
            <Row icon={<RadioTower />} iconClass={state.variant === "ok" ? "bg-success-soft text-success" : state.variant === "warn" ? "bg-warning-soft text-warning" : undefined} title={account.displayName} subtitle={`${account.platform} · ${state.detail}${state.receivedAt ? ` · ${formatTime(state.receivedAt)}` : ""}`} subtitleClassName="whitespace-normal break-words" trailing={<span className="flex items-center gap-2"><StatusDot tone={state.variant} pulse={state.variant === "ok"} /><Badge variant={state.variant}>{state.label}</Badge></span>} onClick={() => goToView("accounts", { account: account.id })} />
          </div>
        ))}</div>}
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Panel>
          <PanelHead title="入站与去重" sub="平台回调先快速入队，再由工作区调度器消费。" chip={<CountChip tone={(ingress?.queued ?? 0) > 0 ? "warn" : "ok"}>{ingress?.queued ?? 0} 排队</CountChip>} />
          <div className="divide-y divide-line">
            <Row icon={<Workflow />} title="当前排队" subtitle={`${ingress?.activeAccounts ?? 0} 个账号正在消费`} trailing={<Badge variant={(ingress?.queued ?? 0) > 0 ? "warn" : "ok"}>{ingress?.queued ?? 0}</Badge>} />
            <Row icon={<Activity />} title="完成 / 失败" subtitle={`${ingress?.completed ?? 0} 已完成`} trailing={<Badge variant={(ingress?.failed ?? 0) > 0 ? "warn" : "mute"}>{ingress?.failed ?? 0} 失败</Badge>} />
            <Row icon={<ShieldCheck />} title="重复事件" subtitle="按账号 + event/message ID 做 TTL 去重" trailing={<Badge variant="info">{ingress?.duplicates ?? 0} 已拦截</Badge>} />
            <Row icon={<Clock3 />} title="待恢复 Agent 任务" subtitle={runtime?.pendingAgentRuns.oldestQueuedAt ? `最早 ${formatTime(runtime.pendingAgentRuns.oldestQueuedAt)}` : "没有因进程中断而待恢复的任务"} trailing={<Badge variant={(runtime?.pendingAgentRuns.count ?? 0) > 0 ? "warn" : "ok"}>{runtime?.pendingAgentRuns.count ?? 0}</Badge>} />
            <Row icon={<MessageSquare />} title="回复 Outbox" subtitle={runtime?.replyOutbox.oldestPendingAt ? `最早待发送 ${formatTime(runtime.replyOutbox.oldestPendingAt)}` : `${runtime?.replyOutbox.delivered ?? 0} 条已投递`} trailing={<Badge variant={(runtime?.replyOutbox.deadLetter ?? 0) > 0 ? "warn" : (runtime?.replyOutbox.pending ?? 0) > 0 ? "info" : "ok"}>{runtime?.replyOutbox.pending ?? 0} 待发送 · {runtime?.replyOutbox.deadLetter ?? 0} 死信</Badge>} />
          </div>
        </Panel>
        <Panel>
          <PanelHead title="配置热重载" sub="规则与工作区更新不会重启平台连接或中断当前回合。" chip={<CountChip tone={(runtime?.activeRuns ?? 0) > 0 ? "info" : "mute"}>{runtime?.activeRuns ?? 0} 进行中</CountChip>} />
          <div className="divide-y divide-line">
            <Row icon={<RefreshCw />} title="最近重载" subtitle={reload?.error || (reload?.appliedAt ? `应用于 ${formatTime(reload.appliedAt)}` : "尚无重载记录")} trailing={<Badge variant={reload?.status === "failed" || reload?.status === "restart-required" ? "warn" : reload?.status === "applied" ? "ok" : "mute"}>{reload?.status || "未记录"}</Badge>} />
            <Row icon={<Activity />} title="进行中任务" subtitle="普通 resolver 更新可立即应用；连接参数按账号重连" trailing={<Badge variant={(runtime?.activeRuns ?? 0) > 0 ? "info" : "mute"}>{runtime?.activeRuns ?? 0}</Badge>} />
            <Row icon={<Server />} title="进程边界" subtitle="管理端口、状态目录变化才要求全局重启" trailing={<Badge variant="outline">明确提示</Badge>} />
          </div>
        </Panel>
      </div>

      {(runtime?.replyOutbox.recentDeadLetters.length ?? 0) > 0 && <Panel>
        <PanelHead title="回复死信" sub="永久失败或超过重试上限的回复；不包含回复正文和凭据。" chip={<CountChip tone="warn">{runtime?.replyOutbox.recentDeadLetters.length ?? 0} 条</CountChip>} />
        <div className="divide-y divide-line">{runtime?.replyOutbox.recentDeadLetters.map((record) => <Row key={record.id} icon={<MessageSquare />} iconClass="bg-warning-soft text-warning" title={`${record.platform} · ${record.accountId}`} subtitle={`${record.lastError || "投递失败"} · ${formatTime(record.updatedAt)}`} trailing={<span className="flex items-center gap-2"><StatusDot tone="warn" /><Badge variant="warn">{record.attempts} 次</Badge></span>} />)}</div>
      </Panel>}

      <DaemonServicePanel />

      <Panel>
        <PanelHead title="运行时映射证据" sub="运行期映射由渠道账号、分发策略与 Agent 工作区生成，不是独立的用户配置对象。" chip={<CountChip tone={runtimeBindings.length > 0 ? "ok" : "mute"}>{runtimeBindings.length} 条映射</CountChip>} action={<Button variant="ghost" size="sm" onClick={() => setShowRuntimeConfig((value) => !value)}>{showRuntimeConfig ? "收起" : "展开"}</Button>} />
        {showRuntimeConfig && <div className="divide-y divide-line">{runtimeBindings.length ? runtimeBindings.map(({ project, binding }) => <Row key={`${project.id}:${binding.id}`} icon={<Workflow />} title={binding.displayName || binding.id} subtitle={`${binding.platform} · ${project.name || project.id} · ${project.workDir}`} trailing={<Badge variant={binding.enabled ? "ok" : "mute"}>{binding.enabled ? "启用" : "停用"}</Badge>} />) : <div className="p-4"><EmptyState title="暂无运行时映射" description="保存并应用渠道账号后，这里会显示生成的运行时映射。" /></div>}</div>}
      </Panel>

      <Panel>
        <PanelHead title="守护日志" sub={logsQuery.data?.logFile || "daemon log"} chip={<CountChip tone={problemLines.length > 0 ? "warn" : "mute"}>{lines.filter(isProblem).length} 问题行</CountChip>} action={<div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setShowRawLogs((value) => !value)}>{showRawLogs ? "收起原始日志" : "原始日志"}</Button><Button variant="outline" size="sm" onClick={() => void logsQuery.refetch()}><RefreshCw />刷新</Button></div>} />
        {lines.length === 0 ? <div className="p-4"><EmptyState title="暂无日志" description="守护进程尚未输出日志。" icon={<ScrollText />} /></div> : <div className="grid gap-3 p-3">
          <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-sm border border-line bg-panel-2 p-3"><div className="text-xs text-subtle">日志行数</div><div className="text-lg font-semibold text-ink-strong">{lines.length}</div></div><div className="rounded-sm border border-line bg-panel-2 p-3"><div className="text-xs text-subtle">问题行</div><div className="text-lg font-semibold text-ink-strong">{lines.filter(isProblem).length}</div></div><div className="rounded-sm border border-line bg-panel-2 p-3"><div className="text-xs text-subtle">最新输出</div><div className="truncate text-sm text-muted">{truncate(lines.at(-1) || "—", 110)}</div></div></div>
          {problemLines.map((line, index) => <code key={`${index}:${line}`} className="block max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-warning-line bg-warning-soft px-3 py-2 font-mono text-xs text-warning">{truncate(line)}</code>)}
          {showRawLogs && <pre className="max-h-[min(52vh,520px)] overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-panel-2 p-3 font-mono text-xs text-muted">{lines.slice(-180).join("\n")}</pre>}
        </div>}
      </Panel>
    </div>
  );
}
