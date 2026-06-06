import fs from "node:fs";
import path from "node:path";

export interface OctoCredentialCacheEntry {
  bindingId: string;
  apiUrl: string;
  robotId: string;
  imToken: string;
  wsUrl: string;
  updatedAt: string;
}

export interface OctoCredentialCacheState {
  version: 1;
  updatedAt: string;
  bindings: Record<string, OctoCredentialCacheEntry>;
}

function readTextIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTextAtomic(filePath: string, content: string): void {
  ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCache(value: unknown, nowIso: string): OctoCredentialCacheState {
  const source = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawBindings = typeof source.bindings === "object" && source.bindings !== null && !Array.isArray(source.bindings)
    ? source.bindings as Record<string, unknown>
    : {};
  const bindings: Record<string, OctoCredentialCacheEntry> = {};
  for (const [bindingId, raw] of Object.entries(rawBindings)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const normalizedId = normalizeString(entry.bindingId) || bindingId;
    const apiUrl = normalizeString(entry.apiUrl);
    const robotId = normalizeString(entry.robotId);
    const imToken = normalizeString(entry.imToken);
    const wsUrl = normalizeString(entry.wsUrl);
    if (!normalizedId || !apiUrl || !robotId || !imToken || !wsUrl) continue;
    bindings[normalizedId] = {
      bindingId: normalizedId,
      apiUrl,
      robotId,
      imToken,
      wsUrl,
      updatedAt: normalizeString(entry.updatedAt) || nowIso,
    };
  }
  return {
    version: 1,
    updatedAt: normalizeString(source.updatedAt) || nowIso,
    bindings,
  };
}

export function readOctoCredentialCache(filePath: string, now = new Date()): OctoCredentialCacheState {
  const nowIso = now.toISOString();
  const raw = readTextIfExists(filePath);
  if (!raw) return { version: 1, updatedAt: nowIso, bindings: {} };
  try {
    return normalizeCache(JSON.parse(raw), nowIso);
  } catch {
    return { version: 1, updatedAt: nowIso, bindings: {} };
  }
}

export function writeOctoCredentialCache(filePath: string, state: OctoCredentialCacheState): void {
  writeTextAtomic(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function getOctoCachedCredentials(
  filePath: string,
  bindingId: string,
  apiUrl: string,
  now = new Date(),
): OctoCredentialCacheEntry | null {
  const state = readOctoCredentialCache(filePath, now);
  const entry = state.bindings[bindingId];
  if (!entry || entry.apiUrl !== apiUrl) return null;
  return entry;
}

export function saveOctoCachedCredentials(
  filePath: string,
  entry: Omit<OctoCredentialCacheEntry, "updatedAt">,
  now = new Date(),
): OctoCredentialCacheState {
  const updatedAt = now.toISOString();
  const state = readOctoCredentialCache(filePath, now);
  state.updatedAt = updatedAt;
  state.bindings[entry.bindingId] = {
    ...entry,
    updatedAt,
  };
  writeOctoCredentialCache(filePath, state);
  return state;
}
