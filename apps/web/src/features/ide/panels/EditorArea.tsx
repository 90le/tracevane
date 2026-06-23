import { FileCode, Columns2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Button } from "@/design/ui/button";
import { useFileReadQuery, useWriteFileContentMutation } from "@/lib/query/files";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { CodeEditor } from "@/features/ide/editor/CodeEditor";
import { EditorTabs } from "@/features/ide/editor/EditorTabs";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EditorAreaProps {
  /** Path of the file currently "open" (set by the explorer). */
  openFile?: string;
  /** Root id the open file lives under. */
  rootId?: string;
  /** Optional sink for the active file's save state (wired to StatusBar). */
  onSaveStateChange?: (state: "idle" | "dirty" | "saving" | "saved") => void;
}

// ---------------------------------------------------------------------------
// Internal: confirm-close dialog state
// ---------------------------------------------------------------------------

interface ConfirmCloseState {
  path: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Multi-tab editor area for the Workspace IDE.
 *
 * ## Tab model
 *
 * Tabs are owned here (`openTabs: string[]`). When `openFile` (from the
 * explorer / IdeShell) changes to a path not already open, it is pushed onto
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
 * ## Split (P1)
 *
 * `split` toggles a second editor pane. To keep P1 minimal the second pane
 * mirrors the active file (same path) — there is no multi-pane tab
 * management. This avoids overbuilding and is enough to lay out the
 * split UI seam for a later task.
 */
export function EditorArea({
  openFile,
  rootId,
  onSaveStateChange,
}: EditorAreaProps) {
  // --- Tab state ----------------------------------------------------------
  const [openTabs, setOpenTabs] = React.useState<string[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const [split, setSplit] = React.useState(false);

  // dirty[path] = edited content. Present => user has typed. Dirty iff
  // dirty[path] !== loadedContent (computed below per active path).
  const [dirty, setDirty] = React.useState<Record<string, string>>({});
  const [savingPath, setSavingPath] = React.useState<string | null>(null);

  // Confirm-close dialog (one at a time).
  const [confirmClose, setConfirmClose] =
    React.useState<ConfirmCloseState | null>(null);

  // --- Push openFile into tabs when it changes ---------------------------
  React.useEffect(() => {
    if (!openFile) return;
    setOpenTabs((prev) =>
      prev.includes(openFile) ? prev : [...prev, openFile],
    );
    setActive(openFile);
  }, [openFile]);

  // --- Active file content ----------------------------------------------
  const readParams =
    rootId && active ? { rootId, path: active } : null;
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

  // --- Report save state to the StatusBar (via IdeShell) -----------------
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
  const closeTab = React.useCallback(
    (path: string) => {
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
    },
    [],
  );

  const handleCloseRequested = React.useCallback(
    (path: string) => {
      const edited = dirty[path];
      // Conservative dirty check for inactive tabs (see dirtySet memo).
      const isDirty =
        edited !== undefined &&
        (path !== active || edited !== loadedContent);
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

  // --- Render -----------------------------------------------------------
  const showEmpty = openTabs.length === 0;
  const fileName = active ? active.split("/").pop() || active : null;

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas outline-none"
    >
      <EditorTabs
        tabs={openTabs}
        active={active}
        dirtyPaths={dirtySet}
        savingPath={savingPath}
        onSelect={setActive}
        onClose={handleCloseRequested}
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
        <div
          className={
            split
              ? "grid min-h-0 min-w-0 grid-cols-2 divide-x divide-line overflow-hidden"
              : "grid min-h-0 min-w-0 overflow-hidden"
          }
        >
          <EditorPane
            path={active}
            readQuery={readQuery}
            loadedContent={loadedContent}
            onEdit={(v) =>
              active &&
              setDirty((d) => ({ ...d, [active]: v }))
            }
            split={split}
            onToggleSplit={() => setSplit((s) => !s)}
          />
          {split && active ? (
            <EditorPane
              path={active}
              readQuery={readQuery}
              loadedContent={loadedContent}
              onEdit={(v) =>
                active &&
                setDirty((d) => ({ ...d, [active]: v }))
              }
              split={split}
              onToggleSplit={() => setSplit((s) => !s)}
              splitPane
            />
          ) : null}
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
            <Button
              variant="ghost"
              onClick={() => setConfirmClose(null)}
            >
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

// ---------------------------------------------------------------------------
// EditorPane — renders one editor (or its loading/error/empty state) plus a
// tiny split toolbar in the corner.
// ---------------------------------------------------------------------------

interface EditorPaneProps {
  path: string | null;
  readQuery: ReturnType<typeof useFileReadQuery>;
  loadedContent: string;
  onEdit: (value: string) => void;
  split: boolean;
  onToggleSplit: () => void;
  splitPane?: boolean;
}

function EditorPane({
  path,
  readQuery,
  loadedContent,
  onEdit,
  split,
  onToggleSplit,
  splitPane = false,
}: EditorPaneProps) {
  const hasContent = readQuery.data?.content !== null;
  return (
    <div className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden">
      {!splitPane ? (
        <div className="absolute right-2 top-2 z-10">
          <Button
            variant="ghost"
            size="icon"
            aria-label={split ? "关闭分屏" : "分屏"}
            onClick={onToggleSplit}
          >
            <Columns2 className="size-4" />
          </Button>
        </div>
      ) : null}

      {path === null ? null : readQuery.isLoading ? (
        <div className="grid gap-2 p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : readQuery.isError ? (
        <ErrorState
          title="无法打开文件"
          description={
            readQuery.error instanceof Error
              ? readQuery.error.message
              : undefined
          }
        />
      ) : !hasContent ? (
        // Non-text file (binary / image / no textual content) — CodeMirror
        // can't edit it. Show an empty state instead of a blank editor.
        <EmptyState
          title="无法以文本打开"
          description="该文件不是可编辑的文本文件。"
          icon={<FileCode />}
        />
      ) : (
        <CodeEditor
          key={path}
          path={path}
          initialContent={loadedContent}
          onChange={onEdit}
        />
      )}
    </div>
  );
}
