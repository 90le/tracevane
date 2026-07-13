import * as React from "react";
import { FileText } from "lucide-react";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useRecoveryEventsQuery } from "@/lib/query/recovery";
import { BoundaryBadge, DetailRail, EvidenceRow, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, fmtDate, statusTone, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

function severityLabel(value: string): string {
  if (value === "error") return "错误";
  if (value === "warn" || value === "warning") return "警告";
  if (value === "info") return "信息";
  if (value === "ok" || value === "success") return "正常";
  return value || "未知";
}

export function LogsPage() {
  const events = useRecoveryEventsQuery(1, 40);
  const [severity, setSeverity] = React.useState("all");
  const list = events.data?.events ?? [];
  const severities = Array.from(new Set(list.map((event) => event.severity))).filter(Boolean);
  const filtered = list.filter((event) => severity === "all" || event.severity === severity);
  const errorCount = list.filter((event) => statusTone(event.severity) === "bad").length;
  const warnCount = list.filter((event) => statusTone(event.severity) === "warn").length;
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((event) => event.id));
  const selected = filtered.find((event) => event.id === selectedKey) ?? filtered[0] ?? list[0];
  if (events.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (events.error) return <ErrorState title="无法加载平台日志" description={events.error.message} />;
  return <div className="grid gap-[18px]">
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <WorkbenchToolbar title="平台事件日志" description="按人能理解的事件摘要展示；原始日志、终端输出和 Agent 运行证据留在各自 owner 页面。"><div className="flex flex-wrap gap-1"><Button variant={severity === "all" ? "default" : "outline"} size="sm" onClick={() => setSeverity("all")}>全部</Button>{severities.map((item) => <Button key={item} variant={severity === item ? "default" : "outline"} size="sm" onClick={() => setSeverity(item)}>{severityLabel(item)}</Button>)}</div><RefreshButton loading={events.isFetching} onClick={() => { void events.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar>
      <div className="grid gap-3 p-3">
        <div className="grid gap-3 md:grid-cols-4"><StatTile label="事件总数" value={events.data?.pagination.totalEntries ?? 0} sub="平台守护事件" /><StatTile label="当前加载" value={list.length} sub="最近 40 条" /><StatTile label="错误" value={errorCount} sub="需优先查看" /><StatTile label="警告" value={warnCount} sub="可能需关注" /></div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-md border border-line bg-panel">
            <ResponsiveTable columns={["事件", "级别", "时间"]} rows={filtered.map((event) => <SelectableRow key={event.id} id={event.id} selected={selectedKey === event.id} onSelect={setSelectedKey}><td className="max-w-[620px] px-4 py-3"><div className="truncate font-medium text-ink-strong">{event.title}</div><div className="line-clamp-2 text-xs leading-5 text-muted">{event.summary || "—"}</div></td><td className="px-4 py-3"><StatusPill tone={statusTone(event.severity)}>{severityLabel(event.severity)}</StatusPill></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{fmtDate(event.occurredAt)}</td></SelectableRow>)} empty="无匹配事件" />
          </div>
          <DetailRail title={selected?.title ?? "未选择事件"} subtitle={selected ? fmtDate(selected.occurredAt) : "—"}>
            <EvidenceRow label="级别" value={selected ? <StatusPill tone={statusTone(selected.severity)}>{severityLabel(selected.severity)}</StatusPill> : "—"} />
            <EvidenceRow label="类型" value={selected?.kind ?? "—"} />
            <EvidenceRow label="摘要" value={selected?.summary ?? "—"} />
            <EvidenceRow label="事件 ID" value={selected?.id ?? "—"} />
          </DetailRail>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-muted"><FileText className="size-4" /> 日志列表默认只显示摘要，避免原始 payload 挤占页面；需要排障时选中事件查看右侧证据。</div>
      </div>
    </section>
  </div>;
}
