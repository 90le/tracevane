import type {
  ChatActivityItem,
  ChatObservabilityState,
  ChatToolCard,
  ChatToolArtifactItem,
  ChatUsageSummary,
} from '../../../../types/chat.js';
import { compareIsoTimestamp, summarizeUnknown, normalizeString, clipPreview, normalizeDate } from './shared.js';
import { extractMessageText, extractTranscriptRecord, extractTranscriptRole, extractTranscriptToolName } from './transcript.js';

export function normalizeUsageSummary(raw: unknown): ChatUsageSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const inputTokens = Number(record.input ?? record.inputTokens ?? record.input_tokens ?? 0) || 0;
  const outputTokens = Number(record.output ?? record.outputTokens ?? record.output_tokens ?? 0) || 0;
  const cacheReadTokens = Number(record.cacheRead ?? record.cacheReadTokens ?? record.cache_read_tokens ?? 0) || 0;
  const cacheWriteTokens = Number(record.cacheWrite ?? record.cacheWriteTokens ?? record.cache_write_tokens ?? 0) || 0;
  const totalTokens = Number(record.total ?? record.totalTokens ?? record.total_tokens ?? (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens)) || 0;
  const rawCost = record.cost && typeof record.cost === 'object' ? record.cost as Record<string, unknown> : null;
  const costUsd = rawCost ? Number(rawCost.total ?? rawCost.totalUsd ?? rawCost.usd ?? 0) : 0;
  const hasUsageSignal = Object.keys(record).length > 0 || inputTokens > 0 || outputTokens > 0 || totalTokens > 0;
  if (!hasUsageSignal) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: Number.isFinite(costUsd) ? costUsd : null,
  };
}

export function createEmptyObservabilityState(): ChatObservabilityState {
  return {
    lifecycle: null,
    toolCards: [],
    usage: null,
    timeline: [],
  };
}

export function cloneObservabilityState(value: ChatObservabilityState): ChatObservabilityState {
  return {
    lifecycle: value.lifecycle ? { ...value.lifecycle } : null,
    toolCards: value.toolCards.map((item) => ({ ...item })),
    usage: value.usage ? { ...value.usage } : null,
    timeline: value.timeline.map((item) => ({ ...item })),
  };
}

export function appendTimelineItem(
  state: ChatObservabilityState,
  item: ChatActivityItem,
  dedupeId?: string
): ChatObservabilityState {
  const next = cloneObservabilityState(state);
  if (dedupeId) {
    const index = next.timeline.findIndex((entry) => entry.id === dedupeId);
    if (index >= 0) next.timeline[index] = { ...item, id: dedupeId };
    else next.timeline.push({ ...item, id: dedupeId });
  } else {
    next.timeline.push(item);
  }
  next.timeline = next.timeline
    .sort((left, right) => {
      const cmp = compareIsoTimestamp(left.emittedAt, right.emittedAt);
      if (cmp !== 0) return cmp;
      return left.id.localeCompare(right.id);
    })
    .slice(-40);
  return next;
}

export function upsertToolCard(state: ChatObservabilityState, card: ChatToolCard): ChatObservabilityState {
  const next = cloneObservabilityState(state);
  const index = next.toolCards.findIndex((entry) => entry.toolCallId === card.toolCallId);
  if (index >= 0) next.toolCards[index] = { ...next.toolCards[index], ...card };
  else next.toolCards.unshift(card);
  next.toolCards = next.toolCards
    .sort((left, right) => (right.updatedAt || right.startedAt || '').localeCompare(left.updatedAt || left.startedAt || ''))
    .slice(0, 12);
  return next;
}

export function extractHistoryUsage(messages: Record<string, unknown>[]): ChatUsageSummary | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index];
    const record = extractTranscriptRecord(raw);
    if (extractTranscriptRole(raw) !== 'assistant') continue;
    const usage = normalizeUsageSummary(record.usage || raw.usage);
    if (usage) return usage;
  }
  return null;
}

export function deriveObservabilityFromHistory(
  messages: Record<string, unknown>[],
  options: {
    sessionKey?: string;
    collectToolArtifacts?: (sessionKey: string, raw: unknown, toolCallId?: string | null) => ChatToolArtifactItem[];
    toolCardLimit?: number;
    timelineLimit?: number;
  } = {},
): ChatObservabilityState {
  const state = createEmptyObservabilityState();
  state.usage = extractHistoryUsage(messages);
  if (state.usage) {
    state.timeline.push({
      id: `history-usage-${state.usage.totalTokens}`,
      kind: 'usage',
      runId: null,
      toolCallId: null,
      emittedAt: new Date().toISOString(),
      title: `Usage · ${state.usage.totalTokens} tokens`,
      detail: `in ${state.usage.inputTokens} / out ${state.usage.outputTokens}`,
      level: 'info',
    });
  }
  const toolCards = new Map<string, ChatToolCard>();
  const pendingToolCallIds: string[] = [];

  for (const raw of messages) {
    const record = extractTranscriptRecord(raw);
    const role = extractTranscriptRole(raw).toLowerCase();
    const emittedAt = normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt) || new Date().toISOString();
    const runId = normalizeString(record.runId || raw.runId) || null;

    if (role === 'assistant' && Array.isArray(record.content)) {
      for (const part of record.content) {
        if (!part || typeof part !== 'object') continue;
        const record = part as Record<string, unknown>;
        if (normalizeString(record.type) !== 'toolCall') continue;
        const toolCallId = normalizeString(record.id, `tool-${Math.random().toString(36).slice(2)}`);
        const name = normalizeString(record.name, 'tool');
        const card: ChatToolCard = {
          toolCallId,
          runId,
          name,
          status: 'running',
          startedAt: emittedAt,
          updatedAt: emittedAt,
          argsPreview: summarizeUnknown(record.arguments, 220),
          resultPreview: null,
          isError: false,
        };
        toolCards.set(toolCallId, card);
        pendingToolCallIds.push(toolCallId);
        state.timeline.push({
          id: `history-tool-call-${toolCallId}-${emittedAt}`,
          kind: 'tool_call',
          runId,
          toolCallId,
          emittedAt,
          title: `Tool start · ${name}`,
          detail: card.argsPreview,
          level: 'info',
        });
      }
    }

    if (role === 'toolresult' || role === 'tool') {
      const explicitToolCallId = normalizeString(record.toolCallId || raw.toolCallId) || null;
      const queueIndex = explicitToolCallId
        ? pendingToolCallIds.findIndex((item) => item === explicitToolCallId)
        : -1;
      if (queueIndex >= 0) {
        pendingToolCallIds.splice(queueIndex, 1);
      }
      const toolCallId = explicitToolCallId
        || pendingToolCallIds.shift()
        || `tool-${Math.random().toString(36).slice(2)}`;
      const existing = toolCards.get(toolCallId);
      const text = extractMessageText(record);
      let parsedText: Record<string, unknown> | null = null;
      if (typeof text === 'string') {
        const trimmed = text.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              parsedText = parsed as Record<string, unknown>;
            }
          } catch {
            parsedText = null;
          }
        }
      }
      const details = record.details && typeof record.details === 'object' ? record.details as Record<string, unknown> : {};
      const detailSource = Object.keys(details).length ? details : (parsedText || {});
      const status = normalizeString(detailSource.status).toLowerCase();
      const parsedError = normalizeString(detailSource.error);
      const isError = record.isError === true || raw.isError === true || status === 'error' || Boolean(parsedError);
      const card: ChatToolCard = {
        toolCallId,
        runId,
        name: normalizeString(record.toolName || raw.toolName, normalizeString(detailSource.tool, existing?.name || 'tool')),
        status: isError ? 'error' : 'completed',
        startedAt: existing?.startedAt || emittedAt,
        updatedAt: emittedAt,
        argsPreview: existing?.argsPreview || null,
        resultPreview: summarizeUnknown(Object.keys(detailSource).length ? detailSource : clipPreview(text, 260), 260),
        isError,
        artifacts: options.sessionKey && options.collectToolArtifacts && extractTranscriptToolName(raw) !== 'studio_delivery'
          ? options.collectToolArtifacts(options.sessionKey, record, toolCallId)
          : existing?.artifacts,
      };
      toolCards.set(toolCallId, card);
      state.timeline.push({
        id: `history-tool-result-${toolCallId}-${emittedAt}`,
        kind: 'tool_result',
        runId,
        toolCallId,
        emittedAt,
        title: `Tool result · ${card.name}`,
        detail: card.resultPreview,
        level: isError ? 'error' : 'success',
      });
    }
  }

  const sortedToolCards = [...toolCards.values()]
    .sort((left, right) => (right.updatedAt || right.startedAt || '').localeCompare(left.updatedAt || left.startedAt || ''));
  const toolCardLimit = options.toolCardLimit === undefined
    ? 12
    : (Number.isFinite(options.toolCardLimit) ? Math.max(0, Math.floor(options.toolCardLimit)) : null);
  state.toolCards = toolCardLimit == null
    ? sortedToolCards
    : sortedToolCards.slice(0, toolCardLimit);
  const timelineLimit = options.timelineLimit === undefined
    ? 40
    : (Number.isFinite(options.timelineLimit) ? Math.max(0, Math.floor(options.timelineLimit)) : null);
  state.timeline = timelineLimit == null
    ? state.timeline
    : state.timeline.slice(-timelineLimit);
  return state;
}
