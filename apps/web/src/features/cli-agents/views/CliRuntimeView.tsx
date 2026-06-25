import * as React from "react";
import {
  CheckCircle2,
  CircleSlash,
  Copy,
  Download,
  ExternalLink,
  Play,
  Plug,
  RefreshCw,
  Terminal,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
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
import { useInstallTerminalCliMutation, useLaunchTerminalMutation } from "@/lib/query/terminal";

import type {
  CliAgentsViewProps,
  TerminalInstallResponse,
  TerminalLaunchCli,
  TerminalLaunchResponse,
} from "../types";
import { Fact, Panel, PanelHead, ToneBadge, formatTime, toneIconClass } from "./_shared";

/** Display order + labels for the agent CLIs. */
const AGENT_CLI_ORDER: ReadonlyArray<{ id: TerminalLaunchCli; label: string; purpose: string }> = [
  { id: "codex", label: "Codex", purpose: "OpenAI Codex CLI / code agent" },
  { id: "claude", label: "Claude Code", purpose: "Anthropic Claude Code CLI" },
  { id: "opencode", label: "OpenCode", purpose: "OpenCode local agent CLI" },
];

function copyText(value: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value).then(
      () => toast.success("启动命令已复制"),
      () => toast.error("复制失败", { description: "浏览器未允许剪贴板访问。" }),
    );
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (ok) toast.success("启动命令已复制");
  else toast.error("复制失败", { description: "当前浏览器不支持自动复制，请手动选择命令。" });
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
  const installCli = useInstallTerminalCliMutation();
  const [resolved, setResolved] = React.useState<TerminalLaunchResponse | null>(null);
  const [installTarget, setInstallTarget] = React.useState<TerminalLaunchCli | null>(null);
  const [installResult, setInstallResult] = React.useState<TerminalInstallResponse | null>(null);

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
  const missingAgentBinaries = AGENT_CLI_ORDER.filter(({ id }) => !(byId.get(id)?.installed ?? false));

  const selectedInstallTarget = installTarget ? installTargetById.get(installTarget) : null;
  const selectedInstallBinary = installTarget ? byId.get(installTarget) : null;

  const refreshReadiness = () => {
    void terminalStatus.refetch();
    void gateway.refetch();
  };

  const runInstall = () => {
    if (!installTarget) return;
    installCli.mutate(installTarget, {
      onSuccess: (result) => {
        setInstallResult(result);
        setInstallTarget(null);
        toast.success(result.success ? "CLI 安装完成" : "CLI 安装未完成", {
          description: result.message,
        });
        refreshReadiness();
      },
      onError: (error) => toast.error("安装失败", { description: error.message }),
    });
  };

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
          title="Agent CLI 启动 / 修复"
          sub="缺失就安装，已安装就生成启动命令；其它配置回所属页面。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={refreshReadiness}
            >
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
                  <TableHead className="hidden min-w-[260px] lg:table-cell">下一步</TableHead>
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
                            <div className="truncate text-sm text-muted">{installed ? binary?.path || purpose : "缺少二进制，需先修复"}</div>
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
                          {installed ? "生成启动命令 → 复制 → IDE 终端运行" : "安装 CLI → 刷新检测 → 完成登录"}
                        </div>
                        <div className="max-w-[36rem] truncate text-xs text-subtle">
                          {installed ? binary?.version || binary?.path || "已安装" : installTarget?.installHint || "请按项目文档安装后刷新。"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          {installed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              title="解析可复制的启动命令"
                              disabled={launch.isPending}
                              onClick={() => resolveLaunch(id)}
                            >
                              <Play />
                              启动命令
                            </Button>
                          ) : (
                            <>
                              {binary?.installSupported ? (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  title="确认后在本机执行后端安装流程"
                                  disabled={installCli.isPending}
                                  onClick={() => setInstallTarget(id)}
                                >
                                  <Download />
                                  安装
                                </Button>
                              ) : null}
                              {installTarget?.installHint ? (
                                <Button variant="outline" size="sm" onClick={() => copyText(installTarget.installHint)}>
                                  <Copy />
                                  复制提示
                                </Button>
                              ) : null}
                            </>
                          )}
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

      {installResult ? (
        <Panel>
          <PanelHead
            title="安装结果"
            sub={installResult.message}
            action={<Button variant="outline" size="sm" onClick={() => setInstallResult(null)}>清除</Button>}
          />
          <div className="grid gap-2 p-4">
            {installResult.results.map((result) => (
              <div key={result.cli} className="rounded-md border border-line bg-panel-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink-strong">{result.label}</strong>
                  <ToneBadge tone={result.success ? "ok" : "bad"}>
                    {result.success ? (result.alreadyInstalled ? "已存在" : "成功") : "失败"}
                  </ToneBadge>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {result.command || result.error || result.path || "无安装命令记录"}
                </div>
                {result.stderr ? <pre className="mt-2 max-h-32 overflow-auto rounded-sm bg-panel px-2 py-1 text-xs text-red">{result.stderr}</pre> : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

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

      <Dialog open={Boolean(installTarget)} onOpenChange={(open) => !open && setInstallTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安装 {selectedInstallTarget?.label || selectedInstallBinary?.label || installTarget}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>这会在本机执行后端安装流程。它只安装 CLI 二进制，不会登录你的 OpenAI / Anthropic / OpenCode 账号，也不会写入模型 Provider 密钥。</p>
            <div className="mt-3 rounded-md border border-line bg-panel-2 p-3 text-sm text-ink">
              {selectedInstallTarget?.installHint || selectedInstallTarget?.packageName || "后端将选择可用安装方式。"}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallTarget(null)}>取消</Button>
            <Button variant="primary" disabled={!installTarget || installCli.isPending} onClick={runInstall}>确认安装</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Panel>
        <PanelHead
          title="修复队列"
          sub="只列出会阻断 CLI 启动的事项；全部正常时保持安静。"
          action={<ToneBadge tone={missingAgentBinaries.length > 0 || !gatewayReady || !ptyAvailable ? "warn" : "ok"}>
            {missingAgentBinaries.length + (gatewayReady ? 0 : 1) + (ptyAvailable ? 0 : 1)} 项
          </ToneBadge>}
        />
        <div className="divide-y divide-line">
          {missingAgentBinaries.map(({ id, label }) => {
            const binary = byId.get(id);
            const target = installTargetById.get(id);
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${toneIconClass("warn")}`}><Download className="size-4" /></span>
                <span className="min-w-0 flex-1 basis-[180px]">
                  <strong className="block truncate text-sm text-ink-strong">安装 {label}</strong>
                  <span className="block truncate text-xs text-muted">{target?.installHint || target?.packageName || "缺少安装提示"}</span>
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {binary?.installSupported ? <Button variant="primary" size="sm" onClick={() => setInstallTarget(id)}>安装</Button> : null}
                  {target?.installHint ? <Button variant="outline" size="sm" onClick={() => copyText(target.installHint)}>复制提示</Button> : null}
                </div>
              </div>
            );
          })}
          {!gatewayReady ? (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${toneIconClass("warn")}`}><Plug className="size-4" /></span>
              <span className="min-w-0 flex-1 basis-[180px]">
                <strong className="block truncate text-sm text-ink-strong">检查模型网关路由</strong>
                <span className="block truncate text-xs text-muted">{health ? `${health.okProviders} 正常 · ${health.degradedProviders} 降级 · ${health.openCircuits} 熔断` : "状态未加载"}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => (window.location.hash = "#/model-gateway")}>打开网关<ExternalLink /></Button>
            </div>
          ) : null}
          {!ptyAvailable ? (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${toneIconClass("warn")}`}><Terminal className="size-4" /></span>
              <span className="min-w-0 flex-1 basis-[180px]">
                <strong className="block truncate text-sm text-ink-strong">PTY 不可用</strong>
                <span className="block truncate text-xs text-muted">无法在 IDE 终端完成登录、启动或修复。</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => (window.location.hash = "#/ide")}>打开 IDE<ExternalLink /></Button>
            </div>
          ) : null}
          {missingAgentBinaries.length === 0 && gatewayReady && ptyAvailable ? (
            <div className="px-4 py-3 text-sm text-muted">没有阻断项。选择上方 CLI 解析启动命令即可运行。</div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

export default CliRuntimeView;
