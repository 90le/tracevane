import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areRuntimeOverlaysEqual,
  buildOverlayToolCallIds,
  buildRunOverlayRecord,
  buildTimelineVersion,
  coalesceAssistantDeliveryMessages,
  deriveRuntimeMessagePreview,
  mergeRuntimeOverlay,
  mergeRuntimeWindowMessages,
} from '../../dist/lib/chat-runtime-state.js';

function createMessage(id, overrides = {}) {
  return {
    id,
    role: 'assistant',
    text: `${id} text`,
    createdAt: '2026-03-24T10:00:00.000Z',
    source: 'history',
    runId: null,
    truncated: false,
    omitted: false,
    aborted: false,
    stopReason: null,
    ...overrides,
  };
}

function createOverlay(overrides = {}) {
  return {
    runId: 'run-1',
    startedAt: '2026-03-24T10:00:00.000Z',
    updatedAt: '2026-03-24T10:00:01.000Z',
    lifecycle: 'running',
    previewText: 'checking',
    toolCalls: [{
      toolCallId: 'tool-1',
      runId: 'run-1',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-24T10:00:00.500Z',
      updatedAt: '2026-03-24T10:00:01.000Z',
      argsPreview: '{"url":"https://example.com"}',
      resultPreview: null,
      isError: false,
    }],
    finalMessageId: null,
    finalCreatedAt: null,
    firstAssistantSeenAt: null,
    firstToolStartedAt: '2026-03-24T10:00:00.500Z',
    sequence: 1,
    ...overrides,
  };
}

test('coalesceAssistantDeliveryMessages keeps only structured assistant delivery for the same run', () => {
  const messages = [
    createMessage('assistant-plain', { runId: 'run-1', text: 'plain fallback' }),
    createMessage('assistant-structured', {
      runId: 'run-1',
      text: 'structured',
      blocks: [{ type: 'paragraph', text: 'structured' }],
    }),
  ];

  const coalesced = coalesceAssistantDeliveryMessages(messages);

  assert.deepEqual(coalesced.map((message) => message.id), ['assistant-structured']);
});

test('mergeRuntimeWindowMessages preserves identity when a prepend page adds no unique messages', () => {
  const current = [createMessage('a'), createMessage('b')];
  const merged = mergeRuntimeWindowMessages(current, [createMessage('a')], 'prepend');
  assert.equal(merged, current);
});

test('mergeRuntimeOverlay keeps monotonic lifecycle and richer tool result preview', () => {
  const merged = mergeRuntimeOverlay(
    createOverlay(),
    createOverlay({
      lifecycle: 'completed',
      updatedAt: '2026-03-24T10:00:02.000Z',
      toolCalls: [{
        toolCallId: 'tool-1',
        runId: 'run-1',
        name: 'browser',
        status: 'completed',
        startedAt: '2026-03-24T10:00:00.500Z',
        updatedAt: '2026-03-24T10:00:02.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"summary":"done"}',
        isError: false,
      }],
      sequence: 2,
    }),
  );

  assert.equal(merged.lifecycle, 'completed');
  assert.equal(merged.toolCalls[0]?.status, 'completed');
  assert.match(merged.toolCalls[0]?.resultPreview || '', /done/i);
  assert.equal(merged.sequence, 2);
});

test('mergeRuntimeOverlay keeps terminal tool result preview over late running partials', () => {
  const completed = createOverlay({
    lifecycle: 'completed',
    updatedAt: '2026-03-24T10:00:02.000Z',
    toolCalls: [{
      toolCallId: 'tool-1',
      runId: 'run-1',
      name: 'browser',
      status: 'completed',
      startedAt: '2026-03-24T10:00:00.500Z',
      updatedAt: '2026-03-24T10:00:02.000Z',
      argsPreview: '{"url":"https://example.com"}',
      resultPreview: '{"summary":"final page snapshot"}',
      isError: false,
    }],
    sequence: 2,
  });
  const staleRunning = createOverlay({
    lifecycle: 'running',
    updatedAt: '2026-03-24T10:00:03.000Z',
    toolCalls: [{
      toolCallId: 'tool-1',
      runId: 'run-1',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-24T10:00:00.500Z',
      updatedAt: '2026-03-24T10:00:03.000Z',
      argsPreview: null,
      resultPreview: '{"summary":"50%"}',
      isError: false,
    }],
    sequence: 3,
  });

  const merged = mergeRuntimeOverlay(completed, staleRunning);

  assert.equal(merged.lifecycle, 'completed');
  assert.equal(merged.toolCalls[0]?.status, 'completed');
  assert.match(merged.toolCalls[0]?.resultPreview || '', /final page snapshot/i);
});

test('mergeRuntimeOverlay keeps failed tool result preview over late running partials', () => {
  const failed = createOverlay({
    lifecycle: 'error',
    updatedAt: '2026-03-24T10:00:02.000Z',
    toolCalls: [{
      toolCallId: 'tool-1',
      runId: 'run-1',
      name: 'shell',
      status: 'error',
      startedAt: '2026-03-24T10:00:00.500Z',
      updatedAt: '2026-03-24T10:00:02.000Z',
      argsPreview: '{"cmd":"false"}',
      resultPreview: '{"error":"exit 1"}',
      isError: true,
    }],
    sequence: 2,
  });
  const staleRunning = createOverlay({
    lifecycle: 'running',
    updatedAt: '2026-03-24T10:00:03.000Z',
    toolCalls: [{
      toolCallId: 'tool-1',
      runId: 'run-1',
      name: 'shell',
      status: 'running',
      startedAt: '2026-03-24T10:00:00.500Z',
      updatedAt: '2026-03-24T10:00:03.000Z',
      argsPreview: null,
      resultPreview: '{"summary":"retrying"}',
      isError: false,
    }],
    sequence: 3,
  });

  const merged = mergeRuntimeOverlay(failed, staleRunning);

  assert.equal(merged.lifecycle, 'error');
  assert.equal(merged.toolCalls[0]?.status, 'error');
  assert.match(merged.toolCalls[0]?.resultPreview || '', /exit 1/i);
  assert.equal(merged.toolCalls[0]?.isError, true);
});

test('mergeRuntimeWindowMessages preserves transcript arrival order for unrelated equal-timestamp messages', () => {
  const merged = mergeRuntimeWindowMessages([], [
    createMessage('user-1', {
      role: 'user',
      createdAt: null,
      runId: null,
      text: 'first user',
    }),
    createMessage('assistant-1', {
      role: 'assistant',
      createdAt: null,
      runId: null,
      text: 'first assistant',
    }),
    createMessage('user-2', {
      role: 'user',
      createdAt: null,
      runId: null,
      text: 'second user',
    }),
  ], 'replace');

  assert.deepEqual(merged.map((message) => message.id), ['user-1', 'assistant-1', 'user-2']);
});

test('areRuntimeOverlaysEqual and buildRunOverlayRecord only change when overlay content changes', () => {
  const left = buildRunOverlayRecord([createOverlay()]);
  const right = buildRunOverlayRecord([createOverlay()]);

  assert.equal(areRuntimeOverlaysEqual(left['run-1'], right['run-1']), true);

  right['run-1'] = createOverlay({ updatedAt: '2026-03-24T10:00:03.000Z', sequence: 3 });
  assert.equal(areRuntimeOverlaysEqual(left['run-1'], right['run-1']), false);
});

test('deriveRuntimeMessagePreview, overlay tool ids, and timeline version stay deterministic', () => {
  const sanitizedUserPreview = deriveRuntimeMessagePreview(createMessage('user', {
    role: 'user',
    text: [
      'Sender (untrusted metadata):',
      '```json',
      '{"label":"cli"}',
      '```',
      '',
      '[Fri 2026-03-27 15:30 GMT+8] Visible payload',
    ].join('\n'),
  }));
  assert.equal(sanitizedUserPreview, 'Visible payload');

  const preview = deriveRuntimeMessagePreview(createMessage('assistant', {
    text: '',
    resources: [{ id: 'res-1', kind: 'file', fileName: 'report.txt', mimeType: 'text/plain', source: 'upload' }],
  }));
  assert.equal(preview, 'report.txt');

  const overlayIds = buildOverlayToolCallIds([createOverlay()]);
  assert.deepEqual(overlayIds, ['tool-1']);

  const version = buildTimelineVersion([
    { type: 'message_group', id: 'message-group-1', group: { id: 'message-group-1', role: 'assistant', runId: null, messages: [createMessage('assistant-1')] } },
    { type: 'run_overlay', id: 'run-overlay:run-1', overlay: createOverlay(), anchorMessageIds: [] },
  ]);
  assert.equal(version, 'message-group-1|run-1:2026-03-24T10:00:01.000Z:1:0');
});
