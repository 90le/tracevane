import type {
  ChatActivityItem,
  ChatObservabilityState,
  ChatToolCard,
} from '../../../../../types/chat';

export function createEmptyRuntimeObservability(): ChatObservabilityState {
  return {
    lifecycle: null,
    toolCards: [],
    usage: null,
    timeline: [],
  };
}

export function cloneRuntimeObservability(value: ChatObservabilityState): ChatObservabilityState {
  return {
    lifecycle: value.lifecycle ? { ...value.lifecycle } : null,
    toolCards: value.toolCards.map((item) => ({ ...item })),
    usage: value.usage ? { ...value.usage } : null,
    timeline: value.timeline.map((item) => ({ ...item })),
  };
}

function statusRank(status: ChatToolCard['status'] | null | undefined): number {
  if (status === 'error') return 3;
  if (status === 'completed') return 2;
  return 1;
}

function pickToolStatus(
  current: ChatToolCard['status'] | null | undefined,
  next: ChatToolCard['status'] | null | undefined,
): ChatToolCard['status'] {
  return statusRank(next) >= statusRank(current) ? (next || 'running') : (current || 'running');
}

function pickToolPreview(current: string | null | undefined, next: string | null | undefined): string | null {
  const left = String(current || '').trim();
  const right = String(next || '').trim();
  if (!left) return right || null;
  if (!right) return left || null;
  return right.length >= left.length ? right : left;
}

export function mergeRuntimeToolCard(current: ChatToolCard, next: ChatToolCard): ChatToolCard {
  const mergedStatus = pickToolStatus(current.status, next.status);
  return {
    ...current,
    ...next,
    status: mergedStatus,
    startedAt: current.startedAt || next.startedAt,
    updatedAt: next.updatedAt || current.updatedAt,
    argsPreview: pickToolPreview(current.argsPreview, next.argsPreview),
    resultPreview: (
      statusRank(next.status) > statusRank(current.status) && String(next.resultPreview || '').trim()
        ? String(next.resultPreview || '').trim()
        : pickToolPreview(current.resultPreview, next.resultPreview)
    ),
    isError: current.isError || next.isError || mergedStatus === 'error',
    artifacts: next.artifacts?.length
      ? next.artifacts.map((item) => ({ ...item }))
      : current.artifacts?.map((item) => ({ ...item })),
  };
}

export function upsertRuntimeToolCards(cards: ChatToolCard[], card: ChatToolCard): ChatToolCard[] {
  const next = cards.slice();
  const index = next.findIndex((item) => item.toolCallId === card.toolCallId);
  if (index === -1) {
    next.unshift(card);
  } else {
    next[index] = mergeRuntimeToolCard(next[index]!, card);
  }
  return next
    .sort((left, right) => (right.updatedAt || right.startedAt || '').localeCompare(left.updatedAt || left.startedAt || ''))
    .slice(0, 12);
}

export function settleRuntimeToolCardsBeforeAssistant(
  cards: ChatToolCard[],
  runId: string | null | undefined,
  emittedAt: string,
): ChatToolCard[] {
  if (!runId) {
    return cards;
  }
  let changed = false;
  const next = cards.map((card) => {
    if (card.runId !== runId || card.status !== 'running') {
      return { ...card };
    }
    changed = true;
    return {
      ...card,
      status: 'completed' as const,
      updatedAt: emittedAt || card.updatedAt,
    };
  });
  return changed ? next : cards;
}

export function upsertRuntimeTimelineItems(items: ChatActivityItem[], item: ChatActivityItem): ChatActivityItem[] {
  const next = items.slice();
  const index = next.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    next.push(item);
  } else {
    next[index] = item;
  }
  next.sort((left, right) => {
    const leftTs = Date.parse(left.emittedAt || '') || 0;
    const rightTs = Date.parse(right.emittedAt || '') || 0;
    if (leftTs !== rightTs) {
      return leftTs - rightTs;
    }
    return left.id.localeCompare(right.id);
  });
  return next.slice(-40);
}
