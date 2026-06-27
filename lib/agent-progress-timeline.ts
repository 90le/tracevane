import type {
  ChatPermissionRequestCard,
  ChatProcessBlock,
  ChatRunOverlay,
  ChatSideResult,
  ChatToolCard,
} from '../types/chat.js';

/**
 * Shared Agent progress timeline.
 *
 * This is the product-agnostic version of the Feishu progress-card model:
 * keep a small ordered list of meaningful progress entries, upsert mutable
 * entries by stable ids, and let each surface decide how to render/collapse.
 */
export const AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT = 40;
export const AGENT_PROGRESS_ENTRY_LIMIT_MAX = 30;

export function normalizeAgentProgressEntryLimit(
  entryLimit: number,
  fallback = 8,
): number {
  const value = Number.isFinite(entryLimit) ? Math.floor(entryLimit) : Math.floor(fallback);
  return Math.min(AGENT_PROGRESS_ENTRY_LIMIT_MAX, Math.max(1, value));
}

export function trimAgentProgressEntries<T>(items: T[], limit: number): T[] {
  return items.slice(-normalizeAgentProgressEntryLimit(limit, AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT));
}

export function createAgentProgressFingerprint(input: {
  kind: string;
  rawType?: string | null;
  itemType?: string | null;
  toolCallId?: string | null;
  toolName?: string | null;
  text?: string | null;
}): string {
  return [
    input.kind,
    input.rawType || '',
    input.itemType || '',
    input.toolCallId || '',
    input.toolName || '',
    input.text || '',
  ].join(':');
}

export type AgentProgressTimelineItem =
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; blockId: string; block: ChatProcessBlock }
  | { kind: 'tool'; id: string; toolCallId: string; tool: ChatToolCard }
  | { kind: 'permission'; id: string; requestId: string; permission: ChatPermissionRequestCard }
  | { kind: 'side_result'; id: string; result: ChatSideResult };

export function mergeAgentProgressText(current: string, incoming: string): string {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.startsWith(current)) return incoming;
  if (current.startsWith(incoming)) return current;
  return incoming.length >= current.length ? incoming : current;
}

function trimTimeline(items: AgentProgressTimelineItem[], limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT): AgentProgressTimelineItem[] {
  return trimAgentProgressEntries(items, limit);
}

export function upsertAgentProgressAssistant(
  items: AgentProgressTimelineItem[],
  text: string,
  limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT,
): AgentProgressTimelineItem[] {
  if (!text) return items;
  const id = 'assistant-live';
  const existing = items.findIndex((item) => item.kind === 'assistant' && item.id === id);
  const entry: AgentProgressTimelineItem = { kind: 'assistant', id, text };
  return trimTimeline(existing >= 0
    ? items.map((item, index) => (index === existing ? entry : item))
    : [...items, entry], limit);
}

export function upsertAgentProgressTool(
  items: AgentProgressTimelineItem[],
  tool: ChatToolCard,
  limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT,
): AgentProgressTimelineItem[] {
  const existing = items.findIndex((item) => item.kind === 'tool' && item.toolCallId === tool.toolCallId);
  const entry: AgentProgressTimelineItem = { kind: 'tool', id: `tool:${tool.toolCallId}`, toolCallId: tool.toolCallId, tool };
  return trimTimeline(existing >= 0
    ? items.map((item, index) => (index === existing ? entry : item))
    : [...items, entry], limit);
}

export function upsertAgentProgressThinking(
  items: AgentProgressTimelineItem[],
  block: ChatProcessBlock,
  limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT,
): AgentProgressTimelineItem[] {
  const existing = items.findIndex((item) => item.kind === 'thinking' && item.blockId === block.id);
  const entry: AgentProgressTimelineItem = { kind: 'thinking', id: `thinking:${block.id}`, blockId: block.id, block };
  return trimTimeline(existing >= 0
    ? items.map((item, index) => (index === existing ? entry : item))
    : [...items, entry], limit);
}

export function upsertAgentProgressPermission(
  items: AgentProgressTimelineItem[],
  permission: ChatPermissionRequestCard,
  limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT,
): AgentProgressTimelineItem[] {
  const existing = items.findIndex((item) => item.kind === 'permission' && item.requestId === permission.requestId);
  const entry: AgentProgressTimelineItem = { kind: 'permission', id: `permission:${permission.requestId}`, requestId: permission.requestId, permission };
  return trimTimeline(existing >= 0
    ? items.map((item, index) => (index === existing ? entry : item))
    : [...items, entry], limit);
}

export function appendAgentProgressSideResult(
  items: AgentProgressTimelineItem[],
  result: ChatSideResult,
  limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT,
): AgentProgressTimelineItem[] {
  return trimTimeline([
    ...items,
    { kind: 'side_result', id: `side:${Date.now()}:${items.length}`, result },
  ], limit);
}

export function mergeAgentProgressOverlay(
  items: AgentProgressTimelineItem[],
  overlay: Pick<ChatRunOverlay, 'previewText' | 'toolCalls'>,
  limit = AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT,
): AgentProgressTimelineItem[] {
  let next = upsertAgentProgressAssistant(items, overlay.previewText || '', limit);
  for (const tool of overlay.toolCalls) {
    next = upsertAgentProgressTool(next, { ...tool }, limit);
  }
  return next;
}
