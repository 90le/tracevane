import * as React from "react";
import {
  Clipboard,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import type { GitFileChange } from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export interface GitPanelCommandRegistryInput {
  branch: string;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
  pending: boolean;
  refreshStatus: () => void;
  stageFiles: (paths: string[]) => void;
  unstageFiles: (paths: string[]) => void;
  copyBranch: (branch: string) => void;
  explainStatus: () => void;
}

export function createGitPanelCommands({
  branch,
  staged,
  unstaged,
  untracked,
  pending,
  refreshStatus,
  stageFiles,
  unstageFiles,
  copyBranch,
  explainStatus,
}: GitPanelCommandRegistryInput): WorkspaceCommand[] {
  const stageable = [...unstaged, ...untracked];
  return [
    {
      id: "git.panel.refresh",
      group: "Git",
      label: "Git：刷新状态",
      description: "重新读取当前工作区 Git 状态",
      icon: <RefreshCw />,
      run: refreshStatus,
    },
    {
      id: "git.panel.stageAll",
      group: "Git",
      label: "Git：暂存全部更改",
      description:
        stageable.length > 0
          ? `暂存 ${stageable.length} 个未暂存/未跟踪文件`
          : "没有可暂存的更改",
      icon: <GitCommitHorizontal />,
      disabled: pending || stageable.length === 0,
      run: () => stageFiles(stageable.map((change) => change.path)),
    },
    {
      id: "git.panel.unstageAll",
      group: "Git",
      label: "Git：取消全部暂存",
      description:
        staged.length > 0
          ? `取消暂存 ${staged.length} 个文件`
          : "没有已暂存的更改",
      icon: <GitBranch />,
      disabled: pending || staged.length === 0,
      run: () => unstageFiles(staged.map((change) => change.path)),
    },
    {
      id: "git.panel.copyBranch",
      group: "Git",
      label: "Git：复制当前分支名",
      description: branch ? `当前分支：${branch}` : "当前没有分支名",
      icon: <Clipboard />,
      disabled: !branch,
      run: () => copyBranch(branch),
    },
    {
      id: "git.panel.explainStatus",
      group: "Git",
      label: "Git：AI 总结当前变更",
      description: "预留 @git status / @git diff 上下文入口",
      icon: <Sparkles />,
      run: explainStatus,
    },
  ];
}
