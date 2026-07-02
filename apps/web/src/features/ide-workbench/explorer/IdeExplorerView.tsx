import {
  Copy,
  ExternalLink,
  FilePlus2,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  ListCollapse,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import * as React from "react";

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
import type { ExplorerEntry } from "@/shared/explorer-core";
import {
  ExplorerContextMenuBase,
  ExplorerEmptyState,
  ExplorerErrorState,
  ExplorerLoadingState,
  ExplorerTreeNode,
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
  onOpenEntry: (entry: ExplorerEntry) => void;
  onPathEvent?: (event: IdeExplorerPathEvent) => void;
}

type IdeExplorerFlow =
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
    if (!activePath || activeRootId !== rootId) return;
    revealPath({ rootId, directoryPath: explorerDirname(activePath) });
  }, [activePath, activeRootId, revealPath, rootId]);

  const refreshDirectory = React.useCallback(async () => {
    await directory.refresh();
  }, [directory]);

  const openContextMenu = React.useCallback((entry: ExplorerEntry | null, point: { x: number; y: number }) => {
    setContextMenu({ entry, x: point.x, y: point.y });
  }, []);

  const contextItems = React.useMemo<ExplorerContextMenuItem[]>(() => {
    const entry = contextMenu?.entry ?? null;
    const targetDirectory = entry?.kind === "directory" ? entry.path : directory.location.directoryPath;
    const items: ExplorerContextMenuItem[] = [
      {
        id: "new-file",
        label: entry?.kind === "directory" ? "在此目录新建文件" : "新建文件",
        icon: <FilePlus2 />,
        onSelect: () => setFlow({ kind: "new-file", directoryPath: targetDirectory }),
      },
      {
        id: "new-directory",
        label: entry?.kind === "directory" ? "在此目录新建目录" : "新建目录",
        icon: <FolderPlus />,
        onSelect: () => setFlow({ kind: "new-directory", directoryPath: targetDirectory }),
      },
    ];
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
  }, [contextMenu?.entry, directory.location.directoryPath, onDirectoryPathChange, rootAbsolutePath]);

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

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;

  return (
    <aside
      className="group/ide-explorer grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-line bg-panel"
      data-ide-sidebar
      data-ide-explorer
      onContextMenu={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-explorer-node-key]")) return;
        event.preventDefault();
        openContextMenu(null, { x: event.clientX, y: event.clientY });
      }}
    >
      <div className="relative border-b border-line bg-panel px-2.5 py-2" data-ide-explorer-toolbar>
        <div className="min-w-0 pr-32">
          <div className="truncate text-sm font-semibold text-ink-strong">资源管理器</div>
          <div className="truncate text-xs text-subtle">{rootLabel || "Workspace Explorer"}</div>
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-panel/95 opacity-0 shadow-sm transition-opacity group-hover/ide-explorer:opacity-100 group-focus-within/ide-explorer:opacity-100">
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
                activeNodeKey={activeNodeKey}
                expandedKeys={treeState.expandedKeys}
                selectedKeys={treeState.selectedKeys}
                onToggleDirectory={(item) => toggleExpanded(item.id)}
                onOpenFile={onOpenEntry}
                onSelect={(item) => select(item.id)}
                onContextMenu={openContextMenu}
              />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-line p-2 text-xs text-subtle">
        M4：IDE Explorer shell；文件操作复用 explorer-core / fileOperations；真实编辑器内容后置。
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
    </aside>
  );
}

function ExplorerToolbarIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="grid size-7 place-items-center rounded-sm border border-transparent text-muted outline-none transition-colors hover:border-line hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] [&_svg]:size-4"
      aria-label={label}
      title={label}
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
  activeNodeKey: string | null;
  expandedKeys: ReadonlySet<string>;
  selectedKeys: ReadonlySet<string>;
  onToggleDirectory: (entry: ExplorerEntry) => void;
  onOpenFile: (entry: ExplorerEntry) => void;
  onSelect: (entry: ExplorerEntry) => void;
  onContextMenu: (entry: ExplorerEntry, point: { x: number; y: number }) => void;
}

function IdeExplorerBranch({
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
}: IdeExplorerBranchProps) {
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
            data-ide-explorer-node-menu
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
        data-ide-explorer-node={entry.id}
        data-ide-explorer-node-path={entry.path}
        data-ide-explorer-node-kind={entry.kind}
        data-ide-explorer-active={entry.id === activeNodeKey ? "true" : "false"}
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
              <IdeExplorerBranch
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
      // useExplorerCommands/fileOperations already surface toasts.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent data-ide-explorer-transfer-dialog>
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
              data-ide-explorer-transfer-destination
            />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            新名称（可选）
            <Input
              value={nextName}
              onChange={(event) => setNextName(event.target.value)}
              placeholder={entry.name}
              data-ide-explorer-transfer-name
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
