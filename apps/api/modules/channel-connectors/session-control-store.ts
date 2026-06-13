import fs from "node:fs";
import path from "node:path";
import type {
  ChannelConnectorPermissionMode,
  ChannelConnectorReasoningEffort,
} from "../../../../types/channel-connectors.js";

export interface ChannelConnectorSessionControlRecord {
  id: string;
  bindingId: string;
  sessionKey: string;
  activeProjectId: string | null;
  sessionName: string | null;
  model: string | null;
  reasoningEffort: ChannelConnectorReasoningEffort | null;
  permissionMode: ChannelConnectorPermissionMode | null;
  workDir: string | null;
  workDirHistory: string[];
  thinkingMessages: boolean | null;
  processMessages: boolean | null;
  toolMessages: boolean | null;
  autoVisionModel: boolean | null;
  visionModel: string | null;
  createdAt: string;
  updatedAt: string;
  lastCommand: string | null;
}

export interface ChannelConnectorSessionControlState {
  version: 2;
  updatedAt: string;
  controls: Record<string, ChannelConnectorSessionControlRecord>;
}

export interface ChannelConnectorSessionControlLookup {
  bindingId: string;
  sessionKey: string;
}

export interface ChannelConnectorSessionControlUpdate extends ChannelConnectorSessionControlLookup {
  activeProjectId?: string | null;
  sessionName?: string | null;
  model?: string | null;
  reasoningEffort?: ChannelConnectorReasoningEffort | null;
  permissionMode?: ChannelConnectorPermissionMode | null;
  workDir?: string | null;
  workDirHistory?: string[] | null;
  thinkingMessages?: boolean | null;
  processMessages?: boolean | null;
  toolMessages?: boolean | null;
  autoVisionModel?: boolean | null;
  visionModel?: string | null;
  lastCommand?: string | null;
  now?: Date;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function channelConnectorSessionControlId(input: ChannelConnectorSessionControlLookup): string {
  return [input.bindingId, input.sessionKey].map((part) => encodeKeyPart(part)).join("|");
}

function emptyState(): ChannelConnectorSessionControlState {
  return {
    version: 2,
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
    if (!isRecord(raw) || raw.version !== 2 || !isRecord(raw.controls)) return emptyState();
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
        sessionName: normalizeString(value.sessionName) || null,
        model: normalizeString(value.model) || null,
        reasoningEffort: normalizeString(value.reasoningEffort) as ChannelConnectorReasoningEffort || null,
        permissionMode: normalizeString(value.permissionMode) as ChannelConnectorPermissionMode || null,
        workDir: normalizeString(value.workDir) || null,
        workDirHistory: normalizeStringArray(value.workDirHistory),
        thinkingMessages: typeof value.thinkingMessages === "boolean" ? value.thinkingMessages : null,
        processMessages: typeof value.processMessages === "boolean" ? value.processMessages : null,
        toolMessages: typeof value.toolMessages === "boolean" ? value.toolMessages : null,
        autoVisionModel: typeof value.autoVisionModel === "boolean" ? value.autoVisionModel : null,
        visionModel: normalizeString(value.visionModel) || null,
        createdAt: normalizeString(value.createdAt) || nowIso(),
        updatedAt: normalizeString(value.updatedAt) || nowIso(),
        lastCommand: normalizeString(value.lastCommand) || null,
      };
    }
    return {
      version: 2,
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
    version: 2 as const,
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
    sessionName: update.sessionName === undefined
      ? current?.sessionName || null
      : normalizeString(update.sessionName) || null,
    model: update.model === undefined ? current?.model || null : normalizeString(update.model) || null,
    reasoningEffort: update.reasoningEffort === undefined
      ? current?.reasoningEffort || null
      : update.reasoningEffort || null,
    permissionMode: update.permissionMode === undefined
      ? current?.permissionMode || null
      : update.permissionMode || null,
    workDir: update.workDir === undefined ? current?.workDir || null : normalizeString(update.workDir) || null,
    workDirHistory: update.workDirHistory === undefined
      ? current?.workDirHistory || []
      : normalizeStringArray(update.workDirHistory),
    thinkingMessages: update.thinkingMessages === undefined
      ? current?.thinkingMessages ?? null
      : typeof update.thinkingMessages === "boolean" ? update.thinkingMessages : null,
    processMessages: update.processMessages === undefined
      ? current?.processMessages ?? null
      : typeof update.processMessages === "boolean" ? update.processMessages : null,
    toolMessages: update.toolMessages === undefined
      ? current?.toolMessages ?? null
      : typeof update.toolMessages === "boolean" ? update.toolMessages : null,
    autoVisionModel: update.autoVisionModel === undefined
      ? current?.autoVisionModel ?? null
      : typeof update.autoVisionModel === "boolean" ? update.autoVisionModel : null,
    visionModel: update.visionModel === undefined ? current?.visionModel || null : normalizeString(update.visionModel) || null,
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
