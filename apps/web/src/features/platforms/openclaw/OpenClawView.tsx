import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Gauge,
  HeartPulse,
  LifeBuoy,
  Route,
  Server,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { Panel, PanelHead, EvidenceRow, StatTile, ToneBadge } from "../_shared";
import { OPENCLAW_SECTIONS } from "../sections";
import { usePlatformsAggregate } from "../usePlatformsAggregate";

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

const primarySections = OPENCLAW_SECTIONS.filter((section) => ["guard", "config", "agents", "channels", "bindings", "skills", "services", "logs", "diagnostics"].includes(section.id));

export function OpenClawView() {
  const { isLoading, allFailed, error, refetchAll, sources, recoveryTone } =
    usePlatformsAggregate({ includeDiagnostics: false });

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
        action={<Button variant="outline" size="sm" onClick={refetchAll}>重试</Button>}
      />
    );
  }

  const health = sources.health.data;
  const recovery = sources.recovery.data;
  const gatewayUp = health?.gateway === "online" || health?.gatewayConnected === true;
  const recState = recovery?.status;
  const daemonRunning = Boolean(recovery?.daemon.pid);

  return (
    <div className="grid gap-[18px]">
      <section className="rounded-md border border-line bg-panel shadow-sm">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" asChild><Link to="/platforms"><ArrowLeft />平台目录</Link></Button>
              <Badge variant={gatewayUp ? "ok" : "warn"} className="gap-1.5"><Server className="size-3.5" />运行时 {gatewayUp ? "在线" : "需关注"}</Badge>
              {health?.version ? <Badge variant="mute">v{health.version}</Badge> : null}
              <Badge variant="mute" className="gap-1.5"><Gauge className="size-3.5" />lite overview</Badge>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-ink-strong">OpenClaw 平台运行摘要</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              总览只请求轻量 health / recovery 数据，不触发 doctor、命令探测或完整诊断；需要配置、Agent、Channel、绑定、服务、日志和诊断时进入下方子页面。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="网关" value={<ToneBadge tone={gatewayUp ? "ok" : "warn"}>{gatewayUp ? "在线" : "离线"}</ToneBadge>} sub={health ? `端口 ${health.gatewayPort}` : "等待健康数据"} />
              <StatTile label="守护" value={recState ? <ToneBadge tone={recoveryTone(recState)}>{recState}</ToneBadge> : "—"} sub={daemonRunning ? `pid ${recovery?.daemon.pid}` : "daemon 未运行"} />
              <StatTile label="运行时" value={health?.version ? `v${health.version}` : "—"} sub={health?.nodeVersion ? `node ${health.nodeVersion}` : ""} />
              <StatTile label="运行时长" value={fmtUptime(health?.uptime)} sub={health ? `pid ${health.pid}` : ""} />
            </div>
          </div>
          <div className="grid content-between gap-3 rounded-md border border-line bg-panel-2 p-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-strong"><ShieldCheck className="size-4 text-accent" />边界说明</div>
              <p className="mt-2 text-sm leading-6 text-muted">Platform 管第三方平台原生能力；模型网关、IM、CLI、Workspace 的写入口仍在各自 owner 域，避免重复配置。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild><Link to="/platforms/openclaw/guard"><LifeBuoy />平台守护</Link></Button>
              <Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/diagnostics"><HeartPulse />诊断</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel shadow-sm">
        <PanelHead title="子页面入口" sub="按对象分层进入，不在总览堆叠所有表单与日志。" action={<Badge variant="mute">9 sections</Badge>} />
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {primarySections.map((section) => (
            <Link key={section.id} to={section.path} className="group min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-3 transition hover:border-primary-line hover:bg-accent-soft/40">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel text-muted group-hover:text-accent"><Route className="size-4" /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink-strong">{section.label}</strong><span className="line-clamp-2 text-xs leading-5 text-muted">{section.description}</span></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Panel>
          <PanelHead title="主机与运行时" sub="来自轻量 /api/system/health。" />
          <div className="py-1.5">
            <EvidenceRow label="主机名" value={health?.hostname ?? "—"} />
            <EvidenceRow label="平台 / 架构" value={health ? `${health.platform} · ${health.arch}` : "—"} />
            <EvidenceRow label="网关端口" value={health ? String(health.gatewayPort) : "—"} />
            <EvidenceRow label="SSE 连接" value={health ? String(health.sseConnections) : "—"} />
            <EvidenceRow label="service 状态" value={health ? `${health.serviceState} · ${health.serviceSubState}` : "—"} />
            <EvidenceRow label="检查时间" value={fmtTime(health?.checkedAt)} />
          </div>
        </Panel>

        <Panel>
          <PanelHead title="服务与自愈" sub="来自平台守护状态；修复进入守护页。" action={<Button variant="ghost" size="sm" asChild><Link to="/platforms/openclaw/guard"><Settings2 />管理</Link></Button>} />
          <div className="py-1.5">
            <EvidenceRow label="平台守护状态" value={recState ? <ToneBadge tone={recoveryTone(recState)}>{recState}</ToneBadge> : "—"} />
            <EvidenceRow label="守护版本" value={recovery?.daemon.version || "—"} />
            <EvidenceRow label="心跳" value={fmtTime(recovery?.daemon.heartbeatAt)} />
            <EvidenceRow label="网关可达" value={recovery?.probe.gatewayReachable == null ? "—" : recovery.probe.gatewayReachable ? "是" : "否"} />
            <EvidenceRow label="service 单元" value={recovery?.service.installed ? `${recovery.service.serviceName} · ${recovery.service.activeState}` : "未安装"} />
            <EvidenceRow label="最近修复" value={recovery?.lastRepair ? fmtTime(recovery.lastRepair.finishedAt) : "无"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
