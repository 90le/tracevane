import type {
  ChannelConnectorAgentProfile,
  ChannelConnectorInboundAttachment,
  ChannelConnectorOctoDispatchResponse,
  ChannelConnectorOctoGroupMember,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoInboundRequest,
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
): boolean {
  if (!isOctoGroupChannel(message.channelType)) return true;
  const mention = message.payload.mention;
  const mentionUids = Array.isArray(mention?.uids) ? mention?.uids || [] : [];
  const normalizedBotId = normalizeOctoAccountId(botId);
  if (normalizedBotId && mentionUids.some((uid) => normalizeOctoAccountId(uid) === normalizedBotId)) return true;
  const mentionAll = mention?.all === true || mention?.all === 1;
  const mentionHumans = mention?.humans === true || mention?.humans === 1;
  const mentionAis = mention?.ais === true || mention?.ais === 1;
  if (mentionAis && !mentionAll && !mentionHumans) return true;
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

export function extractOctoContent(message: ChannelConnectorOctoInboundMessage): string {
  const payload = message.payload || {};
  let content = "";
  switch (payload.type) {
    case OCTO_MESSAGE_TYPE_TEXT:
      content = normalizeString(payload.content);
      break;
    case OCTO_MESSAGE_TYPE_IMAGE:
      content = "[image]";
      break;
    case OCTO_MESSAGE_TYPE_GIF:
      content = "[gif]";
      break;
    case OCTO_MESSAGE_TYPE_FILE:
      content = `[file: ${normalizeString(payload.name) || "file"}]`;
      break;
    case OCTO_MESSAGE_TYPE_VOICE:
      content = "[voice]";
      break;
    case OCTO_MESSAGE_TYPE_VIDEO:
      content = "[video]";
      break;
    case OCTO_MESSAGE_TYPE_LOCATION:
      content = normalizeString(payload.content);
      break;
    case OCTO_MESSAGE_TYPE_RICH_TEXT:
      content = extractOctoRichTextPlain(payload) || "[rich text]";
      break;
    default:
      content = normalizeString(payload.content) || `[message type: ${payload.type ?? "unknown"}]`;
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

function extractOctoMentions(content: string, members: ChannelConnectorOctoGroupMember[]): { content: string; mentionUids: string[] } {
  if (!members.length) return { content, mentionUids: [] };
  const nameToUid = new Map<string, string>();
  for (const member of members) {
    const name = normalizeString(member.name).toLowerCase();
    const uid = normalizeString(member.uid);
    if (name && uid) nameToUid.set(name, uid);
  }
  if (!nameToUid.size) return { content, mentionUids: [] };

  const runes = Array.from(content);
  const mentionUids: string[] = [];
  let output = "";
  for (let index = 0; index < runes.length; index += 1) {
    const char = runes[index];
    if (char === "@" && (index === 0 || /\s/u.test(runes[index - 1]))) {
      let end = index + 1;
      while (end < runes.length && !isMentionNameDelimiter(runes[end])) end += 1;
      const name = runes.slice(index + 1, end).join("").toLowerCase();
      const uid = nameToUid.get(name);
      if (uid) {
        mentionUids.push(uid);
        index = end - 1;
        continue;
      }
    }
    output += char;
  }

  return {
    content: output.trim(),
    mentionUids: uniqueStrings(mentionUids),
  };
}

export function renderOctoTextReply(
  message: ChannelConnectorOctoInboundMessage,
  replyText: string,
): ChannelConnectorOctoReplyPlan | null {
  const stripped = stripOctoReplyFooter(replyText).trim();
  if (!stripped) return null;
  const rendered = isOctoGroupChannel(message.channelType)
    ? extractOctoMentions(stripped, message.members || [])
    : { content: stripped, mentionUids: [] };
  if (!rendered.content) return null;
  const channelId = message.channelType === OCTO_CHANNEL_TYPE_DM ? message.fromUid : message.channelId;
  const chunks = splitOctoTextChunks(rendered.content);
  return {
    channelId,
    channelType: message.channelType,
    chunks,
    mentionUids: rendered.mentionUids,
    payloads: chunks.map((chunk) => {
      const payload: ChannelConnectorOctoReplyPlan["payloads"][number]["payload"] = {
        type: OCTO_MESSAGE_TYPE_TEXT,
        content: chunk,
      };
      if (rendered.mentionUids.length) payload.mention = { uids: rendered.mentionUids };
      return {
        channel_id: channelId,
        channel_type: message.channelType,
        payload,
      };
    }),
  };
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
  const content = extractOctoContent(message);
  if (!content) return "octo_empty_message";
  if (!isOctoMessageDirectedAtBot(message, resolved.binding.botId)) return "octo_group_message_not_directed";
  return null;
}
