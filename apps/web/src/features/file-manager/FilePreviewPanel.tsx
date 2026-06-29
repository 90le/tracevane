import * as React from "react";
import {
  File,
  FileDiff,
  Folder,
  History,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { toast } from "@/design/ui/sonner";
import { readFileVersion } from "@/lib/api/files";
import {
  DocumentWorkbench,
  buildFileDownloadUrl,
  type DocumentWorkbenchMode,
} from "@/features/workspace/shared";
import {
  useDeleteFileVersionMutation,
  useFileReadQuery,
  useFileVersionReadQuery,
  useFileVersionsQuery,
  useWriteFileContentMutation,
} from "@/lib/query/files";
import type { FileEntrySummary } from "@/features/workspace/files";
import type { FilesVersionItem } from "../../../../../types/files";

interface FilePreviewTab {
  id: string;
  rootId: string;
  entry: FileEntrySummary;
}

type FilePreviewSaveHandler = () => Promise<boolean>;
type FilePreviewDialogSize = { width: number; height: number };

const FILE_PREVIEW_DIALOG_MIN_SIZE: FilePreviewDialogSize = {
  width: 720,
  height: 520,
};
const FILE_PREVIEW_DIALOG_MARGIN = 24;
const FILE_PREVIEW_DIALOG_KEYBOARD_STEP = 32;

export function FilePreviewDialog({
  rootId,
  entry,
  readQuery,
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenChange,
}: {
  rootId: string;
  entry: FileEntrySummary | undefined;
  readQuery: ReturnType<typeof useFileReadQuery>;
  tabs?: FilePreviewTab[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [dirty, setDirty] = React.useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);
  const [savingAndClosing, setSavingAndClosing] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [dialogSize, setDialogSize] =
    React.useState<FilePreviewDialogSize | null>(null);
  const [compactViewport, setCompactViewport] = React.useState(false);
  const saveHandlerRef = React.useRef<FilePreviewSaveHandler | null>(null);
  const resizeStateRef = React.useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const clampDialogSize = React.useCallback(
    (size: FilePreviewDialogSize): FilePreviewDialogSize => {
      if (typeof window === "undefined") return size;
      const maxWidth = Math.max(
        320,
        window.innerWidth - FILE_PREVIEW_DIALOG_MARGIN,
      );
      const maxHeight = Math.max(
        320,
        window.innerHeight - FILE_PREVIEW_DIALOG_MARGIN,
      );
      const minWidth = Math.min(FILE_PREVIEW_DIALOG_MIN_SIZE.width, maxWidth);
      const minHeight = Math.min(
        FILE_PREVIEW_DIALOG_MIN_SIZE.height,
        maxHeight,
      );
      return {
        width: Math.min(Math.max(size.width, minWidth), maxWidth),
        height: Math.min(Math.max(size.height, minHeight), maxHeight),
      };
    },
    [],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateCompactViewport = () =>
      setCompactViewport(window.innerWidth < 640);
    updateCompactViewport();
    window.addEventListener("resize", updateCompactViewport);
    return () => window.removeEventListener("resize", updateCompactViewport);
  }, []);

  const currentDialogSize = React.useCallback((): FilePreviewDialogSize => {
    if (dialogSize) return dialogSize;
    if (typeof window === "undefined") return { width: 1180, height: 860 };
    return clampDialogSize({
      width: Math.min(window.innerWidth * 0.94, 1180),
      height: Math.min(window.innerHeight * 0.86, 860),
    });
  }, [clampDialogSize, dialogSize]);

  const requestOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        onOpenChange(true);
        return;
      }
      if (dirty) {
        setConfirmDiscardOpen(true);
        return;
      }
      onOpenChange(false);
    },
    [dirty, onOpenChange],
  );

  const discardAndClose = React.useCallback(() => {
    if (entry?.kind === "file") {
      clearFileUnsavedDraft(rootId, entry.path);
    }
    setConfirmDiscardOpen(false);
    setDirty(false);
    onOpenChange(false);
  }, [entry, onOpenChange, rootId]);

  const reviewSaveAndClose = React.useCallback(async () => {
    const requestReviewedSave = saveHandlerRef.current;
    if (!requestReviewedSave || savingAndClosing) return;
    setSavingAndClosing(true);
    try {
      const saved = await requestReviewedSave();
      if (!saved) return;
      setConfirmDiscardOpen(false);
      setDirty(false);
      onOpenChange(false);
    } finally {
      setSavingAndClosing(false);
    }
  }, [onOpenChange, savingAndClosing]);

  React.useEffect(() => {
    if (!dirty) return undefined;
    const preventDataLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventDataLoss);
    return () => window.removeEventListener("beforeunload", preventDataLoss);
  }, [dirty]);

  React.useEffect(() => {
    if (!dialogSize) return undefined;
    const handleResize = () =>
      setDialogSize((size) => (size ? clampDialogSize(size) : size));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampDialogSize, dialogSize]);

  React.useEffect(
    () => () => {
      resizeStateRef.current = null;
    },
    [],
  );

  const resizeDialogBy = React.useCallback(
    (deltaWidth: number, deltaHeight: number) => {
      setMaximized(false);
      setDialogSize((size) => {
        const base = size ?? currentDialogSize();
        return clampDialogSize({
          width: base.width + deltaWidth,
          height: base.height + deltaHeight,
        });
      });
    },
    [clampDialogSize, currentDialogSize],
  );

  const startResize = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (maximized || event.button !== 0) return;
      event.preventDefault();
      const base = currentDialogSize();
      resizeStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: base.width,
        startHeight: base.height,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      const onPointerMove = (moveEvent: PointerEvent) => {
        const state = resizeStateRef.current;
        if (!state) return;
        setDialogSize(
          clampDialogSize({
            width: state.startWidth + moveEvent.clientX - state.startX,
            height: state.startHeight + moveEvent.clientY - state.startY,
          }),
        );
      };
      const onPointerUp = () => {
        resizeStateRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [clampDialogSize, currentDialogSize, maximized],
  );

  if (!entry) {
    return (
      <Dialog open onOpenChange={requestOpenChange}>
        <DialogContent
          className="w-[min(92vw,520px)]"
          data-file-preview-missing-target
        >
          <DialogHeader>
            <DialogTitle>文件预览目标不可用</DialogTitle>
            <DialogDescription>
              文件列表刷新或路径切换后，当前预览目标已不在可用列表中。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="text-sm text-muted">
            请关闭弹窗后重新双击文件；前端会保留主文件管理器，不再因为缺失预览目标显示空白。
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="primary"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <>
      <Dialog open onOpenChange={requestOpenChange}>
        <DialogContent
          data-file-preview-dialog
          className={
            maximized
              ? "grid h-[100dvh] w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-none p-0 sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)] sm:rounded-lg"
              : "grid h-[100dvh] w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-none p-0 sm:h-[min(86dvh,860px)] sm:w-[min(94vw,1180px)] sm:rounded-lg"
          }
          style={
            !maximized && dialogSize && !compactViewport
              ? {
                  width: `${dialogSize.width}px`,
                  height: `${dialogSize.height}px`,
                }
              : undefined
          }
        >
          <DialogHeader className="grid min-h-0 grid-rows-[auto_auto] border-b border-line bg-panel-2 p-0 pr-12 sm:pr-24">
            <FilePreviewTabStrip
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
            />
            <div className="grid min-w-0 gap-2 px-3 py-2 sm:flex sm:items-start sm:gap-3 sm:px-4 sm:py-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm sm:text-base">
                  {entry.name}
                </DialogTitle>
                <DialogDescription className="truncate text-2xs sm:text-xs">
                  {entry.path} ·{" "}
                  <span className="hidden sm:inline">
                    在线预览/编辑 · 可多标签打开文件 · 拖拽右下角调整窗口尺寸
                  </span>
                  <span className="sm:hidden">在线预览/编辑</span>
                </DialogDescription>
              </div>
              <div className="hidden min-w-0 items-center gap-2 overflow-x-auto sm:flex sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-7 shrink-0 px-2 text-xs sm:inline-flex"
                  onClick={() => {
                    setMaximized(false);
                    setDialogSize(null);
                  }}
                >
                  默认尺寸
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => setMaximized((value) => !value)}
                  aria-label={
                    maximized
                      ? "还原文件预览编辑窗口"
                      : "最大化文件预览编辑窗口"
                  }
                >
                  {maximized ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                  {maximized ? "还原" : "最大化"}
                </Button>
              </div>
            </div>
          </DialogHeader>
          <DialogBody
            className="min-h-0 overflow-hidden p-0"
            data-file-preview-dialog-body
          >
            <FileDetailsPanel
              rootId={rootId}
              entry={entry}
              readQuery={readQuery}
              onOpenDirectory={() => undefined}
              className="h-full rounded-none border-0"
              modal
              onDirtyChange={setDirty}
              onSaveHandlerChange={(handler) => {
                saveHandlerRef.current = handler;
              }}
            />
          </DialogBody>
          {!maximized ? (
            <button
              type="button"
              aria-label="调整文件预览编辑窗口尺寸"
              title="拖拽调整窗口尺寸；聚焦后可用方向键调整"
              data-file-preview-resize-handle
              className="absolute bottom-1 right-1 z-10 hidden size-5 cursor-nwse-resize rounded-sm text-subtle outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] sm:block"
              onPointerDown={startResize}
              onKeyDown={(event) => {
                const step = event.shiftKey
                  ? FILE_PREVIEW_DIALOG_KEYBOARD_STEP * 3
                  : FILE_PREVIEW_DIALOG_KEYBOARD_STEP;
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  resizeDialogBy(step, 0);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  resizeDialogBy(-step, 0);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  resizeDialogBy(0, step);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  resizeDialogBy(0, -step);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setDialogSize(FILE_PREVIEW_DIALOG_MIN_SIZE);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setDialogSize(currentDialogSize());
                }
              }}
            >
              <span className="absolute bottom-1 right-1 block size-3 rounded-br border-b-2 border-r-2 border-current" />
            </button>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>关闭文件预览/编辑</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <strong>{entry.name}</strong>{" "}
            有未保存的更改。可以先保存再关闭，或明确丢弃这些编辑。
          </DialogBody>
          <DialogFooter className="grid grid-cols-1 gap-2 sm:flex">
            <Button
              variant="ghost"
              onClick={() => setConfirmDiscardOpen(false)}
              disabled={savingAndClosing}
            >
              继续编辑
            </Button>
            <Button
              variant="outline"
              onClick={() => void reviewSaveAndClose()}
              disabled={savingAndClosing}
            >
              {savingAndClosing ? "等待审阅…" : "审阅差异并保存关闭"}
            </Button>
            <Button
              variant="danger"
              onClick={discardAndClose}
              disabled={savingAndClosing}
            >
              不保存并关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FilePreviewTabStrip({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: {
  tabs: FilePreviewTab[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
}) {
  if (!tabs.length) return null;
  return (
    <div
      className="flex min-h-10 items-end overflow-x-auto border-b border-line bg-panel px-2 pt-2"
      role="tablist"
      aria-label="已打开文件"
      data-file-preview-tab-strip
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "mr-1 flex h-8 max-w-[220px] shrink-0 items-center rounded-t-lg border border-b-0 border-line text-xs text-muted transition-colors hover:bg-panel-2 hover:text-ink-strong",
              active && "bg-panel-2 text-ink-strong shadow-sm",
            )}
            title={`${tab.entry.name} · ${tab.entry.path}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
              data-file-preview-tab={tab.id}
              onClick={() => onSelectTab?.(tab.id)}
            >
              <File className="size-3.5 shrink-0" />
              <span className="truncate">{tab.entry.name}</span>
            </button>
            {tabs.length > 1 ? (
              <button
                type="button"
                aria-label={`关闭 ${tab.entry.name}`}
                className="mr-1 rounded p-0.5 text-subtle hover:bg-panel hover:text-danger"
                onClick={() => onCloseTab?.(tab.id)}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FileDetailsPanel({
  rootId,
  entry,
  readQuery,
  onOpenDirectory,
  className,
  modal = false,
  onDirtyChange,
  onSaveHandlerChange,
}: {
  rootId: string;
  entry: FileEntrySummary | undefined;
  readQuery: ReturnType<typeof useFileReadQuery>;
  onOpenDirectory: (path: string) => void;
  className?: string;
  modal?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveHandlerChange?: (handler: FilePreviewSaveHandler | null) => void;
}) {
  const writeMutation = useWriteFileContentMutation();
  const deleteVersionMutation = useDeleteFileVersionMutation();
  const [draft, setDraft] = React.useState<{
    key: string;
    content: string;
  } | null>(null);
  const [viewMode, setViewMode] =
    React.useState<DocumentWorkbenchMode>("preview");
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [restoredDraftAt, setRestoredDraftAt] = React.useState<string | null>(
    null,
  );
  const restoredDraftKeyRef = React.useRef<string | null>(null);
  const [versionSnapshots, setVersionSnapshots] = React.useState<
    FileVersionSnapshot[]
  >([]);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const fileKey = entry ? `${rootId}:${entry.path}` : "";
  const read = readQuery.data;
  const loadedContent = read?.content ?? "";
  const draftContent = draft?.key === fileKey ? draft.content : null;
  const effectiveContent = draftContent ?? loadedContent;
  const editable = Boolean(
    entry?.kind === "file" && read?.editable && read?.textLike,
  );
  const dirty = draftContent !== null && draftContent !== loadedContent;
  const preferredInitialMode = entry
    ? initialFilePreviewMode(entry, read)
    : "preview";
  const serverVersionsQuery = useFileVersionsQuery(
    rootId,
    entry?.kind === "file" ? entry.path : null,
    { enabled: Boolean(entry?.kind === "file") },
  );
  const serverVersions = serverVersionsQuery.data?.versions ?? [];

  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  React.useEffect(() => {
    setDraft(null);
    setViewMode(preferredInitialMode);
    setSaveError(null);
    setLastSavedAt(null);
    setRestoredDraftAt(null);
    restoredDraftKeyRef.current = null;
    setVersionSnapshots(
      entry ? loadFileVersionSnapshots(rootId, entry.path) : [],
    );
    onDirtyChange?.(false);
  }, [entry, fileKey, onDirtyChange, preferredInitialMode, rootId]);

  React.useEffect(() => {
    if (!entry || entry.kind !== "file" || !editable || !read) return;
    if (restoredDraftKeyRef.current === fileKey) return;
    restoredDraftKeyRef.current = fileKey;
    const savedDraft = loadFileUnsavedDraft(rootId, entry.path);
    if (!savedDraft || savedDraft.content === loadedContent) {
      return;
    }
    setSaveError(null);
    setDraft({ key: fileKey, content: savedDraft.content });
    setRestoredDraftAt(savedDraft.updatedAt);
    toast.info("已恢复未保存草稿", {
      description: "草稿仅在当前浏览器保存，请审阅后手动保存到文件。",
    });
  }, [editable, entry, fileKey, loadedContent, read, rootId]);

  React.useEffect(() => {
    if (!entry || entry.kind !== "file" || !editable || draftContent === null) {
      return undefined;
    }
    if (draftContent === loadedContent) {
      clearFileUnsavedDraft(rootId, entry.path);
      setRestoredDraftAt(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      persistFileUnsavedDraft(rootId, entry, draftContent, loadedContent);
      setRestoredDraftAt((value) => value ?? new Date().toISOString());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftContent, editable, entry, loadedContent, rootId]);

  const restoreVersionSnapshot = React.useCallback(
    (snapshot: FileVersionSnapshot) => {
      if (!entry) return;
      setSaveError(null);
      setDraft({ key: fileKey, content: snapshot.content });
      toast.success("已恢复到草稿", {
        description: "请审阅后保存，才会写回文件。",
      });
    },
    [entry, fileKey],
  );

  const deleteVersionSnapshot = React.useCallback(
    (snapshotId: string) => {
      if (!entry) return;
      const next = deleteFileVersionSnapshot(rootId, entry.path, snapshotId);
      setVersionSnapshots(next);
    },
    [entry, rootId],
  );

  const restoreServerVersion = React.useCallback(
    async (versionId: string) => {
      if (!entry) return;
      try {
        const version = await readFileVersion(rootId, entry.path, versionId);
        setSaveError(null);
        setDraft({ key: fileKey, content: version.content });
        toast.success("已恢复服务器历史到草稿", {
          description: "请审阅差异后保存。",
        });
      } catch (error) {
        toast.error("恢复历史失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [entry, fileKey, rootId],
  );

  const deleteServerVersion = React.useCallback(
    async (versionId: string) => {
      if (!entry) return;
      try {
        await deleteVersionMutation.mutateAsync({
          rootId,
          path: entry.path,
          versionId,
        });
        await serverVersionsQuery.refetch();
        toast.success("已删除服务器历史版本");
      } catch (error) {
        toast.error("删除历史失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [deleteVersionMutation, entry, rootId, serverVersionsQuery],
  );

  const saveDraft = React.useCallback(async (): Promise<boolean> => {
    if (!entry || !editable || !dirty) return true;
    try {
      await writeMutation.mutateAsync({
        rootId,
        path: entry.path,
        content: effectiveContent,
      });
      const nextSnapshots = persistFileVersionSnapshot(
        rootId,
        entry,
        loadedContent,
      );
      setVersionSnapshots(nextSnapshots);
      clearFileUnsavedDraft(rootId, entry.path);
      setDraft(null);
      setRestoredDraftAt(null);
      setSaveError(null);
      setLastSavedAt(new Date().toISOString());
      toast.success(`已保存 · ${entry.name}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      toast.error("保存失败", { description: message });
      return false;
    }
  }, [
    dirty,
    editable,
    effectiveContent,
    entry,
    loadedContent,
    rootId,
    writeMutation,
  ]);

  React.useEffect(() => {
    if (modal) return undefined;
    onSaveHandlerChange?.(saveDraft);
    return () => onSaveHandlerChange?.(null);
  }, [modal, onSaveHandlerChange, saveDraft]);

  if (!entry) {
    return (
      <aside
        className={`rounded-md border border-line bg-panel px-4 py-8 text-center text-sm text-muted ${className ?? ""}`}
      >
        <File className="mx-auto mb-2 size-8 text-subtle" />
        <div className="font-medium text-ink-strong">文件详情</div>
        <p className="mt-1 text-xs">
          双击文件或通过右键菜单打开弹窗预览/编辑。
        </p>
      </aside>
    );
  }

  const downloadUrl =
    entry.kind === "file"
      ? buildFileDownloadUrl(rootId, entry.path, false)
      : null;
  const attachmentUrl =
    entry.kind === "file"
      ? buildFileDownloadUrl(rootId, entry.path, true)
      : null;
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className={`overflow-hidden rounded-md border border-line bg-panel outline-none ${modal ? "grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]" : ""} ${className ?? ""}`}
    >
      {!modal ? (
        <div className="border-b border-line bg-panel-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {entry.kind === "directory" ? (
              <Folder className="size-4 text-primary" />
            ) : (
              <File className="size-4 text-muted" />
            )}
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-strong">
              文件详情
            </h2>
            {entry.kind === "file" ? (
              <span className="rounded-full bg-panel px-2 py-0.5 text-2xs text-muted">
                {dirty ? "● 未保存" : viewModeLabel(viewMode)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted" title={entry.path}>
            {entry.path || entry.name}
          </p>
        </div>
      ) : null}

      {modal && entry.kind === "file" ? (
        <FilePreviewEditorShell
          entry={entry}
          read={read}
          readQuery={readQuery}
          rootId={rootId}
          downloadUrl={downloadUrl}
          attachmentUrl={attachmentUrl}
          editable={editable}
          dirty={dirty}
          writePending={writeMutation.isPending}
          saveError={saveError}
          lastSavedAt={lastSavedAt}
          restoredDraftAt={restoredDraftAt}
          metadataOpen={metadataOpen}
          onMetadataOpenChange={setMetadataOpen}
          onSave={saveDraft}
          onSaveHandlerChange={onSaveHandlerChange}
          versionSnapshots={versionSnapshots}
          serverVersions={serverVersions}
          versionsLoading={serverVersionsQuery.isLoading}
          versionsRestoring={false}
          versionsDeleting={deleteVersionMutation.isPending}
          onRestoreVersion={restoreVersionSnapshot}
          onDeleteVersion={deleteVersionSnapshot}
          onRestoreServerVersion={restoreServerVersion}
          onDeleteServerVersion={deleteServerVersion}
          fileKey={fileKey}
          effectiveContent={effectiveContent}
          viewMode={viewMode}
          preferredInitialMode={preferredInitialMode}
          onModeChange={setViewMode}
          onChange={(content) => {
            setSaveError(null);
            setDraft({ key: fileKey, content });
          }}
        />
      ) : (
        <div className="grid gap-3 p-4 text-xs">
          <FilePreviewMetadataGrid entry={entry} />

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {entry.kind === "directory" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenDirectory(entry.path)}
              >
                打开目录
              </Button>
            ) : (
              <>
                {downloadUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(downloadUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    打开预览
                  </Button>
                ) : null}
                {attachmentUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        attachmentUrl,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    下载
                  </Button>
                ) : null}
                {editable ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void saveDraft()}
                    disabled={!dirty || writeMutation.isPending}
                    title="Ctrl/⌘+S 保存当前文件"
                  >
                    <Save className="size-3.5" />
                    {writeMutation.isPending
                      ? "保存中..."
                      : dirty
                        ? "保存修改"
                        : "已保存"}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {entry.kind === "file" ? (
            <section className="border-t border-line pt-3">
              <FilePreviewWorkbench
                entry={entry}
                read={read}
                readQuery={readQuery}
                rootId={rootId}
                downloadUrl={downloadUrl}
                fileKey={fileKey}
                effectiveContent={effectiveContent}
                editable={editable}
                viewMode={viewMode}
                preferredInitialMode={preferredInitialMode}
                onModeChange={setViewMode}
                onChange={(content) => {
                  setSaveError(null);
                  setDraft({ key: fileKey, content });
                }}
              />
            </section>
          ) : null}
        </div>
      )}

      {modal && entry.kind === "file" ? (
        <FilePreviewEditorStatusBar
          entry={entry}
          dirty={dirty}
          editable={editable}
          viewMode={viewMode}
          readOnlyReason={read?.editable === false ? "只读" : undefined}
          mimeType={read?.mimeType}
          contentBytes={read?.contentBytes}
          saveError={saveError}
          lastSavedAt={lastSavedAt}
        />
      ) : null}
    </aside>
  );
}

function FilePreviewEditorShell({
  entry,
  read,
  readQuery,
  rootId,
  downloadUrl,
  attachmentUrl,
  editable,
  dirty,
  writePending,
  saveError,
  lastSavedAt,
  restoredDraftAt,
  metadataOpen,
  onMetadataOpenChange,
  onSave,
  onSaveHandlerChange,
  versionSnapshots,
  serverVersions,
  versionsLoading,
  versionsRestoring,
  versionsDeleting,
  onRestoreVersion,
  onDeleteVersion,
  onRestoreServerVersion,
  onDeleteServerVersion,
  fileKey,
  effectiveContent,
  viewMode,
  preferredInitialMode,
  onModeChange,
  onChange,
}: {
  entry: FileEntrySummary;
  read: ReturnType<typeof useFileReadQuery>["data"];
  readQuery: ReturnType<typeof useFileReadQuery>;
  rootId: string;
  downloadUrl: string | null;
  attachmentUrl: string | null;
  editable: boolean;
  dirty: boolean;
  writePending: boolean;
  saveError: string | null;
  lastSavedAt: string | null;
  restoredDraftAt: string | null;
  metadataOpen: boolean;
  onMetadataOpenChange: (open: boolean) => void;
  onSave: () => Promise<boolean>;
  onSaveHandlerChange?: (handler: FilePreviewSaveHandler | null) => void;
  versionSnapshots: FileVersionSnapshot[];
  serverVersions: FilesVersionItem[];
  versionsLoading: boolean;
  versionsRestoring: boolean;
  versionsDeleting: boolean;
  onRestoreVersion: (snapshot: FileVersionSnapshot) => void;
  onDeleteVersion: (snapshotId: string) => void;
  onRestoreServerVersion: (versionId: string) => void;
  onDeleteServerVersion: (versionId: string) => void;
  fileKey: string;
  effectiveContent: string;
  viewMode: DocumentWorkbenchMode;
  preferredInitialMode: DocumentWorkbenchMode;
  onModeChange: (mode: DocumentWorkbenchMode) => void;
  onChange: (content: string) => void;
}) {
  const [saveReviewOpen, setSaveReviewOpen] = React.useState(false);
  const pendingReviewedSaveRef = React.useRef<
    ((saved: boolean) => void) | null
  >(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = React.useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false);
  const saveDiffLines = React.useMemo(
    () => createFileSaveDiffLines(read?.content ?? "", effectiveContent),
    [effectiveContent, read?.content],
  );

  React.useEffect(() => {
    if (!dirty) setSaveReviewOpen(false);
  }, [dirty]);

  const requestSave = React.useCallback(() => {
    if (!dirty || writePending) return;
    setSaveReviewOpen(true);
  }, [dirty, writePending]);

  const requestReviewedSave = React.useCallback((): Promise<boolean> => {
    if (!dirty) return Promise.resolve(true);
    if (writePending) return Promise.resolve(false);
    setSaveReviewOpen(true);
    return new Promise((resolve) => {
      pendingReviewedSaveRef.current = resolve;
    });
  }, [dirty, writePending]);

  React.useEffect(() => {
    onSaveHandlerChange?.(requestReviewedSave);
    return () => onSaveHandlerChange?.(null);
  }, [onSaveHandlerChange, requestReviewedSave]);

  const resolvePendingReviewedSave = React.useCallback((saved: boolean) => {
    pendingReviewedSaveRef.current?.(saved);
    pendingReviewedSaveRef.current = null;
  }, []);

  const confirmSave = React.useCallback(async () => {
    const saved = await onSave();
    if (saved) setSaveReviewOpen(false);
    resolvePendingReviewedSave(saved);
  }, [onSave, resolvePendingReviewedSave]);

  const handleSaveReviewOpenChange = React.useCallback(
    (open: boolean) => {
      setSaveReviewOpen(open);
      if (!open) resolvePendingReviewedSave(false);
    },
    [resolvePendingReviewedSave],
  );

  const handleEditorShellKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      requestSave();
    },
    [requestSave],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden text-xs"
      data-file-preview-editor-shell
      data-file-preview-path={entry.path}
      data-file-preview-save-shortcut="review-diff-first"
      onKeyDown={handleEditorShellKeyDown}
    >
      <div
        className="grid min-w-0 gap-2 border-b border-line bg-panel px-3 py-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:px-4"
        data-file-preview-editor-toolbar
      >
        <div
          className="flex min-w-0 items-center gap-2"
          data-file-preview-editor-toolbar-primary
        >
          <span className="rounded-full bg-panel-2 px-2 py-1 font-mono text-2xs text-muted">
            {editorLanguageLabel(entry.path)}
          </span>
          <span className="hidden rounded-full bg-panel-2 px-2 py-1 text-2xs text-muted min-[420px]:inline-flex">
            {formatBytes(read?.contentBytes ?? entry.size ?? 0)}
          </span>
          {restoredDraftAt && dirty ? (
            <span
              className="rounded-full bg-warning/10 px-2 py-1 text-2xs font-medium text-warning"
              title={`本地草稿恢复于 ${formatFileDateTime(restoredDraftAt)}`}
              data-file-unsaved-draft-restored
            >
              已恢复草稿
            </span>
          ) : null}
          {entry.permissions ? (
            <span className="hidden rounded-full bg-panel-2 px-2 py-1 font-mono text-2xs text-muted lg:inline-flex">
              {entry.permissions} ({entry.mode})
            </span>
          ) : null}
          <span className="hidden min-w-0 flex-1 truncate text-subtle md:block">
            专注式弹窗编辑器 · 双击打开 · 右键预览/编辑 · Ctrl/⌘+S 保存
          </span>
          <span className="min-w-0 flex-1" aria-hidden="true" />
          {editable ? (
            <Button
              variant="primary"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs sm:hidden"
              onClick={requestSave}
              disabled={!dirty || writePending}
              title="Ctrl/⌘+S 保存当前文件；按钮保存前会先打开差异审阅"
            >
              <Save className="size-3.5" />
              {writePending ? "保存中" : dirty ? "保存" : "已保存"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={mobileToolsOpen ? "primary" : "outline"}
            size="sm"
            className="h-7 shrink-0 px-2 text-xs sm:hidden"
            onClick={() => setMobileToolsOpen((value) => !value)}
            aria-expanded={mobileToolsOpen}
            aria-label="展开文件预览更多操作"
          >
            <MoreHorizontal className="size-3.5" />
            更多
          </Button>
        </div>
        <div
          className={cn(
            "grid max-h-[32dvh] grid-cols-2 gap-2 overflow-auto border-t border-line pt-2 sm:hidden",
            !mobileToolsOpen && "hidden",
          )}
          data-file-preview-mobile-tools
        >
          <Button
            type="button"
            variant={metadataOpen ? "primary" : "outline"}
            size="sm"
            className="h-8 justify-center px-2 text-xs"
            onClick={() => onMetadataOpenChange(!metadataOpen)}
          >
            {metadataOpen ? "隐藏属性" : "显示属性"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 justify-center px-2 text-xs"
            onClick={() => setVersionHistoryOpen(true)}
            title="查看本浏览器保存前版本快照"
          >
            <History className="size-3.5" />
            历史版本
            {serverVersions.length + versionSnapshots.length
              ? ` ${serverVersions.length + versionSnapshots.length}`
              : ""}
          </Button>
          {downloadUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 justify-center px-2 text-xs"
              onClick={() =>
                window.open(downloadUrl, "_blank", "noopener,noreferrer")
              }
            >
              打开预览
            </Button>
          ) : null}
          {attachmentUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 justify-center px-2 text-xs"
              onClick={() =>
                window.open(attachmentUrl, "_blank", "noopener,noreferrer")
              }
            >
              下载
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 justify-center px-2 text-xs"
              onClick={() => setSaveReviewOpen(true)}
              disabled={!dirty}
              title="保存前审阅当前草稿与磁盘内容的差异"
            >
              <FileDiff className="size-3.5" />
              审阅差异
            </Button>
          ) : null}
        </div>
        <div
          className="hidden min-w-0 flex-wrap items-center gap-2 sm:flex"
          data-file-preview-desktop-tools
        >
          <Button
            type="button"
            variant={metadataOpen ? "primary" : "outline"}
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => onMetadataOpenChange(!metadataOpen)}
          >
            {metadataOpen ? "隐藏属性" : "显示属性"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => setVersionHistoryOpen(true)}
            title="查看本浏览器保存前版本快照"
          >
            <History className="size-3.5" />
            历史版本
            {serverVersions.length + versionSnapshots.length
              ? ` ${serverVersions.length + versionSnapshots.length}`
              : ""}
          </Button>
          {downloadUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() =>
                window.open(downloadUrl, "_blank", "noopener,noreferrer")
              }
            >
              打开预览
            </Button>
          ) : null}
          {attachmentUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() =>
                window.open(attachmentUrl, "_blank", "noopener,noreferrer")
              }
            >
              下载
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setSaveReviewOpen(true)}
                disabled={!dirty}
                title="保存前审阅当前草稿与磁盘内容的差异"
              >
                <FileDiff className="size-3.5" />
                审阅差异
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={requestSave}
                disabled={!dirty || writePending}
                title="Ctrl/⌘+S 保存当前文件；按钮保存前会先打开差异审阅"
              >
                <Save className="size-3.5" />
                {writePending ? "保存中..." : dirty ? "保存修改" : "已保存"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {saveError ? (
        <div
          role="alert"
          data-file-save-error
          className="flex flex-wrap items-center gap-2 border-b border-danger/30 bg-danger/5 px-4 py-2 text-xs text-danger"
        >
          <span className="font-semibold">保存失败</span>
          <span className="min-w-0 flex-1 truncate" title={saveError}>
            {saveError}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onSave}
            disabled={!dirty || writePending}
          >
            {writePending ? "重试中..." : "重试保存"}
          </Button>
        </div>
      ) : lastSavedAt ? (
        <div
          role="status"
          data-file-save-status
          className="border-b border-line bg-success/5 px-4 py-1.5 text-2xs text-success"
        >
          最近保存：{new Date(lastSavedAt).toLocaleString()}
        </div>
      ) : null}
      {metadataOpen ? (
        <div
          className="max-h-[30dvh] overflow-auto border-b border-line bg-panel-2 px-4 py-3"
          data-file-preview-metadata
        >
          <FilePreviewMetadataGrid entry={entry} compact />
        </div>
      ) : null}
      <section
        className="min-h-0 flex-1 overflow-hidden"
        data-file-preview-workbench-region
      >
        <FilePreviewWorkbench
          entry={entry}
          read={read}
          readQuery={readQuery}
          rootId={rootId}
          downloadUrl={downloadUrl}
          fileKey={fileKey}
          effectiveContent={effectiveContent}
          editable={editable}
          viewMode={viewMode}
          preferredInitialMode={preferredInitialMode}
          onModeChange={onModeChange}
          onChange={onChange}
          modal
        />
      </section>
      <FileVersionHistoryDialog
        open={versionHistoryOpen}
        rootId={rootId}
        entry={entry}
        snapshots={versionSnapshots}
        serverVersions={serverVersions}
        currentContent={effectiveContent}
        loading={versionsLoading}
        busy={versionsRestoring || versionsDeleting}
        onOpenChange={setVersionHistoryOpen}
        onRestore={(snapshot) => {
          onRestoreVersion(snapshot);
          setVersionHistoryOpen(false);
        }}
        onDelete={onDeleteVersion}
        onRestoreServer={(versionId) => {
          onRestoreServerVersion(versionId);
          setVersionHistoryOpen(false);
        }}
        onDeleteServer={onDeleteServerVersion}
      />
      <FileSaveReviewDialog
        open={saveReviewOpen}
        rootId={rootId}
        entry={entry}
        before={read?.content ?? ""}
        after={effectiveContent}
        diffLines={saveDiffLines}
        writePending={writePending}
        onOpenChange={handleSaveReviewOpenChange}
        onConfirm={confirmSave}
      />
    </div>
  );
}

function FileVersionHistoryDialog({
  open,
  rootId,
  entry,
  snapshots,
  serverVersions,
  currentContent,
  loading,
  busy,
  onOpenChange,
  onRestore,
  onDelete,
  onRestoreServer,
  onDeleteServer,
}: {
  open: boolean;
  rootId: string;
  entry: FileEntrySummary;
  snapshots: FileVersionSnapshot[];
  serverVersions: FilesVersionItem[];
  currentContent: string;
  loading: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (snapshot: FileVersionSnapshot) => void;
  onDelete: (snapshotId: string) => void;
  onRestoreServer: (versionId: string) => void;
  onDeleteServer: (versionId: string) => void;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const historyItems = React.useMemo(
    () => [
      ...serverVersions.map((version) => ({
        kind: "server" as const,
        id: version.id,
        label: new Date(version.createdAt).toLocaleString(),
        size: version.size,
        sourceModifiedAt: version.sourceModifiedAt,
        content: null as string | null,
      })),
      ...snapshots.map((snapshot) => ({
        kind: "local" as const,
        id: snapshot.id,
        label: new Date(snapshot.savedAt).toLocaleString(),
        size: snapshot.contentBytes,
        sourceModifiedAt: snapshot.sourceModifiedAt ?? null,
        content: snapshot.content,
      })),
    ],
    [serverVersions, snapshots],
  );
  const selected =
    historyItems.find((item) => item.id === selectedId) ??
    historyItems[0] ??
    null;
  const selectedServerId = selected?.kind === "server" ? selected.id : null;
  const selectedServerRead = useFileVersionReadQuery(
    rootId,
    entry.path,
    selectedServerId,
    { enabled: open && Boolean(selectedServerId) },
  );
  const previewContent =
    selected?.kind === "local"
      ? selected.content
      : (selectedServerRead.data?.content ?? null);
  const versionDiffLines = React.useMemo(
    () =>
      previewContent == null
        ? []
        : createFileSaveDiffLines(previewContent, currentContent),
    [currentContent, previewContent],
  );

  React.useEffect(() => {
    if (!open) return;
    setSelectedId((current) =>
      current && historyItems.some((item) => item.id === current)
        ? current
        : (historyItems[0]?.id ?? null),
    );
  }, [historyItems, open]);

  React.useEffect(() => {
    setCompareOpen(false);
  }, [selectedId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[100dvh] w-screen max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-none p-0 sm:h-[min(72dvh,680px)] sm:w-[min(92vw,920px)] sm:rounded-lg"
        data-file-version-history-dialog
      >
        <DialogHeader className="border-b border-line bg-panel-2 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" />
            历史版本快照
          </DialogTitle>
          <DialogDescription className="truncate">
            {entry.path} · 本地浏览器最多保留 {FILE_VERSION_MAX_SNAPSHOTS}{" "}
            个保存前版本
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid min-h-0 gap-3 overflow-hidden bg-canvas p-4 md:grid-cols-[280px_minmax(0,1fr)]">
          <div
            className="min-h-0 overflow-auto rounded border border-line bg-panel"
            data-file-version-snapshot-list
          >
            {loading ? (
              <div className="p-4 text-sm text-muted">服务器历史加载中…</div>
            ) : null}
            {historyItems.length ? (
              historyItems.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  className={cn(
                    "grid w-full gap-1 border-b border-line px-3 py-2 text-left text-xs last:border-b-0 hover:bg-panel-2",
                    selected?.id === item.id &&
                      "bg-primary-soft text-ink-strong",
                  )}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="text-subtle">
                    {item.kind === "server" ? "服务器" : "本地"} ·{" "}
                    {formatBytes(item.size)} ·{" "}
                    {item.sourceModifiedAt
                      ? `源修改 ${new Date(item.sourceModifiedAt).toLocaleString()}`
                      : "保存前快照"}
                  </span>
                </button>
              ))
            ) : (
              <div className="p-4 text-sm text-muted">
                暂无历史版本。成功保存后会记录保存前内容。
              </div>
            )}
          </div>
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded border border-line bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-2 text-xs text-muted">
              <span className="font-medium text-ink-strong">快照预览</span>
              {selected ? <span>{formatBytes(selected.size)}</span> : null}
              <span className="min-w-0 flex-1 truncate">
                服务器/本地历史均可先预览，也可与当前草稿对比；不会立即覆盖磁盘。
              </span>
              <Button
                type="button"
                variant={compareOpen ? "primary" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setCompareOpen((value) => !value)}
                disabled={!previewContent}
                title="对比当前历史版本与当前编辑草稿"
              >
                <FileDiff className="size-3.5" />
                {compareOpen ? "查看内容" : "对比草稿"}
              </Button>
            </div>
            {compareOpen && previewContent != null ? (
              <div
                className="min-h-0 overflow-auto p-3"
                data-file-version-diff-preview
              >
                <FileSaveDiffPreview
                  lines={versionDiffLines}
                  before={previewContent}
                  after={currentContent}
                />
              </div>
            ) : (
              <pre
                className="min-h-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-6 text-ink"
                data-file-version-snapshot-preview
              >
                {selected
                  ? selected.kind === "server" && selectedServerRead.isLoading
                    ? "读取服务器历史内容中…"
                    : selected.kind === "server" && selectedServerRead.error
                      ? `读取服务器历史失败：${selectedServerRead.error.message}`
                      : (previewContent ?? "选择左侧历史版本查看内容。")
                  : "选择左侧历史版本查看内容。"}
              </pre>
            )}
          </div>
        </DialogBody>
        <DialogFooter className="grid grid-cols-1 gap-2 border-t border-line bg-panel px-4 py-3 sm:flex">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {selected ? (
            <Button
              variant="outline"
              onClick={() =>
                selected.kind === "server"
                  ? onDeleteServer(selected.id)
                  : onDelete(selected.id)
              }
              disabled={busy}
            >
              <Trash2 className="size-3.5" />
              删除{selected.kind === "server" ? "服务器版本" : "快照"}
            </Button>
          ) : null}
          {selected ? (
            <Button
              variant="primary"
              onClick={() =>
                selected.kind === "server"
                  ? onRestoreServer(selected.id)
                  : onRestore(
                      snapshots.find(
                        (snapshot) => snapshot.id === selected.id,
                      ) as FileVersionSnapshot,
                    )
              }
              disabled={
                busy ||
                (selected.kind === "server" && selectedServerRead.isLoading)
              }
            >
              <RotateCcw className="size-3.5" />
              恢复到草稿
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileSaveReviewDialog({
  open,
  entry,
  before,
  after,
  diffLines,
  writePending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  rootId: string;
  entry: FileEntrySummary;
  before: string;
  after: string;
  diffLines: FileSaveDiffLine[];
  writePending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const stats = React.useMemo(
    () => summarizeFileSaveDiff(diffLines),
    [diffLines],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[100dvh] w-screen max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-none p-0 sm:h-[min(76dvh,720px)] sm:w-[min(92vw,980px)] sm:rounded-lg"
        data-file-save-review-dialog
      >
        <DialogHeader className="border-b border-line bg-panel-2 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileDiff className="size-4 text-primary" />
            保存前审阅差异
          </DialogTitle>
          <DialogDescription className="truncate">
            {entry.path} · {stats.changed} 行变化（新增 {stats.added}，删除{" "}
            {stats.removed}，修改 {stats.modified}）
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 overflow-auto bg-canvas p-4">
          <FileSaveDiffPreview
            lines={diffLines}
            before={before}
            after={after}
          />
        </DialogBody>
        <DialogFooter className="grid grid-cols-1 gap-2 border-t border-line bg-panel px-4 py-3 sm:flex">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={writePending}
          >
            返回编辑
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={writePending}>
            <Save className="size-3.5" />
            {writePending ? "保存中…" : "确认保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileSaveDiffPreview({
  lines,
  before,
  after,
}: {
  lines: FileSaveDiffLine[];
  before: string;
  after: string;
}) {
  if (before === after) {
    return (
      <div className="rounded border border-line bg-panel p-4 text-sm text-muted">
        当前草稿与磁盘内容一致，没有需要保存的差异。
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <div className="rounded border border-line bg-panel p-4 text-sm text-muted">
        文件内容已变化，但当前差异过大或无法逐行展示；请返回编辑器确认后保存。
      </div>
    );
  }
  return (
    <div
      className="overflow-hidden rounded border border-line bg-panel font-mono text-[11px] leading-relaxed"
      data-file-save-diff-preview
    >
      {lines.map((line, index) => (
        <div
          key={`${index}:${line.beforeLine ?? ""}:${line.afterLine ?? ""}`}
          className={cn(
            "grid grid-cols-[36px_36px_minmax(0,1fr)] border-b border-line last:border-b-0 sm:grid-cols-[52px_52px_minmax(0,1fr)]",
            line.kind === "added" && "bg-primary-soft/70",
            line.kind === "removed" && "bg-danger/5",
            line.kind === "modified" && "bg-warning/5",
          )}
        >
          <div className="border-r border-line bg-panel-2 px-2 py-1 text-right text-subtle">
            {line.beforeLine ?? ""}
          </div>
          <div className="border-r border-line bg-panel-2 px-2 py-1 text-right text-subtle">
            {line.afterLine ?? ""}
          </div>
          <pre
            className={cn(
              "overflow-x-auto whitespace-pre-wrap break-words px-2 py-1",
              line.kind === "added" && "text-primary",
              line.kind === "removed" && "text-danger",
              line.kind === "modified" && "text-warning",
              line.kind === "context" && "text-muted",
            )}
          >
            {diffLinePrefix(line.kind)} {line.text}
          </pre>
        </div>
      ))}
      {lines.length >= FILE_SAVE_DIFF_MAX_LINES ? (
        <div className="bg-panel-2 px-3 py-2 text-xs text-muted">
          差异较大，仅展示前 {FILE_SAVE_DIFF_MAX_LINES} 行。
        </div>
      ) : null}
    </div>
  );
}

interface FileUnsavedDraft {
  rootId: string;
  path: string;
  name: string;
  content: string;
  contentBytes: number;
  updatedAt: string;
  sourceModifiedAt?: string | null;
}

const FILE_UNSAVED_DRAFT_STORAGE_KEY = "tracevane:file-manager:unsaved-drafts";
const FILE_UNSAVED_DRAFT_MAX_CONTENT_BYTES = 512 * 1024;
const FILE_UNSAVED_DRAFT_MAX_RECORDS = 50;

export function loadFileUnsavedDraft(
  rootId: string,
  path: string,
): FileUnsavedDraft | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_UNSAVED_DRAFT_STORAGE_KEY) || "[]",
    ) as FileUnsavedDraft[];
    if (!Array.isArray(parsed)) return null;
    return (
      parsed.find((draft) => draft.rootId === rootId && draft.path === path) ??
      null
    );
  } catch {
    return null;
  }
}

export function persistFileUnsavedDraft(
  rootId: string,
  entry: FileEntrySummary,
  content: string,
  loadedContent: string,
): FileUnsavedDraft | null {
  if (content === loadedContent) {
    clearFileUnsavedDraft(rootId, entry.path);
    return null;
  }
  const contentBytes = estimateUtf8Bytes(content);
  if (contentBytes > FILE_UNSAVED_DRAFT_MAX_CONTENT_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_UNSAVED_DRAFT_STORAGE_KEY) || "[]",
    ) as FileUnsavedDraft[];
    const all = Array.isArray(parsed) ? parsed : [];
    const draft: FileUnsavedDraft = {
      rootId,
      path: entry.path,
      name: entry.name,
      content,
      contentBytes,
      updatedAt: new Date().toISOString(),
      sourceModifiedAt: entry.modifiedAt ?? null,
    };
    const others = all.filter(
      (item) => !(item.rootId === rootId && item.path === entry.path),
    );
    window.localStorage.setItem(
      FILE_UNSAVED_DRAFT_STORAGE_KEY,
      JSON.stringify(
        [draft, ...others].slice(0, FILE_UNSAVED_DRAFT_MAX_RECORDS),
      ),
    );
    return draft;
  } catch {
    return null;
  }
}

export function clearFileUnsavedDraft(rootId: string, path: string): void {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_UNSAVED_DRAFT_STORAGE_KEY) || "[]",
    ) as FileUnsavedDraft[];
    const all = Array.isArray(parsed) ? parsed : [];
    window.localStorage.setItem(
      FILE_UNSAVED_DRAFT_STORAGE_KEY,
      JSON.stringify(
        all.filter(
          (draft) => !(draft.rootId === rootId && draft.path === path),
        ),
      ),
    );
  } catch {
    // localStorage can be unavailable or full; draft recovery is best-effort.
  }
}

interface FileVersionSnapshot {
  id: string;
  rootId: string;
  path: string;
  name: string;
  content: string;
  contentBytes: number;
  savedAt: string;
  sourceModifiedAt?: string | null;
}

const FILE_VERSION_STORAGE_KEY =
  "tracevane:file-manager:file-version-snapshots";
const FILE_VERSION_MAX_SNAPSHOTS = 5;
const FILE_VERSION_MAX_CONTENT_BYTES = 256 * 1024;

export function loadFileVersionSnapshots(
  rootId: string,
  path: string,
): FileVersionSnapshot[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_VERSION_STORAGE_KEY) || "[]",
    ) as FileVersionSnapshot[];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (snapshot) => snapshot.rootId === rootId && snapshot.path === path,
          )
          .slice(0, FILE_VERSION_MAX_SNAPSHOTS)
      : [];
  } catch {
    return [];
  }
}

export function persistFileVersionSnapshot(
  rootId: string,
  entry: FileEntrySummary,
  content: string,
): FileVersionSnapshot[] {
  if (!content || estimateUtf8Bytes(content) > FILE_VERSION_MAX_CONTENT_BYTES)
    return loadFileVersionSnapshots(rootId, entry.path);
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_VERSION_STORAGE_KEY) || "[]",
    ) as FileVersionSnapshot[];
    const all = Array.isArray(parsed) ? parsed : [];
    const snapshot: FileVersionSnapshot = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      rootId,
      path: entry.path,
      name: entry.name,
      content,
      contentBytes: estimateUtf8Bytes(content),
      savedAt: new Date().toISOString(),
      sourceModifiedAt: entry.modifiedAt ?? null,
    };
    const sameFile = [
      snapshot,
      ...all.filter(
        (item) => item.rootId === rootId && item.path === entry.path,
      ),
    ].slice(0, FILE_VERSION_MAX_SNAPSHOTS);
    const others = all.filter(
      (item) => !(item.rootId === rootId && item.path === entry.path),
    );
    window.localStorage.setItem(
      FILE_VERSION_STORAGE_KEY,
      JSON.stringify([...sameFile, ...others].slice(0, 200)),
    );
    return sameFile;
  } catch {
    return loadFileVersionSnapshots(rootId, entry.path);
  }
}

export function deleteFileVersionSnapshot(
  rootId: string,
  path: string,
  snapshotId: string,
): FileVersionSnapshot[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_VERSION_STORAGE_KEY) || "[]",
    ) as FileVersionSnapshot[];
    const all = Array.isArray(parsed) ? parsed : [];
    const next = all.filter(
      (snapshot) =>
        !(
          snapshot.rootId === rootId &&
          snapshot.path === path &&
          snapshot.id === snapshotId
        ),
    );
    window.localStorage.setItem(FILE_VERSION_STORAGE_KEY, JSON.stringify(next));
    return next
      .filter(
        (snapshot) => snapshot.rootId === rootId && snapshot.path === path,
      )
      .slice(0, FILE_VERSION_MAX_SNAPSHOTS);
  } catch {
    return [];
  }
}

function estimateUtf8Bytes(content: string): number {
  return new Blob([content]).size;
}

export interface FileSaveDiffLine {
  kind: "context" | "added" | "removed" | "modified";
  beforeLine?: number;
  afterLine?: number;
  text: string;
}

const FILE_SAVE_DIFF_CONTEXT = 2;
const FILE_SAVE_DIFF_MAX_LINES = 400;

export function createFileSaveDiffLines(
  before: string,
  after: string,
): FileSaveDiffLine[] {
  if (before === after) return [];
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const max = Math.max(beforeLines.length, afterLines.length);
  const changed = new Set<number>();
  for (let index = 0; index < max; index += 1) {
    if (
      (beforeLines[index] ?? undefined) !== (afterLines[index] ?? undefined)
    ) {
      for (
        let ctx = Math.max(0, index - FILE_SAVE_DIFF_CONTEXT);
        ctx <= Math.min(max - 1, index + FILE_SAVE_DIFF_CONTEXT);
        ctx += 1
      ) {
        changed.add(ctx);
      }
    }
  }
  const rows = Array.from(changed).sort((a, b) => a - b);
  const result: FileSaveDiffLine[] = [];
  let previous = -1;
  for (const index of rows) {
    if (result.length >= FILE_SAVE_DIFF_MAX_LINES) break;
    if (previous >= 0 && index > previous + 1) {
      result.push({ kind: "context", text: "…" });
    }
    previous = index;
    const left = beforeLines[index];
    const right = afterLines[index];
    if (left === right) {
      result.push({
        kind: "context",
        beforeLine: index + 1,
        afterLine: index + 1,
        text: left ?? "",
      });
    } else if (left === undefined) {
      result.push({ kind: "added", afterLine: index + 1, text: right ?? "" });
    } else if (right === undefined) {
      result.push({ kind: "removed", beforeLine: index + 1, text: left });
    } else {
      result.push({ kind: "removed", beforeLine: index + 1, text: left });
      if (result.length >= FILE_SAVE_DIFF_MAX_LINES) break;
      result.push({ kind: "added", afterLine: index + 1, text: right });
    }
  }
  return result.slice(0, FILE_SAVE_DIFF_MAX_LINES);
}

function summarizeFileSaveDiff(lines: FileSaveDiffLine[]): {
  added: number;
  removed: number;
  modified: number;
  changed: number;
} {
  const added = lines.filter((line) => line.kind === "added").length;
  const removed = lines.filter((line) => line.kind === "removed").length;
  const modified = Math.min(added, removed);
  return { added, removed, modified, changed: added + removed };
}

function diffLinePrefix(kind: FileSaveDiffLine["kind"]): string {
  if (kind === "added") return "+";
  if (kind === "removed") return "−";
  if (kind === "modified") return "~";
  return " ";
}

function FilePreviewWorkbench({
  entry,
  read,
  readQuery,
  rootId,
  downloadUrl,
  fileKey,
  effectiveContent,
  editable,
  viewMode,
  preferredInitialMode,
  onModeChange,
  onChange,
  modal = false,
}: {
  entry: FileEntrySummary;
  read: ReturnType<typeof useFileReadQuery>["data"];
  readQuery: ReturnType<typeof useFileReadQuery>;
  rootId: string;
  downloadUrl: string | null;
  fileKey: string;
  effectiveContent: string;
  editable: boolean;
  viewMode: DocumentWorkbenchMode;
  preferredInitialMode: DocumentWorkbenchMode;
  onModeChange: (mode: DocumentWorkbenchMode) => void;
  onChange: (content: string) => void;
  modal?: boolean;
}) {
  if (readQuery.isLoading) {
    return (
      <div className="m-4 rounded border border-line bg-panel-2 p-3 text-muted">
        读取预览中...
      </div>
    );
  }
  if (readQuery.error) {
    return (
      <div className="m-4 rounded border border-danger/30 bg-danger/5 p-3 text-danger">
        {readQuery.error.message}
      </div>
    );
  }
  return (
    <FilePreviewErrorBoundary resetKey={fileKey} fileName={entry.name}>
      <DocumentWorkbench
        key={fileKey}
        path={entry.path}
        rootId={rootId}
        name={entry.name}
        content={effectiveContent}
        editable={editable}
        textLike={Boolean(entry.textLike || read?.textLike)}
        imageLike={entry.imageLike}
        mimeType={read?.mimeType}
        downloadUrl={downloadUrl}
        size={read?.size ?? entry.size ?? undefined}
        truncated={read?.truncated}
        contentOffset={read?.contentOffset}
        contentBytes={read?.contentBytes}
        readLimitBytes={read?.readLimitBytes}
        mode={viewMode}
        defaultMode={preferredInitialMode}
        onModeChange={onModeChange}
        compact
        className={modal ? "h-full" : undefined}
        minHeightClassName={modal ? "min-h-0 h-full" : "min-h-72"}
        editorClassName="rounded border border-line"
        idleHint="当前文件查找/替换；替换后进入未保存状态，由保存按钮写回文件"
        onChange={onChange}
      />
    </FilePreviewErrorBoundary>
  );
}

class FilePreviewErrorBoundary extends React.Component<
  { resetKey: string; fileName: string; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previousProps: {
    resetKey: string;
    fileName: string;
    children: React.ReactNode;
  }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    console.error("Tracevane file preview crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="grid h-full min-h-72 place-items-center rounded border border-danger/30 bg-danger/5 p-4 text-center text-sm text-danger"
        data-file-preview-error-boundary
      >
        <div className="max-w-xl">
          <div className="font-semibold">文件预览渲染失败</div>
          <p className="mt-1 text-xs text-muted">
            {this.props.fileName}{" "}
            的预览组件出现异常，已阻止页面整体空白。可切换其它文件或刷新后重试。
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded border border-danger/20 bg-panel p-2 text-left font-mono text-2xs text-danger">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}

function FilePreviewMetadataGrid({
  entry,
  compact = false,
}: {
  entry: FileEntrySummary;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[72px_minmax(0,1fr)_72px_minmax(0,1fr)]"
          : "grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2"
      }
    >
      <span className="text-subtle">名称</span>
      <span className="truncate text-ink-strong" title={entry.name}>
        {entry.name}
      </span>
      <span className="text-subtle">类型</span>
      <span className="text-muted">
        {entry.kind === "directory" ? "目录" : entry.ext || "文件"}
      </span>
      <span className="text-subtle">大小</span>
      <span className="text-muted">
        {entry.kind === "file" ? formatBytes(entry.size ?? 0) : "—"}
      </span>
      <span className="text-subtle">修改时间</span>
      <span className="truncate text-muted">
        {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : "—"}
      </span>
      <span className="text-subtle">权限</span>
      <span className="font-mono text-muted">
        {entry.permissions ? `${entry.permissions} (${entry.mode})` : "—"}
      </span>
      <span className="text-subtle">UID/GID</span>
      <span className="font-mono text-muted">
        {entry.uid != null || entry.gid != null
          ? `${entry.uid ?? "—"}/${entry.gid ?? "—"}`
          : "—"}
      </span>
      <span className="text-subtle">隐藏</span>
      <span className="text-muted">{entry.hidden ? "是" : "否"}</span>
    </div>
  );
}

function FilePreviewEditorStatusBar({
  entry,
  dirty,
  editable,
  viewMode,
  readOnlyReason,
  mimeType,
  contentBytes,
  saveError,
  lastSavedAt,
}: {
  entry: FileEntrySummary;
  dirty: boolean;
  editable: boolean;
  viewMode: DocumentWorkbenchMode;
  readOnlyReason?: string;
  mimeType?: string | null;
  contentBytes?: number;
  saveError?: string | null;
  lastSavedAt?: string | null;
}) {
  return (
    <footer
      className="flex min-h-8 items-center gap-x-3 gap-y-1 overflow-x-auto border-t border-line bg-panel-2 px-3 py-1 text-2xs text-muted sm:flex-wrap"
      data-file-preview-status-bar
    >
      <span
        className={
          saveError
            ? "font-semibold text-danger"
            : dirty
              ? "font-semibold text-warning"
              : "text-success"
        }
      >
        {saveError ? "保存失败" : dirty ? "● 未保存" : "✓ 已保存"}
      </span>
      <span>{viewModeLabel(viewMode)}</span>
      <span>{editable ? "可编辑" : (readOnlyReason ?? "只读预览")}</span>
      <span>{editorLanguageLabel(entry.path)}</span>
      <span className="hidden sm:inline">
        {mimeType || entry.ext || "未知类型"}
      </span>
      <span className="hidden sm:inline">
        {formatBytes(contentBytes ?? entry.size ?? 0)}
      </span>
      {lastSavedAt && !dirty && !saveError ? (
        <span className="hidden md:inline">
          保存于 {new Date(lastSavedAt).toLocaleTimeString()}
        </span>
      ) : null}
      <span className="ml-auto hidden md:inline">UTF-8</span>
      <span className="hidden md:inline">LF</span>
      <span className="hidden lg:inline">
        Ctrl/⌘+F 查找 · Ctrl/⌘+H 替换 · Ctrl/⌘+S 保存
      </span>
    </footer>
  );
}

function initialFilePreviewMode(
  entry: FileEntrySummary,
  read: ReturnType<typeof useFileReadQuery>["data"],
): DocumentWorkbenchMode {
  if (entry.kind !== "file") return "preview";
  const lower = entry.path.toLowerCase();
  if (
    lower.endsWith(".md") ||
    lower.endsWith(".mdx") ||
    lower.endsWith(".html") ||
    lower.endsWith(".htm")
  )
    return "preview";
  if (entry.textLike || read?.textLike) return "source";
  return "preview";
}

function editorLanguageLabel(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "Markdown";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "TypeScript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  )
    return "JavaScript";
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return "JSON";
  if (lower.endsWith(".css")) return "CSS";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "HTML";
  if (lower.endsWith(".py")) return "Python";
  if (lower.endsWith(".sql")) return "SQL";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "YAML";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "Shell";
  return "Plain Text";
}

function formatFileDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function viewModeLabel(mode: DocumentWorkbenchMode): string {
  switch (mode) {
    case "source":
      return "源码";
    case "split":
      return "编辑+预览";
    case "visual":
      return "预览时编辑";
    case "preview":
    default:
      return "预览";
  }
}
