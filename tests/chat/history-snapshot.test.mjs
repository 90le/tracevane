import test from 'node:test';
import assert from 'node:assert/strict';

import { supplementHistoryWithRunState } from '../../dist/apps/api/modules/chat/history-snapshot.js';

function createToolCall(toolCallId, overrides = {}) {
  return {
    toolCallId,
    runId: null,
    name: 'exec',
    status: 'completed',
    startedAt: '2026-03-24T13:08:30.079Z',
    updatedAt: '2026-03-24T13:08:32.430Z',
    argsPreview: '{"command":"echo ok"}',
    resultPreview: 'ok',
    isError: false,
    ...overrides,
  };
}

function mergeHistoryAssistantMessage(current, supplement) {
  return {
    ...current,
    runId: current.runId || supplement.runId,
    toolCalls: supplement.toolCalls || current.toolCalls,
  };
}

test('history snapshot does not reattach run-wide tool calls onto the final assistant when canonical tool steps already exist', () => {
  const messages = [
    {
      id: 'assistant-step-1',
      role: 'assistant',
      text: '',
      createdAt: '2026-03-24T13:08:30.079Z',
      source: 'history',
      runId: null,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: 'toolUse',
      toolCalls: [createToolCall('tool-1', { resultPreview: null })],
      processBlocks: [{ id: 'thinking-1', kind: 'thinking', text: 'step thinking' }],
    },
    {
      id: 'assistant-final',
      role: 'assistant',
      text: 'Final answer',
      createdAt: '2026-03-24T13:09:31.567Z',
      source: 'history',
      runId: null,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: 'stop',
    },
  ];

  const supplemented = supplementHistoryWithRunState({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    messages,
    liveRunIds: new Set(),
    liveSupplements: [
      {
        runId: 'ui-1774357705588',
        finalMessageId: 'assistant-final',
        finalCreatedAt: '2026-03-24T13:09:31.567Z',
        toolCalls: [createToolCall('tool-1')],
      },
    ],
    shadowSupplements: [],
    rehydrateToolCalls(_sessionKey, toolCalls) {
      return toolCalls;
    },
    mergeHistoryAssistantMessage,
  });

  assert.equal(supplemented[0]?.toolCalls?.length, 1);
  assert.equal(supplemented[0]?.toolCalls?.[0]?.toolCallId, 'tool-1');
  assert.equal(supplemented[1]?.runId, 'ui-1774357705588');
  assert.equal(supplemented[1]?.toolCalls, undefined);
});

test('history snapshot enriches canonical tool step running status to completed when supplement has terminal status', () => {
  const messages = [
    {
      id: 'assistant-step-1',
      role: 'assistant',
      text: '',
      createdAt: '2026-03-24T13:08:30.079Z',
      source: 'history',
      runId: null,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: 'toolUse',
      toolCalls: [
        createToolCall('tool-1', { status: 'running', resultPreview: null }),
        createToolCall('tool-2', { status: 'running', resultPreview: null }),
      ],
    },
    {
      id: 'assistant-final',
      role: 'assistant',
      text: 'Done',
      createdAt: '2026-03-24T13:09:31.567Z',
      source: 'history',
      runId: null,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: 'stop',
    },
  ];

  const supplemented = supplementHistoryWithRunState({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    messages,
    liveRunIds: new Set(),
    liveSupplements: [
      {
        runId: 'ui-run-1',
        finalMessageId: 'assistant-final',
        finalCreatedAt: '2026-03-24T13:09:31.567Z',
        toolCalls: [
          createToolCall('tool-1', { status: 'completed', resultPreview: 'result-1' }),
          createToolCall('tool-2', { status: 'error', resultPreview: 'error-2', isError: true }),
        ],
      },
    ],
    shadowSupplements: [],
    rehydrateToolCalls(_sessionKey, toolCalls) {
      return toolCalls;
    },
    mergeHistoryAssistantMessage,
  });

  assert.equal(supplemented[0]?.toolCalls?.length, 2);
  assert.equal(supplemented[0]?.toolCalls?.[0]?.toolCallId, 'tool-1');
  assert.equal(supplemented[0]?.toolCalls?.[0]?.status, 'completed', 'tool-1 status should be upgraded from running to completed');
  assert.equal(supplemented[0]?.toolCalls?.[0]?.resultPreview, 'result-1', 'tool-1 resultPreview should be enriched from supplement');
  assert.equal(supplemented[0]?.toolCalls?.[1]?.toolCallId, 'tool-2');
  assert.equal(supplemented[0]?.toolCalls?.[1]?.status, 'error', 'tool-2 status should be upgraded from running to error');
  assert.equal(supplemented[0]?.toolCalls?.[1]?.isError, true, 'tool-2 isError should be set');
  assert.equal(supplemented[1]?.toolCalls, undefined, 'final message should not get duplicate toolCalls');
});

test('history snapshot does not downgrade canonical tool step completed status when supplement has running status', () => {
  const messages = [
    {
      id: 'assistant-step-1',
      role: 'assistant',
      text: '',
      createdAt: '2026-03-24T13:08:30.079Z',
      source: 'history',
      runId: null,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: 'toolUse',
      toolCalls: [
        createToolCall('tool-1', { status: 'completed', resultPreview: 'existing-result' }),
      ],
    },
    {
      id: 'assistant-final',
      role: 'assistant',
      text: 'Done',
      createdAt: '2026-03-24T13:09:31.567Z',
      source: 'history',
      runId: null,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: 'stop',
    },
  ];

  const supplemented = supplementHistoryWithRunState({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    messages,
    liveRunIds: new Set(),
    liveSupplements: [
      {
        runId: 'ui-run-2',
        finalMessageId: 'assistant-final',
        finalCreatedAt: '2026-03-24T13:09:31.567Z',
        toolCalls: [
          createToolCall('tool-1', { status: 'running', resultPreview: null }),
        ],
      },
    ],
    shadowSupplements: [],
    rehydrateToolCalls(_sessionKey, toolCalls) {
      return toolCalls;
    },
    mergeHistoryAssistantMessage,
  });

  assert.equal(supplemented[0]?.toolCalls?.[0]?.status, 'completed', 'should not downgrade completed to running');
  assert.equal(supplemented[0]?.toolCalls?.[0]?.resultPreview, 'existing-result', 'should preserve existing resultPreview');
});
