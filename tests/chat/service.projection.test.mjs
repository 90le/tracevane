import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket, WebSocketServer } from 'ws';

import {
  createStandaloneStudioConfig,
  createStudioContext,
  createStudioServer,
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

function writeGatewayIdentity(root) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const deviceId = 'device-test-1';
  fs.mkdirSync(path.join(root, 'identity'), { recursive: true });
  fs.mkdirSync(path.join(root, 'devices'), { recursive: true });
  fs.writeFileSync(path.join(root, 'identity', 'device-auth.json'), JSON.stringify({
    deviceId,
    tokens: {
      operator: {
        scopes: ['operator.read', 'operator.write'],
      },
    },
  }, null, 2));
  fs.writeFileSync(path.join(root, 'identity', 'device.json'), JSON.stringify({
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }, null, 2));
  fs.writeFileSync(path.join(root, 'devices', 'paired.json'), JSON.stringify({
    [deviceId]: {
      publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    },
  }, null, 2));
}

async function waitFor(assertion, { timeoutMs = 10_000, intervalMs = 50 } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('waitFor timeout');
}

function createTranscriptHistoryMessage(id, role, text, timestamp) {
  return {
    id,
    role,
    timestamp,
    content: [
      { type: 'text', text },
    ],
  };
}

async function startFakeGateway() {
  const port = await getFreePort();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const match = url.pathname.match(/^\/sessions\/([^/]+)\/history$/);
    if (!match) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const sessionKey = decodeURIComponent(match[1] || '');
    const messages = historyBySession.get(sessionKey) || [];
    const accept = String(req.headers.accept || '').toLowerCase();
    if (!accept.includes('text/event-stream')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        sessionKey,
        items: messages,
        messages,
        hasMore: false,
      }));
      return;
    }

    const clients = historyClients.get(sessionKey) || new Set();
    historyClients.set(sessionKey, clients);
    clients.add(res);

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    writeSse(res, 'history', {
      sessionKey,
      items: messages,
      messages,
      hasMore: false,
    });

    const cleanup = () => {
      clients.delete(res);
      if (clients.size === 0) {
        historyClients.delete(sessionKey);
      }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  });
  const wss = new WebSocketServer({ server });
  let bridgeSocket = null;
  const sessionEventSubscribers = new Set();
  const sessionMessageSubscriptions = new Set();
  const historyBySession = new Map();
  const historyClients = new Map();

  function withTranscriptMeta(sessionKey, message, explicitSeq = null) {
    const current = historyBySession.get(sessionKey) || [];
    const seq = explicitSeq ?? (current.length + 1);
    return {
      ...message,
      __openclaw: {
        ...(message.__openclaw || {}),
        id: message.__openclaw?.id || message.id || `message-${seq}`,
        seq,
      },
    };
  }

  function writeSse(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'nonce-test-1' },
    }));
    socket.on('message', (raw) => {
      let frame = null;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (frame?.type === 'req' && frame.method === 'connect') {
        socket.send(JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { connected: true },
        }));
        return;
      }
      if (frame?.type === 'req' && frame.method === 'sessions.subscribe') {
        bridgeSocket = socket;
        sessionEventSubscribers.add(socket);
        socket.send(JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { subscribed: true },
        }));
        return;
      }
      if (frame?.type === 'req' && frame.method === 'sessions.messages.subscribe') {
        bridgeSocket = socket;
        sessionMessageSubscriptions.add(normalizeSessionKey(frame.params?.key));
        socket.send(JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { subscribed: true, key: normalizeSessionKey(frame.params?.key) },
        }));
        return;
      }
      if (frame?.type === 'req' && frame.method === 'sessions.messages.unsubscribe') {
        sessionMessageSubscriptions.delete(normalizeSessionKey(frame.params?.key));
        socket.send(JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { subscribed: false, key: normalizeSessionKey(frame.params?.key) },
        }));
        return;
      }
      if (frame?.type === 'req' && frame.method === 'chat.history') {
        const sessionKey = normalizeSessionKey(frame.params?.sessionKey);
        const messages = historyBySession.get(sessionKey) || [];
        socket.send(JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            sessionKey,
            messages,
          },
        }));
      }
    });
  });

  function normalizeSessionKey(value) {
    return String(value || '').trim();
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    port,
    async waitForStudioConnection() {
      await waitFor(() => {
        assert.ok(bridgeSocket, 'expected Tracevane gateway bridge connection');
      });
    },
    async waitForSessionEventSubscription() {
      await waitFor(() => {
        assert.ok(sessionEventSubscribers.size > 0, 'expected sessions.subscribe registration');
      });
    },
    seedSessionHistory(sessionKey, messages) {
      historyBySession.set(sessionKey, messages.map((message, index) => withTranscriptMeta(sessionKey, message, index + 1)));
    },
    appendSessionHistoryMessage(sessionKey, message) {
      const nextMessage = withTranscriptMeta(sessionKey, message);
      const current = historyBySession.get(sessionKey) || [];
      current.push(nextMessage);
      historyBySession.set(sessionKey, current);
      for (const client of historyClients.get(sessionKey) || []) {
        writeSse(client, 'message', {
          sessionKey,
          message: nextMessage,
          messageId: nextMessage.__openclaw?.id,
          messageSeq: nextMessage.__openclaw?.seq,
        });
      }
      if (bridgeSocket && sessionMessageSubscriptions.has(sessionKey)) {
        bridgeSocket.send(JSON.stringify({
          type: 'event',
          event: 'session.message',
          payload: {
            sessionKey,
            message: nextMessage,
            messageId: nextMessage.__openclaw?.id,
            messageSeq: nextMessage.__openclaw?.seq,
          },
        }));
      }
      return nextMessage;
    },
    emitSessionHistoryMessage(sessionKey, message, explicitSeq) {
      const nextMessage = withTranscriptMeta(sessionKey, message, explicitSeq);
      for (const client of historyClients.get(sessionKey) || []) {
        writeSse(client, 'message', {
          sessionKey,
          message: nextMessage,
          messageId: nextMessage.__openclaw?.id,
          messageSeq: nextMessage.__openclaw?.seq,
        });
      }
      if (bridgeSocket && sessionMessageSubscriptions.has(sessionKey)) {
        bridgeSocket.send(JSON.stringify({
          type: 'event',
          event: 'session.message',
          payload: {
            sessionKey,
            message: nextMessage,
            messageId: nextMessage.__openclaw?.id,
            messageSeq: nextMessage.__openclaw?.seq,
          },
        }));
      }
      return nextMessage;
    },
    replaceSessionHistory(sessionKey, messages) {
      const normalized = messages.map((message, index) => withTranscriptMeta(sessionKey, message, index + 1));
      historyBySession.set(sessionKey, normalized);
      for (const client of historyClients.get(sessionKey) || []) {
        writeSse(client, 'history', {
          sessionKey,
          items: normalized,
          messages: normalized,
          hasMore: false,
        });
      }
    },
    sendSessionChanged(payload) {
      for (const socket of sessionEventSubscribers) {
        if (socket.readyState !== WebSocket.OPEN) {
          continue;
        }
        socket.send(JSON.stringify({
          type: 'event',
          event: 'sessions.changed',
          payload,
        }));
      }
    },
    sendAgentEvent(payload) {
      assert.ok(bridgeSocket, 'expected Tracevane gateway bridge connection');
      bridgeSocket.send(JSON.stringify({
        type: 'event',
        event: 'agent',
        payload,
      }));
    },
    sendSessionToolEvent(payload) {
      assert.ok(bridgeSocket, 'expected Tracevane gateway bridge connection');
      bridgeSocket.send(JSON.stringify({
        type: 'event',
        event: 'session.tool',
        payload,
      }));
    },
    sendChatEvent(payload) {
      assert.ok(bridgeSocket, 'expected Tracevane gateway bridge connection');
      bridgeSocket.send(JSON.stringify({
        type: 'event',
        event: 'chat',
        payload,
      }));
    },
    sendChatSideResult(payload) {
      assert.ok(bridgeSocket, 'expected Tracevane gateway bridge connection');
      bridgeSocket.send(JSON.stringify({
        type: 'event',
        event: 'chat.side_result',
        payload,
      }));
    },
    async close() {
      for (const client of wss.clients) {
        try { client.close(); } catch {}
      }
      await new Promise((resolve, reject) => wss.close((error) => (error ? reject(error) : resolve())));
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function startStudio(root, gatewayPort) {
  const port = await getFreePort();
  const config = createStandaloneStudioConfig({
    port,
    openclawRoot: root,
    gatewayWsUrl: `ws://127.0.0.1:${gatewayPort}`,
  });
  const context = createStudioContext({
    config,
    logger: createLogger(),
  });
  const server = createStudioServer(context);
  await server.start();
  return {
    port,
    config,
    context,
    server,
    async close() {
      await server.stop();
    },
  };
}

test('run_overlay keeps tool-only runs visible while history stays canonical and shadow-restorable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-projection-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });

    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-tool-only',
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:00:00.000Z'),
      data: {
        phase: 'start',
        toolCallId: 'tool-1',
        name: 'browser',
        args: { url: 'https://example.com' },
      },
    });

    const runningProjection = await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'temporary.tool' && entry.runId === 'run-tool-only');
      assert.ok(event, 'expected temporary.tool event');
      assert.equal(event.tool?.status, 'running');
      assert.equal(event.tool?.name, 'browser');
      return event;
    });
    assert.equal(runningProjection.partial, false);

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-tool-only',
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:00:01.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-1',
        name: 'browser',
        partialResult: { status: 'navigating', summary: '50%' },
      },
    });

    await waitFor(() => {
      const projectionEvents = frontendEvents.filter((entry) => entry.kind === 'temporary.tool' && entry.runId === 'run-tool-only');
      const event = projectionEvents[projectionEvents.length - 1];
      assert.ok(event, 'expected updated temporary.tool event');
      assert.match(event.tool?.resultPreview || '', /50/i);
      assert.equal(event.tool?.status, 'running');
    });

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-tool-only',
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:00:02.000Z'),
      data: {
        phase: 'result',
        toolCallId: 'tool-1',
        name: 'browser',
        result: { ok: true, summary: 'done' },
      },
    });

    await waitFor(() => {
      const projectionEvents = frontendEvents.filter((entry) => entry.kind === 'temporary.tool' && entry.runId === 'run-tool-only');
      const event = projectionEvents[projectionEvents.length - 1];
      assert.ok(event, 'expected completed temporary.tool event');
      assert.equal(event.tool?.status, 'completed');
      assert.match(event.tool?.resultPreview || '', /done/i);
    });

    gateway.sendChatEvent({
      sessionKey,
      runId: 'run-tool-only',
      state: 'final',
      usage: {
        input: 10,
        output: 20,
        totalTokens: 30,
      },
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'NO_REPLY' },
        ],
      },
    });

    await waitFor(() => {
      const runtimeEvent = [...frontendEvents]
        .reverse()
        .find((entry) => entry.kind === 'runtime.state' && entry.runId === 'run-tool-only');
      assert.ok(runtimeEvent, 'expected terminal runtime.state event');
      assert.equal(runtimeEvent.runtime.state, 'completed');
    });

    const liveHistory = await studio.context.services.chat.getHistory(sessionKey);
    assert.equal(
      liveHistory.messages.some((message) => message.role === 'assistant' && message.runId === 'run-tool-only'),
      false,
    );
    assert.equal(liveHistory.overlays.some((overlay) => overlay.runId === 'run-tool-only'), true);
    assert.equal(liveHistory.pageInfo.hasMoreBefore, false);

    try { frontendWs.close(); } catch {}
    frontendWs = null;
    await studio.close();
    studio = null;
    await gateway.close();
    gateway = null;

    const restartedStudio = await startStudio(root, 0);
    const restartedFrontendEvents = [];
    const restartedHistory = await restartedStudio.context.services.chat.getHistory(sessionKey);
    assert.equal(
      restartedHistory.messages.some((message) => message.role === 'assistant' && message.runId === 'run-tool-only'),
      false,
    );
    assert.equal(restartedHistory.overlays.some((overlay) => overlay.runId === 'run-tool-only'), true);
    const repeatedHistory = await restartedStudio.context.services.chat.getHistory(sessionKey);
    assert.equal(
      repeatedHistory.messages.some((message) => message.role === 'assistant' && message.runId === 'run-tool-only'),
      false,
    );
    assert.equal(
      repeatedHistory.overlays.filter((overlay) => overlay.runId === 'run-tool-only').length,
      1,
    );
    const restartedFrontendWs = new WebSocket(`ws://127.0.0.1:${restartedStudio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    restartedFrontendWs.on('message', (raw) => {
      restartedFrontendEvents.push(JSON.parse(String(raw)));
    });
    await new Promise((resolve, reject) => {
      restartedFrontendWs.once('open', resolve);
      restartedFrontendWs.once('error', reject);
    });
    await waitFor(() => {
      const overlayEvent = restartedFrontendEvents.find((entry) => entry.kind === 'run_overlay' && entry.runId === 'run-tool-only');
      assert.ok(overlayEvent, 'expected shadow bootstrap run_overlay event');
      assert.equal(overlayEvent.terminal, true);
      assert.equal(overlayEvent.overlay.toolCalls?.[0]?.status, 'completed');
      assert.match(overlayEvent.overlay.toolCalls?.[0]?.resultPreview || '', /done/i);
    });
    try { restartedFrontendWs.close(); } catch {}
    await restartedStudio.close();
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('websocket chat stream replays buffered events after the last seen stream sequence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-stream-replay-'));
  const workspace = path.join(root, 'workspace');
  const primaryEvents = [];
  const keeperEvents = [];
  const replayEvents = [];

  let gateway = null;
  let studio = null;
  let primaryWs = null;
  let keeperWs = null;
  let replayWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;
    const baseWsUrl = `ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}&bootstrapSnapshot=0`;

    primaryWs = new WebSocket(baseWsUrl);
    primaryWs.on('message', (raw) => {
      primaryEvents.push(JSON.parse(String(raw)));
    });
    keeperWs = new WebSocket(baseWsUrl);
    keeperWs.on('message', (raw) => {
      keeperEvents.push(JSON.parse(String(raw)));
    });
    await Promise.all([
      new Promise((resolve, reject) => {
        primaryWs.once('open', resolve);
        primaryWs.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        keeperWs.once('open', resolve);
        keeperWs.once('error', reject);
      }),
    ]);
    await gateway.waitForStudioConnection();

    await waitFor(() => {
      const attachEvents = primaryEvents.filter((entry) => (
        entry.kind === 'runtime'
        || entry.kind === 'queue.state'
        || entry.kind === 'session.controls'
      ));
      assert.equal(attachEvents.length >= 3, true);
      assert.ok(
        attachEvents.every((entry) => Number.isFinite(entry.streamSeq) && entry.streamSeq > 0),
        'expected websocket attach state to advance the replay stream sequence',
      );
    });

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-replay',
      stream: 'tool',
      ts: Date.parse('2026-06-01T08:00:00.000Z'),
      data: {
        phase: 'start',
        toolCallId: 'tool-replay',
        name: 'browser',
        args: { url: 'https://example.com' },
      },
    });

    const firstLiveEvent = await waitFor(() => {
      const event = primaryEvents.find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-replay');
      assert.ok(event, 'expected live temporary.tool event');
      assert.equal(event.streamSeq > 0, true);
      return event;
    });
    const lastSeenSeq = firstLiveEvent.streamSeq;

    try { primaryWs.close(); } catch {}
    primaryWs = null;

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-replay',
      stream: 'tool',
      ts: Date.parse('2026-06-01T08:00:01.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-replay',
        name: 'browser',
        partialResult: { status: 'reading', summary: '80%' },
      },
    });
    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-replay',
      stream: 'tool',
      ts: Date.parse('2026-06-01T08:00:02.000Z'),
      data: {
        phase: 'result',
        toolCallId: 'tool-replay',
        name: 'browser',
        result: { ok: true, summary: 'done after reconnect' },
      },
    });

    await waitFor(() => {
      const event = [...keeperEvents].reverse().find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-replay');
      assert.ok(event, 'expected keeper to receive missed live event');
      assert.equal(event.tool.status, 'completed');
    });

    replayWs = new WebSocket(`${baseWsUrl}&lastStreamSeq=${lastSeenSeq}`);
    replayWs.on('message', (raw) => {
      replayEvents.push(JSON.parse(String(raw)));
    });
    await new Promise((resolve, reject) => {
      replayWs.once('open', resolve);
      replayWs.once('error', reject);
    });

    await waitFor(() => {
      const replayedToolEvents = replayEvents.filter((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-replay');
      assert.ok(replayedToolEvents.length >= 2, 'expected missed tool update/result replay');
      assert.ok(replayedToolEvents.every((entry) => entry.streamSeq > lastSeenSeq), 'expected replayed events after last seen seq only');
      assert.equal(replayedToolEvents[replayedToolEvents.length - 1].tool.status, 'completed');
      assert.match(replayedToolEvents[replayedToolEvents.length - 1].tool.resultPreview || '', /done after reconnect/i);
    });
  } finally {
    for (const socket of [primaryWs, keeperWs, replayWs]) {
      if (socket) {
        try { socket.close(); } catch {}
      }
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('temporary.tool synthesizes a stable tool run id when gateway tool events omit runId', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-tool-stream-no-runid-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });

    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    gateway.sendAgentEvent({
      sessionKey,
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:10:00.000Z'),
      data: {
        phase: 'start',
        toolCallId: 'tool-no-run-1',
        name: 'exec',
        args: { command: 'echo hello' },
      },
    });

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-no-run-1');
      assert.ok(event, 'expected temporary.tool start event');
      assert.equal(event.runId, 'tool:tool-no-run-1');
      assert.equal(event.tool?.status, 'running');
    });

    gateway.sendAgentEvent({
      sessionKey,
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:10:01.000Z'),
      data: {
        phase: 'result',
        toolCallId: 'tool-no-run-1',
        name: 'exec',
        result: { ok: true, stdout: 'hello' },
      },
    });

    await waitFor(() => {
      const event = [...frontendEvents]
        .reverse()
        .find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-no-run-1');
      assert.ok(event, 'expected terminal temporary.tool event');
      assert.equal(event.runId, 'tool:tool-no-run-1');
      assert.equal(event.tool?.status, 'completed');
      assert.match(event.tool?.resultPreview || '', /hello/i);
    });

    const liveHistory = await studio.context.services.chat.getHistory(sessionKey);
    const overlay = liveHistory.overlays.find((entry) => entry.runId === 'tool:tool-no-run-1');
    assert.ok(overlay, 'expected synthetic tool overlay in history');
    assert.equal(overlay?.toolCalls?.[0]?.status, 'completed');
    assert.match(overlay?.toolCalls?.[0]?.resultPreview || '', /hello/i);
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session.tool gateway events enter the live chat stream before final history sync', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-session-tool-stream-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });

    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();
    await gateway.waitForSessionEventSubscription();

    gateway.sendSessionToolEvent({
      sessionKey,
      runId: 'run-session-tool-1',
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:20:00.000Z'),
      data: {
        phase: 'start',
        toolCallId: 'tool-session-1',
        name: 'exec',
        args: { command: 'pwd' },
      },
    });

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-session-1');
      assert.ok(event, 'expected live temporary.tool from session.tool');
      assert.equal(event.runId, 'run-session-tool-1');
      assert.equal(event.tool?.status, 'running');
      assert.match(event.tool?.argsPreview || '', /pwd/);
    });
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agent assistant events are mirrored into temporary assistant drafts for realtime fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-agent-assistant-stream-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });

    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-agent-assistant-1',
      stream: 'tool',
      ts: Date.parse('2026-03-23T10:24:59.000Z'),
      data: {
        phase: 'update',
        toolCallId: 'tool-agent-assistant-1',
        name: 'read',
        partialResult: { text: 'tool output ready before assistant reply' },
      },
    });

    await waitFor(() => {
      const event = frontendEvents.find((entry) => (
        entry.kind === 'temporary.tool'
        && entry.runId === 'run-agent-assistant-1'
        && entry.tool?.toolCallId === 'tool-agent-assistant-1'
      ));
      assert.ok(event, 'expected running temporary.tool before assistant reply');
      assert.equal(event.tool?.status, 'running');
    });

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-agent-assistant-1',
      stream: 'assistant',
      ts: Date.parse('2026-03-23T10:25:00.000Z'),
      data: {
        delta: '正在准备工具调用。',
      },
    });

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'temporary.assistant' && entry.runId === 'run-agent-assistant-1');
      assert.ok(event, 'expected temporary.assistant fallback event');
      assert.match(event.accumulatedText || '', /准备工具/);
    });

    await waitFor(() => {
      const event = [...frontendEvents]
        .reverse()
        .find((entry) => entry.kind === 'run_overlay' && entry.runId === 'run-agent-assistant-1');
      assert.ok(event, 'expected run_overlay after assistant starts');
      assert.equal(event.overlay?.toolCalls?.[0]?.toolCallId, 'tool-agent-assistant-1');
      assert.equal(event.overlay?.toolCalls?.[0]?.status, 'completed');
      assert.match(event.overlay?.toolCalls?.[0]?.resultPreview || '', /tool output ready/i);
    });

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-agent-assistant-1',
      stream: 'assistant',
      ts: Date.parse('2026-03-23T10:25:01.000Z'),
      data: {
        delta: '继续执行。',
      },
    });

    await waitFor(() => {
      const event = [...frontendEvents]
        .reverse()
        .find((entry) => entry.kind === 'temporary.assistant' && entry.runId === 'run-agent-assistant-1');
      assert.ok(event, 'expected accumulated temporary.assistant fallback event');
      assert.match(event.accumulatedText || '', /准备工具调用。继续执行。/);
    });
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('item and command_output agent events become live temporary tool updates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-item-command-stream-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });

    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-item-command-1',
      stream: 'item',
      ts: Date.parse('2026-03-23T10:30:00.000Z'),
      data: {
        itemId: 'item-read-1',
        phase: 'start',
        kind: 'tool',
        title: 'read file',
        status: 'running',
        name: 'read',
        toolCallId: 'tool-read-live-1',
        meta: '/tmp/a.txt',
      },
    });

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-read-live-1');
      assert.ok(event, 'expected temporary.tool from item stream');
      assert.equal(event.runId, 'run-item-command-1');
      assert.equal(event.tool?.status, 'running');
      assert.match(event.tool?.argsPreview || '', /read file/);
    });

    gateway.sendAgentEvent({
      sessionKey,
      runId: 'run-item-command-1',
      stream: 'command_output',
      ts: Date.parse('2026-03-23T10:30:01.000Z'),
      data: {
        itemId: 'command-read-1',
        phase: 'delta',
        title: 'read file',
        toolCallId: 'tool-read-live-1',
        name: 'read',
        output: 'file line',
        status: 'running',
      },
    });

    await waitFor(() => {
      const event = [...frontendEvents]
        .reverse()
        .find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-read-live-1');
      assert.ok(event, 'expected temporary.tool update from command_output');
      assert.equal(event.tool?.status, 'running');
      assert.match(event.tool?.resultPreview || '', /file line/);
    });

    gateway.sendAgentEvent({
      runId: 'run-item-command-1',
      stream: 'command_output',
      ts: Date.parse('2026-03-23T10:30:02.000Z'),
      data: {
        itemId: 'command-read-1',
        phase: 'delta',
        title: 'read file',
        toolCallId: 'tool-read-live-1',
        name: 'read',
        output: 'file line without session key',
        status: 'running',
      },
    });

    await waitFor(() => {
      const event = [...frontendEvents]
        .reverse()
        .find((entry) => entry.kind === 'temporary.tool' && entry.tool?.toolCallId === 'tool-read-live-1');
      assert.ok(event, 'expected no-sessionKey command_output to match tracked run');
      assert.match(event.tool?.resultPreview || '', /without session key/);
    });
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('history pages cap unrelated tool-only orphan overlays so long sessions do not inflate every page', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-orphan-overlay-cap-'));
  const workspace = path.join(root, 'workspace');

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    for (let index = 0; index < 14; index += 1) {
      gateway.sendAgentEvent({
        sessionKey,
        runId: `run-tool-orphan-${index}`,
        stream: 'tool',
        ts: Date.parse(`2026-03-23T10:${String(index).padStart(2, '0')}:00.000Z`),
        data: {
          phase: 'start',
          toolCallId: `tool-orphan-${index}`,
          name: 'exec',
          args: { index },
        },
      });
      gateway.sendAgentEvent({
        sessionKey,
        runId: `run-tool-orphan-${index}`,
        stream: 'tool',
        ts: Date.parse(`2026-03-23T10:${String(index).padStart(2, '0')}:01.000Z`),
        data: {
          phase: 'result',
          toolCallId: `tool-orphan-${index}`,
          name: 'exec',
          result: { ok: true, index },
        },
      });
    }

    await waitFor(async () => {
      const history = await studio.context.services.chat.getHistory(sessionKey);
      assert.equal(history.overlays.length, 8);
      assert.deepEqual(
        history.overlays.map((overlay) => overlay.runId),
        Array.from({ length: 8 }, (_, offset) => `run-tool-orphan-${offset + 6}`),
      );
    });
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('chat.side_result forwards btw answers without injecting assistant transcript messages', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-btw-side-result-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];

  let gateway = null;
  let studio = null;
  let frontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });

    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    gateway.sendChatSideResult({
      kind: 'btw',
      runId: 'run-btw-1',
      sessionKey,
      question: 'what changed?',
      text: 'Only the tests changed.',
      isError: false,
      ts: Date.parse('2026-04-10T09:00:00.000Z'),
    });

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'side_result' && entry.runId === 'run-btw-1');
      assert.ok(event, 'expected side_result event');
      assert.equal(event.result?.kind, 'btw');
      assert.equal(event.result?.question, 'what changed?');
      assert.equal(event.result?.text, 'Only the tests changed.');
    });

    const liveHistory = await studio.context.services.chat.getHistory(sessionKey);
    assert.equal(
      liveHistory.messages.some((message) => message.role === 'assistant' && /Only the tests changed\./.test(message.text || '')),
      false,
    );
  } finally {
    try { frontendWs?.close(); } catch {}
    await studio?.close();
    await gateway?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('official canonical stream dual-writes history SSE updates and preserves durable mirror across rollback until reset', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-canonical-stream-'));
  const workspace = path.join(root, 'workspace');
  const frontendEvents = [];
  const secondFrontendEvents = [];
  const shadowStoreFile = path.join(root, 'studio', 'chat-message-shadows.json');

  let gateway = null;
  let rollbackGateway = null;
  let studio = null;
  let frontendWs = null;
  let secondFrontendWs = null;

  try {
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
    writeGatewayIdentity(root);

    gateway = await startFakeGateway();
    studio = await startStudio(root, gateway.port);

    const created = await studio.context.services.chat.createSession('main', {});
    const sessionKey = created.session.key;
    gateway.seedSessionHistory(sessionKey, [
      createTranscriptHistoryMessage('user-1', 'user', 'hello', '2026-03-24T09:00:00.000Z'),
      createTranscriptHistoryMessage('assistant-1', 'assistant', 'first answer', '2026-03-24T09:00:01.000Z'),
    ]);

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });
    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await gateway.waitForStudioConnection();

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'canonical.snapshot');
      assert.ok(event, 'expected canonical snapshot bootstrap event');
      assert.equal(event.source, 'history_sse');
      assert.deepEqual(event.messages.map((message) => message.id), ['user-1', 'assistant-1']);
    });
    const firstSnapshotVersion = frontendEvents.find((entry) => entry.kind === 'canonical.snapshot')?.version;
    assert.ok(firstSnapshotVersion);

    secondFrontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    secondFrontendWs.on('message', (raw) => {
      secondFrontendEvents.push(JSON.parse(String(raw)));
    });
    await new Promise((resolve, reject) => {
      secondFrontendWs.once('open', resolve);
      secondFrontendWs.once('error', reject);
    });
    await waitFor(() => {
      const event = secondFrontendEvents.find((entry) => entry.kind === 'canonical.snapshot');
      assert.ok(event, 'expected bootstrap snapshot for second subscriber');
      assert.equal(event.version, firstSnapshotVersion);
    });

    gateway.appendSessionHistoryMessage(
      sessionKey,
      createTranscriptHistoryMessage('assistant-2', 'assistant', 'second answer', '2026-03-24T09:00:02.000Z'),
    );

    await waitFor(() => {
      const event = frontendEvents.find((entry) => entry.kind === 'canonical.message' && entry.messageId === 'assistant-2');
      assert.ok(event, 'expected canonical message append event');
      assert.equal(event.messageSeq, 3);
      assert.equal(event.source, 'history_sse');
      assert.equal(event.version, firstSnapshotVersion);
    });

    gateway.seedSessionHistory(sessionKey, [
      createTranscriptHistoryMessage('user-1', 'user', 'hello', '2026-03-24T09:00:00.000Z'),
      createTranscriptHistoryMessage('assistant-1', 'assistant', 'first answer', '2026-03-24T09:00:01.000Z'),
      createTranscriptHistoryMessage('assistant-2', 'assistant', 'second answer', '2026-03-24T09:00:02.000Z'),
      createTranscriptHistoryMessage('assistant-3', 'assistant', 'third answer after resync', '2026-03-24T09:00:03.000Z'),
    ]);
    gateway.emitSessionHistoryMessage(
      sessionKey,
      createTranscriptHistoryMessage('assistant-3', 'assistant', 'third answer after resync', '2026-03-24T09:00:03.000Z'),
      6,
    );

    let resyncedSnapshotVersion = null;
    await waitFor(() => {
      const snapshots = frontendEvents.filter((entry) => entry.kind === 'canonical.snapshot');
      assert.ok(snapshots.length >= 2, 'expected full resync snapshot after seq gap');
      const latest = snapshots[snapshots.length - 1];
      assert.deepEqual(latest.messages.map((message) => message.id), ['user-1', 'assistant-1', 'assistant-2', 'assistant-3']);
      assert.notEqual(latest.version, firstSnapshotVersion);
      resyncedSnapshotVersion = latest.version;
    });
    assert.equal(
      frontendEvents.filter((entry) => entry.kind === 'canonical.message' && entry.messageId === 'assistant-3').length,
      0,
    );

    const liveHistory = await studio.context.services.chat.getHistory(sessionKey);
    assert.deepEqual(liveHistory.messages.map((message) => message.id), ['user-1', 'assistant-1', 'assistant-2', 'assistant-3']);

    try { frontendWs.close(); } catch {}
    frontendWs = null;
    try { secondFrontendWs.close(); } catch {}
    secondFrontendWs = null;
    await studio.close();
    studio = null;
    await gateway.close();
    gateway = null;

    rollbackGateway = await startFakeGateway();
    rollbackGateway.seedSessionHistory(sessionKey, [
      createTranscriptHistoryMessage('user-1', 'user', 'hello', '2026-03-24T09:00:00.000Z'),
    ]);
    studio = await startStudio(root, rollbackGateway.port);

    const protectedHistory = await studio.context.services.chat.getHistory(sessionKey);
    assert.deepEqual(protectedHistory.messages.map((message) => message.id), ['user-1', 'assistant-1', 'assistant-2', 'assistant-3']);

    fs.mkdirSync(path.dirname(shadowStoreFile), { recursive: true });
    fs.writeFileSync(shadowStoreFile, JSON.stringify({
      sessions: {
        [sessionKey]: [{
          sessionKey,
          requestId: 'shadow-1',
          runId: 'shadow-run-1',
          transportText: 'shadow text',
          text: 'shadow text',
          createdAt: '2026-03-24T09:00:04.000Z',
        }],
      },
    }, null, 2));

    frontendWs = new WebSocket(`ws://127.0.0.1:${studio.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });
    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });
    await rollbackGateway.waitForStudioConnection();
    await rollbackGateway.waitForSessionEventSubscription();

    rollbackGateway.sendSessionChanged({
      sessionKey,
      reason: 'reset',
      ts: Date.now(),
    });

    await waitFor(async () => {
      const history = await studio.context.services.chat.getHistory(sessionKey);
      assert.equal(history.messages.length, 0);
    });
    const shadowStore = JSON.parse(fs.readFileSync(shadowStoreFile, 'utf-8'));
    assert.equal(shadowStore.sessions?.[sessionKey], undefined);
    assert.ok(
      frontendEvents.some((entry) => entry.kind === 'canonical.snapshot' && entry.version === resyncedSnapshotVersion),
      'expected previous canonical version to remain observable before reset rollover',
    );
  } finally {
    if (frontendWs) {
      try { frontendWs.close(); } catch {}
    }
    if (secondFrontendWs) {
      try { secondFrontendWs.close(); } catch {}
    }
    if (studio) {
      await studio.close();
    }
    if (gateway) {
      await gateway.close();
    }
    if (rollbackGateway) {
      await rollbackGateway.close();
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
