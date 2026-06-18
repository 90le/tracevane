import type {
  ChannelConnectorFeishuTransportResult,
  ChannelConnectorFeishuTransportConfig,
  ChannelConnectorInboundAttachment,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorFeishuGroupSessionScope,
  ChannelConnectorFeishuParsedWebhook,
} from "./feishu-adapter.js";
import {
  getFeishuMessage,
  listFeishuThreadMessages,
  type ChannelConnectorFeishuMessageInfo,
} from "./feishu-transport.js";

export interface ChannelConnectorFeishuThreadBootstrapResult {
  attempted: boolean;
  included: boolean;
  skippedReason: string | null;
  context: string | null;
  threadId: string | null;
  rootMessageId: string | null;
  rootFetched: boolean;
  hydratedThreadId: string | null;
  messageCount: number;
  droppedCount: number;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  error: string | null;
}

export interface LoadChannelConnectorFeishuThreadBootstrapInput {
  transport: ChannelConnectorFeishuTransportConfig | null;
  tokenCachePath?: string | null;
  parsed: ChannelConnectorFeishuParsedWebhook;
  sessionKey: string;
  groupSessionScope: ChannelConnectorFeishuGroupSessionScope;
  hasExistingSession: boolean;
  enabled?: boolean;
  limit: number;
  messageMaxRunes: number;
  totalMaxRunes: number;
}

interface FeishuThreadContextEntry {
  role: "starter" | "assistant" | "user";
  messageId: string;
  senderId: string | null;
  senderType: string | null;
  body: string;
  truncated: boolean;
  originalRunes: number;
  attachments: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyResult(input: Partial<ChannelConnectorFeishuThreadBootstrapResult>): ChannelConnectorFeishuThreadBootstrapResult {
  return {
    attempted: input.attempted ?? false,
    included: input.included ?? false,
    skippedReason: input.skippedReason ?? null,
    context: input.context ?? null,
    threadId: input.threadId ?? null,
    rootMessageId: input.rootMessageId ?? null,
    rootFetched: input.rootFetched ?? false,
    hydratedThreadId: input.hydratedThreadId ?? null,
    messageCount: input.messageCount ?? 0,
    droppedCount: input.droppedCount ?? 0,
    requestCount: input.requestCount ?? 0,
    tokenCache: input.tokenCache ?? null,
    error: input.error ?? null,
  };
}

function isTopicScope(scope: ChannelConnectorFeishuGroupSessionScope): boolean {
  return scope === "group_topic" || scope === "group_topic_sender";
}

function isFeishuGroupChat(parsed: ChannelConnectorFeishuParsedWebhook): boolean {
  const chatType = normalizeString(parsed.chatType).toLowerCase();
  return chatType === "group" || chatType === "topic_group" || chatType.includes("group");
}

function runeLength(value: string): number {
  return Array.from(value).length;
}

function truncateRunes(value: string, maxRunes: number): { text: string; truncated: boolean; originalRunes: number } {
  const runes = Array.from(value);
  if (runes.length <= maxRunes) {
    return { text: value, truncated: false, originalRunes: runes.length };
  }
  return {
    text: `${runes.slice(0, Math.max(1, maxRunes - 1)).join("")}…`,
    truncated: true,
    originalRunes: runes.length,
  };
}

function attachmentSummary(attachment: ChannelConnectorInboundAttachment): string {
  const parts = [
    normalizeString(attachment.kind),
    normalizeString(attachment.fileName),
    typeof attachment.size === "number" && Number.isFinite(attachment.size) ? `${attachment.size} bytes` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function messageBody(message: ChannelConnectorFeishuMessageInfo): string {
  const content = normalizeString(message.content);
  const attachments = (message.attachments || []).map(attachmentSummary).filter(Boolean);
  return content || (attachments.length ? `[attachments: ${attachments.join("; ")}]` : "");
}

function contextEntryFromMessage(
  message: ChannelConnectorFeishuMessageInfo,
  role: FeishuThreadContextEntry["role"],
  messageMaxRunes: number,
): FeishuThreadContextEntry | null {
  const body = messageBody(message);
  if (!body) return null;
  const truncated = truncateRunes(body, messageMaxRunes);
  return {
    role,
    messageId: normalizeString(message.messageId),
    senderId: normalizeString(message.senderId) || null,
    senderType: normalizeString(message.senderType) || null,
    body: truncated.text,
    truncated: truncated.truncated,
    originalRunes: truncated.originalRunes,
    attachments: (message.attachments || []).map(attachmentSummary).filter(Boolean),
  };
}

function fitEntriesToBudget(entries: FeishuThreadContextEntry[], totalMaxRunes: number): {
  entries: FeishuThreadContextEntry[];
  droppedCount: number;
} {
  const retained: FeishuThreadContextEntry[] = [];
  let used = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const cost = runeLength(JSON.stringify(entry));
    if (retained.length && used + cost > totalMaxRunes) break;
    retained.unshift(entry);
    used += cost;
  }
  return {
    entries: retained,
    droppedCount: Math.max(0, entries.length - retained.length),
  };
}

function renderFeishuThreadBootstrapContext(input: {
  sessionKey: string;
  threadId: string;
  rootMessageId: string | null;
  entries: FeishuThreadContextEntry[];
  originalEntryCount: number;
  droppedCount: number;
  messageMaxRunes: number;
  totalMaxRunes: number;
}): string {
  return [
    "[Feishu thread bootstrap]",
    "Fetched from Feishu message/thread APIs because this is the first Tracevane Agent turn for the current topic/thread session.",
    "Use this as topic context only. Do not re-answer older messages unless the current user asks; the current message follows later.",
    `Session: ${input.sessionKey}`,
    `Thread: ${input.threadId}${input.rootMessageId ? ` root=${input.rootMessageId}` : ""}`,
    `History budget: ${input.entries.length}/${input.originalEntryCount} messages included, max ${input.messageMaxRunes} chars per message, max ${input.totalMaxRunes} chars total.${input.droppedCount ? ` Dropped ${input.droppedCount} older messages due to budget.` : ""}`,
    "```json",
    JSON.stringify(input.entries.map((entry) => ({
      role: entry.role,
      messageId: entry.messageId,
      senderId: entry.senderId,
      senderType: entry.senderType,
      body: entry.body,
      ...(entry.truncated ? { truncated: true, originalRunes: entry.originalRunes } : {}),
      ...(entry.attachments.length ? { attachments: entry.attachments } : {}),
    })), null, 2),
    "```",
    "[Current message follows later - respond to that only]",
  ].join("\n");
}

export async function loadFeishuThreadBootstrapContext(
  input: LoadChannelConnectorFeishuThreadBootstrapInput,
): Promise<ChannelConnectorFeishuThreadBootstrapResult> {
  if (input.enabled === false) return emptyResult({ skippedReason: "disabled" });
  if (input.hasExistingSession) return emptyResult({ skippedReason: "existing_session" });
  if (input.parsed.kind !== "message" || !isFeishuGroupChat(input.parsed)) return emptyResult({ skippedReason: "not_group_message" });
  if (!isTopicScope(input.groupSessionScope)) return emptyResult({ skippedReason: "not_topic_scope" });
  if (input.limit <= 0) return emptyResult({ skippedReason: "limit_disabled" });
  if (!input.transport) return emptyResult({ attempted: true, skippedReason: "transport_missing", error: "feishu_transport_config_missing" });

  const rootMessageId = normalizeString(input.parsed.rootId);
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = input.tokenCachePath ? "miss" : "disabled";
  let hydratedThreadId: string | null = null;
  let rootMessage: ChannelConnectorFeishuMessageInfo | null = null;
  let rootFetched = false;

  try {
    if (normalizeString(input.parsed.chatType).toLowerCase() === "topic_group" && !normalizeString(input.parsed.threadId)) {
      const current = await getFeishuMessage(input.transport, {
        messageId: normalizeString(input.parsed.messageId),
      }, input.tokenCachePath);
      requestCount += current.requestCount;
      tokenCache = current.tokenCache || tokenCache;
      hydratedThreadId = normalizeString(current.message?.threadId) || null;
    }

    if (rootMessageId) {
      const root = await getFeishuMessage(input.transport, { messageId: rootMessageId }, input.tokenCachePath);
      rootFetched = true;
      requestCount += root.requestCount;
      tokenCache = root.tokenCache || tokenCache;
      rootMessage = root.ok ? root.message : null;
      if (!hydratedThreadId) hydratedThreadId = normalizeString(rootMessage?.threadId) || null;
    }

    const threadId = normalizeString(input.parsed.threadId) || hydratedThreadId;
    if (!threadId) {
      return emptyResult({
        attempted: true,
        skippedReason: "thread_id_missing",
        rootMessageId: rootMessageId || null,
        rootFetched,
        hydratedThreadId,
        requestCount,
        tokenCache,
      });
    }

    const list = await listFeishuThreadMessages(input.transport, {
      threadId,
      currentMessageId: input.parsed.messageId,
      rootMessageId: rootMessageId || null,
      limit: input.limit,
    }, input.tokenCachePath);
    requestCount += list.requestCount;
    tokenCache = list.tokenCache || tokenCache;
    if (!list.ok) {
      return emptyResult({
        attempted: true,
        skippedReason: "thread_list_failed",
        threadId,
        rootMessageId: rootMessageId || null,
        rootFetched,
        hydratedThreadId,
        requestCount,
        tokenCache,
        error: list.error,
      });
    }

    const senderScoped = input.groupSessionScope === "group_topic_sender";
    const senderId = normalizeString(input.parsed.fromUid);
    const messages = senderScoped
      ? list.messages.filter((message) => {
        const type = normalizeString(message.senderType).toLowerCase();
        const messageSender = normalizeString(message.senderId);
        return type === "app" || !senderId || messageSender === senderId;
      })
      : list.messages;

    const maxEntries = Math.max(1, Math.min(50, Math.floor(input.limit)));
    const messageMaxRunes = Math.max(80, Math.min(8000, Math.floor(input.messageMaxRunes)));
    const totalMaxRunes = Math.max(500, Math.min(64000, Math.floor(input.totalMaxRunes)));
    const entries: FeishuThreadContextEntry[] = [];
    const rootEntry = rootMessage ? contextEntryFromMessage(rootMessage, "starter", messageMaxRunes) : null;
    if (rootEntry) entries.push(rootEntry);
    for (const message of messages.slice(-(rootEntry ? maxEntries - 1 : maxEntries))) {
      const role = normalizeString(message.senderType).toLowerCase() === "app" ? "assistant" : "user";
      const entry = contextEntryFromMessage(message, role, messageMaxRunes);
      if (entry) entries.push(entry);
    }
    if (!entries.length) {
      return emptyResult({
        attempted: true,
        skippedReason: "empty_thread_context",
        threadId,
        rootMessageId: rootMessageId || null,
        rootFetched,
        hydratedThreadId,
        requestCount,
        tokenCache,
      });
    }

    const fitted = fitEntriesToBudget(entries, totalMaxRunes);
    return {
      attempted: true,
      included: fitted.entries.length > 0,
      skippedReason: fitted.entries.length > 0 ? null : "budget_empty",
      context: fitted.entries.length > 0
        ? renderFeishuThreadBootstrapContext({
          sessionKey: input.sessionKey,
          threadId,
          rootMessageId: rootMessageId || null,
          entries: fitted.entries,
          originalEntryCount: entries.length,
          droppedCount: fitted.droppedCount,
          messageMaxRunes,
          totalMaxRunes,
        })
        : null,
      threadId,
      rootMessageId: rootMessageId || null,
      rootFetched,
      hydratedThreadId,
      messageCount: fitted.entries.length,
      droppedCount: fitted.droppedCount,
      requestCount,
      tokenCache,
      error: null,
    };
  } catch (error) {
    return emptyResult({
      attempted: true,
      skippedReason: "error",
      rootMessageId: rootMessageId || null,
      rootFetched,
      hydratedThreadId,
      requestCount,
      tokenCache,
      error: error instanceof Error ? error.message : "Feishu thread bootstrap failed.",
    });
  }
}
