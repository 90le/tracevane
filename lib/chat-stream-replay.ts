import type { ChatStreamEvent } from '../types/chat.js';

export type ChatStreamReplayState = {
  nextSeqBySession: Map<string, number>;
  eventsBySession: Map<string, ChatStreamEvent[]>;
};

export type ClearChatStreamReplayOptions = {
  resetSequence?: boolean;
};

export function createChatStreamReplayState(): ChatStreamReplayState {
  return {
    nextSeqBySession: new Map<string, number>(),
    eventsBySession: new Map<string, ChatStreamEvent[]>(),
  };
}

function normalizeSessionKey(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function normalizeChatStreamSeq(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

export function rememberChatStreamEvent(
  state: ChatStreamReplayState,
  sessionKey: string,
  event: ChatStreamEvent,
  limit: number,
): ChatStreamEvent {
  const normalizedSessionKey = normalizeSessionKey(sessionKey);
  if (!normalizedSessionKey) {
    return event;
  }
  const nextSeq = (state.nextSeqBySession.get(normalizedSessionKey) || 0) + 1;
  state.nextSeqBySession.set(normalizedSessionKey, nextSeq);
  const eventWithSeq: ChatStreamEvent = {
    ...event,
    streamSeq: nextSeq,
  };
  const events = state.eventsBySession.get(normalizedSessionKey) || [];
  events.push(eventWithSeq);
  const normalizedLimit = Math.max(1, Math.floor(limit));
  if (events.length > normalizedLimit) {
    events.splice(0, events.length - normalizedLimit);
  }
  state.eventsBySession.set(normalizedSessionKey, events);
  return eventWithSeq;
}

export function listChatStreamEventsAfter(
  state: ChatStreamReplayState,
  sessionKey: string,
  lastSeq: number | null | undefined,
): ChatStreamEvent[] {
  const normalizedSessionKey = normalizeSessionKey(sessionKey);
  const normalizedSeq = normalizeChatStreamSeq(lastSeq);
  if (!normalizedSessionKey || normalizedSeq == null) {
    return [];
  }
  return (state.eventsBySession.get(normalizedSessionKey) || [])
    .filter((event) => normalizeChatStreamSeq(event.streamSeq) != null && Number(event.streamSeq) > normalizedSeq)
    .map((event) => ({ ...event }));
}

export function clearChatStreamReplaySession(
  state: ChatStreamReplayState,
  sessionKey: string,
  options: ClearChatStreamReplayOptions = {},
): void {
  const normalizedSessionKey = normalizeSessionKey(sessionKey);
  if (!normalizedSessionKey) {
    return;
  }
  // Keep the sequence monotonic across resets so reconnecting clients that still
  // hold the previous cursor cannot skip newly emitted events.
  if (options.resetSequence) {
    state.nextSeqBySession.delete(normalizedSessionKey);
  }
  state.eventsBySession.delete(normalizedSessionKey);
}
