import { FileCode } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";
import { toast } from "@/design/ui/sonner";
import { CodeEditor } from "@/features/ide/editor/CodeEditor";
import { useFileReadQuery, useWriteFileContentMutation } from "@/lib/query/files";
import { CodeBlock } from "@/shared/diff/DiffView";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

export interface FileEditorProps {
  rootId: string;
  path: string;
  onSaved?: () => void;
  onSaveStateChange?: (s: "idle" | "dirty" | "saving" | "saved") => void;
  className?: string;
}

/**
 * Shared single-file editor control for `/files` and `/ide`.
 *
 * The component owns one editable buffer per mounted file. It loads the latest
 * on-disk content via `useFileReadQuery`, seeds `CodeEditor` from that content,
 * and saves through the shared files mutation hook. Non-editable cases degrade
 * honestly to read-only output instead of pretending the file can be edited.
 */
export function FileEditor({
  rootId,
  path,
  onSaved,
  onSaveStateChange,
  className,
}: FileEditorProps) {
  const readQuery = useFileReadQuery({ rootId, path });
  const writeMutation = useWriteFileContentMutation();

  const fileKey = `${rootId}:${path}`;
  const loadedContent = readQuery.data?.content ?? "";
  const [dirty, setDirty] = React.useState<{
    key: string;
    content: string;
  } | null>(null);

  const editedContent = dirty?.key === fileKey ? dirty.content : null;
  const effectiveContent = editedContent ?? loadedContent;
  const isDirty = editedContent !== null && editedContent !== loadedContent;
  const saveState: "idle" | "dirty" | "saving" | "saved" =
    readQuery.isLoading
      ? "idle"
      : writeMutation.isPending
        ? "saving"
        : isDirty
          ? "dirty"
          : "saved";

  React.useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [onSaveStateChange, saveState]);

  const save = React.useCallback(async () => {
    if (readQuery.isLoading || readQuery.isError) return;
    if (!readQuery.data?.editable) return;
    if (editedContent === null) return;
    if (editedContent === loadedContent) {
      setDirty(null);
      return;
    }
    try {
      await writeMutation.mutateAsync({ rootId, path, content: editedContent });
      setDirty(null);
      toast.success(`已保存 · ${path.split("/").pop() || path}`);
      onSaved?.();
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [
    editedContent,
    loadedContent,
    onSaved,
    path,
    readQuery.data?.editable,
    readQuery.isError,
    readQuery.isLoading,
    rootId,
    writeMutation,
  ]);

  const rootRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const file = readQuery.data;
  const showReadOnlyBlock = file?.content !== null;

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        "grid min-h-0 min-w-0 overflow-hidden bg-canvas outline-none",
        className,
      )}
    >
      {readQuery.isLoading ? (
        <div className="grid gap-2 p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : readQuery.isError ? (
        <ErrorState
          title="无法打开文件"
          description={
            readQuery.error instanceof Error ? readQuery.error.message : undefined
          }
        />
      ) : !file ? null : !file.textLike ? (
        <EmptyState
          title="无法以文本打开"
          description="该文件不是可编辑的文本文件。"
          icon={<FileCode />}
        />
      ) : file.editable ? (
        <CodeEditor
          key={fileKey}
          path={path}
          initialContent={effectiveContent}
          onChange={(value) => setDirty({ key: fileKey, content: value })}
          className="min-h-0"
        />
      ) : showReadOnlyBlock ? (
        <div className="grid min-h-0 gap-2 p-3">
          {file.truncated ? (
            <div className="rounded-sm border border-amber/30 bg-amber-soft px-3 py-1.5 text-xs text-amber">
              内容超出上限，已截断显示，仅提供只读预览。
            </div>
          ) : (
            <div className="rounded-sm border border-line bg-panel-2 px-3 py-1.5 text-xs text-muted">
              当前文件仅提供只读预览。
            </div>
          )}
          <CodeBlock
            content={file.content ?? ""}
            label={path}
            className="min-h-0"
            maxHeightClassName="max-h-[70vh]"
          />
        </div>
      ) : (
        <EmptyState
          title="无法以文本打开"
          description="该文件不是可编辑的文本文件。"
          icon={<FileCode />}
        />
      )}
    </section>
  );
}

export default FileEditor;
