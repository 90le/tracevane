import * as React from "react";
import { AlertTriangle, FileQuestion, FileText, RefreshCw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { EmptyState, ErrorState, LoadingState } from "@/design/ui/state";
import { isApiError } from "@/lib/api/errors";
import { CodeEditor } from "@/features/file-manager/code-editor/CodeEditor";
import { FileSurfacePreviewPanel } from "@/shared/file-surface";
import type { CodeEditorHandle } from "@/features/file-manager/code-editor/CodeEditor";
import { editorModelUriString, readEditorFile, saveEditorFile } from "@/shared/editor-core";
import type { EditorReadResult, EditorSaveState } from "@/shared/editor-core";
import type { IdeWorkbenchEditorFileMetadata, IdeWorkbenchEditorTab } from "../types";
import { useIdeEditorFile } from "./useIdeEditorFile";
import { registerIdeEditorRuntimeHandle } from "./ideEditorRuntime";
import { EditorConflictDialog } from "./EditorConflictDialog";
import type { IdeEditorPreferences } from "./editorPreferences";
import { classifyFileSurfacePreview } from "@/shared/file-surface";
import { useLspDiagnostics } from "../lsp";
import { toggleDebugBreakpoint, useIdeDebugSnapshot } from "../debug";

const IDE_EDITOR_SOFT_LARGE_FILE_BYTES = 5 * 1024 * 1024;

type IdeEditorConflictState = {
  reason: "save-conflict" | "external-change";
  diskRead: EditorReadResult;
  editorContent: string;
  message: string;
};

export function IdeEditorFilePanel({
  tab,
  preferences,
  onDirtyChange,
  onSaveStateChange,
  onFileMetadataChange,
}: {
  tab: IdeWorkbenchEditorTab;
  preferences: IdeEditorPreferences;
  onDirtyChange?: (tabId: string, dirty: boolean) => void;
  onSaveStateChange?: (tabId: string, saveState: EditorSaveState, message?: string | null) => void;
  onFileMetadataChange?: (tabId: string, metadata: IdeWorkbenchEditorFileMetadata) => void;
}) {
  const editorRef = React.useRef<CodeEditorHandle | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const cleanContentRef = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);
  const dirtyRef = React.useRef(Boolean(tab.dirty));
  const query = useIdeEditorFile(tab.ref, !tab.deleted);
  const [conflict, setConflict] = React.useState<IdeEditorConflictState | null>(null);
  const [conflictBusy, setConflictBusy] = React.useState(false);
  const [editorContent, setEditorContent] = React.useState<string | null>(null);
  const [editorContentVersion, setEditorContentVersion] = React.useState(0);
  const read = query.data;
  const metadata = read?.snapshot.metadata;
  const unsupportedReason = read ? unsupportedReasonForRead(read) : null;
  const debugSnapshot = useIdeDebugSnapshot();
  const debugBreakpoints = React.useMemo(
    () => debugSnapshot.breakpoints
      .filter((breakpoint) => breakpoint.rootId === tab.ref.rootId && breakpoint.path === tab.ref.path)
      .map((breakpoint) => ({ lineNumber: breakpoint.lineNumber, enabled: breakpoint.enabled })),
    [debugSnapshot.breakpoints, tab.ref.path, tab.ref.rootId],
  );
  const debugStoppedLine = debugSnapshot.activeStoppedLocation
    && debugSnapshot.activeStoppedLocation.rootId === tab.ref.rootId
    && debugSnapshot.activeStoppedLocation.path === tab.ref.path
      ? debugSnapshot.activeStoppedLocation.lineNumber
      : null;

  React.useEffect(() => {
    if (!read || !metadata) return;
    onFileMetadataChange?.(tab.id, {
      language: metadata.language || "plaintext",
      mimeType: metadata.mimeType || read.raw.mimeType || null,
      size: metadata.size,
      readonly: metadata.readonly,
      previewKind: metadata.textLike ? "text" : classifyFileSurfacePreview(read.raw, fileSurfaceEntryForRead(read)),
    });
  }, [metadata, onFileMetadataChange, read, tab.id]);

  React.useEffect(() => {
    dirtyRef.current = Boolean(tab.dirty);
  }, [tab.dirty]);

  React.useEffect(() => {
    if (!read || unsupportedReason) {
      setEditorContent(null);
      return;
    }
    setEditorContent(read.snapshot.content);
    setEditorContentVersion((previous) => previous + 1);
  }, [read, unsupportedReason]);

  React.useEffect(() => {
    if (!read || unsupportedReason) return;
    if (cleanContentRef.current == null || !dirtyRef.current) {
      cleanContentRef.current = read.snapshot.content;
    }
  }, [read, unsupportedReason]);

  const markDirtyFromContent = React.useCallback((value: string) => {
    setEditorContent(value);
    setEditorContentVersion((previous) => previous + 1);
    const cleanContent = cleanContentRef.current;
    if (cleanContent == null) return;
    const dirty = value !== cleanContent;
    dirtyRef.current = dirty;
    onDirtyChange?.(tab.id, dirty);
    onSaveStateChange?.(tab.id, dirty ? "dirty" : "clean", null);
  }, [onDirtyChange, onSaveStateChange, tab.id]);

  const openConflictWithDisk = React.useCallback(async ({
    reason,
    editorContent,
    message,
  }: {
    reason: IdeEditorConflictState["reason"];
    editorContent?: string;
    message?: string;
  }) => {
    if (!read || unsupportedReason) return false;
    try {
      const diskRead = await readEditorFile(tab.ref);
      setConflict({
        reason,
        diskRead,
        editorContent: editorContent ?? editorRef.current?.getValue() ?? read.snapshot.content,
        message: message ?? (reason === "external-change" ? "文件已在磁盘上变更。" : "保存时检测到磁盘版本不匹配。"),
      });
      toast.warning("检测到外部修改", { description: "已打开 Monaco Diff 对比，未覆盖磁盘文件。" });
      return true;
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : String(error);
      toast.error("读取磁盘版本失败", { description: fallbackMessage });
      return false;
    }
  }, [read, tab.ref, unsupportedReason]);

  const saveCurrent = React.useCallback(async (options: { force?: boolean } = {}) => {
    if (savingRef.current) return false;
    if (tab.deleted) {
      toast.error("文件已删除", { description: tab.ref.path });
      return false;
    }
    if (tab.externalState === "deleted") {
      toast.warning("磁盘文件已删除", { description: "未保存内容仍保留在当前标签页；请复制内容或另存到新的文件路径。" });
      return false;
    }
    if (!read || unsupportedReason) return true;
    if (metadata?.readonly) {
      toast.warning("只读文件不能保存", { description: tab.ref.path });
      return false;
    }
    const content = editorRef.current?.getValue() ?? read.snapshot.content;
    if (cleanContentRef.current === content && !dirtyRef.current) return true;
    if (!options.force && tab.externalState === "changed") {
      return openConflictWithDisk({
        reason: "external-change",
        editorContent: content,
        message: "文件已在磁盘上变更；已阻止直接保存，避免覆盖外部修改。",
      });
    }
    savingRef.current = true;
    onSaveStateChange?.(tab.id, "saving", null);
    try {
      const result = await saveEditorFile({
        rootId: tab.ref.rootId,
        path: tab.ref.path,
        content,
        expectedModifiedAt: options.force ? undefined : metadata?.modifiedAt,
        expectedSize: options.force ? undefined : metadata?.size,
        force: options.force,
      });
      cleanContentRef.current = content;
      dirtyRef.current = false;
      onDirtyChange?.(tab.id, false);
      onSaveStateChange?.(tab.id, "saved", null);
      toast.success(options.force ? "已覆盖保存" : "已保存", { description: tab.ref.path });
      void query.refetch();
      void result;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dirtyRef.current = true;
      onDirtyChange?.(tab.id, true);
      if (isApiError(error) && error.code === "file_write_conflict") {
        onSaveStateChange?.(tab.id, "error", "文件已在磁盘上发生变化");
        await openConflictWithDisk({ reason: "save-conflict", editorContent: content, message });
        return false;
      }
      onSaveStateChange?.(tab.id, "error", message);
      toast.error("保存失败", { description: message });
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [metadata?.modifiedAt, metadata?.readonly, metadata?.size, onDirtyChange, onSaveStateChange, openConflictWithDisk, query, read, tab.deleted, tab.externalState, tab.id, tab.ref.path, tab.ref.rootId, unsupportedReason]);

  const cancelConflict = React.useCallback(() => {
    setConflict(null);
  }, []);

  const reloadLatestFromDisk = React.useCallback(async () => {
    if (dirtyRef.current) {
      await openConflictWithDisk({
        reason: "external-change",
        message: "文件已在磁盘上变更；当前存在未保存内容，请先对比再决定。",
      });
      return;
    }
    try {
      const diskRead = await readEditorFile(tab.ref);
      const diskContent = diskRead.snapshot.content;
      cleanContentRef.current = diskContent;
      editorRef.current?.setValue(diskContent);
      dirtyRef.current = false;
      onDirtyChange?.(tab.id, false);
      onSaveStateChange?.(tab.id, "clean", null);
      await query.refetch();
      toast.success("已重新读取磁盘版本", { description: tab.ref.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("重新读取失败", { description: message });
    }
  }, [onDirtyChange, onSaveStateChange, openConflictWithDisk, query, tab.id, tab.ref, tab.ref.path]);

  const reloadConflictFromDisk = React.useCallback(async () => {
    if (!conflict) return;
    setConflictBusy(true);
    try {
      const diskContent = conflict.diskRead.snapshot.content;
      cleanContentRef.current = diskContent;
      editorRef.current?.setValue(diskContent);
      dirtyRef.current = false;
      onDirtyChange?.(tab.id, false);
      onSaveStateChange?.(tab.id, "clean", null);
      setConflict(null);
      await query.refetch();
      toast.success("已重新读取磁盘版本", { description: tab.ref.path });
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, onDirtyChange, onSaveStateChange, query, tab.id, tab.ref.path]);

  const overwriteConflictToDisk = React.useCallback(async () => {
    if (!conflict || savingRef.current) return;
    setConflictBusy(true);
    try {
      const result = await saveEditorFile({
        rootId: tab.ref.rootId,
        path: tab.ref.path,
        content: conflict.editorContent,
        force: true,
      });
      cleanContentRef.current = conflict.editorContent;
      editorRef.current?.setValue(conflict.editorContent);
      dirtyRef.current = false;
      onDirtyChange?.(tab.id, false);
      onSaveStateChange?.(tab.id, "saved", null);
      setConflict(null);
      await query.refetch();
      toast.success("已覆盖保存当前编辑器内容", { description: tab.ref.path });
      void result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onSaveStateChange?.(tab.id, "error", message);
      toast.error("覆盖保存失败", { description: message });
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, onDirtyChange, onSaveStateChange, query, tab.id, tab.ref.path, tab.ref.rootId]);

  React.useEffect(() => registerIdeEditorRuntimeHandle(tab.id, {
    save: saveCurrent,
    focus: () => editorRef.current?.focus(),
    runAction: (actionId: string) => editorRef.current?.runAction(actionId),
  }), [saveCurrent, tab.id]);

  useLspDiagnostics({
    enabled: Boolean(read && metadata?.textLike && !unsupportedReason && !tab.deleted),
    rootId: tab.ref.rootId,
    path: tab.ref.path,
    language: metadata?.language,
    content: editorContent,
    version: editorContentVersion,
  });

  const lastRevealKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!tab.reveal) return;
    const key = `${tab.id}:${tab.reveal.lineNumber}:${tab.reveal.column ?? 1}`;
    if (lastRevealKeyRef.current === key) return;
    lastRevealKeyRef.current = key;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.gotoLine(tab.reveal?.lineNumber ?? 1, tab.reveal?.column ?? 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [tab.id, tab.reveal]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      const panel = panelRef.current;
      if (!panel || panel.getClientRects().length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      void saveCurrent();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [saveCurrent]);

  if (tab.deleted) {
    return (
      <IdeEditorStatePanel
        tone="warning"
        icon={<AlertTriangle />}
        title="文件已删除"
        description="该文件路径已被删除或移动。当前标签页仍保留状态；如有未保存内容，请复制或另存后再关闭。"
        path={tab.ref.path}
      />
    );
  }

  if (query.isLoading) {
    return (
      <IdeEditorStatePanel
        tone="loading"
        icon={<FileText />}
        title="正在读取文件"
        description="正在通过文件服务读取内容。"
        path={tab.ref.path}
        dataState="loading"
      />
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : String(query.error);
    return (
      <IdeEditorStatePanel
        tone="danger"
        icon={<AlertTriangle />}
        title="文件读取失败"
        description={message || "无法读取该文件。"}
        path={tab.ref.path}
        dataState="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} data-ide-editor-retry>
            <RefreshCw />
            重试
          </Button>
        }
      />
    );
  }

  if (!read || !metadata) {
    return (
      <IdeEditorStatePanel
        tone="muted"
        icon={<FileQuestion />}
        title="等待编辑器数据"
        description="尚未获得文件内容。"
        path={tab.ref.path}
      />
    );
  }

  if (!metadata.textLike) {
    return (
      <div
        ref={panelRef}
        className="grid h-full min-h-0 min-w-0 bg-canvas"
        data-ide-editor-panel
        data-ide-editor-panel-kind="preview"
        data-ide-editor-file-path={tab.ref.path}
      >
        <FileSurfacePreviewPanel
          rootId={tab.ref.rootId}
          entry={fileSurfaceEntryForRead(read)}
          read={read.raw}
          loading={query.isFetching}
          onReload={() => void query.refetch()}
          statusNote="IDE Editor · 共享 File Surface 只读预览"
          chrome="embedded"
        />
      </div>
    );
  }

  if (unsupportedReason) {
    return (
      <IdeEditorStatePanel
        tone="muted"
        icon={<FileQuestion />}
        title="此文件不能作为文本编辑"
        description={unsupportedReason}
        path={tab.ref.path}
        dataState="unsupported"
      >
        <div className="mt-3 grid gap-1 rounded-md border border-line bg-canvas px-3 py-2 text-left font-mono text-2xs text-subtle">
          <div>mime: {metadata.mimeType || "unknown"}</div>
          <div>size: {formatBytes(metadata.size)}</div>
          <div>language: {metadata.language || "plaintext"}</div>
          <div>model: {editorModelUriString(tab.ref)}</div>
        </div>
      </IdeEditorStatePanel>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "grid h-full min-h-0 min-w-0 bg-canvas",
        tab.externalState ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]",
      )}
      data-ide-monaco-editor-panel
      data-ide-editor-panel
      data-ide-editor-panel-kind="file"
      data-ide-editor-file-path={tab.ref.path}
      data-ide-editor-model-uri={editorModelUriString(tab.ref)}
      data-ide-editor-readonly={metadata.readonly ? "true" : "false"}
      data-ide-editor-language={metadata.language || "plaintext"}
      data-ide-editor-external-state={tab.externalState ?? "none"}
      data-ide-editor-debug-breakpoint-count={debugBreakpoints.length}
      data-ide-editor-debug-stopped-line={debugStoppedLine ?? ""}
      onPointerDown={() => editorRef.current?.focus()}
    >
      <IdeEditorExternalStateBanner
        tab={tab}
        onCompare={tab.externalState === "changed" ? () => {
          void openConflictWithDisk({
            reason: "external-change",
            message: dirtyRef.current
              ? "文件已在磁盘上变更；当前未保存内容不会被自动覆盖。"
              : "文件已在磁盘上变更；可对比后重新读取磁盘版本。",
          });
        } : undefined}
        onReload={tab.externalState === "changed" && !dirtyRef.current ? () => {
          void reloadLatestFromDisk();
        } : undefined}
      />
      <CodeEditor
        ref={editorRef}
        key={`${tab.ref.rootId}:${tab.ref.path}`}
        rootId={tab.ref.rootId}
        path={tab.ref.path}
        initialContent={read.snapshot.content}
        readOnly={metadata.readonly}
        profile={metadata.size > IDE_EDITOR_SOFT_LARGE_FILE_BYTES ? "large-readonly" : "normal"}
        minimapEnabled={preferences.minimapEnabled}
        debugBreakpoints={debugBreakpoints}
        debugStoppedLine={debugStoppedLine}
        onGutterLineClick={(lineNumber) => {
          toggleDebugBreakpoint({
            rootId: tab.ref.rootId,
            path: tab.ref.path,
            lineNumber,
            column: 1,
          });
        }}
        stickyScrollEnabled
        wordWrap="on"
        onChange={markDirtyFromContent}
        onSaveShortcut={() => { void saveCurrent(); }}
        className="h-full min-h-0 min-w-0"
      />
      <EditorConflictDialog
        open={conflict != null}
        path={tab.ref.path}
        language={metadata.language || "plaintext"}
        diskContent={conflict?.diskRead.snapshot.content ?? ""}
        editorContent={conflict?.editorContent ?? ""}
        message={conflict?.message ?? ""}
        busy={conflictBusy}
        onCancel={cancelConflict}
        onReload={reloadConflictFromDisk}
        onOverwrite={overwriteConflictToDisk}
      />
    </div>
  );
}

function IdeEditorExternalStateBanner({
  tab,
  onCompare,
  onReload,
}: {
  tab: IdeWorkbenchEditorTab;
  onCompare?: () => void;
  onReload?: () => void;
}) {
  if (!tab.externalState) return null;
  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-2 border-b px-3 text-xs",
        tab.externalState === "deleted"
          ? "border-warning/30 bg-warning-soft text-warning"
          : "border-primary-line bg-primary-soft text-primary",
      )}
      data-ide-editor-external-banner
      data-ide-editor-external-state={tab.externalState}
    >
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {tab.externalMessage || (tab.externalState === "deleted" ? "文件已在磁盘上删除。" : "文件已在磁盘上变更。")}
      </span>
      {onCompare ? (
        <Button variant="outline" size="sm" className="h-6 min-h-0 px-2 text-xs" onClick={onCompare} data-ide-editor-external-compare>
          对比
        </Button>
      ) : null}
      {onReload ? (
        <Button variant="outline" size="sm" className="h-6 min-h-0 px-2 text-xs" onClick={onReload} data-ide-editor-external-reload>
          重新读取
        </Button>
      ) : null}
    </div>
  );
}

function fileSurfaceEntryForRead(read: EditorReadResult) {
  const { raw, snapshot } = read;
  return {
    path: snapshot.ref.path,
    name: snapshot.metadata.name || raw.name || snapshot.ref.path.split("/").filter(Boolean).pop() || snapshot.ref.path,
    ext: raw.ext ?? null,
    size: snapshot.metadata.size,
    modifiedAt: snapshot.metadata.modifiedAt,
    permissions: snapshot.metadata.permissions,
    imageLike: raw.imageLike,
  };
}

function unsupportedReasonForRead(read: EditorReadResult): string | null {
  const { snapshot, raw } = read;
  const metadata = snapshot.metadata;
  if (metadata.truncated || raw.truncated) {
    return "该文件读取结果已被截断。为避免误保存不完整内容，当前以只读方式处理，请使用预览或下载方式查看完整文件。";
  }
  if (raw.content == null) {
    return "文件内容为空或后端未返回可编辑文本内容。";
  }
  return null;
}


function IdeEditorStatePanel({
  tone,
  icon,
  title,
  description,
  path,
  action,
  children,
  dataState,
}: {
  tone: "loading" | "muted" | "warning" | "danger";
  icon: React.ReactNode;
  title: string;
  description: string;
  path: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  dataState?: string;
}) {
  const StateComponent = tone === "loading" ? LoadingState : tone === "danger" ? ErrorState : EmptyState;
  return (
    <StateComponent
      className="h-full min-h-0 bg-canvas"
      icon={tone === "warning" ? <span className="text-warning">{icon}</span> : icon}
      title={title}
      description={description}
      action={action}
      data-ide-editor-panel
      data-ide-editor-panel-state={dataState ?? tone}
      data-ide-editor-panel-title={title}
    >
      <div className="max-w-full rounded-md border border-line bg-panel px-3 py-2 text-left font-mono text-2xs text-subtle" data-ide-editor-panel-path>
        path: {path}
      </div>
      {children}
    </StateComponent>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
