import * as React from "react";
import { FilePlus } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { useFilesSummaryQuery } from "@/lib/query/files";

import { FileActionsMenu, type FileActionsMenuTarget } from "@/features/files/FileActionsMenu";
import { FileTree } from "@/features/files/FileTree";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface IdeExplorerProps {
  /** Root id the explorer is scoped to. */
  rootId: string;
  /** Currently selected file path (rendered as highlighted in the tree). */
  selectedPath?: string;
  /** Fired when a file row is activated (click / Enter). */
  onSelectFile?: (path: string) => void;
  /** Fired when the user picks a different root in the header selector. */
  onChangeRoot?: (rootId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `IdeExplorer` — the file manager shown in the IDE side panel when the Files
 * activity is active. It composes the reusable Phase 1 file core
 * ({@link FileTree} + {@link FileActionsMenu}) and adds:
 *
 *  - a compact header with a root `<select>` (sourced from the files summary
 *    roster) and a "新建" button that opens the new-file flow on the current
 *    directory;
 *  - wiring between the tree's `onSelect` / `onContextMenu` seams and the
 *    {@link FileActionsMenu}, including a background right-click that targets
 *    the root (target=null).
 *
 * The component owns NO open-file state — it calls {@link IdeExplorerProps.onSelectFile}
 * and the parent (IdeShell) is responsible for threading the result to the
 * editor area. This keeps the explorer presentation-only w.r.t. selection.
 *
 * Aurora design: `@/design/ui/*`, lucide icons, same chrome as the rest of the
 * IDE side panels.
 */
export function IdeExplorer({
  rootId,
  selectedPath,
  onSelectFile,
  onChangeRoot,
}: IdeExplorerProps) {
  const summary = useFilesSummaryQuery();
  const roots = summary.data?.roots ?? [];

  // Context-menu state. `target` is null when the background was clicked.
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    target: FileActionsMenuTarget | null;
  } | null>(null);

  const openMenu = React.useCallback(
    (
      x: number,
      y: number,
      target: FileActionsMenuTarget | null,
    ) => {
      setMenu({ x, y, target });
    },
    [],
  );

  const closeMenu = React.useCallback(() => setMenu(null), []);

  // The "新建" button always operates on the root dir (no per-row context).
  const onNewFile = React.useCallback(() => {
    if (!rootId) return;
    // Anchor near the button — pick a sane spot top-left of the panel area.
    openMenu(16, 48, null);
  }, [rootId, openMenu]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-col"
      onContextMenu={(e) => {
        // Background right-click (the event reaches here only when not
        // stopped by a row handler). Prevent the browser menu and open the
        // FileActionsMenu targeting root.
        e.preventDefault();
        openMenu(e.clientX, e.clientY, null);
      }}
    >
      {/* Header: root selector + 新建 button */}
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2.5">
        <RootSelector
          rootId={rootId}
          roots={roots}
          onChange={onChangeRoot}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-2xs"
          disabled={!rootId}
          onClick={onNewFile}
          title="新建文件"
        >
          <FilePlus className="size-3.5" />
          新建
        </Button>
      </header>

      {/* Body: the reusable tree */}
      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-2">
        {rootId ? (
          <FileTree
            rootId={rootId}
            selectedPath={selectedPath}
            onSelect={(path, entry) => {
              if (entry.kind === "file") onSelectFile?.(path);
            }}
            onContextMenu={(e, path, entry) => {
              e.preventDefault();
              e.stopPropagation();
              openMenu(e.clientX, e.clientY, {
                path,
                name: entry.name,
                kind: entry.kind,
              });
            }}
          />
        ) : (
          <p className="px-2 py-6 text-center text-sm text-muted">
            无可用文件根目录
          </p>
        )}
      </div>

      {/* Context menu (controlled) */}
      {menu && (
        <FileActionsMenu
          open
          x={menu.x}
          y={menu.y}
          rootId={rootId}
          target={menu.target}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RootSelector — small <select> over the summary roots
// ---------------------------------------------------------------------------

interface RootSelectorProps {
  rootId: string;
  roots: { id: string; labelZh: string; labelEn: string }[];
  onChange?: (rootId: string) => void;
}

function RootSelector({ rootId, roots, onChange }: RootSelectorProps) {
  if (roots.length === 0) {
    return (
      <span className="text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
        资源管理器
      </span>
    );
  }

  const current = roots.find((r) => r.id === rootId);

  return (
    <label className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
        资源管理器
      </span>
      <select
        value={rootId}
        disabled={!onChange}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "min-w-0 max-w-[140px] truncate rounded-sm border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-ink outline-none",
          "focus-visible:shadow-[var(--ring)]",
          !onChange && "cursor-default opacity-80",
        )}
        title={current ? `${current.labelZh} (${current.labelEn})` : rootId}
      >
        {roots.map((r) => (
          <option key={r.id} value={r.id}>
            {r.labelZh || r.labelEn || r.id}
          </option>
        ))}
      </select>
    </label>
  );
}

export default IdeExplorer;
