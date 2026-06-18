import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createTracevaneChatSessionCatalogStore } from '../../dist/apps/api/modules/chat/session-catalog-store.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-catalog-store-'));
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

function makeSession(key, overrides = {}) {
  return {
    key,
    agentId: key.split(':')[1] || 'main',
    sessionId: `${key}-id`,
    kind: 'tracevane_managed',
    label: key,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: '2026-04-22T10:00:00.000Z',
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
      autoLabel: null,
    },
    source: {
      source: 'tracevane',
      channel: 'webchat',
      surface: 'tracevane-chat',
      originLabel: 'Tracevane managed',
    },
    deliveryContext: {
      channel: 'webchat',
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: {
      writable: true,
      canSend: true,
      canAbort: true,
      canReset: true,
      canDelete: true,
      canInject: false,
      visibleInFrontend: true,
      visibleInMvpRail: true,
    },
    runtime: {
      gatewayConnected: false,
      sessionWritable: true,
      activeRunId: null,
      state: 'idle',
      lastEventAt: null,
      lastAckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    ...overrides,
  };
}

function runJsonFallbackScript(root, script) {
  const wrapper = `
    import { createTracevaneChatSessionCatalogStore } from '${path.resolve(
      testDir,
      '../../dist/apps/api/modules/chat/session-catalog-store.js',
    ).replaceAll('\\', '/')}';

    const config = ${JSON.stringify(makeConfig(root))};
    const store = createTracevaneChatSessionCatalogStore(config);

    ${script}
  `;
  return execFileSync(process.execPath, [
    '--no-experimental-sqlite',
    '--input-type=module',
    '-e',
    wrapper,
  ], { encoding: 'utf-8', timeout: 10_000 }).trim();
}

test('sqlite: session catalog store uses sqlite when node:sqlite is available', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatSessionCatalogStore(makeConfig(root));
    assert.equal(store.backend, 'sqlite');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: writeSession + readAllSessions roundtrip rows', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatSessionCatalogStore(makeConfig(root));
    store.writeSession(makeSession('agent:main:webchat:direct:one'));
    store.writeSession(makeSession('agent:backend:webchat:direct:two', { agentId: 'backend' }));

    const rows = store.readAllSessions();
    assert.equal(rows.length, 2);
    assert.equal(store.readAgentSessions('main').length, 1);
    assert.equal(store.readAgentSessions('backend').length, 1);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: replaceAgentSessions refreshes one agent slice without touching others', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatSessionCatalogStore(makeConfig(root));
    store.writeSession(makeSession('agent:main:webchat:direct:one'));
    store.writeSession(makeSession('agent:backend:webchat:direct:two', { agentId: 'backend' }));
    store.setSignature('complete-catalog-signature');

    store.replaceAgentSessions('main', [
      makeSession('agent:main:webchat:direct:three', { updatedAt: '2026-04-22T11:00:00.000Z' }),
    ]);

    const allKeys = store.readAllSessions().map((row) => row.key).sort();
    assert.deepEqual(allKeys, [
      'agent:backend:webchat:direct:two',
      'agent:main:webchat:direct:three',
    ]);
    assert.equal(store.readSnapshot().signature, null);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: session catalog store still works without node:sqlite', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      console.log(store.backend);
      store.writeSession(${JSON.stringify(makeSession('agent:main:webchat:direct:json'))});
      console.log(JSON.stringify(store.readAllSessions().map((row) => row.key)));
    `).split('\n');
    assert.equal(output[0], 'json');
    assert.deepEqual(JSON.parse(output[1]), ['agent:main:webchat:direct:json']);
  } finally {
    cleanupTempRoot(root);
  }
});
