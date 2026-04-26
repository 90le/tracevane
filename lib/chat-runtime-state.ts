import type {
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatProcessBlock,
  ChatResourceItem,
  ChatRunOverlay,
  ChatToolCard,
} from '../types/chat.js';
import type { ChatRenderableItem } from './chat-run-overlay.js';
import { normalizeChatHistoryText } from './chat-history-normalization.js';

/**
 * Maximum number of messages kept in a single message ledger.
 * Beyond this, the oldest messages are trimmed to prevent unbounded memory
 * growth in long-lived sessions (e.g. 1 month of continuous chat).
 */
const LEDGER_MAX_MESSAGES = 4000;

function normalizePreview(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function normalizeChatDisplayRole(role: string | null | undefined): string {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'toolresult' || normalized === 'tool_result') {
    return 'tool';
  }
  return normalized;
}

export function isAssistantDeliveryMessage(message: ChatMessageItem): boolean {
  if (normalizeChatDisplayRole(message.role) !== 'assistant') {
    return false;
  }
  if (message.blocks?.some((block) => block.type === 'paragraph')) {
    return true;
  }
  return Boolean(message.resources?.some((item) => item.source === 'studio_delivery'));
}

export function coalesceAssistantDeliveryMessages(messages: ChatMessageItem[]): ChatMessageItem[] {
  const deliveryRunIds = new Set(
    messages
      .filter((message) => message.runId && isAssistantDeliveryMessage(message))
      .map((message) => message.runId as string),
  );
  if (!deliveryRunIds.size) {
    return messages;
  }
  return messages.filter((message) => {
    if (!message.runId || normalizeChatDisplayRole(message.role) !== 'assistant') {
      return true;
    }
    if (!deliveryRunIds.has(message.runId)) {
      return true;
    }
    return isAssistantDeliveryMessage(message);
  });
}

export function deriveRuntimeMessagePreview(
  message: ChatMessageItem | null | undefined,
  fallback: string | null = null,
): string | null {
  if (!message) {
    return fallback;
  }
  const previewText = normalizeChatDisplayRole(message.role) === 'user'
    ? normalizeChatHistoryText(message.text || '', 'user')
    : message.text;
  return previewText.slice(0, 160)
    || message.resources?.[0]?.fileName
    || message.toolCalls?.[message.toolCalls.length - 1]?.name
    || fallback;
}

const MESSAGE_EQUIVALENCE_WINDOW_MS = 15_000;

function messageSourceRank(source: ChatMessageItem['source']): number {
  if (source === 'history') return 3;
  if (source === 'stream') return 2;
  return 1;
}

function parseMessageTimestamp(value: string | null | undefined): number {
  return Date.parse(value || '') || 0;
}

function normalizeTextIdentity(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cloneArtifacts<T extends { artifacts?: ChatResourceItem[] }>(value: T): T {
  return {
    ...value,
    artifacts: value.artifacts?.map((item) => ({ ...item })),
  };
}

function cloneToolCalls(toolCalls: ChatMessageToolCallItem[] | undefined): ChatMessageToolCallItem[] | undefined {
  return toolCalls?.map((item) => cloneArtifacts(item));
}

function cloneProcessBlocks(processBlocks: ChatProcessBlock[] | undefined): ChatProcessBlock[] | undefined {
  return processBlocks?.map((item) => ({ ...item }));
}

function cloneResources(resources: ChatResourceItem[] | undefined): ChatResourceItem[] | undefined {
  return resources?.map((item) => ({ ...item }));
}

function mergeProcessBlocks(
  current: ChatProcessBlock[] | undefined,
  next: ChatProcessBlock[] | undefined,
): ChatProcessBlock[] | undefined {
  const merged = [...(current || []), ...(next || [])];
  if (!merged.length) {
    return undefined;
  }
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).map((item) => ({ ...item }));
}

function mergeResources(
  current: ChatResourceItem[] | undefined,
  next: ChatResourceItem[] | undefined,
): ChatResourceItem[] | undefined {
  const merged = [...(current || []), ...(next || [])];
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
  }).map((item) => ({ ...item }));
}

function mergeMessageToolCalls(
  current: ChatMessageToolCallItem[] | undefined,
  next: ChatMessageToolCallItem[] | undefined,
): ChatMessageToolCallItem[] | undefined {
  if (!current?.length && !next?.length) {
    return undefined;
  }
  const merged = new Map<string, ChatMessageToolCallItem>();
  for (const item of current || []) {
    merged.set(item.toolCallId, cloneArtifacts(item));
  }
  for (const item of next || []) {
    const previous = merged.get(item.toolCallId);
    merged.set(item.toolCallId, previous ? mergeRuntimeToolLike(previous, item) : cloneArtifacts(item));
  }
  return [...merged.values()].sort((left, right) => {
    const leftTs = parseMessageTimestamp(left.startedAt || left.updatedAt);
    const rightTs = parseMessageTimestamp(right.startedAt || right.updatedAt);
    return leftTs - rightTs || left.toolCallId.localeCompare(right.toolCallId);
  });
}

function blocksSignature(message: ChatMessageItem): string {
  return JSON.stringify(message.blocks || []);
}

function resourcesSignature(message: ChatMessageItem): string {
  return JSON.stringify((message.resources || []).map((item) => [
    item.kind,
    item.fileName,
    item.url,
    item.relativePath || '',
    item.source,
    item.status,
  ]));
}

function toolCallsSignature(message: ChatMessageItem): string {
  return JSON.stringify((message.toolCalls || []).map((item) => [
    item.toolCallId,
    item.name,
    item.status,
    normalizeTextIdentity(item.argsPreview),
    normalizeTextIdentity(item.resultPreview),
    item.isError,
  ]));
}

export function compareChatMessagesByTimeline(left: ChatMessageItem, right: ChatMessageItem): number {
  const leftTs = parseMessageTimestamp(left.createdAt);
  const rightTs = parseMessageTimestamp(right.createdAt);
  if (leftTs !== rightTs) {
    return leftTs - rightTs;
  }
  return 0;
}

function messagesShareEquivalentContent(left: ChatMessageItem, right: ChatMessageItem): boolean {
  const leftText = normalizeTextIdentity(left.text);
  const rightText = normalizeTextIdentity(right.text);
  if (leftText || rightText) {
    return leftText === rightText;
  }
  return blocksSignature(left) === blocksSignature(right)
    && resourcesSignature(left) === resourcesSignature(right)
    && toolCallsSignature(left) === toolCallsSignature(right);
}

export function areChatMessagesEquivalent(left: ChatMessageItem, right: ChatMessageItem): boolean {
  if (left.id === right.id) {
    return true;
  }
  if (left.role !== right.role) {
    return false;
  }
  const leftTs = parseMessageTimestamp(left.createdAt);
  const rightTs = parseMessageTimestamp(right.createdAt);
  const sameRunId = Boolean(left.runId && right.runId && left.runId === right.runId);
  const isUserHistoryInjectPair = left.role === 'user'
    && (
      (left.source === 'inject' && right.source === 'history')
      || (left.source === 'history' && right.source === 'inject')
    );
  const isAssistantHistoryStreamPair = left.role === 'assistant'
    && (
      (left.source === 'stream' && right.source === 'history')
      || (left.source === 'history' && right.source === 'stream')
    );
  const isStableSourcePair = sameRunId || isUserHistoryInjectPair || isAssistantHistoryStreamPair;
  if (isStableSourcePair && messagesShareEquivalentContent(left, right)) {
    return true;
  }
  if (leftTs && rightTs && Math.abs(leftTs - rightTs) > MESSAGE_EQUIVALENCE_WINDOW_MS) {
    return false;
  }
  if (!isStableSourcePair) {
    return false;
  }
  return messagesShareEquivalentContent(left, right);
}

function mergeEquivalentMessages(current: ChatMessageItem, next: ChatMessageItem): ChatMessageItem {
  const currentRank = messageSourceRank(current.source);
  const nextRank = messageSourceRank(next.source);
  const preferred = nextRank >= currentRank ? next : current;
  const fallback = preferred === next ? current : next;
  return {
    ...fallback,
    ...preferred,
    text: preferred.text || fallback.text,
    createdAt: preferred.createdAt || fallback.createdAt,
    source: preferred.source,
    truncated: current.truncated || next.truncated,
    omitted: current.omitted || next.omitted,
    aborted: current.aborted || next.aborted,
    stopReason: preferred.stopReason || fallback.stopReason,
    toolCalls: mergeMessageToolCalls(fallback.toolCalls, preferred.toolCalls),
    processBlocks: mergeProcessBlocks(fallback.processBlocks, preferred.processBlocks),
    resources: mergeResources(fallback.resources, preferred.resources),
  };
}

export function normalizeMessageLedger(messages: ChatMessageItem[]): ChatMessageItem[] {
  const ordered = messages
    .map((message, index) => ({
      index,
      message: {
        ...message,
        toolCalls: cloneToolCalls(message.toolCalls),
        processBlocks: cloneProcessBlocks(message.processBlocks),
        resources: cloneResources(message.resources),
        media: cloneResources(message.media),
      } satisfies ChatMessageItem,
    }))
    .sort((left, right) => {
      const delta = compareChatMessagesByTimeline(left.message, right.message);
      return delta || (left.index - right.index);
    });
  const normalized: ChatMessageItem[] = [];
  // Fast O(1) lookup by message ID — covers the vast majority of dedup cases.
  const idIndex = new Map<string, number>();
  for (const entry of ordered) {
    // O(1) fast path: same ID → merge directly.
    const byId = idIndex.get(entry.message.id);
    if (byId !== undefined) {
      const merged = mergeEquivalentMessages(normalized[byId]!, entry.message);
      normalized[byId] = merged;
      if (merged.id !== entry.message.id) {
        idIndex.set(merged.id, byId);
      }
      continue;
    }
    // Slow path: check for non-ID equivalence (e.g. inject vs history with same content).
    // This is rare — only triggered when two messages have different IDs but are
    // semantically equivalent per areChatMessagesEquivalent rules.
    let foundIndex = -1;
    for (let i = normalized.length - 1; i >= 0; i--) {
      if (areChatMessagesEquivalent(normalized[i]!, entry.message)) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex >= 0) {
      const merged = mergeEquivalentMessages(normalized[foundIndex]!, entry.message);
      normalized[foundIndex] = merged;
      idIndex.set(merged.id, foundIndex);
      continue;
    }
    // New unique message.
    idIndex.set(entry.message.id, normalized.length);
    normalized.push(entry.message);
  }
  const coalesced = coalesceAssistantDeliveryMessages(normalized);
  // Safety cap: prevent unbounded memory growth in long-lived sessions.
  // Keep the most recent messages (tail) when the ledger exceeds the limit.
  if (coalesced.length > LEDGER_MAX_MESSAGES) {
    return coalesced.slice(coalesced.length - LEDGER_MAX_MESSAGES);
  }
  return coalesced;
}

function isPreservableLocalMessage(message: ChatMessageItem): boolean {
  return message.source === 'inject';
}

export function mergeCanonicalMessageLedger(
  current: ChatMessageItem[],
  incoming: ChatMessageItem[],
  mode: 'append' | 'prepend' | 'replace',
  options: {
    preserveLocalMessages?: boolean;
  } = {},
): ChatMessageItem[] {
  const { preserveLocalMessages = false } = options;
  const merged = (() => {
    if (mode === 'replace') {
      if (!preserveLocalMessages) {
        return incoming.slice();
      }
      const incomingIds = new Set(incoming.map((m) => m.id));
      const preserved = current.filter((message) => (
        isPreservableLocalMessage(message)
        && !incomingIds.has(message.id)
        && !incoming.some((candidate) => areChatMessagesEquivalent(candidate, message))
      ));
      return [...incoming, ...preserved];
    }
    if (mode === 'prepend') {
      return [...incoming, ...current];
    }
    return [...current, ...incoming];
  })();
  const normalized = normalizeMessageLedger(merged);
  if (
    normalized.length === current.length
    && normalized.every((message, index) => message.id === current[index]?.id)
  ) {
    return current;
  }
  return normalized;
}

export function mergeRuntimeWindowMessages(
  current: ChatMessageItem[],
  incoming: ChatMessageItem[],
  mode: 'append' | 'prepend' | 'replace',
): ChatMessageItem[] {
  if (!incoming.length && mode !== 'replace') {
    return current;
  }
  return mergeCanonicalMessageLedger(current, incoming, mode);
}

function runtimeToolStatusRank(
  status: ChatToolCard['status'] | ChatMessageToolCallItem['status'] | null | undefined,
): number {
  if (status === 'error') return 3;
  if (status === 'completed') return 2;
  return 1;
}

function pickRuntimeToolStatus<
  T extends ChatToolCard['status'] | ChatMessageToolCallItem['status'],
>(
  current: T | null | undefined,
  next: T | null | undefined,
): T {
  return (
    runtimeToolStatusRank(next) >= runtimeToolStatusRank(current)
      ? next
      : current || next || 'running'
  ) as T;
}

function pickRuntimeToolResultPreview(params: {
  currentStatus: ChatToolCard['status'] | ChatMessageToolCallItem['status'] | null | undefined;
  nextStatus: ChatToolCard['status'] | ChatMessageToolCallItem['status'] | null | undefined;
  currentPreview: string | null | undefined;
  nextPreview: string | null | undefined;
}): string | null {
  const currentRank = runtimeToolStatusRank(params.currentStatus);
  const nextRank = runtimeToolStatusRank(params.nextStatus);
  const currentPreview = normalizePreview(params.currentPreview);
  const nextPreview = normalizePreview(params.nextPreview);
  if (nextRank > currentRank) {
    return nextPreview || currentPreview;
  }
  if (nextRank < currentRank) {
    return currentPreview || nextPreview;
  }
  if (!currentPreview) {
    return nextPreview;
  }
  if (!nextPreview) {
    return currentPreview;
  }
  return nextPreview.length >= currentPreview.length ? nextPreview : currentPreview;
}

function overlayLifecycleRank(value: ChatRunOverlay['lifecycle'] | null | undefined): number {
  if (value === 'error') return 5;
  if (value === 'completed') return 4;
  if (value === 'aborted') return 3;
  if (value === 'running') return 2;
  if (value === 'queued') return 1;
  return 0;
}

export function mergeRuntimeToolLike<
  T extends ChatToolCard | ChatMessageToolCallItem,
>(current: T, next: T): T {
  const mergedStatus = pickRuntimeToolStatus(current.status, next.status);
  return {
    ...current,
    ...next,
    status: mergedStatus,
    startedAt: current.startedAt || next.startedAt,
    updatedAt: next.updatedAt || current.updatedAt,
    argsPreview: normalizePreview(current.argsPreview) && !normalizePreview(next.argsPreview)
      ? normalizePreview(current.argsPreview)
      : normalizePreview(next.argsPreview) || normalizePreview(current.argsPreview),
    resultPreview: pickRuntimeToolResultPreview({
      currentStatus: current.status,
      nextStatus: next.status,
      currentPreview: current.resultPreview,
      nextPreview: next.resultPreview,
    }),
    isError: current.isError || next.isError || mergedStatus === 'error',
    artifacts: next.artifacts?.length
      ? next.artifacts.map((item) => ({ ...item }))
      : current.artifacts?.map((item) => ({ ...item })),
  };
}

export function mergeRuntimeOverlay(
  current: ChatRunOverlay | null | undefined,
  next: ChatRunOverlay,
): ChatRunOverlay {
  if (!current) {
    return next;
  }
  const toolMap = new Map<string, ChatRunOverlay['toolCalls'][number]>();
  for (const item of current.toolCalls) {
    toolMap.set(item.toolCallId, { ...item });
  }
  for (const item of next.toolCalls) {
    const previous = toolMap.get(item.toolCallId);
    toolMap.set(item.toolCallId, previous ? mergeRuntimeToolLike(previous, item) : { ...item });
  }
  return {
    ...current,
    ...next,
    lifecycle: overlayLifecycleRank(next.lifecycle) >= overlayLifecycleRank(current.lifecycle)
      ? next.lifecycle
      : current.lifecycle,
    previewText: normalizePreview(next.previewText) || normalizePreview(current.previewText) || '',
    toolCalls: [...toolMap.values()].sort((left, right) => {
      const leftTs = Date.parse(left.startedAt || left.updatedAt || '') || 0;
      const rightTs = Date.parse(right.startedAt || right.updatedAt || '') || 0;
      return leftTs - rightTs || left.toolCallId.localeCompare(right.toolCallId);
    }),
    updatedAt: next.updatedAt || current.updatedAt,
    finalMessageId: current.finalMessageId || next.finalMessageId,
    finalCreatedAt: current.finalCreatedAt || next.finalCreatedAt,
    firstAssistantSeenAt: current.firstAssistantSeenAt || next.firstAssistantSeenAt,
    firstToolStartedAt: current.firstToolStartedAt || next.firstToolStartedAt,
    sequence: Math.max(current.sequence || 0, next.sequence || 0),
  };
}

export function areRuntimeOverlaysEqual(
  left: ChatRunOverlay | null | undefined,
  right: ChatRunOverlay | null | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (
    left.runId !== right.runId
    || left.startedAt !== right.startedAt
    || left.updatedAt !== right.updatedAt
    || left.lifecycle !== right.lifecycle
    || left.previewText !== right.previewText
    || left.finalMessageId !== right.finalMessageId
    || left.finalCreatedAt !== right.finalCreatedAt
    || left.firstAssistantSeenAt !== right.firstAssistantSeenAt
    || left.firstToolStartedAt !== right.firstToolStartedAt
    || left.sequence !== right.sequence
    || left.toolCalls.length !== right.toolCalls.length
  ) {
    return false;
  }
  return left.toolCalls.every((toolCall, index) => {
    const target = right.toolCalls[index];
    if (!target) {
      return false;
    }
    return (
      toolCall.toolCallId === target.toolCallId
      && toolCall.runId === target.runId
      && toolCall.name === target.name
      && toolCall.status === target.status
      && toolCall.startedAt === target.startedAt
      && toolCall.updatedAt === target.updatedAt
      && toolCall.argsPreview === target.argsPreview
      && toolCall.resultPreview === target.resultPreview
      && toolCall.isError === target.isError
      && (toolCall.artifacts?.length || 0) === (target.artifacts?.length || 0)
    );
  });
}

export function buildRunOverlayRecord(overlays: ChatRunOverlay[]): Record<string, ChatRunOverlay> {
  return Object.fromEntries(overlays.map((overlay) => [overlay.runId, overlay]));
}

export function buildOverlayToolCallIds(overlays: ChatRunOverlay[]): string[] {
  return overlays.flatMap((overlay) => overlay.toolCalls.map((toolCall) => toolCall.toolCallId));
}

export function buildTimelineVersion(items: ChatRenderableItem[]): string {
  return items.map((item) => (
    item.type === 'message_group'
      ? item.id
      : `${item.overlay.runId}:${item.overlay.updatedAt}:${item.overlay.sequence}:${item.processBlocks?.length || 0}`
  )).join('|');
}
