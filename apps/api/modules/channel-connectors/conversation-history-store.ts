import fs from "node:fs";
import path from "node:path";
import type {
  ChannelConnectorInboundAttachment,
} from "../../../../types/channel-connectors.js";

export type ChannelConnectorConversationHistoryRole = "user" | "assistant";

export interface ChannelConnectorConversationHistoryEntry {
  id: string;
  bindingId: string;
  sessionKey: string;
  messageId: string | null;
  role: ChannelConnectorConversationHistoryRole;
  text: string | null;
  attachmentSummaries: string[];
  status: string | null;
  createdAt: string;
}

export interface ChannelConnectorConversationHistoryState {
  version: 1;
  updatedAt: string;
  entries: ChannelConnectorConversationHistoryEntry[];
}

export interface ChannelConnectorConversationHistoryLookup {
  bindingId: string;
  sessionKey: string;
}

export interface ChannelConnectorConversationHistoryAppendInput extends ChannelConnectorConversationHistoryLookup {
  messageId?: string | null;
  role: ChannelConnectorConversationHistoryRole;
  text?: string | null;
  attachments?: ChannelConnectorInboundAttachment[] | null;
  status?: string | null;
  now?: Date;
  maxEntriesPerConversation?: number;
}

const DEFAULT_HISTORY_ENTRIES_PER_CONVERSATION = 12;
const DEFAULT_HISTORY_CONTEXT_LIMIT = 8;
const MAX_GLOBAL_HISTORY_ENTRIES = 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function historyEntryId(input: {
  bindingId: string;
  sessionKey: string;
  messageId: string | null;
  role: ChannelConnectorConversationHistoryRole;
  createdAt: string;
}): string {
  return [
    input.bindingId,
    input.sessionKey,
    input.messageId || input.createdAt,
    input.role,
  ].map((part) => encodeKeyPart(part)).join("|");
}

function emptyState(): ChannelConnectorConversationHistoryState {
  return {
    version: 1,
    updatedAt: nowIso(),
    entries: [],
  };
}

function truncateText(value: string, maxLength = 500): string {
  const normalized = normalizeString(value).replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function attachmentSummary(attachment: ChannelConnectorInboundAttachment): string {
  const parts = [
    attachment.kind,
    normalizeString(attachment.fileName),
    typeof attachment.size === "number" && attachment.size > 0 ? `${attachment.size} bytes` : "",
    typeof attachment.durationMs === "number" && attachment.durationMs > 0 ? `${Math.round(attachment.durationMs / 1000)}s` : "",
    normalizeString(attachment.localPath) ? `local: ${normalizeString(attachment.localPath)}` : "",
    normalizeString(attachment.stagingError) ? `staging failed: ${normalizeString(attachment.stagingError)}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function normalizeEntry(value: unknown, fallbackId: string): ChannelConnectorConversationHistoryEntry | null {
  if (!isRecord(value)) return null;
  const bindingId = normalizeString(value.bindingId);
  const sessionKey = normalizeString(value.sessionKey);
  const role = normalizeString(value.role) as ChannelConnectorConversationHistoryRole;
  if (!bindingId || !sessionKey || (role !== "user" && role !== "assistant")) return null;
  const attachmentSummaries = Array.isArray(value.attachmentSummaries)
    ? value.attachmentSummaries.map((item) => truncateText(normalizeString(item), 240)).filter(Boolean)
    : [];
  return {
    id: normalizeString(value.id) || fallbackId,
    bindingId,
    sessionKey,
    messageId: normalizeString(value.messageId) || null,
    role,
    text: truncateText(normalizeString(value.text)) || null,
    attachmentSummaries,
    status: normalizeString(value.status) || null,
    createdAt: normalizeString(value.createdAt) || nowIso(),
  };
}

export function readChannelConnectorConversationHistory(filePath: string): ChannelConnectorConversationHistoryState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !Array.isArray(raw.entries)) return emptyState();
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      entries: raw.entries
        .map((entry, index) => normalizeEntry(entry, `entry-${index}`))
        .filter((entry): entry is ChannelConnectorConversationHistoryEntry => Boolean(entry)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export function writeChannelConnectorConversationHistory(
  filePath: string,
  state: ChannelConnectorConversationHistoryState,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = {
    version: 1 as const,
    updatedAt: nowIso(),
    entries: state.entries.slice(-MAX_GLOBAL_HISTORY_ENTRIES),
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function getChannelConnectorConversationHistory(
  filePath: string,
  lookup: ChannelConnectorConversationHistoryLookup,
  limit = DEFAULT_HISTORY_CONTEXT_LIMIT,
): ChannelConnectorConversationHistoryEntry[] {
  const state = readChannelConnectorConversationHistory(filePath);
  return state.entries
    .filter((entry) => entry.bindingId === lookup.bindingId && entry.sessionKey === lookup.sessionKey)
    .slice(-Math.max(0, limit));
}

export function appendChannelConnectorConversationHistory(
  filePath: string,
  input: ChannelConnectorConversationHistoryAppendInput,
): ChannelConnectorConversationHistoryEntry {
  const state = readChannelConnectorConversationHistory(filePath);
  const createdAt = (input.now || new Date()).toISOString();
  const messageId = normalizeString(input.messageId) || null;
  const entry: ChannelConnectorConversationHistoryEntry = {
    id: historyEntryId({
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId,
      role: input.role,
      createdAt,
    }),
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
    messageId,
    role: input.role,
    text: truncateText(normalizeString(input.text)) || null,
    attachmentSummaries: (input.attachments || []).map(attachmentSummary).filter(Boolean),
    status: normalizeString(input.status) || null,
    createdAt,
  };
  const maxEntries = Math.max(2, input.maxEntriesPerConversation || DEFAULT_HISTORY_ENTRIES_PER_CONVERSATION);
  const sameConversation = (candidate: ChannelConnectorConversationHistoryEntry) => (
    candidate.bindingId === input.bindingId && candidate.sessionKey === input.sessionKey
  );
  const retained = state.entries.filter((candidate) => candidate.id !== entry.id);
  const conversation = retained.filter(sameConversation).concat(entry).slice(-maxEntries);
  const others = retained.filter((candidate) => !sameConversation(candidate));
  state.entries = others.concat(conversation).slice(-MAX_GLOBAL_HISTORY_ENTRIES);
  writeChannelConnectorConversationHistory(filePath, state);
  return entry;
}

export function clearChannelConnectorConversationHistory(
  filePath: string,
  lookup: ChannelConnectorConversationHistoryLookup,
): number {
  const state = readChannelConnectorConversationHistory(filePath);
  const before = state.entries.length;
  state.entries = state.entries.filter((entry) => (
    entry.bindingId !== lookup.bindingId || entry.sessionKey !== lookup.sessionKey
  ));
  const deleted = before - state.entries.length;
  if (deleted > 0) writeChannelConnectorConversationHistory(filePath, state);
  return deleted;
}

export function renderChannelConnectorConversationHistoryContext(
  entries: ChannelConnectorConversationHistoryEntry[],
): string | null {
  const visible = entries.slice(-DEFAULT_HISTORY_CONTEXT_LIMIT);
  if (!visible.length) return null;
  const lines = [
    "[Studio IM history context]",
    "Recent messages in this IM session before the current turn:",
  ];
  for (const [index, entry] of visible.entries()) {
    const role = entry.role === "assistant" ? "assistant" : "user";
    const status = entry.status ? ` (${entry.status})` : "";
    const text = truncateText(entry.text || "", 320) || "(no text)";
    const attachments = entry.attachmentSummaries.length
      ? ` attachments: ${entry.attachmentSummaries.join("; ")}`
      : "";
    lines.push(`${index + 1}. ${role}${status}: ${text}${attachments}`);
  }
  lines.push("Use this as session context only. The current user message follows after this block.");
  return lines.join("\n");
}
