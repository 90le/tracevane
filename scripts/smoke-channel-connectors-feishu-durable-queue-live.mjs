#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_EVENT_LOG = path.join(os.homedir(), ".config/tracevane/channel-connectors/daemon/state/feishu-events.jsonl");
const DEFAULT_BINDING_ID = "feishu-live";
const DEFAULT_SINCE_MINUTES = 24 * 60;
const DEFAULT_TIMEOUT_MS = 0;
const DEFAULT_POLL_MS = 1_000;

function parseArgs(argv) {
  const options = {
    eventLog: DEFAULT_EVENT_LOG,
    bindingId: DEFAULT_BINDING_ID,
    agent: "",
    since: "",
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    mode: "busy-reject",
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--allow-failed-run") continue;
    else if (arg === "--event-log") options.eventLog = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--event-log=")) options.eventLog = arg.slice("--event-log=".length);
    else if (arg === "--binding") options.bindingId = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--binding=")) options.bindingId = arg.slice("--binding=".length);
    else if (arg === "--agent") options.agent = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--agent=")) options.agent = arg.slice("--agent=".length);
    else if (arg === "--mode") options.mode = busyMode(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--mode=")) options.mode = busyMode(arg.slice("--mode=".length));
    else if (arg === "--since") options.since = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--since=")) options.since = arg.slice("--since=".length);
    else if (arg === "--since-minutes") options.sinceMinutes = nonNegativeInt(requireValue(argv, ++index, arg), DEFAULT_SINCE_MINUTES);
    else if (arg.startsWith("--since-minutes=")) options.sinceMinutes = nonNegativeInt(arg.slice("--since-minutes=".length), DEFAULT_SINCE_MINUTES);
    else if (arg === "--wait" || arg === "--watch") options.timeoutMs = 120_000;
    else if (arg === "--timeout-ms") options.timeoutMs = nonNegativeInt(requireValue(argv, ++index, arg), DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = nonNegativeInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--poll-ms") options.pollMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_POLL_MS);
    else if (arg.startsWith("--poll-ms=")) options.pollMs = positiveInt(arg.slice("--poll-ms=".length), DEFAULT_POLL_MS);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.eventLog = path.resolve(options.eventLog);
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs [options]

Read-only Feishu busy-guard live evidence check. The script name is kept as a
legacy alias; IM task queues are intentionally disabled. It scans the daemon
Feishu event log and requires one real long-connection message rejected while
another Agent run was active.

Required evidence for one message:
  1. eventKind=message with longConnection=true
  2. eventKind=channel.agent.rejected_busy
  3. no later eventKind=agent.run.started for the rejected message

Options:
  --event-log <path>       Event log path. Default: ${DEFAULT_EVENT_LOG}
  --binding <id>           Binding id. Default: ${DEFAULT_BINDING_ID}
  --agent <name>           Filter active Agent, for example codex, claude-code, opencode.
  --mode <busy-reject|durable|fifo|any>
                            Legacy queue modes are accepted as aliases for busy-reject.
  --since <iso>            Include events at or after this ISO timestamp.
  --since-minutes <n>      Include recent events. Default: ${DEFAULT_SINCE_MINUTES}.
  --wait                   Wait up to 120s for matching evidence.
  --timeout-ms <n>         Wait duration. Default: ${DEFAULT_TIMEOUT_MS}.
  --poll-ms <n>            Poll interval while waiting. Default: ${DEFAULT_POLL_MS}.
  --json                   Emit JSON only.
  -h, --help               Show this help.

Example live check:
  node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --wait --json

Minimal busy-reject scenario:
  1. Start this script with --wait --json.
  2. Send a long-running Feishu Agent request.
  3. Before it finishes, send a second Feishu message in the same chat.
  4. The second message should be rejected with a /stop hint, not queued.
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function busyMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["busy-reject", "reject", "durable", "fifo", "any"].includes(normalized)) return "busy-reject";
  throw new Error(`Unsupported mode: ${value}`);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sinceMs(options, nowMs = Date.now()) {
  if (options.since) {
    const parsed = Date.parse(options.since);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid --since timestamp: ${options.since}`);
    return parsed;
  }
  return nowMs - options.sinceMinutes * 60_000;
}

function readJsonLinesIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  });
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function toTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameBinding(event, bindingId) {
  return normalizeString(event?.bindingId) === bindingId;
}

function sameSession(event, sessionKey) {
  return normalizeString(event?.sessionKey) === normalizeString(sessionKey);
}

function sameMessage(event, messageId) {
  return normalizeString(event?.messageId) === normalizeString(messageId);
}

function eventAfter(event, afterMs) {
  return toTime(event?.checkedAt) >= afterMs;
}

function findLongConnectionInbound(events, rejected) {
  return events.find((event) => {
    if (event?.eventKind !== "message") return false;
    if (event?.longConnection !== true) return false;
    if (!sameMessage(event, rejected.messageId)) return false;
    if (rejected.channelId && normalizeString(event.channelId) !== normalizeString(rejected.channelId)) return false;
    if (rejected.fromUid && normalizeString(event.fromUid) !== normalizeString(rejected.fromUid)) return false;
    return true;
  }) || null;
}

function findRejectedRunStarted(events, rejected) {
  const rejectedAtMs = toTime(rejected.checkedAt);
  return events.find((event) => {
    if (event?.eventKind !== "agent.run.started") return false;
    if (!sameBinding(event, rejected.bindingId)) return false;
    if (!sameSession(event, rejected.sessionKey)) return false;
    if (!sameMessage(event, rejected.messageId)) return false;
    return eventAfter(event, rejectedAtMs);
  }) || null;
}

function activeAgentMatches(rejected, options) {
  const agentFilter = normalizeString(options.agent).toLowerCase();
  if (!agentFilter) return true;
  return normalizeString(rejected.activeAgent || rejected.agent).toLowerCase() === agentFilter;
}

function buildProofs(events, options, minTimeMs) {
  const rejectedEvents = events.filter((event) => {
    return event?.eventKind === "channel.agent.rejected_busy"
      && event?.adapter === "feishu"
      && sameBinding(event, options.bindingId)
      && toTime(event.checkedAt) >= minTimeMs;
  });
  const proofs = [];
  const rejected = [];
  for (const item of rejectedEvents) {
    const inbound = findLongConnectionInbound(events, item);
    if (!inbound) {
      rejected.push(rejection(item, "missing_long_connection_inbound"));
      continue;
    }
    if (!activeAgentMatches(item, options)) {
      rejected.push(rejection(item, "active_agent_filter_mismatch"));
      continue;
    }
    const started = findRejectedRunStarted(events, item);
    if (started) {
      rejected.push(rejection(item, "rejected_message_started", started.checkedAt || null));
      continue;
    }
    proofs.push(proofForBusyReject({ options, rejected: item, inbound }));
  }
  proofs.sort((a, b) => toTime(a.rejectedAt) - toTime(b.rejectedAt));
  return { proofs, rejected };
}

function proofForBusyReject(input) {
  const { options, rejected, inbound } = input;
  return {
    kind: "busy-reject",
    bindingId: options.bindingId,
    sessionKey: normalizeString(rejected.sessionKey),
    messageId: normalizeString(rejected.messageId),
    inboundAt: inbound.checkedAt || null,
    rejectedAt: rejected.checkedAt || null,
    activeRunId: normalizeString(rejected.activeRunId) || null,
    activeMessageId: normalizeString(rejected.activeMessageId) || null,
    activeAgent: normalizeString(rejected.activeAgent) || null,
    activeModel: normalizeString(rejected.activeModel) || null,
    activeStartedAt: normalizeString(rejected.activeStartedAt) || null,
    replySent: rejected.replySent === true,
    longConnection: true,
  };
}

function rejection(event, reason, detail = null) {
  return {
    kind: "busy-reject",
    bindingId: normalizeString(event?.bindingId) || null,
    sessionKey: normalizeString(event?.sessionKey) || null,
    messageId: normalizeString(event?.messageId) || null,
    reason,
    detail,
    checkedAt: event?.checkedAt || null,
  };
}

function buildResult(options, nowMs = Date.now()) {
  const minTimeMs = sinceMs(options, nowMs);
  const events = readJsonLinesIfExists(options.eventLog);
  const scopedEvents = events.filter((event) => toTime(event?.checkedAt) >= minTimeMs);
  const { proofs, rejected } = buildProofs(scopedEvents, options, minTimeMs);
  return {
    ok: proofs.length > 0,
    checkedAt: new Date(nowMs).toISOString(),
    mode: options.mode,
    bindingId: options.bindingId,
    agent: options.agent || null,
    eventLog: options.eventLog,
    since: new Date(minTimeMs).toISOString(),
    eventCount: scopedEvents.length,
    proofCount: proofs.length,
    rejectedCount: rejected.length,
    proofs,
    rejected: rejected.slice(-20),
    failures: proofs.length ? [] : [{
      type: "missing_feishu_busy_reject_evidence",
      message: "No Feishu long-connection message was rejected by the IM busy guard for the selected filters.",
    }],
  };
}

async function waitForResult(options) {
  const deadlineMs = Date.now() + options.timeoutMs;
  let result = buildResult(options);
  while (!result.ok && Date.now() < deadlineMs) {
    await sleep(options.pollMs);
    result = buildResult(options);
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Feishu busy-guard live evidence: ${result.ok ? "OK" : "FAIL"}`);
  console.log(`mode=${result.mode} binding=${result.bindingId} proofs=${result.proofCount} rejected=${result.rejectedCount} since=${result.since}`);
  for (const proof of result.proofs) {
    console.log(`- ${proof.kind} message=${proof.messageId} rejected=${proof.rejectedAt} active=${proof.activeAgent || "unknown"}/${proof.activeModel || "unknown"} replySent=${proof.replySent}`);
  }
  for (const failure of result.failures) {
    console.log(`- ${failure.type}: ${failure.message}`);
  }
  for (const item of result.rejected.slice(-5)) {
    console.log(`- rejected ${item.messageId || "unknown"}: ${item.reason}${item.detail ? ` (${item.detail})` : ""}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await waitForResult(options);
  printResult(result, options.json);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
