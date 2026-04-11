import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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
