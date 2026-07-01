import { Download, File, FileText, ImageIcon, Maximize2, Minimize2, Minus, Music, RefreshCw, Search, Video, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { CodeEditor } from "@/features/file-manager/code-editor/CodeEditor";
import type { CodeEditorCursorPosition, CodeEditorHandle, CodeEditorThemeMode, CodeEditorViewState, CodeEditorWordWrap } from "@/features/file-manager/code-editor/CodeEditor";
import { isApiError } from "@/lib/api/errors";
import { useFileReadQuery, useWriteFileContentMutation } from "@/lib/query/files";
import { editorDocumentId, editorTitleForPath, languageForPath } from "@/shared/editor-core";
import { toast } from "@/design/ui/sonner";
import type { FileEntrySummary } from "@/features/file-manager/file-tools/types";

export interface FileOnlineEditorTab {
  id: string;
  rootId: string;
  entry: FileEntrySummary;
}

export type FileOnlineEditorWindowMode = "normal" | "maximized";

export interface FileOnlineEditorReadMetadata {
  modifiedAt: string | null;
  size: number;
}

export interface FileOnlineEditorDialogProps {
  tabs: FileOnlineEditorTab[];
  activeTabId?: string;
  windowMode: FileOnlineEditorWindowMode;
  onWindowModeChange: (mode: FileOnlineEditorWindowMode) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseSavedTabs: () => void;
  onCloseAllTabs: () => void;
  onOpenChange: (open: boolean) => void;
  drafts: Record<string, string>;
  viewStates: Record<string, CodeEditorViewState>;
  readMetadata: Record<string, FileOnlineEditorReadMetadata>;
  onDraftChange: (tabId: string, content: string) => void;
  onDraftClear: (tabId: string) => void;
  onViewStateChange: (tabId: string, viewState: CodeEditorViewState | null) => void;
  onReadMetadataChange: (tabId: string, metadata: FileOnlineEditorReadMetadata | null) => void;
}

type CloseConfirmAction =
  | { kind: "close-tab"; tabId: string }
  | { kind: "close-others"; keepTabId: string }
  | { kind: "close-all" };

const FILE_ONLINE_EDITOR_PREFERENCES_KEY =
  "tracevane:file-manager:online-editor-preferences:v1";

interface FileOnlineEditorPreferences {
  fontSize: number;
  minimapEnabled: boolean;
  stickyScrollEnabled: boolean;
  themeMode: CodeEditorThemeMode;
  wordWrap: CodeEditorWordWrap;
}

export function FileOnlineEditorDialog({
  tabs,
  activeTabId,
  windowMode,
  onWindowModeChange,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseSavedTabs,
  onCloseAllTabs,
  onOpenChange,
  drafts,
  viewStates,
  readMetadata,
  onDraftChange,
  onDraftClear,
  onViewStateChange,
  onReadMetadataChange,
}: FileOnlineEditorDialogProps) {
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[tabs.length - 1],
    [activeTabId, tabs],
  );
  const activeEditorRef = React.useRef<CodeEditorHandle | null>(null);
  const writeMutation = useWriteFileContentMutation();
  const dirtyTabs = React.useMemo(
    () => tabs.filter((tab) => drafts[tab.id] != null),
    [drafts, tabs],
  );
  const savedTabCount = tabs.length - dirtyTabs.length;
  const [closeConfirmAction, setCloseConfirmAction] =
    React.useState<CloseConfirmAction | null>(null);

  const captureActiveViewState = React.useCallback(() => {
    if (!activeTab) return;
    onViewStateChange(activeTab.id, activeEditorRef.current?.saveViewState() ?? null);
  }, [activeTab, onViewStateChange]);

  const saveDirtyTabs = React.useCallback(async (targetTabs: FileOnlineEditorTab[]) => {
    const targetDirtyTabs = targetTabs.filter((tab) => drafts[tab.id] != null);
    if (!targetDirtyTabs.length || writeMutation.isPending) return true;
    try {
      for (const tab of targetDirtyTabs) {
        const content = drafts[tab.id];
        if (content == null) continue;
        const metadata = readMetadata[tab.id];
        const result = await writeMutation.mutateAsync({
          rootId: tab.rootId,
          path: tab.entry.path,
          content,
          expectedModifiedAt: metadata?.modifiedAt,
          expectedSize: metadata?.size,
        });
        if (result.modifiedAt != null && result.size != null) {
          onReadMetadataChange(tab.id, { modifiedAt: result.modifiedAt, size: result.size });
        }
        onDraftClear(tab.id);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("保存失败", { description: message });
      return false;
    }
  }, [dirtyTabs, drafts, onDraftClear, onReadMetadataChange, readMetadata, writeMutation]);

  const saveAll = React.useCallback(async () => {
    if (!dirtyTabs.length || writeMutation.isPending) return;
    if (await saveDirtyTabs(dirtyTabs)) {
      toast.success("已保存全部", { description: `${dirtyTabs.length} 个文件` });
    }
  }, [dirtyTabs, saveDirtyTabs, writeMutation.isPending]);

  const requestCloseTab = React.useCallback((tabId: string) => {
    if (drafts[tabId] != null) {
      setCloseConfirmAction({ kind: "close-tab", tabId });
      return;
    }
    onViewStateChange(tabId, null);
    onCloseTab(tabId);
  }, [drafts, onCloseTab, onViewStateChange]);

  const requestCloseOthers = React.useCallback((keepTabId: string) => {
    const dirtyOtherCount = tabs.filter(
      (tab) => tab.id !== keepTabId && drafts[tab.id] != null,
    ).length;
    if (dirtyOtherCount > 0) {
      setCloseConfirmAction({ kind: "close-others", keepTabId });
      return;
    }
    onCloseOtherTabs(keepTabId);
  }, [drafts, onCloseOtherTabs, tabs]);

  const requestCloseAll = React.useCallback(() => {
    if (dirtyTabs.length > 0) {
      setCloseConfirmAction({ kind: "close-all" });
      return;
    }
    onCloseAllTabs();
  }, [dirtyTabs.length, onCloseAllTabs]);

  const resolveCloseConfirm = React.useCallback(async (mode: "save" | "discard") => {
    const action = closeConfirmAction;
    if (!action) return;
    const targetTabs =
      action.kind === "close-tab"
        ? tabs.filter((tab) => tab.id === action.tabId)
        : action.kind === "close-others"
          ? tabs.filter((tab) => tab.id !== action.keepTabId)
          : tabs;
    if (mode === "save" && !(await saveDirtyTabs(targetTabs))) return;
    setCloseConfirmAction(null);
    if (action.kind === "close-tab") {
      onViewStateChange(action.tabId, null);
      onCloseTab(action.tabId);
      return;
    }
    if (action.kind === "close-others") {
      onCloseOtherTabs(action.keepTabId);
      return;
    }
    onCloseAllTabs();
  }, [closeConfirmAction, onCloseAllTabs, onCloseOtherTabs, onCloseTab, onViewStateChange, saveDirtyTabs, tabs]);

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
        captureActiveViewState();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureActiveViewState, onOpenChange, saveAll]);

  if (!activeTab) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-ink/45 backdrop-blur-sm",
        windowMode === "maximized" ? "p-0" : "p-2 sm:p-4",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="文件在线编辑器"
      data-file-online-editor-dialog
      data-file-online-editor-window-mode={windowMode}
    >
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-panel shadow-2xl",
          windowMode === "maximized" ? "rounded-none" : "rounded-xl",
        )}
      >
        <header className="flex min-h-0 shrink-0 items-center gap-2 border-b border-line bg-panel-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">文件在线编辑器</div>
            <div className="truncate text-xs text-muted">多 Tab 快速编辑 · M1.x 文件管理器在线编辑器</div>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              captureActiveViewState();
              onWindowModeChange(windowMode === "maximized" ? "normal" : "maximized");
              requestAnimationFrame(() => activeEditorRef.current?.layout());
            }}
            aria-label={windowMode === "maximized" ? "还原在线编辑器" : "最大化在线编辑器"}
            data-file-online-editor-toggle-maximize
          >
            {windowMode === "maximized" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              captureActiveViewState();
              onOpenChange(false);
            }}
            aria-label="最小化在线编辑器"
            data-file-online-editor-minimize
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={requestCloseAll}
            aria-label="关闭在线编辑器"
            data-file-online-editor-close-window
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex min-h-0 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 pt-2">
          <div
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain"
            data-file-online-editor-tabs
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab.id;
              const dirty = drafts[tab.id] != null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "group flex min-w-28 max-w-56 flex-[1_1_10rem] items-center gap-2 rounded-t-md border px-3 py-1.5 text-xs",
                    active
                      ? "border-line border-b-panel bg-panel text-ink-strong"
                      : "border-transparent bg-panel-2 text-muted hover:text-ink",
                  )}
                  onClick={() => {
                    captureActiveViewState();
                    onSelectTab(tab.id);
                  }}
                  data-file-online-editor-tab={tab.id}
                  data-file-online-editor-tab-dirty={dirty ? "true" : "false"}
                  aria-selected={active}
                >
                  <span className="min-w-0 flex-1 truncate">{editorTitleForPath(tab.entry.path)}</span>
                  {dirty ? <span className="shrink-0 text-primary" aria-label="未保存修改">●</span> : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className="shrink-0 rounded p-0.5 text-subtle hover:bg-panel hover:text-ink"
                    aria-label={`关闭 ${editorTitleForPath(tab.entry.path)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestCloseTab(tab.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        requestCloseTab(tab.id);
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1 pb-2" data-file-online-editor-tab-actions>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => requestCloseOthers(activeTab.id)}
              disabled={tabs.length <= 1}
              data-file-online-editor-close-others
            >
              关闭其他
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCloseSavedTabs}
              disabled={savedTabCount === 0}
              data-file-online-editor-close-saved
            >
              关闭已保存
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={requestCloseAll}
              disabled={tabs.length === 0}
              data-file-online-editor-close-all
            >
              关闭全部
            </Button>
          </div>
        </div>

        <OnlineEditorTabPanel
          tab={activeTab}
          draftContent={drafts[activeTab.id]}
          viewState={viewStates[activeTab.id]}
          editorRef={activeEditorRef}
          onDraftChange={(content) => onDraftChange(activeTab.id, content)}
          onDraftClear={() => onDraftClear(activeTab.id)}
          onViewStateChange={(viewState) => onViewStateChange(activeTab.id, viewState)}
          onReadMetadataChange={(metadata) => onReadMetadataChange(activeTab.id, metadata)}
        />
        {closeConfirmAction ? (
          <CloseConfirmDialog
            action={closeConfirmAction}
            dirtyCount={
              closeConfirmAction.kind === "close-tab"
                ? 1
                : closeConfirmAction.kind === "close-others"
                  ? tabs.filter((tab) => tab.id !== closeConfirmAction.keepTabId && drafts[tab.id] != null).length
                  : dirtyTabs.length
            }
            saving={writeMutation.isPending}
            onSave={() => void resolveCloseConfirm("save")}
            onDiscard={() => void resolveCloseConfirm("discard")}
            onCancel={() => setCloseConfirmAction(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function CloseConfirmDialog({
  action,
  dirtyCount,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  action: CloseConfirmAction;
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const actionText =
    action.kind === "close-tab"
      ? "关闭这个标签"
      : action.kind === "close-others"
        ? "关闭其他标签"
        : "关闭全部标签";
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label="确认关闭在线编辑器标签"
      data-file-online-editor-close-confirm
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-panel p-4 text-sm shadow-xl">
        <div className="font-semibold text-ink-strong">保存未保存修改？</div>
        <p className="mt-2 text-muted">
          即将{actionText}，其中 {dirtyCount} 个文件存在未保存修改。你可以先保存、直接不保存并关闭，或取消本次操作。
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={saving}
            data-file-online-editor-close-confirm-save
          >
            {saving ? "保存中…" : "保存"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
            data-file-online-editor-close-confirm-discard
          >
            不保存
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            data-file-online-editor-close-confirm-cancel
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

function OnlineEditorTabPanel({
  tab,
  draftContent,
  viewState,
  editorRef,
  onDraftChange,
  onDraftClear,
  onViewStateChange,
  onReadMetadataChange,
}: {
  tab: FileOnlineEditorTab;
  draftContent?: string;
  viewState?: CodeEditorViewState;
  editorRef: React.MutableRefObject<CodeEditorHandle | null>;
  onDraftChange: (content: string) => void;
  onDraftClear: () => void;
  onViewStateChange: (viewState: CodeEditorViewState | null) => void;
  onReadMetadataChange: (metadata: FileOnlineEditorReadMetadata | null) => void;
}) {
  const readQuery = useFileReadQuery({ rootId: tab.rootId, path: tab.entry.path });
  const writeMutation = useWriteFileContentMutation();
  const read = readQuery.data;
  const language = languageForPath(tab.entry.path);
  const editorContent = draftContent ?? read?.content ?? "";
  const dirty = draftContent != null && draftContent !== (read?.content ?? "");
  const editable = Boolean(read?.editable && !read?.truncated);
  const lineEnding = React.useMemo(() => describeLineEnding(editorContent), [editorContent]);
  const indentation = React.useMemo(() => describeIndentation(editorContent), [editorContent]);
  const fileSize = React.useMemo(() => formatFileSize(read?.size), [read?.size]);
  const modifiedAt = React.useMemo(() => formatModifiedAt(read?.modifiedAt), [read?.modifiedAt]);
  const readOnlyReason = read?.truncated
    ? "已截断"
    : read && !read.editable
      ? "只读"
      : editable
        ? "可编辑"
        : "不可编辑";
  const [gotoValue, setGotoValue] = React.useState("");
  const [cursorPosition, setCursorPosition] = React.useState<CodeEditorCursorPosition | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [conflictError, setConflictError] = React.useState<string | null>(null);
  const [conflictCompareOpen, setConflictCompareOpen] = React.useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = React.useState(false);
  const [preferences, setPreferences] = React.useState<FileOnlineEditorPreferences>(() =>
    loadFileOnlineEditorPreferences(),
  );
  const updatePreferences = React.useCallback((next: Partial<FileOnlineEditorPreferences>) => {
    setPreferences((current) => {
      const updated = { ...current, ...next };
      saveFileOnlineEditorPreferences(updated);
      return updated;
    });
  }, []);

  React.useEffect(() => {
    if (!read) return;
    onReadMetadataChange({ modifiedAt: read.modifiedAt, size: read.size });
  }, [onReadMetadataChange, read]);

  const gotoLine = React.useCallback(() => {
    const [lineText, columnText] = gotoValue.split(":");
    const line = Number.parseInt(lineText ?? "", 10);
    const column = Number.parseInt(columnText ?? "", 10);
    if (!Number.isFinite(line) || line < 1) {
      toast.error("请输入有效行号", { description: "例如 12 或 12:8" });
      return;
    }
    editorRef.current?.gotoLine(line, Number.isFinite(column) ? column : 1);
  }, [editorRef, gotoValue]);

  const save = React.useCallback(async (options: { force?: boolean } = {}) => {
    if (!read || !editable || !dirty) return true;
    try {
      setSaveError(null);
      setConflictError(null);
      setConflictCompareOpen(false);
      const latest = options.force ? read : (await readQuery.refetch()).data;
      if (!latest) {
        throw new Error("无法读取最新磁盘状态");
      }
      if (
        !options.force &&
        (latest.modifiedAt !== read.modifiedAt || latest.size !== read.size)
      ) {
        onReadMetadataChange({ modifiedAt: latest.modifiedAt, size: latest.size });
        const message = `File changed on disk before save: ${tab.entry.path}`;
        setConflictError(message);
        setConflictCompareOpen(false);
        setSaveError("文件已在磁盘上发生变化");
        toast.error("检测到外部修改", { description: "请选择重新读取或强制覆盖。" });
        return false;
      }
      const result = await writeMutation.mutateAsync({
        rootId: tab.rootId,
        path: tab.entry.path,
        content: editorContent,
        expectedModifiedAt: latest.modifiedAt,
        expectedSize: latest.size,
        force: options.force,
      });
      if (result.modifiedAt != null && result.size != null) {
        onReadMetadataChange({ modifiedAt: result.modifiedAt, size: result.size });
      }
      onDraftClear();
      toast.success("已保存", { description: tab.entry.path });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isApiError(error) && error.code === "file_write_conflict") {
        setConflictError(message);
        setConflictCompareOpen(false);
        setSaveError("文件已在磁盘上发生变化");
        toast.error("检测到外部修改", { description: "请选择重新读取或强制覆盖。" });
        return false;
      }
      setSaveError(message);
      toast.error("保存失败", { description: message });
      return false;
    }
  }, [dirty, editable, editorContent, onDraftClear, onReadMetadataChange, read, readQuery, tab.entry.path, tab.rootId, writeMutation]);

  const reloadFromDisk = React.useCallback(async () => {
    const result = await readQuery.refetch();
    if (result.data) {
      onReadMetadataChange({ modifiedAt: result.data.modifiedAt, size: result.data.size });
    }
    onDraftClear();
    setConflictError(null);
    setConflictCompareOpen(false);
    setSaveError(null);
    setReloadConfirmOpen(false);
    toast.success("已重新读取磁盘版本", { description: tab.entry.path });
  }, [onDraftClear, onReadMetadataChange, readQuery, tab.entry.path]);

  const requestReload = React.useCallback(() => {
    if (dirty) {
      setReloadConfirmOpen(true);
      return;
    }
    void reloadFromDisk();
  }, [dirty, reloadFromDisk]);

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

  React.useEffect(() => {
    if (!viewState) return;
    const frame = requestAnimationFrame(() => editorRef.current?.restoreViewState(viewState));
    return () => cancelAnimationFrame(frame);
    // Restore only when this tab is mounted/activated. Cursor, selection, and edit
    // events keep saving fresher viewState objects; depending on those objects here
    // would immediately restore after every editor event and can create a render loop
    // with Monaco's full contribution set enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef, tab.id]);

  if (readQuery.isLoading) {
    return <div className="m-4 rounded border border-line bg-panel-2 p-3 text-sm text-muted">读取文件中…</div>;
  }
  if (readQuery.error && draftContent == null) {
    return (
      <div className="m-4 rounded border border-danger/30 bg-danger/5 p-3 text-sm text-danger" data-file-online-editor-missing-state>
        <div className="font-medium">文件不可读取或已不存在</div>
        <div className="mt-1 text-xs">{readQuery.error.message}</div>
      </div>
    );
  }
  if (!read?.textLike || read.content == null) {
    return (
      <FileSurfacePreviewPanel
        read={read}
        tab={tab}
        loading={readQuery.isFetching}
        error={readQuery.error?.message}
        onReload={() => void readQuery.refetch()}
      />
    );
  }
  const noticeRowCount =
    (conflictError ? 1 : 0) +
    (conflictError && conflictCompareOpen ? 1 : 0) +
    (reloadConfirmOpen ? 1 : 0);
  const panelGridRows = `auto ${"auto ".repeat(noticeRowCount)}minmax(0, 1fr) auto`;

  return (
    <div
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateRows: panelGridRows,
      }}
      data-file-online-editor-panel
    >
      <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-panel px-3 py-2 text-xs">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void save()}
          disabled={!editable || !dirty || writeMutation.isPending}
          data-file-online-editor-save-current
        >
          {writeMutation.isPending ? "保存中…" : "保存"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={requestReload}
          disabled={readQuery.isFetching || writeMutation.isPending}
          data-file-online-editor-reload-current
        >
          {readQuery.isFetching ? "读取中…" : "重新读取"}
        </Button>
        <span data-file-online-editor-dirty-state={dirty ? "dirty" : "clean"} className={dirty ? "text-primary" : "text-muted"}>
          {dirty ? "未保存" : saveError ? "保存失败" : "已保存"}
        </span>
        {saveError ? <span className="text-danger" data-file-online-editor-save-error>{saveError}</span> : null}
        {conflictError ? (
          <span className="text-danger" data-file-online-editor-conflict-state>
            外部修改冲突
          </span>
        ) : null}
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
            value={preferences.fontSize}
            onChange={(event) =>
              updatePreferences({
                fontSize: Math.max(11, Math.min(24, Number(event.target.value) || 13)),
              })
            }
            className="h-8 w-16 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
            data-file-online-editor-font-size
          />
        </label>
        <label className="flex items-center gap-1 text-muted">
          主题
          <select
            value={preferences.themeMode}
            onChange={(event) =>
              updatePreferences({ themeMode: event.target.value as CodeEditorThemeMode })
            }
            className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
            data-file-online-editor-theme-mode-select
          >
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-muted">
          换行
          <select
            value={preferences.wordWrap}
            onChange={(event) =>
              updatePreferences({ wordWrap: event.target.value as CodeEditorWordWrap })
            }
            className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
            data-file-online-editor-word-wrap-select
          >
            <option value="on">开</option>
            <option value="off">关</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-muted">
          <input
            type="checkbox"
            checked={preferences.minimapEnabled}
            onChange={(event) =>
              updatePreferences({ minimapEnabled: event.target.checked })
            }
            className="size-3 accent-primary"
            data-file-online-editor-minimap-enabled
          />
          小地图
        </label>
        <label className="flex items-center gap-1 text-muted">
          <input
            type="checkbox"
            checked={preferences.stickyScrollEnabled}
            onChange={(event) =>
              updatePreferences({ stickyScrollEnabled: event.target.checked })
            }
            className="size-3 accent-primary"
            data-file-online-editor-sticky-scroll-enabled
          />
          粘性滚动
        </label>
      </div>
      {conflictError ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
          data-file-online-editor-conflict-panel
        >
          <span className="font-medium">磁盘文件已变化，已阻止静默覆盖。</span>
          <span className="text-muted">{conflictError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadFromDisk()}
            data-file-online-editor-conflict-reload
          >
            重新读取
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConflictCompareOpen((value) => !value)}
            data-file-online-editor-conflict-compare
          >
            对比
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void save({ force: true })}
            data-file-online-editor-conflict-overwrite
          >
            强制覆盖
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConflictError(null);
              setConflictCompareOpen(false);
              setSaveError(null);
            }}
            data-file-online-editor-conflict-cancel
          >
            取消
          </Button>
        </div>
      ) : null}
      {conflictError && conflictCompareOpen ? (
        <div
          className="grid min-h-0 gap-2 border-b border-danger/20 bg-panel-2 p-3 text-xs md:grid-cols-2"
          data-file-online-editor-conflict-compare-panel
        >
          <section className="min-w-0 rounded-md border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 font-medium text-ink-strong">
              当前编辑草稿
            </div>
            <pre
              className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-ink"
              data-file-online-editor-conflict-local-content
            >
              {editorContent}
            </pre>
          </section>
          <section className="min-w-0 rounded-md border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 font-medium text-ink-strong">
              磁盘最新内容
            </div>
            <pre
              className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-ink"
              data-file-online-editor-conflict-disk-content
            >
              {read?.content ?? ""}
            </pre>
          </section>
        </div>
      ) : null}
      {reloadConfirmOpen ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2 text-xs"
          data-file-online-editor-reload-confirm
        >
          <span className="font-medium text-ink-strong">当前文件有未保存修改。重新读取前要如何处理？</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (await save()) void reloadFromDisk();
            }}
            disabled={writeMutation.isPending || readQuery.isFetching}
            data-file-online-editor-reload-confirm-save
          >
            保存后重新读取
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadFromDisk()}
            disabled={writeMutation.isPending || readQuery.isFetching}
            data-file-online-editor-reload-confirm-discard
          >
            不保存并重新读取
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadConfirmOpen(false)}
            disabled={writeMutation.isPending || readQuery.isFetching}
            data-file-online-editor-reload-confirm-cancel
          >
            取消
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 p-2">
        <CodeEditor
          key={editorDocumentId({ rootId: tab.rootId, path: tab.entry.path })}
          ref={editorRef}
          rootId={tab.rootId}
          path={tab.entry.path}
          initialContent={editorContent}
          readOnly={!editable}
          profile={editable ? "normal" : "large-readonly"}
          fontSize={preferences.fontSize}
          minimapEnabled={preferences.minimapEnabled}
          stickyScrollEnabled={preferences.stickyScrollEnabled}
          themeMode={preferences.themeMode}
          wordWrap={preferences.wordWrap}
          onCursorPositionChange={(position) => {
            setCursorPosition((current) => (
              current?.lineNumber === position?.lineNumber && current?.column === position?.column
                ? current
                : position
            ));
          }}
          onChange={(content) => {
            setSaveError(null);
            onViewStateChange(editorRef.current?.saveViewState() ?? null);
            if (content === read.content) onDraftClear();
            else onDraftChange(content);
          }}
          className="h-full min-h-0 rounded border border-line"
        />
      </div>
      <footer className="flex min-h-9 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-line bg-panel-2 px-3 text-xs text-muted" data-file-online-editor-statusbar>
        <span className="min-w-0 flex-1 truncate font-mono" title={tab.entry.path}>{tab.entry.path}</span>
        <span data-file-online-editor-status-language>{language}</span>
        <span data-file-online-editor-status-line-ending>{lineEnding}</span>
        <span data-file-online-editor-status-indentation>{indentation}</span>
        <span data-file-online-editor-status-encoding>UTF-8</span>
        <span data-file-online-editor-status-size>{fileSize}</span>
        <span data-file-online-editor-status-permissions>{read.mode} · {read.permissions}</span>
        <span data-file-online-editor-status-modified title={read.modifiedAt ?? undefined}>{modifiedAt}</span>
        <span data-file-online-editor-cursor-position>{cursorPosition ? `Ln ${cursorPosition.lineNumber}, Col ${cursorPosition.column}` : "Ln —, Col —"}</span>
        <span data-file-online-editor-status-readonly-reason>{readOnlyReason}</span>
        {read.truncated ? <span className="text-amber-600" data-file-online-editor-truncated-state>已截断</span> : null}
      </footer>
    </div>
  );
}


function FileSurfacePreviewPanel({
  read,
  tab,
  loading,
  error,
  onReload,
}: {
  read: ReturnType<typeof useFileReadQuery>["data"] | undefined;
  tab: FileOnlineEditorTab;
  loading: boolean;
  error?: string;
  onReload: () => void;
}) {
  const previewKind = classifyFileSurfacePreview(read, tab.entry);
  const downloadUrl = buildFileDownloadUrl(tab.rootId, tab.entry.path, false);
  const attachmentUrl = buildFileDownloadUrl(tab.rootId, tab.entry.path, true);
  const size = formatFileSize(read?.size ?? tab.entry.size);
  const modified = formatModifiedAt(read?.modifiedAt ?? tab.entry.modifiedAt);
  const mimeType = read?.mimeType || "application/octet-stream";
  const PreviewIcon = previewKind === "image"
    ? ImageIcon
    : previewKind === "video"
      ? Video
      : previewKind === "audio"
        ? Music
        : previewKind === "pdf"
          ? FileText
          : File;

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] bg-panel" data-file-surface-panel data-file-surface-kind={previewKind}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-ink-strong">
          <PreviewIcon className="size-3.5" />
          {previewKindLabel(previewKind)}
        </span>
        <span className="text-muted">{tab.entry.path}</span>
        {error ? <span className="text-danger" data-file-surface-read-error>{error}</span> : null}
        <Button variant="ghost" size="sm" onClick={onReload} disabled={loading} data-file-surface-reload>
          <RefreshCw className="size-3.5" />
          {loading ? "读取中…" : "刷新"}
        </Button>
        <Button asChild variant="outline" size="sm" data-file-surface-open-inline>
          <a href={downloadUrl} target="_blank" rel="noreferrer">打开</a>
        </Button>
        <Button asChild variant="primary" size="sm" data-file-surface-download>
          <a href={attachmentUrl} download>
            <Download className="size-3.5" />
            下载
          </a>
        </Button>
      </div>
      <div className="min-h-0 overflow-auto p-4" data-file-surface-preview>
        {previewKind === "image" ? (
          <div className="grid min-h-full place-items-center rounded-md border border-line bg-panel-2 p-3">
            <img src={downloadUrl} alt={tab.entry.name} className="max-h-full max-w-full rounded border border-line object-contain" data-file-surface-image />
          </div>
        ) : previewKind === "video" ? (
          <div className="grid min-h-full place-items-center rounded-md border border-line bg-panel-2 p-3">
            <video src={downloadUrl} controls className="max-h-full max-w-full rounded border border-line bg-black" data-file-surface-video>
              当前浏览器无法播放该视频。
            </video>
          </div>
        ) : previewKind === "audio" ? (
          <div className="grid min-h-full place-items-center rounded-md border border-line bg-panel-2 p-6">
            <div className="w-full max-w-2xl rounded-md border border-line bg-panel p-4 text-center">
              <Music className="mx-auto mb-3 size-10 text-primary" />
              <div className="mb-3 text-sm font-medium text-ink-strong">{tab.entry.name}</div>
              <audio src={downloadUrl} controls className="w-full" data-file-surface-audio>
                当前浏览器无法播放该音频。
              </audio>
            </div>
          </div>
        ) : previewKind === "pdf" ? (
          <object data={downloadUrl} type="application/pdf" className="h-full min-h-[520px] w-full rounded border border-line bg-panel-2" data-file-surface-pdf>
            <iframe title={tab.entry.name} src={downloadUrl} className="h-full min-h-[520px] w-full rounded border border-line" />
          </object>
        ) : (
          <div className="grid min-h-full place-items-center rounded-md border border-line bg-panel-2 p-6 text-center" data-file-surface-binary>
            <div className="max-w-lg">
              <File className="mx-auto mb-3 size-10 text-subtle" />
              <div className="text-sm font-semibold text-ink-strong">此文件不能作为文本编辑</div>
              <p className="mt-2 text-xs text-muted">
                已在同一个文件窗口中提供安全检查信息。可下载或用系统应用打开，避免把未知二进制内容误当文本写回。
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={downloadUrl} target="_blank" rel="noreferrer">浏览器打开</a>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <a href={attachmentUrl} download>下载文件</a>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel px-3 py-2 text-xs text-muted" data-file-surface-statusbar>
        <span>{mimeType}</span>
        <span>{size}</span>
        <span>{read?.permissions ?? tab.entry.permissions ?? "权限未知"}</span>
        <span>{modified}</span>
        <span className="ml-auto">同一 File Surface · 非文本只读预览</span>
      </div>
    </div>
  );
}

type FileSurfacePreviewKind = "image" | "video" | "audio" | "pdf" | "binary";

function classifyFileSurfacePreview(
  read: ReturnType<typeof useFileReadQuery>["data"] | undefined,
  entry: FileEntrySummary,
): FileSurfacePreviewKind {
  const mimeType = (read?.mimeType ?? "").toLowerCase();
  const ext = (read?.ext ?? entry.ext ?? "").toLowerCase();
  if (read?.imageLike || mimeType.startsWith("image/") || IMAGE_FILE_EXTENSIONS.has(ext)) return "image";
  if (mimeType.startsWith("video/") || VIDEO_FILE_EXTENSIONS.has(ext)) return "video";
  if (mimeType.startsWith("audio/") || AUDIO_FILE_EXTENSIONS.has(ext)) return "audio";
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  return "binary";
}

const IMAGE_FILE_EXTENSIONS = new Set([".apng", ".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const VIDEO_FILE_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);
const AUDIO_FILE_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav", ".weba"]);

function previewKindLabel(kind: FileSurfacePreviewKind): string {
  switch (kind) {
    case "image":
      return "图片预览";
    case "video":
      return "视频预览";
    case "audio":
      return "音频预览";
    case "pdf":
      return "PDF 预览";
    case "binary":
      return "二进制检查";
  }
}

function buildFileDownloadUrl(rootId: string, path: string, attachment = false): string {
  const search = new URLSearchParams({ rootId, path });
  if (attachment) search.set("download", "1");
  return `/api/files/download?${search.toString()}`;
}

export function createFileOnlineEditorTab(rootId: string, entry: FileEntrySummary): FileOnlineEditorTab {
  return {
    id: editorDocumentId({ rootId, path: entry.path }),
    rootId,
    entry,
  };
}

function describeLineEnding(content: string): "LF" | "CRLF" | "Mixed" | "None" {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) ?? []).length;
  if (crlfCount > 0 && lfCount > 0) return "Mixed";
  if (crlfCount > 0) return "CRLF";
  if (lfCount > 0) return "LF";
  return "None";
}

function describeIndentation(content: string): string {
  const lines = content.split(/\r?\n/);
  let tabIndented = 0;
  const spaceCounts = new Map<number, number>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = /^(\s+)/.exec(line);
    if (!match) continue;
    const indent = match[1] ?? "";
    if (indent.startsWith("\t")) {
      tabIndented += 1;
      continue;
    }
    const spaces = indent.length;
    if (spaces > 0) spaceCounts.set(spaces, (spaceCounts.get(spaces) ?? 0) + 1);
  }
  const commonSpaces = Array.from(spaceCounts.entries()).sort((left, right) => {
    const countDelta = right[1] - left[1];
    return countDelta !== 0 ? countDelta : left[0] - right[0];
  })[0]?.[0];
  if (tabIndented > 0 && (!commonSpaces || tabIndented >= (spaceCounts.get(commonSpaces) ?? 0))) {
    return "Tabs";
  }
  if (commonSpaces) return `Spaces ${commonSpaces}`;
  return "Indent —";
}

function formatFileSize(size: number | null | undefined): string {
  if (typeof size !== "number" || !Number.isFinite(size)) return "Size —";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatModifiedAt(value: string | null | undefined): string {
  if (!value) return "mtime —";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "mtime —";
  return date.toLocaleString();
}

function loadFileOnlineEditorPreferences(): FileOnlineEditorPreferences {
  if (typeof window === "undefined") return defaultFileOnlineEditorPreferences();
  try {
    const raw = window.localStorage.getItem(FILE_ONLINE_EDITOR_PREFERENCES_KEY);
    if (!raw) return defaultFileOnlineEditorPreferences();
    const parsed = JSON.parse(raw) as Partial<FileOnlineEditorPreferences>;
    const fontSize = Math.max(11, Math.min(24, Number(parsed.fontSize) || 13));
    const minimapEnabled = parsed.minimapEnabled === true;
    const stickyScrollEnabled = parsed.stickyScrollEnabled !== false;
    const themeMode: CodeEditorThemeMode =
      parsed.themeMode === "light" || parsed.themeMode === "dark" || parsed.themeMode === "auto"
        ? parsed.themeMode
        : "auto";
    const wordWrap: CodeEditorWordWrap = parsed.wordWrap === "off" ? "off" : "on";
    return {
      fontSize,
      minimapEnabled,
      stickyScrollEnabled,
      themeMode,
      wordWrap,
    };
  } catch {
    return defaultFileOnlineEditorPreferences();
  }
}

function saveFileOnlineEditorPreferences(preferences: FileOnlineEditorPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FILE_ONLINE_EDITOR_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Preference persistence must never block editing.
  }
}

function defaultFileOnlineEditorPreferences(): FileOnlineEditorPreferences {
  return {
    fontSize: 13,
    minimapEnabled: false,
    stickyScrollEnabled: true,
    themeMode: "auto",
    wordWrap: "on",
  };
}
