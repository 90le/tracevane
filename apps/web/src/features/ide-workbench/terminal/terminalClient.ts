import type {
  TerminalEndResponse,
  TerminalEndBatchResponse,
  TerminalGatewayAttachPayload,
  TerminalSessionDescriptor,
} from "@/features/cli-agents/types";
import { isApiError } from "@/lib/api/errors";
import { createTerminalSession, deleteTerminalSession, endTerminalSession, endTerminalSessions } from "@/lib/api/terminal";

export type WorkbenchTerminalEvent =
  | {
      type: "session";
      sid: string;
      instanceId: string;
      outputSeq: number;
      descriptor?: TerminalSessionDescriptor;
    }
  | { type: "output"; sid: string; seq: number; data: string; emittedAtMs?: number }
  | { type: "closed"; sid: string; reason: "session_ended" | "session_exited" }
  | { type: "error"; sid?: string; message: string }
  | { type: "reset"; sid: string; instanceId: string; reason: "session_recreated" | "backlog_gap" }
  | { type: "clear"; sid: string; instanceId: string; clearedThroughSeq: number }
  | { type: "pong" };

export interface CreateWorkbenchTerminalOptions {
  rootId: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  sessionId?: string;
  title?: string | null;
  profileId?: string | null;
  shell?: string | null;
  resume?: boolean;
}

declare global {
  interface Window {
    __TRACEVANE_RUNTIME__?: {
      webSocketBasePath?: string;
      realtimeTransport?: string;
      features?: { terminalRealtime?: boolean };
    };
  }
}

export function createWorkbenchTerminalSession(
  options: CreateWorkbenchTerminalOptions,
): Promise<TerminalSessionDescriptor> {
  const payload: TerminalGatewayAttachPayload = {
    sid: normalizeTerminalSessionId(options.sessionId) || `ide-terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    rootId: options.rootId,
    workspaceId: options.rootId,
    title: normalizeTerminalTitle(options.title),
    cwd: normalizeRelativeCwd(options.cwd),
    profileId: normalizeProfileId(options.profileId),
    shell: normalizeShellName(options.shell),
    targetKind: "local",
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    pinned: true,
    resume: options.resume === true,
  };
  return createTerminalSession(payload);
}

export interface EndWorkbenchTerminalSessionOptions {
  attempts?: number;
  retryDelayMs?: number;
  queueOnFailure?: boolean;
}

const PENDING_TERMINAL_KILL_KEY = "tracevane.ide.pending-terminal-kills.v1";
const PENDING_TERMINAL_KILL_CONCURRENCY = 6;
let pendingKillFlushTimer: number | null = null;
let pendingKillFlushDueAt = 0;
let pendingKillFlushPromise: Promise<void> | null = null;
let pendingKillMemoryFallback = new Set<string>();

export async function endWorkbenchTerminalSession(
  sessionId: string,
  options: EndWorkbenchTerminalSessionOptions = {},
): Promise<TerminalEndResponse> {
  const sid = normalizeTerminalSessionId(sessionId);
  if (!sid) throw new Error("terminal session id is required");
  try {
    return await endTerminalSessionWithRetries(sid, options);
  } catch (error) {
    if (options.queueOnFailure !== false) {
      enqueuePendingTerminalKill(sid);
      schedulePendingTerminalKillFlush(options.retryDelayMs ?? 1_500);
    }
    throw error;
  }
}


export interface EndWorkbenchTerminalSessionsResult {
  requested: number;
  ended: number;
  failed: number;
  results: TerminalEndResponse[];
}

export async function endWorkbenchTerminalSessions(
  sessionIds: string[],
  options: EndWorkbenchTerminalSessionOptions = {},
): Promise<EndWorkbenchTerminalSessionsResult> {
  const sids = [...new Set(sessionIds.map((sessionId) => normalizeTerminalSessionId(sessionId)).filter(Boolean))];
  if (!sids.length) return { requested: 0, ended: 0, failed: 0, results: [] };
  try {
    const batch = await endTerminalSessions(sids);
    const endedIds = endedTerminalIdsFromBatch(batch);
    const failedIds = sids.filter((sid) => !endedIds.has(sid));
    await deleteEndedTerminalDescriptors(Array.from(endedIds), options.retryDelayMs ?? 500);
    if (failedIds.length && options.queueOnFailure !== false) {
      for (const sid of failedIds) enqueuePendingTerminalKill(sid);
      schedulePendingTerminalKillFlush(options.retryDelayMs ?? 1_500);
    }
    return summarizeBatchEndResult(batch, sids.length);
  } catch (error) {
    if (options.queueOnFailure !== false) {
      for (const sid of sids) enqueuePendingTerminalKill(sid);
      schedulePendingTerminalKillFlush(options.retryDelayMs ?? 1_500);
    }
    throw error;
  }
}

export function schedulePendingTerminalKillFlush(delayMs = 1_500): void {
  if (typeof window === "undefined") return;
  const normalizedDelayMs = Math.max(250, delayMs);
  const dueAt = Date.now() + normalizedDelayMs;
  if (pendingKillFlushTimer !== null) {
    if (pendingKillFlushDueAt && pendingKillFlushDueAt <= dueAt) return;
    window.clearTimeout(pendingKillFlushTimer);
  }
  pendingKillFlushDueAt = dueAt;
  pendingKillFlushTimer = window.setTimeout(() => {
    pendingKillFlushTimer = null;
    pendingKillFlushDueAt = 0;
    void flushPendingTerminalKillRetries();
  }, normalizedDelayMs);
}

export function isTerminalKillPending(sessionId: string): boolean {
  const sid = normalizeTerminalSessionId(sessionId);
  if (!sid) return false;
  return getPendingTerminalKillIds().has(sid);
}

export function getPendingTerminalKillIds(): Set<string> {
  return new Set(readPendingTerminalKills());
}

export async function flushPendingTerminalKillRetries(): Promise<void> {
  if (pendingKillFlushPromise) return pendingKillFlushPromise;
  pendingKillFlushPromise = flushPendingTerminalKillRetriesOnce().finally(() => {
    pendingKillFlushPromise = null;
  });
  return pendingKillFlushPromise;
}

async function flushPendingTerminalKillRetriesOnce(): Promise<void> {
  const pending = readPendingTerminalKills();
  if (!pending.length) return;
  const flushing = new Set(pending);
  const results = await runWithConcurrency(pending, PENDING_TERMINAL_KILL_CONCURRENCY, async (sid) => {
    try {
      await endTerminalSessionWithRetries(sid, { attempts: 2, retryDelayMs: 750 });
      return { sid, failed: false };
    } catch {
      return { sid, failed: true };
    }
  });
  const newlyQueued = readPendingTerminalKills().filter((sid) => !flushing.has(sid));
  const remaining = [
    ...results.filter((result) => result.failed).map((result) => result.sid),
    ...newlyQueued,
  ];
  writePendingTerminalKills(remaining);
  if (remaining.length) schedulePendingTerminalKillFlush(5_000);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function endTerminalSessionWithRetries(
  sid: string,
  options: Pick<EndWorkbenchTerminalSessionOptions, "attempts" | "retryDelayMs">,
): Promise<TerminalEndResponse> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = Math.max(100, options.retryDelayMs ?? 500);
  let lastError: unknown = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const result = await endTerminalSession({ sid });
      await deleteEndedTerminalDescriptor(sid, retryDelayMs);
      return result;
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        await delay(retryDelayMs * (index + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("terminal session kill failed");
}


async function deleteEndedTerminalDescriptors(sids: string[], retryDelayMs: number): Promise<void> {
  const results = await runWithConcurrency(sids, PENDING_TERMINAL_KILL_CONCURRENCY, async (sid) => {
    try {
      await deleteEndedTerminalDescriptor(sid, retryDelayMs);
      return { sid, failed: false };
    } catch {
      return { sid, failed: true };
    }
  });
  const failed = results.filter((result) => result.failed).map((result) => result.sid);
  if (failed.length) {
    for (const sid of failed) enqueuePendingTerminalKill(sid);
    schedulePendingTerminalKillFlush(Math.max(750, retryDelayMs));
  }
}

function endedTerminalIdsFromBatch(batch: TerminalEndBatchResponse): Set<string> {
  const results = Array.isArray(batch.results) ? batch.results : [];
  return new Set(results
    .filter((result) => result && result.ended)
    .map((result) => normalizeTerminalSessionId(result.sid))
    .filter(Boolean));
}

function summarizeBatchEndResult(
  batch: TerminalEndBatchResponse,
  requested: number,
): EndWorkbenchTerminalSessionsResult {
  const results = Array.isArray(batch.results) ? batch.results : [];
  const confirmedEnded = results.filter((result) => result.ended).length;
  const ended = results.length ? confirmedEnded : (Number.isFinite(batch.ended) ? batch.ended : 0);
  return {
    requested,
    ended,
    failed: Math.max(0, requested - ended),
    results,
  };
}

async function deleteEndedTerminalDescriptor(sid: string, retryDelayMs: number): Promise<void> {
  let lastConflict: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await deleteTerminalSession(sid);
      return;
    } catch (error) {
      if (isApiError(error) && error.status === 404) return;
      if (isApiError(error) && error.status === 409) {
        lastConflict = error;
        if (attempt < 2) {
          await delay(Math.max(100, retryDelayMs) * (attempt + 1));
          continue;
        }
      }
      throw error;
    }
  }
  throw lastConflict instanceof Error ? lastConflict : new Error("terminal descriptor delete conflict");
}

function enqueuePendingTerminalKill(sessionId: string): void {
  if (typeof window === "undefined") return;
  const sid = normalizeTerminalSessionId(sessionId);
  if (!sid) return;
  writePendingTerminalKills([...new Set([...readPendingTerminalKills(), sid])]);
}

function readPendingTerminalKills(): string[] {
  const fallback = Array.from(pendingKillMemoryFallback);
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_TERMINAL_KILL_KEY) || "[]") as unknown;
    const persisted = Array.isArray(parsed)
      ? [...new Set(parsed.map((item) => normalizeTerminalSessionId(String(item || ""))).filter(Boolean))]
      : [];
    return [...new Set([...persisted, ...fallback])];
  } catch {
    return fallback;
  }
}

function writePendingTerminalKills(sessionIds: string[]): void {
  const normalized = [...new Set(sessionIds.map((sid) => normalizeTerminalSessionId(sid)).filter(Boolean))];
  pendingKillMemoryFallback = new Set(normalized);
  if (typeof window === "undefined") return;
  try {
    if (!normalized.length) {
      window.localStorage.removeItem(PENDING_TERMINAL_KILL_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_TERMINAL_KILL_KEY, JSON.stringify(normalized));
  } catch {
    // Browser storage may be unavailable, full, or disabled. Losing the local
    // retry marker is less harmful than breaking the explicit close path.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function createTerminalWebSocketUrl(
  sessionId: string,
  options: CreateWorkbenchTerminalOptions,
): string {
  const runtime = window.__TRACEVANE_RUNTIME__;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const basePath = normalizeBasePath(runtime?.webSocketBasePath ?? "");
  const params = new URLSearchParams({
    sid: sessionId,
    rootId: options.rootId,
    workspaceId: options.rootId,
    cwd: normalizeRelativeCwd(options.cwd),
    profileId: normalizeProfileId(options.profileId),
    shell: normalizeShellName(options.shell),
    targetKind: "local",
    resume: "1",
    pinned: "1",
  });
  return `${protocol}//${window.location.host}${basePath}/ws/terminal?${params.toString()}`;
}

export function parseTerminalEvent(raw: MessageEvent<string>): WorkbenchTerminalEvent | null {
  try {
    const parsed = JSON.parse(String(raw.data || ""));
    return parsed && typeof parsed === "object" && typeof parsed.type === "string"
      ? (parsed as WorkbenchTerminalEvent)
      : null;
  } catch {
    return null;
  }
}

export function normalizeRelativeCwd(value: string | null | undefined): string {
  const raw = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw || raw === ".") return "";
  if (raw === ".." || raw.startsWith("../")) return "";
  return raw;
}

function normalizeTerminalTitle(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  return raw || null;
}

function normalizeProfileId(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  return raw || "local-shell";
}

function normalizeShellName(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  return raw || "bash";
}

function normalizeBasePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function normalizeTerminalSessionId(value: string | null | undefined): string {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 120);
}
