import { ChevronRight, FolderTree, Maximize2, Minimize2, Minus, MoreHorizontal, PanelLeftClose, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { CodeEditor } from "@/features/file-manager/code-editor/CodeEditor";
import type { CodeEditorCursorPosition, CodeEditorHandle, CodeEditorThemeMode, CodeEditorViewState, CodeEditorWordWrap } from "@/features/file-manager/code-editor/CodeEditor";
import { isApiError } from "@/lib/api/errors";
import { useFileReadQuery, useWriteFileContentMutation } from "@/lib/query/files";
import { FileSurfacePreviewPanel } from "@/shared/file-surface";
import { editorDocumentId, editorTitleForPath, languageForPath } from "@/shared/editor-core";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { toast } from "@/design/ui/sonner";
import type { FileEntrySummary } from "@/features/file-manager/file-tools/types";
import { OnlineEditorMiniExplorer } from "./mini-explorer";
import type { OnlineEditorMiniExplorerPathEvent } from "./mini-explorer";

export interface FileOnlineEditorTab {
  id: string;
  rootId: string;
  entry: FileEntrySummary;
  deleted?: boolean;
}

export type FileOnlineEditorWindowMode = "normal" | "maximized";

export interface FileOnlineEditorReadMetadata {
  modifiedAt: string | null;
  size: number;
}

export interface FileOnlineEditorDialogProps {
  tabs: FileOnlineEditorTab[];
  activeTabId?: string;
  windowMode: FileOnlineEditorWindowMode;
  onWindowModeChange: (mode: FileOnlineEditorWindowMode) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseSavedTabs: () => void;
  onCloseAllTabs: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenFile: (entry: FileEntrySummary, rootId: string) => void;
  onMiniExplorerPathEvent?: (event: OnlineEditorMiniExplorerPathEvent) => void;
  rootAbsolutePaths?: Record<string, string>;
  drafts: Record<string, string>;
  viewStates: Record<string, CodeEditorViewState>;
  readMetadata: Record<string, FileOnlineEditorReadMetadata>;
  onDraftChange: (tabId: string, content: string) => void;
  onDraftClear: (tabId: string) => void;
  onViewStateChange: (tabId: string, viewState: CodeEditorViewState | null) => void;
  onReadMetadataChange: (tabId: string, metadata: FileOnlineEditorReadMetadata | null) => void;
}

type CloseConfirmAction =
  | { kind: "close-tab"; tabId: string }
  | { kind: "close-others"; keepTabId: string }
  | { kind: "close-all" };

const FILE_ONLINE_EDITOR_PREFERENCES_KEY =
  "tracevane:file-manager:online-editor-preferences:v1";

interface FileOnlineEditorPreferences {
  fontSize: number;
  minimapEnabled: boolean;
  stickyScrollEnabled: boolean;
  themeMode: CodeEditorThemeMode;
  wordWrap: CodeEditorWordWrap;
}

interface Point {
  x: number;
  y: number;
}

export function FileOnlineEditorDialog({
  tabs,
  activeTabId,
  windowMode,
  onWindowModeChange,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseSavedTabs,
  onCloseAllTabs,
  onOpenChange,
  onOpenFile,
  onMiniExplorerPathEvent,
  rootAbsolutePaths,
  drafts,
  viewStates,
  readMetadata,
  onDraftChange,
  onDraftClear,
  onViewStateChange,
  onReadMetadataChange,
}: FileOnlineEditorDialogProps) {
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[tabs.length - 1],
    [activeTabId, tabs],
  );
  const activeEditorRef = React.useRef<CodeEditorHandle | null>(null);
  const writeMutation = useWriteFileContentMutation();
  const dirtyTabs = React.useMemo(
    () => tabs.filter((tab) => drafts[tab.id] != null),
    [drafts, tabs],
  );
  const savedTabCount = tabs.length - dirtyTabs.length;
  const [closeConfirmAction, setCloseConfirmAction] =
    React.useState<CloseConfirmAction | null>(null);
  const [tabMenu, setTabMenu] = React.useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editorActionMenuPosition, setEditorActionMenuPosition] = React.useState<Point | null>(null);
  const [miniExplorerOpen, setMiniExplorerOpen] = React.useState(false);
  const [miniExplorerInitialLocation] = React.useState(() => ({
    rootId: activeTab?.rootId ?? "",
    directoryPath: activeTab ? editorDirnameForMiniExplorer(activeTab.entry.path) : "",
  }));

  const captureActiveViewState = React.useCallback(() => {
    if (!activeTab) return;
    onViewStateChange(activeTab.id, activeEditorRef.current?.saveViewState() ?? null);
  }, [activeTab, onViewStateChange]);

  const saveDirtyTabs = React.useCallback(async (targetTabs: FileOnlineEditorTab[]) => {
    const targetDirtyTabs = targetTabs.filter((tab) => drafts[tab.id] != null);
    if (!targetDirtyTabs.length || writeMutation.isPending) return true;
    try {
      for (const tab of targetDirtyTabs) {
        const content = drafts[tab.id];
        if (content == null) continue;
        const metadata = readMetadata[tab.id];
        const result = await writeMutation.mutateAsync({
          rootId: tab.rootId,
          path: tab.entry.path,
          content,
          expectedModifiedAt: metadata?.modifiedAt,
          expectedSize: metadata?.size,
        });
        if (result.modifiedAt != null && result.size != null) {
          onReadMetadataChange(tab.id, { modifiedAt: result.modifiedAt, size: result.size });
        }
        onDraftClear(tab.id);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("保存失败", { description: message });
      return false;
    }
  }, [dirtyTabs, drafts, onDraftClear, onReadMetadataChange, readMetadata, writeMutation]);

  const saveAll = React.useCallback(async () => {
    if (!dirtyTabs.length || writeMutation.isPending) return;
    if (await saveDirtyTabs(dirtyTabs)) {
      toast.success("已保存全部", { description: `${dirtyTabs.length} 个文件` });
    }
  }, [dirtyTabs, saveDirtyTabs, writeMutation.isPending]);

  const requestCloseTab = React.useCallback((tabId: string) => {
    if (drafts[tabId] != null) {
      setCloseConfirmAction({ kind: "close-tab", tabId });
      return;
    }
    onViewStateChange(tabId, null);
    onCloseTab(tabId);
  }, [drafts, onCloseTab, onViewStateChange]);

  const requestCloseOthers = React.useCallback((keepTabId: string) => {
    const dirtyOtherCount = tabs.filter(
      (tab) => tab.id !== keepTabId && drafts[tab.id] != null,
    ).length;
    if (dirtyOtherCount > 0) {
      setCloseConfirmAction({ kind: "close-others", keepTabId });
      return;
    }
    onCloseOtherTabs(keepTabId);
  }, [drafts, onCloseOtherTabs, tabs]);

  const requestCloseAll = React.useCallback(() => {
    if (dirtyTabs.length > 0) {
      setCloseConfirmAction({ kind: "close-all" });
      return;
    }
    onCloseAllTabs();
  }, [dirtyTabs.length, onCloseAllTabs]);

  const resolveCloseConfirm = React.useCallback(async (mode: "save" | "discard") => {
    const action = closeConfirmAction;
    if (!action) return;
    const targetTabs =
      action.kind === "close-tab"
        ? tabs.filter((tab) => tab.id === action.tabId)
        : action.kind === "close-others"
          ? tabs.filter((tab) => tab.id !== action.keepTabId)
          : tabs;
    if (mode === "save" && !(await saveDirtyTabs(targetTabs))) return;
    setCloseConfirmAction(null);
    if (action.kind === "close-tab") {
      onViewStateChange(action.tabId, null);
      onCloseTab(action.tabId);
      return;
    }
    if (action.kind === "close-others") {
      onCloseOtherTabs(action.keepTabId);
      return;
    }
    onCloseAllTabs();
  }, [closeConfirmAction, onCloseAllTabs, onCloseOtherTabs, onCloseTab, onViewStateChange, saveDirtyTabs, tabs]);

  React.useEffect(() => {
    if (!editorActionMenuPosition) return undefined;
    const closeMenu = () => setEditorActionMenuPosition(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeMenu);
    };
  }, [editorActionMenuPosition]);

  React.useEffect(() => {
    if (!tabMenu) return undefined;
    const closeMenu = () => setTabMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeMenu);
    };
  }, [tabMenu]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveAll();
        return;
      }
      if (event.key === "Escape") {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-code-editor="monaco-direct"], .monaco-editor, .monaco-editor *')) return;
        captureActiveViewState();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureActiveViewState, onOpenChange, saveAll]);

  if (!activeTab) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-ink/45 backdrop-blur-sm",
        windowMode === "maximized" ? "p-0" : "p-2 sm:p-4",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="文件在线编辑器"
      data-file-online-editor-dialog
      data-file-online-editor-window-mode={windowMode}
    >
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-panel shadow-lg",
          windowMode === "maximized" ? "rounded-none" : "rounded-xl",
        )}
      >
        <header className="flex min-h-0 shrink-0 items-center gap-2 border-b border-line bg-panel-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">文件在线编辑器</div>
            <div className="truncate text-xs text-muted">在文件管理器中编辑、预览和切换文件</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              captureActiveViewState();
              onWindowModeChange(windowMode === "maximized" ? "normal" : "maximized");
              requestAnimationFrame(() => activeEditorRef.current?.layout());
            }}
            aria-label={windowMode === "maximized" ? "还原在线编辑器" : "最大化在线编辑器"}
            title={windowMode === "maximized" ? "还原在线编辑器" : "最大化在线编辑器"}
            data-file-online-editor-toggle-maximize
          >
            {windowMode === "maximized" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              captureActiveViewState();
              onOpenChange(false);
            }}
            aria-label="最小化在线编辑器"
            title="最小化在线编辑器"
            data-file-online-editor-minimize
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={requestCloseAll}
            aria-label="关闭在线编辑器"
            title="关闭在线编辑器"
            data-file-online-editor-close-window
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex min-h-0 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 pt-2" data-file-online-editor-tab-row>
          <div
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain"
            data-file-online-editor-tabs
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab.id;
              const dirty = drafts[tab.id] != null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "group flex min-w-28 max-w-56 flex-[1_1_10rem] items-center gap-2 rounded-t-md border px-3 py-1.5 text-xs",
                    active
                      ? "border-line border-b-panel bg-panel text-ink-strong"
                      : "border-transparent bg-panel-2 text-muted hover:text-ink",
                  )}
                  onClick={() => {
                    captureActiveViewState();
                    onSelectTab(tab.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    captureActiveViewState();
                    onSelectTab(tab.id);
                    setTabMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                      event.preventDefault();
                      event.stopPropagation();
                      captureActiveViewState();
                      onSelectTab(tab.id);
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTabMenu({ tabId: tab.id, x: rect.left + 12, y: rect.bottom + 4 });
                    }
                  }}
                  data-file-online-editor-tab={tab.id}
                  data-file-online-editor-tab-dirty={dirty ? "true" : "false"}
                  aria-selected={active}
                >
                  <span className="min-w-0 flex-1 truncate">{editorTitleForPath(tab.entry.path)}</span>
                  {dirty ? <span className="shrink-0 text-primary" aria-label="未保存修改">●</span> : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className="shrink-0 rounded p-0.5 text-subtle hover:bg-panel hover:text-ink"
                    aria-label={`关闭 ${editorTitleForPath(tab.entry.path)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestCloseTab(tab.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        requestCloseTab(tab.id);
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mb-2 shrink-0"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setEditorActionMenuPosition((current) => current ? null : { x: rect.right - 320, y: rect.bottom + 6 });
            }}
            aria-label="打开编辑器操作菜单"
            title="打开编辑器操作菜单"
            data-file-online-editor-action-menu-trigger
          >
            <MoreHorizontal className="size-4" />
            <span className="hidden sm:inline">操作</span>
          </Button>
          {tabMenu ? (
            <TabContextMenu
              x={tabMenu.x}
              y={tabMenu.y}
              tab={tabs.find((tab) => tab.id === tabMenu.tabId) ?? activeTab}
              tabCount={tabs.length}
              savedTabCount={savedTabCount}
              onClose={() => setTabMenu(null)}
              onCloseTab={(tabId) => requestCloseTab(tabId)}
              onCloseOthers={(tabId) => requestCloseOthers(tabId)}
              onCloseSaved={onCloseSavedTabs}
              onCloseAll={requestCloseAll}
              onCopyPath={(targetTab) => copyEditorTabPath(targetTab, rootAbsolutePaths, "absolute")}
              onCopyRelativePath={(targetTab) => copyEditorTabPath(targetTab, rootAbsolutePaths, "relative")}
            />
          ) : null}
        </div>

        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-panel" data-file-online-editor-body>
          <button
            type="button"
            className={cn(
              "absolute top-1/2 z-30 grid min-h-14 w-9 -translate-y-1/2 place-items-center border border-primary-line bg-panel text-primary shadow-lg outline-none transition-all hover:bg-primary-soft hover:text-primary focus-visible:shadow-[var(--ring)]",
              "before:absolute before:inset-1 before:rounded-full before:bg-primary-soft before:content-[''] [&_svg]:relative [&_svg]:z-10 [&_svg]:size-4",
              miniExplorerOpen
                ? "left-[min(320px,86vw)] -translate-x-1/2 rounded-full lg:left-72"
                : "left-0 rounded-r-full border-l-0",
            )}
            onClick={() => setMiniExplorerOpen((open) => !open)}
            aria-label={miniExplorerOpen ? "收起文件列表" : "展开文件列表"}
            title={miniExplorerOpen ? "收起文件列表" : "展开文件列表"}
            aria-expanded={miniExplorerOpen}
            aria-controls="online-editor-mini-explorer"
            data-file-online-editor-mini-explorer-toggle
          >
            {miniExplorerOpen ? <PanelLeftClose className="size-4" /> : <FolderTree className="size-4" />}
          </button>
          {miniExplorerOpen ? (
            <>
              <button
                type="button"
                className="absolute inset-0 z-10 bg-ink/30 lg:hidden"
                aria-label="关闭文件列表遮罩"
                onClick={() => setMiniExplorerOpen(false)}
                data-file-online-editor-mini-explorer-backdrop
              />
              <OnlineEditorMiniExplorer
                id="online-editor-mini-explorer"
                rootId={miniExplorerInitialLocation.rootId || activeTab.rootId}
                initialDirectoryPath={miniExplorerInitialLocation.directoryPath}
                activeRootId={activeTab.rootId}
                activePath={activeTab.entry.path}
                rootAbsolutePath={rootAbsolutePaths?.[miniExplorerInitialLocation.rootId || activeTab.rootId]}
                openTabs={tabs.map((tab) => ({
                  rootId: tab.rootId,
                  path: tab.entry.path,
                  dirty: drafts[tab.id] != null,
                  deleted: tab.deleted,
                }))}
                onPathEvent={onMiniExplorerPathEvent}
                onOpenFile={(entry, rootId) => {
                  captureActiveViewState();
                  onOpenFile(entry, rootId);
                  if (window.matchMedia("(max-width: 1023px)").matches) setMiniExplorerOpen(false);
                }}
                onClose={() => setMiniExplorerOpen(false)}
                className="absolute inset-y-0 left-0 z-20 w-[min(320px,86vw)] lg:static lg:z-auto lg:w-72 lg:shrink-0"
              />
            </>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <OnlineEditorTabPanel
              tab={activeTab}
              draftContent={drafts[activeTab.id]}
              viewState={viewStates[activeTab.id]}
              editorRef={activeEditorRef}
              onDraftChange={(content) => onDraftChange(activeTab.id, content)}
              onDraftClear={() => onDraftClear(activeTab.id)}
              onViewStateChange={(viewState) => onViewStateChange(activeTab.id, viewState)}
              tabCount={tabs.length}
              savedTabCount={savedTabCount}
              savingAll={writeMutation.isPending}
              dirtyTabCount={dirtyTabs.length}
              onSaveAll={() => void saveAll()}
              onCloseCurrent={() => requestCloseTab(activeTab.id)}
              onCloseOthers={() => requestCloseOthers(activeTab.id)}
              onCloseSaved={onCloseSavedTabs}
              onCloseAll={requestCloseAll}
              actionMenuPosition={editorActionMenuPosition}
              onActionMenuClose={() => setEditorActionMenuPosition(null)}
              onReadMetadataChange={(metadata) => onReadMetadataChange(activeTab.id, metadata)}
            />
          </div>
        </div>
        {closeConfirmAction ? (
          <CloseConfirmDialog
            action={closeConfirmAction}
            dirtyCount={
              closeConfirmAction.kind === "close-tab"
                ? 1
                : closeConfirmAction.kind === "close-others"
                  ? tabs.filter((tab) => tab.id !== closeConfirmAction.keepTabId && drafts[tab.id] != null).length
                  : dirtyTabs.length
            }
            saving={writeMutation.isPending}
            onSave={() => void resolveCloseConfirm("save")}
            onDiscard={() => void resolveCloseConfirm("discard")}
            onCancel={() => setCloseConfirmAction(null)}
          />
        ) : null}
      </div>
    </div>
  );
}


function editorDirnameForMiniExplorer(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function copyEditorTabPath(
  tab: FileOnlineEditorTab,
  rootAbsolutePaths: Record<string, string> | undefined,
  mode: "absolute" | "relative",
): void {
  const text = mode === "relative"
    ? tab.entry.path
    : joinAbsolutePath(rootAbsolutePaths?.[tab.rootId], tab.entry.path);
  void copyTextToClipboard(text)
    .then(() => toast.success(mode === "relative" ? "已复制相对路径" : "已复制路径", { description: text }))
    .catch((error) => toast.error("复制路径失败", { description: error instanceof Error ? error.message : String(error) }));
}

function joinAbsolutePath(rootAbsolutePath: string | undefined, relativePath: string): string {
  if (!rootAbsolutePath) return relativePath;
  const root = rootAbsolutePath.replace(/[\\/]+$/, "");
  const child = relativePath.replace(/^[\\/]+/, "");
  return child ? `${root}/${child}` : root;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("浏览器拒绝访问剪贴板");
  } finally {
    textarea.remove();
  }
}

function TabContextMenu({
  x,
  y,
  tab,
  tabCount,
  savedTabCount,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseSaved,
  onCloseAll,
  onCopyPath,
  onCopyRelativePath,
}: {
  x: number;
  y: number;
  tab: FileOnlineEditorTab;
  tabCount: number;
  savedTabCount: number;
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseSaved: () => void;
  onCloseAll: () => void;
  onCopyPath: (tab: FileOnlineEditorTab) => void;
  onCopyRelativePath: (tab: FileOnlineEditorTab) => void;
}) {
  const run = (action: () => void) => {
    action();
    onClose();
  };
  return (
    <div
      className="fixed z-[70] min-w-48 overflow-hidden rounded-lg border border-line bg-panel py-1 text-sm text-ink shadow-lg"
      style={{ left: Math.min(x, window.innerWidth - 224), top: Math.min(y, window.innerHeight - 240) }}
      role="menu"
      aria-label="在线编辑器标签菜单"
      data-file-online-editor-tab-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-center px-3 py-2 text-left hover:bg-panel-2"
        role="menuitem"
        onClick={() => run(() => onCloseTab(tab.id))}
        data-file-online-editor-close-current
      >
        关闭
      </button>
      <button
        type="button"
        className="flex w-full items-center px-3 py-2 text-left hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-subtle"
        role="menuitem"
        disabled={tabCount <= 1}
        onClick={() => run(() => onCloseOthers(tab.id))}
        data-file-online-editor-close-others
      >
        关闭其他
      </button>
      <button
        type="button"
        className="flex w-full items-center px-3 py-2 text-left hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-subtle"
        role="menuitem"
        disabled={savedTabCount === 0}
        onClick={() => run(onCloseSaved)}
        data-file-online-editor-close-saved
      >
        关闭已保存
      </button>
      <button
        type="button"
        className="flex w-full items-center px-3 py-2 text-left hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-subtle"
        role="menuitem"
        disabled={tabCount === 0}
        onClick={() => run(onCloseAll)}
        data-file-online-editor-close-all
      >
        关闭全部
      </button>
      <div className="my-1 h-px bg-line" />
      <button
        type="button"
        className="flex w-full items-center px-3 py-2 text-left hover:bg-panel-2"
        role="menuitem"
        onClick={() => run(() => onCopyPath(tab))}
        data-file-online-editor-copy-path
      >
        复制路径
      </button>
      <button
        type="button"
        className="flex w-full items-center px-3 py-2 text-left hover:bg-panel-2"
        role="menuitem"
        onClick={() => run(() => onCopyRelativePath(tab))}
        data-file-online-editor-copy-relative-path
      >
        复制相对路径
      </button>
    </div>
  );
}

function CloseConfirmDialog({
  action,
  dirtyCount,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  action: CloseConfirmAction;
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const actionText =
    action.kind === "close-tab"
      ? "关闭这个标签"
      : action.kind === "close-others"
        ? "关闭其他标签"
        : "关闭全部标签";
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label="确认关闭在线编辑器标签"
      data-file-online-editor-close-confirm
    >
      <div className="w-full max-w-md rounded-lg border border-line-2 bg-panel p-4 text-sm shadow-lg">
        <div className="font-semibold text-ink-strong">保存未保存修改？</div>
        <p className="mt-2 text-muted">
          即将{actionText}，其中 {dirtyCount} 个文件存在未保存修改。你可以先保存、直接不保存并关闭，或取消本次操作。
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={saving}
            data-file-online-editor-close-confirm-save
          >
            {saving ? "保存中…" : "保存"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
            data-file-online-editor-close-confirm-discard
          >
            不保存
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            data-file-online-editor-close-confirm-cancel
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

function OnlineEditorTabPanel({
  tab,
  draftContent,
  viewState,
  editorRef,
  onDraftChange,
  onDraftClear,
  onViewStateChange,
  tabCount,
  savedTabCount,
  savingAll,
  dirtyTabCount,
  onSaveAll,
  onCloseCurrent,
  onCloseOthers,
  onCloseSaved,
  onCloseAll,
  actionMenuPosition,
  onActionMenuClose,
  onReadMetadataChange,
}: {
  tab: FileOnlineEditorTab;
  draftContent?: string;
  viewState?: CodeEditorViewState;
  editorRef: React.MutableRefObject<CodeEditorHandle | null>;
  onDraftChange: (content: string) => void;
  onDraftClear: () => void;
  onViewStateChange: (viewState: CodeEditorViewState | null) => void;
  tabCount: number;
  savedTabCount: number;
  savingAll: boolean;
  dirtyTabCount: number;
  onSaveAll: () => void;
  onCloseCurrent: () => void;
  onCloseOthers: () => void;
  onCloseSaved: () => void;
  onCloseAll: () => void;
  actionMenuPosition: Point | null;
  onActionMenuClose: () => void;
  onReadMetadataChange: (metadata: FileOnlineEditorReadMetadata | null) => void;
}) {
  const readQuery = useFileReadQuery({ rootId: tab.rootId, path: tab.entry.path }, { enabled: !tab.deleted });
  const writeMutation = useWriteFileContentMutation();
  const read = readQuery.data;
  const [detectedLanguage, setDetectedLanguage] = React.useState(() => languageForPath(tab.entry.path));
  React.useEffect(() => {
    setDetectedLanguage(languageForPath(tab.entry.path));
  }, [tab.entry.path]);
  const language = detectedLanguage;
  const deletedWithDraft = Boolean(tab.deleted && draftContent != null);
  const editorContent = draftContent ?? read?.content ?? "";
  const dirty = tab.deleted ? draftContent != null : draftContent != null && draftContent !== (read?.content ?? "");
  const editable = Boolean(!tab.deleted && read?.editable && !read?.truncated);
  const lineEnding = React.useMemo(() => describeLineEnding(editorContent), [editorContent]);
  const indentation = React.useMemo(() => describeIndentation(editorContent), [editorContent]);
  const fileSize = React.useMemo(() => formatFileSize(read?.size), [read?.size]);
  const modifiedAt = React.useMemo(() => formatModifiedAt(read?.modifiedAt), [read?.modifiedAt]);
  const readOnlyReason = tab.deleted
    ? "已删除"
    : read?.truncated
      ? "已截断"
      : read && !read.editable
        ? "只读"
        : editable
          ? "可编辑"
          : "不可编辑";
  const [gotoValue, setGotoValue] = React.useState("");
  const [cursorPosition, setCursorPosition] = React.useState<CodeEditorCursorPosition | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [conflictError, setConflictError] = React.useState<string | null>(null);
  const [conflictCompareOpen, setConflictCompareOpen] = React.useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = React.useState(false);
  const [preferences, setPreferences] = React.useState<FileOnlineEditorPreferences>(() =>
    loadFileOnlineEditorPreferences(),
  );
  const updatePreferences = React.useCallback((next: Partial<FileOnlineEditorPreferences>) => {
    setPreferences((current) => {
      const updated = { ...current, ...next };
      saveFileOnlineEditorPreferences(updated);
      return updated;
    });
  }, []);

  React.useEffect(() => {
    if (!read) return;
    onReadMetadataChange({ modifiedAt: read.modifiedAt, size: read.size });
  }, [onReadMetadataChange, read]);

  const gotoLine = React.useCallback(() => {
    const [lineText, columnText] = gotoValue.split(":");
    const line = Number.parseInt(lineText ?? "", 10);
    const column = Number.parseInt(columnText ?? "", 10);
    if (!Number.isFinite(line) || line < 1) {
      toast.error("请输入有效行号", { description: "例如 12 或 12:8" });
      return;
    }
    editorRef.current?.gotoLine(line, Number.isFinite(column) ? column : 1);
  }, [editorRef, gotoValue]);

  const save = React.useCallback(async (options: { force?: boolean } = {}) => {
    if (!read || !editable || !dirty) return true;
    try {
      setSaveError(null);
      setConflictError(null);
      setConflictCompareOpen(false);
      const latest = options.force ? read : (await readQuery.refetch()).data;
      if (!latest) {
        throw new Error("无法读取最新磁盘状态");
      }
      if (
        !options.force &&
        (latest.modifiedAt !== read.modifiedAt || latest.size !== read.size)
      ) {
        onReadMetadataChange({ modifiedAt: latest.modifiedAt, size: latest.size });
        const message = `保存前检测到磁盘上的文件已变化：${tab.entry.path}`;
        setConflictError(message);
        setConflictCompareOpen(false);
        setSaveError("文件已在磁盘上发生变化");
        toast.error("检测到外部修改", { description: "请选择重新读取或强制覆盖。" });
        return false;
      }
      const result = await writeMutation.mutateAsync({
        rootId: tab.rootId,
        path: tab.entry.path,
        content: editorContent,
        expectedModifiedAt: latest.modifiedAt,
        expectedSize: latest.size,
        force: options.force,
      });
      if (result.modifiedAt != null && result.size != null) {
        onReadMetadataChange({ modifiedAt: result.modifiedAt, size: result.size });
      }
      onDraftClear();
      toast.success("已保存", { description: tab.entry.path });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isApiError(error) && error.code === "file_write_conflict") {
        setConflictError(message);
        setConflictCompareOpen(false);
        setSaveError("文件已在磁盘上发生变化");
        toast.error("检测到外部修改", { description: "请选择重新读取或强制覆盖。" });
        return false;
      }
      setSaveError(message);
      toast.error("保存失败", { description: message });
      return false;
    }
  }, [dirty, editable, editorContent, onDraftClear, onReadMetadataChange, read, readQuery, tab.entry.path, tab.rootId, writeMutation]);

  const reloadFromDisk = React.useCallback(async () => {
    const result = await readQuery.refetch();
    if (result.data) {
      onReadMetadataChange({ modifiedAt: result.data.modifiedAt, size: result.data.size });
    }
    onDraftClear();
    setConflictError(null);
    setConflictCompareOpen(false);
    setSaveError(null);
    setReloadConfirmOpen(false);
    toast.success("已重新读取磁盘版本", { description: tab.entry.path });
  }, [onDraftClear, onReadMetadataChange, readQuery, tab.entry.path]);

  const requestReload = React.useCallback(() => {
    if (dirty) {
      setReloadConfirmOpen(true);
      return;
    }
    void reloadFromDisk();
  }, [dirty, reloadFromDisk]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  React.useEffect(() => {
    if (!viewState) return;
    const frame = requestAnimationFrame(() => editorRef.current?.restoreViewState(viewState));
    return () => cancelAnimationFrame(frame);
    // Restore only when this tab is mounted/activated. Cursor, selection, and edit
    // events keep saving fresher viewState objects; depending on those objects here
    // would immediately restore after every editor event and can create a render loop
    // with Monaco's full contribution set enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef, tab.id]);

  if (readQuery.isLoading && !tab.deleted) {
    return <LoadingState title="读取文件中…" className="min-h-full" />;
  }
  if ((tab.deleted || readQuery.error) && draftContent == null) {
    return (
      <ErrorState
        className="min-h-full"
        title={tab.deleted ? "文件已删除" : "文件不可读取或已不存在"}
        description={
          tab.deleted
            ? "该路径已在文件列表中被删除。此标签仅用于说明状态，可关闭标签，或从文件列表重新创建文件。"
            : readQuery.error?.message
        }
        data-file-online-editor-missing-state
        data-file-online-editor-deleted-state={tab.deleted ? "true" : "false"}
      />
    );
  }
  if (!deletedWithDraft && (!read?.textLike || read.content == null)) {
    return (
      <FileSurfacePreviewPanel
        rootId={tab.rootId}
        entry={tab.entry}
        read={read}
        loading={readQuery.isFetching}
        error={readQuery.error?.message}
        onReload={() => void readQuery.refetch()}
        statusNote="与文件管理器预览一致 · 非文本只读预览"
      />
    );
  }
  const noticeRowCount =
    (tab.deleted ? 1 : 0) +
    (conflictError ? 1 : 0) +
    (conflictError && conflictCompareOpen ? 1 : 0) +
    (reloadConfirmOpen ? 1 : 0) +
    (saveError && !conflictError ? 1 : 0);
  const panelGridRows = `${"auto ".repeat(noticeRowCount)}minmax(0, 1fr) auto`;

  return (
    <div
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateRows: panelGridRows,
      }}
      data-file-online-editor-panel
      data-file-online-editor-dirty-state={dirty ? "dirty" : "clean"}
      data-file-online-editor-readonly-state={editable ? "editable" : "readonly"}
    >
      {tab.deleted ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning" data-file-online-editor-deleted-banner>
          <span className="font-medium">文件已删除。</span>
          <span className="text-muted">已保留当前未保存内容；为避免误覆盖，当前标签只读，请复制内容或关闭标签后重新创建文件。</span>
        </div>
      ) : null}
      {saveError && !conflictError ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger"
          data-file-online-editor-save-error
        >
          <span className="font-medium">保存失败。</span>
          <span className="text-muted">{saveError}</span>
        </div>
      ) : null}
      {conflictError ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger"
          data-file-online-editor-conflict-panel
        >
          <span className="font-medium">磁盘文件已变化，已阻止静默覆盖。</span>
          <span className="text-muted">{conflictError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadFromDisk()}
            data-file-online-editor-conflict-reload
          >
            重新读取
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConflictCompareOpen((value) => !value)}
            data-file-online-editor-conflict-compare
          >
            对比
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void save({ force: true })}
            data-file-online-editor-conflict-overwrite
          >
            强制覆盖
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConflictError(null);
              setConflictCompareOpen(false);
              setSaveError(null);
            }}
            data-file-online-editor-conflict-cancel
          >
            取消
          </Button>
        </div>
      ) : null}
      {conflictError && conflictCompareOpen ? (
        <div
          className="grid min-h-0 gap-2 border-b border-danger-line bg-panel-2 p-3 text-xs md:grid-cols-2"
          data-file-online-editor-conflict-compare-panel
        >
          <section className="min-w-0 rounded-md border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 font-medium text-ink-strong">
              当前编辑草稿
            </div>
            <pre
              className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-ink"
              data-file-online-editor-conflict-local-content
            >
              {editorContent}
            </pre>
          </section>
          <section className="min-w-0 rounded-md border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 font-medium text-ink-strong">
              磁盘最新内容
            </div>
            <pre
              className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-ink"
              data-file-online-editor-conflict-disk-content
            >
              {read?.content ?? ""}
            </pre>
          </section>
        </div>
      ) : null}
      {reloadConfirmOpen ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2 text-xs"
          data-file-online-editor-reload-confirm
        >
          <span className="font-medium text-ink-strong">当前文件有未保存修改。重新读取前要如何处理？</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (await save()) void reloadFromDisk();
            }}
            disabled={writeMutation.isPending || readQuery.isFetching}
            data-file-online-editor-reload-confirm-save
          >
            保存后重新读取
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadFromDisk()}
            disabled={writeMutation.isPending || readQuery.isFetching}
            data-file-online-editor-reload-confirm-discard
          >
            不保存并重新读取
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadConfirmOpen(false)}
            disabled={writeMutation.isPending || readQuery.isFetching}
            data-file-online-editor-reload-confirm-cancel
          >
            取消
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 p-2">
        <CodeEditor
          key={editorDocumentId({ rootId: tab.rootId, path: tab.entry.path })}
          ref={editorRef}
          rootId={tab.rootId}
          path={tab.entry.path}
          initialContent={editorContent}
          readOnly={!editable || tab.deleted}
          profile={editable ? "normal" : "large-readonly"}
          fontSize={preferences.fontSize}
          minimapEnabled={preferences.minimapEnabled}
          stickyScrollEnabled={preferences.stickyScrollEnabled}
          themeMode={preferences.themeMode}
          wordWrap={preferences.wordWrap}
          onCursorPositionChange={(position) => {
            setCursorPosition((current) => (
              current?.lineNumber === position?.lineNumber && current?.column === position?.column
                ? current
                : position
            ));
          }}
          onLanguageChange={setDetectedLanguage}
          onChange={(content) => {
            setSaveError(null);
            onViewStateChange(editorRef.current?.saveViewState() ?? null);
            if (read && content === read.content) onDraftClear();
            else onDraftChange(content);
          }}
          className="h-full min-h-0 rounded border border-line"
        />
      </div>
      {actionMenuPosition ? (
        <EditorActionMenu
          x={actionMenuPosition.x}
          y={actionMenuPosition.y}
          editable={editable}
          dirty={dirty}
          savingCurrent={writeMutation.isPending}
          loading={readQuery.isFetching}
          preferences={preferences}
          gotoValue={gotoValue}
          tabCount={tabCount}
          savedTabCount={savedTabCount}
          dirtyTabCount={dirtyTabCount}
          savingAll={savingAll}
          onClose={onActionMenuClose}
          onSaveCurrent={() => void save()}
          onSaveAll={onSaveAll}
          onReload={requestReload}
          onFind={() => editorRef.current?.openFind()}
          onReplace={() => editorRef.current?.openReplace()}
          onCommandPalette={() => editorRef.current?.openCommandPalette()}
          onGotoValueChange={setGotoValue}
          onGoto={gotoLine}
          onPreferencesChange={updatePreferences}
          onCloseCurrent={onCloseCurrent}
          onCloseOthers={onCloseOthers}
          onCloseSaved={onCloseSaved}
          onCloseAll={onCloseAll}
        />
      ) : null}
      <footer className="flex min-h-9 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-line bg-panel-2 px-3 text-xs text-muted" data-file-online-editor-statusbar>
        <span className="min-w-0 flex-1 truncate font-mono" title={tab.entry.path}>{tab.entry.path}</span>
        <span data-file-online-editor-status-language>{language}</span>
        <span data-file-online-editor-status-line-ending>{lineEnding}</span>
        <span data-file-online-editor-status-indentation>{indentation}</span>
        <span data-file-online-editor-status-encoding>UTF-8</span>
        <span data-file-online-editor-status-size>{fileSize}</span>
        <span data-file-online-editor-status-permissions>{read ? `${read.mode} · ${read.permissions}` : "权限未知"}</span>
        <span data-file-online-editor-status-modified title={read?.modifiedAt ?? undefined}>{modifiedAt}</span>
        <span data-file-online-editor-cursor-position>{cursorPosition ? `Ln ${cursorPosition.lineNumber}, Col ${cursorPosition.column}` : "Ln —, Col —"}</span>
        <span data-file-online-editor-status-readonly-reason>{readOnlyReason}</span>
        {read?.truncated ? <span className="text-warning" data-file-online-editor-truncated-state>已截断</span> : null}
        {tab.deleted ? <span className="text-warning" data-file-online-editor-status-deleted>已删除</span> : null}
      </footer>
    </div>
  );
}



function EditorActionMenu({
  x,
  y,
  editable,
  dirty,
  savingCurrent,
  loading,
  preferences,
  gotoValue,
  tabCount,
  savedTabCount,
  dirtyTabCount,
  savingAll,
  onClose,
  onSaveCurrent,
  onSaveAll,
  onReload,
  onFind,
  onReplace,
  onCommandPalette,
  onGotoValueChange,
  onGoto,
  onPreferencesChange,
  onCloseCurrent,
  onCloseOthers,
  onCloseSaved,
  onCloseAll,
}: {
  x: number;
  y: number;
  editable: boolean;
  dirty: boolean;
  savingCurrent: boolean;
  loading: boolean;
  preferences: FileOnlineEditorPreferences;
  gotoValue: string;
  tabCount: number;
  savedTabCount: number;
  dirtyTabCount: number;
  savingAll: boolean;
  onClose: () => void;
  onSaveCurrent: () => void;
  onSaveAll: () => void;
  onReload: () => void;
  onFind: () => void;
  onReplace: () => void;
  onCommandPalette: () => void;
  onGotoValueChange: (value: string) => void;
  onGoto: () => void;
  onPreferencesChange: (next: Partial<FileOnlineEditorPreferences>) => void;
  onCloseCurrent: () => void;
  onCloseOthers: () => void;
  onCloseSaved: () => void;
  onCloseAll: () => void;
}) {
  const run = (action: () => void) => {
    action();
    onClose();
  };
  const menuWidth = Math.min(320, Math.max(280, window.innerWidth - 24));
  const menuTop = Math.max(8, Math.min(y, window.innerHeight - 360));
  return (
    <div
      className="fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-1 text-sm text-ink shadow-lg"
      style={{
        left: Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12)),
        top: menuTop,
        width: menuWidth,
        maxHeight: Math.max(280, window.innerHeight - menuTop - 12),
      }}
      role="menu"
      aria-label="在线编辑器操作菜单"
      data-file-online-editor-action-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="px-2.5 pb-1.5 pt-2">
        <div className="text-xs font-semibold text-ink-strong">编辑器操作</div>
      </div>

      <MenuButton onClick={() => run(onCommandPalette)} dataAttr="data-file-online-editor-command-palette" tone="primary" shortcut="F1">
        命令面板
      </MenuButton>

      <MenuSectionTitle>常用</MenuSectionTitle>
      <MenuButton disabled={!editable || !dirty || savingCurrent} onClick={() => run(onSaveCurrent)} dataAttr="data-file-online-editor-save-current" shortcut="Ctrl+S">
        {savingCurrent ? "保存中…" : "保存当前"}
      </MenuButton>
      <MenuButton disabled={dirtyTabCount === 0 || savingAll} onClick={() => run(onSaveAll)} dataAttr="data-file-online-editor-save-all">
        {savingAll ? "保存中…" : `保存全部${dirtyTabCount ? ` (${dirtyTabCount})` : ""}`}
      </MenuButton>
      <MenuButton onClick={() => run(onFind)} dataAttr="data-file-online-editor-find" shortcut="Ctrl+F">查找</MenuButton>
      <MenuButton disabled={!editable} onClick={() => run(onReplace)} dataAttr="data-file-online-editor-replace">替换</MenuButton>

      <MenuDisclosure title="跳转" dataAttr="data-file-online-editor-jump-section">
        <div className="flex items-center gap-2 rounded-lg px-2 pb-1 text-xs text-muted">
          <input
            value={gotoValue}
            onChange={(event) => onGotoValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") run(onGoto);
            }}
            placeholder="12:8"
            className="h-8 min-w-0 flex-1 rounded border border-line bg-panel px-2 text-xs text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
            data-file-online-editor-goto-input
          />
          <Button variant="ghost" size="sm" onClick={() => run(onGoto)} data-file-online-editor-goto>定位</Button>
        </div>
      </MenuDisclosure>

      <MenuDisclosure title="显示设置" dataAttr="data-file-online-editor-display-section">
        <div className="grid gap-1.5 rounded-lg px-2 pb-1 text-xs text-muted">
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0">字号</span>
            <input
              type="number"
              min={11}
              max={24}
              value={preferences.fontSize}
              onChange={(event) => onPreferencesChange({ fontSize: Math.max(11, Math.min(24, Number(event.target.value) || 13)) })}
              className="h-8 w-20 rounded border border-line bg-panel px-2 text-xs text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
              data-file-online-editor-font-size
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0">主题</span>
            <select value={preferences.themeMode} onChange={(event) => onPreferencesChange({ themeMode: event.target.value as CodeEditorThemeMode })} className="h-8 min-w-0 flex-1 rounded border border-line bg-panel px-2 text-xs text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]" data-file-online-editor-theme-mode-select>
              <option value="auto">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0">换行</span>
            <select value={preferences.wordWrap} onChange={(event) => onPreferencesChange({ wordWrap: event.target.value as CodeEditorWordWrap })} className="h-8 min-w-0 flex-1 rounded border border-line bg-panel px-2 text-xs text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]" data-file-online-editor-word-wrap-select>
              <option value="on">开</option>
              <option value="off">关</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex min-h-8 items-center gap-2 rounded-md bg-panel-2/60 px-2"><input type="checkbox" checked={preferences.minimapEnabled} onChange={(event) => onPreferencesChange({ minimapEnabled: event.target.checked })} className="size-3 accent-primary" data-file-online-editor-minimap-enabled />小地图</label>
            <label className="flex min-h-8 items-center gap-2 rounded-md bg-panel-2/60 px-2"><input type="checkbox" checked={preferences.stickyScrollEnabled} onChange={(event) => onPreferencesChange({ stickyScrollEnabled: event.target.checked })} className="size-3 accent-primary" data-file-online-editor-sticky-scroll-enabled />粘性滚动</label>
          </div>
        </div>
      </MenuDisclosure>

      <MenuSectionTitle>文件与标签</MenuSectionTitle>
      <MenuButton disabled={loading} onClick={() => run(onReload)} dataAttr="data-file-online-editor-reload-current">
        {loading ? "读取中…" : "重新读取当前文件"}
      </MenuButton>
      <MenuButton onClick={() => run(onCloseCurrent)} dataAttr="data-file-online-editor-close-current">关闭当前</MenuButton>
      <MenuButton disabled={tabCount <= 1} onClick={() => run(onCloseOthers)} dataAttr="data-file-online-editor-close-others">关闭其他</MenuButton>
      <MenuButton disabled={savedTabCount === 0} onClick={() => run(onCloseSaved)} dataAttr="data-file-online-editor-close-saved">关闭已保存</MenuButton>
      <MenuButton disabled={tabCount === 0} onClick={() => run(onCloseAll)} dataAttr="data-file-online-editor-close-all">关闭全部</MenuButton>
    </div>
  );
}

function MenuSectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 border-t border-line/70 px-2.5 pb-1 pt-2 text-[11px] font-medium tracking-wide text-muted first:mt-0 first:border-t-0 first:pt-1">{children}</div>;
}

function MenuDisclosure({
  children,
  dataAttr,
  title,
}: {
  children: React.ReactNode;
  dataAttr: string;
  title: string;
}) {
  return (
    <details className="group mt-1.5 border-t border-line/70 pt-1" onPointerDown={(event) => event.stopPropagation()}>
      <summary
        className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg px-2.5 text-sm text-muted transition hover:bg-panel-2 hover:text-ink [&::-webkit-details-marker]:hidden"
        {...{ [dataAttr]: true }}
      >
        <span>{title}</span>
        <ChevronRight className="size-3.5 text-subtle transition group-open:rotate-90" aria-hidden />
      </summary>
      {children}
    </details>
  );
}

function MenuButton({
  children,
  disabled,
  onClick,
  dataAttr,
  shortcut,
  tone = "normal",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  dataAttr: string;
  shortcut?: string;
  tone?: "normal" | "primary";
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-subtle",
        tone === "primary" ? "bg-primary/10 font-medium text-primary hover:bg-primary/15" : null,
      )}
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      {...{ [dataAttr]: true }}
    >
      <span className="min-w-0 truncate">{children}</span>
      {shortcut ? <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-muted">{shortcut}</span> : null}
    </button>
  );
}

export function createFileOnlineEditorTab(rootId: string, entry: FileEntrySummary): FileOnlineEditorTab {
  return {
    id: editorDocumentId({ rootId, path: entry.path }),
    rootId,
    entry,
  };
}

function describeLineEnding(content: string): "LF" | "CRLF" | "Mixed" | "None" {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) ?? []).length;
  if (crlfCount > 0 && lfCount > 0) return "Mixed";
  if (crlfCount > 0) return "CRLF";
  if (lfCount > 0) return "LF";
  return "None";
}

function describeIndentation(content: string): string {
  const lines = content.split(/\r?\n/);
  let tabIndented = 0;
  const spaceCounts = new Map<number, number>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = /^(\s+)/.exec(line);
    if (!match) continue;
    const indent = match[1] ?? "";
    if (indent.startsWith("\t")) {
      tabIndented += 1;
      continue;
    }
    const spaces = indent.length;
    if (spaces > 0) spaceCounts.set(spaces, (spaceCounts.get(spaces) ?? 0) + 1);
  }
  const commonSpaces = Array.from(spaceCounts.entries()).sort((left, right) => {
    const countDelta = right[1] - left[1];
    return countDelta !== 0 ? countDelta : left[0] - right[0];
  })[0]?.[0];
  if (tabIndented > 0 && (!commonSpaces || tabIndented >= (spaceCounts.get(commonSpaces) ?? 0))) {
    return "Tabs";
  }
  if (commonSpaces) return `Spaces ${commonSpaces}`;
  return "Indent —";
}

function formatFileSize(size: number | null | undefined): string {
  if (typeof size !== "number" || !Number.isFinite(size)) return "Size —";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatModifiedAt(value: string | null | undefined): string {
  if (!value) return "mtime —";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "mtime —";
  return date.toLocaleString();
}

function loadFileOnlineEditorPreferences(): FileOnlineEditorPreferences {
  if (typeof window === "undefined") return defaultFileOnlineEditorPreferences();
  try {
    const raw = window.localStorage.getItem(FILE_ONLINE_EDITOR_PREFERENCES_KEY);
    if (!raw) return defaultFileOnlineEditorPreferences();
    const parsed = JSON.parse(raw) as Partial<FileOnlineEditorPreferences>;
    const fontSize = Math.max(11, Math.min(24, Number(parsed.fontSize) || 13));
    const minimapEnabled = parsed.minimapEnabled === true;
    const stickyScrollEnabled = parsed.stickyScrollEnabled !== false;
    const themeMode: CodeEditorThemeMode =
      parsed.themeMode === "light" || parsed.themeMode === "dark" || parsed.themeMode === "auto"
        ? parsed.themeMode
        : "auto";
    const wordWrap: CodeEditorWordWrap = parsed.wordWrap === "off" ? "off" : "on";
    return {
      fontSize,
      minimapEnabled,
      stickyScrollEnabled,
      themeMode,
      wordWrap,
    };
  } catch {
    return defaultFileOnlineEditorPreferences();
  }
}

function saveFileOnlineEditorPreferences(preferences: FileOnlineEditorPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FILE_ONLINE_EDITOR_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Preference persistence must never block editing.
  }
}

function defaultFileOnlineEditorPreferences(): FileOnlineEditorPreferences {
  return {
    fontSize: 13,
    minimapEnabled: false,
    stickyScrollEnabled: true,
    themeMode: "auto",
    wordWrap: "on",
  };
}
