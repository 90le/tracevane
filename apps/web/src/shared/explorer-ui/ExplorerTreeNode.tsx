import * as React from "react";
import {
  Archive,
  ChevronRight,
  File,
  FileCode2,
  FileText,
  FileWarning,
  Folder,
  Image,
  Music,
  Video,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { explorerFileType } from "@/shared/explorer-core";
import type { ExplorerEntry, ExplorerNodeKey } from "@/shared/explorer-core";

export interface ExplorerTreeItem extends ExplorerEntry {
  children?: ExplorerTreeItem[];
  childrenLoaded?: boolean;
  isLoadingChildren?: boolean;
}

export interface ExplorerTreeNodeRenderState {
  item: ExplorerTreeItem;
  depth: number;
  expanded: boolean;
  selected: boolean;
  active: boolean;
  disabled: boolean;
}

export interface ExplorerTreeNodeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect" | "onToggle"> {
  item: ExplorerTreeItem;
  depth?: number;
  expanded?: boolean;
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  minTouchTarget?: boolean;
  renderActions?: (state: ExplorerTreeNodeRenderState) => React.ReactNode;
  onToggle?: (item: ExplorerTreeItem) => void;
  onOpen?: (item: ExplorerTreeItem) => void;
  onSelect?: (item: ExplorerTreeItem, event: React.MouseEvent | React.KeyboardEvent) => void;
  onNodeContextMenu?: (item: ExplorerTreeItem, event: React.MouseEvent) => void;
}

export function ExplorerTreeNode({
  item,
  depth = 0,
  expanded = false,
  selected = false,
  active = false,
  disabled = false,
  minTouchTarget = true,
  renderActions,
  onToggle,
  onOpen,
  onSelect,
  onNodeContextMenu,
  className,
  ...props
}: ExplorerTreeNodeProps) {
  const isDirectory = item.kind === "directory";
  const nodeId = treeNodeDomId(item.id);
  const state: ExplorerTreeNodeRenderState = {
    item,
    depth,
    expanded,
    selected,
    active,
    disabled,
  };

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    onSelect?.(item, event);
  };

  const handleRowDoubleClick = () => {
    if (disabled) return;
    if (isDirectory) onToggle?.(item);
    else onOpen?.(item);
  };

  const handleToggleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!disabled && isDirectory) onToggle?.(item);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!disabled) onNodeContextMenu?.(item, event);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect?.(item, event);
      if (isDirectory) onToggle?.(item);
      else onOpen?.(item);
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      onSelect?.(item, event);
      if (isDirectory) onToggle?.(item);
    }
    if (event.key === "ArrowRight" && isDirectory && !expanded) {
      event.preventDefault();
      onToggle?.(item);
    }
    if (event.key === "ArrowLeft" && isDirectory && expanded) {
      event.preventDefault();
      onToggle?.(item);
    }
  };

  return (
    <div
      id={nodeId}
      role="treeitem"
      aria-selected={selected || active}
      aria-expanded={isDirectory ? expanded : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-explorer-node-key={item.id satisfies ExplorerNodeKey}
      data-explorer-node-kind={item.kind}
      className={cn(
        "group/explorer-node flex w-full min-w-0 items-center gap-1.5 rounded-sm border border-transparent px-1.5 text-left text-sm text-ink outline-none transition-colors",
        minTouchTarget ? "min-h-9 py-1" : "min-h-7 py-0.5",
        active && "border-primary-line bg-primary-soft text-ink-strong",
        selected && !active && "bg-panel-3 text-ink-strong",
        !disabled && "cursor-default hover:border-line hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
        disabled && "cursor-not-allowed opacity-55",
        className,
      )}
      style={{ paddingInlineStart: `calc(${depth} * 14px + 6px)` }}
      onClick={handleRowClick}
      onDoubleClick={handleRowDoubleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <button
        type="button"
        aria-label={expanded ? "折叠目录" : "展开目录"}
        disabled={!isDirectory || disabled}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-sm text-subtle outline-none transition-colors",
          isDirectory
            ? "hover:bg-primary-soft hover:text-primary focus-visible:shadow-[var(--ring)]"
            : "pointer-events-none opacity-0",
        )}
        onClick={handleToggleClick}
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
        />
      </button>
      <ExplorerNodeIcon item={item} expanded={expanded} />
      <span className="min-w-0 flex-1 truncate" title={item.path || item.name}>
        {item.name}
      </span>
      {item.isLoadingChildren && (
        <span className="size-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" aria-label="加载中" />
      )}
      {renderActions && (
        <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/explorer-node:opacity-100 group-focus-within/explorer-node:opacity-100">
          {renderActions(state)}
        </span>
      )}
    </div>
  );
}

function ExplorerNodeIcon({ item, expanded }: { item: ExplorerTreeItem; expanded: boolean }) {
  const type = explorerFileType(item);
  const className = "size-4 shrink-0";
  if (type === "directory") {
    return (
      <Folder
        className={cn(className, expanded ? "text-primary" : "text-amber")}
        aria-hidden="true"
      />
    );
  }
  if (type === "image") return <Image className={cn(className, "text-teal")} aria-hidden="true" />;
  if (type === "video") return <Video className={cn(className, "text-violet")} aria-hidden="true" />;
  if (type === "audio") return <Music className={cn(className, "text-violet")} aria-hidden="true" />;
  if (type === "archive") return <Archive className={cn(className, "text-amber")} aria-hidden="true" />;
  if (type === "code") return <FileCode2 className={cn(className, "text-primary")} aria-hidden="true" />;
  if (type === "text" || type === "document" || type === "pdf") {
    return <FileText className={cn(className, "text-muted")} aria-hidden="true" />;
  }
  if (type === "binary") return <FileWarning className={cn(className, "text-subtle")} aria-hidden="true" />;
  return <File className={cn(className, "text-muted")} aria-hidden="true" />;
}

function treeNodeDomId(key: ExplorerNodeKey): string {
  return `explorer-node-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
