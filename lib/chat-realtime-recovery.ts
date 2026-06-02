export type ChatRealtimeRecoveryState = {
  pendingSessionKeys: Set<string>;
  lastSyncAtBySession: Map<string, number>;
};

export type ChatRealtimeRecoverySyncDecision = {
  shouldSync: boolean;
  retryAfterMs: number | null;
};

export function createChatRealtimeRecoveryState(): ChatRealtimeRecoveryState {
  return {
    pendingSessionKeys: new Set<string>(),
    lastSyncAtBySession: new Map<string, number>(),
  };
}

function normalizeSessionKey(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function markChatRealtimeDisconnected(
  state: ChatRealtimeRecoveryState,
  sessionKey: string | null | undefined,
): void {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return;
  }
  state.pendingSessionKeys.add(normalized);
}

export function clearChatRealtimeRecoveryState(
  state: ChatRealtimeRecoveryState,
  sessionKey?: string | null,
): void {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    state.pendingSessionKeys.clear();
    state.lastSyncAtBySession.clear();
    return;
  }
  state.pendingSessionKeys.delete(normalized);
  state.lastSyncAtBySession.delete(normalized);
}

export function shouldScheduleChatRealtimeRecoverySync(
  state: ChatRealtimeRecoveryState,
  params: {
    sessionKey: string | null | undefined;
    nowMs: number;
    minIntervalMs: number;
  },
): boolean {
  return resolveChatRealtimeRecoverySyncDecision(state, params).shouldSync;
}

export function resolveChatRealtimeRecoverySyncDecision(
  state: ChatRealtimeRecoveryState,
  params: {
    sessionKey: string | null | undefined;
    nowMs: number;
    minIntervalMs: number;
  },
): ChatRealtimeRecoverySyncDecision {
  const normalized = normalizeSessionKey(params.sessionKey);
  if (!normalized || !state.pendingSessionKeys.has(normalized)) {
    return {
      shouldSync: false,
      retryAfterMs: null,
    };
  }
  const lastSyncAt = state.lastSyncAtBySession.get(normalized) || 0;
  const elapsedMs = params.nowMs - lastSyncAt;
  if (elapsedMs < params.minIntervalMs) {
    return {
      shouldSync: false,
      retryAfterMs: Math.max(0, params.minIntervalMs - elapsedMs),
    };
  }
  state.pendingSessionKeys.delete(normalized);
  state.lastSyncAtBySession.set(normalized, params.nowMs);
  return {
    shouldSync: true,
    retryAfterMs: null,
  };
}
