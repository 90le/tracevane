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
  FolderPlus,
  HardDrive,
  History,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Star,
  Upload,
  MoreHorizontal,
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
}

export interface FileManagerQuickLocation extends FileManagerLocation {
  favorited: boolean;
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
        <span className="font-semibold text-ink-strong">
          文件管理器
        </span>
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

function compactBreadcrumbs(breadcrumbs: FileBreadcrumb[]): CompactBreadcrumb[] {
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
  favoriteLocations: FileManagerQuickLocation[];
  recentLocations: FileManagerQuickLocation[];
  filterText: string;
  showHidden: boolean;
  currentLocationFavorited: boolean;
  onNavigateToDirectory: (path: string) => void;
  onNavigateToLocation: (location: FileManagerLocation) => void;
  onPathInputFocus: () => void;
  onPathInputBlur: () => void;
  onPathInputChange: (value: string) => void;
  onPathInputJump: () => void;
  onPathInputRestore: () => void;
  onCopyCurrentPath: () => void;
  onPathSuggestionActiveChange: (index: number) => void;
  onAcceptPathSuggestion: (location: FileManagerLocation) => void;
  onToggleFavoriteCurrent: () => void;
  onRemoveFavoriteLocation: (location: FileManagerLocation) => void;
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
  currentLocation?: FileManagerLocation;
}

function tabKey(location: Pick<FileManagerLocation, "rootId" | "directoryPath">): string {
  return `${location.rootId}:${location.directoryPath}`;
}

function locationShortLabel(location: FileManagerLocation): string {
  const label = location.label || location.directoryPath || location.rootId;
  const parts = label.split("/").filter(Boolean);
  return parts.at(-1) ?? label ?? "root";
}

function buildDirectoryTabs({
  currentLocation,
  favoriteLocations,
  recentLocations,
}: {
  currentLocation?: FileManagerLocation;
  favoriteLocations: FileManagerQuickLocation[];
  recentLocations: FileManagerQuickLocation[];
}): FileManagerQuickLocation[] {
  const tabs: FileManagerQuickLocation[] = [];
  const seen = new Set<string>();
  const push = (location: FileManagerQuickLocation | undefined) => {
    if (!location) return;
    const key = tabKey(location);
    if (seen.has(key)) return;
    seen.add(key);
    tabs.push(location);
  };
  push(currentLocation ? { ...currentLocation, favorited: false } : undefined);
  favoriteLocations.forEach(push);
  recentLocations.forEach(push);
  return tabs.slice(0, 7);
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
  favoriteLocations,
  recentLocations,
  filterText,
  showHidden,
  currentLocationFavorited,
  onNavigateToDirectory,
  onNavigateToLocation,
  onPathInputFocus,
  onPathInputBlur,
  onPathInputChange,
  onPathInputJump,
  onPathInputRestore,
  onCopyCurrentPath,
  onPathSuggestionActiveChange,
  onAcceptPathSuggestion,
  onToggleFavoriteCurrent,
  onRemoveFavoriteLocation,
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
  const directoryTabs = React.useMemo(
    () =>
      buildDirectoryTabs({
        currentLocation,
        favoriteLocations,
        recentLocations,
      }),
    [currentLocation, favoriteLocations, recentLocations],
  );

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
          const active =
            currentLocation &&
            location.rootId === currentLocation.rootId &&
            location.directoryPath === currentLocation.directoryPath;
          return (
            <button
              key={`directory-tab:${location.rootId}:${location.directoryPath}`}
              type="button"
              role="tab"
              aria-selected={Boolean(active)}
              onClick={() => onNavigateToLocation(location)}
              title={location.label}
              className={cn(
                "inline-flex h-9 max-w-[240px] shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 text-xs transition-colors",
                active
                  ? "border-line bg-panel font-semibold text-primary shadow-sm"
                  : "border-transparent bg-panel-3/60 text-muted hover:border-line hover:bg-panel hover:text-ink-strong",
              )}
              data-file-manager-directory-tab={active ? "active" : "inactive"}
            >
              <Folder className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{locationShortLabel(location)}</span>
              {location.favorited ? (
                <Star className="size-3 shrink-0 fill-current text-primary" />
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-t-md border border-b-0 border-line bg-panel px-2 text-xs text-muted hover:text-primary"
          onClick={onToggleFavoriteCurrent}
          aria-pressed={currentLocationFavorited}
          title={currentLocationFavorited ? "取消收藏当前目录" : "收藏当前目录为标签"}
          data-file-manager-directory-tab-pin
        >
          <Plus className="size-3.5" />
          收藏标签
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
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
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
                  aria-expanded={pathSuggestionsOpen && pathSuggestions.length > 0}
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
          className="hidden min-w-0 flex-wrap items-center gap-1.5 text-xs xl:flex"
          data-file-manager-quick-locations
        >
          <span className="mr-1 flex items-center gap-1 text-subtle">
            <History className="size-3.5" />
            快速访问
          </span>
          {favoriteLocations.length ? (
            <span
              className="inline-flex items-center gap-1"
              data-file-manager-favorite-locations
            >
              <span className="rounded-full bg-primary-soft px-2 py-1 font-medium text-primary">
                收藏
              </span>
              {favoriteLocations.map((location) => (
                <span
                  key={`favorite:${location.rootId}:${location.directoryPath}`}
                  className="inline-flex max-w-[220px] items-center overflow-hidden rounded-full border border-primary-line bg-panel text-primary hover:bg-primary-soft"
                >
                  <button
                    type="button"
                    onClick={() => onNavigateToLocation(location)}
                    title={location.label}
                    className="min-w-0 truncate px-2 py-1"
                  >
                    {location.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveFavoriteLocation(location)}
                    className="border-l border-primary-line px-1.5 py-1 text-subtle hover:text-danger"
                    title="移除收藏"
                    aria-label={`移除收藏 ${location.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
          ) : null}
          {recentLocations.length ? (
            <span
              className="inline-flex items-center gap-1"
              data-file-manager-recent-locations
            >
              <span className="rounded-full bg-panel-2 px-2 py-1 font-medium text-muted">
                最近
              </span>
              {recentLocations.map((location) => (
                <button
                  key={`recent:${location.rootId}:${location.directoryPath}`}
                  type="button"
                  onClick={() => onNavigateToLocation(location)}
                  title={location.label}
                  className="max-w-[220px] truncate rounded-full border border-line bg-panel px-2 py-1 text-muted hover:border-primary-line hover:bg-primary-soft hover:text-primary"
                >
                  {location.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onClearRecentLocations}
                className="rounded-full px-2 py-1 text-subtle hover:bg-panel-2 hover:text-danger"
                title="清空最近路径"
                aria-label="清空最近路径"
                data-file-manager-clear-recent-locations
              >
                清空最近
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="hidden min-w-0 items-center gap-1.5 overflow-x-auto xl:flex"
        data-file-manager-desktop-quick-actions
      >
        <Button variant="outline" size="sm" className="h-9 shrink-0 px-2 text-xs" onClick={onUpload} disabled={!rootId}>
          <Upload className="size-3.5" /> 上传
        </Button>
        <Button variant="outline" size="sm" className="h-9 shrink-0 px-2 text-xs" onClick={onNewDirectory} disabled={!rootId}>
          <FolderPlus className="size-3.5" /> 新目录
        </Button>
        <Button variant="outline" size="sm" className="h-9 shrink-0 px-2 text-xs" onClick={onNewFile} disabled={!rootId}>
          <FilePlus className="size-3.5" /> 新文件
        </Button>
        <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2 text-xs" onClick={() => filterInputRef?.current?.focus()}>
          <Search className="size-3.5" /> 内容筛选
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-9 shrink-0 px-2 text-xs", showHidden && "bg-primary-soft text-primary")}
          onClick={onToggleShowHidden}
          aria-pressed={showHidden}
        >
          {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          隐藏文件
        </Button>
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
