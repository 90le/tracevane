#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_EVENT_LOG = path.join(os.homedir(), ".config/openclaw-studio/channel-connectors/daemon/state/feishu-events.jsonl");
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
    mode: "durable",
    allowFailedRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--allow-failed-run") options.allowFailedRun = true;
    else if (arg === "--event-log") options.eventLog = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--event-log=")) options.eventLog = arg.slice("--event-log=".length);
    else if (arg === "--binding") options.bindingId = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--binding=")) options.bindingId = arg.slice("--binding=".length);
    else if (arg === "--agent") options.agent = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--agent=")) options.agent = arg.slice("--agent=".length);
    else if (arg === "--mode") options.mode = queueMode(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--mode=")) options.mode = queueMode(arg.slice("--mode=".length));
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

Read-only Feishu durable queue live evidence check. The script does not send
Feishu messages. It scans the daemon Feishu event log and requires one real
long-connection message that was queued while another Agent run was active,
then replayed after daemon restart and completed.

Required evidence for one message:
  1. eventKind=message with longConnection=true
  2. eventKind=channel.agent.queued
  3. eventKind=channel.agent.pending_replay
  4. eventKind=agent.run.started
  5. eventKind=agent.run.finished

Options:
  --event-log <path>       Event log path. Default: ${DEFAULT_EVENT_LOG}
  --binding <id>           Binding id. Default: ${DEFAULT_BINDING_ID}
  --agent <name>           Filter replayed Agent, for example codex, claude-code, opencode.
  --mode <durable|fifo|any>
                            durable requires pending_replay; fifo accepts same-process queued drain.
  --since <iso>            Include events at or after this ISO timestamp.
  --since-minutes <n>      Include recent events. Default: ${DEFAULT_SINCE_MINUTES}.
  --wait                   Wait up to 120s for matching evidence.
  --timeout-ms <n>         Wait duration. Default: ${DEFAULT_TIMEOUT_MS}.
  --poll-ms <n>            Poll interval while waiting. Default: ${DEFAULT_POLL_MS}.
  --allow-failed-run       Accept replay proof even if the final Agent run failed.
  --json                   Emit JSON only.
  -h, --help               Show this help.

Example live check after creating the restart scenario in Feishu:
  node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --wait --json

Minimal durable replay scenario:
  1. Start this script with --mode durable --wait --json.
  2. Send a long-running Feishu Agent request.
  3. Before it finishes, send a second Feishu message in the same chat so it queues.
  4. Restart openclaw-studio-channel-connectors.service before the queued run starts.
  5. The script passes after pending_replay -> agent.run.finished appears.
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function queueMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["durable", "fifo", "any"].includes(normalized)) return normalized;
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

function runOk(event, options) {
  if (options.allowFailedRun) return true;
  return event?.agentOk === true || event?.ok === true || normalizeString(event?.agentStatus || event?.status) === "completed";
}

function eventAfter(event, afterMs) {
  return toTime(event?.checkedAt) >= afterMs;
}

function findLongConnectionInbound(events, queued) {
  return events.find((event) => {
    if (event?.eventKind !== "message") return false;
    if (event?.longConnection !== true) return false;
    if (!sameMessage(event, queued.messageId)) return false;
    if (queued.channelId && normalizeString(event.channelId) !== normalizeString(queued.channelId)) return false;
    if (queued.fromUid && normalizeString(event.fromUid) !== normalizeString(queued.fromUid)) return false;
    return true;
  }) || null;
}

function findReplayFailure(events, queued) {
  return events.find((event) => {
    if (event?.eventKind !== "channel.agent.pending_replay_failed") return false;
    if (!sameBinding(event, queued.bindingId)) return false;
    if (!sameSession(event, queued.sessionKey)) return false;
    if (!sameMessage(event, queued.messageId)) return false;
    if (queued.pendingRunId && normalizeString(event.pendingRunId) !== normalizeString(queued.pendingRunId)) return false;
    return eventAfter(event, toTime(queued.checkedAt));
  }) || null;
}

function findReplay(events, queued) {
  return events.find((event) => {
    if (event?.eventKind !== "channel.agent.pending_replay") return false;
    if (!sameBinding(event, queued.bindingId)) return false;
    if (!sameSession(event, queued.sessionKey)) return false;
    if (!sameMessage(event, queued.messageId)) return false;
    if (queued.pendingRunId && normalizeString(event.pendingRunId) !== normalizeString(queued.pendingRunId)) return false;
    return eventAfter(event, toTime(queued.checkedAt));
  }) || null;
}

function findRunStarted(events, queued, replay) {
  const replayAtMs = toTime(replay.checkedAt);
  return events.find((event) => {
    if (event?.eventKind !== "agent.run.started") return false;
    if (!sameBinding(event, queued.bindingId)) return false;
    if (!sameSession(event, queued.sessionKey)) return false;
    if (!sameMessage(event, queued.messageId)) return false;
    return eventAfter(event, replayAtMs);
  }) || null;
}

function findDirectRunStarted(events, queued) {
  const queuedAtMs = toTime(queued.checkedAt);
  return events.find((event) => {
    if (event?.eventKind !== "agent.run.started") return false;
    if (!sameBinding(event, queued.bindingId)) return false;
    if (!sameSession(event, queued.sessionKey)) return false;
    if (!sameMessage(event, queued.messageId)) return false;
    return eventAfter(event, queuedAtMs);
  }) || null;
}

function findRunFinished(events, queued, started, options) {
  const startedAtMs = toTime(started.checkedAt);
  const agentFilter = normalizeString(options.agent).toLowerCase();
  return events.find((event) => {
    if (event?.eventKind !== "agent.run.finished") return false;
    if (!sameBinding(event, queued.bindingId)) return false;
    if (!sameSession(event, queued.sessionKey)) return false;
    if (!sameMessage(event, queued.messageId)) return false;
    if (!eventAfter(event, startedAtMs)) return false;
    if (agentFilter && normalizeString(event.agent).toLowerCase() !== agentFilter) return false;
    return runOk(event, options);
  }) || null;
}

function buildProofs(events, options, minTimeMs) {
  const queuedEvents = events.filter((event) => {
    return event?.eventKind === "channel.agent.queued"
      && event?.adapter === "feishu"
      && sameBinding(event, options.bindingId)
      && toTime(event.checkedAt) >= minTimeMs;
  });
  const proofs = [];
  const rejected = [];
  for (const queued of queuedEvents) {
    const inbound = findLongConnectionInbound(events, queued);
    if (!inbound) {
      rejected.push(rejection(queued, "missing_long_connection_inbound"));
      continue;
    }
    const replay = findReplay(events, queued);
    if (options.mode !== "fifo") {
      const replayFailed = findReplayFailure(events, queued);
      if (replayFailed) {
        rejected.push(rejection(queued, "pending_replay_failed", replayFailed.error || replayFailed.reason || null, "durable"));
        continue;
      }
      if (replay) {
        const started = findRunStarted(events, queued, replay);
        if (!started) {
          rejected.push(rejection(queued, "missing_replayed_run_started", null, "durable"));
          continue;
        }
        const finished = findRunFinished(events, queued, started, options);
        if (!finished) {
          rejected.push(rejection(queued, options.allowFailedRun ? "missing_replayed_run_finished" : "missing_successful_replayed_run_finished", null, "durable"));
          continue;
        }
        proofs.push(proofForQueue({
          kind: "durable",
          options,
          queued,
          inbound,
          replay,
          started,
          finished,
        }));
        continue;
      }
      if (options.mode === "durable") {
        rejected.push(rejection(queued, "missing_pending_replay", null, "durable"));
        continue;
      }
    }

    if (options.mode === "durable") continue;
    if (replay) {
      rejected.push(rejection(queued, "has_pending_replay_not_fifo", null, "fifo"));
      continue;
    }
    const started = findDirectRunStarted(events, queued);
    if (!started) {
      rejected.push(rejection(queued, "missing_fifo_run_started", null, "fifo"));
      continue;
    }
    const finished = findRunFinished(events, queued, started, options);
    if (!finished) {
      rejected.push(rejection(queued, options.allowFailedRun ? "missing_fifo_run_finished" : "missing_successful_fifo_run_finished", null, "fifo"));
      continue;
    }
    proofs.push(proofForQueue({
      kind: "fifo",
      options,
      queued,
      inbound,
      replay: null,
      started,
      finished,
    }));
  }
  proofs.sort((a, b) => toTime(a.finishedAt) - toTime(b.finishedAt));
  return { proofs, rejected };
}

function proofForQueue(input) {
  const { kind, options, queued, inbound, replay, started, finished } = input;
  return {
    kind,
    bindingId: options.bindingId,
    sessionKey: normalizeString(queued.sessionKey),
    messageId: normalizeString(queued.messageId),
    pendingRunId: normalizeString(queued.pendingRunId) || null,
    inboundAt: inbound.checkedAt || null,
    queuedAt: queued.checkedAt || null,
    replayAt: replay?.checkedAt || null,
    startedAt: started.checkedAt || null,
    finishedAt: finished.checkedAt || null,
    queuePosition: Number.isFinite(Number(queued.queuePosition)) ? Number(queued.queuePosition) : null,
    attempt: Number.isFinite(Number(replay?.attempt)) ? Number(replay.attempt) : null,
    agent: normalizeString(finished.agent || started.agent) || null,
    model: normalizeString(finished.model || started.model) || null,
    agentOk: finished.agentOk === true || finished.ok === true,
    agentStatus: normalizeString(finished.agentStatus || finished.status) || null,
    replySent: finished.replySent === true,
    progressEventCount: Number.isFinite(Number(finished.progressEventCount)) ? Number(finished.progressEventCount) : null,
    longConnection: true,
  };
}

function rejection(event, reason, detail = null, kind = null) {
  return {
    kind,
    bindingId: normalizeString(event?.bindingId) || null,
    sessionKey: normalizeString(event?.sessionKey) || null,
    messageId: normalizeString(event?.messageId) || null,
    pendingRunId: normalizeString(event?.pendingRunId) || null,
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
      type: "missing_feishu_durable_queue_evidence",
      message: missingEvidenceMessage(options.mode),
    }],
  };
}

function missingEvidenceMessage(mode) {
  if (mode === "fifo") return "No Feishu long-connection queued message drained through same-process FIFO for the selected filters.";
  if (mode === "any") return "No Feishu long-connection queued message matched durable replay or same-process FIFO evidence for the selected filters.";
  return "No Feishu long-connection queued message was replayed and completed after daemon restart for the selected filters.";
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
  console.log(`Feishu queue live evidence: ${result.ok ? "OK" : "FAIL"}`);
  console.log(`mode=${result.mode} binding=${result.bindingId} proofs=${result.proofCount} rejected=${result.rejectedCount} since=${result.since}`);
  for (const proof of result.proofs) {
    console.log(`- ${proof.kind} message=${proof.messageId} queued=${proof.queuedAt} replay=${proof.replayAt || "none"} finished=${proof.finishedAt} agent=${proof.agent || "unknown"} model=${proof.model || "unknown"} ok=${proof.agentOk}`);
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
