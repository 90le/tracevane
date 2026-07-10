import type {
  ChannelConnectorFeishuParsedWebhook,
} from "./feishu-adapter.js";
import type {
  ChannelConnectorIngressEnvelope,
  ChannelConnectorOctoInboundMessage,
} from "../../../../types/channel-connectors.js";
import { extractOctoContent } from "./octo-adapter.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

export function channelConnectorIngressDedupeKey(envelope: ChannelConnectorIngressEnvelope): string {
  const identity = envelope.eventId
    || [envelope.messageId || "", envelope.eventType].filter(Boolean).join(":");
  return `${envelope.platform}:${envelope.accountId}:${identity}`;
}

export function octoIngressEnvelope(
  accountId: string,
  message: ChannelConnectorOctoInboundMessage,
  receivedAt = new Date().toISOString(),
): ChannelConnectorIngressEnvelope {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const mention = message.payload?.mention;
  return {
    eventId: normalizeString(message.messageId),
    eventType: "message",
    messageId: normalizeString(message.messageId) || null,
    accountId,
    platform: "octo",
    peer: {
      kind: message.channelType === 1 ? "private" : "group",
      id: normalizeString(message.channelId) || normalizeString(message.fromUid),
    },
    senderId: normalizeString(message.fromUid),
    threadId: normalizeString(metadata.threadId ?? metadata.thread_id) || null,
    mentions: uniqueStrings([
      ...(Array.isArray(mention?.uids) ? mention.uids : []),
    ]),
    content: { text: extractOctoContent(message) },
    attachments: message.attachments || [],
    receivedAt,
    rawRef: null,
  };
}

export function feishuIngressEnvelope(
  accountId: string,
  parsed: ChannelConnectorFeishuParsedWebhook,
  receivedAt = new Date().toISOString(),
): ChannelConnectorIngressEnvelope {
  return {
    eventId: normalizeString(parsed.eventId)
      || normalizeString(parsed.messageId)
      || `${parsed.kind}:${receivedAt}`,
    eventType: normalizeString(parsed.eventType) || parsed.kind,
    messageId: normalizeString(parsed.messageId) || null,
    accountId,
    platform: "feishu",
    peer: {
      kind: normalizeString(parsed.chatType).toLowerCase().includes("group") ? "group" : "private",
      id: normalizeString(parsed.channelId) || normalizeString(parsed.fromUid),
    },
    senderId: normalizeString(parsed.fromUid),
    threadId: normalizeString(parsed.threadId) || null,
    mentions: uniqueStrings(parsed.mentions.flatMap((mention) => [
      mention.openId,
      mention.userId,
      mention.unionId,
    ])),
    content: { text: normalizeString(parsed.text) },
    attachments: parsed.attachments,
    receivedAt,
    rawRef: normalizeString(parsed.eventId) || normalizeString(parsed.messageId) || null,
  };
}
