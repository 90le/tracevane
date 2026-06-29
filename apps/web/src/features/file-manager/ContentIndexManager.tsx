import * as React from "react";
import {
  Activity,
  Database,
  Download,
  FileSearch,
  HardDrive,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import {
  FILES_GLOBAL_SCOPE_ID,
  useCleanFilesContentIndexMutation,
  useFilesContentIndexRecordsQuery,
  useFilesContentIndexQuery,
  useRebuildFilesContentIndexMutation,
  useScanFilesContentIndexMutation,
} from "@/lib/query/files";
import { ErrorState } from "@/shared/states/ErrorState";
import type {
  FilesContentIndexRecordPreview,
  FilesContentIndexRecordsPayload,
  FilesContentIndexStatsPayload,
} from "../../../../../types/files";
import type { FileEntrySummary } from "@/features/workspace/files";

export type ContentIndexRecordStatusFilter = "all" | "valid" | "stale";
type ContentIndexMaintenanceStatus = "success" | "error";
const CONTENT_INDEX_RECORDS_PAGE_SIZE = 50;
const CONTENT_INDEX_RECORD_ROW_HEIGHT = 64;
const CONTENT_INDEX_RECORD_OVERSCAN = 8;

interface ContentIndexMaintenanceEvent {
  id: string;
  action: "scan" | "clean" | "rebuild";
  status: ContentIndexMaintenanceStatus;
  at: string;
  summary: string;
}

export function ContentIndexManager({
  rootId,
  onRevealPath,
  onOpenFile,
}: {
  rootId: string;
  rootLabel: string;
  onRevealPath?: (path: string, rootId?: string) => void;
  onOpenFile?: (entry: FileEntrySummary, rootId?: string) => void;
}) {
  const indexScopeRootId = FILES_GLOBAL_SCOPE_ID;
  const stats = useFilesContentIndexQuery(indexScopeRootId);
  const scan = useScanFilesContentIndexMutation();
  const clean = useCleanFilesContentIndexMutation();
  const rebuild = useRebuildFilesContentIndexMutation();
  const [statusFilter, setStatusFilter] =
    React.useState<ContentIndexRecordStatusFilter>("all");
  const [queryDraft, setQueryDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [maintenanceEvents, setMaintenanceEvents] = React.useState<
    ContentIndexMaintenanceEvent[]
  >([]);
  const data = stats.data;
  const busy =
    stats.isFetching || scan.isPending || clean.isPending || rebuild.isPending;
  const recordsQueryReady = useIdleReady(140);
  const recordsPage = useFilesContentIndexRecordsQuery(
    {
      rootId: indexScopeRootId,
      status: statusFilter,
      query,
      page,
      pageSize: CONTENT_INDEX_RECORDS_PAGE_SIZE,
    },
    { enabled: Boolean(data) && recordsQueryReady },
  );
  const records = recordsPage.data?.records ?? data?.recordsPreview ?? [];
  const health = React.useMemo(
    () => deriveContentIndexHealth(data, busy),
    [busy, data],
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryDraft.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);

  React.useEffect(() => {
    setPage(1);
  }, [query, statusFilter, indexScopeRootId]);

  const appendMaintenanceEvent = React.useCallback(
    (event: Omit<ContentIndexMaintenanceEvent, "id" | "at">) => {
      setMaintenanceEvents((previous) =>
        [
          {
            ...event,
            id: `${Date.now()}:${event.action}:${event.status}`,
            at: new Date().toISOString(),
          },
          ...previous,
        ].slice(0, 5),
      );
    },
    [],
  );

  const runScan = React.useCallback(async () => {
    try {
      await scan.mutateAsync({ rootId: indexScopeRootId });
      void recordsPage.refetch();
      appendMaintenanceEvent({
        action: "scan",
        status: "success",
        summary: "完成全局失效扫描",
      });
      toast.success("索引扫描完成");
    } catch (error) {
      appendMaintenanceEvent({
        action: "scan",
        status: "error",
        summary: error instanceof Error ? error.message : String(error),
      });
      toast.error("索引扫描失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [appendMaintenanceEvent, indexScopeRootId, recordsPage, scan]);

  const runClean = React.useCallback(async () => {
    try {
      const result = await clean.mutateAsync({ rootId: indexScopeRootId });
      void recordsPage.refetch();
      appendMaintenanceEvent({
        action: "clean",
        status: "success",
        summary: `已清理 ${result.cleanedRecordCount ?? 0} 条失效记录`,
      });
      toast.success("索引清理完成", {
        description: `已清理 ${result.cleanedRecordCount ?? 0} 条失效记录`,
      });
    } catch (error) {
      appendMaintenanceEvent({
        action: "clean",
        status: "error",
        summary: error instanceof Error ? error.message : String(error),
      });
      toast.error("索引清理失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [appendMaintenanceEvent, clean, indexScopeRootId, recordsPage]);

  const runRebuild = React.useCallback(async () => {
    if (!rootId) return;
    try {
      const result = await rebuild.mutateAsync({ rootId });
      void recordsPage.refetch();
      appendMaintenanceEvent({
        action: "rebuild",
        status: "success",
        summary: `当前入口扫描 ${result.scannedFileCount} 个文件，写入 ${result.rebuiltRecordCount} 条`,
      });
      toast.success("当前入口索引已重建", {
        description: `扫描 ${result.scannedFileCount} 个文件，写入 ${result.rebuiltRecordCount} 条记录${result.truncated ? "；已达到安全上限" : ""}`,
      });
    } catch (error) {
      appendMaintenanceEvent({
        action: "rebuild",
        status: "error",
        summary: error instanceof Error ? error.message : String(error),
      });
      toast.error("索引重建失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [appendMaintenanceEvent, rebuild, recordsPage, rootId]);

  return (
    <section
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-panel"
      data-file-manager-index-manager
    >
      <header className="grid gap-3 border-b border-line bg-panel-2 px-3 py-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-ink-strong">
              全局内容索引
            </h2>
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-medium text-primary">
              {data?.rootCount ?? "所有"} 个入口
            </span>
            {data?.fastStats ? (
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-2xs text-subtle">
                快速统计
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-2xs text-muted">
            按需校验，默认只读索引元数据，避免进入页面就扫描整个文件系统。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => void stats.refetch()}
            disabled={busy}
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => copyContentIndexDiagnostics(data, health)}
            disabled={!data}
          >
            复制诊断
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => void runScan()}
            disabled={busy}
          >
            <ShieldCheck className="size-3.5" />
            扫描失效
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => void runRebuild()}
            disabled={busy}
            title="全局重建会扫描所有 root，风险太高；此按钮只重建当前入口。"
          >
            <Wrench className="size-3.5" />
            重建当前入口
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => void runClean()}
            disabled={busy || !data}
          >
            清理失效
          </Button>
        </div>
      </header>

      {stats.error ? (
        <ErrorState
          className="px-4 py-10"
          title="无法读取内容索引"
          description={stats.error.message}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void stats.refetch()}
            >
              重试
            </Button>
          }
        />
      ) : (
        <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
          <IndexOverviewStrip data={data} health={health} busy={busy} />
          <IndexToolbar
            query={queryDraft}
            statusFilter={statusFilter}
            recordsPage={recordsPage.data}
            maintenanceEvents={maintenanceEvents}
            onQueryChange={setQueryDraft}
            onStatusFilterChange={setStatusFilter}
          />
          <IndexRecordsPanel
            records={records}
            recordsPage={recordsPage.data}
            loading={
              recordsPage.isFetching || stats.isLoading || !recordsQueryReady
            }
            statusFilter={statusFilter}
            query={queryDraft}
            page={page}
            totalRecordCount={
              recordsPage.data?.totalRecordCount ?? data?.recordCount ?? 0
            }
            onPageChange={setPage}
            onRevealPath={onRevealPath}
            onOpenFile={onOpenFile}
          />
        </div>
      )}
    </section>
  );
}

function IndexOverviewStrip({
  data,
  health,
  busy,
}: {
  data?: FilesContentIndexStatsPayload;
  health: ContentIndexHealth;
  busy: boolean;
}) {
  const cards = [
    {
      icon: Database,
      label: "记录",
      value: data?.recordCount ?? "—",
      hint: data?.scope === "global" ? "全局" : (data?.rootId ?? "—"),
    },
    {
      icon: HardDrive,
      label: "容量",
      value: formatBytes(data?.indexedBytes ?? 0),
      hint: `${data?.shardCount ?? "—"} shards`,
    },
    {
      icon: Activity,
      label: "状态",
      value: health.label,
      hint: busy ? "读取中" : health.description,
    },
    {
      icon: FileSearch,
      label: "失效",
      value: data?.fastStats ? "待扫描" : (data?.staleRecordCount ?? "—"),
      hint: data?.fastStats
        ? "按需校验"
        : `${formatBytes(data?.staleBytes ?? 0)}`,
    },
  ];
  return (
    <div
      className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4"
      data-content-index-overview-strip
    >
      {cards.map((card) => (
        <div key={card.label} className="min-w-0 bg-panel px-3 py-2">
          <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-subtle">
            <card.icon className="size-3.5" />
            {card.label}
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-ink-strong">
            {card.value}
          </div>
          <div
            className="mt-0.5 truncate text-2xs text-muted"
            title={card.hint}
          >
            {card.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

function IndexToolbar({
  query,
  statusFilter,
  recordsPage,
  maintenanceEvents,
  onQueryChange,
  onStatusFilterChange,
}: {
  query: string;
  statusFilter: ContentIndexRecordStatusFilter;
  recordsPage?: FilesContentIndexRecordsPayload;
  maintenanceEvents: ContentIndexMaintenanceEvent[];
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: ContentIndexRecordStatusFilter) => void;
}) {
  return (
    <div
      className="grid gap-2 border-b border-line bg-panel-2 px-3 py-2 lg:grid-cols-[minmax(260px,420px)_auto_minmax(0,1fr)] lg:items-center"
      data-content-index-toolbar
    >
      <label className="relative block min-w-0">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索路径 / SHA / root"
          aria-label="搜索索引记录"
          className="h-8 pl-7 text-xs"
        />
      </label>
      <div
        className="inline-flex w-fit rounded border border-line bg-panel p-0.5"
        aria-label="索引状态筛选"
      >
        {(["all", "valid", "stale"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatusFilterChange(status)}
            className={cn(
              "rounded px-2.5 py-1 text-2xs text-muted hover:text-ink-strong",
              statusFilter === status && "bg-primary-soft text-primary",
            )}
          >
            {status === "all" ? "全部" : status === "valid" ? "有效" : "失效"}
          </button>
        ))}
      </div>
      <div className="min-w-0 truncate text-2xs text-muted">
        {recordsPage
          ? `后端分页 · ${recordsPage.returnedRecordCount}/${recordsPage.totalRecordCount} 条`
          : "等待统计加载"}
        {maintenanceEvents[0]
          ? ` · 最近：${actionLabel(maintenanceEvents[0].action)} ${maintenanceEvents[0].summary}`
          : ""}
      </div>
    </div>
  );
}

function IndexRecordsPanel({
  records,
  recordsPage,
  loading,
  statusFilter,
  query,
  page,
  totalRecordCount,
  onPageChange,
  onRevealPath,
  onOpenFile,
}: {
  records: FilesContentIndexRecordPreview[];
  recordsPage?: FilesContentIndexRecordsPayload;
  loading: boolean;
  statusFilter: ContentIndexRecordStatusFilter;
  query: string;
  page: number;
  totalRecordCount: number;
  onPageChange: (value: number) => void;
  onRevealPath?: (path: string, rootId?: string) => void;
  onOpenFile?: (entry: FileEntrySummary, rootId?: string) => void;
}) {
  const resolvedPage = recordsPage?.page ?? page;
  const pageSize = recordsPage?.pageSize ?? CONTENT_INDEX_RECORDS_PAGE_SIZE;
  const totalPages = recordsPage?.totalPages ?? Math.max(1, Math.ceil(totalRecordCount / pageSize));
  const offset = recordsPage?.offset ?? (resolvedPage - 1) * pageSize;
  const hasPrevious = resolvedPage > 1;
  const hasNext = resolvedPage < totalPages || Boolean(recordsPage?.hasMore);
  const [jumpDraft, setJumpDraft] = React.useState(String(resolvedPage));
  React.useEffect(() => {
    setJumpDraft(String(resolvedPage));
  }, [resolvedPage]);
  const commitJump = React.useCallback(() => {
    const next = Number(jumpDraft);
    if (!Number.isFinite(next)) {
      setJumpDraft(String(resolvedPage));
      return;
    }
    onPageChange(Math.min(totalPages, Math.max(1, Math.floor(next))));
  }, [jumpDraft, onPageChange, resolvedPage, totalPages]);
  const visibleStart = totalRecordCount > 0 ? offset + 1 : 0;
  const visibleEnd = Math.min(offset + records.length, totalRecordCount);
  const virtual = useVirtualRows(records, {
    rowHeight: CONTENT_INDEX_RECORD_ROW_HEIGHT,
    overscan: CONTENT_INDEX_RECORD_OVERSCAN,
  });
  return (
    <div
      className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]"
      data-content-index-records-panel
    >
      <div
        ref={virtual.scrollRef}
        onScroll={virtual.onScroll}
        className="min-h-0 overflow-auto overscroll-contain"
        data-content-index-records-scrollport
        data-content-index-virtualized-records
      >
        {loading && !records.length ? (
          <div className="px-4 py-8 text-center text-xs text-muted">
            正在加载索引记录…
          </div>
        ) : records.length ? (
          <div
            className="relative divide-y divide-line"
            style={{ height: virtual.totalHeight }}
            data-content-index-records-table
            data-content-index-rendered-count={virtual.items.length}
            data-content-index-total-count={records.length}
          >
            <div style={{ transform: `translateY(${virtual.paddingTop}px)` }}>
              {virtual.items.map((record) => (
                <IndexRecordRow
                  key={`${record.rootId}:${record.sha256}:${record.path}:${record.status}`}
                  record={record}
                  onRevealPath={onRevealPath}
                  onOpenFile={onOpenFile}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted">
            当前筛选没有索引记录。
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel px-3 py-2 text-xs text-muted">
        <span className="min-w-0 truncate">
          {visibleStart}-{visibleEnd}/{totalRecordCount} · 第 {resolvedPage}/{totalPages} 页
          {records.length > virtual.items.length
            ? ` · 已渲染 ${virtual.items.length}/${records.length}`
            : ""}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={loading || !records.length}
            onClick={() =>
              exportIndexRecordsCsv(records, {
                statusFilter,
                query,
                page,
                totalRecordCount,
              })
            }
            data-content-index-export-current-page
          >
            <Download className="size-3.5" />
            导出本页
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasPrevious || loading}
            onClick={() => onPageChange(Math.max(1, resolvedPage - 1))}
          >
            上一页
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted" data-content-index-page-jump>
            跳至
            <input
              value={jumpDraft}
              onChange={(event) => setJumpDraft(event.target.value)}
              onBlur={commitJump}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitJump();
              }}
              inputMode="numeric"
              className="h-7 w-14 rounded-md border border-line bg-panel px-2 text-center text-xs text-ink-strong outline-none focus:border-primary"
              aria-label="跳转索引页码"
            />
            页
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasNext || loading}
            onClick={() => onPageChange(Math.min(totalPages, resolvedPage + 1))}
          >
            下一页
          </Button>
        </div>
      </footer>
    </div>
  );
}

function IndexRecordRow({
  record,
  onRevealPath,
  onOpenFile,
}: {
  record: FilesContentIndexRecordPreview;
  onRevealPath?: (path: string, rootId?: string) => void;
  onOpenFile?: (entry: FileEntrySummary, rootId?: string) => void;
}) {
  return (
    <div
      className="grid min-h-[64px] gap-2 px-3 py-2 text-xs [content-visibility:auto] [contain-intrinsic-size:64px] hover:bg-panel-2 md:grid-cols-[92px_120px_minmax(220px,1fr)_92px_120px] md:items-center"
      data-content-index-record-row
      data-content-index-record-card
    >
      <span
        className={cn(
          "w-fit rounded-full px-2 py-0.5",
          record.status === "valid"
            ? "bg-green-soft text-green"
            : "bg-amber-soft text-amber",
        )}
      >
        {record.status === "valid" ? "有效" : "失效"}
      </span>
      <span
        className="min-w-0 truncate font-mono text-2xs text-subtle"
        title={record.rootId}
      >
        {record.rootId ?? "—"}
      </span>
      <span
        className="min-w-0 truncate font-mono text-ink-strong"
        title={record.path}
      >
        {record.path}
      </span>
      <span className="text-muted">{formatBytes(record.size)}</span>
      <span
        className="flex flex-wrap justify-start gap-1 md:justify-end"
        data-content-index-record-actions
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => copyIndexRecord(record)}
        >
          复制
        </Button>
        {onRevealPath && record.status === "valid" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onRevealPath(record.path, record.rootId)}
          >
            定位
          </Button>
        ) : null}
        {onOpenFile && record.status === "valid" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              onRevealPath?.(record.path, record.rootId);
              onOpenFile(contentIndexRecordToFileEntry(record), record.rootId);
            }}
          >
            预览
          </Button>
        ) : null}
      </span>
    </div>
  );
}

function useIdleReady(timeoutMs: number): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(() => setReady(true), {
        timeout: timeoutMs,
      });
      return () => win.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [timeoutMs]);
  return ready;
}

function useVirtualRows<T>(
  items: T[],
  options: { rowHeight: number; overscan: number },
) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = React.useState({ scrollTop: 0, height: 0 });
  const measure = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setViewport({ scrollTop: node.scrollTop, height: node.clientHeight });
  }, []);
  React.useLayoutEffect(() => {
    measure();
  }, [items.length, measure]);
  const onScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    setViewport({ scrollTop: target.scrollTop, height: target.clientHeight });
  }, []);
  const visibleCount = Math.max(
    16,
    Math.ceil((viewport.height || options.rowHeight * 16) / options.rowHeight),
  );
  const start = Math.max(
    0,
    Math.floor(viewport.scrollTop / options.rowHeight) - options.overscan,
  );
  const end = Math.min(
    items.length,
    start + visibleCount + options.overscan * 2,
  );
  return {
    scrollRef,
    onScroll,
    items: items.slice(start, end),
    paddingTop: start * options.rowHeight,
    totalHeight: Math.max(items.length * options.rowHeight, options.rowHeight),
  };
}

function contentIndexRecordToFileEntry(
  record: FilesContentIndexRecordPreview,
): FileEntrySummary {
  const name =
    record.path.split("/").filter(Boolean).pop() ||
    record.path ||
    "indexed-file";
  return {
    path: record.path,
    name,
    kind: "file",
    ext: extensionOf(name),
    size: record.size,
    modifiedAt: null,
    hidden: name.startsWith("."),
    textLike: false,
    imageLike: false,
    mode: "",
    permissions: "",
    uid: null,
    gid: null,
  };
}

function extensionOf(name: string): string | null {
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return null;
  return name.slice(index + 1).toLowerCase();
}

interface ContentIndexHealth {
  level: "checking" | "empty" | "healthy" | "stale" | "large-preview";
  label: string;
  description: string;
  staleRatio: number;
}

export function deriveContentIndexHealth(
  data: FilesContentIndexStatsPayload | undefined,
  busy = false,
): ContentIndexHealth {
  if (busy)
    return {
      level: "checking",
      label: "检查中",
      description: "读取中",
      staleRatio: 0,
    };
  if (!data || data.recordCount === 0)
    return {
      level: "empty",
      label: "未建立",
      description: "暂无索引记录",
      staleRatio: 0,
    };
  const staleRatio = data.staleRecordCount / Math.max(data.recordCount, 1);
  if (data.staleRecordCount > 0)
    return {
      level: "stale",
      label: staleRatio > 0.2 ? "需维护" : "有失效",
      description: `${data.staleRecordCount} 条失效`,
      staleRatio,
    };
  if (data.fastStats)
    return {
      level: "healthy",
      label: "快速",
      description: "元数据统计",
      staleRatio: 0,
    };
  return {
    level: "healthy",
    label: "健康",
    description: "已校验",
    staleRatio: 0,
  };
}

function copyIndexRecord(record: FilesContentIndexRecordPreview): void {
  const text = JSON.stringify(record, null, 2);
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("索引记录已复制"));
    return;
  }
  toast.info("当前浏览器不支持剪贴板复制");
}

function copyContentIndexDiagnostics(
  data: FilesContentIndexStatsPayload | undefined,
  health: ContentIndexHealth,
): void {
  if (!data) return;
  const diagnostics = {
    rootId: data.rootId,
    scope: data.scope,
    rootCount: data.rootCount,
    fastStats: data.fastStats,
    checkedAt: data.checkedAt,
    health: health.label,
    recordCount: data.recordCount,
    validRecordCount: data.validRecordCount,
    staleRecordCount: data.staleRecordCount,
    shardCount: data.shardCount,
    hashCount: data.hashCount,
    indexedBytes: data.indexedBytes,
    staleBytes: data.staleBytes,
    newestIndexedAt: data.newestIndexedAt,
    storageDirectory: data.storageDirectory,
  };
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard
      .writeText(JSON.stringify(diagnostics, null, 2))
      .then(() => toast.success("索引诊断已复制"));
    return;
  }
  toast.info("当前浏览器不支持剪贴板复制");
}

function exportIndexRecordsCsv(
  records: FilesContentIndexRecordPreview[],
  context: {
    statusFilter: ContentIndexRecordStatusFilter;
    query: string;
    page: number;
    totalRecordCount: number;
  },
): void {
  const csv = [
    ["rootId", "status", "path", "size", "sha256", "indexedAt"].join(","),
    ...records.map((record) =>
      [
        record.rootId ?? "",
        record.status,
        record.path,
        String(record.size),
        record.sha256,
        record.indexedAt ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    ),
  ].join("\n");
  const fileName =
    [
      "tracevane-content-index",
      context.statusFilter,
      context.query ? safeExportName(context.query) : "all",
      `page-${context.page}`,
    ].join("-") + ".csv";
  if (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof Blob !== "undefined"
  ) {
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("索引记录 CSV 已导出", {
      description: `本页 ${records.length} 条 / 总计 ${context.totalRecordCount} 条`,
    });
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard
      .writeText(csv)
      .then(() => toast.success("索引记录 CSV 已复制"));
    return;
  }
  toast.info("当前环境不支持 CSV 导出");
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
function safeExportName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 48) || "query"
  );
}
function actionLabel(action: ContentIndexMaintenanceEvent["action"]): string {
  return action === "scan" ? "扫描" : action === "clean" ? "清理" : "重建";
}
function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next >= 10 || unit === 0 ? next.toFixed(0) : next.toFixed(1)} ${units[unit]}`;
}
