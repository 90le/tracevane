import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { terminateOwnedProcessTree } from "../../core/owned-command.js";
import { createWindowsJobObjectRunnerLaunch } from "./windows-job-object-runner.js";

export { createWindowsJobObjectRunnerLaunch } from "./windows-job-object-runner.js";

const RESTART_DELAY_MS = 1_000;
const STOP_GRACE_MS = 2_000;
const HOST_CHECK_INTERVAL_MS = 100;

export interface WindowsServiceWatchdogOptions {
  entryPath: string;
  args: string[];
  cwd: string;
  hostPid?: number;
}

export interface WindowsServiceWatchdog {
  done: Promise<void>;
  stop(): Promise<void>;
}

export function parseWindowsServiceWatchdogArguments(
  argv: string[],
): { entryPath: string; args: string[]; hostPid?: number } {
  if (argv[0] === "--host-pid") {
    const hostPid = Number(argv[1]);
    const payload = argv[2] === "--payload" ? argv[3] : null;
    if (
      !Number.isSafeInteger(hostPid) ||
      hostPid <= 0 ||
      !payload ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload)
    ) {
      throw new Error("watchdog arguments must be -- <daemonEntry> ...args");
    }
    try {
      const decoded = Buffer.from(payload, "base64");
      if (decoded.toString("base64") !== payload) throw new Error("invalid payload");
      const parsed = JSON.parse(decoded.toString("utf8")) as {
        entryPath?: unknown;
        args?: unknown;
      };
      if (
        typeof parsed.entryPath !== "string" ||
        !parsed.entryPath.trim() ||
        !Array.isArray(parsed.args) ||
        !parsed.args.every((argument) => typeof argument === "string")
      ) {
        throw new Error("invalid payload");
      }
      return {
        entryPath: parsed.entryPath,
        args: parsed.args,
        hostPid,
      };
    } catch {
      throw new Error("watchdog arguments must be -- <daemonEntry> ...args");
    }
  }
  if (argv[0] !== "--" || !argv[1]?.trim()) {
    throw new Error("watchdog arguments must be -- <daemonEntry> ...args");
  }
  return {
    entryPath: argv[1],
    args: argv.slice(2),
  };
}

function childIsRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (!childIsRunning(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("error", onExit);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("error", onExit);
    child.once("exit", onExit);
    if (!childIsRunning(child)) finish(true);
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (!childIsRunning(child)) return;
  if (process.platform === "win32") {
    const cleanupError = await terminateOwnedProcessTree(child, {
      graceMs: STOP_GRACE_MS,
    });
    if (cleanupError && childIsRunning(child)) throw new Error(cleanupError);
    return;
  }
  const gracefulExit = waitForChildExit(child, STOP_GRACE_MS);
  try {
    child.kill("SIGTERM");
  } catch {
    // The child may have exited between the state check and kill.
  }
  if (await gracefulExit) return;

  const forcedExit = waitForChildExit(child, STOP_GRACE_MS);
  try {
    child.kill("SIGKILL");
  } catch {
    // The child may have exited during escalation.
  }
  if (!(await forcedExit)) {
    throw new Error("watchdog child did not exit after forced stop");
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    return true;
  }
}

export function startWindowsServiceWatchdog(
  options: WindowsServiceWatchdogOptions,
): WindowsServiceWatchdog {
  let child: ChildProcess | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let hostTimer: NodeJS.Timeout | null = null;
  let stopping = false;
  let stopPromise: Promise<void> | null = null;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const scheduleRestart = () => {
    if (stopping || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      launch();
    }, RESTART_DELAY_MS);
  };

  const launch = () => {
    if (stopping) return;
    let spawned: ChildProcess;
    try {
      const daemonLaunch = process.platform === "win32"
        ? createWindowsJobObjectRunnerLaunch({
            ...options,
            watchdogPid: process.pid,
          })
        : {
            args: [options.entryPath, ...options.args],
            command: process.execPath,
          };
      spawned = spawn(
        daemonLaunch.command,
        daemonLaunch.args,
        {
          cwd: options.cwd,
          detached: false,
          shell: false,
          stdio: "ignore",
          windowsHide: true,
        },
      );
    } catch {
      scheduleRestart();
      return;
    }

    child = spawned;
    let settled = false;
    const onSettled = () => {
      if (settled) return;
      settled = true;
      if (child === spawned) child = null;
      if (!stopping) scheduleRestart();
    };
    spawned.once("error", onSettled);
    spawned.once("exit", onSettled);
  };

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopping = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (hostTimer) {
      clearInterval(hostTimer);
      hostTimer = null;
    }
    const ownedChild = child;
    child = null;
    stopPromise = (async () => {
      try {
        if (ownedChild) await stopChild(ownedChild);
      } finally {
        resolveDone();
      }
    })();
    return stopPromise;
  };

  launch();
  if (options.hostPid) {
    hostTimer = setInterval(() => {
      if (processIsAlive(options.hostPid!)) return;
      void stop().catch(() => {
        process.exitCode = 1;
      });
    }, HOST_CHECK_INTERVAL_MS);
  }

  return { done, stop };
}

async function runFromCommandLine(): Promise<void> {
  const parsed = parseWindowsServiceWatchdogArguments(process.argv.slice(2));
  const watchdog = startWindowsServiceWatchdog({
    ...parsed,
    cwd: process.cwd(),
  });
  const stop = () => {
    void watchdog.stop().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await watchdog.done;
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await runFromCommandLine().catch(() => {
    process.stderr.write(
      "Tracevane Windows service watchdog could not start.\n",
    );
    process.exitCode = 2;
  });
}
