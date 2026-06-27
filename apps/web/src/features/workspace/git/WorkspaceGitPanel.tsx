import * as React from "react";
import {
  GitBranch,
  GitCommitHorizontal,
  Plus,
  Minus,
  FileDiff,
  RefreshCw,
  Sparkles,
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
  useCheckoutBranchMutation,
  useCommitFilesMutation,
  useCreateBranchMutation,
  useGitStatusQuery,
  useStageFilesMutation,
  useUnstageFilesMutation,
} from "@/lib/query/git";
import type {
  GitBranchSummary,
  GitFileChange,
  GitFileChangeKind,
} from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";
import {
  createGitChangeActions,
  type GitChangeAction,
} from "./gitChangeActions";
import { createGitPanelCommands } from "./gitPanelCommands";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WorkspaceGitPanelProps {
  /** Root id the Git panel is scoped to. */
  rootId: string;
  /**
   * Fired when a changed file row is activated (click). A later task wires
   * this to the editor diff view; until then the parent may store the target
   * path in WorkspaceWorkbench state.
   */
  onOpenDiff?: (file: string) => void;
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
  onCommandsChange,
}: WorkspaceGitPanelProps) {
  const status = useGitStatusQuery(rootId ? { rootId } : null);

  // --- Write hooks ----------------------------------------------------------
  const stage = useStageFilesMutation();
  const unstage = useUnstageFilesMutation();
  const commit = useCommitFilesMutation();
  const createBranch = useCreateBranchMutation();
  const checkout = useCheckoutBranchMutation();

  // --- Commit message -------------------------------------------------------
  const [message, setMessage] = React.useState("");
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    change: GitFileChange;
  } | null>(null);

  const available = status.data?.available ?? false;
  const branch = status.data?.branch ?? "";
  const branches = status.data?.branches ?? [];
  const changes = status.data?.changes ?? [];
  const commits = status.data?.commits ?? [];

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

  const hasStaged = staged.length > 0;
  const messageTrim = message.trim();
  const canCommit = hasStaged && messageTrim.length > 0 && !commit.isPending;

  React.useEffect(() => {
    const refresh = () => void status.refetch();
    window.addEventListener("tracevane:workspace-git-refresh", refresh);
    return () =>
      window.removeEventListener("tracevane:workspace-git-refresh", refresh);
  }, [status]);

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  // --- Handlers -------------------------------------------------------------
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

  const handleCommit = () => {
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
  };

  const handleCheckout = (target: string) => {
    if (!target || target === branch) return;
    checkout.mutate(
      { rootId, target },
      {
        onError: (err) =>
          toast.error("切换分支失败", { description: err.message }),
      },
    );
  };

  const refreshStatus = React.useCallback(
    () => void status.refetch(),
    [status.refetch],
  );

  const copyBranch = React.useCallback(
    (value: string) => void navigator.clipboard.writeText(value),
    [],
  );

  const explainStatus = React.useCallback(
    () =>
      toast.info("AI Git 总结入口已预留", {
        description:
          "后续会接入 Tracevane Gateway 的 @git status / @git diff context。",
      }),
    [],
  );

  const gitCommands = React.useMemo(
    () =>
      createGitPanelCommands({
        branch,
        staged,
        unstaged,
        untracked,
        pending: stage.isPending || unstage.isPending || checkout.isPending,
        refreshStatus,
        stageFiles: handleStageFiles,
        unstageFiles: handleUnstageFiles,
        copyBranch,
        explainStatus,
      }),
    [
      branch,
      checkout.isPending,
      copyBranch,
      explainStatus,
      handleStageFiles,
      handleUnstageFiles,
      refreshStatus,
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
    <PanelShell>
      {/* Branch header */}
      <BranchHeader
        branch={branch}
        branches={branches}
        pending={checkout.isPending || createBranch.isPending}
        onCheckout={handleCheckout}
        onCreate={(name) =>
          createBranch.mutate(
            { rootId, name, checkout: true },
            {
              onError: (err) =>
                toast.error("新建分支失败", { description: err.message }),
            },
          )
        }
      />

      {/* Change groups */}
      <div className="min-h-0 flex-1 overflow-auto">
        <ChangeGroup
          title="已暂存的更改"
          count={staged.length}
          emptyHint="没有已暂存的更改"
        >
          {staged.map((c) => (
            <ChangeRow
              key={`staged:${c.path}`}
              change={c}
              onOpen={() => onOpenDiff?.(c.path)}
              onContextMenu={(event) =>
                setMenu({ x: event.clientX, y: event.clientY, change: c })
              }
              onUnstage={() => handleUnstage(c.path)}
              pending={unstage.isPending}
            />
          ))}
        </ChangeGroup>

        <ChangeGroup
          title="更改"
          count={unstaged.length}
          emptyHint="没有未暂存的更改"
        >
          {unstaged.map((c) => (
            <ChangeRow
              key={`unstaged:${c.path}`}
              change={c}
              onOpen={() => onOpenDiff?.(c.path)}
              onContextMenu={(event) =>
                setMenu({ x: event.clientX, y: event.clientY, change: c })
              }
              onStage={() => handleStage(c.path)}
              pending={stage.isPending}
            />
          ))}
        </ChangeGroup>

        <ChangeGroup
          title="未跟踪"
          count={untracked.length}
          emptyHint="没有未跟踪的文件"
        >
          {untracked.map((c) => (
            <ChangeRow
              key={`untracked:${c.path}`}
              change={c}
              onOpen={() => onOpenDiff?.(c.path)}
              onContextMenu={(event) =>
                setMenu({ x: event.clientX, y: event.clientY, change: c })
              }
              onStage={() => handleStage(c.path)}
              pending={stage.isPending}
            />
          ))}
        </ChangeGroup>

        {/* Recent commits (evidence) */}
        {commits.length > 0 && (
          <div className="mt-2 border-t border-line px-3 py-2">
            <span className="text-2xs uppercase tracking-[.1em] text-subtle">
              最近提交
            </span>
            <div className="mt-1 grid gap-1">
              {commits.slice(0, 5).map((c) => (
                <div
                  key={c.hash}
                  className="flex items-center gap-2 text-xs text-muted"
                >
                  <GitCommitHorizontal className="size-3.5 shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  <code className="shrink-0 font-mono text-2xs text-subtle">
                    {c.shortHash}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {menu ? (
        <GitChangeContextMenu
          x={menu.x}
          y={menu.y}
          change={menu.change}
          actions={createGitChangeActions({
            change: menu.change,
            openDiff: (path) => onOpenDiff?.(path),
            stageFile: !menu.change.staged ? handleStage : undefined,
            unstageFile: menu.change.staged ? handleUnstage : undefined,
            copyPath: (path) => void navigator.clipboard.writeText(path),
            explainDiff: () =>
              toast.info("AI Diff 解释入口已预留", {
                description:
                  "后续会接入 Tracevane Gateway 的 @git diff context。",
              }),
          })}
          onActionComplete={() => setMenu(null)}
        />
      ) : null}

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
        <div className="mt-1.5 flex items-center gap-2">
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

// ---------------------------------------------------------------------------
// PanelShell — shared outer chrome (header label)
// ---------------------------------------------------------------------------

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
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

// ---------------------------------------------------------------------------
// BranchHeader — current branch + switcher + new-branch action
// ---------------------------------------------------------------------------

interface BranchHeaderProps {
  branch: string;
  branches: GitBranchSummary[];
  pending: boolean;
  onCheckout: (target: string) => void;
  onCreate: (name: string) => void;
}

function BranchHeader({
  branch,
  branches,
  pending,
  onCheckout,
  onCreate,
}: BranchHeaderProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  const submitCreate = () => {
    const name = draftName.trim();
    if (!name) return;
    onCreate(name);
    setDraftName("");
    setDialogOpen(false);
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
        >
          {branches.length === 0 ? (
            <option value={branch}>{branch || "—"}</option>
          ) : (
            branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.current ? " ✓" : ""}
              </option>
            ))
          )}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-2xs"
          disabled={pending}
          onClick={() => setDialogOpen(true)}
          title="新建分支"
        >
          <GitBranch className="size-3.5" />
          新建分支
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
              />
            </label>
            <p className="mt-2 text-2xs text-subtle">
              将从当前 HEAD ({branch || "—"}) 创建并切换到新分支。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
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

// ---------------------------------------------------------------------------
// ChangeGroup — section header with count + children
// ---------------------------------------------------------------------------

interface ChangeGroupProps {
  title: string;
  count: number;
  emptyHint: string;
  children: React.ReactNode;
}

function ChangeGroup({ title, count, emptyHint, children }: ChangeGroupProps) {
  return (
    <section className="border-b border-line py-1.5">
      <div className="flex items-center gap-1.5 px-2.5 py-1">
        <span className="text-2xs font-semibold uppercase tracking-[.08em] text-subtle">
          {title}
        </span>
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
  onOpen: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  pending: boolean;
}

function ChangeRow({
  change,
  onOpen,
  onStage,
  onUnstage,
  onContextMenu,
  pending,
}: ChangeRowProps) {
  const t = changeTone(change.kind);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left outline-none transition-colors",
        "focus-visible:shadow-[var(--ring)]",
        "hover:bg-panel-2",
      )}
    >
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
      className="fixed z-50 min-w-52 rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={{ left: x, top: y }}
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
      disabled={action.disabled}
      data-git-change-action={action.id}
      onClick={() => {
        action.run();
        onActionComplete();
      }}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
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
