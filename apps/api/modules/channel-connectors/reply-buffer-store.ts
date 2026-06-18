import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { splitChannelConnectorTextChunks } from "./text-chunks.js";

export interface ChannelConnectorReplyBufferRecord {
  id: string;
  bindingId: string;
  sessionKey: string;
  messageId: string | null;
  platform: string;
  replyText: string;
  previewText: string;
  replyRunes: number;
  createdAt: string;
}

export interface ChannelConnectorReplyBufferState {
  version: 1;
  updatedAt: string;
  records: ChannelConnectorReplyBufferRecord[];
}

export interface ChannelConnectorBufferedReplyResult {
  replyText: string;
  buffered: boolean;
  bufferId: string | null;
  originalRunes: number;
  previewRunes: number;
}

export interface ChannelConnectorReplyBufferLookupResult {
  record: ChannelConnectorReplyBufferRecord | null;
  matches: ChannelConnectorReplyBufferRecord[];
}

const DEFAULT_GROUP_REPLY_BUFFER_THRESHOLD_RUNES = 1800;
const DEFAULT_GROUP_REPLY_PREVIEW_RUNES = 900;
const MAX_REPLY_BUFFER_RECORDS = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyState(): ChannelConnectorReplyBufferState {
  return {
    version: 1,
    updatedAt: nowIso(),
    records: [],
  };
}

function replyRunes(value: string): number {
  return Array.from(value).length;
}

function readState(filePath: string): ChannelConnectorReplyBufferState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !Array.isArray(raw.records)) return emptyState();
    const records = raw.records
      .map((value): ChannelConnectorReplyBufferRecord | null => {
        if (!isRecord(value)) return null;
        const id = normalizeString(value.id);
        const bindingId = normalizeString(value.bindingId);
        const sessionKey = normalizeString(value.sessionKey);
        const platform = normalizeString(value.platform);
        const replyText = stringValue(value.replyText);
        if (!id || !bindingId || !sessionKey || !platform || !replyText) return null;
        const previewText = stringValue(value.previewText) || splitChannelConnectorTextChunks(replyText, DEFAULT_GROUP_REPLY_PREVIEW_RUNES)[0] || "";
        return {
          id,
          bindingId,
          sessionKey,
          messageId: normalizeString(value.messageId) || null,
          platform,
          replyText,
          previewText,
          replyRunes: Number.isFinite(Number(value.replyRunes)) ? Number(value.replyRunes) : replyRunes(replyText),
          createdAt: normalizeString(value.createdAt) || nowIso(),
        };
      })
      .filter((record): record is ChannelConnectorReplyBufferRecord => Boolean(record));
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      records,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

function writeState(filePath: string, state: ChannelConnectorReplyBufferState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = {
    version: 1 as const,
    updatedAt: nowIso(),
    records: state.records.slice(-MAX_REPLY_BUFFER_RECORDS),
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function bufferId(input: {
  bindingId: string;
  sessionKey: string;
  messageId: string | null;
  replyText: string;
  createdAt: string;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update([input.bindingId, input.sessionKey, input.messageId || "", input.createdAt, input.replyText].join("\n"))
    .digest("hex")
    .slice(0, 12);
  return `rb_${Date.parse(input.createdAt).toString(36)}_${digest}`;
}

function recordsForSession(
  records: ChannelConnectorReplyBufferRecord[],
  input: {
    bindingId: string;
    sessionKey: string;
  },
): ChannelConnectorReplyBufferRecord[] {
  const bindingId = normalizeString(input.bindingId);
  const sessionKey = normalizeString(input.sessionKey);
  return records
    .filter((record) => record.bindingId === bindingId && record.sessionKey === sessionKey)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function prepareChannelConnectorGroupBufferedReply(input: {
  filePath: string;
  bindingId: string;
  sessionKey: string;
  messageId?: string | null;
  platform: string;
  replyText: string;
  isGroup: boolean;
  thresholdRunes?: number;
  previewRunes?: number;
  now?: Date;
}): ChannelConnectorBufferedReplyResult {
  const replyText = stringValue(input.replyText);
  const originalRunes = replyRunes(replyText);
  const thresholdRunes = input.thresholdRunes ?? DEFAULT_GROUP_REPLY_BUFFER_THRESHOLD_RUNES;
  const previewRunes = input.previewRunes ?? DEFAULT_GROUP_REPLY_PREVIEW_RUNES;
  if (!input.isGroup || originalRunes <= thresholdRunes) {
    return {
      replyText,
      buffered: false,
      bufferId: null,
      originalRunes,
      previewRunes: originalRunes,
    };
  }

  const createdAt = (input.now || new Date()).toISOString();
  const previewText = stringValue(splitChannelConnectorTextChunks(replyText, previewRunes)[0]);
  const id = bufferId({
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
    messageId: normalizeString(input.messageId) || null,
    replyText,
    createdAt,
  });
  const record: ChannelConnectorReplyBufferRecord = {
    id,
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
    messageId: normalizeString(input.messageId) || null,
    platform: input.platform,
    replyText,
    previewText,
    replyRunes: originalRunes,
    createdAt,
  };
  const state = readState(input.filePath);
  state.records = state.records.filter((candidate) => candidate.id !== id).concat(record);
  writeState(input.filePath, state);
  const notice = `[Tracevane 已缓存完整回复: ${id}，${originalRunes} 字符。当前会话仅发送预览，完整内容保存在本地 reply buffer。]`;
  return {
    replyText: [previewText, notice].filter(Boolean).join("\n\n"),
    buffered: true,
    bufferId: id,
    originalRunes,
    previewRunes: replyRunes(previewText),
  };
}

export function readChannelConnectorReplyBuffers(filePath: string): ChannelConnectorReplyBufferState {
  return readState(filePath);
}

export function listChannelConnectorReplyBuffersForSession(filePath: string, input: {
  bindingId: string;
  sessionKey: string;
  limit?: number;
}): ChannelConnectorReplyBufferRecord[] {
  const limit = Math.max(1, Math.min(50, Number(input.limit || 10)));
  return recordsForSession(readState(filePath).records, input).slice(0, limit);
}

export function findChannelConnectorReplyBufferForSession(filePath: string, input: {
  bindingId: string;
  sessionKey: string;
  bufferId: string;
}): ChannelConnectorReplyBufferLookupResult {
  const target = normalizeString(input.bufferId);
  const records = recordsForSession(readState(filePath).records, input);
  if (!target) return { record: null, matches: records };
  const exact = records.find((record) => record.id === target);
  if (exact) return { record: exact, matches: [exact] };
  const matches = records.filter((record) => record.id.startsWith(target));
  return {
    record: matches.length === 1 ? matches[0] || null : null,
    matches,
  };
}
