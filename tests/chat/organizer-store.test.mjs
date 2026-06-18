import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createTracevaneChatOrganizerStore } from '../../dist/apps/api/modules/chat/organizer-store.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-store-'));
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

function makeOrganizer() {
  return {
    folders: [
      {
        id: 'folder-a',
        title: 'Folder A',
        parentId: null,
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:00:00.000Z',
        collapsed: false,
      },
    ],
    folderOrder: ['folder-a'],
    childFolderOrder: {},
    rootSessionOrder: ['agent:main:webchat:direct:test'],
    folderSessionOrder: {
      'folder-a': [],
    },
    sessionFolderMap: {
      'agent:main:webchat:direct:test': null,
    },
  };
}

function runJsonFallbackScript(root, script) {
  const wrapper = `
    import { createTracevaneChatOrganizerStore } from '${path.resolve(
      testDir,
      '../../dist/apps/api/modules/chat/organizer-store.js',
    ).replaceAll('\\', '/')}';

    const config = ${JSON.stringify(makeConfig(root))};
    const store = createTracevaneChatOrganizerStore(config);

    ${script}
  `;
  return execFileSync(process.execPath, [
    '--no-experimental-sqlite',
    '--input-type=module',
    '-e',
    wrapper,
  ], { encoding: 'utf-8', timeout: 10_000 }).trim();
}

test('sqlite: organizer store roundtrips the normalized organizer state', () => {
  const root = makeTempRoot();
  try {
    const store = createTracevaneChatOrganizerStore(makeConfig(root));
    const organizer = makeOrganizer();
    store.write(organizer);
    assert.deepEqual(store.read(), organizer);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: organizer store still works without node:sqlite', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      const organizer = ${JSON.stringify(makeOrganizer())};
      store.write(organizer);
      console.log(JSON.stringify(store.read()));
    `);
    assert.deepEqual(JSON.parse(output), makeOrganizer());
  } finally {
    cleanupTempRoot(root);
  }
});
