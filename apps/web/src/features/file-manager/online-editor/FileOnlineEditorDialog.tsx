import { Minus, Search, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { CodeEditor } from "@/features/file-manager/code-editor/CodeEditor";
import type { CodeEditorCursorPosition, CodeEditorHandle } from "@/features/file-manager/code-editor/CodeEditor";
import { useFileReadQuery, useWriteFileContentMutation } from "@/lib/query/files";
import { editorDocumentId, editorTitleForPath, languageForPath } from "@/shared/editor-core";
import { toast } from "@/design/ui/sonner";
import type { FileEntrySummary } from "@/features/file-manager/file-tools/types";

export interface FileOnlineEditorTab {
  id: string;
  rootId: string;
  entry: FileEntrySummary;
}

export interface FileOnlineEditorDialogProps {
  tabs: FileOnlineEditorTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenChange: (open: boolean) => void;
  drafts: Record<string, string>;
  onDraftChange: (tabId: string, content: string) => void;
  onDraftClear: (tabId: string) => void;
}

export function FileOnlineEditorDialog({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenChange,
  drafts,
  onDraftChange,
  onDraftClear,
}: FileOnlineEditorDialogProps) {
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[tabs.length - 1],
    [activeTabId, tabs],
  );
  const writeMutation = useWriteFileContentMutation();
  const dirtyTabs = React.useMemo(
    () => tabs.filter((tab) => drafts[tab.id] != null),
    [drafts, tabs],
  );

  const saveAll = React.useCallback(async () => {
    if (!dirtyTabs.length || writeMutation.isPending) return;
    try {
      for (const tab of dirtyTabs) {
        const content = drafts[tab.id];
        if (content == null) continue;
        await writeMutation.mutateAsync({ rootId: tab.rootId, path: tab.entry.path, content });
        onDraftClear(tab.id);
      }
      toast.success("已保存全部", { description: `${dirtyTabs.length} 个文件` });
    } catch (error) {
      toast.error("保存全部失败", { description: error instanceof Error ? error.message : String(error) });
    }
  }, [dirtyTabs, drafts, onDraftClear, writeMutation]);

  const confirmDiscard = React.useCallback((count: number) => {
    if (count <= 0) return true;
    return window.confirm(`有 ${count} 个文件存在未保存修改，确定放弃这些修改吗？`);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveAll();
        return;
      }
      if (event.key === "Escape") {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-code-editor="monaco-direct"], .monaco-editor, .monaco-editor *')) return;
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, saveAll]);

  if (!activeTab) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-ink/45 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="文件在线编辑器"
      data-file-online-editor-dialog
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex min-h-0 shrink-0 items-center gap-2 border-b border-line bg-panel-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">文件在线编辑器</div>
            <div className="truncate text-xs text-muted">多 Tab 快速编辑 · M1 文件管理器在线编辑器</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveAll()}
            disabled={!dirtyTabs.length || writeMutation.isPending}
            data-file-online-editor-save-all
          >
            {writeMutation.isPending ? "保存中…" : `保存全部${dirtyTabs.length ? ` (${dirtyTabs.length})` : ""}`}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} aria-label="最小化在线编辑器">
            <Minus className="size-4" />
          </Button>
        </header>

        <div className="flex min-h-0 shrink-0 gap-1 overflow-x-auto border-b border-line bg-panel px-2 pt-2" data-file-online-editor-tabs>
          {tabs.map((tab) => {
            const active = tab.id === activeTab.id;
            const dirty = drafts[tab.id] != null;
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "group flex max-w-64 shrink-0 items-center gap-2 rounded-t-md border px-3 py-1.5 text-xs",
                  active
                    ? "border-line border-b-panel bg-panel text-ink-strong"
                    : "border-transparent bg-panel-2 text-muted hover:text-ink",
                )}
                onClick={() => onSelectTab(tab.id)}
                data-file-online-editor-tab={tab.id}
                aria-selected={active}
              >
                <span className="min-w-0 truncate">{editorTitleForPath(tab.entry.path)}</span>
                {dirty ? <span className="text-primary" aria-label="未保存修改">●</span> : null}
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded p-0.5 text-subtle hover:bg-panel hover:text-ink"
                  aria-label={`关闭 ${editorTitleForPath(tab.entry.path)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (drafts[tab.id] != null && !confirmDiscard(1)) return;
                    onDraftClear(tab.id);
                    onCloseTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      if (drafts[tab.id] != null && !confirmDiscard(1)) return;
                      onDraftClear(tab.id);
                      onCloseTab(tab.id);
                    }
                  }}
                >
                  <X className="size-3" />
                </span>
              </button>
            );
          })}
        </div>

        <OnlineEditorTabPanel
          tab={activeTab}
          draftContent={drafts[activeTab.id]}
          onDraftChange={(content) => onDraftChange(activeTab.id, content)}
          onDraftClear={() => onDraftClear(activeTab.id)}
        />
      </div>
    </div>
  );
}

function OnlineEditorTabPanel({
  tab,
  draftContent,
  onDraftChange,
  onDraftClear,
}: {
  tab: FileOnlineEditorTab;
  draftContent?: string;
  onDraftChange: (content: string) => void;
  onDraftClear: () => void;
}) {
  const readQuery = useFileReadQuery({ rootId: tab.rootId, path: tab.entry.path });
  const writeMutation = useWriteFileContentMutation();
  const read = readQuery.data;
  const language = languageForPath(tab.entry.path);
  const editorContent = draftContent ?? read?.content ?? "";
  const dirty = draftContent != null && draftContent !== (read?.content ?? "");
  const editable = Boolean(read?.editable && !read?.truncated);
  const editorRef = React.useRef<CodeEditorHandle | null>(null);
  const [fontSize, setFontSize] = React.useState(13);
  const [gotoValue, setGotoValue] = React.useState("");
  const [cursorPosition, setCursorPosition] = React.useState<CodeEditorCursorPosition | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const gotoLine = React.useCallback(() => {
    const [lineText, columnText] = gotoValue.split(":");
    const line = Number.parseInt(lineText ?? "", 10);
    const column = Number.parseInt(columnText ?? "", 10);
    if (!Number.isFinite(line) || line < 1) {
      toast.error("请输入有效行号", { description: "例如 12 或 12:8" });
      return;
    }
    editorRef.current?.gotoLine(line, Number.isFinite(column) ? column : 1);
  }, [gotoValue]);

  const save = React.useCallback(async () => {
    if (!read || !editable || !dirty) return;
    try {
      setSaveError(null);
      await writeMutation.mutateAsync({ rootId: tab.rootId, path: tab.entry.path, content: editorContent });
      onDraftClear();
      toast.success("已保存", { description: tab.entry.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      toast.error("保存失败", { description: message });
    }
  }, [dirty, editable, editorContent, onDraftClear, read, tab.entry.path, tab.rootId, writeMutation]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  if (readQuery.isLoading) {
    return <div className="m-4 rounded border border-line bg-panel-2 p-3 text-sm text-muted">读取文件中…</div>;
  }
  if (readQuery.error) {
    return (
      <div className="m-4 rounded border border-danger/30 bg-danger/5 p-3 text-sm text-danger" data-file-online-editor-missing-state>
        <div className="font-medium">文件不可读取或已不存在</div>
        <div className="mt-1 text-xs">{readQuery.error.message}</div>
      </div>
    );
  }
  if (!read?.textLike || read.content == null) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted" data-file-online-editor-non-text-state>
        <div className="max-w-md rounded border border-line bg-panel-2 p-4">
          <div className="font-medium text-ink-strong">不可在线编辑</div>
          <p className="mt-1 text-xs">该文件不是可编辑文本，或当前读取结果没有文本内容。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto]" data-file-online-editor-panel>
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void save()}
          disabled={!editable || !dirty || writeMutation.isPending}
          data-file-online-editor-save-current
        >
          {writeMutation.isPending ? "保存中…" : "保存"}
        </Button>
        <span data-file-online-editor-dirty-state={dirty ? "dirty" : "clean"} className={dirty ? "text-primary" : "text-muted"}>
          {dirty ? "未保存" : saveError ? "保存失败" : "已保存"}
        </span>
        {saveError ? <span className="text-danger" data-file-online-editor-save-error>{saveError}</span> : null}
        {!editable ? (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700" data-file-online-editor-readonly-state>
            {read.truncated ? "大文件/截断，只读" : "只读"}
          </span>
        ) : null}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <Button variant="ghost" size="sm" onClick={() => editorRef.current?.openFind()} data-file-online-editor-find>
          <Search className="size-3.5" />
          查找
        </Button>
        <Button variant="ghost" size="sm" onClick={() => editorRef.current?.openReplace()} disabled={!editable} data-file-online-editor-replace>
          替换
        </Button>
        <label className="flex items-center gap-1 text-muted">
          跳转
          <input
            value={gotoValue}
            onChange={(event) => setGotoValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") gotoLine();
            }}
            placeholder="12:8"
            className="h-8 w-20 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
            data-file-online-editor-goto-input
          />
        </label>
        <Button variant="ghost" size="sm" onClick={gotoLine} data-file-online-editor-goto>定位</Button>
        <label className="ml-auto flex items-center gap-1 text-muted">
          字号
          <input
            type="number"
            min={11}
            max={24}
            value={fontSize}
            onChange={(event) => setFontSize(Math.max(11, Math.min(24, Number(event.target.value) || 13)))}
            className="h-8 w-16 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
            data-file-online-editor-font-size
          />
        </label>
        <span className="rounded border border-line bg-panel-2 px-2 py-1 text-muted" data-file-online-editor-theme-entry>主题随系统</span>
      </div>
      <div className="min-h-0 min-w-0 p-2">
        <CodeEditor
          key={editorDocumentId({ rootId: tab.rootId, path: tab.entry.path })}
          ref={editorRef}
          rootId={tab.rootId}
          path={tab.entry.path}
          initialContent={editorContent}
          readOnly={!editable}
          fontSize={fontSize}
          onCursorPositionChange={setCursorPosition}
          onChange={(content) => {
            setSaveError(null);
            if (content === read.content) onDraftClear();
            else onDraftChange(content);
          }}
          className="h-full min-h-0 rounded border border-line"
        />
      </div>
      <footer className="flex min-h-9 shrink-0 items-center gap-3 border-t border-line bg-panel-2 px-3 text-xs text-muted" data-file-online-editor-statusbar>
        <span className="min-w-0 flex-1 truncate font-mono" title={tab.entry.path}>{tab.entry.path}</span>
        <span>{language}</span>
        <span data-file-online-editor-cursor-position>{cursorPosition ? `Ln ${cursorPosition.lineNumber}, Col ${cursorPosition.column}` : "Ln —, Col —"}</span>
        <span>{editable ? "可编辑" : "只读"}</span>
        {read.truncated ? <span className="text-amber-600" data-file-online-editor-truncated-state>已截断</span> : null}
      </footer>
    </div>
  );
}

export function createFileOnlineEditorTab(rootId: string, entry: FileEntrySummary): FileOnlineEditorTab {
  return {
    id: editorDocumentId({ rootId, path: entry.path }),
    rootId,
    entry,
  };
}
