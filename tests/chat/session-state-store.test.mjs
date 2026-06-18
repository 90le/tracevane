import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createTracevaneChatSessionStateStore } from '../../dist/apps/api/modules/chat/session-state-store.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-state-store-'));
}

function cleanupTempRoot(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function makeConfig(root) {
  return {
    pluginId: 'tracevane',
    pluginName: 'Tracevane',
    version: '0.1.0',
    port: 0,
    autoStart: false,
    openclawRoot: root,
    openclawConfigFile: path.join(root, 'config.json'),
    projectRoot: root,
    webDistDir: root,
    gatewayPort: 0,
    gatewayWsUrl: 'ws://127.0.0.1:0',
  };
}

function makeQueueItem(id) {
  return {
    id,
    sessionKey: 'agent:main:webchat:direct:test',
    clientRequestId: null,
    deliveryRequestId: `${id}-delivery`,
    text: 'hello',
    previewText: 'hello',
    createdAt: '2026-04-22T10:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
    status: 'queued',
    blockedReason: null,
  };
}

function runJsonFallbackScript(root, script) {
  const wrapper = `
    import { createTracevaneChatSessionStateStore } from '${path.resolve(
      testDir,
      '../../dist/apps/api/modules/chat/session-state-store.js',
    ).replaceAll('\\', '/')}';

    const config = ${JSON.stringify(makeConfig(root))};
    const store = createTracevaneChatSessionStateStore(config);

    ${script}
  `;
  return execFileSync(process.execPath, [
    '--no-experimental-sqlite',
    '--input-type=module',
    '-e',
    wrapper,
  ], { encoding: 'utf-8', timeout: 10_000 }).trim();
}

test('sqlite: session state store uses sqlite when available', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatSessionStateStore(makeConfig(root));
    assert.equal(store.backend, 'sqlite');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: write/read roundtrip persists queue and controls', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatSessionStateStore(makeConfig(root));
    store.write('agent:main:webchat:direct:test', {
      pendingQueue: [makeQueueItem('q1')],
      controls: {
        allowHostManagementExec: true,
        updatedAt: '2026-04-22T10:00:01.000Z',
      },
    });
    const result = store.read('agent:main:webchat:direct:test');
    assert.ok(result);
    assert.equal(result.pendingQueue.length, 1);
    assert.equal(result.controls.allowHostManagementExec, true);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: clear removes persisted state', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatSessionStateStore(makeConfig(root));
    store.write('agent:main:webchat:direct:test', {
      pendingQueue: [makeQueueItem('q1')],
      controls: {
        allowHostManagementExec: false,
        updatedAt: null,
      },
    });
    store.clear('agent:main:webchat:direct:test');
    assert.equal(store.read('agent:main:webchat:direct:test'), null);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: session state store still works without node:sqlite', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      console.log(store.backend);
      store.write('agent:main:webchat:direct:test', {
        pendingQueue: [${JSON.stringify(makeQueueItem('q1'))}],
        controls: { allowHostManagementExec: true, updatedAt: '2026-04-22T10:00:01.000Z' },
      });
      console.log(JSON.stringify(store.read('agent:main:webchat:direct:test')));
    `).split('\n');
    assert.equal(output[0], 'json');
    const result = JSON.parse(output[1]);
    assert.equal(result.pendingQueue.length, 1);
    assert.equal(result.controls.allowHostManagementExec, true);
  } finally {
    cleanupTempRoot(root);
  }
});
