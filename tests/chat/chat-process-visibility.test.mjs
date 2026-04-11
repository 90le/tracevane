import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyChatProcessVisibility,
  CHAT_PROCESS_VISIBILITY_DEFAULTS,
  cloneChatProcessBlocks,
} from '../../dist/lib/chat-process-visibility.js';

test('cloneChatProcessBlocks drops empty entries and normalizes ids', () => {
  const cloned = cloneChatProcessBlocks([
    { id: ' think-1 ', kind: 'thinking', text: ' first ' },
    { id: '', kind: 'reasoning', text: 'second' },
    { id: 'empty', kind: 'thinking', text: '   ' },
  ]);

  assert.deepEqual(cloned, [
    { id: 'think-1', kind: 'thinking', text: 'first' },
    { id: 'reasoning-2', kind: 'reasoning', text: 'second' },
  ]);
});

test('applyChatProcessVisibility keeps tool and thinking toggles independent', () => {
  const hiddenThinking = applyChatProcessVisibility({
    toolHints: [{ id: 'tool-1' }],
    processBlocks: [{ id: 'thinking-1', kind: 'thinking', text: 'draft' }],
    visibility: CHAT_PROCESS_VISIBILITY_DEFAULTS,
  });
  assert.equal(hiddenThinking.toolHints.length, 1);
  assert.equal(hiddenThinking.processBlocks.length, 0);

  const hiddenTools = applyChatProcessVisibility({
    toolHints: [{ id: 'tool-1' }],
    processBlocks: [{ id: 'thinking-1', kind: 'thinking', text: 'draft' }],
    visibility: {
      showToolPreviews: false,
      showThinkingBlocks: true,
    },
  });
  assert.equal(hiddenTools.toolHints.length, 0);
  assert.deepEqual(hiddenTools.processBlocks, [
    { id: 'thinking-1', kind: 'thinking', text: 'draft' },
  ]);
});
