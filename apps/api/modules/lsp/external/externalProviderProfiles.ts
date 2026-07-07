import { createRequire } from "node:module";
import path from "node:path";

import type { ExternalLanguageServerBudgets, ExternalLanguageServerProfile } from "./externalLanguageServerTypes.js";

const require = createRequire(import.meta.url);

export const DEFAULT_EXTERNAL_LSP_BUDGETS: ExternalLanguageServerBudgets = {
  initializeMs: 3_000,
  requestMs: 5_000,
  shutdownMs: 1_000,
};

export const YAML_LANGUAGE_SERVER_BIN = require.resolve("yaml-language-server/bin/yaml-language-server");
export const BASH_LANGUAGE_SERVER_BIN = require.resolve("bash-language-server/out/cli.js");

/**
 * External language servers are server-side allowlisted. The frontend never
 * provides commands or arguments. M11-F-C enables only YAML as the first
 * real provider proof.
 */
export const EXTERNAL_LANGUAGE_SERVER_PROFILES: ExternalLanguageServerProfile[] = [
  {
    id: "yaml",
    label: "YAML Language Server",
    command: process.execPath,
    args: [YAML_LANGUAGE_SERVER_BIN, "--stdio"],
    languages: ["yaml", "yml"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 3_000, requestMs: 3_000, shutdownMs: 1_000 },
  },
  {
    id: "bash",
    label: "Bash Language Server",
    command: process.execPath,
    args: [BASH_LANGUAGE_SERVER_BIN, "start"],
    languages: ["shell", "shellscript", "bash", "sh"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 10_000, requestMs: 3_000, shutdownMs: 1_000 },
    env: { BASH_IDE_LOG_LEVEL: "error", PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin` },
  },
];

export function getExternalLanguageServerProfiles(): ExternalLanguageServerProfile[] {
  return EXTERNAL_LANGUAGE_SERVER_PROFILES.map(cloneProfile);
}

export function findExternalLanguageServerProfile(
  providerId: string,
  profiles: ExternalLanguageServerProfile[] = EXTERNAL_LANGUAGE_SERVER_PROFILES,
): ExternalLanguageServerProfile | null {
  const profile = profiles.find((candidate) => candidate.id === providerId);
  return profile ? cloneProfile(profile) : null;
}

export function profileBudgets(profile: ExternalLanguageServerProfile): ExternalLanguageServerBudgets {
  return { ...DEFAULT_EXTERNAL_LSP_BUDGETS, ...profile.budgets };
}

export function resolveExternalLanguageServerCwd(rootPath: string, cwd?: string): string {
  const root = path.resolve(rootPath);
  const resolved = cwd ? path.resolve(root, cwd) : root;
  if (!isWithinRoot(root, resolved)) {
    throw new Error("External LSP cwd must stay inside workspace root");
  }
  return resolved;
}

export function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function cloneProfile(profile: ExternalLanguageServerProfile): ExternalLanguageServerProfile {
  return {
    ...profile,
    args: profile.args ? [...profile.args] : undefined,
    languages: [...profile.languages],
    capabilities: { ...profile.capabilities },
    budgets: profile.budgets ? { ...profile.budgets } : undefined,
    env: profile.env ? { ...profile.env } : undefined,
  };
}
