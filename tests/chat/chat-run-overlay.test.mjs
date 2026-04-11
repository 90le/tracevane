import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChatRenderableTimeline } from '../../dist/lib/chat-run-overlay.js';

function buildOverlay(overrides = {}) {
  return {
    runId: 'run-1',
    startedAt: '2026-03-23T10:00:00.000Z',
    updatedAt: '2026-03-23T10:00:03.000Z',
    lifecycle: 'completed',
    previewText: '',
    toolCalls: [
      {
        toolCallId: 'tool-1',
        runId: 'run-1',
        name: 'browser',
        status: 'completed',
        startedAt: '2026-03-23T10:00:01.000Z',
        updatedAt: '2026-03-23T10:00:02.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"summary":"done"}',
        isError: false,
      },
    ],
    finalMessageId: 'assistant-reply',
    finalCreatedAt: '2026-03-23T10:00:04.000Z',
    firstAssistantSeenAt: '2026-03-23T10:00:00.500Z',
    firstToolStartedAt: '2026-03-23T10:00:01.000Z',
    sequence: 3,
    ...overrides,
  };
}

test('mixed run renders as explanation -> overlay -> reply without duplicating tool calls into message groups', () => {
  const messages = [
    {
      id: 'user-1',
      role: 'user',
      text: '请处理一下',
      createdAt: '2026-03-23T10:00:00.000Z',
      source: 'history',
      runId: 'run-1',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    },
    {
      id: 'assistant-explain',
      role: 'assistant',
      text: '我先检查环境。',
      createdAt: '2026-03-23T10:00:00.500Z',
      source: 'history',
      runId: 'run-1',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
      toolCalls: [
        {
          toolCallId: 'tool-1',
          runId: 'run-1',
          name: 'browser',
          status: 'running',
          startedAt: '2026-03-23T10:00:01.000Z',
          updatedAt: '2026-03-23T10:00:01.000Z',
          argsPreview: '{}',
          resultPreview: null,
          isError: false,
        },
      ],
    },
    {
      id: 'assistant-reply',
      role: 'assistant',
      text: '已经处理完成。',
      createdAt: '2026-03-23T10:00:04.000Z',
      source: 'history',
      runId: 'run-1',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    },
  ];

  const renderables = buildChatRenderableTimeline({
    messages,
    overlays: [buildOverlay()],
  });

  assert.deepEqual(renderables.map((item) => item.type), [
    'message_group',
    'message_group',
    'run_overlay',
    'message_group',
  ]);
  assert.equal(renderables[1]?.type, 'message_group');
  assert.equal(renderables[1]?.group.messages[0]?.id, 'assistant-explain');
  assert.equal(renderables[1]?.group.messages[0]?.toolCalls, undefined);
  assert.equal(renderables[2]?.type, 'run_overlay');
  assert.equal(renderables[2]?.overlay.finalMessageId, 'assistant-reply');
  assert.deepEqual(renderables[2]?.anchorMessageIds, ['assistant-explain', 'assistant-reply']);
  assert.equal(renderables[3]?.type, 'message_group');
  assert.equal(renderables[3]?.group.messages[0]?.id, 'assistant-reply');
});

test('tool-first overlay stays after user turn and keeps preview text when no canonical assistant exists yet', () => {
  const renderables = buildChatRenderableTimeline({
    messages: [
      {
        id: 'user-1',
        role: 'user',
        text: '继续',
        createdAt: '2026-03-23T10:00:00.000Z',
        source: 'history',
        runId: 'run-2',
        truncated: false,
        omitted: false,
        aborted: false,
        stopReason: null,
      },
    ],
    overlays: [
      buildOverlay({
        runId: 'run-2',
        previewText: '我先检查一下。',
        finalMessageId: null,
        finalCreatedAt: null,
        firstAssistantSeenAt: '2026-03-23T10:00:00.800Z',
        sequence: 2,
      }),
    ],
  });

  assert.deepEqual(renderables.map((item) => item.type), [
    'message_group',
    'run_overlay',
  ]);
  assert.equal(renderables[1]?.type, 'run_overlay');
  assert.equal(renderables[1]?.overlay.previewText, '我先检查一下。');
});

test('same toolCallId suppresses message-level toolCalls even when runId differs', () => {
  const renderables = buildChatRenderableTimeline({
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        text: '我先处理一下。',
        createdAt: '2026-03-23T10:00:00.000Z',
        source: 'history',
        runId: null,
        truncated: false,
        omitted: false,
        aborted: false,
        stopReason: null,
        toolCalls: [
          {
            toolCallId: 'tool-shared',
            runId: null,
            name: 'browser',
            status: 'running',
            startedAt: '2026-03-23T10:00:00.100Z',
            updatedAt: '2026-03-23T10:00:00.100Z',
            argsPreview: '{}',
            resultPreview: null,
            isError: false,
          },
        ],
      },
    ],
    overlays: [
      buildOverlay({
        runId: 'run-overlay',
        finalMessageId: null,
        finalCreatedAt: null,
        toolCalls: [
          {
            toolCallId: 'tool-shared',
            runId: 'run-overlay',
            name: 'browser',
            status: 'completed',
            startedAt: '2026-03-23T10:00:01.000Z',
            updatedAt: '2026-03-23T10:00:02.000Z',
            argsPreview: '{"url":"https://example.com"}',
            resultPreview: '{"summary":"done"}',
            isError: false,
          },
        ],
      }),
    ],
  });

  assert.equal(renderables[0]?.type, 'message_group');
  assert.equal(renderables[0]?.group.messages[0]?.toolCalls, undefined);
  assert.equal(renderables[1]?.type, 'run_overlay');
  assert.equal(renderables[1]?.overlay.toolCalls[0]?.status, 'completed');
});

test('overlay update keeps a single continuation source while status changes in place', () => {
  const messages = [
    {
      id: 'assistant-explain',
      role: 'assistant',
      text: '我先检查环境。',
      createdAt: '2026-03-23T10:00:00.500Z',
      source: 'history',
      runId: 'run-live',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
      toolCalls: [
        {
          toolCallId: 'tool-live',
          runId: 'run-live',
          name: 'browser',
          status: 'running',
          startedAt: '2026-03-23T10:00:01.000Z',
          updatedAt: '2026-03-23T10:00:01.000Z',
          argsPreview: '{}',
          resultPreview: null,
          isError: false,
        },
      ],
    },
  ];

  const running = buildChatRenderableTimeline({
    messages,
    overlays: [
      buildOverlay({
        runId: 'run-live',
        finalMessageId: null,
        finalCreatedAt: null,
        toolCalls: [
          {
            toolCallId: 'tool-live',
            runId: 'run-live',
            name: 'browser',
            status: 'running',
            startedAt: '2026-03-23T10:00:01.000Z',
            updatedAt: '2026-03-23T10:00:01.000Z',
            argsPreview: '{}',
            resultPreview: null,
            isError: false,
          },
        ],
      }),
    ],
  });
  const completed = buildChatRenderableTimeline({
    messages,
    overlays: [
      buildOverlay({
        runId: 'run-live',
        finalMessageId: null,
        finalCreatedAt: null,
        toolCalls: [
          {
            toolCallId: 'tool-live',
            runId: 'run-live',
            name: 'browser',
            status: 'completed',
            startedAt: '2026-03-23T10:00:01.000Z',
            updatedAt: '2026-03-23T10:00:02.000Z',
            argsPreview: '{}',
            resultPreview: '{"summary":"done"}',
            isError: false,
          },
        ],
      }),
    ],
  });

  assert.deepEqual(running.map((item) => item.type), ['message_group', 'run_overlay']);
  assert.deepEqual(completed.map((item) => item.type), ['message_group', 'run_overlay']);
  assert.equal(running[0]?.group.messages[0]?.toolCalls, undefined);
  assert.equal(completed[0]?.group.messages[0]?.toolCalls, undefined);
  assert.equal(running[1]?.id, completed[1]?.id);
  assert.equal(running[1]?.overlay.toolCalls[0]?.status, 'running');
  assert.equal(completed[1]?.overlay.toolCalls[0]?.status, 'completed');
});

test('single-assistant run places overlay by tool timing before the final assistant bubble', () => {
  const messages = [
    {
      id: 'user-1',
      role: 'user',
      text: '你好',
      createdAt: '2026-03-23T10:00:00.000Z',
      source: 'history',
      runId: 'run-single',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    },
    {
      id: 'assistant-single',
      role: 'assistant',
      text: '完整回复在一气泡内。',
      createdAt: '2026-03-23T10:00:05.000Z',
      source: 'history',
      runId: 'run-single',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    },
  ];

  const renderables = buildChatRenderableTimeline({
    messages,
    overlays: [
      buildOverlay({
        runId: 'run-single',
        finalMessageId: 'assistant-single',
        finalCreatedAt: '2026-03-23T10:00:05.000Z',
        toolCalls: [
          {
            toolCallId: 'tool-1',
            runId: 'run-single',
            name: 'browser',
            status: 'completed',
            startedAt: '2026-03-23T10:00:01.000Z',
            updatedAt: '2026-03-23T10:00:02.000Z',
            argsPreview: '{}',
            resultPreview: '{}',
            isError: false,
          },
        ],
      }),
    ],
  });

  assert.deepEqual(renderables.map((item) => item.type), [
    'message_group',
    'run_overlay',
    'message_group',
  ]);
  assert.equal(renderables[1]?.type, 'run_overlay');
  assert.equal(renderables[2]?.group.messages[0]?.id, 'assistant-single');
});

test('message toolCalls stay visible as fallback when no overlay exists', () => {
  const renderables = buildChatRenderableTimeline({
    messages: [
      {
        id: 'assistant-fallback',
        role: 'assistant',
        text: '我先处理一下。',
        createdAt: '2026-03-23T10:00:00.000Z',
        source: 'history',
        runId: null,
        truncated: false,
        omitted: false,
        aborted: false,
        stopReason: null,
        toolCalls: [
          {
            toolCallId: 'tool-fallback',
            runId: null,
            name: 'browser',
            status: 'running',
            startedAt: '2026-03-23T10:00:00.100Z',
            updatedAt: '2026-03-23T10:00:00.100Z',
            argsPreview: '{}',
            resultPreview: null,
            isError: false,
          },
        ],
      },
    ],
    overlays: [],
  });

  assert.equal(renderables[0]?.type, 'message_group');
  assert.equal(renderables[0]?.group.messages[0]?.toolCalls?.[0]?.toolCallId, 'tool-fallback');
});

test('tool-use assistant stays as a canonical message step when the completed overlay is redundant', () => {
  const renderables = buildChatRenderableTimeline({
    messages: [
      {
        id: 'assistant-tool-use',
        role: 'assistant',
        text: '',
        createdAt: '2026-03-24T12:55:55.441Z',
        source: 'history',
        runId: null,
        truncated: false,
        omitted: false,
        aborted: false,
        stopReason: 'toolUse',
        toolCalls: [
          {
            toolCallId: 'tool-phase-1',
            runId: null,
            name: 'exec',
            status: 'running',
            startedAt: '2026-03-24T12:55:55.441Z',
            updatedAt: '2026-03-24T12:55:55.441Z',
            argsPreview: '{"command":"date && whoami"}',
            resultPreview: null,
            isError: false,
          },
        ],
        processBlocks: [
          {
            id: 'thinking-1',
            kind: 'thinking',
            text: 'deciding which command to run',
          },
        ],
      },
    ],
    overlays: [
      buildOverlay({
        runId: 'run-process-1',
        toolCalls: [
          {
            toolCallId: 'tool-phase-1',
            runId: 'run-process-1',
            name: 'exec',
            status: 'running',
            startedAt: '2026-03-24T12:55:55.441Z',
            updatedAt: '2026-03-24T12:55:55.441Z',
            argsPreview: '{"command":"date && whoami"}',
            resultPreview: null,
            isError: false,
          },
        ],
        finalMessageId: null,
        finalCreatedAt: null,
        firstAssistantSeenAt: null,
        firstToolStartedAt: '2026-03-24T12:55:55.441Z',
      }),
    ],
  });

  assert.deepEqual(renderables.map((item) => item.type), ['message_group']);
  assert.equal(renderables[0]?.type, 'message_group');
  assert.equal(renderables[0]?.group.messages[0]?.toolCalls?.[0]?.toolCallId, 'tool-phase-1');
  assert.equal(renderables[0]?.group.messages[0]?.processBlocks?.length, 1);
  assert.match(renderables[0]?.group.messages[0]?.processBlocks?.[0]?.text || '', /deciding which command to run/i);
});
