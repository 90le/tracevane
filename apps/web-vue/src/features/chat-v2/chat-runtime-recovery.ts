import type {
  ChatHistoryPayload,
  ChatHistorySearchPayload,
  ChatMessageItem,
  ChatObservabilityState,
  ChatRunOverlay,
  ChatSessionRow,
} from '../../../../../types/chat';
import type { ChatSessionRuntimeMachineState } from './chat-session-runtime-machine';
import { decodeChatSessionRef, encodeChatSessionRef } from '../chat/session-ref';

export function buildSearchHistoryPayload(
  result: ChatHistorySearchPayload,
  observability: ChatObservabilityState,
): ChatHistoryPayload {
  return {
    checkedAt: result.checkedAt,
    session: result.session,
    messages: result.messages,
    overlays: result.overlays,
    runtime: result.runtime,
    diagnostics: result.diagnostics,
    observability,
    pageInfo: result.pageInfo,
    day: result.day,
  };
}

export function matchesSelectedHistoryDay(
  message: Pick<ChatMessageItem, 'createdAt'>,
  day: string | null,
): boolean {
  if (!day) {
    return true;
  }
  return String(message.createdAt || '').slice(0, 10) === day;
}

export function shouldIncludeMessageInHistoryWindow(params: {
  historyMode: 'history' | 'search';
  selectedDay: string | null;
  message: ChatMessageItem;
}): boolean {
  if (params.historyMode !== 'history') {
    return false;
  }
  return matchesSelectedHistoryDay(params.message, params.selectedDay);
}

export function resolveChatRouteSessionKey(params: {
  routeParamSessionRef: string;
  routeQuerySessionRef: string;
  legacyQuerySession: string;
}): string | null {
  if (params.routeParamSessionRef) {
    const decodedParamSessionRef = decodeChatSessionRef(
      params.routeParamSessionRef,
    );
    if (decodedParamSessionRef) {
      return decodedParamSessionRef;
    }
  }
  if (params.routeQuerySessionRef) {
    const decodedQuerySessionRef = decodeChatSessionRef(
      params.routeQuerySessionRef,
    );
    if (decodedQuerySessionRef) {
      return decodedQuerySessionRef;
    }
  }
  return params.legacyQuerySession || null;
}

export function shouldNormalizeChatSessionQueryRoute(params: {
  currentPath: string;
  shellMode: 'chat' | 'inspect';
  routeParamSessionRef: string;
  routeQuerySessionRef: string;
  legacyQuerySession: string;
}): boolean {
  if (params.routeParamSessionRef) {
    return false;
  }
  if (params.legacyQuerySession) {
    return true;
  }
  if (!params.routeQuerySessionRef) {
    return false;
  }
  if (params.shellMode === 'inspect' && params.currentPath === '/chat/workbench') {
    return false;
  }
  return true;
}

export function resolveFallbackSessionKey(params: {
  availableSessions: ChatSessionRow[];
  storedSessionKey: string | null;
}): string {
  if (params.storedSessionKey && params.availableSessions.some((session) => session.key === params.storedSessionKey)) {
    return params.storedSessionKey;
  }
  return params.availableSessions[0]?.key || '';
}

export function resolveRequestedOrFallbackSessionKey(params: {
  requestedSessionKey: string | null;
  availableSessions: ChatSessionRow[];
  storedSessionKey: string | null;
}): string {
  if (
    params.requestedSessionKey
    && params.availableSessions.some((session) => session.key === params.requestedSessionKey)
  ) {
    return params.requestedSessionKey;
  }
  return resolveFallbackSessionKey({
    availableSessions: params.availableSessions,
    storedSessionKey: params.storedSessionKey,
  });
}

export function buildChatRoute(params: {
  currentPath: string;
  shellMode: 'chat' | 'inspect';
  sessionKey: string | null;
}): { path: string; query?: Record<string, string> } {
  if (params.shellMode === 'inspect') {
    const query: Record<string, string> = {};
    if (params.sessionKey) {
      query.sessionRef = encodeChatSessionRef(params.sessionKey);
    }
    return { path: '/chat/workbench', query };
  }
  if (params.currentPath === '/chat') {
    return { path: '/chat' };
  }
  if (!params.sessionKey) {
    return { path: '/chat' };
  }
  return { path: `/chat/s/${encodeChatSessionRef(params.sessionKey)}` };
}

const CHAT_RUNTIME_SNAPSHOT_PREFIX = 'openclaw-studio.chat.runtime-snapshot.';

type RuntimeSnapshot = {
  sessionKey: string;
  payload: ChatHistoryPayload;
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
  runtimeMachineState?: ChatSessionRuntimeMachineState;
  savedAt: string;
};

export function saveChatRuntimeSnapshot(
  sessionKey: string,
  payload: ChatHistoryPayload,
  messages: ChatMessageItem[],
  overlays: ChatRunOverlay[],
  runtimeMachineState?: ChatSessionRuntimeMachineState,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  const snapshot: RuntimeSnapshot = {
    sessionKey,
    payload: {
      ...payload,
      messages,
      overlays,
    },
    messages,
    overlays,
    runtimeMachineState,
    savedAt: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(
      `${CHAT_RUNTIME_SNAPSHOT_PREFIX}${sessionKey}`,
      JSON.stringify(snapshot),
    );
  } catch {}
}

export function readChatRuntimeSnapshot(sessionKey: string): RuntimeSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(`${CHAT_RUNTIME_SNAPSHOT_PREFIX}${sessionKey}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as RuntimeSnapshot;
    if (!parsed || parsed.sessionKey !== sessionKey || !parsed.payload || !Array.isArray(parsed.messages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearChatRuntimeSnapshot(sessionKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(`${CHAT_RUNTIME_SNAPSHOT_PREFIX}${sessionKey}`);
  } catch {}
}

export function hydrateHistoryPayloadFromSnapshot(
  payload: ChatHistoryPayload,
  snapshot: RuntimeSnapshot | null,
): ChatHistoryPayload {
  if (!snapshot || snapshot.sessionKey !== payload.session.key) {
    return payload;
  }
  if (payload.messages.length > 0) {
    return payload;
  }
  return {
    ...payload,
    messages: snapshot.messages,
    overlays: snapshot.overlays,
    observability: snapshot.payload.observability || payload.observability,
    runtime: snapshot.payload.runtime || payload.runtime,
  };
}

export function restoreRuntimeMachineStateFromSnapshot(
  sessionKey: string,
  snapshot: RuntimeSnapshot | null,
): ChatSessionRuntimeMachineState | null {
  if (!snapshot || snapshot.sessionKey !== sessionKey || !snapshot.runtimeMachineState) {
    return null;
  }
  return snapshot.runtimeMachineState;
}

export function shouldRestoreRuntimeMachineStateFromSnapshot(params: {
  sessionKey: string;
  snapshot: RuntimeSnapshot | null;
  serverPayload: ChatHistoryPayload;
}): boolean {
  if (!params.snapshot || params.snapshot.sessionKey !== params.sessionKey || !params.snapshot.runtimeMachineState) {
    return false;
  }
  return params.serverPayload.messages.length === 0;
}
