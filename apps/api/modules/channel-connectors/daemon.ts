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
  ChannelConnectorContextBudgetSummary,
  ChannelConnectorOctoGroupMember,
  ChannelConnectorOctoTransportConfig,
  ChannelConnectorOctoTransportResult,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorPlatformBinding,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import {
  buildChannelConnectorAgentProcessRequest,
  isChannelConnectorProcessProgressEvent,
  runChannelConnectorAgentTurn,
  type ChannelConnectorAgentPermissionDecision,
  type ChannelConnectorAgentPermissionRequest,
  type ChannelConnectorAgentProgressEvent,
  type ChannelConnectorAgentTurnResult,
  type ChannelConnectorRuntimeBinding,
  type ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import {
  channelConnectorAgentSessionDriverPoolKey,
  createChannelConnectorAgentSessionDriverPool,
  resolveChannelConnectorAgentSessionDriverMode,
  type ChannelConnectorAgentSessionDriverEvent,
  type ChannelConnectorAgentSessionDriverMode,
  type ChannelConnectorAgentSessionDriverStatus,
} from "./agent-session-driver.js";
import {
  createCodexAppServerSessionDriverFactory,
  JsonLineCodexAppServerTransport,
} from "./codex-app-server-driver.js";
import { createNativeCliSessionDriverFactory } from "./cli-agent-session-driver.js";
import {
  deleteChannelConnectorAgentSession,
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
  upsertChannelConnectorAgentSession,
  type ChannelConnectorAgentSessionRecord,
} from "./agent-session-store.js";
import {
  handleChannelConnectorCommand,
  formatChannelConnectorOctoManagementReply,
  listChannelConnectorGatewayModelCatalog,
  listChannelConnectorCommandSummaries,
  listChannelConnectorGatewayModels,
  listChannelConnectorSkillSummaries,
  resolveChannelConnectorBindingCommandAlias,
  resolveChannelConnectorEffectiveProject,
  type ChannelConnectorCommandAudit,
  type ChannelConnectorCommandProgressAck,
  type ChannelConnectorCommandProgressEvent,
  type ChannelConnectorGatewayModel,
  type ChannelConnectorOctoManagementRequest,
  type ChannelConnectorOctoManagementResult,
  type ChannelConnectorPermissionResponseAction,
  type ChannelConnectorPermissionResponseResult,
  type ChannelConnectorUsageSummary,
} from "./command-router.js";
import {
  buildChannelConnectorSkillContext,
} from "./skill-registry.js";
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
  compactChannelConnectorConversation as compactChannelConnectorConversationCore,
} from "./conversation-compact.js";
import {
  resolveChannelConnectorContextBudget,
} from "./context-budget.js";
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
  renderOctoOutboundText,
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
  getOctoFileDownloadUrl,
  addOctoGroupMembers,
  createOctoGroup,
  createOctoThread,
  deleteOctoThread,
  deleteOctoVoiceContext,
  getOctoGroupInfo,
  getOctoThreadInfo,
  joinOctoThread,
  leaveOctoThread,
  listOctoGroupMembers,
  listOctoGroups,
  listOctoThreadMembers,
  listOctoThreads,
  octoTransportFromMetadata,
  readOctoGroupMd,
  readOctoThreadMd,
  readOctoVoiceContext,
  registerOctoBot,
  removeOctoGroupMembers,
  searchOctoSpaceMembers,
  sendOctoHeartbeat,
  sendOctoReadReceipt,
  sendOctoTextReply,
  sendOctoTyping,
  syncOctoMessages,
  updateOctoGroupMd,
  updateOctoGroupInfo,
  updateOctoThreadMd,
  updateOctoVoiceContext,
  uploadAndSendOctoMedia,
} from "./octo-transport.js";
import {
  DEFAULT_CHANNEL_CONNECTOR_OUTBOUND_FILE_MAX_BYTES,
  extractChannelConnectorOutboundFiles,
  resolveChannelConnectorOutboundFiles,
  type ChannelConnectorResolvedOutboundFile,
} from "./outbound-files.js";
import {
  extractChannelConnectorOutboundMessages,
  resolveFeishuOutboundMessageTarget,
  resolveOctoOutboundMessageTarget,
  type ChannelConnectorOutboundMessageRequest,
} from "./outbound-messages.js";
import {
  splitChannelConnectorTextChunks,
} from "./text-chunks.js";
import {
  deriveOctoWsUrl,
  OctoWukongSocket,
  type OctoWukongLogger,
  type OctoWukongSocketStatus,
} from "./octo-wukong.js";

const DEFAULT_FEISHU_PING_TIMEOUT_SECONDS = 3;
const MIN_FEISHU_PING_TIMEOUT_SECONDS = 1;
const MAX_FEISHU_PING_TIMEOUT_SECONDS = 60;
const DEFAULT_FEISHU_PING_INTERVAL_MS = 10_000;
const MIN_FEISHU_PING_INTERVAL_MS = 10_000;
const MAX_FEISHU_PING_INTERVAL_MS = 120_000;
const DEFAULT_FEISHU_HANDSHAKE_TIMEOUT_MS = 15_000;
const DEFAULT_FEISHU_PONG_TIMEOUT_MS = 8_000;
const MIN_FEISHU_PONG_TIMEOUT_MS = 3_000;
const MAX_FEISHU_PONG_TIMEOUT_MS = 600_000;
const DEFAULT_FEISHU_TRANSPORT_STALE_MARGIN_MS = 5_000;
const MIN_FEISHU_TRANSPORT_STALE_MS = 20_000;
const MAX_FEISHU_TRANSPORT_STALE_MS = 600_000;
const DEFAULT_FEISHU_WATCHDOG_RESTART_MS = 0;
const MIN_FEISHU_WATCHDOG_RESTART_MS = 60_000;
const MAX_FEISHU_WATCHDOG_RESTART_MS = 600_000;
const FEISHU_WS_RECONNECT_INITIAL_DELAY_MS = 1_000;
const FEISHU_WS_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_FEISHU_RECONNECTING_RECYCLE_MS = 5_000;
const MIN_FEISHU_RECONNECTING_RECYCLE_MS = 5_000;
const MAX_FEISHU_RECONNECTING_RECYCLE_MS = 60_000;
const FEISHU_WS_RECONNECT_EXHAUSTED_RE = /^WebSocket reconnect exhausted after \d+ attempts?/;
const FEISHU_WS_AUTORECONNECT_DISABLED_ERROR = "WebSocket connect failed and autoReconnect is disabled";
// Feishu long connection delivery is cluster-mode rather than broadcast. CC Go
// avoids random delivery loss by using one app_id owner and fan-out; Studio also
// keeps one OS-user owner. OpenClaw's current TypeScript Feishu plugin recreates
// a fresh SDK WSClient after terminal SDK errors and backs off 1s..30s. Studio
// copies that lifecycle shape. OpenClaw historically passes an upper-case
// FEISHU_WS_CONFIG shape that the installed Lark SDK does not treat as the
// client-side lower-case `pingTimeout` watchdog. Real Studio and upstream issue
// evidence showed that this leaves half-open sockets falsely connected until
// manual restart. Studio therefore arms the SDK lower-case watchdog, clamps the
// SDK's internal ping interval to a 10s Agent-facing default, and keeps a short
// outer ping/control-frame fallback for runtime visibility and recovery.
// If the SDK has already entered `reconnecting` and stays there for too long,
// Studio still recycles that same current client through the OpenClaw-style
// outer loop. A connected socket is not enough for Feishu: long-connection
// delivery is cluster-mode, so Studio records real event frames separately from
// transport health. Lack of business events during idle time must not rebuild a
// healthy ping/pong connection.
const DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS = 0;
const MIN_FEISHU_CONNECTED_IDLE_RENEW_MS = 60_000;
const MAX_FEISHU_CONNECTED_IDLE_RENEW_MS = 3_600_000;
const DEFAULT_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS = 0;
const MIN_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS = 120_000;
const MAX_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS = 3_600_000;
const DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS = 0;
const MIN_FEISHU_ZERO_INBOUND_RENEW_MS = 60_000;
const MAX_FEISHU_ZERO_INBOUND_RENEW_MS = 15 * 60_000;
const DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX = 0;
const MAX_FEISHU_ZERO_INBOUND_RENEW_MAX = 10;
const DEFAULT_FEISHU_INGRESS_UNVERIFIED_AFTER_MS = 0;
const MIN_FEISHU_INGRESS_UNVERIFIED_AFTER_MS = 15_000;
const MAX_FEISHU_INGRESS_UNVERIFIED_AFTER_MS = 3_600_000;
const DEFAULT_FEISHU_INGRESS_UNVERIFIED_RENEW_MAX = 0;
const MAX_FEISHU_INGRESS_UNVERIFIED_RENEW_MAX = 5;
const DEFAULT_FEISHU_LOCK_RETRY_MS = 30_000;
const MIN_FEISHU_LOCK_RETRY_MS = 5_000;
const MAX_FEISHU_LOCK_RETRY_MS = 300_000;
const DEFAULT_FEISHU_STALE_EVENT_MAX_AGE_MS = 2 * 60_000;
const MIN_FEISHU_STALE_EVENT_MAX_AGE_MS = 10_000;
const MAX_FEISHU_STALE_EVENT_MAX_AGE_MS = 24 * 60 * 60_000;
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
const OCTO_PROGRESS_REPLY_TIMEOUT_MS = 5_000;
const DEFAULT_CHANNEL_AUTO_COMPACT_COOLDOWN_MS = 15 * 60_000;
const MAX_CHANNEL_AUTO_COMPACT_COOLDOWN_MS = 24 * 60 * 60_000;
const FEISHU_FINAL_REPLY_CARD_MAX_RUNES = 12_000;
const DEFAULT_CHANNEL_AGENT_SESSION_REAP_INTERVAL_MS = 60_000;
const MAX_CHANNEL_AGENT_SESSION_DRIVER_EVENTS = 80;

const channelAgentSessionDriverEvents: ChannelConnectorAgentSessionDriverEvent[] = [];

const channelAgentSessionDriverPool = createChannelConnectorAgentSessionDriverPool({
  idleTimeoutMs: optionalPositiveIntegerEnv("STUDIO_CHANNEL_AGENT_SESSION_IDLE_TIMEOUT_MS"),
  maxSessions: optionalPositiveIntegerEnv("STUDIO_CHANNEL_AGENT_SESSION_MAX_SESSIONS"),
  onEvent: recordChannelAgentSessionDriverEvent,
  factory: createNativeCliSessionDriverFactory({
    codexFactory: createCodexAppServerSessionDriverFactory({
      transportFactory: ({ sessionId, key, agentTurnRequest }) => {
        const processRequest = agentTurnRequest
          ? buildChannelConnectorAgentProcessRequest(agentTurnRequest)
          : null;
        const env = processRequest?.env ? { ...processRequest.env } : {};
        const codexHome = normalizeString(env.CODEX_HOME);
        if (codexHome) {
          const sessionCodexHome = path.join(path.dirname(codexHome), "persistent-sessions", safePathSegment(sessionId), "codex-home");
          fs.mkdirSync(sessionCodexHome, { recursive: true, mode: 0o700 });
          const sourceConfigPath = path.join(codexHome, "config.toml");
          if (fs.existsSync(sourceConfigPath)) {
            fs.copyFileSync(sourceConfigPath, path.join(sessionCodexHome, "config.toml"));
          }
          env.CODEX_HOME = sessionCodexHome;
        }
        return new JsonLineCodexAppServerTransport({
          cwd: key.workDir,
          env,
        });
      },
    }),
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
  state: WSConnectionStatus["state"] | "closed" | "lock-held";
  lastError: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastReceivedAt: string | null;
  lastUnhealthyAt: string | null;
  ingressVerified: boolean;
  ingressState: "receiving" | "warming" | "silent" | "stale" | "disconnected" | "lock-held" | "closed";
  ingressSilentForMs: number;
  transportVerified: boolean;
  pongWaitingForMs: number;
  pongOverdue: boolean;
  ingressUnverifiedAfterMs: number;
  ingressUnverifiedRenewMax: number;
  ingressUnverifiedRenewals: number;
  ingressUnverifiedRenewDelayMs: number;
  lastIngressUnverifiedRenewAt: string | null;
  verifiedIngressSilentRenewAfterMs: number;
  verifiedIngressSilentRenewals: number;
  lastVerifiedIngressSilentRenewAt: string | null;
  dispatcherVerificationConfigured: boolean;
  dispatcherEncryptConfigured: boolean;
  dispatcherCallbacks: number;
  lastDispatcherCallbackAt: string | null;
  lastDispatcherEventType: string | null;
  lifecycleDispatcherCallbacks: number;
  lifecycleLastDispatcherCallbackAt: string | null;
  rawEventFrames: number;
  lifecycleRawEventFrames: number;
  lastRawEventFrameAt: string | null;
  lastRawEventFrameType: string | null;
  rawEventHandlerErrors: number;
  lastRawEventHandlerError: string | null;
  lockAcquired: boolean;
  lockOwnerPid: number | null;
  lockPath: string | null;
  sdkConnected: boolean;
  pingTimeoutSeconds: number;
  pongTimeoutMs: number;
  pingIntervalMs: number;
  transportStaleForMs: number;
  transportStaleAfterMs: number;
  transportStale: boolean;
  sentPings: number;
  lastPingAt: string | null;
  receivedPongs: number;
  lastPongAt: string | null;
  controlFrames: number;
  lastControlFrameAt: string | null;
  lastControlFrameType: string | null;
  reconnectingRecycleAfterMs: number;
  connectedIdleRenewAfterMs: number;
  zeroInboundRenewAfterMs: number;
  zeroInboundRenewMax: number;
  zeroInboundRenewals: number;
  watchdogRestartAfterMs: number;
  lifecycleReceivedMessages: number;
  lifecycleLastReceivedAt: string | null;
  suppressZeroInboundRenewal: boolean;
  lastReconnectingAt: string | null;
  reconnectingRecycles: number;
  lastReconnectingRecycleAt: string | null;
  lastReconnectingRecycleReason: string | null;
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
  clientLoopActive: boolean;
  reconnects: number;
  receivedMessages: number;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastReceivedAt: string | null;
  lifecycleReceivedMessages: number;
  lifecycleLastReceivedAt: string | null;
  suppressZeroInboundRenewal: boolean;
  lastReconnectingAt: string | null;
  reconnectingRecycles: number;
  lastReconnectingRecycleAt: string | null;
  lastReconnectingRecycleReason: string | null;
  lastWatchdogRestartAt: string | null;
  lastWatchdogRestartReason: string | null;
  lastUnhealthyAt: string | null;
  lastError: string | null;
  watchdogRestarting: boolean;
  zeroInboundRenewals: number;
  ingressUnverifiedRenewals: number;
  lastIngressUnverifiedRenewAt: string | null;
  verifiedIngressSilentRenewals: number;
  lastVerifiedIngressSilentRenewAt: string | null;
  dispatcherCallbacks: number;
  lastDispatcherCallbackAt: string | null;
  lastDispatcherEventType: string | null;
  lifecycleDispatcherCallbacks: number;
  lifecycleLastDispatcherCallbackAt: string | null;
  rawEventFrames: number;
  lifecycleRawEventFrames: number;
  lastRawEventFrameAt: string | null;
  lastRawEventFrameType: string | null;
  rawEventHandlerErrors: number;
  lastRawEventHandlerError: string | null;
  pingIntervalMs: number;
  sentPings: number;
  lastPingAt: string | null;
  receivedPongs: number;
  lastPongAt: string | null;
  controlFrames: number;
  lastControlFrameAt: string | null;
  lastControlFrameType: string | null;
  lockAcquired: boolean;
  lockOwnerPid: number | null;
  lockPath: string | null;
  lastLockRetryAt: string | null;
  recycleCurrentClient: ((reason: string) => void) | null;
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
    agentNativeSessionId: string | null;
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
    agentNativeSessionId: string | null;
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
  autoCompacts: ChannelDaemonAutoCompactRecord[];
}

interface ChannelDaemonAutoCompactRecord {
  checkedAt: string;
  bindingId: string;
  sessionKey: string;
  projectId: string;
  agent: string;
  model: string | null;
  workDir: string;
  messageId: string;
  action: "native" | "fallback" | "skipped";
  ok: boolean | null;
  reason: "threshold-reached" | "cooldown" | "native-blocked" | "fallback-failed";
  usageSource: ChannelConnectorContextBudgetSummary["usageSource"];
  usedTokens: number | null;
  effectiveUsedTokens: number | null;
  contextWindow: number | null;
  autoCompactTokenLimit: number | null;
  remainingTokens: number | null;
  nativeAttempted: boolean;
  fallbackAttempted: boolean;
  beforeEntries: number | null;
  afterEntries: number | null;
  sessionsCleared: number | null;
  summaryPreview: string | null;
  error: string | null;
  cooldownStartedAt: string | null;
  cooldownUntil: string | null;
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
  reason: "default" | "codex-app-server-experimental" | "claude-code-stream-json" | "opencode-run-session" | "unsupported-agent";
}

interface ChannelDaemonAgentSessionDriverState {
  defaultMode: "one-shot";
  implementation: "native-cli-session-drivers";
  persistentDriverReady: true;
  policy: {
    idleTimeoutMs: number;
    maxSessions: number;
    fallbackOnCrash: boolean;
  };
  requestedPersistentBindings: ChannelDaemonAgentSessionDriverBindingState[];
  bindings: ChannelDaemonAgentSessionDriverBindingState[];
  activeSessions: ChannelConnectorAgentSessionDriverStatus[];
  recentEvents: ChannelConnectorAgentSessionDriverEvent[];
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

interface ChannelDaemonUserQuestionOption {
  label: string;
  description: string;
}

interface ChannelDaemonUserQuestion {
  question: string;
  header: string;
  options: ChannelDaemonUserQuestionOption[];
  multiSelect: boolean;
}

interface ChannelDaemonPendingPermissionEntry {
  id: string;
  runId: string;
  bindingId: string;
  sessionKey: string;
  messageId: string;
  agent: string;
  model: string | null;
  requestedAt: string;
  request: ChannelConnectorAgentPermissionRequest;
  resolve: (decision: ChannelConnectorAgentPermissionDecision) => void;
  timeout: NodeJS.Timeout;
  questions: ChannelDaemonUserQuestion[];
  answers: Map<number, string>;
  currentQuestion: number;
  suppressReplyOnResolve?: boolean;
  onStateChange?: (input: ChannelDaemonPendingPermissionStateChange) => Promise<void> | void;
}

type ChannelDaemonPendingPermissionRegistry = Map<string, ChannelDaemonPendingPermissionEntry>;

type ChannelDaemonPendingPermissionState =
  | "pending"
  | "allowed"
  | "allowed-all"
  | "denied"
  | "timed-out"
  | "replaced"
  | "ended"
  | "failed";

interface ChannelDaemonPendingPermissionStateChange {
  request: ChannelConnectorAgentPermissionRequest;
  status: ChannelDaemonPendingPermissionState;
  message?: string | null;
}

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

type FeishuProgressCardEntryKind = "info" | "assistant" | "thinking" | "tool_use" | "tool_result" | "permission" | "error";

const channelSessionAgentRunQueues: ChannelDaemonSessionRunQueueRegistry = new Map();
const channelPendingPermissions: ChannelDaemonPendingPermissionRegistry = new Map();
const channelPermissionApproveAllRunIds = new Set<string>();

interface FeishuProgressCardEntry {
  kind: FeishuProgressCardEntryKind;
  title: string;
  text: string;
  checkedAt: string;
  fingerprint: string;
  rawType: string | null;
  itemType: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  permission?: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    status: ChannelDaemonPendingPermissionState;
    message: string | null;
  };
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
  thinkingMessages: boolean;
  processMessages: boolean;
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

const jsonLineBuffers = new Map<string, { lines: string[]; timer: NodeJS.Timeout | null }>();
const JSON_LINE_FLUSH_INTERVAL_MS = 1000;
const JSON_LINE_FLUSH_MAX_LINES = 100;
const JSON_LINE_MAX_FILE_BYTES = 100 * 1024 * 1024;

function writeJsonLine(filePath: string, value: Record<string, unknown>): void {
  let buffer = jsonLineBuffers.get(filePath);
  if (!buffer) {
    buffer = { lines: [], timer: null };
    jsonLineBuffers.set(filePath, buffer);
  }
  buffer.lines.push(JSON.stringify(value));
  if (buffer.lines.length >= JSON_LINE_FLUSH_MAX_LINES) {
    flushJsonLineBuffer(filePath, buffer);
    return;
  }
  if (!buffer.timer) {
    buffer.timer = setTimeout(() => {
      buffer!.timer = null;
      flushJsonLineBuffer(filePath, buffer!);
    }, JSON_LINE_FLUSH_INTERVAL_MS);
    buffer.timer.unref();
  }
}

function flushJsonLineBuffer(filePath: string, buffer: { lines: string[]; timer: NodeJS.Timeout | null }): void {
  if (buffer.lines.length === 0) return;
  const content = buffer.lines.join("\n") + "\n";
  buffer.lines = [];
  ensureDir(path.dirname(filePath));
  fs.promises.appendFile(filePath, content, "utf8").catch(() => {});
  rotateJsonLineFile(filePath);
}

function rotateJsonLineFile(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < JSON_LINE_MAX_FILE_BYTES) return;
    const rotated = `${filePath}.${Date.now()}.rotated`;
    fs.renameSync(filePath, rotated);
  } catch {}
}

function commandAuditLogFields(audit: ChannelConnectorCommandAudit | null | undefined): Record<string, unknown> {
  if (!audit) return {};
  return {
    commandKind: audit.kind,
    commandSource: audit.source,
    commandName: audit.name,
    commandArgsCount: audit.argsCount,
    commandArgsPreview: audit.argsPreview,
    commandPreview: audit.commandPreview || null,
    commandExecWorkDir: audit.exec?.workDir || null,
    commandExecPreview: audit.exec?.commandPreview || null,
    commandExecExitCode: audit.exec?.exitCode ?? null,
    commandExecSignal: audit.exec?.signal || null,
    commandExecTimedOut: audit.exec?.timedOut ?? null,
    commandExecError: audit.exec?.error || null,
    commandExecElapsedMs: audit.exec?.elapsedMs ?? null,
    commandExecStdoutBytes: audit.exec?.stdoutBytes ?? null,
    commandExecStderrBytes: audit.exec?.stderrBytes ?? null,
    commandExecStdoutPreview: audit.exec?.stdoutPreview || null,
    commandExecStderrPreview: audit.exec?.stderrPreview || null,
  };
}

function commandProgressLogFields(event: ChannelConnectorCommandProgressEvent): Record<string, unknown> {
  return {
    commandProgressType: event.type,
    commandProgressName: event.commandName,
    commandProgressPreview: event.commandPreview,
    commandProgressWorkDir: event.workDir,
    commandProgressElapsedMs: event.elapsedMs,
    commandProgressOutputPreview: event.outputPreview,
    commandProgressStdoutPreview: event.stdoutPreview,
    commandProgressStderrPreview: event.stderrPreview,
    commandProgressExitCode: event.exitCode ?? null,
    commandProgressSignal: event.signal || null,
    commandProgressError: event.error || null,
  };
}

function commandProgressIsTerminal(event: ChannelConnectorCommandProgressEvent): boolean {
  return event.type === "completed" || event.type === "failed" || event.type === "timeout";
}

function commandProgressStatusLabel(type: ChannelConnectorCommandProgressEvent["type"]): string {
  if (type === "completed") return "完成";
  if (type === "failed") return "失败";
  if (type === "timeout") return "超时";
  if (type === "progress") return "运行中";
  return "已启动";
}

function commandProgressCardTemplate(type: ChannelConnectorCommandProgressEvent["type"]): string {
  if (type === "completed") return "green";
  if (type === "failed") return "red";
  if (type === "timeout") return "orange";
  return "blue";
}

function commandProgressOutputBlock(event: ChannelConnectorCommandProgressEvent, maxRunes = 2_000): string {
  const output = normalizeString(event.outputPreview) || normalizeString(event.stdoutPreview) || normalizeString(event.stderrPreview);
  return output ? shortMessage(output, maxRunes) : "暂无输出";
}

function formatCommandProgressText(event: ChannelConnectorCommandProgressEvent): string {
  const meta = [
    `状态=${commandProgressStatusLabel(event.type)}`,
    `耗时=${event.elapsedMs}ms`,
    event.exitCode === null || event.exitCode === undefined ? "" : `exit=${event.exitCode}`,
    event.signal ? `signal=${event.signal}` : "",
    event.error ? `error=${event.error}` : "",
  ].filter(Boolean).join(" · ");
  return renderPlainProgressMessage({
    icon: progressKindIcon(commandProgressIsTerminal(event) ? event.type === "completed" ? "completed" : "failed" : "running"),
    title: `Shell /${event.commandName}`,
    meta,
    body: [
      `cwd: ${event.workDir}`,
      `command: ${event.commandPreview}`,
      "```text",
      commandProgressOutputBlock(event),
      "```",
    ].join("\n"),
  });
}

function renderFeishuCommandProgressCard(event: ChannelConnectorCommandProgressEvent): ChannelConnectorFeishuInteractiveCard {
  const lines = [
    `**状态**：<text_tag color='${commandProgressCardTemplate(event.type)}'>${inlineProgressCode(commandProgressStatusLabel(event.type))}</text_tag>`,
    `**命令**：\`/${inlineProgressCode(event.commandName)}\``,
    `**耗时**：${event.elapsedMs}ms`,
    `**目录**：${inlineProgressCode(event.workDir)}`,
    event.exitCode === null || event.exitCode === undefined ? "" : `**Exit**：${inlineProgressCode(String(event.exitCode))}`,
    event.signal ? `**Signal**：${inlineProgressCode(event.signal)}` : "",
    event.error ? `**错误**：${inlineProgressCode(event.error)}` : "",
  ].filter(Boolean);
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: `Studio Shell /${event.commandName} · ${commandProgressStatusLabel(event.type)}`,
      },
      template: commandProgressCardTemplate(event.type),
    },
    elements: [
      {
        tag: "markdown",
        content: lines.join("\n"),
      },
      { tag: "hr" },
      {
        tag: "markdown",
        content: [
          "**执行命令**",
          "```text",
          sanitizeFeishuCardMarkdown(shortMessage(event.commandPreview, 1_000)),
          "```",
          "**输出预览**",
          "```text",
          sanitizeFeishuCardMarkdown(commandProgressOutputBlock(event, 2_500)),
          "```",
        ].join("\n"),
      },
    ],
  };
}

function writeJsonFileAtomic(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

let runtimeDirty = false;
let runtimeDirtyAt = 0;
let runtimeDebounceTimer: NodeJS.Timeout | null = null;
const RUNTIME_DEBOUNCE_MS = 2000;

function markRuntimeDirty(config: ChannelConnectorsDaemonRuntimeConfig, state: ChannelDaemonState): void {
  state.agentSessionDriver = buildAgentSessionDriverState(config);
  state.updatedAt = new Date().toISOString();
  runtimeDirty = true;
  runtimeDirtyAt = Date.now();
  if (!runtimeDebounceTimer) {
    runtimeDebounceTimer = setTimeout(() => {
      runtimeDebounceTimer = null;
      if (!runtimeDirty) return;
      runtimeDirty = false;
      ensureDir(path.dirname(config.paths.runtime));
      fs.promises.writeFile(config.paths.runtime, `${JSON.stringify(state, null, 2)}\n`, "utf8").catch(() => {});
    }, RUNTIME_DEBOUNCE_MS);
    runtimeDebounceTimer.unref();
  }
}

function flushRuntime(config: ChannelConnectorsDaemonRuntimeConfig, state: ChannelDaemonState): void {
  if (runtimeDebounceTimer) {
    clearTimeout(runtimeDebounceTimer);
    runtimeDebounceTimer = null;
  }
  runtimeDirty = false;
  state.agentSessionDriver = buildAgentSessionDriverState(config);
  state.updatedAt = new Date().toISOString();
  ensureDir(path.dirname(config.paths.runtime));
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
    autoCompacts: [],
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
  if (input.project.agent === "claude-code") {
    return {
      requestedMode,
      effectiveMode: "persistent",
      reason: "claude-code-stream-json",
    };
  }
  if (input.project.agent === "opencode") {
    return {
      requestedMode,
      effectiveMode: "persistent",
      reason: "opencode-run-session",
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

function recordChannelAgentSessionDriverEvent(event: ChannelConnectorAgentSessionDriverEvent): void {
  channelAgentSessionDriverEvents.push(event);
  if (channelAgentSessionDriverEvents.length > MAX_CHANNEL_AGENT_SESSION_DRIVER_EVENTS) {
    channelAgentSessionDriverEvents.splice(0, channelAgentSessionDriverEvents.length - MAX_CHANNEL_AGENT_SESSION_DRIVER_EVENTS);
  }
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
    implementation: "native-cli-session-drivers",
    persistentDriverReady: true,
    policy: channelAgentSessionDriverPool.policy(),
    requestedPersistentBindings: bindings.filter((binding) => binding.requestedMode === "persistent"),
    bindings,
    activeSessions,
    recentEvents: [...channelAgentSessionDriverEvents].reverse(),
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
    sendDaemonJson(res, 200, agentSessionDriverStatusResponse(config));
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

function pendingPermissionKey(input: { bindingId: string; sessionKey: string }): string {
  return [input.bindingId, input.sessionKey].map((part) => encodeURIComponent(part)).join("|");
}

function latestPendingPermissionForSession(
  registry: ChannelDaemonPendingPermissionRegistry,
  input: { bindingId: string; sessionKey: string },
): ChannelDaemonPendingPermissionEntry | null {
  const key = pendingPermissionKey(input);
  return registry.get(key) || null;
}

function isAskUserQuestionRequest(request: ChannelConnectorAgentPermissionRequest): boolean {
  return request.toolName === "AskUserQuestion";
}

function latestPendingQuestionForSession(
  registry: ChannelDaemonPendingPermissionRegistry,
  input: { bindingId: string; sessionKey: string },
): ChannelDaemonPendingPermissionEntry | null {
  const entry = latestPendingPermissionForSession(registry, input);
  return entry && isAskUserQuestionRequest(entry.request) ? entry : null;
}

function hasPendingPermissionForSession(
  registry: ChannelDaemonPendingPermissionRegistry,
  input: { bindingId: string; sessionKey: string },
): boolean {
  return Boolean(latestPendingPermissionForSession(registry, input));
}

function hasPendingQuestionForSession(
  registry: ChannelDaemonPendingPermissionRegistry,
  input: { bindingId: string; sessionKey: string },
): boolean {
  return Boolean(latestPendingQuestionForSession(registry, input));
}

function parseAskUserQuestions(input: Record<string, unknown>): ChannelDaemonUserQuestion[] {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  return rawQuestions
    .map((raw): ChannelDaemonUserQuestion | null => {
      if (!isRecord(raw)) return null;
      const question = normalizeString(raw.question);
      if (!question) return null;
      const rawOptions = Array.isArray(raw.options) ? raw.options : [];
      return {
        question,
        header: normalizeString(raw.header),
        multiSelect: raw.multiSelect === true,
        options: rawOptions
          .map((option): ChannelDaemonUserQuestionOption | null => {
            if (!isRecord(option)) return null;
            const label = normalizeString(option.label);
            if (!label) return null;
            return {
              label,
              description: normalizeString(option.description),
            };
          })
          .filter((option): option is ChannelDaemonUserQuestionOption => Boolean(option)),
      };
    })
    .filter((question): question is ChannelDaemonUserQuestion => Boolean(question));
}

function fallbackAskUserQuestion(): ChannelDaemonUserQuestion {
  return {
    question: "Claude Code 需要你补充信息。",
    header: "",
    options: [],
    multiSelect: false,
  };
}

function pendingAskUserQuestions(request: ChannelConnectorAgentPermissionRequest): ChannelDaemonUserQuestion[] {
  const questions = parseAskUserQuestions(request.input);
  return questions.length ? questions : [fallbackAskUserQuestion()];
}

function firstAskUserQuestion(entry: ChannelDaemonPendingPermissionEntry): ChannelDaemonUserQuestion {
  return entry.questions[entry.currentQuestion] || fallbackAskUserQuestion();
}

function renderAskUserQuestionPrompt(entry: ChannelDaemonPendingPermissionEntry): string {
  return renderAskUserQuestionPromptData({
    questions: entry.questions,
    currentQuestion: entry.currentQuestion,
  });
}

function renderAskUserQuestionPromptData(input: {
  questions: ChannelDaemonUserQuestion[];
  currentQuestion: number;
}): string {
  const question = input.questions[input.currentQuestion] || {
    ...fallbackAskUserQuestion(),
  };
  const total = Math.max(input.questions.length, 1);
  const index = Math.min(input.currentQuestion + 1, total);
  const title = total > 1 ? `Claude Code 提问 (${index}/${total})` : "Claude Code 提问";
  const optionLines = question.options.map((option, optionIndex) => {
    const description = option.description ? ` - ${option.description}` : "";
    return `${optionIndex + 1}. ${option.label}${description}`;
  });
  return [
    title,
    question.header ? `分类：${question.header}` : "",
    question.question,
    question.multiSelect ? "可多选；可回复序号组合，例如：1,3，也可以直接回复文字。" : "",
    optionLines.length ? optionLines.join("\n") : "",
    "请直接回复答案；此时 `allow` / `deny` 会作为答案文本，不会被当成工具权限命令。",
  ].filter(Boolean).join("\n");
}

function resolveAskUserQuestionAnswer(question: ChannelDaemonUserQuestion, rawAnswer: string): string {
  const answer = normalizeString(rawAnswer);
  if (answer.startsWith("askq:")) {
    const parts = answer.split(":");
    const indexText = parts.length >= 3 ? parts[2] : parts[1];
    const index = Number(indexText);
    if (Number.isInteger(index) && index >= 1 && index <= question.options.length) {
      return question.options[index - 1]?.label || answer;
    }
  }
  if (question.multiSelect) {
    const parts = answer.split(/[,\s，]+/).map((part) => part.trim()).filter(Boolean);
    const labels: string[] = [];
    const allValid = parts.length > 0 && parts.every((part) => {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 1 || index > question.options.length) return false;
      labels.push(question.options[index - 1]?.label || part);
      return true;
    });
    if (allValid && labels.length) return labels.join(", ");
  } else {
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= question.options.length) {
      return question.options[index - 1]?.label || answer;
    }
  }
  return answer;
}

function buildAskUserQuestionUpdatedInput(entry: ChannelDaemonPendingPermissionEntry): Record<string, unknown> {
  const output: Record<string, unknown> = { ...entry.request.input };
  const answers: Record<string, unknown> = {};
  for (const [index, answer] of entry.answers.entries()) {
    const question = entry.questions[index];
    if (question?.question) answers[question.question] = answer;
  }
  output.answers = answers;
  return output;
}

function permissionDecisionFromAction(
  action: ChannelConnectorPermissionResponseAction,
  entry: ChannelDaemonPendingPermissionEntry,
): ChannelConnectorAgentPermissionDecision {
  if (action === "deny") {
    return { behavior: "deny", message: "User denied this tool use from the IM channel." };
  }
  return { behavior: "allow", updatedInput: entry.request.input };
}

function permissionStateFromAction(action: ChannelConnectorPermissionResponseAction): ChannelDaemonPendingPermissionState {
  if (action === "deny") return "denied";
  if (action === "allow-all") return "allowed-all";
  return "allowed";
}

function notifyPendingPermissionState(
  entry: ChannelDaemonPendingPermissionEntry,
  status: ChannelDaemonPendingPermissionState,
  message?: string | null,
): void {
  try {
    void Promise.resolve(entry.onStateChange?.({
      request: entry.request,
      status,
      message: message || null,
    })).catch(() => undefined);
  } catch {
    // best effort UI update
  }
}

function respondPendingQuestionForSession(
  registry: ChannelDaemonPendingPermissionRegistry,
  input: {
    bindingId: string;
    sessionKey: string;
    answer: string;
  },
): ChannelConnectorPermissionResponseResult {
  const entry = latestPendingQuestionForSession(registry, input);
  if (!entry) {
    return {
      handled: false,
      ok: false,
      replyText: "当前没有等待回答的 Claude Code 问题。",
      requestId: null,
      toolName: null,
    };
  }
  const question = firstAskUserQuestion(entry);
  const answer = resolveAskUserQuestionAnswer(question, input.answer);
  entry.answers.set(entry.currentQuestion, answer);
  if (entry.currentQuestion + 1 < entry.questions.length) {
    entry.currentQuestion += 1;
    return {
      handled: true,
      ok: true,
      replyText: [
        `已记录：${question.question} -> ${answer}`,
        "",
        renderAskUserQuestionPrompt(entry),
      ].join("\n"),
      requestId: entry.request.requestId,
      toolName: entry.request.toolName || null,
    };
  }
  const key = pendingPermissionKey(input);
  registry.delete(key);
  clearTimeout(entry.timeout);
  entry.resolve({
    behavior: "allow",
    updatedInput: buildAskUserQuestionUpdatedInput(entry),
  });
  return {
    handled: true,
    ok: true,
    replyText: `已回答：${question.question} -> ${answer}`,
    requestId: entry.request.requestId,
    toolName: entry.request.toolName || null,
  };
}

function respondPendingPermissionForSession(
  registry: ChannelDaemonPendingPermissionRegistry,
  input: {
    bindingId: string;
    sessionKey: string;
    action: ChannelConnectorPermissionResponseAction;
  },
): ChannelConnectorPermissionResponseResult {
  const key = pendingPermissionKey(input);
  const entry = registry.get(key) || null;
  if (!entry) {
    return {
      handled: false,
      ok: false,
      replyText: "当前没有等待批准的 Agent 工具请求。",
      requestId: null,
      toolName: null,
    };
  }
  if (isAskUserQuestionRequest(entry.request)) {
    return {
      handled: false,
      ok: false,
      replyText: "当前等待的是 Claude Code 问题回答，请直接回复答案。",
      requestId: entry.request.requestId,
      toolName: entry.request.toolName || null,
    };
  }
  registry.delete(key);
  clearTimeout(entry.timeout);
  if (input.action === "allow-all") channelPermissionApproveAllRunIds.add(entry.runId);
  notifyPendingPermissionState(entry, permissionStateFromAction(input.action));
  entry.resolve(permissionDecisionFromAction(input.action, entry));
  const actionText = input.action === "deny"
    ? "已拒绝"
    : input.action === "allow-all" ? "已允许，并将允许本次运行后续工具请求" : "已允许";
  return {
    handled: true,
    ok: true,
    replyText: `${actionText}：${entry.request.toolName || "tool"} (${entry.request.requestId})`,
    requestId: entry.request.requestId,
    toolName: entry.request.toolName || null,
    suppressReply: entry.suppressReplyOnResolve === true,
  };
}

function clearPendingPermissionsForRun(registry: ChannelDaemonPendingPermissionRegistry, runId: string): void {
  channelPermissionApproveAllRunIds.delete(runId);
  for (const [key, entry] of registry.entries()) {
    if (entry.runId !== runId) continue;
    registry.delete(key);
    clearTimeout(entry.timeout);
    notifyPendingPermissionState(entry, "ended", "Agent run ended before approval.");
    entry.resolve({ behavior: "deny", message: "Agent run ended before the permission request was approved." });
  }
}

function renderPermissionPrompt(request: ChannelConnectorAgentPermissionRequest): string {
  if (isAskUserQuestionRequest(request)) {
    return renderAskUserQuestionPromptData({
      questions: pendingAskUserQuestions(request),
      currentQuestion: 0,
    });
  }
  const input = JSON.stringify(request.input || {}, null, 2);
  return [
    "Agent 请求执行工具，需要确认。",
    `工具：${request.toolName || "tool"}`,
    `请求：${request.requestId}`,
    input && input !== "{}" ? `参数：\n\`\`\`json\n${input}\n\`\`\`` : "",
    "回复 `/approve` 允许，`/deny` 拒绝，`/allow-all` 允许本次运行后续工具请求。",
  ].filter(Boolean).join("\n");
}

function renderPlainPermissionPrompt(request: ChannelConnectorAgentPermissionRequest, fallbackText: string): string {
  if (isAskUserQuestionRequest(request)) {
    return renderPlainProgressMessage({
      icon: "❓",
      title: "Claude Code 提问",
      meta: "等待回复",
      body: fallbackText,
    });
  }
  const toolName = normalizeString(request.toolName) || "tool";
  const requestId = normalizeString(request.requestId) || "permission";
  const inputJson = JSON.stringify(request.input || {}, null, 2);
  const body = [
    `请求 \`${inlineProgressCode(requestId)}\``,
    inputJson && inputJson !== "{}" ? codeBlock("json", inputJson) : "",
    "回复 `/approve` 允许，`/deny` 拒绝，`/allow-all` 允许本次运行后续工具请求。",
  ].filter(Boolean).join("\n");
  return renderPlainProgressMessage({
    icon: progressKindIcon("permission"),
    title: `${progressToolUseLabel(toolName)} \`${inlineProgressCode(toolName)}\``,
    meta: "等待审批",
    body,
  });
}

function renderPlainPermissionState(change: ChannelDaemonPendingPermissionStateChange): string {
  const toolName = normalizeString(change.request.toolName) || "tool";
  const requestId = normalizeString(change.request.requestId) || "permission";
  const status = change.status;
  const body = [
    `请求 \`${inlineProgressCode(requestId)}\``,
    change.message ? inlineProgressCode(change.message) : "",
    status === "allowed" || status === "allowed-all" ? "审批已通过，Agent 将继续执行后续步骤。" : "",
    status === "denied" || status === "timed-out" ? "审批未通过，Agent 会收到拒绝结果。" : "",
  ].filter(Boolean).join("\n");
  return renderPlainProgressMessage({
    icon: progressKindIcon(status === "allowed" || status === "allowed-all" ? "completed" : status === "denied" || status === "timed-out" || status === "failed" ? "failed" : "permission"),
    title: `${progressToolUseLabel(toolName)} \`${inlineProgressCode(toolName)}\``,
    meta: permissionProgressStatusLabel(status),
    body,
  });
}

function permissionStateContinuesRun(status: ChannelDaemonPendingPermissionState): boolean {
  return status === "allowed" || status === "allowed-all";
}

function permissionStateSettled(status: ChannelDaemonPendingPermissionState): boolean {
  return status !== "pending";
}

function createPermissionResolver(input: {
  registry: ChannelDaemonPendingPermissionRegistry;
  runId: string;
  bindingId: string;
  sessionKey: string;
  messageId: string;
  agent: string;
  model: string | null;
  timeoutMs?: number;
  onPrompt: (prompt: string, request: ChannelConnectorAgentPermissionRequest) => Promise<void> | void;
  onStateChange?: (input: ChannelDaemonPendingPermissionStateChange) => Promise<void> | void;
  suppressReplyOnResolve?: boolean;
}): (request: ChannelConnectorAgentPermissionRequest) => Promise<ChannelConnectorAgentPermissionDecision> {
  return async (request) => {
    if (!isAskUserQuestionRequest(request) && channelPermissionApproveAllRunIds.has(input.runId)) {
      return { behavior: "allow", updatedInput: request.input };
    }
    const key = pendingPermissionKey(input);
    const timeoutMs = input.timeoutMs || 120_000;
    return new Promise<ChannelConnectorAgentPermissionDecision>((resolve) => {
      const previous = input.registry.get(key);
      if (previous) {
        clearTimeout(previous.timeout);
        notifyPendingPermissionState(previous, "replaced", "A newer permission request replaced this request.");
        previous.resolve({ behavior: "deny", message: "A newer permission request replaced this request." });
      }
      const timeout = setTimeout(() => {
        const entry = input.registry.get(key);
        if (entry?.id === request.requestId) {
          input.registry.delete(key);
          notifyPendingPermissionState(entry, "timed-out", "Permission request timed out.");
        }
        resolve({ behavior: "deny", message: "Permission request timed out waiting for IM approval." });
      }, timeoutMs);
      timeout.unref();
      const entry: ChannelDaemonPendingPermissionEntry = {
        id: request.requestId,
        runId: input.runId,
        bindingId: input.bindingId,
        sessionKey: input.sessionKey,
        messageId: input.messageId,
        agent: input.agent,
        model: input.model,
        requestedAt: new Date().toISOString(),
        request,
        resolve,
        timeout,
        questions: pendingAskUserQuestions(request),
        answers: new Map(),
        currentQuestion: 0,
        suppressReplyOnResolve: input.suppressReplyOnResolve === true,
        onStateChange: input.onStateChange,
      };
      input.registry.set(key, entry);
      notifyPendingPermissionState(entry, "pending");
      Promise.resolve(input.onPrompt(renderPermissionPrompt(request), request)).catch((error) => {
        const current = input.registry.get(key);
        if (current?.id === request.requestId) {
          input.registry.delete(key);
          notifyPendingPermissionState(current, "failed", shortMessage(error));
        }
        clearTimeout(timeout);
        resolve({ behavior: "deny", message: `Permission prompt delivery failed: ${shortMessage(error)}` });
      });
    });
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
    onQueueTimeout?: (error: Error) => void;
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
    const queueTimeoutMs = 300_000;
    let queueTimeoutTimer: NodeJS.Timeout | null = null;
    await Promise.race([
      previous.catch(() => undefined),
      new Promise<void>((_, reject) => {
        queueTimeoutTimer = setTimeout(() => reject(new Error("session_queue_timeout")), queueTimeoutMs);
        queueTimeoutTimer.unref();
      }),
    ]).catch((error) => {
      input.onQueueTimeout?.(error instanceof Error ? error : new Error(String(error)));
      releaseCurrent();
    }).finally(() => {
      if (queueTimeoutTimer) clearTimeout(queueTimeoutTimer);
    });
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
      const feishuStates = Object.values(state.feishuConnections);
      const feishuHealthy = feishuStates.length === 0 || feishuStates.every((connection) =>
        connection.connected === true
        && connection.state !== "reconnecting"
        && connection.ingressState !== "silent"
        && connection.pongOverdue !== true
        && connection.transportStale !== true
      );
      const runsHealthy = state.activeRuns.length < 50;
      const ok = feishuHealthy && runsHealthy;
      res.statusCode = ok ? 200 : 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ok,
        pid: process.pid,
        feishu: {
          groups: feishuStates.length,
          connected: feishuStates.filter((connection) => connection.connected).length,
          silent: feishuStates.filter((connection) => connection.ingressState === "silent").length,
          pongOverdue: feishuStates.filter((connection) => connection.pongOverdue).length,
          transportStale: feishuStates.filter((connection) => connection.transportStale).length,
        },
        activeRuns: state.activeRuns.length,
      }));
      return;
    }
    const managementToken = (config.management as { token?: string }).token || process.env.STUDIO_DAEMON_MANAGEMENT_TOKEN;
    if (managementToken && req.url !== "/health" && req.url !== "/status") {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${managementToken}`) {
        res.statusCode = 401;
        res.end("unauthorized");
        return;
      }
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
        autoCompacts: state.autoCompacts || [],
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

function channelAgentSessionReapIntervalMs(): number {
  const configured = optionalNonNegativeIntegerEnv("STUDIO_CHANNEL_AGENT_SESSION_REAP_INTERVAL_MS");
  return configured == null ? DEFAULT_CHANNEL_AGENT_SESSION_REAP_INTERVAL_MS : configured;
}

function startAgentSessionDriverReaper(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
): NodeJS.Timeout | null {
  const intervalMs = channelAgentSessionReapIntervalMs();
  if (intervalMs <= 0) {
    appendLog(config.paths.log, "Persistent Agent session idle reaper disabled");
    return null;
  }
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void channelAgentSessionDriverPool.reapIdle()
      .then((reaped) => {
        if (reaped <= 0) return;
        state.agentSessionDriver = buildAgentSessionDriverState(config);
        appendLog(config.paths.log, "Reaped idle persistent Agent sessions", {
          reaped,
          intervalMs,
          activeSessions: state.agentSessionDriver.activeSessions.length,
        });
        markRuntimeDirty(config, state);
      })
      .catch((error) => {
        appendLog(config.paths.log, "Persistent Agent session idle reaper failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);
  timer.unref();
  return timer;
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

function optionalPositiveIntegerEnv(name: string): number | undefined {
  const value = normalizeString(process.env[name]);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function optionalNonNegativeIntegerEnv(name: string): number | undefined {
  const value = normalizeString(process.env[name]);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
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
    disabledCommands: binding.disabledCommands,
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
      "sdkPingTimeoutSeconds",
      "sdk_ping_timeout_seconds",
    ], DEFAULT_FEISHU_PING_TIMEOUT_SECONDS)
    : DEFAULT_FEISHU_PING_TIMEOUT_SECONDS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_PING_TIMEOUT_SECONDS, MAX_FEISHU_PING_TIMEOUT_SECONDS);
}

function feishuPingIntervalMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuPingIntervalMs",
      "feishu_ping_interval_ms",
      "pingIntervalMs",
      "ping_interval_ms",
      "sdkPingIntervalMs",
      "sdk_ping_interval_ms",
    ], DEFAULT_FEISHU_PING_INTERVAL_MS)
    : DEFAULT_FEISHU_PING_INTERVAL_MS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_PING_INTERVAL_MS, MAX_FEISHU_PING_INTERVAL_MS);
}

function feishuPongTimeoutMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuPongTimeoutMs",
      "feishu_pong_timeout_ms",
      "pongTimeoutMs",
      "pong_timeout_ms",
    ], DEFAULT_FEISHU_PONG_TIMEOUT_MS)
    : DEFAULT_FEISHU_PONG_TIMEOUT_MS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_PONG_TIMEOUT_MS, MAX_FEISHU_PONG_TIMEOUT_MS);
}

function feishuTransportStaleAfterMs(group: ChannelDaemonFeishuGroup): number {
  const pingIntervalMs = feishuPingIntervalMs(group);
  const pongTimeoutMs = feishuPongTimeoutMs(group);
  if (pingIntervalMs <= 0 || pongTimeoutMs <= 0) return 0;
  return clampNumber(
    pingIntervalMs + pongTimeoutMs + DEFAULT_FEISHU_TRANSPORT_STALE_MARGIN_MS,
    MIN_FEISHU_TRANSPORT_STALE_MS,
    MAX_FEISHU_TRANSPORT_STALE_MS,
  );
}

function feishuStaleEventMaxAgeMs(binding: ChannelConnectorRuntimeBinding): number {
  const value = metadataNumber(binding, [
    "feishuStaleEventMaxAgeMs",
    "feishu_stale_event_max_age_ms",
    "feishuStaleMessageMaxAgeMs",
    "feishu_stale_message_max_age_ms",
    "staleEventMaxAgeMs",
    "stale_event_max_age_ms",
    "staleMessageMaxAgeMs",
    "stale_message_max_age_ms",
  ], DEFAULT_FEISHU_STALE_EVENT_MAX_AGE_MS);
  if (value <= 0) return 0;
  return clampNumber(
    Math.floor(value),
    MIN_FEISHU_STALE_EVENT_MAX_AGE_MS,
    MAX_FEISHU_STALE_EVENT_MAX_AGE_MS,
  );
}

function feishuReconnectingRecycleMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuReconnectingRecycleMs",
      "feishu_reconnecting_recycle_ms",
      "reconnectingRecycleMs",
      "reconnecting_recycle_ms",
      "sdkReconnectingRecycleMs",
      "sdk_reconnecting_recycle_ms",
    ], DEFAULT_FEISHU_RECONNECTING_RECYCLE_MS)
    : DEFAULT_FEISHU_RECONNECTING_RECYCLE_MS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_RECONNECTING_RECYCLE_MS, MAX_FEISHU_RECONNECTING_RECYCLE_MS);
}

function feishuIngressUnverifiedAfterMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuIngressUnverifiedAfterMs",
      "feishu_ingress_unverified_after_ms",
      "ingressUnverifiedAfterMs",
      "ingress_unverified_after_ms",
      "deliveryUnverifiedAfterMs",
      "delivery_unverified_after_ms",
    ], DEFAULT_FEISHU_INGRESS_UNVERIFIED_AFTER_MS)
    : DEFAULT_FEISHU_INGRESS_UNVERIFIED_AFTER_MS;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), MIN_FEISHU_INGRESS_UNVERIFIED_AFTER_MS, MAX_FEISHU_INGRESS_UNVERIFIED_AFTER_MS);
}

function feishuIngressUnverifiedRenewMax(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuIngressUnverifiedRenewMax",
      "feishu_ingress_unverified_renew_max",
      "ingressUnverifiedRenewMax",
      "ingress_unverified_renew_max",
      "deliveryUnverifiedRenewMax",
      "delivery_unverified_renew_max",
    ], DEFAULT_FEISHU_INGRESS_UNVERIFIED_RENEW_MAX)
    : DEFAULT_FEISHU_INGRESS_UNVERIFIED_RENEW_MAX;
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), 0, MAX_FEISHU_INGRESS_UNVERIFIED_RENEW_MAX);
}

function feishuIngressUnverifiedRenewDelayMs(group: ChannelDaemonFeishuGroup): number {
  const baseMs = feishuIngressUnverifiedAfterMs(group);
  if (baseMs <= 0) return 0;
  const renewals = Math.max(0, Math.floor(group.ingressUnverifiedRenewals || 0));
  return clampNumber(baseMs * (2 ** renewals), baseMs, MAX_FEISHU_INGRESS_UNVERIFIED_AFTER_MS);
}

function feishuLockRetryMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuLockRetryMs",
      "feishu_lock_retry_ms",
      "lockRetryMs",
      "lock_retry_ms",
    ], DEFAULT_FEISHU_LOCK_RETRY_MS)
    : DEFAULT_FEISHU_LOCK_RETRY_MS;
  return clampNumber(Math.floor(value), MIN_FEISHU_LOCK_RETRY_MS, MAX_FEISHU_LOCK_RETRY_MS);
}

function feishuPongTimeoutState(group: ChannelDaemonFeishuGroup, nowMs = Date.now()): {
  waitingForPong: boolean;
  waitingForMs: number;
  overdue: boolean;
} {
  const pongTimeoutMs = feishuPongTimeoutMs(group);
  const lastPingMs = Date.parse(group.lastPingAt || "");
  const lastPongMs = Date.parse(group.lastPongAt || "");
  const waitingForPong = Number.isFinite(lastPingMs)
    && (!Number.isFinite(lastPongMs) || lastPongMs < lastPingMs);
  const waitingForMs = waitingForPong && Number.isFinite(lastPingMs)
    ? Math.max(0, nowMs - lastPingMs)
    : 0;
  return {
    waitingForPong,
    waitingForMs,
    overdue: pongTimeoutMs > 0 && waitingForPong && waitingForMs >= pongTimeoutMs,
  };
}

function feishuTransportStaleState(group: ChannelDaemonFeishuGroup, nowMs = Date.now()): {
  staleForMs: number;
  staleAfterMs: number;
  stale: boolean;
} {
  const staleAfterMs = feishuTransportStaleAfterMs(group);
  if (staleAfterMs <= 0) {
    return { staleForMs: 0, staleAfterMs, stale: false };
  }
  const lastControlMs = Date.parse(group.lastControlFrameAt || "");
  const connectedAtMs = Date.parse(group.lastConnectedAt || "");
  const referenceMs = Number.isFinite(lastControlMs) ? lastControlMs : connectedAtMs;
  const staleForMs = Number.isFinite(referenceMs) ? Math.max(0, nowMs - referenceMs) : 0;
  return {
    staleForMs,
    staleAfterMs,
    stale: Number.isFinite(referenceMs) && staleForMs >= staleAfterMs,
  };
}

function feishuDispatcherVerificationToken(group: ChannelDaemonFeishuGroup): string {
  const binding = firstFeishuBinding(group);
  return binding
    ? metadataString(binding, [
      "verificationToken",
      "verification_token",
      "feishuVerificationToken",
      "feishu_verification_token",
    ])
    : "";
}

function feishuDispatcherEncryptKey(group: ChannelDaemonFeishuGroup): string {
  const binding = firstFeishuBinding(group);
  return binding
    ? metadataString(binding, [
      "encryptKey",
      "encrypt_key",
      "feishuEncryptKey",
      "feishu_encrypt_key",
    ])
    : "";
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

function feishuVerifiedIngressSilentRenewMs(group: ChannelDaemonFeishuGroup): number {
  const binding = firstFeishuBinding(group);
  const value = binding
    ? metadataNumber(binding, [
      "feishuVerifiedIngressSilentRenewMs",
      "feishu_verified_ingress_silent_renew_ms",
      "verifiedIngressSilentRenewMs",
      "verified_ingress_silent_renew_ms",
      "ingressLeaseRenewMs",
      "ingress_lease_renew_ms",
    ], DEFAULT_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS)
    : DEFAULT_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS;
  if (value <= 0) return 0;
  return clampNumber(
    Math.floor(value),
    MIN_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS,
    MAX_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS,
  );
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
  if (value <= 0) return 0;
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
  messages: ChannelConnectorOutboundMessageRequest[];
  errors: string[];
  declaredCount: number;
  declaredMessageCount: number;
  maxBytes: number;
} {
  const extractedMessages = extractChannelConnectorOutboundMessages(input.replyText || "");
  const extracted = extractChannelConnectorOutboundFiles(extractedMessages.replyText);
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
    messages: extractedMessages.messages,
    errors: [...extractedMessages.errors, ...extracted.errors, ...resolved.errors],
    declaredCount: extracted.files.length,
    declaredMessageCount: extractedMessages.messages.length,
    maxBytes,
  };
}

function outboundFilesHistoryText(input: {
  replyText: string;
  files: ChannelConnectorResolvedOutboundFile[];
  messages: ChannelConnectorOutboundMessageRequest[];
  errors: string[];
}): string {
  const parts = [input.replyText];
  if (input.files.length) {
    parts.push(`[Studio outbound files: ${input.files.map((file) => `${file.fileName} (${file.size} bytes)`).join(", ")}]`);
  }
  if (input.messages.length) {
    parts.push(`[Studio outbound messages: ${input.messages.map((message) => `${message.platform || "current"}:${message.chatId || message.channelId}`).join(", ")}]`);
  }
  if (input.errors.length) {
    parts.push(`[Studio outbound errors: ${input.errors.join("; ")}]`);
  }
  return parts.filter(Boolean).join("\n\n");
}

function appendOutboundFileErrors(replyText: string, errors: string[]): string {
  if (!errors.length) return replyText;
  const message = `出站消息准备失败：${errors.join("; ")}`;
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

function isStaleAgentSessionResumeFailure(result: ChannelConnectorAgentTurnResult): boolean {
  if (result.status !== "failed" || result.session.resumed !== true) return false;
  const haystack = [
    result.error,
    result.stderr,
    result.stdout,
    result.progress.summary,
    result.progress.latest?.text,
  ].map((value) => normalizeString(value)).filter(Boolean).join("\n");
  return /thread\/resume failed|no rollout found/i.test(haystack);
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
  const run = (request: Parameters<typeof runChannelConnectorAgentTurn>[0]) => channelAgentSessionDriverPool.runTurn({
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
    agentTurnRequest: request,
    signal: request.signal || null,
    onProgress: request.onProgress,
    runOneShot: () => runChannelConnectorAgentTurn(request),
  });
  const first = await run(input.request);
  if (!isStaleAgentSessionResumeFailure(first)) return first;
  const freshRequest: Parameters<typeof runChannelConnectorAgentTurn>[0] = {
    ...input.request,
    session: {
      agentNativeSessionId: null,
      codexThreadId: null,
    },
  };
  return run(freshRequest);
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

async function sendOctoOutboundMessages(input: {
  transport: ChannelConnectorOctoTransportConfig;
  sourceMessage: ChannelConnectorOctoInboundMessage;
  messages: ChannelConnectorOutboundMessageRequest[];
}): Promise<{ sentCount: number; requestCount: number; errors: string[] }> {
  let sentCount = 0;
  let requestCount = 0;
  const errors: string[] = [];
  for (const message of input.messages) {
    if (message.platform && message.platform !== "octo") continue;
    const target = resolveOctoOutboundMessageTarget({
      message,
      sourceChannelId: input.sourceMessage.channelId,
      sourceChannelType: input.sourceMessage.channelType,
    });
    if (target.error) {
      errors.push(target.error);
      continue;
    }
    const channelId = target.channelId;
    const channelType = target.channelType;
    const mentionUids = target.mentionUids;
    const content = normalizeString(message.content);
    if (!channelId || !content || !Number.isFinite(channelType)) {
      errors.push("Octo outbound message requires channelId/channelType/content.");
      continue;
    }
    const chunks = splitChannelConnectorTextChunks(content, 3800).filter((chunk) => normalizeString(chunk));
    if (!chunks.length) {
      errors.push(`Octo outbound message to ${channelId} has empty content.`);
      continue;
    }
    const replyPlan = renderOctoOutboundText({
      channelId,
      channelType: channelType as 1 | 2 | 5,
      content,
      members: input.sourceMessage.members || [],
      mentionUids,
      mentionAll: message.mentionAll,
      onBehalfOf: message.onBehalfOf,
    });
    if (!replyPlan) {
      errors.push(`Octo outbound message to ${channelId} has empty rendered content.`);
      continue;
    }
    const result = await sendOctoTextReply(input.transport, {
      ...replyPlan,
    });
    requestCount += result.requestCount;
    if (result.ok === true) {
      sentCount += 1;
    } else {
      errors.push(`${channelId}: ${result.error || "Octo message send failed"}`);
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

async function sendFeishuOutboundMessages(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  messages: ChannelConnectorOutboundMessageRequest[];
}): Promise<{ sentCount: number; requestCount: number; errors: string[] }> {
  let sentCount = 0;
  let requestCount = 0;
  const errors: string[] = [];
  const cachePath = feishuTokenCachePath(input.config);
  for (const message of input.messages) {
    if (message.platform && message.platform !== "feishu") continue;
    const target = resolveFeishuOutboundMessageTarget(message);
    const content = normalizeString(message.content);
    if (target.error || !content) {
      errors.push(target.error || "Feishu outbound message requires content.");
      continue;
    }
    const result = message.format === "markdown"
      ? await sendFeishuPostMessage(input.transport, {
        receiveId: target.receiveId,
        receiveIdType: target.receiveIdType,
        content,
      }, cachePath)
      : await sendFeishuTextMessage(input.transport, {
        receiveId: target.receiveId,
        receiveIdType: target.receiveIdType,
        content,
      }, cachePath);
    requestCount += result.requestCount;
    if (result.ok === true) {
      sentCount += 1;
    } else {
      errors.push(`${target.receiveId}: ${result.error || "Feishu message send failed"}`);
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

function customCommandsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-custom-commands.json");
}

function commandAliasesPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-command-aliases.json");
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
  return compactChannelConnectorConversationCore({
    historyPath: conversationHistoryPath(input.config),
    agentSessionsPath: agentSessionsPath(input.config),
    gatewayEndpoint: input.config.gateway.endpoint,
    gatewayClientKey: input.gatewayClientKey,
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
    project: input.project,
  });
}

async function nativeCompactChannelConnectorConversation(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  project: ChannelConnectorRuntimeProject;
  message: ChannelConnectorOctoInboundMessage;
  gatewayClientKey: string | null;
}): Promise<{
  attempted: boolean;
  ok: boolean;
  fallbackAllowed: boolean;
  replyText: string | null;
  error: string | null;
}> {
  const mode = effectiveAgentSessionDriverMode({
    binding: input.binding,
    project: input.project,
  });
  if (mode.effectiveMode !== "persistent") {
    return {
      attempted: false,
      ok: false,
      fallbackAllowed: true,
      replyText: null,
      error: mode.reason === "unsupported-agent"
        ? `Agent ${input.project.agent} has no persistent native compact driver yet.`
        : "Current binding is using one-shot Agent runner.",
    };
  }
  const activeRun = latestActiveRunForSession(input.activeRunCancels, {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
  });
  if (activeRun) {
    return {
      attempted: true,
      ok: false,
      fallbackAllowed: false,
      replyText: null,
      error: `当前 IM 会话仍有 Agent run 在执行，先发送 /stop 或等待完成后再 compact。Active message=${activeRun.entry.messageId}`,
    };
  }
  const key = {
    bindingId: input.binding.id,
    projectId: input.project.id,
    sessionKey: input.sessionKey,
    agent: input.project.agent,
    model: input.project.model,
    workDir: input.project.workDir,
    permissionMode: input.project.permissionMode,
  };
  const poolKey = channelConnectorAgentSessionDriverPoolKey(key);
  const activeSession = channelAgentSessionDriverPool.status().find((session) => session.poolKey === poolKey);
  if (!activeSession) {
    return {
      attempted: false,
      ok: false,
      fallbackAllowed: true,
      replyText: null,
      error: "No live persistent Agent session exists for native compact.",
    };
  }
  const currentSession = getChannelConnectorAgentSession(agentSessionsPath(input.config), {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    projectId: input.project.id,
    agent: input.project.agent,
    model: input.project.model,
    workDir: input.project.workDir,
  });
  const messageId = `compact:${normalizeString(input.message.messageId) || Date.now()}`;
  try {
    const result = await runChannelConnectorAgentTurnWithSessionDriver({
      binding: input.binding,
      project: input.project,
      sessionKey: input.sessionKey,
      messageId,
      request: {
        project: input.project,
        binding: input.binding,
        message: input.message,
        sessionKey: input.sessionKey,
        gatewayEndpoint: input.project.gatewayEndpoint || input.config.gateway.endpoint,
        gatewayClientKey: input.gatewayClientKey,
        agentRuntimeDir: agentRuntimeDir(input.config, input.project, input.binding),
        historyContext: null,
        nativeCommand: "/compact",
        session: {
          agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || activeSession.sessionId || null,
          codexThreadId: currentSession?.codexThreadId || null,
        },
      },
    });
    if (result.session.agentNativeSessionId || result.session.codexThreadId) {
      upsertChannelConnectorAgentSession(agentSessionsPath(input.config), {
        bindingId: input.binding.id,
        sessionKey: input.sessionKey,
        projectId: input.project.id,
        agent: input.project.agent,
        model: input.project.model,
        workDir: input.project.workDir,
        agentNativeSessionId: result.session.agentNativeSessionId || result.session.codexThreadId || null,
        codexThreadId: result.session.codexThreadId || null,
        messageId,
        status: result.status,
      });
    }
    writeJsonLine(input.binding.platform === "feishu" ? input.config.paths.feishuEvents : input.config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.native_compact.finished",
      platform: input.binding.platform,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId,
      agent: input.project.agent,
      model: input.project.model,
      ok: result.ok,
      status: result.status,
      error: result.error,
      progressEventCount: result.progress.eventCount,
    });
    markRuntimeDirty(input.config, input.state);
    return {
      attempted: true,
      ok: result.ok === true,
      fallbackAllowed: result.ok !== true,
      replyText: result.replyText,
      error: result.ok === true ? null : result.error || "Agent native compact failed.",
    };
  } catch (error) {
    writeJsonLine(input.binding.platform === "feishu" ? input.config.paths.feishuEvents : input.config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "agent.native_compact.failed",
      platform: input.binding.platform,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId,
      agent: input.project.agent,
      model: input.project.model,
      error: shortMessage(error),
    });
    markRuntimeDirty(input.config, input.state);
    return {
      attempted: true,
      ok: false,
      fallbackAllowed: true,
      replyText: null,
      error: shortMessage(error),
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

function channelAutoCompactEnabled(binding: ChannelConnectorRuntimeBinding): boolean {
  if (metadataBoolean(binding, [
    "disableAutoCompact",
    "disable_auto_compact",
    "autoCompactDisabled",
    "auto_compact_disabled",
  ], false)) {
    return false;
  }
  return metadataBoolean(binding, [
    "autoCompact",
    "auto_compact",
    "autoCompactEnabled",
    "auto_compact_enabled",
  ], true);
}

function channelAutoCompactCooldownMs(binding: ChannelConnectorRuntimeBinding): number {
  const fallback = optionalNonNegativeIntegerEnv("STUDIO_CHANNEL_AUTO_COMPACT_COOLDOWN_MS")
    ?? DEFAULT_CHANNEL_AUTO_COMPACT_COOLDOWN_MS;
  const value = metadataNumber(binding, [
    "autoCompactCooldownMs",
    "auto_compact_cooldown_ms",
    "compactCooldownMs",
    "compact_cooldown_ms",
  ], fallback);
  if (value <= 0) return 0;
  return clampNumber(Math.floor(value), 0, MAX_CHANNEL_AUTO_COMPACT_COOLDOWN_MS);
}

function autoCompactLogPath(
  config: ChannelConnectorsDaemonRuntimeConfig,
  binding: ChannelConnectorRuntimeBinding,
): string {
  return binding.platform === "feishu" ? config.paths.feishuEvents : config.paths.octoEvents;
}

function autoCompactScopeMatches(
  record: ChannelDaemonAutoCompactRecord,
  input: {
    bindingId: string;
    sessionKey: string;
    project: ChannelConnectorRuntimeProject;
  },
): boolean {
  return record.bindingId === input.bindingId
    && record.sessionKey === input.sessionKey
    && record.projectId === input.project.id
    && record.agent === input.project.agent
    && (record.model || "") === (input.project.model || "")
    && record.workDir === input.project.workDir;
}

function latestAutoCompactCooldownAnchor(
  state: ChannelDaemonState,
  input: {
    bindingId: string;
    sessionKey: string;
    project: ChannelConnectorRuntimeProject;
  },
): ChannelDaemonAutoCompactRecord | null {
  return (state.autoCompacts || []).find((record) => {
    return autoCompactScopeMatches(record, input)
      && record.ok !== true
      && Boolean(record.cooldownStartedAt);
  }) || null;
}

function pushAutoCompactRecord(
  state: ChannelDaemonState,
  record: ChannelDaemonAutoCompactRecord,
): void {
  state.autoCompacts = [record, ...(state.autoCompacts || [])].slice(0, 40);
}

function autoCompactSummaryPreview(value: string | null): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return shortMessage(normalized, 180);
}

function latestSuccessfulAutoCompactBaseline(
  state: ChannelDaemonState,
  input: {
    bindingId: string;
    sessionKey: string;
    project: ChannelConnectorRuntimeProject;
  },
): ChannelDaemonAutoCompactRecord | null {
  return (state.autoCompacts || []).find((record) => {
    return autoCompactScopeMatches(record, input)
      && record.ok === true
      && record.usedTokens !== null;
  }) || null;
}

function roundBudgetPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function budgetWithEffectiveUsedTokens(
  budget: ChannelConnectorContextBudgetSummary,
  usedTokens: number | null,
): ChannelConnectorContextBudgetSummary {
  const remainingTokens = budget.contextWindow !== null && usedTokens !== null
    ? Math.max(0, budget.contextWindow - usedTokens)
    : null;
  const usedPercent = budget.contextWindow !== null && usedTokens !== null
    ? roundBudgetPercent((usedTokens / budget.contextWindow) * 100)
    : null;
  const remainingPercent = budget.contextWindow !== null && remainingTokens !== null
    ? roundBudgetPercent((remainingTokens / budget.contextWindow) * 100)
    : null;
  const shouldCompact = usedTokens !== null && budget.autoCompactTokenLimit !== null
    ? usedTokens >= budget.autoCompactTokenLimit
    : null;
  return {
    ...budget,
    usedTokens,
    remainingTokens,
    usedPercent,
    remainingPercent,
    shouldCompact,
  };
}

function applySuccessfulAutoCompactBaseline(input: {
  budget: ChannelConnectorContextBudgetSummary;
  baseline: ChannelDaemonAutoCompactRecord | null;
}): ChannelConnectorContextBudgetSummary {
  if (!input.baseline || input.budget.usedTokens === null || input.baseline.usedTokens === null) {
    return input.budget;
  }
  return budgetWithEffectiveUsedTokens(
    input.budget,
    Math.max(0, input.budget.usedTokens - input.baseline.usedTokens),
  );
}

async function resolveAutoCompactBudget(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  bindingId: string;
  sessionKey: string;
  project: ChannelConnectorRuntimeProject;
  gatewayClientKey: string | null;
}): Promise<{
  budget: ChannelConnectorContextBudgetSummary;
  catalogError: string | null;
}> {
  let catalog: ChannelConnectorGatewayModel[] = [];
  let catalogError: string | null = null;
  try {
    catalog = await listChannelConnectorGatewayModelCatalog(
      input.project.gatewayEndpoint || input.config.gateway.endpoint,
      input.gatewayClientKey,
    );
  } catch (error) {
    catalogError = shortMessage(error);
  }
  const history = getChannelConnectorConversationHistory(conversationHistoryPath(input.config), {
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
  }, 50);
  return {
    budget: resolveChannelConnectorContextBudget({
      model: input.project.model,
      modelCatalog: catalog,
      usageSummary: summarizeChannelConnectorUsageFromState(input.state, {
        bindingId: input.bindingId,
        sessionKey: input.sessionKey,
      }),
      history,
    }),
    catalogError,
  };
}

async function maybeAutoCompactChannelConnectorConversation(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  project: ChannelConnectorRuntimeProject;
  message: ChannelConnectorOctoInboundMessage;
  gatewayClientKey: string | null;
  adapter: "octo" | "feishu";
  messageId: string;
  threadFields?: Record<string, unknown>;
}): Promise<ChannelDaemonAutoCompactRecord | null> {
  if (!channelAutoCompactEnabled(input.binding)) return null;
  const { budget: rawBudget, catalogError } = await resolveAutoCompactBudget({
    config: input.config,
    state: input.state,
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    project: input.project,
    gatewayClientKey: input.gatewayClientKey,
  });
  const baseline = latestSuccessfulAutoCompactBaseline(input.state, {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    project: input.project,
  });
  const budget = applySuccessfulAutoCompactBaseline({
    budget: rawBudget,
    baseline,
  });
  if (catalogError) {
    appendLog(input.config.paths.log, "Gateway model catalog lookup failed for auto compact", {
      adapter: input.adapter,
      bindingId: input.binding.id,
      projectId: input.project.id,
      model: input.project.model,
      error: catalogError,
    });
  }
  if (budget.shouldCompact !== true) return null;

  const checkedAt = new Date().toISOString();
  const cooldownMs = channelAutoCompactCooldownMs(input.binding);
  const latest = latestAutoCompactCooldownAnchor(input.state, {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    project: input.project,
  });
  const latestAtMs = latest?.cooldownStartedAt ? isoTimestampMs(latest.cooldownStartedAt) : null;
  const nowMs = isoTimestampMs(checkedAt) ?? Date.now();
  if (cooldownMs > 0 && latestAtMs !== null && nowMs - latestAtMs < cooldownMs) {
    const cooldownUntil = new Date(latestAtMs + cooldownMs).toISOString();
    const record: ChannelDaemonAutoCompactRecord = {
      checkedAt,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      projectId: input.project.id,
      agent: input.project.agent,
      model: input.project.model || null,
      workDir: input.project.workDir,
      messageId: input.messageId,
      action: "skipped",
      ok: null,
      reason: "cooldown",
      usageSource: budget.usageSource,
      usedTokens: rawBudget.usedTokens,
      effectiveUsedTokens: budget.usedTokens,
      contextWindow: budget.contextWindow,
      autoCompactTokenLimit: budget.autoCompactTokenLimit,
      remainingTokens: budget.remainingTokens,
      nativeAttempted: false,
      fallbackAttempted: false,
      beforeEntries: null,
      afterEntries: null,
      sessionsCleared: null,
      summaryPreview: null,
      error: `Auto compact cooldown active until ${cooldownUntil}.`,
      cooldownStartedAt: null,
      cooldownUntil,
    };
    pushAutoCompactRecord(input.state, record);
    writeJsonLine(autoCompactLogPath(input.config, input.binding), {
      checkedAt,
      eventKind: "agent.auto_compact.skipped",
      adapter: input.adapter,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      ...(input.threadFields || {}),
      reason: record.reason,
      cooldownUntil,
      budget,
      rawBudget,
      baselineCompactAt: baseline?.checkedAt || null,
    });
    markRuntimeDirty(input.config, input.state);
    return record;
  }

  writeJsonLine(autoCompactLogPath(input.config, input.binding), {
    checkedAt,
    eventKind: "agent.auto_compact.threshold",
    adapter: input.adapter,
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    messageId: input.messageId,
    ...(input.threadFields || {}),
    budget,
    rawBudget,
    baselineCompactAt: baseline?.checkedAt || null,
  });

  const nativeResult = await nativeCompactChannelConnectorConversation({
    config: input.config,
    state: input.state,
    activeRunCancels: input.activeRunCancels,
    binding: input.binding,
    sessionKey: input.sessionKey,
    project: input.project,
    message: input.message,
    gatewayClientKey: input.gatewayClientKey,
  });
  const cooldownStartedAt = new Date().toISOString();
  const cooldownUntil = cooldownMs > 0
    ? new Date((isoTimestampMs(cooldownStartedAt) ?? Date.now()) + cooldownMs).toISOString()
    : null;

  if (nativeResult.attempted && nativeResult.ok) {
    const record: ChannelDaemonAutoCompactRecord = {
      checkedAt: cooldownStartedAt,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      projectId: input.project.id,
      agent: input.project.agent,
      model: input.project.model || null,
      workDir: input.project.workDir,
      messageId: input.messageId,
      action: "native",
      ok: true,
      reason: "threshold-reached",
      usageSource: budget.usageSource,
      usedTokens: rawBudget.usedTokens,
      effectiveUsedTokens: budget.usedTokens,
      contextWindow: budget.contextWindow,
      autoCompactTokenLimit: budget.autoCompactTokenLimit,
      remainingTokens: budget.remainingTokens,
      nativeAttempted: true,
      fallbackAttempted: false,
      beforeEntries: null,
      afterEntries: null,
      sessionsCleared: null,
      summaryPreview: autoCompactSummaryPreview(nativeResult.replyText),
      error: null,
      cooldownStartedAt: null,
      cooldownUntil: null,
    };
    pushAutoCompactRecord(input.state, record);
    writeJsonLine(autoCompactLogPath(input.config, input.binding), {
      checkedAt: cooldownStartedAt,
      eventKind: "agent.auto_compact.finished",
      adapter: input.adapter,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      ...(input.threadFields || {}),
      action: record.action,
      ok: record.ok,
      cooldownUntil: null,
      budget,
      rawBudget,
      baselineCompactAt: baseline?.checkedAt || null,
    });
    markRuntimeDirty(input.config, input.state);
    return record;
  }

  if (nativeResult.attempted && !nativeResult.fallbackAllowed) {
    const record: ChannelDaemonAutoCompactRecord = {
      checkedAt: cooldownStartedAt,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      projectId: input.project.id,
      agent: input.project.agent,
      model: input.project.model || null,
      workDir: input.project.workDir,
      messageId: input.messageId,
      action: "native",
      ok: false,
      reason: "native-blocked",
      usageSource: budget.usageSource,
      usedTokens: rawBudget.usedTokens,
      effectiveUsedTokens: budget.usedTokens,
      contextWindow: budget.contextWindow,
      autoCompactTokenLimit: budget.autoCompactTokenLimit,
      remainingTokens: budget.remainingTokens,
      nativeAttempted: true,
      fallbackAttempted: false,
      beforeEntries: null,
      afterEntries: null,
      sessionsCleared: null,
      summaryPreview: null,
      error: nativeResult.error || "Agent native compact blocked fallback.",
      cooldownStartedAt,
      cooldownUntil,
    };
    pushAutoCompactRecord(input.state, record);
    writeJsonLine(autoCompactLogPath(input.config, input.binding), {
      checkedAt: cooldownStartedAt,
      eventKind: "agent.auto_compact.finished",
      adapter: input.adapter,
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId: input.messageId,
      ...(input.threadFields || {}),
      action: record.action,
      ok: record.ok,
      error: record.error,
      cooldownUntil,
      budget,
      rawBudget,
      baselineCompactAt: baseline?.checkedAt || null,
    });
    markRuntimeDirty(input.config, input.state);
    return record;
  }

  const fallbackResult = await compactChannelConnectorConversation({
    config: input.config,
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    project: input.project,
    gatewayClientKey: input.gatewayClientKey,
  });
  const finishedAt = new Date().toISOString();
  const fallbackCooldownStartedAt = fallbackResult.ok ? null : cooldownStartedAt;
  const fallbackCooldownUntil = fallbackResult.ok ? null : cooldownUntil;
  const record: ChannelDaemonAutoCompactRecord = {
    checkedAt: finishedAt,
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    projectId: input.project.id,
    agent: input.project.agent,
    model: input.project.model || null,
    workDir: input.project.workDir,
    messageId: input.messageId,
    action: "fallback",
    ok: fallbackResult.ok,
    reason: fallbackResult.ok ? "threshold-reached" : "fallback-failed",
    usageSource: budget.usageSource,
    usedTokens: rawBudget.usedTokens,
    effectiveUsedTokens: budget.usedTokens,
    contextWindow: budget.contextWindow,
    autoCompactTokenLimit: budget.autoCompactTokenLimit,
    remainingTokens: budget.remainingTokens,
    nativeAttempted: nativeResult.attempted,
    fallbackAttempted: true,
    beforeEntries: fallbackResult.beforeEntries,
    afterEntries: fallbackResult.afterEntries,
    sessionsCleared: fallbackResult.sessionsCleared,
    summaryPreview: autoCompactSummaryPreview(fallbackResult.summaryText),
    error: fallbackResult.ok
      ? null
      : fallbackResult.error || nativeResult.error || "Studio compact fallback failed.",
    cooldownStartedAt: fallbackCooldownStartedAt,
    cooldownUntil: fallbackCooldownUntil,
  };
  pushAutoCompactRecord(input.state, record);
  writeJsonLine(autoCompactLogPath(input.config, input.binding), {
    checkedAt: finishedAt,
    eventKind: "agent.auto_compact.finished",
    adapter: input.adapter,
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
    messageId: input.messageId,
    ...(input.threadFields || {}),
    action: record.action,
    ok: record.ok,
    nativeAttempted: record.nativeAttempted,
    fallbackAttempted: record.fallbackAttempted,
    beforeEntries: record.beforeEntries,
    afterEntries: record.afterEntries,
    sessionsCleared: record.sessionsCleared,
    error: record.error,
    cooldownUntil: fallbackCooldownUntil,
    budget,
    rawBudget,
    baselineCompactAt: baseline?.checkedAt || null,
  });
  markRuntimeDirty(input.config, input.state);
  return record;
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
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  }, 8000);
  timer.unref();
  return () => clearInterval(timer);
}

function octoReadReceiptEnabled(binding: ChannelConnectorRuntimeBinding): boolean {
  return metadataBoolean(binding, [
    "octoReadReceipt",
    "octo_read_receipt",
    "readReceipt",
    "read_receipt",
  ], true);
}

function sendOctoReadReceiptForMessage(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorOctoTransportConfig | null;
  message: ChannelConnectorOctoInboundMessage;
  sessionKey: string;
}): void {
  if (!input.transport || !octoReadReceiptEnabled(input.binding)) return;
  const channelId = input.message.channelType === 1 ? input.message.fromUid : input.message.channelId;
  const messageIds = input.message.messageId ? [input.message.messageId] : [];
  void sendOctoReadReceipt(input.transport, {
    channelId,
    channelType: input.message.channelType,
    messageIds,
  }).then((result) => {
    writeJsonLine(input.config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.read_receipt",
      adapter: "octo",
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId: input.message.messageId,
      channelId,
      channelType: input.message.channelType,
      ok: result.ok,
      statusCode: result.statusCode,
      error: result.error,
      requestCount: result.requestCount,
    });
  }).catch((error) => {
    writeJsonLine(input.config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.read_receipt",
      adapter: "octo",
      bindingId: input.binding.id,
      sessionKey: input.sessionKey,
      messageId: input.message.messageId,
      channelId,
      channelType: input.message.channelType,
      ok: false,
      error: shortMessage(error),
    });
  });
}

function octoProgressTitle(event: ChannelConnectorAgentProgressEvent): string {
  if (event.type === "assistant") return "过程回复";
  if (event.type === "running") return "运行中";
  if (event.type === "reasoning") return "思考";
  if (event.type === "tool") return progressEventToolDirection(event) === "use" ? "工具调用" : "工具结果";
  if (event.type === "failed") return "失败";
  if (event.type === "error") return "错误";
  if (event.type === "completed") return "完成";
  return "进度";
}

function progressKindIcon(kind: FeishuProgressCardEntryKind | ChannelConnectorAgentProgressEvent["type"]): string {
  if (kind === "assistant") return "💬";
  if (kind === "thinking" || kind === "reasoning") return "💭";
  if (kind === "tool_use" || kind === "tool") return "🔧";
  if (kind === "tool_result") return "🟢";
  if (kind === "permission") return "🛂";
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

function progressEventToolDirection(event: ChannelConnectorAgentProgressEvent): "use" | "result" | null {
  if (event.type !== "tool") return null;
  const rawType = normalizeString(event.rawType).toLowerCase();
  const itemType = normalizeString(event.itemType).toLowerCase();
  if (
    rawType.includes("tool_use")
    || rawType.includes("tool-use")
    || itemType.includes("tool_use")
    || itemType.includes("tool-use")
    || rawType === "control_request"
    || rawType.includes("requestapproval")
    || rawType.endsWith(".started")
    || rawType.endsWith("/started")
    || rawType === "item.started"
  ) {
    return "use";
  }
  if (
    rawType.includes("tool_result")
    || rawType.includes("tool-result")
    || itemType.includes("tool_result")
    || itemType.includes("tool-result")
    || rawType === "user"
    || rawType.endsWith(".completed")
    || rawType.endsWith("/completed")
    || rawType === "item.completed"
  ) {
    return "result";
  }
  return "result";
}

function renderPlainProgressMessage(input: {
  icon: string;
  title: string;
  body: string;
  meta?: string;
}): string {
  const heading = [
    `${input.icon} ${input.title}`,
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
      toolName: event.toolName,
      toolCallId: event.toolCallId,
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
  const sdkConnected = status?.state === "connected";
  const lockHeld = !group.lockAcquired && !group.client && Boolean(group.lockOwnerPid);
  const ingressUnverifiedAfterMs = feishuIngressUnverifiedAfterMs(group);
  const verifiedIngressSilentRenewAfterMs = feishuVerifiedIngressSilentRenewMs(group);
  const lastIngressActivityAt = latestFeishuVerifiedIngressLeaseAt(group);
  const lastIngressActivityMs = lastIngressActivityAt ? Date.parse(lastIngressActivityAt) : NaN;
  const ingressSilentForMs = sdkConnected && Number.isFinite(lastIngressActivityMs)
    ? Math.max(0, Date.now() - lastIngressActivityMs)
    : 0;
  const ingressVerified = group.lifecycleRawEventFrames > 0
    || group.lifecycleDispatcherCallbacks > 0
    || group.lifecycleReceivedMessages > 0;
  const transportVerified = group.receivedPongs > 0;
  const pongTimeoutState = feishuPongTimeoutState(group);
  const transportStaleState = feishuTransportStaleState(group);
  const connected = sdkConnected && !pongTimeoutState.overdue && !transportStaleState.stale;
  let ingressState: ChannelDaemonFeishuConnectionState["ingressState"];
  if (lockHeld) {
    ingressState = "lock-held";
  } else if (!status && !group.client) {
    ingressState = "closed";
  } else if (!sdkConnected || pongTimeoutState.overdue || transportStaleState.stale) {
    ingressState = "disconnected";
  } else if (ingressVerified && verifiedIngressSilentRenewAfterMs > 0 && ingressSilentForMs >= verifiedIngressSilentRenewAfterMs) {
    ingressState = "stale";
  } else if (ingressVerified) {
    ingressState = "receiving";
  } else if (ingressUnverifiedAfterMs > 0 && ingressSilentForMs >= ingressUnverifiedAfterMs) {
    ingressState = "silent";
  } else {
    ingressState = "warming";
  }
  return {
    key: group.key,
    appId: group.appId,
    accountId: group.accountId,
    apiUrl: group.apiUrl,
    bindingIds: group.refs.map((ref) => ref.binding.id),
    connected,
    state: status?.state || (lockHeld ? "lock-held" : "closed"),
    lastError: group.lastError,
    lastConnectedAt: group.lastConnectedAt,
    lastDisconnectedAt: group.lastDisconnectedAt,
    lastReceivedAt: group.lastReceivedAt,
    lastUnhealthyAt: group.lastUnhealthyAt,
    ingressVerified,
    ingressState,
    ingressSilentForMs,
    transportVerified,
    pongWaitingForMs: pongTimeoutState.waitingForMs,
    pongOverdue: pongTimeoutState.overdue,
    ingressUnverifiedAfterMs,
    ingressUnverifiedRenewMax: feishuIngressUnverifiedRenewMax(group),
    ingressUnverifiedRenewals: group.ingressUnverifiedRenewals,
    ingressUnverifiedRenewDelayMs: feishuIngressUnverifiedRenewDelayMs(group),
    lastIngressUnverifiedRenewAt: group.lastIngressUnverifiedRenewAt,
    verifiedIngressSilentRenewAfterMs,
    verifiedIngressSilentRenewals: group.verifiedIngressSilentRenewals,
    lastVerifiedIngressSilentRenewAt: group.lastVerifiedIngressSilentRenewAt,
    dispatcherVerificationConfigured: Boolean(feishuDispatcherVerificationToken(group)),
    dispatcherEncryptConfigured: Boolean(feishuDispatcherEncryptKey(group)),
    dispatcherCallbacks: group.dispatcherCallbacks,
    lastDispatcherCallbackAt: group.lastDispatcherCallbackAt,
    lastDispatcherEventType: group.lastDispatcherEventType,
    lifecycleDispatcherCallbacks: group.lifecycleDispatcherCallbacks,
    lifecycleLastDispatcherCallbackAt: group.lifecycleLastDispatcherCallbackAt,
    rawEventFrames: group.rawEventFrames,
    lifecycleRawEventFrames: group.lifecycleRawEventFrames,
    lastRawEventFrameAt: group.lastRawEventFrameAt,
    lastRawEventFrameType: group.lastRawEventFrameType,
    rawEventHandlerErrors: group.rawEventHandlerErrors,
    lastRawEventHandlerError: group.lastRawEventHandlerError,
    lockAcquired: group.lockAcquired,
    lockOwnerPid: group.lockOwnerPid,
    lockPath: group.lockPath,
    sdkConnected,
    pingTimeoutSeconds: feishuPingTimeoutSeconds(group),
    pongTimeoutMs: feishuPongTimeoutMs(group),
    pingIntervalMs: group.pingIntervalMs,
    transportStaleForMs: transportStaleState.staleForMs,
    transportStaleAfterMs: transportStaleState.staleAfterMs,
    transportStale: transportStaleState.stale,
    sentPings: group.sentPings,
    lastPingAt: group.lastPingAt,
    receivedPongs: group.receivedPongs,
    lastPongAt: group.lastPongAt,
    controlFrames: group.controlFrames,
    lastControlFrameAt: group.lastControlFrameAt,
    lastControlFrameType: group.lastControlFrameType,
    reconnectingRecycleAfterMs: feishuReconnectingRecycleMs(group),
    connectedIdleRenewAfterMs: feishuConnectedIdleRenewMs(group),
    zeroInboundRenewAfterMs: feishuZeroInboundRenewMs(group),
    zeroInboundRenewMax: feishuZeroInboundRenewMax(group),
    zeroInboundRenewals: group.zeroInboundRenewals,
    watchdogRestartAfterMs: feishuWatchdogRestartMs(group),
    lifecycleReceivedMessages: group.lifecycleReceivedMessages,
    lifecycleLastReceivedAt: group.lifecycleLastReceivedAt,
    suppressZeroInboundRenewal: group.suppressZeroInboundRenewal,
    lastReconnectingAt: group.lastReconnectingAt,
    reconnectingRecycles: group.reconnectingRecycles,
    lastReconnectingRecycleAt: group.lastReconnectingRecycleAt,
    lastReconnectingRecycleReason: group.lastReconnectingRecycleReason,
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
  markRuntimeDirty(config, state);
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

function latestFeishuVerifiedIngressLeaseAt(group: ChannelDaemonFeishuGroup): string | null {
  const candidates = [
    group.lifecycleLastReceivedAt,
    group.lifecycleLastDispatcherCallbackAt,
    group.lastRawEventFrameAt,
    group.lastVerifiedIngressSilentRenewAt,
    group.lastConnectedAt,
  ]
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

function feishuGroupLockRoot(): string {
  return path.join(os.homedir(), ".config", "openclaw-studio", "channel-connectors", "feishu-ws-global-locks");
}

function feishuGroupLockPath(_config: ChannelConnectorsDaemonRuntimeConfig, group: ChannelDaemonFeishuGroup): string {
  return path.join(feishuGroupLockRoot(), `${group.key}.lock`);
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function readFeishuLockOwner(lockPath: string): { pid: number | null; startedAt: string | null } {
  try {
    const raw = fs.readFileSync(path.join(lockPath, "owner.json"), "utf8");
    const parsed = JSON.parse(raw) as { pid?: unknown; startedAt?: unknown };
    const pid = typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
    const startedAt = typeof parsed.startedAt === "string" ? parsed.startedAt : null;
    return { pid, startedAt };
  } catch {
    return { pid: null, startedAt: null };
  }
}

function acquireFeishuGroupLock(
  config: ChannelConnectorsDaemonRuntimeConfig,
  group: ChannelDaemonFeishuGroup,
): boolean {
  const lockPath = feishuGroupLockPath(config, group);
  ensureDir(path.dirname(lockPath));
  group.lockPath = lockPath;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockPath);
      writeJsonFileAtomic(path.join(lockPath, "owner.json"), {
        pid: process.pid,
        groupKey: group.key,
        appId: group.appId,
        bindingIds: group.refs.map((ref) => ref.binding.id),
        runtimePath: config.paths.runtime,
        statePath: config.paths.state,
        startedAt: new Date().toISOString(),
      });
      group.lockAcquired = true;
      group.lockOwnerPid = process.pid;
      group.lastError = null;
      return true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        group.lockAcquired = false;
        group.lockOwnerPid = null;
        group.lastError = shortMessage(error);
        return false;
      }
      const owner = readFeishuLockOwner(lockPath);
      if (owner.pid === process.pid) {
        group.lockAcquired = true;
        group.lockOwnerPid = process.pid;
        return true;
      }
      if (owner.pid && processIsAlive(owner.pid)) {
        group.lockAcquired = false;
        group.lockOwnerPid = owner.pid;
        group.lastError = `feishu_ws_lock_held_by_pid_${owner.pid}`;
        return false;
      }
      try {
        fs.rmSync(lockPath, { recursive: true, force: true });
      } catch (removeError) {
        group.lockAcquired = false;
        group.lockOwnerPid = owner.pid;
        group.lastError = `feishu_ws_stale_lock_remove_failed:${shortMessage(removeError)}`;
        return false;
      }
    }
  }

  group.lockAcquired = false;
  group.lockOwnerPid = null;
  group.lastError = "feishu_ws_lock_acquire_failed";
  return false;
}

function releaseFeishuGroupLock(config: ChannelConnectorsDaemonRuntimeConfig, group: ChannelDaemonFeishuGroup): void {
  if (!group.lockAcquired || !group.lockPath) return;
  const owner = readFeishuLockOwner(group.lockPath);
  if (owner.pid && owner.pid !== process.pid) {
    group.lockAcquired = false;
    group.lockOwnerPid = owner.pid;
    return;
  }
  try {
    fs.rmSync(group.lockPath, { recursive: true, force: true });
  } catch (error) {
    appendLog(config.paths.log, "Feishu WebSocket lock release failed", {
      key: group.key,
      lockPath: group.lockPath,
      error: shortMessage(error),
    });
  } finally {
    group.lockAcquired = false;
    group.lockOwnerPid = null;
  }
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

function feishuTimingLogFields(parsed: ChannelConnectorFeishuParsedWebhook): {
  eventCreateTimeMs: number | null;
  messageCreateTimeMs: number | null;
} {
  return {
    eventCreateTimeMs: parsed.eventCreateTimeMs,
    messageCreateTimeMs: parsed.messageCreateTimeMs,
  };
}

function feishuParsedEventTimeMs(parsed: ChannelConnectorFeishuParsedWebhook): number | null {
  return parsed.messageCreateTimeMs || parsed.eventCreateTimeMs || null;
}

function feishuStaleEventState(
  binding: ChannelConnectorRuntimeBinding,
  parsed: ChannelConnectorFeishuParsedWebhook,
  nowMs = Date.now(),
): {
  stale: boolean;
  eventTimeMs: number | null;
  eventAgeMs: number | null;
  maxAgeMs: number;
} {
  const maxAgeMs = feishuStaleEventMaxAgeMs(binding);
  const eventTimeMs = feishuParsedEventTimeMs(parsed);
  if (maxAgeMs <= 0 || !eventTimeMs) {
    return { stale: false, eventTimeMs, eventAgeMs: null, maxAgeMs };
  }
  const eventAgeMs = Math.max(0, nowMs - eventTimeMs);
  return {
    stale: eventAgeMs > maxAgeMs,
    eventTimeMs,
    eventAgeMs,
    maxAgeMs,
  };
}

function feishuWatermarkKey(bindingId: string, sessionKey: string): string {
  return `feishu:watermark:${bindingId}:${sessionKey}`;
}

function feishuConversationWatermarkMs(
  seenMessages: Map<string, number>,
  binding: ChannelConnectorRuntimeBinding,
  sessionKey: string,
): number | null {
  const value = seenMessages.get(feishuWatermarkKey(binding.id, sessionKey));
  return Number.isFinite(value) && value ? value : null;
}

function feishuOutOfOrderEventState(input: {
  seenMessages: Map<string, number>;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  parsed: ChannelConnectorFeishuParsedWebhook;
}): {
  outOfOrder: boolean;
  eventTimeMs: number | null;
  watermarkMs: number | null;
} {
  const eventTimeMs = feishuParsedEventTimeMs(input.parsed);
  const watermarkMs = feishuConversationWatermarkMs(input.seenMessages, input.binding, input.sessionKey);
  return {
    outOfOrder: Boolean(eventTimeMs && watermarkMs && eventTimeMs < watermarkMs),
    eventTimeMs,
    watermarkMs,
  };
}

function updateFeishuConversationWatermark(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  seenMessages: Map<string, number>;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  parsed: ChannelConnectorFeishuParsedWebhook;
}): void {
  const eventTimeMs = feishuParsedEventTimeMs(input.parsed);
  if (!eventTimeMs) return;
  const key = feishuWatermarkKey(input.binding.id, input.sessionKey);
  const previous = input.seenMessages.get(key);
  if (typeof previous === "number" && Number.isFinite(previous) && previous >= eventTimeMs) return;
  input.seenMessages.set(key, eventTimeMs);
  saveFeishuSeenMessages(input.config, input.seenMessages);
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

const OCTO_THREAD_CHANNEL_SEPARATOR = "____";

function octoSyncChannelId(message: ChannelConnectorOctoInboundMessage): string {
  return message.channelType === 1 ? normalizeString(message.fromUid) : normalizeString(message.channelId);
}

function octoParentGroupNo(channelId: string): string {
  const normalized = normalizeString(channelId);
  if (!normalized) return "";
  const [groupNo] = normalized.split(OCTO_THREAD_CHANNEL_SEPARATOR);
  return normalizeString(groupNo) || normalized;
}

function normalizeOctoGroupMember(value: unknown): ChannelConnectorOctoGroupMember | null {
  if (!isRecord(value)) return null;
  const uid = normalizeString(value.uid)
    || normalizeString(value.user_id)
    || normalizeString(value.userId)
    || normalizeString(value.id);
  const name = normalizeString(value.name)
    || normalizeString(value.display_name)
    || normalizeString(value.displayName)
    || normalizeString(value.nickname)
    || uid;
  const robot = typeof value.robot === "boolean" || typeof value.robot === "number" ? value.robot : null;
  const role = typeof value.role === "string" || typeof value.role === "number" ? value.role : null;
  return uid ? { uid, name, robot, role } : null;
}

function normalizeOctoGroupMembers(value: unknown, limit: number): ChannelConnectorOctoGroupMember[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.members)
      ? value.members
      : isRecord(value) && Array.isArray(value.data)
        ? value.data
        : [];
  const output: ChannelConnectorOctoGroupMember[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const member = normalizeOctoGroupMember(item);
    if (!member || seen.has(member.uid)) continue;
    seen.add(member.uid);
    output.push(member);
    if (output.length >= limit) break;
  }
  return output;
}

function mergeOctoGroupMembers(
  current: ChannelConnectorOctoGroupMember[] | undefined,
  incoming: ChannelConnectorOctoGroupMember[],
): ChannelConnectorOctoGroupMember[] {
  if (!incoming.length) return current || [];
  const output: ChannelConnectorOctoGroupMember[] = [];
  const seen = new Set<string>();
  for (const member of [...(current || []), ...incoming]) {
    const normalized = normalizeOctoGroupMember(member);
    if (!normalized || seen.has(normalized.uid)) continue;
    seen.add(normalized.uid);
    output.push(normalized);
  }
  return output;
}

async function loadOctoGroupMembers(input: {
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorOctoTransportConfig | null;
  message: ChannelConnectorOctoInboundMessage;
}): Promise<{
  members: ChannelConnectorOctoGroupMember[];
  groupNo: string | null;
  error: string | null;
  attempted: boolean;
  itemCount: number | null;
}> {
  if (!isOctoGroupChannel(input.message.channelType)) {
    return { members: [], groupNo: null, error: null, attempted: false, itemCount: null };
  }
  if (!metadataBoolean(input.binding, [
    "enableOctoMemberPull",
    "enable_octo_member_pull",
    "pullOctoMembers",
    "pull_octo_members",
  ], true)) {
    return { members: [], groupNo: null, error: null, attempted: false, itemCount: null };
  }
  const groupNo = octoParentGroupNo(input.message.channelId);
  if (!groupNo) {
    return { members: [], groupNo: null, error: "octo_group_no_missing", attempted: true, itemCount: null };
  }
  if (!input.transport) {
    return { members: [], groupNo, error: "octo_transport_config_missing", attempted: true, itemCount: null };
  }
  const limit = Math.max(1, Math.min(500, Math.floor(metadataNumber(input.binding, [
    "octoMemberMaxEntries",
    "octo_member_max_entries",
    "memberMaxEntries",
    "member_max_entries",
  ], 100))));
  const result = await listOctoGroupMembers(input.transport, groupNo);
  const members = result.ok ? normalizeOctoGroupMembers(result.data, limit) : [];
  return {
    members,
    groupNo,
    error: result.ok ? null : result.error || "octo_member_pull_failed",
    attempted: result.attempted,
    itemCount: result.itemCount ?? null,
  };
}

async function runOctoManagementCommand(
  transport: ChannelConnectorOctoTransportConfig | null,
  input: ChannelConnectorOctoManagementRequest,
): Promise<ChannelConnectorOctoManagementResult> {
  if (!transport) {
    return {
      ok: false,
      replyText: "Octo Bot API 未配置，无法执行平台管理命令。",
      error: "octo_transport_config_missing",
    };
  }
  let result: ChannelConnectorOctoTransportResult;
  switch (input.action) {
    case "list-groups":
      result = await listOctoGroups(transport);
      break;
    case "group-info":
      result = await getOctoGroupInfo(transport, normalizeString(input.groupNo));
      break;
    case "group-members":
      result = await listOctoGroupMembers(transport, normalizeString(input.groupNo));
      break;
    case "group-md-read":
      result = await readOctoGroupMd(transport, normalizeString(input.groupNo));
      break;
    case "group-md-update":
      result = await updateOctoGroupMd(transport, {
        groupNo: normalizeString(input.groupNo),
        content: normalizeString(input.content),
      });
      break;
    case "search-members":
      result = await searchOctoSpaceMembers(transport, {
        keyword: input.keyword || null,
        limit: input.limit || 30,
      });
      break;
    case "create-group":
      result = await createOctoGroup(transport, {
        name: input.name || null,
        members: input.members || [],
        creator: normalizeString(input.creator),
      });
      break;
    case "update-group":
      result = await updateOctoGroupInfo(transport, {
        groupNo: normalizeString(input.groupNo),
        name: input.name || null,
        notice: input.notice || null,
      });
      break;
    case "add-members":
      result = await addOctoGroupMembers(transport, {
        groupNo: normalizeString(input.groupNo),
        members: input.members || [],
      });
      break;
    case "remove-members":
      result = await removeOctoGroupMembers(transport, {
        groupNo: normalizeString(input.groupNo),
        members: input.members || [],
      });
      break;
    case "list-threads":
      result = await listOctoThreads(transport, normalizeString(input.groupNo));
      break;
    case "thread-info":
      result = await getOctoThreadInfo(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
      });
      break;
    case "thread-members":
      result = await listOctoThreadMembers(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
      });
      break;
    case "thread-md-read":
      result = await readOctoThreadMd(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
      });
      break;
    case "thread-md-update":
      result = await updateOctoThreadMd(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
        content: normalizeString(input.content),
      });
      break;
    case "voice-context-read":
      result = await readOctoVoiceContext(transport);
      break;
    case "voice-context-update":
      result = await updateOctoVoiceContext(transport, {
        content: normalizeString(input.content),
      });
      break;
    case "voice-context-delete":
      result = await deleteOctoVoiceContext(transport);
      break;
    case "history":
      result = await syncOctoMessages(transport, {
        channelId: normalizeString(input.channelId) || normalizeString(input.groupNo),
        channelType: input.channelType || input.message.channelType,
        limit: input.limit || 20,
        endMessageSeq: input.endMessageSeq || 0,
        pullMode: 1,
      });
      break;
    case "create-thread":
      result = await createOctoThread(transport, {
        groupNo: normalizeString(input.groupNo),
        name: normalizeString(input.name),
      });
      break;
    case "delete-thread":
      result = await deleteOctoThread(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
      });
      break;
    case "join-thread":
      result = await joinOctoThread(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
      });
      break;
    case "leave-thread":
      result = await leaveOctoThread(transport, {
        groupNo: normalizeString(input.groupNo),
        shortId: normalizeString(input.shortId),
      });
      break;
  }
  return {
    ok: result.ok === true,
    replyText: formatChannelConnectorOctoManagementReply({
      action: input.action,
      result,
      groupNo: input.groupNo || null,
      shortId: input.shortId || null,
      channelId: input.channelId || null,
      keyword: input.keyword || null,
      name: input.name || null,
      content: input.content || null,
    }),
    error: result.error || null,
  };
}

function octoSyncedMessageText(payload: unknown): string {
  if (typeof payload === "string") return normalizeString(payload);
  if (!isRecord(payload)) return "";
  const content = payload.content;
  if (typeof content === "string") return normalizeString(content);
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return normalizeString(item);
        if (!isRecord(item)) return "";
        return normalizeString(item.text) || normalizeString(item.content) || normalizeString(item.name);
      })
      .filter(Boolean)
      .join("");
  }
  return normalizeString(payload.plain) || normalizeString(payload.name);
}

function octoSyncedMessagesFromData(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  return Array.isArray(value.messages) ? value.messages.filter(isRecord) : [];
}

function octoSyncedMessageSeq(message: Record<string, unknown>): number | null {
  const seq = Number(message.message_seq ?? message.messageSeq);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

function octoMemberNameByUid(members: readonly ChannelConnectorOctoGroupMember[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const member of members) {
    const uid = normalizeString(member.uid);
    const name = normalizeString(member.name);
    if (uid && name) map.set(uid, name);
  }
  return map;
}

function octoSyncedSenderLabel(uid: string, nameByUid: Map<string, string>): string {
  const name = nameByUid.get(uid);
  return name ? `${name} (${uid})` : uid || "unknown";
}

function renderOctoSyncedHistoryContext(input: {
  data: unknown;
  currentMessageId: string;
  currentMessageSeq?: number | null;
  botUid?: string | null;
  members?: readonly ChannelConnectorOctoGroupMember[] | null;
  limit: number;
}): string | null {
  const botUid = normalizeString(input.botUid);
  const nameByUid = octoMemberNameByUid(input.members || []);
  const syncedMessages = octoSyncedMessagesFromData(input.data)
    .filter((message) => normalizeString(message.message_id) !== input.currentMessageId)
    .sort((a, b) => (octoSyncedMessageSeq(a) || 0) - (octoSyncedMessageSeq(b) || 0));
  const latestBotSeq = botUid
    ? syncedMessages.reduce((max, message) => {
      const sender = normalizeString(message.from_uid) || normalizeString(message.fromUid);
      const seq = octoSyncedMessageSeq(message);
      return sender === botUid && seq ? Math.max(max, seq) : max;
    }, 0)
    : 0;
  const currentSeq = typeof input.currentMessageSeq === "number" && Number.isFinite(input.currentMessageSeq)
    ? input.currentMessageSeq
    : null;
  const contextEntries = syncedMessages
    .filter((message) => {
      const sender = normalizeString(message.from_uid) || normalizeString(message.fromUid);
      if (botUid && sender === botUid) return false;
      const text = octoSyncedMessageText(message.payload);
      if (!text) return false;
      const seq = octoSyncedMessageSeq(message);
      if (currentSeq && seq && seq >= currentSeq) return false;
      return true;
    })
    .slice(-input.limit)
    .map((message) => {
      const sender = normalizeString(message.from_uid) || normalizeString(message.fromUid) || "unknown";
      return {
        sender: octoSyncedSenderLabel(sender, nameByUid),
        body: octoSyncedMessageText(message.payload),
        seq: octoSyncedMessageSeq(message),
      };
    });
  if (!contextEntries.length) return null;
  const answeredEntries = latestBotSeq > 0
    ? contextEntries.filter((entry) => (entry.seq || 0) <= latestBotSeq)
    : [];
  const newEntries = latestBotSeq > 0
    ? contextEntries.filter((entry) => (entry.seq || 0) > latestBotSeq)
    : contextEntries;
  const formatEntries = (entries: typeof contextEntries) => JSON.stringify(entries.map((entry) => ({
    sender: entry.sender,
    body: entry.body,
    ...(entry.seq ? { messageSeq: entry.seq } : {}),
  })), null, 2);
  const blocks: string[] = [];
  if (answeredEntries.length) {
    blocks.push([
      "[Previous context - already answered, do NOT re-answer]",
      "```json",
      formatEntries(answeredEntries),
      "```",
    ].join("\n"));
  }
  if (newEntries.length) {
    blocks.push([
      "[Chat messages since your last reply - context only, do NOT re-answer questions from this history]",
      "```json",
      formatEntries(newEntries),
      "```",
    ].join("\n"));
  }
  return [
    "[Octo Bot API recent channel history]",
    `Cutoff: latest bot reply seq ${latestBotSeq || "unknown"}.`,
    ...blocks,
    "[Current message follows later - respond to that only]",
  ].join("\n");
}

async function loadOctoSyncedHistoryContext(input: {
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorOctoTransportConfig | null;
  message: ChannelConnectorOctoInboundMessage;
}): Promise<{
  context: string | null;
  error: string | null;
  attempted: boolean;
  itemCount: number | null;
  includedCount: number;
}> {
  if (!metadataBoolean(input.binding, [
    "enableOctoHistorySync",
    "enable_octo_history_sync",
    "syncOctoHistory",
    "sync_octo_history",
  ], true)) {
    return { context: null, error: null, attempted: false, itemCount: null, includedCount: 0 };
  }
  const limit = Math.max(0, Math.min(20, Math.floor(metadataNumber(input.binding, [
    "octoHistorySyncLimit",
    "octo_history_sync_limit",
    "historySyncLimit",
    "history_sync_limit",
  ], 6))));
  if (limit <= 0) {
    return { context: null, error: null, attempted: false, itemCount: null, includedCount: 0 };
  }
  const channelId = octoSyncChannelId(input.message);
  if (!channelId) {
    return { context: null, error: "octo_channel_id_missing", attempted: true, itemCount: null, includedCount: 0 };
  }
  if (!input.transport) {
    return { context: null, error: "octo_transport_config_missing", attempted: true, itemCount: null, includedCount: 0 };
  }
  const messageSeq = typeof input.message.messageSeq === "number" && Number.isFinite(input.message.messageSeq)
    ? input.message.messageSeq
    : null;
  const result = await syncOctoMessages(input.transport, {
    channelId,
    channelType: input.message.channelType,
    limit,
    endMessageSeq: messageSeq && messageSeq > 1 ? messageSeq - 1 : 0,
    pullMode: 1,
  });
  if (!result.ok) {
    return {
      context: null,
      error: result.error || "octo_history_sync_failed",
      attempted: result.attempted,
      itemCount: result.itemCount ?? null,
      includedCount: 0,
    };
  }
  const context = renderOctoSyncedHistoryContext({
    data: result.data,
    currentMessageId: input.message.messageId,
    currentMessageSeq: input.message.messageSeq || null,
    botUid: input.binding.botId || null,
    members: input.message.members || [],
    limit,
  });
  const botUid = normalizeString(input.binding.botId);
  const currentSeq = typeof input.message.messageSeq === "number" && Number.isFinite(input.message.messageSeq)
    ? input.message.messageSeq
    : null;
  const includedCount = context
    ? octoSyncedMessagesFromData(result.data)
      .filter((message) => {
        if (normalizeString(message.message_id) === input.message.messageId) return false;
        const sender = normalizeString(message.from_uid) || normalizeString(message.fromUid);
        if (botUid && sender === botUid) return false;
        if (!octoSyncedMessageText(message.payload)) return false;
        const seq = octoSyncedMessageSeq(message);
        if (currentSeq && seq && seq >= currentSeq) return false;
        return true;
      })
      .slice(-limit)
      .length
    : 0;
  return {
    context,
    error: null,
    attempted: result.attempted,
    itemCount: result.itemCount ?? null,
    includedCount,
  };
}

function octoThreadShortIdFromChannelId(channelId: string): string {
  const normalized = normalizeString(channelId);
  if (!normalized) return "";
  const [, shortId] = normalized.split(OCTO_THREAD_CHANNEL_SEPARATOR);
  return normalizeString(shortId);
}

function octoMdContentFromData(value: unknown): string {
  if (typeof value === "string") return normalizeString(value);
  if (!isRecord(value)) return "";
  return normalizeString(value.content)
    || normalizeString(value.markdown)
    || normalizeString(value.md);
}

function renderOctoMdContext(input: {
  kind: "GROUP.md" | "THREAD.md";
  groupNo: string;
  shortId?: string | null;
  data: unknown;
  maxChars: number;
}): string | null {
  const content = octoMdContentFromData(input.data);
  if (!content) return null;
  const trimmed = content.length > input.maxChars
    ? `${content.slice(0, Math.max(0, input.maxChars))}\n\n[Studio truncated Octo ${input.kind} context]`
    : content;
  const record = isRecord(input.data) ? input.data : {};
  const version = normalizeString(record.version);
  return [
    `[Octo ${input.kind}]`,
    input.shortId
      ? `Scope: group=${input.groupNo} thread=${input.shortId}${version ? ` version=${version}` : ""}.`
      : `Scope: group=${input.groupNo}${version ? ` version=${version}` : ""}.`,
    "These are native Octo channel instructions. Follow them unless they conflict with higher-priority Studio/system/developer instructions.",
    "```md",
    trimmed,
    "```",
  ].join("\n");
}

async function loadOctoMdContext(input: {
  binding: ChannelConnectorRuntimeBinding;
  transport: ChannelConnectorOctoTransportConfig | null;
  message: ChannelConnectorOctoInboundMessage;
}): Promise<{
  context: string | null;
  kind: "group" | "thread" | null;
  groupNo: string | null;
  shortId: string | null;
  error: string | null;
  attempted: boolean;
}> {
  if (!isOctoGroupChannel(input.message.channelType)) {
    return { context: null, kind: null, groupNo: null, shortId: null, error: null, attempted: false };
  }
  if (!metadataBoolean(input.binding, [
    "enableOctoMdContext",
    "enable_octo_md_context",
    "octoMdContext",
    "octo_md_context",
  ], true)) {
    return { context: null, kind: null, groupNo: null, shortId: null, error: null, attempted: false };
  }
  const groupNo = octoParentGroupNo(input.message.channelId);
  if (!groupNo) {
    return { context: null, kind: null, groupNo: null, shortId: null, error: "octo_group_no_missing", attempted: true };
  }
  if (!input.transport) {
    return { context: null, kind: null, groupNo, shortId: null, error: "octo_transport_config_missing", attempted: true };
  }
  const maxChars = Math.max(1000, Math.min(20_000, Math.floor(metadataNumber(input.binding, [
    "octoMdContextMaxChars",
    "octo_md_context_max_chars",
    "mdContextMaxChars",
    "md_context_max_chars",
  ], 8000))));
  if (input.message.channelType === 5) {
    const shortId = octoThreadShortIdFromChannelId(input.message.channelId);
    if (!shortId) {
      return { context: null, kind: "thread", groupNo, shortId: null, error: "octo_thread_short_id_missing", attempted: true };
    }
    const result = await readOctoThreadMd(input.transport, { groupNo, shortId });
    return {
      context: result.ok ? renderOctoMdContext({
        kind: "THREAD.md",
        groupNo,
        shortId,
        data: result.data,
        maxChars,
      }) : null,
      kind: "thread",
      groupNo,
      shortId,
      error: result.ok ? null : result.error || "octo_thread_md_pull_failed",
      attempted: result.attempted,
    };
  }
  const result = await readOctoGroupMd(input.transport, groupNo);
  return {
    context: result.ok ? renderOctoMdContext({
      kind: "GROUP.md",
      groupNo,
      data: result.data,
      maxChars,
    }) : null,
    kind: "group",
    groupNo,
    shortId: null,
    error: result.ok ? null : result.error || "octo_group_md_pull_failed",
    attempted: result.attempted,
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

function octoAttachmentFilePath(attachment: ChannelConnectorInboundAttachment): string {
  const record = attachment as unknown as Record<string, unknown>;
  for (const key of [
    "filePath",
    "file_path",
    "downloadPath",
    "download_path",
    "objectKey",
    "object_key",
    "storageKey",
    "storage_key",
  ]) {
    const candidate = normalizeString(record[key]);
    if (candidate && !/^https?:\/\//i.test(candidate)) return candidate;
  }
  const key = normalizeString(attachment.key);
  return key && !/^https?:\/\//i.test(key) && key.includes("/") ? key : "";
}

async function resolveOctoAttachmentStagingUrl(input: {
  transport: ChannelConnectorOctoTransportConfig | null;
  attachment: ChannelConnectorInboundAttachment;
}): Promise<{
  url: string | null;
  error: string | null;
  attemptedDownloadUrl: boolean;
}> {
  const directUrl = normalizeString(input.attachment.url);
  if (directUrl) return { url: directUrl, error: null, attemptedDownloadUrl: false };
  const filePath = octoAttachmentFilePath(input.attachment);
  if (!filePath) return { url: null, error: "octo_attachment_url_missing", attemptedDownloadUrl: false };
  if (!input.transport) return { url: null, error: "octo_transport_config_missing", attemptedDownloadUrl: true };
  const result = await getOctoFileDownloadUrl(input.transport, {
    filePath,
    fileName: normalizeString(input.attachment.fileName) || null,
  });
  const mediaUrl = normalizeString(result.mediaUrl);
  return {
    url: result.ok && mediaUrl ? mediaUrl : null,
    error: result.ok && mediaUrl ? null : result.error || "octo_file_download_url_failed",
    attemptedDownloadUrl: true,
  };
}

async function stageOctoMessageAttachments(input: {
  transport: ChannelConnectorOctoTransportConfig | null;
  message: ChannelConnectorOctoInboundMessage;
  rootDir: string;
  maxBytes: number;
  allowPrivateNetwork: boolean;
}): Promise<{
  message: ChannelConnectorOctoInboundMessage;
  stagedCount: number;
  failedCount: number;
  downloadUrlAttemptCount: number;
  downloadUrlResolvedCount: number;
  localPaths: string[];
}> {
  const attachments = input.message.attachments || [];
  if (!attachments.length) {
    return {
      message: input.message,
      stagedCount: 0,
      failedCount: 0,
      downloadUrlAttemptCount: 0,
      downloadUrlResolvedCount: 0,
      localPaths: [],
    };
  }

  const stagedAttachments: ChannelConnectorInboundAttachment[] = [];
  const localPaths: string[] = [];
  let stagedCount = 0;
  let failedCount = 0;
  let downloadUrlAttemptCount = 0;
  let downloadUrlResolvedCount = 0;
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const existingLocalPath = normalizeString(attachment.localPath);
    if (existingLocalPath) {
      localPaths.push(existingLocalPath);
      stagedAttachments.push(attachment);
      continue;
    }
    const resolved = await resolveOctoAttachmentStagingUrl({
      transport: input.transport,
      attachment,
    });
    if (resolved.attemptedDownloadUrl) downloadUrlAttemptCount += 1;
    if (resolved.attemptedDownloadUrl && resolved.url) downloadUrlResolvedCount += 1;
    const url = normalizeString(resolved.url);
    if (!url) {
      failedCount += 1;
      stagedAttachments.push({
        ...attachment,
        stagingError: resolved.error || "octo_attachment_url_missing",
      });
      continue;
    }
    const staged = await stageChannelConnectorAttachmentUrl({
      attachment: {
        ...attachment,
        url,
      },
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
    downloadUrlAttemptCount,
    downloadUrlResolvedCount,
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

function feishuPermissionButton(input: {
  label: string;
  type: "primary" | "danger" | "default";
  command: "/approve" | "/deny" | "/allow-all";
  actionId: string;
}): Record<string, unknown> {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: input.label,
    },
    type: input.type,
    value: {
      action: `act:${input.command}`,
      command: input.command,
      surface_action_kind: "act",
      surface_action_id: input.actionId,
      surface_section_id: "mode",
      surface_view_id: "mode",
    },
  };
}

function feishuAskUserQuestionButton(input: {
  label: string;
  requestId: string;
  optionIndex: number;
}): Record<string, unknown> {
  const optionNumber = input.optionIndex + 1;
  const answer = `askq:${input.requestId}:${optionNumber}`;
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: shortMessage(input.label, 48),
    },
    type: input.optionIndex === 0 ? "primary" : "default",
    value: {
      action: `act:${answer}`,
      command: answer,
      surface_action_kind: "act",
      surface_action_id: `ask-user-question-${optionNumber}`,
      surface_section_id: "question",
      surface_view_id: "question",
    },
  };
}

function renderFeishuAskUserQuestionCard(
  request: ChannelConnectorAgentPermissionRequest,
): ChannelConnectorFeishuInteractiveCard {
  const requestId = normalizeString(request.requestId) || "question";
  const questions = pendingAskUserQuestions(request);
  const question = questions[0] || fallbackAskUserQuestion();
  const total = Math.max(questions.length, 1);
  const optionLines = question.options.map((option, optionIndex) => {
    const description = option.description ? ` - ${option.description}` : "";
    return `${optionIndex + 1}. ${option.label}${description}`;
  });
  const actions = !question.multiSelect && question.options.length > 0 && question.options.length <= 6
    ? [{
      tag: "action",
      actions: question.options.map((option, optionIndex) => feishuAskUserQuestionButton({
        label: option.label,
        requestId,
        optionIndex,
      })),
    }]
    : [];
  const answerHelp = question.multiSelect
    ? "可回复多个序号，例如 `1,3`；也可以直接回复文字。"
    : question.options.length
      ? "可点击选项按钮，或直接回复序号/文字。"
      : "请直接回复答案。";
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: total > 1 ? `Claude Code 提问 1/${total}` : "Claude Code 提问",
      },
      template: "blue",
    },
    elements: [
      {
        tag: "markdown",
        content: [
          question.header ? `**${question.header}**` : "",
          question.question,
          optionLines.length ? `**可选回答**\n${optionLines.join("\n")}` : "",
          `**回复方式**\n${answerHelp}`,
          `请求：\`${inlineProgressCode(requestId)}\``,
        ].filter(Boolean).join("\n\n"),
      },
      ...actions,
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "这是 Claude Code 的提问，不是工具权限审批；allow / deny 会作为答案文本处理。",
          },
        ],
      },
    ],
  };
}

function renderFeishuPermissionCard(request: ChannelConnectorAgentPermissionRequest): ChannelConnectorFeishuInteractiveCard {
  if (isAskUserQuestionRequest(request)) {
    return renderFeishuAskUserQuestionCard(request);
  }
  const toolName = normalizeString(request.toolName) || "tool";
  const requestId = normalizeString(request.requestId) || "permission";
  const inputJson = JSON.stringify(request.input || {}, null, 2);
  const inputBlock = inputJson && inputJson !== "{}"
    ? `\n**参数**\n\`\`\`json\n${shortMessage(inputJson, 6_000)}\n\`\`\``
    : "";
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: "Studio Agent 工具权限确认",
      },
      template: "orange",
    },
    elements: [
      {
        tag: "markdown",
        content: [
          "**Agent 请求执行工具，需要确认。**",
          `**工具**：\`${toolName}\``,
          `**请求**：\`${requestId}\`${inputBlock}`,
        ].join("\n"),
      },
      {
        tag: "action",
        actions: [
          feishuPermissionButton({
            label: "允许",
            type: "primary",
            command: "/approve",
            actionId: "permission-approve",
          }),
          feishuPermissionButton({
            label: "拒绝",
            type: "danger",
            command: "/deny",
            actionId: "permission-deny",
          }),
          feishuPermissionButton({
            label: "本次运行全部允许",
            type: "default",
            command: "/allow-all",
            actionId: "permission-allow-all",
          }),
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "也可以直接回复 /approve、/deny 或 /allow-all。",
          },
        ],
      },
    ],
  };
}

async function sendFeishuPermissionPrompt(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  transport: ChannelConnectorFeishuTransportConfig;
  binding: ChannelConnectorRuntimeBinding;
  chatId: string;
  request: ChannelConnectorAgentPermissionRequest;
  fallbackText: string;
}): Promise<ChannelConnectorFeishuTransportResult> {
  const cachePath = feishuTokenCachePath(input.config);
  if (feishuCardsEnabled(input.binding)) {
    const cardResult = await sendFeishuCardMessage(input.transport, {
      chatId: input.chatId,
      card: renderFeishuPermissionCard(input.request),
    }, cachePath);
    if (cardResult.ok === true) return cardResult;
  }
  return sendFeishuTextMessage(input.transport, {
    chatId: input.chatId,
    content: input.fallbackText,
  }, cachePath);
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
  if (["new", "reset", "show", "stop", "permission", "passthrough"].includes(action)) return false;
  if (input.parsedKind === "card-action" || input.parsedKind === "bot-menu") return true;
  return shouldRenderFeishuCommandCard(input.command);
}

function shouldSendFeishuProgressEvent(
  control: ChannelConnectorSessionControlRecord | null,
  event: ChannelConnectorAgentProgressEvent,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  return shouldSendChannelProgressEvent(control, event, defaults);
}

function channelConnectorProgressDefaults(isGroup: boolean): ChannelConnectorProgressDefaults {
  return {
    isGroup,
    thinkingMessages: !isGroup,
    processMessages: !isGroup,
    toolMessages: !isGroup,
  };
}

function feishuProgressDefaults(parsed: ChannelConnectorFeishuParsedWebhook): ChannelConnectorProgressDefaults {
  return channelConnectorProgressDefaults(normalizeString(parsed.chatType).toLowerCase() === "group");
}

function octoProgressDefaults(message: ChannelConnectorOctoInboundMessage): ChannelConnectorProgressDefaults {
  return channelConnectorProgressDefaults(isOctoGroupChannel(message.channelType));
}

function channelConnectorThinkingMessagesEnabled(
  control: ChannelConnectorSessionControlRecord | null,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  return control?.thinkingMessages ?? defaults.thinkingMessages;
}

function channelConnectorProcessMessagesEnabled(
  control: ChannelConnectorSessionControlRecord | null,
  defaults: ChannelConnectorProgressDefaults,
): boolean {
  return control?.processMessages ?? defaults.processMessages;
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
  if (!isVisibleChannelProgressEvent(event)) return false;
  if (event.type === "assistant") {
    return isChannelConnectorProcessProgressEvent(event)
      && channelConnectorProcessMessagesEnabled(control, defaults);
  }
  if (event.type === "running" || event.type === "completed" || event.type === "event") return false;
  if (event.type === "reasoning") return channelConnectorThinkingMessagesEnabled(control, defaults);
  if (event.type === "tool") return channelConnectorToolMessagesEnabled(control, defaults);
  if (!channelConnectorProcessMessagesEnabled(control, defaults)) return false;
  return ["reasoning", "tool", "failed", "error"].includes(event.type);
}

function isVisibleChannelProgressEvent(event: ChannelConnectorAgentProgressEvent): boolean {
  if (event.type !== "running") return true;
  const rawType = normalizeString(event.rawType).toLowerCase();
  const text = normalizeString(event.text).toLowerCase();
  if (rawType === "turn.started" || rawType === "turn/started") return false;
  if (text === "codex turn started" || text === "codex app-server turn started") return false;
  return true;
}

function isPermissionApprovalProgressEvent(event: ChannelConnectorAgentProgressEvent): boolean {
  const rawType = normalizeString(event.rawType).toLowerCase();
  const text = normalizeString(event.text).toLowerCase();
  return rawType === "control_request"
    || rawType.includes("requestapproval")
    || text.includes("permission requested")
    || text.includes("can_use_tool");
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
  if (event.type === "assistant") return "assistant";
  if (event.type === "reasoning") return "thinking";
  if (isRecoverableToolResultErrorProgressEvent(event)) return "tool_result";
  if (event.type === "tool") {
    return progressEventToolDirection(event) === "use" ? "tool_use" : "tool_result";
  }
  if (event.type === "failed" || event.type === "error") return "error";
  return "info";
}

function isRecoverableToolResultErrorProgressEvent(event: ChannelConnectorAgentProgressEvent): boolean {
  if (event.type !== "failed" && event.type !== "error") return false;
  return normalizeString(event.rawType).toLowerCase() === "user"
    && normalizeString(event.itemType).toLowerCase() === "tool_result";
}

function feishuProgressEntryText(
  event: ChannelConnectorAgentProgressEvent,
  kind: FeishuProgressCardEntryKind,
): string {
  const text = normalizeString(event.text || event.rawType || event.type);
  if (!text) return "";
  if (kind === "tool_result" && isRecoverableToolResultErrorProgressEvent(event)) {
    return `failed\noutput: ${text}`;
  }
  return text;
}

function feishuProgressEntryTitle(event: ChannelConnectorAgentProgressEvent, kind: FeishuProgressCardEntryKind): string {
  if (kind === "assistant") return "过程回复";
  if (kind === "thinking") return "思考";
  const toolName = normalizeString(event.toolName)
    || (!isGenericProgressToolName(normalizeString(event.itemType)) ? normalizeString(event.itemType) : "");
  if (kind === "tool_use") return toolName ? `工具调用：${toolName}` : "工具调用";
  if (kind === "tool_result") return toolName ? `工具结果：${toolName}` : "工具结果";
  if (kind === "error") return event.type === "failed" ? "失败" : "错误";
  if (event.type === "running") return "运行中";
  if (event.type === "completed") return "完成";
  return event.rawType || "进度";
}

function recentFeishuProgressToolName(
  cardState: FeishuProgressCardState,
  toolCallId: string | null | undefined,
): string {
  const normalizedToolCallId = normalizeString(toolCallId);
  for (let index = cardState.entries.length - 1; index >= 0; index -= 1) {
    const entry = cardState.entries[index];
    if (entry.kind !== "tool_use") continue;
    if (normalizedToolCallId && normalizeString(entry.toolCallId) !== normalizedToolCallId) continue;
    const parsed = parseProgressToolText(entry);
    if (parsed.toolName && !isGenericProgressToolName(parsed.toolName)) return parsed.toolName;
  }
  return "";
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
  const text = shortMessage(feishuProgressEntryText(event, kind), 520);
  if (!text) return false;
  const toolName = normalizeString(event.toolName)
    || (kind === "tool_result" ? recentFeishuProgressToolName(cardState, event.toolCallId) : "");
  const fingerprint = `${kind}:${event.rawType || ""}:${event.itemType || ""}:${event.toolCallId || ""}:${toolName}:${text}`;
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
    toolName,
    toolCallId: event.toolCallId,
  });
  cardState.entries = cardState.entries.slice(-8);
  cardState.updatedAtMs = Date.now();
  cardState.dirty = true;
  return true;
}

function permissionProgressStatusLabel(status: ChannelDaemonPendingPermissionState): string {
  if (status === "pending") return "等待审批";
  if (status === "allowed") return "已允许";
  if (status === "allowed-all") return "已允许本次运行后续请求";
  if (status === "denied") return "已拒绝";
  if (status === "timed-out") return "已超时拒绝";
  if (status === "replaced") return "已被新请求替换";
  if (status === "ended") return "运行结束，已取消";
  return "审批失败";
}

function permissionProgressStatusColor(status: ChannelDaemonPendingPermissionState): "blue" | "green" | "red" | "grey" {
  if (status === "pending") return "blue";
  if (status === "allowed" || status === "allowed-all") return "green";
  if (status === "denied" || status === "timed-out" || status === "failed") return "red";
  return "grey";
}

function permissionProgressText(input: {
  request: ChannelConnectorAgentPermissionRequest;
  status: ChannelDaemonPendingPermissionState;
  message?: string | null;
}): string {
  const inputJson = JSON.stringify(input.request.input || {}, null, 2);
  const lines = [
    `工具：${normalizeString(input.request.toolName) || "tool"}`,
    `请求：${normalizeString(input.request.requestId) || "permission"}`,
    `状态：${permissionProgressStatusLabel(input.status)}`,
    input.message ? `说明：${input.message}` : "",
    inputJson && inputJson !== "{}" ? `参数：\n${inputJson}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function upsertFeishuPermissionProgressEntry(
  cardState: FeishuProgressCardState,
  input: {
    request: ChannelConnectorAgentPermissionRequest;
    status: ChannelDaemonPendingPermissionState;
    message?: string | null;
  },
): boolean {
  const requestId = normalizeString(input.request.requestId) || "permission";
  const toolName = normalizeString(input.request.toolName) || "tool";
  const fingerprint = `permission:${requestId}`;
  const existing = cardState.entries.find((entry) => entry.fingerprint === fingerprint);
  const entry: FeishuProgressCardEntry = {
    kind: "permission",
    title: "权限审批",
    text: shortMessage(permissionProgressText(input), 1_200),
    checkedAt: new Date().toISOString(),
    fingerprint,
    rawType: "permission",
    itemType: toolName,
    permission: {
      requestId,
      toolName,
      input: input.request.input || {},
      status: input.status,
      message: input.message || null,
    },
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    cardState.entries.push(entry);
  }
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
  return ["bash", "shell", "run_shell_command", "exec_command", "execcommand", "command_execution", "commandexecution", "command", "write_stdin"].includes(normalizeString(value).toLowerCase());
}

function isTodoWriteToolName(value: string | null): boolean {
  return normalizeString(value).toLowerCase() === "todowrite";
}

function normalizedProgressToolKey(value: string | null): string {
  return normalizeString(value).toLowerCase().replace(/[\s_.:-]+/g, "");
}

function progressToolUseLabel(toolName: string): string {
  const key = normalizedProgressToolKey(toolName);
  if (["bash", "shell", "runshellcommand", "execcommand", "commandexecution", "command"].includes(key)) return "命令执行";
  if (["writestdin"].includes(key)) return "命令输入";
  if (key === "todowrite") return "任务清单";
  if (key === "todoread") return "任务查看";
  if (["read", "readfile", "notebookread"].includes(key)) return "文件读取";
  if (["write", "writefile", "edit", "multiedit", "notebookedit", "applypatch", "patch"].includes(key)) return "文件修改";
  if (["grep", "glob", "ls", "list", "search", "find"].includes(key)) return "文件检索";
  if (["webfetch", "websearch", "webopen", "webfind"].includes(key)) return "网页检索";
  if (["viewimage", "imageview", "screenshot"].includes(key)) return "图像查看";
  if (key.startsWith("mcp")) return "MCP 工具";
  if (["agent", "task", "spawnagent", "assigntask", "sendmessage", "waitagent", "closeagent", "listagents"].includes(key)) return "子任务";
  if (["updateplan"].includes(key)) return "计划更新";
  if (["permissions", "permission"].includes(key)) return "权限策略";
  if (["askuserquestion", "ask", "question"].includes(key)) return "用户确认";
  return "工具调用";
}

function progressToolResultLabel(toolName: string): string {
  const key = normalizedProgressToolKey(toolName);
  if (["bash", "shell", "runshellcommand", "execcommand", "commandexecution", "command"].includes(key)) return "命令输出";
  if (["writestdin"].includes(key)) return "命令输入结果";
  if (key === "todowrite") return "任务清单结果";
  if (key === "todoread") return "任务查看结果";
  if (["read", "readfile", "notebookread"].includes(key)) return "读取结果";
  if (["write", "writefile", "edit", "multiedit", "notebookedit", "applypatch", "patch"].includes(key)) return "修改结果";
  if (["grep", "glob", "ls", "list", "search", "find"].includes(key)) return "检索结果";
  if (["webfetch", "websearch", "webopen", "webfind"].includes(key)) return "网页结果";
  if (["viewimage", "imageview", "screenshot"].includes(key)) return "图像查看结果";
  if (key.startsWith("mcp")) return "MCP 结果";
  if (["agent", "task", "spawnagent", "assigntask", "sendmessage", "waitagent", "closeagent", "listagents"].includes(key)) return "子任务结果";
  if (["updateplan"].includes(key)) return "计划更新结果";
  if (["permissions", "permission"].includes(key)) return "权限策略结果";
  if (["askuserquestion", "ask", "question"].includes(key)) return "用户确认结果";
  return "工具结果";
}

function codeBlock(language: string, value: string): string {
  const body = normalizeString(value).replace(/```/g, "'''");
  return body ? `\`\`\`${language}\n${body}\n\`\`\`` : "";
}

function isGenericProgressToolName(value: string): boolean {
  return ["", "tool", "tool_use", "tool-use", "tool_result", "tool-result"].includes(normalizeString(value).toLowerCase());
}

function progressToolNameFromFirstLine(line: string): string {
  const value = normalizeString(line);
  if (!value) return "";
  if (/^(input|output|command|exit|status)\s*[:=]/i.test(value)) return "";
  const match = value.match(/^([A-Za-z0-9_.:/-]+)\s+(started|completed|failed|finished)$/i);
  return match ? normalizeString(match[1]) : value;
}

function progressToolInputFromStructuredText(toolName: string, value: string): string {
  const text = normalizeString(value);
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const command = normalizeString(parsed.command);
      const description = normalizeString(parsed.description);
      if (isBashLikeToolName(toolName) && command) return command;
      if (description) return description;
      if (command) return command;
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Fall through to the original text.
  }
  return text;
}

function parseProgressToolText(entry: FeishuProgressCardEntry): {
  toolName: string;
  command: string;
  exitCode: string | null;
  status: string | null;
  output: string;
} {
  const lines = String(entry.text || "").split(/\r?\n/);
  const firstToolName = progressToolNameFromFirstLine(lines[0] || "");
  const explicitToolName = normalizeString(entry.toolName);
  const itemTypeName = normalizeString(entry.itemType);
  const titleToolName = normalizeString(entry.title.split("：")[1]);
  const toolName = explicitToolName
    || firstToolName
    || (!isGenericProgressToolName(itemTypeName) ? itemTypeName : "")
    || (!isGenericProgressToolName(titleToolName) ? titleToolName : "")
    || "tool";
  const pureClaudeToolResult = entry.kind === "tool_result"
    && normalizeString(entry.rawType).toLowerCase() === "user"
    && normalizeString(entry.itemType).toLowerCase() === "tool_result";
  const firstLineIsToolName = Boolean(firstToolName);
  const bodyLines = pureClaudeToolResult ? lines : firstLineIsToolName ? lines.slice(1) : lines;
  let command = "";
  let exitCode: string | null = null;
  let status: string | null = null;
  const inputLines: string[] = [];
  const outputLines: string[] = [];
  let activeBlock: "input" | "output" | null = null;
  for (let index = 0; index < bodyLines.length; index += 1) {
    const rawLine = bodyLines[index] || "";
    const line = rawLine.trim();
    if (activeBlock === "input") {
      const outputMatch = line.match(/^output\s*:\s*(.*)$/i);
      const metaMatch = /^command[=:]/i.test(line)
        || /^exit=.+$/i.test(line)
        || /^status=.+$/i.test(line)
        || /^(in_progress|running|started|pending|completed|failed|success|succeeded|ok|error)$/i.test(line);
      if (!outputMatch && !metaMatch) {
        inputLines.push(rawLine);
        continue;
      }
      if (outputMatch) {
        activeBlock = "output";
        if (outputMatch[1]) outputLines.push(outputMatch[1]);
        continue;
      }
      activeBlock = null;
    }
    if (activeBlock === "output") {
      outputLines.push(rawLine);
      continue;
    }
    if (!line) continue;
    const inputMatch = line.match(/^input\s*:\s*(.*)$/i);
    if (inputMatch) {
      activeBlock = "input";
      if (inputMatch[1]) inputLines.push(inputMatch[1]);
      continue;
    }
    const outputMatch = line.match(/^output\s*:\s*(.*)$/i);
    if (outputMatch) {
      activeBlock = "output";
      if (outputMatch[1]) outputLines.push(outputMatch[1]);
      continue;
    }
    const commandMatch = line.match(/^command[=:]\s*(.*)$/i);
    if (commandMatch) {
      command = normalizeString(commandMatch[1]);
      continue;
    }
    const exitMatch = line.match(/^exit=(.+)$/i);
    if (exitMatch) {
      exitCode = normalizeString(exitMatch[1]);
      continue;
    }
    const statusMatch = line.match(/^status=(.+)$/i);
    if (statusMatch) {
      status = normalizeString(statusMatch[1]);
      continue;
    }
    if (!status && /^(in_progress|running|started|pending|completed|failed|success|succeeded|ok|error)$/i.test(line)) {
      status = line;
      continue;
    }
    if (!command && entry.kind === "tool_use") {
      command = line;
      continue;
    }
    if (!command && entry.kind === "tool_result") {
      const next = normalizeString(bodyLines[index + 1]);
      const nextLooksMeta = /^exit=.+$/i.test(next)
        || /^(in_progress|running|started|pending|completed|failed|success|succeeded|ok|error)$/i.test(next);
      if (nextLooksMeta) {
        command = line;
        continue;
      }
    }
    outputLines.push(rawLine);
  }
  if (entry.kind === "tool_use" && inputLines.length > 0) {
    command = progressToolInputFromStructuredText(toolName, inputLines.join("\n"));
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

function formatPlainProgressToolResult(value: string): string {
  const text = normalizeString(value);
  if (!text) return "_无输出_";
  if (text.includes("```")) return text;
  return codeBlock("text", text);
}

function indentPlainProgressBody(value: string): string {
  const text = normalizeString(value);
  if (!text) return "";
  if (text.includes("```")) return text;
  return text.split(/\r?\n/).map((line) => `  ${line}`).join("\n");
}

function renderFeishuProgressEntry(entry: FeishuProgressCardEntry): string {
  if (entry.kind === "assistant") return `${progressKindIcon(entry.kind)} <text_tag color='green'>过程回复</text_tag>\n${entry.text}`;
  if (entry.kind === "thinking") return `${progressKindIcon(entry.kind)} <text_tag color='grey'>思考</text_tag>\n${inlineProgressCode(entry.text)}`;
  if (entry.kind === "permission") {
    const status = entry.permission?.status || "pending";
    const toolName = entry.permission?.toolName || "tool";
    const requestId = entry.permission?.requestId || "permission";
    const inputJson = JSON.stringify(entry.permission?.input || {}, null, 2);
    const inputBlock = inputJson && inputJson !== "{}" ? codeBlock("json", inputJson) : "";
    return [
      `${progressKindIcon(entry.kind)} <text_tag color='${permissionProgressStatusColor(status)}'>${permissionProgressStatusLabel(status)}</text_tag> \`${inlineProgressCode(toolName)}\``,
      `请求 \`${inlineProgressCode(requestId)}\``,
      entry.permission?.message ? inlineProgressCode(entry.permission.message) : "",
      inputBlock,
    ].filter(Boolean).join("\n");
  }
  if (entry.kind === "tool_use") {
    const parsed = parseProgressToolText(entry);
    const title = `${progressKindIcon(entry.kind)} <text_tag color='blue'>${progressToolUseLabel(parsed.toolName)}</text_tag> \`${inlineProgressCode(parsed.toolName)}\``;
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
    return `${icon} <text_tag color='turquoise'>${progressToolResultLabel(parsed.toolName)}</text_tag> \`${inlineProgressCode(parsed.toolName)}\`\n${meta}\n${output}`;
  }
  if (entry.kind === "error") return `${progressKindIcon(entry.kind)} <text_tag color='red'>${inlineProgressCode(entry.title)}</text_tag>\n${entry.text}`;
  return `${progressKindIcon(entry.kind)} <text_tag color='grey'>${inlineProgressCode(entry.title)}</text_tag>\n${entry.text}`;
}

function renderPlainProgressEntry(entry: FeishuProgressCardEntry): string {
  if (entry.kind === "assistant") {
    return renderPlainProgressMessage({
      icon: progressKindIcon(entry.kind),
      title: "过程回复",
      body: entry.text,
    });
  }
  if (entry.kind === "thinking") {
    return renderPlainProgressMessage({
      icon: progressKindIcon(entry.kind),
      title: "思考",
      body: entry.text,
    });
  }
  if (entry.kind === "permission") {
    const status = entry.permission?.status || "pending";
    const body = [
      `请求 \`${inlineProgressCode(entry.permission?.requestId || "permission")}\``,
      entry.permission?.message || "",
      entry.permission?.input && Object.keys(entry.permission.input).length
        ? codeBlock("json", JSON.stringify(entry.permission.input, null, 2))
        : "",
    ].filter(Boolean).join("\n");
    return renderPlainProgressMessage({
      icon: progressKindIcon(entry.kind),
      title: `权限审批 \`${inlineProgressCode(entry.permission?.toolName || "tool")}\``,
      meta: permissionProgressStatusLabel(status),
      body,
    });
  }
  if (entry.kind === "tool_use") {
    const parsed = parseProgressToolText(entry);
    const status = progressStatusLabel(parsed.status);
    return renderPlainProgressMessage({
      icon: progressKindIcon(entry.kind),
      title: `${progressToolUseLabel(parsed.toolName)} \`${inlineProgressCode(parsed.toolName)}\``,
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
      title: `${progressToolResultLabel(parsed.toolName)} \`${inlineProgressCode(parsed.toolName)}\``,
      meta,
      body: formatPlainProgressToolResult(parsed.output),
    });
  }
  return renderPlainProgressMessage({
    icon: progressKindIcon(entry.kind),
    title: entry.title,
    body: entry.text,
  });
}

function renderFeishuProgressPermissionActions(entry: FeishuProgressCardEntry): Record<string, unknown> | null {
  if (entry.kind !== "permission" || entry.permission?.status !== "pending") return null;
  return {
    tag: "action",
    actions: [
      feishuPermissionButton({
        label: "允许",
        type: "primary",
        command: "/approve",
        actionId: "permission-approve",
      }),
      feishuPermissionButton({
        label: "拒绝",
        type: "danger",
        command: "/deny",
        actionId: "permission-deny",
      }),
      feishuPermissionButton({
        label: "本次运行全部允许",
        type: "default",
        command: "/allow-all",
        actionId: "permission-allow-all",
      }),
    ],
  };
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
    const actions = renderFeishuProgressPermissionActions(entry);
    if (actions) elements.push(actions);
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
  if (input.command.suppressReply === true) return null;
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
  if (action === "permission" && input.command.suppressReply === true) {
    return { type: "info", content: "审批已更新" };
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
  const customCommands = listChannelConnectorCommandSummaries({
    customCommandsPath: customCommandsPath(input.config),
  }, current);
  const skills = listChannelConnectorSkillSummaries(current, input.binding);
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
    agentNativeSessionId: record.agentNativeSessionId,
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
      agentNativeSessionId: session.agentNativeSessionId,
      codexThreadId: session.codexThreadId,
      lastStatus: session.lastStatus,
      lastMessageId: session.lastMessageId,
      updatedAt: session.updatedAt,
    } : {
      started: false,
      turnCount: 0,
      agentNativeSessionId: null,
      codexThreadId: null,
      lastStatus: null,
      lastMessageId: null,
      updatedAt: null,
    },
    sessionList,
    history,
    customCommands,
    skills,
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
    const { size } = fs.statSync(filePath);
    const start = Math.max(0, size - 5 * 1024 * 1024);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(size - start);
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally {
      fs.closeSync(fd);
    }
    const raw = buf.toString("utf8");
    const firstNewline = raw.indexOf("\n");
    const lines = (firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw).split(/\r?\n/);
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
  const { config, state, activeRunCancels, project, binding, robotId, seenMessages } = input;
  let message = input.message;
  if (shouldSkipSeenMessage(seenMessages, message.messageId)) return;
  const originalContent = extractOctoContent(message);
  const aliasResolution = resolveChannelConnectorBindingCommandAlias(binding, originalContent, commandAliasesPath(config));
  if (aliasResolution.matchedAlias) {
    message = {
      ...message,
      payload: {
        ...message.payload,
        content: aliasResolution.content,
      },
    };
  }
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
      skippedReason: governance.skippedReason,
      governanceDetail: governance.detail,
      rateLimit: governance.rateLimit,
    });
    return;
  }

  const transport = octoTransportFromMetadata(binding.metadata);
  sendOctoReadReceiptForMessage({
    config,
    binding,
    transport,
    message,
    sessionKey,
  });
  const key = gatewayClientKey(config);
  const command = await handleChannelConnectorCommand({
    config,
    project,
    binding,
    message,
    sessionKey,
    controlsPath: sessionControlsPath(config),
    commandAliasesPath: commandAliasesPath(config),
    customCommandsPath: customCommandsPath(config),
    agentSessionsPath: agentSessionsPath(config),
    conversationHistoryPath: conversationHistoryPath(config),
    replyBuffersPath: replyBufferPath(config),
    gatewayClientKey: key,
    runOctoManagement: (input) => runOctoManagementCommand(transport, input),
    hasPendingPermissionRequest: (scope) => hasPendingPermissionForSession(channelPendingPermissions, scope),
    respondPermissionRequest: (scope) => respondPendingPermissionForSession(channelPendingPermissions, scope),
    hasPendingQuestionRequest: (scope) => hasPendingQuestionForSession(channelPendingPermissions, scope),
    respondQuestionRequest: (scope) => respondPendingQuestionForSession(channelPendingPermissions, scope),
    stopActiveRun: (scope) => stopLatestActiveRunForSession(activeRunCancels, scope),
    nativeCompactConversation: (scope) => nativeCompactChannelConnectorConversation({
      config,
      state,
      activeRunCancels,
      binding,
      sessionKey: scope.sessionKey,
      project: scope.project,
      message: scope.message,
      gatewayClientKey: key,
    }),
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
    onCommandProgress: async (event) => {
      let progressReplySent = false;
      let progressReplyRequestCount: number | null = null;
      if (transport && event.type === "started") {
        const replyPlan = renderOctoTextReply(message, formatCommandProgressText(event));
        if (replyPlan) {
          const result = await sendOctoTextReply(transport, replyPlan);
          progressReplySent = result.ok === true;
          progressReplyRequestCount = result.requestCount;
        }
      }
      writeJsonLine(config.paths.octoEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: "channel.command.progress",
        adapter: "octo",
        bindingId: binding.id,
        sessionKey,
        messageId: message.messageId,
        channelId: message.channelId,
        channelType: message.channelType,
        fromUid: message.fromUid,
        ...commandProgressLogFields(event),
        progressReplySent,
        progressReplyRequestCount,
      });
      return { handled: progressReplySent };
    },
  });
  if (command.handled) {
    let replySent = false;
    let replyRequestCount: number | null = null;
    if (transport && command.replyText && command.suppressReply !== true) {
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
      command: command.command,
      commandAction: command.action,
      commandOk: command.ok,
      ...commandAuditLogFields(command.audit),
      replySent,
      replyRequestCount,
      commandElapsedMs: elapsedMsSince(ingressAtMs, isoTimestampMs(commandFinishedAt) ?? Date.now()),
    });
    markRuntimeDirty(config, state);
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
  const octoMembers = await loadOctoGroupMembers({
    binding,
    transport,
    message: agentMessage,
  });
  if (octoMembers.members.length) {
    const members = mergeOctoGroupMembers(agentMessage.members, octoMembers.members);
    message = {
      ...message,
      members,
    };
    agentMessage = {
      ...agentMessage,
      members,
    };
  }
  if (octoMembers.attempted) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.octo.members.loaded",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      groupNo: octoMembers.groupNo,
      memberCount: octoMembers.members.length,
      itemCount: octoMembers.itemCount,
      error: octoMembers.error,
    });
  }
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
      command: command.command,
      ...commandAuditLogFields(command.audit),
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
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
      markRuntimeDirty(config, state);
    },
    onQueueTimeout: (error) => {
      appendLog(config.paths.log, "Session run queue timeout, releasing", {
        bindingId: binding.id,
        sessionKey,
        error: error.message,
      });
    },
  });
  if (transport) {
    await sendOctoTyping(
      transport,
      message.channelType === 1 ? message.fromUid : message.channelId,
      message.channelType,
    );
  }
  await maybeAutoCompactChannelConnectorConversation({
    config,
    state,
    activeRunCancels,
    binding,
    sessionKey,
    project: turnProject,
    message,
    gatewayClientKey: key,
    adapter: "octo",
    messageId: message.messageId,
  });
  const activeRunId = `${binding.id}:${message.messageId}`;
  const currentSession = getChannelConnectorAgentSession(agentSessionsPath(config), effectiveSessionLookup);
  const localHistoryContext = renderChannelConnectorConversationHistoryContext(
    getChannelConnectorConversationHistory(conversationHistoryPath(config), {
      bindingId: binding.id,
      sessionKey,
    }),
  );
  const syncedHistoryContext = await loadOctoSyncedHistoryContext({
    binding,
    transport,
    message: agentMessage,
  });
  if (syncedHistoryContext.attempted) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.octo.history.synced",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      includedCount: syncedHistoryContext.includedCount,
      itemCount: syncedHistoryContext.itemCount,
      error: syncedHistoryContext.error,
    });
  }
  const octoMdContext = await loadOctoMdContext({
    binding,
    transport,
    message: agentMessage,
  });
  if (octoMdContext.attempted) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt: new Date().toISOString(),
      eventKind: "channel.octo.md.loaded",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      kind: octoMdContext.kind,
      groupNo: octoMdContext.groupNo,
      shortId: octoMdContext.shortId,
      included: Boolean(octoMdContext.context),
      error: octoMdContext.error,
    });
  }
  const historyContext = [
    octoMdContext.context,
    syncedHistoryContext.context,
    localHistoryContext,
  ].filter(Boolean).join("\n\n") || null;
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
  let octoPermissionPending = false;
  const octoPermissionBufferedProgress: ChannelConnectorAgentProgressEvent[] = [];
  const queueOctoTextProgressReply = (
    replyText: string,
    log: {
      eventKind: string;
      progressType?: ChannelConnectorAgentProgressEvent["type"] | "permission" | null;
      rawType?: string | null;
      itemType?: string | null;
      phase?: ChannelConnectorAgentProgressEvent["phase"];
      permissionStatus?: ChannelDaemonPendingPermissionState | null;
      requestId?: string | null;
      toolName?: string | null;
    },
  ): Promise<void> => {
    if (!transport) return Promise.resolve();
    const replyPlan = renderOctoTextReply(message, replyText);
    if (!replyPlan) return Promise.resolve();
    octoProgressSendCount += 1;
    const replyQueuedAt = new Date().toISOString();
    const replyTimeoutMs = log.eventKind === "agent.progress.reply" ? OCTO_PROGRESS_REPLY_TIMEOUT_MS : null;
    octoProgressFlush = octoProgressFlush.catch(() => undefined).then(async () => {
      const replyStartedAtMs = Date.now();
      const replyStartedAt = new Date(replyStartedAtMs).toISOString();
      const result = await sendOctoTextReply(transport, replyPlan, {
        timeoutMs: replyTimeoutMs,
      });
      writeJsonLine(config.paths.octoEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: log.eventKind,
        adapter: "octo",
        bindingId: binding.id,
        sessionKey,
        messageId: message.messageId,
        channelId: message.channelId,
        channelType: message.channelType,
        progressType: log.progressType || null,
        rawType: log.rawType || null,
        itemType: log.itemType || null,
        phase: log.phase || null,
        permissionStatus: log.permissionStatus || null,
        requestId: log.requestId || null,
        toolName: log.toolName || null,
        replySent: result.ok === true,
        replyError: result.error,
        replyRequestCount: result.requestCount,
        progressReplySendCount: octoProgressSendCount,
        replyQueuedAt,
        replyStartedAt,
        replyDurationMs: elapsedMsSince(replyStartedAtMs),
        replyTimeoutMs,
        agentElapsedMs: elapsedMsSince(runStartedAtMs),
      });
    }).catch((error) => {
      writeJsonLine(config.paths.octoEvents, {
        checkedAt: new Date().toISOString(),
        eventKind: log.eventKind,
        adapter: "octo",
        bindingId: binding.id,
        sessionKey,
        messageId: message.messageId,
        channelId: message.channelId,
        channelType: message.channelType,
        progressType: log.progressType || null,
        rawType: log.rawType || null,
        itemType: log.itemType || null,
        phase: log.phase || null,
        permissionStatus: log.permissionStatus || null,
        requestId: log.requestId || null,
        toolName: log.toolName || null,
        replySent: false,
        replyError: shortMessage(error),
        progressReplySendCount: octoProgressSendCount,
        replyQueuedAt,
        replyStartedAt: null,
        replyDurationMs: null,
        replyTimeoutMs,
        agentElapsedMs: elapsedMsSince(runStartedAtMs),
      });
    });
    return octoProgressFlush;
  };
  const queueOctoProgressReply = (event: ChannelConnectorAgentProgressEvent, fromPermissionBuffer = false): void => {
    if (event.type === "completed") return;
    if (isPermissionApprovalProgressEvent(event)) return;
    if (octoPermissionPending && !fromPermissionBuffer && event.type !== "failed" && event.type !== "error") {
      if (octoPermissionBufferedProgress.length < 20) octoPermissionBufferedProgress.push(event);
      return;
    }
    if (!shouldSendChannelProgressEvent(control, event, progressDefaults)) return;
    const replyText = renderOctoProgressText(event);
    const highPriority = event.type === "failed" || event.type === "error" || event.type === "tool";
    const nowMs = Date.now();
    if (!highPriority && nowMs - lastOctoProgressSentAt < 1500) return;
    if (!highPriority && octoProgressSendCount >= 40) return;
    lastOctoProgressSentAt = nowMs;
    void queueOctoTextProgressReply(replyText, {
      eventKind: "agent.progress.reply",
      progressType: event.type,
      rawType: event.rawType,
      itemType: event.itemType,
      phase: event.phase || null,
    });
  };
  const flushOctoPermissionBufferedProgress = (): void => {
    if (!octoPermissionBufferedProgress.length) return;
    const buffered = octoPermissionBufferedProgress.splice(0);
    for (const event of buffered) queueOctoProgressReply(event, true);
  };
  const queueOctoPermissionStateReply = (change: ChannelDaemonPendingPermissionStateChange): void => {
    const status = change.status;
    if (status === "pending") {
      octoPermissionPending = true;
      return;
    }
    if (!permissionStateSettled(status)) return;
    octoPermissionPending = false;
    void queueOctoTextProgressReply(renderPlainPermissionState(change), {
      eventKind: "agent.permission.reply",
      progressType: "permission",
      permissionStatus: status,
      requestId: change.request.requestId,
      toolName: change.request.toolName,
    });
    if (permissionStateContinuesRun(status)) {
      flushOctoPermissionBufferedProgress();
    } else {
      octoPermissionBufferedProgress.length = 0;
    }
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
    sessionResumed: Boolean(currentSession?.agentNativeSessionId || currentSession?.codexThreadId),
    agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
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
  markRuntimeDirty(config, state);
  writeJsonLine(config.paths.octoEvents, {
    checkedAt: runStartedAt,
    eventKind: "agent.run.started",
    adapter: "octo",
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: turnProject.agent,
    model: turnProject.model,
    sessionResumed: Boolean(currentSession?.agentNativeSessionId || currentSession?.codexThreadId),
    agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
    codexThreadId: currentSession?.codexThreadId || null,
    progressDefaults,
    progressThinkingEnabled: channelConnectorThinkingMessagesEnabled(control, progressDefaults),
    progressProcessEnabled: channelConnectorProcessMessagesEnabled(control, progressDefaults),
    progressToolsEnabled: channelConnectorToolMessagesEnabled(control, progressDefaults),
    aliasName: aliasResolution.matchedAlias?.name || null,
    aliasCommand: aliasResolution.matchedAlias?.command || null,
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
	      transport,
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
	      attachmentCount: (staged.message.attachments || []).length,
	      attachmentKinds: (staged.message.attachments || []).map((attachment) => attachment.kind),
	      visualAttachmentCount: countChannelConnectorVisualAttachments(staged.message),
	      stagedCount: staged.stagedCount,
	      failedCount: staged.failedCount,
	      downloadUrlAttemptCount: staged.downloadUrlAttemptCount,
	      downloadUrlResolvedCount: staged.downloadUrlResolvedCount,
	      localPaths: staged.localPaths,
	    });
	  }

  const stopTypingPulse = startOctoTypingPulse(transport, message);
  const channelSkillContext = nativeCommand
    ? null
    : buildChannelConnectorSkillContext(turnProject, { binding });
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
        channelSkillContext,
        modelCapabilities: modelResolution.modelCapabilities,
        nativeCommand: nativeCommand || null,
        signal: abortController.signal,
        resolvePermission: createPermissionResolver({
          registry: channelPendingPermissions,
          runId: activeRunId,
          bindingId: binding.id,
          sessionKey,
          messageId: message.messageId,
          agent: turnProject.agent,
          model: turnProject.model,
          onStateChange: (change) => {
            if (isAskUserQuestionRequest(change.request)) return;
            queueOctoPermissionStateReply(change);
          },
          onPrompt: async (prompt, request) => {
            if (!isAskUserQuestionRequest(request)) octoPermissionPending = true;
            await queueOctoTextProgressReply(renderPlainPermissionPrompt(request, prompt), {
              eventKind: "agent.permission.prompt",
              progressType: "permission",
              permissionStatus: "pending",
              requestId: request.requestId,
              toolName: request.toolName,
            });
          },
        }),
        session: {
          agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
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
            phase: event.phase || null,
            text: event.text,
            progressDefaultGroup: progressDefaults.isGroup,
            progressThinkingEnabled: channelConnectorThinkingMessagesEnabled(control, progressDefaults),
            progressProcessEnabled: channelConnectorProcessMessagesEnabled(control, progressDefaults),
            progressToolsEnabled: channelConnectorToolMessagesEnabled(control, progressDefaults),
            agentElapsedMs: elapsedMsSince(runStartedAtMs, progressAtMs),
            sincePreviousProgressMs,
            firstProgressLatencyMs: firstProgressAtMs === null
              ? null
              : elapsedMsSince(runStartedAtMs, firstProgressAtMs),
          });
          queueOctoProgressReply(event);
          markRuntimeDirty(config, state);
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
        resumed: Boolean(currentSession?.agentNativeSessionId || currentSession?.codexThreadId),
        agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
        codexThreadId: currentSession?.codexThreadId || null,
      },
    };
  } finally {
    stopTypingPulse();
    activeRunCancels.delete(activeRunId);
    clearPendingPermissionsForRun(channelPendingPermissions, activeRunId);
    state.activeRuns = state.activeRuns.filter((run) => run.id !== activeRunId);
    sessionRunLease.release();
    markRuntimeDirty(config, state);
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
      messages: [],
      errors: [],
      declaredCount: 0,
      declaredMessageCount: 0,
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
  const dropStaleSession = isStaleAgentSessionResumeFailure(agent);
  if (dropStaleSession && currentSession) {
    deleteChannelConnectorAgentSession(agentSessionsPath(config), {
      bindingId: effectiveSessionLookup.bindingId,
      sessionKey: effectiveSessionLookup.sessionKey,
      sessionId: currentSession.id,
    });
  }
  if (!dropStaleSession && (agent.session.agentNativeSessionId || agent.session.codexThreadId || currentSession?.agentNativeSessionId || currentSession?.codexThreadId)) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      agentNativeSessionId: agent.session.agentNativeSessionId || currentSession?.agentNativeSessionId || agent.session.codexThreadId || currentSession?.codexThreadId || null,
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
    agentNativeSessionId: agent.session.agentNativeSessionId,
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
  let outboundMessageSentCount = 0;
  let outboundMessageRequestCount = 0;
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
  if (transport && agent.ok === true && outboundReply.messages.length > 0) {
    const sentMessages = await sendOctoOutboundMessages({
      transport,
      sourceMessage: message,
      messages: outboundReply.messages,
    });
    outboundMessageSentCount = sentMessages.sentCount;
    outboundMessageRequestCount = sentMessages.requestCount;
    replyRequestCount = (replyRequestCount || 0) + sentMessages.requestCount;
    if (sentMessages.sentCount > 0) replySent = true;
    outboundFileErrors = [...outboundFileErrors, ...sentMessages.errors];
    if (sentMessages.errors.length > 0) {
      const replyPlan = renderOctoTextReply(message, `消息发送失败：${sentMessages.errors.join("; ")}`);
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
    agentNativeSessionId: agent.session.agentNativeSessionId,
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
    outboundMessagesDeclared: outboundReply.declaredMessageCount,
    outboundMessagesSent: outboundMessageSentCount,
    outboundMessageRequestCount,
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
  markRuntimeDirty(config, state);
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
  let content = feishuContentFromParsed(parsed);
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
  const aliasResolution = parsed.kind === "message"
    ? resolveChannelConnectorBindingCommandAlias(binding, content, commandAliasesPath(config))
    : { content, matchedAlias: null };
  content = aliasResolution.content;
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
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

  const staleEvent = feishuStaleEventState(binding, parsed, ingressAtMs);
  if (staleEvent.stale) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: "feishu.event.stale",
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_event_stale",
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      dedupeKey,
      eventTimeMs: staleEvent.eventTimeMs,
      eventAgeMs: staleEvent.eventAgeMs,
      staleEventMaxAgeMs: staleEvent.maxAgeMs,
      ...feishuTimingLogFields(parsed),
      ...feishuThreadLogFields(parsed),
    });
    return null;
  }

  const outOfOrderEvent = sessionKey
    ? feishuOutOfOrderEventState({ seenMessages, binding, sessionKey, parsed })
    : { outOfOrder: false, eventTimeMs: feishuParsedEventTimeMs(parsed), watermarkMs: null };
  if (outOfOrderEvent.outOfOrder) {
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      adapter: "feishu",
      eventKind: "feishu.event.out_of_order",
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason: "feishu_event_out_of_order",
      bindingId: binding.id,
      sessionKey,
      messageId,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      dedupeKey,
      eventTimeMs: outOfOrderEvent.eventTimeMs,
      conversationWatermarkMs: outOfOrderEvent.watermarkMs,
      ...feishuTimingLogFields(parsed),
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

  updateFeishuConversationWatermark({
    config,
    seenMessages,
    binding,
    sessionKey,
    parsed,
  });

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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
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
    commandAliasesPath: commandAliasesPath(config),
    customCommandsPath: customCommandsPath(config),
    agentSessionsPath: agentSessionsPath(config),
    conversationHistoryPath: conversationHistoryPath(config),
    replyBuffersPath: replyBufferPath(config),
    gatewayClientKey: key,
    hasPendingPermissionRequest: (scope) => hasPendingPermissionForSession(channelPendingPermissions, scope),
    respondPermissionRequest: (scope) => respondPendingPermissionForSession(channelPendingPermissions, scope),
    hasPendingQuestionRequest: (scope) => hasPendingQuestionForSession(channelPendingPermissions, scope),
    respondQuestionRequest: (scope) => respondPendingQuestionForSession(channelPendingPermissions, scope),
    stopActiveRun: (scope) => stopLatestActiveRunForSession(activeRunCancels, scope),
    nativeCompactConversation: (scope) => nativeCompactChannelConnectorConversation({
      config,
      state,
      activeRunCancels,
      binding,
      sessionKey: scope.sessionKey,
      project: scope.project,
      message: scope.message,
      gatewayClientKey: key,
    }),
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
    onCommandProgress: (() => {
      let progressCardMessageId: string | null = null;
      return async (event: ChannelConnectorCommandProgressEvent): Promise<ChannelConnectorCommandProgressAck> => {
        let result: ChannelConnectorFeishuTransportResult | null = null;
        let action = "none";
        const cachePath = feishuTokenCachePath(config);
        if (feishuCardsEnabled(binding)) {
          if (progressCardMessageId) {
            result = await patchFeishuCardMessage(transport, {
              messageId: progressCardMessageId,
              card: renderFeishuCommandProgressCard(event),
            }, cachePath);
            action = "patch-command-progress-card";
          } else {
            result = await sendFeishuCardMessage(transport, {
              chatId: parsed.channelId || sessionKey,
              card: renderFeishuCommandProgressCard(event),
            }, cachePath);
            action = "send-command-progress-card";
            if (result.ok === true && result.messageId) progressCardMessageId = result.messageId;
          }
        } else if (event.type === "started") {
          result = await sendFeishuTextMessage(transport, {
            chatId: parsed.channelId || sessionKey,
            content: formatCommandProgressText(event),
          }, cachePath);
          action = "send-command-progress-text";
        }
        writeJsonLine(config.paths.feishuEvents, {
          checkedAt: new Date().toISOString(),
          eventKind: "channel.command.progress",
          adapter: "feishu",
          bindingId: binding.id,
          sessionKey,
          messageId,
          channelId: parsed.channelId,
          chatType: parsed.chatType,
          fromUid: parsed.fromUid,
          ...feishuThreadLogFields(parsed),
          ...commandProgressLogFields(event),
          progressTransportAction: action,
          progressReplySent: result?.ok === true,
          progressReplyMessageId: result?.messageId || null,
          progressReplyRequestCount: result?.requestCount ?? null,
          progressReplyError: result?.error || null,
        });
        const handled = result?.ok === true;
        return {
          handled,
          suppressFinalReply: handled && feishuCardsEnabled(binding) && commandProgressIsTerminal(event),
        };
      };
    })(),
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
    if (!replySent && !shouldSendCard && parsed.kind === "card-action" && command.replyText && command.suppressReply !== true) {
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
    if (!replySent && !replyQueued && command.replyText && command.suppressReply !== true) {
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
      ...feishuThreadLogFields(parsed),
      command: command.command,
      commandAction: command.action,
      commandOk: command.ok,
      ...commandAuditLogFields(command.audit),
      replySent,
      replyQueued,
      replyTransportAction,
      replyError,
      replyRequestCount,
      commandElapsedMs: elapsedMsSince(ingressAtMs, isoTimestampMs(commandFinishedAt) ?? Date.now()),
    });
    markRuntimeDirty(config, state);
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
      aliasName: aliasResolution.matchedAlias?.name || null,
      aliasCommand: aliasResolution.matchedAlias?.command || null,
      ...feishuThreadLogFields(parsed),
      command: command.command,
      ...commandAuditLogFields(command.audit),
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
      markRuntimeDirty(config, state);
    },
    onQueueTimeout: (error) => {
      appendLog(config.paths.log, "Session run queue timeout, releasing", {
        bindingId: binding.id,
        sessionKey,
        error: error.message,
      });
    },
  });
  await maybeAutoCompactChannelConnectorConversation({
    config,
    state,
    activeRunCancels,
    binding,
    sessionKey,
    project: turnProject,
    message,
    gatewayClientKey: key,
    adapter: "feishu",
    messageId,
    threadFields: feishuThreadLogFields(parsed),
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
    sessionResumed: Boolean(currentSession?.agentNativeSessionId || currentSession?.codexThreadId),
    agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
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
  markRuntimeDirty(config, state);
  writeJsonLine(config.paths.feishuEvents, {
    checkedAt: runStartedAt,
    eventKind: "agent.run.started",
    adapter: "feishu",
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: turnProject.agent,
    model: turnProject.model,
    sessionResumed: Boolean(currentSession?.agentNativeSessionId || currentSession?.codexThreadId),
    agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
    codexThreadId: currentSession?.codexThreadId || null,
    progressDefaults,
    progressThinkingEnabled: channelConnectorThinkingMessagesEnabled(control, progressDefaults),
    progressProcessEnabled: channelConnectorProcessMessagesEnabled(control, progressDefaults),
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
      attachmentCount: (staged.message.attachments || []).length,
      attachmentKinds: (staged.message.attachments || []).map((attachment) => attachment.kind),
      visualAttachmentCount: countChannelConnectorVisualAttachments(staged.message),
      stagedCount: staged.stagedCount,
      failedCount: staged.failedCount,
      localPaths: staged.localPaths,
    });
  }
  let agent: ChannelConnectorAgentTurnResult;
  const channelSkillContext = nativeCommand
    ? null
    : buildChannelConnectorSkillContext(turnProject, { binding });
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
        channelSkillContext,
        modelCapabilities: modelResolution.modelCapabilities,
        nativeCommand: nativeCommand || null,
        signal: abortController.signal,
        resolvePermission: createPermissionResolver({
          registry: channelPendingPermissions,
          runId: activeRunId,
          bindingId: binding.id,
          sessionKey,
          messageId,
          agent: turnProject.agent,
          model: turnProject.model,
          suppressReplyOnResolve: feishuCardsEnabled(binding) && Boolean(parsed.channelId),
          onStateChange: (change) => {
            if (isAskUserQuestionRequest(change.request)) return;
            if (!feishuCardsEnabled(binding) || !parsed.channelId) return;
            upsertFeishuPermissionProgressEntry(progressCardState, change);
            queueFeishuProgressFlush(true, `permission-${change.status}`);
          },
          onPrompt: async (prompt, request) => {
            if (!isAskUserQuestionRequest(request) && feishuCardsEnabled(binding) && parsed.channelId) {
              await feishuProgressFlush;
              if (progressCardState.messageId) return;
            }
            await sendFeishuPermissionPrompt({
              config,
              transport,
              binding,
              chatId: parsed.channelId || sessionKey,
              request,
              fallbackText: prompt,
            });
          },
        }),
        session: {
          agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
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
            phase: event.phase || null,
            text: event.text,
            progressDefaultGroup: progressDefaults.isGroup,
            progressThinkingEnabled: channelConnectorThinkingMessagesEnabled(control, progressDefaults),
            progressProcessEnabled: channelConnectorProcessMessagesEnabled(control, progressDefaults),
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
          markRuntimeDirty(config, state);
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
        resumed: Boolean(currentSession?.agentNativeSessionId || currentSession?.codexThreadId),
        agentNativeSessionId: currentSession?.agentNativeSessionId || currentSession?.codexThreadId || null,
        codexThreadId: currentSession?.codexThreadId || null,
      },
    };
  } finally {
    await stopTypingReaction();
    activeRunCancels.delete(activeRunId);
    clearPendingPermissionsForRun(channelPendingPermissions, activeRunId);
    state.activeRuns = state.activeRuns.filter((run) => run.id !== activeRunId);
    sessionRunLease.release();
    markRuntimeDirty(config, state);
  }
  if (agent.progress.eventCount > progressEventCount) {
    progressEventCount = agent.progress.eventCount;
    latestProgress = agent.progress.latest;
  }
  if (progressCardState.messageId || progressCardState.entries.length > 0) {
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
      messages: [],
      errors: [],
      declaredCount: 0,
      declaredMessageCount: 0,
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
  const dropStaleSession = isStaleAgentSessionResumeFailure(agent);
  if (dropStaleSession && currentSession) {
    deleteChannelConnectorAgentSession(agentSessionsPath(config), {
      bindingId: effectiveSessionLookup.bindingId,
      sessionKey: effectiveSessionLookup.sessionKey,
      sessionId: currentSession.id,
    });
  }
  if (!dropStaleSession && (agent.session.agentNativeSessionId || agent.session.codexThreadId || currentSession?.agentNativeSessionId || currentSession?.codexThreadId)) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      agentNativeSessionId: agent.session.agentNativeSessionId || currentSession?.agentNativeSessionId || agent.session.codexThreadId || currentSession?.codexThreadId || null,
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
    agentNativeSessionId: agent.session.agentNativeSessionId,
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
  let outboundMessageSentCount = 0;
  let outboundMessageRequestCount = 0;
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
  if (agent.ok === true && outboundReply.messages.length > 0) {
    const sentMessages = await sendFeishuOutboundMessages({
      config,
      transport,
      messages: outboundReply.messages,
    });
    outboundMessageSentCount = sentMessages.sentCount;
    outboundMessageRequestCount = sentMessages.requestCount;
    replyRequestCount = (replyRequestCount || 0) + sentMessages.requestCount;
    if (sentMessages.sentCount > 0) replySent = true;
    outboundFileErrors = [...outboundFileErrors, ...sentMessages.errors];
    if (sentMessages.errors.length > 0) {
      const result = await sendFeishuTextMessage(transport, {
        chatId: parsed.channelId,
        content: `消息发送失败：${sentMessages.errors.join("; ")}`,
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
    agentNativeSessionId: agent.session.agentNativeSessionId,
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
    outboundMessagesDeclared: outboundReply.declaredMessageCount,
    outboundMessagesSent: outboundMessageSentCount,
    outboundMessageRequestCount,
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
  markRuntimeDirty(config, state);
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
    markRuntimeDirty(config, state);
    return;
  }
  const resolved = await resolveOctoCredentials(config, binding);
  if (!resolved) {
    state.octoConnections[binding.id] = connectionState(binding, {
      state: "closed",
      apiUrl: transport.apiUrl,
      lastError: "octo_register_failed",
    });
    markRuntimeDirty(config, state);
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
      markRuntimeDirty(config, state);
    },
    onDisconnected: () => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      markRuntimeDirty(config, state);
    },
    onError: () => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      markRuntimeDirty(config, state);
    },
    onMessage: (message) => {
      state.octoConnections[binding.id] = octoStatus({
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      markRuntimeDirty(config, state);
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
        markRuntimeDirty(config, state);
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
  markRuntimeDirty(config, state);
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
          clientLoopActive: false,
          reconnects: 0,
          receivedMessages: 0,
          lastConnectedAt: null,
          lastDisconnectedAt: null,
          lastReceivedAt: null,
          lifecycleReceivedMessages: 0,
          lifecycleLastReceivedAt: null,
          suppressZeroInboundRenewal: false,
          lastReconnectingAt: null,
          reconnectingRecycles: 0,
          lastReconnectingRecycleAt: null,
          lastReconnectingRecycleReason: null,
          lastWatchdogRestartAt: null,
          lastWatchdogRestartReason: null,
          lastUnhealthyAt: null,
          lastError: "feishu_transport_config_missing",
          watchdogRestarting: false,
          zeroInboundRenewals: 0,
          ingressUnverifiedRenewals: 0,
          lastIngressUnverifiedRenewAt: null,
          verifiedIngressSilentRenewals: 0,
          lastVerifiedIngressSilentRenewAt: null,
          dispatcherCallbacks: 0,
          lastDispatcherCallbackAt: null,
          lastDispatcherEventType: null,
          lifecycleDispatcherCallbacks: 0,
          lifecycleLastDispatcherCallbackAt: null,
          rawEventFrames: 0,
          lifecycleRawEventFrames: 0,
          lastRawEventFrameAt: null,
          lastRawEventFrameType: null,
          rawEventHandlerErrors: 0,
          lastRawEventHandlerError: null,
          pingIntervalMs: 0,
          sentPings: 0,
          lastPingAt: null,
          receivedPongs: 0,
          lastPongAt: null,
          controlFrames: 0,
          lastControlFrameAt: null,
          lastControlFrameType: null,
          lockAcquired: false,
          lockOwnerPid: null,
          lockPath: null,
          lastLockRetryAt: null,
          recycleCurrentClient: null,
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
        clientLoopActive: false,
        reconnects: 0,
        receivedMessages: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastReceivedAt: null,
        lifecycleReceivedMessages: 0,
        lifecycleLastReceivedAt: null,
        suppressZeroInboundRenewal: false,
        lastReconnectingAt: null,
        reconnectingRecycles: 0,
        lastReconnectingRecycleAt: null,
        lastReconnectingRecycleReason: null,
        lastWatchdogRestartAt: null,
        lastWatchdogRestartReason: null,
        lastUnhealthyAt: null,
        lastError: null,
        watchdogRestarting: false,
        zeroInboundRenewals: 0,
        ingressUnverifiedRenewals: 0,
        lastIngressUnverifiedRenewAt: null,
        verifiedIngressSilentRenewals: 0,
        lastVerifiedIngressSilentRenewAt: null,
        dispatcherCallbacks: 0,
        lastDispatcherCallbackAt: null,
        lastDispatcherEventType: null,
        lifecycleDispatcherCallbacks: 0,
        lifecycleLastDispatcherCallbackAt: null,
        rawEventFrames: 0,
        lifecycleRawEventFrames: 0,
        lastRawEventFrameAt: null,
        lastRawEventFrameType: null,
        rawEventHandlerErrors: 0,
        lastRawEventHandlerError: null,
        pingIntervalMs: 0,
        sentPings: 0,
        lastPingAt: null,
        receivedPongs: 0,
        lastPongAt: null,
        controlFrames: 0,
        lastControlFrameAt: null,
        lastControlFrameType: null,
        lockAcquired: false,
        lockOwnerPid: null,
        lockPath: null,
        lastLockRetryAt: null,
        recycleCurrentClient: null,
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

function markFeishuDispatcherCallback(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  group: ChannelDaemonFeishuGroup;
  eventType: string;
  persist?: boolean;
}): string {
  const receivedAt = new Date().toISOString();
  input.group.dispatcherCallbacks += 1;
  input.group.lifecycleDispatcherCallbacks += 1;
  input.group.lastDispatcherCallbackAt = receivedAt;
  input.group.lifecycleLastDispatcherCallbackAt = receivedAt;
  input.group.lastDispatcherEventType = input.eventType;
  input.group.ingressUnverifiedRenewals = 0;
  input.group.lastIngressUnverifiedRenewAt = null;
  input.group.suppressZeroInboundRenewal = false;
  if (input.persist) {
    updateFeishuRuntime(input.config, input.state, input.group);
  }
  return receivedAt;
}

function markFeishuBusinessIngress(group: ChannelDaemonFeishuGroup, receivedAt: string): void {
  group.receivedMessages += 1;
  group.lifecycleReceivedMessages += 1;
  group.lastReceivedAt = receivedAt;
  group.lifecycleLastReceivedAt = receivedAt;
  group.zeroInboundRenewals = 0;
  group.ingressUnverifiedRenewals = 0;
  group.lastIngressUnverifiedRenewAt = null;
  group.verifiedIngressSilentRenewals = 0;
  group.lastVerifiedIngressSilentRenewAt = null;
  group.suppressZeroInboundRenewal = false;
}

function resetFeishuLifecycleIngressEvidence(group: ChannelDaemonFeishuGroup): void {
  group.lifecycleReceivedMessages = 0;
  group.lifecycleLastReceivedAt = null;
  group.lifecycleDispatcherCallbacks = 0;
  group.lifecycleLastDispatcherCallbackAt = null;
  group.lifecycleRawEventFrames = 0;
  group.lastRawEventFrameAt = null;
  group.lastRawEventFrameType = null;
  group.lastRawEventHandlerError = null;
  group.sentPings = 0;
  group.lastPingAt = null;
  group.receivedPongs = 0;
  group.lastPongAt = null;
  group.controlFrames = 0;
  group.lastControlFrameAt = null;
  group.lastControlFrameType = null;
}

function feishuFrameType(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.headers)) return null;
  const header = data.headers.find((item) => isRecord(item) && item.key === "type");
  return isRecord(header) && typeof header.value === "string" ? header.value : null;
}

function feishuClientPingIntervalMs(client: WSClient | null): number {
  const wsConfig = (client as unknown as {
    wsConfig?: { getWS?: (key: string) => unknown };
  } | null)?.wsConfig;
  const value = wsConfig?.getWS?.("pingInterval");
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function setFeishuClientPingIntervalMs(client: WSClient, pingIntervalMs: number): number {
  const wsConfig = (client as unknown as {
    wsConfig?: {
      getWS?: (key: string) => unknown;
      updateWs?: (value: Record<string, unknown>) => void;
    };
  }).wsConfig;
  if (!wsConfig?.updateWs) return feishuClientPingIntervalMs(client);
  const current = feishuClientPingIntervalMs(client);
  if (pingIntervalMs > 0 && (current <= 0 || current > pingIntervalMs)) {
    wsConfig.updateWs({ pingInterval: pingIntervalMs });
  }
  return feishuClientPingIntervalMs(client);
}

function clampFeishuSdkPingLoop(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  group: ChannelDaemonFeishuGroup;
  client: WSClient;
  pingIntervalMs: number;
}): void {
  const { config, group, client, pingIntervalMs } = input;
  if (pingIntervalMs <= 0) return;
  const sdkClient = client as unknown as {
    pingLoop?: () => void;
  };
  const originalPingLoop = sdkClient.pingLoop?.bind(client);
  if (!originalPingLoop) {
    appendLog(config.paths.log, "Feishu WebSocket ping interval clamp unavailable", {
      key: group.key,
      pingIntervalMs,
    });
    return;
  }
  sdkClient.pingLoop = () => {
    group.pingIntervalMs = setFeishuClientPingIntervalMs(client, pingIntervalMs) || group.pingIntervalMs || pingIntervalMs;
    return originalPingLoop();
  };
  group.pingIntervalMs = setFeishuClientPingIntervalMs(client, pingIntervalMs) || pingIntervalMs;
}

function markFeishuControlFrame(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  group: ChannelDaemonFeishuGroup;
  direction: "inbound" | "outbound";
  frameType: string | null;
}): void {
  const { config, state, group, direction, frameType } = input;
  if (!frameType) return;
  const now = new Date().toISOString();
  group.controlFrames += 1;
  group.lastControlFrameAt = now;
  group.lastControlFrameType = `${direction}:${frameType}`;
  group.pingIntervalMs = feishuPingIntervalMs(group) || feishuClientPingIntervalMs(group.client) || group.pingIntervalMs;
  if (direction === "outbound" && frameType === "ping") {
    group.sentPings += 1;
    group.lastPingAt = now;
  }
  if (direction === "inbound" && frameType === "pong") {
    group.receivedPongs += 1;
    group.lastPongAt = now;
  }
  updateFeishuRuntime(config, state, group);
}

function markFeishuRawEventFrame(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  group: ChannelDaemonFeishuGroup;
  frameType: string | null;
}): void {
  const { config, state, group, frameType } = input;
  const now = new Date().toISOString();
  group.rawEventFrames += 1;
  group.lifecycleRawEventFrames += 1;
  group.lastRawEventFrameAt = now;
  group.lastRawEventFrameType = frameType;
  updateFeishuRuntime(config, state, group);
}

function markFeishuRawEventHandlerError(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  group: ChannelDaemonFeishuGroup;
  error: unknown;
}): void {
  const { config, state, group, error } = input;
  group.rawEventHandlerErrors += 1;
  group.lastRawEventHandlerError = shortMessage(error);
  group.lastError = group.lastRawEventHandlerError;
  updateFeishuRuntime(config, state, group);
}

function attachFeishuControlFrameProbe(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  group: ChannelDaemonFeishuGroup;
  client: WSClient;
}): void {
  const { config, state, group, client } = input;
  const probe = client as unknown as {
    sendMessage?: (data: unknown) => void;
    handleControlData?: (data: unknown) => Promise<void>;
    handleEventData?: (data: unknown) => Promise<void>;
  };
  const originalSendMessage = probe.sendMessage?.bind(client);
  if (originalSendMessage) {
    probe.sendMessage = (data: unknown) => {
      markFeishuControlFrame({
        config,
        state,
        group,
        direction: "outbound",
        frameType: feishuFrameType(data),
      });
      originalSendMessage(data);
    };
  }
  const originalHandleControlData = probe.handleControlData?.bind(client);
  if (originalHandleControlData) {
    probe.handleControlData = async (data: unknown) => {
      try {
        return await originalHandleControlData(data);
      } finally {
        markFeishuControlFrame({
          config,
          state,
          group,
          direction: "inbound",
          frameType: feishuFrameType(data),
        });
      }
    };
  }
  const originalHandleEventData = probe.handleEventData?.bind(client);
  if (originalHandleEventData) {
    probe.handleEventData = async (data: unknown) => {
      markFeishuRawEventFrame({
        config,
        state,
        group,
        frameType: feishuFrameType(data),
      });
      try {
        return await originalHandleEventData(data);
      } catch (error) {
        markFeishuRawEventHandlerError({
          config,
          state,
          group,
          error,
        });
        throw error;
      }
    };
  }
}

function createFeishuDispatcher(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  seenMessages: Map<string, number>;
}): EventDispatcher {
  const { config, state, activeRunCancels, group, seenMessages } = input;
  const verificationToken = feishuDispatcherVerificationToken(group);
  const encryptKey = feishuDispatcherEncryptKey(group);
  const dispatcher = new EventDispatcher({
    verificationToken: verificationToken || undefined,
    encryptKey: encryptKey || undefined,
    logger: feishuLogger(config),
    loggerLevel: LoggerLevel.info,
  });
  dispatcher.register({
    "im.message.receive_v1": async (data: unknown) => {
      const receivedAt = markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "im.message.receive_v1",
      });
      markFeishuBusinessIngress(group, receivedAt);
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
        ...feishuTimingLogFields(parsed),
        longConnection: true,
        rawEventShape: isRecord(data) ? Object.keys(data).slice(0, 12) : [],
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
      const receivedAt = markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "card.action.trigger",
      });
      markFeishuBusinessIngress(group, receivedAt);
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "card.action.trigger", data));
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
        ...feishuTimingLogFields(parsed),
        longConnection: true,
        rawEventShape: isRecord(data) ? Object.keys(data).slice(0, 12) : [],
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
    "application.bot.menu_v6": async (data: unknown) => {
      const receivedAt = markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "application.bot.menu_v6",
      });
      markFeishuBusinessIngress(group, receivedAt);
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "application.bot.menu_v6", data));
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
        ...feishuTimingLogFields(parsed),
        longConnection: true,
        rawEventShape: isRecord(data) ? Object.keys(data).slice(0, 12) : [],
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
    "im.message.recalled_v1": async (data: unknown) => {
      const receivedAt = markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "im.message.recalled_v1",
        persist: true,
      });
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: receivedAt,
        adapter: "feishu",
        eventKind: "message-recalled",
        eventType: "im.message.recalled_v1",
        longConnection: true,
        rawEventShape: isRecord(data) ? Object.keys(data).slice(0, 12) : [],
      });
    },
    "im.message.read_v1": async () => {
      markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "im.message.read_v1",
        persist: true,
      });
    },
    "im.message.reaction.created_v1": async () => {
      markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "im.message.reaction.created_v1",
        persist: true,
      });
    },
    "im.message.reaction.deleted_v1": async () => {
      markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "im.message.reaction.deleted_v1",
        persist: true,
      });
    },
    "chat.access_event.bot_p2p_chat_entered_v1": async () => {
      markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "chat.access_event.bot_p2p_chat_entered_v1",
        persist: true,
      });
    },
    "p2p_chat.created_v1": async () => {
      markFeishuDispatcherCallback({
        config,
        state,
        group,
        eventType: "p2p_chat.created_v1",
        persist: true,
      });
    },
  });
  return dispatcher;
}

function getFeishuWsReconnectDelayMs(attempt: number): number {
  return Math.min(
    FEISHU_WS_RECONNECT_INITIAL_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    FEISHU_WS_RECONNECT_MAX_DELAY_MS,
  );
}

function isFeishuWsTerminalError(error: Error): boolean {
  const message = error.message.trim();
  return (
    FEISHU_WS_RECONNECT_EXHAUSTED_RE.test(message)
    || message.startsWith(FEISHU_WS_AUTORECONNECT_DISABLED_ERROR)
  );
}

function waitForAbortableDelay(delayMs: number, abortSignal?: AbortSignal): Promise<boolean> {
  if (abortSignal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(false);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish(true), delayMs);
    timer.unref?.();
  });
}

function waitForFeishuWsCycleEnd(input: {
  abortSignal?: AbortSignal;
  terminalError: Promise<Error>;
}): Promise<"abort" | Error> {
  if (input.abortSignal?.aborted) return Promise.resolve("abort");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: "abort" | Error) => {
      if (settled) return;
      settled = true;
      input.abortSignal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish("abort");
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
    void input.terminalError.then(finish);
  });
}

function closeFeishuGroupWsClient(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  client?: WSClient | null;
  reason: string;
}): void {
  const { config, group, clients, client, reason } = input;
  if (!client) return;
  const index = clients.indexOf(client);
  if (index >= 0) clients.splice(index, 1);
  if (group.client === client) group.client = null;
  try {
    client.close({ force: true });
  } catch (error) {
    appendLog(config.paths.log, "Feishu WebSocket close failed", {
      key: group.key,
      reason,
      error: shortMessage(error),
    });
  }
}

async function runFeishuGroupClientLoop(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  seenMessages: Map<string, number>;
  abortSignal: AbortSignal;
  dispatcher: EventDispatcher;
}): Promise<void> {
  const { config, state, group, clients, abortSignal, dispatcher } = input;
  let attempt = 0;
  try {
    while (!abortSignal.aborted) {
      let client: WSClient | null = null;
      try {
        let reportTerminalError: (error: Error) => void = () => {};
        const terminalError = new Promise<Error>((resolve) => {
          reportTerminalError = resolve;
        });
        let cycleEndReported = false;
        const reportCycleEnd = (error: Error) => {
          if (cycleEndReported) return;
          cycleEndReported = true;
          reportTerminalError(error);
        };
        const pingTimeoutSeconds = feishuPingTimeoutSeconds(group);
        const pingIntervalMs = feishuPingIntervalMs(group);
        appendLog(config.paths.log, "Feishu WebSocket starting connection", {
          key: group.key,
          appId: group.appId,
          pingTimeoutSeconds,
          pingIntervalMs,
        });
        client = new WSClient({
          appId: group.appId,
          appSecret: group.refs[0].transport.appSecret,
          domain: metadataString(group.refs[0].binding, ["domain", "apiUrl", "api_url", "baseUrl", "base_url"]) || undefined,
          logger: feishuLogger(config),
          loggerLevel: LoggerLevel.info,
          // The SDK only arms its liveness watchdog when lower-case
          // `pingTimeout` is set. This is the primary protection against
          // half-open Feishu sockets that keep reporting `connected`.
          ...(pingTimeoutSeconds > 0 ? { wsConfig: { pingTimeout: pingTimeoutSeconds } } : {}),
          handshakeTimeoutMs: DEFAULT_FEISHU_HANDSHAKE_TIMEOUT_MS,
          onReady: () => {
            group.lastConnectedAt = new Date().toISOString();
            group.lastDisconnectedAt = null;
            group.lastReconnectingAt = null;
            resetFeishuLifecycleIngressEvidence(group);
            group.lastUnhealthyAt = null;
            group.lastError = null;
            group.watchdogRestarting = false;
            appendLog(config.paths.log, "Feishu WebSocket connected", {
              key: group.key,
              bindingIds: group.refs.map((ref) => ref.binding.id),
              pingTimeoutSeconds,
              pingIntervalMs,
              dispatcherVerificationConfigured: Boolean(feishuDispatcherVerificationToken(group)),
              dispatcherEncryptConfigured: Boolean(feishuDispatcherEncryptKey(group)),
            });
            updateFeishuRuntime(config, state, group);
          },
          onError: (error) => {
            const terminal = isFeishuWsTerminalError(error);
            group.lastError = shortMessage(error);
            group.lastDisconnectedAt = new Date().toISOString();
            group.lastUnhealthyAt ||= group.lastDisconnectedAt;
            appendLog(config.paths.log, terminal
              ? "Feishu WebSocket SDK reported terminal error"
              : "Feishu WebSocket SDK reported recoverable error", {
              key: group.key,
              error: group.lastError,
            });
            updateFeishuRuntime(config, state, group);
            if (terminal) reportCycleEnd(error);
          },
          onReconnecting: () => {
            const now = new Date().toISOString();
            group.reconnects += 1;
            group.lastDisconnectedAt = now;
            group.lastUnhealthyAt ||= group.lastDisconnectedAt;
            group.lastReconnectingAt ||= now;
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
            group.lastReconnectingAt = null;
            resetFeishuLifecycleIngressEvidence(group);
            group.lastUnhealthyAt = null;
            group.lastError = null;
            group.watchdogRestarting = false;
            appendLog(config.paths.log, "Feishu WebSocket reconnected", {
              key: group.key,
              reconnects: group.reconnects,
              pingTimeoutSeconds,
              pingIntervalMs,
              dispatcherVerificationConfigured: Boolean(feishuDispatcherVerificationToken(group)),
              dispatcherEncryptConfigured: Boolean(feishuDispatcherEncryptKey(group)),
            });
            updateFeishuRuntime(config, state, group);
          },
        });
        clampFeishuSdkPingLoop({
          config,
          group,
          client,
          pingIntervalMs,
        });
        attachFeishuControlFrameProbe({
          config,
          state,
          group,
          client,
        });
        const recycleCurrentClient = (reason: string) => {
          if (!client || group.client !== client) return;
          const recycledAt = new Date().toISOString();
          const reconnectingSinceMs = Date.parse(group.lastReconnectingAt || "");
          const reconnectingForMs = Number.isFinite(reconnectingSinceMs)
            ? Math.max(0, Date.now() - reconnectingSinceMs)
            : 0;
          group.reconnectingRecycles += 1;
          group.lastReconnectingRecycleAt = recycledAt;
          group.lastReconnectingRecycleReason = reason;
          group.lastError = reason;
          group.lastDisconnectedAt = recycledAt;
          group.lastUnhealthyAt ||= recycledAt;
          appendLog(config.paths.log, reason.startsWith("startup_ingress_unverified_")
            ? "Feishu WebSocket startup ingress validation cycle ended; recreating client"
            : "Feishu WebSocket reconnecting exceeded limit; recycling client", {
            key: group.key,
            reason,
            reconnectingForMs,
            reconnectingRecycles: group.reconnectingRecycles,
            state: group.client?.getConnectionStatus()?.state || "unknown",
          });
          updateFeishuRuntime(config, state, group);
          reportCycleEnd(new Error(reason));
        };
        group.recycleCurrentClient = recycleCurrentClient;
        group.client = client;
        clients.push(client);
        updateFeishuRuntime(config, state, group);
        await client.start({ eventDispatcher: dispatcher });
        attempt = 0;
        appendLog(config.paths.log, "Feishu WebSocket client started", {
          key: group.key,
          pingTimeoutSeconds,
          pingIntervalMs,
        });
        const cycleEnd = await waitForFeishuWsCycleEnd({ abortSignal, terminalError });
        if (group.recycleCurrentClient === recycleCurrentClient) {
          group.recycleCurrentClient = null;
        }
        if (cycleEnd === "abort") break;
        closeFeishuGroupWsClient({
          config,
          group,
          clients,
          client,
          reason: "terminal-error",
        });
        group.lastError = shortMessage(cycleEnd);
        group.lastDisconnectedAt = new Date().toISOString();
        group.lastUnhealthyAt ||= group.lastDisconnectedAt;
        updateFeishuRuntime(config, state, group);
        attempt += 1;
        const delayMs = getFeishuWsReconnectDelayMs(attempt);
        appendLog(config.paths.log, "Feishu WebSocket connection ended; recreating client", {
          key: group.key,
          delayMs,
          error: group.lastError,
        });
        const shouldRetry = await waitForAbortableDelay(delayMs, abortSignal);
        if (!shouldRetry) break;
      } catch (error) {
        closeFeishuGroupWsClient({
          config,
          group,
          clients,
          client,
          reason: "start-failed",
        });
        group.recycleCurrentClient = null;
        group.lastReconnectingAt = null;
        if (abortSignal.aborted) break;
        group.lastError = shortMessage(error);
        group.lastDisconnectedAt = new Date().toISOString();
        group.lastUnhealthyAt ||= group.lastDisconnectedAt;
        updateFeishuRuntime(config, state, group);
        attempt += 1;
        const delayMs = getFeishuWsReconnectDelayMs(attempt);
        appendLog(config.paths.log, "Feishu WebSocket start failed; retrying", {
          key: group.key,
          delayMs,
          error: group.lastError,
        });
        const shouldRetry = await waitForAbortableDelay(delayMs, abortSignal);
        if (!shouldRetry) break;
      }
    }
  } finally {
    closeFeishuGroupWsClient({
      config,
      group,
      clients,
      client: group.client,
      reason: "loop-stop",
    });
    group.clientLoopActive = false;
    group.watchdogRestarting = false;
    group.recycleCurrentClient = null;
    group.lastReconnectingAt = null;
    group.lastDisconnectedAt ||= new Date().toISOString();
    updateFeishuRuntime(config, state, group);
    releaseFeishuGroupLock(config, group);
  }
}

function startFeishuClientForGroup(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  group: ChannelDaemonFeishuGroup;
  clients: WSClient[];
  clientAbortControllers: AbortController[];
  seenMessages: Map<string, number>;
}): void {
  const { config, state, activeRunCancels, group, clients, clientAbortControllers, seenMessages } = input;
  if (group.clientLoopActive) return;
  if (!acquireFeishuGroupLock(config, group)) {
    appendLog(config.paths.log, "Feishu WebSocket local owner lock held; skipping client start", {
      key: group.key,
      appId: group.appId,
      lockPath: group.lockPath,
      ownerPid: group.lockOwnerPid,
      error: group.lastError,
    });
    state.feishuConnections[group.key] = feishuConnectionState(group);
    markRuntimeDirty(config, state);
    return;
  }
  const dispatcher = createFeishuDispatcher({
    config,
    state,
    activeRunCancels,
    group,
    seenMessages,
  });
  group.clientLoopActive = true;
  const abortController = new AbortController();
  clientAbortControllers.push(abortController);
  updateFeishuRuntime(config, state, group);
  void runFeishuGroupClientLoop({
    config,
    state,
    activeRunCancels,
    group,
    clients,
    seenMessages,
    abortSignal: abortController.signal,
    dispatcher,
  }).catch((error) => {
    group.lastError = shortMessage(error);
    group.clientLoopActive = false;
    appendLog(config.paths.log, "Feishu WebSocket client loop failed", {
      key: group.key,
      error: group.lastError,
    });
    updateFeishuRuntime(config, state, group);
  });
}

function startFeishuWatchdog(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  state: ChannelDaemonState;
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry;
  groups: ChannelDaemonFeishuGroup[];
  clients: WSClient[];
  clientAbortControllers: AbortController[];
  seenMessages: Map<string, number>;
}): NodeJS.Timeout {
  const { config, state, activeRunCancels, groups, clients, clientAbortControllers, seenMessages } = input;
  const timer = setInterval(() => {
    const nowMs = Date.now();
    for (const group of groups) {
      if (!group.refs.length) continue;
      if (!group.client) {
        state.feishuConnections[group.key] = feishuConnectionState(group);
        const retryAfterMs = feishuLockRetryMs(group);
        const lastRetryMs = group.lastLockRetryAt ? Date.parse(group.lastLockRetryAt) : NaN;
        if (!group.clientLoopActive && !group.lockAcquired && (!Number.isFinite(lastRetryMs) || nowMs - lastRetryMs >= retryAfterMs)) {
          group.lastLockRetryAt = new Date().toISOString();
          startFeishuClientForGroup({
            config,
            state,
            activeRunCancels,
            group,
            clients,
            clientAbortControllers,
            seenMessages,
          });
        }
        continue;
      }
      const status = group.client.getConnectionStatus();
      if (status?.state === "connected") {
        group.lastUnhealthyAt = null;
        group.lastReconnectingAt = null;
        group.watchdogRestarting = false;
        group.pingIntervalMs = feishuPingIntervalMs(group) || feishuClientPingIntervalMs(group.client) || group.pingIntervalMs;
        const pongTimeoutMs = feishuPongTimeoutMs(group);
        const pongTimeoutState = feishuPongTimeoutState(group, nowMs);
        const transportStaleState = feishuTransportStaleState(group, nowMs);
        if (
          pongTimeoutState.overdue
          && group.recycleCurrentClient
        ) {
          const reason = `sdk_pong_timeout_${pongTimeoutMs}ms`;
          appendLog(config.paths.log, "Feishu WebSocket pong timeout; recycling client", {
            key: group.key,
            reason,
            sentPings: group.sentPings,
            receivedPongs: group.receivedPongs,
            lastPingAt: group.lastPingAt,
            lastPongAt: group.lastPongAt,
            pongWaitingForMs: pongTimeoutState.waitingForMs,
            pingIntervalMs: group.pingIntervalMs,
            pongTimeoutMs,
          });
          updateFeishuRuntime(config, state, group);
          group.recycleCurrentClient(reason);
          state.feishuConnections[group.key] = feishuConnectionState(group);
          continue;
        }
        if (
          transportStaleState.stale
          && group.recycleCurrentClient
        ) {
          const reason = `sdk_transport_stale_${transportStaleState.staleAfterMs}ms`;
          appendLog(config.paths.log, "Feishu WebSocket transport stale; recycling client", {
            key: group.key,
            reason,
            sentPings: group.sentPings,
            receivedPongs: group.receivedPongs,
            lastControlFrameAt: group.lastControlFrameAt,
            lastControlFrameType: group.lastControlFrameType,
            transportStaleForMs: transportStaleState.staleForMs,
            transportStaleAfterMs: transportStaleState.staleAfterMs,
            pingIntervalMs: group.pingIntervalMs,
            pongTimeoutMs,
          });
          updateFeishuRuntime(config, state, group);
          group.recycleCurrentClient(reason);
          state.feishuConnections[group.key] = feishuConnectionState(group);
          continue;
        }
        const renewAfterMs = feishuIngressUnverifiedRenewDelayMs(group);
        const renewMax = feishuIngressUnverifiedRenewMax(group);
        const connectedAtMs = Date.parse(group.lastConnectedAt || "");
        const connectedForMs = Number.isFinite(connectedAtMs)
          ? Math.max(0, nowMs - connectedAtMs)
          : 0;
        if (
          group.lifecycleRawEventFrames === 0
          && group.lifecycleDispatcherCallbacks === 0
          && renewAfterMs > 0
          && renewMax > 0
          && group.ingressUnverifiedRenewals < renewMax
          && connectedForMs >= renewAfterMs
          && group.recycleCurrentClient
        ) {
          group.ingressUnverifiedRenewals += 1;
          group.lastIngressUnverifiedRenewAt = new Date().toISOString();
          const reason = `startup_ingress_unverified_${renewAfterMs}ms`;
          appendLog(config.paths.log, "Feishu WebSocket startup ingress validation missing; recycling client", {
            key: group.key,
            reason,
            connectedForMs,
            ingressUnverifiedAfterMs: feishuIngressUnverifiedAfterMs(group),
            ingressUnverifiedRenewDelayMs: renewAfterMs,
            ingressUnverifiedRenewals: group.ingressUnverifiedRenewals,
            ingressUnverifiedRenewMax: renewMax,
          });
          updateFeishuRuntime(config, state, group);
          group.recycleCurrentClient(reason);
          state.feishuConnections[group.key] = feishuConnectionState(group);
          continue;
        }
        state.feishuConnections[group.key] = feishuConnectionState(group);
        continue;
      }
      if (status?.state === "reconnecting") {
        const reconnectingStartedAt = group.lastReconnectingAt || new Date().toISOString();
        group.lastReconnectingAt = reconnectingStartedAt;
        group.lastUnhealthyAt ||= reconnectingStartedAt;
        const startedAtMs = Date.parse(reconnectingStartedAt);
        const reconnectingForMs = Number.isFinite(startedAtMs)
          ? Math.max(0, nowMs - startedAtMs)
          : 0;
        const recycleAfterMs = feishuReconnectingRecycleMs(group);
        if (recycleAfterMs > 0 && reconnectingForMs >= recycleAfterMs && group.recycleCurrentClient) {
          group.recycleCurrentClient(`sdk_reconnecting_timeout_${recycleAfterMs}ms`);
        }
        state.feishuConnections[group.key] = feishuConnectionState(group);
        continue;
      }
      const unhealthyAt = group.lastUnhealthyAt || new Date().toISOString();
      group.lastUnhealthyAt = unhealthyAt;
      group.lastReconnectingAt = null;
      state.feishuConnections[group.key] = feishuConnectionState(group);
    }
    markRuntimeDirty(config, state);
  }, 5_000);
  timer.unref();
  return timer;
}

async function startFeishuConnections(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
  activeRunCancels: ChannelDaemonActiveRunCancelRegistry,
  clients: WSClient[],
  clientAbortControllers: AbortController[],
  seenMessages: Map<string, number>,
  groupsOut?: ChannelDaemonFeishuGroup[],
): Promise<NodeJS.Timeout | null> {
  const groups = createFeishuGroups(config);
  groupsOut?.push(...groups);
  for (const group of groups) {
    if (!group.refs.length) {
      state.feishuConnections[group.key] = feishuConnectionState(group);
      markRuntimeDirty(config, state);
      continue;
    }
    startFeishuClientForGroup({
      config,
      state,
      activeRunCancels,
      group,
      clients,
      clientAbortControllers,
      seenMessages,
    });
  }
  return groups.some((group) => group.refs.length)
    ? startFeishuWatchdog({ config, state, activeRunCancels, groups, clients, clientAbortControllers, seenMessages })
    : null;
}

async function main(): Promise<void> {
  const configPath = configPathFromArgv(process.argv.slice(2));
  const config = readConfig(configPath);
  ensureDir(config.paths.root);
  ensureDir(config.paths.state);
  const state = createDaemonState(config);
  flushRuntime(config, state);
  appendLog(config.paths.log, "Studio native Channel Connectors daemon started");
  const server = startHttp(config, state);
  const sockets: OctoWukongSocket[] = [];
  const octoRestHeartbeatTimers: NodeJS.Timeout[] = [];
  const feishuClients: WSClient[] = [];
  const feishuClientAbortControllers: AbortController[] = [];
  const feishuGroups: ChannelDaemonFeishuGroup[] = [];
  const activeRunCancels: ChannelDaemonActiveRunCancelRegistry = new Map();
  const seenMessages = loadFeishuSeenMessages(config);
  const agentSessionReaper = startAgentSessionDriverReaper(config, state);
  let feishuWatchdog: NodeJS.Timeout | null = null;

  void startOctoConnections(config, state, activeRunCancels, sockets, octoRestHeartbeatTimers, seenMessages).catch((error) => {
    appendLog(config.paths.log, "Octo connection startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  void (async () => {
    let attempt = 0;
    while (true) {
      try {
        const timer = await startFeishuConnections(config, state, activeRunCancels, feishuClients, feishuClientAbortControllers, seenMessages, feishuGroups);
        feishuWatchdog = timer;
        return;
      } catch (error) {
        attempt += 1;
        const delayMs = Math.min(30_000 * 2 ** Math.min(attempt - 1, 4), 300_000);
        appendLog(config.paths.log, "Feishu connection startup failed, retrying", {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          retryInMs: delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  })();

  const stop = () => {
    appendLog(config.paths.log, "Studio native Channel Connectors daemon stopping");
    if (feishuWatchdog) clearInterval(feishuWatchdog);
    if (agentSessionReaper) clearInterval(agentSessionReaper);
    for (const entry of activeRunCancels.values()) entry.controller.abort();
    for (const controller of feishuClientAbortControllers) controller.abort();
    for (const timer of octoRestHeartbeatTimers) clearInterval(timer);
    for (const socket of sockets) socket.disconnect();
    for (const client of feishuClients) client.close({ force: true });
    for (const group of feishuGroups) releaseFeishuGroupLock(config, group);
    flushRuntime(config, state);
    const forceExitTimer = setTimeout(() => {
      process.stderr.write("channel-connectors daemon: forced exit after 5s timeout\n");
      process.exit(0);
    }, 5000);
    forceExitTimer.unref();
    server.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
