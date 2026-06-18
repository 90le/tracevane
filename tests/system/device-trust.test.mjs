import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getDeviceTrustSnapshot } from '../../dist/apps/api/modules/system/device-trust.js';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studio-device-trust-'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createConfig(root) {
  return {
    pluginId: 'studio',
    pluginName: 'Tracevane',
    version: '0.1.0',
    port: 3760,
    autoStart: true,
    openclawRoot: root,
    openclawConfigFile: path.join(root, 'openclaw.json'),
    projectRoot: '/tmp/openclaw-studio-extension',
    webDistDir: '/tmp/openclaw-studio-extension/apps/web-vue/dist',
    gatewayPort: 31879,
    gatewayWsUrl: 'ws://127.0.0.1:31879',
    gatewayControlUiBasePath: '',
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: '/studio' },
    },
  };
}

test('device trust snapshot detects metadata repair drift for local helper', () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  const deviceId = 'dev-1';

  writeJson(path.join(root, 'identity', 'device-auth.json'), {
    version: 1,
    deviceId,
    tokens: {
      operator: {
        token: 'tok-1',
        scopes: ['operator.read'],
        updatedAtMs: 1,
      },
    },
  });
  writeJson(path.join(root, 'devices', 'paired.json'), {
    [deviceId]: {
      deviceId,
      platform: 'linux',
      deviceFamily: 'server',
      clientId: 'cli',
      clientMode: 'backend',
      approvedScopes: ['operator.read', 'operator.write'],
      approvedAtMs: 2,
      tokens: {
        operator: {
          token: 'tok-2',
          scopes: ['operator.read', 'operator.write'],
          rotatedAtMs: 3,
        },
      },
    },
  });
  writeJson(path.join(root, 'devices', 'pending.json'), {
    req1: {
      requestId: 'req1',
      deviceId,
      publicKey: 'pk',
      platform: 'linux',
      clientId: 'cli',
      clientMode: 'cli',
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      isRepair: true,
      ts: Date.now(),
    },
  });

  const snapshot = getDeviceTrustSnapshot(config);

  assert.equal(snapshot.helper.tokenInSync, false);
  assert.equal(snapshot.helper.metadataRepairPending, true);
  assert.equal(snapshot.helper.pairedDeviceFamily, 'server');
  assert.equal(snapshot.helper.pendingDeviceFamily, null);
  assert.ok(snapshot.notes.some((note) => note.includes('metadata repair pending')));
});
