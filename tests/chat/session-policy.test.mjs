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
