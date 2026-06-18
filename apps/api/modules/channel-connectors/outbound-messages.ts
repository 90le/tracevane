import type {
  ChannelConnectorOctoGroupMember,
} from "../../../../types/channel-connectors.js";

export const TRACEVANE_CHANNEL_MESSAGES_BLOCK = "tracevane-channel-messages";

export type ChannelConnectorOutboundMessagePlatform = "octo" | "feishu";
export type ChannelConnectorOutboundMessageFormat = "text" | "markdown";

export interface ChannelConnectorOutboundStructuredMention {
  uid: string;
  label: string;
}

export interface ChannelConnectorOutboundMessageRequest {
  platform?: ChannelConnectorOutboundMessagePlatform | null;
  channelId: string;
  channelType?: number | null;
  chatId?: string | null;
  content: string;
  format?: ChannelConnectorOutboundMessageFormat | null;
  onBehalfOf?: string | null;
  mentionUids: string[];
  structuredMentions?: ChannelConnectorOutboundStructuredMention[];
  mentionAll: boolean;
}

export interface ChannelConnectorExtractedOutboundMessages {
  replyText: string;
  messages: ChannelConnectorOutboundMessageRequest[];
  errors: string[];
}

export interface ChannelConnectorOctoOutboundTargetResolution {
  channelId: string;
  channelType: number;
  mentionUids: string[];
  error: string | null;
  remappedBotDm: boolean;
}

export type ChannelConnectorFeishuReceiveIdType = "chat_id" | "open_id" | "user_id";

export interface ChannelConnectorFeishuOutboundTargetResolution {
  receiveId: string;
  receiveIdType: ChannelConnectorFeishuReceiveIdType;
  error: string | null;
}

export interface ChannelConnectorRenderedFeishuOutboundMessage {
  content: string;
  nativeMentionIds: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFromManifest(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = recordFrom(value);
  return Array.isArray(record.messages) ? record.messages : [];
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeString).filter(Boolean))];
  }
  const normalized = normalizeString(value);
  if (!normalized) return [];
  return [...new Set(normalized.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean))];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

function isOctoGroupChannelType(channelType: number): boolean {
  return channelType === 2 || channelType === 5;
}

function isOctoBotUid(value: string): boolean {
  return normalizeString(value).toLowerCase().endsWith("_bot");
}

function uniqueStructuredMentions(values: ChannelConnectorOutboundStructuredMention[]): ChannelConnectorOutboundStructuredMention[] {
  const seen = new Set<string>();
  const output: ChannelConnectorOutboundStructuredMention[] = [];
  for (const item of values) {
    const uid = normalizeString(item.uid);
    const label = normalizeString(item.label);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    output.push({ uid, label });
  }
  return output;
}

function extractStructuredMentions(content: string): { content: string; mentions: ChannelConnectorOutboundStructuredMention[] } {
  const mentions: ChannelConnectorOutboundStructuredMention[] = [];
  const stripped = content.replace(/@\[([A-Za-z0-9_.:-]+):([^\]\r\n]+)\]/g, (_match, uid: string, label: string) => {
    const normalizedUid = normalizeString(uid);
    const normalizedLabel = normalizeString(label);
    if (normalizedUid) mentions.push({ uid: normalizedUid, label: normalizedLabel });
    return " ";
  });
  return {
    content: stripped
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim(),
    mentions: uniqueStructuredMentions(mentions),
  };
}

function stripProviderPrefix(target: string, provider: string): string {
  const normalized = normalizeString(target);
  return normalized.toLowerCase().startsWith(`${provider}:`)
    ? normalized.slice(provider.length + 1).trim()
    : normalized;
}

function channelTypeFromTarget(target: string): { channelId: string; channelType: number | null; chatId: string | null } {
  const normalized = normalizeString(target);
  const withoutProvider = stripProviderPrefix(stripProviderPrefix(normalized, "feishu"), "lark");
  const match = withoutProvider.match(/^(dm|user|uid|bot|group|thread|chat|channel|open_id|user_id):(.+)$/i);
  if (!match) return { channelId: withoutProvider, channelType: null, chatId: null };
  const kind = match[1].toLowerCase();
  const value = normalizeString(match[2]);
  if (kind === "dm" || kind === "user" || kind === "uid" || kind === "bot") return { channelId: value, channelType: 1, chatId: null };
  if (kind === "group") return { channelId: value, channelType: 2, chatId: null };
  if (kind === "thread") return { channelId: value, channelType: 5, chatId: null };
  if (kind === "open_id" || kind === "user_id") return { channelId: `${kind}:${value}`, channelType: null, chatId: null };
  return { channelId: "", channelType: null, chatId: value };
}

function normalizeChannelType(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeString(value);
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const lower = normalized.toLowerCase();
  if (["dm", "direct", "user", "uid", "private"].includes(lower)) return 1;
  if (["group", "room"].includes(lower)) return 2;
  if (["thread", "topic"].includes(lower)) return 5;
  return null;
}

function normalizeOutboundMessageFormat(record: Record<string, unknown>): ChannelConnectorOutboundMessageFormat | null {
  const raw = normalizeString(
    record.format
      || record.messageFormat
      || record.message_format
      || record.messageType
      || record.message_type
      || record.msgType
      || record.msg_type
      || record.contentType
      || record.content_type
      || record.type,
  ).toLowerCase();
  if (!raw) return null;
  if (["markdown", "md", "post", "rich", "rich_text", "rich-text"].includes(raw)) return "markdown";
  if (["text", "plain", "plain_text", "plain-text"].includes(raw)) return "text";
  return null;
}

function outboundMessageFromValue(value: unknown): ChannelConnectorOutboundMessageRequest | null {
  const record = recordFrom(value);
  const platform = normalizeString(record.platform).toLowerCase();
  const target = normalizeString(record.target);
  const targetParts = channelTypeFromTarget(target);
  const chatId = normalizeString(record.chatId || record.chat_id || targetParts.chatId) || null;
  const channelId = normalizeString(
    record.channelId
      || record.channel_id
      || record.to
      || record.uid
      || record.userId
      || record.user_id
      || targetParts.channelId,
  );
  const channelType = normalizeChannelType(record.channelType ?? record.channel_type ?? record.type) ?? targetParts.channelType;
  const rawContent = normalizeString(record.content ?? record.text ?? record.message);
  const structuredMentions = extractStructuredMentions(rawContent);
  const content = structuredMentions.content;
  const onBehalfOf = normalizeString(
    record.onBehalfOf
      || record.on_behalf_of
      || record.respondAs
      || record.respond_as,
  ) || null;
  if (!content) return null;
  return {
    platform: platform === "octo" || platform === "feishu" ? platform : null,
    channelId,
    channelType,
    chatId,
    content,
    format: normalizeOutboundMessageFormat(record),
    onBehalfOf,
    mentionUids: uniqueStrings([
      ...stringList(record.mentionUids ?? record.mention_uids ?? record.mentions),
      ...structuredMentions.mentions.map((mention) => mention.uid),
    ]),
    structuredMentions: structuredMentions.mentions,
    mentionAll: record.mentionAll === true
      || record.mention_all === true
      || record.mentionAll === 1
      || record.mention_all === 1
      || /(?:^|(?<=\s))@(?:all|所有人)(?=\s|[^\w]|$)/i.test(rawContent),
  };
}

export function extractChannelConnectorOutboundMessages(replyText: string | null | undefined): ChannelConnectorExtractedOutboundMessages {
  const source = normalizeString(replyText);
  if (!source) return { replyText: "", messages: [], errors: [] };
  const messages: ChannelConnectorOutboundMessageRequest[] = [];
  const errors: string[] = [];
  const pattern = new RegExp(
    "```[ \\t]*" + TRACEVANE_CHANNEL_MESSAGES_BLOCK + "[^\\r\\n]*\\r?\\n([\\s\\S]*?)```",
    "gi",
  );
  const stripped = source.replace(pattern, (_match, rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson.trim()) as unknown;
      const parsedMessages = arrayFromManifest(parsed)
        .map(outboundMessageFromValue)
        .filter((item): item is ChannelConnectorOutboundMessageRequest => item !== null);
      if (!parsedMessages.length) {
        errors.push("tracevane-channel-messages block did not include any valid message entries.");
      } else {
        messages.push(...parsedMessages);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "tracevane-channel-messages block is not valid JSON.");
    }
    return "";
  }).trim();
  return {
    replyText: stripped,
    messages,
    errors,
  };
}

export function resolveOctoOutboundMessageTarget(input: {
  message: ChannelConnectorOutboundMessageRequest;
  sourceChannelId: string | null | undefined;
  sourceChannelType: number | null | undefined;
}): ChannelConnectorOctoOutboundTargetResolution {
  const sourceChannelId = normalizeString(input.sourceChannelId);
  const sourceChannelType = Number(input.sourceChannelType);
  const channelId = normalizeString(input.message.channelId);
  const channelType = Number(input.message.channelType || 1);
  const mentionUids = uniqueStrings(input.message.mentionUids);
  const targetIsBotUid = isOctoBotUid(channelId);
  if (!targetIsBotUid) {
    return {
      channelId,
      channelType,
      mentionUids,
      error: null,
      remappedBotDm: false,
    };
  }
  if (sourceChannelId && isOctoGroupChannelType(sourceChannelType)) {
    return {
      channelId: sourceChannelId,
      channelType: sourceChannelType,
      mentionUids: uniqueStrings([...mentionUids, channelId]),
      error: null,
      remappedBotDm: true,
    };
  }
  return {
    channelId,
    channelType,
    mentionUids,
    error: `${channelId}: Octo Bot API does not support bot channel targets; use a group/thread mention or Tracevane internal agent routing.`,
    remappedBotDm: false,
  };
}

function normalizeFeishuTargetValue(value: string): string {
  return stripProviderPrefix(stripProviderPrefix(value, "feishu"), "lark");
}

function feishuTargetReceiveIdType(value: string): ChannelConnectorFeishuReceiveIdType {
  const normalized = normalizeFeishuTargetValue(value);
  const lower = normalized.toLowerCase();
  if (lower.startsWith("chat:") || lower.startsWith("group:") || lower.startsWith("channel:")) return "chat_id";
  if (lower.startsWith("open_id:")) return "open_id";
  if (lower.startsWith("user_id:")) return "user_id";
  if (lower.startsWith("user:") || lower.startsWith("dm:") || lower.startsWith("uid:")) {
    const id = normalized.replace(/^(user|dm|uid):/i, "").trim();
    return id.startsWith("ou_") ? "open_id" : "user_id";
  }
  if (normalized.startsWith("oc_")) return "chat_id";
  if (normalized.startsWith("ou_")) return "open_id";
  return "user_id";
}

function stripFeishuTargetPrefix(value: string): string {
  const normalized = normalizeFeishuTargetValue(value);
  return normalized.replace(/^(chat|group|channel|open_id|user_id|user|dm|uid):/i, "").trim();
}

function feishuMentionId(value: string): string {
  return stripFeishuTargetPrefix(value);
}

function escapeFeishuAtTagText(value: string): string {
  return normalizeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeFeishuAtTagAttribute(value: string): string {
  return escapeFeishuAtTagText(value).replace(/"/g, "&quot;");
}

function feishuMemberLabel(
  id: string,
  members: readonly ChannelConnectorOctoGroupMember[],
  structuredMentions: readonly ChannelConnectorOutboundStructuredMention[],
): string {
  const normalizedId = feishuMentionId(id);
  const structured = structuredMentions.find((mention) => feishuMentionId(mention.uid) === normalizedId);
  if (structured?.label) return structured.label;
  const member = members.find((item) => feishuMentionId(item.uid) === normalizedId);
  return normalizeString(member?.name) || normalizedId;
}

export function resolveFeishuOutboundMessageTarget(
  message: ChannelConnectorOutboundMessageRequest,
): ChannelConnectorFeishuOutboundTargetResolution {
  const raw = normalizeString(message.chatId || message.channelId);
  const receiveId = stripFeishuTargetPrefix(raw);
  if (!receiveId) {
    return {
      receiveId: "",
      receiveIdType: "chat_id",
      error: "Feishu outbound message requires chat/open_id/user_id target.",
    };
  }
  return {
    receiveId,
    receiveIdType: feishuTargetReceiveIdType(raw),
    error: null,
  };
}

export function renderFeishuOutboundMessageContent(input: {
  message: ChannelConnectorOutboundMessageRequest;
  target: ChannelConnectorFeishuOutboundTargetResolution;
  members?: readonly ChannelConnectorOctoGroupMember[] | null;
}): ChannelConnectorRenderedFeishuOutboundMessage {
  const content = normalizeString(input.message.content);
  if (input.target.error || input.target.receiveIdType !== "chat_id") {
    return { content, nativeMentionIds: [] };
  }
  const members = input.members || [];
  const structuredMentions = input.message.structuredMentions || [];
  const nativeMentionIds = uniqueStrings([
    ...structuredMentions.map((mention) => feishuMentionId(mention.uid)),
    ...input.message.mentionUids.map(feishuMentionId),
  ]);
  if (!nativeMentionIds.length) return { content, nativeMentionIds: [] };
  const prefix = nativeMentionIds.map((id) => {
    const label = feishuMemberLabel(id, members, structuredMentions);
    return `<at user_id="${escapeFeishuAtTagAttribute(id)}">${escapeFeishuAtTagText(label)}</at>`;
  }).join(" ");
  return {
    content: `${prefix}${content ? ` ${content}` : ""}`.trim(),
    nativeMentionIds,
  };
}
