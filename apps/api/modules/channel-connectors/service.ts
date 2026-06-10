import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME,
  CHANNEL_CONNECTOR_AGENT_IDS,
  CHANNEL_CONNECTOR_PLATFORM_IDS,
  type ChannelConnectorsBindingPolicy,
  type ChannelConnectorsDaemonAction,
  type ChannelConnectorsDaemonCommand,
  type ChannelConnectorsDaemonCommandResult,
  type ChannelConnectorsDaemonConfigResponse,
  type ChannelConnectorsDaemonManagerStatus,
  type ChannelConnectorsDaemonPlan,
  type ChannelConnectorsDaemonRequest,
  type ChannelConnectorsDaemonResponse,
  type ChannelConnectorsDaemonRuntimeConfig,
  type ChannelConnectorsDaemonRuntimeAutoCompactRecord,
  type ChannelConnectorsDaemonRuntimeStatus,
  type ChannelConnectorsDaemonTemplate,
  type ChannelConnectorsLogsResponse,
  type ChannelConnectorsNativeConfig,
  type ChannelConnectorsNativeConfigResponse,
  type ChannelConnectorCommandActionRequest,
  type ChannelConnectorCommandActionResponse,
  type ChannelConnectorCommandSurface,
  type ChannelConnectorCommandSurfaceRequest,
  type ChannelConnectorCommandSurfaceResponse,
  type ChannelConnectorFeishuWebhookRequest,
  type ChannelConnectorFeishuWebhookResponse,
  type ChannelConnectorFeishuTransportResult,
  type ChannelConnectorFeishuTransportSmokeRequest,
  type ChannelConnectorFeishuTransportSmokeResponse,
  type ChannelConnectorInboundAttachment,
  type ChannelConnectorsSaveNativeConfigRequest,
  type ChannelConnectorsStatusResponse,
  type ChannelConnectorOctoDispatchResponse,
  type ChannelConnectorOctoInboundRequest,
  type ChannelConnectorOctoTransportResult,
  type ChannelConnectorOctoTransportSmokeRequest,
  type ChannelConnectorOctoTransportSmokeResponse,
  type ChannelConnectorAgentId,
  type ChannelConnectorAgentSessionActionRequest,
  type ChannelConnectorAgentSessionDriverStatusResponse,
  type ChannelConnectorPermissionMode,
  type ChannelConnectorPlatformBinding,
  type ChannelConnectorPlatformId,
} from "../../../../types/channel-connectors.js";
import {
  buildOctoSessionKey,
  buildSkippedOctoResponse,
  extractOctoAttachments,
  extractOctoContent,
  isOctoMessageDirectedAtBot,
  renderOctoTextReply,
  resolveOctoBinding,
  shouldSkipOctoMessage,
} from "./octo-adapter.js";
import {
  directUploadAndSendOctoMedia,
  directUploadOctoFile,
  emptyOctoTransportResult,
  getOctoUploadCredentials,
  octoTransportFromBinding,
  registerOctoBot,
  sendOctoTextReply,
  sendOctoTyping,
  uploadAndSendOctoMedia,
  uploadOctoFile,
} from "./octo-transport.js";
import {
  buildChannelConnectorCommandSurface,
  channelConnectorCommandSurfaceSectionFromCommand,
  channelConnectorCommandSurfaceViewFromCommand,
  extractChannelConnectorSurfaceActionPayload,
  normalizeChannelConnectorCommandSurfaceSection,
  normalizeChannelConnectorCommandSurfaceView,
  renderChannelConnectorCommandSurfaceFeishu,
  type ChannelConnectorCommandSurfaceInput,
} from "./command-surface.js";
import {
  buildFeishuSessionKey,
  parseChannelConnectorFeishuWebhook,
  safeEqualFeishuWebhookToken,
} from "./feishu-adapter.js";
import {
  emptyFeishuTransportResult,
  feishuTransportFromBinding,
  patchFeishuCardMessage,
  sendFeishuCardMessage,
  sendFeishuPostMessage,
  sendFeishuTextMessage,
  smokeFeishuTenantToken,
  uploadAndSendFeishuMedia,
} from "./feishu-transport.js";
import {
  handleChannelConnectorCommand,
  listChannelConnectorCommandSummaries,
  listChannelConnectorGatewayModels,
  listChannelConnectorSkillSummaries,
  resolveChannelConnectorBindingCommandAlias,
  resolveChannelConnectorEffectiveProject,
  type ChannelConnectorCommandResult,
} from "./command-router.js";
import {
  resolveChannelConnectorGatewayClientKey,
} from "./gateway-secret.js";
import {
  evaluateChannelConnectorGovernance,
} from "./governance-policy.js";
import { getChannelConnectorSessionControl } from "./session-control-store.js";
import {
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
} from "./agent-session-store.js";
import { getChannelConnectorConversationHistory } from "./conversation-history-store.js";
import {
  compactChannelConnectorConversation,
} from "./conversation-compact.js";

const DEFAULT_FEISHU_STALE_EVENT_MAX_AGE_MS = 2 * 60_000;
const MIN_FEISHU_STALE_EVENT_MAX_AGE_MS = 10_000;
const MAX_FEISHU_STALE_EVENT_MAX_AGE_MS = 24 * 60 * 60_000;

const execFileAsync = promisify(execFile);
const DAEMON_ACTIONS: readonly ChannelConnectorsDaemonAction[] = [
  "preview",
  "install",
  "ensure-running",
  "start",
  "stop",
  "restart",
  "status",
];
const MANAGEMENT_PORT = 18797;
const PERMISSION_MODES: readonly ChannelConnectorPermissionMode[] = [
  "suggest",
  "read-only",
  "auto-edit",
  "full-auto",
  "plan",
  "yolo",
];

export type ChannelConnectorsDaemonCommandRunner = (
  command: ChannelConnectorsDaemonCommand,
) => Promise<ChannelConnectorsDaemonCommandResult>;

export interface ChannelConnectorsServiceOptions {
  homeDir?: string;
  commandRunner?: ChannelConnectorsDaemonCommandRunner;
  now?: () => Date;
}

export interface ChannelConnectorsService {
  getStatus(): Promise<ChannelConnectorsStatusResponse>;
  getNativeConfig(): ChannelConnectorsNativeConfigResponse;
  saveNativeConfig(payload?: ChannelConnectorsSaveNativeConfigRequest): ChannelConnectorsNativeConfigResponse;
  getCommandSurface(payload?: ChannelConnectorCommandSurfaceRequest): Promise<ChannelConnectorCommandSurfaceResponse>;
  handleCommandAction(payload?: ChannelConnectorCommandActionRequest): Promise<ChannelConnectorCommandActionResponse>;
  dispatchFeishuWebhook(payload?: ChannelConnectorFeishuWebhookRequest): Promise<ChannelConnectorFeishuWebhookResponse>;
  runFeishuTransportSmoke(payload?: ChannelConnectorFeishuTransportSmokeRequest): Promise<ChannelConnectorFeishuTransportSmokeResponse>;
  dispatchOctoIncoming(payload?: ChannelConnectorOctoInboundRequest): Promise<ChannelConnectorOctoDispatchResponse>;
  runOctoTransportSmoke(payload?: ChannelConnectorOctoTransportSmokeRequest): Promise<ChannelConnectorOctoTransportSmokeResponse>;
  getDaemonConfig(): ChannelConnectorsDaemonConfigResponse;
  getDaemonService(): Promise<ChannelConnectorsDaemonResponse>;
  manageDaemonService(payload?: ChannelConnectorsDaemonRequest): Promise<ChannelConnectorsDaemonResponse>;
  getAgentSessions(): Promise<ChannelConnectorAgentSessionDriverStatusResponse>;
  manageAgentSessions(payload?: ChannelConnectorAgentSessionActionRequest): Promise<ChannelConnectorAgentSessionDriverStatusResponse>;
  getDaemonLogs(limit?: number): ChannelConnectorsLogsResponse;
}

interface ChannelConnectorsPaths {
  workspaceDir: string;
  nativeConfigPath: string;
  rootDir: string;
  configPath: string;
  stateDir: string;
  logDir: string;
  logFile: string;
  runtimeFile: string;
  octoEventLogFile: string;
  feishuEventLogFile: string;
  feishuTokenCacheFile: string;
}

function normalizeHomeDir(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  return trimmed || os.homedir();
}

function normalizePathLike(value: string): string {
  return path.resolve(value.trim().replace(/^~(?=$|\/|\\)/, os.homedir()));
}

function normalizeEnvDir(value: string | undefined): string | null {
  const trimmed = String(value || "").trim();
  return trimmed ? normalizePathLike(trimmed) : null;
}

function defaultStudioHomeDir(config: StudioServerConfig, homeDir?: string): string {
  const explicit = String(homeDir || "").trim();
  if (explicit) return normalizePathLike(explicit);
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw" ? path.dirname(openclawRoot) : os.homedir();
}

function resolveChannelConnectorsWorkspaceDir(
  config: StudioServerConfig,
  homeDir?: string,
): string {
  const explicitWorkspace = normalizeEnvDir(process.env.OPENCLAW_STUDIO_CHANNEL_CONNECTORS_DIR);
  if (explicitWorkspace) return explicitWorkspace;
  const explicitDataRoot = normalizeEnvDir(process.env.OPENCLAW_STUDIO_DATA_DIR);
  if (explicitDataRoot) return path.join(explicitDataRoot, "channel-connectors");
  return path.join(defaultStudioHomeDir(config, homeDir), ".config", "openclaw-studio", "channel-connectors");
}

export function resolveChannelConnectorsPaths(
  config: StudioServerConfig,
  homeDir?: string,
): ChannelConnectorsPaths {
  const workspaceDir = resolveChannelConnectorsWorkspaceDir(config, homeDir);
  const rootDir = path.join(workspaceDir, "daemon");
  const logDir = path.join(rootDir, "logs");
  return {
    workspaceDir,
    nativeConfigPath: path.join(workspaceDir, "config.json"),
    rootDir,
    configPath: path.join(rootDir, "config.json"),
    stateDir: path.join(rootDir, "state"),
    logDir,
    logFile: path.join(logDir, "channel-connectors.log"),
    runtimeFile: path.join(rootDir, "runtime.json"),
    octoEventLogFile: path.join(rootDir, "state", "octo-events.jsonl"),
    feishuEventLogFile: path.join(rootDir, "state", "feishu-events.jsonl"),
    feishuTokenCacheFile: path.join(rootDir, "state", "feishu-token-cache.json"),
  };
}

function readTextIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTextAtomic(filePath: string, content: string): void {
  ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeAction(value: unknown): ChannelConnectorsDaemonAction {
  return DAEMON_ACTIONS.includes(value as ChannelConnectorsDaemonAction)
    ? value as ChannelConnectorsDaemonAction
    : "preview";
}

function quoteSystemdArg(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeSystemdPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\s/g, "\\x20");
}

function quoteLaunchdString(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gatewayEndpoint(): string {
  return "http://127.0.0.1:18796/v1";
}

function normalizeString(value: unknown, fallback = ""): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      output.push(normalized);
    }
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function arrayCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  return nullableNumber(value);
}

function isAgentId(value: unknown): value is ChannelConnectorAgentId {
  return (CHANNEL_CONNECTOR_AGENT_IDS as readonly string[]).includes(String(value));
}

function isPlatformId(value: unknown): value is ChannelConnectorPlatformId {
  return (CHANNEL_CONNECTOR_PLATFORM_IDS as readonly string[]).includes(String(value));
}

function isPermissionMode(value: unknown): value is ChannelConnectorPermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(String(value));
}

function defaultNativeConfig(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsNativeConfig {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    defaultAgentProfileId: "default-codex",
    agentProfiles: [
      {
        id: "default-codex",
        name: "Default Codex",
        agent: "codex",
        model: null,
        workDir: config.projectRoot || process.cwd(),
        permissionMode: "suggest",
        gatewayEndpoint: gatewayEndpoint(),
        gatewayKeyRef: "studio-gateway-client-key",
        appProfileRef: "default",
      },
    ],
    platformBindings: [],
  };
}

function normalizeNativeConfig(
  input: unknown,
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
  strict = false,
): ChannelConnectorsNativeConfig {
  const fallback = defaultNativeConfig(config, paths, now);
  if (!isRecord(input)) {
    if (strict) throw new Error("Channel Connectors config must be an object.");
    return fallback;
  }

  const rawProfiles = Array.isArray(input.agentProfiles) ? input.agentProfiles : [];
  if (strict && rawProfiles.length === 0) throw new Error("At least one agent profile is required.");

  const profileIds = new Set<string>();
  const agentProfiles: ChannelConnectorsNativeConfig["agentProfiles"] = [];
  for (let index = 0; index < rawProfiles.length; index += 1) {
    const raw = rawProfiles[index];
    if (!isRecord(raw)) continue;
    const id = slugify(normalizeString(raw.id, normalizeString(raw.name)), `profile-${index + 1}`);
    if (profileIds.has(id)) {
      if (strict) throw new Error(`Duplicate agent profile id: ${id}`);
      continue;
    }
    const agent = raw.agent;
    if (strict && !isAgentId(agent)) throw new Error(`Unsupported agent id for profile ${id}.`);
    const permissionMode = raw.permissionMode;
    if (strict && !isPermissionMode(permissionMode)) throw new Error(`Unsupported permission mode for profile ${id}.`);
    const workDir = normalizeString(raw.workDir, fallback.agentProfiles[0].workDir);
    if (strict && !workDir) throw new Error(`workDir is required for profile ${id}.`);
    profileIds.add(id);
    agentProfiles.push({
      id,
      name: normalizeString(raw.name, id),
      agent: isAgentId(agent) ? agent : "codex",
      model: normalizeString(raw.model) || null,
      workDir,
      permissionMode: isPermissionMode(permissionMode) ? permissionMode : "suggest",
      gatewayEndpoint: normalizeString(raw.gatewayEndpoint, gatewayEndpoint()),
      gatewayKeyRef: "studio-gateway-client-key",
      appProfileRef: normalizeString(raw.appProfileRef, "default"),
    });
  }

  if (agentProfiles.length === 0) agentProfiles.push(...fallback.agentProfiles);
  const validProfileIds = new Set(agentProfiles.map((profile) => profile.id));
  const defaultAgentProfileId = validProfileIds.has(normalizeString(input.defaultAgentProfileId))
    ? normalizeString(input.defaultAgentProfileId)
    : agentProfiles[0].id;

  const rawBindings = Array.isArray(input.platformBindings) ? input.platformBindings : [];
  const bindingIds = new Set<string>();
  const wechatAccountAgents = new Map<string, string>();
  const platformBindings: ChannelConnectorsNativeConfig["platformBindings"] = [];
  for (let index = 0; index < rawBindings.length; index += 1) {
    const raw = rawBindings[index];
    if (!isRecord(raw)) continue;
    const id = slugify(normalizeString(raw.id, normalizeString(raw.displayName)), `binding-${index + 1}`);
    if (bindingIds.has(id)) {
      if (strict) throw new Error(`Duplicate platform binding id: ${id}`);
      continue;
    }
    const platform = raw.platform;
    if (strict && !isPlatformId(platform)) throw new Error(`Unsupported platform id for binding ${id}.`);
    const agentProfileId = normalizeString(raw.agentProfileId, defaultAgentProfileId);
    if (strict && !validProfileIds.has(agentProfileId)) {
      throw new Error(`Binding ${id} references unknown agent profile: ${agentProfileId}`);
    }
    const effectiveProfileId = validProfileIds.has(agentProfileId) ? agentProfileId : defaultAgentProfileId;
    const accountId = normalizeString(raw.accountId);
    if (strict && !accountId) throw new Error(`accountId is required for binding ${id}.`);
    const platformId = isPlatformId(platform) ? platform : "octo";
    if (platformId === "wechat") {
      const existingAgent = wechatAccountAgents.get(accountId);
      if (existingAgent && existingAgent !== effectiveProfileId) {
        throw new Error(`Personal WeChat account ${accountId} can bind only one agent profile.`);
      }
      if (accountId) wechatAccountAgents.set(accountId, effectiveProfileId);
    }

    bindingIds.add(id);
    platformBindings.push({
      id,
      platform: platformId,
      accountId,
      botId: normalizeString(raw.botId) || null,
      displayName: normalizeString(raw.displayName, id),
      agentProfileId: effectiveProfileId,
      enabled: raw.enabled !== false,
      allowlist: stringList(raw.allowlist),
      adminUsers: stringList(raw.adminUsers),
      disabledCommands: stringList(raw.disabledCommands ?? raw.disabled_commands),
      metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
    });
  }

  return {
    version: 1,
    updatedAt: normalizeString(input.updatedAt, now.toISOString()),
    defaultAgentProfileId,
    agentProfiles,
    platformBindings,
  };
}

function readNativeConfig(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsNativeConfig {
  const raw = readTextIfExists(paths.nativeConfigPath);
  if (!raw) return defaultNativeConfig(config, paths, now);
  try {
    return normalizeNativeConfig(JSON.parse(raw), config, paths, now, false);
  } catch {
    return defaultNativeConfig(config, paths, now);
  }
}

function writeNativeConfig(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  value: ChannelConnectorsNativeConfig,
  now: Date,
): ChannelConnectorsNativeConfig {
  const normalized = normalizeNativeConfig(
    {
      ...value,
      updatedAt: now.toISOString(),
    },
    config,
    paths,
    now,
    true,
  );
  writeTextAtomic(paths.nativeConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function daemonEntryPath(config: StudioServerConfig): string {
  return path.join(config.projectRoot, "dist", "apps", "api", "modules", "channel-connectors", "daemon.js");
}

function managementEndpoint(): string {
  return `http://127.0.0.1:${MANAGEMENT_PORT}`;
}

function runtimeStatusError(checkedAt: string, error: unknown): ChannelConnectorsDaemonRuntimeStatus {
  return {
    ok: false,
    checkedAt,
    reachable: false,
    implementation: null,
    pid: null,
    projects: null,
    platformBindings: null,
    octoConnections: null,
    feishuConnections: null,
    feishuConnectionDetails: [],
    activeRuns: null,
    agentRuns: null,
    autoCompacts: [],
    error: error instanceof Error ? error.message : normalizeString(error, "Channel daemon runtime status unavailable"),
  };
}

function normalizeDaemonFeishuConnection(value: unknown): ChannelConnectorsDaemonRuntimeStatus["feishuConnectionDetails"][number] | null {
  if (!isRecord(value)) return null;
  return {
    key: normalizeString(value.key),
    bindingIds: stringList(value.bindingIds),
    connected: value.connected === true,
    state: normalizeString(value.state, "unknown"),
    ingressState: normalizeString(value.ingressState, "unknown"),
    ingressVerified: value.ingressVerified === true,
    transportVerified: value.transportVerified === true,
    pongWaitingForMs: nullableNumber(value.pongWaitingForMs) ?? 0,
    pongOverdue: value.pongOverdue === true,
    sdkConnected: value.sdkConnected === true,
    transportStaleForMs: nullableNumber(value.transportStaleForMs) ?? 0,
    transportStaleAfterMs: nullableNumber(value.transportStaleAfterMs) ?? 0,
    transportStale: value.transportStale === true,
    lastPingAt: nullableString(value.lastPingAt),
    lastPongAt: nullableString(value.lastPongAt),
    lastReceivedAt: nullableString(value.lastReceivedAt),
    lastRawEventFrameAt: nullableString(value.lastRawEventFrameAt),
    lastError: nullableString(value.lastError),
  };
}

function normalizeAutoCompactAction(value: unknown): ChannelConnectorsDaemonRuntimeAutoCompactRecord["action"] {
  if (value === "native" || value === "fallback" || value === "skipped") return value;
  return "skipped";
}

function normalizeAutoCompactReason(value: unknown): ChannelConnectorsDaemonRuntimeAutoCompactRecord["reason"] {
  if (value === "threshold-reached" || value === "cooldown" || value === "native-blocked" || value === "fallback-failed") {
    return value;
  }
  return "threshold-reached";
}

function normalizeUsageSource(value: unknown): ChannelConnectorsDaemonRuntimeAutoCompactRecord["usageSource"] {
  if (value === "gateway-runtime-window" || value === "history-estimate" || value === "none") return value;
  return "none";
}

function normalizeDaemonAutoCompactRecord(value: unknown): ChannelConnectorsDaemonRuntimeAutoCompactRecord | null {
  if (!isRecord(value)) return null;
  const checkedAt = nullableString(value.checkedAt);
  const bindingId = nullableString(value.bindingId);
  const sessionKey = nullableString(value.sessionKey);
  const projectId = nullableString(value.projectId);
  const agent = nullableString(value.agent);
  const workDir = nullableString(value.workDir);
  const messageId = nullableString(value.messageId);
  if (!checkedAt || !bindingId || !sessionKey || !projectId || !agent || !workDir || !messageId) return null;
  return {
    checkedAt,
    bindingId,
    sessionKey,
    projectId,
    agent,
    model: nullableString(value.model),
    workDir,
    messageId,
    action: normalizeAutoCompactAction(value.action),
    ok: nullableBoolean(value.ok),
    reason: normalizeAutoCompactReason(value.reason),
    usageSource: normalizeUsageSource(value.usageSource),
    usedTokens: nullableNumber(value.usedTokens),
    effectiveUsedTokens: nullableNumber(value.effectiveUsedTokens),
    contextWindow: nullableNumber(value.contextWindow),
    autoCompactTokenLimit: nullableNumber(value.autoCompactTokenLimit),
    remainingTokens: nullableNumber(value.remainingTokens),
    nativeAttempted: value.nativeAttempted === true,
    fallbackAttempted: value.fallbackAttempted === true,
    beforeEntries: nullableNumber(value.beforeEntries),
    afterEntries: nullableNumber(value.afterEntries),
    sessionsCleared: nullableNumber(value.sessionsCleared),
    summaryPreview: nullableString(value.summaryPreview),
    error: nullableString(value.error),
    cooldownStartedAt: nullableString(value.cooldownStartedAt),
    cooldownUntil: nullableString(value.cooldownUntil),
  };
}

async function requestDaemonRuntimeStatus(checkedAt: string): Promise<ChannelConnectorsDaemonRuntimeStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${managementEndpoint()}/status`, { signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const message = isRecord(body) ? normalizeString(body.message) || normalizeString(body.error) : "";
      throw new Error(message || `Channel daemon runtime status failed with HTTP ${response.status}`);
    }
    if (!isRecord(body)) throw new Error("Channel daemon runtime status returned an invalid payload");
    const autoCompacts = Array.isArray(body.autoCompacts)
      ? body.autoCompacts.map(normalizeDaemonAutoCompactRecord).filter((record): record is ChannelConnectorsDaemonRuntimeAutoCompactRecord => Boolean(record))
      : [];
    const feishuConnectionDetails = Array.isArray(body.feishuConnections)
      ? body.feishuConnections
        .map(normalizeDaemonFeishuConnection)
        .filter((record): record is ChannelConnectorsDaemonRuntimeStatus["feishuConnectionDetails"][number] => Boolean(record))
      : [];
    return {
      ok: true,
      checkedAt,
      reachable: true,
      implementation: nullableString(body.implementation),
      pid: nullableNumber(body.pid),
      projects: nullableNumber(body.projects),
      platformBindings: nullableNumber(body.platformBindings),
      octoConnections: arrayCount(body.octoConnections),
      feishuConnections: arrayCount(body.feishuConnections),
      feishuConnectionDetails,
      activeRuns: arrayCount(body.activeRuns),
      agentRuns: arrayCount(body.agentRuns),
      autoCompacts,
      error: null,
    };
  } catch (error) {
    return runtimeStatusError(checkedAt, error);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestDaemonAgentSessions(
  payload?: ChannelConnectorAgentSessionActionRequest | null,
): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
  const method = payload ? "POST" : "GET";
  const response = await fetch(`${managementEndpoint()}/agent-sessions`, {
    method,
    headers: payload ? { "content-type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String((body as { message?: unknown }).message || "")
      : "";
    const error = typeof body === "object" && body && "error" in body
      ? String((body as { error?: unknown }).error || "")
      : "";
    throw new Error(message || error || `Channel daemon agent session request failed with HTTP ${response.status}`);
  }
  return body as ChannelConnectorAgentSessionDriverStatusResponse;
}

function buildRuntimeConfig(
  nativeConfig: ChannelConnectorsNativeConfig,
  paths: ChannelConnectorsPaths,
): ChannelConnectorsDaemonRuntimeConfig {
  return {
    version: 1,
    management: {
      host: "127.0.0.1",
      port: MANAGEMENT_PORT,
    },
    paths: {
      root: paths.rootDir,
      state: paths.stateDir,
      log: paths.logFile,
      runtime: paths.runtimeFile,
      octoEvents: paths.octoEventLogFile,
      feishuEvents: paths.feishuEventLogFile,
    },
    gateway: {
      endpoint: gatewayEndpoint(),
      clientKeyRef: "studio-gateway-client-key",
    },
    projects: [
      ...nativeConfig.agentProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        workDir: profile.workDir,
        agent: profile.agent,
        model: profile.model,
        permissionMode: profile.permissionMode,
        gatewayEndpoint: profile.gatewayEndpoint,
        gatewayKeyRef: profile.gatewayKeyRef,
        appProfileRef: profile.appProfileRef,
        platformBindings: nativeConfig.platformBindings
          .filter((binding) => binding.agentProfileId === profile.id)
          .map((binding) => ({
            id: binding.id,
            platform: binding.platform,
            accountId: binding.accountId,
            botId: binding.botId,
            displayName: binding.displayName,
            agent: profile.agent,
            enabled: binding.enabled,
            allowlist: binding.allowlist,
            adminUsers: binding.adminUsers,
            disabledCommands: binding.disabledCommands,
            metadata: binding.metadata,
          })),
      })),
    ],
  };
}

function isSensitiveMetadataKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[-_\s]/g, "");
  return normalized === "apikey"
    || normalized === "appsecret"
    || normalized === "botsecret"
    || normalized === "bottoken"
    || normalized === "clientsecret"
    || normalized === "imtoken"
    || normalized === "secret"
    || normalized === "tenantaccesstoken"
    || normalized === "token"
    || normalized === "verificationtoken"
    || normalized.endsWith("secret")
    || normalized.endsWith("token");
}

function redactSensitiveMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitiveMetadata(item));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = isSensitiveMetadataKey(key) && normalizeString(item)
      ? "[redacted]"
      : redactSensitiveMetadata(item);
  }
  return output;
}

function redactRuntimeConfig(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): ChannelConnectorsDaemonRuntimeConfig {
  return {
    ...runtimeConfig,
    projects: runtimeConfig.projects.map((project) => ({
      ...project,
      platformBindings: project.platformBindings.map((binding) => ({
        ...binding,
        metadata: redactSensitiveMetadata(binding.metadata) as Record<string, unknown> | undefined,
      })),
    })),
  };
}

function redactConfigResponse(response: ChannelConnectorsDaemonConfigResponse): ChannelConnectorsDaemonConfigResponse {
  const config = redactRuntimeConfig(response.config);
  return {
    ...response,
    config,
    preview: `${JSON.stringify(config, null, 2)}\n`,
  };
}

function buildConfigResponse(config: StudioServerConfig, paths: ChannelConnectorsPaths, now: Date): ChannelConnectorsDaemonConfigResponse {
  const nativeConfig = readNativeConfig(config, paths, now);
  const runtimeConfig = buildRuntimeConfig(nativeConfig, paths);
  const preview = `${JSON.stringify(runtimeConfig, null, 2)}\n`;
  return {
    ok: true,
    checkedAt: now.toISOString(),
    ready: true,
    nativeConfigPath: paths.nativeConfigPath,
    configPath: paths.configPath,
    gatewayEndpoint: gatewayEndpoint(),
    managementEndpoint: managementEndpoint(),
    config: runtimeConfig,
    preview,
    missing: [],
  };
}

function buildSystemdTemplate(serviceName: string, paths: ChannelConnectorsPaths, nodePath: string, daemonEntry: string): string {
  return [
    "[Unit]",
    "Description=OpenClaw Studio Channel Connectors",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${escapeSystemdPath(paths.rootDir)}`,
    `ExecStart=${quoteSystemdArg(nodePath)} ${quoteSystemdArg(daemonEntry)} --config ${quoteSystemdArg(paths.configPath)}`,
    "Restart=on-failure",
    "RestartSec=10",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function buildLaunchdTemplate(serviceName: string, paths: ChannelConnectorsPaths, nodePath: string, daemonEntry: string): string {
  const label = serviceName.replace(/\.service$/, "");
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    `  <string>${quoteLaunchdString(label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    <string>${quoteLaunchdString(nodePath)}</string>`,
    `    <string>${quoteLaunchdString(daemonEntry)}</string>`,
    "    <string>--config</string>",
    `    <string>${quoteLaunchdString(paths.configPath)}</string>`,
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${quoteLaunchdString(paths.rootDir)}</string>`,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export function createChannelConnectorsDaemonPlan(
  config: StudioServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ChannelConnectorsDaemonPlan {
  const paths = resolveChannelConnectorsPaths(config, options.homeDir);
  const homeDir = normalizeHomeDir(options.homeDir);
  const serviceName = CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME;
  const nodePath = process.execPath;
  const daemonEntry = daemonEntryPath(config);
  const platform = process.platform === "linux"
    ? "linux"
    : process.platform === "darwin"
      ? "macos"
      : process.platform === "win32"
        ? "windows"
        : "unknown";
  const supervisor = platform === "linux"
    ? "systemd-user"
    : platform === "macos"
      ? "launchd-user"
      : platform === "windows"
        ? "scheduled-task"
        : "none";

  const linuxServicePath = path.join(homeDir, ".config", "systemd", "user", serviceName);
  const launchdServicePath = path.join(homeDir, "Library", "LaunchAgents", serviceName.replace(/\.service$/, ".plist"));
  const unsupportedServicePath = path.join(paths.rootDir, serviceName);
  const launchdDomain = typeof process.getuid === "function" ? `gui/${process.getuid()}` : "gui/501";
  const launchdLabel = serviceName.replace(/\.service$/, "");

  const linuxTemplate: ChannelConnectorsDaemonTemplate = {
    supervisor: "systemd-user",
    platform: "linux",
    serviceName,
    servicePath: linuxServicePath,
    template: buildSystemdTemplate(serviceName, paths, nodePath, daemonEntry),
    commands: {
      install: [
        { label: "Reload user systemd", command: "systemctl", args: ["--user", "daemon-reload"] },
        { label: "Enable Channel Connectors service", command: "systemctl", args: ["--user", "enable", serviceName] },
      ],
      start: [
        { label: "Start Channel Connectors service", command: "systemctl", args: ["--user", "start", serviceName] },
      ],
      stop: [
        { label: "Stop Channel Connectors service", command: "systemctl", args: ["--user", "stop", serviceName] },
      ],
      restart: [
        { label: "Restart Channel Connectors service", command: "systemctl", args: ["--user", "restart", serviceName] },
      ],
      status: [
        { label: "Check Channel Connectors active state", command: "systemctl", args: ["--user", "is-active", serviceName] },
        { label: "Check Channel Connectors enabled state", command: "systemctl", args: ["--user", "is-enabled", serviceName] },
      ],
      "ensure-running": [
        { label: "Reload user systemd", command: "systemctl", args: ["--user", "daemon-reload"] },
        { label: "Enable Channel Connectors service", command: "systemctl", args: ["--user", "enable", serviceName] },
        { label: "Start Channel Connectors service", command: "systemctl", args: ["--user", "start", serviceName] },
      ],
    },
  };

  const launchdTemplate: ChannelConnectorsDaemonTemplate = {
    supervisor: "launchd-user",
    platform: "macos",
    serviceName,
    servicePath: launchdServicePath,
    template: buildLaunchdTemplate(serviceName, paths, nodePath, daemonEntry),
    commands: {
      install: [
        { label: "Bootstrap LaunchAgent", command: "launchctl", args: ["bootstrap", launchdDomain, launchdServicePath] },
      ],
      start: [
        { label: "Start LaunchAgent", command: "launchctl", args: ["kickstart", "-k", `${launchdDomain}/${launchdLabel}`] },
      ],
      stop: [
        { label: "Stop LaunchAgent", command: "launchctl", args: ["bootout", launchdDomain, launchdServicePath] },
      ],
      restart: [
        { label: "Restart LaunchAgent", command: "launchctl", args: ["kickstart", "-k", `${launchdDomain}/${launchdLabel}`] },
      ],
      status: [
        { label: "Print LaunchAgent", command: "launchctl", args: ["print", `${launchdDomain}/${launchdLabel}`] },
      ],
    },
  };

  const unsupportedTemplate: ChannelConnectorsDaemonTemplate = {
    supervisor,
    platform,
    serviceName,
    servicePath: unsupportedServicePath,
    template: "# Unsupported platform for Studio native Channel Connectors service.\n",
    commands: {},
  };

  const templates = [linuxTemplate, launchdTemplate, unsupportedTemplate];
  const selectedTemplate = platform === "linux"
    ? linuxTemplate
    : platform === "macos"
      ? launchdTemplate
      : unsupportedTemplate;
  const notes = [
    "Channel Connectors is a Studio-native daemon.",
    "CC and OpenClaw implementations are reference sources only.",
    "Studio and OpenClaw are not runtime dependencies after the native daemon is supervised.",
  ];
  if (platform === "windows") notes.push("Windows scheduled-task support remains a native-daemon follow-up.");

  return {
    platform: process.platform,
    supported: platform === "linux" || platform === "macos",
    supervisor,
    serviceName,
    nodePath,
    daemonEntry,
    rootDir: paths.rootDir,
    configPath: paths.configPath,
    stateDir: paths.stateDir,
    logFile: paths.logFile,
    runtimeFile: paths.runtimeFile,
    managementEndpoint: managementEndpoint(),
    selectedTemplate,
    templates,
    notes,
  };
}

async function runDefaultCommand(command: ChannelConnectorsDaemonCommand): Promise<ChannelConnectorsDaemonCommandResult> {
  try {
    const result = await execFileAsync(command.command, command.args, {
      timeout: 30_000,
      encoding: "utf8",
    });
    return {
      ...command,
      ok: true,
      exitCode: 0,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: null,
    };
  } catch (error) {
    const shaped = error as Error & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    return {
      ...command,
      ok: false,
      exitCode: typeof shaped.code === "number" ? shaped.code : null,
      stdout: shaped.stdout || "",
      stderr: shaped.stderr || "",
      error: shaped.message || "Command failed.",
    };
  }
}

function summarizeManager(
  plan: ChannelConnectorsDaemonPlan,
  commandsRun: ChannelConnectorsDaemonCommandResult[],
): ChannelConnectorsDaemonManagerStatus {
  if (!plan.supported) {
    return {
      checked: true,
      reachable: false,
      active: null,
      enabled: null,
      lastError: "Supervisor is not supported on this platform yet.",
    };
  }
  const statusCommands = commandsRun.filter((result) => {
    const args = result.args.join(" ");
    return args.includes("is-active")
      || args.includes("is-enabled")
      || result.label.toLowerCase().includes("active")
      || result.label.toLowerCase().includes("enabled")
      || result.command === "launchctl";
  });
  if (!statusCommands.length) {
    return {
      checked: false,
      reachable: null,
      active: null,
      enabled: null,
      lastError: null,
    };
  }
  const activeResult = statusCommands.find((result) => result.args.includes("is-active"));
  const enabledResult = statusCommands.find((result) => result.args.includes("is-enabled"));
  const lastFailed = [...statusCommands].reverse().find((result) => !result.ok);
  return {
    checked: true,
    reachable: statusCommands.some((result) => result.ok),
    active: activeResult ? activeResult.ok && activeResult.stdout.trim() === "active" : null,
    enabled: enabledResult ? enabledResult.ok && enabledResult.stdout.trim() === "enabled" : null,
    lastError: lastFailed?.stderr || lastFailed?.error || null,
  };
}

function isTemplateCurrent(plan: ChannelConnectorsDaemonPlan): boolean {
  return readTextIfExists(plan.selectedTemplate.servicePath) === plan.selectedTemplate.template;
}

function isConfigCurrent(configPreview: ChannelConnectorsDaemonConfigResponse): boolean {
  return readTextIfExists(configPreview.configPath) === configPreview.preview;
}

function actionWritesFiles(action: ChannelConnectorsDaemonAction): boolean {
  return action === "install" || action === "ensure-running" || action === "start" || action === "restart";
}

function blockingReason(plan: ChannelConnectorsDaemonPlan, action: ChannelConnectorsDaemonAction): string | null {
  if (action === "preview" || action === "status" || action === "stop") return null;
  if (!plan.supported) return "unsupported_supervisor";
  if (!fs.existsSync(plan.daemonEntry)) return "native_daemon_entry_missing";
  return null;
}

function tailLines(filePath: string, limit: number): { exists: boolean; lines: string[] } {
  const raw = readTextIfExists(filePath);
  if (raw === null) return { exists: false, lines: [] };
  const normalizedLimit = Math.max(1, Math.min(500, Math.floor(limit || 120)));
  const lines = raw.split(/\r?\n/);
  return {
    exists: true,
    lines: lines.slice(Math.max(0, lines.length - normalizedLimit)).filter((line) => line.length > 0),
  };
}

function writeJsonLine(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function normalizeOctoInboundAttachment(value: unknown): ChannelConnectorInboundAttachment | null {
  if (!isRecord(value)) return null;
  const rawKind = normalizeString(value.kind);
  const kind = rawKind === "image"
    || rawKind === "file"
    || rawKind === "audio"
    || rawKind === "video"
    || rawKind === "sticker"
    || rawKind === "unknown"
    ? rawKind
    : "unknown";
  return {
    kind,
    platform: "octo",
    key: normalizeString(value.key) || null,
    imageKey: normalizeString(value.imageKey || value.image_key) || null,
    fileKey: normalizeString(value.fileKey || value.file_key) || null,
    fileName: normalizeString(value.fileName || value.file_name || value.name) || null,
    mimeType: normalizeString(value.mimeType || value.mime_type || value.contentType || value.content_type) || null,
    size: typeof value.size === "number" && Number.isFinite(value.size) ? value.size : null,
    durationMs: typeof value.durationMs === "number" && Number.isFinite(value.durationMs)
      ? value.durationMs
      : typeof value.duration === "number" && Number.isFinite(value.duration)
        ? value.duration
        : null,
    url: normalizeString(value.url) || null,
    file_url: normalizeString(value.file_url) || null,
    fileUrl: normalizeString(value.fileUrl) || null,
    media_url: normalizeString(value.media_url) || null,
    mediaUrl: normalizeString(value.mediaUrl) || null,
    download_url: normalizeString(value.download_url) || null,
    downloadUrl: normalizeString(value.downloadUrl) || null,
    cdn_url: normalizeString(value.cdn_url) || null,
    cdnUrl: normalizeString(value.cdnUrl) || null,
    origin_url: normalizeString(value.origin_url) || null,
    originUrl: normalizeString(value.originUrl) || null,
    src: normalizeString(value.src) || null,
    href: normalizeString(value.href) || null,
    localPath: normalizeString(value.localPath || value.local_path) || null,
    stagedAt: normalizeString(value.stagedAt || value.staged_at) || null,
    stagingError: normalizeString(value.stagingError || value.staging_error) || null,
  };
}

function validateOctoInboundRequest(payload: ChannelConnectorOctoInboundRequest | undefined): ChannelConnectorOctoInboundRequest {
  if (!payload || !isRecord(payload)) throw new Error("Octo inbound payload is required.");
  if (!isRecord(payload.message)) throw new Error("Octo inbound message is required.");
  const message = payload.message;
  const messageId = normalizeString(message.messageId);
  const fromUid = normalizeString(message.fromUid);
  const channelId = normalizeString(message.channelId);
  const channelType = Number(message.channelType);
  if (!messageId) throw new Error("Octo messageId is required.");
  if (!fromUid) throw new Error("Octo fromUid is required.");
  if (!channelId) throw new Error("Octo channelId is required.");
  if (channelType !== 1 && channelType !== 2 && channelType !== 5) throw new Error("Octo channelType must be 1, 2, or 5.");
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    accountId: normalizeString(payload.accountId) || null,
    botId: normalizeString(payload.botId) || null,
    dryRun: payload.dryRun === true,
    sendReply: payload.sendReply === true,
    replyText: normalizeString(payload.replyText) || null,
    message: {
      messageId,
      fromUid,
      channelId,
      channelType,
      timestamp: typeof message.timestamp === "number" && Number.isFinite(message.timestamp) ? message.timestamp : null,
      payload: isRecord(message.payload) ? message.payload : {},
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map(normalizeOctoInboundAttachment).filter((attachment) => attachment !== null)
        : [],
      members: Array.isArray(message.members)
        ? message.members
          .filter((member) => isRecord(member))
          .map((member) => ({
            uid: normalizeString(member.uid),
            name: normalizeString(member.name),
          }))
          .filter((member) => member.uid && member.name)
        : [],
    },
  };
}

function normalizeOctoTransportSmokeRequest(payload: ChannelConnectorOctoTransportSmokeRequest | undefined): ChannelConnectorOctoTransportSmokeRequest {
  if (!payload || !isRecord(payload)) return { action: "register" };
  const action = payload.action === "typing"
    || payload.action === "send-message"
    || payload.action === "upload-credentials"
    || payload.action === "direct-upload-file"
    || payload.action === "upload-file"
    || payload.action === "direct-upload-and-send-media"
    || payload.action === "upload-and-send-media"
    || payload.action === "register"
    ? payload.action
    : "register";
  const channelType = Number(payload.channelType || 1);
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    action,
    channelId: normalizeString(payload.channelId) || null,
    channelType: channelType === 1 || channelType === 2 || channelType === 5 ? channelType : 1,
    content: normalizeString(payload.content) || "Studio Octo transport smoke",
    fileName: normalizeString(payload.fileName) || null,
    mimeType: normalizeString(payload.mimeType) || null,
  };
}

function normalizeFeishuTransportSmokeRequest(payload: ChannelConnectorFeishuTransportSmokeRequest | undefined): ChannelConnectorFeishuTransportSmokeRequest {
  if (!payload || !isRecord(payload)) return { action: "tenant-token" };
  const action = payload.action === "send-message"
    || payload.action === "send-post"
    || payload.action === "send-card"
    || payload.action === "patch-card"
    || payload.action === "upload-and-send-media"
    || payload.action === "tenant-token"
    ? payload.action
    : "tenant-token";
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    action,
    channelId: normalizeString(payload.channelId) || null,
    messageId: normalizeString(payload.messageId) || null,
    content: normalizeString(payload.content) || "Studio Feishu transport smoke",
    fileName: normalizeString(payload.fileName) || null,
    mimeType: normalizeString(payload.mimeType) || null,
  };
}

function normalizeCommandSurfaceRequest(payload: ChannelConnectorCommandSurfaceRequest | undefined): ChannelConnectorCommandSurfaceRequest {
  if (!payload || !isRecord(payload)) return { renderer: "all" };
  const renderer = payload.renderer === "text" || payload.renderer === "feishu" || payload.renderer === "all"
    ? payload.renderer
    : "all";
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    sessionKey: normalizeString(payload.sessionKey) || null,
    section: normalizeChannelConnectorCommandSurfaceSection(payload.section) || null,
    view: normalizeChannelConnectorCommandSurfaceView(payload.view) || null,
    renderer,
    models: stringList(payload.models),
  };
}

function normalizeCommandActionRequest(payload: ChannelConnectorCommandActionRequest | undefined): ChannelConnectorCommandActionRequest {
  if (!payload || !isRecord(payload)) return { renderer: "all" };
  const renderer = payload.renderer === "text" || payload.renderer === "feishu" || payload.renderer === "all"
    ? payload.renderer
    : "all";
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    sessionKey: normalizeString(payload.sessionKey) || null,
    fromUid: normalizeString(payload.fromUid) || null,
    channelId: normalizeString(payload.channelId) || null,
    messageId: normalizeString(payload.messageId) || null,
    actionValue: payload.actionValue,
    eventKey: normalizeString(payload.eventKey) || null,
    view: normalizeChannelConnectorCommandSurfaceView(payload.view) || null,
    renderer,
    models: stringList(payload.models),
    dryRun: payload.dryRun === true,
  };
}

function normalizeCommandActionText(value: string | null | undefined): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  if (normalized.startsWith("cmd:")) return normalizeString(normalized.slice("cmd:".length)) || null;
  if (normalized.startsWith("nav:") || normalized.startsWith("act:")) {
    const next = normalizeString(normalized.slice(4));
    return next.startsWith("/") ? next : null;
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function dryRunCommandName(command: string): string | null {
  const normalized = command.trim().replace(/^\/+/, "");
  return normalized.split(/\s+/)[0] || null;
}

function commandActionNotice(
  commandResult: Awaited<ReturnType<typeof handleChannelConnectorCommand>>,
  actionKind: "nav" | "act" | "cmd" | null,
): { title: string; text: string; ok: boolean | null } | null {
  if (actionKind === "nav") return null;
  const text = normalizeString(commandResult.replyText || commandResult.passthroughText);
  if (!text) return null;
  const action = normalizeString(commandResult.action).toLowerCase();
  if (action === "list") return null;
  const title = action === "status" ? "当前状态"
    : commandResult.action === "usage" ? "用量统计"
      : commandResult.action === "show" ? "缓存内容"
        : commandResult.action === "set" ? "设置已应用"
          : commandResult.action === "new" ? "新会话已开启"
            : commandResult.action === "reset" ? "会话已重置"
              : commandResult.action === "list" ? "可选项"
                : commandResult.action === "passthrough" ? "已发送给 Agent"
                : "执行结果";
  return {
    title,
    text: action === "status" ? "已刷新当前会话状态。" : text,
    ok: commandResult.ok,
  };
}

function commandActionToastContent(
  commandResult: {
    handled?: boolean | null;
    command?: string | null;
    action?: string | null;
    ok?: boolean | null;
  } | null | undefined,
  actionKind: "nav" | "act" | "cmd" | null,
): string {
  const command = normalizeString(commandResult?.command);
  const action = normalizeString(commandResult?.action).toLowerCase();
  if (actionKind === "nav") {
    const label = commandActionPageLabel(command);
    return label ? `已打开${label}` : "菜单已打开";
  }
  if (!commandResult?.handled) return command ? `已发送 ${command}` : "已发送给 Agent";
  if (commandResult.ok === false) return "命令执行失败，详情见卡片或回复";
  if (action === "status") return "状态已刷新";
  if (action === "usage") return "用量已刷新";
  if (action === "set") return "设置已应用";
  if (action === "list") return "列表已刷新";
  if (action === "new") return "新会话已开启";
  if (action === "reset") return "会话已重置";
  return command ? `已执行 ${command}` : "命令已执行";
}

function commandActionPageLabel(command: string): string | null {
  const parts = normalizeString(command).replace(/^[/%]+/, "").split(/\s+/).filter(Boolean);
  const name = (parts[0] || "").toLowerCase();
  const sub = (parts[1] || "").toLowerCase();
  if (!name) return null;
  const section = name === "help" ? sub || "home" : name;
  if (section === "home" || section === "menu" || section === "help") return "主菜单";
  if (["session", "status"].includes(section)) return "会话菜单";
  if (["current"].includes(section)) return "当前会话";
  if (["list", "sessions", "switch"].includes(section)) return "续接列表";
  if (["history"].includes(section)) return "会话历史";
  if (["agent", "agents", "project", "profile"].includes(section)) return "Agent 设置";
  if (["model", "models"].includes(section)) return "模型设置";
  if (["mode", "permission", "permissions", "reasoning", "effort"].includes(section)) return "权限与推理";
  if (["display", "stream", "tools", "tool"].includes(section)) return "显示设置";
  if (["buffer", "buffers", "reply-buffer", "reply-buffers"].includes(section)) return "Reply Buffer";
  if (["workdir", "dir", "pwd", "cd", "chdir"].includes(section)) return "工作目录";
  if (["commands", "command", "cmd"].includes(section)) return "自定义命令";
  if (["native", "raw", "pass"].includes(section)) return "原生 Agent";
  return null;
}

function shouldReturnCommandActionCard(
  commandResult: Awaited<ReturnType<typeof handleChannelConnectorCommand>>,
  actionKind: "nav" | "act" | "cmd" | null,
): boolean {
  if (!commandResult.handled) return false;
  const action = normalizeString(commandResult.action).toLowerCase();
  if (actionKind === "nav") return true;
  if (["new", "reset", "show", "passthrough"].includes(action)) return false;
  return ["help", "status", "usage", "list", "set"].includes(action);
}

async function modelsForCommandSurface(input: {
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorsDaemonRuntimeConfig["projects"][number];
  requestedModels?: string[];
}): Promise<string[]> {
  const requested = stringList(input.requestedModels);
  if (requested.length) return requested;
  try {
    return await listChannelConnectorGatewayModels(
      input.project.gatewayEndpoint || input.runtimeConfig.gateway.endpoint,
      resolveChannelConnectorGatewayClientKey(input.runtimeConfig),
    );
  } catch {
    return [];
  }
}

function derivedCommandActionSessionKey(input: {
  sessionKey?: string | null;
  platform: string;
  channelId?: string | null;
  fromUid?: string | null;
}): string | null {
  const explicit = normalizeString(input.sessionKey);
  if (explicit) return explicit;
  const fromUid = normalizeString(input.fromUid);
  const channelId = normalizeString(input.channelId) || fromUid;
  if (!fromUid && !channelId) return null;
  return `${input.platform}:${channelId || fromUid}:${fromUid || channelId}`;
}

function metadataBooleanValue(metadata: Record<string, unknown> | undefined, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "boolean") return value;
    const normalized = normalizeString(value).toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function metadataNumberValue(metadata: Record<string, unknown> | undefined, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = Number(metadata?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function feishuWebhookStaleEventMaxAgeMs(binding: ChannelConnectorPlatformBinding): number {
  const value = metadataNumberValue(binding.metadata, [
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

function feishuWebhookParsedEventTimeMs(parsed: ReturnType<typeof parseChannelConnectorFeishuWebhook>): number | null {
  return parsed.messageCreateTimeMs || parsed.eventCreateTimeMs || null;
}

function feishuWebhookStaleEventState(
  binding: ChannelConnectorPlatformBinding,
  parsed: ReturnType<typeof parseChannelConnectorFeishuWebhook>,
  nowMs: number,
): {
  stale: boolean;
  eventTimeMs: number | null;
  eventAgeMs: number | null;
  maxAgeMs: number;
} {
  const maxAgeMs = feishuWebhookStaleEventMaxAgeMs(binding);
  const eventTimeMs = feishuWebhookParsedEventTimeMs(parsed);
  if (maxAgeMs <= 0 || !eventTimeMs) return { stale: false, eventTimeMs, eventAgeMs: null, maxAgeMs };
  const eventAgeMs = Math.max(0, nowMs - eventTimeMs);
  return {
    stale: eventAgeMs > maxAgeMs,
    eventTimeMs,
    eventAgeMs,
    maxAgeMs,
  };
}

function feishuSessionKeyForWebhook(
  binding: ChannelConnectorPlatformBinding,
  parsed: ReturnType<typeof parseChannelConnectorFeishuWebhook>,
): string | null {
  return buildFeishuSessionKey(parsed, {
    threadIsolation: metadataBooleanValue(binding.metadata, ["threadIsolation", "thread_isolation"], true),
    shareSessionInChannel: metadataBooleanValue(binding.metadata, ["shareSessionInChannel", "share_session_in_channel"], false),
  });
}

function resolveOctoBindingById(
  nativeConfig: ChannelConnectorsNativeConfig,
  bindingId: string | null | undefined,
): { binding: ChannelConnectorsNativeConfig["platformBindings"][number]; agentProfile: ChannelConnectorsNativeConfig["agentProfiles"][number] } | null {
  const octoBindings = nativeConfig.platformBindings.filter((binding) => binding.platform === "octo" && binding.enabled);
  const binding = bindingId
    ? octoBindings.find((candidate) => candidate.id === bindingId)
    : octoBindings.length === 1
      ? octoBindings[0]
      : null;
  if (!binding) return null;
  const agentProfile = nativeConfig.agentProfiles.find((profile) => profile.id === binding.agentProfileId);
  return agentProfile ? { binding, agentProfile } : null;
}

function resolveRuntimeBindingById(
  nativeConfig: ChannelConnectorsNativeConfig,
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig,
  bindingId: string | null | undefined,
): {
  binding: ChannelConnectorsNativeConfig["platformBindings"][number];
  agentProfile: ChannelConnectorsNativeConfig["agentProfiles"][number];
  project: ChannelConnectorsDaemonRuntimeConfig["projects"][number];
  runtimeBinding: ChannelConnectorsDaemonRuntimeConfig["projects"][number]["platformBindings"][number];
} | null {
  const enabledBindings = nativeConfig.platformBindings.filter((binding) => binding.enabled);
  const binding = bindingId
    ? enabledBindings.find((candidate) => candidate.id === bindingId)
    : enabledBindings.length === 1
      ? enabledBindings[0]
      : null;
  if (!binding) return null;
  const agentProfile = nativeConfig.agentProfiles.find((profile) => profile.id === binding.agentProfileId);
  const project = runtimeConfig.projects.find((candidate) => candidate.id === binding.agentProfileId);
  const runtimeBinding = project?.platformBindings.find((candidate) => candidate.id === binding.id);
  if (!agentProfile || !project || !runtimeBinding) return null;
  return { binding, agentProfile, project, runtimeBinding };
}

function bindingMetadataString(
  binding: ChannelConnectorsNativeConfig["platformBindings"][number],
  keys: string[],
): string {
  const metadata = isRecord(binding.metadata) ? binding.metadata : {};
  for (const key of keys) {
    const value = normalizeString(metadata[key]);
    if (value) return value;
  }
  return "";
}

function resolveRuntimeBindingForPlatform(
  nativeConfig: ChannelConnectorsNativeConfig,
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig,
  platform: ChannelConnectorPlatformId,
  bindingId: string | null | undefined,
  accountId: string | null | undefined,
): {
  binding: ChannelConnectorsNativeConfig["platformBindings"][number];
  agentProfile: ChannelConnectorsNativeConfig["agentProfiles"][number];
  project: ChannelConnectorsDaemonRuntimeConfig["projects"][number];
  runtimeBinding: ChannelConnectorsDaemonRuntimeConfig["projects"][number]["platformBindings"][number];
} | null {
  const platformBindings = nativeConfig.platformBindings.filter((binding) => binding.enabled && binding.platform === platform);
  const normalizedAccountId = normalizeString(accountId);
  const binding = bindingId
    ? platformBindings.find((candidate) => candidate.id === bindingId)
    : normalizedAccountId
      ? platformBindings.find((candidate) =>
        candidate.accountId === normalizedAccountId
        || bindingMetadataString(candidate, ["appId", "app_id"]) === normalizedAccountId
      )
      : platformBindings.length === 1
        ? platformBindings[0]
        : null;
  if (!binding) return null;
  const agentProfile = nativeConfig.agentProfiles.find((profile) => profile.id === binding.agentProfileId);
  const project = runtimeConfig.projects.find((candidate) => candidate.id === binding.agentProfileId);
  const runtimeBinding = project?.platformBindings.find((candidate) => candidate.id === binding.id);
  if (!agentProfile || !project || !runtimeBinding) return null;
  return { binding, agentProfile, project, runtimeBinding };
}

function verifyFeishuWebhookToken(
  binding: ChannelConnectorsNativeConfig["platformBindings"][number] | null,
  token: string | null | undefined,
): ChannelConnectorFeishuWebhookResponse["verification"] {
  if (!binding) return { configured: false, checked: false, ok: null };
  const expected = bindingMetadataString(binding, [
    "verificationToken",
    "verification_token",
    "feishuVerificationToken",
    "feishu_verification_token",
  ]);
  if (!expected) return { configured: false, checked: false, ok: null };
  return {
    configured: true,
    checked: true,
    ok: safeEqualFeishuWebhookToken(token, expected),
  };
}

function commandSurfaceControlsPath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-session-controls.json");
}

function commandSurfaceCustomCommandsPath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-custom-commands.json");
}

function commandSurfaceCommandAliasesPath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-command-aliases.json");
}

function commandSurfaceAgentSessionsPath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-sessions.json");
}

function commandSurfaceHistoryPath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-history.json");
}

function commandSurfaceReplyBuffersPath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-reply-buffers.json");
}

function commandSurfaceGovernancePath(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): string {
  return path.join(runtimeConfig.paths.state, "channel-governance.json");
}

function commandSurfaceReadOnlyState(input: {
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorsDaemonRuntimeConfig["projects"][number];
  binding: ChannelConnectorsDaemonRuntimeConfig["projects"][number]["platformBindings"][number];
  control: ReturnType<typeof getChannelConnectorSessionControl>;
  sessionKey: string | null | undefined;
}): {
  agentSession: ChannelConnectorCommandSurface["session"];
  sessionList: ChannelConnectorCommandSurface["sessionList"];
  history: ChannelConnectorCommandSurface["history"];
  customCommands: NonNullable<ChannelConnectorCommandSurfaceInput["customCommands"]>;
  skills: NonNullable<ChannelConnectorCommandSurfaceInput["skills"]>;
} {
  const sessionKey = normalizeString(input.sessionKey);
  const current = resolveChannelConnectorEffectiveProject(input.runtimeConfig, input.project, input.control);
  const customCommands = listChannelConnectorCommandSummaries({
    customCommandsPath: commandSurfaceCustomCommandsPath(input.runtimeConfig),
  }, current);
  const skills = listChannelConnectorSkillSummaries(current);
  if (!sessionKey) return { agentSession: null, sessionList: [], history: [], customCommands, skills };
  const session = getChannelConnectorAgentSession(commandSurfaceAgentSessionsPath(input.runtimeConfig), {
    bindingId: input.binding.id,
    projectId: current.id,
    sessionKey,
    agent: current.agent,
    model: current.model,
    workDir: current.workDir,
  });
  const sessionList = listChannelConnectorAgentSessionsForConversation(commandSurfaceAgentSessionsPath(input.runtimeConfig), {
    bindingId: input.binding.id,
    sessionKey,
    limit: 20,
  }).map((record) => ({
    id: record.id,
    name: record.name,
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
  const history = getChannelConnectorConversationHistory(commandSurfaceHistoryPath(input.runtimeConfig), {
    bindingId: input.binding.id,
    sessionKey,
  }, 10).map((entry) => ({
    role: entry.role,
    text: entry.text,
    attachmentSummaries: entry.attachmentSummaries,
    status: entry.status,
    createdAt: entry.createdAt,
    messageId: entry.messageId,
  }));
  return {
    agentSession: session ? {
      started: true,
      id: session.id,
      name: session.name,
      turnCount: session.turnCount,
      agentNativeSessionId: session.agentNativeSessionId,
      codexThreadId: session.codexThreadId,
      lastStatus: session.lastStatus,
      lastMessageId: session.lastMessageId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    } : {
      started: false,
      id: null,
      name: input.control?.sessionName || null,
      turnCount: 0,
      agentNativeSessionId: null,
      codexThreadId: null,
      lastStatus: null,
      lastMessageId: null,
      createdAt: null,
      updatedAt: null,
    },
    sessionList,
    history,
    customCommands,
    skills,
  };
}

function bindingPolicy(): ChannelConnectorsBindingPolicy {
  return {
    model: "platform-account-or-bot-to-agent",
    supportedAgents: [...CHANNEL_CONNECTOR_AGENT_IDS],
    supportedPlatforms: [...CHANNEL_CONNECTOR_PLATFORM_IDS],
    multiBot: {
      allowed: true,
      unit: "platform-account-or-bot",
    },
    wechatPersonal: {
      maxAgentsPerAccount: 1,
    },
  };
}

function buildNativeConfigResponse(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsNativeConfigResponse {
  return {
    ok: true,
    checkedAt: now.toISOString(),
    configPath: paths.nativeConfigPath,
    config: readNativeConfig(config, paths, now),
    supportedAgents: [...CHANNEL_CONNECTOR_AGENT_IDS],
    supportedPlatforms: [...CHANNEL_CONNECTOR_PLATFORM_IDS],
    permissionModes: [...PERMISSION_MODES],
  };
}

export function createChannelConnectorsService(
  config: StudioServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ChannelConnectorsService {
  const now = () => (options.now ? options.now() : new Date());
  const paths = () => resolveChannelConnectorsPaths(config, options.homeDir);
  const runCommand = (command: ChannelConnectorsDaemonCommand) =>
    options.commandRunner ? options.commandRunner(command) : runDefaultCommand(command);

  function currentConfigFull(): ChannelConnectorsDaemonConfigResponse {
    return buildConfigResponse(config, paths(), now());
  }

  function currentConfig(): ChannelConnectorsDaemonConfigResponse {
    return redactConfigResponse(currentConfigFull());
  }

  function currentNativeConfig(): ChannelConnectorsNativeConfigResponse {
    return buildNativeConfigResponse(config, paths(), now());
  }

  function saveNativeConfig(payload: ChannelConnectorsSaveNativeConfigRequest = {}): ChannelConnectorsNativeConfigResponse {
    if (!payload.config) throw new Error("Channel Connectors config payload is required.");
    const resolvedPaths = paths();
    const saved = writeNativeConfig(config, resolvedPaths, payload.config, now());
    return {
      ok: true,
      checkedAt: now().toISOString(),
      configPath: resolvedPaths.nativeConfigPath,
      config: saved,
      supportedAgents: [...CHANNEL_CONNECTOR_AGENT_IDS],
      supportedPlatforms: [...CHANNEL_CONNECTOR_PLATFORM_IDS],
      permissionModes: [...PERMISSION_MODES],
    };
  }

  async function getCommandSurface(payload: ChannelConnectorCommandSurfaceRequest = {}): Promise<ChannelConnectorCommandSurfaceResponse> {
    const request = normalizeCommandSurfaceRequest(payload);
    const resolvedPaths = paths();
    const checkedAt = now().toISOString();
    const nativeConfig = readNativeConfig(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(nativeConfig, resolvedPaths);
    const resolved = resolveRuntimeBindingById(nativeConfig, runtimeConfig, request.bindingId);
    if (!resolved) {
      return {
        ok: true,
        checkedAt,
        renderer: request.renderer || "all",
        binding: null,
        agentProfile: null,
        surface: null,
        textFallback: null,
        feishuCard: null,
      };
    }

    const control = request.sessionKey
      ? getChannelConnectorSessionControl(commandSurfaceControlsPath(runtimeConfig), {
        bindingId: resolved.binding.id,
        sessionKey: request.sessionKey,
      })
      : null;
    const models = await modelsForCommandSurface({
      runtimeConfig,
      project: resolved.project,
      requestedModels: request.models,
    });
    const readOnlyState = commandSurfaceReadOnlyState({
      runtimeConfig,
      project: resolved.project,
      binding: resolved.runtimeBinding,
      control,
      sessionKey: request.sessionKey,
    });
    const surface = buildChannelConnectorCommandSurface({
      config: runtimeConfig,
      project: resolved.project,
      binding: resolved.runtimeBinding,
      control,
      sessionKey: request.sessionKey,
      models,
      agentSession: readOnlyState.agentSession,
      sessionList: readOnlyState.sessionList,
      history: readOnlyState.history,
      customCommands: readOnlyState.customCommands,
      skills: readOnlyState.skills,
      selectedSectionId: request.section,
      selectedViewId: request.view,
    });
    return {
      ok: true,
      checkedAt,
      renderer: request.renderer || "all",
      binding: resolved.binding,
      agentProfile: resolved.agentProfile,
      surface,
      textFallback: surface.textFallback,
      feishuCard: request.renderer === "text" ? null : renderChannelConnectorCommandSurfaceFeishu(surface),
    };
  }

  async function handleCommandAction(payload: ChannelConnectorCommandActionRequest = {}): Promise<ChannelConnectorCommandActionResponse> {
    const request = normalizeCommandActionRequest(payload);
    const parsedAction = extractChannelConnectorSurfaceActionPayload(request.actionValue);
    const command = normalizeCommandActionText(parsedAction.command || request.eventKey);
    const bindingId = parsedAction.bindingId || request.bindingId || null;
    const sessionKey = derivedCommandActionSessionKey({
      sessionKey: parsedAction.sessionKey || request.sessionKey || null,
      platform: "feishu",
      channelId: request.channelId || null,
      fromUid: request.fromUid || null,
    });
    const checkedAt = now().toISOString();
    const resolvedPaths = paths();
    const nativeConfig = readNativeConfig(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(nativeConfig, resolvedPaths);
    const resolved = resolveRuntimeBindingById(nativeConfig, runtimeConfig, bindingId);

    if (!command) {
      return {
        ok: true,
        checkedAt,
        accepted: false,
        skippedReason: "command_action_missing",
        binding: resolved?.binding || null,
        agentProfile: resolved?.agentProfile || null,
        sessionKey,
        command: null,
        commandResult: null,
        surface: null,
        textFallback: null,
        feishuCard: null,
      };
    }
    if (!resolved) {
      return {
        ok: true,
        checkedAt,
        accepted: false,
        skippedReason: "binding_not_found",
        binding: null,
        agentProfile: null,
        sessionKey,
        command,
        commandResult: null,
        surface: null,
        textFallback: null,
        feishuCard: null,
      };
    }
    if (!sessionKey) {
      return {
        ok: true,
        checkedAt,
        accepted: false,
        skippedReason: "session_key_missing",
        binding: resolved.binding,
        agentProfile: resolved.agentProfile,
        sessionKey: null,
        command,
        commandResult: null,
        surface: null,
        textFallback: null,
        feishuCard: null,
      };
    }
    const governance = evaluateChannelConnectorGovernance({
      binding: resolved.binding,
      platform: resolved.binding.platform,
      fromUid: request.fromUid || "",
      content: command,
      statePath: request.dryRun === true ? null : commandSurfaceGovernancePath(runtimeConfig),
      now: now(),
    });
    if (!governance.allowed) {
      return {
        ok: true,
        checkedAt,
        accepted: false,
        skippedReason: governance.skippedReason || "channel_governance_blocked",
        binding: resolved.binding,
        agentProfile: resolved.agentProfile,
        sessionKey,
        command,
        commandResult: null,
        surface: null,
        textFallback: null,
        feishuCard: null,
      };
    }

    const controlsPath = commandSurfaceControlsPath(runtimeConfig);
    const agentSessionsPath = commandSurfaceAgentSessionsPath(runtimeConfig);
    const historyPath = commandSurfaceHistoryPath(runtimeConfig);
    const commandModels = await modelsForCommandSurface({
      runtimeConfig,
      project: resolved.project,
      requestedModels: request.models,
    });
    const gatewayClientKey = resolveChannelConnectorGatewayClientKey(runtimeConfig);
    const commandResult: ChannelConnectorCommandResult = request.dryRun === true
      ? {
        handled: true,
        command: dryRunCommandName(command),
        action: "show",
        ok: true,
        control: null,
        replyText: `Dry-run：已解析命令 ${command}，未执行状态修改、Gateway compact 或平台发送。`,
        passthroughText: null,
      }
      : await handleChannelConnectorCommand({
        config: runtimeConfig,
        project: resolved.project,
        binding: resolved.runtimeBinding,
        sessionKey,
        controlsPath,
        commandAliasesPath: commandSurfaceCommandAliasesPath(runtimeConfig),
        customCommandsPath: commandSurfaceCustomCommandsPath(runtimeConfig),
        agentSessionsPath,
        conversationHistoryPath: historyPath,
        replyBuffersPath: commandSurfaceReplyBuffersPath(runtimeConfig),
        gatewayClientKey,
        listModels: async () => commandModels,
        compactConversation: (scope) => compactChannelConnectorConversation({
          historyPath,
          agentSessionsPath,
          gatewayEndpoint: runtimeConfig.gateway.endpoint,
          gatewayClientKey,
          bindingId: scope.bindingId,
          sessionKey: scope.sessionKey,
          project: scope.project,
        }),
        message: {
          messageId: request.messageId || `feishu-action-${Date.now()}`,
          fromUid: request.fromUid || "",
          channelId: request.channelId || request.fromUid || sessionKey,
          channelType: 1,
          timestamp: Date.now(),
          payload: {
            type: 1,
            content: command,
          },
          members: [],
        },
      });
    const selectedSectionId = parsedAction.targetSectionId
      || channelConnectorCommandSurfaceSectionFromCommand(command)
      || normalizeChannelConnectorCommandSurfaceSection(request.eventKey)
      || null;
    const selectedViewId = parsedAction.targetViewId
      || channelConnectorCommandSurfaceViewFromCommand(command, parsedAction.actionKind)
      || normalizeChannelConnectorCommandSurfaceView(request.view)
      || normalizeChannelConnectorCommandSurfaceView(request.eventKey)
      || null;
    const control = getChannelConnectorSessionControl(controlsPath, {
      bindingId: resolved.binding.id,
      sessionKey,
    });
    const readOnlyState = commandSurfaceReadOnlyState({
      runtimeConfig,
      project: resolved.project,
      binding: resolved.runtimeBinding,
      control,
      sessionKey,
    });
    const surface = buildChannelConnectorCommandSurface({
      config: runtimeConfig,
      project: resolved.project,
      binding: resolved.runtimeBinding,
      control,
      sessionKey,
      models: commandModels,
      agentSession: readOnlyState.agentSession,
      sessionList: readOnlyState.sessionList,
      history: readOnlyState.history,
      customCommands: readOnlyState.customCommands,
      skills: readOnlyState.skills,
      selectedSectionId,
      selectedViewId,
    });

    return {
      ok: true,
      checkedAt,
      accepted: true,
      skippedReason: null,
      binding: resolved.binding,
      agentProfile: resolved.agentProfile,
      sessionKey,
      command,
      commandResult: {
        handled: commandResult.handled,
        command: commandResult.command,
        action: commandResult.action,
        ok: commandResult.ok,
        replyText: commandResult.replyText,
        passthroughText: commandResult.passthroughText || null,
      },
      surface,
      textFallback: surface.textFallback,
      feishuCard: request.renderer === "text" || !shouldReturnCommandActionCard(commandResult, parsedAction.actionKind)
        ? null
        : renderChannelConnectorCommandSurfaceFeishu(surface, commandActionNotice(commandResult, parsedAction.actionKind)),
    };
  }

  async function dispatchFeishuWebhook(payload: ChannelConnectorFeishuWebhookRequest = {}): Promise<ChannelConnectorFeishuWebhookResponse> {
    const request = isRecord(payload) ? payload : {};
    const parsed = parseChannelConnectorFeishuWebhook(payload);
    const checkedAt = now().toISOString();
    const resolvedPaths = paths();
    const nativeConfig = readNativeConfig(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(nativeConfig, resolvedPaths);
    const resolved = resolveRuntimeBindingForPlatform(
      nativeConfig,
      runtimeConfig,
      "feishu",
      parsed.bindingId || normalizeString(request.bindingId) || null,
      parsed.appId,
    );
    const verification = verifyFeishuWebhookToken(resolved?.binding || null, parsed.token);
    const tokenRejected = verification.ok === false;
    const eventPath = resolvedPaths.feishuEventLogFile;
    const renderer = request.renderer === "text" || request.renderer === "feishu" || request.renderer === "all"
      ? request.renderer
      : "all";
    const models = stringList(request.models);
    let transport = emptyFeishuTransportResult();

    const baseAgentDispatch = {
      status: "skipped" as const,
      agent: resolved?.agentProfile.agent || null,
      model: resolved?.agentProfile.model || null,
      workDir: resolved?.agentProfile.workDir || null,
      gatewayEndpoint: resolved?.agentProfile.gatewayEndpoint || null,
      gatewayKeyRef: resolved?.agentProfile.gatewayKeyRef || null,
    };
    const finish = (response: ChannelConnectorFeishuWebhookResponse): ChannelConnectorFeishuWebhookResponse => {
      writeJsonLine(eventPath, {
        checkedAt,
        adapter: "feishu",
        eventKind: response.eventKind,
        eventType: response.eventType,
        eventId: response.eventId,
        eventCreateTimeMs: parsed.eventCreateTimeMs,
        messageCreateTimeMs: parsed.messageCreateTimeMs,
        accepted: response.accepted,
        skippedReason: response.skippedReason,
        bindingId: response.binding?.id || null,
        agentProfileId: response.agentProfile?.id || null,
        sessionKey: response.sessionKey,
        messageId: response.incoming?.messageId || parsed.messageId || null,
        channelId: response.incoming?.channelId || parsed.channelId || null,
        chatType: response.incoming?.chatType || parsed.chatType || null,
        fromUid: response.incoming?.fromUid || parsed.fromUid || null,
        rootId: response.incoming?.rootId || parsed.rootId || null,
        parentId: response.incoming?.parentId || parsed.parentId || null,
        threadId: response.incoming?.threadId || parsed.threadId || null,
        messageType: response.incoming?.messageType || parsed.messageType || null,
        attachmentCount: response.incoming?.attachments.length || parsed.attachments.length,
        attachmentKinds: (response.incoming?.attachments || parsed.attachments).map((attachment) => attachment.kind),
        command: response.commandAction?.command || null,
      });
      response.eventStored.written = true;
      return response;
    };
    const skipped = (skippedReason: string): ChannelConnectorFeishuWebhookResponse => finish({
      ok: true,
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted: false,
      skippedReason,
      verification,
      challenge: parsed.challenge,
      binding: resolved?.binding || null,
      agentProfile: resolved?.agentProfile || null,
      sessionKey: null,
      incoming: null,
      commandAction: null,
      agentDispatch: baseAgentDispatch,
      transport,
      feishuResponse: null,
      eventStored: {
        path: eventPath,
        written: false,
      },
    });

    if (!resolved) return skipped("feishu_binding_not_found");
    if (tokenRejected) return skipped("feishu_verification_token_mismatch");

    if (parsed.kind === "url-verification") {
      if (!parsed.challenge) return skipped("feishu_challenge_missing");
      return finish({
        ok: true,
        checkedAt,
        adapter: "feishu",
        eventKind: parsed.kind,
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        accepted: true,
        skippedReason: null,
        verification,
        challenge: parsed.challenge,
        binding: resolved.binding,
        agentProfile: resolved.agentProfile,
        sessionKey: null,
        incoming: null,
        commandAction: null,
        agentDispatch: baseAgentDispatch,
        transport,
        feishuResponse: { challenge: parsed.challenge },
        eventStored: {
          path: eventPath,
          written: false,
        },
      });
    }

    if (parsed.kind === "card-action" || parsed.kind === "bot-menu") {
      const action = await handleCommandAction({
        bindingId: resolved.binding.id,
        sessionKey: null,
        fromUid: parsed.fromUid,
        channelId: parsed.channelId,
        messageId: parsed.messageId,
        actionValue: parsed.actionValue,
        eventKey: parsed.eventKey,
        renderer,
        models,
      });
      const toastContent = commandActionToastContent(action.commandResult, extractChannelConnectorSurfaceActionPayload(parsed.actionValue).actionKind);
      const textReplyContent = action.commandResult?.replyText
        || action.commandResult?.passthroughText
        || action.skippedReason
        || "Studio command accepted.";
      let accepted = action.accepted;
      let skippedReason = action.skippedReason;
      let feishuResponse: Record<string, unknown> | null = null;
      const shouldReturnCard = Boolean(action.feishuCard && renderer !== "text");
      if (shouldReturnCard && action.feishuCard) {
        feishuResponse = {
          toast: {
            type: action.commandResult?.ok === false || !action.accepted ? "warning" : "info",
            content: toastContent,
          },
          card: { type: "raw", data: action.feishuCard },
        };
      } else if (request.sendReply === true && textReplyContent) {
        const transportConfig = feishuTransportFromBinding(resolved.binding);
        if (!transportConfig) {
          accepted = false;
          skippedReason = "feishu_transport_config_missing";
          transport = {
            ...emptyFeishuTransportResult("send-message"),
            error: "feishu_transport_config_missing",
          };
        } else {
          transport = await sendFeishuTextMessage(transportConfig, {
            chatId: parsed.channelId || "",
            content: textReplyContent,
          }, resolvedPaths.feishuTokenCacheFile);
          accepted = transport.ok === true;
          skippedReason = transport.ok === true ? null : "feishu_transport_send_failed";
        }
      }
      return finish({
        ok: true,
        checkedAt,
        adapter: "feishu",
        eventKind: parsed.kind,
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        accepted,
        skippedReason,
        verification,
        challenge: null,
        binding: resolved.binding,
        agentProfile: resolved.agentProfile,
        sessionKey: action.sessionKey,
        incoming: null,
        commandAction: action,
        agentDispatch: baseAgentDispatch,
        transport,
        feishuResponse,
        eventStored: {
          path: eventPath,
          written: false,
        },
      });
    }

    if (parsed.kind !== "message") return skipped("feishu_event_unsupported");
    const staleEvent = feishuWebhookStaleEventState(resolved.binding, parsed, Date.parse(checkedAt));
    if (staleEvent.stale) return skipped("feishu_event_stale");
    if (!parsed.messageId || !parsed.fromUid || !parsed.channelId) return skipped("feishu_message_identity_missing");
    let effectiveText = normalizeString(parsed.text);
    const aliasResolution = resolveChannelConnectorBindingCommandAlias(
      resolved.runtimeBinding,
      effectiveText,
      commandSurfaceCommandAliasesPath(runtimeConfig),
    );
    effectiveText = aliasResolution.content;
    if (!effectiveText) return skipped("feishu_message_text_missing");
    if (!parsed.directed) return skipped("feishu_group_message_not_directed");

    const sessionKey = feishuSessionKeyForWebhook(resolved.binding, parsed);
    if (!sessionKey) return skipped("session_key_missing");
    const governance = evaluateChannelConnectorGovernance({
      binding: resolved.binding,
      platform: "feishu",
      fromUid: parsed.fromUid,
      content: effectiveText,
      statePath: request.dryRun === true ? null : commandSurfaceGovernancePath(runtimeConfig),
      now: now(),
    });
    if (!governance.allowed) return skipped(governance.skippedReason || "channel_governance_blocked");

    let commandAction: ChannelConnectorCommandActionResponse | null = null;
    let accepted = request.dryRun === true;
    let skippedReason: string | null = request.dryRun === true ? null : "agent_dispatch_not_ready";
    let agentStatus: "dry-run" | "not-ready" | "skipped" = request.dryRun === true ? "dry-run" : "not-ready";
    let feishuResponse: Record<string, unknown> | null = null;
    if (effectiveText.startsWith("/")) {
      commandAction = await handleCommandAction({
        bindingId: resolved.binding.id,
        sessionKey,
        fromUid: parsed.fromUid,
        channelId: parsed.channelId,
        messageId: parsed.messageId,
        eventKey: effectiveText,
        renderer,
        models,
        dryRun: request.dryRun === true,
      });
      accepted = commandAction.accepted;
      skippedReason = commandAction.skippedReason;
      agentStatus = request.dryRun === true ? "dry-run" : "skipped";
      const content = commandAction.commandResult?.replyText || commandAction.commandResult?.passthroughText || skippedReason || "";
      if (request.sendReply === true && content) {
        const transportConfig = feishuTransportFromBinding(resolved.binding);
        if (!transportConfig) {
          accepted = false;
          skippedReason = "feishu_transport_config_missing";
          transport = {
            ...emptyFeishuTransportResult("send-message"),
            error: "feishu_transport_config_missing",
          };
        } else if (commandAction.feishuCard && renderer !== "text") {
          transport = await sendFeishuCardMessage(transportConfig, {
            chatId: parsed.channelId,
            card: commandAction.feishuCard,
          }, resolvedPaths.feishuTokenCacheFile);
          accepted = transport.ok === true;
          skippedReason = transport.ok === true ? null : "feishu_transport_send_failed";
        } else {
          transport = await sendFeishuTextMessage(transportConfig, {
            chatId: parsed.channelId,
            content,
          }, resolvedPaths.feishuTokenCacheFile);
          accepted = transport.ok === true;
          skippedReason = transport.ok === true ? null : "feishu_transport_send_failed";
        }
      }
      if (content) {
        feishuResponse = {
          toast: {
            type: commandAction.commandResult?.ok === false || !commandAction.accepted ? "warning" : "info",
            content,
          },
        };
        if (commandAction.feishuCard && renderer !== "text") {
          feishuResponse.card = {
            type: "raw",
            data: commandAction.feishuCard,
          };
        }
      }
    }

    return finish({
      ok: true,
      checkedAt,
      adapter: "feishu",
      eventKind: parsed.kind,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      accepted,
      skippedReason,
      verification,
      challenge: null,
      binding: resolved.binding,
      agentProfile: resolved.agentProfile,
      sessionKey,
      incoming: {
        messageId: parsed.messageId,
        platform: "feishu",
        channelId: parsed.channelId,
        chatType: parsed.chatType,
        fromUid: parsed.fromUid,
        rootId: parsed.rootId,
        parentId: parsed.parentId,
        threadId: parsed.threadId,
        messageType: parsed.messageType,
        attachments: parsed.attachments,
        content: effectiveText,
        directed: parsed.directed,
      },
      commandAction,
      agentDispatch: {
        ...baseAgentDispatch,
        status: agentStatus,
      },
      transport,
      feishuResponse,
      eventStored: {
        path: eventPath,
        written: false,
      },
    });
  }

  async function runFeishuTransportSmoke(payload?: ChannelConnectorFeishuTransportSmokeRequest): Promise<ChannelConnectorFeishuTransportSmokeResponse> {
    const request = normalizeFeishuTransportSmokeRequest(payload);
    const resolvedPaths = paths();
    const nativeConfig = readNativeConfig(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(nativeConfig, resolvedPaths);
    const resolved = resolveRuntimeBindingForPlatform(nativeConfig, runtimeConfig, "feishu", request.bindingId, null);
    const checkedAt = now().toISOString();
    if (!resolved) {
      return {
        ok: true,
        checkedAt,
        adapter: "feishu",
        binding: null,
        transport: {
          ...emptyFeishuTransportResult(request.action || "tenant-token"),
          error: "feishu_binding_not_found",
        },
      };
    }
    const transportConfig = feishuTransportFromBinding(resolved.binding);
    if (!transportConfig) {
      return {
        ok: true,
        checkedAt,
        adapter: "feishu",
        binding: resolved.binding,
        transport: {
          ...emptyFeishuTransportResult(request.action || "tenant-token"),
          error: "feishu_transport_config_missing",
        },
      };
    }

    let transport: ChannelConnectorFeishuTransportResult;
    if (request.action === "send-message") {
      if (!request.channelId) throw new Error("channelId is required for Feishu send-message smoke.");
      transport = await sendFeishuTextMessage(transportConfig, {
        chatId: request.channelId,
        content: request.content || "Studio Feishu transport smoke",
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "send-post") {
      if (!request.channelId) throw new Error("channelId is required for Feishu send-post smoke.");
      transport = await sendFeishuPostMessage(transportConfig, {
        chatId: request.channelId,
        content: request.content || "**Studio Feishu post smoke**\n\n```text\nmarkdown\n```",
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "send-card") {
      if (!request.channelId) throw new Error("channelId is required for Feishu send-card smoke.");
      transport = await sendFeishuCardMessage(transportConfig, {
        chatId: request.channelId,
        card: {
          config: { wide_screen_mode: true },
          header: {
            title: { tag: "plain_text", content: "Studio Feishu command menu smoke" },
            template: "blue",
          },
          elements: [
            {
              tag: "markdown",
              content: request.content || "Studio Feishu command menu smoke",
            },
          ],
        },
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "patch-card") {
      if (!request.messageId) throw new Error("messageId is required for Feishu patch-card smoke.");
      transport = await patchFeishuCardMessage(transportConfig, {
        messageId: request.messageId,
        card: {
          config: { wide_screen_mode: true },
          header: {
            title: { tag: "plain_text", content: "Studio Feishu transport smoke" },
            template: "blue",
          },
          elements: [
            {
              tag: "markdown",
              content: request.content || "Studio Feishu transport smoke",
            },
          ],
        },
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "upload-and-send-media") {
      if (!request.channelId) throw new Error("channelId is required for Feishu upload-and-send-media smoke.");
      const content = request.content || "Studio Feishu upload and send smoke\n";
      transport = await uploadAndSendFeishuMedia(transportConfig, {
        chatId: request.channelId,
        data: Buffer.from(content, "utf8"),
        fileName: request.fileName || "studio-feishu-smoke.md",
        mimeType: request.mimeType || "text/markdown",
      }, resolvedPaths.feishuTokenCacheFile);
    } else {
      transport = await smokeFeishuTenantToken(transportConfig, resolvedPaths.feishuTokenCacheFile);
    }

    return {
      ok: true,
      checkedAt,
      adapter: "feishu",
      binding: resolved.binding,
      transport,
    };
  }

  async function dispatchOctoIncoming(payload?: ChannelConnectorOctoInboundRequest): Promise<ChannelConnectorOctoDispatchResponse> {
    const request = validateOctoInboundRequest(payload);
    const resolvedPaths = paths();
    const checkedAt = now().toISOString();
    const nativeConfig = readNativeConfig(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(nativeConfig, resolvedPaths);
    const resolved = resolveOctoBinding(request, nativeConfig.platformBindings, nativeConfig.agentProfiles);
    const skippedReason = shouldSkipOctoMessage(request, resolved);
    if (skippedReason) {
      return buildSkippedOctoResponse(checkedAt, request, skippedReason, resolvedPaths.octoEventLogFile, resolved);
    }
    if (!resolved) throw new Error("Octo binding resolution invariant failed.");

    let message = request.message;
    const binding = resolved.binding;
    const agentProfile = resolved.agentProfile;
    const aliasResolution = resolveChannelConnectorBindingCommandAlias(
      binding,
      extractOctoContent(message),
      commandSurfaceCommandAliasesPath(runtimeConfig),
    );
    if (aliasResolution.matchedAlias) {
      message = {
        ...message,
        payload: {
          ...message.payload,
          content: aliasResolution.content,
        },
      };
    }
    const sessionKey = buildOctoSessionKey(message);
    const content = extractOctoContent(message);
    const attachments = extractOctoAttachments(message);
    const directed = isOctoMessageDirectedAtBot(message, binding.botId);
    const governance = evaluateChannelConnectorGovernance({
      binding,
      platform: "octo",
      fromUid: message.fromUid,
      content,
      statePath: request.dryRun === true ? null : commandSurfaceGovernancePath(runtimeConfig),
      now: now(),
    });
    if (!governance.allowed) {
      return buildSkippedOctoResponse(checkedAt, request, governance.skippedReason || "channel_governance_blocked", resolvedPaths.octoEventLogFile, resolved);
    }
    const replyPlan = request.replyText ? renderOctoTextReply(message, request.replyText) : null;
    const dryRun = request.dryRun === true;
    let transport = emptyOctoTransportResult();
    let accepted = dryRun;
    let effectiveSkippedReason: string | null = dryRun ? null : "agent_dispatch_not_ready";
    let commandAction: ChannelConnectorCommandActionResponse | null = null;
    let effectiveReplyPlan = replyPlan;
    let dispatchStatus: ChannelConnectorOctoDispatchResponse["agentDispatch"]["status"] = dryRun ? "dry-run" : "not-ready";
    if (content.startsWith("/")) {
      commandAction = await handleCommandAction({
        bindingId: binding.id,
        sessionKey,
        fromUid: message.fromUid,
        channelId: message.channelId,
        messageId: message.messageId,
        eventKey: content,
        renderer: "text",
        dryRun,
      });
      accepted = commandAction.accepted;
      effectiveSkippedReason = commandAction.skippedReason;
      dispatchStatus = dryRun ? "dry-run" : "skipped";
      const commandReplyText = commandAction.commandResult?.replyText
        || commandAction.commandResult?.passthroughText
        || commandAction.skippedReason
        || "";
      effectiveReplyPlan = commandReplyText ? renderOctoTextReply(message, commandReplyText) : null;
    }
    if (!dryRun && request.sendReply === true) {
      if (!effectiveReplyPlan) {
        effectiveSkippedReason = "octo_reply_text_required";
      } else {
        const transportConfig = octoTransportFromBinding(binding);
        if (!transportConfig) {
          effectiveSkippedReason = "octo_transport_config_missing";
        } else {
          transport = await sendOctoTextReply(transportConfig, effectiveReplyPlan);
          accepted = transport.ok === true;
          effectiveSkippedReason = transport.ok === true ? null : "octo_transport_send_failed";
        }
      }
    }
    const response: ChannelConnectorOctoDispatchResponse = {
      ok: true,
      checkedAt,
      adapter: "octo",
      accepted,
      skippedReason: effectiveSkippedReason,
      dryRun,
      sessionKey,
      binding,
      agentProfile,
      incoming: {
        messageId: message.messageId,
        platform: "octo",
        channelId: message.channelId,
        channelType: message.channelType,
        fromUid: message.fromUid,
        content,
        messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
        attachments,
        directed,
      },
      agentDispatch: {
        status: dispatchStatus,
        agent: agentProfile.agent,
        model: agentProfile.model,
        workDir: agentProfile.workDir,
        gatewayEndpoint: agentProfile.gatewayEndpoint,
        gatewayKeyRef: agentProfile.gatewayKeyRef,
      },
      commandAction,
      transport,
      replyPlan: effectiveReplyPlan,
      eventStored: {
        path: resolvedPaths.octoEventLogFile,
        written: false,
      },
    };

    writeJsonLine(resolvedPaths.octoEventLogFile, {
      checkedAt,
      adapter: "octo",
      bindingId: binding.id,
      agentProfileId: agentProfile.id,
      sessionKey,
      messageId: message.messageId,
      channelId: message.channelId,
      channelType: message.channelType,
      fromUid: message.fromUid,
      content,
      messageType: typeof message.payload?.type === "number" ? message.payload.type : null,
      attachmentCount: attachments.length,
      attachmentKinds: attachments.map((attachment) => attachment.kind),
      command: commandAction?.command || null,
      commandAction: commandAction?.commandResult?.action || null,
      commandOk: commandAction?.commandResult?.ok ?? null,
      dryRun,
      dispatchStatus,
      replyChunks: effectiveReplyPlan?.chunks.length || 0,
      transportAction: transport.action,
      transportOk: transport.ok,
      transportRequests: transport.requestCount,
    });
    response.eventStored.written = true;
    return response;
  }

  async function runOctoTransportSmoke(payload?: ChannelConnectorOctoTransportSmokeRequest): Promise<ChannelConnectorOctoTransportSmokeResponse> {
    const request = normalizeOctoTransportSmokeRequest(payload);
    const nativeConfig = readNativeConfig(config, paths(), now());
    const resolved = resolveOctoBindingById(nativeConfig, request.bindingId);
    const checkedAt = now().toISOString();
    if (!resolved) {
      return {
        ok: true,
        checkedAt,
        adapter: "octo",
        binding: null,
        transport: {
          ...emptyOctoTransportResult(request.action || "register"),
          error: "octo_binding_not_found",
        },
      };
    }
    const transportConfig = octoTransportFromBinding(resolved.binding);
    if (!transportConfig) {
      return {
        ok: true,
        checkedAt,
        adapter: "octo",
        binding: resolved.binding,
        transport: {
          ...emptyOctoTransportResult(request.action || "register"),
          error: "octo_transport_config_missing",
        },
      };
    }
    let transport: ChannelConnectorOctoTransportResult;
    if (request.action === "typing") {
      if (!request.channelId) throw new Error("channelId is required for Octo typing smoke.");
      transport = await sendOctoTyping(transportConfig, request.channelId, request.channelType || 1);
    } else if (request.action === "send-message") {
      if (!request.channelId) throw new Error("channelId is required for Octo send-message smoke.");
      const replyPlan = {
        channelId: request.channelId,
        channelType: request.channelType || 1,
        chunks: [request.content || "Studio Octo transport smoke"],
        mentionUids: [],
        payloads: [
          {
            channel_id: request.channelId,
            channel_type: request.channelType || 1,
            payload: {
              type: 1 as const,
              content: request.content || "Studio Octo transport smoke",
            },
          },
        ],
      };
      transport = await sendOctoTextReply(transportConfig, replyPlan);
    } else if (request.action === "upload-file") {
      const content = request.content || "Studio Octo upload smoke\n";
      transport = await uploadOctoFile(transportConfig, {
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "studio-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "direct-upload-file") {
      const content = request.content || "Studio Octo direct upload smoke\n";
      transport = await directUploadOctoFile(transportConfig, {
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "studio-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "upload-credentials") {
      transport = await getOctoUploadCredentials(transportConfig, {
        fileName: request.fileName || "studio-octo-smoke.txt",
      });
    } else if (request.action === "direct-upload-and-send-media") {
      if (!request.channelId) throw new Error("channelId is required for Octo direct-upload-and-send-media smoke.");
      const content = request.content || "Studio Octo direct upload and send smoke\n";
      transport = await directUploadAndSendOctoMedia(transportConfig, {
        channelId: request.channelId,
        channelType: request.channelType || 1,
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "studio-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "upload-and-send-media") {
      if (!request.channelId) throw new Error("channelId is required for Octo upload-and-send-media smoke.");
      const content = request.content || "Studio Octo upload and send smoke\n";
      transport = await uploadAndSendOctoMedia(transportConfig, {
        channelId: request.channelId,
        channelType: request.channelType || 1,
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "studio-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else {
      transport = await registerOctoBot(transportConfig, false);
    }
    return {
      ok: true,
      checkedAt,
      adapter: "octo",
      binding: resolved.binding,
      transport,
    };
  }

  async function response(
    input: {
      action: ChannelConnectorsDaemonAction;
      applied?: boolean;
      templateWritten?: boolean;
      configWritten?: boolean;
      commandsRun?: ChannelConnectorsDaemonCommandResult[];
      skippedReason?: string | null;
      diagnostics?: string[];
    },
  ): Promise<ChannelConnectorsDaemonResponse> {
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const configPreview = currentConfigFull();
    const commandsRun = input.commandsRun || [];
    const installed = fs.existsSync(plan.selectedTemplate.servicePath);
    const serviceManager = summarizeManager(plan, commandsRun);
    return {
      ok: input.skippedReason ? false : commandsRun.every((result) => result.ok),
      checkedAt: now().toISOString(),
      action: input.action,
      applied: input.applied === true,
      templateWritten: input.templateWritten === true,
      configWritten: input.configWritten === true,
      templateCurrent: isTemplateCurrent(plan),
      configCurrent: isConfigCurrent(configPreview),
      installed,
      skippedReason: input.skippedReason || null,
      plan,
      config: redactConfigResponse(configPreview),
      commandsRun,
      serviceManager,
      diagnostics: input.diagnostics || [],
    };
  }

  async function runStatusCommands(plan: ChannelConnectorsDaemonPlan): Promise<ChannelConnectorsDaemonCommandResult[]> {
    const commands = plan.selectedTemplate.commands.status || [];
    const results: ChannelConnectorsDaemonCommandResult[] = [];
    for (const command of commands) results.push(await runCommand(command));
    return results;
  }

  async function getDaemonService(): Promise<ChannelConnectorsDaemonResponse> {
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const commandsRun = plan.supported ? await runStatusCommands(plan) : [];
    return response({
      action: "status",
      commandsRun,
    });
  }

  async function manageDaemonService(payload: ChannelConnectorsDaemonRequest = {}): Promise<ChannelConnectorsDaemonResponse> {
    const action = normalizeAction(payload.action);
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const guard = blockingReason(plan, action);
    const diagnostics: string[] = [];
    if (guard === "native_daemon_entry_missing") {
      diagnostics.push("Run npm run build:api before installing or starting the native Channel Connectors daemon.");
    }
    if (guard === "unsupported_supervisor") {
      diagnostics.push("The current OS supervisor is not supported by Studio native Channel Connectors F1.");
    }
    if (guard) {
      return response({
        action,
        skippedReason: guard,
        diagnostics,
      });
    }

    const apply = payload.apply === true;
    const configPreview = currentConfigFull();
    let templateWritten = false;
    let configWritten = false;
    if (apply && actionWritesFiles(action)) {
      fs.mkdirSync(plan.rootDir, { recursive: true });
      fs.mkdirSync(plan.stateDir, { recursive: true });
      fs.mkdirSync(path.dirname(plan.logFile), { recursive: true });
      if (!isConfigCurrent(configPreview)) {
        writeTextAtomic(configPreview.configPath, configPreview.preview);
        configWritten = true;
      }
      if (!isTemplateCurrent(plan)) {
        writeTextAtomic(plan.selectedTemplate.servicePath, plan.selectedTemplate.template);
        templateWritten = true;
      }
    }

    const commandsRun: ChannelConnectorsDaemonCommandResult[] = [];
    const shouldRunCommands = payload.runCommands === true
      || (payload.runCommands !== false && apply && action !== "preview" && action !== "status");
    if (action === "status") {
      commandsRun.push(...await runStatusCommands(plan));
    } else if (shouldRunCommands) {
      const commands = plan.selectedTemplate.commands[action] || [];
      for (const command of commands) commandsRun.push(await runCommand(command));
      if (action !== "stop") commandsRun.push(...await runStatusCommands(plan));
    }

    return response({
      action,
      applied: templateWritten || configWritten || commandsRun.length > 0,
      templateWritten,
      configWritten,
      commandsRun,
      diagnostics,
    });
  }

  async function getAgentSessions(): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
    return requestDaemonAgentSessions(null);
  }

  async function manageAgentSessions(
    payload: ChannelConnectorAgentSessionActionRequest = {},
  ): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
    return requestDaemonAgentSessions(payload);
  }

  async function getStatus(): Promise<ChannelConnectorsStatusResponse> {
    const service = await getDaemonService();
    const checkedAt = now().toISOString();
    const runtime = await requestDaemonRuntimeStatus(checkedAt);
    return {
      ok: true,
      checkedAt,
      phase: "native-config-f2",
      implementation: "studio-native",
      referenceSources: [
        "CC archived reference implementation",
        "OpenClaw channel/runtime behavior",
        "Studio Gateway daemon contract",
      ],
      runtimeChain: [
        "IM channel",
        "Studio native Channel daemon",
        "local CLI Agent bot",
        "Studio Gateway daemon",
        "upstream provider",
      ],
      bindingPolicy: bindingPolicy(),
      paths: {
        root: service.plan.rootDir,
        nativeConfig: paths().nativeConfigPath,
        config: service.plan.configPath,
        state: service.plan.stateDir,
        log: service.plan.logFile,
        runtime: service.plan.runtimeFile,
      },
      lifecycle: {
        studioRuntimeDependency: false,
        openclawRuntimeDependency: false,
        modelRelayOwner: "studio-gateway-daemon",
        channelDaemonOwner: "studio-native-channel-daemon",
      },
      service,
      runtime,
    };
  }

  function getDaemonLogs(limit = 120): ChannelConnectorsLogsResponse {
    const resolvedPaths = paths();
    const log = tailLines(resolvedPaths.logFile, limit);
    return {
      ok: true,
      checkedAt: now().toISOString(),
      logFile: resolvedPaths.logFile,
      exists: log.exists,
      lines: log.lines,
    };
  }

  return {
    getStatus,
    getNativeConfig: currentNativeConfig,
    saveNativeConfig,
    getCommandSurface,
    handleCommandAction,
    dispatchFeishuWebhook,
    runFeishuTransportSmoke,
    dispatchOctoIncoming,
    runOctoTransportSmoke,
    getDaemonConfig: currentConfig,
    getDaemonService,
    manageDaemonService,
    getAgentSessions,
    manageAgentSessions,
    getDaemonLogs,
  };
}
