/**
 * Plan verification: search-mode timeline contract, gateway partial semantics, preview limits.
 * OpenClaw gateway emits tool phase "update" with partialResult as a per-tick snapshot
 * (see projects/openclaw/src/agents/pi-embedded-subscribe.handlers.tools.ts handleToolExecutionUpdate).
 * Tracevane mapper clips each event's preview; service mergeToolCallItem prefers longer merged previews.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChatRenderableTimeline } from '../../dist/lib/chat-run-overlay.js';
import { mapGatewayAgentEventPayload } from '../../dist/apps/api/modules/chat/agent-event-mapper.js';

test('plan: search-style overlay mirror still prefers overlay-first semantics', () => {
  const messages = [
    {
      id: 'assistant-1',
      role: 'assistant',
      text: 'Calling tool.',
      createdAt: '2026-03-23T10:00:00.000Z',
      source: 'history',
      runId: 'run-1',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
      toolCalls: [
        {
          toolCallId: 'tool-a',
          runId: 'run-1',
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
  ];
  const renderables = buildChatRenderableTimeline({
    messages,
    overlays: [
      {
        runId: 'run-1',
        startedAt: '2026-03-23T10:00:00.000Z',
        updatedAt: '2026-03-23T10:00:01.000Z',
        lifecycle: 'completed',
        previewText: '',
        toolCalls: [
          {
            toolCallId: 'tool-a',
            runId: 'run-1',
            name: 'browser',
            status: 'completed',
            startedAt: '2026-03-23T10:00:00.100Z',
            updatedAt: '2026-03-23T10:00:01.000Z',
            argsPreview: '{}',
            resultPreview: '{"summary":"done"}',
            isError: false,
          },
        ],
        finalMessageId: 'assistant-1',
        finalCreatedAt: '2026-03-23T10:00:00.000Z',
        firstAssistantSeenAt: '2026-03-23T10:00:00.000Z',
        firstToolStartedAt: '2026-03-23T10:00:00.100Z',
        sequence: 1,
      },
    ],
  });
  assert.equal(renderables.length, 2);
  assert.equal(renderables[0]?.type, 'message_group');
  assert.equal(renderables[0]?.group.messages[0]?.toolCalls, undefined);
  assert.equal(renderables[1]?.type, 'run_overlay');
  assert.equal(renderables[1]?.overlay.toolCalls?.[0]?.toolCallId, 'tool-a');
});

test('plan: tool partialResult string preview is clipped to 260 chars per agent-event-mapper', () => {
  const long = 'p'.repeat(400);
  const mapped = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    payload: {
      runId: 'run-partial',
      stream: 'tool',
      ts: Date.parse('2026-03-23T12:00:00.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-long',
        name: 'browser',
        partialResult: long,
      },
    },
  });
  assert.equal(mapped?.kind, 'agent_tool_result');
  assert.equal(mapped?.partial, true);
  const preview = mapped?.tool.resultPreview || '';
  assert.equal(preview.length, 260);
  assert.ok(preview.endsWith('…'));
});

test('plan: successive partial updates carry independent snapshots; longer JSON wins after service-style merge', () => {
  const start = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    payload: {
      runId: 'run-merge',
      stream: 'tool',
      ts: Date.parse('2026-03-23T12:00:01.000Z'),
      data: {
        phase: 'start',
        toolCallId: 'tool-m',
        name: 'browser',
        args: { step: 1 },
      },
    },
  });
  assert.equal(start?.kind, 'agent_tool_call');
  const u1 = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    previousToolCard: start?.tool,
    payload: {
      runId: 'run-merge',
      stream: 'tool',
      ts: Date.parse('2026-03-23T12:00:02.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-m',
        name: 'browser',
        partialResult: { progress: 'aa' },
      },
    },
  });
  const u2 = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    previousToolCard: u1?.tool,
    payload: {
      runId: 'run-merge',
      stream: 'tool',
      ts: Date.parse('2026-03-23T12:00:03.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-m',
        name: 'browser',
        partialResult: { progress: 'aaaa' },
      },
    },
  });
  assert.ok((u1?.tool.resultPreview || '').length < (u2?.tool.resultPreview || '').length);
  assert.match(u2?.tool.resultPreview || '', /aaaa/);
});
