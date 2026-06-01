import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyChatSessionManualScroll,
  beginChatSessionScrollRestore,
  captureChatSessionAppendAnchor,
  captureChatSessionPrependAnchor,
  createChatSessionScrollState,
  markChatSessionUserBrowseIntent,
  preserveChatSessionHistoryBrowsePosition,
  resolveStableHistoryBrowseBottomDistance,
  resolveChatSessionJumpToBottom,
  resolveChatSessionTimelineMutation,
  shouldObserveChatSessionBottomSentinel,
  shouldObserveChatSessionTopSentinel,
} from '../../dist/apps/web-vue/src/features/chat/chat-session-scroll-state.js';

function metrics(overrides = {}) {
  return {
    scrollTop: 900,
    scrollHeight: 1000,
    clientHeight: 100,
    ...overrides,
  };
}

test('initial restore scrolls to bottom once and keeps top sentinel disabled until that anchor is established', () => {
  let state = beginChatSessionScrollRestore(createChatSessionScrollState());

  assert.equal(shouldObserveChatSessionTopSentinel({
    state,
    hasMoreBefore: true,
    historyLoadingBefore: false,
    historyLoadingInitial: false,
  }), false);

  const resolved = resolveChatSessionTimelineMutation(state, {
    hasSignature: true,
    hadPreviousSignature: false,
    loadingBefore: false,
    metrics: metrics(),
  });
  state = resolved.state;

  assert.equal(resolved.resolution.kind, 'scroll-bottom');
  assert.equal(state.awaitingInitialBottomAnchor, false);
  assert.equal(shouldObserveChatSessionTopSentinel({
    state,
    hasMoreBefore: true,
    historyLoadingBefore: false,
    historyLoadingInitial: false,
  }), false);
});

test('prepend older page restores scroll anchor instead of jumping to bottom', () => {
  let state = createChatSessionScrollState();
  state = {
    ...state,
    awaitingInitialBottomAnchor: false,
  };
  state = captureChatSessionPrependAnchor(state, metrics({
    scrollTop: 120,
    scrollHeight: 800,
    clientHeight: 300,
  }));

  const resolved = resolveChatSessionTimelineMutation(state, {
    hasSignature: true,
    hadPreviousSignature: true,
    loadingBefore: false,
    metrics: metrics({
      scrollTop: 120,
      scrollHeight: 1100,
      clientHeight: 300,
    }),
  });

  assert.equal(resolved.resolution.kind, 'restore-prepend');
  assert.equal(resolved.resolution.top, 420);
  assert.equal(resolved.state.prependAnchor, null);
});

test('prepend restore remains browse-locked even when restored metrics are near latest bottom', () => {
  let state = createChatSessionScrollState();
  state = {
    ...state,
    awaitingInitialBottomAnchor: false,
    isPinnedToBottom: false,
    autoScrollLockedByUser: true,
    userBrowseLockUntil: 0,
  };
  state = captureChatSessionPrependAnchor(state, metrics({
    scrollTop: 650,
    scrollHeight: 1000,
    clientHeight: 300,
  }));

  const resolved = resolveChatSessionTimelineMutation(state, {
    hasSignature: true,
    hadPreviousSignature: true,
    loadingBefore: false,
    metrics: metrics({
      scrollTop: 650,
      scrollHeight: 1100,
      clientHeight: 300,
    }),
    nowMs: 5000,
  });

  assert.equal(resolved.resolution.kind, 'restore-prepend');
  assert.equal(resolved.resolution.top, 750);
  assert.equal(resolved.state.isPinnedToBottom, false);
  assert.equal(resolved.state.autoScrollLockedByUser, true);
  assert.equal(resolved.state.userBrowseLockUntil >= 6200, true);
});

test('stable history restore preserves browsing state instead of re-pinning near bottom', () => {
  const state = preserveChatSessionHistoryBrowsePosition(
    {
      ...createChatSessionScrollState(),
      awaitingInitialBottomAnchor: false,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
    },
    metrics({
      scrollTop: 720,
      scrollHeight: 1100,
      clientHeight: 300,
    }),
    7000,
  );

  assert.equal(state.isPinnedToBottom, false);
  assert.equal(state.autoScrollLockedByUser, true);
  assert.equal(state.awaitingInitialBottomAnchor, false);
  assert.equal(state.userBrowseLockUntil >= 8200, true);
});

test('append newer page preserves current viewport so the reader can continue downward naturally', () => {
  let state = createChatSessionScrollState();
  state = {
    ...state,
    awaitingInitialBottomAnchor: false,
  };
  state = captureChatSessionAppendAnchor(state, metrics({
    scrollTop: 500,
    scrollHeight: 900,
    clientHeight: 300,
  }));

  const resolved = resolveChatSessionTimelineMutation(state, {
    hasSignature: true,
    hadPreviousSignature: true,
    loadingAfter: false,
    loadingBefore: false,
    metrics: metrics({
      scrollTop: 500,
      scrollHeight: 1180,
      clientHeight: 300,
    }),
  });

  assert.equal(resolved.resolution.kind, 'restore-append');
  assert.equal(resolved.resolution.top, 500);
  assert.equal(resolved.state.appendAnchor, null);
  assert.equal(resolved.state.isPinnedToBottom, false);
  assert.equal(resolved.state.autoScrollLockedByUser, true);
});

test('manual upward scroll stops auto-follow until jump-to-bottom is requested', () => {
  let state = createChatSessionScrollState();
  state = {
    ...state,
    awaitingInitialBottomAnchor: false,
  };
  state = applyChatSessionManualScroll(state, metrics({
    scrollTop: 100,
    scrollHeight: 1400,
    clientHeight: 300,
  }));

  const duringUnread = resolveChatSessionTimelineMutation(state, {
    hasSignature: true,
    hadPreviousSignature: true,
    loadingBefore: false,
    metrics: metrics({
      scrollTop: 100,
      scrollHeight: 1500,
      clientHeight: 300,
    }),
  });
  state = duringUnread.state;

  assert.equal(duringUnread.resolution.kind, 'none');
  assert.equal(state.autoScrollLockedByUser, true);
  assert.equal(state.pendingUnreadCount, 1);

  const jumped = resolveChatSessionJumpToBottom(state);
  assert.equal(jumped.resolution.kind, 'scroll-bottom');
  assert.equal(jumped.state.pendingUnreadCount, 0);
  assert.equal(jumped.state.autoScrollLockedByUser, false);
});

test('explicit upward browse intent at the bottom suppresses pending bottom restore retries', () => {
  let state = createChatSessionScrollState();
  state = {
    ...state,
    awaitingInitialBottomAnchor: false,
    isPinnedToBottom: true,
    autoScrollLockedByUser: false,
    lastScrollTop: 900,
  };

  state = markChatSessionUserBrowseIntent(state, metrics({
    scrollTop: 900,
    scrollHeight: 1000,
    clientHeight: 100,
  }), 1000);

  const resolved = resolveChatSessionTimelineMutation(state, {
    hasSignature: true,
    hadPreviousSignature: true,
    loadingBefore: false,
    loadingAfter: false,
    metrics: metrics({
      scrollTop: 900,
      scrollHeight: 1100,
      clientHeight: 100,
    }),
    nowMs: 1100,
  });

  assert.equal(resolved.resolution.kind, 'none');
  assert.equal(resolved.state.autoScrollLockedByUser, true);
  assert.equal(resolved.state.isPinnedToBottom, false);
  assert.equal(resolved.state.pendingUnreadCount, 1);
});

test('browse lock expires so an idle latest view can auto-follow again', () => {
  let state = createChatSessionScrollState();
  state = markChatSessionUserBrowseIntent(state, metrics(), 1000);
  state = applyChatSessionManualScroll(state, metrics({
    scrollTop: 980,
    scrollHeight: 1300,
    clientHeight: 300,
  }), 2300);

  assert.equal(state.autoScrollLockedByUser, false);
  assert.equal(state.isPinnedToBottom, true);
  assert.equal(state.userBrowseLockUntil, 0);
});

test('expired browse lock is not cleared by passive layout clipping near bottom', () => {
  let state = createChatSessionScrollState();
  state = {
    ...markChatSessionUserBrowseIntent(state, metrics({
      scrollTop: 100,
      scrollHeight: 1400,
      clientHeight: 300,
    }), 1000),
    userBrowseLockUntil: 0,
    lastScrollTop: 100,
  };

  state = applyChatSessionManualScroll(state, metrics({
    scrollTop: 100,
    scrollHeight: 1000,
    clientHeight: 900,
  }), 4000);

  assert.equal(state.autoScrollLockedByUser, true);
  assert.equal(state.isPinnedToBottom, false);
});

test('top sentinel stays disabled while pinned to latest and only enables after manual upward browsing', () => {
  let state = createChatSessionScrollState();
  state = {
    ...state,
    awaitingInitialBottomAnchor: false,
    isPinnedToBottom: true,
    autoScrollLockedByUser: false,
  };

  assert.equal(shouldObserveChatSessionTopSentinel({
    state,
    hasMoreBefore: true,
    historyLoadingBefore: false,
    historyLoadingInitial: false,
  }), false);

  state = applyChatSessionManualScroll(state, metrics({
    scrollTop: 100,
    scrollHeight: 1400,
    clientHeight: 300,
  }));

  assert.equal(shouldObserveChatSessionTopSentinel({
    state,
    hasMoreBefore: true,
    historyLoadingBefore: false,
    historyLoadingInitial: false,
  }), true);
});

test('bottom sentinel stays disabled during upward browse grace so after pages cannot pull back to latest', () => {
  let state = createChatSessionScrollState();
  state = markChatSessionUserBrowseIntent(state, metrics(), 1000);

  assert.equal(shouldObserveChatSessionBottomSentinel({
    state,
    hasMoreAfter: true,
    historyLoadingAfter: false,
    historyLoadingInitial: false,
    nowMs: 1100,
  }), false);

  assert.equal(shouldObserveChatSessionBottomSentinel({
    state,
    hasMoreAfter: true,
    historyLoadingAfter: false,
    historyLoadingInitial: false,
    nowMs: 2300,
  }), true);
});

test('stable upward history restore does not let late layout changes drift back toward latest', () => {
  assert.equal(resolveStableHistoryBrowseBottomDistance({
    previousBottomDistance: 5000,
    nextBottomDistance: 3600,
    direction: 'up',
  }), 5000);

  assert.equal(resolveStableHistoryBrowseBottomDistance({
    previousBottomDistance: 5000,
    nextBottomDistance: 6400,
    direction: 'up',
  }), 6400);

  assert.equal(resolveStableHistoryBrowseBottomDistance({
    previousBottomDistance: 5000,
    nextBottomDistance: 3600,
    direction: 'down',
  }), 3600);
});
