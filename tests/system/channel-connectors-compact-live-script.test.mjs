import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-compact-live.mjs");
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

function feishuAutoFixture({ longConnection = true } = {}) {
  return [
    {
      checkedAt: "2026-06-12T06:19:46.096Z",
      adapter: "feishu",
      eventKind: "message",
      eventType: "im.message.receive_v1",
      channelId: "oc_private",
      fromUid: "ou_user",
      messageId: "om_auto",
      longConnection,
    },
    {
      checkedAt: "2026-06-12T06:19:46.103Z",
      eventKind: "agent.auto_compact.threshold",
      adapter: "feishu",
      bindingId: "feishu-live",
      sessionKey: "feishu:oc_private:ou_user",
      channelId: "oc_private",
      fromUid: "ou_user",
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

function octoAutoFixture() {
  return [
    {
      checkedAt: "2026-06-13T05:18:20.163Z",
      eventKind: "agent.auto_compact.threshold",
      adapter: "octo",
      bindingId: "octo-studio-cc",
      sessionKey: "dmwork:dm:user",
      messageId: "2065665045789839360",
      budget: {
        modelId: "glm-5",
        contextWindow: 200000,
        maxOutputTokens: 128000,
        usedPercent: 57,
      },
    },
    {
      checkedAt: "2026-06-13T05:18:34.379Z",
      eventKind: "agent.native_compact.finished",
      platform: "octo",
      bindingId: "octo-studio-cc",
      sessionKey: "dmwork:dm:user",
      messageId: "compact:2065665045789839360",
      agent: "codex",
      model: "glm-5",
      ok: true,
      status: "completed",
      progressEventCount: 4,
    },
    {
      checkedAt: "2026-06-13T05:18:34.379Z",
      eventKind: "agent.auto_compact.finished",
      adapter: "octo",
      bindingId: "octo-studio-cc",
      sessionKey: "dmwork:dm:user",
      messageId: "2065665045789839360",
      action: "native",
      ok: true,
    },
  ];
}

function octoExplicitFixture() {
  return [
    {
      checkedAt: "2026-06-09T06:30:42.707Z",
      eventKind: "agent.native_compact.finished",
      platform: "octo",
      bindingId: "octo-studio-cc",
      sessionKey: "dmwork:dm:user",
      messageId: "compact:2064233657807048704",
      agent: "codex",
      model: "glm-5",
      ok: true,
      status: "completed",
      progressEventCount: 4,
    },
    {
      checkedAt: "2026-06-09T06:30:42.940Z",
      eventKind: "channel.command",
      adapter: "octo",
      bindingId: "octo-studio-cc",
      sessionKey: "dmwork:dm:user",
      messageId: "2064233657807048704",
      channelId: "user",
      channelType: 1,
      fromUid: "user",
      messageType: 1,
      command: "compact",
      commandAction: "compact",
      commandOk: true,
      replySent: true,
    },
  ];
}

test("generic compact live script accepts Feishu long-connection auto compact evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-compact-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, feishuAutoFixture());

  const parsed = await runScript([
    "--platform", "feishu",
    "--event-log", eventLog,
    "--mode", "auto",
    "--since", "2026-06-12T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.platform, "feishu");
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].transportProof, "long-connection");
  assert.equal(parsed.proofs[0].longConnection, true);
  assert.equal(parsed.proofs[0].agent, "codex");
});

test("generic compact live script rejects Feishu compact evidence without long-connection ingress", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-compact-smoke-"));
  const eventLog = path.join(root, "feishu-events.jsonl");
  writeJsonl(eventLog, feishuAutoFixture({ longConnection: false }));

  const failed = await runScriptFailure([
    "--platform", "feishu",
    "--event-log", eventLog,
    "--mode", "auto",
    "--since", "2026-06-12T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(failed.code, 1);
  assert.equal(failed.parsed.ok, false);
  assert.equal(failed.parsed.platform, "feishu");
  assert.equal(failed.parsed.proofCount, 0);
});

test("generic compact live script accepts Octo auto compact evidence without Feishu long-connection fields", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-compact-smoke-"));
  const eventLog = path.join(root, "octo-events.jsonl");
  writeJsonl(eventLog, octoAutoFixture());

  const parsed = await runScript([
    "--platform", "octo",
    "--event-log", eventLog,
    "--mode", "auto",
    "--since", "2026-06-13T05:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.platform, "octo");
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].kind, "auto");
  assert.equal(parsed.proofs[0].transportProof, "event-log");
  assert.equal(parsed.proofs[0].longConnection, null);
  assert.equal(parsed.proofs[0].action, "native");
});

test("generic compact live script accepts Octo explicit slash compact command evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-compact-smoke-"));
  const eventLog = path.join(root, "octo-events.jsonl");
  writeJsonl(eventLog, octoExplicitFixture());

  const parsed = await runScript([
    "--platform", "octo",
    "--event-log", eventLog,
    "--mode", "explicit",
    "--agent", "codex",
    "--since", "2026-06-09T06:00:00.000Z",
    "--json",
  ], root);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.platform, "octo");
  assert.equal(parsed.agent, "codex");
  assert.equal(parsed.proofCount, 1);
  assert.equal(parsed.proofs[0].kind, "explicit");
  assert.equal(parsed.proofs[0].command, "compact");
  assert.equal(parsed.proofs[0].commandOk, true);
  assert.equal(parsed.proofs[0].transportProof, "event-log");
});
