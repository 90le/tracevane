import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isStudioManagedWebchatHostContext,
  resolvePluginHostContext,
} from '../../dist/lib/plugin-host-compat.js';

test('resolvePluginHostContext prefers explicit official host fields', () => {
  const resolved = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    channelId: 'webchat',
    messageProvider: 'telegram',
  });

  assert.equal(resolved.sessionKey, 'agent:main:webchat:direct:studio-test');
  assert.equal(resolved.channelId, 'webchat');
  assert.equal(resolved.source, 'explicit');
});

test('resolvePluginHostContext accepts messageProvider/messageChannel but keeps sessionKey fallback controlled', () => {
  const fromProvider = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    messageProvider: 'WebChat',
  });
  assert.equal(fromProvider.channelId, 'webchat');
  assert.equal(fromProvider.source, 'explicit');

  const fromSessionKey = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:studio-test',
  });
  assert.equal(fromSessionKey.channelId, 'webchat');
  assert.equal(fromSessionKey.source, 'sessionKey');

  const externalSession = resolvePluginHostContext({
    sessionKey: 'agent:main:webchat:direct:external-1',
  });
  assert.equal(externalSession.channelId, null);
  assert.equal(externalSession.source, 'none');
});

test('isStudioManagedWebchatHostContext only turns true for explicit or controlled Tracevane webchat contexts', () => {
  assert.equal(isStudioManagedWebchatHostContext({
    sessionKey: 'agent:main:webchat:direct:studio-test',
  }), true);
  assert.equal(isStudioManagedWebchatHostContext({
    sessionKey: 'agent:main:telegram:direct:studio-test',
    channelId: 'telegram',
  }), false);
  assert.equal(isStudioManagedWebchatHostContext({
    sessionKey: 'agent:main:webchat:direct:external-1',
  }), false);
});
