#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_RUNTIME_PATH = path.join(os.homedir(), ".config/tracevane/channel-connectors/daemon/runtime.json");
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 1_000;

function parseArgs(argv) {
  const options = {
    runtimePath: DEFAULT_RUNTIME_PATH,
    host: "",
    port: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    bindings: [],
    apply: false,
    json: false,
    waitActive: false,
    waitIdle: false,
    requireActive: false,
    reapIdle: false,
    killPoolKey: "",
    killFirstIdle: false,
    reason: "tracevane-live-smoke",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--wait-active") options.waitActive = true;
    else if (arg === "--wait-idle") {
      options.waitActive = true;
      options.waitIdle = true;
    } else if (arg === "--require-active") options.requireActive = true;
    else if (arg === "--reap-idle") options.reapIdle = true;
    else if (arg === "--kill-first-idle") options.killFirstIdle = true;
    else if (arg === "--kill-pool-key") options.killPoolKey = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--kill-pool-key=")) options.killPoolKey = arg.slice("--kill-pool-key=".length);
    else if (arg === "--reason") options.reason = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--reason=")) options.reason = arg.slice("--reason=".length);
    else if (arg === "--runtime") options.runtimePath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--runtime=")) options.runtimePath = arg.slice("--runtime=".length);
    else if (arg === "--host") options.host = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--host=")) options.host = arg.slice("--host=".length);
    else if (arg === "--port") options.port = positiveInt(requireValue(argv, ++index, arg), 0);
    else if (arg.startsWith("--port=")) options.port = positiveInt(arg.slice("--port=".length), 0);
    else if (arg === "--bindings") options.bindings = parseCsv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--bindings=")) options.bindings = parseCsv(arg.slice("--bindings=".length));
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--poll-ms") options.pollMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_POLL_MS);
    else if (arg.startsWith("--poll-ms=")) options.pollMs = positiveInt(arg.slice("--poll-ms=".length), DEFAULT_POLL_MS);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.runtimePath = path.resolve(options.runtimePath);
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-agent-sessions.mjs [options]

Probes the live Channel Connectors persistent Agent session management endpoint.
Default mode is read-only. Pass --apply for reap/kill side effects.

Options:
  --bindings <ids>          Comma-separated binding ids to filter active sessions.
  --wait-active             Wait until at least one active persistent session exists.
  --wait-idle               Wait until an active persistent session is idle.
  --require-active          Fail if no active session exists after status read.
  --reap-idle               Reap daemon idle sessions. Requires --apply to execute.
  --kill-pool-key <key>     Stop one persistent session by pool key. Requires --apply to execute.
  --kill-first-idle         Stop the first idle active session matching --bindings. Requires --apply.
  --reason <text>           Kill reason. Default: tracevane-live-smoke.
  --runtime <path>          Runtime path. Default: ${DEFAULT_RUNTIME_PATH}
  --host <host>             Management host override.
  --port <port>             Management port override.
  --timeout-ms <n>          Poll deadline. Default: ${DEFAULT_TIMEOUT_MS}
  --poll-ms <n>             Poll interval. Default: ${DEFAULT_POLL_MS}
  --json                    Emit JSON only.
  -h, --help                Show this help

Examples:
  node scripts/smoke-channel-connectors-agent-sessions.mjs --json
  node scripts/smoke-channel-connectors-agent-sessions.mjs --wait-idle --bindings octo-tracevane-cc --json
  node scripts/smoke-channel-connectors-agent-sessions.mjs --kill-first-idle --bindings octo-tracevane-cc --apply --json
`);
}

function readManagementEndpoint(options) {
  if (options.host && options.port > 0) return { host: options.host, port: options.port };
  if (!fs.existsSync(options.runtimePath)) {
    return {
      host: options.host || "127.0.0.1",
      port: options.port || 18797,
    };
  }
  const runtime = JSON.parse(fs.readFileSync(options.runtimePath, "utf8"));
  return {
    host: options.host || runtime.management?.host || "127.0.0.1",
    port: options.port || Number(runtime.management?.port || 18797),
  };
}

function requestJson(endpoint, requestPath, input = {}) {
  const method = input.method || "GET";
  const body = input.body ? JSON.stringify(input.body) : "";
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: endpoint.host,
      port: endpoint.port,
      path: requestPath,
      method,
      timeout: input.timeoutMs || 10_000,
      headers: body ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      } : {},
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout: ${method} ${requestPath}`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function readAgentSessions(options) {
  const endpoint = readManagementEndpoint(options);
  return requestJson(endpoint, "/agent-sessions", { timeoutMs: Math.min(options.timeoutMs, 10_000) });
}

async function postAgentSessions(options, body) {
  const endpoint = readManagementEndpoint(options);
  return requestJson(endpoint, "/agent-sessions", {
    method: "POST",
    body,
    timeoutMs: Math.min(options.timeoutMs, 10_000),
  });
}

async function pollAgentSessions(options, predicate) {
  const deadline = Date.now() + options.timeoutMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const status = await readAgentSessions(options);
      if (!predicate || predicate(status)) return status;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
  throw new Error(lastError?.message || "Timed out waiting for Channel daemon agent sessions");
}

function bindingMatches(session, bindings) {
  return bindings.length === 0 || bindings.includes(session.bindingId);
}

function activeSessions(status, bindings = []) {
  return (status.activeSessions || []).filter((session) => bindingMatches(session, bindings));
}

function idleSessions(status, bindings = []) {
  return activeSessions(status, bindings).filter((session) => Number(session.running || 0) === 0);
}

function summarizeStatus(status, bindings = []) {
  const filteredActive = activeSessions(status, bindings);
  return {
    ok: status.ok === true,
    checkedAt: status.checkedAt || null,
    implementation: status.implementation || null,
    policy: status.policy || null,
    requestedPersistentBindings: (status.requestedPersistentBindings || [])
      .filter((binding) => bindings.length === 0 || bindings.includes(binding.bindingId))
      .map((binding) => ({
        bindingId: binding.bindingId,
        platform: binding.platform,
        agent: binding.agent,
        model: binding.model,
        requestedMode: binding.requestedMode,
        effectiveMode: binding.effectiveMode,
        reason: binding.reason,
      })),
    activeSessions: filteredActive.map((session) => ({
      poolKey: session.poolKey,
      sessionId: session.sessionId,
      bindingId: session.bindingId,
      projectId: session.projectId,
      sessionKey: session.sessionKey,
      agent: session.agent,
      model: session.model,
      permissionMode: session.permissionMode || null,
      running: session.running,
      turnCount: session.turnCount,
      idleMs: session.idleMs,
      lastError: session.lastError || null,
    })),
    reaped: typeof status.reaped === "number" ? status.reaped : null,
    killed: status.killed || null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let status = await pollAgentSessions(options, (candidate) => {
    if (options.waitIdle) return idleSessions(candidate, options.bindings).length > 0;
    if (options.waitActive) return activeSessions(candidate, options.bindings).length > 0;
    return true;
  });

  const initial = summarizeStatus(status, options.bindings);
  if (options.requireActive && initial.activeSessions.length === 0) {
    throw new Error(`No active persistent sessions${options.bindings.length ? ` for bindings: ${options.bindings.join(", ")}` : ""}`);
  }

  const actions = [];

  if (options.reapIdle) {
    if (options.apply) {
      const reaped = await postAgentSessions(options, { action: "reap-idle" });
      status = reaped;
      actions.push({ action: "reap-idle", applied: true, result: summarizeStatus(reaped, options.bindings) });
    } else {
      actions.push({ action: "reap-idle", applied: false, note: "dry-run; pass --apply to execute" });
    }
  }

  if (options.killPoolKey || options.killFirstIdle) {
    let poolKey = options.killPoolKey;
    if (!poolKey && options.killFirstIdle) {
      const idle = idleSessions(status, options.bindings)[0];
      if (!idle) {
        throw new Error(`No idle active persistent session found${options.bindings.length ? ` for bindings: ${options.bindings.join(", ")}` : ""}`);
      }
      poolKey = idle.poolKey;
    }
    if (options.apply) {
      const killed = await postAgentSessions(options, {
        action: "kill",
        poolKey,
        reason: options.reason,
      });
      status = killed;
      actions.push({ action: "kill", applied: true, poolKey, result: summarizeStatus(killed, options.bindings) });
    } else {
      actions.push({ action: "kill", applied: false, poolKey, note: "dry-run; pass --apply to execute" });
    }
  }

  const output = {
    ok: true,
    endpoint: readManagementEndpoint(options),
    status: initial,
    actions,
    finalStatus: summarizeStatus(status, options.bindings),
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
