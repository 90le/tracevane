import type {
  ChatHistoryPayload,
  ChatHistorySearchPayload,
  ChatMessageItem,
  ChatObservabilityState,
  ChatRunOverlay,
  ChatSessionRow,
} from '../../../../../types/chat';
import type { ChatSessionRuntimeMachineState } from './chat-session-runtime-machine';
import { decodeChatSessionRef, encodeChatSessionRef } from './session-ref';

const CHAT_RUNTIME_SNAPSHOT_MAX_MESSAGES = 120;
const CHAT_RUNTIME_SNAPSHOT_MAX_SETTLED_OVERLAYS = 24;

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

function normalizeLegacySessionKey(value: string): string | null {
  const trimmed = String(value || '').trim();
  return trimmed || null;
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
  return normalizeLegacySessionKey(params.legacyQuerySession);
}

export function hasBrokenChatRouteSessionRef(params: {
  routeParamSessionRef: string;
}): boolean {
  return Boolean(
    params.routeParamSessionRef
      && !decodeChatSessionRef(params.routeParamSessionRef),
  );
}

export function shouldNormalizeChatSessionQueryRoute(params: {
  currentPath: string;
  shellMode: 'chat' | 'inspect';
  routeParamSessionRef: string;
  routeQuerySessionRef: string;
  legacyQuerySession: string;
}): boolean {
  if (params.routeParamSessionRef) {
    return hasBrokenChatRouteSessionRef(params)
      && Boolean(
        params.routeQuerySessionRef
          || normalizeLegacySessionKey(params.legacyQuerySession),
      );
  }
  if (normalizeLegacySessionKey(params.legacyQuerySession)) {
    return true;
  }
  if (!params.routeQuerySessionRef) {
    return false;
  }
  const hasValidQuerySessionRef = Boolean(
    decodeChatSessionRef(params.routeQuerySessionRef),
  );
  if (params.shellMode === 'inspect' && params.currentPath === '/chat/workbench') {
    return !hasValidQuerySessionRef;
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

const CHAT_RUNTIME_SNAPSHOT_PREFIX = 'tracevane.chat.runtime-snapshot.';

type RuntimeSnapshot = {
  sessionKey: string;
  payload: ChatHistoryPayload;
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
  runtimeMachineState?: ChatSessionRuntimeMachineState;
  savedAt: string;
};

function cloneMessage(message: ChatMessageItem): ChatMessageItem {
  return { ...message };
}

function cloneOverlay(overlay: ChatRunOverlay): ChatRunOverlay {
  return {
    ...overlay,
    toolCalls: overlay.toolCalls.map((toolCall) => ({ ...toolCall })),
  };
}

function overlayTimestamp(overlay: ChatRunOverlay): number {
  return (
    Date.parse(overlay.updatedAt || '') ||
    Date.parse(overlay.startedAt || '') ||
    0
  );
}

function isOverlaySettled(overlay: ChatRunOverlay): boolean {
  return overlay.lifecycle === 'completed' || overlay.lifecycle === 'aborted' || overlay.lifecycle === 'error';
}

function trimSnapshotMessages(messages: ChatMessageItem[]): ChatMessageItem[] {
  if (messages.length <= CHAT_RUNTIME_SNAPSHOT_MAX_MESSAGES) {
    return messages.map(cloneMessage);
  }
  return messages.slice(-CHAT_RUNTIME_SNAPSHOT_MAX_MESSAGES).map(cloneMessage);
}

function trimSnapshotOverlays(
  overlays: ChatRunOverlay[],
  preservedRunIds: Set<string>,
): ChatRunOverlay[] {
  const sorted = overlays
    .map(cloneOverlay)
    .sort((left, right) => overlayTimestamp(right) - overlayTimestamp(left));
  const preserved = sorted.filter((overlay) => preservedRunIds.has(overlay.runId) || !isOverlaySettled(overlay));
  const preservedRunIdSet = new Set(preserved.map((overlay) => overlay.runId));
  const recentSettled = sorted.filter((overlay) => !preservedRunIdSet.has(overlay.runId)).slice(0, CHAT_RUNTIME_SNAPSHOT_MAX_SETTLED_OVERLAYS);
  return [...preserved, ...recentSettled]
    .sort((left, right) => overlayTimestamp(left) - overlayTimestamp(right));
}

function trimSnapshotRuntimeState(
  runtimeMachineState: ChatSessionRuntimeMachineState | undefined,
  messages: ChatMessageItem[],
  overlays: ChatRunOverlay[],
): ChatSessionRuntimeMachineState | undefined {
  if (!runtimeMachineState) {
    return undefined;
  }
  const allowedRunIds = new Set<string>();
  for (const message of messages) {
    if (message.runId) {
      allowedRunIds.add(message.runId);
    }
  }
  for (const overlay of overlays) {
    if (overlay.runId) {
      allowedRunIds.add(overlay.runId);
    }
  }
  for (const runId of Object.keys(runtimeMachineState.transientRunState)) {
    allowedRunIds.add(runId);
  }
  const nextTransientRunState = Object.fromEntries(
    Object.entries(runtimeMachineState.transientRunState).filter(([runId]) => allowedRunIds.has(runId)),
  );
  const nextProcessLedger = Object.fromEntries(
    Object.entries(runtimeMachineState.processLedger).filter(([runId]) => allowedRunIds.has(runId)),
  );
  return {
    ...runtimeMachineState,
    canonicalMessageLedger: messages.map(cloneMessage),
    transientRunState: nextTransientRunState,
    processLedger: nextProcessLedger,
  };
}

function normalizeRuntimeSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  const trimmedMessages = trimSnapshotMessages(snapshot.messages || snapshot.payload.messages || []);
  const preservedRunIds = new Set<string>();
  for (const message of trimmedMessages) {
    if (message.runId) {
      preservedRunIds.add(message.runId);
    }
  }
  if (snapshot.runtimeMachineState) {
    for (const runId of Object.keys(snapshot.runtimeMachineState.transientRunState)) {
      preservedRunIds.add(runId);
    }
    for (const overlay of Object.values(snapshot.runtimeMachineState.processLedger)) {
      if (!isOverlaySettled(overlay) && overlay.runId) {
        preservedRunIds.add(overlay.runId);
      }
    }
  }
  const trimmedOverlays = trimSnapshotOverlays(snapshot.overlays || snapshot.payload.overlays || [], preservedRunIds);
  return {
    ...snapshot,
    payload: {
      ...snapshot.payload,
      messages: trimmedMessages.map(cloneMessage),
      overlays: trimmedOverlays.map(cloneOverlay),
    },
    messages: trimmedMessages.map(cloneMessage),
    overlays: trimmedOverlays.map(cloneOverlay),
    runtimeMachineState: trimSnapshotRuntimeState(snapshot.runtimeMachineState, trimmedMessages, trimmedOverlays),
  };
}

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
  const snapshot = normalizeRuntimeSnapshot({
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
  });
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
    const parsed = normalizeRuntimeSnapshot(JSON.parse(raw) as RuntimeSnapshot);
    if (!parsed || parsed.sessionKey !== sessionKey || !parsed.payload || !Array.isArray(parsed.messages)) {
      return null;
    }
    try {
      window.sessionStorage.setItem(
        `${CHAT_RUNTIME_SNAPSHOT_PREFIX}${sessionKey}`,
        JSON.stringify(parsed),
      );
    } catch {}
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
