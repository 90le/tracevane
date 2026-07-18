import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CircleSlash,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Plug,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Terminal,
  Wrench,
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
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { PageHeader } from "@/design/ui/page-header";
import { toast } from "@/design/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/design/ui/tooltip";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";

import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";
import { useInstallTerminalCliMutation } from "@/lib/query/terminal";

import type {
  TerminalBinaryStatus,
  TerminalInstallResponse,
  TerminalInstallTarget,
  TerminalAgentCliId,
  WorkbenchTone,
} from "../types";
import { Panel, PanelHead, formatTime } from "@/design/ui/panel";
import { Fact, ToneBadge, toneIconClass } from "./_shared";

interface AgentCliDescriptor {
  id: TerminalAgentCliId;
  label: string;
  purpose: string;
  installHint: string;
  configHref: string;
  configLabel: string;
  docsHint: string;
}

/** Static first-paint roster. Status API fills these rows later. */
const AGENT_CLI_ROSTER: ReadonlyArray<AgentCliDescriptor> = [
  {
    id: "codex",
    label: "Codex",
    purpose: "OpenAI Codex CLI / code agent",
    installHint: "npm install -g @openai/codex",
    configHref: "#/model-gateway?view=clients",
    configLabel: "配置 Codex 路由",
    docsHint: "安装后在 Workspace 终端完成登录，再回到这里刷新检测。",
  },
  {
    id: "claude",
    label: "Claude Code",
    purpose: "Anthropic Claude Code CLI",
    installHint: "npm install -g @anthropic-ai/claude-code",
    configHref: "#/model-gateway?view=clients",
    configLabel: "配置 Claude 路由",
    docsHint: "需要 Anthropic / Gateway 凭据时，到模型网关统一配置。",
  },
  {
    id: "opencode",
    label: "OpenCode",
    purpose: "OpenCode local agent CLI",
    installHint: "npm install -g opencode-ai",
    configHref: "#/model-gateway?view=clients",
    configLabel: "配置 OpenCode Provider",
    docsHint: "安装后保留本机配置；Tracevane 只做安装、检测和修复入口。",
  },
];

function copyText(value: string, success = "命令已复制"): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value).then(
      () => toast.success(success),
      () =>
        toast.error("复制失败", { description: "浏览器未允许剪贴板访问。" }),
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
  if (ok) toast.success(success);
  else
    toast.error("复制失败", {
      description: "当前浏览器不支持自动复制，请手动选择命令。",
    });
}

function openHash(hash: string): void {
  window.location.hash = hash;
}

function cliTone(
  binary: TerminalBinaryStatus | undefined,
  statusPending: boolean,
) {
  if (statusPending) return "info" as const;
  if (binary?.installed) return "ok" as const;
  return "warn" as const;
}

function cliStatusLabel(
  binary: TerminalBinaryStatus | undefined,
  statusPending: boolean,
) {
  if (statusPending) return "检测中";
  if (binary?.installed) return "已安装";
  return "未安装";
}

function fallbackInstallTarget(
  item: AgentCliDescriptor,
  target: TerminalInstallTarget | undefined,
): Pick<TerminalInstallTarget, "installHint" | "packageName" | "label"> {
  return {
    label: target?.label || item.label,
    packageName: target?.packageName || null,
    installHint: target?.installHint || item.installHint,
  };
}

/**
 * CLI Agents owns installation, configuration handoff, reinstall and repair for
 * Codex / Claude Code / OpenCode. It deliberately renders the roster before
 * status APIs resolve, so the page never feels blocked by local binary probes.
 */
export function CliRuntimeView() {
  const navigate = useNavigate();
  const terminalStatus = useTerminalStatusQuery({
    staleTime: 30_000,
    retry: false,
  });
  const gateway = useModelGatewayStatusQuery({
    staleTime: 30_000,
    retry: false,
  });
  const installCli = useInstallTerminalCliMutation();
  const [installTarget, setInstallTarget] =
    React.useState<TerminalAgentCliId | null>(null);
  const [installMode, setInstallMode] = React.useState<"install" | "reinstall">(
    "install",
  );
  const [installResult, setInstallResult] =
    React.useState<TerminalInstallResponse | null>(null);

  const binaries = terminalStatus.data?.binaries ?? [];
  const byId = new Map<string, TerminalBinaryStatus>(
    binaries.map((binary) => [binary.id, binary] as const),
  );
  const installTargetById = new Map<string, TerminalInstallTarget>(
    (terminalStatus.data?.installTargets ?? []).map(
      (target) => [target.id, target] as const,
    ),
  );

  const statusPending = terminalStatus.isLoading && !terminalStatus.data;
  const ptyAvailable = terminalStatus.data?.ptyAvailable;
  const config = terminalStatus.data?.config;
  const health = gateway.data?.healthSummary;
  const gatewayPending = gateway.isLoading && !gateway.data;
  const gatewayReady = Boolean(
    health && health.okProviders > 0 && health.openCircuits === 0,
  );
  const installedCount = AGENT_CLI_ROSTER.filter(
    ({ id }) => byId.get(id)?.installed,
  ).length;
  const missingAgentBinaries = AGENT_CLI_ROSTER.filter(({ id }) => {
    const binary = byId.get(id);
    return !statusPending && !(binary?.installed ?? false);
  });
  const repairCount =
    missingAgentBinaries.length +
    (!gatewayPending && !gatewayReady ? 1 : 0) +
    (ptyAvailable === false ? 1 : 0) +
    (terminalStatus.error ? 1 : 0);

  const refreshing = terminalStatus.isFetching || gateway.isFetching;
  const envPending = statusPending || gatewayPending;
  const envReadyCount =
    (gatewayReady ? 1 : 0) + (ptyAvailable === true ? 1 : 0);
  const showInstallGuide =
    !statusPending && !terminalStatus.error && installedCount === 0;

  const selectedDescriptor = installTarget
    ? AGENT_CLI_ROSTER.find((item) => item.id === installTarget)
    : null;
  const selectedBinary = installTarget ? byId.get(installTarget) : undefined;
  const selectedInstallTarget = selectedDescriptor
    ? fallbackInstallTarget(
        selectedDescriptor,
        installTargetById.get(selectedDescriptor.id),
      )
    : null;

  const refreshReadiness = () => {
    void terminalStatus.refetch();
    void gateway.refetch();
  };

  const copyAllInstallCommands = () =>
    copyText(
      AGENT_CLI_ROSTER.map((item) => item.installHint).join("\n"),
      "安装命令已复制",
    );

  const openInstallDialog = (
    cli: TerminalAgentCliId,
    mode: "install" | "reinstall",
  ) => {
    setInstallMode(mode);
    setInstallTarget(cli);
  };

  const runInstall = () => {
    if (!installTarget) return;
    installCli.mutate(installTarget, {
      onSuccess: (result) => {
        setInstallResult(result);
        setInstallTarget(null);
        toast.success(result.success ? "CLI 处理完成" : "CLI 处理未完成", {
          description: result.message,
        });
        refreshReadiness();
      },
      onError: (error) =>
        toast.error("安装/修复失败", { description: error.message }),
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-4" data-cli-agents-management-page>
        <PageHeader
          className="px-0"
          title="Agent CLI"
          description="安装、配置、重装与修复 Codex / Claude Code / OpenCode；安装状态、模型网关与终端能力在后台检测完成后自动更新。"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshReadiness}
                disabled={refreshing}
              >
                <RefreshCw className={refreshing ? "animate-spin" : undefined} />
                刷新检测
              </Button>
              <Button variant="outline" size="sm" onClick={copyAllInstallCommands}>
                <Copy />
                复制全部安装命令
              </Button>
            </>
          }
        />

        <MetricRail>
          <MetricTile
            icon={<Terminal />}
            label="已安装运行时"
            tone={
              statusPending
                ? "default"
                : installedCount === AGENT_CLI_ROSTER.length
                  ? "ok"
                  : "warn"
            }
            value={
              statusPending
                ? "检测中"
                : `${installedCount}/${AGENT_CLI_ROSTER.length}`
            }
            hint="Codex · Claude Code · OpenCode"
          />
          <MetricTile
            icon={<ShieldCheck />}
            label="运行环境"
            tone={
              envPending ? "default" : envReadyCount === 2 ? "ok" : "warn"
            }
            value={envPending ? "检测中" : `${envReadyCount}/2`}
            hint="模型网关 · 终端 PTY"
          />
          <MetricTile
            icon={<Wrench />}
            label="待修复"
            tone={repairCount > 0 ? "warn" : "ok"}
            value={repairCount}
            hint={repairCount > 0 ? "见下方修复队列" : "没有阻断项"}
          />
          <MetricTile
            icon={<Clock />}
            label="最近检测"
            tone={terminalStatus.error ? "bad" : "default"}
            value={
              statusPending
                ? "检测中"
                : terminalStatus.error
                  ? "检测失败"
                  : formatTime(terminalStatus.data?.checkedAt)
            }
            hint="本机状态缓存 30 秒"
          />
        </MetricRail>

        <Panel>
          <PanelHead
            title="运行时"
            sub="安装状态与修复建议在后台检测完成后自动更新。"
          />
          {showInstallGuide ? (
            <EmptyState
              className="border-b border-line"
              icon={<Download />}
              title="尚未检测到已安装的 Agent CLI"
              description="在下方任一运行时卡片点击“安装”由后端完成安装，或复制全部安装命令在本机终端手动执行，完成后点击“刷新检测”。"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyAllInstallCommands}
                >
                  <Copy />
                  复制全部安装命令
                </Button>
              }
            />
          ) : null}
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            {AGENT_CLI_ROSTER.map((item) => {
              const binary = byId.get(item.id);
              const target = fallbackInstallTarget(
                item,
                installTargetById.get(item.id),
              );
              const installed = binary?.installed ?? false;
              const tone = cliTone(binary, statusPending);
              return (
                <article
                  key={item.id}
                  className="grid min-w-0 content-start gap-3 rounded-md border border-line bg-panel-2 p-4 shadow-sm transition-[border-color,box-shadow] duration-[var(--dur-2)] ease-[var(--ease-standard)] hover:border-line-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-md ${toneIconClass(tone)}`}
                    >
                      {installed ? (
                        <CheckCircle2 className="size-4" />
                      ) : statusPending ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <CircleSlash className="size-4" />
                      )}
                    </span>
                    <ToneBadge tone={tone}>
                      {cliStatusLabel(binary, statusPending)}
                    </ToneBadge>
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate text-md font-semibold text-ink-strong">
                      {item.label}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-subtle">
                      {item.purpose}
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-0.5">
                    <span className="truncate text-lg font-semibold tabular-nums text-ink-strong">
                      {statusPending
                        ? "检测中"
                        : installed
                          ? binary?.version || "已安装"
                          : "未安装"}
                    </span>
                    <span className="truncate text-xs text-muted">
                      {binary?.path || item.docsHint}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 rounded-sm border border-line bg-panel px-2.5 py-2">
                    <Terminal className="size-3.5 shrink-0 text-subtle" />
                    <code className="truncate font-mono text-xs text-muted">
                      {target.installHint}
                    </code>
                  </div>

                  <p className="truncate text-2xs text-subtle">
                    包：{target.packageName || "本地脚本/手动"}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant={installed ? "outline" : "primary"}
                      size="sm"
                      onClick={() =>
                        openInstallDialog(
                          item.id,
                          installed ? "reinstall" : "install",
                        )
                      }
                    >
                      {installed ? <RotateCcw /> : <Download />}
                      {installed ? "重装/修复" : "安装"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openHash(item.configHref)}
                    >
                      <Settings2 />
                      {item.configLabel}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto px-2"
                          aria-label="复制安装命令"
                          onClick={() => copyText(target.installHint)}
                        >
                          <Copy />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>复制安装命令</TooltipContent>
                    </Tooltip>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-line px-4 py-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-subtle">
                运行环境
              </span>
              <EnvChip
                tone={gatewayPending ? "info" : gatewayReady ? "ok" : "warn"}
                label={`模型网关 · ${gatewayPending ? "检测中" : gatewayReady ? "可用" : "需检查"}`}
              />
              <EnvChip
                tone={
                  statusPending
                    ? "info"
                    : ptyAvailable === false
                      ? "warn"
                      : ptyAvailable
                        ? "ok"
                        : "mute"
                }
                label={`终端 PTY · ${statusPending ? "检测中" : ptyAvailable === false ? "不可用" : ptyAvailable ? "可用" : "—"}`}
              />
            </div>
            <p className="truncate text-xs text-muted">
              {gatewayPending
                ? "网关状态检测中"
                : health
                  ? `${health.okProviders} 正常 · ${health.degradedProviders} 降级 · ${health.openCircuits} 熔断`
                  : "网关状态未加载"}
              {ptyAvailable === false ? " · PTY 不可用" : ""}
            </p>
            <span className="text-xs text-subtle lg:justify-self-end">
              最近检测：
              {statusPending
                ? "检测中"
                : formatTime(terminalStatus.data?.checkedAt)}
            </span>
          </div>
          <div className="grid border-t border-line sm:grid-cols-4 divide-y divide-line sm:divide-x sm:divide-y-0">
            <Fact label="默认模型">
              {config?.model || (statusPending ? "检测中" : "—")}
            </Fact>
            <Fact label="默认 Provider">
              {config?.provider || (statusPending ? "检测中" : "—")}
            </Fact>
            <Fact label="模型网关">
              {gatewayPending ? "检测中" : gatewayReady ? "可用" : "需检查"}
            </Fact>
            <Fact label="终端 PTY">
              {statusPending
                ? "检测中"
                : ptyAvailable === false
                  ? "不可用"
                  : ptyAvailable
                    ? "可用"
                    : "—"}
            </Fact>
          </div>
        </Panel>

        {terminalStatus.error ? (
          <ErrorState
            title="无法加载本机 CLI 状态"
            description={terminalStatus.error.message}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void terminalStatus.refetch()}
              >
                重试
              </Button>
            }
          />
        ) : null}

        {installResult ? (
          <Panel>
            <PanelHead
              title="安装 / 修复结果"
              sub={installResult.message}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInstallResult(null)}
                >
                  清除
                </Button>
              }
            />
            <div className="grid gap-2 p-4">
              {installResult.results.length === 0 ? (
                <EmptyState
                  title="没有需要变更的 CLI"
                  description="后端未返回任何安装或修复记录。"
                />
              ) : null}
              {installResult.results.map((result) => (
                <div
                  key={result.cli}
                  className="rounded-md border border-line bg-panel-2 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-ink-strong">{result.label}</strong>
                    <ToneBadge tone={result.success ? "ok" : "bad"}>
                      {result.success
                        ? result.alreadyInstalled
                          ? "已存在"
                          : "成功"
                        : "失败"}
                    </ToneBadge>
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-muted">
                    {result.command ||
                      result.error ||
                      result.path ||
                      "无安装命令记录"}
                  </div>
                  {result.output ? (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-sm bg-bg px-2 py-1 text-xs text-muted">
                      {result.output}
                    </pre>
                  ) : null}
                  {result.stderr ? (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-sm bg-bg px-2 py-1 text-xs text-danger">
                      {result.stderr}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHead
            title="修复队列"
            sub="只列出会阻断安装、配置或本地登录修复的事项。"
            action={
              <ToneBadge
                tone={
                  repairCount > 0
                    ? "warn"
                    : statusPending || gatewayPending
                      ? "info"
                      : "ok"
                }
              >
                {repairCount} 项
              </ToneBadge>
            }
          />
          <div className="divide-y divide-line">
            {statusPending ? (
              <RepairRow
                icon={<RefreshCw className="animate-spin" />}
                title="正在检测本机 CLI 安装状态"
                subtitle="列表已可操作；检测结果返回后会自动更新每行状态。"
              />
            ) : null}
            {missingAgentBinaries.map((item) => {
              const target = fallbackInstallTarget(
                item,
                installTargetById.get(item.id),
              );
              return (
                <RepairRow
                  key={item.id}
                  icon={<Download />}
                  title={`安装 ${item.label}`}
                  subtitle={target.installHint}
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openInstallDialog(item.id, "install")}
                    >
                      安装
                    </Button>
                  }
                />
              );
            })}
            {!gatewayPending && !gatewayReady ? (
              <RepairRow
                icon={<Plug />}
                title="检查模型网关路由 / Provider"
                subtitle={
                  health
                    ? `${health.okProviders} 正常 · ${health.degradedProviders} 降级 · ${health.openCircuits} 熔断`
                    : "状态未加载"
                }
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openHash("#/model-gateway")}
                  >
                    打开网关
                    <ExternalLink />
                  </Button>
                }
              />
            ) : null}
            {ptyAvailable === false ? (
              <RepairRow
                icon={<Terminal />}
                title="PTY 不可用，无法完成本地登录/修复"
                subtitle="请到 Workspace 终端检查 node-pty 或本机 shell 环境。"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/ide")}
                  >
                    打开 IDE 工作台
                    <ExternalLink />
                  </Button>
                }
              />
            ) : null}
            {!statusPending && !gatewayPending && repairCount === 0 ? (
              <EmptyState
                icon={<CheckCircle2 />}
                title="没有阻断项"
                description="需要重装时可在上方任意 CLI 卡片点击“重装/修复”。"
              />
            ) : null}
          </div>
        </Panel>

        <Dialog
          open={Boolean(installTarget)}
          onOpenChange={(open) => !open && setInstallTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {installMode === "reinstall" ? "重装/修复" : "安装"}{" "}
                {selectedInstallTarget?.label ||
                  selectedDescriptor?.label ||
                  installTarget}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p>
                这会在本机执行后端安装流程，用于安装、重装或修复 CLI
                二进制。它不会登录你的 OpenAI / Anthropic / OpenCode
                账号，也不会写入模型 Provider 密钥。
              </p>
              {selectedBinary?.path ? (
                <p className="mt-2 text-sm text-muted">
                  当前检测路径：{selectedBinary.path}
                </p>
              ) : null}
              <div className="mt-3 rounded-md border border-line bg-panel-2 p-3 text-sm text-ink">
                {selectedInstallTarget?.installHint ||
                  selectedInstallTarget?.packageName ||
                  "后端将选择可用安装方式。"}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstallTarget(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                disabled={!installTarget || installCli.isPending}
                onClick={runInstall}
              >
                {installMode === "reinstall" ? "确认重装/修复" : "确认安装"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

const ENV_CHIP_DOT: Record<WorkbenchTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  info: "bg-primary",
  mute: "bg-subtle",
};

/** Compact readiness pill used in the runtime panel environment strip. */
function EnvChip({ tone, label }: { tone: WorkbenchTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs text-ink">
      <span className={`size-1.5 rounded-full ${ENV_CHIP_DOT[tone]}`} />
      {label}
    </span>
  );
}

function RepairRow({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4 ${toneIconClass("warn")}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 basis-[180px]">
        <strong className="block truncate text-sm text-ink-strong">
          {title}
        </strong>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      {action ? (
        <div className="ml-auto flex flex-wrap gap-2">{action}</div>
      ) : null}
    </div>
  );
}

export default CliRuntimeView;
