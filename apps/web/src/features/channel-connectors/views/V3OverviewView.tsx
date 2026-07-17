import { Activity, Bot, ChevronDown, MessageSquare, RadioTower, Route, Server, TriangleAlert } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import {
  useChannelConnectorsAgentSessionsQuery,
  useChannelConnectorsStatusQuery,
  useChannelConnectorsV3ConfigQuery,
} from "@/lib/query/channel-connectors";
import type {
  ChannelConnectorAccount,
  ChannelConnectorAgentSessionDriverRuntimeEvent,
  ChannelConnectorsDaemonRuntimeStatus,
  ChannelConnectorsV3Config,
} from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { CountChip, Panel, PanelHead, Row, StatusDot, formatTime, type StatusTone } from "./_shared";

function accountReadiness(
  account: ChannelConnectorAccount,
  config: ChannelConnectorsV3Config,
  runtime: ChannelConnectorsDaemonRuntimeStatus | null | undefined,
): { label: string; variant: "ok" | "warn" | "mute" | "info"; detail: string } {
  if (account.lifecycle !== "enabled") {
    return { label: account.lifecycle === "draft" ? "草稿" : "停用", variant: "mute", detail: "连接未启动" };
  }
  const policy = config.deliveryPolicies.find((candidate) => candidate.accountRef === account.id);
  if (!policy || !config.targets.some((target) => target.id === policy.defaultTargetRef && target.enabled)) {
    return { label: "缺少工作区", variant: "warn", detail: "账号没有可用的默认投递目标" };
  }
  if (runtime?.reachable !== true) {
    return { label: "守护离线", variant: "warn", detail: runtime?.error || "运行时不可达" };
  }
  if (account.platform === "feishu") {
    const connection = runtime.feishuConnectionDetails.find((item) => item.accountId === account.id || item.externalAccountId === account.externalAccountId);
    if (!connection) return { label: "等待加载", variant: "info", detail: "配置尚未进入运行时" };
    if (!connection.connected) return { label: "连接异常", variant: "warn", detail: connection.lastError || connection.state };
    if (!connection.ingressVerified) return { label: "等待首条消息", variant: "warn", detail: "长连接正常；需从飞书发送真实消息验证订阅、发布和权限" };
    return { label: "接入已验证", variant: "ok", detail: `最近入站 ${formatTime(connection.lastReceivedAt)}` };
  }
  const connection = runtime.octoConnectionDetails.find((item) => item.accountId === account.id || item.externalAccountId === account.externalAccountId);
  if (!connection) return { label: "等待加载", variant: "info", detail: "配置尚未进入运行时" };
  return connection.connected
    ? { label: "已连接", variant: "ok", detail: `${connection.receivedMessages} 条入站消息` }
    : { label: "连接异常", variant: "warn", detail: connection.lastError || connection.restHeartbeatLastError || connection.state };
}

function eventTitle(type: string): string {
  if (type === "turn.started") return "开始处理消息";
  if (type === "turn.finished") return "Agent 回合完成";
  if (type === "turn.failed") return "Agent 回合失败";
  if (type === "turn.fallback") return "触发备用执行路径";
  if (type === "session.created") return "创建持久会话";
  return type;
}

/** Severity of a session event; drives the row tint + status dot in the stream. */
function eventSeverity(event: ChannelConnectorAgentSessionDriverRuntimeEvent): StatusTone {
  if (event.error || event.type === "turn.failed") return "bad";
  if (event.type === "turn.fallback") return "warn";
  return "ok";
}

const severityRowClass: Record<StatusTone, string> = {
  bad: "bg-danger-soft/60",
  warn: "bg-warning-soft/60",
  ok: "",
  info: "",
  mute: "",
};

function EventEvidence({ event }: { event: ChannelConnectorAgentSessionDriverRuntimeEvent }) {
  const items: Array<{ label: string; value: string; tone?: StatusTone }> = [
    { label: "投递绑定", value: event.bindingId || "—" },
    { label: "会话标识", value: event.sessionKey || event.sessionId || event.poolKey || "—" },
    { label: "平台消息", value: event.messageId || "—" },
    { label: "执行 Agent", value: `${event.agent} · ${event.model || "网关默认"}` },
    { label: "工作目录", value: event.workDir || "—" },
    { label: "记录时间", value: formatTime(event.checkedAt) },
  ];
  return (
    <div className="grid gap-2 border-t border-line px-4 py-3 pl-9">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] items-baseline gap-2">
            <dt className="text-2xs text-subtle">{item.label}</dt>
            <dd className="truncate font-mono text-xs text-muted" title={item.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
      {event.error ? (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{event.error}</span>
        </p>
      ) : null}
      {!event.error && event.reason ? (
        <p className="break-words text-xs text-warning">{event.reason}</p>
      ) : null}
    </div>
  );
}

export function V3OverviewView({ goToView }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsV3ConfigQuery();
  const statusQuery = useChannelConnectorsStatusQuery({ refetchInterval: 10_000 });
  const sessionsQuery = useChannelConnectorsAgentSessionsQuery();
  const loading = configQuery.isLoading || statusQuery.isLoading || sessionsQuery.isLoading;
  const error = configQuery.error ?? statusQuery.error ?? sessionsQuery.error;

  if (loading) {
    return <div className="grid gap-4" role="status" aria-busy="true"><Skeleton className="h-36 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  }
  if (error || !configQuery.data) {
    return <ErrorState title="无法加载消息接入概览" description={error?.message || "v3 配置不可用"} action={<Button variant="outline" size="sm" onClick={() => { void configQuery.refetch(); void statusQuery.refetch(); void sessionsQuery.refetch(); }}>重试</Button>} />;
  }

  const config = configQuery.data.config;
  const runtime = statusQuery.data?.runtime;
  const accountStates = config.accounts.map((account) => ({ account, state: accountReadiness(account, config, runtime) }));
  const enabledAccounts = config.accounts.filter((account) => account.lifecycle === "enabled");
  const healthyAccounts = accountStates.filter(({ state }) => state.variant === "ok");
  const attentionCount = accountStates.filter(({ state }) => state.variant === "warn").length + configQuery.data.validationIssues.length;
  const activeSessions = sessionsQuery.data?.activeSessions ?? [];
  const recentEvents = sessionsQuery.data?.recentEvents.slice(0, 8) ?? [];
  const stuckCount = recentEvents.filter((event) => eventSeverity(event) !== "ok").length;
  const ingress = runtime?.ingressQueue;
  const daemonOnline = runtime?.reachable === true;
  const sessionRuntimeReachable = sessionsQuery.data?.runtimeReachable !== false;

  return (
    <div className="grid gap-[18px]">
      <section className="border-y border-line bg-panel px-4 py-4 shadow-sm sm:rounded-md sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={daemonOnline ? "ok" : "warn"}><Server className="size-3.5" />{daemonOnline ? "消息守护在线" : "消息守护离线"}</Badge>
          <Badge variant="info">配置 v3</Badge>
          <span className="ml-auto text-xs text-subtle">检查于 {formatTime(statusQuery.data?.checkedAt)}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-sm border border-line bg-panel sm:grid-cols-5">
          <div className="border-b border-r border-line p-3 sm:border-b-0"><div className="text-xs text-subtle">渠道账号</div><div className="text-xl font-semibold text-ink-strong">{enabledAccounts.length}/{config.accounts.length}</div><div className="text-xs text-muted">启用 / 全部</div></div>
          <div className="border-b border-line p-3 sm:border-b-0 sm:border-r"><div className="text-xs text-subtle">接入已验证</div><div className="text-xl font-semibold text-ink-strong">{healthyAccounts.length}</div><div className="text-xs text-muted">连接与入站</div></div>
          <div className="border-b border-r border-line p-3 sm:border-b-0"><div className="text-xs text-subtle">Agent 工作区</div><div className="text-xl font-semibold text-ink-strong">{config.targets.length}</div><div className="text-xs text-muted">{new Set(config.targets.map((target) => target.workspace.workDir)).size} 个目录</div></div>
          <div className="border-b border-line p-3 sm:border-b-0 sm:border-r"><div className="text-xs text-subtle">活跃会话</div><div className="text-xl font-semibold text-ink-strong">{activeSessions.length}</div><div className="text-xs text-muted">当前驱动池</div></div>
          <div className="col-span-2 p-3 sm:col-span-1"><div className="text-xs text-subtle">需关注</div><div className="text-xl font-semibold text-ink-strong">{attentionCount}</div><div className="text-xs text-muted">配置或运行异常</div></div>
        </div>
      </section>

      {!sessionRuntimeReachable ? (
        <div className="flex items-start gap-2 rounded-sm border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span><strong>会话运行态暂不可用。</strong>消息守护当前离线；账号与分发配置仍可查看，守护启动后会自动刷新会话数据。</span>
        </div>
      ) : null}

      <Panel>
        <PanelHead
          title="账号接入状态"
          sub="保存成功、连接成功和收到真实消息分别显示。"
          chip={<CountChip tone={healthyAccounts.length === enabledAccounts.length && enabledAccounts.length > 0 ? "ok" : attentionCount > 0 ? "warn" : "mute"}>{healthyAccounts.length}/{enabledAccounts.length} 在线</CountChip>}
          action={<Button variant="ghost" size="sm" onClick={() => goToView("accounts")}><RadioTower />管理账号</Button>}
        />
        {accountStates.length === 0 ? <div className="p-4"><EmptyState icon={<RadioTower />} title="尚未创建渠道账号" description={config.targets.length === 0 ? "先创建一个 Agent 工作区作为投递目标，再连接飞书或 Octo 账号。" : "连接飞书或 Octo 账号，把消息投递到 Agent 工作区。"} action={config.targets.length === 0 ? <Button variant="primary" size="sm" onClick={() => goToView("workspaces")}><Bot />创建工作区</Button> : <Button variant="primary" size="sm" onClick={() => goToView("accounts")}><RadioTower />创建账号</Button>} /></div> : <div className="divide-y divide-line">{accountStates.map(({ account, state }) => {
          const policy = config.deliveryPolicies.find((candidate) => candidate.accountRef === account.id);
          const target = config.targets.find((candidate) => candidate.id === policy?.defaultTargetRef);
          return <Row key={account.id} icon={<RadioTower />} iconClass={state.variant === "ok" ? "bg-success-soft text-success" : state.variant === "warn" ? "bg-warning-soft text-warning" : undefined} title={account.displayName} subtitle={`${account.platform} · ${target?.name || "未指定默认工作区"} · ${state.detail}`} trailing={<span className="flex items-center gap-2"><StatusDot tone={state.variant} pulse={state.variant === "ok"} /><Badge variant={state.variant}>{state.label}</Badge></span>} onClick={() => goToView("accounts", { account: account.id })} />;
        })}</div>}
      </Panel>

      <Panel>
        <PanelHead
          title="最近会话事件"
          sub="优先暴露失败与备用路径，便于定位接入链路；展开单行查看投递证据。"
          chip={<CountChip tone={stuckCount > 0 ? "bad" : "ok"}>{stuckCount > 0 ? `${stuckCount} 条需处理` : "链路正常"}</CountChip>}
          action={<Button variant="ghost" size="sm" onClick={() => goToView("sessions")}><MessageSquare />全部会话</Button>}
        />
        {recentEvents.length === 0 ? <div className="p-4"><EmptyState title="尚无会话事件" description="发送第一条真实消息后，这里会显示解析与执行结果。" /></div> : <div>{recentEvents.map((event, index) => {
          const severity = eventSeverity(event);
          return (
            <details key={`${event.checkedAt}:${event.type}:${index}`} className="group border-b border-line last:border-b-0">
              <summary className={`flex cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:bg-panel-2 focus-visible:shadow-[var(--ring)] [&::-webkit-details-marker]:hidden ${severityRowClass[severity]}`}>
                <StatusDot tone={severity} className="size-2.5" />
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-base text-ink-strong">{eventTitle(event.type)}</strong>
                  <span className="truncate text-sm text-muted">{event.agent} · {event.bindingId} · {event.error || event.reason || "按默认链路投递"}</span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="font-mono text-2xs text-subtle">{formatTime(event.checkedAt)}</span>
                  <ChevronDown className="size-4 text-subtle transition-transform duration-[var(--dur-2)] ease-[var(--ease-standard)] group-open:rotate-180" />
                </span>
              </summary>
              <EventEvidence event={event} />
            </details>
          );
        })}</div>}
      </Panel>

      <Panel>
        <PanelHead
          title="运行流水线"
          sub="连接、入站队列、工作区与回复状态。"
          chip={<CountChip tone={daemonOnline ? ((ingress?.queued ?? 0) > 0 ? "warn" : "ok") : "warn"}>{ingress?.queued ?? 0} 排队</CountChip>}
          action={<Button variant="ghost" size="sm" onClick={() => goToView("runtime")}><Activity />运行中心</Button>}
        />
        <div className="divide-y divide-line">
          <Row icon={<Server />} iconClass={daemonOnline ? "bg-success-soft text-success" : "bg-warning-soft text-warning"} title="账号连接" subtitle={`${runtime?.feishuConnections ?? 0} 飞书 · ${runtime?.octoConnections ?? 0} Octo`} trailing={<span className="flex items-center gap-2"><StatusDot tone={daemonOnline ? "ok" : "warn"} pulse={daemonOnline} /><Badge variant={daemonOnline ? "ok" : "warn"}>{daemonOnline ? "在线" : "离线"}</Badge></span>} />
          <Row icon={<Route />} iconClass={(ingress?.queued ?? 0) > 0 ? "bg-warning-soft text-warning" : undefined} title="入站队列" subtitle={`${ingress?.completed ?? 0} 完成 · ${ingress?.duplicates ?? 0} 重复已拦截`} trailing={<Badge variant={(ingress?.failed ?? 0) > 0 ? "warn" : "mute"}>{ingress?.queued ?? 0} 排队</Badge>} />
          <Row icon={<Bot />} title="工作区调度" subtitle="同一真实目录默认串行，跨目录可并行" trailing={<Badge variant="info">{config.targets.length}</Badge>} />
          <Row icon={<MessageSquare />} title="回复与会话" subtitle={`${runtime?.replyOutbox.pending ?? 0} 条回复待发送 · ${runtime?.replyOutbox.deadLetter ?? 0} 条死信`} trailing={<Badge variant={(runtime?.replyOutbox.deadLetter ?? 0) > 0 ? "warn" : "ok"}>{activeSessions.length} 活跃</Badge>} />
        </div>
      </Panel>
    </div>
  );
}
