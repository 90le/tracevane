import * as React from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  MessageSquare,
  Plug,
  RadioTower,
  SquareTerminal,
  Terminal,
  Users,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useAgentsSummaryQuery } from "@/lib/query/agents";
import { useTerminalSessionsQuery } from "@/lib/query/terminal";
import {
  useChatBootstrapQuery,
  useTerminalStatusQuery,
} from "@/lib/query/dashboard";
import { useChannelConnectorsAgentSessionsQuery } from "@/lib/query/channel-connectors";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";

import type { CliAgentsViewProps } from "../types";
import {
  Fact,
  Panel,
  PanelHead,
  Row,
  StatTile,
  ToneBadge,
  formatTime,
  terminalStatusTone,
  toneIconClass,
} from "./_shared";

const AGENT_CLI_IDS = new Set(["claude", "codex", "opencode"]);

/**
 * Workbench overview — a runtime roll-up across every source the CLI Agent
 * Workbench owns or references: persona roster, agent CLI install state,
 * persisted terminal sessions, gateway health, and the latest async IM agent
 * events. Read-only; each panel deep-links to its detail view. Routing facts
 * are referenced read-only and link to the gateway.
 */
export function OverviewView({ goToView }: CliAgentsViewProps) {
  const agents = useAgentsSummaryQuery();
  const terminalStatus = useTerminalStatusQuery();
  const terminalSessions = useTerminalSessionsQuery();
  const channelSessions = useChannelConnectorsAgentSessionsQuery();
  const gateway = useModelGatewayStatusQuery();
  const chat = useChatBootstrapQuery();

  const agentRows = agents.data?.agents ?? [];
  const enabledAgents = agentRows.filter((a) => a.enabled).length;

  const binaries = terminalStatus.data?.binaries ?? [];
  const agentBinaries = binaries.filter((b) => AGENT_CLI_IDS.has(b.id));
  const installedAgents = agentBinaries.filter((b) => b.installed).length;

  const sessions = terminalSessions.data?.sessions ?? [];
  const liveSessions = sessions.filter(
    (s) => s.status === "running" || s.status === "detached",
  ).length;

  const health = gateway.data?.healthSummary;
  const degraded = health?.degradedProviders ?? 0;
  const okProviders = health?.okProviders ?? 0;

  const activeChannel = channelSessions.data?.activeSessions ?? [];
  const channelEvents = channelSessions.data?.recentEvents ?? [];
  const chatSessions = chat.data?.sessions ?? [];

  const ptyAvailable = terminalStatus.data?.ptyAvailable ?? false;

  return (
    <div className="grid gap-4">
      {/* Hero roll-up */}
      <Panel>
        <div className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink-strong [&_svg]:size-4 [&_svg]:text-primary">
              <Bot />
              CLI 代理工作台
            </span>
            <ToneBadge tone={installedAgents >= 3 ? "ok" : "warn"}>
              {installedAgents}/3 CLI 就绪
            </ToneBadge>
            <ToneBadge tone={ptyAvailable ? "ok" : "warn"}>
              PTY · {ptyAvailable ? "可用" : "不可用"}
            </ToneBadge>
          </div>
          <p className="max-w-[80ch] text-sm text-muted">
            这是运行与证据视角：聚合 persona 代理、Codex / Claude Code / OpenCode
            CLI、持久终端会话、IM 异步运行证据与网关健康。模型路由仍由
            <button
              type="button"
              className="mx-1 inline text-primary underline-offset-2 hover:underline"
              onClick={() => (window.location.hash = "#/model-gateway")}
            >
              模型网关
            </button>
            管理，本页只读引用。
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              icon={<Users />}
              label="Persona 代理"
              value={agents.isLoading ? "—" : agentRows.length}
              sub={`${enabledAgents} 已启用`}
            />
            <StatTile
              icon={<Terminal />}
              label="Agent CLI"
              value={terminalStatus.isLoading ? "—" : installedAgents}
              sub={`${agentBinaries.length} 个受跟踪二进制`}
            />
            <StatTile
              icon={<SquareTerminal />}
              label="终端会话"
              value={terminalSessions.isLoading ? "—" : sessions.length}
              sub={`${liveSessions} 个活跃`}
            />
            <StatTile
              icon={<Activity />}
              label="IM 运行"
              value={channelSessions.isLoading ? "—" : activeChannel.length}
              sub={`${channelEvents.length} 条最近事件`}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runtime entry points */}
        <Panel>
          <PanelHead
            title="运行入口"
            sub="persona、Agent CLI、网关健康与终端会话。"
            action={
              <Button variant="outline" size="sm" onClick={() => goToView("personas")}>
                Persona
                <ArrowRight />
              </Button>
            }
          />
          <div className="grid gap-2 p-3">
            <Row
              icon={<Bot />}
              iconClass={toneIconClass(enabledAgents > 0 ? "ok" : "mute")}
              title={`${enabledAgents} 个已启用 persona`}
              subtitle={`共 ${agentRows.length} 个配置代理`}
              trailing={
                <ToneBadge tone={enabledAgents > 0 ? "ok" : "mute"}>
                  {enabledAgents > 0 ? "已启用" : "无"}
                </ToneBadge>
              }
              onClick={() => goToView("personas")}
            />
            <Row
              icon={<Terminal />}
              iconClass={toneIconClass(installedAgents >= 3 ? "ok" : "warn")}
              title={`${installedAgents} 个 Agent CLI 已安装`}
              subtitle={
                agentBinaries.map((b) => b.id).join(" / ") || "未检测到 CLI"
              }
              trailing={
                <ToneBadge tone={installedAgents >= 3 ? "ok" : "warn"}>
                  {installedAgents >= 3 ? "完整" : "缺失"}
                </ToneBadge>
              }
              onClick={() => goToView("cli")}
            />
            <Row
              icon={<Plug />}
              iconClass={toneIconClass(degraded > 0 ? "warn" : "ok")}
              title={`网关健康 · ${okProviders} OK`}
              subtitle={`${degraded} 个降级服务商 · 模型路由由网关管理`}
              trailing={
                <ToneBadge tone={degraded > 0 ? "warn" : "ok"}>
                  {degraded > 0 ? "降级" : "正常"}
                </ToneBadge>
              }
              onClick={() => (window.location.hash = "#/model-gateway")}
            />
            <Row
              icon={<RadioTower />}
              iconClass={toneIconClass(activeChannel.length > 0 ? "ok" : "mute")}
              title={`${activeChannel.length} 个 IM 异步会话`}
              subtitle={`${chatSessions.length} 个对话会话`}
              trailing={<ArrowRight className="size-4 text-subtle" />}
              onClick={() => goToView("evidence")}
            />
          </div>
        </Panel>

        {/* Latest async agent events */}
        <Panel>
          <PanelHead
            title="最近 IM 代理事件"
            sub="来自 Channel Connectors session driver。"
            action={
              <Button variant="outline" size="sm" onClick={() => goToView("evidence")}>
                证据
                <ArrowRight />
              </Button>
            }
          />
          <div className="grid gap-0.5 p-1">
            {channelSessions.isLoading ? (
              <div className="p-3">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : channelSessions.error ? (
              <ErrorState
                title="IM 代理会话不可用"
                description={channelSessions.error.message}
                action={
                  <Button variant="outline" size="sm" onClick={() => void channelSessions.refetch()}>
                    重试
                  </Button>
                }
              />
            ) : channelEvents.length === 0 ? (
              <EmptyState
                title="暂无代理事件"
                description="IM 渠道触发异步任务后会显示在这里。"
              />
            ) : (
              channelEvents.slice(0, 6).map((event, i) => {
                const failed = Boolean(event.error) || event.type.endsWith(".failed");
                return (
                  <Row
                    key={`${event.checkedAt}-${i}`}
                    icon={<Activity />}
                    iconClass={toneIconClass(failed ? "bad" : "info")}
                    title={event.type}
                    subtitle={`${event.agent} · ${event.model ?? "—"} · ${formatTime(event.checkedAt)}`}
                    trailing={
                      <ToneBadge tone={failed ? "bad" : "ok"}>
                        {event.error ? "错误" : event.reason ?? "ok"}
                      </ToneBadge>
                    }
                  />
                );
              })
            )}
          </div>
        </Panel>
      </div>

      {/* Live terminal sessions preview */}
      <Panel>
        <PanelHead
          title="活跃终端会话"
          sub="持久终端会话；启动 / 结束控制在会话视图。"
          action={
            <Button variant="outline" size="sm" onClick={() => goToView("sessions")}>
              管理会话
              <ArrowRight />
            </Button>
          }
        />
        <div className="grid gap-0.5 p-1">
          {terminalSessions.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : terminalSessions.error ? (
            <ErrorState
              title="终端会话不可用"
              description={terminalSessions.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void terminalSessions.refetch()}>
                  重试
                </Button>
              }
            />
          ) : sessions.length === 0 ? (
            <EmptyState title="暂无终端会话" description="在会话视图启动一个 CLI 终端。" />
          ) : (
            sessions.slice(0, 5).map((s) => {
              const st = terminalStatusTone(s.status);
              return (
                <Row
                  key={s.sessionId}
                  icon={<SquareTerminal />}
                  iconClass={toneIconClass(st.tone)}
                  title={s.title || s.sessionId}
                  subtitle={`${s.cwd ?? "—"} · ${formatTime(s.lastActiveAt)}`}
                  trailing={<ToneBadge tone={st.tone}>{st.label}</ToneBadge>}
                  onClick={() => goToView("sessions")}
                />
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}

export default OverviewView;
