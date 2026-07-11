import { spawn } from "node:child_process";
import { writeSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_INTERVAL_MS = 100;
const STARTUP_STABILITY_MS = 50;
const STOP_GRACE_MS = 1_000;
const STOP_CONFIRM_MS = 1_000;
const TERMINATION_CLEANUP_TIMEOUT_MS = 3_000;

const activeChildren = new Set();
const stoppingChildren = new WeakMap();
const terminationHandlers = new Map();
let terminationInProgress = false;

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
}

function abortReason(signal, fallback) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new Error("HTTP readiness wait was aborted", {
    cause: signal?.reason ?? fallback,
  });
}

function timeoutError(url, timeoutMs, cause) {
  return new Error(
    `Timed out waiting for HTTP readiness after ${timeoutMs}ms: ${url}`,
    { cause },
  );
}

export async function waitForHttp(
  url,
  {
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
    intervalMs = DEFAULT_HTTP_INTERVAL_MS,
    signal,
  } = {},
) {
  assertNonNegativeFinite(timeoutMs, "timeoutMs");
  assertNonNegativeFinite(intervalMs, "intervalMs");

  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortReason(signal);

    const remainingMs = Math.max(1, deadline - Date.now());
    const requestTimeout = AbortSignal.timeout(remainingMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, requestTimeout])
      : requestTimeout;

    try {
      const response = await fetch(url, { signal: requestSignal });
      if (response.ok) {
        await response.body?.cancel();
        return;
      }
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
      await response.body?.cancel();
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal, error);
      lastError = error;
    }

    const delayMs = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
    if (delayMs > 0) {
      try {
        await delay(delayMs, undefined, signal ? { signal } : undefined);
      } catch (error) {
        if (signal?.aborted) throw abortReason(signal, error);
        throw error;
      }
    }
  }

  throw timeoutError(url, timeoutMs, lastError);
}

function childHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function processGroupIsAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitUntilStopped(isAlive, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) return true;
    await delay(20);
  }
  return !isAlive();
}

function runTaskkill(pid) {
  return new Promise((resolve, reject) => {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("error", (error) => {
      reject(new Error(`Failed to run taskkill for owned process ${pid}`, {
        cause: error,
      }));
    });
    killer.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        `taskkill failed for owned process ${pid} (${signal ?? `code ${code}`})`,
      ));
    });
  });
}

async function stopWindowsProcess(child, pid) {
  const mustAttemptOwnedTree = activeChildren.has(child);
  if (childHasExited(child) && !mustAttemptOwnedTree) return;

  try {
    await runTaskkill(pid);
  } catch (error) {
    if (!mustAttemptOwnedTree && (childHasExited(child) || !processIsAlive(pid))) {
      return;
    }
    throw error;
  }

  const stopped = await waitUntilStopped(
    () => !childHasExited(child) && processIsAlive(pid),
    STOP_CONFIRM_MS,
  );
  if (!stopped) {
    throw new Error(`Owned process ${pid} remained alive after taskkill`);
  }
}

async function stopPosixProcess(child, pid) {
  const ownsProcessGroup = processGroupIsAlive(pid);
  const isAlive = ownsProcessGroup
    ? () => processGroupIsAlive(pid)
    : () => !childHasExited(child) && processIsAlive(pid);

  if (!isAlive()) return;

  try {
    if (ownsProcessGroup) process.kill(-pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }

  if (await waitUntilStopped(isAlive, STOP_GRACE_MS)) return;

  try {
    if (ownsProcessGroup) process.kill(-pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }

  if (!(await waitUntilStopped(isAlive, STOP_CONFIRM_MS))) {
    throw new Error(`Owned process group ${pid} remained alive after SIGKILL`);
  }
}

export function stopOwnedProcess(child) {
  if (!child || typeof child !== "object") return Promise.resolve();

  const existing = stoppingChildren.get(child);
  if (existing) return existing;

  const stop = (async () => {
    const pid = child.pid;
    if (!Number.isSafeInteger(pid) || pid <= 0) return;

    if (process.platform === "win32") {
      await stopWindowsProcess(child, pid);
    } else {
      await stopPosixProcess(child, pid);
    }
  })();
  stoppingChildren.set(child, stop);
  return stop;
}

function removeTerminationHandlers() {
  for (const [signal, handler] of terminationHandlers) {
    process.off(signal, handler);
  }
  terminationHandlers.clear();
}

function cleanupWithin(promise, timeoutMs, pid) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(
        `Timed out cleaning up owned process ${pid} after ${timeoutMs}ms`,
      ));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function formatError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function writeTerminationError(message) {
  try {
    writeSync(2, message);
  } catch {
    try {
      process.stderr.write(message);
    } catch {
      // A hard exit is still required when stderr itself is unavailable.
    }
  }
}

function installTerminationHandlers() {
  if (terminationHandlers.size > 0) return;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (terminationInProgress) return;
      terminationInProgress = true;
      void (async () => {
        const results = await Promise.allSettled(
          [...activeChildren].map((child) => cleanupWithin(
            stopOwnedProcess(child),
            TERMINATION_CLEANUP_TIMEOUT_MS,
            child.pid,
          )),
        );
        removeTerminationHandlers();
        const failures = results
          .filter((result) => result.status === "rejected")
          .map((result) => formatError(result.reason));
        if (failures.length > 0) {
          writeTerminationError(
            `[with-server] failed to clean up owned processes after ${signal}:\n${failures.join("\n")}\n`,
          );
          process.exit(1);
        }
        process.exit(signal === "SIGINT" ? 130 : 143);
      })();
    };
    terminationHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}

function registerOwnedProcess(child) {
  activeChildren.add(child);
  installTerminationHandlers();
}

function unregisterOwnedProcess(child) {
  activeChildren.delete(child);
  if (activeChildren.size === 0 && !terminationInProgress) {
    removeTerminationHandlers();
  }
}

function startupExitError(code, signal) {
  if (signal) {
    return new Error(`Server process exited before readiness (signal ${signal})`);
  }
  return new Error(`Server process exited before readiness (code ${code})`);
}

export async function withServer(
  {
    command,
    args = [],
    cwd,
    env,
    stdio = "inherit",
    url,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
    intervalMs = DEFAULT_HTTP_INTERVAL_MS,
  },
  callback,
) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: { ...process.env, ...env },
    shell: false,
    stdio,
    windowsHide: true,
  });
  registerOwnedProcess(child);

  const startupController = new AbortController();
  let waitingForReadiness = true;
  const onStartupError = (error) => {
    startupController.abort(new Error(
      `Failed to start server process ${JSON.stringify(command)}: ${error.message}`,
      { cause: error },
    ));
  };
  const onStartupExit = (code, signal) => {
    if (waitingForReadiness) {
      startupController.abort(startupExitError(code, signal));
    }
  };
  child.once("error", onStartupError);
  child.once("exit", onStartupExit);

  let result;
  let failure;
  let failed = false;
  try {
    await waitForHttp(url, {
      intervalMs,
      signal: startupController.signal,
      timeoutMs,
    });
    try {
      await delay(STARTUP_STABILITY_MS, undefined, {
        signal: startupController.signal,
      });
    } catch {
      startupController.signal.throwIfAborted();
      throw new Error("Server startup stability check failed");
    }
    startupController.signal.throwIfAborted();
    if (childHasExited(child)) {
      throw startupExitError(child.exitCode, child.signalCode);
    }
    waitingForReadiness = false;
    child.off("error", onStartupError);
    child.off("exit", onStartupExit);
    result = await callback();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    waitingForReadiness = false;
    child.off("error", onStartupError);
    child.off("exit", onStartupExit);
    startupController.abort();
    try {
      await stopOwnedProcess(child);
    } catch (cleanupError) {
      if (failed) {
        if (failure && typeof failure === "object") {
          failure.cleanupError = cleanupError;
        } else {
          failure = new AggregateError(
            [failure, cleanupError],
            "Server operation and cleanup both failed",
          );
        }
      } else {
        failed = true;
        failure = cleanupError;
      }
    } finally {
      unregisterOwnedProcess(child);
    }
  }

  if (failed) throw failure;
  return result;
}
