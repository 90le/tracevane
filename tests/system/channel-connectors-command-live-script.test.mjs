import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-command-live.mjs");
const execFileAsync = promisify(execFile);

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeFixture(root) {
  const configPath = path.join(root, "channel-config.json");
  const stateDir = path.join(root, "state");
  writeJson(configPath, {
    version: 1,
    agentProfiles: [
      {
        id: "codex-main",
        name: "Codex main",
        agent: "codex",
        model: "gpt-5",
        workDir: path.join(root, "work"),
        permissionMode: "suggest",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "studio-gateway-client-key",
        appProfileRef: "codex",
      },
    ],
    defaultAgentProfileId: "codex-main",
    platformBindings: [
      {
        id: "octo-live",
        platform: "octo",
        accountId: "octo-account",
        botId: "octo-bot",
        displayName: "Octo Live",
        agentProfileId: "codex-main",
        enabled: true,
        allowlist: ["user-1"],
        adminUsers: ["user-1"],
      },
      {
        id: "feishu-live",
        platform: "feishu",
        accountId: "cli_live",
        botId: "feishu-bot",
        displayName: "Feishu Live",
        agentProfileId: "codex-main",
        enabled: true,
        allowlist: ["ou_user"],
        adminUsers: ["ou_user"],
        metadata: { verificationToken: "verify-token" },
      },
    ],
  });
  writeJson(path.join(stateDir, "channel-history.json"), {
    version: 1,
    updatedAt: "2026-06-08T00:00:00.000Z",
    entries: [
      {
        id: "h-octo-1",
        bindingId: "octo-live",
        sessionKey: "dmwork:dm:user-1",
        messageId: "m-octo-1",
        role: "user",
        text: "octo history",
        attachmentSummaries: [],
        status: null,
        createdAt: "2026-06-08T00:00:00.000Z",
      },
      {
        id: "h-octo-2",
        bindingId: "octo-live",
        sessionKey: "dmwork:dm:user-2",
        messageId: "m-octo-2",
        role: "user",
        text: "newer octo history",
        attachmentSummaries: [],
        status: null,
        createdAt: "2026-06-08T00:10:00.000Z",
      },
      {
        id: "h-feishu-1",
        bindingId: "feishu-live",
        sessionKey: "feishu:oc_real:ou_real",
        messageId: "m-feishu-1",
        role: "user",
        text: "feishu history",
        attachmentSummaries: [],
        status: null,
        createdAt: "2026-06-08T00:20:00.000Z",
      },
    ],
  });
  writeJson(path.join(stateDir, "channel-sessions.json"), {
    version: 1,
    updatedAt: "2026-06-08T00:00:00.000Z",
    sessions: {
      "octo-session": {
        id: "octo-session",
        bindingId: "octo-live",
        projectId: "codex-main",
        sessionKey: "dmwork:dm:user-1",
        agent: "codex",
        model: "gpt-5",
        workDir: path.join(root, "work"),
        codexThreadId: "thread-octo",
      },
      "feishu-session": {
        id: "feishu-session",
        bindingId: "feishu-live",
        projectId: "codex-main",
        sessionKey: "feishu:oc_real:ou_real",
        agent: "codex",
        model: "gpt-5",
        workDir: path.join(root, "work"),
        codexThreadId: "thread-feishu",
        updatedAt: "2026-06-08T00:20:00.000Z",
      },
    },
  });
  return { configPath, stateDir };
}

function startFakeBackend() {
  const posts = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      posts.push({ method: req.method, path: req.url, body });
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/channel-connectors/adapters/octo/incoming") {
        const command = body.message?.payload?.content || null;
        const name = String(command || "").replace(/^\/+/, "").split(/\s+/, 1)[0] || null;
        res.end(JSON.stringify({
          ok: true,
          accepted: true,
          commandAction: {
            command,
            commandResult: {
              action: name,
              ok: true,
              replyText: "ok from octo command",
            },
          },
          replyPlan: { chunks: ["ok from octo command"] },
        }));
        return;
      }
      if (req.url === "/api/channel-connectors/adapters/feishu/webhook") {
        const content = body.event?.message?.content ? JSON.parse(body.event.message.content) : {};
        const command = content.text || null;
        const name = String(command || "").replace(/^\/+/, "").split(/\s+/, 1)[0] || null;
        if (body.studioDebugResponse === true) {
          res.end(JSON.stringify({
            ok: true,
            accepted: true,
            commandAction: {
              command,
              commandResult: {
                action: name,
                ok: true,
                replyText: "ok from feishu command",
              },
            },
            feishuResponse: {
              toast: { content: "ok from feishu command" },
            },
          }));
          return;
        }
        res.end(JSON.stringify({ toast: { content: "ok from feishu command" } }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not_found" }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, posts, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function runScript(args, root) {
  return execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: root },
    encoding: "utf8",
  });
}

test("command live smoke script plans commands without backend side effects by default", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-command-live-smoke-"));
  const { configPath, stateDir } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--state-dir", stateDir,
    "--bindings", "octo-live",
    "--commands", "/compact",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.plans.length, 1);
  assert.equal(parsed.plans[0].bindingId, "octo-live");
  assert.equal(parsed.plans[0].state.historyEntries, 1);
  assert.equal(parsed.plans[0].state.agentSessions, 1);
  assert.equal(parsed.plans[0].state.compactReady, true);
  assert.equal(parsed.plans[0].result, null);
});

test("command live smoke script can target recent state sessions per binding", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-command-live-smoke-"));
  const { configPath, stateDir } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--state-dir", stateDir,
    "--bindings", "octo-live,feishu-live",
    "--commands", "/compact",
    "--recent-sessions",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.plans.length, 2);
  const octo = parsed.plans.find((plan) => plan.bindingId === "octo-live");
  const feishu = parsed.plans.find((plan) => plan.bindingId === "feishu-live");
  assert.equal(octo.sessionKey, "dmwork:dm:user-2");
  assert.equal(octo.target.source, "history");
  assert.equal(octo.target.fromUid, "user-2");
  assert.equal(octo.request.body.message.fromUid, "user-2");
  assert.equal(octo.state.historyEntries, 1);
  assert.equal(feishu.sessionKey, "feishu:oc_real:ou_real");
  assert.match(feishu.target.source, /^(history|agent-session)$/);
  assert.equal(feishu.target.fromUid, "ou_real");
  assert.equal(feishu.target.channelId, "oc_real");
  assert.equal(feishu.request.body.event.sender.sender_id.open_id, "ou_real");
  assert.equal(feishu.request.body.event.message.chat_id, "oc_real");
  assert.equal(feishu.request.body.header.token, "<redacted>");
  assert.equal(feishu.state.historyEntries, 1);
  assert.equal(feishu.state.agentSessions, 1);
});

test("command live smoke script probes adapter dry-run requests", async () => {
  const fake = await startFakeBackend();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-command-live-smoke-"));
  const { configPath, stateDir } = writeFixture(root);
  try {
    const output = await runScript([
      "--config", configPath,
      "--state-dir", stateDir,
      "--base-url", fake.baseUrl,
      "--bindings", "octo-live,feishu-live",
      "--commands", "/new",
      "--from-uid", "user-1",
      "--channel-id", "user-1",
      "--probe",
      "--json",
    ], root);
    const parsed = JSON.parse(output.stdout);
    assert.equal(parsed.mode, "probe");
    assert.equal(parsed.plans.length, 2);
    assert.equal(fake.posts.length, 2);
    assert.deepEqual(fake.posts.map((post) => post.path), [
      "/api/channel-connectors/adapters/octo/incoming",
      "/api/channel-connectors/adapters/feishu/webhook",
    ]);
    assert.equal(fake.posts[0].body.dryRun, true);
    assert.equal(fake.posts[0].body.sendReply, false);
    assert.equal(fake.posts[1].body.dryRun, true);
    assert.equal(fake.posts[1].body.sendReply, false);
    assert.equal(fake.posts[1].body.studioDebugResponse, true);
    assert.equal(fake.posts[1].body.header.token, "verify-token");
    assert.equal(parsed.plans[1].request.body.header.token, "<redacted>");
    assert.equal(parsed.plans[0].result.action, "new");
    assert.equal(parsed.plans[0].result.ok, true);
    assert.equal(parsed.plans[1].result.action, "new");
    assert.equal(parsed.plans[1].result.ok, true);
  } finally {
    await new Promise((resolve) => fake.server.close(resolve));
  }
});

test("command live smoke script requires explicit address before apply", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-command-live-smoke-"));
  const { configPath, stateDir } = writeFixture(root);
  try {
    await runScript([
      "--config", configPath,
      "--state-dir", stateDir,
      "--bindings", "octo-live",
      "--apply",
      "--json",
    ], root);
    assert.fail("script should reject without explicit apply address");
  } catch (error) {
    assert.match(error.stdout, /--apply requires --from-uid/);
  }
});

test("command live smoke script can apply against recent sessions without copying ids", async () => {
  const fake = await startFakeBackend();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-command-live-smoke-"));
  const { configPath, stateDir } = writeFixture(root);
  try {
    const output = await runScript([
      "--config", configPath,
      "--state-dir", stateDir,
      "--base-url", fake.baseUrl,
      "--bindings", "octo-live",
      "--commands", "/reset",
      "--recent-sessions",
      "--apply",
      "--json",
    ], root);
    const parsed = JSON.parse(output.stdout);
    assert.equal(parsed.mode, "apply");
    assert.equal(fake.posts.length, 1);
    assert.equal(fake.posts[0].body.dryRun, false);
    assert.equal(fake.posts[0].body.sendReply, true);
    assert.equal(fake.posts[0].body.message.fromUid, "user-2");
    assert.equal(fake.posts[0].body.message.channelId, "user-2");
    assert.equal(parsed.plans[0].sessionKey, "dmwork:dm:user-2");
    assert.equal(parsed.plans[0].result.action, "reset");
    assert.equal(parsed.plans[0].result.ok, true);
  } finally {
    await new Promise((resolve) => fake.server.close(resolve));
  }
});

test("command live smoke script applies adapter requests with sendReply", async () => {
  const fake = await startFakeBackend();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-command-live-smoke-"));
  const { configPath, stateDir } = writeFixture(root);
  try {
    const output = await runScript([
      "--config", configPath,
      "--state-dir", stateDir,
      "--base-url", fake.baseUrl,
      "--bindings", "octo-live",
      "--commands", "/reset",
      "--from-uid", "user-1",
      "--channel-id", "user-1",
      "--apply",
      "--json",
    ], root);
    const parsed = JSON.parse(output.stdout);
    assert.equal(parsed.mode, "apply");
    assert.equal(fake.posts.length, 1);
    assert.equal(fake.posts[0].body.dryRun, false);
    assert.equal(fake.posts[0].body.sendReply, true);
    assert.equal(fake.posts[0].body.message.payload.content, "/reset");
    assert.equal(parsed.plans[0].result.status, 200);
    assert.equal(parsed.plans[0].result.action, "reset");
    assert.equal(parsed.plans[0].result.ok, true);
  } finally {
    await new Promise((resolve) => fake.server.close(resolve));
  }
});
