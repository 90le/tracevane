import * as React from "react";

import { cn } from "@/design/lib/utils";
import type { FileEntrySummary } from "@/features/file-manager/file-tools/types";
import {
  explorerDirname,
  explorerNodeKey,
  explorerParentPath,
  normalizeExplorerPath,
  useExplorerDirectory,
  useExplorerTreeState,
} from "@/shared/explorer-core";
import type { ExplorerEntry, ExplorerLocation } from "@/shared/explorer-core";
import {
  ExplorerEmptyState,
  ExplorerErrorState,
  ExplorerLoadingState,
  ExplorerTreeNode,
} from "@/shared/explorer-ui";
import type { ExplorerTreeItem } from "@/shared/explorer-ui";
import { MiniExplorerToolbar } from "./MiniExplorerToolbar";

export interface OnlineEditorMiniExplorerProps {
  id?: string;
  rootId: string;
  initialDirectoryPath: string;
  activeRootId: string;
  activePath: string;
  onOpenFile: (entry: FileEntrySummary, rootId: string) => void;
  onClose: () => void;
  className?: string;
}

export function OnlineEditorMiniExplorer({
  id,
  rootId,
  initialDirectoryPath,
  activeRootId,
  activePath,
  onOpenFile,
  onClose,
  className,
}: OnlineEditorMiniExplorerProps) {
  const [directoryPath, setDirectoryPath] = React.useState(() =>
    normalizeExplorerPath(initialDirectoryPath),
  );
  const treeState = useExplorerTreeState();
  const { revealPath, select, toggleExpanded } = treeState;
  const directory = useExplorerDirectory({ rootId, directoryPath });
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

  return (
    <section
      id={id}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-r border-line bg-panel text-ink shadow-lg lg:shadow-none",
        className,
      )}
      aria-label="在线编辑器文件列表"
      data-online-editor-mini-explorer
    >
      <MiniExplorerToolbar
        directoryPath={directory.location.directoryPath}
        parentPath={directory.parentPath}
        loading={directory.isFetching}
        onGoParent={() => {
          const parent = explorerParentPath(directory.location.directoryPath);
          if (parent != null) setDirectoryPath(parent);
        }}
        onRefresh={() => void directory.refresh()}
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
                onClick={() => void directory.refresh()}
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
              />
            ))}
          </div>
        )}
      </div>
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
        onToggle={(item) => onToggleDirectory(item)}
        onOpen={(item) => onOpenFile(item)}
        onSelect={(item) => {
          onSelect(item);
          if (item.kind === "file") onOpenFile(item);
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
              />
            ))
          )}
        </div>
      ) : null}
    </React.Fragment>
  );
}

export function directoryForOnlineEditorPath(path: string): ExplorerLocation["directoryPath"] {
  return explorerDirname(path);
}
