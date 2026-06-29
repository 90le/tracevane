import * as React from "react";
import {
  Clipboard,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  UploadCloud,
  DownloadCloud,
  Repeat2,
} from "lucide-react";

import type {
  GitBranchSummary,
  GitCommitSummary,
  GitFileChange,
} from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export interface GitPanelCommandRegistryInput {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
  branches: GitBranchSummary[];
  commits: GitCommitSummary[];
  pending: boolean;
  commitMessage: string;
  canCommit: boolean;
  activeChange: GitFileChange | null;
  activeCommit: GitCommitSummary | null;
  activeBranch: GitBranchSummary | null;
  openActiveChangeActions?: (change: GitFileChange) => void;
  openActiveCommitActions?: (commit: GitCommitSummary) => void;
  openActiveBranchActions?: (branch: GitBranchSummary) => void;
  refreshStatus: () => void;
  stageFiles: (paths: string[]) => void;
  unstageFiles: (paths: string[]) => void;
  requestBranchSwitch: (branch: string) => void;
  openCreateBranchDialog: () => void;
  copyBranch: (branch: string) => void;
  copyCommitContext: (commit: GitCommitSummary) => void;
  copyCommitReleaseNote: (commit: GitCommitSummary) => void;
  copyCommitDiffContext: (commit: GitCommitSummary) => void;
  copyRecentHistoryContext: () => void;
  publishCurrentBranch: () => void;
  pullCurrentBranch: () => void;
  pushCurrentBranch: () => void;
  syncCurrentBranch: () => void;
  openCommitDetails: (commit: GitCommitSummary) => void;
  explainStatus: () => void;
  generateCommitDraft: () => void;
  requestAiCommitDraft: () => void;
  canGenerateCommitDraft: boolean;
  stashCount: number;
  saveWorkspaceStash: () => void;
  commitStaged: () => void;
}

export function createGitPanelCommands({
  branch,
  upstream,
  ahead,
  behind,
  staged,
  unstaged,
  untracked,
  branches,
  commits,
  pending,
  commitMessage,
  canCommit,
  activeChange,
  activeCommit,
  activeBranch,
  openActiveChangeActions,
  openActiveCommitActions,
  openActiveBranchActions,
  refreshStatus,
  stageFiles,
  unstageFiles,
  requestBranchSwitch,
  openCreateBranchDialog,
  copyBranch,
  copyCommitContext,
  copyCommitReleaseNote,
  copyCommitDiffContext,
  copyRecentHistoryContext,
  publishCurrentBranch,
  pullCurrentBranch,
  pushCurrentBranch,
  syncCurrentBranch,
  openCommitDetails,
  explainStatus,
  generateCommitDraft,
  requestAiCommitDraft,
  canGenerateCommitDraft,
  stashCount,
  saveWorkspaceStash,
  commitStaged,
}: GitPanelCommandRegistryInput): WorkspaceCommand[] {
  const stageable = [...unstaged, ...untracked];
  const switchableBranches = branches.filter((candidate) => !candidate.current);
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
      id: "git.panel.stashSave",
      group: "Git",
      label: "Git：保存当前变更到 Stash",
      description:
        stageable.length + staged.length > 0
          ? `保存 ${stageable.length + staged.length} 个当前变更；已有 ${stashCount} 个 stash`
          : "没有可保存到 stash 的变更",
      icon: <Clipboard />,
      disabled: pending || stageable.length + staged.length === 0,
      run: saveWorkspaceStash,
    },
    {
      id: "git.panel.openActiveChangeActions",
      group: "Git",
      label: "Git：打开当前变更操作菜单",
      description: activeChange
        ? `管理 ${activeChange.path}`
        : "请先在 Git 面板选中一个变更文件",
      icon: <MoreHorizontal />,
      disabled: !activeChange || !openActiveChangeActions,
      run: () => {
        if (activeChange) openActiveChangeActions?.(activeChange);
      },
    },
    {
      id: "git.panel.createBranch",
      group: "Git",
      label: "Git：新建并切换分支",
      description: "打开新建分支对话框，从当前 HEAD 创建并切换",
      icon: <GitBranch />,
      disabled: pending,
      run: openCreateBranchDialog,
    },
    {
      id: "git.panel.openActiveBranchActions",
      group: "Git",
      label: "Git：打开当前分支操作菜单",
      description: activeBranch
        ? `管理分支 ${activeBranch.name}`
        : "当前没有可管理的分支",
      icon: <MoreHorizontal />,
      disabled: !activeBranch || !openActiveBranchActions,
      run: () => {
        if (activeBranch) openActiveBranchActions?.(activeBranch);
      },
    },
    ...switchableBranches.slice(0, 8).map((candidate) => ({
      id: `git.panel.checkout.${candidate.name}`,
      group: "Git" as const,
      label: `Git：切换到 ${candidate.name}`,
      description: candidate.upstream
        ? `跟踪 ${candidate.upstream}${candidate.subject ? ` · ${candidate.subject}` : ""}`
        : candidate.subject || "切换到该分支，会在有本地更改时先弹出确认",
      icon: <GitBranch />,
      disabled: pending,
      run: () => requestBranchSwitch(candidate.name),
    })),
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
      id: "git.panel.publish",
      group: "Git",
      label: "Git：发布当前分支",
      description: upstream
        ? `当前分支已经跟踪 ${upstream}`
        : branch
          ? `推送 ${branch} 到 origin 并设置 upstream`
          : "当前没有可发布的分支",
      icon: <UploadCloud />,
      disabled: pending || !branch || Boolean(upstream),
      run: publishCurrentBranch,
    },
    {
      id: "git.panel.pull",
      group: "Git",
      label: "Git：拉取当前分支",
      description: upstream
        ? behind > 0
          ? `从 ${upstream} 快进拉取 ${behind} 个提交`
          : `当前分支已跟踪 ${upstream}，没有落后提交`
        : "当前分支没有上游，暂不能拉取",
      icon: <DownloadCloud />,
      disabled: pending || !upstream || behind === 0,
      run: pullCurrentBranch,
    },
    {
      id: "git.panel.push",
      group: "Git",
      label: "Git：推送当前分支",
      description: upstream
        ? ahead > 0
          ? `推送 ${ahead} 个提交到 ${upstream}`
          : `当前分支已跟踪 ${upstream}，没有待推送提交`
        : "当前分支没有上游，暂不能推送",
      icon: <UploadCloud />,
      disabled: pending || !upstream || ahead === 0,
      run: pushCurrentBranch,
    },
    {
      id: "git.panel.sync",
      group: "Git",
      label: "Git：同步当前分支",
      description: upstream
        ? `先 fast-forward pull，再 push；ahead ${ahead}, behind ${behind}`
        : "当前分支没有上游，暂不能同步",
      icon: <Repeat2 />,
      disabled: pending || !upstream || (ahead === 0 && behind === 0),
      run: syncCurrentBranch,
    },
    {
      id: "git.panel.generateCommitDraft",
      group: "Git",
      label: "Git：生成提交草稿",
      description: canGenerateCommitDraft
        ? "基于已暂存文件生成可编辑提交信息"
        : "请先暂存需要提交的更改",
      icon: <GitCommitHorizontal />,
      disabled: pending || !canGenerateCommitDraft,
      run: generateCommitDraft,
    },
    {
      id: "git.panel.ai.commitMessage",
      group: "证据",
      label: "Git：生成提交信息建议",
      description: "基于 @git staged diff 生成可审查建议；只填入草稿，不会提交",
      icon: <Sparkles />,
      disabled: pending || !canGenerateCommitDraft,
      run: requestAiCommitDraft,
    },
    {
      id: "git.panel.commitStaged",
      group: "Git",
      label: "Git：提交已暂存更改",
      description: canCommit
        ? `提交 ${staged.length} 个已暂存文件：${commitMessage.slice(0, 60)}`
        : staged.length === 0
          ? "请先暂存更改"
          : "请输入提交信息",
      icon: <GitCommitHorizontal />,
      disabled: pending || !canCommit,
      run: commitStaged,
    },
    {
      id: "git.panel.explainStatus",
      group: "Git",
      label: "Git：生成变更审查摘要",
      description: "基于 @git status / @git diff 上下文生成可审查摘要",
      icon: <Sparkles />,
      run: explainStatus,
    },
    {
      id: "git.panel.recentHistoryContext",
      group: "证据",
      label: "Git：复制近期历史上下文",
      description:
        commits.length > 0
          ? `复制 ${Math.min(commits.length, 10)} 条近期提交，用于审查变更或生成变更日志`
          : "暂无近期提交历史",
      icon: <Sparkles />,
      disabled: commits.length === 0,
      run: copyRecentHistoryContext,
    },
    {
      id: "git.panel.openActiveCommitActions",
      group: "Git",
      label: "Git：打开当前提交操作菜单",
      description: activeCommit
        ? `管理 ${activeCommit.shortHash || activeCommit.hash}`
        : "请先在 Git 历史中选中一个提交",
      icon: <MoreHorizontal />,
      disabled: !activeCommit || !openActiveCommitActions,
      run: () => {
        if (activeCommit) openActiveCommitActions?.(activeCommit);
      },
    },
    ...commits.slice(0, 5).flatMap((commit) => [
      {
        id: `git.panel.commitDetails.${commit.shortHash || commit.hash}`,
        group: "Git" as const,
        label: `Git：打开提交详情 ${commit.shortHash}`,
        description: commit.subject
          ? `在 Git 面板中查看：${commit.subject}`
          : "在 Git 面板中查看该提交详情",
        icon: <GitCommitHorizontal />,
        run: () => openCommitDetails(commit),
      },
      {
        id: `git.panel.commitReleaseNote.${commit.shortHash || commit.hash}`,
        group: "证据" as const,
        label: `Git：复制变更日志条目 ${commit.shortHash}`,
        description: commit.subject
          ? `复制变更日志审查条目：${commit.subject}`
          : "复制该提交的变更日志条目",
        icon: <Sparkles />,
        run: () => copyCommitReleaseNote(commit),
      },
      {
        id: `git.panel.commitDiffContext.${commit.shortHash || commit.hash}`,
        group: "证据" as const,
        label: `Git：复制 Diff 审查上下文 ${commit.shortHash}`,
        description: commit.subject
          ? `复制 @git commit-diff 审查上下文：${commit.subject}`
          : "复制该提交的文件清单和 Diff 审查上下文",
        icon: <FileDiff />,
        run: () => copyCommitDiffContext(commit),
      },
      {
        id: `git.panel.commitContext.${commit.shortHash || commit.hash}`,
        group: "证据" as const,
        label: `Git：复制提交证据包 ${commit.shortHash}`,
        description: commit.subject
          ? `复制 @git commit 证据包：${commit.subject}`
          : "复制该提交的审查证据包",
        icon: <GitCommitHorizontal />,
        run: () => copyCommitContext(commit),
      },
    ]),
  ];
}
