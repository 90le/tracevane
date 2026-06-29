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

import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
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
  const trash = useFilesTrashQuery(trashScopeRootId);
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
  const visibleItems = React.useMemo(() => {
    if (!deferredQuery) return items;
    return items.filter((item) =>
      [item.name, item.originalPath, item.rootId, item.trashPath]
        .join("\n")
        .toLowerCase()
        .includes(deferredQuery),
    );
  }, [deferredQuery, items]);
  const selectedItems = React.useMemo(
    () => items.filter((item) => selectedPaths.has(item.trashPath)),
    [items, selectedPaths],
  );
  const summary = React.useMemo(() => summarizeTrash(items), [items]);

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
      className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-panel"
      data-file-manager-trash-manager
    >
      <header className="flex min-h-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink-strong">
                全局回收站
              </h2>
              <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-muted">
                {items.length} 项 · {selectedItems.length} 已选
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              所有 root 删除项统一进入
              .openclaw/.tracevane/trash，恢复时自动回到原 root。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void trash.refetch()}
            disabled={trash.isFetching}
          >
            <RotateCcw className="size-4" />
            {trash.isFetching ? "刷新中" : "刷新"}
          </Button>
          <Button
            variant="danger"
            size="sm"
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

      <div
        className="grid gap-3 border-b border-line bg-panel-2/70 px-4 py-3 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(220px,0.9fr)] md:px-5"
        data-file-manager-trash-overview
      >
        <TrashMetric
          icon={<ArchiveRestore className="size-4" />}
          label="全部项目"
          value={`${items.length}`}
          hint={`${summary.rootCount} 个 root`}
        />
        <TrashMetric
          icon={<FolderOpen className="size-4" />}
          label="目录"
          value={`${summary.directories}`}
          hint="可整目录恢复"
        />
        <TrashMetric
          icon={<FileText className="size-4" />}
          label="文件"
          value={`${summary.files}`}
          hint={formatBytes(summary.size)}
        />
        <TrashMetric
          icon={<ShieldAlert className="size-4" />}
          label="恢复策略"
          value={conflictPolicyLabel(conflictPolicy)}
          hint="默认保留两者"
        />
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs shadow-sm">
          <Search className="size-4 shrink-0 text-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选名称、原路径、root"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-strong outline-none placeholder:text-subtle"
            aria-label="筛选回收站"
          />
        </label>
      </div>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] px-4 py-3 md:px-5">
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-b-0 border-line bg-panel-2 px-3 py-2 text-xs text-muted"
          data-file-manager-trash-toolbar
        >
          <label className="flex items-center gap-2">
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
              : "全局回收站 · 不按目录分组"}
          </span>
        </div>

        {trash.isLoading ? (
          <TrashLoading />
        ) : trash.error ? (
          <div className="rounded-b-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {trash.error.message}
          </div>
        ) : !items.length ? (
          <div className="rounded-b-xl border border-dashed border-line bg-panel-2 px-3 py-10 text-center text-sm text-muted">
            回收站为空。默认删除的文件会显示在这里。
          </div>
        ) : !visibleItems.length ? (
          <div className="rounded-b-xl border border-line bg-panel px-3 py-10 text-center text-sm text-muted">
            没有匹配“{query}”的回收站项目。
          </div>
        ) : (
          <div
            className="min-h-0 overflow-y-auto rounded-b-xl border border-line bg-panel"
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
            {visibleItems.map((item) => (
              <article
                key={item.trashPath}
                className="grid gap-2 border-b border-line px-3 py-3 last:border-b-0 hover:bg-panel-2/70 lg:grid-cols-[42px_minmax(180px,1.1fr)_minmax(160px,0.75fr)_minmax(220px,1.4fr)_110px_152px] lg:items-center lg:gap-3"
                data-file-manager-trash-item={item.trashPath}
                data-file-manager-trash-root-id={item.rootId}
                data-file-manager-trash-original-path={item.originalPath}
              >
                <label className="flex items-center gap-2 text-xs text-muted lg:block">
                  <input
                    type="checkbox"
                    checked={selectedPaths.has(item.trashPath)}
                    onChange={() => toggle(item)}
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
                <span className="flex justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => void restoreItem(item)}
                    disabled={restoreMutation.isPending}
                    data-file-manager-trash-restore
                  >
                    <RotateCcw className="size-3.5" />
                    恢复
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => void purgeItems([item])}
                    disabled={purgeMutation.isPending}
                    data-file-manager-trash-purge
                  >
                    永久删除
                  </Button>
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrashMetric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 shadow-sm">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs text-subtle">{label}</div>
        <div className="truncate text-sm font-semibold text-ink-strong">
          {value}
        </div>
        <div className="truncate text-[11px] text-muted">{hint}</div>
      </div>
    </div>
  );
}

function TrashLoading() {
  return (
    <div className="rounded-b-xl border border-line bg-panel px-3 py-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="mb-2 h-12 rounded-lg bg-panel-2 last:mb-0"
          style={{ opacity: 1 - index * 0.08 }}
        />
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
