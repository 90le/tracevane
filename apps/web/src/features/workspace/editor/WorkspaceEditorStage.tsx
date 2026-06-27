import { FileCode } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
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
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import {
  EditorTabs,
  type EditorTabModeAction,
} from "@/features/workspace/editor/EditorTabs";
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
  /** Search context handed off by the side search panel; same tab opens with highlights. */
  searchRequest?: WorkspaceEditorSearchRequest | null;
  /** Root id the open file lives under. */
  rootId?: string;
  /** Optional sink for the active file's save state (wired to StatusBar). */
  onSaveStateChange?: (state: "idle" | "dirty" | "saving" | "saved") => void;
  /** Registers editor tab commands with the Workspace command palette. */
  onCommandsChange?: (commands: WorkspaceCommand[]) => void;
}

// ---------------------------------------------------------------------------
// Internal: confirm-close dialog state
// ---------------------------------------------------------------------------

interface ConfirmCloseState {
  path: string;
  name: string;
}

type EditorViewMode = DocumentWorkbenchMode;
const WORKSPACE_EDITOR_SESSION_STORAGE_KEY =
  "tracevane.workspace.editor-session.v1";

interface WorkspaceEditorSessionState {
  openTabs?: string[];
  active?: string | null;
  viewModes?: Record<string, EditorViewMode>;
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
  searchRequest = null,
  rootId,
  onSaveStateChange,
  onCommandsChange,
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

  // dirty[path] = edited content. Present => user has typed. Dirty iff
  // dirty[path] !== loadedContent (computed below per active path).
  const [dirty, setDirty] = React.useState<Record<string, string>>({});
  const [savingPath, setSavingPath] = React.useState<string | null>(null);

  // Confirm-close dialog (one at a time).
  const [confirmClose, setConfirmClose] =
    React.useState<ConfirmCloseState | null>(null);

  React.useEffect(() => {
    storeWorkspaceEditorSessionState({ openTabs, active, viewModes });
  }, [active, openTabs, viewModes]);

  // --- Push openFile into tabs when it changes ---------------------------
  React.useEffect(() => {
    if (!openFile) return;
    setOpenTabs((prev) =>
      prev.includes(openFile) ? prev : [...prev, openFile],
    );
    setActive(openFile);
  }, [openFile]);

  // --- Active file content ----------------------------------------------
  const readParams = rootId && active ? { rootId, path: active } : null;
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

  // --- Save -------------------------------------------------------------
  const saveActive = React.useCallback(async () => {
    if (!rootId || !active) return;
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
        rootId,
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
  }, [rootId, active, dirty, loadedContent, writeMutation]);

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

  const copyTabPath = React.useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("已复制标签路径", { description: path });
    } catch {
      toast.error("复制标签路径失败", { description: path });
    }
  }, []);

  const editorCommands = React.useMemo(
    () =>
      createEditorTabCommands({
        activePath: active,
        openTabs,
        dirty: isDirtyActive,
        saving: savingPath !== null,
        saveActive: () => void saveActive(),
        closeActive: handleCloseRequested,
        closeOthers: (path) =>
          closeTabs(openTabs.filter((tab) => tab !== path)),
        closeRight: (path) => {
          const index = openTabs.indexOf(path);
          if (index >= 0) closeTabs(openTabs.slice(index + 1));
        },
        copyPath: (path) => void copyTabPath(path),
      }),
    [
      active,
      closeTabs,
      copyTabPath,
      handleCloseRequested,
      isDirtyActive,
      openTabs,
      saveActive,
      savingPath,
    ],
  );

  React.useEffect(() => {
    onCommandsChange?.(editorCommands);
    return () => onCommandsChange?.([]);
  }, [editorCommands, onCommandsChange]);

  // --- Render -----------------------------------------------------------
  const showEmpty = openTabs.length === 0;
  const fileName = active ? active.split("/").pop() || active : null;
  const activeTextLike = Boolean(readQuery.data?.textLike);
  const activeImageLike = Boolean(readQuery.data?.imageLike);
  const activeModeActions = React.useMemo(
    () => buildActiveModeActions(active, activeTextLike, activeImageLike),
    [active, activeImageLike, activeTextLike],
  );
  const storedActiveViewMode = active
    ? (viewModes[active] ?? "source")
    : "source";
  const activeViewMode = (
    activeModeActions.some((mode) => mode.id === storedActiveViewMode)
      ? storedActiveViewMode
      : (activeModeActions[0]?.id ?? "source")
  ) as EditorViewMode;

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas outline-none"
    >
      <EditorTabs
        tabs={openTabs}
        active={active}
        dirtyPaths={dirtySet}
        savingPath={savingPath}
        onSelect={setActive}
        onClose={handleCloseRequested}
        onCloseOthers={(path) =>
          closeTabs(openTabs.filter((tab) => tab !== path))
        }
        onCloseRight={(path) => {
          const index = openTabs.indexOf(path);
          if (index >= 0) closeTabs(openTabs.slice(index + 1));
        }}
        onCopyPath={copyTabPath}
      />

      {showEmpty ? (
        <div className="grid min-h-0 place-items-center p-8 text-center">
          <EmptyState
            title="未打开文件"
            description="在左侧资源管理器中选择文件以打开"
            icon={<FileCode />}
          />
        </div>
      ) : (
        <div className="relative grid min-h-0 min-w-0 overflow-hidden">
          <WorkspaceDocumentModePalette
            modes={activeModeActions}
            activeMode={activeViewMode}
            onModeChange={(mode) =>
              active && setViewModes((prev) => ({ ...prev, [active]: mode }))
            }
          />
          <EditorPane
            path={active}
            readQuery={readQuery}
            onEdit={(v) => active && setDirty((d) => ({ ...d, [active]: v }))}
            rootId={rootId}
            effectiveContent={
              active ? (dirty[active] ?? loadedContent) : loadedContent
            }
            viewMode={activeViewMode}
            searchRequest={
              searchRequest?.path === active ? searchRequest : null
            }
            onViewModeChange={(mode) =>
              active && setViewModes((prev) => ({ ...prev, [active]: mode }))
            }
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
        {fileName ?? "未打开文件"} · {rootId ?? "—"}
      </span>
    </section>
  );
}

function buildActiveModeActions(
  path: string | null,
  textLike: boolean,
  imageLike: boolean,
): EditorTabModeAction[] {
  if (!path) return [];
  const actions: EditorTabModeAction[] = [];
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
    const viewModes: Record<string, EditorViewMode> = {};
    for (const [path, mode] of Object.entries(rawModes)) {
      if (
        typeof path === "string" &&
        (mode === "source" ||
          mode === "preview" ||
          mode === "split" ||
          mode === "visual")
      ) {
        viewModes[path] = mode;
      }
    }
    return { openTabs, active, viewModes };
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

function WorkspaceDocumentModePalette({
  modes,
  activeMode,
  onModeChange,
}: {
  modes: EditorTabModeAction[];
  activeMode: EditorViewMode;
  onModeChange: (mode: EditorViewMode) => void;
}) {
  if (modes.length <= 1) return null;
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] justify-end"
      aria-label="当前文件视图模式"
    >
      <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-panel/90 p-1 text-xs shadow-lg backdrop-blur">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            title={mode.title}
            aria-label={`切换到${mode.label}`}
            data-workspace-editor-mode={mode.id}
            onClick={() => onModeChange(mode.id as EditorViewMode)}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 outline-none transition-colors hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)]",
              activeMode === mode.id
                ? "bg-primary-soft text-primary"
                : "text-muted",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
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
  viewMode: EditorViewMode;
  searchRequest?: WorkspaceEditorSearchRequest | null;
  onViewModeChange: (mode: EditorViewMode) => void;
}

function EditorPane({
  path,
  rootId,
  readQuery,
  effectiveContent,
  onEdit,
  viewMode,
  searchRequest = null,
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
      mode={viewMode}
      defaultMode="source"
      onModeChange={onViewModeChange}
      initialSearch={searchRequest}
      onChange={onEdit}
      showModeSwitcher={false}
      minHeightClassName="min-h-0"
      className="h-full"
    />
  );
}
