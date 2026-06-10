import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  channelConnectorAgentSessionDriverPoolKey,
  createChannelConnectorAgentSessionDriverPool,
  resolveChannelConnectorAgentSessionDriverMode,
} from "../../dist/apps/api/modules/channel-connectors/agent-session-driver.js";
import {
  createNativeCliSessionDriverFactory,
  OpenCodeRunSession,
} from "../../dist/apps/api/modules/channel-connectors/cli-agent-session-driver.js";

const baseKey = {
  bindingId: "binding-1",
  projectId: "project-1",
  sessionKey: "octo:dm:user-1",
  agent: "codex",
  model: "gpt-5",
  workDir: "/tmp/studio-project",
};

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-channel-driver-"));
}

function writeExecutable(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, { mode: 0o755 });
}

async function waitForFilePattern(filePath, pattern, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (fs.existsSync(filePath) && pattern.test(fs.readFileSync(filePath, "utf8"))) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${pattern} in ${filePath}`);
}

function baseTurnRequest(root, agent, nativeCommand = null, extra = {}) {
  return {
    project: {
      id: `${agent}-project`,
      name: `${agent} project`,
      agent,
      model: agent === "opencode" ? "openai/gpt-5" : "sonnet",
      workDir: root,
      permissionMode: "yolo",
      gatewayEndpoint: "http://127.0.0.1:18796/v1",
      gatewayKeyRef: null,
      appProfileRef: null,
      metadata: {},
    },
    binding: {
      id: `${agent}-binding`,
      platform: "octo",
      accountId: "octo-account",
      botId: null,
      displayName: `${agent} binding`,
      agent,
      enabled: true,
      allowlist: [],
      adminUsers: [],
      metadata: {
        agentSessionDriver: "persistent",
      },
    },
    message: {
      messageId: nativeCommand ? "compact-message" : "normal-message",
      messageSeq: 1,
      fromUid: "user-1",
      channelId: "user-1",
      channelType: 1,
      payload: {
        type: 1,
        content: nativeCommand || "hello",
      },
      attachments: [],
      raw: {},
    },
    sessionKey: "octo:dm:user-1",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayClientKey: "sk-local",
    nativeCommand,
    ...extra,
  };
}

function completedResult(replyText, extra = {}) {
  return {
    attempted: true,
    ok: true,
    status: "completed",
    agent: "codex",
    model: "gpt-5",
    command: "codex",
    args: [],
    cwd: "/tmp/studio-project",
    replyText,
    stdout: replyText,
    stderr: "",
    exitCode: 0,
    durationMs: 1,
    error: null,
    progress: {
      eventCount: 0,
      latest: null,
      summary: null,
    },
    session: {
      resumed: true,
      codexThreadId: "thread-persistent",
    },
    ...extra,
  };
}

test("Channel Connectors persistent session driver pool reuses sessions and emits turn events", async () => {
  let now = Date.parse("2026-06-07T10:00:00.000Z");
  const events = [];
  const created = [];
  const pool = createChannelConnectorAgentSessionDriverPool({
    nowMs: () => now,
    onEvent: (event) => events.push(event),
    factory: {
      create: ({ poolKey }) => {
        created.push(poolKey);
        return {
          id: `session-${created.length}`,
          runTurn: async (input) => {
            input.onProgress?.({
              checkedAt: new Date(now).toISOString(),
              type: "running",
              rawType: "persistent.turn",
              itemType: null,
              text: input.messageId,
            });
            return completedResult(`persistent:${input.messageId}`);
          },
        };
      },
    },
  });

  const progress = [];
  const oneShot = async () => {
    throw new Error("one-shot fallback should not run while persistent driver is healthy");
  };
  const first = await pool.runTurn({
    mode: resolveChannelConnectorAgentSessionDriverMode({ agentSessionDriver: "persistent" }),
    key: baseKey,
    messageId: "m-1",
    onProgress: (event) => progress.push(event),
    runOneShot: oneShot,
  });
  now += 50;
  const second = await pool.runTurn({
    mode: "persistent",
    key: baseKey,
    messageId: "m-2",
    onProgress: (event) => progress.push(event),
    runOneShot: oneShot,
  });

  assert.equal(first.replyText, "persistent:m-1");
  assert.equal(second.replyText, "persistent:m-2");
  assert.equal(created.length, 1);
  assert.equal(created[0], channelConnectorAgentSessionDriverPoolKey(baseKey));
  assert.deepEqual(progress.map((event) => event.text), ["m-1", "m-2"]);
  assert.deepEqual(events.map((event) => event.type), [
    "session.created",
    "turn.started",
    "turn.finished",
    "turn.started",
    "turn.finished",
  ]);
  assert.equal(pool.status()[0].sessionId, "session-1");
  assert.equal(pool.status()[0].turnCount, 2);
});

test("Channel Connectors persistent session driver falls back to one-shot after driver crash", async () => {
  const events = [];
  let fallbackCount = 0;
  let disposeReason = null;
  const pool = createChannelConnectorAgentSessionDriverPool({
    nowMs: () => Date.parse("2026-06-07T10:01:00.000Z"),
    onEvent: (event) => events.push(event),
    factory: {
      create: () => ({
        id: "crashing-session",
        runTurn: async () => {
          throw new Error("persistent driver crashed");
        },
        dispose: (reason) => {
          disposeReason = reason;
        },
      }),
    },
  });

  const result = await pool.runTurn({
    mode: "persistent",
    key: baseKey,
    messageId: "m-crash",
    runOneShot: async () => {
      fallbackCount += 1;
      return completedResult("one-shot fallback", {
        session: {
          resumed: false,
          codexThreadId: "thread-fallback",
        },
      });
    },
  });

  assert.equal(result.replyText, "one-shot fallback");
  assert.equal(fallbackCount, 1);
  assert.equal(disposeReason, "driver-error");
  assert.deepEqual(events.map((event) => event.type), [
    "session.created",
    "turn.started",
    "turn.failed",
    "session.disposed",
    "turn.fallback",
  ]);
  assert.match(events.find((event) => event.type === "turn.failed").error, /persistent driver crashed/);
  assert.deepEqual(pool.status(), []);
});

test("Channel Connectors persistent session driver isolates users, sessions, models, and permissions", async () => {
  let now = Date.parse("2026-06-07T10:01:30.000Z");
  const created = [];
  const pool = createChannelConnectorAgentSessionDriverPool({
    nowMs: () => now,
    factory: {
      create: ({ key, poolKey }) => {
        created.push({ key, poolKey });
        return {
          id: `session-${created.length}`,
          runTurn: async (input) => completedResult(`${input.key.sessionKey}:${input.key.model}:${input.messageId}`),
        };
      },
    },
  });

  const alice = {
    ...baseKey,
    sessionKey: "octo:dm:alice",
    permissionMode: "suggest",
  };
  const bob = {
    ...baseKey,
    sessionKey: "octo:dm:bob",
    permissionMode: "suggest",
  };
  const aliceHigh = {
    ...baseKey,
    sessionKey: "octo:dm:alice",
    model: "gpt-5-high",
    permissionMode: "suggest",
  };
  const aliceYolo = {
    ...baseKey,
    sessionKey: "octo:dm:alice",
    model: "gpt-5",
    permissionMode: "yolo",
  };

  const run = async (key, messageId) => {
    now += 10;
    return pool.runTurn({
      mode: "persistent",
      key,
      messageId,
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run for healthy isolated sessions");
      },
    });
  };

  await run(alice, "a-1");
  await run(alice, "a-2");
  await run(bob, "b-1");
  await run(aliceHigh, "ah-1");
  await run(aliceYolo, "ay-1");

  assert.equal(created.length, 4);
  assert.equal(pool.status().length, 4);
  assert.deepEqual(
    pool.status().map((session) => ({
      sessionKey: session.sessionKey,
      model: session.model,
      permissionMode: session.permissionMode,
      turnCount: session.turnCount,
    })).sort((left, right) => (
      left.sessionKey.localeCompare(right.sessionKey)
      || String(left.model).localeCompare(String(right.model))
      || String(left.permissionMode).localeCompare(String(right.permissionMode))
    )),
    [
      { sessionKey: "octo:dm:alice", model: "gpt-5", permissionMode: "suggest", turnCount: 2 },
      { sessionKey: "octo:dm:alice", model: "gpt-5", permissionMode: "yolo", turnCount: 1 },
      { sessionKey: "octo:dm:alice", model: "gpt-5-high", permissionMode: "suggest", turnCount: 1 },
      { sessionKey: "octo:dm:bob", model: "gpt-5", permissionMode: "suggest", turnCount: 1 },
    ],
  );
  assert.notEqual(
    channelConnectorAgentSessionDriverPoolKey(alice),
    channelConnectorAgentSessionDriverPoolKey(aliceYolo),
  );
});

test("Channel Connectors persistent session driver does not fallback when disabled or aborted", async () => {
  const disabledPool = createChannelConnectorAgentSessionDriverPool({
    fallbackOnCrash: false,
    factory: {
      create: () => ({
        id: "no-fallback-session",
        runTurn: async () => {
          throw new Error("fatal persistent crash");
        },
      }),
    },
  });
  let fallbackCount = 0;
  await assert.rejects(
    disabledPool.runTurn({
      mode: "persistent",
      key: baseKey,
      messageId: "m-disabled",
      runOneShot: async () => {
        fallbackCount += 1;
        return completedResult("must not fallback");
      },
    }),
    /fatal persistent crash/,
  );
  assert.equal(fallbackCount, 0);
  assert.deepEqual(disabledPool.status(), []);

  const controller = new AbortController();
  const abortedPool = createChannelConnectorAgentSessionDriverPool({
    factory: {
      create: () => ({
        id: "aborted-session",
        runTurn: async () => {
          controller.abort();
          throw new Error("turn interrupted by user");
        },
      }),
    },
  });
  await assert.rejects(
    abortedPool.runTurn({
      mode: "persistent",
      key: baseKey,
      messageId: "m-aborted",
      signal: controller.signal,
      runOneShot: async () => {
        fallbackCount += 1;
        return completedResult("must not fallback after abort");
      },
    }),
    /turn interrupted by user/,
  );
  assert.equal(fallbackCount, 0);
  assert.deepEqual(abortedPool.status(), []);
});

test("Channel Connectors persistent session driver supports stop, kill, and idle reap", async () => {
  let now = Date.parse("2026-06-07T10:02:00.000Z");
  const stopped = [];
  const disposed = [];
  const pool = createChannelConnectorAgentSessionDriverPool({
    nowMs: () => now,
    idleTimeoutMs: 100,
    factory: {
      create: ({ poolKey }) => ({
        id: `session:${poolKey}`,
        runTurn: async (input) => completedResult(`persistent:${input.messageId}`),
        stop: (reason) => {
          stopped.push(reason);
        },
        dispose: (reason) => {
          disposed.push(reason);
        },
      }),
    },
  });

  await pool.runTurn({
    mode: "persistent",
    key: baseKey,
    messageId: "m-stop",
    runOneShot: async () => completedResult("unused"),
  });
  const stopResult = await pool.stopSession(baseKey, "manual-stop");
  assert.equal(stopResult.stopped, true);
  assert.equal(pool.status().length, 1);
  assert.deepEqual(stopped, ["manual-stop"]);

  const killResult = await pool.killSession(baseKey, "manual-kill");
  assert.equal(killResult.killed, true);
  assert.deepEqual(disposed, ["manual-kill"]);
  assert.deepEqual(pool.status(), []);

  await pool.runTurn({
    mode: "persistent",
    key: baseKey,
    messageId: "m-idle",
    runOneShot: async () => completedResult("unused"),
  });
  now += 150;
  const reaped = await pool.reapIdle();
  assert.equal(reaped, 1);
  assert.deepEqual(disposed, ["manual-kill", "idle-timeout"]);
  assert.deepEqual(pool.status(), []);
});

test("Channel Connectors session driver mode stays one-shot unless metadata explicitly enables persistence", () => {
  assert.equal(resolveChannelConnectorAgentSessionDriverMode(undefined), "one-shot");
  assert.equal(resolveChannelConnectorAgentSessionDriverMode({ session_driver: "one-shot" }), "one-shot");
  assert.equal(resolveChannelConnectorAgentSessionDriverMode({ persistentSession: false }), "one-shot");
  assert.equal(resolveChannelConnectorAgentSessionDriverMode({ agentSessionDriver: "persistent" }), "persistent");
  assert.equal(resolveChannelConnectorAgentSessionDriverMode({ persistent_agent_session: true }), "persistent");
});

test("Channel Connectors native CLI session driver sends OpenCode compact through a persisted --session turn", async () => {
  const root = makeTempRoot();
  const fakeBin = path.join(root, "bin");
  const agentRuntimeDir = path.join(root, "agent-runtime", "opencode-main");
  const dataHome = path.join(agentRuntimeDir, "opencode-data");
  const dbPath = path.join(dataHome, "opencode", "opencode.db");
  const capturePath = path.join(root, "opencode-capture.jsonl");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, "");
  writeExecutable(path.join(fakeBin, "opencode"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const argv = process.argv.slice(2);",
    "const sessionIndex = argv.indexOf('--session');",
    "const incomingSession = sessionIndex >= 0 ? argv[sessionIndex + 1] : '';",
    "const marker = argv.lastIndexOf('--');",
    "const message = marker >= 0 ? argv.slice(marker + 1).join(' ') : argv.slice(-1)[0];",
    "const sessionID = incomingSession || 'opencode-session-created';",
    "fs.appendFileSync(process.env.STUDIO_TEST_CAPTURE, JSON.stringify({ argv, message, incomingSession, sessionID }) + '\\n');",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "emit({ type: 'step_start', part: { type: 'step-start', sessionID } });",
    "emit({ type: 'tool_use', part: { type: 'tool', tool: 'bash', state: { status: 'completed', title: 'List files', output: 'file-a' } } });",
    "emit({ type: 'text', messageID: 'assistant-message', timestamp: 2, part: { type: 'text', messageID: 'assistant-message', text: message === '/compact' ? '' : 'opencode ok' } });",
    "if (message !== '/compact') emit({ type: 'text', messageID: 'assistant-message', timestamp: 3, part: { type: 'text', messageID: 'assistant-message', text: 'opencode ok' } });",
    "emit({ type: 'step_finish', part: { reason: 'done' } });",
  ]);
  writeExecutable(path.join(fakeBin, "sqlite3"), [
    "#!/usr/bin/env node",
    "const dbPath = process.argv.includes('-json') ? process.argv[process.argv.indexOf('-json') + 1] : (process.argv[2] || '');",
    "const query = process.argv[process.argv.length - 1] || '';",
    "if (dbPath.endsWith('/opencode-data/opencode/opencode.db') && query.includes(\"id = 'opencode-session-created'\")) {",
    "  process.stdout.write(JSON.stringify([{ id: 'opencode-session-created' }]));",
    "} else {",
    "  process.stdout.write('[]');",
    "}",
  ]);

  const originalPath = process.env.PATH || "";
  process.env.PATH = `${fakeBin}:${originalPath}`;
  process.env.STUDIO_TEST_CAPTURE = capturePath;
  try {
    const factory = createNativeCliSessionDriverFactory({
      codexFactory: {
        create: () => {
          throw new Error("codex factory should not be used");
        },
      },
    });
    const key = { ...baseKey, agent: "opencode", model: "openai/gpt-5", workDir: root };
    const session = await factory.create({
      key,
      poolKey: channelConnectorAgentSessionDriverPoolKey(key),
      turnInput: {
        mode: "persistent",
        key,
        messageId: "normal-message",
        agentTurnRequest: baseTurnRequest(root, "opencode", null, { agentRuntimeDir }),
        runOneShot: async () => completedResult("unused"),
      },
    });
    const progress = [];
    const first = await session.runTurn({
      mode: "persistent",
      key,
      messageId: "normal-message",
      agentTurnRequest: baseTurnRequest(root, "opencode", null, { agentRuntimeDir }),
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run");
      },
    });
    const compact = await session.runTurn({
      mode: "persistent",
      key,
      messageId: "compact-message",
      agentTurnRequest: baseTurnRequest(root, "opencode", "/compact", { agentRuntimeDir }),
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run for compact");
      },
    });

    assert.equal(first.ok, true);
    assert.equal(first.replyText, "opencode ok");
    assert.equal(first.session.agentNativeSessionId, "opencode-session-created");
    assert.equal(compact.ok, true);
    assert.equal(compact.replyText, "OpenCode compact 已完成。");
    assert.equal(compact.session.agentNativeSessionId, "opencode-session-created");
    assert.ok(progress.some((event) => event.type === "tool" && /file-a|List files/.test(event.text || "")));
    assert.ok(progress.some((event) => event.rawType === "tool_result" && /output:\nfile-a/.test(event.text || "")));
    assert.ok(progress.some((event) => event.type === "assistant" && event.phase === "final" && event.text === "opencode ok"));
    const captures = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(captures[0].incomingSession, "");
    assert.equal(captures[1].incomingSession, "opencode-session-created");
    assert.equal(captures[1].message, "/compact");
  } finally {
    process.env.PATH = originalPath;
    delete process.env.STUDIO_TEST_CAPTURE;
  }
});

test("Channel Connectors native CLI session driver recovers OpenCode output from sqlite state when stdout is empty", async () => {
  const root = makeTempRoot();
  const fakeBin = path.join(root, "bin");
  const dataHome = path.join(root, "data");
  const dbPath = path.join(dataHome, "opencode", "opencode.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, "");
  writeExecutable(path.join(fakeBin, "opencode"), [
    "#!/usr/bin/env node",
    "process.exit(0);",
  ]);
  writeExecutable(path.join(fakeBin, "sqlite3"), [
    "#!/usr/bin/env node",
    "const query = process.argv[process.argv.length - 1] || '';",
    "const now = Date.now();",
    "if (query.includes('select id from session')) {",
    "  process.stdout.write(JSON.stringify([{ id: 'opencode-db-session' }]));",
    "} else if (query.includes('from part p join message m')) {",
    "  process.stdout.write(JSON.stringify([",
    "    { message_id: 'assistant-previous', part_time_created: 1, message_data: JSON.stringify({ role: 'assistant', time: { completed: 1 } }), part_data: JSON.stringify({ type: 'text', text: 'old reply' }) },",
    "    { message_id: 'user-current', part_time_created: now, message_data: JSON.stringify({ role: 'user', time: { created: now } }), part_data: JSON.stringify({ type: 'text', text: 'hello' }) },",
    "    { message_id: 'assistant-current', part_time_created: now + 1, message_data: JSON.stringify({ role: 'assistant', time: { completed: now + 2 } }), part_data: JSON.stringify({ type: 'text', text: 'opencode db ok' }) },",
    "    { message_id: 'assistant-current', part_time_created: now + 2, message_data: JSON.stringify({ role: 'assistant', time: { completed: now + 2 } }), part_data: JSON.stringify({ type: 'step-finish', reason: 'stop' }) },",
    "  ]));",
    "} else {",
    "  process.stdout.write('[]');",
    "}",
  ]);

  const originalPath = process.env.PATH || "";
  const originalHome = process.env.HOME;
  const originalDataHome = process.env.XDG_DATA_HOME;
  process.env.PATH = `${fakeBin}:${originalPath}`;
  process.env.HOME = root;
  process.env.XDG_DATA_HOME = dataHome;
  try {
    const factory = createNativeCliSessionDriverFactory({
      codexFactory: {
        create: () => {
          throw new Error("codex factory should not be used");
        },
      },
    });
    const key = { ...baseKey, agent: "opencode", model: "openai/gpt-5", workDir: root };
    const session = await factory.create({
      key,
      poolKey: channelConnectorAgentSessionDriverPoolKey(key),
      turnInput: {
        mode: "persistent",
        key,
        messageId: "normal-message",
        agentTurnRequest: baseTurnRequest(root, "opencode"),
        runOneShot: async () => completedResult("unused"),
      },
    });
    const result = await session.runTurn({
      mode: "persistent",
      key,
      messageId: "normal-message",
      agentTurnRequest: baseTurnRequest(root, "opencode"),
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run");
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.replyText, "opencode db ok");
    assert.equal(result.session.agentNativeSessionId, "opencode-db-session");
    assert.match(result.stdout, /opencode db ok/);
    assert.equal(result.progress.eventCount, 2);
  } finally {
    process.env.PATH = originalPath;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalDataHome;
  }
});

test("Channel Connectors native CLI session driver keeps Claude stream-json process alive for native compact", async () => {
  const root = makeTempRoot();
  const fakeBin = path.join(root, "bin");
  const capturePath = path.join(root, "claude-capture.jsonl");
  writeExecutable(path.join(fakeBin, "claude"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const readline = require('readline');",
    "fs.appendFileSync(process.env.STUDIO_TEST_CAPTURE, JSON.stringify({ argv: process.argv.slice(2) }) + '\\n');",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "emit({ type: 'system', session_id: 'claude-live-session' });",
    "const rl = readline.createInterface({ input: process.stdin });",
    "rl.on('line', (line) => {",
    "  if (!line.trim()) return;",
    "  const msg = JSON.parse(line);",
    "  const content = msg.message && msg.message.content;",
    "  const text = Array.isArray(content) ? (content.find((part) => part.type === 'text') || {}).text : content;",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CAPTURE, JSON.stringify({ stdin: text }) + '\\n');",
    "  if (text === '/compact') {",
    "    emit({ type: 'assistant', message: { content: [{ type: 'text', text: '' }] } });",
    "    emit({ type: 'result', result: '', session_id: 'claude-live-session' });",
    "  } else {",
    "    emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pwd' } }, { type: 'text', text: 'claude ok' }] } });",
    "    emit({ type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: '/tmp/project' }, { type: 'text', text: 'done' }] }] } });",
    "    emit({ type: 'result', result: 'claude ok', session_id: 'claude-live-session' });",
    "  }",
    "});",
    "setInterval(() => {}, 1000);",
  ]);

  const originalPath = process.env.PATH || "";
  process.env.PATH = `${fakeBin}:${originalPath}`;
  process.env.STUDIO_TEST_CAPTURE = capturePath;
  try {
    const factory = createNativeCliSessionDriverFactory({
      codexFactory: {
        create: () => {
          throw new Error("codex factory should not be used");
        },
      },
    });
    const key = { ...baseKey, agent: "claude-code", model: "sonnet", workDir: root };
    const session = await factory.create({
      key,
      poolKey: channelConnectorAgentSessionDriverPoolKey(key),
      turnInput: {
        mode: "persistent",
        key,
        messageId: "normal-message",
        agentTurnRequest: baseTurnRequest(root, "claude-code"),
        runOneShot: async () => completedResult("unused"),
      },
    });
    const progress = [];
    const first = await session.runTurn({
      mode: "persistent",
      key,
      messageId: "normal-message",
      agentTurnRequest: baseTurnRequest(root, "claude-code"),
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run");
      },
    });
    const compact = await session.runTurn({
      mode: "persistent",
      key,
      messageId: "compact-message",
      agentTurnRequest: baseTurnRequest(root, "claude-code", "/compact"),
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run for compact");
      },
    });
    session.dispose("test-complete");

    assert.equal(first.ok, true);
    assert.equal(first.replyText, "claude ok");
    assert.equal(first.session.agentNativeSessionId, "claude-live-session");
    assert.equal(compact.ok, true);
    assert.equal(compact.replyText, "Claude Code compact 已完成。");
    assert.equal(compact.session.agentNativeSessionId, "claude-live-session");
    assert.ok(progress.some((event) => event.type === "tool" && /Bash/.test(event.text || "")));
    assert.ok(progress.some((event) => event.itemType === "tool_result" && /\/tmp\/project\ndone/.test(event.text || "")));
    const captures = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(captures.filter((item) => item.argv).length, 1);
    const stdinMessages = captures.filter((item) => item.stdin).map((item) => item.stdin);
    assert.equal(stdinMessages.length, 2);
    assert.match(stdinMessages[0], /^hello\b/);
    assert.equal(stdinMessages[1], "/compact");
  } finally {
    process.env.PATH = originalPath;
    delete process.env.STUDIO_TEST_CAPTURE;
  }
});

test("Channel Connectors Claude persistent session stop resolves the active turn as cancelled", async () => {
  const root = makeTempRoot();
  const fakeBin = path.join(root, "bin");
  const capturePath = path.join(root, "claude-stop-capture.jsonl");
  writeExecutable(path.join(fakeBin, "claude"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const readline = require('readline');",
    "fs.appendFileSync(process.env.STUDIO_TEST_CAPTURE, JSON.stringify({ argv: process.argv.slice(2) }) + '\\n');",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "emit({ type: 'system', session_id: 'claude-stop-session' });",
    "const rl = readline.createInterface({ input: process.stdin });",
    "rl.on('line', (line) => {",
    "  if (!line.trim()) return;",
    "  const msg = JSON.parse(line);",
    "  const content = msg.message && msg.message.content;",
    "  const text = Array.isArray(content) ? (content.find((part) => part.type === 'text') || {}).text : content;",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CAPTURE, JSON.stringify({ stdin: text }) + '\\n');",
    "});",
    "setInterval(() => {}, 1000);",
  ]);

  const originalPath = process.env.PATH || "";
  process.env.PATH = `${fakeBin}:${originalPath}`;
  process.env.STUDIO_TEST_CAPTURE = capturePath;
  try {
    const factory = createNativeCliSessionDriverFactory({
      codexFactory: {
        create: () => {
          throw new Error("codex factory should not be used");
        },
      },
    });
    const key = { ...baseKey, agent: "claude-code", model: "sonnet", workDir: root };
    const session = await factory.create({
      key,
      poolKey: channelConnectorAgentSessionDriverPoolKey(key),
      turnInput: {
        mode: "persistent",
        key,
        messageId: "claude-stop-message",
        agentTurnRequest: baseTurnRequest(root, "claude-code"),
        runOneShot: async () => completedResult("unused"),
      },
    });
    const resultPromise = session.runTurn({
      mode: "persistent",
      key,
      messageId: "claude-stop-message",
      agentTurnRequest: baseTurnRequest(root, "claude-code"),
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run");
      },
    });
    await waitForFilePattern(capturePath, /"stdin":/);
    session.stop("manual-stop");
    const result = await resultPromise;

    assert.equal(result.ok, false);
    assert.equal(result.status, "cancelled");
    assert.match(result.error || "", /cancelled/);
    assert.equal(result.session.agentNativeSessionId, "claude-stop-session");
  } finally {
    process.env.PATH = originalPath;
    delete process.env.STUDIO_TEST_CAPTURE;
  }
});

test("Channel Connectors OpenCode persistent session stop aborts active process runner", async () => {
  const root = makeTempRoot();
  const fakeBin = path.join(root, "bin");
  const dataHome = path.join(root, "data");
  const dbPath = path.join(dataHome, "opencode", "opencode.db");
  const sqliteMarker = path.join(root, "sqlite-called");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, "");
  writeExecutable(path.join(fakeBin, "sqlite3"), [
    "#!/usr/bin/env node",
    "require('fs').writeFileSync(process.env.STUDIO_SQLITE_MARKER, 'called');",
    "process.stdout.write(JSON.stringify([{ id: 'stale-session' }]));",
  ]);
  const session = new OpenCodeRunSession({
    id: "opencode-run-session:test",
    sessionId: "opencode-session-created",
  });
  let sawAbortSignal = false;
  let markRunnerStarted = () => {};
  const runnerStarted = new Promise((resolve) => {
    markRunnerStarted = resolve;
  });
  const originalPath = process.env.PATH || "";
  const originalHome = process.env.HOME;
  const originalDataHome = process.env.XDG_DATA_HOME;
  const originalMarker = process.env.STUDIO_SQLITE_MARKER;
  process.env.PATH = `${fakeBin}:${originalPath}`;
  process.env.HOME = root;
  process.env.XDG_DATA_HOME = dataHome;
  process.env.STUDIO_SQLITE_MARKER = sqliteMarker;
  try {
    const resultPromise = session.runTurn({
      mode: "persistent",
      key: { ...baseKey, agent: "opencode", model: "openai/gpt-5", workDir: root },
      messageId: "opencode-stop-message",
      agentTurnRequest: {
        ...baseTurnRequest(root, "opencode"),
        processRunner: async (request) => {
          markRunnerStarted();
          return new Promise((resolve) => {
            request.signal?.addEventListener("abort", () => {
              sawAbortSignal = true;
              resolve({
                exitCode: null,
                signal: null,
                stdout: "",
                stderr: "",
                durationMs: 1,
                timedOut: false,
                cancelled: true,
                error: "Agent process cancelled.",
                progressEvents: [],
              });
            }, { once: true });
          });
        },
      },
      runOneShot: async () => {
        throw new Error("one-shot fallback should not run");
      },
    });
    await runnerStarted;
    fs.rmSync(sqliteMarker, { force: true });
    session.stop("manual-stop");
    const result = await resultPromise;
    assert.equal(sawAbortSignal, true);
    assert.equal(result.status, "cancelled");
    assert.equal(result.ok, false);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(sqliteMarker), false);
  } finally {
    process.env.PATH = originalPath;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalDataHome;
    if (originalMarker === undefined) delete process.env.STUDIO_SQLITE_MARKER;
    else process.env.STUDIO_SQLITE_MARKER = originalMarker;
  }
});
