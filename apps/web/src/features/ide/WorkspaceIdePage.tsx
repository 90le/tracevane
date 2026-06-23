import * as React from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Home,
  Lock,
  RefreshCw,
  SquareTerminal,
  Terminal,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { WorkbenchLayout } from "@/shared/layouts/WorkbenchLayout";
import { CodeBlock, DiffView } from "@/shared/diff/DiffView";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import {
  useFilesBrowseQuery,
  useFilesSummaryQuery,
  useFileReadQuery,
} from "@/lib/query/files";
import { useGitDiffQuery, useGitStatusQuery } from "@/lib/query/git";
import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import { useTerminalSessionsQuery } from "@/lib/query/terminal";

import {
  IDE_PANEL_TABS,
  type FileEntrySummary,
  type FileRootSummary,
  type GitCommitSummary,
  type GitFileChange,
  type GitFileChangeKind,
  type IdePanelTab,
  type IdeViewerMode,
  type TerminalSessionDescriptor,
  type WorkbenchTone,
} from "./types";

// ---------------------------------------------------------------------------
// Small presentational helpers (Aurora tokens only)
// ---------------------------------------------------------------------------

const TONE_BADGE: Record<WorkbenchTone, React.ComponentProps<typeof Badge>["variant"]> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "info",
  mute: "mute",
};

function ToneBadge({ tone, children }: { tone: WorkbenchTone; children: React.ReactNode }) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

function formatBytes(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/** Map a git change kind to a tone + short Chinese label. */
function changeTone(kind: GitFileChangeKind): { tone: WorkbenchTone; label: string } {
  switch (kind) {
    case "added":
      return { tone: "ok", label: "新增" };
    case "modified":
      return { tone: "warn", label: "修改" };
    case "deleted":
      return { tone: "bad", label: "删除" };
    case "renamed":
      return { tone: "info", label: "重命名" };
    case "copied":
      return { tone: "info", label: "复制" };
    case "untracked":
      return { tone: "mute", label: "未跟踪" };
    case "conflicted":
      return { tone: "bad", label: "冲突" };
    default:
      return { tone: "mute", label: "变更" };
  }
}

function terminalStatusTone(status: string): { tone: WorkbenchTone; label: string } {
  switch (status) {
    case "running":
      return { tone: "ok", label: "运行中" };
    case "detached":
      return { tone: "warn", label: "已分离" };
    case "completed":
      return { tone: "mute", label: "已完成" };
    case "failed":
    case "lost":
      return { tone: "bad", label: status === "failed" ? "失败" : "丢失" };
    default:
      return { tone: "info", label: status || "未知" };
  }
}

/** Code-ish file extensions get the code icon; everything else the text icon. */
function fileIcon(ext: string | null): React.ReactNode {
  const e = (ext ?? "").toLowerCase();
  const codey = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss",
    ".html", ".sh", ".py", ".go", ".rs", ".toml", ".yml", ".yaml", ".sql",
  ]);
  return codey.has(e) ? <FileCode2 /> : <FileText />;
}

/** Pick the diff format tag for CodeBlock/DiffView. */
function formatTag(ext: string | null): "json" | "toml" | null {
  const e = (ext ?? "").toLowerCase();
  if (e === ".json") return "json";
  if (e === ".toml") return "toml";
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Selection {
  path: string;
  name: string;
  ext: string | null;
}

/**
 * Workspace IDE (`/ide`) — a read/evidence workbench over the live Files + Git +
 * Terminal GET APIs. File explorer (left) → viewer (center) → bottom panel
 * (Git changes / persisted terminal sessions). Read-only this pass; the
 * write/run/PTY-attach/AI-diff track is the future Workspace IDE and is
 * surfaced only as an inline note + deep-links, never as fake controls.
 */
export function WorkspaceIdePage() {
  // --- Root resolution -----------------------------------------------------
  const summary = useFilesSummaryQuery();
  const roots = summary.data?.roots ?? [];
  const projectRoot: FileRootSummary | undefined = React.useMemo(() => {
    if (roots.length === 0) return undefined;
    return (
      roots.find((r) => r.id === "project-root") ||
      roots.find((r) => r.preferred === true) ||
      roots.find((r) => r.id === summary.data?.defaultRootId) ||
      roots[0]
    );
  }, [roots, summary.data?.defaultRootId]);
  const rootId = projectRoot?.id ?? "";

  // --- Directory navigation ------------------------------------------------
  const [dirPath, setDirPath] = React.useState<string>("");
  const directory = useFilesBrowseQuery(
    rootId ? { rootId, path: dirPath, hidden: false, pageSize: 200 } : null,
  );
  const entries = directory.data?.entries ?? [];
  const breadcrumbs = directory.data?.breadcrumbs ?? [];
  const parentPath = directory.data?.parentPath ?? null;

  // --- Selection + viewer --------------------------------------------------
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [mode, setMode] = React.useState<IdeViewerMode>("content");

  const fileRead = useFileReadQuery(
    selection ? { rootId, path: selection.path } : null,
  );

  // --- Git -----------------------------------------------------------------
  const gitStatus = useGitStatusQuery(rootId ? { rootId } : null);
  const changes = gitStatus.data?.changes ?? [];
  const commits = gitStatus.data?.commits ?? [];
  const changedPaths = React.useMemo(
    () => new Set(changes.map((c) => c.path)),
    [changes],
  );
  const selectedHasChange = selection ? changedPaths.has(selection.path) : false;

  const gitDiff = useGitDiffQuery(
    selection && mode === "diff" && selectedHasChange
      ? {
          rootId,
          file: selection.path,
          untracked: changes.find((c) => c.path === selection.path)?.kind === "untracked",
        }
      : null,
  );

  // --- Terminal evidence (reused hooks) ------------------------------------
  const [panelTab, setPanelTab] = React.useState<IdePanelTab>("git");
  const terminalStatus = useTerminalStatusQuery();
  const terminalSessions = useTerminalSessionsQuery();
  const sessions = terminalSessions.data?.sessions ?? [];
  const agentBinaries = (terminalStatus.data?.binaries ?? []).filter(
    (b) => b.category === "agent",
  );

  // When the selected file has no change, force content mode.
  React.useEffect(() => {
    if (mode === "diff" && !selectedHasChange) setMode("content");
  }, [mode, selectedHasChange]);

  const openEntry = (entry: FileEntrySummary) => {
    if (entry.kind === "directory") {
      setDirPath(entry.path);
      return;
    }
    setSelection({ path: entry.path, name: entry.name, ext: entry.ext });
    setMode("content");
  };

  const openChange = (change: GitFileChange) => {
    setSelection({
      path: change.path,
      name: change.path.split("/").pop() || change.path,
      ext: change.path.includes(".") ? `.${change.path.split(".").pop()}` : null,
    });
    setMode("diff");
  };

  const refreshAll = () => {
    void directory.refetch();
    void gitStatus.refetch();
    if (selection) void fileRead.refetch();
  };

  const branch = gitStatus.data?.branch ?? "—";
  const repoAvailable = gitStatus.data?.available ?? false;

  // -------------------------------------------------------------------------
  // Render: activity rail (status chips only — read workbench)
  // -------------------------------------------------------------------------
  const activity = (
    <>
      <span
        className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-[18px]"
        title="资源管理器"
        aria-hidden
      >
        <FolderOpen />
      </span>
      <span
        className="grid size-8 place-items-center rounded-[9px] text-muted [&_svg]:size-[18px]"
        title={`Git · ${branch}`}
        aria-hidden
      >
        <GitBranch />
      </span>
      <span
        className="grid size-8 place-items-center rounded-[9px] text-muted [&_svg]:size-[18px]"
        title="终端会话（只读）"
        aria-hidden
      >
        <Terminal />
      </span>
    </>
  );

  // -------------------------------------------------------------------------
  // Render: file tree
  // -------------------------------------------------------------------------
  const tree = (
    <div className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm font-semibold text-ink-strong">资源管理器</strong>
        <Badge variant="outline">{projectRoot?.labelZh ?? "—"}</Badge>
      </div>

      {/* breadcrumbs */}
      <div className="flex flex-wrap items-center gap-0.5 text-xs text-muted">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-panel-2 hover:text-ink [&_svg]:size-3"
          onClick={() => setDirPath("")}
        >
          <Home />
          root
        </button>
        {breadcrumbs.map((bc) => (
          <React.Fragment key={bc.path}>
            <ChevronRight className="size-3 opacity-50" />
            <button
              type="button"
              className="truncate rounded-sm px-1 py-0.5 hover:bg-panel-2 hover:text-ink"
              onClick={() => setDirPath(bc.path)}
            >
              {bc.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="grid gap-0.5">
        {directory.isLoading ? (
          <>
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </>
        ) : directory.error ? (
          <ErrorState
            className="px-2 py-6"
            title="无法读取目录"
            description={directory.error.message}
            action={
              <Button variant="outline" size="sm" onClick={() => void directory.refetch()}>
                重试
              </Button>
            }
          />
        ) : entries.length === 0 ? (
          <EmptyState className="px-2 py-6" title="空目录" description="该目录没有可显示的条目。" />
        ) : (
          <>
            {parentPath != null && (
              <button
                type="button"
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] [&_svg]:size-4"
                onClick={() => setDirPath(parentPath)}
              >
                <Folder />
                ..
              </button>
            )}
            {entries.map((entry) => {
              const isDir = entry.kind === "directory";
              const selected = selection?.path === entry.path;
              const changed = changedPaths.has(entry.path);
              return (
                <button
                  key={entry.path}
                  type="button"
                  disabled={!isDir && !entry.textLike}
                  onClick={() => openEntry(entry)}
                  title={!isDir && !entry.textLike ? "二进制文件不可文本预览" : entry.name}
                  className={cn(
                    "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
                    "focus-visible:shadow-[var(--ring)] disabled:opacity-45",
                    selected
                      ? "bg-primary-soft text-ink-strong [&_svg]:text-primary"
                      : "text-muted hover:bg-panel-2 hover:text-ink",
                    "[&_svg]:size-4 [&_svg]:shrink-0",
                  )}
                >
                  {isDir ? <Folder /> : fileIcon(entry.ext)}
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {changed && <span className="size-1.5 shrink-0 rounded-full bg-amber" aria-label="有未提交改动" />}
                  {!isDir && (
                    <span className="shrink-0 text-2xs text-subtle">{formatBytes(entry.size)}</span>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render: editor (tabs + content/diff)
  // -------------------------------------------------------------------------
  const fileData = fileRead.data;
  const content = typeof fileData?.content === "string" ? fileData.content : "";

  const editor = (
    <>
      {/* tab strip */}
      <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-sm bg-panel px-2 py-1 text-sm text-ink-strong [&_svg]:size-3.5">
          {selection ? fileIcon(selection.ext) : <FileText />}
          <span className="truncate">{selection?.name ?? "未选择文件"}</span>
        </span>
        {selection && (
          <div className="ml-1 flex items-center gap-0.5 rounded-sm border border-line p-0.5">
            <button
              type="button"
              onClick={() => setMode("content")}
              className={cn(
                "rounded-[5px] px-2 py-0.5 text-xs outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                mode === "content" ? "bg-primary-soft text-ink-strong" : "text-muted hover:text-ink",
              )}
            >
              内容
            </button>
            <button
              type="button"
              onClick={() => setMode("diff")}
              disabled={!selectedHasChange}
              title={selectedHasChange ? "查看 Git diff" : "该文件无未提交改动"}
              className={cn(
                "rounded-[5px] px-2 py-0.5 text-xs outline-none transition-colors focus-visible:shadow-[var(--ring)] disabled:opacity-40",
                mode === "diff" ? "bg-primary-soft text-ink-strong" : "text-muted hover:text-ink",
              )}
            >
              Diff
            </button>
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-2xs text-subtle [&_svg]:size-3">
          <Lock />
          只读
        </span>
      </div>

      {/* body */}
      <div className="min-w-0 overflow-auto p-3">
        {!selection ? (
          <EmptyState
            title="选择一个文件"
            description="从左侧资源管理器选择文本文件查看内容，或在下方 Git 面板点击改动文件查看 diff。"
            icon={<FileCode2 />}
          />
        ) : mode === "diff" ? (
          gitDiff.isLoading ? (
            <Skeleton className="h-40" />
          ) : gitDiff.error ? (
            <ErrorState title="无法加载 diff" description={gitDiff.error.message} />
          ) : gitDiff.data?.binary ? (
            <EmptyState title="二进制文件" description="该文件为二进制，无法显示文本 diff。" />
          ) : (
            <DiffViewer
              diff={gitDiff.data?.diff ?? ""}
              message={gitDiff.data?.message ?? null}
              label={selection.path}
              format={formatTag(selection.ext)}
              truncated={gitDiff.data?.truncated ?? false}
            />
          )
        ) : fileRead.isLoading ? (
          <Skeleton className="h-40" />
        ) : fileRead.error ? (
          <ErrorState title="无法读取文件" description={fileRead.error.message} />
        ) : fileData && !fileData.textLike ? (
          <EmptyState
            title="不可文本预览"
            description={`该文件（${fileData.mimeType || "二进制"}）无法作为文本显示。`}
          />
        ) : (
          <>
            {fileData?.truncated && (
              <div className="mb-2 rounded-sm border border-amber/30 bg-amber-soft px-3 py-1.5 text-xs text-amber">
                内容超出上限，已截断显示。
              </div>
            )}
            <CodeBlock
              content={content}
              format={formatTag(selection.ext)}
              label={selection.path}
              maxHeightClassName="max-h-none"
            />
          </>
        )}
      </div>
    </>
  );

  // -------------------------------------------------------------------------
  // Render: bottom panel (Git / Terminal) + status bar
  // -------------------------------------------------------------------------
  const panel = (
    <>
      <div className="flex items-center gap-1 border-b border-line bg-panel-2 px-2 py-1.5">
        {IDE_PANEL_TABS.map((tab) => {
          const active = panelTab === tab;
          const label = tab === "git" ? "Git" : "终端会话";
          const count = tab === "git" ? changes.length : sessions.length;
          return (
            <button
              key={tab}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => setPanelTab(tab)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                active ? "bg-primary-soft text-ink-strong" : "text-muted hover:bg-panel-3 hover:text-ink",
              )}
            >
              {tab === "git" ? <GitBranch className="size-3.5" /> : <SquareTerminal className="size-3.5" />}
              {label}
              <span className="rounded-full bg-panel-3 px-1.5 text-2xs text-subtle">{count}</span>
            </button>
          );
        })}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={refreshAll}>
          <RefreshCw
            className={cn(
              (directory.isFetching || gitStatus.isFetching) && "animate-spin",
            )}
          />
          刷新
        </Button>
      </div>

      <div className="min-w-0 overflow-auto">
        {panelTab === "git" ? (
          <GitPanel
            loading={gitStatus.isLoading}
            error={gitStatus.error?.message ?? null}
            available={repoAvailable}
            message={gitStatus.data?.message ?? null}
            changes={changes}
            commits={commits}
            selectedPath={selection?.path ?? null}
            onOpenChange={openChange}
            onRetry={() => void gitStatus.refetch()}
          />
        ) : (
          <TerminalPanel
            loading={terminalSessions.isLoading}
            error={terminalSessions.error?.message ?? null}
            sessions={sessions}
            ptyAvailable={terminalStatus.data?.ptyAvailable ?? false}
            agentInstalled={agentBinaries.filter((b) => b.installed).length}
            agentTotal={agentBinaries.length}
          />
        )}
      </div>
    </>
  );

  return (
    <div className="grid min-w-0 gap-4">
      {/* page head */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-strong">工作区 IDE</h1>
          <p className="text-sm text-muted">
            真实文件、Git 与终端证据汇聚在一个只读工作台。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ToneBadge tone={repoAvailable ? (gitStatus.data?.clean ? "ok" : "warn") : "mute"}>
            <GitBranch className="size-3.5" />
            {branch}
          </ToneBadge>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw
              className={cn(
                (directory.isFetching || gitStatus.isFetching) && "animate-spin",
              )}
            />
            刷新
          </Button>
        </div>
      </div>

      {/* future-track note (no fake write controls) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-muted">
        <Lock className="size-3.5 text-subtle" />
        <span>
          当前为只读证据工作台。在线编辑、运行、终端写入与 AI diff 审批属于后续
          <strong className="font-medium text-ink-strong"> 工作区 IDE 写入轨道</strong>，尚未开放。
        </span>
        <Link
          to="/cli-agents?view=sessions"
          className="text-primary underline-offset-2 hover:underline"
        >
          前往 CLI 代理启动终端 →
        </Link>
      </div>

      {/* workbench */}
      <div className="h-[calc(100dvh-15rem)] min-h-[520px] min-w-0">
        <WorkbenchLayout
          activity={activity}
          tree={tree}
          editor={editor}
          panel={panel}
          aria-label="工作区 IDE"
        />
      </div>

      {/* status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-line bg-panel-2 px-3 py-1.5 text-2xs text-muted">
        <span className="inline-flex items-center gap-1 [&_svg]:size-3">
          <GitBranch />
          {branch}
        </span>
        <span className="inline-flex items-center gap-1 [&_svg]:size-3">
          <GitCommitHorizontal />
          {changes.length} 改动
        </span>
        <span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3">
          <FileText />
          <span className="truncate">{selection?.path ?? "未选择文件"}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 [&_svg]:size-3">
          <Lock />
          read-only
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffViewer — split a unified `git diff` into base/proposed for DiffView, or
// fall back to the raw patch when hunks aren't cleanly parseable.
// ---------------------------------------------------------------------------

function DiffViewer({
  diff,
  message,
  label,
  format,
  truncated,
}: {
  diff: string;
  message: string | null;
  label: string;
  format: "json" | "toml" | null;
  truncated: boolean;
}) {
  const parsed = React.useMemo(() => parseUnifiedDiff(diff), [diff]);

  if (!diff.trim()) {
    return (
      <EmptyState
        title="无 diff"
        description={message ?? "该文件没有可显示的 Git diff。"}
      />
    );
  }

  return (
    <div className="grid gap-2">
      {truncated && (
        <div className="rounded-sm border border-amber/30 bg-amber-soft px-3 py-1.5 text-xs text-amber">
          diff 超出上限，已截断显示。
        </div>
      )}
      {parsed ? (
        <DiffView
          base={parsed.base}
          proposed={parsed.proposed}
          format={format}
          label={label}
          maxHeightClassName="max-h-none"
        />
      ) : (
        <CodeBlock content={diff} label={`${label} · patch`} maxHeightClassName="max-h-none" />
      )}
    </div>
  );
}

/**
 * Reconstruct the before/after text from a unified diff so the shared DiffView
 * can render it. Lines starting with `-` go to base, `+` to proposed, context
 * to both; hunk/file headers are skipped. Returns null for empty diffs.
 */
function parseUnifiedDiff(diff: string): { base: string; proposed: string } | null {
  const lines = diff.split(/\r?\n/);
  const base: string[] = [];
  const proposed: string[] = [];
  let sawHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      sawHunk = true;
      continue;
    }
    if (!sawHunk) continue; // skip the `diff --git` / index / +++ / --- header block
    if (line.startsWith("+")) {
      proposed.push(line.slice(1));
    } else if (line.startsWith("-")) {
      base.push(line.slice(1));
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — ignore.
    } else {
      const text = line.startsWith(" ") ? line.slice(1) : line;
      base.push(text);
      proposed.push(text);
    }
  }
  if (!sawHunk) return null;
  return { base: base.join("\n"), proposed: proposed.join("\n") };
}

// ---------------------------------------------------------------------------
// GitPanel
// ---------------------------------------------------------------------------

function GitPanel({
  loading,
  error,
  available,
  message,
  changes,
  commits,
  selectedPath,
  onOpenChange,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  available: boolean;
  message: string | null;
  changes: GitFileChange[];
  commits: GitCommitSummary[];
  selectedPath: string | null;
  onOpenChange: (change: GitFileChange) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-1 p-3">
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        title="无法加载 Git 状态"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            重试
          </Button>
        }
      />
    );
  }
  if (!available) {
    return (
      <EmptyState
        title="非 Git 仓库"
        description={message ?? "当前根目录不是 Git 仓库。"}
        icon={<GitBranch />}
      />
    );
  }

  return (
    <div className="grid gap-0.5 p-1">
      {changes.length === 0 ? (
        <EmptyState title="工作区干净" description="没有待提交的改动。" icon={<GitBranch />} />
      ) : (
        changes.map((change) => {
          const t = changeTone(change.kind);
          const active = selectedPath === change.path;
          return (
            <button
              key={`${change.path}:${change.status}`}
              type="button"
              onClick={() => onOpenChange(change)}
              className={cn(
                "flex items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm outline-none transition-colors",
                "focus-visible:shadow-[var(--ring)] [&_svg]:size-4",
                active ? "bg-primary-soft text-ink-strong" : "text-muted hover:bg-panel-2 hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-[7px] [&_svg]:size-3.5",
                  t.tone === "ok" && "bg-green-soft text-green",
                  t.tone === "warn" && "bg-amber-soft text-amber",
                  t.tone === "bad" && "bg-red-soft text-red",
                  t.tone === "info" && "bg-primary-soft text-primary",
                  t.tone === "mute" && "bg-panel-3 text-muted",
                )}
              >
                <FileCode2 />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{change.path}</span>
              {change.staged && <Badge variant="outline">已暂存</Badge>}
              <ToneBadge tone={t.tone}>{t.label}</ToneBadge>
            </button>
          );
        })
      )}

      {commits.length > 0 && (
        <div className="mt-2 border-t border-line px-3 pt-2">
          <span className="text-2xs uppercase tracking-wide text-subtle">最近提交</span>
          <div className="mt-1 grid gap-1">
            {commits.slice(0, 5).map((commit) => (
              <div key={commit.hash} className="flex items-center gap-2 text-xs text-muted">
                <GitCommitHorizontal className="size-3.5 shrink-0 text-subtle" />
                <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                <code className="shrink-0 font-mono text-2xs text-subtle">{commit.shortHash}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TerminalPanel — read-only persisted session evidence; launch deep-links out.
// ---------------------------------------------------------------------------

function TerminalPanel({
  loading,
  error,
  sessions,
  ptyAvailable,
  agentInstalled,
  agentTotal,
}: {
  loading: boolean;
  error: string | null;
  sessions: TerminalSessionDescriptor[];
  ptyAvailable: boolean;
  agentInstalled: number;
  agentTotal: number;
}) {
  return (
    <div className="grid gap-0.5 p-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <ToneBadge tone={ptyAvailable ? "ok" : "warn"}>PTY {ptyAvailable ? "可用" : "不可用"}</ToneBadge>
        </span>
        <span>已安装 CLI 代理 {agentInstalled}/{agentTotal}</span>
        <Link
          to="/cli-agents?view=sessions"
          className="ml-auto text-primary underline-offset-2 hover:underline"
        >
          管理 / 启动会话 →
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-1 p-2">
          <Skeleton className="h-7" />
          <Skeleton className="h-7" />
        </div>
      ) : error ? (
        <ErrorState title="无法加载终端会话" description={error} />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="暂无持久终端会话"
          description="启动 / 结束终端属于 CLI 代理工作台与未来的 IDE 写入轨道。"
          icon={<SquareTerminal />}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/cli-agents?view=sessions">前往 CLI 代理</Link>
            </Button>
          }
        />
      ) : (
        sessions.slice(0, 8).map((s) => {
          const t = terminalStatusTone(s.status);
          return (
            <div key={s.sessionId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <SquareTerminal className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-ink-strong">{s.title || s.sessionId}</span>
              <span className="hidden shrink-0 truncate text-2xs text-subtle sm:block">
                {s.cwd ?? "—"} · {formatTime(s.lastActiveAt)}
              </span>
              <ToneBadge tone={t.tone}>{t.label}</ToneBadge>
            </div>
          );
        })
      )}
    </div>
  );
}

export default WorkspaceIdePage;
