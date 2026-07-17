import * as React from "react";
import { FileText } from "lucide-react";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { SectionNav } from "@/design/ui/section-nav";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { useRecoveryEventsQuery } from "@/lib/query/recovery";
import { BoundaryBadge, DetailRail, EvidenceRow, Panel, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, fmtDate, statusTone, useSelectedKey } from "../components";

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
  if (events.isLoading) {
    return <LoadingState title="正在加载平台事件日志…" />;
  }
  if (events.error) return <ErrorState title="无法加载平台日志" description={events.error.message} />;
  return (
    <div className="grid gap-[18px]">
      <MetricRail>
        <MetricTile label="事件总数" value={events.data?.pagination.totalEntries ?? 0} hint="平台守护事件" icon={<FileText />} />
        <MetricTile label="当前加载" value={list.length} hint="最近 40 条" />
        <MetricTile label="错误" value={errorCount} tone={errorCount > 0 ? "bad" : "default"} hint="需优先查看" />
        <MetricTile label="警告" value={warnCount} tone={warnCount > 0 ? "warn" : "default"} hint="可能需关注" />
      </MetricRail>
      <Panel>
        <WorkbenchToolbar title="平台事件日志" description="按人能理解的事件摘要展示；原始日志、终端输出和 Agent 运行证据留在各自 owner 页面。">
          <RefreshButton loading={events.isFetching} onClick={() => { void events.refetch(); }} />
          <BoundaryBadge />
        </WorkbenchToolbar>
        <div className="border-b border-line px-3 py-2">
          <SectionNav
            ariaLabel="日志级别筛选"
            items={[{ id: "all", label: "全部", count: list.length }, ...severities.map((item) => ({ id: item, label: severityLabel(item), count: list.filter((event) => event.severity === item).length }))]}
            value={severity}
            onChange={setSeverity}
          />
        </div>
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-md border border-line bg-panel">
            <ResponsiveTable
              columns={["事件", "级别", "时间"]}
              rows={filtered.map((event) => (
                <SelectableRow key={event.id} id={event.id} selected={selectedKey === event.id} onSelect={setSelectedKey}>
                  <td className="max-w-[620px] px-4 py-3">
                    <div className="truncate font-medium text-ink-strong">{event.title}</div>
                    <div className="line-clamp-2 text-xs leading-5 text-muted">{event.summary || "—"}</div>
                  </td>
                  <td className="px-4 py-3"><StatusPill tone={statusTone(event.severity)}>{severityLabel(event.severity)}</StatusPill></td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-muted">{fmtDate(event.occurredAt)}</td>
                </SelectableRow>
              ))}
              empty="无匹配事件"
            />
          </div>
          <DetailRail title={selected?.title ?? "未选择事件"} subtitle={selected ? fmtDate(selected.occurredAt) : "—"}>
            <EvidenceRow label="级别" value={selected ? <StatusPill tone={statusTone(selected.severity)}>{severityLabel(selected.severity)}</StatusPill> : "—"} />
            <EvidenceRow label="类型" value={selected?.kind ?? "—"} />
            <EvidenceRow label="摘要" value={selected?.summary ?? "—"} />
            <EvidenceRow label="事件 ID" value={selected?.id ?? "—"} />
          </DetailRail>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel-2 px-4 py-2.5 text-sm text-muted"><FileText className="size-4" /> 日志列表默认只显示摘要，避免原始 payload 挤占页面；需要排障时选中事件查看右侧证据。</div>
      </Panel>
    </div>
  );
}
