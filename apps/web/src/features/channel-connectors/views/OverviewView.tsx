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
  const agentProfiles = config?.agentProfiles ?? [];

  const activeSessions = sessions?.activeSessions ?? [];
  const recentEvents = sessions?.recentEvents ?? [];
  const maxSessions = sessions?.policy.maxSessions ?? null;

  const pending = runtime?.pendingAgentRuns;
  const feishuConnections = runtime?.feishuConnectionDetails ?? [];
  const feishuDegraded = feishuConnections.some((c) => c.connected === false);

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
          {enabledBindings.length}/{bindings.length} 个绑定启用
          <span className="text-muted"> · </span>
          {activeSessions.length} 个活跃会话
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">平台绑定</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {bindings.length}
            </div>
            <span className="text-xs text-muted">{enabledBindings.length} 启用</span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">活跃会话</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {activeSessions.length}
              {maxSessions != null && (
                <small className="ml-0.5 text-sm font-normal text-muted">/{maxSessions}</small>
              )}
            </div>
            <span className="text-xs text-muted">{recentEvents.length} 条事件</span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">待 replay</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {pending?.count ?? 0}
            </div>
            <span className="text-xs text-muted">
              {pending?.oldestQueuedAt ? `最早 ${formatTime(pending.oldestQueuedAt)}` : "无积压"}
            </span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">长连接</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {(runtime?.octoConnections ?? 0) + (runtime?.feishuConnections ?? 0)}
            </div>
            <span className="text-xs text-muted">
              {runtime?.octoConnections ?? 0} octo · {runtime?.feishuConnections ?? 0} feishu
            </span>
          </div>
        </div>
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
              subtitle={`${feishuConnections.length} 路连接`}
              trailing={
                <Badge variant={feishuDegraded ? "warn" : "ok"}>
                  {feishuDegraded ? "部分断开" : "正常"}
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
            title="平台账号"
            sub="账号/bot 凭据与启用状态"
            action={
              <Button variant="ghost" size="sm" onClick={() => goToView("accounts")}>
                管理
              </Button>
            }
          />
          {bindings.length === 0 ? (
            <EmptyState
              title="暂无绑定"
              description="尚未配置任何平台账号绑定，前往“渠道与绑定”添加。"
            />
          ) : (
            <div className="py-1.5">
              {bindings.slice(0, 6).map((binding) => (
                <Row
                  key={binding.id}
                  icon={<PlugZap />}
                  title={binding.displayName || binding.id}
                  subtitle={`${binding.platform} · ${binding.agentProfileId}`}
                  trailing={
                    <Badge variant={binding.enabled ? "ok" : "mute"}>
                      {binding.enabled ? "启用" : "停用"}
                    </Badge>
                  }
                  onClick={() => goToView("accounts", { binding: binding.id })}
                />
              ))}
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
          title="最近会话事件"
          sub="Agent session driver 事件，只读。"
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
                title={event.type}
                subtitle={`${event.agent} · ${event.bindingId} · ${formatTime(event.checkedAt)}`}
                trailing={
                  <Badge variant={event.error ? "bad" : EVENT_TONE[event.type]}>
                    {event.error ? "失败" : "ok"}
                  </Badge>
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Healthy summary anchor when everything is clear. */}
      {daemonOnline && enabledBindings.length > 0 && (pending?.count ?? 0) === 0 && (
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
