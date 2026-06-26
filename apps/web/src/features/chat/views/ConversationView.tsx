import * as React from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  FileText,
  Folder,
  Eye,
  Loader2,
  MessagesSquare,
  Paperclip,
  Send,
  Square,
  User,
  X,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";
import { useFileReadQuery, useFilesBrowseQuery, useFilesSummaryQuery } from "@/lib/query/files";
import { deriveChatDisplayMessage, type ChatDisplayBlock, type ChatDisplayParagraphSegment } from "../../../../../../lib/chat-display";
import { buildTracevaneFilesResourceRef, parseTracevaneFilesResourceRef } from "../../../../../../lib/tracevane-resource-refs";

import { ToneBadge, formatTime } from "@/features/cli-agents/views/_shared";

import type { ApiError } from "@/lib/api/errors";
import type {
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatPermissionRequestCard,
  ChatProcessBlock,
  ChatFileCapability,
  ChatFileUploadResponse,
  ChatResourceItem,
  ChatSendFileRef,
  ChatSendRequest,
  ChatSessionPermissions,
  ChatSideResult,
  ChatToolCard,
  LiveAssistantTurn,
} from "../types";
import { roleLabel, toolStatusTone } from "../_shared";
import "./chat-message-markdown.css";

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



async function renderChatMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown);
  return DOMPurify.sanitize(String(file), {
    ADD_ATTR: ["class", "target", "rel", "controls", "loading", "decoding", "playsinline", "preload"],
  });
}

function ChatMarkdownContent({ source, streaming = false }: { source: string; streaming?: boolean }) {
  const articleRef = React.useRef<HTMLElement | null>(null);
  const [html, setHtml] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const markdown = source.trim();
    if (!markdown) {
      setHtml("");
      setError(null);
      return;
    }
    let cancelled = false;
    const delay = streaming ? 120 : 0;
    const timer = window.setTimeout(() => {
      renderChatMarkdown(markdown)
        .then((clean) => {
          if (cancelled) return;
          setHtml(clean);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setHtml("");
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, streaming]);

  React.useEffect(() => {
    const node = articleRef.current;
    if (!node || error) return;
    node.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    });
    node.querySelectorAll<HTMLElement>("pre code:not([data-highlighted])").forEach((block) => {
      try {
        hljs.highlightElement(block);
      } catch {
        // Unknown languages should not break Chat rendering.
      }
      block.setAttribute("data-highlighted", "1");
    });
  }, [html, error]);

  if (error) {
    return <span className="whitespace-pre-wrap break-words">{source}</span>;
  }

  if (!html && source.trim()) {
    return <span className="whitespace-pre-wrap break-words">{source}</span>;
  }

  return (
    <article
      ref={articleRef as React.RefObject<HTMLElement>}
      className="chat-message-markdown min-w-0 max-w-none overflow-x-auto p-0 text-[0.95rem] leading-7"
      dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
    />
  );
}

function previewLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
}

function prettyPreview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return value;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function isJsonPreview(value: string): boolean {
  const trimmed = value.trim();
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function ToolPreviewBlock({
  label,
  value,
  tone = "neutral",
  render = "code",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "error";
  render?: "code" | "markdown";
}) {
  const jsonLike = isJsonPreview(value);
  const shouldRenderMarkdown = render === "markdown" && !jsonLike;
  return (
    <details className="group rounded-sm border border-line/80 bg-panel/70" open={tone === "error"}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-subtle marker:hidden">
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
        <span>{label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-muted">{previewLabel(value)}</span>
      </summary>
      {shouldRenderMarkdown ? (
        <div
          className={cn(
            "max-h-72 overflow-auto border-t border-line px-3 py-2",
            tone === "error" ? "bg-red-soft/55 text-red" : "bg-panel-3/55 text-ink",
          )}
        >
          <ChatMarkdownContent source={value} />
        </div>
      ) : (
        <code
          className={cn(
            "block max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-line px-3 py-2 font-mono text-xs leading-5",
            tone === "error" ? "bg-red-soft text-red" : "bg-panel-3/70 text-muted",
          )}
        >
          {prettyPreview(value)}
        </code>
      )}
    </details>
  );
}

const FALLBACK_CHAT_FILE_CAPABILITY: ChatFileCapability = {
  browseEndpoint: "/api/files/browse",
  uploadEndpoint: "/api/files/uploads/*",
  readEndpoint: "/api/files/read",
  downloadEndpoint: "/api/files/download",
  resourceRef: "files:<rootId>:<path>",
  legacyRefsReadOnly: ["workspace:", "uploads:"],
};

type ComposerFileRefItem = ChatSendFileRef & {
  status: "uploading" | "ready" | "failed";
  source: "upload" | "workspace" | "files";
  previewUrl?: string | null;
  downloadUrl?: string | null;
  error?: string | null;
};

function composerFileSourceLabel(item: ComposerFileRefItem): string {
  if (item.status === "uploading") return "上传中";
  if (item.status === "failed") return "失败";
  if (item.source === "workspace") return "工作区";
  if (item.source === "files") return "文件";
  return "上传";
}

function buildFilesDownloadUrl(rootId: string, filePath: string, attachment = false): string {
  const query = new URLSearchParams({
    rootId,
    path: filePath,
  });
  if (attachment) query.set("download", "true");
  return `/api/files/download?${query.toString()}`;
}

function inferComposerAttachmentKind(fileName: string, mimeType?: string | null): ChatResourceItem["kind"] {
  const mime = mimeType || "";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(fileName)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(fileName)) return "video";
  return "file";
}

function canInlinePreviewAttachment(item: ComposerFileRefItem): boolean {
  return item.kind === "image" || item.kind === "video" || /^(application\/pdf|text\/|application\/json)/i.test(item.mimeType || "");
}

function canReadPreviewAttachment(item: ComposerFileRefItem | null): boolean {
  if (!item || item.kind !== "file") return false;
  return /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|typescript))/i.test(item.mimeType || "")
    || /\.(md|markdown|txt|json|jsonl|yaml|yml|toml|ini|csv|ts|tsx|js|jsx|mjs|cjs|css|html|xml|py|go|rs|java|kt|sh|bash|zsh)$/i.test(item.fileName);
}

function parseFilesResourceRef(value: string | null | undefined): { rootId: string; path: string } | null {
  const parsed = parseTracevaneFilesResourceRef(value);
  return parsed ? { rootId: parsed.rootId, path: parsed.path } : null;
}

function resolveComposerFilesRef(item: ComposerFileRefItem | null): { rootId: string; path: string } | null {
  if (!item) return null;
  const parsed = parseFilesResourceRef(item.resourceRef);
  if (parsed) return parsed;
  const rootId = item.rootId?.trim();
  const filePath = item.relativePath?.trim();
  return rootId && filePath ? { rootId, path: filePath.replace(/\\/g, "/").replace(/^\.\/+/, "") } : null;
}

function composerFileRefFromMessageResource(resource: ChatResourceItem): ComposerFileRefItem {
  const parsedFilesRef = parseFilesResourceRef(resource.resourceRef || resource.originalPath);
  const rootId = parsedFilesRef?.rootId ?? null;
  const relativePath = parsedFilesRef?.path
    ?? resource.relativePath?.trim().replace(/\\/g, "/").replace(/^\.\/+/, "")
    ?? resource.fileName;
  const resourceRef = parsedFilesRef
    ? buildTracevaneFilesResourceRef(parsedFilesRef.rootId, parsedFilesRef.path) || resource.originalPath
    : resource.resourceRef || resource.originalPath || resource.relativePath || resource.downloadUrl || resource.url;
  return {
    id: resource.id,
    rootId,
    relativePath,
    resourceRef,
    fileName: resource.fileName,
    kind: resource.kind,
    mimeType: resource.mimeType,
    previewUrl: resource.url,
    downloadUrl: resource.downloadUrl,
    status: resource.status === "ready" ? "ready" : "failed",
    source: parsedFilesRef ? "files" : "workspace",
    error: resource.status === "ready" ? null : "资源缺失，无法预览",
  };
}

const COMPOSER_DRAFT_PREFIX = "tracevane.chat.composer-draft:";

type PersistedComposerFileRef = Omit<ComposerFileRefItem, "status" | "error">;

interface PersistedComposerDraft {
  version: 2;
  updatedAt: string;
  text: string;
  fileRefs: PersistedComposerFileRef[];
}

function composerDraftStorageKey(sessionKey: string): string {
  return `${COMPOSER_DRAFT_PREFIX}${sessionKey}`;
}

function parsePersistedComposerDraft(raw: string | null): PersistedComposerDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedComposerDraft>;
    if (parsed.version !== 2) return null;
    const text = typeof parsed.text === "string" ? parsed.text : "";
    const fileRefs = Array.isArray(parsed.fileRefs)
      ? parsed.fileRefs.filter((item): item is PersistedComposerFileRef => (
        Boolean(item)
        && typeof item.id === "string"
        && typeof item.relativePath === "string"
        && typeof item.fileName === "string"
        && (item.kind === "file" || item.kind === "image" || item.kind === "video")
      ))
      : [];
    if (!text.trim() && fileRefs.length === 0) return null;
    return {
      version: 2,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      text,
      fileRefs,
    };
  } catch {
    return null;
  }
}

function buildPersistedComposerDraft(text: string, fileRefs: ComposerFileRefItem[]): PersistedComposerDraft | null {
  const readyFileRefs: PersistedComposerFileRef[] = fileRefs
    .filter((item) => item.status === "ready")
    .map(({ status: _status, error: _error, ...item }) => item);
  if (!text.trim() && readyFileRefs.length === 0) return null;
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    text,
    fileRefs: readyFileRefs,
  };
}

function permissionTone(status: ChatPermissionRequestCard["status"]): "ok" | "warn" | "bad" | "info" | "mute" {
  if (status === "allowed") return "ok";
  if (status === "pending") return "warn";
  return "bad";
}

function permissionLabel(status: ChatPermissionRequestCard["status"]): string {
  switch (status) {
    case "pending": return "等待审批";
    case "allowed": return "已允许";
    case "denied": return "已拒绝";
    case "timed-out": return "已超时";
    case "failed": return "失败";
    default: return status;
  }
}

function PermissionRequestBlock({
  permission,
  resolving,
  onResolve,
}: {
  permission: ChatPermissionRequestCard;
  resolving?: boolean;
  onResolve?: (permission: ChatPermissionRequestCard, decision: "allow" | "deny") => void;
}) {
  const pending = permission.status === "pending";
  return (
    <div className="grid gap-2 rounded-sm border border-amber/40 bg-amber-soft/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-panel text-amber [&_svg]:size-3.5">
          <ShieldCheck />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-ink-strong">
          工具审批 · {permission.toolName}
        </span>
        <ToneBadge tone={permissionTone(permission.status)}>{permissionLabel(permission.status)}</ToneBadge>
      </div>
      {permission.inputPreview && (
        <code className="block max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-panel px-2 py-1 font-mono text-xs text-muted">
          {permission.inputPreview}
        </code>
      )}
      {permission.message && <p className="text-xs text-muted">{permission.message}</p>}
      {pending && onResolve && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={resolving}
            onClick={() => onResolve(permission, "deny")}
          >
            <X className="size-3.5" />
            拒绝
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={resolving}
            onClick={() => onResolve(permission, "allow")}
          >
            <Check className="size-3.5" />
            允许
          </Button>
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({
  tool,
}: {
  tool: ChatMessageToolCallItem | ChatToolCard;
}) {
  const st = toolStatusTone(tool.status);
  const running = tool.status === "running";
  return (
    <div className={cn(
      "grid gap-2 rounded-md border px-3 py-2.5 shadow-sm",
      tool.isError ? "border-red/40 bg-red-soft/45" : running ? "border-primary-line bg-primary-soft/35" : "border-line bg-panel-2",
    )}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn(
          "grid size-7 shrink-0 place-items-center rounded-[8px] [&_svg]:size-3.5",
          running ? "bg-primary-soft text-primary" : tool.isError ? "bg-red-soft text-red" : "bg-panel-3 text-muted",
        )}>
          {running ? <Loader2 className="animate-spin" /> : <Wrench />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-sm font-semibold text-ink-strong">
              {tool.name}
            </span>
            <ToneBadge tone={tool.isError ? "bad" : st.tone}>{st.label}</ToneBadge>
          </div>
          <div className="text-xs text-subtle">
            {running ? "工具正在执行，结果会流式更新。" : tool.isError ? "工具执行失败。" : "工具执行完成。"}
          </div>
        </div>
      </div>
      {tool.argsPreview && <ToolPreviewBlock label="输入参数" value={tool.argsPreview} render="code" />}
      {tool.resultPreview && (
        <ToolPreviewBlock
          label={tool.isError ? "错误输出" : "执行结果"}
          value={tool.resultPreview}
          tone={tool.isError ? "error" : "neutral"}
          render="markdown"
        />
      )}
      {tool.artifacts && tool.artifacts.length > 0 && <ToolArtifactsBlock artifacts={tool.artifacts} />}
    </div>
  );
}

function ToolArtifactsBlock({ artifacts }: { artifacts: NonNullable<(ChatMessageToolCallItem | ChatToolCard)["artifacts"]> }) {
  return (
    <div className="grid gap-1.5 rounded-sm border border-line/80 bg-panel/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-subtle">
        <Paperclip className="size-3.5" />
        工具产物 · {artifacts.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {artifacts.map((artifact) => (
          <ResourceChip key={artifact.id} resource={artifact} display="inline-chip" />
        ))}
      </div>
    </div>
  );
}

function ResourceChip({
  resource,
  display = "card",
  onPreview,
}: {
  resource: ChatResourceItem;
  display?: "card" | "inline-image" | "inline-video" | "inline-chip" | "break-image" | "break-video" | "break-chip";
  onPreview?: (resource: ChatResourceItem) => void;
}) {
  const href = resource.downloadUrl || resource.url;
  const isBreak = display.startsWith("break-") || display === "card";
  const compact = display === "inline-chip" || display === "break-chip";
  const canPreview = Boolean(onPreview && resource.status === "ready" && href);

  if (resource.kind === "image" && resource.status === "ready" && !compact) {
    return (
      <span
        className={cn(
          "group overflow-hidden rounded-md border border-line bg-panel-2 align-middle",
          isBreak ? "block w-fit max-w-[min(420px,80%)]" : "mx-1 inline-block max-w-[220px]",
        )}
      >
        <a href={href} target="_blank" rel="noreferrer" className="block">
          <img
            src={resource.url}
            alt={resource.fileName}
            className={cn(isBreak ? "max-h-64" : "max-h-28", "w-auto object-contain")}
          />
        </a>
        <span className="flex min-w-0 items-center gap-2 border-t border-line px-2 py-1 text-xs text-muted group-hover:text-ink">
          <span className="truncate">{resource.fileName}</span>
          {canPreview && (
            <button
              type="button"
              className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-primary hover:bg-primary-soft"
              onClick={() => onPreview?.(resource)}
            >
              预览
            </button>
          )}
        </span>
      </span>
    );
  }

  if (resource.kind === "video" && resource.status === "ready" && !compact) {
    return (
      <span
        className={cn(
          "group overflow-hidden rounded-md border border-line bg-panel-2 align-middle",
          isBreak ? "block w-fit max-w-[min(480px,90%)]" : "mx-1 inline-block max-w-[260px]",
        )}
      >
        <video src={resource.url} controls className={cn(isBreak ? "max-h-64" : "max-h-32", "w-auto max-w-full")} />
        <span className="flex min-w-0 items-center gap-2 border-t border-line px-2 py-1 text-xs text-muted group-hover:text-ink">
          <a href={href} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-primary">
            {resource.fileName}
          </a>
          {canPreview && (
            <button
              type="button"
              className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-primary hover:bg-primary-soft"
              onClick={() => onPreview?.(resource)}
            >
              预览
            </button>
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-panel-2 px-3 py-1 text-sm text-muted align-middle hover:border-primary-line hover:text-ink",
        isBreak ? "max-w-[80%]" : "mx-1 max-w-[240px]",
      )}
    >
      <Paperclip className="size-3.5 shrink-0" />
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate hover:text-primary"
      >
        {resource.fileName}
      </a>
      {canPreview && (
        <button
          type="button"
          className="shrink-0 rounded-full px-1 py-0.5 text-[11px] text-primary hover:bg-primary-soft"
          aria-label={`预览 ${resource.fileName}`}
          onClick={() => onPreview?.(resource)}
        >
          预览
        </button>
      )}
      {resource.status !== "ready" && <Badge variant="warn">缺失</Badge>}
    </span>
  );
}

function InlineDisplaySegment({
  segment,
  onPreviewResource,
}: {
  segment: ChatDisplayParagraphSegment;
  onPreviewResource?: (resource: ChatResourceItem) => void;
}) {
  if (segment.type === "text") {
    return <span className="whitespace-pre-wrap break-words">{segment.text}</span>;
  }
  return <ResourceChip resource={segment.item} display={segment.display} onPreview={onPreviewResource} />;
}

function DisplayBlockView({
  block,
  onPreviewResource,
}: {
  block: ChatDisplayBlock;
  onPreviewResource?: (resource: ChatResourceItem) => void;
}) {
  if (block.type === "markdown") {
    return <ChatMarkdownContent source={block.markdownSource} />;
  }

  if (block.type === "resource") {
    return <ResourceChip resource={block.item} display="card" onPreview={onPreviewResource} />;
  }

  return (
    <div className="grid gap-1.5">
      {block.runs.map((run, index) => (
        run.type === "break-run" ? (
          <ResourceChip
            key={`${run.segment.item.id}:${index}`}
            resource={run.segment.item}
            display={run.segment.display}
            onPreview={onPreviewResource}
          />
        ) : (
          <p key={`inline:${index}`} className="m-0 whitespace-pre-wrap break-words">
            {run.segments.map((segment, segmentIndex) => (
              <InlineDisplaySegment
                key={segment.type === "resource" ? `${segment.item.id}:${segmentIndex}` : `text:${segmentIndex}`}
                segment={segment}
                onPreviewResource={onPreviewResource}
              />
            ))}
          </p>
        )
      ))}
    </div>
  );
}

function SideResultBlock({ result }: { result: ChatSideResult }) {
  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-sm border px-3 py-2 text-sm",
        result.isError ? "border-red/40 bg-red-soft/50 text-red" : "border-primary-line bg-primary-soft/30 text-ink",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-subtle">
        <MessagesSquare className="size-3.5 shrink-0" />
        <span className="truncate">旁路回复 · {result.question}</span>
      </div>
      <ChatMarkdownContent source={result.text} />
    </div>
  );
}

function ProcessBlockView({ block }: { block: ChatProcessBlock }) {
  const title = block.kind === "thinking" ? "思考过程" : "推理摘要";
  return (
    <details className="group rounded-sm border border-dashed border-line bg-panel-2 px-2.5 py-1.5 text-sm text-muted">
      <summary className="flex cursor-pointer select-none items-center gap-2 text-xs text-subtle marker:hidden">
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
        <span>{title}</span>
        <span className="min-w-0 flex-1 truncate text-[11px]">{previewLabel(block.text)}</span>
        <span className="rounded-full bg-panel px-1.5 py-0.5 text-[10px] text-muted">{block.text.length} 字</span>
      </summary>
      <div className="mt-2 max-h-72 overflow-auto border-t border-line/70 pt-2 text-ink">
        <ChatMarkdownContent source={block.text} />
      </div>
    </details>
  );
}

function MessageBubble({
  message,
  onPreviewResource,
}: {
  message: ChatMessageItem;
  onPreviewResource?: (resource: ChatResourceItem) => void;
}) {
  const isUser = message.role === "user";
  const display = deriveChatDisplayMessage(message);
  const toolCalls = message.toolCalls ?? [];
  const processBlocks = message.processBlocks ?? [];
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
            <ProcessBlockView key={block.id} block={block} />
          ))}
        </div>
      )}

      {display.blocks.length > 0 ? (
        <div
          className={cn(
            "grid max-w-[80%] gap-2 rounded-md px-3 py-2 text-base",
            isUser
              ? "bg-primary-soft text-ink-strong"
              : "border border-line bg-panel text-ink",
          )}
        >
          {display.blocks.map((block, index) => (
            <DisplayBlockView
              key={`${block.type}:${index}`}
              block={block}
              onPreviewResource={onPreviewResource}
            />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "max-w-[80%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-base",
            isUser
              ? "bg-primary-soft text-ink-strong"
              : "border border-line bg-panel text-ink",
          )}
        >
          {message.omitted ? (
            <span className="italic text-subtle">内容已省略。</span>
          ) : (
            <span className="italic text-subtle">无文本内容。</span>
          )}
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
function LiveTurn({
  turn,
  resolvingPermission,
  onResolvePermission,
}: {
  turn: LiveAssistantTurn;
  resolvingPermission?: boolean;
  onResolvePermission?: (permission: ChatPermissionRequestCard, decision: "allow" | "deny") => void;
}) {
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
      <div className="max-w-[80%] min-w-0 rounded-md border border-line bg-panel px-3 py-2 text-base text-ink">
        {turn.text ? <ChatMarkdownContent source={turn.text} streaming={!turn.done} /> : (
          <span className="italic text-subtle">等待 Agent 响应…</span>
        )}
        {!turn.done && turn.text && (
          <span className="ml-0.5 animate-pulse">▋</span>
        )}
      </div>
      {turn.processBlocks.length > 0 && (
        <div className="grid w-full max-w-[80%] gap-1">
          {turn.processBlocks.map((block) => (
            <ProcessBlockView key={block.id} block={block} />
          ))}
        </div>
      )}
      {turn.sideResults.length > 0 && (
        <div className="grid w-full max-w-[80%] gap-1.5">
          {turn.sideResults.map((result, index) => (
            <SideResultBlock key={`${result.kind}:${index}:${result.question}`} result={result} />
          ))}
        </div>
      )}
      {turn.permissions.length > 0 && (
        <div className="grid w-full max-w-[80%] gap-1.5">
          {turn.permissions.map((permission) => (
            <PermissionRequestBlock
              key={permission.requestId}
              permission={permission}
              resolving={resolvingPermission}
              onResolve={onResolvePermission}
            />
          ))}
        </div>
      )}
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
  fileCapability,
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
  onResolvePermission,
  resolvingPermission = false,
  onRetry,
}: {
  sessionKey: string | null;
  messages: ChatMessageItem[];
  permissions: ChatSessionPermissions | null;
  fileCapability?: ChatFileCapability | null;
  isLoading: boolean;
  error: ApiError | null;
  liveTurn: LiveAssistantTurn | null;
  streaming: boolean;
  streamError: string | null;
  sending: boolean;
  uploading: boolean;
  /** Non-null when send is unavailable — shown as a disabled hint. */
  sendDisabledReason: string | null;
  onSend: (payload: ChatSendRequest) => Promise<boolean>;
  onUploadFile: (file: File, signal?: AbortSignal) => Promise<ChatFileUploadResponse>;
  onAbort: () => void;
  onResolvePermission?: (permission: ChatPermissionRequestCard, decision: "allow" | "deny") => void;
  resolvingPermission?: boolean;
  onRetry: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [fileRefs, setFileRefs] = React.useState<ComposerFileRefItem[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [filePickerOpen, setFilePickerOpen] = React.useState(false);
  const [filePickerDir, setFilePickerDir] = React.useState("");
  const [filePickerRootId, setFilePickerRootId] = React.useState<string | null>(null);
  const [filePickerPage, setFilePickerPage] = React.useState(1);
  const [previewFile, setPreviewFile] = React.useState<ComposerFileRefItem | null>(null);
  const [draftLoadedSessionKey, setDraftLoadedSessionKey] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cancelledUploadIdsRef = React.useRef(new Set<string>());
  const uploadControllersRef = React.useRef(new Map<string, AbortController>());
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const effectiveFileCapability = fileCapability ?? FALLBACK_CHAT_FILE_CAPABILITY;

  const filesSummary = useFilesSummaryQuery({ enabled: filePickerOpen });
  const filesRoots = filesSummary.data?.roots ?? [];
  const defaultFilesRootId = React.useMemo(() => {
    const roots = filesSummary.data?.roots ?? [];
    return roots.find((root) => root.id === "project-root")?.id ?? filesSummary.data?.defaultRootId ?? null;
  }, [filesSummary.data]);
  const effectiveFilePickerRootId = filePickerRootId || defaultFilesRootId;
  const selectedFilesRoot = filesRoots.find((root) => root.id === effectiveFilePickerRootId) ?? null;
  const filesBrowse = useFilesBrowseQuery(
    filePickerOpen && effectiveFilePickerRootId
      ? {
        rootId: effectiveFilePickerRootId,
        path: filePickerDir,
        hidden: false,
        page: filePickerPage,
        pageSize: 80,
        sortKey: "name",
        sortDirection: "asc",
      }
      : null,
  );
  const previewFilesRef = React.useMemo(() => resolveComposerFilesRef(previewFile), [previewFile]);
  const previewRead = useFileReadQuery(
    previewFilesRef && canReadPreviewAttachment(previewFile)
      ? { rootId: previewFilesRef.rootId, path: previewFilesRef.path, limit: 192 * 1024 }
      : null,
    { enabled: Boolean(previewFile && previewFilesRef && canReadPreviewAttachment(previewFile)) },
  );


  React.useEffect(() => {
    const persisted = sessionKey && typeof window !== "undefined"
      ? parsePersistedComposerDraft(window.localStorage.getItem(composerDraftStorageKey(sessionKey)))
      : null;
    setDraft(persisted?.text ?? "");
    setFileRefs((persisted?.fileRefs ?? []).map((item) => ({
      ...item,
      status: "ready",
      source: item.source ?? "files",
    })));
    setUploadError(null);
    setFilePickerOpen(false);
    setFilePickerDir("");
    setFilePickerRootId(null);
    setFilePickerPage(1);
    setPreviewFile(null);
    setDraftLoadedSessionKey(sessionKey);
    for (const controller of uploadControllersRef.current.values()) {
      controller.abort();
    }
    uploadControllersRef.current.clear();
    cancelledUploadIdsRef.current.clear();
  }, [sessionKey]);

  React.useEffect(() => {
    if (!sessionKey || draftLoadedSessionKey !== sessionKey || typeof window === "undefined") return;
    const key = composerDraftStorageKey(sessionKey);
    const persisted = buildPersistedComposerDraft(draft, fileRefs);
    if (!persisted) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(persisted));
  }, [draft, fileRefs, sessionKey, draftLoadedSessionKey]);

  React.useEffect(() => {
    if (!filePickerOpen || !defaultFilesRootId) return;
    setFilePickerRootId((current) => current || defaultFilesRootId);
  }, [filePickerOpen, defaultFilesRootId]);

  // Keep the transcript pinned to the bottom as content / stream grows.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, liveTurn?.text, liveTurn?.toolCards.length, sessionKey]);

  const canSend = !sendDisabledReason;
  const readyFileRefs = React.useMemo(
    () => fileRefs.filter((item) => item.status === "ready").map(({
      status: _status,
      source: _source,
      error: _error,
      previewUrl: _previewUrl,
      downloadUrl: _downloadUrl,
      ...ref
    }) => ref),
    [fileRefs],
  );
  const hasPendingFileRefs = fileRefs.some((item) => item.status === "uploading");
  const hasFailedFileRefs = fileRefs.some((item) => item.status === "failed");
  const hasPayload = Boolean(draft.trim() || readyFileRefs.length);

  const submit = async () => {
    const text = draft.trim();
    if (!hasPayload || !canSend || sending || uploading || hasPendingFileRefs || hasFailedFileRefs) return;
    const accepted = await onSend({ text, fileRefs: readyFileRefs.length ? readyFileRefs : undefined });
    if (!accepted) return;
    if (sessionKey && typeof window !== "undefined") {
      window.localStorage.removeItem(composerDraftStorageKey(sessionKey));
    }
    setDraft("");
    setFileRefs([]);
    setUploadError(null);
    setFilePickerOpen(false);
    setFilePickerDir("");
    setFilePickerRootId(null);
    setFilePickerPage(1);
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
      const controller = new AbortController();
      uploadControllersRef.current.set(pendingId, controller);
      setFileRefs((prev) => [...prev, pendingItem]);
      try {
        const item = await onUploadFile(file, controller.signal);
        uploadControllersRef.current.delete(pendingId);
        if (cancelledUploadIdsRef.current.has(pendingId)) {
          cancelledUploadIdsRef.current.delete(pendingId);
          return;
        }
        const readyItem: ComposerFileRefItem = {
          id: item.resource.id,
          rootId: item.rootId,
          relativePath: item.relativePath,
          resourceRef: item.resourceRef,
          fileName: item.fileName,
          kind: item.kind,
          mimeType: item.mimeType,
          previewUrl: item.resource.url,
          downloadUrl: item.resource.downloadUrl,
          status: "ready",
          source: "upload",
        };
        setFileRefs((prev) => prev.map((entry) => (entry.id === pendingId ? readyItem : entry)));
      } catch (error) {
        uploadControllersRef.current.delete(pendingId);
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

  const handleComposerPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = event.clipboardData;
    const pastedFiles = Array.from(clipboard.files ?? []).filter((file) => file.size >= 0);
    if (!pastedFiles.length) return;

    event.preventDefault();
    const pastedText = clipboard.getData("text/plain");
    if (pastedText) {
      const target = event.currentTarget;
      const selectionStart = target.selectionStart ?? draft.length;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      setDraft((current) => {
        const start = Math.max(0, Math.min(selectionStart, current.length));
        const end = Math.max(start, Math.min(selectionEnd, current.length));
        return `${current.slice(0, start)}${pastedText}${current.slice(end)}`;
      });
      window.setTimeout(() => {
        const nextCursor = selectionStart + pastedText.length;
        target.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    }

    void uploadFiles(pastedFiles);
  };


  const attachFilesRootFile = (filePath: string, fileName: string) => {
    const rootId = effectiveFilePickerRootId || "project-root";
    const isProjectRoot = rootId === defaultFilesRootId || rootId === "project-root";
    const resourceRef = buildTracevaneFilesResourceRef(rootId, filePath);
    if (!resourceRef) return;
    const previewUrl = buildFilesDownloadUrl(rootId, filePath, false);
    const downloadUrl = buildFilesDownloadUrl(rootId, filePath, true);
    const kind = inferComposerAttachmentKind(fileName);
    setFileRefs((prev) => {
      if (prev.some((item) => item.resourceRef === resourceRef)) return prev;
      return [
        ...prev,
        {
          id: resourceRef,
          rootId,
          relativePath: filePath,
          resourceRef,
          fileName,
          kind,
          mimeType: null,
          previewUrl,
          downloadUrl,
          status: "ready",
          source: isProjectRoot ? "workspace" : "files",
        },
      ];
    });
    setFilePickerOpen(false);
  };

  return (
    <section className="chat-conversation-pane flex h-full min-h-0 flex-col bg-panel">
      <div ref={scrollRef} className="chat-conversation-thread min-h-0 flex-1 overflow-auto p-4">
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
              <MessageBubble
                key={m.id}
                message={m}
                onPreviewResource={(resource) => setPreviewFile(composerFileRefFromMessageResource(resource))}
              />
            ))}
            {liveTurn && (
              <LiveTurn
                turn={liveTurn}
                resolvingPermission={resolvingPermission}
                onResolvePermission={onResolvePermission}
              />
            )}
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
                data-composer-attachment-preview-key={file.status === "ready" ? file.id : undefined}
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
                {file.status === "ready" && (
                  <button
                    type="button"
                    className="chat-composer-pool-insert inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[11px] text-primary hover:bg-primary-soft"
                    aria-label={`引用 ${file.fileName}`}
                    onClick={() => setDraft((prev) => `${prev}${prev && !/\s$/.test(prev) ? " " : ""}@${file.fileName}`)}
                  >
                    引用
                  </button>
                )}
                {file.status === "ready" && file.previewUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[11px] text-primary hover:bg-primary-soft"
                    aria-label={`预览 ${file.fileName}`}
                    onClick={() => setPreviewFile(file)}
                  >
                    <Eye className="size-3" />
                    预览
                  </button>
                )}
                <button
                  type="button"
                  className="chat-composer-attachment-remove rounded-full p-0.5 text-subtle hover:bg-panel-3 hover:text-ink"
                  aria-label={`移除 ${file.fileName}`}
                  onClick={() => {
                    if (file.status === "uploading") {
                      cancelledUploadIdsRef.current.add(file.id);
                      uploadControllersRef.current.get(file.id)?.abort();
                      uploadControllersRef.current.delete(file.id);
                    }
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
        <Dialog open={Boolean(previewFile)} onOpenChange={(open) => { if (!open) setPreviewFile(null); }}>
          <DialogContent className="chat-composer-preview-dialog w-[min(880px,94vw)]" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DialogHeader className="pr-12">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">{previewFile?.fileName || "文件预览"}</DialogTitle>
                <DialogDescription className="truncate text-sm">
                  {previewFile?.resourceRef || `通过 ${effectiveFileCapability.readEndpoint} 预览当前附件`}
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody className="max-h-[68vh] overflow-auto">
              {previewFile && canReadPreviewAttachment(previewFile) ? (
                previewRead.isLoading ? (
                  <div className="grid gap-2 p-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
                ) : previewRead.error ? (
                  <div className="rounded-md border border-red bg-red-soft p-4 text-sm text-red">
                    文件预览加载失败：{previewRead.error.message}
                  </div>
                ) : (
                  <pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-panel-2 p-3 font-mono text-xs leading-relaxed text-ink-strong">
                    {previewRead.data?.content ?? "该文件没有可显示的文本内容。"}
                    {previewRead.data?.truncated ? `\n\n… 已按 ${effectiveFileCapability.readEndpoint} 预览上限截断，请打开文件管理器或下载查看完整内容。` : ""}
                  </pre>
                )
              ) : previewFile?.previewUrl && canInlinePreviewAttachment(previewFile) ? (
                previewFile.kind === "image" ? (
                  <img
                    src={previewFile.previewUrl}
                    alt={previewFile.fileName}
                    className="mx-auto max-h-[62vh] max-w-full rounded-md border border-line object-contain"
                  />
                ) : previewFile.kind === "video" ? (
                  <video
                    src={previewFile.previewUrl}
                    controls
                    className="mx-auto max-h-[62vh] max-w-full rounded-md border border-line"
                  />
                ) : (
                  <iframe
                    title={`预览 ${previewFile.fileName}`}
                    src={previewFile.previewUrl}
                    className="h-[62vh] w-full rounded-md border border-line bg-white"
                  />
                )
              ) : (
                <div className="rounded-md border border-line bg-panel-2 p-4 text-sm text-muted">
                  该文件类型不适合内嵌预览，请使用下载或在浏览器新标签打开。
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              {previewFile?.previewUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(previewFile.previewUrl || "", "_blank", "noopener,noreferrer")}>
                  打开
                </Button>
              )}
              {previewFile?.downloadUrl && (
                <Button variant="primary" size="sm" onClick={() => window.open(previewFile.downloadUrl || "", "_blank", "noopener,noreferrer")}>
                  下载
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {uploadError && (
          <div className="mb-2 flex items-center gap-2 rounded-sm border border-red bg-red-soft px-2.5 py-1.5 text-sm text-red">
            <AlertTriangle className="size-3.5 shrink-0" />
            文件上传失败：{uploadError}
          </div>
        )}
        {filePickerOpen && (
          <div className="mb-2 overflow-hidden rounded-md border border-line bg-panel-2">
            <div className="flex items-center gap-1 border-b border-line px-2.5 py-2 text-xs text-muted">
              <Folder className="size-3.5" />
              <button type="button" className="font-medium text-ink hover:text-primary" onClick={() => { setFilePickerDir(""); setFilePickerPage(1); }}>文件根</button>
              {filesRoots.length > 1 && (
                <select
                  value={effectiveFilePickerRootId ?? ""}
                  onChange={(event) => {
                    setFilePickerRootId(event.target.value || null);
                    setFilePickerDir("");
                    setFilePickerPage(1);
                  }}
                  className="ml-1 h-7 max-w-[190px] rounded-xs border border-line bg-panel px-1.5 text-xs text-ink outline-none focus:border-primary-line"
                  aria-label="选择文件根"
                >
                  {filesRoots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.labelZh || root.labelEn || root.id}
                    </option>
                  ))}
                </select>
              )}
              {filePickerDir && (
                <>
                  <ChevronRight className="size-3" />
                  <span className="truncate">{filePickerDir}</span>
                </>
              )}
              <span className="flex-1" />
              {filePickerDir && (
                <Button variant="ghost" size="sm" onClick={() => { setFilePickerDir(parentPortablePath(filePickerDir)); setFilePickerPage(1); }}>上一级</Button>
              )}
            </div>
            {selectedFilesRoot && effectiveFilePickerRootId !== defaultFilesRootId && (
              <div className="border-b border-line bg-panel-3 px-2.5 py-1.5 text-xs text-muted">
                将以 {effectiveFileCapability.resourceRef} 引用附加“{selectedFilesRoot.labelZh || selectedFilesRoot.labelEn || selectedFilesRoot.id}”下的文件；后端会在发送时解析为本机安全路径。
              </div>
            )}
            <div className="max-h-56 overflow-auto p-1.5">
              {filesSummary.isLoading || filesBrowse.isLoading ? (
                <div className="grid gap-2 p-2"><SkeletonRow /><SkeletonRow /></div>
              ) : filesSummary.error || filesBrowse.error ? (
                <div className="p-2 text-sm text-red">文件列表加载失败：{(filesSummary.error || filesBrowse.error)?.message}</div>
              ) : !filesBrowse.data?.entries.length ? (
                <div className="p-2 text-sm text-muted">当前目录没有可附加的文件。</div>
              ) : (
                <div className="grid gap-1">
                  {filesBrowse.data.entries.map((entry) => {
                    const nextPath = entry.path || joinPortablePath(filePickerDir, entry.name);
                    if (entry.kind === "directory") {
                      return (
                        <button
                          key={`dir:${nextPath}`}
                          type="button"
                          className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink hover:bg-panel-3"
                          onClick={() => { setFilePickerDir(nextPath); setFilePickerPage(1); }}
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
                        title="附加到当前 Agent 消息"
                        className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink hover:bg-primary-soft"
                        onClick={() => attachFilesRootFile(nextPath, entry.name)}
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
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-1.5 text-xs text-subtle">
              <span className="min-w-0 flex-1">
                附加文件会作为结构化 fileRef 传给当前 Agent；目录来自 {effectiveFileCapability.browseEndpoint}，上传来自 {effectiveFileCapability.uploadEndpoint}，引用格式为 {effectiveFileCapability.resourceRef}。
              </span>
              {filesBrowse.data?.pagination && filesBrowse.data.pagination.totalPages > 1 && (
                <span className="inline-flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={filesBrowse.data.pagination.page <= 1 || filesBrowse.isFetching}
                    onClick={() => setFilePickerPage((page) => Math.max(1, page - 1))}
                  >
                    上一页
                  </Button>
                  <span className="whitespace-nowrap">
                    {filesBrowse.data.pagination.page} / {filesBrowse.data.pagination.totalPages} · {filesBrowse.data.pagination.totalEntries} 项
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={filesBrowse.data.pagination.page >= filesBrowse.data.pagination.totalPages || filesBrowse.isFetching}
                    onClick={() => setFilePickerPage((page) => page + 1)}
                  >
                    下一页
                  </Button>
                </span>
              )}
            </div>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handleComposerPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
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
            variant={filePickerOpen ? "outline" : "ghost"}
            size="sm"
            disabled={!sessionKey || !canSend}
            onClick={() => {
              setFilePickerOpen((open) => {
                const next = !open;
                if (next) setFilePickerPage(1);
                return next;
              });
            }}
          >
            <FileText />
            @ 文件 / 工作区
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
            onClick={() => void submit()}
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
