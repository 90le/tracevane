import * as React from "react";
import {
  ArchiveRestore,
  FileText,
  FolderOpen,
  Gauge,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";
import {
  FILES_GLOBAL_SCOPE_ID,
  useFilesTrashQuery,
  usePurgeFilesTrashMutation,
  useRestoreFilesTrashMutation,
} from "@/lib/query/files";
import type {
  FilesTransferConflictPolicy,
  FilesTrashItem,
} from "../../../../../types/files";
import type { FileOperationRecord } from "./OperationHistoryPanel";
import { createOperationRecord } from "./OperationHistoryPanel";

const TRASH_PAGE_SIZE = 50;

export function TrashManager({
  onRevealPath,
  onRecord,
}: {
  rootId: string;
  rootLabel: string;
  onRevealPath?: (path: string, rootId?: string) => void;
  onRecord?: (record: FileOperationRecord) => void;
}) {
  const trashScopeRootId = FILES_GLOBAL_SCOPE_ID;
  const trashQueryReady = useIdleReady(120);
  const [page, setPage] = React.useState(1);
  const trash = useFilesTrashQuery(
    { rootId: trashScopeRootId, page, pageSize: TRASH_PAGE_SIZE },
    { enabled: trashQueryReady },
  );
  const restoreMutation = useRestoreFilesTrashMutation();
  const purgeMutation = usePurgeFilesTrashMutation();
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [conflictPolicy, setConflictPolicy] =
    React.useState<FilesTransferConflictPolicy>("rename");
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query.trim().toLowerCase());
  const items = trash.data?.items ?? [];
  const categoryItems = React.useMemo(() => categorizeTrash(items), [items]);
  const [category, setCategory] = React.useState<TrashCategory>("all");
  const scopedItems = categoryItems[category];
  const visibleItems = React.useMemo(() => {
    const sourceItems = scopedItems;
    if (!deferredQuery) return sourceItems;
    return sourceItems.filter((item) =>
      [item.name, item.originalPath, item.rootId, item.trashPath]
        .join("\n")
        .toLowerCase()
        .includes(deferredQuery),
    );
  }, [deferredQuery, scopedItems]);
  const selectedItems = React.useMemo(
    () => items.filter((item) => selectedPaths.has(item.trashPath)),
    [items, selectedPaths],
  );
  const summary = React.useMemo(() => summarizeTrash(items), [items]);
  const totalItems = trash.data?.totalItemCount ?? items.length;
  const totalPages = trash.data?.totalPages ?? Math.max(1, Math.ceil(totalItems / TRASH_PAGE_SIZE));

  React.useEffect(() => {
    setPage(1);
  }, [category, deferredQuery]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  React.useEffect(() => {
    setSelectedPaths(
      (prev) =>
        new Set(
          [...prev].filter((path) =>
            items.some((item) => item.trashPath === path),
          ),
        ),
    );
  }, [items]);

  const toggle = React.useCallback((item: FilesTrashItem) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(item.trashPath)) next.delete(item.trashPath);
      else next.add(item.trashPath);
      return next;
    });
  }, []);

  const restoreItem = React.useCallback(
    async (item: FilesTrashItem) => {
      try {
        const result = await restoreMutation.mutateAsync({
          rootId: trashScopeRootId,
          trashPath: item.trashPath,
          conflictPolicy,
        });
        onRecord?.(
          createOperationRecord({
            title: "恢复回收站项目",
            status: "success",
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
            affectedPaths: result.affectedPaths,
            errorMessages: [],
          }),
        );
        toast.success("已恢复", { description: item.originalPath });
        if (result.affectedPaths[1]) {
          onRevealPath?.(result.affectedPaths[1], item.rootId);
        }
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          next.delete(item.trashPath);
          return next;
        });
      } catch (error) {
        toast.error("恢复失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [conflictPolicy, onRecord, onRevealPath, restoreMutation, trashScopeRootId],
  );

  const purgeItems = React.useCallback(
    async (targetItems: FilesTrashItem[]) => {
      if (!targetItems.length) return;
      try {
        const result = await purgeMutation.mutateAsync({
          rootId: trashScopeRootId,
          trashPaths: targetItems.map((item) => item.trashPath),
        });
        onRecord?.(
          createOperationRecord({
            title: "永久清理回收站",
            status: "success",
            itemCount: targetItems.length,
            successCount: targetItems.length,
            failureCount: 0,
            affectedPaths: result.affectedPaths,
            errorMessages: [],
          }),
        );
        toast.success("已永久删除", {
          description: `${targetItems.length} 个回收站项目已清理。`,
        });
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          for (const item of targetItems) next.delete(item.trashPath);
          return next;
        });
      } catch (error) {
        toast.error("清理失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onRecord, purgeMutation, trashScopeRootId],
  );

  return (
    <section
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-panel"
      data-file-manager-trash-manager
    >
      <header className="grid gap-3 border-b border-line bg-panel-2 px-3 py-2 md:px-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 lg:flex-wrap lg:justify-end lg:overflow-visible lg:pb-0">
              <h2 className="text-sm font-semibold text-ink-strong">
                全局回收站
              </h2>
              <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-muted">
                {totalItems} 项 · {selectedItems.length} 已选
              </span>
            </div>
            <p className="mt-0.5 hidden truncate text-xs text-muted sm:block">
              所有 root 删除项统一进入 .openclaw/.tracevane/trash，恢复时自动回到原 root。
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 lg:flex-wrap lg:justify-end lg:overflow-visible lg:pb-0">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void trash.refetch()}
            disabled={trash.isFetching}
          >
            <RotateCcw className="size-4" />
            {trash.isFetching ? "刷新中" : "刷新"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="shrink-0"
            onClick={() =>
              void purgeItems(selectedItems.length ? selectedItems : items)
            }
            disabled={!items.length || purgeMutation.isPending}
          >
            <Trash2 className="size-4" />
            {selectedItems.length
              ? `永久删除 ${selectedItems.length} 项`
              : "清空回收站"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="border-b border-line bg-panel-2/70" data-file-manager-trash-overview>
        <div className="flex gap-2 overflow-x-auto px-3 py-2 sm:hidden">
          <TrashChip label="全部" value={`${totalItems}`} />
          <TrashChip label="目录" value={`${summary.directories}`} />
          <TrashChip label="文件" value={`${summary.files}`} />
          <TrashChip label="策略" value={conflictPolicyLabel(conflictPolicy)} />
        </div>
        <MetricRail className="hidden px-3 py-2 sm:grid sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(220px,0.9fr)] lg:px-4">
          <MetricTile icon={<ArchiveRestore className="size-4" />} label="全部项目" value={totalItems} hint={`${summary.rootCount} 个 root`} />
          <MetricTile icon={<FolderOpen className="size-4" />} label="目录" value={summary.directories} hint="可整目录恢复" />
          <MetricTile icon={<FileText className="size-4" />} label="文件" value={summary.files} hint={formatBytes(summary.size)} />
          <MetricTile icon={<ShieldAlert className="size-4" />} label="恢复策略" value={conflictPolicyLabel(conflictPolicy)} hint="默认保留两者" />
          <label className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-panel px-3 text-xs">
            <Search className="size-4 shrink-0 text-subtle" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选名称、原路径、root" className="h-full min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink-strong outline-none placeholder:text-subtle" aria-label="筛选回收站" />
          </label>
        </MetricRail>
        <label className="mx-3 mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs shadow-sm sm:hidden">
          <Search className="size-3.5 shrink-0 text-subtle" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选回收站" className="min-w-0 flex-1 bg-transparent text-xs text-ink-strong outline-none placeholder:text-subtle" aria-label="筛选回收站" />
        </label>
      </div>

      <div className="grid min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-2 sm:p-3 lg:grid-cols-[132px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-3">
        <TrashCategoryRail
          category={category}
          counts={categoryItems.counts}
          onCategoryChange={setCategory}
        />
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-t-lg border border-b-0 border-line bg-panel-2 px-2 py-2 text-xs text-muted sm:px-3"
            data-file-manager-trash-toolbar
          >
            <label className="hidden items-center gap-2 sm:flex">
              <Gauge className="size-4 text-subtle" />
              <span className="text-subtle">恢复冲突策略</span>
              <select
                value={conflictPolicy}
                aria-label="恢复冲突策略"
                data-file-manager-trash-conflict-policy
                onChange={(event) =>
                  setConflictPolicy(
                    event.target.value as FilesTransferConflictPolicy,
                  )
                }
                className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink-strong outline-none"
              >
                <option value="rename">保留两者</option>
                <option value="fail">遇到同名时报错</option>
                <option value="overwrite">覆盖原路径</option>
                <option value="skip">跳过恢复</option>
              </select>
            </label>
            <span>
              {query
                ? `${visibleItems.length} / ${items.length} 项匹配`
                : `第 ${trash.data?.page ?? page}/${totalPages} 页 · 全局回收站`}
            </span>
          </div>

          {!trashQueryReady || trash.isLoading ? (
            <TrashLoading />
          ) : trash.error ? (
            <ErrorState
              className="px-4 py-10"
              title="无法读取回收站"
              description={trash.error.message}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void trash.refetch()}
                >
                  重试
                </Button>
              }
            />
          ) : !items.length ? (
            <EmptyState
              className="px-4 py-10"
              title="回收站为空"
              description="默认删除的文件会显示在这里。"
              icon={<Trash2 />}
            />
          ) : !visibleItems.length ? (
            <EmptyState
              className="px-4 py-10"
              title="没有匹配的回收站项目"
              description={`没有匹配“${query}”的项目，试试调整筛选关键词。`}
            />
          ) : (
            <div
              className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-b-lg border border-line bg-panel"
              data-file-manager-trash-list
            >
              <div className="sticky top-0 z-10 hidden grid-cols-[42px_minmax(180px,1.1fr)_minmax(160px,0.75fr)_minmax(220px,1.4fr)_110px_152px] gap-3 border-b border-line bg-panel-2 px-3 py-2 text-xs font-medium text-subtle lg:grid">
                <span />
                <span>名称</span>
                <span>来源 root</span>
                <span>原路径</span>
                <span>大小</span>
                <span className="text-right">操作</span>
              </div>
              <TrashVirtualRows
                items={visibleItems}
                selectedPaths={selectedPaths}
                restorePending={restoreMutation.isPending}
                purgePending={purgeMutation.isPending}
                onToggle={toggle}
                onRevealPath={onRevealPath}
                onRestore={restoreItem}
                onPurge={(item) => void purgeItems([item])}
              />
              <TrashPagination
                page={trash.data?.page ?? page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageItems={visibleItems.length}
                loading={trash.isFetching}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}

type TrashCategory = "all" | "directory" | "file" | "image" | "document";

function TrashCategoryRail({
  category,
  counts,
  onCategoryChange,
}: {
  category: TrashCategory;
  counts: Record<TrashCategory, number>;
  onCategoryChange: (category: TrashCategory) => void;
}) {
  const categories: Array<{ id: TrashCategory; label: string }> = [
    { id: "all", label: "全部" },
    { id: "directory", label: "文件夹" },
    { id: "file", label: "文件" },
    { id: "image", label: "图片" },
    { id: "document", label: "文档" },
  ];
  return (
    <nav
      className="mb-2 grid max-w-full grid-cols-3 gap-1 overflow-x-auto rounded-lg border border-line bg-panel-2 p-1 text-xs sm:grid-cols-5 lg:mb-0 lg:block lg:overflow-visible lg:p-0"
      aria-label="回收站分类"
      data-file-manager-trash-category-rail
    >
      {categories.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onCategoryChange(item.id)}
          className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-left text-muted hover:bg-panel hover:text-ink-strong lg:rounded-none lg:border-b lg:border-line lg:last:border-b-0",
            category === item.id && "bg-panel text-primary",
          )}
          data-file-manager-trash-category={item.id}
        >
          <span>{item.label}</span>
          <span>{counts[item.id]}</span>
        </button>
      ))}
    </nav>
  );
}

function TrashVirtualRows({
  items,
  selectedPaths,
  restorePending,
  purgePending,
  onToggle,
  onRevealPath,
  onRestore,
  onPurge,
}: {
  items: FilesTrashItem[];
  selectedPaths: Set<string>;
  restorePending: boolean;
  purgePending: boolean;
  onToggle: (item: FilesTrashItem) => void;
  onRevealPath?: (path: string, rootId?: string) => void;
  onRestore: (item: FilesTrashItem) => void;
  onPurge: (item: FilesTrashItem) => void;
}) {
  const virtual = useVirtualRows(items, { rowHeight: 68, overscan: 8 });
  return (
    <div
      ref={virtual.scrollRef}
      onScroll={virtual.onScroll}
      className="min-h-0 overflow-y-auto overscroll-contain"
      data-file-manager-trash-virtual-list
      data-file-manager-trash-rendered-count={virtual.items.length}
      data-file-manager-trash-total-count={items.length}
    >
      <div className="relative" style={{ height: virtual.totalHeight }}>
        <div style={{ transform: `translateY(${virtual.paddingTop}px)` }}>
          {virtual.items.map((item) => (
            <article
              key={item.trashPath}
              className="grid min-h-[68px] max-w-full gap-2 border-b border-line px-2 py-2 [content-visibility:auto] [contain-intrinsic-size:68px] last:border-b-0 hover:bg-panel-2/70 sm:px-3 lg:grid-cols-[42px_minmax(140px,1.1fr)_minmax(120px,0.65fr)_minmax(180px,1.4fr)_90px_142px] lg:items-center lg:gap-3"
              data-file-manager-trash-item={item.trashPath}
              data-file-manager-trash-root-id={item.rootId}
              data-file-manager-trash-original-path={item.originalPath}
            >
              <label className="flex items-center gap-2 text-xs text-muted lg:block">
                <input
                  type="checkbox"
                  checked={selectedPaths.has(item.trashPath)}
                  onChange={() => onToggle(item)}
                  className="size-4 accent-primary"
                  aria-label={`选择 ${item.name}`}
                />
                <span className="lg:sr-only">选择</span>
              </label>
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-medium text-ink-strong"
                  title={item.trashPath}
                >
                  {item.name}
                </div>
                <div className="mt-1 text-xs text-muted lg:hidden">
                  {formatBytes(item.size ?? 0)} ·{" "}
                  {new Date(item.deletedAt).toLocaleString()}
                </div>
              </div>
              <span
                className="min-w-0 truncate rounded-md bg-panel-2 px-2 py-1 font-mono text-xs text-subtle"
                title={item.rootId}
              >
                {item.rootId}
              </span>
              <button
                type="button"
                onClick={() => onRevealPath?.(item.originalPath, item.rootId)}
                className="min-w-0 truncate text-left font-mono text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
                title={item.originalPath}
              >
                {item.originalPath}
              </button>
              <span className="hidden text-xs text-muted lg:block">
                {formatBytes(item.size ?? 0)}
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => onRestore(item)}
                  disabled={restorePending}
                  data-file-manager-trash-restore
                >
                  <RotateCcw className="size-3.5" />
                  恢复
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => onPurge(item)}
                  disabled={purgePending}
                  data-file-manager-trash-purge
                >
                  永久删除
                </Button>
              </span>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrashPagination({
  page,
  totalPages,
  totalItems,
  pageItems,
  loading,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageItems: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(page));
  React.useEffect(() => setDraft(String(page)), [page]);
  const commit = React.useCallback(() => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(page));
      return;
    }
    onPageChange(Math.min(totalPages, Math.max(1, Math.floor(parsed))));
  }, [draft, onPageChange, page, totalPages]);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-1.5 border-t border-line bg-panel px-2 py-1.5 text-xs text-muted sm:gap-2 sm:px-3 sm:py-2" data-file-manager-trash-pagination>
      <span className="min-w-0 truncate">第 {page}/{totalPages} 页 · 本页 {pageItems} 项 · 共 {totalItems} 项</span>
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={loading || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>上一页</Button>
        <label className="flex items-center gap-1">
          跳至
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
            inputMode="numeric"
            className="h-7 w-14 rounded-md border border-line bg-panel px-2 text-center text-xs text-ink-strong outline-none focus:border-primary"
            aria-label="跳转回收站页码"
          />
          页
        </label>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={loading || page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>下一页</Button>
      </div>
    </footer>
  );
}

function categorizeTrash(items: FilesTrashItem[]) {
  const buckets: Record<TrashCategory, FilesTrashItem[]> = {
    all: items,
    directory: [],
    file: [],
    image: [],
    document: [],
  };
  for (const item of items) {
    if (item.kind === "directory") {
      buckets.directory.push(item);
      continue;
    }
    buckets.file.push(item);
    const ext = extensionOf(item.name);
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) {
      buckets.image.push(item);
    }
    if (
      [
        "txt",
        "md",
        "markdown",
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "json",
        "csv",
      ].includes(ext)
    ) {
      buckets.document.push(item);
    }
  }
  return {
    ...buckets,
    counts: {
      all: buckets.all.length,
      directory: buckets.directory.length,
      file: buckets.file.length,
      image: buckets.image.length,
      document: buckets.document.length,
    },
  };
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
  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    setViewport({ scrollTop: node.scrollTop, height: node.clientHeight });
  }, [items.length]);
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

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 && index < name.length - 1
    ? name.slice(index + 1).toLowerCase()
    : "";
}

function TrashChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
      <span className="text-2xs text-muted">{label}</span>
      <span className="max-w-[90px] truncate text-xs font-semibold text-ink-strong">{value}</span>
    </div>
  );
}

function TrashLoading() {
  return (
    <div
      className="rounded-b-xl border border-line bg-panel py-1"
      aria-busy="true"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

function summarizeTrash(items: FilesTrashItem[]) {
  const roots = new Set<string>();
  let directories = 0;
  let files = 0;
  let size = 0;
  for (const item of items) {
    roots.add(item.rootId);
    if (item.kind === "directory") directories += 1;
    else files += 1;
    size += item.size ?? 0;
  }
  return { rootCount: roots.size, directories, files, size };
}

function conflictPolicyLabel(policy: FilesTransferConflictPolicy): string {
  if (policy === "rename") return "保留两者";
  if (policy === "overwrite") return "覆盖";
  if (policy === "skip") return "跳过";
  return "报错";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
