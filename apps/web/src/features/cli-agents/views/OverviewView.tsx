import * as React from "react";
import {
  Activity,
  ArrowRight,
  Plug,
  Terminal,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";

import type { CliAgentsViewProps } from "../types";
import {
  Panel,
  PanelHead,
  Row,
  StatTile,
  ToneBadge,
  toneIconClass,
} from "./_shared";

const AGENT_CLI_IDS = new Set(["claude", "codex", "opencode"]);

/**
 * Workbench overview — deliberately compact. Detailed runtime/evidence
 * lists are owned by `runs` and `evidence` so the overview does not duplicate
 * IM Channels, IDE terminal, or Model Gateway pages.
 */
export function OverviewView({ goToView }: CliAgentsViewProps) {
  const terminalStatus = useTerminalStatusQuery();
  const gateway = useModelGatewayStatusQuery();
  const runs = useAgentRuntimeRunsQuery();

  const binaries = terminalStatus.data?.binaries ?? [];
  const agentBinaries = binaries.filter((b) => AGENT_CLI_IDS.has(b.id));
  const installedAgents = agentBinaries.filter((b) => b.installed).length;

  const health = gateway.data?.healthSummary;
  const degraded = health?.degradedProviders ?? 0;
  const okProviders = health?.okProviders ?? 0;
  const ptyAvailable = terminalStatus.data?.ptyAvailable ?? false;
  const totals = runs.data?.totals;

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink-strong [&_svg]:size-4 [&_svg]:text-primary">
              <Terminal />
              CLI 代理工作台
            </span>
            <ToneBadge tone={installedAgents >= 3 ? "ok" : "warn"}>
              {installedAgents}/3 CLI 就绪
            </ToneBadge>
            <ToneBadge tone={ptyAvailable ? "ok" : "warn"}>
              PTY · {ptyAvailable ? "可用" : "不可用"}
            </ToneBadge>
          </div>
          <p className="max-w-[84ch] text-sm text-muted">
            本页只做 Codex / Claude Code / OpenCode 的运行视角：CLI 就绪、Agent Run 和运行证据。通用终端属于 IDE；模型与协议路由属于
            <button
              type="button"
              className="mx-1 inline text-primary underline-offset-2 hover:underline"
              onClick={() => (window.location.hash = "#/model-gateway")}
            >
              模型网关
            </button>
            ；IM 平台账号、绑定和投递属于
            <button
              type="button"
              className="mx-1 inline text-primary underline-offset-2 hover:underline"
              onClick={() => (window.location.hash = "#/im-channels")}
            >
              IM 渠道
            </button>
            。
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatTile
              icon={<Activity />}
              label="Agent Run"
              value={runs.isLoading ? "—" : totals?.total ?? 0}
              sub={`${totals?.running ?? 0} 个运行中`}
            />
            <StatTile
              icon={<Terminal />}
              label="Agent CLI"
              value={terminalStatus.isLoading ? "—" : installedAgents}
              sub={`${agentBinaries.length} 个受跟踪二进制`}
            />
            <StatTile
              icon={<Plug />}
              label="网关 Provider"
              value={gateway.isLoading ? "—" : okProviders}
              sub={`${degraded} 个降级`}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead title="核心入口" sub="三域保留，但页面不再互相重复。" />
          <div className="grid gap-2 p-3">
            <Row
              icon={<Activity />}
              iconClass={toneIconClass((totals?.running ?? 0) > 0 ? "ok" : "info")}
              title={`${totals?.running ?? 0} 个运行中的 Agent Run`}
              subtitle="终端 / IM / 对话运行统一列表"
              trailing={<ArrowRight className="size-4 text-subtle" />}
              onClick={() => goToView("runs")}
            />
            <Row
              icon={<Terminal />}
              iconClass={toneIconClass(installedAgents >= 3 ? "ok" : "warn")}
              title={`${installedAgents} 个 Agent CLI 已安装`}
              subtitle={agentBinaries.map((b) => b.id).join(" / ") || "未检测到 CLI"}
              trailing={<ArrowRight className="size-4 text-subtle" />}
              onClick={() => goToView("cli")}
            />
            <Row
              icon={<Activity />}
              iconClass={toneIconClass((totals?.terminal ?? 0) > 0 ? "info" : "mute")}
              title={`${totals?.terminal ?? 0} 个来自终端的 Agent Run`}
              subtitle="查看运行证据；通用终端管理在 IDE"
              trailing={<ArrowRight className="size-4 text-subtle" />}
              onClick={() => goToView("runs")}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHead title="依赖健康" sub="只读引用，不在这里修改 Provider 或 IM 配置。" />
          <div className="grid gap-0.5 p-1">
            {gateway.isLoading || terminalStatus.isLoading || runs.isLoading ? (
              <div className="p-3">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : gateway.error || terminalStatus.error || runs.error ? (
              <ErrorState
                title="运行依赖状态不可用"
                description={gateway.error?.message || terminalStatus.error?.message || runs.error?.message}
              />
            ) : (
              <>
                <Row
                  icon={<Plug />}
                  iconClass={toneIconClass(degraded > 0 ? "warn" : "ok")}
                  title={`模型网关 · ${okProviders} 个 Provider 正常`}
                  subtitle={`${degraded} 降级 · ${health?.openCircuits ?? 0} 熔断`}
                  trailing={
                    <Button variant="ghost" size="sm" onClick={() => (window.location.hash = "#/model-gateway")}>
                      网关
                      <ArrowRight />
                    </Button>
                  }
                />
                <Row
                  icon={<Activity />}
                  iconClass={toneIconClass((totals?.failed ?? 0) > 0 ? "bad" : "ok")}
                  title={`Agent Run 错误 · ${totals?.failed ?? 0}`}
                  subtitle={`终端 ${totals?.terminal ?? 0} · IM ${totals?.imChannel ?? 0} · 对话 ${totals?.chat ?? 0}`}
                  trailing={
                    <Button variant="ghost" size="sm" onClick={() => goToView("runs")}>
                      运行中
                      <ArrowRight />
                    </Button>
                  }
                />
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default OverviewView;
