import type {
  ChannelConnectorAgentProfile,
  ChannelConnectorInboundAttachment,
  ChannelConnectorOctoDispatchResponse,
  ChannelConnectorOctoChannelType,
  ChannelConnectorOctoGroupMember,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorOctoMentionEntity,
  ChannelConnectorOctoReplyPlan,
  ChannelConnectorOctoTransportResult,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";
import { splitChannelConnectorTextChunks } from "./text-chunks.js";

const OCTO_MESSAGE_TYPE_TEXT = 1;
const OCTO_MESSAGE_TYPE_IMAGE = 2;
const OCTO_MESSAGE_TYPE_GIF = 3;
const OCTO_MESSAGE_TYPE_VOICE = 4;
const OCTO_MESSAGE_TYPE_VIDEO = 5;
const OCTO_MESSAGE_TYPE_LOCATION = 6;
const OCTO_MESSAGE_TYPE_FILE = 8;
const OCTO_MESSAGE_TYPE_RICH_TEXT = 14;
const OCTO_RICH_TEXT_BLOCK_IMAGE = "image";
const OCTO_RICH_TEXT_BLOCK_TEXT = "text";
const OCTO_RICH_TEXT_IMAGE_PLACEHOLDER = "[图片]";
const OCTO_CHANNEL_TYPE_DM = 1;
const OCTO_CHANNEL_TYPE_GROUP = 2;
const OCTO_CHANNEL_TYPE_COMMUNITY_TOPIC = 5;
const OCTO_MAX_TEXT_CHUNK_RUNES = 3800;

export interface ChannelConnectorsOctoResolvedBinding {
  binding: ChannelConnectorPlatformBinding;
  agentProfile: ChannelConnectorAgentProfile;
}

export interface ChannelConnectorOctoPersonaRouting {
  skipReason: string | null;
  replyChannelId: string | null;
  replyChannelType: ChannelConnectorOctoChannelType | null;
  replyOnBehalfOf: string | null;
  personaSystemPrompt: string | null;
  triggeredByPersona: boolean;
  oboTrusted: boolean;
  oboRejectedReason: string | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOctoAccountId(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function sameOctoAccountId(a: unknown, b: unknown): boolean {
  const left = normalizeOctoAccountId(a);
  const right = normalizeOctoAccountId(b);
  return Boolean(left && right && left === right);
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataString(binding: ChannelConnectorPlatformBinding, keys: string[]): string {
  const metadata = recordFrom(binding.metadata);
  for (const key of keys) {
    const value = normalizeString(metadata[key]);
    if (value) return value;
  }
  return "";
}

function looksLikeHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function extractOctoUrlFromRecord(value: unknown): string {
  const record = recordFrom(value);
  const directKeys = [
    "url",
    "file_url",
    "fileUrl",
    "media_url",
    "mediaUrl",
    "download_url",
    "downloadUrl",
    "cdn_url",
    "cdnUrl",
    "origin_url",
    "originUrl",
    "src",
    "href",
  ];
  for (const key of directKeys) {
    const candidate = normalizeString(record[key]);
    if (candidate) return candidate;
  }
  const content = normalizeString(record.content);
  return looksLikeHttpUrl(content) ? content : "";
}

function extractOctoFilePathFromRecord(value: unknown): string {
  const record = recordFrom(value);
  const pathKeys = [
    "file_path",
    "filePath",
    "download_path",
    "downloadPath",
    "object_key",
    "objectKey",
    "storage_key",
    "storageKey",
  ];
  for (const key of pathKeys) {
    const candidate = normalizeString(record[key]);
    if (candidate && !looksLikeHttpUrl(candidate)) return candidate;
  }
  return "";
}

function extractOctoUrlsFromValue(value: unknown): string[] {
  if (typeof value === "string") return looksLikeHttpUrl(value) ? [value] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractOctoUrlsFromValue(item));
  }
  const record = recordFrom(value);
  const urls = [
    normalizeString(record.url),
    normalizeString(record.file_url),
    normalizeString(record.fileUrl),
    normalizeString(record.media_url),
    normalizeString(record.mediaUrl),
    normalizeString(record.download_url),
    normalizeString(record.downloadUrl),
    normalizeString(record.cdn_url),
    normalizeString(record.cdnUrl),
    normalizeString(record.origin_url),
    normalizeString(record.originUrl),
    normalizeString(record.src),
    normalizeString(record.href),
  ].filter(Boolean);
  const content = normalizeString(record.content);
  if (looksLikeHttpUrl(content)) urls.push(content);
  return uniqueStrings(urls);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

export function isOctoGroupChannel(channelType: number): boolean {
  return channelType === OCTO_CHANNEL_TYPE_GROUP || channelType === OCTO_CHANNEL_TYPE_COMMUNITY_TOPIC;
}

function normalizeOctoChannelType(value: unknown): ChannelConnectorOctoChannelType | null {
  const channelType = typeof value === "number" ? value : Number(value);
  return channelType === OCTO_CHANNEL_TYPE_DM
    || channelType === OCTO_CHANNEL_TYPE_GROUP
    || channelType === OCTO_CHANNEL_TYPE_COMMUNITY_TOPIC
    ? channelType
    : null;
}

export function octoOnBehalfOfFromBinding(binding: ChannelConnectorPlatformBinding): string | null {
  return metadataString(binding, [
    "onBehalfOf",
    "on_behalf_of",
    "respondAs",
    "respond_as",
    "grantorUid",
    "grantor_uid",
  ]) || null;
}

function octoMentionUids(message: ChannelConnectorOctoInboundMessage): string[] {
  const mention = message.payload.mention;
  return Array.isArray(mention?.uids) ? mention.uids.map(normalizeString).filter(Boolean) : [];
}

function octoMentionFlags(message: ChannelConnectorOctoInboundMessage): {
  all: boolean;
  ais: boolean;
  humans: boolean;
  uids: string[];
} {
  const mention = message.payload.mention;
  return {
    all: mention?.all === true || mention?.all === 1,
    ais: mention?.ais === true || mention?.ais === 1,
    humans: mention?.humans === true || mention?.humans === 1,
    uids: octoMentionUids(message),
  };
}

function octoMentionIncludesUid(message: ChannelConnectorOctoInboundMessage, uid: unknown): boolean {
  const normalizedUid = normalizeOctoAccountId(uid);
  return Boolean(normalizedUid && octoMentionUids(message).some((candidate) => normalizeOctoAccountId(candidate) === normalizedUid));
}

export function buildOctoSessionKey(message: ChannelConnectorOctoInboundMessage): string {
  if (message.channelType === OCTO_CHANNEL_TYPE_DM) return `dmwork:dm:${message.fromUid}`;
  if (isOctoGroupChannel(message.channelType)) return `dmwork:group:${message.channelId}`;
  return `dmwork:dm:${message.fromUid}`;
}

function isSystemOctoMessage(message: ChannelConnectorOctoInboundMessage): boolean {
  const fromUid = normalizeString(message.fromUid);
  return message.payload.type === 99 || !fromUid || fromUid === "system" || message.channelId === "systemcmdonline";
}

export function isOctoMessageDirectedAtBot(
  message: ChannelConnectorOctoInboundMessage,
  botId: string | null,
  onBehalfOf: string | null = null,
): boolean {
  if (!isOctoGroupChannel(message.channelType)) return true;
  const mention = message.payload.mention;
  const flags = octoMentionFlags(message);
  const normalizedBotId = normalizeOctoAccountId(botId);
  if (normalizedBotId && flags.uids.some((uid) => normalizeOctoAccountId(uid) === normalizedBotId)) return true;
  const normalizedGrantor = normalizeOctoAccountId(onBehalfOf);
  const grantorMentioned = Boolean(normalizedGrantor && flags.uids.some((uid) => normalizeOctoAccountId(uid) === normalizedGrantor));
  const broadcast = flags.all || flags.humans;
  if (flags.ais && !broadcast) return true;
  if (normalizedGrantor && (flags.humans || flags.all || grantorMentioned)) return true;
  if (message.payload.reply && (message.payload.reply.messageId || message.payload.reply.message_id)) return true;
  return normalizeString(message.payload.content).startsWith("/");
}

function stripLeadingMention(content: string): string {
  let next = normalizeString(content);
  while (next.startsWith("@")) {
    const index = next.indexOf(" ");
    if (index <= 0) break;
    next = next.slice(index + 1).trim();
  }
  return next;
}

const OCTO_PAYLOAD_TEXT_KEYS = [
  "plain",
  "text",
  "content",
  "caption",
  "title",
  "name",
  "description",
  "summary",
  "alt",
  "markdown",
  "md",
  "message",
  "body",
  "value",
];
const OCTO_PAYLOAD_CONTAINER_KEYS = [
  "elements",
  "children",
  "blocks",
  "items",
  "paragraphs",
  "lines",
  "rows",
  "cells",
  "fields",
  "data",
  "payload",
  "zh_cn",
  "en_us",
];
const OCTO_PAYLOAD_TEXT_MAX_DEPTH = 6;

function joinOctoPayloadTextParts(parts: string[]): string {
  const output: string[] = [];
  for (const part of parts) {
    const normalized = normalizeString(part).replace(/[ \t]{2,}/g, " ");
    if (!normalized) continue;
    if (output[output.length - 1] === normalized) continue;
    output.push(normalized);
  }
  return output.join("\n").trim();
}

function octoPayloadMediaPlaceholder(value: unknown): string {
  const record = recordFrom(value);
  const type = Number(record.type);
  const stringType = normalizeString(record.type).toLowerCase();
  const name = normalizeString(record.name)
    || normalizeString(record.title)
    || normalizeString(record.file_name)
    || normalizeString(record.fileName);
  if (stringType === OCTO_RICH_TEXT_BLOCK_IMAGE) return OCTO_RICH_TEXT_IMAGE_PLACEHOLDER;
  if (type === OCTO_MESSAGE_TYPE_IMAGE) return `[image${name ? `: ${name}` : ""}]`;
  if (type === OCTO_MESSAGE_TYPE_GIF) return `[gif${name ? `: ${name}` : ""}]`;
  if (type === OCTO_MESSAGE_TYPE_FILE) return `[file: ${name || "file"}]`;
  if (type === OCTO_MESSAGE_TYPE_VOICE) return `[voice${name ? `: ${name}` : ""}]`;
  if (type === OCTO_MESSAGE_TYPE_VIDEO) return `[video${name ? `: ${name}` : ""}]`;
  return "";
}

function extractOctoPayloadTextParts(value: unknown, depth = 0): string[] {
  if (depth > OCTO_PAYLOAD_TEXT_MAX_DEPTH) return [];
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractOctoPayloadTextParts(item, depth + 1));
  }
  if (typeof value !== "object" || value === null) return [];
  const record = recordFrom(value);
  const placeholder = octoPayloadMediaPlaceholder(record);
  if (placeholder) {
    const mediaText = ["plain", "text", "content", "caption", "description", "summary", "alt", "markdown", "md"]
      .flatMap((key) => key in record ? extractOctoPayloadTextParts(record[key], depth + 1) : []);
    return mediaText.length > 0 ? mediaText : [placeholder];
  }
  const directParts: string[] = [];
  for (const key of OCTO_PAYLOAD_TEXT_KEYS) {
    if (!(key in record)) continue;
    directParts.push(...extractOctoPayloadTextParts(record[key], depth + 1));
  }
  if (directParts.length > 0) return directParts;
  const nestedParts: string[] = [];
  for (const key of OCTO_PAYLOAD_CONTAINER_KEYS) {
    if (!(key in record)) continue;
    nestedParts.push(...extractOctoPayloadTextParts(record[key], depth + 1));
  }
  return nestedParts;
}

export function extractOctoPayloadText(payload: unknown): string {
  return joinOctoPayloadTextParts(extractOctoPayloadTextParts(payload));
}

export function extractOctoContent(message: ChannelConnectorOctoInboundMessage): string {
  const payload = message.payload || {};
  let content = "";
  switch (payload.type) {
    case OCTO_MESSAGE_TYPE_TEXT:
      content = extractOctoPayloadText(payload);
      break;
    case OCTO_MESSAGE_TYPE_IMAGE:
      content = octoPayloadMediaPlaceholder(payload) || "[image]";
      break;
    case OCTO_MESSAGE_TYPE_GIF:
      content = octoPayloadMediaPlaceholder(payload) || "[gif]";
      break;
    case OCTO_MESSAGE_TYPE_FILE:
      content = octoPayloadMediaPlaceholder(payload) || `[file: ${normalizeString(payload.name) || "file"}]`;
      break;
    case OCTO_MESSAGE_TYPE_VOICE:
      content = octoPayloadMediaPlaceholder(payload) || "[voice]";
      break;
    case OCTO_MESSAGE_TYPE_VIDEO:
      content = octoPayloadMediaPlaceholder(payload) || "[video]";
      break;
    case OCTO_MESSAGE_TYPE_LOCATION:
      content = extractOctoPayloadText(payload);
      break;
    case OCTO_MESSAGE_TYPE_RICH_TEXT:
      content = extractOctoRichTextPlain(payload) || extractOctoPayloadText(payload) || "[rich text]";
      break;
    default:
      content = extractOctoPayloadText(payload) || `[message type: ${payload.type ?? "unknown"}]`;
      break;
  }
  return isOctoGroupChannel(message.channelType) ? stripLeadingMention(content) : content;
}

function extractOctoRichTextBlocks(payload: ChannelConnectorOctoInboundMessage["payload"]): Record<string, unknown>[] {
  const content = payload.content;
  if (Array.isArray(content)) return content.map(recordFrom).filter((block) => Object.keys(block).length > 0);
  if (typeof content === "string" && content) {
    return [{ type: OCTO_RICH_TEXT_BLOCK_TEXT, text: content }];
  }
  return [];
}

function extractOctoRichTextPlain(payload: ChannelConnectorOctoInboundMessage["payload"]): string {
  const plain = normalizeString(payload.plain);
  if (plain) return plain;
  return extractOctoRichTextBlocks(payload)
    .map((block) => {
      const type = normalizeString(block.type).toLowerCase();
      if (type === OCTO_RICH_TEXT_BLOCK_IMAGE) return OCTO_RICH_TEXT_IMAGE_PLACEHOLDER;
      return normalizeString(block.text);
    })
    .filter(Boolean)
    .join("");
}

function extractOctoRichTextAttachments(payload: ChannelConnectorOctoInboundMessage["payload"]): ChannelConnectorInboundAttachment[] {
  const blocks = extractOctoRichTextBlocks(payload);
  const attachments: ChannelConnectorInboundAttachment[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (normalizeString(block.type).toLowerCase() !== OCTO_RICH_TEXT_BLOCK_IMAGE) continue;
    const url = extractOctoUrlFromRecord(block);
    const filePath = extractOctoFilePathFromRecord(block);
    attachments.push({
      kind: "image",
      platform: "octo",
      key: url || filePath || normalizeString(block.name) || `rich-text-image-${index + 1}`,
      url: url || null,
      filePath: filePath || null,
      fileName: normalizeString(block.name) || null,
      size: typeof block.size === "number" ? block.size : null,
    });
  }
  const sidecarUrls = uniqueStrings([
    ...extractOctoUrlsFromValue(payload.media_urls),
    ...extractOctoUrlsFromValue(payload.mediaUrls),
  ]);
  for (const url of sidecarUrls) {
    if (attachments.some((attachment) => attachment.url === url)) continue;
    attachments.push({
      kind: "image",
      platform: "octo",
      key: url,
      url,
      fileName: null,
      size: null,
    });
  }
  return attachments;
}

export function extractOctoAttachments(message: ChannelConnectorOctoInboundMessage): ChannelConnectorInboundAttachment[] {
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments.map((attachment) => ({
      ...attachment,
      url: normalizeString(attachment.url) || extractOctoUrlFromRecord(attachment) || null,
    }));
  }
  const payload = message.payload || {};
  const url = extractOctoUrlFromRecord(payload);
  const filePath = extractOctoFilePathFromRecord(payload);
  const key = url || filePath || normalizeString(payload.name) || null;
  switch (payload.type) {
    case OCTO_MESSAGE_TYPE_IMAGE:
      return [{
        kind: "image",
        platform: "octo",
        key,
        url: url || null,
        filePath: filePath || null,
        fileName: normalizeString(payload.name) || null,
        size: typeof payload.size === "number" ? payload.size : null,
      }];
    case OCTO_MESSAGE_TYPE_GIF:
      return [{
        kind: "image",
        platform: "octo",
        key,
        url: url || null,
        filePath: filePath || null,
        fileName: normalizeString(payload.name) || null,
        size: typeof payload.size === "number" ? payload.size : null,
      }];
    case OCTO_MESSAGE_TYPE_FILE:
      return [{
        kind: "file",
        platform: "octo",
        key,
        url: url || null,
        filePath: filePath || null,
        fileName: normalizeString(payload.name) || null,
        size: typeof payload.size === "number" ? payload.size : null,
      }];
    case OCTO_MESSAGE_TYPE_VOICE:
      return [{
        kind: "audio",
        platform: "octo",
        key,
        url: url || null,
        filePath: filePath || null,
        fileName: normalizeString(payload.name) || null,
        size: typeof payload.size === "number" ? payload.size : null,
      }];
    case OCTO_MESSAGE_TYPE_VIDEO:
      return [{
        kind: "video",
        platform: "octo",
        key,
        url: url || null,
        filePath: filePath || null,
        fileName: normalizeString(payload.name) || null,
        size: typeof payload.size === "number" ? payload.size : null,
      }];
    case OCTO_MESSAGE_TYPE_RICH_TEXT:
      return extractOctoRichTextAttachments(payload);
    default:
      return [];
  }
}

export function attachExtractedOctoAttachments(
  message: ChannelConnectorOctoInboundMessage,
): ChannelConnectorOctoInboundMessage {
  const attachments = extractOctoAttachments(message);
  if (attachments.length === 0) return message;
  return {
    ...message,
    attachments,
  };
}

export function stripOctoReplyFooter(content: string): string {
  const lines = String(content || "").split("\n");
  if (lines.length <= 1) return content;
  const lastLine = lines[lines.length - 1].trim();
  if (
    lastLine.includes(" · ")
    && (lastLine.includes("remaining") || lastLine.includes("剩余") || lastLine.includes("%") || lastLine.startsWith("[ctx:"))
  ) {
    return lines.slice(0, -1).join("\n");
  }
  return content;
}

export function splitOctoTextChunks(content: string, maxRunes = OCTO_MAX_TEXT_CHUNK_RUNES): string[] {
  return splitChannelConnectorTextChunks(content, maxRunes);
}

function isMentionNameDelimiter(value: string): boolean {
  return /[\s,.;:!?，。；：！？、]/u.test(value);
}

function cleanMentionContent(content: string): string {
  return content
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function sameOctoUid(a: unknown, b: unknown): boolean {
  const left = normalizeOctoAccountId(a);
  const right = normalizeOctoAccountId(b);
  return Boolean(left && right && left === right);
}

function memberDisplayNameByUid(members: ChannelConnectorOctoGroupMember[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const member of members) {
    const uid = normalizeString(member.uid);
    const name = normalizeString(member.name);
    if (uid && name) names.set(normalizeOctoAccountId(uid), name);
  }
  return names;
}

export function buildOctoPersonaGroupSystemPrompt(
  grantorUid: string,
  members: ChannelConnectorOctoGroupMember[] = [],
): string {
  const grantorName = memberDisplayNameByUid(members).get(normalizeOctoAccountId(grantorUid)) || grantorUid;
  return `你是${grantorName}的AI分身（persona clone）。当群里有人@${grantorName}或@所有人时，就是在叫你，你应当以${grantorName}的身份回复，不要返回 NO_REPLY。`;
}

function isOctoTrustedOboMessage(
  message: ChannelConnectorOctoInboundMessage,
  grantorUid: string | null,
): boolean {
  const payload = message.payload || {};
  const originChannel = normalizeString(payload.obo_origin_channel_id);
  const respondAs = normalizeString(payload.obo_respond_as) || normalizeString(payload.obo_grantor_uid);
  return Boolean(originChannel && respondAs && grantorUid && sameOctoAccountId(message.fromUid, grantorUid));
}

function octoOboPayloadRejectedReason(
  message: ChannelConnectorOctoInboundMessage,
  grantorUid: string | null,
): string | null {
  const payload = message.payload || {};
  const originChannel = normalizeString(payload.obo_origin_channel_id);
  if (!originChannel) return null;
  const respondAs = normalizeString(payload.obo_respond_as) || normalizeString(payload.obo_grantor_uid);
  if (!respondAs) return "octo_obo_missing_respond_as";
  if (!grantorUid) return "octo_obo_grantor_not_configured";
  if (!sameOctoAccountId(message.fromUid, grantorUid)) return "octo_obo_untrusted_sender";
  return null;
}

function isOctoOboRelevantToPersona(
  message: ChannelConnectorOctoInboundMessage,
  grantorUid: string,
): boolean {
  const flags = octoMentionFlags(message);
  const grantorMentioned = octoMentionIncludesUid(message, grantorUid);
  const noMentionPayload = !flags.ais && !flags.humans && !flags.all && flags.uids.length === 0;
  return flags.humans || flags.all || grantorMentioned || noMentionPayload;
}

export function resolveOctoPersonaRouting(
  message: ChannelConnectorOctoInboundMessage,
  binding: ChannelConnectorPlatformBinding,
): ChannelConnectorOctoPersonaRouting {
  const grantorUid = octoOnBehalfOfFromBinding(binding);
  const oboRejectedReason = octoOboPayloadRejectedReason(message, grantorUid);
  const oboTrusted = isOctoTrustedOboMessage(message, grantorUid);
  if (oboTrusted && grantorUid && !isOctoOboRelevantToPersona(message, grantorUid)) {
    return {
      skipReason: "octo_obo_message_not_relevant",
      replyChannelId: null,
      replyChannelType: null,
      replyOnBehalfOf: null,
      personaSystemPrompt: null,
      triggeredByPersona: false,
      oboTrusted: true,
      oboRejectedReason: null,
    };
  }
  if (oboTrusted && grantorUid) {
    const payload = message.payload || {};
    const originChannel = normalizeString(payload.obo_origin_channel_id);
    const originChannelType = normalizeOctoChannelType(payload.obo_origin_channel_type) || OCTO_CHANNEL_TYPE_GROUP;
    const originFromUid = normalizeString(payload.obo_origin_from_uid);
    const replyChannelId = originChannelType === OCTO_CHANNEL_TYPE_DM
      ? originFromUid || originChannel
      : originChannel;
    return {
      skipReason: null,
      replyChannelId,
      replyChannelType: originChannelType,
      replyOnBehalfOf: grantorUid,
      personaSystemPrompt: normalizeString(payload.obo_system_hint) || null,
      triggeredByPersona: true,
      oboTrusted: true,
      oboRejectedReason: null,
    };
  }

  if (isOctoGroupChannel(message.channelType) && grantorUid) {
    const flags = octoMentionFlags(message);
    const explicitBotMention = octoMentionIncludesUid(message, binding.botId);
    const grantorMentioned = octoMentionIncludesUid(message, grantorUid);
    const triggeredByPersona = (flags.humans || flags.all || grantorMentioned) && !explicitBotMention;
    if (triggeredByPersona) {
      return {
        skipReason: null,
        replyChannelId: message.channelId,
        replyChannelType: message.channelType,
        replyOnBehalfOf: grantorUid,
        personaSystemPrompt: buildOctoPersonaGroupSystemPrompt(grantorUid, message.members || []),
        triggeredByPersona: true,
        oboTrusted: false,
        oboRejectedReason,
      };
    }
  }

  return {
    skipReason: null,
    replyChannelId: null,
    replyChannelType: null,
    replyOnBehalfOf: null,
    personaSystemPrompt: null,
    triggeredByPersona: false,
    oboTrusted: false,
    oboRejectedReason,
  };
}

export function applyOctoPersonaRouting(
  message: ChannelConnectorOctoInboundMessage,
  routing: ChannelConnectorOctoPersonaRouting,
): ChannelConnectorOctoInboundMessage {
  if (
    !routing.replyChannelId
    && !routing.replyChannelType
    && !routing.replyOnBehalfOf
    && !routing.personaSystemPrompt
    && !routing.triggeredByPersona
    && !routing.oboTrusted
    && !routing.oboRejectedReason
  ) {
    return message;
  }
  return {
    ...message,
    replyChannelId: routing.replyChannelId,
    replyChannelType: routing.replyChannelType,
    replyOnBehalfOf: routing.replyOnBehalfOf,
    personaSystemPrompt: routing.personaSystemPrompt,
    personaTriggered: routing.triggeredByPersona,
    oboTrusted: routing.oboTrusted,
    oboRejectedReason: routing.oboRejectedReason,
  };
}

function visibleStructuredMention(uid: string, members: ChannelConnectorOctoGroupMember[]): string {
  const name = memberDisplayNameByUid(members).get(normalizeOctoAccountId(uid)) || uid;
  return `@[${uid}:${name}]`;
}

function contentHasVisibleMentionForUid(
  content: string,
  uid: string,
  members: ChannelConnectorOctoGroupMember[],
): boolean {
  const normalizedUid = normalizeOctoAccountId(uid);
  if (!normalizedUid) return false;
  const structuredPattern = /@\[([A-Za-z0-9_.:-]+):([^\]\r\n]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = structuredPattern.exec(content)) !== null) {
    if (sameOctoUid(match[1], uid)) return true;
  }
  const displayName = memberDisplayNameByUid(members).get(normalizedUid);
  return Boolean(displayName && content.includes(`@${displayName}`));
}

function prependMissingVisibleMentions(
  content: string,
  mentionUids: string[],
  members: ChannelConnectorOctoGroupMember[],
): string {
  const missing = uniqueStrings(mentionUids)
    .filter((uid) => !contentHasVisibleMentionForUid(content, uid, members))
    .map((uid) => visibleStructuredMention(uid, members));
  if (!missing.length) return content;
  return `${missing.join(" ")}${content ? ` ${content}` : ""}`;
}

function extractStructuredOctoMentions(content: string): {
  content: string;
  mentionUids: string[];
  mentionEntities: ChannelConnectorOctoMentionEntity[];
} {
  const mentionUids: string[] = [];
  const mentionEntities: ChannelConnectorOctoMentionEntity[] = [];
  let output = "";
  let cursor = 0;
  const pattern = /@\[([A-Za-z0-9_.:-]+):([^\]\r\n]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const [raw, uid, name] = match;
    const normalizedUid = normalizeString(uid);
    output += content.slice(cursor, match.index);
    const replacement = `@${normalizeString(name) || normalizedUid}`;
    const offset = output.length;
    output += replacement;
    if (normalizedUid) {
      mentionUids.push(normalizedUid);
      mentionEntities.push({
        uid: normalizedUid,
        offset,
        length: replacement.length,
      });
    }
    cursor = match.index + raw.length;
  }
  output += content.slice(cursor);
  return {
    content: cleanMentionContent(output),
    mentionUids: uniqueStrings(mentionUids),
    mentionEntities,
  };
}

function extractOctoMentions(
  content: string,
  members: ChannelConnectorOctoGroupMember[],
): {
  content: string;
  mentionUids: string[];
  mentionEntities: ChannelConnectorOctoMentionEntity[];
} {
  const structured = extractStructuredOctoMentions(content);
  const mentionUids = [...structured.mentionUids];
  const mentionEntities = [...structured.mentionEntities];
  content = structured.content;
  if (!members.length) {
    return {
      content,
      mentionUids: uniqueStrings(mentionUids),
      mentionEntities,
    };
  }
  const nameToUid = new Map<string, string>();
  for (const member of members) {
    const name = normalizeString(member.name).toLowerCase();
    const uid = normalizeString(member.uid);
    if (name && uid) nameToUid.set(name, uid);
  }
  if (!nameToUid.size) {
    return {
      content,
      mentionUids: uniqueStrings(mentionUids),
      mentionEntities,
    };
  }

  const runes = Array.from(content);
  const existingOffsets = new Set(mentionEntities.map((entity) => entity.offset));
  let utf16Offset = 0;
  for (let index = 0; index < runes.length; index += 1) {
    const char = runes[index];
    if (char === "@" && (index === 0 || /\s/u.test(runes[index - 1]))) {
      let end = index + 1;
      while (end < runes.length && !isMentionNameDelimiter(runes[end])) end += 1;
      const name = runes.slice(index + 1, end).join("").toLowerCase();
      const uid = nameToUid.get(name);
      if (uid) {
        mentionUids.push(uid);
        if (!existingOffsets.has(utf16Offset)) {
          mentionEntities.push({
            uid,
            offset: utf16Offset,
            length: runes.slice(index, end).join("").length,
          });
          existingOffsets.add(utf16Offset);
        }
      }
    }
    utf16Offset += char.length;
  }

  mentionEntities.sort((a, b) => a.offset - b.offset);
  return {
    content: cleanMentionContent(content),
    mentionUids: uniqueStrings(mentionUids),
    mentionEntities,
  };
}

function chunkMentionEntities(
  content: string,
  chunks: string[],
  entities: ChannelConnectorOctoMentionEntity[],
): ChannelConnectorOctoMentionEntity[][] {
  let cursor = 0;
  return chunks.map((chunk) => {
    const start = content.indexOf(chunk, cursor);
    const effectiveStart = start >= 0 ? start : cursor;
    const end = effectiveStart + chunk.length;
    cursor = end;
    return entities
      .filter((entity) => entity.offset >= effectiveStart && entity.offset + entity.length <= end)
      .map((entity) => ({
        ...entity,
        offset: entity.offset - effectiveStart,
      }));
  });
}

export function renderOctoOutboundText(input: {
  channelId: string;
  channelType: 1 | 2 | 5;
  content: string;
  members?: ChannelConnectorOctoGroupMember[];
  mentionUids?: string[];
  mentionAll?: boolean;
  onBehalfOf?: string | null;
}): ChannelConnectorOctoReplyPlan | null {
  const members = input.members || [];
  const source = isOctoGroupChannel(input.channelType)
    ? prependMissingVisibleMentions(input.content.trim(), input.mentionUids || [], members)
    : input.content.trim();
  const rendered = isOctoGroupChannel(input.channelType)
    ? extractOctoMentions(source, members)
    : { content: source, mentionUids: [], mentionEntities: [] };
  if (!rendered.content) return null;
  const chunks = splitOctoTextChunks(rendered.content);
  const chunkEntities = chunkMentionEntities(rendered.content, chunks, rendered.mentionEntities);
  const mentionUids = uniqueStrings([...(input.mentionUids || []), ...rendered.mentionUids]);
  return {
    channelId: input.channelId,
    channelType: input.channelType,
    chunks,
    mentionUids,
    mentionEntities: rendered.mentionEntities,
    onBehalfOf: normalizeString(input.onBehalfOf) || null,
    payloads: chunks.map((chunk, index) => {
      const payload: ChannelConnectorOctoReplyPlan["payloads"][number]["payload"] = {
        type: OCTO_MESSAGE_TYPE_TEXT,
        content: chunk,
      };
      const entities = chunkEntities[index] || [];
      const chunkMentionUids = uniqueStrings(entities.map((entity) => entity.uid));
      if (chunkMentionUids.length || entities.length || input.mentionAll) {
        payload.mention = {
          ...(chunkMentionUids.length ? { uids: chunkMentionUids } : {}),
          ...(entities.length ? { entities } : {}),
          ...(input.mentionAll ? { all: true } : {}),
        };
      }
      return {
        channel_id: input.channelId,
        channel_type: input.channelType,
        payload,
      };
    }),
  };
}

export function renderOctoTextReply(
  message: ChannelConnectorOctoInboundMessage,
  replyText: string,
): ChannelConnectorOctoReplyPlan | null {
  const stripped = stripOctoReplyFooter(replyText).trim();
  if (!stripped) return null;
  const channelId = normalizeString(message.replyChannelId)
    || (message.channelType === OCTO_CHANNEL_TYPE_DM ? message.fromUid : message.channelId);
  const channelType = message.replyChannelType || message.channelType;
  return renderOctoOutboundText({
    channelId,
    channelType,
    content: stripped,
    members: message.members || [],
    onBehalfOf: message.replyOnBehalfOf || null,
  });
}

function emptyTransportResult(): ChannelConnectorOctoTransportResult {
  return {
    attempted: false,
    ok: null,
    action: "none",
    apiUrl: null,
    statusCode: null,
    error: null,
    requestCount: 0,
    robotId: null,
    imToken: null,
    wsUrl: null,
  };
}

export function resolveOctoBinding(
  request: ChannelConnectorOctoInboundRequest,
  bindings: ChannelConnectorPlatformBinding[],
  profiles: ChannelConnectorAgentProfile[],
): ChannelConnectorsOctoResolvedBinding | null {
  const octoBindings = bindings.filter((binding) => binding.platform === "octo" && binding.enabled);
  const requestedBindingId = normalizeString(request.bindingId);
  const requestedAccountId = normalizeOctoAccountId(request.accountId);
  const requestedBotId = normalizeOctoAccountId(request.botId);
  let binding: ChannelConnectorPlatformBinding | undefined;
  if (requestedBindingId) binding = octoBindings.find((candidate) => candidate.id === requestedBindingId);
  if (!binding && requestedAccountId) {
    binding = octoBindings.find((candidate) =>
      normalizeOctoAccountId(candidate.accountId) === requestedAccountId
      && (!requestedBotId || normalizeOctoAccountId(candidate.botId) === requestedBotId),
    );
  }
  if (!binding && octoBindings.length === 1) binding = octoBindings[0];
  if (!binding) return null;
  const agentProfile = profiles.find((profile) => profile.id === binding.agentProfileId);
  return agentProfile ? { binding, agentProfile } : null;
}

export function buildSkippedOctoResponse(
  checkedAt: string,
  request: ChannelConnectorOctoInboundRequest,
  skippedReason: string,
  eventLogPath: string,
  resolved: ChannelConnectorsOctoResolvedBinding | null = null,
): ChannelConnectorOctoDispatchResponse {
  const message = request.message;
  const content = message ? extractOctoContent(message) : "";
  const attachments = message ? extractOctoAttachments(message) : [];
  return {
    ok: true,
    checkedAt,
    adapter: "octo",
    accepted: false,
    skippedReason,
    dryRun: request.dryRun === true,
    sessionKey: message ? buildOctoSessionKey(message) : null,
    binding: resolved?.binding || null,
    agentProfile: resolved?.agentProfile || null,
    incoming: message
      ? {
          messageId: message.messageId,
          platform: "octo",
          channelId: message.channelId,
          channelType: message.channelType,
          fromUid: message.fromUid,
          content,
          messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
          attachments,
          directed: false,
        }
      : null,
    agentDispatch: {
      status: "skipped",
      agent: null,
      model: null,
      workDir: null,
      gatewayEndpoint: null,
      gatewayKeyRef: null,
    },
    transport: emptyTransportResult(),
    replyPlan: null,
    eventStored: {
      path: eventLogPath,
      written: false,
    },
  };
}

export function shouldSkipOctoMessage(
  request: ChannelConnectorOctoInboundRequest,
  resolved: ChannelConnectorsOctoResolvedBinding | null,
): string | null {
  const message = request.message;
  if (!message) return "octo_message_required";
  if (!resolved) return "octo_binding_not_found";
  if (isSystemOctoMessage(message)) return "octo_system_message";
  if (sameOctoAccountId(message.fromUid, resolved.binding.botId)) return "octo_self_message";
  const personaRouting = resolveOctoPersonaRouting(message, resolved.binding);
  if (personaRouting.skipReason) return personaRouting.skipReason;
  const content = extractOctoContent(message);
  if (!content) return "octo_empty_message";
  if (!isOctoMessageDirectedAtBot(message, resolved.binding.botId, octoOnBehalfOfFromBinding(resolved.binding))) return "octo_group_message_not_directed";
  return null;
}
