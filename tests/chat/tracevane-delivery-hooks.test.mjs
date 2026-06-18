import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  buildTracevaneBeforeToolCallResult,
} from '../../dist/lib/tracevane-delivery-hooks.js';
import {
  resetTracevaneChatManagementPolicyState,
  setTracevaneChatGlobalHostManagementExecEnabled,
  setTracevaneChatSessionHostManagementExecEnabled,
} from '../../dist/lib/tracevane-chat-management-policy.js';

const TRACEVANE_WEBCHAT_CONTEXT = {
  sessionKey: 'agent:main:webchat:direct:tracevane-test',
  channelId: 'webchat',
};

test('buildTracevaneBeforeToolCallResult blocks management tools in Tracevane private chat', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'gateway',
    toolParams: { action: 'config.get' },
    ...TRACEVANE_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildTracevaneBeforeToolCallResult blocks openclaw host commands in Tracevane private chat', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'openclaw gateway status 2>&1 | head -20',
    },
    ...TRACEVANE_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildTracevaneBeforeToolCallResult blocks kill-based host lifecycle commands in Tracevane private chat', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'kill -USR1 70552',
    },
    ...TRACEVANE_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildTracevaneBeforeToolCallResult allows workspace-local exec commands in Tracevane private chat', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'pwd && ls src | head -20',
    },
    ...TRACEVANE_WEBCHAT_CONTEXT,
  });

  assert.equal(result, undefined);
});

test('buildTracevaneBeforeToolCallResult only allows host-management exec when global and session switches are both enabled', () => {
  resetTracevaneChatManagementPolicyState();

  const command = 'openclaw gateway status 2>&1 | head -20';
  const readResult = () => buildTracevaneBeforeToolCallResult({
    toolName: 'exec',
    toolParams: { command },
    ...TRACEVANE_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(readResult(), {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });

  setTracevaneChatGlobalHostManagementExecEnabled(true);
  assert.deepEqual(readResult(), {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });

  resetTracevaneChatManagementPolicyState();
  setTracevaneChatSessionHostManagementExecEnabled(TRACEVANE_WEBCHAT_CONTEXT.sessionKey, true);
  assert.deepEqual(readResult(), {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });

  setTracevaneChatGlobalHostManagementExecEnabled(true);
  assert.equal(readResult(), undefined);

  resetTracevaneChatManagementPolicyState();
});
