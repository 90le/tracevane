import * as React from "react";
import { Copy, FileDiff, Minus, Plus, Sparkles } from "lucide-react";

import type { GitFileChange } from "@/features/workspace/shared/types";

export type GitChangeActionId =
  | "git.change.openDiff"
  | "git.change.stage"
  | "git.change.unstage"
  | "git.change.copyPath"
  | "git.change.explain";

export interface GitChangeAction {
  id: GitChangeActionId;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  separatorBefore?: boolean;
  run: () => void;
}

export interface GitChangeActionRegistryInput {
  change: GitFileChange;
  openDiff: (path: string) => void;
  stageFile?: (path: string) => void;
  unstageFile?: (path: string) => void;
  copyPath: (path: string) => void;
  explainDiff: (change: GitFileChange) => void;
}

export function createGitChangeActions({
  change,
  openDiff,
  stageFile,
  unstageFile,
  copyPath,
  explainDiff,
}: GitChangeActionRegistryInput): GitChangeAction[] {
  return [
    {
      id: "git.change.openDiff",
      label: "打开 Diff",
      icon: <FileDiff className="size-3.5" />,
      run: () => openDiff(change.path),
    },
    {
      id: "git.change.stage",
      label: "暂存文件",
      icon: <Plus className="size-3.5" />,
      disabled: !stageFile,
      run: () => stageFile?.(change.path),
    },
    {
      id: "git.change.unstage",
      label: "取消暂存",
      icon: <Minus className="size-3.5" />,
      disabled: !unstageFile,
      run: () => unstageFile?.(change.path),
    },
    {
      id: "git.change.copyPath",
      label: "复制路径",
      icon: <Copy className="size-3.5" />,
      separatorBefore: true,
      run: () => copyPath(change.path),
    },
    {
      id: "git.change.explain",
      label: "AI 解释 Diff",
      icon: <Sparkles className="size-3.5" />,
      run: () => explainDiff(change),
    },
  ];
}
