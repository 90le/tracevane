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

export function createChatSessionScrollState(): ChatSessionScrollState {
  return {
    isPinnedToBottom: true,
    autoScrollLockedByUser: false,
    pendingUnreadCount: 0,
    awaitingInitialBottomAnchor: true,
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
): ChatSessionScrollState {
  const pinned = distanceFromBottom(metrics) <= 80;
  if (pinned) {
    return {
      ...state,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
      pendingUnreadCount: 0,
    };
  }
  return {
    ...state,
    isPinnedToBottom: false,
  };
}

export function applyChatSessionManualScroll(
  state: ChatSessionScrollState,
  metrics: ChatSessionScrollMetrics,
): ChatSessionScrollState {
  const bottomDistance = distanceFromBottom(metrics);
  if (bottomDistance <= 80) {
    return {
      ...state,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
      pendingUnreadCount: 0,
    };
  }
  return {
    ...state,
    isPinnedToBottom: false,
    autoScrollLockedByUser: true,
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

  if (state.prependAnchor && !params.loadingBefore) {
    const delta = params.metrics.scrollHeight - state.prependAnchor.scrollHeight;
    const nextState = syncChatSessionPinnedState({
      ...state,
      prependAnchor: null,
    }, {
      ...params.metrics,
      scrollTop: state.prependAnchor.scrollTop + delta,
    });
    return {
      state: nextState,
      resolution: {
        kind: 'restore-prepend',
        top: state.prependAnchor.scrollTop + delta,
      },
    };
  }

  if (state.appendAnchor && !params.loadingAfter) {
    // When content is appended below, keep the viewport at the same scrollTop
    const nextState = syncChatSessionPinnedState({
      ...state,
      appendAnchor: null,
    }, {
      ...params.metrics,
      scrollTop: state.appendAnchor.scrollTop,
    });
    return {
      state: nextState,
      resolution: {
        kind: 'restore-append',
        top: state.appendAnchor.scrollTop,
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
      },
      resolution: { kind: 'scroll-bottom' },
    };
  }

  if (!state.autoScrollLockedByUser || state.isPinnedToBottom) {
    return {
      state: {
        ...state,
        isPinnedToBottom: true,
        autoScrollLockedByUser: false,
        pendingUnreadCount: 0,
      },
      resolution: { kind: 'scroll-bottom' },
    };
  }

  return {
    state: {
      ...state,
      pendingUnreadCount: state.pendingUnreadCount + 1,
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
    && !params.state.awaitingInitialBottomAnchor,
  );
}

export function shouldObserveChatSessionBottomSentinel(params: {
  hasMoreAfter: boolean;
  historyLoadingAfter: boolean;
  historyLoadingInitial: boolean;
}): boolean {
  return Boolean(
    params.hasMoreAfter
    && !params.historyLoadingAfter
    && !params.historyLoadingInitial,
  );
}
