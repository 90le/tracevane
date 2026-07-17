import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";

const OPERATION_HISTORY_STORAGE_KEY = "tracevane:file-manager:operation-history";
export const MAX_OPERATION_RECORDS = 50;

export type FileOperationStatus = "success" | "partial" | "error";

export interface FileOperationRecord {
  id: string;
  title: string;
  status: FileOperationStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  itemCount: number;
  successCount: number;
  failureCount: number;
  affectedPaths: string[];
  errorMessages: string[];
}

export function OperationHistoryPanel({
  records,
  onClear,
  onRevealPath,
}: {
  records: FileOperationRecord[];
  onClear: () => void;
  onRevealPath?: (path: string) => void;
}) {
  const [statusFilter, setStatusFilter] = React.useState<FileOperationStatus | "all">("all");
  const [query, setQuery] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  if (!records.length) return null;
  const latest = records[0];
  const statusLabel = latest.status === "success" ? "成功" : latest.status === "partial" ? "部分完成" : "失败";
  const operationStats = summarizeOperationRecords(records);
  const visibleRecords = records
    .filter((record) => statusFilter === "all" || record.status === statusFilter)
    .filter((record) => matchOperationRecord(record, query))
    .slice(0, 20);
  const visibleSourceRecords = visibleRecords.length ? visibleRecords : records;
  const header = (
    <div className="grid gap-2 border-b border-line bg-panel-2 px-3 py-2 text-xs" data-file-manager-operation-history-controls>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-ink-strong">操作结果</span>
        <span className={cn(
          "rounded-full px-2 py-0.5 font-medium",
          latest.status === "success" && "bg-primary-soft text-primary",
          latest.status === "partial" && "bg-warning-soft text-warning",
          latest.status === "error" && "bg-danger-soft text-danger",
        )}>
          最近一次：{statusLabel}
        </span>
        <span className="text-muted">成功 {latest.successCount} / 失败 {latest.failureCount}</span>
        <span className="min-w-0 truncate text-subtle">
          总计 {operationStats.total} · 成功 {operationStats.success} · 部分 {operationStats.partial} · 失败 {operationStats.error} · 平均耗时 {formatDuration(operationStats.averageDurationMs)}
        </span>
        <div className="ml-auto inline-flex rounded border border-line bg-panel p-0.5">
          {(["all", "success", "partial", "error"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded px-2 py-1 text-2xs text-muted hover:text-ink-strong",
                statusFilter === status && "bg-primary-soft text-primary",
              )}
            >
              {status === "all" ? "全部" : status === "success" ? "成功" : status === "partial" ? "部分" : "失败"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索操作 / 路径 / 错误"
          className="h-7 w-full min-w-44 max-w-72 text-xs md:w-64"
          aria-label="搜索操作历史"
        />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => copyOperationHistory(visibleSourceRecords)}>复制当前结果</Button>
          <Button variant="ghost" size="sm" onClick={() => copyOperationFailures(visibleSourceRecords)} disabled={!visibleSourceRecords.some((record) => record.errorMessages.length)}>复制错误报告</Button>
          <Button variant="ghost" size="sm" onClick={() => exportOperationHistoryCsv(visibleSourceRecords)}>导出 CSV</Button>
          <Button variant="ghost" size="sm" onClick={onClear}>清空记录</Button>
        </div>
      </div>
    </div>
  );

  const list = (
    <div className="divide-y divide-line" data-file-manager-operation-history-list>
      {visibleRecords.length ? visibleRecords.map((record) => {
        const expanded = expandedId === record.id;
        return (
          <article key={record.id} className="grid gap-2 px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : record.id)}
              className="grid gap-2 text-left md:grid-cols-[180px_120px_minmax(0,1fr)_72px] md:items-start"
            >
              <div>
                <div className="font-medium text-ink-strong">{record.title}</div>
                <div className="mt-0.5 text-subtle">{new Date(record.finishedAt).toLocaleString()}</div>
              </div>
              <div className="text-muted">
                {record.itemCount} 项 · 成功 {record.successCount} · 失败 {record.failureCount} · {formatDuration(record.durationMs)}
              </div>
              <div className="min-w-0">
                {record.affectedPaths.length ? (
                  <div
                    className="truncate font-mono text-muted"
                    title={summarizeOperationPaths(record.affectedPaths)}
                    data-file-manager-operation-path-summary
                  >
                    {summarizeOperationPaths(record.affectedPaths)}
                  </div>
                ) : null}
                {record.errorMessages.length ? (
                  <div className="mt-1 truncate text-danger" title={record.errorMessages.join("\n")}>
                    {record.errorMessages.slice(0, 2).join("；")}{record.errorMessages.length > 2 ? ` 等 ${record.errorMessages.length} 个错误` : ""}
                  </div>
                ) : null}
              </div>
              <span className="text-right text-subtle">{expanded ? "收起" : "详情"}</span>
            </button>
            {expanded ? <OperationRecordDetails record={record} onRevealPath={onRevealPath} /> : null}
          </article>
        );
      }) : (
        <EmptyState
          className="px-3 py-6"
          title="当前筛选没有操作记录"
          description="调整状态筛选或搜索关键词后再试。"
        />
      )}
    </div>
  );

  return (
    <>
      <details className="overflow-hidden rounded-md border border-line bg-panel md:hidden" data-file-manager-operation-history-mobile>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-panel-2 px-3 py-2 text-xs marker:hidden">
          <span className="font-semibold text-ink-strong">操作结果</span>
          <span className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            latest.status === "success" && "bg-primary-soft text-primary",
            latest.status === "partial" && "bg-warning-soft text-warning",
            latest.status === "error" && "bg-danger-soft text-danger",
          )}>最近一次：{statusLabel}</span>
          <span className="text-subtle">展开</span>
        </summary>
        {header}
        {list}
      </details>
      <section className="hidden overflow-hidden rounded-md border border-line bg-panel md:block" data-file-manager-operation-history-desktop>
        {header}
        {list}
      </section>
    </>
  );
}

export function createOperationRecord(input: {
  title: string;
  status: FileOperationStatus;
  startedAt?: string;
  itemCount: number;
  successCount: number;
  failureCount: number;
  affectedPaths: string[];
  errorMessages: string[];
}): FileOperationRecord {
  const finishedAt = new Date().toISOString();
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    status: input.status,
    startedAt: input.startedAt ?? finishedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(input.startedAt ?? finishedAt)),
    itemCount: input.itemCount,
    successCount: input.successCount,
    failureCount: input.failureCount,
    affectedPaths: input.affectedPaths.slice(0, 50),
    errorMessages: input.errorMessages.slice(0, 20),
  };
}

export function loadFileOperationRecords(): FileOperationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPERATION_HISTORY_STORAGE_KEY) || "[]") as FileOperationRecord[];
    return Array.isArray(parsed)
      ? parsed.filter(isFileOperationRecord).map(normalizeFileOperationRecord).slice(0, MAX_OPERATION_RECORDS)
      : [];
  } catch {
    return [];
  }
}

export function storeFileOperationRecords(records: FileOperationRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_OPERATION_RECORDS)));
  } catch {
    // Operation history is advisory evidence; storage failures must not block file actions.
  }
}

function OperationRecordDetails({ record, onRevealPath }: { record: FileOperationRecord; onRevealPath?: (path: string) => void }) {
  return (
    <div className="grid gap-2 rounded border border-line bg-panel-2 p-2">
      <div className="grid gap-1 text-2xs text-muted sm:grid-cols-2">
        <span>开始：{new Date(record.startedAt).toLocaleString()}</span>
        <span>结束：{new Date(record.finishedAt).toLocaleString()}</span>
        <span>耗时：{formatDuration(record.durationMs)}</span>
        <span>状态：{record.status === "success" ? "成功" : record.status === "partial" ? "部分完成" : "失败"}</span>
      </div>
      {record.affectedPaths.length ? (
        <div>
          <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-subtle">影响路径</div>
          <div className="max-h-32 overflow-auto rounded border border-line bg-panel p-2 font-mono text-2xs text-muted">
            {record.affectedPaths.map((path) => (
              <div key={path} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-line/60 py-1 last:border-b-0">
                <span className="truncate" title={path}>{path}</span>
                <button
                  type="button"
                  className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] text-subtle hover:text-ink-strong"
                  onClick={() => copyText(path, "路径已复制")}
                >
                  复制
                </button>
                {onRevealPath ? (
                  <button
                    type="button"
                    className="rounded border border-primary-line bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary-soft/80"
                    onClick={() => onRevealPath(path)}
                  >
                    定位
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {record.errorMessages.length ? (
        <div>
          <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-danger">错误</div>
          <div className="max-h-32 overflow-auto rounded border border-danger-line bg-danger-soft p-2 font-mono text-2xs text-danger">
            {record.errorMessages.map((error, index) => <div key={`${record.id}:error:${index}`}>{error}</div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function copyOperationHistory(records: FileOperationRecord[]): void {
  copyText(JSON.stringify(records, null, 2), "操作记录已复制");
}

function copyOperationFailures(records: FileOperationRecord[]): void {
  const failures = records
    .filter((record) => record.errorMessages.length)
    .map((record) => ({
      title: record.title,
      status: record.status,
      finishedAt: record.finishedAt,
      errors: record.errorMessages,
      affectedPaths: record.affectedPaths,
    }));
  copyText(JSON.stringify(failures, null, 2), "错误报告已复制");
}

function exportOperationHistoryCsv(records: FileOperationRecord[]): void {
  const header = ["id", "title", "status", "startedAt", "finishedAt", "durationMs", "itemCount", "successCount", "failureCount", "affectedPaths", "errors"];
  const rows = records.map((record) => [
    record.id,
    record.title,
    record.status,
    record.startedAt,
    record.finishedAt,
    String(record.durationMs),
    String(record.itemCount),
    String(record.successCount),
    String(record.failureCount),
    record.affectedPaths.join("\n"),
    record.errorMessages.join("\n"),
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  copyText(csv, "操作历史 CSV 已复制");
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function copyText(text: string, successMessage: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text).then(() => toast.success(successMessage));
    return;
  }
  toast.info("当前浏览器不支持剪贴板复制");
}

function summarizeOperationRecords(records: FileOperationRecord[]): Record<FileOperationStatus | "total" | "averageDurationMs", number> {
  const summary = records.reduce<Record<FileOperationStatus | "total" | "averageDurationMs", number>>((next, record) => {
    next.total += 1;
    next[record.status] += 1;
    next.averageDurationMs += record.durationMs || 0;
    return next;
  }, { total: 0, success: 0, partial: 0, error: 0, averageDurationMs: 0 });
  summary.averageDurationMs = summary.total > 0 ? Math.round(summary.averageDurationMs / summary.total) : 0;
  return summary;
}

function matchOperationRecord(record: FileOperationRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    record.title,
    record.status,
    record.startedAt,
    record.finishedAt,
    ...record.affectedPaths,
    ...record.errorMessages,
  ].join("\n").toLowerCase();
  return haystack.includes(normalized);
}

function normalizeFileOperationRecord(record: FileOperationRecord): FileOperationRecord {
  if (typeof record.durationMs === "number") return record;
  return {
    ...record,
    durationMs: Math.max(0, Date.parse(record.finishedAt) - Date.parse(record.startedAt)),
  };
}

function isFileOperationRecord(value: unknown): value is FileOperationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as FileOperationRecord;
  return typeof record.id === "string"
    && typeof record.title === "string"
    && ["success", "partial", "error"].includes(record.status)
    && typeof record.startedAt === "string"
    && typeof record.finishedAt === "string"
    && (record.durationMs === undefined || typeof record.durationMs === "number")
    && typeof record.itemCount === "number"
    && typeof record.successCount === "number"
    && typeof record.failureCount === "number"
    && Array.isArray(record.affectedPaths)
    && Array.isArray(record.errorMessages);
}

function formatDuration(value: number | undefined): string {
  const ms = Math.max(0, Number(value) || 0);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}


function summarizeOperationPaths(paths: string[]): string {
  const sample = paths.slice(0, 3).join("、");
  if (!sample) return "无影响路径";
  return paths.length > 3 ? `${sample} 等 ${paths.length} 项` : sample;
}
