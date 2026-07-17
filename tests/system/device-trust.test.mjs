import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  approveDeviceTrustRequest,
  getDeviceTrustSnapshot,
  maybeAutoApproveTracevaneHelperPairing,
  repairTracevaneHelperDeviceTrust,
} from '../../dist/apps/api/modules/system/device-trust.js';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-device-trust-'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createConfig(root) {
  return {
    pluginId: 'tracevane',
    pluginName: 'Tracevane',
    version: '0.1.0',
    port: 3760,
    autoStart: true,
    openclawRoot: root,
    openclawConfigFile: path.join(root, 'openclaw.json'),
    projectRoot: '/tmp/tracevane-extension',
    webDistDir: '/tmp/tracevane-extension/apps/web/dist',
    gatewayPort: 31879,
    gatewayWsUrl: 'ws://127.0.0.1:31879',
    gatewayControlUiBasePath: '',
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: '/tracevane' },
    },
  };
}

function writeFakeOpenClawCommand(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const runnerPath = path.join(binDir, 'fake-openclaw.cjs');
  fs.writeFileSync(
    runnerPath,
    `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TRACEVANE_FAKE_OPENCLAW_LOG, JSON.stringify(args) + '\\n', 'utf8');
if (args[0] === 'devices' && args[1] === 'approve' && args[2]) {
  process.stdout.write(JSON.stringify({ approved: args[2] }));
  process.exit(0);
}
process.stderr.write('unexpected args: ' + JSON.stringify(args));
process.exit(2);
`,
    'utf8',
  );
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(binDir, 'openclaw.cmd'),
      `@echo off\r\n"${process.execPath}" "%~dp0fake-openclaw.cjs" %*\r\n`,
      'utf8',
    );
    return;
  }
  const commandPath = path.join(binDir, 'openclaw');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env node\n${fs.readFileSync(runnerPath, 'utf8')}`,
    { encoding: 'utf8', mode: 0o755 },
  );
  fs.chmodSync(commandPath, 0o755);
}

test('device trust approval launches the platform-native OpenClaw command', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane device trust 测试 '));
  const binDir = path.join(root, 'OpenClaw CLI bin');
  const logPath = path.join(root, 'openclaw-calls.jsonl');
  const previousPath = process.env.PATH;
  const previousLog = process.env.TRACEVANE_FAKE_OPENCLAW_LOG;
  writeFakeOpenClawCommand(binDir);
  process.env.PATH = [binDir, previousPath || ''].filter(Boolean).join(path.delimiter);
  process.env.TRACEVANE_FAKE_OPENCLAW_LOG = logPath;

  try {
    const config = createConfig(root);
    writeJson(path.join(root, 'identity', 'device-auth.json'), {
      version: 1,
      deviceId: 'device-platform-cli',
      tokens: {},
    });
    writeJson(path.join(root, 'devices', 'pending.json'), {
      pending: {
        requestId: 'request-auto',
        deviceId: 'device-platform-cli',
        role: 'operator',
        clientId: 'cli',
        clientMode: 'backend',
        ts: Date.now(),
      },
    });

    const manual = await approveDeviceTrustRequest(config, { requestId: 'request-manual' });
    assert.equal(manual.ok, true);
    assert.equal(await maybeAutoApproveTracevaneHelperPairing(config), true);
    const repair = await repairTracevaneHelperDeviceTrust(config);
    assert.equal(repair.ok, true);
    assert.equal(repair.approvedRequestId, 'request-auto');

    const calls = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => args.join(' ') === 'devices approve request-manual'));
    assert.equal(calls.filter((args) => args.join(' ') === 'devices approve request-auto').length, 2);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.TRACEVANE_FAKE_OPENCLAW_LOG;
    else process.env.TRACEVANE_FAKE_OPENCLAW_LOG = previousLog;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

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
