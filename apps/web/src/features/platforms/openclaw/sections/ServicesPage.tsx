import * as React from "react";
import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useSystemHealthQuery } from "@/lib/query/dashboard";
import { useRecoveryDaemonServiceQuery, useRecoveryStatusQuery } from "@/lib/query/recovery";
import { BoundaryBadge, DetailRail, EvidenceRow, ReadOnlyStrip, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, boolText, fmtDate, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function ServicesPage() {
  const health = useSystemHealthQuery();
  const recovery = useRecoveryStatusQuery();
  const daemonService = useRecoveryDaemonServiceQuery();
  if (health.isLoading || recovery.isLoading || daemonService.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (health.error) return <ErrorState title="无法加载服务状态" description={health.error.message} />;
  const service = daemonService.data ?? recovery.data?.service;
  const rows = [
    { key: "gateway", name: "OpenClaw gateway", state: health.data?.gateway ?? "unknown", detail: `port ${health.data?.gatewayPort ?? "—"}`, owner: "system health" },
    { key: "tracevane-service", name: "Tracevane service", state: health.data?.serviceState ?? "unknown", detail: health.data?.serviceSubState ?? "—", owner: "system service" },
    { key: "recovery-daemon", name: "Recovery daemon", state: recovery.data?.daemon.pid ? "active" : "unknown", detail: recovery.data?.daemon.pid ? `pid ${recovery.data.daemon.pid}` : "pid —", owner: "platform guard" },
    { key: "supervisor", name: service?.serviceName ?? "daemon supervisor", state: service?.activeState ?? "unknown", detail: service?.enabledState ?? "—", owner: service?.supervisor ?? "—" },
  ];
  const [selectedKey, setSelectedKey] = useSelectedKey(rows.map((row) => row.key));
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? rows[0];
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>服务页展示 runtime 与 daemon 证据；启动/停止/安装等写动作统一进入守护页强确认流。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="Service console" description="Gateway、daemon、supervisor 与 service 快照。"><Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard"><Activity />进入守护</Link></Button><RefreshButton loading={health.isFetching || recovery.isFetching || daemonService.isFetching} onClick={() => { void health.refetch(); void recovery.refetch(); void daemonService.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="gateway" value={<StatusPill tone={health.data?.gateway === "online" ? "ok" : "warn"}>{health.data?.gateway ?? "unknown"}</StatusPill>} sub={`port ${health.data?.gatewayPort ?? "—"}`} /><StatTile label="service" value={health.data?.serviceState ?? "—"} sub={health.data?.serviceSubState ?? "—"} /><StatTile label="daemon" value={recovery.data?.daemon.pid ?? "—"} sub={recovery.data?.daemon.version ?? "—"} /><StatTile label="supervisor" value={service?.supervisor ?? "—"} sub={service?.serviceName ?? "—"} /></div><ResponsiveTable columns={["service", "state", "detail", "owner"]} rows={rows.map((row) => <SelectableRow key={row.key} id={row.key} selected={selectedKey === row.key} onSelect={setSelectedKey}><td className="max-w-[280px] truncate px-4 py-3 font-medium text-ink-strong">{row.name}</td><td className="px-4 py-3"><StatusPill tone={row.state === "online" || row.state === "active" ? "ok" : "warn"}>{row.state}</StatusPill></td><td className="max-w-[260px] truncate px-4 py-3 text-muted">{row.detail}</td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{row.owner}</td></SelectableRow>)} empty="无服务证据" /></div><DetailRail title={selectedRow?.name ?? "未选择服务"} subtitle={selectedRow ? `${selectedRow.owner} · ${selectedRow.detail}` : "—"}><EvidenceRow label="selected state" value={selectedRow?.state ?? "—"} /><EvidenceRow label="installed" value={boolText(service?.installed)} /><EvidenceRow label="active" value={service?.activeState ?? "—"} /><EvidenceRow label="enabled" value={service?.enabledState ?? "—"} /><EvidenceRow label="config path" value={service?.configPath ?? "—"} /><EvidenceRow label="last checked" value={fmtDate(service?.lastCheckedAt)} /></DetailRail></div></section>
  </div>;
}
