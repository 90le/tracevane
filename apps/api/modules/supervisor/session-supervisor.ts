import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";
import type {
  TracevaneServiceManagerStatus,
  TracevaneSupervisorErrorCode,
} from "../../../../types/supervisor.js";
import type { ServiceDefinition } from "./contracts.js";
import { runSupervisorCommand } from "./command-runner.js";

type ServiceId = ServiceDefinition["id"];

export interface SessionServiceStatus
  extends TracevaneServiceManagerStatus {
  pid: number | null;
  restartCount: number;
}

export interface SessionSupervisor {
  start(definition: ServiceDefinition): Promise<SessionServiceStatus>;
  status(serviceId: ServiceId): Promise<SessionServiceStatus>;
  stop(serviceId: ServiceId): Promise<SessionServiceStatus>;
  dispose(): Promise<void>;
}

export interface CreateSessionSupervisorOptions {
  platform?: NodeJS.Platform;
  restartDelayMs?: number;
  maxRestartDelayMs?: number;
  maxRestarts?: number;
  stopGraceMs?: number;
  forceKillWaitMs?: number;
  terminateOwnedTree?: (pid: number, force: boolean) => Promise<void>;
}

interface SessionEntry {
  definition: ServiceDefinition;
  child: ChildProcess | null;
  state: SessionServiceStatus["state"];
  restartCount: number;
  restartTimer: NodeJS.Timeout | null;
  spawnPromise: Promise<void> | null;
  stopPromise: Promise<boolean> | null;
  stopping: boolean;
  lastErrorCode: TracevaneSupervisorErrorCode | null;
  lastErrorMessage: string | null;
}

function waitForClose(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("close", onClose);
      resolve(closed);
    };
    const onClose = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once("close", onClose);
  });
}

function stoppedStatus(): SessionServiceStatus {
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: false,
    state: "stopped",
    configCurrent: true,
    checkedAt: new Date().toISOString(),
    errorCode: null,
    errorMessage: null,
    pid: null,
    restartCount: 0,
  };
}

function entryStatus(entry: SessionEntry): SessionServiceStatus {
  const live =
    entry.child !== null &&
    typeof entry.child.pid === "number" &&
    entry.child.exitCode === null &&
    entry.child.signalCode === null;
  const state =
    entry.state === "running" && !live ? "failed" : entry.state;
  const errorCode =
    state === "failed" && !entry.lastErrorCode
      ? "runtime-not-ready"
      : entry.lastErrorCode;
  const errorMessage =
    state === "failed" && !entry.lastErrorMessage
      ? "Session process is not running."
      : entry.lastErrorMessage;
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: state === "starting" ? null : state === "running" && live,
    state,
    configCurrent: true,
    checkedAt: new Date().toISOString(),
    errorCode,
    errorMessage,
    pid: live ? entry.child?.pid ?? null : null,
    restartCount: entry.restartCount,
  };
}

export function createSessionSupervisor(
  options: CreateSessionSupervisorOptions = {},
): SessionSupervisor {
  const platform = options.platform ?? process.platform;
  const restartDelayMs = Math.max(0, options.restartDelayMs ?? 250);
  const maxRestartDelayMs = Math.max(
    restartDelayMs,
    options.maxRestartDelayMs ?? 2_000,
  );
  const maxRestarts = Math.max(0, options.maxRestarts ?? 3);
  const stopGraceMs = Math.max(0, options.stopGraceMs ?? 1_000);
  const forceKillWaitMs = Math.max(
    50,
    options.forceKillWaitMs ?? 1_000,
  );
  const entries = new Map<ServiceId, SessionEntry>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  const clearRestart = (entry: SessionEntry) => {
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
      entry.restartTimer = null;
    }
  };

  const scheduleRestart = (entry: SessionEntry) => {
    if (disposed || entry.stopping) {
      entry.state = "stopped";
      return;
    }
    if (entry.restartCount >= maxRestarts) {
      entry.state = "failed";
      entry.lastErrorCode = "runtime-not-ready";
      entry.lastErrorMessage = `Session process exited after ${maxRestarts} restart attempts.`;
      return;
    }
    entry.restartCount += 1;
    entry.state = "starting";
    const delay = Math.min(
      restartDelayMs * 2 ** Math.max(0, entry.restartCount - 1),
      maxRestartDelayMs,
    );
    entry.restartTimer = setTimeout(() => {
      entry.restartTimer = null;
      if (disposed || entry.stopping) {
        entry.state = "stopped";
        return;
      }
      void spawnEntry(entry);
    }, delay);
  };

  const onChildClose = (
    entry: SessionEntry,
    child: ChildProcess,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
  ) => {
    if (entry.child !== child) return;
    entry.child = null;
    if (disposed || entry.stopping) {
      entry.state = "stopped";
      entry.lastErrorCode = null;
      entry.lastErrorMessage = null;
      return;
    }
    entry.lastErrorCode ??= "runtime-not-ready";
    entry.lastErrorMessage ??=
      `Session process exited unexpectedly` +
      (exitCode !== null ? ` (exit ${exitCode})` : "") +
      (signal ? ` (signal ${signal})` : "");
    scheduleRestart(entry);
  };

  function spawnEntry(entry: SessionEntry): Promise<void> {
    entry.state = "starting";
    entry.lastErrorCode = null;
    entry.lastErrorMessage = null;
    let readySettled = false;
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const settleReady = () => {
      if (readySettled) return;
      readySettled = true;
      if (entry.spawnPromise === ready) entry.spawnPromise = null;
      resolveReady();
    };
    entry.spawnPromise = ready;
    let child: ChildProcess;
    try {
      child = spawn(
        process.execPath,
        [entry.definition.entryPath, ...entry.definition.args],
        {
          cwd: entry.definition.workingDirectory,
          shell: false,
          detached: platform !== "win32",
          stdio: ["ignore", "inherit", "inherit"],
          windowsHide: true,
        },
      );
    } catch (error) {
      entry.child = null;
      entry.lastErrorCode = "runtime-not-ready";
      entry.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
      scheduleRestart(entry);
      settleReady();
      return ready;
    }
    entry.child = child;
    child.once("spawn", () => {
      if (entry.child === child) entry.state = "running";
      settleReady();
    });
    child.once("error", (error) => {
      if (entry.child !== child) return;
      entry.lastErrorCode =
        (error as NodeJS.ErrnoException).code === "EACCES"
          ? "permission-denied"
          : "runtime-not-ready";
      entry.lastErrorMessage = error.message;
      entry.state = "failed";
      settleReady();
    });
    child.once("close", (exitCode, signal) => {
      settleReady();
      onChildClose(entry, child, exitCode, signal);
    });
    return ready;
  }

  async function signalOwnedTree(
    entry: SessionEntry,
    child: ChildProcess,
    force: boolean,
  ): Promise<void> {
    const pid = child.pid;
    if (!pid) return;
    if (options.terminateOwnedTree) {
      await options.terminateOwnedTree(pid, force);
      return;
    }
    if (platform === "win32") {
      const result = await runSupervisorCommand(
        {
          label: force
            ? "Force stop owned session process tree"
            : "Stop owned session process tree",
          command: "taskkill.exe",
          args: [
            "/PID",
            String(pid),
            "/T",
            ...(force ? ["/F"] : []),
          ],
        },
        {
          timeoutMs: forceKillWaitMs,
          platform,
          action: "stop",
        },
      );
      if (
        force &&
        !result.ok &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill("SIGKILL");
      }
      return;
    }
    const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      try {
        child.kill(signal);
      } catch (childError) {
        if ((childError as NodeJS.ErrnoException).code !== "ESRCH") {
          throw childError;
        }
      }
    }
  }

  async function stopEntry(entry: SessionEntry): Promise<boolean> {
    entry.stopping = true;
    clearRestart(entry);
    const child = entry.child;
    if (!child) {
      entry.state = "stopped";
      entry.lastErrorCode = null;
      entry.lastErrorMessage = null;
      return true;
    }

    let closed = false;
    try {
      await signalOwnedTree(entry, child, false);
      closed = await waitForClose(child, stopGraceMs);
      if (!closed) {
        await signalOwnedTree(entry, child, true);
        closed = await waitForClose(child, forceKillWaitMs);
      }
    } catch (error) {
      entry.state = "failed";
      entry.lastErrorCode =
        (error as NodeJS.ErrnoException).code === "EACCES"
          ? "permission-denied"
          : "runtime-not-ready";
      entry.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
      return false;
    }
    if (!closed) {
      entry.state = "failed";
      entry.lastErrorCode = "runtime-not-ready";
      entry.lastErrorMessage =
        `Owned session process ${child.pid ?? "unknown"} did not exit.`;
      return false;
    }
    entry.child = null;
    entry.state = "stopped";
    entry.lastErrorCode = null;
    entry.lastErrorMessage = null;
    return true;
  }

  function stopEntryOnce(entry: SessionEntry): Promise<boolean> {
    entry.stopPromise ??= stopEntry(entry).finally(() => {
      entry.stopPromise = null;
    });
    return entry.stopPromise;
  }

  return {
    async start(definition) {
      if (disposed) {
        throw new Error("Session supervisor has been disposed.");
      }
      let entry = entries.get(definition.id);
      if (entry) {
        if (entry.stopPromise) await entry.stopPromise;
        if (disposed) {
          throw new Error("Session supervisor has been disposed.");
        }
        entry.stopping = false;
        if (
          entry.child &&
          entry.child.exitCode === null &&
          entry.child.signalCode === null
        ) {
          if (entry.spawnPromise) await entry.spawnPromise;
          return entryStatus(entry);
        }
        entry.definition = definition;
        clearRestart(entry);
        entry.restartCount = 0;
      } else {
        entry = {
          definition,
          child: null,
          state: "stopped",
          restartCount: 0,
          restartTimer: null,
          spawnPromise: null,
          stopPromise: null,
          stopping: false,
          lastErrorCode: null,
          lastErrorMessage: null,
        };
        entries.set(definition.id, entry);
      }
      await spawnEntry(entry);
      return entryStatus(entry);
    },

    async status(serviceId) {
      const entry = entries.get(serviceId);
      return entry ? entryStatus(entry) : stoppedStatus();
    },

    async stop(serviceId) {
      const entry = entries.get(serviceId);
      if (!entry) return stoppedStatus();
      await stopEntryOnce(entry);
      return entryStatus(entry);
    },

    dispose() {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        const outcomes = await Promise.all(
          [...entries.values()].map((entry) => stopEntryOnce(entry)),
        );
        for (const [serviceId, entry] of entries) {
          if (!entry.child) entries.delete(serviceId);
        }
        if (outcomes.some((stopped) => !stopped) || entries.size > 0) {
          const details = [...entries.values()]
            .map((entry) => entry.lastErrorMessage)
            .filter(Boolean)
            .join("; ");
          throw new Error(details || "One or more session processes did not exit.");
        }
      })();
      return disposePromise;
    },
  };
}

let processSessionSupervisor: SessionSupervisor | null = null;
let processSessionDisposal: Promise<void> | null = null;

export function getProcessSessionSupervisor(): SessionSupervisor {
  if (processSessionDisposal) {
    throw new Error("Process session supervisor is being disposed.");
  }
  processSessionSupervisor ??= createSessionSupervisor();
  return processSessionSupervisor;
}

export function disposeProcessSessionSupervisor(): Promise<void> {
  if (processSessionDisposal) return processSessionDisposal;
  const supervisor = processSessionSupervisor;
  if (!supervisor) return Promise.resolve();
  processSessionDisposal = supervisor
    .dispose()
    .then(() => {
      if (processSessionSupervisor === supervisor) {
        processSessionSupervisor = null;
      }
    })
    .finally(() => {
      processSessionDisposal = null;
    });
  return processSessionDisposal;
}
