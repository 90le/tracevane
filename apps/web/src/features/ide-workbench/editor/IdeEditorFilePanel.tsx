import * as React from "react";
import { AlertTriangle, FileQuestion, FileText, RefreshCw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { CodeEditor } from "@/features/file-manager/code-editor/CodeEditor";
import type { CodeEditorHandle } from "@/features/file-manager/code-editor/CodeEditor";
import { editorModelUriString, saveEditorFile } from "@/shared/editor-core";
import type { EditorReadResult, EditorSaveState } from "@/shared/editor-core";
import type { IdeWorkbenchEditorTab } from "../types";
import { useIdeEditorFile } from "./useIdeEditorFile";
import { registerIdeEditorRuntimeHandle } from "./ideEditorRuntime";

const IDE_EDITOR_SOFT_LARGE_FILE_BYTES = 5 * 1024 * 1024;

export function IdeEditorFilePanel({
  tab,
  onDirtyChange,
  onSaveStateChange,
}: {
  tab: IdeWorkbenchEditorTab;
  onDirtyChange?: (tabId: string, dirty: boolean) => void;
  onSaveStateChange?: (tabId: string, saveState: EditorSaveState, message?: string | null) => void;
}) {
  const editorRef = React.useRef<CodeEditorHandle | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const cleanContentRef = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);
  const dirtyRef = React.useRef(Boolean(tab.dirty));
  const query = useIdeEditorFile(tab.ref, !tab.deleted);
  const read = query.data;
  const metadata = read?.snapshot.metadata;
  const unsupportedReason = read ? unsupportedReasonForRead(read) : null;

  React.useEffect(() => {
    dirtyRef.current = Boolean(tab.dirty);
  }, [tab.dirty]);

  React.useEffect(() => {
    if (!read || unsupportedReason) return;
    if (cleanContentRef.current == null || !dirtyRef.current) {
      cleanContentRef.current = read.snapshot.content;
    }
  }, [read, unsupportedReason]);

  const markDirtyFromContent = React.useCallback((value: string) => {
    const cleanContent = cleanContentRef.current;
    if (cleanContent == null) return;
    const dirty = value !== cleanContent;
    dirtyRef.current = dirty;
    onDirtyChange?.(tab.id, dirty);
    onSaveStateChange?.(tab.id, dirty ? "dirty" : "clean", null);
  }, [onDirtyChange, onSaveStateChange, tab.id]);

  const saveCurrent = React.useCallback(async () => {
    if (savingRef.current) return false;
    if (tab.deleted) {
      toast.error("文件已删除", { description: tab.ref.path });
      return false;
    }
    if (!read || unsupportedReason) return true;
    if (metadata?.readonly) {
      toast.warning("只读文件不能保存", { description: tab.ref.path });
      return false;
    }
    const content = editorRef.current?.getValue() ?? read.snapshot.content;
    if (cleanContentRef.current === content && !dirtyRef.current) return true;
    savingRef.current = true;
    onSaveStateChange?.(tab.id, "saving", null);
    try {
      const result = await saveEditorFile({ rootId: tab.ref.rootId, path: tab.ref.path, content });
      cleanContentRef.current = content;
      dirtyRef.current = false;
      onDirtyChange?.(tab.id, false);
      onSaveStateChange?.(tab.id, "saved", null);
      toast.success("已保存", { description: tab.ref.path });
      void query.refetch();
      void result;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dirtyRef.current = true;
      onDirtyChange?.(tab.id, true);
      onSaveStateChange?.(tab.id, "error", message);
      toast.error("保存失败", { description: message });
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [metadata?.readonly, onDirtyChange, onSaveStateChange, query, read, tab.deleted, tab.id, tab.ref.path, tab.ref.rootId, unsupportedReason]);

  React.useEffect(() => registerIdeEditorRuntimeHandle(tab.id, {
    save: saveCurrent,
    focus: () => editorRef.current?.focus(),
  }), [saveCurrent, tab.id]);

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
        description="该文件路径已被删除或移动（deleted）。M5.y-B 只显示读取边界；dirty 内容保护和恢复流程将在 M5.y-C/M5.y-D 接入。"
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
        description="通过 shared/editor-core 复用现有 Files API 读取内容。"
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

  if (unsupportedReason) {
    return (
      <IdeEditorStatePanel
        tone="muted"
        icon={<FileQuestion />}
        title="暂不在 IDE Editor 中编辑此文件"
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
      className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-canvas"
      data-ide-monaco-editor-panel
      data-ide-editor-panel
      data-ide-editor-panel-kind="file"
      data-ide-editor-file-path={tab.ref.path}
      data-ide-editor-model-uri={editorModelUriString(tab.ref)}
      data-ide-editor-readonly={metadata.readonly ? "true" : "false"}
    >
      <CodeEditor
        ref={editorRef}
        key={`${tab.ref.rootId}:${tab.ref.path}`}
        rootId={tab.ref.rootId}
        path={tab.ref.path}
        initialContent={read.snapshot.content}
        readOnly={metadata.readonly}
        profile={metadata.size > IDE_EDITOR_SOFT_LARGE_FILE_BYTES ? "large-readonly" : "normal"}
        minimapEnabled={false}
        stickyScrollEnabled
        wordWrap="on"
        onChange={markDirtyFromContent}
        onSaveShortcut={() => { void saveCurrent(); }}
        className="h-full min-h-0 min-w-0"
      />
      <div className="flex min-h-7 min-w-0 items-center gap-2 border-t border-line bg-panel px-3 text-2xs text-subtle" data-ide-editor-file-status>
        <span className="truncate font-mono" data-ide-editor-panel-path>path: {tab.ref.path}</span>
        <span className="ml-auto shrink-0" data-ide-editor-save-state>{tab.saveState ?? (tab.dirty ? "dirty" : "clean")}</span>
        <span className="shrink-0">{metadata.language || "plaintext"}</span>
        <span className="shrink-0">{formatBytes(metadata.size)}</span>
        {metadata.readonly ? <span className="shrink-0 text-amber">只读</span> : null}
      </div>
    </div>
  );
}

function unsupportedReasonForRead(read: EditorReadResult): string | null {
  const { snapshot, raw } = read;
  const metadata = snapshot.metadata;
  if (!metadata.textLike) {
    return "该文件不是文本/code 类型。图片、视频、音频、PDF、二进制和其它媒体预览仍由 File Surface 或后续 IDE Preview 承载，M5.y-B 不强塞 Monaco。";
  }
  if (metadata.truncated || raw.truncated) {
    return "该文件读取结果已被截断，M5.y-B 暂不在 IDE 中编辑截断内容，避免误保存不完整文件。大文件/分段读取策略将在后续阶段补齐。";
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
  return (
    <div
      className="grid h-full min-h-0 place-items-center bg-canvas p-6 text-ink"
      data-ide-editor-panel
      data-ide-editor-panel-state={dataState ?? tone}
    >
      <div className="max-w-xl rounded-lg border border-line bg-panel p-5 text-center shadow-sm">
        <div
          className={cn(
            "mx-auto mb-3 grid size-11 place-items-center rounded-md [&_svg]:size-5",
            tone === "danger" && "bg-red-soft text-red",
            tone === "warning" && "bg-amber-soft text-amber",
            tone === "loading" && "bg-primary-soft text-primary",
            tone === "muted" && "bg-panel-2 text-subtle",
          )}
        >
          {icon}
        </div>
        <div className="text-sm font-semibold text-ink-strong" data-ide-editor-panel-title>{title}</div>
        <div className="mt-2 text-sm text-muted">{description}</div>
        <div className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-left font-mono text-2xs text-subtle" data-ide-editor-panel-path>
          path: {path}
        </div>
        {children}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
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
