import fs from "node:fs";
import path from "node:path";

export interface ChannelConnectorCommandAliasRecord {
  name: string;
  command: string;
  source: "store";
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConnectorCommandAliasState {
  version: 1;
  updatedAt: string;
  bindings: Record<string, Record<string, ChannelConnectorCommandAliasRecord>>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyState(): ChannelConnectorCommandAliasState {
  return {
    version: 1,
    updatedAt: nowIso(),
    bindings: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasKey(name: string): string {
  return normalizeString(name).toLowerCase();
}

export function isValidCommandAliasName(value: string): boolean {
  const normalized = normalizeString(value);
  return normalized.length > 0 && normalized.length <= 64 && !/\s/.test(normalized);
}

export function normalizeCommandAliasCommand(value: string): string {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function readChannelConnectorCommandAliases(filePath: string): ChannelConnectorCommandAliasState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.bindings)) return emptyState();
    const bindings: ChannelConnectorCommandAliasState["bindings"] = {};
    for (const [bindingId, rawAliases] of Object.entries(raw.bindings)) {
      const normalizedBindingId = normalizeString(bindingId);
      if (!normalizedBindingId || !isRecord(rawAliases)) continue;
      const aliases: Record<string, ChannelConnectorCommandAliasRecord> = {};
      for (const [key, rawAlias] of Object.entries(rawAliases)) {
        if (!isRecord(rawAlias)) continue;
        const name = normalizeString(rawAlias.name) || normalizeString(key);
        const command = normalizeCommandAliasCommand(normalizeString(rawAlias.command));
        if (!isValidCommandAliasName(name) || !command) continue;
        aliases[aliasKey(name)] = {
          name,
          command,
          source: "store",
          createdAt: normalizeString(rawAlias.createdAt) || nowIso(),
          updatedAt: normalizeString(rawAlias.updatedAt) || nowIso(),
        };
      }
      bindings[normalizedBindingId] = aliases;
    }
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      bindings,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export function writeChannelConnectorCommandAliases(
  filePath: string,
  state: ChannelConnectorCommandAliasState,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = {
    version: 1 as const,
    updatedAt: nowIso(),
    bindings: state.bindings,
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function listChannelConnectorCommandAliases(
  filePath: string,
  bindingId: string,
): ChannelConnectorCommandAliasRecord[] {
  const state = readChannelConnectorCommandAliases(filePath);
  return Object.values(state.bindings[bindingId] || {})
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getChannelConnectorCommandAlias(
  filePath: string,
  bindingId: string,
  name: string,
): ChannelConnectorCommandAliasRecord | null {
  const state = readChannelConnectorCommandAliases(filePath);
  return state.bindings[bindingId]?.[aliasKey(name)] || null;
}

export function upsertChannelConnectorCommandAlias(
  filePath: string,
  bindingId: string,
  name: string,
  command: string,
): ChannelConnectorCommandAliasRecord {
  const state = readChannelConnectorCommandAliases(filePath);
  const normalizedBindingId = normalizeString(bindingId);
  const normalizedName = normalizeString(name);
  const normalizedCommand = normalizeCommandAliasCommand(command);
  if (!normalizedBindingId) throw new Error("bindingId is required.");
  if (!isValidCommandAliasName(normalizedName)) throw new Error("Invalid alias trigger.");
  if (!normalizedCommand) throw new Error("Alias command is required.");
  const key = aliasKey(normalizedName);
  const now = nowIso();
  const current = state.bindings[normalizedBindingId]?.[key] || null;
  const record: ChannelConnectorCommandAliasRecord = {
    name: normalizedName,
    command: normalizedCommand,
    source: "store",
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  state.bindings[normalizedBindingId] = {
    ...(state.bindings[normalizedBindingId] || {}),
    [key]: record,
  };
  writeChannelConnectorCommandAliases(filePath, state);
  return record;
}

export function deleteChannelConnectorCommandAlias(
  filePath: string,
  bindingId: string,
  name: string,
): boolean {
  const state = readChannelConnectorCommandAliases(filePath);
  const aliases = state.bindings[bindingId] || {};
  const key = aliasKey(name);
  const existed = Boolean(aliases[key]);
  delete aliases[key];
  state.bindings[bindingId] = aliases;
  writeChannelConnectorCommandAliases(filePath, state);
  return existed;
}
