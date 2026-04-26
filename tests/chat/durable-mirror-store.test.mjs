import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { createStudioChatDurableMirrorStore } from '../../dist/apps/api/modules/chat/durable-mirror-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'durable-mirror-test-'));
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

function makeMessage(id, role = 'assistant', text = 'hello') {
  return {
    id,
    role,
    text,
    createdAt: '2026-03-26T10:00:00.000Z',
    source: 'history',
    runId: null,
    truncated: false,
    omitted: false,
    aborted: false,
    stopReason: null,
  };
}

const SESSION_KEY = 'agent:main:webchat:direct:studio-test-session';

// ---------------------------------------------------------------------------
// Helper to run store operations in a child process with --no-experimental-sqlite
// so that loadSqliteDatabase() falls back to JSON.
// ---------------------------------------------------------------------------

function runJsonFallbackScript(root, script) {
  const wrapper = `
    import { createStudioChatDurableMirrorStore } from '${path.resolve(
      import.meta.dirname,
      '../../dist/apps/api/modules/chat/durable-mirror-store.js',
    ).replaceAll('\\', '/')}';

    const config = ${JSON.stringify(makeConfig(root))};
    const store = createStudioChatDurableMirrorStore(config);

    ${script}
  `;
  const result = execFileSync(process.execPath, [
    '--no-experimental-sqlite',
    '--input-type=module',
    '-e', wrapper,
  ], { encoding: 'utf-8', timeout: 10_000 });
  return result.trim();
}

function explainPlanDetails(db, sql, ...params) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params)
    .map((row) => String(row.detail || ''))
    .join('\n');
}

// ===========================================================================
// SQLite path tests
// ===========================================================================

test('sqlite: backend is sqlite when node:sqlite is available', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);
    assert.equal(store.backend, 'sqlite');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: mirror state is persisted in shared chat.sqlite with transcript metadata', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);
    const observability = {
      lifecycle: null,
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0.001,
      },
      toolCards: [{
        toolCallId: 'tool-1',
        runId: 'run-1',
        name: 'browser',
        status: 'completed',
        startedAt: '2026-03-26T10:00:00.000Z',
        updatedAt: '2026-03-26T10:00:01.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"summary":"ok"}',
        isError: false,
      }],
      timeline: [{
        id: 'usage-1',
        kind: 'usage',
        runId: null,
        toolCallId: null,
        emittedAt: '2026-03-26T10:00:01.000Z',
        title: 'Usage · 20 tokens',
        detail: 'in 12 / out 8',
        level: 'info',
      }],
    };
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('msg-1')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
      sourceSignature: 'sig-1',
      sourceSessionFile: '/tmp/session-1.jsonl',
      sourceMtimeMs: 1234,
      observability,
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.sourceSignature, 'sig-1');
    assert.equal(snapshot.sourceSessionFile, '/tmp/session-1.jsonl');
    assert.equal(snapshot.sourceMtimeMs, 1234);
    assert.equal(snapshot.observability?.usage?.totalTokens, 20);
    assert.equal(snapshot.observability?.toolCards?.[0]?.toolCallId, 'tool-1');
    assert.equal(fs.existsSync(path.join(root, 'studio', 'chat.sqlite')), true);
    assert.equal(fs.existsSync(path.join(root, 'studio', 'chat-durable-mirror', 'mirror.sqlite')), false);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: session metadata and page messages can be read without hydrating the full mirror snapshot', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [
        makeMessage('msg-1', 'user', 'first'),
        makeMessage('msg-2', 'assistant', 'second'),
        makeMessage('msg-3', 'assistant', 'third'),
      ],
      baseMessageSeq: 3,
      savedAt: '2026-03-26T10:00:03.000Z',
      sourceSignature: 'sig-3',
      sourceSessionFile: '/tmp/session-3.jsonl',
      sourceMtimeMs: 3333,
      observability: {
        lifecycle: null,
        usage: null,
        toolCards: [],
        timeline: [],
      },
    });

    const meta = store.readSessionMeta(SESSION_KEY);
    assert.ok(meta);
    assert.equal(meta.sourceSessionFile, '/tmp/session-3.jsonl');
    assert.equal(meta.sourceMtimeMs, 3333);
    assert.equal(store.readMessageCount(SESSION_KEY), 3);
    assert.equal(store.readMessageIndex(SESSION_KEY, 'msg-2'), 1);

    const page = store.readMessagesByIds(SESSION_KEY, ['msg-3', 'msg-1']);
    assert.deepEqual(
      page.map((message) => [message.id, message.text]),
      [['msg-3', 'third'], ['msg-1', 'first']],
    );
    const range = store.readMessagesInIndexRange(SESSION_KEY, 1, 3);
    assert.deepEqual(
      range.map((message) => [message.id, message.text]),
      [['msg-2', 'second'], ['msg-3', 'third']],
    );
    const dayStubs = store.readMessageStubsForDay(SESSION_KEY, '2026-03-26');
    assert.deepEqual(
      dayStubs.map((message) => message.id),
      ['msg-1', 'msg-2', 'msg-3'],
    );
    assert.deepEqual(
      store.readDateBuckets(SESSION_KEY).map((bucket) => [bucket.day, bucket.count, bucket.firstMessageId, bucket.lastMessageId]),
      [['2026-03-26', 3, 'msg-1', 'msg-3']],
    );
    assert.deepEqual(
      store.searchMessageStubs(SESSION_KEY, {
        query: 'third',
        roleFilter: 'assistant',
        contentFilter: 'text',
      }).map((message) => message.id),
      ['msg-3'],
    );
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v2',
      source: 'local_transcript',
      messages: [
        makeMessage('msg-a', 'assistant', 'alpha bridge keyword'),
        makeMessage('msg-b', 'assistant', 'keyword only'),
      ],
      baseMessageSeq: 2,
      savedAt: '2026-03-26T10:00:05.000Z',
      sourceSignature: 'sig-4',
      sourceSessionFile: '/tmp/session-4.jsonl',
      sourceMtimeMs: 4444,
      observability: {
        lifecycle: null,
        usage: null,
        toolCards: [],
        timeline: [],
      },
    });
    assert.deepEqual(
      store.searchMessageStubs(SESSION_KEY, {
        query: 'keyword alpha',
        roleFilter: 'assistant',
        contentFilter: 'text',
      }).map((message) => message.id),
      ['msg-a'],
    );
    const db = new DatabaseSync(path.join(root, 'studio', 'chat.sqlite'));
    const ftsTable = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'mirror_messages_fts'
      LIMIT 1
    `).get();
    assert.equal(ftsTable?.name, 'mirror_messages_fts');
    const messageIndexes = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
        AND name IN (
          'mirror_messages_session_role_index',
          'mirror_messages_session_has_text_index',
          'mirror_messages_session_has_resources_index',
          'mirror_messages_session_has_code_index'
        )
      ORDER BY name ASC
    `).all();
    assert.deepEqual(
      messageIndexes.map((row) => row.name),
      [
        'mirror_messages_session_has_code_index',
        'mirror_messages_session_has_resources_index',
        'mirror_messages_session_has_text_index',
        'mirror_messages_session_role_index',
      ],
    );
    assert.match(
      explainPlanDetails(db, `
        SELECT message_id
        FROM mirror_messages INDEXED BY mirror_messages_session_role_index
        WHERE session_key = ? AND role = ?
        ORDER BY message_index ASC
      `, SESSION_KEY, 'assistant'),
      /mirror_messages_session_role_index/,
    );
    assert.match(
      explainPlanDetails(db, `
        SELECT message_id
        FROM mirror_messages INDEXED BY mirror_messages_session_has_code_index
        WHERE session_key = ? AND has_code = 1
        ORDER BY message_index ASC
      `, SESSION_KEY),
      /mirror_messages_session_has_code_index/,
    );
    const ftsRows = db.prepare(`
      SELECT message_id
      FROM mirror_messages_fts
      WHERE session_key = ? AND mirror_messages_fts MATCH ?
      ORDER BY message_index ASC
    `).all(SESSION_KEY, '"keyword" AND "alpha"');
    assert.deepEqual(
      ftsRows.map((row) => row.message_id),
      ['msg-a'],
    );
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v3',
      source: 'local_transcript',
      messages: [
        makeMessage('msg-c', 'assistant', '关键字测试'),
      ],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:06.000Z',
      sourceSignature: 'sig-5',
      sourceSessionFile: '/tmp/session-5.jsonl',
      sourceMtimeMs: 5555,
      observability: {
        lifecycle: null,
        usage: null,
        toolCards: [],
        timeline: [],
      },
    });
    const cjkFtsRows = db.prepare(`
      SELECT message_id
      FROM mirror_messages_fts
      WHERE session_key = ? AND mirror_messages_fts MATCH ?
      ORDER BY message_index ASC
    `).all(SESSION_KEY, '"关键" AND "键字"');
    assert.deepEqual(
      cjkFtsRows.map((row) => row.message_id),
      ['msg-c'],
    );
    assert.deepEqual(
      store.searchMessageStubs(SESSION_KEY, {
        query: '关键字',
        roleFilter: 'assistant',
        contentFilter: 'text',
      }).map((message) => message.id),
      ['msg-c'],
    );
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v3-search-window',
      source: 'local_transcript',
      messages: [
        { ...makeMessage('search-1', 'user', 'plain intro'), createdAt: '2026-03-26T09:00:00.000Z' },
        { ...makeMessage('search-2', 'assistant', 'needle alpha'), createdAt: '2026-03-26T09:01:00.000Z' },
        { ...makeMessage('search-3', 'assistant', 'needle beta'), createdAt: '2026-03-27T09:02:00.000Z' },
        { ...makeMessage('search-4', 'assistant', 'unrelated'), createdAt: '2026-03-27T09:03:00.000Z' },
        { ...makeMessage('search-5', 'assistant', 'needle gamma'), createdAt: '2026-03-27T09:04:00.000Z' },
        { ...makeMessage('search-6', 'assistant', 'needle delta'), createdAt: '2026-03-28T09:05:00.000Z' },
      ],
      baseMessageSeq: 6,
      savedAt: '2026-03-28T09:05:00.000Z',
      sourceSignature: 'sig-search-window',
      sourceSessionFile: '/tmp/session-search-window.jsonl',
      sourceMtimeMs: 5656,
      observability: {
        lifecycle: null,
        usage: null,
        toolCards: [],
        timeline: [],
      },
    });
    const searchTail = store.readSearchMessageWindow(SESSION_KEY, {
      query: 'needle',
      limit: 2,
    });
    assert.ok(searchTail);
    assert.deepEqual(
      searchTail.stubs.map((message) => message.id),
      ['search-5', 'search-6'],
    );
    assert.equal(searchTail.totalCount, 4);
    assert.equal(searchTail.hasMoreBefore, true);
    assert.equal(searchTail.hasMoreAfter, false);
    assert.deepEqual(searchTail.beforeBoundary, {
      anchorIndex: 2,
      anchorMessageId: 'search-5',
      anchorCreatedAt: '2026-03-27T09:04:00.000Z',
    });
    const searchBefore = store.readSearchMessageWindow(SESSION_KEY, {
      query: 'needle',
      before: {
        anchorIndex: searchTail.beforeBoundary.anchorIndex,
        anchorMessageId: searchTail.beforeBoundary.anchorMessageId,
      },
      limit: 2,
    });
    assert.ok(searchBefore);
    assert.deepEqual(
      searchBefore.stubs.map((message) => message.id),
      ['search-2', 'search-3'],
    );
    assert.equal(searchBefore.hasMoreBefore, false);
    assert.equal(searchBefore.hasMoreAfter, true);
    assert.deepEqual(searchBefore.afterBoundary, {
      anchorIndex: 2,
      anchorMessageId: 'search-5',
      anchorCreatedAt: '2026-03-27T09:04:00.000Z',
    });
    const searchDayTail = store.readSearchMessageWindow(SESSION_KEY, {
      query: 'needle',
      day: '2026-03-27',
      limit: 1,
    });
    assert.ok(searchDayTail);
    assert.deepEqual(
      searchDayTail.stubs.map((message) => message.id),
      ['search-5'],
    );
    assert.equal(searchDayTail.totalCount, 2);
    assert.equal(searchDayTail.day, '2026-03-27');
    assert.deepEqual(searchDayTail.beforeBoundary, {
      anchorIndex: 1,
      anchorMessageId: 'search-5',
      anchorCreatedAt: '2026-03-27T09:04:00.000Z',
    });
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v4',
      source: 'local_transcript',
      messages: [
        makeMessage('page-1', 'user', 'one'),
        { ...makeMessage('page-2', 'assistant', 'two'), createdAt: '2026-03-27T10:00:00.000Z' },
        { ...makeMessage('page-3', 'assistant', 'three'), createdAt: '2026-03-27T10:01:00.000Z' },
        { ...makeMessage('page-4', 'assistant', 'four'), createdAt: '2026-03-27T10:02:00.000Z' },
        { ...makeMessage('page-5', 'assistant', 'five'), createdAt: '2026-03-27T10:03:00.000Z' },
        { ...makeMessage('page-6', 'assistant', 'six'), createdAt: '2026-03-27T10:04:00.000Z' },
      ],
      baseMessageSeq: 6,
      savedAt: '2026-03-27T10:04:00.000Z',
      sourceSignature: 'sig-6',
      sourceSessionFile: '/tmp/session-6.jsonl',
      sourceMtimeMs: 6666,
      observability: {
        lifecycle: null,
        usage: null,
        toolCards: [],
        timeline: [],
      },
    });
    const anchoredWindow = store.readMessageWindow(SESSION_KEY, {
      anchor: 'page-4',
      day: '2026-03-27',
      limit: 4,
    });
    assert.ok(anchoredWindow);
    assert.deepEqual(
      anchoredWindow.messages.map((message) => message.id),
      ['page-2', 'page-3', 'page-4', 'page-5', 'page-6'],
    );
    assert.equal(anchoredWindow.day, '2026-03-27');
    assert.equal(anchoredWindow.hasMoreBefore, false);
    assert.equal(anchoredWindow.hasMoreAfter, false);
    const afterWindow = store.readMessageWindow(SESSION_KEY, {
      after: {
        anchorIndex: 2,
        anchorMessageId: 'page-3',
      },
      day: '2026-03-27',
      limit: 2,
    });
    assert.ok(afterWindow);
    assert.deepEqual(
      afterWindow.messages.map((message) => message.id),
      ['page-3', 'page-4'],
    );
    db.close();
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: legacy mirror.sqlite snapshots are lazily migrated into shared chat.sqlite', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const legacyFile = path.join(root, 'studio', 'chat-durable-mirror', 'mirror.sqlite');
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    const legacyDb = new DatabaseSync(legacyFile);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS mirror_checkpoint (
        session_key TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        base_message_seq INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS mirror_oplog (
        session_key TEXT NOT NULL,
        version TEXT NOT NULL,
        message_seq INTEGER NOT NULL,
        source TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (session_key, version, message_seq)
      );
    `);
    legacyDb.prepare(`
      INSERT INTO mirror_checkpoint (session_key, version, source, base_message_seq, saved_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      SESSION_KEY,
      'legacy-v1',
      'history_sse',
      1,
      '2026-03-26T10:00:00.000Z',
      JSON.stringify([makeMessage('legacy-base')]),
    );
    legacyDb.prepare(`
      INSERT INTO mirror_oplog (session_key, version, message_seq, source, saved_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      SESSION_KEY,
      'legacy-v1',
      2,
      'history_sse',
      '2026-03-26T10:01:00.000Z',
      JSON.stringify(makeMessage('legacy-oplog', 'user', 'hello from legacy')),
    );

    const store = createStudioChatDurableMirrorStore(config);
    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'legacy-v1');
    assert.deepEqual(snapshot.messages.map((message) => message.id), ['legacy-base', 'legacy-oplog']);

    const sharedDb = new DatabaseSync(path.join(root, 'studio', 'chat.sqlite'));
    const migrated = sharedDb.prepare(`
      SELECT version, base_message_seq
      FROM mirror_checkpoint
      WHERE session_key = ?
    `).get(SESSION_KEY);
    assert.ok(migrated);
    assert.equal(migrated.version, 'legacy-v1');
    assert.equal(migrated.base_message_seq, 2);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: clearSession also removes lazily migrated legacy mirror rows', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const legacyFile = path.join(root, 'studio', 'chat-durable-mirror', 'mirror.sqlite');
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    const legacyDb = new DatabaseSync(legacyFile);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS mirror_checkpoint (
        session_key TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        base_message_seq INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS mirror_oplog (
        session_key TEXT NOT NULL,
        version TEXT NOT NULL,
        message_seq INTEGER NOT NULL,
        source TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (session_key, version, message_seq)
      );
    `);
    legacyDb.prepare(`
      INSERT INTO mirror_checkpoint (session_key, version, source, base_message_seq, saved_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      SESSION_KEY,
      'legacy-v1',
      'history_sse',
      1,
      '2026-03-26T10:00:00.000Z',
      JSON.stringify([makeMessage('legacy-base')]),
    );

    const store = createStudioChatDurableMirrorStore(config);
    assert.ok(store.readSession(SESSION_KEY));
    store.clearSession(SESSION_KEY);
    assert.equal(store.readSession(SESSION_KEY), null);

    const sharedDb = new DatabaseSync(path.join(root, 'studio', 'chat.sqlite'));
    const sharedCount = sharedDb.prepare(`
      SELECT COUNT(*) AS count
      FROM mirror_checkpoint
      WHERE session_key = ?
    `).get(SESSION_KEY);
    const legacyCount = legacyDb.prepare(`
      SELECT COUNT(*) AS count
      FROM mirror_checkpoint
      WHERE session_key = ?
    `).get(SESSION_KEY);
    assert.equal(sharedCount.count, 0);
    assert.equal(legacyCount.count, 0);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: tombstones prevent stale legacy mirror re-import after clearSession', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const legacyFile = path.join(root, 'studio', 'chat-durable-mirror', 'mirror.sqlite');
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    const legacyDb = new DatabaseSync(legacyFile);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS mirror_checkpoint (
        session_key TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        base_message_seq INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS mirror_oplog (
        session_key TEXT NOT NULL,
        version TEXT NOT NULL,
        message_seq INTEGER NOT NULL,
        source TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (session_key, version, message_seq)
      );
    `);
    const insertLegacyCheckpoint = () => legacyDb.prepare(`
      INSERT OR REPLACE INTO mirror_checkpoint (session_key, version, source, base_message_seq, saved_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      SESSION_KEY,
      'legacy-v1',
      'history_sse',
      1,
      '2026-03-26T10:00:00.000Z',
      JSON.stringify([makeMessage('legacy-base')]),
    );

    insertLegacyCheckpoint();
    const store = createStudioChatDurableMirrorStore(config);
    assert.ok(store.readSession(SESSION_KEY));
    store.clearSession(SESSION_KEY);

    // Simulate a failed legacy delete or an external stale writer after clear.
    insertLegacyCheckpoint();
    assert.equal(store.readSession(SESSION_KEY), null);

    const sharedDb = new DatabaseSync(path.join(root, 'studio', 'chat.sqlite'));
    const tombstone = sharedDb.prepare(`
      SELECT cleared_at
      FROM mirror_tombstones
      WHERE session_key = ?
    `).get(SESSION_KEY);
    assert.ok(tombstone?.cleared_at);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: replaceSnapshot then readSession returns correct snapshot', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);
    const messages = [makeMessage('msg-1'), makeMessage('msg-2', 'user', 'hi')];

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages,
      baseMessageSeq: 2,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.sessionKey, SESSION_KEY);
    assert.equal(snapshot.version, 'v1');
    assert.equal(snapshot.source, 'local_transcript');
    assert.equal(snapshot.backend, 'sqlite');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'msg-1');
    assert.equal(snapshot.messages[1].id, 'msg-2');
    assert.equal(snapshot.lastMessageSeq, 2);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: appendMessage adds to oplog and readSession returns snapshot + oplog', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('msg-1')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:00.000Z',
      message: makeMessage('msg-2', 'user', 'follow-up'),
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'msg-1');
    assert.equal(snapshot.messages[1].id, 'msg-2');
    assert.equal(snapshot.lastMessageSeq, 2);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: clearSession removes all data', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('msg-1')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });
    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:00.000Z',
      message: makeMessage('msg-2'),
    });

    store.clearSession(SESSION_KEY);
    const snapshot = store.readSession(SESSION_KEY);
    assert.equal(snapshot, null);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: multiple replaceSnapshot keeps only the latest', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('old-msg')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    // Append oplog to v1
    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:00.000Z',
      message: makeMessage('old-oplog'),
    });

    // Replace with v2 - should clear old oplog too
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v2',
      source: 'history_sse',
      messages: [makeMessage('new-msg-1'), makeMessage('new-msg-2')],
      baseMessageSeq: 5,
      savedAt: '2026-03-26T11:00:00.000Z',
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'v2');
    assert.equal(snapshot.source, 'history_sse');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'new-msg-1');
    assert.equal(snapshot.messages[1].id, 'new-msg-2');
    assert.equal(snapshot.lastMessageSeq, 5);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: readSession returns null for unknown session', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);
    const snapshot = store.readSession('nonexistent:session');
    assert.equal(snapshot, null);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: replaceSnapshot after appendMessage replaces with new snapshot and clears oplog', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('base')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:00.000Z',
      message: makeMessage('appended'),
    });

    // Now replaceSnapshot with a new version that includes both messages
    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v2',
      source: 'local_transcript',
      messages: [makeMessage('base'), makeMessage('appended'), makeMessage('new')],
      baseMessageSeq: 3,
      savedAt: '2026-03-26T10:02:00.000Z',
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'v2');
    assert.equal(snapshot.messages.length, 3);
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: appendMessage with same messageSeq replaces (no duplicates)', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('base')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    // Append same seq twice (INSERT OR REPLACE in SQLite)
    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:00.000Z',
      message: makeMessage('msg-first-version', 'assistant', 'first'),
    });

    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:01.000Z',
      message: makeMessage('msg-updated', 'assistant', 'updated'),
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    // base + 1 oplog (deduplicated)
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[1].id, 'msg-updated');
    assert.equal(snapshot.messages[1].text, 'updated');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: multiple different messages are all preserved', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('base')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    for (let i = 2; i <= 5; i++) {
      store.appendMessage({
        sessionKey: SESSION_KEY,
        version: 'v1',
        source: 'local_transcript',
        messageSeq: i,
        savedAt: `2026-03-26T10:0${i}:00.000Z`,
        message: makeMessage(`msg-${i}`, i % 2 === 0 ? 'user' : 'assistant', `text-${i}`),
      });
    }

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.messages.length, 5); // 1 base + 4 oplog
    assert.equal(snapshot.messages[0].id, 'base');
    assert.equal(snapshot.messages[1].id, 'msg-2');
    assert.equal(snapshot.messages[2].id, 'msg-3');
    assert.equal(snapshot.messages[3].id, 'msg-4');
    assert.equal(snapshot.messages[4].id, 'msg-5');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: clearSession then replaceSnapshot + appendMessage works', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('old')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    store.clearSession(SESSION_KEY);
    assert.equal(store.readSession(SESSION_KEY), null);

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v2',
      source: 'local_transcript',
      messages: [makeMessage('fresh-base')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T11:00:00.000Z',
    });

    store.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v2',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T11:01:00.000Z',
      message: makeMessage('fresh-append'),
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'v2');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'fresh-base');
    assert.equal(snapshot.messages[1].id, 'fresh-append');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: re-creating store reads previously persisted data', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store1 = createStudioChatDurableMirrorStore(config);

    store1.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [makeMessage('persisted-msg')],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    store1.appendMessage({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messageSeq: 2,
      savedAt: '2026-03-26T10:01:00.000Z',
      message: makeMessage('persisted-oplog'),
    });

    // Create new store instance pointing to same root
    const store2 = createStudioChatDurableMirrorStore(config);
    assert.equal(store2.backend, 'sqlite');

    const snapshot = store2.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'persisted-msg');
    assert.equal(snapshot.messages[1].id, 'persisted-oplog');
  } finally {
    cleanupTempRoot(root);
  }
});

test('sqlite: messages with toolCalls are cloned correctly', () => {
  const root = makeTempRoot();
  try {
    const config = makeConfig(root);
    const store = createStudioChatDurableMirrorStore(config);

    const msgWithTools = {
      ...makeMessage('tool-msg', 'assistant', 'done'),
      toolCalls: [
        {
          toolCallId: 'tc-1',
          runId: 'run-1',
          name: 'exec',
          status: 'completed',
          startedAt: '2026-03-26T10:00:00.000Z',
          updatedAt: '2026-03-26T10:00:01.000Z',
          argsPreview: '{"cmd":"ls"}',
          resultPreview: 'file.txt',
          isError: false,
        },
      ],
      processBlocks: [{ id: 'pb-1', kind: 'thinking', text: 'reasoning...' }],
    };

    store.replaceSnapshot({
      sessionKey: SESSION_KEY,
      version: 'v1',
      source: 'local_transcript',
      messages: [msgWithTools],
      baseMessageSeq: 1,
      savedAt: '2026-03-26T10:00:00.000Z',
    });

    const snapshot = store.readSession(SESSION_KEY);
    assert.ok(snapshot);
    assert.equal(snapshot.messages[0].toolCalls?.length, 1);
    assert.equal(snapshot.messages[0].toolCalls?.[0].toolCallId, 'tc-1');
    assert.equal(snapshot.messages[0].processBlocks?.length, 1);
    assert.equal(snapshot.messages[0].processBlocks?.[0].text, 'reasoning...');

    // Verify it's a clone, not same reference
    assert.notEqual(snapshot.messages[0].toolCalls, msgWithTools.toolCalls);
  } finally {
    cleanupTempRoot(root);
  }
});

// ===========================================================================
// JSON fallback path tests (via child process with --no-experimental-sqlite)
// ===========================================================================

test('json fallback: backend is json when node:sqlite is unavailable', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      console.log(JSON.stringify({ backend: store.backend }));
    `);
    const result = JSON.parse(output);
    assert.equal(result.backend, 'json');
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: replaceSnapshot then readSession returns correct snapshot', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [
          { id: 'msg-1', role: 'assistant', text: 'hello', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
          { id: 'msg-2', role: 'user', text: 'hi', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
        ],
        baseMessageSeq: 2,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.sessionKey, SESSION_KEY);
    assert.equal(snapshot.version, 'v1');
    assert.equal(snapshot.backend, 'json');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'msg-1');
    assert.equal(snapshot.messages[1].id, 'msg-2');
    assert.equal(snapshot.lastMessageSeq, 2);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: appendMessage adds to oplog and readSession returns snapshot + oplog', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'base', role: 'assistant', text: 'base', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T10:01:00.000Z',
        message: { id: 'appended', role: 'user', text: 'follow-up', createdAt: '2026-03-26T10:01:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.backend, 'json');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'base');
    assert.equal(snapshot.messages[1].id, 'appended');
    assert.equal(snapshot.lastMessageSeq, 2);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: clearSession removes data', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'msg-1', role: 'assistant', text: 'hi', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.clearSession('${SESSION_KEY}');
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify({ snapshot }));
    `);
    const result = JSON.parse(output);
    assert.equal(result.snapshot, null);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: multiple replaceSnapshot keeps only the latest', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'old', role: 'assistant', text: 'old', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T10:01:00.000Z',
        message: { id: 'old-oplog', role: 'user', text: 'x', createdAt: '2026-03-26T10:01:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v2',
        source: 'history_sse',
        messages: [
          { id: 'new-1', role: 'assistant', text: 'new', createdAt: '2026-03-26T11:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
          { id: 'new-2', role: 'user', text: 'new2', createdAt: '2026-03-26T11:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
        ],
        baseMessageSeq: 5,
        savedAt: '2026-03-26T11:00:00.000Z',
      });
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'v2');
    assert.equal(snapshot.source, 'history_sse');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'new-1');
    assert.equal(snapshot.messages[1].id, 'new-2');
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: appendMessage with same messageSeq replaces (no duplicates)', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'base', role: 'assistant', text: 'base', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T10:01:00.000Z',
        message: { id: 'first-ver', role: 'assistant', text: 'first', createdAt: '2026-03-26T10:01:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T10:01:01.000Z',
        message: { id: 'updated', role: 'assistant', text: 'updated', createdAt: '2026-03-26T10:01:01.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.messages.length, 2); // base + 1 deduplicated oplog
    assert.equal(snapshot.messages[1].id, 'updated');
    assert.equal(snapshot.messages[1].text, 'updated');
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: multiple different messages are all preserved', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'base', role: 'assistant', text: 'base', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      for (let i = 2; i <= 5; i++) {
        store.appendMessage({
          sessionKey: '${SESSION_KEY}',
          version: 'v1',
          source: 'local_transcript',
          messageSeq: i,
          savedAt: '2026-03-26T10:0' + i + ':00.000Z',
          message: { id: 'msg-' + i, role: i % 2 === 0 ? 'user' : 'assistant', text: 'text-' + i, createdAt: '2026-03-26T10:0' + i + ':00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
        });
      }
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.messages.length, 5);
    assert.equal(snapshot.messages[0].id, 'base');
    for (let i = 1; i <= 4; i++) {
      assert.equal(snapshot.messages[i].id, `msg-${i + 1}`);
    }
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: readSession returns null for empty session', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify({ snapshot }));
    `);
    const result = JSON.parse(output);
    assert.equal(result.snapshot, null);
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: clearSession then replaceSnapshot + appendMessage works', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'old', role: 'assistant', text: 'old', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.clearSession('${SESSION_KEY}');
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v2',
        source: 'local_transcript',
        messages: [{ id: 'fresh', role: 'assistant', text: 'fresh', createdAt: '2026-03-26T11:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T11:00:00.000Z',
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v2',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T11:01:00.000Z',
        message: { id: 'fresh-append', role: 'user', text: 'new', createdAt: '2026-03-26T11:01:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });
      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'v2');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'fresh');
    assert.equal(snapshot.messages[1].id, 'fresh-append');
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: re-creating store reads previously persisted data', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'persisted', role: 'assistant', text: 'persisted', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T10:01:00.000Z',
        message: { id: 'persisted-oplog', role: 'user', text: 'oplog', createdAt: '2026-03-26T10:01:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });

      // Create a second store instance
      const store2 = createStudioChatDurableMirrorStore(config);
      const snapshot = store2.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.backend, 'json');
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.messages[0].id, 'persisted');
    assert.equal(snapshot.messages[1].id, 'persisted-oplog');
  } finally {
    cleanupTempRoot(root);
  }
});

test('json fallback: JSON file is written to correct path', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      import fs from 'node:fs';
      import path from 'node:path';

      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'msg', role: 'assistant', text: 'test', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });

      const mirrorDir = path.join(config.openclawRoot, 'studio', 'chat-durable-mirror');
      const files = fs.readdirSync(mirrorDir).filter(f => f.endsWith('.json'));
      console.log(JSON.stringify({ fileCount: files.length, hasJsonFile: files.length > 0 }));
    `);
    const result = JSON.parse(output);
    assert.equal(result.hasJsonFile, true);
    assert.equal(result.fileCount, 1);
  } finally {
    cleanupTempRoot(root);
  }
});

// ===========================================================================
// JSON fallback: oplog version filtering
// ===========================================================================

test('json fallback: oplog entries from old version are filtered out after replaceSnapshot', () => {
  const root = makeTempRoot();
  try {
    const output = runJsonFallbackScript(root, `
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messages: [{ id: 'base', role: 'assistant', text: 'base', createdAt: '2026-03-26T10:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T10:00:00.000Z',
      });
      store.appendMessage({
        sessionKey: '${SESSION_KEY}',
        version: 'v1',
        source: 'local_transcript',
        messageSeq: 2,
        savedAt: '2026-03-26T10:01:00.000Z',
        message: { id: 'v1-oplog', role: 'user', text: 'v1', createdAt: '2026-03-26T10:01:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null },
      });

      // Replace with v2 — the v1 oplog entry should be filtered out on read
      // Note: replaceSnapshot sets oplog to [] in JSON mode
      store.replaceSnapshot({
        sessionKey: '${SESSION_KEY}',
        version: 'v2',
        source: 'local_transcript',
        messages: [{ id: 'new-base', role: 'assistant', text: 'new', createdAt: '2026-03-26T11:00:00.000Z', source: 'history', runId: null, truncated: false, omitted: false, aborted: false, stopReason: null }],
        baseMessageSeq: 1,
        savedAt: '2026-03-26T11:00:00.000Z',
      });

      const snapshot = store.readSession('${SESSION_KEY}');
      console.log(JSON.stringify(snapshot));
    `);
    const snapshot = JSON.parse(output);
    assert.ok(snapshot);
    assert.equal(snapshot.version, 'v2');
    // Only the new base message, no old oplog
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.messages[0].id, 'new-base');
  } finally {
    cleanupTempRoot(root);
  }
});
