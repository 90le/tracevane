import * as React from "react";
import {
  ChevronDown,
  File,
  Folder,
  LocateFixed,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { useFilesSearchQuery } from "@/lib/query/files";
import type { FileSearchResult } from "../../../../../types/files";

const FILE_MANAGER_SEARCH_LIMIT = 500;

export interface FileManagerSearchPanelProps {
  rootId: string;
  directoryPath: string;
  showHidden: boolean;
  onRevealPath: (path: string) => void;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (entry: FileSearchResult) => void;
}

/**
 * Backend-backed file name/content search for the system file manager.
 *
 * This intentionally sits beside the lightweight current-directory filter:
 * - filterText narrows the already loaded table rows;
 * - this panel calls /api/files/search and can use the content index to search
 *   file names + text-like content recursively under the current directory.
 */
export function FileManagerSearchPanel({
  rootId,
  directoryPath,
  showHidden,
  onRevealPath,
  onOpenDirectory,
  onOpenFile,
}: FileManagerSearchPanelProps) {
  const [draft, setDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [regex, setRegex] = React.useState(false);
  const [recursive, setRecursive] = React.useState(true);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const search = useFilesSearchQuery(
    rootId && query
      ? {
          rootId,
          path: directoryPath,
          query,
          recursive,
          hidden: showHidden,
          caseSensitive,
          regex,
          limit: FILE_MANAGER_SEARCH_LIMIT,
        }
      : null,
  );
  const results = search.data?.results ?? [];
  const indexStats = search.data?.index;

  const options = (
    <FileManagerSearchOptions
      recursive={recursive}
      caseSensitive={caseSensitive}
      regex={regex}
      showHidden={showHidden}
      indexStats={indexStats}
      query={query}
      loading={search.isLoading}
      onRecursiveChange={setRecursive}
      onCaseSensitiveChange={setCaseSensitive}
      onRegexChange={setRegex}
    />
  );

  const searchBody = (
    <>
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[.08em] text-subtle">
          <Search className="size-3.5" />
          文件搜索
        </div>
        <div className="min-w-0 flex-1 sm:min-w-[220px]">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜索文件名或内容"
            className="h-9 bg-panel text-sm sm:h-8"
          />
        </div>
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-center"
            onClick={() => setDraft("")}
          >
            清空
          </Button>
        ) : null}
      </div>
      <div className="hidden md:block" data-file-manager-search-options-desktop>
        {options}
      </div>
      <details
        className="group rounded border border-line bg-panel px-2 py-1.5 text-xs md:hidden"
        data-file-manager-search-options-mobile
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-muted marker:hidden">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5" />
            搜索选项
          </span>
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 border-t border-line pt-2">{options}</div>
      </details>
      {query ? (
        <FileManagerSearchResults
          query={query}
          caseSensitive={caseSensitive}
          regex={regex}
          loading={search.isLoading || search.isFetching}
          error={search.error?.message ?? search.data?.error}
          results={results}
          truncated={Boolean(search.data?.truncated)}
          limit={search.data?.limit ?? 250}
          onRevealPath={onRevealPath}
          onOpenDirectory={onOpenDirectory}
          onOpenFile={onOpenFile}
        />
      ) : null}
    </>
  );

  return (
    <section
      className="grid gap-2 rounded-md border border-line bg-panel-2 p-3"
      aria-label="文件名和内容搜索"
      data-file-manager-search-panel
    >
      {searchBody}
    </section>
  );
}

function FileManagerSearchOptions({
  recursive,
  caseSensitive,
  regex,
  showHidden,
  indexStats,
  query,
  loading,
  onRecursiveChange,
  onCaseSensitiveChange,
  onRegexChange,
}: {
  recursive: boolean;
  caseSensitive: boolean;
  regex: boolean;
  showHidden: boolean;
  indexStats:
    | { used?: boolean; resultCount?: number; candidateCount?: number }
    | undefined;
  query: string;
  loading: boolean;
  onRecursiveChange: (value: boolean) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onRegexChange: (value: boolean) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-xs text-muted"
      data-file-manager-search-options
    >
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={recursive}
          onChange={(event) => onRecursiveChange(event.target.checked)}
          className="size-3 accent-primary"
        />
        递归子目录
      </label>
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(event) => onCaseSensitiveChange(event.target.checked)}
          className="size-3 accent-primary"
        />
        区分大小写
      </label>
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={regex}
          onChange={(event) => onRegexChange(event.target.checked)}
          className="size-3 accent-primary"
        />
        正则
      </label>
      <span className="text-subtle">
        隐藏文件：{showHidden ? "包含" : "排除"}
      </span>
      {indexStats?.used ? (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
          内容索引命中 {indexStats.resultCount}/{indexStats.candidateCount}
        </span>
      ) : query && !loading ? (
        <span className="rounded-full bg-panel px-2 py-0.5 text-subtle">
          索引未命中，已扫描补全
        </span>
      ) : null}
    </div>
  );
}

function FileManagerSearchResults({
  query,
  caseSensitive,
  regex,
  loading,
  error,
  results,
  truncated,
  limit,
  onRevealPath,
  onOpenDirectory,
  onOpenFile,
}: {
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  loading: boolean;
  error?: string;
  results: FileSearchResult[];
  truncated: boolean;
  limit: number;
  onRevealPath: (path: string) => void;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (entry: FileSearchResult) => void;
}) {
  if (loading) {
    return (
      <LoadingState
        className="rounded border border-line bg-panel px-3 py-6"
        title="正在搜索文件名和内容…"
      />
    );
  }
  if (error) {
    return (
      <ErrorState
        className="rounded border border-danger-line bg-panel px-3 py-6"
        title="搜索失败"
        description={error}
      />
    );
  }
  if (!results.length) {
    return (
      <EmptyState
        className="rounded border border-line bg-panel px-3 py-6"
        title="没有匹配结果"
        description="调整关键词、路径或搜索选项后再试。"
      />
    );
  }
  return (
    <div className="max-h-72 overflow-auto rounded border border-line bg-panel">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel-2 px-3 py-1.5 text-xs text-muted">
        <span>
          {results.length} 个结果{truncated ? ` · 已达到 ${limit} 条上限` : ""}
        </span>
        <span>{truncated ? "请收窄关键词或路径" : "文件名 + 文本内容"}</span>
      </div>
      <div className="divide-y divide-line">
        {results.slice(0, 160).map((result) => (
          <SearchResultRow
            key={result.path}
            result={result}
            query={query}
            caseSensitive={caseSensitive}
            regex={regex}
            onRevealPath={onRevealPath}
            onOpenDirectory={onOpenDirectory}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
      {results.length > 160 ? (
        <div className="px-3 py-2 text-xs text-subtle">
          仅渲染前 160 条结果，请收窄关键词。
        </div>
      ) : null}
    </div>
  );
}

function SearchResultRow({
  result,
  query,
  caseSensitive,
  regex,
  onRevealPath,
  onOpenDirectory,
  onOpenFile,
}: {
  result: FileSearchResult;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  onRevealPath: (path: string) => void;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (entry: FileSearchResult) => void;
}) {
  const isDirectory = result.kind === "directory";
  const open = () => {
    if (isDirectory) onOpenDirectory(result.path);
    else {
      onRevealPath(result.path);
      onOpenFile(result);
    }
  };
  return (
    <article className="grid gap-1 px-3 py-2 text-xs hover:bg-panel-2">
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 text-left"
        onClick={open}
        title={result.path}
      >
        {isDirectory ? (
          <Folder className="size-4 shrink-0 text-primary" />
        ) : (
          <File className="size-4 shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-strong">
            <HighlightedText
              text={result.name}
              query={query}
              caseSensitive={caseSensitive}
              regex={regex}
            />
          </span>
          <span className="block truncate text-subtle">
            {result.directoryPath || "/"}
          </span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5",
            result.matchKind === "content"
              ? "bg-primary-soft text-primary"
              : "bg-panel text-muted",
          )}
        >
          {result.matchKind === "content" ? "内容" : "名称"}
        </span>
      </button>
      {result.snippet ? (
        <div className="truncate pl-6 text-muted">
          <HighlightedText
            text={result.snippet}
            query={query}
            caseSensitive={caseSensitive}
            regex={regex}
          />
        </div>
      ) : null}
      <div className="pl-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={open}
        >
          <LocateFixed className="size-3" />
          {isDirectory ? "打开目录" : "预览 / 编辑"}
        </Button>
      </div>
    </article>
  );
}

function HighlightedText({
  text,
  query,
  caseSensitive,
  regex,
}: {
  text: string;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
}) {
  const match = findHighlightMatch(text, query, { caseSensitive, regex });
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.index)}
      <mark className="rounded bg-warning-soft px-0.5 text-ink-strong">
        {text.slice(match.index, match.index + match.length)}
      </mark>
      {text.slice(match.index + match.length)}
    </>
  );
}

function findHighlightMatch(
  text: string,
  query: string,
  options: { caseSensitive: boolean; regex: boolean },
): { index: number; length: number } | null {
  if (!query) return null;
  if (!options.regex) {
    const haystack = options.caseSensitive ? text : text.toLowerCase();
    const needle = options.caseSensitive ? query : query.toLowerCase();
    const index = haystack.indexOf(needle);
    return index >= 0 ? { index, length: query.length } : null;
  }
  try {
    const match = new RegExp(query, options.caseSensitive ? "" : "i").exec(
      text,
    );
    return match
      ? { index: match.index, length: Math.max(1, match[0]?.length ?? 0) }
      : null;
  } catch {
    return null;
  }
}

export default FileManagerSearchPanel;
