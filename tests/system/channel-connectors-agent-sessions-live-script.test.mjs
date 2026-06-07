import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-agent-sessions.mjs");
const execFileAsync = promisify(execFile);

function sessionPayload(overrides = {}) {
  return {
    ok: true,
    checkedAt: "2026-06-07T00:00:00.000Z",
    defaultMode: "one-shot",
    implementation: "codex-app-server-experimental",
    persistentDriverReady: true,
    policy: {
      idleTimeoutMs: 600000,
      maxSessions: 8,
      fallbackOnCrash: true,
    },
    requestedPersistentBindings: [
      {
        projectId: "codex-agent",
        bindingId: "octo-live",
        platform: "octo",
        accountId: "studio",
        botId: "bot",
        agent: "codex",
        model: "gpt-5.4-mini",
        requestedMode: "persistent",
        effectiveMode: "persistent",
        reason: "codex-app-server-experimental",
      },
    ],
    bindings: [],
    activeSessions: [
      {
        poolKey: "pool-octo-idle",
        sessionId: "codex-app-server:test",
        bindingId: "octo-live",
        projectId: "codex-agent",
        sessionKey: "im-session-a",
        agent: "codex",
        model: "gpt-5.4-mini",
        workDir: "/secret/workdir/that/should/not/print",
        createdAt: "2026-06-07T00:00:00.000Z",
        lastUsedAt: "2026-06-07T00:00:01.000Z",
        running: 0,
        turnCount: 2,
        idleMs: 1200,
        lastError: null,
      },
    ],
    killed: null,
    ...overrides,
  };
}

function startFakeDaemon() {
  const posts = [];
  const server = http.createServer((req, res) => {
    if ((req.url || "").split("?")[0] !== "/agent-sessions") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    if (req.method === "GET") {
      sendJson(res, sessionPayload());
      return;
    }
    if (req.method === "POST") {
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        posts.push(body);
        if (body.action === "reap-idle") {
          sendJson(res, sessionPayload({ activeSessions: [], reaped: 1 }));
          return;
        }
        if (body.action === "kill") {
          sendJson(res, sessionPayload({
            activeSessions: [],
            killed: {
              requested: true,
              killed: true,
              sessionId: "codex-app-server:test",
              poolKey: body.poolKey,
            },
          }));
          return;
        }
        sendJson(res, sessionPayload());
      });
      return;
    }
    res.statusCode = 405;
    res.end("method not allowed");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        posts,
        port: server.address().port,
      });
    });
  });
}

function sendJson(res, body) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function runScript(args, root) {
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: root,
    },
    encoding: "utf8",
  });
  return result.stdout;
}

test("agent session live smoke script summarizes status without leaking workdir", async () => {
  const fake = await startFakeDaemon();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-sessions-smoke-"));
  try {
    const output = await runScript(["--host", "127.0.0.1", "--port", String(fake.port), "--json"], root);
    assert.match(output, /pool-octo-idle/);
    assert.doesNotMatch(output, /secret\/workdir/);
    const parsed = JSON.parse(output);
    assert.equal(parsed.status.activeSessions.length, 1);
    assert.equal(parsed.status.policy.idleTimeoutMs, 600000);
    assert.equal(fake.posts.length, 0);
  } finally {
    await new Promise((resolve) => fake.server.close(resolve));
  }
});

test("agent session live smoke script dry-runs kill-first-idle without POST", async () => {
  const fake = await startFakeDaemon();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-sessions-smoke-"));
  try {
    const output = await runScript([
      "--host", "127.0.0.1",
      "--port", String(fake.port),
      "--bindings", "octo-live",
      "--kill-first-idle",
      "--json",
    ], root);
    const parsed = JSON.parse(output);
    assert.deepEqual(parsed.actions[0], {
      action: "kill",
      applied: false,
      poolKey: "pool-octo-idle",
      note: "dry-run; pass --apply to execute",
    });
    assert.equal(fake.posts.length, 0);
  } finally {
    await new Promise((resolve) => fake.server.close(resolve));
  }
});

test("agent session live smoke script applies reap and kill actions", async () => {
  const fake = await startFakeDaemon();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-sessions-smoke-"));
  try {
    const reapOutput = await runScript([
      "--host", "127.0.0.1",
      "--port", String(fake.port),
      "--reap-idle",
      "--apply",
      "--json",
    ], root);
    const reap = JSON.parse(reapOutput);
    assert.equal(reap.actions[0].result.reaped, 1);
    assert.deepEqual(fake.posts.at(-1), { action: "reap-idle" });

    const killOutput = await runScript([
      "--host", "127.0.0.1",
      "--port", String(fake.port),
      "--kill-pool-key", "pool-octo-idle",
      "--reason", "test-reason",
      "--apply",
      "--json",
    ], root);
    const kill = JSON.parse(killOutput);
    assert.equal(kill.actions[0].result.killed.killed, true);
    assert.deepEqual(fake.posts.at(-1), {
      action: "kill",
      poolKey: "pool-octo-idle",
      reason: "test-reason",
    });
  } finally {
    await new Promise((resolve) => fake.server.close(resolve));
  }
});
