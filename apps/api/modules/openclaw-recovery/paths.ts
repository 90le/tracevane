import os from "node:os";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";

export const OPENCLAW_RECOVERY_STATE_FILE = "state.json";
export const OPENCLAW_RECOVERY_EVENTS_FILE = "events.jsonl";
export const OPENCLAW_RECOVERY_TOKEN_FILE = "token";
export const OPENCLAW_RECOVERY_LOCK_FILE = "repair.lock";

export interface OpenClawRecoveryPaths {
  rootDir: string;
  statePath: string;
  eventsPath: string;
  backupsDir: string;
  tokenPath: string;
  lockPath: string;
}

export function resolveOpenClawRecoveryPaths(
  configOrRoot: StudioServerConfig | string,
): OpenClawRecoveryPaths {
  const openclawRoot =
    typeof configOrRoot === "string" ? configOrRoot : configOrRoot.openclawRoot;
  const rootDir = path.join(openclawRoot, "studio", "recovery");
  return {
    rootDir,
    statePath: path.join(rootDir, OPENCLAW_RECOVERY_STATE_FILE),
    eventsPath: path.join(rootDir, OPENCLAW_RECOVERY_EVENTS_FILE),
    backupsDir: path.join(rootDir, "backups"),
    tokenPath: path.join(rootDir, OPENCLAW_RECOVERY_TOKEN_FILE),
    lockPath: path.join(rootDir, OPENCLAW_RECOVERY_LOCK_FILE),
  };
}

export function resolveRecoveryHome(config: StudioServerConfig): string {
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw"
    ? path.dirname(openclawRoot)
    : process.env.HOME || os.homedir();
}
