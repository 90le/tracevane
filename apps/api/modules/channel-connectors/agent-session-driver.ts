import type { ChannelConnectorAgentId, ChannelConnectorPermissionMode } from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorAgentProgressEvent,
  ChannelConnectorAgentTurnRequest,
  ChannelConnectorAgentTurnResult,
} from "./agent-runner.js";

export type ChannelConnectorAgentSessionDriverMode = "one-shot" | "persistent";

export interface ChannelConnectorAgentSessionDriverKeyInput {
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  workDir: string;
  permissionMode?: ChannelConnectorPermissionMode | null;
}

export interface ChannelConnectorAgentSessionDriverTurnInput {
  mode: ChannelConnectorAgentSessionDriverMode;
  key: ChannelConnectorAgentSessionDriverKeyInput;
  messageId: string;
  agentTurnRequest?: ChannelConnectorAgentTurnRequest | null;
  signal?: AbortSignal | null;
  onProgress?: (event: ChannelConnectorAgentProgressEvent) => void;
  fallbackOnCrash?: boolean;
  runOneShot: () => Promise<ChannelConnectorAgentTurnResult>;
}

export interface ChannelConnectorAgentSessionDriverSession {
  id: string;
  runTurn(input: ChannelConnectorAgentSessionDriverTurnInput): Promise<ChannelConnectorAgentTurnResult>;
  stop?(reason: string): Promise<void> | void;
  dispose?(reason: string): Promise<void> | void;
}

export interface ChannelConnectorAgentSessionDriverFactory {
  create(input: ChannelConnectorAgentSessionDriverCreateInput): Promise<ChannelConnectorAgentSessionDriverSession> | ChannelConnectorAgentSessionDriverSession;
}

export interface ChannelConnectorAgentSessionDriverCreateInput {
  key: ChannelConnectorAgentSessionDriverKeyInput;
  poolKey: string;
  turnInput?: ChannelConnectorAgentSessionDriverTurnInput | null;
}

export type ChannelConnectorAgentSessionDriverEventType =
  | "session.created"
  | "session.stopped"
  | "session.killed"
  | "session.disposed"
  | "session.reaped"
  | "turn.started"
  | "turn.finished"
  | "turn.failed"
  | "turn.fallback";

export interface ChannelConnectorAgentSessionDriverEvent {
  checkedAt: string;
  type: ChannelConnectorAgentSessionDriverEventType;
  poolKey: string;
  sessionId: string | null;
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  workDir: string;
  messageId: string | null;
  reason: string | null;
  error: string | null;
}

export interface ChannelConnectorAgentSessionDriverStatus {
  poolKey: string;
  sessionId: string;
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  permissionMode: ChannelConnectorPermissionMode | null;
  workDir: string;
  createdAt: string;
  lastUsedAt: string;
  running: number;
  turnCount: number;
  idleMs: number;
  lastError: string | null;
}

export interface ChannelConnectorAgentSessionDriverPoolOptions {
  factory: ChannelConnectorAgentSessionDriverFactory;
  nowMs?: () => number;
  idleTimeoutMs?: number;
  maxSessions?: number;
  maxConcurrentTurns?: number;
  queueMaxRecords?: number;
  busyStrategy?: "reject" | "queue";
  fallbackOnCrash?: boolean;
  onEvent?: (event: ChannelConnectorAgentSessionDriverEvent) => void;
}

interface ChannelConnectorAgentSessionDriverPoolEntry {
  poolKey: string;
  key: ChannelConnectorAgentSessionDriverKeyInput;
  session: ChannelConnectorAgentSessionDriverSession;
  createdAtMs: number;
  lastUsedAtMs: number;
  running: number;
  turnCount: number;
  lastError: string | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_MAX_SESSIONS = 8;
const DEFAULT_MAX_CONCURRENT_TURNS = 4;
const DEFAULT_QUEUE_MAX_RECORDS = 200;

interface ChannelConnectorAgentSessionDriverTurnSlotWaiter {
  resolve: (slot: { release: () => void }) => void;
  reject: (error: Error) => void;
  signal: AbortSignal | null;
  abort: (() => void) | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function shortError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return normalizeString(error) || "Unknown persistent session driver error.";
}

function dateFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function channelConnectorAgentSessionDriverPoolKey(
  input: ChannelConnectorAgentSessionDriverKeyInput,
): string {
  return [
    input.bindingId,
    input.projectId,
    input.sessionKey,
    input.agent,
    input.model || "",
    input.workDir,
    input.permissionMode || "",
  ].map((part) => encodeKeyPart(part)).join("|");
}

export function resolveChannelConnectorAgentSessionDriverMode(
  metadata: Record<string, unknown> | undefined,
): ChannelConnectorAgentSessionDriverMode {
  const keys = [
    "agentSessionDriver",
    "agent_session_driver",
    "sessionDriver",
    "session_driver",
    "persistentAgentSession",
    "persistent_agent_session",
    "persistentSession",
    "persistent_session",
  ];
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "boolean") return value ? "persistent" : "one-shot";
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized) continue;
    if (["persistent", "persist", "session", "tui", "pty", "1", "true", "yes", "on"].includes(normalized)) {
      return "persistent";
    }
    if (["one-shot", "oneshot", "exec", "process", "0", "false", "no", "off"].includes(normalized)) {
      return "one-shot";
    }
  }
  return "persistent";
}

export class ChannelConnectorAgentSessionDriverPool {
  private readonly factory: ChannelConnectorAgentSessionDriverFactory;
  private readonly nowMs: () => number;
  private idleTimeoutMs: number;
  private maxSessions: number;
  private maxConcurrentTurns: number;
  private queueMaxRecords: number;
  private busyStrategy: "reject" | "queue";
  private fallbackOnCrash: boolean;
  private activeTurns = 0;
  private readonly turnQueue: ChannelConnectorAgentSessionDriverTurnSlotWaiter[] = [];
  private readonly onEvent: ((event: ChannelConnectorAgentSessionDriverEvent) => void) | null;
  private readonly sessions = new Map<string, ChannelConnectorAgentSessionDriverPoolEntry>();

  constructor(options: ChannelConnectorAgentSessionDriverPoolOptions) {
    this.factory = options.factory;
    this.nowMs = options.nowMs || (() => Date.now());
    this.idleTimeoutMs = Number.isFinite(Number(options.idleTimeoutMs))
      ? Math.max(1, Number(options.idleTimeoutMs))
      : DEFAULT_IDLE_TIMEOUT_MS;
    this.maxSessions = Number.isFinite(Number(options.maxSessions))
      ? Math.max(1, Number(options.maxSessions))
      : DEFAULT_MAX_SESSIONS;
    this.maxConcurrentTurns = Number.isFinite(Number(options.maxConcurrentTurns))
      ? Math.max(1, Number(options.maxConcurrentTurns))
      : DEFAULT_MAX_CONCURRENT_TURNS;
    this.queueMaxRecords = Number.isFinite(Number(options.queueMaxRecords))
      ? Math.max(0, Number(options.queueMaxRecords))
      : DEFAULT_QUEUE_MAX_RECORDS;
    this.busyStrategy = options.busyStrategy === "queue" ? "queue" : "reject";
    this.fallbackOnCrash = options.fallbackOnCrash !== false;
    this.onEvent = options.onEvent || null;
  }

  async runTurn(input: ChannelConnectorAgentSessionDriverTurnInput): Promise<ChannelConnectorAgentTurnResult> {
    if (input.mode !== "persistent") return input.runOneShot();
    const turnSlot = await this.acquireTurnSlot(input.signal || null);
    try {
    const poolKey = channelConnectorAgentSessionDriverPoolKey(input.key);
    let entry = this.sessions.get(poolKey);
    if (!entry) {
      await this.reapIdle();
      await this.trimToCapacity();
      let session: ChannelConnectorAgentSessionDriverSession;
      try {
        session = await this.factory.create({ key: input.key, poolKey, turnInput: input });
      } catch (error) {
        const message = shortError(error);
        this.emit("turn.failed", null, {
          key: input.key,
          poolKey,
          sessionId: null,
          messageId: input.messageId,
          reason: "driver-create-error",
          error: message,
        });
        if (!this.shouldRunOneShotFallback(input)) throw error;
        this.emit("turn.fallback", null, {
          key: input.key,
          poolKey,
          sessionId: null,
          messageId: input.messageId,
          reason: "driver-create-error",
          error: message,
        });
        return input.runOneShot();
      }
      const now = this.nowMs();
      entry = {
        poolKey,
        key: input.key,
        session,
        createdAtMs: now,
        lastUsedAtMs: now,
        running: 0,
        turnCount: 0,
        lastError: null,
      };
      this.sessions.set(poolKey, entry);
      this.emit("session.created", entry, {
        sessionId: session.id,
        messageId: null,
        reason: null,
        error: null,
      });
    }
    if (entry.running > 0) {
      const message = "Persistent Agent session already has an active turn.";
      entry.lastError = message;
      this.emit("turn.failed", entry, {
        sessionId: entry.session.id,
        messageId: input.messageId,
        reason: "session-busy",
        error: message,
      });
      throw new Error(message);
    }

    const abortListener = (): void => {
      void entry?.session.stop?.("signal-aborted");
    };
    input.signal?.addEventListener("abort", abortListener, { once: true });
    entry.running += 1;
    entry.lastUsedAtMs = this.nowMs();
    this.emit("turn.started", entry, {
      sessionId: entry.session.id,
      messageId: input.messageId,
      reason: null,
      error: null,
    });
    try {
      const result = await entry.session.runTurn(input);
      entry.turnCount += 1;
      entry.lastError = null;
      entry.lastUsedAtMs = this.nowMs();
      this.emit("turn.finished", entry, {
        sessionId: entry.session.id,
        messageId: input.messageId,
        reason: result.status,
        error: result.error,
      });
      return result;
    } catch (error) {
      const message = shortError(error);
      entry.lastError = message;
      this.emit("turn.failed", entry, {
        sessionId: entry.session.id,
        messageId: input.messageId,
        reason: "driver-error",
        error: message,
      });
      await this.disposeEntry(entry, "driver-error", "session.disposed");
      if (!this.shouldRunOneShotFallback(input)) throw error;
      this.emit("turn.fallback", null, {
        key: input.key,
        poolKey,
        sessionId: null,
        messageId: input.messageId,
        reason: "driver-error",
        error: message,
      });
      return input.runOneShot();
    } finally {
      input.signal?.removeEventListener("abort", abortListener);
      if (entry) entry.running = Math.max(0, entry.running - 1);
    }
    } finally {
      turnSlot.release();
    }
  }

  async stopSession(key: ChannelConnectorAgentSessionDriverKeyInput, reason = "manual-stop"): Promise<{ stopped: boolean; sessionId: string | null }> {
    const poolKey = channelConnectorAgentSessionDriverPoolKey(key);
    const entry = this.sessions.get(poolKey);
    if (!entry) return { stopped: false, sessionId: null };
    await entry.session.stop?.(reason);
    this.emit("session.stopped", entry, {
      sessionId: entry.session.id,
      messageId: null,
      reason,
      error: null,
    });
    return { stopped: true, sessionId: entry.session.id };
  }

  async killSession(key: ChannelConnectorAgentSessionDriverKeyInput, reason = "manual-kill"): Promise<{ killed: boolean; sessionId: string | null }> {
    const poolKey = channelConnectorAgentSessionDriverPoolKey(key);
    return this.killSessionByPoolKey(poolKey, reason);
  }

  async killSessionByPoolKey(poolKey: string, reason = "manual-kill"): Promise<{ killed: boolean; sessionId: string | null }> {
    const entry = this.sessions.get(poolKey);
    if (!entry) return { killed: false, sessionId: null };
    await entry.session.stop?.(reason);
    await this.disposeEntry(entry, reason, "session.killed");
    return { killed: true, sessionId: entry.session.id };
  }

  async reapIdle(nowMs = this.nowMs()): Promise<number> {
    let reaped = 0;
    for (const entry of [...this.sessions.values()]) {
      if (entry.running > 0) continue;
      if (nowMs - entry.lastUsedAtMs < this.idleTimeoutMs) continue;
      await this.disposeEntry(entry, "idle-timeout", "session.reaped");
      reaped += 1;
    }
    return reaped;
  }

  status(nowMs = this.nowMs()): ChannelConnectorAgentSessionDriverStatus[] {
    return [...this.sessions.values()]
      .sort((left, right) => right.lastUsedAtMs - left.lastUsedAtMs || left.poolKey.localeCompare(right.poolKey))
      .map((entry) => ({
        poolKey: entry.poolKey,
        sessionId: entry.session.id,
        bindingId: entry.key.bindingId,
        projectId: entry.key.projectId,
        sessionKey: entry.key.sessionKey,
        agent: entry.key.agent,
        model: entry.key.model,
        permissionMode: entry.key.permissionMode || null,
        workDir: entry.key.workDir,
        createdAt: dateFromMs(entry.createdAtMs),
        lastUsedAt: dateFromMs(entry.lastUsedAtMs),
        running: entry.running,
        turnCount: entry.turnCount,
        idleMs: Math.max(0, nowMs - entry.lastUsedAtMs),
        lastError: entry.lastError,
      }));
  }

  configurePolicy(policy: { idleTimeoutMs?: number; maxSessions?: number; maxConcurrentTurns?: number; queueMaxRecords?: number; busyStrategy?: "reject" | "queue"; fallbackOnCrash?: boolean }): void {
    if (Number.isFinite(Number(policy.idleTimeoutMs))) {
      this.idleTimeoutMs = Math.max(1, Number(policy.idleTimeoutMs));
    }
    if (Number.isFinite(Number(policy.maxSessions))) {
      this.maxSessions = Math.max(1, Number(policy.maxSessions));
    }
    if (Number.isFinite(Number(policy.maxConcurrentTurns))) {
      this.maxConcurrentTurns = Math.max(1, Number(policy.maxConcurrentTurns));
    }
    if (Number.isFinite(Number(policy.queueMaxRecords))) {
      this.queueMaxRecords = Math.max(0, Number(policy.queueMaxRecords));
    }
    if (policy.busyStrategy === "queue" || policy.busyStrategy === "reject") this.busyStrategy = policy.busyStrategy;
    if (typeof policy.fallbackOnCrash === "boolean") this.fallbackOnCrash = policy.fallbackOnCrash;
    this.drainTurnQueue();
  }

  policy(): { idleTimeoutMs: number; maxSessions: number; maxConcurrentTurns: number; activeTurns: number; queuedTurns: number; fallbackOnCrash: boolean } {
    return {
      idleTimeoutMs: this.idleTimeoutMs,
      maxSessions: this.maxSessions,
      maxConcurrentTurns: this.maxConcurrentTurns,
      activeTurns: this.activeTurns,
      queuedTurns: this.turnQueue.length,
      fallbackOnCrash: this.fallbackOnCrash,
    };
  }

  private acquireTurnSlot(signal: AbortSignal | null): Promise<{ release: () => void }> {
    if (this.activeTurns < this.maxConcurrentTurns) {
      this.activeTurns += 1;
      return Promise.resolve({ release: () => this.releaseTurnSlot() });
    }
    if (this.busyStrategy !== "queue") {
      return Promise.reject(new Error("Global IM Agent concurrency limit reached."));
    }
    if (this.turnQueue.length >= this.queueMaxRecords) {
      return Promise.reject(new Error("Global IM Agent queue is full."));
    }
    return new Promise((resolve, reject) => {
      const waiter: ChannelConnectorAgentSessionDriverTurnSlotWaiter = { resolve, reject, signal, abort: null };
      waiter.abort = () => {
        const index = this.turnQueue.indexOf(waiter);
        if (index >= 0) this.turnQueue.splice(index, 1);
        reject(new Error("Global IM Agent queued turn aborted."));
      };
      if (signal?.aborted) {
        waiter.abort();
        return;
      }
      if (signal && waiter.abort) signal.addEventListener("abort", waiter.abort, { once: true });
      this.turnQueue.push(waiter);
    });
  }

  private releaseTurnSlot(): void {
    this.activeTurns = Math.max(0, this.activeTurns - 1);
    this.drainTurnQueue();
  }

  private drainTurnQueue(): void {
    while (this.activeTurns < this.maxConcurrentTurns && this.turnQueue.length > 0) {
      const waiter = this.turnQueue.shift();
      if (!waiter) return;
      if (waiter.signal && waiter.abort) waiter.signal.removeEventListener("abort", waiter.abort);
      if (waiter.signal?.aborted) {
        waiter.reject(new Error("Global IM Agent queued turn aborted."));
        continue;
      }
      this.activeTurns += 1;
      waiter.resolve({ release: () => this.releaseTurnSlot() });
    }
  }

  private async trimToCapacity(): Promise<void> {
    while (this.sessions.size >= this.maxSessions) {
      const candidate = [...this.sessions.values()]
        .filter((entry) => entry.running === 0)
        .sort((left, right) => left.lastUsedAtMs - right.lastUsedAtMs)[0];
      if (!candidate) return;
      await this.disposeEntry(candidate, "max-sessions", "session.disposed");
    }
  }

  private async disposeEntry(
    entry: ChannelConnectorAgentSessionDriverPoolEntry,
    reason: string,
    eventType: ChannelConnectorAgentSessionDriverEventType,
  ): Promise<void> {
    this.sessions.delete(entry.poolKey);
    try {
      await entry.session.dispose?.(reason);
      this.emit(eventType, entry, {
        sessionId: entry.session.id,
        messageId: null,
        reason,
        error: null,
      });
    } catch (error) {
      this.emit(eventType, entry, {
        sessionId: entry.session.id,
        messageId: null,
        reason,
        error: shortError(error),
      });
    }
  }

  private shouldRunOneShotFallback(input: ChannelConnectorAgentSessionDriverTurnInput): boolean {
    return input.fallbackOnCrash !== false && this.fallbackOnCrash && !input.signal?.aborted;
  }

  private emit(
    type: ChannelConnectorAgentSessionDriverEventType,
    entry: ChannelConnectorAgentSessionDriverPoolEntry | null,
    input: {
      key?: ChannelConnectorAgentSessionDriverKeyInput;
      poolKey?: string;
      sessionId: string | null;
      messageId: string | null;
      reason: string | null;
      error: string | null;
    },
  ): void {
    const key = entry?.key || input.key;
    const poolKey = entry?.poolKey || input.poolKey;
    if (!key || !poolKey) return;
    this.onEvent?.({
      checkedAt: dateFromMs(this.nowMs()),
      type,
      poolKey,
      sessionId: input.sessionId,
      bindingId: key.bindingId,
      projectId: key.projectId,
      sessionKey: key.sessionKey,
      agent: key.agent,
      model: key.model,
      workDir: key.workDir,
      messageId: input.messageId,
      reason: input.reason,
      error: input.error,
    });
  }
}

export function createChannelConnectorAgentSessionDriverPool(
  options: ChannelConnectorAgentSessionDriverPoolOptions,
): ChannelConnectorAgentSessionDriverPool {
  return new ChannelConnectorAgentSessionDriverPool(options);
}
