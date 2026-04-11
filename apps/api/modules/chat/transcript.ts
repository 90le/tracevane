import fs from 'node:fs';
import type { ChatMessageItem, ChatMessageToolCallItem, ChatProcessBlock } from '../../../../types/chat.js';
import { normalizeChatHistoryText } from '../../../../lib/chat-history-normalization.js';
import { CHAT_HISTORY_TRUNCATION_MARKERS } from './error-mapping.js';
import { normalizeDate, normalizeString } from './shared.js';

export type TranscriptOverrideResult =
  | { kind: 'replace'; message: ChatMessageItem }
  | { kind: 'skip' }
  | null;

export interface TranscriptMappingOptions {
  sessionKey?: string;
  collectMessageResources?: (sessionKey: string, raw: unknown) => ChatMessageItem['resources'];
  overrideMessage?: (
    sessionKey: string,
    raw: Record<string, unknown>,
    fallbackText: string,
    index: number,
  ) => TranscriptOverrideResult;
}

export interface TranscriptCanonicalEntry {
  message: ChatMessageItem;
  messageId: string;
  messageSeq: number;
  identityKey: string;
}

export function extractTranscriptRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.message && typeof raw.message === 'object') {
    return raw.message as Record<string, unknown>;
  }
  return raw;
}

/** Pi / OpenClaw JSONL lines that are not user-visible chat bubbles (see session-management-compaction.md). */
const TRANSCRIPT_SKIP_ENTRY_TYPES = new Set([
  'session',
  'model_change',
  'thinking_level_change',
  'custom',
  'compaction',
  'branch_summary',
]);

const TRANSCRIPT_VISIBLE_TEXT_BLOCK_TYPES = new Set([
  'text',
  'outputtext',
  'markdown',
  'message',
]);

const TRANSCRIPT_PROCESS_BLOCK_TYPES = new Set([
  'thinking',
  'reasoning',
]);

export function shouldSkipTranscriptLine(raw: Record<string, unknown>): boolean {
  const entryType = normalizeString(raw.type).toLowerCase();
  return Boolean(entryType && TRANSCRIPT_SKIP_ENTRY_TYPES.has(entryType));
}

function contentIsOnlyNonAssistantTextBlocks(record: Record<string, unknown>): boolean {
  const content = record.content;
  if (!Array.isArray(content) || !content.length) {
    return false;
  }
  return content.every((item) => {
    if (!item || typeof item !== 'object') {
      return true;
    }
    const block = item as Record<string, unknown>;
    const t = normalizeString(block.type).toLowerCase();
    if (TRANSCRIPT_VISIBLE_TEXT_BLOCK_TYPES.has(t)) {
      return false;
    }
    return (
      t === 'toolcall'
      || t === 'tool_call'
      || TRANSCRIPT_PROCESS_BLOCK_TYPES.has(t)
    );
  });
}

function extractTranscriptBlockText(block: Record<string, unknown>): string {
  for (const candidate of [
    block.text,
    block.content,
    block.message,
    block.thinking,
    block.reasoning,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return '';
}

export function extractMessageText(raw: Record<string, unknown>): string {
  const record = extractTranscriptRecord(raw);
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;

  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const block = item as Record<string, unknown>;
        const type = normalizeString(block.type).toLowerCase();
        if (!type && typeof block.text === 'string') return block.text;
        if (!TRANSCRIPT_VISIBLE_TEXT_BLOCK_TYPES.has(type)) return '';
        return extractTranscriptBlockText(block);
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }

  const role = normalizeString(record.role).toLowerCase();
  if (role === 'assistant' && contentIsOnlyNonAssistantTextBlocks(record)) {
    return '';
  }

  if (record.message && typeof record.message === 'object') {
    return extractMessageText(record.message as Record<string, unknown>);
  }

  return JSON.stringify(record);
}

export function extractTranscriptContentItems(raw: Record<string, unknown>): Record<string, unknown>[] {
  const record = extractTranscriptRecord(raw);
  return Array.isArray(record.content)
    ? record.content.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function buildTranscriptProcessBlock(
  item: Record<string, unknown>,
  index: number,
): ChatProcessBlock | null {
  const type = normalizeString(item.type).toLowerCase();
  if (!TRANSCRIPT_PROCESS_BLOCK_TYPES.has(type)) {
    return null;
  }
  const text = extractTranscriptBlockText(item).trim();
  if (!text) {
    return null;
  }
  return {
    id: normalizeString(item.id, `${type}-${index + 1}`),
    kind: type === 'reasoning' ? 'reasoning' : 'thinking',
    text,
  };
}

export function extractTranscriptProcessBlocks(raw: Record<string, unknown>): ChatProcessBlock[] | undefined {
  if (extractTranscriptRole(raw) !== 'assistant') {
    return undefined;
  }
  const blocks = extractTranscriptContentItems(raw)
    .map((item, index) => buildTranscriptProcessBlock(item, index))
    .filter((item): item is ChatProcessBlock => Boolean(item));
  return blocks.length ? blocks : undefined;
}

export function extractTranscriptRole(raw: Record<string, unknown>): ChatMessageItem['role'] {
  const record = extractTranscriptRecord(raw);
  const normalized = normalizeString(record.role, normalizeString(raw.role, 'unknown')).toLowerCase();
  if (normalized === 'toolresult' || normalized === 'tool_result' || normalized === 'toolcall' || normalized === 'tool_call') {
    return 'tool';
  }
  if (normalized === 'user' || normalized === 'assistant' || normalized === 'system' || normalized === 'tool') {
    return normalized;
  }
  return 'unknown';
}

export function extractTranscriptToolName(raw: Record<string, unknown>): string {
  const record = extractTranscriptRecord(raw);
  return normalizeString(record.toolName || record.name, normalizeString(raw.toolName || raw.name)) || '';
}

export function hasTranscriptToolCall(raw: Record<string, unknown>, toolName: string): boolean {
  const expected = normalizeString(toolName).toLowerCase();
  if (!expected) {
    return false;
  }
  return extractTranscriptContentItems(raw).some((item) => {
    const type = normalizeString(item.type).toLowerCase();
    const name = normalizeString(item.name).toLowerCase();
    return type === 'toolcall' && name === expected;
  });
}

export function isAssistantStudioDeliveryToolUseEnvelope(raw: Record<string, unknown>): boolean {
  return extractTranscriptRole(raw) === 'assistant' && hasTranscriptToolCall(raw, 'studio_delivery');
}

export function isAssistantNoReplyMessage(raw: Record<string, unknown>): boolean {
  return extractTranscriptRole(raw) === 'assistant' && extractMessageText(raw).trim() === 'NO_REPLY';
}

export function extractTranscriptToolCalls(raw: Record<string, unknown>): ChatMessageToolCallItem[] | undefined {
  if (extractTranscriptRole(raw) !== 'assistant') {
    return undefined;
  }
  const record = extractTranscriptRecord(raw);
  const content = Array.isArray(record.content) ? record.content : [];
  const runId = normalizeString(raw.runId || record.runId) || null;
  const emittedAt = normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt) || null;
  const toolCalls = content
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => normalizeString(item.type).toLowerCase() === 'toolcall')
    .map((item, index) => ({
      toolCallId: normalizeString(item.id || item.toolCallId, `tool-${index + 1}`),
      runId,
      name: normalizeString(item.name || item.tool || item.toolName, 'tool'),
      status: 'running' as const,
      startedAt: emittedAt,
      updatedAt: emittedAt,
      argsPreview: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? null),
      resultPreview: null,
      isError: false,
    }))
    .filter((item) => item.toolCallId);
  return toolCalls.length ? toolCalls : undefined;
}

export function mapTranscriptMessage(
  raw: Record<string, unknown>,
  index: number,
  options: TranscriptMappingOptions = {},
): ChatMessageItem | null {
  if (shouldSkipTranscriptLine(raw)) {
    return null;
  }
  const record = extractTranscriptRecord(raw);
  const role = extractTranscriptRole(raw);
  const rawText = extractMessageText(raw);
  const overridden = options.sessionKey && options.overrideMessage
    ? options.overrideMessage(options.sessionKey, raw, rawText, index)
    : null;
  if (overridden?.kind === 'replace') {
    return overridden.message;
  }
  if (overridden?.kind === 'skip') {
    return null;
  }
  const text = normalizeChatHistoryText(rawText, role);
  const omitted = CHAT_HISTORY_TRUNCATION_MARKERS.some((marker) => text.includes(marker));
  const truncated = omitted;
  const state = normalizeString(record.state || raw.state).toLowerCase();
  const aborted = record.aborted === true || raw.aborted === true || state === 'aborted';
  const structuredResources = role === 'assistant' && options.sessionKey && options.collectMessageResources
    ? options.collectMessageResources(options.sessionKey, record)
    : undefined;
  const resources = (() => {
    const merged = [
      ...(structuredResources || []),
    ];
    if (!merged.length) {
      return undefined;
    }
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = `${item.kind}:${item.url}:${item.downloadUrl}:${item.id}:${item.relativePath || item.fileName}:${item.source}:${item.status}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  })();
  const toolCalls = extractTranscriptToolCalls(raw);
  const processBlocks = extractTranscriptProcessBlocks(raw);
  return {
    id: normalizeString(raw.id || record.id, `history-${index}`),
    role,
    text,
    createdAt: normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt),
    source: 'history',
    runId: normalizeString(raw.runId || record.runId) || null,
    truncated,
    omitted: text.includes('[chat.history omitted: message too large]'),
    aborted,
    stopReason: normalizeString(raw.stopReason || record.stopReason) || null,
    toolCalls,
    processBlocks,
    resources,
  };
}

export function readTranscriptMessages(
  sessionFile: string,
  options: TranscriptMappingOptions = {},
): ChatMessageItem[] {
  try {
    const lines = fs.readFileSync(sessionFile, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const items: ChatMessageItem[] = [];
    for (const [index, line] of lines.entries()) {
      try {
        const mapped = mapTranscriptMessage(JSON.parse(line) as Record<string, unknown>, index, options);
        if (mapped) {
          items.push(mapped);
        }
      } catch {
        items.push({
          id: `history-${index}`,
          role: 'unknown',
          text: line,
          createdAt: null,
          source: 'history',
          runId: null,
          truncated: false,
          omitted: false,
          aborted: false,
          stopReason: null,
        } satisfies ChatMessageItem);
      }
    }
    return items;
  } catch {
    return [];
  }
}

function extractTranscriptMetaRecord(raw: Record<string, unknown>): Record<string, unknown> | null {
  const direct = raw.__openclaw;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  const record = extractTranscriptRecord(raw);
  const nested = record.__openclaw;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return null;
}

function extractTranscriptMessageSeq(raw: Record<string, unknown>, index: number): number {
  const meta = extractTranscriptMetaRecord(raw);
  const seq = Number(meta?.seq ?? raw.messageSeq);
  if (Number.isFinite(seq) && seq > 0) {
    return Math.trunc(seq);
  }
  return index + 1;
}

function extractTranscriptMessageId(raw: Record<string, unknown>, fallbackId: string): string {
  const meta = extractTranscriptMetaRecord(raw);
  return normalizeString(raw.messageId || meta?.id, fallbackId);
}

function buildTranscriptIdentityKey(
  message: ChatMessageItem,
  messageSeq: number,
): string {
  const toolCallIds = (message.toolCalls || [])
    .map((item) => normalizeString(item.toolCallId))
    .filter(Boolean)
    .sort()
    .join(',');
  const normalizedText = normalizeString(message.text).replace(/\s+/g, ' ');
  return [
    String(messageSeq),
    message.role,
    toolCallIds,
    normalizedText,
    normalizeString(message.createdAt),
  ].join('|');
}

export function mapTranscriptCanonicalEntry(
  raw: Record<string, unknown>,
  index: number,
  options: TranscriptMappingOptions = {},
): TranscriptCanonicalEntry | null {
  const message = mapTranscriptMessage(raw, index, options);
  if (!message) {
    return null;
  }
  const messageSeq = extractTranscriptMessageSeq(raw, index);
  const messageId = extractTranscriptMessageId(raw, message.id);
  return {
    message,
    messageId,
    messageSeq,
    identityKey: buildTranscriptIdentityKey(message, messageSeq),
  };
}

export function readTranscriptCanonicalEntries(
  sessionFile: string,
  options: TranscriptMappingOptions = {},
): TranscriptCanonicalEntry[] {
  try {
    const lines = fs.readFileSync(sessionFile, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const items: TranscriptCanonicalEntry[] = [];
    for (const [index, line] of lines.entries()) {
      try {
        const mapped = mapTranscriptCanonicalEntry(JSON.parse(line) as Record<string, unknown>, index, options);
        if (mapped) {
          items.push(mapped);
        }
      } catch {}
    }
    return items;
  } catch {
    return [];
  }
}

export function mapMessagesFromParsedEntries(
  entries: Record<string, unknown>[],
  options: TranscriptMappingOptions = {},
): ChatMessageItem[] {
  const items: ChatMessageItem[] = [];
  for (const [index, raw] of entries.entries()) {
    const mapped = mapTranscriptMessage(raw, index, options);
    if (mapped) {
      items.push(mapped);
    }
  }
  return items;
}

export function mapCanonicalEntriesFromParsedEntries(
  entries: Record<string, unknown>[],
  options: TranscriptMappingOptions = {},
): TranscriptCanonicalEntry[] {
  const items: TranscriptCanonicalEntry[] = [];
  for (const [index, raw] of entries.entries()) {
    const mapped = mapTranscriptCanonicalEntry(raw, index, options);
    if (mapped) {
      items.push(mapped);
    }
  }
  return items;
}
