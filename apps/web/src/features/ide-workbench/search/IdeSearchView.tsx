import * as React from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  ListFilter,
  Loader2,
  Regex,
  Replace,
  Search,
  Settings2,
  WholeWord,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { ConfirmDialog } from "@/design/ui/action-dialog";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { readFile, writeFileContent } from "@/lib/api/files";
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
  const [wholeWord, setWholeWord] = React.useState(false);
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [replaceDraft, setReplaceDraft] = React.useState("");
  const [includePattern, setIncludePattern] = React.useState("");
  const [excludePattern, setExcludePattern] = React.useState("");
  const [replaceLoading, setReplaceLoading] = React.useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"files" | "symbols">("files");
  const [submittedMode, setSubmittedMode] = React.useState<"files" | "symbols">("files");
  const [symbolResponse, setSymbolResponse] = React.useState<LspWorkspaceSymbolsResponse | null>(null);
  const [symbolLoading, setSymbolLoading] = React.useState(false);
  const [symbolError, setSymbolError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (scopePath) return;
    setScopePath(normalizeExplorerPath(directoryPath));
  }, [directoryPath, scopePath]);

  const effectiveSubmittedQuery = React.useMemo(
    () => buildBackendSearchQuery(submittedQuery, { regex, wholeWord }),
    [regex, submittedQuery, wholeWord],
  );
  const effectiveRegex = regex || wholeWord;

  const query = useFilesSearchQuery(
    submittedMode === "files" && submittedQuery.trim() && rootId
      ? {
          rootId,
          query: effectiveSubmittedQuery,
          path: scopePath,
          recursive,
          hidden: hiddenFiles,
          caseSensitive,
          regex: effectiveRegex,
          limit: 200,
          kind: "file",
        }
      : null,
    { staleTime: 10_000, refetchOnWindowFocus: false },
  );

  const results = query.data?.results ?? [];
  const filteredResults = React.useMemo(
    () => filterSearchResults(results, includePattern, excludePattern),
    [excludePattern, includePattern, results],
  );
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
  const filteredSymbolItems = React.useMemo(
    () => filterSymbolItems(symbolItems, includePattern, excludePattern),
    [excludePattern, includePattern, symbolItems],
  );
  const scopeLabel = scopePath ? `/${scopePath}` : "/";
  const filterSummary = formatFilterSummary(includePattern, excludePattern);

  const runReplaceAll = React.useCallback(async (confirmed = false) => {
    if (replaceLoading || submittedMode !== "files") return;
    const searchText = submittedQuery.trim();
    if (!searchText) {
      toast.error("请先执行文件搜索");
      return;
    }
    const files = uniqueFileResults(filteredResults);
    if (!files.length) {
      toast.error("没有可替换的文件结果");
      return;
    }
    const expression = createSearchRegExp(searchText, { regex, wholeWord, caseSensitive });
    if (!expression.ok) {
      toast.error("搜索表达式不可用", { description: expression.message });
      return;
    }
    if (!confirmed) {
      setReplaceConfirmOpen(true);
      return;
    }
    setReplaceConfirmOpen(false);
    setReplaceLoading(true);
    let changedFiles = 0;
    let replacements = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          const payload = await readFile({ rootId, path: file.path });
          if (!payload.editable || payload.truncated || typeof payload.content !== "string") {
            failures.push(`${file.path}: 文件不可编辑或内容被截断`);
            continue;
          }
          const matcher = createSearchRegExp(searchText, { regex, wholeWord, caseSensitive });
          if (!matcher.ok) {
            failures.push(`${file.path}: ${matcher.message}`);
            continue;
          }
          const matches = payload.content.match(matcher.value);
          if (!matches?.length) continue;
          const nextContent = payload.content.replace(matcher.value, replaceDraft);
          if (nextContent === payload.content) continue;
          await writeFileContent({
            rootId,
            path: file.path,
            content: nextContent,
            expectedModifiedAt: payload.modifiedAt,
            expectedSize: payload.size,
          });
          changedFiles += 1;
          replacements += matches.length;
        } catch (reason) {
          failures.push(`${file.path}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
    } finally {
      setReplaceLoading(false);
    }
    if (changedFiles > 0) {
      toast.success(`已替换 ${replacements} 处`, { description: `${changedFiles} 个文件已写入。` });
      void query.refetch();
    }
    if (failures.length) {
      toast.error("部分文件替换失败", { description: failures.slice(0, 3).join("；") });
    } else if (changedFiles === 0) {
      toast("没有可替换的内容", { description: "当前结果文件内容中没有匹配项。" });
    }
  }, [caseSensitive, filteredResults, query, regex, replaceDraft, replaceLoading, rootId, submittedMode, submittedQuery, wholeWord]);

  const replaceConfirmFileCount = uniqueFileResults(filteredResults).length;

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;

  return (
    <aside
      className="grid h-full max-h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-line bg-panel"
      data-ide-sidebar
      data-ide-search-view
    >
      <div className="max-h-[54dvh] overflow-auto border-b border-line bg-panel px-2.5 py-2 [scrollbar-width:thin]" data-ide-search-toolbar>
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-7 shrink-0 place-items-center rounded-sm border border-primary-line bg-primary-soft text-primary">
            <Search className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="truncate text-sm font-semibold text-ink-strong">搜索</div>
              <span className="shrink-0 rounded-full border border-line bg-panel-2 px-1.5 py-0.5 text-2xs text-subtle">
                {mode === "symbols" ? "符号" : "文件系统"}
              </span>
            </div>
            <div className="truncate text-2xs text-subtle">{rootLabel || "Workspace Search"}</div>
          </div>
        </div>
        <form
          className="mt-2 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <div className="grid grid-cols-2 gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5" aria-label="搜索模式">
            <ModeToggle active={mode === "files"} label="文件/内容" onClick={() => setMode("files")} dataAttr="files" />
            <ModeToggle active={mode === "symbols"} label="符号" onClick={() => setMode("symbols")} dataAttr="symbols" />
          </div>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.currentTarget.value)}
              placeholder={mode === "symbols" ? "搜索符号、类、函数、变量" : "搜索文件名或内容"}
              aria-label={mode === "symbols" ? "搜索工作区符号" : "搜索文件名或内容"}
              className="h-9 bg-panel pl-8 pr-[7.25rem] text-sm"
              data-ide-search-input
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              <SearchIconToggle active={caseSensitive} label="区分大小写" onClick={() => setCaseSensitive((value) => !value)}>
                <CaseSensitive className="size-3.5" />
              </SearchIconToggle>
              <SearchIconToggle active={wholeWord} label="全词匹配" disabled={mode === "symbols"} onClick={() => setWholeWord((value) => !value)}>
                <WholeWord className="size-3.5" />
              </SearchIconToggle>
              <SearchIconToggle active={regex} label="正则表达式" disabled={mode === "symbols"} onClick={() => setRegex((value) => !value)}>
                <Regex className="size-3.5" />
              </SearchIconToggle>
              <SearchIconToggle active={filtersOpen} label="搜索设置" onClick={() => setFiltersOpen((value) => !value)}>
                <Settings2 className="size-3.5" />
              </SearchIconToggle>
            </div>
          </div>
          <div className="grid min-w-0 gap-1 rounded-sm border border-line bg-panel-2 p-1.5" data-ide-search-replace-panel>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left text-xs text-muted outline-none hover:bg-panel hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
              onClick={() => setReplaceOpen((value) => !value)}
              aria-expanded={replaceOpen}
              data-ide-search-replace-toggle
            >
              {replaceOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <Replace className="size-3.5 text-primary" />
              <span className="min-w-0 flex-1 truncate">替换</span>
              <span className="shrink-0 text-2xs text-subtle">{replaceDraft ? "已填写" : "收起"}</span>
            </button>
            {replaceOpen ? (
              <div className="flex min-w-0 items-center gap-1">
                <Input
                  value={replaceDraft}
                  onChange={(event) => setReplaceDraft(event.currentTarget.value)}
                  placeholder="替换为"
                  aria-label="替换为"
                  className="h-8 min-w-0 bg-panel text-sm"
                  data-ide-search-replace-input
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs"
                  disabled={replaceLoading || submittedMode !== "files" || !filteredResults.length}
                  onClick={() => void runReplaceAll()}
                  title="替换当前搜索结果中的匹配内容"
                  data-ide-search-replace-all
                >
                  {replaceLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Replace className="size-3.5" />}
                  全部
                </Button>
              </div>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-1 rounded-sm border border-line bg-panel-2 p-1.5" data-ide-search-filters-panel>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left text-xs text-muted outline-none hover:bg-panel hover:text-ink-strong focus-visible:shadow-[var(--ring)]"
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
              data-ide-search-filters-toggle
            >
              {filtersOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <ListFilter className="size-3.5 text-primary" />
              <span className="min-w-0 flex-1 truncate">包含 / 排除 / 范围</span>
              <span className="min-w-0 max-w-[45%] truncate text-2xs text-subtle" title={`${scopeLabel}${filterSummary ? ` · ${filterSummary}` : ""}`}>
                {filterSummary || scopeLabel}
              </span>
            </button>
            {filtersOpen ? (
              <div className="grid min-w-0 gap-1.5">
                <LabeledSearchInput label="范围" value={scopePath} title={scopeLabel}>
                  <Input
                    value={scopePath}
                    onChange={(event) => setScopePath(normalizeExplorerPath(event.currentTarget.value))}
                    placeholder="例如 apps/web"
                    aria-label="搜索范围"
                    className="h-8 bg-panel font-mono text-xs"
                    data-ide-search-scope
                  />
                </LabeledSearchInput>
                <LabeledSearchInput label="包含" value={includePattern || "全部文件"}>
                  <Input
                    value={includePattern}
                    onChange={(event) => setIncludePattern(event.currentTarget.value)}
                    placeholder="*.ts, apps/web/**"
                    aria-label="包含文件"
                    className="h-8 bg-panel font-mono text-xs"
                    data-ide-search-include
                  />
                </LabeledSearchInput>
                <LabeledSearchInput label="排除" value={excludePattern || "无"}>
                  <Input
                    value={excludePattern}
                    onChange={(event) => setExcludePattern(event.currentTarget.value)}
                    placeholder="node_modules, dist, *.map"
                    aria-label="排除文件"
                    className="h-8 bg-panel font-mono text-xs"
                    data-ide-search-exclude
                  />
                </LabeledSearchInput>
                <div className="grid grid-cols-2 gap-1">
                  <SearchToggle active={recursive} label="递归" onClick={() => setRecursive((value) => !value)}>
                    ↳
                  </SearchToggle>
                  <SearchToggle active={hiddenFiles} label="隐藏文件" onClick={() => setHiddenFiles((value) => !value)}>
                    .*
                  </SearchToggle>
                </div>
              </div>
            ) : (
              <span className="sr-only">
                <Input
                  value={scopePath}
                  onChange={(event) => setScopePath(normalizeExplorerPath(event.currentTarget.value))}
                  aria-label="搜索范围"
                  data-ide-search-scope
                />
              </span>
            )}
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={!draftQuery.trim() || isSearching} data-ide-search-submit>
            {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
            {mode === "symbols" ? "搜索符号" : "搜索"}
          </Button>
        </form>
      </div>
      <div className="min-h-0 overflow-auto overflow-x-hidden overscroll-contain bg-canvas/40 p-2 [scrollbar-width:thin]" data-ide-search-results>
        {!hasSearched ? (
          <SearchEmptyState title="输入关键词开始搜索" description="文件/内容搜索复用 Files search；符号搜索复用 LSP workspace symbols。" />
        ) : submittedMode === "symbols" ? (
          symbolLoading && symbolItems.length === 0 ? (
            <SearchEmptyState title="正在搜索符号…" description="正在扫描当前范围内的 TypeScript/JavaScript 文件。" loading />
          ) : symbolError ? (
            <SearchEmptyState title="符号搜索失败" description={symbolError} tone="danger" />
          ) : filteredSymbolItems.length === 0 ? (
            <SearchEmptyState title="没有符号结果" description={`未找到 “${submittedQuery}”。`} />
          ) : (
            <div className="grid gap-1" role="list" aria-label="IDE 符号搜索结果">
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2 px-1 text-2xs text-subtle" data-ide-search-summary>
                <span className="shrink-0">{filteredSymbolItems.length} 个符号</span>
                <span className="truncate">
                  scanned: {symbolResponse?.scannedFiles ?? 0}{symbolResponse?.truncated ? " · truncated" : ""} · scope: /{symbolResponse?.path ?? scopePath}
                </span>
              </div>
              {filteredSymbolItems.map((item) => (
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
        ) : query.isLoading || query.isFetching && filteredResults.length === 0 ? (
          <SearchEmptyState title="正在搜索…" description="正在查询当前工作区文件名和文本内容。" loading />
        ) : query.isError ? (
          <SearchEmptyState title="搜索失败" description={query.error?.message ?? "请检查搜索条件。"} tone="danger" />
        ) : filteredResults.length === 0 ? (
          <SearchEmptyState title="没有结果" description={`未找到 “${submittedQuery}”。`} />
        ) : (
          <div className="grid gap-1" role="list" aria-label="IDE 搜索结果">
            <div className="mb-1 flex min-w-0 items-center justify-between gap-2 px-1 text-2xs text-subtle" data-ide-search-summary>
              <span className="shrink-0">
                {filteredResults.length} 个结果{filteredResults.length !== results.length ? ` / ${results.length}` : ""}
              </span>
              <span className="truncate">scope: /{query.data?.directoryPath ?? scopePath}</span>
            </div>
            {filteredResults.map((result) => (
              <SearchResultRow
                key={`${result.path}:${result.matchKind}:${result.snippet ?? ""}`}
                result={result}
                query={submittedQuery}
                onOpen={result.kind === "file"
                  ? () => onOpenResult({ rootId, path: result.path, kind: "file", query: submittedQuery })
                  : null}
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={replaceConfirmOpen}
        title="确认替换全部"
        description={`将在当前搜索结果中的 ${replaceConfirmFileCount} 个文件内执行替换。此操作会直接写入文件。`}
        icon={<Replace />}
        tone="warning"
        confirmLabel="替换全部"
        busy={replaceLoading}
        contentDataAttr="search-replace-all"
        onCancel={() => setReplaceConfirmOpen(false)}
        onConfirm={() => void runReplaceAll(true)}
      />
    </aside>
  );
}

function SearchIconToggle({
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
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-6 place-items-center rounded-sm text-subtle outline-none hover:bg-primary-soft hover:text-primary focus-visible:shadow-[var(--ring)]",
        active && "bg-primary-soft text-primary",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-subtle",
      )}
    >
      {children}
    </button>
  );
}

function LabeledSearchInput({
  label,
  value,
  title,
  children,
}: {
  label: string;
  value: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-1">
      <span className="shrink-0 whitespace-nowrap text-2xs font-medium uppercase tracking-wide text-subtle">
        {label}
      </span>
      <div className="min-w-0" title={title ?? value}>{children}</div>
    </div>
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
        "inline-flex h-7 min-w-0 items-center justify-center rounded-sm px-2 text-xs font-medium text-muted outline-none hover:bg-panel hover:text-ink focus-visible:shadow-[var(--ring)]",
        active && "bg-panel text-primary shadow-sm",
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
        "inline-flex h-7 min-w-0 items-center justify-start gap-1 rounded-sm border border-line bg-panel px-2 text-xs text-muted outline-none hover:border-primary-line hover:text-ink focus-visible:shadow-[var(--ring)] [&_svg]:size-3.5",
        active && "border-primary-line bg-primary-soft text-primary",
        disabled && "cursor-not-allowed opacity-50 hover:border-line hover:text-muted",
      )}
    >
      {children}
      <span className="min-w-0 truncate">{label}</span>
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
      className="group grid min-w-0 overflow-hidden rounded-sm border border-transparent bg-panel px-2 py-2 text-left outline-none hover:border-primary-line hover:bg-primary-soft/50 focus-visible:shadow-[var(--ring)]"
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
  onOpen: (() => void) | null;
}) {
  const isDirectory = result.kind === "directory";
  return (
    <button
      type="button"
      className={cn(
        "group grid min-w-0 overflow-hidden rounded-sm border border-transparent bg-panel px-2 py-2 text-left outline-none focus-visible:shadow-[var(--ring)]",
        isDirectory
          ? "cursor-default text-subtle"
          : "hover:border-primary-line hover:bg-primary-soft/50",
      )}
      aria-disabled={isDirectory ? "true" : undefined}
      title={isDirectory ? "目录结果仅展示，不会切换资源管理器路径" : result.path}
      onClick={() => {
        if (!onOpen) return;
        onOpen();
      }}
      data-ide-search-result
      data-ide-search-result-path={result.path}
      data-ide-search-result-kind={result.kind}
      data-ide-search-result-match={result.matchKind ?? "name"}
    >
      <div className="flex min-w-0 items-center gap-2">
        {result.kind === "directory" ? <Folder className="size-4 shrink-0 text-amber" /> : <FileText className="size-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">{result.name}</span>
        <span className="shrink-0 rounded border border-line bg-panel-2 px-1.5 py-0.5 text-2xs text-subtle">
          {isDirectory ? "目录" : result.matchKind ?? "name"}
        </span>
      </div>
      <div className="truncate font-mono text-2xs text-subtle">{result.path}</div>
      {result.snippet ? (
        <div className="line-clamp-2 min-w-0 break-all rounded-sm bg-canvas px-2 py-1 text-xs text-muted" data-ide-search-result-snippet>
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
    <div className="grid min-h-36 place-items-center rounded-sm border border-dashed border-line bg-panel p-4 text-center" data-ide-search-empty>
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

function buildBackendSearchQuery(query: string, options: { regex: boolean; wholeWord: boolean }): string {
  const trimmed = query.trim();
  if (!trimmed || options.regex || !options.wholeWord) return trimmed;
  return `\\b${escapeRegExp(trimmed)}\\b`;
}

function createSearchRegExp(
  query: string,
  options: { regex: boolean; wholeWord: boolean; caseSensitive: boolean },
): { ok: true; value: RegExp } | { ok: false; message: string } {
  const source = options.regex
    ? query
    : options.wholeWord
      ? `\\b${escapeRegExp(query)}\\b`
      : escapeRegExp(query);
  try {
    return { ok: true, value: new RegExp(source, options.caseSensitive ? "g" : "gi") };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePatternList(value: string): string[] {
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterSearchResults(
  results: FileSearchResult[],
  includePattern: string,
  excludePattern: string,
): FileSearchResult[] {
  const include = parsePatternList(includePattern);
  const exclude = parsePatternList(excludePattern);
  return results.filter((result) => pathPassesFilters(result.path, include, exclude));
}

function filterSymbolItems(
  items: LspWorkspaceSymbolItem[],
  includePattern: string,
  excludePattern: string,
): LspWorkspaceSymbolItem[] {
  const include = parsePatternList(includePattern);
  const exclude = parsePatternList(excludePattern);
  return items.filter((item) => pathPassesFilters(item.path, include, exclude));
}

function pathPassesFilters(path: string, include: string[], exclude: string[]): boolean {
  if (include.length && !include.some((pattern) => matchPathPattern(path, pattern))) return false;
  if (exclude.some((pattern) => matchPathPattern(path, pattern))) return false;
  return true;
}

function matchPathPattern(path: string, pattern: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalizedPattern) return true;
  if (!/[?*]/.test(normalizedPattern)) {
    return normalizedPath.includes(normalizedPattern.replace(/^\/+|\/+$/g, ""));
  }
  const escaped = normalizedPattern
    .split("**")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "."))
    .join(".*");
  return new RegExp(`(^|/)${escaped}($|/)`).test(normalizedPath);
}

function formatFilterSummary(includePattern: string, excludePattern: string): string {
  const parts: string[] = [];
  if (includePattern.trim()) parts.push(`包含 ${parsePatternList(includePattern).length}`);
  if (excludePattern.trim()) parts.push(`排除 ${parsePatternList(excludePattern).length}`);
  return parts.join(" · ");
}

function uniqueFileResults(results: FileSearchResult[]): FileSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (result.kind !== "file" || seen.has(result.path)) return false;
    seen.add(result.path);
    return true;
  });
}
