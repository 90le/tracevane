import * as React from "react";
import { Activity, ArrowRight, Plug, Terminal } from "lucide-react";

import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";

import type { CliAgentsViewProps } from "../types";
import { Panel, PanelHead, Row, ToneBadge, toneIconClass } from "./_shared";

const AGENT_CLI_IDS = new Set(["claude", "codex", "opencode"]);

/**
 * Workbench overview — a task router, not a duplicated dashboard. The primary
 * objects stay CLI readiness and Agent Runs; Gateway/IM are only linked when
 * they own the next action.
 */
export function OverviewView({ goToView }: CliAgentsViewProps) {
  const terminalStatus = useTerminalStatusQuery();
  const gateway = useModelGatewayStatusQuery();
  const runs = useAgentRuntimeRunsQuery();

  const binaries = terminalStatus.data?.binaries ?? [];
  const agentBinaries = binaries.filter((b) => AGENT_CLI_IDS.has(b.id));
  const installedAgents = agentBinaries.filter((b) => b.installed).length;
  const missingAgents = agentBinaries.filter((b) => !b.installed);
  const health = gateway.data?.healthSummary;
  const gatewayReady = Boolean(
    health && health.okProviders > 0 && health.openCircuits === 0,
  );
  const totals = runs.data?.totals;
  const failed = totals?.failed ?? 0;
  const running = totals?.running ?? 0;

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="CLI Agents 工作台"
          sub="核心只做三件事：CLI 是否能启动、Agent Run 是否健康、出问题时去哪里处理。"
          action={
            <ToneBadge
              tone={installedAgents >= 3 && gatewayReady ? "ok" : "warn"}
            >
              {installedAgents}/3 CLI 就绪
            </ToneBadge>
          }
        />
        <div className="grid gap-0.5 p-1">
          {terminalStatus.isLoading || runs.isLoading || gateway.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : terminalStatus.error || runs.error || gateway.error ? (
            <ErrorState
              title="CLI 工作台状态不可用"
              description={
                terminalStatus.error?.message ||
                runs.error?.message ||
                gateway.error?.message
              }
            />
          ) : (
            <>
              <Row
                icon={<Activity />}
                iconClass={toneIconClass(
                  failed > 0 ? "bad" : running > 0 ? "ok" : "info",
                )}
                title={
                  failed > 0
                    ? `${failed} 个 Agent Run 需要处理`
                    : `${running} 个 Agent Run 正在运行`
                }
                subtitle={`全部 ${totals?.total ?? 0} · 终端 ${totals?.terminal ?? 0} · IM ${totals?.imChannel ?? 0}`}
                trailing={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goToView("runs")}
                  >
                    运行台
                    <ArrowRight />
                  </Button>
                }
              />
              <Row
                icon={<Terminal />}
                iconClass={toneIconClass(
                  missingAgents.length > 0 ? "warn" : "ok",
                )}
                title={
                  missingAgents.length > 0
                    ? `${missingAgents.length} 个 CLI 缺失`
                    : "Codex / Claude Code / OpenCode 可启动"
                }
                subtitle={
                  missingAgents.length > 0
                    ? missingAgents.map((b) => b.label || b.id).join(" / ")
                    : "解析启动命令后交给 Workspace 终端执行"
                }
                trailing={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goToView("cli")}
                  >
                    启动台
                    <ArrowRight />
                  </Button>
                }
              />
              <Row
                icon={<Plug />}
                iconClass={toneIconClass(gatewayReady ? "ok" : "warn")}
                title={
                  gatewayReady ? "模型网关可用于 CLI 路由" : "模型网关需要检查"
                }
                subtitle={
                  health
                    ? `${health.okProviders} 正常 · ${health.degradedProviders} 降级 · ${health.openCircuits} 熔断`
                    : "Provider 状态未返回"
                }
                trailing={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (window.location.hash = "#/model-gateway")}
                  >
                    网关
                    <ArrowRight />
                  </Button>
                }
              />
            </>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="职责边界"
          sub="减少重复页面：CLI 只做运行管理，配置回所属域。"
        />
        <div className="grid gap-2 p-4 text-sm text-muted">
          <p>
            <strong className="text-ink-strong">CLI Agents：</strong>
            启动命令、CLI readiness、Agent Runs、Agent 终端会话
            stop/delete、证据跳转。
          </p>
          <p>
            <strong className="text-ink-strong">Model Gateway：</strong>
            Provider、模型、协议、上下文、路由、客户端接入和用量口径。
          </p>
          <p>
            <strong className="text-ink-strong">IM Channels：</strong>IM
            账号、平台凭据、绑定路由、队列并发、投递和会话驱动。
          </p>
        </div>
      </Panel>
    </div>
  );
}

export default OverviewView;
