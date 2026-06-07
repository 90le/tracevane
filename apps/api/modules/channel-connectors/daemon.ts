import fs from "node:fs";
import http from "node:http";
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
  ChannelConnectorOctoTransportConfig,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorPlatformBinding,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import {
  runChannelConnectorAgentTurn,
  type ChannelConnectorAgentProgressEvent,
  type ChannelConnectorAgentTurnResult,
  type ChannelConnectorRuntimeBinding,
  type ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import {
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
  upsertChannelConnectorAgentSession,
  type ChannelConnectorAgentSessionRecord,
} from "./agent-session-store.js";
import {
  handleChannelConnectorCommand,
  listChannelConnectorGatewayModels,
  resolveChannelConnectorEffectiveProject,
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
  sendFeishuTextMessage,
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
} from "./octo-transport.js";
import {
  deriveOctoWsUrl,
  OctoWukongSocket,
  type OctoWukongLogger,
  type OctoWukongSocketStatus,
} from "./octo-wukong.js";

const DEFAULT_FEISHU_PING_TIMEOUT_SECONDS = 0;
const MIN_FEISHU_PING_TIMEOUT_SECONDS = 0;
const MAX_FEISHU_PING_TIMEOUT_SECONDS = 300;
const DEFAULT_FEISHU_WATCHDOG_RESTART_MS = 180_000;
const MIN_FEISHU_WATCHDOG_RESTART_MS = 60_000;
const MAX_FEISHU_WATCHDOG_RESTART_MS = 600_000;
const DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS = 15 * 60_000;
const MIN_FEISHU_CONNECTED_IDLE_RENEW_MS = 60_000;
const MAX_FEISHU_CONNECTED_IDLE_RENEW_MS = 3_600_000;
const DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS = 90_000;
const MIN_FEISHU_ZERO_INBOUND_RENEW_MS = 30_000;
const MAX_FEISHU_ZERO_INBOUND_RENEW_MS = 15 * 60_000;
const DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX = 3;
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
  }>;
}

type FeishuProgressCardEntryKind = "info" | "thinking" | "tool_use" | "tool_result" | "error";

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
    activeRuns: [],
    agentRuns: [],
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
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ok: true,
        implementation: "studio-native",
        pid: process.pid,
        projects: config.projects.length,
        platformBindings: config.projects.reduce((sum, project) => sum + project.platformBindings.length, 0),
        octoConnections: Object.values(state.octoConnections),
        feishuConnections: Object.values(state.feishuConnections),
        activeRuns: state.activeRuns,
        agentRuns: state.agentRuns,
      }));
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
  const lines = [
    `${input.icon} Studio Progress · ${input.title}`,
    input.meta ? `状态: ${input.meta}` : "",
    input.body ? "---" : "",
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

function renderOctoFinalReplyText(input: {
  agent: string;
  model: string | null;
  replyText: string;
}): string {
  const model = normalizeString(input.model) || "default";
  return [
    `${progressKindIcon("completed")} Studio Reply · ${input.agent} / ${model}`,
    "---",
    String(input.replyText || "").trim(),
  ].filter(Boolean).join("\n");
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

function latestFeishuActivityAt(group: ChannelDaemonFeishuGroup): string | null {
  const candidates = [group.lastReceivedAt, group.lastConnectedAt]
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
  if (["new", "reset", "show", "passthrough"].includes(action)) return false;
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
  return shouldSendFeishuProgressEvent(control, event, defaults);
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
): void {
  cardState.status = "failed";
  const text = shortMessage(error || "Agent 运行失败", 520);
  if (!text || cardState.latestError === text) return;
  const fingerprint = `error:final:${text}`;
  if (cardState.seenFingerprints.has(fingerprint)) return;
  cardState.latestError = text;
  cardState.seenFingerprints.add(fingerprint);
  cardState.entries.push({
    kind: "error",
    title: "失败",
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
      title: `工具调用 ${parsed.toolName}`,
      meta: status || undefined,
      body: formatProgressToolInput(parsed.toolName, parsed.command || entry.text),
    });
  }
  if (entry.kind === "tool_result") {
    const parsed = parseProgressToolText(entry);
    const failed = progressStatusFailed(parsed.status) || (parsed.exitCode !== null && parsed.exitCode !== "0");
    const meta = [
      failed ? "失败" : progressStatusLabel(parsed.status) || "完成",
      parsed.exitCode !== null ? `exit ${parsed.exitCode}` : "",
      parsed.status ? `status ${parsed.status}` : "",
    ].filter(Boolean).join(" · ");
    return renderPlainProgressMessage({
      icon: progressResultIcon({ status: parsed.status, exitCode: parsed.exitCode }),
      title: `工具结果 ${parsed.toolName}`,
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
  const text = String(value || "").trim();
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, url: string) => {
    const target = normalizeString(url);
    if (/^(https?:\/\/|mailto:|#|\/)/i.test(target)) return match;
    return `${label} (${target})`;
  });
}

function renderFeishuFinalReplyCard(input: {
  project: ChannelConnectorRuntimeProject;
  replyText: string;
  sessionKey: string;
  status: "ok" | "failed";
}): ChannelConnectorFeishuInteractiveCard {
  const ok = input.status === "ok";
  const model = input.project.model || "default";
  const content = sanitizeFeishuCardMarkdown(input.replyText);
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: `${ok ? progressKindIcon("completed") : progressKindIcon("failed")} Studio ${input.project.agent} · 最终回复`,
      },
      template: ok ? "green" : "red",
    },
    elements: [
      {
        tag: "markdown",
        content,
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `model ${model} · session ${shortMessage(input.sessionKey, 80)}`,
          },
        ],
      },
    ],
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
      cardError: cardResult.error,
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
  const action = input.command.action;
  const title = action === "status" ? "当前状态"
    : action === "show" ? "缓存内容"
      : action === "set" ? "设置已应用"
        : action === "new" ? "新会话已开启"
          : action === "reset" ? "会话已重置"
            : action === "list" ? "可选项"
              : action === "passthrough" ? "已发送给 Agent"
                : "执行结果";
  return {
    title,
    text,
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
    return {
      type: "info",
      content: "菜单已更新",
    };
  }
  const command = normalizeString(input.command.command);
  if (input.command.ok === false) {
    return {
      type: "warning",
      content: "命令执行失败，结果已显示在卡片中",
    };
  }
  return {
    type: "info",
    content: command ? `已执行 ${command}` : "命令已执行",
  };
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
  if (eventId) return `feishu:event:${eventId}:${binding.id}`;
  if (parsed.kind === "message") return `feishu:message:${messageId}:${binding.id}`;
  return null;
}

async function dispatchOctoMessage(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  robotId: string | null;
  message: ChannelConnectorOctoInboundMessage;
  seenMessages: Map<string, number>;
}): Promise<void> {
  const { config, state, project, binding, robotId, message, seenMessages } = input;
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
    const highPriority = event.type === "failed" || event.type === "error";
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
    agent = await runChannelConnectorAgentTurn({
      project: turnProject,
      binding,
      message: agentMessage,
      sessionKey,
      gatewayEndpoint: turnProject.gatewayEndpoint || config.gateway.endpoint,
      gatewayClientKey: key,
      agentRuntimeDir: runtimeDir,
      historyContext,
      modelCapabilities: modelResolution.modelCapabilities,
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
    state.activeRuns = state.activeRuns.filter((run) => run.id !== activeRunId);
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
    text: agent.replyText || agent.error || "",
    status: agent.status,
  });
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      codexThreadId: agent.session.codexThreadId || currentSession?.codexThreadId || null,
      messageId: message.messageId,
      status: agent.status,
    });
  }
  const agentFinishedAt = new Date().toISOString();
  const agentFinishedAtMs = isoTimestampMs(agentFinishedAt) ?? Date.now();
  const agentLatestProgressAtMs = latestProgress ? isoTimestampMs(latestProgress.checkedAt) : null;
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
  });
  state.agentRuns = state.agentRuns.slice(0, 20);

  let replySent = false;
  let replyBuffered = false;
  let replyBufferId: string | null = null;
  let replyOriginalRunes: number | null = null;
  let replyPreviewRunes: number | null = null;
  let replyRequestCount: number | null = null;
  if (transport && agent.ok === true && agent.replyText) {
    const preparedReply = prepareChannelConnectorGroupBufferedReply({
      filePath: replyBufferPath(config),
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      platform: "octo",
      replyText: agent.replyText,
      isGroup: isOctoGroupChannel(message.channelType),
    });
    replyBuffered = preparedReply.buffered;
    replyBufferId = preparedReply.bufferId;
    replyOriginalRunes = preparedReply.originalRunes;
    replyPreviewRunes = preparedReply.previewRunes;
    const replyPlan = renderOctoTextReply(message, renderOctoFinalReplyText({
      agent: agent.agent,
      model: agent.model,
      replyText: preparedReply.replyText,
    }));
    if (replyPlan) {
      const result = await sendOctoTextReply(transport, replyPlan);
      replySent = result.ok === true;
      replyRequestCount = result.requestCount;
    }
  }
  if (transport && agent.ok === false) {
    const replyPlan = renderOctoTextReply(message, renderAgentFailureReply(agent.error));
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
  group: ChannelDaemonFeishuGroup;
  parsed: ChannelConnectorFeishuParsedWebhook;
  rawEvent: unknown;
  seenMessages: Map<string, number>;
}): Promise<Record<string, unknown> | null> {
  const { config, state, group, parsed, rawEvent, seenMessages } = input;
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
    agent = await runChannelConnectorAgentTurn({
      project: turnProject,
      binding,
      message: agentMessage,
      sessionKey,
      gatewayEndpoint: turnProject.gatewayEndpoint || config.gateway.endpoint,
      gatewayClientKey: key,
      agentRuntimeDir: runtimeDir,
      historyContext,
      modelCapabilities: modelResolution.modelCapabilities,
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
    state.activeRuns = state.activeRuns.filter((run) => run.id !== activeRunId);
    writeRuntime(config, state);
  }
  if (agent.progress.eventCount > progressEventCount) {
    progressEventCount = agent.progress.eventCount;
    latestProgress = agent.progress.latest;
  }
  if (channelConnectorStreamMessagesEnabled(control, progressDefaults) && (progressCardState.messageId || progressCardState.entries.length > 0)) {
    if (agent.ok === false) {
      ensureFeishuProgressCardFailure(progressCardState, agent.error);
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
    text: agent.replyText || agent.error || "",
    status: agent.status,
  });
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      codexThreadId: agent.session.codexThreadId || currentSession?.codexThreadId || null,
      messageId,
      status: agent.status,
    });
  }
  const agentFinishedAt = new Date().toISOString();
  const agentFinishedAtMs = isoTimestampMs(agentFinishedAt) ?? Date.now();
  const agentLatestProgressAtMs = latestProgress ? isoTimestampMs(latestProgress.checkedAt) : null;
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
  const replyContent = agent.ok === true && agent.replyText
    ? agent.replyText
    : agent.ok === false && !progressCardState.messageId
      ? renderAgentFailureReply(agent.error)
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
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  sockets: OctoWukongSocket[];
  restHeartbeatTimers: NodeJS.Timeout[];
  seenMessages: Map<string, number>;
}): Promise<void> {
  const { config, state, project, binding, sockets, restHeartbeatTimers, seenMessages } = input;
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
  group: ChannelDaemonFeishuGroup;
  seenMessages: Map<string, number>;
}): EventDispatcher {
  const { config, state, group, seenMessages } = input;
  const dispatcher = new EventDispatcher({
    logger: feishuLogger(config),
    loggerLevel: LoggerLevel.info,
  });
  dispatcher.register({
    "im.message.receive_v1": async (data: unknown) => {
      const receivedAt = new Date().toISOString();
      group.receivedMessages += 1;
      group.lastReceivedAt = receivedAt;
      group.zeroInboundRenewals = 0;
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
        group,
        parsed,
        rawEvent: data,
        seenMessages,
      });
    },
    "card.action.trigger": async (data: unknown) => {
      group.lastReceivedAt = new Date().toISOString();
      group.receivedMessages += 1;
      group.zeroInboundRenewals = 0;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "card.action.trigger", data));
      updateFeishuRuntime(config, state, group);
      const response = await dispatchFeishuParsedEvent({
        config,
        state,
        group,
        parsed,
        rawEvent: data,
        seenMessages,
      });
      return response || undefined;
    },
    "application.bot.menu_v6": async (data: unknown) => {
      group.lastReceivedAt = new Date().toISOString();
      group.receivedMessages += 1;
      group.zeroInboundRenewals = 0;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "application.bot.menu_v6", data));
      updateFeishuRuntime(config, state, group);
      dispatchFeishuParsedEventInBackground({
        config,
        state,
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
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  seenMessages: Map<string, number>;
}): WSClient {
  const { config, state, group, clients, seenMessages } = input;
  const dispatcher = createFeishuDispatcher({
    config,
    state,
    group,
    seenMessages,
  });
  const client = new WSClient({
    appId: group.appId,
    appSecret: group.refs[0].transport.appSecret,
    domain: metadataString(group.refs[0].binding, ["domain", "apiUrl", "api_url", "baseUrl", "base_url"]) || undefined,
    logger: feishuLogger(config),
    loggerLevel: LoggerLevel.info,
    autoReconnect: true,
    handshakeTimeoutMs: 20_000,
    wsConfig: {
      pingTimeout: feishuPingTimeoutSeconds(group),
    },
    source: "openclaw-studio-channel-daemon",
    onReady: () => {
      group.lastConnectedAt = new Date().toISOString();
      group.lastDisconnectedAt = null;
      group.lastUnhealthyAt = null;
      group.lastError = null;
      group.watchdogRestarting = false;
      appendLog(config.paths.log, "Feishu WebSocket connected", {
        key: group.key,
        bindingIds: group.refs.map((ref) => ref.binding.id),
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
      updateFeishuRuntime(config, state, group);
    },
    onReconnected: () => {
      group.lastConnectedAt = new Date().toISOString();
      group.lastDisconnectedAt = null;
      group.lastUnhealthyAt = null;
      group.lastError = null;
      group.watchdogRestarting = false;
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
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  seenMessages: Map<string, number>;
  reason: string;
}): void {
  const { config, state, group, clients, seenMessages, reason } = input;
  if (!group.refs.length || group.watchdogRestarting) return;
  group.watchdogRestarting = true;
  group.reconnects += 1;
  group.lastError = reason;
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
    group,
    clients,
    seenMessages,
  });
}

function startFeishuWatchdog(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  groups: ChannelDaemonFeishuGroup[];
  clients: WSClient[];
  seenMessages: Map<string, number>;
}): NodeJS.Timeout {
  const { config, state, groups, clients, seenMessages } = input;
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
          && group.receivedMessages === 0
          && !group.lastReceivedAt
          && group.zeroInboundRenewals < zeroInboundRenewMax
          && Number.isFinite(connectedAtMs)
          && connectedForMs >= zeroInboundRenewAfterMs
        ) {
          group.zeroInboundRenewals += 1;
          restartFeishuGroupClient({
            config,
            state,
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
        const lastActivityAt = latestFeishuActivityAt(group);
        const idleForMs = lastActivityAt ? nowMs - new Date(lastActivityAt).getTime() : 0;
        if (renewAfterMs > 0 && lastActivityAt && idleForMs >= renewAfterMs) {
          restartFeishuGroupClient({
            config,
            state,
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
      group,
      clients,
      seenMessages,
    });
  }
  return groups.some((group) => group.refs.length)
    ? startFeishuWatchdog({ config, state, groups, clients, seenMessages })
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
  const seenMessages = loadFeishuSeenMessages(config);
  let feishuWatchdog: NodeJS.Timeout | null = null;

  void startOctoConnections(config, state, sockets, octoRestHeartbeatTimers, seenMessages).catch((error) => {
    appendLog(config.paths.log, "Octo connection startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  void startFeishuConnections(config, state, feishuClients, seenMessages)
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
