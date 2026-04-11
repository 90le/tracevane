import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeRealChatEnvironment,
  createStudioSession,
  RealChatIntegrationSkipError,
  sendChat,
  startStudioTestServer,
  waitFor,
  WaitForAbortError,
} from './integration-helpers.mjs';

const TOOL_PROMPT = 'You must attempt at least one tool call before answering. Prefer session_status. If that fails, try browser status. Do not answer until a tool has been attempted.';
const REAL_CHAT_INTEGRATION_ENABLED = process.env.OPENCLAW_STUDIO_ENABLE_REAL_CHAT_INTEGRATION === '1';

let studio;
const integrationTest = REAL_CHAT_INTEGRATION_ENABLED ? test : test.skip;

before(async () => {
  if (!REAL_CHAT_INTEGRATION_ENABLED) {
    return;
  }
  studio = await startStudioTestServer();
});

after(async () => {
  await studio?.stop();
});

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

function hasTerminalStreamEvent(events) {
  return events.some((entry) => (
    entry.kind === 'final'
    || entry.kind === 'error'
    || entry.kind === 'aborted'
    || (entry.kind === 'runtime.state' && entry.runtime?.state === 'error')
    || (entry.kind === 'agent_lifecycle' && entry.lifecycle?.phase === 'error')
  ));
}

integrationTest('fresh live tool stream reaches /ws/chat on the same logical chain', async (t) => {
  await runIntegrationTest(t, async () => {
    await runWithRetries(async (attempt) => {
      const created = await createStudioSession(studio.baseUrl, 'main');
      const sessionKey = created.session.key;
      const ws = new WebSocket(`ws://127.0.0.1:${new URL(studio.baseUrl).port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
      const events = [];

      ws.addEventListener('message', (raw) => {
        events.push(JSON.parse(String(raw.data)));
      });

      try {
        await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
        await sendChat(studio.baseUrl, sessionKey, TOOL_PROMPT, `tool-${Date.now()}-${attempt}`);

        let outcome = null;
        try {
          outcome = await waitFor(() => {
            const sawCall = events.some((entry) => entry.kind === 'agent_tool_call');
            const sawResult = events.some((entry) => entry.kind === 'agent_tool_result' && entry.partial === false);
            const sawFinal = events.some((entry) => entry.kind === 'final');
            if (sawCall && sawResult && sawFinal) {
              return { status: 'success' };
            }
            if (hasTerminalStreamEvent(events)) {
              throw new WaitForAbortError('terminal stream event received before required tool events');
            }
            throw new Error('waiting for tool stream');
          }, { timeoutMs: 90000, intervalMs: 250 });
        } catch (error) {
          const analysis = await analyzeRealChatEnvironment({
            baseUrl: studio.baseUrl,
            sessionKey,
            events,
          });
          if (analysis.skipReason) {
            throw new RealChatIntegrationSkipError(analysis.skipReason, analysis.diagnostics);
          }
          throw new Error(`tool stream timeout (attempt ${attempt + 1})\n\n${analysis.diagnostics}`);
        }

        const toolCall = events.find((entry) => entry.kind === 'agent_tool_call');
        const toolResult = events.find((entry) => entry.kind === 'agent_tool_result' && entry.partial === false);
        const final = events.find((entry) => entry.kind === 'final');
        const callCount = events.filter((entry) => entry.kind === 'agent_tool_call').length;
        const finalCount = events.filter((entry) => entry.kind === 'final').length;

        assert.ok(toolCall);
        assert.ok(toolResult);
        assert.ok(final);
        assert.equal(toolCall.runId, toolResult.runId);
        assert.equal(toolCall.runId, final.runId);
        assert.ok(callCount >= 1);
        assert.equal(finalCount, 1);
      } finally {
        try { ws.close(); } catch {}
      }
    });
  });
});

integrationTest('session bridge survives reconnect and still streams tool events', async (t) => {
  await runIntegrationTest(t, async () => {
    await runWithRetries(async (attempt) => {
      const created = await createStudioSession(studio.baseUrl, 'main');
      const sessionKey = created.session.key;

      const firstSocket = new WebSocket(`ws://127.0.0.1:${new URL(studio.baseUrl).port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
      await new Promise((resolve) => firstSocket.addEventListener('open', resolve, { once: true }));
      try { firstSocket.close(); } catch {}

      const secondSocket = new WebSocket(`ws://127.0.0.1:${new URL(studio.baseUrl).port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
      await new Promise((resolve) => secondSocket.addEventListener('open', resolve, { once: true }));

      const events = [];
      secondSocket.addEventListener('message', (raw) => {
        events.push(JSON.parse(String(raw.data)));
      });

      try {
        await sendChat(studio.baseUrl, sessionKey, TOOL_PROMPT, `reconnect-${Date.now()}-${attempt}`);

        let outcome = null;
        try {
          outcome = await waitFor(() => {
            const sawToolCall = events.some((entry) => entry.kind === 'agent_tool_call');
            const sawFinal = events.some((entry) => entry.kind === 'final');
            if (sawToolCall && sawFinal) {
              return { status: 'success' };
            }
            if (hasTerminalStreamEvent(events)) {
              throw new WaitForAbortError('terminal reconnect stream event received before required tool events');
            }
            throw new Error('waiting for reconnect tool stream');
          }, { timeoutMs: 120000, intervalMs: 250 });
        } catch (error) {
          const analysis = await analyzeRealChatEnvironment({
            baseUrl: studio.baseUrl,
            sessionKey,
            events,
          });
          if (analysis.skipReason) {
            throw new RealChatIntegrationSkipError(analysis.skipReason, analysis.diagnostics);
          }
          throw new Error(`reconnect tool stream timeout (attempt ${attempt + 1})\n\n${analysis.diagnostics}`);
        }

        assert.ok(events.some((entry) => entry.kind === 'agent_tool_call'));
        assert.equal(events.filter((entry) => entry.kind === 'final').length, 1);
      } finally {
        try { secondSocket.close(); } catch {}
      }
    });
  });
});

integrationTest('dual-write transport exposes canonical stream events for the active session', async () => {
  await runWithRetries(async (attempt) => {
    const created = await createStudioSession(studio.baseUrl, 'main');
    const sessionKey = created.session.key;
    const ws = new WebSocket(`ws://127.0.0.1:${new URL(studio.baseUrl).port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    const events = [];
    ws.addEventListener('message', (raw) => {
      events.push(JSON.parse(String(raw.data)));
    });

    try {
      await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
      await sendChat(studio.baseUrl, sessionKey, 'Reply with exactly "hello".', `canonical-${Date.now()}-${attempt}`);

      try {
        await waitFor(() => {
          const sawRuntime = events.some((entry) => entry.kind === 'runtime.state');
          const sawCanonicalMessage = events.some((entry) => entry.kind === 'canonical.message');
          const sawCanonicalSnapshotWithMessages = events.some((entry) => (
            entry.kind === 'canonical.snapshot'
            && Array.isArray(entry.messages)
            && entry.messages.length > 0
          ));
          if (sawRuntime && (sawCanonicalMessage || sawCanonicalSnapshotWithMessages)) {
            return true;
          }
          if (hasTerminalStreamEvent(events)) {
            throw new WaitForAbortError('canonical transport terminated before canonical payload arrived');
          }
          throw new Error('waiting for canonical transport');
        }, { timeoutMs: 120000, intervalMs: 250 });
      } catch (error) {
        const analysis = await analyzeRealChatEnvironment({
          baseUrl: studio.baseUrl,
          sessionKey,
          events,
        });
        throw new Error(`canonical stream timeout (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}\n\n${analysis.diagnostics}`);
      }

      assert.ok(events.some((entry) => entry.kind === 'runtime.state'));
      assert.ok(events.some((entry) => (
        entry.kind === 'canonical.message'
        || (entry.kind === 'canonical.snapshot' && Array.isArray(entry.messages) && entry.messages.length > 0)
      )));
    } finally {
      try { ws.close(); } catch {}
    }
  });
});
