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

function durableQueueFixture(overrides = {}) {
  const base = {
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_private:ou_user",
    messageId: "om_queued",
    pendingRunId: "feishu:feishu-live:om_queued",
    channelId: "oc_private",
    fromUid: "ou_user",
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
      eventKind: "channel.agent.queued",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      channelId: input.channelId,
      fromUid: input.fromUid,
      pendingRunId: input.pendingRunId,
      queuePosition: 1,
      replySent: true,
    },
    {
      checkedAt: "2026-06-13T01:00:30.000Z",
      adapter: "feishu",
      eventKind: "channel.agent.pending_replay",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      pendingRunId: input.pendingRunId,
      attempt: 1,
      queuedAt: "2026-06-13T01:00:01.000Z",
    },
    {
      checkedAt: "2026-06-13T01:00:31.000Z",
      adapter: "feishu",
      eventKind: "agent.run.started",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      agent: "codex",
      model: "glm-5",
    },
    {
      checkedAt: "2026-06-13T01:00:45.000Z",
      adapter: "feishu",
      eventKind: "agent.run.finished",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      agent: "codex",
      model: "glm-5",
      agentOk: true,
      agentStatus: "completed",
      replySent: true,
      progressEventCount: 3,
    },
  ];
}

function fifoQueueFixture(overrides = {}) {
  const events = durableQueueFixture(overrides);
  return [
    events[0],
    events[1],
    {
      ...events[3],
      checkedAt: "2026-06-13T01:00:02.000Z",
    },
    {
      ...events[4],
      checkedAt: "2026-06-13T01:00:15.000Z",
    },
  ];
}

test("Feishu durable queue live script accepts replayed long-connection queued turn", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-durable-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, durableQueueFixture());

  const parsed = await runScript([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].messageId, "om_queued");
  assert.equal(parsed.proofs[0].pendingRunId, "feishu:feishu-live:om_queued");
  assert.equal(parsed.proofs[0].longConnection, true);
  assert.equal(parsed.proofs[0].agent, "codex");
  assert.equal(parsed.proofs[0].agentOk, true);
});

test("Feishu durable queue live script rejects queued turn without long-connection ingress", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-durable-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  const events = durableQueueFixture();
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

test("Feishu durable queue live script accepts same-process FIFO queued turn only in fifo mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-durable-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, fifoQueueFixture());

  const durableFailed = await runScriptFailure([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);
  assert.equal(durableFailed.code, 1);
  assert.equal(durableFailed.parsed.mode, "durable");
  assert.equal(durableFailed.parsed.rejected[0].reason, "missing_pending_replay");

  const parsed = await runScript([
    "--event-log", eventLog,
    "--mode", "fifo",
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "fifo");
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].kind, "fifo");
  assert.equal(parsed.proofs[0].messageId, "om_queued");
  assert.equal(parsed.proofs[0].replayAt, null);
  assert.equal(parsed.proofs[0].agentOk, true);
});

test("Feishu durable queue live script accepts durable and FIFO evidence in any mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-durable-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, [
    ...fifoQueueFixture({ messageId: "om_fifo", pendingRunId: "feishu:feishu-live:om_fifo" }),
    ...durableQueueFixture({ messageId: "om_durable", pendingRunId: "feishu:feishu-live:om_durable" }),
  ]);

  const parsed = await runScript([
    "--event-log", eventLog,
    "--mode", "any",
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "any");
  assert.deepEqual(parsed.proofs.map((proof) => proof.kind).sort(), ["durable", "fifo"]);
});

test("Feishu durable queue live script rejects replay failures before false positives", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-durable-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  const events = durableQueueFixture();
  events.splice(3, 0, {
    checkedAt: "2026-06-13T01:00:30.500Z",
    adapter: "feishu",
    eventKind: "channel.agent.pending_replay_failed",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_private:ou_user",
    messageId: "om_queued",
    pendingRunId: "feishu:feishu-live:om_queued",
    error: "pending_feishu_group_missing",
  });
  writeJsonl(eventLog, events);

  const failed = await runScriptFailure([
    "--event-log", eventLog,
    "--since", "2026-06-13T00:00:00.000Z",
    "--json",
  ], root);

  assert.equal(failed.code, 1);
  assert.equal(failed.parsed.ok, false);
  assert.equal(failed.parsed.rejected[0].reason, "pending_replay_failed");
  assert.equal(failed.parsed.rejected[0].detail, "pending_feishu_group_missing");
});

test("Feishu durable queue live script filters replay proof by Agent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-durable-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, durableQueueFixture());

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
  assert.equal(parsed.proofs[0].agent, "codex");
});
