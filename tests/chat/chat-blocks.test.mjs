import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeChatMessageBlocks } from '../../dist/lib/chat-blocks.js';

test('normalizeChatMessageBlocks preserves explicit text/resource order', () => {
  const blocks = normalizeChatMessageBlocks({
    text: 'ignored fallback',
    blocks: [
      { type: 'text', text: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
      { type: 'text', text: '第二段' },
      { type: 'resource', resourceId: 'file-2' },
    ],
    resources: [
      { id: 'file-1' },
      { id: 'file-2' },
    ],
  });

  assert.deepEqual(blocks, [
    { type: 'text', text: '第一段' },
    { type: 'resource', resourceId: 'file-1' },
    { type: 'text', text: '第二段' },
    { type: 'resource', resourceId: 'file-2' },
  ]);
});
