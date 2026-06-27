import * as React from "react";
import {
  Archive,
  Check,
  Copy,
  Eye,
  EyeOff,
  FilePlus,
  FolderTree,
  MoveRight,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import { dryRunFileTransfer, transferFiles } from "@/lib/api/files";
import {
  filesKeys,
  useFileReadQuery,
  useFilesSummaryQuery,
} from "@/lib/query/files";
import { toast } from "@/design/ui/sonner";

import { FileActionsMenu, type FileActionsMenuTarget } from "./FileActionsMenu";
import { FilePreviewDialog } from "@/features/file-manager/FilePreviewPanel";
import { FilePropertiesDialog } from "@/features/workspace/shared/FilePropertiesDialog";
import { useFileOperations } from "./fileOperations";
import { FileTree } from "./FileTree";
import {
  createUploadBatch,
  type UploadBatchHandle,
  type UploadJob,
} from "./uploadManager";
import { UploadManagerDialog } from "./UploadManagerDialog";
import { UploadTaskStrip } from "./UploadTaskStrip";
import {
  WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY,
  loadUploadTaskSnapshots,
  saveUploadTaskSnapshots,
  snapshotsFromUploadJobs,
} from "./uploadTaskSnapshots";
import type { FileEntrySummary, FilesUploadConflictPolicy } from "./types";
import type {
  FilesTransferConflictPolicy,
  FilesTransferDryRunResponse,
} from "../../../../../../types/files";

export interface WorkspaceExplorerProps {
  /** Root id the explorer is scoped to. */
  rootId: string;
  /** Currently selected file path (rendered as highlighted in the tree). */
  selectedPath?: string;
  /** Fired when a file row is activated (click / Enter). */
  onSelectFile?: (path: string) => void;
  /** Fired when the user picks a different root in the header selector. */
  onChangeRoot?: (rootId: string) => void;
  /** Fired when the focused directory changes; file-manager pages reuse this as their main-list path. */
  onDirectoryChange?: (path: string) => void;
  onWorkspaceDirectoryChange?: (directory: WorkspaceDirectoryContext) => void;
}

export interface WorkspaceDirectoryContext {
  rootId: string;
  rootAbsolutePath: string;
  relativePath: string;
  absolutePath: string;
}

interface UploadDialogState {
  open: boolean;
  targetDirectory: string;
  files: File[];
  conflictPolicy: FilesUploadConflictPolicy;
}

interface WorkspaceFileClipboardState {
  operation: "copy" | "move";
  entries: FileActionsMenuTarget[];
}

type FileActionInitialFlow =
  | "menu"
  | "newFile"
  | "newDir"
  | "rename"
  | "copy"
  | "move"
  | "archive"
  | "unarchive"
  | "delete";

type WorkspaceBulkDialogState =
  | null
  | { kind: "delete" }
  | { kind: "archive" }
  | { kind: "copy" }
  | { kind: "move" };

/** Compact side-panel file owner: tree navigation, context actions and upload orchestration. */
export function WorkspaceExplorer({
  rootId,
  selectedPath,
  onSelectFile,
  onChangeRoot,
  onDirectoryChange,
  onWorkspaceDirectoryChange,
}: WorkspaceExplorerProps) {
  const summary = useFilesSummaryQuery();
  const queryClient = useQueryClient();
  const ops = useFileOperations();
  const roots = summary.data?.roots ?? [];
  const explorerRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadHandleRef = React.useRef<UploadBatchHandle | null>(null);
  const [showHidden, setShowHidden] = React.useState(false);
  const [treeVersion, setTreeVersion] = React.useState(0);
  const [currentDirectory, setCurrentDirectory] = React.useState("");
  const [pathInput, setPathInput] = React.useState("");
  const [defaultDirectory, setDefaultDirectory] = React.useState(() =>
    loadWorkspaceDefaultDirectory(),
  );
  const appliedDefaultRootRef = React.useRef<string | null>(null);
  const [uploadJobs, setUploadJobs] = React.useState<UploadJob[]>([]);
  const [uploadSnapshots, setUploadSnapshots] = React.useState(() =>
    loadUploadTaskSnapshots(WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY),
  );
  const [uploadDialog, setUploadDialog] = React.useState<UploadDialogState>({
    open: false,
    targetDirectory: "",
    files: [],
    conflictPolicy: "rename",
  });
  const [activeEntry, setActiveEntry] =
    React.useState<FileActionsMenuTarget | null>(null);
  const [previewEntry, setPreviewEntry] =
    React.useState<FileActionsMenuTarget | null>(null);
  const [propertiesEntry, setPropertiesEntry] =
    React.useState<FileActionsMenuTarget | null>(null);
  const [checkedEntries, setCheckedEntries] = React.useState<
    Map<string, FileActionsMenuTarget>
  >(() => new Map());
  const [fileClipboard, setFileClipboard] =
    React.useState<WorkspaceFileClipboardState | null>(null);
  const [bulkDialog, setBulkDialog] =
    React.useState<WorkspaceBulkDialogState>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState("");
  const [bulkArchiveName, setBulkArchiveName] = React.useState(
    "workspace-selection.zip",
  );
  const [bulkTargetDirectory, setBulkTargetDirectory] = React.useState("");
  const [bulkConflictPolicy, setBulkConflictPolicy] =
    React.useState<FilesTransferConflictPolicy>("fail");
  const [bulkTransferPreview, setBulkTransferPreview] =
    React.useState<FilesTransferDryRunResponse | null>(null);
  const [bulkTransferPreviewBusy, setBulkTransferPreviewBusy] =
    React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    target: FileActionsMenuTarget | null;
    initialFlow?: FileActionInitialFlow;
  } | null>(null);
  const root = roots.find((entry) => entry.id === rootId);

  React.useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  React.useEffect(() => {
    setCheckedEntries(new Map());
  }, [rootId, showHidden]);

  React.useEffect(() => {
    if (!uploadJobs.length) return;
    const snapshots = snapshotsFromUploadJobs(uploadJobs);
    setUploadSnapshots(snapshots);
    saveUploadTaskSnapshots(WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY, snapshots);
  }, [uploadJobs]);

  React.useEffect(() => {
    onDirectoryChange?.(currentDirectory);
    const absolutePath = absoluteDisplayPath(
      root?.absolutePath,
      currentDirectory,
    );
    if (rootId && root?.absolutePath) {
      onWorkspaceDirectoryChange?.({
        rootId,
        rootAbsolutePath: root.absolutePath,
        relativePath: currentDirectory,
        absolutePath,
      });
    }
  }, [
    currentDirectory,
    onDirectoryChange,
    onWorkspaceDirectoryChange,
    root?.absolutePath,
    rootId,
  ]);

  React.useEffect(() => {
    setPathInput(currentDirectory);
  }, [currentDirectory]);

  React.useEffect(() => {
    if (!rootId || appliedDefaultRootRef.current === rootId) return;
    appliedDefaultRootRef.current = rootId;
    const initialDirectory =
      defaultDirectory.rootId === rootId ? defaultDirectory.relativePath : "";
    setCurrentDirectory(initialDirectory);
    setPathInput(initialDirectory);
  }, [defaultDirectory.relativePath, defaultDirectory.rootId, rootId]);

  const checkedList = React.useMemo(
    () => Array.from(checkedEntries.values()),
    [checkedEntries],
  );
  const checkedPaths = React.useMemo(
    () => new Set(checkedEntries.keys()),
    [checkedEntries],
  );
  const previewReadQuery = useFileReadQuery(
    rootId && previewEntry?.kind === "file"
      ? { rootId, path: previewEntry.path }
      : null,
  );
  const checkedFileCount = React.useMemo(
    () => checkedList.filter((entry) => entry.kind === "file").length,
    [checkedList],
  );
  const checkedDirectoryCount = checkedList.length - checkedFileCount;
  const workspaceBaseDirectory =
    defaultDirectory.rootId === rootId ? defaultDirectory.relativePath : "";

  const toggleCheckedEntry = React.useCallback(
    (
      path: string,
      entry: { name: string; kind: FileActionsMenuTarget["kind"] },
    ) => {
      setCheckedEntries((previous) => {
        const next = new Map(previous);
        if (next.has(path)) next.delete(path);
        else next.set(path, { path, name: entry.name, kind: entry.kind });
        return next;
      });
    },
    [],
  );

  const clearCheckedEntries = React.useCallback(
    () => setCheckedEntries(new Map()),
    [],
  );

  const copySelectionToFileClipboard = React.useCallback(
    (operation: "copy" | "move") => {
      const entries =
        checkedList.length > 0 ? checkedList : activeEntry ? [activeEntry] : [];
      if (!entries.length) return false;
      setFileClipboard({ operation, entries });
      toast.success(
        operation === "copy" ? "已复制到文件剪贴板" : "已剪切到文件剪贴板",
        {
          description: `${entries.length} 个项目，按 Ctrl/⌘+V 粘贴到当前目录。`,
        },
      );
      return true;
    },
    [activeEntry, checkedList],
  );

  const pasteFileClipboardToCurrentDirectory = React.useCallback(() => {
    if (!fileClipboard?.entries.length) return false;
    setCheckedEntries(
      new Map(fileClipboard.entries.map((entry) => [entry.path, entry])),
    );
    setBulkTargetDirectory(currentDirectory);
    setBulkConflictPolicy("rename");
    setBulkTransferPreview(null);
    setBulkDialog({ kind: fileClipboard.operation });
    return true;
  }, [currentDirectory, fileClipboard]);

  const openMenu = React.useCallback(
    (
      x: number,
      y: number,
      target: FileActionsMenuTarget | null,
      initialFlow: FileActionInitialFlow = "menu",
    ) => {
      setMenu({ x, y, target, initialFlow });
    },
    [],
  );

  const closeMenu = React.useCallback(() => setMenu(null), []);

  const openUploadManager = React.useCallback(
    (targetDirectory = currentDirectory) => {
      setUploadDialog({
        open: true,
        targetDirectory,
        files: [],
        conflictPolicy: "rename",
      });
      setUploadJobs([]);
    },
    [currentDirectory],
  );

  const closeUploadManager = React.useCallback(() => {
    setUploadDialog((state) => ({ ...state, open: false }));
  }, []);

  const reopenUploadManager = React.useCallback(() => {
    setUploadDialog((state) => ({
      ...state,
      open: true,
      targetDirectory: state.targetDirectory || currentDirectory,
    }));
  }, [currentDirectory]);

  const copyPath = React.useCallback(
    async (target: FileActionsMenuTarget, mode: "relative" | "absolute") => {
      const value =
        mode === "relative"
          ? target.path
          : absoluteDisplayPath(root?.absolutePath, target.path);
      try {
        await navigator.clipboard.writeText(value);
        toast.success(
          mode === "relative" ? "已复制相对路径" : "已复制绝对路径",
          {
            description: value,
          },
        );
      } catch {
        toast.error("复制路径失败", { description: value });
      }
    },
    [root?.absolutePath],
  );

  const onNewFile = React.useCallback(() => {
    if (!rootId) return;
    openMenu(
      16,
      48,
      currentDirectory
        ? {
            path: currentDirectory,
            name: lastSegment(currentDirectory),
            kind: "directory",
          }
        : null,
    );
  }, [currentDirectory, rootId, openMenu]);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: filesKeys.all });
  }, [queryClient]);
  const jumpToPathInput = React.useCallback(() => {
    const nextPath = normalizeWorkspacePathInput(pathInput, root?.absolutePath);
    setCurrentDirectory(nextPath);
    setPathInput(nextPath);
    setActiveEntry(
      nextPath
        ? { path: nextPath, name: lastSegment(nextPath), kind: "directory" }
        : null,
    );
  }, [pathInput, root?.absolutePath]);

  const saveDefaultDirectory = React.useCallback(
    (target?: FileActionsMenuTarget | null) => {
      const relativePath =
        target?.kind === "directory" ? target.path : currentDirectory;
      const next = { rootId, relativePath };
      setDefaultDirectory(next);
      saveWorkspaceDefaultDirectory(next);
      appliedDefaultRootRef.current = rootId;
      setCurrentDirectory(relativePath);
      setPathInput(relativePath);
      setTreeVersion((value) => value + 1);
      toast.success("已设置工作区主目录", {
        description: absoluteDisplayPath(root?.absolutePath, relativePath),
      });
    },
    [currentDirectory, root?.absolutePath, rootId],
  );

  const openBulkArchive = React.useCallback(() => {
    const base = lastSegment(currentDirectory) || "workspace-selection";
    setBulkArchiveName(`${base}.zip`);
    setBulkDialog({ kind: "archive" });
  }, [currentDirectory]);

  const openBulkTransfer = React.useCallback(
    (kind: "copy" | "move") => {
      setBulkTargetDirectory(currentDirectory);
      setBulkConflictPolicy("fail");
      setBulkTransferPreview(null);
      setBulkDialog({ kind });
    },
    [currentDirectory],
  );

  const executeBulkArchive = React.useCallback(async () => {
    const name = bulkArchiveName.trim();
    if (!rootId || checkedList.length === 0 || !name) return;
    setBulkBusy(true);
    try {
      await ops.archive(
        {
          rootId,
          directoryPath: currentDirectory,
          paths: checkedList.map((entry) => entry.path),
        },
        name,
      );
      clearCheckedEntries();
      setBulkDialog(null);
      refresh();
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkArchiveName,
    checkedList,
    clearCheckedEntries,
    currentDirectory,
    bulkConflictPolicy,
    refresh,
    rootId,
  ]);

  const executeBulkDelete = React.useCallback(async () => {
    if (
      !rootId ||
      checkedList.length === 0 ||
      bulkDeleteConfirm.trim() !== "DELETE"
    )
      return;
    setBulkBusy(true);
    try {
      await ops.remove({
        rootId,
        paths: checkedList.map((entry) => entry.path),
      });
      clearCheckedEntries();
      setBulkDialog(null);
      setBulkDeleteConfirm("");
      refresh();
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkDeleteConfirm,
    checkedList,
    clearCheckedEntries,
    bulkConflictPolicy,
    refresh,
    rootId,
  ]);

  React.useEffect(() => {
    if (
      !rootId ||
      !bulkDialog ||
      (bulkDialog.kind !== "copy" && bulkDialog.kind !== "move") ||
      checkedList.length === 0
    ) {
      setBulkTransferPreview(null);
      setBulkTransferPreviewBusy(false);
      return;
    }
    let canceled = false;
    setBulkTransferPreviewBusy(true);
    const timer = window.setTimeout(() => {
      dryRunFileTransfer({
        operation: bulkDialog.kind,
        sourceRootId: rootId,
        sourcePaths: checkedList.map((entry) => entry.path),
        destinationRootId: rootId,
        destinationDirectoryPath: bulkTargetDirectory,
        conflictPolicy: bulkConflictPolicy,
      })
        .then((preview) => {
          if (!canceled) setBulkTransferPreview(preview);
        })
        .catch((error) => {
          if (!canceled) {
            setBulkTransferPreview(null);
            toast.error("批量操作预检失败", {
              description:
                error instanceof Error ? error.message : String(error),
            });
          }
        })
        .finally(() => {
          if (!canceled) setBulkTransferPreviewBusy(false);
        });
    }, 220);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [
    bulkConflictPolicy,
    bulkDialog,
    bulkTargetDirectory,
    checkedList,
    rootId,
  ]);

  const executeBulkTransfer = React.useCallback(async () => {
    if (
      !rootId ||
      !bulkDialog ||
      (bulkDialog.kind !== "copy" && bulkDialog.kind !== "move") ||
      checkedList.length === 0 ||
      !bulkTransferPreview
    )
      return;
    if (
      bulkTransferPreview.counts.conflicts ||
      bulkTransferPreview.counts.errors
    )
      return;
    setBulkBusy(true);
    const changed =
      bulkTransferPreview.counts.ready +
      bulkTransferPreview.counts.overwrite +
      bulkTransferPreview.counts.rename;
    const skipped = bulkTransferPreview.counts.skip;
    try {
      await transferFiles({
        operation: bulkDialog.kind,
        sourceRootId: rootId,
        sourcePaths: checkedList.map((entry) => entry.path),
        destinationRootId: rootId,
        destinationDirectoryPath: bulkTargetDirectory,
        conflictPolicy: bulkConflictPolicy,
      });
      toast.success(
        bulkDialog.kind === "copy" ? "批量复制完成" : "批量移动完成",
        {
          description: `成功 ${changed} 项${skipped ? `，跳过 ${skipped} 项` : ""}。`,
        },
      );
      clearCheckedEntries();
      setBulkDialog(null);
      setBulkTransferPreview(null);
      refresh();
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkDialog,
    bulkTargetDirectory,
    bulkTransferPreview,
    checkedList.length,
    clearCheckedEntries,
    bulkConflictPolicy,
    refresh,
    rootId,
  ]);

  const collapseAll = React.useCallback(
    () => setTreeVersion((value) => value + 1),
    [],
  );

  const startUpload = React.useCallback(
    async (
      files: File[],
      directoryPath: string,
      conflictPolicy: FilesUploadConflictPolicy = "rename",
    ) => {
      if (!rootId || files.length === 0) return;
      uploadHandleRef.current?.cancel();
      const handle = createUploadBatch({
        rootId,
        directoryPath,
        files,
        conflictPolicy,
        onJobsChange: setUploadJobs,
      });
      uploadHandleRef.current = handle;
      try {
        await handle.done;
        refresh();
        const failed = handle.jobs.filter(
          (job) => job.status === "error",
        ).length;
        const skipped = handle.jobs.filter(
          (job) => job.status === "skipped",
        ).length;
        if (failed) {
          toast.error("上传未完成", {
            description: `${failed} 个文件失败，可在进度面板中继续重试。`,
          });
        } else {
          toast.success("上传完成", {
            description: `${files.length - skipped} 个文件已上传到 ${displayDir(directoryPath)}${skipped ? `，${skipped} 个已跳过` : ""}`,
          });
          window.setTimeout(() => {
            setUploadJobs([]);
            setUploadSnapshots([]);
            saveUploadTaskSnapshots(WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY, []);
            uploadHandleRef.current = null;
          }, 900);
        }
      } catch (error) {
        toast.error("上传失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [refresh, rootId],
  );

  const onUploadChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!files.length) return;
      setUploadDialog((state) => ({
        ...state,
        open: true,
        files: [...state.files, ...files],
      }));
    },
    [],
  );

  const resumeUpload = React.useCallback(async () => {
    const handle = uploadHandleRef.current;
    if (!handle) return;
    try {
      await handle.resume();
      refresh();
    } catch (error) {
      toast.error("续传失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [refresh]);

  const activeUpload = uploadJobs.some(
    (job) =>
      job.status === "preparing" ||
      job.status === "uploading" ||
      job.status === "queued",
  );

  const handleExplorerPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (uploadDialog.open) return;
      const files = Array.from(event.clipboardData.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void startUpload(files, currentDirectory);
    },
    [currentDirectory, startUpload, uploadDialog.open],
  );

  const handleExplorerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!rootId || isEditableEventTarget(event.target)) return;

      const key = event.key;
      const modifier = event.metaKey || event.ctrlKey;

      if (key === "F5") {
        event.preventDefault();
        refresh();
        return;
      }

      if (modifier && key.toLowerCase() === "u") {
        event.preventDefault();
        openUploadManager(currentDirectory);
        return;
      }

      if (modifier && key.toLowerCase() === "c") {
        if (copySelectionToFileClipboard("copy")) event.preventDefault();
        return;
      }

      if (modifier && key.toLowerCase() === "x") {
        if (copySelectionToFileClipboard("move")) event.preventDefault();
        return;
      }

      if (modifier && key.toLowerCase() === "v") {
        if (pasteFileClipboardToCurrentDirectory()) event.preventDefault();
        return;
      }

      if (
        (key === "ContextMenu" || (event.shiftKey && key === "F10")) &&
        activeEntry
      ) {
        event.preventDefault();
        const point = findTreeRowMenuPoint(
          explorerRef.current,
          activeEntry.path,
        );
        openMenu(point.x, point.y, activeEntry);
        return;
      }

      if (event.altKey && key === "Enter" && activeEntry) {
        event.preventDefault();
        setPropertiesEntry(activeEntry);
        return;
      }

      if (key === "F2" && activeEntry) {
        event.preventDefault();
        openMenu(24, 84, activeEntry, "rename");
        return;
      }

      if ((key === "Delete" || key === "Backspace") && checkedList.length > 0) {
        event.preventDefault();
        setBulkDeleteConfirm("");
        setBulkDialog({ kind: "delete" });
        return;
      }

      if ((key === "Delete" || key === "Backspace") && activeEntry) {
        event.preventDefault();
        openMenu(24, 84, activeEntry, "delete");
      }
    },
    [
      activeEntry,
      checkedList.length,
      copySelectionToFileClipboard,
      currentDirectory,
      openMenu,
      openUploadManager,
      pasteFileClipboardToCurrentDirectory,
      refresh,
      rootId,
    ],
  );

  return (
    <div
      ref={explorerRef}
      tabIndex={0}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden outline-none"
      onPaste={handleExplorerPaste}
      onKeyDown={handleExplorerKeyDown}
      onMouseDown={(event) => {
        if (
          event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement
        )
          return;
        explorerRef.current?.focus();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(
          e.clientX,
          e.clientY,
          currentDirectory
            ? {
                path: currentDirectory,
                name: lastSegment(currentDirectory),
                kind: "directory",
              }
            : null,
        );
      }}
    >
      <header className="grid shrink-0 gap-2 border-b border-line px-2 py-2">
        <div className="grid min-w-0 gap-1" data-workspace-explorer-address-bar>
          <div className="flex min-w-0 items-center gap-1">
            <RootSelector
              rootId={rootId}
              roots={roots}
              onChange={onChangeRoot}
            />
            <Input
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  jumpToPathInput();
                }
                if (event.key === "Escape") setPathInput(currentDirectory);
              }}
              onBlur={() => setPathInput(currentDirectory)}
              className="h-7 min-w-0 flex-1 font-mono text-xs"
              placeholder="输入目录路径，Enter 跳转"
              title="支持相对路径或当前 root 下的绝对路径"
              data-workspace-explorer-path-input
            />
            <ToolbarButton
              label="跳转目录"
              disabled={!rootId}
              onClick={jumpToPathInput}
            >
              <Check />
            </ToolbarButton>
          </div>
          <div className="flex min-w-0 items-center gap-1 text-2xs text-subtle">
            <span
              className="min-w-0 flex-1 truncate"
              title={absoluteDisplayPath(root?.absolutePath, currentDirectory)}
            >
              当前：{absoluteDisplayPath(root?.absolutePath, currentDirectory)}
            </span>
            {workspaceBaseDirectory ? (
              <span
                className="shrink-0 rounded bg-primary-soft px-1 py-0.5 text-primary"
                title={absoluteDisplayPath(
                  root?.absolutePath,
                  workspaceBaseDirectory,
                )}
                data-workspace-explorer-default-directory
              >
                主目录：{lastSegment(workspaceBaseDirectory)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <ToolbarButton
            label={`新建到 ${displayDir(currentDirectory)}`}
            disabled={!rootId}
            onClick={onNewFile}
          >
            <FilePlus />
          </ToolbarButton>
          <ToolbarButton
            label={`打开上传管理 · ${displayDir(currentDirectory)}`}
            disabled={!rootId}
            onClick={() => openUploadManager(currentDirectory)}
          >
            <Upload />
          </ToolbarButton>
          <ToolbarButton label="刷新" disabled={!rootId} onClick={refresh}>
            <RefreshCw />
          </ToolbarButton>
          <ToolbarButton
            label="折叠全部"
            disabled={!rootId}
            onClick={collapseAll}
          >
            <FolderTree />
          </ToolbarButton>
          <ToolbarButton
            label={showHidden ? "隐藏隐藏文件" : "显示隐藏文件"}
            disabled={!rootId}
            active={showHidden}
            onClick={() => setShowHidden((value) => !value)}
          >
            {showHidden ? <EyeOff /> : <Eye />}
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onUploadChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onUploadChange}
          />
        </div>
      </header>

      {checkedList.length > 0 ? (
        <WorkspaceBulkActionBar
          selectedCount={checkedList.length}
          fileCount={checkedFileCount}
          directoryCount={checkedDirectoryCount}
          onCopy={() => openBulkTransfer("copy")}
          onMove={() => openBulkTransfer("move")}
          onArchive={openBulkArchive}
          onDelete={() => {
            setBulkDeleteConfirm("");
            setBulkDialog({ kind: "delete" });
          }}
          onClear={clearCheckedEntries}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-2">
        {rootId ? (
          <FileTree
            key={`${rootId}:${treeVersion}:${showHidden ? "hidden" : "visible"}`}
            rootId={rootId}
            showHidden={showHidden}
            basePath=""
            focusedPath={currentDirectory}
            rootAbsolutePath={root?.absolutePath}
            selectedPath={activeEntry?.path ?? selectedPath}
            checkedPaths={checkedPaths}
            onToggleChecked={toggleCheckedEntry}
            onDirectoryFocus={setCurrentDirectory}
            onSelect={(path, entry) => {
              setActiveEntry({ path, name: entry.name, kind: entry.kind });
            }}
            onOpen={(path, entry) => {
              setActiveEntry({ path, name: entry.name, kind: entry.kind });
              if (entry.kind === "directory") {
                setCurrentDirectory(path);
                return;
              }
              onSelectFile?.(path);
            }}
            onActiveEntryChange={(path, entry) => {
              setActiveEntry({ path, name: entry.name, kind: entry.kind });
              if (entry.kind === "directory") setCurrentDirectory(path);
            }}
            onContextMenu={(e, path, entry) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveEntry({ path, name: entry.name, kind: entry.kind });
              if (entry.kind === "directory") setCurrentDirectory(path);
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

      {!uploadDialog.open &&
      (uploadJobs.length > 0 || uploadSnapshots.length > 0) ? (
        <UploadTaskStrip
          jobs={uploadJobs}
          snapshots={uploadSnapshots}
          onOpen={reopenUploadManager}
          onPause={() => uploadHandleRef.current?.pause()}
          onResume={() => void resumeUpload()}
          onCancel={() => uploadHandleRef.current?.cancel()}
        />
      ) : null}

      {menu && (
        <FileActionsMenu
          open
          x={menu.x}
          y={menu.y}
          rootId={rootId}
          target={menu.target}
          initialFlow={menu.initialFlow}
          onClose={closeMenu}
          onAfterMutation={refresh}
          onUploadRequest={openUploadManager}
          onPreviewRequest={(target) => {
            if (target.kind === "file") setPreviewEntry(target);
          }}
          onPropertiesRequest={setPropertiesEntry}
          onCopyPathRequest={(target, mode) => void copyPath(target, mode)}
          onSetDefaultDirectoryRequest={(target) =>
            saveDefaultDirectory(target)
          }
        />
      )}

      {previewEntry?.kind === "file" ? (
        <FilePreviewDialog
          rootId={rootId}
          entry={fileEntryFromActionTarget(previewEntry)}
          readQuery={previewReadQuery}
          onOpenChange={(open) => {
            if (!open) setPreviewEntry(null);
          }}
        />
      ) : null}

      <FilePropertiesDialog
        entry={propertiesEntry ?? undefined}
        rootLabel={root?.labelZh ?? rootId}
        displayPath={
          propertiesEntry
            ? absoluteDisplayPath(root?.absolutePath, propertiesEntry.path)
            : ""
        }
        onOpenChange={(open) => {
          if (!open) setPropertiesEntry(null);
        }}
      />

      <WorkspaceBulkDialog
        dialog={bulkDialog}
        selected={checkedList}
        archiveName={bulkArchiveName}
        deleteConfirm={bulkDeleteConfirm}
        targetDirectory={bulkTargetDirectory}
        conflictPolicy={bulkConflictPolicy}
        transferPreview={bulkTransferPreview}
        transferPreviewBusy={bulkTransferPreviewBusy}
        busy={bulkBusy}
        currentDirectory={currentDirectory}
        fileCount={checkedFileCount}
        directoryCount={checkedDirectoryCount}
        onArchiveNameChange={setBulkArchiveName}
        onDeleteConfirmChange={setBulkDeleteConfirm}
        onTargetDirectoryChange={setBulkTargetDirectory}
        onConflictPolicyChange={setBulkConflictPolicy}
        onClose={() => {
          setBulkDialog(null);
          setBulkDeleteConfirm("");
          setBulkTransferPreview(null);
        }}
        onConfirmArchive={() => void executeBulkArchive()}
        onConfirmDelete={() => void executeBulkDelete()}
        onConfirmTransfer={() => void executeBulkTransfer()}
      />

      <UploadManagerDialog
        open={uploadDialog.open}
        targetDirectory={uploadDialog.targetDirectory}
        files={uploadDialog.files}
        jobs={uploadJobs}
        activeUpload={activeUpload}
        onChooseFiles={() => fileInputRef.current?.click()}
        onChooseFolder={() => folderInputRef.current?.click()}
        onPasteFiles={(files) => {
          setUploadDialog((state) => ({
            ...state,
            files: [...state.files, ...files],
          }));
        }}
        onClear={() => {
          uploadHandleRef.current?.cancel();
          setUploadJobs([]);
          setUploadSnapshots([]);
          saveUploadTaskSnapshots(WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY, []);
          setUploadDialog((state) => ({ ...state, files: [] }));
        }}
        onRemoveFile={(index) => {
          setUploadDialog((state) => ({
            ...state,
            files: state.files.filter((_, fileIndex) => fileIndex !== index),
          }));
        }}
        conflictPolicy={uploadDialog.conflictPolicy}
        onChangeConflictPolicy={(conflictPolicy) =>
          setUploadDialog((state) => ({ ...state, conflictPolicy }))
        }
        onChangeTargetDirectory={(targetDirectory) =>
          setUploadDialog((state) => ({ ...state, targetDirectory }))
        }
        onStart={() =>
          void startUpload(
            uploadDialog.files,
            uploadDialog.targetDirectory,
            uploadDialog.conflictPolicy,
          )
        }
        onPause={() => uploadHandleRef.current?.pause()}
        onResume={() => void resumeUpload()}
        onCancelUpload={() => uploadHandleRef.current?.cancel()}
        onOpenChange={(open) => {
          if (!open) closeUploadManager();
          else setUploadDialog((state) => ({ ...state, open: true }));
        }}
      />
    </div>
  );
}

const WORKSPACE_DEFAULT_DIRECTORY_STORAGE_KEY =
  "tracevane.workspace.default-directory.v1";

interface StoredWorkspaceDefaultDirectory {
  rootId: string;
  relativePath: string;
}

function loadWorkspaceDefaultDirectory(): StoredWorkspaceDefaultDirectory {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WORKSPACE_DEFAULT_DIRECTORY_STORAGE_KEY) ||
        "null",
    ) as Partial<StoredWorkspaceDefaultDirectory> | null;
    return {
      rootId: typeof parsed?.rootId === "string" ? parsed.rootId : "",
      relativePath:
        typeof parsed?.relativePath === "string"
          ? normalizeWorkspacePathInput(parsed.relativePath)
          : "",
    };
  } catch {
    return { rootId: "", relativePath: "" };
  }
}

function saveWorkspaceDefaultDirectory(
  value: StoredWorkspaceDefaultDirectory,
): void {
  try {
    window.localStorage.setItem(
      WORKSPACE_DEFAULT_DIRECTORY_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {}
}

function normalizeWorkspacePathInput(
  value: string,
  rootAbsolutePath?: string,
): string {
  const raw = value.trim().replace(/\\/g, "/");
  if (!raw || raw === "/" || raw === ".") return "";
  const root = rootAbsolutePath?.replace(/\/+$/, "");
  const withoutRoot =
    root && raw === root
      ? ""
      : root && raw.startsWith(`${root}/`)
        ? raw.slice(root.length + 1)
        : raw;
  return withoutRoot
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..")
    .join("/");
}

function extensionOf(name: string): string | null {
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return null;
  return name.slice(index + 1).toLowerCase();
}

function fileEntryFromActionTarget(
  target: FileActionsMenuTarget,
): FileEntrySummary {
  return {
    path: target.path,
    name: target.name,
    kind: target.kind,
    ext: target.kind === "file" ? extensionOf(target.name) : null,
    size: null,
    modifiedAt: null,
    hidden: target.name.startsWith("."),
    textLike: false,
    imageLike: false,
    mode: "",
    permissions: "",
    uid: null,
    gid: null,
  };
}

function WorkspaceBulkActionBar({
  selectedCount,
  fileCount,
  directoryCount,
  onCopy,
  onMove,
  onArchive,
  onDelete,
  onClear,
}: {
  selectedCount: number;
  fileCount: number;
  directoryCount: number;
  onCopy: () => void;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="border-b border-line bg-primary-soft/60 px-2 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-primary">
          已选择 {selectedCount} 项 · {fileCount} 文件 / {directoryCount} 目录
        </span>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded border border-line bg-panel px-2 text-muted hover:text-ink-strong"
          onClick={onCopy}
          title="复制所选到目标目录并预检冲突"
        >
          <Copy className="size-3.5" />
          复制
        </button>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded border border-line bg-panel px-2 text-muted hover:text-ink-strong"
          onClick={onMove}
          title="移动所选到目标目录并预检冲突"
        >
          <MoveRight className="size-3.5" />
          移动
        </button>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded border border-line bg-panel px-2 text-muted hover:text-ink-strong"
          onClick={onArchive}
          title="打包所选到当前目录"
        >
          <Archive className="size-3.5" />
          打包
        </button>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded border border-red/30 bg-red-soft px-2 text-red hover:bg-red-soft/80"
          onClick={onDelete}
          title="删除所选，需输入 DELETE 确认"
        >
          <Trash2 className="size-3.5" />
          删除
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded border border-line bg-panel text-subtle hover:text-ink"
          onClick={onClear}
          aria-label="清空多选"
          title="清空多选"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function WorkspaceBulkDialog({
  dialog,
  selected,
  archiveName,
  deleteConfirm,
  targetDirectory,
  conflictPolicy,
  transferPreview,
  transferPreviewBusy,
  busy,
  currentDirectory,
  fileCount,
  directoryCount,
  onArchiveNameChange,
  onDeleteConfirmChange,
  onTargetDirectoryChange,
  onConflictPolicyChange,
  onClose,
  onConfirmArchive,
  onConfirmDelete,
  onConfirmTransfer,
}: {
  dialog: WorkspaceBulkDialogState;
  selected: FileActionsMenuTarget[];
  archiveName: string;
  deleteConfirm: string;
  targetDirectory: string;
  conflictPolicy: FilesTransferConflictPolicy;
  transferPreview: FilesTransferDryRunResponse | null;
  transferPreviewBusy: boolean;
  busy: boolean;
  currentDirectory: string;
  fileCount: number;
  directoryCount: number;
  onArchiveNameChange: (value: string) => void;
  onDeleteConfirmChange: (value: string) => void;
  onTargetDirectoryChange: (value: string) => void;
  onConflictPolicyChange: (value: FilesTransferConflictPolicy) => void;
  onClose: () => void;
  onConfirmArchive: () => void;
  onConfirmDelete: () => void;
  onConfirmTransfer: () => void;
}) {
  if (!dialog) return null;
  const isDelete = dialog.kind === "delete";
  const isArchive = dialog.kind === "archive";
  const isTransfer = dialog.kind === "copy" || dialog.kind === "move";
  const blockedTransfer = Boolean(
    isTransfer &&
    (!transferPreview ||
      transferPreviewBusy ||
      transferPreview.counts.conflicts > 0 ||
      transferPreview.counts.errors > 0),
  );
  const disabled =
    busy ||
    selected.length === 0 ||
    (isDelete ? deleteConfirm.trim() !== "DELETE" : false) ||
    (isArchive ? archiveName.trim().length === 0 : false) ||
    (isTransfer ? blockedTransfer : false);
  const title = isDelete
    ? "删除所选项目"
    : isArchive
      ? "打包所选项目"
      : dialog.kind === "copy"
        ? "复制所选项目"
        : "移动所选项目";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {selected.length} 项 · {fileCount} 文件 / {directoryCount} 目录 ·
            当前目录 {displayDir(currentDirectory)}
          </DialogDescription>
        </DialogHeader>
        {isDelete ? (
          <div className="grid gap-3 px-5 py-3 text-sm text-muted">
            <div className="rounded border border-red/20 bg-red-soft p-3 text-red">
              <div className="font-semibold">
                危险操作：Workspace 删除后不可在前端撤销
              </div>
              <div className="mt-1 text-xs">
                请检查路径，并输入 DELETE 后才允许执行批量删除。
              </div>
            </div>
            <WorkspaceSelectedPathList selected={selected} />
            <label className="grid gap-1 text-xs text-subtle">
              输入 DELETE 确认删除
              <Input
                value={deleteConfirm}
                onChange={(event) => onDeleteConfirmChange(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </label>
          </div>
        ) : isArchive ? (
          <div className="grid gap-3 px-5 py-3 text-sm text-muted">
            <label className="grid gap-1 text-xs text-subtle">
              归档文件名（保存到当前目录）
              <Input
                value={archiveName}
                onChange={(event) => onArchiveNameChange(event.target.value)}
                placeholder="workspace-selection.zip"
                autoComplete="off"
              />
            </label>
            <WorkspaceSelectedPathList selected={selected} />
          </div>
        ) : (
          <div className="grid gap-3 px-5 py-3 text-sm text-muted">
            <div className="rounded border border-line bg-panel-2 p-3 text-xs text-muted">
              Workspace 侧栏执行轻量批量复制/移动；提交前使用服务端 dry-run
              预检同名冲突。复杂审计、操作历史和拖拽移动仍由独立文件管理器承载。
            </div>
            <label className="grid gap-1 text-xs text-subtle">
              目标目录（默认当前目录，可输入 root 内相对路径）
              <Input
                value={targetDirectory}
                onChange={(event) =>
                  onTargetDirectoryChange(event.target.value)
                }
                placeholder="例如 docs 或 apps/web/src"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-xs text-subtle">
              同名冲突策略
              <select
                value={conflictPolicy}
                onChange={(event) =>
                  onConflictPolicyChange(
                    event.target.value as FilesTransferConflictPolicy,
                  )
                }
                className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink outline-none focus-visible:shadow-[var(--ring)]"
              >
                <option value="fail">阻止：发现同名则不执行</option>
                <option value="overwrite">覆盖：明确替换目标同名项</option>
                <option value="skip">跳过：保留目标同名项</option>
                <option value="rename">保留两者：自动生成 name (1).ext</option>
              </select>
            </label>
            <WorkspaceTransferDryRunSummary
              preview={transferPreview}
              busy={transferPreviewBusy}
            />
            <WorkspaceSelectedPathList selected={selected} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant={isDelete ? "danger" : "primary"}
            onClick={
              isDelete
                ? onConfirmDelete
                : isArchive
                  ? onConfirmArchive
                  : onConfirmTransfer
            }
            disabled={disabled}
          >
            {busy
              ? "处理中..."
              : isDelete
                ? "确认删除"
                : isArchive
                  ? "开始打包"
                  : dialog.kind === "copy"
                    ? "确认复制"
                    : "确认移动"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceSelectedPathList({
  selected,
}: {
  selected: FileActionsMenuTarget[];
}) {
  return (
    <div className="max-h-44 overflow-auto rounded border border-line bg-panel-2 p-2 text-xs">
      {selected.map((entry) => (
        <div key={entry.path} className="truncate">
          {entry.path}
        </div>
      ))}
    </div>
  );
}

function WorkspaceTransferDryRunSummary({
  preview,
  busy,
}: {
  preview: FilesTransferDryRunResponse | null;
  busy: boolean;
}) {
  if (busy)
    return (
      <div className="rounded border border-line bg-panel px-2 py-1 text-xs text-subtle">
        正在预检目标冲突…
      </div>
    );
  if (!preview)
    return (
      <div className="rounded border border-line bg-panel px-2 py-1 text-xs text-subtle">
        输入目标目录后将自动预检同名冲突。
      </div>
    );
  const { counts } = preview;
  const risky = counts.conflicts + counts.overwrite;
  const visibleItems = preview.items
    .filter((item) => item.status !== "ready")
    .slice(0, 6);
  return (
    <div className="grid gap-2 rounded border border-line bg-panel p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">服务端预检</span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
          {counts.total} 项
        </span>
        <span className="rounded-full bg-green-soft px-2 py-0.5 text-green">
          {counts.ready} 就绪
        </span>
        {counts.rename ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
            {counts.rename} 保留两者
          </span>
        ) : null}
        {counts.skip ? (
          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
            {counts.skip} 跳过
          </span>
        ) : null}
        {risky ? (
          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-amber">
            {risky} 风险
          </span>
        ) : null}
        {counts.errors ? (
          <span className="rounded-full bg-red-soft px-2 py-0.5 text-red">
            {counts.errors} 错误
          </span>
        ) : null}
      </div>
      {counts.conflicts ? (
        <div className="rounded border border-red/20 bg-red-soft px-2 py-1 text-red">
          存在阻塞冲突，请选择覆盖、跳过或保留两者后再执行。
        </div>
      ) : null}
      {visibleItems.length ? (
        <div className="max-h-28 overflow-auto rounded border border-line bg-panel-2">
          {visibleItems.map((item) => (
            <div
              key={`${item.sourcePath}:${item.status}:${item.destinationPath ?? ""}`}
              className="grid gap-0.5 border-b border-line px-2 py-1 last:border-b-0"
            >
              <span className="truncate font-mono text-[11px] text-ink-strong">
                {item.sourcePath}
              </span>
              <span className="truncate text-subtle">
                {workspaceTransferStatusLabel(item.status)} ·{" "}
                {item.destinationPath ?? "—"}
                {item.message ? ` · ${item.message}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function workspaceTransferStatusLabel(
  status: FilesTransferDryRunResponse["items"][number]["status"],
): string {
  if (status === "ready") return "可执行";
  if (status === "conflict") return "冲突";
  if (status === "overwrite") return "覆盖";
  if (status === "skip") return "跳过";
  if (status === "rename") return "重命名";
  return "错误";
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-sm text-muted outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45",
        active && "bg-primary-soft text-primary",
      )}
    >
      {React.cloneElement(children, { className: "size-3.5" })}
    </button>
  );
}

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

function absoluteDisplayPath(
  rootAbsolutePath: string | undefined,
  path: string,
): string {
  const rootPath = normalizeAbsolutePath(rootAbsolutePath || "/");
  return normalizeAbsolutePath(path ? `${rootPath}/${path}` : rootPath);
}

function normalizeAbsolutePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized === "/") return "/";
  return normalized.replace(/\/$/, "");
}

function displayDir(dir: string): string {
  return dir ? dir : "/（根目录）";
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

function findTreeRowMenuPoint(
  root: HTMLElement | null,
  path: string,
): { x: number; y: number } {
  const rows = root?.querySelectorAll<HTMLElement>("[data-tree-path]");
  const row = rows
    ? Array.from(rows).find(
        (node) => node.getAttribute("data-tree-path") === path,
      )
    : null;
  if (!row) return { x: 24, y: 84 };
  const rect = row.getBoundingClientRect();
  return {
    x: Math.min(rect.left + 24, window.innerWidth - 240),
    y: Math.min(rect.top + Math.max(rect.height, 24), window.innerHeight - 380),
  };
}

function lastSegment(path: string): string {
  if (!path) return "root";
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(index + 1) : path;
}

function relativePathOf(file: File): string | undefined {
  return (
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    undefined
  );
}

function uploadStatusLabel(status: UploadJob["status"]): string {
  switch (status) {
    case "preparing":
      return "准备中";
    case "uploading":
      return "上传中";
    case "paused":
      return "已暂停";
    case "done":
      return "已完成";
    case "skipped":
      return "已跳过";
    case "error":
      return "失败";
    case "canceled":
      return "已取消";
    case "queued":
    default:
      return "等待上传";
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next >= 10 || unit === 0 ? next.toFixed(0) : next.toFixed(1)} ${units[unit]}`;
}

function estimateRemaining(
  total: number,
  loaded: number,
  speed: number,
): string {
  if (!speed || loaded >= total) return "--";
  const seconds = Math.ceil((total - loaded) / speed);
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.ceil(seconds / 60)}分钟`;
}

export default WorkspaceExplorer;
