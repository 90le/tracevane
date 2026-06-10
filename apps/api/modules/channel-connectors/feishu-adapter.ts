import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import type {
  ChannelConnectorInboundAttachment,
  ChannelConnectorFeishuWebhookEventKind,
  ChannelConnectorFeishuWebhookRequest,
} from "../../../../types/channel-connectors.js";

export interface ChannelConnectorFeishuParsedWebhook {
  kind: ChannelConnectorFeishuWebhookEventKind;
  eventType: string | null;
  eventId: string | null;
  eventCreateTimeMs: number | null;
  messageCreateTimeMs: number | null;
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
  messageType: string | null;
  text: string | null;
  attachments: ChannelConnectorInboundAttachment[];
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

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeFeishuTimestampMs(value: unknown): number | null {
  const numeric = normalizeNumber(value);
  if (!numeric || numeric <= 0) return null;
  if (numeric >= 1_000_000_000_000_000) return Math.floor(numeric / 1_000);
  if (numeric >= 10_000_000_000) return Math.floor(numeric);
  if (numeric >= 1_000_000_000) return Math.floor(numeric * 1000);
  return null;
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

const DELETE_MODE_CHECKER_NAME_PREFIX = "delete_sel_";

function decodeHexUtf8(value: string): string {
  const normalized = normalizeString(value);
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) return "";
  try {
    return Buffer.from(normalized, "hex").toString("utf8");
  } catch {
    return "";
  }
}

function parseDeleteModeCheckerName(name: string): string {
  const normalized = normalizeString(name);
  if (!normalized.startsWith(DELETE_MODE_CHECKER_NAME_PREFIX)) return "";
  return decodeHexUtf8(normalized.slice(DELETE_MODE_CHECKER_NAME_PREFIX.length));
}

function isTruthyFormValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function collectDeleteModeSelectedFromAction(action: Record<string, unknown>): string[] {
  const formValue = recordValue(action.form_value || action.formValue || action.FormValue);
  const selected = new Set<string>();
  for (const [name, value] of Object.entries(formValue)) {
    if (!isTruthyFormValue(value)) continue;
    const sessionId = parseDeleteModeCheckerName(name);
    if (sessionId) selected.add(sessionId);
  }
  return [...selected].sort();
}

function deleteModeSelectedFromActionText(actionText: string): string[] {
  const prefix = "act:/delete-mode form-submit";
  const normalized = normalizeString(actionText);
  if (!normalized.startsWith(prefix)) return [];
  return normalized.slice(prefix.length).split(",")
    .map((part) => normalizeString(part))
    .filter(Boolean)
    .sort();
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

function contentRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  const raw = normalizeString(value);
  return raw.startsWith("{") ? parseJsonRecord(raw) : {};
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

function feishuAttachment(
  kind: ChannelConnectorInboundAttachment["kind"],
  fields: Partial<ChannelConnectorInboundAttachment>,
): ChannelConnectorInboundAttachment {
  const key = normalizeString(fields.key) || normalizeString(fields.imageKey) || normalizeString(fields.fileKey) || null;
  return {
    kind,
    platform: "feishu",
    key,
    imageKey: normalizeString(fields.imageKey) || null,
    fileKey: normalizeString(fields.fileKey) || null,
    fileName: normalizeString(fields.fileName) || null,
    mimeType: normalizeString(fields.mimeType) || null,
    size: typeof fields.size === "number" && Number.isFinite(fields.size) ? fields.size : null,
    durationMs: typeof fields.durationMs === "number" && Number.isFinite(fields.durationMs) ? fields.durationMs : null,
    url: normalizeString(fields.url) || null,
  };
}

function durationLabel(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return "";
  return `${Math.round(durationMs / 1000)}s`;
}

function extractFeishuMessageContent(messageType: string | null, content: unknown): {
  text: string | null;
  attachments: ChannelConnectorInboundAttachment[];
} {
  const normalizedType = normalizeString(messageType).toLowerCase();
  const record = contentRecord(content);
  if (normalizedType === "image") {
    const imageKey = normalizeString(record.image_key) || normalizeString(record.imageKey) || normalizeString(record.file_key);
    return {
      text: "[image]",
      attachments: [feishuAttachment("image", { imageKey })],
    };
  }
  if (normalizedType === "file") {
    const fileKey = normalizeString(record.file_key) || normalizeString(record.fileKey);
    const fileName = normalizeString(record.file_name) || normalizeString(record.fileName) || normalizeString(record.name);
    return {
      text: `[file: ${fileName || "file"}]`,
      attachments: [feishuAttachment("file", { fileKey, fileName })],
    };
  }
  if (normalizedType === "audio") {
    const fileKey = normalizeString(record.file_key) || normalizeString(record.fileKey);
    const durationMs = normalizeNumber(record.duration);
    const label = durationLabel(durationMs);
    return {
      text: label ? `[voice: ${label}]` : "[voice]",
      attachments: [feishuAttachment("audio", { fileKey, durationMs })],
    };
  }
  if (normalizedType === "media") {
    const fileKey = normalizeString(record.file_key) || normalizeString(record.fileKey);
    const imageKey = normalizeString(record.image_key) || normalizeString(record.imageKey);
    const fileName = normalizeString(record.file_name) || normalizeString(record.fileName) || normalizeString(record.name);
    const durationMs = normalizeNumber(record.duration);
    const detail = [fileName, durationLabel(durationMs)].filter(Boolean).join(", ");
    return {
      text: detail ? `[video: ${detail}]` : "[video]",
      attachments: [feishuAttachment("video", { fileKey, imageKey, fileName, durationMs })],
    };
  }
  if (normalizedType === "sticker") {
    const fileKey = normalizeString(record.file_key) || normalizeString(record.fileKey);
    return {
      text: "[sticker]",
      attachments: [feishuAttachment("sticker", { fileKey })],
    };
  }
  const text = extractFeishuTextContent(content);
  return {
    text: text || null,
    attachments: [],
  };
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
  const valueRecord = recordValue(action.value);
  const valueAction = normalizeString(valueRecord.action) || normalizeString(valueRecord.command);
  const name = normalizeString(action.name);
  const fallbackAction = name === "delete_mode_submit"
    ? "act:/delete-mode form-submit"
    : name === "delete_mode_cancel"
      ? "nav:/list"
      : "";
  const explicitAction = valueAction || fallbackAction;
  if (explicitAction.startsWith("act:/delete-mode form-submit")) {
    const formSelectedIds = collectDeleteModeSelectedFromAction(action);
    const selectedIds = formSelectedIds.length ? formSelectedIds : deleteModeSelectedFromActionText(explicitAction);
    const suffix = selectedIds.join(",");
    return {
      ...valueRecord,
      action: suffix ? `act:/delete ${suffix}` : "act:/delete",
      command: suffix ? `/delete ${suffix}` : "/delete",
      source_action: explicitAction,
      delete_mode_selected_ids: selectedIds,
    };
  }
  const option = normalizeString(action.option);
  if (option) {
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
  if (fallbackAction) return { ...valueRecord, action: fallbackAction, command: fallbackAction };
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
  messageType: string | null;
  messageCreateTimeMs: number | null;
  text: string | null;
  attachments: ChannelConnectorInboundAttachment[];
} {
  const message = nestedRecord(event, ["message"]);
  if (!Object.keys(message).length) {
    const messageType = normalizeString(event.message_type) || null;
    const extracted = extractFeishuMessageContent(messageType, event.content);
    return {
      messageId: extractMessageId(event) || null,
      rootId: normalizeString(event.root_id) || null,
      parentId: normalizeString(event.parent_id) || null,
      threadId: normalizeString(event.thread_id) || null,
      chatType: normalizeString(event.chat_type) || null,
      messageType,
      messageCreateTimeMs: normalizeFeishuTimestampMs(event.create_time)
        || normalizeFeishuTimestampMs(event.createTime),
      text: extracted.text,
      attachments: extracted.attachments,
    };
  }
  const messageType = normalizeString(message.message_type) || null;
  const extracted = extractFeishuMessageContent(messageType, message.content);
  return {
    messageId: normalizeString(message.message_id) || null,
    rootId: normalizeString(message.root_id) || null,
    parentId: normalizeString(message.parent_id) || null,
    threadId: normalizeString(message.thread_id) || null,
    chatType: normalizeString(message.chat_type) || null,
    messageType,
    messageCreateTimeMs: normalizeFeishuTimestampMs(message.create_time)
      || normalizeFeishuTimestampMs(message.createTime),
    text: extracted.text,
    attachments: extracted.attachments,
  };
}

export function parseChannelConnectorFeishuWebhook(
  input: ChannelConnectorFeishuWebhookRequest | undefined,
): ChannelConnectorFeishuParsedWebhook {
  const payload = recordValue(input);
  const header = recordValue(payload.header);
  const event = recordValue(payload.event);
  const eventType = normalizeFeishuEventType(payload, header);
  const eventCreateTimeMs = normalizeFeishuTimestampMs(header.create_time)
    || normalizeFeishuTimestampMs(header.createTime)
    || normalizeFeishuTimestampMs(payload.create_time)
    || normalizeFeishuTimestampMs(payload.createTime)
    || normalizeFeishuTimestampMs(event.create_time)
    || normalizeFeishuTimestampMs(event.createTime);
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
      eventCreateTimeMs,
      messageCreateTimeMs: null,
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
      messageType: null,
      text: null,
      attachments: [],
      directed: false,
    };
  }

  if (isCardActionEvent(eventType)) {
    return {
      kind: "card-action",
      eventType,
      eventId,
      eventCreateTimeMs,
      messageCreateTimeMs: null,
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
      messageType: null,
      text: null,
      attachments: [],
      directed: true,
    };
  }

  if (isBotMenuEvent(eventType)) {
    return {
      kind: "bot-menu",
      eventType,
      eventId,
      eventCreateTimeMs,
      messageCreateTimeMs: null,
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
      messageType: null,
      text: null,
      attachments: [],
      directed: true,
    };
  }

  if (isMessageEvent(eventType)) {
    const message = extractFeishuMessage(event);
    const chatType = message.chatType;
    const text = message.text;
    const directed = chatType !== "group" || Boolean(text && (text.startsWith("/") || text.startsWith("%")));
    return {
      kind: "message",
      eventType,
      eventId,
      eventCreateTimeMs,
      messageCreateTimeMs: message.messageCreateTimeMs,
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
      messageType: message.messageType,
      text: text || null,
      attachments: message.attachments,
      directed,
    };
  }

  return {
    kind: "unsupported",
    eventType: eventType || null,
    eventId,
    eventCreateTimeMs,
    messageCreateTimeMs: null,
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
    messageType: null,
    text: null,
    attachments: [],
    directed: false,
  };
}

export function safeEqualFeishuWebhookToken(actual: string | null | undefined, expected: string | null | undefined): boolean {
  const actualBuffer = Buffer.from(normalizeString(actual), "utf8");
  const expectedBuffer = Buffer.from(normalizeString(expected), "utf8");
  if (!actualBuffer.length || !expectedBuffer.length || actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
