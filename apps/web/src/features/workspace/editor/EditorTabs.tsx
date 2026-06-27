import { FileCode, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";

import {
  createEditorTabActions,
  type EditorTabAction,
} from "./editorTabActions";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EditorTabModeAction {
  id: string;
  label: string;
  title?: string;
}

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
  /** Close every tab except the requested one. */
  onCloseOthers?: (path: string) => void;
  /** Close tabs to the right of the requested one. */
  onCloseRight?: (path: string) => void;
  /** Copy the tab path to clipboard. */
  onCopyPath?: (path: string) => void;
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
 * Source, preview, split preview and visual edit are same-tab modes for the
 * active document; this component only exposes the mode switcher and never
 * creates a second preview tab/window.
 */
export function EditorTabs({
  tabs,
  active,
  dirtyPaths,
  savingPath = null,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCopyPath,
  "aria-label": ariaLabel = "编辑器标签",
}: EditorTabsProps) {
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

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
    <div className="flex h-9 min-w-0 items-stretch border-b border-line bg-panel">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1.5"
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
              data-workspace-editor-tab={path}
              onClick={() => onSelect(path)}
              onContextMenu={(event) => {
                event.preventDefault();
                onSelect(path);
                setMenu({ x: event.clientX, y: event.clientY, path });
              }}
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
                  isActive || isDirty
                    ? "opacity-80"
                    : "opacity-0 group-hover:opacity-80",
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {menu ? (
        <EditorTabContextMenu
          x={menu.x}
          y={menu.y}
          path={menu.path}
          actions={createEditorTabActions({
            path: menu.path,
            canCloseRight: tabs.indexOf(menu.path) < tabs.length - 1,
            canCloseOthers: tabs.length > 1,
            close: onClose,
            closeOthers: onCloseOthers,
            closeRight: onCloseRight,
            copyPath: onCopyPath,
          })}
          onActionComplete={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}

function EditorTabContextMenu({
  x,
  y,
  path,
  actions,
  onActionComplete,
}: {
  x: number;
  y: number;
  path: string;
  actions: EditorTabAction[];
  onActionComplete: () => void;
}) {
  const name = path.split("/").pop() || path;
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-48 rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={{ left: x, top: y }}
      data-workspace-editor-tab-menu
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={`标签 ${name} 操作菜单`}
    >
      {actions.map((action) => (
        <React.Fragment key={action.id}>
          {action.separatorBefore ? (
            <div className="my-1 h-px bg-line" />
          ) : null}
          <MenuButton
            action={action}
            onClick={() => {
              action.run();
              onActionComplete();
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

function MenuButton({
  action,
  onClick,
}: {
  action: EditorTabAction;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.disabled}
      onClick={onClick}
      data-editor-tab-action={action.id}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:text-muted"
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
}

export default EditorTabs;
