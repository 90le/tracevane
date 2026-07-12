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
  agentNativeSessionId: string | null;
  codexThreadId: string | null;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageId: string | null;
  lastStatus: string | null;
  accountId?: string | null;
  targetId?: string | null;
  targetRevision?: string | null;
}

export interface ChannelConnectorAgentSessionState {
  version: 3;
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
  agentNativeSessionId?: string | null;
  codexThreadId?: string | null;
  messageId?: string | null;
  status?: string | null;
  name?: string | null;
  now?: Date;
}

export interface ChannelConnectorDeliverySessionUpdate
  extends Omit<ChannelConnectorAgentSessionUpdate, "bindingId" | "projectId" | "agent" | "workDir"> {
  accountId: string;
  targetId: string;
  targetRevision: string;
}

export interface ChannelConnectorDeliverySessionLookup {
  accountId: string;
  targetId: string;
  sessionKey: string;
}

export interface ChannelConnectorDeliverySessionInput
  extends ChannelConnectorDeliverySessionLookup {
  targetRevision: string;
  session: ChannelConnectorAgentSessionLookup;
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
    normalizeString(input.model),
    input.workDir,
  ].map((part) => encodeKeyPart(part)).join("|");
}

export function channelConnectorDeliverySessionId(input: ChannelConnectorDeliverySessionLookup): string {
  return [
    "v3",
    input.accountId,
    input.sessionKey,
    input.targetId,
  ].map((part) => encodeKeyPart(part)).join("|");
}

function emptyState(): ChannelConnectorAgentSessionState {
  return {
    version: 3,
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
      const record: ChannelConnectorAgentSessionRecord = {
        id: recordId,
        name: normalizeString(value.name) || null,
        bindingId,
        projectId,
        sessionKey,
        agent,
        model: normalizeString(value.model) || null,
        workDir,
        agentNativeSessionId: normalizeString(value.agentNativeSessionId) || null,
        codexThreadId: normalizeString(value.codexThreadId) || null,
        turnCount: Number.isFinite(Number(value.turnCount)) ? Math.max(0, Number(value.turnCount)) : 0,
        createdAt: normalizeString(value.createdAt) || nowIso(),
        updatedAt: normalizeString(value.updatedAt) || nowIso(),
        lastMessageId: normalizeString(value.lastMessageId) || null,
        lastStatus: normalizeString(value.lastStatus) || null,
        accountId: normalizeString(value.accountId) || null,
        targetId: normalizeString(value.targetId) || null,
        targetRevision: normalizeString(value.targetRevision) || null,
      };
      const migratedId = channelConnectorAgentSessionId(record);
      const current = sessions[migratedId];
      if (!current || Date.parse(record.updatedAt) >= Date.parse(current.updatedAt)) {
        sessions[migratedId] = { ...record, id: migratedId };
      }
    }
    return {
      version: 3,
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
    version: 3 as const,
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

export function getChannelConnectorAgentSessionByDeliveryIdentity(
  filePath: string,
  lookup: ChannelConnectorDeliverySessionLookup,
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  return Object.values(state.sessions).find((record) => (
    record.accountId === lookup.accountId
      && record.targetId === lookup.targetId
      && record.sessionKey === lookup.sessionKey
  )) || null;
}

export function getChannelConnectorAgentSessionByDeliveryExecutionIdentity(
  filePath: string,
  lookup: ChannelConnectorDeliverySessionLookup & Pick<ChannelConnectorAgentSessionLookup, "agent" | "model" | "workDir">,
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  return Object.values(state.sessions)
    .filter((record) => (
      record.accountId === lookup.accountId
        && record.targetId === lookup.targetId
        && record.sessionKey === lookup.sessionKey
        && record.agent === lookup.agent
        && normalizeString(record.model) === normalizeString(lookup.model)
        && record.workDir === lookup.workDir
    ))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null;
}

export function setChannelConnectorAgentSessionDeliveryIdentity(
  filePath: string,
  input: ChannelConnectorDeliverySessionInput,
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  const sessionId = channelConnectorAgentSessionId(input.session);
  const record = state.sessions[sessionId];
  if (!record) return null;
  const next: ChannelConnectorAgentSessionRecord = {
    ...record,
    accountId: input.accountId,
    targetId: input.targetId,
    targetRevision: input.targetRevision,
    updatedAt: nowIso(),
  };
  state.sessions[sessionId] = next;
  writeChannelConnectorAgentSessions(filePath, state);
  return next;
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
    agentNativeSessionId: normalizeString(update.agentNativeSessionId) || current?.agentNativeSessionId || null,
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

export function updateChannelConnectorAgentSessionDeliveryIdentity(
  filePath: string,
  sessionId: string,
  update: ChannelConnectorDeliverySessionUpdate,
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  const current = state.sessions[sessionId];
  if (!current) return null;
  const now = (update.now || new Date()).toISOString();
  const next: ChannelConnectorAgentSessionRecord = {
    ...current,
    name: update.name === undefined ? current.name : normalizeString(update.name) || null,
    model: update.model,
    agentNativeSessionId: normalizeString(update.agentNativeSessionId) || current.agentNativeSessionId || null,
    codexThreadId: normalizeString(update.codexThreadId) || current.codexThreadId || null,
    turnCount: current.turnCount + 1,
    updatedAt: now,
    lastMessageId: normalizeString(update.messageId) || null,
    lastStatus: normalizeString(update.status) || null,
    accountId: update.accountId,
    targetId: update.targetId,
    targetRevision: update.targetRevision,
  };
  state.sessions[sessionId] = next;
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

export function deleteChannelConnectorAgentSession(
  filePath: string,
  input: Pick<ChannelConnectorAgentSessionLookup, "bindingId" | "sessionKey"> & {
    sessionId: string;
  },
): ChannelConnectorAgentSessionRecord | null {
  const state = readChannelConnectorAgentSessions(filePath);
  const record = state.sessions[input.sessionId];
  if (!record || record.bindingId !== input.bindingId || record.sessionKey !== input.sessionKey) return null;
  delete state.sessions[input.sessionId];
  writeChannelConnectorAgentSessions(filePath, state);
  return record;
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
