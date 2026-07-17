import type { OpenClawRecoveryCommandSnapshot } from "../../../../types/openclaw-recovery.js";
import { runOwnedCommand } from "../../core/owned-command.js";

export async function runOpenClawRecoveryCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<OpenClawRecoveryCommandSnapshot> {
  const label = `${command} ${args.join(" ")}`.trim();
  const result = await runOwnedCommand(command, args, {
    cwd,
    timeoutMs,
  });
  return {
    label,
    command,
    args: [...args],
    ok: result.ok,
    status: result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}
