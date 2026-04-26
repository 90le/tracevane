import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendTimelineItem,
  compactObservabilityState,
  createEmptyObservabilityState,
  deriveObservabilityFromHistory,
  upsertToolCard,
} from '../../dist/apps/api/modules/chat/observability.js';

test('history observability derives tool cards and usage from transcript messages', () => {
  const observability = deriveObservabilityFromHistory([
    {
      role: 'assistant',
      timestamp: '2026-03-19T03:00:00.000Z',
      content: [
        {
          type: 'toolCall',
          id: 'tool-call-1',
          name: 'session_status',
          arguments: {},
        },
      ],
      usage: {
        input: 100,
        output: 20,
        totalTokens: 120,
        cacheRead: 30,
        cacheWrite: 0,
        cost: { total: 0 },
      },
    },
    {
      role: 'toolResult',
      toolCallId: 'tool-call-1',
      toolName: 'session_status',
      timestamp: '2026-03-19T03:00:01.000Z',
      details: {
        status: 'ok',
        result: 'fine',
      },
    },
  ]);

  assert.equal(observability.toolCards.length, 1);
  assert.equal(observability.toolCards[0].name, 'session_status');
  assert.equal(observability.toolCards[0].status, 'completed');
  assert.equal(observability.usage?.totalTokens, 120);
  assert.ok(observability.timeline.some((item) => item.kind === 'tool_call'));
  assert.ok(observability.timeline.some((item) => item.kind === 'tool_result'));
  assert.ok(observability.timeline.some((item) => item.kind === 'usage'));
});

test('timeline stays sorted, deduped, and capped', () => {
  let state = createEmptyObservabilityState();

  state = appendTimelineItem(state, {
    id: 'b',
    kind: 'assistant',
    runId: 'run-1',
    toolCallId: null,
    emittedAt: '2026-03-19T03:00:02.000Z',
    title: 'second',
    detail: null,
    level: 'info',
  }, 'b');

  state = appendTimelineItem(state, {
    id: 'a',
    kind: 'assistant',
    runId: 'run-1',
    toolCallId: null,
    emittedAt: '2026-03-19T03:00:01.000Z',
    title: 'first',
    detail: null,
    level: 'info',
  }, 'a');

  state = appendTimelineItem(state, {
    id: 'b',
    kind: 'assistant',
    runId: 'run-1',
    toolCallId: null,
    emittedAt: '2026-03-19T03:00:02.000Z',
    title: 'second-updated',
    detail: 'changed',
    level: 'success',
  }, 'b');

  assert.deepEqual(state.timeline.map((item) => item.id), ['a', 'b']);
  assert.equal(state.timeline[1].title, 'second-updated');

  for (let index = 0; index < 50; index += 1) {
    state = appendTimelineItem(state, {
      id: `tail-${index}`,
      kind: 'assistant',
      runId: null,
      toolCallId: null,
      emittedAt: `2026-03-19T03:00:${String(index).padStart(2, '0')}.000Z`,
      title: `item-${index}`,
      detail: null,
      level: 'info',
    }, `tail-${index}`);
  }

  assert.equal(state.timeline.length, 40);
});

test('tool cards stay capped and latest state wins', () => {
  let state = createEmptyObservabilityState();

  state = upsertToolCard(state, {
    toolCallId: 'tool-1',
    runId: 'run-1',
    name: 'exec',
    status: 'running',
    startedAt: '2026-03-19T03:00:00.000Z',
    updatedAt: '2026-03-19T03:00:00.000Z',
    argsPreview: '{}',
    resultPreview: null,
    isError: false,
  });

  state = upsertToolCard(state, {
    toolCallId: 'tool-1',
    runId: 'run-1',
    name: 'exec',
    status: 'completed',
    startedAt: '2026-03-19T03:00:00.000Z',
    updatedAt: '2026-03-19T03:00:01.000Z',
    argsPreview: '{}',
    resultPreview: 'ok',
    isError: false,
  });

  assert.equal(state.toolCards.length, 1);
  assert.equal(state.toolCards[0].status, 'completed');
  assert.equal(state.toolCards[0].resultPreview, 'ok');
});

test('tool cards keep terminal status over late running updates', () => {
  let state = createEmptyObservabilityState();

  state = upsertToolCard(state, {
    toolCallId: 'tool-terminal',
    runId: 'run-terminal',
    name: 'read',
    status: 'completed',
    startedAt: '2026-03-19T03:00:00.000Z',
    updatedAt: '2026-03-19T03:00:01.000Z',
    argsPreview: '{"file":"README.md"}',
    resultPreview: 'final contents',
    isError: false,
  });

  state = upsertToolCard(state, {
    toolCallId: 'tool-terminal',
    runId: 'run-terminal',
    name: 'read',
    status: 'running',
    startedAt: '2026-03-19T03:00:00.000Z',
    updatedAt: '2026-03-19T03:00:02.000Z',
    argsPreview: '{"file":"README.md"}',
    resultPreview: 'late partial',
    isError: false,
  });

  assert.equal(state.toolCards.length, 1);
  assert.equal(state.toolCards[0].status, 'completed');
  assert.equal(state.toolCards[0].resultPreview, 'final contents');
  assert.equal(state.toolCards[0].isError, false);
});

test('history observability maps tool role results without explicit toolCallId back onto the pending tool call', () => {
  const observability = deriveObservabilityFromHistory([
    {
      role: 'assistant',
      timestamp: '2026-03-24T12:55:55.441Z',
      content: [
        {
          type: 'toolCall',
          id: 'tool-call-queue-1',
          name: 'exec',
          arguments: { command: 'date && whoami' },
        },
      ],
    },
    {
      role: 'tool',
      timestamp: '2026-03-24T12:55:55.488Z',
      text: '2026-03-24\\nbinbin',
      toolName: 'exec',
    },
  ]);

  assert.equal(observability.toolCards.length, 1);
  assert.equal(observability.toolCards[0]?.toolCallId, 'tool-call-queue-1');
  assert.equal(observability.toolCards[0]?.status, 'completed');
  assert.match(observability.toolCards[0]?.argsPreview || '', /date/);
  assert.match(observability.toolCards[0]?.resultPreview || '', /binbin/);
});

test('history observability can keep the full tool card set when the caller disables truncation', () => {
  const transcript = [];
  for (let index = 0; index < 14; index += 1) {
    transcript.push({
      role: 'assistant',
      timestamp: `2026-03-24T13:08:${String(index).padStart(2, '0')}.000Z`,
      content: [
        {
          type: 'toolCall',
          id: `tool-call-${index}`,
          name: 'exec',
          arguments: { command: `echo ${index}` },
        },
      ],
    });
    transcript.push({
      role: 'tool',
      timestamp: `2026-03-24T13:08:${String(index).padStart(2, '0')}.500Z`,
      text: `result-${index}`,
      toolName: 'exec',
    });
  }

  const observability = deriveObservabilityFromHistory(transcript, {
    toolCardLimit: Number.POSITIVE_INFINITY,
  });

  assert.equal(observability.toolCards.length, 14);
  assert.equal(observability.toolCards[0]?.toolCallId, 'tool-call-13');
  assert.equal(observability.toolCards.at(-1)?.toolCallId, 'tool-call-0');
});

test('compactObservabilityState trims timeline length and clips verbose tool/timeline details', () => {
  const longDetail = 'x'.repeat(500);
  const state = {
    lifecycle: null,
    usage: {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
    },
    toolCards: Array.from({ length: 4 }, (_, index) => ({
      toolCallId: `tool-${index}`,
      runId: null,
      name: `tool-${index}`,
      status: 'completed',
      startedAt: `2026-03-24T13:08:0${index}.000Z`,
      updatedAt: `2026-03-24T13:08:0${index}.500Z`,
      argsPreview: longDetail,
      resultPreview: longDetail,
      isError: false,
    })),
    timeline: Array.from({ length: 20 }, (_, index) => ({
      id: `timeline-${index}`,
      kind: 'tool_result',
      runId: null,
      toolCallId: `tool-${index % 4}`,
      emittedAt: `2026-03-24T13:08:${String(index).padStart(2, '0')}.000Z`,
      title: `timeline-${index}`,
      detail: longDetail,
      level: 'info',
    })),
  };

  const compacted = compactObservabilityState(state, {
    timelineLimit: 12,
    toolDetailLimit: 180,
    timelineDetailLimit: 220,
  });

  assert.equal(compacted.toolCards.length, 4);
  assert.equal(compacted.timeline.length, 12);
  assert.ok((compacted.toolCards[0]?.argsPreview || '').length <= 180);
  assert.ok((compacted.toolCards[0]?.resultPreview || '').length <= 180);
  assert.ok((compacted.timeline[0]?.detail || '').length <= 220);
  assert.equal(compacted.timeline[0]?.id, 'timeline-8');
  assert.equal(compacted.timeline.at(-1)?.id, 'timeline-19');
});
