#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const STATE_DIR = path.join(os.homedir(), ".config/tracevane/channel-connectors/daemon/state");
const DEFAULT_SINCE_MINUTES = 24 * 60;
const DEFAULT_TIMEOUT_MS = 0;
const DEFAULT_POLL_MS = 1_000;

function platformDefaults(platform) {
  if (platform === "feishu") {
    return {
      eventLog: path.join(STATE_DIR, "feishu-events.jsonl"),
      bindingId: "feishu-live",
      requireLongConnectionIngress: true,
    };
  }
  if (platform === "octo") {
    return {
      eventLog: path.join(STATE_DIR, "octo-events.jsonl"),
      bindingId: "octo-tracevane-cc",
      requireLongConnectionIngress: false,
    };
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

function parseArgs(argv) {
  const options = {
    platform: "feishu",
    eventLog: "",
    bindingId: "",
    agent: "",
    mode: "any",
    since: "",
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--platform") options.platform = normalizePlatform(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--platform=")) options.platform = normalizePlatform(arg.slice("--platform=".length));
    else if (arg === "--event-log") options.eventLog = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--event-log=")) options.eventLog = arg.slice("--event-log=".length);
    else if (arg === "--binding") options.bindingId = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--binding=")) options.bindingId = arg.slice("--binding=".length);
    else if (arg === "--agent") options.agent = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--agent=")) options.agent = arg.slice("--agent=".length);
    else if (arg === "--mode") options.mode = compactMode(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--mode=")) options.mode = compactMode(arg.slice("--mode=".length));
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

  options.platform = normalizePlatform(options.platform);
  const defaults = platformDefaults(options.platform);
  options.eventLog = path.resolve(options.eventLog || defaults.eventLog);
  options.bindingId = options.bindingId || defaults.bindingId;
  options.requireLongConnectionIngress = defaults.requireLongConnectionIngress;
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-compact-live.mjs [options]

Read-only compact evidence check for Channel Connectors. The script does not
send IM messages. It scans daemon event logs and requires native compact
completion evidence for the selected platform.

Modes:
  any       Accept explicit /compact evidence or auto compact evidence. Default.
  explicit  Require a channel.command compact/compress event.
  auto      Require agent.auto_compact.* native-first evidence.

Options:
  --platform <feishu|octo> Platform to inspect. Default: feishu.
  --event-log <path>       Event log path. Defaults to the selected platform log.
  --binding <id>           Binding id. Default: feishu-live or octo-tracevane-cc.
  --agent <name>           Filter by Agent, for example codex, claude-code, opencode.
  --mode <any|explicit|auto>
  --since <iso>            Include events at or after this ISO timestamp.
  --since-minutes <n>      Include recent events. Default: ${DEFAULT_SINCE_MINUTES}.
  --wait                   Wait up to 120s for matching evidence.
  --timeout-ms <n>         Wait duration. Default: ${DEFAULT_TIMEOUT_MS}.
  --poll-ms <n>            Poll interval while waiting. Default: ${DEFAULT_POLL_MS}.
  --json                   Emit JSON only.
  -h, --help               Show this help.

Examples:
  node scripts/smoke-channel-connectors-compact-live.mjs --platform feishu --mode explicit --json
  node scripts/smoke-channel-connectors-compact-live.mjs --platform octo --mode auto --json
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function normalizePlatform(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "feishu" || normalized === "octo") return normalized;
  throw new Error(`Unsupported platform: ${value}`);
}

function compactMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["any", "explicit", "auto"].includes(normalized)) return normalized;
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
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  });
}

function toTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function sameBinding(event, bindingId) {
  return normalizeString(event?.bindingId) === bindingId;
}

function compactCommand(event) {
  const command = normalizeString(event?.command || event?.aliasCommand).replace(/^\/+/, "").split(/\s+/, 1)[0].toLowerCase();
  const action = normalizeString(event?.commandAction).toLowerCase();
  return command === "compact" || command === "compress" || action === "compact";
}

function compactMessageMatches(compactMessageId, messageId) {
  const compact = normalizeString(compactMessageId);
  const original = normalizeString(messageId);
  return Boolean(original) && (compact === original || compact === `compact:${original}`);
}

function sameSession(event, sessionKey) {
  return normalizeString(event?.sessionKey) === normalizeString(sessionKey);
}

function findLongConnectionInbound(events, input) {
  return events.find((event) => {
    if (event?.eventKind !== "message") return false;
    if (event?.longConnection !== true) return false;
    if (normalizeString(event.messageId) !== normalizeString(input.messageId)) return false;
    if (input.channelId && normalizeString(event.channelId) !== normalizeString(input.channelId)) return false;
    if (input.fromUid && normalizeString(event.fromUid) !== normalizeString(input.fromUid)) return false;
    return true;
  }) || null;
}

function findNativeFinished(events, bindingId, sessionKey, messageId, afterMs, beforeMs = Number.POSITIVE_INFINITY) {
  return events.find((event) => {
    if (event?.eventKind !== "agent.native_compact.finished") return false;
    if (!sameBinding(event, bindingId)) return false;
    if (!sameSession(event, sessionKey)) return false;
    if (!compactMessageMatches(event.messageId, messageId)) return false;
    if (toTime(event.checkedAt) < afterMs) return false;
    if (toTime(event.checkedAt) > beforeMs) return false;
    return event.ok === true;
  }) || null;
}

function findAutoFinished(events, bindingId, sessionKey, messageId, afterMs) {
  return events.find((event) => {
    if (event?.eventKind !== "agent.auto_compact.finished") return false;
    if (!sameBinding(event, bindingId)) return false;
    if (!sameSession(event, sessionKey)) return false;
    if (normalizeString(event.messageId) !== normalizeString(messageId)) return false;
    if (toTime(event.checkedAt) < afterMs) return false;
    return event.ok === true && normalizeString(event.action).toLowerCase() === "native";
  }) || null;
}

function inboundProofForEvent(events, event, options) {
  if (!options.requireLongConnectionIngress) {
    return { ok: true, inbound: null, proof: "event-log" };
  }
  const inbound = findLongConnectionInbound(events, {
    messageId: event.messageId,
    channelId: event.channelId,
    fromUid: event.fromUid,
  });
  return inbound
    ? { ok: true, inbound, proof: "long-connection" }
    : { ok: false, inbound: null, proof: "missing-long-connection" };
}

function buildAutoProofs(events, options, minTimeMs) {
  const thresholds = events.filter((event) => {
    return event?.eventKind === "agent.auto_compact.threshold"
      && sameBinding(event, options.bindingId)
      && toTime(event.checkedAt) >= minTimeMs;
  });
  const proofs = [];
  for (const threshold of thresholds) {
    const messageId = normalizeString(threshold.messageId);
    const sessionKey = normalizeString(threshold.sessionKey);
    const thresholdAtMs = toTime(threshold.checkedAt);
    const inboundResult = inboundProofForEvent(events, threshold, options);
    if (!inboundResult.ok) continue;
    const nativeFinished = findNativeFinished(events, options.bindingId, sessionKey, messageId, thresholdAtMs);
    const autoFinished = findAutoFinished(events, options.bindingId, sessionKey, messageId, thresholdAtMs);
    if (!nativeFinished || !autoFinished) continue;
    proofs.push({
      kind: "auto",
      platform: options.platform,
      bindingId: options.bindingId,
      sessionKey,
      messageId,
      inboundAt: inboundResult.inbound?.checkedAt || null,
      thresholdAt: threshold.checkedAt || null,
      compactAt: nativeFinished.checkedAt || autoFinished.checkedAt || null,
      autoFinishedAt: autoFinished.checkedAt || null,
      transportProof: inboundResult.proof,
      longConnection: inboundResult.inbound ? true : null,
      agent: normalizeString(nativeFinished.agent) || null,
      model: normalizeString(nativeFinished.model) || threshold.budget?.modelId || null,
      nativeOk: true,
      action: normalizeString(autoFinished.action) || null,
      progressEventCount: Number(nativeFinished.progressEventCount || 0),
      usedPercent: threshold.budget?.usedPercent ?? null,
      contextWindow: threshold.budget?.contextWindow ?? null,
      maxOutputTokens: threshold.budget?.maxOutputTokens ?? null,
    });
  }
  return proofs;
}

function buildExplicitProofs(events, options, minTimeMs) {
  const commands = events.filter((event) => {
    return event?.eventKind === "channel.command"
      && sameBinding(event, options.bindingId)
      && toTime(event.checkedAt) >= minTimeMs
      && compactCommand(event);
  });
  const proofs = [];
  for (const command of commands) {
    const messageId = normalizeString(command.messageId);
    const sessionKey = normalizeString(command.sessionKey);
    const commandAtMs = toTime(command.checkedAt);
    const inboundResult = inboundProofForEvent(events, command, options);
    if (!inboundResult.ok) continue;
    const nativeAfterMs = inboundResult.inbound ? toTime(inboundResult.inbound.checkedAt) : Math.max(minTimeMs, commandAtMs - 60_000);
    const nativeFinished = findNativeFinished(events, options.bindingId, sessionKey, messageId, nativeAfterMs, commandAtMs + 60_000);
    if (!nativeFinished) continue;
    proofs.push({
      kind: "explicit",
      platform: options.platform,
      bindingId: options.bindingId,
      sessionKey,
      messageId,
      inboundAt: inboundResult.inbound?.checkedAt || null,
      commandAt: command.checkedAt || null,
      compactAt: nativeFinished.checkedAt || null,
      transportProof: inboundResult.proof,
      longConnection: inboundResult.inbound ? true : null,
      command: normalizeString(command.command || command.aliasCommand) || null,
      commandAction: normalizeString(command.commandAction) || null,
      commandOk: command.commandOk === true,
      agent: normalizeString(nativeFinished.agent) || null,
      model: normalizeString(nativeFinished.model) || null,
      nativeOk: true,
      progressEventCount: Number(nativeFinished.progressEventCount || 0),
    });
  }
  return proofs;
}

function buildResult(options, nowMs = Date.now()) {
  const minTimeMs = sinceMs(options, nowMs);
  const events = readJsonLinesIfExists(options.eventLog);
  const scopedEvents = events.filter((event) => toTime(event?.checkedAt) >= minTimeMs);
  const autoProofs = options.mode === "explicit" ? [] : buildAutoProofs(scopedEvents, options, minTimeMs);
  const explicitProofs = options.mode === "auto" ? [] : buildExplicitProofs(scopedEvents, options, minTimeMs);
  const agentFilter = normalizeString(options.agent).toLowerCase();
  const proofs = [...explicitProofs, ...autoProofs]
    .filter((proof) => !agentFilter || normalizeString(proof.agent).toLowerCase() === agentFilter)
    .sort((a, b) => toTime(a.compactAt) - toTime(b.compactAt));
  return {
    ok: proofs.length > 0,
    checkedAt: new Date(nowMs).toISOString(),
    platform: options.platform,
    mode: options.mode,
    bindingId: options.bindingId,
    agent: options.agent || null,
    eventLog: options.eventLog,
    since: new Date(minTimeMs).toISOString(),
    eventCount: scopedEvents.length,
    proofCount: proofs.length,
    proofs,
    failures: proofs.length ? [] : [{
      type: "missing_channel_compact_evidence",
      message: missingEvidenceMessage(options),
    }],
  };
}

function missingEvidenceMessage(options) {
  const scope = `${options.platform} ${options.mode}`;
  if (options.requireLongConnectionIngress) {
    return `No ${scope} native compact completion matched the selected filters with long-connection ingress evidence.`;
  }
  return `No ${scope} native compact completion matched the selected filters.`;
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
  console.log(`${result.platform} compact live evidence: ${result.ok ? "OK" : "FAIL"}`);
  console.log(`mode=${result.mode} binding=${result.bindingId} proofs=${result.proofCount} since=${result.since}`);
  for (const proof of result.proofs) {
    console.log(`- ${proof.kind} message=${proof.messageId} compactAt=${proof.compactAt} agent=${proof.agent || "unknown"} model=${proof.model || "unknown"} proof=${proof.transportProof} progress=${proof.progressEventCount}`);
  }
  for (const failure of result.failures) {
    console.log(`- ${failure.type}: ${failure.message}`);
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
