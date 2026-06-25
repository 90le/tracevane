import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, ServerCog } from "lucide-react";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useSystemHealthQuery } from "@/lib/query/dashboard";
import { useRecoveryDaemonServiceQuery, useRecoveryStatusQuery } from "@/lib/query/recovery";
import { BoundaryBadge, DetailRail, EvidenceRow, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, boolText, fmtDate, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";
import type { PlatformTone } from "../../types";

type ServiceRow = { key: string; name: string; state: string; detail: string; owner: string; hint: string; tone: PlatformTone };

function stateTone(state: string): PlatformTone {
  const value = state.toLowerCase();
  if (["online", "active", "running", "healthy"].some((item) => value.includes(item))) return "ok";
  if (["failed", "offline", "error"].some((item) => value.includes(item))) return "bad";
  if (["unknown", "inactive", "disabled", "degraded"].some((item) => value.includes(item))) return "warn";
  return "info";
}

export function ServicesPage() {
  const health = useSystemHealthQuery();
  const recovery = useRecoveryStatusQuery();
  const daemonService = useRecoveryDaemonServiceQuery();
  const service = daemonService.data ?? recovery.data?.service;
  const rows: ServiceRow[] = [
    { key: "gateway", name: "OpenClaw 网关", state: health.data?.gateway ?? "unknown", detail: `端口 ${health.data?.gatewayPort ?? "—"}`, owner: "System health", hint: "模型/平台入口是否可达", tone: stateTone(health.data?.gateway ?? "unknown") },
    { key: "tracevane-service", name: "Tracevane 本地服务", state: health.data?.serviceState ?? "unknown", detail: health.data?.serviceSubState ?? "—", owner: "Tracevane", hint: "当前 Web/API 宿主进程状态", tone: stateTone(health.data?.serviceState ?? "unknown") },
    { key: "recovery-daemon", name: "平台守护进程", state: recovery.data?.daemon.pid ? "active" : "unknown", detail: recovery.data?.daemon.pid ? `pid ${recovery.data.daemon.pid}` : "pid —", owner: "Platform guard", hint: "负责备份、修复与巡检", tone: recovery.data?.daemon.pid ? "ok" : "warn" },
    { key: "supervisor", name: service?.serviceName ?? "守护服务单元", state: service?.activeState ?? "unknown", detail: service?.enabledState ?? "—", owner: service?.supervisor ?? "—", hint: "systemd/launchd/supervisor 管理状态", tone: stateTone(service?.activeState ?? "unknown") },
  ];
  const [selectedKey, setSelectedKey] = useSelectedKey(rows.map((row) => row.key));
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? rows[0];
  if (health.isLoading || recovery.isLoading || daemonService.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (health.error) return <ErrorState title="无法加载服务状态" description={health.error.message} />;
  return <div className="grid gap-[18px]">
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <WorkbenchToolbar title="服务状态" description="只展示服务证据和运行状态；启停、安装、修复统一进入守护页确认流。"><Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard"><Activity />进入守护</Link></Button><RefreshButton loading={health.isFetching || recovery.isFetching || daemonService.isFetching} onClick={() => { void health.refetch(); void recovery.refetch(); void daemonService.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar>
      <div className="grid gap-3 p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><StatTile label="网关" value={<StatusPill tone={stateTone(health.data?.gateway ?? "unknown")}>{health.data?.gateway ?? "unknown"}</StatusPill>} sub={`端口 ${health.data?.gatewayPort ?? "—"}`} /><StatTile label="Tracevane 服务" value={health.data?.serviceState ?? "—"} sub={health.data?.serviceSubState ?? "—"} /><StatTile label="平台守护" value={recovery.data?.daemon.pid ?? "—"} sub={recovery.data?.daemon.version ?? "daemon 未运行"} /><StatTile label="Supervisor" value={service?.supervisor ?? "—"} sub={service?.serviceName ?? "—"} /></div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-md border border-line bg-panel">
            <ResponsiveTable columns={["服务", "状态", "说明", "来源"]} rows={rows.map((row) => <SelectableRow key={row.key} id={row.key} selected={selectedKey === row.key} onSelect={setSelectedKey}><td className="max-w-[280px] px-4 py-3"><div className="truncate font-medium text-ink-strong">{row.name}</div><div className="truncate text-xs text-muted">{row.hint}</div></td><td className="px-4 py-3"><StatusPill tone={row.tone}>{row.state}</StatusPill></td><td className="max-w-[260px] truncate px-4 py-3 text-muted">{row.detail}</td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{row.owner}</td></SelectableRow>)} empty="无服务证据" />
          </div>
          <DetailRail title={selectedRow?.name ?? "未选择服务"} subtitle={selectedRow ? `${selectedRow.owner} · ${selectedRow.hint}` : "—"}>
            <EvidenceRow label="当前状态" value={selectedRow ? <StatusPill tone={selectedRow.tone}>{selectedRow.state}</StatusPill> : "—"} />
            <EvidenceRow label="状态详情" value={selectedRow?.detail ?? "—"} />
            <EvidenceRow label="已安装" value={boolText(service?.installed)} />
            <EvidenceRow label="激活状态" value={service?.activeState ?? "—"} />
            <EvidenceRow label="开机自启" value={service?.enabledState ?? "—"} />
            <EvidenceRow label="配置路径" value={service?.configPath ?? "—"} />
            <EvidenceRow label="最后检查" value={fmtDate(service?.lastCheckedAt)} />
          </DetailRail>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-muted"><ServerCog className="size-4" /> 如果状态异常，先进入“守护”页执行诊断/修复；本页不直接执行写操作。</div>
      </div>
    </section>
  </div>;
}
