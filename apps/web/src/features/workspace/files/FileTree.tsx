import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import FileTypeIcon from "@/features/file-manager/FileTypeIcon";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { useFilesBrowseQuery } from "@/lib/query/files";

import type { FileBreadcrumb, FileEntryKind, FileEntrySummary } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FileTreeEntry {
  name: string;
  kind: FileEntryKind;
}

export interface FileTreeProps {
  /** Root id the tree is scoped to (resolves summary/roots server-side). */
  rootId: string;
  /** Include dotfiles / hidden entries. */
  showHidden?: boolean;
  /** Currently selected file/dir path (rendered as highlighted). */
  selectedPath?: string;
  /** Checked paths for PC-style multi-select bulk operations. */
  checkedPaths?: Set<string>;
  /** Toggle a path in the multi-select set. Selection is independent from focus/open. */
  onToggleChecked?: (
    path: string,
    entry: { name: string; kind: FileEntryKind },
  ) => void;
  /** Fired when a row is single-clicked/focused for selection only. */
  onSelect?: (
    path: string,
    entry: { name: string; kind: FileEntryKind },
  ) => void;
  /** Fired when a row is explicitly opened (double-click or Enter). */
  onOpen?: (
    path: string,
    entry: { name: string; kind: FileEntryKind },
  ) => void;
  /** Fired whenever the focused directory changes (breadcrumb/upload target). */
  onDirectoryFocus?: (path: string) => void;
  /** Fired whenever the keyboard/row focus moves to an actionable file-tree item. */
  onActiveEntryChange?: (
    path: string,
    entry: { name: string; kind: FileEntryKind },
  ) => void;
  /**
   * Fired on right-click of any row. The menu itself is the caller's
   * responsibility (Task 1.3) — this component only forwards the event +
   * entry coordinates.
   */
  onContextMenu?: (
    e: React.MouseEvent,
    path: string,
    entry: { name: string; kind: FileEntryKind },
  ) => void;
  /** Directory rendered as the file-tree root (IDE "open folder" semantics). */
  basePath?: string;
  /** External directory focus, used by address-bar jumps/default workspace dir. */
  focusedPath?: string;
  /** Absolute root path for drag-to-terminal payloads. */
  rootAbsolutePath?: string;
  /** Hide internal breadcrumb when the owning shell provides a richer address bar. */
  showBreadcrumb?: boolean;
}

/**
 * `FileTree` — a reusable, lazy, presentation-only file-tree widget.
 *
 * Consumed by the Workspace Explorer and File Manager. It performs NO mutations: expand/collapse/select only. The
 * optional {@link FileTreeProps.onContextMenu} callback is the single seam
 * through which Task 1.3 will attach the right-click action menu.
 *
 * Each expanded directory issues its own `useFilesBrowseQuery` (root is
 * expanded by default). Loading → Skeleton rows, empty dir → EmptyState,
 * error → ErrorState with a Retry action. Keyboard navigation walks the flat
 * list of visible rows (ArrowUp/Down), expands/enters dirs (ArrowRight),
 * collapses/ascends (ArrowLeft), and selects files (Enter).
 *
 * Aurora design language: `@/design/ui/*` + `@/shared/states/*`, lucide icons
 * `Folder` / `FolderOpen` / `File` keyed off `entry.kind`.
 */
export function FileTree({
  rootId,
  showHidden = false,
  selectedPath,
  onSelect,
  onOpen,
  onDirectoryFocus,
  onActiveEntryChange,
  onContextMenu,
  checkedPaths,
  onToggleChecked,
  basePath = "",
  focusedPath: controlledFocusedPath,
  rootAbsolutePath,
  showBreadcrumb = true,
}: FileTreeProps) {
  // Expanded directory paths. `basePath` is the IDE-opened folder root.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set([basePath]));
  // Path that owns the breadcrumb (defaults to the opened folder root).
  const [focusedPath, setFocusedPath] = React.useState<string>(basePath);
  // Keyboard focus path; null until first ArrowUp/Down.
  const [kbFocusPath, setKbFocusPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFocusedPath(basePath);
    setExpanded(new Set([basePath]));
  }, [basePath]);

  React.useEffect(() => {
    if (controlledFocusedPath == null) return;
    setFocusedPath(controlledFocusedPath);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(basePath);
      for (const ancestor of ancestorsOf(controlledFocusedPath)) next.add(ancestor);
      if (controlledFocusedPath) next.add(controlledFocusedPath);
      return next;
    });
  }, [basePath, controlledFocusedPath]);

  React.useEffect(() => {
    onDirectoryFocus?.(focusedPath);
  }, [focusedPath, onDirectoryFocus]);

  const toggle = React.useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keyboard handler — operates on the flat visible rows list gathered below.
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const rows = collectVisibleRows(containerRef.current);
      if (rows.length === 0) return;
      const currentIndex =
        kbFocusPath != null
          ? rows.findIndex((r) => r.path === kbFocusPath)
          : -1;

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const nextIdx =
            currentIndex < 0 ? 0 : Math.min(currentIndex + 1, rows.length - 1);
          setKbFocusPath(rows[nextIdx].path);
          rows[nextIdx].el?.focus();
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          const nextIdx =
            currentIndex <= 0
              ? 0
              : Math.max(currentIndex - 1, 0);
          setKbFocusPath(rows[nextIdx].path);
          rows[nextIdx].el?.focus();
          break;
        }
        case "ArrowRight": {
          const row = currentIndex >= 0 ? rows[currentIndex] : null;
          if (row?.kind === "directory" && !expanded.has(row.path)) {
            event.preventDefault();
            setExpanded((prev) => new Set(prev).add(row.path));
            setFocusedPath(row.path);
          } else if (row?.kind === "directory") {
            // already expanded → step into first child if any
            event.preventDefault();
            setFocusedPath(row.path);
            const childIdx = currentIndex + 1;
            if (childIdx < rows.length) {
              setKbFocusPath(rows[childIdx].path);
              rows[childIdx].el?.focus();
            }
          }
          break;
        }
        case "ArrowLeft": {
          const row = currentIndex >= 0 ? rows[currentIndex] : null;
          if (row?.kind === "directory" && expanded.has(row.path)) {
            event.preventDefault();
            setExpanded((prev) => {
              const next = new Set(prev);
              next.delete(row.path);
              return next;
            });
          } else if (row) {
            // ascend to parent dir if known
            const parent = parentOf(row.path);
            if (parent != null) {
              event.preventDefault();
              setKbFocusPath(parent);
              setFocusedPath(parentOf(parent) ?? parent);
              const parentEl = rows.find((r) => r.path === parent)?.el;
              parentEl?.focus();
            }
          }
          break;
        }
        case "Enter": {
          const row = currentIndex >= 0 ? rows[currentIndex] : null;
          if (!row) return;
          event.preventDefault();
          if (row.kind === "directory") {
            toggle(row.path);
            onOpen?.(row.path, { name: row.name, kind: "directory" });
          } else {
            onOpen?.(row.path, { name: row.name, kind: "file" });
          }
          break;
        }
        case " ": {
          const row = currentIndex >= 0 ? rows[currentIndex] : null;
          if (!row || !onToggleChecked) return;
          event.preventDefault();
          onToggleChecked(row.path, { name: row.name, kind: row.kind });
          break;
        }
        default:
          return;
      }
    },
    [expanded, kbFocusPath, onOpen, onToggleChecked, toggle],
  );

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label="文件树"
      aria-multiselectable={onToggleChecked ? true : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="grid min-w-0 content-start gap-2 outline-none"
    >
      {showBreadcrumb ? (
        <Breadcrumb
          basePath={basePath}
          focusedPath={focusedPath}
          onNavigate={setFocusedPath}
        />
      ) : null}
      <DirNode
        rootId={rootId}
        path={basePath}
        depth={0}
        showHidden={showHidden}
        expanded={expanded}
        focusedPath={focusedPath}
        kbFocusPath={kbFocusPath}
        selectedPath={selectedPath}
        onToggle={toggle}
        onFocusPath={setFocusedPath}
        onKbFocus={setKbFocusPath}
        onActiveEntryChange={onActiveEntryChange}
        onSelect={onSelect}
        onOpen={onOpen}
        onContextMenu={onContextMenu}
        checkedPaths={checkedPaths}
        onToggleChecked={onToggleChecked}
        rootAbsolutePath={rootAbsolutePath}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directory node — owns its own lazy browse query, renders children
// ---------------------------------------------------------------------------

interface DirNodeProps {
  rootId: string;
  path: string;
  depth: number;
  showHidden: boolean;
  expanded: Set<string>;
  focusedPath: string;
  kbFocusPath: string | null;
  selectedPath?: string;
  onToggle: (path: string) => void;
  onFocusPath: (path: string) => void;
  onKbFocus: (path: string) => void;
  onActiveEntryChange?: FileTreeProps["onActiveEntryChange"];
  onSelect?: FileTreeProps["onSelect"];
  onOpen?: FileTreeProps["onOpen"];
  onContextMenu?: FileTreeProps["onContextMenu"];
  checkedPaths?: FileTreeProps["checkedPaths"];
  onToggleChecked?: FileTreeProps["onToggleChecked"];
  rootAbsolutePath?: string;
}

function DirNode(props: DirNodeProps) {
  const { rootId, path } = props;
  const pageSize = 200;
  const [page, setPage] = React.useState(1);
  const [renderLimit, setRenderLimit] = React.useState(300);
  const [entries, setEntries] = React.useState<FileEntrySummary[]>([]);
  const query = useFilesBrowseQuery(
    rootId ? { rootId, path, hidden: props.showHidden, page, pageSize } : null,
  );

  const isExpanded = props.expanded.has(path);

  React.useEffect(() => {
    setPage(1);
    setRenderLimit(300);
    setEntries([]);
  }, [rootId, path, props.showHidden]);

  React.useEffect(() => {
    if (!query.data) return;
    setEntries((prev) => {
      if (query.data.pagination.page <= 1) return query.data.entries;
      const seen = new Set(prev.map((entry) => entry.path));
      return [...prev, ...query.data.entries.filter((entry) => !seen.has(entry.path))];
    });
  }, [query.data]);
  const visibleEntries = React.useMemo(
    () => entries.slice(0, renderLimit),
    [entries, renderLimit],
  );

  // Render the dir's own header row (skipped at depth 0 — root has no name).
  const header =
    props.depth === 0 ? null : (
      <Row
        name={lastSegment(path)}
        path={path}
        kind="directory"
        depth={props.depth - 1}
        expanded={isExpanded}
        selected={props.selectedPath === path}
        checked={props.checkedPaths?.has(path) ?? false}
        kbFocused={props.kbFocusPath === path}
        onSelectRow={() => {
          props.onFocusPath(path);
          props.onActiveEntryChange?.(path, {
            name: lastSegment(path),
            kind: "directory",
          });
          props.onSelect?.(path, { name: lastSegment(path), kind: "directory" });
        }}
        onOpen={() => {
          props.onToggle(path);
          props.onFocusPath(path);
          props.onActiveEntryChange?.(path, {
            name: lastSegment(path),
            kind: "directory",
          });
          props.onOpen?.(path, { name: lastSegment(path), kind: "directory" });
        }}
        onKbFocus={() => {
          props.onKbFocus(path);
          props.onActiveEntryChange?.(path, {
            name: lastSegment(path),
            kind: "directory",
          });
        }}
        onContextMenu={props.onContextMenu}
        onToggleChecked={props.onToggleChecked}
        absolutePath={absolutePathFor(props.rootAbsolutePath, path)}
      />
    );

  return (
    <>
      {header}
      {isExpanded && (
        <div className="grid content-start">
          {query.isLoading ? (
            <LoadingRows depth={props.depth} />
          ) : query.error ? (
            <ErrorState
              className="px-2 py-6"
              title="无法读取目录"
              description={query.error.message}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void query.refetch()}
                >
                  重试
                </Button>
              }
            />
          ) : query.data && entries.length === 0 ? (
            <EmptyState
              className="px-2 py-6"
              title="空目录"
              description="该目录没有可显示的条目。"
              icon={<Folder />}
            />
          ) : (
            <>
              {visibleEntries.map((entry) => {
                if (entry.kind === "directory") {
                  return (
                    <DirNode
                      key={entry.path}
                      {...props}
                      path={entry.path}
                      depth={props.depth + 1}
                    />
                  );
                }
                return (
                  <Row
                    key={entry.path}
                    name={entry.name}
                    path={entry.path}
                    kind="file"
                    depth={props.depth}
                    expanded={false}
                    selected={props.selectedPath === entry.path}
                    checked={props.checkedPaths?.has(entry.path) ?? false}
                    kbFocused={props.kbFocusPath === entry.path}
                    onSelectRow={() => {
                      props.onActiveEntryChange?.(entry.path, {
                        name: entry.name,
                        kind: "file",
                      });
                      props.onSelect?.(entry.path, {
                        name: entry.name,
                        kind: "file",
                      });
                    }}
                    onOpen={() => {
                      props.onActiveEntryChange?.(entry.path, {
                        name: entry.name,
                        kind: "file",
                      });
                      props.onOpen?.(entry.path, {
                        name: entry.name,
                        kind: "file",
                      });
                    }}
                    onKbFocus={() => {
                      props.onKbFocus(entry.path);
                      props.onActiveEntryChange?.(entry.path, {
                        name: entry.name,
                        kind: "file",
                      });
                    }}
                    onContextMenu={props.onContextMenu}
                    onToggleChecked={props.onToggleChecked}
                    absolutePath={absolutePathFor(props.rootAbsolutePath, entry.path)}
                  />
                );
              })}
              {entries.length > visibleEntries.length ? (
                <button
                  type="button"
                  className="ml-2 mt-1 rounded-sm px-2 py-1 text-left text-xs text-primary hover:bg-primary-soft"
                  style={{ marginLeft: props.depth * 14 + 8 }}
                  onClick={() => setRenderLimit((value) => value + 300)}
                >
                  显示更多已加载（{visibleEntries.length}/{entries.length}）
                </button>
              ) : null}
              {query.data && query.data.pagination.page < query.data.pagination.totalPages ? (
                <button
                  type="button"
                  className="ml-2 mt-1 rounded-sm px-2 py-1 text-left text-xs text-primary hover:bg-primary-soft"
                  style={{ marginLeft: props.depth * 14 + 8 }}
                  disabled={query.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {query.isFetching ? "加载中..." : `加载更多（${entries.length}/${query.data.pagination.totalEntries}）`}
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Row — a single visible file/dir line
// ---------------------------------------------------------------------------

interface RowProps {
  name: string;
  path: string;
  kind: FileEntryKind;
  depth: number;
  expanded: boolean;
  selected: boolean;
  checked: boolean;
  kbFocused: boolean;
  onSelectRow: () => void;
  onOpen: () => void;
  onKbFocus: () => void;
  onContextMenu?: FileTreeProps["onContextMenu"];
  onToggleChecked?: FileTreeProps["onToggleChecked"];
  absolutePath?: string;
}

const Row = React.memo(function Row({
  name,
  path,
  kind,
  depth,
  expanded,
  selected,
  checked,
  kbFocused,
  onSelectRow,
  onOpen,
  onKbFocus,
  onContextMenu,
  onToggleChecked,
  absolutePath,
}: RowProps) {
  const isDir = kind === "directory";
  const longPressRef = React.useRef<{
    timer: number;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const clearLongPressTimer = React.useCallback(() => {
    const state = longPressRef.current;
    if (!state) return;
    window.clearTimeout(state.timer);
    longPressRef.current = null;
  }, []);
  const openContextMenuAt = React.useCallback(
    (clientX: number, clientY: number, event: React.SyntheticEvent) => {
      if (!onContextMenu) return;
      onSelectRow();
      onContextMenu(
        {
          preventDefault: () => event.preventDefault(),
          stopPropagation: () => event.stopPropagation(),
          clientX,
          clientY,
        } as React.MouseEvent,
        path,
        { name, kind },
      );
    },
    [kind, name, onContextMenu, onSelectRow, path],
  );
  React.useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  return (
    <div
      role="treeitem"
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={selected}
      aria-checked={onToggleChecked ? checked : undefined}
      data-tree-path={path}
      data-tree-kind={kind}
      data-tree-name={name}
      title={path}
      tabIndex={-1}
      onClick={onSelectRow}
      onDoubleClick={onOpen}
      onFocus={onKbFocus}
      draggable
      onPointerDown={
        onContextMenu
          ? (event) => {
              if (event.pointerType === "mouse") return;
              clearLongPressTimer();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              longPressRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                timer: window.setTimeout(() => {
                  openContextMenuAt(event.clientX, event.clientY, event);
                  longPressRef.current = null;
                }, 520),
              };
            }
          : undefined
      }
      onPointerMove={
        onContextMenu
          ? (event) => {
              const state = longPressRef.current;
              if (!state || state.pointerId !== event.pointerId) return;
              const moved = Math.hypot(event.clientX - state.x, event.clientY - state.y);
              if (moved > 12) clearLongPressTimer();
            }
          : undefined
      }
      onPointerUp={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onLostPointerCapture={clearLongPressTimer}
      onDragStart={(event) => {
        const absolute = absolutePath || path;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", shellQuotePath(absolute));
        event.dataTransfer.setData("application/x-tracevane-file-relative-path", path);
        event.dataTransfer.setData("application/x-tracevane-file-absolute-path", absolute);
      }}
      onContextMenu={
        onContextMenu
          ? (e) => onContextMenu(e, path, { name, kind })
          : undefined
      }
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      className={cn(
        "group flex items-center gap-1.5 rounded-sm pr-1 py-1 text-left text-sm outline-none transition-colors",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        "focus-visible:shadow-[var(--ring)]",
        checked
          ? "bg-primary-soft/70 text-ink-strong"
          : selected
            ? "bg-primary-soft text-ink-strong"
            : "text-muted hover:bg-panel-2 hover:text-ink",
        kbFocused && !selected && "ring-1 ring-[var(--ring)]",
      )}
    >
      {onToggleChecked ? (
        <input
          type="checkbox"
          checked={checked}
          aria-label={`选择 ${name}`}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggleChecked(path, { name, kind })}
          className="size-3.5 shrink-0 accent-primary"
        />
      ) : null}
      {isDir ? (
        expanded ? (
          <ChevronDown className="text-subtle" />
        ) : (
          <ChevronRight className="text-subtle" />
        )
      ) : (
        <span className="inline-block size-4 shrink-0" />
      )}
      {isDir ? (
        expanded ? (
          <FolderOpen />
        ) : (
          <Folder />
        )
      ) : (
        <FileTypeIcon entry={fileIconEntry(name, path, kind)} size="sm" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {onContextMenu ? (
        <button
          type="button"
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-sm text-muted outline-none transition-colors",
            "hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]",
            "opacity-100 md:opacity-0 md:group-hover:opacity-100",
          )}
          title="更多文件操作"
          aria-label={`更多文件操作 ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            openContextMenuAt(rect.right, rect.bottom, event);
          }}
          data-workspace-file-tree-row-more
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});


function fileIconEntry(name: string, path: string, kind: FileEntryKind): FileEntrySummary {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() || null : null;
  return {
    name,
    path,
    kind,
    ext,
    size: kind === "file" ? 0 : null,
    modifiedAt: null,
    textLike: false,
    imageLike: false,
    mode: "",
    permissions: "",
    uid: null,
    gid: null,
    hidden: name.startsWith("."),
  };
}

// ---------------------------------------------------------------------------
// Breadcrumb of the focused path
// ---------------------------------------------------------------------------

interface BreadcrumbProps {
  basePath: string;
  focusedPath: string;
  onNavigate: (path: string) => void;
}

function Breadcrumb({ basePath, focusedPath, onNavigate }: BreadcrumbProps) {
  const crumbs = React.useMemo<FileBreadcrumb[]>(() => {
    const relative = stripBasePath(focusedPath, basePath);
    if (!relative) return [];
    const parts = relative.split("/").filter(Boolean);
    const acc: FileBreadcrumb[] = [];
    let running = "";
    for (const p of parts) {
      running = running ? `${running}/${p}` : p;
      const path = basePath ? `${basePath}/${running}` : running;
      acc.push({ path, label: p });
    }
    return acc;
  }, [basePath, focusedPath]);

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-sm border border-line bg-panel-2 px-2 py-1.5 text-xs text-muted"
      aria-label="当前路径"
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-panel-3 hover:text-ink [&_svg]:size-3"
        onClick={() => onNavigate(basePath)}
      >
        <Home />
        {basePath ? lastSegment(basePath) : "root"}
      </button>
      {crumbs.map((bc) => (
        <React.Fragment key={bc.path}>
          <ChevronRight className="size-3 opacity-50" />
          <button
            type="button"
            className="truncate rounded-sm px-1 py-0.5 hover:bg-panel-3 hover:text-ink"
            onClick={() => onNavigate(bc.path)}
          >
            {bc.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LoadingRows({ depth }: { depth: number }) {
  return (
    <div
      className="grid gap-1 py-1"
      style={{ paddingLeft: `${depth * 14}px` }}
    >
      <Skeleton className="h-6" />
      <Skeleton className="h-6" />
      <Skeleton className="h-6" />
    </div>
  );
}

/** Last path segment, or "" for root. */
function lastSegment(path: string): string {
  if (!path) return "";
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/** Parent path ("" for top-level entries, null for root itself). */
function parentOf(path: string): string | null {
  if (path === "") return null;
  const idx = path.lastIndexOf("/");
  if (idx < 0) return "";
  return path.slice(0, idx);
}

function stripBasePath(path: string, basePath: string): string {
  if (!basePath) return path;
  if (path === basePath) return "";
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length + 1) : path;
}

function ancestorsOf(path: string): string[] {
  const ancestors: string[] = [];
  let current = parentOf(path);
  while (current != null) {
    ancestors.unshift(current);
    current = parentOf(current);
  }
  return ancestors;
}

function absolutePathFor(rootAbsolutePath: string | undefined, relativePath: string): string | undefined {
  if (!rootAbsolutePath) return undefined;
  const root = rootAbsolutePath.replace(/\/+$/, "");
  if (!relativePath) return root || "/";
  return `${root || ""}/${relativePath}`.replace(/\/+/g, "/");
}

function shellQuotePath(path: string): string {
  return `'${path.replace(/'/g, `'\''`)}'`;
}

interface VisibleRow {
  path: string;
  name: string;
  kind: FileEntryKind;
  el: HTMLElement | null;
}

/**
 * Walk the rendered tree DOM (data-tree-path attributes) to produce the flat
 * list of currently visible rows. Used for keyboard nav.
 */
function collectVisibleRows(root: HTMLElement | null): VisibleRow[] {
  if (!root) return [];
  const nodes = root.querySelectorAll<HTMLElement>(
    "[data-tree-path]",
  );
  const out: VisibleRow[] = [];
  nodes.forEach((el) => {
    const path = el.getAttribute("data-tree-path");
    const kind = el.getAttribute("data-tree-kind");
    if (!path || (kind !== "file" && kind !== "directory")) return;
    out.push({
      path,
      name: el.textContent?.trim() ?? path,
      kind,
      el,
    });
  });
  return out;
}

export default FileTree;
