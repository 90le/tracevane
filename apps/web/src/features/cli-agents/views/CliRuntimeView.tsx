import * as React from "react";
import { CheckCircle2, CircleSlash, ExternalLink, Plug, Terminal } from "lucide-react";

import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";

import type { CliAgentsViewProps } from "../types";
import { Fact, Panel, PanelHead, Row, ToneBadge, formatTime, toneIconClass } from "./_shared";

/** Display order + labels for the agent CLIs. */
const AGENT_CLI_ORDER: ReadonlyArray<{ id: string; label: string }> = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "opencode", label: "OpenCode" },
];

/**
 * CLI runtime status — Codex / Claude Code / OpenCode install + version state
 * from `/api/terminal/status`, plus PTY availability and gateway health as the
 * runtime context these CLIs route through. Read-only: install / launch are
 * write actions handled in the sessions view / owning surface.
 */
export function CliRuntimeView(_props: CliAgentsViewProps) {
  const terminalStatus = useTerminalStatusQuery();
  const gateway = useModelGatewayStatusQuery();

  const binaries = terminalStatus.data?.binaries ?? [];
  const byId = new Map<string, (typeof binaries)[number]>(
    binaries.map((b) => [b.id, b] as const),
  );
  const marketplaceBinaries = binaries.filter((b) => b.category === "marketplace");
  const shellBinaries = binaries.filter((b) => b.category === "shell");

  const ptyAvailable = terminalStatus.data?.ptyAvailable ?? false;
  const config = terminalStatus.data?.config;
  const health = gateway.data?.healthSummary;

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="Agent CLI 运行时"
          sub="Codex / Claude Code / OpenCode 安装与版本状态。"
          action={
            <Button variant="outline" size="sm" onClick={() => void terminalStatus.refetch()}>
              刷新
            </Button>
          }
        />
        <div className="grid gap-0.5 p-1">
          {terminalStatus.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : terminalStatus.error ? (
            <ErrorState
              title="无法加载 CLI 状态"
              description={terminalStatus.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void terminalStatus.refetch()}>
                  重试
                </Button>
              }
            />
          ) : (
            AGENT_CLI_ORDER.map(({ id, label }) => {
              const b = byId.get(id);
              const installed = b?.installed ?? false;
              return (
                <Row
                  key={id}
                  icon={installed ? <CheckCircle2 /> : <CircleSlash />}
                  iconClass={toneIconClass(installed ? "ok" : "warn")}
                  title={`${label} · ${b?.binary ?? id}`}
                  subtitle={
                    installed
                      ? `${b?.version ?? "未知版本"} · ${b?.path ?? "—"}`
                      : b?.installSupported
                        ? `${b?.packageName ?? "未安装"} · 可安装`
                        : "未安装"
                  }
                  trailing={
                    <ToneBadge tone={installed ? "ok" : "warn"}>
                      {installed ? "已安装" : "缺失"}
                    </ToneBadge>
                  }
                />
              );
            })
          )}
        </div>
        {/* Runtime context facts */}
        {!terminalStatus.isLoading && !terminalStatus.error && (
          <dl className="grid grid-cols-2 gap-2.5 border-t border-line p-4 sm:grid-cols-4">
            <Fact label="PTY">
              <span className={ptyAvailable ? "text-green" : "text-amber"}>
                {ptyAvailable ? "可用" : "不可用"}
              </span>
            </Fact>
            <Fact label="默认模型">{config?.model || "—"}</Fact>
            <Fact label="默认服务商">{config?.provider || "—"}</Fact>
            <Fact label="检查时间">{formatTime(terminalStatus.data?.checkedAt)}</Fact>
          </dl>
        )}
      </Panel>

      {/* Gateway routing context — read-only reference */}
      <Panel>
        <PanelHead
          title="网关路由上下文"
          sub="这些 CLI 通过模型网关路由模型。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.hash = "#/model-gateway")}
            >
              模型网关
              <ExternalLink />
            </Button>
          }
        />
        <div className="p-4">
          {gateway.isLoading ? (
            <SkeletonRow />
          ) : gateway.error ? (
            <ErrorState
              title="网关状态不可用"
              description={gateway.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void gateway.refetch()}>
                  重试
                </Button>
              }
            />
          ) : (
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Fact label="正常服务商">
                <span className="inline-flex items-center gap-1.5">
                  <Plug className="size-3.5 text-primary" />
                  {health?.okProviders ?? 0}
                </span>
              </Fact>
              <Fact label="降级服务商">
                <span className={health && health.degradedProviders > 0 ? "text-amber" : ""}>
                  {health?.degradedProviders ?? 0}
                </span>
              </Fact>
              <Fact label="熔断打开">
                <span className={health && health.openCircuits > 0 ? "text-red" : ""}>
                  {health?.openCircuits ?? 0}
                </span>
              </Fact>
            </dl>
          )}
          <p className="mt-3 text-xs text-subtle">
            服务商、密钥与路由规则在模型网关管理，本页只读引用。
          </p>
        </div>
      </Panel>

      {/* Supporting binaries */}
      {(marketplaceBinaries.length > 0 || shellBinaries.length > 0) && (
        <Panel>
          <PanelHead title="支撑二进制" sub="Marketplace 与 shell 工具。" />
          <div className="grid gap-0.5 p-1">
            {[...marketplaceBinaries, ...shellBinaries].map((b) => (
              <Row
                key={b.id}
                icon={<Terminal />}
                iconClass={toneIconClass(b.installed ? "ok" : "mute")}
                title={`${b.label} · ${b.binary}`}
                subtitle={b.installed ? (b.version ?? "已安装") : "未安装"}
                trailing={
                  <ToneBadge tone={b.installed ? "ok" : "mute"}>
                    {b.installed ? "已安装" : "缺失"}
                  </ToneBadge>
                }
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default CliRuntimeView;
