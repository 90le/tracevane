import * as React from "react";
import {
  Copy,
  FileDiff,
  FileText,
  FileSymlink,
  Minus,
  Plus,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

import type { GitFileChange } from "@/features/workspace/shared/types";

export type GitChangeActionId =
  | "git.change.openDiff"
  | "git.change.openFile"
  | "git.change.stage"
  | "git.change.unstage"
  | "git.change.copyPath"
  | "git.change.copyRelativePath"
  | "git.change.revealInExplorer"
  | "git.change.insertPathToTerminal"
  | "git.change.reviewDiff";

export interface GitChangeAction {
  id: GitChangeActionId;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
  run: () => void;
}

export interface GitChangeActionRegistryInput {
  change: GitFileChange;
  openDiff: (change: GitFileChange) => void;
  openFile?: (path: string) => void;
  stageFile?: (path: string) => void;
  unstageFile?: (path: string) => void;
  copyPath: (path: string) => void;
  copyRelativePath?: (path: string) => void;
  revealInExplorer?: (path: string) => void;
  insertPathToTerminal?: (path: string) => void;
  /**
   * Produces a reviewable diff summary. The legacy callback name is kept while
   * WorkspaceGitPanel is dirty, but the action is framed as Git review evidence
   * rather than a generation-first shortcut.
   */
  explainDiff: (change: GitFileChange) => void;
}

export function createGitChangeActions({
  change,
  openDiff,
  openFile,
  stageFile,
  unstageFile,
  copyPath,
  copyRelativePath,
  revealInExplorer,
  insertPathToTerminal,
  explainDiff,
}: GitChangeActionRegistryInput): GitChangeAction[] {
  return [
    {
      id: "git.change.openDiff",
      label: "打开 Diff",
      shortcut: "Enter",
      icon: <FileDiff className="size-3.5" />,
      run: () => openDiff(change),
    },
    {
      id: "git.change.openFile",
      label: "打开文件",
      shortcut: "Ctrl+Enter",
      icon: <FileText className="size-3.5" />,
      disabled: !openFile || change.kind === "deleted",
      run: () => openFile?.(change.path),
    },
    {
      id: "git.change.stage",
      label: "暂存文件",
      shortcut: "+",
      icon: <Plus className="size-3.5" />,
      disabled: !stageFile,
      run: () => stageFile?.(change.path),
    },
    {
      id: "git.change.unstage",
      label: "取消暂存",
      shortcut: "-",
      icon: <Minus className="size-3.5" />,
      disabled: !unstageFile,
      run: () => unstageFile?.(change.path),
    },
    {
      id: "git.change.copyPath",
      label: "复制绝对路径",
      shortcut: "Shift+Alt+C",
      icon: <Copy className="size-3.5" />,
      separatorBefore: true,
      run: () => copyPath(change.path),
    },
    ...(copyRelativePath
      ? [
          {
            id: "git.change.copyRelativePath" as const,
            label: "复制相对路径",
            shortcut: "Ctrl+K Ctrl+Shift+C",
            icon: <Copy className="size-3.5" />,
            run: () => copyRelativePath(change.path),
          },
        ]
      : []),
    ...(revealInExplorer
      ? [
          {
            id: "git.change.revealInExplorer" as const,
            label: "在资源管理器显示",
            icon: <FileSymlink className="size-3.5" />,
            run: () => revealInExplorer(change.path),
          },
        ]
      : []),
    ...(insertPathToTerminal
      ? [
          {
            id: "git.change.insertPathToTerminal" as const,
            label: "插入路径到终端",
            icon: <TerminalSquare className="size-3.5" />,
            run: () => insertPathToTerminal(change.path),
          },
        ]
      : []),
    {
      id: "git.change.reviewDiff",
      label: "生成 Diff 审查摘要",
      icon: <Sparkles className="size-3.5" />,
      run: () => explainDiff(change),
    },
  ];
}
