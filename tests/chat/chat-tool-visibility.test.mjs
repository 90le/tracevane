import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterMainChatToolItems,
  groupVisibleToolCardsByRun,
} from '../../dist/lib/chat-tool-visibility.js';

test('main chat visibility filter removes studio_delivery tool previews', () => {
  const grouped = groupVisibleToolCardsByRun([
    {
      toolCallId: 'tool-1',
      runId: 'run-1',
      name: 'studio_delivery',
      status: 'completed',
      startedAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:01.000Z',
      argsPreview: '{}',
      resultPreview: '{}',
      isError: false,
    },
    {
      toolCallId: 'tool-2',
      runId: 'run-1',
      name: 'browser',
      status: 'completed',
      startedAt: '2026-03-21T00:00:02.000Z',
      updatedAt: '2026-03-21T00:00:03.000Z',
      argsPreview: '{"url":"https://example.com"}',
      resultPreview: '{"ok":true}',
      isError: false,
    },
  ]);

  assert.deepEqual(Object.keys(grouped), ['run-1']);
  assert.equal(grouped['run-1']?.length, 1);
  assert.equal(grouped['run-1']?.[0]?.name, 'browser');
});

test('tool hint visibility filter removes studio_delivery helper hints', () => {
  const visible = filterMainChatToolItems([
    { id: 'tool-1', name: 'studio_delivery', status: 'completed', summary: null, argsPreview: null, resultPreview: null },
    { id: 'tool-2', name: 'image', status: 'running', summary: 'drawing', argsPreview: '{}', resultPreview: null },
  ]);

  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.name, 'image');
});
