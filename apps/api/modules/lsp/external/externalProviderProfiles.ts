import path from "node:path";

import type { ExternalLanguageServerBudgets, ExternalLanguageServerProfile } from "./externalLanguageServerTypes.js";

export const DEFAULT_EXTERNAL_LSP_BUDGETS: ExternalLanguageServerBudgets = {
  initializeMs: 3_000,
  requestMs: 5_000,
  shutdownMs: 1_000,
};

/**
 * M11-F-B intentionally ships no real external language-server profiles.
 * Future M11-F-C+ providers must add allowlisted, server-side profiles here
 * instead of accepting arbitrary frontend commands.
 */
export const EXTERNAL_LANGUAGE_SERVER_PROFILES: ExternalLanguageServerProfile[] = [];

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
