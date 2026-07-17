import { Activity, Bot, CheckCircle2, MessageSquare, RadioTower, Route, Server, TriangleAlert } from "lucide-react";

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
  ChannelConnectorsDaemonRuntimeStatus,
  ChannelConnectorsV3Config,
} from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead, Row, formatTime } from "./_shared";

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
  const ingress = runtime?.ingressQueue;
  const daemonOnline = runtime?.reachable === true;
  const sessionRuntimeReachable = sessionsQuery.data?.runtimeReachable !== false;

  return (
    <div className="grid gap-[18px]">
      <section className="border-y border-line bg-panel-2 px-4 py-4 sm:rounded-sm sm:border">
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
        <div className="flex items-start gap-2 rounded-sm border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span><strong>会话运行态暂不可用。</strong>消息守护当前离线；账号与分发配置仍可查看，守护启动后会自动刷新会话数据。</span>
        </div>
      ) : null}

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <Panel>
          <PanelHead title="账号接入状态" sub="保存成功、连接成功和收到真实消息分别显示。" action={<Button variant="ghost" size="sm" onClick={() => goToView("accounts")}><RadioTower />管理账号</Button>} />
          {accountStates.length === 0 ? <div className="p-4"><EmptyState title="尚未创建渠道账号" description="先创建 Agent 工作区，再连接飞书或 Octo。" action={<Button variant="primary" size="sm" onClick={() => goToView("accounts")}><RadioTower />创建账号</Button>} /></div> : <div className="divide-y divide-line">{accountStates.map(({ account, state }) => {
            const policy = config.deliveryPolicies.find((candidate) => candidate.accountRef === account.id);
            const target = config.targets.find((candidate) => candidate.id === policy?.defaultTargetRef);
            return <Row key={account.id} icon={<RadioTower />} iconClass={state.variant === "ok" ? "bg-success/10 text-success" : state.variant === "warn" ? "bg-warning-soft text-warning" : undefined} title={account.displayName} subtitle={`${account.platform} · ${target?.name || "未指定默认工作区"} · ${state.detail}`} trailing={<Badge variant={state.variant}>{state.label}</Badge>} onClick={() => goToView("accounts", { account: account.id })} />;
          })}</div>}
        </Panel>

        <Panel>
          <PanelHead title="运行流水线" sub="连接、入站队列、工作区与回复状态。" action={<Button variant="ghost" size="sm" onClick={() => goToView("runtime")}><Activity />运行中心</Button>} />
          <div className="divide-y divide-line">
            <Row icon={<Server />} iconClass={daemonOnline ? "bg-success/10 text-success" : "bg-warning-soft text-warning"} title="账号连接" subtitle={`${runtime?.feishuConnections ?? 0} 飞书 · ${runtime?.octoConnections ?? 0} Octo`} trailing={<Badge variant={daemonOnline ? "ok" : "warn"}>{daemonOnline ? "在线" : "离线"}</Badge>} />
            <Row icon={<Route />} iconClass={(ingress?.queued ?? 0) > 0 ? "bg-warning-soft text-warning" : undefined} title="入站队列" subtitle={`${ingress?.completed ?? 0} 完成 · ${ingress?.duplicates ?? 0} 重复已拦截`} trailing={<Badge variant={(ingress?.failed ?? 0) > 0 ? "warn" : "mute"}>{ingress?.queued ?? 0} 排队</Badge>} />
            <Row icon={<Bot />} title="工作区调度" subtitle="同一真实目录默认串行，跨目录可并行" trailing={<Badge variant="info">{config.targets.length}</Badge>} />
            <Row icon={<MessageSquare />} title="回复与会话" subtitle={`${runtime?.replyOutbox.pending ?? 0} 条回复待发送 · ${runtime?.replyOutbox.deadLetter ?? 0} 条死信`} trailing={<Badge variant={(runtime?.replyOutbox.deadLetter ?? 0) > 0 ? "warn" : "ok"}>{activeSessions.length} 活跃</Badge>} />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHead title="最近会话事件" sub="优先暴露失败与备用路径，便于定位接入链路。" action={<Button variant="ghost" size="sm" onClick={() => goToView("sessions")}><MessageSquare />全部会话</Button>} />
        {recentEvents.length === 0 ? <div className="p-4"><EmptyState title="尚无会话事件" description="发送第一条真实消息后，这里会显示解析与执行结果。" /></div> : <div className="divide-y divide-line">{recentEvents.map((event, index) => {
          const failed = Boolean(event.error || event.type === "turn.failed" || event.type === "turn.fallback");
          return <Row key={`${event.checkedAt}:${event.type}:${index}`} icon={failed ? <TriangleAlert /> : <CheckCircle2 />} iconClass={failed ? "bg-warning-soft text-warning" : "bg-success/10 text-success"} title={eventTitle(event.type)} subtitle={`${event.agent} · ${event.bindingId} · ${event.error || event.reason || formatTime(event.checkedAt)}`} trailing={<Badge variant={failed ? "warn" : "mute"}>{formatTime(event.checkedAt)}</Badge>} />;
        })}</div>}
      </Panel>
    </div>
  );
}
