import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createStandaloneStudioConfig,
  createStudioConfig,
  isStudioGatewayEnabled,
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
  const config = createStudioConfig(createFakePluginApi(), {
    apiPort: 3760,
    autoStart: true,
  });

  assert.equal(config.transport.standalone.enabled, true);
  assert.equal(config.transport.gateway.enabled, true);
  assert.equal(config.transport.gateway.basePath, '/studio');
  assert.equal(isStudioGatewayEnabled(config), true);
});

test('plugin runtime still allows gateway exposure to be disabled explicitly', () => {
  const config = createStudioConfig(createFakePluginApi(), {
    transport: {
      gateway: {
        enabled: false,
        basePath: 'nested/studio/',
      },
    },
  });

  assert.equal(config.transport.gateway.enabled, false);
  assert.equal(config.transport.gateway.basePath, '/nested/studio');
  assert.equal(isStudioGatewayEnabled(config), false);
});

test('plugin runtime reads gateway port from openclaw.json when host config snapshot is stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-config-'));
  fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
    gateway: {
      port: 31879,
      controlUi: {
        basePath: '/gateway-ui',
      },
    },
  }));

  const config = createStudioConfig({
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
    const config = createStudioConfig({
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
  const config = createStandaloneStudioConfig({
    openclawRoot: '/tmp/openclaw-state',
    openclawConfigFile: '/tmp/openclaw-state/openclaw.json',
  });

  assert.equal(config.transport.standalone.enabled, true);
  assert.equal(config.transport.gateway.enabled, false);
});
