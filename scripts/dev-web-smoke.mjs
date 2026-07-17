import { spawn } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  stopOwnedProcess,
  withServer,
} from "./lib/with-server.mjs";

const DEFAULT_WEB_PORT = 5176;
const OWNED_COMMAND_CLEANUP_TIMEOUT_MS = 3_000;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMESTAMP_MODULE_PATTERN = /^vite\.config\.ts\.timestamp-.+\.mjs$/;

export function readPort(env, name, fallback) {
  const value = env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new RangeError(
      `${name} must be an integer from 1 to 65535; received ${JSON.stringify(value)}`,
    );
  }
  const port = Number(value);
  if (port < 1 || port > 65_535) {
    throw new RangeError(
      `${name} must be an integer from 1 to 65535; received ${JSON.stringify(value)}`,
    );
  }
  return port;
}

function readDirectory(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function removeDirectTimestampModules(directory) {
  for (const entry of readDirectory(directory)) {
    if (!entry.isFile() || !TIMESTAMP_MODULE_PATTERN.test(entry.name)) continue;
    rmSync(path.join(directory, entry.name), { force: true });
  }
}

function removeNestedTimestampModules(nodeModulesDir) {
  const pending = [nodeModulesDir];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readDirectory(directory)) {
      if (!entry.isDirectory()) continue;
      const child = path.join(directory, entry.name);
      if (entry.name === ".vite-temp") {
        removeDirectTimestampModules(child);
      } else {
        pending.push(child);
      }
    }
  }
}

function removeTemporaryDependencyDirectories(cacheDir) {
  for (const entry of readDirectory(cacheDir)) {
    if (!entry.isDirectory() || !entry.name.startsWith("deps_temp_")) continue;
    rmSync(path.join(cacheDir, entry.name), { force: true, recursive: true });
  }
}

export function createWebSmokeConfig({ env = process.env, rootDir = ROOT_DIR } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const webDir = path.join(resolvedRoot, "apps", "web");
  const webPort = readPort(env, "TRACEVANE_WEB_PORT", DEFAULT_WEB_PORT);
  const cacheDir = path.resolve(
    env.TRACEVANE_VITE_CACHE_DIR ||
      path.join(resolvedRoot, "tmp", `.tracevane-vite-smoke-${webPort}`),
  );
  const childEnv = {
    ...env,
    TRACEVANE_SMOKE_DISABLE_WATCH:
      env.TRACEVANE_SMOKE_DISABLE_WATCH || "1",
    TRACEVANE_VITE_CACHE_DIR: cacheDir,
    TRACEVANE_WEB_PORT: String(webPort),
  };

  return {
    cacheDir,
    env: childEnv,
    rootDir: resolvedRoot,
    viteBin: path.join(resolvedRoot, "node_modules", "vite", "bin", "vite.js"),
    webDir,
    webPort,
  };
}

export function cleanWebSmokeArtifacts(config) {
  removeTemporaryDependencyDirectories(config.cacheDir);
  mkdirSync(path.dirname(config.cacheDir), { recursive: true });
  removeDirectTimestampModules(config.webDir);
  removeNestedTimestampModules(path.join(config.webDir, "node_modules"));
}

export async function assertTcpPortAvailable(host, port) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen({ exclusive: true, host, port }, resolve);
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      throw new Error(
        `Cannot start owned smoke server: ${host}:${port} is already in use`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (probe.listening) {
      await new Promise((resolve, reject) => {
        probe.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

function waitForChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      child.off("exit", onExit);
      reject(error);
    };
    const onExit = (code, signal) => {
      child.off("error", onError);
      resolve({ code, signal });
    };
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

function cleanupWithin(promise, timeoutMs, signal) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(
        `Owned command cleanup after ${signal} timed out after ${timeoutMs}ms`,
      ));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export async function waitForOwnedCommand(
  child,
  {
    cleanupTimeoutMs = OWNED_COMMAND_CLEANUP_TIMEOUT_MS,
    signalEmitter = process,
    stopOwnedProcessImpl = stopOwnedProcess,
  } = {},
) {
  if (!Number.isFinite(cleanupTimeoutMs) || cleanupTimeoutMs < 0) {
    throw new TypeError("cleanupTimeoutMs must be a non-negative finite number");
  }

  let requestedSignal;
  let signalCleanup;
  let resolveSignal;
  let rejectSignal;
  const signalHandlers = new Map();
  const signalOutcome = new Promise((resolve, reject) => {
    resolveSignal = resolve;
    rejectSignal = reject;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (requestedSignal) return;
      requestedSignal = signal;
      signalCleanup = cleanupWithin(
        Promise.resolve().then(() => stopOwnedProcessImpl(child)),
        cleanupTimeoutMs,
        signal,
      ).catch((error) => {
        try {
          child.unref?.();
        } catch {
          // Preserve the cleanup failure that makes this command unsafe to await.
        }
        throw new Error(
          `Failed to clean up owned command after ${signal}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      });
      signalCleanup.then(
        () => resolveSignal({ signal }),
        rejectSignal,
      );
    };
    signalHandlers.set(signal, handler);
    signalEmitter.once(signal, handler);
  }

  try {
    const result = await Promise.race([
      waitForChild(child).then((outcome) => ({ kind: "exit", outcome })),
      signalOutcome.then(({ signal }) => ({ kind: "signal", signal })),
    ]);
    if (result.kind === "exit" && !requestedSignal) return result.outcome;
    if (signalCleanup) await signalCleanup;
    if (requestedSignal) {
      const error = new Error(`Interrupted by ${requestedSignal}`);
      error.exitCode = requestedSignal === "SIGINT" ? 130 : 143;
      throw error;
    }
    return result.outcome;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      signalEmitter.off(signal, handler);
    }
    if (!signalCleanup) await stopOwnedProcessImpl(child);
  }
}

export async function runOwnedCommand(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
    shell: false,
    stdio: options?.stdio ?? "inherit",
    windowsHide: true,
  });
  return waitForOwnedCommand(child);
}

export async function prepareWebSmoke(options = {}) {
  const config = createWebSmokeConfig(options);
  cleanWebSmokeArtifacts(config);

  const forceOptimize = config.env.TRACEVANE_SMOKE_FORCE_OPTIMIZE === "1";
  const skipOptimize = config.env.TRACEVANE_SMOKE_SKIP_OPTIMIZE === "1";
  if (forceOptimize || !skipOptimize) {
    rmSync(config.cacheDir, { force: true, recursive: true });
    // Preserve the shell launcher's `vite optimize --force || true`: this
    // deterministic warm-up is best-effort, while the real server must start.
    await runOwnedCommand(
      process.execPath,
      [config.viteBin, "optimize", "--force"],
      { cwd: config.webDir, env: config.env, stdio: options.stdio },
    );
  }

  return config;
}

async function keepServing(url) {
  let consecutiveFailures = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.body?.cancel();
      consecutiveFailures = response.ok ? 0 : consecutiveFailures + 1;
    } catch {
      consecutiveFailures += 1;
    }
    if (consecutiveFailures >= 3) {
      throw new Error(`Web smoke server stopped responding: ${url}`);
    }
  }
}

export async function servePreparedWebSmoke(
  config,
  callback,
  { intervalMs, stdio, timeoutMs } = {},
) {
  const url = `http://127.0.0.1:${config.webPort}/`;
  await assertTcpPortAvailable("127.0.0.1", config.webPort);
  return withServer(
    {
      args: [
        config.viteBin,
        "--force",
        "--strictPort",
        "--port",
        String(config.webPort),
      ],
      command: process.execPath,
      cwd: config.webDir,
      env: config.env,
      intervalMs,
      stdio,
      timeoutMs,
      url,
    },
    callback || (() => keepServing(url)),
  );
}

export async function runWebSmoke(options = {}, callback) {
  const config = await prepareWebSmoke(options);
  return servePreparedWebSmoke(config, callback, options);
}

export function isMainModule(
  metaUrl = import.meta.url,
  argvEntry = process.argv[1],
) {
  if (!argvEntry) return false;
  return pathToFileURL(path.resolve(argvEntry)).href === metaUrl;
}

if (isMainModule()) {
  try {
    await runWebSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = error?.exitCode || 1;
  }
}
