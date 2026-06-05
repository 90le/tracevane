import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  MODEL_GATEWAY_API_FORMATS,
  MODEL_GATEWAY_APP_SCOPES,
  MODEL_GATEWAY_AUTH_STRATEGIES,
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  MODEL_GATEWAY_PROVIDER_CATEGORIES,
  MODEL_GATEWAY_ROUTE_IDS,
  type ModelGatewayApiFormat,
  type ModelGatewayAppScope,
  type ModelGatewayAuthStrategy,
  type ModelGatewayDaemonBootstrapStatus,
  type ModelGatewayDaemonRuntimeMetadata,
  type ModelGatewayDaemonServiceAction,
  type ModelGatewayDaemonServiceCommand,
  type ModelGatewayDaemonServiceCommandResult,
  type ModelGatewayDaemonServiceManagerStatus,
  type ModelGatewayDaemonServicePlan,
  type ModelGatewayDaemonServiceRequest,
  type ModelGatewayDaemonServiceResponse,
  type ModelGatewayProvider,
  type ModelGatewayProviderCategory,
  type ModelGatewayProviderHealth,
  type ModelGatewayProviderInput,
  type ModelGatewayProviderModelCatalog,
  type ModelGatewayProviderNetwork,
  type ModelGatewayProviderTestRequest,
  type ModelGatewayProviderTestResponse,
  type ModelGatewayProviderView,
  type ModelGatewayProvidersResponse,
  type ModelGatewayRegistryState,
  type ModelGatewayRuntimeRequestLogEntry,
  type ModelGatewayRuntimeRequestOutcome,
  type ModelGatewayRuntimeResponse,
  type ModelGatewayRuntimeState,
  type ModelGatewayRouteDecision,
  type ModelGatewayRouteId,
  type ModelGatewayRouteMode,
  type ModelGatewaySecretState,
  type ModelGatewaySecretSummary,
  type ModelGatewaySetActiveProviderRequest,
  type ModelGatewaySetProviderSecretRequest,
  type ModelGatewayStatusResponse,
  type ModelGatewaySupervisorKind,
  type ModelGatewayUpsertProviderRequest,
} from "../../../../types/model-gateway.js";
import { sendJson, setCorsHeaders } from "../../core/http.js";
import { readJsonFile } from "../../core/state.js";
import { isStudioGatewayHttpAuthorized } from "../../gateway-http-auth.js";
import {
  AnthropicMessagesChatAdapterError,
  adaptAnthropicMessagesResponseToChatCompletion,
  adaptAnthropicMessagesRequestToChatCompletion,
  adaptChatCompletionResponseToAnthropicMessages,
  adaptChatCompletionRequestToAnthropicMessages,
  ensureAnthropicMessagesHeaders,
  isAnthropicMessagesToChatAdapterTarget,
  isAnthropicMessagesToOpenAIResponsesAdapterTarget,
  isChatToAnthropicMessagesAdapterTarget,
  isResponsesToAnthropicMessagesAdapterTarget,
} from "./anthropic-chat-adapter.js";
import {
  CodexResponsesChatAdapterError,
  adaptChatCompletionToCodexResponse,
  adaptCodexResponsesRequestToChat,
  isCodexResponsesToChatAdapterTarget,
  isCodexResponsesStreamingRequest,
} from "./codex-adapter.js";
import { CodexChatHistoryStore } from "./codex-history.js";
import { writeCodexResponsesSseFromChatSse } from "./codex-streaming.js";
import {
  writeAnthropicMessagesSseFromChatSse,
  writeAnthropicMessagesSseFromResponsesSse,
  writeChatCompletionsSseFromAnthropicMessagesSse,
  writeChatCompletionsSseFromResponsesSse,
  writeCodexResponsesSseFromAnthropicMessagesSse,
} from "./protocol-streaming.js";
import {
  OpenAIResponsesChatAdapterError,
  adaptChatCompletionRequestToResponses,
  adaptResponsesToChatCompletion,
  isChatToOpenAIResponsesAdapterTarget,
} from "./responses-chat-adapter.js";
import { createModelGatewayDaemonServicePlan } from "./supervisor.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_STREAMING_FIRST_BYTE_TIMEOUT_MS = 30_000;
const DEFAULT_STREAMING_IDLE_TIMEOUT_MS = 120_000;
const MAX_RUNTIME_REQUEST_LOG_ENTRIES = 200;
const REQUEST_LOG_PREVIEW_CHARS = 1_000;
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const DAEMON_SERVICE_ACTIONS = ["preview", "install", "ensure-running", "start", "stop", "restart", "status"] as const;

type HeaderMap = http.IncomingHttpHeaders | Record<string, string | string[] | undefined> | Headers;
type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };

const ROUTES: Record<ModelGatewayRouteId, {
  paths: string[];
  appScope: ModelGatewayAppScope;
  protocol: ModelGatewayApiFormat;
}> = {
  openai_chat_completions: {
    paths: ["/v1/chat/completions"],
    appScope: "openclaw",
    protocol: "openai_chat",
  },
  openai_responses: {
    paths: ["/v1/responses"],
    appScope: "codex",
    protocol: "openai_responses",
  },
  openai_responses_compact: {
    paths: ["/v1/responses/compact"],
    appScope: "codex",
    protocol: "openai_responses",
  },
  anthropic_messages: {
    paths: ["/v1/messages", "/claude/v1/messages"],
    appScope: "claude-code",
    protocol: "anthropic_messages",
  },
};

export interface ModelGatewayPaths {
  root: string;
  registry: string;
  secrets: string;
  runtime: string;
  daemonRuntime: string;
  daemonPid: string;
  portLock: string;
  codexHistory: string;
  backups: string;
  logs: string;
}

export class ModelGatewayServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "ModelGatewayServiceError";
  }

  toShape(): { code: string; message: string; statusCode: number } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export function isModelGatewayServiceError(error: unknown): error is ModelGatewayServiceError {
  return error instanceof ModelGatewayServiceError;
}

export function resolveModelGatewayPaths(config: StudioServerConfig): ModelGatewayPaths {
  const root = path.join(config.openclawRoot, "studio", "model-gateway");
  return {
    root,
    registry: path.join(root, "providers.json"),
    secrets: path.join(root, "secrets.json"),
    runtime: path.join(root, "runtime.json"),
    daemonRuntime: path.join(root, "daemon-runtime.json"),
    daemonPid: path.join(root, "daemon.pid"),
    portLock: path.join(root, "gateway-port.lock"),
    codexHistory: path.join(root, "codex-history.json"),
    backups: path.join(root, "backups"),
    logs: path.join(root, "logs"),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeId(value: unknown, fallback: string): string {
  const source = normalizeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return source || fallback;
}

function memberOrDefault<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function normalizeAppScopes(value: unknown): ModelGatewayAppScope[] {
  const requested = Array.isArray(value) ? value : [];
  const scopes = requested
    .filter((item): item is ModelGatewayAppScope => MODEL_GATEWAY_APP_SCOPES.includes(item as ModelGatewayAppScope));
  const unique = scopes.filter((item, index, list) => list.indexOf(item) === index);
  return unique.length ? unique : [...MODEL_GATEWAY_APP_SCOPES];
}

function normalizeExplicitAppScopes(value: unknown): ModelGatewayAppScope[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ModelGatewayAppScope => MODEL_GATEWAY_APP_SCOPES.includes(item as ModelGatewayAppScope))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeEndpointMap(value: unknown): Partial<Record<ModelGatewayRouteId, string>> {
  if (!isRecord(value)) return {};
  const endpoints: Partial<Record<ModelGatewayRouteId, string>> = {};
  for (const routeId of MODEL_GATEWAY_ROUTE_IDS) {
    const endpoint = normalizeString(value[routeId]);
    if (endpoint) endpoints[routeId] = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  }
  return endpoints;
}

function normalizeModelCatalog(value: unknown, fallback?: ModelGatewayProviderModelCatalog): ModelGatewayProviderModelCatalog {
  const source = isRecord(value) ? value : {};
  const models = Array.isArray(source.models)
    ? source.models
      .filter(isRecord)
      .map((model) => ({
        id: normalizeString(model.id),
        label: normalizeString(model.label) || undefined,
        contextWindow: typeof model.contextWindow === "number" ? model.contextWindow : null,
        maxOutputTokens: typeof model.maxOutputTokens === "number" ? model.maxOutputTokens : null,
        aliases: normalizeStringArray(model.aliases),
        features: isRecord(model.features) ? {
          streaming: typeof model.features.streaming === "boolean" ? model.features.streaming : undefined,
          tools: typeof model.features.tools === "boolean" ? model.features.tools : undefined,
          vision: typeof model.features.vision === "boolean" ? model.features.vision : undefined,
          reasoning: typeof model.features.reasoning === "boolean" ? model.features.reasoning : undefined,
          responses: typeof model.features.responses === "boolean" ? model.features.responses : undefined,
        } : undefined,
      }))
      .filter((model) => model.id)
    : fallback?.models || [];

  const aliases = isRecord(source.aliases)
    ? Object.fromEntries(
      Object.entries(source.aliases)
        .map(([key, item]) => [key.trim(), normalizeString(item)])
        .filter(([key, item]) => key && item),
    )
    : fallback?.aliases || {};

  const defaultModel = normalizeString(source.defaultModel, fallback?.defaultModel || models[0]?.id || "");
  return {
    defaultModel: defaultModel || null,
    models,
    aliases,
  };
}

function normalizeHealth(value: unknown, fallback?: ModelGatewayProviderHealth): ModelGatewayProviderHealth {
  const source = isRecord(value) ? value : {};
  return {
    circuitState: source.circuitState === "open" || source.circuitState === "half-open"
      ? source.circuitState
      : fallback?.circuitState || "closed",
    lastSuccessAt: normalizeString(source.lastSuccessAt, fallback?.lastSuccessAt || "") || null,
    lastFailureAt: normalizeString(source.lastFailureAt, fallback?.lastFailureAt || "") || null,
    lastLatencyMs: typeof source.lastLatencyMs === "number" ? source.lastLatencyMs : fallback?.lastLatencyMs || null,
    lastError: normalizeString(source.lastError, fallback?.lastError || "") || null,
    consecutiveFailures: typeof source.consecutiveFailures === "number"
      ? Math.max(0, Math.floor(source.consecutiveFailures))
      : fallback?.consecutiveFailures || 0,
  };
}

function normalizeNetwork(value: unknown, fallback?: ModelGatewayProviderNetwork): ModelGatewayProviderNetwork {
  const source = isRecord(value) ? value : {};
  return {
    proxyUrl: normalizeString(source.proxyUrl, fallback?.proxyUrl || "") || null,
    noProxy: normalizeStringArray(source.noProxy).length ? normalizeStringArray(source.noProxy) : fallback?.noProxy || [],
    tlsVerify: typeof source.tlsVerify === "boolean" ? source.tlsVerify : fallback?.tlsVerify ?? true,
    timeoutMs: typeof source.timeoutMs === "number" ? Math.max(1_000, Math.floor(source.timeoutMs)) : fallback?.timeoutMs || DEFAULT_TIMEOUT_MS,
    streamingFirstByteTimeoutMs: typeof source.streamingFirstByteTimeoutMs === "number"
      ? Math.max(1_000, Math.floor(source.streamingFirstByteTimeoutMs))
      : fallback?.streamingFirstByteTimeoutMs || DEFAULT_STREAMING_FIRST_BYTE_TIMEOUT_MS,
    streamingIdleTimeoutMs: typeof source.streamingIdleTimeoutMs === "number"
      ? Math.max(1_000, Math.floor(source.streamingIdleTimeoutMs))
      : fallback?.streamingIdleTimeoutMs || DEFAULT_STREAMING_IDLE_TIMEOUT_MS,
  };
}

function createEmptyRegistry(updatedAt = nowIso()): ModelGatewayRegistryState {
  return {
    version: 1,
    updatedAt,
    activeProviders: {},
    providers: [],
  };
}

function createEmptySecrets(updatedAt = nowIso()): ModelGatewaySecretState {
  return {
    version: 1,
    updatedAt,
    secrets: {},
  };
}

function createEmptyRuntime(updatedAt = nowIso()): ModelGatewayRuntimeState {
  return {
    version: 1,
    updatedAt,
    requestLog: [],
  };
}

function writeJsonSecureAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
}

function writeTextAtomic(filePath: string, value: string, mode = 0o644): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, value, { mode });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
}

function normalizeDaemonServiceAction(value: unknown): ModelGatewayDaemonServiceAction {
  return DAEMON_SERVICE_ACTIONS.includes(value as ModelGatewayDaemonServiceAction)
    ? value as ModelGatewayDaemonServiceAction
    : "preview";
}

async function runDefaultDaemonServiceCommand(command: ModelGatewayDaemonServiceCommand): Promise<ModelGatewayDaemonServiceCommandResult> {
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

export type ModelGatewayDaemonServiceCommandRunner = (
  command: ModelGatewayDaemonServiceCommand,
) => Promise<ModelGatewayDaemonServiceCommandResult> | ModelGatewayDaemonServiceCommandResult;

export interface ModelGatewayDaemonBootstrapRequest {
  plan: ModelGatewayDaemonServicePlan;
  paths: ModelGatewayPaths;
  projectRoot: string;
  host: string;
  port: number;
  endpoint: string;
}

export type ModelGatewayDaemonBootstrapRunner = (
  request: ModelGatewayDaemonBootstrapRequest,
) => Promise<ModelGatewayDaemonBootstrapStatus> | ModelGatewayDaemonBootstrapStatus;

function daemonBootstrapStatus(
  options: Partial<ModelGatewayDaemonBootstrapStatus> = {},
): ModelGatewayDaemonBootstrapStatus {
  return {
    mode: options.mode || "not-needed",
    allowed: options.allowed === true,
    attempted: options.attempted === true,
    started: options.started === true,
    temporary: options.temporary === true,
    pid: typeof options.pid === "number" ? options.pid : null,
    endpoint: options.endpoint || null,
    error: options.error || null,
    notes: options.notes || [],
  };
}

function runDefaultDaemonBootstrap(request: ModelGatewayDaemonBootstrapRequest): ModelGatewayDaemonBootstrapStatus {
  if (!fs.existsSync(request.plan.daemonEntry)) {
    return daemonBootstrapStatus({
      mode: "detached",
      allowed: true,
      attempted: true,
      started: false,
      temporary: true,
      endpoint: request.endpoint,
      error: `Model Gateway daemon entry was not found at ${request.plan.daemonEntry}. Run the API build before detached bootstrap.`,
      notes: [
        "Detached bootstrap is a temporary fallback and does not replace the OS/user supervisor restart policy.",
      ],
    });
  }

  try {
    const child = spawn(request.plan.nodePath, [request.plan.daemonEntry], {
      cwd: request.projectRoot,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: request.plan.stateDir,
        MODEL_GATEWAY_HOST: request.host,
        MODEL_GATEWAY_PORT: String(request.port),
        MODEL_GATEWAY_SUPERVISOR: "none",
      },
    });
    child.unref();
    return daemonBootstrapStatus({
      mode: "detached",
      allowed: true,
      attempted: true,
      started: true,
      temporary: true,
      pid: child.pid || null,
      endpoint: request.endpoint,
      notes: [
        "Started a detached daemon because no user-service template is installed.",
        "Install and enable the OS/user supervisor for crash restart and login startup guarantees.",
      ],
    });
  } catch (error) {
    return daemonBootstrapStatus({
      mode: "detached",
      allowed: true,
      attempted: true,
      started: false,
      temporary: true,
      endpoint: request.endpoint,
      error: error instanceof Error ? error.message : "Unable to start detached Model Gateway daemon.",
      notes: [
        "Detached bootstrap is a temporary fallback and does not replace the OS/user supervisor restart policy.",
      ],
    });
  }
}

function compactCommandOutput(result: ModelGatewayDaemonServiceCommandResult): string {
  return [result.stdout, result.stderr, result.error].filter(Boolean).join("\n").trim();
}

function commandReachedServiceManager(result: ModelGatewayDaemonServiceCommandResult): boolean {
  if (result.exitCode !== null) return true;
  if (result.stdout.trim() || result.stderr.trim()) return true;
  return !/\bENOENT\b|not found|not recognized/i.test(result.error || "");
}

function firstCommandError(commandsRun: ModelGatewayDaemonServiceCommandResult[]): string | null {
  const failed = commandsRun.find((result) => !result.ok);
  if (!failed) return null;
  const detail = compactCommandOutput(failed) || "Command failed.";
  return `${failed.label}: ${detail.slice(0, 800)}`;
}

function serviceManagerText(result: ModelGatewayDaemonServiceCommandResult | undefined): string {
  return `${result?.stdout || ""}\n${result?.stderr || ""}`.trim().toLowerCase();
}

function findLastCommandResult(
  commandsRun: ModelGatewayDaemonServiceCommandResult[],
  predicate: (result: ModelGatewayDaemonServiceCommandResult) => boolean,
): ModelGatewayDaemonServiceCommandResult | undefined {
  for (let index = commandsRun.length - 1; index >= 0; index -= 1) {
    const result = commandsRun[index];
    if (result && predicate(result)) return result;
  }
  return undefined;
}

function isTruthySystemdEnabledState(value: string): boolean {
  return ["enabled", "static", "linked", "linked-runtime", "alias", "indirect", "generated", "transient"].includes(value);
}

function summarizeDaemonServiceManager(
  supervisor: ModelGatewaySupervisorKind,
  commandsRun: ModelGatewayDaemonServiceCommandResult[],
): ModelGatewayDaemonServiceManagerStatus {
  if (!commandsRun.length) {
    return {
      checked: false,
      reachable: null,
      active: null,
      enabled: null,
      lastError: null,
    };
  }

  const reachable = commandsRun.every(commandReachedServiceManager);
  let active: boolean | null = null;
  let enabled: boolean | null = null;

  if (supervisor === "systemd-user") {
    const activeResult = findLastCommandResult(commandsRun, (result) => result.args.includes("is-active"));
    const enabledResult = findLastCommandResult(commandsRun, (result) => result.args.includes("is-enabled"));
    const activeState = serviceManagerText(activeResult).split(/\s+/).find(Boolean) || "";
    const enabledState = serviceManagerText(enabledResult).split(/\s+/).find(Boolean) || "";
    if (activeResult) active = activeState ? activeState === "active" || activeState === "activating" : activeResult.ok;
    if (enabledResult) enabled = enabledState ? isTruthySystemdEnabledState(enabledState) : enabledResult.ok;
  } else if (supervisor === "launchd-user") {
    const printResult = findLastCommandResult(commandsRun, (result) => result.command === "launchctl" && result.args.includes("print"));
    const text = serviceManagerText(printResult);
    if (printResult) active = printResult.ok;
    if (text.includes("disabled = true")) enabled = false;
    else if (text.includes("disabled = false")) enabled = true;
  } else if (supervisor === "scheduled-task") {
    const queryResult = findLastCommandResult(commandsRun, (result) => result.command.toLowerCase().includes("schtasks"));
    const text = serviceManagerText(queryResult);
    if (queryResult) {
      active = text.includes("running") ? true : queryResult.ok ? false : null;
      enabled = text.includes("disabled") ? false : queryResult.ok ? true : null;
    }
  }

  return {
    checked: true,
    reachable,
    active,
    enabled,
    lastError: firstCommandError(commandsRun),
  };
}

function normalizeRuntimeLogEntry(value: unknown): ModelGatewayRuntimeRequestLogEntry | null {
  if (!isRecord(value)) return null;
  const startedAt = normalizeString(value.startedAt);
  const finishedAt = normalizeString(value.finishedAt);
  if (!startedAt || !finishedAt) return null;
  const outcome = value.outcome === "success"
    || value.outcome === "failure"
    || value.outcome === "adapter-required"
    || value.outcome === "missing-provider"
    ? value.outcome
    : "failure";
  const routeId = MODEL_GATEWAY_ROUTE_IDS.includes(value.routeId as ModelGatewayRouteId)
    ? value.routeId as ModelGatewayRouteId
    : null;
  const appScope = MODEL_GATEWAY_APP_SCOPES.includes(value.appScope as ModelGatewayAppScope)
    ? value.appScope as ModelGatewayAppScope
    : null;
  return {
    id: normalizeString(value.id, randomUUID()),
    kind: value.kind === "provider-test" ? "provider-test" : "gateway-request",
    startedAt,
    finishedAt,
    durationMs: typeof value.durationMs === "number" ? Math.max(0, Math.floor(value.durationMs)) : 0,
    routeId,
    appScope,
    providerId: normalizeString(value.providerId) || null,
    providerName: normalizeString(value.providerName) || null,
    model: normalizeString(value.model) || null,
    method: normalizeString(value.method, "POST").toUpperCase(),
    requestedPath: normalizeString(value.requestedPath, "/"),
    upstreamUrl: normalizeString(value.upstreamUrl) || null,
    statusCode: typeof value.statusCode === "number" ? Math.floor(value.statusCode) : null,
    outcome,
    errorCode: normalizeString(value.errorCode) || null,
    errorMessage: normalizeString(value.errorMessage) || null,
  };
}

function normalizeProvider(input: ModelGatewayProviderInput, fallback?: ModelGatewayProvider): ModelGatewayProvider {
  const stamp = nowIso();
  const name = normalizeString(input.name, fallback?.name || "Custom provider");
  const id = normalizeId(input.id, fallback?.id || name || `provider-${Date.now()}`);
  const baseUrl = normalizeString(input.baseUrl, fallback?.baseUrl || "");
  if (!baseUrl) {
    throw new ModelGatewayServiceError("model_gateway_provider_base_url_required", "Provider baseUrl is required.", 400);
  }

  return {
    id,
    name,
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback?.enabled ?? true,
    category: memberOrDefault<ModelGatewayProviderCategory>(
      input.category,
      MODEL_GATEWAY_PROVIDER_CATEGORIES,
      fallback?.category || "custom",
    ),
    appScopes: normalizeAppScopes(input.appScopes || fallback?.appScopes),
    baseUrl,
    apiKeyRef: input.apiKeyRef === null ? null : normalizeString(input.apiKeyRef, fallback?.apiKeyRef || "") || null,
    apiFormat: memberOrDefault<ModelGatewayApiFormat>(
      input.apiFormat,
      MODEL_GATEWAY_API_FORMATS,
      fallback?.apiFormat || "openai_chat",
    ),
    authStrategy: memberOrDefault<ModelGatewayAuthStrategy>(
      input.authStrategy,
      MODEL_GATEWAY_AUTH_STRATEGIES,
      fallback?.authStrategy || "bearer",
    ),
    models: normalizeModelCatalog(input.models, fallback?.models),
    reasoning: isRecord(input.reasoning) ? input.reasoning : fallback?.reasoning || {},
    endpoints: normalizeEndpointMap(input.endpoints || fallback?.endpoints),
    network: normalizeNetwork(input.network, fallback?.network),
    health: normalizeHealth(input.health, fallback?.health),
    failover: {
      enabled: typeof input.failover?.enabled === "boolean" ? input.failover.enabled : fallback?.failover.enabled ?? true,
      priority: typeof input.failover?.priority === "number" ? Math.floor(input.failover.priority) : fallback?.failover.priority ?? 100,
      maxRetries: typeof input.failover?.maxRetries === "number" ? Math.max(0, Math.floor(input.failover.maxRetries)) : fallback?.failover.maxRetries ?? 1,
    },
    projectRefs: normalizeStringArray(input.projectRefs || fallback?.projectRefs),
    metadata: isRecord(input.metadata) ? input.metadata : fallback?.metadata || {},
    createdAt: fallback?.createdAt || stamp,
    updatedAt: stamp,
  };
}

function maskSecret(value: string): { masked: string; length: number } {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return {
      masked: trimmed ? `${trimmed.slice(0, 2)}...` : "",
      length: trimmed.length,
    };
  }
  return {
    masked: `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`,
    length: trimmed.length,
  };
}

function isManagedProxyPlaceholderSecret(value: string | null): boolean {
  return value?.trim() === "PROXY_MANAGED";
}

function readHeader(headers: HeaderMap | undefined, key: string): string {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(key) || "";
  const exact = headers[key];
  const lower = headers[key.toLowerCase()];
  const value = exact ?? lower;
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
}

function normalizePathname(inputPath: string): string {
  if (!inputPath) return "/";
  try {
    return new URL(inputPath, "http://127.0.0.1").pathname.replace(/\/+$/g, "") || "/";
  } catch {
    const [pathname] = inputPath.split("?");
    return pathname.replace(/\/+$/g, "") || "/";
  }
}

function routeForPath(inputPath: string): { routeId: ModelGatewayRouteId; appScope: ModelGatewayAppScope; protocol: ModelGatewayApiFormat } | null {
  const pathname = normalizePathname(inputPath);
  for (const [routeId, route] of Object.entries(ROUTES) as Array<[ModelGatewayRouteId, (typeof ROUTES)[ModelGatewayRouteId]]>) {
    if (route.paths.includes(pathname)) {
      return {
        routeId,
        appScope: route.appScope,
        protocol: route.protocol,
      };
    }
  }
  return null;
}

function normalizeRequestAppScope(headers: HeaderMap | undefined, fallback: ModelGatewayAppScope): ModelGatewayAppScope {
  const value = readHeader(headers, "x-studio-app-scope").trim();
  return MODEL_GATEWAY_APP_SCOPES.includes(value as ModelGatewayAppScope)
    ? value as ModelGatewayAppScope
    : fallback;
}

function endpointForRoute(routeId: ModelGatewayRouteId, provider: ModelGatewayProvider): string {
  const override = provider.endpoints[routeId];
  if (override) return override;

  if (routeId === "openai_chat_completions") {
    if (provider.apiFormat === "anthropic_messages") return "/messages";
    if (provider.apiFormat === "openai_responses") return "/responses";
    return "/chat/completions";
  }
  if (routeId === "openai_responses") {
    if (provider.apiFormat === "anthropic_messages") return "/messages";
    return provider.apiFormat === "openai_chat" ? "/chat/completions" : "/responses";
  }
  if (routeId === "openai_responses_compact") {
    if (provider.apiFormat === "anthropic_messages") return "/messages";
    return provider.apiFormat === "openai_chat" ? "/chat/completions" : "/responses/compact";
  }
  if (routeId === "anthropic_messages") {
    if (provider.apiFormat === "openai_chat") return "/chat/completions";
    if (provider.apiFormat === "openai_responses") return "/responses";
    return "/messages";
  }
  return "/";
}

function routeMode(routeId: ModelGatewayRouteId, provider: ModelGatewayProvider): ModelGatewayRouteMode {
  if (routeId === "openai_chat_completions") {
    return provider.apiFormat === "openai_chat" ? "passthrough" : "adapter-required";
  }
  if (routeId === "openai_responses") {
    return provider.apiFormat === "openai_responses" ? "passthrough" : "adapter-required";
  }
  if (routeId === "openai_responses_compact") {
    return provider.apiFormat === "openai_responses" ? "passthrough" : "adapter-required";
  }
  if (routeId === "anthropic_messages") {
    return provider.apiFormat === "anthropic_messages" ? "passthrough" : "adapter-required";
  }
  return "unsupported";
}

function defaultTestRouteId(provider: ModelGatewayProvider): ModelGatewayRouteId | null {
  if (provider.apiFormat === "openai_chat") return "openai_chat_completions";
  if (provider.apiFormat === "openai_responses") return "openai_responses";
  if (provider.apiFormat === "anthropic_messages") return "anthropic_messages";
  return null;
}

function buildProviderRouteDecision(
  provider: ModelGatewayProvider,
  routeId: ModelGatewayRouteId,
  appScope: ModelGatewayAppScope,
): ModelGatewayRouteDecision {
  const route = ROUTES[routeId];
  const upstreamPath = endpointForRoute(routeId, provider);
  const mode = routeMode(routeId, provider);
  return {
    routeId,
    method: "POST",
    requestedPath: route.paths[0] || "/",
    appScope,
    mode,
    provider: {
      id: provider.id,
      name: provider.name,
      apiFormat: provider.apiFormat,
      authStrategy: provider.authStrategy,
      baseUrl: provider.baseUrl,
    },
    upstreamPath,
    upstreamUrl: joinBaseUrl(provider.baseUrl, upstreamPath),
    reason: mode === "adapter-required"
      ? `Provider '${provider.id}' uses ${provider.apiFormat}; ${routeId} needs a protocol adapter before passthrough.`
      : null,
    failoverReason: null,
  };
}

function buildProviderTestPayload(
  provider: ModelGatewayProvider,
  model: string,
  input: string,
): unknown {
  if (provider.apiFormat === "openai_responses") {
    return {
      model,
      input,
      stream: false,
    };
  }
  if (provider.apiFormat === "anthropic_messages") {
    return {
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: input }],
    };
  }
  return {
    model,
    messages: [{ role: "user", content: input }],
    stream: false,
  };
}

function joinBaseUrl(baseUrl: string, endpointPath: string): string {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/g, "");
  const endpoint = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const endpointParts = endpoint.split("/").filter(Boolean);
  const baseParts = basePath.split("/").filter(Boolean);

  let nextParts = [...baseParts, ...endpointParts];
  if (baseParts.length && endpointParts.length && baseParts[baseParts.length - 1] === endpointParts[0]) {
    nextParts = [...baseParts, ...endpointParts.slice(1)];
  }

  base.pathname = `/${nextParts.join("/")}`.replace(/\/{2,}/g, "/");
  base.search = "";
  base.hash = "";
  return base.toString();
}

function buildLoopbackHttpEndpoint(host: string, port: number, endpointPath = ""): string {
  const normalizedPath = endpointPath
    ? `/${endpointPath.split("/").filter(Boolean).join("/")}`
    : "";
  return `http://${host}:${port}${normalizedPath}`;
}

function expectedDaemonSupervisor(): ModelGatewaySupervisorKind {
  if (process.platform === "darwin") return "launchd-user";
  if (process.platform === "win32") return "windows-service";
  return "systemd-user";
}

function normalizeSupervisorKind(value: unknown): ModelGatewaySupervisorKind {
  if (value === "systemd-user"
    || value === "launchd-user"
    || value === "windows-service"
    || value === "scheduled-task"
    || value === "none") {
    return value;
  }
  return "unknown";
}

function readDaemonRuntimeMetadata(filePath: string): ModelGatewayDaemonRuntimeMetadata | null {
  const raw = readJsonFile<Partial<ModelGatewayDaemonRuntimeMetadata>>(filePath, {});
  if (!isRecord(raw) || raw.version !== 1) return null;
  const host = normalizeString(raw.host, MODEL_GATEWAY_DEFAULT_HOST);
  const port = typeof raw.port === "number" ? Math.floor(raw.port) : MODEL_GATEWAY_DEFAULT_PORT;
  const endpoint = normalizeString(raw.endpoint, buildLoopbackHttpEndpoint(host, port, "/v1"));
  return {
    version: 1,
    updatedAt: normalizeString(raw.updatedAt, nowIso()),
    pid: typeof raw.pid === "number" && raw.pid > 0 ? Math.floor(raw.pid) : null,
    startedAt: normalizeString(raw.startedAt) || null,
    host,
    port,
    endpoint,
    supervisor: normalizeSupervisorKind(raw.supervisor),
    serviceName: normalizeString(raw.serviceName, MODEL_GATEWAY_DAEMON_SERVICE_NAME),
    lockFile: normalizeString(raw.lockFile) || null,
  };
}

function isPidAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function isLoopbackRequest(req?: http.IncomingMessage): boolean {
  const remoteAddress = req?.socket?.remoteAddress || "";
  return remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1"
    || remoteAddress === "localhost";
}

function hasConfiguredGatewayAuth(config: StudioServerConfig): boolean {
  const openclaw = readJsonFile<Record<string, any>>(config.openclawConfigFile, {});
  const auth = isRecord(openclaw.gateway) && isRecord(openclaw.gateway.auth) ? openclaw.gateway.auth : {};
  const mode = normalizeString(auth.mode);
  const secrets = [normalizeString(auth.token), normalizeString(auth.password)].filter(Boolean);
  return Boolean(mode && mode !== "none" && secrets.length);
}

function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function copyUpstreamRequestHeaders(req: http.IncomingMessage): Headers {
  const headers = new Headers();
  const passthrough = [
    "accept",
    "content-type",
    "anthropic-version",
    "anthropic-beta",
    "openai-beta",
    "user-agent",
  ];

  for (const key of passthrough) {
    const value = req.headers[key];
    if (Array.isArray(value)) {
      if (value[0]) headers.set(key, value[0]);
    } else if (typeof value === "string" && value.trim()) {
      headers.set(key, value);
    }
  }

  return headers;
}

function applyProviderAuth(headers: Headers, provider: ModelGatewayProvider, secret: string | null): void {
  headers.delete("authorization");
  headers.delete("x-api-key");

  if (provider.authStrategy === "none") return;
  if (!secret) return;

  if (provider.authStrategy === "anthropic_api_key") {
    headers.set("x-api-key", secret);
    return;
  }

  headers.set("authorization", `Bearer ${secret}`);
}

function withProviderNetwork(provider: ModelGatewayProvider, init: RequestInit): FetchInitWithDispatcher {
  const proxyUrl = provider.network.proxyUrl;
  if (!proxyUrl) return init;

  const undici = require("undici") as {
    ProxyAgent?: new (uri: string) => unknown;
    Socks5ProxyAgent?: new (uri: string) => unknown;
  };
  const scheme = (() => {
    try {
      return new URL(proxyUrl).protocol.toLowerCase();
    } catch {
      return "";
    }
  })();
  const Agent = scheme.startsWith("socks")
    ? undici.Socks5ProxyAgent
    : undici.ProxyAgent;
  if (!Agent) {
    throw new ModelGatewayServiceError(
      "model_gateway_proxy_agent_unavailable",
      `No proxy agent is available for provider '${provider.id}'.`,
      500,
    );
  }
  return {
    ...init,
    dispatcher: new Agent(proxyUrl),
  };
}

function safeResponseHeaders(upstreamHeaders: Headers): Record<string, string> {
  const headers: Record<string, string> = {};
  upstreamHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if ([
      "connection",
      "content-encoding",
      "content-length",
      "keep-alive",
      "set-cookie",
      "transfer-encoding",
      "upgrade",
    ].includes(lower)) {
      return;
    }
    headers[key] = value;
  });
  return headers;
}

function normalizeAdaptedUpstreamError(
  responseText: string,
  statusCode: number,
  fallbackMessage: string,
): { error: { message: string; type: string; code: string; param?: string } } {
  const fallbackCode = `upstream_http_${statusCode}`;
  const parsed = parseJsonObjectOrNull(responseText);
  if (!parsed) {
    return {
      error: {
        message: previewText(responseText) || fallbackMessage,
        type: "upstream_error",
        code: fallbackCode,
      },
    };
  }

  const error = isRecord(parsed.error) ? parsed.error : null;
  const baseResp = isRecord(parsed.base_resp) ? parsed.base_resp : null;
  const message = normalizeErrorScalar(error?.message)
    || normalizeErrorScalar(parsed.message)
    || normalizeErrorScalar(parsed.msg)
    || normalizeErrorScalar(parsed.error)
    || normalizeErrorScalar(baseResp?.status_msg)
    || fallbackMessage;
  const type = normalizeErrorScalar(error?.type)
    || normalizeErrorScalar(parsed.type)
    || "upstream_error";
  const code = normalizeErrorScalar(error?.code)
    || normalizeErrorScalar(parsed.code)
    || normalizeErrorScalar(baseResp?.status_code)
    || fallbackCode;
  const param = normalizeErrorScalar(error?.param);
  return {
    error: {
      message,
      type,
      code,
      ...(param ? { param } : {}),
    },
  };
}

function normalizeErrorScalar(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function parseJsonObjectOrNull(value: string): Record<string, unknown> | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function previewText(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > REQUEST_LOG_PREVIEW_CHARS
    ? `${normalized.slice(0, REQUEST_LOG_PREVIEW_CHARS)}...`
    : normalized;
}

function extractModelFromJsonText(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { model?: unknown };
    return normalizeString(parsed.model) || null;
  } catch {
    return null;
  }
}

function isProviderHealthSuccess(statusCode: number | null, errorCode: string | null): boolean {
  if (errorCode) return false;
  if (statusCode === null) return false;
  return statusCode < 500 && statusCode !== 429;
}

function isProviderTestSuccess(statusCode: number | null, errorCode: string | null): boolean {
  if (errorCode) return false;
  if (statusCode === null) return false;
  return statusCode >= 200 && statusCode < 300;
}

function requestOutcomeFromStatus(
  statusCode: number | null,
  errorCode: string | null,
  success: boolean,
): ModelGatewayRuntimeRequestOutcome {
  if (success) return "success";
  if (errorCode === "model_gateway_adapter_required") return "adapter-required";
  if (errorCode === "model_gateway_provider_missing") return "missing-provider";
  return "failure";
}

function requestLogEntry(options: {
  kind: ModelGatewayRuntimeRequestLogEntry["kind"];
  startedAt: string;
  route: ModelGatewayRouteDecision;
  model: string | null;
  statusCode: number | null;
  outcome: ModelGatewayRuntimeRequestOutcome;
  errorCode?: string | null;
  errorMessage?: string | null;
}): ModelGatewayRuntimeRequestLogEntry {
  const finishedAt = nowIso();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(options.startedAt));
  return {
    id: randomUUID(),
    kind: options.kind,
    startedAt: options.startedAt,
    finishedAt,
    durationMs,
    routeId: options.route.routeId,
    appScope: options.route.appScope,
    providerId: options.route.provider?.id || null,
    providerName: options.route.provider?.name || null,
    model: options.model,
    method: options.route.method,
    requestedPath: options.route.requestedPath,
    upstreamUrl: options.route.upstreamUrl,
    statusCode: options.statusCode,
    outcome: options.outcome,
    errorCode: options.errorCode || null,
    errorMessage: options.errorMessage || null,
  };
}

export interface ModelGatewayService {
  getStatus(): ModelGatewayStatusResponse;
  listProviders(): ModelGatewayProvidersResponse;
  getRuntime(): ModelGatewayRuntimeResponse;
  getDaemonService(): ModelGatewayDaemonServiceResponse;
  manageDaemonService(req: http.IncomingMessage | undefined, payload?: ModelGatewayDaemonServiceRequest): Promise<ModelGatewayDaemonServiceResponse>;
  upsertProvider(req: http.IncomingMessage | undefined, payload: ModelGatewayUpsertProviderRequest): ModelGatewayProviderView;
  deleteProvider(req: http.IncomingMessage | undefined, providerId: string): ModelGatewayProvidersResponse;
  setActiveProvider(req: http.IncomingMessage | undefined, payload: ModelGatewaySetActiveProviderRequest): ModelGatewayProvidersResponse;
  setProviderSecret(req: http.IncomingMessage | undefined, providerId: string, payload: ModelGatewaySetProviderSecretRequest): ModelGatewayProviderView;
  testProvider(req: http.IncomingMessage | undefined, providerId: string, payload?: ModelGatewayProviderTestRequest): Promise<ModelGatewayProviderTestResponse>;
  resolveRouteDecision(method: string, requestedPath: string, headers?: HeaderMap): ModelGatewayRouteDecision;
  handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
}

export interface ModelGatewayServiceOptions {
  runtimeHost?: "studio-api" | "local-daemon";
  listener?: {
    host?: string;
    port?: number;
  };
  daemonServiceCommandRunner?: ModelGatewayDaemonServiceCommandRunner;
  daemonBootstrapRunner?: ModelGatewayDaemonBootstrapRunner;
}

export function createModelGatewayService(
  config: StudioServerConfig,
  options: ModelGatewayServiceOptions = {},
): ModelGatewayService {
  const paths = resolveModelGatewayPaths(config);
  const codexHistory = new CodexChatHistoryStore(paths.codexHistory);
  const runtimeHost = options.runtimeHost || "studio-api";
  const listenerHost = options.listener?.host || MODEL_GATEWAY_DEFAULT_HOST;
  const listenerPort = options.listener?.port || MODEL_GATEWAY_DEFAULT_PORT;

  async function runDaemonServiceCommand(command: ModelGatewayDaemonServiceCommand): Promise<ModelGatewayDaemonServiceCommandResult> {
    return options.daemonServiceCommandRunner
      ? await options.daemonServiceCommandRunner(command)
      : await runDefaultDaemonServiceCommand(command);
  }

  async function runDaemonBootstrap(request: ModelGatewayDaemonBootstrapRequest): Promise<ModelGatewayDaemonBootstrapStatus> {
    return options.daemonBootstrapRunner
      ? await options.daemonBootstrapRunner(request)
      : await runDefaultDaemonBootstrap(request);
  }

  function readRegistry(): ModelGatewayRegistryState {
    const raw = readJsonFile<Partial<ModelGatewayRegistryState>>(paths.registry, createEmptyRegistry());
    const updatedAt = normalizeString(raw.updatedAt, nowIso());
    const providers = Array.isArray(raw.providers)
      ? raw.providers
        .filter(isRecord)
        .flatMap((provider) => {
          try {
            const normalized = normalizeProvider(
              provider as ModelGatewayProviderInput,
              provider as unknown as ModelGatewayProvider,
            );
            normalized.createdAt = normalizeString(provider.createdAt, normalized.createdAt);
            normalized.updatedAt = normalizeString(provider.updatedAt, normalized.updatedAt);
            return [normalized];
          } catch {
            return [];
          }
        })
      : [];
    const providerIds = new Set(providers.map((provider) => provider.id));
    const activeProviders: Partial<Record<ModelGatewayAppScope, string>> = {};
    const active = isRecord(raw.activeProviders) ? raw.activeProviders : {};
    for (const scope of MODEL_GATEWAY_APP_SCOPES) {
      const providerId = normalizeString(active[scope]);
      if (providerId && providerIds.has(providerId)) activeProviders[scope] = providerId;
    }
    return {
      version: 1,
      updatedAt,
      providers,
      activeProviders,
    };
  }

  function writeRegistry(registry: ModelGatewayRegistryState): void {
    writeJsonSecureAtomic(paths.registry, {
      ...registry,
      updatedAt: nowIso(),
    });
  }

  function readSecrets(): ModelGatewaySecretState {
    const raw = readJsonFile<Partial<ModelGatewaySecretState>>(paths.secrets, createEmptySecrets());
    const secrets: ModelGatewaySecretState["secrets"] = {};
    if (isRecord(raw.secrets)) {
      for (const [ref, item] of Object.entries(raw.secrets)) {
        if (!isRecord(item)) continue;
        const value = normalizeString(item.value);
        if (!value) continue;
        secrets[ref] = {
          value,
          createdAt: normalizeString(item.createdAt, nowIso()),
          updatedAt: normalizeString(item.updatedAt, nowIso()),
        };
      }
    }
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt, nowIso()),
      secrets,
    };
  }

  function writeSecrets(secrets: ModelGatewaySecretState): void {
    writeJsonSecureAtomic(paths.secrets, {
      ...secrets,
      updatedAt: nowIso(),
    });
  }

  function readRuntime(): ModelGatewayRuntimeState {
    const raw = readJsonFile<Partial<ModelGatewayRuntimeState>>(paths.runtime, createEmptyRuntime());
    const requestLog = Array.isArray(raw.requestLog)
      ? raw.requestLog
        .map(normalizeRuntimeLogEntry)
        .filter((entry): entry is ModelGatewayRuntimeRequestLogEntry => Boolean(entry))
        .slice(-MAX_RUNTIME_REQUEST_LOG_ENTRIES)
      : [];
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt, nowIso()),
      requestLog,
    };
  }

  function writeRuntime(runtime: ModelGatewayRuntimeState): void {
    writeJsonSecureAtomic(paths.runtime, {
      version: 1,
      updatedAt: nowIso(),
      requestLog: runtime.requestLog.slice(-MAX_RUNTIME_REQUEST_LOG_ENTRIES),
    });
  }

  function appendRequestLog(entry: ModelGatewayRuntimeRequestLogEntry): void {
    const runtime = readRuntime();
    runtime.requestLog.push(entry);
    writeRuntime(runtime);
  }

  function updateProviderHealth(
    providerId: string,
    success: boolean,
    latencyMs: number | null,
    errorMessage: string | null,
  ): void {
    const registry = readRegistry();
    const provider = findProvider(registry, providerId);
    if (!provider) return;
    const stamp = nowIso();
    provider.health = {
      ...provider.health,
      lastLatencyMs: latencyMs,
      lastSuccessAt: success ? stamp : provider.health.lastSuccessAt,
      lastFailureAt: success ? provider.health.lastFailureAt : stamp,
      lastError: success ? null : errorMessage,
      consecutiveFailures: success ? 0 : provider.health.consecutiveFailures + 1,
      circuitState: success
        ? "closed"
        : provider.health.consecutiveFailures + 1 >= 3
          ? "open"
          : provider.health.circuitState,
    };
    provider.updatedAt = stamp;
    writeRegistry(registry);
  }

  function secretSummary(ref: string | null): ModelGatewaySecretSummary | null {
    if (!ref) return null;
    const secret = readSecrets().secrets[ref];
    if (!secret) {
      return {
        ref,
        hasSecret: false,
        masked: null,
        length: null,
        updatedAt: null,
      };
    }
    return {
      ref,
      hasSecret: true,
      ...maskSecret(secret.value),
      updatedAt: secret.updatedAt,
    };
  }

  function toProviderView(provider: ModelGatewayProvider): ModelGatewayProviderView {
    return {
      ...provider,
      secret: secretSummary(provider.apiKeyRef),
    };
  }

  function requireManagement(req?: http.IncomingMessage): void {
    if (!req) return;
    if (isLoopbackRequest(req)) return;
    if (hasConfiguredGatewayAuth(config) && isStudioGatewayHttpAuthorized(config, req)) return;
    throw new ModelGatewayServiceError(
      "model_gateway_management_locked",
      "Model Gateway provider and secret changes require a trusted local request or configured Gateway authentication.",
      403,
    );
  }

  function findProvider(registry: ModelGatewayRegistryState, providerId: string): ModelGatewayProvider | null {
    return registry.providers.find((provider) => provider.id === providerId) || null;
  }

  function candidateProviders(registry: ModelGatewayRegistryState, appScope: ModelGatewayAppScope): ModelGatewayProvider[] {
    return registry.providers
      .filter((provider) => provider.enabled)
      .filter((provider) => provider.appScopes.includes(appScope))
      .sort((left, right) => left.failover.priority - right.failover.priority || left.name.localeCompare(right.name));
  }

  function resolveProviderSelection(
    registry: ModelGatewayRegistryState,
    appScope: ModelGatewayAppScope,
  ): { provider: ModelGatewayProvider | null; failoverReason: string | null } {
    const activeId = registry.activeProviders[appScope];
    if (activeId) {
      const active = findProvider(registry, activeId);
      if (active?.enabled && active.appScopes.includes(appScope) && active.health.circuitState !== "open") {
        return { provider: active, failoverReason: null };
      }
      if (active?.enabled && active.appScopes.includes(appScope) && active.health.circuitState === "open") {
        const fallback = candidateProviders(registry, appScope)
          .find((provider) => provider.id !== active.id && provider.health.circuitState !== "open") || null;
        return {
          provider: fallback,
          failoverReason: fallback
            ? `Active provider '${active.id}' circuit is open; selected fallback '${fallback.id}'.`
            : `Active provider '${active.id}' circuit is open and no fallback provider is available.`,
        };
      }
    }

    const provider = candidateProviders(registry, appScope)
      .find((candidate) => candidate.health.circuitState !== "open") || null;
    return { provider, failoverReason: null };
  }

  function readProviderSecret(provider: ModelGatewayProvider): string | null {
    if (provider.authStrategy === "none") return null;
    const ref = provider.apiKeyRef;
    if (!ref) return null;
    return readSecrets().secrets[ref]?.value || null;
  }

  function setSecretValue(ref: string, value: string | null): void {
    const secrets = readSecrets();
    if (!value) {
      delete secrets.secrets[ref];
      writeSecrets(secrets);
      return;
    }
    const existing = secrets.secrets[ref];
    const stamp = nowIso();
    secrets.secrets[ref] = {
      value: value.trim(),
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    };
    writeSecrets(secrets);
  }

  function getLifecycleStatus(): ModelGatewayStatusResponse["lifecycle"] {
    const daemonRuntime = readDaemonRuntimeMetadata(paths.daemonRuntime);
    const daemonState = !daemonRuntime
      ? "not-installed"
      : isPidAlive(daemonRuntime.pid)
        ? "running"
        : daemonRuntime.pid
          ? "stale"
          : "unknown";
    const daemonRunning = daemonState === "running" && (
      runtimeHost === "local-daemon" || daemonRuntime?.pid !== process.pid
    );
    const daemonEndpoint = daemonRuntime?.endpoint || buildLoopbackHttpEndpoint(
      listenerHost,
      listenerPort,
      "/v1",
    );
    const gatewayBasePath = config.transport.gateway.basePath || config.gatewayControlUiBasePath || "";
    const openclawSinglePortEndpoint = config.transport.gateway.enabled
      ? buildLoopbackHttpEndpoint(MODEL_GATEWAY_DEFAULT_HOST, config.gatewayPort, gatewayBasePath)
      : null;

    return {
      controlPlane: {
        state: runtimeHost === "local-daemon" ? "not-attached" : "running",
        mode: runtimeHost === "local-daemon" ? "daemon-local-control" : "studio-api",
        pid: runtimeHost === "local-daemon" ? null : process.pid,
        endpoint: runtimeHost === "local-daemon"
          ? null
          : buildLoopbackHttpEndpoint(MODEL_GATEWAY_DEFAULT_HOST, config.port),
        embeddedGatewayActive: runtimeHost !== "local-daemon" && !daemonRunning,
      },
      openclawMount: {
        state: config.transport.gateway.enabled ? "configured" : "disabled",
        basePath: config.transport.gateway.enabled ? gatewayBasePath || null : null,
        endpoint: openclawSinglePortEndpoint,
        role: "control-ui-ingress",
        ownsModelRelay: false,
      },
      localDaemon: {
        required: true,
        implementationStatus: daemonRunning ? "available" : "contract-only",
        state: daemonState,
        runtimeMode: daemonRunning ? "local-daemon" : "studio-api-embedded",
        endpoint: daemonEndpoint,
        pid: daemonRuntime?.pid || null,
        startedAt: daemonRuntime?.startedAt || null,
        supervisor: {
          expected: expectedDaemonSupervisor(),
          active: daemonRunning ? daemonRuntime?.supervisor || null : null,
          serviceName: daemonRuntime?.serviceName || MODEL_GATEWAY_DAEMON_SERVICE_NAME,
          restartPolicyRequired: true,
        },
        paths: {
          runtime: paths.daemonRuntime,
          pid: paths.daemonPid,
          lock: paths.portLock,
        },
        survivesControlPlaneCrash: daemonRunning,
        notes: daemonRunning
          ? [
            "Local Gateway daemon metadata is present and the recorded pid is alive.",
            "CLI takeover should prefer the daemon loopback endpoint.",
          ]
          : [
            "Local Gateway daemon service is not active; Studio API is serving the embedded fallback.",
            "Embedded fallback does not survive Studio API or OpenClaw process crashes.",
          ],
      },
      endpointPolicy: {
        preferredCliEndpoint: daemonEndpoint,
        openclawSinglePortEndpoint,
        directDaemonFallbackRequired: true,
        targetModelRelayOwner: "local-daemon",
      },
    };
  }

  function getStatus(): ModelGatewayStatusResponse {
    const registry = readRegistry();
    const runtime = readRuntime();
    const openCircuits = registry.providers.filter((provider) => provider.health.circuitState === "open").length;
    const latestRequestAt = runtime.requestLog[runtime.requestLog.length - 1]?.finishedAt || null;
    return {
      ok: true,
      checkedAt: nowIso(),
      phase: "phase-1-control-plane",
      listener: {
        host: listenerHost,
        port: listenerPort,
      },
      capabilities: {
        status: ["/gateway/status", "/api/model-gateway/status"],
        providers: ["/gateway/providers", "/api/model-gateway/providers"],
        openaiChatCompletions: ROUTES.openai_chat_completions.paths,
        openaiResponses: ROUTES.openai_responses.paths,
        openaiResponsesCompact: ROUTES.openai_responses_compact.paths,
        anthropicMessages: ROUTES.anthropic_messages.paths,
      },
      registry: {
        providerCount: registry.providers.length,
        activeProviders: registry.activeProviders,
        paths: {
          registry: paths.registry,
          secrets: paths.secrets,
          runtime: paths.runtime,
        },
      },
      runtime: {
        requestLogSize: runtime.requestLog.length,
        latestRequestAt,
      },
      lifecycle: getLifecycleStatus(),
      healthSummary: {
        okProviders: registry.providers.filter((provider) => provider.enabled && provider.health.circuitState === "closed").length,
        degradedProviders: registry.providers.filter((provider) => provider.health.lastFailureAt || provider.health.circuitState !== "closed").length,
        openCircuits,
      },
    };
  }

  function getRuntime(): ModelGatewayRuntimeResponse {
    return {
      ok: true,
      runtime: readRuntime(),
      paths: {
        runtime: paths.runtime,
        logs: paths.logs,
      },
    };
  }

  function daemonServiceResponse(options: {
    action: ModelGatewayDaemonServiceAction;
    applied?: boolean;
    templateWritten?: boolean;
    commandsRun?: ModelGatewayDaemonServiceCommandResult[];
    bootstrap?: ModelGatewayDaemonBootstrapStatus;
  }): ModelGatewayDaemonServiceResponse {
    const plan = createModelGatewayDaemonServicePlan(config);
    const commandsRun = options.commandsRun || [];
    return {
      ok: true,
      checkedAt: nowIso(),
      action: options.action,
      applied: options.applied === true,
      templateWritten: options.templateWritten === true,
      installed: fs.existsSync(plan.selectedTemplate.configPath),
      plan,
      lifecycle: getLifecycleStatus(),
      commandsRun,
      serviceManager: summarizeDaemonServiceManager(plan.supervisor, commandsRun),
      bootstrap: options.bootstrap || daemonBootstrapStatus(),
    };
  }

  function getDaemonService(): ModelGatewayDaemonServiceResponse {
    return daemonServiceResponse({
      action: "status",
    });
  }

  async function manageDaemonService(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayDaemonServiceRequest = {},
  ): Promise<ModelGatewayDaemonServiceResponse> {
    requireManagement(req);
    const action = normalizeDaemonServiceAction(payload?.action);
    if (action === "ensure-running") {
      return ensureDaemonRunning(payload);
    }
    if (action === "preview" || action === "status") {
      const plan = createModelGatewayDaemonServicePlan(config);
      const commands = payload.runCommands === true ? plan.selectedTemplate.commands.status || [] : [];
      const commandsRun = [];
      for (const item of commands) commandsRun.push(await runDaemonServiceCommand(item));
      return daemonServiceResponse({
        action,
        applied: commandsRun.length > 0,
        commandsRun,
      });
    }

    const plan = createModelGatewayDaemonServicePlan(config);
    const apply = payload.apply === true;
    let templateWritten = false;
    if (action === "install" && apply) {
      writeTextAtomic(plan.selectedTemplate.configPath, plan.selectedTemplate.template);
      templateWritten = true;
    }

    const shouldRunCommands = payload.runCommands === true
      || (payload.runCommands !== false && apply && (action === "start" || action === "stop" || action === "restart"));
    const commandsRun = [];
    if (shouldRunCommands) {
      const commands = plan.selectedTemplate.commands[action] || [];
      for (const item of commands) commandsRun.push(await runDaemonServiceCommand(item));
    }

    return daemonServiceResponse({
      action,
      applied: templateWritten || commandsRun.length > 0,
      templateWritten,
      commandsRun,
    });
  }

  async function ensureDaemonRunning(
    payload: ModelGatewayDaemonServiceRequest = {},
  ): Promise<ModelGatewayDaemonServiceResponse> {
    const lifecycle = getLifecycleStatus();
    if (lifecycle.localDaemon.runtimeMode === "local-daemon" && lifecycle.localDaemon.state === "running") {
      return daemonServiceResponse({
        action: "ensure-running",
        bootstrap: daemonBootstrapStatus({
          mode: "not-needed",
          allowed: true,
          endpoint: lifecycle.localDaemon.endpoint,
          pid: lifecycle.localDaemon.pid,
          notes: [
            "Local Gateway daemon runtime metadata is already present and alive.",
          ],
        }),
      });
    }

    const plan = createModelGatewayDaemonServicePlan(config);
    const installed = fs.existsSync(plan.selectedTemplate.configPath);
    const apply = payload.apply === true;
    const commandsRun: ModelGatewayDaemonServiceCommandResult[] = [];

    if (installed) {
      if (apply && payload.runCommands !== false) {
        const statusCommands = plan.selectedTemplate.commands.status || [];
        for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
        const beforeStart = summarizeDaemonServiceManager(plan.supervisor, commandsRun);
        if (beforeStart.active !== true) {
          const startCommands = plan.selectedTemplate.commands.start || [];
          for (const item of startCommands) commandsRun.push(await runDaemonServiceCommand(item));
          for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
        }
      }

      const manager = summarizeDaemonServiceManager(plan.supervisor, commandsRun);
      return daemonServiceResponse({
        action: "ensure-running",
        applied: commandsRun.length > 0,
        commandsRun,
        bootstrap: daemonBootstrapStatus({
          mode: "supervisor",
          allowed: true,
          attempted: commandsRun.length > 0,
          started: manager.active === true,
          temporary: false,
          endpoint: lifecycle.localDaemon.endpoint,
          error: manager.lastError,
          notes: commandsRun.length
            ? [
              "User-service template is installed; ensure-running used the selected OS/user supervisor.",
              "Restart guarantees depend on the selected supervisor remaining enabled.",
            ]
            : [
              "User-service template is installed. Pass apply: true to run supervisor status/start commands.",
            ],
        }),
      });
    }

    if (!apply || payload.allowBootstrap !== true) {
      return daemonServiceResponse({
        action: "ensure-running",
        bootstrap: daemonBootstrapStatus({
          mode: "blocked",
          allowed: payload.allowBootstrap === true,
          endpoint: lifecycle.localDaemon.endpoint,
          error: "No user-service template is installed. Detached bootstrap requires apply: true and allowBootstrap: true.",
          notes: [
            "Install the OS/user supervisor for the formal daemon lifecycle.",
            "Detached bootstrap is only a temporary fallback when the user-service is not installed.",
          ],
        }),
      });
    }

    const bootstrap = await runDaemonBootstrap({
      plan,
      paths,
      projectRoot: config.projectRoot,
      host: listenerHost,
      port: listenerPort,
      endpoint: lifecycle.localDaemon.endpoint,
    });
    return daemonServiceResponse({
      action: "ensure-running",
      applied: bootstrap.started,
      bootstrap,
    });
  }

  function listProviders(): ModelGatewayProvidersResponse {
    const registry = readRegistry();
    return {
      ok: true,
      providers: registry.providers.map(toProviderView),
      activeProviders: registry.activeProviders,
      paths: {
        registry: paths.registry,
        secrets: paths.secrets,
        runtime: paths.runtime,
      },
    };
  }

  function upsertProvider(req: http.IncomingMessage | undefined, payload: ModelGatewayUpsertProviderRequest): ModelGatewayProviderView {
    requireManagement(req);
    if (!isRecord(payload) || !isRecord(payload.provider)) {
      throw new ModelGatewayServiceError("model_gateway_provider_payload_invalid", "Provider payload is required.", 400);
    }

    const registry = readRegistry();
    const requested = payload.provider;
    const requestedId = normalizeId(requested.id, normalizeString(requested.name, "provider"));
    const index = registry.providers.findIndex((provider) => provider.id === requestedId);
    const existing = index >= 0 ? registry.providers[index] : undefined;
    const next = normalizeProvider({ ...requested, id: requestedId }, existing);
    const secretValue = normalizeString(payload.secret?.apiKey);
    if (secretValue && !next.apiKeyRef) {
      next.apiKeyRef = `provider:${next.id}:api-key`;
    }

    if (index >= 0) registry.providers[index] = next;
    else registry.providers.push(next);

    const requestedActiveScopes = normalizeExplicitAppScopes(payload.setActiveScopes);
    for (const scope of requestedActiveScopes) {
      if (next.appScopes.includes(scope)) registry.activeProviders[scope] = next.id;
    }
    for (const scope of next.appScopes) {
      if (!registry.activeProviders[scope]) registry.activeProviders[scope] = next.id;
    }

    writeRegistry(registry);
    if (secretValue && next.apiKeyRef) setSecretValue(next.apiKeyRef, secretValue);
    return toProviderView(next);
  }

  function deleteProvider(req: http.IncomingMessage | undefined, providerId: string): ModelGatewayProvidersResponse {
    requireManagement(req);
    const registry = readRegistry();
    const index = registry.providers.findIndex((provider) => provider.id === providerId);
    if (index < 0) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }
    const [removed] = registry.providers.splice(index, 1);
    for (const scope of MODEL_GATEWAY_APP_SCOPES) {
      if (registry.activeProviders[scope] === providerId) {
        delete registry.activeProviders[scope];
      }
    }
    writeRegistry(registry);

    if (removed?.apiKeyRef && !registry.providers.some((provider) => provider.apiKeyRef === removed.apiKeyRef)) {
      setSecretValue(removed.apiKeyRef, null);
    }
    return listProviders();
  }

  function setActiveProvider(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewaySetActiveProviderRequest,
  ): ModelGatewayProvidersResponse {
    requireManagement(req);
    const scope = MODEL_GATEWAY_APP_SCOPES.includes(payload?.scope as ModelGatewayAppScope)
      ? payload.scope as ModelGatewayAppScope
      : null;
    if (!scope) {
      throw new ModelGatewayServiceError("model_gateway_scope_invalid", "A valid app scope is required.", 400);
    }

    const registry = readRegistry();
    const providerId = normalizeString(payload.providerId);
    if (!providerId) {
      delete registry.activeProviders[scope];
      writeRegistry(registry);
      return listProviders();
    }

    const provider = findProvider(registry, providerId);
    if (!provider) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }
    if (!provider.enabled) {
      throw new ModelGatewayServiceError("model_gateway_provider_disabled", `Model Gateway provider '${providerId}' is disabled.`, 400);
    }
    if (!provider.appScopes.includes(scope)) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_scope_mismatch",
        `Model Gateway provider '${providerId}' is not available for ${scope}.`,
        400,
      );
    }

    registry.activeProviders[scope] = providerId;
    writeRegistry(registry);
    return listProviders();
  }

  function setProviderSecret(
    req: http.IncomingMessage | undefined,
    providerId: string,
    payload: ModelGatewaySetProviderSecretRequest,
  ): ModelGatewayProviderView {
    requireManagement(req);
    const registry = readRegistry();
    const provider = findProvider(registry, providerId);
    if (!provider) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }
    const ref = provider.apiKeyRef || `provider:${provider.id}:api-key`;
    provider.apiKeyRef = ref;
    provider.updatedAt = nowIso();
    writeRegistry(registry);
    setSecretValue(ref, normalizeString(payload.apiKey) || null);
    return toProviderView(provider);
  }

  async function testProvider(
    req: http.IncomingMessage | undefined,
    providerId: string,
    payload: ModelGatewayProviderTestRequest = {},
  ): Promise<ModelGatewayProviderTestResponse> {
    requireManagement(req);
    const registry = readRegistry();
    const provider = findProvider(registry, providerId);
    if (!provider) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }

    const routeId = MODEL_GATEWAY_ROUTE_IDS.includes(payload.routeId as ModelGatewayRouteId)
      ? payload.routeId as ModelGatewayRouteId
      : defaultTestRouteId(provider);
    if (!routeId) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_test_unsupported",
        `Provider '${providerId}' uses ${provider.apiFormat}, which does not yet have a Phase 1 test route.`,
        400,
      );
    }
    const requestedScope = MODEL_GATEWAY_APP_SCOPES.includes(payload.appScope as ModelGatewayAppScope)
      ? payload.appScope as ModelGatewayAppScope
      : ROUTES[routeId].appScope;
    if (!provider.appScopes.includes(requestedScope)) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_scope_mismatch",
        `Model Gateway provider '${providerId}' is not available for ${requestedScope}.`,
        400,
      );
    }

    const route = buildProviderRouteDecision(provider, routeId, requestedScope);
    const startedAt = nowIso();
    const model = normalizeString(payload.model, provider.models.defaultModel || provider.models.models[0]?.id || "test-model");
    if (route.mode === "adapter-required") {
      const errorMessage = route.reason || "Provider test requires an adapter that is not implemented yet.";
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: null,
        outcome: "adapter-required",
        errorCode: "model_gateway_adapter_required",
        errorMessage,
      }));
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: null,
        latencyMs: 0,
        route,
        responsePreview: null,
        error: {
          code: "model_gateway_adapter_required",
          message: errorMessage,
        },
      };
    }

    const secret = readProviderSecret(provider);
    if (provider.authStrategy !== "none" && (!secret || isManagedProxyPlaceholderSecret(secret))) {
      const placeholder = isManagedProxyPlaceholderSecret(secret);
      const errorCode = placeholder
        ? "model_gateway_provider_secret_placeholder"
        : "model_gateway_provider_secret_missing";
      const errorMessage = placeholder
        ? `Provider '${provider.id}' has a managed auth placeholder; configure a real upstream secret before testing.`
        : `Provider '${provider.id}' requires a secret before it can be tested.`;
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: null,
        outcome: "failure",
        errorCode,
        errorMessage,
      }));
      updateProviderHealth(provider.id, false, null, errorMessage);
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: null,
        latencyMs: 0,
        route,
        responsePreview: null,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }

    const controller = new AbortController();
    const timeoutMs = typeof payload.timeoutMs === "number"
      ? Math.max(1_000, Math.floor(payload.timeoutMs))
      : provider.network.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers({ "content-type": "application/json" });
    applyProviderAuth(headers, provider, secret);
    const requestBody = JSON.stringify(buildProviderTestPayload(
      provider,
      model,
      normalizeString(payload.input, "Return the word ok."),
    ));
    try {
      const response = await fetch(route.upstreamUrl || provider.baseUrl, withProviderNetwork(provider, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      }));
      const responseText = await response.text();
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const success = isProviderTestSuccess(response.status, null);
      const errorMessage = success ? null : `Provider test returned HTTP ${response.status}.`;
      updateProviderHealth(provider.id, success, latencyMs, errorMessage);
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: response.status,
        outcome: requestOutcomeFromStatus(response.status, null, success),
        errorCode: success ? null : "model_gateway_provider_test_failed",
        errorMessage,
      }));
      return {
        ok: success,
        providerId,
        checkedAt: nowIso(),
        statusCode: response.status,
        latencyMs,
        route,
        responsePreview: previewText(responseText),
        error: success ? null : {
          code: "model_gateway_provider_test_failed",
          message: errorMessage || "Provider test failed.",
        },
      };
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const message = error instanceof Error ? error.message : "Provider test request failed.";
      updateProviderHealth(provider.id, false, latencyMs, message);
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: null,
        outcome: "failure",
        errorCode: "model_gateway_provider_test_failed",
        errorMessage: message,
      }));
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: null,
        latencyMs,
        route,
        responsePreview: null,
        error: {
          code: "model_gateway_provider_test_failed",
          message,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  function resolveRouteDecision(method: string, requestedPath: string, headers?: HeaderMap): ModelGatewayRouteDecision {
    const normalizedMethod = (method || "GET").toUpperCase();
    const pathname = normalizePathname(requestedPath);
    const route = normalizedMethod === "POST" ? routeForPath(pathname) : null;
    if (!route) {
      return {
        routeId: null,
        method: normalizedMethod,
        requestedPath: pathname,
        appScope: null,
        mode: "unsupported",
        provider: null,
        upstreamPath: null,
        upstreamUrl: null,
        reason: "No Model Gateway route matched this request.",
        failoverReason: null,
      };
    }

    const appScope = normalizeRequestAppScope(headers, route.appScope);
    const registry = readRegistry();
    const selection = resolveProviderSelection(registry, appScope);
    const provider = selection.provider;
    if (!provider) {
      return {
        routeId: route.routeId,
        method: normalizedMethod,
        requestedPath: pathname,
        appScope,
        mode: "missing-provider",
        provider: null,
        upstreamPath: null,
        upstreamUrl: null,
        reason: selection.failoverReason || `No active Model Gateway provider is configured for ${appScope}.`,
        failoverReason: selection.failoverReason,
      };
    }

    const upstreamPath = endpointForRoute(route.routeId, provider);
    const mode = routeMode(route.routeId, provider);
    return {
      routeId: route.routeId,
      method: normalizedMethod,
      requestedPath: pathname,
      appScope,
      mode,
      provider: {
        id: provider.id,
        name: provider.name,
        apiFormat: provider.apiFormat,
        authStrategy: provider.authStrategy,
        baseUrl: provider.baseUrl,
      },
      upstreamPath,
      upstreamUrl: joinBaseUrl(provider.baseUrl, upstreamPath),
      reason: mode === "adapter-required"
        ? `Provider '${provider.id}' uses ${provider.apiFormat}; ${route.routeId} needs a protocol adapter before passthrough.`
        : null,
      failoverReason: selection.failoverReason,
    };
  }

  async function handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startedAt = nowIso();
    const decision = resolveRouteDecision(req.method || "GET", req.url || "/", req.headers);
    if (decision.mode === "unsupported") {
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: null,
        statusCode: 404,
        outcome: "failure",
        errorCode: "model_gateway_route_not_found",
        errorMessage: decision.reason,
      }));
      sendJson(res, 404, {
        error: {
          code: "model_gateway_route_not_found",
          message: decision.reason,
          decision,
        },
      });
      return;
    }
    if (decision.mode === "missing-provider" || !decision.provider || !decision.routeId) {
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: null,
        statusCode: 503,
        outcome: "missing-provider",
        errorCode: "model_gateway_provider_missing",
        errorMessage: decision.reason,
      }));
      sendJson(res, 503, {
        error: {
          code: "model_gateway_provider_missing",
          message: decision.reason,
          decision,
        },
      });
      return;
    }

    const registry = readRegistry();
    const provider = findProvider(registry, decision.provider.id);
    if (!provider || !decision.upstreamUrl) {
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: null,
        statusCode: 503,
        outcome: "missing-provider",
        errorCode: "model_gateway_provider_missing",
        errorMessage: "The selected Model Gateway provider is no longer available.",
      }));
      sendJson(res, 503, {
        error: {
          code: "model_gateway_provider_missing",
          message: "The selected Model Gateway provider is no longer available.",
          decision,
        },
      });
      return;
    }

    const useCodexResponsesChatAdapter = isCodexResponsesToChatAdapterTarget(decision);
    const useAnthropicMessagesChatAdapter = isChatToAnthropicMessagesAdapterTarget(decision);
    const useCodexResponsesAnthropicAdapter = isResponsesToAnthropicMessagesAdapterTarget(decision);
    const useChatResponsesAdapter = isChatToOpenAIResponsesAdapterTarget(decision);
    const useAnthropicMessagesChatProviderAdapter = isAnthropicMessagesToChatAdapterTarget(decision);
    const useAnthropicMessagesResponsesProviderAdapter = isAnthropicMessagesToOpenAIResponsesAdapterTarget(decision);
    if (
      decision.mode === "adapter-required"
      && !useCodexResponsesChatAdapter
      && !useAnthropicMessagesChatAdapter
      && !useCodexResponsesAnthropicAdapter
      && !useChatResponsesAdapter
      && !useAnthropicMessagesChatProviderAdapter
      && !useAnthropicMessagesResponsesProviderAdapter
    ) {
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: null,
        statusCode: 501,
        outcome: "adapter-required",
        errorCode: "model_gateway_adapter_required",
        errorMessage: decision.reason,
      }));
      sendJson(res, 501, {
        error: {
          code: "model_gateway_adapter_required",
          message: decision.reason,
          decision,
        },
      });
      return;
    }

    const secret = readProviderSecret(provider);
    const body = await readRequestBody(req);
    const bodyText = body.byteLength ? body.toString("utf8") : undefined;
    const requestModel = extractModelFromJsonText(bodyText);
    const useCodexResponsesStreamingAdapter = useCodexResponsesChatAdapter && isCodexResponsesStreamingRequest(bodyText);
    let useChatResponsesStreamingAdapter = false;
    let useAnthropicMessagesChatStreamingAdapter = false;
    let useCodexResponsesAnthropicStreamingAdapter = false;
    let useAnthropicMessagesChatProviderStreamingAdapter = false;
    let useAnthropicMessagesResponsesProviderStreamingAdapter = false;
    if (provider.authStrategy !== "none" && (!secret || isManagedProxyPlaceholderSecret(secret))) {
      const placeholder = isManagedProxyPlaceholderSecret(secret);
      const errorCode = placeholder
        ? "model_gateway_provider_secret_placeholder"
        : "model_gateway_provider_secret_missing";
      const errorMessage = placeholder
        ? `Provider '${provider.id}' has a managed auth placeholder; configure a real upstream secret before forwarding requests.`
        : `Provider '${provider.id}' requires a secret before requests can be forwarded.`;
      updateProviderHealth(provider.id, false, null, errorMessage);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
        statusCode: 401,
        outcome: "failure",
        errorCode,
        errorMessage,
      }));
      sendJson(res, 401, {
        error: {
          code: errorCode,
          message: errorMessage,
          decision,
        },
      });
      return;
    }

    const headers = copyUpstreamRequestHeaders(req);
    applyProviderAuth(headers, provider, secret);
    let upstreamBodyText = bodyText;
    let requestModelForLog = requestModel;
    if (useChatResponsesAdapter) {
      try {
        const adapted = adaptChatCompletionRequestToResponses(bodyText, { allowStreaming: true });
        upstreamBodyText = JSON.stringify(adapted.responsesRequest);
        requestModelForLog = adapted.model || requestModel;
        useChatResponsesStreamingAdapter = adapted.stream;
        headers.set("content-type", "application/json");
      } catch (error) {
        const adapterError = error instanceof OpenAIResponsesChatAdapterError
          ? error
          : new OpenAIResponsesChatAdapterError(
            "model_gateway_chat_responses_adapter_failed",
            error instanceof Error ? error.message : "OpenAI Chat to Responses adapter failed.",
            500,
          );
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModel,
          statusCode: adapterError.statusCode,
          outcome: adapterError.statusCode === 501 ? "adapter-required" : "failure",
          errorCode: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
          errorMessage: adapterError.message,
        }));
        sendJson(res, adapterError.statusCode, {
          error: {
            code: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
            message: adapterError.message,
            decision,
          },
        });
        return;
      }
    } else if (useAnthropicMessagesChatAdapter || useCodexResponsesAnthropicAdapter) {
      try {
        const codexToChat = useCodexResponsesAnthropicAdapter
          ? adaptCodexResponsesRequestToChat(codexHistory.enrichRequest(bodyText).bodyText, { allowStreaming: true })
          : null;
        const chatRequestBodyText = codexToChat
          ? JSON.stringify(codexToChat.chatRequest)
          : bodyText;
        const adapted = adaptChatCompletionRequestToAnthropicMessages(chatRequestBodyText, { allowStreaming: true });
        upstreamBodyText = JSON.stringify(adapted.anthropicRequest);
        requestModelForLog = adapted.model || requestModel;
        useAnthropicMessagesChatStreamingAdapter = useAnthropicMessagesChatAdapter && adapted.stream;
        useCodexResponsesAnthropicStreamingAdapter = useCodexResponsesAnthropicAdapter && adapted.stream;
        headers.set("content-type", "application/json");
        ensureAnthropicMessagesHeaders(headers);
      } catch (error) {
        const adapterError = error instanceof AnthropicMessagesChatAdapterError || error instanceof CodexResponsesChatAdapterError
          ? error
          : new AnthropicMessagesChatAdapterError(
            useCodexResponsesAnthropicAdapter
              ? "model_gateway_codex_anthropic_adapter_failed"
              : "model_gateway_chat_anthropic_adapter_failed",
            error instanceof Error
              ? error.message
              : useCodexResponsesAnthropicAdapter
                ? "Codex Responses to Anthropic Messages adapter failed."
                : "OpenAI Chat to Anthropic Messages adapter failed.",
            500,
          );
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModel,
          statusCode: adapterError.statusCode,
          outcome: adapterError.statusCode === 501 ? "adapter-required" : "failure",
          errorCode: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
          errorMessage: adapterError.message,
        }));
        sendJson(res, adapterError.statusCode, {
          error: {
            code: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
            message: adapterError.message,
            decision,
          },
        });
        return;
      }
    } else if (useAnthropicMessagesChatProviderAdapter) {
      try {
        const adapted = adaptAnthropicMessagesRequestToChatCompletion(bodyText);
        upstreamBodyText = JSON.stringify(adapted.chatRequest);
        requestModelForLog = adapted.model || requestModel;
        useAnthropicMessagesChatProviderStreamingAdapter = adapted.stream;
        headers.set("content-type", "application/json");
        headers.delete("anthropic-version");
        headers.delete("anthropic-beta");
      } catch (error) {
        const adapterError = error instanceof AnthropicMessagesChatAdapterError
          ? error
          : new AnthropicMessagesChatAdapterError(
            "model_gateway_anthropic_chat_adapter_failed",
            error instanceof Error ? error.message : "Anthropic Messages to OpenAI Chat adapter failed.",
            500,
          );
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModel,
          statusCode: adapterError.statusCode,
          outcome: adapterError.statusCode === 501 ? "adapter-required" : "failure",
          errorCode: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
          errorMessage: adapterError.message,
        }));
        sendJson(res, adapterError.statusCode, {
          error: {
            code: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
            message: adapterError.message,
            decision,
          },
        });
        return;
      }
    } else if (useAnthropicMessagesResponsesProviderAdapter) {
      try {
        const chatAdapted = adaptAnthropicMessagesRequestToChatCompletion(bodyText);
        const responsesAdapted = adaptChatCompletionRequestToResponses(JSON.stringify(chatAdapted.chatRequest), {
          allowStreaming: true,
        });
        upstreamBodyText = JSON.stringify(responsesAdapted.responsesRequest);
        requestModelForLog = responsesAdapted.model || chatAdapted.model || requestModel;
        useAnthropicMessagesResponsesProviderStreamingAdapter = responsesAdapted.stream;
        headers.set("content-type", "application/json");
        headers.delete("anthropic-version");
        headers.delete("anthropic-beta");
      } catch (error) {
        const adapterError = error instanceof AnthropicMessagesChatAdapterError || error instanceof OpenAIResponsesChatAdapterError
          ? error
          : new AnthropicMessagesChatAdapterError(
            "model_gateway_anthropic_responses_adapter_failed",
            error instanceof Error ? error.message : "Anthropic Messages to OpenAI Responses adapter failed.",
            500,
          );
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModel,
          statusCode: adapterError.statusCode,
          outcome: adapterError.statusCode === 501 ? "adapter-required" : "failure",
          errorCode: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
          errorMessage: adapterError.message,
        }));
        sendJson(res, adapterError.statusCode, {
          error: {
            code: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
            message: adapterError.message,
            decision,
          },
        });
        return;
      }
    } else if (useCodexResponsesChatAdapter) {
      try {
        const enriched = codexHistory.enrichRequest(bodyText);
        const adapted = adaptCodexResponsesRequestToChat(enriched.bodyText, {
          allowStreaming: useCodexResponsesStreamingAdapter,
        });
        upstreamBodyText = JSON.stringify(adapted.chatRequest);
        requestModelForLog = adapted.model || requestModel;
        headers.set("content-type", "application/json");
      } catch (error) {
        const adapterError = error instanceof CodexResponsesChatAdapterError
          ? error
          : new CodexResponsesChatAdapterError(
            "model_gateway_codex_responses_adapter_failed",
            error instanceof Error ? error.message : "Codex Responses adapter failed.",
            500,
          );
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModel,
          statusCode: adapterError.statusCode,
          outcome: adapterError.statusCode === 501 ? "adapter-required" : "failure",
          errorCode: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
          errorMessage: adapterError.message,
        }));
        sendJson(res, adapterError.statusCode, {
          error: {
            code: adapterError.statusCode === 501 ? "model_gateway_adapter_required" : adapterError.code,
            message: adapterError.message,
            decision,
          },
        });
        return;
      }
    }

    try {
      const upstream = await fetch(decision.upstreamUrl, withProviderNetwork(provider, {
        method: req.method || "POST",
        headers,
        body: upstreamBodyText,
      }));
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const healthSuccess = isProviderHealthSuccess(upstream.status, null);
      const errorMessage = healthSuccess ? null : `Upstream returned HTTP ${upstream.status}.`;
      const streamingAdapter = useCodexResponsesStreamingAdapter
        ? {
          bodyMissingCode: "model_gateway_codex_streaming_body_missing",
          adapterFailedCode: "model_gateway_codex_streaming_adapter_failed",
          bodyMissingMessage: "OpenAI Chat streaming upstream did not return a readable body.",
          adapterFailedMessage: "Codex Responses streaming adapter failed.",
          write: writeCodexResponsesSseFromChatSse,
        }
        : useChatResponsesStreamingAdapter
          ? {
            bodyMissingCode: "model_gateway_chat_responses_streaming_body_missing",
            adapterFailedCode: "model_gateway_chat_responses_streaming_adapter_failed",
            bodyMissingMessage: "OpenAI Responses streaming upstream did not return a readable body.",
            adapterFailedMessage: "OpenAI Responses to Chat streaming adapter failed.",
            write: writeChatCompletionsSseFromResponsesSse,
          }
          : useAnthropicMessagesChatStreamingAdapter
            ? {
              bodyMissingCode: "model_gateway_chat_anthropic_streaming_body_missing",
              adapterFailedCode: "model_gateway_chat_anthropic_streaming_adapter_failed",
              bodyMissingMessage: "Anthropic Messages streaming upstream did not return a readable body.",
              adapterFailedMessage: "Anthropic Messages to Chat streaming adapter failed.",
              write: writeChatCompletionsSseFromAnthropicMessagesSse,
            }
            : useCodexResponsesAnthropicStreamingAdapter
              ? {
                bodyMissingCode: "model_gateway_codex_anthropic_streaming_body_missing",
                adapterFailedCode: "model_gateway_codex_anthropic_streaming_adapter_failed",
                bodyMissingMessage: "Anthropic Messages streaming upstream did not return a readable body.",
                adapterFailedMessage: "Anthropic Messages to Responses streaming adapter failed.",
                write: writeCodexResponsesSseFromAnthropicMessagesSse,
              }
              : useAnthropicMessagesChatProviderStreamingAdapter
                ? {
                  bodyMissingCode: "model_gateway_anthropic_chat_streaming_body_missing",
                  adapterFailedCode: "model_gateway_anthropic_chat_streaming_adapter_failed",
                  bodyMissingMessage: "OpenAI Chat streaming upstream did not return a readable body.",
                  adapterFailedMessage: "OpenAI Chat to Anthropic Messages streaming adapter failed.",
                  write: writeAnthropicMessagesSseFromChatSse,
                }
                : useAnthropicMessagesResponsesProviderStreamingAdapter
                  ? {
                    bodyMissingCode: "model_gateway_anthropic_responses_streaming_body_missing",
                    adapterFailedCode: "model_gateway_anthropic_responses_streaming_adapter_failed",
                    bodyMissingMessage: "OpenAI Responses streaming upstream did not return a readable body.",
                    adapterFailedMessage: "OpenAI Responses to Anthropic Messages streaming adapter failed.",
                    write: writeAnthropicMessagesSseFromResponsesSse,
                  }
                  : null;
      if (streamingAdapter && upstream.status >= 200 && upstream.status < 300) {
        if (!upstream.body) {
          const message = streamingAdapter.bodyMissingMessage;
          updateProviderHealth(provider.id, false, latencyMs, message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: 502,
            outcome: "failure",
            errorCode: streamingAdapter.bodyMissingCode,
            errorMessage: message,
          }));
          sendJson(res, 502, {
            error: {
              code: streamingAdapter.bodyMissingCode,
              message,
              decision,
            },
          });
          return;
        }
        setCorsHeaders(res);
        res.statusCode = upstream.status;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
        try {
          const streamingResult = await streamingAdapter.write(upstream.body, res, requestModelForLog);
          if ((useCodexResponsesStreamingAdapter || useCodexResponsesAnthropicStreamingAdapter) && isRecord(streamingResult)) {
            const responseId = normalizeString(streamingResult.responseId) || normalizeString(streamingResult.id);
            codexHistory.recordResponse({
              id: responseId,
              output: streamingResult.output,
            });
          }
          updateProviderHealth(provider.id, true, latencyMs, null);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: upstream.status,
            outcome: "success",
            errorCode: null,
            errorMessage: null,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : streamingAdapter.adapterFailedMessage;
          updateProviderHealth(provider.id, false, latencyMs, message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: 502,
            outcome: "failure",
            errorCode: streamingAdapter.adapterFailedCode,
            errorMessage: message,
          }));
          if (!res.headersSent) {
            sendJson(res, 502, {
              error: {
                code: streamingAdapter.adapterFailedCode,
                message,
                decision,
              },
            });
          }
        } finally {
          if (!res.writableEnded) res.end();
        }
        return;
      }

      const responseText = await upstream.text();
      const responseBody = Buffer.from(responseText);
      if (upstream.status < 200 || upstream.status >= 300) {
        const normalizedError = normalizeAdaptedUpstreamError(
          responseText,
          upstream.status,
          errorMessage || `Upstream returned HTTP ${upstream.status}.`,
        );
        if (useCodexResponsesChatAdapter || useCodexResponsesAnthropicAdapter) {
          updateProviderHealth(provider.id, healthSuccess, latencyMs, normalizedError.error.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: upstream.status,
            outcome: requestOutcomeFromStatus(upstream.status, null, healthSuccess),
            errorCode: String(normalizedError.error.code || "model_gateway_upstream_status"),
            errorMessage: normalizedError.error.message,
          }));
          res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
          sendJson(res, upstream.status, normalizedError);
          return;
        }
      }
      if (useChatResponsesAdapter && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          adaptedResponse = adaptResponsesToChatCompletion(JSON.parse(responseText) as unknown, requestModelForLog);
        } catch (error) {
          const adapterError = error instanceof OpenAIResponsesChatAdapterError
            ? error
            : new OpenAIResponsesChatAdapterError(
              "model_gateway_responses_chat_response_invalid",
              error instanceof Error ? error.message : "OpenAI Chat adapter could not parse the Responses response.",
              502,
            );
          updateProviderHealth(provider.id, false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            errorCode: adapterError.code,
            errorMessage: adapterError.message,
          }));
          sendJson(res, adapterError.statusCode, {
            error: {
              code: adapterError.code,
              message: adapterError.message,
              decision,
            },
          });
          return;
        }
        updateProviderHealth(provider.id, true, latencyMs, null);
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          errorCode: null,
          errorMessage: null,
        }));
        res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if ((useAnthropicMessagesChatAdapter || useCodexResponsesAnthropicAdapter) && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          const chatCompletion = adaptAnthropicMessagesResponseToChatCompletion(JSON.parse(responseText) as unknown, requestModelForLog);
          adaptedResponse = useCodexResponsesAnthropicAdapter
            ? adaptChatCompletionToCodexResponse(chatCompletion, requestModelForLog)
            : chatCompletion;
        } catch (error) {
          const adapterError = error instanceof AnthropicMessagesChatAdapterError || error instanceof CodexResponsesChatAdapterError
            ? error
            : new AnthropicMessagesChatAdapterError(
              "model_gateway_anthropic_chat_response_invalid",
              error instanceof Error ? error.message : "Model Gateway adapter could not parse the Anthropic Messages response.",
              502,
            );
          updateProviderHealth(provider.id, false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            errorCode: adapterError.code,
            errorMessage: adapterError.message,
          }));
          sendJson(res, adapterError.statusCode, {
            error: {
              code: adapterError.code,
              message: adapterError.message,
              decision,
            },
          });
          return;
        }
        updateProviderHealth(provider.id, true, latencyMs, null);
        if (useCodexResponsesAnthropicAdapter) {
          codexHistory.recordResponse(adaptedResponse);
        }
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          errorCode: null,
          errorMessage: null,
        }));
        res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if (
        (useAnthropicMessagesChatProviderAdapter || useAnthropicMessagesResponsesProviderAdapter)
        && upstream.status >= 200
        && upstream.status < 300
      ) {
        let adaptedResponse: Record<string, unknown>;
        try {
          const upstreamJson = JSON.parse(responseText) as unknown;
          const chatCompletion = useAnthropicMessagesResponsesProviderAdapter
            ? adaptResponsesToChatCompletion(upstreamJson, requestModelForLog)
            : upstreamJson;
          adaptedResponse = adaptChatCompletionResponseToAnthropicMessages(chatCompletion, requestModelForLog);
        } catch (error) {
          const adapterError = error instanceof AnthropicMessagesChatAdapterError || error instanceof OpenAIResponsesChatAdapterError
            ? error
            : new AnthropicMessagesChatAdapterError(
              useAnthropicMessagesResponsesProviderAdapter
                ? "model_gateway_responses_anthropic_response_invalid"
                : "model_gateway_chat_anthropic_response_invalid",
              error instanceof Error
                ? error.message
                : "Model Gateway adapter could not parse the upstream response as Anthropic Messages.",
              502,
            );
          updateProviderHealth(provider.id, false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            errorCode: adapterError.code,
            errorMessage: adapterError.message,
          }));
          sendJson(res, adapterError.statusCode, {
            error: {
              code: adapterError.code,
              message: adapterError.message,
              decision,
            },
          });
          return;
        }
        updateProviderHealth(provider.id, true, latencyMs, null);
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          errorCode: null,
          errorMessage: null,
        }));
        res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if (useCodexResponsesChatAdapter && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          adaptedResponse = adaptChatCompletionToCodexResponse(JSON.parse(responseText) as unknown, requestModelForLog);
        } catch (error) {
          const adapterError = error instanceof CodexResponsesChatAdapterError
            ? error
            : new CodexResponsesChatAdapterError(
              "model_gateway_codex_chat_response_invalid",
              error instanceof Error ? error.message : "Codex Responses adapter could not parse the Chat response.",
              502,
            );
          updateProviderHealth(provider.id, false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            errorCode: adapterError.code,
            errorMessage: adapterError.message,
          }));
          sendJson(res, adapterError.statusCode, {
            error: {
              code: adapterError.code,
              message: adapterError.message,
              decision,
            },
          });
          return;
        }
        updateProviderHealth(provider.id, true, latencyMs, null);
        codexHistory.recordResponse(adaptedResponse);
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          errorCode: null,
          errorMessage: null,
        }));
        res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }

      updateProviderHealth(provider.id, healthSuccess, latencyMs, errorMessage);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModelForLog,
        statusCode: upstream.status,
        outcome: requestOutcomeFromStatus(upstream.status, null, healthSuccess),
        errorCode: healthSuccess ? null : "model_gateway_upstream_status",
        errorMessage,
      }));
      setCorsHeaders(res);
      res.statusCode = upstream.status;
      for (const [key, value] of Object.entries(safeResponseHeaders(upstream.headers))) {
        res.setHeader(key, value);
      }
      if (!res.hasHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
      res.end(responseBody);
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const message = error instanceof Error ? error.message : "Model Gateway upstream request failed.";
      updateProviderHealth(provider.id, false, latencyMs, message);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModelForLog,
        statusCode: 502,
        outcome: "failure",
        errorCode: "model_gateway_upstream_failed",
        errorMessage: message,
      }));
      sendJson(res, 502, {
        error: {
          code: "model_gateway_upstream_failed",
          message,
          decision,
        },
      });
    }
  }

  return {
    getStatus,
    listProviders,
    getRuntime,
    getDaemonService,
    manageDaemonService,
    upsertProvider,
    deleteProvider,
    setActiveProvider,
    setProviderSecret,
    testProvider,
    resolveRouteDecision,
    handleGatewayRequest,
  };
}
