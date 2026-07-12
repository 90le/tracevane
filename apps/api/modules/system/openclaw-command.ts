import {
  runOwnedCommand,
  type OwnedCommandResult,
} from "../../core/owned-command.js";

export interface SystemOpenClawCommandOptions {
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}

export function runSystemOpenClawCommand(
  args: string[],
  options: SystemOpenClawCommandOptions,
): Promise<OwnedCommandResult> {
  return runOwnedCommand("openclaw", args, options);
}

export function systemOpenClawCommandError(
  result: OwnedCommandResult,
  fallback: string,
): string {
  return result.stderr.trim() || result.error || fallback;
}
