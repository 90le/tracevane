import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldShowInitialConversationLoading } from '../../dist/lib/chat-conversation-pane-state.js';

test('initial conversation loading stays visible when a session is selected but no timeline items exist yet', () => {
  assert.equal(shouldShowInitialConversationLoading({
    selectedSession: true,
    historyLoadingInitial: true,
    timelineItemCount: 0,
  }), true);
});

test('initial conversation loading yields to optimistic timeline items', () => {
  assert.equal(shouldShowInitialConversationLoading({
    selectedSession: true,
    historyLoadingInitial: true,
    timelineItemCount: 1,
  }), false);
});

test('initial conversation loading stays hidden without a selected session', () => {
  assert.equal(shouldShowInitialConversationLoading({
    selectedSession: false,
    historyLoadingInitial: true,
    timelineItemCount: 0,
  }), false);
});
