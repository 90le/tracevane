import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

function writeOpenClawConfig(root) {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(path.join(root, 'agents', 'main', 'sessions'), { recursive: true });
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

async function createContextForRoot(root) {
  const config = createStandaloneStudioConfig({
    port: 0,
    openclawRoot: root,
    gatewayWsUrl: 'ws://127.0.0.1:1',
  });
  return createStudioContext({
    config,
    logger: createLogger(),
  });
}

test('bootstrap and local-only session lists rebuild a stale signed sqlite catalog from registry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-session-catalog-recovery-'));
  let context = null;
  let database = null;
  try {
    writeOpenClawConfig(root);
    context = await createContextForRoot(root);
    const first = await context.services.chat.createSession('main', {});
    const second = await context.services.chat.createSession('main', {});

    await context.services.chat.getBootstrap({ recentLimit: 40 });

    database = new DatabaseSync(path.join(root, 'studio', 'chat.sqlite'));
    database.prepare('DELETE FROM session_rows WHERE session_key = ?').run(second.session.key);
    const staleCount = database.prepare('SELECT COUNT(*) AS count FROM session_rows').get().count;
    assert.equal(staleCount < 2, true);

    const bootstrap = await context.services.chat.getBootstrap({ recentLimit: 40 });
    assert.equal(bootstrap.sessions.some((row) => row.key === first.session.key), true);
    assert.equal(bootstrap.sessions.some((row) => row.key === second.session.key), true);

    const localOnly = await context.services.chat.listSessions('main', {
      localOnly: true,
      includeDerivedTitles: false,
      includeLastMessage: false,
      limit: 40,
    });
    assert.equal(localOnly.sessions.some((row) => row.key === first.session.key), true);
    assert.equal(localOnly.sessions.some((row) => row.key === second.session.key), true);
  } finally {
    try {
      database?.close?.();
    } catch {}
    try {
      context?.services?.chat?.dispose?.();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('registry writes merge against fresh disk state from another studio context', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-session-registry-merge-'));
  let firstContext = null;
  let secondContext = null;
  try {
    writeOpenClawConfig(root);
    firstContext = await createContextForRoot(root);
    const first = await firstContext.services.chat.createSession('main', {});

    secondContext = await createContextForRoot(root);
    const second = await secondContext.services.chat.createSession('main', {});
    const third = await firstContext.services.chat.createSession('main', {});

    const registry = JSON.parse(fs.readFileSync(path.join(root, 'studio', 'chat-sessions.json'), 'utf-8'));
    assert.equal(Boolean(registry[first.session.key]), true);
    assert.equal(Boolean(registry[second.session.key]), true);
    assert.equal(Boolean(registry[third.session.key]), true);
  } finally {
    try {
      firstContext?.services?.chat?.dispose?.();
    } catch {}
    try {
      secondContext?.services?.chat?.dispose?.();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});
