import type {
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatRunOverlay,
} from '../../../../types/chat.js';
import type { StudioAssistantRunShadow } from './run-projection-store.js';
import { normalizeString } from './shared.js';

function overlayHasVisibleContent(overlay: ChatRunOverlay | null | undefined): boolean {
  if (!overlay) {
    return false;
  }
  return Boolean(overlay.previewText.trim() || overlay.toolCalls.length);
}

function isCanonicalToolStepAssistantMessage(message: ChatMessageItem): boolean {
  if (message.role !== 'assistant' || !message.toolCalls?.length) {
    return false;
  }
  if (normalizeString(message.stopReason).toLowerCase() === 'tooluse') {
    return true;
  }
  return !normalizeString(message.text);
}

function hasCanonicalToolStepCoverage(
  messages: ChatMessageItem[],
  supplement: { toolCalls: ChatMessageToolCallItem[] | undefined },
): boolean {
  const toolCallIds = new Set(
    (supplement.toolCalls || [])
      .map((item) => normalizeString(item.toolCallId))
      .filter(Boolean),
  );
  if (!toolCallIds.size) {
    return false;
  }
  return messages.some((message) => (
    isCanonicalToolStepAssistantMessage(message)
    && Boolean(message.toolCalls?.some((toolCall) => toolCallIds.has(normalizeString(toolCall.toolCallId))))
  ));
}

function toolCallStatusRank(status: ChatMessageToolCallItem['status'] | null | undefined): number {
  if (status === 'error') return 3;
  if (status === 'completed') return 2;
  return 1;
}

/**
 * When canonical tool step messages already have toolCallIds from the transcript,
 * `hasCanonicalToolStepCoverage` prevents the supplement from being applied.
 * But transcript tool calls always have status='running' (they record the request, not the result).
 * This function merges the supplement's terminal statuses into existing canonical tool step messages
 * so that tools correctly show 'completed' or 'error' instead of being stuck at 'running'.
 */
function enrichCanonicalToolStepStatuses(
  messages: ChatMessageItem[],
  supplementToolCalls: ChatMessageToolCallItem[],
): void {
  if (!supplementToolCalls.length) {
    return;
  }
  const supplementMap = new Map(
    supplementToolCalls
      .filter((tc) => normalizeString(tc.toolCallId))
      .map((tc) => [normalizeString(tc.toolCallId), tc]),
  );
  if (!supplementMap.size) {
    return;
  }
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (!isCanonicalToolStepAssistantMessage(msg) || !msg.toolCalls?.length) {
      continue;
    }
    let changed = false;
    const updatedToolCalls = msg.toolCalls.map((tc) => {
      const supplementTc = supplementMap.get(normalizeString(tc.toolCallId));
      if (!supplementTc) return tc;
      const currentRank = toolCallStatusRank(tc.status);
      const supplementRank = toolCallStatusRank(supplementTc.status);
      if (supplementRank <= currentRank
        && !(!tc.resultPreview && supplementTc.resultPreview)
        && !(!tc.argsPreview && supplementTc.argsPreview)) {
        return tc;
      }
      changed = true;
      return {
        ...tc,
        status: supplementRank >= currentRank ? supplementTc.status : tc.status,
        resultPreview: tc.resultPreview || supplementTc.resultPreview || null,
        argsPreview: tc.argsPreview || supplementTc.argsPreview || null,
        updatedAt: supplementTc.updatedAt || tc.updatedAt,
        isError: tc.isError || supplementTc.isError || supplementTc.status === 'error',
        artifacts: supplementTc.artifacts?.length ? supplementTc.artifacts : tc.artifacts,
      };
    });
    if (changed) {
      messages[i] = { ...msg, toolCalls: updatedToolCalls };
    }
  }
}

function findAssistantHistoryMessageIndex(
  messages: ChatMessageItem[],
  supplement: {
    runId: string | null;
    finalMessageId: string | null;
    finalCreatedAt: string | null;
  },
): number {
  const finalMessageId = normalizeString(supplement.finalMessageId);
  if (finalMessageId) {
    const byId = messages.findIndex((message) => message.role === 'assistant' && message.id === finalMessageId);
    if (byId >= 0) {
      return byId;
    }
  }

  const runId = normalizeString(supplement.runId);
  if (runId) {
    const assistantsForRun = messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === 'assistant' && message.runId === runId);
    if (assistantsForRun.length === 1) {
      return assistantsForRun[0]?.index ?? -1;
    }
  }
  return -1;
}

export function supplementHistoryWithRunState(params: {
  sessionKey: string;
  messages: ChatMessageItem[];
  liveRunIds: Set<string>;
  liveSupplements: Array<{
    runId: string | null;
    finalMessageId: string | null;
    finalCreatedAt: string | null;
    toolCalls: ChatMessageToolCallItem[] | undefined;
  }>;
  shadowSupplements: StudioAssistantRunShadow[];
  rehydrateToolCalls: (sessionKey: string, toolCalls: ChatMessageToolCallItem[]) => ChatMessageToolCallItem[] | undefined;
  mergeHistoryAssistantMessage: (
    current: ChatMessageItem,
    supplement: { runId: string | null; toolCalls?: ChatMessageToolCallItem[] | undefined },
  ) => ChatMessageItem;
}): ChatMessageItem[] {
  const next = params.messages.map((message) => ({ ...message }));
  const supplements = [
    ...params.liveSupplements,
    ...params.shadowSupplements
      .filter((shadow) => !params.liveRunIds.has(shadow.runId))
      .map((shadow) => ({
        runId: shadow.runId,
        finalMessageId: shadow.finalMessageId || null,
        finalCreatedAt: shadow.finalCreatedAt || null,
        toolCalls: params.rehydrateToolCalls(params.sessionKey, shadow.toolCalls),
      })),
  ];

  for (const supplement of supplements) {
    const index = findAssistantHistoryMessageIndex(next, supplement);
    if (index < 0) {
      continue;
    }
    const hasCoverage = hasCanonicalToolStepCoverage(next, supplement);
    if (hasCoverage && supplement.toolCalls?.length) {
      enrichCanonicalToolStepStatuses(next, supplement.toolCalls);
    }
    const toolCalls = hasCoverage
      ? undefined
      : supplement.toolCalls;
    next[index] = params.mergeHistoryAssistantMessage(next[index]!, {
      runId: supplement.runId,
      toolCalls,
    });
  }

  return next;
}

export function listRunOverlaysForHistorySnapshot<TProjection extends {
  runId: string;
  finalMessageId: string | null;
  finalCreatedAt: string | null;
}>(params: {
  sessionKey: string;
  liveProjections: TProjection[];
  shadowProjections: StudioAssistantRunShadow[];
  buildLiveOverlay: (projection: TProjection) => ChatRunOverlay;
  buildShadowOverlay: (shadow: StudioAssistantRunShadow) => ChatRunOverlay;
}): ChatRunOverlay[] {
  const liveRunIds = new Set(params.liveProjections.map((projection) => projection.runId));
  const liveOverlays = params.liveProjections
    .map((projection) => params.buildLiveOverlay(projection))
    .filter(overlayHasVisibleContent);
  const shadowOverlays = params.shadowProjections
    .filter((shadow) => !liveRunIds.has(shadow.runId))
    .map((shadow) => params.buildShadowOverlay(shadow))
    .filter(overlayHasVisibleContent);

  return [...liveOverlays, ...shadowOverlays]
    .sort((left, right) => left.sequence - right.sequence || (left.startedAt || '').localeCompare(right.startedAt || ''));
}
