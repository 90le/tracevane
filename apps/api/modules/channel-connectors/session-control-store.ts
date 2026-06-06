import fs from "node:fs";
import path from "node:path";
import type { ChannelConnectorPermissionMode } from "../../../../types/channel-connectors.js";

export interface ChannelConnectorSessionControlRecord {
  id: string;
  bindingId: string;
  sessionKey: string;
  activeProjectId: string | null;
  model: string | null;
  permissionMode: ChannelConnectorPermissionMode | null;
  createdAt: string;
  updatedAt: string;
  lastCommand: string | null;
}

export interface ChannelConnectorSessionControlState {
  version: 1;
  updatedAt: string;
  controls: Record<string, ChannelConnectorSessionControlRecord>;
}

export interface ChannelConnectorSessionControlLookup {
  bindingId: string;
  sessionKey: string;
}

export interface ChannelConnectorSessionControlUpdate extends ChannelConnectorSessionControlLookup {
  activeProjectId?: string | null;
  model?: string | null;
  permissionMode?: ChannelConnectorPermissionMode | null;
  lastCommand?: string | null;
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

export function channelConnectorSessionControlId(input: ChannelConnectorSessionControlLookup): string {
  return [input.bindingId, input.sessionKey].map((part) => encodeKeyPart(part)).join("|");
}

function emptyState(): ChannelConnectorSessionControlState {
  return {
    version: 1,
    updatedAt: nowIso(),
    controls: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readChannelConnectorSessionControls(filePath: string): ChannelConnectorSessionControlState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.controls)) return emptyState();
    const controls: Record<string, ChannelConnectorSessionControlRecord> = {};
    for (const [id, value] of Object.entries(raw.controls)) {
      if (!isRecord(value)) continue;
      const recordId = normalizeString(value.id) || id;
      const bindingId = normalizeString(value.bindingId);
      const sessionKey = normalizeString(value.sessionKey);
      if (!recordId || !bindingId || !sessionKey) continue;
      controls[recordId] = {
        id: recordId,
        bindingId,
        sessionKey,
        activeProjectId: normalizeString(value.activeProjectId) || null,
        model: normalizeString(value.model) || null,
        permissionMode: normalizeString(value.permissionMode) as ChannelConnectorPermissionMode || null,
        createdAt: normalizeString(value.createdAt) || nowIso(),
        updatedAt: normalizeString(value.updatedAt) || nowIso(),
        lastCommand: normalizeString(value.lastCommand) || null,
      };
    }
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      controls,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export function writeChannelConnectorSessionControls(
  filePath: string,
  state: ChannelConnectorSessionControlState,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = {
    version: 1 as const,
    updatedAt: nowIso(),
    controls: state.controls,
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function getChannelConnectorSessionControl(
  filePath: string,
  lookup: ChannelConnectorSessionControlLookup,
): ChannelConnectorSessionControlRecord | null {
  const state = readChannelConnectorSessionControls(filePath);
  return state.controls[channelConnectorSessionControlId(lookup)] || null;
}

export function upsertChannelConnectorSessionControl(
  filePath: string,
  update: ChannelConnectorSessionControlUpdate,
): ChannelConnectorSessionControlRecord {
  const state = readChannelConnectorSessionControls(filePath);
  const id = channelConnectorSessionControlId(update);
  const now = (update.now || new Date()).toISOString();
  const current = state.controls[id];
  const next: ChannelConnectorSessionControlRecord = {
    id,
    bindingId: update.bindingId,
    sessionKey: update.sessionKey,
    activeProjectId: update.activeProjectId === undefined
      ? current?.activeProjectId || null
      : normalizeString(update.activeProjectId) || null,
    model: update.model === undefined ? current?.model || null : normalizeString(update.model) || null,
    permissionMode: update.permissionMode === undefined
      ? current?.permissionMode || null
      : update.permissionMode || null,
    createdAt: current?.createdAt || now,
    updatedAt: now,
    lastCommand: normalizeString(update.lastCommand) || current?.lastCommand || null,
  };
  state.controls[id] = next;
  writeChannelConnectorSessionControls(filePath, state);
  return next;
}

export function clearChannelConnectorSessionControl(
  filePath: string,
  lookup: ChannelConnectorSessionControlLookup,
): boolean {
  const state = readChannelConnectorSessionControls(filePath);
  const id = channelConnectorSessionControlId(lookup);
  const existed = Boolean(state.controls[id]);
  delete state.controls[id];
  writeChannelConnectorSessionControls(filePath, state);
  return existed;
}
