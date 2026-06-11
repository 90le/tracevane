export const STUDIO_CHANNEL_MESSAGES_BLOCK = "studio-channel-messages";

export type ChannelConnectorOutboundMessagePlatform = "octo" | "feishu";

export interface ChannelConnectorOutboundMessageRequest {
  platform?: ChannelConnectorOutboundMessagePlatform | null;
  channelId: string;
  channelType?: number | null;
  chatId?: string | null;
  content: string;
  mentionUids: string[];
  mentionAll: boolean;
}

export interface ChannelConnectorExtractedOutboundMessages {
  replyText: string;
  messages: ChannelConnectorOutboundMessageRequest[];
  errors: string[];
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

function channelTypeFromTarget(target: string): { channelId: string; channelType: number | null; chatId: string | null } {
  const normalized = normalizeString(target);
  const match = normalized.match(/^(dm|user|uid|group|thread|chat):(.+)$/i);
  if (!match) return { channelId: normalized, channelType: null, chatId: null };
  const kind = match[1].toLowerCase();
  const value = normalizeString(match[2]);
  if (kind === "dm" || kind === "user" || kind === "uid") return { channelId: value, channelType: 1, chatId: null };
  if (kind === "group") return { channelId: value, channelType: 2, chatId: null };
  if (kind === "thread") return { channelId: value, channelType: 5, chatId: null };
  return { channelId: "", channelType: null, chatId: value };
}

function normalizeChannelType(value: unknown): number | null {
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
  const content = normalizeString(record.content ?? record.text ?? record.message);
  if (!content) return null;
  return {
    platform: platform === "octo" || platform === "feishu" ? platform : null,
    channelId,
    channelType,
    chatId,
    content,
    mentionUids: stringList(record.mentionUids ?? record.mention_uids ?? record.mentions),
    mentionAll: record.mentionAll === true || record.mention_all === true || record.mentionAll === 1 || record.mention_all === 1,
  };
}

export function extractChannelConnectorOutboundMessages(replyText: string | null | undefined): ChannelConnectorExtractedOutboundMessages {
  const source = normalizeString(replyText);
  if (!source) return { replyText: "", messages: [], errors: [] };
  const messages: ChannelConnectorOutboundMessageRequest[] = [];
  const errors: string[] = [];
  const pattern = new RegExp(
    "```[ \\t]*" + STUDIO_CHANNEL_MESSAGES_BLOCK + "[^\\r\\n]*\\r?\\n([\\s\\S]*?)```",
    "gi",
  );
  const stripped = source.replace(pattern, (_match, rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson.trim()) as unknown;
      const parsedMessages = arrayFromManifest(parsed)
        .map(outboundMessageFromValue)
        .filter((item): item is ChannelConnectorOutboundMessageRequest => item !== null);
      if (!parsedMessages.length) {
        errors.push("studio-channel-messages block did not include any valid message entries.");
      } else {
        messages.push(...parsedMessages);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "studio-channel-messages block is not valid JSON.");
    }
    return "";
  }).trim();
  return {
    replyText: stripped,
    messages,
    errors,
  };
}
