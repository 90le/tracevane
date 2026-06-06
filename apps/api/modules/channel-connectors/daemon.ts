import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import type {
  ChannelConnectorAgentProfile,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorPlatformBinding,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import {
  runChannelConnectorAgentTurn,
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

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function gatewayClientKey(config: ChannelConnectorsDaemonRuntimeConfig): string | null {
  const secretsPath = path.resolve(config.paths.root, "..", "..", "model-gateway", "secrets.json");
  try {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as {
      secrets?: Record<string, { value?: unknown }>;
    };
    return normalizeString(raw.secrets?.["gateway:client-api-key"]?.value) || null;
  } catch {
    return null;
  }
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

function agentSessionsPath(config: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(config.paths.state, "channel-sessions.json");
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
  const sessionLookup = {
    bindingId: binding.id,
    projectId: project.id,
    sessionKey,
    agent: project.agent,
    model: project.model,
    workDir: project.workDir,
  };
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
  if (transport) {
    await sendOctoTyping(
      transport,
      message.channelType === 1 ? message.fromUid : message.channelId,
      message.channelType,
    );
  }
  const currentSession = getChannelConnectorAgentSession(agentSessionsPath(config), sessionLookup);
  const agent = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey,
    gatewayEndpoint: project.gatewayEndpoint || config.gateway.endpoint,
    gatewayClientKey: gatewayClientKey(config),
    agentRuntimeDir: agentRuntimeDir(config, project, binding),
    session: {
      codexThreadId: currentSession?.codexThreadId || null,
    },
  });
  let nextSession: ChannelConnectorAgentSessionRecord | null = null;
  if (agent.session.codexThreadId || currentSession?.codexThreadId) {
    nextSession = upsertChannelConnectorAgentSession(agentSessionsPath(config), {
      ...sessionLookup,
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
    agent: project.agent,
    status: agent.status,
    ok: agent.ok,
    durationMs: agent.durationMs,
    error: agent.error,
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
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

  writeJsonLine(config.paths.octoEvents, {
    checkedAt,
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
    sessionResumed: agent.session.resumed,
    codexThreadId: agent.session.codexThreadId,
    sessionTurnCount: nextSession?.turnCount || null,
    replySent,
  });
  writeRuntime(config, state);
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
  const seenMessages = new Map<string, number>();

  void startOctoConnections(config, state, sockets, seenMessages).catch((error) => {
    appendLog(config.paths.log, "Octo connection startup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const stop = () => {
    appendLog(config.paths.log, "Studio native Channel Connectors daemon stopping");
    for (const socket of sockets) socket.disconnect();
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
