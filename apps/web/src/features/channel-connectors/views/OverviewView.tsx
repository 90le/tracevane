import * as React from "react";
import {
  Activity,
  Bot,
  Check,
  PlugZap,
  RadioTower,
  Send,
  Server,
  MessageSquare,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsAgentSessionsQuery,
  useChannelConnectorsConfigQuery,
  useChannelConnectorsStatusQuery,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorAgentSessionDriverRuntimeEvent } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead, Row, formatTime } from "./_shared";
import { DaemonServicePanel } from "./DaemonServicePanel";
import {
  groupChannelConnectorAccounts,
  runtimeAccountState,
} from "./account-runtime";

const EVENT_TONE: Record<
  ChannelConnectorAgentSessionDriverRuntimeEvent["type"],
  "ok" | "warn" | "bad" | "mute"
> = {
  "session.created": "ok",
  "session.stopped": "mute",
  "session.killed": "warn",
  "session.disposed": "mute",
  "session.reaped": "warn",
  "turn.started": "ok",
  "turn.finished": "ok",
  "turn.failed": "bad",
  "turn.fallback": "warn",
};

function overviewEventTitle(event: ChannelConnectorAgentSessionDriverRuntimeEvent): string {
  if (event.error) return "Agent 执行失败";
  switch (event.type) {
    case "turn.failed": return "Agent 回合失败";
    case "turn.fallback": return "路由 fallback";
    case "turn.started": return "开始处理消息";
    case "turn.finished": return "回复完成";
    case "session.created": return "创建会话";
    case "session.killed": return "终止会话";
    case "session.reaped": return "回收空闲会话";
    case "session.stopped":
    case "session.disposed": return "会话结束";
    default: return event.type;
  }
}

function overviewEventSubtitle(event: ChannelConnectorAgentSessionDriverRuntimeEvent): string {
  const detail = event.error || event.reason || event.sessionId || event.bindingId;
  return `${event.agent} · ${event.bindingId} · ${formatTime(event.checkedAt)}${detail ? ` · ${detail}` : ""}`;
}

export function OverviewView({ goToView }: ChannelConnectorsViewProps) {
  const statusQuery = useChannelConnectorsStatusQuery();
  const configQuery = useChannelConnectorsConfigQuery();
  const sessionsQuery = useChannelConnectorsAgentSessionsQuery();

  const isLoading =
    statusQuery.isLoading || configQuery.isLoading || sessionsQuery.isLoading;
  const error = statusQuery.error ?? configQuery.error ?? sessionsQuery.error;

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[132px] w-full" />
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="无法加载渠道概览"
        description={error.message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void statusQuery.refetch();
              void configQuery.refetch();
              void sessionsQuery.refetch();
            }}
          >
            重试
          </Button>
        }
      />
    );
  }

  const status = statusQuery.data;
  const config = configQuery.data?.config;
  const sessions = sessionsQuery.data;

  const runtime = status?.runtime;
  const manager = status?.service.serviceManager;
  const reachable = runtime?.reachable === true;
  const daemonOnline = reachable || manager?.active === true;

  const bindings = config?.platformBindings ?? [];
  const enabledBindings = bindings.filter((b) => b.enabled);
  const accounts = groupChannelConnectorAccounts(bindings);
  const enabledAccounts = accounts.filter((group) =>
    group.bindings.some((binding) => binding.enabled),
  );
  const accountHealth = accounts.map((group) => ({
    group,
    state: runtimeAccountState(group, runtime),
  }));
  const accountIssueCount = accountHealth.filter(
    ({ state }) => state.variant === "warn",
  ).length;
  const agentProfiles = config?.agentProfiles ?? [];

  const activeSessions = sessions?.activeSessions ?? [];
  const recentEvents = sessions?.recentEvents ?? [];
  const maxSessions = sessions?.policy.maxSessions ?? null;

  const pending = runtime?.pendingAgentRuns;
  const feishuConnections = runtime?.feishuConnectionDetails ?? [];
  const feishuDegraded = accountHealth.some(
    ({ group, state }) =>
      group.representative.platform === "feishu" && state.variant === "warn",
  );
  const failedEvents = recentEvents.filter((event) => event.error || event.type === "turn.failed" || event.type === "turn.fallback").length;

  return (
    <div className="grid gap-[18px]">
      {/* Hero: live daemon reachability + binding summary */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {daemonOnline ? (
            <Badge variant="ok" className="gap-1.5">
              <RadioTower className="size-3.5" />
              渠道守护在线
            </Badge>
          ) : (
            <Badge variant="warn" className="gap-1.5">
              <RadioTower className="size-3.5" />
              守护未就绪
            </Badge>
          )}
          <span className="text-sm text-muted">
            {runtime?.implementation
              ? `${runtime.implementation}${runtime.pid != null ? ` · pid ${runtime.pid}` : ""}`
              : "运行时信息不可用"}
          </span>
          <span className="ml-auto text-sm text-subtle">
            检查于 {formatTime(status?.checkedAt)}
          </span>
        </div>
        <p className="mt-3 text-base text-ink-strong">
          {daemonOnline ? "守护运行中" : "守护状态未知"}
          <span className="text-muted"> · </span>
          {enabledAccounts.length}/{accounts.length} 个账号启用
          <span className="text-muted"> · </span>
          {activeSessions.length} 个活跃会话
          <span className="text-muted"> · </span>
          {accountIssueCount + failedEvents} 个需关注项
        </p>
        <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-sm border border-line bg-panel sm:grid-cols-4">
          <div className="min-w-0 border-b border-r border-line px-3 py-2.5 sm:border-b-0">
            <dt className="text-xs text-subtle">平台账号</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-strong">{accounts.length}</dd>
            <dd className="truncate text-xs text-muted">{enabledAccounts.length} 启用 · {bindings.length} 路由</dd>
          </div>
          <div className="min-w-0 border-b border-line px-3 py-2.5 sm:border-b-0 sm:border-r">
            <dt className="text-xs text-subtle">活跃会话</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-strong">
              {activeSessions.length}
              {maxSessions != null && (
                <small className="ml-0.5 text-sm font-normal text-muted">/{maxSessions}</small>
              )}
            </dd>
            <dd className="truncate text-xs text-muted">{recentEvents.length} 条事件</dd>
          </div>
          <div className="min-w-0 border-r border-line px-3 py-2.5 sm:border-r">
            <dt className="text-xs text-subtle">待 replay</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-strong">{pending?.count ?? 0}</dd>
            <dd className="truncate text-xs text-muted">
              {pending?.oldestQueuedAt ? `最早 ${formatTime(pending.oldestQueuedAt)}` : "无积压"}
            </dd>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <dt className="text-xs text-subtle">长连接</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-strong">
              {(runtime?.octoConnections ?? 0) + (runtime?.feishuConnections ?? 0)}
            </dd>
            <dd className="truncate text-xs text-muted">
              {runtime?.octoConnections ?? 0} octo · {runtime?.feishuConnections ?? 0} feishu
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Runtime panel — live daemon facts only. */}
        <Panel>
          <PanelHead title="连接运行时" sub="Tracevane native daemon、长连接与 replay 队列。" />
          <div className="py-1.5">
            <Row
              icon={<Server />}
              iconClass={daemonOnline ? "bg-green-soft text-green" : "bg-amber-soft text-amber"}
              title="守护服务"
              subtitle={status?.service.plan.serviceName ?? "渠道守护进程"}
              trailing={
                <Badge variant={daemonOnline ? "ok" : "warn"}>
                  {daemonOnline ? "在线" : "未就绪"}
                </Badge>
              }
            />
            <Row
              icon={<Send />}
              iconClass={(pending?.count ?? 0) > 0 ? "bg-amber-soft text-amber" : undefined}
              title="待 replay"
              subtitle={`${pending?.records.length ?? 0} 条记录`}
              trailing={
                <Badge variant={(pending?.count ?? 0) > 0 ? "warn" : "ok"}>
                  {pending?.count ?? 0}
                </Badge>
              }
            />
            <Row
              icon={<RadioTower />}
              iconClass={feishuDegraded ? "bg-amber-soft text-amber" : undefined}
              title="Feishu 长连接"
              subtitle={`${feishuConnections.length} 路连接${feishuDegraded ? " · 有账号尚未验证事件入口" : ""}`}
              trailing={
                <Badge variant={feishuDegraded ? "warn" : "ok"}>
                  {feishuDegraded ? "待处理" : "正常"}
                </Badge>
              }
            />
            {runtime?.error && (
              <Row
                icon={<Activity />}
                iconClass="bg-red-soft text-red"
                title="运行时错误"
                subtitle={runtime.error}
                trailing={<Badge variant="bad">异常</Badge>}
              />
            )}
          </div>
        </Panel>

        {/* Bindings summary — click navigates to bindings view. */}
        <Panel>
          <PanelHead
            title="平台账号速览"
            sub="账号/bot 凭据与启用状态；路由目标在绑定路由页"
            action={
              <Button variant="ghost" size="sm" onClick={() => goToView("accounts")}>
                管理
              </Button>
            }
          />
          {accounts.length === 0 ? (
            <EmptyState
              title="暂无绑定"
              description="尚未配置任何平台账号。先建账号，再去绑定路由设置 Agent / 模型 / 启动目录。"
            />
          ) : (
            <div className="py-1.5">
              {accountHealth.slice(0, 6).map(({ group, state }) => {
                const binding = group.representative;
                return (
                  <Row
                    key={group.key}
                    icon={<PlugZap />}
                    title={binding.displayName || binding.id}
                    subtitle={`${binding.platform} · acct ${binding.accountId || "—"} · ${group.bindings.length} 路由`}
                    trailing={<Badge variant={state.variant}>{state.label}</Badge>}
                    onClick={() => goToView("accounts", { binding: binding.id })}
                  />
                );
              })}
              {agentProfiles.length > 0 && (
                <Row
                  icon={<Bot />}
                  iconClass="bg-green-soft text-green"
                  title={`${agentProfiles.length} 个 Agent 配置`}
                  subtitle={agentProfiles.map((p) => p.name).join(" · ")}
                  trailing={<Badge variant="info">profiles</Badge>}
                />
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* Recent session events — read-only trace. */}
      <Panel>
        <PanelHead
          title="需要关注的最近事件"
          sub="失败/fallback 会保留在会话投递页；这里显示最近 6 条人可读摘要。"
          action={
            <Button variant="ghost" size="sm" onClick={() => goToView("deliveries")}>
              <MessageSquare className="size-3.5" />
              查看会话投递
            </Button>
          }
        />
        {recentEvents.length === 0 ? (
          <EmptyState
            title="暂无会话事件"
            description="IM 触发 Agent 后会在这里出现 session/turn 事件。"
          />
        ) : (
          <div className="py-1.5">
            {recentEvents.slice(0, 6).map((event, index) => (
              <Row
                key={`${event.type}-${event.sessionId ?? "none"}-${index}`}
                icon={<Activity />}
                title={overviewEventTitle(event)}
                subtitle={overviewEventSubtitle(event)}
                trailing={
                  <Badge variant={event.error ? "bad" : EVENT_TONE[event.type]}>
                    {event.error || event.type === "turn.failed" ? "需处理" : event.type === "turn.fallback" ? "关注" : "正常"}
                  </Badge>
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Healthy summary anchor when everything is clear. */}
      {daemonOnline && enabledBindings.length > 0 && accountIssueCount === 0 && (pending?.count ?? 0) === 0 && (
        <p className="flex items-center gap-1.5 text-sm text-green">
          <Check className="size-4" />
          守护在线、绑定就绪、无 replay 积压。
        </p>
      )}

      <DaemonServicePanel
        onMutated={() => {
          void statusQuery.refetch();
        }}
      />
    </div>
  );
}
