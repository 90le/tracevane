import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-feishu-compact-live.mjs");
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

function autoCompactFixture() {
  return [
    {
      checkedAt: "2026-06-12T06:19:46.096Z",
      adapter: "feishu",
      eventKind: "message",
      eventType: "im.message.receive_v1",
      channelId: "oc_private",
      fromUid: "ou_user",
      messageId: "om_auto",
      longConnection: true,
    },
    {
      checkedAt: "2026-06-12T06:19:46.103Z",
      eventKind: "agent.auto_compact.threshold",
      adapter: "feishu",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      messageId: "om_auto",
      budget: {
        modelId: "glm-5",
        contextWindow: 200000,
        maxOutputTokens: 128000,
        usedPercent: 36.4,
      },
    },
    {
      checkedAt: "2026-06-12T06:20:05.203Z",
      eventKind: "agent.native_compact.finished",
      platform: "feishu",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      messageId: "compact:om_auto",
      agent: "codex",
      model: "glm-5",
      ok: true,
      status: "completed",
      progressEventCount: 4,
    },
    {
      checkedAt: "2026-06-12T06:20:05.203Z",
      eventKind: "agent.auto_compact.finished",
      adapter: "feishu",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      messageId: "om_auto",
      action: "native",
      ok: true,
    },
  ];
}

function explicitCompactFixture() {
  return [
    {
      checkedAt: "2026-06-12T07:00:00.000Z",
      adapter: "feishu",
      eventKind: "message",
      eventType: "im.message.receive_v1",
      channelId: "oc_private",
      fromUid: "ou_user",
      messageId: "om_explicit",
      longConnection: true,
    },
    {
      checkedAt: "2026-06-12T07:00:00.050Z",
      eventKind: "channel.command",
      adapter: "feishu",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      messageId: "om_explicit",
      eventType: "im.message.receive_v1",
      channelId: "oc_private",
      fromUid: "ou_user",
      command: "compact",
      commandAction: "compact",
      commandOk: true,
    },
    {
      checkedAt: "2026-06-12T07:00:08.000Z",
      eventKind: "agent.native_compact.finished",
      platform: "feishu",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      messageId: "compact:om_explicit",
      agent: "claude-code",
      model: "sonnet",
      ok: true,
      status: "completed",
      progressEventCount: 3,
    },
  ];
}

test("Feishu compact live script accepts auto compact evidence from real long-connection ingress", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-compact-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, autoCompactFixture());

  const parsed = await runScript([
    "--event-log", eventLog,
    "--mode", "auto",
    "--since", "2026-06-12T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].kind, "auto");
  assert.equal(parsed.proofs[0].longConnection, true);
  assert.equal(parsed.proofs[0].agent, "codex");
  assert.equal(parsed.proofs[0].model, "glm-5");
  assert.equal(parsed.proofs[0].nativeOk, true);
  assert.equal(parsed.proofs[0].action, "native");
});

test("Feishu compact live script accepts explicit slash compact evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-compact-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, explicitCompactFixture());

  const parsed = await runScript([
    "--event-log", eventLog,
    "--mode", "explicit",
    "--since", "2026-06-12T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].kind, "explicit");
  assert.equal(parsed.proofs[0].command, "compact");
  assert.equal(parsed.proofs[0].commandOk, true);
  assert.equal(parsed.proofs[0].agent, "claude-code");
});

test("Feishu compact live script does not treat auto compact as explicit slash compact", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-compact-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, autoCompactFixture());

  const failed = await runScriptFailure([
    "--event-log", eventLog,
    "--mode", "explicit",
    "--since", "2026-06-12T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(failed.code, 1);
  assert.equal(failed.parsed.ok, false);
  assert.equal(failed.parsed.proofCount, 0);
  assert.equal(failed.parsed.failures[0].type, "missing_feishu_compact_evidence");
});

test("Feishu compact live script rejects non-long-connection ingress", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-compact-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  const entries = autoCompactFixture();
  entries[0] = { ...entries[0], longConnection: false };
  writeJsonl(eventLog, entries);

  const failed = await runScriptFailure([
    "--event-log", eventLog,
    "--mode", "auto",
    "--since", "2026-06-12T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(failed.code, 1);
  assert.equal(failed.parsed.ok, false);
  assert.equal(failed.parsed.proofCount, 0);
});
