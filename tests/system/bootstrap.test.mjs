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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studio-bootstrap-'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createConfig(root) {
  return {
    pluginId: 'studio',
    pluginName: 'OpenClaw Studio',
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
        allowedOrigins: ['http://127.0.0.1:31879'],
      },
    },
    plugins: {
      allow: ['discord'],
      load: {
        paths: ['/tmp/another-extension'],
      },
      entries: {
        studio: {
          enabled: false,
        },
      },
    },
  });

  const repaired = repairSystemBootstrap(config);
  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));

  assert.equal(repaired.ok, true);
  assert.equal(repaired.changed, true);
  assert.ok(repaired.changedKeys.includes('plugins.entries.studio.enabled'));
  assert.ok(repaired.changedKeys.includes('plugins.allow'));
  assert.ok(repaired.changedKeys.includes('plugins.load.paths'));
  assert.ok(repaired.changedKeys.includes('gateway.bind'));
  assert.ok(repaired.changedKeys.includes('gateway.auth.token'));
  assert.equal(nextConfig.plugins.entries.studio.enabled, true);
  assert.ok(nextConfig.plugins.allow.includes('studio'));
  assert.ok(nextConfig.plugins.load.paths.includes(config.projectRoot));
  assert.equal(nextConfig.gateway.bind, 'loopback');
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

test('bootstrap repair fixes half-enabled dreaming by selecting memory-core', () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      slots: {
        memory: 'none',
      },
      entries: {
        'memory-core': {
          enabled: false,
          config: {
            dreaming: {
              enabled: true,
            },
          },
        },
      },
    },
  });

  const snapshot = getSystemBootstrapSnapshot(config, false);
  assert.ok(snapshot.checks.some((check) => check.id === 'dreaming-memory-slot' && check.level === 'error'));

  const repaired = repairSystemBootstrap(config);
  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, 'utf8'));

  assert.equal(repaired.changed, true);
  assert.ok(repaired.changedKeys.includes('plugins.slots.memory'));
  assert.ok(repaired.changedKeys.includes('plugins.entries.memory-core.enabled'));
  assert.equal(nextConfig.plugins.slots.memory, 'memory-core');
  assert.equal(nextConfig.plugins.entries['memory-core'].enabled, true);
});
