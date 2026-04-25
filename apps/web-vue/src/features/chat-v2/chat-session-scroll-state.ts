export interface ChatSessionScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ChatSessionScrollState {
  isPinnedToBottom: boolean;
  autoScrollLockedByUser: boolean;
  pendingUnreadCount: number;
  awaitingInitialBottomAnchor: boolean;
  userBrowseLockUntil: number;
  lastScrollTop: number | null;
  prependAnchor: {
    scrollTop: number;
    scrollHeight: number;
  } | null;
  appendAnchor: {
    scrollTop: number;
    scrollHeight: number;
  } | null;
}

export type ChatSessionScrollResolution =
  | { kind: 'none' }
  | { kind: 'scroll-bottom' }
  | { kind: 'restore-prepend'; top: number }
  | { kind: 'restore-append'; top: number };

function distanceFromBottom(metrics: ChatSessionScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

function isUserBrowseLockActive(state: ChatSessionScrollState, nowMs: number): boolean {
  return state.userBrowseLockUntil > nowMs;
}

export function createChatSessionScrollState(): ChatSessionScrollState {
  return {
    isPinnedToBottom: true,
    autoScrollLockedByUser: false,
    pendingUnreadCount: 0,
    awaitingInitialBottomAnchor: true,
    userBrowseLockUntil: 0,
    lastScrollTop: null,
    prependAnchor: null,
    appendAnchor: null,
  };
}

export function beginChatSessionScrollRestore(state: ChatSessionScrollState): ChatSessionScrollState {
  return {
    ...createChatSessionScrollState(),
    awaitingInitialBottomAnchor: true,
  };
}

export function syncChatSessionPinnedState(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics,
  nowMs = Date.now(),
): ChatSessionScrollState {
  if (isUserBrowseLockActive(state, nowMs)) {
    return {
      ...state,
      isPinnedToBottom: false,
      autoScrollLockedByUser: true,
      lastScrollTop: metrics.scrollTop,
    };
  }
  const pinned = distanceFromBottom(metrics) <= 80;
  if (pinned) {
    return {
      ...state,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
      pendingUnreadCount: 0,
      lastScrollTop: metrics.scrollTop,
    };
  }
  return {
    ...state,
    isPinnedToBottom: false,
    lastScrollTop: metrics.scrollTop,
  };
}

export function applyChatSessionManualScroll(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics,
  nowMs = Date.now(),
): ChatSessionScrollState {
  const bottomDistance = distanceFromBottom(metrics);
  const lastScrollTop = state.lastScrollTop;
  const upwardIntent = lastScrollTop != null && metrics.scrollTop < lastScrollTop - 4;
  const downwardIntent = lastScrollTop != null && metrics.scrollTop > lastScrollTop + 4;
  const lockActive = isUserBrowseLockActive(state, nowMs) || upwardIntent;
  const preserveExistingBrowseLock = state.autoScrollLockedByUser && !downwardIntent;
  if (bottomDistance <= 80 && !preserveExistingBrowseLock && (!lockActive || downwardIntent)) {
    return {
      ...state,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
      pendingUnreadCount: 0,
      userBrowseLockUntil: 0,
      lastScrollTop: metrics.scrollTop,
    };
  }
  if (lockActive || preserveExistingBrowseLock) {
    return {
      ...state,
      isPinnedToBottom: false,
      autoScrollLockedByUser: true,
      awaitingInitialBottomAnchor: false,
      userBrowseLockUntil: Math.max(state.userBrowseLockUntil, nowMs + 1200),
      lastScrollTop: metrics.scrollTop,
    };
  }
  return {
    ...state,
    isPinnedToBottom: false,
    autoScrollLockedByUser: true,
    lastScrollTop: metrics.scrollTop,
  };
}

export function markChatSessionUserBrowseIntent(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics | null,
  nowMs = Date.now(),
): ChatSessionScrollState {
  return {
    ...state,
    isPinnedToBottom: false,
    autoScrollLockedByUser: true,
    awaitingInitialBottomAnchor: false,
    userBrowseLockUntil: Math.max(state.userBrowseLockUntil, nowMs + 1200),
    lastScrollTop: metrics?.scrollTop ?? state.lastScrollTop,
  };
}

export function preserveChatSessionHistoryBrowsePosition(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics,
  nowMs = Date.now(),
): ChatSessionScrollState {
  return {
    ...state,
    isPinnedToBottom: false,
    autoScrollLockedByUser: true,
    awaitingInitialBottomAnchor: false,
    userBrowseLockUntil: Math.max(state.userBrowseLockUntil, nowMs + 1200),
    lastScrollTop: metrics.scrollTop,
  };
}

export function captureChatSessionPrependAnchor(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics,
): ChatSessionScrollState {
  return {
    ...state,
    prependAnchor: {
      scrollTop: metrics.scrollTop,
      scrollHeight: metrics.scrollHeight,
    },
  };
}

export function captureChatSessionAppendAnchor(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics,
): ChatSessionScrollState {
  return {
    ...state,
    appendAnchor: {
      scrollTop: metrics.scrollTop,
      scrollHeight: metrics.scrollHeight,
    },
  };
}

export function resolveChatSessionTimelineMutation(
  state: ChatSessionScrollState,
  params: {
    hasSignature: boolean;
    hadPreviousSignature: boolean;
    loadingBefore: boolean;
    loadingAfter: boolean;
    metrics: ChatSessionScrollMetrics;
    nowMs?: number;
  },
): {
  state: ChatSessionScrollState;
  resolution: ChatSessionScrollResolution;
} {
  if (!params.hasSignature) {
    return {
      state,
      resolution: { kind: 'none' },
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const browseLocked = isUserBrowseLockActive(state, nowMs);

  if (state.prependAnchor && !params.loadingBefore) {
    const delta = params.metrics.scrollHeight - state.prependAnchor.scrollHeight;
    const restoredTop = state.prependAnchor.scrollTop + delta;
    const nextState = preserveChatSessionHistoryBrowsePosition({
      ...state,
      prependAnchor: null,
    }, {
      ...params.metrics,
      scrollTop: restoredTop,
    }, nowMs);
    return {
      state: nextState,
      resolution: {
        kind: 'restore-prepend',
        top: restoredTop,
      },
    };
  }

  if (state.appendAnchor && !params.loadingAfter) {
    const delta = params.metrics.scrollHeight - state.appendAnchor.scrollHeight;
    const nextState = syncChatSessionPinnedState({
      ...state,
      appendAnchor: null,
    }, {
      ...params.metrics,
      scrollTop: state.appendAnchor.scrollTop + delta,
    }, nowMs);
    return {
      state: nextState,
      resolution: {
        kind: 'restore-append',
        top: state.appendAnchor.scrollTop + delta,
      },
    };
  }

  if (state.awaitingInitialBottomAnchor || !params.hadPreviousSignature) {
    return {
      state: {
        ...state,
        awaitingInitialBottomAnchor: false,
        isPinnedToBottom: true,
        autoScrollLockedByUser: false,
        pendingUnreadCount: 0,
        userBrowseLockUntil: 0,
        lastScrollTop: params.metrics.scrollTop,
      },
      resolution: { kind: 'scroll-bottom' },
    };
  }

  if (!browseLocked && (!state.autoScrollLockedByUser || state.isPinnedToBottom)) {
    return {
      state: {
        ...state,
        isPinnedToBottom: true,
        autoScrollLockedByUser: false,
        pendingUnreadCount: 0,
        lastScrollTop: params.metrics.scrollTop,
      },
      resolution: { kind: 'scroll-bottom' },
    };
  }

  return {
    state: {
      ...state,
      pendingUnreadCount: state.pendingUnreadCount + 1,
      lastScrollTop: params.metrics.scrollTop,
    },
    resolution: { kind: 'none' },
  };
}

export function resolveChatSessionJumpToBottom(
  state: ChatSessionScrollState,
): {
  state: ChatSessionScrollState;
  resolution: ChatSessionScrollResolution;
} {
  return {
    state: {
      ...state,
      awaitingInitialBottomAnchor: false,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
      pendingUnreadCount: 0,
    },
    resolution: { kind: 'scroll-bottom' },
  };
}

export function shouldObserveChatSessionTopSentinel(params: {
  state: ChatSessionScrollState;
  hasMoreBefore: boolean;
  historyLoadingBefore: boolean;
  historyLoadingInitial: boolean;
}): boolean {
  return Boolean(
    params.hasMoreBefore
    && !params.historyLoadingBefore
    && !params.historyLoadingInitial
    && !params.state.awaitingInitialBottomAnchor
    && params.state.autoScrollLockedByUser
  );
}

export function shouldObserveChatSessionBottomSentinel(params: {
  state: ChatSessionScrollState;
  hasMoreAfter: boolean;
  historyLoadingAfter: boolean;
  historyLoadingInitial: boolean;
  nowMs?: number;
}): boolean {
  const nowMs = params.nowMs ?? Date.now();
  return Boolean(
    params.hasMoreAfter
    && !params.historyLoadingAfter
    && !params.historyLoadingInitial
    && !(params.state.autoScrollLockedByUser && isUserBrowseLockActive(params.state, nowMs)),
  );
}
