import * as React from "react";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { useRecoveryEventsQuery } from "@/lib/query/recovery";
import { BoundaryBadge, DetailRail, EvidenceRow, ReadOnlyStrip, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, fmtDate, statusTone, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function LogsPage() {
  const events = useRecoveryEventsQuery(1, 20);
  const runs = useAgentRuntimeRunsQuery();
  const [severity, setSeverity] = React.useState("all");
  if (events.isLoading || runs.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (events.error) return <ErrorState title="无法加载平台日志" description={events.error.message} />;
  const list = events.data?.events ?? [];
  const filtered = list.filter((event) => severity === "all" || event.severity === severity);
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((event) => event.id));
  const selected = filtered.find((event) => event.id === selectedKey) ?? filtered[0] ?? list[0];
  const severities = Array.from(new Set(list.map((event) => event.severity)));
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>日志页展示人可读事件摘要；原始日志文件/终端输出仍由对应 owner 页面打开。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="Platform events" description="失败与告警优先，技术 payload 降级为详情证据。"><select className="rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">全部级别</option>{severities.map((item) => <option key={item} value={item}>{item}</option>)}</select><RefreshButton loading={events.isFetching || runs.isFetching} onClick={() => { void events.refetch(); void runs.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="events" value={events.data?.pagination.totalEntries ?? 0} sub="recovery event log" /><StatTile label="loaded" value={list.length} sub="latest loaded" /><StatTile label="agent runs" value={runs.data?.totals.total ?? "—"} sub="all sources" /><StatTile label="failed runs" value={runs.data?.totals.failed ?? "—"} sub="all sources" /></div><ResponsiveTable columns={["event", "severity", "time"]} rows={filtered.map((event) => <SelectableRow key={event.id} id={event.id} selected={selectedKey === event.id} onSelect={setSelectedKey}><td className="max-w-[520px] px-4 py-3"><div className="truncate font-medium text-ink-strong">{event.title}</div><div className="line-clamp-2 text-xs text-muted">{event.summary}</div></td><td className="px-4 py-3"><StatusPill tone={statusTone(event.severity)}>{event.severity}</StatusPill></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{fmtDate(event.occurredAt)}</td></SelectableRow>)} empty="无匹配事件" /></div><DetailRail title={selected?.title ?? "未选择事件"} subtitle={selected ? fmtDate(selected.occurredAt) : "—"}><EvidenceRow label="severity" value={selected ? <StatusPill tone={statusTone(selected.severity)}>{selected.severity}</StatusPill> : "—"} /><EvidenceRow label="kind" value={selected?.kind ?? "—"} /><EvidenceRow label="summary" value={selected?.summary ?? "—"} /><EvidenceRow label="event id" value={selected?.id ?? "—"} /></DetailRail></div></section>
  </div>;
}
