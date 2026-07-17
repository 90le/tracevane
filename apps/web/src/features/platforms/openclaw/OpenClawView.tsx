import * as React from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Gauge,
  HeartPulse,
  LifeBuoy,
  Link2,
  Puzzle,
  RadioTower,
  ScrollText,
  Server,
  ServerCog,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";

import { Panel, PanelHead, EvidenceRow, ToneBadge, metricTone } from "../_shared";
import { OPENCLAW_SECTIONS } from "../sections";
import type { PlatformSectionId } from "../types";
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

const SECTION_ICONS: Partial<Record<PlatformSectionId, React.ReactNode>> = {
  guard: <LifeBuoy />,
  config: <Settings2 />,
  agents: <Bot />,
  channels: <RadioTower />,
  bindings: <Link2 />,
  skills: <Puzzle />,
  services: <ServerCog />,
  logs: <ScrollText />,
  diagnostics: <HeartPulse />,
};

export function OpenClawView() {
  const { isLoading, allFailed, error, refetchAll, sources, recoveryTone } =
    usePlatformsAggregate({ includeDiagnostics: false });

  if (isLoading) {
    return <LoadingState title="正在加载 OpenClaw 平台摘要…" />;
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
      <MetricRail>
        <MetricTile label="网关" value={gatewayUp ? "在线" : "离线"} tone={gatewayUp ? "ok" : "warn"} hint={health ? `端口 ${health.gatewayPort}` : "等待健康数据"} icon={<Server />} />
        <MetricTile label="守护" value={recState ?? "—"} tone={recState ? metricTone(recoveryTone(recState)) : "default"} hint={daemonRunning ? `pid ${recovery?.daemon.pid}` : "daemon 未运行"} icon={<LifeBuoy />} />
        <MetricTile label="运行时" value={health?.version ? `v${health.version}` : "—"} hint={health?.nodeVersion ? `node ${health.nodeVersion}` : "版本未就绪"} icon={<Gauge />} />
        <MetricTile label="运行时长" value={fmtUptime(health?.uptime)} hint={health ? `pid ${health.pid}` : "等待健康数据"} icon={<HeartPulse />} />
      </MetricRail>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel px-4 py-3 shadow-sm">
        <div className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-6 text-muted">
          <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />
          <span>总览只请求轻量 health / recovery 数据，不触发 doctor、命令探测或完整诊断；Platform 管第三方平台原生能力，模型网关、IM、CLI、Workspace 的写入口仍在各自 owner 域。</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild><Link to="/platforms/openclaw/guard"><LifeBuoy />平台守护</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/diagnostics"><HeartPulse />诊断</Link></Button>
        </div>
      </div>

      <Panel>
        <PanelHead title="子页面入口" sub="按对象分层进入，不在总览堆叠所有表单与日志。" action={<Badge variant="mute">9 个子页</Badge>} />
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {primarySections.map((section) => (
            <Link key={section.id} to={section.path} className="group min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-3 transition hover:border-primary-line hover:bg-primary-soft/40">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel text-muted group-hover:text-primary [&_svg]:size-4">{SECTION_ICONS[section.id] ?? <Server />}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink-strong">{section.label}</strong><span className="line-clamp-2 text-xs leading-5 text-muted">{section.description}</span></span>
              </div>
            </Link>
          ))}
        </div>
      </Panel>

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
