import test from 'node:test';
import assert from 'node:assert/strict';

import {
  upsertAgentProgressAssistant,
  upsertAgentProgressTool,
} from '../../dist/lib/agent-progress-timeline.js';

test('agent progress timeline appends assistant segments after tool events to preserve stream order', () => {
  let timeline = [];
  timeline = upsertAgentProgressAssistant(timeline, 'Starting analysis');
  timeline = upsertAgentProgressTool(timeline, {
    toolCallId: 'tool-1',
    name: 'exec',
    status: 'running',
  });
  timeline = upsertAgentProgressAssistant(timeline, 'Final answer text');

  assert.deepEqual(timeline.map((item) => item.kind), ['assistant', 'tool', 'assistant']);
  assert.deepEqual(timeline.filter((item) => item.kind === 'assistant').map((item) => item.id), [
    'assistant-live-1',
    'assistant-live-2',
  ]);
  assert.equal(timeline[0].kind === 'assistant' ? timeline[0].text : '', 'Starting analysis');
  assert.equal(timeline[2].kind === 'assistant' ? timeline[2].text : '', 'Final answer text');
});

test('agent progress timeline updates the active assistant segment while adjacent chunks stream', () => {
  let timeline = [];
  timeline = upsertAgentProgressAssistant(timeline, 'Hello');
  timeline = upsertAgentProgressAssistant(timeline, 'Hello world');

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].kind, 'assistant');
  assert.equal(timeline[0].id, 'assistant-live-1');
  assert.equal(timeline[0].text, 'Hello world');
});
