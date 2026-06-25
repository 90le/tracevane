import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ExternalLink, ListChecks, ServerCog } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, DetailRail, EvidenceRow, ReadOnlyStrip, ResponsiveTable, StatusPill, WorkbenchToolbar, statusTone } from "../components";
import { StatTile } from "../../_shared";

export function DiagnosticsPage() {
  const diagnostics = useSystemDiagnosticsQuery();
  if (diagnostics.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (diagnostics.error) return <ErrorState title="无法加载诊断摘要" description={diagnostics.error.message} />;
  const data = diagnostics.data;
  const commandEntries = Object.entries(data?.commands ?? {});
  const checks = data?.bootstrap.checks ?? [];
  const problemChecks = checks.filter((check) => check.level !== "ok");
  const visibleChecks = problemChecks.length ? problemChecks : checks;
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>Diagnostics 负责发现问题；修复动作进入守护页或具体 owner 域，避免诊断页变成第二套修复后台。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="Diagnostics checklist" description="安全、bootstrap、device trust 和命令证据。"><Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard"><Activity />守护修复</Link></Button><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="critical" value={data?.status.securityCritical ?? "—"} sub="security" /><StatTile label="warnings" value={data?.status.securityWarn ?? "—"} sub="security" /><StatTile label="bootstrap" value={data?.bootstrap.ready ? "ready" : "not ready"} sub={`${checks.length} checks`} /><StatTile label="device trust" value={data?.deviceTrust.helper.paired ? "paired" : "unpaired"} sub={`${data?.deviceTrust.pending.length ?? 0} pending`} /></div><ResponsiveTable columns={["check", "status", "detail"]} rows={visibleChecks.map((check) => <tr key={check.id}><td className="max-w-[320px] truncate px-4 py-3 font-medium text-ink-strong">{check.label}</td><td className="px-4 py-3"><StatusPill tone={check.level === "ok" ? "ok" : check.level === "error" ? "bad" : "warn"}>{check.level === "ok" ? "ok" : "needs attention"}</StatusPill></td><td className="max-w-[420px] truncate px-4 py-3 text-muted">{check.detail ?? "—"}</td></tr>)} empty="无 bootstrap checks" /></div><DetailRail title="Runtime evidence" subtitle="Tracevane local HTTP bridge"><EvidenceRow label="pid" value={data?.runtime.pid ?? "—"} /><EvidenceRow label="node" value={data?.runtime.nodeVersion ?? "—"} /><EvidenceRow label="host" value={data?.runtime.hostname ?? "—"} /><EvidenceRow label="cwd" value={data?.runtime.cwd ?? "—"} /><EvidenceRow label="gateway ws" value={data?.config.gatewayWsUrl ?? "—"} /></DetailRail></div></section>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="Command evidence" description="后端已执行的诊断命令快照。"><ListChecks className="size-4 text-muted" /></WorkbenchToolbar><ResponsiveTable columns={["command", "result", "duration"]} rows={commandEntries.map(([key, command]) => <tr key={key}><td className="max-w-[360px] truncate px-4 py-3 font-medium text-ink-strong">{key}</td><td className="px-4 py-3"><StatusPill tone={command.ok ? "ok" : "bad"}>{command.ok ? "ok" : "failed"}</StatusPill></td><td className="px-4 py-3 text-muted">{command.durationMs}ms</td></tr>)} empty="无命令证据" /></section>
    <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/platforms/openclaw/guard"><Activity />守护诊断与修复</Link></Button><Button variant="ghost" asChild><a href={data?.config.gatewayControlUiBasePath || "#/platforms/openclaw"} target="_blank" rel="noreferrer"><ExternalLink />Control UI evidence</a></Button>{data?.status.securityCritical ? <Badge variant="bad" className="gap-1.5"><AlertTriangle className="size-3.5" />需要处理严重安全项</Badge> : null}<Badge variant="mute" className="gap-1.5"><ServerCog className="size-3.5" />diagnostics only</Badge></div>
  </div>;
}
