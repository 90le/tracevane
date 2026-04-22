import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createStudioChatHistoryIndexStore } from '../../dist/apps/api/modules/chat/history-index.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'history-index-store-'));
}

function cleanupTempRoot(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function makeConfig(root) {
  return {
    pluginId: 'studio',
    pluginName: 'OpenClaw Studio',
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

function makeMessage(id, role, text, createdAt) {
  return {
    id,
    role,
    text,
    createdAt,
    source: 'history',
    runId: null,
    truncated: false,
    omitted: false,
    aborted: false,
    stopReason: null,
    resources: [],
    toolCalls: [],
  };
}

function runJsonFallbackScript(root, script) {
  const wrapper = `
    import { createStudioChatHistoryIndexStore } from '${path.resolve(
      testDir,
      '../../dist/apps/api/modules/chat/history-index.js',
    ).replaceAll('\\', '/')}';

    const config = ${JSON.stringify(makeConfig(root))};
    const store = createStudioChatHistoryIndexStore(config);

    ${script}
  `;
  return execFileSync(process.execPath, [
    '--no-experimental-sqlite',
    '--input-type=module',
    '-e',
    wrapper,
  ], { encoding: 'utf-8', timeout: 10_000 }).trim();
}

const messages = [
  makeMessage('m1', 'user', 'older hello', '2026-04-21T09:00:00.000Z'),
  makeMessage('m2', 'assistant', 'contains keyword alpha', '2026-04-21T09:01:00.000Z'),
  makeMessage('m3', 'assistant', '```sql\\nSELECT 1\\n```', '2026-04-22T10:00:00.000Z'),
];

test('sqlite: history index store uses sqlite when available', () => {
  const root = makeTempRoot();
  try {
    const store = createStudioChatHistoryIndexStore(makeConfig(root));
    assert.equal(store.backend, 'sqlite');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: ensureIndex/search/date buckets roundtrip through the store', () => {
  const root = makeTempRoot();
  try {
    const store = createStudioChatHistoryIndexStore(makeConfig(root));
    const index = store.ensureIndex({
      sessionKey: 'agent:main:webchat:direct:test',
      messages,
      sourceSessionFile: null,
      sourceMtimeMs: null,
    });
    assert.equal(index.totalMessages, 3);
    assert.deepEqual(store.searchPositions(index, 'keyword alpha'), [1]);
    assert.deepEqual(
      store.buildDateBuckets(index).map((bucket) => bucket.day),
      ['2026-04-22', '2026-04-21'],
    );
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: history index store still works without node:sqlite', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      console.log(store.backend);
      const index = store.ensureIndex({
        sessionKey: 'agent:main:webchat:direct:test',
        messages: ${JSON.stringify(messages)},
        sourceSessionFile: null,
        sourceMtimeMs: null,
      });
      console.log(JSON.stringify({
        totalMessages: index.totalMessages,
        matches: store.searchPositions(index, 'keyword alpha'),
      }));
    `).split('\n');
    assert.equal(output[0], 'json');
    const payload = JSON.parse(output[1]);
    assert.equal(payload.totalMessages, 3);
    assert.deepEqual(payload.matches, [1]);
  } finally {
    cleanupTempRoot(root);
  }
});
