import * as React from "react";
import {
  Activity,
  Archive,
  HeartPulse,
  History,
  MonitorCheck,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import {
  serviceStateBadge,
  serviceStateLabel,
  supervisorLabel,
} from "@/shared/service-supervisor";

import { useSystemHealthQuery } from "@/lib/query/dashboard";
import { useRecoveryStatusQuery } from "@/lib/query/recovery";
import type { RecoveryViewProps } from "../types";
import {
  Panel,
  PanelHead,
  RECOVERY_STATE_BADGE,
  Row,
  formatDuration,
  formatTime,
  reachabilityLabel,
} from "./shared";
import { RecoveryServicePanel } from "./RecoveryServicePanel";

/** Boolean policy flag → on/off label. */
function flag(value: boolean | undefined): { variant: "ok" | "mute"; label: string } {
  return value ? { variant: "ok", label: "已开启" } : { variant: "mute", label: "未开启" };
}

/**
 * Recovery overview / status console. Aggregates the live recovery state
 * (`/status`), the runtime health snapshot (reused `useSystemHealthQuery`), and
 * the guarded recovery service panel. Pure read surface plus the guarded
 * service controls — issue repair lives in the Issues view.
 */
export function OverviewView({ goToView }: RecoveryViewProps) {
  const statusQuery = useRecoveryStatusQuery();
  const healthQuery = useSystemHealthQuery();

  if (statusQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[150px] w-full" />
        <Panel>
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </Panel>
      </div>
    );
  }

  if (statusQuery.error) {
    return (
      <ErrorState
        title="无法加载平台守护状态"
        description={statusQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void statusQuery.refetch()}>
            <RefreshCw />
            重试
          </Button>
        }
      />
    );
  }

  const status = statusQuery.data!;
  const health = healthQuery.data;
  const stateBadge = RECOVERY_STATE_BADGE[status.status] ?? RECOVERY_STATE_BADGE.unknown;
  const probe = status.probe;
  const repair = status.lastRepair;
  const policy = status.policy;
  const service = status.service;
  const serviceLabel = serviceStateLabel(service.manager.state);
  const serviceBadge = serviceStateBadge(service.manager.state);
  const serviceSupervisor = supervisorLabel(service.manager.supervisor);
  const serviceEnabledLabel = service.manager.mode === "session"
    ? "不适用"
    : service.manager.enabled == null
      ? "未检测"
    : service.manager.enabled
      ? "已启用"
      : "未启用";

  return (
    <div className="grid gap-[18px]">
      {/* Hero: live recovery state + version. */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={stateBadge.variant} className="gap-1.5">
            <HeartPulse className="size-3.5" />
            OpenClaw 平台守护 · {stateBadge.label}
          </Badge>
          <span className="text-sm text-muted">
            守护进程 v{status.daemon.version}
            {health?.version && (
              <>
                <span className="text-subtle"> · </span>
                运行时 v{health.version}
              </>
            )}
          </span>
          <span className="ml-auto text-sm text-subtle">
            检查于 {formatTime(status.checkedAt)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void statusQuery.refetch()}>
            <RefreshCw />
            刷新
          </Button>
        </div>
        <p className="mt-3 text-base text-ink-strong">
          {probe.gatewayReachable === true
            ? "网关可达，OpenClaw 平台守护处于待命状态。"
            : probe.gatewayReachable === false
              ? "网关探测失败，OpenClaw 平台守护正在跟踪故障窗口。"
              : "网关探测状态未知。"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">网关探测</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {reachabilityLabel(probe.gatewayReachable)}
            </div>
            <span className="text-xs text-muted">下次 {formatTime(probe.nextCheckAt)}</span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">守护进程</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {status.daemon.pid ?? "—"}
            </div>
            <span className="text-xs text-muted">
              心跳 {formatTime(status.daemon.heartbeatAt)}
            </span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">上次修复</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {repair ? (repair.ok ? "成功" : "失败") : "无"}
            </div>
            <span className="text-xs text-muted">
              {repair ? formatTime(repair.finishedAt) : "尚未执行修复"}
            </span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">平台守护服务</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {serviceLabel}
            </div>
            <span className="text-xs text-muted">{serviceSupervisor}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Recovery chain — task-continuity facts only. */}
        <Panel>
          <PanelHead
            title="恢复链路"
            sub="支撑任务连续性的运行证据"
            action={
              <Button variant="ghost" size="sm" onClick={() => goToView("issues")}>
                <Activity className="size-3.5" />
                问题与修复
              </Button>
            }
          />
          <div className="py-1.5">
            <Row
              icon={<Wifi />}
              iconClass={
                probe.gatewayReachable === true
                  ? "bg-green-soft text-green"
                  : probe.gatewayReachable === false
                    ? "bg-red-soft text-red"
                    : undefined
              }
              title="网关可达性"
              subtitle={`故障窗口 ${formatDuration(probe.failureDurationMs)} · 最后探测 ${formatTime(probe.checkedAt)}`}
              trailing={
                <Badge
                  variant={
                    probe.gatewayReachable === true
                      ? "ok"
                      : probe.gatewayReachable === false
                        ? "bad"
                        : "mute"
                  }
                >
                  {reachabilityLabel(probe.gatewayReachable)}
                </Badge>
              }
            />
            <Row
              icon={<RefreshCw />}
              title="修复状态"
              subtitle={
                repair
                  ? `${repair.trigger} · ${repair.changedKeys.length} 项变更 · ${formatTime(repair.finishedAt)}`
                  : "尚未执行任何修复"
              }
              trailing={
                <Badge variant={repair ? (repair.ok ? "ok" : "bad") : "mute"}>
                  {repair ? (repair.ok ? "成功" : "失败") : "无"}
                </Badge>
              }
            />
            <Row
              icon={<Server />}
              title="恢复服务"
              subtitle={`${service.serviceName} · ${serviceEnabledLabel}`}
              trailing={
                <Badge variant={serviceBadge}>
                  {serviceLabel}
                </Badge>
              }
            />
            <Row
              icon={<MonitorCheck />}
              title="系统运行时"
              subtitle={
                health
                  ? `${health.platform}/${health.arch} · 网关 ${health.gateway}`
                  : healthQuery.isLoading
                    ? "加载中…"
                    : healthQuery.error
                      ? healthQuery.error.message
                      : "运行时健康不可用"
              }
              trailing={
                health ? (
                  <Badge variant={health.gateway === "online" ? "ok" : "bad"}>
                    {health.gateway === "online" ? "在线" : "离线"}
                  </Badge>
                ) : (
                  <Badge variant="mute">未知</Badge>
                )
              }
            />
          </div>
        </Panel>

        {/* Policy boundaries — read-only live policy. */}
        <Panel>
          <PanelHead title="策略边界" sub="OpenClaw 平台守护的当前配置（只读）" />
          <div className="py-1.5">
            <Row
              icon={<ShieldCheck />}
              title="平台守护"
              subtitle={`探测间隔 ${formatDuration(policy.checkIntervalMs)} · 超时 ${formatDuration(policy.probeTimeoutMs)}`}
              trailing={
                <Badge variant={flag(policy.enabled).variant}>{flag(policy.enabled).label}</Badge>
              }
            />
            <Row
              icon={<Server />}
              title="网关服务修复"
              subtitle={`超时 ${formatDuration(policy.gatewayServiceRepairTimeoutMs)}`}
              trailing={
                <Badge variant={flag(policy.allowGatewayServiceRepair).variant}>
                  {flag(policy.allowGatewayServiceRepair).label}
                </Badge>
              }
            />
            <Row
              icon={<History />}
              title="CLI 重装"
              subtitle={`超时 ${formatDuration(policy.cliReinstallTimeoutMs)}`}
              trailing={
                <Badge variant={flag(policy.allowCliReinstall).variant}>
                  {flag(policy.allowCliReinstall).label}
                </Badge>
              }
            />
            <Row
              icon={<Archive />}
              title="备份保留"
              subtitle={`最多 ${policy.maxBackups} 份配置备份 · 冷却 ${formatDuration(policy.repairCooldownMs)}`}
              trailing={
                <Button variant="ghost" size="sm" onClick={() => goToView("backups")}>
                  查看
                </Button>
              }
            />
          </div>
        </Panel>
      </div>

      {/* Notes surfaced by the recovery daemon — live, not fabricated. */}
      {status.notes.length > 0 && (
        <Panel>
          <PanelHead title="守护说明" sub="OpenClaw 平台守护给出的最新说明" />
          <div className="grid gap-1.5 p-4">
            {status.notes.map((note, index) => (
              <p key={`${index}-${note}`} className="text-sm text-muted">
                · {note}
              </p>
            ))}
          </div>
        </Panel>
      )}

      {status.notes.length === 0 && (
        <Panel>
          <EmptyState
            title="暂无守护说明"
            description="没有说明不代表不可用，继续以上方的状态 / 探测 / 服务为准。"
          />
        </Panel>
      )}

      {/* Guarded service controls. */}
      <RecoveryServicePanel />
    </div>
  );
}
