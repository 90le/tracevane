import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGatewayDirectAbortResponse,
  buildGatewayDirectSendAck,
  compileGatewayMessageText,
  formatGatewayFileRef,
} from '../../dist/lib/chat-gateway-transport.js';

test('formatGatewayFileRef quotes paths with spaces', () => {
  assert.equal(formatGatewayFileRef('docs/readme.md'), '@docs/readme.md');
  assert.equal(formatGatewayFileRef('docs/my notes.md'), '@"docs/my notes.md"');
});

test('compileGatewayMessageText prefixes file refs once and preserves body text', () => {
  assert.equal(
    compileGatewayMessageText('hello', [
      { relativePath: 'docs/readme.md' },
      { relativePath: 'docs/my notes.md' },
    ]),
    '@docs/readme.md @"docs/my notes.md"\n---\nhello',
  );
  assert.equal(
    compileGatewayMessageText('', [
      { relativePath: 'docs/readme.md' },
    ]),
    '@docs/readme.md',
  );
});

test('buildGatewayDirectSendAck maps raw gateway status into Tracevane ack/runtime', () => {
  const ack = buildGatewayDirectSendAck({
    sessionKey: 'session-1',
    sessionId: 'abc',
    requestId: 'req-1',
    createdAt: '2026-04-08T00:00:00.000Z',
    rawStatus: 'ok',
    rawRunId: '',
  });
  assert.equal(ack.status, 'duplicate_completed');
  assert.equal(ack.runId, 'req-1');
  assert.equal(ack.runtime.activeRunId, null);
  assert.equal(ack.runtime.state, 'completed');
});

test('buildGatewayDirectAbortResponse reports no_active_run when gateway reports nothing aborted', () => {
  const payload = buildGatewayDirectAbortResponse({
    sessionKey: 'session-1',
    runIds: [],
    aborted: false,
    emittedAt: '2026-04-08T00:00:00.000Z',
    lastAckAt: '2026-04-08T00:00:00.000Z',
  });
  assert.equal(payload.hadActiveRun, false);
  assert.equal(payload.runtime.state, 'idle');
  assert.equal(payload.runtime.lastErrorCode, 'no_active_run');
  assert.equal(payload.runtime.lastErrorMessage, 'There is no active run to abort.');
});
