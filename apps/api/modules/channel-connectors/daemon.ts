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
  ChannelConnectorFeishuTransportConfig,
  ChannelConnectorFeishuTransportResult,
  ChannelConnectorAgentProfile,
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
  upsertChannelConnectorAgentSession,
  type ChannelConnectorAgentSessionRecord,
} from "./agent-session-store.js";
import {
  handleChannelConnectorCommand,
  resolveChannelConnectorEffectiveProject,
} from "./command-router.js";
import {
  getChannelConnectorSessionControl,
} from "./session-control-store.js";
import {
  resolveChannelConnectorGatewayClientKey,
} from "./gateway-secret.js";
import {
  getOctoCachedCredentials,
  saveOctoCachedCredentials,
  type OctoCredentialCacheEntry,
} from "./octo-credential-cache.js";
import {
  buildOctoSessionKey,
  extractOctoContent,
  isOctoMessageDirectedAtBot,
  renderOctoTextReply,
  shouldSkipOctoMessage,
} from "./octo-adapter.js";
import {
  parseChannelConnectorFeishuWebhook,
  type ChannelConnectorFeishuParsedWebhook,
} from "./feishu-adapter.js";
import {
  addFeishuMessageReaction,
  feishuTransportFromMetadata,
  patchFeishuCardMessage,
  removeFeishuMessageReaction,
  sendFeishuCardMessage,
  sendFeishuTextMessage,
} from "./feishu-transport.js";
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
  sendOctoTextReply,
  sendOctoTyping,
} from "./octo-transport.js";
import {
  deriveOctoWsUrl,
  OctoWukongSocket,
  type OctoWukongLogger,
  type OctoWukongSocketStatus,
} from "./octo-wukong.js";

interface ChannelDaemonOctoConnectionState extends OctoWukongSocketStatus {
  accountId: string;
  botId: string | null;
  robotId: string | null;
  apiUrl: string | null;
  credentialSource: "register" | "cache" | null;
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
  lastError: string | null;
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
  }>;
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
  const redacted = raw
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***")
    .replace(/bf_[A-Za-z0-9_-]{12,}/g, "bf_***")
    .replace(/(app_secret|appSecret|tenant_access_token|token)[^,\n}]*/gi, "$1=***")
    .trim();
  if (!redacted) return "unknown error";
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}...` : redacted;
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

function agentSessionsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-sessions.json");
}

function sessionControlsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-session-controls.json");
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
  const channelId = normalizeString(parsed.channelId);
  const fromUid = normalizeString(parsed.fromUid);
  if (!channelId && !fromUid) return null;
  const threadIsolation = metadataBoolean(binding, ["threadIsolation", "thread_isolation"], false);
  const isGroup = normalizeString(parsed.chatType).toLowerCase() === "group";
  if (threadIsolation && isGroup) {
    const threadId = normalizeString(parsed.threadId)
      || normalizeString(parsed.rootId)
      || normalizeString(parsed.parentId)
      || normalizeString(parsed.messageId)
      || channelId;
    return `feishu:${channelId || "unknown"}:thread:${threadId}`;
  }
  return `feishu:${channelId || fromUid}:${fromUid || channelId}`;
}

function feishuMessageFromParsed(
  parsed: ChannelConnectorFeishuParsedWebhook,
  content: string,
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
    members: [],
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

function isFeishuMenuCommand(command: ReturnType<typeof handleChannelConnectorCommand> extends Promise<infer Result> ? Result : never): boolean {
  return command.action === "help"
    || ["start", "help", "menu", "commands", "command", "cmd"].includes(normalizeString(command.command).toLowerCase());
}

function buildFeishuCommandCard(input: {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  sessionKey: string;
  selectedSectionId?: string | null;
  selectedViewId?: string | null;
}) {
  const control = getChannelConnectorSessionControl(sessionControlsPath(input.config), {
    bindingId: input.binding.id,
    sessionKey: input.sessionKey,
  });
  return renderChannelConnectorCommandSurfaceFeishu(buildChannelConnectorCommandSurface({
    config: input.config,
    project: input.project,
    binding: input.binding,
    control,
    sessionKey: input.sessionKey,
    selectedSectionId: input.selectedSectionId,
    selectedViewId: input.selectedViewId,
  }));
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
}): Promise<ChannelConnectorFeishuTransportResult & { card: ReturnType<typeof buildFeishuCommandCard> }> {
  const selection = feishuMenuSelectionFromParsed(input.parsed);
  const card = buildFeishuCommandCard({
    ...input,
    ...selection,
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

function pruneSeenMessages(seenMessages: Map<string, number>): void {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [key, timestamp] of seenMessages.entries()) {
    if (timestamp < cutoff) seenMessages.delete(key);
  }
}

function shouldSkipSeenMessage(seenMessages: Map<string, number>, messageId: string): boolean {
  pruneSeenMessages(seenMessages);
  if (seenMessages.has(messageId)) return true;
  seenMessages.set(messageId, Date.now());
  return false;
}

function feishuDedupeKey(
  group: ChannelDaemonFeishuGroup,
  parsed: ChannelConnectorFeishuParsedWebhook,
  binding: ChannelConnectorRuntimeBinding,
  messageId: string,
): string | null {
  const eventId = normalizeString(parsed.eventId);
  if (eventId) return `feishu:${group.key}:event:${eventId}:${binding.id}`;
  if (parsed.kind === "message") return `feishu:${group.key}:message:${messageId}:${binding.id}`;
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
  const checkedAt = new Date().toISOString();
  if (skippedReason) {
    writeJsonLine(config.paths.octoEvents, {
      checkedAt,
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      skippedReason,
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
    gatewayClientKey: key,
  });
  if (command.handled) {
    let replySent = false;
    if (transport && command.replyText) {
      const replyPlan = renderOctoTextReply(message, command.replyText);
      if (replyPlan) {
        const result = await sendOctoTextReply(transport, replyPlan);
        replySent = result.ok === true;
      }
    }
    writeJsonLine(config.paths.octoEvents, {
      checkedAt,
      eventKind: "channel.command",
      adapter: "octo",
      bindingId: binding.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      fromUid: message.fromUid,
      command: command.command,
      commandAction: command.action,
      commandOk: command.ok,
      replySent,
    });
    writeRuntime(config, state);
    return;
  }
  const agentMessage = command.passthroughText
    ? {
      ...message,
      payload: {
        ...message.payload,
        content: command.passthroughText,
      },
    }
    : message;
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
      command: command.command,
      passthroughText: command.passthroughText,
    });
  }

  const control = getChannelConnectorSessionControl(sessionControlsPath(config), {
    bindingId: binding.id,
    sessionKey,
  });
  const effectiveProject = resolveChannelConnectorEffectiveProject(config, project, control);
  const effectiveSessionLookup = {
    bindingId: binding.id,
    projectId: effectiveProject.id,
    sessionKey,
    agent: effectiveProject.agent,
    model: effectiveProject.model,
    workDir: effectiveProject.workDir,
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
  let progressEventCount = 0;
  let latestProgress: ChannelConnectorAgentProgressEvent | null = null;
  state.activeRuns.unshift({
    id: activeRunId,
    startedAt: checkedAt,
    updatedAt: checkedAt,
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: effectiveProject.agent,
    model: effectiveProject.model,
    status: "running",
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
    progressEventCount,
    latestProgress,
  });
  state.activeRuns = state.activeRuns.slice(0, 20);
  writeRuntime(config, state);
  writeJsonLine(config.paths.octoEvents, {
    checkedAt,
    eventKind: "agent.run.started",
    adapter: "octo",
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: effectiveProject.agent,
    model: effectiveProject.model,
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
  });

  const stopTypingPulse = startOctoTypingPulse(transport, message);
  let agent: ChannelConnectorAgentTurnResult;
  try {
    agent = await runChannelConnectorAgentTurn({
      project: effectiveProject,
      binding,
      message: agentMessage,
      sessionKey,
      gatewayEndpoint: effectiveProject.gatewayEndpoint || config.gateway.endpoint,
      gatewayClientKey: key,
      agentRuntimeDir: agentRuntimeDir(config, effectiveProject, binding),
      session: {
        codexThreadId: currentSession?.codexThreadId || null,
      },
      onProgress: (event) => {
        progressEventCount += 1;
        latestProgress = event;
        const activeRun = state.activeRuns.find((run) => run.id === activeRunId);
        if (activeRun) {
          activeRun.updatedAt = event.checkedAt;
          activeRun.progressEventCount = progressEventCount;
          activeRun.latestProgress = latestProgress;
        }
        writeJsonLine(config.paths.octoEvents, {
          checkedAt: event.checkedAt,
          eventKind: "agent.progress",
          adapter: "octo",
          bindingId: binding.id,
          sessionKey,
          messageId: message.messageId,
          agent: effectiveProject.agent,
          progressType: event.type,
          rawType: event.rawType,
          itemType: event.itemType,
          text: event.text,
        });
        writeRuntime(config, state);
      },
    });
  } catch (error) {
    const caughtLatestProgress = latestProgress as ChannelConnectorAgentProgressEvent | null;
    agent = {
      attempted: true,
      ok: false,
      status: "failed",
      agent: effectiveProject.agent,
      model: effectiveProject.model,
      command: null,
      args: [],
      cwd: effectiveProject.workDir,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - new Date(checkedAt).getTime(),
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
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      codexThreadId: agent.session.codexThreadId || currentSession?.codexThreadId || null,
      messageId: message.messageId,
      status: agent.status,
    });
  }
  state.agentRuns.unshift({
    checkedAt,
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    agent: effectiveProject.agent,
    status: agent.status,
    ok: agent.ok,
    durationMs: agent.durationMs,
    error: agent.error,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    progressEventCount,
    latestProgress,
  });
  state.agentRuns = state.agentRuns.slice(0, 20);

  let replySent = false;
  if (transport && agent.ok === true && agent.replyText) {
    const replyPlan = renderOctoTextReply(message, agent.replyText);
    if (replyPlan) {
      const result = await sendOctoTextReply(transport, replyPlan);
      replySent = result.ok === true;
    }
  }
  if (transport && agent.ok === false) {
    const replyPlan = renderOctoTextReply(message, `Agent 运行失败：${shortMessage(agent.error)}`);
    if (replyPlan) {
      const result = await sendOctoTextReply(transport, replyPlan);
      replySent = result.ok === true;
    }
  }

  writeJsonLine(config.paths.octoEvents, {
    checkedAt,
    eventKind: "agent.run.finished",
    adapter: "octo",
    bindingId: binding.id,
    sessionKey,
    messageId: message.messageId,
    channelId: message.channelId,
    channelType: message.channelType,
    fromUid: message.fromUid,
    content,
    directed: isOctoMessageDirectedAtBot(message, nativeBinding.botId),
    agentStatus: agent.status,
    agentOk: agent.ok,
    agentError: agent.error,
    progressEventCount,
    latestProgress,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    sessionTurnCount: nextSession?.turnCount || null,
    replySent,
  });
  writeRuntime(config, state);
}

function feishuContentFromParsed(parsed: ChannelConnectorFeishuParsedWebhook): string {
  if (parsed.kind === "card-action") {
    return extractChannelConnectorCommandFromActionValue(parsed.actionValue) || "";
  }
  if (parsed.kind === "bot-menu") {
    const eventKey = normalizeString(parsed.eventKey);
    if (!eventKey) return "";
    return eventKey.startsWith("/") ? eventKey : `/${eventKey}`;
  }
  return normalizeString(parsed.text);
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
    });
    return null;
  }

  const ref = refs[0];
  const { project, binding, transport } = ref;
  const sessionKey = feishuSessionKey(binding, parsed);
  const messageId = normalizeString(parsed.messageId) || `${parsed.kind}:${parsed.eventId || Date.now()}`;
  const dedupeKey = feishuDedupeKey(group, parsed, binding, messageId);
  if (dedupeKey && shouldSkipSeenMessage(seenMessages, dedupeKey)) return null;

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
    gatewayClientKey: key,
  });

  if (command.handled) {
    let replySent = false;
    let replyError: string | null = null;
    let replyTransportAction: string | null = null;
    let feishuResponse: Record<string, unknown> | null = null;
    const shouldSendCard = feishuCardsEnabled(binding)
      && (parsed.kind === "card-action" || parsed.kind === "bot-menu" || isFeishuMenuCommand(command));
    if (shouldSendCard) {
      const result = await sendOrPatchFeishuCommandCard({
        config,
        project,
        binding,
        transport,
        parsed,
        sessionKey,
      });
      replySent = result.ok === true;
      replyError = result.error;
      replyTransportAction = result.action;
      if (parsed.kind === "card-action") {
        feishuResponse = {
          toast: {
            type: result.ok === true ? "info" : "warning",
            content: result.ok === true ? "已更新菜单" : result.error || "菜单更新失败",
          },
          card: {
            type: "raw",
            data: result.card,
          },
        };
      }
    }
    if (!replySent && command.replyText) {
      const result = await sendFeishuTextMessage(transport, {
        chatId: parsed.channelId,
        content: command.replyText,
      }, feishuTokenCachePath(config));
      replySent = result.ok === true;
      replyError = result.error;
      replyTransportAction = result.action;
    }
    writeJsonLine(config.paths.feishuEvents, {
      checkedAt,
      eventKind: "channel.command",
      adapter: "feishu",
      bindingId: binding.id,
      sessionKey,
      messageId,
      eventType: parsed.eventType,
      channelId: parsed.channelId,
      chatType: parsed.chatType,
      fromUid: parsed.fromUid,
      command: command.command,
      commandAction: command.action,
      commandOk: command.ok,
      replySent,
      replyTransportAction,
      replyError,
    });
    writeRuntime(config, state);
    return feishuResponse;
  }

  const agentMessage = command.passthroughText
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
      command: command.command,
      passthroughText: command.passthroughText,
    });
  }

  const control = getChannelConnectorSessionControl(sessionControlsPath(config), {
    bindingId: binding.id,
    sessionKey,
  });
  const effectiveProject = resolveChannelConnectorEffectiveProject(config, project, control);
  const effectiveSessionLookup = {
    bindingId: binding.id,
    projectId: effectiveProject.id,
    sessionKey,
    agent: effectiveProject.agent,
    model: effectiveProject.model,
    workDir: effectiveProject.workDir,
  };
  const activeRunId = `${binding.id}:${messageId}`;
  const currentSession = getChannelConnectorAgentSession(agentSessionsPath(config), effectiveSessionLookup);
  let progressEventCount = 0;
  let latestProgress: ChannelConnectorAgentProgressEvent | null = null;
  state.activeRuns.unshift({
    id: activeRunId,
    startedAt: checkedAt,
    updatedAt: checkedAt,
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: effectiveProject.agent,
    model: effectiveProject.model,
    status: "running",
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
    progressEventCount,
    latestProgress,
  });
  state.activeRuns = state.activeRuns.slice(0, 20);
  writeRuntime(config, state);
  writeJsonLine(config.paths.feishuEvents, {
    checkedAt,
    eventKind: "agent.run.started",
    adapter: "feishu",
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: effectiveProject.agent,
    model: effectiveProject.model,
    sessionResumed: Boolean(currentSession?.codexThreadId),
    codexThreadId: currentSession?.codexThreadId || null,
  });

  const stopTypingReaction = await startFeishuTypingReaction({
    config,
    transport,
    binding,
    sessionKey,
    messageId,
  });
  let agent: ChannelConnectorAgentTurnResult;
  try {
    agent = await runChannelConnectorAgentTurn({
      project: effectiveProject,
      binding,
      message: agentMessage,
      sessionKey,
      gatewayEndpoint: effectiveProject.gatewayEndpoint || config.gateway.endpoint,
      gatewayClientKey: key,
      agentRuntimeDir: agentRuntimeDir(config, effectiveProject, binding),
      session: {
        codexThreadId: currentSession?.codexThreadId || null,
      },
      onProgress: (event) => {
        progressEventCount += 1;
        latestProgress = event;
        const activeRun = state.activeRuns.find((run) => run.id === activeRunId);
        if (activeRun) {
          activeRun.updatedAt = event.checkedAt;
          activeRun.progressEventCount = progressEventCount;
          activeRun.latestProgress = latestProgress;
        }
        writeJsonLine(config.paths.feishuEvents, {
          checkedAt: event.checkedAt,
          eventKind: "agent.progress",
          adapter: "feishu",
          bindingId: binding.id,
          sessionKey,
          messageId,
          agent: effectiveProject.agent,
          progressType: event.type,
          rawType: event.rawType,
          itemType: event.itemType,
          text: event.text,
        });
        writeRuntime(config, state);
      },
    });
  } catch (error) {
    const caughtLatestProgress = latestProgress as ChannelConnectorAgentProgressEvent | null;
    agent = {
      attempted: true,
      ok: false,
      status: "failed",
      agent: effectiveProject.agent,
      model: effectiveProject.model,
      command: null,
      args: [],
      cwd: effectiveProject.workDir,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - new Date(checkedAt).getTime(),
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
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...effectiveSessionLookup,
      codexThreadId: agent.session.codexThreadId || currentSession?.codexThreadId || null,
      messageId,
      status: agent.status,
    });
  }
  state.agentRuns.unshift({
    checkedAt,
    bindingId: binding.id,
    sessionKey,
    messageId,
    agent: effectiveProject.agent,
    status: agent.status,
    ok: agent.ok,
    durationMs: agent.durationMs,
    error: agent.error,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    progressEventCount,
    latestProgress,
  });
  state.agentRuns = state.agentRuns.slice(0, 20);

  let replySent = false;
  let replyError: string | null = null;
  const replyContent = agent.ok === true && agent.replyText
    ? agent.replyText
    : agent.ok === false
      ? `Agent 运行失败：${shortMessage(agent.error)}`
      : null;
  if (replyContent) {
    const result = await sendFeishuTextMessage(transport, {
      chatId: parsed.channelId,
      content: replyContent,
    }, feishuTokenCachePath(config));
    replySent = result.ok === true;
    replyError = result.error;
  }

  writeJsonLine(config.paths.feishuEvents, {
    checkedAt,
    eventKind: "agent.run.finished",
    adapter: "feishu",
    bindingId: binding.id,
    sessionKey,
    messageId,
    channelId: parsed.channelId,
    chatType: parsed.chatType,
    fromUid: parsed.fromUid,
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
    replySent,
    replyError,
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
  seenMessages: Map<string, number>;
}): Promise<void> {
  const { config, state, project, binding, sockets, seenMessages } = input;
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
  const socket = new OctoWukongSocket({
    bindingId: binding.id,
    wsUrl: resolved.entry.wsUrl,
    uid: resolved.entry.robotId,
    token: resolved.entry.imToken,
    reconnect: true,
    logger: logger(config),
    onConnected: () => {
      state.octoConnections[binding.id] = connectionState(binding, {
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      appendLog(config.paths.log, "Octo WebSocket connected", { bindingId: binding.id });
      writeRuntime(config, state);
    },
    onDisconnected: () => {
      state.octoConnections[binding.id] = connectionState(binding, {
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      writeRuntime(config, state);
    },
    onError: () => {
      state.octoConnections[binding.id] = connectionState(binding, {
        ...socket.status(),
        apiUrl: transport.apiUrl,
        robotId: resolved.entry.robotId,
        credentialSource: resolved.source,
      });
      writeRuntime(config, state);
    },
    onMessage: (message) => {
      state.octoConnections[binding.id] = connectionState(binding, {
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
  state.octoConnections[binding.id] = connectionState(binding, {
    ...socket.status(),
    apiUrl: transport.apiUrl,
    robotId: resolved.entry.robotId,
    credentialSource: resolved.source,
  });
  writeRuntime(config, state);
  socket.connect();
}

async function startOctoConnections(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
  sockets: OctoWukongSocket[],
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
          lastError: "feishu_transport_config_missing",
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
        lastError: null,
      };
      group.refs.push({ project, binding, transport });
      groups.set(key, group);
    }
  }
  return [...groups.values()];
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
      group.receivedMessages += 1;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "im.message.receive_v1", data));
      writeJsonLine(config.paths.feishuEvents, {
        checkedAt: new Date().toISOString(),
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
      await dispatchFeishuParsedEvent({
        config,
        state,
        group,
        parsed,
        rawEvent: data,
        seenMessages,
      });
    },
    "card.action.trigger": async (data: unknown) => {
      group.receivedMessages += 1;
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
      return response || {
        toast: {
          type: "info",
          content: "Studio 已收到操作",
        },
      };
    },
    "application.bot.menu_v6": async (data: unknown) => {
      group.receivedMessages += 1;
      const parsed = parseChannelConnectorFeishuWebhook(feishuEnvelope(group.appId, "application.bot.menu_v6", data));
      updateFeishuRuntime(config, state, group);
      await dispatchFeishuParsedEvent({
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

async function startFeishuConnections(
  config: ChannelConnectorsDaemonRuntimeConfig,
  state: ChannelDaemonState,
  clients: WSClient[],
  seenMessages: Map<string, number>,
): Promise<void> {
  const groups = createFeishuGroups(config);
  for (const group of groups) {
    if (!group.refs.length) {
      state.feishuConnections[group.key] = feishuConnectionState(group);
      writeRuntime(config, state);
      continue;
    }
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
        pingTimeout: 15,
      },
      source: "openclaw-studio-channel-daemon",
      onReady: () => {
        group.lastConnectedAt = new Date().toISOString();
        group.lastError = null;
        appendLog(config.paths.log, "Feishu WebSocket connected", {
          key: group.key,
          bindingIds: group.refs.map((ref) => ref.binding.id),
        });
        updateFeishuRuntime(config, state, group);
      },
      onError: (error) => {
        group.lastError = shortMessage(error);
        group.lastDisconnectedAt = new Date().toISOString();
        appendLog(config.paths.log, "Feishu WebSocket error", {
          key: group.key,
          error: group.lastError,
        });
        updateFeishuRuntime(config, state, group);
      },
      onReconnecting: () => {
        group.reconnects += 1;
        group.lastDisconnectedAt = new Date().toISOString();
        updateFeishuRuntime(config, state, group);
      },
      onReconnected: () => {
        group.lastConnectedAt = new Date().toISOString();
        group.lastError = null;
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
      appendLog(config.paths.log, "Feishu WebSocket startup failed", {
        key: group.key,
        error: group.lastError,
      });
      updateFeishuRuntime(config, state, group);
    });
  }
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
  const feishuClients: WSClient[] = [];
  const seenMessages = new Map<string, number>();

  void startOctoConnections(config, state, sockets, seenMessages).catch((error) => {
    appendLog(config.paths.log, "Octo connection startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  void startFeishuConnections(config, state, feishuClients, seenMessages).catch((error) => {
    appendLog(config.paths.log, "Feishu connection startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const stop = () => {
    appendLog(config.paths.log, "Studio native Channel Connectors daemon stopping");
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
