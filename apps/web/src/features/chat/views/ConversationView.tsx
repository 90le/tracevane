import * as React from "react";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  FileText,
  Folder,
  Loader2,
  MessagesSquare,
  Paperclip,
  Send,
  Square,
  User,
  X,
  Wrench,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";
import { useFilesBrowseQuery, useFilesSummaryQuery } from "@/lib/query/files";

import { ToneBadge, formatTime } from "@/features/cli-agents/views/_shared";

import type { ApiError } from "@/lib/api/errors";
import type {
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatFileUploadResponse,
  ChatResourceItem,
  ChatSendFileRef,
  ChatSendRequest,
  ChatSessionPermissions,
  ChatToolCard,
  LiveAssistantTurn,
} from "../types";
import { roleLabel, toolStatusTone } from "../_shared";

function joinPortablePath(parent: string, name: string): string {
  const left = parent.trim().replace(/^\/+|\/+$/g, "");
  const right = name.trim().replace(/^\/+|\/+$/g, "");
  return left ? `${left}/${right}` : right;
}

function parentPortablePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized.includes("/")) return "";
  return normalized.split("/").slice(0, -1).join("/");
}

type ComposerFileRefItem = ChatSendFileRef & {
  status: "uploading" | "ready" | "failed";
  source: "upload" | "workspace";
  error?: string | null;
};

function composerFileSourceLabel(item: ComposerFileRefItem): string {
  if (item.status === "uploading") return "上传中";
  if (item.status === "failed") return "失败";
  return item.source === "workspace" ? "工作区" : "上传";
}

function ToolCallBlock({
  tool,
}: {
  tool: ChatMessageToolCallItem | ChatToolCard;
}) {
  const st = toolStatusTone(tool.status);
  return (
    <div className="grid gap-1 rounded-sm border border-line bg-panel-2 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-panel-3 text-muted [&_svg]:size-3">
          <Wrench />
        </span>
        <span className="truncate font-mono text-sm text-ink-strong">
          {tool.name}
        </span>
        <ToneBadge tone={tool.isError ? "bad" : st.tone}>{st.label}</ToneBadge>
      </div>
      {tool.argsPreview && (
        <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
          {tool.argsPreview}
        </code>
      )}
      {tool.resultPreview && (
        <code
          className={cn(
            "block max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-sm px-2 py-1 font-mono text-xs",
            tool.isError ? "bg-red-soft text-red" : "bg-panel-3 text-muted",
          )}
        >
          {tool.resultPreview}
        </code>
      )}
    </div>
  );
}

function ResourceChip({ resource }: { resource: ChatResourceItem }) {
  const isImage = resource.kind === "image" && resource.status === "ready";
  const href = resource.downloadUrl || resource.url;
  if (isImage) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group block w-fit max-w-[min(420px,80%)] overflow-hidden rounded-md border border-line bg-panel-2"
      >
        <img src={resource.url} alt={resource.fileName} className="max-h-64 w-auto object-contain" />
        <span className="block truncate border-t border-line px-2 py-1 text-xs text-muted group-hover:text-ink">
          {resource.fileName}
        </span>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-[80%] items-center gap-2 rounded-full border border-line bg-panel-2 px-3 py-1 text-sm text-muted hover:border-primary-line hover:text-ink"
    >
      <Paperclip className="size-3.5" />
      <span className="truncate">{resource.fileName}</span>
      {resource.status !== "ready" && <Badge variant="warn">缺失</Badge>}
    </a>
  );
}

function MessageBubble({ message }: { message: ChatMessageItem }) {
  const isUser = message.role === "user";
  const toolCalls = message.toolCalls ?? [];
  const processBlocks = message.processBlocks ?? [];
  const resources = message.resources ?? [];
  return (
    <article className={cn("grid gap-1.5", isUser && "justify-items-end")}>
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        <span className="grid size-4 place-items-center [&_svg]:size-3">
          {isUser ? <User /> : <Bot />}
        </span>
        {roleLabel(message.role)} · {formatTime(message.createdAt)}
        {message.aborted && <Badge variant="bad">已中止</Badge>}
        {message.truncated && <Badge variant="warn">已截断</Badge>}
      </div>

      {processBlocks.length > 0 && (
        <div className="grid w-full max-w-[80%] gap-1">
          {processBlocks.map((block) => (
            <details
              key={block.id}
              className="rounded-sm border border-dashed border-line bg-panel-2 px-2.5 py-1.5 text-sm text-muted"
            >
              <summary className="cursor-pointer select-none text-xs text-subtle">
                {block.kind === "thinking" ? "思考过程" : "推理"}
              </summary>
              <div className="mt-1 whitespace-pre-wrap break-words">
                {block.text}
              </div>
            </details>
          ))}
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-base",
          isUser
            ? "bg-primary-soft text-ink-strong"
            : "border border-line bg-panel text-ink",
        )}
      >
        {message.text ? (
          message.text
        ) : message.omitted ? (
          <span className="italic text-subtle">内容已省略。</span>
        ) : (
          <span className="italic text-subtle">无文本内容。</span>
        )}
      </div>

      {resources.length > 0 && (
        <div className={cn("grid w-full gap-1.5", isUser && "justify-items-end")}>
          {resources.map((resource) => (
            <ResourceChip key={resource.id} resource={resource} />
          ))}
        </div>
      )}

      {toolCalls.length > 0 && (
        <div className="grid w-full max-w-[80%] gap-1.5">
          {toolCalls.map((tool) => (
            <ToolCallBlock key={tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}
    </article>
  );
}

/** Live (streaming) assistant turn assembled from SSE deltas. */
function LiveTurn({ turn }: { turn: LiveAssistantTurn }) {
  return (
    <article className="grid gap-1.5">
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        <span className="grid size-4 place-items-center [&_svg]:size-3">
          <Bot />
        </span>
        Agent
        {!turn.done && (
          <Badge variant="warn">
            <Loader2 className="size-3 animate-spin" />
            流式中
          </Badge>
        )}
        {turn.aborted && <Badge variant="bad">已中止</Badge>}
      </div>
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-md border border-line bg-panel px-3 py-2 text-base text-ink">
        {turn.text || (
          <span className="italic text-subtle">等待 Agent 响应…</span>
        )}
        {!turn.done && turn.text && (
          <span className="ml-0.5 animate-pulse">▋</span>
        )}
      </div>
      {turn.toolCards.length > 0 && (
        <div className="grid w-full max-w-[80%] gap-1.5">
          {turn.toolCards.map((tool) => (
            <ToolCallBlock key={tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}
      {turn.error && (
        <div className="flex max-w-[80%] items-center gap-2 rounded-sm border border-red bg-red-soft px-3 py-2 text-sm text-red">
          <AlertTriangle className="size-4 shrink-0" />
          流式出错：{turn.error}
        </div>
      )}
    </article>
  );
}

/**
 * Center column: the conversation. Renders the authoritative history (with
 * tool-call blocks, reasoning, abort/truncate markers) plus the live streaming
 * assistant turn while a run is active, and a composer that owns send / abort.
 */
export function ConversationView({
  sessionKey,
  messages,
  permissions,
  isLoading,
  error,
  liveTurn,
  streaming,
  streamError,
  sending,
  uploading,
  sendDisabledReason,
  onSend,
  onUploadFile,
  onAbort,
  onRetry,
}: {
  sessionKey: string | null;
  messages: ChatMessageItem[];
  permissions: ChatSessionPermissions | null;
  isLoading: boolean;
  error: ApiError | null;
  liveTurn: LiveAssistantTurn | null;
  streaming: boolean;
  streamError: string | null;
  sending: boolean;
  uploading: boolean;
  /** Non-null when send is unavailable — shown as a disabled hint. */
  sendDisabledReason: string | null;
  onSend: (payload: ChatSendRequest) => void;
  onUploadFile: (file: File) => Promise<ChatFileUploadResponse>;
  onAbort: () => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [fileRefs, setFileRefs] = React.useState<ComposerFileRefItem[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [workspacePickerOpen, setWorkspacePickerOpen] = React.useState(false);
  const [workspacePickerDir, setWorkspacePickerDir] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cancelledUploadIdsRef = React.useRef(new Set<string>());
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const filesSummary = useFilesSummaryQuery({ enabled: workspacePickerOpen });
  const workspaceRootId = React.useMemo(() => {
    const roots = filesSummary.data?.roots ?? [];
    return roots.find((root) => root.id === "project-root")?.id ?? filesSummary.data?.defaultRootId ?? null;
  }, [filesSummary.data]);
  const workspaceBrowse = useFilesBrowseQuery(
    workspacePickerOpen && workspaceRootId
      ? {
        rootId: workspaceRootId,
        path: workspacePickerDir,
        hidden: false,
        page: 1,
        pageSize: 80,
        sortKey: "name",
        sortDirection: "asc",
      }
      : null,
  );

  React.useEffect(() => {
    setDraft("");
    setFileRefs([]);
    setUploadError(null);
    setWorkspacePickerOpen(false);
    setWorkspacePickerDir("");
    cancelledUploadIdsRef.current.clear();
  }, [sessionKey]);

  // Keep the transcript pinned to the bottom as content / stream grows.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, liveTurn?.text, liveTurn?.toolCards.length, sessionKey]);

  const canSend = !sendDisabledReason;
  const readyFileRefs = React.useMemo(
    () => fileRefs.filter((item) => item.status === "ready").map(({ status: _status, source: _source, error: _error, ...ref }) => ref),
    [fileRefs],
  );
  const hasPendingFileRefs = fileRefs.some((item) => item.status === "uploading");
  const hasFailedFileRefs = fileRefs.some((item) => item.status === "failed");
  const hasPayload = Boolean(draft.trim() || readyFileRefs.length);

  const submit = () => {
    const text = draft.trim();
    if (!hasPayload || !canSend || sending || uploading || hasPendingFileRefs || hasFailedFileRefs) return;
    onSend({ text, fileRefs: readyFileRefs.length ? readyFileRefs : undefined });
    setDraft("");
    setFileRefs([]);
    setUploadError(null);
    setWorkspacePickerOpen(false);
    setWorkspacePickerDir("");
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!sessionKey || !canSend) return;
    const selected = Array.from(files).filter((file) => file.size >= 0);
    if (!selected.length) return;
    setUploadError(null);

    await Promise.all(selected.map(async (file) => {
      const pendingId = `uploading:${crypto.randomUUID()}`;
      const pendingItem: ComposerFileRefItem = {
        id: pendingId,
        relativePath: file.name,
        resourceRef: pendingId,
        fileName: file.name,
        kind: "file",
        mimeType: file.type || null,
        status: "uploading",
        source: "upload",
      };
      setFileRefs((prev) => [...prev, pendingItem]);
      try {
        const item = await onUploadFile(file);
        if (cancelledUploadIdsRef.current.has(pendingId)) {
          cancelledUploadIdsRef.current.delete(pendingId);
          return;
        }
        const readyItem: ComposerFileRefItem = {
          id: item.resource.id,
          relativePath: item.relativePath,
          resourceRef: item.resourceRef,
          fileName: item.fileName,
          kind: item.kind,
          mimeType: item.mimeType,
          status: "ready",
          source: "upload",
        };
        setFileRefs((prev) => prev.map((entry) => (entry.id === pendingId ? readyItem : entry)));
      } catch (error) {
        if (cancelledUploadIdsRef.current.has(pendingId)) {
          cancelledUploadIdsRef.current.delete(pendingId);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setUploadError(message);
        setFileRefs((prev) => prev.map((entry) => (
          entry.id === pendingId
            ? { ...entry, status: "failed", error: message }
            : entry
        )));
      }
    }));

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const attachWorkspaceFile = (filePath: string, fileName: string) => {
    const resourceRef = `workspace:${filePath}`;
    setFileRefs((prev) => {
      if (prev.some((item) => item.resourceRef === resourceRef)) return prev;
      return [
        ...prev,
        {
          id: resourceRef,
          relativePath: filePath,
          resourceRef,
          fileName,
          kind: "file",
          mimeType: null,
          status: "ready",
          source: "workspace",
        },
      ];
    });
    setWorkspacePickerOpen(false);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-4">
        {!sessionKey ? (
          <EmptyState
            icon={<MessagesSquare />}
            title="选择一个会话"
            description="从左侧会话列表选择，或通过 IM / Workspace / CLI 创建新的 Agent 会话。"
          />
        ) : isLoading ? (
          <div className="grid gap-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <ErrorState
            title="无法加载会话历史"
            description={error.message}
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            }
          />
        ) : messages.length === 0 && !liveTurn ? (
          <EmptyState
            icon={<MessagesSquare />}
            title="该会话暂无消息"
            description="发送一条消息以开始一次 Agent 运行。"
          />
        ) : (
          <div className="grid gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {liveTurn && <LiveTurn turn={liveTurn} />}
          </div>
        )}
      </div>

      {/* Composer / run controls */}
      <div className="border-t border-line bg-panel px-4 py-3">
        {streamError && (
          <div className="mb-2 flex items-center gap-2 rounded-sm border border-red bg-red-soft px-2.5 py-1.5 text-sm text-red">
            <AlertTriangle className="size-3.5 shrink-0" />
            事件流连接出错：{streamError}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-composer-file-input hidden"
          onChange={(event) => void uploadFiles(event.target.files ?? [])}
        />
        {fileRefs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {fileRefs.map((file) => (
              <span
                key={file.id}
                className={cn(
                  "chat-composer-pool-item chat-composer-attachment inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  file.status === "failed"
                    ? "failed border-red bg-red-soft text-red"
                    : file.status === "uploading"
                      ? "uploading border-orange bg-orange-soft text-orange"
                      : "ready border-line bg-panel-2 text-muted",
                )}
                title={file.status === "failed" ? file.error || "文件上传失败" : file.relativePath}
              >
                {file.status === "uploading" ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />}
                <span className="rounded-full bg-panel px-1.5 py-0.5 text-[10px] text-subtle">{composerFileSourceLabel(file)}</span>
                <span className="max-w-56 truncate">{file.fileName}</span>
                {file.status === "failed" && file.error && (
                  <span className="max-w-48 truncate text-[11px]">{file.error}</span>
                )}
                <button
                  type="button"
                  className="chat-composer-attachment-remove rounded-full p-0.5 text-subtle hover:bg-panel-3 hover:text-ink"
                  aria-label={`移除 ${file.fileName}`}
                  onClick={() => {
                    if (file.status === "uploading") cancelledUploadIdsRef.current.add(file.id);
                    setFileRefs((prev) => prev.filter((item) => item.id !== file.id));
                    if (file.status === "failed") setUploadError(null);
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {uploadError && (
          <div className="mb-2 flex items-center gap-2 rounded-sm border border-red bg-red-soft px-2.5 py-1.5 text-sm text-red">
            <AlertTriangle className="size-3.5 shrink-0" />
            文件上传失败：{uploadError}
          </div>
        )}
        {workspacePickerOpen && (
          <div className="mb-2 overflow-hidden rounded-md border border-line bg-panel-2">
            <div className="flex items-center gap-1 border-b border-line px-2.5 py-2 text-xs text-muted">
              <Folder className="size-3.5" />
              <button type="button" className="font-medium text-ink hover:text-primary" onClick={() => setWorkspacePickerDir("")}>项目文件</button>
              {workspacePickerDir && (
                <>
                  <ChevronRight className="size-3" />
                  <span className="truncate">{workspacePickerDir}</span>
                </>
              )}
              <span className="flex-1" />
              {workspacePickerDir && (
                <Button variant="ghost" size="sm" onClick={() => setWorkspacePickerDir(parentPortablePath(workspacePickerDir))}>上一级</Button>
              )}
            </div>
            <div className="max-h-56 overflow-auto p-1.5">
              {filesSummary.isLoading || workspaceBrowse.isLoading ? (
                <div className="grid gap-2 p-2"><SkeletonRow /><SkeletonRow /></div>
              ) : filesSummary.error || workspaceBrowse.error ? (
                <div className="p-2 text-sm text-red">文件列表加载失败：{(filesSummary.error || workspaceBrowse.error)?.message}</div>
              ) : !workspaceBrowse.data?.entries.length ? (
                <div className="p-2 text-sm text-muted">当前目录没有可附加的文件。</div>
              ) : (
                <div className="grid gap-1">
                  {workspaceBrowse.data.entries.map((entry) => {
                    const nextPath = joinPortablePath(workspacePickerDir, entry.name);
                    if (entry.kind === "directory") {
                      return (
                        <button
                          key={`dir:${nextPath}`}
                          type="button"
                          className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink hover:bg-panel-3"
                          onClick={() => setWorkspacePickerDir(nextPath)}
                        >
                          <Folder className="size-4 shrink-0 text-muted" />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={`file:${nextPath}`}
                        type="button"
                        className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink hover:bg-primary-soft"
                        onClick={() => attachWorkspaceFile(nextPath, entry.name)}
                      >
                        <FileText className="size-4 shrink-0 text-muted" />
                        <span className="truncate">{entry.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-subtle">{entry.size == null ? "" : `${entry.size} B`}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-line px-2.5 py-1.5 text-xs text-subtle">
              附加文件会作为结构化 fileRef 传给当前 Agent；同时保留 @path 文本提示兼容，默认面向项目工作目录。
            </div>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!sessionKey || !canSend || sending}
          placeholder={
            sendDisabledReason ?? "输入消息… (Ctrl/Cmd + Enter 发送)"
          }
          aria-label="消息输入"
          className={cn(
            "chat-composer-editor h-16 w-full resize-none rounded-md border border-line bg-panel-2 px-3 py-2 text-base text-ink-strong outline-none transition-[border-color,box-shadow]",
            "placeholder:text-subtle focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!sessionKey || !canSend || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            {uploading ? "上传中…" : "上传文件"}
          </Button>
          <Button
            variant={workspacePickerOpen ? "outline" : "ghost"}
            size="sm"
            disabled={!sessionKey || !canSend}
            onClick={() => setWorkspacePickerOpen((open) => !open)}
          >
            <FileText />
            @ 工作区文件
          </Button>
          <span className="flex-1" />
          {streaming && !liveTurn?.done && (
            <Button
              variant="outline"
              size="sm"
              className="text-red hover:bg-red-soft"
              onClick={onAbort}
            >
              <Square />
              中止
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            className="chat-composer-send"
            disabled={!sessionKey || !canSend || sending || uploading || hasPendingFileRefs || hasFailedFileRefs || !hasPayload}
            onClick={submit}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? "发送中…" : "发送"}
          </Button>
        </div>
        {permissions && !permissions.canSend && (
          <p className="mt-1.5 text-xs text-subtle">
            该会话当前不可写——发送已被后端策略锁定。
          </p>
        )}
      </div>
    </section>
  );
}

export default ConversationView;
