import * as React from "react";
import { AlertCircle, FileDiff, GitBranch, Loader2, RefreshCcw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import type { IdeGitDecoratedChange, IdeGitDecorationSnapshot } from "./gitDecorations";

export interface IdeSourceControlViewProps {
  hidden: boolean;
  rootId: string;
  rootLabel: string;
  git: IdeGitDecorationSnapshot & { loading: boolean; error: string | null; refresh: () => void };
  onOpenDiff: (request: { rootId: string; change: IdeGitDecoratedChange }) => void;
}

export function IdeSourceControlView({ hidden, rootId, rootLabel, git, onOpenDiff }: IdeSourceControlViewProps) {
  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;
  const status = git.status;
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
        <div className="mt-2 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-muted" data-ide-source-control-summary>
          {status?.available ? (
            <>
              <span className="font-medium text-ink-strong">{status.branch || "HEAD"}</span>
              <span className="mx-1 text-subtle">·</span>
              <span>{git.changes.length} 个变更</span>
              {status.ahead || status.behind ? <span className="ml-1">↑{status.ahead} ↓{status.behind}</span> : null}
            </>
          ) : git.error ? (
            <span className="text-danger">{git.error}</span>
          ) : (
            <span>{status?.message || "当前目录不是 Git 仓库，或 Git 状态不可用。"}</span>
          )}
        </div>
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
                onOpen={() => onOpenDiff({ rootId, change })}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function SourceControlChangeRow({ change, onOpen }: { change: IdeGitDecoratedChange; onOpen: () => void }) {
  const disabled = false;
  return (
    <button
      type="button"
      className={cn(
        "group grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left outline-none focus-visible:shadow-[var(--ring)]",
        disabled ? "cursor-default opacity-75" : "hover:border-primary-line hover:bg-primary-soft/50",
      )}
      onClick={() => { if (!disabled) onOpen(); }}
      disabled={disabled}
      data-ide-source-control-change
      data-ide-source-control-change-path={change.rootPath}
      data-ide-source-control-change-kind={change.kind}
    >
      <GitBadge label={change.label} tone={change.tone} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink-strong">{fileName(change.rootPath)}</span>
        <span className="block truncate font-mono text-2xs text-subtle">{change.rootPath}</span>
        {change.previousPath ? <span className="block truncate font-mono text-2xs text-subtle">from {change.previousPath}</span> : null}
      </span>
    </button>
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
