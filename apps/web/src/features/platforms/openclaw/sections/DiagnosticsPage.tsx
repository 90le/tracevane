import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ExternalLink, ListChecks, ServerCog } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, DetailRail, EvidenceRow, ReadOnlyStrip, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, statusTone, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function DiagnosticsPage() {
  const diagnostics = useSystemDiagnosticsQuery();
  const data = diagnostics.data;
  const commandEntries = Object.entries(data?.commands ?? {});
  const checks = data?.bootstrap.checks ?? [];
  const problemChecks = checks.filter((check) => check.level !== "ok");
  const visibleChecks = problemChecks.length ? problemChecks : checks;
  const [selectedCheckId, setSelectedCheckId] = useSelectedKey(visibleChecks.map((check) => check.id));
  const selectedCheck = visibleChecks.find((check) => check.id === selectedCheckId) ?? visibleChecks[0];
  if (diagnostics.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (diagnostics.error) return <ErrorState title="无法加载诊断摘要" description={diagnostics.error.message} />;
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>Diagnostics 负责发现问题；修复动作进入守护页或具体 owner 域，避免诊断页变成第二套修复后台。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="Diagnostics checklist" description="安全、bootstrap、device trust 和命令证据。"><Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard"><Activity />守护修复</Link></Button><RefreshButton loading={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="critical" value={data?.status.securityCritical ?? "—"} sub="security" /><StatTile label="warnings" value={data?.status.securityWarn ?? "—"} sub="security" /><StatTile label="bootstrap" value={data?.bootstrap.ready ? "ready" : "not ready"} sub={`${checks.length} checks`} /><StatTile label="device trust" value={data?.deviceTrust.helper.paired ? "paired" : "unpaired"} sub={`${data?.deviceTrust.pending.length ?? 0} pending`} /></div><ResponsiveTable columns={["check", "status", "detail"]} rows={visibleChecks.map((check) => <SelectableRow key={check.id} id={check.id} selected={selectedCheckId === check.id} onSelect={setSelectedCheckId}><td className="max-w-[320px] truncate px-4 py-3 font-medium text-ink-strong">{check.label}</td><td className="px-4 py-3"><StatusPill tone={check.level === "ok" ? "ok" : check.level === "error" ? "bad" : "warn"}>{check.level === "ok" ? "ok" : "needs attention"}</StatusPill></td><td className="max-w-[420px] truncate px-4 py-3 text-muted">{check.detail ?? "—"}</td></SelectableRow>)} empty="无 bootstrap checks" /></div><DetailRail title={selectedCheck?.label ?? "Runtime evidence"} subtitle={selectedCheck ? selectedCheck.detail : "Tracevane local HTTP bridge"}><EvidenceRow label="check level" value={selectedCheck?.level ?? "—"} /><EvidenceRow label="fixable" value={selectedCheck ? String(selectedCheck.fixable) : "—"} /><EvidenceRow label="pid" value={data?.runtime.pid ?? "—"} /><EvidenceRow label="node" value={data?.runtime.nodeVersion ?? "—"} /><EvidenceRow label="host" value={data?.runtime.hostname ?? "—"} /><EvidenceRow label="cwd" value={data?.runtime.cwd ?? "—"} /><EvidenceRow label="gateway ws" value={data?.config.gatewayWsUrl ?? "—"} /></DetailRail></div></section>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="Command evidence" description="后端已执行的诊断命令快照。"><ListChecks className="size-4 text-muted" /></WorkbenchToolbar><ResponsiveTable columns={["command", "result", "duration"]} rows={commandEntries.map(([key, command]) => <tr key={key}><td className="max-w-[360px] truncate px-4 py-3 font-medium text-ink-strong">{key}</td><td className="px-4 py-3"><StatusPill tone={command.ok ? "ok" : "bad"}>{command.ok ? "ok" : "failed"}</StatusPill></td><td className="px-4 py-3 text-muted">{command.durationMs}ms</td></tr>)} empty="无命令证据" /></section>
    <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/platforms/openclaw/guard"><Activity />守护诊断与修复</Link></Button><Button variant="ghost" asChild><a href={data?.config.gatewayControlUiBasePath || "#/platforms/openclaw"} target="_blank" rel="noreferrer"><ExternalLink />Control UI evidence</a></Button>{data?.status.securityCritical ? <Badge variant="bad" className="gap-1.5"><AlertTriangle className="size-3.5" />需要处理严重安全项</Badge> : null}<Badge variant="mute" className="gap-1.5"><ServerCog className="size-3.5" />diagnostics only</Badge></div>
  </div>;
}
