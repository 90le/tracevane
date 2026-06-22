import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getSystemBootstrapSnapshot,
  repairSystemBootstrap,
} from '../../dist/apps/api/modules/system/bootstrap.js';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-bootstrap-'));
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

test('bootstrap snapshot reports missing critical config on fresh state', () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, {});

  const snapshot = getSystemBootstrapSnapshot(config, false);

  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.autoApplied, false);
  assert.ok(snapshot.checks.some((check) => check.id === 'plugin-load-path' && check.level !== 'ok'));
  assert.ok(snapshot.checks.some((check) => check.id === 'gateway-auth-token' && check.level === 'error'));
});

test('bootstrap treats configured gateway auth SecretRefs as present', () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, {
    gateway: {
      auth: {
        mode: 'token',
        token: {
          source: 'env',
          provider: 'default',
          id: 'OPENCLAW_GATEWAY_TOKEN',
        },
      },
    },
  });

  const snapshot = getSystemBootstrapSnapshot(config, false);

  assert.ok(snapshot.checks.some((check) => check.id === 'gateway-auth-token' && check.level === 'ok'));
});

test('bootstrap repair writes safe defaults without clobbering existing config', () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, {
    gateway: {
      bind: 'legacy-loopback',
      auth: {
        mode: 'token',
      },
      controlUi: {
        enabled: false,
        allowedOrigins: ['http://127.0.0.1:31879'],
      },
    },
    plugins: {
      allow: ['discord'],
      installs: {
        tracevane: {
          installPath: '/tmp/tracevane.prev',
        },
      },
      load: {
        paths: ['/tmp/another-extension'],
      },
      entries: {
        tracevane: {
          enabled: false,
        },
      },
    },
  });

  const repaired = repairSystemBootstrap(config);
  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));

  assert.equal(repaired.ok, true);
  assert.equal(repaired.changed, true);
  assert.ok(repaired.changedKeys.includes('plugins.entries.tracevane.enabled'));
  assert.ok(repaired.changedKeys.includes('plugins.allow'));
  assert.ok(repaired.changedKeys.includes('plugins.installs.tracevane'));
  assert.ok(repaired.changedKeys.includes('plugins.load.paths'));
  assert.ok(repaired.changedKeys.includes('gateway.bind'));
  assert.ok(repaired.changedKeys.includes('gateway.controlUi.enabled'));
  assert.ok(repaired.changedKeys.includes('gateway.auth.token'));
  assert.equal(nextConfig.plugins.entries.tracevane.enabled, true);
  assert.ok(nextConfig.plugins.allow.includes('tracevane'));
  assert.equal(nextConfig.plugins.installs, undefined);
  assert.ok(nextConfig.plugins.load.paths.includes(config.projectRoot));
  assert.equal(nextConfig.gateway.bind, 'loopback');
  assert.equal(nextConfig.gateway.controlUi.enabled, true);
  assert.ok(typeof nextConfig.gateway.auth.token === 'string' && nextConfig.gateway.auth.token.length > 10);
  assert.ok(nextConfig.gateway.controlUi.allowedOrigins.includes('http://localhost:31879'));
  assert.equal(repaired.snapshot.ready, true);
});

test('bootstrap repair disables docker sandbox defaults when docker is unavailable', () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        sandbox: {
          mode: 'all',
          backend: 'docker',
        },
      },
      list: [
        {
          id: 'main',
          sandbox: {
            mode: 'all',
            backend: 'docker',
          },
        },
        {
          id: 'ops',
          sandbox: {
            mode: 'agent',
            backend: 'ssh',
          },
        },
      ],
    },
  });

  const originalPath = process.env.PATH;
  process.env.PATH = path.join(root, 'missing-bin');
  try {
    const repaired = repairSystemBootstrap(config);
    const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));
    assert.ok(repaired.changedKeys.includes('agents.defaults.sandbox.mode'));
    assert.equal(nextConfig.agents.defaults.sandbox.mode, 'off');
    assert.equal(nextConfig.agents.list[0].sandbox.mode, 'off');
    assert.equal(nextConfig.agents.list[1].sandbox.mode, 'agent');
  } finally {
    process.env.PATH = originalPath;
  }
});
