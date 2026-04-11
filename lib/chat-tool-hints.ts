import type {
  ChatProcessBlock,
  ChatToolArtifactItem,
  ChatToolCard,
  ChatToolStatus,
} from '../types/chat.js';

export interface ChatDisplayToolHintItem {
  id: string;
  name: string;
  status: ChatToolStatus;
  summary: string | null;
  argsPreview: string | null;
  resultPreview: string | null;
  artifacts?: ChatToolArtifactItem[];
}

export interface ParsedStructuredChatText {
  structured: boolean;
  text: string;
  toolHints: ChatDisplayToolHintItem[];
  processBlocks: ChatProcessBlock[];
}

const TEXT_BLOCK_TYPES = new Set([
  'text',
  'outputtext',
  'markdown',
  'message',
]);

const HIDDEN_TEXT_BLOCK_TYPES = new Set([
  'thinking',
  'reasoning',
  'metadata',
]);

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBlockType(value: unknown): string {
  return normalizeString(value).replace(/[^a-z]/gi, '').toLowerCase();
}

export function safeParseChatJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

function cleanText(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function previewText(value: unknown, max = 180): string | null {
  if (value == null) return null;

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => previewText(entry, max))
      .filter(Boolean)
      .join(' ');
    return joined ? previewText(joined, max) : null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'message', 'summary', 'content', 'result', 'output', 'error', 'status']) {
      const candidate = previewText(record[key], max);
      if (candidate) return candidate;
    }
    try {
      const serialized = JSON.stringify(value);
      if (!serialized || serialized === '{}' || serialized === '[]') return null;
      return serialized.length > max ? `${serialized.slice(0, max)}...` : serialized;
    } catch {
      return null;
    }
  }

  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function extractStructuredBlockText(block: Record<string, unknown>): string {
  const candidates = [
    block.text,
    block.content,
    block.message,
    block.thinking,
    block.reasoning,
    block.summary,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const cleaned = cleanText(candidate);
      if (cleaned && !looksLikeMetadataDump(cleaned)) {
        return cleaned;
      }
    }
  }
  return '';
}

function looksLikeMetadataDump(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!(/^\{[\s\S]*\}$/.test(trimmed) || /^\[[\s\S]*\]$/.test(trimmed))) {
    return false;
  }
  const parsed = safeParseChatJson(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const record = parsed as Record<string, unknown>;
  return [
    'metadata',
    'tool',
    'toolCall',
    'toolCalls',
    'tool_calls',
    'thinking',
    'raw',
    'stopReason',
    'errorMessage',
  ].some((key) => key in record);
}

function extractToolName(block: Record<string, unknown>): string {
  const direct = normalizeString(block.name || block.tool || block.toolName);
  if (direct) return direct;
  const nestedTool = block.tool;
  if (nestedTool && typeof nestedTool === 'object') {
    const nestedName = normalizeString((nestedTool as Record<string, unknown>).name);
    if (nestedName) return nestedName;
  }
  return 'tool';
}

function normalizeToolStatus(value: unknown, fallback: ChatToolStatus): ChatToolStatus {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'completed' || normalized === 'done' || normalized === 'success' || normalized === 'ok') {
    return 'completed';
  }
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') {
    return 'error';
  }
  if (normalized === 'running' || normalized === 'pending') {
    return 'running';
  }
  return fallback;
}

function buildToolHint(
  block: Record<string, unknown>,
  index: number,
  fallbackStatus: ChatToolStatus,
): ChatDisplayToolHintItem | null {
  const name = extractToolName(block);
  const nestedToolCall = block.toolCall && typeof block.toolCall === 'object'
    ? block.toolCall as Record<string, unknown>
    : null;
  const id = normalizeString(block.id || block.toolCallId || nestedToolCall?.id || nestedToolCall?.toolCallId) || `${name}-${index}`;
  const argsPreview = previewText(block.arguments ?? block.args ?? block.input ?? block.params, 220);
  const resultPreview = previewText(
    block.result
    ?? block.output
    ?? block.error
    ?? block.errorMessage
    ?? block.text
    ?? block.content
    ?? block.message,
    260,
  );
  const status = block.error || block.errorMessage || block.is_error === true || block.isError === true
    ? 'error'
    : normalizeToolStatus(block.status, fallbackStatus);
  const summary = previewText(
    block.summary
    ?? block.message
    ?? block.error
    ?? block.errorMessage
    ?? block.result
    ?? block.output
    ?? block.arguments
    ?? block.args
    ?? block.input,
    120,
  );

  return {
    id,
    name,
    status,
    summary,
    argsPreview,
    resultPreview,
  };
}

function mergeToolHint(
  toolHints: ChatDisplayToolHintItem[],
  hint: ChatDisplayToolHintItem,
): void {
  const index = toolHints.findIndex((entry) => entry.id === hint.id);
  if (index < 0) {
    toolHints.push(hint);
    return;
  }
  const current = toolHints[index];
  toolHints[index] = {
    ...current,
    ...hint,
    summary: hint.summary || current.summary,
    argsPreview: hint.argsPreview || current.argsPreview,
    resultPreview: hint.resultPreview || current.resultPreview,
  };
}

function collectTopLevelToolEntries(record: Record<string, unknown>): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];

  if (Array.isArray(record.content)) {
    for (const item of record.content) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        entries.push(item as Record<string, unknown>);
      }
    }
  }

  for (const singleKey of ['toolCall', 'tool_call']) {
    const value = record[singleKey];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      entries.push({
        type: 'toolCall',
        ...(value as Record<string, unknown>),
      });
    }
  }

  for (const listKey of ['toolCalls', 'tool_calls']) {
    const value = record[listKey];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        entries.push({
          type: 'toolCall',
          ...(item as Record<string, unknown>),
        });
      }
    }
  }

  return entries;
}

function parseStructuredContent(record: Record<string, unknown>): ParsedStructuredChatText {
  const textParts: string[] = [];
  const toolHints: ChatDisplayToolHintItem[] = [];
  const processBlocks: ChatProcessBlock[] = [];
  const entries = collectTopLevelToolEntries(record);

  entries.forEach((entry, index) => {
    const type = normalizeBlockType(entry.type);
    if (HIDDEN_TEXT_BLOCK_TYPES.has(type)) {
      const text = extractStructuredBlockText(entry);
      if (text) {
        processBlocks.push({
          id: normalizeString(entry.id || `${type}-${index + 1}`) || `${type}-${index + 1}`,
          kind: type === 'reasoning' ? 'reasoning' : 'thinking',
          text,
        });
      }
      return;
    }

    if (TEXT_BLOCK_TYPES.has(type)) {
      const normalizedText = extractStructuredBlockText(entry);
      if (normalizedText && !looksLikeMetadataDump(normalizedText)) {
        textParts.push(normalizedText);
      }
      return;
    }

    if (type.includes('toolcall') || type === 'tooluse') {
      const hint = buildToolHint(entry, index, 'running');
      if (hint) mergeToolHint(toolHints, hint);
      return;
    }

    if (type.includes('toolresult') || type.includes('tooloutput') || type === 'tool') {
      const hint = buildToolHint(entry, index, entry.error || entry.errorMessage ? 'error' : 'completed');
      if (hint) mergeToolHint(toolHints, hint);
    }
  });

  const errorMessage = normalizeString(record.errorMessage || record.error);
  if (errorMessage) {
    if (toolHints.length) {
      const last = toolHints[toolHints.length - 1];
      toolHints[toolHints.length - 1] = {
        ...last,
        status: 'error',
        summary: previewText(errorMessage, 120) || last.summary,
        resultPreview: previewText(errorMessage, 260) || last.resultPreview,
      };
    } else {
      toolHints.push({
        id: normalizeString(record.id || record.toolCallId) || 'assistant-error',
        name: extractToolName(record),
        status: 'error',
        summary: previewText(errorMessage, 120),
        argsPreview: previewText(record.arguments ?? record.args ?? record.input ?? record.params, 220),
        resultPreview: previewText(errorMessage, 260),
      });
    }
  }

  return {
    structured: true,
    text: textParts.join('\n\n').trim(),
    toolHints,
    processBlocks,
  };
}

function parseSingleToolRecord(record: Record<string, unknown>): ParsedStructuredChatText | null {
  if (!('tool' in record || 'status' in record || 'error' in record || 'toolCallId' in record)) {
    return null;
  }

  const status = record.error
    ? 'error'
    : normalizeToolStatus(record.status, 'completed');
  const hint = buildToolHint(record, 0, status);
  if (!hint) return null;

  return {
    structured: true,
    text: previewText(record.message ?? record.summary, 320) || '',
    toolHints: [hint],
    processBlocks: [],
  };
}

function looksLikeStructuredPayload(record: Record<string, unknown>): boolean {
  return [
    'role',
    'content',
    'stopReason',
    'errorMessage',
    'tool',
    'toolCall',
    'toolCalls',
    'tool_calls',
    'toolCallId',
    'status',
    'error',
  ].some((key) => key in record);
}

function splitConcatenatedJsonObjects(raw: string): string[] {
  const segments: string[] = [];
  const source = raw.trim();
  if (!source || source[0] !== '{') {
    return segments;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;
  let start = 0;
  let lastEnd = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === '\\') {
        escaping = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        if (source.slice(lastEnd, index).trim()) {
          return [];
        }
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const segment = source.slice(start, index + 1).trim();
        if (segment) {
          segments.push(segment);
        }
        lastEnd = index + 1;
      }
    }
  }

  if (depth !== 0 || source.slice(lastEnd).trim()) {
    return [];
  }
  return segments.length > 1 ? segments : [];
}

function parseStructuredRecord(record: Record<string, unknown>): ParsedStructuredChatText | null {
  if (Array.isArray(record.content) || 'toolCall' in record || 'toolCalls' in record || 'tool_calls' in record || 'errorMessage' in record || 'stopReason' in record) {
    return parseStructuredContent(record);
  }

  const singleTool = parseSingleToolRecord(record);
  if (singleTool) return singleTool;

  const text = typeof record.text === 'string'
    ? cleanText(record.text)
    : typeof record.content === 'string'
      ? cleanText(String(record.content))
      : '';

  if (text && !looksLikeMetadataDump(text)) {
    return {
      structured: true,
      text,
      toolHints: [],
      processBlocks: [],
    };
  }

  if (looksLikeStructuredPayload(record)) {
    return {
      structured: true,
      text: '',
      toolHints: [],
      processBlocks: [],
    };
  }

  return null;
}

export function parseStructuredChatText(raw: string): ParsedStructuredChatText | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const unfenced = stripJsonFence(trimmed);
  const parsed = safeParseChatJson(unfenced);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const segments = splitConcatenatedJsonObjects(unfenced);
    if (!segments.length) {
      return null;
    }
    const aggregate: ParsedStructuredChatText = {
      structured: true,
      text: '',
      toolHints: [],
      processBlocks: [],
    };
    const textParts: string[] = [];
    for (const segment of segments) {
      const nested = safeParseChatJson(segment);
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        return null;
      }
      const parsedSegment = parseStructuredRecord(nested as Record<string, unknown>);
      if (!parsedSegment) {
        return null;
      }
      if (parsedSegment.text) {
        textParts.push(parsedSegment.text);
      }
      for (const hint of parsedSegment.toolHints) {
        mergeToolHint(aggregate.toolHints, hint);
      }
      for (const block of parsedSegment.processBlocks) {
        aggregate.processBlocks.push(block);
      }
    }
    aggregate.text = textParts.join('\n\n').trim();
    return aggregate;
  }

  const record = parsed as Record<string, unknown>;
  return parseStructuredRecord(record);
}

export function sanitizeToolSummary(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}' || trimmed === '[]') return null;

  const parsed = safeParseChatJson(trimmed);
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed) && parsed.length === 0) return null;
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!keys.length) return null;
    if (keys.every((key) => ['ok', 'success', 'status'].includes(key))) {
      return previewText(record.status ?? (record.ok ?? record.success ? 'completed' : null), 80);
    }
    return previewText(parsed, 180);
  }

  return previewText(trimmed, 180);
}

function normalizeToolName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeToolId(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function collapseToolId(value: string | null | undefined): string {
  return normalizeToolId(value).replace(/[^a-z0-9]+/g, '');
}

function toolIdsCompatible(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeToolId(left);
  const normalizedRight = normalizeToolId(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const collapsedLeft = collapseToolId(left);
  const collapsedRight = collapseToolId(right);
  if (!collapsedLeft || !collapsedRight) {
    return false;
  }
  if (collapsedLeft === collapsedRight) {
    return true;
  }

  const shorter = collapsedLeft.length <= collapsedRight.length ? collapsedLeft : collapsedRight;
  const longer = shorter === collapsedLeft ? collapsedRight : collapsedLeft;
  return shorter.length >= 8 && longer.includes(shorter);
}

function normalizePreview(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function isInformativePreview(value: string | null | undefined): boolean {
  const normalized = normalizePreview(value);
  return Boolean(
    normalized
    && normalized !== '{}'
    && normalized !== '[]'
    && normalized !== 'null'
    && normalized !== 'undefined'
  );
}

function selectToolResultPreview(
  tool: Pick<ChatToolCard, 'argsPreview' | 'resultPreview' | 'toolCallId'>,
  toolDetailByCallId?: Record<string, string>,
): string | null {
  const primary = normalizePreview(tool.resultPreview);
  const fallback = normalizePreview(toolDetailByCallId?.[tool.toolCallId] || null);
  const argsPreview = normalizePreview(tool.argsPreview);

  if (!isInformativePreview(primary)) {
    return fallback || primary;
  }
  if (fallback && primary === argsPreview && fallback !== primary) {
    return fallback;
  }
  return primary;
}

function mergeToolHintWithCard(
  hint: ChatDisplayToolHintItem,
  tool: ChatToolCard,
  toolDetailByCallId?: Record<string, string>,
): ChatDisplayToolHintItem {
  const resultPreview = selectToolResultPreview(tool, toolDetailByCallId) || hint.resultPreview;
  const argsPreview = hint.argsPreview || normalizePreview(tool.argsPreview);
  const summary = sanitizeToolSummary(resultPreview || tool.resultPreview || tool.argsPreview)
    || hint.summary;

  return {
    ...hint,
    id: tool.toolCallId || hint.id,
    name: hint.name || tool.name,
    status: tool.status,
    summary,
    argsPreview,
    resultPreview,
    artifacts: tool.artifacts?.length ? tool.artifacts : hint.artifacts,
  };
}

function createToolHintFromCard(
  tool: ChatToolCard,
  toolDetailByCallId?: Record<string, string>,
): ChatDisplayToolHintItem {
  const resultPreview = selectToolResultPreview(tool, toolDetailByCallId);
  return {
    id: tool.toolCallId,
    name: tool.name,
    status: tool.status,
    summary: sanitizeToolSummary(resultPreview || tool.resultPreview || tool.argsPreview),
    argsPreview: normalizePreview(tool.argsPreview),
    resultPreview,
    artifacts: tool.artifacts,
  };
}

export function mergeToolHintsWithToolCards(params: {
  parsedHints: ChatDisplayToolHintItem[];
  toolCards: ChatToolCard[];
  toolDetailByCallId?: Record<string, string>;
}): ChatDisplayToolHintItem[] {
  const parsedHints = params.parsedHints.map((hint) => ({ ...hint }));
  const toolCards = params.toolCards.slice();
  const usedCardIndexes = new Set<number>();

  const tryMatchCardIndex = (
    hint: ChatDisplayToolHintItem,
    nameScopedOnly = false,
  ): number => {
    const hintName = normalizeToolName(hint.name);
    const candidates = toolCards
      .map((tool, index) => ({ tool, index }))
      .filter(({ tool, index }) => {
        if (usedCardIndexes.has(index)) return false;
        if (nameScopedOnly && normalizeToolName(tool.name) !== hintName) return false;
        return toolIdsCompatible(hint.id, tool.toolCallId)
          && (!hintName || normalizeToolName(tool.name) === hintName);
      });
    return candidates.length === 1 ? candidates[0].index : -1;
  };

  parsedHints.forEach((hint, index) => {
    const directMatchIndex = tryMatchCardIndex(hint);
    if (directMatchIndex >= 0) {
      usedCardIndexes.add(directMatchIndex);
      parsedHints[index] = mergeToolHintWithCard(
        hint,
        toolCards[directMatchIndex],
        params.toolDetailByCallId,
      );
    }
  });

  const unmatchedHintIndexes = parsedHints
    .map((hint, index) => ({ hint, index }))
    .filter(({ hint }) => !toolCards.some((tool, cardIndex) =>
      usedCardIndexes.has(cardIndex) && toolIdsCompatible(hint.id, tool.toolCallId),
    ))
    .map(({ index }) => index);
  const unmatchedCardIndexes = toolCards
    .map((tool, index) => ({ tool, index }))
    .filter(({ index }) => !usedCardIndexes.has(index))
    .map(({ index }) => index);

  const unmatchedHintsByName = new Map<string, number[]>();
  for (const index of unmatchedHintIndexes) {
    const name = normalizeToolName(parsedHints[index]?.name);
    if (!name) continue;
    const current = unmatchedHintsByName.get(name) || [];
    current.push(index);
    unmatchedHintsByName.set(name, current);
  }

  const unmatchedCardsByName = new Map<string, number[]>();
  for (const index of unmatchedCardIndexes) {
    const name = normalizeToolName(toolCards[index]?.name);
    if (!name) continue;
    const current = unmatchedCardsByName.get(name) || [];
    current.push(index);
    unmatchedCardsByName.set(name, current);
  }

  for (const [name, hintIndexes] of unmatchedHintsByName.entries()) {
    const cardIndexes = unmatchedCardsByName.get(name) || [];
    if (!hintIndexes.length || !cardIndexes.length) continue;
    if (hintIndexes.length !== cardIndexes.length && !(hintIndexes.length === 1 && cardIndexes.length === 1)) {
      continue;
    }

    hintIndexes.forEach((hintIndex, order) => {
      const cardIndex = cardIndexes[order];
      if (cardIndex == null || usedCardIndexes.has(cardIndex)) {
        return;
      }
      usedCardIndexes.add(cardIndex);
      parsedHints[hintIndex] = mergeToolHintWithCard(
        parsedHints[hintIndex],
        toolCards[cardIndex],
        params.toolDetailByCallId,
      );
    });
  }

  for (const [index, tool] of toolCards.entries()) {
    if (usedCardIndexes.has(index)) continue;
    parsedHints.push(createToolHintFromCard(tool, params.toolDetailByCallId));
  }

  return parsedHints;
}
