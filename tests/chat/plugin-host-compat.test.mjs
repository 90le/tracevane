import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTracevaneManagedWebchatHostContext,
  resolvePluginHostContext,
} from '../../dist/lib/plugin-host-compat.js';

test('resolvePluginHostContext prefers explicit official host fields', () => {
  const resolved = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    channelId: 'webchat',
    messageProvider: 'telegram',
  });

  assert.equal(resolved.sessionKey, 'agent:main:webchat:direct:tracevane-test');
  assert.equal(resolved.channelId, 'webchat');
  assert.equal(resolved.source, 'explicit');
});

test('resolvePluginHostContext accepts messageProvider/messageChannel but keeps sessionKey fallback controlled', () => {
  const fromProvider = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
    messageProvider: 'WebChat',
  });
  assert.equal(fromProvider.channelId, 'webchat');
  assert.equal(fromProvider.source, 'explicit');

  const fromSessionKey = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
  });
  assert.equal(fromSessionKey.channelId, 'webchat');
  assert.equal(fromSessionKey.source, 'sessionKey');

  const externalSession = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:external-1',
  });
  assert.equal(externalSession.channelId, null);
  assert.equal(externalSession.source, 'none');
});

test('isTracevaneManagedWebchatHostContext only turns true for explicit or controlled Tracevane webchat contexts', () => {
  assert.equal(isTracevaneManagedWebchatHostContext({
    sessionKey: 'agent:main:webchat:direct:tracevane-test',
  }), true);
  assert.equal(isTracevaneManagedWebchatHostContext({
    sessionKey: 'agent:main:telegram:direct:tracevane-test',
    channelId: 'telegram',
  }), false);
  assert.equal(isTracevaneManagedWebchatHostContext({
    sessionKey: 'agent:main:webchat:direct:external-1',
  }), false);
});
