import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  EventDispatcher,
  LoggerLevel,
  WSClient,
  type Logger,
  type WSConnectionStatus,
} from "@larksuiteoapi/node-sdk";
import type {
  ChannelConnectorFeishuInteractiveCard,
  ChannelConnectorFeishuTransportConfig,
  ChannelConnectorFeishuTransportResult,
  ChannelConnectorAgentProfile,
  ChannelConnectorInboundAttachment,
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorOctoTransportConfig,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorPlatformBinding,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import {
  buildChannelConnectorAgentProcessRequest,
  runChannelConnectorAgentTurn,
  type ChannelConnectorAgentProgressEvent,
  type ChannelConnectorAgentTurnResult,
  type ChannelConnectorRuntimeBinding,
  type ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import {
  createChannelConnectorAgentSessionDriverPool,
  resolveChannelConnectorAgentSessionDriverMode,
  type ChannelConnectorAgentSessionDriverMode,
  type ChannelConnectorAgentSessionDriverStatus,
} from "./agent-session-driver.js";
import {
  createCodexAppServerSessionDriverFactory,
  JsonLineCodexAppServerTransport,
} from "./codex-app-server-driver.js";
import {
  clearChannelConnectorAgentSessionsForConversation,
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
  upsertChannelConnectorAgentSession,
  type ChannelConnectorAgentSessionRecord,
} from "./agent-session-store.js";
import {
  handleChannelConnectorCommand,
  listChannelConnectorGatewayModels,
  resolveChannelConnectorEffectiveProject,
  type ChannelConnectorUsageSummary,
} from "./command-router.js";
import {
  countChannelConnectorVisualAttachments,
  resolveChannelConnectorVisualTurnProject,
} from "./visual-model-routing.js";
import {
  getChannelConnectorSessionControl,
  type ChannelConnectorSessionControlRecord,
} from "./session-control-store.js";
import {
  appendChannelConnectorConversationHistory,
  compactChannelConnectorConversationHistory,
  getChannelConnectorConversationHistory,
  renderChannelConnectorConversationHistoryContext,
} from "./conversation-history-store.js";
import {
  resolveChannelConnectorGatewayClientKey,
} from "./gateway-secret.js";
import {
  evaluateChannelConnectorGovernance,
} from "./governance-policy.js";
import {
  getOctoCachedCredentials,
  saveOctoCachedCredentials,
  type OctoCredentialCacheEntry,
} from "./octo-credential-cache.js";
import {
  attachExtractedOctoAttachments,
  buildOctoSessionKey,
  extractOctoAttachments,
  extractOctoContent,
  isOctoGroupChannel,
  isOctoMessageDirectedAtBot,
  renderOctoTextReply,
  shouldSkipOctoMessage,
} from "./octo-adapter.js";
import {
  prepareChannelConnectorGroupBufferedReply,
} from "./reply-buffer-store.js";
import {
  buildFeishuSessionKey,
  parseChannelConnectorFeishuWebhook,
  type ChannelConnectorFeishuParsedWebhook,
} from "./feishu-adapter.js";
import {
  addFeishuMessageReaction,
  downloadFeishuMessageResourceToFile,
  feishuTransportFromMetadata,
  listFeishuChatMembers,
  patchFeishuCardMessage,
  removeFeishuMessageReaction,
  sendFeishuCardMessage,
  sendFeishuPostMessage,
  sendFeishuTextMessage,
  uploadAndSendFeishuMedia,
} from "./feishu-transport.js";
import {
  DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES,
  finalizeChannelConnectorAttachmentStaging,
  parseChannelConnectorByteSize,
  prepareChannelConnectorAttachmentStagingTarget,
  stageChannelConnectorAttachmentUrl,
} from "./attachment-staging.js";
import {
  buildChannelConnectorCommandSurface,
  channelConnectorCommandSurfaceSectionFromCommand,
  channelConnectorCommandSurfaceViewFromCommand,
  extractChannelConnectorCommandFromActionValue,
  extractChannelConnectorSurfaceActionPayload,
  normalizeChannelConnectorCommandSurfaceSection,
  normalizeChannelConnectorCommandSurfaceView,
  renderChannelConnectorCommandSurfaceFeishu,
} from "./command-surface.js";
import {
  octoTransportFromMetadata,
  registerOctoBot,
  sendOctoHeartbeat,
  sendOctoTextReply,
  sendOctoTyping,
  uploadAndSendOctoMedia,
} from "./octo-transport.js";
import {
  DEFAULT_CHANNEL_CONNECTOR_OUTBOUND_FILE_MAX_BYTES,
  extractChannelConnectorOutboundFiles,
  resolveChannelConnectorOutboundFiles,
  type ChannelConnectorResolvedOutboundFile,
} from "./outbound-files.js";
import {
  deriveOctoWsUrl,
  OctoWukongSocket,
  type OctoWukongLogger,
  type OctoWukongSocketStatus,
} from "./octo-wukong.js";

const DEFAULT_FEISHU_PING_TIMEOUT_SECONDS = 10;
const MIN_FEISHU_PING_TIMEOUT_SECONDS = 0;
const MAX_FEISHU_PING_TIMEOUT_SECONDS = 300;
const DEFAULT_FEISHU_WATCHDOG_RESTART_MS = 45_000;
const MIN_FEISHU_WATCHDOG_RESTART_MS = 10_000;
const MAX_FEISHU_WATCHDOG_RESTART_MS = 600_000;
// CC Go keeps Feishu's SDK WebSocket alive and lets the SDK reconnect on real
// disconnects. This daemon has also observed Feishu "ready/connected" sockets
// that stop delivering events after a successful inbound turn. Keep refreshes
// low-frequency and scoped to the current connection lifecycle; aggressive
// reconnects make Feishu look unstable and can trigger platform redelivery.
const DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS = 5 * 60_000;
const MIN_FEISHU_CONNECTED_IDLE_RENEW_MS = 60_000;
const MAX_FEISHU_CONNECTED_IDLE_RENEW_MS = 3_600_000;
const DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS = 30_000;
const MIN_FEISHU_ZERO_INBOUND_RENEW_MS = 30_000;
const MAX_FEISHU_ZERO_INBOUND_RENEW_MS = 15 * 60_000;
const DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX = 1;
const MAX_FEISHU_ZERO_INBOUND_RENEW_MAX = 10;
const DEFAULT_OCTO_HEARTBEAT_MS = 30_000;
const MIN_OCTO_HEARTBEAT_MS = 5_000;
const MAX_OCTO_HEARTBEAT_MS = 300_000;
const DEFAULT_OCTO_PONG_TIMEOUT_MS = 10_000;
const MIN_OCTO_PONG_TIMEOUT_MS = 5_000;
const MAX_OCTO_PONG_TIMEOUT_MS = 120_000;
const DEFAULT_OCTO_RECONNECT_MS = 3_000;
const MIN_OCTO_RECONNECT_MS = 500;
const MAX_OCTO_RECONNECT_MS = 60_000;
const DEFAULT_OCTO_RECONNECT_JITTER_MS = 3_000;
const MIN_OCTO_RECONNECT_JITTER_MS = 0;
const MAX_OCTO_RECONNECT_JITTER_MS = 60_000;
const DEFAULT_OCTO_REST_HEARTBEAT_MS = 5 * 60_000;
const MIN_OCTO_REST_HEARTBEAT_MS = 30_000;
const MAX_OCTO_REST_HEARTBEAT_MS = 30 * 60_000;
const FEISHU_FINAL_REPLY_CARD_MAX_RUNES = 12_000;
const CHANNEL_COMPACT_HISTORY_LIMIT = 40;
const CHANNEL_COMPACT_PROMPT_MAX_RUNES = 24_000;
const CHANNEL_COMPACT_TIMEOUT_MS = 45_000;

const channelAgentSessionDriverPool = createChannelConnectorAgentSessionDriverPool({
  factory: createCodexAppServerSessionDriverFactory({
    transportFactory: ({ key, agentTurnRequest }) => {
      const processRequest = agentTurnRequest
        ? buildChannelConnectorAgentProcessRequest(agentTurnRequest)
        : null;
      return new JsonLineCodexAppServerTransport({
        cwd: key.workDir,
        env: processRequest?.env || {},
      });
    },
  }),
});

interface ChannelDaemonOctoConnectionState extends OctoWukongSocketStatus {
  accountId: string;
  botId: string | null;
  robotId: string | null;
  apiUrl: string | null;
  credentialSource: "register" | "cache" | null;
  restHeartbeatIntervalMs: number;
  restHeartbeatSuccesses: number;
  restHeartbeatFailures: number;
  restHeartbeatLastOkAt: string | null;
  restHeartbeatLastErrorAt: string | null;
  restHeartbeatLastError: string | null;
}

interface ChannelDaemonFeishuConnectionState {
  key: string;
  appId: string;
  accountId: string;
  apiUrl: string | null;
  bindingIds: string[];
  connected: boolean;
  state: WSConnectionStatus["state"] | "closed";
  lastError: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastReceivedAt: string | null;
  lastUnhealthyAt: string | null;
  connectedIdleRenewAfterMs: number;
  zeroInboundRenewAfterMs: number;
  zeroInboundRenewals: number;
  lifecycleReceivedMessages: number;
  lifecycleLastReceivedAt: string | null;
  suppressZeroInboundRenewal: boolean;
  lastWatchdogRestartAt: string | null;
  lastWatchdogRestartReason: string | null;
  reconnects: number;
  receivedMessages: number;
}

interface ChannelDaemonFeishuBindingRef {
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorFeishuTransportConfig;
}

interface ChannelDaemonFeishuGroup {
  key: string;
  appId: string;
  accountId: string;
  apiUrl: string | null;
  refs: ChannelDaemonFeishuBindingRef[];
  client: WSClient | null;
  reconnects: number;
  receivedMessages: number;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastReceivedAt: string | null;
  lifecycleReceivedMessages: number;
  lifecycleLastReceivedAt: string | null;
  suppressZeroInboundRenewal: boolean;
  lastWatchdogRestartAt: string | null;
  lastWatchdogRestartReason: string | null;
  lastUnhealthyAt: string | null;
  lastError: string | null;
  watchdogRestarting: boolean;
  zeroInboundRenewals: number;
}

interface ChannelDaemonState {
  version: 1;
  pid: number;
  startedAt: string;
  updatedAt: string;
  management: ChannelConnectorsDaemonRuntimeConfig["management"];
  projects: Array<{
    id: string;
    agent: string;
    platformBindings: number;
  }>;
  octoConnections: Record<string, ChannelDaemonOctoConnectionState>;
  feishuConnections: Record<string, ChannelDaemonFeishuConnectionState>;
  agentSessionDriver: ChannelDaemonAgentSessionDriverState;
  activeRuns: Array<{
    id: string;
    startedAt: string;
    updatedAt: string;
    bindingId: string;
    sessionKey: string;
    messageId: string;
    agent: string;
    model: string | null;
    status: "running";
    sessionResumed: boolean;
    codexThreadId: string | null;
    progressEventCount: number;
    latestProgress: ChannelConnectorAgentProgressEvent | null;
    ingressAt?: string;
    ingressToAgentStartMs?: number;
    agentElapsedMs?: number;
    firstProgressLatencyMs?: number | null;
  }>;
  agentRuns: Array<{
    checkedAt: string;
    bindingId: string;
    sessionKey: string;
    messageId: string;
    agent: string;
    status: ChannelConnectorAgentTurnResult["status"];
    ok: boolean | null;
    durationMs: number;
    error: string | null;
    sessionResumed: boolean;
    codexThreadId: string | null;
    progressEventCount: number;
    latestProgress: ChannelConnectorAgentProgressEvent | null;
    ingressAt?: string;
    startedAt?: string;
    finishedAt?: string;
    totalElapsedMs?: number;
    agentElapsedMs?: number;
    firstProgressLatencyMs?: number | null;
    finalProgressLagMs?: number | null;
    usage?: ChannelConnectorUsageSummary | null;
  }>;
}

interface ChannelDaemonAgentSessionDriverBindingState {
  projectId: string;
  bindingId: string;
  platform: string;
  accountId: string;
  botId: string | null;
  agent: string;
  model: string | null;
  requestedMode: "one-shot" | "persistent";
  effectiveMode: "one-shot" | "persistent";
  reason: "default" | "codex-app-server-experimental" | "unsupported-agent";
}

interface ChannelDaemonAgentSessionDriverState {
  defaultMode: "one-shot";
  implementation: "codex-app-server-experimental";
  persistentDriverReady: true;
  policy: {
    idleTimeoutMs: number;
    maxSessions: number;
    fallbackOnCrash: boolean;
  };
  requestedPersistentBindings: ChannelDaemonAgentSessionDriverBindingState[];
  bindings: ChannelDaemonAgentSessionDriverBindingState[];
  activeSessions: ChannelConnectorAgentSessionDriverStatus[];
}

interface ChannelDaemonActiveRunCancelEntry {
  controller: AbortController;
  startedAt: string;
  bindingId: string;
  sessionKey: string;
  messageId: string;
  agent: string;
  model: string | null;
}

type ChannelDaemonActiveRunCancelRegistry = Map<string, ChannelDaemonActiveRunCancelEntry>;

interface ChannelDaemonActiveRunLookupResult {
  runId: string;
  entry: ChannelDaemonActiveRunCancelEntry;
}

type ChannelDaemonSessionRunQueueRegistry = Map<string, {
  tail: Promise<void>;
  pending: number;
}>;

interface ChannelDaemonSessionRunLease {
  queued: boolean;
  queuePosition: number;
  release: () => void;
}

interface ChannelDaemonStopActiveRunResult {
  stopped: boolean;
  runId: string | null;
  messageId: string | null;
  agent: string | null;
  model: string | null;
  error: string | null;
}

type FeishuProgressCardEntryKind = "info" | "thinking" | "tool_use" | "tool_result" | "error";

const channelSessionAgentRunQueues: ChannelDaemonSessionRunQueueRegistry = new Map();

interface FeishuProgressCardEntry {
  kind: FeishuProgressCardEntryKind;
  title: string;
  text: string;
  checkedAt: string;
  fingerprint: string;
  rawType: string | null;
  itemType: string | null;
}

interface FeishuProgressCardState {
  messageId: string | null;
  status: "running" | "completed" | "failed";
  startedAtMs: number;
  updatedAtMs: number;
  dirty: boolean;
  entries: FeishuProgressCardEntry[];
  seenFingerprints: Set<string>;
  latestError: string | null;
}

interface ChannelConnectorProgressDefaults {
  isGroup: boolean;
  streamMessages: boolean;
  toolMessages: boolean;
}

function configPathFromArgv(argv: string[]): string {
  const index = argv.findIndex((item) => item === "--config");
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const inline = argv.find((item) => item.startsWith("--config="));
  if (inline) return inline.slice("--config=".length);
  throw new Error("Missing --config <path>");
}

function readConfig(filePath: string): ChannelConnectorsDaemonRuntimeConfig {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as ChannelConnectorsDaemonRuntimeConfig;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendLog(filePath: string, message: string, meta?: Record<string, unknown>): void {
  ensureDir(path.dirname(filePath));
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  fs.appendFileSync(filePath, `${new Date().toISOString()} ${message}${suffix}\n`, "utf8");
}

function writeJsonLine(filePath: string, value: Record<string, unknown>): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function writeJsonFileAtomic(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeRuntime(config: ChannelConnectorsDaemonRuntimeConfig, state: ChannelDaemonState): void {
  ensureDir(path.dirname(config.paths.runtime));
  state.agentSessionDriver = buildAgentSessionDriverState(config);
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(config.paths.runtime, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function createDaemonState(config: ChannelConnectorsDaemonRuntimeConfig): ChannelDaemonState {
  const now = new Date().toISOString();
  return {
    version: 1,
    pid: process.pid,
    startedAt: now,
    updatedAt: now,
    management: config.management,
    projects: config.projects.map((project) => ({
      id: project.id,
      agent: project.agent,
      platformBindings: project.platformBindings.length,
    })),
    octoConnections: {},
    feishuConnections: {},
    agentSessionDriver: buildAgentSessionDriverState(config),
    activeRuns: [],
    agentRuns: [],
  };
}

function effectiveAgentSessionDriverMode(input: {
  binding: ChannelConnectorRuntimeBinding;
  project: ChannelConnectorRuntimeProject;
}): { requestedMode: ChannelConnectorAgentSessionDriverMode; effectiveMode: ChannelConnectorAgentSessionDriverMode; reason: ChannelDaemonAgentSessionDriverBindingState["reason"] } {
  const requestedMode = resolveChannelConnectorAgentSessionDriverMode(input.binding.metadata);
  if (requestedMode !== "persistent") {
    return {
      requestedMode,
      effectiveMode: "one-shot",
      reason: "default",
    };
  }
  if (input.project.agent !== "codex") {
    return {
      requestedMode,
      effectiveMode: "one-shot",
      reason: "unsupported-agent",
    };
  }
  return {
    requestedMode,
    effectiveMode: "persistent",
    reason: "codex-app-server-experimental",
  };
}

function buildAgentSessionDriverState(
  config: ChannelConnectorsDaemonRuntimeConfig,
  activeSessions: ChannelConnectorAgentSessionDriverStatus[] = channelAgentSessionDriverPool.status(),
): ChannelDaemonAgentSessionDriverState {
  const bindings = config.projects.flatMap((project) => {
    return project.platformBindings.map((binding) => {
      const mode = effectiveAgentSessionDriverMode({ binding, project });
      return {
        projectId: project.id,
        bindingId: binding.id,
        platform: binding.platform,
        accountId: binding.accountId,
        botId: binding.botId,
        agent: project.agent,
        model: project.model,
        requestedMode: mode.requestedMode,
        effectiveMode: mode.effectiveMode,
        reason: mode.reason,
      };
    });
  });
  return {
    defaultMode: "one-shot",
    implementation: "codex-app-server-experimental",
    persistentDriverReady: true,
    policy: channelAgentSessionDriverPool.policy(),
    requestedPersistentBindings: bindings.filter((binding) => binding.requestedMode === "persistent"),
    bindings,
    activeSessions,
  };
}

function agentSessionDriverStatusResponse(
  config: ChannelConnectorsDaemonRuntimeConfig,
  input: {
    reaped?: number;
    killed?: ChannelConnectorAgentSessionDriverStatusResponse["killed"];
  } = {},
): ChannelConnectorAgentSessionDriverStatusResponse {
  const state = buildAgentSessionDriverState(config);
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    ...state,
    policy: channelAgentSessionDriverPool.policy(),
    ...(input.reaped == null ? {} : { reaped: input.reaped }),
    killed: input.killed ?? null,
  };
}

function parseRequestJson<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendDaemonJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function handleAgentSessionManagement(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ChannelConnectorsDaemonRuntimeConfig,
): Promise<void> {
  if (req.method === "GET") {
    const reaped = await channelAgentSessionDriverPool.reapIdle();
    sendDaemonJson(res, 200, agentSessionDriverStatusResponse(config, { reaped }));
    return;
  }
  if (req.method !== "POST") {
    sendDaemonJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  const payload = await parseRequestJson<ChannelConnectorAgentSessionActionRequest>(req);
  const action = payload.action || "status";
  if (action === "status") {
    sendDaemonJson(res, 200, agentSessionDriverStatusResponse(config));
    return;
  }
  if (action === "reap-idle") {
    const reaped = await channelAgentSessionDriverPool.reapIdle();
    sendDaemonJson(res, 200, agentSessionDriverStatusResponse(config, { reaped }));
    return;
  }
  if (action === "kill") {
    const poolKey = normalizeString(payload.poolKey);
    if (!poolKey) {
      sendDaemonJson(res, 400, { ok: false, error: "pool_key_required" });
      return;
    }
    const killed = await channelAgentSessionDriverPool.killSessionByPoolKey(
      poolKey,
      normalizeString(payload.reason) || "manual-kill",
    );
    sendDaemonJson(res, 200, agentSessionDriverStatusResponse(config, {
      killed: {
        requested: true,
        killed: killed.killed,
        sessionId: killed.sessionId,
        poolKey,
      },
    }));
    return;
  }
  sendDaemonJson(res, 400, { ok: false, error: "unsupported_agent_session_action" });
}

function latestActiveRunForSession(
  registry: ChannelDaemonActiveRunCancelRegistry,
  input: { bindingId: string; sessionKey: string },
): ChannelDaemonActiveRunLookupResult | null {
  const candidates = [...registry.entries()]
    .filter(([, entry]) => entry.bindingId === input.bindingId && entry.sessionKey === input.sessionKey)
    .sort((left, right) => right[1].startedAt.localeCompare(left[1].startedAt));
  const [runId, entry] = candidates[0] || [];
  return runId && entry ? { runId, entry } : null;
}

function stopLatestActiveRunForSession(
  registry: ChannelDaemonActiveRunCancelRegistry,
  input: { bindingId: string; sessionKey: string },
): ChannelDaemonStopActiveRunResult {
  const activeRun = latestActiveRunForSession(registry, input);
  if (!activeRun) {
    return {
      stopped: false,
      runId: null,
      messageId: null,
      agent: null,
      model: null,
      error: null,
    };
  }
  const { runId, entry } = activeRun;
  if (entry.controller.signal.aborted) {
    return {
      stopped: false,
      runId,
      messageId: entry.messageId,
      agent: entry.agent,
      model: entry.model,
      error: "当前 Agent 运行已经在停止中。",
    };
  }
  entry.controller.abort();
  return {
    stopped: true,
    runId,
    messageId: entry.messageId,
    agent: entry.agent,
    model: entry.model,
    error: null,
  };
}

function sessionRunQueueKey(input: { bindingId: string; sessionKey: string }): string {
  return [input.bindingId, input.sessionKey].map((part) => encodeURIComponent(part)).join("|");
}

async function acquireChannelSessionAgentRun(
  registry: ChannelDaemonSessionRunQueueRegistry,
  input: {
    bindingId: string;
    sessionKey: string;
    parallel: boolean;
    onQueued?: (queuePosition: number) => Promise<void> | void;
  },
): Promise<ChannelDaemonSessionRunLease> {
  if (input.parallel) {
    return {
      queued: false,
      queuePosition: 0,
      release: () => undefined,
    };
  }
  const key = sessionRunQueueKey(input);
  const existing = registry.get(key);
  let releaseCurrent: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const previous = existing?.tail || Promise.resolve();
  const queuePosition = existing ? existing.pending + 1 : 0;
  const nextTail = previous.catch(() => undefined).then(() => current);
  registry.set(key, {
    tail: nextTail,
    pending: (existing?.pending || 0) + 1,
  });
  if (existing) {
    await input.onQueued?.(queuePosition);
    await previous.catch(() => undefined);
  }
  const state = registry.get(key);
  if (state) state.pending = Math.max(0, state.pending - 1);
  let released = false;
  return {
    queued: Boolean(existing),
    queuePosition,
    release: () => {
      if (released) return;
      released = true;
      releaseCurrent();
      void nextTail.finally(() => {
        if (registry.get(key)?.tail === nextTail) registry.delete(key);
      });
    },
  };
}

function startHttp(config: ChannelConnectorsDaemonRuntimeConfig, state: ChannelDaemonState): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }
    if (req.url === "/status") {
      state.agentSessionDriver = buildAgentSessionDriverState(config);
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ok: true,
        implementation: "studio-native",
        pid: process.pid,
        projects: config.projects.length,
        platformBindings: config.projects.reduce((sum, project) => sum + project.platformBindings.length, 0),
        octoConnections: Object.values(state.octoConnections),
        feishuConnections: Object.values(state.feishuConnections),
        agentSessionDriver: state.agentSessionDriver,
        activeRuns: state.activeRuns,
        agentRuns: state.agentRuns,
      }));
      return;
    }
    if ((req.url || "").split("?")[0] === "/agent-sessions") {
      handleAgentSessionManagement(req, res, config).catch((error) => {
        sendDaemonJson(res, 500, {
          ok: false,
          error: "agent_session_management_failed",
          message: error instanceof Error ? error.message : "Agent session management failed.",
        });
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  server.listen(config.management.port, config.management.host);
  return server;
}

function logger(config: ChannelConnectorsDaemonRuntimeConfig): OctoWukongLogger {
  return {
    debug: (message, meta) => appendLog(config.paths.log, message, meta),
    info: (message, meta) => appendLog(config.paths.log, message, meta),
    warn: (message, meta) => appendLog(config.paths.log, message, meta),
    error: (message, meta) => appendLog(config.paths.log, message, meta),
  };
}

function feishuLogger(config: ChannelConnectorsDaemonRuntimeConfig): Logger {
  return {
    trace: (...args: unknown[]) => appendLog(config.paths.log, "Feishu SDK trace", { args: redactLogArgs(args) }),
    debug: (...args: unknown[]) => appendLog(config.paths.log, "Feishu SDK debug", { args: redactLogArgs(args) }),
    info: (...args: unknown[]) => appendLog(config.paths.log, "Feishu SDK info", { args: redactLogArgs(args) }),
    warn: (...args: unknown[]) => appendLog(config.paths.log, "Feishu SDK warn", { args: redactLogArgs(args) }),
    error: (...args: unknown[]) => appendLog(config.paths.log, "Feishu SDK error", { args: redactLogArgs(args) }),
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactLogArgs(args: unknown[]): string[] {
  return args.map((item) => shortMessage(
    typeof item === "string" ? item : JSON.stringify(item),
    220,
  ));
}

function shortMessage(value: unknown, maxLength = 260): string {
  const raw = value instanceof Error ? value.message : String(value || "");
  const shaped = jsonErrorEnvelopeMessage(raw) || raw;
  const redacted = shaped
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***")
    .replace(/bf_[A-Za-z0-9_-]{12,}/g, "bf_***")
    .replace(/(app_secret|appSecret|tenant_access_token|token)[^,\n}]*/gi, "$1=***")
    .trim();
  if (!redacted) return "unknown error";
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}...` : redacted;
}

function firstJsonObjectText(raw: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) return raw.slice(start, index + 1);
    }
  }
  return null;
}

function jsonStringField(raw: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"));
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1] || null;
  }
}

function errorEnvelopeFromRecord(record: Record<string, unknown>): string | null {
  const error = isRecord(record.error) ? record.error : record;
  const message = normalizeString(error.message)
    || normalizeString(record.message)
    || normalizeString(error.error)
    || normalizeString(record.error);
  const type = normalizeString(error.type) || normalizeString(record.type);
  const code = normalizeString(error.code) || normalizeString(record.code);
  if (!message && !type && !code) return null;
  const detail = [
    type ? `type=${type}` : "",
    code ? `code=${code}` : "",
  ].filter(Boolean).join(", ");
  if (message && detail) return `${message} (${detail})`;
  return message || detail || "upstream error";
}

function jsonErrorEnvelopeMessage(raw: string): string | null {
  const objectText = firstJsonObjectText(raw);
  if (objectText) {
    try {
      const parsed = JSON.parse(objectText) as unknown;
      if (isRecord(parsed)) {
        const shaped = errorEnvelopeFromRecord(parsed);
        if (shaped) return shaped;
      }
    } catch {
      // Fall through to field extraction for malformed or duplicated envelopes.
    }
  }
  const type = jsonStringField(raw, "type");
  const code = jsonStringField(raw, "code");
  const message = jsonStringField(raw, "message");
  if (!type && !code && !message) return null;
  const detail = [
    type ? `type=${type}` : "",
    code ? `code=${code}` : "",
  ].filter(Boolean).join(", ");
  if (message && detail) return `${message} (${detail})`;
  return message || detail || "upstream error";
}

function gatewayClientKey(config: ChannelConnectorsDaemonRuntimeConfig): string | null {
  return resolveChannelConnectorGatewayClientKey(config);
}

function nativeProfileFromRuntime(project: ChannelConnectorRuntimeProject): ChannelConnectorAgentProfile {
  return {
    id: project.id,
    name: project.name,
    agent: project.agent,
    model: project.model,
    workDir: project.workDir,
    permissionMode: project.permissionMode,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayKeyRef: project.gatewayKeyRef,
    appProfileRef: project.appProfileRef,
  };
}

function nativeBindingFromRuntime(
  project: ChannelConnectorRuntimeProject,
  binding: ChannelConnectorRuntimeBinding,
  robotId: string | null,
): ChannelConnectorPlatformBinding {
  return {
    id: binding.id,
    platform: binding.platform,
    accountId: binding.accountId,
    botId: binding.botId || robotId,
    displayName: binding.displayName,
    agentProfileId: project.id,
    enabled: binding.enabled,
    allowlist: binding.allowlist,
    adminUsers: binding.adminUsers,
    metadata: binding.metadata,
  };
}

function octoCredentialsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "octo-credentials.json");
}

function feishuTokenCachePath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "feishu-token-cache.json");
}

function metadataRecord(binding: ChannelConnectorRuntimeBinding): Record<string, unknown> {
  return isRecord(binding.metadata) ? binding.metadata : {};
}

function metadataString(binding: ChannelConnectorRuntimeBinding, keys: string[]): string {
  const metadata = metadataRecord(binding);
  for (const key of keys) {
    const value = normalizeString(metadata[key]);
    if (value) return value;
  }
  return "";
}

function metadataStringList(binding: ChannelConnectorRuntimeBinding, keys: string[]): string[] {
  const metadata = metadataRecord(binding);
  const values: string[] = [];
  for (const key of keys) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeString(item);
        if (normalized) values.push(normalized);
      }
      continue;
    }
    const normalized = normalizeString(value);
    if (!normalized) continue;
    values.push(...normalized.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(values)];
}

function metadataBoolean(binding: ChannelConnectorRuntimeBinding, keys: string[], fallback = false): boolean {
  const metadata = metadataRecord(binding);
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    const normalized = normalizeString(value).toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function channelSessionParallelAgentRunsEnabled(binding: ChannelConnectorRuntimeBinding): boolean {
  return metadataBoolean(binding, [
    "parallelAgentRuns",
    "parallel_agent_runs",
    "allowParallelAgentRuns",
    "allow_parallel_agent_runs",
    "allowSessionParallelRuns",
    "allow_session_parallel_runs",
  ], false);
}

function metadataNumber(binding: ChannelConnectorRuntimeBinding, keys: string[], fallback: number): number {
  const metadata = metadataRecord(binding);
  for (const key of keys) {
    const value = Number(metadata[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function firstFeishuBinding(group: ChannelDaemonFeishuGroup): ChannelConnectorRuntimeBinding | null {
  return group.refs[0]?.binding || null;
}

function feishuPingTimeoutSeconds(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuPingTimeoutSeconds",
      "feishu_ping_timeout_seconds",
      "pingTimeoutSeconds",
      "ping_timeout_seconds",
    ], DEFAULT_FEISHU_PING_TIMEOUT_SECONDS)
    : DEFAULT_FEISHU_PING_TIMEOUT_SECONDS;
  return clampNumber(Math.floor(value), MIN_FEISHU_PING_TIMEOUT_SECONDS, MAX_FEISHU_PING_TIMEOUT_SECONDS);
}

function feishuConnectedIdleRenewMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuConnectedIdleRenewMs",
      "feishu_connected_idle_renew_ms",
      "connectedIdleRenewMs",
      "connected_idle_renew_ms",
      "idleRenewMs",
      "idle_renew_ms",
    ], DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS)
    : DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_CONNECTED_IDLE_RENEW_MS, MAX_FEISHU_CONNECTED_IDLE_RENEW_MS);
}

function feishuZeroInboundRenewMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuZeroInboundRenewMs",
      "feishu_zero_inbound_renew_ms",
      "zeroInboundRenewMs",
      "zero_inbound_renew_ms",
      "startupRenewMs",
      "startup_renew_ms",
    ], DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS)
    : DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_ZERO_INBOUND_RENEW_MS, MAX_FEISHU_ZERO_INBOUND_RENEW_MS);
}

function feishuZeroInboundRenewMax(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuZeroInboundRenewMax",
      "feishu_zero_inbound_renew_max",
      "zeroInboundRenewMax",
      "zero_inbound_renew_max",
      "startupRenewMax",
      "startup_renew_max",
    ], DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX)
    : DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), 0, MAX_FEISHU_ZERO_INBOUND_RENEW_MAX);
}

function octoHeartbeatMs(binding: ChannelConnectorRuntimeBinding): number {
  return clampNumber(metadataNumber(binding, [
    "octoHeartbeatMs",
    "octo_heartbeat_ms",
    "heartbeatMs",
    "heartbeat_ms",
    "heartbeatIntervalMs",
    "heartbeat_interval_ms",
  ], DEFAULT_OCTO_HEARTBEAT_MS), MIN_OCTO_HEARTBEAT_MS, MAX_OCTO_HEARTBEAT_MS);
}

function octoPongTimeoutMs(binding: ChannelConnectorRuntimeBinding): number {
  return clampNumber(metadataNumber(binding, [
    "octoPongTimeoutMs",
    "octo_pong_timeout_ms",
    "pongTimeoutMs",
    "pong_timeout_ms",
  ], DEFAULT_OCTO_PONG_TIMEOUT_MS), MIN_OCTO_PONG_TIMEOUT_MS, MAX_OCTO_PONG_TIMEOUT_MS);
}

function octoReconnectMs(binding: ChannelConnectorRuntimeBinding): number {
  return clampNumber(metadataNumber(binding, [
    "octoReconnectMs",
    "octo_reconnect_ms",
    "reconnectMs",
    "reconnect_ms",
  ], DEFAULT_OCTO_RECONNECT_MS), MIN_OCTO_RECONNECT_MS, MAX_OCTO_RECONNECT_MS);
}

function octoReconnectJitterMs(binding: ChannelConnectorRuntimeBinding): number {
  return clampNumber(metadataNumber(binding, [
    "octoReconnectJitterMs",
    "octo_reconnect_jitter_ms",
    "reconnectJitterMs",
    "reconnect_jitter_ms",
  ], DEFAULT_OCTO_RECONNECT_JITTER_MS), MIN_OCTO_RECONNECT_JITTER_MS, MAX_OCTO_RECONNECT_JITTER_MS);
}

function octoRestHeartbeatMs(binding: ChannelConnectorRuntimeBinding): number {
  const value = metadataNumber(binding, [
    "octoRestHeartbeatMs",
    "octo_rest_heartbeat_ms",
    "restHeartbeatMs",
    "rest_heartbeat_ms",
  ], DEFAULT_OCTO_REST_HEARTBEAT_MS);
  if (value <= 0) return 0;
  return clampNumber(value, MIN_OCTO_REST_HEARTBEAT_MS, MAX_OCTO_REST_HEARTBEAT_MS);
}

function codexNativeImageArgPaths(args: string[]): string[] {
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--image") {
      const next = normalizeString(args[index + 1]);
      if (next) paths.push(next);
      index += 1;
      continue;
    }
    if (value.startsWith("--image=")) {
      const inline = normalizeString(value.slice("--image=".length));
      if (inline) paths.push(inline);
    }
  }
  return paths;
}

function feishuWatchdogRestartMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuWatchdogRestartMs",
      "feishu_watchdog_restart_ms",
      "watchdogRestartMs",
      "watchdog_restart_ms",
    ], DEFAULT_FEISHU_WATCHDOG_RESTART_MS)
    : DEFAULT_FEISHU_WATCHDOG_RESTART_MS;
  return clampNumber(Math.floor(value), MIN_FEISHU_WATCHDOG_RESTART_MS, MAX_FEISHU_WATCHDOG_RESTART_MS);
}

function metadataByteSize(binding: ChannelConnectorRuntimeBinding, keys: string[], fallback: number): number {
  const metadata = metadataRecord(binding);
  for (const key of keys) {
    if (!(key in metadata)) continue;
    const value = metadata[key];
    if (value === null || typeof value === "undefined") continue;
    if (typeof value === "string" && !value.trim()) continue;
    return parseChannelConnectorByteSize(value, fallback);
  }
  return fallback;
}

function describeByteSizeLimit(value: number): number | "unlimited" {
  return Number.isFinite(value) ? value : "unlimited";
}

function outboundFileMaxBytes(binding: ChannelConnectorRuntimeBinding): number {
  return metadataByteSize(binding, [
    "outboundFileMaxBytes",
    "outbound_file_max_bytes",
    "maxOutboundFileBytes",
    "max_outbound_file_bytes",
    "sendFileMaxBytes",
    "send_file_max_bytes",
  ], DEFAULT_CHANNEL_CONNECTOR_OUTBOUND_FILE_MAX_BYTES);
}

function prepareAgentOutboundReply(input: {
  replyText: string | null;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  agentRuntimeDir?: string | null;
}): {
  replyText: string;
  files: ChannelConnectorResolvedOutboundFile[];
  errors: string[];
  declaredCount: number;
  maxBytes: number;
} {
  const extracted = extractChannelConnectorOutboundFiles(input.replyText || "");
  const maxBytes = outboundFileMaxBytes(input.binding);
  const resolved = resolveChannelConnectorOutboundFiles({
    files: extracted.files,
    workDir: input.project.workDir,
    allowedRootDirs: input.agentRuntimeDir ? [input.agentRuntimeDir] : [],
    allowAnyPath: input.project.permissionMode === "yolo",
    maxBytes: Number.isFinite(maxBytes) ? maxBytes : null,
  });
  return {
    replyText: extracted.replyText,
    files: resolved.files,
    errors: [...extracted.errors, ...resolved.errors],
    declaredCount: extracted.files.length,
    maxBytes,
  };
}

function outboundFilesHistoryText(input: { replyText: string; files: ChannelConnectorResolvedOutboundFile[]; errors: string[] }): string {
  const parts = [input.replyText];
  if (input.files.length) {
    parts.push(`[Studio outbound files: ${input.files.map((file) => `${file.fileName} (${file.size} bytes)`).join(", ")}]`);
  }
  if (input.errors.length) {
    parts.push(`[Studio outbound file errors: ${input.errors.join("; ")}]`);
  }
  return parts.filter(Boolean).join("\n\n");
}

function appendOutboundFileErrors(replyText: string, errors: string[]): string {
  if (!errors.length) return replyText;
  const message = `文件发送准备失败：${errors.join("; ")}`;
  return [replyText, message].filter(Boolean).join("\n\n");
}

function queuedAgentRunReply(input: {
  activeRun: ChannelDaemonActiveRunCancelEntry | null;
  queuePosition: number;
}): string {
  const entry = input.activeRun;
  const target = entry ? [entry.agent, entry.model].filter(Boolean).join(" / ") : "";
  return [
    "上一条消息仍在处理中，本条已加入队列，将在前面的任务完成后自动处理。",
    input.queuePosition > 1 ? `队列位置：${input.queuePosition}` : "",
    "需要中断当前任务可以发送 `/stop`。",
    target ? `当前任务：${target}` : "",
    entry ? `当前消息：${shortMessage(entry.messageId, 80)}` : "",
  ].filter(Boolean).join("\n");
}

async function runChannelConnectorAgentTurnWithSessionDriver(input: {
  binding: ChannelConnectorRuntimeBinding;
  project: ChannelConnectorRuntimeProject;
  sessionKey: string;
  messageId: string;
  request: Parameters<typeof runChannelConnectorAgentTurn>[0];
}): Promise<ChannelConnectorAgentTurnResult> {
  const mode = effectiveAgentSessionDriverMode({
    binding: input.binding,
    project: input.project,
  }).effectiveMode;
  return channelAgentSessionDriverPool.runTurn({
    mode,
    key: {
      bindingId: input.binding.id,
      projectId: input.project.id,
      sessionKey: input.sessionKey,
      agent: input.project.agent,
      model: input.project.model,
      workDir: input.project.workDir,
      permissionMode: input.project.permissionMode,
    },
    messageId: input.messageId,
    agentTurnRequest: input.request,
    signal: input.request.signal || null,
    onProgress: input.request.onProgress,
    runOneShot: () => runChannelConnectorAgentTurn(input.request),
  });
}

async function sendOctoOutboundFiles(input: {
  transport: ChannelConnectorOctoTransportConfig;
  message: ChannelConnectorOctoInboundMessage;
  files: ChannelConnectorResolvedOutboundFile[];
}): Promise<{ sentCount: number; requestCount: number; errors: string[] }> {
  let sentCount = 0;
  let requestCount = 0;
  const errors: string[] = [];
  for (const file of input.files) {
    try {
      const result = await uploadAndSendOctoMedia(input.transport, {
        channelId: input.message.channelId,
        channelType: input.message.channelType,
        data: fs.readFileSync(file.localPath),
        fileName: file.fileName,
        mimeType: file.mimeType,
      });
      requestCount += result.requestCount;
      if (result.ok === true) {
        sentCount += 1;
      } else {
        errors.push(`${file.fileName}: ${result.error || "Octo upload/send failed"}`);
      }
    } catch (error) {
      errors.push(`${file.fileName}: ${shortMessage(error)}`);
    }
  }
  return { sentCount, requestCount, errors };
}

async function sendFeishuOutboundFiles(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  chatId: string;
  files: ChannelConnectorResolvedOutboundFile[];
}): Promise<{ sentCount: number; requestCount: number; errors: string[] }> {
  let sentCount = 0;
  let requestCount = 0;
  const errors: string[] = [];
  const cachePath = feishuTokenCachePath(input.config);
  for (const file of input.files) {
    try {
      const result = await uploadAndSendFeishuMedia(input.transport, {
        chatId: input.chatId,
        data: fs.readFileSync(file.localPath),
        fileName: file.fileName,
        mimeType: file.mimeType,
      }, cachePath);
      requestCount += result.requestCount;
      if (result.ok === true) {
        sentCount += 1;
      } else {
        errors.push(`${file.fileName}: ${result.error || "Feishu upload/send failed"}`);
      }
    } catch (error) {
      errors.push(`${file.fileName}: ${shortMessage(error)}`);
    }
  }
  return { sentCount, requestCount, errors };
}

function agentSessionsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-sessions.json");
}

function sessionControlsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-session-controls.json");
}

function conversationHistoryPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-history.json");
}

function replyBufferPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-reply-buffers.json");
}

function governanceStatePath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-governance.json");
}

function compactGatewayUrl(endpoint: string): string {
  return `${normalizeString(endpoint).replace(/\/+$/, "")}/responses/compact`;
}

function responseTextParts(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => responseTextParts(item));
  }
  if (!isRecord(value)) return [];
  const direct = normalizeString(value.output_text)
    || normalizeString(value.text)
    || normalizeString(value.content);
  if (direct) return [direct];
  const parts: string[] = [];
  if ("message" in value) parts.push(...responseTextParts(value.message));
  if ("content" in value) parts.push(...responseTextParts(value.content));
  if ("output" in value) parts.push(...responseTextParts(value.output));
  if ("choices" in value) parts.push(...responseTextParts(value.choices));
  return parts;
}

function gatewayCompactResponseText(raw: unknown): string | null {
  const text = responseTextParts(raw).join("\n").trim();
  return text || null;
}

function compactHistoryPrompt(input: {
  project: ChannelConnectorRuntimeProject;
  history: ReturnType<typeof getChannelConnectorConversationHistory>;
}): string {
  const lines = [
    "Summarize this Studio IM conversation for future CLI Agent context.",
    "Keep user goals, decisions, constraints, important files/directories, errors, tool results, and unresolved next steps.",
    "Do not invent facts. Keep it concise but operational.",
    "",
    `Agent: ${input.project.id} (${input.project.agent})`,
    `Model: ${input.project.model || "default"}`,
    `WorkDir: ${input.project.workDir}`,
    "",
    "Conversation:",
  ];
  input.history.forEach((entry, index) => {
    const role = entry.status === "compact-summary" ? "compact-summary" : entry.role;
    const status = entry.status ? ` status=${entry.status}` : "";
    const text = normalizeString(entry.text) || "(no text)";
    const attachments = entry.attachmentSummaries.length
      ? `\nattachments: ${entry.attachmentSummaries.join("; ")}`
      : "";
    lines.push(`${index + 1}. ${role}${status} @ ${entry.createdAt}\n${text}${attachments}`);
  });
  const prompt = lines.join("\n");
  const runes = Array.from(prompt);
  return runes.length > CHANNEL_COMPACT_PROMPT_MAX_RUNES
    ? runes.slice(runes.length - CHANNEL_COMPACT_PROMPT_MAX_RUNES).join("")
    : prompt;
}

async function requestGatewayCompactSummary(input: {
  endpoint: string;
  clientKey: string | null;
  project: ChannelConnectorRuntimeProject;
  prompt: string;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_COMPACT_TIMEOUT_MS);
  try {
    const payload: Record<string, unknown> = {
      input: input.prompt,
      stream: false,
      max_output_tokens: 1000,
      metadata: {
        studio_channel_compact: true,
        agent: input.project.agent,
        project_id: input.project.id,
      },
    };
    if (input.project.model) payload.model = input.project.model;
    const response = await fetch(compactGatewayUrl(input.endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.clientKey ? { authorization: `Bearer ${input.clientKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let body: unknown = rawText;
    try {
      body = rawText ? JSON.parse(rawText) as unknown : {};
    } catch {
      body = rawText;
    }
    if (!response.ok) {
      throw new Error(`Gateway compact failed with HTTP ${response.status}: ${shortMessage(rawText || response.statusText)}`);
    }
    const summary = gatewayCompactResponseText(body);
    if (!summary) throw new Error("Gateway compact response did not contain summary text.");
    return summary;
  } finally {
    clearTimeout(timer);
  }
}

async function compactChannelConnectorConversation(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  bindingId: string;
  sessionKey: string;
  project: ChannelConnectorRuntimeProject;
  gatewayClientKey: string | null;
}): Promise<{
  ok: boolean;
  beforeEntries: number;
  afterEntries: number;
  sessionsCleared: number;
  summaryText: string | null;
  error: string | null;
}> {
  const historyPath = conversationHistoryPath(input.config);
  const lookup = {
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
  };
  const history = getChannelConnectorConversationHistory(historyPath, lookup, CHANNEL_COMPACT_HISTORY_LIMIT);
  if (!history.length) {
    return {
      ok: false,
      beforeEntries: 0,
      afterEntries: 0,
      sessionsCleared: 0,
      summaryText: null,
      error: "当前 IM 会话没有可压缩的 history。",
    };
  }
  try {
    const summaryText = await requestGatewayCompactSummary({
      endpoint: input.project.gatewayEndpoint || input.config.gateway.endpoint,
      clientKey: input.gatewayClientKey,
      project: input.project,
      prompt: compactHistoryPrompt({ project: input.project, history }),
    });
    const compacted = compactChannelConnectorConversationHistory(historyPath, {
      ...lookup,
      messageId: `compact:${Date.now()}`,
      summaryText,
    });
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(agentSessionsPath(input.config), lookup);
    return {
      ok: true,
      beforeEntries: compacted.beforeEntries,
      afterEntries: compacted.afterEntries,
      sessionsCleared,
      summaryText,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      beforeEntries: history.length,
      afterEntries: history.length,
      sessionsCleared: 0,
      summaryText: null,
      error: `Studio compact 失败：${shortMessage(error)}`,
    };
  }
}

interface GatewayRuntimeLogEntryForUsage {
  id: string;
  finishedAt: string;
  outcome: string;
  appScope: string | null;
  providerId: string | null;
  model: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  } | null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return null;
}

function gatewayUsageNumber(value: unknown): number {
  return numberOrNull(value) ?? 0;
}

function normalizeGatewayRuntimeUsage(value: unknown): GatewayRuntimeLogEntryForUsage["usage"] {
  if (!isRecord(value)) return null;
  const inputTokens = gatewayUsageNumber(value.inputTokens);
  const outputTokens = gatewayUsageNumber(value.outputTokens);
  const totalTokens = gatewayUsageNumber(value.totalTokens) || inputTokens + outputTokens;
  const cacheReadTokens = gatewayUsageNumber(value.cacheReadTokens);
  const cacheCreationTokens = gatewayUsageNumber(value.cacheCreationTokens);
  if (!inputTokens && !outputTokens && !totalTokens && !cacheReadTokens && !cacheCreationTokens) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheCreationTokens,
  };
}

function modelGatewayRuntimePathCandidates(config: ChannelConnectorsDaemonRuntimeConfig): string[] {
  return uniqueStrings([
    path.resolve(config.paths.root, "..", "..", "model-gateway", "runtime.json"),
    path.join(os.homedir(), ".openclaw", "studio", "model-gateway", "runtime.json"),
    path.join(os.homedir(), ".config", "openclaw-studio", "model-gateway", "runtime.json"),
  ]);
}

function readModelGatewayRuntimeLog(config: ChannelConnectorsDaemonRuntimeConfig): GatewayRuntimeLogEntryForUsage[] {
  for (const filePath of modelGatewayRuntimePathCandidates(config)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (!isRecord(raw) || !Array.isArray(raw.requestLog)) continue;
      return raw.requestLog
        .filter(isRecord)
        .map((entry): GatewayRuntimeLogEntryForUsage | null => {
          const id = normalizeString(entry.id);
          const finishedAt = normalizeString(entry.finishedAt);
          if (!id || !finishedAt) return null;
          return {
            id,
            finishedAt,
            outcome: normalizeString(entry.outcome) || "failure",
            appScope: normalizeString(entry.appScope) || null,
            providerId: normalizeString(entry.providerId) || null,
            model: normalizeString(entry.model) || null,
            usage: normalizeGatewayRuntimeUsage(entry.usage),
          };
        })
        .filter((entry): entry is GatewayRuntimeLogEntryForUsage => Boolean(entry));
    } catch {
      continue;
    }
  }
  return [];
}

function gatewayAppScopeForAgent(agent: string): string | null {
  const normalized = normalizeString(agent).toLowerCase();
  if (normalized === "codex") return "codex";
  if (normalized === "claude-code" || normalized === "claude") return "claude-code";
  if (normalized === "opencode" || normalized === "openclaw") return "openclaw";
  return null;
}

function summarizeGatewayEntries(entries: GatewayRuntimeLogEntryForUsage[]): ChannelConnectorUsageSummary | null {
  const withUsage = entries.filter((entry) => entry.usage);
  if (!withUsage.length) return null;
  const providers = uniqueStrings(withUsage.map((entry) => entry.providerId || "").filter(Boolean));
  const models = uniqueStrings(withUsage.map((entry) => entry.model || "").filter(Boolean));
  return {
    source: "gateway-runtime-window",
    requests: withUsage.length,
    successfulRequests: withUsage.filter((entry) => entry.outcome === "success").length,
    failedRequests: withUsage.filter((entry) => entry.outcome !== "success").length,
    inputTokens: withUsage.reduce((sum, entry) => sum + (entry.usage?.inputTokens || 0), 0),
    outputTokens: withUsage.reduce((sum, entry) => sum + (entry.usage?.outputTokens || 0), 0),
    totalTokens: withUsage.reduce((sum, entry) => sum + (entry.usage?.totalTokens || 0), 0),
    cacheReadTokens: withUsage.reduce((sum, entry) => sum + (entry.usage?.cacheReadTokens || 0), 0),
    cacheCreationTokens: withUsage.reduce((sum, entry) => sum + (entry.usage?.cacheCreationTokens || 0), 0),
    lastRequestAt: withUsage
      .map((entry) => entry.finishedAt)
      .sort((left, right) => right.localeCompare(left))[0] || null,
    providers,
    models,
    requestIds: withUsage.map((entry) => entry.id),
  };
}

function summarizeModelGatewayUsageForAgentRun(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  startedAt: string;
  finishedAt: string;
}): ChannelConnectorUsageSummary | null {
  const startedAtMs = isoTimestampMs(input.startedAt);
  const finishedAtMs = isoTimestampMs(input.finishedAt);
  if (startedAtMs === null || finishedAtMs === null) return null;
  const windowStartMs = startedAtMs - 1_000;
  const windowEndMs = finishedAtMs + 5_000;
  const model = normalizeString(input.project.model).toLowerCase();
  const appScope = gatewayAppScopeForAgent(input.project.agent);
  const entries = readModelGatewayRuntimeLog(input.config).filter((entry) => {
    const finishedAtMs = isoTimestampMs(entry.finishedAt);
    if (finishedAtMs === null || finishedAtMs < windowStartMs || finishedAtMs > windowEndMs) return false;
    if (appScope && entry.appScope && entry.appScope !== appScope) return false;
    if (model && entry.model && entry.model.toLowerCase() !== model) return false;
    return true;
  });
  return summarizeGatewayEntries(entries);
}

function summarizeChannelConnectorUsageFromState(
  state: ChannelDaemonState,
  input: {
    bindingId: string;
    sessionKey: string;
  },
): ChannelConnectorUsageSummary | null {
  const runs = state.agentRuns
    .filter((run) => run.bindingId === input.bindingId && run.sessionKey === input.sessionKey && run.usage)
    .slice(0, 20);
  const summaries = runs
    .map((run) => run.usage)
    .filter((usage): usage is ChannelConnectorUsageSummary => Boolean(usage));
  if (!summaries.length) return null;
  return {
    source: "gateway-runtime-window",
    requests: summaries.reduce((sum, item) => sum + item.requests, 0),
    successfulRequests: summaries.reduce((sum, item) => sum + item.successfulRequests, 0),
    failedRequests: summaries.reduce((sum, item) => sum + item.failedRequests, 0),
    inputTokens: summaries.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: summaries.reduce((sum, item) => sum + item.outputTokens, 0),
    totalTokens: summaries.reduce((sum, item) => sum + item.totalTokens, 0),
    cacheReadTokens: summaries.reduce((sum, item) => sum + item.cacheReadTokens, 0),
    cacheCreationTokens: summaries.reduce((sum, item) => sum + item.cacheCreationTokens, 0),
    lastRequestAt: summaries
      .map((item) => item.lastRequestAt || "")
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left))[0] || null,
    providers: uniqueStrings(summaries.flatMap((item) => item.providers)),
    models: uniqueStrings(summaries.flatMap((item) => item.models)),
    requestIds: uniqueStrings(summaries.flatMap((item) => item.requestIds)).slice(0, 50),
  };
}

function safePathSegment(value: string): string {
  return encodeURIComponent(value || "default").replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function agentRuntimeDir(
  config: ChannelConnectorsDaemonRuntimeConfig,
  project: ChannelConnectorRuntimeProject,
  binding: ChannelConnectorRuntimeBinding,
): string {
  return path.join(
    config.paths.state,
    "agent-runtime",
    safePathSegment(project.agent),
    safePathSegment(project.id),
    safePathSegment(binding.id),
  );
}

function startOctoTypingPulse(
  transport: ChannelConnectorOctoTransportConfig | null,
  message: ChannelConnectorOctoInboundMessage,
): () => void {
  if (!transport) return () => {};
  const channelId = message.channelType === 1 ? message.fromUid : message.channelId;
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void sendOctoTyping(transport, channelId, message.channelType)
      .finally(() => {
        inFlight = false;
      });
  }, 8000);
  timer.unref();
  return () => clearInterval(timer);
}

function octoProgressTitle(event: ChannelConnectorAgentProgressEvent): string {
  if (event.type === "running") return "运行中";
  if (event.type === "reasoning") return "思考";
  if (event.type === "tool") return event.rawType?.endsWith(".started") ? "工具调用" : "工具结果";
  if (event.type === "failed") return "失败";
  if (event.type === "error") return "错误";
  if (event.type === "completed") return "完成";
  return "进度";
}

function progressKindIcon(kind: FeishuProgressCardEntryKind | ChannelConnectorAgentProgressEvent["type"]): string {
  if (kind === "thinking" || kind === "reasoning") return "💭";
  if (kind === "tool_use" || kind === "tool") return "🔧";
  if (kind === "tool_result") return "🟢";
  if (kind === "error" || kind === "failed") return "🔴";
  if (kind === "completed") return "✅";
  if (kind === "running") return "⏳";
  return "•";
}

function progressResultIcon(input: { status: string | null; exitCode: string | null }): string {
  if (progressStatusFailed(input.status) || (input.exitCode !== null && input.exitCode !== "0")) return "🔴";
  const label = progressStatusLabel(input.status);
  if (label === "完成" || input.exitCode === "0") return "🟢";
  if (label === "执行中") return "⏳";
  return "⚪";
}

function renderPlainProgressMessage(input: {
  icon: string;
  title: string;
  body: string;
  meta?: string;
}): string {
  const heading = [
    `${input.icon} **${input.title}**`,
    input.meta || "",
  ].filter(Boolean).join(" · ");
  const lines = [
    heading,
    input.body ? indentPlainProgressBody(input.body) : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function renderOctoProgressText(event: ChannelConnectorAgentProgressEvent): string {
  if (event.type === "tool") {
    const entry: FeishuProgressCardEntry = {
      kind: feishuProgressEntryKind(event),
      title: feishuProgressEntryTitle(event, feishuProgressEntryKind(event)),
      text: shortMessage(event.text || event.rawType || event.type, 900),
      checkedAt: event.checkedAt,
      fingerprint: "",
      rawType: event.rawType,
      itemType: event.itemType,
    };
    return renderPlainProgressEntry(entry);
  }
  const title = octoProgressTitle(event);
  const text = shortMessage(event.text, 900);
  return renderPlainProgressMessage({
    icon: progressKindIcon(event.type),
    title,
    body: text,
  });
}

function renderAgentFailureReply(error: string | null): string {
  return renderPlainProgressMessage({
    icon: progressKindIcon("failed"),
    title: "Agent 运行失败",
    body: shortMessage(error),
  });
}

function renderAgentStoppedReply(error: string | null): string {
  return renderPlainProgressMessage({
    icon: progressKindIcon("completed"),
    title: "Agent 已停止",
    body: shortMessage(error || "用户已请求停止当前运行。"),
  });
}

function renderAgentTerminalFailureReply(agent: ChannelConnectorAgentTurnResult): string {
  if (agent.status === "cancelled") return renderAgentStoppedReply(agent.error);
  return renderAgentFailureReply(agent.error);
}

function feishuReactionEmoji(binding: ChannelConnectorRuntimeBinding): string | null {
  const metadata = metadataRecord(binding);
  const configured = normalizeString(metadata.reactionEmoji)
    || normalizeString(metadata.reaction_emoji)
    || "OnIt";
  if (!configured || configured.toLowerCase() === "none") return null;
  return configured;
}

async function startFeishuTypingReaction(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  messageId: string;
}): Promise<() => Promise<void>> {
  const emojiType = feishuReactionEmoji(input.binding);
  if (!emojiType || !input.messageId) return async () => {};
  const cachePath = feishuTokenCachePath(input.config);
  const started = await addFeishuMessageReaction(input.transport, {
    messageId: input.messageId,
    emojiType,
  }, cachePath);
  writeJsonLine(input.config.paths.feishuEvents, {
    checkedAt: new Date().toISOString(),
    eventKind: "agent.reaction.started",
    adapter: "feishu",
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    messageId: input.messageId,
    reactionEmoji: emojiType,
    reactionId: started.reactionId || null,
    reactionOk: started.ok,
    reactionError: started.error,
    requestCount: started.requestCount,
  });
  const reactionId = normalizeString(started.reactionId);
  if (started.ok !== true || !reactionId) return async () => {};
  return async () => {
    const stopped = await removeFeishuMessageReaction(input.transport, {
      messageId: input.messageId,
      reactionId,
    }, cachePath);
    writeJsonLine(input.config.paths.feishuEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.reaction.stopped",
      adapter: "feishu",
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      reactionId,
      reactionOk: stopped.ok,
      reactionError: stopped.error,
      requestCount: stopped.requestCount,
    });
  };
}

function connectionState(
  binding: ChannelConnectorRuntimeBinding,
  status: Partial<ChannelDaemonOctoConnectionState>,
): ChannelDaemonOctoConnectionState {
  return {
    bindingId: binding.id,
    wsUrl: status.wsUrl || "",
    connected: status.connected || false,
    state: status.state || "idle",
    lastError: status.lastError || null,
    lastConnectedAt: status.lastConnectedAt || null,
    lastDisconnectedAt: status.lastDisconnectedAt || null,
    reconnects: status.reconnects || 0,
    receivedMessages: status.receivedMessages || 0,
    accountId: binding.accountId,
    botId: binding.botId,
    robotId: status.robotId || null,
    apiUrl: status.apiUrl || null,
    credentialSource: status.credentialSource || null,
    restHeartbeatIntervalMs: status.restHeartbeatIntervalMs || 0,
    restHeartbeatSuccesses: status.restHeartbeatSuccesses || 0,
    restHeartbeatFailures: status.restHeartbeatFailures || 0,
    restHeartbeatLastOkAt: status.restHeartbeatLastOkAt || null,
    restHeartbeatLastErrorAt: status.restHeartbeatLastErrorAt || null,
    restHeartbeatLastError: status.restHeartbeatLastError || null,
  };
}

function feishuConnectionState(group: ChannelDaemonFeishuGroup): ChannelDaemonFeishuConnectionState {
  const status = group.client?.getConnectionStatus();
  return {
    key: group.key,
    appId: group.appId,
    accountId: group.accountId,
    apiUrl: group.apiUrl,
    bindingIds: group.refs.map((ref) => ref.binding.id),
    connected: status?.state === "connected",
    state: status?.state || "closed",
    lastError: group.lastError,
    lastConnectedAt: group.lastConnectedAt,
    lastDisconnectedAt: group.lastDisconnectedAt,
    lastReceivedAt: group.lastReceivedAt,
    lastUnhealthyAt: group.lastUnhealthyAt,
    connectedIdleRenewAfterMs: feishuConnectedIdleRenewMs(group),
    zeroInboundRenewAfterMs: feishuZeroInboundRenewMs(group),
    zeroInboundRenewals: group.zeroInboundRenewals,
    lifecycleReceivedMessages: group.lifecycleReceivedMessages,
    lifecycleLastReceivedAt: group.lifecycleLastReceivedAt,
    suppressZeroInboundRenewal: group.suppressZeroInboundRenewal,
    lastWatchdogRestartAt: group.lastWatchdogRestartAt,
    lastWatchdogRestartReason: group.lastWatchdogRestartReason,
    reconnects: group.reconnects,
    receivedMessages: group.receivedMessages,
  };
}

function updateFeishuRuntime(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
  group: ChannelDaemonFeishuGroup,
): void {
  state.feishuConnections[group.key] = feishuConnectionState(group);
  writeRuntime(config, state);
}

function latestFeishuLifecycleActivityAt(group: ChannelDaemonFeishuGroup): string | null {
  const candidates = [group.lifecycleLastReceivedAt]
    .map((value) => {
      const timestamp = value ? Date.parse(value) : NaN;
      return Number.isFinite(timestamp) ? { value, timestamp } : null;
    })
    .filter((value): value is { value: string; timestamp: number } => Boolean(value));
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0]?.value || null;
}

function feishuGroupKey(transport: ChannelConnectorFeishuTransportConfig): string {
  return `${transport.apiUrl}|${transport.appId}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function feishuChatFilters(binding: ChannelConnectorRuntimeBinding): string[] {
  return metadataStringList(binding, [
    "chatId",
    "chatIds",
    "chat_id",
    "chat_ids",
    "openChatId",
    "openChatIds",
    "open_chat_id",
    "open_chat_ids",
    "allowChat",
    "allowChats",
    "allow_chat",
    "allow_chats",
    "allowChatIds",
    "allow_chat_ids",
  ]);
}

function selectFeishuBindingRefs(
  group: ChannelDaemonFeishuGroup,
  parsed: ChannelConnectorFeishuParsedWebhook,
): ChannelDaemonFeishuBindingRef[] {
  const requestedBindingId = normalizeString(parsed.bindingId);
  if (requestedBindingId) return group.refs.filter((ref) => ref.binding.id === requestedBindingId);
  const chatId = normalizeString(parsed.channelId);
  const chatSpecific = chatId
    ? group.refs.filter((ref) => feishuChatFilters(ref.binding).includes(chatId))
    : [];
  if (chatSpecific.length) return chatSpecific;
  const defaults = group.refs.filter((ref) => feishuChatFilters(ref.binding).length === 0);
  return defaults.length ? [defaults[0]] : group.refs.slice(0, 1);
}

function feishuSessionKey(
  binding: ChannelConnectorRuntimeBinding,
  parsed: ChannelConnectorFeishuParsedWebhook,
): string | null {
  return buildFeishuSessionKey(parsed, {
    threadIsolation: metadataBoolean(binding, ["threadIsolation", "thread_isolation"], true),
    shareSessionInChannel: metadataBoolean(binding, ["shareSessionInChannel", "share_session_in_channel"], false),
  });
}

function feishuThreadLogFields(parsed: ChannelConnectorFeishuParsedWebhook): {
  rootId: string | null;
  parentId: string | null;
  threadId: string | null;
  messageType: string | null;
  attachmentCount: number;
  attachmentKinds: string[];
} {
  return {
    rootId: parsed.rootId,
    parentId: parsed.parentId,
    threadId: parsed.threadId,
    messageType: parsed.messageType,
    attachmentCount: parsed.attachments.length,
    attachmentKinds: parsed.attachments.map((attachment) => attachment.kind),
  };
}

function feishuMessageFromParsed(
  parsed: ChannelConnectorFeishuParsedWebhook,
  content: string,
  members: ChannelConnectorOctoInboundMessage["members"] = [],
): ChannelConnectorOctoInboundMessage {
  const isGroup = normalizeString(parsed.chatType).toLowerCase() === "group";
  return {
    messageId: normalizeString(parsed.messageId) || `${parsed.kind}-${Date.now()}`,
    fromUid: normalizeString(parsed.fromUid),
    channelId: normalizeString(parsed.channelId) || normalizeString(parsed.fromUid),
    channelType: isGroup ? 2 : 1,
    timestamp: Date.now(),
    payload: {
      type: 1,
      content,
      reply: parsed.parentId || parsed.rootId || parsed.threadId
        ? {
          messageId: parsed.parentId || parsed.rootId || parsed.threadId || undefined,
        }
        : undefined,
    },
    attachments: parsed.attachments,
    members,
  };
}

function feishuAttachmentResource(input: ChannelConnectorInboundAttachment): {
  fileKey: string;
  resourceType: "image" | "file";
} | null {
  if (input.kind === "image" || input.kind === "sticker") {
    const fileKey = normalizeString(input.imageKey) || normalizeString(input.fileKey) || normalizeString(input.key);
    return fileKey ? { fileKey, resourceType: "image" } : null;
  }
  if (input.kind === "file" || input.kind === "audio" || input.kind === "video") {
    const fileKey = normalizeString(input.fileKey) || normalizeString(input.key);
    return fileKey ? { fileKey, resourceType: "file" } : null;
  }
  return null;
}

async function loadFeishuGroupMembers(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorFeishuTransportConfig | null;
  parsed: ChannelConnectorFeishuParsedWebhook;
}): Promise<{
  members: NonNullable<ChannelConnectorOctoInboundMessage["members"]>;
  error: string | null;
  attempted: boolean;
  pageCount: number;
  hasMore: boolean;
}> {
  if (input.parsed.kind !== "message") {
    return { members: [], error: null, attempted: false, pageCount: 0, hasMore: false };
  }
  if (normalizeString(input.parsed.chatType).toLowerCase() !== "group") {
    return { members: [], error: null, attempted: false, pageCount: 0, hasMore: false };
  }
  if (!metadataBoolean(input.binding, [
    "enableFeishuMemberPull",
    "enable_feishu_member_pull",
    "pullFeishuMembers",
    "pull_feishu_members",
  ], true)) {
    return { members: [], error: null, attempted: false, pageCount: 0, hasMore: false };
  }
  if (!input.transport) {
    return {
      members: [],
      error: "feishu_transport_config_missing",
      attempted: true,
      pageCount: 0,
      hasMore: false,
    };
  }
  const maxPages = Math.max(1, Math.min(100, Math.floor(metadataNumber(input.binding, [
    "feishuMemberMaxPages",
    "feishu_member_max_pages",
    "memberMaxPages",
    "member_max_pages",
  ], 10))));
  const result = await listFeishuChatMembers(input.transport, {
    chatId: normalizeString(input.parsed.channelId),
    pageSize: 100,
    maxPages,
    memberIdType: "open_id",
  }, feishuTokenCachePath(input.config));
  return {
    members: result.members,
    error: result.ok ? null : result.error || "feishu_member_pull_failed",
    attempted: result.attempted,
    pageCount: result.pageCount,
    hasMore: result.hasMore,
  };
}

async function stageFeishuMessageAttachments(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig | null;
  message: ChannelConnectorOctoInboundMessage;
  rootDir: string;
  maxBytes: number;
}): Promise<{
  message: ChannelConnectorOctoInboundMessage;
  stagedCount: number;
  failedCount: number;
  localPaths: string[];
}> {
  const attachments = input.message.attachments || [];
  if (!attachments.length) {
    return {
      message: input.message,
      stagedCount: 0,
      failedCount: 0,
      localPaths: [],
    };
  }

  const stagedAttachments: ChannelConnectorInboundAttachment[] = [];
  const localPaths: string[] = [];
  let stagedCount = 0;
  let failedCount = 0;
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const resource = feishuAttachmentResource(attachment);
    if (!input.transport) {
      failedCount += 1;
      stagedAttachments.push({
        ...attachment,
        stagingError: "feishu_transport_config_missing",
      });
      continue;
    }
    if (!resource) {
      failedCount += 1;
      stagedAttachments.push({
        ...attachment,
        stagingError: "feishu_resource_key_missing",
      });
      continue;
    }
    const download = await downloadFeishuMessageResourceToFile(input.transport, {
      messageId: input.message.messageId,
      fileKey: resource.fileKey,
      resourceType: resource.resourceType,
      maxBytes: input.maxBytes,
      target: (mimeType) => prepareChannelConnectorAttachmentStagingTarget({
        attachment,
        rootDir: input.rootDir,
        messageId: input.message.messageId,
        index,
        mimeType,
      }),
    }, feishuTokenCachePath(input.config));
    if (!download.ok || !download.localPath || typeof download.size !== "number") {
      failedCount += 1;
      stagedAttachments.push({
        ...attachment,
        stagingError: download.error || "feishu_resource_download_failed",
      });
      continue;
    }
    try {
      const staged = finalizeChannelConnectorAttachmentStaging({
        attachment,
        localPath: download.localPath,
        size: download.size,
        mimeType: download.mimeType,
      });
      stagedCount += 1;
      if (staged.localPath) localPaths.push(staged.localPath);
      stagedAttachments.push(staged);
    } catch (error) {
      failedCount += 1;
      stagedAttachments.push({
        ...attachment,
        stagingError: shortMessage(error),
      });
    }
  }

  return {
    message: {
      ...input.message,
      attachments: stagedAttachments,
    },
    stagedCount,
    failedCount,
    localPaths,
  };
}

async function stageOctoMessageAttachments(input: {
  message: ChannelConnectorOctoInboundMessage;
  rootDir: string;
  maxBytes: number;
  allowPrivateNetwork: boolean;
}): Promise<{
  message: ChannelConnectorOctoInboundMessage;
  stagedCount: number;
  failedCount: number;
  localPaths: string[];
}> {
  const attachments = input.message.attachments || [];
  if (!attachments.length) {
    return {
      message: input.message,
      stagedCount: 0,
      failedCount: 0,
      localPaths: [],
    };
  }

  const stagedAttachments: ChannelConnectorInboundAttachment[] = [];
  const localPaths: string[] = [];
  let stagedCount = 0;
  let failedCount = 0;
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const existingLocalPath = normalizeString(attachment.localPath);
    if (existingLocalPath) {
      localPaths.push(existingLocalPath);
      stagedAttachments.push(attachment);
      continue;
    }
    const url = normalizeString(attachment.url);
    if (!url) {
      failedCount += 1;
      stagedAttachments.push({
        ...attachment,
        stagingError: "octo_attachment_url_missing",
      });
      continue;
    }
    const staged = await stageChannelConnectorAttachmentUrl({
      attachment,
      url,
      rootDir: input.rootDir,
      messageId: input.message.messageId,
      index,
      maxBytes: input.maxBytes,
      allowPrivateNetwork: input.allowPrivateNetwork,
    });
    if (staged.ok) {
      stagedCount += 1;
      if (staged.localPath) localPaths.push(staged.localPath);
    } else {
      failedCount += 1;
    }
    stagedAttachments.push(staged.attachment);
  }

  return {
    message: {
      ...input.message,
      attachments: stagedAttachments,
    },
    stagedCount,
    failedCount,
    localPaths,
  };
}

function feishuCardsEnabled(binding: ChannelConnectorRuntimeBinding): boolean {
  return metadataBoolean(binding, [
    "enableFeishuCard",
    "enable_feishu_card",
    "useInteractiveCard",
    "use_interactive_card",
    "interactiveCard",
    "interactive_card",
  ], true);
}

function shouldRenderFeishuCommandCard(command: ReturnType<typeof handleChannelConnectorCommand> extends Promise<infer Result> ? Result : never): boolean {
  return command.handled && [
    "help",
    "status",
    "usage",
    "list",
    "set",
  ].includes(normalizeString(command.action).toLowerCase());
}

function shouldSendFeishuCommandCard(input: {
  command: ReturnType<typeof handleChannelConnectorCommand> extends Promise<infer Result> ? Result : never;
  parsedKind: ChannelConnectorFeishuParsedWebhook["kind"];
  actionKind: "nav" | "act" | "cmd" | null;
}): boolean {
  if (!input.command.handled) return false;
  const action = normalizeString(input.command.action).toLowerCase();
  if (input.actionKind === "nav") return true;
  if (["new", "reset", "show", "stop", "passthrough"].includes(action)) return false;
  if (input.parsedKind === "card-action" || input.parsedKind === "bot-menu") return true;
  return shouldRenderFeishuCommandCard(input.command);
}

function shouldSendFeishuProgressEvent(
  control: ChannelConnectorSessionControlRecord | null,
  event: ChannelConnectorAgentProgressEvent,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  if (!channelConnectorStreamMessagesEnabled(control, defaults)) return false;
  if (event.type === "assistant") return false;
  if ((event.type === "tool" || event.type === "reasoning") && !channelConnectorToolMessagesEnabled(control, defaults)) return false;
  return ["running", "reasoning", "tool", "failed", "error", "completed", "event"].includes(event.type);
}

function channelConnectorProgressDefaults(isGroup: boolean): ChannelConnectorProgressDefaults {
  return {
    isGroup,
    streamMessages: !isGroup,
    toolMessages: !isGroup,
  };
}

function feishuProgressDefaults(parsed: ChannelConnectorFeishuParsedWebhook): ChannelConnectorProgressDefaults {
  return channelConnectorProgressDefaults(normalizeString(parsed.chatType).toLowerCase() === "group");
}

function octoProgressDefaults(message: ChannelConnectorOctoInboundMessage): ChannelConnectorProgressDefaults {
  return channelConnectorProgressDefaults(isOctoGroupChannel(message.channelType));
}

function channelConnectorStreamMessagesEnabled(
  control: ChannelConnectorSessionControlRecord | null,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  return control?.streamMessages ?? defaults.streamMessages;
}

function channelConnectorToolMessagesEnabled(
  control: ChannelConnectorSessionControlRecord | null,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  return control?.toolMessages ?? defaults.toolMessages;
}

function shouldSendChannelProgressEvent(
  control: ChannelConnectorSessionControlRecord | null,
  event: ChannelConnectorAgentProgressEvent,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  if (!channelConnectorStreamMessagesEnabled(control, defaults)) return false;
  if (event.type === "assistant" || event.type === "running" || event.type === "completed" || event.type === "event") return false;
  if ((event.type === "tool" || event.type === "reasoning") && !channelConnectorToolMessagesEnabled(control, defaults)) return false;
  return ["reasoning", "tool", "failed", "error"].includes(event.type);
}

function createFeishuProgressCardState(): FeishuProgressCardState {
  const startedAtMs = Date.now();
  return {
    messageId: null,
    status: "running",
    startedAtMs,
    updatedAtMs: startedAtMs,
    dirty: false,
    entries: [],
    seenFingerprints: new Set<string>(),
    latestError: null,
  };
}

function feishuProgressEntryKind(event: ChannelConnectorAgentProgressEvent): FeishuProgressCardEntryKind {
  if (event.type === "reasoning") return "thinking";
  if (event.type === "tool") {
    return event.rawType?.endsWith(".started") ? "tool_use" : "tool_result";
  }
  if (event.type === "failed" || event.type === "error") return "error";
  return "info";
}

function feishuProgressEntryTitle(event: ChannelConnectorAgentProgressEvent, kind: FeishuProgressCardEntryKind): string {
  if (kind === "thinking") return "思考";
  if (kind === "tool_use") return event.itemType ? `工具调用：${event.itemType}` : "工具调用";
  if (kind === "tool_result") return event.itemType ? `工具结果：${event.itemType}` : "工具结果";
  if (kind === "error") return event.type === "failed" ? "失败" : "错误";
  if (event.type === "running") return "运行中";
  if (event.type === "completed") return "完成";
  return event.rawType || "进度";
}

function pushFeishuProgressCardEvent(
  cardState: FeishuProgressCardState,
  event: ChannelConnectorAgentProgressEvent,
): boolean {
  const kind = feishuProgressEntryKind(event);
  if (event.type === "completed" && cardState.status !== "failed") {
    cardState.status = "completed";
    cardState.updatedAtMs = Date.now();
    cardState.dirty = true;
    return true;
  }
  const text = shortMessage(event.text || event.rawType || event.type, 520);
  if (!text) return false;
  const fingerprint = `${kind}:${event.rawType || ""}:${event.itemType || ""}:${text}`;
  if (cardState.seenFingerprints.has(fingerprint)) return false;
  if (kind === "error" && cardState.latestError === text) return false;
  cardState.seenFingerprints.add(fingerprint);
  if (kind === "error") {
    cardState.status = "failed";
    cardState.latestError = text;
  } else if (event.type === "completed" && cardState.status !== "failed") {
    cardState.status = "completed";
  }
  cardState.entries.push({
    kind,
    title: feishuProgressEntryTitle(event, kind),
    text,
    checkedAt: event.checkedAt,
    fingerprint,
    rawType: event.rawType,
    itemType: event.itemType,
  });
  cardState.entries = cardState.entries.slice(-8);
  cardState.updatedAtMs = Date.now();
  cardState.dirty = true;
  return true;
}

function ensureFeishuProgressCardFailure(
  cardState: FeishuProgressCardState,
  error: string | null,
  status: ChannelConnectorAgentTurnResult["status"] = "failed",
): void {
  cardState.status = "failed";
  const stopped = status === "cancelled";
  const text = shortMessage(error || (stopped ? "用户已请求停止当前运行。" : "Agent 运行失败"), 520);
  if (!text || cardState.latestError === text) return;
  const fingerprint = `error:final:${text}`;
  if (cardState.seenFingerprints.has(fingerprint)) return;
  cardState.latestError = text;
  cardState.seenFingerprints.add(fingerprint);
  cardState.entries.push({
    kind: "error",
    title: stopped ? "已停止" : "失败",
    text,
    checkedAt: new Date().toISOString(),
    fingerprint,
    rawType: null,
    itemType: null,
  });
  cardState.entries = cardState.entries.slice(-8);
  cardState.updatedAtMs = Date.now();
  cardState.dirty = true;
}

function completeFeishuProgressCard(cardState: FeishuProgressCardState): void {
  if (cardState.status === "failed") return;
  cardState.status = "completed";
  cardState.updatedAtMs = Date.now();
  cardState.dirty = true;
}

function feishuProgressCardStatusText(status: FeishuProgressCardState["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "运行中";
}

function feishuProgressCardStatusColor(status: FeishuProgressCardState["status"]): "blue" | "green" | "red" {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  return "blue";
}

function feishuProgressCardStatusTag(status: FeishuProgressCardState["status"]): string {
  const icon = status === "completed"
    ? progressKindIcon("completed")
    : status === "failed"
      ? progressKindIcon("failed")
      : progressKindIcon("running");
  return `${icon} <text_tag color='${feishuProgressCardStatusColor(status)}'>${feishuProgressCardStatusText(status)}</text_tag>`;
}

function feishuProgressCardTemplate(status: FeishuProgressCardState["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  return "blue";
}

function inlineProgressCode(value: string): string {
  return normalizeString(value).replace(/`/g, "'");
}

function isBashLikeToolName(value: string | null): boolean {
  return ["bash", "shell", "run_shell_command", "command_execution", "command"].includes(normalizeString(value).toLowerCase());
}

function isTodoWriteToolName(value: string | null): boolean {
  return normalizeString(value).toLowerCase() === "todowrite";
}

function codeBlock(language: string, value: string): string {
  const body = normalizeString(value).replace(/```/g, "'''");
  return body ? `\`\`\`${language}\n${body}\n\`\`\`` : "";
}

function parseProgressToolText(entry: FeishuProgressCardEntry): {
  toolName: string;
  command: string;
  exitCode: string | null;
  status: string | null;
  output: string;
} {
  const toolName = normalizeString(entry.itemType)
    || normalizeString(entry.title.split("：")[1])
    || "tool";
  const lines = entry.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bodyLines = lines.slice(1);
  let command = "";
  let exitCode: string | null = null;
  let status: string | null = null;
  const outputLines: string[] = [];
  for (const line of bodyLines) {
    const exitMatch = line.match(/^exit=(.+)$/i);
    if (exitMatch) {
      exitCode = normalizeString(exitMatch[1]);
      continue;
    }
    if (!command) {
      command = line;
      continue;
    }
    if (!status && /^(in_progress|running|started|pending|completed|failed|success|succeeded|ok|error)$/i.test(line)) {
      status = line;
      continue;
    }
    outputLines.push(line);
  }
  return {
    toolName,
    command,
    exitCode,
    status,
    output: outputLines.join("\n"),
  };
}

function progressStatusLabel(value: string | null): string | null {
  const status = normalizeString(value).toLowerCase();
  if (!status) return null;
  if (["in_progress", "running", "started", "pending"].includes(status)) return "执行中";
  if (["completed", "success", "succeeded", "ok"].includes(status)) return "完成";
  if (["failed", "error"].includes(status)) return "失败";
  return status;
}

function progressStatusColor(value: string | null): "blue" | "green" | "red" | "grey" {
  const status = normalizeString(value).toLowerCase();
  if (["in_progress", "running", "started", "pending"].includes(status)) return "blue";
  if (["completed", "success", "succeeded", "ok"].includes(status)) return "green";
  if (["failed", "error"].includes(status)) return "red";
  return "grey";
}

function progressStatusFailed(value: string | null): boolean {
  return ["failed", "error"].includes(normalizeString(value).toLowerCase());
}

function progressStatusTag(value: string | null): string {
  const label = progressStatusLabel(value);
  if (!label) return "";
  return `<text_tag color='${progressStatusColor(value)}'>${inlineProgressCode(label)}</text_tag>`;
}

function formatTodoWriteProgressInput(value: string): string {
  const raw = normalizeString(value);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = isRecord(parsed) ? parsed : {};
    const todos = Array.isArray(record.todos) ? record.todos : [];
    const lines = todos
      .map((todo) => isRecord(todo) ? todo : {})
      .map((todo) => {
        const content = inlineProgressCode(normalizeString(todo.content));
        if (!content) return "";
        const status = normalizeString(todo.status).toLowerCase();
        const label = status === "completed" ? "已完成"
          : status === "in_progress" ? "进行中"
            : status === "pending" ? "待处理"
              : "任务";
        const activeForm = normalizeString(todo.activeForm);
        return activeForm && activeForm !== content
          ? `- ${label}: ${content} (${inlineProgressCode(activeForm)})`
          : `- ${label}: ${content}`;
      })
      .filter(Boolean);
    return lines.length ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

function formatProgressToolInput(toolName: string, value: string): string {
  const text = normalizeString(value);
  if (!text) return "";
  if (isTodoWriteToolName(toolName)) {
    const formatted = formatTodoWriteProgressInput(text);
    return formatted || codeBlock("text", text);
  }
  if (text.includes("```")) return text;
  if (isBashLikeToolName(toolName)) return codeBlock("bash", text);
  if (text.includes("\n") || text.length > 180) return codeBlock("text", text);
  return `\`${inlineProgressCode(text)}\``;
}

function formatProgressToolResult(value: string): string {
  const text = normalizeString(value);
  if (!text) return "_无输出_";
  if (text.includes("```")) return text;
  if (text.includes("\n") || text.length > 220) return codeBlock("text", text);
  return text;
}

function indentPlainProgressBody(value: string): string {
  const text = normalizeString(value);
  if (!text) return "";
  if (text.includes("```")) return text;
  return text.split(/\r?\n/).map((line) => `  ${line}`).join("\n");
}

function renderFeishuProgressEntry(entry: FeishuProgressCardEntry): string {
  if (entry.kind === "thinking") return `${progressKindIcon(entry.kind)} <text_tag color='grey'>思考</text_tag>\n${inlineProgressCode(entry.text)}`;
  if (entry.kind === "tool_use") {
    const parsed = parseProgressToolText(entry);
    const title = `${progressKindIcon(entry.kind)} <text_tag color='blue'>工具调用</text_tag> \`${inlineProgressCode(parsed.toolName)}\``;
    const status = progressStatusTag(parsed.status);
    const body = formatProgressToolInput(parsed.toolName, parsed.command || entry.text);
    return [title, status, body].filter(Boolean).join("\n");
  }
  if (entry.kind === "tool_result") {
    const parsed = parseProgressToolText(entry);
    const failed = progressStatusFailed(parsed.status) || (parsed.exitCode !== null && parsed.exitCode !== "0");
    const status = failed ? "<text_tag color='red'>失败</text_tag>" : progressStatusTag(parsed.status) || "<text_tag color='green'>完成</text_tag>";
    const icon = progressResultIcon({ status: parsed.status, exitCode: parsed.exitCode });
    const meta = [
      status,
      parsed.exitCode !== null ? `exit \`${inlineProgressCode(parsed.exitCode)}\`` : "",
      parsed.status ? `status \`${inlineProgressCode(parsed.status)}\`` : "",
    ].filter(Boolean).join(" ");
    const output = formatProgressToolResult(parsed.output);
    return `${icon} <text_tag color='turquoise'>工具结果</text_tag> \`${inlineProgressCode(parsed.toolName)}\`\n${meta}\n${output}`;
  }
  if (entry.kind === "error") return `${progressKindIcon(entry.kind)} <text_tag color='red'>${inlineProgressCode(entry.title)}</text_tag>\n${entry.text}`;
  return `${progressKindIcon(entry.kind)} <text_tag color='grey'>${inlineProgressCode(entry.title)}</text_tag>\n${entry.text}`;
}

function renderPlainProgressEntry(entry: FeishuProgressCardEntry): string {
  if (entry.kind === "thinking") {
    return renderPlainProgressMessage({
      icon: progressKindIcon(entry.kind),
      title: "思考",
      body: entry.text,
    });
  }
  if (entry.kind === "tool_use") {
    const parsed = parseProgressToolText(entry);
    const status = progressStatusLabel(parsed.status);
    return renderPlainProgressMessage({
      icon: progressKindIcon(entry.kind),
      title: `工具调用 \`${inlineProgressCode(parsed.toolName)}\``,
      meta: status || undefined,
      body: formatProgressToolInput(parsed.toolName, parsed.command || entry.text),
    });
  }
  if (entry.kind === "tool_result") {
    const parsed = parseProgressToolText(entry);
    const failed = progressStatusFailed(parsed.status) || (parsed.exitCode !== null && parsed.exitCode !== "0");
    const meta = [
      failed ? "失败" : progressStatusLabel(parsed.status) || "完成",
      parsed.exitCode !== null ? `exit \`${inlineProgressCode(parsed.exitCode)}\`` : "",
      parsed.status ? `status \`${inlineProgressCode(parsed.status)}\`` : "",
    ].filter(Boolean).join(" · ");
    return renderPlainProgressMessage({
      icon: progressResultIcon({ status: parsed.status, exitCode: parsed.exitCode }),
      title: `工具结果 \`${inlineProgressCode(parsed.toolName)}\``,
      meta,
      body: formatProgressToolResult(parsed.output),
    });
  }
  return renderPlainProgressMessage({
    icon: progressKindIcon(entry.kind),
    title: entry.title,
    body: entry.text,
  });
}

function renderFeishuProgressCardEventElements(entries: FeishuProgressCardEntry[]): Array<Record<string, unknown>> {
  if (!entries.length) {
    return [{
      tag: "markdown",
      content: "<text_tag color='grey'>等待进度</text_tag>\nAgent 正在启动。",
    }];
  }
  const elements: Array<Record<string, unknown>> = [];
  entries.forEach((entry, index) => {
    if (index > 0) elements.push({ tag: "hr" });
    const indexText = String(index + 1).padStart(2, "0");
    elements.push({
      tag: "markdown",
      content: `**${indexText}** ${renderFeishuProgressEntry(entry)}`,
    });
  });
  return elements;
}

function renderFeishuProgressCard(input: {
  state: FeishuProgressCardState;
  project: ChannelConnectorRuntimeProject;
  sessionKey: string;
}): ChannelConnectorFeishuInteractiveCard {
  const elapsedSeconds = Math.max(0, Math.round((input.state.updatedAtMs - input.state.startedAtMs) / 1000));
  const model = input.project.model || "default";
  const statusIcon = input.state.status === "completed"
    ? progressKindIcon("completed")
    : input.state.status === "failed"
      ? progressKindIcon("failed")
      : progressKindIcon("running");
  const footer = input.state.status === "completed"
    ? "本过程卡片已停止更新，完整答复见下一条消息。"
    : input.state.status === "failed"
      ? "本过程卡片已停止更新，错误说明见下一条消息。"
      : "过程卡片会随工具调用继续更新。";
  const headerLines = [
    `**状态**：${feishuProgressCardStatusTag(input.state.status)}`,
    `**Agent**：${input.project.agent}`,
    `**模型**：${model}`,
    `**耗时**：${elapsedSeconds}s`,
  ];
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: `${statusIcon} Studio ${input.project.agent} · ${feishuProgressCardStatusText(input.state.status)}`,
      },
      template: feishuProgressCardTemplate(input.state.status),
    },
    elements: [
      {
        tag: "markdown",
        content: headerLines.join("\n"),
      },
      { tag: "hr" },
      ...renderFeishuProgressCardEventElements(input.state.entries),
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `${footer} session ${shortMessage(input.sessionKey, 80)}`,
          },
        ],
      },
    ],
  };
}

function sanitizeFeishuCardMarkdown(value: string): string {
  const text = preprocessFeishuCardMarkdown(String(value || "").trim());
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
      const target = normalizeString(url);
      const title = normalizeString(label) || "图片";
      return /^(https?:\/\/)/i.test(target) ? `[${title}](${target})` : `${title} (${target})`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, url: string) => {
      const target = normalizeString(url);
      if (/^(https?:\/\/)/i.test(target)) return match;
      return `${label} (${target})`;
    });
}

function preprocessFeishuCardMarkdown(value: string): string {
  let output = "";
  const chars = Array.from(value);
  for (let index = 0; index < chars.length; index += 1) {
    if (index > 0 && chars[index] === "`" && chars[index + 1] === "`" && chars[index + 2] === "`" && chars[index - 1] !== "\n") {
      output += "\n";
    }
    output += chars[index];
  }
  return output;
}

function renderFeishuFinalReplyCard(input: {
  project: ChannelConnectorRuntimeProject;
  replyText: string;
  sessionKey: string;
  status: "ok" | "failed";
}): Record<string, unknown> {
  void input.project;
  void input.sessionKey;
  void input.status;
  const content = sanitizeFeishuCardMarkdown(input.replyText);
  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content,
        },
      ],
    },
  };
}

function shouldSendFeishuFinalReplyCard(input: {
  binding: ChannelConnectorRuntimeBinding;
  replyText: string;
  status: "ok" | "failed";
}): boolean {
  if (!feishuCardsEnabled(input.binding)) return false;
  const runes = Array.from(String(input.replyText || "")).length;
  if (runes === 0 || runes > FEISHU_FINAL_REPLY_CARD_MAX_RUNES) return false;
  return true;
}

async function sendOrPatchFeishuProgressCard(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  chatId: string;
  state: FeishuProgressCardState;
  project: ChannelConnectorRuntimeProject;
  sessionKey: string;
}): Promise<ChannelConnectorFeishuTransportResult> {
  const cachePath = feishuTokenCachePath(input.config);
  const card = renderFeishuProgressCard({
    state: input.state,
    project: input.project,
    sessionKey: input.sessionKey,
  });
  if (input.state.messageId) {
    return patchFeishuCardMessage(input.transport, {
      messageId: input.state.messageId,
      card,
    }, cachePath);
  }
  return sendFeishuCardMessage(input.transport, {
    chatId: input.chatId,
    card,
  }, cachePath);
}

async function sendFeishuFinalReply(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  binding: ChannelConnectorRuntimeBinding;
  project: ChannelConnectorRuntimeProject;
  chatId: string;
  sessionKey: string;
  replyText: string;
  status: "ok" | "failed";
}): Promise<{
  result: ChannelConnectorFeishuTransportResult;
  transportAction: string;
  cardAttempted: boolean;
  cardError: string | null;
}> {
  const cachePath = feishuTokenCachePath(input.config);
  const cardAttempted = shouldSendFeishuFinalReplyCard({
    binding: input.binding,
    replyText: input.replyText,
    status: input.status,
  });
  if (cardAttempted) {
    const cardResult = await sendFeishuCardMessage(input.transport, {
      chatId: input.chatId,
      card: renderFeishuFinalReplyCard({
        project: input.project,
        replyText: input.replyText,
        sessionKey: input.sessionKey,
        status: input.status,
      }),
    }, cachePath);
    if (cardResult.ok === true) {
      return {
        result: cardResult,
        transportAction: "send-final-card",
        cardAttempted: true,
        cardError: null,
      };
    }
    const postResult = await sendFeishuPostMessage(input.transport, {
      chatId: input.chatId,
      content: sanitizeFeishuCardMarkdown(input.replyText),
    }, cachePath);
    if (postResult.ok === true) {
      return {
        result: {
          ...postResult,
          requestCount: cardResult.requestCount + postResult.requestCount,
        },
        transportAction: "send-final-post-after-card",
        cardAttempted: true,
        cardError: cardResult.error,
      };
    }
    // Feishu cards can be rejected for platform limits or markdown edge cases;
    // text send preserves delivery while keeping the card error observable.
    const textResult = await sendFeishuTextMessage(input.transport, {
      chatId: input.chatId,
      content: input.replyText,
    }, cachePath);
    return {
      result: textResult,
      transportAction: "send-final-text-after-card",
      cardAttempted: true,
      cardError: [cardResult.error, postResult.error ? `post fallback failed: ${postResult.error}` : ""].filter(Boolean).join("; "),
    };
  }
  const textResult = await sendFeishuTextMessage(input.transport, {
    chatId: input.chatId,
    content: input.replyText,
  }, cachePath);
  return {
    result: textResult,
    transportAction: "send-final-text",
    cardAttempted: false,
    cardError: null,
  };
}

function feishuCommandNotice(input: {
  command: ReturnType<typeof handleChannelConnectorCommand> extends Promise<infer Result> ? Result : never;
  actionKind: "nav" | "act" | "cmd" | null;
}): { title: string; text: string; ok: boolean | null } | null {
  if (input.actionKind === "nav") return null;
  if (normalizeString(input.command.action).toLowerCase() === "help") return null;
  const text = normalizeString(input.command.replyText || input.command.passthroughText);
  if (!text) return null;
  const action = normalizeString(input.command.action).toLowerCase();
  if (action === "list") return null;
  const title = action === "status" ? "当前状态"
    : action === "usage" ? "用量统计"
    : action === "show" ? "缓存内容"
      : action === "set" ? "设置已应用"
        : action === "new" ? "新会话已开启"
          : action === "reset" ? "会话已重置"
            : action === "list" ? "可选项"
              : action === "passthrough" ? "已发送给 Agent"
                : "执行结果";
  return {
    title,
    text: action === "status" ? "已刷新当前会话状态。" : text,
    ok: input.command.ok,
  };
}

function feishuCommandToast(input: {
  command: ReturnType<typeof handleChannelConnectorCommand> extends Promise<infer Result> ? Result : never;
  actionKind: "nav" | "act" | "cmd" | null;
  transportOk: boolean;
  transportError: string | null;
}): { type: "info" | "warning"; content: string } {
  if (!input.transportOk) {
    return {
      type: "warning",
      content: input.transportError || "菜单更新失败",
    };
  }
  if (input.actionKind === "nav") {
    const command = normalizeString(input.command.command);
    const label = feishuCommandPageLabel(command);
    return {
      type: "info",
      content: label ? `已打开${label}` : "菜单已打开",
    };
  }
  const command = normalizeString(input.command.command);
  if (input.command.ok === false) {
    return {
      type: "warning",
      content: "命令执行失败，结果已显示在卡片中",
    };
  }
  const action = normalizeString(input.command.action).toLowerCase();
  if (action === "status") {
    return { type: "info", content: "状态已刷新" };
  }
  if (action === "usage") {
    return { type: "info", content: "用量已刷新" };
  }
  if (action === "set") {
    return { type: "info", content: "设置已应用" };
  }
  if (action === "list") {
    return { type: "info", content: "列表已刷新" };
  }
  return {
    type: "info",
    content: command ? `已执行 ${command}` : "命令已执行",
  };
}

function feishuCommandPageLabel(command: string): string | null {
  const parts = normalizeString(command).replace(/^[/%]+/, "").split(/\s+/).filter(Boolean);
  const name = (parts[0] || "").toLowerCase();
  const sub = (parts[1] || "").toLowerCase();
  if (!name) return null;
  const section = name === "help" ? sub || "home" : name;
  if (section === "home" || section === "menu" || section === "help") return "主菜单";
  if (["session", "status"].includes(section)) return "会话菜单";
  if (["current"].includes(section)) return "当前会话";
  if (["list", "sessions", "switch"].includes(section)) return "续接列表";
  if (section === "history") return "会话历史";
  if (["agent", "agents", "project", "profile"].includes(section)) return "Agent 设置";
  if (["model", "models"].includes(section)) return "模型设置";
  if (["mode", "permission", "permissions", "reasoning", "effort"].includes(section)) return "权限与推理";
  if (["display", "stream", "tools", "tool"].includes(section)) return "显示设置";
  if (["buffer", "buffers", "reply-buffer", "reply-buffers"].includes(section)) return "Reply Buffer";
  if (["workdir", "dir", "pwd", "cd", "chdir"].includes(section)) return "工作目录";
  if (["native", "raw", "pass"].includes(section)) return "原生 Agent";
  return null;
}

function buildFeishuCommandCard(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  displayDefaults?: ChannelConnectorProgressDefaults | null;
  selectedSectionId?: string | null;
  selectedViewId?: string | null;
  models?: string[];
  notice?: {
    title: string;
    text: string;
    ok?: boolean | null;
  } | null;
}) {
  const control = getChannelConnectorSessionControl(sessionControlsPath(input.config), {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
  });
  const current = resolveChannelConnectorEffectiveProject(input.config, input.project, control);
  const session = getChannelConnectorAgentSession(agentSessionsPath(input.config), {
    bindingId: input.binding.id,
    projectId: current.id,
    sessionKey: input.sessionKey,
    agent: current.agent,
    model: current.model,
    workDir: current.workDir,
  });
  const sessionList = listChannelConnectorAgentSessionsForConversation(agentSessionsPath(input.config), {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    limit: 20,
  }).map((record) => ({
    id: record.id,
    projectId: record.projectId,
    agent: record.agent,
    model: record.model,
    workDir: record.workDir,
    codexThreadId: record.codexThreadId,
    turnCount: record.turnCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastMessageId: record.lastMessageId,
    lastStatus: record.lastStatus,
    active: session ? record.id === session.id : false,
  }));
  const history = getChannelConnectorConversationHistory(conversationHistoryPath(input.config), {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
  }, 10).map((entry) => ({
    role: entry.role,
    text: entry.text,
    attachmentSummaries: entry.attachmentSummaries,
    status: entry.status,
    createdAt: entry.createdAt,
    messageId: entry.messageId,
  }));
  const surface = buildChannelConnectorCommandSurface({
    config: input.config,
    project: input.project,
    binding: input.binding,
    control,
    displayDefaults: input.displayDefaults || null,
    sessionKey: input.sessionKey,
    models: input.models,
    agentSession: session ? {
      started: true,
      turnCount: session.turnCount,
      codexThreadId: session.codexThreadId,
      lastStatus: session.lastStatus,
      lastMessageId: session.lastMessageId,
      updatedAt: session.updatedAt,
    } : {
      started: false,
      turnCount: 0,
      codexThreadId: null,
      lastStatus: null,
      lastMessageId: null,
      updatedAt: null,
    },
    sessionList,
    history,
    selectedSectionId: input.selectedSectionId,
    selectedViewId: input.selectedViewId,
  });
  return renderChannelConnectorCommandSurfaceFeishu(surface, input.notice || null);
}

async function gatewayModelsForFeishuCard(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
}): Promise<string[]> {
  const control = getChannelConnectorSessionControl(sessionControlsPath(input.config), {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
  });
  const current = resolveChannelConnectorEffectiveProject(input.config, input.project, control);
  try {
    return await listChannelConnectorGatewayModels(
      current.gatewayEndpoint || input.config.gateway.endpoint,
      gatewayClientKey(input.config),
    );
  } catch {
    return [];
  }
}

function feishuMenuSelectionFromParsed(parsed: ChannelConnectorFeishuParsedWebhook): {
  selectedSectionId: string | null;
  selectedViewId: string | null;
} {
  const actionPayload = extractChannelConnectorSurfaceActionPayload(parsed.actionValue);
  const selectedSectionId = actionPayload.targetSectionId
    || channelConnectorCommandSurfaceSectionFromCommand(actionPayload.command)
    || channelConnectorCommandSurfaceSectionFromCommand(parsed.text)
    || normalizeChannelConnectorCommandSurfaceSection(parsed.eventKey)
    || null;
  const selectedViewId = actionPayload.targetViewId
    || channelConnectorCommandSurfaceViewFromCommand(actionPayload.command, actionPayload.actionKind)
    || channelConnectorCommandSurfaceViewFromCommand(parsed.text)
    || normalizeChannelConnectorCommandSurfaceView(parsed.eventKey)
    || null;
  return { selectedSectionId, selectedViewId };
}

async function sendOrPatchFeishuCommandCard(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorFeishuTransportConfig;
  parsed: ChannelConnectorFeishuParsedWebhook;
  sessionKey: string;
  notice?: {
    title: string;
    text: string;
    ok?: boolean | null;
  } | null;
}): Promise<ChannelConnectorFeishuTransportResult & { card: ReturnType<typeof buildFeishuCommandCard> }> {
  const selection = feishuMenuSelectionFromParsed(input.parsed);
  const models = await gatewayModelsForFeishuCard(input);
  const card = buildFeishuCommandCard({
    ...input,
    ...selection,
    displayDefaults: feishuProgressDefaults(input.parsed),
    models,
    notice: input.notice || null,
  });
  const cachePath = feishuTokenCachePath(input.config);
  const cardMessageId = normalizeString(input.parsed.messageId);
  if (input.parsed.kind === "card-action" && cardMessageId) {
    const patched = await patchFeishuCardMessage(input.transport, {
      messageId: cardMessageId,
      card,
    }, cachePath);
    if (patched.ok === true) return { ...patched, card };
  }
  const sent = await sendFeishuCardMessage(input.transport, {
    chatId: normalizeString(input.parsed.channelId),
    card,
  }, cachePath);
  return { ...sent, card };
}

async function resolveOctoCredentials(
  config: ChannelConnectorsDaemonRuntimeConfig,
  binding: ChannelConnectorRuntimeBinding,
): Promise<{ entry: OctoCredentialCacheEntry; source: "register" | "cache" } | null> {
  const transport = octoTransportFromMetadata(binding.metadata);
  if (!transport) return null;
  const registered = await registerOctoBot(transport, false);
  const robotId = normalizeString(registered.robotId);
  const imToken = normalizeString(registered.imToken);
  const wsUrl = normalizeString(registered.wsUrl || transport.wsUrl || deriveOctoWsUrl(transport.apiUrl));
  if (registered.ok === true && robotId && imToken && wsUrl) {
    const state = saveOctoCachedCredentials(octoCredentialsPath(config), {
      bindingId: binding.id,
      apiUrl: transport.apiUrl,
      robotId,
      imToken,
      wsUrl,
    });
    return {
      entry: state.bindings[binding.id],
      source: "register",
    };
  }
  const cached = getOctoCachedCredentials(octoCredentialsPath(config), binding.id, transport.apiUrl);
  return cached ? { entry: cached, source: "cache" } : null;
}

const DEFAULT_SEEN_MESSAGE_TTL_MS = 5 * 60_000;
const FEISHU_SEEN_MESSAGE_TTL_MS = 24 * 60 * 60_000;
const FEISHU_SEEN_MESSAGE_MAX_ENTRIES = 5000;

function isoTimestampMs(value: string | null): number | null {
  const timestamp = Date.parse(normalizeString(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function elapsedMsSince(startMs: number, endMs = Date.now()): number {
  return Math.max(0, endMs - startMs);
}

function pruneSeenMessages(
  seenMessages: Map<string, number>,
  ttlMs = DEFAULT_SEEN_MESSAGE_TTL_MS,
  scopePrefix: string | null = null,
): void {
  const cutoff = Date.now() - ttlMs;
  for (const [key, timestamp] of seenMessages.entries()) {
    if (scopePrefix) {
      if (!key.startsWith(scopePrefix)) continue;
    } else if (key.startsWith("feishu:")) {
      continue;
    }
    if (timestamp < cutoff) seenMessages.delete(key);
  }
}

function shouldSkipSeenMessage(
  seenMessages: Map<string, number>,
  messageId: string,
  options: {
    ttlMs?: number;
    scopePrefix?: string | null;
  } = {},
): boolean {
  pruneSeenMessages(
    seenMessages,
    options.ttlMs || DEFAULT_SEEN_MESSAGE_TTL_MS,
    options.scopePrefix ?? null,
  );
  if (seenMessages.has(messageId)) return true;
  seenMessages.set(messageId, Date.now());
  return false;
}

function feishuSeenMessagesPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "feishu-seen-messages.json");
}

function saveFeishuSeenMessages(
  config: ChannelConnectorsDaemonRuntimeConfig,
  seenMessages: Map<string, number>,
): void {
  try {
    pruneSeenMessages(seenMessages, FEISHU_SEEN_MESSAGE_TTL_MS, "feishu:");
    const entries = [...seenMessages.entries()]
      .filter(([key]) => key.startsWith("feishu:"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, FEISHU_SEEN_MESSAGE_MAX_ENTRIES);
    writeJsonFileAtomic(feishuSeenMessagesPath(config), {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(entries),
    });
  } catch (error) {
    appendLog(config.paths.log, "Feishu seen-message store write failed", { error: shortMessage(error) });
  }
}

function restoreFeishuSeenMessagesFromStore(
  config: ChannelConnectorsDaemonRuntimeConfig,
  seenMessages: Map<string, number>,
): number {
  const filePath = feishuSeenMessagesPath(config);
  if (!fs.existsSync(filePath)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const entries = isRecord(raw) && isRecord(raw.entries) ? raw.entries : {};
    let restored = 0;
    for (const [key, value] of Object.entries(entries)) {
      const timestamp = typeof value === "number" ? value : Number(value);
      if (!key.startsWith("feishu:") || !Number.isFinite(timestamp)) continue;
      seenMessages.set(key, timestamp);
      restored += 1;
    }
    return restored;
  } catch (error) {
    appendLog(config.paths.log, "Feishu seen-message store read failed", { error: shortMessage(error) });
    return 0;
  }
}

function feishuSeenKeysFromEventRecord(record: Record<string, unknown>): string[] {
  const bindingId = normalizeString(record.bindingId);
  if (!bindingId) return [];
  const keys: string[] = [];
  const eventId = normalizeString(record.eventId);
  const messageId = normalizeString(record.messageId);
  if (eventId) keys.push(`feishu:event:${eventId}:${bindingId}`);
  if (messageId) keys.push(`feishu:message:${messageId}:${bindingId}`);
  return keys;
}

function seedFeishuSeenMessagesFromEventLog(
  config: ChannelConnectorsDaemonRuntimeConfig,
  seenMessages: Map<string, number>,
): number {
  const filePath = config.paths.feishuEvents;
  if (!fs.existsSync(filePath)) return 0;
  try {
    const cutoff = Date.now() - FEISHU_SEEN_MESSAGE_TTL_MS;
    let seeded = 0;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(record) || record.adapter !== "feishu") continue;
      const timestamp = Date.parse(normalizeString(record.checkedAt));
      const seenAt = Number.isFinite(timestamp) ? timestamp : Date.now();
      if (seenAt < cutoff) continue;
      for (const key of feishuSeenKeysFromEventRecord(record)) {
        if (!seenMessages.has(key)) seeded += 1;
        seenMessages.set(key, seenAt);
      }
    }
    return seeded;
  } catch (error) {
    appendLog(config.paths.log, "Feishu event log seen-message seed failed", { error: shortMessage(error) });
    return 0;
  }
}

function loadFeishuSeenMessages(config: ChannelConnectorsDaemonRuntimeConfig): Map<string, number> {
  const seenMessages = new Map<string, number>();
  const restored = restoreFeishuSeenMessagesFromStore(config, seenMessages);
  const seeded = seedFeishuSeenMessagesFromEventLog(config, seenMessages);
  pruneSeenMessages(seenMessages, FEISHU_SEEN_MESSAGE_TTL_MS, "feishu:");
  if (restored || seeded) saveFeishuSeenMessages(config, seenMessages);
  appendLog(config.paths.log, "Feishu seen-message cache loaded", {
    restored,
    seeded,
    active: [...seenMessages.keys()].filter((key) => key.startsWith("feishu:")).length,
  });
  return seenMessages;
}

function shouldSkipFeishuSeenMessage(
  config: ChannelConnectorsDaemonRuntimeConfig,
  seenMessages: Map<string, number>,
  messageId: string,
): boolean {
  const skipped = shouldSkipSeenMessage(seenMessages, messageId, {
    ttlMs: FEISHU_SEEN_MESSAGE_TTL_MS,
    scopePrefix: "feishu:",
  });
  if (!skipped) saveFeishuSeenMessages(config, seenMessages);
  return skipped;
}

function feishuDedupeKey(
  group: ChannelDaemonFeishuGroup,
  parsed: ChannelConnectorFeishuParsedWebhook,
  binding: ChannelConnectorRuntimeBinding,
  messageId: string,
): string | null {
  const eventId = normalizeString(parsed.eventId);
  void group;
  if (parsed.kind === "message" && messageId) return `feishu:message:${messageId}:${binding.id}`;
  if (eventId) return `feishu:event:${eventId}:${binding.id}`;
  return null;
}

async function dispatchOctoMessage(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  robotId: string | null;
  message: ChannelConnectorOctoInboundMessage;
  seenMessages: Map<string, number>;
}): Promise<void> {
  const { config, state, activeRunCancels, project, binding, robotId, message, seenMessages } = input;
  if (shouldSkipSeenMessage(seenMessages, message.messageId)) return;
  const nativeProfile = nativeProfileFromRuntime(project);
  const nativeBinding = nativeBindingFromRuntime(project, binding, robotId);
  const request: ChannelConnectorOctoInboundRequest = {
    bindingId: binding.id,
    accountId: binding.accountId,
    botId: nativeBinding.botId,
    message,
  };
  const resolved = { binding: nativeBinding, agentProfile: nativeProfile };
  const skippedReason = shouldSkipOctoMessage(request, resolved);
  const sessionKey = buildOctoSessionKey(message);
  const content = extractOctoContent(message);
  const attachments = extractOctoAttachments(message);
  const checkedAt = new Date().toISOString();
  const ingressAt = checkedAt;
  const ingressAtMs = isoTimestampMs(ingressAt) ?? Date.now();
  if (skippedReason) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt,
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
      attachmentCount: attachments.length,
      attachmentKinds: attachments.map((attachment) => attachment.kind),
      skippedReason,
    });
    return;
  }
  const governance = evaluateChannelConnectorGovernance({
    binding,
    platform: "octo",
    fromUid: message.fromUid,
    content,
    statePath: governanceStatePath(config),
  });
  if (!governance.allowed) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt,
      adapter: "octo",
      eventKind: "channel.governance.skipped",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      fromUid: message.fromUid,
      messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
      attachmentCount: attachments.length,
      attachmentKinds: attachments.map((attachment) => attachment.kind),
      skippedReason: governance.skippedReason,
      governanceDetail: governance.detail,
      rateLimit: governance.rateLimit,
    });
    return;
  }

  const transport = octoTransportFromMetadata(binding.metadata);
  const key = gatewayClientKey(config);
  const command = await handleChannelConnectorCommand({
    config,
    project,
    binding,
    message,
    sessionKey,
    controlsPath: sessionControlsPath(config),
    agentSessionsPath: agentSessionsPath(config),
    conversationHistoryPath: conversationHistoryPath(config),
    replyBuffersPath: replyBufferPath(config),
    gatewayClientKey: key,
    stopActiveRun: (scope) => stopLatestActiveRunForSession(activeRunCancels, scope),
    compactConversation: (scope) => compactChannelConnectorConversation({
      config,
      bindingId: scope.bindingId,
      sessionKey: scope.sessionKey,
      project: scope.project,
      gatewayClientKey: key,
    }),
    summarizeUsage: async (scope) => summarizeChannelConnectorUsageFromState(state, {
      bindingId: scope.bindingId,
      sessionKey: scope.sessionKey,
    }),
  });
  if (command.handled) {
    let replySent = false;
    let replyRequestCount: number | null = null;
    if (transport && command.replyText) {
      const replyPlan = renderOctoTextReply(message, command.replyText);
      if (replyPlan) {
        const result = await sendOctoTextReply(transport, replyPlan);
        replySent = result.ok === true;
        replyRequestCount = result.requestCount;
      }
    }
    const commandFinishedAt = new Date().toISOString();
    writeJsonLine(config.paths.octoEvents, {
      checkedAt: commandFinishedAt,
      eventKind: "channel.command",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      fromUid: message.fromUid,
      messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
      attachmentCount: attachments.length,
      attachmentKinds: attachments.map((attachment) => attachment.kind),
      command: command.command,
      commandAction: command.action,
      commandOk: command.ok,
      replySent,
      replyRequestCount,
      commandElapsedMs: elapsedMsSince(ingressAtMs, isoTimestampMs(commandFinishedAt) ?? Date.now()),
    });
    writeRuntime(config, state);
    return;
  }
  const nativeCommand = normalizeString(command.nativeCommand);
  let agentMessage = command.passthroughText
    ? {
      ...message,
      payload: {
        ...message.payload,
        content: command.passthroughText,
      },
    }
    : message;
  agentMessage = attachExtractedOctoAttachments(agentMessage);
  if (command.passthroughText) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt,
      eventKind: "channel.command.passthrough",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      fromUid: message.fromUid,
      messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
      attachmentCount: attachments.length,
      attachmentKinds: attachments.map((attachment) => attachment.kind),
      command: command.command,
      passthroughText: command.passthroughText,
      nativeCommand: nativeCommand || null,
    });
  }

  const control = getChannelConnectorSessionControl(sessionControlsPath(config), {
    bindingId: binding.id,
    sessionKey,
  });
  const progressDefaults = octoProgressDefaults(message);
  const effectiveProject = resolveChannelConnectorEffectiveProject(config, project, control);
  const gatewayEndpoint = effectiveProject.gatewayEndpoint || config.gateway.endpoint;
  const modelResolution = await resolveChannelConnectorVisualTurnProject({
    project: effectiveProject,
    binding,
    message: agentMessage,
    gatewayEndpoint,
    gatewayClientKey: key,
  });
  if (modelResolution.catalogError) {
    appendLog(config.paths.log, "Gateway model catalog lookup failed for visual routing", {
      adapter: "octo",
      bindingId: binding.id,
      projectId: effectiveProject.id,
      model: modelResolution.originalModel,
      error: modelResolution.catalogError,
    });
  }
  const turnProject = modelResolution.project;
  if (modelResolution.switched) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt,
      eventKind: "agent.model.selected",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      agent: turnProject.agent,
      originalModel: modelResolution.originalModel,
      selectedModel: modelResolution.selectedModel,
      reason: modelResolution.reason,
      visualAttachmentCount: countChannelConnectorVisualAttachments(agentMessage),
    });
  }
  const effectiveSessionLookup = {
    bindingId: binding.id,
    projectId: turnProject.id,
    sessionKey,
    agent: turnProject.agent,
    model: turnProject.model,
    workDir: turnProject.workDir,
  };
  const sessionRunLease = await acquireChannelSessionAgentRun(channelSessionAgentRunQueues, {
    bindingId: binding.id,
    sessionKey,
    parallel: channelSessionParallelAgentRunsEnabled(binding),
    onQueued: async (queuePosition) => {
      const activeSessionRun = latestActiveRunForSession(activeRunCancels, { bindingId: binding.id, sessionKey });
      let replySent = false;
      let replyRequestCount: number | null = null;
      if (transport) {
        const replyPlan = renderOctoTextReply(message, queuedAgentRunReply({
          activeRun: activeSessionRun?.entry || null,
          queuePosition,
        }));
        if (replyPlan) {
          const result = await sendOctoTextReply(transport, replyPlan);
          replySent = result.ok === true;
          replyRequestCount = result.requestCount;
        }
      }
      writeJsonLine(config.paths.octoEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "channel.agent.queued",
        adapter: "octo",
        bindingId: binding.id,
        sessionKey,
        messageId: message.messageId,
        channelId: message.channelId,
        channelType: message.channelType,
        fromUid: message.fromUid,
        queuePosition,
        activeRunId: activeSessionRun?.runId || null,
        activeMessageId: activeSessionRun?.entry.messageId || null,
        activeAgent: activeSessionRun?.entry.agent || null,
        activeModel: activeSessionRun?.entry.model || null,
        replySent,
        replyRequestCount,
        ingressAt,
        elapsedMs: elapsedMsSince(ingressAtMs),
      });
      writeRuntime(config, state);
    },
  });
  if (transport) {
    await sendOctoTyping(
      transport,
      message.channelType === 1 ? message.fromUid : message.channelId,
      message.channelType,
    );
  }
  const activeRunId = `${binding.id}:${message.messageId}`;
  const currentSession = getChannelConnectorAgentSession(agentSessionsPath(config), effectiveSessionLookup);
  const historyContext = renderChannelConnectorConversationHistoryContext(
    getChannelConnectorConversationHistory(conversationHistoryPath(config), {
      bindingId: binding.id,
      sessionKey,
    }),
  );
  const runStartedAt = new Date().toISOString();
  const runStartedAtMs = isoTimestampMs(runStartedAt) ?? Date.now();
  const abortController = new AbortController();
  let progressEventCount = 0;
  let latestProgress: ChannelConnectorAgentProgressEvent | null = null;
  let firstProgressAtMs: number | null = null;
  let previousProgressAtMs = runStartedAtMs;
  let lastOctoProgressSentAt = 0;
  let octoProgressSendCount = 0;
  let octoProgressFlush: Promise<void> = Promise.resolve();
  const queueOctoProgressReply = (event: ChannelConnectorAgentProgressEvent): void => {
    if (!transport) return;
    if (event.type === "completed") return;
    if (!shouldSendChannelProgressEvent(control, event, progressDefaults)) return;
    const replyText = renderOctoProgressText(event);
    const replyPlan = renderOctoTextReply(message, replyText);
    if (!replyPlan) return;
    const highPriority = event.type === "failed" || event.type === "error" || event.type === "tool";
    const nowMs = Date.now();
    if (!highPriority && nowMs - lastOctoProgressSentAt < 1500) return;
    if (!highPriority && octoProgressSendCount >= 40) return;
    lastOctoProgressSentAt = nowMs;
    octoProgressSendCount += 1;
    octoProgressFlush = octoProgressFlush.catch(() => undefined).then(async () => {
      const result = await sendOctoTextReply(transport, replyPlan);
      writeJsonLine(config.paths.octoEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "agent.progress.reply",
        adapter: "octo",
        bindingId: binding.id,
        sessionKey,
        messageId: message.messageId,
        channelId: message.channelId,
        channelType: message.channelType,
        progressType: event.type,
        rawType: event.rawType,
        itemType: event.itemType,
        replySent: result.ok === true,
        replyError: result.error,
        replyRequestCount: result.requestCount,
        progressReplySendCount: octoProgressSendCount,
        agentElapsedMs: elapsedMsSince(runStartedAtMs),
      });
    }).catch((error) => {
      writeJsonLine(config.paths.octoEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "agent.progress.reply",
        adapter: "octo",
        bindingId: binding.id,
        sessionKey,
        messageId: message.messageId,
        channelId: message.channelId,
        channelType: message.channelType,
        progressType: event.type,
        rawType: event.rawType,
        itemType: event.itemType,
        replySent: false,
        replyError: shortMessage(error),
        progressReplySendCount: octoProgressSendCount,
        agentElapsedMs: elapsedMsSince(runStartedAtMs),
      });
    });
  };
  state.activeRuns.unshift({
    id: activeRunId,
    startedAt: runStartedAt,
    updatedAt: runStartedAt,
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: turnProject.agent,
    model: turnProject.model,
    status: "running",
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
    progressEventCount,
    latestProgress,
    ingressAt,
    ingressToAgentStartMs: elapsedMsSince(ingressAtMs, runStartedAtMs),
    agentElapsedMs: 0,
    firstProgressLatencyMs: null,
  });
  activeRunCancels.set(activeRunId, {
    controller: abortController,
    startedAt: runStartedAt,
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: turnProject.agent,
    model: turnProject.model,
  });
  state.activeRuns = state.activeRuns.slice(0, 20);
  writeRuntime(config, state);
  writeJsonLine(config.paths.octoEvents, {
    checkedAt: runStartedAt,
    eventKind: "agent.run.started",
    adapter: "octo",
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: turnProject.agent,
    model: turnProject.model,
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
    progressDefaults,
    progressStreamEnabled: channelConnectorStreamMessagesEnabled(control, progressDefaults),
    progressToolsEnabled: channelConnectorToolMessagesEnabled(control, progressDefaults),
    ingressAt,
    ingressToAgentStartMs: elapsedMsSince(ingressAtMs, runStartedAtMs),
  });

  const runtimeDir = agentRuntimeDir(config, turnProject, binding);
  if ((agentMessage.attachments || []).length > 0 && metadataBoolean(binding, [
    "stageOctoUrlAttachments",
    "stage_octo_url_attachments",
    "stageUrlAttachments",
    "stage_url_attachments",
  ], true)) {
    const attachmentMaxBytes = metadataByteSize(binding, [
      "attachmentMaxBytes",
      "attachment_max_bytes",
      "maxAttachmentBytes",
      "max_attachment_bytes",
      "octoAttachmentMaxBytes",
      "octo_attachment_max_bytes",
    ], DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES);
    const staged = await stageOctoMessageAttachments({
      message: agentMessage,
      rootDir: runtimeDir,
      maxBytes: attachmentMaxBytes,
      allowPrivateNetwork: metadataBoolean(binding, [
        "allowPrivateAttachmentUrls",
        "allow_private_attachment_urls",
        "allowOctoPrivateAttachmentUrls",
        "allow_octo_private_attachment_urls",
      ], false),
    });
    agentMessage = staged.message;
    writeJsonLine(config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.attachments.staged",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      attachmentMaxBytes: describeByteSizeLimit(attachmentMaxBytes),
      stagedCount: staged.stagedCount,
      failedCount: staged.failedCount,
      localPaths: staged.localPaths,
    });
  }

  const stopTypingPulse = startOctoTypingPulse(transport, message);
  let agent: ChannelConnectorAgentTurnResult;
  try {
    agent = await runChannelConnectorAgentTurnWithSessionDriver({
      binding,
      project: turnProject,
      sessionKey,
      messageId: message.messageId,
      request: {
        project: turnProject,
        binding,
        message: agentMessage,
        sessionKey,
        gatewayEndpoint: turnProject.gatewayEndpoint || config.gateway.endpoint,
        gatewayClientKey: key,
        agentRuntimeDir: runtimeDir,
        historyContext: nativeCommand ? null : historyContext,
        modelCapabilities: modelResolution.modelCapabilities,
        nativeCommand: nativeCommand || null,
        signal: abortController.signal,
        session: {
          codexThreadId: currentSession?.codexThreadId || null,
        },
        onProgress: (event) => {
          progressEventCount += 1;
          latestProgress = event;
          const progressAtMs = isoTimestampMs(event.checkedAt) ?? Date.now();
          const sincePreviousProgressMs = elapsedMsSince(previousProgressAtMs, progressAtMs);
          if (firstProgressAtMs === null) firstProgressAtMs = progressAtMs;
          previousProgressAtMs = progressAtMs;
          const activeRun = state.activeRuns.find((run) => run.id === activeRunId);
          if (activeRun) {
            activeRun.updatedAt = event.checkedAt;
            activeRun.progressEventCount = progressEventCount;
            activeRun.latestProgress = latestProgress;
            activeRun.agentElapsedMs = elapsedMsSince(runStartedAtMs, progressAtMs);
            activeRun.firstProgressLatencyMs = firstProgressAtMs === null
              ? null
              : elapsedMsSince(runStartedAtMs, firstProgressAtMs);
          }
          writeJsonLine(config.paths.octoEvents, {
            checkedAt: event.checkedAt,
            eventKind: "agent.progress",
            adapter: "octo",
            bindingId: binding.id,
            sessionKey,
            messageId: message.messageId,
            agent: turnProject.agent,
            progressType: event.type,
            rawType: event.rawType,
            itemType: event.itemType,
            text: event.text,
            progressDefaultGroup: progressDefaults.isGroup,
            progressStreamEnabled: channelConnectorStreamMessagesEnabled(control, progressDefaults),
            progressToolsEnabled: channelConnectorToolMessagesEnabled(control, progressDefaults),
            agentElapsedMs: elapsedMsSince(runStartedAtMs, progressAtMs),
            sincePreviousProgressMs,
            firstProgressLatencyMs: firstProgressAtMs === null
              ? null
              : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
          });
          queueOctoProgressReply(event);
          writeRuntime(config, state);
        },
      },
    });
  } catch (error) {
    const caughtLatestProgress = latestProgress as ChannelConnectorAgentProgressEvent | null;
    agent = {
      attempted: true,
      ok: false,
      status: "failed",
      agent: turnProject.agent,
      model: turnProject.model,
      command: null,
      args: [],
      cwd: turnProject.workDir,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: elapsedMsSince(runStartedAtMs),
      error: shortMessage(error),
      progress: {
        eventCount: progressEventCount,
        latest: caughtLatestProgress,
        summary: caughtLatestProgress?.text || null,
      },
      session: {
        resumed: Boolean(currentSession?.codexThreadId),
        codexThreadId: currentSession?.codexThreadId || null,
      },
    };
  } finally {
    stopTypingPulse();
    activeRunCancels.delete(activeRunId);
    state.activeRuns = state.activeRuns.filter((run) => run.id !== activeRunId);
    sessionRunLease.release();
    writeRuntime(config, state);
  }
  if (agent.progress.eventCount > progressEventCount) {
    progressEventCount = agent.progress.eventCount;
    latestProgress = agent.progress.latest;
  }
  await octoProgressFlush;
  const codexImagePaths = codexNativeImageArgPaths(agent.args);
  if (codexImagePaths.length > 0) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.visual.input",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      agent: agent.agent,
      model: agent.model,
      visualInputMode: "codex-native-image",
      imageCount: codexImagePaths.length,
      localPaths: codexImagePaths,
    });
  }
  const outboundReply = agent.ok === true
    ? prepareAgentOutboundReply({
      replyText: agent.replyText,
      project: turnProject,
      binding,
      agentRuntimeDir: runtimeDir,
    })
    : {
      replyText: agent.replyText || "",
      files: [],
      errors: [],
      declaredCount: 0,
      maxBytes: outboundFileMaxBytes(binding),
    };
  appendChannelConnectorConversationHistory(conversationHistoryPath(config), {
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    role: "user",
    text: extractOctoContent(agentMessage),
    attachments: agentMessage.attachments || [],
    status: agent.status,
  });
  appendChannelConnectorConversationHistory(conversationHistoryPath(config), {
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    role: "assistant",
    text: agent.ok === true
      ? outboundFilesHistoryText(outboundReply)
      : agent.error || "",
    status: agent.status,
  });
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      codexThreadId: agent.session.codexThreadId || currentSession?.codexThreadId || null,
      messageId: message.messageId,
      status: agent.status,
      name: control?.sessionName || currentSession?.name || null,
    });
  }
  const agentFinishedAt = new Date().toISOString();
  const agentFinishedAtMs = isoTimestampMs(agentFinishedAt) ?? Date.now();
  const agentLatestProgressAtMs = latestProgress ? isoTimestampMs(latestProgress.checkedAt) : null;
  const usage = summarizeModelGatewayUsageForAgentRun({
    config,
    project: turnProject,
    startedAt: runStartedAt,
    finishedAt: agentFinishedAt,
  });
  state.agentRuns.unshift({
    checkedAt: agentFinishedAt,
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: turnProject.agent,
    status: agent.status,
    ok: agent.ok,
    durationMs: agent.durationMs,
    error: agent.error,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    progressEventCount,
    latestProgress,
    ingressAt,
    startedAt: runStartedAt,
    finishedAt: agentFinishedAt,
    totalElapsedMs: elapsedMsSince(ingressAtMs, agentFinishedAtMs),
    agentElapsedMs: elapsedMsSince(runStartedAtMs, agentFinishedAtMs),
    firstProgressLatencyMs: firstProgressAtMs === null
      ? null
      : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
    finalProgressLagMs: agentLatestProgressAtMs === null
      ? null
      : elapsedMsSince(agentLatestProgressAtMs, agentFinishedAtMs),
    usage,
  });
  state.agentRuns = state.agentRuns.slice(0, 20);

  let replySent = false;
  let replyBuffered = false;
  let replyBufferId: string | null = null;
  let replyOriginalRunes: number | null = null;
  let replyPreviewRunes: number | null = null;
  let replyRequestCount: number | null = null;
  let outboundFileSentCount = 0;
  let outboundFileRequestCount = 0;
  let outboundFileErrors = [...outboundReply.errors];
  const outboundReplyText = appendOutboundFileErrors(outboundReply.replyText, outboundReply.errors);
  if (transport && agent.ok === true && outboundReplyText) {
    const preparedReply = prepareChannelConnectorGroupBufferedReply({
      filePath: replyBufferPath(config),
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      platform: "octo",
      replyText: outboundReplyText,
      isGroup: isOctoGroupChannel(message.channelType),
    });
    replyBuffered = preparedReply.buffered;
    replyBufferId = preparedReply.bufferId;
    replyOriginalRunes = preparedReply.originalRunes;
    replyPreviewRunes = preparedReply.previewRunes;
    const replyPlan = renderOctoTextReply(message, preparedReply.replyText);
    if (replyPlan) {
      const result = await sendOctoTextReply(transport, replyPlan);
      replySent = result.ok === true;
      replyRequestCount = result.requestCount;
    }
  }
  if (transport && agent.ok === true && outboundReply.files.length > 0) {
    const sentFiles = await sendOctoOutboundFiles({
      transport,
      message,
      files: outboundReply.files,
    });
    outboundFileSentCount = sentFiles.sentCount;
    outboundFileRequestCount = sentFiles.requestCount;
    replyRequestCount = (replyRequestCount || 0) + sentFiles.requestCount;
    if (sentFiles.sentCount > 0) replySent = true;
    outboundFileErrors = [...outboundFileErrors, ...sentFiles.errors];
    if (sentFiles.errors.length > 0) {
      const replyPlan = renderOctoTextReply(message, `文件发送失败：${sentFiles.errors.join("; ")}`);
      if (replyPlan) {
        const result = await sendOctoTextReply(transport, replyPlan);
        replyRequestCount = (replyRequestCount || 0) + result.requestCount;
      }
    }
  }
  if (transport && agent.ok === false) {
    const replyPlan = renderOctoTextReply(message, renderAgentTerminalFailureReply(agent));
    if (replyPlan) {
      const result = await sendOctoTextReply(transport, replyPlan);
      replySent = result.ok === true;
      replyRequestCount = result.requestCount;
    }
  }

  const finishedAt = new Date().toISOString();
  const finishedAtMs = isoTimestampMs(finishedAt) ?? Date.now();
  const latestProgressAtMs = latestProgress ? isoTimestampMs(latestProgress.checkedAt) : null;
  writeJsonLine(config.paths.octoEvents, {
    checkedAt: finishedAt,
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    channelId: message.channelId,
    channelType: message.channelType,
    fromUid: message.fromUid,
    content,
    messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
    attachmentCount: attachments.length,
    attachmentKinds: attachments.map((attachment) => attachment.kind),
    directed: isOctoMessageDirectedAtBot(message, nativeBinding.botId),
    agentStatus: agent.status,
    agentOk: agent.ok,
    agentError: agent.error,
    progressEventCount,
    latestProgress,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    sessionTurnCount: nextSession?.turnCount || null,
    replyBuffered,
    replyBufferId,
    replyOriginalRunes,
    replyPreviewRunes,
    replySent,
    replyRequestCount,
    outboundFilesDeclared: outboundReply.declaredCount,
    outboundFilesResolved: outboundReply.files.length,
    outboundFilesSent: outboundFileSentCount,
    outboundFileRequestCount,
    outboundFileMaxBytes: describeByteSizeLimit(outboundReply.maxBytes),
    outboundFileErrors,
    ingressAt,
    startedAt: runStartedAt,
    finishedAt,
    totalElapsedMs: elapsedMsSince(ingressAtMs, finishedAtMs),
    agentElapsedMs: elapsedMsSince(runStartedAtMs, finishedAtMs),
    firstProgressLatencyMs: firstProgressAtMs === null
      ? null
      : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
    finalProgressLagMs: latestProgressAtMs === null
      ? null
      : elapsedMsSince(latestProgressAtMs, finishedAtMs),
  });
  writeRuntime(config, state);
}

function feishuContentFromParsed(parsed: ChannelConnectorFeishuParsedWebhook): string {
  if (parsed.kind === "card-action") {
    return normalizeFeishuCommandContent(extractChannelConnectorCommandFromActionValue(parsed.actionValue) || "");
  }
  if (parsed.kind === "bot-menu") {
    const eventKey = normalizeString(parsed.eventKey);
    if (!eventKey) return "";
    return normalizeFeishuCommandContent(eventKey.startsWith("/") || eventKey.startsWith("%") ? eventKey : `/${eventKey}`);
  }
  return normalizeFeishuCommandContent(parsed.text);
}

function normalizeFeishuCommandContent(value: unknown): string {
  const text = normalizeString(value);
  if (text.startsWith("/%")) return `/${text.slice(2)}`;
  if (text.startsWith("%")) return `/${text.slice(1)}`;
  return text;
}

async function dispatchFeishuParsedEvent(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  parsed: ChannelConnectorFeishuParsedWebhook;
  rawEvent: unknown;
  seenMessages: Map<string, number>;
}): Promise<Record<string, unknown> | null> {
  const { config, state, activeRunCancels, group, parsed, rawEvent, seenMessages } = input;
  const checkedAt = new Date().toISOString();
  const ingressAt = checkedAt;
  const ingressAtMs = isoTimestampMs(ingressAt) ?? Date.now();
  const content = feishuContentFromParsed(parsed);
  const refs = selectFeishuBindingRefs(group, parsed);
  if (!refs.length) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_binding_not_found",
      appId: parsed.appId || group.appId,
      channelId: parsed.channelId,
      fromUid: parsed.fromUid,
      messageId: parsed.messageId,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  const ref = refs[0];
  const { project, binding, transport } = ref;
  const sessionKey = feishuSessionKey(binding, parsed);
  const messageId = normalizeString(parsed.messageId) || `${parsed.kind}:${parsed.eventId || Date.now()}`;
  const dedupeKey = feishuDedupeKey(group, parsed, binding, messageId);
  if (dedupeKey && shouldSkipFeishuSeenMessage(config, seenMessages, dedupeKey)) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: "message-duplicate",
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_event_duplicate",
      bindingId: binding.id,
      dedupeKey,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  if (parsed.kind !== "message" && parsed.kind !== "card-action" && parsed.kind !== "bot-menu") {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_event_unsupported",
      bindingId: binding.id,
      sessionKey,
      messageId,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  if (!sessionKey || !parsed.fromUid || !parsed.channelId) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_message_identity_missing",
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  if (!content) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_message_text_missing",
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  if (parsed.kind === "message" && !parsed.directed) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_group_message_not_directed",
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  const governance = evaluateChannelConnectorGovernance({
    binding,
    platform: "feishu",
    fromUid: parsed.fromUid,
    content,
    statePath: governanceStatePath(config),
  });
  if (!governance.allowed) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: "channel.governance.skipped",
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: governance.skippedReason,
      governanceDetail: governance.detail,
      rateLimit: governance.rateLimit,
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  const message = feishuMessageFromParsed(parsed, content);
  const key = gatewayClientKey(config);
  const command = await handleChannelConnectorCommand({
    config,
    project,
    binding,
    message,
    sessionKey,
    controlsPath: sessionControlsPath(config),
    agentSessionsPath: agentSessionsPath(config),
    conversationHistoryPath: conversationHistoryPath(config),
    replyBuffersPath: replyBufferPath(config),
    gatewayClientKey: key,
    stopActiveRun: (scope) => stopLatestActiveRunForSession(activeRunCancels, scope),
    compactConversation: (scope) => compactChannelConnectorConversation({
      config,
      bindingId: scope.bindingId,
      sessionKey: scope.sessionKey,
      project: scope.project,
      gatewayClientKey: key,
    }),
    summarizeUsage: async (scope) => summarizeChannelConnectorUsageFromState(state, {
      bindingId: scope.bindingId,
      sessionKey: scope.sessionKey,
    }),
  });

  if (command.handled) {
    let replySent = false;
    let replyQueued = false;
    let replyError: string | null = null;
    let replyTransportAction: string | null = null;
    let replyRequestCount: number | null = null;
    let feishuResponse: Record<string, unknown> | null = null;
    const actionPayload = extractChannelConnectorSurfaceActionPayload(parsed.actionValue);
    const notice = feishuCommandNotice({
      command,
      actionKind: actionPayload.actionKind,
    });
    const shouldSendCard = feishuCardsEnabled(binding)
      && shouldSendFeishuCommandCard({
        command,
        parsedKind: parsed.kind,
        actionKind: actionPayload.actionKind,
      });
    if (shouldSendCard) {
      const result = await sendOrPatchFeishuCommandCard({
        config,
        project,
        binding,
        transport,
        parsed,
        sessionKey,
        notice,
      });
      replySent = result.ok === true;
      replyError = result.error;
      replyTransportAction = result.action;
      replyRequestCount = result.requestCount;
      if (parsed.kind === "card-action") {
        const toast = feishuCommandToast({
          command,
          actionKind: actionPayload.actionKind,
          transportOk: result.ok === true,
          transportError: result.error,
        });
        feishuResponse = {
          toast,
          card: {
            type: "raw",
            data: result.card,
          },
        };
      }
    }
    if (!replySent && !shouldSendCard && parsed.kind === "card-action" && command.replyText) {
      sendFeishuCommandTextReplyInBackground({
        config,
        transport,
        bindingId: binding.id,
        parsed,
        sessionKey,
        messageId,
        command: command.command,
        commandAction: command.action,
        content: command.replyText,
      });
      replyQueued = true;
      replyTransportAction = "send-message-async";
    }
    if (!replySent && !replyQueued && command.replyText) {
      const result = await sendFeishuTextMessage(transport, {
        chatId: parsed.channelId,
        content: command.replyText,
      }, feishuTokenCachePath(config));
      replySent = result.ok === true;
      replyError = result.error;
      replyTransportAction = result.action;
      replyRequestCount = result.requestCount;
    }
    const commandFinishedAt = new Date().toISOString();
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt: commandFinishedAt,
      eventKind: "channel.command",
      adapter: "feishu",
      bindingId: binding.id,
      sessionKey,
      messageId,
      eventType: parsed.eventType,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
      command: command.command,
      commandAction: command.action,
      commandOk: command.ok,
      replySent,
      replyQueued,
      replyTransportAction,
      replyError,
      replyRequestCount,
      commandElapsedMs: elapsedMsSince(ingressAtMs, isoTimestampMs(commandFinishedAt) ?? Date.now()),
    });
    writeRuntime(config, state);
    return feishuResponse;
  }

  const nativeCommand = normalizeString(command.nativeCommand);
  let agentMessage = command.passthroughText
    ? {
      ...message,
      payload: {
        ...message.payload,
        content: command.passthroughText,
      },
    }
    : message;
  if (command.passthroughText) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      eventKind: "channel.command.passthrough",
      adapter: "feishu",
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      ...feishuThreadLogFields(parsed),
      command: command.command,
      passthroughText: command.passthroughText,
      nativeCommand: nativeCommand || null,
    });
  }
  const groupMembers = await loadFeishuGroupMembers({
    config,
    binding,
    transport,
    parsed,
  });
  if (groupMembers.members.length) {
    agentMessage = {
      ...agentMessage,
      members: groupMembers.members,
    };
  }

  const control = getChannelConnectorSessionControl(sessionControlsPath(config), {
    bindingId: binding.id,
    sessionKey,
  });
  const progressDefaults = feishuProgressDefaults(parsed);
  const effectiveProject = resolveChannelConnectorEffectiveProject(config, project, control);
  const gatewayEndpoint = effectiveProject.gatewayEndpoint || config.gateway.endpoint;
  const modelResolution = await resolveChannelConnectorVisualTurnProject({
    project: effectiveProject,
    binding,
    message: agentMessage,
    gatewayEndpoint,
    gatewayClientKey: key,
  });
  if (modelResolution.catalogError) {
    appendLog(config.paths.log, "Gateway model catalog lookup failed for visual routing", {
      adapter: "feishu",
      bindingId: binding.id,
      projectId: effectiveProject.id,
      model: modelResolution.originalModel,
      error: modelResolution.catalogError,
    });
  }
  const turnProject = modelResolution.project;
  if (modelResolution.switched) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      eventKind: "agent.model.selected",
      adapter: "feishu",
      bindingId: binding.id,
      sessionKey,
      messageId,
      ...feishuThreadLogFields(parsed),
      agent: turnProject.agent,
      originalModel: modelResolution.originalModel,
      selectedModel: modelResolution.selectedModel,
      reason: modelResolution.reason,
      visualAttachmentCount: countChannelConnectorVisualAttachments(agentMessage),
    });
  }
  const effectiveSessionLookup = {
    bindingId: binding.id,
    projectId: turnProject.id,
    sessionKey,
    agent: turnProject.agent,
    model: turnProject.model,
    workDir: turnProject.workDir,
  };
  const sessionRunLease = await acquireChannelSessionAgentRun(channelSessionAgentRunQueues, {
    bindingId: binding.id,
    sessionKey,
    parallel: channelSessionParallelAgentRunsEnabled(binding),
    onQueued: async (queuePosition) => {
      const activeSessionRun = latestActiveRunForSession(activeRunCancels, { bindingId: binding.id, sessionKey });
      const result = await sendFeishuTextMessage(transport, {
        chatId: parsed.channelId || sessionKey,
        content: queuedAgentRunReply({
          activeRun: activeSessionRun?.entry || null,
          queuePosition,
        }),
      }, feishuTokenCachePath(config));
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "channel.agent.queued",
        adapter: "feishu",
        bindingId: binding.id,
        sessionKey,
        messageId,
        channelId: parsed.channelId,
        chatType: parsed.chatType,
        fromUid: parsed.fromUid,
        ...feishuThreadLogFields(parsed),
        queuePosition,
        activeRunId: activeSessionRun?.runId || null,
        activeMessageId: activeSessionRun?.entry.messageId || null,
        activeAgent: activeSessionRun?.entry.agent || null,
        activeModel: activeSessionRun?.entry.model || null,
        replySent: result.ok === true,
        replyError: result.error,
        replyRequestCount: result.requestCount,
        ingressAt,
        elapsedMs: elapsedMsSince(ingressAtMs),
      });
      writeRuntime(config, state);
    },
  });
  const activeRunId = `${binding.id}:${messageId}`;
  const currentSession = getChannelConnectorAgentSession(agentSessionsPath(config), effectiveSessionLookup);
  const historyContext = renderChannelConnectorConversationHistoryContext(
    getChannelConnectorConversationHistory(conversationHistoryPath(config), {
      bindingId: binding.id,
      sessionKey,
    }),
  );
  const runStartedAt = new Date().toISOString();
  const runStartedAtMs = isoTimestampMs(runStartedAt) ?? Date.now();
  const abortController = new AbortController();
  let progressEventCount = 0;
  let latestProgress: ChannelConnectorAgentProgressEvent | null = null;
  let firstProgressAtMs: number | null = null;
  let previousProgressAtMs = runStartedAtMs;
  const progressCardState = createFeishuProgressCardState();
  let lastFeishuProgressSentAt = 0;
  let feishuProgressSendCount = 0;
  let feishuProgressFlush: Promise<void> = Promise.resolve();
  const queueFeishuProgressFlush = (force: boolean, reason: string): void => {
    if (!progressCardState.dirty) return;
    const chatId = parsed.channelId;
    if (!chatId) return;
    const nowMs = Date.now();
    if (!force && progressCardState.messageId && nowMs - lastFeishuProgressSentAt < 1500) return;
    if (!force && feishuProgressSendCount >= 60) return;
    progressCardState.dirty = false;
    lastFeishuProgressSentAt = nowMs;
    feishuProgressSendCount += 1;
    feishuProgressFlush = feishuProgressFlush.catch(() => undefined).then(async () => {
      const result = await sendOrPatchFeishuProgressCard({
        config,
        transport,
        chatId,
        state: progressCardState,
        project: turnProject,
        sessionKey,
      });
      if (result.ok === true && result.messageId && !progressCardState.messageId) {
        progressCardState.messageId = result.messageId;
      }
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "agent.progress.card",
        adapter: "feishu",
        bindingId: binding.id,
        sessionKey,
        messageId,
        ...feishuThreadLogFields(parsed),
        progressCardMessageId: progressCardState.messageId,
        progressStatus: progressCardState.status,
        reason,
        transportAction: result.action,
        replySent: result.ok === true,
        replyError: result.error,
        replyRequestCount: result.requestCount,
        progressCardSendCount: feishuProgressSendCount,
        agentElapsedMs: elapsedMsSince(runStartedAtMs),
      });
    }).catch((error) => {
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "agent.progress.card",
        adapter: "feishu",
        bindingId: binding.id,
        sessionKey,
        messageId,
        ...feishuThreadLogFields(parsed),
        progressCardMessageId: progressCardState.messageId,
        progressStatus: progressCardState.status,
        reason,
        replySent: false,
        replyError: shortMessage(error),
        progressCardSendCount: feishuProgressSendCount,
        agentElapsedMs: elapsedMsSince(runStartedAtMs),
      });
    });
  };
  state.activeRuns.unshift({
    id: activeRunId,
    startedAt: runStartedAt,
    updatedAt: runStartedAt,
    bindingId: binding.id,
    sessionKey,
    messageId,
    ...feishuThreadLogFields(parsed),
    agent: turnProject.agent,
    model: turnProject.model,
    status: "running",
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
    progressEventCount,
    latestProgress,
    ingressAt,
    ingressToAgentStartMs: elapsedMsSince(ingressAtMs, runStartedAtMs),
    agentElapsedMs: 0,
    firstProgressLatencyMs: null,
  });
  activeRunCancels.set(activeRunId, {
    controller: abortController,
    startedAt: runStartedAt,
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: turnProject.agent,
    model: turnProject.model,
  });
  state.activeRuns = state.activeRuns.slice(0, 20);
  writeRuntime(config, state);
  writeJsonLine(config.paths.feishuEvents, {
    checkedAt: runStartedAt,
    eventKind: "agent.run.started",
    adapter: "feishu",
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: turnProject.agent,
    model: turnProject.model,
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
    progressDefaults,
    progressStreamEnabled: channelConnectorStreamMessagesEnabled(control, progressDefaults),
    progressToolsEnabled: channelConnectorToolMessagesEnabled(control, progressDefaults),
    ingressAt,
    ingressToAgentStartMs: elapsedMsSince(ingressAtMs, runStartedAtMs),
  });

  const stopTypingReaction = await startFeishuTypingReaction({
    config,
    transport,
    binding,
    sessionKey,
    messageId,
  });
  const runtimeDir = agentRuntimeDir(config, turnProject, binding);
  if ((agentMessage.attachments || []).length > 0) {
    const attachmentMaxBytes = metadataByteSize(binding, [
      "attachmentMaxBytes",
      "attachment_max_bytes",
      "maxAttachmentBytes",
      "max_attachment_bytes",
      "feishuAttachmentMaxBytes",
      "feishu_attachment_max_bytes",
    ], DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES);
    const staged = await stageFeishuMessageAttachments({
      config,
      transport,
      message: agentMessage,
      rootDir: runtimeDir,
      maxBytes: attachmentMaxBytes,
    });
    agentMessage = staged.message;
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.attachments.staged",
      adapter: "feishu",
      bindingId: binding.id,
      sessionKey,
      messageId,
      ...feishuThreadLogFields(parsed),
      attachmentMaxBytes: describeByteSizeLimit(attachmentMaxBytes),
      stagedCount: staged.stagedCount,
      failedCount: staged.failedCount,
      localPaths: staged.localPaths,
    });
  }
  let agent: ChannelConnectorAgentTurnResult;
  try {
    agent = await runChannelConnectorAgentTurnWithSessionDriver({
      binding,
      project: turnProject,
      sessionKey,
      messageId,
      request: {
        project: turnProject,
        binding,
        message: agentMessage,
        sessionKey,
        gatewayEndpoint: turnProject.gatewayEndpoint || config.gateway.endpoint,
        gatewayClientKey: key,
        agentRuntimeDir: runtimeDir,
        historyContext: nativeCommand ? null : historyContext,
        modelCapabilities: modelResolution.modelCapabilities,
        nativeCommand: nativeCommand || null,
        signal: abortController.signal,
        session: {
          codexThreadId: currentSession?.codexThreadId || null,
        },
        onProgress: (event) => {
          progressEventCount += 1;
          latestProgress = event;
          const progressAtMs = isoTimestampMs(event.checkedAt) ?? Date.now();
          const sincePreviousProgressMs = elapsedMsSince(previousProgressAtMs, progressAtMs);
          if (firstProgressAtMs === null) firstProgressAtMs = progressAtMs;
          previousProgressAtMs = progressAtMs;
          const activeRun = state.activeRuns.find((run) => run.id === activeRunId);
          if (activeRun) {
            activeRun.updatedAt = event.checkedAt;
            activeRun.progressEventCount = progressEventCount;
            activeRun.latestProgress = latestProgress;
            activeRun.agentElapsedMs = elapsedMsSince(runStartedAtMs, progressAtMs);
            activeRun.firstProgressLatencyMs = firstProgressAtMs === null
              ? null
              : elapsedMsSince(runStartedAtMs, firstProgressAtMs);
          }
          writeJsonLine(config.paths.feishuEvents, {
            checkedAt: event.checkedAt,
            eventKind: "agent.progress",
            adapter: "feishu",
            bindingId: binding.id,
            sessionKey,
            messageId,
            ...feishuThreadLogFields(parsed),
            agent: turnProject.agent,
            progressType: event.type,
            rawType: event.rawType,
            itemType: event.itemType,
            text: event.text,
            progressDefaultGroup: progressDefaults.isGroup,
            progressStreamEnabled: channelConnectorStreamMessagesEnabled(control, progressDefaults),
            progressToolsEnabled: channelConnectorToolMessagesEnabled(control, progressDefaults),
            agentElapsedMs: elapsedMsSince(runStartedAtMs, progressAtMs),
            sincePreviousProgressMs,
            firstProgressLatencyMs: firstProgressAtMs === null
              ? null
              : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
          });
          const highPriority = event.type === "failed" || event.type === "error" || event.type === "completed";
          if (shouldSendFeishuProgressEvent(control, event, progressDefaults)) {
            const changed = pushFeishuProgressCardEvent(progressCardState, event);
            if (changed) queueFeishuProgressFlush(highPriority, event.type);
          }
          writeRuntime(config, state);
        },
      },
    });
  } catch (error) {
    const caughtLatestProgress = latestProgress as ChannelConnectorAgentProgressEvent | null;
    agent = {
      attempted: true,
      ok: false,
      status: "failed",
      agent: turnProject.agent,
      model: turnProject.model,
      command: null,
      args: [],
      cwd: turnProject.workDir,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: elapsedMsSince(runStartedAtMs),
      error: shortMessage(error),
      progress: {
        eventCount: progressEventCount,
        latest: caughtLatestProgress,
        summary: caughtLatestProgress?.text || null,
      },
      session: {
        resumed: Boolean(currentSession?.codexThreadId),
        codexThreadId: currentSession?.codexThreadId || null,
      },
    };
  } finally {
    await stopTypingReaction();
    activeRunCancels.delete(activeRunId);
    state.activeRuns = state.activeRuns.filter((run) => run.id !== activeRunId);
    sessionRunLease.release();
    writeRuntime(config, state);
  }
  if (agent.progress.eventCount > progressEventCount) {
    progressEventCount = agent.progress.eventCount;
    latestProgress = agent.progress.latest;
  }
  if (channelConnectorStreamMessagesEnabled(control, progressDefaults) && (progressCardState.messageId || progressCardState.entries.length > 0)) {
    if (agent.ok === false) {
      ensureFeishuProgressCardFailure(progressCardState, agent.error, agent.status);
    } else if (agent.ok === true) {
      completeFeishuProgressCard(progressCardState);
    }
    queueFeishuProgressFlush(true, "final");
    await feishuProgressFlush;
  }
  const codexImagePaths = codexNativeImageArgPaths(agent.args);
  if (codexImagePaths.length > 0) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.visual.input",
      adapter: "feishu",
      bindingId: binding.id,
      sessionKey,
      messageId,
      ...feishuThreadLogFields(parsed),
      agent: agent.agent,
      model: agent.model,
      visualInputMode: "codex-native-image",
      imageCount: codexImagePaths.length,
      localPaths: codexImagePaths,
    });
  }
  const outboundReply = agent.ok === true
    ? prepareAgentOutboundReply({
      replyText: agent.replyText,
      project: turnProject,
      binding,
      agentRuntimeDir: runtimeDir,
    })
    : {
      replyText: agent.replyText || "",
      files: [],
      errors: [],
      declaredCount: 0,
      maxBytes: outboundFileMaxBytes(binding),
    };
  appendChannelConnectorConversationHistory(conversationHistoryPath(config), {
    bindingId: binding.id,
    sessionKey,
    messageId,
    role: "user",
    text: extractOctoContent(agentMessage),
    attachments: agentMessage.attachments || [],
    status: agent.status,
  });
  appendChannelConnectorConversationHistory(conversationHistoryPath(config), {
    bindingId: binding.id,
    sessionKey,
    messageId,
    role: "assistant",
    text: agent.ok === true
      ? outboundFilesHistoryText(outboundReply)
      : agent.error || "",
    status: agent.status,
  });
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      codexThreadId: agent.session.codexThreadId || currentSession?.codexThreadId || null,
      messageId,
      status: agent.status,
      name: control?.sessionName || currentSession?.name || null,
    });
  }
  const agentFinishedAt = new Date().toISOString();
  const agentFinishedAtMs = isoTimestampMs(agentFinishedAt) ?? Date.now();
  const agentLatestProgressAtMs = latestProgress ? isoTimestampMs(latestProgress.checkedAt) : null;
  const usage = summarizeModelGatewayUsageForAgentRun({
    config,
    project: turnProject,
    startedAt: runStartedAt,
    finishedAt: agentFinishedAt,
  });
  state.agentRuns.unshift({
    checkedAt: agentFinishedAt,
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: turnProject.agent,
    status: agent.status,
    ok: agent.ok,
    durationMs: agent.durationMs,
    error: agent.error,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    progressEventCount,
    latestProgress,
    ingressAt,
    startedAt: runStartedAt,
    finishedAt: agentFinishedAt,
    totalElapsedMs: elapsedMsSince(ingressAtMs, agentFinishedAtMs),
    agentElapsedMs: elapsedMsSince(runStartedAtMs, agentFinishedAtMs),
    firstProgressLatencyMs: firstProgressAtMs === null
      ? null
      : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
    finalProgressLagMs: agentLatestProgressAtMs === null
      ? null
      : elapsedMsSince(agentLatestProgressAtMs, agentFinishedAtMs),
    usage,
  });
  state.agentRuns = state.agentRuns.slice(0, 20);

  let replySent = false;
  let replyError: string | null = null;
  let replyTransportAction: string | null = null;
  let replyRequestCount: number | null = null;
  let replyCardAttempted = false;
  let replyCardError: string | null = null;
  let replyBuffered = false;
  let replyBufferId: string | null = null;
  let replyOriginalRunes: number | null = null;
  let replyPreviewRunes: number | null = null;
  let outboundFileSentCount = 0;
  let outboundFileRequestCount = 0;
  let outboundFileErrors = [...outboundReply.errors];
  const outboundReplyText = appendOutboundFileErrors(outboundReply.replyText, outboundReply.errors);
  const replyContent = agent.ok === true && outboundReplyText
    ? outboundReplyText
    : agent.ok === false && !progressCardState.messageId
      ? renderAgentTerminalFailureReply(agent)
      : null;
  if (replyContent) {
    const preparedReply = agent.ok === true
      ? prepareChannelConnectorGroupBufferedReply({
        filePath: replyBufferPath(config),
        bindingId: binding.id,
        sessionKey,
        messageId,
        platform: "feishu",
        replyText: replyContent,
        isGroup: normalizeString(parsed.chatType).toLowerCase() === "group",
      })
      : {
        replyText: replyContent,
        buffered: false,
        bufferId: null,
        originalRunes: Array.from(replyContent).length,
        previewRunes: Array.from(replyContent).length,
      };
    replyBuffered = preparedReply.buffered;
    replyBufferId = preparedReply.bufferId;
    replyOriginalRunes = preparedReply.originalRunes;
    replyPreviewRunes = preparedReply.previewRunes;
    const sent = await sendFeishuFinalReply({
      config,
      transport,
      binding,
      project: turnProject,
      chatId: parsed.channelId,
      sessionKey,
      replyText: preparedReply.replyText,
      status: agent.ok === true ? "ok" : "failed",
    });
    replySent = sent.result.ok === true;
    replyError = sent.result.error;
    replyTransportAction = sent.transportAction;
    replyRequestCount = sent.result.requestCount;
    replyCardAttempted = sent.cardAttempted;
    replyCardError = sent.cardError;
  }
  if (agent.ok === true && outboundReply.files.length > 0) {
    const sentFiles = await sendFeishuOutboundFiles({
      config,
      transport,
      chatId: parsed.channelId,
      files: outboundReply.files,
    });
    outboundFileSentCount = sentFiles.sentCount;
    outboundFileRequestCount = sentFiles.requestCount;
    replyRequestCount = (replyRequestCount || 0) + sentFiles.requestCount;
    if (sentFiles.sentCount > 0) replySent = true;
    outboundFileErrors = [...outboundFileErrors, ...sentFiles.errors];
    if (sentFiles.errors.length > 0) {
      const result = await sendFeishuTextMessage(transport, {
        chatId: parsed.channelId,
        content: `文件发送失败：${sentFiles.errors.join("; ")}`,
      }, feishuTokenCachePath(config));
      replyRequestCount = (replyRequestCount || 0) + result.requestCount;
    }
  }

  const finishedAt = new Date().toISOString();
  const finishedAtMs = isoTimestampMs(finishedAt) ?? Date.now();
  const latestProgressAtMs = latestProgress ? isoTimestampMs(latestProgress.checkedAt) : null;
  writeJsonLine(config.paths.feishuEvents, {
    checkedAt: finishedAt,
    eventKind: "agent.run.finished",
    adapter: "feishu",
    bindingId: binding.id,
    sessionKey,
    messageId,
    channelId: parsed.channelId,
    chatType: parsed.chatType,
    fromUid: parsed.fromUid,
    ...feishuThreadLogFields(parsed),
    content,
    rawEventKind: parsed.kind,
    agentStatus: agent.status,
    agentOk: agent.ok,
    agentError: agent.error,
    progressEventCount,
    latestProgress,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    sessionTurnCount: nextSession?.turnCount || null,
    replyBuffered,
    replyBufferId,
    replyOriginalRunes,
    replyPreviewRunes,
    replySent,
    replyError,
    replyTransportAction,
    replyRequestCount,
    replyCardAttempted,
    replyCardError,
    outboundFilesDeclared: outboundReply.declaredCount,
    outboundFilesResolved: outboundReply.files.length,
    outboundFilesSent: outboundFileSentCount,
    outboundFileRequestCount,
    outboundFileMaxBytes: describeByteSizeLimit(outboundReply.maxBytes),
    outboundFileErrors,
    groupMemberPullAttempted: groupMembers.attempted,
    groupMemberCount: groupMembers.members.length,
    groupMemberPullPages: groupMembers.pageCount,
    groupMemberPullHasMore: groupMembers.hasMore,
    groupMemberPullError: groupMembers.error,
    ingressAt,
    startedAt: runStartedAt,
    finishedAt,
    totalElapsedMs: elapsedMsSince(ingressAtMs, finishedAtMs),
    agentElapsedMs: elapsedMsSince(runStartedAtMs, finishedAtMs),
    firstProgressLatencyMs: firstProgressAtMs === null
      ? null
      : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
    finalProgressLagMs: latestProgressAtMs === null
      ? null
      : elapsedMsSince(latestProgressAtMs, finishedAtMs),
    rawEventShape: isRecord(rawEvent) ? Object.keys(rawEvent).slice(0, 12) : [],
  });
  writeRuntime(config, state);
  return null;
}

async function startOctoConnection(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  sockets: OctoWukongSocket[];
  restHeartbeatTimers: NodeJS.Timeout[];
  seenMessages: Map<string, number>;
}): Promise<void> {
  const { config, state, activeRunCancels, project, binding, sockets, restHeartbeatTimers, seenMessages } = input;
  const transport = octoTransportFromMetadata(binding.metadata);
  if (!transport) {
    state.octoConnections[binding.id] = connectionState(binding, {
      state: "closed",
      lastError: "octo_transport_config_missing",
    });
    writeRuntime(config, state);
    return;
  }
  const resolved = await resolveOctoCredentials(config, binding);
  if (!resolved) {
    state.octoConnections[binding.id] = connectionState(binding, {
      state: "closed",
      apiUrl: transport.apiUrl,
      lastError: "octo_register_failed",
    });
    writeRuntime(config, state);
    return;
  }
  const octoStatus = (status: Partial<ChannelDaemonOctoConnectionState>): ChannelDaemonOctoConnectionState => connectionState(
    binding,
    {
      ...(state.octoConnections[binding.id] || {}),
      ...status,
    },
  );
  const socket = new OctoWukongSocket({
    bindingId: binding.id,
    wsUrl: resolved.entry.wsUrl,
    uid: resolved.entry.robotId,
    token: resolved.entry.imToken,
    reconnect: true,
    heartbeatMs: octoHeartbeatMs(binding),
    pongTimeoutMs: octoPongTimeoutMs(binding),
    reconnectMs: octoReconnectMs(binding),
    reconnectJitterMs: octoReconnectJitterMs(binding),
    logger: logger(config),
    onConnected: () => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      appendLog(config.paths.log, "Octo WebSocket connected", { bindingId: binding.id });
      writeRuntime(config, state);
    },
    onDisconnected: () => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      writeRuntime(config, state);
    },
    onError: () => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      writeRuntime(config, state);
    },
    onMessage: (message) => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      writeRuntime(config, state);
      void dispatchOctoMessage({
        config,
        state,
        activeRunCancels,
        project,
        binding,
        robotId: resolved.entry.robotId,
        message,
        seenMessages,
      }).catch((error) => {
        appendLog(config.paths.log, "Octo message dispatch failed", {
          bindingId: binding.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    },
  });
  sockets.push(socket);
  const restHeartbeatMs = octoRestHeartbeatMs(binding);
  if (restHeartbeatMs > 0) {
    const timer = setInterval(() => {
      void sendOctoHeartbeat(transport).then((result) => {
        const current = state.octoConnections[binding.id] || octoStatus({
          ...socket.status(),
          apiUrl: transport.apiUrl,
          robotId: resolved.entry.robotId,
          credentialSource: resolved.source,
        });
        const checkedAt = new Date().toISOString();
        if (result.ok !== true) {
          state.octoConnections[binding.id] = octoStatus({
            ...socket.status(),
            apiUrl: transport.apiUrl,
            robotId: resolved.entry.robotId,
            credentialSource: resolved.source,
            restHeartbeatIntervalMs: restHeartbeatMs,
            restHeartbeatFailures: current.restHeartbeatFailures + 1,
            restHeartbeatSuccesses: current.restHeartbeatSuccesses,
            restHeartbeatLastOkAt: current.restHeartbeatLastOkAt,
            restHeartbeatLastErrorAt: checkedAt,
            restHeartbeatLastError: result.error || `HTTP ${result.statusCode || "unknown"}`,
          });
          appendLog(config.paths.log, "Octo REST heartbeat failed", {
            bindingId: binding.id,
            statusCode: result.statusCode,
            error: result.error,
          });
        } else {
          state.octoConnections[binding.id] = octoStatus({
            ...socket.status(),
            apiUrl: transport.apiUrl,
            robotId: resolved.entry.robotId,
            credentialSource: resolved.source,
            restHeartbeatIntervalMs: restHeartbeatMs,
            restHeartbeatFailures: current.restHeartbeatFailures,
            restHeartbeatSuccesses: current.restHeartbeatSuccesses + 1,
            restHeartbeatLastOkAt: checkedAt,
            restHeartbeatLastErrorAt: current.restHeartbeatLastErrorAt,
            restHeartbeatLastError: null,
          });
        }
        writeRuntime(config, state);
      });
    }, restHeartbeatMs);
    timer.unref();
    restHeartbeatTimers.push(timer);
  }
  state.octoConnections[binding.id] = octoStatus({
    ...socket.status(),
    apiUrl: transport.apiUrl,
    robotId: resolved.entry.robotId,
    credentialSource: resolved.source,
    restHeartbeatIntervalMs: restHeartbeatMs,
  });
  writeRuntime(config, state);
  socket.connect();
}

async function startOctoConnections(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry,
  sockets: OctoWukongSocket[],
  restHeartbeatTimers: NodeJS.Timeout[],
  seenMessages: Map<string, number>,
): Promise<void> {
  for (const project of config.projects) {
    for (const binding of project.platformBindings) {
      if (binding.platform !== "octo" || binding.enabled === false) continue;
      await startOctoConnection({
        config,
        state,
        activeRunCancels,
        project,
        binding,
        sockets,
        restHeartbeatTimers,
        seenMessages,
      });
    }
  }
}

function feishuEnvelope(
  appId: string,
  eventType: string,
  raw: unknown,
): Record<string, unknown> {
  const event = isRecord(raw) ? raw : {};
  return {
    schema: "2.0",
    header: {
      event_type: eventType,
      app_id: normalizeString(event.app_id) || appId,
      event_id: normalizeString(event.event_id) || normalizeString(event.uuid) || null,
      token: normalizeString(event.token) || null,
    },
    event,
  };
}

function createFeishuGroups(config: ChannelConnectorsDaemonRuntimeConfig): ChannelDaemonFeishuGroup[] {
  const groups = new Map<string, ChannelDaemonFeishuGroup>();
  for (const project of config.projects) {
    for (const binding of project.platformBindings) {
      if (binding.platform !== "feishu" || binding.enabled === false) continue;
      const transport = feishuTransportFromMetadata(binding.metadata, binding.accountId);
      if (!transport) {
        const key = `missing_${binding.id}`;
        groups.set(key, {
          key,
          appId: normalizeString(binding.accountId) || binding.id,
          accountId: binding.accountId,
          apiUrl: null,
          refs: [],
          client: null,
          reconnects: 0,
          receivedMessages: 0,
          lastConnectedAt: null,
          lastDisconnectedAt: null,
          lastReceivedAt: null,
          lifecycleReceivedMessages: 0,
          lifecycleLastReceivedAt: null,
          suppressZeroInboundRenewal: false,
          lastWatchdogRestartAt: null,
          lastWatchdogRestartReason: null,
          lastUnhealthyAt: null,
          lastError: "feishu_transport_config_missing",
          watchdogRestarting: false,
          zeroInboundRenewals: 0,
        });
        continue;
      }
      const key = feishuGroupKey(transport);
      const group = groups.get(key) || {
        key,
        appId: transport.appId,
        accountId: binding.accountId || transport.appId,
        apiUrl: transport.apiUrl,
        refs: [],
        client: null,
        reconnects: 0,
        receivedMessages: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastReceivedAt: null,
        lifecycleReceivedMessages: 0,
        lifecycleLastReceivedAt: null,
        suppressZeroInboundRenewal: false,
        lastWatchdogRestartAt: null,
        lastWatchdogRestartReason: null,
        lastUnhealthyAt: null,
        lastError: null,
        watchdogRestarting: false,
        zeroInboundRenewals: 0,
      };
      group.refs.push({ project, binding, transport });
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

function dispatchFeishuParsedEventInBackground(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  parsed: ChannelConnectorFeishuParsedWebhook;
  rawEvent: unknown;
  seenMessages: Map<string, number>;
}): void {
  void dispatchFeishuParsedEvent(input).catch((error) => {
    appendLog(input.config.paths.log, "Feishu async event dispatch failed", {
      groupKey: input.group.key,
      eventKind: input.parsed.kind,
      eventType: input.parsed.eventType,
      eventId: input.parsed.eventId,
      messageId: input.parsed.messageId,
      error: shortMessage(error),
    });
    writeJsonLine(input.config.paths.feishuEvents, {
      checkedAt: new Date().toISOString(),
      adapter: "feishu",
      eventKind: "dispatch.failed",
      eventType: input.parsed.eventType,
      eventId: input.parsed.eventId,
      accepted: false,
      skippedReason: "feishu_async_dispatch_failed",
      appId: input.parsed.appId || input.group.appId,
      channelId: input.parsed.channelId,
      fromUid: input.parsed.fromUid,
      messageId: input.parsed.messageId,
      error: shortMessage(error),
      ...feishuThreadLogFields(input.parsed),
    });
  });
}

function sendFeishuCommandTextReplyInBackground(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  bindingId: string;
  parsed: ChannelConnectorFeishuParsedWebhook;
  sessionKey: string;
  messageId: string;
  command: string | null;
  commandAction: string | null;
  content: string;
}): void {
  void sendFeishuTextMessage(input.transport, {
    chatId: input.parsed.channelId || "",
    content: input.content,
  }, feishuTokenCachePath(input.config)).then((result) => {
    writeJsonLine(input.config.paths.feishuEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.command.reply",
      adapter: "feishu",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      eventType: input.parsed.eventType,
      channelId: input.parsed.channelId,
      chatType: input.parsed.chatType,
      fromUid: input.parsed.fromUid,
      ...feishuThreadLogFields(input.parsed),
      command: input.command,
      commandAction: input.commandAction,
      replyAsync: true,
      replySent: result.ok === true,
      replyTransportAction: result.action,
      replyError: result.error,
      replyRequestCount: result.requestCount,
      replyMessageId: result.messageId || null,
      replyChunkCount: result.chunkCount || null,
    });
  }).catch((error) => {
    writeJsonLine(input.config.paths.feishuEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.command.reply",
      adapter: "feishu",
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      eventType: input.parsed.eventType,
      channelId: input.parsed.channelId,
      chatType: input.parsed.chatType,
      fromUid: input.parsed.fromUid,
      ...feishuThreadLogFields(input.parsed),
      command: input.command,
      commandAction: input.commandAction,
      replyAsync: true,
      replySent: false,
      replyTransportAction: "send-message",
      replyError: shortMessage(error),
    });
  });
}

function createFeishuDispatcher(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  seenMessages: Map<string, number>;
}): EventDispatcher {
  const { config, state, activeRunCancels, group, seenMessages } = input;
  const dispatcher = new EventDispatcher({
    logger: feishuLogger(config),
    loggerLevel: LoggerLevel.info,
  });
  dispatcher.register({
    "im.message.receive_v1": async (data: unknown) => {
      const receivedAt = new Date().toISOString();
      group.receivedMessages += 1;
      group.lifecycleReceivedMessages += 1;
      group.lastReceivedAt = receivedAt;
      group.lifecycleLastReceivedAt = receivedAt;
      group.zeroInboundRenewals = 0;
      group.suppressZeroInboundRenewal = false;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "im.message.receive_v1", data));
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: receivedAt,
        adapter: "feishu",
        eventKind: parsed.kind,
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        appId: parsed.appId || group.appId,
        channelId: parsed.channelId,
        fromUid: parsed.fromUid,
        messageId: parsed.messageId,
        longConnection: true,
      });
      updateFeishuRuntime(config, state, group);
      dispatchFeishuParsedEventInBackground({
        config,
        state,
        activeRunCancels,
        group,
        parsed,
        rawEvent: data,
        seenMessages,
      });
    },
    "card.action.trigger": async (data: unknown) => {
      const receivedAt = new Date().toISOString();
      group.lastReceivedAt = receivedAt;
      group.lifecycleLastReceivedAt = receivedAt;
      group.receivedMessages += 1;
      group.lifecycleReceivedMessages += 1;
      group.zeroInboundRenewals = 0;
      group.suppressZeroInboundRenewal = false;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "card.action.trigger", data));
      updateFeishuRuntime(config, state, group);
      const response = await dispatchFeishuParsedEvent({
        config,
        state,
        activeRunCancels,
        group,
        parsed,
        rawEvent: data,
        seenMessages,
      });
      return response || undefined;
    },
    "application.bot.menu_v6": async (data: unknown) => {
      const receivedAt = new Date().toISOString();
      group.lastReceivedAt = receivedAt;
      group.lifecycleLastReceivedAt = receivedAt;
      group.receivedMessages += 1;
      group.lifecycleReceivedMessages += 1;
      group.zeroInboundRenewals = 0;
      group.suppressZeroInboundRenewal = false;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "application.bot.menu_v6", data));
      updateFeishuRuntime(config, state, group);
      dispatchFeishuParsedEventInBackground({
        config,
        state,
        activeRunCancels,
        group,
        parsed,
        rawEvent: data,
        seenMessages,
      });
    },
    "im.message.recalled_v1": async (data: unknown) => {
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: new Date().toISOString(),
        adapter: "feishu",
        eventKind: "message-recalled",
        eventType: "im.message.recalled_v1",
        longConnection: true,
        rawEventShape: isRecord(data) ? Object.keys(data).slice(0, 12) : [],
      });
    },
    "im.message.read_v1": async () => {},
    "im.message.reaction.created_v1": async () => {},
    "im.message.reaction.deleted_v1": async () => {},
  });
  return dispatcher;
}

function startFeishuClientForGroup(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  seenMessages: Map<string, number>;
}): WSClient {
  const { config, state, activeRunCancels, group, clients, seenMessages } = input;
  const dispatcher = createFeishuDispatcher({
    config,
    state,
    activeRunCancels,
    group,
    seenMessages,
  });
  const pingTimeout = feishuPingTimeoutSeconds(group);
  const feishuWsConfig = pingTimeout > 0 ? { pingTimeout } : undefined;
  const client = new WSClient({
    appId: group.appId,
    appSecret: group.refs[0].transport.appSecret,
    domain: metadataString(group.refs[0].binding, ["domain", "apiUrl", "api_url", "baseUrl", "base_url"]) || undefined,
    logger: feishuLogger(config),
    loggerLevel: LoggerLevel.info,
    autoReconnect: true,
    handshakeTimeoutMs: 20_000,
    ...(feishuWsConfig ? { wsConfig: feishuWsConfig } : {}),
    source: "openclaw-studio-channel-daemon",
    onReady: () => {
      group.lastConnectedAt = new Date().toISOString();
      group.lastDisconnectedAt = null;
      group.lifecycleReceivedMessages = 0;
      group.lifecycleLastReceivedAt = null;
      group.lastUnhealthyAt = null;
      group.lastError = null;
      group.watchdogRestarting = false;
      appendLog(config.paths.log, "Feishu WebSocket connected", {
        key: group.key,
        bindingIds: group.refs.map((ref) => ref.binding.id),
        pingTimeoutSeconds: feishuPingTimeoutSeconds(group),
        connectedIdleRenewAfterMs: feishuConnectedIdleRenewMs(group),
        zeroInboundRenewAfterMs: feishuZeroInboundRenewMs(group),
      });
      updateFeishuRuntime(config, state, group);
    },
    onError: (error) => {
      group.lastError = shortMessage(error);
      group.lastDisconnectedAt = new Date().toISOString();
      group.lastUnhealthyAt ||= group.lastDisconnectedAt;
      appendLog(config.paths.log, "Feishu WebSocket error", {
        key: group.key,
        error: group.lastError,
      });
      updateFeishuRuntime(config, state, group);
    },
    onReconnecting: () => {
      group.reconnects += 1;
      group.lastDisconnectedAt = new Date().toISOString();
      group.lastUnhealthyAt ||= group.lastDisconnectedAt;
      appendLog(config.paths.log, "Feishu WebSocket reconnecting", {
        key: group.key,
        reconnects: group.reconnects,
        state: group.client?.getConnectionStatus()?.state || "unknown",
      });
      updateFeishuRuntime(config, state, group);
    },
    onReconnected: () => {
      group.lastConnectedAt = new Date().toISOString();
      group.lastDisconnectedAt = null;
      group.lifecycleReceivedMessages = 0;
      group.lifecycleLastReceivedAt = null;
      group.lastUnhealthyAt = null;
      group.lastError = null;
      group.watchdogRestarting = false;
      appendLog(config.paths.log, "Feishu WebSocket reconnected", {
        key: group.key,
        reconnects: group.reconnects,
      });
      updateFeishuRuntime(config, state, group);
    },
  });
  group.client = client;
  clients.push(client);
  state.feishuConnections[group.key] = feishuConnectionState(group);
  writeRuntime(config, state);
  void client.start({ eventDispatcher: dispatcher }).catch((error) => {
    group.lastError = shortMessage(error);
    group.lastDisconnectedAt = new Date().toISOString();
    group.lastUnhealthyAt ||= group.lastDisconnectedAt;
    group.watchdogRestarting = false;
    appendLog(config.paths.log, "Feishu WebSocket startup failed", {
      key: group.key,
      error: group.lastError,
    });
    updateFeishuRuntime(config, state, group);
  });
  return client;
}

function restartFeishuGroupClient(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  seenMessages: Map<string, number>;
  reason: string;
}): void {
  const { config, state, activeRunCancels, group, clients, seenMessages, reason } = input;
  if (!group.refs.length || group.watchdogRestarting) return;
  group.watchdogRestarting = true;
  group.reconnects += 1;
  group.lastError = reason;
  group.lastWatchdogRestartAt = new Date().toISOString();
  group.lastWatchdogRestartReason = reason;
  if (reason.startsWith("watchdog_connected_idle_")) {
    group.suppressZeroInboundRenewal = true;
    group.lifecycleReceivedMessages = 0;
    group.lifecycleLastReceivedAt = null;
  }
  const currentClient = group.client;
  if (currentClient) {
    const index = clients.indexOf(currentClient);
    if (index >= 0) clients.splice(index, 1);
  }
  appendLog(config.paths.log, "Feishu WebSocket watchdog restarting client", {
    key: group.key,
    reason,
  });
  try {
    group.client?.close({ force: true });
  } catch (error) {
    appendLog(config.paths.log, "Feishu WebSocket watchdog close failed", {
      key: group.key,
      error: shortMessage(error),
    });
  }
  startFeishuClientForGroup({
    config,
    state,
    activeRunCancels,
    group,
    clients,
    seenMessages,
  });
}

function startFeishuWatchdog(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  groups: ChannelDaemonFeishuGroup[];
  clients: WSClient[];
  seenMessages: Map<string, number>;
}): NodeJS.Timeout {
  const { config, state, activeRunCancels, groups, clients, seenMessages } = input;
  const timer = setInterval(() => {
    const nowMs = Date.now();
    for (const group of groups) {
      if (!group.refs.length || !group.client) continue;
      const status = group.client.getConnectionStatus();
      if (status?.state === "connected") {
        const zeroInboundRenewAfterMs = feishuZeroInboundRenewMs(group);
        const zeroInboundRenewMax = feishuZeroInboundRenewMax(group);
        const connectedAtMs = group.lastConnectedAt ? new Date(group.lastConnectedAt).getTime() : NaN;
        const connectedForMs = Number.isFinite(connectedAtMs) ? nowMs - connectedAtMs : 0;
        if (
          zeroInboundRenewAfterMs > 0
          && zeroInboundRenewMax > 0
          && !group.suppressZeroInboundRenewal
          && group.lifecycleReceivedMessages === 0
          && !group.lifecycleLastReceivedAt
          && group.zeroInboundRenewals < zeroInboundRenewMax
          && Number.isFinite(connectedAtMs)
          && connectedForMs >= zeroInboundRenewAfterMs
        ) {
          group.zeroInboundRenewals += 1;
          restartFeishuGroupClient({
            config,
            state,
            activeRunCancels,
            group,
            clients,
            seenMessages,
            reason: `watchdog_zero_inbound_${connectedForMs}`,
          });
          appendLog(config.paths.log, "Feishu WebSocket zero-inbound startup renewal threshold elapsed", {
            key: group.key,
            connectedForMs,
            zeroInboundRenewAfterMs,
            zeroInboundRenewals: group.zeroInboundRenewals,
            zeroInboundRenewMax,
            lastConnectedAt: group.lastConnectedAt,
          });
          continue;
        }
        const renewAfterMs = feishuConnectedIdleRenewMs(group);
        const lastActivityAt = latestFeishuLifecycleActivityAt(group);
        const idleForMs = lastActivityAt ? nowMs - new Date(lastActivityAt).getTime() : 0;
        if (
          renewAfterMs > 0
          && group.lifecycleReceivedMessages > 0
          && lastActivityAt
          && idleForMs >= renewAfterMs
        ) {
          restartFeishuGroupClient({
            config,
            state,
            activeRunCancels,
            group,
            clients,
            seenMessages,
            reason: `watchdog_connected_idle_${idleForMs}`,
          });
          appendLog(config.paths.log, "Feishu WebSocket connected-idle renewal threshold elapsed", {
            key: group.key,
            idleForMs,
            renewAfterMs,
            lastActivityAt,
            lastConnectedAt: group.lastConnectedAt,
            lastReceivedAt: group.lastReceivedAt,
            receivedMessages: group.receivedMessages,
          });
          continue;
        }
        group.lastUnhealthyAt = null;
        group.watchdogRestarting = false;
        state.feishuConnections[group.key] = feishuConnectionState(group);
        continue;
      }
      const unhealthyAt = group.lastUnhealthyAt || new Date().toISOString();
      group.lastUnhealthyAt = unhealthyAt;
      state.feishuConnections[group.key] = feishuConnectionState(group);
      const unhealthyForMs = nowMs - new Date(unhealthyAt).getTime();
      const restartAfterMs = feishuWatchdogRestartMs(group);
      if (unhealthyForMs >= restartAfterMs) {
        restartFeishuGroupClient({
          config,
          state,
          activeRunCancels,
          group,
          clients,
          seenMessages,
          reason: `watchdog_non_connected_${status?.state || "unknown"}`,
        });
        appendLog(config.paths.log, "Feishu WebSocket watchdog threshold elapsed", {
          key: group.key,
          state: status?.state || "unknown",
          unhealthyForMs,
          restartAfterMs,
        });
      }
    }
    writeRuntime(config, state);
  }, 5_000);
  timer.unref();
  return timer;
}

async function startFeishuConnections(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry,
  clients: WSClient[],
  seenMessages: Map<string, number>,
): Promise<NodeJS.Timeout | null> {
  const groups = createFeishuGroups(config);
  for (const group of groups) {
    if (!group.refs.length) {
      state.feishuConnections[group.key] = feishuConnectionState(group);
      writeRuntime(config, state);
      continue;
    }
    startFeishuClientForGroup({
      config,
      state,
      activeRunCancels,
      group,
      clients,
      seenMessages,
    });
  }
  return groups.some((group) => group.refs.length)
    ? startFeishuWatchdog({ config, state, activeRunCancels, groups, clients, seenMessages })
    : null;
}

async function main(): Promise<void> {
  const configPath = configPathFromArgv(process.argv.slice(2));
  const config = readConfig(configPath);
  ensureDir(config.paths.root);
  ensureDir(config.paths.state);
  const state = createDaemonState(config);
  writeRuntime(config, state);
  appendLog(config.paths.log, "Studio native Channel Connectors daemon started");
  const server = startHttp(config, state);
  const sockets: OctoWukongSocket[] = [];
  const octoRestHeartbeatTimers: NodeJS.Timeout[] = [];
  const feishuClients: WSClient[] = [];
  const activeRunCancels: ChannelDaemonActiveRunCancelRegistry = new Map();
  const seenMessages = loadFeishuSeenMessages(config);
  let feishuWatchdog: NodeJS.Timeout | null = null;

  void startOctoConnections(config, state, activeRunCancels, sockets, octoRestHeartbeatTimers, seenMessages).catch((error) => {
    appendLog(config.paths.log, "Octo connection startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  void startFeishuConnections(config, state, activeRunCancels, feishuClients, seenMessages)
    .then((timer) => {
      feishuWatchdog = timer;
    })
    .catch((error) => {
      appendLog(config.paths.log, "Feishu connection startup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

  const stop = () => {
    appendLog(config.paths.log, "Studio native Channel Connectors daemon stopping");
    if (feishuWatchdog) clearInterval(feishuWatchdog);
    for (const entry of activeRunCancels.values()) entry.controller.abort();
    for (const timer of octoRestHeartbeatTimers) clearInterval(timer);
    for (const socket of sockets) socket.disconnect();
    for (const client of feishuClients) client.close({ force: true });
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
