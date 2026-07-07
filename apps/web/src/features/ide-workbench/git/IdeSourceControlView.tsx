import * as React from "react";
import { AlertCircle, CheckCircle2, CloudDownload, CloudUpload, FileDiff, GitBranch, Loader2, MinusSquare, PlusSquare, RefreshCcw, UploadCloud } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { applyGitStash, checkoutBranch, commitFiles, createBranch, dropGitStash, fetchBranch, getGitStashes, popGitStash, publishBranch, pullBranch, pushBranch, saveGitStash, stageFiles, syncBranch, unstageFiles } from "@/lib/api/git";
import { appendWorkbenchOutput } from "../output";
import type { GitStashEntry } from "../../../../../../types/git";
import type { IdeGitDecoratedChange, IdeGitDecorationSnapshot } from "./gitDecorations";

export interface IdeSourceControlViewProps {
  hidden: boolean;
  rootId: string;
  rootLabel: string;
  git: IdeGitDecorationSnapshot & { loading: boolean; error: string | null; refresh: () => void };
  onOpenDiff: (request: { rootId: string; change: IdeGitDecoratedChange }) => void;
}

export function IdeSourceControlView({ hidden, rootId, rootLabel, git, onOpenDiff }: IdeSourceControlViewProps) {
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [commitMessage, setCommitMessage] = React.useState("");
  const [branchName, setBranchName] = React.useState("");
  const [stashMessage, setStashMessage] = React.useState("");
  const [stashes, setStashes] = React.useState<GitStashEntry[]>([]);
  const [stashLoading, setStashLoading] = React.useState(false);
  const [stashError, setStashError] = React.useState<string | null>(null);
  const [stashRefreshTick, setStashRefreshTick] = React.useState(0);
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

  const runRemoteAction = React.useCallback(async (kind: "fetch" | "pull" | "push" | "publish" | "sync") => {
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
    if (confirmText[kind] && !window.confirm(confirmText[kind])) return;
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

  const runBranchAction = React.useCallback(async (kind: "create" | "checkout", target?: string) => {
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
    if (!branch || branch === status.branch) return;
    if (git.changes.length && !window.confirm(`当前工作区有 ${git.changes.length} 个变更。切换分支可能失败或影响工作区状态。继续 checkout ${branch}？`)) return;
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
  }, [branchName, busyKey, git, refreshGitAndStashes, rootId]);

  const runStashAction = React.useCallback(async (kind: "save" | "apply" | "pop" | "drop", ref?: string) => {
    const status = git.status;
    if (!status?.available || busyKey) return;
    const labels: Record<typeof kind, string> = { save: "保存储藏", apply: "应用储藏", pop: "弹出储藏", drop: "删除储藏" };
    if (kind === "save") {
      if (!git.changes.length) {
        toast.error("没有可储藏的变更");
        return;
      }
      setBusyKey("stash:save");
      try {
        await saveGitStash({ rootId, path: status.directoryPath, message: stashMessage.trim() || "Tracevane IDE stash", includeUntracked: true });
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "info", text: "git stash push --include-untracked" });
        toast.success("已保存储藏");
        setStashMessage("");
        refreshGitAndStashes();
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        appendWorkbenchOutput({ channel: { id: "git", label: "Git", kind: "custom" }, level: "error", text: `stash save failed: ${message}` });
        toast.error("保存储藏失败", { description: message });
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
    if (!window.confirm(confirmText)) return;
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

  const runCommit = React.useCallback(async () => {
    const status = git.status;
    const message = commitMessage.trim();
    const stagedCount = git.changes.filter((change) => change.staged).length;
    if (!status?.available || busyKey) return;
    if (!stagedCount) {
      toast.error("没有已暂存的变更", { description: "请先暂存需要提交的文件。" });
      return;
    }
    if (!message) {
      toast.error("提交信息不能为空");
      return;
    }
    setBusyKey("commit:staged");
    try {
      await commitFiles({ rootId, path: status.directoryPath, message });
      appendWorkbenchOutput({
        channel: { id: "git", label: "Git", kind: "custom" },
        level: "info",
        text: `commit ${stagedCount} staged file${stagedCount === 1 ? "" : "s"}: ${message.split("\n")[0]}`,
      });
      toast.success("已提交暂存变更");
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
  }, [busyKey, commitMessage, git, refreshGitAndStashes, rootId]);

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;
  const status = git.status;
  const stagedChanges = git.changes.filter((change) => change.staged);
  const unstagedChanges = git.changes.filter((change) => change.unstaged || change.kind === "untracked");
  const untrackedChanges = git.changes.filter((change) => change.kind === "untracked");
  const unstagedTrackedChanges = git.changes.filter((change) => change.unstaged && change.kind !== "untracked");
  const trackingLabel = formatTracking(status?.upstream ?? null, status?.ahead ?? 0, status?.behind ?? 0);
  const branchNameValidation = validateBranchName(branchName);
  const canCreateBranch = Boolean(branchName.trim()) && !branchNameValidation;
  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-r border-line bg-panel" data-ide-sidebar data-ide-source-control-view>
      <div className="border-b border-line bg-panel px-3 py-2" data-ide-source-control-toolbar>
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">源代码管理</div>
            <div className="truncate text-xs text-subtle">{rootLabel || "Workspace Git"}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={git.refresh} aria-label="刷新 Git 状态" title="刷新 Git 状态" data-ide-source-control-refresh>
            {git.loading ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
          </Button>
        </div>
        <div className="mt-2 grid gap-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-muted" data-ide-source-control-summary>
          {status?.available ? (
            <>
              <div className="flex min-w-0 items-center gap-1.5" data-ide-source-control-branch-summary>
                <span className="font-medium text-ink-strong" data-ide-source-control-branch>{status.branch || "HEAD"}</span>
                {status.upstream ? (
                  <span className="truncate text-subtle" data-ide-source-control-upstream>→ {status.upstream}</span>
                ) : (
                  <span className="truncate text-subtle" data-ide-source-control-upstream>无 upstream</span>
                )}
                {status.ahead || status.behind ? (
                  <span className="ml-auto shrink-0 text-primary" data-ide-source-control-ahead-behind>↑{status.ahead} ↓{status.behind}</span>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-subtle" data-ide-source-control-change-summary>
                <span data-ide-source-control-change-count>{git.changes.length} 变更</span>
                <span data-ide-source-control-staged-count>{stagedChanges.length} 暂存</span>
                <span data-ide-source-control-unstaged-count>{unstagedTrackedChanges.length} 未暂存</span>
                <span data-ide-source-control-untracked-count>{untrackedChanges.length} 未跟踪</span>
                {trackingLabel ? <span className="text-muted" data-ide-source-control-tracking-label>{trackingLabel}</span> : null}
              </div>
            </>
          ) : git.error ? (
            <span className="text-danger">{git.error}</span>
          ) : (
            <span>{status?.message || "当前目录不是 Git 仓库，或 Git 状态不可用。"}</span>
          )}
        </div>
        {status?.available ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1" data-ide-source-control-remote-actions>
            <Button
              variant="outline"
              size="sm"
              className="h-7 justify-center text-xs"
              disabled={busyKey !== null}
              onClick={() => void runRemoteAction("fetch")}
              data-ide-source-control-fetch
            >
              {busyKey === "remote:fetch" ? <Loader2 className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />}
              Fetch
            </Button>
            {status.behind > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 justify-center text-xs"
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
                variant="outline"
                size="sm"
                className="h-7 justify-center text-xs"
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
                variant="outline"
                size="sm"
                className="h-7 justify-center text-xs"
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
                variant="outline"
                size="sm"
                className="h-7 justify-center text-xs"
                disabled={busyKey !== null}
                onClick={() => void runRemoteAction("sync")}
                data-ide-source-control-sync
              >
                {busyKey === "remote:sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
                Sync
              </Button>
            ) : null}
          </div>
        ) : null}
        {status?.available ? (
          <div className="mt-2 grid gap-2 rounded-md border border-line bg-panel-2 p-2" data-ide-source-control-branches>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-strong">
              <span>分支</span>
              <span className="text-2xs font-normal text-subtle" data-ide-source-control-branch-count>{status.branches.length} 个</span>
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
                className="h-7 shrink-0 justify-center text-xs"
                disabled={busyKey !== null || !canCreateBranch}
                onClick={() => void runBranchAction("create")}
                data-ide-source-control-create-branch
              >
                {busyKey === "branch:create" ? <Loader2 className="size-3.5 animate-spin" /> : <PlusSquare className="size-3.5" />}
                创建
              </Button>
            </div>
            {branchNameValidation ? <div className="text-2xs text-danger" data-ide-source-control-branch-error>{branchNameValidation}</div> : null}
            <div className="grid max-h-32 gap-1 overflow-auto pr-1 [scrollbar-width:thin]" data-ide-source-control-branch-list>
              {status.branches.length ? status.branches.map((branch) => (
                <div key={branch.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border border-line bg-canvas px-2 py-1 text-xs" data-ide-source-control-branch-row data-ide-source-control-branch-name-value={branch.name} data-ide-source-control-branch-current={branch.current ? "true" : "false"}>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-strong">{branch.current ? "● " : ""}{branch.name}</div>
                    <div className="truncate text-2xs text-subtle">{branch.upstream || branch.shortHash || branch.subject || "local branch"}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-2xs"
                    disabled={busyKey !== null || branch.current || stashLoading}
                    onClick={() => void runBranchAction("checkout", branch.name)}
                    data-ide-source-control-checkout-branch
                  >
                    {busyKey === `branch:checkout:${branch.name}` ? <Loader2 className="size-3 animate-spin" /> : null}
                    切换
                  </Button>
                </div>
              )) : <span className="text-xs text-muted">暂无分支列表。</span>}
            </div>
          </div>
        ) : null}

        {status?.available ? (
          <div className="mt-2 grid gap-2 rounded-md border border-line bg-panel-2 p-2" data-ide-source-control-stashes>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-strong">
              <span>储藏</span>
              <button type="button" className="text-2xs text-subtle hover:text-primary" onClick={() => setStashRefreshTick((value) => value + 1)} disabled={stashLoading} data-ide-source-control-refresh-stashes>{stashLoading ? "读取中" : `${stashes.length} 个`}</button>
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <input
                className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus:shadow-[var(--ring)]"
                value={stashMessage}
                onChange={(event) => setStashMessage(event.target.value)}
                placeholder="储藏说明（可选）"
                aria-label="Git stash message"
                disabled={busyKey !== null}
                data-ide-source-control-stash-message
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 justify-center text-xs"
                disabled={busyKey !== null || git.changes.length === 0}
                onClick={() => void runStashAction("save")}
                data-ide-source-control-save-stash
              >
                {busyKey === "stash:save" ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                保存
              </Button>
            </div>
            {stashError ? <div className="text-2xs text-danger" data-ide-source-control-stash-error>{stashError}</div> : null}
            <div className="grid max-h-36 gap-1 overflow-auto pr-1 [scrollbar-width:thin]" data-ide-source-control-stash-list>
              {stashLoading && !stashes.length ? <span className="text-xs text-muted">正在读取储藏…</span> : null}
              {!stashLoading && !stashes.length ? <span className="text-xs text-muted">暂无储藏。</span> : null}
              {stashes.map((stash) => (
                <div key={stash.ref} className="grid min-w-0 gap-1 rounded border border-line bg-canvas px-2 py-1 text-xs" data-ide-source-control-stash-row data-ide-source-control-stash-ref={stash.ref}>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-strong">{stash.ref}</div>
                    <div className="truncate text-2xs text-subtle">{stash.branch || "stash"} · {stash.message || "No message"}</div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" disabled={busyKey !== null || stashLoading} onClick={() => void runStashAction("apply", stash.ref)} data-ide-source-control-apply-stash>应用</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" disabled={busyKey !== null || stashLoading} onClick={() => void runStashAction("pop", stash.ref)} data-ide-source-control-pop-stash>弹出</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs text-danger hover:text-danger" disabled={busyKey !== null || stashLoading} onClick={() => void runStashAction("drop", stash.ref)} data-ide-source-control-drop-stash>删除</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {status?.available ? (
          <div className="mt-2 grid gap-2" data-ide-source-control-commit-box>
            <textarea
              className="min-h-16 w-full resize-y rounded-md border border-line bg-canvas px-2 py-2 text-sm text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="提交信息"
              aria-label="Git 提交信息"
              disabled={busyKey !== null}
              data-ide-source-control-commit-message
            />
            <Button
              variant="default"
              size="sm"
              className="h-8 justify-center text-xs"
              disabled={busyKey !== null || stagedChanges.length === 0 || !commitMessage.trim()}
              onClick={() => void runCommit()}
              data-ide-source-control-commit
            >
              {busyKey === "commit:staged" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              提交已暂存
            </Button>
          </div>
        ) : null}
        {status?.available && git.changes.length ? (
          <div className="mt-2 grid grid-cols-2 gap-1" data-ide-source-control-bulk-actions>
            <Button
              variant="outline"
              size="sm"
              className="h-7 justify-center text-xs"
              disabled={busyKey !== null || unstagedChanges.length === 0}
              onClick={() => void runGitAction("stage", [], "已暂存全部变更")}
              data-ide-source-control-stage-all
            >
              <PlusSquare className="size-3.5" />
              全部暂存
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 justify-center text-xs"
              disabled={busyKey !== null || stagedChanges.length === 0}
              onClick={() => void runGitAction("unstage", [], "已取消暂存全部变更")}
              data-ide-source-control-unstage-all
            >
              <MinusSquare className="size-3.5" />
              全部取消
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 overflow-auto p-2 [scrollbar-width:thin]" data-ide-source-control-changes>
        {git.loading && !status ? (
          <SourceControlState title="正在读取 Git 状态…" loading />
        ) : !status?.available ? (
          <SourceControlState title="没有可用的 Git 仓库" description={status?.message || git.error || "请选择 Git 工作区目录。"} tone="muted" />
        ) : git.changes.length === 0 ? (
          <SourceControlState title="工作区干净" description="当前没有 Git 文件变更。" />
        ) : (
          <div className="grid gap-1" role="list" aria-label="Git 文件变更列表">
            {git.changes.map((change) => (
              <SourceControlChangeRow
                key={`${change.status}:${change.rootPath}:${change.previousPath ?? ""}`}
                change={change}
                busyKey={busyKey}
                onOpen={() => onOpenDiff({ rootId, change })}
                onStage={() => void runGitAction("stage", [change.path], `已暂存 ${change.path}`)}
                onUnstage={() => void runGitAction("unstage", [change.path], `已取消暂存 ${change.path}`)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function SourceControlChangeRow({
  change,
  busyKey,
  onOpen,
  onStage,
  onUnstage,
}: {
  change: IdeGitDecoratedChange;
  busyKey: string | null;
  onOpen: () => void;
  onStage: () => void;
  onUnstage: () => void;
}) {
  const actionBusy = busyKey === `stage:${change.path}` || busyKey === `unstage:${change.path}`;
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

function fileName(value: string) {
  const parts = value.split("/").filter(Boolean);
  return parts.at(-1) || value || "/";
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

function formatTracking(upstream: string | null, ahead: number, behind: number): string {
  if (!upstream) return "未设置远端跟踪";
  if (ahead > 0 && behind > 0) return `领先 ${ahead} / 落后 ${behind}`;
  if (ahead > 0) return `领先 ${ahead}`;
  if (behind > 0) return `落后 ${behind}`;
  return "已同步 upstream";
}
