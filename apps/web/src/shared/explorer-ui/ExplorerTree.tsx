import * as React from "react";

import { cn } from "@/design/lib/utils";
import type { ExplorerNodeKey } from "@/shared/explorer-core";
import { ExplorerTreeNode } from "./ExplorerTreeNode";
import type { ExplorerTreeItem, ExplorerTreeNodeRenderState } from "./ExplorerTreeNode";

export interface ExplorerTreeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect" | "onToggle"> {
  entries: readonly ExplorerTreeItem[];
  expandedKeys?: ReadonlySet<ExplorerNodeKey>;
  selectedKeys?: ReadonlySet<ExplorerNodeKey>;
  activeKey?: ExplorerNodeKey | null;
  disabledKeys?: ReadonlySet<ExplorerNodeKey>;
  minTouchTarget?: boolean;
  treeLabel?: string;
  emptyState?: React.ReactNode;
  renderActions?: (state: ExplorerTreeNodeRenderState) => React.ReactNode;
  onToggle?: (item: ExplorerTreeItem) => void;
  onOpen?: (item: ExplorerTreeItem) => void;
  onSelect?: (item: ExplorerTreeItem, event: React.MouseEvent | React.KeyboardEvent) => void;
  onNodeContextMenu?: (item: ExplorerTreeItem, event: React.MouseEvent) => void;
}

export function ExplorerTree({
  entries,
  expandedKeys,
  selectedKeys,
  activeKey = null,
  disabledKeys,
  minTouchTarget = true,
  treeLabel = "文件树",
  emptyState,
  renderActions,
  onToggle,
  onOpen,
  onSelect,
  onNodeContextMenu,
  className,
  ...props
}: ExplorerTreeProps) {
  if (entries.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      role="tree"
      aria-label={treeLabel}
      className={cn(
        "min-h-0 overflow-auto rounded-md border border-line bg-panel p-1 text-ink",
        className,
      )}
      {...props}
    >
      {entries.map((item) => (
        <ExplorerTreeBranch
          key={item.id}
          item={item}
          depth={0}
          expandedKeys={expandedKeys}
          selectedKeys={selectedKeys}
          activeKey={activeKey}
          disabledKeys={disabledKeys}
          minTouchTarget={minTouchTarget}
          renderActions={renderActions}
          onToggle={onToggle}
          onOpen={onOpen}
          onSelect={onSelect}
          onNodeContextMenu={onNodeContextMenu}
        />
      ))}
    </div>
  );
}

interface ExplorerTreeBranchProps {
  item: ExplorerTreeItem;
  depth: number;
  expandedKeys?: ReadonlySet<ExplorerNodeKey>;
  selectedKeys?: ReadonlySet<ExplorerNodeKey>;
  activeKey?: ExplorerNodeKey | null;
  disabledKeys?: ReadonlySet<ExplorerNodeKey>;
  minTouchTarget: boolean;
  renderActions?: (state: ExplorerTreeNodeRenderState) => React.ReactNode;
  onToggle?: (item: ExplorerTreeItem) => void;
  onOpen?: (item: ExplorerTreeItem) => void;
  onSelect?: (item: ExplorerTreeItem, event: React.MouseEvent | React.KeyboardEvent) => void;
  onNodeContextMenu?: (item: ExplorerTreeItem, event: React.MouseEvent) => void;
}

function ExplorerTreeBranch({
  item,
  depth,
  expandedKeys,
  selectedKeys,
  activeKey,
  disabledKeys,
  minTouchTarget,
  renderActions,
  onToggle,
  onOpen,
  onSelect,
  onNodeContextMenu,
}: ExplorerTreeBranchProps) {
  const expanded = expandedKeys?.has(item.id) ?? false;
  const children = item.children ?? [];

  return (
    <React.Fragment>
      <ExplorerTreeNode
        item={item}
        depth={depth}
        expanded={expanded}
        selected={selectedKeys?.has(item.id) ?? false}
        active={activeKey === item.id}
        disabled={disabledKeys?.has(item.id) ?? false}
        minTouchTarget={minTouchTarget}
        renderActions={renderActions}
        onToggle={onToggle}
        onOpen={onOpen}
        onSelect={onSelect}
        onNodeContextMenu={onNodeContextMenu}
      />
      {expanded && children.length > 0 && (
        <div role="group">
          {children.map((child) => (
            <ExplorerTreeBranch
              key={child.id}
              item={child}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              selectedKeys={selectedKeys}
              activeKey={activeKey}
              disabledKeys={disabledKeys}
              minTouchTarget={minTouchTarget}
              renderActions={renderActions}
              onToggle={onToggle}
              onOpen={onOpen}
              onSelect={onSelect}
              onNodeContextMenu={onNodeContextMenu}
            />
          ))}
        </div>
      )}
    </React.Fragment>
  );
}
