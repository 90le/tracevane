import * as React from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import {
  useFilesTrashQuery,
  usePurgeFilesTrashMutation,
  useRestoreFilesTrashMutation,
  FILES_GLOBAL_SCOPE_ID,
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
  const items = trash.data?.items ?? [];
  const selectedItems = React.useMemo(
    () => items.filter((item) => selectedPaths.has(item.trashPath)),
    [items, selectedPaths],
  );

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
        if (result.affectedPaths[1])
          onRevealPath?.(result.affectedPaths[1], item.rootId);
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
      className="grid gap-3 rounded-lg border border-line bg-panel p-4 shadow-sm"
      data-file-manager-trash-manager
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-strong">回收站</h2>
          <p className="mt-1 text-xs text-muted">
            全局回收站 · 所有入口删除项统一进入{" "}
            <code className="rounded bg-panel-2 px-1">
              .openclaw/.tracevane/trash
            </code>
            ；可恢复到原 root，或永久清理。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-1">
            <span className="text-subtle">恢复冲突</span>
            <select
              value={conflictPolicy}
              aria-label="恢复冲突策略"
              data-file-manager-trash-conflict-policy
              onChange={(event) =>
                setConflictPolicy(
                  event.target.value as FilesTransferConflictPolicy,
                )
              }
              className="bg-transparent text-ink-strong outline-none"
            >
              <option value="rename">保留两者</option>
              <option value="fail">遇到同名时报错</option>
              <option value="overwrite">覆盖原路径</option>
              <option value="skip">跳过恢复</option>
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void trash.refetch()}
            disabled={trash.isFetching}
          >
            刷新
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

      {trash.isLoading ? (
        <div className="rounded border border-line bg-panel-2 px-3 py-6 text-center text-sm text-muted">
          正在读取回收站…
        </div>
      ) : trash.error ? (
        <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {trash.error.message}
        </div>
      ) : !items.length ? (
        <div className="rounded border border-dashed border-line bg-panel-2 px-3 py-8 text-center text-sm text-muted">
          回收站为空。默认删除的文件会显示在这里。
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-md border border-line"
          data-file-manager-trash-list
        >
          <div className="grid grid-cols-[44px_minmax(160px,1fr)_110px_minmax(180px,1fr)_120px_170px_180px] border-b border-line bg-panel-2 px-3 py-2 text-xs font-medium text-subtle">
            <span />
            <span>名称</span>
            <span>来源 root</span>
            <span>原路径</span>
            <span>大小</span>
            <span>删除时间</span>
            <span className="text-right">操作</span>
          </div>
          {items.map((item) => (
            <div
              key={item.trashPath}
              className="grid grid-cols-[44px_minmax(160px,1fr)_110px_minmax(180px,1fr)_120px_170px_180px] items-center border-b border-line px-3 py-2 text-sm last:border-b-0 hover:bg-panel-2"
              data-file-manager-trash-item={item.trashPath}
              data-file-manager-trash-root-id={item.rootId}
              data-file-manager-trash-original-path={item.originalPath}
            >
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedPaths.has(item.trashPath)}
                  onChange={() => toggle(item)}
                  className="size-4 accent-primary"
                  aria-label={`选择 ${item.name}`}
                />
              </label>
              <span
                className="min-w-0 truncate font-medium text-ink-strong"
                title={item.trashPath}
              >
                {item.name}
              </span>
              <span
                className="min-w-0 truncate font-mono text-xs text-subtle"
                title={item.rootId}
              >
                {item.rootId}
              </span>
              <span
                className="min-w-0 truncate font-mono text-xs text-muted"
                title={item.originalPath}
              >
                {item.originalPath}
              </span>
              <span className="text-xs text-muted">
                {formatBytes(item.size ?? 0)}
              </span>
              <span className="text-xs text-muted">
                {new Date(item.deletedAt).toLocaleString()}
              </span>
              <span className="flex justify-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
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
                  className="h-7 px-2 text-xs"
                  onClick={() => void purgeItems([item])}
                  disabled={purgeMutation.isPending}
                  data-file-manager-trash-purge
                >
                  永久删除
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
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
