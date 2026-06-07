import fs from "node:fs";
import path from "node:path";

export interface ChannelConnectorCustomCommandRecord {
  name: string;
  description: string;
  prompt: string;
  source: "config";
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConnectorCustomCommandState {
  version: 1;
  updatedAt: string;
  projects: Record<string, Record<string, ChannelConnectorCustomCommandRecord>>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCustomCommandName(value: string): string {
  return normalizeString(value).toLowerCase().replaceAll("-", "_");
}

function emptyState(): ChannelConnectorCustomCommandState {
  return {
    version: 1,
    updatedAt: nowIso(),
    projects: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidCustomCommandName(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
}

export function readChannelConnectorCustomCommands(filePath: string): ChannelConnectorCustomCommandState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.projects)) return emptyState();
    const projects: ChannelConnectorCustomCommandState["projects"] = {};
    for (const [projectId, rawCommands] of Object.entries(raw.projects)) {
      const normalizedProjectId = normalizeString(projectId);
      if (!normalizedProjectId || !isRecord(rawCommands)) continue;
      const commands: Record<string, ChannelConnectorCustomCommandRecord> = {};
      for (const [key, rawCommand] of Object.entries(rawCommands)) {
        if (!isRecord(rawCommand)) continue;
        const name = normalizeString(rawCommand.name) || normalizeString(key);
        const prompt = normalizeString(rawCommand.prompt);
        if (!name || !prompt || !isValidCustomCommandName(name)) continue;
        commands[normalizeCustomCommandName(name)] = {
          name,
          description: normalizeString(rawCommand.description),
          prompt,
          source: "config",
          createdAt: normalizeString(rawCommand.createdAt) || nowIso(),
          updatedAt: normalizeString(rawCommand.updatedAt) || nowIso(),
        };
      }
      projects[normalizedProjectId] = commands;
    }
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      projects,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export function writeChannelConnectorCustomCommands(
  filePath: string,
  state: ChannelConnectorCustomCommandState,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = {
    version: 1 as const,
    updatedAt: nowIso(),
    projects: state.projects,
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function listChannelConnectorCustomCommands(
  filePath: string,
  projectId: string,
): ChannelConnectorCustomCommandRecord[] {
  const state = readChannelConnectorCustomCommands(filePath);
  return Object.values(state.projects[projectId] || {})
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getChannelConnectorCustomCommand(
  filePath: string,
  projectId: string,
  name: string,
): ChannelConnectorCustomCommandRecord | null {
  const state = readChannelConnectorCustomCommands(filePath);
  const commands = state.projects[projectId] || {};
  return commands[normalizeCustomCommandName(name)] || null;
}

export function upsertChannelConnectorCustomCommand(
  filePath: string,
  projectId: string,
  name: string,
  prompt: string,
  description = "",
): ChannelConnectorCustomCommandRecord {
  const state = readChannelConnectorCustomCommands(filePath);
  const normalizedProjectId = normalizeString(projectId);
  const normalizedName = normalizeString(name).toLowerCase();
  const normalizedPrompt = normalizeString(prompt);
  if (!normalizedProjectId) throw new Error("projectId is required.");
  if (!isValidCustomCommandName(normalizedName)) throw new Error("Invalid custom command name.");
  if (!normalizedPrompt) throw new Error("Custom command prompt is required.");
  const key = normalizeCustomCommandName(normalizedName);
  const now = nowIso();
  const current = state.projects[normalizedProjectId]?.[key] || null;
  const record: ChannelConnectorCustomCommandRecord = {
    name: normalizedName,
    description: normalizeString(description),
    prompt: normalizedPrompt,
    source: "config",
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  state.projects[normalizedProjectId] = {
    ...(state.projects[normalizedProjectId] || {}),
    [key]: record,
  };
  writeChannelConnectorCustomCommands(filePath, state);
  return record;
}

export function deleteChannelConnectorCustomCommand(
  filePath: string,
  projectId: string,
  name: string,
): boolean {
  const state = readChannelConnectorCustomCommands(filePath);
  const commands = state.projects[projectId] || {};
  const key = normalizeCustomCommandName(name);
  const existed = Boolean(commands[key]);
  delete commands[key];
  state.projects[projectId] = commands;
  writeChannelConnectorCustomCommands(filePath, state);
  return existed;
}
