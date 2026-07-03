import {
  Copy,
  ExternalLink,
  File as FileIcon,
  FilePlus2,
  ClipboardPaste,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  ListCollapse,
  RefreshCcw,
  Search,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";
import * as React from "react";

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
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { UploadManagerDialog } from "@/features/file-manager/file-tools/UploadManagerDialog";
import { createUploadBatch } from "@/features/file-manager/file-tools/uploadManager";
import type { UploadBatchHandle, UploadJob } from "@/features/file-manager/file-tools/uploadManager";
import {
  collectUploadFilesFromDataTransfer,
  hasUploadFilesInDataTransfer,
  mergeUploadFiles,
} from "@/features/file-manager/file-tools/uploadInputs";
import type { FileEntrySummary, FilesUploadConflictPolicy } from "@/features/file-manager/file-tools/types";
import {
  createExplorerClipboardFromEntries,
  createExplorerTransferPayload,
  assertExplorerTransferAllowed,
  explorerDirname,
  explorerPasteDestinationForEntry,
  explorerNodeKey,
  explorerParentPath,
  joinExplorerPath,
  normalizeExplorerPath,
  readExplorerTransferPayload,
  runExplorerTransferCommand,
  useExplorerCommands,
  useExplorerDirectory,
  useExplorerTreeState,
  writeExplorerTransferPayload,
  type ExplorerClipboardState as SharedExplorerClipboardState,
} from "@/shared/explorer-core";
import type { ExplorerEntry } from "@/shared/explorer-core";
import {
  ExplorerContextMenuBase,
  ExplorerEmptyState,
  ExplorerErrorState,
  ExplorerLoadingState,
  ExplorerTreeNode,
  DragFloatingPreview,
} from "@/shared/explorer-ui";
import type { ExplorerContextMenuItem, ExplorerTreeItem } from "@/shared/explorer-ui";

export type IdeExplorerPathEvent =
  | {
      type: "renamed" | "moved";
      rootId: string;
      oldPath: string;
      newPath: string;
      targetKind: FileEntrySummary["kind"];
    }
  | {
      type: "deleted";
      rootId: string;
      path: string;
      targetKind: FileEntrySummary["kind"];
    };

export interface IdeExplorerOpenTabRef {
  rootId: string;
  path: string;
  dirty: boolean;
  deleted?: boolean;
}

export interface IdeExplorerViewProps {
  hidden: boolean;
  rootId: string;
  rootLabel: string;
  rootAbsolutePath?: string;
  directoryPath: string;
  activeRootId?: string;
  activePath?: string;
  openTabs?: readonly IdeExplorerOpenTabRef[];
  onDirectoryPathChange: (path: string) => void;
  onOpenEntry: (entry: ExplorerEntry, options?: { pinned?: boolean }) => void;
  onPathEvent?: (event: IdeExplorerPathEvent) => void;
}

type IdeExplorerFlow =
  | { kind: "new-file"; directoryPath: string }
  | { kind: "new-directory"; directoryPath: string }
  | { kind: "rename"; entry: ExplorerEntry }
  | { kind: "delete"; entry: ExplorerEntry }
  | null;

interface ContextMenuState {
  entry: ExplorerEntry | null;
  x: number;
  y: number;
}

type ExplorerClipboardState = SharedExplorerClipboardState & { entry: ExplorerEntry };

interface UploadDialogState {
  open: boolean;
  targetDirectory: string;
  files: File[];
  conflictPolicy: FilesUploadConflictPolicy;
}

const TERMINAL_INSERT_EVENT = "tracevane:ide-terminal-insert-text";

export function IdeExplorerView({
  hidden,
  rootId,
  rootLabel,
  rootAbsolutePath,
  directoryPath,
  activeRootId,
  activePath,
  openTabs = [],
  onDirectoryPathChange,
  onOpenEntry,
  onPathEvent,
}: IdeExplorerViewProps) {
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [flow, setFlow] = React.useState<IdeExplorerFlow>(null);
  const [selectedEntry, setSelectedEntry] = React.useState<ExplorerEntry | null>(null);
  const [fileClipboard, setFileClipboard] = React.useState<ExplorerClipboardState | null>(null);
  const [dropTargetPath, setDropTargetPath] = React.useState<string | null>(null);
  const [uploadDialog, setUploadDialog] = React.useState<UploadDialogState>({
    open: false,
    targetDirectory: directoryPath,
    files: [],
    conflictPolicy: "rename",
  });
  const [uploadJobs, setUploadJobs] = React.useState<UploadJob[]>([]);
  const uploadHandleRef = React.useRef<UploadBatchHandle | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadTargetDirectoryRef = React.useRef<string>(directoryPath);
  const explorerActiveRef = React.useRef(false);
  const selectedEntryRef = React.useRef<ExplorerEntry | null>(null);
  const treeState = useExplorerTreeState();
  const { revealPath, select, setExpandedKeys, toggleExpanded } = treeState;
  const directory = useExplorerDirectory({
    rootId,
    directoryPath,
    enabled: Boolean(rootId) && !hidden,
  });
  const commands = useExplorerCommands();
  const activeNodeKey = React.useMemo(
    () =>
      activeRootId && activePath && activeRootId === rootId
        ? explorerNodeKey({ rootId, path: normalizeExplorerPath(activePath) })
        : null,
    [activePath, activeRootId, rootId],
  );

  React.useEffect(() => {
    selectedEntryRef.current = selectedEntry;
  }, [selectedEntry]);


  React.useEffect(() => {
    if (!directoryPath || !directory.isError) return;
    const message = String(directory.error?.message || "").toLowerCase();
    if (!message.includes("not found") && !message.includes("requested path")) return;
    onDirectoryPathChange("");
  }, [directory.error, directory.isError, directoryPath, onDirectoryPathChange]);

  React.useEffect(() => {
    if (!activePath || activeRootId !== rootId) return;
    revealPath({ rootId, directoryPath: explorerDirname(activePath) });
  }, [activePath, activeRootId, revealPath, rootId]);

  const refreshDirectory = React.useCallback(async () => {
    await directory.refresh();
  }, [directory]);

  const openContextMenu = React.useCallback((entry: ExplorerEntry | null, point: { x: number; y: number }) => {
    setContextMenu({ entry, x: point.x, y: point.y });
  }, []);

  const selectEntry = React.useCallback((entry: ExplorerEntry) => {
    setSelectedEntry(entry);
    select(entry.id);
  }, [select]);

  const queueUploadFilesToDirectory = React.useCallback((files: FileList | File[], targetDirectoryPath = directory.location.directoryPath) => {
    const fileArray = Array.from(files).filter(Boolean);
    if (!fileArray.length) return;
    setUploadJobs([]);
    setUploadDialog({
      open: true,
      targetDirectory: normalizeExplorerPath(targetDirectoryPath),
      files: fileArray,
      conflictPolicy: "rename",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }, [directory.location.directoryPath]);

  const activeUpload = uploadJobs.some((job) => job.status === "preparing" || job.status === "uploading");

  const startUpload = React.useCallback(async () => {
    if (!rootId || uploadDialog.files.length === 0 || activeUpload) return;
    uploadHandleRef.current?.cancel();
    const handle = createUploadBatch({
      rootId,
      directoryPath: uploadDialog.targetDirectory,
      files: uploadDialog.files,
      conflictPolicy: uploadDialog.conflictPolicy,
      onJobsChange: setUploadJobs,
    });
    uploadHandleRef.current = handle;
    try {
      await handle.done;
      await refreshDirectory();
      const failed = handle.jobs.filter((job) => job.status === "error").length;
      const skipped = handle.jobs.filter((job) => job.status === "skipped").length;
      if (failed) {
        toast.error("上传未完成", { description: `${failed} 个文件失败，可在上传窗口中继续处理。` });
      } else {
        toast.success("上传完成", { description: `${uploadDialog.files.length - skipped} 个文件已上传${skipped ? `，${skipped} 个已跳过` : ""}` });
        setUploadJobs([]);
      }
    } catch (error) {
      toast.error("上传失败", { description: error instanceof Error ? error.message : String(error) });
    }
  }, [activeUpload, refreshDirectory, rootId, uploadDialog.conflictPolicy, uploadDialog.files, uploadDialog.targetDirectory]);

  const copySelectionToExplorerClipboard = React.useCallback((operation: "copy" | "move", entry = selectedEntry) => {
    if (!entry) return false;
    setFileClipboard({
      ...createExplorerClipboardFromEntries(operation, [entry]),
      entry,
    });
    toast.success(operation === "copy" ? "已复制到资源管理器剪贴板" : "已剪切到资源管理器剪贴板", {
      description: entry.path || entry.name,
    });
    return true;
  }, [selectedEntry]);

  const flowTargetDirectory = React.useMemo(() => {
    if (flow?.kind === "new-file" || flow?.kind === "new-directory") return flow.directoryPath;
    const entry = flow && "entry" in flow ? flow.entry : contextMenu?.entry;
    if (!entry) return directory.location.directoryPath;
    return entry.kind === "directory" ? entry.path : explorerDirname(entry.path);
  }, [contextMenu?.entry, directory.location.directoryPath, flow]);

  const openedForFlow = React.useMemo(() => {
    const target = flow && "entry" in flow ? flow.entry : null;
    if (!target) return [];
    return openTabs.filter((tab) =>
      tab.rootId === rootId && pathTouchesTarget(target.path, target.kind, tab.path),
    );
  }, [flow, openTabs, rootId]);

  const runCreate = React.useCallback(
    async (kind: "file" | "directory", name: string) => {
      if (kind === "file") {
        await commands.createFile({ rootId, directoryPath: flowTargetDirectory }, name, "");
      } else {
        await commands.createDirectory({ rootId, directoryPath: flowTargetDirectory }, name);
      }
      await refreshDirectory();
      setFlow(null);
    },
    [commands, flowTargetDirectory, refreshDirectory, rootId],
  );

  const runRename = React.useCallback(
    async (entry: ExplorerEntry, nextName: string) => {
      const result = await commands.rename({ rootId, path: entry.path }, nextName);
      const newPath = normalizeExplorerPath(result.affectedPaths[1] ?? joinExplorerPath(explorerDirname(entry.path), nextName));
      onPathEvent?.({ type: "renamed", rootId, oldPath: entry.path, newPath, targetKind: entry.kind });
      await refreshDirectory();
      setFlow(null);
    },
    [commands, onPathEvent, refreshDirectory, rootId],
  );

  const runTransfer = React.useCallback(
    async (entry: ExplorerEntry, operation: "copy" | "move", destinationDirectoryPath: string, nextName?: string) => {
      const transfer = await runExplorerTransferCommand({
        commands,
        rootId,
        entry,
        operation,
        destinationDirectoryPath,
        nextName,
      });
      if (transfer.pathEvent) onPathEvent?.({ ...transfer.pathEvent, targetKind: entry.kind });
      await refreshDirectory();
      setFlow(null);
    },
    [commands, onPathEvent, refreshDirectory, rootId],
  );

  const pasteExplorerClipboard = React.useCallback(async (targetDirectoryPath = directory.location.directoryPath) => {
    if (!fileClipboard) return false;
    const allowed = assertExplorerTransferAllowed([fileClipboard.entry], targetDirectoryPath);
    const entry = fileClipboard.entry;
    if (!allowed.ok) {
      toast.error("不能把目录移动或复制到自身内部", { description: allowed.blocked.path });
      return false;
    }
    try {
      await runTransfer(entry, fileClipboard.operation, allowed.destination);
      if (fileClipboard.operation === "move") setFileClipboard(null);
      toast.success(fileClipboard.operation === "copy" ? "已粘贴副本" : "已移动到目标目录", { description: allowed.destination || "/" });
      return true;
    } catch {
      // runTransfer / fileOperations already surface the error toast.
      return false;
    }
  }, [directory.location.directoryPath, fileClipboard, runTransfer]);

  const handleExplorerKeyboard = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (!shouldHandleExplorerShortcut(event.target)) return;
    const cmd = event.metaKey || event.ctrlKey;
    if (cmd && event.key.toLowerCase() === "c") {
      if (copySelectionToExplorerClipboard("copy")) event.preventDefault();
      return;
    }
    if (cmd && event.key.toLowerCase() === "x") {
      if (copySelectionToExplorerClipboard("move")) event.preventDefault();
      return;
    }
    if (cmd && event.key.toLowerCase() === "v") {
      if (fileClipboard) {
        event.preventDefault();
        void pasteExplorerClipboard();
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!selectedEntry) return;
      event.preventDefault();
      setFlow({ kind: "delete", entry: selectedEntry });
      return;
    }
    if (event.key === "F2") {
      if (!selectedEntry) return;
      event.preventDefault();
      setFlow({ kind: "rename", entry: selectedEntry });
      return;
    }
    if (event.key === "Enter" && selectedEntry) {
      event.preventDefault();
      if (selectedEntry.kind === "directory") onDirectoryPathChange(selectedEntry.path);
      else onOpenEntry(selectedEntry);
    }
  }, [copySelectionToExplorerClipboard, fileClipboard, onDirectoryPathChange, onOpenEntry, pasteExplorerClipboard, selectedEntry]);

  const handleExplorerPaste = React.useCallback((event: React.ClipboardEvent<HTMLElement>) => {
    if (!shouldHandleExplorerShortcut(event.target)) return;
    const dataTransfer = event.clipboardData;
    if (!hasUploadFilesInDataTransfer(dataTransfer)) return;
    event.preventDefault();
    const targetDirectory = selectedEntry?.kind === "directory" ? selectedEntry.path : directory.location.directoryPath;
    void collectUploadFilesFromDataTransfer(dataTransfer)
      .then((files) => queueUploadFilesToDirectory(files, targetDirectory))
      .catch((error) => {
        toast.error("读取剪贴板文件失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }, [directory.location.directoryPath, selectedEntry, queueUploadFilesToDirectory]);

  const handleExplorerDrop = React.useCallback((event: React.DragEvent<HTMLElement>, targetDirectoryPath = directory.location.directoryPath) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetPath(null);
    const destination = normalizeExplorerPath(targetDirectoryPath);
    if (event.dataTransfer.files?.length) {
      void queueUploadFilesToDirectory(event.dataTransfer.files, destination);
      return;
    }
    const resource = readExplorerTransferPayload(event.dataTransfer);
    const item = resource?.items?.[0];
    if (!resource || (resource.rootId && resource.rootId !== rootId) || !item) return;
    const entry: ExplorerEntry = {
      id: explorerNodeKey({ rootId, path: item.path }),
      rootId,
      path: normalizeExplorerPath(item.path),
      name: item.name || item.path.split("/").pop() || item.path,
      kind: item.kind === "directory" ? "directory" : "file",
    } as ExplorerEntry;
    const allowed = assertExplorerTransferAllowed([entry], destination);
    if (!allowed.ok) {
      toast.error("不能拖动目录到自身内部", { description: allowed.blocked.path });
      return;
    }
    const operation = event.ctrlKey || event.altKey ? "copy" : "move";
    void runTransfer(entry, operation, allowed.destination);
  }, [directory.location.directoryPath, rootId, runTransfer, queueUploadFilesToDirectory]);

  const moveEntryByPointer = React.useCallback((entry: ExplorerEntry, destinationDirectoryPath: string, copy: boolean) => {
    setDropTargetPath(null);
    const allowed = assertExplorerTransferAllowed([entry], destinationDirectoryPath);
    if (!allowed.ok) {
      toast.error("不能拖动目录到自身内部", { description: allowed.blocked.path });
      return;
    }
    void runTransfer(entry, copy ? "copy" : "move", allowed.destination);
  }, [runTransfer]);

  const contextItems = React.useMemo<ExplorerContextMenuItem[]>(() => {
    const entry = contextMenu?.entry ?? null;
    const currentDirectoryPath = directory.location.directoryPath;
    const currentAbsolutePath = joinAbsolutePath(rootAbsolutePath, currentDirectoryPath);
    const entryAbsolutePath = entry ? joinAbsolutePath(rootAbsolutePath, entry.path) : currentAbsolutePath;
    const items: ExplorerContextMenuItem[] = [];
    if (!entry) {
      items.push(
        {
          id: "copy-current-relative-path",
          label: "复制当前目录相对路径",
          icon: <Copy />,
          separatorBefore: true,
          onSelect: () => void copyExplorerPath(currentDirectoryPath || "/", "relative"),
        },
        {
          id: "copy-current-absolute-path",
          label: "复制当前目录绝对路径",
          icon: <Copy />,
          onSelect: () => void copyExplorerPath(currentAbsolutePath, "absolute"),
        },
        {
          id: "insert-current-path-terminal",
          label: "插入当前目录路径到终端",
          icon: <ExternalLink />,
          onSelect: () => dispatchTerminalInsertPath(currentAbsolutePath),
        },
        ...(fileClipboard
          ? [{
              id: "paste-current-directory",
              label: "粘贴到当前目录",
              icon: <ClipboardPaste />,
              shortcut: "Ctrl V",
              onSelect: () => void pasteExplorerClipboard(currentDirectoryPath),
            } satisfies ExplorerContextMenuItem]
          : []),
      );
      if (currentDirectoryPath) {
        items.push({
          id: "workspace-root",
          label: "回到工作区根目录",
          icon: <FolderInput />,
          separatorBefore: true,
          onSelect: () => onDirectoryPathChange(""),
        });
      }
    }
    if (entry?.kind === "directory") {
      items.push({
        id: "enter-directory",
        label: "进入目录",
        icon: <ExternalLink />,
        separatorBefore: true,
        onSelect: () => onDirectoryPathChange(entry.path),
      });
    }
    if (entry) {
      items.push(
        {
          id: "rename",
          label: "重命名",
          icon: <Pencil />,
          shortcut: "F2",
          separatorBefore: entry.kind !== "directory",
          onSelect: () => setFlow({ kind: "rename", entry }),
        },
        {
          id: "copy-clipboard",
          label: "复制",
          icon: <Copy />,
          shortcut: "Ctrl C",
          onSelect: () => copySelectionToExplorerClipboard("copy", entry),
        },
        {
          id: "cut-clipboard",
          label: "剪切",
          icon: <Scissors />,
          shortcut: "Ctrl X",
          onSelect: () => copySelectionToExplorerClipboard("move", entry),
        },
        ...(fileClipboard
          ? [{
              id: "paste-here",
              label: entry.kind === "directory" ? "粘贴到此处" : "粘贴到所在目录",
              icon: <ClipboardPaste />,
              shortcut: "Ctrl V",
              separatorBefore: true,
              onSelect: () => void pasteExplorerClipboard(explorerPasteDestinationForEntry(entry, directory.location.directoryPath)),
            } satisfies ExplorerContextMenuItem]
          : []),
        {
          id: "copy-relative-path",
          label: "复制相对路径",
          icon: <Copy />,
          separatorBefore: !fileClipboard,
          onSelect: () => void copyExplorerPath(entry.path, "relative"),
        },
        {
          id: "copy-absolute-path",
          label: "复制绝对路径",
          icon: <Copy />,
          onSelect: () => void copyExplorerPath(entryAbsolutePath, "absolute"),
        },
        {
          id: "insert-path-terminal",
          label: "插入路径到终端",
          icon: <ExternalLink />,
          onSelect: () => dispatchTerminalInsertPath(entryAbsolutePath),
        },
        {
          id: "delete",
          label: "删除…",
          icon: <Trash2 />,
          shortcut: "Del",
          danger: true,
          separatorBefore: true,
          onSelect: () => setFlow({ kind: "delete", entry }),
        },
      );
    }
    return items;
  }, [contextMenu?.entry, copySelectionToExplorerClipboard, directory.location.directoryPath, fileClipboard, onDirectoryPathChange, pasteExplorerClipboard, rootAbsolutePath]);

  const runDelete = React.useCallback(
    async (entry: ExplorerEntry, permanent: boolean) => {
      await commands.remove({ rootId, paths: [entry.path], permanent });
      onPathEvent?.({ type: "deleted", rootId, path: entry.path, targetKind: entry.kind });
      await refreshDirectory();
      setFlow(null);
    },
    [commands, onPathEvent, refreshDirectory, rootId],
  );


  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      explorerActiveRef.current = event.target instanceof Element && Boolean(event.target.closest("[data-ide-explorer]"));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!explorerActiveRef.current || event.defaultPrevented) return;
      if (!shouldHandleExplorerGlobalShortcut(event.target)) return;
      const selected = selectedEntryRef.current;
      const cmd = event.metaKey || event.ctrlKey;
      if (cmd && event.key.toLowerCase() === "c") {
        if (!selected || !copySelectionToExplorerClipboard("copy", selected)) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (cmd && event.key.toLowerCase() === "x") {
        if (!selected || !copySelectionToExplorerClipboard("move", selected)) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (cmd && event.key.toLowerCase() === "v") {
        if (!fileClipboard) return;
        event.preventDefault();
        event.stopPropagation();
        void pasteExplorerClipboard(explorerPasteDestinationForEntry(selected, directory.location.directoryPath));
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) return;
        event.preventDefault();
        event.stopPropagation();
        setFlow({ kind: "delete", entry: selected });
        return;
      }
      if (event.key === "F2") {
        if (!selected) return;
        event.preventDefault();
        event.stopPropagation();
        setFlow({ kind: "rename", entry: selected });
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [copySelectionToExplorerClipboard, directory.location.directoryPath, fileClipboard, pasteExplorerClipboard]);

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;

  return (
    <aside
      className="group/ide-explorer grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-r border-line bg-panel"
      data-ide-sidebar
      data-ide-explorer
      tabIndex={0}
      onPointerDownCapture={(event) => {
        if (shouldHandleExplorerShortcut(event.target)) event.currentTarget.focus();
      }}
      onKeyDown={handleExplorerKeyboard}
      onPaste={handleExplorerPaste}
      onContextMenu={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-explorer-node-key]")) return;
        event.preventDefault();
        openContextMenu(null, { x: event.clientX, y: event.clientY });
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = event.ctrlKey || event.altKey ? "copy" : "move";
        setDropTargetPath(directory.location.directoryPath);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetPath(null);
      }}
      onDrop={(event) => handleExplorerDrop(event, directory.location.directoryPath)}
    >
      <div className="relative border-b border-line bg-panel px-2.5 py-2" data-ide-explorer-toolbar>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files?.length) void queueUploadFilesToDirectory(files, uploadTargetDirectoryRef.current || directory.location.directoryPath);
          }}
          data-ide-explorer-upload-input
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files?.length) void queueUploadFilesToDirectory(files, uploadTargetDirectoryRef.current || directory.location.directoryPath);
          }}
          {...{ webkitdirectory: "", directory: "" }}
          data-ide-explorer-folder-upload-input
        />
        <div className="min-w-0 pr-24 sm:pr-32">
          <div className="truncate text-sm font-semibold text-ink-strong">资源管理器</div>
          <div className="truncate text-xs text-subtle">{rootLabel || "Workspace Explorer"}</div>
        </div>
        <div className="absolute right-2 top-2 flex max-w-[calc(100%-1rem)] items-center gap-1 overflow-x-auto rounded-md bg-panel/95 opacity-0 shadow-sm transition-opacity [scrollbar-width:none] group-hover/ide-explorer:opacity-100 group-focus-within/ide-explorer:opacity-100 [&::-webkit-scrollbar]:hidden">
          <ExplorerToolbarIconButton
            label="新建文件"
            onClick={() => setFlow({ kind: "new-file", directoryPath: directory.location.directoryPath })}
          >
            <FilePlus2 />
          </ExplorerToolbarIconButton>
          <ExplorerToolbarIconButton
            label="新建目录"
            onClick={() => setFlow({ kind: "new-directory", directoryPath: directory.location.directoryPath })}
          >
            <FolderPlus />
          </ExplorerToolbarIconButton>
          <ExplorerToolbarIconButton label="上传文件" onClick={() => {
            uploadTargetDirectoryRef.current = directory.location.directoryPath;
            setUploadDialog({ open: true, targetDirectory: directory.location.directoryPath, files: [], conflictPolicy: "rename" });
            setUploadJobs([]);
          }} disabled={activeUpload}>
            <Upload />
          </ExplorerToolbarIconButton>
          <ExplorerToolbarIconButton label="快速过滤（预留）" onClick={() => toast.info("快速过滤将在 M6 Search 阶段接入", { description: "当前保留入口，不抢先实现搜索索引。" })}>
            <Search />
          </ExplorerToolbarIconButton>
          <ExplorerToolbarIconButton label="刷新" onClick={() => void refreshDirectory()}>
            <RefreshCcw />
          </ExplorerToolbarIconButton>
          <ExplorerToolbarIconButton label="折叠所有文件夹" onClick={() => setExpandedKeys([])}>
            <ListCollapse />
          </ExplorerToolbarIconButton>
        </div>
      </div>
      <div
        className="min-h-0 overflow-auto p-2 [scrollbar-color:transparent_transparent] [scrollbar-width:thin] group-hover/ide-explorer:[scrollbar-color:var(--line)_transparent] group-focus-within/ide-explorer:[scrollbar-color:var(--line)_transparent] [&::-webkit-scrollbar]:size-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent group-hover/ide-explorer:[&::-webkit-scrollbar-thumb]:bg-line group-focus-within/ide-explorer:[&::-webkit-scrollbar-thumb]:bg-line"
        data-ide-explorer-scroll
      >
        <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-muted" data-ide-explorer-path-row>
          <span className="min-w-0 flex-1 truncate rounded-sm bg-panel-2 px-2 py-1 font-mono" title={directory.absolutePath} data-ide-explorer-path>
            {directory.location.directoryPath || "/"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!directory.parentPath}
            onClick={() => {
              const parent = explorerParentPath(directory.location.directoryPath);
              if (parent != null) onDirectoryPathChange(parent);
            }}
            data-ide-explorer-parent
          >
            上级
          </Button>
        </div>
        {directory.isLoading ? (
          <ExplorerLoadingState className="min-h-full" title="正在加载工作区文件…" />
        ) : directory.isError ? (
          <ExplorerErrorState
            className="min-h-full"
            title="资源管理器加载失败"
            description={directory.error?.message ?? "请稍后重试。"}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshDirectory()}>
                重试
              </Button>
            }
          />
        ) : directory.entries.length === 0 ? (
          <ExplorerEmptyState className="min-h-full" title="目录为空" description="当前工作区目录没有文件。" />
        ) : (
          <div className="grid gap-0.5" role="tree" aria-label="IDE 资源管理器" data-ide-explorer-tree>
            {directory.entries.map((entry) => (
              <IdeExplorerBranch
                key={entry.id}
                entry={entry}
                depth={0}
                rootId={rootId}
                rootAbsolutePath={rootAbsolutePath}
                activeNodeKey={activeNodeKey}
                expandedKeys={treeState.expandedKeys}
                selectedKeys={treeState.selectedKeys}
                onToggleDirectory={(item) => toggleExpanded(item.id)}
                onOpenFile={onOpenEntry}
                onSelect={selectEntry}
                onContextMenu={openContextMenu}
                onDropIntoDirectory={handleExplorerDrop}
                onPointerMoveEntry={moveEntryByPointer}
                onDropTargetChange={setDropTargetPath}
                currentDirectoryPath={directory.location.directoryPath}
                dropTargetPath={dropTargetPath}
              />
            ))}
          </div>
        )}
      </div>
      <ExplorerContextMenuBase
        open={contextMenu != null}
        anchorPoint={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        title={contextMenu?.entry ? contextMenu.entry.name : "当前目录"}
        items={contextItems}
        onClose={() => setContextMenu(null)}
      />

      {uploadDialog.open ? (
        <UploadManagerDialog
          open={uploadDialog.open}
          targetDirectory={uploadDialog.targetDirectory}
          files={uploadDialog.files}
          jobs={uploadJobs}
          activeUpload={activeUpload}
          conflictPolicy={uploadDialog.conflictPolicy}
          onChangeConflictPolicy={(conflictPolicy) => setUploadDialog((state) => ({ ...state, conflictPolicy }))}
          onChangeTargetDirectory={(targetDirectory) => setUploadDialog((state) => ({ ...state, targetDirectory }))}
          onChooseFiles={() => fileInputRef.current?.click()}
          onChooseFolder={() => folderInputRef.current?.click()}
          onPasteFiles={(files) => setUploadDialog((state) => ({ ...state, files: mergeUploadFiles(state.files, files) }))}
          onClear={() => {
            uploadHandleRef.current?.cancel();
            setUploadJobs([]);
            setUploadDialog((state) => ({ ...state, files: [] }));
          }}
          onRemoveFile={(index) => setUploadDialog((state) => ({
            ...state,
            files: state.files.filter((_, fileIndex) => fileIndex !== index),
          }))}
          onStart={() => void startUpload()}
          onPause={() => uploadHandleRef.current?.pause()}
          onResume={() => void uploadHandleRef.current?.resume()}
          onCancelUpload={() => uploadHandleRef.current?.cancel()}
          onOpenChange={(open) => setUploadDialog((state) => ({ ...state, open }))}
        />
      ) : null}
      {flow?.kind === "new-file" ? (
        <NameDialog
          title="新建文件"
          description={`创建位置：${flowTargetDirectory || "根目录"}`}
          confirmLabel="创建"
          placeholder="文件名（可含相对路径）"
          onCancel={() => setFlow(null)}
          onConfirm={(name) => runCreate("file", name)}
        />
      ) : null}
      {flow?.kind === "new-directory" ? (
        <NameDialog
          title="新建目录"
          description={`创建位置：${flowTargetDirectory || "根目录"}`}
          confirmLabel="创建"
          placeholder="目录名（可含相对路径）"
          onCancel={() => setFlow(null)}
          onConfirm={(name) => runCreate("directory", name)}
        />
      ) : null}
      {flow?.kind === "rename" ? (
        <NameDialog
          title="重命名"
          description={flow.entry.path}
          confirmLabel="重命名"
          initialName={flow.entry.name}
          onCancel={() => setFlow(null)}
          onConfirm={(name) => runRename(flow.entry, name)}
        />
      ) : null}
      {flow?.kind === "delete" ? (
        <DeleteDialog
          entry={flow.entry}
          openedTabs={openedForFlow}
          onCancel={() => setFlow(null)}
          onConfirm={(permanent) => runDelete(flow.entry, permanent)}
        />
      ) : null}
    </aside>
  );
}

function ExplorerToolbarIconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="grid size-7 place-items-center rounded-sm border border-transparent text-muted outline-none transition-colors hover:border-line hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] [&_svg]:size-4"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface IdeExplorerBranchProps {
  entry: ExplorerEntry;
  depth: number;
  rootId: string;
  rootAbsolutePath?: string;
  activeNodeKey: string | null;
  expandedKeys: ReadonlySet<string>;
  selectedKeys: ReadonlySet<string>;
  onToggleDirectory: (entry: ExplorerEntry) => void;
  onOpenFile: (entry: ExplorerEntry, options?: { pinned?: boolean }) => void;
  onSelect: (entry: ExplorerEntry) => void;
  onContextMenu: (entry: ExplorerEntry, point: { x: number; y: number }) => void;
  onDropIntoDirectory: (event: React.DragEvent<HTMLElement>, directoryPath?: string) => void;
  onPointerMoveEntry: (entry: ExplorerEntry, directoryPath: string, copy: boolean) => void;
  onDropTargetChange: (directoryPath: string | null) => void;
  currentDirectoryPath: string;
  dropTargetPath: string | null;
}

function IdeExplorerBranch({
  entry,
  depth,
  rootId,
  rootAbsolutePath,
  activeNodeKey,
  expandedKeys,
  selectedKeys,
  onToggleDirectory,
  onOpenFile,
  onSelect,
  onContextMenu,
  onDropIntoDirectory,
  onPointerMoveEntry,
  onDropTargetChange,
  currentDirectoryPath,
  dropTargetPath,
}: IdeExplorerBranchProps) {
  const expanded = expandedKeys.has(entry.id);
  const children = useExplorerDirectory({
    rootId,
    directoryPath: entry.path,
    enabled: entry.kind === "directory" && expanded,
  });
  const suppressClickRef = React.useRef(false);
  const clickOpenTimerRef = React.useRef<number | null>(null);
  const [pointerDragPreview, setPointerDragPreview] = React.useState<{ x: number; y: number; label: string; kind: ExplorerEntry["kind"]; width: number; active: boolean } | null>(null);

  React.useEffect(() => () => {
    if (clickOpenTimerRef.current != null) window.clearTimeout(clickOpenTimerRef.current);
  }, []);

  const clearPendingClickOpen = React.useCallback(() => {
    if (clickOpenTimerRef.current == null) return;
    window.clearTimeout(clickOpenTimerRef.current);
    clickOpenTimerRef.current = null;
  }, []);

  const beginPointerDrag = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    const rowRect = event.currentTarget.getBoundingClientRect();
    setPointerDragPreview({ x: event.clientX, y: event.clientY, label: entry.name, kind: entry.kind, width: rowRect.width, active: false });
    let destination = entry.kind === "directory" ? entry.path : explorerDirname(entry.path);
    const updateDestination = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY);
      const node = element?.closest<HTMLElement>("[data-ide-explorer-node-path]");
      if (node) {
        const path = node.dataset.ideExplorerNodePath || "";
        const kind = node.dataset.ideExplorerNodeKind;
        destination = kind === "directory" ? path : explorerDirname(path);
      } else if (element?.closest("[data-ide-explorer-scroll]")) {
        destination = currentDirectoryPath;
      }
      onDropTargetChange(normalizeExplorerPath(destination));
    };
    const handleMove = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (distance < 5 && !started) return;
      if (!started) {
        document.body.style.cursor = "grabbing";
      }
      started = true;
      suppressClickRef.current = true;
      moveEvent.preventDefault();
      setPointerDragPreview((current) => ({
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        label: current?.label ?? entry.name,
        kind: current?.kind ?? entry.kind,
        width: current?.width ?? 220,
        active: true,
      }));
      updateDestination(moveEvent.clientX, moveEvent.clientY);
    };
    const clearDrag = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      document.body.style.cursor = "";
      setPointerDragPreview(null);
      onDropTargetChange(null);
    };
    const handleCancel = () => {
      clearDrag();
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    };
    const handleUp = (upEvent: PointerEvent) => {
      clearDrag();
      if (!started) return;
      upEvent.preventDefault();
      const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      if (element?.closest("[data-ide-terminal-panel], [data-ide-terminal-xterm], .xterm")) {
        dispatchTerminalInsertPath(shellQuotePath(joinAbsolutePath(rootAbsolutePath, entry.path)));
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        return;
      }
      onPointerMoveEntry(entry, destination, upEvent.ctrlKey || upEvent.altKey);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, { once: true, passive: false });
    window.addEventListener("pointercancel", handleCancel, { once: true });
  }, [currentDirectoryPath, entry, onDropTargetChange, onPointerMoveEntry, rootAbsolutePath]);

  return (
    <React.Fragment>
      <ExplorerTreeNode
        item={entry as ExplorerTreeItem}
        depth={depth}
        expanded={expanded}
        selected={selectedKeys.has(entry.id)}
        active={entry.id === activeNodeKey}
        minTouchTarget
        renderActions={() => (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-sm text-subtle hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]"
            aria-label={`打开 ${entry.name} 操作菜单`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onContextMenu(entry, { x: rect.right - 8, y: rect.bottom + 4 });
            }}
            data-ide-explorer-node-menu
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
        onToggle={(item) => onToggleDirectory(item)}
        onOpen={(item) => {
          clearPendingClickOpen();
          onOpenFile(item, { pinned: true });
        }}
        onSelect={(item, event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onSelect(item);
          if (item.kind !== "file") return;
          clearPendingClickOpen();
          if ("detail" in event) {
            clickOpenTimerRef.current = window.setTimeout(() => {
              clickOpenTimerRef.current = null;
              onOpenFile(item, { pinned: false });
            }, 180);
            return;
          }
          onOpenFile(item, { pinned: false });
        }}
        onNodeContextMenu={(item, event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(item);
          onContextMenu(item, { x: event.clientX, y: event.clientY });
        }}
        className={cn(
          "cursor-grab active:cursor-grabbing",
          pointerDragPreview?.active && "cursor-grabbing border-primary-line bg-primary-soft/80 opacity-45 shadow-[0_0_0_1px_var(--primary)]",
          entry.kind === "directory" &&
            dropTargetPath === entry.path &&
            "border-primary-line bg-primary-soft ring-2 ring-primary/30 shadow-[inset_3px_0_0_var(--primary)]",
        )}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          beginPointerDrag(event);
        }}
        draggable={false}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = event.ctrlKey || event.altKey ? "copy" : "move";
          onDropTargetChange(entry.kind === "directory" ? entry.path : explorerDirname(entry.path));
        }}
        onDrop={(event) => {
          onDropIntoDirectory(event, entry.kind === "directory" ? entry.path : explorerDirname(entry.path));
        }}
        data-ide-explorer-node={entry.id}
        data-ide-explorer-node-path={entry.path}
        data-ide-explorer-node-kind={entry.kind}
        data-ide-explorer-active={entry.id === activeNodeKey ? "true" : "false"}
      />
      {pointerDragPreview?.active ? (
        <DragFloatingPreview
          x={pointerDragPreview.x}
          y={pointerDragPreview.y}
          width={Math.min(Math.max(pointerDragPreview.width, 180), 260)}
          icon={pointerDragPreview.kind === "directory" ? <FolderIcon className="size-3.5" /> : <FileIcon className="size-3.5" />}
          title={pointerDragPreview.label}
          subtitle="拖到目录移动 · Ctrl/Alt 复制"
          badge={pointerDragPreview.kind === "directory" ? "目录" : "文件"}
          dataAttributes={{ "data-ide-explorer-drag-preview": "true" }}
          data-testid="ide-explorer-drag-preview"
        />
      ) : null}
      {expanded && entry.kind === "directory" ? (
        <div role="group" className="grid gap-0.5">
          {children.isLoading ? (
            <div className="px-8 py-1.5 text-xs text-muted">读取目录中…</div>
          ) : children.isError ? (
            <button
              type="button"
              className="mx-8 my-1 rounded-sm border border-line bg-panel-2 px-2 py-1 text-left text-xs text-red hover:bg-red-soft focus-visible:shadow-[var(--ring)]"
              onClick={() => void children.refresh()}
            >
              子目录读取失败，点击重试
            </button>
          ) : children.entries.length === 0 ? (
            <div className="px-8 py-1.5 text-xs text-subtle">空目录</div>
          ) : (
            children.entries.map((child) => (
              <IdeExplorerBranch
                key={child.id}
                entry={child}
                depth={depth + 1}
                rootId={rootId}
                rootAbsolutePath={rootAbsolutePath}
                activeNodeKey={activeNodeKey}
                expandedKeys={expandedKeys}
                selectedKeys={selectedKeys}
                onToggleDirectory={onToggleDirectory}
                onOpenFile={onOpenFile}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onDropIntoDirectory={onDropIntoDirectory}
                onPointerMoveEntry={onPointerMoveEntry}
                onDropTargetChange={onDropTargetChange}
                currentDirectoryPath={currentDirectoryPath}
                dropTargetPath={dropTargetPath}
              />
            ))
          )}
        </div>
      ) : null}
    </React.Fragment>
  );
}

function NameDialog({
  title,
  description,
  confirmLabel,
  placeholder,
  initialName = "",
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  placeholder?: string;
  initialName?: string;
  onCancel: () => void;
  onConfirm: (name: string) => Promise<void> | void;
}) {
  const [value, setValue] = React.useState(initialName);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  async function submit() {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onConfirm(name);
    } catch {
      // useExplorerCommands/fileOperations already surface toasts.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-ide-explorer-name-dialog>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            data-ide-explorer-name-input
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  entry,
  openedTabs,
  onCancel,
  onConfirm,
}: {
  entry: ExplorerEntry;
  openedTabs: readonly IdeExplorerOpenTabRef[];
  onCancel: () => void;
  onConfirm: (permanent: boolean) => Promise<void> | void;
}) {
  const [confirmText, setConfirmText] = React.useState("");
  const [permanent, setPermanent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const dirtyCount = openedTabs.filter((tab) => tab.dirty).length;
  async function submit() {
    if (confirmText !== "DELETE" || busy) return;
    setBusy(true);
    try {
      await onConfirm(permanent);
    } catch {
      // useExplorerCommands/fileOperations already surface toasts.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-ide-explorer-delete-dialog>
        <DialogHeader>
          <DialogTitle>删除项目</DialogTitle>
          <DialogDescription>{entry.path}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3 text-sm">
          <div className="rounded border border-red/20 bg-red-soft p-3 text-red">
            <div className="font-semibold">危险操作</div>
            <div className="mt-1 text-xs">默认移入回收站；勾选永久删除才会直接从文件系统移除。</div>
          </div>
          {openedTabs.length ? (
            <div className="rounded border border-amber/30 bg-amber-soft p-3 text-xs text-amber" data-ide-explorer-open-tab-delete-warning>
              此项目命中 {openedTabs.length} 个已打开 placeholder tab，其中 {dirtyCount} 个标记 dirty。删除后 tab 不会静默关闭，只会标记为 deleted。
            </div>
          ) : null}
          <label className="grid gap-1 text-xs text-muted">
            输入 DELETE 确认删除
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              data-ide-explorer-delete-confirm-input
            />
          </label>
          <label className="flex items-start gap-2 rounded border border-line bg-panel-2 p-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => setPermanent(event.target.checked)}
              className="mt-0.5 size-3 accent-red"
              data-ide-explorer-delete-permanent
            />
            <span><strong className="text-red">永久删除</strong>：跳过回收站。</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="danger" onClick={() => void submit()} disabled={busy || confirmText !== "DELETE"}>
            {busy ? "处理中…" : permanent ? "永久删除" : "移入回收站"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function shouldHandleExplorerShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], .xterm');
}

function shouldHandleExplorerGlobalShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  // Explorer is the active surface after pointer-down in the sidebar. xterm keeps
  // its hidden textarea focused, so global Explorer shortcuts must still win
  // over xterm while avoiding dialogs/menus and normal form controls.
  if (target.closest('[role="dialog"], [role="menu"], [contenteditable="true"]')) return false;
  if (target.closest('.xterm')) return true;
  return !target.closest('input, textarea, select');
}

function pathTouchesTarget(targetPath: string, targetKind: FileEntrySummary["kind"], candidatePath: string): boolean {
  const target = normalizeExplorerPath(targetPath);
  const candidate = normalizeExplorerPath(candidatePath);
  if (targetKind === "directory") return candidate === target || candidate.startsWith(`${target}/`);
  return candidate === target;
}

function joinAbsolutePath(rootAbsolutePath: string | undefined, relativePath: string): string {
  if (!rootAbsolutePath) return normalizeExplorerPath(relativePath);
  const root = rootAbsolutePath.replace(/[\\/]+$/, "");
  const child = normalizeExplorerPath(relativePath);
  return child ? `${root}/${child}` : root;
}

function dispatchTerminalInsertPath(path: string): void {
  window.dispatchEvent(new CustomEvent(TERMINAL_INSERT_EVENT, { detail: { text: `${shellQuotePath(path)} ` } }));
  toast.success("已发送路径到活动终端", { description: path });
}

function shellQuotePath(path: string): string {
  if (!path) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, `'\''`)}'`;
}

async function copyExplorerPath(text: string, mode: "relative" | "absolute"): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (!document.execCommand("copy")) throw new Error("浏览器拒绝访问剪贴板");
      } finally {
        textarea.remove();
      }
    }
    toast.success(mode === "relative" ? "已复制相对路径" : "已复制绝对路径", { description: text });
  } catch (error) {
    toast.error("复制路径失败", { description: error instanceof Error ? error.message : String(error) });
  }
}
