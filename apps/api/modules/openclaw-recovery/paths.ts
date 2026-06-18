import os from "node:os";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";

export const OPENCLAW_RECOVERY_STATE_FILE = "state.json";
export const OPENCLAW_RECOVERY_EVENTS_FILE = "events.jsonl";
export const OPENCLAW_RECOVERY_TOKEN_FILE = "token";
export const OPENCLAW_RECOVERY_LOCK_FILE = "repair.lock";
export const OPENCLAW_RECOVERY_INSTALL_MANIFEST_FILE = "install-manifest.json";

export interface OpenClawRecoveryPaths {
  rootDir: string;
  statePath: string;
  eventsPath: string;
  backupsDir: string;
  binDir: string;
  cliShimPath: string;
  tokenPath: string;
  lockPath: string;
  installManifestPath: string;
}

export function resolveOpenClawRecoveryPaths(
  configOrRoot: TracevaneServerConfig | string,
): OpenClawRecoveryPaths {
  const openclawRoot =
    typeof configOrRoot === "string" ? configOrRoot : configOrRoot.openclawRoot;
  const rootDir = path.join(openclawRoot, "tracevane", "recovery");
  return {
    rootDir,
    statePath: path.join(rootDir, OPENCLAW_RECOVERY_STATE_FILE),
    eventsPath: path.join(rootDir, OPENCLAW_RECOVERY_EVENTS_FILE),
    backupsDir: path.join(rootDir, "backups"),
    binDir: path.join(rootDir, "bin"),
    cliShimPath: path.join(rootDir, "bin", process.platform === "win32" ? "openclaw.cmd" : "openclaw"),
    tokenPath: path.join(rootDir, OPENCLAW_RECOVERY_TOKEN_FILE),
    lockPath: path.join(rootDir, OPENCLAW_RECOVERY_LOCK_FILE),
    installManifestPath: path.join(rootDir, OPENCLAW_RECOVERY_INSTALL_MANIFEST_FILE),
  };
}

export function resolveRecoveryHome(config: TracevaneServerConfig): string {
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw"
    ? path.dirname(openclawRoot)
    : process.env.HOME || os.homedir();
}
