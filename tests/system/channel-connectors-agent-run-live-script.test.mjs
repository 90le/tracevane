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
  const attachmentDir = path.join(root, "attachments");
  const imagePath = path.join(attachmentDir, "red.png");
  const filePath = path.join(attachmentDir, "report.zip");
  const videoPath = path.join(attachmentDir, "clip.mp4");
  fs.mkdirSync(attachmentDir, { recursive: true });
  fs.writeFileSync(imagePath, "fake image bytes", "utf8");
  fs.writeFileSync(filePath, "fake zip bytes", "utf8");
  fs.writeFileSync(videoPath, "fake video bytes", "utf8");
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
    checkedAt: "2026-06-08T01:00:00.500Z",
    eventKind: "agent.progress",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    progressType: "tool",
    rawType: "item.completed",
    itemType: "command_execution",
    text: "command_execution completed\ncommand=printf ok\nexit=0\noutput:\nstdout:\nok\nstderr:\nwarn\nexit_code: 0",
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
    checkedAt: "2026-06-08T01:00:01.200Z",
    eventKind: "agent.model.selected",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    originalModel: "glm-5",
    selectedModel: "gpt-5.5",
    reason: "current-model-non-vision",
    visualAttachmentCount: 1,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:00:01.400Z",
    eventKind: "agent.attachments.staged",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    attachmentCount: 2,
    attachmentKinds: ["image", "file"],
    visualAttachmentCount: 1,
    stagedCount: 2,
    failedCount: 0,
    localPaths: [imagePath, filePath],
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:00:01.600Z",
    eventKind: "agent.visual.input",
    adapter: "octo",
    bindingId: "octo-live",
    sessionKey: "dmwork:dm:user-1",
    messageId: "octo-message-1",
    visualInputMode: "codex-native-image",
    imageCount: 1,
    localPaths: [imagePath],
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
    outboundMessagesDeclared: 1,
    outboundMessagesSent: 1,
    outboundMessageRequestCount: 1,
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
    checkedAt: "2026-06-08T01:05:00.500Z",
    eventKind: "agent.progress",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "error",
    rawType: "user",
    itemType: "tool_result",
    text: "File does not exist.",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:01.000Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "thinking",
    progressStatus: "failed",
    transportAction: "patch-progress-card",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:01.100Z",
    eventKind: "agent.permission.prompt",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "permission",
    permissionStatus: "pending",
    requestId: "perm-1",
    toolName: "Bash",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:01.200Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "permission",
    permissionStatus: "pending",
    progressStatus: "running",
    transportAction: "patch-progress-card",
    requestId: "perm-1",
    toolName: "Bash",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:02.000Z",
    eventKind: "agent.permission.reply",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "permission",
    permissionStatus: "allowed",
    requestId: "perm-1",
    toolName: "Bash",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:02.100Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "permission",
    permissionStatus: "allowed",
    progressStatus: "running",
    transportAction: "patch-progress-card",
    requestId: "perm-1",
    toolName: "Bash",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:05:03.000Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-live",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-1",
    progressType: "completed",
    progressStatus: "completed",
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
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:06:00.000Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-card-permission",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-card-permission-run",
    progressCardMessageId: "feishu-card-permission-card",
    progressStatus: "running",
    reason: "permission-pending",
    transportAction: "patch-card",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:06:01.000Z",
    eventKind: "channel.command",
    adapter: "feishu",
    bindingId: "feishu-card-permission",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-card-permission-card",
    eventType: "card.action.trigger",
    command: "approve",
    commandAction: "permission",
    commandOk: true,
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:06:02.000Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-card-permission",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-card-permission-run",
    progressCardMessageId: "feishu-card-permission-card",
    progressStatus: "running",
    reason: "permission-allowed",
    transportAction: "patch-card",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:06:03.000Z",
    eventKind: "agent.run.finished",
    adapter: "feishu",
    bindingId: "feishu-card-permission",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-card-permission-run",
    channelId: "oc_real",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    progressEventCount: 1,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:00.000Z",
    eventKind: "agent.progress.reply",
    adapter: "octo",
    bindingId: "octo-final-bad",
    sessionKey: "dmwork:dm:user-2",
    messageId: "octo-message-bad-final",
    progressType: "assistant",
    rawType: "assistant",
    itemType: "text",
    phase: "final",
    replySent: true,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:01.000Z",
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: "octo-final-bad",
    sessionKey: "dmwork:dm:user-2",
    messageId: "octo-message-bad-final",
    channelId: "dm:user-2",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    progressEventCount: 1,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:30.000Z",
    eventKind: "agent.progress",
    adapter: "octo",
    bindingId: "octo-empty-tool",
    sessionKey: "dmwork:dm:user-3",
    messageId: "octo-message-empty-tool",
    progressType: "tool",
    rawType: "item.completed",
    itemType: "command_execution",
    text: "command_execution completed\ncommand=pwd\nexit=0",
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:31.000Z",
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: "octo-empty-tool",
    sessionKey: "dmwork:dm:user-3",
    messageId: "octo-message-empty-tool",
    channelId: "dm:user-3",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    progressEventCount: 1,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:40.000Z",
    eventKind: "agent.attachments.staged",
    adapter: "octo",
    bindingId: "octo-video-live",
    sessionKey: "dmwork:dm:user-4",
    messageId: "octo-message-video",
    attachmentCount: 1,
    attachmentKinds: ["video"],
    visualAttachmentCount: 1,
    stagedCount: 1,
    failedCount: 0,
    localPaths: [videoPath],
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:41.000Z",
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: "octo-video-live",
    sessionKey: "dmwork:dm:user-4",
    messageId: "octo-message-video",
    channelId: "dm:user-4",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    progressEventCount: 1,
    attachmentCount: 1,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:50.000Z",
    eventKind: "agent.attachments.staged",
    adapter: "octo",
    bindingId: "octo-video-file-live",
    sessionKey: "dmwork:dm:user-5",
    messageId: "octo-message-video-file",
    attachmentCount: 1,
    attachmentKinds: ["file"],
    visualAttachmentCount: 0,
    stagedCount: 1,
    failedCount: 0,
    localPaths: [videoPath],
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:51.000Z",
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: "octo-video-file-live",
    sessionKey: "dmwork:dm:user-5",
    messageId: "octo-message-video-file",
    channelId: "dm:user-5",
    agentStatus: "completed",
    agentOk: true,
    replySent: true,
    progressEventCount: 1,
    attachmentCount: 1,
    attachmentKinds: ["file"],
    content: "[file: clip.mp4]",
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:08:59.900Z",
    eventKind: "agent.progress",
    adapter: "octo",
    bindingId: "octo-stop-live",
    sessionKey: "dmwork:dm:user-stop",
    messageId: "octo-message-stopped-run",
    progressType: "failed",
    rawType: "turn/completed",
    text: "Codex app-server turn interrupted",
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:09:00.000Z",
    eventKind: "channel.command",
    adapter: "octo",
    bindingId: "octo-stop-live",
    sessionKey: "dmwork:dm:user-stop",
    messageId: "octo-message-stop-command",
    channelId: "dm:user-stop",
    command: "stop",
    commandAction: "stop",
    commandOk: true,
    replySent: true,
    replyRequestCount: 1,
  });
  appendJsonLine(octoEvents, {
    checkedAt: "2026-06-08T01:09:00.120Z",
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: "octo-stop-live",
    sessionKey: "dmwork:dm:user-stop",
    messageId: "octo-message-stopped-run",
    channelId: "dm:user-stop",
    agentStatus: "cancelled",
    agentOk: false,
    agentError: "Codex app-server turn interrupted.",
    replySent: true,
    progressEventCount: 1,
    finishedAt: "2026-06-08T01:09:00.120Z",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:09:00.000Z",
    eventKind: "agent.progress.card",
    adapter: "feishu",
    bindingId: "feishu-bad-card",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-bad-card",
    progressStatus: "failed",
    transportAction: "patch-progress-card",
  });
  appendJsonLine(feishuEvents, {
    checkedAt: "2026-06-08T01:09:01.000Z",
    eventKind: "agent.run.finished",
    adapter: "feishu",
    bindingId: "feishu-bad-card",
    sessionKey: "feishu:oc_real:ou_real",
    messageId: "feishu-message-bad-card",
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
    "--require-tool-output",
    "--require-file",
    "--require-outbound-message",
    "--require-inbound-file",
    "--require-inbound-image",
    "--require-staged-files",
    "--require-visual",
    "--require-auto-vision",
    "--require-markdown",
    "--require-no-final-progress-reply",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].adapter, "octo");
  assert.equal(parsed.matchingRuns[0].outboundFilesSent, 1);
  assert.equal(parsed.matchingRuns[0].outboundMessagesSent, 1);
  assert.equal(parsed.matchingRuns[0].outboundMessageRequestCount, 1);
  assert.equal(parsed.matchingRuns[0].fileAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].imageAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].videoAttachmentCount, 0);
  assert.equal(parsed.matchingRuns[0].attachmentsStagedCount, 2);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathCount, 2);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathExistingCount, 2);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathMissingCount, 0);
  assert.equal(parsed.matchingRuns[0].visualAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].visualInputCount, 1);
  assert.deepEqual(parsed.matchingRuns[0].visualInputModes, ["codex-native-image"]);
  assert.equal(parsed.matchingRuns[0].autoVisionSwitched, true);
  assert.equal(parsed.matchingRuns[0].autoVisionOriginalModel, "glm-5");
  assert.equal(parsed.matchingRuns[0].autoVisionSelectedModel, "gpt-5.5");
  assert.equal(parsed.matchingRuns[0].autoVisionReason, "current-model-non-vision");
  assert.equal(parsed.matchingRuns[0].toolProgressCount, 1);
  assert.equal(parsed.matchingRuns[0].toolOutputSignalCount, 1);
  assert.equal(parsed.matchingRuns[0].finalProgressReplyCount, 0);
  assert.equal(parsed.matchingRuns[0].replyMarkdownLikely, true);
  assert.deepEqual(parsed.matchingRuns[0].markdownSignals.sort(), ["bold", "inline_code", "list"].sort());
});

test("agent run live smoke script verifies video attachment and staged local files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "octo-video-live",
    "--require-ok",
    "--require-reply",
    "--require-inbound-video",
    "--require-staged-files",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].videoAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].imageAttachmentCount, 0);
  assert.equal(parsed.matchingRuns[0].visualAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathCount, 1);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathExistingCount, 1);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathMissingCount, 0);
});

test("agent run live smoke script treats Octo video-like files as inbound video evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "octo-video-file-live",
    "--require-ok",
    "--require-reply",
    "--require-inbound-video",
    "--require-staged-files",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].fileAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].videoAttachmentCount, 1);
  assert.equal(parsed.matchingRuns[0].visualAttachmentCount, 0);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathCount, 1);
  assert.equal(parsed.matchingRuns[0].stagedLocalPathExistingCount, 1);
});

test("agent run live smoke script verifies stop command evidence by session and time", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "octo-stop-live",
    "--require-stop-command",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.counts.stopCommands, 1);
  assert.equal(parsed.counts.matchingStopProofs, 1);
  assert.equal(parsed.matchingStopProofs.length, 1);
  assert.equal(parsed.matchingStopProofs[0].commandMessageId, "octo-message-stop-command");
  assert.equal(parsed.matchingStopProofs[0].stoppedMessageId, "octo-message-stopped-run");
  assert.equal(parsed.matchingStopProofs[0].commandOk, true);
  assert.equal(parsed.matchingStopProofs[0].cancelledRunFound, true);
  assert.equal(parsed.matchingStopProofs[0].deltaMs, 120);
});

test("agent run live smoke human output prints matching attachment runs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "octo-video-live",
    "--require-ok",
    "--require-reply",
    "--require-inbound-video",
    "--require-staged-files",
  ], root);
  const runLines = output.stdout.split(/\r?\n/).filter((line) => line.startsWith("- "));
  assert.equal(runLines.length, 1);
  assert.match(runLines[0], /octo\/octo-video-live/);
  assert.match(runLines[0], /videos=1/);
  assert.match(runLines[0], /staged=1\/1/);
});

test("agent run live smoke script verifies Feishu final card path", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "feishu-live",
    "--require-ok",
    "--require-reply",
    "--require-feishu-card",
    "--require-feishu-progress-card-completed",
    "--require-markdown",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.counts.requirementViolations, 0);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].adapter, "feishu");
  assert.equal(parsed.matchingRuns[0].replyTransportAction, "send-final-card");
  assert.equal(parsed.matchingRuns[0].replyMarkdownLikely, true);
  assert.equal(parsed.matchingRuns[0].recoverableToolErrorCount, 1);
  assert.equal(parsed.matchingRuns[0].latestFeishuProgressCardStatus, "completed");
});

test("agent run live smoke script verifies permission approval evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "feishu-live",
    "--require-ok",
    "--require-permission-prompt",
    "--require-permission-resolved",
    "--require-feishu-permission-progress-card",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.counts.permissionEvents, 2);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].permissionPromptCount, 1);
  assert.equal(parsed.matchingRuns[0].permissionReplyCount, 1);
  assert.equal(parsed.matchingRuns[0].permissionProgressCount, 2);
  assert.equal(parsed.matchingRuns[0].feishuPermissionProgressCardCount, 2);
  assert.equal(parsed.matchingRuns[0].permissionResolved, true);
  assert.equal(parsed.matchingRuns[0].latestPermissionStatus, "allowed");
  assert.deepEqual(parsed.matchingRuns[0].permissionStatuses.sort(), ["allowed", "pending"].sort());
  assert.deepEqual(parsed.matchingRuns[0].permissionRequestIds, ["perm-1"]);
  assert.deepEqual(parsed.matchingRuns[0].permissionToolNames, ["Bash"]);
});

test("agent run live smoke script verifies Feishu card-only permission approval evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  const output = await runScript([
    "--config", configPath,
    "--since", "2026-06-08T00:00:00.000Z",
    "--bindings", "feishu-card-permission",
    "--require-ok",
    "--require-permission-prompt",
    "--require-permission-resolved",
    "--require-feishu-permission-progress-card",
    "--json",
  ], root);
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.counts.permissionEvents, 0);
  assert.equal(parsed.counts.commandEvents, 1);
  assert.equal(parsed.matchingRuns.length, 1);
  assert.equal(parsed.matchingRuns[0].permissionPromptCount, 0);
  assert.equal(parsed.matchingRuns[0].permissionReplyCount, 0);
  assert.equal(parsed.matchingRuns[0].permissionProgressCount, 2);
  assert.equal(parsed.matchingRuns[0].feishuPermissionProgressCardCount, 2);
  assert.equal(parsed.matchingRuns[0].permissionCommandCount, 1);
  assert.equal(parsed.matchingRuns[0].permissionApprovalCommandCount, 1);
  assert.equal(parsed.matchingRuns[0].permissionResolved, true);
  assert.equal(parsed.matchingRuns[0].latestPermissionStatus, "allowed");
  assert.deepEqual(parsed.matchingRuns[0].permissionStatuses.sort(), ["allowed", "pending"].sort());
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

  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "octo-live",
      "--require-inbound-video",
      "--json",
    ], root),
    (error) => {
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.counts.finishedRuns, 1);
      assert.equal(parsed.counts.matchingRuns, 0);
      assert.equal(parsed.runs[0].imageAttachmentCount, 1);
      assert.equal(parsed.runs[0].videoAttachmentCount, 0);
      return true;
    },
  );

  fs.rmSync(path.join(root, "attachments", "red.png"));
  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "octo-live",
      "--require-staged-files",
      "--json",
    ], root),
    (error) => {
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.counts.requirementViolations, 1);
      assert.equal(parsed.requirementViolations[0].type, "staged-local-file-missing");
      assert.equal(parsed.runs[0].stagedLocalPathCount, 2);
      assert.equal(parsed.runs[0].stagedLocalPathMissingCount, 1);
      return true;
    },
  );

  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "octo-live",
      "--require-permission-prompt",
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

  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "feishu-live",
      "--require-outbound-message",
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

  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "octo-empty-tool",
      "--require-tool",
      "--require-tool-output",
      "--json",
    ], root),
    (error) => {
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.counts.requirementViolations, 1);
      assert.equal(parsed.requirementViolations[0].type, "tool-output-missing");
      assert.equal(parsed.runs[0].toolProgressCount, 1);
      assert.equal(parsed.runs[0].toolOutputSignalCount, 0);
      return true;
    },
  );
});

test("agent run live smoke script rejects final text progress replies and failed final cards", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-agent-run-live-smoke-"));
  const { configPath } = writeFixture(root);
  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "octo-final-bad",
      "--require-ok",
      "--require-no-final-progress-reply",
      "--json",
    ], root),
    (error) => {
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.counts.requirementViolations, 1);
      assert.equal(parsed.requirementViolations[0].type, "final-progress-reply");
      assert.equal(parsed.runs[0].finalProgressReplyCount, 1);
      return true;
    },
  );

  await assert.rejects(
    runScript([
      "--config", configPath,
      "--since", "2026-06-08T00:00:00.000Z",
      "--bindings", "feishu-bad-card",
      "--require-ok",
      "--require-feishu-progress-card-completed",
      "--json",
    ], root),
    (error) => {
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.counts.requirementViolations, 1);
      assert.equal(parsed.requirementViolations[0].type, "feishu-progress-card-not-completed");
      assert.equal(parsed.runs[0].latestFeishuProgressCardStatus, "failed");
      return true;
    },
  );
});
