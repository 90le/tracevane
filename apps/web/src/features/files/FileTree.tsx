import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Home,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { useFilesBrowseQuery } from "@/lib/query/files";

import type { FileBreadcrumb, FileEntryKind } from "./types";

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
  /** Currently selected file/dir path (rendered as highlighted). */
  selectedPath?: string;
  /** Fired when a file (not a directory) row is clicked or Enter-pressed. */
  onSelect?: (
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
}

/**
 * `FileTree` — a reusable, lazy, presentation-only file-tree widget.
 *
 * Consumed by the Workspace IDE Explorer (Task 1.x) now and by the future full
 * `/files` manager. It performs NO mutations: expand/collapse/select only. The
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
  selectedPath,
  onSelect,
  onContextMenu,
}: FileTreeProps) {
  // Expanded directory paths (root path "" is always expanded by default).
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set([""]));
  // Path that owns the breadcrumb (defaults to root).
  const [focusedPath, setFocusedPath] = React.useState<string>("");
  // Keyboard focus path; null until first ArrowUp/Down.
  const [kbFocusPath, setKbFocusPath] = React.useState<string | null>(null);

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
          } else {
            onSelect?.(row.path, { name: row.name, kind: "file" });
          }
          break;
        }
        default:
          return;
      }
    },
    [expanded, kbFocusPath, onSelect, toggle],
  );

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label="文件树"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="grid min-w-0 content-start gap-2 outline-none"
    >
      <Breadcrumb
        focusedPath={focusedPath}
        onNavigate={setFocusedPath}
      />
      <DirNode
        rootId={rootId}
        path=""
        depth={0}
        expanded={expanded}
        focusedPath={focusedPath}
        kbFocusPath={kbFocusPath}
        selectedPath={selectedPath}
        onToggle={toggle}
        onFocusPath={setFocusedPath}
        onKbFocus={setKbFocusPath}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
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
  expanded: Set<string>;
  focusedPath: string;
  kbFocusPath: string | null;
  selectedPath?: string;
  onToggle: (path: string) => void;
  onFocusPath: (path: string) => void;
  onKbFocus: (path: string) => void;
  onSelect?: FileTreeProps["onSelect"];
  onContextMenu?: FileTreeProps["onContextMenu"];
}

function DirNode(props: DirNodeProps) {
  const { rootId, path } = props;
  const query = useFilesBrowseQuery(
    rootId ? { rootId, path, hidden: false, pageSize: 500 } : null,
  );

  const isExpanded = props.expanded.has(path);

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
        kbFocused={props.kbFocusPath === path}
        onActivate={() => {
          props.onToggle(path);
          props.onFocusPath(path);
        }}
        onKbFocus={() => props.onKbFocus(path)}
        onContextMenu={props.onContextMenu}
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
          ) : query.data && query.data.entries.length === 0 ? (
            <EmptyState
              className="px-2 py-6"
              title="空目录"
              description="该目录没有可显示的条目。"
              icon={<Folder />}
            />
          ) : (
            query.data?.entries.map((entry) => {
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
                  kbFocused={props.kbFocusPath === entry.path}
                  onActivate={() =>
                    props.onSelect?.(entry.path, {
                      name: entry.name,
                      kind: "file",
                    })
                  }
                  onKbFocus={() => props.onKbFocus(entry.path)}
                  onContextMenu={props.onContextMenu}
                />
              );
            })
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
  kbFocused: boolean;
  onActivate: () => void;
  onKbFocus: () => void;
  onContextMenu?: FileTreeProps["onContextMenu"];
}

const Row = React.memo(function Row({
  name,
  path,
  kind,
  depth,
  expanded,
  selected,
  kbFocused,
  onActivate,
  onKbFocus,
  onContextMenu,
}: RowProps) {
  const isDir = kind === "directory";
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={selected}
      data-tree-path={path}
      data-tree-kind={kind}
      title={path}
      tabIndex={-1}
      onClick={onActivate}
      onFocus={onKbFocus}
      onContextMenu={
        onContextMenu
          ? (e) => onContextMenu(e, path, { name, kind })
          : undefined
      }
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      className={cn(
        "flex items-center gap-1.5 rounded-sm pr-2 py-1 text-left text-sm outline-none transition-colors",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        "focus-visible:shadow-[var(--ring)]",
        selected
          ? "bg-primary-soft text-ink-strong"
          : "text-muted hover:bg-panel-2 hover:text-ink",
        kbFocused && !selected && "ring-1 ring-[var(--ring)]",
      )}
    >
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
        <File />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Breadcrumb of the focused path
// ---------------------------------------------------------------------------

interface BreadcrumbProps {
  focusedPath: string;
  onNavigate: (path: string) => void;
}

function Breadcrumb({ focusedPath, onNavigate }: BreadcrumbProps) {
  const crumbs = React.useMemo<FileBreadcrumb[]>(() => {
    if (!focusedPath) return [];
    const parts = focusedPath.split("/").filter(Boolean);
    const acc: FileBreadcrumb[] = [];
    let running = "";
    for (const p of parts) {
      running = running ? `${running}/${p}` : p;
      acc.push({ path: running, label: p });
    }
    return acc;
  }, [focusedPath]);

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-sm border border-line bg-panel-2 px-2 py-1.5 text-xs text-muted"
      aria-label="当前路径"
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-panel-3 hover:text-ink [&_svg]:size-3"
        onClick={() => onNavigate("")}
      >
        <Home />
        root
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
