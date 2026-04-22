import { createRequire } from "node:module";
import { exec, execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { StudioServerConfig } from "../../../../types/api.js";
import { isRecoverableTerminalStatus } from "../../../../types/terminal.js";
import type { SkillsService } from "../skills/service.js";
import { buildTerminalActionCatalog } from "./action-catalog.js";
import { buildTerminalSessionSummary } from "./session-summary.js";
import { buildTerminalRecentOutputSummary } from "./terminal-session-summary.js";
import { createTerminalSessionDescriptorStore } from "./terminal-session-descriptor-store.js";
import { createTerminalSessionLedger } from "./terminal-session-ledger.js";
import type {
  TerminalActionCatalogResponse,
  TerminalBinaryId,
  TerminalBinaryStatus,
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalGatewayAckResponse,
  TerminalGatewayAttachPayload,
  TerminalGatewayAttachResponse,
  TerminalGatewayDetachPayload,
  TerminalGatewayEvent,
  TerminalGatewayHeartbeatPayload,
  TerminalGatewayInputPayload,
  TerminalGatewayOutputEvent,
  TerminalGatewayResizePayload,
  TerminalInstallAttemptLog,
  TerminalInstallRequestId,
  TerminalInstallResponse,
  TerminalInstallResult,
  TerminalInstallTarget,
  TerminalLaunchCli,
  TerminalLaunchPayload,
  TerminalLaunchResponse,
  TerminalInstallStreamEvent,
  TerminalSessionDescriptor,
  TerminalSessionLedgerEvent,
  TerminalSessionSummaryResponse,
  TerminalStatusPayload,
} from "../../../../types/terminal.js";

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

type PtyModule = typeof import("@homebridge/node-pty-prebuilt-multiarch");
type PtyInstance = ReturnType<PtyModule["spawn"]>;

interface TerminalSocket extends WebSocket {
  _terminalSessionId?: string | null;
  _terminalSession?: TerminalSession | null;
  _lastAliveAt?: number;
}

interface TerminalGatewaySubscriber {
  connId: string;
  emit: (event: TerminalGatewayEvent) => boolean;
  lastLeaseAt: number;
}

interface TerminalSession {
  id: string;
  instanceId: string;
  term: PtyInstance;
  clients: Set<TerminalSocket>;
  gatewaySubscribers: Map<string, TerminalGatewaySubscriber>;
  backlog: Array<{ seq: number; data: string }>;
  bufferSize: number;
  outputSeq: number;
  cleanupTimer: NodeJS.Timeout | null;
  closed: boolean;
  lastCols: number;
  lastRows: number;
  shell: string;
  cwd: string;
  source: "manual" | "system-handoff" | "linked_context";
  sourceModule: string;
  sourceAction: string;
  originRoute: string;
  handoffContext: TerminalSessionDescriptor["handoffContext"];
  createdAt: string;
  lastActivityAt: string;
  lastAttachedAt: string | null;
}

interface TerminalCliSpec {
  id: TerminalBinaryId;
  label: string;
  binary: string;
  packageName: string | null;
  category: "agent" | "marketplace" | "shell";
  installMode: "package-manager" | "script" | "none";
  installCommand?: string;
  verifyArgs?: string[];
}

interface TerminalPackageManager {
  id: string;
  checkCommand: string;
  installCommand: (pkg: string) => string;
}

interface TerminalGatewayRuntime {
  connId: string;
  emit: (event: TerminalGatewayEvent) => boolean;
}

const TERMINAL_SESSION_GRACE_MS = 30 * 60 * 1000;
const TERMINAL_BUFFER_LIMIT = 256 * 1024;
const TERMINAL_INSTALL_TIMEOUT_MS = 8 * 60 * 1000;
const TERMINAL_GATEWAY_LEASE_MS = 35_000;
const TERMINAL_GATEWAY_SWEEP_INTERVAL_MS = 10_000;
const WS_PING_INTERVAL = 20_000;
const WS_IDLE_TIMEOUT = 90_000;

const TERMINAL_CLI_SPECS: Record<TerminalBinaryId, TerminalCliSpec> = {
  claude: {
    id: "claude",
    label: "Claude CLI",
    binary: "claude",
    packageName: "@anthropic-ai/claude-code",
    category: "agent",
    installMode: "package-manager",
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    binary: "codex",
    packageName: "@openai/codex",
    category: "agent",
    installMode: "package-manager",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode CLI",
    binary: "opencode",
    packageName: "opencode-ai",
    category: "agent",
    installMode: "package-manager",
  },
  clawhub: {
    id: "clawhub",
    label: "ClawHub CLI",
    binary: "clawhub",
    packageName: "clawhub",
    category: "marketplace",
    installMode: "package-manager",
    verifyArgs: ["--cli-version"],
  },
  skillhub: {
    id: "skillhub",
    label: "SkillHub CLI",
    binary: "skillhub",
    packageName: null,
    category: "marketplace",
    installMode: "script",
    installCommand:
      "curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only",
    verifyArgs: ["--help"],
  },
  bash: {
    id: "bash",
    label: "Bash",
    binary: "bash",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["--version"],
  },
};

const TERMINAL_PACKAGE_MANAGERS: TerminalPackageManager[] = [
  {
    id: "npm",
    checkCommand: "command -v npm",
    installCommand: (pkg) => `npm install -g ${pkg}`,
  },
  {
    id: "pnpm",
    checkCommand: "command -v pnpm",
    installCommand: (pkg) => `pnpm add -g ${pkg}`,
  },
  {
    id: "yarn",
    checkCommand: "command -v yarn",
    installCommand: (pkg) => `yarn global add ${pkg}`,
  },
  {
    id: "bun",
    checkCommand: "command -v bun",
    installCommand: (pkg) => `bun add -g ${pkg}`,
  },
];

function shellQuote(raw: string): string {
  return `"${String(raw || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function truncateLog(text: string, maxLength = 16_000): string {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n...[truncated]`;
}

function isWindowsMountedPath(binPath: string): boolean {
  const normalized = String(binPath || "")
    .trim()
    .toLowerCase();
  return normalized.startsWith("/mnt/c/") || normalized.startsWith("/mnt/d/");
}

function normalizeSessionId(value: string | null | undefined): string {
  if (
    value !== null &&
    value !== undefined &&
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return crypto.randomUUID();
  }
  const raw = String(value || "").trim();
  if (
    !raw ||
    raw === "[object Object]" ||
    raw === "objectObject" ||
    raw.toLowerCase() === "objectobject"
  ) {
    return crypto.randomUUID();
  }
  const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 128);
  return normalized || crypto.randomUUID();
}

function normalizeOutputSeq(value: string | number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function normalizeSkipReplay(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeResumeSession(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function createOptionalPty(): PtyModule | null {
  try {
    return require("@homebridge/node-pty-prebuilt-multiarch") as PtyModule;
  } catch {
    return null;
  }
}

async function runCommand(
  command: string,
  timeoutMs = 15_000,
): Promise<{
  success: boolean;
  output: string;
  stderr: string;
  error: string;
}> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      success: true,
      output: String(stdout || "").trim(),
      stderr: String(stderr || "").trim(),
      error: "",
    };
  } catch (error) {
    const target = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      success: false,
      output: String(target.stdout || "").trim(),
      stderr: String(target.stderr || "").trim(),
      error: String(target.message || "command_failed"),
    };
  }
}

function buildTerminalEnv(config: StudioServerConfig): NodeJS.ProcessEnv {
  const env = { ...process.env };
  try {
    const raw = require("node:fs").readFileSync(
      config.openclawConfigFile,
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Record<string, any>;
    const providers = parsed?.models?.providers || {};
    for (const provider of Object.values(providers) as Array<
      Record<string, any>
    >) {
      if (!provider?.apiKey || String(provider.apiKey).startsWith("${"))
        continue;
      if (provider.api === "anthropic-messages" && !env.ANTHROPIC_API_KEY) {
        env.ANTHROPIC_API_KEY = provider.apiKey;
      } else if (!env.OPENAI_API_KEY) {
        env.OPENAI_API_KEY = provider.apiKey;
      }
    }
  } catch {
    // ignore invalid config here; status endpoints already report separately
  }
  return env;
}

function summarizeAttempts(attempts: TerminalInstallAttemptLog[]): string {
  const lines: string[] = [];
  for (const item of attempts) {
    lines.push(`[${item.stage}] $ ${item.command}`);
    if (item.output) lines.push(item.output);
    if (item.stderr) lines.push(item.stderr);
    if (item.error) lines.push(`ERROR: ${item.error}`);
  }
  return truncateLog(lines.join("\n\n"));
}

export interface TerminalService {
  getStatus(): Promise<TerminalStatusPayload>;
  listWorkspaceSessions(): Promise<TerminalSessionSummaryResponse>;
  listPersistedSessions(): Promise<TerminalSessionSummaryResponse>;
  getPersistedSession(
    sessionId: string,
  ): Promise<TerminalSessionDescriptor | null>;
  renamePersistedSession(
    sessionId: string,
    title: string,
  ): Promise<TerminalSessionDescriptor | null>;
  deletePersistedSession(sessionId: string): Promise<{
    success: boolean;
    sessionId: string;
    reason?: "session_active";
  }>;
  listSessionLedger(sessionId: string): Promise<TerminalSessionLedgerEvent[]>;
  listWorkspaceActions(): Promise<TerminalActionCatalogResponse>;
  installCli(
    target: TerminalInstallRequestId,
  ): Promise<TerminalInstallResponse>;
  streamInstallCli(
    target: TerminalInstallRequestId,
    emit: (event: TerminalInstallStreamEvent) => void | Promise<void>,
  ): Promise<TerminalInstallResponse>;
  getLaunchCommand(
    payload: TerminalLaunchPayload,
  ): Promise<TerminalLaunchResponse>;
  endSession(payload: TerminalEndPayload): Promise<TerminalEndResponse>;
  attachGatewayClient(
    payload: TerminalGatewayAttachPayload,
    runtime: TerminalGatewayRuntime,
  ): TerminalGatewayAttachResponse;
  sendGatewayInput(
    payload: TerminalGatewayInputPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  resizeGatewayClient(
    payload: TerminalGatewayResizePayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  heartbeatGatewayClient(
    payload: TerminalGatewayHeartbeatPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  detachGatewayClient(
    payload: TerminalGatewayDetachPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean;
  dispose(): void;
}

export interface CreateTerminalServiceOptions {
  config: StudioServerConfig;
  skills: SkillsService;
}

export function createTerminalService(
  options: CreateTerminalServiceOptions,
): TerminalService {
  const pty = createOptionalPty();
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map<string, TerminalSession>();
  const persistenceStateDir = path.join(
    options.config.openclawRoot,
    "terminal",
  );
  const descriptorStore = createTerminalSessionDescriptorStore({
    stateDir: persistenceStateDir,
  });
  const ledger = createTerminalSessionLedger({
    stateDir: persistenceStateDir,
  });

  const pingTimer = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((socket: WebSocket) => {
      const ws = socket as TerminalSocket;
      if (now - Number(ws._lastAliveAt || now) > WS_IDLE_TIMEOUT) {
        try {
          ws.terminate();
        } catch {}
        return;
      }
      try {
        ws.ping();
      } catch {}
    });
  }, WS_PING_INTERVAL);
  pingTimer.unref?.();

  const gatewaySweepTimer = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      pruneExpiredGatewaySubscribers(session, now);
    }
  }, TERMINAL_GATEWAY_SWEEP_INTERVAL_MS);
  gatewaySweepTimer.unref?.();

  function getActiveClientCount(session: TerminalSession): number {
    return session.clients.size + session.gatewaySubscribers.size;
  }

  function clearCleanupTimer(session: TerminalSession): void {
    if (!session.cleanupTimer) return;
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }

  function buildSessionDescriptor(
    session: TerminalSession,
    status: "running" | "detached" | "completed" | "failed" | "lost",
  ): TerminalSessionDescriptor {
    const observerClientIds = Array.from(
      session.gatewaySubscribers.keys(),
    ).sort();
    const controllerClientId = observerClientIds[0] || null;
    const events = ledger.listBySession(session.id);
    const recent = buildTerminalRecentOutputSummary(events);

    return {
      sessionId: session.id,
      title: `Terminal ${session.id}`,
      source: session.source,
      sourceModule: session.sourceModule,
      sourceAction: session.sourceAction,
      originRoute: session.originRoute,
      status,
      controllerClientId,
      observerClientIds,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActivityAt,
      lastAttachedAt: session.lastAttachedAt,
      canResume: status === "running" || status === "detached",
      resumeKey: session.id,
      handoffContext: session.handoffContext,
      recentOutputSummary: recent,
      controlState: controllerClientId ? "controller" : "observer",
      observerCount: observerClientIds.length,
      updatedAt: session.lastActivityAt,
    };
  }

  function persistSessionDescriptor(session: TerminalSession): void {
    const status = getActiveClientCount(session) > 0 ? "running" : "detached";
    descriptorStore.upsert(buildSessionDescriptor(session, status));
  }

  function appendLedgerEvent(
    session: TerminalSession,
    type: string,
    detail: Record<string, unknown>,
    actorClientId: string | null = null,
  ): void {
    ledger.append({
      eventId: crypto.randomUUID(),
      sessionId: session.id,
      type,
      timestamp: new Date().toISOString(),
      actorClientId,
      detail,
    });
  }

  function markSessionActivity(session: TerminalSession): void {
    session.lastActivityAt = new Date().toISOString();
    persistSessionDescriptor(session);
  }

  function emitGatewayEvent(
    subscriber: TerminalGatewaySubscriber,
    event: TerminalGatewayEvent,
  ): boolean {
    try {
      return subscriber.emit(event);
    } catch {
      return false;
    }
  }

  function pruneExpiredGatewaySubscribers(
    session: TerminalSession,
    now = Date.now(),
  ): void {
    let changed = false;
    for (const [connId, subscriber] of Array.from(
      session.gatewaySubscribers.entries(),
    )) {
      if (now - subscriber.lastLeaseAt <= TERMINAL_GATEWAY_LEASE_MS) {
        continue;
      }
      session.gatewaySubscribers.delete(connId);
      changed = true;
    }
    if (changed) {
      persistSessionDescriptor(session);
    }
    if (getActiveClientCount(session) === 0) {
      scheduleCleanup(session);
    }
  }

  function broadcastGatewayEvent(
    session: TerminalSession,
    event: TerminalGatewayEvent,
  ): void {
    pruneExpiredGatewaySubscribers(session);
    let changed = false;
    for (const [connId, subscriber] of Array.from(
      session.gatewaySubscribers.entries(),
    )) {
      if (emitGatewayEvent(subscriber, event)) {
        continue;
      }
      session.gatewaySubscribers.delete(connId);
      changed = true;
    }
    if (changed) {
      persistSessionDescriptor(session);
    }
    if (getActiveClientCount(session) === 0) {
      scheduleCleanup(session);
    }
  }

  function detachGatewayConnId(
    connId: string,
    sessionId?: string | null,
  ): void {
    const targetSessionId = String(sessionId || "").trim();
    for (const session of sessions.values()) {
      if (targetSessionId && session.id !== targetSessionId) {
        continue;
      }
      if (!session.gatewaySubscribers.delete(connId)) {
        continue;
      }
      appendLedgerEvent(
        session,
        "detach",
        {
          reason: "gateway_detach",
        },
        connId,
      );
      markSessionActivity(session);
      if (getActiveClientCount(session) === 0) {
        scheduleCleanup(session);
      }
    }
  }

  function touchGatewaySubscriber(
    session: TerminalSession,
    connId: string,
  ): boolean {
    const subscriber = session.gatewaySubscribers.get(connId);
    if (!subscriber) {
      return false;
    }
    subscriber.lastLeaseAt = Date.now();
    return true;
  }

  function requireGatewaySubscriber(
    session: TerminalSession,
    connId: string,
  ): void {
    if (touchGatewaySubscriber(session, connId)) {
      return;
    }
    throw new Error("terminal_gateway_client_not_attached");
  }

  function registerGatewaySubscriber(
    session: TerminalSession,
    runtime: TerminalGatewayRuntime,
  ): void {
    clearCleanupTimer(session);
    const existingSubscriber = session.gatewaySubscribers.get(runtime.connId);
    if (existingSubscriber) {
      existingSubscriber.lastLeaseAt = Date.now();
      session.lastAttachedAt = new Date().toISOString();
      markSessionActivity(session);
      return;
    }
    detachGatewayConnId(runtime.connId);
    session.lastAttachedAt = new Date().toISOString();
    appendLedgerEvent(
      session,
      "attach",
      {
        reason: "gateway_attach",
      },
      runtime.connId,
    );
    markSessionActivity(session);
    session.gatewaySubscribers.set(runtime.connId, {
      connId: runtime.connId,
      emit: runtime.emit,
      lastLeaseAt: Date.now(),
    });
  }

  function buildOutputEvent(
    session: TerminalSession,
    chunk: { seq: number; data: string },
  ): TerminalGatewayOutputEvent {
    return {
      type: "output",
      sid: session.id,
      seq: chunk.seq,
      data: chunk.data,
    };
  }

  function buildAttachEvents(
    session: TerminalSession,
    params: {
      lastSeq?: string | number | null;
      instanceId?: string | null;
      skipReplay?: boolean | string | null;
    },
  ): TerminalGatewayEvent[] {
    const lastSeq = normalizeOutputSeq(params.lastSeq);
    const instanceId = String(params.instanceId || "").trim();
    const skipReplay = normalizeSkipReplay(params.skipReplay);
    const requiresReset =
      lastSeq > session.outputSeq ||
      (instanceId && instanceId !== session.instanceId);
    const events: TerminalGatewayEvent[] = [
      {
        type: "session",
        sid: session.id,
        instanceId: session.instanceId,
        outputSeq: session.outputSeq,
      },
    ];

    if (requiresReset) {
      events.push({
        type: "reset",
        sid: session.id,
        instanceId: session.instanceId,
        reason: "session_recreated",
      });
    }

    if (!skipReplay) {
      const replayAfterSeq = requiresReset ? 0 : lastSeq;
      for (const chunk of session.backlog) {
        if (chunk.seq <= replayAfterSeq) continue;
        events.push(buildOutputEvent(session, chunk));
      }
    }
    return events;
  }

  function destroySession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    clearCleanupTimer(session);
    sessions.delete(sessionId);
    session.closed = true;
    appendLedgerEvent(session, "ended", { reason: "session_ended" }, null);
    descriptorStore.upsert(buildSessionDescriptor(session, "completed"));
    broadcastGatewayEvent(session, {
      type: "closed",
      sid: session.id,
      reason: "session_ended",
    });
    for (const client of Array.from(session.clients)) {
      try {
        client.close();
      } catch {}
    }
    session.clients.clear();
    session.gatewaySubscribers.clear();
    try {
      session.term.kill();
    } catch {}
  }

  function scheduleCleanup(session: TerminalSession): void {
    if (getActiveClientCount(session) > 0) return;
    clearCleanupTimer(session);
    session.cleanupTimer = setTimeout(() => {
      const current = sessions.get(session.id);
      if (!current || getActiveClientCount(current) > 0) return;
      destroySession(session.id);
    }, TERMINAL_SESSION_GRACE_MS);
    session.cleanupTimer.unref?.();
  }

  function sendEvent(ws: TerminalSocket, payload: unknown): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function broadcastChunk(session: TerminalSession, data: string): void {
    if (!data) return;
    markSessionActivity(session);
    const chunk = { seq: ++session.outputSeq, data };
    session.backlog.push(chunk);
    session.bufferSize += data.length;

    while (
      session.bufferSize > TERMINAL_BUFFER_LIMIT &&
      session.backlog.length > 1
    ) {
      const dropped = session.backlog.shift();
      session.bufferSize -= dropped?.data?.length || 0;
    }

    for (const client of Array.from(session.clients)) {
      if (client.readyState !== WebSocket.OPEN) {
        session.clients.delete(client);
        continue;
      }
      if (
        !sendEvent(client, { type: "output", seq: chunk.seq, data: chunk.data })
      ) {
        session.clients.delete(client);
      }
    }

    broadcastGatewayEvent(session, buildOutputEvent(session, chunk));
  }

  function replayBacklog(
    session: TerminalSession,
    ws: TerminalSocket,
    lastSeq = 0,
  ): boolean {
    for (const event of buildAttachEvents(session, { lastSeq })) {
      if (!sendEvent(ws, event)) {
        return false;
      }
    }
    return true;
  }

  function createSession(sessionId: string): TerminalSession {
    if (!pty) {
      throw new Error(
        "node-pty is not available; terminal sessions are disabled",
      );
    }

    const shell = process.env.SHELL || "/bin/bash";
    const cwd = options.config.openclawRoot || process.cwd();
    const lastActivityAt = new Date().toISOString();
    const term = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd,
      env: buildTerminalEnv(options.config),
    });

    const session: TerminalSession = {
      id: sessionId,
      instanceId: crypto.randomUUID(),
      term,
      clients: new Set(),
      gatewaySubscribers: new Map(),
      backlog: [],
      bufferSize: 0,
      outputSeq: 0,
      cleanupTimer: null,
      closed: false,
      lastCols: 120,
      lastRows: 30,
      shell,
      cwd,
      source: "manual",
      sourceModule: "terminal",
      sourceAction: "terminal.attach",
      originRoute: `/terminal/${sessionId}`,
      handoffContext: null,
      createdAt: lastActivityAt,
      lastActivityAt,
      lastAttachedAt: null,
    };

    term.onData((data) => {
      appendLedgerEvent(session, "output", { data });
      broadcastChunk(session, data);
    });

    term.onExit((event) => {
      const alreadyClosed = session.closed;
      if (!alreadyClosed) {
        broadcastGatewayEvent(session, {
          type: "closed",
          sid: session.id,
          reason: "session_exited",
        });
      }
      appendLedgerEvent(
        session,
        "exit",
        {
          code: typeof event?.exitCode === "number" ? event.exitCode : null,
          signal:
            typeof event?.signal === "number" ? String(event.signal) : null,
        },
        null,
      );
      for (const client of Array.from(session.clients)) {
        try {
          client.close();
        } catch {}
      }
      session.clients.clear();
      session.gatewaySubscribers.clear();
      markSessionActivity(session);
      descriptorStore.upsert(buildSessionDescriptor(session, "completed"));
      clearCleanupTimer(session);
      sessions.delete(session.id);
      session.closed = true;
    });

    sessions.set(session.id, session);
    appendLedgerEvent(session, "created", {
      source: session.source,
      shell: session.shell,
      cwd: session.cwd,
    });
    persistSessionDescriptor(session);
    return session;
  }

  function markPersistedSessionLost(
    sessionId: string,
    reason = "runtime_unavailable",
  ): TerminalSessionDescriptor | null {
    const persisted = descriptorStore.get(sessionId);
    if (!persisted) return null;
    if (!isRecoverableTerminalStatus(persisted.status)) {
      return persisted;
    }

    const nextUpdatedAt = new Date().toISOString();
    ledger.append({
      eventId: crypto.randomUUID(),
      sessionId,
      type: "ended",
      timestamp: nextUpdatedAt,
      actorClientId: null,
      detail: { reason },
    });
    const recentOutputSummary = buildTerminalRecentOutputSummary(
      ledger.listBySession(sessionId),
    );
    const nextDescriptor: TerminalSessionDescriptor = {
      ...persisted,
      status: "lost",
      canResume: false,
      recentOutputSummary,
      updatedAt: nextUpdatedAt,
    };
    descriptorStore.upsert(nextDescriptor);
    return nextDescriptor;
  }

  function reconcilePersistedDescriptor(
    descriptor: TerminalSessionDescriptor | null,
  ): TerminalSessionDescriptor | null {
    if (!descriptor) return null;
    if (!isRecoverableTerminalStatus(descriptor.status)) {
      return descriptor;
    }
    const runtimeSession = sessions.get(descriptor.sessionId);
    if (runtimeSession && !runtimeSession.closed) {
      return descriptor;
    }
    return markPersistedSessionLost(descriptor.sessionId) || descriptor;
  }

  function getOrCreateSession(
    rawSessionId: string | null,
    options: { resumePersisted?: boolean } = {},
  ): TerminalSession {
    const sessionId = normalizeSessionId(rawSessionId);
    const existing = sessions.get(sessionId);
    if (existing && !existing.closed) {
      clearCleanupTimer(existing);
      return existing;
    }
    if (rawSessionId) {
      const persisted = descriptorStore.get(sessionId);
      if (persisted) {
        if (options.resumePersisted) {
          return createSession(sessionId);
        }
        reconcilePersistedDescriptor(persisted);
        throw new Error("terminal_session_unavailable");
      }
    }
    return createSession(sessionId);
  }

  function attachSocket(
    session: TerminalSession,
    ws: TerminalSocket,
    params: URLSearchParams,
  ): boolean {
    clearCleanupTimer(session);

    for (const client of Array.from(session.clients)) {
      if (client === ws) continue;
      try {
        client.close(1012, "terminal_replaced");
      } catch {}
    }
    session.clients.clear();

    ws._terminalSessionId = session.id;
    ws._terminalSession = session;
    ws._lastAliveAt = Date.now();
    markSessionActivity(session);

    const attachEvents = buildAttachEvents(session, {
      lastSeq: params.get("lastSeq"),
      instanceId: params.get("instanceId"),
      skipReplay: params.get("skipReplay"),
    });
    for (const event of attachEvents) {
      if (!sendEvent(ws, event)) {
        return false;
      }
    }

    session.clients.add(ws);
    return true;
  }

  function requireActiveSession(
    rawSessionId: string | null | undefined,
  ): TerminalSession {
    const sessionId = String(rawSessionId || "").trim();
    if (!sessionId) {
      throw new Error("sid is required");
    }
    const session = sessions.get(sessionId);
    if (!session || session.closed) {
      throw new Error("terminal_session_not_found");
    }
    clearCleanupTimer(session);
    return session;
  }

  function createGatewayAck(
    session: TerminalSession,
  ): TerminalGatewayAckResponse {
    return {
      ok: true,
      sid: session.id,
    };
  }

  async function checkBinary(
    spec: TerminalCliSpec,
  ): Promise<TerminalBinaryStatus> {
    const [whichResult, commandVResult] = await Promise.all([
      runCommand(`which -a ${spec.binary}`),
      runCommand(`command -v ${spec.binary}`),
    ]);

    const candidates: string[] = [];
    for (const line of String(whichResult.output || "").split("\n")) {
      const value = line.trim();
      if (value && !candidates.includes(value)) candidates.push(value);
    }
    for (const line of String(commandVResult.output || "").split("\n")) {
      const value = line.trim();
      if (value && !candidates.includes(value)) candidates.push(value);
    }

    const binaryPath =
      candidates.find((item) => !isWindowsMountedPath(item)) || "";

    const verifyArgs = spec.verifyArgs || ["--version"];
    async function verifyAt(pathToBinary: string): Promise<{
      success: boolean;
      output: string;
    }> {
      return execFileAsync(pathToBinary, verifyArgs, {
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
      })
        .then((result) => ({
          success: true,
          output: `${result.stdout}${result.stderr}`.trim(),
        }))
        .catch(() => ({
          success: false,
          output: "",
        }));
    }

    const verifyFromPath = binaryPath ? await verifyAt(binaryPath) : null;
    const fallbackVerify = verifyFromPath?.success
      ? null
      : await verifyAt(spec.binary);
    const installed = Boolean(
      verifyFromPath?.success || fallbackVerify?.success,
    );
    const resolvedPath = verifyFromPath?.success
      ? binaryPath
      : fallbackVerify?.success
        ? spec.binary
        : null;
    const versionOutput = verifyFromPath?.success
      ? verifyFromPath.output
      : fallbackVerify?.output || "";

    return {
      id: spec.id,
      label: spec.label,
      binary: spec.binary,
      installed,
      path: resolvedPath,
      version: installed ? truncateLog(versionOutput, 300) : null,
      packageName: spec.packageName,
      installSupported: spec.installMode !== "none",
      category: spec.category,
    };
  }

  async function detectPackageManager(): Promise<TerminalPackageManager | null> {
    for (const manager of TERMINAL_PACKAGE_MANAGERS) {
      const result = await runCommand(manager.checkCommand);
      const firstPath = String(result.output || "")
        .split("\n")[0]
        .trim();
      if (result.success && firstPath && !isWindowsMountedPath(firstPath)) {
        return manager;
      }
    }
    return null;
  }

  async function installSingleTarget(
    targetId: TerminalBinaryId,
    emit?: (event: TerminalInstallStreamEvent) => void | Promise<void>,
  ): Promise<TerminalInstallResult> {
    const spec = TERMINAL_CLI_SPECS[targetId];
    const before = await checkBinary(spec);
    if (before.installed) {
      await emit?.({
        type: "result",
        cli: targetId,
        success: true,
        message: `${spec.label} already installed`,
      });
      return {
        cli: targetId,
        label: spec.label,
        success: true,
        alreadyInstalled: true,
        packageName: spec.packageName,
        packageManager: null,
        path: before.path,
        command: null,
        output: "",
        stderr: "",
        error: "",
        attempts: [],
      };
    }

    const attempts: TerminalInstallAttemptLog[] = [];
    if (spec.installMode === "script" && spec.installCommand) {
      await emit?.({
        type: "attempt",
        cli: targetId,
        stage: "script",
        command: spec.installCommand,
        message: `Running install script for ${spec.label}`,
      });
      const installResult = await runCommand(
        spec.installCommand,
        TERMINAL_INSTALL_TIMEOUT_MS,
      );
      attempts.push({
        stage: "script",
        command: spec.installCommand,
        success: installResult.success,
        output: truncateLog(installResult.output, 8000),
        stderr: truncateLog(installResult.stderr, 8000),
        error: installResult.error,
      });

      const after = await checkBinary(spec);
      await emit?.({
        type: "result",
        cli: targetId,
        success: after.installed,
        output: truncateLog(installResult.output, 8000),
        stderr: truncateLog(installResult.stderr, 8000),
        error: after.installed ? "" : "install_failed",
        message: after.installed
          ? `${spec.label} installed`
          : `${spec.label} install failed`,
      });
      return {
        cli: targetId,
        label: spec.label,
        success: after.installed,
        alreadyInstalled: false,
        packageName: spec.packageName,
        packageManager: "script",
        path: after.path,
        command: spec.installCommand,
        output: summarizeAttempts(attempts),
        stderr: "",
        error: after.installed ? "" : "install_failed",
        attempts,
      };
    }

    const manager = await detectPackageManager();
    if (!manager || !spec.packageName) {
      return {
        cli: targetId,
        label: spec.label,
        success: false,
        alreadyInstalled: false,
        packageName: spec.packageName,
        packageManager: null,
        path: null,
        command: null,
        output: "",
        stderr: "",
        error: "no_package_manager",
        attempts,
      };
    }

    const commands =
      manager.id === "npm"
        ? [
            manager.installCommand(spec.packageName),
            `${manager.installCommand(spec.packageName)} --include=optional --no-audit --no-fund`,
          ]
        : [manager.installCommand(spec.packageName)];

    for (const command of commands) {
      await emit?.({
        type: "attempt",
        cli: targetId,
        stage: `install-${attempts.length + 1}`,
        command,
        message: `Running ${spec.label} install attempt ${attempts.length + 1}`,
      });
      const installResult = await runCommand(
        command,
        TERMINAL_INSTALL_TIMEOUT_MS,
      );
      attempts.push({
        stage: `install-${attempts.length + 1}`,
        command,
        success: installResult.success,
        output: truncateLog(installResult.output, 8000),
        stderr: truncateLog(installResult.stderr, 8000),
        error: installResult.error,
      });

      const after = await checkBinary(spec);
      if (after.installed) {
        await emit?.({
          type: "result",
          cli: targetId,
          success: true,
          output: truncateLog(installResult.output, 8000),
          stderr: truncateLog(installResult.stderr, 8000),
          message: `${spec.label} installed`,
        });
        return {
          cli: targetId,
          label: spec.label,
          success: true,
          alreadyInstalled: false,
          packageName: spec.packageName,
          packageManager: manager.id,
          path: after.path,
          command,
          output: summarizeAttempts(attempts),
          stderr: "",
          error: "",
          attempts,
        };
      }
    }

    await emit?.({
      type: "result",
      cli: targetId,
      success: false,
      error: "install_failed",
      message: `${spec.label} install failed`,
    });
    return {
      cli: targetId,
      label: spec.label,
      success: false,
      alreadyInstalled: false,
      packageName: spec.packageName,
      packageManager: manager.id,
      path: null,
      command: commands.at(-1) || null,
      output: summarizeAttempts(attempts),
      stderr: "",
      error: "install_failed",
      attempts,
    };
  }

  async function runInstallWorkflow(
    target: TerminalInstallRequestId,
    emit?: (event: TerminalInstallStreamEvent) => void | Promise<void>,
  ): Promise<TerminalInstallResponse> {
    const allTargets = Object.values(TERMINAL_CLI_SPECS)
      .filter((spec) => spec.installMode !== "none")
      .map((spec) => spec.id);
    const statusBefore = await buildStatusPayload();
    const selectedTargets =
      target === "all"
        ? allTargets
        : target === "all-missing"
          ? statusBefore.binaries
              .filter((item) => !item.installed && item.installSupported)
              .map((item) => item.id)
          : [target];

    await emit?.({
      type: "start",
      message: `Starting install workflow for ${target}`,
    });

    if (!selectedTargets.length) {
      const response: TerminalInstallResponse = {
        success: true,
        requested: target,
        installedNow: [],
        failed: [],
        message: "All requested CLIs are already installed",
        results: [],
        status: statusBefore,
      };
      await emit?.({
        type: "done",
        message: response.message,
        response,
      });
      return response;
    }

    const results: TerminalInstallResult[] = [];
    for (const cli of selectedTargets) {
      results.push(await installSingleTarget(cli, emit));
    }

    const failed = results.filter((item) => !item.success);
    const statusAfter = await buildStatusPayload();
    const response: TerminalInstallResponse = {
      success: failed.length === 0,
      requested: target,
      installedNow: results
        .filter((item) => item.success && !item.alreadyInstalled)
        .map((item) => item.label),
      failed: failed.map((item) => ({
        cli: item.cli,
        error: item.error || "install_failed",
      })),
      message:
        failed.length === 0
          ? `Installed: ${
              results
                .filter((item) => item.success && !item.alreadyInstalled)
                .map((item) => item.label)
                .join(", ") || "no changes"
            }`
          : `Install failed for: ${failed.map((item) => item.label).join(", ")}`,
      results,
      status: statusAfter,
    };
    await emit?.({
      type: "done",
      message: response.message,
      response,
    });
    return response;
  }

  async function buildSkillsDependencySummary() {
    const summary = await options.skills.getSummary();
    const needsSetupSkills = summary.skills.filter(
      (skill) => skill.status === "needs-setup",
    );
    const blockedSkills = summary.skills.filter(
      (skill) => skill.status === "blocked",
    );
    const missingBinaries = new Map<string, string[]>();

    for (const skill of needsSetupSkills) {
      for (const binary of skill.missing.bins) {
        const list = missingBinaries.get(binary) || [];
        if (!list.includes(skill.slug)) list.push(skill.slug);
        missingBinaries.set(binary, list);
      }
    }

    return {
      needsSetupCount: needsSetupSkills.length,
      blockedCount: blockedSkills.length,
      missingBinaryCount: missingBinaries.size,
      missingBinaries: Array.from(missingBinaries.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([binary, skills]) => ({ binary, skills })),
      marketplaceCli: {
        clawhubInstalled: summary.tools.clawhubInstalled,
        skillhubInstalled: summary.tools.skillhubInstalled,
      },
    };
  }

  async function buildStatusPayload(): Promise<TerminalStatusPayload> {
    const binaries = await Promise.all(
      Object.values(TERMINAL_CLI_SPECS).map((spec) => checkBinary(spec)),
    );
    const skills = await buildSkillsDependencySummary();
    let modelConfig: Record<string, any> = {};
    try {
      if (require("node:fs").existsSync(options.config.openclawConfigFile)) {
        modelConfig = JSON.parse(
          require("node:fs").readFileSync(
            options.config.openclawConfigFile,
            "utf-8",
          ),
        );
      }
    } catch {
      modelConfig = {};
    }
    const model = modelConfig?.agents?.defaults?.model?.primary || "";
    let provider = "";
    if (typeof model === "string" && model.includes("/")) {
      provider = model.split("/")[0];
    }
    const providers = modelConfig?.models?.providers || {};
    if (!provider) {
      for (const [providerId, providerConfig] of Object.entries(
        providers,
      ) as Array<[string, Record<string, any>]>) {
        const models = Array.isArray(providerConfig.models)
          ? providerConfig.models.map((item: any) => item.id || item)
          : [];
        if (models.includes(model)) {
          provider = providerId;
          break;
        }
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      ptyAvailable: pty !== null,
      sessionCount: sessions.size,
      binaries,
      config: {
        model,
        provider,
      },
      installTargets: Object.values(TERMINAL_CLI_SPECS)
        .filter((spec) => spec.installMode !== "none")
        .map(
          (spec): TerminalInstallTarget => ({
            id: spec.id,
            label: spec.label,
            packageName: spec.packageName,
            installHint:
              spec.installMode === "script"
                ? spec.installCommand || ""
                : `${TERMINAL_PACKAGE_MANAGERS[0].installCommand(spec.packageName || "")}`,
            category: spec.category,
          }),
        ),
      skills,
    };
  }

  function buildSessionSummaryPayload(): TerminalSessionSummaryResponse {
    const summaries = Array.from(sessions.values())
      .filter((session) => !session.closed)
      .map((session) => {
        const firstGatewayConnId =
          Array.from(session.gatewaySubscribers.keys())[0] || null;
        const hasActiveAttach = getActiveClientCount(session) > 0;
        return buildTerminalSessionSummary({
          sid: session.id,
          title: `Terminal ${session.id}`,
          status: hasActiveAttach ? "running" : "detached",
          source: session.source,
          attachedClientId: firstGatewayConnId,
          observerCount: session.gatewaySubscribers.size,
          updatedAt: session.lastActivityAt,
        });
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      sessions: summaries,
    };
  }

  wss.on("connection", (socket: WebSocket, req: http.IncomingMessage) => {
    const ws = socket as TerminalSocket;
    ws._lastAliveAt = Date.now();

    if (!pty) {
      sendEvent(ws, {
        type: "error",
        message: "node-pty is not available; terminal is disabled",
      });
      try {
        ws.close();
      } catch {}
      return;
    }

    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const session = getOrCreateSession(url.searchParams.get("sid"), {
        resumePersisted: normalizeResumeSession(url.searchParams.get("resume")),
      });
      if (!attachSocket(session, ws, url.searchParams)) {
        try {
          ws.close();
        } catch {}
        return;
      }

      ws.on("pong", () => {
        ws._lastAliveAt = Date.now();
      });

      ws.on("message", (message: WebSocket.RawData) => {
        ws._lastAliveAt = Date.now();
        markSessionActivity(session);
        const payload = message.toString();

        if (payload.startsWith("{")) {
          try {
            const data = JSON.parse(payload) as {
              type?: string;
              cols?: number;
              rows?: number;
            };
            if (data.type === "resize" && data.cols && data.rows) {
              session.lastCols = Math.max(1, data.cols);
              session.lastRows = Math.max(1, data.rows);
              appendLedgerEvent(
                session,
                "resize",
                { cols: session.lastCols, rows: session.lastRows },
                null,
              );
              session.term.resize(session.lastCols, session.lastRows);
              return;
            }
            if (data.type === "ping") {
              sendEvent(ws, { type: "pong" });
              return;
            }
          } catch {
            // fall through
          }
        }

        appendLedgerEvent(session, "input", { data: payload }, null);
        session.term.write(payload);
      });

      ws.on("close", () => {
        const bound = ws._terminalSession;
        if (!bound) return;
        bound.clients.delete(ws);
        markSessionActivity(bound);
        ws._terminalSession = null;
        ws._terminalSessionId = null;
        if (getActiveClientCount(bound) === 0) scheduleCleanup(bound);
      });
    } catch (error) {
      sendEvent(ws, {
        type: "error",
        message:
          error instanceof Error ? error.message : "terminal_init_failed",
      });
      try {
        ws.close();
      } catch {}
    }
  });

  return {
    async getStatus(): Promise<TerminalStatusPayload> {
      return buildStatusPayload();
    },

    async listWorkspaceSessions(): Promise<TerminalSessionSummaryResponse> {
      return buildSessionSummaryPayload();
    },

    async listPersistedSessions(): Promise<TerminalSessionSummaryResponse> {
      return {
        sessions: descriptorStore
          .listRecent()
          .map((descriptor) => reconcilePersistedDescriptor(descriptor))
          .filter((descriptor): descriptor is TerminalSessionDescriptor =>
            Boolean(descriptor),
          ),
      };
    },

    async getPersistedSession(
      sessionId: string,
    ): Promise<TerminalSessionDescriptor | null> {
      return reconcilePersistedDescriptor(descriptorStore.get(sessionId));
    },

    async renamePersistedSession(
      sessionId: string,
      title: string,
    ): Promise<TerminalSessionDescriptor | null> {
      return descriptorStore.rename(sessionId, title);
    },

    async deletePersistedSession(sessionId: string): Promise<{
      success: boolean;
      sessionId: string;
      reason?: "session_active";
    }> {
      const normalized = String(sessionId || "").trim();
      if (!normalized) {
        return {
          success: false,
          sessionId: normalized,
        };
      }

      const runtimeSession = sessions.get(normalized);
      if (runtimeSession && !runtimeSession.closed) {
        return {
          success: false,
          sessionId: normalized,
          reason: "session_active",
        };
      }

      const persisted = descriptorStore.get(normalized);
      if (persisted) {
        if (persisted.status === "running" || persisted.status === "detached") {
          return {
            success: false,
            sessionId: normalized,
            reason: "session_active",
          };
        }
      }

      const deleted = descriptorStore.remove(normalized);
      return {
        success: deleted,
        sessionId: normalized,
      };
    },

    async listSessionLedger(
      sessionId: string,
    ): Promise<TerminalSessionLedgerEvent[]> {
      return ledger.listBySession(sessionId);
    },

    async listWorkspaceActions(): Promise<TerminalActionCatalogResponse> {
      return buildTerminalActionCatalog();
    },

    async installCli(
      target: TerminalInstallRequestId,
    ): Promise<TerminalInstallResponse> {
      return runInstallWorkflow(target);
    },

    async streamInstallCli(
      target: TerminalInstallRequestId,
      emit: (event: TerminalInstallStreamEvent) => void | Promise<void>,
    ): Promise<TerminalInstallResponse> {
      return runInstallWorkflow(target, emit);
    },

    async getLaunchCommand(
      payload: TerminalLaunchPayload,
    ): Promise<TerminalLaunchResponse> {
      const status = await buildStatusPayload();
      const selectedModel = payload.model || status.config.model || "";
      let command = "";
      let label = "";

      if (payload.cli === "claude") {
        command = "claude --dangerously-skip-permissions";
        if (selectedModel) command += ` --model ${selectedModel}`;
        label = "Claude CLI";
      } else if (payload.cli === "codex") {
        command = "codex --full-auto";
        if (selectedModel) command += ` --model ${selectedModel}`;
        label = "Codex CLI";
      } else if (payload.cli === "opencode") {
        command = "opencode";
        label = "OpenCode CLI";
      } else {
        command = "bash";
        label = "Bash";
      }

      return {
        cli: payload.cli,
        command,
        label,
      };
    },

    async endSession(
      payload: TerminalEndPayload,
    ): Promise<TerminalEndResponse> {
      const sid = String(payload.sid || "").trim();
      if (!sid) {
        throw new Error("sid is required");
      }
      const existed = sessions.has(sid);
      destroySession(sid);
      return {
        success: true,
        sid,
        ended: existed,
      };
    },

    attachGatewayClient(
      payload: TerminalGatewayAttachPayload,
      runtime: TerminalGatewayRuntime,
    ): TerminalGatewayAttachResponse {
      if (!pty) {
        throw new Error(
          "node-pty is not available; terminal sessions are disabled",
        );
      }
      const session = getOrCreateSession(payload.sid || null, {
        resumePersisted: normalizeResumeSession(payload.resume),
      });
      if (payload.handoffContext) {
        session.source = "system-handoff";
        session.sourceModule = payload.handoffContext.fromModule || "system";
        session.sourceAction =
          payload.handoffContext.triggerType || "system-handoff";
        session.originRoute =
          payload.handoffContext.fromRoute || `/terminal/${session.id}`;
        session.handoffContext = payload.handoffContext;
      }
      registerGatewaySubscriber(session, runtime);
      persistSessionDescriptor(session);
      return {
        sid: session.id,
        leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS,
        events: buildAttachEvents(session, payload),
      };
    },

    sendGatewayInput(
      payload: TerminalGatewayInputPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      markSessionActivity(session);
      appendLedgerEvent(
        session,
        "input",
        { data: String(payload.data || "") },
        runtime.connId,
      );
      session.term.write(String(payload.data || ""));
      return createGatewayAck(session);
    },

    resizeGatewayClient(
      payload: TerminalGatewayResizePayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      markSessionActivity(session);
      session.lastCols = Math.max(1, Number(payload.cols || 0));
      session.lastRows = Math.max(1, Number(payload.rows || 0));
      appendLedgerEvent(
        session,
        "resize",
        { cols: session.lastCols, rows: session.lastRows },
        runtime.connId,
      );
      session.term.resize(session.lastCols, session.lastRows);
      return createGatewayAck(session);
    },

    heartbeatGatewayClient(
      payload: TerminalGatewayHeartbeatPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      markSessionActivity(session);
      return createGatewayAck(session);
    },

    detachGatewayClient(
      payload: TerminalGatewayDetachPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const targetSessionId = String(payload.sid || "").trim();
      detachGatewayConnId(runtime.connId, targetSessionId || null);
      if (targetSessionId) {
        const session = sessions.get(targetSessionId);
        if (session && !session.closed) {
          persistSessionDescriptor(session);
        }
      }
      return {
        ok: true,
        sid: targetSessionId || "",
      };
    },

    handleUpgrade(
      req: http.IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ): boolean {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "127.0.0.1"}`,
      );
      if (url.pathname !== "/ws/terminal") return false;
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        wss.emit("connection", ws, req);
      });
      return true;
    },

    dispose(): void {
      clearInterval(pingTimer);
      clearInterval(gatewaySweepTimer);
      for (const sessionId of Array.from(sessions.keys())) {
        destroySession(sessionId);
      }
      try {
        wss.close();
      } catch {}
    },
  };
}
