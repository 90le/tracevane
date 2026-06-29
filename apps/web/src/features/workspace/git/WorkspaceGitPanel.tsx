import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  GitBranch,
  GitCommitHorizontal,
  UploadCloud,
  DownloadCloud,
  Repeat2,
  Plus,
  Minus,
  FileDiff,
  RefreshCw,
  Sparkles,
  MoreHorizontal,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import {
  useApplyGitStashMutation,
  useCheckoutBranchMutation,
  useCommitFilesMutation,
  useCreateBranchMutation,
  useGitCommitDetailQuery,
  useDropGitStashMutation,
  useGitStashesQuery,
  useGitStatusQuery,
  usePopGitStashMutation,
  usePublishBranchMutation,
  usePullBranchMutation,
  usePushBranchMutation,
  useSaveGitStashMutation,
  useStageFilesMutation,
  useSyncBranchMutation,
  useUnstageFilesMutation,
} from "@/lib/query/git";
import type {
  GitBranchSummary,
  GitCommitDetailPayload,
  GitCommitSummary,
  GitFileChange,
  GitFileChangeKind,
} from "@/features/workspace/shared/types";
import type { GitStashEntry } from "../../../../../../types/git";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";
import {
  createGitChangeActions,
  type GitChangeAction,
} from "./gitChangeActions";
import { createGitPanelCommands } from "./gitPanelCommands";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WorkspaceGitDiffTarget {
  path: string;
  staged: boolean;
  untracked: boolean;
  kind: GitFileChangeKind;
}

export interface WorkspaceGitPanelProps {
  /** Root id the Git panel is scoped to. */
  rootId: string;
  /**
   * Fired when a changed file row is activated. Carries enough context for the
   * editor diff view to choose staged/working-tree/untracked diff APIs.
   */
  onOpenDiff?: (target: WorkspaceGitDiffTarget) => void;
  /** Opens the changed file in a normal editor tab when it still exists. */
  onOpenFile?: (path: string) => void;
  /** Reveals a changed file in the Workspace Explorer. */
  onRevealInExplorer?: (path: string) => void;
  /** Registers panel-level Git commands with the Workspace command palette. */
  onCommandsChange?: (commands: WorkspaceCommand[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `WorkspaceGitPanel` — the source-control surface shown in the Workspace Git side panel when
 * the Git activity is active.
 *
 * It reuses the Git data layer (`apps/web/src/lib/query/git.ts`) for every
 * read and write. Reads come from `useGitStatusQuery`; writes go through the
 * stage / unstage / commit / create-branch / checkout mutation hooks, each of
 * which returns the refreshed `GitStatusPayload` and invalidates the Git
 * surface (Task 0.3) so the panel re-renders automatically.
 *
 * Layout:
 *   header  → current branch + branch switcher + "新建分支" action
 *   body    → grouped change list (Staged / Unstaged / Untracked) with
 *             per-row stage (＋) / unstage (－) actions; clicking a row fires
 *             `onOpenDiff`.
 *   footer  → commit message box + "提交" button.
 *
 * Loading → `Skeleton`; error → `ErrorState` + retry; non-repo → `EmptyState`
 * with an init hint (we never auto-`git init`).
 */
export function WorkspaceGitPanel({
  rootId,
  onOpenDiff,
  onOpenFile,
  onRevealInExplorer,
  onCommandsChange,
}: WorkspaceGitPanelProps) {
  const status = useGitStatusQuery(rootId ? { rootId } : null);
  const stashList = useGitStashesQuery(rootId ? { rootId } : null, {
    enabled: Boolean(rootId),
  });

  // --- Write hooks ----------------------------------------------------------
  const stage = useStageFilesMutation();
  const unstage = useUnstageFilesMutation();
  const commit = useCommitFilesMutation();
  const saveStash = useSaveGitStashMutation();
  const applyStash = useApplyGitStashMutation();
  const popStash = usePopGitStashMutation();
  const dropStash = useDropGitStashMutation();
  const createBranch = useCreateBranchMutation();
  const checkout = useCheckoutBranchMutation();
  const publish = usePublishBranchMutation();
  const pull = usePullBranchMutation();
  const push = usePushBranchMutation();
  const sync = useSyncBranchMutation();

  // --- Commit message -------------------------------------------------------
  const [message, setMessage] = React.useState("");
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    change: GitFileChange;
  } | null>(null);
  const [activeChangePath, setActiveChangePath] = React.useState<string | null>(
    null,
  );
  const [selectedChangePaths, setSelectedChangePaths] = React.useState<string[]>(
    [],
  );
  const [lastSelectedChangePath, setLastSelectedChangePath] =
    React.useState<string | null>(null);
  const [commitMenu, setCommitMenu] = React.useState<{
    x: number;
    y: number;
    commit: GitCommitSummary;
  } | null>(null);
  const [activeCommitHash, setActiveCommitHash] = React.useState<string | null>(
    null,
  );
  const [branchSwitchTarget, setBranchSwitchTarget] =
    React.useState<GitBranchSummary | null>(null);
  const [branchMenu, setBranchMenu] = React.useState<{
    x: number;
    y: number;
    branch: GitBranchSummary;
  } | null>(null);
  const [activeBranchName, setActiveBranchName] = React.useState<string | null>(
    null,
  );
  const [selectedCommit, setSelectedCommit] =
    React.useState<GitCommitSummary | null>(null);
  const selectedCommitHash = selectedCommit?.hash ?? "";
  const commitDetail = useGitCommitDetailQuery(
    rootId && selectedCommitHash ? { rootId, hash: selectedCommitHash } : null,
  );
  const [branchCreateDialogOpen, setBranchCreateDialogOpen] =
    React.useState(false);
  const [branchCreateDraft, setBranchCreateDraft] = React.useState("");
  const [branchCreateFrom, setBranchCreateFrom] =
    React.useState<GitBranchSummary | null>(null);
  const [stashDropTarget, setStashDropTarget] =
    React.useState<GitStashEntry | null>(null);
  const touchActionSurface = useGitTouchActionSurface();

  const available = status.data?.available ?? false;
  const branch = status.data?.branch ?? "";
  const branches = status.data?.branches ?? [];
  const changes = status.data?.changes ?? [];
  const commits = status.data?.commits ?? [];
  const stashes = stashList.data?.stashes ?? [];
  const clean = status.data?.clean ?? false;
  const repositoryRoot = status.data?.repositoryRoot ?? "";
  const upstream = status.data?.upstream ?? null;
  const ahead = status.data?.ahead ?? 0;
  const behind = status.data?.behind ?? 0;

  const staged = React.useMemo(
    () => changes.filter((c) => c.staged),
    [changes],
  );
  const unstaged = React.useMemo(
    () => changes.filter((c) => !c.staged && c.kind !== "untracked"),
    [changes],
  );
  const untracked = React.useMemo(
    () => changes.filter((c) => c.kind === "untracked"),
    [changes],
  );
  const conflicts = React.useMemo(
    () => changes.filter((c) => c.kind === "conflicted"),
    [changes],
  );
  const activeChange = React.useMemo(
    () => changes.find((change) => change.path === activeChangePath) ?? null,
    [activeChangePath, changes],
  );
  const activeCommit = React.useMemo(
    () => commits.find((commit) => commit.hash === activeCommitHash) ?? null,
    [activeCommitHash, commits],
  );
  const activeBranch = React.useMemo(() => {
    const targetName = activeBranchName || branch;
    if (!targetName) return null;
    return (
      branches.find((candidate) => candidate.name === targetName) ?? {
        name: targetName,
        current: targetName === branch,
        upstream: upstream,
        shortHash: "",
        subject: "",
      }
    );
  }, [activeBranchName, branch, branches, upstream]);

  const selectedChangePathSet = React.useMemo(
    () => new Set(selectedChangePaths),
    [selectedChangePaths],
  );
  const selectedChanges = React.useMemo(
    () => changes.filter((change) => selectedChangePathSet.has(change.path)),
    [changes, selectedChangePathSet],
  );
  const selectedStageableChanges = React.useMemo(
    () => selectedChanges.filter((change) => !change.staged),
    [selectedChanges],
  );
  const selectedStagedChanges = React.useMemo(
    () => selectedChanges.filter((change) => change.staged),
    [selectedChanges],
  );
  const stagedSelectedCount = React.useMemo(
    () => staged.filter((change) => selectedChangePathSet.has(change.path)).length,
    [selectedChangePathSet, staged],
  );
  const unstagedSelectedCount = React.useMemo(
    () =>
      unstaged.filter((change) => selectedChangePathSet.has(change.path)).length,
    [selectedChangePathSet, unstaged],
  );
  const untrackedSelectedCount = React.useMemo(
    () =>
      untracked.filter((change) => selectedChangePathSet.has(change.path)).length,
    [selectedChangePathSet, untracked],
  );

  React.useEffect(() => {
    if (!activeChangePath) return;
    if (changes.some((change) => change.path === activeChangePath)) return;
    setActiveChangePath(null);
  }, [activeChangePath, changes]);

  React.useEffect(() => {
    setSelectedChangePaths((current) =>
      current.filter((path) => changes.some((change) => change.path === path)),
    );
  }, [changes]);

  React.useEffect(() => {
    if (!activeCommitHash) return;
    if (commits.some((commit) => commit.hash === activeCommitHash)) return;
    setActiveCommitHash(null);
  }, [activeCommitHash, commits]);

  React.useEffect(() => {
    if (!activeBranchName) return;
    if (branches.some((candidate) => candidate.name === activeBranchName))
      return;
    if (activeBranchName === branch) return;
    setActiveBranchName(null);
  }, [activeBranchName, branch, branches]);

  const hasStaged = staged.length > 0;
  const commitDraftBasis = React.useMemo(
    () => buildGitCommitDraftBasis(staged),
    [staged],
  );
  const messageTrim = message.trim();
  const canCommit = hasStaged && messageTrim.length > 0 && !commit.isPending;

  React.useEffect(() => {
    const refresh = () => void status.refetch();
    window.addEventListener("tracevane:workspace-git-refresh", refresh);
    return () =>
      window.removeEventListener("tracevane:workspace-git-refresh", refresh);
  }, [status]);

  React.useEffect(() => {
    if (!menu && !commitMenu && !branchMenu) return;
    const close = () => {
      setMenu(null);
      setCommitMenu(null);
      setBranchMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [branchMenu, commitMenu, menu]);

  // --- Handlers -------------------------------------------------------------
  const openDiffTarget = React.useCallback(
    (change: GitFileChange) => {
      onOpenDiff?.({
        path: change.path,
        staged: change.staged,
        untracked: change.kind === "untracked",
        kind: change.kind,
      });
    },
    [onOpenDiff],
  );

  const selectGitChange = React.useCallback(
    (change: GitFileChange, event?: React.MouseEvent | React.KeyboardEvent) => {
      const orderedPaths = changes.map((item) => item.path);
      setActiveChangePath(change.path);
      setLastSelectedChangePath(change.path);
      setSelectedChangePaths((current) => {
        if (event?.shiftKey && lastSelectedChangePath) {
          const from = orderedPaths.indexOf(lastSelectedChangePath);
          const to = orderedPaths.indexOf(change.path);
          if (from >= 0 && to >= 0) {
            const [start, end] = from < to ? [from, to] : [to, from];
            return Array.from(new Set([...current, ...orderedPaths.slice(start, end + 1)]));
          }
        }
        if (event?.metaKey || event?.ctrlKey) {
          return current.includes(change.path)
            ? current.filter((path) => path !== change.path)
            : [...current, change.path];
        }
        return [change.path];
      });
    },
    [changes, lastSelectedChangePath],
  );

  const toggleGitChangeSelected = React.useCallback(
    (change: GitFileChange, event?: React.MouseEvent | React.KeyboardEvent) => {
      const orderedPaths = changes.map((item) => item.path);
      setActiveChangePath(change.path);
      setSelectedChangePaths((current) => {
        if (event?.shiftKey && lastSelectedChangePath) {
          const from = orderedPaths.indexOf(lastSelectedChangePath);
          const to = orderedPaths.indexOf(change.path);
          if (from >= 0 && to >= 0) {
            const [start, end] = from < to ? [from, to] : [to, from];
            return Array.from(new Set([...current, ...orderedPaths.slice(start, end + 1)]));
          }
        }
        return current.includes(change.path)
          ? current.filter((path) => path !== change.path)
          : [...current, change.path];
      });
      setLastSelectedChangePath(change.path);
    },
    [changes, lastSelectedChangePath],
  );

  const selectGitChangeGroup = React.useCallback((items: GitFileChange[]) => {
    const paths = items.map((item) => item.path);
    if (paths.length === 0) return;
    setSelectedChangePaths((current) => Array.from(new Set([...current, ...paths])));
    setLastSelectedChangePath(paths[paths.length - 1] ?? null);
    setActiveChangePath(paths[paths.length - 1] ?? null);
  }, []);

  const clearGitChangeGroupSelection = React.useCallback((items: GitFileChange[]) => {
    const paths = new Set(items.map((item) => item.path));
    if (paths.size === 0) return;
    setSelectedChangePaths((current) => current.filter((path) => !paths.has(path)));
    setLastSelectedChangePath((current) => (current && paths.has(current) ? null : current));
  }, []);

  const clearGitChangeSelection = React.useCallback(() => {
    setSelectedChangePaths([]);
    setLastSelectedChangePath(null);
  }, []);

  const handleStageFiles = React.useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      stage.mutate(
        { rootId, paths },
        {
          onError: (err) =>
            toast.error("暂存失败", { description: err.message }),
        },
      );
    },
    [rootId, stage.mutate],
  );

  const handleUnstageFiles = React.useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      unstage.mutate(
        { rootId, paths },
        {
          onError: (err) =>
            toast.error("取消暂存失败", { description: err.message }),
        },
      );
    },
    [rootId, unstage.mutate],
  );

  const handleStage = React.useCallback(
    (file: string) => handleStageFiles([file]),
    [handleStageFiles],
  );

  const handleUnstage = React.useCallback(
    (file: string) => handleUnstageFiles([file]),
    [handleUnstageFiles],
  );

  const handleCommit = React.useCallback(() => {
    if (!canCommit) return;
    commit.mutate(
      { rootId, message: messageTrim },
      {
        onSuccess: () => {
          toast.success("已提交", { description: messageTrim });
          setMessage("");
        },
        onError: (err) => toast.error("提交失败", { description: err.message }),
      },
    );
  }, [canCommit, commit, messageTrim, rootId]);

  const requestBranchSwitch = React.useCallback(
    (target: string) => {
      if (!target || target === branch || checkout.isPending) return;
      const summary = branches.find(
        (candidate) => candidate.name === target,
      ) ?? {
        name: target,
        current: false,
        upstream: null,
        shortHash: "",
        subject: "",
      };
      setBranchSwitchTarget(summary);
    },
    [branch, branches, checkout.isPending],
  );

  const confirmBranchSwitch = React.useCallback(() => {
    const target = branchSwitchTarget?.name;
    if (!target || target === branch) {
      setBranchSwitchTarget(null);
      return;
    }
    checkout.mutate(
      { rootId, target },
      {
        onSuccess: () => {
          toast.success("已切换分支", { description: target });
          setBranchSwitchTarget(null);
        },
        onError: (err) =>
          toast.error("切换分支失败", { description: err.message }),
      },
    );
  }, [branch, branchSwitchTarget, checkout, rootId]);
  const handleCreateBranch = React.useCallback(
    (name: string) => {
      const nextName = name.trim();
      if (!nextName || createBranch.isPending) return;
      const from = branchCreateFrom?.name;
      createBranch.mutate(
        { rootId, name: nextName, checkout: true, from },
        {
          onSuccess: () => {
            toast.success("已创建并切换分支", {
              description: from ? `${nextName} ← ${from}` : nextName,
            });
            setBranchCreateDraft("");
            setBranchCreateFrom(null);
            setBranchCreateDialogOpen(false);
          },
          onError: (err) =>
            toast.error("新建分支失败", { description: err.message }),
        },
      );
    },
    [branchCreateFrom?.name, createBranch, rootId],
  );

  const handleCreateBranchDialogOpenChange = React.useCallback(
    (open: boolean) => {
      setBranchCreateDialogOpen(open);
      if (!open) {
        setBranchCreateFrom(null);
        setBranchCreateDraft("");
      }
    },
    [],
  );

  const openCreateBranchDialog = React.useCallback(() => {
    if (createBranch.isPending) return;
    setBranchCreateFrom(null);
    setBranchCreateDraft("");
    setBranchCreateDialogOpen(true);
  }, [createBranch.isPending]);

  const refreshStatus = React.useCallback(
    () => void status.refetch(),
    [status.refetch],
  );

  const copyBranch = React.useCallback(
    (value: string) => void navigator.clipboard.writeText(value),
    [],
  );

  const gitStatusContext = React.useMemo(
    () =>
      formatGitStatusContext({
        branch,
        upstream,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        conflicts,
        clean,
      }),
    [
      ahead,
      behind,
      branch,
      clean,
      conflicts,
      staged,
      untracked,
      unstaged,
      upstream,
    ],
  );

  const explainStatus = React.useCallback(() => {
    void navigator.clipboard.writeText(gitStatusContext).then(
      () =>
        toast.success("已复制 Git 审查上下文", {
          description:
            "当前先生成 @git status 摘要；后续接入 Gateway 后可作为可审查证据输入。",
        }),
      () =>
        toast.info("Git 审查上下文入口已预留", {
          description:
            "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git status / @git diff context 证据包。",
        }),
    );
  }, [gitStatusContext]);

  const copyConflictContext = React.useCallback(() => {
    const context = formatGitConflictContext(branch, conflicts);
    void navigator.clipboard.writeText(context).then(
      () =>
        toast.success("已复制 Git 冲突上下文", {
          description: `${conflicts.length} 个冲突文件，可交给 AI 解释解决顺序。`,
        }),
      () =>
        toast.info("AI 冲突解释入口已预留", {
          description:
            "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git conflicts context。",
        }),
    );
  }, [branch, conflicts]);

  const applyGeneratedCommitDraft = React.useCallback(() => {
    if (!hasStaged) {
      toast.info("请先暂存需要提交的更改");
      return;
    }
    setMessage(generateGitCommitDraft(staged));
    toast.success("已生成提交草稿", {
      description: "基于已暂存文件生成，提交前可继续编辑。",
    });
  }, [hasStaged, staged]);

  const requestAiCommitDraft = React.useCallback(() => {
    if (!hasStaged) {
      toast.info("请先暂存需要提交的更改");
      return;
    }
    setMessage(generateGitCommitDraft(staged));
    toast.info("AI 提交信息入口已预留", {
      description:
        "当前先使用本地规则草稿；后续接入 Tracevane Gateway 的 @git staged diff context。",
    });
  }, [hasStaged, staged]);

  const copyGitChangePath = React.useCallback(
    (changePath: string, mode: "absolute" | "relative") => {
      const value =
        mode === "relative"
          ? changePath
          : formatGitAbsolutePath(repositoryRoot, changePath);
      void navigator.clipboard.writeText(value).then(
        () =>
          toast.success(
            mode === "relative" ? "已复制 Git 相对路径" : "已复制 Git 绝对路径",
            { description: value },
          ),
        () => toast.error("复制 Git 路径失败", { description: value }),
      );
    },
    [repositoryRoot],
  );

  const insertGitChangePathToTerminal = React.useCallback((path: string) => {
    window.dispatchEvent(
      new CustomEvent("tracevane:workspace-terminal-insert-input", {
        detail: {
          id: `git-change-path-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          value: `${shellQuoteGitPath(path)} `,
          label: "已插入 Git 文件路径到终端",
        },
      }),
    );
  }, []);

  const copyGitDiffContext = React.useCallback((change: GitFileChange) => {
    const context = formatGitChangeContext(change);
    void navigator.clipboard.writeText(context).then(
      () =>
        toast.success("已复制 Git Diff 上下文", {
          description:
            "当前先复制单文件 @git diff 元数据；后续接入 Gateway 后可直接解释选中文件。",
        }),
      () =>
        toast.info("AI Diff 解释入口已预留", {
          description:
            "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git diff context。",
        }),
    );
  }, []);

  const copyGitCommitContext = React.useCallback((commit: GitCommitSummary) => {
    const context = formatGitCommitContext(commit);
    void navigator.clipboard.writeText(context).then(
      () =>
        toast.success("已复制 Git Commit 上下文", {
          description:
            "当前先复制 @git commit 元数据；后续接入 Gateway 后可直接解释该提交。",
        }),
      () =>
        toast.info("AI 提交解释入口已预留", {
          description: `剪贴板不可用；后续会接入 Tracevane Gateway 的 @git commit ${commit.shortHash} context。`,
        }),
    );
  }, []);

  const copyGitCommitReleaseNote = React.useCallback(
    (commit: GitCommitSummary, detail?: GitCommitDetailPayload | null) => {
      const context = formatGitCommitReleaseNote(commit, detail ?? null);
      void navigator.clipboard.writeText(context).then(
        () =>
          toast.success("已复制变更日志条目", {
            description: "可用于 release note、周报或 AI changelog 生成。",
          }),
        () =>
          toast.info("变更日志入口已预留", {
            description:
              "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git release-note context。",
          }),
      );
    },
    [],
  );

  const copyGitCommitDiffContext = React.useCallback(
    (commit: GitCommitSummary, detail?: GitCommitDetailPayload | null) => {
      if (!detail?.diff && !detail?.files?.length) {
        toast.info("提交 Diff 尚未加载", {
          description: "请先打开提交详情，等待文件清单与 diff 预览加载完成。",
        });
        return;
      }
      const context = formatGitCommitDiffContext(commit, detail);
      void navigator.clipboard.writeText(context).then(
        () =>
          toast.success("已复制提交 Diff 上下文", {
            description: detail.truncated
              ? "Diff 已按安全上限截断，适合交给 AI 做概要审阅。"
              : "可直接用于 AI 审阅、风险分析或回滚说明。",
          }),
        () =>
          toast.info("提交 Diff 上下文入口已预留", {
            description:
              "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git commit-diff context。",
          }),
      );
    },
    [],
  );

  const openCommitDetails = React.useCallback((commit: GitCommitSummary) => {
    setSelectedCommit(commit);
  }, []);

  const copyRecentHistoryContext = React.useCallback(() => {
    if (commits.length === 0) {
      toast.info("暂无近期提交历史");
      return;
    }
    const context = formatGitRecentHistoryContext(branch, commits);
    void navigator.clipboard.writeText(context).then(
      () =>
        toast.success("已复制 Git 近期历史上下文", {
          description:
            "可用于 AI 总结最近变更、生成 changelog 或审查提交节奏。",
        }),
      () =>
        toast.info("Git 历史上下文入口已预留", {
          description:
            "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git history context。",
        }),
    );
  }, [branch, commits]);

  const copyCurrentBranch = React.useCallback(() => {
    if (!branch) return;
    void navigator.clipboard.writeText(branch);
    toast.success("已复制当前分支", { description: branch });
  }, [branch]);

  const copyGitBranchContext = React.useCallback((target: GitBranchSummary) => {
    const context = formatGitBranchContext(target);
    void navigator.clipboard.writeText(context).then(
      () =>
        toast.success("已复制 Git 分支上下文", {
          description: target.name,
        }),
      () =>
        toast.info("AI 分支解释入口已预留", {
          description:
            "剪贴板不可用；后续会接入 Tracevane Gateway 的 @git branch context。",
        }),
    );
  }, []);

  const copyGitBranchName = React.useCallback((target: GitBranchSummary) => {
    void navigator.clipboard.writeText(target.name).then(
      () => toast.success("已复制分支名", { description: target.name }),
      () => toast.error("复制分支名失败", { description: target.name }),
    );
  }, []);

  const createBranchFromRef = React.useCallback((target: GitBranchSummary) => {
    setBranchCreateFrom(target);
    setBranchCreateDraft(`${target.name.replace(/[\\/]+/g, "-")}-work`);
    setBranchCreateDialogOpen(true);
  }, []);

  const publishCurrentBranch = React.useCallback(() => {
    if (!branch) return;
    publish.mutate(
      { rootId, remote: "origin", branch },
      {
        onSuccess: () =>
          toast.success("已发布当前分支", {
            description: `${branch} → origin/${branch}`,
          }),
        onError: (err) =>
          toast.error("发布分支失败", { description: err.message }),
      },
    );
  }, [branch, publish, rootId]);

  const pullCurrentBranch = React.useCallback(() => {
    pull.mutate(
      { rootId },
      {
        onSuccess: () =>
          toast.success("已拉取远端更新", {
            description: upstream || branch || "当前分支上游",
          }),
        onError: (err) =>
          toast.error("拉取失败", { description: err.message }),
      },
    );
  }, [branch, pull, rootId, upstream]);

  const pushCurrentBranch = React.useCallback(() => {
    push.mutate(
      { rootId },
      {
        onSuccess: () =>
          toast.success("已推送当前分支", {
            description: upstream || branch || "当前分支上游",
          }),
        onError: (err) =>
          toast.error("推送失败", { description: err.message }),
      },
    );
  }, [branch, push, rootId, upstream]);

  const syncCurrentBranch = React.useCallback(() => {
    sync.mutate(
      { rootId },
      {
        onSuccess: () =>
          toast.success("已同步当前分支", {
            description: "已执行 fast-forward pull 后 push。",
          }),
        onError: (err) =>
          toast.error("同步失败", { description: err.message }),
      },
    );
  }, [rootId, sync]);

  const saveWorkspaceStash = React.useCallback(() => {
    saveStash.mutate(
      {
        rootId,
        message: `Tracevane workspace ${new Date().toISOString()}`,
        includeUntracked: true,
      },
      {
        onSuccess: () => {
          toast.success("已保存 Git Stash", {
            description: "包含未跟踪文件，稍后可从 Stash 列表恢复。",
          });
          void stashList.refetch();
        },
        onError: (err) =>
          toast.error("保存 Stash 失败", { description: err.message }),
      },
    );
  }, [rootId, saveStash, stashList]);

  const applyWorkspaceStash = React.useCallback(
    (entry: GitStashEntry) => {
      applyStash.mutate(
        { rootId, ref: entry.ref },
        {
          onSuccess: () => toast.success("已应用 Stash", { description: entry.ref }),
          onError: (err) =>
            toast.error("应用 Stash 失败", { description: err.message }),
        },
      );
    },
    [applyStash, rootId],
  );

  const popWorkspaceStash = React.useCallback(
    (entry: GitStashEntry) => {
      popStash.mutate(
        { rootId, ref: entry.ref },
        {
          onSuccess: () => {
            toast.success("已弹出 Stash", { description: entry.ref });
            void stashList.refetch();
          },
          onError: (err) =>
            toast.error("弹出 Stash 失败", { description: err.message }),
        },
      );
    },
    [popStash, rootId, stashList],
  );

  const requestDropWorkspaceStash = React.useCallback((entry: GitStashEntry) => {
    setStashDropTarget(entry);
  }, []);

  const confirmDropWorkspaceStash = React.useCallback(() => {
    if (!stashDropTarget) return;
    const entry = stashDropTarget;
    dropStash.mutate(
      { rootId, ref: entry.ref },
      {
        onSuccess: () => {
          toast.success("已删除 Stash", { description: entry.ref });
          setStashDropTarget(null);
          void stashList.refetch();
        },
        onError: (err) =>
          toast.error("删除 Stash 失败", { description: err.message }),
      },
    );
  }, [dropStash, rootId, stashDropTarget, stashList]);

  const stageAllChanges = React.useCallback(() => {
    handleStageFiles([...unstaged, ...untracked].map((change) => change.path));
  }, [handleStageFiles, unstaged, untracked]);

  const unstageAllChanges = React.useCallback(() => {
    handleUnstageFiles(staged.map((change) => change.path));
  }, [handleUnstageFiles, staged]);

  const stageSelectedChanges = React.useCallback(() => {
    handleStageFiles(selectedStageableChanges.map((change) => change.path));
  }, [handleStageFiles, selectedStageableChanges]);

  const unstageSelectedChanges = React.useCallback(() => {
    handleUnstageFiles(selectedStagedChanges.map((change) => change.path));
  }, [handleUnstageFiles, selectedStagedChanges]);

  const openGitChangeActions = React.useCallback((change: GitFileChange) => {
    setActiveChangePath(change.path);
    setMenu({
      x: Math.max(16, window.innerWidth - 260),
      y: 96,
      change,
    });
  }, []);

  const openGitCommitActions = React.useCallback((commit: GitCommitSummary) => {
    setActiveCommitHash(commit.hash);
    setCommitMenu({
      x: Math.max(16, window.innerWidth - 260),
      y: 96,
      commit,
    });
  }, []);

  const openGitBranchActions = React.useCallback((target: GitBranchSummary) => {
    setActiveBranchName(target.name);
    setBranchMenu({
      x: Math.max(16, window.innerWidth - 260),
      y: 88,
      branch: target,
    });
  }, []);

  const gitCommands = React.useMemo(
    () =>
      createGitPanelCommands({
        branch,
        upstream,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        branches,
        commits,
        pending:
          stage.isPending ||
          unstage.isPending ||
          checkout.isPending ||
          createBranch.isPending ||
          publish.isPending ||
          pull.isPending ||
          push.isPending ||
          sync.isPending ||
          commit.isPending,
        commitMessage: messageTrim,
        canCommit,
        activeChange,
        activeCommit,
        activeBranch,
        openActiveChangeActions: openGitChangeActions,
        openActiveCommitActions: openGitCommitActions,
        openActiveBranchActions: openGitBranchActions,
        refreshStatus,
        stageFiles: handleStageFiles,
        unstageFiles: handleUnstageFiles,
        requestBranchSwitch,
        openCreateBranchDialog,
        copyBranch,
        copyCommitContext: copyGitCommitContext,
        copyCommitReleaseNote: (commit) =>
          copyGitCommitReleaseNote(commit, commitDetail.data),
        copyCommitDiffContext: (commit) =>
          copyGitCommitDiffContext(commit, commitDetail.data),
        copyRecentHistoryContext,
        publishCurrentBranch,
        pullCurrentBranch,
        pushCurrentBranch,
        syncCurrentBranch,
        openCommitDetails,
        explainStatus,
        generateCommitDraft: applyGeneratedCommitDraft,
        requestAiCommitDraft,
        canGenerateCommitDraft: hasStaged,
        stashCount: stashes.length,
        saveWorkspaceStash,
        commitStaged: handleCommit,
      }),
    [
      branch,
      upstream,
      ahead,
      behind,
      branches,
      activeChange,
      activeCommit,
      activeBranch,
      canCommit,
      checkout.isPending,
      commit.isPending,
      commits,
      createBranch.isPending,
      copyBranch,
      copyGitCommitContext,
      copyGitCommitReleaseNote,
      copyGitCommitDiffContext,
      commitDetail.data,
      copyRecentHistoryContext,
      publishCurrentBranch,
      pullCurrentBranch,
      pushCurrentBranch,
      syncCurrentBranch,
      openCommitDetails,
      openGitChangeActions,
      openGitCommitActions,
      openGitBranchActions,
      explainStatus,
      handleStageFiles,
      handleCommit,
      handleUnstageFiles,
      hasStaged,
      messageTrim,
      refreshStatus,
      requestBranchSwitch,
      openCreateBranchDialog,
      applyGeneratedCommitDraft,
      requestAiCommitDraft,
      saveWorkspaceStash,
      stashes.length,
      stage.isPending,
      staged,
      unstage.isPending,
      unstaged,
      untracked,
    ],
  );

  React.useEffect(() => {
    onCommandsChange?.(gitCommands);
    return () => onCommandsChange?.([]);
  }, [gitCommands, onCommandsChange]);

  // --- Render: states -------------------------------------------------------
  if (status.isLoading) {
    return (
      <PanelShell>
        <div className="grid gap-1.5 p-3">
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
        </div>
      </PanelShell>
    );
  }

  if (status.isError) {
    return (
      <PanelShell>
        <ErrorState
          className="px-2 py-6"
          title="无法加载 Git 状态"
          description={status.error?.message ?? "未知错误"}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => status.refetch()}
            >
              重试
            </Button>
          }
        />
      </PanelShell>
    );
  }

  if (!available) {
    return (
      <PanelShell>
        <EmptyState
          className="px-2 py-6"
          title="此目录不是 git 仓库"
          description={
            status.data?.message ??
            "可使用 git init 将当前目录初始化为仓库（本面板不会自动执行）。"
          }
          icon={<GitBranch />}
        />
      </PanelShell>
    );
  }

  // --- Render: main ---------------------------------------------------------
  return (
    <PanelShell scrollManaged>
      {/* Branch header */}
      <BranchHeader
        branch={branch}
        branches={branches}
        pending={checkout.isPending || createBranch.isPending}
        createDialogOpen={branchCreateDialogOpen}
        draftName={branchCreateDraft}
        createFrom={branchCreateFrom}
        onCreateDialogOpenChange={handleCreateBranchDialogOpenChange}
        onOpenCreateDialog={openCreateBranchDialog}
        onDraftNameChange={setBranchCreateDraft}
        onCheckout={requestBranchSwitch}
        onCreate={handleCreateBranch}
        onOpenBranchActions={openGitBranchActions}
      />
      <GitQuickActions
        branch={branch}
        stageableCount={unstaged.length + untracked.length}
        stagedCount={staged.length}
        stashCount={stashes.length}
        pending={
          stage.isPending ||
          unstage.isPending ||
          checkout.isPending ||
          createBranch.isPending ||
          publish.isPending ||
          pull.isPending ||
          push.isPending ||
          sync.isPending
        }
        upstream={upstream}
        ahead={ahead}
        behind={behind}
        onStageAll={stageAllChanges}
        onUnstageAll={unstageAllChanges}
        onSaveStash={saveWorkspaceStash}
        onCopyBranch={copyCurrentBranch}
        onExplainStatus={explainStatus}
        onPublish={publishCurrentBranch}
        onPull={pullCurrentBranch}
        onPush={pushCurrentBranch}
        onSync={syncCurrentBranch}
      />
      <GitStatusOverview
        clean={clean}
        upstream={upstream}
        ahead={ahead}
        behind={behind}
        stagedCount={staged.length}
        unstagedCount={unstaged.length}
        untrackedCount={untracked.length}
        conflictCount={conflicts.length}
      />
      <BranchSwitchConfirmDialog
        currentBranch={branch}
        targetBranch={branchSwitchTarget}
        dirtyCount={changes.length}
        conflictCount={conflicts.length}
        pending={checkout.isPending}
        onCancel={() => setBranchSwitchTarget(null)}
        onConfirm={confirmBranchSwitch}
      />
      <GitCommitDetailsPanel
        commit={selectedCommit}
        detail={commitDetail.data ?? null}
        loading={commitDetail.isLoading}
        error={commitDetail.isError ? commitDetail.error?.message : null}
        onClose={() => setSelectedCommit(null)}
        onCopyContext={copyGitCommitContext}
        onCopyReleaseNote={copyGitCommitReleaseNote}
        onCopyDiffContext={copyGitCommitDiffContext}
      />
      <GitChangeSelectionToolbar
        selectedCount={selectedChanges.length}
        stageableCount={selectedStageableChanges.length}
        stagedCount={selectedStagedChanges.length}
        pending={stage.isPending || unstage.isPending}
        onStageSelected={stageSelectedChanges}
        onUnstageSelected={unstageSelectedChanges}
        onClear={clearGitChangeSelection}
      />

      {/* Change groups */}
      <div
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        data-workspace-git-scrollport
      >
        <GitConflictPanel
          conflicts={conflicts}
          activePath={activeChangePath}
          onOpen={(change) => {
            setActiveChangePath(change.path);
            openDiffTarget(change);
          }}
          onOpenActions={openGitChangeActions}
          onCopyContext={copyConflictContext}
          onInsertPathToTerminal={insertGitChangePathToTerminal}
        />
        <ChangeGroup
          title="已暂存的更改"
          count={staged.length}
          selectedCount={stagedSelectedCount}
          emptyHint="没有已暂存的更改"
          onSelectAll={() => selectGitChangeGroup(staged)}
          onClearGroupSelection={() => clearGitChangeGroupSelection(staged)}
        >
          {staged.map((c) => (
            <ChangeRow
              key={`staged:${c.path}`}
              change={c}
              active={activeChangePath === c.path}
              selected={selectedChangePathSet.has(c.path)}
              onSelect={(event) => toggleGitChangeSelected(c, event)}
              onOpen={(event) => {
                selectGitChange(c, event);
                openDiffTarget(c);
              }}
              onContextMenu={(event) => {
                setActiveChangePath(c.path);
                setMenu({ x: event.clientX, y: event.clientY, change: c });
              }}
              onOpenActions={() => openGitChangeActions(c)}
              onUnstage={() => handleUnstage(c.path)}
              pending={unstage.isPending}
            />
          ))}
        </ChangeGroup>

        <ChangeGroup
          title="更改"
          count={unstaged.length}
          selectedCount={unstagedSelectedCount}
          emptyHint="没有未暂存的更改"
          onSelectAll={() => selectGitChangeGroup(unstaged)}
          onClearGroupSelection={() => clearGitChangeGroupSelection(unstaged)}
        >
          {unstaged.map((c) => (
            <ChangeRow
              key={`unstaged:${c.path}`}
              change={c}
              active={activeChangePath === c.path}
              selected={selectedChangePathSet.has(c.path)}
              onSelect={(event) => toggleGitChangeSelected(c, event)}
              onOpen={(event) => {
                selectGitChange(c, event);
                openDiffTarget(c);
              }}
              onContextMenu={(event) => {
                setActiveChangePath(c.path);
                setMenu({ x: event.clientX, y: event.clientY, change: c });
              }}
              onOpenActions={() => openGitChangeActions(c)}
              onStage={() => handleStage(c.path)}
              pending={stage.isPending}
            />
          ))}
        </ChangeGroup>

        <ChangeGroup
          title="未跟踪"
          count={untracked.length}
          selectedCount={untrackedSelectedCount}
          emptyHint="没有未跟踪的文件"
          onSelectAll={() => selectGitChangeGroup(untracked)}
          onClearGroupSelection={() => clearGitChangeGroupSelection(untracked)}
        >
          {untracked.map((c) => (
            <ChangeRow
              key={`untracked:${c.path}`}
              change={c}
              active={activeChangePath === c.path}
              selected={selectedChangePathSet.has(c.path)}
              onSelect={(event) => toggleGitChangeSelected(c, event)}
              onOpen={(event) => {
                selectGitChange(c, event);
                openDiffTarget(c);
              }}
              onContextMenu={(event) => {
                setActiveChangePath(c.path);
                setMenu({ x: event.clientX, y: event.clientY, change: c });
              }}
              onOpenActions={() => openGitChangeActions(c)}
              onStage={() => handleStage(c.path)}
              pending={stage.isPending}
            />
          ))}
        </ChangeGroup>

        <GitStashPanel
          stashes={stashes}
          loading={stashList.isLoading}
          pending={applyStash.isPending || popStash.isPending || dropStash.isPending}
          onApply={applyWorkspaceStash}
          onPop={popWorkspaceStash}
          onDrop={requestDropWorkspaceStash}
        />

        {/* Recent commits (evidence) */}
        {commits.length > 0 && (
          <div
            className="mt-2 border-t border-line px-3 py-2"
            data-workspace-git-history
          >
            <span className="text-2xs uppercase tracking-[.1em] text-subtle">
              最近提交
            </span>
            <div className="mt-1 grid gap-1">
              {commits.slice(0, 5).map((c) => (
                <GitCommitRow
                  key={c.hash}
                  commit={c}
                  active={activeCommitHash === c.hash}
                  touchActionSurface={touchActionSurface}
                  onOpenMenu={(event, commit) => {
                    event.preventDefault();
                    setActiveCommitHash(commit.hash);
                    setCommitMenu({
                      x: event.clientX,
                      y: event.clientY,
                      commit,
                    });
                  }}
                  onOpenDetails={(commit) => {
                    setActiveCommitHash(commit.hash);
                    openCommitDetails(commit);
                  }}
                  onOpenActions={openGitCommitActions}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {branchMenu && touchActionSurface ? (
        <GitBranchActionSheet
          branch={branchMenu.branch}
          actions={createGitBranchActions(branchMenu.branch, {
            checkoutBranch: (target) => requestBranchSwitch(target.name),
            createBranchFromRef,
            copyName: copyGitBranchName,
            copyContext: copyGitBranchContext,
          })}
          onActionComplete={() => setBranchMenu(null)}
          onClose={() => setBranchMenu(null)}
        />
      ) : branchMenu ? (
        <GitBranchContextMenu
          x={branchMenu.x}
          y={branchMenu.y}
          branch={branchMenu.branch}
          actions={createGitBranchActions(branchMenu.branch, {
            checkoutBranch: (target) => requestBranchSwitch(target.name),
            createBranchFromRef,
            copyName: copyGitBranchName,
            copyContext: copyGitBranchContext,
          })}
          onActionComplete={() => setBranchMenu(null)}
        />
      ) : null}

      {commitMenu && touchActionSurface ? (
        <GitCommitActionSheet
          commit={commitMenu.commit}
          actions={createGitCommitActions(commitMenu.commit, {
            openDetails: openCommitDetails,
            copyHash: (commit) =>
              void navigator.clipboard.writeText(commit.hash),
            copySubject: (commit) =>
              void navigator.clipboard.writeText(commit.subject),
            copyContext: (commit) =>
              void navigator.clipboard.writeText(
                formatGitCommitContext(commit),
              ),
            copyReleaseNote: (commit) => copyGitCommitReleaseNote(commit),
            explainCommit: copyGitCommitContext,
          })}
          onActionComplete={() => setCommitMenu(null)}
          onClose={() => setCommitMenu(null)}
        />
      ) : commitMenu ? (
        <GitCommitContextMenu
          x={commitMenu.x}
          y={commitMenu.y}
          commit={commitMenu.commit}
          actions={createGitCommitActions(commitMenu.commit, {
            openDetails: openCommitDetails,
            copyHash: (commit) =>
              void navigator.clipboard.writeText(commit.hash),
            copySubject: (commit) =>
              void navigator.clipboard.writeText(commit.subject),
            copyContext: (commit) =>
              void navigator.clipboard.writeText(
                formatGitCommitContext(commit),
              ),
            copyReleaseNote: (commit) => copyGitCommitReleaseNote(commit),
            explainCommit: copyGitCommitContext,
          })}
          onActionComplete={() => setCommitMenu(null)}
        />
      ) : null}

      {menu && touchActionSurface ? (
        <GitChangeActionSheet
          change={menu.change}
          actions={createGitChangeActions({
            change: menu.change,
            openDiff: openDiffTarget,
            openFile: onOpenFile,
            stageFile: !menu.change.staged ? handleStage : undefined,
            unstageFile: menu.change.staged ? handleUnstage : undefined,
            copyPath: (path) => copyGitChangePath(path, "absolute"),
            copyRelativePath: (path) => copyGitChangePath(path, "relative"),
            revealInExplorer: onRevealInExplorer,
            insertPathToTerminal: insertGitChangePathToTerminal,
            explainDiff: copyGitDiffContext,
          })}
          onActionComplete={() => setMenu(null)}
          onClose={() => setMenu(null)}
        />
      ) : menu ? (
        <GitChangeContextMenu
          x={menu.x}
          y={menu.y}
          change={menu.change}
          actions={createGitChangeActions({
            change: menu.change,
            openDiff: openDiffTarget,
            openFile: onOpenFile,
            stageFile: !menu.change.staged ? handleStage : undefined,
            unstageFile: menu.change.staged ? handleUnstage : undefined,
            copyPath: (path) => copyGitChangePath(path, "absolute"),
            copyRelativePath: (path) => copyGitChangePath(path, "relative"),
            revealInExplorer: onRevealInExplorer,
            insertPathToTerminal: insertGitChangePathToTerminal,
            explainDiff: copyGitDiffContext,
          })}
          onActionComplete={() => setMenu(null)}
        />
      ) : null}

      <GitStashDropConfirmDialog
        target={stashDropTarget}
        pending={dropStash.isPending}
        onCancel={() => setStashDropTarget(null)}
        onConfirm={confirmDropWorkspaceStash}
      />

      {/* Commit box */}
      <div className="shrink-0 border-t border-line bg-panel p-2.5">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="提交信息（输入后按 ⌘/Ctrl+Enter 提交）"
          rows={2}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleCommit();
            }
          }}
          className={cn(
            "w-full resize-none rounded-sm border border-line bg-panel-2 px-2 py-1.5 text-xs text-ink-strong outline-none",
            "placeholder:text-subtle",
            "focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]",
            "disabled:opacity-50",
          )}
          disabled={commit.isPending}
        />
        {hasStaged ? (
          <div
            className="mt-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-2xs text-muted"
            data-workspace-git-commit-draft-preview
          >
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-ink-strong">
              <GitCommitHorizontal className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">
                草稿依据：{commitDraftBasis.summary}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {commitDraftBasis.samples.map((sample) => (
                <span
                  key={sample}
                  className="max-w-full truncate rounded-full border border-line bg-panel px-2 py-0.5 font-mono"
                  title={sample}
                  data-workspace-git-commit-draft-sample
                >
                  {sample}
                </span>
              ))}
              {commitDraftBasis.moreCount > 0 ? (
                <span className="rounded-full border border-line bg-panel px-2 py-0.5">
                  +{commitDraftBasis.moreCount} more
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
          data-workspace-git-commit-draft-actions
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-2xs"
            disabled={!hasStaged || commit.isPending}
            onClick={applyGeneratedCommitDraft}
            data-workspace-git-generate-commit-draft
          >
            <GitCommitHorizontal className="size-3.5" />
            生成草稿
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-2xs"
            disabled={!hasStaged || commit.isPending}
            onClick={requestAiCommitDraft}
            data-workspace-git-ai-commit-draft
          >
            <Sparkles className="size-3.5" />
            AI 提交信息
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="ml-auto"
            disabled={!canCommit}
            onClick={handleCommit}
          >
            <Sparkles className="size-3.5" />
            提交
          </Button>
        </div>
        {!hasStaged && (
          <p className="mt-1 text-2xs text-subtle">暂无已暂存的更改</p>
        )}
      </div>
    </PanelShell>
  );
}

export default WorkspaceGitPanel;

type GitBranchActionId =
  | "git.branch.checkout"
  | "git.branch.createFrom"
  | "git.branch.copyName"
  | "git.branch.copyContext"
  | "git.branch.explain";

interface GitBranchAction {
  id: GitBranchActionId;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
  run: () => void;
}

function createGitBranchActions(
  branch: GitBranchSummary,
  handlers: {
    checkoutBranch: (branch: GitBranchSummary) => void;
    createBranchFromRef: (branch: GitBranchSummary) => void;
    copyName: (branch: GitBranchSummary) => void;
    copyContext: (branch: GitBranchSummary) => void;
  },
): GitBranchAction[] {
  return [
    {
      id: "git.branch.checkout",
      label: branch.current ? "当前分支" : "切换到此分支",
      shortcut: "Enter",
      icon: <GitBranch className="size-3.5" />,
      disabled: branch.current,
      run: () => handlers.checkoutBranch(branch),
    },
    {
      id: "git.branch.createFrom",
      label: "从此分支新建",
      shortcut: "Ctrl+Shift+B",
      icon: <Plus className="size-3.5" />,
      run: () => handlers.createBranchFromRef(branch),
    },
    {
      id: "git.branch.copyName",
      label: "复制分支名",
      shortcut: "Shift+Alt+C",
      icon: <Clipboard className="size-3.5" />,
      separatorBefore: true,
      run: () => handlers.copyName(branch),
    },
    {
      id: "git.branch.copyContext",
      label: "复制分支上下文",
      icon: <GitBranch className="size-3.5" />,
      run: () => handlers.copyContext(branch),
    },
    {
      id: "git.branch.explain",
      label: "AI 解释分支",
      icon: <Sparkles className="size-3.5" />,
      separatorBefore: true,
      run: () => handlers.copyContext(branch),
    },
  ];
}

type GitCommitActionId =
  | "git.commit.openDetails"
  | "git.commit.copyHash"
  | "git.commit.copySubject"
  | "git.commit.copyContext"
  | "git.commit.copyReleaseNote"
  | "git.commit.explain";

interface GitCommitAction {
  id: GitCommitActionId;
  label: string;
  icon: React.ReactNode;
  separatorBefore?: boolean;
  shortcut?: string;
  run: () => void;
}

function createGitCommitActions(
  commit: GitCommitSummary,
  handlers: {
    openDetails?: (commit: GitCommitSummary) => void;
    copyHash: (commit: GitCommitSummary) => void;
    copySubject: (commit: GitCommitSummary) => void;
    copyContext: (commit: GitCommitSummary) => void;
    copyReleaseNote?: (commit: GitCommitSummary) => void;
    explainCommit: (commit: GitCommitSummary) => void;
  },
): GitCommitAction[] {
  return [
    ...(handlers.openDetails
      ? [
          {
            id: "git.commit.openDetails" as const,
            label: "打开提交详情",
            shortcut: "Enter",
            icon: <GitCommitHorizontal className="size-3.5" />,
            run: () => handlers.openDetails?.(commit),
          },
        ]
      : []),
    {
      id: "git.commit.copyHash",
      label: "复制提交 ID",
      shortcut: "Shift+Alt+C",
      icon: <Clipboard className="size-3.5" />,
      run: () => handlers.copyHash(commit),
    },
    {
      id: "git.commit.copySubject",
      label: "复制提交信息",
      shortcut: "Ctrl+C",
      icon: <Clipboard className="size-3.5" />,
      run: () => handlers.copySubject(commit),
    },
    {
      id: "git.commit.copyContext",
      label: "复制提交上下文",
      shortcut: "Ctrl+K C",
      icon: <GitCommitHorizontal className="size-3.5" />,
      run: () => handlers.copyContext(commit),
    },
    ...(handlers.copyReleaseNote
      ? [
          {
            id: "git.commit.copyReleaseNote" as const,
            label: "复制变更日志条目",
            icon: <Sparkles className="size-3.5" />,
            run: () => handlers.copyReleaseNote?.(commit),
          },
        ]
      : []),
    {
      id: "git.commit.explain",
      label: "AI 解释提交",
      icon: <Sparkles className="size-3.5" />,
      separatorBefore: true,
      run: () => handlers.explainCommit(commit),
    },
  ];
}

function GitCommitDetailsPanel({
  commit,
  detail,
  loading,
  error,
  onClose,
  onCopyContext,
  onCopyReleaseNote,
  onCopyDiffContext,
}: {
  commit: GitCommitSummary | null;
  detail: GitCommitDetailPayload | null;
  loading: boolean;
  error: string | null | undefined;
  onClose: () => void;
  onCopyContext: (commit: GitCommitSummary) => void;
  onCopyReleaseNote: (
    commit: GitCommitSummary,
    detail?: GitCommitDetailPayload | null,
  ) => void;
  onCopyDiffContext: (
    commit: GitCommitSummary,
    detail?: GitCommitDetailPayload | null,
  ) => void;
}) {
  if (!commit) return null;
  return (
    <section
      className="shrink-0 border-b border-line bg-panel px-3 py-2"
      data-workspace-git-commit-details-panel
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <GitCommitHorizontal className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <code className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-2xs text-primary">
              {commit.shortHash}
            </code>
            <span className="min-w-0 truncate text-xs font-semibold text-ink-strong">
              {commit.subject || "无提交信息"}
            </span>
          </div>
          <div className="mt-1 grid gap-0.5 text-2xs text-subtle">
            <span className="truncate">
              {commit.authorName || "unknown"}
              {commit.authorEmail ? ` <${commit.authorEmail}>` : ""}
            </span>
            <span className="truncate">{commit.date || "无日期"}</span>
            {commit.refs ? (
              <span className="truncate">refs: {commit.refs}</span>
            ) : null}
            {detail?.parents?.length ? (
              <span className="truncate">
                parents: {detail.parents.join(", ")}
              </span>
            ) : null}
          </div>
          {loading ? (
            <div
              className="mt-2 text-2xs text-subtle"
              data-workspace-git-commit-details-loading
            >
              正在读取提交详情…
            </div>
          ) : error ? (
            <div
              className="mt-2 text-2xs text-red"
              data-workspace-git-commit-details-error
            >
              {error}
            </div>
          ) : (
            <div className="mt-2 grid gap-2">
              {detail?.body ? (
                <pre
                  className="max-h-24 overflow-auto whitespace-pre-wrap rounded border border-line bg-panel-2 px-2 py-1.5 text-2xs text-muted"
                  data-workspace-git-commit-details-body
                >
                  {detail.body}
                </pre>
              ) : null}
              {detail?.files?.length ? (
                <div
                  className="rounded border border-line bg-panel-2 px-2 py-1.5"
                  data-workspace-git-commit-details-files
                >
                  <div className="flex items-center justify-between gap-2 text-2xs text-subtle">
                    <span>变更文件 {detail.files.length}</span>
                    <span>
                      diff {detail.diff ? detail.diff.split(/\r?\n/).length : 0}{" "}
                      行
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detail.files.slice(0, 8).map((file) => (
                      <span
                        key={`${file.status}:${file.path}`}
                        className="max-w-full truncate rounded bg-panel px-1.5 py-0.5 font-mono text-2xs text-muted"
                        title={
                          file.previousPath
                            ? `${file.previousPath} → ${file.path}`
                            : file.path
                        }
                        data-workspace-git-commit-details-file
                      >
                        {file.status} {file.path}
                      </span>
                    ))}
                    {detail.files.length > 8 ? (
                      <span className="rounded bg-panel px-1.5 py-0.5 text-2xs text-subtle">
                        +{detail.files.length - 8}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {detail?.diff ? (
                <div
                  className="rounded border border-line bg-[#0b1020] text-white shadow-inner"
                  data-workspace-git-commit-details-diff
                  data-workspace-git-commit-details-diff-truncated={
                    detail.truncated ? "true" : "false"
                  }
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-1 text-2xs text-white/60">
                    <span>Diff 预览{detail.binary ? " · 含二进制" : ""}</span>
                    {detail.truncated ? <span>已截断</span> : null}
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-2 py-1.5 font-mono text-[10px] leading-relaxed text-white/80">
                    {detail.diff}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-2xs"
          onClick={() => onCopyReleaseNote(commit, detail)}
          data-workspace-git-commit-details-copy-release-note
        >
          <Sparkles className="size-3.5" />
          变更日志
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-2xs"
          onClick={() => onCopyDiffContext(commit, detail)}
          disabled={loading || Boolean(error)}
          data-workspace-git-commit-details-copy-diff-context
        >
          <FileDiff className="size-3.5" />
          Diff
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-2xs"
          onClick={() => onCopyContext(commit)}
          data-workspace-git-commit-details-copy-context
        >
          <Sparkles className="size-3.5" />
          AI 上下文
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClose}
          aria-label="关闭提交详情"
          title="关闭提交详情"
          data-workspace-git-commit-details-close
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </section>
  );
}

function groupGitSheetActions<T extends { separatorBefore?: boolean }>(
  actions: T[],
): T[][] {
  const groups: T[][] = [];
  for (const action of actions) {
    if (action.separatorBefore || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push(action);
  }
  return groups.filter((group) => group.length > 0);
}

function gitSheetActionHint(action: {
  id: string;
  disabled?: boolean;
}): string {
  if (action.disabled) return "当前状态不可用";
  if (action.id.includes("stage")) return "更新暂存区";
  if (action.id.includes("copy")) return "复制到剪贴板";
  if (action.id.includes("explain")) return "AI 上下文入口";
  if (action.id.includes("open")) return "打开详情视图";
  return "Git 触屏快捷操作";
}

function GitConflictPanel({
  conflicts,
  activePath,
  onOpen,
  onOpenActions,
  onCopyContext,
  onInsertPathToTerminal,
}: {
  conflicts: GitFileChange[];
  activePath: string | null;
  onOpen: (change: GitFileChange) => void;
  onOpenActions: (change: GitFileChange) => void;
  onCopyContext: () => void;
  onInsertPathToTerminal: (path: string) => void;
}) {
  if (conflicts.length === 0) return null;
  return (
    <section
      className="border-b border-red-line/60 bg-red-soft/45 px-3 py-2"
      data-workspace-git-conflict-panel
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-red" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-red">检测到 {conflicts.length} 个冲突文件</div>
          <div className="text-2xs text-red/80">优先解决冲突，再继续提交、切换分支或同步。</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-2xs text-red hover:text-red"
          onClick={onCopyContext}
          data-workspace-git-conflict-copy-context
        >
          <Sparkles className="size-3.5" />
          AI 上下文
        </Button>
      </div>
      <div className="mt-2 grid gap-1" data-workspace-git-conflict-list>
        {conflicts.slice(0, 6).map((change) => (
          <div
            key={`conflict:${change.path}`}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-md border border-red-line/60 bg-panel px-2 py-1.5 text-xs",
              activePath === change.path && "ring-1 ring-red/40",
            )}
            data-workspace-git-conflict-row
          >
            <span className="rounded bg-red-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-red">
              {change.status || "UU"}
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left font-mono text-ink-strong outline-none hover:text-red focus-visible:shadow-[var(--ring)]"
              title={change.path}
              onClick={() => onOpen(change)}
              data-workspace-git-conflict-open
            >
              {change.path}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-2xs"
              onClick={() => onInsertPathToTerminal(change.path)}
              data-workspace-git-conflict-insert-terminal
            >
              终端
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => onOpenActions(change)}
              aria-label={`更多冲突操作 ${change.path}`}
              data-workspace-git-conflict-more
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </div>
        ))}
        {conflicts.length > 6 ? (
          <div className="text-2xs text-red/75">还有 {conflicts.length - 6} 个冲突，可通过下方变更列表继续处理。</div>
        ) : null}
      </div>
    </section>
  );
}

function GitStashPanel({
  stashes,
  loading,
  pending,
  onApply,
  onPop,
  onDrop,
}: {
  stashes: GitStashEntry[];
  loading: boolean;
  pending: boolean;
  onApply: (entry: GitStashEntry) => void;
  onPop: (entry: GitStashEntry) => void;
  onDrop: (entry: GitStashEntry) => void;
}) {
  if (loading) {
    return (
      <div className="border-t border-line px-3 py-2 text-2xs text-subtle" data-workspace-git-stash-loading>
        正在读取 Stash…
      </div>
    );
  }
  if (stashes.length === 0) return null;
  return (
    <div className="mt-2 border-t border-line px-3 py-2" data-workspace-git-stash-panel>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs uppercase tracking-[.1em] text-subtle">Stash</span>
        <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 font-mono text-2xs text-subtle">
          {stashes.length}
        </span>
      </div>
      <div className="mt-1 grid gap-1">
        {stashes.slice(0, 4).map((entry) => (
          <div
            key={entry.ref}
            className="rounded-lg border border-line bg-panel-2 px-2 py-1.5"
            data-workspace-git-stash-row
          >
            <div className="flex min-w-0 items-center gap-2">
              <code className="shrink-0 rounded bg-panel px-1.5 py-0.5 font-mono text-2xs text-primary">
                {entry.ref}
              </code>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-strong" title={entry.message}>
                {entry.message || "Git stash"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-2xs"
                disabled={pending}
                onClick={() => onApply(entry)}
                data-workspace-git-stash-apply
              >
                应用
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-2xs"
                disabled={pending}
                onClick={() => onPop(entry)}
                data-workspace-git-stash-pop
              >
                弹出
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-2xs text-red hover:text-red"
                disabled={pending}
                onClick={() => onDrop(entry)}
                data-workspace-git-stash-drop
              >
                删除
              </Button>
              {entry.branch ? (
                <span className="ml-auto min-w-0 truncate text-2xs text-subtle" title={entry.branch}>
                  {entry.branch}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {stashes.length > 4 ? (
          <div className="text-2xs text-subtle">还有 {stashes.length - 4} 个 stash，可后续在完整 Git 管理器中展开。</div>
        ) : null}
      </div>
    </div>
  );
}

function GitStashDropConfirmDialog({
  target,
  pending,
  onCancel,
  onConfirm,
}: {
  target: GitStashEntry | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent className="max-w-md" data-workspace-git-stash-drop-dialog>
        <DialogHeader>
          <DialogTitle>删除 Git Stash？</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm text-muted">
          <p>
            <code>git stash drop</code> 会从 stash 列表移除这个临时快照。
            Tracevane 当前不会为 Stash 删除提供一键撤销。
          </p>
          {target ? (
            <div
              className="rounded-xl border border-red/25 bg-red/5 px-3 py-2"
              data-workspace-git-stash-drop-target
            >
              <div className="font-mono text-xs text-red">{target.ref}</div>
              <div className="mt-1 line-clamp-3 text-xs text-muted">
                {target.message || "Git stash"}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={!target || pending}
            data-workspace-git-stash-drop-confirm
          >
            {pending ? "删除中…" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GitCommitRow({
  commit,
  active,
  touchActionSurface,
  onOpenMenu,
  onOpenDetails,
  onOpenActions,
}: {
  commit: GitCommitSummary;
  active?: boolean;
  touchActionSurface: boolean;
  onOpenMenu: (event: React.MouseEvent, commit: GitCommitSummary) => void;
  onOpenDetails: (commit: GitCommitSummary) => void;
  onOpenActions: (commit: GitCommitSummary) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-muted hover:bg-panel-2",
        active && "bg-primary-soft/60 ring-1 ring-primary/20",
      )}
      data-workspace-git-commit-active={active ? "true" : undefined}
      onContextMenu={(event) => onOpenMenu(event, commit)}
      onDoubleClick={() => onOpenDetails(commit)}
      data-workspace-git-commit-row
    >
      <GitCommitHorizontal className="size-3.5 shrink-0 text-subtle" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left outline-none hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
        title={commit.subject}
        onClick={() => onOpenDetails(commit)}
        data-workspace-git-open-commit-details
      >
        {commit.subject}
      </button>
      <code className="shrink-0 font-mono text-2xs text-subtle">
        {commit.shortHash}
      </code>
      <button
        type="button"
        title="更多提交操作"
        aria-label={`更多提交操作 ${commit.shortHash}`}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-sm text-muted outline-none transition-colors",
          "hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]",
          !touchActionSurface && "md:opacity-0 md:group-hover:opacity-100",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onOpenActions(commit);
        }}
        data-workspace-git-commit-more
      >
        <MoreHorizontal className="size-3.5" />
      </button>
    </div>
  );
}

function GitBranchContextMenu({
  x,
  y,
  branch,
  actions,
  onActionComplete,
}: {
  x: number;
  y: number;
  branch: GitBranchSummary;
  actions: GitBranchAction[];
  onActionComplete: () => void;
}) {
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-56 max-h-[min(80vh,22rem)] overflow-y-auto rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={clampGitCommitMenuPosition(x, y, 248, 352)}
      data-workspace-git-branch-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <React.Fragment key={action.id}>
          {action.separatorBefore ? (
            <div className="my-1 h-px bg-line" />
          ) : null}
          <GitBranchMenuButton
            action={action}
            onActionComplete={onActionComplete}
          />
        </React.Fragment>
      ))}
      <div
        className="max-w-72 truncate px-2 py-1 font-mono text-2xs text-subtle"
        title={branch.name}
      >
        {branch.name}
      </div>
    </div>
  );
}

function GitTouchActionSheetShell({
  kind,
  title,
  subtitle,
  icon,
  closeLabel,
  onClose,
  scrollportDataAttr,
  children,
}: {
  kind: "branch" | "commit" | "change";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
  scrollportDataAttr: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[90]"
      data-workspace-git-touch-action-sheet
      data-workspace-git-branch-action-sheet={kind === "branch" ? "true" : undefined}
      data-workspace-git-commit-action-sheet={kind === "commit" ? "true" : undefined}
      data-workspace-git-action-sheet={kind === "change" ? "true" : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/25"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <section
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-0.75rem)] overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        data-workspace-git-touch-action-sheet-panel
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line" />
        <div className="flex min-w-0 items-start gap-3 border-b border-line px-4 py-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">
              {title}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-subtle">
              {subtitle}
            </div>
          </div>
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-2xl border border-line bg-panel-2 text-muted"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>
        <div
          className="max-h-[calc(100dvh-6.75rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          tabIndex={0}
          role="group"
          aria-label={title}
          data-workspace-git-touch-action-sheet-scrollport
          data-workspace-git-sheet-scrollport={scrollportDataAttr}
          data-workspace-git-branch-action-sheet-scrollport={kind === "branch" ? "true" : undefined}
          data-workspace-git-commit-action-sheet-scrollport={kind === "commit" ? "true" : undefined}
          data-workspace-git-action-sheet-scrollport={kind === "change" ? "true" : undefined}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

function GitBranchActionSheet({
  branch,
  actions,
  onActionComplete,
  onClose,
}: {
  branch: GitBranchSummary;
  actions: GitBranchAction[];
  onActionComplete: () => void;
  onClose: () => void;
}) {
  return (
    <GitTouchActionSheetShell
      kind="branch"
      title={`触屏分支操作 · ${branch.name}`}
      subtitle={
        branch.upstream ||
        branch.subject ||
        (branch.current ? "当前分支" : "本地分支")
      }
      icon={<GitBranch className="size-5" />}
      closeLabel="关闭 Git 分支操作面板"
      onClose={onClose}
      scrollportDataAttr="branch"
    >
      <div className="grid gap-3">
        {groupGitSheetActions(actions).map((group, groupIndex) => (
          <div
            key={`git-branch-sheet-group-${groupIndex}`}
            className="grid grid-cols-2 gap-2"
            data-git-branch-sheet-action-group={groupIndex}
          >
            {group.map((action) => (
              <GitTouchSheetActionButton
                key={action.id}
                action={action}
                dataAttr="branch"
                onActionComplete={onActionComplete}
              />
            ))}
          </div>
        ))}
      </div>
    </GitTouchActionSheetShell>
  );
}

function GitBranchMenuButton({
  action,
  onActionComplete,
}: {
  action: GitBranchAction;
  onActionComplete: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={"disabled" in action ? action.disabled : false}
      data-git-branch-action={action.id}
      aria-keyshortcuts={action.shortcut}
      onClick={() => {
        action.run();
        onActionComplete();
      }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {action.icon}
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {action.shortcut ? (
        <kbd
          className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
          data-git-branch-action-shortcut={action.id}
        >
          {action.shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function GitCommitContextMenu({
  x,
  y,
  commit,
  actions,
  onActionComplete,
}: {
  x: number;
  y: number;
  commit: GitCommitSummary;
  actions: GitCommitAction[];
  onActionComplete: () => void;
}) {
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-56 max-h-[min(80vh,24rem)] overflow-y-auto rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={clampGitCommitMenuPosition(x, y, 248, 384)}
      data-workspace-git-commit-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <React.Fragment key={action.id}>
          {action.separatorBefore ? (
            <div className="my-1 h-px bg-line" />
          ) : null}
          <GitCommitMenuButton
            action={action}
            onActionComplete={onActionComplete}
          />
        </React.Fragment>
      ))}
      <div
        className="max-w-72 truncate px-2 py-1 font-mono text-2xs text-subtle"
        title={commit.hash}
      >
        {commit.hash}
      </div>
    </div>
  );
}

function clampGitCommitMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): React.CSSProperties {
  if (typeof window === "undefined") {
    return { left: x, top: y };
  }
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}

function GitCommitActionSheet({
  commit,
  actions,
  onActionComplete,
  onClose,
}: {
  commit: GitCommitSummary;
  actions: GitCommitAction[];
  onActionComplete: () => void;
  onClose: () => void;
}) {
  return (
    <GitTouchActionSheetShell
      kind="commit"
      title={`触屏提交操作 · ${commit.shortHash}`}
      subtitle={commit.subject}
      icon={<GitCommitHorizontal className="size-5" />}
      closeLabel="关闭 Git 提交操作面板"
      onClose={onClose}
      scrollportDataAttr="commit"
    >
      <div className="grid gap-3">
        {groupGitSheetActions(actions).map((group, groupIndex) => (
          <div
            key={`git-commit-sheet-group-${groupIndex}`}
            className="grid grid-cols-2 gap-2"
            data-git-commit-sheet-action-group={groupIndex}
          >
            {group.map((action) => (
              <GitTouchSheetActionButton
                key={action.id}
                action={action}
                dataAttr="commit"
                onActionComplete={onActionComplete}
              />
            ))}
          </div>
        ))}
      </div>
    </GitTouchActionSheetShell>
  );
}

function GitCommitMenuButton({
  action,
  onActionComplete,
}: {
  action: GitCommitAction;
  onActionComplete: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-git-commit-action={action.id}
      aria-keyshortcuts={action.shortcut}
      onClick={() => {
        action.run();
        onActionComplete();
      }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
    >
      {action.icon}
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {action.shortcut ? (
        <kbd
          className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
          data-git-commit-action-shortcut={action.id}
        >
          {action.shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

interface GitStatusContextInput {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
  conflicts: GitFileChange[];
  clean: boolean;
}

function formatGitStatusContext({
  branch,
  upstream,
  ahead,
  behind,
  staged,
  unstaged,
  untracked,
  conflicts,
  clean,
}: GitStatusContextInput): string {
  const lines = [
    "@git status",
    `branch: ${branch || "HEAD"}`,
    upstream
      ? `upstream: ${upstream} (ahead ${ahead}, behind ${behind})`
      : "upstream: none",
    `state: ${clean ? "clean" : "dirty"}`,
    `counts: staged ${staged.length}, unstaged ${unstaged.length}, untracked ${untracked.length}, conflicts ${conflicts.length}`,
  ];
  const appendGroup = (label: string, items: GitFileChange[]) => {
    if (items.length === 0) return;
    lines.push(`${label}:`);
    for (const item of items.slice(0, 12)) {
      const previous = item.previousPath ? ` <- ${item.previousPath}` : "";
      lines.push(`- [${item.status || item.kind}] ${item.path}${previous}`);
    }
    if (items.length > 12) lines.push(`- ... ${items.length - 12} more`);
  };
  appendGroup("staged", staged);
  appendGroup("unstaged", unstaged);
  appendGroup("untracked", untracked);
  appendGroup("conflicts", conflicts);
  return lines.join("\n");
}

function formatGitConflictContext(branch: string, conflicts: GitFileChange[]): string {
  const lines = [
    "@git conflicts",
    `branch: ${branch || "HEAD"}`,
    `count: ${conflicts.length}`,
  ];
  for (const item of conflicts.slice(0, 20)) {
    const previous = item.previousPath ? ` <- ${item.previousPath}` : "";
    lines.push(`- [${item.status || item.kind}] ${item.path}${previous}`);
  }
  if (conflicts.length > 20) lines.push(`- ... ${conflicts.length - 20} more`);
  return lines.join("\n");
}

function formatGitAbsolutePath(
  repositoryRoot: string,
  changePath: string,
): string {
  const root = repositoryRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const relative = changePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!root) return relative;
  return `${root}/${relative}`.replace(/\/+/g, "/");
}

function shellQuoteGitPath(path: string): string {
  return `'${path.replace(/'/g, `'\''`)}'`;
}

function formatGitChangeContext(change: GitFileChange): string {
  return [
    "@git diff",
    `path: ${change.path}`,
    change.previousPath ? `previousPath: ${change.previousPath}` : "",
    `status: ${change.status || change.kind}`,
    `kind: ${change.kind}`,
    `staged: ${change.staged ? "yes" : "no"}`,
    `unstaged: ${change.unstaged ? "yes" : "no"}`,
    change.kind === "untracked"
      ? "scope: untracked file metadata"
      : "scope: file diff metadata",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeGitCommitFiles(
  detail?: GitCommitDetailPayload | null,
  limit = 8,
): string {
  if (!detail?.files?.length) return "";
  const summary = detail.files
    .slice(0, limit)
    .map((file) => `${file.status} ${file.path}`)
    .join(", ");
  return `${summary}${detail.files.length > limit ? `, +${detail.files.length - limit} more` : ""}`;
}

function formatGitCommitDiffContext(
  commit: GitCommitSummary,
  detail?: GitCommitDetailPayload | null,
): string {
  const fileSummary = summarizeGitCommitFiles(detail, 12);
  return [
    "@git commit-diff",
    `commit ${commit.hash}`,
    `short: ${commit.shortHash}`,
    `subject: ${commit.subject || ""}`,
    `author: ${commit.authorName || "unknown"}${
      commit.authorEmail ? ` <${commit.authorEmail}>` : ""
    }`,
    `date: ${commit.date || ""}`,
    detail?.parents?.length ? `parents: ${detail.parents.join(", ")}` : "",
    detail ? `filesCount: ${detail.files.length}` : "",
    fileSummary ? `files: ${fileSummary}` : "",
    detail?.binary ? "containsBinaryDiff: yes" : "containsBinaryDiff: no",
    detail?.truncated ? "diffTruncated: yes" : "diffTruncated: no",
    detail?.diff ? "diff:" : "diff: unavailable",
    detail?.diff || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGitCommitReleaseNote(
  commit: GitCommitSummary,
  detail?: GitCommitDetailPayload | null,
): string {
  const body = detail?.body?.trim();
  const fileSummary = summarizeGitCommitFiles(detail, 8);
  return [
    "@git release-note",
    `- ${commit.subject || "Untitled change"} (${commit.shortHash || commit.hash})`,
    body ? `details: ${body}` : "",
    fileSummary ? `files: ${fileSummary}` : "",
    `commit: ${commit.hash}`,
    `author: ${commit.authorName || "unknown"}${
      commit.authorEmail ? ` <${commit.authorEmail}>` : ""
    }`,
    `date: ${commit.date || ""}`,
    detail?.parents?.length ? `parents: ${detail.parents.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGitBranchContext(branch: GitBranchSummary): string {
  return [
    "@git branch",
    `name: ${branch.name}`,
    `current: ${branch.current ? "yes" : "no"}`,
    branch.upstream ? `upstream: ${branch.upstream}` : "upstream: none",
    branch.shortHash ? `head: ${branch.shortHash}` : "",
    branch.subject ? `subject: ${branch.subject}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGitRecentHistoryContext(
  branch: string,
  commits: GitCommitSummary[],
): string {
  const lines = [
    "@git history",
    `branch: ${branch || "HEAD"}`,
    `count: ${Math.min(commits.length, 10)}`,
  ];
  for (const commit of commits.slice(0, 10)) {
    lines.push(
      "",
      `commit ${commit.hash}`,
      `short: ${commit.shortHash}`,
      `subject: ${commit.subject || ""}`,
      `author: ${commit.authorName || "unknown"}${
        commit.authorEmail ? ` <${commit.authorEmail}>` : ""
      }`,
      `date: ${commit.date || ""}`,
      commit.refs ? `refs: ${commit.refs}` : "",
    );
  }
  return lines.filter(Boolean).join("\n");
}

function formatGitCommitContext(commit: GitCommitSummary): string {
  return [
    "@git commit",
    `commit ${commit.hash}`,
    `subject: ${commit.subject}`,
    `author: ${commit.authorName} <${commit.authorEmail}>`,
    `date: ${commit.date}`,
    commit.refs ? `refs: ${commit.refs}` : "",
  ]
    .filter(Boolean)
    .join(
      "\
",
    );
}

// ---------------------------------------------------------------------------
// PanelShell — shared outer chrome (header label)
// ---------------------------------------------------------------------------

function PanelShell({
  children,
  scrollManaged = false,
}: {
  children: React.ReactNode;
  scrollManaged?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col",
        scrollManaged && "h-full overflow-hidden",
      )}
      data-workspace-git-panel-shell={
        scrollManaged ? "scroll-managed" : "static"
      }
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2.5">
        <GitBranch className="size-3.5 text-muted" />
        <span className="text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
          源代码管理
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("tracevane:workspace-git-refresh"),
            )
          }
          aria-label="刷新 Git 状态"
          title="刷新 Git 状态"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </header>
      {children}
    </div>
  );
}

function BranchSwitchConfirmDialog({
  currentBranch,
  targetBranch,
  dirtyCount,
  conflictCount,
  pending,
  onCancel,
  onConfirm,
}: {
  currentBranch: string;
  targetBranch: GitBranchSummary | null;
  dirtyCount: number;
  conflictCount: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const open = Boolean(targetBranch);
  const targetName = targetBranch?.name ?? "";
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onCancel();
      }}
    >
      <DialogContent data-workspace-git-branch-switch-dialog>
        <DialogHeader>
          <DialogTitle>切换 Git 分支</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-3 text-sm text-ink">
            <p>
              将从
              <code className="mx-1 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-ink-strong">
                {currentBranch || "HEAD"}
              </code>
              切换到
              <code className="mx-1 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-ink-strong">
                {targetName || "—"}
              </code>
              。
            </p>
            {dirtyCount > 0 ? (
              <div
                className="rounded-lg border border-amber-line bg-amber-soft px-3 py-2 text-xs text-amber"
                data-workspace-git-branch-switch-dirty-warning
              >
                当前工作区还有 {dirtyCount} 个变更。Git
                通常会保留可安全迁移的本地修改；如果切换会导致本地修改丢失，后端
                Git 操作会拒绝切换。
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-line bg-emerald-soft px-3 py-2 text-xs text-emerald">
                当前工作区干净，可以安全尝试切换。
              </div>
            )}
            {conflictCount > 0 ? (
              <div
                className="rounded-lg border border-red-line bg-red-soft px-3 py-2 text-xs font-medium text-red"
                data-workspace-git-branch-switch-conflict-warning
              >
                检测到 {conflictCount} 个冲突文件，建议先解决冲突后再切换分支。
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!targetName || pending}
            onClick={onConfirm}
            data-workspace-git-confirm-branch-switch
          >
            {pending ? "切换中…" : "确认切换"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GitQuickActions({
  branch,
  stageableCount,
  stagedCount,
  stashCount,
  pending,
  upstream,
  ahead,
  behind,
  onStageAll,
  onUnstageAll,
  onSaveStash,
  onCopyBranch,
  onExplainStatus,
  onPublish,
  onPull,
  onPush,
  onSync,
}: {
  branch: string;
  stageableCount: number;
  stagedCount: number;
  stashCount: number;
  pending: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onSaveStash: () => void;
  onCopyBranch: () => void;
  onExplainStatus: () => void;
  onPublish: () => void;
  onPull: () => void;
  onPush: () => void;
  onSync: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const dirtyCount = stageableCount + stagedCount;
  const remoteDelta = ahead + behind;
  const primaryRemoteAction = upstream ? onSync : onPublish;
  const primaryRemoteDisabled = upstream
    ? pending || !upstream || remoteDelta === 0
    : pending || !branch || Boolean(upstream);
  const primaryRemoteTitle = upstream
    ? `同步 ${upstream}`
    : "发布到 origin 并设置 upstream";
  const primaryRemoteLabel = upstream ? "同步" : "发布";
  const primaryRemoteBadge = upstream ? `${ahead}/${behind}` : "";

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const runFromMenu = React.useCallback((action: () => void) => {
    action();
    setMenuOpen(false);
  }, []);

  return (
    <div
      className="shrink-0 border-b border-line bg-panel px-2.5 py-1.5"
      data-workspace-git-quick-actions
      data-workspace-git-quick-actions-density="compact-menu-v1"
    >
      <div className="flex min-w-0 items-center gap-1.5" data-workspace-git-quick-primary>
        <div className="min-w-0 flex-1 text-2xs text-muted" data-workspace-git-quick-summary>
          <span className="font-medium text-ink-strong">{dirtyCount}</span> 变更
          <span className="mx-1 text-subtle">·</span>
          <span className="font-medium text-ink-strong">{stashCount}</span> stash
          {upstream ? (
            <>
              <span className="mx-1 text-subtle">·</span>
              <span className="font-mono" title={upstream}>
                ↑{ahead} ↓{behind}
              </span>
            </>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-2xs"
          disabled={pending || stageableCount === 0}
          onClick={onStageAll}
          data-workspace-git-stage-all
          title="暂存全部可暂存文件"
        >
          <Plus className="size-3.5" />
          暂存
          <span className="font-mono text-subtle">{stageableCount}</span>
        </Button>
        <Button
          type="button"
          variant={upstream && remoteDelta > 0 ? "primary" : "ghost"}
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-2xs"
          disabled={primaryRemoteDisabled}
          onClick={primaryRemoteAction}
          title={primaryRemoteTitle}
          data-workspace-git-primary-remote-action={upstream ? "sync" : "publish"}
          data-workspace-git-publish={!upstream ? "primary" : undefined}
          data-workspace-git-sync={upstream ? "primary" : undefined}
        >
          {upstream ? <Repeat2 className="size-3.5" /> : <UploadCloud className="size-3.5" />}
          {primaryRemoteLabel}
          {primaryRemoteBadge ? (
            <span className="font-mono text-subtle">{primaryRemoteBadge}</span>
          ) : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => onExplainStatus()}
          title="复制 Git 审查上下文"
          aria-label="复制 Git 审查上下文"
          data-workspace-git-explain-status
        >
          <Sparkles className="size-3.5" />
        </Button>
        <div className="relative shrink-0" ref={menuRef}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="更多 Git 操作"
            title="更多 Git 操作"
            data-workspace-git-quick-more
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-8 z-50 max-h-[min(72dvh,22rem)] w-56 overflow-y-auto overscroll-contain rounded-xl border border-line bg-popover p-1.5 shadow-xl"
              role="menu"
              data-workspace-git-quick-menu
              data-workspace-git-quick-menu-scrollport
            >
              <GitQuickMenuButton
                icon={<Plus className="size-3.5" />}
                label="暂存全部"
                badge={String(stageableCount)}
                disabled={pending || stageableCount === 0}
                onClick={() => runFromMenu(onStageAll)}
                dataAttr="stage-all"
              />
              <GitQuickMenuButton
                icon={<Minus className="size-3.5" />}
                label="取消全部暂存"
                badge={String(stagedCount)}
                disabled={pending || stagedCount === 0}
                onClick={() => runFromMenu(onUnstageAll)}
                dataAttr="unstage-all"
              />
              <GitQuickMenuButton
                icon={<Clipboard className="size-3.5" />}
                label="保存 Stash"
                badge={String(stashCount)}
                disabled={pending || dirtyCount === 0}
                onClick={() => runFromMenu(onSaveStash)}
                dataAttr="stash-save"
              />
              <div className="my-1 h-px bg-line" />
              <GitQuickMenuButton
                icon={<UploadCloud className="size-3.5" />}
                label="发布当前分支"
                disabled={pending || !branch || Boolean(upstream)}
                onClick={() => runFromMenu(onPublish)}
                dataAttr="publish"
              />
              <GitQuickMenuButton
                icon={<DownloadCloud className="size-3.5" />}
                label="拉取"
                badge={String(behind)}
                disabled={pending || !upstream || behind === 0}
                onClick={() => runFromMenu(onPull)}
                dataAttr="pull"
              />
              <GitQuickMenuButton
                icon={<UploadCloud className="size-3.5" />}
                label="推送"
                badge={String(ahead)}
                disabled={pending || !upstream || ahead === 0}
                onClick={() => runFromMenu(onPush)}
                dataAttr="push"
              />
              <GitQuickMenuButton
                icon={<Repeat2 className="size-3.5" />}
                label="同步"
                badge={`${ahead}/${behind}`}
                disabled={pending || !upstream || remoteDelta === 0}
                onClick={() => runFromMenu(onSync)}
                dataAttr="sync"
              />
              <div className="my-1 h-px bg-line" />
              <GitQuickMenuButton
                icon={<Clipboard className="size-3.5" />}
                label="复制当前分支"
                disabled={!branch}
                onClick={() => runFromMenu(onCopyBranch)}
                dataAttr="copy-branch"
              />
              <GitQuickMenuButton
                icon={<Sparkles className="size-3.5" />}
                label="复制 Git 审查上下文"
                onClick={() => runFromMenu(onExplainStatus)}
                dataAttr="explain-status"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GitQuickMenuButton({
  icon,
  label,
  badge,
  disabled = false,
  onClick,
  dataAttr,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
  dataAttr: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-ink-strong outline-none transition-colors hover:bg-panel-3 focus-visible:shadow-[var(--ring)] disabled:pointer-events-none disabled:opacity-45"
      data-workspace-git-quick-menu-action={dataAttr}
    >
      <span className="grid size-5 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full bg-panel-3 px-1.5 font-mono text-2xs text-subtle">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BranchHeader — current branch + switcher + new-branch action
// ---------------------------------------------------------------------------

interface BranchHeaderProps {
  branch: string;
  branches: GitBranchSummary[];
  pending: boolean;
  createDialogOpen: boolean;
  draftName: string;
  createFrom: GitBranchSummary | null;
  onCreateDialogOpenChange: (open: boolean) => void;
  onOpenCreateDialog: () => void;
  onDraftNameChange: (name: string) => void;
  onCheckout: (target: string) => void;
  onCreate: (name: string) => void;
  onOpenBranchActions: (branch: GitBranchSummary) => void;
}

function BranchHeader({
  branch,
  branches,
  pending,
  createDialogOpen,
  draftName,
  createFrom,
  onCreateDialogOpenChange,
  onOpenCreateDialog,
  onDraftNameChange,
  onCheckout,
  onCreate,
  onOpenBranchActions,
}: BranchHeaderProps) {
  const submitCreate = () => {
    const name = draftName.trim();
    if (!name) return;
    onCreate(name);
  };

  return (
    <div className="shrink-0 border-b border-line bg-panel px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <select
          value={branch}
          disabled={pending || branches.length === 0}
          onChange={(e) => onCheckout(e.target.value)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-sm border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-ink-strong outline-none",
            "focus-visible:shadow-[var(--ring)]",
            pending && "opacity-60",
          )}
          title={branch || "（无分支）"}
          aria-label="切换 Git 分支"
          data-workspace-git-branch-switcher
        >
          {branches.length === 0 ? (
            <option value={branch}>{branch || "—"}</option>
          ) : (
            branches.map((b) => (
              <option
                key={b.name}
                value={b.name}
                disabled={b.current}
                data-workspace-git-branch-current={b.current ? "true" : "false"}
              >
                {b.name}
                {b.current ? " ✓ 当前" : ""}
              </option>
            ))
          )}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={!branch}
          onClick={() => {
            const current = branches.find((candidate) => candidate.current) ?? {
              name: branch,
              current: true,
              upstream: null,
              shortHash: "",
              subject: "",
            };
            onOpenBranchActions(current);
          }}
          title="当前分支操作"
          aria-label="当前分支操作"
          data-workspace-git-branch-more
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-2xs"
          disabled={pending}
          onClick={onOpenCreateDialog}
          title="从当前 HEAD 新建分支"
        >
          <GitBranch className="size-3.5" />
          新建分支
        </Button>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建分支</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <label className="grid gap-1.5 text-sm text-ink-strong">
              分支名称
              <Input
                value={draftName}
                autoFocus
                placeholder="例如：feature/my-branch"
                onChange={(e) => onDraftNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
              />
            </label>
            <p
              className="mt-2 text-2xs text-subtle"
              data-workspace-git-branch-create-from={
                createFrom?.name || branch || "HEAD"
              }
            >
              {createFrom
                ? `将从 ${createFrom.name} 创建并切换到新分支。`
                : `将从当前 HEAD (${branch || "—"}) 创建并切换到新分支。`}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCreateDialogOpenChange(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!draftName.trim() || pending}
              onClick={submitCreate}
            >
              创建并切换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GitStatusOverview({
  clean,
  upstream,
  ahead,
  behind,
  stagedCount,
  unstagedCount,
  untrackedCount,
  conflictCount,
}: {
  clean: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictCount: number;
}) {
  const dirtyCount = stagedCount + unstagedCount + untrackedCount;
  return (
    <div
      className="shrink-0 border-b border-line bg-panel-2 px-2.5 py-2"
      data-workspace-git-status-overview
    >
      <div className="flex flex-wrap items-center gap-1.5 text-2xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
            clean
              ? "border-emerald-line bg-emerald-soft text-emerald"
              : "border-amber-line bg-amber-soft text-amber",
          )}
          data-workspace-git-clean-state={clean ? "clean" : "dirty"}
        >
          {clean ? (
            <CheckCircle2 className="size-3" />
          ) : (
            <FileDiff className="size-3" />
          )}
          {clean ? "干净" : `${dirtyCount} 个变更`}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-muted">
          暂存 {stagedCount}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-muted">
          未暂存 {unstagedCount}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-muted">
          未跟踪 {untrackedCount}
        </span>
        {upstream ? (
          <span
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-muted"
            title={upstream}
            data-workspace-git-upstream
          >
            <span className="truncate">{upstream}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="font-sans text-subtle">
                ↑{ahead} ↓{behind}
              </span>
            )}
          </span>
        ) : null}
        {conflictCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-red-line bg-red-soft px-2 py-0.5 font-semibold text-red"
            data-workspace-git-conflict-warning
          >
            <AlertTriangle className="size-3" />
            冲突 {conflictCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GitChangeSelectionToolbar({
  selectedCount,
  stageableCount,
  stagedCount,
  pending,
  onStageSelected,
  onUnstageSelected,
  onClear,
}: {
  selectedCount: number;
  stageableCount: number;
  stagedCount: number;
  pending: boolean;
  onStageSelected: () => void;
  onUnstageSelected: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div
      className="shrink-0 border-b border-primary/20 bg-primary-soft/50 px-2.5 py-1.5"
      data-workspace-git-selection-toolbar
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-2xs font-medium text-primary">
          已选 {selectedCount} 项
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-2xs"
          disabled={pending || stageableCount === 0}
          onClick={onStageSelected}
          data-workspace-git-stage-selected
        >
          <Plus className="size-3.5" />
          暂存
          <span className="font-mono text-subtle">{stageableCount}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-2xs"
          disabled={pending || stagedCount === 0}
          onClick={onUnstageSelected}
          data-workspace-git-unstage-selected
        >
          <Minus className="size-3.5" />
          取消暂存
          <span className="font-mono text-subtle">{stagedCount}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClear}
          aria-label="清除 Git 变更选择"
          title="清除选择"
          data-workspace-git-clear-selection
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChangeGroup — section header with count + children
// ---------------------------------------------------------------------------

interface ChangeGroupProps {
  title: string;
  count: number;
  selectedCount?: number;
  emptyHint: string;
  children: React.ReactNode;
  onSelectAll?: () => void;
  onClearGroupSelection?: () => void;
}

function ChangeGroup({
  title,
  count,
  selectedCount = 0,
  emptyHint,
  children,
  onSelectAll,
  onClearGroupSelection,
}: ChangeGroupProps) {
  const allSelected = count > 0 && selectedCount === count;
  const partiallySelected = selectedCount > 0 && !allSelected;
  const canSelectGroup = count > 0 && onSelectAll && onClearGroupSelection;

  return (
    <section className="border-b border-line py-1.5">
      <div className="flex items-center gap-1.5 px-2.5 py-1">
        {canSelectGroup ? (
          <button
            type="button"
            className="grid size-5 shrink-0 place-items-center rounded-sm text-muted outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)]"
            aria-label={`${allSelected ? "取消选择" : "选择"}${title}分组`}
            aria-pressed={allSelected}
            onClick={() => {
              if (allSelected) onClearGroupSelection();
              else onSelectAll();
            }}
            data-workspace-git-change-group-select
            data-workspace-git-change-group-selected={allSelected ? "true" : undefined}
          >
            <span
              className={cn(
                "grid size-3.5 place-items-center rounded-[4px] border border-line bg-panel text-[8px] leading-none",
                (allSelected || partiallySelected) && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {allSelected ? "" : partiallySelected ? "–" : ""}
            </span>
          </button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-2xs font-semibold uppercase tracking-[.08em] text-subtle">
          {title}
        </span>
        {selectedCount > 0 ? (
          <span
            className="rounded-full bg-primary-soft px-1.5 text-2xs font-medium text-primary"
            data-workspace-git-change-group-selected-count
          >
            {selectedCount}/{count}
          </span>
        ) : null}
        <span className="rounded-full bg-panel-3 px-1.5 text-2xs text-muted">
          {count}
        </span>
      </div>
      <div className="grid gap-0.5 px-1">
        {count === 0 ? (
          <p className="px-2 py-1.5 text-2xs text-subtle">{emptyHint}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ChangeRow — one changed file
// ---------------------------------------------------------------------------

interface ChangeRowProps {
  change: GitFileChange;
  active?: boolean;
  selected?: boolean;
  onOpen: (event?: React.MouseEvent | React.KeyboardEvent) => void;
  onSelect?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onOpenActions?: () => void;
  pending: boolean;
}

function ChangeRow({
  change,
  active = false,
  selected = false,
  onOpen,
  onSelect,
  onStage,
  onUnstage,
  onContextMenu,
  onOpenActions,
  pending,
}: ChangeRowProps) {
  const t = changeTone(change.kind);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => onOpen(event)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(e);
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left outline-none transition-colors",
        "focus-visible:shadow-[var(--ring)]",
        "hover:bg-panel-2",
        active && "bg-primary-soft/60 ring-1 ring-primary/20",
        selected && "bg-primary-soft/40",
      )}
      data-workspace-git-change-active={active ? "true" : undefined}
      data-workspace-git-change-selected={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="grid size-5 shrink-0 place-items-center rounded-sm text-muted outline-none hover:bg-panel focus-visible:shadow-[var(--ring)]"
        aria-label={`${selected ? "取消选择" : "选择"} ${change.path}`}
        aria-pressed={selected}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(event);
        }}
        data-workspace-git-change-select
      >
        <span
          className={cn(
            "size-3.5 rounded-[4px] border border-line bg-panel",
            selected && "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--panel)]",
          )}
        />
      </button>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-[5px] [&_svg]:size-3",
          t.toneClass,
        )}
        title={t.label}
      >
        <FileDiff />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-strong">
        {change.path}
      </span>
      <span className="shrink-0 text-2xs font-semibold uppercase text-subtle">
        {t.code}
      </span>
      {onStage && (
        <button
          type="button"
          title="暂存此文件"
          aria-label={`暂存 ${change.path}`}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            onStage();
          }}
          className={cn(
            "grid size-5 place-items-center rounded-sm text-muted outline-none transition-colors",
            "hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]",
            "disabled:opacity-50",
            "opacity-0 group-hover:opacity-100",
          )}
        >
          <Plus className="size-3.5" />
        </button>
      )}
      {onUnstage && (
        <button
          type="button"
          title="取消暂存此文件"
          aria-label={`取消暂存 ${change.path}`}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            onUnstage();
          }}
          className={cn(
            "grid size-5 place-items-center rounded-sm text-muted outline-none transition-colors",
            "hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]",
            "disabled:opacity-50",
            "opacity-0 group-hover:opacity-100",
          )}
        >
          <Minus className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        title="更多 Git 操作"
        aria-label={`更多 Git 操作 ${change.path}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenActions?.();
        }}
        className={cn(
          "grid size-6 place-items-center rounded-sm text-muted outline-none transition-colors",
          "hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]",
          "md:opacity-0 md:group-hover:opacity-100",
        )}
        data-workspace-git-change-more
      >
        <MoreHorizontal className="size-3.5" />
      </button>
    </div>
  );
}

function GitChangeContextMenu({
  x,
  y,
  change,
  actions,
  onActionComplete,
}: {
  x: number;
  y: number;
  change: GitFileChange;
  actions: GitChangeAction[];
  onActionComplete: () => void;
}) {
  return (
    <div
      role="menu"
      className="fixed z-50 max-h-[min(80vh,26rem)] min-w-52 overflow-y-auto rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={clampGitChangeMenuPosition(x, y, 248, 416)}
      data-workspace-git-change-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <React.Fragment key={action.id}>
          {action.separatorBefore ? (
            <div className="my-1 h-px bg-line" />
          ) : null}
          <GitMenuButton action={action} onActionComplete={onActionComplete} />
        </React.Fragment>
      ))}
      <div
        className="max-w-64 truncate px-2 py-1 font-mono text-2xs text-subtle"
        title={change.path}
      >
        {change.path}
      </div>
    </div>
  );
}

function clampGitChangeMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): React.CSSProperties {
  if (typeof window === "undefined") return { left: x, top: y };
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}

function GitChangeActionSheet({
  change,
  actions,
  onActionComplete,
  onClose,
}: {
  change: GitFileChange;
  actions: GitChangeAction[];
  onActionComplete: () => void;
  onClose: () => void;
}) {
  const t = changeTone(change.kind);
  return (
    <GitTouchActionSheetShell
      kind="change"
      title={`触屏 Git 操作 · ${t.label}`}
      subtitle={change.path}
      icon={<FileDiff className="size-5" />}
      closeLabel="关闭 Git 操作面板"
      onClose={onClose}
      scrollportDataAttr="change"
    >
      <div className="grid gap-3">
        {groupGitSheetActions(actions).map((group, groupIndex) => (
          <div
            key={`git-change-sheet-group-${groupIndex}`}
            className="grid grid-cols-2 gap-2"
            data-git-change-sheet-action-group={groupIndex}
          >
            {group.map((action) => (
              <GitTouchSheetActionButton
                key={action.id}
                action={action}
                dataAttr="change"
                onActionComplete={onActionComplete}
              />
            ))}
          </div>
        ))}
      </div>
    </GitTouchActionSheetShell>
  );
}

function GitTouchSheetActionButton({
  action,
  dataAttr,
  onActionComplete,
}: {
  action: GitBranchAction | GitCommitAction | GitChangeAction;
  dataAttr: "branch" | "commit" | "change";
  onActionComplete: () => void;
}) {
  return (
    <button
      type="button"
      disabled={"disabled" in action ? action.disabled : false}
      className="min-h-16 rounded-2xl border border-line bg-panel-2 px-3 py-3 text-left text-ink shadow-sm outline-none transition active:scale-[.98] hover:border-primary/30 hover:bg-primary-soft/50 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:text-muted"
      onClick={() => {
        action.run();
        onActionComplete();
      }}
      data-git-branch-sheet-action={dataAttr === "branch" ? action.id : undefined}
      data-git-commit-sheet-action={dataAttr === "commit" ? action.id : undefined}
      data-git-change-sheet-action={dataAttr === "change" ? action.id : undefined}
      aria-keyshortcuts={action.shortcut}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {action.icon}
        <span className="min-w-0 truncate">{action.label}</span>
        {action.shortcut ? (
          <kbd
            className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
            data-git-branch-sheet-shortcut={dataAttr === "branch" ? action.id : undefined}
            data-git-commit-sheet-shortcut={dataAttr === "commit" ? action.id : undefined}
            data-git-change-sheet-shortcut={dataAttr === "change" ? action.id : undefined}
          >
            {action.shortcut}
          </kbd>
        ) : null}
      </span>
      <span className="mt-1 block truncate text-[11px] text-subtle">
        {gitSheetActionHint(action)}
      </span>
    </button>
  );
}

function GitMenuButton({
  action,
  onActionComplete,
}: {
  action: GitChangeAction;
  onActionComplete: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={"disabled" in action ? action.disabled : false}
      data-git-change-action={action.id}
      aria-keyshortcuts={action.shortcut}
      onClick={() => {
        action.run();
        onActionComplete();
      }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {action.icon}
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {action.shortcut ? (
        <kbd
          className="ml-auto shrink-0 rounded border border-line bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle"
          data-git-change-action-shortcut={action.id}
        >
          {action.shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function useGitTouchActionSurface(): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(pointer: coarse), (max-width: 768px)");
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return matches;
}

// ---------------------------------------------------------------------------
// generateGitCommitDraft — compact local draft until Gateway AI is wired
// ---------------------------------------------------------------------------

function buildGitCommitDraftBasis(changes: GitFileChange[]): {
  summary: string;
  samples: string[];
  moreCount: number;
} {
  const samples = changes
    .slice(0, 4)
    .map((change) => describeGitChange(change));
  const kindCounts = changes.reduce(
    (acc, change) => {
      const tone = changeTone(change.kind);
      acc[tone.label] = (acc[tone.label] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const summary = Object.entries(kindCounts)
    .map(([label, count]) => `${label} ${count}`)
    .join(" · ");
  return {
    summary: summary || "暂无已暂存文件",
    samples,
    moreCount: Math.max(0, changes.length - samples.length),
  };
}

function generateGitCommitDraft(changes: GitFileChange[]): string {
  const visible = changes.slice(0, 6);
  const summary = summarizeGitCommitDraft(changes);
  const bullets = visible.map((change) => `- ${describeGitChange(change)}`);
  if (changes.length > visible.length) {
    bullets.push(`- ... and ${changes.length - visible.length} more`);
  }
  return [summary, "", ...bullets].join("\n");
}

function summarizeGitCommitDraft(changes: GitFileChange[]): string {
  if (changes.length === 0) return "Update workspace changes";
  const counts = changes.reduce(
    (acc, change) => {
      acc[change.kind] = (acc[change.kind] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<GitFileChangeKind, number>>,
  );
  const dominantKind = Object.entries(counts).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] as GitFileChangeKind | undefined;
  const target =
    changes.length === 1
      ? shortGitPath(changes[0]?.path ?? "file")
      : `${changes.length} files`;
  switch (dominantKind) {
    case "added":
    case "untracked":
      return `Add ${target}`;
    case "deleted":
      return `Remove ${target}`;
    case "renamed":
      return `Rename ${target}`;
    case "copied":
      return `Copy ${target}`;
    case "conflicted":
      return `Resolve conflicts in ${target}`;
    case "modified":
    default:
      return `Update ${target}`;
  }
}

function describeGitChange(change: GitFileChange): string {
  if (change.kind === "renamed" && change.previousPath) {
    return [
      "Rename",
      shortGitPath(change.previousPath),
      "to",
      shortGitPath(change.path),
    ].join(" ");
  }
  return `${gitChangeKindVerb(change.kind)} ${shortGitPath(change.path)}`;
}

function gitChangeKindVerb(kind: GitFileChangeKind): string {
  switch (kind) {
    case "added":
    case "untracked":
      return "Add";
    case "deleted":
      return "Remove";
    case "renamed":
      return "Rename";
    case "copied":
      return "Copy";
    case "conflicted":
      return "Resolve conflict in";
    case "modified":
    default:
      return "Update";
  }
}

function shortGitPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

// ---------------------------------------------------------------------------
// changeTone — short label + tone for a change kind (SCM-style M/A/D/U codes)
// ---------------------------------------------------------------------------

function changeTone(kind: GitFileChangeKind): {
  code: string;
  label: string;
  toneClass: string;
} {
  switch (kind) {
    case "added":
      return {
        code: "A",
        label: "新增",
        toneClass: "bg-green-soft text-green",
      };
    case "modified":
      return {
        code: "M",
        label: "修改",
        toneClass: "bg-amber-soft text-amber",
      };
    case "deleted":
      return {
        code: "D",
        label: "删除",
        toneClass: "bg-red-soft text-red",
      };
    case "renamed":
      return {
        code: "R",
        label: "重命名",
        toneClass: "bg-primary-soft text-primary",
      };
    case "copied":
      return {
        code: "C",
        label: "复制",
        toneClass: "bg-primary-soft text-primary",
      };
    case "untracked":
      return {
        code: "U",
        label: "未跟踪",
        toneClass: "bg-panel-3 text-muted",
      };
    case "conflicted":
      return {
        code: "!",
        label: "冲突",
        toneClass: "bg-red-soft text-red",
      };
    default:
      return {
        code: "?",
        label: "未知",
        toneClass: "bg-panel-3 text-muted",
      };
  }
}
