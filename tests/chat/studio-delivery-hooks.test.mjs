import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  buildStudioBeforeToolCallResult,
} from '../../dist/lib/studio-delivery-hooks.js';
import {
  resetStudioChatManagementPolicyState,
  setStudioChatGlobalHostManagementExecEnabled,
  setStudioChatSessionHostManagementExecEnabled,
} from '../../dist/lib/studio-chat-management-policy.js';

const STUDIO_WEBCHAT_CONTEXT = {
  sessionKey: 'agent:main:webchat:direct:studio-test',
  channelId: 'webchat',
};

test('buildStudioBeforeToolCallResult blocks management tools in Studio private chat', () => {
  const result = buildStudioBeforeToolCallResult({
    toolName: 'gateway',
    toolParams: { action: 'config.get' },
    ...STUDIO_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildStudioBeforeToolCallResult blocks openclaw host commands in Studio private chat', () => {
  const result = buildStudioBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'openclaw gateway status 2>&1 | head -20',
    },
    ...STUDIO_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildStudioBeforeToolCallResult blocks kill-based host lifecycle commands in Studio private chat', () => {
  const result = buildStudioBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'kill -USR1 70552',
    },
    ...STUDIO_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildStudioBeforeToolCallResult allows workspace-local exec commands in Studio private chat', () => {
  const result = buildStudioBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'pwd && ls src | head -20',
    },
    ...STUDIO_WEBCHAT_CONTEXT,
  });

  assert.equal(result, undefined);
});

test('buildStudioBeforeToolCallResult only allows host-management exec when global and session switches are both enabled', () => {
  resetStudioChatManagementPolicyState();

  const command = 'openclaw gateway status 2>&1 | head -20';
  const readResult = () => buildStudioBeforeToolCallResult({
    toolName: 'exec',
    toolParams: { command },
    ...STUDIO_WEBCHAT_CONTEXT,
  });

  assert.deepEqual(readResult(), {
    block: true,
    blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });

  setStudioChatGlobalHostManagementExecEnabled(true);
  assert.deepEqual(readResult(), {
    block: true,
    blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });

  resetStudioChatManagementPolicyState();
  setStudioChatSessionHostManagementExecEnabled(STUDIO_WEBCHAT_CONTEXT.sessionKey, true);
  assert.deepEqual(readResult(), {
    block: true,
    blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });

  setStudioChatGlobalHostManagementExecEnabled(true);
  assert.equal(readResult(), undefined);

  resetStudioChatManagementPolicyState();
});
