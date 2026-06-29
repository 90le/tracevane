import * as React from "react";
import { Database, Download } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import {
  useCleanFilesContentIndexMutation,
  useFilesContentIndexRecordsQuery,
  useFilesContentIndexQuery,
  useRebuildFilesContentIndexMutation,
  useScanFilesContentIndexMutation,
  FILES_GLOBAL_SCOPE_ID,
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
const CONTENT_INDEX_RECORDS_PAGE_SIZE = 100;

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
  const recordsPage = useFilesContentIndexRecordsQuery({
    rootId: indexScopeRootId,
    status: statusFilter,
    query,
    offset: (page - 1) * CONTENT_INDEX_RECORDS_PAGE_SIZE,
    limit: CONTENT_INDEX_RECORDS_PAGE_SIZE,
  });
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
        ].slice(0, 8),
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
        summary: "完成失效扫描，统计已刷新",
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
        summary: `扫描 ${result.scannedFileCount} 个文件，写入 ${result.rebuiltRecordCount} 条记录${result.truncated ? "；达到安全上限" : ""}`,
      });
      toast.success("索引重建完成", {
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
    <div className="p-4">
      <section className="overflow-hidden rounded-md border border-line bg-panel">
        <div className="grid gap-3 border-b border-line bg-panel-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="size-4 text-primary" />
              <h2 className="text-base font-semibold text-ink-strong">
                内容索引管理
              </h2>
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-medium text-primary">
                全局 · {data?.rootCount ?? "所有"} 个入口
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted">
              全局汇总所有入口的内容索引；默认使用快速元数据统计，扫描失效时再做精确文件校验。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void stats.refetch()}
              disabled={busy}
            >
              刷新统计
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyContentIndexDiagnostics(data, health)}
              disabled={!data}
            >
              复制诊断
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runScan()}
              disabled={busy}
            >
              扫描失效
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runRebuild()}
              disabled={busy}
              title="为避免全局扫描整个文件系统，重建仍限定为当前入口；全局视图会立即汇总所有入口已有索引。"
            >
              {rebuild.isPending ? "重建中..." : "重建当前入口"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void runClean()}
              disabled={busy || !data?.staleRecordCount}
            >
              清理失效
            </Button>
          </div>
        </div>

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
          <>
            <IndexHealthPanel
              health={health}
              data={data}
              maintenanceEvents={maintenanceEvents}
            />
            <div className="grid gap-0 divide-y divide-line text-sm lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              <IndexCapabilityCard
                title="分片"
                value={data?.shardCount ?? "—"}
                description="索引 shard 文件数量。"
              />
              <IndexCapabilityCard
                title="Hash"
                value={data?.hashCount ?? "—"}
                description="已记录的 SHA-256 key 数。"
              />
              <IndexCapabilityCard
                title="快速有效"
                value={data?.validRecordCount ?? "—"}
                description={
                  data?.fastStats
                    ? "快速统计按索引元数据估算；扫描失效会精确校验。"
                    : "已通过文件系统校验的有效记录。"
                }
              />
              <IndexCapabilityCard
                title="失效记录"
                value={
                  data?.fastStats ? "待扫描" : (data?.staleRecordCount ?? "—")
                }
                description="文件删除/修改后待清理记录；快速模式不会逐文件 stat。"
              />
            </div>
            <div className="grid gap-0 border-t border-line text-sm lg:grid-cols-3 lg:divide-x lg:divide-line">
              <IndexCapabilityCard
                title="索引容量"
                value={formatBytes(data?.indexedBytes ?? 0)}
                description="有效索引记录累计文件大小。"
              />
              <IndexCapabilityCard
                title="失效容量"
                value={formatBytes(data?.staleBytes ?? 0)}
                description="失效记录对应的历史文件大小。"
              />
              <IndexCapabilityCard
                title="最近写入"
                value={
                  data?.newestIndexedAt
                    ? new Date(data.newestIndexedAt).toLocaleString()
                    : "—"
                }
                description="最近一次索引记录时间。"
              />
            </div>
            <IndexRecordsPanel
              records={records}
              recordsPage={recordsPage.data}
              loading={recordsPage.isFetching}
              statusFilter={statusFilter}
              query={queryDraft}
              page={page}
              previewLimit={data?.previewLimit ?? 0}
              totalRecordCount={
                recordsPage.data?.totalRecordCount ?? data?.recordCount ?? 0
              }
              onStatusFilterChange={setStatusFilter}
              onQueryChange={setQueryDraft}
              onPageChange={setPage}
              onRevealPath={onRevealPath}
              onOpenFile={onOpenFile}
            />
            <div className="border-t border-line px-4 py-3">
              <code className="block overflow-x-auto rounded bg-panel-2 px-2 py-1 text-xs text-muted">
                {data?.storageDirectory ??
                  `.openclaw/.tracevane/file-content-index`}
              </code>
            </div>
          </>
        )}
      </section>
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
  previewLimit,
  totalRecordCount,
  onStatusFilterChange,
  onQueryChange,
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
  previewLimit: number;
  totalRecordCount: number;
  onStatusFilterChange: (value: ContentIndexRecordStatusFilter) => void;
  onQueryChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onRevealPath?: (path: string, rootId?: string) => void;
  onOpenFile?: (entry: FileEntrySummary, rootId?: string) => void;
}) {
  const validCount = records.filter(
    (record) => record.status === "valid",
  ).length;
  const staleCount = records.filter(
    (record) => record.status === "stale",
  ).length;
  const offset =
    recordsPage?.offset ?? (page - 1) * CONTENT_INDEX_RECORDS_PAGE_SIZE;
  const limit = recordsPage?.limit ?? CONTENT_INDEX_RECORDS_PAGE_SIZE;
  const hasPrevious = offset > 0;
  const hasNext = Boolean(recordsPage?.hasMore);
  const visibleStart = totalRecordCount > 0 ? offset + 1 : 0;
  const visibleEnd = Math.min(offset + records.length, totalRecordCount);
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-2 bg-panel-2 px-4 py-3 text-xs">
        <span className="font-semibold text-ink-strong">索引记录</span>
        <span className="rounded border border-line bg-panel px-2 py-1 text-subtle">
          分页 {visibleStart}-{visibleEnd}/{totalRecordCount} · 本页有效{" "}
          {validCount} · 失效 {staleCount}
        </span>
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索路径 / SHA"
          aria-label="搜索索引记录"
          className="h-8 w-full min-w-52 max-w-sm text-xs md:w-72"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={loading || !records.length}
          onClick={() =>
            exportIndexRecordsCsv(records, {
              statusFilter,
              query,
              page,
              totalRecordCount,
            })
          }
          title="只导出当前筛选条件下已经加载的这一页记录"
          data-content-index-export-current-page
        >
          <Download className="size-3.5" />
          导出本页 CSV
        </Button>
        <div
          className="ml-auto inline-flex rounded border border-line bg-panel p-0.5"
          aria-label="索引状态筛选"
        >
          {(["all", "valid", "stale"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusFilterChange(status)}
              className={cn(
                "rounded px-2 py-1 text-2xs text-muted hover:text-ink-strong",
                statusFilter === status && "bg-primary-soft text-primary",
              )}
            >
              {status === "all" ? "全部" : status === "valid" ? "有效" : "失效"}
            </button>
          ))}
        </div>
      </div>
      {recordsPage ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel px-4 py-2 text-xs text-muted">
          <span>
            后端分页查询 · 本页 {recordsPage.returnedRecordCount} 条 / 每页{" "}
            {limit} 条 · 状态{" "}
            {recordsPage.status === "all"
              ? "全部"
              : recordsPage.status === "valid"
                ? "有效"
                : "失效"}
            {recordsPage.query ? ` · 查询 ${recordsPage.query}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!hasPrevious || loading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              上一页
            </Button>
            <span className="rounded border border-line bg-panel-2 px-2 py-1 text-2xs">
              第 {page} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!hasNext || loading}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : previewLimit && totalRecordCount > previewLimit ? (
        <div className="border-t border-line bg-primary-soft px-4 py-2 text-xs text-primary">
          当前使用兼容预览数据；新环境会通过后端分页查询管理大索引，避免一次性拉取过多记录。
        </div>
      ) : null}
      {loading && !records.length ? (
        <div className="px-4 py-6 text-center text-xs text-muted">
          正在加载索引记录…
        </div>
      ) : records.length ? (
        <>
          <div
            className="grid gap-2 p-3 md:hidden"
            data-content-index-records-mobile-list
            aria-label="内容索引记录移动端列表"
          >
            {records.map((record) => (
              <article
                key={`${record.sha256}:${record.path}:${record.status}:card`}
                className="grid gap-2 rounded-md border border-line bg-panel px-3 py-2 text-xs"
                data-content-index-record-card
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5",
                      record.status === "valid"
                        ? "bg-green-soft text-green"
                        : "bg-amber-soft text-amber",
                    )}
                  >
                    {record.status === "valid" ? "有效" : "失效"}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-ink-strong"
                    title={record.path}
                  >
                    {record.path}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-2xs text-muted">
                  <span className="rounded bg-panel-2 px-2 py-1">
                    大小 {formatBytes(record.size)}
                  </span>
                  <span
                    className="truncate rounded bg-panel-2 px-2 py-1 font-mono"
                    title={record.sha256}
                  >
                    SHA {record.sha256.slice(0, 12)}…
                  </span>
                </div>
                <IndexRecordActions
                  record={record}
                  onRevealPath={onRevealPath}
                  onOpenFile={onOpenFile}
                  className="justify-end"
                />
              </article>
            ))}
          </div>
          <div
            className="hidden max-h-[420px] min-w-0 overflow-auto overscroll-contain md:block"
            data-content-index-records-scrollport
            aria-label="内容索引记录表格，可横向滚动查看完整路径、SHA 和操作"
          >
            <div className="min-w-[760px]" data-content-index-records-table>
              <div className="grid grid-cols-[92px_minmax(220px,1fr)_120px_136px_160px] border-y border-line bg-panel-2 px-4 py-2 text-2xs font-medium uppercase tracking-wide text-subtle">
                <span>状态</span>
                <span>路径</span>
                <span>大小</span>
                <span>SHA-256</span>
                <span className="text-right">操作</span>
              </div>
              {records.map((record) => (
                <div
                  key={`${record.sha256}:${record.path}:${record.status}`}
                  className="grid grid-cols-[92px_minmax(220px,1fr)_120px_136px_160px] items-center border-b border-line px-4 py-2 text-xs last:border-b-0"
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
                    className="min-w-0 truncate font-mono text-ink-strong"
                    title={record.path}
                  >
                    {record.path}
                  </span>
                  <span className="text-muted">{formatBytes(record.size)}</span>
                  <span className="font-mono text-subtle" title={record.sha256}>
                    {record.sha256.slice(0, 12)}…
                  </span>
                  <IndexRecordActions
                    record={record}
                    onRevealPath={onRevealPath}
                    onOpenFile={onOpenFile}
                    className="justify-end"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-muted">
          当前筛选没有索引记录。
        </div>
      )}
    </div>
  );
}

function IndexRecordActions({
  record,
  onRevealPath,
  onOpenFile,
  className,
}: {
  record: FilesContentIndexRecordPreview;
  onRevealPath?: (path: string, rootId?: string) => void;
  onOpenFile?: (entry: FileEntrySummary, rootId?: string) => void;
  className?: string;
}) {
  return (
    <span
      className={cn("flex flex-wrap gap-1", className)}
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
          预览 / 编辑
        </Button>
      ) : null}
    </span>
  );
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
  if (busy) {
    return {
      level: "checking",
      label: "检查中",
      description: "正在读取或维护内容索引，完成后会刷新健康状态。",
      staleRatio: 0,
    };
  }
  if (!data || data.recordCount === 0) {
    return {
      level: "empty",
      label: "未建立",
      description: "全局内容索引暂时没有记录；上传文件或重建某个入口后会生成。",
      staleRatio: 0,
    };
  }
  const staleRatio = data.staleRecordCount / Math.max(data.recordCount, 1);
  if (data.staleRecordCount > 0) {
    return {
      level: "stale",
      label: staleRatio > 0.2 ? "需要维护" : "有失效项",
      description: `${data.staleRecordCount} 条记录已失效，建议清理或按入口重建。`,
      staleRatio,
    };
  }
  if (data.recordCount > data.previewLimit) {
    return {
      level: "large-preview",
      label: "分页管理",
      description:
        "索引统计健康；记录列表通过后端分页查询管理大索引，避免一次性拉取过多数据。",
      staleRatio: 0,
    };
  }
  return {
    level: "healthy",
    label: data.fastStats ? "快速统计" : "健康",
    description: data.fastStats
      ? "已快速读取全局索引元数据；需要精确失效数时点击“扫描失效”。"
      : "有效记录与文件系统一致，可用于同内容复用和后续高性能搜索。",
    staleRatio: 0,
  };
}

function IndexHealthPanel({
  health,
  data,
  maintenanceEvents,
}: {
  health: ContentIndexHealth;
  data: FilesContentIndexStatsPayload | undefined;
  maintenanceEvents: ContentIndexMaintenanceEvent[];
}) {
  const levelClassName =
    health.level === "healthy"
      ? "border-green/20 bg-green-soft text-green"
      : health.level === "stale"
        ? "border-amber/20 bg-amber-soft text-amber"
        : health.level === "checking"
          ? "border-primary-line bg-primary-soft text-primary"
          : "border-line bg-panel-2 text-muted";
  return (
    <div className="grid gap-3 border-b border-line px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className={cn("rounded-md border p-3", levelClassName)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-panel/70 px-2 py-0.5 text-2xs font-semibold">
            {health.label}
          </span>
          <span className="text-xs">索引健康状态</span>
        </div>
        <p className="mt-2 text-sm font-medium">{health.description}</p>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
          <span className="rounded bg-panel/70 px-2 py-1">
            总记录 {data?.recordCount ?? 0}
          </span>
          <span className="rounded bg-panel/70 px-2 py-1">
            范围{" "}
            {data?.scope === "global"
              ? `全局 ${data.rootCount ?? 0} 入口`
              : (data?.rootId ?? "—")}
          </span>
          <span className="rounded bg-panel/70 px-2 py-1">
            失效率{" "}
            {data?.fastStats
              ? "待扫描"
              : `${(health.staleRatio * 100).toFixed(1)}%`}
          </span>
          <span className="rounded bg-panel/70 px-2 py-1">
            检查{" "}
            {data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : "—"}
          </span>
        </div>
      </div>
      <div className="rounded-md border border-line bg-panel-2 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink-strong">
            维护事件
          </span>
          <span className="text-2xs text-subtle">
            本会话最近 {maintenanceEvents.length} 条
          </span>
        </div>
        {maintenanceEvents.length ? (
          <div className="grid max-h-32 gap-1 overflow-auto">
            {maintenanceEvents.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded border border-line bg-panel px-2 py-1 text-2xs"
              >
                <span
                  className={cn(
                    "font-semibold",
                    event.status === "success" ? "text-green" : "text-red",
                  )}
                >
                  {actionLabel(event.action)}
                </span>
                <span
                  className="min-w-0 truncate text-muted"
                  title={event.summary}
                >
                  {new Date(event.at).toLocaleTimeString()} · {event.summary}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-line bg-panel px-2 py-3 text-center text-xs text-muted">
            暂无维护事件；执行扫描、清理或重建后会留下本会话证据。
          </div>
        )}
      </div>
    </div>
  );
}

function IndexCapabilityCard({
  title,
  value,
  description,
}: {
  title: string;
  value: React.ReactNode;
  description: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-2xs font-medium uppercase tracking-wide text-subtle">
        {title}
      </div>
      <div className="mt-1 text-base font-semibold text-ink-strong">
        {value}
      </div>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </div>
  );
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
  if (action === "scan") return "扫描";
  if (action === "clean") return "清理";
  return "重建";
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
