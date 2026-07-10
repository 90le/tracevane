import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ChannelConnectorReplyOutboxStatus =
  | "pending"
  | "sending"
  | "delivered"
  | "dead-letter";

export interface ChannelConnectorReplyOutboxRecord {
  id: string;
  platform: "octo" | "feishu";
  accountId: string;
  bindingId: string;
  sourceMessageId: string;
  destinationId: string;
  destinationType: 1 | 2 | 5 | null;
  replyToMessageId: string | null;
  text: string;
  status: ChannelConnectorReplyOutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  platformMessageId: string | null;
  lastError: string | null;
}

export interface ChannelConnectorReplyOutboxState {
  version: 2;
  updatedAt: string;
  records: Record<string, ChannelConnectorReplyOutboxRecord>;
}

export interface ChannelConnectorReplyOutboxInput {
  platform: "octo" | "feishu";
  accountId: string;
  bindingId: string;
  sourceMessageId: string;
  destinationId: string;
  destinationType?: 1 | 2 | 5 | null;
  replyToMessageId?: string | null;
  text: string;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyState(): ChannelConnectorReplyOutboxState {
  return { version: 2, updatedAt: nowIso(), records: {} };
}

function normalizeDestinationType(value: unknown): 1 | 2 | 5 | null {
  return value === 1 || value === 2 || value === 5 ? value : null;
}

export function channelConnectorReplyOutboxId(input: ChannelConnectorReplyOutboxInput): string {
  const fingerprintParts: Array<string | number> = [
    input.platform,
    input.accountId,
    input.bindingId,
    input.sourceMessageId,
    input.destinationId,
    input.replyToMessageId || "",
    input.text,
  ];
  const destinationType = normalizeDestinationType(input.destinationType);
  if (destinationType !== null) fingerprintParts.push(destinationType);
  const fingerprint = JSON.stringify(fingerprintParts);
  return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
}

export function readChannelConnectorReplyOutbox(filePath: string): ChannelConnectorReplyOutboxState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.records)) return emptyState();
    const records: Record<string, ChannelConnectorReplyOutboxRecord> = {};
    for (const [key, value] of Object.entries(raw.records)) {
      if (!isRecord(value)) continue;
      const id = normalizeString(value.id) || key;
      const platform = value.platform === "feishu" ? "feishu" : value.platform === "octo" ? "octo" : null;
      const accountId = normalizeString(value.accountId);
      const bindingId = normalizeString(value.bindingId);
      const sourceMessageId = normalizeString(value.sourceMessageId);
      const destinationId = normalizeString(value.destinationId);
      const text = typeof value.text === "string" ? value.text : "";
      if (!id || !platform || !accountId || !bindingId || !sourceMessageId || !destinationId || !text) continue;
      const status: ChannelConnectorReplyOutboxStatus = value.status === "sending"
        || value.status === "delivered"
        || value.status === "dead-letter"
        ? value.status
        : "pending";
      records[id] = {
        id,
        platform,
        accountId,
        bindingId,
        sourceMessageId,
        destinationId,
        destinationType: normalizeDestinationType(value.destinationType),
        replyToMessageId: normalizeString(value.replyToMessageId) || null,
        text,
        status: status === "sending" ? "pending" : status,
        attempts: Number.isFinite(Number(value.attempts)) ? Math.max(0, Number(value.attempts)) : 0,
        createdAt: normalizeString(value.createdAt) || nowIso(),
        updatedAt: normalizeString(value.updatedAt) || nowIso(),
        nextAttemptAt: normalizeString(value.nextAttemptAt) || null,
        deliveredAt: normalizeString(value.deliveredAt) || null,
        platformMessageId: normalizeString(value.platformMessageId) || null,
        lastError: normalizeString(value.lastError) || null,
      };
    }
    return {
      version: 2,
      updatedAt: normalizeString(raw.updatedAt) || nowIso(),
      records,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export function writeChannelConnectorReplyOutbox(
  filePath: string,
  state: ChannelConnectorReplyOutboxState,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const next: ChannelConnectorReplyOutboxState = {
    version: 2,
    updatedAt: nowIso(),
    records: state.records,
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function enqueueChannelConnectorReply(
  filePath: string,
  input: ChannelConnectorReplyOutboxInput,
  now = new Date(),
): ChannelConnectorReplyOutboxRecord {
  const state = readChannelConnectorReplyOutbox(filePath);
  const id = channelConnectorReplyOutboxId(input);
  const existing = state.records[id];
  if (existing) return existing;
  const checkedAt = nowIso(now);
  const record: ChannelConnectorReplyOutboxRecord = {
    id,
    platform: input.platform,
    accountId: input.accountId,
    bindingId: input.bindingId,
    sourceMessageId: input.sourceMessageId,
    destinationId: input.destinationId,
    destinationType: normalizeDestinationType(input.destinationType),
    replyToMessageId: normalizeString(input.replyToMessageId) || null,
    text: input.text,
    status: "pending",
    attempts: 0,
    createdAt: checkedAt,
    updatedAt: checkedAt,
    nextAttemptAt: checkedAt,
    deliveredAt: null,
    platformMessageId: null,
    lastError: null,
  };
  state.records[id] = record;
  writeChannelConnectorReplyOutbox(filePath, state);
  return record;
}

export function markChannelConnectorReplySending(
  filePath: string,
  id: string,
  now = new Date(),
): ChannelConnectorReplyOutboxRecord | null {
  const state = readChannelConnectorReplyOutbox(filePath);
  const record = state.records[id];
  if (!record || record.status === "delivered" || record.status === "dead-letter") return record || null;
  const next = {
    ...record,
    status: "sending" as const,
    attempts: record.attempts + 1,
    updatedAt: nowIso(now),
    nextAttemptAt: null,
  };
  state.records[id] = next;
  writeChannelConnectorReplyOutbox(filePath, state);
  return next;
}

export function markChannelConnectorReplyDelivered(
  filePath: string,
  id: string,
  platformMessageId: string | null,
  now = new Date(),
): ChannelConnectorReplyOutboxRecord | null {
  const state = readChannelConnectorReplyOutbox(filePath);
  const record = state.records[id];
  if (!record) return null;
  const checkedAt = nowIso(now);
  const next = {
    ...record,
    status: "delivered" as const,
    updatedAt: checkedAt,
    nextAttemptAt: null,
    deliveredAt: checkedAt,
    platformMessageId: normalizeString(platformMessageId) || null,
    lastError: null,
  };
  state.records[id] = next;
  writeChannelConnectorReplyOutbox(filePath, state);
  return next;
}

export function markChannelConnectorReplyFailed(
  filePath: string,
  id: string,
  error: string,
  options: { retryable?: boolean; now?: Date; maxAttempts?: number } = {},
): ChannelConnectorReplyOutboxRecord | null {
  const state = readChannelConnectorReplyOutbox(filePath);
  const record = state.records[id];
  if (!record) return null;
  const now = options.now || new Date();
  const maxAttempts = Math.max(1, options.maxAttempts || 5);
  const retryable = options.retryable !== false && record.attempts < maxAttempts;
  const delayMs = Math.min(5 * 60_000, 1_000 * (2 ** Math.max(0, record.attempts - 1)));
  const next = {
    ...record,
    status: retryable ? "pending" as const : "dead-letter" as const,
    updatedAt: nowIso(now),
    nextAttemptAt: retryable ? new Date(now.getTime() + delayMs).toISOString() : null,
    lastError: normalizeString(error) || "Reply delivery failed.",
  };
  state.records[id] = next;
  writeChannelConnectorReplyOutbox(filePath, state);
  return next;
}

export function listDueChannelConnectorReplies(
  filePath: string,
  now = new Date(),
): ChannelConnectorReplyOutboxRecord[] {
  const nowMs = now.getTime();
  return Object.values(readChannelConnectorReplyOutbox(filePath).records)
    .filter((record) => record.status === "pending")
    .filter((record) => !record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= nowMs)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
