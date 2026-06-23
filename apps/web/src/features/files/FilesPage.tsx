import * as React from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  FileCode2,
  FileDiff,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Home,
  Lock,
  RefreshCw,
  Search,
  SearchX,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { RowsInspectorLayout } from "@/shared/layouts/RowsInspectorLayout";
import { CodeBlock, DiffView } from "@/shared/diff/DiffView";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import {
  useFileReadQuery,
  useFilesBrowseQuery,
  useFilesSearchQuery,
  useFilesSummaryQuery,
} from "@/lib/query/files";
import { useGitDiffQuery, useGitStatusQuery } from "@/lib/query/git";

import {
  FILES_BROWSE_MODES,
  type EvidenceTone,
  type FileEntrySummary,
  type FileRootSummary,
  type FileSearchResult,
  type FilesBrowseMode,
  type FilesPreviewMode,
  type FilesSelection,
  type GitCommitSummary,
  type GitFileChange,
  type GitFileChangeKind,
} from "./types";

// ---------------------------------------------------------------------------
// Small presentational helpers (Aurora tokens only)
// ---------------------------------------------------------------------------

const TONE_BADGE: Record<EvidenceTone, React.ComponentProps<typeof Badge>["variant"]> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "info",
  mute: "mute",
};

function ToneBadge({ tone, children }: { tone: EvidenceTone; children: React.ReactNode }) {
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
function changeTone(kind: GitFileChangeKind): { tone: EvidenceTone; label: string } {
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

/** Code-ish file extensions get the code icon; everything else the text icon. */
function fileIcon(ext: string | null): React.ReactNode {
  const e = (ext ?? "").toLowerCase();
  const codey = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss",
    ".html", ".sh", ".py", ".go", ".rs", ".toml", ".yml", ".yaml", ".sql",
  ]);
  return codey.has(e) ? <FileCode2 /> : <FileText />;
}

/** Pick the diff/code format tag for CodeBlock/DiffView. */
function formatTag(ext: string | null): "json" | "toml" | null {
  const e = (ext ?? "").toLowerCase();
  if (e === ".json") return "json";
  if (e === ".toml") return "toml";
  return null;
}

/** Derive an extension from a bare path when an entry doesn't carry one. */
function extOfPath(path: string): string | null {
  const name = path.split("/").pop() ?? path;
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx) : null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * File & Git evidence browser (`/files`) — a read-only evidence surface over the
 * live Files + Git GET APIs. Rows column (left): project-root browse OR recursive
 * search; Git changes act as a filter/section. Inspector (right): content
 * preview (CodeBlock), file metadata, and — when the file has Git changes — a
 * unified diff (DiffView). Read-only this pass; file writes (upload/rename/copy/
 * move/archive/delete/download) belong to the Workspace IDE write track and are
 * surfaced only as deep-links to `/ide`, never as fake controls.
 */
export function FilesPage() {
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

  // --- Rows mode (browse tree vs. search) ----------------------------------
  const [mode, setMode] = React.useState<FilesBrowseMode>("tree");

  // --- Directory navigation (browse) ---------------------------------------
  const [dirPath, setDirPath] = React.useState<string>("");
  const directory = useFilesBrowseQuery(
    rootId ? { rootId, path: dirPath, hidden: false, pageSize: 200 } : null,
  );
  const entries = directory.data?.entries ?? [];
  const breadcrumbs = directory.data?.breadcrumbs ?? [];
  const parentPath = directory.data?.parentPath ?? null;

  // --- Search --------------------------------------------------------------
  const [searchInput, setSearchInput] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  const search = useFilesSearchQuery(
    rootId && query.trim() ? { rootId, query: query.trim(), recursive: true, hidden: false } : null,
  );
  const searchResults = search.data?.results ?? [];

  const submitSearch = () => {
    const q = searchInput.trim();
    setQuery(q);
    setMode(q ? "search" : "tree");
  };

  // --- Git -----------------------------------------------------------------
  const gitStatus = useGitStatusQuery(rootId ? { rootId } : null);
  const changes = gitStatus.data?.changes ?? [];
  const commits = gitStatus.data?.commits ?? [];
  const changedPaths = React.useMemo(
    () => new Set(changes.map((c) => c.path)),
    [changes],
  );
  const branch = gitStatus.data?.branch ?? "—";
  const repoAvailable = gitStatus.data?.available ?? false;
  const repoClean = gitStatus.data?.clean ?? false;

  // --- Selection + inspector -----------------------------------------------
  const [selection, setSelection] = React.useState<FilesSelection | null>(null);
  const [previewMode, setPreviewMode] = React.useState<FilesPreviewMode>("content");
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  const selectedHasChange = selection ? changedPaths.has(selection.path) : false;

  const fileRead = useFileReadQuery(
    selection && !selection.isDirectory && selection.textLike
      ? { rootId, path: selection.path }
      : null,
  );

  const gitDiff = useGitDiffQuery(
    selection && previewMode === "diff" && selectedHasChange
      ? {
          rootId,
          file: selection.path,
          untracked: changes.find((c) => c.path === selection.path)?.kind === "untracked",
        }
      : null,
  );

  // When the selected file has no change, force content mode.
  React.useEffect(() => {
    if (previewMode === "diff" && !selectedHasChange) setPreviewMode("content");
  }, [previewMode, selectedHasChange]);

  const selectFile = (next: FilesSelection, openDiff = false) => {
    setSelection(next);
    setPreviewMode(openDiff ? "diff" : "content");
    setInspectorOpen(true);
  };

  const openEntry = (entry: FileEntrySummary) => {
    if (entry.kind === "directory") {
      setMode("tree");
      setDirPath(entry.path);
      return;
    }
    selectFile({
      path: entry.path,
      name: entry.name,
      ext: entry.ext,
      textLike: entry.textLike,
      isDirectory: false,
    });
  };

  const openSearchResult = (result: FileSearchResult) => {
    if (result.kind === "directory") {
      setMode("tree");
      setDirPath(result.path);
      return;
    }
    selectFile({
      path: result.path,
      name: result.name,
      ext: result.ext,
      textLike: result.textLike,
      isDirectory: false,
    });
  };

  const openChange = (change: GitFileChange) => {
    selectFile(
      {
        path: change.path,
        name: change.path.split("/").pop() || change.path,
        ext: extOfPath(change.path),
        // Changed files are generally text-previewable; the read API guards binary.
        textLike: change.kind !== "deleted",
        isDirectory: false,
      },
      true,
    );
  };

  const refreshAll = () => {
    void directory.refetch();
    void gitStatus.refetch();
    if (mode === "search" && query.trim()) void search.refetch();
    if (selection) void fileRead.refetch();
  };

  // -------------------------------------------------------------------------
  // Rows column
  // -------------------------------------------------------------------------
  const rows = (
    <div className="grid min-w-0 content-start gap-3">
      {/* mode switch + search box */}
      <div className="grid gap-2 rounded-md border border-line bg-panel p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-sm border border-line p-0.5">
            {FILES_BROWSE_MODES.map((m) => {
              const active = mode === m;
              const label = m === "tree" ? "浏览" : "搜索";
              return (
                <button
                  key={m}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setMode(m)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                    active ? "bg-primary-soft text-ink-strong" : "text-muted hover:text-ink",
                    "[&_svg]:size-3.5",
                  )}
                >
                  {m === "tree" ? <FolderOpen /> : <Search />}
                  {label}
                </button>
              );
            })}
          </div>
          <Badge variant="outline" className="ml-auto">
            {projectRoot?.labelZh ?? "—"}
          </Badge>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-line bg-panel-2 px-2.5 py-1.5 [&_svg]:size-4 [&_svg]:text-subtle">
            <Search />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="按文件名 / 内容递归搜索证据…"
              aria-label="搜索文件证据"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => {
                  setSearchInput("");
                  setQuery("");
                  setMode("tree");
                }}
                className="grid size-5 shrink-0 place-items-center rounded-sm text-subtle hover:bg-panel-3 hover:text-ink [&_svg]:size-3.5"
              >
                <X />
              </button>
            )}
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={!searchInput.trim()}>
            搜索
          </Button>
        </form>
      </div>

      {/* primary rows: browse OR search */}
      <div className="rounded-md border border-line bg-panel shadow-sm">
        {mode === "tree" ? (
          <BrowseList
            loading={directory.isLoading}
            error={directory.error?.message ?? null}
            entries={entries}
            breadcrumbs={breadcrumbs}
            parentPath={parentPath}
            changedPaths={changedPaths}
            selectedPath={selection?.path ?? null}
            onHome={() => setDirPath("")}
            onNavigate={setDirPath}
            onOpen={openEntry}
            onRetry={() => void directory.refetch()}
          />
        ) : (
          <SearchList
            loading={search.isLoading}
            error={search.error?.message ?? null}
            query={query}
            results={searchResults}
            changedPaths={changedPaths}
            selectedPath={selection?.path ?? null}
            onOpen={openSearchResult}
            onRetry={() => void search.refetch()}
          />
        )}
      </div>

      {/* Git evidence section */}
      <div className="rounded-md border border-line bg-panel shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <GitBranch className="size-3.5 text-subtle" />
          <strong className="text-sm font-semibold text-ink-strong">Git 证据</strong>
          <ToneBadge tone={repoAvailable ? (repoClean ? "ok" : "warn") : "mute"}>
            {branch}
          </ToneBadge>
          <span className="ml-auto text-2xs text-subtle">{changes.length} 改动</span>
        </div>
        <GitChanges
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
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------
  const inspector = (
    <FileInspector
      selection={selection}
      previewMode={previewMode}
      onPreviewMode={setPreviewMode}
      selectedHasChange={selectedHasChange}
      changeKind={changes.find((c) => c.path === selection?.path)?.kind ?? null}
      fileRead={fileRead}
      gitDiff={gitDiff}
      onClose={() => setInspectorOpen(false)}
    />
  );

  return (
    <div className="grid min-w-0 gap-4">
      {/* page head */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-strong">文件 / Git 证据</h1>
          <p className="text-sm text-muted">
            浏览项目文件、递归搜索、预览内容与 Git diff —— 面向任务回放与审计的只读证据浏览器。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ToneBadge tone={repoAvailable ? (repoClean ? "ok" : "warn") : "mute"}>
            <GitBranch className="size-3.5" />
            {branch}
          </ToneBadge>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw
              className={cn(
                (directory.isFetching || gitStatus.isFetching || search.isFetching) && "animate-spin",
              )}
            />
            刷新
          </Button>
        </div>
      </div>

      {/* summary chips */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-line bg-panel-2 px-3 py-1.5 text-2xs text-muted">
        <span className="inline-flex items-center gap-1 [&_svg]:size-3">
          <FolderOpen />
          {directory.data?.counts.directories ?? 0} 目录 · {directory.data?.counts.files ?? 0} 文件
        </span>
        {mode === "search" && query && (
          <span className="inline-flex items-center gap-1 [&_svg]:size-3">
            <FileSearch />
            {searchResults.length} 命中 · “{query}”
          </span>
        )}
        <span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3">
          <FileText />
          <span className="truncate">{selection?.path ?? "未选择文件"}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-subtle [&_svg]:size-3">
          <Lock />
          只读
        </span>
      </div>

      {/* future-track note (no fake write controls) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-muted">
        <Lock className="size-3.5 text-subtle" />
        <span>
          当前为只读证据浏览器。上传、重命名、复制、移动、归档、删除与下载属于
          <strong className="font-medium text-ink-strong"> 工作区 IDE 写入轨道</strong>，本页不提供这些写操作。
        </span>
        <Link to="/ide" className="text-primary underline-offset-2 hover:underline">
          前往工作区 IDE →
        </Link>
      </div>

      {/* summary load / error guard */}
      {summary.isLoading ? (
        <Skeleton className="h-40" />
      ) : summary.error ? (
        <ErrorState
          title="无法加载文件根目录"
          description={summary.error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => void summary.refetch()}>
              重试
            </Button>
          }
        />
      ) : !rootId ? (
        <EmptyState title="无可用文件根目录" description="文件服务未返回任何可浏览的根目录。" icon={<FolderOpen />} />
      ) : (
        <RowsInspectorLayout
          rows={rows}
          inspector={inspector}
          inspectorOpen={inspectorOpen}
          aria-label="文件与 Git 证据"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowseList — project-root directory listing with breadcrumbs
// ---------------------------------------------------------------------------

function BrowseList({
  loading,
  error,
  entries,
  breadcrumbs,
  parentPath,
  changedPaths,
  selectedPath,
  onHome,
  onNavigate,
  onOpen,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  entries: FileEntrySummary[];
  breadcrumbs: { path: string; label: string }[];
  parentPath: string | null;
  changedPaths: Set<string>;
  selectedPath: string | null;
  onHome: () => void;
  onNavigate: (path: string) => void;
  onOpen: (entry: FileEntrySummary) => void;
  onRetry: () => void;
}) {
  return (
    <div className="grid content-start">
      {/* breadcrumbs */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-3 py-2 text-xs text-muted">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-panel-2 hover:text-ink [&_svg]:size-3"
          onClick={onHome}
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
              onClick={() => onNavigate(bc.path)}
            >
              {bc.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="grid gap-0.5 p-1">
        {loading ? (
          <>
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </>
        ) : error ? (
          <ErrorState
            className="px-2 py-6"
            title="无法读取目录"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
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
                onClick={() => onNavigate(parentPath)}
              >
                <Folder />
                ..
              </button>
            )}
            {entries.map((entry) => (
              <EntryRow
                key={entry.path}
                name={entry.name}
                path={entry.path}
                isDir={entry.kind === "directory"}
                ext={entry.ext}
                size={entry.size}
                textLike={entry.textLike}
                changed={changedPaths.has(entry.path)}
                selected={selectedPath === entry.path}
                onClick={() => onOpen(entry)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchList — recursive search hits
// ---------------------------------------------------------------------------

function SearchList({
  loading,
  error,
  query,
  results,
  changedPaths,
  selectedPath,
  onOpen,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  query: string;
  results: FileSearchResult[];
  changedPaths: Set<string>;
  selectedPath: string | null;
  onOpen: (result: FileSearchResult) => void;
  onRetry: () => void;
}) {
  return (
    <div className="grid content-start">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted">
        <FileSearch className="size-3.5 text-subtle" />
        递归搜索 · 当前项目根目录
        {query && <span className="ml-auto truncate font-mono text-subtle">“{query}”</span>}
      </div>

      <div className="grid gap-0.5 p-1">
        {!query ? (
          <EmptyState
            className="px-2 py-6"
            title="输入关键词搜索"
            description="按文件名或内容递归搜索当前项目根目录中的证据文件。"
            icon={<Search />}
          />
        ) : loading ? (
          <>
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </>
        ) : error ? (
          <ErrorState
            className="px-2 py-6"
            title="搜索失败"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            }
          />
        ) : results.length === 0 ? (
          <EmptyState
            className="px-2 py-6"
            title="没有搜索命中"
            description="换一个更具体的路径、文件名或关键词。"
            icon={<SearchX />}
          />
        ) : (
          results.map((result) => (
            <EntryRow
              key={`${result.path}:${result.matchKind ?? "name"}`}
              name={result.name}
              path={result.path}
              isDir={result.kind === "directory"}
              ext={result.ext}
              size={result.size}
              textLike={result.textLike}
              changed={changedPaths.has(result.path)}
              selected={selectedPath === result.path}
              snippet={result.snippet ?? null}
              matchKind={result.matchKind ?? null}
              onClick={() => onOpen(result)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntryRow — a single file/dir row shared by browse + search
// ---------------------------------------------------------------------------

function EntryRow({
  name,
  path,
  isDir,
  ext,
  size,
  textLike,
  changed,
  selected,
  snippet,
  matchKind,
  onClick,
}: {
  name: string;
  path: string;
  isDir: boolean;
  ext: string | null;
  size: number | null;
  textLike: boolean;
  changed: boolean;
  selected: boolean;
  snippet?: string | null;
  matchKind?: "name" | "content" | null;
  onClick: () => void;
}) {
  const disabled = !isDir && !textLike;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "二进制文件不可文本预览" : path}
      className={cn(
        "grid gap-1 rounded-sm px-2 py-1.5 text-left outline-none transition-colors",
        "focus-visible:shadow-[var(--ring)] disabled:opacity-45",
        selected
          ? "bg-primary-soft text-ink-strong"
          : "text-muted hover:bg-panel-2 hover:text-ink",
      )}
    >
      <span className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0">
        <span className={cn(selected && "[&_svg]:text-primary")}>
          {isDir ? <Folder /> : fileIcon(ext)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
        {matchKind === "content" && <Badge variant="outline">内容命中</Badge>}
        {changed && <span className="size-1.5 shrink-0 rounded-full bg-amber" aria-label="有未提交改动" />}
        {!isDir && <span className="shrink-0 text-2xs text-subtle">{formatBytes(size)}</span>}
      </span>
      {(path !== name || snippet) && (
        <span className="truncate pl-6 font-mono text-2xs text-subtle">{path}</span>
      )}
      {snippet && (
        <span className="line-clamp-2 pl-6 text-2xs text-muted">{snippet}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// GitChanges — changed files + recent commits
// ---------------------------------------------------------------------------

function GitChanges({
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
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        className="px-2 py-6"
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
        className="px-2 py-6"
        title="非 Git 仓库"
        description={message ?? "当前根目录不是 Git 仓库。"}
        icon={<GitBranch />}
      />
    );
  }

  return (
    <div className="grid gap-0.5 p-1">
      {changes.length === 0 ? (
        <EmptyState className="px-2 py-6" title="工作区干净" description="没有待提交的改动。" icon={<GitBranch />} />
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
                <FileDiff />
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
// FileInspector — content preview / metadata / diff for the selected file
// ---------------------------------------------------------------------------

function FileInspector({
  selection,
  previewMode,
  onPreviewMode,
  selectedHasChange,
  changeKind,
  fileRead,
  gitDiff,
  onClose,
}: {
  selection: FilesSelection | null;
  previewMode: FilesPreviewMode;
  onPreviewMode: (mode: FilesPreviewMode) => void;
  selectedHasChange: boolean;
  changeKind: GitFileChangeKind | null;
  fileRead: ReturnType<typeof useFileReadQuery>;
  gitDiff: ReturnType<typeof useGitDiffQuery>;
  onClose: () => void;
}) {
  if (!selection) {
    return (
      <div className="p-4">
        <EmptyState
          title="选择一个文件"
          description="从左侧浏览 / 搜索结果选择文本文件查看内容，或在 Git 证据中点击改动文件查看 diff。"
          icon={<FileCode2 />}
        />
      </div>
    );
  }

  const fileData = fileRead.data;
  const content = typeof fileData?.content === "string" ? fileData.content : "";
  const tone = changeKind ? changeTone(changeKind) : null;

  return (
    <div className="grid content-start gap-3 p-3">
      {/* header */}
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
          {fileIcon(selection.ext)}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-ink-strong">{selection.name}</strong>
          <span className="block truncate font-mono text-2xs text-subtle">{selection.path}</span>
        </div>
        {tone && <ToneBadge tone={tone.tone}>{tone.label}</ToneBadge>}
        <button
          type="button"
          aria-label="关闭检视器"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-sm text-subtle hover:bg-panel-2 hover:text-ink [&_svg]:size-4 lg:hidden"
        >
          <X />
        </button>
      </div>

      {/* metadata */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Meta label="大小" value={fileData ? formatBytes(fileData.size) : "—"} />
        <Meta label="修改时间" value={fileData ? formatTime(fileData.modifiedAt) : "—"} />
        <Meta label="类型" value={fileData?.mimeType || (selection.ext ?? "—")} />
        <Meta label="可预览" value={selection.textLike ? "文本" : "二进制 / 不可预览"} />
      </div>

      {/* preview mode switch */}
      <div className="flex items-center gap-0.5 rounded-sm border border-line p-0.5">
        <button
          type="button"
          onClick={() => onPreviewMode("content")}
          className={cn(
            "flex-1 rounded-[5px] px-2 py-1 text-xs outline-none transition-colors focus-visible:shadow-[var(--ring)]",
            previewMode === "content" ? "bg-primary-soft text-ink-strong" : "text-muted hover:text-ink",
          )}
        >
          内容
        </button>
        <button
          type="button"
          onClick={() => onPreviewMode("diff")}
          disabled={!selectedHasChange}
          title={selectedHasChange ? "查看 Git diff" : "该文件无未提交改动"}
          className={cn(
            "flex-1 rounded-[5px] px-2 py-1 text-xs outline-none transition-colors focus-visible:shadow-[var(--ring)] disabled:opacity-40",
            previewMode === "diff" ? "bg-primary-soft text-ink-strong" : "text-muted hover:text-ink",
          )}
        >
          Diff
        </button>
      </div>

      {/* body */}
      <div className="min-w-0">
        {previewMode === "diff" ? (
          gitDiff.isLoading ? (
            <Skeleton className="h-40" />
          ) : gitDiff.error ? (
            <ErrorState title="无法加载 diff" description={gitDiff.error.message} />
          ) : gitDiff.data?.binary ? (
            <EmptyState title="二进制文件" description="该文件为二进制，无法显示文本 diff。" />
          ) : (
            <DiffPreview
              diff={gitDiff.data?.diff ?? ""}
              message={gitDiff.data?.message ?? null}
              label={selection.path}
              format={formatTag(selection.ext)}
              truncated={gitDiff.data?.truncated ?? false}
            />
          )
        ) : selection.isDirectory ? (
          <EmptyState title="目录" description="目录不提供内容预览。" icon={<Folder />} />
        ) : !selection.textLike ? (
          <EmptyState
            title="不可文本预览"
            description="该文件为二进制或非文本类型，无法作为文本显示。"
            icon={<Lock />}
          />
        ) : fileRead.isLoading ? (
          <Skeleton className="h-40" />
        ) : fileRead.error ? (
          <ErrorState title="无法读取文件" description={fileRead.error.message} />
        ) : fileData && !fileData.textLike ? (
          <EmptyState
            title="不可文本预览"
            description={`该文件（${fileData.mimeType || "二进制"}）无法作为文本显示。`}
            icon={<Lock />}
          />
        ) : (
          <div className="grid gap-2">
            {fileData?.truncated && (
              <div className="rounded-sm border border-amber/30 bg-amber-soft px-3 py-1.5 text-xs text-amber">
                内容超出上限，已截断显示。
              </div>
            )}
            <CodeBlock
              content={content}
              format={formatTag(selection.ext)}
              label={selection.path}
              maxHeightClassName="max-h-[60vh]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-sm border border-line bg-panel-2 px-2.5 py-1.5">
      <span className="text-2xs uppercase tracking-wide text-subtle">{label}</span>
      <span className="truncate text-ink-strong">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffPreview — split a unified `git diff` into base/proposed for DiffView, or
// fall back to the raw patch when hunks aren't cleanly parseable.
// ---------------------------------------------------------------------------

function DiffPreview({
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
        icon={<FileDiff />}
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
          maxHeightClassName="max-h-[60vh]"
        />
      ) : (
        <CodeBlock content={diff} label={`${label} · patch`} maxHeightClassName="max-h-[60vh]" />
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

export default FilesPage;
