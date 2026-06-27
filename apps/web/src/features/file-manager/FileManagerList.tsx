import * as React from "react";
import {
  ArchiveRestore,
  Download,
  File,
  Folder,
  FolderInput,
  Grid2X2,
  List,
  MoreHorizontal,
  Package,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";
import type { useFilesBrowseQuery } from "@/lib/query/files";
import type { FileEntrySummary } from "@/features/workspace/files";

export type FileManagerSortKey =
  | "name"
  | "size"
  | "modified"
  | "type"
  | "permissions"
  | "owner";
export type FileManagerSortDirection = "asc" | "desc";
export type FileManagerListDensity = "comfortable" | "compact";
export type FileManagerListColumn =
  | "size"
  | "modified"
  | "type"
  | "permissions"
  | "owner";
export type FileManagerDisplayMode = "list" | "grid";
export type FileManagerResizableColumn = "name" | FileManagerListColumn;
export type FileManagerColumnWidths = Partial<
  Record<FileManagerResizableColumn, number>
>;

export interface FileManagerSortState {
  key: FileManagerSortKey;
  direction: FileManagerSortDirection;
}

const FILE_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const FILE_MANAGER_DEFAULT_COLUMNS: FileManagerListColumn[] = [
  "size",
  "modified",
  "type",
];
export const FILE_MANAGER_DEFAULT_COLUMN_WIDTHS: Record<
  FileManagerResizableColumn,
  number
> = {
  name: 360,
  size: 120,
  modified: 180,
  type: 96,
  permissions: 142,
  owner: 112,
};

const FILE_MANAGER_COLUMN_LIMITS: Record<
  FileManagerResizableColumn,
  { min: number; max: number }
> = {
  name: { min: 180, max: 720 },
  size: { min: 88, max: 220 },
  modified: { min: 132, max: 300 },
  type: { min: 76, max: 180 },
  permissions: { min: 116, max: 220 },
  owner: { min: 92, max: 180 },
};

const FILE_MANAGER_OPTIONAL_COLUMNS: Array<{
  id: FileManagerListColumn;
  label: string;
}> = [
  { id: "size", label: "大小" },
  { id: "modified", label: "修改时间" },
  { id: "type", label: "类型" },
  { id: "permissions", label: "权限" },
  { id: "owner", label: "Owner" },
];

const FILE_MANAGER_ENTRY_DRAG_MIME =
  "application/x-tracevane-file-manager-paths";
const FILE_MANAGER_VIRTUALIZATION_THRESHOLD = 180;
const FILE_MANAGER_VIRTUALIZATION_OVERSCAN = 10;
const FILE_MANAGER_ROW_HEIGHT: Record<FileManagerListDensity, number> = {
  comfortable: 56,
  compact: 44,
};

const LazyFileTypeIcon = React.lazy(() => import("./FileTypeIcon"));

function FileTypeIcon({
  entry,
  size,
}: {
  entry: FileEntrySummary;
  size: "sm" | "lg";
}) {
  return (
    <React.Suspense
      fallback={
        <span
          className={cn(size === "lg" ? "size-8" : "size-4 shrink-0")}
          aria-hidden="true"
          data-file-manager-file-type-icon="loading"
        />
      }
    >
      <LazyFileTypeIcon entry={entry} size={size} />
    </React.Suspense>
  );
}


export interface BulkActionBarProps {
  selectedEntries: FileEntrySummary[];
  onRename: () => void;
  canRename: boolean;
  onArchive: () => void;
  onChmod: () => void;
  onUnarchive: () => void;
  canUnarchive: boolean;
  onCopy: () => void;
  onMove: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  selectedEntries,
  onRename,
  canRename,
  onArchive,
  onChmod,
  onUnarchive,
  canUnarchive,
  onCopy,
  onMove,
  onDownload,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  if (selectedEntries.length === 0) return null;
  const fileCount = selectedEntries.filter(
    (entry) => entry.kind === "file",
  ).length;
  const directoryCount = selectedEntries.filter(
    (entry) => entry.kind === "directory",
  ).length;
  const selectedBytes = selectedEntries.reduce(
    (total, entry) => total + (entry.kind === "file" ? (entry.size ?? 0) : 0),
    0,
  );
  const selectionSummary = summarizeBulkSelection(selectedEntries, fileCount, directoryCount, selectedBytes);
  return (
    <>
      <div
        className="hidden gap-2 rounded-md border border-primary-line bg-primary-soft px-3 py-2 text-xs shadow-sm sm:grid"
        data-file-manager-bulk-desktop
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-primary">
            已选 {selectedEntries.length} 项
          </span>
          <span className="rounded-full bg-panel px-2 py-0.5 text-muted">
            {fileCount} 文件
          </span>
          <span className="rounded-full bg-panel px-2 py-0.5 text-muted">
            {directoryCount} 目录
          </span>
          <span className="rounded-full bg-panel px-2 py-0.5 text-muted">
            {formatBytes(selectedBytes)}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-muted"
            title={selectionSummary}
            data-file-manager-bulk-selection-summary
          >
            {selectionSummary}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            取消选择
          </Button>
        </div>
        <div
          className="flex min-w-0 flex-nowrap items-center gap-2 border-t border-primary-line/40 pt-2"
          data-file-manager-bulk-command-bar
        >
          <span className="mr-1 shrink-0 font-medium text-muted">
            批量操作
          </span>
          {canRename ? (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={onRename}
              data-file-manager-bulk-primary-action="rename"
            >
              <File className="size-4" />
              重命名
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onCopy}
            data-file-manager-bulk-primary-action="copy"
          >
            <File className="size-4" />
            复制
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onMove}
            data-file-manager-bulk-primary-action="move"
          >
            <FolderInput className="size-4" />
            移动
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onDownload}
            data-file-manager-bulk-primary-action="download"
          >
            <Download className="size-4" />
            下载
          </Button>
          <BulkOverflowMenu
            canRename={canRename}
            canUnarchive={canUnarchive}
            onRename={onRename}
            onArchive={onArchive}
            onChmod={onChmod}
            onUnarchive={onUnarchive}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2 rounded border border-red/20 bg-red-soft px-2 py-1 text-red">
            <span className="hidden md:inline">危险操作</span>
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              data-file-manager-bulk-danger-action="delete"
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        </div>
      </div>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-primary-line bg-panel/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.16)] backdrop-blur sm:hidden"
        data-file-manager-bulk-mobile-sheet
        role="region"
        aria-label="已选文件操作"
      >
        <div className="mx-auto grid max-w-md gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-primary">
              已选 {selectedEntries.length} 项
            </span>
            <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
              {fileCount} 文件
            </span>
            <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
              {directoryCount} 目录
            </span>
            <span
              className="min-w-0 flex-1 truncate text-subtle"
              title={selectionSummary}
              data-file-manager-bulk-selection-summary
            >
              {formatBytes(selectedBytes)}
            </span>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full text-subtle hover:bg-panel-2 hover:text-ink-strong"
              onClick={onClear}
              aria-label="取消选择"
            >
              <X className="size-4" />
            </button>
          </div>
          <div
            className="grid grid-cols-4 gap-2 text-xs"
            data-file-manager-mobile-bulk-actions
          >
            <MobileBulkAction
              icon={<File className="size-4" />}
              label="复制"
              onClick={onCopy}
            />
            <MobileBulkAction
              icon={<FolderInput className="size-4" />}
              label="移动"
              onClick={onMove}
            />
            <MobileBulkAction
              icon={<Download className="size-4" />}
              label="下载"
              onClick={onDownload}
            />
            <details
              className="group col-span-1"
              data-file-manager-mobile-bulk-more
            >
              <summary
                className="grid min-h-14 cursor-pointer list-none place-items-center gap-1 rounded-md border border-line bg-panel-2 px-1 py-2 text-center text-2xs text-muted shadow-sm marker:hidden hover:border-primary-line hover:bg-primary-soft hover:text-primary focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
                aria-label="更多批量操作"
              >
                <MoreHorizontal className="size-4" />
                <span>更多</span>
              </summary>
              <div className="absolute inset-x-3 bottom-[calc(100%+0.5rem)] z-10 grid grid-cols-2 gap-2 rounded-lg border border-line bg-panel p-2 shadow-xl">
                {canRename ? (
                  <MobileBulkAction
                    icon={<File className="size-4" />}
                    label="重命名"
                    onClick={onRename}
                  />
                ) : null}
                <MobileBulkAction
                  icon={<Package className="size-4" />}
                  label="打包"
                  onClick={onArchive}
                />
                {canUnarchive ? (
                  <MobileBulkAction
                    icon={<ArchiveRestore className="size-4" />}
                    label="解压"
                    onClick={onUnarchive}
                  />
                ) : null}
                <MobileBulkAction
                  icon={<File className="size-4" />}
                  label="权限"
                  onClick={onChmod}
                />
                <MobileBulkAction
                  icon={<Trash2 className="size-4" />}
                  label="删除"
                  onClick={onDelete}
                  danger
                />
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}

function BulkOverflowMenu({
  canRename,
  canUnarchive,
  onRename,
  onArchive,
  onChmod,
  onUnarchive,
}: {
  canRename: boolean;
  canUnarchive: boolean;
  onRename: () => void;
  onArchive: () => void;
  onChmod: () => void;
  onUnarchive: () => void;
}) {
  return (
    <details className="relative shrink-0" data-file-manager-bulk-overflow>
      <summary
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-line bg-panel px-2 text-xs text-muted shadow-sm marker:hidden hover:border-primary-line hover:bg-primary-soft hover:text-primary focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
        aria-label="更多批量操作"
      >
        <MoreHorizontal className="size-4" />
        更多
      </summary>
      <div
        className="absolute right-0 top-[calc(100%+6px)] z-30 grid min-w-40 gap-1 rounded-lg border border-line bg-panel p-1.5 text-xs shadow-xl"
        data-file-manager-bulk-overflow-menu
      >
        {canRename ? (
          <BulkOverflowAction icon={<File className="size-4" />} label="重命名" onClick={onRename} />
        ) : null}
        <BulkOverflowAction icon={<Package className="size-4" />} label="打包" onClick={onArchive} />
        {canUnarchive ? (
          <BulkOverflowAction icon={<ArchiveRestore className="size-4" />} label="解压" onClick={onUnarchive} />
        ) : null}
        <BulkOverflowAction icon={<File className="size-4" />} label="权限" onClick={onChmod} />
      </div>
    </details>
  );
}

function BulkOverflowAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-2 rounded px-2 py-1 text-left text-muted hover:bg-primary-soft hover:text-primary focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
      onClick={onClick}
      data-file-manager-bulk-overflow-action={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MobileBulkAction({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid min-h-14 place-items-center gap-1 rounded-md border border-line bg-panel-2 px-1 py-2 text-center text-2xs shadow-sm focus-visible:shadow-[var(--ring)] focus-visible:outline-none",
        danger
          ? "border-red/25 bg-red-soft text-red"
          : "text-muted hover:border-primary-line hover:bg-primary-soft hover:text-primary",
      )}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export interface FileListPanelProps {
  rootId: string;
  browse: ReturnType<typeof useFilesBrowseQuery>;
  entries: FileEntrySummary[];
  filteredEntries: FileEntrySummary[];
  selectedPath: string | undefined;
  selectedPaths: Set<string>;
  allVisibleSelected: boolean;
  sort: FileManagerSortState;
  density: FileManagerListDensity;
  columns: FileManagerListColumn[];
  displayMode: FileManagerDisplayMode;
  columnWidths: FileManagerColumnWidths;
  canLoadMore: boolean;
  isFetching: boolean;
  pagination: { totalEntries: number } | undefined;
  onRefetch: () => void;
  onLoadMore: () => void;
  onOpen: (entry: FileEntrySummary) => void;
  onSelect: (
    entry: FileEntrySummary,
    options?: { range?: boolean; additive?: boolean },
  ) => void;
  onMarqueeSelect: (
    paths: string[],
    options?: { additive?: boolean },
  ) => void;
  onTogglePath: (path: string) => void;
  onClearSelection: () => void;
  onFocusRelative: (delta: number) => void;
  onToggleAllVisible: () => void;
  onSelectAllVisible: () => void;
  onSortChange: (sort: FileManagerSortState) => void;
  onDensityChange: (density: FileManagerListDensity) => void;
  onColumnsChange: (columns: FileManagerListColumn[]) => void;
  onDisplayModeChange: (mode: FileManagerDisplayMode) => void;
  onColumnWidthsChange: (widths: FileManagerColumnWidths) => void;
  onContextMenu: (event: React.MouseEvent, entry: FileEntrySummary) => void;
  onOpenContextMenu: (x: number, y: number, entry: FileEntrySummary) => void;
  onDropTransfer: (
    targetDirectory: FileEntrySummary,
    sourcePaths: string[],
    operation: "copy" | "move",
  ) => void;
  onDropUploadToDirectory: (
    targetDirectory: FileEntrySummary,
    event: React.DragEvent,
  ) => void;
}

export function FileListPanel({
  rootId,
  browse,
  entries,
  filteredEntries,
  selectedPath,
  selectedPaths,
  allVisibleSelected,
  sort,
  density,
  columns,
  displayMode,
  columnWidths,
  canLoadMore,
  isFetching,
  pagination,
  onRefetch,
  onLoadMore,
  onOpen,
  onSelect,
  onMarqueeSelect,
  onTogglePath,
  onClearSelection,
  onFocusRelative,
  onToggleAllVisible,
  onSelectAllVisible,
  onSortChange,
  onDensityChange,
  onColumnsChange,
  onDisplayModeChange,
  onColumnWidthsChange,
  onContextMenu,
  onOpenContextMenu,
  onDropTransfer,
  onDropUploadToDirectory,
}: FileListPanelProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const scrollportRef = React.useRef<HTMLDivElement | null>(null);
  const marqueeRef = React.useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    active: boolean;
  } | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const [columnMenuOpen, setColumnMenuOpen] = React.useState(false);
  const [marquee, setMarquee] = React.useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);
  const [draggingColumn, setDraggingColumn] =
    React.useState<FileManagerListColumn | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{
    path: string;
    operation: "copy" | "move" | "upload";
  } | null>(null);
  const [scrollMetrics, setScrollMetrics] = React.useState({
    scrollTop: 0,
    viewportHeight: 420,
  });
  const selectedStatus = React.useMemo(
    () => summarizeFileManagerSelection(entries, selectedPaths),
    [entries, selectedPaths],
  );
  const resolvedColumnWidths = React.useMemo(
    () => resolveColumnWidths(columnWidths),
    [columnWidths],
  );
  const gridTemplateColumns = React.useMemo(
    () =>
      [
        "36px",
        `minmax(${FILE_MANAGER_COLUMN_LIMITS.name.min}px, ${resolvedColumnWidths.name}px)`,
        ...columns.map((column) => `${resolvedColumnWidths[column]}px`),
        "56px",
      ]
        .filter(Boolean)
        .join(" "),
    [columns, resolvedColumnWidths],
  );
  const responsiveGridStyle = React.useMemo(
    () =>
      ({
        "--file-row-desktop-columns": gridTemplateColumns,
      }) as React.CSSProperties,
    [gridTemplateColumns],
  );
  const virtualRowHeight = FILE_MANAGER_ROW_HEIGHT[density];
  const virtualListEnabled =
    displayMode === "list" &&
    filteredEntries.length > FILE_MANAGER_VIRTUALIZATION_THRESHOLD;
  const updateScrollMetrics = React.useCallback(() => {
    const node = scrollportRef.current;
    if (!node) return;
    const next = {
      scrollTop: node.scrollTop,
      viewportHeight: node.clientHeight || 420,
    };
    setScrollMetrics((current) =>
      Math.abs(current.scrollTop - next.scrollTop) < 1 &&
      Math.abs(current.viewportHeight - next.viewportHeight) < 1
        ? current
        : next,
    );
  }, []);
  React.useLayoutEffect(() => {
    updateScrollMetrics();
    const node = scrollportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateScrollMetrics());
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    displayMode,
    filteredEntries.length,
    updateScrollMetrics,
    virtualListEnabled,
  ]);
  const virtualWindow = React.useMemo(() => {
    if (!virtualListEnabled) {
      return {
        enabled: false,
        start: 0,
        end: filteredEntries.length,
        paddingTop: 0,
        paddingBottom: 0,
        renderedEntries: filteredEntries,
      };
    }
    const start = Math.max(
      0,
      Math.floor(scrollMetrics.scrollTop / virtualRowHeight) -
        FILE_MANAGER_VIRTUALIZATION_OVERSCAN,
    );
    const visibleCount =
      Math.ceil(scrollMetrics.viewportHeight / virtualRowHeight) +
      FILE_MANAGER_VIRTUALIZATION_OVERSCAN * 2;
    const end = Math.min(filteredEntries.length, start + visibleCount);
    return {
      enabled: true,
      start,
      end,
      paddingTop: start * virtualRowHeight,
      paddingBottom: (filteredEntries.length - end) * virtualRowHeight,
      renderedEntries: filteredEntries.slice(start, end),
    };
  }, [
    filteredEntries,
    scrollMetrics.scrollTop,
    scrollMetrics.viewportHeight,
    virtualListEnabled,
    virtualRowHeight,
  ]);
  const scrollIndexIntoVirtualWindow = React.useCallback(
    (index: number) => {
      if (!virtualListEnabled) return;
      const node = scrollportRef.current;
      if (!node) return;
      const rowTop = index * virtualRowHeight;
      const rowBottom = rowTop + virtualRowHeight;
      if (rowTop < node.scrollTop) {
        node.scrollTop = rowTop;
      } else if (rowBottom > node.scrollTop + node.clientHeight) {
        node.scrollTop = rowBottom - node.clientHeight;
      }
      updateScrollMetrics();
    },
    [updateScrollMetrics, virtualListEnabled, virtualRowHeight],
  );

  React.useEffect(() => {
    if (!selectedPath || !virtualListEnabled) return;
    const index = filteredEntries.findIndex((entry) => entry.path === selectedPath);
    if (index >= 0) scrollIndexIntoVirtualWindow(index);
  }, [
    filteredEntries,
    scrollIndexIntoVirtualWindow,
    selectedPath,
    virtualListEnabled,
  ]);

  const requestSort = React.useCallback(
    (key: FileManagerSortKey) => {
      onSortChange({
        key,
        direction:
          sort.key === key && sort.direction === "asc" ? "desc" : "asc",
      });
    },
    [onSortChange, sort.direction, sort.key],
  );

  const toggleColumn = React.useCallback(
    (column: FileManagerListColumn) => {
      const next = columns.includes(column)
        ? columns.filter((item) => item !== column)
        : [...columns, column];
      onColumnsChange(next);
    },
    [columns, onColumnsChange],
  );

  const reorderColumn = React.useCallback(
    (source: FileManagerListColumn, target: FileManagerListColumn) => {
      if (
        source === target ||
        !columns.includes(source) ||
        !columns.includes(target)
      )
        return;
      const withoutSource = columns.filter((column) => column !== source);
      const targetIndex = withoutSource.indexOf(target);
      const next = [...withoutSource];
      next.splice(targetIndex, 0, source);
      onColumnsChange(next);
    },
    [columns, onColumnsChange],
  );

  const moveColumn = React.useCallback(
    (column: FileManagerListColumn, delta: -1 | 1) => {
      const index = columns.indexOf(column);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= columns.length) return;
      const next = [...columns];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      onColumnsChange(next);
    },
    [columns, onColumnsChange],
  );

  const resizeColumn = React.useCallback(
    (column: FileManagerResizableColumn, width: number) => {
      const limits = FILE_MANAGER_COLUMN_LIMITS[column];
      const nextWidth = Math.round(
        Math.min(limits.max, Math.max(limits.min, width)),
      );
      onColumnWidthsChange({
        ...resolvedColumnWidths,
        [column]: nextWidth,
      });
    },
    [onColumnWidthsChange, resolvedColumnWidths],
  );

  const resetColumns = React.useCallback(() => {
    onColumnsChange(FILE_MANAGER_DEFAULT_COLUMNS);
    onColumnWidthsChange(FILE_MANAGER_DEFAULT_COLUMN_WIDTHS);
  }, [onColumnWidthsChange, onColumnsChange]);

  const startEntryDrag = React.useCallback(
    (event: React.DragEvent, entry: FileEntrySummary) => {
      const paths = selectedPaths.has(entry.path)
        ? Array.from(selectedPaths)
        : [entry.path];
      event.dataTransfer.setData(
        FILE_MANAGER_ENTRY_DRAG_MIME,
        JSON.stringify({ rootId, paths }),
      );
      event.dataTransfer.setData("text/plain", paths[0] ?? entry.path);
      event.dataTransfer.effectAllowed = "copyMove";
    },
    [rootId, selectedPaths],
  );

  const dropOnDirectory = React.useCallback(
    (event: React.DragEvent, targetDirectory: FileEntrySummary) => {
      if (targetDirectory.kind !== "directory") return;
      const raw = event.dataTransfer.getData(FILE_MANAGER_ENTRY_DRAG_MIME);
      if (raw) {
        event.preventDefault();
        event.stopPropagation();
        const parsed = parseFileManagerDragPayload(raw);
        if (!parsed.length) return;
        setDropTarget(null);
        onDropTransfer(
          targetDirectory,
          parsed,
          event.ctrlKey || event.altKey ? "copy" : "move",
        );
        return;
      }
      if (isExternalFileDrag(event.dataTransfer)) {
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(null);
        onDropUploadToDirectory(targetDirectory, event);
      }
    },
    [onDropTransfer, onDropUploadToDirectory],
  );

  const highlightDropTarget = React.useCallback(
    (event: React.DragEvent, targetDirectory: FileEntrySummary) => {
      if (targetDirectory.kind !== "directory") return;
      if (event.dataTransfer.types.includes(FILE_MANAGER_ENTRY_DRAG_MIME)) {
        setDropTarget({
          path: targetDirectory.path,
          operation: event.ctrlKey || event.altKey ? "copy" : "move",
        });
        return;
      }
      if (isExternalFileDrag(event.dataTransfer)) {
        setDropTarget({ path: targetDirectory.path, operation: "upload" });
      }
    },
    [],
  );

  const clearDropTarget = React.useCallback(
    (targetDirectory: FileEntrySummary) => {
      setDropTarget((state) =>
        state?.path === targetDirectory.path ? null : state,
      );
    },
    [],
  );
  const commitMarqueeSelection = React.useCallback(
    (state: NonNullable<typeof marqueeRef.current>) => {
      const selectionRect = normalizeRect(
        state.startX,
        state.startY,
        state.currentX,
        state.currentY,
      );
      const nodes =
        scrollportRef.current?.querySelectorAll<HTMLElement>(
          "[data-file-manager-entry-path]",
        ) ?? [];
      const nextPaths: string[] = [];
      nodes.forEach((node) => {
        const path = node.getAttribute("data-file-manager-entry-path");
        if (!path) return;
        if (rectsIntersect(selectionRect, node.getBoundingClientRect())) {
          nextPaths.push(path);
        }
      });
      if (nextPaths.length) {
        onMarqueeSelect(nextPaths, { additive: state.additive });
      } else if (!state.additive) {
        onClearSelection();
      }
    },
    [onClearSelection, onMarqueeSelect],
  );

  const beginMarqueeSelection = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isFileListInteractiveTarget(event.target)) return;
      if (event.detail > 1) return;
      panelRef.current?.focus();
      event.preventDefault();
      const state = {
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        additive: event.metaKey || event.ctrlKey,
        active: false,
      };
      marqueeRef.current = state;

      function onMouseMove(moveEvent: MouseEvent) {
        const current = marqueeRef.current;
        if (!current) return;
        current.currentX = moveEvent.clientX;
        current.currentY = moveEvent.clientY;
        const distance = Math.hypot(
          current.currentX - current.startX,
          current.currentY - current.startY,
        );
        if (distance < 6 && !current.active) return;
        current.active = true;
        suppressNextClickRef.current = true;
        moveEvent.preventDefault();
        setMarquee({
          startX: current.startX,
          startY: current.startY,
          currentX: current.currentX,
          currentY: current.currentY,
          active: true,
        });
      }

      function onMouseUp(upEvent: MouseEvent) {
        const current = marqueeRef.current;
        marqueeRef.current = null;
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        setMarquee(null);
        if (!current?.active) return;
        current.currentX = upEvent.clientX;
        current.currentY = upEvent.clientY;
        upEvent.preventDefault();
        commitMarqueeSelection(current);
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }

      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [commitMarqueeSelection],
  );

  React.useEffect(
    () => () => {
      document.body.style.userSelect = "";
    },
    [],
  );
  const selectedEntry = React.useMemo(
    () => filteredEntries.find((entry) => entry.path === selectedPath),
    [filteredEntries, selectedPath],
  );
  const focusEntryAtIndex = React.useCallback(
    (index: number, range = false) => {
      if (!filteredEntries.length) return;
      const nextIndex = Math.max(0, Math.min(filteredEntries.length - 1, index));
      const entry = filteredEntries[nextIndex];
      scrollIndexIntoVirtualWindow(nextIndex);
      if (range) {
        onSelect(entry, { range: true });
      } else {
        onSelect(entry);
      }
    },
    [filteredEntries, onSelect, scrollIndexIntoVirtualWindow],
  );
  const openSelectedKeyboardMenu = React.useCallback(() => {
    if (!selectedEntry) return;
    const rect = panelRef.current?.getBoundingClientRect();
    onOpenContextMenu(
      rect ? Math.min(rect.right - 24, rect.left + 420) : 0,
      rect ? rect.top + 96 : 0,
      selectedEntry,
    );
  }, [onOpenContextMenu, selectedEntry]);
  const handlePanelKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isFileListInteractiveTarget(event.target)) return;
      const currentIndex = selectedPath
        ? filteredEntries.findIndex((item) => item.path === selectedPath)
        : -1;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusEntryAtIndex(currentIndex < 0 ? 0 : currentIndex + 1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusEntryAtIndex(currentIndex < 0 ? 0 : currentIndex - 1, event.shiftKey);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        focusEntryAtIndex(0, event.shiftKey);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        focusEntryAtIndex(filteredEntries.length - 1, event.shiftKey);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        focusEntryAtIndex(currentIndex < 0 ? 0 : currentIndex + 10, event.shiftKey);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        focusEntryAtIndex(currentIndex < 0 ? 0 : currentIndex - 10, event.shiftKey);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (selectedEntry) onOpen(selectedEntry);
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (selectedEntry) {
          if (event.shiftKey) {
            onSelect(selectedEntry, { range: true });
          } else {
            onTogglePath(selectedEntry.path);
          }
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (allVisibleSelected) onClearSelection();
        else onSelectAllVisible();
        return;
      }
      if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ) {
        event.preventDefault();
        openSelectedKeyboardMenu();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClearSelection();
      }
    },
    [
      filteredEntries,
      focusEntryAtIndex,
      onClearSelection,
      onOpen,
      onSelect,
      onSelectAllVisible,
      onTogglePath,
      openSelectedKeyboardMenu,
      selectedEntry,
      selectedPath,
      allVisibleSelected,
    ],
  );

  return (
    <div
      ref={panelRef}
      className="relative overflow-hidden rounded-md border border-line bg-panel"
      tabIndex={0}
      data-file-manager-list
      data-file-manager-keyboard-scope="list-grid"
      data-file-manager-selection-count={selectedPaths.size}
      data-file-manager-rendered-count={
        displayMode === "list"
          ? virtualWindow.renderedEntries.length
          : filteredEntries.length
      }
      data-file-manager-total-count={filteredEntries.length}
      data-file-manager-virtual-window={
        virtualWindow.enabled ? "true" : "false"
      }
      aria-label="文件列表；方向键移动，Shift+方向键范围选择，空格勾选，Ctrl+A 全选，Enter 打开，Shift+F10 打开菜单"
      onKeyDownCapture={handlePanelKeyDown}
      onClickCapture={(event) => {
        if (!suppressNextClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressNextClickRef.current = false;
      }}
    >
      {displayMode === "list" ? (
        <div
          className="group/list-header grid grid-cols-[36px_minmax(0,1fr)_44px] border-b border-line bg-panel-2 px-3 py-2 text-xs font-medium text-subtle sm:[grid-template-columns:var(--file-row-desktop-columns)]"
          style={responsiveGridStyle}
          data-file-manager-responsive-header
        >
          <label
            className={cn(
              "flex items-center opacity-0 transition-opacity group-hover/list-header:opacity-100 group-focus-within/list-header:opacity-100",
              (selectedPaths.size > 0 || allVisibleSelected) && "opacity-100",
            )}
            data-file-manager-header-checkbox-affordance
          >
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={onToggleAllVisible}
              className="size-4 accent-primary"
              aria-label="选择当前可见文件"
            />
          </label>
          <span className="min-w-0 sm:hidden">
            <SortHeader
              active={sort.key === "name"}
              direction={sort.direction}
              onClick={() => requestSort("name")}
            >
              名称
            </SortHeader>
          </span>
          <span className="hidden min-w-0 sm:block">
            <ResizableSortHeader
              column="name"
              width={resolvedColumnWidths.name}
              active={sort.key === "name"}
              direction={sort.direction}
              onResize={resizeColumn}
              onClick={() => requestSort("name")}
            >
              名称
            </ResizableSortHeader>
          </span>
          {columns.map((column) => (
            <span
              key={column}
              className="hidden min-w-0 sm:block"
              data-file-manager-header-column={column}
            >
              <ResizableSortHeader
                column={column}
                width={resolvedColumnWidths[column]}
                active={sort.key === column}
                direction={sort.direction}
                onResize={resizeColumn}
                onClick={() => requestSort(column)}
              >
                {sortLabel(column)}
              </ResizableSortHeader>
            </span>
          ))}
          <span className="text-right">操作</span>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-line bg-panel-2 px-3 py-2 text-xs text-subtle">
          <label
            className={cn(
              "inline-flex items-center gap-2 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100",
              (selectedPaths.size > 0 || allVisibleSelected) && "opacity-100",
            )}
            data-file-manager-header-checkbox-affordance
          >
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={onToggleAllVisible}
              className="size-4 accent-primary"
              aria-label="选择当前可见文件"
            />
            全选可见
          </label>
          <div className="inline-flex items-center gap-1">
            <span>排序</span>
            {(["name", "modified", "size", "type"] as FileManagerSortKey[]).map(
              (key) => (
                <SortHeader
                  key={key}
                  active={sort.key === key}
                  direction={sort.direction}
                  onClick={() => requestSort(key)}
                >
                  {sortLabel(key)}
                </SortHeader>
              ),
            )}
          </div>
        </div>
      )}
      <div
        ref={scrollportRef}
        className="max-h-[calc(100vh-470px)] min-h-[360px] overflow-y-auto overflow-x-hidden sm:max-h-[calc(100vh-470px)]"
        data-file-manager-list-scrollport
        data-file-manager-marquee-selection-surface
        data-file-manager-windowing="fixed-row-overscan"
        onScroll={updateScrollMetrics}
        onMouseDownCapture={beginMarqueeSelection}
      >
        {browse.isLoading && entries.length === 0 ? (
          <div className="py-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : browse.error ? (
          <ErrorState
            className="px-4 py-10"
            title="无法读取目录"
            description={browse.error.message}
            action={
              <Button variant="outline" size="sm" onClick={onRefetch}>
                重试
              </Button>
            }
          />
        ) : filteredEntries.length === 0 ? (
          <EmptyState
            className="px-4 py-10"
            title={entries.length === 0 ? "空目录" : "没有匹配项"}
            description={
              entries.length === 0
                ? "该目录没有可显示的文件或文件夹。"
                : "调整搜索关键词，或刷新当前目录。"
            }
            icon={<Folder />}
          />
        ) : displayMode === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-3">
            {filteredEntries.map((entry) => (
              <FileGridCard
                key={entry.path}
                entry={entry}
                selected={selectedPath === entry.path}
                checked={selectedPaths.has(entry.path)}
                onOpen={() => onOpen(entry)}
                onSelect={(event) =>
                  onSelect(entry, {
                    range: event.shiftKey,
                    additive: event.metaKey || event.ctrlKey,
                  })
                }
                onToggleChecked={() => onTogglePath(entry.path)}
                onContextMenu={(event) => onContextMenu(event, entry)}
                onOpenContextMenu={(x, y) => onOpenContextMenu(x, y, entry)}
                onDragStart={(event) => startEntryDrag(event, entry)}
                dropOperation={
                  dropTarget?.path === entry.path ? dropTarget.operation : null
                }
                onDragOverDirectory={(event) =>
                  highlightDropTarget(event, entry)
                }
                onDragLeaveDirectory={() => clearDropTarget(entry)}
                onDropOnDirectory={(event) => dropOnDirectory(event, entry)}
              />
            ))}
          </div>
        ) : (
          <>
            {virtualWindow.enabled ? (
              <div
                aria-hidden="true"
                style={{ height: virtualWindow.paddingTop }}
                data-file-manager-virtual-spacer="top"
              />
            ) : null}
            {virtualWindow.renderedEntries.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                selected={selectedPath === entry.path}
                checked={selectedPaths.has(entry.path)}
                density={density}
                gridTemplateColumns={gridTemplateColumns}
                orderedColumns={columns}
                onOpen={() => onOpen(entry)}
                onSelect={(event) =>
                  onSelect(entry, {
                    range: event.shiftKey,
                    additive: event.metaKey || event.ctrlKey,
                  })
                }
                onToggleChecked={() => onTogglePath(entry.path)}
                onContextMenu={(event) => onContextMenu(event, entry)}
                onOpenContextMenu={(x, y) => onOpenContextMenu(x, y, entry)}
                onDragStart={(event) => startEntryDrag(event, entry)}
                dropOperation={
                  dropTarget?.path === entry.path ? dropTarget.operation : null
                }
                onDragOverDirectory={(event) => highlightDropTarget(event, entry)}
                onDragLeaveDirectory={() => clearDropTarget(entry)}
                onDropOnDirectory={(event) => dropOnDirectory(event, entry)}
              />
            ))}
            {virtualWindow.enabled ? (
              <div
                aria-hidden="true"
                style={{ height: virtualWindow.paddingBottom }}
                data-file-manager-virtual-spacer="bottom"
              />
            ) : null}
          </>
        )}
      </div>
      <footer
        className="border-t border-line px-3 py-2 text-xs text-muted"
        data-file-manager-responsive-footer
      >
        <details
          className="group sm:hidden"
          data-file-manager-mobile-list-settings
        >
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 marker:hidden">
            <span className="min-w-0 flex-1 truncate">
              {filteredEntries.length} 可见 /{" "}
              {pagination?.totalEntries ?? entries.length} 总项
            </span>
            {selectedStatus.count > 0 ? (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                已选 {selectedStatus.count}
              </span>
            ) : null}
            <span className="rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-subtle">
              列表设置
            </span>
          </summary>
          <div
            className="hidden gap-2 border-t border-line pt-2 group-open:grid"
            data-file-manager-mobile-list-settings-body
          >
            <div
              className="inline-flex w-full justify-center rounded border border-line bg-panel-2 p-0.5"
              aria-label="列表密度"
            >
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-2xs hover:text-ink-strong",
                  density === "comfortable"
                    ? "bg-panel text-primary shadow-sm"
                    : "text-muted",
                )}
                onClick={() => onDensityChange("comfortable")}
              >
                舒适
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-2xs hover:text-ink-strong",
                  density === "compact"
                    ? "bg-panel text-primary shadow-sm"
                    : "text-muted",
                )}
                onClick={() => onDensityChange("compact")}
              >
                紧凑
              </button>
            </div>
            <div
              className="inline-flex w-full justify-center rounded border border-line bg-panel-2 p-0.5"
              aria-label="视图布局"
            >
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-2xs hover:text-ink-strong",
                  displayMode === "list"
                    ? "bg-panel text-primary shadow-sm"
                    : "text-muted",
                )}
                onClick={() => onDisplayModeChange("list")}
              >
                <List className="size-3" />
                列表
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-2xs hover:text-ink-strong",
                  displayMode === "grid"
                    ? "bg-panel text-primary shadow-sm"
                    : "text-muted",
                )}
                onClick={() => onDisplayModeChange("grid")}
              >
                <Grid2X2 className="size-3" />
                网格
              </button>
            </div>
            <div
              className="grid gap-1 rounded border border-line bg-panel-2 p-2"
              data-file-manager-mobile-column-settings
            >
              <div className="flex items-center justify-between gap-2 text-2xs text-subtle">
                <span>桌面列</span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-primary hover:bg-primary-soft"
                  onClick={resetColumns}
                  data-file-manager-reset-columns
                >
                  重置
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {FILE_MANAGER_OPTIONAL_COLUMNS.map((column) => (
                  <label
                    key={column.id}
                    className="inline-flex min-w-0 items-center gap-1 rounded bg-panel px-2 py-1 text-2xs text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={columns.includes(column.id)}
                      onChange={() => toggleColumn(column.id)}
                      className="size-3 accent-primary"
                      aria-label={`显示${column.label}列`}
                    />
                    <span className="truncate">{column.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {canLoadMore ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                disabled={isFetching}
              >
                {isFetching ? "加载中..." : "加载更多"}
              </Button>
            ) : (
              <span className="text-center">已加载全部</span>
            )}
          </div>
        </details>
        <div
          className="hidden flex-wrap items-center justify-between gap-2 sm:flex"
          data-file-manager-desktop-list-footer
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span>
              {filteredEntries.length} 可见 /{" "}
              {pagination?.totalEntries ?? entries.length} 总项
            </span>
            {selectedStatus.count > 0 ? (
              <span
                className="rounded-full bg-primary-soft px-2 py-0.5 text-primary"
                title={selectedStatus.summary}
                data-file-manager-selection-summary
              >
                已选 {selectedStatus.count} 项 · {selectedStatus.fileCount} 文件
                · {selectedStatus.directoryCount} 目录 ·{" "}
                {formatBytes(selectedStatus.fileBytes)}
              </span>
            ) : (
              <span className="rounded-full bg-panel-2 px-2 py-0.5 text-subtle">
                未选择项目
              </span>
            )}
          </div>
          <div className="relative hidden sm:block">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted hover:text-ink-strong"
              onClick={() => setColumnMenuOpen((value) => !value)}
              aria-expanded={columnMenuOpen}
              aria-label="配置列表列"
            >
              <Settings2 className="size-3" />列
            </button>
            {columnMenuOpen ? (
              <div
                className="absolute bottom-[calc(100%+6px)] left-0 z-20 min-w-40 rounded-md border border-line bg-panel p-2 shadow-lg"
                data-file-manager-column-menu
              >
                {FILE_MANAGER_OPTIONAL_COLUMNS.map((column) => (
                  <label
                    key={column.id}
                    draggable={columns.includes(column.id)}
                    onDragStart={(event) => {
                      if (!columns.includes(column.id)) return;
                      setDraggingColumn(column.id);
                      event.dataTransfer.setData("text/plain", column.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => {
                      if (draggingColumn && columns.includes(column.id))
                        event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const source = (event.dataTransfer.getData(
                        "text/plain",
                      ) || draggingColumn) as FileManagerListColumn | null;
                      if (source) reorderColumn(source, column.id);
                      setDraggingColumn(null);
                    }}
                    onDragEnd={() => setDraggingColumn(null)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2xs text-muted hover:bg-panel-2 hover:text-ink-strong",
                      draggingColumn === column.id && "opacity-45",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={columns.includes(column.id)}
                      onChange={() => toggleColumn(column.id)}
                      className="size-3 accent-primary"
                      aria-label={`显示${column.label}列`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {column.label}
                    </span>
                    <span className="text-subtle" title="拖拽调整列顺序">
                      ↕
                    </span>
                    {columns.includes(column.id) ? (
                      <span className="inline-flex rounded border border-line bg-panel">
                        <button
                          type="button"
                          className="px-1 hover:text-primary"
                          aria-label={`${column.label}列上移`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveColumn(column.id, -1);
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="px-1 hover:text-primary"
                          aria-label={`${column.label}列下移`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveColumn(column.id, 1);
                          }}
                        >
                          ↓
                        </button>
                      </span>
                    ) : null}
                  </label>
                ))}
                <div className="flex items-center justify-between gap-2 px-2 pt-1 text-[10px] text-subtle">
                  <span>拖拽或用 ↑↓ 调整可见列顺序</span>
                  <button
                    type="button"
                    className="shrink-0 rounded px-1.5 py-0.5 text-primary hover:bg-primary-soft"
                    onClick={resetColumns}
                    data-file-manager-reset-columns
                  >
                    重置
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div
            className="inline-flex rounded border border-line bg-panel-2 p-0.5"
            aria-label="列表密度"
          >
            <button
              type="button"
              className={cn(
                "rounded px-2 py-1 text-2xs hover:text-ink-strong",
                density === "comfortable"
                  ? "bg-panel text-primary shadow-sm"
                  : "text-muted",
              )}
              onClick={() => onDensityChange("comfortable")}
            >
              舒适
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-2 py-1 text-2xs hover:text-ink-strong",
                density === "compact"
                  ? "bg-panel text-primary shadow-sm"
                  : "text-muted",
              )}
              onClick={() => onDensityChange("compact")}
            >
              紧凑
            </button>
          </div>
          <div
            className="inline-flex rounded border border-line bg-panel-2 p-0.5"
            aria-label="视图布局"
          >
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-2xs hover:text-ink-strong",
                displayMode === "list"
                  ? "bg-panel text-primary shadow-sm"
                  : "text-muted",
              )}
              onClick={() => onDisplayModeChange("list")}
            >
              <List className="size-3" />
              列表
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-2xs hover:text-ink-strong",
                displayMode === "grid"
                  ? "bg-panel text-primary shadow-sm"
                  : "text-muted",
              )}
              onClick={() => onDisplayModeChange("grid")}
            >
              <Grid2X2 className="size-3" />
              网格
            </button>
          </div>
          {canLoadMore ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={isFetching}
            >
              {isFetching ? "加载中..." : "加载更多"}
            </Button>
          ) : (
            <span className="text-center sm:text-left">已加载全部</span>
          )}
        </div>
      </footer>
      {marquee?.active ? (
        <div
          className="pointer-events-none fixed z-50 rounded border border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.12)]"
          style={marqueeStyle(
            normalizeRect(
              marquee.startX,
              marquee.startY,
              marquee.currentX,
              marquee.currentY,
            ),
          )}
          data-file-manager-marquee-selection-rect
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

interface FileManagerSelectionSummary {
  count: number;
  fileCount: number;
  directoryCount: number;
  fileBytes: number;
  summary: string;
}

export function summarizeFileManagerSelection(
  entries: FileEntrySummary[],
  selectedPaths: Set<string>,
): FileManagerSelectionSummary {
  const selectedEntries = entries.filter((entry) =>
    selectedPaths.has(entry.path),
  );
  const fileCount = selectedEntries.filter((entry) => entry.kind === "file").length;
  const directoryCount = selectedEntries.filter(
    (entry) => entry.kind === "directory",
  ).length;
  const fileBytes = selectedEntries.reduce(
    (total, entry) => total + (entry.kind === "file" ? (entry.size ?? 0) : 0),
    0,
  );
  return {
    count: selectedEntries.length,
    fileCount,
    directoryCount,
    fileBytes,
    summary: summarizeBulkSelection(
      selectedEntries,
      fileCount,
      directoryCount,
      fileBytes,
    ),
  };
}

function summarizeBulkSelection(
  entries: FileEntrySummary[],
  fileCount: number,
  directoryCount: number,
  selectedBytes: number,
): string {
  const firstNames = entries.slice(0, 3).map((entry) => entry.name).join("、");
  const moreCount = Math.max(0, entries.length - 3);
  const sample = firstNames
    ? moreCount > 0
      ? `${firstNames} 等 ${entries.length} 项`
      : firstNames
    : `${entries.length} 项`;
  return `${sample} · ${fileCount} 文件 / ${directoryCount} 目录 · ${formatBytes(selectedBytes)}`;
}

function sortLabel(key: FileManagerSortKey): string {
  if (key === "size") return "大小";
  if (key === "modified") return "修改时间";
  if (key === "type") return "类型";
  if (key === "permissions") return "权限";
  if (key === "owner") return "Owner";
  return "名称";
}

function isExternalFileDrag(dataTransfer: DataTransfer): boolean {
  return (
    dataTransfer.types.includes("Files") &&
    !dataTransfer.types.includes(FILE_MANAGER_ENTRY_DRAG_MIME)
  );
}

function isFileListInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input,textarea,select,button,a,label,summary,[role='menuitem']",
    ),
  );
}

function useScrollSelectedFileIntoView(
  ref: React.RefObject<HTMLElement | null>,
  selected: boolean,
): void {
  React.useEffect(() => {
    if (!selected) return;
    ref.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [ref, selected]);
}

function parseFileManagerDragPayload(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { paths?: unknown };
    return Array.isArray(parsed.paths)
      ? parsed.paths.filter(
          (path): path is string => typeof path === "string" && path.length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

interface ViewportRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function normalizeRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): ViewportRect {
  return {
    left: Math.min(startX, currentX),
    right: Math.max(startX, currentX),
    top: Math.min(startY, currentY),
    bottom: Math.max(startY, currentY),
  };
}

function rectsIntersect(selection: ViewportRect, target: DOMRect): boolean {
  return (
    selection.left <= target.right &&
    selection.right >= target.left &&
    selection.top <= target.bottom &&
    selection.bottom >= target.top
  );
}

function marqueeStyle(rect: ViewportRect): React.CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(1, rect.right - rect.left),
    height: Math.max(1, rect.bottom - rect.top),
  };
}

function SortHeader({
  active,
  direction,
  onClick,
  children,
}: {
  active: boolean;
  direction: FileManagerSortDirection;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-left hover:text-ink-strong focus-visible:shadow-[var(--ring)] focus-visible:outline-none",
        active && "text-primary",
      )}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      onClick={onClick}
    >
      <span className="truncate">{children}</span>
      <span className={cn("text-2xs", !active && "opacity-0")}>
        {direction === "asc" ? "↑" : "↓"}
      </span>
    </button>
  );
}

function ResizableSortHeader({
  column,
  width,
  active,
  direction,
  onClick,
  onResize,
  children,
}: {
  column: FileManagerResizableColumn;
  width: number;
  active: boolean;
  direction: FileManagerSortDirection;
  onClick: () => void;
  onResize: (column: FileManagerResizableColumn, width: number) => void;
  children: React.ReactNode;
}) {
  const dragRef = React.useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const startResize = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { startX: event.clientX, startWidth: width };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function onMouseMove(moveEvent: MouseEvent) {
        const state = dragRef.current;
        if (!state) return;
        onResize(column, state.startWidth + moveEvent.clientX - state.startX);
      }

      function onMouseUp() {
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [column, onResize, width],
  );

  return (
    <span className="group/header relative flex min-w-0 items-center pr-2">
      <SortHeader active={active} direction={direction} onClick={onClick}>
        {children}
      </SortHeader>
      <button
        type="button"
        aria-label={`调整${String(children)}列宽`}
        title={`拖拽调整${String(children)}列宽`}
        className="absolute right-0 top-1/2 h-5 w-2 -translate-y-1/2 cursor-col-resize rounded-sm border-r border-line-2 opacity-30 outline-none transition-opacity hover:border-primary hover:opacity-100 focus-visible:shadow-[var(--ring)] group-hover/header:opacity-70"
        onMouseDown={startResize}
      />
    </span>
  );
}

function resolveColumnWidths(
  widths: FileManagerColumnWidths,
): Record<FileManagerResizableColumn, number> {
  return {
    name: clampColumnWidth("name", widths.name),
    size: clampColumnWidth("size", widths.size),
    modified: clampColumnWidth("modified", widths.modified),
    type: clampColumnWidth("type", widths.type),
    permissions: clampColumnWidth("permissions", widths.permissions),
    owner: clampColumnWidth("owner", widths.owner),
  };
}

function clampColumnWidth(
  column: FileManagerResizableColumn,
  width: number | undefined,
): number {
  const fallback = FILE_MANAGER_DEFAULT_COLUMN_WIDTHS[column];
  const limits = FILE_MANAGER_COLUMN_LIMITS[column];
  if (!Number.isFinite(width)) return fallback;
  return Math.round(
    Math.min(limits.max, Math.max(limits.min, width ?? fallback)),
  );
}

function FileRow({
  entry,
  selected,
  checked,
  density,
  gridTemplateColumns,
  orderedColumns,
  onOpen,
  onSelect,
  onToggleChecked,
  onContextMenu,
  onOpenContextMenu,
  onDragStart,
  dropOperation,
  onDragOverDirectory,
  onDragLeaveDirectory,
  onDropOnDirectory,
}: {
  entry: FileEntrySummary;
  selected: boolean;
  checked: boolean;
  density: FileManagerListDensity;
  gridTemplateColumns: string;
  orderedColumns: FileManagerListColumn[];
  onOpen: () => void;
  onSelect: (event: React.MouseEvent) => void;
  onToggleChecked: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onOpenContextMenu: (x: number, y: number) => void;
  onDragStart: (event: React.DragEvent) => void;
  dropOperation: "copy" | "move" | "upload" | null;
  onDragOverDirectory: (event: React.DragEvent) => void;
  onDragLeaveDirectory: () => void;
  onDropOnDirectory: (event: React.DragEvent) => void;
}) {
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  useScrollSelectedFileIntoView(rowRef, selected);
  const openKeyboardMenu = React.useCallback(() => {
    const rect = rowRef.current?.getBoundingClientRect();
    onOpenContextMenu(
      rect ? rect.left + Math.min(rect.width - 24, 320) : 0,
      rect ? rect.top + 28 : 0,
    );
  }, [onOpenContextMenu]);

  return (
    <div
      ref={rowRef}
      role="button"
      aria-selected={checked || selected}
      tabIndex={0}
      draggable
      data-file-manager-entry-path={entry.path}
      data-entry-kind={entry.kind}
      data-file-manager-entry-selected={checked ? "true" : "false"}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        if (entry.kind !== "directory") return;
        if (event.dataTransfer.types.includes(FILE_MANAGER_ENTRY_DRAG_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect =
            event.ctrlKey || event.altKey ? "copy" : "move";
          onDragOverDirectory(event);
          return;
        }
        if (isExternalFileDrag(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          onDragOverDirectory(event);
        }
      }}
      onDragLeave={onDragLeaveDirectory}
      onDrop={onDropOnDirectory}
      onDoubleClick={onOpen}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
        if (event.key === " ") {
          event.preventDefault();
          onToggleChecked();
        }
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          openKeyboardMenu();
        }
      }}
      onContextMenu={onContextMenu}
      style={
        {
          "--file-row-desktop-columns": gridTemplateColumns,
        } as React.CSSProperties
      }
      className={cn(
        "group/file-row grid w-full grid-cols-[36px_minmax(0,1fr)_44px] items-start border-b border-line px-3 text-left text-sm last:border-b-0 hover:bg-panel-2 focus-visible:shadow-[var(--ring)] focus-visible:outline-none sm:items-center sm:[grid-template-columns:var(--file-row-desktop-columns)]",
        density === "compact" ? "py-1.5" : "py-2.5",
        selected && "bg-primary-soft",
        dropOperation && "bg-primary-soft ring-2 ring-primary/40",
      )}
    >
      <label
        className={cn(
          "flex items-center pt-1 opacity-0 transition-opacity sm:pt-0",
          "group-hover/file-row:opacity-100 group-focus-within/file-row:opacity-100",
          (checked || selected) && "opacity-100",
        )}
        onClick={(event) => event.stopPropagation()}
        data-file-manager-entry-checkbox-affordance
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleChecked}
          className="size-4 accent-primary"
          aria-label={`选择 ${entry.name}`}
        />
      </label>
      <span className="min-w-0 text-ink">
        <span className="flex min-w-0 items-center gap-2">
          <FileTypeIcon entry={entry} size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium sm:font-normal">
            {entry.name}
          </span>
          {entry.hidden ? (
            <span className="shrink-0 rounded bg-panel-3 px-1 py-0.5 text-2xs text-subtle">
              hidden
            </span>
          ) : null}
          {dropOperation ? (
            <span className="hidden shrink-0 rounded bg-primary px-1.5 py-0.5 text-2xs font-semibold text-white sm:inline">
              {dropOperation === "upload"
                ? "上传到此处"
                : dropOperation === "copy"
                  ? "复制到此处"
                  : "移动到此处"}
            </span>
          ) : null}
        </span>
        <span
          className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted sm:hidden"
          data-file-manager-mobile-meta
        >
          <span>
            {entry.kind === "directory" ? "目录" : entry.ext || "文件"}
          </span>
          <span>·</span>
          <span>
            {entry.kind === "file" ? formatBytes(entry.size ?? 0) : "—"}
          </span>
          <span>·</span>
          <span className="truncate">
            {entry.modifiedAt
              ? new Date(entry.modifiedAt).toLocaleString()
              : "无修改时间"}
          </span>
          {dropOperation ? (
            <span className="rounded bg-primary px-1.5 py-0.5 font-semibold text-white">
              {dropOperation === "upload"
                ? "上传到此处"
                : dropOperation === "copy"
                  ? "复制到此处"
                  : "移动到此处"}
            </span>
          ) : null}
        </span>
      </span>
      {orderedColumns.map((column) => (
        <FileRowColumn key={column} column={column} entry={entry} />
      ))}
      <span className="text-right text-subtle">
        <button
          type="button"
          className="ml-auto grid size-7 place-items-center rounded text-subtle hover:bg-panel-3 hover:text-ink-strong focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
          aria-label={`打开 ${entry.name} 的操作菜单`}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenContextMenu(rect.left, rect.bottom + 4);
          }}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </span>
    </div>
  );
}

function FileRowColumn({
  column,
  entry,
}: {
  column: FileManagerListColumn;
  entry: FileEntrySummary;
}) {
  if (column === "size") {
    return (
      <span className="hidden text-muted sm:block" data-file-manager-column="size">
        {entry.kind === "file" ? formatBytes(entry.size ?? 0) : "—"}
      </span>
    );
  }
  if (column === "modified") {
    return (
      <span className="hidden truncate text-muted sm:block" data-file-manager-column="modified">
        {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : "—"}
      </span>
    );
  }
  if (column === "type")
    return (
      <span className="hidden text-muted sm:block" data-file-manager-column="type">
        {entry.kind === "directory" ? "目录" : entry.ext || "文件"}
      </span>
    );
  if (column === "permissions")
    return (
      <span
        className="hidden font-mono text-2xs text-muted sm:block"
        data-file-manager-column="permissions"
        title={`${entry.permissions} (${entry.mode})`}
      >
        {entry.permissions || "—"}
      </span>
    );
  return (
    <span className="hidden font-mono text-2xs text-muted sm:block" data-file-manager-column="owner">
      {entry.uid != null || entry.gid != null
        ? `${entry.uid ?? "—"}:${entry.gid ?? "—"}`
        : "—"}
    </span>
  );
}

function FileGridCard({
  entry,
  selected,
  checked,
  onOpen,
  onSelect,
  onToggleChecked,
  onContextMenu,
  onOpenContextMenu,
  onDragStart,
  dropOperation,
  onDragOverDirectory,
  onDragLeaveDirectory,
  onDropOnDirectory,
}: {
  entry: FileEntrySummary;
  selected: boolean;
  checked: boolean;
  onOpen: () => void;
  onSelect: (event: React.MouseEvent) => void;
  onToggleChecked: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onOpenContextMenu: (x: number, y: number) => void;
  onDragStart: (event: React.DragEvent) => void;
  dropOperation: "copy" | "move" | "upload" | null;
  onDragOverDirectory: (event: React.DragEvent) => void;
  onDragLeaveDirectory: () => void;
  onDropOnDirectory: (event: React.DragEvent) => void;
}) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  useScrollSelectedFileIntoView(cardRef, selected);
  const openKeyboardMenu = React.useCallback(() => {
    const rect = cardRef.current?.getBoundingClientRect();
    onOpenContextMenu(rect ? rect.right - 32 : 0, rect ? rect.top + 36 : 0);
  }, [onOpenContextMenu]);
  return (
    <div
      ref={cardRef}
      role="button"
      aria-selected={checked || selected}
      tabIndex={0}
      draggable
      data-file-manager-entry-path={entry.path}
      data-entry-kind={entry.kind}
      data-file-manager-entry-selected={checked ? "true" : "false"}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        if (entry.kind !== "directory") return;
        if (event.dataTransfer.types.includes(FILE_MANAGER_ENTRY_DRAG_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect =
            event.ctrlKey || event.altKey ? "copy" : "move";
          onDragOverDirectory(event);
          return;
        }
        if (isExternalFileDrag(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          onDragOverDirectory(event);
        }
      }}
      onDragLeave={onDragLeaveDirectory}
      onDrop={onDropOnDirectory}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
        if (event.key === " ") {
          event.preventDefault();
          onToggleChecked();
        }
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          openKeyboardMenu();
        }
      }}
      className={cn(
        "group grid min-h-36 content-between rounded-lg border border-line bg-panel-2 p-3 text-left transition-colors hover:border-primary-line hover:bg-primary-soft/50 focus-visible:shadow-[var(--ring)] focus-visible:outline-none",
        selected && "border-primary-line bg-primary-soft",
        dropOperation &&
          "border-primary-line bg-primary-soft ring-2 ring-primary/40",
      )}
      title={entry.path}
    >
      <div className="flex items-start justify-between gap-2">
        <label
          className={cn(
            "grid size-6 place-items-center rounded bg-panel opacity-0 shadow-sm transition-opacity",
            "group-hover:opacity-100 group-focus-within:opacity-100",
            (checked || selected) && "opacity-100",
          )}
          onClick={(event) => event.stopPropagation()}
          data-file-manager-entry-checkbox-affordance
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleChecked}
            className="size-4 accent-primary"
            aria-label={`选择 ${entry.name}`}
          />
        </label>
        <button
          type="button"
          className="grid size-7 place-items-center rounded text-subtle opacity-80 hover:bg-panel-3 hover:text-ink-strong focus-visible:shadow-[var(--ring)] focus-visible:outline-none group-hover:opacity-100"
          aria-label={`打开 ${entry.name} 的操作菜单`}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenContextMenu(rect.left, rect.bottom + 4);
          }}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      <div className="grid justify-items-center gap-2 py-2">
        <div
          className={cn(
            "grid size-14 place-items-center rounded-xl border",
            entry.kind === "directory"
              ? "border-primary-line bg-primary-soft text-primary"
              : "border-line bg-panel text-muted",
          )}
        >
          <FileTypeIcon entry={entry} size="lg" />
        </div>
        <div className="w-full min-w-0 text-center">
          <div className="truncate text-sm font-medium text-ink-strong">
            {entry.name}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-2xs text-subtle">
            <span>
              {entry.kind === "directory" ? "目录" : entry.ext || "文件"}
            </span>
            <span>·</span>
            <span>
              {entry.kind === "file" ? formatBytes(entry.size ?? 0) : "—"}
            </span>
          </div>
          {dropOperation ? (
            <div className="mt-1 rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-white">
              {dropOperation === "upload"
                ? "上传到此处"
                : dropOperation === "copy"
                  ? "复制到此处"
                  : "移动到此处"}
            </div>
          ) : null}
        </div>
      </div>
      <div className="truncate text-center text-2xs text-muted">
        {entry.modifiedAt
          ? new Date(entry.modifiedAt).toLocaleString()
          : "无修改时间"}
        {entry.hidden ? (
          <span className="ml-1 rounded bg-panel-3 px-1 py-0.5 text-subtle">
            hidden
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function formatBytes(value: number): string {
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

export function sortFileEntries(
  entries: FileEntrySummary[],
  sort: FileManagerSortState,
): FileEntrySummary[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const directoryRank =
        Number(right.entry.kind === "directory") -
        Number(left.entry.kind === "directory");
      if (directoryRank !== 0) return directoryRank;
      const valueCompare = compareEntryValue(left.entry, right.entry, sort.key);
      if (valueCompare !== 0)
        return sort.direction === "asc" ? valueCompare : -valueCompare;
      const nameCompare = FILE_NAME_COLLATOR.compare(
        left.entry.name,
        right.entry.name,
      );
      if (nameCompare !== 0) return nameCompare;
      return left.index - right.index;
    })
    .map((item) => item.entry);
}

function compareEntryValue(
  left: FileEntrySummary,
  right: FileEntrySummary,
  key: FileManagerSortKey,
): number {
  if (key === "size") return (left.size ?? 0) - (right.size ?? 0);
  if (key === "modified")
    return timestamp(left.modifiedAt) - timestamp(right.modifiedAt);
  if (key === "type")
    return FILE_NAME_COLLATOR.compare(entryType(left), entryType(right));
  if (key === "permissions")
    return FILE_NAME_COLLATOR.compare(
      `${left.mode} ${left.permissions}`,
      `${right.mode} ${right.permissions}`,
    );
  if (key === "owner")
    return (
      (left.uid ?? -1) - (right.uid ?? -1) ||
      (left.gid ?? -1) - (right.gid ?? -1)
    );
  return FILE_NAME_COLLATOR.compare(left.name, right.name);
}

function entryType(entry: FileEntrySummary): string {
  return entry.kind === "directory" ? "目录" : entry.ext || "文件";
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
