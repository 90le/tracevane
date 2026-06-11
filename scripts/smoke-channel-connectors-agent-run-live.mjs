#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config/openclaw-studio/channel-connectors/daemon/config.json");
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_MS = 1_000;
const DEFAULT_SINCE_MINUTES = 30;

function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    since: "",
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    wait: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    bindings: [],
    platforms: [],
    minRuns: 1,
    limitRuns: 20,
    requireOk: false,
    requireReply: false,
    requireProgress: false,
    requireTool: false,
    requireFile: false,
    requireInboundFile: false,
    requireVisual: false,
    requireAutoVision: false,
    requireMarkdown: false,
    requireFeishuCard: false,
    requireNoFinalProgressReply: false,
    requireFeishuProgressCardCompleted: false,
    requirePermissionPrompt: false,
    requirePermissionResolved: false,
    requireFeishuPermissionProgressCard: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--wait") options.wait = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--require-ok") options.requireOk = true;
    else if (arg === "--require-reply") options.requireReply = true;
    else if (arg === "--require-progress") options.requireProgress = true;
    else if (arg === "--require-tool") options.requireTool = true;
    else if (arg === "--require-file") options.requireFile = true;
    else if (arg === "--require-inbound-file" || arg === "--require-uploaded-file") options.requireInboundFile = true;
    else if (arg === "--require-visual" || arg === "--require-visual-input") options.requireVisual = true;
    else if (arg === "--require-auto-vision" || arg === "--require-vision-switch") options.requireAutoVision = true;
    else if (arg === "--require-markdown" || arg === "--require-markdown-reply") options.requireMarkdown = true;
    else if (arg === "--require-feishu-card" || arg === "--require-markdown-card") options.requireFeishuCard = true;
    else if (arg === "--require-no-final-progress-reply") options.requireNoFinalProgressReply = true;
    else if (arg === "--require-feishu-progress-card-completed") options.requireFeishuProgressCardCompleted = true;
    else if (arg === "--require-permission-prompt") options.requirePermissionPrompt = true;
    else if (arg === "--require-permission-resolved") options.requirePermissionResolved = true;
    else if (arg === "--require-feishu-permission-progress-card") options.requireFeishuPermissionProgressCard = true;
    else if (arg === "--config") options.configPath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--config=")) options.configPath = arg.slice("--config=".length);
    else if (arg === "--since") options.since = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--since=")) options.since = arg.slice("--since=".length);
    else if (arg === "--since-minutes") options.sinceMinutes = nonNegativeNumber(requireValue(argv, ++index, arg), DEFAULT_SINCE_MINUTES);
    else if (arg.startsWith("--since-minutes=")) options.sinceMinutes = nonNegativeNumber(arg.slice("--since-minutes=".length), DEFAULT_SINCE_MINUTES);
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--poll-ms") options.pollMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_POLL_MS);
    else if (arg.startsWith("--poll-ms=")) options.pollMs = positiveInt(arg.slice("--poll-ms=".length), DEFAULT_POLL_MS);
    else if (arg === "--bindings") options.bindings = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--bindings=")) options.bindings = csv(arg.slice("--bindings=".length));
    else if (arg === "--platforms") options.platforms = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--platforms=")) options.platforms = csv(arg.slice("--platforms=".length));
    else if (arg === "--min-runs") options.minRuns = positiveInt(requireValue(argv, ++index, arg), 1);
    else if (arg.startsWith("--min-runs=")) options.minRuns = positiveInt(arg.slice("--min-runs=".length), 1);
    else if (arg === "--limit-runs") options.limitRuns = nonNegativeInt(requireValue(argv, ++index, arg), 20);
    else if (arg.startsWith("--limit-runs=")) options.limitRuns = nonNegativeInt(arg.slice("--limit-runs=".length), 20);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.configPath = path.resolve(options.configPath);
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-agent-run-live.mjs [options]

Reads live Channel Connector daemon event logs and verifies recent Agent runs.
This script is read-only. It does not inject IM messages. Use --wait, then send
a real Feishu/Octo message from the IM client to verify user-visible behavior.

Options:
  --wait                    Poll until matching runs satisfy requirements.
  --bindings <ids>          Comma-separated binding ids to include.
  --platforms <ids>         feishu,octo filter.
  --since <iso>             Include events at or after this timestamp.
  --since-minutes <n>       Include recent window. Default: ${DEFAULT_SINCE_MINUTES}; with --wait default is script start unless explicitly set.
  --min-runs <n>            Required matching run count. Default: 1.
  --limit-runs <n>          Max finished/matching run summaries to print. Default: 20.
  --require-ok              Require agentOk=true.
  --require-reply           Require replySent=true.
  --require-progress        Require any progress event.
  --require-tool            Require tool progress.
  --require-file            Require outboundFilesDeclared>0 and outboundFilesSent>0.
  --require-inbound-file    Require a user-uploaded file attachment was received/staged.
  --require-visual          Require inbound visual attachment evidence.
  --require-auto-vision     Require a non-vision model auto-switched to a vision model.
  --require-markdown        Require assistant progress with Markdown-like reply signals.
  --require-feishu-card     Require Feishu final card/post path for Markdown rendering.
  --require-no-final-progress-reply
                            Require final assistant text not to be sent as a progress reply.
  --require-feishu-progress-card-completed
                            Require successful Feishu runs to end with completed progress card status.
  --require-permission-prompt
                            Require an agent.permission.prompt event.
  --require-permission-resolved
                            Require a resolved agent.permission.reply event.
  --require-feishu-permission-progress-card
                            Require Feishu permission state to be represented in progress card logs.
  --config <path>           Daemon config path. Default: ${DEFAULT_CONFIG_PATH}
  --timeout-ms <n>          Wait deadline. Default: ${DEFAULT_TIMEOUT_MS}
  --poll-ms <n>             Poll interval. Default: ${DEFAULT_POLL_MS}
  --json                    Emit JSON only.
  -h, --help                Show this help

Examples:
  node scripts/smoke-channel-connectors-agent-run-live.mjs --json
  node scripts/smoke-channel-connectors-agent-run-live.mjs --wait --bindings feishu-live --require-ok --require-reply --require-tool --json
  node scripts/smoke-channel-connectors-agent-run-live.mjs --wait --bindings octo-studio-cc --require-ok --require-file --json
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function eventPaths(config) {
  const paths = config.paths && typeof config.paths === "object" ? config.paths : {};
  const stateDir = String(paths.state || path.join(path.dirname(path.dirname(config.paths?.runtime || DEFAULT_CONFIG_PATH)), "state"));
  return {
    feishu: String(paths.feishuEvents || path.join(stateDir, "feishu-events.jsonl")),
    octo: String(paths.octoEvents || path.join(stateDir, "octo-events.jsonl")),
  };
}

function sinceDate(options, startedAt) {
  if (options.since) {
    const parsed = new Date(options.since);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid --since timestamp: ${options.since}`);
    return parsed;
  }
  if (options.wait && !process.argv.some((arg) => arg === "--since-minutes" || arg.startsWith("--since-minutes="))) {
    return startedAt;
  }
  return new Date(Date.now() - options.sinceMinutes * 60_000);
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const output = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) output.push(parsed);
    } catch {
      // Keep scanning later lines when the log contains a partial write.
    }
  }
  return output;
}

function checkedAtMs(event) {
  const parsed = Date.parse(event.checkedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function platformMatches(event, options) {
  const platform = String(event.adapter || "");
  return options.platforms.length === 0 || options.platforms.includes(platform);
}

function bindingMatches(event, options) {
  const bindingId = String(event.bindingId || "");
  return options.bindings.length === 0 || options.bindings.includes(bindingId);
}

function eventMatches(event, options, sinceMs) {
  return checkedAtMs(event) >= sinceMs && platformMatches(event, options) && bindingMatches(event, options);
}

function runKey(event) {
  return [
    event.adapter || "",
    event.bindingId || "",
    event.sessionKey || "",
    event.messageId || "",
  ].join("\u0000");
}

function summarizeRun(event, relatedProgress, relatedEvidence, relatedPermissions) {
  const progressTypes = uniqueStrings(relatedProgress.map((item) => String(item.progressType || item.latestProgress?.type || "")).filter(Boolean));
  const rawProgress = relatedProgress.filter((item) => item.eventKind === "agent.progress");
  const transportProgress = relatedProgress.filter((item) => item.eventKind === "agent.progress.reply" || item.eventKind === "agent.progress.card");
  const rawToolProgress = rawProgress.filter((item) => item.progressType === "tool" || item.latestProgress?.type === "tool");
  const transportToolProgress = transportProgress.filter((item) => item.progressType === "tool" || item.latestProgress?.type === "tool");
  const transportActions = uniqueStrings(relatedProgress.map((item) => String(item.transportAction || "")).filter(Boolean));
  const assistantProgress = rawProgress.filter((item) => item.progressType === "assistant" || item.latestProgress?.type === "assistant");
  const finalProgressReplies = transportProgress.filter((item) => {
    return String(item.progressType || item.latestProgress?.type || "") === "assistant"
      && String(item.phase || item.latestProgress?.phase || "") === "final";
  });
  const recoverableToolErrors = rawProgress.filter(isRecoverableToolResultError);
  const feishuProgressCards = relatedProgress.filter((item) => item.eventKind === "agent.progress.card" && item.adapter === "feishu");
  const latestFeishuProgressCard = latestEvent(feishuProgressCards);
  const permissionPromptEvents = relatedPermissions.filter((item) => item.eventKind === "agent.permission.prompt");
  const permissionReplyEvents = relatedPermissions.filter((item) => item.eventKind === "agent.permission.reply");
  const permissionProgressEntries = relatedProgress.filter((item) => {
    return String(item.progressType || item.latestProgress?.type || "") === "permission"
      || Boolean(item.permissionStatus);
  });
  const feishuPermissionProgressCards = permissionProgressEntries.filter((item) => item.eventKind === "agent.progress.card" && item.adapter === "feishu");
  const latestPermissionEvent = latestEvent([...relatedPermissions, ...permissionProgressEntries]);
  const permissionStatuses = uniqueStrings([
    ...relatedPermissions,
    ...permissionProgressEntries,
  ].map((item) => String(item.permissionStatus || "")).filter(Boolean));
  const permissionRequestIds = uniqueStrings([
    ...relatedPermissions,
    ...permissionProgressEntries,
  ].map((item) => String(item.requestId || "")).filter(Boolean));
  const permissionToolNames = uniqueStrings([
    ...relatedPermissions,
    ...permissionProgressEntries,
  ].map((item) => String(item.toolName || item.tool || "")).filter(Boolean));
  const markdownSignals = uniqueStrings(assistantProgress.flatMap((item) => detectMarkdownSignals(String(item.text || item.latestProgress?.text || ""))));
  const toolProgressCount = rawToolProgress.length > 0 ? rawToolProgress.length : transportToolProgress.length;
  const modelSelectionEvents = relatedEvidence.filter((item) => item.eventKind === "agent.model.selected");
  const stagedAttachmentEvents = relatedEvidence.filter((item) => item.eventKind === "agent.attachments.staged");
  const visualInputEvents = relatedEvidence.filter((item) => item.eventKind === "agent.visual.input");
  const attachmentKinds = uniqueStrings([
    ...arrayStrings(event.attachmentKinds),
    ...relatedEvidence.flatMap((item) => arrayStrings(item.attachmentKinds)),
  ]);
  const visualAttachmentKinds = attachmentKinds.filter(isVisualAttachmentKind);
  const fileAttachmentCount = attachmentKinds.filter((kind) => kind === "file").length;
  const modelSelection = latestEvent(modelSelectionEvents);
  const autoVisionSwitched = modelSelectionEvents.some((item) => {
    const originalModel = String(item.originalModel || "");
    const selectedModel = String(item.selectedModel || "");
    return numberValue(item.visualAttachmentCount) > 0
      && Boolean(originalModel)
      && Boolean(selectedModel)
      && originalModel !== selectedModel;
  });
  return {
    checkedAt: event.checkedAt || null,
    adapter: event.adapter || null,
    bindingId: event.bindingId || null,
    sessionKey: event.sessionKey || null,
    messageId: event.messageId || null,
    channelId: event.channelId || null,
    agentStatus: event.agentStatus || event.status || null,
    agentOk: event.agentOk ?? event.ok ?? null,
    agentError: event.agentError || event.error || null,
    progressEventCount: numberValue(event.progressEventCount),
    progressLogCount: relatedProgress.length,
    rawProgressLogCount: rawProgress.length,
    transportProgressLogCount: transportProgress.length,
    finalProgressReplyCount: finalProgressReplies.length,
    recoverableToolErrorCount: recoverableToolErrors.length,
    feishuProgressCardStatuses: uniqueStrings(feishuProgressCards.map((item) => String(item.progressStatus || "")).filter(Boolean)),
    latestFeishuProgressCardStatus: latestFeishuProgressCard?.progressStatus || null,
    evidenceLogCount: relatedEvidence.length,
    permissionEventCount: relatedPermissions.length,
    permissionPromptCount: permissionPromptEvents.length,
    permissionReplyCount: permissionReplyEvents.length,
    permissionProgressCount: permissionProgressEntries.length,
    feishuPermissionProgressCardCount: feishuPermissionProgressCards.length,
    permissionStatuses,
    permissionRequestIds,
    permissionToolNames,
    latestPermissionStatus: latestPermissionEvent?.permissionStatus || null,
    permissionResolved: permissionReplyEvents.some(isResolvedPermissionEvent),
    progressTypes,
    toolProgressCount,
    transportToolProgressCount: transportToolProgress.length,
    assistantProgressCount: assistantProgress.length,
    markdownSignalCount: markdownSignals.length,
    markdownSignals,
    replyMarkdownLikely: markdownSignals.length > 0,
    latestProgressType: event.latestProgress?.type || null,
    latestProgressRawType: event.latestProgress?.rawType || null,
    latestProgressItemType: event.latestProgress?.itemType || null,
    replySent: event.replySent ?? null,
    replyTransportAction: event.replyTransportAction || null,
    replyCardAttempted: event.replyCardAttempted ?? null,
    replyCardError: event.replyCardError || null,
    replyRequestCount: numberValue(event.replyRequestCount),
    attachmentCount: numberValue(event.attachmentCount),
    attachmentKinds,
    visualAttachmentKinds,
    fileAttachmentCount,
    visualAttachmentCount: Math.max(
      visualAttachmentKinds.length > 0 ? numberValue(event.attachmentCount) : 0,
      ...modelSelectionEvents.map((item) => numberValue(item.visualAttachmentCount)),
      ...stagedAttachmentEvents.map((item) => numberValue(item.visualAttachmentCount)),
      ...visualInputEvents.map((item) => numberValue(item.imageCount)),
    ),
    attachmentsStagedCount: sumNumbers(stagedAttachmentEvents.map((item) => item.stagedCount)),
    attachmentStagingFailedCount: sumNumbers(stagedAttachmentEvents.map((item) => item.failedCount)),
    visualInputCount: sumNumbers(visualInputEvents.map((item) => item.imageCount)),
    visualInputModes: uniqueStrings(visualInputEvents.map((item) => String(item.visualInputMode || "")).filter(Boolean)),
    autoVisionSwitched,
    autoVisionOriginalModel: modelSelection?.originalModel || null,
    autoVisionSelectedModel: modelSelection?.selectedModel || null,
    autoVisionReason: modelSelection?.reason || null,
    outboundFilesDeclared: numberValue(event.outboundFilesDeclared),
    outboundFilesResolved: numberValue(event.outboundFilesResolved),
    outboundFilesSent: numberValue(event.outboundFilesSent),
    outboundFileRequestCount: numberValue(event.outboundFileRequestCount),
    outboundFileErrors: Array.isArray(event.outboundFileErrors) ? event.outboundFileErrors : [],
    progressTransportActions: transportActions,
    totalElapsedMs: numberValue(event.totalElapsedMs),
    agentElapsedMs: numberValue(event.agentElapsedMs),
    firstProgressLatencyMs: event.firstProgressLatencyMs ?? null,
  };
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumNumbers(values) {
  return values.reduce((total, value) => total + numberValue(value), 0);
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function arrayStrings(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean) : [];
}

function isVisualAttachmentKind(value) {
  return value === "image" || value === "video" || value === "sticker";
}

function latestEvent(events) {
  return events
    .slice()
    .sort((left, right) => checkedAtMs(right) - checkedAtMs(left))[0] || null;
}

function isResolvedPermissionEvent(event) {
  const status = String(event.permissionStatus || "").toLowerCase();
  return status === "allowed"
    || status === "allow"
    || status === "allowed-all"
    || status === "allow-all"
    || status === "approved"
    || status === "denied"
    || status === "deny"
    || status === "rejected"
    || status === "timed-out"
    || status === "timeout"
    || status === "expired"
    || status === "failed";
}

function detectMarkdownSignals(text) {
  const signals = [];
  if (!text) return signals;
  if (/```[\s\S]*```/.test(text) || /(^|\n)```/.test(text)) signals.push("fenced_code");
  if (/(^|\n)\s{0,3}#{1,6}\s+\S/.test(text)) signals.push("heading");
  if (/(^|\n)\s{0,3}(?:[-*+]|\d+[.)])\s+\S/.test(text)) signals.push("list");
  if (/\*\*[^*\n][\s\S]*?\*\*/.test(text)) signals.push("bold");
  if (/(^|[^`])`[^`\n]+`([^`]|$)/.test(text)) signals.push("inline_code");
  if (/\[[^\]\n]+\]\([^)]+\)/.test(text)) signals.push("link");
  if (/(^|\n)\s*\|.+\|\s*(\n|$)/.test(text)) signals.push("table");
  if (/(^|\n)>\s+\S/.test(text)) signals.push("blockquote");
  return signals;
}

function loadSummary(options, since) {
  const config = readJson(options.configPath);
  const paths = eventPaths(config);
  const sinceMs = since.getTime();
  const allEvents = [
    ...readJsonLines(paths.feishu),
    ...readJsonLines(paths.octo),
  ].filter((event) => eventMatches(event, options, sinceMs));
  const progressEvents = allEvents.filter((event) => event.eventKind === "agent.progress");
  const transportProgressEvents = allEvents.filter((event) => event.eventKind === "agent.progress.reply" || event.eventKind === "agent.progress.card");
  const evidenceEvents = allEvents.filter((event) => {
    return event.eventKind === "agent.model.selected"
      || event.eventKind === "agent.attachments.staged"
      || event.eventKind === "agent.visual.input";
  });
  const permissionEvents = allEvents.filter((event) => event.eventKind === "agent.permission.prompt" || event.eventKind === "agent.permission.reply");
  const progressByRun = new Map();
  for (const event of [...progressEvents, ...transportProgressEvents]) {
    const key = runKey(event);
    const bucket = progressByRun.get(key) || [];
    bucket.push(event);
    progressByRun.set(key, bucket);
  }
  const evidenceByRun = new Map();
  for (const event of evidenceEvents) {
    const key = runKey(event);
    const bucket = evidenceByRun.get(key) || [];
    bucket.push(event);
    evidenceByRun.set(key, bucket);
  }
  const permissionsByRun = new Map();
  for (const event of permissionEvents) {
    const key = runKey(event);
    const bucket = permissionsByRun.get(key) || [];
    bucket.push(event);
    permissionsByRun.set(key, bucket);
  }
  const runs = allEvents
    .filter((event) => event.eventKind === "agent.run.finished")
    .sort((left, right) => checkedAtMs(right) - checkedAtMs(left))
    .map((event) => summarizeRun(
      event,
      progressByRun.get(runKey(event)) || [],
      evidenceByRun.get(runKey(event)) || [],
      permissionsByRun.get(runKey(event)) || [],
    ));
  const matchingRuns = runs.filter((run) => runSatisfies(run, options));
  const requirementViolations = runs.flatMap((run) => strictRunRequirementViolations(run, options));
  const displayedRuns = options.limitRuns === 0 ? [] : runs.slice(0, options.limitRuns);
  const displayedMatchingRuns = options.limitRuns === 0 ? [] : matchingRuns.slice(0, options.limitRuns);
  return {
    ok: matchingRuns.length >= options.minRuns && requirementViolations.length === 0,
    checkedAt: new Date().toISOString(),
    since: since.toISOString(),
    configPath: options.configPath,
    eventPaths: paths,
    requirements: {
      minRuns: options.minRuns,
      requireOk: options.requireOk,
      requireReply: options.requireReply,
      requireProgress: options.requireProgress,
      requireTool: options.requireTool,
      requireFile: options.requireFile,
      requireInboundFile: options.requireInboundFile,
      requireVisual: options.requireVisual,
      requireAutoVision: options.requireAutoVision,
      requireMarkdown: options.requireMarkdown,
      requireFeishuCard: options.requireFeishuCard,
      requireNoFinalProgressReply: options.requireNoFinalProgressReply,
      requireFeishuProgressCardCompleted: options.requireFeishuProgressCardCompleted,
      requirePermissionPrompt: options.requirePermissionPrompt,
      requirePermissionResolved: options.requirePermissionResolved,
      requireFeishuPermissionProgressCard: options.requireFeishuPermissionProgressCard,
    },
    filters: {
      bindings: options.bindings,
      platforms: options.platforms,
    },
    counts: {
      events: allEvents.length,
      progressEvents: progressEvents.length,
      transportProgressEvents: transportProgressEvents.length,
      evidenceEvents: evidenceEvents.length,
      permissionEvents: permissionEvents.length,
      finishedRuns: runs.length,
      matchingRuns: matchingRuns.length,
      requirementViolations: requirementViolations.length,
      displayedRuns: displayedRuns.length,
      displayedMatchingRuns: displayedMatchingRuns.length,
    },
    requirementViolations,
    runs: displayedRuns,
    matchingRuns: displayedMatchingRuns,
  };
}

function runSatisfies(run, options) {
  if (options.requireOk && run.agentOk !== true) return false;
  if (options.requireReply && run.replySent !== true) return false;
  if (options.requireProgress && !(run.progressEventCount > 0 || run.progressLogCount > 0)) return false;
  if (options.requireTool && !(run.toolProgressCount > 0 || run.latestProgressType === "tool")) return false;
  if (options.requireFile && !(run.outboundFilesDeclared > 0 && run.outboundFilesSent > 0 && run.outboundFileErrors.length === 0)) return false;
  if (options.requireInboundFile && !(run.fileAttachmentCount > 0 && run.attachmentStagingFailedCount === 0)) return false;
  if (options.requireVisual && !(run.visualAttachmentCount > 0 || run.visualInputCount > 0)) return false;
  if (options.requireAutoVision && run.autoVisionSwitched !== true) return false;
  if (options.requireMarkdown && run.replyMarkdownLikely !== true) return false;
  if (options.requireFeishuCard) {
    if (run.adapter !== "feishu") return false;
    if (run.replyCardAttempted !== true && !["send-final-card", "send-final-post-after-card"].includes(run.replyTransportAction)) return false;
  }
  if (options.requireNoFinalProgressReply && run.finalProgressReplyCount > 0) return false;
  if (options.requireFeishuProgressCardCompleted) {
    if (run.adapter !== "feishu") return false;
    if (run.agentOk === true && run.latestFeishuProgressCardStatus !== "completed") return false;
  }
  if (options.requirePermissionPrompt && run.permissionPromptCount <= 0) return false;
  if (options.requirePermissionResolved && run.permissionResolved !== true) return false;
  if (options.requireFeishuPermissionProgressCard) {
    if (run.adapter !== "feishu") return false;
    if (run.feishuPermissionProgressCardCount <= 0) return false;
  }
  return true;
}

function strictRunRequirementViolations(run, options) {
  const violations = [];
  if (options.requireNoFinalProgressReply && run.finalProgressReplyCount > 0) {
    violations.push({
      type: "final-progress-reply",
      adapter: run.adapter,
      bindingId: run.bindingId,
      sessionKey: run.sessionKey,
      messageId: run.messageId,
      count: run.finalProgressReplyCount,
    });
  }
  if (
    options.requireFeishuProgressCardCompleted
    && run.adapter === "feishu"
    && run.agentOk === true
    && run.latestFeishuProgressCardStatus !== "completed"
  ) {
    violations.push({
      type: "feishu-progress-card-not-completed",
      adapter: run.adapter,
      bindingId: run.bindingId,
      sessionKey: run.sessionKey,
      messageId: run.messageId,
      status: run.latestFeishuProgressCardStatus,
    });
  }
  if (options.requirePermissionResolved && run.permissionPromptCount > 0 && run.permissionResolved !== true) {
    violations.push({
      type: "permission-not-resolved",
      adapter: run.adapter,
      bindingId: run.bindingId,
      sessionKey: run.sessionKey,
      messageId: run.messageId,
      statuses: run.permissionStatuses,
    });
  }
  if (
    options.requireFeishuPermissionProgressCard
    && run.adapter === "feishu"
    && run.permissionPromptCount > 0
    && run.feishuPermissionProgressCardCount <= 0
  ) {
    violations.push({
      type: "feishu-permission-progress-card-missing",
      adapter: run.adapter,
      bindingId: run.bindingId,
      sessionKey: run.sessionKey,
      messageId: run.messageId,
    });
  }
  return violations;
}

async function waitForSummary(options, since) {
  const deadline = Date.now() + options.timeoutMs;
  let latest = loadSummary(options, since);
  while (Date.now() <= deadline) {
    latest = loadSummary(options, since);
    if (latest.ok) return latest;
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
  return latest;
}

function printHuman(summary, wait) {
  console.log(`Channel Agent run smoke ${summary.ok ? "passed" : "not satisfied"} since ${summary.since}`);
  console.log(`events=${summary.counts.events} progress=${summary.counts.progressEvents} runs=${summary.counts.finishedRuns} matching=${summary.counts.matchingRuns}/${summary.requirements.minRuns} violations=${summary.counts.requirementViolations}`);
  for (const run of summary.runs.slice(0, 8)) {
    const marks = [
      run.agentOk === true ? "ok" : run.agentOk === false ? "failed" : "unknown",
      run.replySent === true ? "reply" : "",
      run.outboundFilesSent > 0 ? `files=${run.outboundFilesSent}` : "",
      run.fileAttachmentCount > 0 ? `inbound-files=${run.fileAttachmentCount}` : "",
      run.visualAttachmentCount > 0 ? `visual=${run.visualAttachmentCount}` : "",
      run.autoVisionSwitched === true ? `auto-vision=${run.autoVisionOriginalModel}->${run.autoVisionSelectedModel}` : "",
      run.toolProgressCount > 0 ? `tools=${run.toolProgressCount}` : "",
      run.permissionPromptCount > 0 ? `permission-prompts=${run.permissionPromptCount}` : "",
      run.permissionStatuses.length > 0 ? `permission-status=${run.permissionStatuses.join(",")}` : "",
      run.feishuPermissionProgressCardCount > 0 ? `permission-card=${run.feishuPermissionProgressCardCount}` : "",
      run.finalProgressReplyCount > 0 ? `final-progress-replies=${run.finalProgressReplyCount}` : "",
      run.latestFeishuProgressCardStatus ? `progress-card=${run.latestFeishuProgressCardStatus}` : "",
      run.replyMarkdownLikely === true ? `markdown=${run.markdownSignals.join(",")}` : "",
      run.replyCardAttempted === true ? "feishu-card" : "",
    ].filter(Boolean).join(" ");
    console.log(`- ${run.adapter}/${run.bindingId} message=${run.messageId} ${marks}`);
  }
  if (wait && !summary.ok) {
    console.log("Timed out before requirements were satisfied.");
  }
}

function isRecoverableToolResultError(event) {
  const progressType = String(event.progressType || event.latestProgress?.type || "");
  if (progressType !== "failed" && progressType !== "error") return false;
  return String(event.rawType || event.latestProgress?.rawType || "").toLowerCase() === "user"
    && String(event.itemType || event.latestProgress?.itemType || "").toLowerCase() === "tool_result";
}

async function main() {
  const startedAt = new Date();
  const options = parseArgs(process.argv.slice(2));
  const since = sinceDate(options, startedAt);
  const summary = options.wait ? await waitForSummary(options, since) : loadSummary(options, since);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHuman(summary, options.wait);
  }
  if (!summary.ok) process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
});
