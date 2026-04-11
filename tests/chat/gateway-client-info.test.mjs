import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GATEWAY_BROWSER_CLIENT_ID,
  resolveGatewayBrowserClientId,
} from '../../dist/lib/gateway-client-info.js';

test('gateway browser client id defaults to a host-recognized control-ui id', () => {
  assert.equal(DEFAULT_GATEWAY_BROWSER_CLIENT_ID, 'openclaw-control-ui');
  assert.equal(resolveGatewayBrowserClientId(), 'openclaw-control-ui');
  assert.equal(resolveGatewayBrowserClientId(''), 'openclaw-control-ui');
});

test('gateway browser client id preserves recognized protocol ids and normalizes unknown ids', () => {
  assert.equal(resolveGatewayBrowserClientId('webchat-ui'), 'webchat-ui');
  assert.equal(resolveGatewayBrowserClientId('openclaw-control-ui'), 'openclaw-control-ui');
  assert.equal(resolveGatewayBrowserClientId('openclaw-studio'), 'openclaw-control-ui');
});
