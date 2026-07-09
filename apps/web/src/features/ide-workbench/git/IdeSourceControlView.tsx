import * as React from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, CloudDownload, CloudUpload, Copy, FileDiff, FileSearch, GitBranch, History, Link2, Loader2, MoreHorizontal, MinusSquare, Pencil, PlusSquare, RefreshCcw, Sparkles, Trash2, Undo2, Unlink, UploadCloud } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { ConfirmDialog, TextInputDialog } from "@/design/ui/action-dialog";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { applyGitStash, checkoutBranch, commitFiles, createBranch, deleteBranch, discardFiles, dropGitStash, fetchBranch, generateGitCommitMessage, getGitBlame, getGitCommitDetail, getGitGraph, getGitStashes, popGitStash, publishBranch, pullBranch, pushBranch, renameBranch, revertCommit, saveGitStash, setBranchUpstream, stageFiles, syncBranch, unstageFiles } from "@/lib/api/git";
import { appendWorkbenchOutput } from "../output";
import type { GitBlamePayload, GitCommitDetailPayload, GitGraphPayload, GitStashEntry } from "../../../../../../types/git";
import { labelForGitKind, toneForGitKind, type IdeGitDecoratedChange, type IdeGitDecorationSnapshot } from "./gitDecorations";

export interface IdeSourceControlViewProps {
  hidden: boolean;
  rootId: string;
  rootLabel: string;
  git: IdeGitDecorationSnapshot & { loading: boolean; error: string | null; refresh: () => void };
  onOpenDiff: (request: { rootId: string; change: IdeGitDecoratedChange }) => void;
}

type BranchActionKind = "checkout" | "rename" | "delete" | "set-upstream" | "unset-upstream";
type RemoteActionKind = "pull" | "push" | "publish" | "sync";
type StashConfirmKind = "apply" | "pop" | "drop";
type HistoryMutationKind = "checkout-detached" | "branch-from" | "revert";

interface BranchActionDraft {
  kind: BranchActionKind;
  branchName: string;
  value: string;
}

type GitConfirmAction =
  | { kind: "discard"; change: IdeGitDecoratedChange }
  | { kind: "remote"; action: RemoteActionKind }
  | { kind: "stash"; action: StashConfirmKind; ref: string }
  | { kind: "commit-all"; count: number }
  | { kind: "history-checkout"; commit: GitGraphPayload["commits"][number] }
  | { kind: "history-revert"; commit: GitGraphPayload["commits"][number] };

export function IdeSourceControlView({ hidden, rootId, rootLabel, git, onOpenDiff }: IdeSourceControlViewProps) {
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [commitMessage, setCommitMessage] = React.useState("");
  const [branchName, setBranchName] = React.useState("");
  const [stashMessage, setStashMessage] = React.useState("");
  const [stashes, setStashes] = React.useState<GitStashEntry[]>([]);
  const [stashLoading, setStashLoading] = React.useState(false);
  const [stashError, setStashError] = React.useState<string | null>(null);
  const [stashRefreshTick, setStashRefreshTick] = React.useState(0);
  const [openBranchMenu, setOpenBranchMenu] = React.useState<{
    branchName: string;
    x: number;
    y: number;
  } | null>(null);
  const [branchAction, setBranchAction] = React.useState<BranchActionDraft | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<GitConfirmAction | null>(null);
  const [historyBranchAction, setHistoryBranchAction] = React.useState<{
    commit: GitGraphPayload["commits"][number];
    value: string;
  } | null>(null);
  const [history, setHistory] = React.useState<GitGraphPayload | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [historyRefreshTick, setHistoryRefreshTick] = React.useState(0);
  const [activeHistoryHash, setActiveHistoryHash] = React.useState<string | null>(null);
  const [historyDetailByHash, setHistoryDetailByHash] = React.useState<Record<string, GitCommitDetailPayload>>({});
  const [historyDetailErrorByHash, setHistoryDetailErrorByHash] = React.useState<Record<string, string>>({});
  const [historyDetailLoadingHash, setHistoryDetailLoadingHash] = React.useState<string | null>(null);
  const [blameFile, setBlameFile] = React.useState("");
  const [blame, setBlame] = React.useState<GitBlamePayload | null>(null);
  const [blameLoading, setBlameLoading] = React.useState(false);
  const [changeMenu, setChangeMenu] = React.useState<{
    change: IdeGitDecoratedChange;
    x: number;
    y: number;
  } | null>(null);
  const [changesOpen, setChangesOpen] = React.useState(true);

  React.useEffect(() => {
    if (!changeMenu && !openBranchMenu) return;
    const close = () => {
      setChangeMenu(null);
      setOpenBranchMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [changeMenu, openBranchMenu]);

  React.useEffect(() => {
    setActiveHistoryHash(null);
    setHistoryDetailByHash({});
    setHistoryDetailErrorByHash({});
    setHistoryDetailLoadingHash(null);
  }, [git.status?.directoryPath, rootId]);
  React.useEffect(() => {
    const status = git.status;
    if (!rootId || !status?.available) {
      setStashes([]);
      setStashError(null);
      setStashLoading(false);
      return;
    }
    const controller = new AbortController();
    setStashLoading(true);
    getGitStashes({ rootId, path: status.directoryPath }, controller.signal)
      .then((payload) => {
        setStashes(payload.stashes ?? []);
        setStashError(payload.available ? null : payload.message || "Git stash is unavailable");
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setStashError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStashLoading(false);
      });
    return () => controller.abort();
  }, [git.status?.available, git.status?.checkedAt, git.status?.directoryPath, rootId, stashRefreshTick]);

  React.useEffect(() => {
    const status = git.status;
    if (!rootId || !status?.available) {
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    const controller = new AbortController();
    setHistoryLoading(true);
    getGitGraph({ rootId, path: status.directoryPath, limit: 12, all: true }, controller.signal)
      .then((payload) => {
        setHistory(payload);
        setHistoryError(payload.available ? null : payload.message || "Git history is unavailable");
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setHistoryError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [git.status?.available, git.status?.checkedAt, git.status?.directoryPath, historyRefreshTick, rootId]);

  const refreshGitAndStashes = React.useCallback(() => {
    git.refresh();
    setStashRefreshTick((value) => value + 1);
  }, [git]);

  const runGitAction = React.useCallback(async (kind: "stage" | "unstage", paths: string[], label: string) => {
    const status = git.status;
    if (!status?.available || busyKey) return;
    const key = `${kind}:${paths.join("|") || "all"}`;
    setBusyKey(key);
    try {
      const fn = kind === "stage" ? stageFiles : unstageFiles;
      await fn({ rootId, path: status.directoryPath, paths });
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "info",
        text: `${kind} ${paths.length ? paths.join(", ") : "all"}`,
      });
      toast.success(label);
      refreshGitAndStashes();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "error",
        text: `${kind} failed: ${message}`,
      });
      toast.error(`${label}失败`, { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, git, refreshGitAndStashes, rootId]);

  const runDiscardAction = React.useCallback(async (change: IdeGitDecoratedChange, confirmed = false) => {
    const status = git.status;
    if (!status?.available || busyKey) return;
    const paths = discardPathsForChange(change);
    if (!paths.length) return;
    if (!confirmed) {
      setConfirmAction({ kind: "discard", change });
      return;
    }
    setBusyKey(`discard:${change.path}`);
    try {
      await discardFiles({ rootId, path: status.directoryPath, paths });
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "warn",
        text: `discard ${paths.join(", ")}`,
      });
      toast.success(change.kind === "untracked" ? `已移除未跟踪文件 ${change.path}` : `已回退 ${change.path} 的本地修改`);
      refreshGitAndStashes();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "error",
        text: `discard failed: ${message}`,
      });
      toast.error("丢弃修改失败", { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, git, refreshGitAndStashes, rootId]);

  const runRemoteAction = React.useCallback(async (kind: "fetch" | RemoteActionKind, confirmed = false) => {
    const status = git.status;
    if (!status?.available || busyKey) return;
    const labels: Record<typeof kind, string> = {
      fetch: "Fetch",
      pull: "Pull",
      push: "Push",
      publish: "Publish Branch",
      sync: "Sync",
    };
    const confirmText: Record<typeof kind, string> = {
      fetch: "",
      pull: git.changes.length
        ? `当前工作区有 ${git.changes.length} 个变更。Pull 使用 git pull --ff-only，仍可能因本地变更失败。继续？`
        : "执行 git pull --ff-only 从 upstream 拉取？",
      push: "Push 会更新远端分支。继续？",
      publish: "Publish 会将当前分支推送到 origin 并设置 upstream。继续？",
      sync: git.changes.length
        ? `当前工作区有 ${git.changes.length} 个变更。Sync 会先 git pull --ff-only 再 git push，可能因本地变更失败。继续？`
        : "Sync 会先 git pull --ff-only 再 git push。继续？",
    };
    if (confirmText[kind] && !confirmed) {
      setConfirmAction({ kind: "remote", action: kind as RemoteActionKind });
      return;
    }
    setBusyKey(`remote:${kind}`);
    try {
      const params = { rootId, path: status.directoryPath };
      if (kind === "fetch") await fetchBranch(params);
      if (kind === "pull") await pullBranch(params);
      if (kind === "push") await pushBranch(params);
      if (kind === "publish") await publishBranch(params);
      if (kind === "sync") await syncBranch(params);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "info",
        text: `git remote ${kind} completed for ${status.branch || "HEAD"}${status.upstream ? ` (${status.upstream})` : ""}`,
      });
      toast.success(`${labels[kind]} 已完成`);
      refreshGitAndStashes();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "error",
        text: `git remote ${kind} failed: ${message}`,
      });
      toast.error(`${labels[kind]} 失败`, { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, git, refreshGitAndStashes, rootId]);

  const runBranchAction = React.useCallback(async (kind: "create" | "checkout" | "rename" | "delete" | "set-upstream" | "unset-upstream" | "copy", target?: string) => {
    const status = git.status;
    if (!status?.available || busyKey) return;
    if (kind === "create") {
      const name = branchName.trim();
      const validationError = validateBranchName(name);
      if (validationError) {
        toast.error("分支名称不可用", { description: validationError });
        return;
      }
      setBusyKey("branch:create");
      try {
        await createBranch({ rootId, path: status.directoryPath, name, checkout: false });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git branch ${name}` });
        toast.success(`已创建分支 ${name}`);
        setBranchName("");
        refreshGitAndStashes();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `branch create failed: ${message}` });
        toast.error("创建分支失败", { description: message });
      } finally {
        setBusyKey(null);
      }
      return;
    }
    const branch = String(target || "").trim();
    if (!branch) return;
    if (kind === "copy") {
      try {
        await navigator.clipboard?.writeText(branch);
        toast.success("已复制分支名");
      } catch {
        toast.error("复制分支名失败");
      }
      return;
    }
    if (kind === "checkout") {
      if (branch === status.branch) return;
      if (git.changes.length) {
        setBranchAction({ kind: "checkout", branchName: branch, value: "" });
        return;
      }
      setBusyKey(`branch:checkout:${branch}`);
      try {
        await checkoutBranch({ rootId, path: status.directoryPath, target: branch });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git checkout ${branch}` });
        toast.success(`已切换到 ${branch}`);
        refreshGitAndStashes();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `branch checkout failed: ${message}` });
        toast.error("切换分支失败", { description: message });
      } finally {
        setBusyKey(null);
      }
      return;
    }
    if (kind === "rename") {
      setBranchAction({ kind, branchName: branch, value: branch });
      return;
    }
    if (kind === "delete") {
      if (branch === status.branch) {
        toast.error("不能删除当前分支");
        return;
      }
      setBranchAction({ kind, branchName: branch, value: "" });
      return;
    }
    if (kind === "set-upstream") {
      setBranchAction({ kind, branchName: branch, value: status.upstream && branch === status.branch ? status.upstream : `origin/${branch}` });
      return;
    }
    if (kind === "unset-upstream") {
      setBranchAction({ kind, branchName: branch, value: "" });
    }
  }, [branchName, busyKey, git, refreshGitAndStashes, rootId]);

  const runBranchActionDraft = React.useCallback(async (draft?: BranchActionDraft) => {
    const status = git.status;
    const action = draft ?? branchAction;
    if (!status?.available || !action || busyKey) return;
    const validationError = validateBranchActionDraft(action);
    if (validationError) {
      toast.error("分支操作不可用", { description: validationError });
      return;
    }
    const branch = action.branchName;
    const value = action.value.trim();
    const key = `branch:${action.kind}:${branch}`;
    setBusyKey(key);
    try {
      if (action.kind === "checkout") {
        await checkoutBranch({ rootId, path: status.directoryPath, target: branch });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git checkout ${branch}` });
        toast.success(`已切换到 ${branch}`);
      }
      if (action.kind === "rename") {
        await renameBranch({ rootId, path: status.directoryPath, oldName: branch, newName: value });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git branch -m ${branch} ${value}` });
        toast.success(`已重命名为 ${value}`);
      }
      if (action.kind === "delete") {
        await deleteBranch({ rootId, path: status.directoryPath, name: branch });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git branch -d ${branch}` });
        toast.success(`已删除分支 ${branch}`);
      }
      if (action.kind === "set-upstream") {
        await setBranchUpstream({ rootId, path: status.directoryPath, branch, upstream: value });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git branch --set-upstream-to ${value} ${branch}` });
        toast.success(`已设置 ${branch} upstream`);
      }
      if (action.kind === "unset-upstream") {
        await setBranchUpstream({ rootId, path: status.directoryPath, branch, unset: true });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git branch --unset-upstream ${branch}` });
        toast.success(`已取消 ${branch} upstream`);
      }
      setBranchAction(null);
      refreshGitAndStashes();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `${key} failed: ${message}` });
      toast.error(`${branchActionTitle(action.kind)}失败`, { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [branchAction, busyKey, git.status, refreshGitAndStashes, rootId]);

  const runStashAction = React.useCallback(async (kind: "save" | StashConfirmKind, ref?: string, confirmed = false) => {
    const status = git.status;
    if (!status?.available || busyKey) return;
    const labels: Record<typeof kind, string> = { save: "保存临时改动", apply: "应用临时保存", pop: "弹出临时保存", drop: "删除临时保存" };
    if (kind === "save") {
      if (!git.changes.length) {
        toast.error("没有可临时保存的变更");
        return;
      }
      setBusyKey("stash:save");
      try {
        await saveGitStash({ rootId, path: status.directoryPath, message: stashMessage.trim() || "Tracevane IDE stash", includeUntracked: true });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: "git stash push --include-untracked" });
        toast.success("已临时保存改动");
        setStashMessage("");
        refreshGitAndStashes();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `stash save failed: ${message}` });
        toast.error("临时保存失败", { description: message });
      } finally {
        setBusyKey(null);
      }
      return;
    }
    const stashRef = String(ref || "").trim();
    if (!stashRef) return;
    const confirmText = kind === "drop"
      ? `删除 ${stashRef}？此操作不可撤销。`
      : kind === "pop"
        ? `弹出 ${stashRef}？这会应用并删除该 stash，可能和当前工作区冲突。继续？`
        : `应用 ${stashRef} 到当前工作区？可能产生冲突。继续？`;
    if (!confirmed) {
      setConfirmAction({ kind: "stash", action: kind, ref: stashRef });
      return;
    }
    setBusyKey(`stash:${kind}:${stashRef}`);
    try {
      if (kind === "apply") await applyGitStash({ rootId, path: status.directoryPath, ref: stashRef });
      if (kind === "pop") await popGitStash({ rootId, path: status.directoryPath, ref: stashRef });
      if (kind === "drop") await dropGitStash({ rootId, path: status.directoryPath, ref: stashRef });
      appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git stash ${kind} ${stashRef}` });
      toast.success(`${labels[kind]} 已完成`);
      refreshGitAndStashes();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `stash ${kind} failed: ${message}` });
      toast.error(`${labels[kind]}失败`, { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, git, refreshGitAndStashes, rootId, stashMessage]);

  const runBlameAction = React.useCallback(async () => {
    const status = git.status;
    const file = blameFile.trim();
    if (!status?.available || !file || blameLoading) return;
    setBlameLoading(true);
    try {
      const payload = await getGitBlame({ rootId, path: status.directoryPath, file });
      setBlame(payload);
      if (!payload.available) {
        toast.error("读取 blame 失败", { description: payload.message || "Git blame unavailable" });
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      toast.error("读取 blame 失败", { description: message });
    } finally {
      setBlameLoading(false);
    }
  }, [blameFile, blameLoading, git.status, rootId]);

  const status = git.status;
  const stagedChanges = git.changes.filter((change) => change.staged);
  const unstagedChanges = git.changes.filter((change) => change.unstaged || change.kind === "untracked");
  const untrackedChanges = git.changes.filter((change) => change.kind === "untracked");
  const unstagedTrackedChanges = git.changes.filter((change) => change.unstaged && change.kind !== "untracked");
  const branchNameValidation = validateBranchName(branchName);
  const canCreateBranch = Boolean(branchName.trim()) && !branchNameValidation;
  const selectedBranchForMenu = openBranchMenu
    ? status?.branches.find((branch) => branch.name === openBranchMenu.branchName) ?? null
    : null;

  const runCommit = React.useCallback(async (confirmed = false) => {
    const message = commitMessage.trim();
    const stagedCount = stagedChanges.length;
    const unstagedCount = unstagedChanges.length;
    if (!status?.available || busyKey) return;
    if (!stagedCount && !unstagedCount) {
      toast.error("没有可提交的变更");
      return;
    }
    if (!message) {
      toast.error("提交信息不能为空");
      return;
    }
    const shouldStageAll = stagedCount === 0 && unstagedCount > 0;
    if (shouldStageAll && !confirmed) {
      setConfirmAction({ kind: "commit-all", count: unstagedCount });
      return;
    }
    setBusyKey(shouldStageAll ? "commit:all" : "commit:staged");
    try {
      if (shouldStageAll) {
        await stageFiles({ rootId, path: status.directoryPath, paths: [] });
      }
      await commitFiles({ rootId, path: status.directoryPath, message });
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "info",
        text: `commit ${shouldStageAll ? `${unstagedCount} auto-staged` : `${stagedCount} staged`} file${(shouldStageAll ? unstagedCount : stagedCount) === 1 ? "" : "s"}: ${message.split("\n")[0]}`,
      });
      toast.success(shouldStageAll ? "已暂存全部变更并提交" : "已提交暂存变更");
      setCommitMessage("");
      refreshGitAndStashes();
    } catch (reason) {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "error",
        text: `commit failed: ${errorMessage}`,
      });
      toast.error("提交失败", { description: errorMessage });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, commitMessage, refreshGitAndStashes, rootId, stagedChanges.length, status, unstagedChanges.length]);

  const generateCommitDescription = React.useCallback(async () => {
    if (!status?.available || busyKey) return;
    if (!git.changes.length) {
      toast.error("没有可总结的 Git 变更");
      return;
    }
    const useStaged = stagedChanges.length > 0;
    setBusyKey("commit-message:generate");
    try {
      const payload = await generateGitCommitMessage({
        rootId,
        path: status.directoryPath,
        staged: useStaged,
      });
      if (!payload.commitMessage.trim()) {
        toast.error("提交描述生成失败", { description: payload.message || "Git 没有返回可用摘要。" });
        return;
      }
      setCommitMessage(payload.commitMessage);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: payload.source === "model-gateway" ? "info" : "warn",
        text: [
          payload.source === "model-gateway"
            ? `generated commit message from Model Gateway${payload.model ? ` (${payload.model})` : ""}`
            : "generated commit message with local diff fallback",
          `scope: ${payload.staged ? "staged" : "working tree"} · files: ${payload.files.length}${payload.truncated ? " · diff truncated" : ""}`,
          payload.message ? `note: ${payload.message}` : "",
        ].filter(Boolean).join("\n"),
      });
      toast.success(
        payload.source === "model-gateway" ? "已使用模型网关生成提交描述" : "模型不可用，已使用本地 diff 摘要",
        payload.message ? { description: payload.message } : undefined,
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "error",
        text: `commit message generation failed: ${message}`,
      });
      toast.error("提交描述生成失败", { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, git.changes.length, rootId, stagedChanges.length, status]);

  const copyText = React.useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      toast.success(`已复制${label}`);
    } catch {
      toast.error(`复制${label}失败`);
    }
  }, []);

  const copyChangePath = React.useCallback(async (change: IdeGitDecoratedChange) => {
    await copyText(change.rootPath, "文件路径");
  }, [copyText]);

  const loadHistoryDetail = React.useCallback((commit: GitGraphPayload["commits"][number]) => {
    if (!status?.available || historyDetailByHash[commit.hash] || historyDetailLoadingHash === commit.hash) return;
    setHistoryDetailLoadingHash(commit.hash);
    setHistoryDetailErrorByHash((previous) => {
      const next = { ...previous };
      delete next[commit.hash];
      return next;
    });
    void getGitCommitDetail({ rootId, path: status.directoryPath, hash: commit.hash })
      .then((detail) => {
        setHistoryDetailByHash((previous) => ({ ...previous, [commit.hash]: detail }));
      })
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        setHistoryDetailErrorByHash((previous) => ({ ...previous, [commit.hash]: message }));
      })
      .finally(() => {
        setHistoryDetailLoadingHash((current) => current === commit.hash ? null : current);
      });
  }, [historyDetailByHash, historyDetailLoadingHash, rootId, status]);

  const copyHistoryMessage = React.useCallback(async (
    commit: GitGraphPayload["commits"][number],
    detail: GitCommitDetailPayload | undefined,
  ) => {
    if (!detail) {
      toast.error("提交详情仍在读取", { description: "请稍等详情加载完成后再复制完整提交信息。" });
      return;
    }
    await copyText([detail.hash, detail.subject, detail.body].filter(Boolean).join("\n\n"), "完整提交信息");
  }, [copyText]);

  const copyHistoryFiles = React.useCallback(async (
    detail: GitCommitDetailPayload | undefined,
  ) => {
    if (!detail) {
      toast.error("提交详情仍在读取", { description: "请稍等详情加载完成后再复制变更文件列表。" });
      return;
    }
    const fileLines = detail.files.map(formatHistoryFileChange);
    await copyText(fileLines.join("\n") || "No changed files", "变更文件列表");
  }, [copyText]);

  const runHistoryMutation = React.useCallback(async (
    kind: HistoryMutationKind,
    commit: GitGraphPayload["commits"][number],
    options: { confirmed?: boolean; branchName?: string } = {},
  ) => {
    if (!status?.available || busyKey) return;
    if (kind === "branch-from") {
      const defaultName = `from-${commit.shortHash || commit.hash.slice(0, 7)}`;
      const name = options.branchName?.trim() || "";
      if (!name) {
        setHistoryBranchAction({ commit, value: defaultName });
        return;
      }
      if (!name) return;
      const validationError = validateBranchName(name);
      if (validationError) {
        toast.error("分支名称不可用", { description: validationError });
        return;
      }
      if (git.changes.length && !options.confirmed) {
        setHistoryBranchAction({ commit, value: name });
        return;
      }
      setBusyKey(`history:branch:${commit.hash}`);
      try {
        await createBranch({ rootId, path: status.directoryPath, name, checkout: true, from: commit.hash });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git checkout -b ${name} ${commit.hash}` });
        toast.success(`已从 ${commit.shortHash} 创建并切换到 ${name}`);
        refreshGitAndStashes();
        setHistoryRefreshTick((value) => value + 1);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `history branch from commit failed: ${message}` });
        toast.error("从提交创建分支失败", { description: message });
      } finally {
        setBusyKey(null);
      }
      return;
    }
    if (kind === "checkout-detached") {
      if (!options.confirmed) {
        setConfirmAction({ kind: "history-checkout", commit });
        return;
      }
      setBusyKey(`history:checkout:${commit.hash}`);
      try {
        await checkoutBranch({ rootId, path: status.directoryPath, target: commit.hash, detach: true });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git checkout --detach ${commit.hash}` });
        toast.success(`已签出 ${commit.shortHash}`);
        refreshGitAndStashes();
        setHistoryRefreshTick((value) => value + 1);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `history checkout failed: ${message}` });
        toast.error("签出提交失败", { description: message });
      } finally {
        setBusyKey(null);
      }
      return;
    }
    if (!options.confirmed) {
      setConfirmAction({ kind: "history-revert", commit });
      return;
    }
    setBusyKey(`history:revert:${commit.hash}`);
    try {
      await revertCommit({ rootId, path: status.directoryPath, hash: commit.hash });
      appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: `git revert --no-edit ${commit.hash}` });
      toast.success(`已 Revert ${commit.shortHash}`);
      refreshGitAndStashes();
      setHistoryRefreshTick((value) => value + 1);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `history revert failed: ${message}` });
      toast.error("Revert 提交失败", { description: message });
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, git.changes.length, refreshGitAndStashes, rootId, status]);

  const renderChangeRow = (change: IdeGitDecoratedChange) => (
    <SourceControlChangeRow
      key={`${change.status}:${change.rootPath}:${change.previousPath ?? ""}`}
      change={change}
      busyKey={busyKey}
      onOpen={() => onOpenDiff({ rootId, change })}
      onStage={() => void runGitAction("stage", [change.path], `已暂存 ${change.path}`)}
      onUnstage={() => void runGitAction("unstage", [change.path], `已取消暂存 ${change.path}`)}
      onDiscard={() => void runDiscardAction(change)}
      onCopyPath={() => void copyChangePath(change)}
      onContextMenu={(event) => {
        event.preventDefault();
        setChangeMenu({ change, x: event.clientX, y: event.clientY });
      }}
    />
  );

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;
  return (
    <aside className="grid h-full max-h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-line bg-panel" data-ide-sidebar data-ide-source-control-view>
      <div className="border-b border-line bg-panel px-2.5 py-2" data-ide-source-control-toolbar>
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-7 shrink-0 place-items-center rounded-sm border border-primary-line bg-primary-soft text-primary">
            <GitBranch className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">源代码管理</div>
            <div className="truncate text-xs text-subtle">{rootLabel || "Workspace Git"}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={git.refresh} aria-label="刷新 Git 状态" title="刷新 Git 状态" data-ide-source-control-refresh>
            {git.loading ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
          </Button>
        </div>
        {!status?.available && (git.error || status?.message) ? (
          <div className="mt-2 truncate px-1 text-xs text-danger" data-ide-source-control-summary>
            {git.error || status?.message}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 overflow-auto overscroll-contain bg-canvas/40 p-2 [scrollbar-width:thin]" data-ide-source-control-body>
        {git.loading && !status ? (
          <SourceControlState title="正在读取 Git 状态…" loading />
        ) : !status?.available ? (
          <SourceControlState title="没有可用的 Git 仓库" description={status?.message || git.error || "请选择 Git 工作区目录。"} tone="muted" />
        ) : (
          <div className="grid min-w-0 content-start gap-2">
            <section
              className="min-w-0 overflow-hidden rounded-sm border border-line bg-panel"
              data-ide-source-control-section="changes"
              data-ide-source-control-section-open={changesOpen ? "true" : "false"}
            >
              <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 px-2 py-1.5", changesOpen && "border-b border-line/70")}>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-sm text-left outline-none hover:text-primary focus-visible:shadow-[var(--ring)]"
                  aria-expanded={changesOpen}
                  onClick={() => setChangesOpen((value) => !value)}
                  data-ide-source-control-changes-toggle
                >
                  {changesOpen ? <ChevronDown className="size-3.5 shrink-0 text-subtle" /> : <ChevronRight className="size-3.5 shrink-0 text-subtle" />}
                  <FileDiff className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 truncate text-xs font-semibold text-ink-strong">变更</span>
                  <span className="shrink-0 rounded border border-line bg-canvas px-1.5 py-0.5 text-2xs text-subtle">{git.changes.length}</span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-2xs"
                  disabled={busyKey !== null || unstagedChanges.length === 0}
                  onClick={() => void runGitAction("stage", [], "已暂存全部变更")}
                  title="全部暂存"
                  data-ide-source-control-stage-all
                >
                  <PlusSquare className="size-3.5" />
                  暂存
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-2xs"
                  disabled={busyKey !== null || stagedChanges.length === 0}
                  onClick={() => void runGitAction("unstage", [], "已取消暂存全部变更")}
                  title="全部取消暂存"
                  data-ide-source-control-unstage-all
                >
                  <MinusSquare className="size-3.5" />
                </Button>
              </div>
              {changesOpen && git.changes.length ? (
                <div className="grid min-w-0 gap-1.5 p-2">
                  <div className="flex min-w-0 items-center gap-1.5" data-ide-source-control-commit-box>
                    <textarea
                      className="h-8 min-h-8 min-w-0 flex-1 resize-y rounded-sm border border-line bg-canvas px-2 py-1 text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
                      value={commitMessage}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      placeholder={stagedChanges.length ? `${stagedChanges.length} 个已暂存变更的提交信息` : "输入提交信息；提交时可确认暂存全部"}
                      aria-label="Git 提交信息"
                      disabled={busyKey !== null}
                      data-ide-source-control-commit-message
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      disabled={busyKey !== null || git.changes.length === 0}
                      onClick={() => void generateCommitDescription()}
                      title="使用模型网关根据 Git diff 生成提交描述"
                      aria-label="使用模型网关根据 Git diff 生成提交描述"
                      data-ide-source-control-generate-message
                    >
                      {busyKey === "commit-message:generate" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 shrink-0 justify-center px-2 text-xs"
                      disabled={busyKey !== null || (!stagedChanges.length && !unstagedChanges.length) || !commitMessage.trim()}
                      onClick={() => void runCommit()}
                      title={stagedChanges.length ? "提交已暂存变更" : "确认后先暂存全部变更再提交"}
                      data-ide-source-control-commit
                    >
                      {busyKey === "commit:staged" || busyKey === "commit:all" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                      {stagedChanges.length ? "提交" : "提交全部"}
                    </Button>
                  </div>
                  <div
                    className="grid min-w-0 content-start gap-1"
                    role="list"
                    aria-label="Git 文件变更列表"
                    data-ide-source-control-changes
                  >
                    <SourceControlChangeGroup title="已暂存" count={stagedChanges.length}>
                      {stagedChanges.map(renderChangeRow)}
                    </SourceControlChangeGroup>
                    <SourceControlChangeGroup title="更改" count={unstagedTrackedChanges.length}>
                      {unstagedTrackedChanges.map(renderChangeRow)}
                    </SourceControlChangeGroup>
                    <SourceControlChangeGroup title="未跟踪" count={untrackedChanges.length}>
                      {untrackedChanges.map(renderChangeRow)}
                    </SourceControlChangeGroup>
                  </div>
                </div>
              ) : changesOpen ? (
                <div className="p-2" data-ide-source-control-changes>
                  <SourceControlState title="工作区干净" description="当前没有 Git 文件变更。" />
                </div>
              ) : null}
            </section>
              <SourceControlSection
                title="分支"
                icon={<GitBranch className="size-3.5" />}
                summary={`${status.branches.length} 个`}
                dataAttr="branches"
                defaultOpen={false}
              >
                <div className="relative grid min-w-0 gap-2" data-ide-source-control-branches>
                <div className="grid min-w-0 gap-1 rounded-sm border border-line bg-canvas px-2 py-1">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs" data-ide-source-control-branch-summary>
                    <span className="min-w-0 truncate font-medium text-ink-strong" data-ide-source-control-branch>{status.branch || "HEAD"}</span>
                    {status.upstream ? (
                      <span className="truncate text-subtle" data-ide-source-control-upstream>→ {status.upstream}</span>
                    ) : (
                      <span className="truncate text-subtle" data-ide-source-control-upstream>无 upstream</span>
                    )}
                    {status.ahead || status.behind ? (
                      <span className="ml-auto shrink-0 text-primary" data-ide-source-control-ahead-behind>↑{status.ahead} ↓{status.behind}</span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1" data-ide-source-control-remote-actions>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 min-w-0 justify-center px-1.5 text-2xs"
                      disabled={busyKey !== null}
                      onClick={() => void runRemoteAction("fetch")}
                      data-ide-source-control-fetch
                    >
                      {busyKey === "remote:fetch" ? <Loader2 className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />}
                      Fetch
                    </Button>
                    {status.behind > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 min-w-0 justify-center px-1.5 text-2xs"
                        disabled={busyKey !== null}
                        onClick={() => void runRemoteAction("pull")}
                        data-ide-source-control-pull
                      >
                        {busyKey === "remote:pull" ? <Loader2 className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />}
                        Pull
                      </Button>
                    ) : null}
                    {status.upstream && status.ahead > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 min-w-0 justify-center px-1.5 text-2xs"
                        disabled={busyKey !== null}
                        onClick={() => void runRemoteAction("push")}
                        data-ide-source-control-push
                      >
                        {busyKey === "remote:push" ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
                        Push
                      </Button>
                    ) : null}
                    {!status.upstream && status.branch && status.branch !== "HEAD" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 min-w-0 justify-center px-1.5 text-2xs"
                        disabled={busyKey !== null}
                        onClick={() => void runRemoteAction("publish")}
                        data-ide-source-control-publish
                      >
                        {busyKey === "remote:publish" ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                        Publish
                      </Button>
                    ) : null}
                    {status.upstream && status.ahead > 0 && status.behind > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 min-w-0 justify-center px-1.5 text-2xs"
                        disabled={busyKey !== null}
                        onClick={() => void runRemoteAction("sync")}
                        data-ide-source-control-sync
                      >
                        {busyKey === "remote:sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
                        Sync
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-1">
                  <input
                    className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus:shadow-[var(--ring)]"
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                    placeholder="新分支名"
                    aria-label="新建 Git 分支名"
                    disabled={busyKey !== null}
                    data-ide-source-control-branch-name
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 justify-center px-2 text-xs"
                    disabled={busyKey !== null || !canCreateBranch}
                    onClick={() => void runBranchAction("create")}
                    data-ide-source-control-create-branch
                  >
                    {busyKey === "branch:create" ? <Loader2 className="size-3.5 animate-spin" /> : <PlusSquare className="size-3.5" />}
                    创建
                  </Button>
                </div>
                {branchNameValidation ? <div className="text-2xs text-danger" data-ide-source-control-branch-error>{branchNameValidation}</div> : null}
                <div className="grid min-w-0 gap-1" data-ide-source-control-branch-list>
                  {status.branches.length ? status.branches.map((branch) => (
                    <div key={branch.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-line bg-canvas px-2 py-1 text-xs" data-ide-source-control-branch-row data-ide-source-control-branch-name-value={branch.name} data-ide-source-control-branch-current={branch.current ? "true" : "false"}>
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        disabled={busyKey !== null || branch.current || stashLoading}
                        title={branch.upstream || branch.shortHash || branch.subject || branch.name}
                        onClick={() => void runBranchAction("checkout", branch.name)}
                        data-ide-source-control-checkout-branch
                      >
                        <div className="truncate font-medium text-ink-strong">{branch.current ? "● " : ""}{branch.name}</div>
                        <div className="truncate text-2xs text-subtle">{branch.upstream || branch.shortHash || branch.subject || "local branch"}</div>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-7 px-0 text-2xs"
                        disabled={busyKey !== null || stashLoading}
                        aria-label={`Git branch actions for ${branch.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          setOpenBranchMenu((value) => value?.branchName === branch.name
                            ? null
                            : {
                                branchName: branch.name,
                                x: rect.left,
                                y: rect.bottom + 4,
                              });
                        }}
                        data-ide-source-control-branch-actions
                      >
                        {busyKey?.includes(`:${branch.name}`) ? <Loader2 className="size-3 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
                      </Button>
                    </div>
                  )) : <span className="text-xs text-muted">暂无分支列表。</span>}
                </div>
                </div>
              </SourceControlSection>

              <SourceControlSection
                title="历史"
                icon={<History className="size-3.5" />}
                summary={historyLoading ? "读取中" : `${history?.commits.length ?? 0} 条`}
                dataAttr="history"
                defaultOpen={false}
              >
                <div className="grid min-w-0 gap-2" data-ide-source-control-history>
                <div className="flex items-center justify-between gap-2">
                  {historyError ? <div className="min-w-0 truncate text-2xs text-danger" data-ide-source-control-history-error>{historyError}</div> : <span className="text-2xs text-subtle">悬停或聚焦提交查看详情；按钮可签出、建分支或 Revert</span>}
                  <button type="button" className="shrink-0 text-2xs text-subtle hover:text-primary" onClick={() => setHistoryRefreshTick((value) => value + 1)} disabled={historyLoading} data-ide-source-control-refresh-history>刷新</button>
                </div>
                <div className="grid min-w-0 gap-1" data-ide-source-control-graph-list>
                  {historyLoading && !history?.commits.length ? <span className="text-xs text-muted">正在读取提交历史…</span> : null}
                  {!historyLoading && !history?.commits.length ? <span className="text-xs text-muted">暂无提交历史。</span> : null}
                  {history?.commits.map((commit) => {
                    const detail = historyDetailByHash[commit.hash];
                    const active = activeHistoryHash === commit.hash;
                    return (
                      <div
                        key={commit.hash}
                        className="group rounded-sm border border-line bg-canvas px-2 py-1 text-xs outline-none hover:border-primary-line hover:bg-primary-soft/40 focus-within:border-primary-line focus-visible:shadow-[var(--ring)]"
                        data-ide-source-control-graph-row
                        data-ide-source-control-graph-hash={commit.hash}
                        data-ide-source-control-graph-active={active ? "true" : "false"}
                        title={formatHistoryTooltip(commit)}
                        tabIndex={0}
                        onMouseEnter={() => {
                          setActiveHistoryHash(commit.hash);
                          loadHistoryDetail(commit);
                        }}
                        onMouseLeave={() => setActiveHistoryHash((current) => current === commit.hash ? null : current)}
                        onFocus={() => {
                          setActiveHistoryHash(commit.hash);
                          loadHistoryDetail(commit);
                        }}
                        onBlur={(event) => {
                          const nextTarget = event.relatedTarget;
                          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                            setActiveHistoryHash((current) => current === commit.hash ? null : current);
                          }
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-2xs text-primary">{commit.shortHash}</span>
                          <span className="truncate font-medium text-ink-strong">{commit.subject || "No subject"}</span>
                        </div>
                        <div className="truncate text-2xs text-subtle">{commit.authorName || "unknown"} · {commit.parents.length} parent{commit.parents.length === 1 ? "" : "s"}{commit.refs ? ` · ${commit.refs}` : ""}</div>
                        <div className="mt-0.5 hidden truncate font-mono text-2xs text-muted group-hover:block group-focus-within:block">
                          {commit.hash} · {commit.date || "unknown date"}
                        </div>
                        {active ? (
                          <HistoryCommitDetailPanel
                            commit={commit}
                            detail={detail}
                            loading={historyDetailLoadingHash === commit.hash}
                            error={historyDetailErrorByHash[commit.hash]}
                            busy={busyKey !== null}
                            onCheckout={() => void runHistoryMutation("checkout-detached", commit)}
                            onBranchFrom={() => void runHistoryMutation("branch-from", commit)}
                            onRevert={() => void runHistoryMutation("revert", commit)}
                            onCopyHash={() => void copyText(commit.hash, "提交哈希")}
                            onCopyMessage={() => void copyHistoryMessage(commit, detail)}
                            onCopyFiles={() => void copyHistoryFiles(detail)}
                            onFillCommit={() => setCommitMessage(detail?.subject || commit.subject || commit.shortHash)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-1 border-t border-line pt-2" data-ide-source-control-blame>
                  <div className="flex min-w-0 items-center gap-1">
                    <input
                      className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus:shadow-[var(--ring)]"
                      value={blameFile}
                      onChange={(event) => setBlameFile(event.target.value)}
                      placeholder="Blame 文件路径"
                      aria-label="Git blame file"
                      disabled={blameLoading}
                      data-ide-source-control-blame-file
                    />
                    <Button variant="outline" size="sm" className="h-7 shrink-0 justify-center px-2 text-xs" disabled={blameLoading || !blameFile.trim()} onClick={() => void runBlameAction()} data-ide-source-control-blame-run>
                      {blameLoading ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
                      Blame
                    </Button>
                  </div>
                  {blame ? (
                    <div className="max-h-28 overflow-auto rounded-sm border border-line bg-canvas p-1 font-mono text-2xs [scrollbar-width:thin]" data-ide-source-control-blame-result>
                      {blame.available ? blame.lines.slice(0, 8).map((line) => (
                        <div key={`${line.hash}:${line.lineNumber}`} className="grid grid-cols-[3rem_4rem_minmax(0,1fr)] gap-1 text-muted">
                          <span>{line.lineNumber}</span>
                          <span className="text-primary">{line.shortHash}</span>
                          <span className="truncate">{line.content}</span>
                        </div>
                      )) : <span className="text-danger">{blame.message || "Git blame unavailable"}</span>}
                      {blame.truncated ? <div className="text-subtle">结果已截断。</div> : null}
                    </div>
                  ) : null}
                </div>
                </div>
              </SourceControlSection>

              <SourceControlSection
                title="临时保存改动"
                icon={<UploadCloud className="size-3.5" />}
                summary={stashLoading ? "读取中" : stashes.length ? `${stashes.length} 个` : "切分支前可用"}
                dataAttr="stashes"
                defaultOpen={false}
              >
                <div className="grid min-w-0 gap-2" data-ide-source-control-stashes>
                  <div className="rounded-sm border border-line bg-canvas px-2 py-1.5 text-2xs text-subtle" data-ide-source-control-stash-help>
                    <div className="font-medium text-ink-strong">把当前未提交改动临时收起来，不生成 commit。</div>
                    <div className="mt-1">常用于切换分支、拉取更新或临时处理别的任务。应用会恢复改动并保留记录；弹出会恢复改动后删除记录。</div>
                  </div>
                  <div className="flex min-w-0 items-center gap-1">
                    <input
                      className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus:shadow-[var(--ring)]"
                      value={stashMessage}
                      onChange={(event) => setStashMessage(event.target.value)}
                      placeholder="说明（可选，例如：切分支前保存当前工作）"
                      aria-label="Git stash message"
                      disabled={busyKey !== null}
                      data-ide-source-control-stash-message
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 justify-center px-2 text-xs"
                      disabled={busyKey !== null || git.changes.length === 0}
                      onClick={() => void runStashAction("save")}
                      data-ide-source-control-save-stash
                    >
                      {busyKey === "stash:save" ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                      保存改动
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {stashError ? <div className="min-w-0 truncate text-2xs text-danger" data-ide-source-control-stash-error>{stashError}</div> : <span className="text-2xs text-subtle">这是临时工作区快照，不会进入提交历史。</span>}
                    <button type="button" className="shrink-0 text-2xs text-subtle hover:text-primary" onClick={() => setStashRefreshTick((value) => value + 1)} disabled={stashLoading} data-ide-source-control-refresh-stashes>刷新</button>
                  </div>
                  <div className="grid min-w-0 gap-1" data-ide-source-control-stash-list>
                    {stashLoading && !stashes.length ? <span className="text-xs text-muted">正在读取临时保存…</span> : null}
                    {!stashLoading && !stashes.length ? <span className="text-xs text-muted">暂无临时保存；需要临时切换任务时，再把当前未提交改动保存到这里。</span> : null}
                    {stashes.map((stash) => (
                      <div key={stash.ref} className="grid min-w-0 gap-1 rounded-sm border border-line bg-canvas px-2 py-1 text-xs" data-ide-source-control-stash-row data-ide-source-control-stash-ref={stash.ref}>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink-strong">{stash.ref}</div>
                          <div className="truncate text-2xs text-subtle">{stash.branch || "临时保存"} · {stash.message || "无说明"}</div>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" title="恢复到工作区，并保留这条临时保存记录" disabled={busyKey !== null || stashLoading} onClick={() => void runStashAction("apply", stash.ref)} data-ide-source-control-apply-stash>应用</Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" title="恢复到工作区，并删除这条临时保存记录" disabled={busyKey !== null || stashLoading} onClick={() => void runStashAction("pop", stash.ref)} data-ide-source-control-pop-stash>弹出</Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs text-danger hover:text-danger" title="只删除这条临时保存记录，不恢复改动" disabled={busyKey !== null || stashLoading} onClick={() => void runStashAction("drop", stash.ref)} data-ide-source-control-drop-stash>删除</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SourceControlSection>
            </div>
        )}
      </div>
      {changeMenu ? (
        <div
          className="fixed z-50 w-52 rounded-sm border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
          style={contextMenuStyle(changeMenu.x, changeMenu.y, 208, 210)}
          role="menu"
          data-ide-source-control-change-menu
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <BranchMenuButton icon={<FileDiff className="size-3.5" />} onClick={() => { onOpenDiff({ rootId, change: changeMenu.change }); setChangeMenu(null); }}>打开 Diff</BranchMenuButton>
          <BranchMenuButton
            icon={<PlusSquare className="size-3.5" />}
            disabled={!changeMenu.change.unstaged && changeMenu.change.kind !== "untracked"}
            onClick={() => { void runGitAction("stage", [changeMenu.change.path], `已暂存 ${changeMenu.change.path}`); setChangeMenu(null); }}
          >
            暂存
          </BranchMenuButton>
          <BranchMenuButton
            icon={<MinusSquare className="size-3.5" />}
            disabled={!changeMenu.change.staged}
            onClick={() => { void runGitAction("unstage", [changeMenu.change.path], `已取消暂存 ${changeMenu.change.path}`); setChangeMenu(null); }}
          >
            取消暂存
          </BranchMenuButton>
          <BranchMenuButton icon={<Copy className="size-3.5" />} onClick={() => { void copyChangePath(changeMenu.change); setChangeMenu(null); }}>复制路径</BranchMenuButton>
          <div className="my-1 h-px bg-line" />
          <BranchMenuButton danger={changeMenu.change.kind === "untracked"} icon={<Undo2 className="size-3.5" />} onClick={() => { void runDiscardAction(changeMenu.change); setChangeMenu(null); }}>{discardActionLabel(changeMenu.change)}</BranchMenuButton>
        </div>
      ) : null}
      {selectedBranchForMenu && openBranchMenu ? (
        <div
          className="fixed z-50 w-52 rounded-sm border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
          style={contextMenuStyle(openBranchMenu.x, openBranchMenu.y, 208, 220)}
          role="menu"
          data-ide-source-control-branch-menu
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <BranchMenuButton icon={<GitBranch className="size-3.5" />} disabled={selectedBranchForMenu.current} onClick={() => { setOpenBranchMenu(null); void runBranchAction("checkout", selectedBranchForMenu.name); }}>切换到此分支</BranchMenuButton>
          <BranchMenuButton icon={<Pencil className="size-3.5" />} onClick={() => { setOpenBranchMenu(null); void runBranchAction("rename", selectedBranchForMenu.name); }}>重命名</BranchMenuButton>
          <BranchMenuButton icon={<Link2 className="size-3.5" />} onClick={() => { setOpenBranchMenu(null); void runBranchAction("set-upstream", selectedBranchForMenu.name); }}>设置 upstream</BranchMenuButton>
          <BranchMenuButton icon={<Unlink className="size-3.5" />} disabled={!selectedBranchForMenu.upstream} onClick={() => { setOpenBranchMenu(null); void runBranchAction("unset-upstream", selectedBranchForMenu.name); }}>取消 upstream</BranchMenuButton>
          <BranchMenuButton icon={<Copy className="size-3.5" />} onClick={() => { setOpenBranchMenu(null); void runBranchAction("copy", selectedBranchForMenu.name); }}>复制分支名</BranchMenuButton>
          <div className="my-1 h-px bg-line" />
          <BranchMenuButton danger icon={<Trash2 className="size-3.5" />} disabled={selectedBranchForMenu.current} onClick={() => { setOpenBranchMenu(null); void runBranchAction("delete", selectedBranchForMenu.name); }}>删除本地分支</BranchMenuButton>
        </div>
      ) : null}
      {branchAction ? branchActionRequiresInput(branchAction.kind) ? (
        <TextInputDialog
          open
          title={branchActionTitle(branchAction.kind)}
          description={branchActionDescription(branchAction, git.changes.length)}
          icon={branchActionIcon(branchAction.kind)}
          tone={branchAction.kind === "delete" ? "danger" : "primary"}
          label={branchActionInputLabel(branchAction.kind)}
          initialValue={branchAction.value}
          placeholder={branchActionPlaceholder(branchAction)}
          confirmLabel={branchActionConfirmLabel(branchAction.kind)}
          busy={busyKey !== null}
          contentDataAttr="git-branch-action"
          inputDataAttr="git-branch-action"
          validate={(value) => validateBranchActionDraft({ ...branchAction, value })}
          onCancel={() => setBranchAction(null)}
          onConfirm={(value) => void runBranchActionDraft({ ...branchAction, value })}
        />
      ) : (
        <ConfirmDialog
          open
          title={branchActionTitle(branchAction.kind)}
          description={branchActionDescription(branchAction, git.changes.length)}
          icon={branchActionIcon(branchAction.kind)}
          tone={branchAction.kind === "unset-upstream" ? "warning" : "primary"}
          confirmLabel={branchActionConfirmLabel(branchAction.kind)}
          busy={busyKey !== null}
          contentDataAttr="git-branch-action"
          onCancel={() => setBranchAction(null)}
          onConfirm={() => void runBranchActionDraft(branchAction)}
        />
      ) : null}
      {historyBranchAction ? (
        <TextInputDialog
          open
          title="从提交创建分支"
          description={`从 ${historyBranchAction.commit.shortHash} 创建并切换到新分支。${git.changes.length ? `当前工作区有 ${git.changes.length} 个变更，Git 可能因冲突失败。` : ""}`}
          icon={<PlusSquare />}
          label="新分支名"
          initialValue={historyBranchAction.value}
          placeholder={`from-${historyBranchAction.commit.shortHash}`}
          confirmLabel="创建并切换"
          busy={busyKey !== null}
          contentDataAttr="git-history-branch"
          inputDataAttr="git-history-branch"
          validate={(value) => {
            if (!value) return "请输入分支名";
            return validateBranchName(value);
          }}
          onCancel={() => setHistoryBranchAction(null)}
          onConfirm={(value) => {
            const action = historyBranchAction;
            setHistoryBranchAction(null);
            void runHistoryMutation("branch-from", action.commit, { branchName: value, confirmed: true });
          }}
        />
      ) : null}
      {confirmAction ? (
        <ConfirmDialog
          open
          title={gitConfirmTitle(confirmAction)}
          description={gitConfirmDescription(confirmAction, git.changes.length)}
          icon={gitConfirmIcon(confirmAction)}
          tone={gitConfirmTone(confirmAction)}
          confirmLabel={gitConfirmLabel(confirmAction)}
          busy={busyKey !== null}
          contentDataAttr="git-confirm"
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            const action = confirmAction;
            setConfirmAction(null);
            if (action.kind === "discard") void runDiscardAction(action.change, true);
            if (action.kind === "remote") void runRemoteAction(action.action, true);
            if (action.kind === "stash") void runStashAction(action.action, action.ref, true);
            if (action.kind === "commit-all") void runCommit(true);
            if (action.kind === "history-checkout") void runHistoryMutation("checkout-detached", action.commit, { confirmed: true });
            if (action.kind === "history-revert") void runHistoryMutation("revert", action.commit, { confirmed: true });
          }}
        />
      ) : null}
    </aside>
  );
}

function SourceControlSection({
  title,
  icon,
  summary,
  defaultOpen = true,
  openWhen = false,
  dataAttr,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  summary: string;
  defaultOpen?: boolean;
  openWhen?: boolean;
  dataAttr: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contained = dataAttr === "commit" || dataAttr === "changes";
  const primary = dataAttr === "changes";
  React.useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden",
        contained ? "rounded-sm border border-line bg-panel" : "border-b border-line/70 last:border-b-0",
        primary && "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]",
      )}
      data-ide-source-control-section={dataAttr}
      data-ide-source-control-section-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className={cn(
          "flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left outline-none hover:bg-primary-soft/40 focus-visible:shadow-[var(--ring)]",
          contained && "border-b border-line/70 bg-panel-2",
          contained && !open && "border-b-0",
        )}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-ide-source-control-section-toggle={dataAttr}
      >
        <span className="grid size-5 shrink-0 place-items-center text-subtle">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
        <span className="grid size-5 shrink-0 place-items-center text-primary">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-strong">{title}</span>
        <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-2xs text-subtle">{summary}</span>
      </button>
      {open ? (
        <div className={cn("min-w-0", contained ? "p-2" : "px-2 pb-2 pt-1", primary && "min-h-0 overflow-hidden")}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function SourceControlChangeGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section className="grid min-w-0 gap-1" data-ide-source-control-change-group={title}>
      <div className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b border-line/70 bg-panel/95 px-1 py-1 text-2xs font-semibold text-subtle backdrop-blur">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="rounded border border-line bg-canvas px-1.5 py-0.5">{count}</span>
      </div>
      <div className="grid min-w-0 gap-1">{children}</div>
    </section>
  );
}

function SourceControlChangeRow({
  change,
  busyKey,
  onOpen,
  onStage,
  onUnstage,
  onDiscard,
  onCopyPath,
  onContextMenu,
}: {
  change: IdeGitDecoratedChange;
  busyKey: string | null;
  onOpen: () => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  onCopyPath: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const actionBusy = busyKey === `stage:${change.path}` || busyKey === `unstage:${change.path}` || busyKey === `discard:${change.path}`;
  return (
    <div
      className={cn(
        "group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left",
        "hover:border-primary-line hover:bg-primary-soft/50 focus-within:shadow-[var(--ring)]",
      )}
      data-ide-source-control-change
      data-ide-source-control-change-path={change.rootPath}
      data-ide-source-control-change-kind={change.kind}
      data-ide-source-control-change-staged={change.staged ? "true" : "false"}
      data-ide-source-control-change-unstaged={change.unstaged || change.kind === "untracked" ? "true" : "false"}
      title={formatChangeTooltip(change)}
      onContextMenu={onContextMenu}
    >
      <GitBadge label={change.label} tone={change.tone} />
      <button type="button" className="min-w-0 text-left outline-none" onClick={onOpen} data-ide-source-control-open-diff>
        <span className="block truncate text-sm font-medium text-ink-strong">{fileName(change.rootPath)}</span>
        <span className="block truncate font-mono text-2xs text-subtle">{change.rootPath}</span>
        {change.previousPath ? <span className="block truncate font-mono text-2xs text-subtle">from {change.previousPath}</span> : null}
      </button>
      <span className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button
          type="button"
          className="grid size-7 place-items-center rounded border border-line bg-panel-2 text-subtle outline-none hover:border-green/40 hover:bg-green-soft hover:text-green disabled:cursor-not-allowed disabled:opacity-40"
          title="暂存"
          aria-label={`暂存 ${change.rootPath}`}
          disabled={busyKey !== null || actionBusy || (!change.unstaged && change.kind !== "untracked")}
          onClick={onStage}
          data-ide-source-control-stage
        >
          {actionBusy ? <Loader2 className="size-3.5 animate-spin" /> : <PlusSquare className="size-3.5" />}
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded border border-line bg-panel-2 text-subtle outline-none hover:border-amber/40 hover:bg-amber-soft hover:text-amber disabled:cursor-not-allowed disabled:opacity-40"
          title="取消暂存"
          aria-label={`取消暂存 ${change.rootPath}`}
          disabled={busyKey !== null || actionBusy || !change.staged}
          onClick={onUnstage}
          data-ide-source-control-unstage
        >
          {actionBusy ? <Loader2 className="size-3.5 animate-spin" /> : <MinusSquare className="size-3.5" />}
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded border border-line bg-panel-2 text-subtle outline-none hover:border-primary-line hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          title="复制路径"
          aria-label={`复制 ${change.rootPath} 路径`}
          disabled={busyKey !== null || actionBusy}
          onClick={onCopyPath}
          data-ide-source-control-copy-path
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "grid size-7 place-items-center rounded border border-line bg-panel-2 text-subtle outline-none disabled:cursor-not-allowed disabled:opacity-40",
            change.kind === "untracked"
              ? "hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
              : "hover:border-amber/40 hover:bg-amber-soft hover:text-amber",
          )}
          title={discardActionLabel(change)}
          aria-label={`${discardActionLabel(change)} ${change.rootPath}`}
          disabled={busyKey !== null || actionBusy}
          onClick={onDiscard}
          data-ide-source-control-discard
        >
          {busyKey === `discard:${change.path}` ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
        </button>
      </span>
    </div>
  );
}

export function GitBadge({ label, tone }: { label: string; tone: IdeGitDecoratedChange["tone"] }) {
  return (
    <span
      className={cn(
        "grid min-w-5 place-items-center rounded border px-1 py-0.5 text-2xs font-semibold leading-none",
        tone === "added" && "border-green/40 bg-green-soft text-green",
        tone === "modified" && "border-amber/40 bg-amber-soft text-amber",
        tone === "deleted" && "border-danger/40 bg-danger-soft text-danger",
        tone === "renamed" && "border-primary-line bg-primary-soft text-primary",
        tone === "untracked" && "border-primary-line bg-primary-soft text-primary",
        tone === "conflicted" && "border-danger/50 bg-danger-soft text-danger",
        tone === "unknown" && "border-line bg-panel-2 text-muted",
      )}
    >
      {label}
    </span>
  );
}

function HistoryCommitDetailPanel({
  commit,
  detail,
  loading,
  error,
  busy,
  onCheckout,
  onBranchFrom,
  onRevert,
  onCopyHash,
  onCopyMessage,
  onCopyFiles,
  onFillCommit,
}: {
  commit: GitGraphPayload["commits"][number];
  detail?: GitCommitDetailPayload;
  loading: boolean;
  error?: string;
  busy: boolean;
  onCheckout: () => void;
  onBranchFrom: () => void;
  onRevert: () => void;
  onCopyHash: () => void;
  onCopyMessage: () => void;
  onCopyFiles: () => void;
  onFillCommit: () => void;
}) {
  const files = detail?.files ?? [];
  const parents = detail?.parents ?? commit.parents;
  const body = detail?.body.trim() || "";
  return (
    <div
      className="mt-2 grid min-w-0 gap-2 rounded-md border border-primary-line bg-panel p-2 text-xs shadow-sm"
      data-ide-source-control-history-detail
    >
      <div className="grid min-w-0 gap-1">
        <div className="min-w-0 break-words text-sm font-semibold leading-snug text-ink-strong">
          {detail?.subject || commit.subject || "No subject"}
        </div>
        {body ? <div className="max-h-24 overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-canvas p-2 text-xs leading-relaxed text-muted [scrollbar-width:thin]">{body}</div> : null}
        <div className="grid min-w-0 gap-0.5 font-mono text-2xs text-subtle">
          <div className="truncate">{detail?.hash || commit.hash}</div>
          <div className="truncate">{detail?.authorName || commit.authorName || "unknown"} &lt;{detail?.authorEmail || commit.authorEmail || "unknown"}&gt;</div>
          <div className="truncate">{detail?.date || commit.date || "unknown date"}{commit.refs ? ` · ${commit.refs}` : ""}</div>
          <div className="truncate">parents: {parents.length ? parents.join(", ") : "none"}</div>
        </div>
      </div>

      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-2xs font-semibold text-subtle">相关文件</span>
          {loading ? <span className="inline-flex items-center gap-1 text-2xs text-subtle"><Loader2 className="size-3 animate-spin" />读取中</span> : null}
          {detail ? <span className="rounded border border-line bg-canvas px-1.5 py-0.5 text-2xs text-subtle">{files.length} 个</span> : null}
        </div>
        {error ? <div className="rounded-sm border border-danger/30 bg-danger-soft px-2 py-1 text-2xs text-danger">{error}</div> : null}
        {detail ? (
          files.length ? (
            <div className="max-h-36 overflow-auto rounded-sm border border-line bg-canvas [scrollbar-width:thin]" data-ide-source-control-history-files>
              {files.map((file, index) => (
                <div key={`${file.path}:${file.previousPath ?? ""}:${index}`} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 border-b border-line/60 px-2 py-1 last:border-b-0">
                  <GitBadge label={file.status || labelForGitKind(file.kind)} tone={toneForGitKind(file.kind)} />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-2xs text-ink-strong">{file.path}</div>
                    {file.previousPath ? <div className="truncate font-mono text-2xs text-subtle">from {file.previousPath}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-sm border border-line bg-canvas px-2 py-1 text-2xs text-subtle">这个提交没有可展示的文件列表。</div>
          )
        ) : !loading && !error ? (
          <div className="rounded-sm border border-line bg-canvas px-2 py-1 text-2xs text-subtle">悬停后会读取完整提交详情和文件列表。</div>
        ) : null}
        {detail?.truncated ? <div className="text-2xs text-amber">提交 diff 已截断，文件列表仍可用于快速判断范围。</div> : null}
      </div>

      <div className="flex min-w-0 flex-wrap gap-1.5 border-t border-line pt-2" data-ide-source-control-history-actions>
        <Button variant="outline" size="sm" className="h-7 px-2 text-2xs" disabled={busy} onClick={onCheckout}>
          <GitBranch className="size-3.5" />
          签出
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-2xs" disabled={busy} onClick={onBranchFrom}>
          <PlusSquare className="size-3.5" />
          建分支
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-2xs" disabled={busy} onClick={onRevert}>
          <RefreshCcw className="size-3.5" />
          Revert
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" disabled={busy} onClick={onCopyHash}>
          <Copy className="size-3.5" />
          哈希
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" disabled={busy || !detail} onClick={onCopyMessage}>
          <History className="size-3.5" />
          信息
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" disabled={busy || !detail} onClick={onCopyFiles}>
          <FileDiff className="size-3.5" />
          文件
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" disabled={busy} onClick={onFillCommit}>
          <Sparkles className="size-3.5" />
          填入
        </Button>
      </div>
    </div>
  );
}


function BranchMenuButton({ children, disabled = false, danger = false, icon, onClick }: {
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
        danger ? "text-danger hover:bg-danger-soft" : "hover:bg-panel-2",
        disabled && "pointer-events-none opacity-45",
      )}
      disabled={disabled}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function SourceControlState({ title, description, tone = "default", loading = false }: { title: string; description?: string; tone?: "default" | "muted"; loading?: boolean }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line bg-canvas p-4 text-center text-sm text-muted" data-ide-source-control-empty>
      <div>
        {loading ? <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" /> : tone === "muted" ? <AlertCircle className="mx-auto mb-2 size-5 text-subtle" /> : <FileDiff className="mx-auto mb-2 size-5 text-primary" />}
        <div className="font-medium text-ink-strong">{title}</div>
        {description ? <div className="mt-1 text-xs text-subtle">{description}</div> : null}
      </div>
    </div>
  );
}

function contextMenuStyle(x: number, y: number, width: number, height: number): React.CSSProperties {
  if (typeof window === "undefined") return { left: x, top: y };
  const padding = 8;
  return {
    left: Math.max(padding, Math.min(x, window.innerWidth - width - padding)),
    top: Math.max(padding, Math.min(y, window.innerHeight - height - padding)),
  };
}

function fileName(value: string) {
  const parts = value.split("/").filter(Boolean);
  return parts.at(-1) || value || "/";
}

function formatChangeTooltip(change: IdeGitDecoratedChange): string {
  const parts = [
    `${change.label} ${change.kind}`,
    change.rootPath,
    change.staged ? "已暂存" : null,
    change.unstaged || change.kind === "untracked" ? "未暂存" : null,
    change.previousPath ? `from ${change.previousPath}` : null,
    "右键打开操作菜单",
  ].filter(Boolean);
  return parts.join(" · ");
}

function formatHistoryTooltip(commit: GitGraphPayload["commits"][number]): string {
  return [
    commit.subject || "No subject",
    commit.hash,
    commit.authorName || "unknown",
    commit.date || "unknown date",
    commit.refs || null,
    "悬停或聚焦查看完整提交详情",
  ].filter(Boolean).join(" · ");
}

function discardPathsForChange(change: IdeGitDecoratedChange): string[] {
  return Array.from(new Set([change.path, change.previousPath].filter((value): value is string => Boolean(value))));
}

function discardActionLabel(change: IdeGitDecoratedChange): string {
  return change.kind === "untracked" ? "移除未跟踪文件" : "回退本地修改";
}

function formatHistoryFileChange(file: GitCommitDetailPayload["files"][number]): string {
  return `${file.status || file.kind} ${file.path}${file.previousPath ? ` <- ${file.previousPath}` : ""}`;
}

function gitConfirmTitle(action: GitConfirmAction): string {
  if (action.kind === "discard") return discardActionLabel(action.change);
  if (action.kind === "remote") return remoteActionLabel(action.action);
  if (action.kind === "stash") return stashActionTitle(action.action);
  if (action.kind === "commit-all") return "暂存全部并提交";
  if (action.kind === "history-checkout") return "签出历史提交";
  return "Revert 此提交";
}

function gitConfirmDescription(action: GitConfirmAction, changeCount: number): string {
  if (action.kind === "discard") {
    return action.change.kind === "untracked"
      ? `移除未跟踪文件 ${action.change.path}。Git 没有历史版本可回退，此操作会删除该文件。`
      : `回退 ${action.change.path} 的本地修改，恢复到 HEAD。`;
  }
  if (action.kind === "remote") {
    if (action.action === "pull") {
      return changeCount
        ? `当前工作区有 ${changeCount} 个变更。Pull 使用 git pull --ff-only，仍可能因本地变更失败。`
        : "执行 git pull --ff-only 从 upstream 拉取。";
    }
    if (action.action === "push") return "Push 会更新当前 upstream 远端分支。";
    if (action.action === "publish") return "Publish 会将当前分支推送到 origin 并设置 upstream。";
    return changeCount
      ? `当前工作区有 ${changeCount} 个变更。Sync 会先 git pull --ff-only 再 git push，可能因本地变更失败。`
      : "Sync 会先 git pull --ff-only 再 git push。";
  }
  if (action.kind === "stash") {
    if (action.action === "drop") return `删除 ${action.ref}，不会恢复里面保存的改动。此操作不可撤销。`;
    if (action.action === "pop") return `弹出 ${action.ref}，会恢复改动并删除这条临时保存，可能产生冲突。`;
    return `应用 ${action.ref} 到当前工作区，并保留这条临时保存，可能产生冲突。`;
  }
  if (action.kind === "commit-all") return `当前没有已暂存变更。将先暂存全部 ${action.count} 个变更，然后使用当前提交信息提交。`;
  if (action.kind === "history-checkout") {
    return changeCount
      ? `当前工作区有 ${changeCount} 个变更。签出 ${action.commit.shortHash} 会进入 detached HEAD，可能失败或影响工作区状态。`
      : `签出 ${action.commit.shortHash} 并进入 detached HEAD。建议只用于查看历史状态。`;
  }
  return changeCount
    ? `当前工作区有 ${changeCount} 个变更。Revert ${action.commit.shortHash} 会生成一个反向提交，可能因为冲突失败。`
    : `Revert ${action.commit.shortHash} 会生成一个反向提交，不会重写历史。`;
}

function gitConfirmIcon(action: GitConfirmAction): React.ReactNode {
  if (action.kind === "discard") return <Undo2 />;
  if (action.kind === "remote") return action.action === "push" || action.action === "publish" ? <CloudUpload /> : <CloudDownload />;
  if (action.kind === "stash") return <UploadCloud />;
  if (action.kind === "commit-all") return <CheckCircle2 />;
  if (action.kind === "history-checkout") return <GitBranch />;
  return <RefreshCcw />;
}

function gitConfirmTone(action: GitConfirmAction): "primary" | "danger" | "warning" {
  if (action.kind === "discard" || (action.kind === "stash" && action.action === "drop")) return "danger";
  if (action.kind === "history-checkout" || action.kind === "history-revert" || action.kind === "remote") return "warning";
  return "primary";
}

function gitConfirmLabel(action: GitConfirmAction): string {
  if (action.kind === "discard") return action.change.kind === "untracked" ? "移除文件" : "回退修改";
  if (action.kind === "remote") return remoteActionLabel(action.action);
  if (action.kind === "stash") return stashActionTitle(action.action);
  if (action.kind === "commit-all") return "暂存并提交";
  if (action.kind === "history-checkout") return "签出提交";
  return "Revert 提交";
}

function remoteActionLabel(kind: RemoteActionKind): string {
  if (kind === "pull") return "Pull";
  if (kind === "push") return "Push";
  if (kind === "publish") return "Publish";
  return "Sync";
}

function stashActionTitle(kind: StashConfirmKind): string {
  if (kind === "apply") return "应用临时保存";
  if (kind === "pop") return "弹出临时保存";
  return "删除临时保存";
}

function branchActionIcon(kind: BranchActionKind): React.ReactNode {
  if (kind === "checkout") return <GitBranch />;
  if (kind === "rename") return <Pencil />;
  if (kind === "delete") return <Trash2 />;
  if (kind === "set-upstream") return <Link2 />;
  return <Unlink />;
}

function branchActionTitle(kind: BranchActionKind): string {
  if (kind === "checkout") return "切换分支";
  if (kind === "rename") return "重命名分支";
  if (kind === "delete") return "删除本地分支";
  if (kind === "set-upstream") return "设置 upstream";
  return "取消 upstream";
}

function branchActionConfirmLabel(kind: BranchActionKind): string {
  if (kind === "checkout") return "确认切换";
  if (kind === "rename") return "确认重命名";
  if (kind === "delete") return "确认删除";
  if (kind === "set-upstream") return "确认设置";
  return "确认取消";
}

function branchActionDescription(action: BranchActionDraft, changeCount: number): string {
  if (action.kind === "checkout") {
    return changeCount
      ? `当前工作区有 ${changeCount} 个未提交变更。Git 会尝试切换到“${action.branchName}”，若有冲突会失败。`
      : `切换到本地分支“${action.branchName}”。`;
  }
  if (action.kind === "rename") {
    return `将本地分支“${action.branchName}”改名为新名称，不会自动改远端分支名。`;
  }
  if (action.kind === "delete") {
    return `只删除本地分支“${action.branchName}”，不会删除远端分支；请输入完整分支名确认。`;
  }
  if (action.kind === "set-upstream") {
    return `为“${action.branchName}”设置跟踪的远端分支，例如 origin/main。`;
  }
  return `取消“${action.branchName}”的 upstream 关联，不会删除远端分支。`;
}

function branchActionRequiresInput(kind: BranchActionKind): boolean {
  return kind === "rename" || kind === "delete" || kind === "set-upstream";
}

function branchActionInputLabel(kind: BranchActionKind): string {
  if (kind === "rename") return "新分支名";
  if (kind === "delete") return "输入完整分支名";
  return "upstream";
}

function branchActionPlaceholder(action: BranchActionDraft): string {
  if (action.kind === "rename") return action.branchName;
  if (action.kind === "delete") return action.branchName;
  return `origin/${action.branchName}`;
}

function validateBranchActionDraft(action: BranchActionDraft): string | null {
  const value = action.value.trim();
  if (action.kind === "rename") {
    if (!value) return "请输入新分支名";
    if (value === action.branchName) return "新分支名不能和原名称相同";
    return validateBranchName(value);
  }
  if (action.kind === "delete") {
    if (value !== action.branchName) return "请输入完整分支名确认删除";
    return null;
  }
  if (action.kind === "set-upstream") {
    if (!value) return "请输入 upstream，例如 origin/main";
    return validateBranchName(value);
  }
  return null;
}

function validateBranchName(value: string): string | null {
  const name = value.trim();
  if (!name) return null;
  if (name.length > 120) return "分支名过长";
  if (name === "HEAD") return "不能使用 HEAD 作为分支名";
  if (name.startsWith("/") || name.endsWith("/") || name.startsWith(".")) return "分支名不能以 / 或 . 开头，也不能以 / 结尾";
  if (name.endsWith(".lock")) return "分支名不能以 .lock 结尾";
  if (name.includes("..") || name.includes("@{") || name.includes("//")) return "分支名不能包含 ..、@{ 或连续 /";
  if (/[\s~^:?*\[\]\\]/.test(name)) return "分支名不能包含空白或 ~ ^ : ? * [ ] \\";
  return null;
}
