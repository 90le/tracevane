import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Heart,
  KeyRound,
  LifeBuoy,
  Server,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { Panel, PanelHead, EvidenceRow, StatTile, ToneBadge } from "../_shared";
import { usePlatformsAggregate, deriveControlUiUrl } from "../usePlatformsAggregate";

function fmtUptime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * LIGHTWEIGHT OpenClaw platform summary. Shows host / runtime identity,
 * version, service & self-heal health, and a permissions / diagnostics
 * summary derived from existing source APIs. Generic OpenClaw management
 * (config / agents / channels / skills / service) is delegated to the official
 * OpenClaw Control / Web UI and surfaced as a prominent link-out; substrate
 * guard / recovery actions live under `/platforms/openclaw/recovery`.
 * Read-only for generic OpenClaw CRUD — NO duplicated management forms.
 */
export function OpenClawView() {
  const { isLoading, allFailed, error, refetchAll, sources, recoveryTone } =
    usePlatformsAggregate();

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[120px] w-full" />
        <Skeleton className="h-[220px] w-full" />
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载 OpenClaw 平台摘要"
        description={error?.message ?? "所有 OpenClaw 来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  const health = sources.health.data;
  const recovery = sources.recovery.data;
  const diagnostics = sources.diagnostics.data;

  const gatewayUp = health?.gateway === "online" || health?.gatewayConnected === true;
  const recState = recovery?.status;
  const controlUiUrl = deriveControlUiUrl(diagnostics);

  const diagConfig = diagnostics?.config;
  const counts = diagnostics?.counts;

  return (
    <div className="grid gap-[18px]">
      {/* Identity / link back */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/platforms">
            <ArrowLeft />
            平台集成
          </Link>
        </Button>
        <Badge variant={gatewayUp ? "ok" : "warn"} className="gap-1.5">
          <Server className="size-3.5" />
          OpenClaw 运行时
        </Badge>
        {health?.version && <Badge variant="mute">v{health.version}</Badge>}
        <Badge variant="mute" className="ml-auto gap-1.5">
          <ShieldCheck className="size-3.5" />
          只读摘要
        </Badge>
      </div>

      {/* Hero: prominent link out to official OpenClaw UI */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <p className="text-base text-ink-strong">
          OpenClaw 是 Tracevane 依赖的底层运行时平台。
        </p>
        <p className="mt-1 text-sm text-muted">
          OpenClaw 配置、agents、channels、skills、service 与 doctor 的通用管理在官方 OpenClaw Web /
          Control UI 中完成；本页只展示身份 / 健康 / 版本 / 诊断摘要。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {controlUiUrl ? (
            <Button asChild>
              <a href={controlUiUrl} target="_blank" rel="noreferrer">
                打开官方 OpenClaw Control UI
                <ExternalLink />
              </a>
            </Button>
          ) : (
            <Badge variant="warn" className="gap-1.5">
              <ExternalLink className="size-3.5" />
              Control UI 地址未在诊断中暴露（检查 gateway controlUi 配置）
            </Badge>
          )}
          <Button variant="outline" asChild>
            <Link to="/platforms/openclaw/recovery">
              <LifeBuoy />
              平台守护与恢复
            </Link>
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="网关"
            value={<ToneBadge tone={gatewayUp ? "ok" : "warn"}>{gatewayUp ? "在线" : "离线"}</ToneBadge>}
            sub={health ? `端口 ${health.gatewayPort}` : "—"}
          />
          <StatTile
            label="自愈状态"
            value={
              recState ? (
                <ToneBadge tone={recoveryTone(recState)}>{recState}</ToneBadge>
              ) : (
                "—"
              )
            }
            sub={recovery?.daemon.pid ? `daemon pid ${recovery.daemon.pid}` : "守护未运行"}
          />
          <StatTile label="运行时版本" value={health?.version ? `v${health.version}` : "—"} sub={health?.nodeVersion ? `node ${health.nodeVersion}` : ""} />
          <StatTile label="运行时长" value={fmtUptime(health?.uptime)} sub={health ? `pid ${health.pid}` : ""} />
        </div>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-2">
        {/* Runtime / host identity */}
        <Panel>
          <PanelHead title="主机与运行时身份" sub="来自 /api/system/health 与诊断。" />
          <div className="py-1.5">
            <EvidenceRow label="主机名" value={health?.hostname ?? "—"} />
            <EvidenceRow label="平台 / 架构" value={health ? `${health.platform} · ${health.arch}` : "—"} />
            <EvidenceRow label="网关端口" value={health ? String(health.gatewayPort) : "—"} />
            <EvidenceRow label="SSE 连接" value={health ? String(health.sseConnections) : "—"} />
            <EvidenceRow label="service 状态" value={health ? `${health.serviceState} · ${health.serviceSubState}` : "—"} />
            <EvidenceRow label="检查时间" value={fmtTime(health?.checkedAt)} />
          </div>
        </Panel>

        {/* Service / self-heal health */}
        <Panel>
          <PanelHead
            title="服务与自愈健康"
            sub="守护进程 / 探针 / 修复来自平台守护状态。"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/platforms/openclaw/recovery">查看平台守护</Link>
              </Button>
            }
          />
          <div className="py-1.5">
            <EvidenceRow
              label="平台守护状态"
              value={recState ? <ToneBadge tone={recoveryTone(recState)}>{recState}</ToneBadge> : "—"}
            />
            <EvidenceRow label="守护版本" value={recovery?.daemon.version || "—"} />
            <EvidenceRow label="心跳" value={fmtTime(recovery?.daemon.heartbeatAt)} />
            <EvidenceRow
              label="网关可达"
              value={
                recovery?.probe.gatewayReachable == null
                  ? "—"
                  : recovery.probe.gatewayReachable
                    ? "是"
                    : "否"
              }
            />
            <EvidenceRow
              label="service 单元"
              value={recovery?.service.installed ? `${recovery.service.serviceName} · ${recovery.service.activeState}` : "未安装"}
            />
            <EvidenceRow
              label="最近修复"
              value={recovery?.lastRepair ? fmtTime(recovery.lastRepair.finishedAt) : "无"}
            />
          </div>
        </Panel>
      </div>

      {/* Permissions / diagnostics summary */}
      <Panel>
        <PanelHead title="权限与诊断摘要" sub="计数与诊断证据，写入留在官方 OpenClaw UI。" action={<Badge variant="mute">read-only</Badge>} />
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label="agents" value={counts?.agents ?? "—"} sub="官方 UI 管理" />
          <StatTile label="channels" value={counts?.channels ?? "—"} sub="官方 UI 管理" />
          <StatTile label="skills" value={counts?.skills ?? "—"} sub="官方 UI 管理" />
          <StatTile label="bindings" value={counts?.bindings ?? "—"} sub="官方 UI 管理" />
          <StatTile label="cron jobs" value={counts?.cronJobs ?? "—"} sub="官方 UI 管理" />
          <StatTile
            label="安全告警"
            value={diagnostics ? `${diagnostics.status.securityCritical}严重 / ${diagnostics.status.securityWarn}警告` : "—"}
            sub="诊断摘要"
          />
        </div>
        <div className="grid gap-3 px-3 pb-3">
          <div className="flex items-center gap-3 rounded-sm border border-line bg-panel-2 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
              <KeyRound />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-base text-ink-strong">凭据与权限</strong>
              <span className="block truncate text-sm text-muted">
                掩码摘要：本页不展示明文；token / OAuth / secret 写入留在官方 OpenClaw UI。
              </span>
            </span>
            <Badge variant="mute">masked</Badge>
          </div>
          <div className="flex items-center gap-3 rounded-sm border border-line bg-panel-2 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
              <Heart />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-base text-ink-strong">doctor / 配置仓库</strong>
              <span className="block truncate text-sm text-muted">
                {diagConfig?.openclawConfigFile || "配置路径未暴露"}
              </span>
            </span>
            <Badge variant="mute">server-owned</Badge>
          </div>
        </div>
      </Panel>

      <p className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
        OpenClaw 的 config / agents / channels / skills / service / doctor 等通用管理由官方 OpenClaw UI
        负责；本页只读，仅做平台身份 / 健康 / 版本 / 诊断摘要与链接出口。宿主恢复相关动作进入平台守护确认流。
      </p>
    </div>
  );
}
