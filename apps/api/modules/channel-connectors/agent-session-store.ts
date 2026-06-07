import fs from "node:fs";
import path from "node:path";
import type { ChannelConnectorAgentId } from "../../../../types/channel-connectors.js";

export interface ChannelConnectorAgentSessionRecord {
  id: string;
  name: string | null;
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  workDir: string;
  codexThreadId: string | null;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageId: string | null;
  lastStatus: string | null;
}

export interface ChannelConnectorAgentSessionState {
  version: 1;
  updatedAt: string;
  sessions: Record<string, ChannelConnectorAgentSessionRecord>;
}

export interface ChannelConnectorAgentSessionLookup {
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  workDir: string;
}

export interface ChannelConnectorAgentSessionUpdate extends ChannelConnectorAgentSessionLookup {
  codexThreadId?: string | null;
  messageId?: string | null;
  status?: string | null;
  name?: string | null;
  now?: Date;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function channelConnectorAgentSessionId(input: ChannelConnectorAgentSessionLookup): string {
  return [
    input.bindingId,
    input.projectId,
    input.sessionKey,
    input.agent,
    input.workDir,
  ].map((part) => encodeKeyPart(part)).join("|");
}

function emptyState(): ChannelConnectorAgentSessionState {
  return {
    version: 1,
    updatedAt: nowIso(),
    sessions: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readChannelConnectorAgentSessions(filePath: string): ChannelConnectorAgentSessionState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.sessions)) return emptyState();
    const sessions: Record<string, ChannelConnectorAgentSessionRecord> = {};
    for (const [id, value] of Object.entries(raw.sessions)) {
      if (!isRecord(value)) continue;
      const recordId = normalizeString(value.id) || id;
      const bindingId = normalizeString(value.bindingId);
      const projectId = normalizeString(value.projectId);
      const sessionKey = normalizeString(value.sessionKey);
      const agent = normalizeString(value.agent) as ChannelConnectorAgentId;
      const workDir = normalizeString(value.workDir);
      if (!recordId || !bindingId || !projectId || !sessionKey || !agent || !workDir) continue;
      sessions[recordId] = {
        id: recordId,
        name: normalizeString(value.name) || null,
        bindingId,
        projectId,
        sessionKey,
        agent,
        model: normalizeString(value.model) || null,
        workDir,
        codexThreadId: normalizeString(value.codexThreadId) || null,
        turnCount: Number.isFinite(Number(value.turnCount)) ? Math.max(0, Number(value.turnCount)) : 0,
        createdAt: normalizeString(value.createdAt) || nowIso(),
        updatedAt: normalizeString(value.updatedAt) || nowIso(),
        lastMessageId: normalizeString(value.lastMessageId) || null,
        lastStatus: normalizeString(value.lastStatus) || null,
      };
    }
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      sessions,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export function writeChannelConnectorAgentSessions(
  filePath: string,
  state: ChannelConnectorAgentSessionState,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = {
    version: 1 as const,
    updatedAt: nowIso(),
    sessions: state.sessions,
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function getChannelConnectorAgentSession(
  filePath: string,
  lookup: ChannelConnectorAgentSessionLookup,
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  return state.sessions[channelConnectorAgentSessionId(lookup)] || null;
}

export function listChannelConnectorAgentSessionsForConversation(
  filePath: string,
  lookup: Pick<ChannelConnectorAgentSessionLookup, "bindingId" | "sessionKey"> & { limit?: number | null },
): ChannelConnectorAgentSessionRecord[] {
  const state = readChannelConnectorAgentSessions(filePath);
  const limit = Number.isFinite(Number(lookup.limit))
    ? Math.max(1, Math.min(50, Number(lookup.limit)))
    : 20;
  return Object.values(state.sessions)
    .filter((record) => record.bindingId === lookup.bindingId && record.sessionKey === lookup.sessionKey)
    .sort((left, right) => {
      const byUpdatedAt = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      return byUpdatedAt || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

export function upsertChannelConnectorAgentSession(
  filePath: string,
  update: ChannelConnectorAgentSessionUpdate,
): ChannelConnectorAgentSessionRecord {
  const state = readChannelConnectorAgentSessions(filePath);
  const id = channelConnectorAgentSessionId(update);
  const now = (update.now || new Date()).toISOString();
  const current = state.sessions[id];
  const next: ChannelConnectorAgentSessionRecord = {
    id,
    name: update.name === undefined ? current?.name || null : normalizeString(update.name) || null,
    bindingId: update.bindingId,
    projectId: update.projectId,
    sessionKey: update.sessionKey,
    agent: update.agent,
    model: update.model,
    workDir: update.workDir,
    codexThreadId: normalizeString(update.codexThreadId) || current?.codexThreadId || null,
    turnCount: (current?.turnCount || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
    lastMessageId: normalizeString(update.messageId) || null,
    lastStatus: normalizeString(update.status) || null,
  };
  state.sessions[id] = next;
  writeChannelConnectorAgentSessions(filePath, state);
  return next;
}

export function renameChannelConnectorAgentSession(
  filePath: string,
  input: Pick<ChannelConnectorAgentSessionLookup, "bindingId" | "sessionKey"> & {
    sessionId: string;
    name: string | null;
  },
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  const record = state.sessions[input.sessionId];
  if (!record || record.bindingId !== input.bindingId || record.sessionKey !== input.sessionKey) return null;
  const now = nowIso();
  const next: ChannelConnectorAgentSessionRecord = {
    ...record,
    name: normalizeString(input.name) || null,
    updatedAt: now,
  };
  state.sessions[input.sessionId] = next;
  writeChannelConnectorAgentSessions(filePath, state);
  return next;
}

export function clearChannelConnectorAgentSessionsForConversation(
  filePath: string,
  lookup: Pick<ChannelConnectorAgentSessionLookup, "bindingId" | "sessionKey">,
): number {
  const state = readChannelConnectorAgentSessions(filePath);
  let deleted = 0;
  for (const [id, record] of Object.entries(state.sessions)) {
    if (record.bindingId === lookup.bindingId && record.sessionKey === lookup.sessionKey) {
      delete state.sessions[id];
      deleted += 1;
    }
  }
  if (deleted > 0) writeChannelConnectorAgentSessions(filePath, state);
  return deleted;
}
