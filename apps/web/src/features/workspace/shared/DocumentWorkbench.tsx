import * as React from "react";
import { Columns2, FileCode } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { CodeEditor } from "@/features/workspace/editor/CodeEditor";
import {
  DocumentPreview,
  canRenderDocumentPreview,
  isHtmlDocument,
  isMarkdownDocument,
} from "./DocumentPreview";
import { TextSearchReplaceStrip, type TextSearchState } from "./TextSearchReplaceStrip";
import { VisualDocumentEditor, canEditDocumentVisually } from "./VisualDocumentEditor";

export type DocumentWorkbenchMode = "source" | "preview" | "split" | "visual";

export interface DocumentInitialSearch {
  query: string;
  caseSensitive?: boolean;
  regex?: boolean;
  signal?: number;
}

export interface DocumentWorkbenchProps {
  path: string;
  name?: string;
  rootId?: string;
  content: string;
  editable: boolean;
  textLike: boolean;
  imageLike?: boolean;
  mimeType?: string | null;
  downloadUrl?: string | null;
  size?: number;
  truncated?: boolean;
  contentOffset?: number;
  contentBytes?: number;
  readLimitBytes?: number;
  mode?: DocumentWorkbenchMode;
  defaultMode?: DocumentWorkbenchMode;
  onModeChange?: (mode: DocumentWorkbenchMode) => void;
  initialSearch?: DocumentInitialSearch | null;
  onChange: (content: string) => void;
  compact?: boolean;
  showModeSwitcher?: boolean;
  showSplitToggle?: boolean;
  split?: boolean;
  onToggleSplit?: () => void;
  splitPane?: boolean;
  toolbarNote?: string;
  idleHint?: string;
  className?: string;
  editorClassName?: string;
  previewClassName?: string;
  minHeightClassName?: string;
}

export function DocumentWorkbench({
  path,
  name,
  rootId,
  content,
  editable,
  textLike,
  imageLike = false,
  mimeType,
  downloadUrl,
  size,
  truncated = false,
  contentOffset = 0,
  contentBytes = content.length,
  readLimitBytes = content.length,
  mode,
  defaultMode = "source",
  onModeChange,
  initialSearch = null,
  onChange,
  compact = false,
  showModeSwitcher = true,
  showSplitToggle = false,
  split = false,
  onToggleSplit,
  splitPane = false,
  toolbarNote = "编辑、预览、源码始终属于当前文件标签页，不另开窗口。",
  idleHint = "当前文件查找/替换；替换后进入未保存状态",
  className,
  editorClassName,
  previewClassName,
  minHeightClassName = "min-h-72",
}: DocumentWorkbenchProps) {
  const [internalMode, setInternalMode] = React.useState<DocumentWorkbenchMode>(defaultMode);
  const [showSearchReplace, setShowSearchReplace] = React.useState(false);
  const [searchFocus, setSearchFocus] = React.useState<{ target: "query" | "replace"; signal: number }>({
    target: "query",
    signal: 0,
  });
  const [searchState, setSearchState] = React.useState<TextSearchState>({
    query: "",
    caseSensitive: false,
    regex: false,
    activeIndex: 0,
    count: 0,
  });

  React.useEffect(() => {
    setInternalMode(defaultMode);
    setShowSearchReplace(false);
    setSearchState({ query: "", caseSensitive: false, regex: false, activeIndex: 0, count: 0 });
    setSearchFocus({ target: "query", signal: 0 });
  }, [defaultMode, path]);

  React.useEffect(() => {
    if (!initialSearch?.query || !textLike) return;
    setShowSearchReplace(true);
    setSearchState({
      query: initialSearch.query,
      caseSensitive: Boolean(initialSearch.caseSensitive),
      regex: Boolean(initialSearch.regex),
      activeIndex: 0,
      count: 0,
    });
    setSearchFocus((value) => ({ target: "query", signal: value.signal + 1 }));
  }, [initialSearch?.caseSensitive, initialSearch?.query, initialSearch?.regex, initialSearch?.signal, textLike]);

  const sourceAvailable = textLike;
  const previewAvailable = textLike || canRenderDocumentPreview(path, imageLike, textLike);
  const splitAvailable = textLike && (isMarkdownDocument(path) || isHtmlDocument(path));
  const visualAvailable = canEditDocumentVisually(path, textLike);
  const selectedMode = mode ?? internalMode;
  const modes = React.useMemo(() => {
    const next: Array<{ id: DocumentWorkbenchMode; label: string; shortcut: string }> = [];
    if (sourceAvailable) next.push({ id: "source", label: editable ? "源码/编辑" : "源码", shortcut: "⌘⌥1 / Ctrl+Alt+1" });
    if (previewAvailable) next.push({ id: "preview", label: "预览", shortcut: "⌘⌥2 / Ctrl+Alt+2" });
    if (splitAvailable) next.push({ id: "split", label: "边写边预览", shortcut: "⌘⌥3 / Ctrl+Alt+3" });
    if (visualAvailable) next.push({ id: "visual", label: editable ? "预览时编辑" : "可视预览", shortcut: "⌘⌥4 / Ctrl+Alt+4" });
    return next;
  }, [editable, previewAvailable, sourceAvailable, splitAvailable, visualAvailable]);
  const actualMode: DocumentWorkbenchMode = splitPane
    ? "source"
    : modes.some((item) => item.id === selectedMode)
      ? selectedMode
      : modes[0]?.id ?? "source";
  const canSearchReplace = textLike && !splitPane && (actualMode === "source" || actualMode === "split" || actualMode === "preview");

  const setMode = React.useCallback((nextMode: DocumentWorkbenchMode) => {
    setInternalMode(nextMode);
    onModeChange?.(nextMode);
  }, [onModeChange]);

  const openSearchReplace = React.useCallback((target: "query" | "replace") => {
    setShowSearchReplace(true);
    setSearchFocus((value) => ({ target, signal: value.signal + 1 }));
  }, []);

  const handleWorkbenchKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (event.altKey && ["1", "2", "3", "4"].includes(key)) {
      const targetMode = modes[Number(key) - 1]?.id;
      if (targetMode) {
        event.preventDefault();
        setMode(targetMode);
      }
      return;
    }
    if (!canSearchReplace) return;
    if (key === "f") {
      event.preventDefault();
      openSearchReplace("query");
    }
    if (key === "h") {
      event.preventDefault();
      openSearchReplace("replace");
    }
  }, [canSearchReplace, modes, openSearchReplace, setMode]);

  const sourceEditor = sourceAvailable ? (
    <CodeEditor
      key={`${path}:source`}
      path={path}
      initialContent={content}
      readOnly={!editable}
      onChange={onChange}
      searchHighlights={showSearchReplace ? searchState : undefined}
      className={cn("h-full", minHeightClassName, editorClassName)}
    />
  ) : null;
  const splitSourceEditor = sourceAvailable ? (
    <SplitSourceEditor
      path={path}
      content={content}
      editable={editable}
      onChange={onChange}
      className={cn("h-full", minHeightClassName, editorClassName)}
    />
  ) : null;
  const visualEditor = visualAvailable ? (
    <VisualDocumentEditor
      path={path}
      rootId={rootId}
      content={content}
      editable={editable}
      onChange={onChange}
      className={cn(minHeightClassName, previewClassName)}
    />
  ) : null;
  const renderedPreview = previewAvailable ? (
    <DocumentPreview
      path={path}
      name={name}
      rootId={rootId}
      content={content}
      imageLike={imageLike}
      textLike={textLike}
      mimeType={mimeType}
      downloadUrl={downloadUrl ?? undefined}
      size={size}
      truncated={truncated}
      contentOffset={contentOffset}
      contentBytes={contentBytes}
      readLimitBytes={readLimitBytes}
      surface="card"
    />
  ) : null;

  return (
    <div
      className={cn("grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden", className)}
      onKeyDown={handleWorkbenchKeyDown}
    >
      <div className={cn("flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-line bg-panel-2 px-2 py-1 text-xs sm:flex-wrap sm:gap-2", compact && "px-0 py-0 border-b-0 bg-transparent")} data-document-workbench-toolbar> 
        {showModeSwitcher && modes.length > 1 ? (
          <>
            <label
              className="grid min-w-[136px] shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1 rounded border border-line bg-panel px-2 py-1 text-2xs text-subtle sm:hidden"
              data-document-workbench-mobile-mode-select
            >
              <span>视图</span>
              <select
                value={actualMode}
                onChange={(event) => setMode(event.currentTarget.value as DocumentWorkbenchMode)}
                className="min-w-0 bg-transparent text-xs font-medium text-ink-strong outline-none"
                aria-label="选择文件视图模式"
              >
                {modes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="hidden max-w-full shrink-0 overflow-x-auto rounded border border-line bg-panel p-0.5 sm:inline-flex"
              data-document-workbench-desktop-mode-segments
            >
              {modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={`${item.label} · ${item.shortcut}`}
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "shrink-0 rounded px-2 py-1 text-2xs text-muted hover:text-ink-strong",
                    actualMode === item.id && "bg-primary-soft text-primary shadow-sm",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {!compact && !splitPane ? <span className="hidden min-w-0 flex-1 truncate text-subtle md:block">{toolbarNote}</span> : <span className="hidden min-w-0 flex-1 md:block" />}
        <span className="min-w-0 flex-1 md:hidden" aria-hidden="true" />
        {canSearchReplace ? (
          <Button
            type="button"
            variant={showSearchReplace ? "primary" : "ghost"}
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={() => {
              if (showSearchReplace) setShowSearchReplace(false);
              else openSearchReplace("query");
            }}
          >
            查找替换
          </Button>
        ) : null}
        {showSplitToggle ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            aria-label={split ? "关闭分屏" : "分屏"}
            onClick={onToggleSplit}
          >
            <Columns2 className="size-3.5" />
            {split ? "关闭分屏" : "分屏"}
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "grid min-h-0 min-w-0 overflow-hidden",
          canSearchReplace && showSearchReplace
            ? "grid-rows-[auto_minmax(0,1fr)]"
            : "grid-rows-[minmax(0,1fr)]",
        )}
        data-document-workbench-body="true"
      >
        {canSearchReplace && showSearchReplace ? (
          <div className={cn("border-b border-line bg-panel-2 p-2", compact && "border-b-0 bg-transparent px-0 pb-2 pt-0")}>
            <TextSearchReplaceStrip
              content={content}
              editable={editable}
              onChange={onChange}
              onSearchStateChange={setSearchState}
              focusTarget={searchFocus.target}
              focusSignal={searchFocus.signal}
              initialQuery={initialSearch?.query ?? ""}
              initialCaseSensitive={Boolean(initialSearch?.caseSensitive)}
              initialRegex={Boolean(initialSearch?.regex)}
              initialSignal={initialSearch?.signal ?? 0}
              density={compact ? "compact" : "default"}
              idleHint={idleHint}
            />
          </div>
        ) : null}
        <div className="h-full min-h-0 min-w-0 overflow-hidden" data-document-workbench-viewport="true">
          {actualMode === "visual" && visualEditor ? (
            visualEditor
          ) : actualMode === "preview" && renderedPreview ? (
            <div className={cn("h-full min-h-0 min-w-0 overflow-hidden", minHeightClassName, previewClassName)}>{renderedPreview}</div>
          ) : actualMode === "split" && splitSourceEditor && renderedPreview ? (
            <div className={cn("grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 xl:grid-cols-2 xl:grid-rows-[minmax(0,1fr)]", !compact && "xl:divide-x xl:divide-line xl:gap-0")}>
              {splitSourceEditor}
              <div className={cn("h-full min-h-0 min-w-0 overflow-hidden", minHeightClassName, previewClassName)}>{renderedPreview}</div>
            </div>
          ) : sourceEditor ? (
            sourceEditor
          ) : renderedPreview ? (
            <div className={cn("h-full min-h-0 min-w-0 overflow-hidden", minHeightClassName, previewClassName)}>{renderedPreview}</div>
          ) : (
            <EmptyState
              title="无法预览此文件"
              description="该文件暂不支持源码编辑或内联预览。"
              icon={<FileCode />}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SplitSourceEditor({
  path,
  content,
  editable,
  onChange,
  className,
}: {
  path: string;
  content: string;
  editable: boolean;
  onChange: (content: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded border border-line bg-panel", className)}
      data-split-source-editor
      data-path={path}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5 text-2xs text-muted">
        <span className="shrink-0 rounded bg-panel px-1.5 py-0.5 font-mono uppercase text-subtle">live source</span>
        <span className="min-w-0 truncate">边写边预览使用轻量实时编辑区；完整 Monaco 在“源码/编辑”模式。</span>
      </div>
      <textarea
        value={content}
        readOnly={!editable}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-full min-h-0 w-full resize-none overflow-auto border-0 bg-canvas p-3 font-mono text-xs leading-6 text-ink outline-none focus-visible:shadow-[var(--ring)]"
        spellCheck={false}
        aria-label="边写边预览源码编辑"
      />
    </div>
  );
}
