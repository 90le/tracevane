import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStandaloneStudioConfig } from '../../dist/apps/api/config.js';
import { loadGatewayAuthContext } from '../../dist/apps/api/modules/chat/gateway-auth.js';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

test('gateway auth context requests full operator scopes even when persisted device auth is read-only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-gateway-auth-context-'));
  writeJson(path.join(root, 'openclaw.json'), {
    gateway: {
      auth: {
        token: 'shared-token',
      },
    },
  });
  writeJson(path.join(root, 'identity', 'device-auth.json'), {
    deviceId: 'device-1',
    tokens: {
      operator: {
        scopes: ['operator.read'],
      },
    },
  });
  writeJson(path.join(root, 'identity', 'device.json'), {
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\\nmock\\n-----END PRIVATE KEY-----',
  });
  writeJson(path.join(root, 'devices', 'paired.json'), {
    'device-1': {
      publicKey: 'mock-public-key',
    },
  });

  const config = createStandaloneStudioConfig({
    openclawRoot: root,
    openclawConfigFile: path.join(root, 'openclaw.json'),
  });
  const auth = loadGatewayAuthContext(config);

  assert.equal(auth.gatewayToken, 'shared-token');
  assert.ok(auth.scopes.includes('operator.read'));
  assert.ok(auth.scopes.includes('operator.write'));
  assert.ok(auth.scopes.includes('operator.admin'));
});
