import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateChatTextBlockHeight } from '../../dist/lib/chat-text-estimate.js';

test('chat text height estimate ignores outer whitespace without copying trimmed text', () => {
  assert.equal(estimateChatTextBlockHeight(' \n\t '), 0);
  assert.equal(estimateChatTextBlockHeight('\n\nalpha\n\n'), 70);
  assert.equal(estimateChatTextBlockHeight('\n alpha\nbeta \n'), 92);
});

test('chat text height estimate accounts for code fences and markdown table rows', () => {
  assert.equal(estimateChatTextBlockHeight('```js\ncode\n```'), 198);
  assert.equal(estimateChatTextBlockHeight('| a | b |\n| - | - |'), 112);
});

test('chat text height estimate caps huge text without needing full line analysis', () => {
  assert.equal(estimateChatTextBlockHeight('x'.repeat(40_000)), 7200);
});
