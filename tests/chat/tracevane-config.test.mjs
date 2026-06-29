import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createStandaloneTracevaneConfig,
  createTracevaneConfig,
  isTracevaneGatewayEnabled,
} from '../../dist/apps/api/config.js';

function createFakePluginApi() {
  return {
    config: {
      gateway: {
        port: 31879,
      },
    },
    resolvePath(input) {
      return input === '~/.openclaw' ? '/tmp/openclaw-state' : input;
    },
  };
}

test('plugin runtime defaults gateway exposure on when not explicitly configured', () => {
  const config = createTracevaneConfig(createFakePluginApi(), {
    apiPort: 3760,
    autoStart: true,
  });

  assert.equal(config.transport.standalone.enabled, true);
  assert.equal(config.transport.gateway.enabled, true);
  assert.equal(config.transport.preferredMode, 'standalone');
  assert.equal(config.transport.gateway.basePath, '/tracevane');
  assert.equal(isTracevaneGatewayEnabled(config), true);
});

test('plugin runtime still allows gateway exposure to be disabled explicitly', () => {
  const config = createTracevaneConfig(createFakePluginApi(), {
    transport: {
      gateway: {
        enabled: false,
        basePath: 'nested/tracevane/',
      },
    },
  });

  assert.equal(config.transport.gateway.enabled, false);
  assert.equal(config.transport.preferredMode, 'standalone');
  assert.equal(config.transport.gateway.basePath, '/nested/tracevane');
  assert.equal(isTracevaneGatewayEnabled(config), false);
});

test('plugin runtime can prefer gateway while preserving standalone 3760 fallback', () => {
  const config = createTracevaneConfig(createFakePluginApi(), {
    apiPort: 3760,
    autoStart: true,
    transport: {
      preferredMode: 'gateway',
      standalone: {
        enabled: true,
        port: 3760,
      },
      gateway: {
        enabled: true,
        basePath: '/tracevane',
      },
    },
  });

  assert.equal(config.transport.preferredMode, 'gateway');
  assert.equal(config.transport.standalone.enabled, true);
  assert.equal(config.transport.standalone.port, 3760);
  assert.equal(config.transport.gateway.enabled, true);
  assert.equal(config.transport.gateway.basePath, '/tracevane');
});

test('plugin runtime reads gateway port from openclaw.json when host config snapshot is stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-config-'));
  fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
    gateway: {
      port: 31879,
      controlUi: {
        basePath: '/gateway-ui',
      },
    },
  }));

  const config = createTracevaneConfig({
    config: {
      gateway: {
        port: 18789,
      },
    },
    resolvePath(input) {
      return input === '~/.openclaw' ? root : input;
    },
  }, {});

  assert.equal(config.gatewayPort, 31879);
  assert.equal(config.gatewayWsUrl, 'ws://127.0.0.1:31879');
  assert.equal(config.gatewayControlUiBasePath, '/gateway-ui');
});

test('plugin runtime falls back to HOME when resolvePath returns undefined', () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousHome = process.env.HOME;
  process.env.OPENCLAW_STATE_DIR = '';
  process.env.HOME = '/tmp/fallback-home';

  try {
    const config = createTracevaneConfig({
      config: {
        gateway: {
          port: 31879,
        },
      },
      resolvePath() {
        return undefined;
      },
    }, {});

    assert.equal(config.openclawRoot, '/tmp/fallback-home/.openclaw');
    assert.equal(
      config.openclawConfigFile,
      '/tmp/fallback-home/.openclaw/openclaw.json',
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test('standalone-only helper keeps gateway exposure off by default', () => {
  const config = createStandaloneTracevaneConfig({
    openclawRoot: '/tmp/openclaw-state',
    openclawConfigFile: '/tmp/openclaw-state/openclaw.json',
  });

  assert.equal(config.transport.standalone.enabled, true);
  assert.equal(config.transport.gateway.enabled, false);
  assert.equal(config.transport.preferredMode, 'standalone');
});

test('standalone helper preserves explicit project root outside openclaw state', () => {
  const config = createStandaloneTracevaneConfig({
    openclawRoot: '/tmp/openclaw-state',
    openclawConfigFile: '/tmp/openclaw-state/openclaw.json',
    projectRoot: '/opt/tracevane-extension',
  });

  assert.equal(config.openclawRoot, '/tmp/openclaw-state');
  assert.equal(config.projectRoot, '/opt/tracevane-extension');
  assert.equal(config.webDistDir, '/opt/tracevane-extension/apps/web/dist');
});
