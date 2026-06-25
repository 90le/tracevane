import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  buildTracevaneBeforeToolCallResult,
} from '../../dist/lib/tracevane-delivery-hooks.js';

const TRACEVANE_AGENT_CHAT_CONTEXT = {
  sessionKey: 'agent:main:agent-chat:direct:tracevane-test',
  channelId: 'agent-chat',
};

test('buildTracevaneBeforeToolCallResult blocks management tools in Tracevane Agent Chat', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'gateway',
    toolParams: { action: 'config.get' },
    ...TRACEVANE_AGENT_CHAT_CONTEXT,
  });

  assert.deepEqual(result, {
    block: true,
    blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
  });
});

test('buildTracevaneBeforeToolCallResult does not treat shell commands as Chat-level controls', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'openclaw gateway status 2>&1 | head -20',
    },
    ...TRACEVANE_AGENT_CHAT_CONTEXT,
  });

  assert.equal(result, undefined);
});


test('buildTracevaneBeforeToolCallResult allows workspace-local exec commands in Tracevane Agent Chat', () => {
  const result = buildTracevaneBeforeToolCallResult({
    toolName: 'exec',
    toolParams: {
      command: 'pwd && ls src | head -20',
    },
    ...TRACEVANE_AGENT_CHAT_CONTEXT,
  });

  assert.equal(result, undefined);
});
