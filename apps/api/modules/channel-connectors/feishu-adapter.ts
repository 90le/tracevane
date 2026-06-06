import { timingSafeEqual } from "node:crypto";
import type {
  ChannelConnectorFeishuWebhookEventKind,
  ChannelConnectorFeishuWebhookRequest,
} from "../../../../types/channel-connectors.js";

export interface ChannelConnectorFeishuParsedWebhook {
  kind: ChannelConnectorFeishuWebhookEventKind;
  eventType: string | null;
  eventId: string | null;
  appId: string | null;
  token: string | null;
  challenge: string | null;
  bindingId: string | null;
  actionValue: unknown;
  eventKey: string | null;
  fromUid: string | null;
  channelId: string | null;
  messageId: string | null;
  rootId: string | null;
  parentId: string | null;
  threadId: string | null;
  chatType: string | null;
  text: string | null;
  directed: boolean;
}

export interface ChannelConnectorFeishuSessionKeyOptions {
  threadIsolation?: boolean;
  shareSessionInChannel?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFeishuSessionKey(
  input: {
    channelId?: string | null;
    fromUid?: string | null;
    chatType?: string | null;
    messageId?: string | null;
    rootId?: string | null;
    parentId?: string | null;
    threadId?: string | null;
  },
  options: ChannelConnectorFeishuSessionKeyOptions = {},
): string | null {
  const channelId = normalizeString(input.channelId);
  const fromUid = normalizeString(input.fromUid);
  if (!channelId && !fromUid) return null;

  const threadIsolation = options.threadIsolation !== false;
  const isGroup = normalizeString(input.chatType).toLowerCase() === "group";
  if (threadIsolation && isGroup) {
    const rootId = normalizeString(input.rootId) || normalizeString(input.messageId);
    if (rootId) return `feishu:${channelId || "unknown"}:root:${rootId}`;
    const threadId = normalizeString(input.threadId);
    if (threadId) return `feishu:${channelId || "unknown"}:thread:${threadId}`;
    const parentId = normalizeString(input.parentId);
    if (parentId) return `feishu:${channelId || "unknown"}:reply:${parentId}`;
  }

  if (options.shareSessionInChannel && channelId) return `feishu:${channelId}`;
  return `feishu:${channelId || fromUid}:${fromUid || channelId}`;
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function nestedRecord(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) return {};
    current = current[key];
  }
  return recordValue(current);
}

function nestedString(root: Record<string, unknown>, path: string[]): string {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return normalizeString(current);
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return recordValue(parsed);
  } catch {
    return {};
  }
}

function extractFeishuTextContent(content: unknown): string {
  if (isRecord(content)) {
    return normalizeString(content.text || content.content);
  }
  const raw = normalizeString(content);
  if (!raw) return "";
  const parsed = raw.startsWith("{") ? parseJsonRecord(raw) : {};
  const text = normalizeString(parsed.text || parsed.content || parsed.title);
  return (text || raw)
    .replace(/<at\b[^>]*>.*?<\/at>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function normalizeFeishuEventType(payload: Record<string, unknown>, header: Record<string, unknown>): string {
  return normalizeString(header.event_type)
    || normalizeString(payload.event_type)
    || normalizeString(payload.type);
}

function isCardActionEvent(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  return normalized === "card.action.trigger" || normalized === "card.action.trigger_v1";
}

function isBotMenuEvent(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  return normalized === "application.bot.menu_v6"
    || normalized === "bot.menu_v6"
    || normalized.endsWith(".bot.menu_v6");
}

function isMessageEvent(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  return normalized === "im.message.receive_v1" || normalized === "message.receive_v1";
}

function extractActionValue(payload: Record<string, unknown>, event: Record<string, unknown>): unknown {
  if (payload.actionValue !== undefined) return payload.actionValue;
  const action = recordValue(event.action || payload.action);
  const option = normalizeString(action.option);
  if (option) {
    const valueRecord = recordValue(action.value);
    if (Object.keys(valueRecord).length > 0) {
      return {
        ...valueRecord,
        action: option,
        command: option,
      };
    }
    return { action: option, command: option };
  }
  if (action.value !== undefined) return action.value;
  const name = normalizeString(action.name);
  if (name) return { action: name, command: name };
  return null;
}

function extractSenderOpenId(event: Record<string, unknown>): string {
  return normalizeString(event.open_id)
    || normalizeString(event.openId)
    || normalizeString(event.operator_open_id)
    || nestedString(event, ["operator", "open_id"])
    || nestedString(event, ["operator", "openId"])
    || nestedString(event, ["operator", "operator_id", "open_id"])
    || nestedString(event, ["sender", "sender_id", "open_id"])
    || nestedString(event, ["sender", "sender_id", "user_id"]);
}

function extractChatId(event: Record<string, unknown>): string {
  return normalizeString(event.open_chat_id)
    || normalizeString(event.openChatId)
    || normalizeString(event.chatId)
    || nestedString(event, ["context", "open_chat_id"])
    || nestedString(event, ["context", "openChatId"])
    || nestedString(event, ["message", "chat_id"])
    || normalizeString(event.chat_id);
}

function extractMessageId(event: Record<string, unknown>): string {
  return normalizeString(event.open_message_id)
    || normalizeString(event.openMessageId)
    || normalizeString(event.messageId)
    || nestedString(event, ["context", "open_message_id"])
    || nestedString(event, ["context", "openMessageId"])
    || nestedString(event, ["message", "message_id"])
    || normalizeString(event.message_id);
}

function extractFeishuMessage(event: Record<string, unknown>): {
  messageId: string | null;
  rootId: string | null;
  parentId: string | null;
  threadId: string | null;
  chatType: string | null;
  text: string | null;
} {
  const message = nestedRecord(event, ["message"]);
  if (!Object.keys(message).length) {
    return {
      messageId: extractMessageId(event) || null,
      rootId: normalizeString(event.root_id) || null,
      parentId: normalizeString(event.parent_id) || null,
      threadId: normalizeString(event.thread_id) || null,
      chatType: normalizeString(event.chat_type) || null,
      text: extractFeishuTextContent(event.content) || null,
    };
  }
  return {
    messageId: normalizeString(message.message_id) || null,
    rootId: normalizeString(message.root_id) || null,
    parentId: normalizeString(message.parent_id) || null,
    threadId: normalizeString(message.thread_id) || null,
    chatType: normalizeString(message.chat_type) || null,
    text: extractFeishuTextContent(message.content) || null,
  };
}

export function parseChannelConnectorFeishuWebhook(
  input: ChannelConnectorFeishuWebhookRequest | undefined,
): ChannelConnectorFeishuParsedWebhook {
  const payload = recordValue(input);
  const header = recordValue(payload.header);
  const event = recordValue(payload.event);
  const eventType = normalizeFeishuEventType(payload, header);
  const challenge = normalizeString(payload.challenge);
  const appId = normalizeString(header.app_id)
    || normalizeString(payload.app_id)
    || normalizeString(event.app_id)
    || null;
  const token = normalizeString(payload.token)
    || normalizeString(header.token)
    || normalizeString(event.token)
    || null;
  const eventId = normalizeString(header.event_id)
    || normalizeString(payload.event_id)
    || normalizeString(event.event_id)
    || null;

  if (challenge && (normalizeString(payload.type) === "url_verification" || !eventType)) {
    return {
      kind: "url-verification",
      eventType: "url_verification",
      eventId,
      appId,
      token,
      challenge,
      bindingId: normalizeString(payload.bindingId) || null,
      actionValue: null,
      eventKey: null,
      fromUid: null,
      channelId: null,
      messageId: null,
      rootId: null,
      parentId: null,
      threadId: null,
      chatType: null,
      text: null,
      directed: false,
    };
  }

  if (isCardActionEvent(eventType)) {
    return {
      kind: "card-action",
      eventType,
      eventId,
      appId,
      token,
      challenge: null,
      bindingId: normalizeString(payload.bindingId) || null,
      actionValue: extractActionValue(payload, event),
      eventKey: null,
      fromUid: extractSenderOpenId(event) || null,
      channelId: extractChatId(event) || null,
      messageId: extractMessageId(event) || null,
      rootId: null,
      parentId: null,
      threadId: null,
      chatType: null,
      text: null,
      directed: true,
    };
  }

  if (isBotMenuEvent(eventType)) {
    return {
      kind: "bot-menu",
      eventType,
      eventId,
      appId,
      token,
      challenge: null,
      bindingId: normalizeString(payload.bindingId) || null,
      actionValue: null,
      eventKey: normalizeString(payload.eventKey) || normalizeString(event.event_key) || null,
      fromUid: extractSenderOpenId(event) || null,
      channelId: extractChatId(event) || null,
      messageId: extractMessageId(event) || null,
      rootId: null,
      parentId: null,
      threadId: null,
      chatType: null,
      text: null,
      directed: true,
    };
  }

  if (isMessageEvent(eventType)) {
    const message = extractFeishuMessage(event);
    const chatType = message.chatType;
    const text = message.text;
    const directed = chatType !== "group" || Boolean(text && text.startsWith("/"));
    return {
      kind: "message",
      eventType,
      eventId,
      appId,
      token,
      challenge: null,
      bindingId: normalizeString(payload.bindingId) || null,
      actionValue: null,
      eventKey: null,
      fromUid: extractSenderOpenId(event) || null,
      channelId: extractChatId(event) || null,
      messageId: message.messageId || extractMessageId(event) || null,
      rootId: message.rootId,
      parentId: message.parentId,
      threadId: message.threadId,
      chatType: chatType || null,
      text: text || null,
      directed,
    };
  }

  return {
    kind: "unsupported",
    eventType: eventType || null,
    eventId,
    appId,
    token,
    challenge: null,
    bindingId: normalizeString(payload.bindingId) || null,
    actionValue: null,
    eventKey: null,
    fromUid: extractSenderOpenId(event) || null,
    channelId: extractChatId(event) || null,
    messageId: extractMessageId(event) || null,
    rootId: null,
    parentId: null,
    threadId: null,
    chatType: null,
    text: null,
    directed: false,
  };
}

export function safeEqualFeishuWebhookToken(actual: string | null | undefined, expected: string | null | undefined): boolean {
  const actualBuffer = Buffer.from(normalizeString(actual), "utf8");
  const expectedBuffer = Buffer.from(normalizeString(expected), "utf8");
  if (!actualBuffer.length || !expectedBuffer.length || actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
