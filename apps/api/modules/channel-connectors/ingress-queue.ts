import fs from "node:fs";
import path from "node:path";

import type { ChannelConnectorIngressEnvelope } from "../../../../types/channel-connectors.js";
import { channelConnectorIngressDedupeKey } from "./ingress-envelope.js";

type IngressRecordStatus = "accepted" | "running" | "completed" | "failed";

interface IngressRecord {
  key: string;
  accountId: string;
  platform: ChannelConnectorIngressEnvelope["platform"];
  eventId: string;
  messageId: string | null;
  status: IngressRecordStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  duplicateCount: number;
  lastError: string | null;
}

interface IngressState {
  version: 1;
  updatedAt: string;
  records: Record<string, IngressRecord>;
}

export interface ChannelConnectorIngressQueueResult {
  accepted: boolean;
  duplicate: boolean;
  reason: "accepted" | "duplicate" | "queue_full";
  key: string;
}

export interface ChannelConnectorIngressQueueStatus {
  activeAccounts: number;
  queued: number;
  completed: number;
  failed: number;
  duplicates: number;
}

interface QueueEntry {
  envelope: ChannelConnectorIngressEnvelope;
  key: string;
  task: () => Promise<void>;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function emptyState(): IngressState {
  return { version: 1, updatedAt: nowIso(), records: {} };
}

function readState(filePath: string): IngressState {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as IngressState;
    return parsed?.version === 1 && parsed.records && typeof parsed.records === "object"
      ? parsed
      : emptyState();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

function writeState(filePath: string, state: IngressState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify({ ...state, updatedAt: nowIso() }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tempPath, filePath);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message || error.name : String(error || "Ingress task failed.");
}

export class ChannelConnectorIngressQueue {
  private readonly queues = new Map<string, QueueEntry[]>();
  private readonly activeByAccount = new Map<string, number>();

  constructor(
    private readonly filePath: string,
    private readonly options: {
      queueLimit?: number;
      ttlMs?: number;
      maxRecords?: number;
      maxConcurrentPerAccount?: number;
    } = {},
  ) {
    const state = readState(filePath);
    let recovered = false;
    for (const record of Object.values(state.records)) {
      if (record.status === "accepted" || record.status === "running") {
        record.status = "failed";
        record.lastError = "Daemon stopped before ingress processing completed.";
        recovered = true;
      }
    }
    if (recovered) writeState(filePath, state);
  }

  enqueue(
    envelope: ChannelConnectorIngressEnvelope,
    task: () => Promise<void>,
    now = new Date(),
  ): ChannelConnectorIngressQueueResult {
    const key = channelConnectorIngressDedupeKey(envelope);
    const state = readState(this.filePath);
    this.prune(state, now);
    const existing = state.records[key];
    if (existing && existing.status !== "failed") {
      existing.lastSeenAt = nowIso(now);
      existing.duplicateCount += 1;
      writeState(this.filePath, state);
      return { accepted: false, duplicate: true, reason: "duplicate", key };
    }
    const queue = this.queues.get(envelope.accountId) || [];
    const limit = Math.max(1, Math.floor(this.options.queueLimit || 100));
    if (queue.length >= limit) {
      return { accepted: false, duplicate: false, reason: "queue_full", key };
    }
    state.records[key] = {
      key,
      accountId: envelope.accountId,
      platform: envelope.platform,
      eventId: envelope.eventId,
      messageId: envelope.messageId,
      status: "accepted",
      firstSeenAt: existing?.firstSeenAt || nowIso(now),
      lastSeenAt: nowIso(now),
      duplicateCount: existing?.duplicateCount || 0,
      lastError: null,
    };
    writeState(this.filePath, state);
    queue.push({ envelope, key, task });
    this.queues.set(envelope.accountId, queue);
    this.pump(envelope.accountId);
    return { accepted: true, duplicate: false, reason: "accepted", key };
  }

  status(): ChannelConnectorIngressQueueStatus {
    const records = Object.values(readState(this.filePath).records);
    return {
      activeAccounts: this.activeByAccount.size,
      queued: [...this.queues.values()].reduce((sum, queue) => sum + queue.length, 0),
      completed: records.filter((record) => record.status === "completed").length,
      failed: records.filter((record) => record.status === "failed").length,
      duplicates: records.reduce((sum, record) => sum + record.duplicateCount, 0),
    };
  }

  private pump(accountId: string): void {
    const queue = this.queues.get(accountId);
    const limit = Math.max(1, Math.floor(this.options.maxConcurrentPerAccount || 4));
    let active = this.activeByAccount.get(accountId) || 0;
    while (active < limit) {
      const entry = queue?.shift();
      if (!entry) break;
      active += 1;
      this.activeByAccount.set(accountId, active);
      this.mark(entry.key, "running", null);
      void entry.task().then(() => {
        this.mark(entry.key, "completed", null);
      }).catch((error) => {
        this.mark(entry.key, "failed", errorMessage(error));
      }).finally(() => {
        const remaining = Math.max(0, (this.activeByAccount.get(accountId) || 1) - 1);
        if (remaining === 0) this.activeByAccount.delete(accountId);
        else this.activeByAccount.set(accountId, remaining);
        if (queue?.length === 0) this.queues.delete(accountId);
        this.pump(accountId);
      });
    }
  }

  private mark(key: string, status: IngressRecordStatus, lastError: string | null): void {
    const state = readState(this.filePath);
    const record = state.records[key];
    if (!record) return;
    record.status = status;
    record.lastSeenAt = nowIso();
    record.lastError = lastError;
    writeState(this.filePath, state);
  }

  private prune(state: IngressState, now: Date): void {
    const ttlMs = Math.max(60_000, this.options.ttlMs || 24 * 60 * 60_000);
    const cutoff = now.getTime() - ttlMs;
    for (const [key, record] of Object.entries(state.records)) {
      if (Date.parse(record.lastSeenAt) < cutoff) delete state.records[key];
    }
    const maxRecords = Math.max(100, this.options.maxRecords || 10_000);
    const records = Object.values(state.records).sort((left, right) => (
      right.lastSeenAt.localeCompare(left.lastSeenAt)
    ));
    for (const record of records.slice(maxRecords)) delete state.records[record.key];
  }
}

export function createChannelConnectorIngressQueue(
  filePath: string,
  options?: {
    queueLimit?: number;
    ttlMs?: number;
    maxRecords?: number;
    maxConcurrentPerAccount?: number;
  },
): ChannelConnectorIngressQueue {
  return new ChannelConnectorIngressQueue(filePath, options);
}
