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

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile, type MetricTone } from "@/design/ui/metric";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import {
  serviceStateBadge,
  serviceStateLabel,
  supervisorLabel,
} from "@/shared/service-supervisor";

import { useSystemHealthQuery } from "@/lib/query/dashboard";
import { useRecoveryStatusQuery } from "@/lib/query/recovery";
import type { OpenClawRecoveryStateKind, RecoveryViewProps } from "../types";
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

/** Current-state banner tone per live recovery state (semantic tokens only). */
const BANNER_TONE: Record<
  OpenClawRecoveryStateKind,
  { shell: string; chip: string }
> = {
  healthy: {
    shell: "border-success-line bg-success-soft",
    chip: "bg-panel text-success",
  },
  degraded: {
    shell: "border-warning-line bg-warning-soft",
    chip: "bg-panel text-warning",
  },
  repairing: {
    shell: "border-warning-line bg-warning-soft",
    chip: "bg-panel text-warning",
  },
  failed: {
    shell: "border-danger-line bg-danger-soft",
    chip: "bg-panel text-danger",
  },
  unknown: {
    shell: "border-line bg-panel-2",
    chip: "bg-panel-3 text-muted",
  },
};

/** Service badge variant → MetricTile tone (mute stays neutral). */
const SERVICE_METRIC_TONE: Record<string, MetricTone> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
};

/**
 * Recovery overview — the status page. Leads with the current-state banner
 * (tone from the live `status`), a MetricRail of the four load-bearing facts,
 * then the detailed recovery-chain / policy evidence and the guarded service
 * controls. Pure read surface plus the guarded service controls — issue
 * repair lives in the Issues view.
 */
export function OverviewView({ goToView }: RecoveryViewProps) {
  const statusQuery = useRecoveryStatusQuery();
  const healthQuery = useSystemHealthQuery();

  if (statusQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[120px] w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-[92px] w-full" />
          <Skeleton className="h-[92px] w-full" />
          <Skeleton className="h-[92px] w-full" />
          <Skeleton className="h-[92px] w-full" />
        </div>
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
  const bannerTone = BANNER_TONE[status.status] ?? BANNER_TONE.unknown;
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
      {/* Current-state banner — the status-page headline. */}
      <section className={cn("rounded-md border p-4 shadow-sm sm:p-5", bannerTone.shell)}>
        <div className="flex flex-wrap items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-[10px] [&_svg]:size-5",
              bannerTone.chip,
            )}
          >
            <HeartPulse />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-subtle">
              平台守护 · 当前状态
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-ink-strong">OpenClaw 平台守护</h2>
              <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink">
              {probe.gatewayReachable === true
                ? "网关可达，OpenClaw 平台守护处于待命状态。"
                : probe.gatewayReachable === false
                  ? "网关探测失败，OpenClaw 平台守护正在跟踪故障窗口。"
                  : "网关探测状态未知。"}
            </p>
            <p className="mt-1.5 text-xs text-subtle">
              守护进程 v{status.daemon.version}
              {health?.version && <> · 运行时 v{health.version}</>}
              {" · 检查于 "}
              {formatTime(status.checkedAt)}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-panel"
            onClick={() => void statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            <RefreshCw className={statusQuery.isFetching ? "animate-spin" : undefined} />
            刷新
          </Button>
        </div>
      </section>

      {/* Key health facts. */}
      <MetricRail aria-label="平台守护关键指标">
        <MetricTile
          label="网关探测"
          value={reachabilityLabel(probe.gatewayReachable)}
          hint={`下次 ${formatTime(probe.nextCheckAt)}`}
          tone={
            probe.gatewayReachable === true
              ? "ok"
              : probe.gatewayReachable === false
                ? "bad"
                : "default"
          }
          icon={<Wifi />}
        />
        <MetricTile
          label="守护进程"
          value={status.daemon.pid ?? "—"}
          hint={`心跳 ${formatTime(status.daemon.heartbeatAt)}`}
          icon={<HeartPulse />}
        />
        <MetricTile
          label="上次修复"
          value={repair ? (repair.ok ? "成功" : "失败") : "无"}
          hint={repair ? formatTime(repair.finishedAt) : "尚未执行修复"}
          tone={repair ? (repair.ok ? "ok" : "bad") : "default"}
          icon={<History />}
        />
        <MetricTile
          label="平台守护服务"
          value={serviceLabel}
          hint={serviceSupervisor}
          tone={SERVICE_METRIC_TONE[serviceBadge] ?? "default"}
          icon={<Server />}
        />
      </MetricRail>

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
                  ? "bg-success-soft text-success"
                  : probe.gatewayReachable === false
                    ? "bg-danger-soft text-danger"
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

      {/* Notes surfaced by the recovery daemon — only when it has some. */}
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

      {/* Guarded service controls. */}
      <RecoveryServicePanel />
    </div>
  );
}
