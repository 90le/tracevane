import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { ReplaceDiffPreview, createReplaceDiffLines } from "./ReplaceDiffPreview";

export interface TextSearchReplaceStripProps {
  content: string;
  editable: boolean;
  onChange: (content: string) => void;
  onSearchStateChange?: (state: TextSearchState) => void;
  focusTarget?: "query" | "replace";
  focusSignal?: number;
  initialQuery?: string;
  initialCaseSensitive?: boolean;
  initialRegex?: boolean;
  initialSignal?: number;
  title?: string;
  idleHint?: string;
  density?: "default" | "compact";
  className?: string;
}

export interface TextSearchState {
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  activeIndex: number;
  count: number;
}

export function TextSearchReplaceStrip({
  content,
  editable,
  onChange,
  onSearchStateChange,
  focusTarget = "query",
  focusSignal = 0,
  initialQuery = "",
  initialCaseSensitive = false,
  initialRegex = false,
  initialSignal = 0,
  title = "同标签页查找/替换",
  idleHint = "支持代码高亮、Ctrl/⌘+F、批量替换",
  density = "default",
  className,
}: TextSearchReplaceStripProps) {
  const [query, setQuery] = React.useState(initialQuery);
  const [replaceWith, setReplaceWith] = React.useState("");
  const [caseSensitive, setCaseSensitive] = React.useState(initialCaseSensitive);
  const [regex, setRegex] = React.useState(initialRegex);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [replacePreviewOpen, setReplacePreviewOpen] = React.useState(false);
  const queryInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceInputRef = React.useRef<HTMLInputElement | null>(null);
  const matchResult = React.useMemo(
    () => countTextMatches(content, query, { caseSensitive, regex }),
    [caseSensitive, content, query, regex],
  );
  const replacePreviewLines = React.useMemo(
    () => createReplaceDiffLines(content, query, replaceWith, { caseSensitive, regex }),
    [caseSensitive, content, query, regex, replaceWith],
  );

  React.useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    setCaseSensitive(initialCaseSensitive);
    setRegex(initialRegex);
    setActiveIndex(0);
  }, [initialCaseSensitive, initialQuery, initialRegex, initialSignal]);

  React.useEffect(() => {
    setActiveIndex(0);
    setReplacePreviewOpen(false);
  }, [caseSensitive, query, regex]);

  React.useEffect(() => {
    setReplacePreviewOpen(false);
  }, [replaceWith]);

  React.useEffect(() => {
    if (matchResult.count > 0 && activeIndex >= matchResult.count) setActiveIndex(matchResult.count - 1);
  }, [activeIndex, matchResult.count]);

  React.useEffect(() => {
    const target = focusTarget === "replace" && editable ? replaceInputRef.current : queryInputRef.current;
    if (!target) return;
    target.focus();
    target.select();
  }, [editable, focusSignal, focusTarget]);

  React.useEffect(() => {
    onSearchStateChange?.({
      query: matchResult.error ? "" : query,
      caseSensitive,
      regex,
      activeIndex,
      count: matchResult.count,
    });
  }, [activeIndex, caseSensitive, matchResult.count, matchResult.error, onSearchStateChange, query, regex]);

  const replaceNext = React.useCallback(() => {
    const next = replaceText(content, query, replaceWith, {
      caseSensitive,
      regex,
      all: false,
      activeIndex,
    });
    if (next !== content) onChange(next);
    setReplacePreviewOpen(false);
  }, [activeIndex, caseSensitive, content, onChange, query, regex, replaceWith]);

  const confirmReplaceAll = React.useCallback(() => {
    const next = replaceText(content, query, replaceWith, {
      caseSensitive,
      regex,
      all: true,
    });
    if (next !== content) onChange(next);
    setReplacePreviewOpen(false);
  }, [caseSensitive, content, onChange, query, regex, replaceWith]);

  const goPrevious = React.useCallback(() => {
    if (matchResult.count <= 0) return;
    setActiveIndex((value) => (value - 1 + matchResult.count) % matchResult.count);
  }, [matchResult.count]);

  const goNext = React.useCallback(() => {
    if (matchResult.count <= 0) return;
    setActiveIndex((value) => (value + 1) % matchResult.count);
  }, [matchResult.count]);

  return (
    <div
      className={cn(
        "grid rounded border border-line bg-panel text-xs",
        density === "compact" ? "gap-1.5 px-2 py-1.5" : "gap-2 px-2 py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">{title}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5",
            matchResult.error ? "bg-danger/10 text-danger" : "bg-panel-2 text-muted",
          )}
        >
          {matchResult.error
            ? matchResult.error
            : query
              ? `${matchResult.count > 0 ? activeIndex + 1 : 0}/${matchResult.count} 处匹配`
              : idleHint}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={goPrevious}
          disabled={!query || matchResult.count === 0}
        >
          上一个
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={goNext}
          disabled={!query || matchResult.count === 0}
        >
          下一个
        </Button>
        <label className="ml-auto inline-flex items-center gap-1 text-muted">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
            className="size-3 accent-primary"
          />
          Aa
        </label>
        <label className="inline-flex items-center gap-1 text-muted">
          <input
            type="checkbox"
            checked={regex}
            onChange={(event) => setRegex(event.target.checked)}
            className="size-3 accent-primary"
          />
          Regex
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto]">
        <Input
          ref={queryInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="查找文本 / 正则"
          className={cn("text-xs", density === "compact" ? "h-7" : "h-8")}
        />
        <Input
          ref={replaceInputRef}
          value={replaceWith}
          onChange={(event) => setReplaceWith(event.target.value)}
          placeholder="替换为"
          className={cn("text-xs", density === "compact" ? "h-7" : "h-8")}
          disabled={!editable}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={replaceNext}
          disabled={!editable || !query || matchResult.count === 0}
        >
          替换一个
        </Button>
        <Button
          variant={replacePreviewOpen ? "primary" : "outline"}
          size="sm"
          onClick={() => setReplacePreviewOpen((value) => !value)}
          disabled={!editable || !query || matchResult.count === 0}
        >
          预览全部
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={confirmReplaceAll}
          disabled={!editable || !replacePreviewOpen || !query || matchResult.count === 0}
          title="先预览差异，再确认替换当前文件内全部匹配"
        >
          确认全部替换
        </Button>
      </div>
      {replacePreviewOpen ? (
        <div className="grid gap-2 border-t border-line pt-2" data-text-replace-preview>
          <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">
            <span className="font-medium text-ink-strong">替换前预览</span>
            <span>将替换当前文件内 {matchResult.count} 处匹配；下方最多展示前 8 行差异。</span>
            <span className="ml-auto">确认后进入未保存状态，仍需保存文件写回磁盘。</span>
          </div>
          <ReplaceDiffPreview
            lines={replacePreviewLines}
            query={query}
            replaceWith={replaceWith}
            options={{ caseSensitive, regex }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function countTextMatches(
  content: string,
  query: string,
  options: { caseSensitive: boolean; regex: boolean },
): { count: number; error?: string } {
  if (!query) return { count: 0 };
  try {
    const matcher = createSearchPattern(query, options, true);
    const matches = content.match(matcher);
    return { count: matches?.length ?? 0 };
  } catch {
    return { count: 0, error: "正则无效" };
  }
}

export function replaceText(
  content: string,
  query: string,
  replacement: string,
  options: { caseSensitive: boolean; regex: boolean; all: boolean; activeIndex?: number },
): string {
  if (!query) return content;
  try {
    if (!options.all && typeof options.activeIndex === "number") {
      const matches = collectTextMatchRanges(content, query, options);
      const match = matches[options.activeIndex] ?? matches[0];
      if (!match) return content;
      const nextReplacement = options.regex
        ? content.slice(match.start, match.end).replace(createSearchPattern(query, options, false), replacement)
        : replacement;
      return `${content.slice(0, match.start)}${nextReplacement}${content.slice(match.end)}`;
    }
    const matcher = createSearchPattern(query, options, options.all);
    return content.replace(matcher, replacement);
  } catch {
    return content;
  }
}

export function collectTextMatchRanges(
  content: string,
  query: string,
  options: { caseSensitive: boolean; regex: boolean },
): Array<{ start: number; end: number }> {
  if (!query) return [];
  const matcher = createSearchPattern(query, options, true);
  const matches: Array<{ start: number; end: number }> = [];
  for (const match of content.matchAll(matcher)) {
    const value = match[0] ?? "";
    const start = match.index ?? 0;
    if (!value) break;
    matches.push({ start, end: start + value.length });
  }
  return matches;
}

export function createSearchPattern(
  query: string,
  options: { caseSensitive: boolean; regex: boolean },
  global: boolean,
): RegExp {
  const flags = `${global ? "g" : ""}${options.caseSensitive ? "" : "i"}`;
  return new RegExp(options.regex ? query : escapeRegExp(query), flags);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default TextSearchReplaceStrip;
