import { FileCode, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EditorTabsProps {
  /** Ordered list of open file paths. */
  tabs: string[];
  /** Path of the active (focused) tab, if any. */
  active: string | null;
  /** Set of currently-dirty paths (edited, unsaved). */
  dirtyPaths: Set<string>;
  /** Path currently being saved (for saving indicator on its tab). */
  savingPath?: string | null;
  /** Select a tab (make it active). */
  onSelect: (path: string) => void;
  /** Close a tab. Parent decides whether to confirm (dirty guard). */
  onClose: (path: string) => void;
  /** Optional ARIA label for the tab strip. */
  "aria-label"?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Single tab strip for the editor area. Renders one tab per open path with:
 *  - active highlight (bottom border + stronger background)
 *  - dirty dot (unsaved changes) / saving spinner text
 *  - close button (clicking calls onClose; parent runs the dirty guard)
 *
 * The parent may render two `<EditorTabs />` instances when split is active
 * (one per pane). This keeps the component minimal — it does not own tab
 * selection state.
 */
export function EditorTabs({
  tabs,
  active,
  dirtyPaths,
  savingPath = null,
  onSelect,
  onClose,
  "aria-label": ariaLabel = "编辑器标签",
}: EditorTabsProps) {
  if (tabs.length === 0) {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex h-9 items-center border-b border-line bg-panel px-2 text-sm text-subtle"
      >
        <span className="px-2 italic">未打开文件</span>
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex h-9 items-stretch gap-0.5 overflow-x-auto border-b border-line bg-panel px-1.5"
    >
      {tabs.map((path) => {
        const name = path.split("/").pop() || path;
        const isActive = path === active;
        const isDirty = dirtyPaths.has(path);
        const isSaving = path === savingPath;
        return (
          <div
            key={path}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(path)}
            className={cn(
              "group flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-sm",
              isActive
                ? "border-line bg-canvas text-ink-strong"
                : "border-transparent text-muted hover:bg-panel-2 hover:text-ink",
            )}
          >
            <FileCode className="size-3.5 shrink-0 opacity-80" />
            <span className={cn("truncate", !isActive && "max-w-[18ch]")}>
              {name}
            </span>
            {isSaving ? (
              <span
                className="ml-1 inline-block size-2 shrink-0 animate-spin rounded-full border border-current border-r-transparent align-middle opacity-80"
                aria-label="保存中"
              />
            ) : isDirty ? (
              <span
                className="ml-1 inline-block size-2 shrink-0 rounded-full bg-primary align-middle"
                aria-label="未保存"
              />
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
              aria-label={`关闭 ${name}`}
              className={cn(
                "ml-0.5 grid size-4 shrink-0 place-items-center rounded-sm text-subtle outline-none transition-colors hover:bg-canvas-2 hover:text-ink focus-visible:shadow-[var(--ring)]",
                // Keep the close affordance visible on hover even for inactive tabs;
                // for active tabs the dot/spinner is the primary state indicator.
                isActive || isDirty ? "opacity-80" : "opacity-0 group-hover:opacity-80",
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default EditorTabs;
