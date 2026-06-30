import * as React from "react";
import {
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  RotateCw,
  Server,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { SkeletonRow } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import {
  useManageModelGatewayDaemonServiceMutation,
  useModelGatewayDaemonServiceQuery,
} from "@/lib/query/model-gateway";
import type {
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceCommandResult,
  ModelGatewayLocalDaemonState,
} from "../types";

const DAEMON_STATE_BADGE: Record<
  ModelGatewayLocalDaemonState,
  { variant: "ok" | "warn" | "bad" | "mute"; label: string }
> = {
  running: { variant: "ok", label: "运行中" },
  stale: { variant: "warn", label: "陈旧" },
  stopped: { variant: "bad", label: "已停止" },
  "not-installed": { variant: "mute", label: "未安装" },
  unknown: { variant: "mute", label: "未知" },
};

/** Pick the most informative command result to show as evidence. */
function lastCommand(
  results: ModelGatewayDaemonServiceCommandResult[],
): ModelGatewayDaemonServiceCommandResult | null {
  if (results.length === 0) return null;
  return results[results.length - 1];
}

/**
 * Gateway daemon service status + guarded lifecycle controls for the Overview
 * cockpit. Collapsible secondary placement. Safe ops (status refresh / restart)
 * sit up front; `stop` is isolated in a clearly-marked danger area with strong
 * confirmation because it disables the gateway entirely.
 *
 * Bound to `useModelGatewayDaemonServiceQuery` +
 * `useManageModelGatewayDaemonServiceMutation`.
 */
export function DaemonServicePanel({
  enabled = false,
  onEnable,
  onMutated,
}: {
  enabled?: boolean;
  onEnable?: () => void;
  onMutated?: () => void;
}) {
  const serviceQuery = useModelGatewayDaemonServiceQuery({ enabled });
  const manageMutation = useManageModelGatewayDaemonServiceMutation();

  const [openPanel, setOpenPanel] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "restart" | "stop">(null);
  const [evidence, setEvidence] =
    React.useState<ModelGatewayDaemonServiceCommandResult | null>(null);

  const data = serviceQuery.data;
  const local = data?.lifecycle.localDaemon;
  const manager = data?.serviceManager;
  const serviceName = data?.plan.serviceName ?? local?.supervisor.serviceName;
  const endpoint =
    local?.endpoint ?? data?.lifecycle.endpointPolicy.preferredCliEndpoint;
  const stateBadge = local
    ? DAEMON_STATE_BADGE[local.state]
    : DAEMON_STATE_BADGE.unknown;

  const run = (action: ModelGatewayDaemonServiceAction, successMsg: string) => {
    manageMutation.mutate(
      { action, runCommands: true },
      {
        onSuccess: (result) => {
          onMutated?.();
          const cmd = lastCommand(result.commandsRun);
          setEvidence(cmd);
          if (cmd && !cmd.ok) {
            toast.error(`${successMsg}：命令返回非零`, {
              description:
                cmd.stderr || cmd.error || `exit ${cmd.exitCode ?? "?"}`,
            });
          } else {
            toast.success(successMsg, {
              description: cmd
                ? cmd.label
                : `状态：${result.lifecycle.localDaemon.state}`,
            });
          }
          void serviceQuery.refetch();
        },
        onError: (error) =>
          toast.error("操作失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  const pending = manageMutation.isPending;

  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (!openPanel) onEnable?.();
          setOpenPanel((v) => !v);
        }}
        aria-expanded={openPanel}
        className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
          <Server />
        </span>
        <div className="min-w-0">
          <h3 className="text-md font-semibold text-ink-strong">守护服务</h3>
          <span className="truncate text-sm text-subtle">
            {serviceName ?? "Gateway 守护进程"}
          </span>
        </div>
        <Badge variant={stateBadge.variant} className="ml-auto">
          {stateBadge.label}
        </Badge>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-subtle transition-transform",
            openPanel && "rotate-180",
          )}
        />
      </button>

      {openPanel && (
        <div className="grid gap-3 p-4">
          {!enabled ? (
            <div className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
              守护服务状态将在展开后读取，避免首页首屏被 supervisor 探测阻塞。
            </div>
          ) : serviceQuery.isLoading ? (
            <SkeletonRow />
          ) : serviceQuery.error ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-red">
                {serviceQuery.error.message}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void serviceQuery.refetch()}
              >
                <RefreshCw />
                重试
              </Button>
            </div>
          ) : (
            <>
              {/* Status facts — live fields only. */}
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">激活</dt>
                  <dd className="text-ink-strong">
                    {manager?.active == null
                      ? "未知"
                      : manager.active
                        ? "是"
                        : "否"}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">开机自启</dt>
                  <dd className="text-ink-strong">
                    {manager?.enabled == null
                      ? "未知"
                      : manager.enabled
                        ? "是"
                        : "否"}
                  </dd>
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <dt className="text-xs text-subtle">端点</dt>
                  <dd className="truncate text-ink-strong">
                    {endpoint ?? "—"}
                  </dd>
                </div>
              </dl>
              {manager?.lastError && (
                <p className="flex items-start gap-1.5 text-sm text-amber">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {manager.lastError}
                </p>
              )}

              {/* Safe-ish controls. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => run("status", "已刷新服务状态")}
                  disabled={pending}
                >
                  <RefreshCw className={cn(pending && "animate-spin")} />
                  刷新状态
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setConfirm("restart")}
                  disabled={pending}
                >
                  <RotateCw />
                  重启
                </Button>
              </div>

              {/* Action evidence from the last command run. */}
              {evidence && (
                <div className="grid gap-1 rounded-sm border border-line bg-panel-2 p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={evidence.ok ? "ok" : "bad"}>
                      {evidence.ok ? "成功" : "失败"}
                    </Badge>
                    <span className="truncate text-sm text-ink-strong">
                      {evidence.label}
                    </span>
                  </div>
                  <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
                    {(
                      evidence.stdout ||
                      evidence.stderr ||
                      evidence.error ||
                      "(无输出)"
                    ).trim()}
                  </code>
                </div>
              )}

              {/* Danger area — stop disables the gateway. */}
              <div className="grid gap-2 rounded-sm border border-red bg-red-soft p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-red">
                  <AlertTriangle className="size-4" />
                  危险操作
                </div>
                <p className="text-xs text-muted">
                  停止守护服务会让网关下线，所有客户端立即断连，直到重新启动。
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start text-red hover:bg-red-soft"
                  onClick={() => setConfirm("stop")}
                  disabled={pending}
                >
                  停止服务
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Restart confirmation. */}
      <Dialog
        open={confirm === "restart"}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <RotateCw />
            </span>
            <DialogTitle>重启守护服务</DialogTitle>
          </DialogHeader>
          <DialogBody>
            重启会短暂中断网关服务（通常数秒），期间客户端请求可能失败。确认重启？
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirm(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => run("restart", "已重启守护服务")}
              disabled={pending}
            >
              {pending ? "重启中…" : "确认重启"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop confirmation — strong warning. */}
      <Dialog
        open={confirm === "stop"}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>停止守护服务</DialogTitle>
          </DialogHeader>
          <DialogBody>
            停止后网关将下线，所有客户端会立即断连，直到你手动重新启动服务。确认停止？
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirm(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => run("stop", "已停止守护服务")}
              disabled={pending}
            >
              {pending ? "停止中…" : "确认停止"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
