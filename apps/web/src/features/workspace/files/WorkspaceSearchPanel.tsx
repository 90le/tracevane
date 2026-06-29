import * as React from "react";
import {
  Clipboard,
  File,
  Folder,
  Search,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
import { filesKeys } from "@/lib/query/files";
import { readFile, writeFileContent } from "@/lib/api/files";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useFilesSearchQuery } from "@/lib/query/files";
import {
  ReplaceDiffPreview,
  countTextMatches,
  createReplaceDiffLines,
  replaceText,
  type ReplacePreviewLine,
} from "@/features/workspace/shared";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";
import { createSearchPanelCommands } from "./searchPanelCommands";
import type { FileSearchResult } from "./types";

export interface WorkspaceOpenFileOptions {
  /** Root id that owns the opened path; editor tabs keep this stable when the explorer switches roots. */
  rootId?: string;
  initialSearch?: {
    query: string;
    caseSensitive?: boolean;
    regex?: boolean;
  };
}

export interface WorkspaceSearchPanelProps {
  rootId: string;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
  onCommandsChange?: (commands: WorkspaceCommand[]) => void;
}

const WORKSPACE_SEARCH_LIMIT = 250;

interface ReplacePlanItem {
  path: string;
  name: string;
  content: string;
  nextContent: string;
  matches: number;
  diffLines: ReplacePreviewLine[];
}

interface ReplaceUndoPackage {
  id: string;
  createdAt: string;
  query: string;
  replacement: string;
  items: Array<{
    path: string;
    previousContent: string;
    replacedContent: string;
  }>;
}

export function WorkspaceSearchPanel({
  rootId,
  onOpenFile,
  onCommandsChange,
}: WorkspaceSearchPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [replaceWith, setReplaceWith] = React.useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = React.useState(false);
  const [searchRegex, setSearchRegex] = React.useState(false);
  const [replaceBusy, setReplaceBusy] = React.useState(false);
  const [replacePlan, setReplacePlan] = React.useState<
    ReplacePlanItem[] | null
  >(null);
  const [replaceSelection, setReplaceSelection] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [undoPackage, setUndoPackage] =
    React.useState<ReplaceUndoPackage | null>(null);
  const [includeHidden, setIncludeHidden] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceInputRef = React.useRef<HTMLInputElement | null>(null);
  const [resultMenu, setResultMenu] = React.useState<SearchResultMenuState | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setQuery(draft.trim()), 220);
    return () => window.clearTimeout(id);
  }, [draft]);

  const search = useFilesSearchQuery(
    rootId && query
      ? {
          rootId,
          query,
          recursive: true,
          hidden: includeHidden,
          caseSensitive: searchCaseSensitive,
          regex: searchRegex,
          limit: WORKSPACE_SEARCH_LIMIT,
        }
      : null,
  );
  const results = search.data?.results ?? [];
  const searchLimit = search.data?.limit ?? 250;
  const searchTruncated = Boolean(search.data?.truncated);
  const indexStats = search.data?.index;
  const replaceTargets = results.filter(
    (result) => result.kind === "file" && result.textLike,
  );
  const selectedReplacePlanItems = React.useMemo(
    () =>
      (replacePlan ?? []).filter((item) => replaceSelection.has(item.path)),
    [replacePlan, replaceSelection],
  );
  const replaceOptions = React.useMemo(
    () => ({ caseSensitive: searchCaseSensitive, regex: searchRegex }),
    [searchCaseSensitive, searchRegex],
  );

  const searchContext = React.useMemo(
    () =>
      formatWorkspaceSearchAiContext({
        rootId,
        query,
        caseSensitive: searchCaseSensitive,
        regex: searchRegex,
        includeHidden,
        truncated: searchTruncated,
        limit: searchLimit,
        indexUsed: Boolean(indexStats?.used),
        results,
      }),
    [
      rootId,
      query,
      searchCaseSensitive,
      searchRegex,
      includeHidden,
      searchTruncated,
      searchLimit,
      indexStats?.used,
      results,
    ],
  );

  const copySearchAiContext = React.useCallback(() => {
    if (!query || results.length === 0) {
      toast.info("没有可复制的搜索上下文", {
        description: "请先输入关键词并等待搜索结果返回。",
      });
      return;
    }
    void navigator.clipboard.writeText(searchContext).then(
      () =>
        toast.success("已复制搜索上下文证据", {
          description: searchTruncated
            ? "结果已按后端上限截断，建议收窄关键词后再形成证据包。"
            : "可用于审查命中范围、生成修改计划或批量替换建议。",
        }),
      () =>
        toast.error("复制搜索上下文失败", {
          description: "请检查浏览器剪贴板权限。",
        }),
    );
  }, [query, results.length, searchContext, searchTruncated]);

  const focusSearchInput = React.useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const clearSearch = React.useCallback(() => {
    setDraft("");
    setQuery("");
    setReplacePlan(null);
    setReplaceSelection(new Set());
    searchInputRef.current?.focus();
  }, []);

  const focusReplaceInput = React.useCallback(() => {
    replaceInputRef.current?.focus();
    replaceInputRef.current?.select();
  }, []);

  const clearReplaceInput = React.useCallback(() => {
    setReplaceWith("");
    setReplacePlan(null);
    setReplaceSelection(new Set());
    replaceInputRef.current?.focus();
  }, []);

  const prepareReplacePlan = React.useCallback(async () => {
    if (!rootId || !query || replaceTargets.length === 0) return;
    const validation = countTextMatches("", query, replaceOptions);
    if (validation.error) {
      toast.error("替换表达式无效", { description: validation.error });
      return;
    }
    setReplaceBusy(true);
    const planItems: ReplacePlanItem[] = [];
    let failedReads = 0;
    try {
      for (const result of replaceTargets) {
        try {
          const read = await readFile({ rootId, path: result.path });
          if (typeof read.content !== "string") continue;
          const content = read.content;
          const matchInfo = countTextMatches(content, query, replaceOptions);
          if (matchInfo.error || matchInfo.count === 0) continue;
          const nextContent = replaceText(content, query, replaceWith, {
            ...replaceOptions,
            all: true,
          });
          planItems.push({
            path: result.path,
            name: result.name,
            content,
            nextContent,
            matches: matchInfo.count,
            diffLines: createReplaceDiffLines(
              content,
              query,
              replaceWith,
              replaceOptions,
            ),
          });
        } catch {
          failedReads += 1;
        }
      }
      setReplacePlan(planItems);
      setReplaceSelection(new Set(planItems.map((item) => item.path)));
      if (failedReads)
        toast.error("替换计划部分生成失败", {
          description: `${failedReads} 个文件无法读取，已跳过。`,
        });
      if (!planItems.length)
        toast.info("没有可替换内容", {
          description: "搜索结果中未找到精确匹配的可写文本。",
        });
    } finally {
      setReplaceBusy(false);
    }
  }, [query, replaceOptions, replaceTargets, replaceWith, rootId]);

  const applyReplacePlan = React.useCallback(async () => {
    if (!rootId || !selectedReplacePlanItems.length) return;
    setReplaceBusy(true);
    let changed = 0;
    let failed = 0;
    const undoItems: ReplaceUndoPackage["items"] = [];
    try {
      for (const item of selectedReplacePlanItems) {
        try {
          await writeFileContent({
            rootId,
            path: item.path,
            content: item.nextContent,
          });
          undoItems.push({
            path: item.path,
            previousContent: item.content,
            replacedContent: item.nextContent,
          });
          changed += 1;
        } catch {
          failed += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: filesKeys.all });
      if (undoItems.length) {
        setUndoPackage({
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          query,
          replacement: replaceWith,
          items: undoItems,
        });
      }
      setReplacePlan(null);
      setReplaceSelection(new Set());
      if (failed)
        toast.error("批量替换部分失败", {
          description: `已更新 ${changed} 个文件，${failed} 个失败。`,
        });
      else
        toast.success("批量替换完成", {
          description: `已更新 ${changed} 个文件。`,
        });
    } finally {
      setReplaceBusy(false);
    }
  }, [query, queryClient, replaceWith, rootId, selectedReplacePlanItems]);

  const toggleReplacePlanItem = React.useCallback((path: string) => {
    setReplaceSelection((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAllReplacePlanItems = React.useCallback(
    (selected: boolean) => {
      setReplaceSelection(
        selected
          ? new Set((replacePlan ?? []).map((item) => item.path))
          : new Set(),
      );
    },
    [replacePlan],
  );

  const undoLastReplace = React.useCallback(async () => {
    if (!rootId || !undoPackage?.items.length) return;
    setReplaceBusy(true);
    let restored = 0;
    let failed = 0;
    try {
      for (const item of undoPackage.items) {
        try {
          const current = await readFile({ rootId, path: item.path });
          if (current.content !== item.replacedContent) {
            failed += 1;
            continue;
          }
          await writeFileContent({
            rootId,
            path: item.path,
            content: item.previousContent,
          });
          restored += 1;
        } catch {
          failed += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: filesKeys.all });
      if (failed)
        toast.error("撤销部分失败", {
          description: `已恢复 ${restored} 个文件，${failed} 个文件已变化或写入失败。`,
        });
      else
        toast.success("已撤销上次批量替换", {
          description: `已恢复 ${restored} 个文件。`,
        });
      if (!failed) setUndoPackage(null);
    } finally {
      setReplaceBusy(false);
    }
  }, [queryClient, rootId, undoPackage]);

  const copySearchResultText = React.useCallback(
    (text: string, success: string, description?: string) => {
      void navigator.clipboard.writeText(text).then(
        () => toast.success(success, description ? { description } : undefined),
        () =>
          toast.error("复制失败", {
            description: "请检查浏览器剪贴板权限。",
          }),
      );
    },
    [],
  );

  const openResultMenu = React.useCallback(
    (event: React.MouseEvent | React.PointerEvent, result: FileSearchResult) => {
      event.preventDefault();
      event.stopPropagation();
      setResultMenu({ result, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const closeResultMenu = React.useCallback(() => setResultMenu(null), []);

  const searchPanelCommands = React.useMemo(
    () =>
      createSearchPanelCommands({
        query,
        resultCount: results.length,
        replaceTargetCount: replaceTargets.length,
        replaceBusy,
        hasReplacePlan: Boolean(replacePlan?.length),
        hasUndoPackage: Boolean(undoPackage?.items.length),
        focusSearch: focusSearchInput,
        clearSearch,
        copySearchAiContext,
        focusReplace: focusReplaceInput,
        clearReplace: clearReplaceInput,
        prepareReplacePlan: () => void prepareReplacePlan(),
        applyReplacePlan: () => void applyReplacePlan(),
        undoLastReplace: () => void undoLastReplace(),
      }),
    [
      applyReplacePlan,
      clearSearch,
      copySearchAiContext,
      clearReplaceInput,
      focusReplaceInput,
      focusSearchInput,
      prepareReplacePlan,
      query,
      replaceBusy,
      replacePlan?.length,
      replaceTargets.length,
      results.length,
      undoLastReplace,
      undoPackage?.items.length,
    ],
  );

  React.useEffect(() => {
    onCommandsChange?.(searchPanelCommands);
    return () => onCommandsChange?.([]);
  }, [onCommandsChange, searchPanelCommands]);

  React.useEffect(() => {
    setResultMenu(null);
  }, [query, rootId]);

  React.useEffect(() => {
    if (!resultMenu) return undefined;
    const close = () => setResultMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [resultMenu]);

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-panel">
      <header className="grid gap-2 border-b border-line px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-subtle">
              <Search className="size-3.5" />
              项目搜索
            </div>
            <p className="mt-1 text-xs text-muted" data-workspace-search-panel-summary>
              文件名、内容、上下文证据和跨文件替换计划都在同一个 IDE 搜索面板内完成。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 text-2xs" data-workspace-search-panel-metrics>
            <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-muted">
              结果 {results.length}/{searchLimit}
            </span>
            <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-muted">
              可替换 {replaceTargets.length}
            </span>
            {replacePlan?.length ? (
              <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-primary">
                计划 {selectedReplacePlanItems.length}/{replacePlan.length}
              </span>
            ) : null}
          </div>
        </div>
        <Input
          ref={searchInputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="搜索文件名或内容…"
          className="h-8 bg-panel-2 text-sm"
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(event) => setIncludeHidden(event.target.checked)}
              className="size-3 accent-primary"
            />
            包含隐藏文件
          </label>
          <span>
            结果上限 {searchLimit}{" "}
            条由后端保护；批量替换前必须审查计划并可逐文件排除。
          </span>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={searchCaseSensitive}
              onChange={(event) => setSearchCaseSensitive(event.target.checked)}
              className="size-3 accent-primary"
            />
            区分大小写
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={searchRegex}
              onChange={(event) => setSearchRegex(event.target.checked)}
              className="size-3 accent-primary"
            />
            正则搜索
          </label>
          {indexStats?.used ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
              内容索引命中 {indexStats.resultCount}/{indexStats.candidateCount}
            </span>
          ) : query && !search.isLoading ? (
            <span className="rounded-full bg-panel-2 px-2 py-0.5 text-subtle">
              索引未命中，已扫描补全
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!query || results.length === 0}
            onClick={copySearchAiContext}
            data-workspace-search-copy-ai-context
          >
            <Sparkles className="size-3.5" />
            复制上下文证据
          </Button>
        </div>
        <div className="grid gap-2 rounded border border-line bg-panel-2 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink-strong">审查替换计划</span>
              <span className="text-subtle">
                当前结果内批量替换；支持大小写、正则、审查确认和撤销。
              </span>
            </div>
            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-2xs text-muted">
              显式审查后写入
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              ref={replaceInputRef}
              value={replaceWith}
              onChange={(event) => setReplaceWith(event.target.value)}
              placeholder="替换为…"
              className="h-8 bg-panel text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!query || replaceTargets.length === 0 || replaceBusy}
              onClick={() => void prepareReplacePlan()}
            >
              {replaceBusy
                ? "分析中..."
                : `审查替换计划 ${replaceTargets.length} 个文件`}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              替换沿用当前搜索模式：
              {searchCaseSensitive ? "区分大小写" : "不区分大小写"}
              {searchRegex ? " · 正则替换" : ""}；只写入本次计划勾选的文本文件。
            </span>
          </div>
        </div>
        {undoPackage ? (
          <ReplaceUndoStrip
            undoPackage={undoPackage}
            busy={replaceBusy}
            onUndo={() => void undoLastReplace()}
            onDismiss={() => setUndoPackage(null)}
          />
        ) : null}
      </header>
      <div
        className="min-h-0 overflow-auto p-2"
        data-workspace-search-scrollport
      >
        {!query ? (
          <EmptyState
            title="输入关键词搜索"
            description="搜索当前 workspace root 的文件名和内容。"
            icon={<Search />}
          />
        ) : search.isLoading ? (
          <div className="grid gap-1.5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : search.error || search.data?.error ? (
          <ErrorState
            title="搜索失败"
            description={search.error?.message ?? search.data?.error}
          />
        ) : results.length === 0 ? (
          <EmptyState
            title="无匹配结果"
            description={query}
            icon={<Search />}
          />
        ) : (
          <div className="grid gap-1">
            {searchTruncated ? (
              <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                搜索已达到 {searchLimit} 条结果上限；请收窄关键词，避免在大型
                workspace 中一次性渲染过多结果。
              </div>
            ) : null}
            {results.map((result) => (
              <SearchResultRow
                key={result.path}
                result={result}
                query={query}
                caseSensitive={searchCaseSensitive}
                regex={searchRegex}
                onOpenFile={onOpenFile}
                onOpenMenu={openResultMenu}
              />
            ))}
          </div>
        )}
      </div>
      {resultMenu ? (
        <SearchResultContextMenu
          x={resultMenu.x}
          y={resultMenu.y}
          result={resultMenu.result}
          query={query}
          rootId={rootId}
          onClose={closeResultMenu}
          onCopy={copySearchResultText}
          onOpenFile={onOpenFile}
        />
      ) : null}
      <ReplacePlanDialog
        items={replacePlan}
        selectedPaths={replaceSelection}
        query={query}
        replaceWith={replaceWith}
        replaceOptions={replaceOptions}
        busy={replaceBusy}
        onClose={() => setReplacePlan(null)}
        onToggleItem={toggleReplacePlanItem}
        onSelectAll={selectAllReplacePlanItems}
        onApply={() => void applyReplacePlan()}
      />
    </section>
  );
}

function formatWorkspaceSearchAiContext({
  rootId,
  query,
  caseSensitive,
  regex,
  includeHidden,
  truncated,
  limit,
  indexUsed,
  results,
}: {
  rootId: string;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  includeHidden: boolean;
  truncated: boolean;
  limit: number;
  indexUsed: boolean;
  results: FileSearchResult[];
}): string {
  const lines = [
    "@search results",
    `rootId: ${rootId}`,
    `query: ${query}`,
    `caseSensitive: ${caseSensitive ? "yes" : "no"}`,
    `regex: ${regex ? "yes" : "no"}`,
    `includeHidden: ${includeHidden ? "yes" : "no"}`,
    `indexUsed: ${indexUsed ? "yes" : "no"}`,
    `resultCount: ${results.length}`,
    `limit: ${limit}`,
    `truncated: ${truncated ? "yes" : "no"}`,
    "",
    "## Top results",
  ];
  for (const result of results.slice(0, 20)) {
    const snippet = result.snippet?.trim();
    lines.push(
      `- ${result.kind} ${result.path}${result.textLike ? " text" : ""}${
        snippet ? ` :: ${snippet}` : ""
      }`,
    );
  }
  if (results.length > 20) lines.push(`- ... ${results.length - 20} more`);
  lines.push(
    "",
    "## Request",
    "请基于这些搜索结果总结命中范围、潜在修改点、风险，并给出最小可验证修改计划。",
  );
  return lines.join("\n");
}

function ReplaceUndoStrip({
  undoPackage,
  busy,
  onUndo,
  onDismiss,
}: {
  undoPackage: ReplaceUndoPackage;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="grid gap-2 rounded border border-warning/30 bg-warning/10 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">上次批量替换可撤销</span>
        <span className="text-muted">
          {undoPackage.items.length} 个文件 ·{" "}
          {new Date(undoPackage.createdAt).toLocaleTimeString()} ·
          <span className="ml-1 font-mono">
            “{undoPackage.query}” → “{undoPackage.replacement}”
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={busy}>
          {busy ? "撤销中..." : "撤销上次替换"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
          丢弃撤销包
        </Button>
      </div>
    </div>
  );
}

function SearchResultRow({
  result,
  query,
  caseSensitive,
  regex,
  onOpenFile,
  onOpenMenu,
}: {
  result: FileSearchResult;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
  onOpenMenu: (event: React.MouseEvent | React.PointerEvent, result: FileSearchResult) => void;
}) {
  const isFile = result.kind === "file";
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);
  React.useEffect(() => clearLongPressTimer, [clearLongPressTimer]);
  const startLongPress = React.useCallback(
    (event: React.PointerEvent) => {
      longPressTriggeredRef.current = false;
      clearLongPressTimer();
      const x = event.clientX;
      const y = event.clientY;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        onOpenMenu({ ...event, clientX: x, clientY: y } as React.PointerEvent, result);
      }, 520);
    },
    [clearLongPressTimer, onOpenMenu, result],
  );
  return (
    <button
      type="button"
      aria-disabled={!isFile || !result.textLike}
      onClick={(event) => {
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          longPressTriggeredRef.current = false;
          return;
        }
        if (!isFile || !result.textLike) return;
        onOpenFile(result.path, {
          initialSearch: { query, caseSensitive, regex },
        });
      }}
      onContextMenu={(event) => onOpenMenu(event, result)}
      onPointerDown={startLongPress}
      onPointerMove={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerUp={clearLongPressTimer}
      className="grid w-full touch-manipulation grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-panel-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:shadow-[var(--ring)]"
      title={result.path}
      data-workspace-search-result-row
    >
      {result.kind === "directory" ? (
        <Folder className="mt-0.5 size-4 text-primary" />
      ) : (
        <File className="mt-0.5 size-4 text-muted" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink-strong">
          {result.name}
        </span>
        <span className="block truncate text-2xs text-subtle">
          {result.directoryPath || "/"}
        </span>
        {result.snippet ? (
          <span className="mt-0.5 block truncate text-xs text-muted">
            <HighlightedText
              text={result.snippet}
              query={query}
              caseSensitive={caseSensitive}
              regex={regex}
            />
          </span>
        ) : null}
      </span>
    </button>
  );
}

interface SearchResultMenuState {
  result: FileSearchResult;
  x: number;
  y: number;
}

function SearchResultContextMenu({
  x,
  y,
  result,
  query,
  rootId,
  onClose,
  onCopy,
  onOpenFile,
}: {
  x: number;
  y: number;
  result: FileSearchResult;
  query: string;
  rootId: string;
  onClose: () => void;
  onCopy: (text: string, success: string, description?: string) => void;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
}) {
  const isFile = result.kind === "file";
  const actions = [
    {
      id: "open",
      label: isFile ? "打开并定位搜索" : "目录结果不可打开",
      disabled: !isFile || !result.textLike,
      icon: <File />,
      run: () =>
        onOpenFile(result.path, {
          rootId,
          initialSearch: { query },
        }),
    },
    {
      id: "copyPath",
      label: "复制路径",
      icon: <Clipboard />,
      run: () => onCopy(result.path, "已复制搜索结果路径"),
    },
    {
      id: "copyRelativePath",
      label: "复制相对路径",
      icon: <Clipboard />,
      run: () => onCopy(result.path, "已复制相对路径"),
    },
    {
      id: "copyResultContext",
      label: "复制单条上下文证据",
      icon: <Sparkles />,
      run: () =>
        onCopy(
          formatSingleSearchResultAiContext({ rootId, query, result }),
          "已复制单条搜索上下文证据",
        ),
    },
    {
      id: "copyRipgrepCommand",
      label: "复制终端 rg 命令",
      icon: <TerminalSquare />,
      run: () =>
        onCopy(
          formatSearchResultRipgrepCommand(query, result),
          "已复制 rg 命令",
          "可粘贴到终端中继续定位该结果。",
        ),
    },
    {
      id: "insertRipgrepToTerminal",
      label: "插入 rg 到终端",
      icon: <TerminalSquare />,
      run: () => insertSearchResultRipgrepToTerminal(query, result),
    },
  ];
  return (
    <div
      role="menu"
      className="fixed z-50 max-h-[min(80vh,24rem)] min-w-56 overflow-y-auto rounded-lg border border-line bg-panel p-1 text-xs text-ink-strong shadow-xl"
      style={clampSearchResultMenuPosition(x, y, 248, 336)}
      data-workspace-search-result-menu
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          data-workspace-search-result-action={action.id}
          onClick={() => {
            action.run();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:text-muted"
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
      <div className="my-1 h-px bg-line" />
      <div className="max-w-72 truncate px-2 py-1 font-mono text-2xs text-subtle" title={result.path}>
        {result.path}
      </div>
    </div>
  );
}

function clampSearchResultMenuPosition(
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

function formatSingleSearchResultAiContext({
  rootId,
  query,
  result,
}: {
  rootId: string;
  query: string;
  result: FileSearchResult;
}): string {
  return [
    "@search result",
    `rootId: ${rootId}`,
    `query: ${query}`,
    `path: ${result.path}`,
    `kind: ${result.kind}`,
    `matchKind: ${result.matchKind ?? "unknown"}`,
    result.snippet ? `snippet: ${result.snippet}` : "snippet: ",
    "",
    "请解释这个搜索结果的上下文、可能需要修改的位置和风险。",
  ].join("\n");
}

function insertSearchResultRipgrepToTerminal(
  query: string,
  result: FileSearchResult,
): void {
  window.dispatchEvent(
    new CustomEvent("tracevane:workspace-terminal-insert-input", {
      detail: {
        id: `search-rg-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        value: `${formatSearchResultRipgrepCommand(query, result)}\n`,
        label: "已插入搜索 rg 命令",
      },
    }),
  );
}

function formatSearchResultRipgrepCommand(
  query: string,
  result: FileSearchResult,
): string {
  const pathArg = shellQuote(result.path || ".");
  const queryArg = shellQuote(query);
  return `rg --line-number --context 2 ${queryArg} ${pathArg}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\''`)}'`;
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
  if (!query) return <>{text}</>;
  const match = findHighlightMatch(text, query, { caseSensitive, regex });
  const index = match?.index ?? -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-warning/20 px-0.5 text-ink-strong">
        {text.slice(index, index + (match?.length ?? query.length))}
      </mark>
      {text.slice(index + (match?.length ?? query.length))}
    </>
  );
}

function findHighlightMatch(
  text: string,
  query: string,
  options: { caseSensitive: boolean; regex: boolean },
): { index: number; length: number } | null {
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

function ReplacePlanDialog({
  items,
  selectedPaths,
  query,
  replaceWith,
  replaceOptions,
  busy,
  onClose,
  onToggleItem,
  onSelectAll,
  onApply,
}: {
  items: ReplacePlanItem[] | null;
  selectedPaths: Set<string>;
  query: string;
  replaceWith: string;
  replaceOptions: { caseSensitive: boolean; regex: boolean };
  busy: boolean;
  onClose: () => void;
  onToggleItem: (path: string) => void;
  onSelectAll: (selected: boolean) => void;
  onApply: () => void;
}) {
  const totalMatches = items?.reduce((sum, item) => sum + item.matches, 0) ?? 0;
  const selectedItems =
    items?.filter((item) => selectedPaths.has(item.path)) ?? [];
  const selectedMatches = selectedItems.reduce(
    (sum, item) => sum + item.matches,
    0,
  );
  const allSelected = Boolean(
    items?.length && selectedItems.length === items.length,
  );
  return (
    <Dialog
      open={items !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(760px,94vw)]">
        <DialogHeader>
          <DialogTitle>审查跨文件替换计划</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3 text-sm">
          <div className="rounded border border-line bg-panel-2 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-ink-strong">
                将把当前搜索结果中的精确匹配替换后再写回文件。
              </div>
              <label className="ml-auto inline-flex items-center gap-1.5 text-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => onSelectAll(event.target.checked)}
                  className="size-3 accent-primary"
                  disabled={!items?.length || busy}
                />
                全选本次计划
              </label>
            </div>
            <div className="mt-1 text-muted">
              <span className="font-mono">“{query}”</span>
              <span> → </span>
              <span className="font-mono">“{replaceWith}”</span>
              <span>
                {" "}
                · {replaceOptions.caseSensitive ? "区分大小写" : "不区分大小写"}
              </span>
              {replaceOptions.regex ? <span> · 正则</span> : null}
              <span>
                {" "}
                · 已选 {selectedItems.length}/{items?.length ?? 0} 个文件 ·{" "}
                {selectedMatches}/{totalMatches} 处匹配
              </span>
            </div>
          </div>
          <div className="max-h-[48vh] overflow-auto rounded border border-line">
            {!items?.length ? (
              <div className="p-4 text-center text-muted">
                没有可应用的替换。
              </div>
            ) : (
              <div className="divide-y divide-line">
                {items.map((item) => (
                  <article key={item.path} className="grid gap-2 p-3 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedPaths.has(item.path)}
                        onChange={() => onToggleItem(item.path)}
                        className="size-3 accent-primary"
                        disabled={busy}
                        aria-label={`选择替换 ${item.path}`}
                      />
                      <File className="size-4 text-muted" />
                      <span
                        className="min-w-0 flex-1 truncate font-medium text-ink-strong"
                        title={item.path}
                      >
                        {item.path}
                      </span>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                        {item.matches} 处
                      </span>
                    </div>
                    <ReplaceDiffPreview
                      lines={item.diffLines}
                      query={query}
                      replaceWith={replaceWith}
                      options={replaceOptions}
                    />
                  </article>
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={onApply}
            disabled={busy || selectedItems.length === 0}
          >
            {busy ? "写入中..." : "确认全部替换"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
