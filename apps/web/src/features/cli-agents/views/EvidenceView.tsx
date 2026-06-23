import * as React from "react";
import {
  ExternalLink,
  History,
  MessageSquare,
  RadioTower,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useChannelConnectorsAgentSessionsQuery } from "@/lib/query/channel-connectors";
import { useChatBootstrapQuery } from "@/lib/query/dashboard";

import type { CliAgentsViewProps } from "../types";
import {
  Fact,
  Panel,
  PanelHead,
  Row,
  ToneBadge,
  formatIdle,
  formatTime,
  toneIconClass,
} from "./_shared";

/**
 * Async agent-session evidence — read-only. IM channel agent-sessions (active +
 * recent events) come from the Channel Connectors session driver; chat sessions
 * come from chat bootstrap. kill / reap controls live in their owning domains;
 * here we only surface trace + deep-link to `/im-channels` and `/chat`.
 */
export function EvidenceView(_props: CliAgentsViewProps) {
  const channel = useChannelConnectorsAgentSessionsQuery();
  const chat = useChatBootstrapQuery();

  const activeSessions = channel.data?.activeSessions ?? [];
  const recentEvents = channel.data?.recentEvents ?? [];
  const policy = channel.data?.policy;
  const chatSessions = chat.data?.sessions ?? [];

  return (
    <div className="grid gap-4">
      {/* IM async agent sessions */}
      <Panel>
        <PanelHead
          title="IM 异步代理会话"
          sub="Channel Connectors session driver 的活跃会话（只读）。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.hash = "#/im-channels?view=sessions")}
            >
              IM 渠道
              <ExternalLink />
            </Button>
          }
        />
        {policy && !channel.isLoading && !channel.error && (
          <dl className="grid grid-cols-2 gap-2.5 border-b border-line p-4 sm:grid-cols-3">
            <Fact label="活跃会话">{activeSessions.length}</Fact>
            <Fact label="最大会话">{policy.maxSessions}</Fact>
            <Fact label="空闲超时">{Math.round(policy.idleTimeoutMs / 1000)}s</Fact>
          </dl>
        )}
        <div className="grid gap-0.5 p-1">
          {channel.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : channel.error ? (
            <ErrorState
              title="IM 代理会话不可用"
              description={channel.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void channel.refetch()}>
                  重试
                </Button>
              }
            />
          ) : activeSessions.length === 0 ? (
            <EmptyState
              title="暂无活跃 IM 代理会话"
              description="IM 渠道触发持久代理任务后会显示在这里。"
            />
          ) : (
            activeSessions.map((s) => (
              <Row
                key={s.poolKey || s.sessionId}
                icon={<RadioTower />}
                iconClass={toneIconClass(s.lastError ? "bad" : s.running > 0 ? "ok" : "mute")}
                title={s.sessionId || s.sessionKey}
                subtitle={`${s.agent} · ${s.model ?? "—"} · ${s.workDir} · ${formatIdle(s.idleMs)}`}
                trailing={
                  <ToneBadge tone={s.lastError ? "bad" : s.running > 0 ? "ok" : "mute"}>
                    {s.lastError ? "错误" : s.running > 0 ? "运行中" : "空闲"}
                  </ToneBadge>
                }
              />
            ))
          )}
        </div>
      </Panel>

      {/* Recent driver events */}
      <Panel>
        <PanelHead title="最近代理事件" sub="session driver 运行时事件证据。" />
        <div className="grid gap-0.5 p-1">
          {channel.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
            </div>
          ) : channel.error ? (
            <ErrorState title="事件不可用" description={channel.error.message} />
          ) : recentEvents.length === 0 ? (
            <EmptyState title="暂无最近事件" />
          ) : (
            recentEvents.slice(0, 12).map((event, i) => {
              const failed = Boolean(event.error) || event.type.endsWith(".failed");
              return (
                <Row
                  key={`${event.checkedAt}-${i}`}
                  icon={<History />}
                  iconClass={toneIconClass(failed ? "bad" : "info")}
                  title={event.type}
                  subtitle={`${event.bindingId} · ${event.agent} · ${formatTime(event.checkedAt)}`}
                  trailing={
                    <ToneBadge tone={failed ? "bad" : "ok"}>
                      {event.error ?? event.reason ?? "ok"}
                    </ToneBadge>
                  }
                />
              );
            })
          )}
        </div>
      </Panel>

      {/* Chat sessions */}
      <Panel>
        <PanelHead
          title="对话会话"
          sub="Tracevane chat bootstrap 的最近会话（只读）。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.hash = "#/chat")}
            >
              对话
              <ExternalLink />
            </Button>
          }
        />
        <div className="grid gap-0.5 p-1">
          {chat.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : chat.error ? (
            <ErrorState
              title="对话会话不可用"
              description={chat.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void chat.refetch()}>
                  重试
                </Button>
              }
            />
          ) : chatSessions.length === 0 ? (
            <EmptyState title="暂无对话会话" icon={<MessageSquare />} />
          ) : (
            chatSessions.slice(0, 12).map((s) => {
              const connected = s.runtime.gatewayConnected;
              const state = s.runtime.state;
              const tone = state === "error" ? "bad" : connected ? "ok" : "mute";
              return (
                <Row
                  key={s.key}
                  icon={<MessageSquare />}
                  iconClass={toneIconClass(tone)}
                  title={s.derivedTitle || s.label || s.sessionId || s.key}
                  subtitle={`${s.agentId} · ${s.source.channel ?? s.source.source} · ${formatTime(s.updatedAt)}`}
                  trailing={<ToneBadge tone={tone}>{state}</ToneBadge>}
                />
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}

export default EvidenceView;
