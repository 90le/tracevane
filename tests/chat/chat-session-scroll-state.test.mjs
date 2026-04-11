import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyChatSessionManualScroll,
  beginChatSessionScrollRestore,
  captureChatSessionPrependAnchor,
  createChatSessionScrollState,
  resolveChatSessionJumpToBottom,
  resolveChatSessionTimelineMutation,
  shouldObserveChatSessionTopSentinel,
} from '../../dist/apps/web-vue/src/features/chat-v2/chat-session-scroll-state.js';

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
  }), true);
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
