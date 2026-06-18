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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-gateway-auth-context-'));
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

test('gateway auth context resolves env SecretRef tokens', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-gateway-auth-context-secretref-'));
  const oldToken = process.env.STUDIO_TEST_GATEWAY_TOKEN;
  process.env.STUDIO_TEST_GATEWAY_TOKEN = 'shared-secretref-token';
  try {
    writeJson(path.join(root, 'openclaw.json'), {
      gateway: {
        auth: {
          token: {
            source: 'env',
            provider: 'default',
            id: 'STUDIO_TEST_GATEWAY_TOKEN',
          },
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

    assert.equal(auth.gatewayToken, 'shared-secretref-token');
  } finally {
    if (oldToken == null) delete process.env.STUDIO_TEST_GATEWAY_TOKEN;
    else process.env.STUDIO_TEST_GATEWAY_TOKEN = oldToken;
  }
});

test('gateway auth context resolves file SecretRef tokens', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-gateway-auth-context-file-secretref-'));
  const secretFile = path.join(root, 'secrets.json');
  writeJson(secretFile, {
    gatewayAuthToken: 'shared-file-secretref-token',
  });
  writeJson(path.join(root, 'openclaw.json'), {
    secrets: {
      providers: {
        'studio-local': {
          source: 'file',
          path: secretFile,
          mode: 'json',
        },
      },
    },
    gateway: {
      auth: {
        token: {
          source: 'file',
          provider: 'studio-local',
          id: '/gatewayAuthToken',
        },
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

  assert.equal(auth.gatewayToken, 'shared-file-secretref-token');
});

test('gateway auth context resolves env SecretRefs from the OpenClaw env file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-gateway-auth-context-env-file-secretref-'));
  const oldToken = process.env.STUDIO_TEST_GATEWAY_ENV_FILE_TOKEN;
  delete process.env.STUDIO_TEST_GATEWAY_ENV_FILE_TOKEN;
  try {
    fs.writeFileSync(path.join(root, '.env'), 'STUDIO_TEST_GATEWAY_ENV_FILE_TOKEN=shared-env-file-token\n');
    writeJson(path.join(root, 'openclaw.json'), {
      gateway: {
        auth: {
          token: {
            source: 'env',
            provider: 'default',
            id: 'STUDIO_TEST_GATEWAY_ENV_FILE_TOKEN',
          },
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

    assert.equal(auth.gatewayToken, 'shared-env-file-token');
  } finally {
    if (oldToken == null) delete process.env.STUDIO_TEST_GATEWAY_ENV_FILE_TOKEN;
    else process.env.STUDIO_TEST_GATEWAY_ENV_FILE_TOKEN = oldToken;
  }
});
