import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyChatSessionCanonicalMessageEvent,
  applyChatSessionCanonicalSnapshotEvent,
  applyChatSessionAgentAssistantEvent,
  applyChatSessionDeltaEvent,
  applyChatSessionFinalEvent,
  applyChatSessionTemporaryAssistantEvent,
  applyChatSessionTemporaryToolEvent,
  applyChatSessionToolEvent,
  applyChatSessionLiveOverlayEvent,
  buildChatOverlaySummary,
  buildChatRuntimeSummary,
  buildChatSessionRuntimeRenderModel,
  CHAT_SESSION_MESSAGE_WINDOW_MAX,
  clearChatSessionTransientRun,
  createEmptyChatSessionRuntimeMachineState,
  injectChatSessionOptimisticMessage,
  prependChatSessionCanonicalMessageLedger,
  appendChatSessionCanonicalMessageLedger,
  anchorChatSessionCanonicalMessageLedger,
  windowChatSessionCanonicalMessageLedger,
  replaceChatSessionCanonicalMessageLedger,
  replaceChatSessionProcessLedger,
  syncChatSessionCanonicalMessageLedger,
  upsertChatSessionProcessLedgerOverlay,
} from '../../dist/apps/web-vue/src/features/chat/chat-session-runtime-machine.js';

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
    lifecycle: 'completed',
    previewText: 'tool preview',
    toolCalls: [
      {
        toolCallId: 'tool-1',
        runId: 'run-1',
        name: 'browser',
        status: 'completed',
        startedAt: '2026-03-24T10:00:00.100Z',
        updatedAt: '2026-03-24T10:00:01.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"summary":"done"}',
        isError: false,
      },
    ],
    finalMessageId: 'assistant-1',
    finalCreatedAt: '2026-03-24T10:00:02.000Z',
    firstAssistantSeenAt: '2026-03-24T10:00:00.500Z',
    firstToolStartedAt: '2026-03-24T10:00:00.100Z',
    sequence: 1,
    ...overrides,
  };
}

test('runtime machine keeps pure-text assistant draft visible and swaps it to final in place', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-1');
  state = applyChatSessionDeltaEvent(state, {
    runId: 'run-1',
    accumulatedText: 'streaming plain text reply',
    emittedAt: '2026-03-24T10:00:00.500Z',
  });

  let render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 1);
  assert.equal(render.messages[0]?.source, 'stream');
  assert.equal(render.messages[0]?.runId, 'run-1');
  assert.match(render.messages[0]?.text || '', /streaming plain text/i);

  state = applyChatSessionFinalEvent(state, createMessage('assistant-final', {
    role: 'assistant',
    runId: 'run-1',
    text: 'streaming plain text reply',
    createdAt: '2026-03-24T10:00:01.000Z',
    source: 'history',
  }));

  render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 1);
  assert.equal(render.messages[0]?.id, 'assistant-final');
  assert.equal(render.messages[0]?.source, 'history');
  assert.equal(state.transientRunState['run-1'], undefined);
});

test('runtime machine preserves local optimistic user rows until canonical history catches up and dedupes them once it does', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-2');
  state = injectChatSessionOptimisticMessage(state, createMessage('ui-user-1', {
    role: 'user',
    runId: 'run-2',
    text: 'hello world',
    createdAt: '2026-03-24T11:00:00.000Z',
    source: 'inject',
  }));

  state = replaceChatSessionCanonicalMessageLedger(state, [], {
    preserveLocalMessages: true,
  });
  let render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 1);
  assert.equal(render.messages[0]?.source, 'inject');
  assert.equal(render.messages[0]?.role, 'user');
  assert.equal(render.messages[0]?.text, 'hello world');

  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('history-user-1', {
      role: 'user',
      runId: 'run-2',
      text: 'hello world',
      createdAt: '2026-03-24T11:00:03.000Z',
      source: 'history',
    }),
  ], {
    preserveLocalMessages: true,
  });
  render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 1);
  assert.equal(render.messages[0]?.id, 'history-user-1');
  assert.equal(render.messages[0]?.source, 'history');
});

test('runtime machine render model preserves equal-timestamp arrival order and shares the same overlay ledger', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-3');
  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('assistant-1', {
      role: 'assistant',
      runId: 'run-3',
      text: 'assistant final',
      createdAt: '2026-03-24T12:00:00.000Z',
    }),
    createMessage('user-1', {
      role: 'user',
      runId: 'run-3',
      text: 'user prompt',
      createdAt: '2026-03-24T12:00:00.000Z',
    }),
  ]);
  state = replaceChatSessionProcessLedger(state, [createOverlay({
    runId: 'run-3',
    finalMessageId: 'assistant-1',
  })]);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => message.id), ['assistant-1', 'user-1']);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.runId, 'run-3');
});

test('runtime machine places tool phase before assistant when tool happens first', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-4');
  state = applyChatSessionToolEvent(state, {
    runId: 'run-4',
    emittedAt: '2026-03-24T13:00:00.100Z',
    tool: createOverlay({
      runId: 'run-4',
      toolCalls: [{
        toolCallId: 'tool-4',
        runId: 'run-4',
        name: 'browser',
        status: 'running',
        startedAt: '2026-03-24T13:00:00.100Z',
        updatedAt: '2026-03-24T13:00:00.100Z',
        argsPreview: '{}',
        resultPreview: null,
        isError: false,
      }],
    }).toolCalls[0],
  });
  state = applyChatSessionAgentAssistantEvent(state, {
    runId: 'run-4',
    emittedAt: '2026-03-24T13:00:01.000Z',
    text: 'done',
    deltaText: 'done',
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.startedAt, '2026-03-24T13:00:00.100Z');
  assert.deepEqual(render.messages.map((message) => `${message.createdAt}:${message.text}`), [
    '2026-03-24T13:00:01.000Z:done',
  ]);
});

test('runtime machine splits assistant -> tool -> assistant into ordered phases', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-5');
  state = applyChatSessionAgentAssistantEvent(state, {
    runId: 'run-5',
    emittedAt: '2026-03-24T14:00:00.000Z',
    text: 'first part',
    deltaText: 'first part',
  });
  state = applyChatSessionToolEvent(state, {
    runId: 'run-5',
    emittedAt: '2026-03-24T14:00:01.000Z',
    tool: createOverlay({
      runId: 'run-5',
      toolCalls: [{
        toolCallId: 'tool-5',
        runId: 'run-5',
        name: 'browser',
        status: 'running',
        startedAt: '2026-03-24T14:00:01.000Z',
        updatedAt: '2026-03-24T14:00:01.000Z',
        argsPreview: '{}',
        resultPreview: null,
        isError: false,
      }],
    }).toolCalls[0],
  });
  state = applyChatSessionAgentAssistantEvent(state, {
    runId: 'run-5',
    emittedAt: '2026-03-24T14:00:02.000Z',
    text: 'first part second part',
    deltaText: ' second part',
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => `${message.createdAt}:${message.text}`), [
    '2026-03-24T14:00:00.000Z:first part',
    '2026-03-24T14:00:02.000Z: second part',
  ]);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.startedAt, '2026-03-24T14:00:01.000Z');
});

test('runtime machine sync removes transient tool phases once canonical history already contains the same tool call', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-6');
  state = applyChatSessionToolEvent(state, {
    runId: 'run-6',
    emittedAt: '2026-03-24T15:00:01.000Z',
    tool: createOverlay({
      runId: 'run-6',
      toolCalls: [{
        toolCallId: 'tool-6',
        runId: 'run-6',
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T15:00:01.000Z',
        updatedAt: '2026-03-24T15:00:01.000Z',
        argsPreview: '{"command":"date"}',
        resultPreview: null,
        isError: false,
      }],
    }).toolCalls[0],
  });

  state = syncChatSessionCanonicalMessageLedger(state, [
    createMessage('assistant-step-6', {
      role: 'assistant',
      text: '',
      runId: null,
      createdAt: '2026-03-24T15:00:01.000Z',
      source: 'history',
      stopReason: 'toolUse',
      toolCalls: [{
        toolCallId: 'tool-6',
        runId: null,
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T15:00:01.000Z',
        updatedAt: '2026-03-24T15:00:01.000Z',
        argsPreview: '{"command":"date"}',
        resultPreview: null,
        isError: false,
      }],
      processBlocks: [{
        id: 'thinking-6',
        kind: 'thinking',
        text: 'checking current date',
      }],
    }),
  ]);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 1);
  assert.equal(render.messages[0]?.id, 'assistant-step-6');
  assert.equal(render.overlays.length, 0);
});

test('runtime machine render model dedupes canonical assistant step against equivalent stream phase', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-7');
  state = applyChatSessionAgentAssistantEvent(state, {
    runId: 'run-7',
    emittedAt: '2026-03-24T16:00:00.000Z',
    text: 'Preparing the checks.',
    deltaText: 'Preparing the checks.',
  });
  state = syncChatSessionCanonicalMessageLedger(state, [
    createMessage('assistant-step-7', {
      role: 'assistant',
      text: 'Preparing the checks.',
      runId: null,
      createdAt: '2026-03-24T16:00:01.000Z',
      source: 'history',
      stopReason: 'toolUse',
      toolCalls: [{
        toolCallId: 'tool-7',
        runId: null,
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T16:00:01.000Z',
        updatedAt: '2026-03-24T16:00:01.000Z',
        argsPreview: '{"command":"date"}',
        resultPreview: null,
        isError: false,
      }],
      processBlocks: [{
        id: 'thinking-7',
        kind: 'thinking',
        text: 'checking current date',
      }],
    }),
  ]);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 1);
  assert.equal(render.messages[0]?.id, 'assistant-step-7');
  assert.equal(render.messages[0]?.source, 'history');
});

test('runtime machine replaces the canonical ledger on snapshot version rollover and drops rewritten predecessors', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-8');
  state = applyChatSessionCanonicalSnapshotEvent(state, {
    version: 'local:1',
    messages: [
      createMessage('assistant-old', {
        role: 'assistant',
        text: 'old assistant',
        createdAt: '2026-03-24T17:00:00.000Z',
      }),
    ],
    overlays: [],
  });
  state = applyChatSessionCanonicalSnapshotEvent(state, {
    version: 'local:2',
    messages: [
      createMessage('assistant-new', {
        role: 'assistant',
        text: 'rewritten assistant',
        createdAt: '2026-03-24T17:00:01.000Z',
      }),
    ],
    overlays: [],
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => message.id), ['assistant-new']);
});

test('runtime machine turns temporary assistant into canonical message without leaving duplicate drafts behind', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-9');
  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-9',
    emittedAt: '2026-03-24T18:00:00.000Z',
    textDelta: 'draft answer',
    accumulatedText: 'draft answer',
  });
  state = applyChatSessionCanonicalMessageEvent(state, {
    version: 'local:1',
    message: createMessage('assistant-9', {
      role: 'assistant',
      runId: 'run-9',
      text: 'draft answer',
      createdAt: '2026-03-24T18:00:01.000Z',
      source: 'history',
    }),
    messageId: 'assistant-9',
    messageSeq: 2,
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => message.id), ['assistant-9']);
  assert.equal(state.transientRunState['run-9'], undefined);
});

test('runtime machine collapses temporary assistant when canonical assistant arrives without runId but same text', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-9a');
  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-9a',
    emittedAt: '2026-03-24T18:10:00.000Z',
    textDelta: 'hello duplicate assistant',
    accumulatedText: 'hello duplicate assistant',
  });
  state = applyChatSessionCanonicalMessageEvent(state, {
    version: 'local:1',
    message: createMessage('assistant-9a', {
      role: 'assistant',
      runId: null,
      text: 'hello duplicate assistant',
      createdAt: '2026-03-24T18:10:25.000Z',
      source: 'history',
    }),
    messageId: 'assistant-9a',
    messageSeq: 2,
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => message.id), ['assistant-9a']);
  assert.equal(state.transientRunState['run-9a'], undefined);
});

test('runtime machine abort cleanup removes temporary assistant and tool phases for the run immediately', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-9b');
  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-9b',
    emittedAt: '2026-03-24T18:30:00.000Z',
    textDelta: 'draft',
    accumulatedText: 'draft',
  });
  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-9b',
    emittedAt: '2026-03-24T18:30:01.000Z',
    partial: false,
    tool: {
      toolCallId: 'tool-9b',
      runId: 'run-9b',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-24T18:30:01.000Z',
      updatedAt: '2026-03-24T18:30:01.000Z',
      argsPreview: '{}',
      resultPreview: null,
      isError: false,
    },
  });

  state = clearChatSessionTransientRun(state, 'run-9b');

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 0);
  assert.equal(render.overlays.length, 0);
  assert.equal(state.transientRunState['run-9b'], undefined);
});

test('runtime machine evicts temporary tool overlays once canonical snapshot already contains the same tool call', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-10');
  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-10',
    emittedAt: '2026-03-24T19:00:00.000Z',
    partial: false,
    tool: {
      toolCallId: 'tool-10',
      runId: 'run-10',
      name: 'browser',
      status: 'completed',
      startedAt: '2026-03-24T19:00:00.000Z',
      updatedAt: '2026-03-24T19:00:01.000Z',
      argsPreview: '{}',
      resultPreview: '{"ok":true}',
      isError: false,
    },
  });
  state = applyChatSessionCanonicalSnapshotEvent(state, {
    version: 'history:1',
    messages: [
      createMessage('assistant-tool-10', {
        role: 'assistant',
        text: '',
        createdAt: '2026-03-24T19:00:01.000Z',
        stopReason: 'toolUse',
        toolCalls: [{
          toolCallId: 'tool-10',
          runId: 'run-10',
          name: 'browser',
          status: 'completed',
          startedAt: '2026-03-24T19:00:00.000Z',
          updatedAt: '2026-03-24T19:00:01.000Z',
          argsPreview: '{}',
          resultPreview: '{"ok":true}',
          isError: false,
        }],
      }),
    ],
    overlays: [],
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 0);
  assert.equal(render.messages[0]?.toolCalls?.[0]?.toolCallId, 'tool-10');
});

test('runtime machine keeps later live assistant phases when canonical snapshot folds only an earlier tool-use step', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-11');
  state = applyChatSessionAgentAssistantEvent(state, {
    runId: 'run-11',
    emittedAt: '2026-03-24T19:30:00.000Z',
    text: 'first part',
    deltaText: 'first part',
  });
  state = applyChatSessionToolEvent(state, {
    runId: 'run-11',
    emittedAt: '2026-03-24T19:30:01.000Z',
    tool: {
      toolCallId: 'tool-11',
      runId: 'run-11',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-24T19:30:01.000Z',
      updatedAt: '2026-03-24T19:30:01.000Z',
      argsPreview: '{}',
      resultPreview: null,
      isError: false,
    },
  });
  state = applyChatSessionAgentAssistantEvent(state, {
    runId: 'run-11',
    emittedAt: '2026-03-24T19:30:02.000Z',
    text: 'first part second part',
    deltaText: ' second part',
  });

  state = applyChatSessionCanonicalSnapshotEvent(state, {
    version: 'history:1',
    messages: [
      createMessage('assistant-step-11', {
        role: 'assistant',
        text: 'first part',
        createdAt: '2026-03-24T19:30:00.500Z',
        source: 'history',
        stopReason: 'toolUse',
        toolCalls: [{
          toolCallId: 'tool-11',
          runId: null,
          name: 'browser',
          status: 'running',
          startedAt: '2026-03-24T19:30:01.000Z',
          updatedAt: '2026-03-24T19:30:01.000Z',
          argsPreview: '{}',
          resultPreview: null,
          isError: false,
        }],
      }),
    ],
    overlays: [createOverlay({
      runId: 'run-11',
      toolCalls: [{
        toolCallId: 'tool-11',
        runId: 'run-11',
        name: 'browser',
        status: 'running',
        startedAt: '2026-03-24T19:30:01.000Z',
        updatedAt: '2026-03-24T19:30:01.000Z',
        argsPreview: '{}',
        resultPreview: null,
        isError: false,
      }],
      finalMessageId: null,
      finalCreatedAt: null,
      firstAssistantSeenAt: null,
    })],
  });

  let render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => `${message.source}:${message.text}`), [
    'history:first part',
    'stream: second part',
  ]);
  assert.equal(render.overlays.length, 0);

  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-11',
    emittedAt: '2026-03-24T19:30:02.100Z',
    accumulatedText: 'first part second part third part',
    textDelta: ' third part',
  });

  render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => `${message.source}:${message.text}`), [
    'history:first part',
    'stream: second part third part',
  ]);

  state = applyChatSessionCanonicalMessageEvent(state, {
    version: 'history:2',
    message: createMessage('assistant-final-11', {
      role: 'assistant',
      text: 'first part second part third part',
      createdAt: '2026-03-24T19:30:02.500Z',
      source: 'history',
    }),
    messageId: 'assistant-final-11',
    messageSeq: 2,
  });

  render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => `${message.source}:${message.text}`), [
    'history:first part',
    'history:first part second part third part',
  ]);
  assert.equal(render.messages.filter((message) => message.source === 'stream').length, 0);
});

test('runtime machine ignores stale temporary assistant updates once the canonical final assistant already exists', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-12');
  state = applyChatSessionCanonicalMessageEvent(state, {
    version: 'history:1',
    message: createMessage('assistant-final-12', {
      role: 'assistant',
      text: 'final answer',
      createdAt: '2026-03-24T20:00:01.000Z',
      source: 'history',
    }),
    messageId: 'assistant-final-12',
    messageSeq: 1,
  });

  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-12',
    emittedAt: '2026-03-24T20:00:01.100Z',
    accumulatedText: 'final answer',
    textDelta: 'final answer',
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((message) => `${message.source}:${message.text}`), [
    'history:final answer',
  ]);
  assert.equal(render.messages.filter((message) => message.source === 'stream').length, 0);
  assert.equal(state.transientRunState['run-12'], undefined);
});

test('runtime machine keeps authoritative completed tool overlays after live sync and ignores late temporary tool updates', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-13');
  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-13',
    emittedAt: '2026-03-24T20:30:00.000Z',
    partial: false,
    tool: {
      toolCallId: 'tool-13',
      runId: 'run-13',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-24T20:30:00.000Z',
      updatedAt: '2026-03-24T20:30:00.000Z',
      argsPreview: '{"url":"https://example.com"}',
      resultPreview: null,
      isError: false,
    },
  });

  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-13',
      lifecycle: 'completed',
      toolCalls: [{
        toolCallId: 'tool-13',
        runId: 'run-13',
        name: 'browser',
        status: 'completed',
        startedAt: '2026-03-24T20:30:00.000Z',
        updatedAt: '2026-03-24T20:30:02.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"summary":"done"}',
        isError: false,
      }],
      finalMessageId: 'assistant-13',
      finalCreatedAt: '2026-03-24T20:30:03.000Z',
      firstAssistantSeenAt: '2026-03-24T20:30:02.500Z',
      firstToolStartedAt: '2026-03-24T20:30:00.000Z',
      sequence: 13,
    }),
  ]);

  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-13',
    emittedAt: '2026-03-24T20:30:03.100Z',
    partial: false,
    tool: {
      toolCallId: 'tool-13',
      runId: 'run-13',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-24T20:30:00.000Z',
      updatedAt: '2026-03-24T20:30:03.100Z',
      argsPreview: '{"url":"https://example.com"}',
      resultPreview: null,
      isError: false,
    },
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(state.transientRunState['run-13'], undefined);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.runId, 'run-13');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
  assert.match(render.overlays[0]?.toolCalls[0]?.resultPreview || '', /done/i);
});

test('runtime machine merges late running tool partial back into completed transient tool phase', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-transient-late-running');
  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-transient-late-running',
    emittedAt: '2026-03-24T20:35:00.000Z',
    partial: true,
    tool: {
      toolCallId: 'tool-transient-late-running',
      runId: 'run-transient-late-running',
      name: 'read',
      status: 'running',
      startedAt: '2026-03-24T20:35:00.000Z',
      updatedAt: '2026-03-24T20:35:00.000Z',
      argsPreview: '{"filePath":"README.md"}',
      resultPreview: null,
      isError: false,
    },
  });

  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-transient-late-running',
    emittedAt: '2026-03-24T20:35:01.000Z',
    partial: false,
    tool: {
      toolCallId: 'tool-transient-late-running',
      runId: 'run-transient-late-running',
      name: 'read',
      status: 'completed',
      startedAt: '2026-03-24T20:35:00.000Z',
      updatedAt: '2026-03-24T20:35:01.000Z',
      argsPreview: '{"filePath":"README.md"}',
      resultPreview: 'final file contents',
      isError: false,
    },
  });

  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-transient-late-running',
    emittedAt: '2026-03-24T20:35:01.100Z',
    accumulatedText: 'I read the file.',
    textDelta: 'I read the file.',
  });

  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-transient-late-running',
    emittedAt: '2026-03-24T20:35:01.200Z',
    partial: true,
    tool: {
      toolCallId: 'tool-transient-late-running',
      runId: 'run-transient-late-running',
      name: 'read',
      status: 'running',
      startedAt: '2026-03-24T20:35:00.000Z',
      updatedAt: '2026-03-24T20:35:01.200Z',
      argsPreview: '{"filePath":"README.md"}',
      resultPreview: 'stale partial chunk',
      isError: false,
    },
  });

  const transient = state.transientRunState['run-transient-late-running'];
  const processPhases = transient?.phases.filter((phase) => phase.kind === 'process') || [];
  const render = buildChatSessionRuntimeRenderModel(state);

  assert.equal(processPhases.length, 1);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
  assert.match(render.overlays[0]?.toolCalls[0]?.resultPreview || '', /final file contents/i);
  assert.equal(render.messages.at(-1)?.text, 'I read the file.');
});

test('runtime machine marks active running tool phase completed when assistant reply starts', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-assistant-settles-tool');
  state = applyChatSessionTemporaryToolEvent(state, {
    runId: 'run-assistant-settles-tool',
    emittedAt: '2026-03-24T20:36:00.000Z',
    partial: true,
    tool: {
      toolCallId: 'tool-assistant-settles-tool',
      runId: 'run-assistant-settles-tool',
      name: 'read',
      status: 'running',
      startedAt: '2026-03-24T20:36:00.000Z',
      updatedAt: '2026-03-24T20:36:00.500Z',
      argsPreview: '{"filePath":"README.md"}',
      resultPreview: 'file contents already streamed',
      isError: false,
    },
  });

  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'run-assistant-settles-tool',
    emittedAt: '2026-03-24T20:36:01.000Z',
    accumulatedText: 'The file says hello.',
    textDelta: 'The file says hello.',
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.lifecycle, 'completed');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
  assert.match(render.overlays[0]?.toolCalls[0]?.resultPreview || '', /file contents/i);
  assert.equal(render.messages.at(-1)?.text, 'The file says hello.');
});

test('runtime machine settles process ledger tool overlay when canonical assistant message arrives', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-canonical-settles-ledger-tool');
  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-canonical-settles-ledger-tool',
      lifecycle: 'running',
      updatedAt: '2026-03-24T20:37:00.500Z',
      toolCalls: [{
        toolCallId: 'tool-canonical-settles-ledger-tool',
        runId: 'run-canonical-settles-ledger-tool',
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T20:37:00.000Z',
        updatedAt: '2026-03-24T20:37:00.500Z',
        argsPreview: '{"command":"printf ok"}',
        resultPreview: null,
        isError: false,
      }],
    }),
  ]);

  state = applyChatSessionCanonicalMessageEvent(state, {
    version: 'v-canonical-settles-ledger-tool',
    messageId: 'assistant-canonical-settles-ledger-tool',
    messageSeq: 1,
    emittedAt: '2026-03-24T20:37:01.000Z',
    message: createMessage('assistant-canonical-settles-ledger-tool', {
      role: 'assistant',
      runId: 'run-canonical-settles-ledger-tool',
      text: 'The command finished.',
      createdAt: '2026-03-24T20:37:01.000Z',
      source: 'history',
    }),
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.lifecycle, 'completed');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
  assert.equal(render.messages.at(-1)?.text, 'The command finished.');
});

test('runtime machine settles process ledger tool overlay when final assistant message arrives', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-final-settles-ledger-tool');
  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-final-settles-ledger-tool',
      lifecycle: 'running',
      updatedAt: '2026-03-24T20:38:00.500Z',
      toolCalls: [{
        toolCallId: 'tool-final-settles-ledger-tool',
        runId: 'run-final-settles-ledger-tool',
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T20:38:00.000Z',
        updatedAt: '2026-03-24T20:38:00.500Z',
        argsPreview: '{"command":"printf ok"}',
        resultPreview: null,
        isError: false,
      }],
    }),
  ]);

  state = applyChatSessionFinalEvent(state, createMessage('assistant-final-settles-ledger-tool', {
    role: 'assistant',
    runId: 'run-final-settles-ledger-tool',
    text: 'Final answer.',
    createdAt: '2026-03-24T20:38:01.000Z',
    source: 'history',
  }));

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.lifecycle, 'completed');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
  assert.equal(render.messages.at(-1)?.text, 'Final answer.');
});

test('runtime machine settles stale running overlay that arrives after assistant has started', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-late-running-overlay-after-assistant');
  state = applyChatSessionCanonicalMessageEvent(state, {
    version: 'v-late-running-overlay-after-assistant',
    messageId: 'assistant-late-running-overlay-after-assistant',
    messageSeq: 1,
    emittedAt: '2026-03-24T20:39:01.000Z',
    message: createMessage('assistant-late-running-overlay-after-assistant', {
      role: 'assistant',
      runId: 'run-late-running-overlay-after-assistant',
      text: 'Assistant text has started.',
      createdAt: '2026-03-24T20:39:01.000Z',
      source: 'history',
    }),
  });

  state = upsertChatSessionProcessLedgerOverlay(state, createOverlay({
    runId: 'run-late-running-overlay-after-assistant',
    lifecycle: 'running',
    updatedAt: '2026-03-24T20:39:01.200Z',
    toolCalls: [{
      toolCallId: 'tool-late-running-overlay-after-assistant',
      runId: 'run-late-running-overlay-after-assistant',
      name: 'exec',
      status: 'running',
      startedAt: '2026-03-24T20:39:00.000Z',
      updatedAt: '2026-03-24T20:39:01.200Z',
      argsPreview: '{"command":"printf ok"}',
      resultPreview: null,
      isError: false,
    }],
  }));

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.lifecycle, 'completed');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
});

test('runtime machine enriches message tool hints from completed overlay for the same run', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-enrich-message-tool-from-overlay');
  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('assistant-tool-hint-running', {
      role: 'assistant',
      runId: 'run-enrich-message-tool-from-overlay',
      text: '',
      createdAt: '2026-03-24T20:39:30.000Z',
      source: 'history',
      stopReason: 'toolUse',
      toolCalls: [{
        toolCallId: 'raw-tool-hint-running',
        runId: 'run-enrich-message-tool-from-overlay',
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T20:39:30.000Z',
        updatedAt: '2026-03-24T20:39:30.200Z',
        argsPreview: '{"command":"printf ok"}',
        resultPreview: null,
        isError: false,
      }],
    }),
  ]);
  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-enrich-message-tool-from-overlay',
      lifecycle: 'completed',
      updatedAt: '2026-03-24T20:39:31.000Z',
      toolCalls: [{
        toolCallId: 'completed-overlay-tool',
        runId: 'run-enrich-message-tool-from-overlay',
        name: 'exec',
        status: 'completed',
        startedAt: '2026-03-24T20:39:30.000Z',
        updatedAt: '2026-03-24T20:39:31.000Z',
        argsPreview: '{"title":"command print text, `printf ok`"}',
        resultPreview: 'ok',
        isError: false,
      }],
    }),
  ]);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages[0]?.toolCalls?.[0]?.toolCallId, 'completed-overlay-tool');
  assert.equal(render.messages[0]?.toolCalls?.[0]?.status, 'completed');
  assert.equal(render.messages[0]?.toolCalls?.[0]?.resultPreview, 'ok');
});

test('runtime machine enriches running message tool hint from adjacent tool result message', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-enrich-message-tool-from-tool-result');
  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('assistant-tool-hint-local-transcript', {
      role: 'assistant',
      runId: null,
      text: '',
      createdAt: '2026-03-24T20:39:40.000Z',
      source: 'history',
      stopReason: 'toolUse',
      toolCalls: [{
        toolCallId: 'local-transcript-tool-call',
        runId: null,
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T20:39:40.000Z',
        updatedAt: '2026-03-24T20:39:40.100Z',
        argsPreview: '{"command":"printf ok"}',
        resultPreview: null,
        isError: false,
      }],
    }),
    createMessage('tool-result-local-transcript', {
      role: 'tool',
      runId: null,
      text: 'ok',
      createdAt: '2026-03-24T20:39:40.200Z',
      source: 'history',
    }),
  ]);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages[0]?.toolCalls?.[0]?.status, 'completed');
  assert.equal(render.messages[0]?.toolCalls?.[0]?.resultPreview, 'ok');
});

test('runtime machine does not downgrade completed tool status when history refresh returns stale running overlay', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-stale-overlay-completed');
  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-stale-completed',
      lifecycle: 'completed',
      updatedAt: '2026-03-24T20:40:02.000Z',
      toolCalls: [{
        toolCallId: 'tool-stale-completed',
        runId: 'run-stale-completed',
        name: 'browser',
        status: 'completed',
        startedAt: '2026-03-24T20:40:00.000Z',
        updatedAt: '2026-03-24T20:40:02.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"summary":"done"}',
        isError: false,
      }],
    }),
  ]);

  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-stale-completed',
      lifecycle: 'running',
      updatedAt: '2026-03-24T20:40:03.000Z',
      finalMessageId: null,
      finalCreatedAt: null,
      toolCalls: [{
        toolCallId: 'tool-stale-completed',
        runId: 'run-stale-completed',
        name: 'browser',
        status: 'running',
        startedAt: '2026-03-24T20:40:00.000Z',
        updatedAt: '2026-03-24T20:40:03.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: null,
        isError: false,
      }],
    }),
  ]);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays[0]?.lifecycle, 'completed');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
  assert.match(render.overlays[0]?.toolCalls[0]?.resultPreview || '', /done/i);
});

test('runtime machine does not downgrade failed tool status when canonical snapshot returns stale running overlay', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-stale-overlay-error');
  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-stale-error',
      lifecycle: 'running',
      updatedAt: '2026-03-24T20:45:02.000Z',
      toolCalls: [{
        toolCallId: 'tool-stale-error',
        runId: 'run-stale-error',
        name: 'shell',
        status: 'error',
        startedAt: '2026-03-24T20:45:00.000Z',
        updatedAt: '2026-03-24T20:45:02.000Z',
        argsPreview: '{"cmd":"false"}',
        resultPreview: '{"error":"exit 1"}',
        isError: true,
      }],
    }),
  ]);

  state = applyChatSessionCanonicalSnapshotEvent(state, {
    version: 'snapshot-stale-error',
    messages: [],
    overlays: [
      createOverlay({
        runId: 'run-stale-error',
        lifecycle: 'running',
        updatedAt: '2026-03-24T20:45:03.000Z',
        finalMessageId: null,
        finalCreatedAt: null,
        toolCalls: [{
          toolCallId: 'tool-stale-error',
          runId: 'run-stale-error',
          name: 'shell',
          status: 'running',
          startedAt: '2026-03-24T20:45:00.000Z',
          updatedAt: '2026-03-24T20:45:03.000Z',
          argsPreview: '{"cmd":"false"}',
          resultPreview: null,
          isError: false,
        }],
      }),
    ],
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays[0]?.lifecycle, 'running');
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'error');
  assert.match(render.overlays[0]?.toolCalls[0]?.resultPreview || '', /exit 1/i);
});

test('runtime machine ignores stale live overlay after authoritative terminal overlay', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-stale-live-overlay');
  state = replaceChatSessionProcessLedger(state, [
    createOverlay({
      runId: 'run-stale-live',
      lifecycle: 'completed',
      toolCalls: [{
        toolCallId: 'tool-stale-live',
        runId: 'run-stale-live',
        name: 'read',
        status: 'completed',
        startedAt: '2026-03-24T20:50:00.000Z',
        updatedAt: '2026-03-24T20:50:01.000Z',
        argsPreview: '{"path":"README.md"}',
        resultPreview: '{"bytes":128}',
        isError: false,
      }],
    }),
  ]);

  state = applyChatSessionLiveOverlayEvent(state, {
    runId: 'run-stale-live',
    emittedAt: '2026-03-24T20:50:02.000Z',
    overlay: createOverlay({
      runId: 'run-stale-live',
      lifecycle: 'running',
      finalMessageId: null,
      finalCreatedAt: null,
      toolCalls: [{
        toolCallId: 'tool-stale-live',
        runId: 'run-stale-live',
        name: 'read',
        status: 'running',
        startedAt: '2026-03-24T20:50:00.000Z',
        updatedAt: '2026-03-24T20:50:02.000Z',
        argsPreview: '{"path":"README.md"}',
        resultPreview: null,
        isError: false,
      }],
    }),
  });

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(state.transientRunState['run-stale-live'], undefined);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.toolCalls[0]?.status, 'completed');
});

// ──────────────────────────────────────────────────────────────────────────────
// IM-style windowing: prepend, append, anchor, window eviction
// ──────────────────────────────────────────────────────────────────────────────

const MESSAGE_WINDOW_MAX = CHAT_SESSION_MESSAGE_WINDOW_MAX;

function generateMessages(count, prefix = 'msg') {
  return Array.from({ length: count }, (_, i) => createMessage(`${prefix}-${i}`, {
    createdAt: `2026-03-24T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
  }));
}

test('prependChatSessionCanonicalMessageLedger prepends messages and returns eviction result', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-prepend-1');
  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('existing-1'),
    createMessage('existing-2'),
  ]);

  const result = prependChatSessionCanonicalMessageLedger(state, [
    createMessage('older-1'),
    createMessage('older-2'),
  ]);

  const render = buildChatSessionRuntimeRenderModel(result.state);
  assert.equal(render.messages.length, 4);
  assert.equal(render.messages[0]?.id, 'older-1');
  assert.equal(render.messages[1]?.id, 'older-2');
  assert.equal(render.messages[2]?.id, 'existing-1');
  assert.equal(render.messages[3]?.id, 'existing-2');
  assert.equal(result.eviction.evictedTop, 0);
  assert.equal(result.eviction.evictedBottom, 0);
});

test('prependChatSessionCanonicalMessageLedger keeps realistic browse history below the window budget', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-prepend-heavy-browse');
  state = replaceChatSessionCanonicalMessageLedger(state, generateMessages(120, 'existing'));

  const result = prependChatSessionCanonicalMessageLedger(state, generateMessages(24, 'prepended'));

  const render = buildChatSessionRuntimeRenderModel(result.state);
  assert.equal(render.messages.length, 144);
  assert.equal(render.messages[0]?.id, 'prepended-0');
  assert.equal(render.messages[143]?.id, 'existing-119');
  assert.equal(result.eviction.evictedBottom, 0);
  assert.equal(result.eviction.evictedTop, 0);
});

test('prependChatSessionCanonicalMessageLedger evicts from bottom when exceeding window budget', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-prepend-evict');
  state = replaceChatSessionCanonicalMessageLedger(state, generateMessages(MESSAGE_WINDOW_MAX, 'existing'));

  const result = prependChatSessionCanonicalMessageLedger(state, generateMessages(10, 'prepended'));

  const render = buildChatSessionRuntimeRenderModel(result.state);
  assert.equal(render.messages.length, MESSAGE_WINDOW_MAX);
  assert.equal(render.messages[0]?.id, 'prepended-0');
  assert.equal(result.eviction.evictedBottom, 10);
  assert.equal(result.eviction.evictedTop, 0);
});

test('appendChatSessionCanonicalMessageLedger appends messages and returns eviction result', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-append-1');
  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('existing-1'),
    createMessage('existing-2'),
  ]);

  const result = appendChatSessionCanonicalMessageLedger(state, [
    createMessage('newer-1'),
    createMessage('newer-2'),
  ], []);

  const render = buildChatSessionRuntimeRenderModel(result.state);
  assert.equal(render.messages.length, 4);
  assert.equal(render.messages[0]?.id, 'existing-1');
  assert.equal(render.messages[1]?.id, 'existing-2');
  assert.equal(render.messages[2]?.id, 'newer-1');
  assert.equal(render.messages[3]?.id, 'newer-2');
  assert.equal(result.eviction.evictedTop, 0);
  assert.equal(result.eviction.evictedBottom, 0);
});

test('appendChatSessionCanonicalMessageLedger evicts from top when exceeding window budget', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-append-evict');
  state = replaceChatSessionCanonicalMessageLedger(state, generateMessages(MESSAGE_WINDOW_MAX, 'existing'));

  // Generate appended messages with later timestamps so they sort after existing ones
  const appended = Array.from({ length: 10 }, (_, i) => createMessage(`appended-${i}`, {
    createdAt: `2026-03-25T10:00:${String(i).padStart(2, '0')}.000Z`,
  }));
  const result = appendChatSessionCanonicalMessageLedger(state, appended, []);

  const render = buildChatSessionRuntimeRenderModel(result.state);
  assert.equal(render.messages.length, MESSAGE_WINDOW_MAX);
  assert.equal(render.messages[render.messages.length - 1]?.id, 'appended-9');
  assert.equal(result.eviction.evictedTop, 10);
  assert.equal(result.eviction.evictedBottom, 0);
});

test('appendChatSessionCanonicalMessageLedger merges overlays into process ledger', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-append-overlay');
  state = replaceChatSessionCanonicalMessageLedger(state, [createMessage('msg-1')]);

  const overlay = createOverlay({ runId: 'run-overlay-append' });
  const result = appendChatSessionCanonicalMessageLedger(state, [createMessage('msg-2')], [overlay]);

  assert.equal(result.state.processLedger['run-overlay-append'] !== undefined, true);
});

test('windowChatSessionCanonicalMessageLedger is a no-op when under budget', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-window-under');
  state = replaceChatSessionCanonicalMessageLedger(state, generateMessages(50, 'msg'));

  const eviction = windowChatSessionCanonicalMessageLedger(state, 'append');
  assert.equal(eviction.evictedTop, 0);
  assert.equal(eviction.evictedBottom, 0);
  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, 50);
});

test('windowChatSessionCanonicalMessageLedger evicts top for append direction', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-window-top');
  state = replaceChatSessionCanonicalMessageLedger(state, generateMessages(MESSAGE_WINDOW_MAX + 20, 'msg'));

  const eviction = windowChatSessionCanonicalMessageLedger(state, 'append');
  assert.equal(eviction.evictedTop, 20);
  assert.equal(eviction.evictedBottom, 0);
  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, MESSAGE_WINDOW_MAX);
  assert.equal(render.messages[0]?.id, 'msg-20');
});

test('windowChatSessionCanonicalMessageLedger evicts bottom for prepend direction', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-window-bottom');
  state = replaceChatSessionCanonicalMessageLedger(state, generateMessages(MESSAGE_WINDOW_MAX + 15, 'msg'));

  const eviction = windowChatSessionCanonicalMessageLedger(state, 'prepend');
  assert.equal(eviction.evictedTop, 0);
  assert.equal(eviction.evictedBottom, 15);
  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.messages.length, MESSAGE_WINDOW_MAX);
  assert.equal(render.messages[render.messages.length - 1]?.id, `msg-${MESSAGE_WINDOW_MAX - 1}`);
});

test('windowChatSessionCanonicalMessageLedger does not evict messages belonging to active transient runs', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-window-active');
  const messages = generateMessages(MESSAGE_WINDOW_MAX + 10, 'msg');
  // Mark the first messages at the top as belonging to an active run
  for (let i = 0; i < 5; i++) {
    messages[i] = { ...messages[i], runId: 'active-run' };
  }
  state = replaceChatSessionCanonicalMessageLedger(state, messages);
  // Simulate an active transient run
  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'active-run',
    emittedAt: '2026-03-24T10:00:00.000Z',
    textDelta: 'streaming',
    accumulatedText: 'streaming',
  });

  // Evicting from top (append direction) should stop when hitting active-run messages
  const eviction = windowChatSessionCanonicalMessageLedger(state, 'append');
  // The eviction loop starts from index 0, which belongs to active-run, so stops immediately
  assert.equal(eviction.evictedTop, 0);
  assert.equal(eviction.evictedBottom, 0);
  // Check canonical ledger directly — render includes the transient streaming assistant message
  assert.equal(state.canonicalMessageLedger.length, MESSAGE_WINDOW_MAX + 10);
});

test('anchorChatSessionCanonicalMessageLedger replaces ledger and clears transient state', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-anchor-1');
  state = replaceChatSessionCanonicalMessageLedger(state, [
    createMessage('old-1'),
    createMessage('old-2'),
  ]);
  // Simulate a transient run
  state = applyChatSessionTemporaryAssistantEvent(state, {
    runId: 'old-run',
    emittedAt: '2026-03-24T10:00:00.000Z',
    textDelta: 'draft',
    accumulatedText: 'draft',
  });

  state = anchorChatSessionCanonicalMessageLedger(state, [
    createMessage('anchor-1'),
    createMessage('anchor-2'),
    createMessage('anchor-3'),
  ], []);

  const render = buildChatSessionRuntimeRenderModel(state);
  assert.deepEqual(render.messages.map((m) => m.id), ['anchor-1', 'anchor-2', 'anchor-3']);
  assert.equal(state.transientRunState['old-run'], undefined);
});

test('anchorChatSessionCanonicalMessageLedger merges overlays into process ledger', () => {
  let state = createEmptyChatSessionRuntimeMachineState('session-anchor-overlay');
  const overlay = createOverlay({ runId: 'anchor-overlay-run' });

  state = anchorChatSessionCanonicalMessageLedger(state, [
    createMessage('anchor-msg-1'),
  ], [overlay]);

  assert.equal(state.processLedger['anchor-overlay-run'] !== undefined, true);
  const render = buildChatSessionRuntimeRenderModel(state);
  assert.equal(render.overlays.length, 1);
  assert.equal(render.overlays[0]?.runId, 'anchor-overlay-run');
});


test('buildChatRuntimeSummary prefers live runtime and returns expected conversation/gateway fields', () => {
  const summary = buildChatRuntimeSummary({
    historyRuntime: {
      gatewayConnected: true,
      sessionWritable: true,
      activeRunId: null,
      state: 'completed',
      lastEventAt: '2026-04-09T16:00:05.000Z',
      lastAckAt: '2026-04-09T16:00:05.000Z',
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    sessionRuntime: {
      gatewayConnected: true,
      sessionWritable: true,
      activeRunId: 'run-live',
      state: 'running',
      lastEventAt: '2026-04-09T16:00:10.000Z',
      lastAckAt: '2026-04-09T16:00:09.000Z',
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    selectedSession: {
      key: 'agent:main:webchat:direct:studio-test',
      agentId: 'main',
      sessionId: 'session-1',
      kind: 'studio_managed',
      label: 'Studio chat · main',
      derivedTitle: null,
      lastMessagePreview: null,
      updatedAt: '2026-04-09T16:00:10.000Z',
      runtime: null,
      source: { type: 'studio', path: null, mtimeMs: null },
      deliveryContext: {
        mode: 'direct',
        address: null,
        peerLabel: null,
        channel: null,
        accountId: null,
      },
      permissions: {
        visibleInFrontend: true,
        writable: true,
        canSend: true,
        canAbort: true,
        canReset: true,
        canDelete: true,
        canArchive: true,
        canRename: true,
      },
      presentation: {
        archived: false,
        archivedAt: null,
        customLabel: null,
      },
    },
    selectedSessionTitle: 'Main Chat',
    agentName: 'Main',
    chatRealtimeEnabled: true,
    gatewayReachable: true,
    wsConnected: true,
    text: (zh) => zh,
  });

  assert.equal(summary.activeRuntime?.activeRunId, 'run-live');
  assert.equal(summary.conversationTitle, 'Main Chat');
  assert.equal(summary.conversationSubtitle, '正在和 Main 对话');
  assert.equal(summary.gatewayWarning, '');
});

test('buildChatOverlaySummary returns overlays and flattened tool call ids', () => {
  const overlays = [
    createOverlay({ runId: 'run-x' }),
    createOverlay({
      runId: 'run-y',
      toolCalls: [{
        toolCallId: 'tool-y-1',
        runId: 'run-y',
        name: 'exec',
        status: 'running',
        startedAt: '2026-03-24T20:31:00.000Z',
        updatedAt: '2026-03-24T20:31:00.000Z',
        argsPreview: '{}',
        resultPreview: null,
        isError: false,
      }],
    }),
  ];

  const summary = buildChatOverlaySummary({ overlays });
  assert.equal(summary.overlays, overlays);
  assert.deepEqual(summary.overlayToolCallIds, ['tool-1', 'tool-y-1']);
});
