import * as React from "react";
import { Code2, FileText } from "lucide-react";
import DOMPurify from "dompurify";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { getDocumentVisualEditor } from "./DocumentViewRegistry";
import { useFilesBrowseQuery } from "@/lib/query/files";
import type { FileEntrySummary } from "@/features/file-manager/file-tools";
import { useVisualViewportKeyboardInset } from "./useVisualViewportKeyboardInset";

const MarkdownPreview = React.lazy(() =>
  import("@/features/file-manager/preview-renderers/MarkdownPreview").then((module) => ({
    default: module.MarkdownPreview,
  })),
);

export interface VisualDocumentEditorProps {
  path: string;
  rootId?: string;
  content: string;
  editable: boolean;
  onChange: (content: string) => void;
  className?: string;
}

export function canEditDocumentVisually(
  path: string,
  textLike = true,
): boolean {
  return Boolean(getDocumentVisualEditor(path, { textLike }));
}

export function VisualDocumentEditor({
  path,
  rootId,
  content,
  editable,
  onChange,
  className,
}: VisualDocumentEditorProps) {
  const editor = getDocumentVisualEditor(path, { textLike: true });

  if (editor?.id === "html") {
    return (
      <HtmlVisualEditor
        content={content}
        editable={editable}
        onChange={onChange}
        className={className}
      />
    );
  }
  if (editor?.id === "markdown") {
    return (
      <MarkdownLiveEditor
        path={path}
        rootId={rootId}
        content={content}
        editable={editable}
        onChange={onChange}
        className={className}
      />
    );
  }
  return null;
}

export function MarkdownLiveEditor({
  path,
  rootId,
  content,
  editable,
  onChange,
  className,
}: {
  path: string;
  rootId?: string;
  content: string;
  editable: boolean;
  onChange: (content: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(content);
  const [editingBlockId, setEditingBlockId] = React.useState<string | null>(
    null,
  );
  const scrollportRef = React.useRef<HTMLDivElement | null>(null);
  const keyboardInset = useVisualViewportKeyboardInset(scrollportRef);

  React.useEffect(() => {
    setDraft(content);
    setEditingBlockId(null);
  }, [content]);

  const blocks = React.useMemo(() => parseMarkdownBlocks(draft), [draft]);

  const updateBlocks = React.useCallback(
    (updater: (blocks: MarkdownBlock[]) => MarkdownBlock[]) => {
      setDraft((previous) => {
        const previousBlocks = parseMarkdownBlocks(previous);
        const nextBlocks = updater(previousBlocks);
        const next = joinMarkdownBlocks(nextBlocks);
        if (next !== previous) onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const commitBlock = React.useCallback(
    (blockIndex: number, nextRaw: string) => {
      updateBlocks((nextBlocks) => {
        const normalized = nextRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!nextBlocks[blockIndex]) return nextBlocks;
        nextBlocks[blockIndex] = { ...nextBlocks[blockIndex], raw: normalized };
        return nextBlocks;
      });
    },
    [updateBlocks],
  );

  const insertBlockAfter = React.useCallback(
    (blockIndex: number) => {
      updateBlocks((previousBlocks) => {
        const nextBlocks = [...previousBlocks];
        if (nextBlocks[blockIndex] && !nextBlocks[blockIndex].separatorAfter) {
          nextBlocks[blockIndex] = {
            ...nextBlocks[blockIndex],
            separatorAfter: "\n\n",
          };
        }
        nextBlocks.splice(blockIndex + 1, 0, createMarkdownBlock("新段落"));
        return nextBlocks;
      });
    },
    [updateBlocks],
  );

  const deleteBlock = React.useCallback(
    (blockIndex: number) => {
      updateBlocks((previousBlocks) =>
        previousBlocks.filter((_block, index) => index !== blockIndex),
      );
      setEditingBlockId(null);
    },
    [updateBlocks],
  );

  const moveBlock = React.useCallback(
    (blockIndex: number, direction: -1 | 1) => {
      updateBlocks((previousBlocks) => {
        const targetIndex = blockIndex + direction;
        if (targetIndex < 0 || targetIndex >= previousBlocks.length)
          return previousBlocks;
        const nextBlocks = [...previousBlocks];
        [nextBlocks[blockIndex], nextBlocks[targetIndex]] = [
          nextBlocks[targetIndex],
          nextBlocks[blockIndex],
        ];
        return nextBlocks;
      });
    },
    [updateBlocks],
  );

  return (
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded border border-line bg-panel",
        className,
      )}
      data-visual-document-editor-shell
      data-visual-document-keyboard-inset={keyboardInset > 0 ? "true" : "false"}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs text-muted">
        <FileText className="size-4 shrink-0 text-primary" />
        <span className="shrink-0 font-medium text-ink-strong">预览时编辑</span>
        <span className="min-w-0 flex-1 truncate">
          正文保持渲染预览；悬停或聚焦块时显示工具，文本块可直接修改文字，也可编辑块源码。
        </span>
      </div>
      <div
        ref={scrollportRef}
        className="min-h-0 min-w-0 overflow-auto bg-panel"
        data-markdown-visual-scrollport
        style={{
          scrollPaddingBottom: keyboardInset ? keyboardInset + 24 : undefined,
        }}
      >
        <div className="mx-auto min-h-full max-w-4xl px-3 py-5 sm:px-6 sm:py-7">
          <div className="grid gap-1">
            {blocks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-panel-2 p-6 text-center text-sm text-muted">
                空 Markdown 文档
              </div>
            ) : (
              blocks.map((block, index) => {
                const blockId = `${index}:${block.kind}:${block.raw.length}`;
                return (
                  <MarkdownVisualBlock
                    key={blockId}
                    block={block}
                    path={path}
                    rootId={rootId}
                    editable={editable}
                    editing={editingBlockId === blockId}
                    onEdit={() => setEditingBlockId(blockId)}
                    onCancel={() => setEditingBlockId(null)}
                    onCommit={(value) => {
                      commitBlock(index, value);
                      setEditingBlockId(null);
                    }}
                    onTaskToggle={(taskIndex, checked) =>
                      commitBlock(
                        index,
                        toggleMarkdownTask(block.raw, taskIndex, checked),
                      )
                    }
                    onInsertAfter={() => insertBlockAfter(index)}
                    onDelete={() => deleteBlock(index)}
                    onMoveUp={() => moveBlock(index, -1)}
                    onMoveDown={() => moveBlock(index, 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < blocks.length - 1}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkdownVisualBlock({
  block,
  path,
  rootId,
  editable,
  editing,
  onEdit,
  onCancel,
  onCommit,
  onTaskToggle,
  onInsertAfter,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  block: MarkdownBlock;
  path: string;
  rootId?: string;
  editable: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onCommit: (raw: string) => void;
  onTaskToggle: (taskIndex: number, checked: boolean) => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [value, setValue] = React.useState(block.raw);
  const [resourcePath, setResourcePath] = React.useState(() =>
    extractMarkdownResourcePath(block.raw),
  );

  React.useEffect(() => {
    setValue(block.raw);
    setResourcePath(extractMarkdownResourcePath(block.raw));
  }, [block.raw, editing]);

  const blockLabel = markdownBlockLabel(block.kind);
  const isRichBlock =
    block.kind === "mermaid" ||
    block.kind === "image" ||
    block.kind === "video" ||
    block.kind === "table" ||
    block.kind === "code" ||
    block.kind === "html";
  const canReplaceResource = block.kind === "image" || block.kind === "video";
  const canInlineEdit = editable && canEditMarkdownBlockInline(block.kind);

  const commitInlineText = (text: string) => {
    const nextRaw = markdownBlockFromPlainText(block, text);
    if (nextRaw !== block.raw) onCommit(nextRaw);
  };

  return (
    <section
      className={cn(
        "group/visual-block relative rounded-lg border border-transparent bg-panel transition hover:border-primary/20 focus-within:border-primary/30 focus-within:bg-panel-2/40",
        editing && "border-primary/50 bg-panel-2/70 shadow-[var(--ring)]",
        isRichBlock && "overflow-hidden",
      )}
      data-markdown-visual-block={block.kind}
      tabIndex={editable ? 0 : -1}
    >
      <div className="pointer-events-none absolute -top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 opacity-0 transition group-hover/visual-block:opacity-100 group-focus-within/visual-block:opacity-100">
        <span className="truncate rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-mono uppercase text-subtle shadow-sm">
          {blockLabel}
        </span>
        <span className="hidden max-w-xs truncate rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] text-muted shadow-sm sm:inline">
          {markdownBlockDescription(block)}
        </span>
      </div>
      {editable ? (
        <div
          className="absolute right-2 top-2 z-20 flex max-w-[calc(100%-1rem)] items-center justify-end gap-1 overflow-x-auto rounded-full border border-line bg-panel/95 px-1.5 py-1 opacity-0 shadow-lg backdrop-blur transition group-hover/visual-block:opacity-100 group-focus-within/visual-block:opacity-100 sm:flex-wrap"
          data-markdown-block-toolbar
        >
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onCancel}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onCommit(value)}
              >
                应用源码
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                aria-label="上移 Markdown 块"
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                aria-label="下移 Markdown 块"
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onInsertAfter}
              >
                新增
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onEdit}
              >
                源码
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-danger hover:text-danger"
                onClick={onDelete}
              >
                删除
              </Button>
            </>
          )}
        </div>
      ) : null}
      {editing ? (
        <textarea
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          className="min-h-32 w-full resize-y border-0 bg-canvas p-3 pt-10 font-mono text-xs leading-6 text-ink outline-none focus-visible:shadow-[var(--ring)]"
          spellCheck={false}
          aria-label="编辑 Markdown 块源码"
        />
      ) : editable && block.kind === "list" ? (
        <MarkdownTaskListInlineEditor block={block} onCommit={onCommit} />
      ) : canInlineEdit ? (
        <MarkdownInlineEditableBlock
          block={block}
          onCommit={commitInlineText}
        />
      ) : editable && (block.kind === "code" || block.kind === "mermaid") ? (
        <MarkdownFenceInlineEditor block={block} onCommit={onCommit} />
      ) : editable && block.kind === "table" ? (
        <MarkdownTableInlineEditor block={block} onCommit={onCommit} />
      ) : editable && canReplaceResource ? (
        <MarkdownResourceInlineEditor
          block={block}
          markdownPath={path}
          rootId={rootId}
          resourcePath={resourcePath}
          onResourcePathChange={setResourcePath}
          onCommit={(nextPath) =>
            onCommit(replaceMarkdownResourcePath(block.raw, nextPath))
          }
        />
      ) : editable && block.kind === "html" ? (
        <MarkdownHtmlInlineEditor block={block} onCommit={onCommit} />
      ) : (
        <React.Suspense fallback={<VisualPreviewLoading />}>
          <MarkdownPreview
            path={path}
            rootId={rootId}
            content={block.raw}
            onTaskToggle={
              editable && block.kind === "list" ? onTaskToggle : undefined
            }
          />
        </React.Suspense>
      )}
    </section>
  );
}

function MarkdownTaskListInlineEditor({
  block,
  onCommit,
}: {
  block: MarkdownBlock;
  onCommit: (raw: string) => void;
}) {
  const parsed = React.useMemo(
    () => parseMarkdownListItems(block.raw),
    [block.raw],
  );
  const [items, setItems] = React.useState(parsed);

  React.useEffect(() => {
    setItems(parsed);
  }, [parsed]);

  const commitItems = React.useCallback(
    (nextItems: MarkdownListItemEdit[]) => {
      const next = buildMarkdownListItems(nextItems);
      if (next !== block.raw) onCommit(next);
    },
    [block.raw, onCommit],
  );

  const updateItem = React.useCallback(
    (
      index: number,
      patch: Partial<MarkdownListItemEdit>,
      shouldCommit = false,
    ) => {
      setItems((previous) => {
        const nextItems = previous.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item,
        );
        if (shouldCommit) commitItems(nextItems);
        return nextItems;
      });
    },
    [commitItems],
  );

  const addItem = React.useCallback(() => {
    const marker = nextMarkdownListMarker(items);
    const nextItems = [
      ...items,
      { marker, task: false, checked: false, text: "新项目" },
    ];
    setItems(nextItems);
    commitItems(nextItems);
  }, [commitItems, items]);

  const addTask = React.useCallback(() => {
    const marker =
      items.find((item) => item.marker.trim().startsWith("-"))?.marker ?? "- ";
    const nextItems = [
      ...items,
      { marker, task: true, checked: false, text: "新任务" },
    ];
    setItems(nextItems);
    commitItems(nextItems);
  }, [commitItems, items]);

  const deleteItem = React.useCallback(
    (index: number) => {
      const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
      setItems(nextItems);
      commitItems(nextItems);
    },
    [commitItems, items],
  );

  return (
    <div
      className="grid gap-2 rounded-md bg-panel-2 px-3 py-3 pt-10"
      data-markdown-task-list-inline-editor
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink-strong">列表直接编辑</span>
        <span className="min-w-0 flex-1 truncate">
          普通列表保留原 marker；任务列表勾选状态写回 [x]/[ ]。文字离开输入框或
          Ctrl/⌘+Enter 后保存。
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={addItem}
          data-markdown-list-add-item
        >
          加项目
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={addTask}
          data-markdown-task-list-add-item
        >
          加任务
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => commitItems(items)}
          data-markdown-list-apply
        >
          应用列表
        </Button>
      </div>
      <div className="grid gap-1" data-markdown-task-list-items>
        {items.map((item, index) => (
          <label
            key={`${item.marker}:${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded border border-transparent px-2 py-1.5 text-sm hover:border-primary/20 hover:bg-primary-soft/20"
            data-markdown-task-list-row
          >
            {item.task ? (
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-line accent-[var(--primary)]"
                checked={item.checked}
                onChange={(event) =>
                  updateItem(
                    index,
                    { checked: event.currentTarget.checked },
                    true,
                  )
                }
                aria-label={`切换任务 ${index + 1} 完成状态`}
                data-markdown-task-checkbox
              />
            ) : (
              <span
                className="mt-1 rounded bg-panel px-1.5 py-0.5 font-mono text-2xs text-subtle"
                data-markdown-regular-list-marker
              >
                {item.marker.trim()}
              </span>
            )}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                value={item.text}
                onChange={(event) =>
                  updateItem(index, { text: event.currentTarget.value })
                }
                onBlur={(event) =>
                  updateItem(index, { text: event.currentTarget.value }, true)
                }
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    updateItem(
                      index,
                      { text: event.currentTarget.value },
                      true,
                    );
                    event.currentTarget.blur();
                  }
                }}
                className="h-8 bg-panel text-sm"
                aria-label={`编辑任务列表项目 ${index + 1}`}
                data-markdown-task-text-input
                data-markdown-list-text-input
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-danger hover:text-danger"
                onClick={() => deleteItem(index)}
                aria-label={`删除列表项目 ${index + 1}`}
                data-markdown-list-delete-item
              >
                删除
              </Button>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function MarkdownInlineEditableBlock({
  block,
  onCommit,
}: {
  block: MarkdownBlock;
  onCommit: (text: string) => void;
}) {
  const text = markdownBlockToPlainText(block);
  const className = cn(
    "min-h-8 w-full rounded-md px-3 py-2 text-ink outline-none focus-visible:shadow-[var(--ring)]",
    block.kind === "heading" &&
      "text-2xl font-semibold leading-tight text-ink-strong",
    block.kind === "paragraph" && "text-sm leading-7",
    block.kind === "quote" &&
      "border-l-4 border-primary/30 bg-primary-soft/30 pl-4 text-sm italic leading-7 text-muted",
    block.kind === "list" && "text-sm leading-7",
  );
  return (
    <div
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-markdown-inline-editable-plaintext
      spellCheck
      role="textbox"
      aria-label="直接编辑渲染文本"
      data-markdown-inline-editable
      onBlur={(event) =>
        onCommit(trimEditablePlainText(event.currentTarget.innerText))
      }
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onCommit(trimEditablePlainText(event.currentTarget.innerText));
          event.currentTarget.blur();
        }
      }}
    >
      {text}
    </div>
  );
}

function MarkdownFenceInlineEditor({
  block,
  onCommit,
}: {
  block: MarkdownBlock;
  onCommit: (raw: string) => void;
}) {
  const fence = React.useMemo(
    () => parseMarkdownFence(block.raw, block.kind),
    [block.kind, block.raw],
  );
  const [value, setValue] = React.useState(fence.body);

  React.useEffect(() => {
    setValue(fence.body);
  }, [fence.body]);

  const commit = React.useCallback(() => {
    const next = buildMarkdownFence(fence.marker, fence.info, value);
    if (next !== block.raw) onCommit(next);
  }, [block.raw, fence.info, fence.marker, onCommit, value]);

  return (
    <div
      className="grid min-h-0 gap-2 rounded-md bg-panel-2 p-3 pt-10"
      data-markdown-fence-inline-editor
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded bg-panel px-2 py-1 font-mono text-2xs text-subtle">
          {fence.info || (block.kind === "mermaid" ? "mermaid" : "code")}
        </span>
        <span className="min-w-0 flex-1 truncate">
          直接编辑代码内容；不需要切换到块源码。
        </span>
        <Button
          variant="primary"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={commit}
          data-markdown-fence-apply
        >
          应用内容
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={commit}
        className="min-h-40 w-full resize-y rounded border border-line bg-canvas p-3 font-mono text-xs leading-6 text-ink outline-none focus-visible:shadow-[var(--ring)]"
        spellCheck={false}
        aria-label={
          block.kind === "mermaid"
            ? "直接编辑 Mermaid 图表内容"
            : "直接编辑代码块内容"
        }
      />
      {block.kind === "mermaid" ? (
        <div className="rounded border border-line bg-panel p-2 text-xs text-muted">
          图表会在应用后重新渲染；当前输入保持纯文本以避免编辑中 SVG 抖动。
        </div>
      ) : null}
    </div>
  );
}

function MarkdownResourceInlineEditor({
  block,
  markdownPath,
  rootId,
  resourcePath,
  onResourcePathChange,
  onCommit,
}: {
  block: MarkdownBlock;
  markdownPath: string;
  rootId?: string;
  resourcePath: string;
  onResourcePathChange: (path: string) => void;
  onCommit: (path: string) => void;
}) {
  const previewUrl = React.useMemo(
    () => resolveMarkdownResourcePreviewUrl(resourcePath, rootId, markdownPath),
    [markdownPath, resourcePath, rootId],
  );
  const mediaKind = markdownResourcePreviewKind(resourcePath, block.kind);
  const [dragging, setDragging] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const applyResourcePath = React.useCallback(
    (nextPath: string) => {
      const normalized = nextPath.trim();
      if (!normalized) return;
      onResourcePathChange(normalized);
      onCommit(normalized);
    },
    [onCommit, onResourcePathChange],
  );

  const copyResourcePath = React.useCallback(() => {
    if (!resourcePath) return;
    void navigator.clipboard
      ?.writeText(resourcePath)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => setMessage("当前浏览器不允许写入剪贴板，请手动复制路径。"));
  }, [resourcePath]);

  const acceptDroppedResource = React.useCallback(
    (dataTransfer: DataTransfer): string | null => {
      const fileManagerPayload = dataTransfer.getData(
        MARKDOWN_FILE_MANAGER_DRAG_MIME,
      );
      if (fileManagerPayload) {
        try {
          const parsed = JSON.parse(fileManagerPayload) as {
            rootId?: unknown;
            paths?: unknown;
          };
          if (
            typeof parsed.rootId === "string" &&
            rootId &&
            parsed.rootId !== rootId
          ) {
            setMessage(
              "该资源来自其他文件根目录；请先切换到同一 root，或复制为可访问 URL。",
            );
            return null;
          }
          const paths = Array.isArray(parsed.paths)
            ? parsed.paths.filter(
                (item): item is string => typeof item === "string",
              )
            : [];
          const firstPath = paths[0];
          if (firstPath)
            return relativePathFromMarkdown(markdownPath, firstPath);
        } catch {
          /* fall through to text payloads */
        }
      }
      const uri = dataTransfer
        .getData("text/uri-list")
        .split("\n")
        .find((line) => line.trim() && !line.startsWith("#"));
      if (uri) return uri.trim();
      const text = dataTransfer.getData("text/plain").trim();
      if (text) return text;
      if (dataTransfer.files?.length) {
        setMessage(
          "本区域只替换资源路径；上传文件请先使用文件管理器上传到目标目录。已使用文件名作为路径草稿。",
        );
        return dataTransfer.files[0]?.name ?? null;
      }
      return null;
    },
    [markdownPath, rootId],
  );

  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-line bg-panel-2 p-3 pt-10",
        dragging && "border-primary bg-primary-soft/40",
      )}
      data-markdown-resource-inline-editor
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const nextPath = acceptDroppedResource(event.dataTransfer);
        if (nextPath) applyResourcePath(nextPath);
      }}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text/plain").trim();
        if (!text) return;
        event.preventDefault();
        applyResourcePath(text);
      }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink-strong">资源块</span>
        <span className="min-w-0 flex-1 truncate">
          拖拽文件管理器资源、粘贴
          URL/路径，或从资源选择器选择；这里只修改路径，不执行上传。
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={copyResourcePath}
          disabled={!resourcePath}
          data-markdown-resource-copy-path
        >
          {copied ? "已复制" : "复制路径"}
        </Button>
        {previewUrl ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              window.open(previewUrl, "_blank", "noopener,noreferrer")
            }
            data-markdown-resource-open
          >
            打开资源
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-muted">
            <span>资源路径</span>
            <Input
              value={resourcePath}
              onChange={(event) =>
                onResourcePathChange(event.currentTarget.value)
              }
              onBlur={(event) => applyResourcePath(event.currentTarget.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  applyResourcePath(event.currentTarget.value);
                  event.currentTarget.blur();
                }
              }}
              placeholder="相对路径、绝对 URL 或资源路径"
              className="h-9 font-mono text-xs"
              data-markdown-resource-path-input
            />
          </label>
          <MarkdownResourcePicker
            rootId={rootId}
            markdownPath={markdownPath}
            pickerKind={block.kind === "image" ? "image" : "media"}
            onPick={applyResourcePath}
          />
          <div
            className="rounded border border-dashed border-line bg-panel px-3 py-2 text-xs text-muted"
            data-markdown-resource-dropzone
          >
            {dragging
              ? "松开后替换为该资源路径"
              : "也可以把文件管理器里的资源拖到这里，或直接粘贴路径/URL。"}
          </div>
          {message ? (
            <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {message}
            </div>
          ) : null}
        </div>
        <div
          className="grid min-h-36 place-items-center overflow-hidden rounded border border-line bg-canvas p-2"
          data-markdown-resource-preview
        >
          {previewUrl && mediaKind === "image" ? (
            <img
              src={previewUrl}
              alt={extractMarkdownImageAlt(block.raw)}
              className="max-h-64 max-w-full rounded object-contain"
              loading="lazy"
              decoding="async"
            />
          ) : previewUrl && mediaKind === "video" ? (
            <video
              src={previewUrl}
              className="max-h-64 max-w-full rounded"
              controls
              preload="metadata"
              playsInline
            />
          ) : previewUrl && mediaKind === "audio" ? (
            <audio
              src={previewUrl}
              className="w-full"
              controls
              preload="metadata"
            />
          ) : (
            <div className="px-3 text-center text-xs text-muted">
              暂无可内嵌预览；可复制路径或在新窗口打开。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarkdownTableInlineEditor({
  block,
  onCommit,
}: {
  block: MarkdownBlock;
  onCommit: (raw: string) => void;
}) {
  const parsed = React.useMemo(
    () => parseMarkdownTable(block.raw),
    [block.raw],
  );
  const [rows, setRows] = React.useState(parsed.rows);
  const [alignments, setAlignments] = React.useState(parsed.alignments);

  React.useEffect(() => {
    setRows(parsed.rows);
    setAlignments(parsed.alignments);
  }, [parsed.alignments, parsed.rows]);

  const commitTable = React.useCallback(
    (nextRows: string[][], nextAlignments = alignments) => {
      const next = buildMarkdownTable(nextRows, nextAlignments);
      if (next !== block.raw) onCommit(next);
    },
    [alignments, block.raw, onCommit],
  );

  const updateCell = React.useCallback(
    (
      rowIndex: number,
      cellIndex: number,
      value: string,
      shouldCommit = false,
    ) => {
      setRows((previous) => {
        const nextRows = previous.map((row, rIndex) =>
          rIndex !== rowIndex
            ? row
            : row.map((cell, cIndex) => (cIndex === cellIndex ? value : cell)),
        );
        if (shouldCommit) commitTable(nextRows);
        return nextRows;
      });
    },
    [commitTable],
  );

  const addRow = React.useCallback(() => {
    const width = Math.max(1, rows[0]?.length ?? parsed.width);
    const nextRows = [...rows, Array.from({ length: width }, () => "")];
    setRows(nextRows);
    commitTable(nextRows);
  }, [commitTable, parsed.width, rows]);

  const addColumn = React.useCallback(() => {
    const nextRows = rows.map((row) => [...row, ""]);
    const nextAlignments = [...alignments, "---"];
    setRows(nextRows);
    setAlignments(nextAlignments);
    commitTable(nextRows, nextAlignments);
  }, [alignments, commitTable, rows]);

  const deleteRow = React.useCallback(
    (rowIndex: number) => {
      if (rows.length <= 1) return;
      const nextRows = rows.filter((_row, index) => index !== rowIndex);
      setRows(nextRows);
      commitTable(nextRows);
    },
    [commitTable, rows],
  );

  const deleteColumn = React.useCallback(
    (cellIndex: number) => {
      const width = Math.max(1, rows[0]?.length ?? parsed.width);
      if (width <= 1) return;
      const nextRows = rows.map((row) =>
        row.filter((_cell, index) => index !== cellIndex),
      );
      const nextAlignments = alignments.filter(
        (_cell, index) => index !== cellIndex,
      );
      setRows(nextRows);
      setAlignments(nextAlignments);
      commitTable(nextRows, nextAlignments);
    },
    [alignments, commitTable, parsed.width, rows],
  );

  const setColumnAlignment = React.useCallback(
    (cellIndex: number, alignment: MarkdownTableAlignment) => {
      const nextAlignments = normalizeTableRowWidth(
        alignments,
        Math.max(1, rows[0]?.length ?? parsed.width),
      );
      nextAlignments[cellIndex] = markdownDelimiterFromAlignment(alignment);
      setAlignments(nextAlignments);
      commitTable(rows, nextAlignments);
    },
    [alignments, commitTable, parsed.width, rows],
  );

  const pasteTableAtCell = React.useCallback(
    (rowIndex: number, cellIndex: number, text: string): boolean => {
      const pastedRows = parseMarkdownTableClipboard(text);
      if (!pastedRows.length) return false;
      const width = Math.max(
        1,
        rows[0]?.length ?? parsed.width,
        cellIndex + Math.max(...pastedRows.map((row) => row.length)),
      );
      const nextRows = rows.map((row) => normalizeTableRowWidth(row, width));
      while (nextRows.length < rowIndex + pastedRows.length) {
        nextRows.push(Array.from({ length: width }, () => ""));
      }
      pastedRows.forEach((pastedRow, pastedRowIndex) => {
        pastedRow.forEach((cell, pastedCellIndex) => {
          nextRows[rowIndex + pastedRowIndex][cellIndex + pastedCellIndex] =
            normalizeEditableLineBreaks(cell);
        });
      });
      const nextAlignments = normalizeTableRowWidth(alignments, width).map(
        (value) => (/^:?-{3,}:?$/.test(value) ? value : "---"),
      );
      setRows(nextRows);
      setAlignments(nextAlignments);
      commitTable(nextRows, nextAlignments);
      return true;
    },
    [alignments, commitTable, parsed.width, rows],
  );

  return (
    <div
      className="grid gap-2 overflow-hidden rounded-md bg-panel-2 p-3 pt-10"
      data-markdown-table-inline-editor
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink-strong">表格直接编辑</span>
        <span className="min-w-0 flex-1 truncate">
          单元格、行列和对齐都写回 GFM 表格；复杂表格仍可切源码。
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={addRow}
          data-markdown-table-add-row
        >
          加一行
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={addColumn}
          data-markdown-table-add-column
        >
          加一列
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => commitTable(rows)}
          data-markdown-table-apply
        >
          应用表格
        </Button>
      </div>
      <div
        className="max-h-[55vh] overflow-auto rounded border border-line bg-panel overscroll-contain"
        data-markdown-table-scrollport
      >
        <table
          className="min-w-max border-collapse text-sm"
          data-markdown-table-editor
        >
          <thead>
            <tr className="sticky top-0 z-10 bg-panel-2 text-[11px] text-subtle shadow-sm">
              <th className="w-20 min-w-20 border border-line px-2 py-1 text-left font-medium">
                行
              </th>
              {normalizeTableRowWidth(
                alignments,
                Math.max(1, rows[0]?.length ?? parsed.width),
              ).map((alignment, cellIndex) => (
                <th
                  key={`column-tools-${cellIndex}`}
                  className="min-w-36 border border-line px-2 py-1 text-left font-medium"
                >
                  <div
                    className="flex min-w-0 items-center gap-1"
                    data-markdown-table-column-tools
                  >
                    <span className="shrink-0">列 {cellIndex + 1}</span>
                    <label className="ml-auto flex items-center gap-1">
                      <span className="sr-only">
                        设置列 {cellIndex + 1} 对齐
                      </span>
                      <select
                        value={markdownAlignmentFromDelimiter(alignment)}
                        onChange={(event) =>
                          setColumnAlignment(
                            cellIndex,
                            event.currentTarget.value as MarkdownTableAlignment,
                          )
                        }
                        className="h-6 rounded border border-line bg-panel px-1 text-[11px] text-ink outline-none focus-visible:shadow-[var(--ring)]"
                        data-markdown-table-align-select
                      >
                        <option value="left">左</option>
                        <option value="center">中</option>
                        <option value="right">右</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 text-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      onClick={() => deleteColumn(cellIndex)}
                      disabled={(rows[0]?.length ?? parsed.width) <= 1}
                      aria-label={`删除第 ${cellIndex + 1} 列`}
                      data-markdown-table-delete-column
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={
                  rowIndex === 0
                    ? "bg-panel-3 font-semibold text-ink-strong"
                    : "even:bg-panel-2/60"
                }
              >
                <th className="sticky left-0 z-[5] w-20 min-w-20 border border-line bg-inherit px-2 py-1 text-left align-top text-[11px] font-medium text-subtle shadow-sm">
                  <div
                    className="flex items-center gap-1"
                    data-markdown-table-row-tools
                  >
                    <span>{rowIndex === 0 ? "表头" : `行 ${rowIndex}`}</span>
                    <button
                      type="button"
                      className="ml-auto rounded px-1 py-0.5 text-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      onClick={() => deleteRow(rowIndex)}
                      disabled={rows.length <= 1}
                      aria-label={`删除第 ${rowIndex + 1} 行`}
                      data-markdown-table-delete-row
                    >
                      ×
                    </button>
                  </div>
                </th>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border border-line p-0 align-top"
                  >
                    <textarea
                      value={cell}
                      className={cn(
                        "block min-h-10 w-full min-w-36 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-ink outline-none focus:bg-primary-soft/30 focus-visible:shadow-[var(--ring)]",
                        markdownTextAlignClass(alignments[cellIndex]),
                      )}
                      rows={1}
                      spellCheck
                      aria-label={`编辑表格单元格 ${rowIndex + 1}-${cellIndex + 1}`}
                      data-markdown-table-cell-input
                      onChange={(event) =>
                        updateCell(
                          rowIndex,
                          cellIndex,
                          normalizeEditableLineBreaks(
                            event.currentTarget.value,
                          ),
                        )
                      }
                      onBlur={(event) =>
                        updateCell(
                          rowIndex,
                          cellIndex,
                          normalizeEditableLineBreaks(
                            event.currentTarget.value,
                          ),
                          true,
                        )
                      }
                      onPaste={(event) => {
                        const text = event.clipboardData.getData("text/plain");
                        if (pasteTableAtCell(rowIndex, cellIndex, text)) {
                          event.preventDefault();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === "Enter"
                        ) {
                          event.preventDefault();
                          updateCell(
                            rowIndex,
                            cellIndex,
                            normalizeEditableLineBreaks(
                              event.currentTarget.value,
                            ),
                            true,
                          );
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarkdownHtmlInlineEditor({
  block,
  onCommit,
}: {
  block: MarkdownBlock;
  onCommit: (raw: string) => void;
}) {
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const [textNodes, setTextNodes] = React.useState<HtmlTextNodeEdit[]>(() =>
    extractHtmlTextNodeEdits(block.raw),
  );
  const interactiveHtml = React.useMemo(
    () => buildEditableHtmlPreview(block.raw, textNodes),
    [block.raw, textNodes],
  );

  React.useEffect(() => {
    setTextNodes(extractHtmlTextNodeEdits(block.raw));
  }, [block.raw]);

  const commitTextNodes = React.useCallback(
    (nextTextNodes: HtmlTextNodeEdit[]) => {
      const next = replaceHtmlTextNodes(block.raw, nextTextNodes);
      if (next !== block.raw) onCommit(next);
    },
    [block.raw, onCommit],
  );

  const syncFromRenderedHtml = React.useCallback(
    (container: HTMLDivElement, shouldCommit = false) => {
      const spans = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-markdown-html-text-node]",
        ),
      );
      setTextNodes((previous) => {
        const nextTextNodes = previous.map((item) => {
          const span = spans.find(
            (candidate) => Number(candidate.dataset.textIndex) === item.index,
          );
          return span
            ? { ...item, value: trimEditablePlainText(span.innerText) }
            : item;
        });
        if (shouldCommit) commitTextNodes(nextTextNodes);
        return nextTextNodes;
      });
    },
    [commitTextNodes],
  );

  return (
    <div
      className="grid gap-2 rounded-md bg-panel-2 p-3 pt-10"
      data-markdown-html-inline-editor
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink-strong">HTML 片段可视编辑</span>
        <span className="min-w-0 flex-1 truncate">
          只把可见文字变成可编辑区；标签属性、脚本和复杂结构请用“源码”。
        </span>
        <Button
          variant="primary"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            if (previewRef.current)
              syncFromRenderedHtml(previewRef.current, true);
            else commitTextNodes(textNodes);
          }}
          data-markdown-html-apply
        >
          应用 HTML
        </Button>
      </div>
      <div
        className="min-h-24 overflow-auto rounded border border-line bg-canvas p-3 text-sm leading-7 text-ink outline-none focus-visible:shadow-[var(--ring)]"
        ref={previewRef}
        role="group"
        aria-label="直接编辑 HTML 渲染文字"
        data-markdown-html-visible-editor
        onBlur={(event) => syncFromRenderedHtml(event.currentTarget, true)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            syncFromRenderedHtml(event.currentTarget, true);
            (event.target as HTMLElement).blur();
          }
        }}
        dangerouslySetInnerHTML={{ __html: interactiveHtml }}
      />
      {textNodes.length ? (
        <div
          className="grid gap-1 text-[11px] text-subtle"
          data-markdown-html-text-node-list
        >
          <span>
            可编辑文字节点：{textNodes.length} 个。按 Ctrl/⌘+Enter
            或离开编辑区保存。
          </span>
        </div>
      ) : (
        <div className="rounded border border-dashed border-line bg-panel px-3 py-2 text-xs text-muted">
          当前 HTML 片段没有可直接编辑的可见文字；请切换块源码。
        </div>
      )}
    </div>
  );
}

interface HtmlTextNodeEdit {
  index: number;
  value: string;
}

function parseHtmlFragment(raw: string): Document {
  return new DOMParser().parseFromString(raw, "text/html");
}

function extractHtmlTextNodeEdits(raw: string): HtmlTextNodeEdit[] {
  const doc = parseHtmlFragment(raw);
  const nodes = collectEditableHtmlTextNodes(doc.body);
  return nodes.map((node, index) => ({ index, value: node.textContent ?? "" }));
}

function buildEditableHtmlPreview(
  raw: string,
  textNodes: HtmlTextNodeEdit[],
): string {
  const doc = parseHtmlFragment(raw);
  const nodes = collectEditableHtmlTextNodes(doc.body);
  nodes.forEach((node, index) => {
    const span = doc.createElement("span");
    span.setAttribute("contenteditable", "plaintext-only");
    span.setAttribute("role", "textbox");
    span.setAttribute("tabindex", "0");
    span.setAttribute("spellcheck", "true");
    span.setAttribute("data-markdown-html-text-node", "true");
    span.setAttribute("data-text-index", String(index));
    span.setAttribute("aria-label", `编辑 HTML 可见文字 ${index + 1}`);
    span.className =
      "rounded px-0.5 outline outline-1 outline-transparent hover:bg-primary-soft focus:bg-primary-soft focus:outline-primary/40";
    span.textContent =
      textNodes.find((item) => item.index === index)?.value ??
      node.textContent ??
      "";
    node.parentNode?.replaceChild(span, node);
  });
  return DOMPurify.sanitize(doc.body.innerHTML, {
    ADD_ATTR: [
      "class",
      "contenteditable",
      "role",
      "tabindex",
      "spellcheck",
      "data-markdown-html-text-node",
      "data-text-index",
      "aria-label",
    ],
  });
}

function replaceHtmlTextNodes(
  raw: string,
  textNodes: HtmlTextNodeEdit[],
): string {
  const doc = parseHtmlFragment(raw);
  const nodes = collectEditableHtmlTextNodes(doc.body);
  nodes.forEach((node, index) => {
    const next = textNodes.find((item) => item.index === index)?.value;
    if (next != null) node.textContent = next;
  });
  return doc.body.innerHTML;
}

function collectEditableHtmlTextNodes(root: ParentNode): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.textContent ?? "";
      if (!value.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("script,style,noscript,template,svg,math"))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function trimEditablePlainText(value: string): string {
  return value.replace(/\n+$/g, "");
}

function parseMarkdownFence(
  raw: string,
  kind: MarkdownBlock["kind"],
): { marker: "```" | "~~~"; info: string; body: string } {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const first = lines[0] ?? "```";
  const marker = first.trim().startsWith("~~~") ? "~~~" : "```";
  const info =
    first.trim().replace(/^(```|~~~)\s*/, "") ||
    (kind === "mermaid" ? "mermaid" : "");
  const lastIndex =
    lines.length > 1 && lines[lines.length - 1].trim().startsWith(marker)
      ? lines.length - 1
      : lines.length;
  return { marker, info, body: lines.slice(1, lastIndex).join("\n") };
}

function buildMarkdownFence(
  marker: "```" | "~~~",
  info: string,
  body: string,
): string {
  return `${marker}${info ? ` ${info}` : ""}\n${normalizeEditableLineBreaks(body)}\n${marker}`;
}

function parseMarkdownTableClipboard(text: string): string[][] {
  const normalized = normalizeEditableLineBreaks(text).replace(/\n+$/g, "");
  if (!normalized) return [];
  const lines = normalized.split("\n");
  if (normalized.includes("\t")) {
    return lines.map((line) => line.split("\t"));
  }
  if (lines.length > 1 && lines.every((line) => isMarkdownTableLine(line))) {
    const rows = lines.map((line) => splitMarkdownTableRow(line));
    const alignmentLineIndex = rows.findIndex(
      (row, index) =>
        index > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())),
    );
    return rows.filter((_row, index) => index !== alignmentLineIndex);
  }
  return [];
}

type MarkdownTableAlignment = "left" | "center" | "right";

function markdownAlignmentFromDelimiter(
  value: string | undefined,
): MarkdownTableAlignment {
  const delimiter = (value || "---").trim();
  if (delimiter.startsWith(":") && delimiter.endsWith(":")) return "center";
  if (delimiter.endsWith(":")) return "right";
  return "left";
}

function markdownDelimiterFromAlignment(value: MarkdownTableAlignment): string {
  if (value === "center") return ":---:";
  if (value === "right") return "---:";
  return ":---";
}

function markdownTextAlignClass(value: string | undefined): string {
  const alignment = markdownAlignmentFromDelimiter(value);
  if (alignment === "center") return "text-center";
  if (alignment === "right") return "text-right";
  return "text-left";
}

function parseMarkdownTable(raw: string): {
  rows: string[][];
  alignments: string[];
  width: number;
} {
  const lines = raw.split("\n").filter((line) => line.trim());
  const rows = lines.map((line) => splitMarkdownTableRow(line));
  const alignmentLineIndex = rows.findIndex(
    (row, index) =>
      index > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())),
  );
  const alignments =
    alignmentLineIndex >= 0
      ? rows[alignmentLineIndex].map((cell) => cell.trim())
      : [];
  const contentRows = rows.filter(
    (_row, index) => index !== alignmentLineIndex,
  );
  const width = Math.max(1, ...contentRows.map((row) => row.length));
  return {
    rows: contentRows.map((row) => normalizeTableRowWidth(row, width)),
    alignments: normalizeTableRowWidth(
      alignments.length
        ? alignments
        : Array.from({ length: width }, () => "---"),
      width,
    ),
    width,
  };
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeTableRowWidth(row: string[], width: number): string[] {
  const next = row.slice(0, width);
  while (next.length < width) next.push("");
  return next;
}

function buildMarkdownTable(rows: string[][], alignments: string[]): string {
  const width = Math.max(
    1,
    ...rows.map((row) => row.length),
    alignments.length,
  );
  const normalizedRows = rows.length
    ? rows.map((row) => normalizeTableRowWidth(row, width))
    : [Array.from({ length: width }, () => "")];
  const normalizedAlignments = normalizeTableRowWidth(
    alignments.length ? alignments : ["---"],
    width,
  ).map((cell) => (/^:?-{3,}:?$/.test(cell) ? cell : "---"));
  const [header, ...body] = normalizedRows;
  return [header, normalizedAlignments, ...body]
    .map((row) => `| ${row.map(escapeMarkdownTableCell).join(" | ")} |`)
    .join("\n");
}

function escapeMarkdownTableCell(value: string): string {
  return String(value ?? "")
    .replace(/\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function MarkdownResourcePicker({
  rootId,
  markdownPath,
  pickerKind,
  onPick,
}: {
  rootId?: string;
  markdownPath: string;
  pickerKind: "image" | "media";
  onPick: (path: string) => void;
}) {
  const initialPath = React.useMemo(
    () => markdownDirectoryPath(markdownPath),
    [markdownPath, rootId],
  );
  const [pickerPath, setPickerPath] = React.useState(initialPath);

  React.useEffect(() => {
    setPickerPath(initialPath);
  }, [initialPath]);

  const browse = useFilesBrowseQuery(
    rootId
      ? {
          rootId,
          path: pickerPath,
          hidden: false,
          page: 1,
          pageSize: 120,
          sortKey: "name",
          sortDirection: "asc",
        }
      : null,
  );

  const entries = browse.data?.entries ?? [];
  const directories = entries
    .filter((entry) => entry.kind === "directory")
    .slice(0, 24);
  const candidates = entries
    .filter((entry) => isMarkdownResourceCandidate(entry, pickerKind))
    .slice(0, 36);
  const parentPath = parentDirectoryPath(pickerPath);

  if (!rootId) {
    return (
      <div
        className="rounded border border-dashed border-line bg-panel px-3 py-2 text-xs text-muted"
        data-markdown-resource-picker
      >
        当前文档没有 root 上下文，只能手动输入 URL 或相对路径。
      </div>
    );
  }

  return (
    <div
      className="grid gap-2 rounded border border-line bg-panel px-3 py-2"
      data-markdown-resource-picker
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-ink-strong">资源选择器</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          {displayMarkdownPickerPath(pickerPath)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setPickerPath(initialPath)}
        >
          文档目录
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={parentPath == null}
          onClick={() => parentPath != null && setPickerPath(parentPath)}
        >
          上级
        </Button>
      </div>
      {browse.isLoading ? (
        <div className="rounded bg-panel-2 px-2 py-3 text-center text-xs text-muted">
          资源列表加载中…
        </div>
      ) : browse.error ? (
        <div className="rounded border border-red/20 bg-red-soft px-2 py-2 text-xs text-red">
          无法读取资源目录：{browse.error.message}
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="grid content-start gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              目录
            </span>
            {directories.length ? (
              directories.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="truncate rounded border border-line bg-panel-2 px-2 py-1.5 text-left text-xs text-muted hover:border-primary-line hover:text-ink-strong"
                  title={entry.path}
                  onClick={() => setPickerPath(entry.path)}
                >
                  {entry.name}
                </button>
              ))
            ) : (
              <span className="rounded bg-panel-2 px-2 py-2 text-xs text-subtle">
                无子目录
              </span>
            )}
          </div>
          <div className="grid content-start gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
              可选{pickerKind === "image" ? "图片" : "媒体"}
            </span>
            {candidates.length ? (
              candidates.map((entry) => {
                const relative = relativePathFromMarkdown(
                  markdownPath,
                  entry.path,
                );
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className="truncate rounded border border-primary/20 bg-primary-soft/50 px-2 py-1.5 text-left text-xs text-primary hover:border-primary hover:bg-primary-soft"
                    title={`${entry.path} → ${relative}`}
                    onClick={() => onPick(relative)}
                  >
                    {entry.name}
                    <span className="ml-2 text-subtle">{relative}</span>
                  </button>
                );
              })
            ) : (
              <span className="rounded bg-panel-2 px-2 py-2 text-xs text-subtle">
                当前目录没有匹配资源
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function HtmlVisualEditor({
  content,
  editable,
  onChange,
  className,
}: {
  content: string;
  editable: boolean;
  onChange: (content: string) => void;
  className?: string;
}) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const keyboardInset = useVisualViewportKeyboardInset(iframeRef);
  const lastWrittenRef = React.useRef(content);

  React.useEffect(() => {
    lastWrittenRef.current = content;
  }, [content]);

  const syncFromFrame = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const next = serializeHtmlDocument(doc);
    if (next && next !== lastWrittenRef.current) {
      lastWrittenRef.current = next;
      onChange(next);
    }
  }, [onChange]);

  const handleLoad = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.designMode = editable ? "on" : "off";
    doc.body?.setAttribute("data-tracevane-html-visual-editor", "true");
    const sync = () => syncFromFrame();
    doc.addEventListener("input", sync);
    doc.addEventListener("keyup", sync);
    doc.addEventListener("paste", () => window.setTimeout(sync, 0));
  }, [editable, syncFromFrame]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded border border-line bg-panel",
        className,
      )}
      data-html-visual-editor-shell
      data-html-visual-keyboard-inset={keyboardInset > 0 ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs text-muted">
        <Code2 className="size-4 shrink-0 text-primary" />
        <span className="shrink-0 font-medium text-ink-strong">
          HTML 预览时编辑
        </span>
        <span className="hidden min-w-0 flex-1 truncate md:block">
          页面保持预览状态；直接点击正文编辑，失焦自动同步。
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={syncFromFrame}
          disabled={!editable}
          data-html-visual-sync
        >
          同步
        </Button>
      </div>
      <iframe
        ref={iframeRef}
        title="HTML visual editor"
        sandbox="allow-same-origin"
        srcDoc={content}
        onLoad={handleLoad}
        onBlur={syncFromFrame}
        className="min-h-0 w-full overflow-auto bg-white"
        style={{
          height: "100%",
          scrollPaddingBottom: keyboardInset ? keyboardInset + 24 : undefined,
        }}
        data-html-visual-frame
      />
    </div>
  );
}

interface MarkdownBlock {
  kind:
    | "heading"
    | "paragraph"
    | "list"
    | "quote"
    | "code"
    | "mermaid"
    | "table"
    | "image"
    | "video"
    | "html"
    | "blank";
  raw: string;
  separatorAfter: string;
}

function parseMarkdownBlocks(value: string): MarkdownBlock[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) return [];
  const lines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const leadingBlankStart = index;
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index > leadingBlankStart && blocks.length === 0) {
      blocks.push({
        kind: "blank",
        raw: lines.slice(leadingBlankStart, index).join("\n"),
        separatorAfter: "",
      });
    }
    if (index >= lines.length) break;

    const start = index;
    const first = lines[index];
    let kind: MarkdownBlock["kind"] = isMarkdownTableStart(lines, index)
      ? "table"
      : classifyMarkdownLine(first);

    if (/^```\s*mermaid\b/i.test(first.trim())) {
      kind = "mermaid";
      index = consumeFence(lines, index);
    } else if (/^```/.test(first.trim()) || /^~~~/.test(first.trim())) {
      kind = "code";
      index = consumeFence(lines, index);
    } else if (kind === "table") {
      index = consumeWhile(lines, index, (line) => isMarkdownTableLine(line));
    } else if (kind === "list") {
      index = consumeWhile(lines, index, (line) =>
        /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line),
      );
    } else if (kind === "quote") {
      index = consumeWhile(lines, index, (line) => /^>\s?/.test(line));
    } else if (kind === "html") {
      index = consumeWhile(
        lines,
        index,
        (line) => line.trim().startsWith("<") || !line.trim(),
      );
    } else {
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        !startsNewMarkdownBlock(lines[index]) &&
        !isMarkdownTableStart(lines, index)
      ) {
        index += 1;
      }
    }

    const raw = lines.slice(start, index).join("\n");
    const blankStart = index;
    while (index < lines.length && !lines[index].trim()) index += 1;
    const blankCount = index - blankStart;
    const separatorAfter =
      blankCount > 0
        ? "\n".repeat(index >= lines.length ? blankCount : blankCount + 1)
        : "";
    blocks.push({ kind, raw, separatorAfter });
  }

  return blocks.filter(
    (block) => block.raw.length > 0 || block.kind === "blank",
  );
}

function joinMarkdownBlocks(blocks: MarkdownBlock[]): string {
  return blocks.map((block) => `${block.raw}${block.separatorAfter}`).join("");
}

function createMarkdownBlock(raw: string): MarkdownBlock {
  return {
    kind: classifyMarkdownLine(raw),
    raw,
    separatorAfter: "\n\n",
  };
}

function classifyMarkdownLine(line: string): MarkdownBlock["kind"] {
  const trimmed = line.trim();
  if (!trimmed) return "blank";
  if (/^#{1,6}\s+/.test(trimmed)) return "heading";
  if (/^!\[[^\]]*\]\([^)]*\)/.test(trimmed)) return "image";
  if (/^<\s*(video|iframe|audio)\b/i.test(trimmed)) return "video";
  if (/^<\s*[a-z][\s\S]*>/i.test(trimmed)) return "html";
  if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) return "list";
  if (/^>\s?/.test(line)) return "quote";
  return "paragraph";
}

function startsNewMarkdownBlock(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s+/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^~~~/.test(trimmed) ||
    /^!\[[^\]]*\]\([^)]*\)/.test(trimmed) ||
    /^<\s*[a-z]/i.test(trimmed) ||
    /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line) ||
    /^>\s?/.test(line)
  );
}

function consumeFence(lines: string[], start: number): number {
  const marker = lines[start].trim().startsWith("~~~") ? "~~~" : "```";
  let index = start + 1;
  while (index < lines.length) {
    if (lines[index].trim().startsWith(marker)) return index + 1;
    index += 1;
  }
  return index;
}

function consumeWhile(
  lines: string[],
  start: number,
  predicate: (line: string) => boolean,
): number {
  let index = start;
  while (index < lines.length && lines[index].trim() && predicate(lines[index]))
    index += 1;
  return index;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return (
    isMarkdownTableLine(lines[index] ?? "") &&
    isMarkdownTableDelimiterLine(lines[index + 1] ?? "")
  );
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.includes("|") && (trimmed.startsWith("|") || /\s\|\s/.test(trimmed))
  );
}

function isMarkdownTableDelimiterLine(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return (
    cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  );
}

export function toggleMarkdownTask(
  raw: string,
  taskIndex: number,
  checked: boolean,
): string {
  let seen = 0;
  return raw
    .split("\n")
    .map((line) => {
      if (!/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/.test(line)) return line;
      if (seen !== taskIndex) {
        seen += 1;
        return line;
      }
      seen += 1;
      return line.replace(
        /^(\s*(?:[-*+]|\d+[.)])\s+\[)[ xX](\]\s+)/,
        `$1${checked ? "x" : " "}$2`,
      );
    })
    .join("\n");
}

export function extractMarkdownResourcePath(raw: string): string {
  const markdownImage = /^!\[[^\]]*\]\(([^)]+)\)/.exec(raw.trim());
  if (markdownImage?.[1]) return markdownImage[1].trim();
  const htmlSource = /\bsrc=(["'])(.*?)\1/i.exec(raw);
  return htmlSource?.[2]?.trim() ?? "";
}

export function replaceMarkdownResourcePath(
  raw: string,
  nextPath: string,
): string {
  if (!nextPath) return raw;
  if (/^!\[[^\]]*\]\(([^)]+)\)/.test(raw.trim())) {
    return raw.replace(/^(!\[[^\]]*\]\()([^)]+)(\))/, `$1${nextPath}$3`);
  }
  if (/\bsrc=(["'])(.*?)\1/i.test(raw)) {
    return raw.replace(/\bsrc=(["'])(.*?)\1/i, (match, quote: string) =>
      match.replace(/=(["'])(.*?)\1/, `=${quote}${nextPath}${quote}`),
    );
  }
  return raw;
}

export function markdownDirectoryPath(markdownPath: string): string {
  const normalized = normalizeResourcePath(markdownPath);
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
}

export function parentDirectoryPath(path: string): string | null {
  const normalized = normalizeResourcePath(path);
  if (!normalized) return null;
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
}

export function relativePathFromMarkdown(
  markdownPath: string,
  targetPath: string,
): string {
  const fromParts = markdownDirectoryPath(markdownPath)
    .split("/")
    .filter(Boolean);
  const toParts = normalizeResourcePath(targetPath).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  const relative = [...fromParts.map(() => ".."), ...toParts].join("/");
  return relative || lastPathSegment(targetPath);
}

export function isMarkdownResourceCandidate(
  entry: FileEntrySummary,
  pickerKind: "image" | "media",
): boolean {
  if (entry.kind !== "file") return false;
  const ext = (entry.ext || lastPathExtension(entry.name))
    .toLowerCase()
    .replace(/^\./, "");
  if (pickerKind === "image")
    return Boolean(entry.imageLike) || MARKDOWN_IMAGE_EXTENSIONS.has(ext);
  return MARKDOWN_MEDIA_EXTENSIONS.has(ext) || Boolean(entry.imageLike);
}

function normalizeResourcePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function displayMarkdownPickerPath(path: string): string {
  return path ? `当前目录：/${path}` : "当前目录：/";
}

function lastPathSegment(path: string): string {
  const normalized = normalizeResourcePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function lastPathExtension(name: string): string {
  const base = lastPathSegment(name);
  const index = base.lastIndexOf(".");
  return index >= 0 ? base.slice(index + 1) : "";
}

const MARKDOWN_IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const MARKDOWN_MEDIA_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
  "mp3",
  "m4a",
  "ogg",
  "oga",
  "wav",
  "flac",
  "aac",
  "mp4",
  "m4v",
  "mov",
  "webm",
  "ogv",
]);

const MARKDOWN_FILE_MANAGER_DRAG_MIME =
  "application/x-tracevane-file-manager-paths";

function resolveMarkdownResourcePreviewUrl(
  value: string,
  rootId: string | undefined,
  markdownPath: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    isExternalMarkdownResource(trimmed) ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  )
    return trimmed;
  if (!rootId) return null;
  const assetPath = resolveMarkdownResourcePath(markdownPath, trimmed);
  const params = new URLSearchParams({ rootId, path: assetPath });
  return `/api/files/download?${params.toString()}`;
}

function isExternalMarkdownResource(value: string): boolean {
  return /^(?:https?:)/i.test(value) || value.startsWith("//");
}

function resolveMarkdownResourcePath(
  markdownPath: string,
  resourcePath: string,
): string {
  if (resourcePath.startsWith("/")) return normalizeResourcePath(resourcePath);
  const base = markdownDirectoryPath(markdownPath);
  const parts = `${base ? `${base}/` : ""}${resourcePath}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function markdownResourcePreviewKind(
  value: string,
  blockKind: MarkdownBlock["kind"],
): "image" | "video" | "audio" | "other" {
  const ext = lastPathExtension(value).toLowerCase();
  if (MARKDOWN_IMAGE_EXTENSIONS.has(ext)) return "image";
  if (["mp4", "m4v", "mov", "webm", "ogv"].includes(ext)) return "video";
  if (["mp3", "m4a", "ogg", "oga", "wav", "flac", "aac"].includes(ext))
    return "audio";
  return blockKind === "image"
    ? "image"
    : blockKind === "video"
      ? "video"
      : "other";
}

function extractMarkdownImageAlt(raw: string): string {
  return /^!\[([^\]]*)\]/.exec(raw.trim())?.[1] ?? "Markdown 资源预览";
}

interface MarkdownListItemEdit {
  marker: string;
  task: boolean;
  checked: boolean;
  text: string;
}

function nextMarkdownListMarker(items: MarkdownListItemEdit[]): string {
  const last = items[items.length - 1];
  if (!last) return "- ";
  const ordered = /^(\s*)(\d+)([.)])\s+$/.exec(last.marker);
  if (ordered) return `${ordered[1]}${Number(ordered[2]) + 1}${ordered[3]} `;
  return last.marker || "- ";
}

function parseMarkdownListItems(raw: string): MarkdownListItemEdit[] {
  return raw.split("\n").map((line) => {
    const match = /^(\s*(?:[-*+]|\d+[.)])\s+)(?:\[([ xX])\]\s+)?(.*)$/.exec(
      line,
    );
    if (!match) {
      return { marker: "- ", task: false, checked: false, text: line };
    }
    return {
      marker: match[1],
      task: match[2] != null,
      checked: /x/i.test(match[2] ?? ""),
      text: match[3] ?? "",
    };
  });
}

function buildMarkdownListItems(items: MarkdownListItemEdit[]): string {
  return items
    .map((item) =>
      `${item.marker}${item.task ? `[${item.checked ? "x" : " "}] ` : ""}${normalizeEditableLineBreaks(item.text).replace(/\n/g, " ")}`.trimEnd(),
    )
    .join("\n");
}

function canEditMarkdownBlockInline(kind: MarkdownBlock["kind"]): boolean {
  return (
    kind === "heading" ||
    kind === "paragraph" ||
    kind === "quote" ||
    kind === "list"
  );
}

function markdownBlockToPlainText(block: MarkdownBlock): string {
  if (block.kind === "heading") return block.raw.replace(/^#{1,6}\s+/, "");
  if (block.kind === "quote")
    return block.raw
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n");
  if (block.kind === "list")
    return block.raw
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, ""))
      .join("\n");
  return block.raw;
}

function markdownBlockFromPlainText(
  block: MarkdownBlock,
  text: string,
): string {
  const normalized = normalizeEditableLineBreaks(text);
  if (block.kind === "heading") {
    const prefix = block.raw.match(/^(#{1,6})\s+/)?.[1] ?? "##";
    return `${prefix} ${normalized.split("\n")[0] ?? ""}`.trimEnd();
  }
  if (block.kind === "quote") {
    return normalized
      .split("\n")
      .map((line) => `> ${line}`.trimEnd())
      .join("\n");
  }
  if (block.kind === "list") {
    const originalLines = block.raw.split("\n");
    return normalized
      .split("\n")
      .map((line, index) => {
        const marker =
          originalLines[index]?.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+))/)?.[1] ??
          "- ";
        return `${marker}${line}`;
      })
      .join("\n");
  }
  return normalized;
}

function normalizeEditableLineBreaks(value: string): string {
  return value.split("\r\n").join("\n").split("\r").join("\n");
}

function markdownBlockLabel(kind: MarkdownBlock["kind"]): string {
  const labels: Record<MarkdownBlock["kind"], string> = {
    heading: "标题",
    paragraph: "正文",
    list: "列表",
    quote: "引用",
    code: "代码",
    mermaid: "图表",
    table: "表格",
    image: "图片",
    video: "媒体",
    html: "HTML",
    blank: "空白",
  };
  return labels[kind];
}

function markdownBlockDescription(block: MarkdownBlock): string {
  if (block.kind === "mermaid") return "Mermaid 图表默认渲染，编辑时展开源码";
  if (block.kind === "image") return "Markdown 图片默认直接预览";
  if (block.kind === "video") return "HTML 媒体块默认直接预览";
  if (block.kind === "code") return "代码块默认高亮预览";
  if (block.kind === "table") return "表格默认渲染预览";
  const firstLine =
    block.raw
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? "空白块";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

function serializeHtmlDocument(doc: Document): string {
  const doctype = doc.doctype ? `<!doctype ${doc.doctype.name}>\n` : "";
  return `${doctype}${doc.documentElement.outerHTML}`;
}

function VisualPreviewLoading() {
  return (
    <div className="grid h-full min-h-40 place-items-center text-xs text-muted">
      <div className="grid justify-items-center gap-2">
        <span className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span>Markdown 实时预览加载中…</span>
      </div>
    </div>
  );
}
