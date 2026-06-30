import * as React from "react";
import {
  ArrowUp,
  ChevronRight,
  Copy,
  Database,
  Eye,
  EyeOff,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  HardDrive,
  History,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Star,
  Upload,
  MoreHorizontal,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import type {
  FileBreadcrumb,
  FileRootSummary,
} from "@/features/file-manager/file-tools";

export type FileManagerViewMode = "files" | "index" | "trash";

export interface FileManagerLocation {
  rootId: string;
  directoryPath: string;
  label: string;
  displayName?: string;
}

export interface FileManagerQuickLocation extends FileManagerLocation {
  favorited: boolean;
}

export interface FileManagerDirectoryTab extends FileManagerLocation {
  id: string;
}

export interface FileManagerBookmarkItem {
  id: string;
  type: "folder" | "bookmark";
  title: string;
  location?: FileManagerLocation;
  children?: FileManagerBookmarkItem[];
}

export interface FileManagerHeaderProps {
  rootId: string;
  roots: FileRootSummary[];
  rootAbsolutePath?: string;
  directoryPath: string;
  viewMode: FileManagerViewMode;
  onChangeRoot: (rootId: string) => void;
  onNewFile: () => void;
  onNewDirectory: () => void;
  onUpload: () => void;
  onChangeViewMode: (mode: FileManagerViewMode) => void;
  onRefresh: () => void;
  showHidden: boolean;
  onToggleShowHidden: () => void;
}

export function FileManagerHeader({
  rootId,
  roots,
  viewMode,
  onChangeRoot,
  onNewFile,
  onNewDirectory,
  onUpload,
  onChangeViewMode,
  onRefresh,
  showHidden,
  onToggleShowHidden,
}: FileManagerHeaderProps) {
  const currentRoot = roots.find((item) => item.id === rootId);

  return (
    <div
      className="flex min-w-0 items-center gap-2 border-b border-line px-3 py-1.5 sm:px-4"
      data-file-manager-command-bar
    >
      <div
        className="flex min-w-0 items-center gap-2 text-xs text-muted"
        data-file-manager-header-title
      >
        <span className="inline-grid size-7 shrink-0 place-items-center rounded-lg border border-primary-line bg-primary-soft text-primary">
          <HardDrive className="size-4" />
        </span>
        <span className="font-semibold text-ink-strong">文件管理器</span>
        <span className="hidden max-w-[180px] truncate rounded-full border border-line bg-panel px-2 py-1 text-2xs text-subtle md:inline-flex">
          {currentRoot?.labelZh ?? rootId ?? "未选择根目录"}
        </span>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <div
          className="hidden items-center gap-1 rounded-full border border-line bg-panel p-0.5 sm:flex"
          data-file-manager-view-switcher
        >
          <button
            type="button"
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              viewMode === "files"
                ? "bg-primary text-primary-ink"
                : "text-muted hover:bg-panel-2 hover:text-ink",
            )}
            onClick={() => onChangeViewMode("files")}
          >
            文件
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
              viewMode === "index"
                ? "bg-primary text-primary-ink"
                : "text-muted hover:bg-panel-2 hover:text-ink",
            )}
            onClick={() => onChangeViewMode("index")}
          >
            <Database className="size-3.5" />
            索引
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
              viewMode === "trash"
                ? "bg-primary text-primary-ink"
                : "text-muted hover:bg-panel-2 hover:text-ink",
            )}
            onClick={() => onChangeViewMode("trash")}
          >
            <Trash2 className="size-3.5" />
            回收站
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={onRefresh}
          aria-label="刷新文件列表"
        >
          <RefreshCw className="size-4" />
          <span className="hidden md:inline">刷新</span>
        </Button>

        <details className="group relative" data-file-manager-actions-menu>
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-line bg-panel px-2 text-xs font-medium text-ink-strong marker:hidden hover:bg-panel-2 focus-visible:shadow-[var(--ring)]">
            <MoreHorizontal className="size-4 text-subtle" />
            <span className="hidden sm:inline">操作</span>
            <ChevronRight className="size-3 rotate-90 text-subtle transition-transform group-open:-rotate-90" />
          </summary>
          <div
            className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 grid max-h-[min(72dvh,520px)] gap-1 overflow-y-auto rounded-2xl border border-line bg-panel/98 p-3 text-xs shadow-2xl backdrop-blur sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+6px)] sm:w-60 sm:rounded-xl sm:bg-panel sm:p-2 sm:backdrop-blur-0"
            data-file-manager-actions-popover
          >
            <button
              type="button"
              onClick={onUpload}
              disabled={!rootId}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel-2 disabled:opacity-50"
            >
              <Upload className="size-4 text-primary" />
              上传到当前目录
            </button>
            <button
              type="button"
              onClick={onNewFile}
              disabled={!rootId}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel-2 disabled:opacity-50"
            >
              <FilePlus className="size-4 text-primary" />
              新建文件
            </button>
            <button
              type="button"
              onClick={onNewDirectory}
              disabled={!rootId}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel-2 disabled:opacity-50"
            >
              <FolderPlus className="size-4 text-primary" />
              新建目录
            </button>
            <button
              type="button"
              onClick={onToggleShowHidden}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel-2",
                showHidden && "bg-primary-soft text-primary",
              )}
              aria-pressed={showHidden}
              data-file-manager-hidden-toggle
            >
              {showHidden ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
              {showHidden ? "隐藏隐藏文件" : "显示隐藏文件"}
            </button>
            <div className="my-1 h-px bg-line" />
            <label
              className="grid gap-1 px-2 py-1 text-2xs font-semibold uppercase tracking-[.12em] text-subtle"
              htmlFor="file-manager-root"
            >
              入口
            </label>
            <select
              id="file-manager-root"
              value={rootId}
              onChange={(event) => onChangeRoot(event.target.value)}
              className="h-8 rounded-md border border-line bg-panel-2 px-2 text-xs font-medium text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
              data-file-manager-root-select
            >
              {roots.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.labelZh}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-1 pt-1 sm:hidden">
              {(["files", "index", "trash"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeViewMode(mode)}
                  className={cn(
                    "rounded-md px-2 py-1.5",
                    viewMode === mode
                      ? "bg-primary text-primary-ink"
                      : "bg-panel-2 text-muted",
                  )}
                >
                  {mode === "files"
                    ? "文件"
                    : mode === "index"
                      ? "索引"
                      : "回收"}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

type CompactBreadcrumb =
  | (FileBreadcrumb & { collapsed?: false })
  | { label: "…"; path: "__tracevane_breadcrumb_ellipsis__"; collapsed: true };

function compactBreadcrumbs(
  breadcrumbs: FileBreadcrumb[],
): CompactBreadcrumb[] {
  const pathCrumbs = breadcrumbs.slice(1);
  if (pathCrumbs.length <= 4) return pathCrumbs;
  return [
    pathCrumbs[0],
    { label: "…", path: "__tracevane_breadcrumb_ellipsis__", collapsed: true },
    ...pathCrumbs.slice(-3),
  ];
}

export interface FileManagerNavigationBarProps {
  roots: FileRootSummary[];
  onChangeRoot: (rootId: string) => void;
  directoryPath: string;
  parentPath: string | null;
  breadcrumbs: FileBreadcrumb[];
  pathInput: string;
  displayPath: string;
  pathSuggestions: FileManagerLocation[];
  pathSuggestionsOpen: boolean;
  activePathSuggestionIndex: number;
  quickLocations: FileManagerQuickLocation[];
  favoriteTree: FileManagerBookmarkItem[];
  favoriteCount: number;
  recentLocations: FileManagerQuickLocation[];
  directoryTabs: FileManagerDirectoryTab[];
  activeDirectoryTabId?: string;
  filterText: string;
  showHidden: boolean;
  currentLocationFavorited: boolean;
  onNavigateToDirectory: (path: string) => void;
  onNavigateToLocation: (location: FileManagerLocation) => void;
  onSelectDirectoryTab: (tabId: string) => void;
  onAddDirectoryTab: () => void;
  onCloseDirectoryTab: (tabId: string) => void;
  onPathInputFocus: () => void;
  onPathInputBlur: () => void;
  onPathInputChange: (value: string) => void;
  onPathInputJump: () => void;
  onPathInputRestore: () => void;
  onCopyCurrentPath: () => void;
  onPathSuggestionActiveChange: (index: number) => void;
  onAcceptPathSuggestion: (location: FileManagerLocation) => void;
  onToggleFavoriteCurrent: () => void;
  onOpenFavoriteItem: (itemId: string) => void;
  onAddFavoriteFolder: (parentId: string | undefined, title: string) => void;
  onAddCurrentFavoriteToFolder: (
    parentId: string | undefined,
    title?: string,
  ) => void;
  onRenameFavoriteItem: (itemId: string, title: string) => void;
  onRemoveFavoriteItem: (itemId: string) => void;
  onMoveFavoriteItem: (
    itemId: string,
    targetParentId: string | undefined,
    targetIndex: number,
  ) => void;
  onClearRecentLocations: () => void;
  filterInputRef?: React.RefObject<HTMLInputElement | null>;
  onFilterTextChange: (value: string) => void;
  onToggleShowHidden: () => void;
  rootId: string;
  viewMode: FileManagerViewMode;
  onNewFile: () => void;
  onNewDirectory: () => void;
  onUpload: () => void;
  onChangeViewMode: (mode: FileManagerViewMode) => void;
  onRefresh: () => void;
  currentLocation: FileManagerLocation;
}

function locationShortLabel(location: FileManagerLocation): string {
  const label =
    location.displayName ||
    location.label ||
    location.directoryPath ||
    location.rootId;
  const parts = label.split("/").filter(Boolean);
  return parts.at(-1) ?? label ?? "root";
}

type FavoriteEditState =
  | { mode: "createFolder"; parentId?: string }
  | { mode: "addBookmark"; parentId?: string }
  | { mode: "rename"; itemId: string; currentTitle: string };

interface FavoriteDropTarget {
  parentId?: string;
  index: number;
}

function flattenFavoriteItemsForManager(
  items: FileManagerBookmarkItem[],
  expandedIds: Set<string>,
  depth = 0,
  parentId?: string,
): Array<{
  item: FileManagerBookmarkItem;
  depth: number;
  parentId?: string;
  index: number;
}> {
  const rows: Array<{
    item: FileManagerBookmarkItem;
    depth: number;
    parentId?: string;
    index: number;
  }> = [];
  items.forEach((item, index) => {
    rows.push({ item, depth, parentId, index });
    if (item.type === "folder" && expandedIds.has(item.id)) {
      rows.push(
        ...flattenFavoriteItemsForManager(
          item.children ?? [],
          expandedIds,
          depth + 1,
          item.id,
        ),
      );
    }
  });
  return rows;
}

function countBookmarkChildren(item: FileManagerBookmarkItem): number {
  if (item.type !== "folder") return 0;
  return item.children?.length ?? 0;
}

function BookmarkEditorDialog({
  state,
  onCancel,
  onSubmit,
}: {
  state: FavoriteEditState | null;
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const defaultValue =
    state?.mode === "rename"
      ? state.currentTitle
      : state?.mode === "createFolder"
        ? "新文件夹"
        : "当前位置";
  const [value, setValue] = React.useState(defaultValue);

  React.useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, state?.mode]);

  if (!state) return null;

  const title =
    state.mode === "createFolder"
      ? "新建收藏夹文件夹"
      : state.mode === "addBookmark"
        ? "收藏当前位置"
        : "重命名收藏项";

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(8,12,22,.35)] p-4 backdrop-blur-sm"
      role="presentation"
      data-file-manager-bookmark-editor-dialog
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="grid w-[min(420px,94vw)] gap-4 rounded-2xl border border-line bg-panel p-4 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          const nextTitle = value.trim();
          if (!nextTitle) return;
          onSubmit(nextTitle);
        }}
      >
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-ink-strong">{title}</h3>
          <p className="text-xs text-subtle">
            使用内部弹层管理名称，避免浏览器原生弹窗阻塞文件操作。
          </p>
        </div>
        <label className="grid gap-1 text-xs font-medium text-muted">
          名称
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="输入名称"
            data-file-manager-bookmark-title-input
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm">
            保存
          </Button>
        </div>
      </form>
    </div>
  );
}

function FavoriteManagerTreeRow({
  item,
  depth,
  isExpanded,
  isDragging,
  dragOver,
  onToggleExpanded,
  onOpenFavoriteItem,
  onStartEdit,
  onRemoveFavoriteItem,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropOnRow,
}: {
  item: FileManagerBookmarkItem;
  depth: number;
  isExpanded: boolean;
  isDragging: boolean;
  dragOver: "before" | "after" | "inside" | null;
  onToggleExpanded: (itemId: string) => void;
  onOpenFavoriteItem: (itemId: string) => void;
  onStartEdit: (state: FavoriteEditState) => void;
  onRemoveFavoriteItem: (itemId: string) => void;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (
    itemId: string,
    position: "before" | "after" | "inside",
  ) => void;
  onDropOnRow: (
    itemId: string,
    position: "before" | "after" | "inside",
  ) => void;
}) {
  const isFolder = item.type === "folder";
  return (
    <div
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors",
        isDragging
          ? "border-primary-line bg-primary-soft/70 opacity-70"
          : "border-transparent hover:border-line hover:bg-panel-2",
        dragOver === "inside" && "border-primary-line bg-primary-soft",
      )}
      style={{ paddingLeft: `${8 + depth * 18}px` }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart(item.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        const y = event.clientY - rect.top;
        const position = isFolder
          ? y < rect.height * 0.25
            ? "before"
            : y > rect.height * 0.75
              ? "after"
              : "inside"
          : y < rect.height / 2
            ? "before"
            : "after";
        onDragOverRow(item.id, position);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const y = event.clientY - rect.top;
        const position = isFolder
          ? y < rect.height * 0.25
            ? "before"
            : y > rect.height * 0.75
              ? "after"
              : "inside"
          : y < rect.height / 2
            ? "before"
            : "after";
        onDropOnRow(item.id, position);
      }}
      data-file-manager-bookmark-manager-row={item.type}
    >
      {dragOver === "before" ? (
        <span className="absolute left-2 right-2 top-0 h-0.5 rounded-full bg-primary" />
      ) : null}
      {dragOver === "after" ? (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
      ) : null}
      <div className="flex min-w-0 items-center gap-1.5">
        <GripVertical className="size-3.5 shrink-0 cursor-grab text-subtle" />
        {isFolder ? (
          <button
            type="button"
            className="grid size-5 shrink-0 place-items-center rounded hover:bg-panel-3"
            onClick={() => onToggleExpanded(item.id)}
            aria-label={isExpanded ? "收起文件夹" : "展开文件夹"}
          >
            <ChevronRight
              className={cn(
                "size-3.5 text-subtle transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen className="size-4 shrink-0 text-primary" />
          ) : (
            <Folder className="size-4 shrink-0 text-primary" />
          )
        ) : (
          <Star className="size-4 shrink-0 text-primary" />
        )}
        <button
          type="button"
          className="min-w-0 truncate text-left font-medium text-ink-strong hover:text-primary"
          onClick={() =>
            isFolder ? onToggleExpanded(item.id) : onOpenFavoriteItem(item.id)
          }
          title={item.location?.label || item.title}
        >
          {item.title}
        </button>
        {isFolder ? (
          <span className="rounded-full bg-panel-3 px-1.5 py-0.5 text-2xs text-subtle">
            {countBookmarkChildren(item)}
          </span>
        ) : item.location ? (
          <span className="hidden min-w-0 truncate font-mono text-2xs text-subtle md:inline">
            {item.location.label}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {isFolder ? (
          <>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-3 hover:text-primary"
              onClick={() =>
                onStartEdit({ mode: "createFolder", parentId: item.id })
              }
            >
              子文件夹
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-3 hover:text-primary"
              onClick={() =>
                onStartEdit({ mode: "addBookmark", parentId: item.id })
              }
            >
              收藏当前
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-3 hover:text-ink-strong"
          onClick={() =>
            onStartEdit({
              mode: "rename",
              itemId: item.id,
              currentTitle: item.title,
            })
          }
        >
          重命名
        </button>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-danger hover:bg-danger/10"
          onClick={() => onRemoveFavoriteItem(item.id)}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function FavoriteBookmarkManager({
  favoriteTree,
  favoriteCount,
  currentLocation,
  onOpenFavoriteItem,
  onAddFavoriteFolder,
  onAddCurrentFavoriteToFolder,
  onRenameFavoriteItem,
  onRemoveFavoriteItem,
  onMoveFavoriteItem,
}: {
  favoriteTree: FileManagerBookmarkItem[];
  favoriteCount: number;
  currentLocation: FileManagerLocation;
  onOpenFavoriteItem: (itemId: string) => void;
  onAddFavoriteFolder: (parentId: string | undefined, title: string) => void;
  onAddCurrentFavoriteToFolder: (
    parentId: string | undefined,
    title?: string,
  ) => void;
  onRenameFavoriteItem: (itemId: string, title: string) => void;
  onRemoveFavoriteItem: (itemId: string) => void;
  onMoveFavoriteItem: (
    itemId: string,
    targetParentId: string | undefined,
    targetIndex: number,
  ) => void;
}) {
  const rootDropZoneRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState<{
    itemId?: string;
    root?: boolean;
    position: "before" | "after" | "inside";
  } | null>(null);
  const [editState, setEditState] = React.useState<FavoriteEditState | null>(
    null,
  );

  React.useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const visit = (items: FileManagerBookmarkItem[]) => {
        for (const item of items) {
          if (item.type !== "folder") continue;
          if (item.children?.length) next.add(item.id);
          visit(item.children ?? []);
        }
      };
      visit(favoriteTree);
      return next;
    });
  }, [favoriteTree]);

  const flatRows = React.useMemo(
    () => flattenFavoriteItemsForManager(favoriteTree, expandedIds),
    [expandedIds, favoriteTree],
  );

  const toggleExpanded = React.useCallback((itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const submitEdit = React.useCallback(
    (title: string) => {
      if (!editState) return;
      if (editState.mode === "createFolder") {
        onAddFavoriteFolder(editState.parentId, title);
      } else if (editState.mode === "addBookmark") {
        onAddCurrentFavoriteToFolder(editState.parentId, title);
      } else {
        onRenameFavoriteItem(editState.itemId, title);
      }
      setEditState(null);
    },
    [
      editState,
      onAddCurrentFavoriteToFolder,
      onAddFavoriteFolder,
      onRenameFavoriteItem,
    ],
  );

  const handleDropOnRow = React.useCallback(
    (targetId: string, position: "before" | "after" | "inside") => {
      if (!draggingId || draggingId === targetId) return;
      const targetRow = flatRows.find((row) => row.item.id === targetId);
      if (!targetRow) return;
      if (position === "inside" && targetRow.item.type === "folder") {
        onMoveFavoriteItem(
          draggingId,
          targetRow.item.id,
          targetRow.item.children?.length ?? 0,
        );
        setExpandedIds((prev) => new Set(prev).add(targetRow.item.id));
      } else {
        onMoveFavoriteItem(
          draggingId,
          targetRow.parentId,
          targetRow.index + (position === "after" ? 1 : 0),
        );
      }
      setDragOver(null);
      setDraggingId(null);
    },
    [draggingId, flatRows, onMoveFavoriteItem],
  );

  return (
    <>
      <details
        className="relative"
        data-file-manager-favorites-manage
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none rounded-full border border-line bg-panel px-2 py-1 font-medium text-muted marker:hidden hover:border-primary-line hover:text-primary">
          收藏夹{favoriteCount ? ` · ${favoriteCount}` : ""}
        </summary>
        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] top-auto z-50 grid max-h-[min(82dvh,720px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+6px)] sm:h-[min(72dvh,680px)] sm:w-[min(780px,calc(100vw-2rem))]">
          <div className="grid gap-3 border-b border-line bg-panel-2/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-strong">
                  收藏夹管理
                </div>
                <div className="mt-0.5 text-2xs text-subtle">
                  像浏览器书签一样管理：展开/收起文件夹，拖拽排序或移动到文件夹。
                </div>
              </div>
              <button
                type="button"
                className="grid size-7 shrink-0 place-items-center rounded-md text-subtle hover:bg-panel hover:text-ink-strong"
                onClick={() => setOpen(false)}
                aria-label="关闭收藏夹"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0 rounded-lg border border-line bg-panel px-3 py-2 text-2xs text-subtle">
                当前路径：
                <span className="font-mono text-ink-strong">
                  {currentLocation.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditState({ mode: "createFolder" })}
                >
                  <FolderPlus className="size-3.5" />
                  新建文件夹
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setEditState({ mode: "addBookmark" })}
                >
                  <Star className="size-3.5" />
                  收藏当前
                </Button>
              </div>
            </div>
          </div>
          <div
            ref={rootDropZoneRef}
            className={cn(
              "grid content-start gap-1 overflow-y-auto p-2",
              dragOver?.root && "bg-primary-soft/40",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              if (event.target === rootDropZoneRef.current) {
                setDragOver({ root: true, position: "after" });
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggingId) return;
              onMoveFavoriteItem(draggingId, undefined, favoriteTree.length);
              setDragOver(null);
              setDraggingId(null);
            }}
            data-file-manager-bookmark-manager-tree
          >
            {flatRows.length ? (
              flatRows.map((row) => (
                <FavoriteManagerTreeRow
                  key={row.item.id}
                  item={row.item}
                  depth={row.depth}
                  isExpanded={expandedIds.has(row.item.id)}
                  isDragging={draggingId === row.item.id}
                  dragOver={
                    dragOver?.itemId === row.item.id ? dragOver.position : null
                  }
                  onToggleExpanded={toggleExpanded}
                  onOpenFavoriteItem={(itemId) => {
                    onOpenFavoriteItem(itemId);
                    setOpen(false);
                  }}
                  onStartEdit={setEditState}
                  onRemoveFavoriteItem={onRemoveFavoriteItem}
                  onDragStart={setDraggingId}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOver(null);
                  }}
                  onDragOverRow={(itemId, position) =>
                    setDragOver({ itemId, position })
                  }
                  onDropOnRow={handleDropOnRow}
                />
              ))
            ) : (
              <div className="grid place-items-center rounded-xl border border-dashed border-line bg-panel-2 p-8 text-center text-xs text-subtle">
                <Star className="mb-2 size-6 text-primary" />
                <div className="font-semibold text-ink-strong">还没有收藏</div>
                <div className="mt-1">点击“收藏当前”创建第一个书签。</div>
              </div>
            )}
          </div>
        </div>
      </details>
      <BookmarkEditorDialog
        state={editState}
        onCancel={() => setEditState(null)}
        onSubmit={submitEdit}
      />
    </>
  );
}

export function FileManagerNavigationBar({
  roots,
  onChangeRoot,
  directoryPath,
  parentPath,
  breadcrumbs,
  pathInput,
  displayPath,
  pathSuggestions,
  pathSuggestionsOpen,
  activePathSuggestionIndex,
  quickLocations,
  favoriteTree,
  favoriteCount,
  recentLocations,
  directoryTabs,
  activeDirectoryTabId,
  filterText,
  showHidden,
  currentLocationFavorited,
  onNavigateToDirectory,
  onNavigateToLocation,
  onSelectDirectoryTab,
  onAddDirectoryTab,
  onCloseDirectoryTab,
  onPathInputFocus,
  onPathInputBlur,
  onPathInputChange,
  onPathInputJump,
  onPathInputRestore,
  onCopyCurrentPath,
  onPathSuggestionActiveChange,
  onAcceptPathSuggestion,
  onToggleFavoriteCurrent,
  onOpenFavoriteItem,
  onAddFavoriteFolder,
  onAddCurrentFavoriteToFolder,
  onRenameFavoriteItem,
  onRemoveFavoriteItem,
  onMoveFavoriteItem,
  onClearRecentLocations,
  filterInputRef,
  onFilterTextChange,
  onToggleShowHidden,
  rootId,
  viewMode,
  onNewFile,
  onNewDirectory,
  onUpload,
  onChangeViewMode,
  onRefresh,
  currentLocation,
}: FileManagerNavigationBarProps) {
  const suggestionListId = React.useId();
  const activeSuggestion = pathSuggestions[activePathSuggestionIndex];
  const activeSuggestionId = activeSuggestion
    ? `${suggestionListId}-option-${activePathSuggestionIndex}`
    : undefined;
  const [editingPath, setEditingPath] = React.useState(false);
  const pathInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!editingPath) return;
    const frame = requestAnimationFrame(() => {
      pathInputRef.current?.focus();
      pathInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingPath]);

  const enterPathEditMode = React.useCallback(() => {
    setEditingPath(true);
    onPathInputFocus();
  }, [onPathInputFocus]);

  const exitPathEditMode = React.useCallback(() => {
    setEditingPath(false);
    onPathInputBlur();
  }, [onPathInputBlur]);

  const visibleBreadcrumbs = compactBreadcrumbs(breadcrumbs);

  return (
    <div
      className="grid gap-1.5 border-b border-line bg-panel-2/70 px-3 py-1.5 sm:px-4"
      data-file-manager-mobile-navigation
    >
      <div
        className="hidden min-w-0 items-end gap-1 overflow-x-auto border-b border-line/70 pb-1 sm:flex"
        role="tablist"
        aria-label="文件管理器目录标签"
        data-file-manager-directory-tabs
      >
        {directoryTabs.map((location) => {
          const active = location.id === activeDirectoryTabId;
          return (
            <span
              key={location.id}
              className={cn(
                "group/tab inline-flex h-9 max-w-[240px] shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
                active
                  ? "border-line bg-panel font-semibold text-primary shadow-sm"
                  : "border-transparent bg-panel-3/60 text-muted hover:border-line hover:bg-panel hover:text-ink-strong",
              )}
              title={location.displayName || location.label}
              data-file-manager-directory-tab={active ? "active" : "inactive"}
            >
              <button
                type="button"
                role="tab"
                aria-selected={Boolean(active)}
                onClick={() => onSelectDirectoryTab(location.id)}
                className="inline-flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
              >
                <Folder className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  {locationShortLabel(location)}
                </span>
              </button>
              <button
                type="button"
                className="mr-1 grid size-5 shrink-0 place-items-center rounded text-subtle opacity-70 hover:bg-panel-2 hover:text-danger group-hover/tab:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseDirectoryTab(location.id);
                }}
                aria-label={`关闭标签 ${locationShortLabel(location)}`}
                title="关闭标签"
                data-file-manager-directory-tab-close
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-t-md border border-b-0 border-line bg-panel px-2 text-xs text-muted hover:text-primary"
          onClick={onAddDirectoryTab}
          title="把当前目录新建为标签"
          data-file-manager-directory-tab-add
        >
          <Plus className="size-3.5" />
          新建标签
        </button>
      </div>

      <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="relative min-w-0">
          <div
            role="group"
            aria-label="文件路径地址栏，可点击面包屑或输入路径跳转"
            className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted focus-within:shadow-[var(--ring)]"
            data-file-manager-unified-path-bar
            data-file-manager-display-path={displayPath}
            onDoubleClick={enterPathEditMode}
            onKeyDown={(event) => {
              if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "l"
              ) {
                event.preventDefault();
                enterPathEditMode();
              }
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              disabled={!parentPath && directoryPath === ""}
              onClick={(event) => {
                event.preventDefault();
                onNavigateToDirectory(parentPath ?? "");
              }}
              aria-label="上级目录"
            >
              <ArrowUp className="size-4" />
            </Button>
            {editingPath ? (
              <div
                className="flex min-w-0 flex-1 items-center"
                data-file-manager-path-edit-mode
              >
                <input
                  ref={pathInputRef}
                  value={pathInput}
                  onFocus={onPathInputFocus}
                  onBlur={onPathInputBlur}
                  onChange={(event) => onPathInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && pathSuggestions.length) {
                      event.preventDefault();
                      onPathSuggestionActiveChange(
                        Math.min(
                          pathSuggestions.length - 1,
                          activePathSuggestionIndex + 1,
                        ),
                      );
                      return;
                    }
                    if (event.key === "ArrowUp" && pathSuggestions.length) {
                      event.preventDefault();
                      onPathSuggestionActiveChange(
                        Math.max(0, activePathSuggestionIndex - 1),
                      );
                      return;
                    }
                    if (event.key === "Tab" && activeSuggestion) {
                      event.preventDefault();
                      onPathInputChange(activeSuggestion.label);
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const typedPath = pathInput.trim();
                      if (
                        pathSuggestionsOpen &&
                        activeSuggestion &&
                        (activeSuggestion.label === typedPath ||
                          activeSuggestion.directoryPath === typedPath)
                      ) {
                        onAcceptPathSuggestion(activeSuggestion);
                      } else {
                        onPathInputJump();
                      }
                      exitPathEditMode();
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      onPathInputRestore();
                      exitPathEditMode();
                    }
                  }}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={
                    pathSuggestionsOpen && pathSuggestions.length > 0
                  }
                  aria-controls={suggestionListId}
                  aria-activedescendant={activeSuggestionId}
                  className="min-w-[120px] flex-1 bg-transparent font-mono text-xs text-ink-strong outline-none sm:min-w-[220px]"
                  placeholder="输入路径，Enter 跳转"
                  title="输入任意绝对路径；Enter 跳转；↑↓ 选择建议；Tab 补全；Esc 返回面包屑"
                  aria-label="编辑文件夹路径，按 Enter 跳转"
                  data-file-manager-path-input
                />
              </div>
            ) : (
              <div
                className="flex min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain whitespace-nowrap"
                data-file-manager-path-breadcrumb-mode
              >
                <button
                  type="button"
                  onClick={() => onNavigateToDirectory("")}
                  className="inline-flex shrink-0 rounded-md px-1.5 py-1 font-medium text-muted hover:bg-panel-2 hover:text-primary"
                  title="跳转到 root"
                >
                  root
                </button>
                {visibleBreadcrumbs.map((crumb) => (
                  <React.Fragment key={crumb.path || crumb.label}>
                    <ChevronRight className="size-3.5 shrink-0 text-subtle" />
                    {crumb.collapsed ? (
                      <span
                        className="inline-flex shrink-0 rounded-md px-1.5 py-1 font-semibold text-subtle"
                        title="中间路径已省略，可点击输入路径查看完整路径"
                        aria-label="中间路径已省略"
                        data-file-manager-path-ellipsis
                      >
                        …
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigateToDirectory(crumb.path)}
                        className={cn(
                          "inline-flex max-w-[96px] shrink truncate rounded-md px-1.5 py-1 hover:bg-panel-2 hover:text-primary md:max-w-[150px]",
                          crumb.path === directoryPath &&
                            "font-semibold text-primary",
                        )}
                        title={crumb.path || "root"}
                      >
                        {crumb.label}
                      </button>
                    )}
                  </React.Fragment>
                ))}
                <input
                  readOnly
                  value={displayPath}
                  onFocus={enterPathEditMode}
                  onClick={enterPathEditMode}
                  className="ml-1 min-w-[220px] flex-1 rounded-md bg-transparent px-1.5 py-1 font-mono text-2xs text-subtle outline-none hover:bg-panel-2 hover:text-primary sm:hidden"
                  title="点击输入路径，或按 Ctrl/⌘+L"
                  aria-label="编辑文件夹路径，按 Enter 跳转"
                  data-file-manager-path-input
                  data-file-manager-mobile-path-input-proxy
                />
                <button
                  type="button"
                  onClick={enterPathEditMode}
                  className="ml-1 hidden min-w-[32px] flex-1 rounded-md px-1.5 py-1 text-left font-mono text-2xs text-subtle hover:bg-panel-2 hover:text-primary sm:inline-flex"
                  title="点击输入路径，或按 Ctrl/⌘+L"
                  aria-label="输入路径跳转"
                  data-file-manager-path-enter-edit
                >
                  输入路径
                </button>
              </div>
            )}
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCopyCurrentPath}
              className="hidden rounded p-1 text-subtle hover:bg-panel-2 hover:text-primary sm:inline-flex"
              title="复制当前路径"
              aria-label="复制当前路径"
              data-file-manager-copy-current-path
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onToggleFavoriteCurrent}
              className={cn(
                "hidden rounded p-1 text-subtle hover:bg-panel-2 hover:text-primary sm:inline-flex",
                currentLocationFavorited && "text-primary",
              )}
              title={
                currentLocationFavorited ? "取消收藏当前位置" : "收藏当前位置"
              }
              aria-label={
                currentLocationFavorited ? "取消收藏当前位置" : "收藏当前位置"
              }
            >
              <Star
                className={cn(
                  "size-3.5",
                  currentLocationFavorited && "fill-current",
                )}
              />
            </button>
          </div>
          {editingPath && pathSuggestionsOpen && pathSuggestions.length ? (
            <div
              id={suggestionListId}
              role="listbox"
              aria-label="路径建议"
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-md border border-line bg-panel shadow-lg"
              data-file-manager-path-suggestion-listbox
            >
              {pathSuggestions.map((suggestion, index) => (
                <button
                  id={`${suggestionListId}-option-${index}`}
                  key={`suggestion:${suggestion.rootId}:${suggestion.directoryPath}:${suggestion.label}`}
                  type="button"
                  role="option"
                  aria-selected={index === activePathSuggestionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => onPathSuggestionActiveChange(index)}
                  onClick={() => {
                    onAcceptPathSuggestion(suggestion);
                    exitPathEditMode();
                  }}
                  className={cn(
                    "grid w-full grid-cols-[90px_minmax(0,1fr)] gap-2 px-3 py-2 text-left text-xs hover:bg-primary-soft",
                    index === activePathSuggestionIndex &&
                      "bg-primary-soft text-primary",
                  )}
                >
                  <span className="text-subtle">路径建议</span>
                  <span className="truncate font-mono text-ink-strong">
                    {suggestion.label}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {filterText ? (
          <div
            className="flex min-w-0 items-center"
            data-file-manager-visible-filter-actions
          >
            <span className="min-w-0 truncate rounded-full border border-line bg-panel-2 px-2 py-1 text-2xs text-subtle">
              当前筛选：{filterText}
            </span>
          </div>
        ) : null}
        <div
          className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs xl:justify-end"
          data-file-manager-quick-locations
        >
          <FavoriteBookmarkManager
            favoriteTree={favoriteTree}
            favoriteCount={favoriteCount}
            currentLocation={currentLocation}
            onOpenFavoriteItem={onOpenFavoriteItem}
            onAddFavoriteFolder={onAddFavoriteFolder}
            onAddCurrentFavoriteToFolder={onAddCurrentFavoriteToFolder}
            onRenameFavoriteItem={onRenameFavoriteItem}
            onRemoveFavoriteItem={onRemoveFavoriteItem}
            onMoveFavoriteItem={onMoveFavoriteItem}
          />

          {recentLocations.length ? (
            <details className="relative" data-file-manager-recent-locations>
              <summary className="cursor-pointer list-none rounded-full border border-line bg-panel px-2 py-1 font-medium text-muted marker:hidden hover:border-primary-line hover:text-primary">
                最近 · {recentLocations.length}
              </summary>
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 grid max-h-[min(62dvh,520px)] w-[min(520px,calc(100vw-2rem))] gap-1 overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-lg">
                {recentLocations.slice(0, 8).map((location) => (
                  <button
                    key={`recent:${location.rootId}:${location.directoryPath}`}
                    type="button"
                    onClick={() => onNavigateToLocation(location)}
                    title={location.label}
                    className="min-w-0 truncate rounded-md px-2 py-1 text-left text-muted hover:bg-panel-2 hover:text-primary"
                  >
                    {location.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onClearRecentLocations}
                  className="rounded-md px-2 py-1 text-left text-danger hover:bg-danger/10"
                  data-file-manager-clear-recent-locations
                >
                  清空最近
                </button>
              </div>
            </details>
          ) : null}
        </div>{" "}
      </div>

      <details
        className="group rounded-md border border-line bg-panel sm:contents"
        data-file-manager-filter-row
        data-file-manager-mobile-filter-dock
      >
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-ink-strong marker:hidden sm:hidden">
          <span className="inline-flex min-w-0 items-center gap-2">
            <Search className="size-4 shrink-0 text-subtle" />
            <span>筛选当前目录</span>
          </span>
          <span className="min-w-0 truncate text-right text-2xs text-subtle">
            {filterText
              ? `关键词：${filterText}`
              : showHidden
                ? "包含隐藏文件"
                : "搜索 / 隐藏文件"}
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-subtle transition-transform group-open:rotate-90" />
        </summary>
        <div
          className="hidden min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-t border-line p-2 group-open:grid sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:border-0 sm:p-0 xl:contents"
          data-file-manager-filter-controls
        >
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input
              ref={filterInputRef}
              value={filterText}
              onChange={(event) => onFilterTextChange(event.target.value)}
              placeholder="搜索当前目录"
              className="h-9 pl-9 text-sm sm:h-10"
            />
          </label>

          <span className="hidden sm:inline-flex" aria-hidden="true" />
        </div>
      </details>
    </div>
  );
}
