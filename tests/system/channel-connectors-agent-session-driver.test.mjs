import test from "node:test";
import assert from "node:assert/strict";

import {
  channelConnectorAgentSessionDriverPoolKey,
  createChannelConnectorAgentSessionDriverPool,
  resolveChannelConnectorAgentSessionDriverMode,
} from "../../dist/apps/api/modules/channel-connectors/agent-session-driver.js";

const baseKey = {
  bindingId: "binding-1",
  projectId: "project-1",
  sessionKey: "octo:dm:user-1",
  agent: "codex",
  model: "gpt-5",
  workDir: "/tmp/studio-project",
};

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
