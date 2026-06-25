import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, ListChecks, ServerCog } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, DetailRail, EvidenceRow, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, statusTone, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

function levelLabel(level: string | undefined): string {
  if (level === "ok") return "正常";
  if (level === "error") return "错误";
  if (level === "warn") return "警告";
  return "未知";
}

export function DiagnosticsPage() {
  const [includeCommands, setIncludeCommands] = React.useState(false);
  const diagnostics = useSystemDiagnosticsQuery({ retry: false, staleTime: includeCommands ? 30_000 : 15_000 }, { includeCommands });
  const data = diagnostics.data;
  const commandEntries = Object.entries(data?.commands ?? {});
  const checks = data?.bootstrap?.checks ?? [];
  const problemChecks = checks.filter((check) => check.level !== "ok");
  const visibleChecks = problemChecks.length ? problemChecks : checks;
  const [selectedCheckId, setSelectedCheckId] = useSelectedKey(visibleChecks.map((check) => check.id));
  const selectedCheck = visibleChecks.find((check) => check.id === selectedCheckId) ?? visibleChecks[0];
  if (!data && (diagnostics.isLoading || diagnostics.isPending || diagnostics.isFetching)) return <div className="grid gap-[18px]" role="status" aria-busy="true"><div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">正在加载快速诊断摘要；慢命令证据不会阻塞首屏。</div><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (diagnostics.error) return <ErrorState title="无法加载诊断摘要" description={diagnostics.error.message} action={<Button variant="outline" size="sm" onClick={() => { void diagnostics.refetch(); }}>重试</Button>} />;
  return <div className="grid gap-[18px]">
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <WorkbenchToolbar title="诊断检查" description="安全、bootstrap、设备信任和命令证据。诊断页只定位问题，修复进入守护页。"><Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard"><Activity />守护修复</Link></Button><Button variant="outline" size="sm" onClick={() => setIncludeCommands(true)} disabled={includeCommands && diagnostics.isFetching}><ListChecks />加载命令证据</Button><RefreshButton loading={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar>
      <div className="grid gap-3 p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><StatTile label="严重安全项" value={data?.status?.securityCritical ?? 0} sub="security critical" /><StatTile label="安全警告" value={data?.status?.securityWarn ?? 0} sub="security warning" /><StatTile label="Bootstrap" value={data?.bootstrap?.ready ? "ready" : "not ready"} sub={`${checks.length} checks`} /><StatTile label="设备信任" value={data?.deviceTrust?.helper?.paired ? "paired" : "unpaired"} sub={`${data?.deviceTrust?.pending?.length ?? 0} pending`} /></div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-md border border-line bg-panel">
            <ResponsiveTable columns={["检查项", "状态", "说明"]} rows={visibleChecks.map((check) => <SelectableRow key={check.id} id={check.id} selected={selectedCheckId === check.id} onSelect={setSelectedCheckId}><td className="max-w-[320px] px-4 py-3"><div className="truncate font-medium text-ink-strong">{check.label}</div><div className="truncate text-xs text-muted">{check.id}</div></td><td className="px-4 py-3"><StatusPill tone={check.level === "ok" ? "ok" : check.level === "error" ? "bad" : "warn"}>{levelLabel(check.level)}</StatusPill></td><td className="max-w-[460px] truncate px-4 py-3 text-muted">{check.detail || check.summary || "—"}</td></SelectableRow>)} empty="无 bootstrap checks" />
          </div>
          <DetailRail title={selectedCheck?.label ?? "运行时证据"} subtitle={selectedCheck?.detail ?? "Tracevane local HTTP bridge"}>
            <EvidenceRow label="检查状态" value={selectedCheck ? <StatusPill tone={selectedCheck.level === "ok" ? "ok" : selectedCheck.level === "error" ? "bad" : "warn"}>{levelLabel(selectedCheck.level)}</StatusPill> : "—"} />
            <EvidenceRow label="可自动修复" value={selectedCheck ? String(selectedCheck.fixable) : "—"} />
            <EvidenceRow label="PID" value={data?.runtime?.pid ?? "—"} />
            <EvidenceRow label="Node" value={data?.runtime?.nodeVersion ?? "—"} />
            <EvidenceRow label="主机" value={data?.runtime?.hostname ?? "—"} />
            <EvidenceRow label="工作目录" value={data?.runtime?.cwd ?? "—"} />
            <EvidenceRow label="Gateway WS" value={data?.config?.gatewayWsUrl ?? "—"} />
          </DetailRail>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-muted">{problemChecks.length ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />} 当前显示 {problemChecks.length ? "需关注检查项" : "全部检查项"}；如页面无内容，刷新会重新拉取诊断数据并展示错误状态。</div>
      </div>
    </section>

    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="命令证据" description="命令证据按需加载，避免进入诊断页时被 doctor/status 慢命令阻塞。"><ListChecks className="size-4 text-muted" /></WorkbenchToolbar><ResponsiveTable columns={["命令", "结果", "耗时"]} rows={commandEntries.map(([key, command]) => <tr key={key}><td className="max-w-[360px] truncate px-4 py-3 font-medium text-ink-strong">{key}</td><td className="px-4 py-3"><StatusPill tone={command.ok ? "ok" : "bad"}>{command.ok ? "正常" : "失败"}</StatusPill></td><td className="px-4 py-3 text-muted">{command.durationMs}ms</td></tr>)} empty={includeCommands ? "无命令证据" : "点击上方“加载命令证据”后再运行 doctor/status"} /></section>

    <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/platforms/openclaw/guard"><Activity />守护诊断与修复</Link></Button><Button variant="ghost" asChild><a href={data?.config?.gatewayControlUiBasePath || "#/platforms/openclaw"} target="_blank" rel="noreferrer"><ExternalLink />Control UI evidence</a></Button>{data?.status?.securityCritical ? <Badge variant="bad" className="gap-1.5"><AlertTriangle className="size-3.5" />需要处理严重安全项</Badge> : null}<Badge variant="mute" className="gap-1.5"><ServerCog className="size-3.5" />diagnostics only</Badge></div>
  </div>;
}
