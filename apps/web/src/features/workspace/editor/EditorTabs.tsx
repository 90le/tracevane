import { FileCode, MoreHorizontal, X } from "lucide-react";
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
  /** Close all tabs. */
  onCloseAll?: () => void;
  /** Close every tab except the requested one. */
  onCloseOthers?: (path: string) => void;
  /** Close tabs without unsaved changes. */
  onCloseSaved?: () => void;
  /** Close tabs to the left of the requested one. */
  onCloseLeft?: (path: string) => void;
  /** Close tabs to the right of the requested one. */
  onCloseRight?: (path: string) => void;
  /** Copy the tab file name to clipboard. */
  onCopyFileName?: (path: string) => void;
  /** Copy the tab path to clipboard. */
  onCopyPath?: (path: string) => void;
  /** Copy the tab path relative to the active workspace root. */
  onCopyRelativePath?: (path: string) => void;
  /** Reveal the file in the owning explorer panel. */
  onRevealInExplorer?: (path: string) => void;
  /** Insert the tab path into the active terminal input. */
  onInsertPathToTerminal?: (path: string) => void;
  /** Copy an AI-ready @file context token for this tab. */
  onCopyAiFileContext?: (path: string) => void;
  /** Request placing the tab into another editor group. */
  onSplitTab?: (path: string, direction: "right" | "down") => void;
  /** Request moving the tab into a new editor group. */
  onMoveTabToGroup?: (path: string) => void;
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
  onCloseAll,
  onCloseOthers,
  onCloseSaved,
  onCloseLeft,
  onCloseRight,
  onCopyFileName,
  onCopyPath,
  onCopyRelativePath,
  onRevealInExplorer,
  onInsertPathToTerminal,
  onCopyAiFileContext,
  onSplitTab,
  onMoveTabToGroup,
  "aria-label": ariaLabel = "编辑器标签",
}: EditorTabsProps) {
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const [actionSheetPath, setActionSheetPath] = React.useState<string | null>(
    null,
  );
  const longPressTimerRef = React.useRef<number | null>(null);
  const touchActionSurface = useEditorTabTouchActionSurface();

  const cancelLongPress = React.useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => cancelLongPress, [cancelLongPress]);

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
                if (touchActionSurface) {
                  setActionSheetPath(path);
                  return;
                }
                setMenu({ x: event.clientX, y: event.clientY, path });
              }}
              onPointerDown={(event) => {
                if (!touchActionSurface || event.pointerType !== "touch")
                  return;
                cancelLongPress();
                longPressTimerRef.current = window.setTimeout(() => {
                  onSelect(path);
                  setActionSheetPath(path);
                }, 520);
              }}
              onPointerMove={cancelLongPress}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
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
              {touchActionSurface ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(path);
                    setActionSheetPath(path);
                  }}
                  aria-label={`管理 ${name}`}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-subtle outline-none hover:bg-canvas-2 hover:text-ink focus-visible:shadow-[var(--ring)]"
                  data-workspace-editor-tab-more
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              ) : null}
              {!touchActionSurface ? (
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
              ) : null}
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
            canCloseAll: tabs.length > 0,
            canCloseRight: tabs.indexOf(menu.path) < tabs.length - 1,
            canCloseLeft: tabs.indexOf(menu.path) > 0,
            canCloseOthers: tabs.length > 1,
            canCloseSaved: tabs.some((tab) => !dirtyPaths.has(tab)),
            close: onClose,
            closeAll: onCloseAll,
            closeOthers: onCloseOthers,
            closeSaved: onCloseSaved,
            closeLeft: onCloseLeft,
            closeRight: onCloseRight,
            copyFileName: onCopyFileName,
            copyPath: onCopyPath,
            copyRelativePath: onCopyRelativePath,
            revealInExplorer: onRevealInExplorer,
            insertPathToTerminal: onInsertPathToTerminal,
            copyAiFileContext: onCopyAiFileContext,
            splitTab: onSplitTab,
            moveTabToGroup: onMoveTabToGroup,
          })}
          onActionComplete={() => setMenu(null)}
        />
      ) : null}
      {actionSheetPath ? (
        <EditorTabActionSheet
          path={actionSheetPath}
          actions={createEditorTabActions({
            path: actionSheetPath,
            canCloseAll: tabs.length > 0,
            canCloseRight: tabs.indexOf(actionSheetPath) < tabs.length - 1,
            canCloseLeft: tabs.indexOf(actionSheetPath) > 0,
            canCloseOthers: tabs.length > 1,
            canCloseSaved: tabs.some((tab) => !dirtyPaths.has(tab)),
            close: onClose,
            closeAll: onCloseAll,
            closeOthers: onCloseOthers,
            closeSaved: onCloseSaved,
            closeLeft: onCloseLeft,
            closeRight: onCloseRight,
            copyFileName: onCopyFileName,
            copyPath: onCopyPath,
            copyRelativePath: onCopyRelativePath,
            revealInExplorer: onRevealInExplorer,
            insertPathToTerminal: onInsertPathToTerminal,
            copyAiFileContext: onCopyAiFileContext,
            splitTab: onSplitTab,
            moveTabToGroup: onMoveTabToGroup,
          })}
          onActionComplete={() => setActionSheetPath(null)}
          onClose={() => setActionSheetPath(null)}
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
      className="fixed z-50 max-h-[min(80vh,26rem)] min-w-48 overflow-y-auto rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={clampFloatingMenuPosition(x, y, 224, 360)}
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

function clampFloatingMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): React.CSSProperties {
  if (typeof window === "undefined") return { left: x, top: y };
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}

function EditorTabActionSheet({
  path,
  actions,
  onActionComplete,
  onClose,
}: {
  path: string;
  actions: EditorTabAction[];
  onActionComplete: () => void;
  onClose: () => void;
}) {
  const name = path.split("/").pop() || path;
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm"
      data-workspace-editor-tab-action-sheet
      onPointerDown={onClose}
    >
      <section
        className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`标签 ${name} 操作`}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1.5 w-14 rounded-full bg-line-2" />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-strong">标签操作</p>
            <p className="truncate text-xs text-muted">{name}</p>
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-ink"
            onClick={onClose}
            aria-label="关闭标签操作面板"
          >
            <X className="size-4" />
          </button>
        </div>
        <div
          className="max-h-[min(70dvh,calc(100dvh-5.5rem))] overflow-y-auto overscroll-contain px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          tabIndex={0}
          role="group"
          aria-label={`标签 ${name} 操作列表`}
          data-workspace-editor-tab-action-sheet-scrollport
        >
          <div className="grid gap-2">
            {groupEditorTabSheetActions(actions).map((group, groupIndex) => (
              <div
                key={`editor-tab-sheet-group-${groupIndex}`}
                className="grid gap-1"
                data-workspace-editor-tab-action-group={groupIndex}
              >
                {group.map((action) => (
                  <MenuButton
                    key={action.id}
                    action={action}
                    onClick={() => {
                      action.run();
                      onActionComplete();
                    }}
                    touch
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function groupEditorTabSheetActions(
  actions: EditorTabAction[],
): EditorTabAction[][] {
  const groups: EditorTabAction[][] = [];
  for (const action of actions) {
    if (action.separatorBefore || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push(action);
  }
  return groups.filter((group) => group.length > 0);
}

function MenuButton({
  action,
  onClick,
  touch = false,
}: {
  action: EditorTabAction;
  onClick: () => void;
  touch?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.disabled}
      onClick={onClick}
      data-editor-tab-action={action.id}
      aria-keyshortcuts={action.shortcut}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:text-muted",
        touch ? "min-h-12 py-3 text-sm" : "py-1.5",
      )}
    >
      {action.icon}
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {action.shortcut ? (
        <kbd
          className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
          data-editor-tab-action-shortcut={action.id}
        >
          {action.shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function useEditorTabTouchActionSurface(): boolean {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia?.("(pointer: coarse), (max-width: 768px)");
    if (!query) return;
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return enabled;
}

export default EditorTabs;
