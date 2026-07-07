import * as React from "react";
import { FileText, Folder, Loader2, Regex, Search, WholeWord } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { useFilesSearchQuery } from "@/lib/query/files";
import { normalizeExplorerPath } from "@/shared/explorer-core";
import { requestLspWorkspaceSymbols } from "../lsp/lspInteractionClient";
import type { FileSearchResult } from "../../../../../../types/files";
import type { LspWorkspaceSymbolItem, LspWorkspaceSymbolsResponse } from "../../../../../../types/lsp";

export interface IdeSearchResultOpenRequest {
  rootId: string;
  path: string;
  kind: "file" | "directory";
  query: string;
  lineNumber?: number;
  column?: number;
  source?: "files" | "symbols";
}

export interface IdeSearchViewProps {
  hidden: boolean;
  rootId: string;
  rootLabel: string;
  directoryPath: string;
  onOpenResult: (request: IdeSearchResultOpenRequest) => void;
}

export function IdeSearchView({
  hidden,
  rootId,
  rootLabel,
  directoryPath,
  onOpenResult,
}: IdeSearchViewProps) {
  const [draftQuery, setDraftQuery] = React.useState("");
  const [submittedQuery, setSubmittedQuery] = React.useState("");
  const [scopePath, setScopePath] = React.useState(() => normalizeExplorerPath(directoryPath));
  const [recursive, setRecursive] = React.useState(true);
  const [hiddenFiles, setHiddenFiles] = React.useState(true);
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [regex, setRegex] = React.useState(false);
  const [mode, setMode] = React.useState<"files" | "symbols">("files");
  const [submittedMode, setSubmittedMode] = React.useState<"files" | "symbols">("files");
  const [symbolResponse, setSymbolResponse] = React.useState<LspWorkspaceSymbolsResponse | null>(null);
  const [symbolLoading, setSymbolLoading] = React.useState(false);
  const [symbolError, setSymbolError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (scopePath) return;
    setScopePath(normalizeExplorerPath(directoryPath));
  }, [directoryPath, scopePath]);

  const query = useFilesSearchQuery(
    submittedMode === "files" && submittedQuery.trim() && rootId
      ? {
          rootId,
          query: submittedQuery.trim(),
          path: scopePath,
          recursive,
          hidden: hiddenFiles,
          caseSensitive,
          regex,
          limit: 200,
        }
      : null,
    { staleTime: 10_000, refetchOnWindowFocus: false },
  );

  const results = query.data?.results ?? [];
  const hasSearched = Boolean(submittedQuery.trim());

  const runSearch = React.useCallback(() => {
    const nextQuery = draftQuery.trim();
    setSubmittedQuery(nextQuery);
    setSubmittedMode(mode);
    if (mode !== "symbols" || !nextQuery || !rootId) return;
    const controller = new AbortController();
    setSymbolLoading(true);
    setSymbolError(null);
    requestLspWorkspaceSymbols({
      type: "workspaceSymbols",
      rootId,
      query: nextQuery,
      path: scopePath,
      limit: 100,
      includeHidden: hiddenFiles,
    }, { signal: controller.signal })
      .then((response) => setSymbolResponse(response))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSymbolResponse(null);
        setSymbolError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSymbolLoading(false);
      });
    return () => controller.abort();
  }, [draftQuery, hiddenFiles, mode, rootId, scopePath]);

  const isSearching = submittedMode === "symbols" ? symbolLoading : query.isFetching;
  const symbolItems = symbolResponse?.items ?? [];

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;

  return (
    <aside
      className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-r border-line bg-panel"
      data-ide-sidebar
      data-ide-search-view
    >
      <div className="border-b border-line bg-panel px-3 py-2" data-ide-search-toolbar>
        <div className="flex min-w-0 items-center gap-2">
          <Search className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink-strong">搜索</div>
            <div className="truncate text-xs text-subtle">{rootLabel || "Workspace Search"}</div>
          </div>
        </div>
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <Input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.currentTarget.value)}
            placeholder={mode === "symbols" ? "搜索工作区符号、类、函数、变量" : "搜索文件名或内容"}
            aria-label={mode === "symbols" ? "搜索工作区符号" : "搜索文件名或内容"}
            data-ide-search-input
          />
          <Input
            value={scopePath}
            onChange={(event) => setScopePath(normalizeExplorerPath(event.currentTarget.value))}
            placeholder="搜索范围，例如 apps/web"
            aria-label="搜索范围"
            className="font-mono text-xs"
            data-ide-search-scope
          />
          <div className="flex flex-wrap items-center gap-1">
            <ModeToggle active={mode === "files"} label="文件/内容" onClick={() => setMode("files")} dataAttr="files" />
            <ModeToggle active={mode === "symbols"} label="符号" onClick={() => setMode("symbols")} dataAttr="symbols" />
            <SearchToggle active={caseSensitive} label="大小写" onClick={() => setCaseSensitive((value) => !value)}>
              <WholeWord />
            </SearchToggle>
            <SearchToggle active={regex} label="正则" disabled={mode === "symbols"} onClick={() => setRegex((value) => !value)}>
              <Regex />
            </SearchToggle>
            <SearchToggle active={recursive} label="递归" onClick={() => setRecursive((value) => !value)}>
              ↳
            </SearchToggle>
            <SearchToggle active={hiddenFiles} label="隐藏文件" onClick={() => setHiddenFiles((value) => !value)}>
              .*
            </SearchToggle>
          </div>
          <Button type="submit" size="sm" disabled={!draftQuery.trim() || isSearching} data-ide-search-submit>
            {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
            {mode === "symbols" ? "搜索符号" : "搜索"}
          </Button>
        </form>
      </div>
      <div className="min-h-0 overflow-auto p-2 [scrollbar-width:thin]" data-ide-search-results>
        {!hasSearched ? (
          <SearchEmptyState title="输入关键词开始搜索" description="文件/内容搜索复用 Files search；符号搜索复用 LSP workspace symbols。" />
        ) : submittedMode === "symbols" ? (
          symbolLoading && symbolItems.length === 0 ? (
            <SearchEmptyState title="正在搜索符号…" description="正在扫描当前范围内的 TypeScript/JavaScript 文件。" loading />
          ) : symbolError ? (
            <SearchEmptyState title="符号搜索失败" description={symbolError} tone="danger" />
          ) : symbolItems.length === 0 ? (
            <SearchEmptyState title="没有符号结果" description={`未找到 “${submittedQuery}”。`} />
          ) : (
            <div className="grid gap-1" role="list" aria-label="IDE 符号搜索结果">
              <div className="mb-1 flex items-center justify-between gap-2 px-1 text-2xs text-subtle" data-ide-search-summary>
                <span>{symbolItems.length} 个符号</span>
                <span className="truncate">
                  scanned: {symbolResponse?.scannedFiles ?? 0}{symbolResponse?.truncated ? " · truncated" : ""} · scope: /{symbolResponse?.path ?? scopePath}
                </span>
              </div>
              {symbolItems.map((item) => (
                <SymbolResultRow
                  key={`${item.path}:${item.name}:${item.startLine}:${item.startColumn}`}
                  item={item}
                  query={submittedQuery}
                  onOpen={() => onOpenResult({
                    rootId,
                    path: item.path,
                    kind: "file",
                    query: submittedQuery,
                    lineNumber: item.startLine,
                    column: item.startColumn,
                    source: "symbols",
                  })}
                />
              ))}
            </div>
          )
        ) : query.isLoading || query.isFetching && results.length === 0 ? (
          <SearchEmptyState title="正在搜索…" description="正在查询当前工作区文件名和文本内容。" loading />
        ) : query.isError ? (
          <SearchEmptyState title="搜索失败" description={query.error?.message ?? "请检查搜索条件。"} tone="danger" />
        ) : results.length === 0 ? (
          <SearchEmptyState title="没有结果" description={`未找到 “${submittedQuery}”。`} />
        ) : (
          <div className="grid gap-1" role="list" aria-label="IDE 搜索结果">
            <div className="mb-1 flex items-center justify-between px-1 text-2xs text-subtle" data-ide-search-summary>
              <span>{results.length} 个结果</span>
              <span className="truncate">scope: /{query.data?.directoryPath ?? scopePath}</span>
            </div>
            {results.map((result) => (
              <SearchResultRow
                key={`${result.path}:${result.matchKind}:${result.snippet ?? ""}`}
                result={result}
                query={submittedQuery}
                onOpen={() => onOpenResult({ rootId, path: result.path, kind: result.kind, query: submittedQuery })}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function ModeToggle({
  active,
  label,
  onClick,
  dataAttr,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  dataAttr: "files" | "symbols";
}) {
  return (
    <button
      type="button"
      aria-pressed={active ? "true" : "false"}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md border border-line bg-panel-2 px-2 text-xs font-medium text-muted outline-none hover:border-primary-line hover:text-ink focus-visible:shadow-[var(--ring)]",
        active && "border-primary-line bg-primary-soft text-primary",
      )}
      data-ide-search-mode={dataAttr}
    >
      {label}
    </button>
  );
}

function SearchToggle({
  active,
  label,
  children,
  onClick,
  disabled = false,
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active ? "true" : "false"}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border border-line bg-panel-2 px-2 text-xs text-muted outline-none hover:border-primary-line hover:text-ink focus-visible:shadow-[var(--ring)] [&_svg]:size-3.5",
        active && "border-primary-line bg-primary-soft text-primary",
        disabled && "cursor-not-allowed opacity-50 hover:border-line hover:text-muted",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function SymbolResultRow({
  item,
  query,
  onOpen,
}: {
  item: LspWorkspaceSymbolItem;
  query: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="group grid min-w-0 gap-1 rounded-md border border-transparent px-2 py-2 text-left outline-none hover:border-primary-line hover:bg-primary-soft/50 focus-visible:shadow-[var(--ring)]"
      onClick={onOpen}
      data-ide-symbol-result
      data-ide-symbol-result-name={item.name}
      data-ide-symbol-result-path={item.path}
      data-ide-symbol-result-kind={item.kind}
    >
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">{highlightSnippet(item.name, query)}</span>
        <span className="shrink-0 rounded border border-line bg-panel-2 px-1.5 py-0.5 text-2xs text-subtle">{item.kind}</span>
      </div>
      <div className="truncate font-mono text-2xs text-subtle">
        {item.path}:{item.startLine}:{item.startColumn}
      </div>
      {item.containerName ? (
        <div className="truncate text-2xs text-muted">in {item.containerName}</div>
      ) : null}
    </button>
  );
}

function SearchResultRow({
  result,
  query,
  onOpen,
}: {
  result: FileSearchResult;
  query: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="group grid min-w-0 gap-1 rounded-md border border-transparent px-2 py-2 text-left outline-none hover:border-primary-line hover:bg-primary-soft/50 focus-visible:shadow-[var(--ring)]"
      onClick={onOpen}
      data-ide-search-result
      data-ide-search-result-path={result.path}
      data-ide-search-result-kind={result.kind}
      data-ide-search-result-match={result.matchKind ?? "name"}
    >
      <div className="flex min-w-0 items-center gap-2">
        {result.kind === "directory" ? <Folder className="size-4 shrink-0 text-amber" /> : <FileText className="size-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">{result.name}</span>
        <span className="shrink-0 rounded border border-line bg-panel-2 px-1.5 py-0.5 text-2xs text-subtle">{result.matchKind ?? "name"}</span>
      </div>
      <div className="truncate font-mono text-2xs text-subtle">{result.path}</div>
      {result.snippet ? (
        <div className="line-clamp-2 rounded-sm bg-canvas px-2 py-1 text-xs text-muted" data-ide-search-result-snippet>
          {highlightSnippet(result.snippet, query)}
        </div>
      ) : null}
    </button>
  );
}

function SearchEmptyState({
  title,
  description,
  loading = false,
  tone = "muted",
}: {
  title: string;
  description: string;
  loading?: boolean;
  tone?: "muted" | "danger";
}) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line bg-canvas p-4 text-center" data-ide-search-empty>
      <div>
        <div className={cn("mx-auto mb-2 grid size-9 place-items-center rounded-md", tone === "danger" ? "bg-red-soft text-red" : "bg-primary-soft text-primary")}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </div>
        <div className="text-sm font-semibold text-ink-strong">{title}</div>
        <div className="mt-1 text-xs text-muted">{description}</div>
      </div>
    </div>
  );
}

function highlightSnippet(snippet: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return snippet;
  const index = snippet.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index < 0) return snippet;
  return (
    <>
      {snippet.slice(0, index)}
      <mark className="rounded bg-amber-soft px-0.5 text-amber">{snippet.slice(index, index + trimmed.length)}</mark>
      {snippet.slice(index + trimmed.length)}
    </>
  );
}
