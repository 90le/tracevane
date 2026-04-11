import type { ReplyPayload } from 'openclaw/plugin-sdk/reply-runtime';
import { isStudioManagedWebchatSession } from './studio-delivery.js';
import { STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES } from './studio-delivery-hooks.js';

export { STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES };

type ReplyDispatchCounts = {
  tool: number;
  block: number;
  final: number;
};

type ReplyDispatcherLike = {
  sendToolResult: (payload: ReplyPayload) => boolean;
  sendBlockReply: (payload: ReplyPayload) => boolean;
  sendFinalReply: (payload: ReplyPayload) => boolean;
  getQueuedCounts: () => Partial<ReplyDispatchCounts> | Record<string, number>;
};

type StudioReplyDispatchEvent = {
  ctx: Record<string, unknown>;
  runId?: string;
  sessionKey?: string;
  sendPolicy?: 'allow' | 'deny';
  shouldRouteToOriginating?: boolean;
};

type StudioReplyDispatchContext = {
  cfg: Record<string, unknown>;
  dispatcher: ReplyDispatcherLike;
  abortSignal?: AbortSignal;
  onReplyStart?: () => Promise<void> | void;
  recordProcessed: (
    outcome: 'completed' | 'skipped' | 'error',
    opts?: {
      reason?: string;
      error?: string;
    },
  ) => void;
  markIdle: (reason: string) => void;
};

type StudioReplyDispatchResult = {
  handled: true;
  queuedFinal: boolean;
  counts: ReplyDispatchCounts;
};

type StudioReplyResolver = (
  ctx: Record<string, unknown>,
  opts?: {
    runId?: string;
    abortSignal?: AbortSignal;
    onReplyStart?: () => Promise<void> | void;
    onToolResult?: (payload: ReplyPayload) => Promise<void> | void;
    onBlockReply?: (payload: ReplyPayload) => Promise<void> | void;
  },
  configOverride?: Record<string, unknown>,
) => Promise<ReplyPayload | ReplyPayload[] | undefined>;

let studioReplyRuntimePromise: Promise<{
  getReplyFromConfig: StudioReplyResolver;
}> | null = null;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readDenyList(config: Record<string, unknown> | null | undefined): string[] {
  const tools = config?.tools;
  if (!tools || typeof tools !== 'object') {
    return [];
  }
  const deny = (tools as { deny?: unknown }).deny;
  return Array.isArray(deny)
    ? deny.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function normalizeCounts(dispatcher: ReplyDispatcherLike): ReplyDispatchCounts {
  const counts = dispatcher.getQueuedCounts();
  return {
    tool: typeof counts.tool === 'number' ? counts.tool : 0,
    block: typeof counts.block === 'number' ? counts.block : 0,
    final: typeof counts.final === 'number' ? counts.final : 0,
  };
}

function shouldQueueStudioFinalReply(payload: ReplyPayload): boolean {
  const record = payload as ReplyPayload & Record<string, unknown>;
  return Boolean(
    record.mediaUrl
    || (Array.isArray(record.mediaUrls) && record.mediaUrls.length > 0)
    || record.interactive
    || record.btw
    || record.replyToId
    || record.replyToCurrent
    || record.replyToTag
    || record.audioAsVoice
    || record.channelData,
  );
}

async function loadStudioReplyResolver(): Promise<StudioReplyResolver> {
  studioReplyRuntimePromise ??= import('openclaw/plugin-sdk/reply-runtime') as Promise<{
    getReplyFromConfig: StudioReplyResolver;
  }>;
  const runtime = await studioReplyRuntimePromise;
  return runtime.getReplyFromConfig;
}

function shouldHandleStudioReplyDispatch(event: StudioReplyDispatchEvent): boolean {
  if (event.sendPolicy === 'deny') {
    return false;
  }
  if (event.shouldRouteToOriginating === true) {
    return false;
  }

  const sessionKey = normalizeString(event.sessionKey) || normalizeString(event.ctx.SessionKey);
  const messageChannel = normalizeString(event.ctx.Surface) || normalizeString(event.ctx.Provider);
  return isStudioManagedWebchatSession({
    sessionKey,
    messageChannel,
  });
}

export function buildStudioReplyDispatchConfigOverride(
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const deny = Array.from(new Set([
    ...readDenyList(config),
    ...STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES,
  ]));
  return {
    tools: {
      deny,
    },
  };
}

export async function maybeHandleStudioReplyDispatch(
  event: StudioReplyDispatchEvent,
  ctx: StudioReplyDispatchContext,
  replyResolver?: StudioReplyResolver,
): Promise<StudioReplyDispatchResult | undefined> {
  if (!shouldHandleStudioReplyDispatch(event)) {
    return undefined;
  }

  const resolvedReplyResolver = replyResolver ?? await loadStudioReplyResolver();
  const configOverride = buildStudioReplyDispatchConfigOverride(ctx.cfg);
  const replies = await resolvedReplyResolver(
    event.ctx,
    {
      runId: normalizeString(event.runId) || undefined,
      abortSignal: ctx.abortSignal,
      onReplyStart: ctx.onReplyStart,
      onToolResult: async (payload) => {
        ctx.dispatcher.sendToolResult(payload);
      },
      onBlockReply: async (payload) => {
        if (payload.isReasoning === true) {
          return;
        }
        ctx.dispatcher.sendBlockReply(payload);
      },
    },
    configOverride,
  );

  const finalReplies = replies
    ? (Array.isArray(replies) ? replies : [replies]).filter((payload) => payload?.isReasoning !== true)
    : [];
  let queuedFinal = false;
  for (const payload of finalReplies) {
    // Studio-managed webchat already receives the canonical assistant message
    // through transcript/canonical-stream projection. Re-queueing plain-text
    // final replies here produces gateway-injected duplicate assistant rows in
    // both host chat and Studio history, so only delivery-only payloads keep
    // using the final-reply dispatcher.
    if (!shouldQueueStudioFinalReply(payload)) {
      continue;
    }
    queuedFinal = ctx.dispatcher.sendFinalReply(payload) || queuedFinal;
  }

  const counts = normalizeCounts(ctx.dispatcher);
  ctx.recordProcessed('completed', {
    reason: 'studio_reply_dispatch_restricted',
  });
  ctx.markIdle('message_completed');

  return {
    handled: true,
    queuedFinal,
    counts,
  };
}
