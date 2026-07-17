import type { ChildProcess } from "node:child_process";
import crossSpawn from "cross-spawn";

const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_STOP_GRACE_MS = 1_000;
const DEFAULT_TASKKILL_TIMEOUT_MS = 5_000;

interface BoundedOutput {
  chunks: Buffer[];
  bytes: number;
  truncated: boolean;
}

export interface OwnedCommandOptions {
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
  stopGraceMs?: number;
  taskkillTimeoutMs?: number;
}

export interface OwnedCommandResult {
  command: string;
  args: string[];
  ok: boolean;
  status: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error: string;
  timedOut: boolean;
  cleanupError: string;
}

export interface OwnedProcessStopOptions {
  graceMs?: number;
  taskkillTimeoutMs?: number;
}

function appendOutput(
  output: BoundedOutput,
  chunk: Buffer,
  maxOutputBytes: number,
): void {
  const remaining = maxOutputBytes - output.bytes;
  if (remaining <= 0) {
    output.truncated = true;
    return;
  }
  const retained = Buffer.from(chunk.subarray(0, remaining));
  output.chunks.push(retained);
  output.bytes += retained.byteLength;
  if (retained.byteLength < chunk.byteLength) output.truncated = true;
}

function renderOutput(output: BoundedOutput): string {
  const text = Buffer.concat(output.chunks, output.bytes).toString("utf8");
  return output.truncated ? `${text}\n...[truncated]` : text;
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
    const finish = (exited: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("error", onExit);
      child.off("close", onExit);
      resolve(exited);
    };
    const onExit = (): void => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("error", onExit);
    child.once("close", onExit);
    if (!childIsRunning(child)) finish(true);
  });
}

function posixGroupIsRunning(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function signalPosixGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitUntilAbsent(
  isAlive: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !isAlive();
}

export async function terminateOwnedProcessTree(
  child: ChildProcess,
  options: OwnedProcessStopOptions = {},
): Promise<string> {
  const pid = child.pid;
  if (!pid) return "owned command PID is unavailable";
  const graceMs = Math.max(0, options.graceMs ?? DEFAULT_STOP_GRACE_MS);
  const taskkillTimeoutMs = Math.max(
    1,
    options.taskkillTimeoutMs ?? DEFAULT_TASKKILL_TIMEOUT_MS,
  );

  if (process.platform === "win32") {
    if (!childIsRunning(child)) {
      return "owned command root already exited; descendant cleanup was not attempted";
    }
    const result = crossSpawn.sync(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      {
        shell: false,
        stdio: "ignore",
        timeout: taskkillTimeoutMs,
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0) {
      try {
        if (childIsRunning(child)) child.kill();
      } catch {
        // Report the unconfirmed tree cleanup below.
      }
      if (await waitForChildExit(child, graceMs)) {
        return "taskkill failed; the root command exited but descendant cleanup is unconfirmed";
      }
      return "taskkill failed and the owned command remained alive";
    }
    return await waitForChildExit(child, graceMs)
      ? ""
      : "taskkill returned success but the owned command remained alive";
  }

  if (posixGroupIsRunning(pid)) {
    if (!signalPosixGroup(pid, "SIGTERM")) return "";
    if (await waitUntilAbsent(() => posixGroupIsRunning(pid), graceMs)) {
      return "";
    }
    if (!signalPosixGroup(pid, "SIGKILL")) return "";
    return await waitUntilAbsent(() => posixGroupIsRunning(pid), graceMs)
      ? ""
      : "owned process group remained alive after SIGKILL";
  }

  if (!childIsRunning(child)) return "";
  try {
    child.kill("SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  if (await waitForChildExit(child, graceMs)) return "";
  try {
    child.kill("SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  return await waitForChildExit(child, graceMs)
    ? ""
    : "owned command remained alive after SIGKILL";
}

export function runOwnedCommand(
  command: string,
  args: string[],
  options: OwnedCommandOptions,
): Promise<OwnedCommandResult> {
  const startedAt = Date.now();
  const maxOutputBytes = Math.max(
    0,
    Math.floor(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES),
  );
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = crossSpawn.spawn(command, args, {
        cwd: options.cwd,
        detached: process.platform !== "win32",
        env: options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      resolve({
        command,
        args: [...args],
        ok: false,
        status: null,
        signal: null,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: "",
        error: failure,
        timedOut: false,
        cleanupError: "",
      });
      return;
    }
    const stdout: BoundedOutput = { chunks: [], bytes: 0, truncated: false };
    const stderr: BoundedOutput = { chunks: [], bytes: 0, truncated: false };
    let settled = false;
    let timedOut = false;
    let deadline: NodeJS.Timeout | null = null;

    const finish = (input: {
      status: number | null;
      signal: NodeJS.Signals | null;
      error?: string;
      cleanupError?: string;
    }): void => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      const error = input.error
        || (input.status === 0
          ? ""
          : `Command exited with ${input.signal || `status ${input.status}`}`);
      resolve({
        command,
        args: [...args],
        ok: !error && input.status === 0,
        status: input.status,
        signal: input.signal,
        durationMs: Date.now() - startedAt,
        stdout: renderOutput(stdout),
        stderr: renderOutput(stderr),
        error,
        timedOut,
        cleanupError: input.cleanupError || "",
      });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      appendOutput(stdout, chunk, maxOutputBytes);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      appendOutput(stderr, chunk, maxOutputBytes);
    });
    child.once("error", (error) => {
      if (timedOut) return;
      finish({ status: null, signal: null, error: error.message });
    });
    child.once("close", (status, signal) => {
      if (timedOut) return;
      finish({ status, signal });
    });

    deadline = setTimeout(() => {
      if (settled) return;
      if (!childIsRunning(child)) {
        finish({ status: child.exitCode, signal: child.signalCode });
        return;
      }
      timedOut = true;
      void terminateOwnedProcessTree(child, {
        graceMs: options.stopGraceMs,
        taskkillTimeoutMs: options.taskkillTimeoutMs,
      }).then(
        (cleanupError) => finish({
          status: null,
          signal: child.signalCode,
          error: cleanupError
            ? `Command timed out; ${cleanupError}`
            : "Command timed out",
          cleanupError,
        }),
        (error) => {
          const cleanupError = error instanceof Error ? error.message : String(error);
          finish({
            status: null,
            signal: child.signalCode,
            error: `Command timed out; cleanup failed: ${cleanupError}`,
            cleanupError,
          });
        },
      );
    }, Math.max(0, options.timeoutMs));
  });
}
