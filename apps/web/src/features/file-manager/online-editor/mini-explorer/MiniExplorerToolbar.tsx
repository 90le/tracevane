import { ChevronUp, FilePlus2, FolderPlus, PanelLeftClose, RefreshCw } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface MiniExplorerToolbarProps {
  directoryPath: string;
  parentPath: string | null;
  loading?: boolean;
  onGoParent: () => void;
  onRefresh: () => void;
  onCreateFile: () => void;
  onCreateDirectory: () => void;
  onClose: () => void;
}

export function MiniExplorerToolbar({
  directoryPath,
  parentPath,
  loading = false,
  onGoParent,
  onRefresh,
  onCreateFile,
  onCreateDirectory,
  onClose,
}: MiniExplorerToolbarProps) {
  return (
    <div
      className="grid shrink-0 gap-1 border-b border-line bg-panel px-2.5 py-2 text-sm text-ink"
      data-online-editor-mini-explorer-toolbar
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 truncate font-medium text-ink-strong">文件列表</div>
        <div className="flex shrink-0 items-center gap-1" role="toolbar" aria-label="文件列表操作">
          <MiniExplorerToolbarButton
            label="上一级"
            disabled={parentPath == null}
            onClick={onGoParent}
          >
            <ChevronUp className="size-4" />
          </MiniExplorerToolbarButton>
          <MiniExplorerToolbarButton
            label={loading ? "刷新中" : "刷新"}
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw className={cn("size-4", loading && "motion-safe:animate-spin")} />
          </MiniExplorerToolbarButton>
          <MiniExplorerToolbarButton label="新建文件" onClick={onCreateFile}>
            <FilePlus2 className="size-4" />
          </MiniExplorerToolbarButton>
          <MiniExplorerToolbarButton label="新建目录" onClick={onCreateDirectory}>
            <FolderPlus className="size-4" />
          </MiniExplorerToolbarButton>
          <MiniExplorerToolbarButton label="收起" onClick={onClose}>
            <PanelLeftClose className="size-4" />
          </MiniExplorerToolbarButton>
        </div>
      </div>
      <div
        className="min-w-0 truncate rounded-sm bg-panel-2 px-2 py-1 font-mono text-[11px] text-muted"
        title={directoryPath || "根目录"}
        data-online-editor-mini-explorer-path
      >
        {directoryPath || "根目录"}
      </div>
    </div>
  );
}

function MiniExplorerToolbarButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-sm border border-transparent text-muted outline-none transition-colors hover:border-line hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-muted"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
