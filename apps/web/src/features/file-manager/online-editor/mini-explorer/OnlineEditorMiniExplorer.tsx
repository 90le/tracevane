import {
  Copy,
  ExternalLink,
  FilePlus2,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
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
import type { FileEntrySummary } from "@/features/file-manager/file-tools/types";
import {
  explorerDirname,
  explorerNodeKey,
  explorerParentPath,
  joinExplorerPath,
  normalizeExplorerPath,
  useExplorerCommands,
  useExplorerDirectory,
  useExplorerTreeState,
} from "@/shared/explorer-core";
import type { ExplorerEntry, ExplorerLocation } from "@/shared/explorer-core";
import {
  ExplorerContextMenuBase,
  ExplorerEmptyState,
  ExplorerErrorState,
  ExplorerLoadingState,
  ExplorerTreeNode,
} from "@/shared/explorer-ui";
import type { ExplorerContextMenuItem, ExplorerTreeItem } from "@/shared/explorer-ui";
import { MiniExplorerToolbar } from "./MiniExplorerToolbar";

export type OnlineEditorMiniExplorerPathEvent =
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

export interface OnlineEditorMiniExplorerOpenTabRef {
  rootId: string;
  path: string;
  dirty: boolean;
  deleted?: boolean;
}

export interface OnlineEditorMiniExplorerProps {
  id?: string;
  rootId: string;
  initialDirectoryPath: string;
  activeRootId: string;
  activePath: string;
  rootAbsolutePath?: string;
  openTabs?: readonly OnlineEditorMiniExplorerOpenTabRef[];
  onOpenFile: (entry: FileEntrySummary, rootId: string) => void;
  onPathEvent?: (event: OnlineEditorMiniExplorerPathEvent) => void;
  onClose: () => void;
  className?: string;
}

type MiniExplorerFlow =
  | { kind: "new-file"; directoryPath: string }
  | { kind: "new-directory"; directoryPath: string }
  | { kind: "rename"; entry: ExplorerEntry }
  | { kind: "copy"; entry: ExplorerEntry }
  | { kind: "move"; entry: ExplorerEntry }
  | { kind: "delete"; entry: ExplorerEntry }
  | null;

interface ContextMenuState {
  entry: ExplorerEntry | null;
  x: number;
  y: number;
}

export function OnlineEditorMiniExplorer({
  id,
  rootId,
  initialDirectoryPath,
  activeRootId,
  activePath,
  rootAbsolutePath,
  openTabs = [],
  onOpenFile,
  onPathEvent,
  onClose,
  className,
}: OnlineEditorMiniExplorerProps) {
  const [directoryPath, setDirectoryPath] = React.useState(() =>
    normalizeExplorerPath(initialDirectoryPath),
  );
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [flow, setFlow] = React.useState<MiniExplorerFlow>(null);
  const treeState = useExplorerTreeState();
  const { revealPath, select, toggleExpanded } = treeState;
  const directory = useExplorerDirectory({ rootId, directoryPath });
  const commands = useExplorerCommands();
  const activeNodeKey = React.useMemo(
    () =>
      activeRootId === rootId
        ? explorerNodeKey({ rootId, path: normalizeExplorerPath(activePath) })
        : null,
    [activePath, activeRootId, rootId],
  );

  React.useEffect(() => {
    if (activeRootId !== rootId) return;
    revealPath({ rootId, directoryPath: explorerDirname(activePath) });
  }, [activePath, activeRootId, revealPath, rootId]);

  const refreshDirectory = React.useCallback(async () => {
    await directory.refresh();
  }, [directory]);

  const openFile = React.useCallback(
    (entry: ExplorerEntry) => {
      onOpenFile(entry, rootId);
    },
    [onOpenFile, rootId],
  );

  const toggleDirectory = React.useCallback(
    (entry: ExplorerEntry) => {
      toggleExpanded(entry.id);
    },
    [toggleExpanded],
  );

  const openContextMenu = React.useCallback((entry: ExplorerEntry | null, point: { x: number; y: number }) => {
    setContextMenu({ entry, x: point.x, y: point.y });
  }, []);

  const contextItems = React.useMemo<ExplorerContextMenuItem[]>(() => {
    const entry = contextMenu?.entry ?? null;
    const items: ExplorerContextMenuItem[] = [
      {
        id: "new-file",
        label: entry?.kind === "directory" ? "在此目录新建文件" : "新建文件",
        icon: <FilePlus2 />,
        onSelect: () => setFlow({ kind: "new-file", directoryPath: entry?.kind === "directory" ? entry.path : directory.location.directoryPath }),
      },
      {
        id: "new-directory",
        label: entry?.kind === "directory" ? "在此目录新建目录" : "新建目录",
        icon: <FolderPlus />,
        onSelect: () => setFlow({ kind: "new-directory", directoryPath: entry?.kind === "directory" ? entry.path : directory.location.directoryPath }),
      },
    ];
    if (entry?.kind === "directory") {
      items.push({
        id: "enter-directory",
        label: "进入目录",
        icon: <ExternalLink />,
        separatorBefore: true,
        onSelect: () => setDirectoryPath(entry.path),
      });
    }
    if (entry) {
      items.push(
        {
          id: "rename",
          label: "重命名",
          icon: <Pencil />,
          separatorBefore: entry.kind !== "directory",
          onSelect: () => setFlow({ kind: "rename", entry }),
        },
        {
          id: "copy",
          label: "复制到…",
          icon: <Copy />,
          onSelect: () => setFlow({ kind: "copy", entry }),
        },
        {
          id: "move",
          label: "移动到…",
          icon: <FolderInput />,
          onSelect: () => setFlow({ kind: "move", entry }),
        },
        {
          id: "copy-relative-path",
          label: "复制相对路径",
          icon: <Copy />,
          separatorBefore: true,
          onSelect: () => void copyExplorerPath(entry.path, "relative"),
        },
        {
          id: "copy-absolute-path",
          label: "复制绝对路径",
          icon: <Copy />,
          onSelect: () => void copyExplorerPath(joinAbsolutePath(rootAbsolutePath, entry.path), "absolute"),
        },
        {
          id: "delete",
          label: "删除…",
          icon: <Trash2 />,
          danger: true,
          separatorBefore: true,
          onSelect: () => setFlow({ kind: "delete", entry }),
        },
      );
    }
    return items;
  }, [contextMenu?.entry, directory.location.directoryPath, rootAbsolutePath]);

  const flowTargetDirectory = React.useMemo(() => {
    if (flow?.kind === "new-file" || flow?.kind === "new-directory") return flow.directoryPath;
    const entry = contextMenu?.entry;
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
      const target = {
        destinationRootId: rootId,
        destinationDirectoryPath: normalizeExplorerPath(destinationDirectoryPath),
        nextName: nextName?.trim() || undefined,
        overwrite: false,
      };
      const result = operation === "copy"
        ? await commands.copy({ rootId, path: entry.path }, target)
        : await commands.move({ rootId, path: entry.path }, target);
      if (operation === "move") {
        const fallback = joinExplorerPath(target.destinationDirectoryPath, target.nextName ?? entry.name);
        const newPath = normalizeExplorerPath(result.affectedPaths[1] ?? fallback);
        onPathEvent?.({ type: "moved", rootId, oldPath: entry.path, newPath, targetKind: entry.kind });
      }
      await refreshDirectory();
      setFlow(null);
    },
    [commands, onPathEvent, refreshDirectory, rootId],
  );

  const runDelete = React.useCallback(
    async (entry: ExplorerEntry, permanent: boolean) => {
      await commands.remove({ rootId, paths: [entry.path], permanent });
      onPathEvent?.({ type: "deleted", rootId, path: entry.path, targetKind: entry.kind });
      await refreshDirectory();
      setFlow(null);
    },
    [commands, onPathEvent, refreshDirectory, rootId],
  );

  return (
    <section
      id={id}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-r border-line bg-panel text-ink shadow-lg lg:shadow-none",
        className,
      )}
      aria-label="在线编辑器文件列表"
      data-online-editor-mini-explorer
      onContextMenu={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-explorer-node-key]")) return;
        event.preventDefault();
        openContextMenu(null, { x: event.clientX, y: event.clientY });
      }}
    >
      <MiniExplorerToolbar
        directoryPath={directory.location.directoryPath}
        parentPath={directory.parentPath}
        loading={directory.isFetching}
        onGoParent={() => {
          const parent = explorerParentPath(directory.location.directoryPath);
          if (parent != null) setDirectoryPath(parent);
        }}
        onRefresh={() => void refreshDirectory()}
        onCreateFile={() => {
          setContextMenu(null);
          setFlow({ kind: "new-file", directoryPath: directory.location.directoryPath });
        }}
        onCreateDirectory={() => {
          setContextMenu(null);
          setFlow({ kind: "new-directory", directoryPath: directory.location.directoryPath });
        }}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-auto p-2" role="tree" aria-label="在线编辑器文件树">
        {directory.isLoading ? (
          <ExplorerLoadingState className="min-h-full" />
        ) : directory.isError ? (
          <ExplorerErrorState
            className="min-h-full"
            description={directory.error?.message ?? "请刷新后重试，或检查当前路径是否仍然可访问。"}
            action={
              <button
                type="button"
                className="rounded-sm border border-line bg-panel px-2.5 py-1.5 text-sm text-ink hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
                onClick={() => void refreshDirectory()}
              >
                重新读取
              </button>
            }
          />
        ) : directory.entries.length === 0 ? (
          <ExplorerEmptyState className="min-h-full" />
        ) : (
          <div className="grid gap-0.5" data-online-editor-mini-explorer-tree>
            {directory.entries.map((entry) => (
              <MiniExplorerBranch
                key={entry.id}
                entry={entry}
                depth={0}
                rootId={rootId}
                activeNodeKey={activeNodeKey}
                expandedKeys={treeState.expandedKeys}
                selectedKeys={treeState.selectedKeys}
                onToggleDirectory={toggleDirectory}
                onOpenFile={openFile}
                onSelect={(item) => select(item.id)}
                onContextMenu={openContextMenu}
              />
            ))}
          </div>
        )}
      </div>
      <ExplorerContextMenuBase
        open={contextMenu != null}
        anchorPoint={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        title={contextMenu?.entry?.path ?? "当前目录"}
        items={contextItems}
        onClose={() => setContextMenu(null)}
      />
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
      {flow?.kind === "copy" || flow?.kind === "move" ? (
        <TransferDialog
          operation={flow.kind}
          entry={flow.entry}
          currentDirectoryPath={directory.location.directoryPath}
          onCancel={() => setFlow(null)}
          onConfirm={(payload) => runTransfer(flow.entry, flow.kind, payload.destinationDirectoryPath, payload.nextName)}
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
    </section>
  );
}

interface MiniExplorerBranchProps {
  entry: ExplorerEntry;
  depth: number;
  rootId: string;
  activeNodeKey: string | null;
  expandedKeys: ReadonlySet<string>;
  selectedKeys: ReadonlySet<string>;
  onToggleDirectory: (entry: ExplorerEntry) => void;
  onOpenFile: (entry: ExplorerEntry) => void;
  onSelect: (entry: ExplorerEntry) => void;
  onContextMenu: (entry: ExplorerEntry, point: { x: number; y: number }) => void;
}

function MiniExplorerBranch({
  entry,
  depth,
  rootId,
  activeNodeKey,
  expandedKeys,
  selectedKeys,
  onToggleDirectory,
  onOpenFile,
  onSelect,
  onContextMenu,
}: MiniExplorerBranchProps) {
  const expanded = expandedKeys.has(entry.id);
  const children = useExplorerDirectory({
    rootId,
    directoryPath: entry.path,
    enabled: entry.kind === "directory" && expanded,
  });

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
            data-online-editor-mini-explorer-node-menu
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
        onToggle={(item) => onToggleDirectory(item)}
        onOpen={(item) => onOpenFile(item)}
        onSelect={(item) => {
          onSelect(item);
          if (item.kind === "file") onOpenFile(item);
        }}
        onNodeContextMenu={(item, event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(item);
          onContextMenu(item, { x: event.clientX, y: event.clientY });
        }}
        data-online-editor-mini-explorer-node={entry.id}
        data-online-editor-mini-explorer-active={entry.id === activeNodeKey ? "true" : "false"}
      />
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
              <MiniExplorerBranch
                key={child.id}
                entry={child}
                depth={depth + 1}
                rootId={rootId}
                activeNodeKey={activeNodeKey}
                expandedKeys={expandedKeys}
                selectedKeys={selectedKeys}
                onToggleDirectory={onToggleDirectory}
                onOpenFile={onOpenFile}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
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
      // fileOperations/useExplorerCommands already surface toasts.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-online-editor-mini-explorer-name-dialog>
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
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            data-online-editor-mini-explorer-name-input
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

function TransferDialog({
  operation,
  entry,
  currentDirectoryPath,
  onCancel,
  onConfirm,
}: {
  operation: "copy" | "move";
  entry: ExplorerEntry;
  currentDirectoryPath: string;
  onCancel: () => void;
  onConfirm: (payload: { destinationDirectoryPath: string; nextName?: string }) => Promise<void> | void;
}) {
  const [destinationDirectoryPath, setDestinationDirectoryPath] = React.useState(currentDirectoryPath);
  const [nextName, setNextName] = React.useState(entry.name);
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm({
        destinationDirectoryPath: normalizeExplorerPath(destinationDirectoryPath),
        nextName: nextName.trim() && nextName.trim() !== entry.name ? nextName.trim() : undefined,
      });
    } catch {
      // fileOperations/useExplorerCommands already surface toasts.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-online-editor-mini-explorer-transfer-dialog>
        <DialogHeader>
          <DialogTitle>{operation === "copy" ? "复制到…" : "移动到…"}</DialogTitle>
          <DialogDescription>{entry.path}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <label className="grid gap-1 text-xs text-muted">
            目标目录（相对当前 root，留空为根目录）
            <Input
              value={destinationDirectoryPath}
              onChange={(event) => setDestinationDirectoryPath(event.target.value)}
              placeholder="例如 src/components"
              data-online-editor-mini-explorer-transfer-destination
            />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            新名称（可选）
            <Input
              value={nextName}
              onChange={(event) => setNextName(event.target.value)}
              placeholder={entry.name}
              data-online-editor-mini-explorer-transfer-name
            />
          </label>
          <p className="rounded border border-line bg-panel-2 px-2 py-1.5 text-xs text-subtle">
            同名冲突不会静默覆盖；如目标已存在，本次操作会失败并保留原文件。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !nextName.trim()}>
            {busy ? "处理中…" : operation === "copy" ? "复制" : "移动"}
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
  openedTabs: readonly OnlineEditorMiniExplorerOpenTabRef[];
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
      // fileOperations/useExplorerCommands already surface toasts.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-online-editor-mini-explorer-delete-dialog>
        <DialogHeader>
          <DialogTitle>删除项目</DialogTitle>
          <DialogDescription>{entry.path}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3 text-sm">
          <div className="rounded border border-red/20 bg-red-soft p-3 text-red">
            <div className="font-semibold">危险操作</div>
            <div className="mt-1 text-xs">
              默认移入回收站；勾选永久删除才会直接从文件系统移除。
            </div>
          </div>
          {openedTabs.length ? (
            <div className="rounded border border-amber/30 bg-amber-soft p-3 text-xs text-amber" data-online-editor-mini-explorer-open-tab-delete-warning>
              此项目命中 {openedTabs.length} 个已打开标签，其中 {dirtyCount} 个存在未保存修改。删除后标签不会静默关闭；dirty 内容会保留，并标记为文件已删除。
            </div>
          ) : null}
          <label className="grid gap-1 text-xs text-muted">
            输入 DELETE 确认删除
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              data-online-editor-mini-explorer-delete-confirm-input
            />
          </label>
          <label className="flex items-start gap-2 rounded border border-line bg-panel-2 p-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => setPermanent(event.target.checked)}
              className="mt-0.5 size-3 accent-red"
              data-online-editor-mini-explorer-delete-permanent
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

export function directoryForOnlineEditorPath(path: string): ExplorerLocation["directoryPath"] {
  return explorerDirname(path);
}
