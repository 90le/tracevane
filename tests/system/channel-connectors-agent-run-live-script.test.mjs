import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-agent-run-live.mjs");
const execFileAsync = promisify(execFile);

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function appendJsonLine(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function writeFixture(root) {
  const configPath = path.join(root, "channel-config.json");
  const stateDir = path.join(root, "state");
  const feishuEvents = path.join(stateDir, "feishu-events.jsonl");
  const octoEvents = path.join(stateDir, "octo-events.jsonl");
  writeJson(configPath, {
    version: 1,
    paths: {
      state: stateDir,
      feishuEvents,
      octoEvents,
    },
  });

  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:00:00.000Z",
    eventKind: "agent.progress",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    progressType: "assistant",
    rawType: "item/completed",
    itemType: "agentMessage",
    text: "工具完成：\n\n1. **结果**：`ok`\n2. 文件已准备。",
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:00:01.000Z",
    eventKind: "agent.progress.reply",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    progressType: "tool",
    transportAction: "send-progress-markdown",
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:00:03.000Z",
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    channelId: "dm:user-1",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    progressEventCount: 2,
    outboundFilesDeclared: 1,
    outboundFilesResolved: 1,
    outboundFilesSent: 1,
    outboundFileErrors: [],
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:00.000Z",
    eventKind: "agent.progress",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "assistant",
    rawType: "item/completed",
    itemType: "agentMessage",
    text: "完成：\n\n- **工具**：`echo ok`\n- **状态**：成功",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:01.000Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "thinking",
    transportAction: "patch-progress-card",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:04.000Z",
    eventKind: "agent.run.finished",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    channelId: "oc_real",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    replyCardAttempted: true,
    replyTransportAction: "send-final-card",
    progressEventCount: 1,
  });
  return { configPath };
}

function runScript(args, root) {
  return execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: root },
    encoding: "utf8",
  });
}

test("agent run live smoke script verifies Octo tool, reply, and outbound file evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "octo-live",
    "--require-ok",
    "--require-reply",
    "--require-tool",
    "--require-file",
    "--require-markdown",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].adapter, "octo");
  assert.equal(parsed.matchingRuns[0].outboundFilesSent, 1);
  assert.equal(parsed.matchingRuns[0].toolProgressCount, 1);
  assert.equal(parsed.matchingRuns[0].replyMarkdownLikely, true);
  assert.deepEqual(parsed.matchingRuns[0].markdownSignals.sort(), ["bold", "inline_code", "list"].sort());
});

test("agent run live smoke script verifies Feishu final card path", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--platforms", "feishu",
    "--require-ok",
    "--require-reply",
    "--require-feishu-card",
    "--require-markdown",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].adapter, "feishu");
  assert.equal(parsed.matchingRuns[0].replyTransportAction, "send-final-card");
  assert.equal(parsed.matchingRuns[0].replyMarkdownLikely, true);
});

test("agent run live smoke script fails when required evidence is missing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "feishu-live",
      "--require-file",
      "--json",
    ], root),
    (error) => {
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.counts.finishedRuns, 1);
      assert.equal(parsed.counts.matchingRuns, 0);
      return true;
    },
  );
});
