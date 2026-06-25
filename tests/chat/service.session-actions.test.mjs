import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket, WebSocketServer } from 'ws';

import {
  createStandaloneTracevaneConfig,
  createTracevaneContext,
  createTracevaneServer,
} from '../../dist/apps/api/index.js';
import { requestOpenClawGateway } from '../../dist/apps/api/modules/platforms/openclaw-gateway.js';
import { TRACEVANE_CHAT_GATEWAY_METHODS } from '../../dist/types/chat.js';

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
    plugins: {
      entries: {
        tracevane: {
          enabled: true,
        },
      },
    },
  }, null, 2));
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


function openClawGatewayRuntimeTarget() {
  return {
    adapterKind: 'openclaw-gateway',
    agent: 'main',
    model: null,
    workDir: null,
    permissionMode: null,
  };
}

function registryPath(root) {
  return path.join(root, 'tracevane', 'chat-sessions.json');
}

function messageShadowPath(root) {
  return path.join(root, 'tracevane', 'chat-message-shadows.json');
}

function runShadowPath(root) {
  return path.join(root, 'tracevane', 'chat-run-shadows.json');
}

function historyIndexPath(root, sessionKey) {
  return path.join(root, 'tracevane', 'chat-index', `${Buffer.from(sessionKey, 'utf-8').toString('base64url')}.json`);
}

function readSqliteHistoryIndexCount(root, sessionKey) {
  const sqlitePath = path.join(root, 'tracevane', 'chat.sqlite');
  if (!fs.existsSync(sqlitePath)) {
    return 0;
  }
  const db = new DatabaseSync(sqlitePath);
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'history_indexes'").get();
    if (!table) {
      return 0;
    }
    const row = db.prepare('SELECT COUNT(*) AS count FROM history_indexes WHERE session_key = ?').get(sessionKey);
    return Number(row?.count || 0);
  } finally {
    db.close();
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function createContextForRoot(root, gatewayWsUrl = 'ws://127.0.0.1:1', options = {}) {
  const config = createStandaloneTracevaneConfig({
    port: await getFreePort(),
    openclawRoot: root,
    gatewayWsUrl,
  });
  return createTracevaneContext({
    config,
    logger: createLogger(),
    chatOptions: options.chatOptions,
  });
}

async function createServerForRoot(root, gatewayWsUrl = 'ws://127.0.0.1:1') {
  const context = await createContextForRoot(root, gatewayWsUrl);
  const server = createTracevaneServer(context);
  await server.start();
  return {
    context,
    server,
    port: context.config.port,
  };
}

async function startFakeGateway(options = {}) {
  const requests = [];
  const port = await getFreePort();
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const sockets = new Set();

  wss.on('connection', (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'nonce-test-1' },
    }));

    socket.on('message', async (raw) => {
      let frame = null;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (frame?.type !== 'req') {
        return;
      }

      if (frame.method === 'connect') {
        socket.send(JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { connected: true },
        }));
        return;
      }

      requests.push({
        method: frame.method,
        params: frame.params,
      });

      let payload = { ok: true };
      let frameOk = true;
      let frameErrorMessage = 'Gateway request failed';
      let skipResponse = false;
      if (typeof options.onRequest === 'function') {
        const customPayload = await options.onRequest({
          method: frame.method,
          params: frame.params,
        });
        if (customPayload && typeof customPayload === 'object' && !Array.isArray(customPayload)) {
          if (customPayload.__skipResponse === true) {
            skipResponse = true;
          }
          if (customPayload.__frameOk === false) {
            frameOk = false;
            frameErrorMessage = String(customPayload.errorMessage || frameErrorMessage);
          }
          if (Object.prototype.hasOwnProperty.call(customPayload, 'payload')) {
            payload = customPayload.payload;
          } else if (!Object.prototype.hasOwnProperty.call(customPayload, '__frameOk') && !Object.prototype.hasOwnProperty.call(customPayload, '__skipResponse')) {
            payload = customPayload;
          }
        }
      }
      if (skipResponse) {
        return;
      }
      socket.send(JSON.stringify({
        type: 'res',
        id: frame.id,
        ok: frameOk,
        ...(frameOk
          ? { payload }
          : { error: { message: frameErrorMessage } }),
      }));
    });

    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  return {
    port,
    requests,
    emit(event, payload) {
      const frame = JSON.stringify({
        type: 'event',
        event,
        payload,
      });
      for (const socket of sockets) {
        try {
          socket.send(frame);
        } catch {}
      }
    },
    async close() {
      for (const client of wss.clients) {
        try { client.close(); } catch {}
      }
      await new Promise((resolve, reject) => wss.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function waitFor(assertion, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw lastError || new Error('waitFor timed out');
}

test('chat health treats an online gateway as usable even when the system service unit is failed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-systemd-failed-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    let systemHealthCalls = 0;
    context.services.system.getHealth = async () => {
      systemHealthCalls += 1;
      return {
        checkedAt: '2026-06-01T21:01:14.197Z',
        gateway: 'online',
        gatewayConnected: true,
        pid: 12345,
        port: context.config.port,
        gatewayPort: 31879,
        serviceState: 'failed',
        serviceSubState: 'failed',
      };
    };

    const health = await context.services.chat.getHealth();
    assert.equal(health.gatewayReachable, true);
    assert.equal(Object.prototype.hasOwnProperty.call(health, 'serviceState'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(health, 'serviceSubState'), false);

    const bootstrap = await context.services.chat.getBootstrap({
      recentLimit: 5,
      historyLimit: 5,
    });
    assert.equal(bootstrap.diagnostics.gatewayReachable, true);

    const created = await context.services.chat.createSession('main', {});
    assert.equal(created.session.runtime.gatewayConnected, true);
    assert.equal(created.session.permissions.canSend, true);
    assert.equal(systemHealthCalls, 0);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('created chat sessions default to native Codex when no runtime target is supplied', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-default-runtime-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);

    const created = await context.services.chat.createSession('main', {
      label: 'Default native session',
    });

    assert.match(created.session.key, /^agent:main:agent-chat:direct:tracevane-/);
    assert.deepEqual(created.session.runtimeTarget, {
      adapterKind: 'native-cli',
      agent: 'codex',
      model: null,
      workDir: null,
      permissionMode: null,
    });

    const registry = readJson(registryPath(root), {});
    assert.deepEqual(registry[created.session.key].runtimeTarget, created.session.runtimeTarget);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('created chat sessions persist runtime target metadata for future native CLI adapters', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-runtime-target-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);

    const created = await context.services.chat.createSession('main', {
      label: 'Native Codex session',
      runtimeTarget: {
        adapterKind: 'native-cli',
        agent: 'codex',
        model: 'gpt-5.5',
        workDir: '/tmp/tracevane-native-codex',
        permissionMode: 'yolo',
      },
    });

    assert.deepEqual(created.session.runtimeTarget, {
      adapterKind: 'native-cli',
      agent: 'codex',
      model: 'gpt-5.5',
      workDir: '/tmp/tracevane-native-codex',
      permissionMode: 'yolo',
    });

    assert.match(created.session.key, /^agent:main:agent-chat:direct:tracevane-/);
    assert.equal(created.session.source.channel, 'agent-chat');
    assert.equal(created.session.deliveryContext.channel, 'agent-chat');

    const registry = readJson(registryPath(root), {});
    assert.deepEqual(registry[created.session.key].runtimeTarget, created.session.runtimeTarget);

    const restoredContext = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const restored = await restoredContext.services.chat.listSessions('main', { localOnly: true });
    const restoredSession = restored.sessions.find((session) => session.key === created.session.key);
    assert.deepEqual(restoredSession?.runtimeTarget, created.session.runtimeTarget);
    assert.equal(restoredSession?.source.channel, 'agent-chat');
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});



test('native CLI chat sessions send through channel connector runner and persist native session ids', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-native-send-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const runnerCalls = [];
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`, {
      chatOptions: {
        agentProcessRunner: async (request) => {
          runnerCalls.push(request);
          request.onProgress?.({
            checkedAt: new Date().toISOString(),
            type: 'tool',
            rawType: 'tool_call',
            itemType: 'exec',
            text: 'cat package.json',
            phase: 'intermediate',
            toolName: 'exec',
            toolCallId: 'native-tool-1',
          });
          request.onProgress?.({
            checkedAt: new Date().toISOString(),
            type: 'assistant',
            rawType: 'message',
            itemType: null,
            text: 'native progress',
            phase: 'intermediate',
          });
          return {
            exitCode: 0,
            signal: null,
            stdout: `${JSON.stringify({ type: 'thread.started', thread_id: 'thread-native-1' })}\n${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'native reply' }] } })}\n`,
            stderr: '',
            durationMs: 12,
            timedOut: false,
            cancelled: false,
            error: null,
            progressEvents: [{
              checkedAt: new Date().toISOString(),
              type: 'assistant',
              rawType: 'message',
              itemType: null,
              text: 'native reply',
              phase: 'final',
            }],
          };
        },
      },
    });

    const workspaceFile = path.join(root, 'workspace', 'notes.md');
    fs.writeFileSync(workspaceFile, '# Native attachment\n');

    const created = await context.services.chat.createSession('main', {
      label: 'Native Codex runnable',
      runtimeTarget: {
        adapterKind: 'native-cli',
        agent: 'codex',
        model: 'gpt-5.5',
        workDir: path.join(root, 'workspace'),
        permissionMode: 'yolo',
      },
    });

    const ack = await context.services.chat.send(created.session.key, {
      text: 'hello native codex',
      clientRequestId: 'native-run-1',
      fileRefs: [{
        id: 'workspace-note',
        relativePath: 'notes.md',
        resourceRef: 'workspace:notes.md',
        fileName: 'notes.md',
        kind: 'file',
        mimeType: 'text/markdown',
      }],
    });

    assert.equal(ack.status, 'started');
    assert.equal(ack.runtime.state, 'completed');
    assert.equal(runnerCalls.length, 1);
    assert.equal(runnerCalls[0].agent, 'codex');
    assert.equal(runnerCalls[0].sessionMode, 'new');
    assert.equal(runnerCalls[0].permissionMode, 'yolo');
    assert.match(runnerCalls[0].env.OPENAI_BASE_URL, /\/v1$/);
    assert.match(runnerCalls[0].stdin, new RegExp(`local: ${workspaceFile.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`));
    assert.match(runnerCalls[0].stdin, /file: notes\.md/);

    const history = await context.services.chat.getHistory(created.session.key, { limit: 10 });
    assert.deepEqual(history.messages.map((message) => message.role), ['user', 'assistant']);
    assert.equal(history.messages[1].text, 'native reply');
    assert.ok(history.overlays.some((overlay) => overlay.toolCalls.some((tool) => tool.toolCallId === 'native-tool-1')));
    assert.ok(history.observability.toolCards.some((tool) => tool.toolCallId === 'native-tool-1'));
    assert.ok(history.observability.timeline.some((item) => item.kind === 'assistant' && /native progress/.test(item.detail || '')));

    const registry = readJson(registryPath(root), {});
    assert.ok(registry[created.session.key].runtimeSession?.agentNativeSessionId);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('patching runtime target clears native CLI resume session state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-runtime-reset-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const runnerCalls = [];
    let runIndex = 0;
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`, {
      chatOptions: {
        agentProcessRunner: async (request) => {
          runnerCalls.push(request);
          runIndex += 1;
          return {
            exitCode: 0,
            signal: null,
            stdout: `${JSON.stringify({ type: 'thread.started', thread_id: `thread-native-${runIndex}` })}
${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: `native reply ${runIndex}` }] } })}
`,
            stderr: '',
            durationMs: 8,
            timedOut: false,
            cancelled: false,
            error: null,
          };
        },
      },
    });

    const created = await context.services.chat.createSession('main', {
      label: 'Native Codex retargetable',
      runtimeTarget: {
        adapterKind: 'native-cli',
        agent: 'codex',
        model: 'gpt-5.5',
        workDir: path.join(root, 'workspace'),
        permissionMode: 'yolo',
      },
    });

    await context.services.chat.send(created.session.key, {
      text: 'first native turn',
      clientRequestId: 'native-retarget-1',
    });
    assert.equal(runnerCalls[0]?.sessionMode, 'new');

    const registryAfterFirstSend = readJson(registryPath(root), {});
    assert.equal(registryAfterFirstSend[created.session.key].runtimeSession?.codexThreadId, 'thread-native-1');

    await context.services.chat.patchSession(created.session.key, {
      runtimeTarget: {
        model: 'gpt-5.4',
      },
    });

    const registryAfterPatch = readJson(registryPath(root), {});
    assert.equal(registryAfterPatch[created.session.key].runtimeSession, undefined);
    assert.equal(registryAfterPatch[created.session.key].runtimeTarget.model, 'gpt-5.4');

    await context.services.chat.send(created.session.key, {
      text: 'second native turn after model change',
      clientRequestId: 'native-retarget-2',
    });

    assert.equal(runnerCalls.length, 2);
    assert.equal(runnerCalls[1].sessionMode, 'new');
    assert.equal(runnerCalls[1].codexThreadId, null);
    assert.equal(runnerCalls[1].agentNativeSessionId, null);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('native CLI reset and delete stay inside native adapter without OpenClaw gateway RPCs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-native-lifecycle-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const runnerCalls = [];
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`, {
      chatOptions: {
        agentProcessRunner: async (request) => {
          runnerCalls.push(request);
          return {
            exitCode: 0,
            signal: null,
            stdout: `${JSON.stringify({ type: 'thread.started', thread_id: 'thread-native-lifecycle' })}\n${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'native lifecycle reply' }] } })}\n`,
            stderr: '',
            durationMs: 5,
            timedOut: false,
            cancelled: false,
            error: null,
          };
        },
      },
    });

    const created = await context.services.chat.createSession('main', {
      label: 'Native lifecycle',
      runtimeTarget: {
        adapterKind: 'native-cli',
        agent: 'codex',
        model: 'gpt-5.5',
        workDir: path.join(root, 'workspace'),
        permissionMode: 'yolo',
      },
    });

    await context.services.chat.send(created.session.key, {
      text: 'hello native lifecycle',
      clientRequestId: 'native-lifecycle-1',
    });
    assert.equal(runnerCalls.length, 1);
    assert.equal(readJson(registryPath(root), {})[created.session.key].runtimeSession?.codexThreadId, 'thread-native-lifecycle');

    const reset = await context.services.chat.reset(created.session.key);
    assert.equal(reset.ok, true);
    assert.equal(readJson(registryPath(root), {})[created.session.key].runtimeSession, undefined);

    const deleted = await context.services.chat.deleteSession(created.session.key);
    assert.equal(deleted.ok, true);

    assert.deepEqual(
      gateway.requests.map((entry) => entry.method).filter((method) => method === 'chat.abort' || method === 'sessions.reset' || method === 'sessions.delete'),
      [],
    );
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('native CLI chat sessions default to the Tracevane project root when no workDir is set', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-native-default-workdir-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const runnerCalls = [];
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`, {
      chatOptions: {
        agentProcessRunner: async (request) => {
          runnerCalls.push(request);
          return {
            exitCode: 0,
            signal: null,
            stdout: `${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'default cwd reply' }] } })}\n`,
            stderr: '',
            durationMs: 5,
            timedOut: false,
            cancelled: false,
            error: null,
          };
        },
      },
    });

    const created = await context.services.chat.createSession('main', {
      label: 'Native default cwd',
      runtimeTarget: {
        adapterKind: 'native-cli',
        agent: 'codex',
        model: 'gpt-5.5',
        permissionMode: 'yolo',
      },
    });

    await context.services.chat.send(created.session.key, {
      text: 'hello default cwd',
      clientRequestId: 'native-default-cwd-1',
    });

    assert.equal(runnerCalls.length, 1);
    assert.equal(runnerCalls[0].cwd, context.config.projectRoot);
    assert.notEqual(runnerCalls[0].cwd, root);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('patching a chat session can update runtime target metadata', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-chat-runtime-patch-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);

    const created = await context.services.chat.createSession('main', {
      label: 'Runtime editable session',
      runtimeTarget: {
        adapterKind: 'native-cli',
        agent: 'codex',
        model: 'gpt-5.5',
        workDir: '/tmp/old-workdir',
        permissionMode: 'yolo',
      },
    });

    const patched = await context.services.chat.patchSession(created.session.key, {
      runtimeTarget: {
        agent: 'claude-code',
        model: 'claude-sonnet-4-6',
        workDir: '/tmp/new-workdir',
        permissionMode: 'plan',
      },
    });

    assert.deepEqual(patched.session.runtimeTarget, {
      adapterKind: 'native-cli',
      agent: 'claude-code',
      model: 'claude-sonnet-4-6',
      workDir: '/tmp/new-workdir',
      permissionMode: 'plan',
    });

    const registry = readJson(registryPath(root), {});
    assert.deepEqual(registry[created.session.key].runtimeTarget, patched.session.runtimeTarget);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ui queued message flushes when the active run settles before enqueue reaches the backend', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-queue-idle-flush-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method === 'chat.send') {
          return {
            ok: true,
            status: 'started',
            runId: 'run-late-queued',
          };
        }
        return { ok: true };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });

    await context.services.chat.enqueue(created.session.key, {
      text: 'late queued message',
      clientRequestId: 'late-queued-1',
      flushWhenIdle: true,
    });

    await waitFor(async () => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 1);
      assert.equal(sendRequests[0]?.params.message, 'late queued message');
      const queue = await context.services.chat.getQueue(created.session.key);
      assert.equal(queue.items.length, 0);
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('blocked queued message can be retried without sending a separate nudge', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-queue-blocked-retry-'));
  let gateway = null;
  let sendCount = 0;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method !== 'chat.send') {
          return { ok: true };
        }
        sendCount += 1;
        if (sendCount === 1) {
          return {
            __frameOk: false,
            errorMessage: 'temporary send failure',
          };
        }
        return {
          ok: true,
          status: 'started',
          runId: `run-${sendCount}`,
        };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    await context.services.chat.enqueue(sessionKey, {
      text: 'retry without nudge',
      clientRequestId: 'blocked-retry-1',
      flushWhenIdle: true,
    });

    let blockedEntry = null;
    await waitFor(async () => {
      const queue = await context.services.chat.getQueue(sessionKey);
      assert.equal(queue.items.length, 1);
      assert.equal(queue.items[0]?.status, 'blocked');
      blockedEntry = queue.items[0];
    });

    await context.services.chat.patchQueueEntry(sessionKey, blockedEntry.id, {
      text: blockedEntry.text,
      clientRequestId: blockedEntry.clientRequestId || undefined,
      flushWhenIdle: true,
    });

    await waitFor(async () => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 2);
      assert.deepEqual(sendRequests.map((entry) => entry.params.message), [
        'retry without nudge',
        'retry without nudge',
      ]);
      const queue = await context.services.chat.getQueue(sessionKey);
      assert.equal(queue.items.length, 0);
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OpenClaw platform gateway proxy forwards local management rpc through the backend gateway transport', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-openclaw-gateway-'));
  const gateway = await startFakeGateway({
    onRequest({ method, params }) {
      if (method === 'models.list') {
        return {
          models: [
            { id: 'gpt-5.4', provider: 'openai' },
          ],
        };
      }
      if (method === 'skills.status') {
        return {
          workspaceDir: '/tmp/workspace',
          managedSkillsDir: '/tmp/skills',
          skills: [
            {
              name: 'calendar',
              description: 'Calendar helper',
              eligible: true,
              disabled: false,
              blockedByAllowlist: false,
            },
          ],
        };
      }
      if (method === 'exec.approvals.get') {
        return {
          path: '/tmp/exec-approvals.json',
          exists: true,
          hash: 'hash-1',
          file: {
            version: 1,
            agents: {
              main: {
                allowlist: [{ pattern: 'git status' }],
              },
            },
          },
        };
      }
      if (method === 'exec.approvals.set') {
        return {
          path: '/tmp/exec-approvals.json',
          exists: true,
          hash: 'hash-2',
          file: params.file,
        };
      }
      return { ok: true };
    },
  });

  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });

    const models = await requestOpenClawGateway(context.config, {
      method: 'models.list',
      params: {},
    });
    assert.equal(models.models?.[0]?.id, 'gpt-5.4');

    const skills = await requestOpenClawGateway(context.config, {
      method: 'skills.status',
      params: {
        agentId: 'main',
      },
    });
    assert.equal(skills.skills?.[0]?.name, 'calendar');

    const approvals = await requestOpenClawGateway(context.config, {
      method: 'exec.approvals.get',
      params: {},
    });
    assert.equal(approvals.file?.agents?.main?.allowlist?.[0]?.pattern, 'git status');

    await requestOpenClawGateway(context.config, {
      method: 'exec.approvals.set',
      params: {
        baseHash: 'hash-1',
        file: {
          version: 1,
          agents: {
            main: {
              allowlist: [{ pattern: 'npm test' }],
            },
          },
        },
      },
    });

    await requestOpenClawGateway(context.config, {
      method: 'sessions.patch',
      params: {
        sessionKey: created.session.key,
        model: 'gpt-5.4',
      },
    });

    const modelsRequest = gateway.requests.find((entry) => entry.method === 'models.list');
    assert.ok(modelsRequest);
    const skillsRequest = gateway.requests.find((entry) => entry.method === 'skills.status');
    assert.ok(skillsRequest);
    assert.equal(skillsRequest.params.agentId, 'main');
    const approvalsGetRequest = gateway.requests.find((entry) => entry.method === 'exec.approvals.get');
    assert.ok(approvalsGetRequest);
    const approvalsSetRequest = gateway.requests.find((entry) => entry.method === 'exec.approvals.set');
    assert.ok(approvalsSetRequest);
    assert.equal(approvalsSetRequest.params.baseHash, 'hash-1');
    assert.equal(approvalsSetRequest.params.file.agents.main.allowlist[0].pattern, 'npm test');
    const patchRequest = gateway.requests.find((entry) => entry.method === 'sessions.patch');
    assert.ok(patchRequest);
    assert.equal(patchRequest.params.key, created.session.key);
    assert.equal(patchRequest.params.model, 'gpt-5.4');
  } finally {
    await gateway.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('queued entries flush in FIFO order after the active run settles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-queue-flush-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    await context.services.chat.send(sessionKey, {
      text: 'first message',
      clientRequestId: 'send-1',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'second message',
      clientRequestId: 'queued-2',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'third message',
      clientRequestId: 'queued-3',
    });

    await waitFor(() => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 1);
    });

    await context.services.chat.abort(sessionKey);
    await waitFor(async () => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 2);
      const queue = await context.services.chat.getQueue(sessionKey);
      assert.deepEqual(queue.items.map((item) => item.previewText), ['third message']);
    });

    await context.services.chat.abort(sessionKey);
    await waitFor(async () => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 3);
      const messages = sendRequests.map((entry) => entry.params.message);
      assert.deepEqual(messages, ['first message', 'second message', 'third message']);
      const queue = await context.services.chat.getQueue(sessionKey);
      assert.equal(queue.items.length, 0);
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('queued retry reuses the same idempotency key after a transient send failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-queue-idempotency-retry-'));
  let gateway = null;
  let sendCount = 0;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method !== 'chat.send') {
          return { ok: true };
        }
        sendCount += 1;
        if (sendCount === 2) {
          return {
            __frameOk: false,
            errorMessage: 'temporary send failure',
          };
        }
        return {
          ok: true,
          status: 'started',
          runId: `run-${sendCount}`,
        };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    await context.services.chat.send(sessionKey, {
      text: 'first message',
      clientRequestId: 'send-1',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'retry me',
    });

    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-1',
      message: {
        id: 'assistant-run-1',
        role: 'assistant',
        text: 'first done',
        createdAt: '2026-04-11T10:00:00.000Z',
      },
    });

    await waitFor(async () => {
      const queue = await context.services.chat.getQueue(sessionKey);
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(queue.items.length, 1);
      assert.equal(queue.items[0]?.status, 'blocked');
      assert.equal(queue.items[0]?.previewText, 'retry me');
      assert.equal(
        queue.items[0]?.deliveryRequestId,
        String(sendRequests[1]?.params.idempotencyKey || ''),
      );
    });

    await context.services.chat.send(sessionKey, {
      text: 'nudge retry',
      clientRequestId: 'send-nudge',
    });

    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-3',
      message: {
        id: 'assistant-run-3',
        role: 'assistant',
        text: 'nudge done',
        createdAt: '2026-04-11T10:00:01.000Z',
      },
    });

    await waitFor(async () => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 4);
      assert.deepEqual(sendRequests.map((entry) => entry.params.message), [
        'first message',
        'retry me',
        'nudge retry',
        'retry me',
      ]);

      const firstRetryKey = String(sendRequests[1]?.params.idempotencyKey || '');
      const secondRetryKey = String(sendRequests[3]?.params.idempotencyKey || '');
      assert.equal(firstRetryKey.length > 0, true);
      assert.equal(secondRetryKey, firstRetryKey);

      const queue = await context.services.chat.getQueue(sessionKey);
      assert.equal(queue.items.length, 0);
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('duplicate terminal chat events only flush one queued entry while the next run is starting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-queue-final-dedupe-'));
  let gateway = null;
  let sendCount = 0;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method === 'chat.send') {
          sendCount += 1;
          return {
            ok: true,
            status: 'started',
            runId: `run-${sendCount}`,
          };
        }
        return { ok: true };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    await context.services.chat.send(sessionKey, {
      text: 'first message',
      clientRequestId: 'send-1',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'second message',
      clientRequestId: 'queued-2',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'third message',
      clientRequestId: 'queued-3',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'fourth message',
      clientRequestId: 'queued-4',
    });

    await waitFor(() => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 1);
    });

    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-1',
      message: {
        id: 'assistant-run-1',
        role: 'assistant',
        text: 'first done',
        createdAt: '2026-04-09T16:20:00.000Z',
      },
    });
    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-1',
      message: {
        id: 'assistant-run-1-duplicate',
        role: 'assistant',
        text: 'first done duplicate',
        createdAt: '2026-04-09T16:20:00.050Z',
      },
    });

    await waitFor(async () => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 2);
      const queue = await context.services.chat.getQueue(sessionKey);
      assert.deepEqual(queue.items.map((item) => item.previewText), ['third message', 'fourth message']);
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('queued auto-send emits the queued user message before the follow-up reply settles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-queue-canonical-user-'));
  let gateway = null;
  let tracevane = null;
  let sendCount = 0;
  let frontendWs = null;
  const frontendEvents = [];
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method === 'chat.send') {
          sendCount += 1;
          return {
            ok: true,
            status: 'started',
            runId: `run-${sendCount}`,
          };
        }
        return { ok: true };
      },
    });
    tracevane = await createServerForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await tracevane.context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    frontendWs = new WebSocket(`ws://127.0.0.1:${tracevane.port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
    frontendWs.on('message', (raw) => {
      frontendEvents.push(JSON.parse(String(raw)));
    });
    await new Promise((resolve, reject) => {
      frontendWs.once('open', resolve);
      frontendWs.once('error', reject);
    });

    await tracevane.context.services.chat.send(sessionKey, {
      text: 'first message',
      clientRequestId: 'send-1',
    });
    await tracevane.context.services.chat.enqueue(sessionKey, {
      text: 'second message',
      clientRequestId: 'queued-2',
    });

    await waitFor(() => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 1);
    });

    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-1',
      message: {
        id: 'assistant-run-1',
        role: 'assistant',
        text: 'first done',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
    });

    await waitFor(() => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 2);
    });

    await waitFor(() => {
      const sawQueuedUserCanonicalMessage = frontendEvents.some((entry) => (
        entry.kind === 'canonical.message'
        && entry.message?.role === 'user'
        && entry.message?.runId === 'run-2'
        && entry.message?.text === 'second message'
      ));
      const sawQueuedUserSnapshot = frontendEvents.some((entry) => (
        entry.kind === 'canonical.snapshot'
        && Array.isArray(entry.messages)
        && entry.messages.some((message) => (
          message?.role === 'user'
          && message?.runId === 'run-2'
          && message?.text === 'second message'
        ))
      ));
      assert.ok(
        sawQueuedUserCanonicalMessage || sawQueuedUserSnapshot,
        'expected queued auto-send user message to reach frontend before run-2 settles',
      );
    });
  } finally {
    try { frontendWs?.close(); } catch {}
    await tracevane?.server?.stop?.();
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reset ignores stale terminal events from the pre-reset run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-reset-stale-run-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method === 'chat.send') {
          return {
            ok: true,
            status: 'started',
            runId: 'run-before-reset',
          };
        }
        return { ok: true };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    await context.services.chat.send(sessionKey, {
      text: 'message before reset',
      clientRequestId: 'send-before-reset',
    });

    const resetResponse = await context.services.chat.reset(sessionKey);
    assert.equal(resetResponse.ok, true);
    assert.deepEqual(
      gateway.requests
        .map((entry) => entry.method)
        .filter((method) => method === 'chat.send' || method === 'chat.abort' || method === 'sessions.reset'),
      [
      'chat.send',
      'chat.abort',
      'sessions.reset',
      ],
    );

    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-before-reset',
      message: {
        id: 'assistant-stale-after-reset',
        role: 'assistant',
        text: 'this stale reply must not come back',
        createdAt: '2026-04-11T11:00:00.000Z',
      },
    });

    await waitFor(async () => {
      const history = await context.services.chat.getHistory(sessionKey);
      assert.equal(history.messages.length, 0);
      assert.equal(history.runtime.activeRunId, null);
      assert.equal(history.runtime.state, 'idle');
      return history;
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('abort ignores stale terminal events from the aborted run while a queued follow-up is running', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-abort-stale-run-'));
  let gateway = null;
  let sendCount = 0;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest({ method }) {
        if (method === 'chat.send') {
          sendCount += 1;
          return {
            ok: true,
            status: 'started',
            runId: `run-${sendCount}`,
          };
        }
        if (method === 'chat.abort') {
          return {
            ok: true,
            aborted: true,
            runIds: ['run-1'],
          };
        }
        return { ok: true };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;

    await context.services.chat.send(sessionKey, {
      text: 'first message',
      clientRequestId: 'send-1',
    });
    await context.services.chat.enqueue(sessionKey, {
      text: 'second message',
      clientRequestId: 'queued-2',
    });

    await waitFor(() => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 1);
    });

    const abortResponse = await context.services.chat.abort(sessionKey);
    assert.equal(abortResponse.ok, true);
    assert.equal(abortResponse.hadActiveRun, true);

    await waitFor(() => {
      const sendRequests = gateway.requests.filter((entry) => entry.method === 'chat.send');
      assert.equal(sendRequests.length, 2);
      assert.deepEqual(sendRequests.map((entry) => entry.params.message), ['first message', 'second message']);
    });

    gateway.emit('chat', {
      sessionKey,
      state: 'final',
      runId: 'run-1',
      message: {
        id: 'assistant-stale-run-1',
        role: 'assistant',
        text: 'this stale reply must stay hidden',
        createdAt: '2026-04-11T12:00:00.000Z',
      },
    });

    await waitFor(async () => {
      const history = await context.services.chat.getHistory(sessionKey);
      assert.equal(history.runtime.activeRunId, 'run-2');
      assert.equal(history.runtime.state, 'running');
      assert.equal(
        history.messages.some((message) => message.id === 'assistant-stale-run-1' || message.text === 'this stale reply must stay hidden'),
        false,
      );
    });
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('draft session patch/delete persists presentation metadata without gateway delete', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-session-actions-draft-'));
  try {
    writeOpenClawConfig(root);
    const context = await createContextForRoot(root);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });

    const patched = await context.services.chat.patchSession(created.session.key, {
      label: 'Renamed draft',
      archived: true,
    });
    assert.equal(patched.ok, true);
    assert.equal(patched.session.label, 'Renamed draft');
    assert.equal(patched.session.presentation.customLabel, 'Renamed draft');
    assert.equal(patched.session.presentation.archived, true);
    assert.ok(patched.session.presentation.archivedAt);

    const listed = await context.services.chat.listSessions('main');
    const row = listed.sessions.find((entry) => entry.key === created.session.key);
    assert.ok(row);
    assert.equal(row.label, 'Renamed draft');
    assert.equal(row.presentation.customLabel, 'Renamed draft');
    assert.equal(row.presentation.archived, true);

    const registry = readJson(registryPath(root), {});
    assert.equal(registry[created.session.key].customLabel, 'Renamed draft');
    assert.ok(registry[created.session.key].archivedAt);

    const deleted = await context.services.chat.deleteSession(created.session.key);
    assert.deepEqual(deleted, {
      ok: true,
      sessionKey: created.session.key,
    });

    const afterDelete = await context.services.chat.listSessions('main');
    assert.equal(afterDelete.sessions.some((entry) => entry.key === created.session.key), false);
    const registryAfterDelete = readJson(registryPath(root), {});
    assert.equal(registryAfterDelete[created.session.key], undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('local-only session listing serves local catalog rows without gateway sessions.list', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-session-local-list-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway({
      onRequest(request) {
        if (request.method === 'sessions.list') {
          return {
            sessions: [],
          };
        }
        return { ok: true };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);

    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const localOnly = await context.services.chat.listSessions('main', {
      localOnly: true,
      includeDerivedTitles: false,
      includeLastMessage: false,
    });

    assert.equal(localOnly.sessions.some((entry) => entry.key === created.session.key), true);
    assert.match(
      localOnly.diagnostics.notes.join('\n'),
      /local session catalog without waiting for Gateway sessions\.list/i,
    );
    assert.equal(gateway.requests.some((request) => request.method === 'sessions.list'), false);
  } finally {
    try {
      await gateway?.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session listing compacts oversized gateway labels and previews for rail transport', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-session-transport-compact-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    const longLabel = `Observed session ${'L'.repeat(180)}`;
    const longDerivedTitle = `Derived ${'D'.repeat(180)}`;
    const longPreview = `Preview ${'P'.repeat(260)}`;
    gateway = await startFakeGateway({
      onRequest(request) {
        if (request.method === 'sessions.list') {
          return {
            sessions: [
              {
                key: 'agent:main:main',
                sessionId: 'observed-session-1',
                label: longLabel,
                derivedTitle: longDerivedTitle,
                lastMessagePreview: longPreview,
                updatedAt: '2026-04-22T10:00:00.000Z',
                channel: 'webchat',
                lastChannel: 'webchat',
              },
            ],
          };
        }
        return { ok: true };
      },
    });

    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const listed = await context.services.chat.listSessions('main');
    const row = listed.sessions.find((entry) => entry.key === 'agent:main:main');

    assert.ok(row);
    assert.ok(row.label.length < longLabel.length);
    assert.ok(row.label.endsWith('…'));
    assert.ok((row.derivedTitle || '').length < longDerivedTitle.length);
    assert.ok((row.derivedTitle || '').endsWith('…'));
    assert.ok((row.lastMessagePreview || '').length < longPreview.length);
    assert.ok((row.lastMessagePreview || '').endsWith('…'));
  } finally {
    try {
      await gateway?.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gateway-discovered tracevane sessions without registry are adopted so queue endpoints stay available', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-session-adopt-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    const recoveredSessionKey = 'agent:main:webchat:direct:tracevane-recovered-1';
    gateway = await startFakeGateway({
      onRequest(request) {
        if (request.method === 'sessions.list') {
          return {
            sessions: [
              {
                key: recoveredSessionKey,
                sessionId: 'gateway-session-1',
                label: 'Recovered Tracevane Session',
                updatedAt: '2026-04-09T02:00:00.000Z',
                channel: 'webchat',
                lastChannel: 'webchat',
                origin: {
                  surface: 'webchat',
                  label: 'Recovered from gateway',
                },
              },
            ],
          };
        }
        return { ok: true };
      },
    });
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);

    const listed = await context.services.chat.listSessions('main');
    const recovered = listed.sessions.find((entry) => entry.key === recoveredSessionKey);
    assert.ok(recovered);
    assert.equal(recovered.kind, 'tracevane_managed');

    const registry = readJson(registryPath(root), {});
    assert.ok(registry[recoveredSessionKey]);
    assert.equal(registry[recoveredSessionKey].sessionId, 'gateway-session-1');

    const queue = await context.services.chat.getQueue(recoveredSessionKey);
    assert.deepEqual(queue.items, []);
  } finally {
    await gateway?.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('materialized tracevane session delete clears local artifacts only after gateway delete succeeds', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-session-actions-materialized-'));
  let gateway = null;
  try {
    writeOpenClawConfig(root);
    writeGatewayIdentity(root);
    gateway = await startFakeGateway();
    const context = await createContextForRoot(root, `ws://127.0.0.1:${gateway.port}`);
    const created = await context.services.chat.createSession('main', { runtimeTarget: openClawGatewayRuntimeTarget() });
    const sessionKey = created.session.key;
    const sessionsPath = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');
    const transcriptFile = path.join(root, 'agents', 'main', 'sessions', 'materialized.jsonl');

    fs.writeFileSync(transcriptFile, [
      JSON.stringify({
        id: 'msg-1',
        role: 'user',
        text: 'hello',
        timestamp: '2026-03-23T09:00:00.000Z',
      }),
      JSON.stringify({
        id: 'msg-2',
        role: 'assistant',
        text: 'world',
        timestamp: '2026-03-23T09:00:01.000Z',
      }),
    ].join('\n'));
    fs.writeFileSync(sessionsPath, JSON.stringify({
      [sessionKey]: {
        sessionId: created.session.sessionId,
        sessionFile: transcriptFile,
        label: created.session.label,
        updatedAt: '2026-03-23T09:00:01.000Z',
      },
    }, null, 2));
    fs.mkdirSync(path.join(root, 'tracevane'), { recursive: true });
    fs.writeFileSync(messageShadowPath(root), JSON.stringify({
      sessions: {
        [sessionKey]: [{
          sessionKey,
          requestId: 'req-1',
          runId: 'run-1',
          transportText: 'hello',
          text: 'hello',
          createdAt: '2026-03-23T09:00:00.000Z',
        }],
      },
    }, null, 2));
    fs.writeFileSync(runShadowPath(root), JSON.stringify({
      sessions: {
        [sessionKey]: [{
          sessionKey,
          runId: 'run-1',
          finalMessageId: 'msg-2',
          finalCreatedAt: '2026-03-23T09:00:01.000Z',
          toolCalls: [],
          lastAssistantText: 'world',
          lifecycle: 'completed',
          savedAt: '2026-03-23T09:00:02.000Z',
        }],
      },
    }, null, 2));

    await context.services.chat.getHistory(sessionKey);
    assert.equal(readSqliteHistoryIndexCount(root, sessionKey), 1);

    const deleted = await context.services.chat.deleteSession(sessionKey);
    assert.deepEqual(deleted, {
      ok: true,
      sessionKey,
    });
    assert.deepEqual(gateway.requests, [{
      method: 'sessions.delete',
      params: {
        key: sessionKey,
        deleteTranscript: true,
        emitLifecycleHooks: false,
      },
    }]);
    assert.equal(fs.existsSync(transcriptFile), false);
    assert.equal(readJson(sessionsPath, {})[sessionKey], undefined);
    assert.equal(readJson(registryPath(root), {})[sessionKey], undefined);
    assert.equal(readJson(messageShadowPath(root), { sessions: {} }).sessions[sessionKey], undefined);
    assert.equal(readJson(runShadowPath(root), { sessions: {} }).sessions[sessionKey], undefined);
    assert.equal(readSqliteHistoryIndexCount(root, sessionKey), 0);
    assert.equal(fs.existsSync(historyIndexPath(root, sessionKey)), false);
  } finally {
    await gateway?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
