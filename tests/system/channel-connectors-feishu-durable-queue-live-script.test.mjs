import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs");
const execFileAsync = promisify(execFile);

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

async function runScript(args, root) {
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: root },
    encoding: "utf8",
  });
  return JSON.parse(result.stdout);
}

async function runScriptFailure(args, root) {
  try {
    await runScript(args, root);
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      parsed: JSON.parse(error.stdout || "{}"),
    };
  }
  throw new Error("expected script to fail");
}

function busyRejectFixture(overrides = {}) {
  const base = {
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_private:ou_user",
    messageId: "om_busy",
    channelId: "oc_private",
    fromUid: "ou_user",
    activeRunId: "feishu-live:om_active",
    activeMessageId: "om_active",
    activeAgent: "codex",
    activeModel: "glm-5",
    activeStartedAt: "2026-06-13T00:59:50.000Z",
  };
  const input = { ...base, ...overrides };
  return [
    {
      checkedAt: "2026-06-13T01:00:00.000Z",
      adapter: "feishu",
      eventKind: "message",
      eventType: "im.message.receive_v1",
      messageId: input.messageId,
      channelId: input.channelId,
      fromUid: input.fromUid,
      longConnection: true,
    },
    {
      checkedAt: "2026-06-13T01:00:01.000Z",
      adapter: "feishu",
      eventKind: "channel.agent.rejected_busy",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      channelId: input.channelId,
      fromUid: input.fromUid,
      activeRunId: input.activeRunId,
      activeMessageId: input.activeMessageId,
      activeAgent: input.activeAgent,
      activeModel: input.activeModel,
      activeStartedAt: input.activeStartedAt,
      replySent: true,
    },
  ];
}

test("Feishu busy-guard live script accepts rejected long-connection turn", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-busy-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, busyRejectFixture());

  const parsed = await runScript([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].kind, "busy-reject");
  assert.equal(parsed.proofs[0].messageId, "om_busy");
  assert.equal(parsed.proofs[0].activeMessageId, "om_active");
  assert.equal(parsed.proofs[0].activeAgent, "codex");
  assert.equal(parsed.proofs[0].replySent, true);
});

test("Feishu busy-guard live script rejects proof without long-connection ingress", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-busy-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  const events = busyRejectFixture();
  events[0] = { ...events[0], longConnection: false };
  writeJsonl(eventLog, events);

  const failed = await runScriptFailure([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(failed.code, 1);
  assert.equal(failed.parsed.ok, false);
  assert.equal(failed.parsed.rejected[0].reason, "missing_long_connection_inbound");
});

test("Feishu busy-guard live script rejects proof if rejected message later starts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-busy-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, [
    ...busyRejectFixture(),
    {
      checkedAt: "2026-06-13T01:00:02.000Z",
      adapter: "feishu",
      eventKind: "agent.run.started",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      messageId: "om_busy",
      agent: "codex",
      model: "glm-5",
    },
  ]);

  const failed = await runScriptFailure([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(failed.code, 1);
  assert.equal(failed.parsed.rejected[0].reason, "rejected_message_started");
});

test("Feishu busy-guard live script accepts legacy queue mode as busy-reject alias", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-busy-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, busyRejectFixture());

  const parsed = await runScript([
    "--event-log", eventLog,
    "--mode", "durable",
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "busy-reject");
  assert.equal(parsed.proofs[0].messageId, "om_busy");
});

test("Feishu busy-guard live script filters rejected proof by active Agent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-busy-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, busyRejectFixture());

  const failed = await runScriptFailure([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--agent", "claude-code",
    "--json",
  ], root);
  assert.equal(failed.parsed.ok, false);

  const parsed = await runScript([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--agent", "codex",
    "--json",
  ], root);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.proofs[0].activeAgent, "codex");
});
