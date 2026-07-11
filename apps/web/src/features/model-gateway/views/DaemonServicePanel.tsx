import * as React from "react";
import { AlertTriangle, ChevronDown, RefreshCw, Server } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { ConfirmDialog } from "@/design/ui/action-dialog";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import {
  useManageModelGatewayDaemonServiceMutation,
  useModelGatewayDaemonServiceQuery,
} from "@/lib/query/model-gateway";
import {
  canStopService,
  canUninstallService,
  primaryServiceAction,
  serviceModeCopy,
  serviceModeLabel,
  serviceStateBadge,
  serviceStateLabel,
  supervisorErrorCopy,
  supervisorLabel,
} from "@/shared/service-supervisor";
import { SkeletonRow } from "@/shared/states/Skeleton";
import type { TracevaneServiceMode } from "../../../../../../types/supervisor";
import type {
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceResponse,
} from "../types";

type PanelAction = Extract<
  ModelGatewayDaemonServiceAction,
  "install" | "repair" | "start" | "restart" | "stop" | "uninstall"
>;

function actionLabel(action: PanelAction): string {
  switch (action) {
    case "install":
      return "安装并启动";
    case "repair":
      return "修复并重启";
    case "start":
      return "启动服务";
    case "restart":
      return "重启服务";
    case "stop":
      return "停止服务";
    case "uninstall":
      return "卸载服务";
  }
}

function confirmationCopy(action: PanelAction, mode: TracevaneServiceMode): string {
  const impact = "进行中的模型请求可能失败或重连；嵌入式回退在适用时仍可能继续。";
  switch (action) {
    case "install":
      return `将在当前用户范围注册并启动守护服务，先停止会话托管实例，不会请求管理员或 root 权限。${impact}`;
    case "repair":
      return `将重写当前用户守护服务定义并重启，保留业务配置。${impact}`;
    case "start":
      return mode === "session"
        ? `将启动 API 会话托管实例，并停止同一服务的系统守护实例。${impact}`
        : `将启动当前用户守护服务，并停止同一服务的 API 会话实例。${impact}`;
    case "restart":
      return `将重启当前${serviceModeLabel(mode)}实例。${impact}`;
    case "stop":
      return mode === "session"
        ? `仅停止 API 拥有的会话实例，不会卸载系统守护服务。${impact}`
        : `停止系统守护实例，但保留安装与登录启动配置。${impact}`;
    case "uninstall":
      return `将停止并注销当前用户守护服务、移除服务定义；业务数据、日志和状态文件会保留。${impact}`;
  }
}

function commandDiagnostic(
  command: ModelGatewayDaemonServiceResponse["commandsRun"][number],
): string {
  return [command.stdout, command.stderr, command.errorMessage, command.error]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n") || "(无输出)";
}

export function DaemonServicePanel({
  enabled = false,
  onEnable,
}: {
  enabled?: boolean;
  onEnable?: () => void;
}) {
  const [mode, setMode] = React.useState<TracevaneServiceMode>("session");
  const [openPanel, setOpenPanel] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<PanelAction | null>(null);
  const [lastResult, setLastResult] = React.useState<{
    mode: TracevaneServiceMode;
    result: ModelGatewayDaemonServiceResponse;
  } | null>(null);
  const panelTriggerId = React.useId();
  const panelRegionId = React.useId();

  const serviceQuery = useModelGatewayDaemonServiceQuery(mode, { enabled });
  const manageMutation = useManageModelGatewayDaemonServiceMutation();
  const data = serviceQuery.data;
  const manager = data?.manager;
  const serviceName = data?.plan.serviceName ?? "Gateway 守护进程";
  const endpoint = data?.lifecycle.localDaemon.endpoint ??
    data?.lifecycle.endpointPolicy.preferredCliEndpoint ?? "—";
  const primaryAction = manager ? primaryServiceAction(manager) : null;
  const stateBadge = manager ? serviceStateBadge(manager.state) : "mute";
  const structuredError = manager ? supervisorErrorCopy(manager.errorCode) : null;
  const canStop = manager ? canStopService(manager) : false;
  const canUninstall = manager ? canUninstallService(manager) : false;
  const pending = manageMutation.isPending;
  const visibleResult = lastResult?.mode === mode ? lastResult.result : null;
  const diagnosticCommands = visibleResult?.commandsRun ?? data?.commandsRun ?? [];
  const diagnosticMessage = visibleResult?.manager.errorMessage ??
    manageMutation.error?.message ?? manager?.errorMessage ?? null;

  const selectMode = (nextMode: TracevaneServiceMode) => {
    if (nextMode === mode || pending) return;
    setLastResult(null);
    manageMutation.reset();
    setMode(nextMode);
  };

  const run = (action: PanelAction) => {
    manageMutation.mutate(
      { action, mode, apply: true },
      {
        onSuccess: (result) => {
          setLastResult({ mode, result });
          if (!result.ok) {
            toast.error(`${actionLabel(action)}失败`, {
              description: supervisorErrorCopy(result.manager.errorCode) ?? "操作未完成，请查看诊断信息。",
            });
          } else {
            toast.success(`${actionLabel(action)}完成`, {
              description: `服务状态：${serviceStateLabel(result.manager.state)}`,
            });
            if (action === "uninstall") setMode("session");
          }
        },
        onError: () => toast.error("操作失败", {
          description: "无法完成服务操作，请查看诊断信息。",
        }),
        onSettled: () => setConfirmAction(null),
      },
    );
  };

  return (
    <section
      className="rounded-md border border-line bg-panel shadow-sm"
      aria-busy={pending}
    >
      <button
        id={panelTriggerId}
        type="button"
        onClick={() => {
          if (!openPanel) onEnable?.();
          setOpenPanel((value) => !value);
        }}
        aria-expanded={openPanel}
        aria-controls={panelRegionId}
        className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
          <Server />
        </span>
        <div className="min-w-0">
          <h3 className="text-md font-semibold text-ink-strong">守护服务</h3>
          <span className="block truncate text-sm text-subtle" title={serviceName}>
            {serviceName}
          </span>
        </div>
        <Badge variant={stateBadge} className="ml-auto">
          {manager ? serviceStateLabel(manager.state) : "未检测"}
        </Badge>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-subtle transition-transform",
            openPanel && "rotate-180",
          )}
        />
      </button>

      {openPanel ? (
        <div
          id={panelRegionId}
          role="region"
          aria-labelledby={panelTriggerId}
          className="grid gap-3 p-4"
        >
          <div role="group" aria-label="托管模式" className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "session" ? "default" : "outline"}
              aria-pressed={mode === "session"}
              disabled={pending}
              onClick={() => selectMode("session")}
            >
              会话托管
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "persistent" ? "default" : "outline"}
              aria-pressed={mode === "persistent"}
              disabled={pending}
              onClick={() => selectMode("persistent")}
            >
              系统守护
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted">{serviceModeCopy(mode)}</p>

          {!enabled || serviceQuery.isLoading ? (
            <SkeletonRow />
          ) : serviceQuery.error ? (
            <div className="grid gap-2">
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-red">无法读取服务状态，请查看诊断信息。</span>
                <Button variant="outline" size="sm" onClick={() => void serviceQuery.refetch()}>
                  <RefreshCw />
                  重试
                </Button>
              </div>
              <details className="rounded-sm border border-line bg-panel-2 p-3 text-sm">
                <summary className="cursor-pointer select-none font-medium text-muted">原始诊断</summary>
                <p className="mt-2 break-words text-muted">{serviceQuery.error.message}</p>
              </details>
            </div>
          ) : manager ? (
            <div className="grid gap-3">
              <p role="status" aria-live="polite" className="text-sm text-muted">
                当前状态：{serviceStateLabel(manager.state)}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">模式</dt>
                  <dd className="text-ink-strong">{serviceModeLabel(manager.mode)}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">Supervisor</dt>
                  <dd className="text-ink-strong">{supervisorLabel(manager.supervisor)}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">已安装</dt>
                  <dd className="text-ink-strong">
                    {manager.mode === "session" ? "不注册" : manager.installed ? "是" : "否"}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">激活</dt>
                  <dd className="text-ink-strong">
                    {manager.active == null ? "未检测" : manager.active ? "是" : "否"}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">开机自启</dt>
                  <dd className="text-ink-strong">
                    {manager.mode === "session"
                      ? "不适用"
                      : manager.enabled == null
                        ? "未检测"
                        : manager.enabled
                          ? "是"
                          : "否"}
                  </dd>
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <dt className="text-xs text-subtle">端点</dt>
                  <dd className="truncate text-ink-strong" title={endpoint}>{endpoint}</dd>
                </div>
              </dl>

              {structuredError ? (
                <p role="alert" className="flex items-start gap-1.5 text-sm text-amber">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {structuredError}
                </p>
              ) : null}
              {manager.state === "starting" ? (
                <p className="text-sm text-muted">服务正在启动；请稍后刷新状态。</p>
              ) : null}
              {manager.state === "unknown" ? (
                <p className="text-sm text-muted">当前状态无法确认；请查看诊断信息后再操作。</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void serviceQuery.refetch()}
                  disabled={pending || serviceQuery.isFetching}
                >
                  <RefreshCw className={cn(serviceQuery.isFetching && "animate-spin")} />
                  刷新状态
                </Button>
                {primaryAction ? (
                  <Button size="sm" onClick={() => setConfirmAction(primaryAction)} disabled={pending}>
                    {actionLabel(primaryAction)}
                  </Button>
                ) : null}
                {canStop ? (
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction("stop")} disabled={pending}>
                    停止服务
                  </Button>
                ) : null}
                {canUninstall ? (
                  <Button variant="ghost" size="sm" className="text-red" onClick={() => setConfirmAction("uninstall")} disabled={pending}>
                    卸载服务
                  </Button>
                ) : null}
              </div>

              {diagnosticMessage || diagnosticCommands.length > 0 ? (
                <details className="rounded-sm border border-line bg-panel-2 p-3 text-sm">
                  <summary className="cursor-pointer select-none font-medium text-muted">原始诊断</summary>
                  <div className="mt-3 grid gap-2">
                    {diagnosticMessage ? <p className="break-words text-muted">{diagnosticMessage}</p> : null}
                    {diagnosticCommands.map((command, index) => (
                      <div key={`${command.label}-${index}`} className="grid gap-1">
                        <span className="text-xs font-semibold text-subtle">{command.label}</span>
                        <code className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-panel-3 p-2 font-mono text-xs text-muted">
                          {commandDiagnostic(command)}
                        </code>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <p role="status" aria-live="polite" className="text-sm text-muted">尚未取得服务状态。</p>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction ? actionLabel(confirmAction) : "确认操作"}
        description={confirmAction ? confirmationCopy(confirmAction, mode) : "请确认服务操作。"}
        icon={<AlertTriangle />}
        tone={confirmAction === "stop" || confirmAction === "uninstall" ? "danger" : "warning"}
        confirmLabel={confirmAction ? actionLabel(confirmAction) : "确认"}
        busy={pending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction) run(confirmAction);
        }}
      />
    </section>
  );
}
