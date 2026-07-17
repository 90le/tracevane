import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { registerApp } from "@larksuiteoapi/node-sdk";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  TracevaneServiceAction,
  TracevaneServiceManagerStatus,
  TracevaneServiceMode,
} from "../../../../types/supervisor.js";
import { isTracevaneTrustedManagementRequest } from "../../gateway-http-auth.js";
import {
  CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME,
  CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL,
  CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS,
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
  type ChannelConnectorsDaemonReloadMode,
  type ChannelConnectorsDaemonReloadResponse,
  type ChannelConnectorsDaemonReloadState,
  type ChannelConnectorsDaemonRuntimeConfig,
  type ChannelConnectorsDaemonRuntimeAutoCompactRecord,
  type ChannelConnectorsDaemonRuntimePendingAgentRunEvent,
  type ChannelConnectorsDaemonRuntimePendingAgentRunRecord,
  type ChannelConnectorsDaemonRuntimeStatus,
  type ChannelConnectorsDaemonTemplate,
  type ChannelConnectorsLogsResponse,
  type ChannelConnectorsV3Config,
  type ChannelConnectorsV3ConfigApplyRequest,
  type ChannelConnectorsV3ConfigApplyResponse,
  type ChannelConnectorsV3ConfigPlanRequest,
  type ChannelConnectorsV3ConfigPlanResponse,
  type ChannelConnectorsV3ConfigResponse,
  type ChannelConnectorsV3SemanticDiff,
  type ChannelConnectorAccount,
  type ChannelConnectorAccountSecretsResponse,
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
  type ChannelConnectorFeishuAppRegistrationSessionResponse,
  type ChannelConnectorFeishuAppRegistrationStartRequest,
  type ChannelConnectorFeishuAppRegistrationStatus,
  type ChannelConnectorFeishuAppRegistrationTenant,
  type ChannelConnectorInboundAttachment,
  type ChannelConnectorsStatusResponse,
  type ChannelConnectorOctoDispatchResponse,
  type ChannelConnectorOctoInboundRequest,
  type ChannelConnectorOctoTransportResult,
  type ChannelConnectorOctoTransportSmokeRequest,
  type ChannelConnectorOctoTransportSmokeResponse,
  type ChannelConnectorAgentId,
  type ChannelConnectorAgentSessionActionRequest,
  type ChannelConnectorAgentSessionDriverStatusResponse,
  type ChannelConnectorAgentProfile,
  type ChannelConnectorAgentSessionPolicyConfig,
  type ChannelConnectorPermissionMode,
  type ChannelConnectorPlatformBinding,
  type ChannelConnectorPlatformId,
  type ChannelConnectorDeliveryPolicy,
  type ChannelConnectorDeliveryTarget,
  type ChannelConnectorV3RoutingPreviewRequest,
  type ChannelConnectorV3RoutingPreviewResponse,
} from "../../../../types/channel-connectors.js";
import {
  applyOctoPersonaRouting,
  buildOctoSessionKey,
  buildSkippedOctoResponse,
  extractOctoAttachments,
  extractOctoContent,
  isOctoMessageDirectedAtBot,
  octoOnBehalfOfFromBinding,
  renderOctoTextReply,
  resolveOctoPersonaRouting,
  resolveOctoBinding,
  shouldSkipOctoMessage,
} from "./octo-adapter.js";
import {
  ackOctoEvent,
  addOctoGroupMembers,
  createOctoGroup,
  createOctoThread,
  deleteOctoThread,
  deleteOctoVoiceContext,
  directUploadAndSendOctoMedia,
  directUploadOctoFile,
  editOctoMessage,
  emptyOctoTransportResult,
  getOctoFileDownloadUrl,
  getOctoGroupInfo,
  getOctoThreadInfo,
  getOctoUploadCredentials,
  joinOctoThread,
  leaveOctoThread,
  listOctoGroupMembers,
  listOctoGroups,
  listOctoThreadMembers,
  listOctoThreads,
  octoTransportFromBinding,
  readOctoGroupMd,
  readOctoThreadMd,
  readOctoVoiceContext,
  registerOctoBot,
  removeOctoGroupMembers,
  searchOctoSpaceMembers,
  sendOctoTextReply,
  sendOctoReadReceipt,
  sendOctoTyping,
  syncOctoMessages,
  updateOctoGroupMd,
  updateOctoGroupInfo,
  updateOctoThreadMd,
  updateOctoVoiceContext,
  uploadAndSendOctoMedia,
  uploadOctoFile,
} from "./octo-transport.js";
import {
  buildChannelConnectorCommandSurface,
  channelConnectorCommandSurfaceSectionFromCommand,
  channelConnectorCommandSurfaceViewFromCommand,
  channelConnectorWorkdirSurfaceStateFromCommand,
  extractChannelConnectorSurfaceActionPayload,
  normalizeChannelConnectorCommandSurfaceSection,
  normalizeChannelConnectorCommandSurfaceView,
  renderChannelConnectorCommandSurfaceFeishu,
  type ChannelConnectorCommandSurfaceInput,
} from "./command-surface.js";
import {
  buildFeishuSessionKey,
  channelConnectorFeishuBotMentionCandidates,
  isChannelConnectorFeishuMessageDirected,
  normalizeFeishuMessageTextForBot,
  parseChannelConnectorFeishuWebhook,
  safeEqualFeishuWebhookToken,
  type ChannelConnectorFeishuGroupSessionScope,
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
  formatChannelConnectorOctoManagementReply,
  handleChannelConnectorCommand,
  listChannelConnectorCommandSummaries,
  listChannelConnectorGatewayModelCatalog,
  listChannelConnectorGatewayModels,
  listChannelConnectorSkillSummaries,
  resolveChannelConnectorBindingCommandAlias,
  resolveChannelConnectorEffectiveProject,
  type ChannelConnectorOctoManagementRequest,
  type ChannelConnectorOctoManagementResult,
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
  readChannelConnectorAgentSessions,
  type ChannelConnectorAgentSessionRecord,
} from "./agent-session-store.js";
import { getChannelConnectorConversationHistory } from "./conversation-history-store.js";
import {
  compactChannelConnectorConversation,
} from "./conversation-compact.js";
import {
  assertChannelConnectorsV3Config,
  validateChannelConnectorsV3Config,
} from "./config-v3.js";
import { resolveChannelConnectorDelivery } from "./delivery-resolver.js";
import { channelConnectorRuntimeRouteRefs } from "./runtime-account-routing.js";
import {
  createServiceManager,
  createSupervisorPlan,
  type ManageServiceResponse,
  type ServiceDefinition,
  type ServiceManager,
  type SupervisorPlan,
} from "../supervisor/index.js";
import type { SupervisorCommandResult } from "../supervisor/command-runner.js";

const DEFAULT_FEISHU_STALE_EVENT_MAX_AGE_MS = 2 * 60_000;
const MIN_FEISHU_STALE_EVENT_MAX_AGE_MS = 10_000;
const MAX_FEISHU_STALE_EVENT_MAX_AGE_MS = 24 * 60 * 60_000;

const DAEMON_ACTIONS: readonly ChannelConnectorsDaemonAction[] = [
  "preview",
  "install",
  "ensure-running",
  "start",
  "stop",
  "restart",
  "repair",
  "uninstall",
  "reload",
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
const DEFAULT_AGENT_SESSION_POLICY = {
  maxSessions: 8,
  maxConcurrentTurns: 4,
  idleTimeoutMs: 10 * 60_000,
  busyStrategy: "reject" as const,
  queueMaxRecords: 200,
  queueMaxAgeMs: 24 * 60 * 60_000,
};

export type ChannelConnectorsDaemonCommandRunner = (
  command: ChannelConnectorsDaemonCommand,
) => Promise<ChannelConnectorsDaemonCommandResult>;
export type ChannelConnectorFeishuRegisterAppRunner = typeof registerApp;

export class ChannelConnectorsServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ChannelConnectorsServiceError";
  }
}

export interface ChannelConnectorsServiceOptions {
  homeDir?: string;
  platform?: NodeJS.Platform;
  windowsUserId?: string;
  manager?: ServiceManager;
  managementEndpoint?: string;
  managementToken?: string;
  commandRunner?: ChannelConnectorsDaemonCommandRunner;
  feishuRegisterApp?: ChannelConnectorFeishuRegisterAppRunner;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

export interface ChannelConnectorsService {
  getStatus(): Promise<ChannelConnectorsStatusResponse>;
  getV3Config(): ChannelConnectorsV3ConfigResponse;
  planV3Config(payload?: ChannelConnectorsV3ConfigPlanRequest): ChannelConnectorsV3ConfigPlanResponse;
  saveV3Config(config: ChannelConnectorsV3Config): ChannelConnectorsV3ConfigResponse;
  applyV3Config(payload?: ChannelConnectorsV3ConfigApplyRequest, req?: http.IncomingMessage): Promise<ChannelConnectorsV3ConfigApplyResponse>;
  upsertV3Account(account: ChannelConnectorAccount): ChannelConnectorsV3ConfigResponse;
  deleteV3Account(accountId: string): ChannelConnectorsV3ConfigResponse;
  upsertV3Target(target: ChannelConnectorDeliveryTarget): ChannelConnectorsV3ConfigResponse;
  deleteV3Target(targetId: string): ChannelConnectorsV3ConfigResponse;
  upsertV3Policy(policy: ChannelConnectorDeliveryPolicy): ChannelConnectorsV3ConfigResponse;
  deleteV3Policy(policyId: string): ChannelConnectorsV3ConfigResponse;
  previewV3Routing(payload?: ChannelConnectorV3RoutingPreviewRequest): ChannelConnectorV3RoutingPreviewResponse;
  getAccountSecrets(accountId: string): ChannelConnectorAccountSecretsResponse;
  startFeishuAppRegistration(payload?: ChannelConnectorFeishuAppRegistrationStartRequest): Promise<ChannelConnectorFeishuAppRegistrationSessionResponse>;
  getFeishuAppRegistration(sessionId: string): ChannelConnectorFeishuAppRegistrationSessionResponse;
  cancelFeishuAppRegistration(sessionId: string): ChannelConnectorFeishuAppRegistrationSessionResponse;
  getCommandSurface(payload?: ChannelConnectorCommandSurfaceRequest): Promise<ChannelConnectorCommandSurfaceResponse>;
  handleCommandAction(payload?: ChannelConnectorCommandActionRequest): Promise<ChannelConnectorCommandActionResponse>;
  dispatchFeishuWebhook(payload?: ChannelConnectorFeishuWebhookRequest): Promise<ChannelConnectorFeishuWebhookResponse>;
  runFeishuTransportSmoke(payload?: ChannelConnectorFeishuTransportSmokeRequest): Promise<ChannelConnectorFeishuTransportSmokeResponse>;
  dispatchOctoIncoming(payload?: ChannelConnectorOctoInboundRequest): Promise<ChannelConnectorOctoDispatchResponse>;
  runOctoTransportSmoke(payload?: ChannelConnectorOctoTransportSmokeRequest): Promise<ChannelConnectorOctoTransportSmokeResponse>;
  getDaemonConfig(): ChannelConnectorsDaemonConfigResponse;
  getDaemonService(): Promise<ChannelConnectorsDaemonResponse>;
  manageDaemonService(payload?: ChannelConnectorsDaemonRequest, req?: http.IncomingMessage): Promise<ChannelConnectorsDaemonResponse>;
  getAgentSessions(): Promise<ChannelConnectorAgentSessionDriverStatusResponse>;
  manageAgentSessions(payload?: ChannelConnectorAgentSessionActionRequest, req?: http.IncomingMessage): Promise<ChannelConnectorAgentSessionDriverStatusResponse>;
  getDaemonLogs(limit?: number): ChannelConnectorsLogsResponse;
}

interface FeishuAppRegistrationSession {
  sessionId: string;
  tenant: ChannelConnectorFeishuAppRegistrationTenant;
  status: ChannelConnectorFeishuAppRegistrationStatus;
  qrUrl: string | null;
  expiresAtMs: number | null;
  intervalSeconds: number | null;
  result: ChannelConnectorFeishuAppRegistrationSessionResponse["result"];
  error: string | null;
  abortController: AbortController;
  createdAtMs: number;
  updatedAtMs: number;
}

interface ChannelConnectorsV3PlanEntry {
  currentRevision: string;
  candidateHash: string;
  expiresAtMs: number;
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

function normalizePathLike(value: string): string {
  return path.resolve(value.trim().replace(/^~(?=$|\/|\\)/, os.homedir()));
}

function normalizeEnvDir(value: string | undefined): string | null {
  const trimmed = String(value || "").trim();
  return trimmed ? normalizePathLike(trimmed) : null;
}

function defaultTracevaneHomeDir(config: TracevaneServerConfig, homeDir?: string): string {
  const explicit = String(homeDir || "").trim();
  if (explicit) return normalizePathLike(explicit);
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw" ? path.dirname(openclawRoot) : os.homedir();
}

function resolveChannelConnectorsWorkspaceDir(
  config: TracevaneServerConfig,
  homeDir?: string,
): string {
  if (String(homeDir || "").trim()) {
    return path.join(defaultTracevaneHomeDir(config, homeDir), ".config", "tracevane", "channel-connectors");
  }
  const explicitWorkspace = normalizeEnvDir(process.env.TRACEVANE_CHANNEL_CONNECTORS_DIR);
  if (explicitWorkspace) return explicitWorkspace;
  const explicitDataRoot = normalizeEnvDir(process.env.TRACEVANE_DATA_DIR);
  if (explicitDataRoot) return path.join(explicitDataRoot, "channel-connectors");
  return path.join(defaultTracevaneHomeDir(config, homeDir), ".config", "tracevane", "channel-connectors");
}

export function resolveChannelConnectorsPaths(
  config: TracevaneServerConfig,
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

function writeSecretTextAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function normalizeAction(value: unknown): ChannelConnectorsDaemonAction {
  return DAEMON_ACTIONS.includes(value as ChannelConnectorsDaemonAction)
    ? value as ChannelConnectorsDaemonAction
    : "preview";
}

function gatewayEndpoint(): string {
  return "http://127.0.0.1:18796/v1";
}

function normalizeString(value: unknown, fallback = ""): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function normalizeFeishuRegistrationTenant(
  value: unknown,
): ChannelConnectorFeishuAppRegistrationTenant {
  return normalizeString(value).toLowerCase() === "lark" ? "lark" : "feishu";
}

function feishuRegistrationApiUrl(
  tenant: ChannelConnectorFeishuAppRegistrationTenant,
): string {
  return tenant === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
}

function feishuRegistrationDomain(
  tenant: ChannelConnectorFeishuAppRegistrationTenant,
): string {
  return tenant === "lark" ? "accounts.larksuite.com" : "accounts.feishu.cn";
}

function feishuRegistrationErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return normalizeString(error, "Feishu app registration failed.");
  }
  const record = error as { code?: unknown; description?: unknown; message?: unknown };
  const code = normalizeString(record.code);
  const description = normalizeString(record.description);
  const message = normalizeString(record.message);
  return [code, description || message].filter(Boolean).join(": ") || "Feishu app registration failed.";
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

function isRuntimeAgentId(value: unknown): value is ChannelConnectorAgentId {
  return (CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS as readonly string[]).includes(String(value));
}

function isPlatformId(value: unknown): value is ChannelConnectorPlatformId {
  return (CHANNEL_CONNECTOR_PLATFORM_IDS as readonly string[]).includes(String(value));
}

function isPermissionMode(value: unknown): value is ChannelConnectorPermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(String(value));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeAgentSessionPolicy(value: unknown): ChannelConnectorAgentSessionPolicyConfig {
  const input = isRecord(value) ? value : {};
  const busyStrategy = normalizeString(input.busyStrategy) === "queue" ? "queue" : "reject";
  return {
    maxSessions: boundedInteger(input.maxSessions, DEFAULT_AGENT_SESSION_POLICY.maxSessions, 1, 128),
    maxConcurrentTurns: boundedInteger(input.maxConcurrentTurns, DEFAULT_AGENT_SESSION_POLICY.maxConcurrentTurns, 1, 128),
    idleTimeoutMs: boundedInteger(input.idleTimeoutMs, DEFAULT_AGENT_SESSION_POLICY.idleTimeoutMs, 30_000, 24 * 60 * 60_000),
    busyStrategy,
    queueMaxRecords: boundedInteger(input.queueMaxRecords, DEFAULT_AGENT_SESSION_POLICY.queueMaxRecords, 0, 5000),
    queueMaxAgeMs: boundedInteger(input.queueMaxAgeMs, DEFAULT_AGENT_SESSION_POLICY.queueMaxAgeMs, 60_000, 7 * 24 * 60 * 60_000),
  };
}

function parsedStoredConfig(paths: ChannelConnectorsPaths): unknown | null {
  const raw = readTextIfExists(paths.nativeConfigPath);
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function normalizeV3Config(
  input: unknown,
  now: Date,
): ChannelConnectorsV3Config {
  if (!isRecord(input) || input.version !== 3) {
    throw new Error("Channel Connectors v3 config must be a version 3 object.");
  }
  if (!Array.isArray(input.accounts) || !input.accounts.every(isRecord)) {
    throw new Error("Channel Connectors v3 accounts must be an array of objects.");
  }
  if (!Array.isArray(input.targets) || !input.targets.every(isRecord)) {
    throw new Error("Channel Connectors v3 targets must be an array of objects.");
  }
  if (!Array.isArray(input.deliveryPolicies) || !input.deliveryPolicies.every(isRecord)) {
    throw new Error("Channel Connectors v3 deliveryPolicies must be an array of objects.");
  }
  const candidate = structuredClone(input) as unknown as ChannelConnectorsV3Config;
  candidate.version = 3;
  candidate.updatedAt = normalizeString(candidate.updatedAt, now.toISOString());
  candidate.agentSessionPolicy = normalizeAgentSessionPolicy(candidate.agentSessionPolicy);
  assertChannelConnectorsV3Config(candidate);
  return candidate;
}

function runtimeAdapterCatalog(
  source: ChannelConnectorsV3Config,
  config: TracevaneServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorRuntimeAdapterCatalog {
  const runtime = buildRuntimeConfig(source, paths);
  const profiles = runtime.projects.map((project) => ({
    id: project.id,
    name: project.name,
    agent: project.agent,
    model: project.model,
    reasoningEffort: project.reasoningEffort ?? null,
    workDir: project.workDir,
    permissionMode: project.permissionMode,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayKeyRef: project.gatewayKeyRef,
    appProfileRef: project.appProfileRef,
  }));
  const fallback: ChannelConnectorAgentProfile = {
    id: "default-codex",
    name: "Default Codex",
    agent: "codex",
    model: null,
    reasoningEffort: null,
    workDir: config.projectRoot || process.cwd(),
    permissionMode: "suggest",
    gatewayEndpoint: gatewayEndpoint(),
    gatewayKeyRef: "tracevane-gateway-client-key",
    appProfileRef: "default",
  };
  const agentProfiles = profiles.length ? profiles : [fallback];
  const platformBindings = runtime.projects.flatMap((project) => project.platformBindings.map((binding) => ({
    id: binding.id,
    platform: binding.platform,
    accountId: binding.accountId,
    botId: binding.botId,
    displayName: binding.displayName,
    agentProfileId: project.id,
    enabled: binding.enabled,
    allowlist: [...binding.allowlist],
    adminUsers: [...binding.adminUsers],
    disabledCommands: [...binding.disabledCommands],
    metadata: binding.metadata,
  })));
  return {
    updatedAt: source.updatedAt,
    defaultAgentProfileId: agentProfiles[0].id,
    agentSessionPolicy: source.agentSessionPolicy,
    agentProfiles,
    platformBindings,
  };
}

function normalizePlatformBindingMetadata(
  platform: ChannelConnectorPlatformId,
  value: unknown,
): Record<string, unknown> | undefined {
  const metadata = isRecord(value) ? { ...value } : {};
  if (platform === "feishu") {
    const configured = normalizeString(
      metadata.apiUrl || metadata.api_url || metadata.domain || metadata.baseUrl || metadata.base_url,
    );
    if (!configured) metadata.apiUrl = CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL;
  }
  if (platform === "octo") {
    const configured = normalizeString(metadata.apiUrl || metadata.api_url);
    if (!configured) metadata.apiUrl = CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function isSensitiveMetadataKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[-_\s]/g, "");
  return normalized === "apikey"
    || normalized === "aeskey"
    || normalized === "appsecret"
    || normalized === "botsecret"
    || normalized === "bottoken"
    || normalized === "clientsecret"
    || normalized === "encodingaeskey"
    || normalized === "encryptkey"
    || normalized === "imtoken"
    || normalized === "password"
    || normalized === "privatekey"
    || normalized === "secret"
    || normalized === "tenantaccesstoken"
    || normalized === "token"
    || normalized === "verificationtoken"
    || normalized.endsWith("secret")
    || normalized.endsWith("token");
}

function readRuntimeAdapterCatalog(
  config: TracevaneServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorRuntimeAdapterCatalog {
  const raw = readTextIfExists(paths.nativeConfigPath);
  if (!raw) return runtimeAdapterCatalog(defaultV3Config(config, now), config, paths, now);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Channel Connectors configuration must be valid version 3 JSON.");
  }
  if (isRecord(parsed) && parsed.version === 3) {
    return runtimeAdapterCatalog(normalizeV3Config(parsed, now), config, paths, now);
  }
  throw new Error("Channel Connectors only supports version 3 configuration.");
}

interface ChannelConnectorsV3Snapshot {
  config: ChannelConnectorsV3Config;
  revision: string;
}

/**
 * Ephemeral execution view generated from the persisted v3 config for adapter
 * and command-surface code. This shape is never written to disk or exposed as
 * a configuration API.
 */
interface ChannelConnectorRuntimeAdapterCatalog {
  updatedAt: string;
  defaultAgentProfileId: string;
  agentSessionPolicy: ChannelConnectorAgentSessionPolicyConfig;
  agentProfiles: ChannelConnectorAgentProfile[];
  platformBindings: ChannelConnectorPlatformBinding[];
}

function defaultV3Config(config: TracevaneServerConfig, now: Date): ChannelConnectorsV3Config {
  return {
    version: 3,
    updatedAt: now.toISOString(),
    agentSessionPolicy: { ...DEFAULT_AGENT_SESSION_POLICY },
    accounts: [],
    targets: [{
      id: "default-codex",
      name: "Default Codex",
      enabled: true,
      runtime: {
        agent: "codex",
        appProfileRef: "default",
        gatewayEndpoint: gatewayEndpoint(),
        gatewayKeyRef: "tracevane-gateway-client-key",
      },
      workspace: { workDir: config.projectRoot || process.cwd() },
      execution: {
        model: null,
        reasoningEffort: null,
        permissionMode: "suggest",
        workspaceConcurrency: 1,
        queueLimit: 20,
      },
      governance: { disabledCommands: [] },
    }],
    deliveryPolicies: [],
  };
}

function readV3Snapshot(
  config: TracevaneServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsV3Snapshot {
  const parsed = parsedStoredConfig(paths);
  if (parsed === null) {
    const defaultConfig = defaultV3Config(config, now);
    return {
      config: defaultConfig,
      revision: unpersistedV3ConfigRevision(defaultConfig),
    };
  }
  if (!isRecord(parsed) || parsed.version !== 3) {
    throw new Error("Channel Connectors only supports version 3 configuration.");
  }
  const normalized = normalizeV3Config(parsed, now);
  return {
    config: normalized,
    revision: v3ConfigRevision(normalized),
  };
}

function writeV3Config(
  config: TracevaneServerConfig,
  paths: ChannelConnectorsPaths,
  value: ChannelConnectorsV3Config,
  now: Date,
): ChannelConnectorsV3Config {
  const normalized = normalizeV3Config({
    ...value,
    updatedAt: now.toISOString(),
  }, now);
  const previousRaw = readTextIfExists(paths.nativeConfigPath);
  if (previousRaw) {
    writeSecretTextAtomic(`${paths.nativeConfigPath}.last-known-good`, previousRaw);
  }
  writeSecretTextAtomic(paths.nativeConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function applyChannelConnectorBindingMetadataPatch(
  config: TracevaneServerConfig,
  paths: ChannelConnectorsPaths,
  adapterCatalog: ChannelConnectorRuntimeAdapterCatalog,
  bindingId: string,
  patch: Record<string, unknown> | null | undefined,
  now: Date,
): ChannelConnectorRuntimeAdapterCatalog {
  if (!patch || !Object.keys(patch).length) return adapterCatalog;
  const binding = adapterCatalog.platformBindings.find((candidate) => candidate.id === bindingId);
  const metadata = isRecord(binding?.metadata) ? binding.metadata : {};
  const accountId = normalizeString(metadata.channelAccountId);
  if (!accountId) return adapterCatalog;
  const snapshot = readV3Snapshot(config, paths, now).config;
  const account = snapshot.accounts.find((candidate) => candidate.id === accountId);
  if (!account) return adapterCatalog;
  account.advanced = { ...account.advanced, ...patch };
  const saved = writeV3Config(config, paths, snapshot, now);
  return runtimeAdapterCatalog(saved, config, paths, now);
}

function daemonEntryPath(config: TracevaneServerConfig): string {
  return path.join(config.projectRoot, "dist", "apps", "api", "modules", "channel-connectors", "daemon.js");
}

function managementEndpoint(override?: string): string {
  const configured = normalizeString(
    override || process.env.TRACEVANE_CHANNEL_CONNECTORS_MANAGEMENT_ENDPOINT,
  ).replace(/\/+$/, "");
  return configured || `http://127.0.0.1:${MANAGEMENT_PORT}`;
}

function managementBinding(override?: string): { host: string; port: number } {
  try {
    const parsed = new URL(managementEndpoint(override));
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80;
    if (Number.isInteger(port) && port >= 0 && port <= 65535) {
      return { host: parsed.hostname, port };
    }
  } catch {
    // Fall through to the trusted default binding.
  }
  return { host: "127.0.0.1", port: MANAGEMENT_PORT };
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
    octoConnectionDetails: [],
    feishuConnections: null,
    feishuConnectionDetails: [],
    activeRuns: null,
    agentRuns: null,
    autoCompacts: [],
    pendingAgentRuns: {
      count: 0,
      oldestQueuedAt: null,
      records: [],
      recentEvents: [],
    },
    replyOutbox: {
      pending: 0,
      delivered: 0,
      deadLetter: 0,
      oldestPendingAt: null,
      recentDeadLetters: [],
    },
    ingressQueue: null,
    reload: null,
    error: error instanceof Error ? error.message : normalizeString(error, "Channel daemon runtime status unavailable"),
  };
}

function normalizeDaemonOctoConnection(
  value: unknown,
): ChannelConnectorsDaemonRuntimeStatus["octoConnectionDetails"][number] | null {
  if (!isRecord(value)) return null;
  const credentialSource = value.credentialSource === "register"
    || value.credentialSource === "cache"
    ? value.credentialSource
    : null;
  return {
    bindingId: normalizeString(value.bindingId),
    bindingIds: stringList(value.bindingIds).length
      ? stringList(value.bindingIds)
      : [normalizeString(value.bindingId)].filter(Boolean),
    accountId: normalizeString(value.accountId),
    externalAccountId: normalizeString(value.externalAccountId || value.accountId),
    botId: nullableString(value.botId),
    robotId: nullableString(value.robotId),
    connected: value.connected === true,
    state: normalizeString(value.state, "unknown"),
    lastError: nullableString(value.lastError),
    lastConnectedAt: nullableString(value.lastConnectedAt),
    lastDisconnectedAt: nullableString(value.lastDisconnectedAt),
    reconnects: nullableNumber(value.reconnects) ?? 0,
    receivedMessages: nullableNumber(value.receivedMessages) ?? 0,
    credentialSource,
    restHeartbeatIntervalMs: nullableNumber(value.restHeartbeatIntervalMs) ?? 0,
    restHeartbeatSuccesses: nullableNumber(value.restHeartbeatSuccesses) ?? 0,
    restHeartbeatFailures: nullableNumber(value.restHeartbeatFailures) ?? 0,
    restHeartbeatLastOkAt: nullableString(value.restHeartbeatLastOkAt),
    restHeartbeatLastErrorAt: nullableString(value.restHeartbeatLastErrorAt),
    restHeartbeatLastError: nullableString(value.restHeartbeatLastError),
  };
}

function normalizeDaemonFeishuConnection(value: unknown): ChannelConnectorsDaemonRuntimeStatus["feishuConnectionDetails"][number] | null {
  if (!isRecord(value)) return null;
  return {
    key: normalizeString(value.key),
    accountId: normalizeString(value.accountId),
    externalAccountId: normalizeString(value.externalAccountId || value.appId),
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
    botOpenId: nullableString(value.botOpenId),
    botName: nullableString(value.botName),
    botIdentityResolvedAt: nullableString(value.botIdentityResolvedAt),
    botIdentityLastError: nullableString(value.botIdentityLastError),
    botIdentityRequestCount: nullableNumber(value.botIdentityRequestCount) ?? 0,
    botIdentityStatusCode: nullableNumber(value.botIdentityStatusCode),
    botIdentityTokenCache: value.botIdentityTokenCache === "disabled"
      || value.botIdentityTokenCache === "hit"
      || value.botIdentityTokenCache === "miss"
      || value.botIdentityTokenCache === "refresh"
      ? value.botIdentityTokenCache
      : null,
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

function normalizePendingAgentRunAdapter(value: unknown): "octo" | "feishu" | null {
  if (value === "octo" || value === "feishu") return value;
  return null;
}

function normalizePendingAgentRunEventKind(
  value: unknown,
): ChannelConnectorsDaemonRuntimePendingAgentRunEvent["eventKind"] | null {
  if (
    value === "channel.agent.pending_replay"
    || value === "channel.agent.pending_replay_failed"
    || value === "channel.agent.pending_dropped"
  ) {
    return value;
  }
  return null;
}

function normalizeDaemonPendingAgentRunRecord(
  value: unknown,
): ChannelConnectorsDaemonRuntimePendingAgentRunRecord | null {
  if (!isRecord(value)) return null;
  const adapter = normalizePendingAgentRunAdapter(value.adapter);
  const id = nullableString(value.id);
  const bindingId = nullableString(value.bindingId);
  const projectId = nullableString(value.projectId);
  const sessionKey = nullableString(value.sessionKey);
  const messageId = nullableString(value.messageId);
  const queuedAt = nullableString(value.queuedAt);
  const updatedAt = nullableString(value.updatedAt);
  if (!adapter || !id || !bindingId || !projectId || !sessionKey || !messageId || !queuedAt || !updatedAt) return null;
  return {
    id,
    adapter,
    bindingId,
    projectId,
    sessionKey,
    messageId,
    queuedAt,
    updatedAt,
    attempts: nullableNumber(value.attempts) ?? 0,
    ageMs: nullableNumber(value.ageMs),
  };
}

function normalizeDaemonPendingAgentRunEvent(
  value: unknown,
): ChannelConnectorsDaemonRuntimePendingAgentRunEvent | null {
  if (!isRecord(value)) return null;
  const eventKind = normalizePendingAgentRunEventKind(value.eventKind);
  const adapter = normalizePendingAgentRunAdapter(value.adapter);
  const checkedAt = nullableString(value.checkedAt);
  const bindingId = nullableString(value.bindingId);
  if (!eventKind || !adapter || !checkedAt || !bindingId) return null;
  return {
    checkedAt,
    eventKind,
    adapter,
    bindingId,
    projectId: nullableString(value.projectId),
    sessionKey: nullableString(value.sessionKey),
    messageId: nullableString(value.messageId),
    pendingRunId: nullableString(value.pendingRunId),
    attempt: nullableNumber(value.attempt),
    queuedAt: nullableString(value.queuedAt),
    reason: nullableString(value.reason),
    error: nullableString(value.error),
  };
}

function normalizeDaemonPendingAgentRunStatus(
  value: unknown,
): ChannelConnectorsDaemonRuntimeStatus["pendingAgentRuns"] {
  if (!isRecord(value)) {
    return {
      count: 0,
      oldestQueuedAt: null,
      records: [],
      recentEvents: [],
    };
  }
  const records = Array.isArray(value.records)
    ? value.records
      .map(normalizeDaemonPendingAgentRunRecord)
      .filter((record): record is ChannelConnectorsDaemonRuntimePendingAgentRunRecord => Boolean(record))
    : [];
  const recentEvents = Array.isArray(value.recentEvents)
    ? value.recentEvents
      .map(normalizeDaemonPendingAgentRunEvent)
      .filter((event): event is ChannelConnectorsDaemonRuntimePendingAgentRunEvent => Boolean(event))
    : [];
  return {
    count: nullableNumber(value.count) ?? records.length,
    oldestQueuedAt: nullableString(value.oldestQueuedAt),
    records,
    recentEvents,
  };
}

function normalizeDaemonReplyOutboxStatus(
  value: unknown,
): ChannelConnectorsDaemonRuntimeStatus["replyOutbox"] {
  if (!isRecord(value)) {
    return {
      pending: 0,
      delivered: 0,
      deadLetter: 0,
      oldestPendingAt: null,
      recentDeadLetters: [],
    };
  }
  const recentDeadLetters = Array.isArray(value.recentDeadLetters)
    ? value.recentDeadLetters.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const id = normalizeString(candidate.id);
      const platform: "feishu" | "octo" | null = candidate.platform === "feishu" || candidate.platform === "octo"
        ? candidate.platform
        : null;
      const accountId = normalizeString(candidate.accountId);
      const sourceMessageId = normalizeString(candidate.sourceMessageId);
      const updatedAt = normalizeString(candidate.updatedAt);
      if (!id || !platform || !accountId || !sourceMessageId || !updatedAt) return [];
      return [{
        id,
        platform,
        accountId,
        sourceMessageId,
        attempts: nullableNumber(candidate.attempts) ?? 0,
        updatedAt,
        lastError: nullableString(candidate.lastError),
      }];
    })
    : [];
  return {
    pending: nullableNumber(value.pending) ?? 0,
    delivered: nullableNumber(value.delivered) ?? 0,
    deadLetter: nullableNumber(value.deadLetter) ?? recentDeadLetters.length,
    oldestPendingAt: nullableString(value.oldestPendingAt),
    recentDeadLetters,
  };
}

function normalizeDaemonReloadMode(value: unknown): ChannelConnectorsDaemonReloadMode | null {
  return value === "immediate" || value === "when-idle" ? value : null;
}

function normalizeDaemonReloadState(value: unknown): ChannelConnectorsDaemonReloadState | null {
  if (!isRecord(value)) return null;
  const status = value.status === "idle"
    || value.status === "pending"
    || value.status === "applying"
    || value.status === "applied"
    || value.status === "restart-required"
    || value.status === "failed"
    ? value.status
    : null;
  if (!status) return null;
  return {
    status,
    mode: normalizeDaemonReloadMode(value.mode),
    requestedAt: nullableString(value.requestedAt),
    appliedAt: nullableString(value.appliedAt),
    activeRunsAtRequest: nullableNumber(value.activeRunsAtRequest),
    activeTurnsAtRequest: nullableNumber(value.activeTurnsAtRequest),
    configUpdatedAt: nullableString(value.configUpdatedAt),
    error: nullableString(value.error),
  };
}

function normalizeDaemonReloadResponse(value: unknown): ChannelConnectorsDaemonReloadResponse {
  if (!isRecord(value)) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      status: "failed",
      mode: "when-idle",
      activeRuns: 0,
      activeTurns: 0,
      configUpdatedAt: null,
      appliedAt: null,
      restartRequiredReason: null,
      error: "Channel daemon reload returned an invalid payload",
    };
  }
  const status = value.status === "pending"
    || value.status === "applied"
    || value.status === "restart-required"
    || value.status === "failed"
    ? value.status
    : "failed";
  return {
    ok: value.ok === true,
    checkedAt: nullableString(value.checkedAt) || new Date().toISOString(),
    status,
    mode: normalizeDaemonReloadMode(value.mode) || "when-idle",
    activeRuns: nullableNumber(value.activeRuns) ?? 0,
    activeTurns: nullableNumber(value.activeTurns) ?? 0,
    configUpdatedAt: nullableString(value.configUpdatedAt),
    appliedAt: nullableString(value.appliedAt),
    restartRequiredReason: nullableString(value.restartRequiredReason),
    error: nullableString(value.error),
  };
}

async function requestDaemonRuntimeStatus(
  checkedAt: string,
  fetchImpl: typeof fetch = fetch,
  endpoint = managementEndpoint(),
): Promise<ChannelConnectorsDaemonRuntimeStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetchImpl(`${endpoint}/status`, { signal: controller.signal });
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
    const octoConnectionDetails = Array.isArray(body.octoConnections)
      ? body.octoConnections
        .map(normalizeDaemonOctoConnection)
        .filter((record): record is ChannelConnectorsDaemonRuntimeStatus["octoConnectionDetails"][number] => Boolean(record))
      : [];
    const pendingAgentRuns = normalizeDaemonPendingAgentRunStatus(body.pendingAgentRuns);
    const replyOutbox = normalizeDaemonReplyOutboxStatus(body.replyOutbox);
    const ingressQueue = isRecord(body.ingressQueue) ? {
      activeAccounts: nullableNumber(body.ingressQueue.activeAccounts) ?? 0,
      queued: nullableNumber(body.ingressQueue.queued) ?? 0,
      completed: nullableNumber(body.ingressQueue.completed) ?? 0,
      failed: nullableNumber(body.ingressQueue.failed) ?? 0,
      duplicates: nullableNumber(body.ingressQueue.duplicates) ?? 0,
    } : null;
    return {
      ok: true,
      checkedAt,
      reachable: true,
      implementation: nullableString(body.implementation),
      pid: nullableNumber(body.pid),
      projects: nullableNumber(body.projects),
      platformBindings: nullableNumber(body.platformBindings),
      octoConnections: octoConnectionDetails.length,
      octoConnectionDetails,
      feishuConnections: arrayCount(body.feishuConnections),
      feishuConnectionDetails,
      activeRuns: arrayCount(body.activeRuns),
      agentRuns: arrayCount(body.agentRuns),
      autoCompacts,
      pendingAgentRuns,
      replyOutbox,
      ingressQueue,
      reload: normalizeDaemonReloadState(body.reload),
      error: null,
    };
  } catch (error) {
    return runtimeStatusError(checkedAt, error);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestDaemonReload(
  payload: { mode: ChannelConnectorsDaemonReloadMode },
  fetchImpl: typeof fetch = fetch,
  endpoint = managementEndpoint(),
  managementToken: string | null = null,
): Promise<ChannelConnectorsDaemonReloadResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(`${endpoint}/reload`, {
      method: "POST",
      headers: channelManagementHeaders(managementToken, true),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const message = isRecord(body) ? normalizeString(body.message) || normalizeString(body.error) : "";
      throw new Error(message || `Channel daemon reload failed with HTTP ${response.status}`);
    }
    return normalizeDaemonReloadResponse(body);
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      status: "failed",
      mode: payload.mode,
      activeRuns: 0,
      activeTurns: 0,
      configUpdatedAt: null,
      appliedAt: null,
      restartRequiredReason: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestDaemonAgentSessions(
  payload?: ChannelConnectorAgentSessionActionRequest | null,
  fetchImpl: typeof fetch = fetch,
  endpoint = managementEndpoint(),
  managementToken: string | null = null,
): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
  const method = payload ? "POST" : "GET";
  const response = await fetchImpl(`${endpoint}/agent-sessions`, {
    method,
    headers: channelManagementHeaders(managementToken, Boolean(payload)),
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

function isDaemonConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : null;
  const causeCode = isRecord(cause) ? normalizeString(cause.code) : "";
  return error.name === "TypeError" && (
    /fetch failed|failed to fetch|network error/i.test(error.message)
    || ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(causeCode)
  );
}

function buildRuntimeConfig(
  deliveryConfig: ChannelConnectorsV3Config,
  paths: ChannelConnectorsPaths,
  managementEndpointOverride?: string,
  managementToken?: string | null,
): ChannelConnectorsDaemonRuntimeConfig {
  const management = managementBinding(managementEndpointOverride);
  const token = normalizeString(managementToken);
  const runtime: ChannelConnectorsDaemonRuntimeConfig = {
    version: 1,
    deliveryConfig,
    management: {
      host: management.host,
      port: management.port,
      ...(token ? { token } : {}),
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
      clientKeyRef: "tracevane-gateway-client-key",
    },
    agentSessionPolicy: deliveryConfig.agentSessionPolicy,
    projects: [],
  };
  runtime.projects = channelConnectorRuntimeRouteRefs(runtime).map(({ project, binding }) => ({
    ...project,
    platformBindings: [binding],
  }));
  return runtime;
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

function redactPlatformBinding(
  binding: ChannelConnectorPlatformBinding,
): ChannelConnectorPlatformBinding {
  return {
    ...binding,
    metadata: redactSensitiveMetadata(binding.metadata) as
      | Record<string, unknown>
      | undefined,
  };
}

function restoreRedactedSensitiveMetadata(existing: unknown, incoming: unknown): unknown {
  if (Array.isArray(incoming)) {
    const existingArray = Array.isArray(existing) ? existing : [];
    return incoming.map((item, index) => restoreRedactedSensitiveMetadata(existingArray[index], item));
  }
  if (!isRecord(incoming)) return incoming;
  const existingRecord = isRecord(existing) ? existing : {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(incoming)) {
    if (isSensitiveMetadataKey(key) && item === "[redacted]" && key in existingRecord) {
      output[key] = existingRecord[key];
    } else {
      output[key] = restoreRedactedSensitiveMetadata(existingRecord[key], item);
    }
  }
  return output;
}

function redactV3Config(config: ChannelConnectorsV3Config): ChannelConnectorsV3Config {
  return {
    ...config,
    accounts: config.accounts.map((account) => ({
      ...account,
      credentials: redactSensitiveMetadata(account.credentials) as Record<string, unknown>,
      transport: redactSensitiveMetadata(account.transport) as Record<string, unknown>,
      advanced: redactSensitiveMetadata(account.advanced) as Record<string, unknown>,
    })),
  };
}

function restoreV3RedactedSecrets(
  existing: ChannelConnectorsV3Config,
  incoming: ChannelConnectorsV3Config,
): ChannelConnectorsV3Config {
  const existingAccounts = new Map(existing.accounts.map((account) => [account.id, account] as const));
  return {
    ...incoming,
    accounts: incoming.accounts.map((account) => {
      const previous = existingAccounts.get(account.id);
      if (!previous) return account;
      return {
        ...account,
        credentials: restoreRedactedSensitiveMetadata(
          previous.credentials,
          account.credentials,
        ) as Record<string, unknown>,
        transport: restoreRedactedSensitiveMetadata(
          previous.transport,
          account.transport,
        ) as Record<string, unknown>,
        advanced: restoreRedactedSensitiveMetadata(
          previous.advanced,
          account.advanced,
        ) as Record<string, unknown>,
      };
    }),
  };
}

function v3ConfigRevision(config: ChannelConnectorsV3Config): string {
  return normalizeString(config.updatedAt, "unversioned");
}

function unpersistedV3ConfigRevision(config: ChannelConnectorsV3Config): string {
  return `unpersisted:${createHash("sha256")
    .update(JSON.stringify({ ...config, updatedAt: "" }))
    .digest("hex")}`;
}

function v3CandidateHash(config: ChannelConnectorsV3Config): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

function changedIds<T extends { id: string }>(
  current: T[],
  candidate: T[],
  select: (value: T) => unknown = (value) => value,
): string[] {
  const before = new Map(current.map((value) => [value.id, JSON.stringify(select(value))] as const));
  return candidate
    .filter((value) => before.has(value.id) && before.get(value.id) !== JSON.stringify(select(value)))
    .map((value) => value.id)
    .sort();
}

function addedIds<T extends { id: string }>(current: T[], candidate: T[]): string[] {
  const before = new Set(current.map((value) => value.id));
  return candidate.filter((value) => !before.has(value.id)).map((value) => value.id).sort();
}

function removedIds<T extends { id: string }>(current: T[], candidate: T[]): string[] {
  const after = new Set(candidate.map((value) => value.id));
  return current.filter((value) => !after.has(value.id)).map((value) => value.id).sort();
}

function countAffectedV3Sessions(input: {
  current: ChannelConnectorsV3Config;
  candidate: ChannelConnectorsV3Config;
  sessions: ChannelConnectorAgentSessionRecord[];
  accountIds: string[];
  targetIds: string[];
}): number {
  const accountIds = new Set(input.accountIds);
  const targetIds = new Set(input.targetIds);
  const configs = [input.current, input.candidate];
  return input.sessions.filter((session) => (
    (session.accountId ? accountIds.has(session.accountId) : false)
    || (session.targetId ? targetIds.has(session.targetId) : false)
  )).length;
}

function buildV3SemanticDiff(
  current: ChannelConnectorsV3Config,
  candidate: ChannelConnectorsV3Config,
  sessions: ChannelConnectorAgentSessionRecord[] = [],
): ChannelConnectorsV3SemanticDiff {
  const accountsAdded = addedIds(current.accounts, candidate.accounts);
  const accountsRemoved = removedIds(current.accounts, candidate.accounts);
  const accountsReconnected = changedIds(current.accounts, candidate.accounts, (account) => ({
    platform: account.platform,
    lifecycle: account.lifecycle,
    externalAccountId: account.externalAccountId,
    botId: account.botId,
    credentials: account.credentials,
    transport: account.transport,
  }));
  const policyAccountsChanged = changedIds(
    current.deliveryPolicies,
    candidate.deliveryPolicies,
  ).map((policyId) => (
    candidate.deliveryPolicies.find((policy) => policy.id === policyId)
      || current.deliveryPolicies.find((policy) => policy.id === policyId)
  )?.accountRef).filter((value): value is string => Boolean(value));
  const policyAccountsAdded = addedIds(current.deliveryPolicies, candidate.deliveryPolicies)
    .map((policyId) => candidate.deliveryPolicies.find((policy) => policy.id === policyId)?.accountRef)
    .filter((value): value is string => Boolean(value));
  const policyAccountsRemoved = removedIds(current.deliveryPolicies, candidate.deliveryPolicies)
    .map((policyId) => current.deliveryPolicies.find((policy) => policy.id === policyId)?.accountRef)
    .filter((value): value is string => Boolean(value));
  const accountPolicyFieldsChanged = changedIds(current.accounts, candidate.accounts, (account) => ({
    lifecycle: account.lifecycle,
    security: account.security,
    advanced: account.advanced,
  }));
  const resolverAccountsChanged = stringList([
    ...policyAccountsChanged,
    ...policyAccountsAdded,
    ...policyAccountsRemoved,
    ...accountPolicyFieldsChanged,
  ]).sort();
  const targetsAdded = addedIds(current.targets, candidate.targets);
  const targetsRemoved = removedIds(current.targets, candidate.targets);
  const targetsChanged = changedIds(current.targets, candidate.targets);
  const sessionTargetIds = stringList([
    ...targetsRemoved,
    ...changedIds(current.targets, candidate.targets, (target) => ({
      enabled: target.enabled,
      runtime: target.runtime,
      workspace: target.workspace,
      execution: target.execution,
      governance: target.governance,
    })),
  ]).sort();
  const existingSessionsAffected = countAffectedV3Sessions({
    current,
    candidate,
    sessions,
    accountIds: stringList([...accountsRemoved, ...resolverAccountsChanged]),
    targetIds: sessionTargetIds,
  });
  return {
    accountsAdded,
    accountsRemoved,
    accountsReconnected,
    resolverAccountsChanged,
    targetsAdded,
    targetsRemoved,
    targetsChanged,
    existingSessionsAffected,
    requiresDaemonReload: [
      accountsAdded,
      accountsRemoved,
      accountsReconnected,
      resolverAccountsChanged,
      targetsAdded,
      targetsRemoved,
      targetsChanged,
    ].some((values) => values.length > 0),
  };
}

function extractBindingSecrets(
  binding: ChannelConnectorPlatformBinding,
): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(binding.metadata ?? {})) {
    if (!isSensitiveMetadataKey(key)) continue;
    const secret = normalizeString(value);
    if (secret) secrets[key] = secret;
  }
  return secrets;
}

function redactRuntimeConfig(runtimeConfig: ChannelConnectorsDaemonRuntimeConfig): ChannelConnectorsDaemonRuntimeConfig {
  return {
    ...runtimeConfig,
    management: {
      host: runtimeConfig.management.host,
      port: runtimeConfig.management.port,
      ...(runtimeConfig.management.token ? { token: "[redacted]" } : {}),
    },
    deliveryConfig: redactV3Config(runtimeConfig.deliveryConfig),
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

function buildConfigResponse(
  config: TracevaneServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
  managementEndpointOverride?: string,
  managementToken?: string | null,
): ChannelConnectorsDaemonConfigResponse {
  const v3Snapshot = readV3Snapshot(config, paths, now);
  const validationIssues = validateChannelConnectorsV3Config(v3Snapshot.config);
  if (validationIssues.length > 0) throw new Error("Channel Connectors v3 config is invalid.");
  const runtimeConfig = buildRuntimeConfig(
    v3Snapshot.config,
    paths,
    managementEndpointOverride,
    managementToken,
  );
  const preview = `${JSON.stringify(runtimeConfig, null, 2)}\n`;
  return {
    ok: true,
    checkedAt: now.toISOString(),
    ready: true,
    nativeConfigPath: paths.nativeConfigPath,
    configPath: paths.configPath,
    gatewayEndpoint: gatewayEndpoint(),
    managementEndpoint: managementEndpoint(managementEndpointOverride),
    config: runtimeConfig,
    preview,
    missing: [],
  };
}

export function createChannelConnectorsServiceDefinition(
  config: TracevaneServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ServiceDefinition {
  const paths = resolveChannelConnectorsPaths(config, options.homeDir);
  return {
    id: "channel-connectors",
    displayName: "Tracevane Channel Connectors",
    serviceName: CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME,
    windowsTaskName: "TracevaneChannelConnectors",
    launchdLabel: "tracevane-channel-connectors",
    entryPath: daemonEntryPath(config),
    workingDirectory: paths.rootDir,
    configPath: paths.configPath,
    runtimePath: paths.runtimeFile,
    logPath: paths.logFile,
    healthUrl: `${managementEndpoint(options.managementEndpoint)}/status`,
    args: [],
  };
}

function compatibilityTemplate(plan: SupervisorPlan): ChannelConnectorsDaemonTemplate {
  const platform = plan.platform === "darwin"
    ? "macos"
    : plan.platform === "win32"
      ? "windows"
      : plan.platform === "linux"
        ? "linux"
        : "unknown";
  return {
    supervisor: plan.supervisor,
    platform,
    serviceName: plan.serviceName,
    servicePath: plan.configPath,
    template: plan.template,
    commands: plan.commands,
  };
}

export function createChannelConnectorsDaemonPlan(
  config: TracevaneServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ChannelConnectorsDaemonPlan {
  const paths = resolveChannelConnectorsPaths(config, options.homeDir);
  const homeDir = defaultTracevaneHomeDir(config, options.homeDir);
  const definition = createChannelConnectorsServiceDefinition(config, options);
  const nodePath = process.execPath;
  const platform = options.platform ?? process.platform;
  const sharedPlans = (["linux", "darwin", "win32"] as const).map((candidate) =>
    createSupervisorPlan(definition, candidate, homeDir, {
      windowsUserId: options.windowsUserId,
    }));
  const selectedSharedPlan = sharedPlans.find((candidate) => candidate.platform === platform);
  const selectedTemplate = selectedSharedPlan
    ? compatibilityTemplate(selectedSharedPlan)
    : {
        supervisor: "none" as const,
        platform: "unknown" as const,
        serviceName: definition.serviceName,
        servicePath: path.join(paths.rootDir, definition.serviceName),
        template: "# Unsupported platform for Tracevane native Channel Connectors service.\n",
        commands: {},
      };
  const templates = sharedPlans.map(compatibilityTemplate);
  const notes = [
    "Channel Connectors is a Tracevane-native daemon.",
    "CC and OpenClaw implementations are reference sources only.",
    "Tracevane and OpenClaw are not runtime dependencies after the native daemon is supervised.",
  ];

  return {
    platform,
    supported: selectedSharedPlan !== undefined,
    supervisor: selectedTemplate.supervisor,
    serviceName: selectedTemplate.serviceName,
    nodePath,
    daemonEntry: definition.entryPath,
    rootDir: paths.rootDir,
    configPath: paths.configPath,
    stateDir: paths.stateDir,
    logFile: paths.logFile,
    runtimeFile: paths.runtimeFile,
    managementEndpoint: managementEndpoint(options.managementEndpoint),
    selectedTemplate,
    templates,
    notes,
  };
}

function isConfigCurrent(configPreview: ChannelConnectorsDaemonConfigResponse): boolean {
  return readTextIfExists(configPreview.configPath) === configPreview.preview;
}

function normalizeDaemonServiceMode(value: unknown): TracevaneServiceMode {
  return value === "persistent" ? "persistent" : "session";
}

function normalizeDaemonServiceApply(
  payload: ChannelConnectorsDaemonRequest,
): boolean {
  return payload.apply === true || payload.runCommands === true;
}

function commonDaemonAction(
  action: ChannelConnectorsDaemonAction,
): TracevaneServiceAction | null {
  return action === "reload" ? null : action;
}

function shouldPreparePrivateConfig(
  action: ChannelConnectorsDaemonAction,
  apply: boolean,
): boolean {
  return apply && action !== "preview" && action !== "status" &&
    action !== "stop" && action !== "uninstall";
}

function mutatesSessionOwner(
  action: TracevaneServiceAction,
): boolean {
  return action !== "preview" && action !== "status";
}

function assertTrustedManagementRequest(
  config: TracevaneServerConfig,
  req?: http.IncomingMessage,
): void {
  if (!req || isTracevaneTrustedManagementRequest(config, req)) return;
  throw new ChannelConnectorsServiceError(
    "channel_connectors_management_locked",
    "Channel Connectors management requires a trusted loopback request or configured authentication.",
    403,
  );
}

function compatibilityCommandResult(
  result: SupervisorCommandResult,
): ChannelConnectorsDaemonCommandResult {
  return {
    label: result.label,
    command: result.command,
    args: [...result.args],
    ok: result.ok,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    durationMs: result.durationMs,
    error: result.errorMessage,
  };
}

function compatibilityServiceManager(
  manager: TracevaneServiceManagerStatus,
): ChannelConnectorsDaemonManagerStatus {
  const unreachable = manager.errorCode === "command-not-found" ||
    manager.errorCode === "command-timeout" ||
    manager.errorCode === "permission-denied" ||
    manager.errorCode === "unsupported-platform";
  return {
    ...manager,
    checked: true,
    reachable: unreachable ? false : true,
    lastError: manager.errorMessage,
  };
}

function channelManagementToken(options: ChannelConnectorsServiceOptions): string | null {
  return normalizeString(
    options.managementToken || process.env.TRACEVANE_DAEMON_MANAGEMENT_TOKEN,
  ) || null;
}

function channelManagementHeaders(
  token: string | null,
  json = false,
): Record<string, string> {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function createChannelConnectorsReadinessProbe(
  fetchImpl: typeof fetch,
): (url: string, expectedPid?: number | null) => Promise<boolean> {
  return async (url, expectedPid) => {
    const sessionOwned = expectedPid !== undefined && expectedPid !== null;
    if (sessionOwned && (!Number.isInteger(expectedPid) || Number(expectedPid) <= 0)) {
      return false;
    }
    const deadline = Date.now() + 3_000;
    let consecutive = 0;
    let stablePid: number | null = null;
    while (Date.now() < deadline) {
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(500),
        });
        const body = response.ok
          ? await response.json() as unknown
          : null;
        const responsePid = isRecord(body) && Number.isInteger(body.pid) && Number(body.pid) > 0
          ? Number(body.pid)
          : null;
        if (
          sessionOwned &&
          isRecord(body) &&
          body.implementation === "tracevane-native" &&
          responsePid !== null &&
          responsePid !== expectedPid
        ) {
          return false;
        }
        const matches = isRecord(body) &&
          body.implementation === "tracevane-native" &&
          responsePid !== null &&
          (!sessionOwned || responsePid === expectedPid);
        if (matches && responsePid === stablePid) {
          consecutive += 1;
        } else if (matches) {
          stablePid = responsePid;
          consecutive = 1;
        } else {
          stablePid = null;
          consecutive = 0;
        }
        if (consecutive >= 2) return true;
      } catch {
        stablePid = null;
        consecutive = 0;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 75));
    }
    return false;
  };
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
    file_path: normalizeString(value.file_path) || null,
    filePath: normalizeString(value.filePath) || null,
    download_path: normalizeString(value.download_path) || null,
    downloadPath: normalizeString(value.downloadPath) || null,
    object_key: normalizeString(value.object_key) || null,
    objectKey: normalizeString(value.objectKey) || null,
    storage_key: normalizeString(value.storage_key) || null,
    storageKey: normalizeString(value.storageKey) || null,
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
      messageSeq: typeof message.messageSeq === "number" && Number.isFinite(message.messageSeq) ? message.messageSeq : null,
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

function normalizeTransportSmokeDraftBinding(
  value: unknown,
  platform: "feishu" | "octo",
): ChannelConnectorPlatformBinding | null {
  if (!isRecord(value) || value.platform !== platform) return null;
  const metadata = normalizePlatformBindingMetadata(platform, value.metadata);
  const id = normalizeString(value.id) || `${platform}-draft`;
  const accountId = normalizeString(value.accountId)
    || (platform === "feishu" && metadata ? normalizeString(metadata.appId) : "")
    || id;
  return {
    id,
    platform,
    accountId,
    botId: normalizeString(value.botId) || null,
    displayName: normalizeString(value.displayName) || id,
    agentProfileId: normalizeString(value.agentProfileId) || "default-codex",
    enabled: true,
    allowlist: [],
    adminUsers: [],
    disabledCommands: [],
    metadata,
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
    || payload.action === "read-receipt"
    || payload.action === "list-groups"
    || payload.action === "group-info"
    || payload.action === "group-members"
    || payload.action === "search-members"
    || payload.action === "space-members"
    || payload.action === "create-group"
    || payload.action === "update-group"
    || payload.action === "add-members"
    || payload.action === "add-group-members"
    || payload.action === "remove-members"
    || payload.action === "remove-group-members"
    || payload.action === "list-threads"
    || payload.action === "get-thread"
    || payload.action === "thread-info"
    || payload.action === "list-thread-members"
    || payload.action === "thread-members"
    || payload.action === "create-thread"
    || payload.action === "delete-thread"
    || payload.action === "join-thread"
    || payload.action === "leave-thread"
    || payload.action === "group-md-read"
    || payload.action === "group-md-update"
    || payload.action === "thread-md-read"
    || payload.action === "thread-md-update"
    || payload.action === "voice-context-read"
    || payload.action === "voice-context-update"
    || payload.action === "voice-context-delete"
    || payload.action === "event-ack"
    || payload.action === "history"
    || payload.action === "sync-messages"
    || payload.action === "file-download-url"
    || payload.action === "message-edit"
    || payload.action === "register"
    ? payload.action
    : "register";
  const channelType = Number(payload.channelType || 1);
  const pullMode = Number(payload.pullMode ?? 1);
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    binding: normalizeTransportSmokeDraftBinding(payload.binding, "octo"),
    action,
    channelId: normalizeString(payload.channelId) || null,
    channelType: channelType === 1 || channelType === 2 || channelType === 5 ? channelType : 1,
    content: normalizeString(payload.content) || "Tracevane Octo transport smoke",
    fileName: normalizeString(payload.fileName) || null,
    mimeType: normalizeString(payload.mimeType) || null,
    groupNo: normalizeString(payload.groupNo) || null,
    shortId: normalizeString(payload.shortId) || null,
    eventId: typeof payload.eventId === "number" || typeof payload.eventId === "string" ? payload.eventId : null,
    keyword: normalizeString(payload.keyword) || null,
    limit: nullableNumber(payload.limit),
    members: Array.isArray(payload.members) ? payload.members.map((member) => normalizeString(member)).filter(Boolean) : [],
    creator: normalizeString(payload.creator) || null,
    name: normalizeString(payload.name) || null,
    notice: normalizeString(payload.notice) || null,
    spaceId: normalizeString(payload.spaceId) || null,
    startMessageSeq: nullableNumber(payload.startMessageSeq),
    endMessageSeq: nullableNumber(payload.endMessageSeq),
    pullMode: pullMode === 0 || pullMode === 1 ? pullMode : 1,
    filePath: normalizeString(payload.filePath) || null,
    messageId: normalizeString(payload.messageId) || null,
  };
}

function octoTransportSmokeResultAction(
  action: ChannelConnectorOctoTransportSmokeRequest["action"] | undefined,
): ChannelConnectorOctoTransportResult["action"] {
  switch (action) {
    case "search-members":
      return "space-members";
    case "add-members":
      return "add-group-members";
    case "remove-members":
      return "remove-group-members";
    case "get-thread":
      return "thread-info";
    case "list-thread-members":
      return "thread-members";
    case "history":
      return "sync-messages";
    case undefined:
      return "register";
    default:
      return action;
  }
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
    binding: normalizeTransportSmokeDraftBinding(payload.binding, "feishu"),
    action,
    channelId: normalizeString(payload.channelId) || null,
    receiveId: normalizeString(payload.receiveId) || null,
    receiveIdType: payload.receiveIdType === "open_id" || payload.receiveIdType === "user_id" || payload.receiveIdType === "chat_id"
      ? payload.receiveIdType
      : null,
    messageId: normalizeString(payload.messageId) || null,
    content: normalizeString(payload.content) || "Tracevane Feishu transport smoke",
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
  const channelType = nullableNumber(payload.channelType);
  return {
    bindingId: normalizeString(payload.bindingId) || null,
    sessionKey: normalizeString(payload.sessionKey) || null,
    fromUid: normalizeString(payload.fromUid) || null,
    channelId: normalizeString(payload.channelId) || null,
    channelType: channelType === 1 || channelType === 2 || channelType === 5 ? channelType : null,
    messageId: normalizeString(payload.messageId) || null,
    messageSeq: typeof payload.messageSeq === "number" && Number.isFinite(payload.messageSeq) ? payload.messageSeq : null,
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

async function visionModelsForCommandSurface(input: {
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorsDaemonRuntimeConfig["projects"][number];
  requestedModels?: string[];
}): Promise<string[]> {
  const requested = stringList(input.requestedModels);
  if (requested.length) return requested;
  try {
    const catalog = await listChannelConnectorGatewayModelCatalog(
      input.project.gatewayEndpoint || input.runtimeConfig.gateway.endpoint,
      resolveChannelConnectorGatewayClientKey(input.runtimeConfig),
    );
    return stringList(catalog
      .filter((model) => model.features.vision === true
        && ((model.healthyProviderIds || []).length > 0 || (model.openCircuitProviderIds || []).length === 0))
      .map((model) => model.id));
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

async function runOctoManagementForBinding(
  binding: ChannelConnectorPlatformBinding,
  input: ChannelConnectorOctoManagementRequest,
): Promise<ChannelConnectorOctoManagementResult> {
  const transport = octoTransportFromBinding(binding);
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
    case "file-download-url": {
      const filePath = normalizeString(input.filePath);
      if (!filePath) {
        return {
          ok: false,
          replyText: "Octo file-download-url 需要 filePath。",
          error: "octo_file_path_required",
        };
      }
      result = await getOctoFileDownloadUrl(transport, {
        filePath,
        fileName: input.fileName || null,
      });
      break;
    }
    case "message-edit": {
      const messageId = normalizeString(input.messageId);
      const content = normalizeString(input.content);
      if (!messageId || !content) {
        return {
          ok: false,
          replyText: "Octo message-edit 需要 messageId 和 content。",
          error: "octo_message_edit_input_required",
        };
      }
      result = await editOctoMessage(transport, {
        messageId,
        content,
      });
      break;
    }
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
      filePath: input.filePath || null,
      fileName: input.fileName || null,
      messageId: input.messageId || null,
    }),
    error: result.error || null,
  };
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

function metadataStringValue(metadata: Record<string, unknown> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(metadata?.[key]);
    if (value) return value;
  }
  return "";
}

function metadataFeishuGroupSessionScopeValue(
  metadata: Record<string, unknown> | undefined,
): ChannelConnectorFeishuGroupSessionScope | null {
  const value = metadataStringValue(metadata, [
    "feishuGroupSessionScope",
    "feishu_group_session_scope",
    "groupSessionScope",
    "group_session_scope",
  ]);
  if (
    value === "group"
    || value === "group_sender"
    || value === "group_topic"
    || value === "group_topic_sender"
  ) {
    return value;
  }
  return null;
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
    groupSessionScope: metadataFeishuGroupSessionScopeValue(binding.metadata),
    replyInThread: metadataBooleanValue(binding.metadata, ["replyInThread", "reply_in_thread"], false),
  });
}

function normalizeFeishuWebhookCommandText(value: string): string {
  const text = normalizeString(value);
  if (text.startsWith("/%")) return `/${text.slice(2)}`;
  if (text.startsWith("%")) return `/${text.slice(1)}`;
  return text;
}

function resolveOctoBindingById(
  nativeConfig: ChannelConnectorRuntimeAdapterCatalog,
  bindingId: string | null | undefined,
): { binding: ChannelConnectorRuntimeAdapterCatalog["platformBindings"][number]; agentProfile: ChannelConnectorRuntimeAdapterCatalog["agentProfiles"][number] } | null {
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
  nativeConfig: ChannelConnectorRuntimeAdapterCatalog,
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig,
  bindingId: string | null | undefined,
): {
  binding: ChannelConnectorRuntimeAdapterCatalog["platformBindings"][number];
  agentProfile: ChannelConnectorRuntimeAdapterCatalog["agentProfiles"][number];
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
  const project = runtimeConfig.projects.find((candidate) => candidate.platformBindings.some((runtimeBinding) => runtimeBinding.id === binding.id));
  const runtimeBinding = project?.platformBindings.find((candidate) => candidate.id === binding.id);
  if (!agentProfile || !project || !runtimeBinding) return null;
  return { binding, agentProfile, project, runtimeBinding };
}

function bindingMetadataString(
  binding: ChannelConnectorRuntimeAdapterCatalog["platformBindings"][number],
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
  nativeConfig: ChannelConnectorRuntimeAdapterCatalog,
  runtimeConfig: ChannelConnectorsDaemonRuntimeConfig,
  platform: ChannelConnectorPlatformId,
  bindingId: string | null | undefined,
  accountId: string | null | undefined,
): {
  binding: ChannelConnectorRuntimeAdapterCatalog["platformBindings"][number];
  agentProfile: ChannelConnectorRuntimeAdapterCatalog["agentProfiles"][number];
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
  const project = runtimeConfig.projects.find((candidate) => candidate.platformBindings.some((runtimeBinding) => runtimeBinding.id === binding.id));
  const runtimeBinding = project?.platformBindings.find((candidate) => candidate.id === binding.id);
  if (!agentProfile || !project || !runtimeBinding) return null;
  return { binding, agentProfile, project, runtimeBinding };
}

function verifyFeishuWebhookToken(
  binding: ChannelConnectorRuntimeAdapterCatalog["platformBindings"][number] | null,
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
  const skills = listChannelConnectorSkillSummaries(current, input.binding);
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
  }, 20).map((entry) => ({
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
    supportedAgents: [...CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS],
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

export function createChannelConnectorsService(
  config: TracevaneServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ChannelConnectorsService {
  const now = () => (options.now ? options.now() : new Date());
  const paths = () => resolveChannelConnectorsPaths(config, options.homeDir);
  const fetchImpl = options.fetchImpl ?? fetch;
  const managementToken = channelManagementToken(options);
  const daemonServiceManager = options.manager ?? createServiceManager({
    platform: options.platform ?? process.platform,
    homeDir: defaultTracevaneHomeDir(config, options.homeDir),
    windowsUserId: options.windowsUserId,
    probe: createChannelConnectorsReadinessProbe(fetchImpl),
    redact: managementToken ? [managementToken] : [],
    runner: options.commandRunner
      ? async (command) => {
          const result = await options.commandRunner!(command);
          return {
            label: command.label,
            command: command.command,
            args: [...command.args],
            ok: result.ok,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage ?? result.error,
            durationMs: result.durationMs,
          };
        }
      : undefined,
  });
  const registerFeishuApp = options.feishuRegisterApp ?? registerApp;
  const feishuAppRegistrationSessions = new Map<string, FeishuAppRegistrationSession>();
  const v3ConfigPlans = new Map<string, ChannelConnectorsV3PlanEntry>();

  function currentConfigFull(): ChannelConnectorsDaemonConfigResponse {
    return buildConfigResponse(
      config,
      paths(),
      now(),
      options.managementEndpoint,
      managementToken,
    );
  }

  function currentConfig(): ChannelConnectorsDaemonConfigResponse {
    return redactConfigResponse(currentConfigFull());
  }

  function currentV3Config(): ChannelConnectorsV3ConfigResponse {
    const resolvedPaths = paths();
    const snapshot = readV3Snapshot(config, resolvedPaths, now());
    const validationIssues = validateChannelConnectorsV3Config(snapshot.config);
    return {
      ok: true,
      checkedAt: now().toISOString(),
      configPath: resolvedPaths.nativeConfigPath,
      revision: snapshot.revision,
      config: redactV3Config(snapshot.config),
      validationIssues,
      canApply: validationIssues.length === 0,
    };
  }

  function cleanupV3ConfigPlans(): void {
    const nowMs = now().getTime();
    for (const [planId, plan] of v3ConfigPlans) {
      if (plan.expiresAtMs <= nowMs) v3ConfigPlans.delete(planId);
    }
  }

  function prepareV3Candidate(
    incoming: ChannelConnectorsV3Config,
    existing: ChannelConnectorsV3Config,
  ): ChannelConnectorsV3Config {
    if (!incoming || incoming.version !== 3) {
      throw new Error("Channel Connectors v3 config payload is required.");
    }
    const candidate = restoreV3RedactedSecrets(existing, structuredClone(incoming));
    candidate.version = 3;
    candidate.updatedAt = normalizeString(candidate.updatedAt, existing.updatedAt);
    candidate.agentSessionPolicy = normalizeAgentSessionPolicy(candidate.agentSessionPolicy);
    return candidate;
  }

  function planV3Config(
    payload: ChannelConnectorsV3ConfigPlanRequest = {},
  ): ChannelConnectorsV3ConfigPlanResponse {
    if (!payload.config) throw new Error("Channel Connectors v3 config payload is required.");
    cleanupV3ConfigPlans();
    const resolvedPaths = paths();
    const snapshot = readV3Snapshot(config, resolvedPaths, now());
    const current = snapshot.config;
    const currentRevision = snapshot.revision;
    const expectedRevision = normalizeString(payload.expectedRevision);
    if (expectedRevision && expectedRevision !== currentRevision) {
      throw new Error(
        `Channel Connectors v3 config changed since this editor was opened. Expected ${expectedRevision}, current ${currentRevision}.`,
      );
    }
    const candidate = prepareV3Candidate(payload.config, current);
    const validationIssues = validateChannelConnectorsV3Config(candidate);
    const sessionState = readChannelConnectorAgentSessions(
      path.join(resolvedPaths.stateDir, "channel-sessions.json"),
    );
    const diff = buildV3SemanticDiff(current, candidate, Object.values(sessionState.sessions));
    const expiresAtMs = now().getTime() + 10 * 60_000;
    const planId = validationIssues.length === 0 ? randomUUID() : null;
    if (planId) {
      v3ConfigPlans.set(planId, {
        currentRevision,
        candidateHash: v3CandidateHash(candidate),
        expiresAtMs,
      });
    }
    return {
      ok: validationIssues.length === 0,
      checkedAt: now().toISOString(),
      planId,
      currentRevision,
      expiresAt: planId ? new Date(expiresAtMs).toISOString() : null,
      config: redactV3Config(candidate),
      validationIssues,
      diff,
    };
  }

  function saveV3Config(value: ChannelConnectorsV3Config): ChannelConnectorsV3ConfigResponse {
    const resolvedPaths = paths();
    const current = readV3Snapshot(config, resolvedPaths, now()).config;
    const candidate = prepareV3Candidate(value, current);
    writeV3Config(config, resolvedPaths, candidate, now());
    return currentV3Config();
  }

  async function applyV3Config(
    payload: ChannelConnectorsV3ConfigApplyRequest = {},
    req?: http.IncomingMessage,
  ): Promise<ChannelConnectorsV3ConfigApplyResponse> {
    assertTrustedManagementRequest(config, req);
    if (!payload.config || !normalizeString(payload.planId)) {
      throw new Error("A valid Channel Connectors v3 planId and config are required.");
    }
    cleanupV3ConfigPlans();
    const planId = normalizeString(payload.planId);
    const plan = v3ConfigPlans.get(planId);
    if (!plan || plan.expiresAtMs <= now().getTime()) {
      throw new Error("Channel Connectors v3 config plan is missing or expired. Run plan again.");
    }
    const resolvedPaths = paths();
    const snapshot = readV3Snapshot(config, resolvedPaths, now());
    const current = snapshot.config;
    if (snapshot.revision !== plan.currentRevision) {
      v3ConfigPlans.delete(planId);
      throw new Error("Channel Connectors v3 config changed after planning. Run plan again.");
    }
    const candidate = prepareV3Candidate(payload.config, current);
    assertChannelConnectorsV3Config(candidate);
    if (v3CandidateHash(candidate) !== plan.candidateHash) {
      throw new Error("Channel Connectors v3 config differs from the planned candidate. Run plan again.");
    }
    v3ConfigPlans.delete(planId);
    let ownerMode: TracevaneServiceMode;
    if (payload.mode === "session" || payload.mode === "persistent") {
      ownerMode = payload.mode;
    } else {
      const definition = createChannelConnectorsServiceDefinition(config, options);
      const sessionStatus = await daemonServiceManager.manage(definition, {
        action: "status",
        mode: "session",
        apply: true,
      });
      if (sessionStatus.manager.state === "running") {
        ownerMode = "session";
      } else {
        const persistentStatus = await daemonServiceManager.manage(definition, {
          action: "status",
          mode: "persistent",
          apply: true,
        });
        ownerMode = persistentStatus.manager.state === "running"
          ? "persistent"
          : "session";
      }
    }
    const previousRaw = readTextIfExists(resolvedPaths.nativeConfigPath);
    const previousDaemonRaw = readTextIfExists(resolvedPaths.configPath);
    const runtimeBefore = await requestDaemonRuntimeStatus(
      now().toISOString(),
      fetchImpl,
      managementEndpoint(options.managementEndpoint),
    );
    const saved = writeV3Config(config, resolvedPaths, candidate, now());
    const failedReload = (
      mode: ChannelConnectorsDaemonReloadMode,
      error: unknown,
    ): ChannelConnectorsDaemonReloadResponse => ({
      ok: false,
      checkedAt: now().toISOString(),
      status: "failed",
      mode,
      activeRuns: 0,
      activeTurns: 0,
      configUpdatedAt: saved.updatedAt,
      appliedAt: null,
      restartRequiredReason: null,
      error: error instanceof Error ? error.message : String(error),
    });
    let applyResult: ChannelConnectorsDaemonResponse | null = null;
    let applyError: unknown = null;
    let bootstrapReload: ChannelConnectorsDaemonReloadResponse | null = null;
    try {
      applyResult = await manageDaemonService({
        action: "reload",
        mode: ownerMode,
        apply: true,
        reloadMode: payload.reloadMode || "when-idle",
      }, req);
      if (applyResult.skippedReason === "daemon_not_running") {
        applyResult = await manageDaemonService({
          action: "start",
          mode: ownerMode,
          apply: true,
        }, req);
        if (applyResult.manager.state === "running") {
          const appliedAt = now().toISOString();
          bootstrapReload = {
            ok: true,
            checkedAt: appliedAt,
            status: "applied",
            mode: payload.reloadMode || "when-idle",
            activeRuns: 0,
            activeTurns: 0,
            configUpdatedAt: saved.updatedAt,
            appliedAt,
            restartRequiredReason: null,
            error: null,
          };
        } else {
          const startFailure = applyResult.manager.errorMessage
            || applyResult.diagnostics[0]
            || `Channel daemon did not start (state: ${applyResult.manager.state}).`;
          let cleanupFailure: string | null = null;
          try {
            const cleanupResult = await manageDaemonService({
              action: "stop",
              mode: ownerMode,
              apply: true,
            }, req);
            const stopped = cleanupResult.manager.active === false
              && (cleanupResult.manager.state === "stopped" || cleanupResult.manager.state === "not-installed");
            if (!stopped) {
              cleanupFailure = cleanupResult.manager.errorMessage
                || `bootstrap cleanup returned state ${cleanupResult.manager.state}`;
            }
          } catch (error) {
            cleanupFailure = error instanceof Error ? error.message : String(error);
          }
          applyError = new Error(
            cleanupFailure
              ? `${startFailure} Bootstrap cleanup failed: ${cleanupFailure}`
              : startFailure,
          );
        }
      }
    } catch (error) {
      applyError = error;
    }
    const reload = bootstrapReload ?? (applyError
      ? failedReload(payload.reloadMode || "when-idle", applyError)
      : applyResult?.reload ?? failedReload(
          payload.reloadMode || "when-idle",
          "Channel daemon reload returned no status.",
        ));
    const accepted = reload.status === "applied"
      || reload.status === "pending"
      || reload.status === "restart-required";
    let rolledBack = false;
    let rollbackReload: ChannelConnectorsDaemonReloadResponse | null = null;
    if (
      !accepted &&
      payload.rollbackOnFailure !== false &&
      (runtimeBefore.reachable || applyError !== null)
    ) {
      if (previousRaw === null) fs.rmSync(resolvedPaths.nativeConfigPath, { force: true });
      else writeSecretTextAtomic(resolvedPaths.nativeConfigPath, previousRaw);
      if (previousDaemonRaw === null) fs.rmSync(resolvedPaths.configPath, { force: true });
      else writeSecretTextAtomic(resolvedPaths.configPath, previousDaemonRaw);
      if (runtimeBefore.reachable) {
        try {
          const rollbackResult = await manageDaemonService({
            action: "reload",
            mode: ownerMode,
            apply: true,
            reloadMode: "immediate",
          }, req);
          rollbackReload = rollbackResult.reload ?? failedReload(
            "immediate",
            "Channel daemon rollback reload returned no status.",
          );
        } catch (error) {
          rollbackReload = failedReload("immediate", error);
        }
      }
      if (previousDaemonRaw === null) fs.rmSync(resolvedPaths.configPath, { force: true });
      else writeSecretTextAtomic(resolvedPaths.configPath, previousDaemonRaw);
      rolledBack = true;
    }
    const effective = readV3Snapshot(config, resolvedPaths, now());
    return {
      ok: accepted,
      checkedAt: now().toISOString(),
      accepted,
      persisted: !rolledBack,
      rolledBack,
      config: redactV3Config(effective.config),
      revision: effective.revision,
      reload,
      rollbackReload,
      error: accepted
        ? null
        : [
            reload.error || "Channel daemon reload failed.",
            rollbackReload && !rollbackReload.ok
              ? `Rollback reload failed: ${rollbackReload.error || "unknown error"}`
              : null,
          ].filter(Boolean).join(" "),
    };
  }

  function mutateV3Config(
    mutate: (candidate: ChannelConnectorsV3Config) => void,
  ): ChannelConnectorsV3ConfigResponse {
    const resolvedPaths = paths();
    const current = readV3Snapshot(config, resolvedPaths, now()).config;
    const candidate = structuredClone(current);
    mutate(candidate);
    writeV3Config(config, resolvedPaths, candidate, now());
    return currentV3Config();
  }

  function upsertV3Account(account: ChannelConnectorAccount): ChannelConnectorsV3ConfigResponse {
    return mutateV3Config((candidate) => {
      const index = candidate.accounts.findIndex((item) => item.id === account.id);
      if (index >= 0) {
        const previous = candidate.accounts[index];
        candidate.accounts[index] = {
          ...account,
          credentials: restoreRedactedSensitiveMetadata(
            previous.credentials,
            account.credentials,
          ) as Record<string, unknown>,
          transport: restoreRedactedSensitiveMetadata(
            previous.transport,
            account.transport,
          ) as Record<string, unknown>,
          advanced: restoreRedactedSensitiveMetadata(
            previous.advanced,
            account.advanced,
          ) as Record<string, unknown>,
        };
      }
      else candidate.accounts.push(account);
    });
  }

  function deleteV3Account(accountId: string): ChannelConnectorsV3ConfigResponse {
    const id = normalizeString(accountId);
    return mutateV3Config((candidate) => {
      candidate.accounts = candidate.accounts.filter((account) => account.id !== id);
      candidate.deliveryPolicies = candidate.deliveryPolicies.filter((policy) => policy.accountRef !== id);
    });
  }

  function upsertV3Target(target: ChannelConnectorDeliveryTarget): ChannelConnectorsV3ConfigResponse {
    return mutateV3Config((candidate) => {
      const index = candidate.targets.findIndex((item) => item.id === target.id);
      if (index >= 0) candidate.targets[index] = target;
      else candidate.targets.push(target);
    });
  }

  function deleteV3Target(targetId: string): ChannelConnectorsV3ConfigResponse {
    const id = normalizeString(targetId);
    return mutateV3Config((candidate) => {
      candidate.targets = candidate.targets.filter((target) => target.id !== id);
    });
  }

  function upsertV3Policy(policy: ChannelConnectorDeliveryPolicy): ChannelConnectorsV3ConfigResponse {
    return mutateV3Config((candidate) => {
      const index = candidate.deliveryPolicies.findIndex((item) => item.id === policy.id);
      if (index >= 0) candidate.deliveryPolicies[index] = policy;
      else candidate.deliveryPolicies.push(policy);
    });
  }

  function deleteV3Policy(policyId: string): ChannelConnectorsV3ConfigResponse {
    const id = normalizeString(policyId);
    return mutateV3Config((candidate) => {
      candidate.deliveryPolicies = candidate.deliveryPolicies.filter((policy) => policy.id !== id);
    });
  }

  function previewV3Routing(
    payload: ChannelConnectorV3RoutingPreviewRequest = {},
  ): ChannelConnectorV3RoutingPreviewResponse {
    if (!payload.context) throw new Error("Channel Connectors routing preview context is required.");
    const snapshot = readV3Snapshot(config, paths(), now()).config;
    const candidate = payload.config
      ? prepareV3Candidate(payload.config, snapshot)
      : snapshot;
    assertChannelConnectorsV3Config(candidate);
    return {
      ok: true,
      checkedAt: now().toISOString(),
      result: resolveChannelConnectorDelivery(candidate, payload.context),
    };
  }

  function getAccountSecrets(accountId: string): ChannelConnectorAccountSecretsResponse {
    const id = normalizeString(accountId);
    if (!id) throw new Error("Channel Connectors account id is required.");
    const account = readV3Snapshot(config, paths(), now()).config.accounts.find((item) => item.id === id);
    if (!account) throw new Error(`Channel Connectors account not found: ${id}`);
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(account.credentials)) {
      const secret = normalizeString(value);
      if (secret) secrets[key] = secret;
    }
    return {
      ok: true,
      checkedAt: now().toISOString(),
      accountId: id,
      secrets,
    };
  }

  function feishuRegistrationTerminal(status: ChannelConnectorFeishuAppRegistrationStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired";
  }

  function cleanupFeishuAppRegistrationSessions(): void {
    const nowMs = now().getTime();
    for (const [sessionId, session] of feishuAppRegistrationSessions) {
      if (
        session.expiresAtMs !== null
        && nowMs > session.expiresAtMs + 5_000
        && !feishuRegistrationTerminal(session.status)
      ) {
        session.status = "expired";
        session.error = "QR code expired.";
        session.updatedAtMs = nowMs;
        session.abortController.abort();
      }
      if (feishuRegistrationTerminal(session.status) && nowMs - session.updatedAtMs > 10 * 60_000) {
        feishuAppRegistrationSessions.delete(sessionId);
      }
    }
  }

  function feishuAppRegistrationResponse(
    session: FeishuAppRegistrationSession,
  ): ChannelConnectorFeishuAppRegistrationSessionResponse {
    return {
      ok: true,
      checkedAt: now().toISOString(),
      sessionId: session.sessionId,
      status: session.status,
      tenant: session.tenant,
      qrUrl: session.qrUrl,
      expiresAt: session.expiresAtMs === null ? null : new Date(session.expiresAtMs).toISOString(),
      intervalSeconds: session.intervalSeconds,
      result: session.result,
      error: session.error,
    };
  }

  function getFeishuAppRegistration(sessionId: string): ChannelConnectorFeishuAppRegistrationSessionResponse {
    cleanupFeishuAppRegistrationSessions();
    const id = normalizeString(sessionId);
    if (!id) throw new Error("Feishu registration session id is required.");
    const session = feishuAppRegistrationSessions.get(id);
    if (!session) throw new Error(`Feishu registration session not found: ${id}`);
    return feishuAppRegistrationResponse(session);
  }

  function cancelFeishuAppRegistration(sessionId: string): ChannelConnectorFeishuAppRegistrationSessionResponse {
    cleanupFeishuAppRegistrationSessions();
    const id = normalizeString(sessionId);
    if (!id) throw new Error("Feishu registration session id is required.");
    const session = feishuAppRegistrationSessions.get(id);
    if (!session) throw new Error(`Feishu registration session not found: ${id}`);
    if (!feishuRegistrationTerminal(session.status)) {
      session.status = "cancelled";
      session.error = null;
      session.updatedAtMs = now().getTime();
      session.abortController.abort();
    }
    return feishuAppRegistrationResponse(session);
  }

  async function startFeishuAppRegistration(
    payload: ChannelConnectorFeishuAppRegistrationStartRequest = {},
  ): Promise<ChannelConnectorFeishuAppRegistrationSessionResponse> {
    cleanupFeishuAppRegistrationSessions();
    const requestedTenant = normalizeFeishuRegistrationTenant(payload.tenant);
    const sessionId = randomUUID();
    const abortController = new AbortController();
    const nowMs = now().getTime();
    const session: FeishuAppRegistrationSession = {
      sessionId,
      tenant: requestedTenant,
      status: "polling",
      qrUrl: null,
      expiresAtMs: null,
      intervalSeconds: null,
      result: null,
      error: null,
      abortController,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    feishuAppRegistrationSessions.set(sessionId, session);

    let qrReady = false;
    let resolveQrReady: (() => void) | null = null;
    let rejectQrReady: ((error: unknown) => void) | null = null;
    const qrReadyPromise = new Promise<void>((resolve, reject) => {
      resolveQrReady = resolve;
      rejectQrReady = reject;
    });

    const registrationPromise = registerFeishuApp({
      domain: feishuRegistrationDomain(requestedTenant),
      larkDomain: feishuRegistrationDomain("lark"),
      source: "tracevane-channel-connectors",
      signal: abortController.signal,
      appPreset: {
        name: normalizeString(payload.appName, "Tracevane Agent"),
        desc: normalizeString(payload.appDescription, "Tracevane local coding agent bridge."),
      },
      onQRCodeReady(info) {
        qrReady = true;
        session.status = "qr-ready";
        session.qrUrl = info.url;
        session.expiresAtMs = now().getTime() + Math.max(1, info.expireIn) * 1000;
        session.updatedAtMs = now().getTime();
        resolveQrReady?.();
      },
      onStatusChange(info) {
        if (feishuRegistrationTerminal(session.status)) return;
        if (info.status === "slow_down") {
          session.status = "slow-down";
          session.intervalSeconds = typeof info.interval === "number" ? info.interval : session.intervalSeconds;
        } else if (info.status === "domain_switched") {
          session.status = "domain-switched";
          session.tenant = "lark";
        } else {
          session.status = "polling";
        }
        session.updatedAtMs = now().getTime();
      },
    });

    void registrationPromise.then((result) => {
      const tenant = result.user_info?.tenant_brand === "lark" ? "lark" : "feishu";
      session.tenant = tenant;
      session.status = "succeeded";
      session.result = {
        appId: result.client_id,
        appSecret: result.client_secret,
        tenant,
        apiUrl: feishuRegistrationApiUrl(tenant),
        userOpenId: normalizeString(result.user_info?.open_id) || null,
      };
      session.error = null;
      session.updatedAtMs = now().getTime();
    }).catch((error: unknown) => {
      if (session.status === "cancelled" || session.status === "expired") return;
      const code = typeof error === "object" && error ? normalizeString((error as { code?: unknown }).code) : "";
      session.status = code === "expired_token" ? "expired" : "failed";
      session.error = feishuRegistrationErrorMessage(error);
      session.updatedAtMs = now().getTime();
      if (!qrReady) rejectQrReady?.(error);
    });

    try {
      await qrReadyPromise;
    } catch (error) {
      feishuAppRegistrationSessions.delete(sessionId);
      throw new Error(feishuRegistrationErrorMessage(error));
    }

    return feishuAppRegistrationResponse(session);
  }

  async function getCommandSurface(payload: ChannelConnectorCommandSurfaceRequest = {}): Promise<ChannelConnectorCommandSurfaceResponse> {
    const request = normalizeCommandSurfaceRequest(payload);
    const resolvedPaths = paths();
    const checkedAt = now().toISOString();
    const nativeConfig = readRuntimeAdapterCatalog(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(readV3Snapshot(config, resolvedPaths, now()).config, resolvedPaths);
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
    const visionModels = await visionModelsForCommandSurface({
      runtimeConfig,
      project: resolved.project,
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
      visionModels,
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
    const nativeConfig = readRuntimeAdapterCatalog(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(readV3Snapshot(config, resolvedPaths, now()).config, resolvedPaths);
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
    const commandVisionModels = await visionModelsForCommandSurface({
      runtimeConfig,
      project: resolved.project,
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
        runOctoManagement: (input) => runOctoManagementForBinding(resolved.binding, input),
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
          messageSeq: typeof request.messageSeq === "number" && Number.isFinite(request.messageSeq) ? request.messageSeq : null,
          fromUid: request.fromUid || "",
          channelId: request.channelId || request.fromUid || sessionKey,
          channelType: request.channelType === 1 || request.channelType === 2 || request.channelType === 5
            ? request.channelType
            : 1,
          timestamp: Date.now(),
          payload: {
            type: 1,
            content: command,
          },
          members: [],
        },
      });
    const effectiveNativeConfig = request.dryRun === true || commandResult.ok === false
      ? nativeConfig
      : applyChannelConnectorBindingMetadataPatch(
        config,
        resolvedPaths,
        nativeConfig,
        resolved.binding.id,
        commandResult.bindingMetadataPatch,
        now(),
      );
    const effectiveRuntimeConfig = effectiveNativeConfig === nativeConfig
      ? runtimeConfig
      : buildRuntimeConfig(readV3Snapshot(config, resolvedPaths, now()).config, resolvedPaths);
    const effectiveResolved = effectiveNativeConfig === nativeConfig
      ? resolved
      : resolveRuntimeBindingById(effectiveNativeConfig, effectiveRuntimeConfig, bindingId) || resolved;
    const selectedSectionId = parsedAction.targetSectionId
      || channelConnectorCommandSurfaceSectionFromCommand(command)
      || normalizeChannelConnectorCommandSurfaceSection(request.eventKey)
      || null;
    const selectedViewId = parsedAction.targetViewId
      || channelConnectorCommandSurfaceViewFromCommand(command, parsedAction.actionKind)
      || normalizeChannelConnectorCommandSurfaceView(request.view)
      || normalizeChannelConnectorCommandSurfaceView(request.eventKey)
      || null;
    const workdirSurfaceState = channelConnectorWorkdirSurfaceStateFromCommand(command);
    const control = getChannelConnectorSessionControl(controlsPath, {
      bindingId: effectiveResolved.binding.id,
      sessionKey,
    });
    const readOnlyState = commandSurfaceReadOnlyState({
      runtimeConfig: effectiveRuntimeConfig,
      project: effectiveResolved.project,
      binding: effectiveResolved.runtimeBinding,
      control,
      sessionKey,
    });
    const surface = buildChannelConnectorCommandSurface({
      config: effectiveRuntimeConfig,
      project: effectiveResolved.project,
      binding: effectiveResolved.runtimeBinding,
      control,
      sessionKey,
      models: commandModels,
      visionModels: commandVisionModels,
      agentSession: readOnlyState.agentSession,
      sessionList: readOnlyState.sessionList,
      history: readOnlyState.history,
      customCommands: readOnlyState.customCommands,
      skills: readOnlyState.skills,
      selectedSectionId,
      selectedViewId,
      workDirPage: workdirSurfaceState.page,
      workDirSearch: workdirSurfaceState.search,
    });

    return {
      ok: true,
      checkedAt,
      accepted: true,
      skippedReason: null,
      binding: effectiveResolved.binding,
      agentProfile: effectiveResolved.agentProfile,
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
    const nativeConfig = readRuntimeAdapterCatalog(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(readV3Snapshot(config, resolvedPaths, now()).config, resolvedPaths);
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
      agent: resolved?.project.agent || null,
      model: resolved?.project.model || null,
      workDir: resolved?.project.workDir || null,
      gatewayEndpoint: resolved?.project.gatewayEndpoint || null,
      gatewayKeyRef: resolved?.project.gatewayKeyRef || null,
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
        || "Tracevane command accepted.";
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
    const botMentionCandidates = channelConnectorFeishuBotMentionCandidates(resolved.binding);
    let effectiveText = normalizeFeishuWebhookCommandText(
      normalizeFeishuMessageTextForBot(parsed.text, parsed.mentions, botMentionCandidates),
    );
    const directed = isChannelConnectorFeishuMessageDirected(parsed, botMentionCandidates, effectiveText);
    const aliasResolution = resolveChannelConnectorBindingCommandAlias(
      resolved.runtimeBinding,
      effectiveText,
      commandSurfaceCommandAliasesPath(runtimeConfig),
    );
    effectiveText = aliasResolution.content;
    if (!effectiveText) return skipped("feishu_message_text_missing");
    if (!directed) return skipped("feishu_group_message_not_directed");

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
        directed,
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
    const nativeConfig = readRuntimeAdapterCatalog(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(readV3Snapshot(config, resolvedPaths, now()).config, resolvedPaths);
    const resolved = resolveRuntimeBindingForPlatform(nativeConfig, runtimeConfig, "feishu", request.bindingId, null);
    const binding = request.binding ?? resolved?.binding ?? null;
    const checkedAt = now().toISOString();
    if (!binding) {
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
    const transportConfig = feishuTransportFromBinding(binding);
    if (!transportConfig) {
      return {
        ok: true,
        checkedAt,
        adapter: "feishu",
        binding: redactPlatformBinding(binding),
        transport: {
          ...emptyFeishuTransportResult(request.action || "tenant-token"),
          error: "feishu_transport_config_missing",
        },
      };
    }

    let transport: ChannelConnectorFeishuTransportResult;
    if (request.action === "send-message") {
      if (!request.channelId && !request.receiveId) throw new Error("channelId or receiveId is required for Feishu send-message smoke.");
      transport = await sendFeishuTextMessage(transportConfig, {
        chatId: request.channelId,
        receiveId: request.receiveId,
        receiveIdType: request.receiveIdType,
        content: request.content || "Tracevane Feishu transport smoke",
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "send-post") {
      if (!request.channelId && !request.receiveId) throw new Error("channelId or receiveId is required for Feishu send-post smoke.");
      transport = await sendFeishuPostMessage(transportConfig, {
        chatId: request.channelId,
        receiveId: request.receiveId,
        receiveIdType: request.receiveIdType,
        content: request.content || "**Tracevane Feishu post smoke**\n\n```text\nmarkdown\n```",
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "send-card") {
      if (!request.channelId) throw new Error("channelId is required for Feishu send-card smoke.");
      transport = await sendFeishuCardMessage(transportConfig, {
        chatId: request.channelId,
        card: {
          config: { wide_screen_mode: true },
          header: {
            title: { tag: "plain_text", content: "Tracevane Feishu command menu smoke" },
            template: "blue",
          },
          elements: [
            {
              tag: "markdown",
              content: request.content || "Tracevane Feishu command menu smoke",
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
            title: { tag: "plain_text", content: "Tracevane Feishu transport smoke" },
            template: "blue",
          },
          elements: [
            {
              tag: "markdown",
              content: request.content || "Tracevane Feishu transport smoke",
            },
          ],
        },
      }, resolvedPaths.feishuTokenCacheFile);
    } else if (request.action === "upload-and-send-media") {
      if (!request.channelId) throw new Error("channelId is required for Feishu upload-and-send-media smoke.");
      const content = request.content || "Tracevane Feishu upload and send smoke\n";
      transport = await uploadAndSendFeishuMedia(transportConfig, {
        chatId: request.channelId,
        data: Buffer.from(content, "utf8"),
        fileName: request.fileName || "tracevane-feishu-smoke.md",
        mimeType: request.mimeType || "text/markdown",
      }, resolvedPaths.feishuTokenCacheFile);
    } else {
      transport = await smokeFeishuTenantToken(transportConfig, resolvedPaths.feishuTokenCacheFile);
    }

    return {
      ok: true,
      checkedAt,
      adapter: "feishu",
      binding: redactPlatformBinding(binding),
      transport,
    };
  }

  async function dispatchOctoIncoming(payload?: ChannelConnectorOctoInboundRequest): Promise<ChannelConnectorOctoDispatchResponse> {
    const request = validateOctoInboundRequest(payload);
    const resolvedPaths = paths();
    const checkedAt = now().toISOString();
    const nativeConfig = readRuntimeAdapterCatalog(config, resolvedPaths, now());
    const runtimeConfig = buildRuntimeConfig(readV3Snapshot(config, resolvedPaths, now()).config, resolvedPaths);
    const resolved = resolveOctoBinding(request, nativeConfig.platformBindings, nativeConfig.agentProfiles);
    const runtimeResolved = resolved ? resolveRuntimeBindingById(nativeConfig, runtimeConfig, resolved.binding.id) : null;
    const skippedReason = shouldSkipOctoMessage(request, resolved);
    if (skippedReason) {
      return buildSkippedOctoResponse(checkedAt, request, skippedReason, resolvedPaths.octoEventLogFile, resolved);
    }
    if (!resolved) throw new Error("Octo binding resolution invariant failed.");

    let message = request.message;
    const binding = resolved.binding;
    const agentProfile = resolved.agentProfile;
    const runtimeProject = runtimeResolved?.project ?? {
      agent: agentProfile.agent,
      model: agentProfile.model,
      workDir: agentProfile.workDir,
      gatewayEndpoint: agentProfile.gatewayEndpoint,
      gatewayKeyRef: agentProfile.gatewayKeyRef,
    };
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
    const personaRouting = resolveOctoPersonaRouting(message, binding);
    message = applyOctoPersonaRouting(message, personaRouting);
    const sessionKey = buildOctoSessionKey(message);
    const content = extractOctoContent(message);
    const attachments = extractOctoAttachments(message);
    const directed = isOctoMessageDirectedAtBot(message, binding.botId, octoOnBehalfOfFromBinding(binding));
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
        channelType: message.channelType,
        messageId: message.messageId,
        messageSeq: message.messageSeq || null,
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
        agent: runtimeProject.agent,
        model: runtimeProject.model,
        workDir: runtimeProject.workDir,
        gatewayEndpoint: runtimeProject.gatewayEndpoint,
        gatewayKeyRef: runtimeProject.gatewayKeyRef,
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
    const nativeConfig = readRuntimeAdapterCatalog(config, paths(), now());
    const resolved = resolveOctoBindingById(nativeConfig, request.bindingId);
    const binding = request.binding ?? resolved?.binding ?? null;
    const checkedAt = now().toISOString();
    if (!binding) {
      return {
        ok: true,
        checkedAt,
        adapter: "octo",
        binding: null,
        transport: {
          ...emptyOctoTransportResult(octoTransportSmokeResultAction(request.action)),
          error: "octo_binding_not_found",
        },
      };
    }
    const transportConfig = octoTransportFromBinding(binding);
    if (!transportConfig) {
      return {
        ok: true,
        checkedAt,
        adapter: "octo",
        binding: redactPlatformBinding(binding),
        transport: {
          ...emptyOctoTransportResult(octoTransportSmokeResultAction(request.action)),
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
        chunks: [request.content || "Tracevane Octo transport smoke"],
        mentionUids: [],
        mentionEntities: [],
        payloads: [
          {
            channel_id: request.channelId,
            channel_type: request.channelType || 1,
            payload: {
              type: 1 as const,
              content: request.content || "Tracevane Octo transport smoke",
            },
          },
        ],
      };
      transport = await sendOctoTextReply(transportConfig, replyPlan);
    } else if (request.action === "upload-file") {
      const content = request.content || "Tracevane Octo upload smoke\n";
      transport = await uploadOctoFile(transportConfig, {
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "tracevane-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "direct-upload-file") {
      const content = request.content || "Tracevane Octo direct upload smoke\n";
      transport = await directUploadOctoFile(transportConfig, {
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "tracevane-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "upload-credentials") {
      transport = await getOctoUploadCredentials(transportConfig, {
        fileName: request.fileName || "tracevane-octo-smoke.txt",
      });
    } else if (request.action === "direct-upload-and-send-media") {
      if (!request.channelId) throw new Error("channelId is required for Octo direct-upload-and-send-media smoke.");
      const content = request.content || "Tracevane Octo direct upload and send smoke\n";
      transport = await directUploadAndSendOctoMedia(transportConfig, {
        channelId: request.channelId,
        channelType: request.channelType || 1,
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "tracevane-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "upload-and-send-media") {
      if (!request.channelId) throw new Error("channelId is required for Octo upload-and-send-media smoke.");
      const content = request.content || "Tracevane Octo upload and send smoke\n";
      transport = await uploadAndSendOctoMedia(transportConfig, {
        channelId: request.channelId,
        channelType: request.channelType || 1,
        data: new TextEncoder().encode(content),
        fileName: request.fileName || "tracevane-octo-smoke.txt",
        mimeType: request.mimeType || "text/plain",
      });
    } else if (request.action === "read-receipt") {
      if (!request.channelId) throw new Error("channelId is required for Octo read-receipt smoke.");
      transport = await sendOctoReadReceipt(transportConfig, {
        channelId: request.channelId,
        channelType: request.channelType || 1,
      });
    } else if (request.action === "list-groups") {
      transport = await listOctoGroups(transportConfig);
    } else if (request.action === "group-info") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo group-info smoke.");
      transport = await getOctoGroupInfo(transportConfig, request.groupNo);
    } else if (request.action === "group-members") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo group-members smoke.");
      transport = await listOctoGroupMembers(transportConfig, request.groupNo);
    } else if (request.action === "group-md-read") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo group-md-read smoke.");
      transport = await readOctoGroupMd(transportConfig, request.groupNo);
    } else if (request.action === "group-md-update") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo group-md-update smoke.");
      transport = await updateOctoGroupMd(transportConfig, {
        groupNo: request.groupNo,
        content: request.content || "",
      });
    } else if (request.action === "voice-context-read") {
      transport = await readOctoVoiceContext(transportConfig);
    } else if (request.action === "voice-context-update") {
      if (!request.content) throw new Error("content is required for Octo voice-context-update smoke.");
      transport = await updateOctoVoiceContext(transportConfig, {
        content: request.content,
      });
    } else if (request.action === "voice-context-delete") {
      transport = await deleteOctoVoiceContext(transportConfig);
    } else if (request.action === "space-members" || request.action === "search-members") {
      transport = await searchOctoSpaceMembers(transportConfig, {
        keyword: request.keyword || "",
        limit: request.limit || 50,
        spaceId: request.spaceId || null,
      });
    } else if (request.action === "create-group") {
      if (!request.creator) throw new Error("creator is required for Octo create-group smoke.");
      if (!request.members?.length) throw new Error("members are required for Octo create-group smoke.");
      transport = await createOctoGroup(transportConfig, {
        name: request.name || null,
        members: request.members,
        creator: request.creator,
        spaceId: request.spaceId || null,
      });
    } else if (request.action === "update-group") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo update-group smoke.");
      transport = await updateOctoGroupInfo(transportConfig, {
        groupNo: request.groupNo,
        name: request.name || null,
        notice: request.notice || null,
      });
    } else if (request.action === "add-group-members" || request.action === "add-members") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo add-members smoke.");
      if (!request.members?.length) throw new Error("members are required for Octo add-members smoke.");
      transport = await addOctoGroupMembers(transportConfig, {
        groupNo: request.groupNo,
        members: request.members,
      });
    } else if (request.action === "remove-group-members" || request.action === "remove-members") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo remove-members smoke.");
      if (!request.members?.length) throw new Error("members are required for Octo remove-members smoke.");
      transport = await removeOctoGroupMembers(transportConfig, {
        groupNo: request.groupNo,
        members: request.members,
      });
    } else if (request.action === "list-threads") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo list-threads smoke.");
      transport = await listOctoThreads(transportConfig, request.groupNo);
    } else if (request.action === "thread-info" || request.action === "get-thread") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo thread-info smoke.");
      transport = await getOctoThreadInfo(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
      });
    } else if (request.action === "thread-members" || request.action === "list-thread-members") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo thread-members smoke.");
      transport = await listOctoThreadMembers(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
      });
    } else if (request.action === "thread-md-read") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo thread-md-read smoke.");
      transport = await readOctoThreadMd(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
      });
    } else if (request.action === "thread-md-update") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo thread-md-update smoke.");
      transport = await updateOctoThreadMd(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
        content: request.content || "",
      });
    } else if (request.action === "create-thread") {
      if (!request.groupNo) throw new Error("groupNo is required for Octo create-thread smoke.");
      transport = await createOctoThread(transportConfig, {
        groupNo: request.groupNo,
        name: request.name || "Tracevane Thread Smoke",
      });
    } else if (request.action === "delete-thread") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo delete-thread smoke.");
      transport = await deleteOctoThread(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
      });
    } else if (request.action === "join-thread") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo join-thread smoke.");
      transport = await joinOctoThread(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
      });
    } else if (request.action === "leave-thread") {
      if (!request.groupNo || !request.shortId) throw new Error("groupNo and shortId are required for Octo leave-thread smoke.");
      transport = await leaveOctoThread(transportConfig, {
        groupNo: request.groupNo,
        shortId: request.shortId,
      });
    } else if (request.action === "event-ack") {
      if (request.eventId === null || request.eventId === undefined) throw new Error("eventId is required for Octo event-ack smoke.");
      transport = await ackOctoEvent(transportConfig, request.eventId);
    } else if (request.action === "sync-messages" || request.action === "history") {
      if (!request.channelId) throw new Error("channelId is required for Octo history smoke.");
      transport = await syncOctoMessages(transportConfig, {
        channelId: request.channelId,
        channelType: request.channelType || 1,
        limit: request.limit || 50,
        startMessageSeq: request.startMessageSeq || 0,
        endMessageSeq: request.endMessageSeq || 0,
        pullMode: request.pullMode ?? 1,
      });
    } else if (request.action === "file-download-url") {
      if (!request.filePath) throw new Error("filePath is required for Octo file-download-url smoke.");
      transport = await getOctoFileDownloadUrl(transportConfig, {
        filePath: request.filePath,
        fileName: request.fileName || null,
      });
    } else if (request.action === "message-edit") {
      if (!request.messageId || !request.content) throw new Error("messageId and content are required for Octo message-edit smoke.");
      transport = await editOctoMessage(transportConfig, {
        messageId: request.messageId,
        content: request.content,
      });
    } else {
      transport = await registerOctoBot(transportConfig, false);
    }
    return {
      ok: true,
      checkedAt,
      adapter: "octo",
      binding: redactPlatformBinding(binding),
      transport,
    };
  }

  async function response(
    input: {
      action: ChannelConnectorsDaemonAction;
      managed: ManageServiceResponse;
      applied?: boolean;
      configWritten?: boolean;
      reload?: ChannelConnectorsDaemonReloadResponse | null;
      skippedReason?: string | null;
      diagnostics?: string[];
    },
  ): Promise<ChannelConnectorsDaemonResponse> {
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const configPreview = currentConfigFull();
    const manager = input.managed.manager;
    const commandsRun = input.managed.commands.map(compatibilityCommandResult);
    const reload = input.reload || null;
    const serviceManager = compatibilityServiceManager(manager);
    return {
      ok: !input.skippedReason && input.managed.ok && (reload?.ok ?? true),
      checkedAt: now().toISOString(),
      action: input.action,
      applied: input.applied === true,
      templateWritten: input.managed.templateWritten,
      configWritten: input.configWritten === true,
      templateCurrent: input.managed.configCurrent,
      configCurrent: isConfigCurrent(configPreview),
      installed: manager.installed,
      skippedReason: input.skippedReason || null,
      plan,
      config: redactConfigResponse(configPreview),
      commandsRun,
      manager,
      serviceManager,
      reload,
      diagnostics: input.diagnostics || [],
    };
  }

  async function getDaemonService(): Promise<ChannelConnectorsDaemonResponse> {
    const definition = createChannelConnectorsServiceDefinition(config, options);
    const managed = await daemonServiceManager.manage(definition, {
      action: "status",
      mode: "session",
      apply: true,
    });
    return response({
      action: "status",
      managed,
    });
  }

  async function manageDaemonService(
    payload: ChannelConnectorsDaemonRequest = {},
    req?: http.IncomingMessage,
  ): Promise<ChannelConnectorsDaemonResponse> {
    assertTrustedManagementRequest(config, req);
    const action = normalizeAction(payload.action);
    const mode = normalizeDaemonServiceMode(payload.mode);
    const apply = action === "status" && payload.apply === undefined && payload.runCommands === undefined
      ? true
      : normalizeDaemonServiceApply(payload);
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const definition = createChannelConnectorsServiceDefinition(config, options);
    const commonAction = commonDaemonAction(action);
    const diagnostics: string[] = [];
    const requiresEntry = commonAction !== null &&
      commonAction !== "preview" &&
      commonAction !== "status" &&
      commonAction !== "stop" &&
      commonAction !== "uninstall";
    if (requiresEntry && !fs.existsSync(plan.daemonEntry)) {
      diagnostics.push("Run npm run build:api before installing or starting the native Channel Connectors daemon.");
      const managed = await daemonServiceManager.manage(definition, {
        action: "status",
        mode,
        apply: false,
      });
      return response({
        action,
        managed: { ...managed, ok: false, action: commonAction },
        skippedReason: "native_daemon_entry_missing",
        diagnostics,
      });
    }

    const configPreview = currentConfigFull();
    let configWritten = false;
    if (shouldPreparePrivateConfig(action, apply)) {
      fs.mkdirSync(plan.rootDir, { recursive: true });
      fs.mkdirSync(plan.stateDir, { recursive: true });
      fs.mkdirSync(path.dirname(plan.logFile), { recursive: true });
      if (!isConfigCurrent(configPreview)) {
        writeSecretTextAtomic(configPreview.configPath, configPreview.preview);
        configWritten = true;
      }
    }

    if (action === "reload") {
      const status = await daemonServiceManager.manage(definition, {
        action: "status",
        mode,
        apply,
      });
      if (!apply) {
        return response({
          action,
          managed: status,
          configWritten,
          diagnostics,
        });
      }
      if (status.manager.state !== "running") {
        return response({
          action,
          managed: { ...status, ok: false },
          configWritten,
          skippedReason: "daemon_not_running",
          diagnostics,
        });
      }
      const reload = await requestDaemonReload(
        { mode: payload.reloadMode || "when-idle" },
        fetchImpl,
        managementEndpoint(options.managementEndpoint),
        managementToken,
      );
      return response({
        action,
        managed: status,
        applied: configWritten || reload.status === "applied" || reload.status === "pending",
        configWritten,
        reload,
        diagnostics,
      });
    }

    const managed = await daemonServiceManager.manage(definition, {
      action: commonAction!,
      mode,
      apply,
    });
    return response({
      action,
      managed,
      applied: configWritten || managed.templateWritten || managed.commands.length > 0 ||
        (mode === "session" && apply && mutatesSessionOwner(commonAction!)),
      configWritten,
      diagnostics,
    });
  }

  async function getAgentSessions(): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
    try {
      return await requestDaemonAgentSessions(
        null,
        fetchImpl,
        managementEndpoint(options.managementEndpoint),
        managementToken,
      );
    } catch (error) {
      if (!isDaemonConnectionFailure(error)) throw error;
      const snapshot = currentV3Config();
      const policy = normalizeAgentSessionPolicy(snapshot.config.agentSessionPolicy);
      return {
        ok: true,
        checkedAt: now().toISOString(),
        defaultMode: "persistent",
        implementation: "native-cli-session-drivers",
        runtimeReachable: false,
        persistentDriverReady: false,
        unavailableReason: "daemon_unreachable",
        policy: {
          ...policy,
          activeTurns: 0,
          queuedTurns: 0,
          fallbackOnCrash: true,
        },
        requestedPersistentBindings: [],
        bindings: [],
        activeSessions: [],
        recentEvents: [],
      };
    }
  }

  async function manageAgentSessions(
    payload: ChannelConnectorAgentSessionActionRequest = {},
    req?: http.IncomingMessage,
  ): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
    assertTrustedManagementRequest(config, req);
    return requestDaemonAgentSessions(
      payload,
      fetchImpl,
      managementEndpoint(options.managementEndpoint),
      managementToken,
    );
  }

  async function getStatus(): Promise<ChannelConnectorsStatusResponse> {
    const service = await getDaemonService();
    const checkedAt = now().toISOString();
    const runtime = await requestDaemonRuntimeStatus(
      checkedAt,
      options.fetchImpl ?? fetch,
      managementEndpoint(options.managementEndpoint),
    );
    return {
      ok: true,
      checkedAt,
      phase: "native-config-f2",
      implementation: "tracevane-native",
      referenceSources: [
        "CC archived reference implementation",
        "OpenClaw channel/runtime behavior",
        "Tracevane Gateway daemon contract",
      ],
      runtimeChain: [
        "IM channel",
        "Tracevane native Channel daemon",
        "local CLI Agent bot",
        "Tracevane Gateway daemon",
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
        tracevaneRuntimeDependency: false,
        openclawRuntimeDependency: false,
        modelRelayOwner: "tracevane-gateway-daemon",
        channelDaemonOwner: "tracevane-native-channel-daemon",
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
    getV3Config: currentV3Config,
    planV3Config,
    saveV3Config,
    applyV3Config,
    upsertV3Account,
    deleteV3Account,
    upsertV3Target,
    deleteV3Target,
    upsertV3Policy,
    deleteV3Policy,
    previewV3Routing,
    getAccountSecrets,
    startFeishuAppRegistration,
    getFeishuAppRegistration,
    cancelFeishuAppRegistration,
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
