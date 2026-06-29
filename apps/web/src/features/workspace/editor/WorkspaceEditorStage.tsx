import {
  Bot,
  ChevronLeft,
  Copy,
  FileCode,
  FileText,
  GitBranch,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import type { WorkspaceGitDiffTarget } from "../git";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import {
  useFileReadQuery,
  useWriteFileContentMutation,
} from "@/lib/query/files";
import { useGitDiffQuery } from "@/lib/query/git";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import {
  EditorTabs,
  type EditorTabModeAction,
} from "@/features/workspace/editor/EditorTabs";
import {
  CodeEditor,
  type CodeEditorSelectionContext,
} from "@/features/workspace/editor/CodeEditor";
import { createEditorTabCommands } from "@/features/workspace/editor/editorTabCommands";
import {
  DocumentWorkbench,
  canEditDocumentVisually,
  canRenderDocumentPreview,
  isHtmlDocument,
  isMarkdownDocument,
  type DocumentWorkbenchMode,
} from "@/features/workspace/shared";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WorkspaceEditorSearchRequest {
  path: string;
  query: string;
  caseSensitive?: boolean;
  regex?: boolean;
  signal: number;
}

export interface WorkspaceEditorStageProps {
  /** Path of the file currently "open" (set by the explorer). */
  openFile?: string;
  /** Git diff context handed off by source control; same tab opens with diff metadata preserved. */
  gitDiffTarget?: WorkspaceGitDiffTarget | null;
  /** Search context handed off by the side search panel; same tab opens with highlights. */
  searchRequest?: WorkspaceEditorSearchRequest | null;
  /** Root id the currently opened file lives under; captured per tab and must not be overwritten by explorer root switches. */
  rootId?: string;
  /** Current explorer/workspace root used only as a fallback for legacy tabs without captured root metadata. */
  workspaceRootId?: string;
  /** Absolute workspace root used to derive relative paths for tab commands. */
  workspaceRootAbsolutePath?: string;
  /** Optional sink for the active file's save state (wired to StatusBar). */
  onSaveStateChange?: (state: "idle" | "dirty" | "saving" | "saved") => void;
  /** Registers editor tab commands with the Workspace command palette. */
  onCommandsChange?: (commands: WorkspaceCommand[]) => void;
  /** Ask the owner workbench to reveal a tab path in the explorer panel. */
  onRevealInExplorer?: (path: string) => void;
  /** Ask the owner workbench to split the current tab into another editor group. */
  onSplitTab?: (path: string, direction: "right" | "down") => void;
  /** Ask the owner workbench to move the current tab into a new editor group. */
  onMoveTabToGroup?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Internal: confirm-close dialog state
// ---------------------------------------------------------------------------

interface ConfirmCloseState {
  path: string;
  name: string;
}

type EditorViewMode = DocumentWorkbenchMode | "diff";
const WORKSPACE_EDITOR_SESSION_STORAGE_KEY =
  "tracevane.workspace.editor-session.v1";
const WORKSPACE_EDITOR_MODE_PREFERENCE_STORAGE_KEY =
  "tracevane.workspace.editor-mode-preference.v1";
const WORKSPACE_EDITOR_FLOATING_COLLAPSED_STORAGE_KEY =
  "tracevane.workspace.editor-floating-collapsed.v1";

interface WorkspaceEditorSessionState {
  openTabs?: string[];
  active?: string | null;
  viewModes?: Record<string, EditorViewMode>;
  tabRootIds?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Multi-tab editor stage for Workspace.
 *
 * ## Tab model
 *
 * Tabs are owned here (`openTabs: string[]`). When `openFile` (from the
 * Workspace files owner) changes to a path not already open, it is pushed onto
 * the tab list and made active. Selecting a tab just flips `active`. Closing
 * a tab removes it from the list; if the tab is dirty, a confirm dialog is
 * shown first ("有未保存的更改，确定关闭？").
 *
 * ## Dirty tracking
 *
 * `dirty: Record<path, string>` holds the latest edited content for a path.
 * A path is "dirty" iff `dirty[path]` is defined AND differs from the
 * on-disk content (`loadedContent`). On a successful save the entry is
 * deleted, which clears the dirty indicator and the unsaved-close guard.
 *
 * Because `<CodeEditor />` is keyed by `path`, switching files remounts the
 * editor with `initialContent` = the latest on-disk content — so the buffer
 * is never silently clobbered while typing (see CodeEditor contract).
 *
 * ## Save
 *
 * `Cmd/Ctrl+S` (handled via a `keydown` listener scoped to this component's
 * root) triggers `useWriteFileContentMutation` for the active path. The
 * mutation invalidates the whole `filesKeys` tree on success so
 * browse/summary/search/read + git status refresh. We clear the dirty entry
 * only on success (no optimistic clear) so a failed save keeps the dirty
 * indicator.
 *
 * ## Document view modes
 *
 * Source, preview, split preview and visual editing are modes of the active
 * file tab. Workspace layout may still be split by Dockview, but a single
 * document must never create a second preview/editor window just to switch
 * between source and rendered forms.
 */
export function WorkspaceEditorStage({
  openFile,
  gitDiffTarget = null,
  searchRequest = null,
  rootId,
  workspaceRootId,
  workspaceRootAbsolutePath = "",
  onSaveStateChange,
  onCommandsChange,
  onRevealInExplorer,
  onSplitTab,
  onMoveTabToGroup,
}: WorkspaceEditorStageProps) {
  // --- Tab state ----------------------------------------------------------
  const [sessionStateLoaded] = React.useState(() =>
    loadWorkspaceEditorSessionState(),
  );
  const [openTabs, setOpenTabs] = React.useState<string[]>(
    () => sessionStateLoaded.openTabs ?? [],
  );
  const [active, setActive] = React.useState<string | null>(
    () => sessionStateLoaded.active ?? null,
  );
  const [viewModes, setViewModes] = React.useState<
    Record<string, EditorViewMode>
  >(() => sessionStateLoaded.viewModes ?? {});
  const [preferredViewMode, setPreferredViewMode] =
    React.useState<EditorViewMode>(() => loadWorkspaceEditorModePreference());
  const [tabRootIds, setTabRootIds] = React.useState<Record<string, string>>(
    () => sessionStateLoaded.tabRootIds ?? {},
  );

  // dirty[path] = edited content. Present => user has typed. Dirty iff
  // dirty[path] !== loadedContent (computed below per active path).
  const [dirty, setDirty] = React.useState<Record<string, string>>({});
  const [savingPath, setSavingPath] = React.useState<string | null>(null);
  const [searchOpenByPath, setSearchOpenByPath] = React.useState<
    Record<string, boolean>
  >({});
  const [diffCommands, setDiffCommands] = React.useState<WorkspaceCommand[]>(
    [],
  );
  const [sourceSelection, setSourceSelection] =
    React.useState<CodeEditorSelectionContext | null>(null);

  // Confirm-close dialog (one at a time).
  const [confirmClose, setConfirmClose] =
    React.useState<ConfirmCloseState | null>(null);


  React.useEffect(() => {
    setSourceSelection(null);
  }, [active]);

  React.useEffect(() => {
    storeWorkspaceEditorSessionState({
      openTabs,
      active,
      viewModes,
      tabRootIds,
    });
  }, [active, openTabs, viewModes, tabRootIds]);

  // --- Push openFile into tabs when it changes ---------------------------
  React.useEffect(() => {
    if (!openFile) return;
    setOpenTabs((prev) =>
      prev.includes(openFile) ? prev : [...prev, openFile],
    );
    if (rootId) {
      setTabRootIds((prev) =>
        prev[openFile] === rootId ? prev : { ...prev, [openFile]: rootId },
      );
    }
    setActive(openFile);
  }, [openFile, rootId]);

  // --- Active file content ----------------------------------------------
  const activeRootId = active
    ? (tabRootIds[active] ?? rootId ?? workspaceRootId)
    : (rootId ?? workspaceRootId);
  const readParams =
    activeRootId && active ? { rootId: activeRootId, path: active } : null;
  const readQuery = useFileReadQuery(readParams);
  const loadedContent = readQuery.data?.content ?? "";

  // Dirty set as a Set<string> for the tab strip.
  const dirtySet = React.useMemo(() => {
    const s = new Set<string>();
    for (const p of openTabs) {
      // We only know "dirty" precisely for the active path (we have its
      // loaded content). For inactive tabs we trust the presence of a dirty
      // entry that differs from "" — but since we don't have their loaded
      // content cached, fall back to "entry exists" as a conservative
      // dirty signal so the unsaved-close guard still fires.
      const edited = dirty[p];
      if (edited !== undefined) {
        if (p === active) {
          if (edited !== loadedContent) s.add(p);
        } else {
          s.add(p);
        }
      }
    }
    return s;
  }, [dirty, openTabs, active, loadedContent]);

  const writeMutation = useWriteFileContentMutation();

  // --- Report save state to the StatusBar (via WorkspaceWorkbench) -----------------
  const isDirtyActive =
    active !== null &&
    dirty[active] !== undefined &&
    dirty[active] !== loadedContent;
  const saveState: "idle" | "dirty" | "saving" | "saved" =
    savingPath !== null ? "saving" : isDirtyActive ? "dirty" : "saved";
  React.useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  React.useEffect(() => {
    const onSearchState = (event: Event) => {
      const detail = (
        event as CustomEvent<{ path?: string | null; open?: boolean }>
      ).detail;
      if (!detail?.path) return;
      setSearchOpenByPath((prev) => {
        if (prev[detail.path!] === Boolean(detail.open)) return prev;
        return { ...prev, [detail.path!]: Boolean(detail.open) };
      });
    };
    window.addEventListener(
      "tracevane:workspace-editor-search-state",
      onSearchState,
    );
    return () => {
      window.removeEventListener(
        "tracevane:workspace-editor-search-state",
        onSearchState,
      );
    };
  }, []);

  // --- Save -------------------------------------------------------------
  const saveActive = React.useCallback(async () => {
    if (!activeRootId || !active) return;
    // Use the edited buffer if any; otherwise nothing to save.
    const edited = dirty[active];
    if (edited === undefined) return;
    // No-op if the buffer matches disk (not dirty).
    if (edited === loadedContent) {
      setDirty((d) => {
        const next = { ...d };
        delete next[active];
        return next;
      });
      return;
    }
    setSavingPath(active);
    try {
      await writeMutation.mutateAsync({
        rootId: activeRootId,
        path: active,
        content: edited,
      });
      // Clear dirty ONLY on success.
      setDirty((d) => {
        const next = { ...d };
        delete next[active];
        return next;
      });
      toast.success(`已保存 · ${active.split("/").pop() || active}`);
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPath(null);
    }
  }, [activeRootId, active, dirty, loadedContent, writeMutation]);

  // --- Cmd/Ctrl+S keybinding (scoped to EditorArea root) -----------------
  const rootRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActive();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [saveActive]);

  // --- Tab close with dirty guard ---------------------------------------
  const closeTab = React.useCallback((path: string) => {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(path);
      if (idx === -1) return prev;
      const next = prev.filter((p) => p !== path);
      // If we closed the active tab, pick a neighbor.
      setActive((cur) => {
        if (cur !== path) return cur;
        if (next.length === 0) return null;
        const clamp = Math.min(idx, next.length - 1);
        return next[clamp] ?? null;
      });
      return next;
    });
    // Drop dirty entry for the closed path.
    setDirty((d) => {
      if (d[path] === undefined) return d;
      const next = { ...d };
      delete next[path];
      return next;
    });
  }, []);

  const handleCloseRequested = React.useCallback(
    (path: string) => {
      const edited = dirty[path];
      // Conservative dirty check for inactive tabs (see dirtySet memo).
      const isDirty =
        edited !== undefined && (path !== active || edited !== loadedContent);
      if (!isDirty) {
        closeTab(path);
        return;
      }
      const name = path.split("/").pop() || path;
      setConfirmClose({ path, name });
    },
    [dirty, active, loadedContent, closeTab],
  );

  const confirmCloseAndClose = React.useCallback(() => {
    if (!confirmClose) return;
    closeTab(confirmClose.path);
    setConfirmClose(null);
  }, [confirmClose, closeTab]);

  const closeTabs = React.useCallback(
    (paths: string[]) => {
      for (const path of paths) {
        handleCloseRequested(path);
      }
    },
    [handleCloseRequested],
  );

  const closeLeftTabs = React.useCallback(
    (path: string) => {
      const index = openTabs.indexOf(path);
      if (index > 0) closeTabs(openTabs.slice(0, index));
    },
    [closeTabs, openTabs],
  );

  const closeRightTabs = React.useCallback(
    (path: string) => {
      const index = openTabs.indexOf(path);
      if (index >= 0) closeTabs(openTabs.slice(index + 1));
    },
    [closeTabs, openTabs],
  );

  const closeAllTabs = React.useCallback(() => {
    closeTabs([...openTabs]);
  }, [closeTabs, openTabs]);

  const closeSavedTabs = React.useCallback(() => {
    closeTabs(openTabs.filter((path) => !dirtySet.has(path)));
  }, [closeTabs, dirtySet, openTabs]);

  const copyTabFileName = React.useCallback(async (path: string) => {
    const fileName = path.split("/").pop() || path;
    try {
      await navigator.clipboard.writeText(fileName);
      toast.success("已复制标签文件名", { description: fileName });
    } catch {
      toast.error("复制标签文件名失败", { description: fileName });
    }
  }, []);

  const copyTabPath = React.useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("已复制标签路径", { description: path });
    } catch {
      toast.error("复制标签路径失败", { description: path });
    }
  }, []);

  const toWorkspaceRelativePath = React.useCallback(
    (path: string) => {
      const root = normalizePortablePath(workspaceRootAbsolutePath);
      const normalizedPath = normalizePortablePath(path);
      if (!root || !normalizedPath.startsWith(`${root}/`)) return normalizedPath;
      return normalizedPath.slice(root.length + 1) || normalizedPath;
    },
    [workspaceRootAbsolutePath],
  );

  const copyTabRelativePath = React.useCallback(
    async (path: string) => {
      const relativePath = toWorkspaceRelativePath(path);
      try {
        await navigator.clipboard.writeText(relativePath);
        toast.success("已复制标签相对路径", { description: relativePath });
      } catch {
        toast.error("复制标签相对路径失败", { description: relativePath });
      }
    },
    [toWorkspaceRelativePath],
  );

  const insertTabPathToTerminal = React.useCallback((path: string) => {
    window.dispatchEvent(
      new CustomEvent("tracevane:workspace-terminal-insert-input", {
        detail: {
          value: shellQuoteWorkspacePath(path),
          label: "编辑器标签路径",
        },
      }),
    );
    toast.success("已插入文件路径到终端", { description: path });
  }, []);

  const copyTabAiFileContext = React.useCallback(
    async (path: string) => {
      const relativePath = toWorkspaceRelativePath(path);
      const context = formatWorkspaceFileAiContext(path, relativePath);
      try {
        await navigator.clipboard.writeText(context);
        toast.success("已复制 @file 上下文", { description: relativePath });
      } catch {
        toast.error("复制 @file 上下文失败", { description: relativePath });
      }
    },
    [toWorkspaceRelativePath],
  );

  const copySelectionAiContext = React.useCallback(async () => {
    if (!active || !sourceSelection?.text.trim()) {
      toast.info("当前没有可复制的编辑器选区");
      return;
    }
    const relativePath = toWorkspaceRelativePath(active);
    const context = formatWorkspaceSelectionAiContext(
      active,
      relativePath,
      sourceSelection,
    );
    try {
      await navigator.clipboard.writeText(context);
      toast.success("已复制 @selection 上下文", { description: relativePath });
    } catch {
      toast.error("复制 @selection 上下文失败", { description: relativePath });
    }
  }, [active, sourceSelection, toWorkspaceRelativePath]);

  const tabCommands = React.useMemo(
    () =>
      createEditorTabCommands({
        activePath: active,
        openTabs,
        dirty: isDirtyActive,
        dirtyPathsCount: dirtySet.size,
        saving: savingPath !== null,
        saveActive: () => void saveActive(),
        closeActive: handleCloseRequested,
        closeAll: closeAllTabs,
        closeOthers: (path) =>
          closeTabs(openTabs.filter((tab) => tab !== path)),
        closeSaved: closeSavedTabs,
        closeLeft: closeLeftTabs,
        closeRight: closeRightTabs,
        copyFileName: (path) => void copyTabFileName(path),
        copyPath: (path) => void copyTabPath(path),
        copyRelativePath: (path) => void copyTabRelativePath(path),
        insertPathToTerminal: insertTabPathToTerminal,
        copyAiFileContext: (path) => void copyTabAiFileContext(path),
        relativePathLabel: active ? toWorkspaceRelativePath(active) : "",
        revealInExplorer: onRevealInExplorer,
        splitTab: onSplitTab,
        moveTabToGroup: onMoveTabToGroup,
      }),
    [
      active,
      closeAllTabs,
      closeSavedTabs,
      closeLeftTabs,
      closeRightTabs,
      closeTabs,
      copyTabFileName,
      copyTabPath,
      copyTabRelativePath,
      copyTabAiFileContext,
      insertTabPathToTerminal,
      toWorkspaceRelativePath,
      handleCloseRequested,
      isDirtyActive,
      onMoveTabToGroup,
      onRevealInExplorer,
      onSplitTab,
      openTabs,
      saveActive,
      savingPath,
    ],
  );

  const selectionCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "editor.selection.copyAiContext",
        group: "AI",
        label: "AI：复制当前选区上下文",
        description:
          active && sourceSelection?.text.trim()
            ? `@selection ${toWorkspaceRelativePath(active)}:${sourceSelection.startLine}`
            : "当前源码编辑器没有选中文本",
        icon: <Bot />,
        disabled: !active || !sourceSelection?.text.trim(),
        run: () => void copySelectionAiContext(),
      },
    ],
    [active, copySelectionAiContext, sourceSelection, toWorkspaceRelativePath],
  );

  // --- Render -----------------------------------------------------------
  const showEmpty = openTabs.length === 0;
  const fileName = active ? active.split("/").pop() || active : null;
  const activeTextLike = Boolean(readQuery.data?.textLike);
  const activeImageLike = Boolean(readQuery.data?.imageLike);
  const activeGitDiffTarget =
    gitDiffTarget && active === gitDiffTarget.path ? gitDiffTarget : null;
  const activeModeActions = React.useMemo(
    () =>
      buildActiveModeActions(
        active,
        activeTextLike,
        activeImageLike,
        Boolean(activeGitDiffTarget),
      ),
    [active, activeGitDiffTarget, activeImageLike, activeTextLike],
  );
  const storedActiveViewMode = active
    ? (viewModes[active] ?? preferredViewMode)
    : preferredViewMode;
  React.useEffect(() => {
    if (!activeGitDiffTarget) return;
    setViewModes((prev) => {
      if (prev[activeGitDiffTarget.path] === "diff") return prev;
      return { ...prev, [activeGitDiffTarget.path]: "diff" };
    });
  }, [activeGitDiffTarget]);

  const activeViewMode = (
    activeModeActions.some((mode) => mode.id === storedActiveViewMode)
      ? storedActiveViewMode
      : (activeModeActions[0]?.id ?? "source")
  ) as EditorViewMode;

  const switchEditorViewMode = React.useCallback(
    (mode: EditorViewMode) => {
      if (!active) return;
      const available = activeModeActions.some((action) => action.id === mode);
      if (!available) {
        toast.info("当前文件不支持该视图模式");
        return;
      }
      storeWorkspaceEditorModePreference(mode);
      setPreferredViewMode(mode);
      setViewModes((prev) => ({ ...prev, [active]: mode }));
    },
    [active, activeModeActions],
  );

  const toggleEditorSearch = React.useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("tracevane:workspace-editor-toggle-search", {
        detail: { path: active },
      }),
    );
  }, [active]);

  const zoomEditor = React.useCallback(
    (delta: number) => {
      window.dispatchEvent(
        new CustomEvent("tracevane:workspace-editor-zoom", {
          detail: { path: active, delta },
        }),
      );
    },
    [active],
  );

  const viewModeCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      activeModeActions.map((mode) => ({
        id: `editor.viewMode.${mode.id}`,
        group: "编辑器",
        label: `编辑器：切换到${mode.label}`,
        description: active
          ? `${mode.title}${activeViewMode === mode.id ? " · 当前模式" : ""}`
          : "当前没有打开的文件",
        icon: <FileText />,
        disabled: !active || activeViewMode === mode.id,
        run: () => switchEditorViewMode(mode.id as EditorViewMode),
      })),
    [active, activeModeActions, activeViewMode, switchEditorViewMode],
  );

  const editorUtilityCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "editor.search.toggle",
        group: "编辑器",
        label:
          active && searchOpenByPath[active] ? "关闭查找替换" : "打开查找替换",
        description: activeTextLike
          ? "切换当前文件内查找/替换，适配没有 Ctrl+F 的触屏场景"
          : "当前文件类型不支持文本查找/替换",
        shortcut: "Ctrl F",
        icon: <Search />,
        disabled: !active || !activeTextLike,
        run: toggleEditorSearch,
      },
      {
        id: "editor.zoom.decrease",
        group: "编辑器",
        label: "缩小编辑器字号",
        description: "降低当前编辑/预览工作台字号，适配手机阅读密度",
        icon: <ZoomOut />,
        disabled: !active,
        run: () => zoomEditor(-1),
      },
      {
        id: "editor.zoom.increase",
        group: "编辑器",
        label: "放大编辑器字号",
        description: "提高当前编辑/预览工作台字号，适配触屏阅读和演示",
        icon: <ZoomIn />,
        disabled: !active,
        run: () => zoomEditor(1),
      },
    ],
    [active, activeTextLike, searchOpenByPath, toggleEditorSearch, zoomEditor],
  );

  const editorCommands = React.useMemo(
    () => [
      ...tabCommands,
      ...viewModeCommands,
      ...editorUtilityCommands,
      ...selectionCommands,
      ...diffCommands,
    ],
    [
      diffCommands,
      editorUtilityCommands,
      selectionCommands,
      tabCommands,
      viewModeCommands,
    ],
  );

  React.useEffect(() => {
    onCommandsChange?.(editorCommands);
    return () => onCommandsChange?.([]);
  }, [editorCommands, onCommandsChange]);

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas outline-none"
    >
      {activeGitDiffTarget ? (
        <div
          className="border-b border-line bg-panel-2 px-3 py-1 text-2xs text-muted"
          data-workspace-editor-git-diff-target
          data-git-diff-staged={activeGitDiffTarget.staged ? "true" : "false"}
          data-git-diff-untracked={
            activeGitDiffTarget.untracked ? "true" : "false"
          }
        >
          Git Diff：{activeGitDiffTarget.path}
          {activeGitDiffTarget.staged ? " · staged" : " · working tree"}
          {activeGitDiffTarget.untracked ? " · untracked" : ""}
        </div>
      ) : null}

      <EditorTabs
        tabs={openTabs}
        active={active}
        dirtyPaths={dirtySet}
        savingPath={savingPath}
        onSelect={setActive}
        onClose={handleCloseRequested}
        onCloseAll={closeAllTabs}
        onCloseOthers={(path) =>
          closeTabs(openTabs.filter((tab) => tab !== path))
        }
        onCloseSaved={closeSavedTabs}
        onCloseLeft={closeLeftTabs}
        onCloseRight={closeRightTabs}
        onCopyFileName={copyTabFileName}
        onCopyPath={copyTabPath}
        onCopyRelativePath={copyTabRelativePath}
        onInsertPathToTerminal={insertTabPathToTerminal}
        onCopyAiFileContext={copyTabAiFileContext}
        onRevealInExplorer={onRevealInExplorer}
        onSplitTab={onSplitTab}
        onMoveTabToGroup={onMoveTabToGroup}
      />

      {showEmpty ? (
        <WorkspaceTopTierEmptyState />
      ) : (
        <div className="relative grid min-h-0 min-w-0 overflow-hidden">
          <WorkspaceDocumentFloatingToolbar
            modes={activeModeActions}
            activeMode={activeViewMode}
            canSearch={activeTextLike}
            searchOpen={active ? Boolean(searchOpenByPath[active]) : false}
            onModeChange={switchEditorViewMode}
            onToggleSearch={toggleEditorSearch}
            onZoomIn={() => zoomEditor(1)}
            onZoomOut={() => zoomEditor(-1)}
          />
          <EditorPane
            path={active}
            readQuery={readQuery}
            onEdit={(v) => active && setDirty((d) => ({ ...d, [active]: v }))}
            onSourceSelectionChange={setSourceSelection}
            rootId={activeRootId}
            effectiveContent={
              active ? (dirty[active] ?? loadedContent) : loadedContent
            }
            viewMode={activeViewMode}
            gitDiffTarget={activeGitDiffTarget}
            searchRequest={
              searchRequest?.path === active ? searchRequest : null
            }
            onDiffCommandsChange={setDiffCommands}
            onViewModeChange={(mode) => {
              storeWorkspaceEditorModePreference(mode);
              setPreferredViewMode(mode);
              if (active) setViewModes((prev) => ({ ...prev, [active]: mode }));
            }}
          />
        </div>
      )}

      <Dialog
        open={confirmClose !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmClose(null);
        }}
      >
        <DialogContent showClose>
          <DialogHeader>
            <DialogTitle>关闭标签</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <strong>{confirmClose?.name}</strong> 有未保存的更改，确定关闭？
            未保存的编辑将丢失。
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClose(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={confirmCloseAndClose}>
              不保存并关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden but keeps fileName / rootId referenced for debug affordances */}
      <span className="sr-only">
        {fileName ?? "未打开文件"} · {activeRootId ?? "—"}
      </span>
    </section>
  );
}


function WorkspaceTopTierEmptyState() {
  const pillars = [
    {
      icon: <FileCode />,
      title: "代码",
      description: "打开文件后进入 Monaco 源码、Diff、查找替换和保存闭环。",
    },
    {
      icon: <PenLine />,
      title: "写作",
      description: "Markdown / HTML / 长文在同一标签页内切换源码、预览和可视编辑。",
    },
    {
      icon: <Sparkles />,
      title: "AI 上下文",
      description: "复制 @file / @selection 上下文，让 Agent 明确知道要修改什么。",
    },
    {
      icon: <TerminalSquare />,
      title: "终端",
      description: "运行构建、测试和验证命令，并把输出沉淀为审查线索。",
    },
    {
      icon: <GitBranch />,
      title: "Git",
      description: "查看变更、Diff、暂存与提交，守住可审查的发布边界。",
    },
    {
      icon: <ShieldCheck />,
      title: "证据",
      description: "每次重要修改都要能追溯到文件、Diff、命令或验证结果。",
    },
  ];

  return (
    <div
      className="relative grid min-h-0 overflow-auto bg-[radial-gradient(circle_at_20%_10%,var(--aurora-1),transparent_30%),radial-gradient(circle_at_80%_0%,var(--aurora-2),transparent_26%),linear-gradient(180deg,var(--canvas),var(--panel-2))] p-4 sm:p-8"
      data-workspace-top-tier-empty
    >
      <div className="mx-auto grid w-full max-w-5xl content-center gap-6 py-6 sm:py-10">
        <div className="grid gap-4 rounded-[28px] border border-line bg-panel/82 p-5 shadow-lg backdrop-blur sm:p-8">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-line bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            全球顶级 AI 编程与写作工作区
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div className="grid gap-3">
              <h1 className="max-w-3xl text-balance text-2xl font-semibold tracking-[-0.03em] text-ink-strong sm:text-4xl">
                从文件开始，把代码、写作、Agent、终端、Git 和证据放进同一个审查闭环。
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted sm:text-base">
                在左侧打开项目文件；当前文件标签页会成为唯一工作对象。源码、预览、编辑+预览、预览时编辑、AI 上下文和 Diff 都围绕同一个文件展开，不再制造重复窗口。
              </p>
            </div>
            <div className="grid gap-2 rounded-2xl border border-line bg-canvas/78 p-4 text-xs text-muted">
              <div className="font-medium text-ink-strong">推荐起步</div>
              <ol className="grid gap-2 pl-4 [list-style:decimal]">
                <li>从 Explorer 打开代码或 Markdown 文件。</li>
                <li>用 Ctrl/⌘+F 查找，或复制 @selection 交给 AI。</li>
                <li>运行终端验证，再用 Git/Diff 审查结果。</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pillars.map((item) => (
            <div
              key={item.title}
              className="group rounded-2xl border border-line bg-panel/74 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary-line hover:bg-panel"
              data-workspace-top-tier-pillar={item.title}
            >
              <div className="mb-3 grid size-9 place-items-center rounded-xl bg-primary-soft text-primary transition group-hover:scale-105">
                {item.icon}
              </div>
              <div className="text-sm font-semibold text-ink-strong">
                {item.title}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildActiveModeActions(
  path: string | null,
  textLike: boolean,
  imageLike: boolean,
  hasGitDiffTarget = false,
): EditorTabModeAction[] {
  if (!path) return [];
  const actions: EditorTabModeAction[] = [];
  if (hasGitDiffTarget) {
    actions.push({
      id: "diff",
      label: "Diff",
      title: "Git 差异视图：区分 staged、working tree 与 untracked",
    });
  }
  if (textLike) {
    actions.push({
      id: "source",
      label: "源码",
      title: "源码编辑：Monaco 高亮、查找、替换 · Ctrl/⌘+Alt+1",
    });
  }
  if (textLike || canRenderDocumentPreview(path, imageLike, textLike)) {
    actions.push({
      id: "preview",
      label: "预览",
      title: "在当前文件标签页内预览，不创建第二个窗口 · Ctrl/⌘+Alt+2",
    });
  }
  if (textLike && (isMarkdownDocument(path) || isHtmlDocument(path))) {
    actions.push({
      id: "split",
      label: "编辑+预览",
      title: "同一文件标签页内左右联动编辑和预览 · Ctrl/⌘+Alt+3",
    });
  }
  if (canEditDocumentVisually(path, textLike)) {
    actions.push({
      id: "visual",
      label: "预览时编辑",
      title: "在同一文件标签页内直接编辑渲染视图 · Ctrl/⌘+Alt+4",
    });
  }
  return actions;
}

function loadWorkspaceEditorSessionState(): WorkspaceEditorSessionState {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WORKSPACE_EDITOR_SESSION_STORAGE_KEY) || "{}",
    ) as Partial<WorkspaceEditorSessionState>;
    const openTabs = Array.isArray(parsed.openTabs)
      ? parsed.openTabs.filter(
          (path): path is string => typeof path === "string",
        )
      : undefined;
    const active =
      typeof parsed.active === "string" || parsed.active === null
        ? parsed.active
        : undefined;
    const rawModes =
      parsed.viewModes && typeof parsed.viewModes === "object"
        ? parsed.viewModes
        : {};
    const rawTabRootIds =
      parsed.tabRootIds && typeof parsed.tabRootIds === "object"
        ? parsed.tabRootIds
        : {};
    const viewModes: Record<string, EditorViewMode> = {};
    for (const [path, mode] of Object.entries(rawModes)) {
      if (
        typeof path === "string" &&
        (mode === "source" ||
          mode === "preview" ||
          mode === "split" ||
          mode === "visual" ||
          mode === "diff")
      ) {
        viewModes[path] = mode;
      }
    }
    const tabRootIds: Record<string, string> = {};
    for (const [path, tabRootId] of Object.entries(rawTabRootIds)) {
      if (typeof path === "string" && typeof tabRootId === "string") {
        tabRootIds[path] = tabRootId;
      }
    }
    return { openTabs, active, viewModes, tabRootIds };
  } catch {
    return {};
  }
}

function storeWorkspaceEditorSessionState(
  state: WorkspaceEditorSessionState,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_EDITOR_SESSION_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Editor tab restoration is convenience-only.
  }
}

function loadWorkspaceEditorModePreference(): EditorViewMode {
  if (typeof window === "undefined") return "source";
  const value = window.localStorage.getItem(
    WORKSPACE_EDITOR_MODE_PREFERENCE_STORAGE_KEY,
  );
  return value === "source" ||
    value === "preview" ||
    value === "split" ||
    value === "visual"
    ? value
    : "source";
}

function storeWorkspaceEditorModePreference(mode: EditorViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_EDITOR_MODE_PREFERENCE_STORAGE_KEY,
      mode,
    );
  } catch {
    // View-mode preference is convenience-only.
  }
}

function loadWorkspaceEditorFloatingCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(
      WORKSPACE_EDITOR_FLOATING_COLLAPSED_STORAGE_KEY,
    ) === "true"
  );
}

function storeWorkspaceEditorFloatingCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_EDITOR_FLOATING_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  } catch {
    // Floating toolbar collapsed state is convenience-only.
  }
}

function WorkspaceDocumentFloatingToolbar({
  modes,
  activeMode,
  canSearch,
  searchOpen,
  onModeChange,
  onToggleSearch,
  onZoomIn,
  onZoomOut,
}: {
  modes: EditorTabModeAction[];
  activeMode: EditorViewMode;
  canSearch: boolean;
  searchOpen: boolean;
  onModeChange: (mode: EditorViewMode) => void;
  onToggleSearch: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(() =>
    loadWorkspaceEditorFloatingCollapsed(),
  );
  const setFloatingCollapsed = React.useCallback((next: boolean) => {
    setCollapsed(next);
    storeWorkspaceEditorFloatingCollapsed(next);
  }, []);
  if (modes.length === 0) return null;
  const activeLabel =
    modes.find((mode) => mode.id === activeMode)?.label ?? "视图";
  return (
    <div
      className="pointer-events-none absolute right-0 top-3 z-20 flex max-w-[calc(100%-0.5rem)] justify-end"
      role="toolbar"
      aria-label="编辑器悬浮工具条"
      data-workspace-editor-floating-toolbar
      data-workspace-editor-floating-collapsed={collapsed ? "true" : "false"}
    >
      {collapsed ? (
        <button
          type="button"
          className="pointer-events-auto flex h-9 items-center gap-1 rounded-l-full border border-r-0 border-line bg-panel/92 px-2 text-xs font-medium text-primary shadow-lg backdrop-blur outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
          onClick={() => setFloatingCollapsed(false)}
          aria-label="展开编辑器悬浮菜单"
          title="展开编辑器悬浮菜单"
          data-workspace-editor-floating-edge-toggle="collapsed"
        >
          <ChevronLeft className="size-3.5" />
          编辑
        </button>
      ) : (
        <div
          className="pointer-events-auto grid max-w-full grid-cols-[minmax(5.75rem,9rem)_auto_auto_auto_auto] items-center gap-1 overflow-hidden rounded-l-full border border-r-0 border-line bg-panel/92 p-1 text-xs shadow-lg backdrop-blur"
          data-workspace-editor-floating-button-count="4"
        >
          <button
            type="button"
            className="grid size-7 place-items-center rounded-full text-muted outline-none hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
            onClick={() => setFloatingCollapsed(true)}
            aria-label="收起编辑器悬浮菜单"
            title="收起到右侧边缘"
            data-workspace-editor-floating-edge-toggle="expanded"
          >
            <ChevronLeft className="size-3.5 rotate-180" />
          </button>
          <label
            className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-full bg-primary-soft px-2.5 py-1 font-medium text-primary"
            data-workspace-editor-floating-mode-select
            title="切换源码、预览、编辑+预览或预览时编辑"
          >
            <span className="min-w-0 truncate">{activeLabel}</span>
            <span className="ml-1 text-subtle" aria-hidden>
              ⌄
            </span>
            <select
              value={activeMode}
              aria-label="切换当前文件视图模式"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(event) =>
                onModeChange(event.currentTarget.value as EditorViewMode)
              }
            >
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={cn(
              "rounded-full px-2.5 py-1 text-muted outline-none hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-muted",
              searchOpen && "bg-primary-soft text-primary",
            )}
            onClick={onToggleSearch}
            disabled={!canSearch}
            data-workspace-editor-floating-search
            data-workspace-editor-floating-search-state={
              searchOpen ? "open" : "closed"
            }
            aria-pressed={searchOpen}
            aria-label={
              canSearch
                ? searchOpen
                  ? "关闭查找替换"
                  : "打开查找替换"
                : "当前文件不支持查找替换"
            }
            title={
              canSearch
                ? searchOpen
                  ? "关闭查找/替换"
                  : "打开查找/替换"
                : "当前文件不支持查找"
            }
          >
            查找
          </button>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-muted outline-none hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
            onClick={onZoomOut}
            data-workspace-editor-floating-zoom-out
            aria-label="缩小编辑器字号"
            title="缩小"
          >
            −
          </button>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-muted outline-none hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
            onClick={onZoomIn}
            data-workspace-editor-floating-zoom-in
            aria-label="放大编辑器字号"
            title="放大"
          >
            ＋
          </button>
        </div>
      )}
    </div>
  );
}

function WorkspaceGitDiffViewer({
  rootId,
  target,
  onOpenSource,
  onCommandsChange,
}: {
  rootId: string;
  target: WorkspaceGitDiffTarget;
  onOpenSource: () => void;
  onCommandsChange?: (commands: WorkspaceCommand[]) => void;
}) {
  const diffQuery = useGitDiffQuery({
    rootId,
    file: target.path,
    staged: target.staged,
    untracked: target.untracked,
  });

  const payload = diffQuery.data;
  const diffText = payload?.diff || payload?.message || "No diff is available.";

  const copyDiff = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diffText);
      toast.success("已复制 Git Diff");
    } catch {
      toast.error("复制 Git Diff 失败");
    }
  }, [diffText]);

  const copyAiContext = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        formatWorkspaceGitDiffAiContext(target, diffText),
      );
      toast.success("已复制 Git Diff AI 上下文");
    } catch {
      toast.error("复制 Git Diff AI 上下文失败");
    }
  }, [diffText, target]);

  React.useEffect(() => {
    if (!onCommandsChange) return undefined;
    const disabled = diffQuery.isLoading || diffQuery.isError;
    onCommandsChange([
      {
        id: "git.diff.copyCurrent",
        group: "Git",
        label: "Git：复制当前 Diff",
        description: disabled ? "当前 Diff 尚不可复制" : target.path,
        icon: <Copy />,
        disabled,
        run: () => void copyDiff(),
      },
      {
        id: "git.diff.copyAiContext",
        group: "AI",
        label: "AI：复制当前 Git Diff 上下文",
        description: disabled
          ? "当前 Diff 尚不可复制"
          : `@git diff ${target.path}`,
        icon: <Bot />,
        disabled,
        run: () => void copyAiContext(),
      },
      {
        id: "git.diff.openSource",
        group: "编辑器",
        label: "编辑器：从 Diff 回到源码",
        description: `在同一标签页查看 ${target.path} 源码`,
        icon: <FileText />,
        run: onOpenSource,
      },
    ]);
    return () => onCommandsChange([]);
  }, [
    copyAiContext,
    copyDiff,
    diffQuery.isError,
    diffQuery.isLoading,
    onCommandsChange,
    onOpenSource,
    target.path,
  ]);

  if (diffQuery.isLoading) {
    return (
      <div className="grid gap-2 p-4" data-workspace-git-diff-loading>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (diffQuery.isError) {
    return (
      <ErrorState
        title="无法读取 Git Diff"
        description={
          diffQuery.error instanceof Error ? diffQuery.error.message : undefined
        }
      />
    );
  }

  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas"
      data-workspace-git-diff-viewer
      data-git-diff-staged={target.staged ? "true" : "false"}
      data-git-diff-untracked={target.untracked ? "true" : "false"}
      data-git-diff-binary={payload?.binary ? "true" : "false"}
      data-git-diff-truncated={payload?.truncated ? "true" : "false"}
    >
      <div
        className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-2 text-xs text-muted"
        data-workspace-git-diff-toolbar
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{target.path}</span>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary">
            {target.staged
              ? "Staged"
              : target.untracked
                ? "Untracked"
                : "Working Tree"}
          </span>
          {payload?.binary ? <span>Binary diff</span> : null}
          {payload?.truncated ? <span>已截断</span> : null}
        </div>
        <div
          className="flex min-w-0 flex-wrap items-center gap-1"
          data-workspace-git-diff-actions
        >
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-muted outline-none hover:bg-panel hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
            onClick={copyDiff}
            data-workspace-git-diff-copy
          >
            复制 Diff
          </button>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-muted outline-none hover:bg-panel hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
            onClick={copyAiContext}
            data-workspace-git-diff-copy-ai-context
          >
            AI 上下文
          </button>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-muted outline-none hover:bg-panel hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
            onClick={onOpenSource}
            data-workspace-git-diff-open-source
          >
            查看源码
          </button>
        </div>
      </div>
      <CodeEditor
        path={`${target.path}.diff`}
        initialContent={diffText}
        readOnly
        className="h-full"
      />
    </div>
  );
}

function formatWorkspaceGitDiffAiContext(
  target: WorkspaceGitDiffTarget,
  diffText: string,
): string {
  const scope = target.staged
    ? "staged"
    : target.untracked
      ? "untracked"
      : "working-tree";
  return [
    "@git diff",
    `file: ${target.path}`,
    `scope: ${scope}`,
    `kind: ${target.kind}`,
    "",
    diffText,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// EditorPane — renders one document workbench for the active file tab.
// ---------------------------------------------------------------------------

interface EditorPaneProps {
  path: string | null;
  rootId?: string;
  readQuery: ReturnType<typeof useFileReadQuery>;
  effectiveContent: string;
  onEdit: (value: string) => void;
  onSourceSelectionChange?: (selection: CodeEditorSelectionContext | null) => void;
  viewMode: EditorViewMode;
  gitDiffTarget?: WorkspaceGitDiffTarget | null;
  searchRequest?: WorkspaceEditorSearchRequest | null;
  onDiffCommandsChange?: (commands: WorkspaceCommand[]) => void;
  onViewModeChange: (mode: EditorViewMode) => void;
}

function EditorPane({
  path,
  rootId,
  readQuery,
  effectiveContent,
  onEdit,
  onSourceSelectionChange,
  viewMode,
  gitDiffTarget = null,
  searchRequest = null,
  onDiffCommandsChange,
  onViewModeChange,
}: EditorPaneProps) {
  if (path === null) return null;

  if (readQuery.isLoading) {
    return (
      <div className="grid gap-2 p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (readQuery.isError) {
    return (
      <ErrorState
        title="无法打开文件"
        description={
          readQuery.error instanceof Error ? readQuery.error.message : undefined
        }
      />
    );
  }

  const textLike = Boolean(readQuery.data?.textLike);

  if (viewMode === "diff" && gitDiffTarget && rootId) {
    return (
      <WorkspaceGitDiffViewer
        rootId={rootId}
        target={gitDiffTarget}
        onOpenSource={() => onViewModeChange("source")}
        onCommandsChange={onDiffCommandsChange}
      />
    );
  }

  const editable = Boolean(
    readQuery.data?.editable && readQuery.data?.textLike,
  );

  return (
    <DocumentWorkbench
      path={path}
      rootId={rootId}
      content={effectiveContent}
      editable={editable}
      textLike={textLike}
      imageLike={readQuery.data?.imageLike ?? false}
      mimeType={readQuery.data?.mimeType}
      size={readQuery.data?.size}
      truncated={readQuery.data?.truncated}
      contentOffset={readQuery.data?.contentOffset}
      contentBytes={readQuery.data?.contentBytes}
      readLimitBytes={readQuery.data?.readLimitBytes}
      mode={viewMode === "diff" ? "source" : viewMode}
      defaultMode="source"
      onModeChange={onViewModeChange}
      initialSearch={searchRequest}
      onChange={onEdit}
      onSourceSelectionChange={onSourceSelectionChange}
      showModeSwitcher={false}
      minHeightClassName="min-h-0"
      className="h-full"
    />
  );
}

function shellQuoteWorkspacePath(path: string): string {
  return `'${path.replace(/'/g, `'\''`)}'`;
}

function formatWorkspaceSelectionAiContext(
  path: string,
  relativePath: string,
  selection: CodeEditorSelectionContext,
): string {
  return [
    "@selection",
    `path: ${path}`,
    `relative: ${relativePath}`,
    `range: ${selection.startLine}:${selection.startColumn}-${selection.endLine}:${selection.endColumn}`,
    "",
    "```text",
    selection.text.trimEnd(),
    "```",
  ].join("\n");
}

function formatWorkspaceFileAiContext(path: string, relativePath: string): string {
  return [
    "@file",
    `path: ${path}`,
    `relative: ${relativePath}`,
    "intent: use this open editor tab as Workspace AI context",
  ].join("\n");
}

function normalizePortablePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "");
}
