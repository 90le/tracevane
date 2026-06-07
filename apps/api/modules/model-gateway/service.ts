import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  MODEL_GATEWAY_API_FORMATS,
  MODEL_GATEWAY_APP_CONNECTION_IDS,
  MODEL_GATEWAY_APP_SCOPES,
  MODEL_GATEWAY_AUTH_STRATEGIES,
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  MODEL_GATEWAY_PROVIDER_CATEGORIES,
  MODEL_GATEWAY_REASONING_EFFORT_PARAMS,
  MODEL_GATEWAY_REASONING_EFFORT_VALUE_MODES,
  MODEL_GATEWAY_REASONING_OUTPUT_FORMATS,
  MODEL_GATEWAY_REASONING_THINKING_PARAMS,
  MODEL_GATEWAY_ROUTE_IDS,
  type ModelGatewayApiFormat,
  type ModelGatewayActiveRouteStatus,
  type ModelGatewayActiveRouteSmokeRequest,
  type ModelGatewayAppConnection,
  type ModelGatewayAppConnectionId,
  type ModelGatewayAppConnectionProfile,
  type ModelGatewayAppConnectionsResponse,
  type ModelGatewayAppScope,
  type ModelGatewayApplyAppConnectionsResponse,
  type ModelGatewayApplyAppConnectionRequest,
  type ModelGatewayApplyAppConnectionResponse,
  type ModelGatewayAuthStrategy,
  type ModelGatewayClientAuthConfig,
  type ModelGatewayClientAuthResponse,
  type ModelGatewayClientAuthUpdateRequest,
  type ModelGatewayClientAuthView,
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
  type ModelGatewayProviderDetectModelResult,
  type ModelGatewayProviderDetectProtocolResult,
  type ModelGatewayProviderDetectRequest,
  type ModelGatewayProviderDetectResponse,
  type ModelGatewayProviderHealth,
  type ModelGatewayProviderInput,
  type ModelGatewayModelListResponse,
  type ModelGatewayProviderModel,
  type ModelGatewayProviderModelCatalog,
  type ModelGatewayModelFeatures,
  type ModelGatewayProviderNetwork,
  type ModelGatewayProviderReasoning,
  type ModelGatewayProviderTestRequest,
  type ModelGatewayProviderTestResponse,
  type ModelGatewayProviderView,
  type ModelGatewayProvidersResponse,
  type ModelGatewayRegistryState,
  type ModelGatewayRollbackAppConnectionRequest,
  type ModelGatewayRollbackAppConnectionResponse,
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
  type ModelGatewayUpdateAppConnectionProfileRequest,
  type ModelGatewayUpdateAppConnectionProfileResponse,
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
const CLIENT_AUTH_SECRET_REF = "gateway:client-api-key";
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

function normalizedMember<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const normalized = normalizeString(value).toLowerCase();
  return allowed.includes(normalized as T) ? normalized as T : undefined;
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
          text: typeof model.features.text === "boolean" ? model.features.text : undefined,
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

function normalizeModelLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function providerModelLookupEntries(provider: ModelGatewayProvider): Map<string, string> {
  const entries = new Map<string, string>();
  for (const model of provider.models.models) {
    const modelId = normalizeString(model.id);
    if (!modelId) continue;
    entries.set(normalizeModelLookupKey(modelId), modelId);
    for (const alias of model.aliases || []) {
      const key = normalizeModelLookupKey(alias);
      if (key) entries.set(key, modelId);
    }
  }
  for (const [alias, modelId] of Object.entries(provider.models.aliases || {})) {
    const key = normalizeModelLookupKey(alias);
    const target = normalizeString(modelId);
    if (key && target) entries.set(key, target);
  }
  const defaultModel = normalizeString(provider.models.defaultModel || "");
  if (defaultModel && !entries.has(normalizeModelLookupKey(defaultModel))) {
    entries.set(normalizeModelLookupKey(defaultModel), defaultModel);
  }
  return entries;
}

const MODEL_GATEWAY_MODEL_FEATURE_KEYS = [
  "text",
  "streaming",
  "tools",
  "vision",
  "reasoning",
  "responses",
] as const;

function mergeModelFeatures(target: ModelGatewayModelFeatures, source?: ModelGatewayModelFeatures): void {
  if (!source) return;
  for (const key of MODEL_GATEWAY_MODEL_FEATURE_KEYS) {
    const value = source[key];
    if (value === true) {
      target[key] = true;
    } else if (value === false && target[key] !== true) {
      target[key] = false;
    }
  }
}

function compactModelFeatures(features: ModelGatewayModelFeatures): ModelGatewayModelFeatures {
  return Object.fromEntries(
    MODEL_GATEWAY_MODEL_FEATURE_KEYS
      .filter((key) => typeof features[key] === "boolean")
      .map((key) => [key, features[key]]),
  ) as ModelGatewayModelFeatures;
}

function validateProviderModelCatalog(providerId: string, catalog: ModelGatewayProviderModelCatalog): void {
  const seen = new Map<string, string>();
  const listedModelKeys = new Set<string>();
  const remember = (value: string, source: string) => {
    const normalized = normalizeModelLookupKey(value);
    if (!normalized) return;
    const previous = seen.get(normalized);
    if (previous) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_model_duplicate",
        `Provider '${providerId}' has duplicate model name '${value}' in ${source}; already used by ${previous}.`,
        400,
      );
    }
    seen.set(normalized, source);
  };

  for (const model of catalog.models) {
    const modelKey = normalizeModelLookupKey(model.id);
    if (modelKey) listedModelKeys.add(modelKey);
    remember(model.id, `model '${model.id}'`);
    for (const alias of model.aliases || []) {
      remember(alias, `alias '${alias}' for model '${model.id}'`);
    }
  }
  const defaultModel = normalizeString(catalog.defaultModel || "");
  if (defaultModel && !listedModelKeys.has(normalizeModelLookupKey(defaultModel))) {
    remember(defaultModel, `default model '${defaultModel}'`);
  }
  for (const [alias, modelId] of Object.entries(catalog.aliases || {})) {
    remember(alias, `alias '${alias}' for model '${modelId}'`);
  }
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

function normalizeProviderReasoning(value: unknown, fallback?: ModelGatewayProviderReasoning): ModelGatewayProviderReasoning {
  const source = isRecord(value) ? value : {};
  const pick = (camelKey: string, snakeKey: string): unknown => (
    source[camelKey] !== undefined ? source[camelKey] : source[snakeKey]
  );
  const reasoning: ModelGatewayProviderReasoning = {};

  const supportsThinking = pick("supportsThinking", "supports_thinking");
  if (typeof supportsThinking === "boolean") {
    reasoning.supportsThinking = supportsThinking;
  } else if (fallback?.supportsThinking !== undefined) {
    reasoning.supportsThinking = fallback.supportsThinking;
  }

  const supportsEffort = pick("supportsEffort", "supports_effort");
  if (typeof supportsEffort === "boolean") {
    reasoning.supportsEffort = supportsEffort;
  } else if (fallback?.supportsEffort !== undefined) {
    reasoning.supportsEffort = fallback.supportsEffort;
  }

  const thinkingParam = normalizedMember(
    pick("thinkingParam", "thinking_param"),
    MODEL_GATEWAY_REASONING_THINKING_PARAMS,
  );
  if (thinkingParam) {
    reasoning.thinkingParam = thinkingParam;
  } else if (fallback?.thinkingParam) {
    reasoning.thinkingParam = fallback.thinkingParam;
  }

  const effortParam = normalizedMember(
    pick("effortParam", "effort_param"),
    MODEL_GATEWAY_REASONING_EFFORT_PARAMS,
  );
  if (effortParam) {
    reasoning.effortParam = effortParam;
  } else if (fallback?.effortParam) {
    reasoning.effortParam = fallback.effortParam;
  }

  const effortValueMode = normalizedMember(
    pick("effortValueMode", "effort_value_mode"),
    MODEL_GATEWAY_REASONING_EFFORT_VALUE_MODES,
  );
  if (effortValueMode) {
    reasoning.effortValueMode = effortValueMode;
  } else if (fallback?.effortValueMode) {
    reasoning.effortValueMode = fallback.effortValueMode;
  }

  const outputFormat = normalizedMember(
    pick("outputFormat", "output_format"),
    MODEL_GATEWAY_REASONING_OUTPUT_FORMATS,
  );
  if (outputFormat) {
    reasoning.outputFormat = outputFormat;
  } else if (fallback?.outputFormat) {
    reasoning.outputFormat = fallback.outputFormat;
  }

  return reasoning;
}

function normalizeClientAuthConfig(value: unknown, fallback?: ModelGatewayClientAuthConfig): ModelGatewayClientAuthConfig {
  const source = isRecord(value) ? value : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback?.enabled ?? false,
    apiKeyRef: normalizeString(source.apiKeyRef, fallback?.apiKeyRef || CLIENT_AUTH_SECRET_REF) || CLIENT_AUTH_SECRET_REF,
    updatedAt: normalizeString(source.updatedAt, fallback?.updatedAt || "") || null,
  };
}

function normalizePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function createDefaultAppConnectionProfile(): ModelGatewayAppConnectionProfile {
  return {
    model: null,
    appModels: {},
    contextWindow: null,
    autoCompactTokenLimit: null,
    maxOutputTokens: null,
    reasoningEffort: null,
    protocolOptions: {
      codexResponsesWebsockets: false,
      codexResponsesWebsocketsV2: false,
      codexRequestCompression: false,
    },
  };
}

function hasOwnRecordValue(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeNullableProfileString(
  source: Record<string, unknown>,
  key: string,
  fallback: string | null,
): string | null {
  if (!hasOwnRecordValue(source, key)) return fallback || null;
  return normalizeString(source[key]) || null;
}

function normalizeNullableProfileInteger(
  source: Record<string, unknown>,
  key: string,
  fallback: number | null,
): number | null {
  if (!hasOwnRecordValue(source, key)) return fallback ?? null;
  return normalizePositiveInteger(source[key]);
}

function normalizeAppConnectionProfileModels(
  value: unknown,
  fallback: Partial<Record<ModelGatewayAppConnectionId, string | null>> = {},
): Partial<Record<ModelGatewayAppConnectionId, string | null>> {
  const source = isRecord(value) ? value : {};
  const next: Partial<Record<ModelGatewayAppConnectionId, string | null>> = { ...fallback };
  for (const appId of MODEL_GATEWAY_APP_CONNECTION_IDS) {
    if (hasOwnRecordValue(source, appId)) {
      next[appId] = normalizeString(source[appId]) || null;
    }
  }
  return next;
}

function normalizeAppConnectionProfile(
  value: unknown,
  fallback: ModelGatewayAppConnectionProfile = createDefaultAppConnectionProfile(),
): ModelGatewayAppConnectionProfile {
  const source = isRecord(value) ? value : {};
  const protocolOptions = isRecord(source.protocolOptions) ? source.protocolOptions : {};
  const fallbackOptions = fallback.protocolOptions || createDefaultAppConnectionProfile().protocolOptions;
  return {
    model: normalizeNullableProfileString(source, "model", fallback.model),
    appModels: normalizeAppConnectionProfileModels(source.appModels, fallback.appModels),
    contextWindow: normalizeNullableProfileInteger(source, "contextWindow", fallback.contextWindow),
    autoCompactTokenLimit: normalizeNullableProfileInteger(source, "autoCompactTokenLimit", fallback.autoCompactTokenLimit),
    maxOutputTokens: normalizeNullableProfileInteger(source, "maxOutputTokens", fallback.maxOutputTokens),
    reasoningEffort: normalizeNullableProfileString(source, "reasoningEffort", fallback.reasoningEffort),
    protocolOptions: {
      codexResponsesWebsockets: typeof protocolOptions.codexResponsesWebsockets === "boolean"
        ? protocolOptions.codexResponsesWebsockets
        : fallbackOptions.codexResponsesWebsockets,
      codexResponsesWebsocketsV2: typeof protocolOptions.codexResponsesWebsocketsV2 === "boolean"
        ? protocolOptions.codexResponsesWebsocketsV2
        : fallbackOptions.codexResponsesWebsocketsV2,
      codexRequestCompression: typeof protocolOptions.codexRequestCompression === "boolean"
        ? protocolOptions.codexRequestCompression
        : fallbackOptions.codexRequestCompression,
    },
  };
}

function mergeAppConnectionProfilePatch(
  current: ModelGatewayAppConnectionProfile,
  patch: Partial<ModelGatewayAppConnectionProfile> | undefined,
): ModelGatewayAppConnectionProfile {
  const normalizedCurrent = normalizeAppConnectionProfile(current);
  if (!isRecord(patch)) return normalizedCurrent;
  const patchOptions: Record<string, unknown> = isRecord(patch.protocolOptions) ? patch.protocolOptions : {};
  return {
    model: normalizeNullableProfileString(patch, "model", normalizedCurrent.model),
    appModels: normalizeAppConnectionProfileModels(patch.appModels, normalizedCurrent.appModels),
    contextWindow: normalizeNullableProfileInteger(patch, "contextWindow", normalizedCurrent.contextWindow),
    autoCompactTokenLimit: normalizeNullableProfileInteger(
      patch,
      "autoCompactTokenLimit",
      normalizedCurrent.autoCompactTokenLimit,
    ),
    maxOutputTokens: normalizeNullableProfileInteger(patch, "maxOutputTokens", normalizedCurrent.maxOutputTokens),
    reasoningEffort: normalizeNullableProfileString(patch, "reasoningEffort", normalizedCurrent.reasoningEffort),
    protocolOptions: {
      codexResponsesWebsockets: typeof patchOptions.codexResponsesWebsockets === "boolean"
        ? patchOptions.codexResponsesWebsockets
        : normalizedCurrent.protocolOptions.codexResponsesWebsockets,
      codexResponsesWebsocketsV2: typeof patchOptions.codexResponsesWebsocketsV2 === "boolean"
        ? patchOptions.codexResponsesWebsocketsV2
        : normalizedCurrent.protocolOptions.codexResponsesWebsocketsV2,
      codexRequestCompression: typeof patchOptions.codexRequestCompression === "boolean"
        ? patchOptions.codexRequestCompression
        : normalizedCurrent.protocolOptions.codexRequestCompression,
    },
  };
}

function generateGatewayClientKey(): string {
  return `sk-studio-${randomUUID().replaceAll("-", "")}`;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.byteLength !== rightBuffer.byteLength) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readHeaderValue(headers: http.IncomingHttpHeaders, name: string): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return normalizeString(value[0]) || null;
  return normalizeString(value) || null;
}

function clientAuthCandidates(req: http.IncomingMessage): string[] {
  const authorization = readHeaderValue(req.headers, "authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const apiKey = readHeaderValue(req.headers, "x-api-key");
  return [bearer || "", apiKey || ""].filter(Boolean);
}

function createEmptyRegistry(updatedAt = nowIso()): ModelGatewayRegistryState {
  return {
    version: 1,
    updatedAt,
    clientAuth: {
      enabled: false,
      apiKeyRef: CLIENT_AUTH_SECRET_REF,
      updatedAt: null,
    },
    appConnectionProfile: createDefaultAppConnectionProfile(),
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

function readTextIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isDaemonServiceTemplateCurrent(plan: ModelGatewayDaemonServicePlan): boolean {
  return readTextIfExists(plan.selectedTemplate.configPath) === plan.selectedTemplate.template;
}

function writeDaemonServiceTemplateIfNeeded(plan: ModelGatewayDaemonServicePlan): boolean {
  if (isDaemonServiceTemplateCurrent(plan)) return false;
  writeTextAtomic(plan.selectedTemplate.configPath, plan.selectedTemplate.template);
  return true;
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

export interface ModelGatewayDaemonReadinessResult {
  endpoint: string;
  ready: boolean;
  statusCode: number | null;
  error: string | null;
}

export type ModelGatewayDaemonReadinessChecker = (
  endpoint: string,
) => Promise<ModelGatewayDaemonReadinessResult | boolean> | ModelGatewayDaemonReadinessResult | boolean;

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

function normalizeDaemonReadinessResult(
  endpoint: string,
  value: ModelGatewayDaemonReadinessResult | boolean,
): ModelGatewayDaemonReadinessResult {
  if (typeof value === "boolean") {
    return {
      endpoint,
      ready: value,
      statusCode: value ? 200 : null,
      error: value ? null : `Daemon HTTP readiness check did not pass at ${endpoint}.`,
    };
  }
  return {
    endpoint: value.endpoint || endpoint,
    ready: value.ready === true,
    statusCode: typeof value.statusCode === "number" ? value.statusCode : null,
    error: value.error || (value.ready ? null : `Daemon HTTP readiness check did not pass at ${endpoint}.`),
  };
}

async function runDefaultDaemonReadinessChecker(endpoint: string): Promise<ModelGatewayDaemonReadinessResult> {
  const deadline = Date.now() + 8_000;
  let lastStatusCode: number | null = null;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      lastStatusCode = response.status;
      lastError = response.ok ? null : `HTTP ${response.status}`;
      if (response.ok) {
        return {
          endpoint,
          ready: true,
          statusCode: response.status,
          error: null,
        };
      }
    } catch (error) {
      lastStatusCode = null;
      lastError = error instanceof Error ? error.message : "Unable to reach daemon HTTP status endpoint.";
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    endpoint,
    ready: false,
    statusCode: lastStatusCode,
    error: `Daemon HTTP readiness check failed at ${endpoint}${lastError ? `: ${lastError}` : ""}.`,
  };
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

function normalizeDaemonServiceCommandResults(
  action: ModelGatewayDaemonServiceAction,
  commandsRun: ModelGatewayDaemonServiceCommandResult[],
): ModelGatewayDaemonServiceCommandResult[] {
  if (action !== "stop" && action !== "ensure-running") return commandsRun;
  if (action === "ensure-running") {
    const finalActiveResult = findLastCommandResult(commandsRun, (result) => result.args.includes("is-active"));
    const finalActiveState = serviceManagerText(finalActiveResult).split(/\s+/).find(Boolean) || "";
    if (finalActiveState !== "active" && finalActiveState !== "activating") return commandsRun;
  }
  return commandsRun.map((result) => {
    if (!result.args.includes("is-active")) return result;
    const activeState = serviceManagerText(result).split(/\s+/).find(Boolean) || "";
    if (activeState !== "inactive") return result;
    return {
      ...result,
      ok: true,
      exitCode: 0,
      error: null,
    };
  });
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

  const finalHealthy = reachable && active === true && enabled !== false;
  return {
    checked: true,
    reachable,
    active,
    enabled,
    lastError: finalHealthy ? null : firstCommandError(commandsRun),
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
  const models = normalizeModelCatalog(input.models, fallback?.models);
  validateProviderModelCatalog(id, models);

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
    models,
    reasoning: normalizeProviderReasoning(input.reasoning, fallback?.reasoning),
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
  model: { requested: string | null; resolved: string | null } | null = null,
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
    model,
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

function extractModelItems(value: unknown): ModelGatewayProviderModel[] {
  const source = (() => {
    if (Array.isArray(value)) return value;
    if (!isRecord(value)) return [];
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.models)) return value.models;
    return [];
  })();

  const models = source
    .map((item) => {
      if (typeof item === "string") return { id: item };
      if (!isRecord(item)) return null;
      const id = normalizeString(item.id)
        || normalizeString(item.name)
        || normalizeString(item.model)
        || normalizeString(item.value);
      if (!id) return null;
      const label = normalizeString(item.display_name)
        || normalizeString(item.displayName)
        || normalizeString(item.label)
        || normalizeString(item.name);
      return {
        id,
        ...(label && label !== id ? { label } : {}),
      } satisfies ModelGatewayProviderModel;
    })
    .filter((item): item is ModelGatewayProviderModel => Boolean(item));

  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function parseModelsResponseText(value: string): ModelGatewayProviderModel[] {
  try {
    return extractModelItems(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
}

function providerForDetection(options: {
  baseUrl: string;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  model: string | null;
  timeoutMs: number;
}): ModelGatewayProvider {
  return normalizeProvider({
    id: `detect-${options.apiFormat}-${options.authStrategy}`,
    name: "Detection candidate",
    enabled: true,
    category: "custom",
    appScopes: [...MODEL_GATEWAY_APP_SCOPES],
    baseUrl: options.baseUrl,
    apiFormat: options.apiFormat,
    authStrategy: options.authStrategy,
    models: {
      defaultModel: options.model,
      models: options.model ? [{ id: options.model }] : [],
      aliases: {},
    },
    network: {
      timeoutMs: options.timeoutMs,
    },
    failover: {
      enabled: false,
      priority: 100,
      maxRetries: 0,
    },
  });
}

async function fetchWithTimeout(
  url: string,
  init: FetchInitWithDispatcher,
  timeoutMs: number,
): Promise<{ response: Response; latencyMs: number }> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return {
      response,
      latencyMs: Math.max(0, Date.now() - startedAt),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detectionAuthStrategies(apiKey: string): ModelGatewayAuthStrategy[] {
  return apiKey
    ? ["bearer", "anthropic_api_key"]
    : ["none"];
}

async function detectModelList(
  baseUrl: string,
  apiKey: string,
  timeoutMs: number,
): Promise<ModelGatewayProviderDetectModelResult[]> {
  const results: ModelGatewayProviderDetectModelResult[] = [];
  for (const authStrategy of detectionAuthStrategies(apiKey)) {
    const provider = providerForDetection({
      baseUrl,
      apiFormat: "openai_chat",
      authStrategy,
      model: null,
      timeoutMs,
    });
    const endpoint = joinBaseUrl(baseUrl, "/models");
    const headers = new Headers();
    applyProviderAuth(headers, provider, apiKey || null);
    try {
      const { response, latencyMs } = await fetchWithTimeout(
        endpoint,
        withProviderNetwork(provider, {
          method: "GET",
          headers,
        }),
        timeoutMs,
      );
      const responseText = await response.text();
      const models = response.ok ? parseModelsResponseText(responseText) : [];
      results.push({
        ok: response.ok && models.length > 0,
        authStrategy,
        endpoint,
        statusCode: response.status,
        latencyMs,
        models,
        error: response.ok && models.length > 0 ? null : {
          code: response.ok ? "model_gateway_detect_models_empty" : "model_gateway_detect_models_failed",
          message: response.ok
            ? "Model list endpoint returned no recognizable model ids."
            : `Model list endpoint returned HTTP ${response.status}.`,
        },
      });
    } catch (error) {
      results.push({
        ok: false,
        authStrategy,
        endpoint,
        statusCode: null,
        latencyMs: 0,
        models: [],
        error: {
          code: "model_gateway_detect_models_failed",
          message: error instanceof Error ? error.message : "Model list detection failed.",
        },
      });
    }
  }
  return results;
}

async function detectProtocolCandidate(options: {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  model: string | null;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  routeId: ModelGatewayRouteId;
}): Promise<ModelGatewayProviderDetectProtocolResult> {
  const provider = providerForDetection(options);
  const appScope = ROUTES[options.routeId].appScope;
  const route = buildProviderRouteDecision(provider, options.routeId, appScope);
  if (!options.model) {
    return {
      ok: false,
      skipped: true,
      apiFormat: options.apiFormat,
      authStrategy: options.authStrategy,
      routeId: options.routeId,
      statusCode: null,
      latencyMs: 0,
      model: null,
      upstreamUrl: route.upstreamUrl,
      responsePreview: null,
      error: {
        code: "model_gateway_detect_model_required",
        message: "A model name is required because model list detection did not find one.",
      },
    };
  }

  const headers = new Headers({ "content-type": "application/json" });
  applyProviderAuth(headers, provider, options.apiKey || null);
  const requestBody = JSON.stringify(buildProviderTestPayload(
    provider,
    options.model,
    "Return only GATEWAY_OK.",
  ));

  try {
    const { response, latencyMs } = await fetchWithTimeout(
      route.upstreamUrl || provider.baseUrl,
      withProviderNetwork(provider, {
        method: "POST",
        headers,
        body: requestBody,
      }),
      options.timeoutMs,
    );
    const responseText = await response.text();
    const ok = isProviderTestSuccess(response.status, null);
    return {
      ok,
      skipped: false,
      apiFormat: options.apiFormat,
      authStrategy: options.authStrategy,
      routeId: options.routeId,
      statusCode: response.status,
      latencyMs,
      model: options.model,
      upstreamUrl: route.upstreamUrl,
      responsePreview: previewText(responseText),
      error: ok ? null : {
        code: "model_gateway_detect_protocol_failed",
        message: `Protocol probe returned HTTP ${response.status}.`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      apiFormat: options.apiFormat,
      authStrategy: options.authStrategy,
      routeId: options.routeId,
      statusCode: null,
      latencyMs: 0,
      model: options.model,
      upstreamUrl: route.upstreamUrl,
      responsePreview: null,
      error: {
        code: "model_gateway_detect_protocol_failed",
        message: error instanceof Error ? error.message : "Protocol probe failed.",
      },
    };
  }
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

function replaceModelInJsonText(value: string | undefined, model: string | null): string | undefined {
  const resolvedModel = normalizeString(model || "");
  if (!value || !resolvedModel) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.model !== "string") return value;
    return JSON.stringify({
      ...parsed,
      model: resolvedModel,
    });
  } catch {
    return value;
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

type ModelGatewayAppConnectionFormat = "json" | "toml";

interface ModelGatewayAppConnectionSpec {
  id: ModelGatewayAppConnectionId;
  label: string;
  appScope: ModelGatewayAppScope;
  protocol: ModelGatewayApiFormat;
  format: ModelGatewayAppConnectionFormat;
  targetPath: string;
  endpoint: string;
  launchHint: string | null;
}

const APP_CONNECTION_REDACTED_KEY = "<STUDIO_GATEWAY_KEY>";
const CODEX_APP_CONNECTION_START = "# >>> OpenClaw Studio Gateway app connection >>>";
const CODEX_APP_CONNECTION_END = "# <<< OpenClaw Studio Gateway app connection <<<";

function normalizeAppConnectionId(value: unknown): ModelGatewayAppConnectionId | null {
  return MODEL_GATEWAY_APP_CONNECTION_IDS.includes(value as ModelGatewayAppConnectionId)
    ? value as ModelGatewayAppConnectionId
    : null;
}

function stripTrailingV1(endpoint: string): string {
  return endpoint.replace(/\/v1\/?$/i, "");
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function tomlBoolean(value: boolean): string {
  return value ? "true" : "false";
}

function stripCodexManagedBlock(source: string): string {
  const start = CODEX_APP_CONNECTION_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = CODEX_APP_CONNECTION_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source
    .replace(new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function upsertTopLevelTomlScalar(source: string, key: string, value: string | null): string {
  if (value === null) return source;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source ? source.split(/\r?\n/) : [];
  const firstTableIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  const topLevelEnd = firstTableIndex >= 0 ? firstTableIndex : lines.length;
  const nextLine = `${key} = ${value}`;
  for (let index = 0; index < topLevelEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index] || "")) {
      lines[index] = nextLine;
      return lines.join(newline);
    }
  }
  lines.splice(topLevelEnd, 0, nextLine);
  return lines.join(newline).replace(new RegExp(`${newline}{3,}`, "g"), `${newline}${newline}`);
}

function upsertTopLevelTomlString(source: string, key: string, value: string | null): string {
  return value ? upsertTopLevelTomlScalar(source, key, tomlString(value)) : source;
}

function upsertTopLevelTomlNumber(source: string, key: string, value: number | null): string {
  return value ? upsertTopLevelTomlScalar(source, key, String(value)) : source;
}

function upsertTomlTableScalar(source: string, tableName: string, key: string, value: string | null): string {
  if (value === null) return source;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source ? source.split(/\r?\n/) : [];
  const header = `[${tableName}]`;
  let tableStart = lines.findIndex((line) => line.trim() === header);
  if (tableStart < 0) {
    const trimmed = source.trimEnd();
    return `${trimmed}${trimmed ? `${newline}${newline}` : ""}${header}${newline}${key} = ${value}${newline}`;
  }
  let tableEnd = lines.length;
  for (let index = tableStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index] || "")) {
      tableEnd = index;
      break;
    }
  }
  for (let index = tableStart + 1; index < tableEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index] || "")) {
      lines[index] = `${key} = ${value}`;
      return lines.join(newline);
    }
  }
  lines.splice(tableEnd, 0, `${key} = ${value}`);
  return lines.join(newline).replace(new RegExp(`${newline}{3,}`, "g"), `${newline}${newline}`);
}

function buildCodexConfig(source: string, options: {
  endpoint: string;
  key: string;
  profile: ModelGatewayAppConnectionProfile;
}): string {
  let next = stripCodexManagedBlock(source);
  next = upsertTopLevelTomlString(next, "model_provider", "studio_gateway");
  if (options.profile.model) next = upsertTopLevelTomlString(next, "model", options.profile.model);
  if (options.profile.reasoningEffort) {
    next = upsertTopLevelTomlString(next, "model_reasoning_effort", options.profile.reasoningEffort);
  }
  next = upsertTopLevelTomlNumber(next, "model_context_window", options.profile.contextWindow);
  next = upsertTopLevelTomlNumber(next, "model_auto_compact_token_limit", options.profile.autoCompactTokenLimit);
  next = upsertTomlTableScalar(
    next,
    "features",
    "enable_request_compression",
    tomlBoolean(options.profile.protocolOptions.codexRequestCompression),
  );
  const block = [
    CODEX_APP_CONNECTION_START,
    "[model_providers.studio_gateway]",
    "name = \"OpenClaw Studio Gateway\"",
    `base_url = ${tomlString(options.endpoint)}`,
    "wire_api = \"responses\"",
    `supports_websockets = ${tomlBoolean(options.profile.protocolOptions.codexResponsesWebsockets)}`,
    `requires_openai_auth = true`,
    `experimental_bearer_token = ${tomlString(options.key)}`,
    `responses_websockets_v2 = ${tomlBoolean(options.profile.protocolOptions.codexResponsesWebsocketsV2)}`,
    CODEX_APP_CONNECTION_END,
  ].join("\n");
  return `${next.trimEnd()}\n\n${block}\n`;
}

function parseJsonObjectForConnection(filePath: string, source: string | null): {
  value: Record<string, unknown>;
  error: string | null;
} {
  if (!source || !source.trim()) return { value: {}, error: null };
  try {
    const parsed = JSON.parse(source) as unknown;
    if (isRecord(parsed)) return { value: parsed, error: null };
    return {
      value: {},
      error: `${filePath} does not contain a JSON object.`,
    };
  } catch (error) {
    return {
      value: {},
      error: error instanceof Error ? error.message : `${filePath} is not valid JSON.`,
    };
  }
}

function stringifyConnectionJson(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isSecretPreviewKey(key: string): boolean {
  return /(?:api[_-]?key|apikey|auth[_-]?token|token|secret|password|credential|authorization|bearer)/i.test(key);
}

function isPreviewPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === APP_CONNECTION_REDACTED_KEY
    || trimmed === "<REDACTED>"
    || /^\$\{[A-Z0-9_]+\}$/.test(trimmed);
}

function redactJsonPreviewSecrets(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    return isSecretPreviewKey(key) && !isPreviewPlaceholder(value) ? "<REDACTED>" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonPreviewSecrets(item, key));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactJsonPreviewSecrets(entryValue, entryKey),
    ]),
  );
}

function redactTomlPreviewSecrets(content: string): string {
  return content.replace(
    /^(\s*[^#\n=]*(?:api[_-]?key|apikey|auth[_-]?token|token|secret|password|credential|authorization|bearer)[^=\n]*=\s*)("[^"\n]*"|'[^'\n]*'|[^\n#]+)/gim,
    (line, prefix: string, rawValue: string) => {
      if (rawValue.includes(APP_CONNECTION_REDACTED_KEY) || rawValue.includes("<REDACTED>")) return line;
      if (/^\s*["']?\$\{[A-Z0-9_]+\}["']?\s*$/.test(rawValue)) return line;
      return `${prefix}"<REDACTED>"`;
    },
  );
}

function redactConnectionPreviewContent(format: ModelGatewayAppConnectionFormat, content: string): string {
  if (format === "json") {
    try {
      const parsed = JSON.parse(content) as unknown;
      return `${JSON.stringify(redactJsonPreviewSecrets(parsed), null, 2)}\n`;
    } catch {
      return content;
    }
  }
  return redactTomlPreviewSecrets(content);
}

function buildClaudeSettingsConfig(source: string | null, targetPath: string, options: {
  endpoint: string;
  key: string;
  profile: ModelGatewayAppConnectionProfile;
}): { content: string; error: string | null } {
  const parsed = parseJsonObjectForConnection(targetPath, source);
  if (parsed.error) return { content: stringifyConnectionJson(parsed.value), error: parsed.error };
  const env = isRecord(parsed.value.env) ? parsed.value.env : {};
  const modelEnv = options.profile.model
    ? {
      ANTHROPIC_MODEL: options.profile.model,
      ANTHROPIC_REASONING_MODEL: options.profile.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: options.profile.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: options.profile.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: options.profile.model,
    }
    : {};
  return {
    error: null,
    content: stringifyConnectionJson({
      ...parsed.value,
      env: {
        ...env,
        ANTHROPIC_BASE_URL: options.endpoint,
        ANTHROPIC_API_KEY: options.key,
        ANTHROPIC_AUTH_TOKEN: options.key,
        ...modelEnv,
      },
    }),
  };
}

function buildOpenCodeConfig(source: string | null, targetPath: string, options: {
  endpoint: string;
  key: string;
  profile: ModelGatewayAppConnectionProfile;
  modelIds: string[];
}): { content: string; error: string | null } {
  const parsed = parseJsonObjectForConnection(targetPath, source);
  if (parsed.error) return { content: stringifyConnectionJson(parsed.value), error: parsed.error };
  const provider = isRecord(parsed.value.provider) ? parsed.value.provider : {};
  const modelCatalogIds = Array.from(new Set([
    ...options.modelIds,
    ...(options.profile.model ? [options.profile.model] : []),
  ]));
  const models = Object.fromEntries(modelCatalogIds.map((id) => [id, {
    name: id,
    ...(options.profile.contextWindow ? { contextWindow: options.profile.contextWindow } : {}),
    ...(options.profile.maxOutputTokens ? { maxOutputTokens: options.profile.maxOutputTokens } : {}),
  }]));
  return {
    error: null,
    content: stringifyConnectionJson({
      ...parsed.value,
      ...(options.profile.model ? { model: `studio-gateway/${options.profile.model}` } : {}),
      provider: {
        ...provider,
        "studio-gateway": {
          npm: "@ai-sdk/openai-compatible",
          name: "OpenClaw Studio Gateway",
          options: {
            apiKey: options.key,
            baseURL: options.endpoint,
            setCacheKey: true,
          },
          models,
        },
      },
    }),
  };
}

function buildOpenClawConfig(source: string | null, targetPath: string, options: {
  endpoint: string;
  key: string;
  profile: ModelGatewayAppConnectionProfile;
  modelIds: string[];
}): { content: string; error: string | null } {
  const parsed = parseJsonObjectForConnection(targetPath, source);
  if (parsed.error) return { content: stringifyConnectionJson(parsed.value), error: parsed.error };
  const modelsRoot = isRecord(parsed.value.models) ? parsed.value.models : {};
  const providers = isRecord(modelsRoot.providers) ? modelsRoot.providers : {};
  const modelCatalogIds = Array.from(new Set([
    ...options.modelIds,
    ...(options.profile.model ? [options.profile.model] : []),
  ]));
  const modelItems = modelCatalogIds.map((id) => ({
    id,
    name: id,
    input: ["text"],
    reasoning: true,
    ...(options.profile.contextWindow ? { contextWindow: options.profile.contextWindow } : {}),
    ...(options.profile.maxOutputTokens ? { maxTokens: options.profile.maxOutputTokens } : {}),
  }));
  return {
    error: null,
    content: stringifyConnectionJson({
      ...parsed.value,
      models: {
        ...modelsRoot,
        mode: normalizeString(modelsRoot.mode, "merge"),
        providers: {
          ...providers,
          "studio-gateway": {
            auth: "api-key",
            request: {
              allowPrivateNetwork: true,
            },
            api: "openai-completions",
            baseUrl: options.endpoint,
            apiKey: options.key,
            models: modelItems,
          },
        },
      },
      ...(options.profile.model ? {
        agents: mergeOpenClawAgentDefaultModel(parsed.value.agents, options.profile),
      } : {}),
    }),
  };
}

function mergeOpenClawAgentDefaultModel(
  agentsValue: unknown,
  profile: ModelGatewayAppConnectionProfile,
): Record<string, unknown> {
  const agents = isRecord(agentsValue) ? agentsValue : {};
  const defaults = isRecord(agents.defaults) ? agents.defaults : {};
  return {
    ...agents,
    defaults: {
      ...defaults,
      model: {
        ...(isRecord(defaults.model) ? defaults.model : {}),
        ...(profile.model ? { primary: `studio-gateway/${profile.model}` } : {}),
      },
      ...(profile.reasoningEffort ? { thinkingDefault: profile.reasoningEffort } : {}),
    },
  };
}

function backupFileIfExists(sourcePath: string, backupsRoot: string, appId: ModelGatewayAppConnectionId): string | null {
  if (!fs.existsSync(sourcePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = path.extname(sourcePath) || ".bak";
  const backupPath = path.join(backupsRoot, "app-connections", `${appId}-${stamp}${ext}.bak`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(sourcePath, backupPath);
  try {
    fs.chmodSync(backupPath, 0o600);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
  return backupPath;
}

function latestAppConnectionBackupPath(backupsRoot: string, appId: ModelGatewayAppConnectionId): string | null {
  const backupDir = path.join(backupsRoot, "app-connections");
  if (!fs.existsSync(backupDir)) return null;
  const prefix = `${appId}-`;
  const candidates = fs.readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith(".bak"))
    .map((fileName) => path.join(backupDir, fileName))
    .map((filePath) => {
      try {
        return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((item): item is { filePath: string; mtimeMs: number } => item !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.filePath || null;
}

export interface ModelGatewayService {
  getStatus(): ModelGatewayStatusResponse;
  listProviders(): ModelGatewayProvidersResponse;
  getClientAuth(): ModelGatewayClientAuthResponse;
  updateClientAuth(req: http.IncomingMessage | undefined, payload?: ModelGatewayClientAuthUpdateRequest): ModelGatewayClientAuthResponse;
  listAppConnections(): ModelGatewayAppConnectionsResponse;
  updateAppConnectionProfile(req: http.IncomingMessage | undefined, payload?: ModelGatewayUpdateAppConnectionProfileRequest): ModelGatewayUpdateAppConnectionProfileResponse;
  applyAppConnection(req: http.IncomingMessage | undefined, payload?: ModelGatewayApplyAppConnectionRequest): ModelGatewayApplyAppConnectionResponse;
  applyAppConnections(req: http.IncomingMessage | undefined, payload?: ModelGatewayApplyAppConnectionRequest): ModelGatewayApplyAppConnectionsResponse;
  rollbackAppConnection(req: http.IncomingMessage | undefined, payload?: ModelGatewayRollbackAppConnectionRequest): ModelGatewayRollbackAppConnectionResponse;
  listGatewayModels(req?: http.IncomingMessage): ModelGatewayModelListResponse;
  getRuntime(): ModelGatewayRuntimeResponse;
  getDaemonService(): ModelGatewayDaemonServiceResponse;
  manageDaemonService(req: http.IncomingMessage | undefined, payload?: ModelGatewayDaemonServiceRequest): Promise<ModelGatewayDaemonServiceResponse>;
  detectProvider(req: http.IncomingMessage | undefined, payload?: ModelGatewayProviderDetectRequest): Promise<ModelGatewayProviderDetectResponse>;
  upsertProvider(req: http.IncomingMessage | undefined, payload: ModelGatewayUpsertProviderRequest): ModelGatewayProviderView;
  deleteProvider(req: http.IncomingMessage | undefined, providerId: string): ModelGatewayProvidersResponse;
  setActiveProvider(req: http.IncomingMessage | undefined, payload: ModelGatewaySetActiveProviderRequest): ModelGatewayProvidersResponse;
  setProviderSecret(req: http.IncomingMessage | undefined, providerId: string, payload: ModelGatewaySetProviderSecretRequest): ModelGatewayProviderView;
  testActiveRoute(req: http.IncomingMessage | undefined, payload?: ModelGatewayActiveRouteSmokeRequest): Promise<ModelGatewayProviderTestResponse>;
  testProvider(req: http.IncomingMessage | undefined, providerId: string, payload?: ModelGatewayProviderTestRequest): Promise<ModelGatewayProviderTestResponse>;
  resolveRouteDecision(method: string, requestedPath: string, headers?: HeaderMap, requestedModel?: string | null): ModelGatewayRouteDecision;
  handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
}

export interface ModelGatewayServiceOptions {
  runtimeHost?: "studio-api" | "local-daemon";
  homeDir?: string;
  listener?: {
    host?: string;
    port?: number;
  };
  daemonServiceCommandRunner?: ModelGatewayDaemonServiceCommandRunner;
  daemonBootstrapRunner?: ModelGatewayDaemonBootstrapRunner;
  daemonReadinessChecker?: ModelGatewayDaemonReadinessChecker;
}

export function createModelGatewayService(
  config: StudioServerConfig,
  options: ModelGatewayServiceOptions = {},
): ModelGatewayService {
  const paths = resolveModelGatewayPaths(config);
  const codexHistory = new CodexChatHistoryStore(paths.codexHistory);
  const runtimeHost = options.runtimeHost || "studio-api";
  const homeDir = options.homeDir || os.homedir();
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

  async function runDaemonReadinessChecker(endpoint: string): Promise<ModelGatewayDaemonReadinessResult> {
    const result = options.daemonReadinessChecker
      ? await options.daemonReadinessChecker(endpoint)
      : await runDefaultDaemonReadinessChecker(endpoint);
    return normalizeDaemonReadinessResult(endpoint, result);
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
      clientAuth: normalizeClientAuthConfig(raw.clientAuth),
      appConnectionProfile: normalizeAppConnectionProfile(raw.appConnectionProfile),
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

  function clientAuthView(clientAuth = readRegistry().clientAuth): ModelGatewayClientAuthView {
    return {
      ...clientAuth,
      secret: secretSummary(clientAuth.apiKeyRef) || {
        ref: clientAuth.apiKeyRef,
        hasSecret: false,
        masked: null,
        length: null,
        updatedAt: null,
      },
      acceptedHeaders: ["Authorization: Bearer <gateway-key>", "x-api-key: <gateway-key>"],
      protectedRoutes: [
        "/v1/models",
        ...ROUTES.openai_chat_completions.paths,
        ...ROUTES.openai_responses.paths,
        ...ROUTES.openai_responses_compact.paths,
        ...ROUTES.anthropic_messages.paths,
      ],
    };
  }

  function isGatewayClientAuthorized(req: http.IncomingMessage): boolean {
    const registry = readRegistry();
    const auth = registry.clientAuth;
    if (!auth.enabled) return true;
    const secret = readSecrets().secrets[auth.apiKeyRef]?.value || "";
    if (!secret) return false;
    return clientAuthCandidates(req).some((candidate) => constantTimeEquals(candidate, secret));
  }

  function requireGatewayClient(req?: http.IncomingMessage): void {
    if (!req) return;
    if (isGatewayClientAuthorized(req)) return;
    throw new ModelGatewayServiceError(
      "model_gateway_client_auth_required",
      "Studio Gateway client requests require the configured local Gateway key.",
      401,
    );
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

  function resolveProviderModel(provider: ModelGatewayProvider, requestedModel: string | null): string | null {
    const requested = normalizeString(requestedModel || "");
    const entries = providerModelLookupEntries(provider);
    if (!requested) {
      return normalizeString(provider.models.defaultModel || "")
        || provider.models.models[0]?.id
        || null;
    }
    if (!entries.size) return requested;
    return entries.get(normalizeModelLookupKey(requested)) || null;
  }

  function parseExplicitProviderModel(requestedModel: string | null): { providerId: string; modelId: string } | null {
    const requested = normalizeString(requestedModel || "");
    const separator = requested.indexOf("/");
    if (separator <= 0 || separator === requested.length - 1) return null;
    return {
      providerId: requested.slice(0, separator),
      modelId: requested.slice(separator + 1),
    };
  }

  function resolveProviderSelection(
    registry: ModelGatewayRegistryState,
    appScope: ModelGatewayAppScope,
    requestedModel: string | null = null,
  ): { provider: ModelGatewayProvider | null; failoverReason: string | null; resolvedModel: string | null } {
    const activeId = registry.activeProviders[appScope];
    const explicitModel = parseExplicitProviderModel(requestedModel);
    const effectiveRequestedModel = explicitModel?.modelId || normalizeString(requestedModel || "") || null;
    const candidates = candidateProviders(registry, appScope)
      .filter((provider) => !explicitModel || provider.id === explicitModel.providerId)
      .map((provider) => ({
        provider,
        resolvedModel: resolveProviderModel(provider, effectiveRequestedModel),
      }))
      .filter((item) => effectiveRequestedModel ? item.resolvedModel : true);

    if (effectiveRequestedModel && !candidates.length) {
      return {
        provider: null,
        failoverReason: explicitModel
          ? `No enabled provider '${explicitModel.providerId}' offers model '${explicitModel.modelId}' for ${appScope}.`
          : `No enabled Model Gateway provider offers model '${effectiveRequestedModel}' for ${appScope}.`,
        resolvedModel: null,
      };
    }

    if (activeId) {
      const activeCandidate = candidates.find((item) => item.provider.id === activeId);
      if (activeCandidate && activeCandidate.provider.health.circuitState !== "open") {
        return {
          provider: activeCandidate.provider,
          failoverReason: null,
          resolvedModel: activeCandidate.resolvedModel || effectiveRequestedModel,
        };
      }
      if (activeCandidate && activeCandidate.provider.health.circuitState === "open") {
        const fallback = candidates
          .find((item) => item.provider.id !== activeCandidate.provider.id && item.provider.health.circuitState !== "open") || null;
        return {
          provider: fallback?.provider || null,
          failoverReason: fallback
            ? `Active provider '${activeCandidate.provider.id}' circuit is open; selected fallback '${fallback.provider.id}'.`
            : `Active provider '${activeCandidate.provider.id}' circuit is open and no fallback provider is available.`,
          resolvedModel: fallback?.resolvedModel || effectiveRequestedModel,
        };
      }
    }

    const fallback = candidates.find((candidate) => candidate.provider.health.circuitState !== "open") || null;
    return {
      provider: fallback?.provider || null,
      failoverReason: null,
      resolvedModel: fallback?.resolvedModel || effectiveRequestedModel,
    };
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
        models: ["/v1/models"],
        openaiChatCompletions: ROUTES.openai_chat_completions.paths,
        openaiResponses: ROUTES.openai_responses.paths,
        openaiResponsesCompact: ROUTES.openai_responses_compact.paths,
        anthropicMessages: ROUTES.anthropic_messages.paths,
      },
      registry: {
        providerCount: registry.providers.length,
        activeProviders: registry.activeProviders,
        clientAuth: clientAuthView(registry.clientAuth),
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
    const installed = fs.existsSync(plan.selectedTemplate.configPath);
    const templateCurrent = installed && isDaemonServiceTemplateCurrent(plan);
    return {
      ok: true,
      checkedAt: nowIso(),
      action: options.action,
      applied: options.applied === true,
      templateWritten: options.templateWritten === true,
      templateCurrent,
      installed,
      plan,
      lifecycle: getLifecycleStatus(),
      commandsRun,
      serviceManager: summarizeDaemonServiceManager(plan.supervisor, commandsRun),
      bootstrap: options.bootstrap || daemonBootstrapStatus(),
    };
  }

  function getDaemonHttpStatusEndpoint(): string {
    return buildLoopbackHttpEndpoint(listenerHost, listenerPort, "/api/model-gateway/status");
  }

  async function waitForDaemonSupervisorReadiness(
    manager: ModelGatewayDaemonServiceManagerStatus,
  ): Promise<ModelGatewayDaemonReadinessResult> {
    const endpoint = getDaemonHttpStatusEndpoint();
    if (manager.active !== true) {
      return {
        endpoint,
        ready: false,
        statusCode: null,
        error: manager.lastError || "Supervisor did not report the daemon as active.",
      };
    }
    return runDaemonReadinessChecker(endpoint);
  }

  function daemonSupervisorBootstrapStatus(options: {
    lifecycle: ReturnType<typeof getLifecycleStatus>;
    manager: ModelGatewayDaemonServiceManagerStatus;
    readiness: ModelGatewayDaemonReadinessResult;
    attempted: boolean;
    notes: string[];
  }): ModelGatewayDaemonBootstrapStatus {
    return daemonBootstrapStatus({
      mode: "supervisor",
      allowed: true,
      attempted: options.attempted,
      started: options.manager.active === true && options.readiness.ready,
      temporary: false,
      endpoint: options.lifecycle.localDaemon.endpoint,
      error: options.manager.lastError || (options.readiness.ready ? null : options.readiness.error),
      notes: [
        ...options.notes,
        options.readiness.ready
          ? `Daemon HTTP status endpoint is ready: ${options.readiness.endpoint}.`
          : `Daemon HTTP status endpoint is not ready: ${options.readiness.endpoint}.`,
      ],
    });
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
    const actionNeedsTemplate = action === "install" || action === "start" || action === "restart";
    if (actionNeedsTemplate && apply) {
      if (action === "install") {
        writeTextAtomic(plan.selectedTemplate.configPath, plan.selectedTemplate.template);
        templateWritten = true;
      } else {
        templateWritten = writeDaemonServiceTemplateIfNeeded(plan);
      }
    }

    const lifecycleActions = new Set<ModelGatewayDaemonServiceAction>(["install", "start", "stop", "restart"]);
    const shouldRunCommands = payload.runCommands === true
      || (payload.runCommands !== false && apply && lifecycleActions.has(action));
    const commandsRun = [];
    if (shouldRunCommands) {
      if (apply && (action === "start" || action === "restart")) {
        const installCommands = plan.selectedTemplate.commands.install || [];
        for (const item of installCommands) commandsRun.push(await runDaemonServiceCommand(item));
      }
      const commands = plan.selectedTemplate.commands[action] || [];
      for (const item of commands) commandsRun.push(await runDaemonServiceCommand(item));
      if (lifecycleActions.has(action)) {
        const statusCommands = plan.selectedTemplate.commands.status || [];
        for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
      }
    }
    const normalizedCommandsRun = normalizeDaemonServiceCommandResults(action, commandsRun);
    let bootstrap: ModelGatewayDaemonBootstrapStatus | undefined;
    if ((action === "start" || action === "restart") && normalizedCommandsRun.length > 0) {
      const lifecycle = getLifecycleStatus();
      const manager = summarizeDaemonServiceManager(plan.supervisor, normalizedCommandsRun);
      const readiness = await waitForDaemonSupervisorReadiness(manager);
      bootstrap = daemonSupervisorBootstrapStatus({
        lifecycle,
        manager,
        readiness,
        attempted: normalizedCommandsRun.length > 0,
        notes: [
          `Supervisor ${action} command path was used.`,
          "Restart guarantees depend on the selected supervisor remaining enabled.",
        ],
      });
    }

    return daemonServiceResponse({
      action,
      applied: templateWritten || commandsRun.length > 0,
      templateWritten,
      commandsRun: normalizedCommandsRun,
      bootstrap,
    });
  }

  async function ensureDaemonRunning(
    payload: ModelGatewayDaemonServiceRequest = {},
  ): Promise<ModelGatewayDaemonServiceResponse> {
    const lifecycle = getLifecycleStatus();
    const plan = createModelGatewayDaemonServicePlan(config);
    const installed = fs.existsSync(plan.selectedTemplate.configPath);
    const templateCurrentAtStart = installed && isDaemonServiceTemplateCurrent(plan);
    if (
      lifecycle.localDaemon.runtimeMode === "local-daemon"
      && lifecycle.localDaemon.state === "running"
      && templateCurrentAtStart
    ) {
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

    const apply = payload.apply === true;
    let templateWritten = false;
    const commandsRun: ModelGatewayDaemonServiceCommandResult[] = [];

    if (installed) {
      if (apply) {
        templateWritten = writeDaemonServiceTemplateIfNeeded(plan);
      }
      if (apply && payload.runCommands !== false) {
        if (templateWritten) {
          const installCommands = plan.selectedTemplate.commands.install || [];
          for (const item of installCommands) commandsRun.push(await runDaemonServiceCommand(item));
        }
        const statusCommands = plan.selectedTemplate.commands.status || [];
        for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
        let beforeStart = summarizeDaemonServiceManager(plan.supervisor, commandsRun);
        if (!templateWritten && beforeStart.enabled !== true) {
          const installCommands = plan.selectedTemplate.commands.install || [];
          for (const item of installCommands) commandsRun.push(await runDaemonServiceCommand(item));
          for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
          beforeStart = summarizeDaemonServiceManager(plan.supervisor, commandsRun);
        }
        if (templateWritten && beforeStart.active === true) {
          const restartCommands = plan.selectedTemplate.commands.restart || plan.selectedTemplate.commands.start || [];
          for (const item of restartCommands) commandsRun.push(await runDaemonServiceCommand(item));
          for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
        } else if (beforeStart.active !== true) {
          const startCommands = plan.selectedTemplate.commands.start || [];
          for (const item of startCommands) commandsRun.push(await runDaemonServiceCommand(item));
          for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
        }
      }

      const normalizedCommandsRun = normalizeDaemonServiceCommandResults("ensure-running", commandsRun);
      const manager = summarizeDaemonServiceManager(plan.supervisor, normalizedCommandsRun);
      const readiness = await waitForDaemonSupervisorReadiness(manager);
      return daemonServiceResponse({
        action: "ensure-running",
        applied: templateWritten || normalizedCommandsRun.length > 0,
        templateWritten,
        commandsRun: normalizedCommandsRun,
        bootstrap: daemonSupervisorBootstrapStatus({
          lifecycle,
          manager,
          readiness,
          attempted: normalizedCommandsRun.length > 0,
          notes: normalizedCommandsRun.length
            ? [
              "User-service template is installed; ensure-running used the selected OS/user supervisor.",
              ...(templateWritten ? ["User-service template was updated before supervisor start."] : []),
              "Restart guarantees depend on the selected supervisor remaining enabled.",
            ]
            : [
              templateWritten
                ? "User-service template was updated. Pass runCommands: true to run supervisor status/start commands."
                : "User-service template is installed. Pass apply: true to run supervisor status/start commands.",
            ],
        }),
      });
    }

    if (!apply) {
      return daemonServiceResponse({
        action: "ensure-running",
        bootstrap: daemonBootstrapStatus({
          mode: "blocked",
          allowed: false,
          endpoint: lifecycle.localDaemon.endpoint,
          error: "No user-service template is installed. Pass apply: true to install and start the OS/user supervisor.",
          notes: [
            "Install the OS/user supervisor for the formal daemon lifecycle.",
          ],
        }),
      });
    }

    const canUseSupervisor = Boolean(
      (plan.selectedTemplate.commands.install || []).length
      && (plan.selectedTemplate.commands.start || []).length,
    );
    if (!canUseSupervisor) {
      if (payload.allowBootstrap === true) {
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
      return daemonServiceResponse({
        action: "ensure-running",
        bootstrap: daemonBootstrapStatus({
          mode: "blocked",
          allowed: false,
          endpoint: lifecycle.localDaemon.endpoint,
          error: "No supported OS/user supervisor commands are available for this platform.",
          notes: [
            "Detached bootstrap is only available when explicitly allowed and no supervisor install/start path exists.",
          ],
        }),
      });
    }

    templateWritten = writeDaemonServiceTemplateIfNeeded(plan);
    if (payload.runCommands !== false) {
      const installCommands = plan.selectedTemplate.commands.install || [];
      for (const item of installCommands) commandsRun.push(await runDaemonServiceCommand(item));
      const statusCommands = plan.selectedTemplate.commands.status || [];
      for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
      const beforeStart = summarizeDaemonServiceManager(plan.supervisor, commandsRun);
      if (beforeStart.active !== true) {
        const startCommands = plan.selectedTemplate.commands.start || [];
        for (const item of startCommands) commandsRun.push(await runDaemonServiceCommand(item));
        for (const item of statusCommands) commandsRun.push(await runDaemonServiceCommand(item));
      }
    }

    const normalizedCommandsRun = normalizeDaemonServiceCommandResults("ensure-running", commandsRun);
    const manager = summarizeDaemonServiceManager(plan.supervisor, normalizedCommandsRun);
    const readiness = await waitForDaemonSupervisorReadiness(manager);
    return daemonServiceResponse({
      action: "ensure-running",
      applied: templateWritten || normalizedCommandsRun.length > 0,
      templateWritten,
      commandsRun: normalizedCommandsRun,
      bootstrap: daemonSupervisorBootstrapStatus({
        lifecycle,
        manager,
        readiness,
        attempted: normalizedCommandsRun.length > 0,
        notes: normalizedCommandsRun.length
          ? [
            "User-service template was installed; ensure-running used the selected OS/user supervisor.",
            "Restart guarantees depend on the selected supervisor remaining enabled.",
          ]
          : [
            "User-service template was installed. Pass runCommands: true to run supervisor status/start commands.",
        ],
      }),
    });
  }

  async function detectProvider(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayProviderDetectRequest = {},
  ): Promise<ModelGatewayProviderDetectResponse> {
    requireManagement(req);
    const baseUrl = normalizeString(payload.baseUrl);
    if (!baseUrl) {
      throw new ModelGatewayServiceError(
        "model_gateway_detect_base_url_required",
        "Provider baseUrl is required before detection.",
        400,
      );
    }
    try {
      new URL(baseUrl);
    } catch {
      throw new ModelGatewayServiceError(
        "model_gateway_detect_base_url_invalid",
        "Provider baseUrl must be a valid absolute URL.",
        400,
      );
    }

    const apiKey = normalizeString(payload.apiKey);
    const timeoutMs = typeof payload.timeoutMs === "number"
      ? Math.max(1_000, Math.floor(payload.timeoutMs))
      : 20_000;
    const modelProbes = await detectModelList(baseUrl, apiKey, timeoutMs);
    const seenModels = new Set<string>();
    const models: ModelGatewayProviderModel[] = [];
    for (const probe of modelProbes) {
      for (const model of probe.models) {
        if (seenModels.has(model.id)) continue;
        seenModels.add(model.id);
        models.push(model);
      }
    }

    const selectedModel = normalizeString(payload.model)
      || models[0]?.id
      || null;
    const protocols = await Promise.all([
      detectProtocolCandidate({
        baseUrl,
        apiKey,
        timeoutMs,
        model: selectedModel,
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        routeId: "openai_chat_completions",
      }),
      detectProtocolCandidate({
        baseUrl,
        apiKey,
        timeoutMs,
        model: selectedModel,
        apiFormat: "openai_responses",
        authStrategy: "bearer",
        routeId: "openai_responses",
      }),
      detectProtocolCandidate({
        baseUrl,
        apiKey,
        timeoutMs,
        model: selectedModel,
        apiFormat: "anthropic_messages",
        authStrategy: "anthropic_api_key",
        routeId: "anthropic_messages",
      }),
    ]);

    return {
      ok: true,
      checkedAt: nowIso(),
      baseUrl,
      selectedModel,
      models,
      modelProbes,
      protocols,
      recommendations: protocols
        .filter((protocol) => protocol.ok)
        .map((protocol) => ({
          apiFormat: protocol.apiFormat,
          authStrategy: protocol.authStrategy,
          routeId: protocol.routeId,
          defaultModel: selectedModel,
        })),
    };
  }

  function listProviders(): ModelGatewayProvidersResponse {
    const registry = readRegistry();
    const activeRoutes = buildActiveRouteStatuses(registry);
    return {
      ok: true,
      providers: registry.providers.map(toProviderView),
      activeProviders: registry.activeProviders,
      activeRoutes,
      activeRouteAlerts: activeRoutes
        .filter((route) => route.warning || route.state === "missing")
        .map((route) => route.warning || route.message),
      paths: {
        registry: paths.registry,
        secrets: paths.secrets,
        runtime: paths.runtime,
      },
    };
  }

  function defaultRouteIdForScope(scope: ModelGatewayAppScope): ModelGatewayRouteId {
    if (scope === "codex") return "openai_responses";
    if (scope === "claude-code") return "anthropic_messages";
    return "openai_chat_completions";
  }

  function buildActiveRouteStatuses(registry: ModelGatewayRegistryState): ModelGatewayActiveRouteStatus[] {
    return MODEL_GATEWAY_APP_SCOPES.map((scope) => {
      const selectedProviderId = registry.activeProviders[scope] || null;
      const selection = resolveProviderSelection(registry, scope, null);
      const resolvedProvider = selection.provider;
      const resolvedModel = selection.resolvedModel
        || resolvedProvider?.models.defaultModel
        || resolvedProvider?.models.models[0]?.id
        || null;
      const routeId = defaultRouteIdForScope(scope);
      if (!resolvedProvider) {
        return {
          scope,
          selectedProviderId,
          resolvedProviderId: null,
          resolvedProviderName: null,
          resolvedModel,
          routeId,
          state: "missing",
          message: `No available Model Gateway provider is available for ${scope}.`,
          warning: `No available Model Gateway provider is available for ${scope}.`,
        };
      }
      if (selection.failoverReason || (selectedProviderId && selectedProviderId !== resolvedProvider.id)) {
        const warning = selection.failoverReason
          || `Selected provider '${selectedProviderId}' is unavailable for ${scope}; resolved '${resolvedProvider.id}' by fallback.`;
        return {
          scope,
          selectedProviderId,
          resolvedProviderId: resolvedProvider.id,
          resolvedProviderName: resolvedProvider.name,
          resolvedModel,
          routeId,
          state: "fallback",
          message: warning,
          warning,
        };
      }
      if (selectedProviderId) {
        return {
          scope,
          selectedProviderId,
          resolvedProviderId: resolvedProvider.id,
          resolvedProviderName: resolvedProvider.name,
          resolvedModel,
          routeId,
          state: "fixed",
          message: `Fixed to '${resolvedProvider.name}'.`,
          warning: null,
        };
      }
      return {
        scope,
        selectedProviderId,
        resolvedProviderId: resolvedProvider.id,
        resolvedProviderName: resolvedProvider.name,
        resolvedModel,
        routeId,
        state: "auto",
        message: `Auto resolves to '${resolvedProvider.name}'.`,
        warning: null,
      };
    });
  }

  function getClientAuth(): ModelGatewayClientAuthResponse {
    return {
      ok: true,
      clientAuth: clientAuthView(),
      revealedKey: null,
    };
  }

  function updateClientAuth(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayClientAuthUpdateRequest = {},
  ): ModelGatewayClientAuthResponse {
    requireManagement(req);
    const registry = readRegistry();
    const next = {
      ...registry.clientAuth,
      enabled: typeof payload.enabled === "boolean" ? payload.enabled : registry.clientAuth.enabled,
      apiKeyRef: registry.clientAuth.apiKeyRef || CLIENT_AUTH_SECRET_REF,
      updatedAt: nowIso(),
    };
    const shouldGenerate = Boolean(payload.generate);
    const requestedKey = shouldGenerate ? generateGatewayClientKey() : normalizeString(payload.apiKey || "");
    const secrets = readSecrets();

    if (requestedKey) {
      const existing = secrets.secrets[next.apiKeyRef];
      secrets.secrets[next.apiKeyRef] = {
        value: requestedKey,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso(),
      };
      writeSecrets(secrets);
      next.enabled = true;
    } else if (payload.apiKey === null && next.apiKeyRef) {
      delete secrets.secrets[next.apiKeyRef];
      writeSecrets(secrets);
      next.enabled = false;
    }

    if (next.enabled && !readSecrets().secrets[next.apiKeyRef]?.value) {
      throw new ModelGatewayServiceError(
        "model_gateway_client_key_required",
        "A Gateway client key is required before client authentication can be enabled.",
        400,
      );
    }

    registry.clientAuth = next;
    writeRegistry(registry);
    return {
      ok: true,
      clientAuth: clientAuthView(next),
      revealedKey: shouldGenerate ? requestedKey || null : null,
    };
  }

  function listGatewayModels(req?: http.IncomingMessage): ModelGatewayModelListResponse {
    requireGatewayClient(req);
    const registry = readRegistry();
    const byModelId = new Map<string, {
      id: string;
      label: string | null;
      aliases: Set<string>;
      providerIds: Set<string>;
      priority: number;
      features: ModelGatewayModelFeatures;
    }>();

    for (const provider of registry.providers.filter((item) => item.enabled)) {
      const providerModels = provider.models.models.length
        ? provider.models.models
        : provider.models.defaultModel
          ? [{ id: provider.models.defaultModel }]
          : [];
      for (const model of providerModels) {
        const id = normalizeString(model.id);
        if (!id) continue;
        const key = normalizeModelLookupKey(id);
        const current = byModelId.get(key);
        if (!current) {
          byModelId.set(key, {
            id,
            label: model.label || null,
            aliases: new Set(model.aliases || []),
            providerIds: new Set([provider.id]),
            priority: provider.failover.priority,
            features: compactModelFeatures({ ...(model.features || {}) }),
          });
          continue;
        }
        current.providerIds.add(provider.id);
        for (const alias of model.aliases || []) current.aliases.add(alias);
        mergeModelFeatures(current.features, model.features);
        if (provider.failover.priority < current.priority) {
          current.id = id;
          current.label = model.label || current.label;
          current.priority = provider.failover.priority;
        }
      }
    }

    return {
      object: "list",
      data: [...byModelId.values()]
        .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
        .map((item) => ({
          id: item.id,
          object: "model" as const,
          created: 0,
          owned_by: item.providerIds.size > 1 ? "studio-gateway" : `provider:${[...item.providerIds][0] || "unknown"}`,
          label: item.label,
          aliases: [...item.aliases].sort(),
          providerIds: [...item.providerIds].sort(),
          features: compactModelFeatures(item.features),
        })),
    };
  }

  function readGatewayClientSecret(): string | null {
    const registry = readRegistry();
    const auth = registry.clientAuth;
    if (!auth.enabled) return null;
    return readSecrets().secrets[auth.apiKeyRef]?.value || null;
  }

  function gatewayModelIds(): string[] {
    const registry = readRegistry();
    const defaultIds = registry.providers
      .filter((provider) => provider.enabled)
      .sort((left, right) => left.failover.priority - right.failover.priority || left.name.localeCompare(right.name))
      .map((provider) => normalizeString(provider.models.defaultModel || provider.models.models[0]?.id || ""))
      .filter(Boolean);
    return [
      ...defaultIds,
      ...listGatewayModels().data.map((model) => model.id),
    ].filter((model, index, list) => list.indexOf(model) === index);
  }

  function defaultModelForConnection(scope: ModelGatewayAppScope): string | null {
    const registry = readRegistry();
    const selection = resolveProviderSelection(registry, scope, null);
    return selection.resolvedModel
      || selection.provider?.models.defaultModel
      || selection.provider?.models.models[0]?.id
      || gatewayModelIds()[0]
      || null;
  }

  function appConnectionSpecs(): ModelGatewayAppConnectionSpec[] {
    const endpoint = getLifecycleStatus().endpointPolicy.preferredCliEndpoint;
    return [
      {
        id: "codex",
        label: "Codex CLI",
        appScope: "codex",
        protocol: "openai_responses",
        format: "toml",
        targetPath: path.join(homeDir, ".codex", "config.toml"),
        endpoint,
        launchHint: "codex --model <model-id>",
      },
      {
        id: "claude-code",
        label: "Claude Code",
        appScope: "claude-code",
        protocol: "anthropic_messages",
        format: "json",
        targetPath: path.join(homeDir, ".claude", "settings.json"),
        endpoint: stripTrailingV1(endpoint),
        launchHint: "claude --model <model-id>",
      },
      {
        id: "opencode",
        label: "OpenCode",
        appScope: "opencode",
        protocol: "openai_chat",
        format: "json",
        targetPath: path.join(homeDir, ".config", "opencode", "opencode.json"),
        endpoint,
        launchHint: "opencode",
      },
      {
        id: "openclaw",
        label: "OpenClaw",
        appScope: "openclaw",
        protocol: "openai_chat",
        format: "json",
        targetPath: config.openclawConfigFile,
        endpoint,
        launchHint: "openclaw",
      },
    ];
  }

  function readConnectionSource(targetPath: string): { source: string | null; error: string | null } {
    try {
      return {
        source: readTextIfExists(targetPath),
        error: null,
      };
    } catch (error) {
      return {
        source: null,
        error: error instanceof Error ? error.message : `Unable to read ${targetPath}.`,
      };
    }
  }

  function defaultAppConnectionProfileForSpec(
    spec: ModelGatewayAppConnectionSpec,
    sourceProfile: ModelGatewayAppConnectionProfile = readRegistry().appConnectionProfile,
  ): ModelGatewayAppConnectionProfile {
    const normalized = normalizeAppConnectionProfile(sourceProfile);
    return normalizeAppConnectionProfile({
      ...normalized,
      model: normalized.appModels[spec.id] || normalized.model || defaultModelForConnection(spec.appScope),
    });
  }

  function updateStoredAppConnectionProfile(
    payload: ModelGatewayUpdateAppConnectionProfileRequest | ModelGatewayApplyAppConnectionRequest | undefined,
  ): ModelGatewayAppConnectionProfile {
    const registry = readRegistry();
    const profile = mergeAppConnectionProfilePatch(registry.appConnectionProfile, payload?.profile);
    if (payload?.profile) {
      writeRegistry({
        ...registry,
        updatedAt: nowIso(),
        appConnectionProfile: profile,
      });
    }
    return profile;
  }

  function listAvailableAppConnectionModels(modelIds: string[], profile: ModelGatewayAppConnectionProfile): string[] {
    return [
      profile.model || "",
      ...Object.values(profile.appModels || {}).map((item) => item || ""),
      ...modelIds,
    ].filter((item, index, list) => item && list.indexOf(item) === index);
  }

  function buildAppConnectionContent(spec: ModelGatewayAppConnectionSpec, options: {
    key: string;
    profile: ModelGatewayAppConnectionProfile;
    modelIds: string[];
    source: string | null;
  }): { content: string; error: string | null } {
    if (spec.id === "codex") {
      return {
        error: null,
        content: buildCodexConfig(options.source || "", {
          endpoint: spec.endpoint,
          key: options.key,
          profile: options.profile,
        }),
      };
    }
    if (spec.id === "claude-code") {
      return buildClaudeSettingsConfig(options.source, spec.targetPath, {
        endpoint: spec.endpoint,
        key: options.key,
        profile: options.profile,
      });
    }
    if (spec.id === "opencode") {
      return buildOpenCodeConfig(options.source, spec.targetPath, {
        endpoint: spec.endpoint,
        key: options.key,
        profile: options.profile,
        modelIds: options.modelIds,
      });
    }
    return buildOpenClawConfig(options.source, spec.targetPath, {
      endpoint: spec.endpoint,
      key: options.key,
      profile: options.profile,
      modelIds: options.modelIds,
    });
  }

  function appConnectionConfigured(spec: ModelGatewayAppConnectionSpec, source: string | null): boolean {
    if (!source) return false;
    if (spec.id === "codex") {
      return source.includes("[model_providers.studio_gateway]")
        && source.includes("model_provider = \"studio_gateway\"")
        && source.includes(`base_url = ${tomlString(spec.endpoint)}`);
    }
    const parsed = parseJsonObjectForConnection(spec.targetPath, source);
    if (parsed.error) return false;
    if (spec.id === "claude-code") {
      const env = isRecord(parsed.value.env) ? parsed.value.env : {};
      return normalizeString(env.ANTHROPIC_BASE_URL) === spec.endpoint
        && Boolean(normalizeString(env.ANTHROPIC_API_KEY) || normalizeString(env.ANTHROPIC_AUTH_TOKEN));
    }
    if (spec.id === "opencode") {
      const provider = isRecord(parsed.value.provider) ? parsed.value.provider : {};
      const studio = isRecord(provider["studio-gateway"]) ? provider["studio-gateway"] : {};
      const optionsValue = isRecord(studio.options) ? studio.options : {};
      return normalizeString(optionsValue.baseURL) === spec.endpoint && Boolean(normalizeString(optionsValue.apiKey));
    }
    const models = isRecord(parsed.value.models) ? parsed.value.models : {};
    const providers = isRecord(models.providers) ? models.providers : {};
    const studio = isRecord(providers["studio-gateway"]) ? providers["studio-gateway"] : {};
    return normalizeString(studio.baseUrl) === spec.endpoint && Boolean(normalizeString(studio.apiKey));
  }

  function buildAppConnection(spec: ModelGatewayAppConnectionSpec, options: {
    key: string | null;
    profile: ModelGatewayAppConnectionProfile;
    source: string | null;
    sourceError: string | null;
    modelIds: string[];
  }): ModelGatewayAppConnection {
    const model = options.profile.model;
    const content = buildAppConnectionContent(spec, {
      key: APP_CONNECTION_REDACTED_KEY,
      profile: options.profile,
      modelIds: options.modelIds,
      source: options.source,
    });
    const lastBackupPath = latestAppConnectionBackupPath(paths.backups, spec.id);
    const issues = [
      ...(readRegistry().clientAuth.enabled && options.key
        ? []
        : ["Gateway client key is not enabled or missing; generate or save a local Gateway key before applying app connections."]),
      ...(options.modelIds.length ? [] : ["No enabled provider models are available through /v1/models. Configure at least one enabled provider model first."]),
      ...(options.sourceError ? [`Unable to read target config: ${options.sourceError}`] : []),
      ...(content.error ? [`Target config is not valid for merge: ${content.error}`] : []),
    ];
    return {
      id: spec.id,
      label: spec.label,
      appScope: spec.appScope,
      protocol: spec.protocol,
      endpoint: spec.endpoint,
      model,
      target: {
        path: spec.targetPath,
        exists: fs.existsSync(spec.targetPath),
        format: spec.format,
      },
      configured: appConnectionConfigured(spec, options.source),
      canApply: issues.length === 0,
      canRollback: Boolean(lastBackupPath),
      lastBackupPath,
      issues,
      launchHint: spec.launchHint,
      preview: {
        targetPath: spec.targetPath,
        format: spec.format,
        content: redactConnectionPreviewContent(spec.format, content.content),
        redacted: true,
      },
    };
  }

  function listAppConnections(): ModelGatewayAppConnectionsResponse {
    const key = readGatewayClientSecret();
    const modelIds = gatewayModelIds();
    const storedProfile = readRegistry().appConnectionProfile;
    return {
      ok: true,
      checkedAt: nowIso(),
      profile: normalizeAppConnectionProfile(storedProfile),
      availableModels: listAvailableAppConnectionModels(modelIds, storedProfile),
      connections: appConnectionSpecs().map((spec) => {
        const source = readConnectionSource(spec.targetPath);
        const profile = defaultAppConnectionProfileForSpec(spec, storedProfile);
        return buildAppConnection(spec, {
          key,
          profile,
          source: source.source,
          sourceError: source.error,
          modelIds,
        });
      }),
    };
  }

  function applyAppConnection(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayApplyAppConnectionRequest = {},
  ): ModelGatewayApplyAppConnectionResponse {
    requireManagement(req);
    const appId = normalizeAppConnectionId(payload.appId);
    if (!appId) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_invalid",
        "A valid app connection id is required.",
        400,
      );
    }
    const key = readGatewayClientSecret();
    if (!key) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_key_required",
        "Enable and save a local Gateway client key before applying app connections.",
        400,
      );
    }
    const modelIds = gatewayModelIds();
    if (!modelIds.length) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_models_required",
        "Configure at least one enabled provider model before applying app connections.",
        400,
      );
    }
    const spec = appConnectionSpecs().find((item) => item.id === appId);
    if (!spec) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_not_found",
        `App connection '${appId}' was not found.`,
        404,
      );
    }
    const source = readConnectionSource(spec.targetPath);
    if (source.error) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_read_failed",
        source.error,
        500,
      );
    }
    const storedProfile = updateStoredAppConnectionProfile(payload);
    const profile = defaultAppConnectionProfileForSpec(spec, storedProfile);
    const next = buildAppConnectionContent(spec, {
      key,
      profile,
      modelIds,
      source: source.source,
    });
    if (next.error) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_target_invalid",
        next.error,
        400,
      );
    }
    const backupPath = backupFileIfExists(spec.targetPath, paths.backups, appId);
    writeTextAtomic(spec.targetPath, next.content, 0o600);
    const updatedSource = readConnectionSource(spec.targetPath);
    return {
      ok: true,
      checkedAt: nowIso(),
      connection: buildAppConnection(spec, {
        key,
        profile,
        source: updatedSource.source,
        sourceError: updatedSource.error,
        modelIds,
      }),
      applied: true,
      backupPath,
    };
  }

  function updateAppConnectionProfile(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayUpdateAppConnectionProfileRequest = {},
  ): ModelGatewayUpdateAppConnectionProfileResponse {
    requireManagement(req);
    const profile = updateStoredAppConnectionProfile(payload);
    const key = readGatewayClientSecret();
    const modelIds = gatewayModelIds();
    return {
      ok: true,
      checkedAt: nowIso(),
      profile,
      connections: appConnectionSpecs().map((spec) => {
        const source = readConnectionSource(spec.targetPath);
        return buildAppConnection(spec, {
          key,
          profile: defaultAppConnectionProfileForSpec(spec, profile),
          source: source.source,
          sourceError: source.error,
          modelIds,
        });
      }),
    };
  }

  function applyAppConnections(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayApplyAppConnectionRequest = {},
  ): ModelGatewayApplyAppConnectionsResponse {
    requireManagement(req);
    const profile = updateStoredAppConnectionProfile(payload);
    const applied = appConnectionSpecs().map((spec) => applyAppConnection(req, {
      appId: spec.id,
      profile,
    }));
    return {
      ok: true,
      checkedAt: nowIso(),
      applied,
    };
  }

  function rollbackAppConnection(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayRollbackAppConnectionRequest = {},
  ): ModelGatewayRollbackAppConnectionResponse {
    requireManagement(req);
    const appId = normalizeAppConnectionId(payload.appId);
    if (!appId) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_invalid",
        "A valid app connection id is required.",
        400,
      );
    }
    const spec = appConnectionSpecs().find((item) => item.id === appId);
    if (!spec) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_not_found",
        `App connection '${appId}' was not found.`,
        404,
      );
    }
    const restoredFrom = latestAppConnectionBackupPath(paths.backups, appId);
    if (!restoredFrom) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_backup_missing",
        `No backup is available for '${appId}'.`,
        404,
      );
    }
    const backupPath = backupFileIfExists(spec.targetPath, paths.backups, appId);
    fs.mkdirSync(path.dirname(spec.targetPath), { recursive: true });
    fs.copyFileSync(restoredFrom, spec.targetPath);
    try {
      fs.chmodSync(spec.targetPath, 0o600);
    } catch {
      // Best effort for filesystems that do not support chmod.
    }
    const source = readConnectionSource(spec.targetPath);
    const modelIds = gatewayModelIds();
    return {
      ok: true,
      checkedAt: nowIso(),
      connection: buildAppConnection(spec, {
        key: readGatewayClientSecret(),
        profile: defaultAppConnectionProfileForSpec(spec),
        source: source.source,
        sourceError: source.error,
        modelIds,
      }),
      rolledBack: true,
      restoredFrom,
      backupPath,
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

    for (const scope of MODEL_GATEWAY_APP_SCOPES) {
      if (registry.activeProviders[scope] === next.id && (!next.enabled || !next.appScopes.includes(scope))) {
        delete registry.activeProviders[scope];
      }
    }

    const requestedActiveScopes = normalizeExplicitAppScopes(payload.setActiveScopes);
    for (const scope of requestedActiveScopes) {
      if (next.enabled && next.appScopes.includes(scope)) registry.activeProviders[scope] = next.id;
    }
    if (next.enabled) {
      for (const scope of next.appScopes) {
        if (!registry.activeProviders[scope]) registry.activeProviders[scope] = next.id;
      }
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

  function buildGatewayRouteSmokePayload(routeId: ModelGatewayRouteId, model: string, input: string): Record<string, unknown> {
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 96,
        stream: false,
        messages: [{ role: "user", content: input }],
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 96,
        stream: false,
        messages: [{ role: "user", content: input }],
      };
    }
    if (routeId === "openai_responses_compact") {
      return {
        model,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: input }],
          },
        ],
        stream: false,
        max_output_tokens: 96,
      };
    }
    return {
      model,
      input,
      stream: false,
      max_output_tokens: 96,
    };
  }

  async function testActiveRoute(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayActiveRouteSmokeRequest = {},
  ): Promise<ModelGatewayProviderTestResponse> {
    requireManagement(req);
    const scope = MODEL_GATEWAY_APP_SCOPES.includes(payload.scope as ModelGatewayAppScope)
      ? payload.scope as ModelGatewayAppScope
      : "codex";
    const routeId = defaultRouteIdForScope(scope);
    const routePath = ROUTES[routeId].paths[0] || "/v1/responses";
    const model = normalizeString(payload.model);
    const headersForDecision = {
      "x-studio-app-scope": scope,
    };
    const decision = resolveRouteDecision("POST", routePath, headersForDecision, model || null);
    const providerId = decision.provider?.id || "";
    const effectiveModel = model
      || decision.model?.resolved
      || decision.model?.requested
      || "test-model";
    if (!decision.provider || decision.mode === "missing-provider") {
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: null,
        latencyMs: 0,
        route: decision,
        responsePreview: null,
        error: {
          code: "model_gateway_active_route_missing",
          message: decision.reason || `No active route provider is available for ${scope}.`,
        },
      };
    }
    const registry = readRegistry();
    const key = readGatewayClientSecret();
    if (registry.clientAuth.enabled && !key) {
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: null,
        latencyMs: 0,
        route: decision,
        responsePreview: null,
        error: {
          code: "model_gateway_client_key_missing",
          message: "Gateway client auth is enabled but no local Gateway key is available for route smoke.",
        },
      };
    }

    const endpoint = getLifecycleStatus().endpointPolicy.preferredCliEndpoint;
    const targetUrl = new URL(routePath, `${stripTrailingV1(endpoint)}/`).toString();
    const headers = new Headers({
      "content-type": "application/json",
      "x-studio-app-scope": scope,
    });
    if (key) headers.set("authorization", `Bearer ${key}`);
    const startedAt = nowIso();
    const controller = new AbortController();
    const timeoutMs = typeof payload.timeoutMs === "number"
      ? Math.max(1_000, Math.floor(payload.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(buildGatewayRouteSmokePayload(
          routeId,
          effectiveModel,
          normalizeString(payload.input, "Reply with GATEWAY_OK"),
        )),
        signal: controller.signal,
      });
      const responseText = await response.text();
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const success = response.status >= 200 && response.status < 300;
      const responseProviderId = normalizeString(response.headers.get("x-openclaw-model-gateway-provider")) || providerId;
      return {
        ok: success,
        providerId: responseProviderId,
        checkedAt: nowIso(),
        statusCode: response.status,
        latencyMs,
        route: decision,
        responsePreview: previewText(responseText),
        error: success ? null : {
          code: "model_gateway_active_route_smoke_failed",
          message: `Active route smoke returned HTTP ${response.status}.`,
        },
      };
    } catch (error) {
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: null,
        latencyMs: Math.max(0, Date.now() - Date.parse(startedAt)),
        route: decision,
        responsePreview: null,
        error: {
          code: "model_gateway_active_route_smoke_failed",
          message: error instanceof Error ? error.message : "Active route smoke request failed.",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
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

  function resolveRouteDecision(
    method: string,
    requestedPath: string,
    headers?: HeaderMap,
    requestedModel: string | null = null,
  ): ModelGatewayRouteDecision {
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
        model: null,
        upstreamPath: null,
        upstreamUrl: null,
        reason: "No Model Gateway route matched this request.",
        failoverReason: null,
      };
    }

    const appScope = normalizeRequestAppScope(headers, route.appScope);
    const registry = readRegistry();
    const selection = resolveProviderSelection(registry, appScope, requestedModel);
    const provider = selection.provider;
    if (!provider) {
      return {
        routeId: route.routeId,
        method: normalizedMethod,
        requestedPath: pathname,
        appScope,
        mode: "missing-provider",
        provider: null,
        model: {
          requested: normalizeString(requestedModel || "") || null,
          resolved: selection.resolvedModel,
        },
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
      model: {
        requested: normalizeString(requestedModel || "") || null,
        resolved: selection.resolvedModel || normalizeString(requestedModel || "") || null,
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
    try {
      requireGatewayClient(req);
    } catch (error) {
      const authError = isModelGatewayServiceError(error)
        ? error
        : new ModelGatewayServiceError("model_gateway_client_auth_failed", "Studio Gateway client authentication failed.", 401);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: {
          routeId: null,
          method: req.method || "GET",
          requestedPath: req.url || "/",
          appScope: null,
          mode: "unsupported",
          provider: null,
          model: null,
          upstreamPath: null,
          upstreamUrl: null,
          reason: authError.message,
          failoverReason: null,
        },
        model: null,
        statusCode: authError.statusCode,
        outcome: "failure",
        errorCode: authError.code,
        errorMessage: authError.message,
      }));
      res.setHeader("WWW-Authenticate", "Bearer realm=\"Studio Gateway\"");
      sendJson(res, authError.statusCode, {
        error: {
          code: authError.code,
          message: authError.message,
        },
      });
      return;
    }
    const body = await readRequestBody(req);
    let bodyText = body.byteLength ? body.toString("utf8") : undefined;
    const requestModel = extractModelFromJsonText(bodyText);
    const decision = resolveRouteDecision(req.method || "GET", req.url || "/", req.headers, requestModel);
    if (decision.mode === "unsupported") {
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
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
        model: requestModel,
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
        model: requestModel,
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
        model: requestModel,
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
    const resolvedModel = decision.model?.resolved || null;
    if (resolvedModel && resolvedModel !== requestModel) {
      bodyText = replaceModelInJsonText(bodyText, resolvedModel);
    }
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
    let codexHistoryRecordBodyText = bodyText;
    let requestModelForLog = resolvedModel || requestModel;
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
        const enriched = useCodexResponsesAnthropicAdapter
          ? codexHistory.enrichRequest(bodyText)
          : null;
        if (enriched?.bodyText) codexHistoryRecordBodyText = enriched.bodyText;
        const codexToChat = useCodexResponsesAnthropicAdapter
          ? adaptCodexResponsesRequestToChat(enriched?.bodyText, {
            allowStreaming: true,
            reasoning: provider.reasoning,
          })
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
        if (enriched.bodyText) codexHistoryRecordBodyText = enriched.bodyText;
        const adapted = adaptCodexResponsesRequestToChat(enriched.bodyText, {
          allowStreaming: useCodexResponsesStreamingAdapter,
          reasoning: provider.reasoning,
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
            }, {
              requestBodyText: codexHistoryRecordBodyText,
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
          codexHistory.recordResponse(adaptedResponse, {
            requestBodyText: codexHistoryRecordBodyText,
          });
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
        codexHistory.recordResponse(adaptedResponse, {
          requestBodyText: codexHistoryRecordBodyText,
        });
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
    getClientAuth,
    updateClientAuth,
    listAppConnections,
    updateAppConnectionProfile,
    applyAppConnection,
    applyAppConnections,
    rollbackAppConnection,
    listGatewayModels,
    getRuntime,
    getDaemonService,
    manageDaemonService,
    detectProvider,
    upsertProvider,
    deleteProvider,
    setActiveProvider,
    setProviderSecret,
    testActiveRoute,
    testProvider,
    resolveRouteDecision,
    handleGatewayRequest,
  };
}
