import * as React from "react";
import {
  AlertTriangle,
  Bot,
  Loader2,
  MessagesSquare,
  Paperclip,
  Send,
  Square,
  User,
  Wrench,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { ToneBadge, formatTime } from "@/features/cli-agents/views/_shared";

import type { ApiError } from "@/lib/api/errors";
import type {
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatSessionPermissions,
  ChatToolCard,
  LiveAssistantTurn,
} from "../types";
import { roleLabel, toolStatusTone } from "../_shared";

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

function MessageBubble({ message }: { message: ChatMessageItem }) {
  const isUser = message.role === "user";
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
  sendDisabledReason,
  onSend,
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
  /** Non-null when send is unavailable — shown as a disabled hint. */
  sendDisabledReason: string | null;
  onSend: (text: string) => void;
  onAbort: () => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the bottom as content / stream grows.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, liveTurn?.text, liveTurn?.toolCards.length, sessionKey]);

  const canSend = !sendDisabledReason;

  const submit = () => {
    const text = draft.trim();
    if (!text || !canSend || sending) return;
    onSend(text);
    setDraft("");
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
            "h-16 w-full resize-none rounded-md border border-line bg-panel-2 px-3 py-2 text-base text-ink-strong outline-none transition-[border-color,box-shadow]",
            "placeholder:text-subtle focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!sessionKey}>
            <Paperclip />
            附加上下文
          </Button>
          <Button variant="ghost" size="sm" disabled={!sessionKey}>
            @ 文件
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
            disabled={!sessionKey || !canSend || sending || !draft.trim()}
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
