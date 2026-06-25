import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChatSessionPermissions } from '../../dist/apps/api/modules/chat/session-policy.js';
import {
  buildTracevaneManagedRowFromRegistry,
  buildTracevaneManagedSessionRow,
} from '../../dist/apps/api/modules/chat/session-model.js';

test('observed_external remains read-only', () => {
  const permissions = buildChatSessionPermissions('observed_external');
  assert.equal(permissions.writable, false);
  assert.equal(permissions.canSend, false);
  assert.equal(permissions.canAbort, false);
  assert.equal(permissions.canReset, false);
  assert.equal(permissions.visibleInFrontend, true);
  assert.equal(permissions.visibleInMvpRail, false);
});

test('tracevane registry restore preserves sessionId', () => {
  const created = buildTracevaneManagedSessionRow('main', 'Tracevane chat · main', true);
  assert.ok(created.sessionId);

  const restored = buildTracevaneManagedRowFromRegistry({
    key: created.key,
    agentId: created.agentId,
    sessionId: created.sessionId,
    label: created.label,
    createdAt: created.updatedAt,
    updatedAt: created.updatedAt,
  }, true);

  assert.equal(restored.sessionId, created.sessionId);
  assert.equal(restored.key, created.key);
  assert.equal(restored.kind, 'tracevane_managed');
});

test('tracevane registry restore defaults missing runtime target to native Codex', () => {
  const restored = buildTracevaneManagedRowFromRegistry({
    key: 'agent:main:agent-chat:direct:tracevane-legacy-no-runtime',
    agentId: 'main',
    sessionId: 'session-legacy',
    label: 'Legacy Tracevane chat',
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  }, true);

  assert.deepEqual(restored.runtimeTarget, {
    adapterKind: 'native-cli',
    agent: 'codex',
    model: null,
    workDir: null,
    permissionMode: null,
  });
  assert.equal(restored.source.channel, 'agent-chat');
});

test('legacy webchat tracevane registry restore keeps the OpenClaw compatibility runtime', () => {
  const restored = buildTracevaneManagedRowFromRegistry({
    key: 'agent:main:webchat:direct:tracevane-legacy-webchat',
    agentId: 'main',
    sessionId: 'session-legacy-webchat',
    label: 'Legacy WebChat key',
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  }, true);

  assert.equal(restored.source.channel, 'webchat');
  assert.equal(restored.deliveryContext.channel, 'webchat');
  assert.equal(restored.runtimeTarget.adapterKind, 'openclaw-gateway');
  assert.equal(restored.runtimeTarget.agent, 'main');
});
