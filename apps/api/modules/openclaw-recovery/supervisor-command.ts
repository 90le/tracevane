import { spawn } from "node:child_process";
import type {
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryDaemonServiceCommand,
} from "../../../../types/openclaw-recovery.js";

export function runOpenClawRecoveryServiceCommand(
  serviceCommand: OpenClawRecoveryDaemonServiceCommand,
  timeoutMs: number,
): Promise<OpenClawRecoveryCommandSnapshot> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(serviceCommand.command, serviceCommand.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      timeout = null;
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        resolve({
          label: serviceCommand.label,
          command: serviceCommand.command,
          args: serviceCommand.args,
          ok: false,
          status: null,
          durationMs: Date.now() - startedAt,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          error: "Command timed out",
        });
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({
        label: serviceCommand.label,
        command: serviceCommand.command,
        args: serviceCommand.args,
        ok: false,
        status: null,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: error.message,
      });
    });
    child.on("close", (status) => {
      if (timeout) clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({
        label: serviceCommand.label,
        command: serviceCommand.command,
        args: serviceCommand.args,
        ok: status === 0,
        status,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: status === 0 ? "" : `Command exited with status ${status}`,
      });
    });
  });
}
