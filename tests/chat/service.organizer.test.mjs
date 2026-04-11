import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  createStandaloneStudioConfig,
  createStudioContext,
} from '../../dist/apps/api/index.js';

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function writeOpenClawConfig(root) {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
    gateway: {
      auth: {
        token: 'gateway-token-test',
      },
    },
    agents: {
      defaults: { workspace },
      list: [{ id: 'main', workspace, default: true }],
    },
  }, null, 2));
}

async function createContext(root) {
  const config = createStandaloneStudioConfig({
    port: await getFreePort(),
    openclawRoot: root,
    gatewayWsUrl: 'ws://127.0.0.1:1',
  });
  return createStudioContext({
    config,
    logger: createLogger(),
  });
}

test('organizer service creates folders, sorts them, moves sessions, and returns sessions to root when folder is deleted', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-organizer-service-'));
  try {
    writeOpenClawConfig(root);
    const context = await createContext(root);

    const createdSessionA = await context.services.chat.createSession('main', {});
    const createdSessionB = await context.services.chat.createSession('main', {});

    const folderA = await context.services.chat.createFolder({ title: 'Folder A' });
    const folderB = await context.services.chat.createFolder({ title: 'Folder B' });
    assert.deepEqual(folderB.organizer.folderOrder, [folderB.folder.id, folderA.folder.id]);

    const moved = await context.services.chat.patchFolder(folderA.folder.id, { move: 'top' });
    assert.deepEqual(moved.organizer.folderOrder, [folderA.folder.id, folderB.folder.id]);

    const assigned = await context.services.chat.assignSessionsToFolder({
      sessionKeys: [createdSessionA.session.key, createdSessionB.session.key],
      folderId: folderA.folder.id,
    });
    assert.equal(assigned.organizer.sessionFolderMap[createdSessionA.session.key], folderA.folder.id);
    assert.equal(assigned.organizer.sessionFolderMap[createdSessionB.session.key], folderA.folder.id);
    assert.deepEqual(assigned.organizer.folderSessionOrder[folderA.folder.id], [
      createdSessionA.session.key,
      createdSessionB.session.key,
    ]);

    const removedFromFolder = await context.services.chat.assignSessionsToFolder({
      sessionKeys: [createdSessionB.session.key],
      folderId: null,
    });
    assert.equal(removedFromFolder.organizer.sessionFolderMap[createdSessionB.session.key], null);
    assert.deepEqual(removedFromFolder.organizer.rootSessionOrder, [createdSessionB.session.key]);

    const deletedFolder = await context.services.chat.deleteFolder(folderA.folder.id);
    assert.equal(deletedFolder.ok, true);
    assert.equal(deletedFolder.organizer.folderOrder.includes(folderA.folder.id), false);
    assert.equal(deletedFolder.organizer.sessionFolderMap[createdSessionA.session.key], null);
    assert.deepEqual(deletedFolder.organizer.rootSessionOrder, [
      createdSessionA.session.key,
      createdSessionB.session.key,
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deleteSession removes organizer membership for deleted chats', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-organizer-delete-'));
  try {
    writeOpenClawConfig(root);
    const context = await createContext(root);

    const createdSession = await context.services.chat.createSession('main', {});
    const folder = await context.services.chat.createFolder({ title: 'Folder A' });
    await context.services.chat.assignSessionsToFolder({
      sessionKeys: [createdSession.session.key],
      folderId: folder.folder.id,
    });

    await context.services.chat.deleteSession(createdSession.session.key);
    const organizer = await context.services.chat.getOrganizer();

    assert.equal(organizer.organizer.sessionFolderMap[createdSession.session.key], undefined);
    assert.deepEqual(organizer.organizer.folderSessionOrder[folder.folder.id], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('organizer service can create child folders and rename them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-organizer-nested-'));
  try {
    writeOpenClawConfig(root);
    const context = await createContext(root);

    const parentFolder = await context.services.chat.createFolder({ title: 'Parent' });
    const childFolder = await context.services.chat.createFolder({
      title: 'Child',
      parentId: parentFolder.folder.id,
    });
    const createdSession = await context.services.chat.createSession('main', {});

    assert.equal(childFolder.folder.parentId, parentFolder.folder.id);
    assert.deepEqual(childFolder.organizer.childFolderOrder[parentFolder.folder.id], [childFolder.folder.id]);

    const assigned = await context.services.chat.assignSessionsToFolder({
      sessionKeys: [createdSession.session.key],
      folderId: childFolder.folder.id,
    });
    assert.equal(assigned.organizer.sessionFolderMap[createdSession.session.key], childFolder.folder.id);

    const renamed = await context.services.chat.patchFolder(childFolder.folder.id, { title: 'Child Renamed' });
    assert.equal(renamed.folder.title, 'Child Renamed');
    assert.equal(renamed.organizer.folders.find((folder) => folder.id === childFolder.folder.id)?.title, 'Child Renamed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
