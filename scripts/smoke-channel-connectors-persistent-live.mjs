#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config/tracevane/channel-connectors/config.json");
const DEFAULT_DAEMON_CONFIG_PATH = path.join(os.homedir(), ".config/tracevane/channel-connectors/daemon/config.json");
const DEFAULT_RUNTIME_PATH = path.join(os.homedir(), ".config/tracevane/channel-connectors/daemon/runtime.json");
const DEFAULT_SERVICE_NAME = "tracevane-channel-connectors.service";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 1_000;

function parseArgs(argv) {
  const options = {
    apply: false,
    restart: false,
    configPath: DEFAULT_CONFIG_PATH,
    daemonConfigPath: DEFAULT_DAEMON_CONFIG_PATH,
    runtimePath: DEFAULT_RUNTIME_PATH,
    backupDir: "",
    bindings: [],
    mode: "persistent",
    serviceName: DEFAULT_SERVICE_NAME,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    waitActive: false,
    waitIdleAfterActive: false,
    restoreLatest: false,
    restorePath: "",
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--restart") options.restart = true;
    else if (arg === "--no-restart") options.restart = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--wait-active") options.waitActive = true;
    else if (arg === "--wait-idle-after-active") {
      options.waitActive = true;
      options.waitIdleAfterActive = true;
    } else if (arg === "--restore-latest") options.restoreLatest = true;
    else if (arg === "--restore") options.restorePath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--restore=")) options.restorePath = arg.slice("--restore=".length);
    else if (arg === "--config") options.configPath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--config=")) options.configPath = arg.slice("--config=".length);
    else if (arg === "--daemon-config") options.daemonConfigPath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--daemon-config=")) options.daemonConfigPath = arg.slice("--daemon-config=".length);
    else if (arg === "--runtime") options.runtimePath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--runtime=")) options.runtimePath = arg.slice("--runtime=".length);
    else if (arg === "--backup-dir") options.backupDir = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--backup-dir=")) options.backupDir = arg.slice("--backup-dir=".length);
    else if (arg === "--bindings") options.bindings = parseCsv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--bindings=")) options.bindings = parseCsv(arg.slice("--bindings=".length));
    else if (arg === "--mode") options.mode = normalizeMode(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--mode=")) options.mode = normalizeMode(arg.slice("--mode=".length));
    else if (arg === "--service") options.serviceName = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--service=")) options.serviceName = arg.slice("--service=".length);
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

  options.configPath = path.resolve(options.configPath);
  options.daemonConfigPath = path.resolve(options.daemonConfigPath);
  options.runtimePath = path.resolve(options.runtimePath);
  options.backupDir = path.resolve(options.backupDir || path.join(path.dirname(options.configPath), "backups"));
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["persistent", "persist", "on", "true", "1"].includes(normalized)) return "persistent";
  if (["one-shot", "oneshot", "off", "false", "0"].includes(normalized)) return "one-shot";
  throw new Error(`Unsupported mode: ${value}`);
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-persistent-live.mjs [options]

Safely prepares real Channel Connector bindings for Codex persistent-session live smoke.
The script backs up config before writes and prints only redacted runtime summaries.

Options:
  --bindings <ids>          Comma-separated binding ids. Default: all enabled Codex bindings.
  --mode <persistent|one-shot>
                            Metadata mode to write. Default: persistent.
  --apply                   Write config. Without this flag, only dry-runs the plan.
  --dry-run                 Force no writes.
  --restart / --no-restart  Request restart. Cross-platform helper reports an explicit SKIP; default: no restart.
  --wait-active             After readiness, wait for a real IM message to create an active session.
  --wait-idle-after-active  Wait for active session to become idle/cleaned after it appears.
  --restore-latest          Restore latest backup from backup dir.
  --restore <path>          Restore a specific backup.
  --config <path>           Native config path. Default: ${DEFAULT_CONFIG_PATH}
  --daemon-config <path>    Daemon config path. Default: ${DEFAULT_DAEMON_CONFIG_PATH}
  --runtime <path>          Daemon runtime path. Default: ${DEFAULT_RUNTIME_PATH}
  --backup-dir <path>       Backup directory. Default: <config-dir>/backups
  --timeout-ms <n>          Poll deadline. Default: ${DEFAULT_TIMEOUT_MS}
  --poll-ms <n>             Poll interval. Default: ${DEFAULT_POLL_MS}
  --json                    Emit JSON only.
  -h, --help                Show this help

Typical live flow:
  node scripts/smoke-channel-connectors-persistent-live.mjs --bindings octo-tracevane-cc,feishu-live --apply
  # Send a long task from Octo/Feishu, then send /stop in the same chat.
  node scripts/smoke-channel-connectors-persistent-live.mjs --wait-active --wait-idle-after-active --json
  node scripts/smoke-channel-connectors-persistent-live.mjs --restore-latest --apply
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createBackup(configPath, daemonConfigPath, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `channel-connectors-${timestampForFile()}.json`);
  fs.copyFileSync(configPath, backupPath);
  const daemonBackupPath = backupPath.replace(/\.json$/, ".daemon.json");
  if (fs.existsSync(daemonConfigPath)) fs.copyFileSync(daemonConfigPath, daemonBackupPath);
  return { backupPath, daemonBackupPath: fs.existsSync(daemonBackupPath) ? daemonBackupPath : null };
}

function latestBackup(backupDir) {
  if (!fs.existsSync(backupDir)) return "";
  return fs.readdirSync(backupDir)
    .filter((name) => name.startsWith("channel-connectors-") && name.endsWith(".json"))
    .map((name) => path.join(backupDir, name))
    .sort()
    .at(-1) || "";
}

function redactConfigSummary(config) {
  const profileById = new Map((config.agentProfiles || []).map((profile) => [profile.id, profile]));
  return (config.platformBindings || []).map((binding) => {
    const profile = profileById.get(binding.agentProfileId);
    return {
      id: binding.id,
      platform: binding.platform,
      enabled: binding.enabled !== false,
      agent: profile?.agent || null,
      model: profile?.model || null,
      requestedMode: binding.metadata?.agentSessionDriver
        || binding.metadata?.persistentAgentSession
        || binding.metadata?.persistentSession
        || null,
    };
  });
}

function selectBindings(config, requestedIds) {
  const profileById = new Map((config.agentProfiles || []).map((profile) => [profile.id, profile]));
  const requested = new Set(requestedIds);
  return (config.platformBindings || []).filter((binding) => {
    if (requested.size > 0) return requested.has(binding.id);
    const profile = profileById.get(binding.agentProfileId);
    return binding.enabled !== false && profile?.agent === "codex";
  });
}

function applyMode(config, bindingIds, mode) {
  const selected = new Set(bindingIds);
  let changed = 0;
  for (const binding of config.platformBindings || []) {
    if (!selected.has(binding.id)) continue;
    binding.metadata = binding.metadata && typeof binding.metadata === "object" ? binding.metadata : {};
    if (mode === "persistent") {
      if (binding.metadata.agentSessionDriver !== "persistent") {
        binding.metadata.agentSessionDriver = "persistent";
        changed += 1;
      }
    } else if (Object.hasOwn(binding.metadata, "agentSessionDriver")) {
      delete binding.metadata.agentSessionDriver;
      changed += 1;
    }
  }
  config.updatedAt = new Date().toISOString();
  return changed;
}

function applyDaemonConfigMode(daemonConfigPath, bindingIds, mode) {
  if (!fs.existsSync(daemonConfigPath)) return { daemonConfigPath, written: false, changed: 0 };
  const daemonConfig = readJson(daemonConfigPath);
  const selected = new Set(bindingIds);
  let changed = 0;
  for (const project of daemonConfig.projects || []) {
    for (const binding of project.platformBindings || []) {
      if (!selected.has(binding.id)) continue;
      binding.metadata = binding.metadata && typeof binding.metadata === "object" ? binding.metadata : {};
      if (mode === "persistent") {
        if (binding.metadata.agentSessionDriver !== "persistent") {
          binding.metadata.agentSessionDriver = "persistent";
          changed += 1;
        }
      } else if (Object.hasOwn(binding.metadata, "agentSessionDriver")) {
        delete binding.metadata.agentSessionDriver;
        changed += 1;
      }
    }
  }
  if (changed > 0) writeJsonAtomic(daemonConfigPath, daemonConfig);
  return { daemonConfigPath, written: changed > 0, changed };
}

function restoreConfig(options) {
  const restorePath = options.restorePath || latestBackup(options.backupDir);
  if (!restorePath) throw new Error(`No backup found in ${options.backupDir}`);
  if (!fs.existsSync(restorePath)) throw new Error(`Backup does not exist: ${restorePath}`);
  if (!options.apply) {
    return {
      action: "restore",
      applied: false,
      restorePath,
      daemonRestorePath: restorePath.replace(/\.json$/, ".daemon.json"),
      note: "dry-run; pass --apply to restore",
    };
  }
  fs.copyFileSync(restorePath, options.configPath);
  const daemonRestorePath = restorePath.replace(/\.json$/, ".daemon.json");
  if (fs.existsSync(daemonRestorePath)) fs.copyFileSync(daemonRestorePath, options.daemonConfigPath);
  return {
    action: "restore",
    applied: true,
    restorePath,
    daemonRestorePath: fs.existsSync(daemonRestorePath) ? daemonRestorePath : null,
  };
}

function restartService(serviceName) {
  return {
    requested: true,
    attempted: false,
    status: "skipped",
    serviceName,
    reason: "Cross-platform restart must use the authenticated Channel lifecycle API.",
  };
}

function readManagementEndpoint(runtimePath) {
  if (!fs.existsSync(runtimePath)) return { host: "127.0.0.1", port: 18797 };
  const runtime = readJson(runtimePath);
  return {
    host: runtime.management?.host || "127.0.0.1",
    port: Number(runtime.management?.port || 18797),
  };
}

function getJson(url, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout: ${url}`));
    });
    req.on("error", reject);
  });
}

async function pollStatus(options, predicate) {
  const deadline = Date.now() + options.timeoutMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const endpoint = readManagementEndpoint(options.runtimePath);
      const status = await getJson(`http://${endpoint.host}:${endpoint.port}/status`);
      if (!predicate || predicate(status)) return status;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
  throw new Error(lastError?.message || "Timed out waiting for Channel daemon status");
}

function summarizeStatus(status) {
  const driver = status.agentSessionDriver || {};
  return {
    ok: status.ok === true,
    pid: status.pid || null,
    platformBindings: status.platformBindings ?? null,
    octo: (status.octoConnections || []).map((item) => ({
      bindingId: item.bindingId,
      connected: item.connected === true,
      state: item.state || null,
      reconnects: item.reconnects ?? null,
      receivedMessages: item.receivedMessages ?? null,
    })),
    feishu: (status.feishuConnections || []).map((item) => ({
      accountId: item.accountId || null,
      bindingIds: item.bindingIds || [],
      connected: item.connected === true,
      state: item.state || null,
      reconnects: item.reconnects ?? null,
      receivedMessages: item.receivedMessages ?? null,
      lastWatchdogRestartReason: item.lastWatchdogRestartReason || null,
    })),
    requestedPersistentBindings: (driver.requestedPersistentBindings || []).map((item) => ({
      bindingId: item.bindingId,
      platform: item.platform,
      agent: item.agent,
      model: item.model,
      requestedMode: item.requestedMode,
      effectiveMode: item.effectiveMode,
      reason: item.reason,
    })),
    activeSessions: (driver.activeSessions || []).map((item) => ({
      bindingId: item.bindingId,
      platform: item.platform,
      agent: item.agent,
      model: item.model,
      sessionId: item.sessionId,
      turnCount: item.turnCount,
      idleMs: item.idleMs,
    })),
    activeRuns: (status.activeRuns || []).map((item) => ({
      bindingId: item.bindingId,
      platform: item.platform,
      agent: item.agent,
      model: item.model,
      messageId: item.messageId,
      startedAt: item.startedAt,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let result;
  if (options.restoreLatest || options.restorePath) {
    result = restoreConfig(options);
    result.restart = result.applied && options.restart
      ? restartService(options.serviceName)
      : { requested: options.restart, attempted: false, status: "not-requested" };
  } else {
    if (!fs.existsSync(options.configPath)) throw new Error(`Config not found: ${options.configPath}`);
    const config = readJson(options.configPath);
    const selectedBindings = selectBindings(config, options.bindings);
    if (selectedBindings.length === 0) {
      throw new Error(options.bindings.length > 0
        ? `No matching bindings: ${options.bindings.join(", ")}`
        : "No enabled Codex bindings found.");
    }
    const selectedIds = selectedBindings.map((binding) => binding.id);
    const nextConfig = JSON.parse(JSON.stringify(config));
    const changed = applyMode(nextConfig, selectedIds, options.mode);
    result = {
      action: "set-mode",
      mode: options.mode,
      applied: false,
      changed,
      daemonConfig: {
        daemonConfigPath: options.daemonConfigPath,
        written: false,
        changed: 0,
      },
      selectedBindings: selectedIds,
      before: redactConfigSummary(config),
      after: redactConfigSummary(nextConfig),
      backupPath: null,
      daemonBackupPath: null,
    };
    if (options.apply) {
      const backup = createBackup(options.configPath, options.daemonConfigPath, options.backupDir);
      result.backupPath = backup.backupPath;
      result.daemonBackupPath = backup.daemonBackupPath;
      writeJsonAtomic(options.configPath, nextConfig);
      result.daemonConfig = applyDaemonConfigMode(options.daemonConfigPath, selectedIds, options.mode);
      result.applied = true;
    }
    result.restart = result.applied && options.restart
      ? restartService(options.serviceName)
      : { requested: options.restart, attempted: false, status: "not-requested" };
  }

  const shouldPollReadiness = result.restart?.attempted === true;
  const shouldMonitorRuntime =
    options.waitActive &&
    result.applied !== true &&
    result.restart?.status !== "skipped";
  const shouldPollRuntime = shouldPollReadiness || shouldMonitorRuntime;
  const selected = new Set(result.selectedBindings || []);
  const expectPersistent = selected.size > 0 && result.mode === "persistent" && result.applied;
  const status = shouldPollRuntime ? await pollStatus(options, (candidate) => {
    if (!expectPersistent) return true;
    const effective = candidate.agentSessionDriver?.requestedPersistentBindings || [];
    return [...selected].every((id) => effective.some((item) => item.bindingId === id && item.effectiveMode === "persistent"));
  }) : null;
  const readySummary = status ? summarizeStatus(status) : null;
  if (readySummary && selected.size > 0 && result.mode === "persistent" && result.applied) {
    const effective = readySummary.requestedPersistentBindings.filter((item) => selected.has(item.bindingId));
    const missing = [...selected].filter((id) => !effective.some((item) => item.bindingId === id && item.effectiveMode === "persistent"));
    if (missing.length > 0) throw new Error(`Persistent mode not effective for bindings: ${missing.join(", ")}`);
  }

  let activeSummary = null;
  let idleSummary = null;
  if (options.waitActive && shouldPollRuntime) {
    const active = await pollStatus(options, (candidate) => (candidate.agentSessionDriver?.activeSessions || []).length > 0);
    activeSummary = summarizeStatus(active);
    if (options.waitIdleAfterActive) {
      const idle = await pollStatus(options, (candidate) => {
        const sessions = candidate.agentSessionDriver?.activeSessions || [];
        const runs = candidate.activeRuns || [];
        return sessions.length > 0 && runs.length === 0;
      });
      idleSummary = summarizeStatus(idle);
    }
  }

  const output = {
    ok: result.restart?.status !== "skipped",
    result,
    status: readySummary,
    active: activeSummary,
    idleAfterActive: idleSummary,
  };
  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
