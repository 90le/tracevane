import test from 'node:test';
import assert from 'node:assert/strict';

import { mapGatewayAgentEventPayload } from '../../dist/apps/api/modules/chat/agent-event-mapper.js';

test('maps lifecycle agent event into Studio contract', () => {
  const mapped = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    payload: {
      runId: 'run-1',
      stream: 'lifecycle',
      ts: Date.parse('2026-03-19T03:00:00.000Z'),
      data: { phase: 'start' },
    },
  });

  assert.equal(mapped?.kind, 'agent_lifecycle');
  assert.equal(mapped?.lifecycle.phase, 'start');
  assert.equal(mapped?.runId, 'run-1');
});

test('maps tool start and result events into Studio contract', () => {
  const start = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    payload: {
      runId: 'run-1',
      stream: 'tool',
      ts: Date.parse('2026-03-19T03:00:01.000Z'),
      data: {
        phase: 'start',
        toolCallId: 'tool-1',
        name: 'session_status',
        args: {},
      },
    },
  });

  assert.equal(start?.kind, 'agent_tool_call');
  assert.equal(start?.tool.name, 'session_status');
  assert.equal(start?.tool.status, 'running');

  const result = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    previousToolCard: start?.tool,
    payload: {
      runId: 'run-1',
      stream: 'tool',
      ts: Date.parse('2026-03-19T03:00:02.000Z'),
      data: {
        phase: 'result',
        toolCallId: 'tool-1',
        name: 'session_status',
        result: { ok: true, summary: 'healthy' },
      },
    },
  });

  assert.equal(result?.kind, 'agent_tool_result');
  assert.equal(result?.partial, false);
  assert.equal(result?.tool.status, 'completed');
  assert.ok(result?.tool.resultPreview?.includes('healthy'));
});

test('maps assistant stream preview into Studio contract', () => {
  const mapped = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    payload: {
      runId: 'run-2',
      stream: 'assistant',
      ts: Date.parse('2026-03-19T03:00:03.000Z'),
      data: {
        text: 'hello world',
        delta: 'world',
      },
    },
  });

  assert.equal(mapped?.kind, 'agent_assistant');
  assert.equal(mapped?.text, 'hello world');
  assert.equal(mapped?.textPreview, 'hello world');
  assert.equal(mapped?.deltaText, 'world');
});

test('tool status is monotonic and richer result preview is preserved', () => {
  const completed = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    previousToolCard: {
      toolCallId: 'tool-9',
      runId: 'run-9',
      name: 'browser',
      status: 'running',
      startedAt: '2026-03-19T03:00:01.000Z',
      updatedAt: '2026-03-19T03:00:01.000Z',
      argsPreview: '{"url":"https://example.com"}',
      resultPreview: null,
      isError: false,
    },
    payload: {
      runId: 'run-9',
      stream: 'tool',
      ts: Date.parse('2026-03-19T03:00:03.000Z'),
      data: {
        phase: 'result',
        toolCallId: 'tool-9',
        name: 'browser',
        result: { ok: true, summary: 'navigated successfully with final page snapshot' },
      },
    },
  });

  const lateUpdate = mapGatewayAgentEventPayload({
    sessionKey: 'agent:main:webchat:direct:studio-1',
    previousToolCard: completed?.tool,
    payload: {
      runId: 'run-9',
      stream: 'tool',
      ts: Date.parse('2026-03-19T03:00:04.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-9',
        name: 'browser',
        partialResult: { summary: '50%' },
      },
    },
  });

  assert.equal(completed?.tool.status, 'completed');
  assert.match(completed?.tool.resultPreview || '', /final page snapshot/i);
  assert.equal(lateUpdate?.tool.status, 'completed');
  assert.match(lateUpdate?.tool.resultPreview || '', /final page snapshot/i);
});
