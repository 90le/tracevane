import * as React from "react";
import {
  CheckCircle2,
  CircleSlash,
  Copy,
  ExternalLink,
  Play,
  Plug,
  RefreshCw,
  Terminal,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design/ui/table";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";
import { useLaunchTerminalMutation } from "@/lib/query/terminal";

import type { CliAgentsViewProps, TerminalLaunchCli, TerminalLaunchResponse } from "../types";
import { Fact, Panel, PanelHead, ToneBadge, formatTime, toneIconClass } from "./_shared";

/** Display order + labels for the agent CLIs. */
const AGENT_CLI_ORDER: ReadonlyArray<{ id: TerminalLaunchCli; label: string; purpose: string }> = [
  { id: "codex", label: "Codex", purpose: "OpenAI Codex CLI / code agent" },
  { id: "claude", label: "Claude Code", purpose: "Anthropic Claude Code CLI" },
  { id: "opencode", label: "OpenCode", purpose: "OpenCode local agent CLI" },
];

function copyText(value: string): void {
  void navigator.clipboard.writeText(value).then(
    () => toast.success("启动命令已复制"),
    () => toast.error("复制失败", { description: "浏览器未允许剪贴板访问。" }),
  );
}

/**
 * CLI runtime status — this is the owning surface for Codex / Claude Code /
 * OpenCode readiness and launch handoff. It references Model Gateway only as a
 * dependency link; provider/model editing remains in the Gateway domain.
 */
export function CliRuntimeView(_props: CliAgentsViewProps) {
  const terminalStatus = useTerminalStatusQuery();
  const gateway = useModelGatewayStatusQuery();
  const launch = useLaunchTerminalMutation();
  const [resolved, setResolved] = React.useState<TerminalLaunchResponse | null>(null);

  const binaries = terminalStatus.data?.binaries ?? [];
  const byId = new Map<string, (typeof binaries)[number]>(
    binaries.map((b) => [b.id, b] as const),
  );
  const installTargetById = new Map(
    (terminalStatus.data?.installTargets ?? []).map((target) => [target.id, target] as const),
  );

  const ptyAvailable = terminalStatus.data?.ptyAvailable ?? false;
  const config = terminalStatus.data?.config;
  const health = gateway.data?.healthSummary;
  const gatewayReady = Boolean(health && health.okProviders > 0 && health.openCircuits === 0);

  const resolveLaunch = (cli: TerminalLaunchCli) => {
    launch.mutate(
      { cli, model: config?.model || undefined },
      {
        onSuccess: (result) => {
          setResolved(result);
          toast.success("已解析启动命令", { description: result.label });
        },
        onError: (error) => toast.error("解析启动命令失败", { description: error.message }),
      },
    );
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="Agent CLI 启动台"
          sub="只管理 Codex / Claude Code / OpenCode 的 readiness、启动命令和 IDE 交接。Provider 与 IM 配置在各自页面。"
          action={
            <Button variant="outline" size="sm" onClick={() => void terminalStatus.refetch()}>
              <RefreshCw />
              刷新
            </Button>
          }
        />
        <div className="grid gap-2 border-b border-line p-4 sm:grid-cols-4">
          <Fact label="PTY">
            <span className={ptyAvailable ? "text-green" : "text-amber"}>
              {ptyAvailable ? "可用" : "不可用"}
            </span>
          </Fact>
          <Fact label="默认模型">{config?.model || "—"}</Fact>
          <Fact label="默认 Provider">{config?.provider || "—"}</Fact>
          <Fact label="检查时间">{formatTime(terminalStatus.data?.checkedAt)}</Fact>
        </div>
        <div className="p-4">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">CLI</TableHead>
                  <TableHead className="min-w-[160px]">状态</TableHead>
                  <TableHead className="hidden min-w-[260px] lg:table-cell">安装 / 修复提示</TableHead>
                  <TableHead className="min-w-[210px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AGENT_CLI_ORDER.map(({ id, label, purpose }) => {
                  const binary = byId.get(id);
                  const installTarget = installTargetById.get(id);
                  const installed = binary?.installed ?? false;
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${toneIconClass(installed ? "ok" : "warn")}`}>
                            {installed ? <CheckCircle2 className="size-4" /> : <CircleSlash className="size-4" />}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-ink-strong">{label}</div>
                            <div className="truncate text-sm text-muted">{purpose}</div>
                            <div className="mt-1 truncate text-xs text-subtle lg:hidden">
                              {installed ? binary?.path || binary?.version || "已安装" : installTarget?.installHint || "未安装"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <ToneBadge tone={installed ? "ok" : "warn"}>
                            {installed ? "已安装" : "缺失"}
                          </ToneBadge>
                          <ToneBadge tone={gatewayReady ? "ok" : "warn"}>
                            网关 {gatewayReady ? "可用" : "需检查"}
                          </ToneBadge>
                        </div>
                        <div className="mt-1 text-xs text-subtle">{binary?.version || binary?.binary || id}</div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="max-w-[36rem] truncate text-sm text-ink">
                          {installed ? binary?.path || "已安装" : installTarget?.packageName || "未安装"}
                        </div>
                        <div className="max-w-[36rem] truncate text-xs text-subtle">
                          {installed ? "可解析启动命令；实际运行请交给 IDE 终端。" : installTarget?.installHint || "请按项目文档安装后刷新。"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!installed || launch.isPending}
                            onClick={() => resolveLaunch(id)}
                          >
                            <Play />
                            解析启动命令
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => (window.location.hash = "#/ide")}>
                            IDE
                            <ExternalLink />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Panel>

      {resolved ? (
        <Panel>
          <PanelHead
            title="启动命令"
            sub="复制后到 IDE 终端执行；CLI Agents 不自动写 shell、不自动登录外部账号。"
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copyText(resolved.command)}>
                  <Copy />
                  复制
                </Button>
                <Button variant="outline" size="sm" onClick={() => (window.location.hash = "#/ide")}>
                  打开 IDE
                  <ExternalLink />
                </Button>
              </div>
            }
          />
          <div className="p-4">
            <pre className="max-w-full overflow-x-auto rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong">
              <code>{resolved.command}</code>
            </pre>
            <p className="mt-2 text-xs text-subtle">
              当前命令由后端根据默认模型解析；如需切换模型或 Provider，请到模型网关的客户端接入/路由配置中修改。
            </p>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHead
          title="依赖引用"
          sub="这里只显示 CLI 运行必须知道的最小依赖，不重复 Gateway / IM 的配置页面。"
        />
        <div className="grid gap-0.5 p-1">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${toneIconClass(gatewayReady ? "ok" : "warn")}`}>
              <Plug className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-base text-ink-strong">模型网关路由</strong>
              <span className="block truncate text-sm text-muted">
                {health ? `${health.okProviders} Provider 正常 · ${health.degradedProviders} 降级 · ${health.openCircuits} 熔断` : "状态未加载"}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => (window.location.hash = "#/model-gateway")}>网关<ExternalLink /></Button>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${toneIconClass("info")}`}>
              <Terminal className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-base text-ink-strong">运行入口</strong>
              <span className="block truncate text-sm text-muted">真正的 PTY 输入、resize、shell 输出仍在 IDE 终端。</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => (window.location.hash = "#/ide")}>IDE<ExternalLink /></Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default CliRuntimeView;
