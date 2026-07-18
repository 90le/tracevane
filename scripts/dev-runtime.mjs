import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = dirname(dirname(SCRIPT_PATH));
const METADATA_VERSION = 1;
const RUN_TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const TARGETS = new Set(["backend", "frontend"]);
const MODES = new Set(["restart", "fresh"]);
const DEFAULT_READINESS_TIMEOUT_MS = 60_000;
const DEFAULT_LOG_TAIL_BYTES = 8_192;
const USAGE = [
  "Usage:",
  "  node scripts/dev-runtime.mjs restart",
  "  node scripts/dev-runtime.mjs fresh",
  "  node scripts/dev-runtime.mjs stop",
  "  node scripts/dev-runtime.mjs supervise <backend|frontend> <restart|fresh> <logPath> <runToken>",
].join("\n");

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

export class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliUsageError";
    this.exitCode = 2;
  }
}

function resolvedRoot(rootDir) {
  try {
    return realpathSync.native(resolve(rootDir));
  } catch {
    return resolve(rootDir);
  }
}

export function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH));
}

export function runtimePaths(rootDir, mode) {
  if (!MODES.has(mode)) throw new Error("Unsupported runtime mode: " + mode);
  const runtimeDir = join(resolvedRoot(rootDir), ".tmp", mode === "fresh" ? "dev-fresh" : "dev-runtime");
  const pidDir = join(runtimeDir, "pids");
  const logDir = join(runtimeDir, "logs");
  return {
    runtimeDir,
    pidDir,
    logDir,
    backendPid: join(pidDir, "backend.pid"),
    frontendPid: join(pidDir, "frontend.pid"),
    backendLog: join(logDir, "backend.log"),
    frontendLog: join(logDir, "frontend.log"),
    envFile: join(runtimeDir, mode === "fresh" ? "runtime.env" : "ports.env"),
  };
}

export function knownWorkspaceRoots(rootDir) {
  const currentRoot = resolvedRoot(rootDir);
  const parent = dirname(currentRoot);
  const mainRoot = basename(parent) === ".worktrees"
    ? resolvedRoot(dirname(parent))
    : currentRoot;
  const roots = [mainRoot];
  if (currentRoot !== mainRoot) roots.push(currentRoot);
  const worktreesDir = join(mainRoot, ".worktrees");
  let entries = [];
  try {
    entries = readdirSync(worktreesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolvedRoot(join(worktreesDir, entry.name)))
      .sort();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const candidate of entries) {
    if (!roots.includes(candidate)) roots.push(candidate);
  }
  return roots;
}

export async function stopKnownWorkspaceRuntimes(rootDir, dependencies = {}) {
  const stopManagedProcessImpl = dependencies.stopManagedProcessImpl ?? stopManagedProcess;
  const results = [];
  for (const candidateRoot of knownWorkspaceRoots(rootDir)) {
    for (const mode of ["restart", "fresh"]) {
      const paths = runtimePaths(candidateRoot, mode);
      for (const target of ["frontend", "backend"]) {
        results.push(await stopManagedProcessImpl({
          pidFile: target === "backend" ? paths.backendPid : paths.frontendPid,
          target,
          mode,
          resolvedRoot: candidateRoot,
        }));
      }
    }
  }
  return results;
}

function ensureRuntime(paths) {
  mkdirSync(paths.pidDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
}

function atomicWriteFile(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + "." + randomBytes(6).toString("hex") + ".tmp";
  try {
    writeFileSync(temporary, contents, "utf8");
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function isProcessRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function validMetadata(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version !== METADATA_VERSION) return false;
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0) return false;
  if (!TARGETS.has(value.target) || value.target !== expected.target) return false;
  if (!MODES.has(value.mode) || value.mode !== expected.mode) return false;
  if (typeof value.resolvedRoot !== "string" || value.resolvedRoot !== resolvedRoot(expected.resolvedRoot)) return false;
  if (typeof value.runToken !== "string" || !RUN_TOKEN_PATTERN.test(value.runToken)) return false;
  if (typeof value.startedAt !== "string" || Number.isNaN(Date.parse(value.startedAt))) return false;
  return true;
}

function readMetadata(pidFile) {
  try {
    return { exists: true, value: JSON.parse(readFileSync(pidFile, "utf8")) };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, value: null };
    return { exists: true, value: null };
  }
}

async function waitUntilAbsent(
  isAlive,
  timeoutMs,
  { waitImpl = wait, nowImpl = Date.now } = {},
) {
  const deadlineAt = nowImpl() + timeoutMs;
  while (isAlive()) {
    const remaining = deadlineAt - nowImpl();
    if (remaining <= 0) return false;
    await waitImpl(Math.min(50, remaining));
  }
  return true;
}

async function waitUntilStopped(
  pid,
  timeoutMs,
  { isProcessRunningImpl = isProcessRunning, waitImpl = wait, nowImpl = Date.now } = {},
) {
  return waitUntilAbsent(
    () => isProcessRunningImpl(pid),
    timeoutMs,
    { waitImpl, nowImpl },
  );
}

function boundedProcessDiagnostic(result) {
  const message = [
    result?.error?.message,
    typeof result?.stderr === "string" ? result.stderr.trim() : "",
    typeof result?.stdout === "string" ? result.stdout.trim() : "",
  ].filter(Boolean).join(": ");
  return message.slice(0, 1_024);
}

function posixGroupIsRunning(pid, killImpl) {
  try {
    killImpl(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function sendPosixSignal(targetPid, signal, killImpl) {
  try {
    killImpl(targetPid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

export async function terminateOwnedTree(pid, options = {}) {
  const {
    platform = process.platform,
    spawnSyncImpl = spawnSync,
    killImpl = process.kill.bind(process),
    isProcessRunningImpl = isProcessRunning,
    waitImpl = wait,
    nowImpl = Date.now,
    stopWaitMs = 5_000,
    forceWaitMs = 2_000,
  } = options;

  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Cannot stop an invalid owned PID");

  if (platform === "win32") {
    if (!isProcessRunningImpl(pid)) return;
    const result = spawnSyncImpl(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      { encoding: "utf8", windowsHide: true },
    );
    if (!result || result.error || result.status !== 0) {
      const diagnostic = boundedProcessDiagnostic(result);
      throw new Error(
        "taskkill invocation failed for owned process tree " + pid +
        "; cleanup is unconfirmed" +
        (diagnostic ? ": " + diagnostic : ""),
      );
    }
    const stopped = await waitUntilStopped(pid, stopWaitMs, {
      isProcessRunningImpl,
      waitImpl,
      nowImpl,
    });
    if (!stopped) {
      const diagnostic = boundedProcessDiagnostic(result);
      throw new Error(
        "taskkill could not stop owned process tree " + pid +
        (diagnostic ? ": " + diagnostic : ""),
      );
    }
    return;
  }

  if (posixGroupIsRunning(pid, killImpl)) {
    if (!sendPosixSignal(-pid, "SIGTERM", killImpl)) return;
    if (await waitUntilAbsent(
      () => posixGroupIsRunning(pid, killImpl),
      stopWaitMs,
      { waitImpl, nowImpl },
    )) return;

    if (!sendPosixSignal(-pid, "SIGKILL", killImpl)) return;
    if (await waitUntilAbsent(
      () => posixGroupIsRunning(pid, killImpl),
      forceWaitMs,
      { waitImpl, nowImpl },
    )) return;
    throw new Error("Owned process group " + pid + " did not exit after SIGKILL");
  }

  if (!isProcessRunningImpl(pid)) return;
  if (!sendPosixSignal(pid, "SIGTERM", killImpl)) return;
  if (await waitUntilStopped(pid, stopWaitMs, {
    isProcessRunningImpl,
    waitImpl,
    nowImpl,
  })) return;
  if (!sendPosixSignal(pid, "SIGKILL", killImpl)) return;
  if (await waitUntilStopped(pid, forceWaitMs, {
    isProcessRunningImpl,
    waitImpl,
    nowImpl,
  })) return;
  throw new Error("Owned process " + pid + " did not exit after SIGKILL");
}

export async function stopManagedProcess(expected, dependencies = {}) {
  const {
    platform = process.platform,
    killImpl = process.kill.bind(process),
    isProcessRunningImpl = isProcessRunning,
    isPosixProcessGroupRunningImpl = (pid) => posixGroupIsRunning(pid, killImpl),
    terminateOwnedTreeImpl = terminateOwnedTree,
    logger = console,
  } = dependencies;
  const parsed = readMetadata(expected.pidFile);
  if (!parsed.exists) return { status: "missing" };
  if (!validMetadata(parsed.value, expected)) {
    rmSync(expected.pidFile, { force: true });
    return { status: "stale" };
  }

  const metadata = parsed.value;
  const pidRunning = isProcessRunningImpl(metadata.pid);
  const groupRunning = platform !== "win32" &&
    !pidRunning &&
    isPosixProcessGroupRunningImpl(metadata.pid);
  if (!pidRunning && !groupRunning) {
    rmSync(expected.pidFile, { force: true });
    return { status: "stale", pid: metadata.pid };
  }

  logger.log("Stopping previous " + expected.mode + " " + expected.target + " process (pid=" + metadata.pid + ")");
  try {
    await terminateOwnedTreeImpl(metadata.pid, {
      platform,
      killImpl,
      isProcessRunningImpl,
    });
  } catch (error) {
    throw new Error(
      "Failed to stop owned " + expected.target + " tree " + metadata.pid +
      "; ownership metadata retained at " + expected.pidFile + ": " + error.message,
      { cause: error },
    );
  }
  rmSync(expected.pidFile, { force: true });
  return { status: "stopped", pid: metadata.pid };
}

export function parsePort(raw, name) {
  const text = String(raw);
  if (!/^[0-9]+$/.test(text)) throw new CliUsageError(name + " must be an integer from 1 to 65535");
  const port = Number(text);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new CliUsageError(name + " must be an integer from 1 to 65535");
  }
  return port;
}

export function modeConfig(mode, env = process.env) {
  if (!MODES.has(mode)) throw new CliUsageError("Unknown runtime mode: " + mode);
  const requestedBackendPort = parsePort(env.TRACEVANE_API_PORT ?? "3761", "TRACEVANE_API_PORT");
  const frontendPort = parsePort(
    env.TRACEVANE_WEB_PORT ?? (mode === "fresh" ? "5177" : "5176"),
    "TRACEVANE_WEB_PORT",
  );
  if (requestedBackendPort === frontendPort) {
    throw new CliUsageError("TRACEVANE_API_PORT and TRACEVANE_WEB_PORT must differ");
  }
  return {
    requestedBackendPort,
    frontendPort,
    allowBackendFallback: false,
  };
}

function expectedLogPath(rootDir, mode, target) {
  const paths = runtimePaths(rootDir, mode);
  return target === "backend" ? paths.backendLog : paths.frontendLog;
}

export function parseCli(argv, { env = process.env, rootDir = DEFAULT_ROOT } = {}) {
  if (!Array.isArray(argv) || argv.length === 0) throw new CliUsageError(USAGE);
  const [command, ...rest] = argv;
  if (command === "restart" || command === "fresh") {
    if (rest.length !== 0) throw new CliUsageError("Unexpected arguments for " + command + "\n" + USAGE);
    modeConfig(command, env);
    return { command, mode: command };
  }
  if (command === "stop") {
    if (rest.length !== 0) throw new CliUsageError("Unexpected arguments for stop\n" + USAGE);
    return { command: "stop" };
  }
  if (command === "supervise") {
    if (rest.length !== 4) throw new CliUsageError("Invalid supervise arguments\n" + USAGE);
    const [target, mode, logPath, runToken] = rest;
    if (!TARGETS.has(target)) throw new CliUsageError("Invalid supervise target: " + target);
    if (!MODES.has(mode)) throw new CliUsageError("Invalid supervise mode: " + mode);
    modeConfig(mode, env);
    if (resolve(logPath) !== resolve(expectedLogPath(rootDir, mode, target))) {
      throw new CliUsageError("Supervisor log path must be the expected runtime log");
    }
    if (!RUN_TOKEN_PATTERN.test(runToken)) throw new CliUsageError("Invalid supervisor run token");
    return {
      command: "supervise",
      target,
      mode,
      logFile: resolve(logPath),
      runToken,
    };
  }
  throw new CliUsageError("Unknown command: " + command + "\n" + USAGE);
}

export function createNpmInvocation(
  args,
  {
    env = process.env,
    execPath = process.execPath,
    platform = process.platform,
    existsImpl = existsSync,
  } = {},
) {
  const npmExecPath = typeof env.npm_execpath === "string" ? env.npm_execpath.trim() : "";
  if (npmExecPath) {
    return {
      command: execPath,
      args: [npmExecPath, ...args],
      options: { shell: false },
    };
  }

  const executableDir = dirname(execPath);
  const candidates = [
    join(executableDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(executableDir), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/share/nodejs/npm/bin/npm-cli.js",
  ];
  const npmCli = candidates.find((candidate) => existsImpl(candidate));
  if (npmCli) {
    return {
      command: execPath,
      args: [npmCli, ...args],
      options: { shell: false },
    };
  }
  if (platform !== "win32") {
    return {
      command: "npm",
      args: [...args],
      options: { shell: false },
    };
  }
  throw new Error(
    "Could not locate npm-cli.js. Run this launcher through npm run dev:restart or npm run dev:fresh.",
  );
}

export function supervisorCommand({
  target,
  mode,
  rootDir,
  env = process.env,
}) {
  if (target === "backend" && mode === "fresh") {
    return {
      command: process.execPath,
      args: [join(resolvedRoot(rootDir), "scripts", "start-standalone-api.mjs")],
      options: { shell: false },
    };
  }
  const npmArgs = target === "backend"
    ? ["run", "dev:api"]
    : [
        "run",
        "dev",
        "--workspace=apps/web",
        "--",
        "--host",
        mode === "fresh" ? "127.0.0.1" : "0.0.0.0",
        "--port",
        env.TRACEVANE_WEB_PORT,
        "--force",
      ];
  return createNpmInvocation(npmArgs, { env });
}

function spawnAcknowledged(child) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      child.removeListener("spawn", onSpawn);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      callback(value);
    };
    const onError = (error) => finish(rejectSpawn, error);
    const onExit = (code, signal) => finish(
      rejectSpawn,
      new Error("Supervisor exited before acknowledgement (" + (signal ?? code) + ")"),
    );
    const onSpawn = () => {
      setImmediate(() => {
        if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
          finish(rejectSpawn, new Error("Supervisor spawn acknowledgement had a missing PID"));
          return;
        }
        if (child.exitCode !== null || child.signalCode !== null) {
          onExit(child.exitCode, child.signalCode);
          return;
        }
        finish(resolveSpawn, child.pid);
      });
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

export async function startSupervisor(options, dependencies = {}) {
  const {
    rootDir,
    target,
    mode,
    logFile,
    pidFile,
    env,
    runToken,
    scriptPath = SCRIPT_PATH,
  } = options;
  const {
    spawnImpl = spawn,
    terminateOwnedTreeImpl = terminateOwnedTree,
    atomicWriteFileImpl = atomicWriteFile,
  } = dependencies;
  mkdirSync(dirname(logFile), { recursive: true });
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(logFile, "", "utf8");
  const fd = openSync(logFile, "a");
  let child;
  try {
    child = spawnImpl(
      process.execPath,
      [scriptPath, "supervise", target, mode, logFile, runToken],
      {
        cwd: resolvedRoot(rootDir),
        detached: true,
        env: { ...process.env, ...env },
        stdio: ["ignore", fd, fd],
        windowsHide: true,
        shell: false,
      },
    );
    const pid = await spawnAcknowledged(child);
    closeSync(fd);
    const metadata = {
      version: METADATA_VERSION,
      pid,
      target,
      mode,
      resolvedRoot: resolvedRoot(rootDir),
      runToken,
      startedAt: new Date().toISOString(),
    };
    try {
      atomicWriteFileImpl(pidFile, JSON.stringify(metadata) + "\n");
    } catch (publishError) {
      try {
        await terminateOwnedTreeImpl(pid);
      } catch (cleanupError) {
        throw new AggregateError(
          [publishError, cleanupError],
          "Supervisor metadata publish failed and spawned-tree cleanup is unconfirmed: " +
          publishError.message + "; " + cleanupError.message,
        );
      }
      throw publishError;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      const exitError = new Error("Supervisor exited immediately after spawn acknowledgement");
      try {
        await terminateOwnedTreeImpl(pid);
      } catch (cleanupError) {
        throw new AggregateError(
          [exitError, cleanupError],
          "Supervisor exited immediately and spawned-tree cleanup is unconfirmed: " +
          cleanupError.message,
        );
      }
      rmSync(pidFile, { force: true });
      throw exitError;
    }
    child.unref();
    return {
      ...options,
      pid,
      metadata,
      child,
    };
  } catch (error) {
    try {
      closeSync(fd);
    } catch {}
    appendSupervisorDiagnostic(logFile, target + " supervisor start failed: " + error.message);
    const contextualMessage =
      "Failed to start " + target + " supervisor. " + formatLogTail(logFile) + "\n" + error.message;
    if (error instanceof AggregateError) {
      throw new AggregateError(error.errors, contextualMessage, { cause: error });
    }
    throw new Error(contextualMessage, { cause: error });
  }
}

function redactDiagnostics(text) {
  return text
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|password|api[_-]?key)\s*[=:]\s*)[^\s]+/gi, "$1[REDACTED]");
}

export function formatLogTail(logFile, maxBytes = DEFAULT_LOG_TAIL_BYTES) {
  const safeLimit = Math.max(1, Math.min(Number(maxBytes) || DEFAULT_LOG_TAIL_BYTES, DEFAULT_LOG_TAIL_BYTES));
  try {
    const size = statSync(logFile).size;
    const start = Math.max(0, size - safeLimit);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    const fd = openSync(logFile, "r");
    try {
      readSync(fd, buffer, 0, length, start);
    } finally {
      closeSync(fd);
    }
    return "Log: " + logFile + "\n--- bounded tail ---\n" + redactDiagnostics(buffer.toString("utf8"));
  } catch (error) {
    return "Log: " + logFile + " (unavailable: " + error.message + ")";
  }
}

async function hostPortIsFree(host, port) {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE" || error?.code === "EACCES") resolvePort(false);
      else if (error?.code === "EADDRNOTAVAIL" || error?.code === "EAFNOSUPPORT") resolvePort(true);
      else rejectPort(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => error ? rejectPort(error) : resolvePort(true));
    });
  });
}

export async function portIsFree(port) {
  for (const host of ["127.0.0.1", "::"]) {
    if (!await hostPortIsFree(host, port)) return false;
  }
  return true;
}

export async function findFreePort(
  startPort,
  { portIsFreeImpl = portIsFree, excludedPorts = [] } = {},
) {
  const excluded = new Set(excludedPorts);
  for (let port = startPort; port <= 65_535; port += 1) {
    if (!excluded.has(port) && await portIsFreeImpl(port)) return port;
  }
  throw new Error("No free port is available at or above " + startPort);
}

export async function requestHttp(url, timeoutMs, signal, { fetchImpl = fetch } = {}) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetchImpl(url, { signal: requestSignal });
  try {
    return response.ok;
  } finally {
    await response.body?.cancel?.().catch(() => {});
  }
}

export async function waitForHttp(readiness, dependencies = {}) {
  const {
    url,
    label,
    deadlineAt,
    supervisorPid,
    signal,
  } = readiness;
  const {
    nowImpl = Date.now,
    isProcessRunningImpl = isProcessRunning,
    requestImpl = requestHttp,
    waitImpl = wait,
    perRequestTimeoutMs = 2_000,
    retryDelayMs = 250,
  } = dependencies;

  while (true) {
    if (signal?.aborted) throw signal.reason;
    if (!isProcessRunningImpl(supervisorPid)) {
      throw new Error(label + " supervisor exited before readiness: pid=" + supervisorPid);
    }
    const remaining = deadlineAt - nowImpl();
    if (remaining <= 0) throw new Error(label + " did not become ready: " + url);
    try {
      if (await requestImpl(url, Math.min(perRequestTimeoutMs, remaining), signal)) return;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
    }
    if (!isProcessRunningImpl(supervisorPid)) {
      throw new Error(label + " supervisor exited before readiness: pid=" + supervisorPid);
    }
    const retryRemaining = deadlineAt - nowImpl();
    if (retryRemaining <= 0) throw new Error(label + " did not become ready: " + url);
    await waitImpl(Math.min(retryDelayMs, retryRemaining));
  }
}

async function stopStartedSupervisor(record) {
  return stopManagedProcess({
    pidFile: record.pidFile,
    target: record.target,
    mode: record.mode,
    resolvedRoot: record.rootDir,
  });
}

async function rollbackStarted(started, stopStartedSupervisorImpl) {
  const failures = [];
  for (const record of [...started].reverse()) {
    try {
      await stopStartedSupervisorImpl(record);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Startup rollback could not stop every owned supervisor");
  }
}

async function runBuild({ rootDir, env, signal }) {
  const invocation = createNpmInvocation(["run", "build"], { env });
  const child = spawn(invocation.command, invocation.args, {
    cwd: resolvedRoot(rootDir),
    detached: true,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  return new Promise((resolveBuild, rejectBuild) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => {
      if (Number.isSafeInteger(child.pid) && child.pid > 0) {
        terminateOwnedTree(child.pid)
          .then(() => finish(rejectBuild, signal.reason))
          .catch((error) => finish(rejectBuild, error));
      } else {
        finish(rejectBuild, signal.reason);
      }
    };
    child.once("error", (error) => finish(rejectBuild, error));
    child.once("close", (code, childSignal) => {
      if (code === 0) finish(resolveBuild);
      else finish(
        rejectBuild,
        new Error("Build failed (" + (childSignal ?? code) + ")"),
      );
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason;
}

function startupFailure(error, started) {
  const latest = started.at(-1);
  if (!latest?.logFile || String(error.message).includes("Log: " + latest.logFile)) return error;
  return new Error(error.message + "\n" + formatLogTail(latest.logFile), { cause: error });
}

export async function refresh(mode, options = {}) {
  const rootDir = resolvedRoot(options.rootDir ?? DEFAULT_ROOT);
  const env = options.env ?? process.env;
  const paths = runtimePaths(rootDir, mode);
  const config = modeConfig(mode, env);
  const stopManagedProcessImpl = options.stopManagedProcessImpl ?? stopManagedProcess;
  const portIsFreeImpl = options.portIsFreeImpl ?? portIsFree;
  const findFreePortImpl = options.findFreePortImpl ?? findFreePort;
  const runBuildImpl = options.runBuildImpl ?? runBuild;
  const startSupervisorImpl = options.startSupervisorImpl ?? startSupervisor;
  const waitForHttpImpl = options.waitForHttpImpl ?? waitForHttp;
  const stopStartedSupervisorImpl = options.stopStartedSupervisorImpl ?? stopStartedSupervisor;
  const signalEmitter = options.signalEmitter ?? process;
  const readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const started = [];
  const runToken = randomBytes(16).toString("hex");
  const abortController = new AbortController();
  const signalHandlers = new Map();
  for (const signalName of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (!abortController.signal.aborted) {
        abortController.abort(new Error("Startup interrupted by " + signalName));
      }
    };
    signalHandlers.set(signalName, handler);
    signalEmitter.on(signalName, handler);
  }
  const removeSignalHandlers = () => {
    for (const [signalName, handler] of signalHandlers) {
      signalEmitter.removeListener(signalName, handler);
    }
  };

  ensureRuntime(paths);
  try {
    throwIfAborted(abortController.signal);
    console.log("Refreshing Tracevane " + (mode === "fresh" ? "canonical" : "development") + " runtime");

    throwIfAborted(abortController.signal);
    await stopKnownWorkspaceRuntimes(rootDir, { stopManagedProcessImpl });

    throwIfAborted(abortController.signal);
    if (!await portIsFreeImpl(config.frontendPort)) {
      throw new Error(
        "Frontend port " + config.frontendPort +
        " is already in use by an unowned listener. Set TRACEVANE_WEB_PORT to a free port.",
      );
    }

    let backendPort;
    if (config.allowBackendFallback) {
      backendPort = await findFreePortImpl(config.requestedBackendPort, {
        portIsFreeImpl,
        excludedPorts: [config.frontendPort],
      });
      if (backendPort !== config.requestedBackendPort) {
        console.log(
          "Backend port " + config.requestedBackendPort +
          " is busy, using " + backendPort + " instead",
        );
      }
    } else {
      if (!await portIsFreeImpl(config.requestedBackendPort)) {
        throw new Error(
          "Backend port " + config.requestedBackendPort +
          " is already in use by an unowned listener. Set TRACEVANE_API_PORT to a free port.",
        );
      }
      backendPort = config.requestedBackendPort;
    }

    if (mode === "fresh") {
      throwIfAborted(abortController.signal);
      await runBuildImpl({ rootDir, env, signal: abortController.signal });
    }

    throwIfAborted(abortController.signal);
    console.log("Starting backend on port " + backendPort);
    const backend = await startSupervisorImpl({
      rootDir,
      target: "backend",
      mode,
      logFile: paths.backendLog,
      pidFile: paths.backendPid,
      env: { ...env, TRACEVANE_API_PORT: String(backendPort) },
      runToken,
      scriptPath: SCRIPT_PATH,
    });
    started.push(backend);
    await waitForHttpImpl({
      url: "http://127.0.0.1:" + backendPort + "/api/auth/status",
      label: "Backend",
      deadlineAt: Date.now() + readinessTimeoutMs,
      supervisorPid: backend.pid,
      signal: abortController.signal,
    });

    throwIfAborted(abortController.signal);
    console.log("Starting frontend on port " + config.frontendPort);
    const frontend = await startSupervisorImpl({
      rootDir,
      target: "frontend",
      mode,
      logFile: paths.frontendLog,
      pidFile: paths.frontendPid,
      env: {
        ...env,
        TRACEVANE_USE_EXTERNAL_API: "1",
        TRACEVANE_API_PORT: String(backendPort),
        TRACEVANE_WEB_PORT: String(config.frontendPort),
      },
      runToken,
      scriptPath: SCRIPT_PATH,
    });
    started.push(frontend);
    const frontendDeadline = Date.now() + readinessTimeoutMs;
    await waitForHttpImpl({
      url: "http://127.0.0.1:" + config.frontendPort + "/",
      label: "Frontend",
      deadlineAt: frontendDeadline,
      supervisorPid: frontend.pid,
      signal: abortController.signal,
    });
    await waitForHttpImpl({
      url: "http://127.0.0.1:" + config.frontendPort + "/api/auth/status",
      label: "Frontend proxy",
      deadlineAt: frontendDeadline,
      supervisorPid: frontend.pid,
      signal: abortController.signal,
    });

    throwIfAborted(abortController.signal);
    const envContents = [
      "TRACEVANE_API_PORT=" + backendPort,
      "TRACEVANE_WEB_PORT=" + config.frontendPort,
      "TRACEVANE_WEB_URL=http://127.0.0.1:" + config.frontendPort,
      "TRACEVANE_API_URL=http://127.0.0.1:" + backendPort,
      "BACKEND_PID=" + backend.pid,
      "FRONTEND_PID=" + frontend.pid,
      "",
    ].join("\n");
    atomicWriteFile(paths.envFile, envContents);
    removeSignalHandlers();
    console.log(
      "\nTracevane dev processes are ready" +
      "\nFrontend: http://127.0.0.1:" + config.frontendPort +
      "\nBackend:  http://127.0.0.1:" + backendPort +
      "\nFrontend log: " + paths.frontendLog +
      "\nBackend log: " + paths.backendLog +
      "\nRuntime env: " + paths.envFile,
    );
    return {
      backendPort,
      frontendPort: config.frontendPort,
      backendPid: backend.pid,
      frontendPid: frontend.pid,
      paths,
    };
  } catch (caught) {
    let error = startupFailure(caught, started);
    try {
      await rollbackStarted(started, stopStartedSupervisorImpl);
    } catch (rollbackError) {
      error = new Error(
        error.message + "\nRollback failure: " + rollbackError.message,
        { cause: new AggregateError([error, rollbackError]) },
      );
    }
    throw error;
  } finally {
    removeSignalHandlers();
  }
}

export async function stopRuntime(mode, options = {}) {
  const rootDir = resolvedRoot(options.rootDir ?? DEFAULT_ROOT);
  const paths = runtimePaths(rootDir, mode);
  const stopManagedProcessImpl = options.stopManagedProcessImpl ?? stopManagedProcess;
  const results = [];
  for (const target of ["frontend", "backend"]) {
    results.push(await stopManagedProcessImpl({
      pidFile: target === "backend" ? paths.backendPid : paths.frontendPid,
      target,
      mode,
      resolvedRoot: rootDir,
    }));
  }
  return results;
}

function appendSupervisorDiagnostic(logFile, message) {
  try {
    appendFileSync(
      logFile,
      "[dev-runtime] " + new Date().toISOString() + " " + redactDiagnostics(String(message)) + "\n",
      "utf8",
    );
  } catch {}
}

export async function runSupervisor(
  {
    target,
    mode,
    logFile,
    runToken,
    rootDir = DEFAULT_ROOT,
    env = process.env,
  },
  dependencies,
) {
  const {
    platform = process.platform,
    spawnImpl = spawn,
    terminateOwnedTreeImpl = terminateOwnedTree,
    signalEmitter = process,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    setExitCodeImpl = (code) => {
      process.exitCode = code;
    },
  } = dependencies ?? {};
  if (!TARGETS.has(target) || !MODES.has(mode) || !RUN_TOKEN_PATTERN.test(runToken)) {
    throw new CliUsageError("Invalid internal supervisor contract");
  }
  let activeWorker = null;
  let restartTimer = null;
  let stopping = false;
  let shutdownPromise = null;
  const lifecycle = new EventEmitter();

  const launch = () => {
    if (stopping) return;
    const command = supervisorCommand({ target, mode, rootDir, env });
    appendSupervisorDiagnostic(logFile, "starting " + target);
    const fd = openSync(logFile, "a");
    let fdClosed = false;
    const closeFd = () => {
      if (fdClosed) return;
      fdClosed = true;
      try {
        closeSync(fd);
      } catch {}
    };
    try {
      const child = spawnImpl(command.command, command.args, {
        cwd: resolvedRoot(rootDir),
        detached: platform !== "win32",
        env: { ...process.env, ...env },
        stdio: ["ignore", fd, fd],
        windowsHide: true,
        shell: false,
      });
      let resolveWorkerClosed;
      const workerClosed = new Promise((resolveClosed) => {
        resolveWorkerClosed = resolveClosed;
      });
      const workerRecord = { child, closed: workerClosed };
      activeWorker = workerRecord;
      child.once("spawn", () => appendSupervisorDiagnostic(logFile, target + " worker pid=" + child.pid));
      child.once("error", (error) => {
        appendSupervisorDiagnostic(logFile, target + " worker spawn failed: " + error.message);
      });
      child.once("close", (code, signal) => {
        closeFd();
        resolveWorkerClosed();
        if (activeWorker === workerRecord) activeWorker = null;
        appendSupervisorDiagnostic(logFile, target + " worker exited (" + (signal ?? code) + ")");
        if (stopping) return;
        restartTimer = setTimeoutImpl(launch, 1_000);
      });
    } catch (error) {
      closeFd();
      appendSupervisorDiagnostic(logFile, target + " worker launch failed: " + error.message);
      if (!stopping) restartTimer = setTimeoutImpl(launch, 1_000);
    }
  };

  const shutdown = (reason, error) => {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    if (restartTimer) {
      clearTimeoutImpl(restartTimer);
      restartTimer = null;
    }
    shutdownPromise = (async () => {
      appendSupervisorDiagnostic(
        logFile,
        "stopping supervisor: " + reason + (error ? " (" + error.message + ")" : ""),
      );
      const workerRecord = activeWorker;
      if (workerRecord && Number.isSafeInteger(workerRecord.child.pid)) {
        try {
          await terminateOwnedTreeImpl(workerRecord.child.pid, { platform });
        } catch (stopError) {
          appendSupervisorDiagnostic(logFile, "worker stop failed: " + stopError.message);
          setExitCodeImpl(1);
        }
        await workerRecord.closed;
      }
      lifecycle.emit("shutdown");
    })();
    return shutdownPromise;
  };

  const signalHandlers = {
    SIGINT: () => shutdown("SIGINT"),
    SIGTERM: () => shutdown("SIGTERM"),
    uncaughtException: (error) => {
      setExitCodeImpl(1);
      shutdown("uncaughtException", error);
    },
    unhandledRejection: (error) => {
      setExitCodeImpl(1);
      shutdown("unhandledRejection", error instanceof Error ? error : new Error(String(error)));
    },
  };
  for (const [event, handler] of Object.entries(signalHandlers)) signalEmitter.on(event, handler);
  launch();
  await new Promise((resolveLifecycle) => lifecycle.once("shutdown", resolveLifecycle));
  await shutdownPromise;
  for (const [event, handler] of Object.entries(signalHandlers)) {
    signalEmitter.removeListener(event, handler);
  }
}

export async function main(argv = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseCli(argv, {
      env: options.env ?? process.env,
      rootDir: options.rootDir ?? DEFAULT_ROOT,
    });
    if (parsed.command === "restart" || parsed.command === "fresh") {
      await refresh(parsed.mode, options);
    } else if (parsed.command === "stop") {
      await stopRuntime("restart", options);
      await stopRuntime("fresh", options);
      console.log("Tracevane owned development runtimes are stopped");
    } else {
      await runSupervisor({
        ...parsed,
        rootDir: options.rootDir ?? DEFAULT_ROOT,
        env: options.env ?? process.env,
      });
    }
    return 0;
  } catch (error) {
    console.error(error.message);
    if (error instanceof CliUsageError || error?.exitCode === 2) return 2;
    if (/SIGINT/.test(error.message)) return 130;
    if (/SIGTERM/.test(error.message)) return 143;
    return 1;
  }
}

if (isMainModule()) {
  process.exitCode = await main();
}
