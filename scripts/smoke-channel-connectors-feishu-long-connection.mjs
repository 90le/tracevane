#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_RUNTIME_PATH = path.join(os.homedir(), ".config/openclaw-studio/channel-connectors/daemon/runtime.json");
const DEFAULT_LOG_PATH = path.join(os.homedir(), ".config/openclaw-studio/channel-connectors/daemon/logs/channel-connectors.log");
const DEFAULT_DURATION_MS = 70_000;
const DEFAULT_POLL_MS = 1_000;
const MIN_SAFE_WATCHDOG_MS = 60_000;

function parseArgs(argv) {
  const options = {
    runtimePath: DEFAULT_RUNTIME_PATH,
    logPath: DEFAULT_LOG_PATH,
    durationMs: DEFAULT_DURATION_MS,
    pollMs: DEFAULT_POLL_MS,
    since: "",
    bindings: [],
    keys: [],
    requireAlwaysConnected: false,
    allowDisconnected: false,
    allowPingTimeout: false,
    allowZeroInboundRenewal: false,
    allowConnectedIdleRenewal: false,
    allowWatchdogRestart: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--require-always-connected") options.requireAlwaysConnected = true;
    else if (arg === "--allow-disconnected") options.allowDisconnected = true;
    else if (arg === "--allow-ping-timeout") options.allowPingTimeout = true;
    else if (arg === "--allow-zero-inbound-renewal") options.allowZeroInboundRenewal = true;
    else if (arg === "--allow-connected-idle-renewal") options.allowConnectedIdleRenewal = true;
    else if (arg === "--allow-watchdog-restart") options.allowWatchdogRestart = true;
    else if (arg === "--runtime") options.runtimePath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--runtime=")) options.runtimePath = arg.slice("--runtime=".length);
    else if (arg === "--log") options.logPath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--log=")) options.logPath = arg.slice("--log=".length);
    else if (arg === "--duration-ms") options.durationMs = nonNegativeInt(requireValue(argv, ++index, arg), DEFAULT_DURATION_MS);
    else if (arg.startsWith("--duration-ms=")) options.durationMs = nonNegativeInt(arg.slice("--duration-ms=".length), DEFAULT_DURATION_MS);
    else if (arg === "--poll-ms") options.pollMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_POLL_MS);
    else if (arg.startsWith("--poll-ms=")) options.pollMs = positiveInt(arg.slice("--poll-ms=".length), DEFAULT_POLL_MS);
    else if (arg === "--since") options.since = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--since=")) options.since = arg.slice("--since=".length);
    else if (arg === "--bindings") options.bindings = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--bindings=")) options.bindings = csv(arg.slice("--bindings=".length));
    else if (arg === "--keys") options.keys = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--keys=")) options.keys = csv(arg.slice("--keys=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.runtimePath = path.resolve(options.runtimePath);
  options.logPath = path.resolve(options.logPath);
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-feishu-long-connection.mjs [options]

Read-only Feishu long-connection soak for the native Channel Connectors daemon.
The script does not send IM messages. By default it watches the live runtime for
70 seconds, crossing the old 30s zero-inbound failure window, and fails on the
Studio-side rebuild patterns that previously made Feishu unstable.

Options:
  --duration-ms <n>                 Watch duration. Default: ${DEFAULT_DURATION_MS}.
  --poll-ms <n>                     Runtime poll interval. Default: ${DEFAULT_POLL_MS}.
  --bindings <ids>                  Comma-separated Feishu binding ids to include.
  --keys <keys>                     Comma-separated Feishu connection keys to include.
  --since <iso>                     Scan logs at or after this time. Default: script start.
  --runtime <path>                  Runtime path. Default: ${DEFAULT_RUNTIME_PATH}
  --log <path>                      Daemon log path. Default: ${DEFAULT_LOG_PATH}
  --require-always-connected        Fail if a selected connection is ever sampled non-connected.
  --allow-disconnected              Do not fail when the final runtime state is non-connected.
  --allow-ping-timeout              Allow SDK pingTimeout to be enabled or logged.
  --allow-zero-inbound-renewal      Allow zero-inbound proactive rebuilds.
  --allow-connected-idle-renewal    Allow connected-idle proactive rebuilds.
  --allow-watchdog-restart          Allow daemon watchdog restart log entries.
  --json                            Emit JSON only.
  -h, --help                        Show this help.

Examples:
  node scripts/smoke-channel-connectors-feishu-long-connection.mjs --json
  node scripts/smoke-channel-connectors-feishu-long-connection.mjs --duration-ms 300000 --bindings feishu-live --json
  node scripts/smoke-channel-connectors-feishu-long-connection.mjs --since 2026-06-08T10:00:00.000Z --duration-ms 0 --json
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

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function selectedConnections(runtime, options) {
  const entries = Object.values(runtime.feishuConnections || {});
  const bindingFilter = new Set(options.bindings);
  const keyFilter = new Set(options.keys);
  return entries.filter((connection) => {
    if (!connection || typeof connection !== "object") return false;
    if (keyFilter.size && !keyFilter.has(String(connection.key || ""))) return false;
    if (bindingFilter.size) {
      const bindingIds = Array.isArray(connection.bindingIds) ? connection.bindingIds.map(String) : [];
      if (!bindingIds.some((id) => bindingFilter.has(id))) return false;
    }
    return true;
  });
}

function connectionSnapshot(connection) {
  return {
    key: String(connection.key || ""),
    bindingIds: Array.isArray(connection.bindingIds) ? connection.bindingIds.map(String) : [],
    connected: connection.connected === true,
    state: String(connection.state || ""),
    pingTimeoutSeconds: Number(connection.pingTimeoutSeconds || 0),
    connectedIdleRenewAfterMs: Number(connection.connectedIdleRenewAfterMs || 0),
    zeroInboundRenewAfterMs: Number(connection.zeroInboundRenewAfterMs || 0),
    watchdogRestartAfterMs: Number(connection.watchdogRestartAfterMs || 0),
    lastConnectedAt: connection.lastConnectedAt || null,
    lastDisconnectedAt: connection.lastDisconnectedAt || null,
    lastUnhealthyAt: connection.lastUnhealthyAt || null,
    lastWatchdogRestartAt: connection.lastWatchdogRestartAt || null,
    lastWatchdogRestartReason: connection.lastWatchdogRestartReason || null,
    reconnects: Number(connection.reconnects || 0),
    receivedMessages: Number(connection.receivedMessages || 0),
  };
}

function runtimeViolations(connections, options, startedAtMs, samples) {
  const violations = [];
  if (!connections.length) {
    violations.push({
      type: "no_feishu_connection",
      message: "No Feishu long-connection runtime entries matched the selected filters.",
    });
    return violations;
  }

  for (const connection of connections) {
    const key = connection.key;
    if (!options.allowDisconnected && !connection.connected) {
      violations.push({
        type: "not_connected",
        key,
        message: `Feishu connection ${key} is ${connection.state || "not connected"}.`,
      });
    }
    if (!options.allowPingTimeout && connection.pingTimeoutSeconds > 0) {
      violations.push({
        type: "ping_timeout_enabled",
        key,
        message: `Feishu connection ${key} has SDK pingTimeoutSeconds=${connection.pingTimeoutSeconds}.`,
      });
    }
    if (!options.allowZeroInboundRenewal && connection.zeroInboundRenewAfterMs > 0) {
      violations.push({
        type: "zero_inbound_renewal_enabled",
        key,
        message: `Feishu connection ${key} has zeroInboundRenewAfterMs=${connection.zeroInboundRenewAfterMs}.`,
      });
    }
    if (!options.allowConnectedIdleRenewal && connection.connectedIdleRenewAfterMs > 0) {
      violations.push({
        type: "connected_idle_renewal_enabled",
        key,
        message: `Feishu connection ${key} has connectedIdleRenewAfterMs=${connection.connectedIdleRenewAfterMs}.`,
      });
    }
    if (connection.watchdogRestartAfterMs > 0 && connection.watchdogRestartAfterMs < MIN_SAFE_WATCHDOG_MS) {
      violations.push({
        type: "watchdog_too_fast",
        key,
        message: `Feishu connection ${key} has watchdogRestartAfterMs=${connection.watchdogRestartAfterMs}.`,
      });
    }
    const lastWatchdogMs = Date.parse(connection.lastWatchdogRestartAt || "");
    if (
      !options.allowWatchdogRestart
      && Number.isFinite(lastWatchdogMs)
      && lastWatchdogMs >= startedAtMs
    ) {
      violations.push({
        type: "watchdog_restart_runtime",
        key,
        message: `Feishu connection ${key} was watchdog-restarted during this smoke: ${connection.lastWatchdogRestartReason || "unknown"}.`,
      });
    }
  }

  if (options.requireAlwaysConnected) {
    for (const sample of samples) {
      for (const connection of sample.connections) {
        if (connection.connected) continue;
        violations.push({
          type: "sample_not_connected",
          key: connection.key,
          sampledAt: sample.checkedAt,
          message: `Feishu connection ${connection.key} sampled ${connection.state || "not connected"} during soak.`,
        });
      }
    }
  }

  return violations;
}

function parseSinceMs(options, startedAt) {
  if (!options.since) return startedAt.getTime();
  const parsed = Date.parse(options.since);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid --since timestamp: ${options.since}`);
  return parsed;
}

function readLogEvents(filePath, sinceMs, selectedKeys) {
  if (!fs.existsSync(filePath)) return [];
  const output = [];
  const keyFilter = new Set(selectedKeys.filter(Boolean));
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const timestamp = line.slice(0, 24);
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs) || timestampMs < sinceMs) continue;
    const key = extractLogKey(line);
    if (keyFilter.size && key && !keyFilter.has(key)) continue;
    const type = classifyLogLine(line);
    if (!type) continue;
    output.push({
      timestamp,
      type,
      key,
      line: sanitizeLogLine(line),
    });
  }
  return output;
}

function extractLogKey(line) {
  const match = line.match(/"key":"([^"]+)"/);
  return match ? match[1] : null;
}

function classifyLogLine(line) {
  if (/no pong\/inbound within/i.test(line)) return "sdk_ping_timeout";
  if (/watchdog_zero_inbound_|zero-inbound startup renewal/i.test(line)) return "watchdog_zero_inbound";
  if (/watchdog_connected_idle_|connected-idle renewal/i.test(line)) return "watchdog_connected_idle";
  if (/Feishu WebSocket watchdog restarting client/i.test(line)) return "watchdog_restart";
  if (/Feishu WebSocket reconnecting/i.test(line) || /\["\[ws\]","reconnect"\]/.test(line)) return "sdk_reconnecting";
  if (/Feishu WebSocket reconnected/i.test(line)) return "sdk_reconnected";
  if (/Feishu WebSocket connected/i.test(line)) return "connected";
  return null;
}

function sanitizeLogLine(line) {
  return line
    .replace(/("appSecret"\s*:\s*")[^"]+(")/g, "$1***$2")
    .replace(/(AppSecret[=:])[^,"}\s]+/g, "$1***")
    .slice(0, 500);
}

function logViolations(events, options) {
  const violations = [];
  for (const event of events) {
    if (event.type === "sdk_ping_timeout" && !options.allowPingTimeout) {
      violations.push({
        type: event.type,
        key: event.key,
        timestamp: event.timestamp,
        message: "Feishu SDK pingTimeout terminated the socket during the checked window.",
        line: event.line,
      });
    }
    if (event.type === "watchdog_zero_inbound" && !options.allowZeroInboundRenewal) {
      violations.push({
        type: event.type,
        key: event.key,
        timestamp: event.timestamp,
        message: "Studio zero-inbound watchdog rebuilt the Feishu socket during the checked window.",
        line: event.line,
      });
    }
    if (event.type === "watchdog_connected_idle" && !options.allowConnectedIdleRenewal) {
      violations.push({
        type: event.type,
        key: event.key,
        timestamp: event.timestamp,
        message: "Studio connected-idle watchdog rebuilt the Feishu socket during the checked window.",
        line: event.line,
      });
    }
    if (event.type === "watchdog_restart" && !options.allowWatchdogRestart) {
      violations.push({
        type: event.type,
        key: event.key,
        timestamp: event.timestamp,
        message: "Studio daemon watchdog restarted the Feishu socket during the checked window.",
        line: event.line,
      });
    }
  }
  return violations;
}

function countByType(items) {
  const output = {};
  for (const item of items) {
    output[item.type] = (output[item.type] || 0) + 1;
  }
  return output;
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectSamples(options, startedAt) {
  const samples = [];
  const deadline = startedAt.getTime() + options.durationMs;
  while (true) {
    const checkedAt = new Date();
    const runtime = readJson(options.runtimePath);
    samples.push({
      checkedAt: checkedAt.toISOString(),
      connections: selectedConnections(runtime, options).map(connectionSnapshot),
    });
    if (Date.now() >= deadline) break;
    await sleep(Math.min(options.pollMs, Math.max(0, deadline - Date.now())));
  }
  return samples;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const sinceMs = parseSinceMs(options, startedAt);
  const samples = await collectSamples(options, startedAt);
  const finalRuntime = readJson(options.runtimePath);
  const connections = selectedConnections(finalRuntime, options).map(connectionSnapshot);
  const selectedKeys = connections.map((connection) => connection.key);
  const events = readLogEvents(options.logPath, sinceMs, selectedKeys);
  const violations = [
    ...runtimeViolations(connections, options, startedAt.getTime(), samples),
    ...logViolations(events, options),
  ];
  const result = {
    ok: violations.length === 0,
    startedAt: startedAt.toISOString(),
    checkedAt: new Date().toISOString(),
    since: new Date(sinceMs).toISOString(),
    durationMs: options.durationMs,
    runtimePath: options.runtimePath,
    logPath: options.logPath,
    summary: {
      connections: connections.length,
      samples: samples.length,
      logEvents: events.length,
      logEventsByType: countByType(events),
      violations: violations.length,
      violationsByType: countByType(violations),
    },
    connections,
    violations,
    logEvents: events,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
  }
  if (!result.ok) process.exitCode = 1;
}

function printResult(result) {
  console.log(result.ok ? "Feishu long-connection smoke ok" : "Feishu long-connection smoke failed");
  console.log(`runtime: ${result.runtimePath}`);
  console.log(`log: ${result.logPath}`);
  console.log(`durationMs: ${result.durationMs}`);
  for (const connection of result.connections) {
    console.log([
      `- ${connection.key}`,
      `connected=${connection.connected}`,
      `state=${connection.state}`,
      `pingTimeout=${connection.pingTimeoutSeconds}s`,
      `zeroInbound=${connection.zeroInboundRenewAfterMs}ms`,
      `connectedIdle=${connection.connectedIdleRenewAfterMs}ms`,
      `watchdog=${connection.watchdogRestartAfterMs}ms`,
    ].join(" "));
  }
  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) {
      console.log(`- ${violation.type}: ${violation.message}`);
    }
  }
  if (result.summary.logEvents) {
    console.log(`logEvents: ${JSON.stringify(result.summary.logEventsByType)}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
