import * as React from "react";
import { AlertTriangle, ChevronDown, RefreshCw, RotateCw, Server } from "lucide-react";

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
  useManageRecoveryDaemonServiceMutation,
  useRecoveryDaemonServiceQuery,
} from "@/lib/query/recovery";
import type {
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryDaemonServiceAction,
} from "../types";
import { CommandEvidence, formatTime } from "./shared";

function serviceStateBadge(activeState: string): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  const text = (activeState || "").toLowerCase();
  if (/active|running/.test(text)) return { variant: "ok", label: activeState };
  if (/fail|dead|error|stop/.test(text)) return { variant: "bad", label: activeState || "未知" };
  if (/activating|reload|stale/.test(text)) return { variant: "warn", label: activeState };
  return { variant: "mute", label: activeState || "未知" };
}

/**
 * Recovery daemon service status + guarded lifecycle controls for the Overview
 * console. Collapsible secondary placement. The safe `status` refresh sits up
 * front; `restart` and `stop` REWRITE service state and are gated behind a
 * strong confirmation (restart briefly drops the self-heal guard; stop disables
 * it entirely) — never one-click. Each action surfaces the real command log as
 * evidence.
 *
 * Bound to `useRecoveryDaemonServiceQuery` +
 * `useManageRecoveryDaemonServiceMutation`.
 */
export function RecoveryServicePanel() {
  const serviceQuery = useRecoveryDaemonServiceQuery();
  const manageMutation = useManageRecoveryDaemonServiceMutation();

  const [openPanel, setOpenPanel] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "restart" | "stop">(null);
  const [evidence, setEvidence] = React.useState<OpenClawRecoveryCommandSnapshot[] | null>(null);

  const data = serviceQuery.data;
  const badge = serviceStateBadge(data?.activeState ?? "");

  const run = (action: OpenClawRecoveryDaemonServiceAction, successMsg: string) => {
    manageMutation.mutate(
      { action, runCommands: action !== "status" },
      {
        onSuccess: (result) => {
          setEvidence(result.commands);
          const failed = result.commands.find((cmd) => !cmd.ok);
          if (!result.ok || failed) {
            toast.error(`${successMsg}：命令返回错误`, {
              description: result.error || failed?.stderr || failed?.error || undefined,
            });
          } else {
            toast.success(successMsg, {
              description: `服务状态：${result.service.activeState || "未知"}`,
            });
          }
          void serviceQuery.refetch();
        },
        onError: (error) => toast.error("操作失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  const pending = manageMutation.isPending;

  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <button
        type="button"
        onClick={() => setOpenPanel((v) => !v)}
        aria-expanded={openPanel}
        className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
          <Server />
        </span>
        <div className="min-w-0">
          <h3 className="text-md font-semibold text-ink-strong">恢复守护服务</h3>
          <span className="truncate text-sm text-subtle">
            {data?.serviceName ?? "tracevane-recovery.service"}
          </span>
        </div>
        <Badge variant={badge.variant} className="ml-auto">
          {data?.installed ? badge.label : "未安装"}
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
          {serviceQuery.isLoading ? (
            <SkeletonRow />
          ) : serviceQuery.error ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-red">{serviceQuery.error.message}</span>
              <Button variant="outline" size="sm" onClick={() => void serviceQuery.refetch()}>
                <RefreshCw />
                重试
              </Button>
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">已安装</dt>
                  <dd className="text-ink-strong">{data?.installed ? "是" : "否"}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">激活状态</dt>
                  <dd className="text-ink-strong">{data?.activeState || "未知"}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">开机自启</dt>
                  <dd className="text-ink-strong">{data?.enabledState || "未知"}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-subtle">supervisor</dt>
                  <dd className="text-ink-strong">{data?.supervisor || "未知"}</dd>
                </div>
                <div className="col-span-2 grid min-w-0 gap-0.5 sm:col-span-1">
                  <dt className="text-xs text-subtle">最后检查</dt>
                  <dd className="truncate text-ink-strong">{formatTime(data?.lastCheckedAt)}</dd>
                </div>
              </dl>

              {/* Safe refresh. */}
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

              {evidence && (
                <div className="grid gap-1.5 rounded-sm border border-line bg-panel-2 p-3">
                  <span className="text-xs font-semibold text-subtle">动作证据（实际执行的命令）</span>
                  <CommandEvidence commands={evidence} />
                </div>
              )}

              {/* Danger area — stop disables the self-heal guard. */}
              <div className="grid gap-2 rounded-sm border border-red bg-red-soft p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-red">
                  <AlertTriangle className="size-4" />
                  危险操作
                </div>
                <p className="text-xs text-muted">
                  停止恢复守护服务会关闭自愈监控：网关失联时将不再自动探测与修复，直到你重新启动服务。
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start text-red hover:bg-red-soft"
                  onClick={() => setConfirm("stop")}
                  disabled={pending || !data?.installed}
                >
                  停止服务
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Restart confirmation. */}
      <Dialog open={confirm === "restart"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <RotateCw />
            </span>
            <DialogTitle>重启恢复守护服务</DialogTitle>
          </DialogHeader>
          <DialogBody>
            重启会通过 supervisor 执行命令重写服务运行状态，期间自愈监控会短暂中断（通常数秒）。完成后会展示实际执行的命令证据。确认重启？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => run("restart", "已重启恢复守护服务")}
              disabled={pending}
            >
              {pending ? "重启中…" : "确认重启"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop confirmation — strong warning. */}
      <Dialog open={confirm === "stop"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>停止恢复守护服务</DialogTitle>
          </DialogHeader>
          <DialogBody>
            停止后自愈守护将下线：网关探测与自动修复都不再运行，直到你手动重新启动服务。这会重写服务运行状态。确认停止？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => run("stop", "已停止恢复守护服务")}
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
