import { spawn } from "node:child_process";
import type {
  TracevaneServiceAction,
  TracevaneSupervisorErrorCode,
} from "../../../../types/supervisor.js";
import type { SupervisorCommand } from "./contracts.js";

const MAX_STREAM_BYTES = 16 * 1024;
const TERMINATION_GRACE_MS = 100;
const FINAL_SETTLE_GRACE_MS = 100;
const REDACTED = "[REDACTED]";
const SCHEDULED_TASK_NOT_FOUND = 0x80070002;
const SCHEDULED_TASK_PERMISSION_DENIED = 0x80070005;

export interface RunSupervisorCommandOptions {
  timeoutMs: number;
  platform: NodeJS.Platform;
  action: TracevaneServiceAction;
  redact?: string[];
}

export interface SupervisorCommandResult extends SupervisorCommand {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode: TracevaneSupervisorErrorCode | null;
  errorMessage: string | null;
  durationMs: number;
}

interface BoundedStream {
  chunks: Buffer[];
  retainedBytes: number;
  totalBytes: number;
}

function appendBounded(stream: BoundedStream, chunk: Buffer): void {
  stream.totalBytes += chunk.byteLength;
  const remaining = MAX_STREAM_BYTES - stream.retainedBytes;
  if (remaining <= 0) return;
  const retained = Buffer.from(chunk.subarray(0, remaining));
  stream.chunks.push(retained);
  stream.retainedBytes += retained.byteLength;
}

function redact(value: string, secrets: string[]): string {
  let result = value;
  for (const secret of secrets) {
    if (secret) result = result.replaceAll(secret, REDACTED);
  }
  return result;
}

function boundUtf8(value: string): string {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength <= MAX_STREAM_BYTES) return value;

  return decodeUtf8(encoded.subarray(0, MAX_STREAM_BYTES), 3) ?? "";
}

function decodeUtf8(bytes: Buffer, maxTailBytes: number): string | null {
  const tailBytes = Math.min(3, maxTailBytes, bytes.byteLength);
  for (let omitted = 0; omitted <= tailBytes; omitted += 1) {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, bytes.byteLength - omitted),
      );
      return decoded.includes("\uFFFD") ? null : decoded;
    } catch {
      // Back up only far enough to avoid splitting a UTF-8 code point.
    }
  }
  return null;
}

function decodeStream(stream: BoundedStream, secrets: string[]): string {
  const bytes = Buffer.concat(stream.chunks, stream.retainedBytes);
  const maxTailBytes = stream.totalBytes > stream.retainedBytes ? 3 : 0;
  const decoded = decodeUtf8(bytes, maxTailBytes);
  if (decoded === null) {
    return `[diagnostic output omitted: ${stream.totalBytes} bytes are not valid UTF-8]`;
  }
  return boundUtf8(redact(decoded, secrets));
}

function isScheduledTaskQuery(result: SupervisorCommandResult): boolean {
  if (result.kind === "windows-task-status") return true;
  const executable = result.command
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.toLowerCase();
  if (executable !== "schtasks.exe" && executable !== "schtasks") return false;

  const args = result.args.map((argument) => argument.toLowerCase());
  const taskNameIndex = args.indexOf("/tn");
  return args.includes("/query")
    && args.includes("/hresult")
    && taskNameIndex >= 0
    && Boolean(result.args[taskNameIndex + 1]);
}

function matchesExitCode(exitCode: number | null, hresult: number): boolean {
  return exitCode === hresult || exitCode === (hresult | 0);
}

export function classifySupervisorFailure(
  result: SupervisorCommandResult,
): TracevaneSupervisorErrorCode {
  if (result.errorCode && result.errorCode !== "unknown") {
    return result.errorCode;
  }
  if (isScheduledTaskQuery(result)) {
    if (matchesExitCode(result.exitCode, SCHEDULED_TASK_NOT_FOUND)) {
      return "task-not-found";
    }
    if (matchesExitCode(result.exitCode, SCHEDULED_TASK_PERMISSION_DENIED)) {
      return "permission-denied";
    }
  }
  return result.errorCode ?? "unknown";
}

function stableErrorMessage(code: TracevaneSupervisorErrorCode): string {
  switch (code) {
    case "task-not-found":
      return "Scheduled task is not installed.";
    case "permission-denied":
      return "Supervisor command permission denied.";
    case "command-not-found":
      return "Supervisor command is not available.";
    case "command-timeout":
      return "Supervisor command timed out.";
    default:
      return "Supervisor command failed.";
  }
}

export async function runSupervisorCommand(
  command: SupervisorCommand,
  options: RunSupervisorCommandOptions,
): Promise<SupervisorCommandResult> {
  const startedAt = Date.now();
  const stdout: BoundedStream = { chunks: [], retainedBytes: 0, totalBytes: 0 };
  const stderr: BoundedStream = { chunks: [], retainedBytes: 0, totalBytes: 0 };
  const secrets = options.redact?.filter(Boolean) ?? [];

  return new Promise((resolve) => {
    let spawnError: NodeJS.ErrnoException | null = null;
    let timedOut = false;
    let settled = false;
    let deadlineTimer: NodeJS.Timeout | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let finalSettleTimer: NodeJS.Timeout | undefined;
    const child = spawn(command.command, command.args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    child.stdout.on("data", (chunk: Buffer) => appendBounded(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => appendBounded(stderr, chunk));

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (finalSettleTimer) clearTimeout(finalSettleTimer);

      const initialErrorCode: TracevaneSupervisorErrorCode | null = timedOut
        ? "command-timeout"
        : spawnError?.code === "ENOENT"
          ? "command-not-found"
          : spawnError?.code === "EACCES"
            ? "permission-denied"
            : null;
      const result: SupervisorCommandResult = {
        label: redact(command.label, secrets),
        command: redact(command.command, secrets),
        args: command.args.map((argument) => redact(argument, secrets)),
        ...(command.kind ? { kind: command.kind } : {}),
        ok: !timedOut && spawnError === null && exitCode === 0,
        exitCode,
        stdout: decodeStream(stdout, secrets),
        stderr: decodeStream(stderr, secrets),
        errorCode: initialErrorCode,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
      };

      if (!result.ok) {
        result.errorCode = classifySupervisorFailure(result);
        result.errorMessage = stableErrorMessage(result.errorCode);
      }
      resolve(result);
    };

    child.once("error", (error: NodeJS.ErrnoException) => {
      spawnError = error;
      finish(null);
    });
    child.once("close", (exitCode) => finish(exitCode));

    deadlineTimer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      if (process.platform === "win32") child.kill();
      else child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (settled) return;
        if (process.platform === "win32") child.kill();
        else child.kill("SIGKILL");
        finalSettleTimer = setTimeout(
          () => finish(child.exitCode),
          FINAL_SETTLE_GRACE_MS,
        );
      }, TERMINATION_GRACE_MS);
    }, Math.max(0, options.timeoutMs));
  });
}
