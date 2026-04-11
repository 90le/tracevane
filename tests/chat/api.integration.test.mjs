import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeRealChatEnvironment,
  createStudioSession,
  fetchHistory,
  formatChatIntegrationDiagnostics,
  openSessionEventStream,
  RealChatIntegrationSkipError,
  sendChat,
  startStudioTestServer,
  waitFor,
} from './integration-helpers.mjs';

const REAL_CHAT_INTEGRATION_ENABLED = process.env.OPENCLAW_STUDIO_ENABLE_REAL_CHAT_INTEGRATION === '1';

let studio;
const integrationTest = REAL_CHAT_INTEGRATION_ENABLED ? test : test.skip;

async function runWithRetries(task, attempts = 3) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task(index);
    } catch (error) {
      if (error instanceof RealChatIntegrationSkipError) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('retry failed');
}

async function runIntegrationTest(t, task) {
  try {
    await task();
  } catch (error) {
    if (error instanceof RealChatIntegrationSkipError) {
      if (error.diagnostics && typeof t?.diagnostic === 'function') {
        t.diagnostic(error.diagnostics);
      }
      t.skip(error.reason);
      return;
    }
    throw error;
  }
}

before(async () => {
  if (!REAL_CHAT_INTEGRATION_ENABLED) {
    return;
  }
  studio = await startStudioTestServer();
});

after(async () => {
  await studio?.stop();
});

integrationTest('create -> send -> history -> reset stays consistent', async (t) => {
  await runIntegrationTest(t, async () => {
    await runWithRetries(async (attempt) => {
      const created = await createStudioSession(studio.baseUrl, 'main');
      const sessionKey = created.session.key;
      const stream = await openSessionEventStream(studio.baseUrl, sessionKey);

      try {
        const ack = await sendChat(studio.baseUrl, sessionKey, 'Reply with a short hello.', `reset-${Date.now()}-${attempt}`);
        assert.equal(ack.accepted, true);
        assert.ok(ack.runId);

        const historyAfterSend = await waitFor(async () => {
          const payload = await fetchHistory(studio.baseUrl, sessionKey);
          assert.ok(payload.messages.length >= 2);
          return payload;
        }, { timeoutMs: 60000 });

        assert.equal(historyAfterSend.session.key, sessionKey);
        assert.ok(historyAfterSend.observability);
        assert.ok(historyAfterSend.messages.some((entry) => entry.role === 'assistant'));

        const resetResponse = await fetch(`${studio.baseUrl}/api/chat/sessions/${encodeURIComponent(sessionKey)}/reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        const resetPayload = await resetResponse.json();
        if (!resetResponse.ok || resetPayload.ok !== true) {
          const diagnostics = formatChatIntegrationDiagnostics({
            sessionKey,
            events: stream.events,
            historyPayload: historyAfterSend,
          });
          throw new Error(`reset failed with ${resetResponse.status}: ${JSON.stringify(resetPayload)}\n\n${diagnostics}`);
        }

        let historyAfterReset;
        try {
          historyAfterReset = await waitFor(async () => {
            const payload = await fetchHistory(studio.baseUrl, sessionKey);
            assert.equal(payload.messages.length, 0);
            return payload;
          }, { timeoutMs: 15000 });
        } catch (error) {
          const { diagnostics } = await analyzeRealChatEnvironment({
            baseUrl: studio.baseUrl,
            sessionKey,
            events: stream.events,
            historyPayload: historyAfterSend,
          });
          throw new Error(`history did not clear after reset: ${error instanceof Error ? error.message : String(error)}\n\n${diagnostics}`);
        }

        assert.equal(historyAfterReset.runtime.state, 'idle');
        assert.equal(historyAfterReset.observability.toolCards.length, 0);
      } finally {
        stream.close();
      }
    });
  });
});

integrationTest('observed_external remains readonly at API boundary', async () => {
  const sessionsResponse = await fetch(`${studio.baseUrl}/api/chat/agents/main/sessions`);
  const sessionsPayload = await sessionsResponse.json();
  assert.equal(sessionsResponse.ok, true);

  const readonlySession = sessionsPayload.sessions.find((entry) => entry.kind === 'observed_external');
  assert.ok(readonlySession);

  const sendResponse = await fetch(`${studio.baseUrl}/api/chat/sessions/${encodeURIComponent(readonlySession.key)}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'should fail', clientRequestId: `readonly-${Date.now()}` }),
  });
  const sendPayload = await sendResponse.json();
  assert.equal(sendResponse.status, 403);
  assert.equal(sendPayload.error.code, 'session_not_writable');
});

integrationTest('history usage becomes authoritative after final', async (t) => {
  await runIntegrationTest(t, async () => {
    await runWithRetries(async (attempt) => {
      const created = await createStudioSession(studio.baseUrl, 'main');
      const sessionKey = created.session.key;
      const stream = await openSessionEventStream(studio.baseUrl, sessionKey);

      try {
        await sendChat(studio.baseUrl, sessionKey, 'Reply with a short hello.', `usage-${Date.now()}-${attempt}`);

        const history = await waitFor(async () => {
          const payload = await fetchHistory(studio.baseUrl, sessionKey);
          assert.ok(payload.messages.length >= 2);
          return payload;
        }, { timeoutMs: 60000 });

        const analysis = await analyzeRealChatEnvironment({
          baseUrl: studio.baseUrl,
          sessionKey,
          events: stream.events,
          historyPayload: history,
        });
        if (analysis.skipReason) {
          throw new RealChatIntegrationSkipError(analysis.skipReason, analysis.diagnostics);
        }

        assert.ok(history.observability.usage, analysis.diagnostics);
        assert.ok(history.observability.usage.totalTokens > 0, analysis.diagnostics);
        assert.ok(history.observability.timeline.some((item) => item.kind === 'usage'), analysis.diagnostics);
      } finally {
        stream.close();
      }
    });
  });
});

integrationTest('send materializes exactly one canonical user message for the acknowledged run', async () => {
  await runWithRetries(async (attempt) => {
    const created = await createStudioSession(studio.baseUrl, 'main');
    const sessionKey = created.session.key;

    const ack = await sendChat(
      studio.baseUrl,
      sessionKey,
      'Reply with exactly "hello".',
      `dedupe-${Date.now()}-${attempt}`,
    );
    assert.equal(ack.accepted, true);

    const history = await waitFor(async () => {
      const payload = await fetchHistory(studio.baseUrl, sessionKey);
      const userMessages = payload.messages.filter((entry) => entry.role === 'user' && entry.runId === ack.runId);
      assert.ok(userMessages.length >= 1);
      assert.ok(payload.messages.some((entry) => entry.role === 'assistant'));
      return {
        payload,
        userMessages,
      };
    }, { timeoutMs: 60000 });

    assert.equal(history.userMessages.length, 1);
    assert.equal(history.userMessages[0]?.text, 'Reply with exactly "hello".');
  });
});

integrationTest('send keeps file refs out of user-visible text while exposing resources', async () => {
  const created = await createStudioSession(studio.baseUrl, 'main');
  const sessionKey = created.session.key;

  const uploadResponse = await fetch(`${studio.baseUrl}/api/chat/sessions/${encodeURIComponent(sessionKey)}/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: 'report.pdf',
      content: Buffer.from('pdf').toString('base64'),
      mimeType: 'application/pdf',
    }),
  });
  const uploadPayload = await uploadResponse.json();
  assert.equal(uploadResponse.ok, true);
  assert.equal(uploadPayload.ok, true);

  const sendResponse = await fetch(`${studio.baseUrl}/api/chat/sessions/${encodeURIComponent(sessionKey)}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: '请比较这份文档',
      clientRequestId: `file-ref-${Date.now()}`,
      fileRefs: [
        {
          id: 'file-ref-1',
          relativePath: uploadPayload.relativePath,
          fileName: uploadPayload.fileName,
          kind: 'file',
          mimeType: 'application/pdf',
        },
      ],
    }),
  });
  const sendPayload = await sendResponse.json();
  assert.equal(sendResponse.ok, true);
  assert.equal(sendPayload.accepted, true);

  const history = await waitFor(async () => {
    const payload = await fetchHistory(studio.baseUrl, sessionKey);
    const userMessage = payload.messages.find((entry) => entry.runId === sendPayload.runId && entry.role === 'user');
    assert.ok(userMessage);
    return { payload, userMessage };
  }, { timeoutMs: 30000 });

  assert.equal(history.userMessage.text, '请比较这份文档');
  assert.ok(!history.userMessage.text.includes('@'));
  assert.equal(history.userMessage.resources?.length, 1);
  assert.equal(history.userMessage.resources?.[0]?.relativePath, uploadPayload.relativePath);
  assert.equal(history.userMessage.resources?.[0]?.source, 'user_upload');
});

integrationTest('plain user text that looks like transport is not auto-decoded without shadow metadata', async () => {
  const created = await createStudioSession(studio.baseUrl, 'main');
  const sessionKey = created.session.key;
  const transportLikeText = '@foo/bar\n---\n只是普通文本\nMEDIA:/tmp/example.png\n`./docs/tree.txt`';

  const ack = await sendChat(studio.baseUrl, sessionKey, transportLikeText, `plain-${Date.now()}`);
  assert.equal(ack.accepted, true);

  const history = await waitFor(async () => {
    const payload = await fetchHistory(studio.baseUrl, sessionKey);
    const userMessage = payload.messages.find((entry) => entry.runId === ack.runId && entry.role === 'user');
    assert.ok(userMessage);
    return userMessage;
  }, { timeoutMs: 30000 });

  assert.equal(history.text, transportLikeText);
  assert.equal(history.resources, undefined);
});
