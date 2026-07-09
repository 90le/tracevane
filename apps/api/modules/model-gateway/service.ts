import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import { hasConfiguredSecretInput } from "../../core/secret-ref.js";
import {
  MODEL_GATEWAY_ACCOUNT_CREDENTIAL_SOURCES,
  MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS,
  MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES,
  MODEL_GATEWAY_ACCOUNT_STATES,
  MODEL_GATEWAY_API_FORMATS,
  MODEL_GATEWAY_APP_CONNECTION_IDS,
  MODEL_GATEWAY_APP_SCOPES,
  MODEL_GATEWAY_AUTH_STRATEGIES,
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  MODEL_GATEWAY_PROVIDER_CATEGORIES,
  MODEL_GATEWAY_PROVIDER_SOURCE_TYPES,
  MODEL_GATEWAY_REASONING_EFFORT_PARAMS,
  MODEL_GATEWAY_REASONING_EFFORT_VALUE_MODES,
  MODEL_GATEWAY_REASONING_OUTPUT_FORMATS,
  MODEL_GATEWAY_REASONING_THINKING_PARAMS,
  MODEL_GATEWAY_ROUTE_IDS,
  type ModelGatewayAccountEntry,
  type ModelGatewayAccountProviderConfig,
  type ModelGatewayAccountProviderKind,
  type ModelGatewayAccountProviderRouting,
  type ModelGatewayAccountRoutingDiagnostics,
  type ModelGatewayApiFormat,
  type ModelGatewayActiveRouteStatus,
  type ModelGatewayActiveRouteSmokeRequest,
  type ModelGatewayAppConnection,
  type ModelGatewayAppConnectionBackup,
  type ModelGatewayAppConnectionBackupsResponse,
  type ModelGatewayAppConnectionBackupContentResponse,
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
  type ModelGatewayCodexAccountLoginPollRequest,
  type ModelGatewayCodexAccountLoginPollResponse,
  type ModelGatewayCodexAccountLoginStartRequest,
  type ModelGatewayCodexAccountLoginStartResponse,
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
  type ModelGatewayProviderEndpointProfile,
  type ModelGatewayProviderEndpointProfileInput,
  type ModelGatewayProviderDetectModelResult,
  type ModelGatewayProviderDetectProtocolResult,
  type ModelGatewayProviderDetectRequest,
  type ModelGatewayProviderDetectResponse,
  type ModelGatewayProviderHealthResetRequest,
  type ModelGatewayProviderHealthResetResponse,
  type ModelGatewayProviderFailover,
  type ModelGatewayProviderHealth,
  type ModelGatewayProviderInput,
  type ModelGatewayModelListResponse,
  type ModelGatewayModelListItem,
  type ModelGatewayErrorDiagnostics,
  type ModelGatewayNetworkErrorDiagnostics,
  type ModelGatewayProviderAccountRefreshResponse,
  type ModelGatewayProviderAccountUpdateRequest,
  type ModelGatewayProviderAccountUpdateResponse,
  type ModelGatewayProviderModel,
  type ModelGatewayProviderModelCatalog,
  type ModelGatewayProviderModelPricing,
  type ModelGatewayUnsupportedRoute,
  type ModelGatewayModelFeatures,
  type ModelGatewayProviderNetwork,
  type ModelGatewayProviderReasoning,
  type ModelGatewayProviderSecretResponse,
  type ModelGatewayProviderSourceType,
  type ModelGatewayProviderTestRequest,
  type ModelGatewayProviderTestResponse,
  type ModelGatewayProviderView,
  type ModelGatewayProvidersSummary,
  type ModelGatewayProxySource,
  type ModelGatewayProvidersResponse,
  type ModelGatewayRegistryState,
  type ModelGatewayRollbackAppConnectionRequest,
  type ModelGatewayRollbackAppConnectionResponse,
  type ModelGatewayRuntimeRequestLogEntry,
  type ModelGatewayRuntimeRequestOutcome,
  type ModelGatewayRuntimeResponse,
  type ModelGatewayRuntimeState,
  type ModelGatewayRuntimeUsage,
  type ModelGatewayRuntimeLatencyDistribution,
  type ModelGatewayRuntimeLatencySummary,
  type ModelGatewayRuntimeUsageSummary,
  type ModelGatewayRuntimeUsageSummaryBucket,
  type ModelGatewayUsageDateBucket,
  type ModelGatewayUsageRange,
  type ModelGatewayModelUsageRow,
  type ModelGatewayUsageLedgerResponse,
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
import { isTracevaneGatewayHttpAuthorized } from "../../gateway-http-auth.js";
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
import {
  ModelGatewayCodexStreamAdapterError,
  writeCodexResponsesSseFromChatSse,
} from "./codex-streaming.js";
import {
  ModelGatewayStreamAdapterError,
  writeAnthropicMessagesSseFromChatSse,
  writeAnthropicMessagesSseFromResponsesSse,
  writeChatCompletionsSseFromAnthropicMessagesSse,
  writeChatCompletionsSseFromResponsesSse,
  writeCodexResponsesSseFromAnthropicMessagesSse,
  writeCodexResponsesSseFromResponse,
} from "./protocol-streaming.js";
import {
  OpenAIResponsesChatAdapterError,
  adaptChatCompletionRequestToResponses,
  adaptResponsesToChatCompletion,
  isChatToOpenAIResponsesAdapterTarget,
} from "./responses-chat-adapter.js";
import { applyResponsesReasoningOptions, normalizeAnthropicReasoningOptions } from "./reasoning-options.js";
import { sanitizeAnthropicMessagesUpstreamBody, sanitizeOpenAIChatUpstreamBody, sanitizeOpenAIResponsesUpstreamBody } from "./openai-chat-compatibility.js";
import { createModelGatewayDaemonServicePlan } from "./supervisor.js";
import { MODEL_GATEWAY_UNSUPPORTED_ENDPOINTS } from "./unsupported-endpoints.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DETECT_PROVIDER_DEFAULT_TIMEOUT_MS = 20_000;
const DETECT_PROVIDER_MAX_TIMEOUT_MS = 30_000;
const DETECT_PROVIDER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_STREAMING_FIRST_BYTE_TIMEOUT_MS = 30_000;
const DEFAULT_STREAMING_IDLE_TIMEOUT_MS = 120_000;
const MODEL_GATEWAY_CIRCUIT_OPEN_RETRY_MS = 60_000;
const MAX_RUNTIME_REQUEST_LOG_ENTRIES = 200;
const MAX_USAGE_LEDGER_READ_ENTRIES = 20_000;
const MAX_USAGE_LEDGER_READ_BYTES = 16 * 1024 * 1024;
const REQUEST_LOG_PREVIEW_CHARS = 1_000;
const DEFAULT_UNKNOWN_MODEL_CONTEXT_WINDOW = 64_000;
const DEFAULT_UNKNOWN_MODEL_MAX_OUTPUT_TOKENS = 8_192;
const CLIENT_AUTH_SECRET_REF = "gateway:client-api-key";
const CODEX_ACCOUNT_PROVIDER_BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_ACCOUNT_AUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_ACCOUNT_AUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_ACCOUNT_DEVICE_USER_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const CODEX_ACCOUNT_DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const CODEX_ACCOUNT_DEVICE_VERIFICATION_URL = "https://auth.openai.com/codex/device";
const CODEX_ACCOUNT_DEVICE_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
const CODEX_ACCOUNT_DEFAULT_POLL_INTERVAL_SECONDS = 5;
const CODEX_ACCOUNT_LOGIN_TIMEOUT_MS = 15 * 60_000;
const CODEX_ACCOUNT_REFRESH_WINDOW_MS = 5 * 60_000;
const CODEX_ACCOUNT_AUTH_COOLDOWN_MS = 5 * 60_000;
const CODEX_ACCOUNT_UPSTREAM_COOLDOWN_MS = 5 * 60_000;
const CODEX_ACCOUNT_UPSTREAM_RETRY_AFTER_MAX_MS = 30 * 60_000;
const CODEX_ACCOUNT_USER_AGENT = "codex_cli_rs/0.133.0 (Tracevane Gateway; local)";
const CODEX_ACCOUNT_ORIGINATOR = "codex_cli_rs";
const CODEX_ACCOUNT_IMAGE_GENERATION_MAIN_MODEL = "gpt-5.4-mini";
const MODEL_GATEWAY_VISION_SMOKE_IMAGE_MIME_TYPE = "image/jpeg";
const MODEL_GATEWAY_VISION_SMOKE_IMAGE_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9UwooooAKKKKACiiigD/2Q==";
const MODEL_GATEWAY_VISION_SMOKE_PROMPT = "Identify the dominant color of the attached test image. Reply with one lowercase color word.";
const MODEL_GATEWAY_SMOKE_SENTINEL = "GATEWAY_OK";
const MODEL_GATEWAY_DIAGNOSTIC_SMOKE_HEADER = "x-tracevane-gateway-smoke";
const MODEL_GATEWAY_DIAGNOSTIC_ERROR_SMOKE_HEADER = "x-tracevane-gateway-smoke-error";
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const DAEMON_SERVICE_ACTIONS = ["preview", "install", "ensure-running", "start", "stop", "restart", "status"] as const;

type HeaderMap = http.IncomingHttpHeaders | Record<string, string | string[] | undefined> | Headers;
type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };

type CodexDeviceLoginSession = {
  loginId: string;
  providerId: string;
  providerName: string;
  setActiveScopes: ModelGatewayAppScope[];
  deviceAuthId: string;
  userCode: string;
  expiresAtMs: number;
  pollIntervalSeconds: number;
  createdAt: string;
};


type CodexDeviceLoginSessionStore = {
  version: 1;
  updatedAt: string;
  sessions: CodexDeviceLoginSession[];
};

type CodexTokenBundle = {
  type: "codex";
  tokens: {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
  expires_at?: string;
  email?: string;
  plan_type?: string;
  account_hash?: string;
};

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
  openai_images_generations: {
    paths: ["/v1/images/generations"],
    appScope: "openclaw",
    protocol: "openai_responses",
  },
  openai_images_edits: {
    paths: ["/v1/images/edits"],
    appScope: "openclaw",
    protocol: "openai_responses",
  },
  openai_audio_transcriptions: {
    paths: ["/v1/audio/transcriptions"],
    appScope: "openclaw",
    protocol: "openai_chat",
  },
  openai_audio_translations: {
    paths: ["/v1/audio/translations"],
    appScope: "openclaw",
    protocol: "openai_chat",
  },
  openai_audio_speech: {
    paths: ["/v1/audio/speech"],
    appScope: "openclaw",
    protocol: "openai_chat",
  },
  anthropic_messages: {
    paths: ["/v1/messages", "/claude/v1/messages"],
    appScope: "claude-code",
    protocol: "anthropic_messages",
  },
  anthropic_messages_count_tokens: {
    paths: ["/v1/messages/count_tokens", "/claude/v1/messages/count_tokens"],
    appScope: "claude-code",
    protocol: "anthropic_messages",
  },
};

export interface ModelGatewayPaths {
  root: string;
  registry: string;
  secrets: string;
  runtime: string;
  usageLedger: string;
  daemonRuntime: string;
  daemonPid: string;
  portLock: string;
  codexHistory: string;
  codexLoginSessions: string;
  backups: string;
  logs: string;
}

const MODEL_GATEWAY_SERVICE_ERROR_DETAIL_ALLOWLIST = new Set([
  "endpoint",
  "routeId",
  "providerId",
  "scope",
  "appScope",
  "requestedPath",
  "requestedModel",
  "statusCode",
  "upstreamStatusCode",
  "retryAfterMs",
  "feasibility",
  "reference",
]);

function serviceErrorDetailValueIsSafe(value: unknown): value is string | number | boolean | null {
  return value === null
    || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean";
}

function sanitizeModelGatewayServiceErrorDetails(details: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!details) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!MODEL_GATEWAY_SERVICE_ERROR_DETAIL_ALLOWLIST.has(key)) continue;
    if (!serviceErrorDetailValueIsSafe(value)) continue;
    sanitized[key] = value;
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

export class ModelGatewayServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ModelGatewayServiceError";
  }

  toShape(): { code: string; message: string; statusCode: number; details: Record<string, unknown> | null } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: sanitizeModelGatewayServiceErrorDetails(this.details),
    };
  }
}

export function isModelGatewayServiceError(error: unknown): error is ModelGatewayServiceError {
  return error instanceof ModelGatewayServiceError;
}

export function resolveModelGatewayPaths(config: TracevaneServerConfig): ModelGatewayPaths {
  const root = path.join(config.openclawRoot, "tracevane", "model-gateway");
  return {
    root,
    registry: path.join(root, "providers.json"),
    secrets: path.join(root, "secrets.json"),
    runtime: path.join(root, "runtime.json"),
    usageLedger: path.join(root, "usage-ledger.jsonl"),
    daemonRuntime: path.join(root, "daemon-runtime.json"),
    daemonPid: path.join(root, "daemon.pid"),
    portLock: path.join(root, "gateway-port.lock"),
    codexHistory: path.join(root, "codex-history.json"),
    codexLoginSessions: path.join(root, "codex-login-sessions.json"),
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

function metadataBoolean(metadata: unknown, keys: string[], fallback = false): boolean {
  if (!isRecord(metadata)) return fallback;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) return true;
      if (["0", "false", "no", "off"].includes(normalized)) return false;
    }
  }
  return fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const normalized = numberOrNull(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  return isRecord(value) && isRecord(value[key]) ? value[key] as Record<string, unknown> : {};
}

function normalizeRuntimeUsage(value: unknown): ModelGatewayRuntimeUsage | null {
  if (!isRecord(value)) return null;
  const inputDetails = nestedRecord(value, "input_tokens_details");
  const outputDetails = nestedRecord(value, "output_tokens_details");
  const promptDetails = nestedRecord(value, "prompt_tokens_details");
  const completionDetails = nestedRecord(value, "completion_tokens_details");
  const inputTokens = firstNumber(value.input_tokens, value.prompt_tokens, value.inputTokens, value.promptTokens);
  const outputTokens = firstNumber(value.output_tokens, value.completion_tokens, value.outputTokens, value.completionTokens);
  const cacheReadTokens = firstNumber(
    value.cache_read_input_tokens,
    value.cache_read_tokens,
    value.cacheReadTokens,
    value.cached_tokens,
    inputDetails.cached_tokens,
    inputDetails.cache_read_tokens,
    promptDetails.cached_tokens,
    promptDetails.cache_read_tokens,
  );
  const cacheCreationTokens = firstNumber(
    value.cache_creation_input_tokens,
    value.cache_creation_tokens,
    value.cacheCreationTokens,
    inputDetails.cache_creation_tokens,
    promptDetails.cache_creation_tokens,
    outputDetails.cache_creation_tokens,
    completionDetails.cache_creation_tokens,
  );
  const imageGenerationRequests = firstNumber(value.image_generation_requests, value.imageGenerationRequests);
  const imagesGenerated = firstNumber(value.images_generated, value.imagesGenerated, value.image_count, value.imageCount);
  const imageEditRequests = firstNumber(value.image_edit_requests, value.imageEditRequests);
  const audioInputRequests = firstNumber(value.audio_input_requests, value.audioInputRequests);
  const audioOutputRequests = firstNumber(value.audio_output_requests, value.audioOutputRequests);
  const explicitTotalTokens = firstNumber(value.total_tokens, value.totalTokens);
  const totalTokens = explicitTotalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0));
  const hasUsageSignal = [
    inputTokens,
    outputTokens,
    explicitTotalTokens,
    cacheReadTokens,
    cacheCreationTokens,
    imageGenerationRequests,
    imagesGenerated,
    imageEditRequests,
    audioInputRequests,
    audioOutputRequests,
  ].some((item) => item !== null);
  if (!hasUsageSignal) return null;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens,
    cacheReadTokens: cacheReadTokens ?? 0,
    cacheCreationTokens: cacheCreationTokens ?? 0,
    imageGenerationRequests: imageGenerationRequests ?? 0,
    imagesGenerated: imagesGenerated ?? 0,
    imageEditRequests: imageEditRequests ?? 0,
    audioInputRequests: audioInputRequests ?? 0,
    audioOutputRequests: audioOutputRequests ?? 0,
  };
}

function extractRuntimeUsage(value: unknown): ModelGatewayRuntimeUsage | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(raw)) return null;
  return normalizeRuntimeUsage(raw.usage) || normalizeRuntimeUsage(raw);
}

function parseUsagePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function countImagesApiData(value: unknown): number {
  const raw = parseUsagePayload(value);
  if (!isRecord(raw) || !Array.isArray(raw.data)) return 0;
  return raw.data.filter((item) =>
    isRecord(item)
    && (normalizeString(item.b64_json) || normalizeString(item.url))
  ).length;
}

function runtimeUsageForRoute(routeId: ModelGatewayRouteId | null, value: unknown): ModelGatewayRuntimeUsage | null {
  const extracted = extractRuntimeUsage(value);
  const usage = extracted ? { ...extracted } : zeroRuntimeUsage();
  let hasMediaSignal = false;
  if (routeId === "openai_images_generations") {
    usage.imageGenerationRequests += 1;
    usage.imagesGenerated += countImagesApiData(value);
    hasMediaSignal = true;
  } else if (routeId === "openai_images_edits") {
    usage.imageEditRequests += 1;
    usage.imagesGenerated += countImagesApiData(value);
    hasMediaSignal = true;
  } else if (routeId === "openai_audio_transcriptions" || routeId === "openai_audio_translations") {
    usage.audioInputRequests += 1;
    hasMediaSignal = true;
  } else if (routeId === "openai_audio_speech") {
    usage.audioOutputRequests += 1;
    hasMediaSignal = true;
  }
  return extracted || hasMediaSignal ? usage : null;
}

function runtimeUsageForSuccessfulRequest(
  routeId: ModelGatewayRouteId | null,
  requestBodyText: string | undefined,
  responseValue: unknown,
): ModelGatewayRuntimeUsage {
  return runtimeUsageForAttemptedRequest(routeId, requestBodyText, responseValue, { estimateOutputFallback: true });
}

function runtimeUsageForAttemptedRequest(
  routeId: ModelGatewayRouteId | null,
  requestBodyText: string | undefined,
  responseValue?: unknown,
  options: { estimateOutputFallback?: boolean } = {},
): ModelGatewayRuntimeUsage {
  const providerUsage = responseValue === undefined ? null : runtimeUsageForRoute(routeId, responseValue);
  if (providerUsage) return providerUsage;
  const inputTokens = requestBodyText === undefined ? 0 : estimateInputTokensForRoute(routeId, requestBodyText);
  const outputTokens = options.estimateOutputFallback && responseValue !== undefined
    ? estimateOutputTokensFromResponse(responseValue)
    : 0;
  return {
    ...zeroRuntimeUsage(),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function zeroRuntimeUsage(): ModelGatewayRuntimeUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    imageGenerationRequests: 0,
    imagesGenerated: 0,
    imageEditRequests: 0,
    audioInputRequests: 0,
    audioOutputRequests: 0,
  };
}

function addRuntimeUsage(target: ModelGatewayRuntimeUsage, value: ModelGatewayRuntimeUsage | null | undefined): void {
  if (!value) return;
  target.inputTokens += value.inputTokens;
  target.outputTokens += value.outputTokens;
  target.totalTokens += value.totalTokens;
  target.cacheReadTokens += value.cacheReadTokens;
  target.cacheCreationTokens += value.cacheCreationTokens;
  target.imageGenerationRequests += value.imageGenerationRequests;
  target.imagesGenerated += value.imagesGenerated;
  target.imageEditRequests += value.imageEditRequests;
  target.audioInputRequests += value.audioInputRequests;
  target.audioOutputRequests += value.audioOutputRequests;
}

function emptyRuntimeLatencyDistribution(): ModelGatewayRuntimeLatencyDistribution {
  return {
    requestCount: 0,
    averageMs: null,
    minMs: null,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
    maxMs: null,
  };
}

function emptyRuntimeLatencySummary(): ModelGatewayRuntimeLatencySummary {
  return {
    ...emptyRuntimeLatencyDistribution(),
    firstByte: emptyRuntimeLatencyDistribution(),
  };
}

function percentileValue(sortedValues: number[], percentile: number): number | null {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((percentile / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

function summarizeRuntimeLatencyDistribution(values: Array<number | null | undefined>): ModelGatewayRuntimeLatencyDistribution {
  const durations = values
    .map((value) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (!durations.length) return emptyRuntimeLatencyDistribution();
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    requestCount: durations.length,
    averageMs: Math.round(total / durations.length),
    minMs: durations[0],
    p50Ms: percentileValue(durations, 50),
    p95Ms: percentileValue(durations, 95),
    p99Ms: percentileValue(durations, 99),
    maxMs: durations[durations.length - 1],
  };
}

function summarizeRuntimeLatency(requestLog: ModelGatewayRuntimeRequestLogEntry[]): ModelGatewayRuntimeLatencySummary {
  return {
    ...summarizeRuntimeLatencyDistribution(requestLog.map((entry) => entry.durationMs)),
    firstByte: summarizeRuntimeLatencyDistribution(requestLog.map((entry) => entry.firstByteMs)),
  };
}

function createRuntimeUsageBucket(
  key: string,
  label: string,
  entry: ModelGatewayRuntimeRequestLogEntry,
  model: string | null = entry.model,
): ModelGatewayRuntimeUsageSummaryBucket {
  return {
    key,
    label,
    providerId: entry.providerId,
    providerName: entry.providerName,
    accountId: entry.accountId || null,
    accountHash: entry.accountHash || null,
    model,
    requestCount: 0,
    meteredRequestCount: 0,
    latestRequestAt: null,
    usage: zeroRuntimeUsage(),
  };
}

interface RuntimeUsageModelBucket {
  key: string;
  label: string;
  model: string | null;
}

type RuntimeUsageModelResolver = (entry: ModelGatewayRuntimeRequestLogEntry) => RuntimeUsageModelBucket;

function defaultRuntimeUsageModelBucket(entry: ModelGatewayRuntimeRequestLogEntry): RuntimeUsageModelBucket {
  const model = normalizeString(entry.model || "") || null;
  return {
    key: model || "unknown-model",
    label: model || "unknown model",
    model,
  };
}

function summarizeRuntimeUsage(
  requestLog: ModelGatewayRuntimeRequestLogEntry[],
  modelBucketForEntry: RuntimeUsageModelResolver = defaultRuntimeUsageModelBucket,
): ModelGatewayRuntimeUsageSummary {
  const summary: ModelGatewayRuntimeUsageSummary = {
    requestCount: requestLog.length,
    meteredRequestCount: 0,
    latestRequestAt: requestLog[requestLog.length - 1]?.finishedAt || null,
    usage: zeroRuntimeUsage(),
    latency: summarizeRuntimeLatency(requestLog),
    byProvider: [],
    byModel: [],
    byAccount: [],
  };
  const providers = new Map<string, ModelGatewayRuntimeUsageSummaryBucket>();
  const models = new Map<string, ModelGatewayRuntimeUsageSummaryBucket>();
  const accounts = new Map<string, ModelGatewayRuntimeUsageSummaryBucket>();
  const bucket = (
    map: Map<string, ModelGatewayRuntimeUsageSummaryBucket>,
    key: string,
    label: string,
    entry: ModelGatewayRuntimeRequestLogEntry,
    model: string | null = entry.model,
  ) => {
    let existing = map.get(key);
    if (!existing) {
      existing = createRuntimeUsageBucket(key, label, entry, model);
      map.set(key, existing);
    } else {
      if (existing.providerId !== entry.providerId) {
        existing.providerId = null;
        existing.providerName = "multi-provider";
      }
      if ((existing.accountHash || existing.accountId) !== (entry.accountHash || entry.accountId || null)) {
        existing.accountId = null;
        existing.accountHash = null;
      }
      if (existing.model !== model) {
        existing.model = null;
      }
    }
    existing.requestCount += 1;
    existing.latestRequestAt = entry.finishedAt;
    if (entry.usage) {
      existing.meteredRequestCount += 1;
      addRuntimeUsage(existing.usage, entry.usage);
    }
  };

  for (const entry of requestLog) {
    if (entry.usage) {
      summary.meteredRequestCount += 1;
      addRuntimeUsage(summary.usage, entry.usage);
    }
    const providerKey = entry.providerId || "unknown-provider";
    bucket(providers, providerKey, entry.providerName || entry.providerId || "unknown provider", entry);
    const modelBucket = modelBucketForEntry(entry);
    bucket(models, modelBucket.key, modelBucket.label, entry, modelBucket.model);
    if (entry.accountId || entry.accountHash) {
      const accountKey = `${providerKey}:${entry.accountHash || entry.accountId || "unknown-account"}`;
      bucket(accounts, accountKey, entry.accountId || entry.accountHash || "unknown account", entry);
    }
  }

  const ordered = (map: Map<string, ModelGatewayRuntimeUsageSummaryBucket>) => (
    [...map.values()]
      .sort((left, right) => (
        right.usage.totalTokens - left.usage.totalTokens
        || right.meteredRequestCount - left.meteredRequestCount
        || right.requestCount - left.requestCount
        || left.label.localeCompare(right.label)
      ))
      .slice(0, 12)
  );
  summary.byProvider = ordered(providers);
  summary.byModel = ordered(models);
  summary.byAccount = ordered(accounts);
  return summary;
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

function normalizeModelPricing(value: unknown): ModelGatewayProviderModel["pricing"] | undefined {
  if (!isRecord(value)) return undefined;
  const numberField = (key: string): number | null | undefined => {
    const raw = value[key];
    if (raw === null) return null;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return undefined;
    return raw;
  };
  const pricing: NonNullable<ModelGatewayProviderModel["pricing"]> = {};
  const currency = normalizeString(value.currency).toUpperCase();
  if (currency) pricing.currency = currency.slice(0, 8);
  for (const key of [
    "inputPer1M",
    "outputPer1M",
    "cacheReadPer1M",
    "cacheCreationPer1M",
    "longContextInputThreshold",
    "longContextInputMultiplier",
    "longContextOutputMultiplier",
    "imageGenerationPerImage",
    "imageEditPerRequest",
    "audioInputPerRequest",
    "audioOutputPerRequest",
  ] as const) {
    const normalized = numberField(key);
    if (normalized !== undefined) pricing[key] = normalized;
  }
  return Object.keys(pricing).length ? pricing : undefined;
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
        features: isRecord(model.features) ? compactModelFeatures({
          text: typeof model.features.text === "boolean" ? model.features.text : undefined,
          streaming: typeof model.features.streaming === "boolean" ? model.features.streaming : undefined,
          tools: typeof model.features.tools === "boolean" ? model.features.tools : undefined,
          vision: typeof model.features.vision === "boolean" ? model.features.vision : undefined,
          reasoning: typeof model.features.reasoning === "boolean" ? model.features.reasoning : undefined,
          responses: typeof model.features.responses === "boolean" ? model.features.responses : undefined,
          imageGeneration: typeof model.features.imageGeneration === "boolean" ? model.features.imageGeneration : undefined,
          audioInput: typeof model.features.audioInput === "boolean" ? model.features.audioInput : undefined,
          audioOutput: typeof model.features.audioOutput === "boolean" ? model.features.audioOutput : undefined,
        }) : undefined,
        pricing: normalizeModelPricing(model.pricing),
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

function positiveIntegerOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function firstPositiveInteger(...values: unknown[]): number | null {
  for (const value of values) {
    const normalized = numberOrNull(value);
    if (normalized !== null && normalized > 0) return normalized;
  }
  return null;
}

function firstBooleanLike(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value > 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "supported", "enabled", "available", "1"].includes(normalized)) return true;
      if (["false", "no", "unsupported", "disabled", "unavailable", "0"].includes(normalized)) return false;
    }
  }
  return null;
}

function mergeModelBudgetMinimum(current: number | null, next: unknown): number | null {
  const normalized = positiveIntegerOrNull(next);
  if (normalized === null) return current;
  if (current === null) return normalized;
  return Math.min(current, normalized);
}

function providerModelLookupEntries(provider: ModelGatewayProvider): Map<string, string> {
  const entries = new Map<string, string>();
  const addCatalog = (catalog: ModelGatewayProviderModelCatalog | null | undefined) => {
    if (!catalog) return;
    for (const model of catalog.models) {
      const modelId = normalizeString(model.id);
      if (!modelId) continue;
      entries.set(normalizeModelLookupKey(modelId), modelId);
      for (const alias of model.aliases || []) {
        const key = normalizeModelLookupKey(alias);
        if (key) entries.set(key, modelId);
      }
    }
    for (const [alias, modelId] of Object.entries(catalog.aliases || {})) {
      const key = normalizeModelLookupKey(alias);
      const target = normalizeString(modelId);
      if (key && target) entries.set(key, target);
    }
    const defaultModel = normalizeString(catalog.defaultModel || "");
    if (defaultModel && !entries.has(normalizeModelLookupKey(defaultModel))) {
      entries.set(normalizeModelLookupKey(defaultModel), defaultModel);
    }
  };
  addCatalog(provider.models);
  for (const profile of provider.endpointProfiles) addCatalog(profile.models);
  return entries;
}

function createRuntimeUsageModelResolver(registry: ModelGatewayRegistryState): RuntimeUsageModelResolver {
  const lookups = new Map(registry.providers.map((provider) => [provider.id, providerModelLookupEntries(provider)]));
  return (entry) => {
    const requestedModel = normalizeString(entry.model || "");
    const lookup = entry.providerId ? lookups.get(entry.providerId) : null;
    const model = requestedModel && lookup
      ? lookup.get(normalizeModelLookupKey(requestedModel)) || requestedModel
      : requestedModel;
    return {
      key: model || "unknown-model",
      label: model || "unknown model",
      model: model || null,
    };
  };
}

const MODEL_GATEWAY_MODEL_FEATURE_KEYS = [
  "text",
  "streaming",
  "tools",
  "vision",
  "reasoning",
  "responses",
  "imageGeneration",
  "audioInput",
  "audioOutput",
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
  const compacted = Object.fromEntries(
    MODEL_GATEWAY_MODEL_FEATURE_KEYS
      .filter((key) => typeof features[key] === "boolean")
      .map((key) => [key, features[key]]),
  ) as ModelGatewayModelFeatures;
  if (compacted.imageGeneration === true) {
    compacted.text = false;
  }
  return compacted;
}

const CODEX_CATALOG_DEFAULT_CONTEXT_WINDOW = 128_000;
const CODEX_CATALOG_DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const CODEX_CATALOG_BASE_INSTRUCTIONS = "You are Codex, a coding agent. Follow the user's instructions and use available tools when needed.";
const CODEX_CATALOG_TRUNCATION_POLICY = { mode: "tokens", limit: 10_000 };
const CODEX_CATALOG_MODEL_MESSAGES = {
  instructions_template: CODEX_CATALOG_BASE_INSTRUCTIONS,
  instructions_variables: {
    personality_default: "",
    personality_friendly: "",
    personality_pragmatic: "",
  },
};

function codexCatalogReasoningLevels(modelId: string, features: ModelGatewayModelFeatures): Array<{ effort: string; description: string; limit: number }> {
  if (features.reasoning !== true) return [];
  if (!modelNameMatches(modelId, [/^gpt-5(?:\b|-|_|\.)/, /^o[134](?:\b|-|_|\.)/])) return [];
  return [
    { effort: "low", limit: 1_024 },
    { effort: "medium", limit: 4_096 },
    { effort: "high", limit: 8_192 },
  ].map((level) => ({ ...level, description: level.effort }));
}

function codexCatalogInputModalities(features: ModelGatewayModelFeatures): string[] {
  const modalities = ["text"];
  if (features.vision === true) modalities.push("image");
  return modalities;
}

function modelNameMatches(modelId: string, patterns: RegExp[]): boolean {
  const normalized = modelId.trim().toLowerCase();
  return patterns.some((pattern) => pattern.test(normalized));
}

function knownModelDefaults(modelId: string): Partial<ModelGatewayProviderModel> {
  const features: ModelGatewayModelFeatures = {
    text: true,
    streaming: true,
    responses: true,
  };

  if (modelNameMatches(modelId, [/^gpt-image-\d+(?:\b|-|_|\.)/, /^image-\d+(?:\b|-|_|\.)/, /^dall-e(?:\b|-|_|\.)/])) {
    return {
      features: {
        text: false,
        streaming: false,
        tools: false,
        vision: true,
        reasoning: false,
        responses: true,
        imageGeneration: true,
      },
    };
  }
  if (modelNameMatches(modelId, [/^(?:gpt-4o(?:-mini)?-)?transcribe(?:\b|-|_|\.)/, /^whisper(?:\b|-|_|\.)/, /^gpt-4o(?:-mini)?-transcribe(?:\b|-|_|\.)/])) {
    return {
      contextWindow: 16_000,
      maxOutputTokens: 2_000,
      features: {
        text: false,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: true,
        audioOutput: false,
      },
    };
  }
  if (modelNameMatches(modelId, [/^tts(?:\b|-|_|\.)/, /^gpt-4o(?:-mini)?-tts(?:\b|-|_|\.)/])) {
    return {
      features: {
        text: true,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: false,
        audioOutput: true,
      },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-audio(?:\b|-|_|\.)/])) {
    return {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      features: {
        ...features,
        vision: false,
        tools: true,
        reasoning: false,
        audioInput: true,
        audioOutput: true,
      },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-realtime-2(?:\b|-|_|\.)/, /^gpt-realtime-2$/])) {
    return {
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      features: {
        ...features,
        vision: true,
        tools: true,
        reasoning: true,
        audioInput: true,
        audioOutput: true,
      },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-realtime(?:\b|-|_|\.)/])) {
    return {
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      features: {
        ...features,
        vision: true,
        tools: true,
        reasoning: false,
        audioInput: true,
        audioOutput: true,
      },
    };
  }

  if (modelNameMatches(modelId, [/^gpt-5\.3-codex-spark(?:\b|-|_|\.)/, /^gpt-5\.3-codex-spark$/])) {
    return {
      contextWindow: 128_000,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-5\.(?:4|5)-mini(?:\b|-|_|\.)/, /^gpt-5\.3-codex(?:\b|-|_|\.)/, /^gpt-5\.3-codex$/])) {
    return {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-5\.(?:4|5)(?:\b|-|_)/, /^gpt-5\.(?:4|5)$/])) {
    return {
      contextWindow: 1_050_000,
      maxOutputTokens: 128_000,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-5(?:\b|-|_|\.)/, /^o[134](?:\b|-|_|\.)/])) {
    return {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-4\.1(?:\b|-|_)/, /^gpt-4\.1$/])) {
    return {
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      features: { ...features, vision: true, tools: true, reasoning: false },
    };
  }
  if (modelNameMatches(modelId, [/^gpt-4o(?:\b|-|_)/, /^gpt-4o$/])) {
    return {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      features: { ...features, vision: true, tools: true, reasoning: false },
    };
  }
  if (modelNameMatches(modelId, [/claude.*(?:opus|sonnet).*4[-.]?[678]\b/, /claude.*4[-.]?[678].*(?:opus|sonnet)/])) {
    return {
      contextWindow: 1_000_000,
      maxOutputTokens: 64_000,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/claude/])) {
    return {
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/gemini-3/, /gemini-2\.5/])) {
    return {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/gemini/])) {
    return {
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
      features: { ...features, vision: true, tools: true, reasoning: modelNameMatches(modelId, [/thinking/, /pro/]) },
    };
  }
  if (modelNameMatches(modelId, [/deepseek/])) {
    const isReasoner = modelNameMatches(modelId, [/reasoner/, /r1/]);
    return {
      contextWindow: 64_000,
      maxOutputTokens: 8_000,
      features: { ...features, tools: !isReasoner, reasoning: isReasoner, vision: false },
    };
  }
  if (modelNameMatches(modelId, [/^glm[-_]?5\.2(?:$|[-_:/\s\[])/])) {
    return {
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      features: { ...features, vision: modelNameMatches(modelId, [/vl/, /vision/, /v$/]), tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/^glm[-_]?5/, /^glm[-_]?4\.[56]/])) {
    return {
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
      features: { ...features, vision: modelNameMatches(modelId, [/vl/, /vision/, /v$/]), tools: true, reasoning: true },
    };
  }
  if (modelNameMatches(modelId, [/qwen/])) {
    return {
      contextWindow: modelNameMatches(modelId, [/1m/, /long/]) ? 1_000_000 : 128_000,
      maxOutputTokens: 8_192,
      features: {
        ...features,
        vision: modelNameMatches(modelId, [/vl/, /omni/, /vision/]),
        tools: true,
        reasoning: modelNameMatches(modelId, [/qwq/, /qvq/, /qwen3/, /thinking/]),
      },
    };
  }
  if (modelNameMatches(modelId, [/grok/])) {
    return {
      contextWindow: modelNameMatches(modelId, [/build/]) ? 256_000 : 256_000,
      maxOutputTokens: 32_768,
      features: { ...features, vision: true, tools: true, reasoning: true },
    };
  }

  return { features };
}

function collectModelItemSignals(value: unknown, depth = 0): string[] {
  if (depth > 2 || value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value).toLowerCase()];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectModelItemSignals(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => [
    key.toLowerCase(),
    ...collectModelItemSignals(item, depth + 1),
  ]);
}

function modelItemHasSignal(signals: string[], patterns: RegExp[]): boolean {
  return signals.some((signal) => patterns.some((pattern) => pattern.test(signal)));
}

function modelItemCapabilitySources(item: Record<string, unknown>): Record<string, unknown>[] {
  return [
    item,
    isRecord(item.features) ? item.features : null,
    isRecord(item.capabilities) ? item.capabilities : null,
    isRecord(item.supports) ? item.supports : null,
    isRecord(item.modalities) ? item.modalities : null,
  ].filter((source): source is Record<string, unknown> => source !== null);
}

function modelItemBooleanCapability(item: Record<string, unknown>, keys: string[]): boolean | null {
  const sources = modelItemCapabilitySources(item);
  for (const source of sources) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const value = firstBooleanLike(source[key]);
        if (value !== null) return value;
      }
    }
  }
  return null;
}

function modelItemExplicitVisionCapability(item: Record<string, unknown>): boolean | null {
  const explicit = modelItemBooleanCapability(item, ["vision", "image", "imageInput", "image_input", "multimodal"]);
  if (explicit !== null) return explicit;

  const sources = modelItemCapabilitySources(item);
  const modalityKeys = [
    "input_modalities",
    "inputModalities",
    "input_modes",
    "inputModes",
    "input",
    "modalities",
    "supported_modalities",
    "supportedModalities",
  ];
  const modalities = sources.flatMap((source) => modalityKeys.flatMap((key) => collectModelItemSignals(source[key])));
  return modelItemHasSignal(modalities, [/^image$/, /^vision$/, /^image[_ -]?input$/, /^multimodal$/])
    ? true
    : null;
}

function modelItemExplicitImageGenerationCapability(item: Record<string, unknown>, modelId: string, signals: string[]): boolean | null {
  const explicit = modelItemBooleanCapability(item, [
    "imageGeneration",
    "image_generation",
    "imageOutput",
    "image_output",
    "textToImage",
    "text_to_image",
  ]);
  if (explicit !== null) return explicit;
  return modelNameMatches(modelId, [/^gpt-image-\d+(?:\b|-|_|\.)/, /^image-\d+(?:\b|-|_|\.)/, /^dall-e(?:\b|-|_|\.)/])
    || modelItemHasSignal(signals, [/image[_ -]?generation/, /text[_ -]?to[_ -]?image/, /^image[_ -]?output$/])
    ? true
    : null;
}

function modelItemExplicitAudioCapability(
  item: Record<string, unknown>,
  keys: string[],
  signals: string[],
  direction: "input" | "output",
): boolean | null {
  const explicit = modelItemBooleanCapability(item, keys);
  if (explicit !== null) return explicit;

  const sources = modelItemCapabilitySources(item);
  const modalityKeys = direction === "output"
    ? [
      "output_modalities",
      "outputModalities",
      "output",
      "supported_output_modalities",
      "supportedOutputModalities",
    ]
    : [
      "input_modalities",
      "inputModalities",
      "input",
      "supported_modalities",
      "supportedModalities",
      "modalities",
  ];
  const modalities = sources.flatMap((source) => modalityKeys.flatMap((key) => collectModelItemSignals(source[key])));
  const haystack = direction === "output" ? modalities : [...signals, ...modalities];
  return modelItemHasSignal(haystack, [/^audio$/, /audio[_ -]?(?:input|output)/])
    ? true
    : null;
}


function modelItemLimitObject(item: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(item.limit) ? item.limit : null;
}

function modelItemPricingNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function modelItemPricing(item: Record<string, unknown>): ModelGatewayProviderModelPricing | undefined {
  const cost = isRecord(item.cost) ? item.cost : null;
  if (!cost) return normalizeModelPricing(item.pricing);
  const pricing: ModelGatewayProviderModelPricing = {
    currency: "USD",
  };
  const input = modelItemPricingNumber(cost.input);
  const output = modelItemPricingNumber(cost.output);
  const cacheRead = modelItemPricingNumber(cost.cache_read ?? cost.cacheRead);
  const cacheWrite = modelItemPricingNumber(cost.cache_write ?? cost.cacheWrite);
  const inputAudio = modelItemPricingNumber(cost.input_audio ?? cost.inputAudio);
  const outputAudio = modelItemPricingNumber(cost.output_audio ?? cost.outputAudio);
  if (input !== null && input >= 0) pricing.inputPer1M = input;
  if (output !== null && output >= 0) pricing.outputPer1M = output;
  if (cacheRead !== null && cacheRead >= 0) pricing.cacheReadPer1M = cacheRead;
  if (cacheWrite !== null && cacheWrite >= 0) pricing.cacheCreationPer1M = cacheWrite;
  if (inputAudio !== null && inputAudio >= 0) pricing.audioInputPerRequest = inputAudio;
  if (outputAudio !== null && outputAudio >= 0) pricing.audioOutputPerRequest = outputAudio;
  const tiers = Array.isArray(cost.tiers) ? cost.tiers.filter(isRecord) : [];
  const contextTier = tiers
    .map((tier) => ({
      threshold: isRecord(tier.tier) ? positiveIntegerOrNull(tier.tier.size) : null,
      input: modelItemPricingNumber(tier.input),
      output: modelItemPricingNumber(tier.output),
    }))
    .filter((tier) => tier.threshold !== null)
    .sort((left, right) => (left.threshold || 0) - (right.threshold || 0))[0];
  if (contextTier?.threshold) pricing.longContextInputThreshold = contextTier.threshold;
  if (contextTier?.input !== null && contextTier?.input !== undefined && input && input > 0) {
    pricing.longContextInputMultiplier = contextTier.input / input;
  }
  if (contextTier?.output !== null && contextTier?.output !== undefined && output && output > 0) {
    pricing.longContextOutputMultiplier = contextTier.output / output;
  }
  return Object.keys(pricing).length > 1 ? pricing : normalizeModelPricing(item.pricing);
}

function inferModelFeatures(modelId: string, item?: Record<string, unknown>): ModelGatewayModelFeatures {
  const known = knownModelDefaults(modelId).features || {};
  const signals = item ? collectModelItemSignals(item) : [];
  const imageGeneration = modelItemExplicitImageGenerationCapability(item || {}, modelId, signals) ?? known.imageGeneration;
  const audioInput = modelItemExplicitAudioCapability(item || {}, ["audioInput", "audio_input", "supports_audio_input"], signals, "input") ?? known.audioInput;
  const audioOutput = modelItemExplicitAudioCapability(item || {}, ["audioOutput", "audio_output", "supports_audio_output"], signals, "output") ?? known.audioOutput;
  return compactModelFeatures({
    text: modelItemBooleanCapability(item || {}, ["text", "textInput", "text_input"])
      ?? (imageGeneration ? false : true),
    vision: modelItemExplicitVisionCapability(item || {}) ?? (imageGeneration ? true : false),
    tools: modelItemBooleanCapability(item || {}, ["tools", "tool_call", "toolCall", "toolUse", "tool_use", "functionCalling", "function_calling", "functions"])
      ?? (modelItemHasSignal(signals, [/tool/, /function[_ -]?calling/, /function[_ -]?call/, /code[_ -]?execution/]) ? true : known.tools),
    reasoning: modelItemBooleanCapability(item || {}, ["reasoning", "thinking", "cot", "chainOfThought", "chain_of_thought"])
      ?? (modelItemHasSignal(signals, [/reasoning/, /thinking/, /\bcot\b/, /reasoning_effort/]) ? true : known.reasoning),
    responses: modelItemBooleanCapability(item || {}, ["responses", "responseApi", "response_api", "structured_output", "structuredOutput"])
      ?? (modelItemHasSignal(signals, [/responses/, /response_api/, /structured[_ -]?outputs?/]) ? true : known.responses)
      ?? true,
    streaming: modelItemBooleanCapability(item || {}, ["streaming", "stream"])
      ?? (modelItemHasSignal(signals, [/stream/, /streaming/]) ? true : known.streaming)
      ?? true,
    imageGeneration: imageGeneration === true ? true : undefined,
    audioInput: audioInput === true ? true : known.audioInput,
    audioOutput: audioOutput === true ? true : known.audioOutput,
  });
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
    retryAfterUntil: normalizeString(source.retryAfterUntil, fallback?.retryAfterUntil || "") || null,
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

function normalizeAccountProviderRouting(
  value: unknown,
  fallback?: ModelGatewayAccountProviderRouting,
): ModelGatewayAccountProviderRouting {
  const source = isRecord(value) ? value : {};
  const strategy = normalizedMember(
    source.strategy,
    MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES,
  ) || fallback?.strategy || "round-robin";
  const maxConcurrentPerAccount = firstPositiveInteger(source.maxConcurrentPerAccount, fallback?.maxConcurrentPerAccount);
  return {
    strategy,
    sessionAffinity: typeof source.sessionAffinity === "boolean"
      ? source.sessionAffinity
      : fallback?.sessionAffinity ?? true,
    maxConcurrentPerAccount,
  };
}

function normalizeAccountEntry(
  value: unknown,
  fallback?: ModelGatewayAccountEntry,
): ModelGatewayAccountEntry | null {
  const source = isRecord(value) ? value : {};
  const stamp = nowIso();
  const id = normalizeId(source.id, fallback?.id || `account-${Date.now()}`);
  const authRef = normalizeString(source.authRef, fallback?.authRef || "");
  if (!id || !authRef) return null;
  const kind = memberOrDefault<ModelGatewayAccountProviderKind>(
    source.kind,
    MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS,
    fallback?.kind || "codex",
  );
  const credentialSource = memberOrDefault(
    source.credentialSource,
    MODEL_GATEWAY_ACCOUNT_CREDENTIAL_SOURCES,
    fallback?.credentialSource || "unknown",
  );
  const state = memberOrDefault(
    source.state,
    MODEL_GATEWAY_ACCOUNT_STATES,
    source.enabled === false ? "disabled" : fallback?.enabled === false ? "disabled" : "ready",
  );
  return {
    id,
    kind,
    enabled: state === "disabled" ? false : typeof source.enabled === "boolean" ? source.enabled : fallback?.enabled ?? true,
    state,
    authRef,
    credentialSource,
    accountHash: normalizeString(source.accountHash, fallback?.accountHash || "") || null,
    emailMasked: normalizeString(source.emailMasked, fallback?.emailMasked || "") || null,
    plan: normalizeString(source.plan, fallback?.plan || "") || null,
    expiresAt: normalizeString(source.expiresAt, fallback?.expiresAt || "") || null,
    lastCheckedAt: normalizeString(source.lastCheckedAt, fallback?.lastCheckedAt || "") || null,
    lastSuccessAt: normalizeString(source.lastSuccessAt, fallback?.lastSuccessAt || "") || null,
    lastError: normalizeString(source.lastError, fallback?.lastError || "") || null,
    cooldownUntil: normalizeString(source.cooldownUntil, fallback?.cooldownUntil || "") || null,
    proxyUrl: normalizeString(source.proxyUrl, fallback?.proxyUrl || "") || null,
    createdAt: normalizeString(source.createdAt, fallback?.createdAt || stamp),
    updatedAt: normalizeString(source.updatedAt, fallback?.updatedAt || stamp),
  };
}

function normalizeAccountProviderConfig(
  value: unknown,
  fallback?: ModelGatewayAccountProviderConfig | null,
): ModelGatewayAccountProviderConfig | null {
  if (value === null) return null;
  const source = isRecord(value) ? value : {};
  if (!Object.keys(source).length && !fallback) return null;
  const kind = memberOrDefault<ModelGatewayAccountProviderKind>(
    source.kind,
    MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS,
    fallback?.kind || "codex",
  );
  const fallbackAccounts = new Map((fallback?.accounts || []).map((account) => [account.id, account]));
  const accounts = Array.isArray(source.accounts)
    ? source.accounts
      .map((item) => normalizeAccountEntry(item, isRecord(item) ? fallbackAccounts.get(normalizeId(item.id, "")) : undefined))
      .filter((account): account is ModelGatewayAccountEntry => account !== null)
    : fallback?.accounts || [];
  return {
    kind,
    routing: normalizeAccountProviderRouting(source.routing, fallback?.routing),
    accounts,
  };
}

function normalizeEndpointProfile(
  input: ModelGatewayProviderEndpointProfileInput,
  fallback: ModelGatewayProviderEndpointProfile | undefined,
  provider: {
    id: string;
    appScopes: ModelGatewayAppScope[];
    baseUrl: string;
    apiKeyRef: string | null;
    apiFormat: ModelGatewayApiFormat;
    authStrategy: ModelGatewayAuthStrategy;
    reasoning: ModelGatewayProviderReasoning;
    endpoints: Partial<Record<ModelGatewayRouteId, string>>;
    network: ModelGatewayProviderNetwork;
    failover: ModelGatewayProviderFailover;
  },
): ModelGatewayProviderEndpointProfile {
  const stamp = nowIso();
  const name = normalizeString(input.name, fallback?.name || "Primary endpoint");
  const id = normalizeId(input.id, fallback?.id || name || "primary");
  const baseUrl = normalizeString(input.baseUrl, fallback?.baseUrl || provider.baseUrl);
  if (!baseUrl) {
    throw new ModelGatewayServiceError(
      "model_gateway_endpoint_base_url_required",
      `Endpoint profile '${id}' requires a baseUrl.`,
      400,
    );
  }
  const models = input.models === null
    ? null
    : isRecord(input.models)
      ? normalizeModelCatalog(input.models, fallback?.models || undefined)
      : fallback?.models || null;
  if (models) validateProviderModelCatalog(`${provider.id}:${id}`, models);

  return {
    id,
    name,
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback?.enabled ?? true,
    appScopes: normalizeAppScopes(input.appScopes || fallback?.appScopes || provider.appScopes),
    baseUrl,
    apiKeyRef: input.apiKeyRef === null
      ? null
      : normalizeString(input.apiKeyRef, fallback?.apiKeyRef || provider.apiKeyRef || "") || null,
    apiFormat: memberOrDefault<ModelGatewayApiFormat>(
      input.apiFormat,
      MODEL_GATEWAY_API_FORMATS,
      fallback?.apiFormat || provider.apiFormat,
    ),
    authStrategy: memberOrDefault<ModelGatewayAuthStrategy>(
      input.authStrategy,
      MODEL_GATEWAY_AUTH_STRATEGIES,
      fallback?.authStrategy || provider.authStrategy,
    ),
    models,
    reasoning: normalizeProviderReasoning(input.reasoning, fallback?.reasoning || provider.reasoning),
    endpoints: normalizeEndpointMap(input.endpoints || fallback?.endpoints || provider.endpoints),
    network: normalizeNetwork(input.network, fallback?.network || provider.network),
    health: normalizeHealth(input.health, fallback?.health),
    failover: {
      enabled: typeof input.failover?.enabled === "boolean" ? input.failover.enabled : fallback?.failover.enabled ?? provider.failover.enabled,
      priority: typeof input.failover?.priority === "number" ? Math.floor(input.failover.priority) : fallback?.failover.priority ?? provider.failover.priority,
      maxRetries: typeof input.failover?.maxRetries === "number" ? Math.max(0, Math.floor(input.failover.maxRetries)) : fallback?.failover.maxRetries ?? provider.failover.maxRetries,
    },
    metadata: isRecord(input.metadata) ? input.metadata : fallback?.metadata || {},
    createdAt: normalizeString(input.createdAt, fallback?.createdAt || stamp),
    updatedAt: normalizeString(input.updatedAt, fallback?.updatedAt || stamp),
  };
}

function normalizeEndpointProfiles(
  value: unknown,
  fallback: ModelGatewayProviderEndpointProfile[] | undefined,
  provider: Parameters<typeof normalizeEndpointProfile>[2],
): ModelGatewayProviderEndpointProfile[] {
  if (value === undefined) return fallback || [];
  if (!Array.isArray(value)) return [];
  const fallbackById = new Map((fallback || []).map((item) => [item.id, item]));
  const seen = new Set<string>();
  return value
    .filter(isRecord)
    .map((item) => {
      const id = normalizeId(item.id, normalizeString(item.name, "endpoint"));
      const profile = normalizeEndpointProfile(item as ModelGatewayProviderEndpointProfileInput, fallbackById.get(id), provider);
      if (seen.has(profile.id)) {
        throw new ModelGatewayServiceError(
          "model_gateway_endpoint_duplicate",
          `Provider '${provider.id}' has duplicate endpoint profile '${profile.id}'.`,
          400,
        );
      }
      seen.add(profile.id);
      return profile;
    });
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
  return `sk-tracevane-${randomUUID().replaceAll("-", "")}`;
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

function gatewayClientKeyHashFromRequest(req: http.IncomingMessage): string | null {
  const candidate = clientAuthCandidates(req)[0] || "";
  return candidate ? sha256Short(candidate) : null;
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
    accountRouting: {
      codexCursors: {},
      codexAffinities: {},
    },
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

function normalizeRuntimeAccountRoutingDiagnostics(value: unknown): ModelGatewayAccountRoutingDiagnostics | null {
  if (!isRecord(value)) return null;
  const providerId = normalizeString(value.providerId);
  if (!providerId) return null;
  const kind = MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS.includes(value.kind as ModelGatewayAccountProviderKind)
    ? value.kind as ModelGatewayAccountProviderKind
    : "codex";
  const strategy = MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES.includes(value.strategy as ModelGatewayAccountRoutingDiagnostics["strategy"])
    ? value.strategy as ModelGatewayAccountRoutingDiagnostics["strategy"]
    : "round-robin";
  const skipped = Array.isArray(value.skipped)
    ? value.skipped
      .filter(isRecord)
      .map((item) => {
        const accountId = normalizeString(item.accountId);
        if (!accountId) return null;
        const state = MODEL_GATEWAY_ACCOUNT_STATES.includes(item.state as ModelGatewayAccountEntry["state"])
          ? item.state as ModelGatewayAccountEntry["state"]
          : "error";
        return {
          accountId,
          accountHash: normalizeString(item.accountHash) || null,
          state,
          reason: normalizeString(item.reason, "unknown"),
          cooldownUntil: normalizeString(item.cooldownUntil) || null,
          inFlight: numberOrNull(item.inFlight) || 0,
          capacityLimit: numberOrNull(item.capacityLimit),
        };
      })
      .filter((item): item is ModelGatewayAccountRoutingDiagnostics["skipped"][number] => item !== null)
    : [];
  return {
    providerId,
    kind,
    strategy,
    sessionAffinity: typeof value.sessionAffinity === "boolean" ? value.sessionAffinity : true,
    affinityKeyHash: normalizeString(value.affinityKeyHash) || null,
    affinityHit: value.affinityHit === true,
    selectedAccountId: normalizeString(value.selectedAccountId) || null,
    selectedReason: normalizeString(value.selectedReason) || null,
    selectedWasCooldownRetry: value.selectedWasCooldownRetry === true,
    selectedCooldownUntil: normalizeString(value.selectedCooldownUntil) || null,
    failureReason: normalizeString(value.failureReason) || null,
    accountCount: numberOrNull(value.accountCount) || 0,
    readyCount: numberOrNull(value.readyCount) || 0,
    capacityAvailableCount: numberOrNull(value.capacityAvailableCount) || 0,
    busyCount: numberOrNull(value.busyCount) || 0,
    cooldownCount: numberOrNull(value.cooldownCount) || 0,
    needsLoginCount: numberOrNull(value.needsLoginCount) || 0,
    cursorBefore: numberOrNull(value.cursorBefore),
    cursorAfter: numberOrNull(value.cursorAfter),
    skipped,
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
    firstByteMs: typeof value.firstByteMs === "number" && Number.isFinite(value.firstByteMs)
      ? Math.max(0, Math.floor(value.firstByteMs))
      : null,
    routeId,
    appScope,
    providerId: normalizeString(value.providerId) || null,
    providerName: normalizeString(value.providerName) || null,
    endpointProfileId: normalizeString(value.endpointProfileId) || null,
    endpointProfileName: normalizeString(value.endpointProfileName) || null,
    accountId: normalizeString(value.accountId) || null,
    accountHash: normalizeString(value.accountHash) || null,
    accountRouting: normalizeRuntimeAccountRoutingDiagnostics(value.accountRouting),
    clientKeyHash: normalizeString(value.clientKeyHash) || null,
    model: normalizeString(value.model) || null,
    method: normalizeString(value.method, "POST").toUpperCase(),
    requestedPath: normalizeString(value.requestedPath, "/"),
    upstreamUrl: normalizeString(value.upstreamUrl) || null,
    statusCode: typeof value.statusCode === "number" ? Math.floor(value.statusCode) : null,
    outcome,
    errorCode: normalizeString(value.errorCode) || null,
    errorMessage: normalizeString(value.errorMessage) || null,
    usage: normalizeRuntimeUsage(value.usage) || zeroRuntimeUsage(),
  };
}

function normalizeRuntimeAccountRouting(value: unknown): ModelGatewayRuntimeState["accountRouting"] {
  const raw = isRecord(value) ? value : {};
  const codexCursors: Record<string, number> = {};
  const rawCursors = isRecord(raw.codexCursors) ? raw.codexCursors : {};
  for (const [key, cursorValue] of Object.entries(rawCursors)) {
    const normalizedKey = normalizeString(key);
    const numberValue = typeof cursorValue === "number"
      ? cursorValue
      : typeof cursorValue === "string"
        ? Number(cursorValue)
        : Number.NaN;
    if (!normalizedKey || !Number.isFinite(numberValue)) continue;
    codexCursors[normalizedKey] = Math.max(0, Math.floor(numberValue));
  }

  const codexAffinities: Record<string, string> = {};
  const rawAffinities = isRecord(raw.codexAffinities) ? raw.codexAffinities : {};
  for (const [key, accountIdValue] of Object.entries(rawAffinities)) {
    const normalizedKey = normalizeString(key);
    const accountId = normalizeString(accountIdValue);
    if (!normalizedKey || !accountId) continue;
    codexAffinities[normalizedKey] = accountId;
  }

  return {
    codexCursors,
    codexAffinities,
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
  const appScopes = normalizeAppScopes(input.appScopes || fallback?.appScopes);
  const apiKeyRef = input.apiKeyRef === null ? null : normalizeString(input.apiKeyRef, fallback?.apiKeyRef || "") || null;
  const apiFormat = memberOrDefault<ModelGatewayApiFormat>(
    input.apiFormat,
    MODEL_GATEWAY_API_FORMATS,
    fallback?.apiFormat || "openai_chat",
  );
  const authStrategy = memberOrDefault<ModelGatewayAuthStrategy>(
    input.authStrategy,
    MODEL_GATEWAY_AUTH_STRATEGIES,
    fallback?.authStrategy || "bearer",
  );
  const reasoning = normalizeProviderReasoning(input.reasoning, fallback?.reasoning);
  const endpoints = normalizeEndpointMap(input.endpoints || fallback?.endpoints);
  const network = normalizeNetwork(input.network, fallback?.network);
  const failover = {
    enabled: typeof input.failover?.enabled === "boolean" ? input.failover.enabled : fallback?.failover?.enabled ?? true,
    priority: typeof input.failover?.priority === "number" ? Math.floor(input.failover.priority) : fallback?.failover?.priority ?? 100,
    maxRetries: typeof input.failover?.maxRetries === "number" ? Math.max(0, Math.floor(input.failover.maxRetries)) : fallback?.failover?.maxRetries ?? 1,
  };
  const sourceType = memberOrDefault<ModelGatewayProviderSourceType>(
    input.sourceType,
    MODEL_GATEWAY_PROVIDER_SOURCE_TYPES,
    fallback?.sourceType || "api-key",
  );
  const accountProvider = sourceType === "account-backed"
    ? normalizeAccountProviderConfig(input.accountProvider, fallback?.accountProvider || null)
    : null;
  const endpointProfiles = normalizeEndpointProfiles(input.endpointProfiles, fallback?.endpointProfiles, {
    id,
    appScopes,
    baseUrl,
    apiKeyRef,
    apiFormat,
    authStrategy,
    reasoning,
    endpoints,
    network,
    failover,
  });

  return {
    id,
    name,
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback?.enabled ?? true,
    category: memberOrDefault<ModelGatewayProviderCategory>(
      input.category,
      MODEL_GATEWAY_PROVIDER_CATEGORIES,
      fallback?.category || "custom",
    ),
    sourceType,
    appScopes,
    baseUrl,
    apiKeyRef,
    apiFormat,
    authStrategy,
    models,
    reasoning,
    endpoints,
    endpointProfiles,
    network,
    health: normalizeHealth(input.health, fallback?.health),
    failover,
    accountProvider,
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

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function base64UrlDecodeJson(value: string): Record<string, unknown> | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return parseJsonObject(decoded);
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  return base64UrlDecodeJson(parts[1]);
}

function sha256Short(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function maskEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!name || !domain) return maskSecret(email).masked;
  const visible = name.length <= 2 ? name.slice(0, 1) : `${name.slice(0, 2)}${"*".repeat(Math.min(4, Math.max(1, name.length - 2)))}`;
  return `${visible}@${domain}`;
}

function codexAuthInfoFromJwt(idToken: string): {
  email: string;
  accountId: string;
  plan: string;
  expiresAt: string | null;
} {
  const payload = parseJwtPayload(idToken) || {};
  const authInfo = isRecord(payload["https://api.openai.com/auth"])
    ? payload["https://api.openai.com/auth"] as Record<string, unknown>
    : {};
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  return {
    email: normalizeString(payload.email),
    accountId: normalizeString(authInfo.chatgpt_account_id),
    plan: normalizeString(authInfo.chatgpt_plan_type),
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
  };
}

function parseIsoTimestampMs(value: string | null | undefined): number | null {
  const raw = normalizeString(value || "");
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeCodexTokenBundle(value: unknown): CodexTokenBundle | null {
  const source = typeof value === "string" ? parseJsonObject(value) : isRecord(value) ? value : null;
  if (!source) return null;
  const tokens = isRecord(source.tokens)
    ? source.tokens
    : isRecord(source.token_data)
      ? source.token_data
      : source;
  const idToken = normalizeString(tokens.id_token || source.id_token);
  const accessToken = normalizeString(tokens.access_token || source.access_token);
  const refreshToken = normalizeString(tokens.refresh_token || source.refresh_token);
  const authInfo = idToken ? codexAuthInfoFromJwt(idToken) : { email: "", accountId: "", plan: "", expiresAt: null };
  const accountId = normalizeString(tokens.account_id || source.account_id || authInfo.accountId);
  const email = normalizeString(source.email || tokens.email || authInfo.email);
  const plan = normalizeString(source.plan_type || source.plan || tokens.plan_type || authInfo.plan);
  const expiresAt = normalizeString(source.expires_at || source.expired || tokens.expired || authInfo.expiresAt || "");
  if (!accessToken && !refreshToken && !idToken) return null;
  return {
    type: "codex",
    tokens: {
      ...(idToken ? { id_token: idToken } : {}),
      ...(accessToken ? { access_token: accessToken } : {}),
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      ...(accountId ? { account_id: accountId } : {}),
    },
    last_refresh: normalizeString(source.last_refresh) || nowIso(),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(email ? { email } : {}),
    ...(plan ? { plan_type: plan } : {}),
    ...(accountId ? { account_hash: sha256Short(accountId) } : {}),
  };
}

function codexTokenBundleExpiresAtMs(bundle: CodexTokenBundle): number | null {
  return parseIsoTimestampMs(bundle.expires_at)
    || (bundle.tokens.id_token ? parseIsoTimestampMs(codexAuthInfoFromJwt(bundle.tokens.id_token).expiresAt) : null);
}

function codexTokenBundleNeedsRefresh(bundle: CodexTokenBundle, nowMs = Date.now()): boolean {
  if (!normalizeString(bundle.tokens.refresh_token)) return false;
  if (!normalizeString(bundle.tokens.access_token)) return true;
  const expiresAtMs = codexTokenBundleExpiresAtMs(bundle);
  if (!expiresAtMs) return false;
  return expiresAtMs - nowMs <= CODEX_ACCOUNT_REFRESH_WINDOW_MS;
}

function codexAccountFromTokenBundle(
  id: string,
  authRef: string,
  bundle: CodexTokenBundle,
  credentialSource: ModelGatewayAccountEntry["credentialSource"],
  fallback?: ModelGatewayAccountEntry,
): ModelGatewayAccountEntry {
  const stamp = nowIso();
  const accountId = normalizeString(bundle.tokens.account_id);
  const accountHash = normalizeString(bundle.account_hash) || (accountId ? sha256Short(accountId) : null);
  return {
    id,
    kind: "codex",
    enabled: fallback?.enabled ?? true,
    state: "ready",
    authRef,
    credentialSource,
    accountHash,
    emailMasked: maskEmail(normalizeString(bundle.email)) || fallback?.emailMasked || null,
    plan: normalizeString(bundle.plan_type, fallback?.plan || "") || null,
    expiresAt: normalizeString(bundle.expires_at, fallback?.expiresAt || "") || null,
    lastCheckedAt: stamp,
    lastSuccessAt: stamp,
    lastError: null,
    cooldownUntil: null,
    proxyUrl: fallback?.proxyUrl || null,
    createdAt: fallback?.createdAt || stamp,
    updatedAt: stamp,
  };
}

function codexAccountDefaultModels(): ModelGatewayProviderModelCatalog {
  const models: ModelGatewayProviderModel[] = [
    {
      id: "gpt-5.5",
      aliases: ["gpt5.5"],
      contextWindow: 272_000,
      maxOutputTokens: 128_000,
      features: { text: true, streaming: true, tools: true, vision: true, reasoning: true, responses: true },
      pricing: {
        currency: "USD",
        inputPer1M: 5,
        outputPer1M: 30,
      },
    },
    {
      id: "gpt-5.4",
      aliases: ["gpt5.4"],
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      features: { text: true, streaming: true, tools: true, vision: true, reasoning: true, responses: true },
      pricing: {
        currency: "USD",
        inputPer1M: 2.5,
        outputPer1M: 15,
        longContextInputThreshold: 272_000,
        longContextInputMultiplier: 2,
        longContextOutputMultiplier: 1.5,
      },
    },
    {
      id: "gpt-5.4-mini",
      aliases: ["gpt5.4-mini"],
      contextWindow: 272_000,
      maxOutputTokens: 128_000,
      features: { text: true, streaming: true, tools: true, vision: true, reasoning: true, responses: true },
      pricing: {
        currency: "USD",
        inputPer1M: 0.75,
        outputPer1M: 4.5,
      },
    },
    {
      id: "gpt-5.3-codex",
      aliases: ["gpt5.3-codex"],
      contextWindow: 272_000,
      maxOutputTokens: 128_000,
      features: { text: true, streaming: true, tools: true, vision: true, reasoning: true, responses: true },
      pricing: {
        currency: "USD",
        inputPer1M: 1.75,
        outputPer1M: 14,
      },
    },
    {
      id: "gpt-5.3-codex-spark",
      aliases: ["gpt5.3-codex-spark"],
      contextWindow: 128_000,
      features: { text: true, streaming: true, tools: true, vision: true, reasoning: true, responses: true },
    },
    {
      id: "gpt-image-2",
      label: "GPT Image 2",
      aliases: ["image-2", "gptimage2", "gpt-image-2-2026-04-21"],
      features: {
        text: false,
        streaming: false,
        tools: false,
        vision: true,
        reasoning: false,
        responses: true,
        imageGeneration: true,
      },
    },
    {
      id: "gpt-4o-transcribe",
      label: "GPT-4o Transcribe",
      aliases: ["transcribe", "gpt-4o-transcribe-diarize"],
      contextWindow: 16_000,
      maxOutputTokens: 2_000,
      features: {
        text: false,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: true,
        audioOutput: false,
      },
    },
    {
      id: "gpt-4o-mini-transcribe",
      label: "GPT-4o mini Transcribe",
      aliases: ["mini-transcribe"],
      contextWindow: 16_000,
      maxOutputTokens: 2_000,
      features: {
        text: false,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: true,
        audioOutput: false,
      },
    },
    {
      id: "gpt-4o-mini-tts",
      label: "GPT-4o mini TTS",
      aliases: ["speech"],
      features: {
        text: true,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: false,
        audioOutput: true,
      },
    },
    {
      id: "tts-1",
      label: "TTS 1",
      features: {
        text: true,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: false,
        audioOutput: true,
      },
    },
    {
      id: "tts-1-hd",
      label: "TTS 1 HD",
      features: {
        text: true,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: false,
        audioOutput: true,
      },
    },
    {
      id: "whisper-1",
      label: "Whisper 1",
      features: {
        text: false,
        streaming: false,
        tools: false,
        vision: false,
        reasoning: false,
        responses: false,
        audioInput: true,
        audioOutput: false,
      },
    },
    {
      id: "gpt-audio",
      label: "GPT Audio",
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      features: {
        text: true,
        streaming: true,
        tools: true,
        vision: false,
        reasoning: false,
        responses: true,
        audioInput: true,
        audioOutput: true,
      },
    },
    {
      id: "gpt-audio-1.5",
      label: "GPT Audio 1.5",
      aliases: ["audio-1.5"],
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      features: {
        text: true,
        streaming: true,
        tools: true,
        vision: false,
        reasoning: false,
        responses: true,
        audioInput: true,
        audioOutput: true,
      },
    },
    {
      id: "gpt-realtime",
      label: "GPT Realtime",
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      features: {
        text: true,
        streaming: true,
        tools: true,
        vision: true,
        reasoning: false,
        responses: true,
        audioInput: true,
        audioOutput: true,
      },
    },
    {
      id: "gpt-realtime-1.5",
      label: "GPT Realtime 1.5",
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      features: {
        text: true,
        streaming: true,
        tools: true,
        vision: true,
        reasoning: false,
        responses: true,
        audioInput: true,
        audioOutput: true,
      },
    },
    {
      id: "gpt-realtime-2",
      label: "GPT Realtime 2",
      aliases: ["realtime-2"],
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
      features: {
        text: true,
        streaming: true,
        tools: true,
        vision: true,
        reasoning: true,
        responses: true,
        audioInput: true,
        audioOutput: true,
      },
    },
  ];
  return {
    defaultModel: models[0]?.id || null,
    models,
    aliases: {},
  };
}

function mergeModelCatalogWithDefaults(
  catalog: ModelGatewayProviderModelCatalog | undefined,
  defaults: ModelGatewayProviderModelCatalog,
): ModelGatewayProviderModelCatalog {
  const source = catalog || { defaultModel: null, models: [], aliases: {} };
  const modelsByKey = new Map<string, ModelGatewayProviderModel>();
  for (const model of source.models || []) {
    const key = normalizeModelLookupKey(model.id);
    if (key) modelsByKey.set(key, { ...model, aliases: [...(model.aliases || [])] });
  }
  for (const defaultModel of defaults.models || []) {
    const key = normalizeModelLookupKey(defaultModel.id);
    if (!key) continue;
    const existing = modelsByKey.get(key);
    if (!existing) {
      modelsByKey.set(key, {
        ...defaultModel,
        aliases: [...(defaultModel.aliases || [])],
        features: defaultModel.features ? { ...defaultModel.features } : undefined,
      });
      continue;
    }
    const aliases = [
      ...(defaultModel.aliases || []),
      ...(existing.aliases || []),
    ].filter((alias, index, list) => alias && list.indexOf(alias) === index);
    modelsByKey.set(key, {
      ...defaultModel,
      ...existing,
      label: existing.label || defaultModel.label,
      contextWindow: positiveIntegerOrNull(existing.contextWindow) ?? positiveIntegerOrNull(defaultModel.contextWindow),
      maxOutputTokens: positiveIntegerOrNull(existing.maxOutputTokens) ?? positiveIntegerOrNull(defaultModel.maxOutputTokens),
      aliases,
      features: compactModelFeatures({
        ...(defaultModel.features || {}),
        ...(existing.features || {}),
      }),
      pricing: existing.pricing || defaultModel.pricing,
    });
  }
  return {
    defaultModel: normalizeString(source.defaultModel || defaults.defaultModel || "") || null,
    models: [...modelsByKey.values()],
    aliases: {
      ...(defaults.aliases || {}),
      ...(source.aliases || {}),
    },
  };
}

function mergeManagedModelCatalogWithDefaults(
  catalog: ModelGatewayProviderModelCatalog | undefined,
  defaults: ModelGatewayProviderModelCatalog,
): ModelGatewayProviderModelCatalog {
  const defaultKeys = new Set((defaults.models || []).map((model) => normalizeModelLookupKey(model.id)).filter(Boolean));
  const source = catalog
    ? {
      ...catalog,
      defaultModel: defaultKeys.has(normalizeModelLookupKey(catalog.defaultModel || ""))
        ? catalog.defaultModel
        : defaults.defaultModel,
      models: (catalog.models || []).filter((model) => defaultKeys.has(normalizeModelLookupKey(model.id))),
      aliases: Object.fromEntries(
        Object.entries(catalog.aliases || {}).filter(([, modelId]) => defaultKeys.has(normalizeModelLookupKey(modelId))),
      ),
    }
    : undefined;
  const merged = mergeModelCatalogWithDefaults(source, defaults);
  const defaultsByKey = new Map((defaults.models || [])
    .map((model) => [normalizeModelLookupKey(model.id), model] as const)
    .filter(([key]) => Boolean(key)));
  return {
    ...merged,
    models: (merged.models || []).map((model) => {
      const defaultModel = defaultsByKey.get(normalizeModelLookupKey(model.id));
      if (!defaultModel) return model;
      return {
        ...model,
        aliases: [...(defaultModel.aliases || [])],
        contextWindow: positiveIntegerOrNull(defaultModel.contextWindow) ?? positiveIntegerOrNull(model.contextWindow),
        maxOutputTokens: positiveIntegerOrNull(defaultModel.maxOutputTokens) ?? positiveIntegerOrNull(model.maxOutputTokens),
        pricing: defaultModel.pricing || model.pricing,
        features: compactModelFeatures({
          ...(model.features || {}),
          ...(defaultModel.features || {}),
        }),
      };
    }),
  };
}

function isCodexAccountBackedProvider(provider: ModelGatewayProvider): boolean {
  return provider.sourceType === "account-backed" && provider.accountProvider?.kind === "codex";
}

function codexAccountProviderName(account: ModelGatewayAccountEntry, fallback = "Codex Account"): string {
  const suffix = [account.emailMasked, account.plan].filter(Boolean).join(" · ");
  return suffix ? `${fallback} (${suffix})` : fallback;
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
  const value = readHeader(headers, "x-tracevane-app-scope").trim();
  return MODEL_GATEWAY_APP_SCOPES.includes(value as ModelGatewayAppScope)
    ? value as ModelGatewayAppScope
    : fallback;
}

function endpointForRoute(routeId: ModelGatewayRouteId, provider: ModelGatewayProvider): string {
  const override = provider.endpoints[routeId];
  if (override) return override;

  if (routeId === "openai_chat_completions") {
    if (provider.apiFormat === "anthropic_messages") return nativeEndpointForProvider(provider, "anthropic_messages", "/messages");
    if (provider.apiFormat === "openai_responses") return nativeEndpointForProvider(provider, "openai_responses", "/responses");
    return nativeEndpointForProvider(provider, "openai_chat", "/chat/completions");
  }
  if (routeId === "openai_responses") {
    if (provider.apiFormat === "anthropic_messages") return nativeEndpointForProvider(provider, "anthropic_messages", "/messages");
    return provider.apiFormat === "openai_chat"
      ? nativeEndpointForProvider(provider, "openai_chat", "/chat/completions")
      : nativeEndpointForProvider(provider, "openai_responses", "/responses");
  }
  if (routeId === "openai_responses_compact") {
    if (provider.apiFormat === "anthropic_messages") return nativeEndpointForProvider(provider, "anthropic_messages", "/messages");
    if (isCodexAccountBackedProvider(provider)) return "/compact";
    return provider.apiFormat === "openai_chat"
      ? nativeEndpointForProvider(provider, "openai_chat", "/chat/completions")
      : nativeEndpointForProvider(provider, "openai_responses", "/responses/compact");
  }
  if (routeId === "openai_images_generations") {
    if (isCodexAccountBackedProvider(provider)) return "/responses";
    return "/images/generations";
  }
  if (routeId === "openai_images_edits") return "/images/edits";
  if (routeId === "openai_audio_transcriptions") return "/audio/transcriptions";
  if (routeId === "openai_audio_translations") return "/audio/translations";
  if (routeId === "openai_audio_speech") return "/audio/speech";
  if (routeId === "anthropic_messages") {
    if (provider.apiFormat === "openai_chat") return nativeEndpointForProvider(provider, "openai_chat", "/chat/completions");
    if (provider.apiFormat === "openai_responses") return nativeEndpointForProvider(provider, "openai_responses", "/responses");
    return nativeEndpointForProvider(provider, "anthropic_messages", "/messages");
  }
  if (routeId === "anthropic_messages_count_tokens") {
    return nativeEndpointForProvider(provider, "anthropic_messages", "/messages/count_tokens");
  }
  return "/";
}

function nativeEndpointForProvider(
  provider: ModelGatewayProvider,
  apiFormat: ModelGatewayApiFormat,
  fallback: string,
): string {
  if (apiFormat === "openai_chat") return provider.endpoints.openai_chat_completions || fallback;
  if (apiFormat === "openai_responses") return provider.endpoints.openai_responses || fallback;
  if (apiFormat === "anthropic_messages") return provider.endpoints.anthropic_messages || fallback;
  return fallback;
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
  if (routeId === "openai_images_generations" || routeId === "openai_images_edits") {
    return provider.apiFormat === "anthropic_messages" ? "adapter-required" : "passthrough";
  }
  if (
    routeId === "openai_audio_transcriptions"
    || routeId === "openai_audio_translations"
    || routeId === "openai_audio_speech"
  ) {
    return provider.apiFormat === "anthropic_messages" ? "adapter-required" : "passthrough";
  }
  if (routeId === "anthropic_messages") {
    return provider.apiFormat === "anthropic_messages" ? "passthrough" : "adapter-required";
  }
  if (routeId === "anthropic_messages_count_tokens") {
    return provider.apiFormat === "anthropic_messages" ? "passthrough" : "adapter-required";
  }
  return "unsupported";
}

function modelGatewayUnsupportedRoute(
  code: string,
  reason: string,
  routeId?: ModelGatewayRouteId,
  endpoint?: string,
): ModelGatewayUnsupportedRoute {
  return {
    ...(routeId ? { routeId } : {}),
    ...(endpoint ? { endpoint } : {}),
    code,
    reason,
  };
}

function modelGatewayRouteSupportForProviderModel(
  provider: ModelGatewayProvider,
  model: ModelGatewayProviderModel,
): { supported: ModelGatewayRouteId[]; unsupported: ModelGatewayUnsupportedRoute[] } {
  const features = compactModelFeatures({ ...(model.features || {}) });
  const supported = new Set<ModelGatewayRouteId>();
  const unsupported: ModelGatewayUnsupportedRoute[] = [];
  const textCapable = features.text !== false && features.imageGeneration !== true;
  const codexAccount = isCodexAccountBackedProvider(provider);

  if (textCapable) {
    supported.add("openai_chat_completions");
    supported.add("openai_responses");
    supported.add("openai_responses_compact");
    supported.add("anthropic_messages");
    supported.add("anthropic_messages_count_tokens");
  }

  if (features.imageGeneration === true) {
    if (provider.apiFormat === "anthropic_messages") {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_image_generation_adapter_unverified",
        "Gateway has no verified Anthropic Messages image generation adapter for this model.",
        "openai_images_generations",
      ));
    } else {
      supported.add("openai_images_generations");
    }

    if (codexAccount) {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_codex_account_image_edits_unsupported",
        "Codex account image edits are not exposed by the verified Codex Responses image_generation bridge.",
        "openai_images_edits",
      ));
    } else if (provider.apiFormat === "anthropic_messages") {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_image_edits_adapter_unverified",
        "Gateway has no verified Anthropic Messages image edit adapter for this model.",
        "openai_images_edits",
      ));
    } else {
      supported.add("openai_images_edits");
    }
  }

  if (features.audioInput === true) {
    if (codexAccount) {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_codex_account_audio_unsupported",
        "Codex account request-based audio input routes are not exposed by a verified Gateway backend contract.",
        "openai_audio_transcriptions",
      ));
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_codex_account_audio_unsupported",
        "Codex account request-based audio translation routes are not exposed by a verified Gateway backend contract.",
        "openai_audio_translations",
      ));
    } else if (provider.apiFormat === "anthropic_messages") {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_audio_adapter_unverified",
        "Gateway has no verified Anthropic Messages request-based audio adapter for this model.",
        "openai_audio_transcriptions",
      ));
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_audio_adapter_unverified",
        "Gateway has no verified Anthropic Messages request-based audio translation adapter for this model.",
        "openai_audio_translations",
      ));
    } else {
      supported.add("openai_audio_transcriptions");
      supported.add("openai_audio_translations");
    }
  }

  if (features.audioOutput === true) {
    if (codexAccount) {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_codex_account_audio_unsupported",
        "Codex account request-based speech output is not exposed by a verified Gateway backend contract.",
        "openai_audio_speech",
      ));
    } else if (provider.apiFormat === "anthropic_messages") {
      unsupported.push(modelGatewayUnsupportedRoute(
        "model_gateway_audio_adapter_unverified",
        "Gateway has no verified Anthropic Messages request-based speech adapter for this model.",
        "openai_audio_speech",
      ));
    } else {
      supported.add("openai_audio_speech");
    }
  }

  if (modelNameMatches(model.id, [/^gpt-realtime(?:\b|-|_|\.)/]) || features.audioInput === true || features.audioOutput === true) {
    unsupported.push(modelGatewayUnsupportedRoute(
      "model_gateway_realtime_unsupported",
      "Gateway does not expose verified Realtime/WebSocket/WebRTC/SIP proxying for this model yet.",
      undefined,
      "/v1/realtime",
    ));
  }

  return {
    supported: [...supported],
    unsupported,
  };
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
  endpointProfile: ModelGatewayProviderEndpointProfile | null = null,
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
    endpointProfile: endpointProfile
      ? {
        id: endpointProfile.id,
        name: endpointProfile.name,
        apiFormat: endpointProfile.apiFormat,
        authStrategy: endpointProfile.authStrategy,
        baseUrl: endpointProfile.baseUrl,
      }
      : null,
    model,
    upstreamPath,
    upstreamUrl: joinBaseUrl(provider.baseUrl, upstreamPath),
    reason: mode === "adapter-required"
      ? `Provider '${provider.id}' uses ${provider.apiFormat}; ${routeId} needs a protocol adapter before passthrough.`
      : null,
    failoverReason: null,
  };
}

function effectiveProviderForEndpointProfile(
  provider: ModelGatewayProvider,
  endpointProfile: ModelGatewayProviderEndpointProfile | null,
): ModelGatewayProvider {
  if (!endpointProfile) return provider;
  return {
    ...provider,
    appScopes: endpointProfile.appScopes,
    baseUrl: endpointProfile.baseUrl,
    apiKeyRef: endpointProfile.apiKeyRef,
    apiFormat: endpointProfile.apiFormat,
    authStrategy: endpointProfile.authStrategy,
    models: endpointProfile.models || provider.models,
    reasoning: endpointProfile.reasoning,
    endpoints: endpointProfile.endpoints,
    network: endpointProfile.network,
    health: endpointProfile.health,
    failover: endpointProfile.failover,
    accountProvider: provider.accountProvider,
    metadata: {
      ...provider.metadata,
      ...endpointProfile.metadata,
    },
    updatedAt: endpointProfile.updatedAt,
  };
}

function providerEndpointProfilesForRouting(
  provider: ModelGatewayProvider,
): Array<ModelGatewayProviderEndpointProfile | null> {
  return provider.endpointProfiles.length ? provider.endpointProfiles : [null];
}

function routeProtocolPenalty(provider: ModelGatewayProvider, routeId: ModelGatewayRouteId): number {
  if (
    routeId === "openai_images_generations"
    || routeId === "openai_images_edits"
    || routeId === "openai_audio_transcriptions"
    || routeId === "openai_audio_translations"
    || routeId === "openai_audio_speech"
  ) {
    return provider.apiFormat === "anthropic_messages" ? 10 : 0;
  }
  return ROUTES[routeId].protocol === provider.apiFormat ? 0 : 10;
}

function healthCircuitRetryReady(health: ModelGatewayProviderHealth, nowMs = Date.now()): boolean {
  if (health.circuitState !== "open") return false;
  const retryAfterUntilMs = Date.parse(health.retryAfterUntil || "");
  if (Number.isFinite(retryAfterUntilMs) && retryAfterUntilMs > nowMs) return false;
  if (Number.isFinite(retryAfterUntilMs) && retryAfterUntilMs <= nowMs) return true;
  const lastFailureMs = Date.parse(health.lastFailureAt || "");
  if (!Number.isFinite(lastFailureMs)) return true;
  return nowMs - lastFailureMs >= MODEL_GATEWAY_CIRCUIT_OPEN_RETRY_MS;
}

function enabledEndpointProfiles(provider: ModelGatewayProvider): ModelGatewayProviderEndpointProfile[] {
  return provider.endpointProfiles.filter((profile) => profile.enabled);
}

function healthIsDegraded(health: ModelGatewayProviderHealth): boolean {
  return Boolean(
    health.circuitState !== "closed"
    || health.retryAfterUntil
    || health.consecutiveFailures > 0
    || health.lastError,
  );
}

function providerHasHealthyRoutingSurface(provider: ModelGatewayProvider): boolean {
  if (!provider.enabled) return false;
  const endpointProfiles = enabledEndpointProfiles(provider);
  if (endpointProfiles.length) {
    return endpointProfiles.some((profile) => profile.health.circuitState === "closed");
  }
  return provider.health.circuitState === "closed";
}

function providerHasDegradedHealth(provider: ModelGatewayProvider): boolean {
  return healthIsDegraded(provider.health)
    || enabledEndpointProfiles(provider).some((profile) => healthIsDegraded(profile.health));
}

function providerOpenCircuitCount(provider: ModelGatewayProvider): number {
  const providerCircuit = provider.health.circuitState === "open" ? 1 : 0;
  const endpointCircuits = enabledEndpointProfiles(provider)
    .filter((profile) => profile.health.circuitState === "open")
    .length;
  return providerCircuit + endpointCircuits;
}

function buildProviderTestPayload(
  provider: ModelGatewayProvider,
  model: string,
  input: string,
  kind: ModelGatewayProviderTestRequest["kind"] = "protocol",
): unknown {
  if (kind === "vision") {
    const imageUrl = `data:${MODEL_GATEWAY_VISION_SMOKE_IMAGE_MIME_TYPE};base64,${MODEL_GATEWAY_VISION_SMOKE_IMAGE_BASE64}`;
    if (provider.apiFormat === "openai_responses") {
      return {
        model,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: MODEL_GATEWAY_VISION_SMOKE_PROMPT },
            { type: "input_image", image_url: imageUrl },
          ],
        }],
        stream: false,
        store: false,
        max_output_tokens: 32,
      };
    }
    if (provider.apiFormat === "anthropic_messages") {
      return {
        model,
        max_tokens: 32,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: MODEL_GATEWAY_VISION_SMOKE_IMAGE_MIME_TYPE,
                data: MODEL_GATEWAY_VISION_SMOKE_IMAGE_BASE64,
              },
            },
            { type: "text", text: MODEL_GATEWAY_VISION_SMOKE_PROMPT },
          ],
        }],
      };
    }
    return {
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: MODEL_GATEWAY_VISION_SMOKE_PROMPT },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      stream: false,
      max_tokens: 32,
    };
  }
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
    .map((item): ModelGatewayProviderModel | null => {
      if (typeof item === "string") return inferredModelFromId(item);
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
      const known = knownModelDefaults(id);
      const limit = modelItemLimitObject(item);
      const contextWindow = firstPositiveInteger(
        item.contextWindow,
        item.context_window,
        item.context_length,
        item.contextLength,
        item.max_context_length,
        item.maxContextLength,
        item.max_input_tokens,
        item.maxInputTokens,
        limit?.context,
        limit?.input,
        known.contextWindow,
      );
      const maxOutputTokens = firstPositiveInteger(
        item.maxOutputTokens,
        item.max_output_tokens,
        item.max_completion_tokens,
        item.maxCompletionTokens,
        item.output_token_limit,
        item.outputTokenLimit,
        limit?.output,
        known.maxOutputTokens,
      );
      const pricing = modelItemPricing(item);
      return {
        id,
        ...(label && label !== id ? { label } : {}),
        ...(contextWindow ? { contextWindow } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        features: inferModelFeatures(id, item),
        ...(pricing ? { pricing } : {}),
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

function inferredModelFromId(modelId: string): ModelGatewayProviderModel {
  const known = knownModelDefaults(modelId);
  return {
    id: modelId,
    ...(known.contextWindow ? { contextWindow: known.contextWindow } : {}),
    ...(known.maxOutputTokens ? { maxOutputTokens: known.maxOutputTokens } : {}),
    features: inferModelFeatures(modelId),
  };
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

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`Response body exceeded ${maxBytes} bytes.`);
    }
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`Response body exceeded ${maxBytes} bytes.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function fetchTextWithTimeout(
  url: string,
  init: FetchInitWithDispatcher,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ response: Response; responseText: string; latencyMs: number }> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const responseText = await readResponseTextLimited(response, maxBytes);
    return {
      response,
      responseText,
      latencyMs: Math.max(0, Date.now() - startedAt),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDetectProviderTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DETECT_PROVIDER_DEFAULT_TIMEOUT_MS;
  return Math.min(DETECT_PROVIDER_MAX_TIMEOUT_MS, Math.max(1_000, Math.floor(value)));
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
      const { response, responseText, latencyMs } = await fetchTextWithTimeout(
        endpoint,
        withProviderNetwork(provider, {
          method: "GET",
          headers,
        }),
        timeoutMs,
        DETECT_PROVIDER_MAX_RESPONSE_BYTES,
      );
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
    const { response, responseText, latencyMs } = await fetchTextWithTimeout(
      route.upstreamUrl || provider.baseUrl,
      withProviderNetwork(provider, {
        method: "POST",
        headers,
        body: requestBody,
      }),
      options.timeoutMs,
      DETECT_PROVIDER_MAX_RESPONSE_BYTES,
    );
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

function hasConfiguredGatewayAuth(config: TracevaneServerConfig): boolean {
  const openclaw = readJsonFile<Record<string, any>>(config.openclawConfigFile, {});
  const auth = isRecord(openclaw.gateway) && isRecord(openclaw.gateway.auth) ? openclaw.gateway.auth : {};
  const mode = normalizeString(auth.mode);
  const secrets = [auth.token, auth.password].filter(hasConfiguredSecretInput);
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

function copyHeaderValue(headers: Headers, key: string, value: string | string[] | undefined): void {
  if (Array.isArray(value)) {
    if (value[0]) headers.set(key, value[0]);
  } else if (typeof value === "string" && value.trim()) {
    headers.set(key, value);
  }
}

function copyUpstreamRequestHeaders(req: http.IncomingMessage): Headers {
  const headers = new Headers();
  const passthrough = [
    "accept",
    "content-type",
    "openai-beta",
    "user-agent",
  ];

  for (const key of passthrough) {
    copyHeaderValue(headers, key, req.headers[key]);
  }

  for (const [key, value] of Object.entries(req.headers)) {
    if (!key.toLowerCase().startsWith("anthropic-")) continue;
    copyHeaderValue(headers, key, value);
  }

  return headers;
}

function stripAnthropicRequestHeaders(headers: Headers): void {
  const keys: string[] = [];
  headers.forEach((_value, key) => {
    if (key.toLowerCase().startsWith("anthropic-")) keys.push(key);
  });
  for (const key of keys) headers.delete(key);
}

function applyProviderAuth(headers: Headers, provider: ModelGatewayProvider, secret: string | null): void {
  headers.delete("authorization");
  headers.delete("x-api-key");

  if (provider.authStrategy === "none") return;
  if (!secret) return;

  if (provider.sourceType === "account-backed" && provider.accountProvider?.kind === "codex") {
    const bundle = normalizeCodexTokenBundle(secret);
    const token = normalizeString(bundle?.tokens.access_token);
    if (!token) return;
    headers.set("authorization", `Bearer ${token}`);
    const accountId = normalizeString(bundle?.tokens.account_id);
    if (accountId) headers.set("chatgpt-account-id", accountId);
    if (!headers.get("originator")) headers.set("originator", CODEX_ACCOUNT_ORIGINATOR);
    if (!headers.get("user-agent")) headers.set("user-agent", CODEX_ACCOUNT_USER_AGENT);
    return;
  }

  if (provider.authStrategy === "anthropic_api_key") {
    headers.set("x-api-key", secret);
    return;
  }

  headers.set("authorization", `Bearer ${secret}`);
}

function withProxyNetwork(proxyUrl: string | null | undefined, init: RequestInit, label: string): FetchInitWithDispatcher {
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
      `No proxy agent is available for ${label}.`,
      500,
    );
  }
  return {
    ...init,
    dispatcher: new Agent(proxyUrl),
  };
}

type GatewayProxySelection = {
  proxyUrl: string | null;
  source: ModelGatewayProxySource;
};

function modelGatewayEnvProxyUrl(targetUrl: string): string | null {
  let protocol = "";
  try {
    protocol = new URL(targetUrl).protocol.toLowerCase();
  } catch {
    protocol = "";
  }
  const env = process.env;
  if (protocol === "http:") {
    return normalizeString(env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy) || null;
  }
  return normalizeString(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy) || null;
}

function gatewayUpstreamProxySelection(
  provider: ModelGatewayProvider,
  targetUrl: string,
  account?: ModelGatewayAccountEntry | null,
): GatewayProxySelection {
  if (isCodexAccountBackedProvider(provider)) {
    const accountProxy = normalizeString(account?.proxyUrl || "");
    if (accountProxy) return { proxyUrl: accountProxy, source: "account" };
    const providerProxy = normalizeString(provider.network.proxyUrl || "");
    if (providerProxy) return { proxyUrl: providerProxy, source: "provider" };
    const envProxy = modelGatewayEnvProxyUrl(targetUrl);
    if (envProxy) return { proxyUrl: envProxy, source: "environment" };
    return { proxyUrl: null, source: "none" };
  }
  const providerProxy = normalizeString(provider.network.proxyUrl || "");
  return providerProxy
    ? { proxyUrl: providerProxy, source: "provider" }
    : { proxyUrl: null, source: "none" };
}

function codexAccountAuthProxySelection(
  targetUrl: string,
  account?: ModelGatewayAccountEntry | null,
): GatewayProxySelection {
  const accountProxy = normalizeString(account?.proxyUrl || "");
  if (accountProxy) return { proxyUrl: accountProxy, source: "account" };
  const envProxy = modelGatewayEnvProxyUrl(targetUrl);
  if (envProxy) return { proxyUrl: envProxy, source: "environment" };
  return { proxyUrl: null, source: "none" };
}

function redactProxyUrl(proxyUrl: string | null | undefined): string | null {
  const raw = normalizeString(proxyUrl || "");
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return raw.replace(/\/\/([^:@/\s]+):([^@/\s]+)@/g, "//***:***@");
  }
}

function sanitizedDiagnosticText(value: unknown, proxyUrl: string | null): string | null {
  const raw = normalizeString(typeof value === "string" ? value : value == null ? "" : String(value));
  if (!raw) return null;
  const redactedProxyUrl = redactProxyUrl(proxyUrl);
  let text = raw;
  if (proxyUrl && redactedProxyUrl) {
    text = text.split(proxyUrl).join(redactedProxyUrl);
  }
  if (proxyUrl) {
    try {
      const parsed = new URL(proxyUrl);
      for (const secret of [parsed.username, parsed.password].filter(Boolean)) {
        text = text.split(secret).join("***");
        text = text.split(decodeURIComponent(secret)).join("***");
      }
    } catch {
      // Best-effort credential redaction only.
    }
  }
  return text.slice(0, 500);
}

function proxyDiagnostics(selection: GatewayProxySelection): ModelGatewayNetworkErrorDiagnostics["proxy"] {
  const proxyUrl = normalizeString(selection.proxyUrl || "");
  if (!proxyUrl) {
    return {
      source: selection.source,
      url: null,
      scheme: null,
      host: null,
      port: null,
    };
  }
  try {
    const parsed = new URL(proxyUrl);
    return {
      source: selection.source,
      url: redactProxyUrl(proxyUrl),
      scheme: parsed.protocol.replace(/:$/u, "") || null,
      host: parsed.hostname || null,
      port: parsed.port ? Number(parsed.port) : null,
    };
  } catch {
    return {
      source: selection.source,
      url: redactProxyUrl(proxyUrl),
      scheme: null,
      host: null,
      port: null,
    };
  }
}

function errorRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function errorCauseRecord(error: unknown): Record<string, unknown> | null {
  if (!isRecord(error)) return null;
  return errorRecord(error.cause);
}

function networkErrorDiagnostics(error: unknown, selection: GatewayProxySelection): ModelGatewayErrorDiagnostics {
  const cause = errorCauseRecord(error);
  const causePort = typeof cause?.port === "number"
    ? cause.port
    : typeof cause?.port === "string" && /^\d+$/u.test(cause.port)
      ? Number(cause.port)
      : null;
  const network: ModelGatewayNetworkErrorDiagnostics = {
    errorName: error instanceof Error ? error.name : null,
    message: sanitizedDiagnosticText(error instanceof Error ? error.message : error, selection.proxyUrl) || "Network request failed.",
    causeName: typeof cause?.name === "string" ? cause.name : null,
    causeCode: typeof cause?.code === "string" ? cause.code : null,
    causeMessage: sanitizedDiagnosticText(cause?.message, selection.proxyUrl),
    causeErrno: typeof cause?.errno === "number" || typeof cause?.errno === "string" ? cause.errno : null,
    causeSyscall: typeof cause?.syscall === "string" ? cause.syscall : null,
    causeAddress: typeof cause?.address === "string" ? cause.address : typeof cause?.hostname === "string" ? cause.hostname : null,
    causePort,
    proxy: proxyDiagnostics(selection),
  };
  return { network };
}

function errorMessageWithNetworkDiagnostics(
  fallbackMessage: string,
  diagnostics: ModelGatewayErrorDiagnostics,
): string {
  const network = diagnostics.network;
  if (!network) return fallbackMessage;
  const details = [
    network.causeCode,
    network.causeAddress && network.causePort ? `${network.causeAddress}:${network.causePort}` : network.causeAddress,
    network.proxy.url ? `via ${network.proxy.source} proxy ${network.proxy.url}` : null,
  ].filter(Boolean);
  return details.length ? `${fallbackMessage} (${details.join("; ")})` : fallbackMessage;
}

function withProviderNetwork(provider: ModelGatewayProvider, init: RequestInit): FetchInitWithDispatcher {
  return withProxyNetwork(provider.network.proxyUrl, init, `provider '${provider.id}'`);
}

function withGatewayUpstreamNetwork(
  provider: ModelGatewayProvider,
  init: RequestInit,
  targetUrl: string,
  account?: ModelGatewayAccountEntry | null,
): FetchInitWithDispatcher {
  const selection = gatewayUpstreamProxySelection(provider, targetUrl, account);
  return withProxyNetwork(
    selection.proxyUrl,
    init,
    account ? `Codex account '${account.id}' upstream request` : `provider '${provider.id}' upstream request`,
  );
}

function withCodexAccountAuthNetwork(
  init: RequestInit,
  targetUrl: string,
  account?: ModelGatewayAccountEntry | null,
): FetchInitWithDispatcher {
  const selection = codexAccountAuthProxySelection(targetUrl, account);
  return withProxyNetwork(
    selection.proxyUrl,
    init,
    account ? `Codex account '${account.id}' auth request` : "Codex account auth request",
  );
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
    || normalizeErrorScalar(parsed.detail)
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

function shouldNormalizePassthroughUpstreamError(upstreamHeaders: Headers, responseText: string): boolean {
  const contentType = normalizeString(upstreamHeaders.get("content-type")).toLowerCase();
  if (contentType.includes("json") || contentType.includes("text/event-stream")) return false;
  return !parseJsonObjectOrNull(responseText);
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

function extractTextFromContentParts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((part) => {
    if (typeof part === "string") return [part];
    if (!isRecord(part)) return [];
    return [
      normalizeString(part.text),
      normalizeString(part.output_text),
      normalizeString(part.content),
    ].filter(Boolean);
  });
}

function extractProviderTestTextFromPayload(provider: ModelGatewayProvider, parsed: Record<string, unknown>): string | null {
  if (provider.apiFormat === "openai_responses") {
    if (normalizeString(parsed.type) === "response.output_text.delta") {
      const deltaText = normalizeString(parsed.delta);
      if (deltaText) return deltaText;
    }
    const response = isRecord(parsed.response) ? parsed.response : parsed;
    const outputText = normalizeString(parsed.output_text);
    if (outputText) return outputText;
    if (Array.isArray(response.output)) {
      const texts = response.output.flatMap((item) => isRecord(item)
        ? extractTextFromContentParts(item.content)
        : []);
      if (texts.length) return texts.join("\n");
    }
  }

  if (provider.apiFormat === "anthropic_messages") {
    if (normalizeString(parsed.type) === "content_block_delta" && isRecord(parsed.delta)) {
      const deltaText = normalizeString(parsed.delta.text);
      if (deltaText) return deltaText;
    }
    const texts = extractTextFromContentParts(parsed.content);
    if (texts.length) return texts.join("\n");
  }

  if (Array.isArray(parsed.choices)) {
    const texts = parsed.choices.flatMap((choice) => {
      if (!isRecord(choice)) return [];
      const message = isRecord(choice.message) ? choice.message : {};
      return [
        ...extractTextFromContentParts(message.content),
        normalizeString(choice.text),
      ].filter(Boolean);
    });
    if (texts.length) return texts.join("\n");
  }

  return null;
}

function extractProviderTestText(provider: ModelGatewayProvider, responseText: string): string | null {
  const direct = parseJsonObjectOrNull(responseText);
  const candidates = [
    ...(direct ? [direct] : []),
    ...extractJsonPayloadsFromSseText(responseText).filter(isRecord),
  ];
  const texts = candidates
    .map((candidate) => extractProviderTestTextFromPayload(provider, candidate))
    .filter((text): text is string => Boolean(text));
  if (texts.length) return texts.join("\n");
  return previewText(responseText);
}

function visionSmokeTextPassed(value: string | null): boolean {
  const normalized = (value || "").toLowerCase();
  return /\bred\b/.test(normalized) || /红|紅/.test(normalized);
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

function requestContentType(req: http.IncomingMessage): string {
  const value = req.headers["content-type"];
  return Array.isArray(value) ? normalizeString(value[0]).toLowerCase() : normalizeString(value).toLowerCase();
}

function requestBodyIsJson(req: http.IncomingMessage): boolean {
  const contentType = requestContentType(req);
  return !contentType || contentType.includes("json") || contentType.endsWith("+json");
}

function extractModelFromUrlEncodedBody(body: Buffer): string | null {
  try {
    return normalizeString(new URLSearchParams(body.toString("utf8")).get("model")) || null;
  } catch {
    return null;
  }
}

function extractMultipartField(body: Buffer, fieldName: string): string | null {
  const preview = body.subarray(0, Math.min(body.byteLength, 1_048_576)).toString("latin1");
  const boundary = /^--([^\r\n]+)/.exec(preview)?.[1];
  const parts = boundary ? preview.split(`--${boundary}`) : [preview];
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dispositionPattern = new RegExp(`content-disposition:[^\\r\\n]*name="${escapedName}"(?:;|\\s|$)`, "i");
  for (const part of parts) {
    if (!dispositionPattern.test(part)) continue;
    const separator = part.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
    const bodyStart = part.indexOf(separator);
    if (bodyStart < 0) continue;
    return normalizeString(part.slice(bodyStart + separator.length).replace(/\r?\n$/, "")) || null;
  }
  return null;
}

function extractModelFromRequestBody(req: http.IncomingMessage, body: Buffer): string | null {
  if (!body.byteLength) return null;
  const contentType = requestContentType(req);
  if (!contentType || contentType.includes("json") || contentType.endsWith("+json")) {
    return extractModelFromJsonText(body.toString("utf8"));
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return extractModelFromUrlEncodedBody(body);
  }
  if (contentType.includes("multipart/form-data")) {
    return extractMultipartField(body, "model");
  }
  return null;
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

function normalizeAnthropicReasoningInJsonText(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return value;
    const next = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
    return normalizeAnthropicReasoningOptions(next) ? JSON.stringify(next) : value;
  } catch {
    return value;
  }
}

function normalizeCodexAccountInstructionsInJsonText(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return value;
    if (typeof parsed.instructions === "string") return value;
    return JSON.stringify({
      ...parsed,
      instructions: "",
    });
  } catch {
    return value;
  }
}

function codexAccountInputMessageFromText(text: string): Record<string, unknown> {
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  };
}

function codexAccountFunctionCallItemId(callId: string): string {
  return callId.startsWith("fc") ? callId : `fc_${callId}`;
}

function codexAccountCallIdFromFunctionCallItem(source: Record<string, unknown>): string {
  const callId = normalizeString(source.call_id);
  if (callId) return callId;
  const itemId = normalizeString(source.id);
  return itemId.startsWith("fc_") ? itemId.slice(3) : itemId;
}

function normalizeCodexAccountResponsesInputItem(source: unknown): unknown {
  if (!isRecord(source)) return source;
  const itemType = normalizeString(source.type);
  if (itemType === "function_call" || itemType === "custom_tool_call") {
    const callId = codexAccountCallIdFromFunctionCallItem(source);
    const name = normalizeString(source.name);
    if (!callId || !name) return codexAccountUnsupportedInputItemNote(itemType, source);
    return {
      ...source,
      id: codexAccountFunctionCallItemId(callId),
      call_id: callId,
    };
  }
  if (itemType === "function_call_output" || itemType === "custom_tool_call_output" || itemType === "shell_call_output") {
    const callId = normalizeString(source.call_id);
    if (!callId) return codexAccountUnsupportedInputItemNote(itemType, source);
    return {
      ...source,
      call_id: callId,
    };
  }
  if (itemType === "local_shell_call_output") {
    const itemId = normalizeString(source.id);
    if (!itemId) return codexAccountUnsupportedInputItemNote(itemType, source);
    const callId = normalizeString(source.call_id);
    return {
      ...source,
      id: itemId,
      ...(callId ? { call_id: callId } : {}),
    };
  }
  const normalized: Record<string, unknown> = source.role === "system" ? { ...source, role: "developer" } : { ...source };
  if (Array.isArray(normalized.content)) {
    normalized.content = normalized.content.map(normalizeCodexAccountResponsesContentPart);
  }
  return normalized;
}

function codexAccountUnsupportedInputItemNote(type: string, source: unknown): Record<string, unknown> {
  return codexAccountInputMessageFromText(`[OpenAI Responses malformed ${type} input item omitted for Codex account compatibility: ${stringifyCompact(codexAccountSafeCompatibilityValue(source))}]`);
}

function normalizeCodexAccountResponsesContentPart(source: unknown): unknown {
  if (!isRecord(source)) return source;
  const type = normalizeString(source.type);
  if (type === "text") {
    return { ...source, type: "input_text" };
  }
  if (type === "image_url") {
    const imageUrl = isRecord(source.image_url) ? normalizeString(source.image_url.url) : normalizeString(source.image_url);
    if (!imageUrl) return codexAccountUnsupportedContentPartNote(source);
    const part: Record<string, unknown> = { type: "input_image", image_url: imageUrl };
    const detail = normalizeString(source.detail) || (isRecord(source.image_url) ? normalizeString(source.image_url.detail) : "");
    if (detail) part.detail = detail;
    return part;
  }
  if (type === "file" || type === "input_file") {
    return normalizeCodexAccountResponsesInputFilePart(source);
  }
  const transcript = codexAccountContentPartTranscript(source);
  if (transcript) return { type: "input_text", text: transcript };
  if (
    type === "input_text"
    || type === "input_image"
    || type === "output_text"
    || type === "refusal"
    || type === "computer_screenshot"
    || type === "summary_text"
  ) {
    return source;
  }
  return codexAccountUnsupportedContentPartNote(source);
}

function codexAccountContentPartTranscript(source: Record<string, unknown>): string {
  const direct = normalizeString(source.transcript);
  if (direct) return direct;
  const inputAudio = isRecord(source.input_audio) ? normalizeString(source.input_audio.transcript) : "";
  if (inputAudio) return inputAudio;
  const outputAudio = isRecord(source.output_audio) ? normalizeString(source.output_audio.transcript) : "";
  return outputAudio;
}

function normalizeCodexAccountResponsesInputFilePart(source: Record<string, unknown>): unknown {
  const fileId = source.file_id;
  if (fileId !== undefined) {
    return { type: "input_file", file_id: fileId };
  }
  const fileUrl = source.file_url ?? source.url;
  if (fileUrl !== undefined) {
    return { type: "input_file", file_url: fileUrl };
  }
  const fileData = source.file_data;
  if (fileData !== undefined) {
    const filename = source.filename ?? source.name ?? "input-file";
    return { type: "input_file", file_data: fileData, filename };
  }
  return codexAccountUnsupportedContentPartNote(source);
}

const CODEX_ACCOUNT_RESPONSES_INPUT_ITEM_FIELDS_BY_TYPE: Record<string, Set<string>> = {
  message: new Set(["id", "type", "role", "status", "content"]),
  function_call: new Set(["id", "type", "status", "call_id", "name", "arguments"]),
  function_call_output: new Set(["id", "type", "status", "call_id", "output"]),
  custom_tool_call: new Set(["id", "type", "status", "call_id", "name", "input"]),
  custom_tool_call_output: new Set(["id", "type", "status", "call_id", "output"]),
  local_shell_call_output: new Set(["id", "type", "status", "call_id", "output"]),
  shell_call_output: new Set(["id", "type", "status", "call_id", "output"]),
};

const CODEX_ACCOUNT_RESPONSES_CONTENT_PART_FIELDS_BY_TYPE: Record<string, Set<string>> = {
  input_text: new Set(["type", "text"]),
  output_text: new Set(["type", "text", "annotations", "logprobs"]),
  input_image: new Set(["type", "image_url", "file_id", "detail"]),
  input_file: new Set(["type", "file_id", "file_url", "file_data", "filename"]),
  refusal: new Set(["type", "refusal"]),
  computer_screenshot: new Set(["type", "image_url", "file_id", "detail"]),
  summary_text: new Set(["type", "text"]),
};

const CODEX_ACCOUNT_RESPONSES_IMAGE_DETAILS = new Set(["low", "high", "auto", "original"]);

function normalizeCodexAccountResponsesInputFields(value: Record<string, unknown>): void {
  if (!Array.isArray(value.input)) return;
  const omitted: Array<{ path: string; value: unknown }> = [];
  value.input.forEach((item, itemIndex) => {
    if (!isRecord(item)) return;
    const itemType = normalizeString(item.type) || (item.role !== undefined ? "message" : "");
    const allowedItemFields = CODEX_ACCOUNT_RESPONSES_INPUT_ITEM_FIELDS_BY_TYPE[itemType];
    if (allowedItemFields) {
      for (const key of Object.keys(item)) {
        if (allowedItemFields.has(key) || key === "annotations" || key === "cache_control" || key === "metadata") continue;
        omitted.push({ path: `input[${itemIndex}].${key}`, value: item[key] });
        delete item[key];
      }
    }
    if (!Array.isArray(item.content)) return;
    item.content.forEach((part, partIndex) => {
      if (!isRecord(part)) return;
      const partType = normalizeString(part.type);
      const allowedPartFields = CODEX_ACCOUNT_RESPONSES_CONTENT_PART_FIELDS_BY_TYPE[partType];
      if (allowedPartFields) {
        for (const key of Object.keys(part)) {
          if (allowedPartFields.has(key) || key === "annotations" || key === "cache_control" || key === "metadata") continue;
          omitted.push({ path: `input[${itemIndex}].content[${partIndex}].${key}`, value: part[key] });
          delete part[key];
        }
      }
      const detail = normalizeString(part.detail);
      if (detail && !CODEX_ACCOUNT_RESPONSES_IMAGE_DETAILS.has(detail)) {
        omitted.push({ path: `input[${itemIndex}].content[${partIndex}].detail`, value: part.detail });
        delete part.detail;
      }
    });
  });
  if (omitted.length) {
    appendCodexAccountCompatibilityNote(value, "input fields", omitted);
  }
}

function codexAccountUnsupportedContentPartNote(source: unknown): Record<string, unknown> {
  return {
    type: "input_text",
    text: `[OpenAI Responses content part omitted for Codex account compatibility: ${stringifyCompact(source)}]`,
  };
}

function normalizeCodexAccountBuiltinToolType(value: unknown): string | null {
  const type = normalizeString(value);
  if (type === "web_search_preview" || type === "web_search_preview_2025_03_11") return "web_search";
  return null;
}

function normalizeCodexAccountBuiltinToolAtPath(source: unknown): unknown {
  if (!isRecord(source)) return source;
  const normalizedType = normalizeCodexAccountBuiltinToolType(source.type);
  if (!normalizedType) return source;
  return {
    ...source,
    type: normalizedType,
  };
}

function normalizeCodexAccountResponsesToolAtPath(source: unknown): unknown {
  const builtinNormalized = normalizeCodexAccountBuiltinToolAtPath(source);
  if (!isRecord(builtinNormalized)) return builtinNormalized;
  const type = normalizeString(builtinNormalized.type);
  if (type !== "function") return builtinNormalized;
  const nestedFunction = isRecord(builtinNormalized.function) ? builtinNormalized.function : null;
  const normalized: Record<string, unknown> = { ...builtinNormalized };
  if (nestedFunction) {
    if (!normalizeString(normalized.name)) normalized.name = nestedFunction.name;
    if (normalized.description === undefined && nestedFunction.description !== undefined) normalized.description = nestedFunction.description;
    if (normalized.parameters === undefined && nestedFunction.parameters !== undefined) normalized.parameters = nestedFunction.parameters;
    if (normalized.strict === undefined && nestedFunction.strict !== undefined) normalized.strict = nestedFunction.strict;
    delete normalized.function;
  }
  if (normalized.parameters === undefined && normalized.input_schema !== undefined) {
    normalized.parameters = normalized.input_schema;
  }
  delete normalized.input_schema;
  normalizeCodexAccountResponsesFunctionStrictCompatibility(normalized);
  return normalized;
}

function normalizeCodexAccountResponsesFunctionStrictCompatibility(tool: Record<string, unknown>): void {
  if (tool.strict !== true) return;
  if (isCodexAccountOpenAIStrictJsonSchema(tool.parameters)) return;
  delete tool.strict;
}

function isCodexAccountOpenAIStrictJsonSchema(schema: unknown): boolean {
  if (Array.isArray(schema)) return schema.every(isCodexAccountOpenAIStrictJsonSchema);
  if (!isRecord(schema)) return true;

  const properties = isRecord(schema.properties) ? schema.properties : null;
  if (properties && Object.keys(properties).length > 0) {
    const required = Array.isArray(schema.required) ? schema.required : null;
    if (schema.additionalProperties !== false || !required) return false;
    const requiredNames = new Set(required.filter((item): item is string => typeof item === "string"));
    if (!Object.keys(properties).every((key) => requiredNames.has(key))) return false;
  }

  return Object.values(schema).every(isCodexAccountOpenAIStrictJsonSchema);
}

function normalizeCodexAccountResponsesToolsAndChoice(value: Record<string, unknown>): void {
  const supportedToolNames = new Set<string>();
  const supportedToolTypes = new Set<string>();
  const omittedTools: unknown[] = [];

  if (Array.isArray(value.tools)) {
    const tools: unknown[] = [];
    for (const tool of value.tools) {
      const normalized = normalizeCodexAccountResponsesToolAtPath(tool);
      if (!isRecord(normalized)) {
        omittedTools.push(tool);
        continue;
      }
      const type = normalizeString(normalized.type);
      if (!isCodexAccountSupportedResponsesToolType(type)) {
        omittedTools.push(tool);
        continue;
      }
      tools.push(normalized);
      supportedToolTypes.add(type);
      const name = normalizeString(normalized.name);
      if (name) supportedToolNames.add(name);
    }
    if (tools.length) value.tools = tools;
    else delete value.tools;
  }

  if (omittedTools.length) appendCodexAccountCompatibilityNote(value, "tools", omittedTools);

  if (isRecord(value.tool_choice)) {
    const toolChoice: Record<string, unknown> = { ...value.tool_choice };
    const normalizedType = normalizeCodexAccountBuiltinToolType(toolChoice.type);
    if (normalizedType) toolChoice.type = normalizedType;
    const nestedFunctionName = isRecord(toolChoice.function) ? normalizeString(toolChoice.function.name) : "";
    if (!normalizeString(toolChoice.name) && nestedFunctionName) {
      toolChoice.name = nestedFunctionName;
    }
    delete toolChoice.function;
    if (Array.isArray(toolChoice.tools)) {
      toolChoice.tools = toolChoice.tools.map(normalizeCodexAccountResponsesToolAtPath);
    }
    if (isCodexAccountSupportedToolChoice(toolChoice, supportedToolTypes, supportedToolNames)) {
      value.tool_choice = toolChoice;
    } else {
      appendCodexAccountCompatibilityNote(value, "tool_choice", [value.tool_choice]);
      delete value.tool_choice;
    }
  } else if (value.tool_choice === "required" && !Array.isArray(value.tools)) {
    appendCodexAccountCompatibilityNote(value, "tool_choice", [value.tool_choice]);
    delete value.tool_choice;
  }
}

function isCodexAccountSupportedResponsesToolType(type: string): boolean {
  return type === "function"
    || type === "custom"
    || type === "web_search"
    || type === "image_generation";
}

function isCodexAccountSupportedToolChoice(
  toolChoice: Record<string, unknown>,
  supportedToolTypes: Set<string>,
  supportedToolNames: Set<string>,
): boolean {
  const type = normalizeString(toolChoice.type);
  if (!type || !isCodexAccountSupportedResponsesToolType(type)) return false;
  if (type === "function" || type === "custom") {
    const name = normalizeString(toolChoice.name) || (isRecord(toolChoice.function) ? normalizeString(toolChoice.function.name) : "");
    return Boolean(name && supportedToolNames.has(name));
  }
  return supportedToolTypes.has(type);
}

function estimateAnthropicMessagesCountTokens(bodyText: string | undefined): number {
  if (!bodyText) return 1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return estimateTextTokens(bodyText);
  }
  const tokenBearingPayload = anthropicCountTokensEstimatePayload(parsed);
  const text = collectTokenEstimateText(tokenBearingPayload).join("\n");
  const structuralOverhead = estimateAnthropicMessagesStructuralOverhead(parsed);
  return Math.max(1, estimateTextTokens(text) + structuralOverhead);
}

function estimateInputTokensForRoute(routeId: ModelGatewayRouteId | null, bodyText: string | undefined): number {
  if (routeId === "anthropic_messages") return estimateAnthropicMessagesCountTokens(bodyText);
  if (!bodyText) return 1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return estimateTextTokens(bodyText);
  }
  if (!isRecord(parsed)) return estimateTextTokens(bodyText);
  const tokenBearingPayload: Record<string, unknown> = {};
  for (const key of ["input", "messages", "prompt", "instructions", "system", "tools", "tool_choice", "response_format"] as const) {
    if (parsed[key] !== undefined) tokenBearingPayload[key] = parsed[key];
  }
  const text = collectTokenEstimateText(tokenBearingPayload).join("\n");
  const messages = Array.isArray(parsed.messages) ? parsed.messages.length : 0;
  const inputItems = Array.isArray(parsed.input) ? parsed.input.length : 0;
  const tools = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
  return Math.max(1, estimateTextTokens(text) + 4 + messages * 4 + inputItems * 4 + tools * 12);
}

function anthropicCountTokensEstimatePayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const payload: Record<string, unknown> = {};
  for (const key of ["system", "messages", "tools"] as const) {
    if (value[key] !== undefined) payload[key] = value[key];
  }
  return payload;
}

function estimateTextTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 1;
  const asciiWords = normalized.match(/[A-Za-z0-9_]+/g)?.length || 0;
  const nonAsciiChars = normalized.replace(/[\x00-\x7F]/g, "").length;
  const punctuation = normalized.match(/[^\sA-Za-z0-9_\x80-\uFFFF]/g)?.length || 0;
  return Math.max(1, Math.ceil(normalized.length / 4), asciiWords + Math.ceil(nonAsciiChars / 2) + Math.ceil(punctuation / 2));
}

function estimateOutputTokensFromResponse(value: unknown): number {
  const payload = outputTokenEstimatePayload(value);
  const text = collectTokenEstimateText(payload).join("\n");
  if (!text.trim()) return 0;
  return estimateTextTokens(text);
}

function outputTokenEstimatePayload(value: unknown): unknown {
  if (typeof value === "string") {
    const direct = parseJsonObjectOrNull(value);
    if (direct) return outputTokenEstimatePayload(direct);
    const ssePayloads = extractJsonPayloadsFromSseText(value);
    if (ssePayloads.length) return ssePayloads.map(outputTokenEstimatePayload);
    return value;
  }
  if (Array.isArray(value)) return value.map(outputTokenEstimatePayload);
  if (!isRecord(value)) return value ?? "";
  if (isRecord(value.response)) return outputTokenEstimatePayload(value.response);
  const type = normalizeString(value.type);
  if (type === "response.output_text.delta") return value.delta;
  if (type === "content_block_delta" && isRecord(value.delta)) return value.delta.text;
  if (type === "message_delta" && isRecord(value.usage)) return "";
  if (value.output_text !== undefined) return value.output_text;
  if (Array.isArray(value.output)) return value.output;
  if (Array.isArray(value.choices)) {
    return value.choices.map((choice) => {
      if (!isRecord(choice)) return choice;
      if (isRecord(choice.message)) return choice.message.content;
      if (isRecord(choice.delta)) return choice.delta.content ?? choice.delta.tool_calls;
      return choice.text;
    });
  }
  if (Array.isArray(value.content)) return value.content;
  if (value.text !== undefined) return value.text;
  if (value.arguments !== undefined) return value.arguments;
  return value;
}

function collectTokenEstimateText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(collectTokenEstimateText);
  if (!isRecord(value)) return [];
  const type = normalizeString(value.type);
  if (type === "image" || type === "input_image") return ["[image]"];
  if (type === "document" || type === "file" || type === "input_file") return ["[document]", ...collectTokenEstimateText(value.title), ...collectTokenEstimateText(value.filename), ...collectTokenEstimateText(value.name)];
  if (type === "tool_use" || type === "tool_result") return [stringifyCompact(value)];
  return Object.entries(value)
    .filter(([key]) => !TOKEN_ESTIMATE_NON_TEXT_KEYS.has(key))
    .flatMap(([, item]) => collectTokenEstimateText(item));
}

const TOKEN_ESTIMATE_NON_TEXT_KEYS = new Set([
  "cache_control",
  "data",
  "image_url",
  "metadata",
  "source",
]);

function estimateAnthropicMessagesStructuralOverhead(value: unknown): number {
  if (!isRecord(value)) return 0;
  const messages = Array.isArray(value.messages) ? value.messages.length : 0;
  const tools = Array.isArray(value.tools) ? value.tools.length : 0;
  const systemBlocks = Array.isArray(value.system) ? value.system.length : value.system === undefined ? 0 : 1;
  return 4 + messages * 4 + tools * 12 + systemBlocks * 2;
}

function appendCodexAccountCompatibilityNote(value: Record<string, unknown>, label: string, omitted: unknown[]): void {
  const input = Array.isArray(value.input) ? [...value.input] : [];
  const safeOmitted = omitted.map(codexAccountSafeCompatibilityValue);
  input.push({
    type: "message",
    role: "developer",
    content: [{
      type: "input_text",
      text: `[OpenAI Responses ${label} omitted for Codex account compatibility: ${safeOmitted.map(stringifyCompact).join("; ")}]`,
    }],
  });
  value.input = input;
}

function codexAccountSafeCompatibilityValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(codexAccountSafeCompatibilityValue);
  if (!isRecord(value)) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveCodexAccountCompatibilityField(key)) continue;
    safe[key] = codexAccountSafeCompatibilityValue(item);
  }
  return safe;
}

function stringifyCompact(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isLikelyOpenAIResponsesRequestJsonText(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return false;
    if (parsed.input !== undefined || parsed.instructions !== undefined || parsed.include !== undefined || parsed.store !== undefined) return true;
    return Array.isArray(parsed.tools) && !Array.isArray(parsed.messages);
  } catch {
    return false;
  }
}

function normalizeCodexAccountResponsesRequestInJsonText(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return value;
    const next: Record<string, unknown> = { ...parsed };

    if (typeof next.instructions !== "string") next.instructions = "";
    if (typeof next.input === "string") {
      next.input = [codexAccountInputMessageFromText(next.input)];
    }
    if (Array.isArray(next.input)) {
      next.input = next.input.map(normalizeCodexAccountResponsesInputItem);
    }
    normalizeCodexAccountResponsesInputFields(next);
    applyResponsesReasoningOptions(next, next);
    normalizeCodexAccountResponsesReasoning(next);
    normalizeCodexAccountResponsesResponseFormat(next);
    normalizeCodexAccountResponsesText(next);
    preserveCodexAccountUnsupportedRequestControls(next);

    next.stream = true;
    next.store = false;
    if (next.parallel_tool_calls !== false) next.parallel_tool_calls = true;
    const include = Array.isArray(next.include)
      ? next.include.map((item) => normalizeString(item)).filter(Boolean)
      : [];
    if (!include.includes("reasoning.encrypted_content")) include.push("reasoning.encrypted_content");
    next.include = include;

    for (const field of [
      "background",
      "frequency_penalty",
      "logprobs",
      "max_output_tokens",
      "max_completion_tokens",
      "max_tokens",
      "max_tool_calls",
      "modalities",
      "n",
      "presence_penalty",
      "prompt",
      "seed",
      "temperature",
      "top_p",
      "top_logprobs",
      "truncation",
      "thinking",
      "output_config",
      "reasoning_effort",
      "reasoningEffort",
      "enable_thinking",
      "reasoning_split",
      "context_management",
      "conversation",
      "metadata",
      "user",
      "previous_response_id",
      "prompt_cache_retention",
      "safety_identifier",
      "stream_options",
      "response_format",
      "stop",
    ] as const) {
      delete next[field];
    }
    if (normalizeString(next.service_tier) !== "priority") delete next.service_tier;

    normalizeCodexAccountResponsesToolsAndChoice(next);
    stripCodexAccountUnsupportedTopLevelFields(next);

    const strippedCompatibilityFields = stripCodexAccountResponsesUnsupportedFields(next);
    const strippedAnnotations = strippedCompatibilityFields
      .filter((item) => item.field === "annotations")
      .map((item) => ({ path: item.path, annotations: item.value }));
    if (strippedAnnotations.length) {
      appendCodexAccountCompatibilityNote(next, "input annotations", strippedAnnotations);
    }
    const strippedMetadata = strippedCompatibilityFields
      .filter((item) => item.field === "metadata")
      .map((item) => ({ path: item.path, metadata: codexAccountSafeMetadata(item.value) }))
      .filter((item) => item.metadata !== null);
    if (strippedMetadata.length) {
      appendCodexAccountCompatibilityNote(next, "input metadata", strippedMetadata);
    }
    const strippedCacheControl = strippedCompatibilityFields
      .filter((item) => item.field === "cache_control")
      .map((item) => ({ path: item.path, cache_control: item.value }));
    if (strippedCacheControl.length) {
      appendCodexAccountCompatibilityNote(next, "input cache_control", strippedCacheControl);
    }

    return JSON.stringify(next);
  } catch {
    return value;
  }
}

function normalizeCodexAccountResponsesReasoning(value: Record<string, unknown>): void {
  if (!isRecord(value.reasoning)) return;
  const reasoning: Record<string, unknown> = { ...value.reasoning };
  if (reasoning.summary === undefined && reasoning.generate_summary !== undefined) {
    reasoning.summary = reasoning.generate_summary;
  }
  delete reasoning.generate_summary;
  const omittedReasoning: Record<string, unknown> = {};
  for (const key of Object.keys(reasoning)) {
    if (key === "effort" || key === "summary" || key === "mode") continue;
    omittedReasoning[key] = reasoning[key];
    delete reasoning[key];
  }
  value.reasoning = reasoning;
  if (Object.keys(omittedReasoning).length) {
    appendCodexAccountCompatibilityNote(value, "reasoning fields", [omittedReasoning]);
  }
}

function normalizeCodexAccountResponsesResponseFormat(value: Record<string, unknown>): void {
  if (!isRecord(value.response_format)) return;
  const format = codexAccountTextFormatFromResponseFormat(value.response_format);
  if (!format) {
    appendCodexAccountCompatibilityNote(value, "response_format", [value.response_format]);
    return;
  }
  const text = isRecord(value.text) ? { ...value.text } : {};
  text.format = format;
  value.text = text;
  const formatType = normalizeString(format.type);
  if (formatType === "json_object" || formatType === "json_schema") {
    appendCodexAccountCompatibilityNote(value, "response_format", [value.response_format]);
  }
}

function normalizeCodexAccountResponsesText(value: Record<string, unknown>): void {
  if (!isRecord(value.text)) return;
  const text: Record<string, unknown> = { ...value.text };
  normalizeCodexAccountResponsesTextFormatStrictCompatibility(text);
  const omittedText: Record<string, unknown> = {};
  for (const key of Object.keys(text)) {
    if (key === "format" || key === "verbosity") continue;
    omittedText[key] = text[key];
    delete text[key];
  }
  if (Object.keys(text).length) value.text = text;
  else delete value.text;
  if (Object.keys(omittedText).length) {
    appendCodexAccountCompatibilityNote(value, "text fields", [omittedText]);
  }
}

function normalizeCodexAccountResponsesTextFormatStrictCompatibility(text: Record<string, unknown>): void {
  if (!isRecord(text.format)) return;
  const format: Record<string, unknown> = { ...text.format };
  if (format.strict === true && !isCodexAccountOpenAIStrictJsonSchema(format.schema)) {
    format.strict = false;
  }
  text.format = format;
}

function codexAccountTextFormatFromResponseFormat(source: Record<string, unknown>): Record<string, unknown> | null {
  const type = normalizeString(source.type);
  if (type === "text") return { type: "text" };
  if (type === "json_object") return { type: "json_object" };
  if (type !== "json_schema") return null;
  const directSchema = isRecord(source.schema) ? source.schema : null;
  const nested = isRecord(source.json_schema) ? source.json_schema : null;
  const schema = directSchema || (isRecord(nested?.schema) ? nested.schema : null);
  if (!schema) return null;
  const name = normalizeString(source.name) || normalizeString(nested?.name) || "response_schema";
  const format: Record<string, unknown> = {
    type: "json_schema",
    name,
    schema,
  };
  const description = normalizeString(source.description) || normalizeString(nested?.description);
  if (description) format.description = description;
  const strict = typeof source.strict === "boolean" ? source.strict : nested?.strict;
  if (typeof strict === "boolean") format.strict = strict;
  return format;
}

function preserveCodexAccountUnsupportedRequestControls(value: Record<string, unknown>): void {
  const omitted: Record<string, unknown> = {};
  for (const field of [
    "background",
    "frequency_penalty",
    "logprobs",
    "max_output_tokens",
    "max_completion_tokens",
    "max_tokens",
    "max_tool_calls",
    "modalities",
    "n",
    "presence_penalty",
    "prompt",
    "seed",
    "temperature",
    "top_p",
    "top_logprobs",
    "truncation",
    "thinking",
    "output_config",
    "reasoning_effort",
    "reasoningEffort",
    "enable_thinking",
    "reasoning_split",
    "context_management",
    "conversation",
    "user",
    "previous_response_id",
    "prompt_cache_retention",
    "safety_identifier",
    "stream_options",
    "stop",
  ] as const) {
    if (value[field] !== undefined) omitted[field] = value[field];
  }
  const safeMetadata = codexAccountSafeMetadata(value.metadata);
  if (safeMetadata) omitted.metadata = safeMetadata;
  if (Object.keys(omitted).length) {
    appendCodexAccountCompatibilityNote(value, "request controls", [omitted]);
  }
}

function codexAccountSafeMetadata(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const metadata: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveCodexAccountCompatibilityField(key)) continue;
    metadata[key] = item;
  }
  return Object.keys(metadata).length ? metadata : null;
}

function isSensitiveCodexAccountCompatibilityField(field: string): boolean {
  return /(?:authorization|secret|api[_-]?key|headers?|password|credential|bearer|(?:^|[_-])(?:access|refresh|id|auth)?[_-]?token(?:$|[_-]))/i.test(field);
}

const CODEX_ACCOUNT_RESPONSES_TOP_LEVEL_FIELDS = new Set([
  "include",
  "input",
  "instructions",
  "model",
  "parallel_tool_calls",
  "prompt_cache_key",
  "reasoning",
  "service_tier",
  "store",
  "stream",
  "text",
  "tool_choice",
  "tool_usage",
  "tools",
]);

function stripCodexAccountUnsupportedTopLevelFields(value: Record<string, unknown>): void {
  const omitted: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (CODEX_ACCOUNT_RESPONSES_TOP_LEVEL_FIELDS.has(key)) continue;
    omitted[key] = value[key];
    delete value[key];
  }
  if (Object.keys(omitted).length) {
    appendCodexAccountCompatibilityNote(value, "top-level fields", [omitted]);
  }
}

type CodexAccountStrippedCompatibilityField = {
  field: "annotations" | "cache_control" | "metadata";
  path: string;
  value: unknown;
};

function stripCodexAccountResponsesUnsupportedFields(
  value: unknown,
  path = "$",
): CodexAccountStrippedCompatibilityField[] {
  const stripped: CodexAccountStrippedCompatibilityField[] = [];
  if (isCodexAccountSchemaCompatibilityPath(path)) return stripped;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      stripped.push(...stripCodexAccountResponsesUnsupportedFields(item, `${path}[${index}]`));
    });
    return stripped;
  }
  if (!isRecord(value)) return stripped;
  // Anthropic prompt-caching hints, client metadata, and response annotations can
  // appear on nested message/content/tool objects after CLI or compatibility
  // translations, but the Codex account Responses backend rejects those
  // object-local fields as unknown/unsupported parameters. Strip them
  // recursively before forwarding.
  for (const field of ["cache_control", "metadata", "annotations"] as const) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      stripped.push({ field, path: `${path}.${field}`, value: value[field] });
      delete value[field];
    }
  }
  for (const [key, item] of Object.entries(value)) {
    stripped.push(...stripCodexAccountResponsesUnsupportedFields(item, `${path}.${key}`));
  }
  return stripped;
}

function isCodexAccountSchemaCompatibilityPath(path: string): boolean {
  return /(?:^|\.)(?:parameters|input_schema|schema)(?:$|\.|\[)/.test(path);
}

function codexAccountRequestWantsStream(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) && parsed.stream === true;
  } catch {
    return false;
  }
}

function modelGatewayDiagnosticErrorSmokePayload(routeId: ModelGatewayRouteId | null): Record<string, unknown> {
  const message = "Tracevane Gateway diagnostic error smoke.";
  if (routeId === "anthropic_messages" || routeId === "anthropic_messages_count_tokens") {
    return {
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "model_gateway_error_smoke",
        message,
      },
    };
  }
  return {
    error: {
      type: "invalid_request_error",
      code: "model_gateway_error_smoke",
      message,
    },
  };
}

function sendModelGatewayDiagnosticErrorSmoke(
  res: http.ServerResponse,
  routeId: ModelGatewayRouteId | null,
  stream: boolean,
): void {
  const payload = modelGatewayDiagnosticErrorSmokePayload(routeId);
  if (!stream) {
    sendJson(res, 400, payload);
    return;
  }
  setCorsHeaders(res);
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write("event: error\n");
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.end();
}

type CodexAccountImageGenerationPreparedRequest = {
  bodyText: string;
  imageModel: string;
  responseFormat: string;
  clientStream: boolean;
};

function buildCodexAccountImageGenerationRequest(
  bodyText: string | undefined,
  provider: ModelGatewayProvider,
): CodexAccountImageGenerationPreparedRequest {
  const parsed = parseJsonObjectOrNull(bodyText || "");
  if (!parsed) {
    throw new ModelGatewayServiceError(
      "model_gateway_images_invalid_request",
      "OpenAI Images generation request body must be a JSON object.",
      400,
    );
  }
  const imageModel = normalizeString(parsed.model) || "gpt-image-2";
  const prompt = normalizeString(parsed.prompt);
  if (!prompt) {
    throw new ModelGatewayServiceError(
      "model_gateway_images_prompt_required",
      "OpenAI Images generation request requires a non-empty prompt.",
      400,
    );
  }
  const metadata = isRecord(provider.metadata) ? provider.metadata : {};
  const mainModel = normalizeString(metadata.imageGenerationMainModel, CODEX_ACCOUNT_IMAGE_GENERATION_MAIN_MODEL);
  const tool: Record<string, unknown> = {
    type: "image_generation",
    action: "generate",
    model: imageModel,
  };
  for (const field of ["size", "quality", "background", "output_format", "moderation"] as const) {
    const value = normalizeString(parsed[field]);
    if (value) tool[field] = value;
  }
  const style = normalizeString(parsed.style);
  if (style) tool.style = style;
  const n = positiveIntegerOrNull(parsed.n);
  if (n !== null && n > 1) tool.n = n;
  for (const field of ["output_compression", "partial_images"] as const) {
    const value = positiveIntegerOrNull(parsed[field]);
    if (value !== null) tool[field] = value;
  }
  const responsesRequest = {
    instructions: "",
    stream: true,
    reasoning: { effort: "medium", summary: "auto" },
    parallel_tool_calls: true,
    include: ["reasoning.encrypted_content"],
    model: mainModel,
    store: false,
    tool_choice: { type: "image_generation" },
    input: [{
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }],
    tools: [tool],
  };
  return {
    bodyText: JSON.stringify(responsesRequest),
    imageModel,
    responseFormat: normalizeString(parsed.response_format, "b64_json").toLowerCase(),
    clientStream: parsed.stream === true,
  };
}

function extractJsonPayloadsFromSseText(value: string): unknown[] {
  const payloads: unknown[] = [];
  for (const frame of value.split(/\r?\n\r?\n/)) {
    const dataLines = frame
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line && line !== "[DONE]");
    if (!dataLines.length) continue;
    try {
      payloads.push(JSON.parse(dataLines.join("\n")) as unknown);
    } catch {
      // Keepalive or debug SSE frames are irrelevant; the completed frame carries the result.
    }
  }
  return payloads;
}

function nextSseFrameBoundary(value: string): { index: number; length: number } | null {
  const crlf = value.indexOf("\r\n\r\n");
  const lf = value.indexOf("\n\n");
  if (crlf < 0 && lf < 0) return null;
  if (crlf >= 0 && (lf < 0 || crlf <= lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

function consumeSseJsonPayloads(
  buffer: string,
  onJsonPayload: (payload: unknown) => void,
  flush = false,
): string {
  let rest = buffer;
  for (;;) {
    const boundary = nextSseFrameBoundary(rest);
    if (!boundary) break;
    const frame = rest.slice(0, boundary.index);
    rest = rest.slice(boundary.index + boundary.length);
    for (const payload of extractJsonPayloadsFromSseText(`${frame}\n\n`)) onJsonPayload(payload);
  }
  if (flush && rest.trim()) {
    for (const payload of extractJsonPayloadsFromSseText(`${rest}\n\n`)) onJsonPayload(payload);
    return "";
  }
  return rest;
}

function buildCodexAccountResponsesJsonFromSseText(responseText: string): Record<string, unknown> {
  const direct = parseJsonObjectOrNull(responseText);
  if (direct) {
    const directError = responsesStreamErrorFromPayload(direct);
    if (directError) {
      throw new ModelGatewayServiceError(
        directError.code || directError.type || "model_gateway_codex_account_stream_error",
        directError.message,
        upstreamErrorStatusCodeForHealth(directError.code, directError.message),
      );
    }
    return direct;
  }

  const payloads = extractJsonPayloadsFromSseText(responseText);
  const outputByIndex = new Map<number, unknown>();
  const outputFallback: unknown[] = [];
  let completedResponse: Record<string, unknown> | null = null;
  for (const payload of payloads) {
    if (!isRecord(payload)) continue;
    const streamError = responsesStreamErrorFromPayload(payload);
    if (streamError) {
      throw new ModelGatewayServiceError(
        streamError.code || streamError.type || "model_gateway_codex_account_stream_error",
        streamError.message,
        upstreamErrorStatusCodeForHealth(streamError.code, streamError.message),
      );
    }
    if (payload.error !== undefined) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_account_stream_error",
        normalizeString(isRecord(payload.error) ? payload.error.message : payload.error, "Codex account stream returned an error."),
        502,
      );
    }
    const type = normalizeString(payload.type);
    if (type === "response.output_item.done" && isRecord(payload.item)) {
      const outputIndex = typeof payload.output_index === "number" && Number.isFinite(payload.output_index)
        ? Math.max(0, Math.floor(payload.output_index))
        : null;
      if (outputIndex !== null) outputByIndex.set(outputIndex, payload.item);
      else outputFallback.push(payload.item);
      continue;
    }
    if (type === "response.completed" && isRecord(payload.response)) {
      completedResponse = { ...payload.response };
    }
  }

  if (!completedResponse) {
    throw new ModelGatewayServiceError(
      "model_gateway_codex_account_response_missing",
      "Codex account upstream stream ended without response.completed.",
      502,
    );
  }

  const output = Array.isArray(completedResponse.output) ? completedResponse.output : [];
  if (!output.length && (outputByIndex.size || outputFallback.length)) {
    const patchedOutput: unknown[] = [];
    for (const index of [...outputByIndex.keys()].sort((a, b) => a - b)) {
      patchedOutput.push(outputByIndex.get(index));
    }
    patchedOutput.push(...outputFallback);
    completedResponse.output = patchedOutput;
  }
  return completedResponse;
}

function parseOpenAIResponsesUpstreamBody(
  responseText: string,
  options: { codexAccountSse: boolean },
): unknown {
  return options.codexAccountSse
    ? buildCodexAccountResponsesJsonFromSseText(responseText)
    : JSON.parse(responseText) as unknown;
}

function observeReadableStreamFirstChunk(
  stream: ReadableStream<Uint8Array>,
  onFirstChunk: () => void,
): ReadableStream<Uint8Array> {
  let observed = false;
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value?.byteLength && !observed) {
        observed = true;
        onFirstChunk();
      }
      if (value) controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

async function pipeReadableStreamToServerResponse(
  stream: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  options: {
    onFirstChunk?: () => void;
    onJsonPayload?: (payload: unknown) => void;
  } = {},
): Promise<void> {
  const reader = stream.getReader();
  const decoder = options.onJsonPayload ? new TextDecoder() : null;
  let sseBuffer = "";
  let firstChunkObserved = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      if (options.onJsonPayload && decoder) {
        sseBuffer += decoder.decode();
        sseBuffer = consumeSseJsonPayloads(sseBuffer, options.onJsonPayload, true);
      }
      return;
    }
    if (value?.byteLength) {
      if (!firstChunkObserved) {
        firstChunkObserved = true;
        options.onFirstChunk?.();
      }
      const chunk = Buffer.from(value);
      res.write(chunk);
      if (options.onJsonPayload && decoder) {
        sseBuffer += decoder.decode(value, { stream: true });
        sseBuffer = consumeSseJsonPayloads(sseBuffer, options.onJsonPayload);
      }
    }
  }
}

function mimeTypeFromImageOutputFormat(value: unknown): string {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "webp") return "image/webp";
  return "image/png";
}

function imagesApiEntryFromResponsesItem(
  item: unknown,
  responseFormat: string,
): { entry: Record<string, unknown>; meta: Record<string, unknown> } | null {
  if (!isRecord(item) || item.type !== "image_generation_call") return null;
  const result = normalizeString(item.result);
  if (!result) return null;
  const outputFormat = normalizeString(item.output_format);
  const entry: Record<string, unknown> = {};
  if (responseFormat === "url") {
    entry.url = `data:${mimeTypeFromImageOutputFormat(outputFormat)};base64,${result}`;
  } else {
    entry.b64_json = result;
  }
  const revisedPrompt = normalizeString(item.revised_prompt);
  if (revisedPrompt) entry.revised_prompt = revisedPrompt;
  return { entry, meta: item };
}

function collectImagesApiEntriesFromResponsesOutput(
  output: unknown[],
  responseFormat: string,
): { data: Record<string, unknown>[]; firstMeta: Record<string, unknown> | null } {
  const data: Record<string, unknown>[] = [];
  let firstMeta: Record<string, unknown> | null = null;
  for (const item of output) {
    const extracted = imagesApiEntryFromResponsesItem(item, responseFormat);
    if (!extracted) continue;
    data.push(extracted.entry);
    if (!firstMeta) firstMeta = extracted.meta;
  }
  return { data, firstMeta };
}

function responseOutputTypeSummary(output: unknown[]): string {
  const types = output
    .map((item) => isRecord(item) ? normalizeString(item.type, "unknown") : typeof item)
    .filter(Boolean);
  return types.length ? Array.from(new Set(types)).join(",") : "empty";
}

function responseOutputTextPreview(output: unknown[]): string | null {
  const texts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!isRecord(part)) continue;
      const text = normalizeString(part.text) || normalizeString(part.output_text);
      if (text) texts.push(text);
    }
  }
  return texts.length ? previewText(texts.join(" ")) : null;
}

function imagesUpstreamErrorFromPayload(candidate: unknown): ModelGatewayServiceError | null {
  if (!isRecord(candidate)) return null;
  const type = normalizeString(candidate.type);
  let errorObj: Record<string, unknown> | null = null;
  if (type === "error" && isRecord(candidate.error)) {
    errorObj = candidate.error;
  } else if (type === "response.failed" && isRecord(candidate.response) && isRecord(candidate.response.error)) {
    errorObj = candidate.response.error;
  } else if (isRecord(candidate.response)
    && normalizeString(candidate.response.status) === "failed"
    && isRecord(candidate.response.error)) {
    errorObj = candidate.response.error;
  } else if (isRecord(candidate.error)) {
    errorObj = candidate.error;
  }
  if (!errorObj) return null;
  const upstreamCode = normalizeErrorScalar(errorObj.code) || "upstream_error";
  const upstreamType = normalizeErrorScalar(errorObj.type) || "upstream_error";
  const message = normalizeErrorScalar(errorObj.message)
    || normalizeErrorScalar(candidate.message)
    || "Codex account upstream image generation request failed.";
  const statusCode = upstreamCode === "moderation_blocked" || upstreamType === "image_generation_user_error"
    ? 400
    : 502;
  return new ModelGatewayServiceError(
    upstreamCode === "upstream_error" ? "model_gateway_images_upstream_failed" : upstreamCode,
    message,
    statusCode,
  );
}

function responsesStreamErrorFromPayload(candidate: unknown): { message: string; type: string; code: string } | null {
  if (!isRecord(candidate)) return null;
  const eventType = normalizeString(candidate.type);
  let errorObj: Record<string, unknown> | null = null;
  if (eventType === "error" && isRecord(candidate.error)) {
    errorObj = candidate.error;
  } else if (eventType === "response.failed" && isRecord(candidate.response) && isRecord(candidate.response.error)) {
    errorObj = candidate.response.error;
  } else if (isRecord(candidate.response)
    && normalizeString(candidate.response.status) === "failed"
    && isRecord(candidate.response.error)) {
    errorObj = candidate.response.error;
  } else if (isRecord(candidate.error)) {
    errorObj = candidate.error;
  }
  if (!errorObj) return null;
  const message = normalizeErrorScalar(errorObj.message)
    || normalizeErrorScalar(candidate.message)
    || "Responses stream returned an upstream error.";
  const type = normalizeErrorScalar(errorObj.type) || normalizeErrorScalar(candidate.type) || "upstream_error";
  const code = normalizeErrorScalar(errorObj.code) || type;
  return { message, type, code };
}

function buildImagesApiResponseFromResponsesText(
  responseText: string,
  responseFormat: string,
): Record<string, unknown> {
  const candidates: unknown[] = [];
  const direct = parseJsonObjectOrNull(responseText);
  if (direct) candidates.push(direct);
  candidates.push(...extractJsonPayloadsFromSseText(responseText));

  let createdAt = Math.floor(Date.now() / 1000);
  let usage: unknown = null;
  let firstCompletedResponse: Record<string, unknown> | null = null;
  const outputItemDoneItems: unknown[] = [];
  const outputSummaries: string[] = [];
  const textPreviews: string[] = [];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const upstreamError = imagesUpstreamErrorFromPayload(candidate);
    if (upstreamError) throw upstreamError;
    if (candidate.type === "response.output_item.done" && isRecord(candidate.item)) {
      outputItemDoneItems.push(candidate.item);
      continue;
    }
    const response = isRecord(candidate.response) ? candidate.response : candidate;
    const responseCreatedAt = positiveIntegerOrNull(response.created_at);
    if (responseCreatedAt !== null) createdAt = responseCreatedAt;
    if (isRecord(response.tool_usage) && isRecord(response.tool_usage.image_gen)) usage = response.tool_usage.image_gen;
    const output = Array.isArray(response.output) ? response.output : [];
    if (candidate.type === "response.completed" || response.status === "completed") {
      firstCompletedResponse ||= response;
    }
    outputSummaries.push(responseOutputTypeSummary(output));
    const textPreview = responseOutputTextPreview(output);
    if (textPreview) textPreviews.push(textPreview);
    const { data, firstMeta } = collectImagesApiEntriesFromResponsesOutput(output, responseFormat);
    if (!data.length) continue;
    const result: Record<string, unknown> = {
      created: createdAt,
      data,
    };
    if (firstMeta) {
      for (const field of ["background", "output_format", "quality", "size"] as const) {
        const value = normalizeString(firstMeta[field]);
        if (value) result[field] = value;
      }
    }
    if (usage) result.usage = usage;
    return result;
  }

  if (outputItemDoneItems.length) {
    const { data, firstMeta } = collectImagesApiEntriesFromResponsesOutput(outputItemDoneItems, responseFormat);
    if (data.length) {
      const result: Record<string, unknown> = { created: createdAt, data };
      if (firstMeta) {
        for (const field of ["background", "output_format", "quality", "size"] as const) {
          const value = normalizeString(firstMeta[field]);
          if (value) result[field] = value;
        }
      }
      if (usage) result.usage = usage;
      return result;
    }
  }

  const completedOutput = Array.isArray(firstCompletedResponse?.output) ? firstCompletedResponse.output : [];
  const status = normalizeString(firstCompletedResponse?.status);
  const outputTypes = outputSummaries.length
    ? Array.from(new Set(outputSummaries)).join(";")
    : responseOutputTypeSummary(completedOutput);
  const preview = textPreviews[0] || responseOutputTextPreview(completedOutput);
  const suffix = [
    status ? `status=${status}` : "",
    `output_types=${outputTypes}`,
    preview ? `text=${preview}` : "",
  ].filter(Boolean).join("; ");

  throw new ModelGatewayServiceError(
    "model_gateway_images_output_missing",
    `Upstream completed without an image_generation_call result.${suffix ? ` ${suffix}` : ""}`,
    502,
  );
}

function isProviderHealthSuccess(statusCode: number | null, errorCode: string | null): boolean {
  if (errorCode) return false;
  if (statusCode === null) return false;
  return statusCode < 500 && statusCode !== 429;
}

function upstreamErrorStatusCodeForHealth(errorCode: string | null | undefined, errorMessage: string | null | undefined): number {
  return providerHealthNeutralUpstreamError(errorCode, errorMessage) ? 400 : 502;
}

function providerHealthNeutralUpstreamError(errorCode: string | null | undefined, errorMessage: string | null | undefined): boolean {
  const haystack = `${normalizeString(errorCode)} ${normalizeString(errorMessage)}`.toLowerCase();
  return haystack.includes("context_length_exceeded")
    || haystack.includes("context window")
    || haystack.includes("input exceeds")
    || haystack.includes("prompt too long")
    || haystack.includes("maximum context")
    || haystack.includes("max context");
}

function providerHealthSuccessForUpstreamResult(
  statusCode: number | null,
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): boolean {
  if (providerHealthNeutralUpstreamError(errorCode, errorMessage)) return true;
  return isProviderHealthSuccess(statusCode, errorCode || null);
}

function providerCircuitRetryReady(provider: ModelGatewayProvider, nowMs = Date.now()): boolean {
  return healthCircuitRetryReady(provider.health, nowMs);
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

function streamAdapterErrorEnvelope(error: unknown): { message: string; type?: string; code?: string } | null {
  if (error instanceof ModelGatewayStreamAdapterError || error instanceof ModelGatewayCodexStreamAdapterError) {
    const streamError = error.streamError;
    return {
      message: streamError.message,
      ...(streamError.type ? { type: streamError.type } : {}),
      ...(streamError.code ? { code: streamError.code } : {}),
    };
  }
  return null;
}

const requestLogUsageFallbacks = new WeakMap<ModelGatewayRouteDecision, ModelGatewayRuntimeUsage>();

function setRequestLogUsageFallback(
  route: ModelGatewayRouteDecision,
  usage: ModelGatewayRuntimeUsage,
): void {
  requestLogUsageFallbacks.set(route, usage);
}

function requestLogEntry(options: {
  kind: ModelGatewayRuntimeRequestLogEntry["kind"];
  startedAt: string;
  route: ModelGatewayRouteDecision;
  model: string | null;
  statusCode: number | null;
  outcome: ModelGatewayRuntimeRequestOutcome;
  firstByteMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  usage?: ModelGatewayRuntimeUsage | null;
}): ModelGatewayRuntimeRequestLogEntry {
  const finishedAt = nowIso();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(options.startedAt));
  const firstByteMs = typeof options.firstByteMs === "number" && Number.isFinite(options.firstByteMs)
    ? Math.max(0, Math.floor(options.firstByteMs))
    : null;
  return {
    id: randomUUID(),
    kind: options.kind,
    startedAt: options.startedAt,
    finishedAt,
    durationMs,
    firstByteMs,
    routeId: options.route.routeId,
    appScope: options.route.appScope,
    providerId: options.route.provider?.id || null,
    providerName: options.route.provider?.name || null,
    accountId: options.route.account?.id || null,
    accountHash: options.route.account?.accountHash || null,
    accountRouting: options.route.accountRouting || null,
    clientKeyHash: options.route.clientKeyHash || null,
    endpointProfileId: options.route.endpointProfile?.id || null,
    endpointProfileName: options.route.endpointProfile?.name || null,
    model: options.model,
    method: options.route.method,
    requestedPath: options.route.requestedPath,
    upstreamUrl: options.route.upstreamUrl,
    statusCode: options.statusCode,
    outcome: options.outcome,
    errorCode: options.errorCode || null,
    errorMessage: options.errorMessage || null,
    usage: options.usage ?? requestLogUsageFallbacks.get(options.route) ?? zeroRuntimeUsage(),
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

const GATEWAY_PROVIDER_ID = "tracevane-gateway";
const CODEX_GATEWAY_PROVIDER_ID = "tracevane_gateway";
const APP_CONNECTION_REDACTED_KEY = "<TRACEVANE_GATEWAY_KEY>";
const CODEX_APP_CONNECTION_START = "# >>> Tracevane Gateway app connection >>>";
const CODEX_APP_CONNECTION_END = "# <<< Tracevane Gateway app connection <<<";

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

function gatewayModelReference(model: string): string {
  return `${GATEWAY_PROVIDER_ID}/${model}`;
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

function removeTopLevelTomlKey(source: string, key: string): string {
  if (!source) return source;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = source.split(/\r?\n/);
  const firstTableIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  const topLevelEnd = firstTableIndex >= 0 ? firstTableIndex : lines.length;
  const nextLines = lines.filter((line, index) => {
    if (index >= topLevelEnd) return true;
    return !new RegExp(`^\\s*${escapedKey}\\s*=`).test(line || "");
  });
  return nextLines.join(newline).replace(new RegExp(`${newline}{3,}`, "g"), `${newline}${newline}`);
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
  modelCatalogPath?: string | null;
}): string {
  let next = stripCodexManagedBlock(source);
  next = upsertTopLevelTomlString(next, "model_provider", CODEX_GATEWAY_PROVIDER_ID);
  if (options.profile.model) next = upsertTopLevelTomlString(next, "model", options.profile.model);
  if (options.modelCatalogPath) next = upsertTopLevelTomlString(next, "model_catalog_json", options.modelCatalogPath);
  if (options.profile.reasoningEffort) {
    next = upsertTopLevelTomlString(next, "model_reasoning_effort", options.profile.reasoningEffort);
  } else {
    next = removeTopLevelTomlKey(next, "model_reasoning_effort");
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
    `[model_providers.${CODEX_GATEWAY_PROVIDER_ID}]`,
    "name = \"Tracevane Gateway\"",
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

type AppConnectionModelCatalogEntry = {
  contextWindow: number | null;
  maxOutputTokens: number | null;
  features: ModelGatewayModelFeatures;
};

function appConnectionModelCatalogIds(modelIds: string[], profile: ModelGatewayAppConnectionProfile): string[] {
  return Array.from(new Set([
    ...modelIds,
    ...(profile.model ? [profile.model] : []),
    ...Object.values(profile.appModels || {}).map((value) => normalizeString(value)).filter(Boolean),
  ]));
}

function appConnectionModelCatalogEntry(
  modelId: string,
  profile: ModelGatewayAppConnectionProfile,
  entries: Record<string, AppConnectionModelCatalogEntry> | undefined,
): AppConnectionModelCatalogEntry {
  return entries?.[modelId] || {
    contextWindow: positiveIntegerOrNull(profile.contextWindow),
    maxOutputTokens: positiveIntegerOrNull(profile.maxOutputTokens),
    features: {},
  };
}

function appConnectionInputModalities(features: ModelGatewayModelFeatures): string[] {
  return features.vision === true ? ["text", "image"] : ["text"];
}

function buildOpenCodeConfig(source: string | null, targetPath: string, options: {
  endpoint: string;
  key: string;
  profile: ModelGatewayAppConnectionProfile;
  modelIds: string[];
  modelCatalogEntries?: Record<string, AppConnectionModelCatalogEntry>;
}): { content: string; error: string | null } {
  const parsed = parseJsonObjectForConnection(targetPath, source);
  if (parsed.error) return { content: stringifyConnectionJson(parsed.value), error: parsed.error };
  const provider = isRecord(parsed.value.provider) ? parsed.value.provider : {};
  const modelCatalogIds = appConnectionModelCatalogIds(options.modelIds, options.profile);
  const models = Object.fromEntries(modelCatalogIds.map((id) => {
    const entry = appConnectionModelCatalogEntry(id, options.profile, options.modelCatalogEntries);
    return [id, {
      id,
      name: id,
      ...(entry.contextWindow ? { contextWindow: entry.contextWindow } : {}),
      ...(entry.maxOutputTokens ? { maxOutputTokens: entry.maxOutputTokens } : {}),
      limit: {
        ...(entry.contextWindow ? { context: entry.contextWindow } : {}),
        ...(entry.maxOutputTokens ? { output: entry.maxOutputTokens } : {}),
      },
      tool_call: entry.features.tools !== false,
      reasoning: entry.features.reasoning === true,
      temperature: true,
    }];
  }));
  const model = options.profile.model
    ? gatewayModelReference(options.profile.model)
    : null;
  return {
    error: null,
    content: stringifyConnectionJson({
      ...parsed.value,
      ...(model ? { model } : {}),
      provider: {
        ...provider,
        [GATEWAY_PROVIDER_ID]: {
          npm: "@ai-sdk/openai-compatible",
          name: "Tracevane Gateway",
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
  modelCatalogEntries?: Record<string, AppConnectionModelCatalogEntry>;
}): { content: string; error: string | null } {
  const parsed = parseJsonObjectForConnection(targetPath, source);
  if (parsed.error) return { content: stringifyConnectionJson(parsed.value), error: parsed.error };
  const modelsRoot = isRecord(parsed.value.models) ? parsed.value.models : {};
  const providers = isRecord(modelsRoot.providers) ? modelsRoot.providers : {};
  const modelCatalogIds = appConnectionModelCatalogIds(options.modelIds, options.profile);
  const modelItems = modelCatalogIds.map((id) => {
    const entry = appConnectionModelCatalogEntry(id, options.profile, options.modelCatalogEntries);
    return {
      id,
      name: id,
      input: appConnectionInputModalities(entry.features),
      reasoning: entry.features.reasoning === true,
      tools: entry.features.tools !== false,
      ...(entry.contextWindow ? { contextWindow: entry.contextWindow } : {}),
      ...(entry.maxOutputTokens ? { maxTokens: entry.maxOutputTokens } : {}),
    };
  });
  return {
    error: null,
    content: stringifyConnectionJson({
      ...parsed.value,
      models: {
        ...modelsRoot,
        mode: normalizeString(modelsRoot.mode, "merge"),
        providers: {
          ...providers,
          [GATEWAY_PROVIDER_ID]: {
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
  const defaultModel = isRecord(defaults.model) ? defaults.model : {};
  const primary = profile.model
    ? gatewayModelReference(profile.model)
    : null;
  return {
    ...agents,
    defaults: {
      ...defaults,
      model: {
        ...defaultModel,
        ...(primary ? { primary } : {}),
      },
      ...(profile.reasoningEffort ? { thinkingDefault: profile.reasoningEffort } : {}),
    },
  };
}

// Keep at most this many backups per appId; older ones are pruned after a new
// backup is written so the backups directory cannot grow without bound.
const APP_CONNECTION_BACKUP_RETENTION = 20;

// Reject source-edit payloads larger than this (1 MiB). App connection configs
// are small; anything larger is almost certainly a mistake or abuse.
const APP_CONNECTION_CONTENT_MAX_BYTES = 1024 * 1024;

function backupFileIfExists(sourcePath: string, backupsRoot: string, appId: ModelGatewayAppConnectionId): string | null {
  if (!fs.existsSync(sourcePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = path.extname(sourcePath) || ".bak";
  const backupDir = path.join(backupsRoot, "app-connections");
  fs.mkdirSync(backupDir, { recursive: true });
  // Resolve a unique filename. If two writes land within the same millisecond
  // the timestamp collides, so append a deterministic incrementing suffix
  // (`-2`, `-3`, ...) before the extension. The `${appId}-${stamp}` prefix and
  // `.bak` suffix are preserved so the timestamp parser / listing still work.
  let backupPath = path.join(backupDir, `${appId}-${stamp}${ext}.bak`);
  let counter = 2;
  while (fs.existsSync(backupPath)) {
    backupPath = path.join(backupDir, `${appId}-${stamp}-${counter}${ext}.bak`);
    counter += 1;
  }
  fs.copyFileSync(sourcePath, backupPath);
  try {
    fs.chmodSync(backupPath, 0o600);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
  pruneAppConnectionBackups(backupsRoot, appId);
  return backupPath;
}

// Parse the numeric collision suffix (the `-2`, `-3`, ... appended by
// `backupFileIfExists`) from a backup filename, or 0 if there is none. Used as
// a deterministic tiebreaker when sorting backups that share a timestamp.
function appConnectionBackupSuffix(fileName: string, appId: ModelGatewayAppConnectionId): number {
  const prefix = `${appId}-`;
  if (!fileName.startsWith(prefix)) return 0;
  const withoutBak = fileName.replace(/\.bak$/i, "");
  const stampPart = withoutBak.slice(prefix.length).replace(/\.[^.]*$/, "");
  const match = stampPart.match(/-(\d+)$/);
  if (!match) return 0;
  // The ISO stamp itself ends in `<ms>Z`, so a trailing group of pure digits is
  // only a collision suffix when preceded by `Z-` (e.g. ...789Z-2).
  if (!/Z-\d+$/.test(stampPart)) return 0;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : 0;
}

// Prune older backups for an appId, keeping at most
// APP_CONNECTION_BACKUP_RETENTION most-recent files. Resilient: any failure is
// swallowed so a prune problem can never fail an apply/rollback. Only deletes
// files matching the `${appId}-*.bak` pattern that live directly inside the
// backups directory; never touches unrelated files.
function pruneAppConnectionBackups(backupsRoot: string, appId: ModelGatewayAppConnectionId): void {
  try {
    const backupDir = path.join(backupsRoot, "app-connections");
    const resolvedDir = path.resolve(backupDir);
    if (!fs.existsSync(backupDir)) return;
    const prefix = `${appId}-`;
    const entries = fs.readdirSync(backupDir)
      .filter((fileName) => fileName === path.basename(fileName))
      .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith(".bak"))
      .map((fileName) => {
        const filePath = path.join(backupDir, fileName);
        // Defend against traversal/symlink games: the file must sit directly in
        // the backups dir and be a regular file.
        if (path.dirname(path.resolve(backupDir, fileName)) !== resolvedDir) return null;
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch {
          return null;
        }
        if (!stat.isFile()) return null;
        const stamp = parseAppConnectionBackupTimestamp(fileName, appId)
          ?? new Date(stat.mtimeMs).toISOString();
        return { fileName, filePath, stamp, suffix: appConnectionBackupSuffix(fileName, appId) };
      })
      .filter((item): item is { fileName: string; filePath: string; stamp: string; suffix: number } => item !== null);
    if (entries.length <= APP_CONNECTION_BACKUP_RETENTION) return;
    // Newest first: timestamp descending, suffix descending as tiebreaker.
    entries.sort((left, right) => {
      const byStamp = right.stamp.localeCompare(left.stamp);
      if (byStamp !== 0) return byStamp;
      return right.suffix - left.suffix;
    });
    for (const entry of entries.slice(APP_CONNECTION_BACKUP_RETENTION)) {
      try {
        fs.rmSync(entry.filePath, { force: true });
      } catch {
        // Best effort: keep pruning the rest even if one delete fails.
      }
    }
  } catch {
    // A prune failure must never fail the surrounding apply/rollback.
  }
}

function latestAppConnectionBackupPath(backupsRoot: string, appId: ModelGatewayAppConnectionId): string | null {
  const backupDir = path.join(backupsRoot, "app-connections");
  if (!fs.existsSync(backupDir)) return null;
  const prefix = `${appId}-`;
  const candidates = fs.readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith(".bak"))
    .map((fileName) => {
      const filePath = path.join(backupDir, fileName);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return null;
        const stamp = parseAppConnectionBackupTimestamp(fileName, appId)
          ?? new Date(stat.mtimeMs).toISOString();
        return { filePath, stamp, suffix: appConnectionBackupSuffix(fileName, appId) };
      } catch {
        return null;
      }
    })
    .filter((item): item is { filePath: string; stamp: string; suffix: number } => item !== null)
    // Newest first: timestamp descending, suffix descending as tiebreaker so a
    // same-millisecond collision still resolves to the most recently written.
    .sort((left, right) => {
      const byStamp = right.stamp.localeCompare(left.stamp);
      if (byStamp !== 0) return byStamp;
      return right.suffix - left.suffix;
    });
  return candidates[0]?.filePath || null;
}

function appConnectionBackupDir(backupsRoot: string): string {
  return path.join(backupsRoot, "app-connections");
}

function appConnectionBackupFormat(fileName: string): "json" | "toml" {
  // Backup filenames look like `${appId}-${stamp}${ext}.bak` where ext is the
  // original extension (e.g. `.toml`/`.json`). Strip the trailing `.bak`.
  const withoutBak = fileName.replace(/\.bak$/i, "");
  const ext = path.extname(withoutBak).toLowerCase();
  return ext === ".toml" ? "toml" : "json";
}

function parseAppConnectionBackupTimestamp(fileName: string, appId: ModelGatewayAppConnectionId): string | null {
  const prefix = `${appId}-`;
  if (!fileName.startsWith(prefix)) return null;
  const withoutBak = fileName.replace(/\.bak$/i, "");
  let stampPart = withoutBak.slice(prefix.length).replace(/\.[^.]*$/, "");
  // Strip a collision suffix (`-2`, `-3`, ...) appended when two backups share
  // a millisecond timestamp. Only treat a trailing digit group as a suffix when
  // it follows the `...<ms>Z` terminator so the ISO stamp itself is untouched.
  stampPart = stampPart.replace(/(Z)-\d+$/, "$1");
  // Stamp is an ISO string with `:` and `.` replaced by `-`.
  // e.g. 2026-06-22T12-34-56-789Z -> 2026-06-22T12:34:56.789Z
  const restored = stampPart.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/,
    "$1:$2:$3.$4",
  );
  const parsed = new Date(restored);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isValidAppConnectionBackupId(backupId: string, appId: ModelGatewayAppConnectionId): boolean {
  // Must be a bare filename matching the `${appId}-*.bak` pattern with no path
  // separators or traversal sequences.
  if (typeof backupId !== "string" || backupId.length === 0) return false;
  if (backupId !== path.basename(backupId)) return false;
  if (backupId.includes("/") || backupId.includes("\\") || backupId.includes("..")) return false;
  return backupId.startsWith(`${appId}-`) && backupId.endsWith(".bak");
}

function resolveAppConnectionBackupPath(
  backupsRoot: string,
  appId: ModelGatewayAppConnectionId,
  backupId: string,
): string | null {
  if (!isValidAppConnectionBackupId(backupId, appId)) return null;
  const backupDir = appConnectionBackupDir(backupsRoot);
  const resolvedDir = path.resolve(backupDir);
  const resolvedPath = path.resolve(backupDir, backupId);
  // Guard against any path traversal: the resolved path must live directly
  // inside the backups directory.
  if (path.dirname(resolvedPath) !== resolvedDir) return null;
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) return null;
  return resolvedPath;
}

function codexAppConnectionModelCatalogPath(targetPath: string): string {
  return path.join(path.dirname(targetPath), "tracevane-gateway-models.json");
}

function buildCodexAppConnectionModelCatalog(models: ModelGatewayModelListItem[]): string {
  return `${JSON.stringify({
    fetched_at: nowIso(),
    client_version: "tracevane-gateway",
    models: models.filter(modelGatewayModelSupportsAgentConnection),
  }, null, 2)}\n`;
}

function modelGatewayModelSupportsAgentConnection(model: Pick<ModelGatewayModelListItem, "supportedGatewayRoutes" | "routeSupport">): boolean {
  const supported = new Set([
    ...(model.supportedGatewayRoutes || []),
    ...(model.routeSupport?.supported || []),
  ]);
  return supported.has("openai_responses")
    || supported.has("openai_responses_compact")
    || supported.has("openai_chat_completions")
    || supported.has("anthropic_messages");
}

interface AnthropicModelInfo {
  id: string;
  type: "model";
  display_name: string;
  created_at: string;
}

interface AnthropicModelListResponse {
  data: AnthropicModelInfo[];
  first_id: string | null;
  has_more: boolean;
  last_id: string | null;
}

export interface ModelGatewayGenerateTextRequest {
  scope?: ModelGatewayAppScope;
  model?: string;
  system?: string;
  input: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ModelGatewayGenerateTextResponse {
  ok: boolean;
  checkedAt: string;
  text: string;
  model: string | null;
  providerId: string | null;
  statusCode: number | null;
  latencyMs: number;
  route: ModelGatewayRouteDecision | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface ModelGatewayUsageLedgerOptions {
  range?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
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
  listAppConnectionBackups(appId: ModelGatewayAppConnectionId): ModelGatewayAppConnectionBackupsResponse;
  readAppConnectionBackup(appId: ModelGatewayAppConnectionId, backupId: string): ModelGatewayAppConnectionBackupContentResponse;
  listGatewayModels(req?: http.IncomingMessage): ModelGatewayModelListResponse;
  getGatewayModel(req: http.IncomingMessage | undefined, modelId: string): ModelGatewayModelListItem;
  listGatewayAnthropicModels(req?: http.IncomingMessage): AnthropicModelListResponse;
  getGatewayAnthropicModel(req: http.IncomingMessage | undefined, modelId: string): AnthropicModelInfo;
  getRuntime(): ModelGatewayRuntimeResponse;
  getUsageLedger(options?: ModelGatewayUsageLedgerOptions): ModelGatewayUsageLedgerResponse;
  getDaemonService(): Promise<ModelGatewayDaemonServiceResponse>;
  manageDaemonService(req: http.IncomingMessage | undefined, payload?: ModelGatewayDaemonServiceRequest): Promise<ModelGatewayDaemonServiceResponse>;
  detectProvider(req: http.IncomingMessage | undefined, payload?: ModelGatewayProviderDetectRequest): Promise<ModelGatewayProviderDetectResponse>;
  startCodexAccountLogin(req: http.IncomingMessage | undefined, payload?: ModelGatewayCodexAccountLoginStartRequest): Promise<ModelGatewayCodexAccountLoginStartResponse>;
  pollCodexAccountLogin(req: http.IncomingMessage | undefined, payload?: ModelGatewayCodexAccountLoginPollRequest): Promise<ModelGatewayCodexAccountLoginPollResponse>;
  upsertProvider(req: http.IncomingMessage | undefined, payload: ModelGatewayUpsertProviderRequest): ModelGatewayProviderView;
  updateProviderAccount(req: http.IncomingMessage | undefined, providerId: string, accountId: string, payload?: ModelGatewayProviderAccountUpdateRequest): ModelGatewayProviderAccountUpdateResponse;
  refreshProviderAccount(req: http.IncomingMessage | undefined, providerId: string, accountId: string): Promise<ModelGatewayProviderAccountRefreshResponse>;
  deleteProvider(req: http.IncomingMessage | undefined, providerId: string): ModelGatewayProvidersResponse;
  setActiveProvider(req: http.IncomingMessage | undefined, payload: ModelGatewaySetActiveProviderRequest): ModelGatewayProvidersResponse;
  getProviderSecret(req: http.IncomingMessage | undefined, providerId: string): ModelGatewayProviderSecretResponse;
  setProviderSecret(req: http.IncomingMessage | undefined, providerId: string, payload: ModelGatewaySetProviderSecretRequest): ModelGatewayProviderView;
  resetProviderHealth(req: http.IncomingMessage | undefined, providerId: string, payload?: ModelGatewayProviderHealthResetRequest): ModelGatewayProviderHealthResetResponse;
  generateText(req: http.IncomingMessage | undefined, payload: ModelGatewayGenerateTextRequest): Promise<ModelGatewayGenerateTextResponse>;
  testActiveRoute(req: http.IncomingMessage | undefined, payload?: ModelGatewayActiveRouteSmokeRequest): Promise<ModelGatewayProviderTestResponse>;
  testProvider(req: http.IncomingMessage | undefined, providerId: string, payload?: ModelGatewayProviderTestRequest): Promise<ModelGatewayProviderTestResponse>;
  resolveRouteDecision(method: string, requestedPath: string, headers?: HeaderMap, requestedModel?: string | null): ModelGatewayRouteDecision;
  handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
}

export interface ModelGatewayServiceOptions {
  runtimeHost?: "tracevane-api" | "local-daemon";
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
  config: TracevaneServerConfig,
  options: ModelGatewayServiceOptions = {},
): ModelGatewayService {
  const paths = resolveModelGatewayPaths(config);
  const codexHistory = new CodexChatHistoryStore(paths.codexHistory);
  const runtimeHost = options.runtimeHost || "tracevane-api";
  const homeDir = options.homeDir || os.homedir();
  const listenerHost = options.listener?.host || MODEL_GATEWAY_DEFAULT_HOST;
  const listenerPort = options.listener?.port || MODEL_GATEWAY_DEFAULT_PORT;
  const codexDeviceLoginSessions = new Map<string, CodexDeviceLoginSession>();
  const codexDeviceLoginPolls = new Map<string, Promise<ModelGatewayCodexAccountLoginPollResponse>>();
  const codexAccountRefreshes = new Map<string, Promise<string>>();
  const codexAccountRoutingCursors = new Map<string, number>();
  const codexAccountAffinities = new Map<string, string>();
  const codexAccountInFlight = new Map<string, number>();
  let codexAccountRoutingLoaded = false;

  function normalizeCodexDeviceLoginSession(
    value: unknown,
    nowMs = Date.now(),
  ): CodexDeviceLoginSession | null {
    if (!isRecord(value)) return null;
    const loginId = normalizeString(value.loginId);
    const providerId = normalizeId(value.providerId, "codex-account");
    const providerName = normalizeString(value.providerName, "Codex Account");
    const deviceAuthId = normalizeString(value.deviceAuthId);
    const userCode = normalizeString(value.userCode);
    const expiresAtMs = typeof value.expiresAtMs === "number" && Number.isFinite(value.expiresAtMs)
      ? Math.floor(value.expiresAtMs)
      : parseIsoTimestampMs(normalizeString(value.expiresAt)) || 0;
    if (!loginId || !providerId || !deviceAuthId || !userCode || expiresAtMs <= nowMs) return null;
    const setActiveScopes = normalizeExplicitAppScopes(value.setActiveScopes);
    return {
      loginId,
      providerId,
      providerName,
      setActiveScopes: setActiveScopes.length ? setActiveScopes : [...MODEL_GATEWAY_APP_SCOPES],
      deviceAuthId,
      userCode,
      expiresAtMs,
      pollIntervalSeconds: firstPositiveInteger(value.pollIntervalSeconds) || CODEX_ACCOUNT_DEFAULT_POLL_INTERVAL_SECONDS,
      createdAt: normalizeString(value.createdAt, nowIso()),
    };
  }

  function writePersistedCodexLoginSessions(sessions: Iterable<CodexDeviceLoginSession>): void {
    const nowMs = Date.now();
    const normalized = Array.from(sessions)
      .map((session) => normalizeCodexDeviceLoginSession(session, nowMs))
      .filter((session): session is CodexDeviceLoginSession => Boolean(session));
    writeJsonSecureAtomic(paths.codexLoginSessions, {
      version: 1,
      updatedAt: nowIso(),
      sessions: normalized,
    } satisfies CodexDeviceLoginSessionStore);
  }

  function readPersistedCodexLoginSessions(nowMs = Date.now()): Map<string, CodexDeviceLoginSession> {
    const raw = readJsonFile<Partial<CodexDeviceLoginSessionStore>>(paths.codexLoginSessions, {
      version: 1,
      updatedAt: nowIso(),
      sessions: [],
    });
    const source = Array.isArray(raw.sessions) ? raw.sessions : [];
    const sessions = new Map<string, CodexDeviceLoginSession>();
    let changed = !Array.isArray(raw.sessions);
    for (const item of source) {
      const session = normalizeCodexDeviceLoginSession(item, nowMs);
      if (!session) {
        changed = true;
        continue;
      }
      sessions.set(session.loginId, session);
    }
    if (changed) writePersistedCodexLoginSessions(sessions.values());
    return sessions;
  }

  function rememberCodexDeviceLoginSession(session: CodexDeviceLoginSession): void {
    codexDeviceLoginSessions.set(session.loginId, session);
    const sessions = readPersistedCodexLoginSessions();
    sessions.set(session.loginId, session);
    writePersistedCodexLoginSessions(sessions.values());
  }

  function getCodexDeviceLoginSession(loginId: string): CodexDeviceLoginSession | null {
    const inMemory = codexDeviceLoginSessions.get(loginId);
    if (inMemory && inMemory.expiresAtMs > Date.now()) return inMemory;
    if (inMemory) codexDeviceLoginSessions.delete(loginId);
    const sessions = readPersistedCodexLoginSessions();
    const persisted = sessions.get(loginId) || null;
    if (persisted) codexDeviceLoginSessions.set(loginId, persisted);
    return persisted;
  }

  function forgetCodexDeviceLoginSession(loginId: string): void {
    codexDeviceLoginSessions.delete(loginId);
    const sessions = readPersistedCodexLoginSessions();
    if (sessions.delete(loginId)) writePersistedCodexLoginSessions(sessions.values());
  }

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
            const rawApiKeyRef = normalizeString(provider.apiKeyRef);
            const rawMetadata = isRecord(provider.metadata) ? provider.metadata : {};
            const codexAccountHint = rawApiKeyRef.includes(":codex-token")
              || normalizeString(rawMetadata.importedFrom) === "codex-device-login";
            if (!isCodexAccountBackedProvider(normalized) && codexAccountHint && rawApiKeyRef) {
              const bundle = normalizeCodexTokenBundle(readSecrets().secrets[rawApiKeyRef]?.value || "");
              const accountId = normalizeString(bundle?.tokens.account_id)
                || normalizeString(bundle?.email)
                || rawApiKeyRef;
              const accountHash = normalizeString(bundle?.account_hash) || sha256Short(accountId);
              const account = bundle
                ? codexAccountFromTokenBundle(
                  `codex-${accountHash}`,
                  rawApiKeyRef,
                  { ...bundle, account_hash: accountHash },
                  "codex-device-auth",
                  undefined,
                )
                : null;
              normalized.sourceType = "account-backed";
              normalized.authStrategy = "oauth_proxy";
              normalized.accountProvider = {
                kind: "codex",
                routing: {
                  strategy: "round-robin",
                  sessionAffinity: true,
                  maxConcurrentPerAccount: null,
                },
                accounts: account ? [account] : [],
              };
            }
            if (isCodexAccountBackedProvider(normalized)) {
              normalized.models = mergeManagedModelCatalogWithDefaults(normalized.models, codexAccountDefaultModels());
              normalized.endpoints = {
                ...normalized.endpoints,
                openai_responses: normalized.endpoints.openai_responses || "/responses",
                openai_responses_compact: normalized.endpoints.openai_responses_compact || "/compact",
              };
            }
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

  function repairManagedCodexAccountProviderCatalogs(): void {
    const raw = readJsonFile<Partial<ModelGatewayRegistryState>>(paths.registry, createEmptyRegistry());
    if (!Array.isArray(raw.providers)) return;
    const defaults = codexAccountDefaultModels();
    let changed = false;
    const providers = raw.providers.map((provider) => {
      if (!isRecord(provider)) return provider;
      const rawApiKeyRef = normalizeString(provider.apiKeyRef);
      const rawMetadata = isRecord(provider.metadata) ? provider.metadata : {};
      const rawAccountProvider: Record<string, unknown> = isRecord(provider.accountProvider) ? provider.accountProvider : {};
      const codexAccountHint = (
        normalizeString(provider.sourceType) === "account-backed"
        && normalizeString(rawAccountProvider["kind"]) === "codex"
      )
        || rawApiKeyRef.includes(":codex-token")
        || normalizeString(rawMetadata.importedFrom) === "codex-device-login";
      if (!codexAccountHint) return provider;

      const currentModels = normalizeModelCatalog(provider.models);
      const managedModels = mergeManagedModelCatalogWithDefaults(currentModels, defaults);
      const currentEndpoints = normalizeEndpointMap(provider.endpoints);
      const managedEndpoints = {
        ...currentEndpoints,
        openai_responses: currentEndpoints.openai_responses || "/responses",
        openai_responses_compact: currentEndpoints.openai_responses_compact || "/compact",
      };
      if (
        JSON.stringify(provider.models || null) === JSON.stringify(managedModels)
        && JSON.stringify(provider.endpoints || null) === JSON.stringify(managedEndpoints)
      ) {
        return provider;
      }
      changed = true;
      return {
        ...provider,
        models: managedModels,
        endpoints: managedEndpoints,
        failover: isRecord(provider.failover)
          ? provider.failover
          : { enabled: true, priority: 20, maxRetries: 1 },
        health: isRecord(provider.health)
          ? provider.health
          : { circuitState: "closed", lastSuccessAt: null, lastFailureAt: null, retryAfterUntil: null, lastLatencyMs: null, lastError: null, consecutiveFailures: 0 },
        updatedAt: nowIso(),
      };
    });
    if (!changed) return;
    writeJsonSecureAtomic(paths.registry, {
      ...raw,
      version: 1,
      providers,
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
      accountRouting: normalizeRuntimeAccountRouting(raw.accountRouting),
    };
  }

  function writeRuntime(runtime: ModelGatewayRuntimeState): void {
    writeJsonSecureAtomic(paths.runtime, {
      version: 1,
      updatedAt: nowIso(),
      requestLog: runtime.requestLog.slice(-MAX_RUNTIME_REQUEST_LOG_ENTRIES),
      accountRouting: normalizeRuntimeAccountRouting(runtime.accountRouting),
    });
  }

  function appendUsageLedgerEntry(entry: ModelGatewayRuntimeRequestLogEntry): void {
    const normalized = normalizeRuntimeLogEntry(entry);
    if (!normalized) return;
    fs.mkdirSync(path.dirname(paths.usageLedger), { recursive: true });
    fs.appendFileSync(paths.usageLedger, `${JSON.stringify(normalized)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "a",
    });
    try {
      fs.chmodSync(paths.usageLedger, 0o600);
    } catch {
      // Best effort for filesystems that do not support chmod.
    }
  }

  function readUsageLedgerEntries(limit = MAX_USAGE_LEDGER_READ_ENTRIES): {
    entries: ModelGatewayRuntimeRequestLogEntry[];
  } {
    if (!fs.existsSync(paths.usageLedger)) {
      return { entries: [] };
    }
    const stat = fs.statSync(paths.usageLedger);
    if (!stat.isFile() || stat.size <= 0) {
      return { entries: [] };
    }
    const bytesToRead = Math.min(stat.size, MAX_USAGE_LEDGER_READ_BYTES);
    const fd = fs.openSync(paths.usageLedger, "r");
    try {
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
      let text = buffer.toString("utf8");
      if (bytesToRead < stat.size) {
        const firstNewline = text.indexOf("\n");
        text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
      }
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const selectedLines = lines.slice(-Math.max(1, Math.floor(limit)));
      const entries = selectedLines.flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as unknown;
          const normalized = normalizeRuntimeLogEntry(parsed);
          return normalized ? [normalized] : [];
        } catch {
          return [];
        }
      });
      return { entries };
    } finally {
      fs.closeSync(fd);
    }
  }

  function normalizeUsageDateFilter(value: string | null | undefined): string | null {
    const raw = normalizeString(value || "");
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return localUsageDateKey(date);
  }

  function normalizeUsageRange(value: string | null | undefined): ModelGatewayUsageRange | null {
    if (value === "week" || value === "all" || value === "custom") return value;
    return null;
  }

  function localUsageDateKey(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function usageDefaultWeekDateFrom(now = new Date()): string {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return localUsageDateKey(start);
  }

  function resolveUsageDateQuery(options: ModelGatewayUsageLedgerOptions): ModelGatewayUsageLedgerResponse["query"] {
    const hasCustomDates = Boolean(normalizeString(options.dateFrom || "") || normalizeString(options.dateTo || ""));
    const range = normalizeUsageRange(options.range) || (hasCustomDates ? "custom" : "week");
    if (range === "all") {
      return { range, dateFrom: null, dateTo: null };
    }
    if (range === "custom") {
      return {
        range,
        dateFrom: normalizeUsageDateFilter(options.dateFrom),
        dateTo: normalizeUsageDateFilter(options.dateTo),
      };
    }
    return {
      range,
      dateFrom: usageDefaultWeekDateFrom(),
      dateTo: localUsageDateKey(new Date()),
    };
  }

  function usageEntryDateKey(entry: ModelGatewayRuntimeRequestLogEntry): string | null {
    const timestamp = Date.parse(entry.finishedAt || entry.startedAt || "");
    if (!Number.isFinite(timestamp)) return null;
    return localUsageDateKey(new Date(timestamp));
  }

  function usageEntryWithinDateRange(
    entry: ModelGatewayRuntimeRequestLogEntry,
    dateFrom: string | null,
    dateTo: string | null,
  ): boolean {
    const dateKey = usageEntryDateKey(entry);
    if (!dateKey) return false;
    if (dateFrom && dateKey < dateFrom) return false;
    if (dateTo && dateKey > dateTo) return false;
    return true;
  }

  function summarizeUsageLedgerModels(
    entries: ModelGatewayRuntimeRequestLogEntry[],
    modelBucketForEntry: RuntimeUsageModelResolver,
  ): Pick<ModelGatewayUsageLedgerResponse, "totals" | "models" | "daily"> {
    const totals: ModelGatewayUsageLedgerResponse["totals"] = {
      requestCount: entries.length,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const models = new Map<string, ModelGatewayModelUsageRow>();
    const daily = new Map<string, ModelGatewayUsageDateBucket>();
    for (const entry of entries) {
      const bucket = modelBucketForEntry(entry);
      let row = models.get(bucket.key);
      if (!row) {
        row = {
          model: bucket.label || bucket.key || "unknown model",
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
        models.set(bucket.key, row);
      }
      row.requestCount += 1;

      const dateKey = usageEntryDateKey(entry);
      let dateBucket: ModelGatewayUsageDateBucket | null = null;
      if (dateKey) {
        dateBucket = daily.get(dateKey) || null;
        if (!dateBucket) {
          dateBucket = {
            date: dateKey,
            requestCount: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          };
          daily.set(dateKey, dateBucket);
        }
        dateBucket.requestCount += 1;
      }

      if (entry.usage) {
        row.inputTokens += entry.usage.inputTokens || 0;
        row.outputTokens += entry.usage.outputTokens || 0;
        row.totalTokens += entry.usage.totalTokens || ((entry.usage.inputTokens || 0) + (entry.usage.outputTokens || 0));
        totals.inputTokens += entry.usage.inputTokens || 0;
        totals.outputTokens += entry.usage.outputTokens || 0;
        totals.totalTokens += entry.usage.totalTokens || ((entry.usage.inputTokens || 0) + (entry.usage.outputTokens || 0));
        if (dateBucket) {
          dateBucket.inputTokens += entry.usage.inputTokens || 0;
          dateBucket.outputTokens += entry.usage.outputTokens || 0;
          dateBucket.totalTokens += entry.usage.totalTokens || ((entry.usage.inputTokens || 0) + (entry.usage.outputTokens || 0));
        }
      }
    }
    return {
      totals,
      models: [...models.values()].sort((left, right) => (
        right.totalTokens - left.totalTokens
        || right.requestCount - left.requestCount
        || left.model.localeCompare(right.model)
      )),
      daily: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)),
    };
  }

  function appendRequestLog(entry: ModelGatewayRuntimeRequestLogEntry): void {
    const runtime = readRuntime();
    runtime.requestLog.push(entry);
    writeRuntime(runtime);
    appendUsageLedgerEntry(entry);
  }

  function patchRawProvider(
    providerId: string,
    patch: (provider: Record<string, unknown>, stamp: string) => boolean,
  ): boolean {
    const raw = readJsonFile<Record<string, unknown>>(paths.registry, createEmptyRegistry() as unknown as Record<string, unknown>);
    const providers = Array.isArray(raw.providers) ? raw.providers : [];
    const provider = providers.find((item): item is Record<string, unknown> => (
      isRecord(item) && normalizeString(item.id) === providerId
    ));
    if (!provider) return false;
    const stamp = nowIso();
    if (!patch(provider, stamp)) return false;
    provider.updatedAt = stamp;
    raw.providers = providers;
    raw.updatedAt = stamp;
    writeJsonSecureAtomic(paths.registry, raw);
    return true;
  }

  function updateProviderHealth(
    providerId: string,
    success: boolean,
    latencyMs: number | null,
    errorMessage: string | null,
    endpointProfileId: string | null = null,
    retryAfterUntil: string | null = null,
  ): void {
    patchRawProvider(providerId, (provider, stamp) => {
      let target: Record<string, unknown> | null = provider;
      if (endpointProfileId) {
        const endpointProfiles = Array.isArray(provider.endpointProfiles) ? provider.endpointProfiles : [];
        target = endpointProfiles.find((profile): profile is Record<string, unknown> => (
          isRecord(profile) && normalizeString(profile.id) === endpointProfileId
        )) || null;
      }
      if (!target) return false;
      const targetHealth = normalizeHealth(target.health);
      const nextConsecutiveFailures = success ? 0 : targetHealth.consecutiveFailures + 1;
      target.health = {
        ...targetHealth,
        lastLatencyMs: latencyMs,
        lastSuccessAt: success ? stamp : targetHealth.lastSuccessAt,
        lastFailureAt: success ? targetHealth.lastFailureAt : stamp,
        retryAfterUntil: success ? null : retryAfterUntil,
        lastError: success ? null : errorMessage,
        consecutiveFailures: nextConsecutiveFailures,
        circuitState: success
          ? "closed"
          : retryAfterUntil || nextConsecutiveFailures >= 3
            ? "open"
            : targetHealth.circuitState,
      };
      if (endpointProfileId) target.updatedAt = stamp;
      return true;
    });
  }

  function resetHealthState(value: unknown): ModelGatewayProviderHealth {
    const current = normalizeHealth(value);
    return {
      ...current,
      circuitState: "closed",
      lastFailureAt: null,
      retryAfterUntil: null,
      lastLatencyMs: null,
      lastError: null,
      consecutiveFailures: 0,
    };
  }

  function resetProviderHealth(
    req: http.IncomingMessage | undefined,
    providerId: string,
    payload: ModelGatewayProviderHealthResetRequest = {},
  ): ModelGatewayProviderHealthResetResponse {
    requireManagement(req);
    const registry = readRegistry();
    const provider = findProvider(registry, providerId);
    if (!provider) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }
    const endpointProfileId = normalizeString(payload.endpointProfileId || "");
    if (endpointProfileId && !provider.endpointProfiles.some((profile) => profile.id === endpointProfileId)) {
      throw new ModelGatewayServiceError(
        "model_gateway_endpoint_profile_not_found",
        `Model Gateway endpoint profile '${endpointProfileId}' was not found on provider '${providerId}'.`,
        404,
      );
    }

    let providerReset = false;
    const endpointProfilesReset: string[] = [];
    const includeEndpointProfiles = payload.includeEndpointProfiles !== false;
    patchRawProvider(providerId, (rawProvider, stamp) => {
      if (endpointProfileId) {
        const endpointProfiles = Array.isArray(rawProvider.endpointProfiles) ? rawProvider.endpointProfiles : [];
        const target = endpointProfiles.find((profile): profile is Record<string, unknown> => (
          isRecord(profile) && normalizeString(profile.id) === endpointProfileId
        )) || null;
        if (!target) return false;
        target.health = resetHealthState(target.health);
        target.updatedAt = stamp;
        endpointProfilesReset.push(endpointProfileId);
        return true;
      }
      rawProvider.health = resetHealthState(rawProvider.health);
      providerReset = true;
      if (includeEndpointProfiles) {
        const endpointProfiles = Array.isArray(rawProvider.endpointProfiles) ? rawProvider.endpointProfiles : [];
        for (const profile of endpointProfiles) {
          if (!isRecord(profile)) continue;
          profile.health = resetHealthState(profile.health);
          profile.updatedAt = stamp;
          const id = normalizeString(profile.id);
          if (id) endpointProfilesReset.push(id);
        }
      }
      return true;
    });
    const updatedProvider = findProvider(readRegistry(), providerId);
    if (!updatedProvider) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }
    return {
      ok: true,
      providerId,
      checkedAt: nowIso(),
      reset: {
        provider: providerReset,
        endpointProfiles: endpointProfilesReset,
      },
      provider: toProviderView(updatedProvider),
    };
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
        ...Object.values(ROUTES).flatMap((route) => route.paths),
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
      "Tracevane Gateway client requests require the configured local Gateway key.",
      401,
    );
  }

  function requireManagement(req?: http.IncomingMessage): void {
    if (!req) return;
    if (isLoopbackRequest(req)) return;
    if (hasConfiguredGatewayAuth(config) && isTracevaneGatewayHttpAuthorized(config, req)) return;
    throw new ModelGatewayServiceError(
      "model_gateway_management_locked",
      "Model Gateway provider and secret changes require a trusted local request or configured Gateway authentication.",
      403,
    );
  }

  function findProvider(registry: ModelGatewayRegistryState, providerId: string): ModelGatewayProvider | null {
    return registry.providers.find((provider) => provider.id === providerId) || null;
  }

  function getProviderAccountForManagement(
    registry: ModelGatewayRegistryState,
    providerId: string,
    accountId: string,
  ): { provider: ModelGatewayProvider; account: ModelGatewayAccountEntry } {
    const provider = findProvider(registry, providerId);
    if (!provider) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_not_found",
        `Model Gateway provider '${providerId}' was not found.`,
        404,
      );
    }
    if (provider.sourceType !== "account-backed" || !provider.accountProvider) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_account_unsupported",
        `Provider '${providerId}' is not an account-backed provider.`,
        400,
      );
    }
    const account = provider.accountProvider.accounts.find((item) => item.id === accountId);
    if (!account) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_account_not_found",
        `Provider '${providerId}' account '${accountId}' was not found.`,
        404,
      );
    }
    return { provider, account };
  }

  function providerAccountResponse(
    providerId: string,
    accountId: string,
  ): ModelGatewayProviderAccountUpdateResponse {
    const registry = readRegistry();
    const { provider, account } = getProviderAccountForManagement(registry, providerId, accountId);
    return {
      ok: true,
      provider: toProviderView(provider),
      account,
    };
  }

  function candidateProviders(registry: ModelGatewayRegistryState, appScope: ModelGatewayAppScope): ModelGatewayProvider[] {
    return registry.providers
      .filter((provider) => provider.enabled)
      .filter((provider) => provider.appScopes.includes(appScope))
      .filter((provider) => providerHasUsableAccounts(provider))
      .sort((left, right) => left.failover.priority - right.failover.priority || left.name.localeCompare(right.name));
  }

  function providerHasUsableAccounts(provider: ModelGatewayProvider): boolean {
    if (provider.sourceType !== "account-backed") return true;
    if (provider.accountProvider?.kind !== "codex") return true;
    return provider.accountProvider.accounts.some((account) => accountAvailableForRouting(account));
  }

  function accountAvailableForRouting(account: ModelGatewayAccountEntry, nowMs = Date.now()): boolean {
    if (!account.enabled || account.state === "disabled" || account.state === "needs-login" || account.state === "error") {
      return false;
    }
    const cooldownUntilMs = parseIsoTimestampMs(account.cooldownUntil);
    return !cooldownUntilMs || cooldownUntilMs <= nowMs;
  }

  type RouteProviderCandidate = {
    provider: ModelGatewayProvider;
    endpointProfile: ModelGatewayProviderEndpointProfile | null;
    effectiveProvider: ModelGatewayProvider;
    resolvedModel: string | null;
    protocolPenalty: number;
  };

  function routeProviderCandidates(
    registry: ModelGatewayRegistryState,
    appScope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    requestedModel: string | null,
    explicitProviderId: string | null,
  ): RouteProviderCandidate[] {
    return candidateProviders(registry, appScope)
      .filter((provider) => !explicitProviderId || provider.id === explicitProviderId)
      .flatMap((provider) => providerEndpointProfilesForRouting(provider)
        .filter((endpointProfile) => !endpointProfile || endpointProfile.enabled)
        .map((endpointProfile) => {
          const effectiveProvider = effectiveProviderForEndpointProfile(provider, endpointProfile);
          return {
            provider,
            endpointProfile,
            effectiveProvider,
            resolvedModel: resolveProviderModel(effectiveProvider, requestedModel),
            protocolPenalty: routeProtocolPenalty(effectiveProvider, routeId),
          };
        }))
      .filter((item) => item.effectiveProvider.appScopes.includes(appScope))
      .filter((item) => requestedModel ? item.resolvedModel : true)
      .sort((left, right) => (
        left.protocolPenalty - right.protocolPenalty
        || left.provider.failover.priority - right.provider.failover.priority
        || left.effectiveProvider.failover.priority - right.effectiveProvider.failover.priority
        || left.provider.name.localeCompare(right.provider.name)
        || (left.endpointProfile?.name || "").localeCompare(right.endpointProfile?.name || "")
      ));
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
    routeId: ModelGatewayRouteId,
    requestedModel: string | null = null,
  ): {
    provider: ModelGatewayProvider | null;
    endpointProfile: ModelGatewayProviderEndpointProfile | null;
    effectiveProvider: ModelGatewayProvider | null;
    failoverReason: string | null;
    resolvedModel: string | null;
  } {
    const activeId = registry.activeProviders[appScope];
    const explicitModel = parseExplicitProviderModel(requestedModel);
    const effectiveRequestedModel = explicitModel?.modelId || normalizeString(requestedModel || "") || null;
    const candidates = routeProviderCandidates(
      registry,
      appScope,
      routeId,
      effectiveRequestedModel,
      explicitModel?.providerId || null,
    );

    if (activeId && !candidates.length) {
      const activeProvider = findProvider(registry, activeId);
      const activeProviderModel = activeProvider && effectiveRequestedModel
        ? resolveProviderModel(activeProvider, effectiveRequestedModel)
        : null;
      if (
        activeProvider
        && activeProvider.enabled
        && activeProvider.appScopes.includes(appScope)
        && isCodexAccountBackedProvider(activeProvider)
        && !providerHasUsableAccounts(activeProvider)
        && (!effectiveRequestedModel || activeProviderModel)
      ) {
        return {
          provider: null,
          endpointProfile: null,
          effectiveProvider: null,
          failoverReason: `Active provider '${activeProvider.id}' has no ready Codex account for ${appScope}; open its account pool and sign in again or re-enable an account.`,
          resolvedModel: activeProviderModel || effectiveRequestedModel,
        };
      }
    }

    if (effectiveRequestedModel && !candidates.length) {
      return {
        provider: null,
        endpointProfile: null,
        effectiveProvider: null,
        failoverReason: explicitModel
          ? `No enabled provider '${explicitModel.providerId}' offers model '${explicitModel.modelId}' for ${appScope}.`
          : `No enabled Model Gateway provider offers model '${effectiveRequestedModel}' for ${appScope}.`,
        resolvedModel: null,
      };
    }

    const providerCircuitBlocks = (item: RouteProviderCandidate) => (
      !item.endpointProfile && item.provider.health.circuitState === "open"
    );
    const healthyCandidate = (item: RouteProviderCandidate) => !providerCircuitBlocks(item) && item.effectiveProvider.health.circuitState !== "open";
    const retryCandidate = (item: RouteProviderCandidate) => providerCircuitBlocks(item)
      ? providerCircuitRetryReady(item.provider)
      : healthCircuitRetryReady(item.effectiveProvider.health);
    const retryReason = (item: RouteProviderCandidate) => {
      const modelHint = effectiveRequestedModel ? ` for model '${effectiveRequestedModel}'` : "";
      const endpointHint = item.endpointProfile ? ` endpoint '${item.endpointProfile.id}'` : "";
      return `Provider '${item.provider.id}'${endpointHint} circuit is open but the retry window elapsed; probing it${modelHint}.`;
    };
    const selected = (item: RouteProviderCandidate, reason: string | null) => ({
      provider: item.provider,
      endpointProfile: item.endpointProfile,
      effectiveProvider: item.effectiveProvider,
      failoverReason: reason,
      resolvedModel: item.resolvedModel || effectiveRequestedModel,
    });

    if (!candidates.length) {
      return {
        provider: null,
        endpointProfile: null,
        effectiveProvider: null,
        failoverReason: `No enabled Model Gateway provider is available for ${appScope}.`,
        resolvedModel: effectiveRequestedModel,
      };
    };

    if (activeId) {
      const activeCandidates = candidates.filter((item) => item.provider.id === activeId);
      const activeCandidate = activeCandidates.find((item) => item.protocolPenalty === 0)
        || activeCandidates[0]
        || null;
      if (activeCandidate && healthyCandidate(activeCandidate)) {
        const preferredProtocolCandidate = candidates.find((item) => (
          item.protocolPenalty === 0
          && healthyCandidate(item)
        ));
        if (
          preferredProtocolCandidate
          && activeCandidate.provider.appScopes.length > 1
          && activeCandidate.protocolPenalty > preferredProtocolCandidate.protocolPenalty
        ) {
          const activeEndpoint = activeCandidate.endpointProfile ? `/${activeCandidate.endpointProfile.id}` : "";
          const preferredEndpoint = preferredProtocolCandidate.endpointProfile ? `/${preferredProtocolCandidate.endpointProfile.id}` : "";
          const modelHint = effectiveRequestedModel ? ` for model '${effectiveRequestedModel}'` : "";
          return selected(
            preferredProtocolCandidate,
            `Active provider '${activeCandidate.provider.id}${activeEndpoint}' requires protocol adaptation; selected preferred native protocol '${preferredProtocolCandidate.provider.id}${preferredEndpoint}'${modelHint}.`,
          );
        }
        return selected(activeCandidate, null);
      }
      if (activeCandidate) {
        const fallbackCandidates = candidates
          .filter((item) => (
            (item.provider.id !== activeCandidate.provider.id || item.endpointProfile?.id !== activeCandidate.endpointProfile?.id)
            && healthyCandidate(item)
          ));
        const fallback = fallbackCandidates.find((item) => item.provider.id === activeCandidate.provider.id)
          || fallbackCandidates[0]
          || null;
        if (retryCandidate(activeCandidate) && (!fallback || activeCandidate.protocolPenalty < fallback.protocolPenalty)) {
          return selected(activeCandidate, retryReason(activeCandidate));
        }
        if (fallback) {
          const activeEndpoint = activeCandidate.endpointProfile ? `/${activeCandidate.endpointProfile.id}` : "";
          const fallbackEndpoint = fallback.endpointProfile ? `/${fallback.endpointProfile.id}` : "";
          return selected(
            fallback,
            `Active provider '${activeCandidate.provider.id}${activeEndpoint}' circuit is open; selected fallback '${fallback.provider.id}${fallbackEndpoint}'.`,
          );
        }
        const retryFallbackCandidates = candidates
          .filter((item) => (
            (item.provider.id !== activeCandidate.provider.id || item.endpointProfile?.id !== activeCandidate.endpointProfile?.id)
            && retryCandidate(item)
          ));
        const retryFallback = retryFallbackCandidates.find((item) => item.provider.id === activeCandidate.provider.id)
          || retryFallbackCandidates[0]
          || null;
        return retryFallback
          ? selected(retryFallback, retryReason(retryFallback))
          : {
            provider: null,
            endpointProfile: null,
            effectiveProvider: null,
            failoverReason: `Active provider '${activeCandidate.provider.id}' circuit is open and no fallback provider is available yet.`,
            resolvedModel: effectiveRequestedModel,
          };
      }
    }

    const fallback = candidates.find(healthyCandidate) || null;
    if (fallback) {
      return selected(fallback, null);
    }
    const retryFallback = candidates.find(retryCandidate) || null;
    return retryFallback
      ? selected(retryFallback, retryReason(retryFallback))
      : {
        provider: null,
        endpointProfile: null,
        effectiveProvider: null,
        failoverReason: `All enabled Model Gateway providers${effectiveRequestedModel ? ` for model '${effectiveRequestedModel}'` : ""} have open circuits; wait for the retry window or run a provider smoke test.`,
        resolvedModel: candidates[0]?.resolvedModel || effectiveRequestedModel,
      };
  }

  type ProviderSecretResolution = {
    secret: string | null;
    account: ModelGatewayAccountEntry | null;
    accountRouting: ModelGatewayAccountRoutingDiagnostics | null;
    releaseAccount: (() => void) | null;
  };

  type CodexAccountSelectionContext = {
    headers?: HeaderMap;
    bodyText?: string;
    routeId?: ModelGatewayRouteId | null;
    requestedPath?: string | null;
    requestedModel?: string | null;
  };

  type CodexAccountSelection = {
    account: ModelGatewayAccountEntry | null;
    reason: "none-ready" | "busy" | null;
    affinityKey: string | null;
    diagnostics: ModelGatewayAccountRoutingDiagnostics | null;
  };

  function readProviderSecret(provider: ModelGatewayProvider): string | null {
    if (provider.authStrategy === "none") return null;
    const ref = provider.apiKeyRef;
    if (!ref) return null;
    return readSecrets().secrets[ref]?.value || null;
  }

  function codexAccountInFlightKey(providerId: string, accountId: string): string {
    return `${providerId}:${accountId}`;
  }

  function accountCapacityLimit(provider: ModelGatewayProvider): number | null {
    const value = provider.accountProvider?.routing.maxConcurrentPerAccount;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }

  function accountHasCapacity(provider: ModelGatewayProvider, account: ModelGatewayAccountEntry): boolean {
    const limit = accountCapacityLimit(provider);
    if (!limit) return true;
    const key = codexAccountInFlightKey(provider.id, account.id);
    return (codexAccountInFlight.get(key) || 0) < limit;
  }

  function accountInFlight(provider: ModelGatewayProvider, account: ModelGatewayAccountEntry): number {
    return codexAccountInFlight.get(codexAccountInFlightKey(provider.id, account.id)) || 0;
  }

  function accountRoutingSkipReason(
    provider: ModelGatewayProvider,
    account: ModelGatewayAccountEntry,
    selectedAccountId: string | null,
    nowMs = Date.now(),
  ): string | null {
    if (selectedAccountId && account.id === selectedAccountId) return null;
    if (!account.enabled || account.state === "disabled") return "disabled";
    if (account.state === "needs-login") return "needs-login";
    if (account.state === "error") return "error";
    const cooldownUntilMs = parseIsoTimestampMs(account.cooldownUntil);
    if (cooldownUntilMs && cooldownUntilMs > nowMs) return "cooldown";
    if (!accountHasCapacity(provider, account)) return "busy";
    return selectedAccountId ? "not-selected" : "ready";
  }

  function accountRoutingDiagnostics(
    provider: ModelGatewayProvider,
    details: {
      affinityKey: string | null;
      affinityHit: boolean;
      selectedAccount: ModelGatewayAccountEntry | null;
      selectedReason: string | null;
      failureReason: string | null;
      cursorBefore: number | null;
      cursorAfter: number | null;
    },
  ): ModelGatewayAccountRoutingDiagnostics | null {
    if (provider.sourceType !== "account-backed" || !provider.accountProvider) return null;
    const selectedAccountId = details.selectedAccount?.id || null;
    const nowMs = Date.now();
    const selectedCooldownUntilMs = parseIsoTimestampMs(details.selectedAccount?.cooldownUntil);
    const selectedWasCooldownRetry = Boolean(
      details.selectedAccount
      && details.selectedAccount.state === "cooldown"
      && selectedCooldownUntilMs
      && selectedCooldownUntilMs <= nowMs,
    );
    const accountCount = provider.accountProvider.accounts.length;
    const readyAccounts = provider.accountProvider.accounts.filter((account) => accountAvailableForRouting(account));
    const capacityAvailableCount = readyAccounts.filter((account) => accountHasCapacity(provider, account)).length;
    const busyCount = readyAccounts.filter((account) => !accountHasCapacity(provider, account)).length;
    const cooldownCount = provider.accountProvider.accounts.filter((account) => {
      const cooldownUntilMs = parseIsoTimestampMs(account.cooldownUntil);
      return Boolean(cooldownUntilMs && cooldownUntilMs > nowMs);
    }).length;
    const needsLoginCount = provider.accountProvider.accounts.filter((account) => account.state === "needs-login").length;
    return {
      providerId: provider.id,
      kind: provider.accountProvider.kind,
      strategy: provider.accountProvider.routing.strategy,
      sessionAffinity: provider.accountProvider.routing.sessionAffinity,
      affinityKeyHash: details.affinityKey ? sha256Short(details.affinityKey) : null,
      affinityHit: details.affinityHit,
      selectedAccountId,
      selectedReason: details.selectedReason,
      selectedWasCooldownRetry,
      selectedCooldownUntil: selectedWasCooldownRetry
        ? details.selectedAccount?.cooldownUntil || null
        : null,
      failureReason: details.failureReason,
      accountCount,
      readyCount: readyAccounts.length,
      capacityAvailableCount,
      busyCount,
      cooldownCount,
      needsLoginCount,
      cursorBefore: details.cursorBefore,
      cursorAfter: details.cursorAfter,
      skipped: provider.accountProvider.accounts.flatMap((account) => {
        const reason = accountRoutingSkipReason(provider, account, selectedAccountId, nowMs);
        if (!reason) return [];
        return [{
          accountId: account.id,
          accountHash: account.accountHash,
          state: account.state,
          reason,
          cooldownUntil: account.cooldownUntil,
          inFlight: accountInFlight(provider, account),
          capacityLimit: accountCapacityLimit(provider),
        }];
      }),
    };
  }

  function hydrateCodexAccountRoutingFromRuntime(): void {
    if (codexAccountRoutingLoaded) return;
    codexAccountRoutingLoaded = true;
    const routing = readRuntime().accountRouting;
    codexAccountRoutingCursors.clear();
    codexAccountAffinities.clear();
    for (const [key, value] of Object.entries(routing.codexCursors)) {
      codexAccountRoutingCursors.set(key, value);
    }
    for (const [key, value] of Object.entries(routing.codexAffinities)) {
      codexAccountAffinities.set(key, value);
    }
  }

  function persistCodexAccountRoutingToRuntime(): void {
    const runtime = readRuntime();
    runtime.accountRouting = {
      codexCursors: Object.fromEntries(codexAccountRoutingCursors.entries()),
      codexAffinities: Object.fromEntries(codexAccountAffinities.entries()),
    };
    writeRuntime(runtime);
  }

  function reserveProviderAccount(provider: ModelGatewayProvider, account: ModelGatewayAccountEntry): () => void {
    const key = codexAccountInFlightKey(provider.id, account.id);
    codexAccountInFlight.set(key, (codexAccountInFlight.get(key) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (codexAccountInFlight.get(key) || 0) - 1;
      if (next > 0) codexAccountInFlight.set(key, next);
      else codexAccountInFlight.delete(key);
    };
  }

  function bindReleaseToResponse(res: http.ServerResponse, release: (() => void) | null): void {
    if (!release) return;
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      release();
    };
    res.once("finish", done);
    res.once("close", done);
  }

  function stickyValueFromBodyText(bodyText: string | undefined): string {
    const body = parseJsonObjectOrNull(bodyText || "");
    if (!body) return "";
    const metadata = isRecord(body.metadata) ? body.metadata : {};
    return normalizeString(metadata.user_id)
      || normalizeString(metadata.session_id)
      || normalizeString(metadata.conversation_id)
      || normalizeString(metadata.thread_id)
      || normalizeString(body.conversation_id)
      || normalizeString(body.session_id)
      || normalizeString(body.previous_response_id)
      || normalizeString(body.user);
  }

  function codexAccountAffinityKey(
    provider: ModelGatewayProvider,
    context?: CodexAccountSelectionContext,
  ): string | null {
    if (provider.accountProvider?.routing.sessionAffinity === false) return null;
    const headerValue = normalizeString(readHeader(context?.headers, "x-tracevane-session-id"))
      || normalizeString(readHeader(context?.headers, "x-session-id"))
      || normalizeString(readHeader(context?.headers, "session_id"))
      || normalizeString(readHeader(context?.headers, "x-client-request-id"))
      || normalizeString(readHeader(context?.headers, "x-claude-code-session-id"))
      || normalizeString(readHeader(context?.headers, "x-codex-session-id"))
      || normalizeString(readHeader(context?.headers, "x-conversation-id"))
      || normalizeString(readHeader(context?.headers, "conversation_id"));
    const bodyValue = stickyValueFromBodyText(context?.bodyText);
    const value = headerValue || bodyValue;
    return value ? `${provider.id}:codex:${sha256Short(value)}` : null;
  }

  function selectProviderAccount(
    provider: ModelGatewayProvider,
    context?: CodexAccountSelectionContext,
  ): CodexAccountSelection {
    if (provider.sourceType !== "account-backed" || provider.accountProvider?.kind !== "codex") {
      return { account: null, reason: null, affinityKey: null, diagnostics: null };
    }
    hydrateCodexAccountRoutingFromRuntime();
    const diagnostics = (details: Parameters<typeof accountRoutingDiagnostics>[1]) => accountRoutingDiagnostics(provider, details);
    const accounts = provider.accountProvider.accounts.filter((account) => accountAvailableForRouting(account));
    const affinityKey = codexAccountAffinityKey(provider, context);
    if (!accounts.length) {
      return {
        account: null,
        reason: "none-ready",
        affinityKey,
        diagnostics: diagnostics({
          affinityKey,
          affinityHit: false,
          selectedAccount: null,
          selectedReason: null,
          failureReason: "none-ready",
          cursorBefore: null,
          cursorAfter: null,
        }),
      };
    }
    const explicit = provider.apiKeyRef
      ? accounts.find((account) => account.authRef === provider.apiKeyRef)
      : null;
    if (explicit) {
      return accountHasCapacity(provider, explicit)
        ? {
          account: explicit,
          reason: null,
          affinityKey,
          diagnostics: diagnostics({
            affinityKey,
            affinityHit: false,
            selectedAccount: explicit,
            selectedReason: "explicit-active-account",
            failureReason: null,
            cursorBefore: null,
            cursorAfter: null,
          }),
        }
        : {
          account: null,
          reason: "busy",
          affinityKey,
          diagnostics: diagnostics({
            affinityKey,
            affinityHit: false,
            selectedAccount: null,
            selectedReason: null,
            failureReason: "busy",
            cursorBefore: null,
            cursorAfter: null,
          }),
        };
    }
    const accountsWithCapacity = accounts.filter((account) => accountHasCapacity(provider, account));
    if (!accountsWithCapacity.length) {
      return {
        account: null,
        reason: "busy",
        affinityKey,
        diagnostics: diagnostics({
          affinityKey,
          affinityHit: false,
          selectedAccount: null,
          selectedReason: null,
          failureReason: "busy",
          cursorBefore: null,
          cursorAfter: null,
        }),
      };
    }
    if (affinityKey) {
      const stickyAccountId = codexAccountAffinities.get(affinityKey);
      const stickyAccount = stickyAccountId
        ? accountsWithCapacity.find((account) => account.id === stickyAccountId) || null
        : null;
      if (stickyAccount) {
        return {
          account: stickyAccount,
          reason: null,
          affinityKey,
          diagnostics: diagnostics({
            affinityKey,
            affinityHit: true,
            selectedAccount: stickyAccount,
            selectedReason: "sticky-affinity",
            failureReason: null,
            cursorBefore: null,
            cursorAfter: null,
          }),
        };
      }
    }
    if (provider.accountProvider.routing.strategy === "fill-first") {
      const account = accountsWithCapacity[0] || null;
      if (account && affinityKey) {
        codexAccountAffinities.set(affinityKey, account.id);
        persistCodexAccountRoutingToRuntime();
      }
      return {
        account,
        reason: account ? null : "busy",
        affinityKey,
        diagnostics: diagnostics({
          affinityKey,
          affinityHit: false,
          selectedAccount: account,
          selectedReason: account ? "fill-first" : null,
          failureReason: account ? null : "busy",
          cursorBefore: null,
          cursorAfter: null,
        }),
      };
    }
    const cursorKey = `${provider.id}:codex`;
    const cursor = codexAccountRoutingCursors.get(cursorKey) || 0;
    const cursorAfter = cursor + 1;
    codexAccountRoutingCursors.set(cursorKey, cursorAfter);
    const account = accountsWithCapacity[Math.max(0, cursor % accountsWithCapacity.length)] || accountsWithCapacity[0] || null;
    if (account && affinityKey) codexAccountAffinities.set(affinityKey, account.id);
    persistCodexAccountRoutingToRuntime();
    return {
      account,
      reason: account ? null : "busy",
      affinityKey,
      diagnostics: diagnostics({
        affinityKey,
        affinityHit: false,
        selectedAccount: account,
        selectedReason: account ? "round-robin" : null,
        failureReason: account ? null : "busy",
        cursorBefore: cursor,
        cursorAfter,
      }),
    };
  }

  function accountRoutingFromServiceError(error: ModelGatewayServiceError): ModelGatewayAccountRoutingDiagnostics | null {
    return normalizeRuntimeAccountRoutingDiagnostics(error.details?.accountRouting);
  }

  function patchProviderAccountEntry(
    providerId: string,
    accountId: string,
    patch: Partial<ModelGatewayAccountEntry>,
  ): void {
    patchRawProvider(providerId, (provider, stamp) => {
      const accountProvider = isRecord(provider.accountProvider) ? provider.accountProvider : null;
      if (!accountProvider) return false;
      const accounts = Array.isArray(accountProvider.accounts) ? accountProvider.accounts : [];
      const account = accounts.find((item): item is Record<string, unknown> => (
        isRecord(item) && normalizeString(item.id) === accountId
      ));
      if (!account) return false;
      Object.assign(account, patch, { updatedAt: stamp });
      accountProvider.accounts = accounts;
      provider.accountProvider = accountProvider;
      return true;
    });
  }

  function markCodexAccountReady(providerId: string, accountId: string, patch: Partial<ModelGatewayAccountEntry> = {}): void {
    patchProviderAccountEntry(providerId, accountId, {
      ...patch,
      state: "ready",
      lastCheckedAt: nowIso(),
      lastSuccessAt: nowIso(),
      lastError: null,
      cooldownUntil: null,
    });
  }

  function markCodexAccountNeedsLogin(providerId: string, accountId: string, message: string): void {
    patchProviderAccountEntry(providerId, accountId, {
      state: "needs-login",
      lastCheckedAt: nowIso(),
      lastError: message,
      cooldownUntil: null,
    });
  }

  function markCodexAccountCooldown(
    providerId: string,
    accountId: string,
    message: string,
    cooldownMs = CODEX_ACCOUNT_AUTH_COOLDOWN_MS,
  ): void {
    patchProviderAccountEntry(providerId, accountId, {
      state: "cooldown",
      lastCheckedAt: nowIso(),
      lastError: message,
      cooldownUntil: new Date(Date.now() + cooldownMs).toISOString(),
    });
  }

  function retryAfterMs(headers: Headers | null | undefined): number | null {
    const raw = normalizeString(headers?.get("retry-after"));
    if (!raw) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(Math.floor(seconds * 1000), CODEX_ACCOUNT_UPSTREAM_RETRY_AFTER_MAX_MS);
    }
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) return null;
    return Math.min(
      Math.max(0, timestamp - Date.now()),
      CODEX_ACCOUNT_UPSTREAM_RETRY_AFTER_MAX_MS,
    );
  }

  function retryAfterUntilIso(headers: Headers | null | undefined): string | null {
    const delayMs = retryAfterMs(headers);
    return delayMs === null ? null : new Date(Date.now() + delayMs).toISOString();
  }

  function codexAccountUpstreamErrorDisposition(
    statusCode: number,
    error: { message?: string; type?: string; code?: string } | null | undefined,
    headers?: Headers | null,
  ): { state: "needs-login" | "cooldown"; message: string; cooldownMs?: number } | null {
    const message = normalizeErrorScalar(error?.message) || `Codex account upstream returned HTTP ${statusCode}.`;
    const code = normalizeErrorScalar(error?.code).toLowerCase();
    const type = normalizeErrorScalar(error?.type).toLowerCase();
    const haystack = `${message} ${code} ${type}`.toLowerCase();
    if (
      statusCode === 401
      || statusCode === 403
      || haystack.includes("invalid_token")
      || haystack.includes("invalid_api_key")
      || haystack.includes("authentication")
      || haystack.includes("unauthorized")
      || haystack.includes("forbidden")
    ) {
      return { state: "needs-login", message };
    }
    if (
      statusCode === 429
      || haystack.includes("rate_limit")
      || haystack.includes("rate limit")
      || haystack.includes("quota")
      || haystack.includes("too many requests")
      || haystack.includes("capacity")
      || haystack.includes("overloaded")
    ) {
      return {
        state: "cooldown",
        message,
        cooldownMs: retryAfterMs(headers) ?? CODEX_ACCOUNT_UPSTREAM_COOLDOWN_MS,
      };
    }
    return null;
  }

  function updateCodexAccountAfterUpstreamFailure(
    provider: ModelGatewayProvider,
    account: ModelGatewayAccountEntry | null,
    statusCode: number,
    error: { message?: string; type?: string; code?: string } | null | undefined,
    headers?: Headers | null,
    options: { updateAccountState?: boolean } = {},
  ): void {
    if (!account || provider.sourceType !== "account-backed" || provider.accountProvider?.kind !== "codex") return;
    if (options.updateAccountState === false) return;
    const disposition = codexAccountUpstreamErrorDisposition(statusCode, error, headers);
    if (!disposition) return;
    if (disposition.state === "needs-login") {
      markCodexAccountNeedsLogin(provider.id, account.id, disposition.message);
      return;
    }
    markCodexAccountCooldown(
      provider.id,
      account.id,
      disposition.message,
      disposition.cooldownMs ?? CODEX_ACCOUNT_UPSTREAM_COOLDOWN_MS,
    );
  }

  function codexRefreshFailureIsAuth(statusCode: number, bodyText: string): boolean {
    const normalized = bodyText.toLowerCase();
    return statusCode === 400 || statusCode === 401 || statusCode === 403
      || normalized.includes("invalid_grant")
      || normalized.includes("refresh_token_reused");
  }

  async function refreshCodexTokenBundle(
    bundle: CodexTokenBundle,
    account?: ModelGatewayAccountEntry | null,
  ): Promise<CodexTokenBundle> {
    const refreshToken = normalizeString(bundle.tokens.refresh_token);
    if (!refreshToken) {
      throw new ModelGatewayServiceError(
        "model_gateway_account_refresh_missing",
        "Codex account refresh token is missing. Sign in again from Provider Center.",
        401,
      );
    }
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CODEX_ACCOUNT_AUTH_CLIENT_ID,
      refresh_token: refreshToken,
      scope: "openid profile email",
    });
    const response = await fetch(CODEX_ACCOUNT_AUTH_TOKEN_URL, withCodexAccountAuthNetwork({
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": CODEX_ACCOUNT_USER_AGENT,
      },
      body: form.toString(),
    }, CODEX_ACCOUNT_AUTH_TOKEN_URL, account));
    const text = await response.text();
    if (!response.ok) {
      throw new ModelGatewayServiceError(
        codexRefreshFailureIsAuth(response.status, text)
          ? "model_gateway_account_refresh_auth_failed"
          : "model_gateway_account_refresh_failed",
        `Codex account token refresh failed with HTTP ${response.status}: ${text.slice(0, 300) || response.statusText}`,
        codexRefreshFailureIsAuth(response.status, text) ? 401 : 502,
      );
    }
    const body = parseJsonObject(text) || {};
    const idToken = normalizeString(body.id_token || bundle.tokens.id_token);
    const accessToken = normalizeString(body.access_token);
    const nextRefreshToken = normalizeString(body.refresh_token || bundle.tokens.refresh_token);
    const authInfo = idToken ? codexAuthInfoFromJwt(idToken) : { email: "", accountId: "", plan: "", expiresAt: null };
    const expiresIn = firstPositiveInteger(body.expires_in);
    const next = normalizeCodexTokenBundle({
      type: "codex",
      tokens: {
        id_token: idToken,
        access_token: accessToken,
        refresh_token: nextRefreshToken,
        account_id: normalizeString(authInfo.accountId || bundle.tokens.account_id),
      },
      email: normalizeString(authInfo.email || bundle.email),
      plan_type: normalizeString(authInfo.plan || bundle.plan_type),
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : authInfo.expiresAt || bundle.expires_at,
      last_refresh: nowIso(),
    });
    if (!next?.tokens.access_token || !next.tokens.refresh_token) {
      throw new ModelGatewayServiceError(
        "model_gateway_account_refresh_invalid",
        "Codex account token refresh did not return usable access and refresh tokens.",
        502,
      );
    }
    return next;
  }

  async function resolveProviderSecret(
    provider: ModelGatewayProvider,
    context?: CodexAccountSelectionContext,
    options: { reserveAccount?: boolean; updateAccountStateOnAuthFailure?: boolean } = {},
  ): Promise<ProviderSecretResolution> {
    if (provider.authStrategy === "none") return {
      secret: null,
      account: null,
      accountRouting: null,
      releaseAccount: null,
    };
    if (provider.sourceType !== "account-backed" || provider.accountProvider?.kind !== "codex") {
      return {
        secret: readProviderSecret(provider),
        account: null,
        accountRouting: null,
        releaseAccount: null,
      };
    }
    const selection = selectProviderAccount(provider, context);
    const account = selection.account;
    if (!account) {
      if (selection.reason === "busy") {
        throw new ModelGatewayServiceError(
          "model_gateway_account_pool_busy",
          `Provider '${provider.id}' Codex account pool is at its per-account concurrency limit.`,
          429,
          { accountRouting: selection.diagnostics },
        );
      }
      throw new ModelGatewayServiceError(
        "model_gateway_account_unavailable",
        `Provider '${provider.id}' has no ready Codex account. Sign in again or wait for cooldown to expire.`,
        503,
        { accountRouting: selection.diagnostics },
      );
    }
    const releaseAccount = options.reserveAccount ? reserveProviderAccount(provider, account) : null;
    try {
      const secret = readSecrets().secrets[account.authRef]?.value || "";
      const bundle = normalizeCodexTokenBundle(secret);
      if (!bundle) {
        if (options.updateAccountStateOnAuthFailure !== false) {
          markCodexAccountNeedsLogin(provider.id, account.id, "Codex account token is missing or invalid.");
        }
        throw new ModelGatewayServiceError(
          "model_gateway_account_auth_missing",
          `Provider '${provider.id}' account '${account.id}' requires sign-in before requests can be forwarded.`,
          401,
          { accountRouting: selection.diagnostics },
        );
      }
      if (!codexTokenBundleNeedsRefresh(bundle)) {
        return {
          secret,
          account,
          accountRouting: selection.diagnostics,
          releaseAccount,
        };
      }
      const refreshKey = account.authRef;
      let refreshPromise = codexAccountRefreshes.get(refreshKey);
      if (!refreshPromise) {
        patchProviderAccountEntry(provider.id, account.id, {
          state: "refreshing",
          lastCheckedAt: nowIso(),
          lastError: null,
        });
        refreshPromise = (async () => {
          try {
            const refreshed = await refreshCodexTokenBundle(bundle, account);
            const serialized = JSON.stringify(refreshed);
            setSecretValue(account.authRef, serialized);
            const updatedAccount = codexAccountFromTokenBundle(account.id, account.authRef, refreshed, account.credentialSource, account);
            markCodexAccountReady(provider.id, account.id, updatedAccount);
            return serialized;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Codex account token refresh failed.";
            if (options.updateAccountStateOnAuthFailure !== false) {
              if (isModelGatewayServiceError(error) && error.statusCode === 401) {
                markCodexAccountNeedsLogin(provider.id, account.id, message);
              } else {
                markCodexAccountCooldown(provider.id, account.id, message);
              }
            }
            throw error;
          } finally {
            codexAccountRefreshes.delete(refreshKey);
          }
        })();
        codexAccountRefreshes.set(refreshKey, refreshPromise);
      }
      return {
        secret: await refreshPromise,
        account,
        accountRouting: selection.diagnostics,
        releaseAccount,
      };
    } catch (error) {
      releaseAccount?.();
      if (isModelGatewayServiceError(error) && !accountRoutingFromServiceError(error)) {
        throw new ModelGatewayServiceError(error.code, error.message, error.statusCode, {
          accountRouting: selection.diagnostics,
        });
      }
      throw error;
    }
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

  function normalizeAccountProxyUrl(value: string | null | undefined): string | null {
    const proxyUrl = normalizeString(value);
    if (!proxyUrl) return null;
    try {
      const protocol = new URL(proxyUrl).protocol.toLowerCase();
      if (protocol === "http:" || protocol === "https:" || protocol.startsWith("socks")) return proxyUrl;
    } catch {
      // Re-throw below with a stable Gateway error envelope.
    }
    throw new ModelGatewayServiceError(
      "model_gateway_provider_account_proxy_invalid",
      "Account proxy URL must be a valid http, https, or socks URL.",
      400,
    );
  }

  function updateProviderAccount(
    req: http.IncomingMessage | undefined,
    providerId: string,
    accountId: string,
    payload: ModelGatewayProviderAccountUpdateRequest = {},
  ): ModelGatewayProviderAccountUpdateResponse {
    requireManagement(req);
    const registry = readRegistry();
    const { provider, account } = getProviderAccountForManagement(registry, providerId, accountId);
    const stamp = nowIso();
    if (typeof payload.enabled === "boolean") {
      account.enabled = payload.enabled;
      account.state = payload.enabled
        ? account.state === "disabled"
          ? "ready"
          : account.state
        : "disabled";
      account.cooldownUntil = payload.enabled ? account.cooldownUntil : null;
      account.lastCheckedAt = stamp;
      account.lastError = payload.enabled ? account.lastError : null;
    }
    if ("proxyUrl" in payload) {
      account.proxyUrl = normalizeAccountProxyUrl(payload.proxyUrl);
    }
    if (payload.clearCooldown === true) {
      account.cooldownUntil = null;
      if (account.state === "cooldown") account.state = "ready";
      if (account.state === "ready") account.lastError = null;
      account.lastCheckedAt = stamp;
    }
    account.updatedAt = stamp;
    provider.updatedAt = stamp;
    writeRegistry(registry);
    return providerAccountResponse(providerId, accountId);
  }

  async function refreshProviderAccount(
    req: http.IncomingMessage | undefined,
    providerId: string,
    accountId: string,
  ): Promise<ModelGatewayProviderAccountRefreshResponse> {
    requireManagement(req);
    const registry = readRegistry();
    const { provider, account } = getProviderAccountForManagement(registry, providerId, accountId);
    if (provider.accountProvider?.kind !== "codex" || account.kind !== "codex") {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_account_refresh_unsupported",
        `Provider '${providerId}' account '${accountId}' does not support manual refresh.`,
        400,
      );
    }
    if (!account.enabled || account.state === "disabled") {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_account_disabled",
        `Provider '${providerId}' account '${accountId}' is disabled. Enable it before refreshing.`,
        409,
      );
    }
    const secret = readSecrets().secrets[account.authRef]?.value || "";
    const bundle = normalizeCodexTokenBundle(secret);
    if (!bundle) {
      markCodexAccountNeedsLogin(providerId, accountId, "Codex account token is missing or invalid.");
      throw new ModelGatewayServiceError(
        "model_gateway_account_auth_missing",
        `Provider '${providerId}' account '${accountId}' requires sign-in before it can be refreshed.`,
        401,
      );
    }

    const refreshKey = account.authRef;
    let refreshPromise = codexAccountRefreshes.get(refreshKey);
    if (!refreshPromise) {
      patchProviderAccountEntry(providerId, accountId, {
        state: "refreshing",
        lastCheckedAt: nowIso(),
        lastError: null,
      });
      refreshPromise = (async () => {
        try {
          const refreshed = await refreshCodexTokenBundle(bundle, account);
          const serialized = JSON.stringify(refreshed);
          setSecretValue(account.authRef, serialized);
          const updatedAccount = codexAccountFromTokenBundle(account.id, account.authRef, refreshed, account.credentialSource, account);
          markCodexAccountReady(providerId, accountId, updatedAccount);
          return serialized;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Codex account token refresh failed.";
          if (isModelGatewayServiceError(error) && error.statusCode === 401) {
            markCodexAccountNeedsLogin(providerId, accountId, message);
          } else {
            markCodexAccountCooldown(providerId, accountId, message);
          }
          throw error;
        } finally {
          codexAccountRefreshes.delete(refreshKey);
        }
      })();
      codexAccountRefreshes.set(refreshKey, refreshPromise);
    }

    await refreshPromise;
    const response = providerAccountResponse(providerId, accountId);
    return {
      ...response,
      refreshed: true,
    };
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
        mode: runtimeHost === "local-daemon" ? "daemon-local-control" : "tracevane-api",
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
        runtimeMode: daemonRunning ? "local-daemon" : "tracevane-api-embedded",
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
            "Local Gateway daemon service is not active; Tracevane API is serving the embedded fallback.",
            "Embedded fallback does not survive Tracevane API or OpenClaw process crashes.",
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
    const openCircuits = registry.providers.reduce((sum, provider) => sum + providerOpenCircuitCount(provider), 0);
    const latestRequestAt = runtime.requestLog[runtime.requestLog.length - 1]?.finishedAt || null;
    const usageSummary = summarizeRuntimeUsage(runtime.requestLog, createRuntimeUsageModelResolver(registry));
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
        models: ["/v1/models", "/v1/models/{model}", "/claude/v1/models", "/claude/v1/models/{model}"],
        openaiChatCompletions: ROUTES.openai_chat_completions.paths,
        openaiResponses: ROUTES.openai_responses.paths,
        openaiResponsesCompact: ROUTES.openai_responses_compact.paths,
        openaiImagesGenerations: ROUTES.openai_images_generations.paths,
        openaiImagesEdits: ROUTES.openai_images_edits.paths,
        openaiAudioTranscriptions: ROUTES.openai_audio_transcriptions.paths,
        openaiAudioTranslations: ROUTES.openai_audio_translations.paths,
        openaiAudioSpeech: ROUTES.openai_audio_speech.paths,
        anthropicMessages: ROUTES.anthropic_messages.paths,
        anthropicMessagesCountTokens: ROUTES.anthropic_messages_count_tokens.paths,
        unsupportedEndpoints: MODEL_GATEWAY_UNSUPPORTED_ENDPOINTS,
      },
      registry: {
        providerCount: registry.providers.length,
        activeProviders: registry.activeProviders,
        clientAuth: clientAuthView(registry.clientAuth),
        paths: {
          registry: paths.registry,
          secrets: paths.secrets,
          runtime: paths.runtime,
          usageLedger: paths.usageLedger,
        },
      },
      runtime: {
        requestLogSize: runtime.requestLog.length,
        latestRequestAt,
        usageSummary,
      },
      lifecycle: getLifecycleStatus(),
      healthSummary: {
        okProviders: registry.providers.filter((provider) => providerHasHealthyRoutingSurface(provider)).length,
        degradedProviders: registry.providers.filter((provider) => providerHasDegradedHealth(provider)).length,
        openCircuits,
      },
    };
  }

  function getRuntime(): ModelGatewayRuntimeResponse {
    const runtime = readRuntime();
    const registry = readRegistry();
    return {
      ok: true,
      runtime,
      usageSummary: summarizeRuntimeUsage(runtime.requestLog, createRuntimeUsageModelResolver(registry)),
      paths: {
        runtime: paths.runtime,
        logs: paths.logs,
      },
    };
  }

  function getUsageLedger(options: ModelGatewayUsageLedgerOptions = {}): ModelGatewayUsageLedgerResponse {
    const { entries: readableEntries } = readUsageLedgerEntries();
    const query = resolveUsageDateQuery(options);
    const filteredEntries = readableEntries.filter((entry) => usageEntryWithinDateRange(entry, query.dateFrom, query.dateTo));
    const registry = readRegistry();
    const modelBucketForEntry = createRuntimeUsageModelResolver(registry);
    const summary = summarizeUsageLedgerModels(filteredEntries, modelBucketForEntry);
    return {
      ok: true,
      checkedAt: nowIso(),
      totals: summary.totals,
      models: summary.models,
      daily: summary.daily,
      query,
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

  async function getDaemonService(): Promise<ModelGatewayDaemonServiceResponse> {
    const plan = createModelGatewayDaemonServicePlan(config);
    const commands = plan.selectedTemplate.commands.status || [];
    const commandsRun: ModelGatewayDaemonServiceCommandResult[] = [];
    for (const item of commands) commandsRun.push(await runDaemonServiceCommand(item));
    return daemonServiceResponse({
      action: "status",
      applied: commandsRun.length > 0,
      commandsRun: normalizeDaemonServiceCommandResults("status", commandsRun),
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

  async function startCodexAccountLogin(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayCodexAccountLoginStartRequest = {},
  ): Promise<ModelGatewayCodexAccountLoginStartResponse> {
    requireManagement(req);
    const response = await fetch(CODEX_ACCOUNT_DEVICE_USER_CODE_URL, withCodexAccountAuthNetwork({
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ client_id: CODEX_ACCOUNT_AUTH_CLIENT_ID }),
    }, CODEX_ACCOUNT_DEVICE_USER_CODE_URL));
    const text = await response.text();
    if (!response.ok) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_login_start_failed",
        `Codex login start failed with HTTP ${response.status}: ${text.slice(0, 300) || response.statusText}`,
        502,
      );
    }
    const body = parseJsonObject(text) || {};
    const deviceAuthId = normalizeString(body.device_auth_id);
    const userCode = normalizeString(body.user_code || body.usercode);
    if (!deviceAuthId || !userCode) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_login_start_invalid",
        "Codex login start response did not include device auth id and user code.",
        502,
      );
    }
    const loginId = randomUUID();
    const pollInterval = firstPositiveInteger(body.interval) || CODEX_ACCOUNT_DEFAULT_POLL_INTERVAL_SECONDS;
    const expiresAtMs = Date.now() + CODEX_ACCOUNT_LOGIN_TIMEOUT_MS;
    const setActiveScopes = normalizeExplicitAppScopes(payload.setActiveScopes);
    rememberCodexDeviceLoginSession({
      loginId,
      providerId: normalizeId(payload.providerId, "codex-account"),
      providerName: normalizeString(payload.providerName, "Codex Account"),
      setActiveScopes: setActiveScopes.length ? setActiveScopes : [...MODEL_GATEWAY_APP_SCOPES],
      deviceAuthId,
      userCode,
      expiresAtMs,
      pollIntervalSeconds: pollInterval,
      createdAt: nowIso(),
    });
    return {
      ok: true,
      loginId,
      verificationUrl: CODEX_ACCOUNT_DEVICE_VERIFICATION_URL,
      userCode,
      expiresAt: new Date(expiresAtMs).toISOString(),
      pollIntervalSeconds: pollInterval,
    };
  }

  async function pollCodexDeviceAuthorization(
    session: CodexDeviceLoginSession,
  ): Promise<{ authorizationCode: string; codeVerifier: string; codeChallenge: string } | null> {
    const response = await fetch(CODEX_ACCOUNT_DEVICE_TOKEN_URL, withCodexAccountAuthNetwork({
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        device_auth_id: session.deviceAuthId,
        user_code: session.userCode,
      }),
    }, CODEX_ACCOUNT_DEVICE_TOKEN_URL));
    const text = await response.text();
    if (response.status === 403 || response.status === 404) return null;
    if (!response.ok) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_login_poll_failed",
        `Codex login poll failed with HTTP ${response.status}: ${text.slice(0, 300) || response.statusText}`,
        502,
      );
    }
    const body = parseJsonObject(text) || {};
    const authorizationCode = normalizeString(body.authorization_code);
    const codeVerifier = normalizeString(body.code_verifier);
    const codeChallenge = normalizeString(body.code_challenge);
    if (!authorizationCode || !codeVerifier || !codeChallenge) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_login_poll_invalid",
        "Codex login poll response did not include the authorization code and PKCE verifier.",
        502,
      );
    }
    return { authorizationCode, codeVerifier, codeChallenge };
  }

  async function exchangeCodexAuthorizationCode(
    authorizationCode: string,
    codeVerifier: string,
  ): Promise<CodexTokenBundle> {
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_ACCOUNT_AUTH_CLIENT_ID,
      code: authorizationCode,
      redirect_uri: CODEX_ACCOUNT_DEVICE_REDIRECT_URI,
      code_verifier: codeVerifier,
    });
    const response = await fetch(CODEX_ACCOUNT_AUTH_TOKEN_URL, withCodexAccountAuthNetwork({
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    }, CODEX_ACCOUNT_AUTH_TOKEN_URL));
    const text = await response.text();
    if (!response.ok) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_token_exchange_failed",
        `Codex token exchange failed with HTTP ${response.status}: ${text.slice(0, 300) || response.statusText}`,
        502,
      );
    }
    const body = parseJsonObject(text) || {};
    const idToken = normalizeString(body.id_token);
    const accessToken = normalizeString(body.access_token);
    const refreshToken = normalizeString(body.refresh_token);
    const authInfo = idToken ? codexAuthInfoFromJwt(idToken) : { email: "", accountId: "", plan: "", expiresAt: null };
    const expiresIn = firstPositiveInteger(body.expires_in);
    const bundle = normalizeCodexTokenBundle({
      type: "codex",
      tokens: {
        id_token: idToken,
        access_token: accessToken,
        refresh_token: refreshToken,
        account_id: authInfo.accountId,
      },
      email: authInfo.email,
      plan_type: authInfo.plan,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : authInfo.expiresAt,
      last_refresh: nowIso(),
    });
    if (!bundle?.tokens.access_token || !bundle.tokens.refresh_token) {
      throw new ModelGatewayServiceError(
        "model_gateway_codex_token_exchange_invalid",
        "Codex token exchange did not return usable access and refresh tokens.",
        502,
      );
    }
    return bundle;
  }

  function persistCodexAccountProvider(
    session: CodexDeviceLoginSession,
    bundle: CodexTokenBundle,
  ): ModelGatewayProviderView {
    const registry = readRegistry();
    const accountId = normalizeString(bundle.tokens.account_id) || normalizeString(bundle.email) || session.loginId;
    const accountHash = normalizeString(bundle.account_hash) || sha256Short(accountId);
    const providerId = normalizeId(session.providerId, `codex-account-${accountHash}`);
    const existing = findProvider(registry, providerId);
    const authRef = `provider:${providerId}:account:${accountHash}:codex-token`;
    const account = codexAccountFromTokenBundle(
      `codex-${accountHash}`,
      authRef,
      { ...bundle, account_hash: accountHash },
      "codex-device-auth",
      existing?.accountProvider?.accounts.find((item) => item.id === `codex-${accountHash}`),
    );
    const existingAccounts = existing?.accountProvider?.accounts.filter((item) => item.id !== account.id) || [];
    const nextAccounts = [...existingAccounts, account];
    const provider = normalizeProvider({
      ...(existing || {}),
      id: providerId,
      name: existing?.name || codexAccountProviderName(account, session.providerName),
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: existing?.appScopes?.length ? existing.appScopes : [...MODEL_GATEWAY_APP_SCOPES],
      baseUrl: CODEX_ACCOUNT_PROVIDER_BASE_URL,
      apiKeyRef: authRef,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: mergeManagedModelCatalogWithDefaults(existing?.models, codexAccountDefaultModels()),
      endpoints: {
        ...(existing?.endpoints || {}),
        openai_responses: "/responses",
        openai_responses_compact: "/compact",
      },
      endpointProfiles: existing?.endpointProfiles || [],
      network: existing?.network || {},
      health: existing?.health || {},
      failover: existing?.failover || { enabled: true, priority: 20, maxRetries: 1 },
      accountProvider: {
        kind: "codex",
        routing: existing?.accountProvider?.routing || {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: nextAccounts,
      },
      metadata: {
        ...(existing?.metadata || {}),
        importedFrom: "codex-device-login",
        website: "https://chatgpt.com",
        notes: "User-owned Codex/ChatGPT account-backed provider. Credentials stay in the local Tracevane Gateway secret store.",
      },
    }, existing || undefined);
    const index = registry.providers.findIndex((item) => item.id === provider.id);
    if (index >= 0) registry.providers[index] = provider;
    else registry.providers.push(provider);
    for (const scope of session.setActiveScopes) {
      if (provider.appScopes.includes(scope)) registry.activeProviders[scope] = provider.id;
    }
    setSecretValue(authRef, JSON.stringify(bundle));
    writeRegistry(registry);
    return toProviderView(provider);
  }

  async function pollCodexAccountLogin(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayCodexAccountLoginPollRequest = { loginId: "" },
  ): Promise<ModelGatewayCodexAccountLoginPollResponse> {
    requireManagement(req);
    const loginId = normalizeString(payload.loginId);
    const existingPoll = loginId ? codexDeviceLoginPolls.get(loginId) : null;
    if (existingPoll) return await existingPoll;
    const poll = pollCodexAccountLoginOnce(loginId);
    if (loginId) {
      codexDeviceLoginPolls.set(loginId, poll);
      poll.finally(() => codexDeviceLoginPolls.delete(loginId));
    }
    return await poll;
  }

  async function pollCodexAccountLoginOnce(loginId: string): Promise<ModelGatewayCodexAccountLoginPollResponse> {
    const session = loginId ? getCodexDeviceLoginSession(loginId) : null;
    if (!session) {
      return {
        ok: true,
        status: "failed",
        message: "Codex login session was not found in local state. Start login again.",
        provider: null,
      };
    }
    if (Date.now() > session.expiresAtMs) {
      forgetCodexDeviceLoginSession(loginId);
      return {
        ok: true,
        status: "expired",
        message: "Codex login session expired. Start login again.",
        provider: null,
      };
    }
    try {
      const authorization = await pollCodexDeviceAuthorization(session);
      if (!authorization) {
        return {
          ok: true,
          status: "pending",
          message: "Waiting for the user to approve Codex device login.",
          provider: null,
        };
      }
      const bundle = await exchangeCodexAuthorizationCode(authorization.authorizationCode, authorization.codeVerifier);
      const provider = persistCodexAccountProvider(session, bundle);
      forgetCodexDeviceLoginSession(loginId);
      return {
        ok: true,
        status: "completed",
        message: "Codex account login completed and provider was created.",
        provider,
      };
    } catch (error) {
      if (isModelGatewayServiceError(error)) throw error;
      throw new ModelGatewayServiceError(
        "model_gateway_codex_login_failed",
        error instanceof Error ? error.message : "Codex account login failed.",
        502,
      );
    }
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
    const timeoutMs = normalizeDetectProviderTimeout(payload.timeoutMs);
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
    if (selectedModel && !seenModels.has(selectedModel)) {
      seenModels.add(selectedModel);
      models.push(inferredModelFromId(selectedModel));
    }
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
      summary: buildProvidersSummary(registry, activeRoutes),
      paths: {
        registry: paths.registry,
        secrets: paths.secrets,
        runtime: paths.runtime,
      },
    };
  }

  function buildProvidersSummary(
    registry: ModelGatewayRegistryState,
    activeRoutes: ModelGatewayActiveRouteStatus[],
  ): ModelGatewayProvidersSummary {
    const enabledProviders = registry.providers.filter((provider) => provider.enabled);
    const providerAccounts = registry.providers.flatMap((provider) => provider.accountProvider?.accounts ?? []);
    const routeCounts = activeRoutes.reduce((counts, route) => {
      counts[route.state] += 1;
      return counts;
    }, {
      fixed: 0,
      auto: 0,
      fallback: 0,
      missing: 0,
    } satisfies Record<ModelGatewayActiveRouteStatus["state"], number>);
    return {
      providers: {
        total: registry.providers.length,
        enabled: enabledProviders.length,
        disabled: registry.providers.length - enabledProviders.length,
        healthy: registry.providers.filter((provider) => providerHasHealthyRoutingSurface(provider)).length,
        degraded: registry.providers.filter((provider) => providerHasDegradedHealth(provider)).length,
        openCircuitProviders: registry.providers.filter((provider) => providerOpenCircuitCount(provider) > 0).length,
        openCircuits: registry.providers.reduce((sum, provider) => sum + providerOpenCircuitCount(provider), 0),
        accountBacked: registry.providers.filter((provider) => provider.sourceType === "account-backed").length,
        endpointProfiles: registry.providers.reduce((sum, provider) => sum + provider.endpointProfiles.length, 0),
        enabledEndpointProfiles: registry.providers.reduce((sum, provider) => sum + enabledEndpointProfiles(provider).length, 0),
        declaredModels: registry.providers.reduce((sum, provider) => sum + providerDeclaredModelCount(provider), 0),
      },
      accounts: {
        total: providerAccounts.length,
        ready: providerAccounts.filter((account) => accountAvailableForRouting(account)).length,
        attention: providerAccounts.filter((account) => !accountAvailableForRouting(account)).length,
      },
      routes: {
        total: activeRoutes.length,
        ready: routeCounts.fixed + routeCounts.auto + routeCounts.fallback,
        fixed: routeCounts.fixed,
        auto: routeCounts.auto,
        fallback: routeCounts.fallback,
        missing: routeCounts.missing,
        alertCount: activeRoutes.filter((route) => route.warning || route.state === "missing").length,
      },
    };
  }

  function providerDeclaredModelCount(provider: ModelGatewayProvider): number {
    const providerModels = provider.models.models.length;
    const endpointModels = provider.endpointProfiles.reduce((sum, profile) => (
      sum + (profile.models?.models.length ?? 0)
    ), 0);
    return providerModels + endpointModels;
  }

  function defaultRouteIdForScope(scope: ModelGatewayAppScope): ModelGatewayRouteId {
    if (scope === "codex") return "openai_responses";
    if (scope === "claude-code") return "anthropic_messages";
    return "openai_chat_completions";
  }

  function appConnectionRequestedModelForScope(
    registry: ModelGatewayRegistryState,
    scope: ModelGatewayAppScope,
  ): string | null {
    const profile = normalizeAppConnectionProfile(registry.appConnectionProfile);
    return normalizeString(profile.appModels[scope as ModelGatewayAppConnectionId] || profile.model || "") || null;
  }

  function buildActiveRouteStatuses(registry: ModelGatewayRegistryState): ModelGatewayActiveRouteStatus[] {
    return MODEL_GATEWAY_APP_SCOPES.map((scope) => {
      const selectedProviderId = registry.activeProviders[scope] || null;
      const routeId = defaultRouteIdForScope(scope);
      const requestedModel = appConnectionRequestedModelForScope(registry, scope);
      const selection = resolveProviderSelection(registry, scope, routeId, requestedModel);
      const resolvedProvider = selection.provider;
      const effectiveProvider = selection.effectiveProvider || resolvedProvider;
      const resolvedModel = selection.resolvedModel
        || requestedModel
        || effectiveProvider?.models.defaultModel
        || effectiveProvider?.models.models[0]?.id
        || null;
      const routeModeValue = effectiveProvider ? routeMode(routeId, effectiveProvider) : null;
      const upstreamPath = effectiveProvider ? endpointForRoute(routeId, effectiveProvider) : null;
      const upstreamUrl = effectiveProvider && upstreamPath ? joinBaseUrl(effectiveProvider.baseUrl, upstreamPath) : null;
      const endpointProfileId = selection.endpointProfile?.id || null;
      const endpointProfileName = selection.endpointProfile?.name || null;
      const resolvedRouteTarget = endpointProfileName
        ? `${resolvedProvider?.name || endpointProfileName} / ${endpointProfileName}`
        : resolvedProvider?.name || "";
      if (!resolvedProvider) {
        return {
          scope,
          selectedProviderId,
          resolvedProviderId: null,
          resolvedProviderName: null,
          resolvedEndpointProfileId: null,
          resolvedEndpointProfileName: null,
          resolvedModel,
          routeId,
          routeMode: null,
          resolvedApiFormat: null,
          resolvedBaseUrl: null,
          upstreamUrl: null,
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
          resolvedEndpointProfileId: endpointProfileId,
          resolvedEndpointProfileName: endpointProfileName,
          resolvedModel,
          routeId,
          routeMode: routeModeValue,
          resolvedApiFormat: effectiveProvider?.apiFormat || null,
          resolvedBaseUrl: effectiveProvider?.baseUrl || null,
          upstreamUrl,
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
          resolvedEndpointProfileId: endpointProfileId,
          resolvedEndpointProfileName: endpointProfileName,
          resolvedModel,
          routeId,
          routeMode: routeModeValue,
          resolvedApiFormat: effectiveProvider?.apiFormat || null,
          resolvedBaseUrl: effectiveProvider?.baseUrl || null,
          upstreamUrl,
          state: "fixed",
          message: endpointProfileName
            ? `Fixed to '${resolvedProvider.name}' via endpoint '${endpointProfileName}'.`
            : `Fixed to '${resolvedProvider.name}'.`,
          warning: null,
        };
      }
      return {
        scope,
        selectedProviderId,
        resolvedProviderId: resolvedProvider.id,
        resolvedProviderName: resolvedProvider.name,
        resolvedEndpointProfileId: endpointProfileId,
        resolvedEndpointProfileName: endpointProfileName,
        resolvedModel,
        routeId,
        routeMode: routeModeValue,
        resolvedApiFormat: effectiveProvider?.apiFormat || null,
        resolvedBaseUrl: effectiveProvider?.baseUrl || null,
        upstreamUrl,
        state: "auto",
        message: endpointProfileName
          ? `Auto resolves to '${resolvedRouteTarget}'.`
          : `Auto resolves to '${resolvedProvider.name}'.`,
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
      contextWindow: number | null;
      maxOutputTokens: number | null;
      aliases: Set<string>;
      providerIds: Set<string>;
      healthyProviderIds: Set<string>;
      openCircuitProviderIds: Set<string>;
      priority: number;
      features: ModelGatewayModelFeatures;
      supportedGatewayRoutes: Set<ModelGatewayRouteId>;
      unsupportedGatewayRoutes: Map<string, ModelGatewayUnsupportedRoute>;
      pricing?: ModelGatewayProviderModelPricing;
    }>();

    for (const provider of registry.providers.filter((item) => item.enabled)) {
      const providerModelSources = providerEndpointProfilesForRouting(provider)
        .filter((endpointProfile) => !endpointProfile || endpointProfile.enabled)
        .map((endpointProfile) => ({
          endpointProfile,
          effectiveProvider: effectiveProviderForEndpointProfile(provider, endpointProfile),
        }))
        .filter((item) => item.effectiveProvider.appScopes.some((scope) => provider.appScopes.includes(scope)));
      for (const source of providerModelSources) {
        const providerModels = source.effectiveProvider.models.models.length
          ? source.effectiveProvider.models.models
          : source.effectiveProvider.models.defaultModel
          ? [{ id: source.effectiveProvider.models.defaultModel }]
          : [];
      for (const model of providerModels) {
        const id = normalizeString(model.id);
        if (!id) continue;
        const key = normalizeModelLookupKey(id);
        const current = byModelId.get(key);
        const sourceHealthy = source.effectiveProvider.health.circuitState !== "open";
        const routeSupport = modelGatewayRouteSupportForProviderModel(source.effectiveProvider, model);
        const unsupportedByKey = new Map(routeSupport.unsupported.map((item) => [
          item.routeId ? `route:${item.routeId}` : `endpoint:${item.endpoint || item.code}`,
          item,
        ] as const));
        for (const routeId of routeSupport.supported) unsupportedByKey.delete(`route:${routeId}`);
        if (!current) {
          byModelId.set(key, {
            id,
            label: model.label || null,
            contextWindow: positiveIntegerOrNull(model.contextWindow),
            maxOutputTokens: positiveIntegerOrNull(model.maxOutputTokens),
            aliases: new Set(model.aliases || []),
            providerIds: new Set([provider.id]),
            healthyProviderIds: new Set(sourceHealthy ? [provider.id] : []),
            openCircuitProviderIds: new Set(sourceHealthy ? [] : [provider.id]),
            priority: Math.min(provider.failover.priority, source.effectiveProvider.failover.priority),
            features: compactModelFeatures({ ...(model.features || {}) }),
            supportedGatewayRoutes: new Set(routeSupport.supported),
            unsupportedGatewayRoutes: unsupportedByKey,
            pricing: model.pricing,
          });
          continue;
        }
        current.providerIds.add(provider.id);
        if (sourceHealthy) {
          current.healthyProviderIds.add(provider.id);
          current.openCircuitProviderIds.delete(provider.id);
        } else if (!current.healthyProviderIds.has(provider.id)) {
          current.openCircuitProviderIds.add(provider.id);
        }
        for (const alias of model.aliases || []) current.aliases.add(alias);
        current.contextWindow = mergeModelBudgetMinimum(current.contextWindow, model.contextWindow);
        current.maxOutputTokens = mergeModelBudgetMinimum(current.maxOutputTokens, model.maxOutputTokens);
        if (!current.pricing && model.pricing) current.pricing = model.pricing;
        mergeModelFeatures(current.features, model.features);
        for (const routeId of routeSupport.supported) {
          current.supportedGatewayRoutes.add(routeId);
          current.unsupportedGatewayRoutes.delete(`route:${routeId}`);
        }
        for (const [unsupportedKey, unsupportedRoute] of unsupportedByKey) {
          if (unsupportedRoute.routeId && current.supportedGatewayRoutes.has(unsupportedRoute.routeId)) continue;
          if (!current.unsupportedGatewayRoutes.has(unsupportedKey)) {
            current.unsupportedGatewayRoutes.set(unsupportedKey, unsupportedRoute);
          }
        }
        const sourcePriority = Math.min(provider.failover.priority, source.effectiveProvider.failover.priority);
        if (sourcePriority < current.priority) {
          current.id = id;
          current.label = model.label || current.label;
          current.priority = sourcePriority;
          current.pricing = model.pricing || current.pricing;
        }
      }
      }
    }

    const data = [...byModelId.values()]
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
      .map((item) => {
        const features = compactModelFeatures(item.features);
        const contextWindow = item.contextWindow || CODEX_CATALOG_DEFAULT_CONTEXT_WINDOW;
        const maxOutputTokens = item.maxOutputTokens || CODEX_CATALOG_DEFAULT_MAX_OUTPUT_TOKENS;
        const supportedGatewayRoutes = [...item.supportedGatewayRoutes].sort();
        const unsupportedGatewayRoutes = [...item.unsupportedGatewayRoutes.values()]
          .filter((route) => !route.routeId || !item.supportedGatewayRoutes.has(route.routeId))
          .sort((left, right) =>
            (left.routeId || left.endpoint || left.code).localeCompare(right.routeId || right.endpoint || right.code)
          );
        const agentSelectable = modelGatewayModelSupportsAgentConnection({
          supportedGatewayRoutes,
          routeSupport: {
            supported: supportedGatewayRoutes,
            unsupported: unsupportedGatewayRoutes,
          },
        });
        return {
          id: item.id,
          slug: item.id,
          object: "model" as const,
          created: 0,
          owned_by: item.providerIds.size > 1 ? "tracevane-gateway" : `provider:${[...item.providerIds][0] || "unknown"}`,
          label: item.label,
          display_name: item.label || item.id,
          description: `${item.label || item.id} via Tracevane Model Gateway.`,
          default_reasoning_level: "medium",
          visibility: "list" as const,
          shell_type: "shell_command" as const,
          supported_in_api: true,
          priority: item.priority,
          additional_speed_tiers: [],
          service_tiers: [],
          availability_nux: null,
          upgrade: null,
          base_instructions: CODEX_CATALOG_BASE_INSTRUCTIONS,
          model_messages: CODEX_CATALOG_MODEL_MESSAGES,
          supports_reasoning_summaries: false,
          default_reasoning_summary: "none",
          support_verbosity: true,
          default_verbosity: "low",
          apply_patch_tool_type: "freeform",
          web_search_tool_type: "text",
          truncation_policy: CODEX_CATALOG_TRUNCATION_POLICY,
          supports_parallel_tool_calls: true,
          supports_image_detail_original: features.vision === true,
          effective_context_window_percent: 95,
          experimental_supported_tools: [],
          supports_search_tool: false,
          use_responses_lite: false,
          supported_reasoning_levels: codexCatalogReasoningLevels(item.id, features),
          input_modalities: codexCatalogInputModalities(features),
          context_window: contextWindow,
          max_context_window: contextWindow,
          max_output_tokens: maxOutputTokens,
          contextWindow: item.contextWindow,
          maxOutputTokens: item.maxOutputTokens,
          aliases: [...item.aliases].sort(),
          providerIds: [...item.providerIds].sort(),
          healthyProviderIds: [...item.healthyProviderIds].sort(),
          openCircuitProviderIds: [...item.openCircuitProviderIds].sort(),
          features,
          agentSelectable,
          endpointOnly: !agentSelectable,
          routeSupport: {
            supported: supportedGatewayRoutes,
            unsupported: unsupportedGatewayRoutes,
          },
          supportedGatewayRoutes,
          unsupportedGatewayRoutes,
          ...(item.pricing ? { pricing: item.pricing } : {}),
        };
      });
    return {
      object: "list",
      data,
      models: data,
    };
  }

  function getGatewayModel(req: http.IncomingMessage | undefined, modelId: string): ModelGatewayModelListItem {
    const normalized = normalizeModelLookupKey(modelId);
    const model = listGatewayModels(req).data.find((item) => (
      normalizeModelLookupKey(item.id) === normalized
      || item.aliases.some((alias) => normalizeModelLookupKey(alias) === normalized)
    ));
    if (!model) {
      throw new ModelGatewayServiceError(
        "model_gateway_model_not_found",
        `Model Gateway model '${modelId}' was not found.`,
        404,
      );
    }
    return model;
  }

  function toAnthropicModelInfo(model: ModelGatewayModelListItem): AnthropicModelInfo {
    return {
      id: model.id,
      type: "model",
      display_name: model.display_name || model.label || model.id,
      created_at: new Date((model.created || 0) * 1000).toISOString(),
    };
  }

  function listGatewayAnthropicModels(req?: http.IncomingMessage): AnthropicModelListResponse {
    const data = listGatewayModels(req).data
      .filter((model) => model.supportedGatewayRoutes?.includes("anthropic_messages"))
      .map(toAnthropicModelInfo);
    return {
      data,
      first_id: data[0]?.id || null,
      has_more: false,
      last_id: data[data.length - 1]?.id || null,
    };
  }

  function getGatewayAnthropicModel(req: http.IncomingMessage | undefined, modelId: string): AnthropicModelInfo {
    const model = getGatewayModel(req, modelId);
    if (!model.supportedGatewayRoutes?.includes("anthropic_messages")) {
      throw new ModelGatewayServiceError(
        "model_gateway_model_not_found",
        `Model Gateway model '${modelId}' is not available through the Anthropic Messages route.`,
        404,
      );
    }
    return toAnthropicModelInfo(model);
  }

  function readGatewayClientSecret(): string | null {
    const registry = readRegistry();
    const auth = registry.clientAuth;
    if (!auth.enabled) return null;
    return readSecrets().secrets[auth.apiKeyRef]?.value || null;
  }

  function gatewayAgentModelIds(): string[] {
    const registry = readRegistry();
    const models = listGatewayModels().data.filter(modelGatewayModelSupportsAgentConnection);
    const agentModelIds = new Set(models.map((model) => model.id));
    const defaultIds = registry.providers
      .filter((provider) => provider.enabled)
      .sort((left, right) => left.failover.priority - right.failover.priority || left.name.localeCompare(right.name))
      .map((provider) => normalizeString(provider.models.defaultModel || provider.models.models[0]?.id || ""))
      .filter((modelId) => Boolean(modelId) && agentModelIds.has(modelId));
    return [
      ...defaultIds,
      ...models.map((model) => model.id),
    ].filter((model, index, list) => list.indexOf(model) === index);
  }

  function defaultModelForConnection(scope: ModelGatewayAppScope): string | null {
    const registry = readRegistry();
    const routeId = defaultRouteIdForScope(scope);
    const selection = resolveProviderSelection(registry, scope, routeId, null);
    return selection.resolvedModel
      || selection.effectiveProvider?.models.defaultModel
      || selection.effectiveProvider?.models.models[0]?.id
      || gatewayAgentModelIds()[0]
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
    return withResolvedAppConnectionBudget({
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

  function modelListItemMatchesRequest(item: ModelGatewayModelListItem, requestedModel: string): boolean {
    const requested = normalizeModelLookupKey(requestedModel);
    if (!requested) return false;
    const direct = [
      item.id,
      ...item.aliases,
      ...item.providerIds.map((providerId) => `${providerId}/${item.id}`),
      ...item.providerIds.flatMap((providerId) => item.aliases.map((alias) => `${providerId}/${alias}`)),
    ].some((candidate) => normalizeModelLookupKey(candidate) === requested);
    if (direct) return true;
    const tail = requested.split("/").pop() || requested;
    return normalizeModelLookupKey(item.id) === tail
      || item.aliases.some((alias) => normalizeModelLookupKey(alias) === tail);
  }

  function modelCatalogEntryForAppConnectionModel(modelId: string | null): AppConnectionModelCatalogEntry {
    const requested = normalizeString(modelId);
    if (!requested) {
      return {
        contextWindow: null,
        maxOutputTokens: null,
        features: {},
      };
    }
    const item = listGatewayModels().data.find((model) => modelListItemMatchesRequest(model, requested));
    const known = knownModelDefaults(requested);
    return {
      contextWindow: positiveIntegerOrNull(item?.contextWindow)
        ?? positiveIntegerOrNull(known.contextWindow)
        ?? null,
      maxOutputTokens: positiveIntegerOrNull(item?.maxOutputTokens)
        ?? positiveIntegerOrNull(known.maxOutputTokens)
        ?? null,
      features: compactModelFeatures({
        ...(known.features || {}),
        ...(item?.features || {}),
      }),
    };
  }

  function modelBudgetForAppConnectionModel(modelId: string | null): { contextWindow: number | null; maxOutputTokens: number | null } {
    const entry = modelCatalogEntryForAppConnectionModel(modelId);
    return {
      contextWindow: entry.contextWindow,
      maxOutputTokens: entry.maxOutputTokens,
    };
  }

  function modelCatalogEntriesForAppConnection(
    modelIds: string[],
    profile: ModelGatewayAppConnectionProfile,
  ): Record<string, AppConnectionModelCatalogEntry> {
    const normalized = normalizeAppConnectionProfile(profile);
    return Object.fromEntries(appConnectionModelCatalogIds(modelIds, profile)
      .map((modelId) => {
        const entry = modelCatalogEntryForAppConnectionModel(modelId);
        return [modelId, {
          ...entry,
          contextWindow: safeAppConnectionContextWindow(
            mergeAppConnectionBudget(normalized.contextWindow, entry.contextWindow),
            normalized.contextWindow ? "profile" : "model",
          ),
          maxOutputTokens: mergeAppConnectionBudget(normalized.maxOutputTokens, entry.maxOutputTokens),
        }] as const;
      }));
  }

  function mergeAppConnectionBudget(profileValue: number | null, modelValue: number | null): number | null {
    if (profileValue && modelValue) return Math.min(profileValue, modelValue);
    return profileValue || modelValue || null;
  }

  function safeAppConnectionContextWindow(
    contextWindow: number | null,
    source: "profile" | "model" | "fallback",
  ): number | null {
    if (!contextWindow) return null;
    if (source === "profile") return contextWindow;
    return Math.max(1_024, Math.floor(contextWindow * 0.9));
  }

  function deriveCodexAutoCompactTokenLimit(contextWindow: number | null): number | null {
    if (!contextWindow) return null;
    return Math.max(1_024, Math.floor(contextWindow * 0.9));
  }

  function withResolvedAppConnectionBudget(profile: ModelGatewayAppConnectionProfile): ModelGatewayAppConnectionProfile {
    const normalized = normalizeAppConnectionProfile(profile);
    const budget = modelBudgetForAppConnectionModel(normalized.model);
    const contextSource = normalized.contextWindow ? "profile" : budget.contextWindow ? "model" : "fallback";
    const rawContextWindow = mergeAppConnectionBudget(normalized.contextWindow, budget.contextWindow)
      ?? DEFAULT_UNKNOWN_MODEL_CONTEXT_WINDOW;
    const contextWindow = safeAppConnectionContextWindow(rawContextWindow, contextSource)
      ?? DEFAULT_UNKNOWN_MODEL_CONTEXT_WINDOW;
    const maxOutputTokens = mergeAppConnectionBudget(normalized.maxOutputTokens, budget.maxOutputTokens)
      ?? DEFAULT_UNKNOWN_MODEL_MAX_OUTPUT_TOKENS;
    const derivedCompactLimit = deriveCodexAutoCompactTokenLimit(contextWindow);
    return {
      ...normalized,
      contextWindow,
      maxOutputTokens,
      autoCompactTokenLimit: mergeAppConnectionBudget(normalized.autoCompactTokenLimit, derivedCompactLimit),
    };
  }

  function buildAppConnectionContent(spec: ModelGatewayAppConnectionSpec, options: {
    key: string;
    profile: ModelGatewayAppConnectionProfile;
    modelIds: string[];
    source: string | null;
    modelCatalogEntries?: Record<string, AppConnectionModelCatalogEntry>;
  }): { content: string; error: string | null } {
    if (spec.id === "codex") {
      return {
        error: null,
        content: buildCodexConfig(options.source || "", {
          endpoint: spec.endpoint,
          key: options.key,
          profile: options.profile,
          modelCatalogPath: codexAppConnectionModelCatalogPath(spec.targetPath),
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
        modelCatalogEntries: options.modelCatalogEntries,
      });
    }
    return buildOpenClawConfig(options.source, spec.targetPath, {
      endpoint: spec.endpoint,
      key: options.key,
      profile: options.profile,
      modelIds: options.modelIds,
      modelCatalogEntries: options.modelCatalogEntries,
    });
  }

  function appConnectionConfigured(spec: ModelGatewayAppConnectionSpec, source: string | null): boolean {
    if (!source) return false;
    if (spec.id === "codex") {
      return source.includes(`[model_providers.${CODEX_GATEWAY_PROVIDER_ID}]`)
        && source.includes(`model_provider = "${CODEX_GATEWAY_PROVIDER_ID}"`)
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
      const gateway = isRecord(provider[GATEWAY_PROVIDER_ID]) ? provider[GATEWAY_PROVIDER_ID] : {};
      const optionsValue = isRecord(gateway.options) ? gateway.options : {};
      return normalizeString(optionsValue.baseURL) === spec.endpoint && Boolean(normalizeString(optionsValue.apiKey));
    }
    const models = isRecord(parsed.value.models) ? parsed.value.models : {};
    const providers = isRecord(models.providers) ? models.providers : {};
    const gateway = isRecord(providers[GATEWAY_PROVIDER_ID]) ? providers[GATEWAY_PROVIDER_ID] : {};
    return normalizeString(gateway.baseUrl) === spec.endpoint && Boolean(normalizeString(gateway.apiKey));
  }

  function buildAppConnection(spec: ModelGatewayAppConnectionSpec, options: {
    key: string | null;
    profile: ModelGatewayAppConnectionProfile;
    source: string | null;
    sourceError: string | null;
    modelIds: string[];
    modelCatalogEntries?: Record<string, AppConnectionModelCatalogEntry>;
  }): ModelGatewayAppConnection {
    const model = options.profile.model;
    const content = buildAppConnectionContent(spec, {
      key: APP_CONNECTION_REDACTED_KEY,
      profile: options.profile,
      modelIds: options.modelIds,
      source: options.source,
      modelCatalogEntries: options.modelCatalogEntries,
    });
    const lastBackupPath = latestAppConnectionBackupPath(paths.backups, spec.id);
    const targetExists = fs.existsSync(spec.targetPath);
    const currentContent = targetExists
      ? redactConnectionPreviewContent(spec.format, readTextIfExists(spec.targetPath) ?? "")
      : null;
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
        exists: targetExists,
        format: spec.format,
      },
      configured: appConnectionConfigured(spec, options.source),
      canApply: issues.length === 0,
      canRollback: Boolean(lastBackupPath),
      lastBackupPath,
      currentContent,
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
    const modelIds = gatewayAgentModelIds();
    const storedProfile = readRegistry().appConnectionProfile;
    const modelCatalogEntries = modelCatalogEntriesForAppConnection(modelIds, storedProfile);
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
          modelCatalogEntries,
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
    const modelIds = gatewayAgentModelIds();
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
    const modelCatalogEntries = modelCatalogEntriesForAppConnection(modelIds, storedProfile);
    const customContent = typeof payload.content === "string" ? payload.content : null;
    let writeContent: string;
    if (customContent !== null) {
      if (customContent.trim().length === 0) {
        throw new ModelGatewayServiceError(
          "model_gateway_app_connection_content_empty",
          "Custom app connection content must not be empty.",
          400,
        );
      }
      const contentBytes = Buffer.byteLength(customContent, "utf8");
      if (contentBytes > APP_CONNECTION_CONTENT_MAX_BYTES) {
        throw new ModelGatewayServiceError(
          "model_gateway_app_connection_content_too_large",
          `Custom content is too large (${contentBytes} bytes; limit ${APP_CONNECTION_CONTENT_MAX_BYTES} bytes).`,
          400,
        );
      }
      if (spec.format === "json") {
        try {
          JSON.parse(customContent);
        } catch (error) {
          throw new ModelGatewayServiceError(
            "model_gateway_app_connection_content_invalid_json",
            `Custom content is not valid JSON: ${error instanceof Error ? error.message : "parse error"}`,
            400,
          );
        }
      } else if (spec.format === "toml") {
        // No TOML parser dependency exists in this project (TOML is emitted by
        // hand via string templates), so we apply a conservative sanity check
        // rather than claiming full structural validation: reject NUL bytes and
        // invalid UTF-8. A proper TOML parser would enable stricter validation.
        if (customContent.includes("\u0000")) {
          throw new ModelGatewayServiceError(
            "model_gateway_app_connection_content_invalid_toml",
            "Custom TOML content must not contain NUL bytes.",
            400,
          );
        }
        if (customContent.includes("\uFFFD")) {
          // U+FFFD indicates the payload already lost data to a bad decode.
          throw new ModelGatewayServiceError(
            "model_gateway_app_connection_content_invalid_toml",
            "Custom TOML content is not valid UTF-8.",
            400,
          );
        }
      }
      // No-op guard: if the requested content is byte-identical to what is
      // already on disk, skip the write + backup entirely so we do not generate
      // a redundant backup. Returns `applied: false` to signal no change.
      if (source.source !== null && source.source === customContent) {
        const unchangedSource = readConnectionSource(spec.targetPath);
        return {
          ok: true,
          checkedAt: nowIso(),
          connection: buildAppConnection(spec, {
            key,
            profile,
            source: unchangedSource.source,
            sourceError: unchangedSource.error,
            modelIds,
            modelCatalogEntries,
          }),
          applied: false,
          backupPath: null,
        };
      }
      writeContent = customContent;
    } else {
      const next = buildAppConnectionContent(spec, {
        key,
        profile,
        modelIds,
        source: source.source,
        modelCatalogEntries,
      });
      if (next.error) {
        throw new ModelGatewayServiceError(
          "model_gateway_app_connection_target_invalid",
          next.error,
          400,
        );
      }
      writeContent = next.content;
    }
    const backupPath = backupFileIfExists(spec.targetPath, paths.backups, appId);
    if (customContent === null && spec.id === "codex") {
      writeTextAtomic(
        codexAppConnectionModelCatalogPath(spec.targetPath),
        buildCodexAppConnectionModelCatalog(listGatewayModels().data),
        0o600,
      );
    }
    writeTextAtomic(spec.targetPath, writeContent, 0o600);
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
        modelCatalogEntries,
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
    const modelIds = gatewayAgentModelIds();
    const modelCatalogEntries = modelCatalogEntriesForAppConnection(modelIds, profile);
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
          modelCatalogEntries,
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
    const requestedBackupId = typeof payload.backupId === "string" ? payload.backupId.trim() : "";
    let restoredFrom: string | null;
    if (requestedBackupId) {
      restoredFrom = resolveAppConnectionBackupPath(paths.backups, appId, requestedBackupId);
      if (!restoredFrom) {
        throw new ModelGatewayServiceError(
          "model_gateway_app_connection_backup_not_found",
          `Backup '${requestedBackupId}' was not found for '${appId}'.`,
          404,
        );
      }
    } else {
      restoredFrom = latestAppConnectionBackupPath(paths.backups, appId);
      if (!restoredFrom) {
        throw new ModelGatewayServiceError(
          "model_gateway_app_connection_backup_missing",
          `No backup is available for '${appId}'.`,
          404,
        );
      }
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
    const modelIds = gatewayAgentModelIds();
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

  function listAppConnectionBackups(appId: ModelGatewayAppConnectionId): ModelGatewayAppConnectionBackupsResponse {
    if (!normalizeAppConnectionId(appId)) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_not_found",
        `App connection '${appId}' was not found.`,
        404,
      );
    }
    const backupDir = appConnectionBackupDir(paths.backups);
    const prefix = `${appId}-`;
    const backups: ModelGatewayAppConnectionBackup[] = [];
    if (fs.existsSync(backupDir)) {
      for (const fileName of fs.readdirSync(backupDir)) {
        if (!fileName.startsWith(prefix) || !fileName.endsWith(".bak")) continue;
        const filePath = path.join(backupDir, fileName);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch {
          continue;
        }
        if (!stat.isFile()) continue;
        const createdAt = parseAppConnectionBackupTimestamp(fileName, appId)
          ?? new Date(stat.mtimeMs).toISOString();
        backups.push({
          id: fileName,
          createdAt,
          size: stat.size,
          format: appConnectionBackupFormat(fileName),
        });
      }
    }
    backups.sort((left, right) => {
      const byStamp = right.createdAt.localeCompare(left.createdAt);
      if (byStamp !== 0) return byStamp;
      // Same-millisecond collision: order by the deterministic suffix so the
      // most recently written backup still lists first.
      return appConnectionBackupSuffix(right.id, appId) - appConnectionBackupSuffix(left.id, appId);
    });
    return {
      ok: true,
      appId,
      backups,
    };
  }

  function readAppConnectionBackup(
    appId: ModelGatewayAppConnectionId,
    backupId: string,
  ): ModelGatewayAppConnectionBackupContentResponse {
    if (!normalizeAppConnectionId(appId)) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_not_found",
        `App connection '${appId}' was not found.`,
        404,
      );
    }
    const backupPath = resolveAppConnectionBackupPath(paths.backups, appId, backupId);
    if (!backupPath) {
      throw new ModelGatewayServiceError(
        "model_gateway_app_connection_backup_not_found",
        `Backup '${backupId}' was not found for '${appId}'.`,
        404,
      );
    }
    const format = appConnectionBackupFormat(backupId);
    const raw = readTextIfExists(backupPath) ?? "";
    return {
      ok: true,
      appId,
      backupId,
      format,
      content: redactConnectionPreviewContent(format, raw),
      redacted: true,
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
    if (next.apiKeyRef) {
      for (const endpointProfile of next.endpointProfiles) {
        if (endpointProfile.authStrategy !== "none" && !endpointProfile.apiKeyRef) {
          endpointProfile.apiKeyRef = next.apiKeyRef;
        }
      }
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

    const removedSecretRefs = new Set([
      removed?.apiKeyRef || "",
      ...(removed?.endpointProfiles || []).map((profile) => profile.apiKeyRef || ""),
    ].filter(Boolean));
    const remainingSecretRefs = new Set(registry.providers.flatMap((provider) => [
      provider.apiKeyRef || "",
      ...provider.endpointProfiles.map((profile) => profile.apiKeyRef || ""),
    ].filter(Boolean)));
    for (const ref of removedSecretRefs) {
      if (!remainingSecretRefs.has(ref)) setSecretValue(ref, null);
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

  function getProviderSecret(
    req: http.IncomingMessage | undefined,
    providerId: string,
  ): ModelGatewayProviderSecretResponse {
    requireManagement(req);
    const registry = readRegistry();
    const provider = findProvider(registry, providerId);
    if (!provider) {
      throw new ModelGatewayServiceError("model_gateway_provider_not_found", `Model Gateway provider '${providerId}' was not found.`, 404);
    }
    const ref = provider.apiKeyRef;
    const apiKey = ref ? readSecrets().secrets[ref]?.value || null : null;
    return {
      ok: true,
      providerId: provider.id,
      secret: secretSummary(ref),
      apiKey,
    };
  }

  function gatewaySmokeToolForChat(): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: "gateway_smoke_tool",
        description: "A no-op tool used only to verify client tool schema compatibility.",
        parameters: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
          additionalProperties: false,
        },
      },
    };
  }

  function gatewaySmokeToolForAnthropic(): Record<string, unknown> {
    return {
      name: "gateway_smoke_tool",
      description: "A no-op tool used only to verify Claude Code tool schema compatibility.",
      input_schema: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
        additionalProperties: false,
      },
    };
  }

  function buildGatewayRouteSmokePayload(
    scope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    model: string,
    input: string,
    stream = false,
    toolSmoke = false,
    toolResultSmoke = false,
    compatibilitySmoke = false,
    malformedSmoke = false,
    errorSmoke = false,
  ): Record<string, unknown> {
    if (errorSmoke) return buildGatewayRouteErrorSmokePayload(scope, routeId, model, input, stream);
    if (malformedSmoke) return buildGatewayRouteMalformedSmokePayload(scope, routeId, model, input, stream);
    if (compatibilitySmoke) return buildGatewayRouteCompatibilitySmokePayload(scope, routeId, model, input, stream);
    if (toolResultSmoke) return buildGatewayRouteToolResultSmokePayload(scope, routeId, model, input, stream);
    if (toolSmoke) return buildGatewayRouteToolSmokePayload(scope, routeId, model, input, stream);
    const prompt = `${input}\nDo not call tools. Reply with exactly ${MODEL_GATEWAY_SMOKE_SENTINEL}.`;
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 256,
        stream,
        messages: [{ role: "user", content: prompt }],
        ...(scope === "claude-code" ? {
          metadata: {
            user_id: "tracevane-gateway-smoke",
            session_id: "active-route-smoke",
          },
        } : {}),
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 256,
        stream,
        messages: [{ role: "user", content: prompt }],
      };
    }
    if (routeId === "openai_responses_compact") {
      return {
        model,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        stream,
        max_output_tokens: 256,
      };
    }
    return {
      model,
      input: prompt,
      stream,
      max_output_tokens: 256,
    };
  }

  function buildGatewayRouteToolSmokePayload(
    scope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    model: string,
    input: string,
    stream = false,
  ): Record<string, unknown> {
    const prompt = `${input}\nCall gateway_smoke_tool with value ${JSON.stringify(MODEL_GATEWAY_SMOKE_SENTINEL)}. Do not answer in text.`;
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 256,
        stream,
        metadata: {
          user_id: "tracevane-gateway-smoke",
          session_id: "active-route-tool-smoke",
        },
        messages: [{ role: "user", content: prompt }],
        tools: [gatewaySmokeToolForAnthropic()],
        tool_choice: { type: "tool", name: "gateway_smoke_tool" },
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 256,
        stream,
        messages: [{ role: "user", content: prompt }],
        tools: [gatewaySmokeToolForChat()],
        tool_choice: { type: "function", function: { name: "gateway_smoke_tool" } },
      };
    }
    const responsesInput = routeId === "openai_responses_compact"
      ? [{ role: "user", content: [{ type: "input_text", text: prompt }] }]
      : prompt;
    return {
      model,
      input: responsesInput,
      stream,
      max_output_tokens: 256,
      tools: [{
        type: "function",
        name: "gateway_smoke_tool",
        description: "A no-op tool used only to verify Responses tool schema compatibility.",
        parameters: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
          additionalProperties: false,
        },
      }],
      tool_choice: { type: "function", name: "gateway_smoke_tool" },
    };
  }

  function buildGatewayRouteCompatibilitySmokePayload(
    scope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    model: string,
    input: string,
    stream = false,
  ): Record<string, unknown> {
    const prompt = `${input}
Compatibility smoke: preserve the useful intent of any metadata, cache hints, annotations, citations, MCP/server-tool declarations, and unsupported client-only fields as context when needed, but do not call tools. Reply with exactly ${MODEL_GATEWAY_SMOKE_SENTINEL}.`;
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 256,
        stream,
        metadata: {
          user_id: "tracevane-gateway-smoke",
          session_id: "active-route-compatibility-smoke",
          tracevane_metadata_probe: "metadata must not be forwarded unsafely to Codex account Responses",
        },
        mcp_servers: [{
          name: "tracevane-smoke-mcp",
          type: "url",
          url: "https://example.invalid/tracevane-smoke-mcp",
          tool_configuration: {
            enabled: false,
            allowed_tools: ["gateway_smoke_tool"],
          },
        }],
        container_uploads: [{
          type: "file",
          file_id: "file_tracevane_gateway_smoke",
        }],
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: prompt,
            cache_control: { type: "ephemeral" },
            citations: [{
              type: "webpage_location",
              url: "https://example.invalid/tracevane-gateway-smoke",
              title: "Tracevane Gateway Smoke",
              cited_text: MODEL_GATEWAY_SMOKE_SENTINEL,
            }],
          }],
        }],
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 256,
        stream,
        metadata: {
          user_id: "tracevane-gateway-smoke",
          session_id: "active-route-compatibility-smoke",
          tracevane_metadata_probe: "chat metadata must become safe context for Responses-backed routes",
        },
        messages: [{
          role: "user",
          content: prompt,
          annotations: [{
            type: "url_citation",
            url: "https://example.invalid/tracevane-gateway-smoke",
            title: "Tracevane Gateway Smoke",
          }],
          cache_control: { type: "ephemeral" },
        }],
      };
    }
    const responsesInput = [{
      role: "user",
      content: [{
        type: "input_text",
        text: prompt,
        annotations: [{
          type: "url_citation",
          url: "https://example.invalid/tracevane-gateway-smoke",
          title: "Tracevane Gateway Smoke",
        }],
        cache_control: { type: "ephemeral" },
      }],
      metadata: {
        item_probe: "Responses item metadata must not trigger an upstream 400",
      },
    }];
    return {
      model,
      input: responsesInput,
      stream,
      max_output_tokens: 256,
      metadata: {
        user_id: "tracevane-gateway-smoke",
        session_id: "active-route-compatibility-smoke",
        tracevane_metadata_probe: "top-level Responses metadata must become safe context or be stripped",
      },
      store: false,
    };
  }


  function buildGatewayRouteErrorSmokePayload(
    scope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    model: string,
    input: string,
    stream = false,
  ): Record<string, unknown> {
    const prompt = `${input}\nError smoke: this diagnostic request asks the gateway to emit a structured protocol error without contacting upstream.`;
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 64,
        stream,
        metadata: {
          user_id: "tracevane-gateway-smoke",
          session_id: "active-route-error-smoke",
        },
        messages: [{ role: "user", content: prompt }],
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 64,
        stream,
        messages: [{ role: "user", content: prompt }],
      };
    }
    return {
      model,
      input: prompt,
      stream,
      max_output_tokens: 64,
    };
  }

  function buildGatewayRouteMalformedSmokePayload(
    scope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    model: string,
    input: string,
    stream = false,
  ): Record<string, unknown> {
    const finalPrompt = `${input}\nMalformed smoke: treat malformed tool history as inert context only. Do not call tools. Reply with exactly ${MODEL_GATEWAY_SMOKE_SENTINEL}.`;
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 256,
        stream,
        metadata: {
          user_id: "tracevane-gateway-smoke",
          session_id: "active-route-malformed-smoke",
        },
        messages: [{
          role: "user",
          content: [
            { type: "tool_use", name: "gateway_smoke_tool", input: { value: MODEL_GATEWAY_SMOKE_SENTINEL } },
            { type: "tool_result", content: MODEL_GATEWAY_SMOKE_SENTINEL },
            { type: "text", text: finalPrompt },
          ],
        }],
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 256,
        stream,
        messages: [
          { role: "assistant", content: null, tool_calls: [{ type: "function", function: { arguments: JSON.stringify({ value: MODEL_GATEWAY_SMOKE_SENTINEL }) } }] },
          { role: "tool", content: MODEL_GATEWAY_SMOKE_SENTINEL },
          { role: "function", content: MODEL_GATEWAY_SMOKE_SENTINEL },
          { role: "user", content: finalPrompt },
        ],
      };
    }
    return {
      model,
      input: [
        { type: "function_call", status: "completed", arguments: JSON.stringify({ value: MODEL_GATEWAY_SMOKE_SENTINEL }) },
        { type: "function_call", id: "fc_gateway_smoke_missing_name", call_id: "call_gateway_smoke_missing_name", status: "completed", arguments: JSON.stringify({ value: MODEL_GATEWAY_SMOKE_SENTINEL }) },
        { type: "function_call_output", id: "fco_gateway_smoke_missing_call", status: "completed", output: MODEL_GATEWAY_SMOKE_SENTINEL },
        { type: "custom_tool_call", id: "ctc_gateway_smoke_missing_call", status: "completed", input: MODEL_GATEWAY_SMOKE_SENTINEL },
        { role: "user", content: [{ type: "input_text", text: finalPrompt }] },
      ],
      stream,
      max_output_tokens: 256,
    };
  }

  function buildGatewayRouteToolResultSmokePayload(
    scope: ModelGatewayAppScope,
    routeId: ModelGatewayRouteId,
    model: string,
    input: string,
    stream = false,
  ): Record<string, unknown> {
    const finalPrompt = `${input}\nUse the gateway_smoke_tool result. Do not call tools again. Reply with exactly ${MODEL_GATEWAY_SMOKE_SENTINEL}.`;
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: 256,
        stream,
        metadata: {
          user_id: "tracevane-gateway-smoke",
          session_id: "active-route-tool-result-smoke",
        },
        messages: [
          { role: "user", content: `Call gateway_smoke_tool with value ${JSON.stringify(MODEL_GATEWAY_SMOKE_SENTINEL)}.` },
          {
            role: "assistant",
            content: [{
              type: "tool_use",
              id: "toolu_gateway_smoke",
              name: "gateway_smoke_tool",
              input: { value: MODEL_GATEWAY_SMOKE_SENTINEL },
            }],
          },
          {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: "toolu_gateway_smoke",
              content: MODEL_GATEWAY_SMOKE_SENTINEL,
            }],
          },
          { role: "user", content: finalPrompt },
        ],
        tools: [gatewaySmokeToolForAnthropic()],
        tool_choice: { type: "auto" },
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        max_tokens: 256,
        stream,
        messages: [
          { role: "user", content: `Call gateway_smoke_tool with value ${JSON.stringify(MODEL_GATEWAY_SMOKE_SENTINEL)}.` },
          {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_gateway_smoke",
              type: "function",
              function: { name: "gateway_smoke_tool", arguments: JSON.stringify({ value: MODEL_GATEWAY_SMOKE_SENTINEL }) },
            }],
          },
          { role: "tool", tool_call_id: "call_gateway_smoke", content: MODEL_GATEWAY_SMOKE_SENTINEL },
          { role: "user", content: finalPrompt },
        ],
        tools: [gatewaySmokeToolForChat()],
        tool_choice: "auto",
      };
    }
    const responsesInput = [
      { role: "user", content: [{ type: "input_text", text: `Call gateway_smoke_tool with value ${JSON.stringify(MODEL_GATEWAY_SMOKE_SENTINEL)}.` }] },
      {
        type: "function_call",
        id: "fc_gateway_smoke",
        call_id: "call_gateway_smoke",
        name: "gateway_smoke_tool",
        arguments: JSON.stringify({ value: MODEL_GATEWAY_SMOKE_SENTINEL }),
        status: "completed",
      },
      {
        type: "function_call_output",
        id: "fco_gateway_smoke",
        call_id: "call_gateway_smoke",
        output: MODEL_GATEWAY_SMOKE_SENTINEL,
        status: "completed",
      },
      { role: "user", content: [{ type: "input_text", text: finalPrompt }] },
    ];
    return {
      model,
      input: responsesInput,
      stream,
      max_output_tokens: 256,
      tools: [{
        type: "function",
        name: "gateway_smoke_tool",
        description: "A no-op tool used only to verify Responses tool result history compatibility.",
        parameters: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
          additionalProperties: false,
        },
      }],
    };
  }
  function extractTextFromGatewayRouteSmokeSse(responseText: string): string {
    return extractJsonPayloadsFromSseText(responseText)
      .flatMap((payload) => {
        if (!isRecord(payload)) return [];
        const eventType = normalizeString(payload.type);
        if (eventType === "content_block_delta" && isRecord(payload.delta)) {
          return [normalizeString(payload.delta.text)];
        }
        if (eventType === "response.output_text.delta") {
          return [normalizeString(payload.delta)];
        }
        if (eventType === "response.completed" && isRecord(payload.response)) {
          const output = Array.isArray(payload.response.output) ? payload.response.output : [];
          return output.flatMap((item) => isRecord(item) ? extractTextFromContentParts(item.content) : []);
        }
        if (Array.isArray(payload.choices)) {
          return payload.choices.flatMap((choice) => {
            if (!isRecord(choice)) return [];
            const delta = isRecord(choice.delta) ? choice.delta : {};
            const message = isRecord(choice.message) ? choice.message : {};
            return [
              ...(Array.isArray(delta.content) ? extractTextFromContentParts(delta.content) : []),
              ...(Array.isArray(message.content) ? extractTextFromContentParts(message.content) : []),
              normalizeString(delta.content),
              normalizeString(message.content),
              normalizeString(choice.text),
            ].filter(Boolean);
          });
        }
        return [];
      })
      .filter(Boolean)
      .join("\n");
  }

  function parseGatewayRouteSmokeError(responseText: string): Record<string, unknown> | null {
    const parsed = parseJsonObjectOrNull(responseText);
    if (isRecord(parsed) && isRecord(parsed.error)) return parsed.error;
    return extractJsonPayloadsFromSseText(responseText)
      .map(gatewayRouteSmokeErrorPayload)
      .find((payload): payload is Record<string, unknown> => isRecord(payload)) || null;
  }

  function gatewayRouteSmokeErrorPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null;
    if (isRecord(payload.error)) return payload.error;
    return payload.type === "error" ? payload : null;
  }

  function gatewayRouteSmokeHasToolCall(routeId: ModelGatewayRouteId, responseText: string): boolean {
    if (responseText.includes("gateway_smoke_tool")) {
      const parsed = parseJsonObjectOrNull(responseText);
      if (!parsed) return gatewayRouteSmokeSseHasToolCall(routeId, responseText) || responseText.includes('"name":"gateway_smoke_tool"');
      return gatewayRouteSmokeJsonHasToolCall(routeId, parsed) || responseText.includes('"name":"gateway_smoke_tool"');
    }
    return false;
  }

  function gatewayRouteSmokeJsonHasToolCall(routeId: ModelGatewayRouteId, parsed: Record<string, unknown>): boolean {
    if (routeId === "anthropic_messages") {
      const content = Array.isArray(parsed.content) ? parsed.content : [];
      return content.some((part) => isRecord(part) && part.type === "tool_use" && part.name === "gateway_smoke_tool");
    }
    if (routeId === "openai_chat_completions") {
      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      return choices.some((choice) => {
        if (!isRecord(choice)) return false;
        const message = isRecord(choice.message) ? choice.message : {};
        const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        return toolCalls.some((toolCall) => isRecord(toolCall)
          && isRecord(toolCall.function)
          && toolCall.function.name === "gateway_smoke_tool");
      });
    }
    const output = Array.isArray(parsed.output) ? parsed.output : [];
    return output.some((item) => isRecord(item)
      && (item.type === "function_call" || item.type === "custom_tool_call")
      && item.name === "gateway_smoke_tool");
  }

  function gatewayRouteSmokeSseHasToolCall(routeId: ModelGatewayRouteId, responseText: string): boolean {
    return extractJsonPayloadsFromSseText(responseText).some((payload) => {
      if (!isRecord(payload)) return false;
      if (routeId === "anthropic_messages") {
        const contentBlock = isRecord(payload.content_block) ? payload.content_block : {};
        return payload.type === "content_block_start"
          && contentBlock.type === "tool_use"
          && contentBlock.name === "gateway_smoke_tool";
      }
      if (routeId === "openai_chat_completions") {
        if (!Array.isArray(payload.choices)) return false;
        return payload.choices.some((choice) => {
          if (!isRecord(choice)) return false;
          const delta = isRecord(choice.delta) ? choice.delta : {};
          const message = isRecord(choice.message) ? choice.message : {};
          return chatLikeToolCallsContainGatewaySmoke(delta.tool_calls)
            || chatLikeToolCallsContainGatewaySmoke(message.tool_calls);
        });
      }
      const item = isRecord(payload.item) ? payload.item : null;
      if (item && (item.type === "function_call" || item.type === "custom_tool_call") && item.name === "gateway_smoke_tool") return true;
      const response = isRecord(payload.response) ? payload.response : null;
      if (!response) return false;
      return gatewayRouteSmokeJsonHasToolCall(routeId, response);
    });
  }

  function chatLikeToolCallsContainGatewaySmoke(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    return value.some((toolCall) => isRecord(toolCall)
      && isRecord(toolCall.function)
      && toolCall.function.name === "gateway_smoke_tool");
  }
  function extractGatewayRouteSmokeText(routeId: ModelGatewayRouteId, responseText: string): string {
    const parsed = parseJsonObjectOrNull(responseText);
    if (!parsed) return extractTextFromGatewayRouteSmokeSse(responseText) || previewText(responseText) || "";
    if (routeId === "anthropic_messages") {
      return extractTextFromContentParts(parsed.content).join("\n");
    }
    if (routeId === "openai_chat_completions") {
      if (!Array.isArray(parsed.choices)) return "";
      return parsed.choices
        .flatMap((choice) => {
          if (!isRecord(choice)) return [];
          const message = isRecord(choice.message) ? choice.message : {};
          return [
            ...extractTextFromContentParts(message.content),
            normalizeString(message.reasoning_content),
            normalizeString(choice.text),
          ].filter(Boolean);
        })
        .join("\n");
    }
    return extractProviderTestText({ apiFormat: "openai_responses" } as ModelGatewayProvider, responseText) || "";
  }

  function buildGatewayGenerateTextPayload(
    routeId: ModelGatewayRouteId,
    model: string,
    system: string,
    input: string,
    maxOutputTokens: number,
    temperature: number | null,
  ): Record<string, unknown> {
    const common = temperature === null ? {} : { temperature };
    if (routeId === "anthropic_messages") {
      return {
        model,
        max_tokens: maxOutputTokens,
        stream: false,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: input }],
        ...common,
      };
    }
    if (routeId === "openai_chat_completions") {
      return {
        model,
        stream: false,
        max_tokens: maxOutputTokens,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: input },
        ],
        ...common,
      };
    }
    const responsesInput = system
      ? `${system}\n\n${input}`
      : input;
    return {
      model,
      input: responsesInput,
      stream: false,
      max_output_tokens: maxOutputTokens,
      store: false,
      ...common,
    };
  }

  async function generateText(
    req: http.IncomingMessage | undefined,
    payload: ModelGatewayGenerateTextRequest,
  ): Promise<ModelGatewayGenerateTextResponse> {
    requireManagement(req);
    const scope = MODEL_GATEWAY_APP_SCOPES.includes(payload.scope as ModelGatewayAppScope)
      ? payload.scope as ModelGatewayAppScope
      : "codex";
    const routeId = defaultRouteIdForScope(scope);
    const routePath = ROUTES[routeId].paths[0] || "/v1/responses";
    const registry = readRegistry();
    const requestedModel = normalizeString(payload.model)
      || appConnectionRequestedModelForScope(registry, scope)
      || gatewayAgentModelIds()[0]
      || null;
    const headersForDecision = {
      "x-tracevane-app-scope": scope,
    };
    const decision = resolveRouteDecision("POST", routePath, headersForDecision, requestedModel);
    const providerId = decision.provider?.id || null;
    const model = requestedModel
      || decision.model?.resolved
      || decision.model?.requested
      || null;
    if (!model) {
      return {
        ok: false,
        checkedAt: nowIso(),
        text: "",
        model: null,
        providerId,
        statusCode: null,
        latencyMs: 0,
        route: decision,
        error: {
          code: "model_gateway_model_missing",
          message: "No Model Gateway model is available for text generation.",
        },
      };
    }
    if (!decision.provider || decision.mode === "missing-provider") {
      return {
        ok: false,
        checkedAt: nowIso(),
        text: "",
        model,
        providerId,
        statusCode: null,
        latencyMs: 0,
        route: decision,
        error: {
          code: "model_gateway_active_route_missing",
          message: decision.reason || `No active route provider is available for ${scope}.`,
        },
      };
    }
    const key = readGatewayClientSecret();
    if (registry.clientAuth.enabled && !key) {
      return {
        ok: false,
        checkedAt: nowIso(),
        text: "",
        model,
        providerId,
        statusCode: null,
        latencyMs: 0,
        route: decision,
        error: {
          code: "model_gateway_client_key_missing",
          message: "Gateway client auth is enabled but no local Gateway key is available.",
        },
      };
    }
    const input = normalizeString(payload.input);
    if (!input) {
      return {
        ok: false,
        checkedAt: nowIso(),
        text: "",
        model,
        providerId,
        statusCode: null,
        latencyMs: 0,
        route: decision,
        error: {
          code: "model_gateway_input_required",
          message: "Text generation input is required.",
        },
      };
    }

    const endpoint = getLifecycleStatus().endpointPolicy.preferredCliEndpoint;
    const targetUrl = new URL(routePath, `${stripTrailingV1(endpoint)}/`).toString();
    const headers = new Headers({
      "content-type": "application/json",
      "x-tracevane-app-scope": scope,
      "x-tracevane-internal-purpose": "git-commit-message",
    });
    if (key) headers.set("authorization", `Bearer ${key}`);
    if (scope === "claude-code") {
      headers.set("anthropic-beta", "fine-grained-tool-streaming-2025-05-14");
    }
    const maxOutputTokens = Math.max(64, Math.min(2_000, Math.floor(Number(payload.maxOutputTokens || 700))));
    const temperature = typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
      ? Math.max(0, Math.min(2, payload.temperature))
      : null;
    const timeoutMs = typeof payload.timeoutMs === "number"
      ? Math.max(1_000, Math.floor(payload.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    const startedAt = nowIso();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(buildGatewayGenerateTextPayload(
          routeId,
          model,
          normalizeString(payload.system),
          input,
          maxOutputTokens,
          temperature,
        )),
        signal: controller.signal,
      });
      const responseText = await response.text();
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const text = extractGatewayRouteSmokeText(routeId, responseText).trim();
      const responseProviderId = normalizeString(response.headers.get("x-openclaw-model-gateway-provider")) || providerId;
      const success = response.status >= 200 && response.status < 300 && Boolean(text);
      return {
        ok: success,
        checkedAt: nowIso(),
        text: success ? text : "",
        model,
        providerId: responseProviderId,
        statusCode: response.status,
        latencyMs,
        route: decision,
        error: success ? null : {
          code: "model_gateway_text_generation_failed",
          message: response.status >= 200 && response.status < 300
            ? "Model Gateway returned an empty text response."
            : `Model Gateway returned HTTP ${response.status}.${previewText(responseText) ? ` ${previewText(responseText)}` : ""}`,
        },
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt: nowIso(),
        text: "",
        model,
        providerId,
        statusCode: null,
        latencyMs: Math.max(0, Date.now() - Date.parse(startedAt)),
        route: decision,
        error: {
          code: "model_gateway_text_generation_failed",
          message: error instanceof Error ? error.message : "Model Gateway text generation failed.",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
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
    const registry = readRegistry();
    const payloadModel = normalizeString(payload.model);
    const model = payloadModel || appConnectionRequestedModelForScope(registry, scope);
    const headersForDecision = {
      "x-tracevane-app-scope": scope,
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
    const toolSmoke = payload.toolSmoke === true;
    const toolResultSmoke = payload.toolResultSmoke === true;
    const compatibilitySmoke = payload.compatibilitySmoke === true;
    const malformedSmoke = payload.malformedSmoke === true;
    const errorSmoke = payload.errorSmoke === true;
    const headers = new Headers({
      "content-type": "application/json",
      "x-tracevane-app-scope": scope,
      [MODEL_GATEWAY_DIAGNOSTIC_SMOKE_HEADER]: "1",
    });
    if (key) headers.set("authorization", `Bearer ${key}`);
    if (errorSmoke) headers.set(MODEL_GATEWAY_DIAGNOSTIC_ERROR_SMOKE_HEADER, "1");
    if (scope === "claude-code") {
      headers.set("anthropic-beta", "fine-grained-tool-streaming-2025-05-14");
    }
    const startedAt = nowIso();
    const controller = new AbortController();
    const stream = typeof payload.stream === "boolean"
      ? payload.stream
      : toolSmoke || toolResultSmoke || compatibilitySmoke || malformedSmoke || errorSmoke ? false : scope === "claude-code";
    const timeoutMs = typeof payload.timeoutMs === "number"
      ? Math.max(1_000, Math.floor(payload.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(buildGatewayRouteSmokePayload(
          scope,
          routeId,
          effectiveModel,
          normalizeString(payload.input, `Reply with ${MODEL_GATEWAY_SMOKE_SENTINEL}`),
          stream,
          toolSmoke,
          toolResultSmoke,
          compatibilitySmoke,
          malformedSmoke,
          errorSmoke,
        )),
        signal: controller.signal,
      });
      const responseText = await response.text();
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const responseTextContent = extractGatewayRouteSmokeText(routeId, responseText);
      const contentMatched = new RegExp(`\\b${MODEL_GATEWAY_SMOKE_SENTINEL}\\b`).test(responseTextContent)
        || responseTextContent.replace(/\s+/g, "").includes(MODEL_GATEWAY_SMOKE_SENTINEL);
      const toolMatched = gatewayRouteSmokeHasToolCall(routeId, responseText);
      const parsedError = parseGatewayRouteSmokeError(responseText);
      const errorMatched = errorSmoke
        && response.status >= 400
        && Boolean(parsedError?.code || parsedError?.message || parsedError?.type);
      const smokeDiagnostics = isRecord(parsedError?.diagnostics)
        ? parsedError.diagnostics as ModelGatewayErrorDiagnostics
        : undefined;
      const success = errorSmoke
        ? errorMatched
        : response.status >= 200 && response.status < 300 && (toolSmoke ? toolMatched : contentMatched);
      const responseProviderId = normalizeString(response.headers.get("x-openclaw-model-gateway-provider")) || providerId;
      const responsePreview = previewText(responseText);
      return {
        ok: success,
        providerId: responseProviderId,
        checkedAt: nowIso(),
        statusCode: response.status,
        latencyMs,
        route: decision,
        responsePreview,
        error: success ? null : {
          code: "model_gateway_active_route_smoke_failed",
          message: response.status >= 200 && response.status < 300
            ? toolSmoke
              ? `${stream ? "Streaming " : ""}Active route tool smoke did not return gateway_smoke_tool in the client protocol response.`
              : errorSmoke
                ? `${stream ? "Streaming " : ""}Active route error smoke unexpectedly returned HTTP ${response.status}.`
                : `${stream ? "Streaming " : ""}Active route smoke did not return ${MODEL_GATEWAY_SMOKE_SENTINEL} in the client protocol response.`
            : errorSmoke
              ? `${stream ? "Streaming " : ""}Active route error smoke returned HTTP ${response.status} without a structured error.${responsePreview ? ` ${responsePreview}` : ""}`
              : `${stream ? "Streaming " : ""}Active route ${toolSmoke ? "tool " : toolResultSmoke ? "tool result " : malformedSmoke ? "malformed " : ""}smoke returned HTTP ${response.status}.${responsePreview ? ` ${responsePreview}` : ""}`,
          ...(smokeDiagnostics ? { diagnostics: smokeDiagnostics } : {}),
        },
      };
    } catch (error) {
      const diagnostics = networkErrorDiagnostics(error, { proxyUrl: null, source: "none" });
      const rawMessage = error instanceof Error ? error.message : "Active route smoke request failed.";
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
          message: errorMessageWithNetworkDiagnostics(rawMessage, diagnostics),
          diagnostics,
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

    const endpointProfileId = normalizeString(payload.endpointProfileId || "");
    const endpointProfile = endpointProfileId
      ? provider.endpointProfiles.find((profile) => profile.id === endpointProfileId) || null
      : null;
    if (endpointProfileId && !endpointProfile) {
      throw new ModelGatewayServiceError(
        "model_gateway_endpoint_profile_not_found",
        `Model Gateway endpoint profile '${endpointProfileId}' was not found on provider '${providerId}'.`,
        404,
      );
    }

    const effectiveProvider = effectiveProviderForEndpointProfile(provider, endpointProfile);
    const routeId = MODEL_GATEWAY_ROUTE_IDS.includes(payload.routeId as ModelGatewayRouteId)
      ? payload.routeId as ModelGatewayRouteId
      : defaultTestRouteId(effectiveProvider);
    if (!routeId) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_test_unsupported",
        `Provider '${providerId}' uses ${effectiveProvider.apiFormat}, which does not yet have a Phase 1 test route.`,
        400,
      );
    }
    const requestedScope = MODEL_GATEWAY_APP_SCOPES.includes(payload.appScope as ModelGatewayAppScope)
      ? payload.appScope as ModelGatewayAppScope
      : ROUTES[routeId].appScope;
    if (!effectiveProvider.appScopes.includes(requestedScope)) {
      throw new ModelGatewayServiceError(
        "model_gateway_provider_scope_mismatch",
        endpointProfile
          ? `Model Gateway endpoint profile '${endpointProfile.id}' is not available for ${requestedScope}.`
          : `Model Gateway provider '${providerId}' is not available for ${requestedScope}.`,
        400,
      );
    }

    const route = buildProviderRouteDecision(effectiveProvider, routeId, requestedScope, null, endpointProfile);
    const startedAt = nowIso();
    const model = normalizeString(payload.model, effectiveProvider.models.defaultModel || effectiveProvider.models.models[0]?.id || "test-model");
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

    let secretResolution: ProviderSecretResolution;
    try {
      secretResolution = await resolveProviderSecret(effectiveProvider, undefined, {
        updateAccountStateOnAuthFailure: false,
      });
    } catch (error) {
      const authError = isModelGatewayServiceError(error)
        ? error
        : new ModelGatewayServiceError(
          "model_gateway_account_auth_failed",
          error instanceof Error ? error.message : "Model Gateway account authentication failed.",
          502,
        );
      route.accountRouting = accountRoutingFromServiceError(authError);
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: authError.statusCode,
        outcome: "failure",
        errorCode: authError.code,
        errorMessage: authError.message,
      }));
      updateProviderHealth(provider.id, false, null, authError.message, endpointProfile?.id || null);
      return {
        ok: false,
        providerId,
        checkedAt: nowIso(),
        statusCode: authError.statusCode,
        latencyMs: 0,
        route,
        responsePreview: null,
        error: {
          code: authError.code,
          message: authError.message,
        },
      };
    }
    const secret = secretResolution.secret;
    route.accountRouting = secretResolution.accountRouting;
    const selectedAccountForTest = secretResolution.account;
    if (selectedAccountForTest) {
      route.account = {
        id: selectedAccountForTest.id,
        accountHash: selectedAccountForTest.accountHash,
      };
    }
    if (effectiveProvider.authStrategy !== "none" && (!secret || isManagedProxyPlaceholderSecret(secret))) {
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
      updateProviderHealth(provider.id, false, null, errorMessage, endpointProfile?.id || null);
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
      : effectiveProvider.network.timeoutMs;
    const testKind = payload.kind === "vision" ? "vision" : "protocol";
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers({ "content-type": "application/json" });
    applyProviderAuth(headers, effectiveProvider, secret);
    let requestBody = JSON.stringify(buildProviderTestPayload(
      effectiveProvider,
      model,
      normalizeString(payload.input, "Return the word ok."),
      testKind,
    ));
    if (
      isCodexAccountBackedProvider(effectiveProvider)
      && normalizePathname(route.upstreamUrl || route.upstreamPath || "").endsWith("/responses")
    ) {
      requestBody = normalizeCodexAccountResponsesRequestInJsonText(requestBody) || requestBody;
      headers.set("accept", "text/event-stream");
    }
    setRequestLogUsageFallback(route, runtimeUsageForAttemptedRequest(routeId, requestBody));
    const upstreamUrl = route.upstreamUrl || effectiveProvider.baseUrl;
    try {
      const response = await fetch(upstreamUrl, withGatewayUpstreamNetwork(effectiveProvider, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      }, upstreamUrl, selectedAccountForTest));
      const responseText = await response.text();
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const firstByteMs = latencyMs;
      const httpSuccess = isProviderTestSuccess(response.status, null);
      const answerText = testKind === "vision" ? extractProviderTestText(effectiveProvider, responseText) : null;
      const success = testKind === "vision"
        ? httpSuccess && visionSmokeTextPassed(answerText)
        : httpSuccess;
      const errorMessage = success
        ? null
        : testKind === "vision"
          ? httpSuccess
            ? "Vision smoke did not identify the red test image; the selected protocol, endpoint, or model may not accept image input."
            : `Vision smoke returned HTTP ${response.status}; the selected protocol, endpoint, or model may not accept image input.`
          : `Provider test returned HTTP ${response.status}.`;
      if (testKind !== "vision") {
        updateProviderHealth(provider.id, success, latencyMs, errorMessage, endpointProfile?.id || null);
      }
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: response.status,
        outcome: requestOutcomeFromStatus(response.status, null, success),
        firstByteMs,
        errorCode: success ? null : testKind === "vision"
          ? "model_gateway_provider_vision_smoke_failed"
          : "model_gateway_provider_test_failed",
        errorMessage,
        usage: success
          ? runtimeUsageForSuccessfulRequest(routeId, requestBody, responseText)
          : runtimeUsageForAttemptedRequest(routeId, requestBody, responseText),
      }));
      return {
        ok: success,
        providerId,
        checkedAt: nowIso(),
        statusCode: response.status,
        latencyMs,
        route,
        responsePreview: testKind === "vision"
          ? answerText || previewText(responseText)
          : previewText(responseText),
        error: success ? null : {
          code: testKind === "vision"
            ? "model_gateway_provider_vision_smoke_failed"
            : "model_gateway_provider_test_failed",
          message: errorMessage || "Provider test failed.",
        },
      };
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const diagnostics = networkErrorDiagnostics(
        error,
        gatewayUpstreamProxySelection(effectiveProvider, upstreamUrl, selectedAccountForTest),
      );
      const rawMessage = error instanceof Error ? error.message : "Provider test request failed.";
      const message = errorMessageWithNetworkDiagnostics(rawMessage, diagnostics);
      if (testKind !== "vision") {
        updateProviderHealth(provider.id, false, latencyMs, message, endpointProfile?.id || null);
      }
      appendRequestLog(requestLogEntry({
        kind: "provider-test",
        startedAt,
        route,
        model,
        statusCode: null,
        outcome: "failure",
        errorCode: testKind === "vision"
          ? "model_gateway_provider_vision_smoke_failed"
          : "model_gateway_provider_test_failed",
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
          code: testKind === "vision"
            ? "model_gateway_provider_vision_smoke_failed"
            : "model_gateway_provider_test_failed",
          message,
          diagnostics,
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
        endpointProfile: null,
        model: null,
        upstreamPath: null,
        upstreamUrl: null,
        reason: "No Model Gateway route matched this request.",
        failoverReason: null,
      };
    }

    const appScope = normalizeRequestAppScope(headers, route.appScope);
    const registry = readRegistry();
    const selection = resolveProviderSelection(registry, appScope, route.routeId, requestedModel);
    const provider = selection.provider;
    const effectiveProvider = selection.effectiveProvider;
    if (!provider || !effectiveProvider) {
      return {
        routeId: route.routeId,
        method: normalizedMethod,
        requestedPath: pathname,
        appScope,
        mode: "missing-provider",
        provider: null,
        endpointProfile: null,
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

    const upstreamPath = endpointForRoute(route.routeId, effectiveProvider);
    const mode = routeMode(route.routeId, effectiveProvider);
    return {
      routeId: route.routeId,
      method: normalizedMethod,
      requestedPath: pathname,
      appScope,
      mode,
      provider: {
        id: provider.id,
        name: provider.name,
        apiFormat: effectiveProvider.apiFormat,
        authStrategy: effectiveProvider.authStrategy,
        baseUrl: effectiveProvider.baseUrl,
      },
      endpointProfile: selection.endpointProfile
        ? {
          id: selection.endpointProfile.id,
          name: selection.endpointProfile.name,
          apiFormat: selection.endpointProfile.apiFormat,
          authStrategy: selection.endpointProfile.authStrategy,
          baseUrl: selection.endpointProfile.baseUrl,
        }
        : null,
      model: {
        requested: normalizeString(requestedModel || "") || null,
        resolved: selection.resolvedModel || normalizeString(requestedModel || "") || null,
      },
      upstreamPath,
      upstreamUrl: joinBaseUrl(effectiveProvider.baseUrl, upstreamPath),
      reason: mode === "adapter-required"
        ? `Provider '${provider.id}' uses ${effectiveProvider.apiFormat}; ${route.routeId} needs a protocol adapter before passthrough.`
        : null,
      failoverReason: selection.failoverReason,
    };
  }

  async function handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startedAt = nowIso();
    const clientKeyHash = gatewayClientKeyHashFromRequest(req);
    try {
      requireGatewayClient(req);
    } catch (error) {
      const authError = isModelGatewayServiceError(error)
        ? error
        : new ModelGatewayServiceError("model_gateway_client_auth_failed", "Tracevane Gateway client authentication failed.", 401);
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
          endpointProfile: null,
          clientKeyHash,
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
      res.setHeader("WWW-Authenticate", "Bearer realm=\"Tracevane Gateway\"");
      sendJson(res, authError.statusCode, {
        error: {
          code: authError.code,
          message: authError.message,
        },
      });
      return;
    }
    const body = await readRequestBody(req);
    let bodyText = requestBodyIsJson(req) && body.byteLength ? body.toString("utf8") : undefined;
    const upstreamBodyBuffer = body.byteLength ? new Uint8Array(body) : undefined;
    const requestModel = extractModelFromRequestBody(req, body);
    const decision: ModelGatewayRouteDecision = {
      ...resolveRouteDecision(req.method || "GET", req.url || "/", req.headers, requestModel),
      clientKeyHash,
    };
    setRequestLogUsageFallback(
      decision,
      runtimeUsageForAttemptedRequest(
        decision.routeId,
        bodyText ?? (body.byteLength ? body.toString("utf8") : undefined),
      ),
    );
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
    const ownerProvider = findProvider(registry, decision.provider.id);
    const endpointProfile = decision.endpointProfile
      ? ownerProvider?.endpointProfiles.find((profile) => profile.id === decision.endpointProfile?.id) || null
      : null;
    if (!ownerProvider || (decision.endpointProfile && !endpointProfile) || !decision.upstreamUrl) {
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
    const provider = effectiveProviderForEndpointProfile(ownerProvider, endpointProfile);
    const selectedEndpointProfileId = endpointProfile?.id || null;
    let selectedAccountForRequest: ModelGatewayAccountEntry | null = null;
    const updateSelectedProviderHealth = (
      success: boolean,
      latencyMs: number | null,
      errorMessage: string | null,
      retryAfterUntil: string | null = null,
    ) => {
      updateProviderHealth(provider.id, success, latencyMs, errorMessage, selectedEndpointProfileId, retryAfterUntil);
      if (success && selectedAccountForRequest) {
        markCodexAccountReady(provider.id, selectedAccountForRequest.id);
      }
    };
    const setSelectedProviderHeaders = () => {
      res.setHeader("X-OpenClaw-Model-Gateway-Provider", provider.id);
      if (selectedAccountForRequest) {
        res.setHeader("X-OpenClaw-Model-Gateway-Account", selectedAccountForRequest.id);
      }
      if (selectedEndpointProfileId) {
        res.setHeader("X-OpenClaw-Model-Gateway-Endpoint", selectedEndpointProfileId);
      }
    };

    const useCodexResponsesChatAdapter = isCodexResponsesToChatAdapterTarget(decision);
    const useAnthropicMessagesChatAdapter = isChatToAnthropicMessagesAdapterTarget(decision);
    const useCodexResponsesAnthropicAdapter = isResponsesToAnthropicMessagesAdapterTarget(decision);
    const useChatResponsesAdapter = isChatToOpenAIResponsesAdapterTarget(decision);
    const useAnthropicMessagesChatProviderAdapter = isAnthropicMessagesToChatAdapterTarget(decision);
    const useAnthropicMessagesResponsesProviderAdapter = isAnthropicMessagesToOpenAIResponsesAdapterTarget(decision);
    const useCodexAccountImageGenerationAdapter = decision.routeId === "openai_images_generations"
      && isCodexAccountBackedProvider(provider);
    const useCodexAccountImageEditsUnsupported = decision.routeId === "openai_images_edits"
      && isCodexAccountBackedProvider(provider);
    const useCodexAccountAudioUnsupported = (
      decision.routeId === "openai_audio_transcriptions"
      || decision.routeId === "openai_audio_translations"
      || decision.routeId === "openai_audio_speech"
    ) && isCodexAccountBackedProvider(provider);
    const useAnthropicMessagesCountTokensLocalAdapter = decision.routeId === "anthropic_messages_count_tokens"
      && provider.apiFormat !== "anthropic_messages";
    const useCodexAccountResponsesUpstream = isCodexAccountBackedProvider(provider)
      && (
        normalizePathname(decision.upstreamUrl || decision.upstreamPath || "").endsWith("/responses")
        || useChatResponsesAdapter
        || useAnthropicMessagesResponsesProviderAdapter
      );
    const diagnosticSmokeRequest = readHeader(req.headers, MODEL_GATEWAY_DIAGNOSTIC_SMOKE_HEADER) === "1";
    const diagnosticErrorSmokeRequest = diagnosticSmokeRequest
      && readHeader(req.headers, MODEL_GATEWAY_DIAGNOSTIC_ERROR_SMOKE_HEADER) === "1";
    const shouldUpdateAccountStateFromRequest = !diagnosticSmokeRequest;
    if (diagnosticErrorSmokeRequest) {
      const stream = codexAccountRequestWantsStream(bodyText);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
        statusCode: 400,
        outcome: "failure",
        errorCode: "model_gateway_error_smoke",
        errorMessage: "Tracevane Gateway diagnostic error smoke.",
      }));
      setSelectedProviderHeaders();
      sendModelGatewayDiagnosticErrorSmoke(res, decision.routeId, stream);
      return;
    }
    if (
      decision.mode === "adapter-required"
      && !useCodexResponsesChatAdapter
      && !useAnthropicMessagesChatAdapter
      && !useCodexResponsesAnthropicAdapter
      && !useChatResponsesAdapter
      && !useAnthropicMessagesChatProviderAdapter
      && !useAnthropicMessagesResponsesProviderAdapter
      && !useCodexAccountImageGenerationAdapter
      && !useAnthropicMessagesCountTokensLocalAdapter
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
    if (useCodexAccountImageEditsUnsupported) {
      const message = "Codex account image edits are not exposed by the Codex Responses image_generation bridge yet; use an OpenAI-compatible image provider for /v1/images/edits.";
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
        statusCode: 501,
        outcome: "adapter-required",
        errorCode: "model_gateway_codex_account_image_edits_unsupported",
        errorMessage: message,
      }));
      sendJson(res, 501, {
        error: {
          code: "model_gateway_codex_account_image_edits_unsupported",
          message,
          details: {
            providerType: "codex-account",
            feasibility: "blocked-no-codex-image-edit-action-contract",
            reference: "Current verified Codex account contract supports image generation via Responses, but no stable Codex account image edit action contract has been verified.",
            alternatives: [
              "Use an OpenAI-compatible provider for /v1/images/edits.",
              "Use /v1/images/generations with gpt-image-2 for Codex account image generation.",
            ],
          },
          decision,
        },
      });
      return;
    }
    if (useCodexAccountAudioUnsupported) {
      const message = "Codex account REST audio routes are not exposed by the Codex backend yet; use an OpenAI-compatible audio provider for /v1/audio/*.";
      const isSpeechRoute = decision.routeId === "openai_audio_speech";
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
        statusCode: 501,
        outcome: "adapter-required",
        errorCode: "model_gateway_codex_account_audio_unsupported",
        errorMessage: message,
      }));
      sendJson(res, 501, {
        error: {
          code: "model_gateway_codex_account_audio_unsupported",
          message,
          details: {
            providerType: "codex-account",
            feasibility: "blocked-no-codex-account-rest-audio-contract",
            reference:
              "OpenAI documents request-based audio APIs, but no stable Codex account backend REST audio contract has been verified for Tracevane Gateway.",
            alternatives: [
              "Use an OpenAI-compatible provider for /v1/audio/transcriptions, /v1/audio/translations, or /v1/audio/speech.",
              isSpeechRoute
                ? "Use /v1/responses or /v1/chat/completions for Codex account text output until audio output is verified."
                : "Use /v1/responses or /v1/chat/completions for Codex account text workflows until audio input is verified.",
            ],
          },
          decision,
        },
      });
      return;
    }

    if (useAnthropicMessagesCountTokensLocalAdapter) {
      const inputTokens = estimateAnthropicMessagesCountTokens(bodyText);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
        statusCode: 200,
        outcome: "success",
        usage: {
          ...zeroRuntimeUsage(),
          inputTokens,
          totalTokens: inputTokens,
        },
      }));
      setSelectedProviderHeaders();
      sendJson(res, 200, { input_tokens: inputTokens });
      return;
    }

    let secretResolution: ProviderSecretResolution;
    try {
      secretResolution = await resolveProviderSecret(provider, {
        headers: req.headers,
        bodyText,
        routeId: decision.routeId,
        requestedPath: decision.requestedPath,
        requestedModel: requestModel,
      }, {
        reserveAccount: true,
        updateAccountStateOnAuthFailure: shouldUpdateAccountStateFromRequest,
      });
    } catch (error) {
      const authError = isModelGatewayServiceError(error)
        ? error
        : new ModelGatewayServiceError(
          "model_gateway_account_auth_failed",
          error instanceof Error ? error.message : "Model Gateway account authentication failed.",
          502,
        );
      decision.accountRouting = accountRoutingFromServiceError(authError);
      updateSelectedProviderHealth(false, null, authError.message);
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModel,
        statusCode: authError.statusCode,
        outcome: "failure",
        errorCode: authError.code,
        errorMessage: authError.message,
      }));
      sendJson(res, authError.statusCode, {
        error: {
          code: authError.code,
          message: authError.message,
          decision,
        },
      });
      return;
    }
    const secret = secretResolution.secret;
    decision.accountRouting = secretResolution.accountRouting;
    selectedAccountForRequest = secretResolution.account;
    bindReleaseToResponse(res, secretResolution.releaseAccount);
    if (selectedAccountForRequest) {
      decision.account = {
        id: selectedAccountForRequest.id,
        accountHash: selectedAccountForRequest.accountHash,
      };
    }
    const resolvedModel = decision.model?.resolved || null;
    if (resolvedModel && resolvedModel !== requestModel) {
      bodyText = replaceModelInJsonText(bodyText, resolvedModel);
    }
    const useCodexResponsesStreamingAdapter = useCodexResponsesChatAdapter && isCodexResponsesStreamingRequest(bodyText);
    const useCodexAccountResponsesClientStreamingPassthrough = decision.routeId === "openai_responses"
      && useCodexAccountResponsesUpstream
      && codexAccountRequestWantsStream(bodyText);
    const useCodexAccountResponsesNonStreamingAdapter = decision.routeId === "openai_responses"
      && isCodexAccountBackedProvider(provider)
      && !codexAccountRequestWantsStream(bodyText);
    let useChatResponsesStreamingAdapter = false;
    let useAnthropicMessagesChatStreamingAdapter = false;
    let useCodexResponsesAnthropicStreamingAdapter = false;
    let useCodexResponsesAnthropicSyntheticStreamingAdapter = false;
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
      updateSelectedProviderHealth(false, null, errorMessage);
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
    let codexResponsesChatCustomToolNames: string[] = [];
    let codexResponsesChatNamespaceToolNamesByChatName: Record<string, { namespace: string; name: string }> = {};
    let responsesAdapterStopSequences: string[] = [];
    let responsesAdapterAllowToolCalls = true;
    let chatAdapterLegacyFunctionCalls = false;
    let codexImageGenerationRequest: CodexAccountImageGenerationPreparedRequest | null = null;
    if (useCodexAccountImageGenerationAdapter) {
      try {
        codexImageGenerationRequest = buildCodexAccountImageGenerationRequest(bodyText, provider);
        upstreamBodyText = codexImageGenerationRequest.bodyText;
        requestModelForLog = codexImageGenerationRequest.imageModel;
        headers.set("content-type", "application/json");
      } catch (error) {
        const adapterError = isModelGatewayServiceError(error)
          ? error
          : new ModelGatewayServiceError(
            "model_gateway_images_adapter_failed",
            error instanceof Error ? error.message : "OpenAI Images generation adapter failed.",
            500,
          );
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModel,
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
    } else if (useChatResponsesAdapter) {
      try {
        const adapted = adaptChatCompletionRequestToResponses(bodyText, { allowStreaming: true });
        responsesAdapterStopSequences = adapted.stopSequences;
        responsesAdapterAllowToolCalls = adapted.allowToolCalls;
        chatAdapterLegacyFunctionCalls = adapted.legacyFunctionCalls;
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
            preserveReasoningEffort: true,
            suppressPreviousResponseIdContext: (enriched?.restoredCalls || 0) > 0,
            preserveToolOutputContent: true,
            reasoning: provider.reasoning,
          })
          : null;
        if (codexToChat) {
          codexResponsesChatCustomToolNames = codexToChat.customToolNames;
          codexResponsesChatNamespaceToolNamesByChatName = codexToChat.namespaceToolNamesByChatName;
        }
        const chatRequestBodyText = codexToChat
          ? JSON.stringify(codexToChat.chatRequest)
          : bodyText;
        const adapted = adaptChatCompletionRequestToAnthropicMessages(chatRequestBodyText, { allowStreaming: true });
        useCodexResponsesAnthropicSyntheticStreamingAdapter = useCodexResponsesAnthropicAdapter && adapted.stream;
        if (useCodexResponsesAnthropicSyntheticStreamingAdapter) adapted.anthropicRequest.stream = false;
        upstreamBodyText = JSON.stringify(adapted.anthropicRequest);
        chatAdapterLegacyFunctionCalls = useAnthropicMessagesChatAdapter && adapted.legacyFunctionCalls;
        requestModelForLog = adapted.model || requestModel;
        useAnthropicMessagesChatStreamingAdapter = useAnthropicMessagesChatAdapter && adapted.stream;
        useCodexResponsesAnthropicStreamingAdapter = useCodexResponsesAnthropicAdapter
          && adapted.stream
          && !useCodexResponsesAnthropicSyntheticStreamingAdapter;
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
        stripAnthropicRequestHeaders(headers);
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
        const chatAdapted = adaptAnthropicMessagesRequestToChatCompletion(bodyText, {
          preserveContentCacheControl: true,
          preserveContainerUploadsAsFiles: !useCodexAccountResponsesUpstream,
          preserveContextManagement: true,
          preserveMcpServers: !useCodexAccountResponsesUpstream,
          preserveServiceTier: true,
          preserveToolResultContent: true,
          preserveToolResultError: true,
        });
        const responsesAdapted = adaptChatCompletionRequestToResponses(JSON.stringify(chatAdapted.chatRequest), {
          allowStreaming: true,
        });
        responsesAdapterStopSequences = responsesAdapted.stopSequences;
        responsesAdapterAllowToolCalls = responsesAdapted.allowToolCalls;
        upstreamBodyText = JSON.stringify(responsesAdapted.responsesRequest);
        requestModelForLog = responsesAdapted.model || chatAdapted.model || requestModel;
        useAnthropicMessagesResponsesProviderStreamingAdapter = responsesAdapted.stream;
        headers.set("content-type", "application/json");
        stripAnthropicRequestHeaders(headers);
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
          suppressPreviousResponseIdContext: enriched.restoredCalls > 0,
          reasoning: provider.reasoning,
        });
        codexResponsesChatCustomToolNames = adapted.customToolNames;
        codexResponsesChatNamespaceToolNamesByChatName = adapted.namespaceToolNamesByChatName;
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

    const sanitizedOpenAIChat = provider.apiFormat === "openai_chat"
      ? sanitizeOpenAIChatUpstreamBody(upstreamBodyText, {
        allowMetadata: metadataBoolean(provider.metadata, ["openaiChatMetadataPassthrough", "openai_chat_metadata_passthrough"], false),
        reasoning: provider.reasoning,
      })
      : { bodyText: upstreamBodyText, removedFields: [] };
    upstreamBodyText = sanitizedOpenAIChat.bodyText ?? upstreamBodyText;
    if (sanitizedOpenAIChat.removedFields.length) {
      headers.set("content-type", "application/json");
    }
    const sanitizedOpenAIResponses = provider.apiFormat === "openai_responses"
      ? sanitizeOpenAIResponsesUpstreamBody(upstreamBodyText, {
        allowMetadata: !isCodexAccountBackedProvider(provider)
          && metadataBoolean(provider.metadata, ["openaiResponsesMetadataPassthrough", "openai_responses_metadata_passthrough"], false),
        preserveMetadataAsInputContext: isCodexAccountBackedProvider(provider),
      })
      : { bodyText: upstreamBodyText, removedFields: [] };
    upstreamBodyText = sanitizedOpenAIResponses.bodyText ?? upstreamBodyText;
    if (sanitizedOpenAIResponses.removedFields.length) {
      headers.set("content-type", "application/json");
    }
    if (provider.apiFormat === "anthropic_messages") {
      const sanitizedAnthropicMessages = sanitizeAnthropicMessagesUpstreamBody(upstreamBodyText, {
        allowMetadata: metadataBoolean(provider.metadata, ["anthropicMessagesMetadataPassthrough", "anthropic_messages_metadata_passthrough"], false),
      });
      upstreamBodyText = sanitizedAnthropicMessages.bodyText ?? upstreamBodyText;
      if (sanitizedAnthropicMessages.removedFields.length) {
        headers.set("content-type", "application/json");
      }
      const normalizedAnthropicBody = normalizeAnthropicReasoningInJsonText(upstreamBodyText);
      if (normalizedAnthropicBody !== upstreamBodyText) {
        upstreamBodyText = normalizedAnthropicBody;
        headers.set("content-type", "application/json");
      }
    }
    if (isCodexAccountBackedProvider(provider)) {
      if (useCodexAccountResponsesUpstream || isLikelyOpenAIResponsesRequestJsonText(upstreamBodyText)) {
        upstreamBodyText = normalizeCodexAccountResponsesRequestInJsonText(upstreamBodyText);
        headers.set("content-type", "application/json");
        headers.set("accept", "text/event-stream");
      } else {
        upstreamBodyText = normalizeCodexAccountInstructionsInJsonText(upstreamBodyText);
      }
    }
    const requestBodyTextForUsage = upstreamBodyText !== undefined
      ? upstreamBodyText
      : upstreamBodyBuffer ? Buffer.from(upstreamBodyBuffer).toString("utf8") : undefined;
    setRequestLogUsageFallback(
      decision,
      runtimeUsageForAttemptedRequest(decision.routeId, requestBodyTextForUsage),
    );

    try {
      const upstream = await fetch(decision.upstreamUrl, withGatewayUpstreamNetwork(provider, {
        method: req.method || "POST",
        headers,
        body: upstreamBodyText !== undefined ? upstreamBodyText : upstreamBodyBuffer,
      }, decision.upstreamUrl, selectedAccountForRequest));
      const responseHeaderMs = Math.max(0, Date.now() - Date.parse(startedAt));
      let firstByteMs: number | null = null;
      const markFirstByte = () => {
        if (firstByteMs === null) firstByteMs = Math.max(0, Date.now() - Date.parse(startedAt));
      };
      const firstByteMsForLog = () => firstByteMs ?? responseHeaderMs;
      const latencyMs = responseHeaderMs;
      const healthSuccess = isProviderHealthSuccess(upstream.status, null);
      const errorMessage = healthSuccess ? null : `Upstream returned HTTP ${upstream.status}.`;
      const upstreamRetryAfterUntil = retryAfterUntilIso(upstream.headers);
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
          updateSelectedProviderHealth(false, latencyMs, message, upstreamRetryAfterUntil);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: 502,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        setSelectedProviderHeaders();
        try {
          const streamingBody = observeReadableStreamFirstChunk(upstream.body, markFirstByte);
          const streamingAdapterOptions = {
            customToolNames: codexResponsesChatCustomToolNames,
            namespaceToolNamesByChatName: codexResponsesChatNamespaceToolNamesByChatName,
            stopSequences: responsesAdapterStopSequences,
            allowToolCalls: responsesAdapterAllowToolCalls,
            legacyFunctionCalls: chatAdapterLegacyFunctionCalls,
          };
          const streamingResult = await streamingAdapter.write(streamingBody, res, requestModelForLog, streamingAdapterOptions);
          if ((useCodexResponsesStreamingAdapter || useCodexResponsesAnthropicStreamingAdapter) && isRecord(streamingResult)) {
            const responseId = normalizeString(streamingResult.responseId) || normalizeString(streamingResult.id);
            codexHistory.recordResponse({
              id: responseId,
              output: streamingResult.output,
            }, {
              requestBodyText: codexHistoryRecordBodyText,
            });
          }
          updateSelectedProviderHealth(true, latencyMs, null);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: upstream.status,
            outcome: "success",
            firstByteMs: firstByteMsForLog(),
            errorCode: null,
            errorMessage: null,
            usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, streamingResult),
          }));
        } catch (error) {
          const streamError = streamAdapterErrorEnvelope(error);
          const message = streamError?.message || (error instanceof Error ? error.message : streamingAdapter.adapterFailedMessage);
          const adapterStatusCode = upstreamErrorStatusCodeForHealth(streamError?.code || streamError?.type, message);
          const adapterHealthSuccess = providerHealthSuccessForUpstreamResult(
            adapterStatusCode,
            streamError?.code || streamError?.type || null,
            message,
          );
          const surfaceUpstreamError = providerHealthNeutralUpstreamError(streamError?.code || streamError?.type, message);
          const surfacedErrorCode = surfaceUpstreamError
            ? streamError?.code || streamError?.type || streamingAdapter.adapterFailedCode
            : streamingAdapter.adapterFailedCode;
          if (streamError && isCodexAccountBackedProvider(provider)) {
            updateCodexAccountAfterUpstreamFailure(
              provider,
              selectedAccountForRequest,
              adapterStatusCode,
              {
                message,
                type: streamError.type || streamingAdapter.adapterFailedCode,
                code: streamError.code || streamError.type || streamingAdapter.adapterFailedCode,
              },
              upstream.headers,
              { updateAccountState: shouldUpdateAccountStateFromRequest },
            );
          }
          updateSelectedProviderHealth(
            adapterHealthSuccess,
            latencyMs,
            message,
            upstreamRetryAfterUntil,
          );
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterStatusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
            errorCode: streamError?.code || streamError?.type || streamingAdapter.adapterFailedCode,
            errorMessage: message,
          }));
          if (!res.headersSent) {
            sendJson(res, adapterStatusCode, {
              error: {
                code: surfacedErrorCode,
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

      if (useCodexAccountResponsesClientStreamingPassthrough && upstream.status >= 200 && upstream.status < 300) {
        if (!upstream.body) {
          const message = "Codex account Responses upstream did not return a readable stream.";
          updateSelectedProviderHealth(false, latencyMs, message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: 502,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
            errorCode: "model_gateway_codex_account_stream_body_missing",
            errorMessage: message,
          }));
          sendJson(res, 502, {
            error: {
              code: "model_gateway_codex_account_stream_body_missing",
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
        setSelectedProviderHeaders();
        const streamUpstreamError: { current: { message: string; type: string; code: string } | null } = { current: null };
        const streamUsagePayloads: unknown[] = [];
        try {
          await pipeReadableStreamToServerResponse(upstream.body, res, {
            onFirstChunk: markFirstByte,
            onJsonPayload: (payload) => {
              streamUsagePayloads.push(payload);
              if (streamUpstreamError.current) return;
              const error = responsesStreamErrorFromPayload(payload);
              if (!error) return;
              streamUpstreamError.current = error;
              updateCodexAccountAfterUpstreamFailure(
                provider,
                selectedAccountForRequest,
                upstream.status,
                error,
                upstream.headers,
                { updateAccountState: shouldUpdateAccountStateFromRequest },
              );
            },
          });
          const observedStreamError = streamUpstreamError.current;
          updateSelectedProviderHealth(
            observedStreamError
              ? providerHealthSuccessForUpstreamResult(upstream.status, observedStreamError.code || observedStreamError.type, observedStreamError.message)
              : true,
            latencyMs,
            observedStreamError?.message || null,
            observedStreamError ? upstreamRetryAfterUntil : null,
          );
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: upstream.status,
            outcome: observedStreamError ? "failure" : "success",
            firstByteMs: firstByteMsForLog(),
            errorCode: observedStreamError?.code || null,
            errorMessage: observedStreamError?.message || null,
            usage: observedStreamError
              ? runtimeUsageForAttemptedRequest(decision.routeId, requestBodyTextForUsage, streamUsagePayloads)
              : runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, streamUsagePayloads),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Codex account Responses stream passthrough failed.";
          updateSelectedProviderHealth(false, latencyMs, message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: 502,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
            errorCode: "model_gateway_codex_account_stream_failed",
            errorMessage: message,
          }));
          if (!res.headersSent) {
            sendJson(res, 502, {
              error: {
                code: "model_gateway_codex_account_stream_failed",
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
      let passthroughUpstreamError: ReturnType<typeof normalizeAdaptedUpstreamError> | null = null;
      if (upstream.status < 200 || upstream.status >= 300) {
        const normalizedError = normalizeAdaptedUpstreamError(
          responseText,
          upstream.status,
          errorMessage || `Upstream returned HTTP ${upstream.status}.`,
        );
        passthroughUpstreamError = normalizedError;
        if (
          useCodexResponsesChatAdapter
          || useCodexResponsesAnthropicAdapter
          || useCodexAccountImageGenerationAdapter
          || useCodexAccountResponsesClientStreamingPassthrough
          || useCodexAccountResponsesNonStreamingAdapter
        ) {
          updateCodexAccountAfterUpstreamFailure(
            provider,
            selectedAccountForRequest,
            upstream.status,
            normalizedError.error,
            upstream.headers,
            { updateAccountState: shouldUpdateAccountStateFromRequest },
          );
          updateSelectedProviderHealth(healthSuccess, latencyMs, normalizedError.error.message, upstreamRetryAfterUntil);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: upstream.status,
            outcome: requestOutcomeFromStatus(upstream.status, null, healthSuccess),
            firstByteMs: firstByteMsForLog(),
            errorCode: String(normalizedError.error.code || "model_gateway_upstream_status"),
            errorMessage: normalizedError.error.message,
            usage: runtimeUsageForAttemptedRequest(decision.routeId, requestBodyTextForUsage, responseText),
          }));
          setSelectedProviderHeaders();
          sendJson(res, upstream.status, normalizedError);
          return;
        }
        if (shouldNormalizePassthroughUpstreamError(upstream.headers, responseText)) {
          updateSelectedProviderHealth(healthSuccess, latencyMs, normalizedError.error.message, upstreamRetryAfterUntil);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: upstream.status,
            outcome: requestOutcomeFromStatus(upstream.status, null, healthSuccess),
            firstByteMs: firstByteMsForLog(),
            errorCode: String(normalizedError.error.code || "model_gateway_upstream_status"),
            errorMessage: normalizedError.error.message,
          }));
          setSelectedProviderHeaders();
          sendJson(res, upstream.status, normalizedError);
          return;
        }
      }
      if (useCodexAccountResponsesNonStreamingAdapter && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          adaptedResponse = buildCodexAccountResponsesJsonFromSseText(responseText);
        } catch (error) {
          const adapterError = isModelGatewayServiceError(error)
            ? error
            : new ModelGatewayServiceError(
              "model_gateway_codex_account_response_invalid",
              error instanceof Error ? error.message : "Codex account Responses adapter could not parse upstream SSE.",
              502,
            );
          updateCodexAccountAfterUpstreamFailure(
            provider,
            selectedAccountForRequest,
            adapterError.statusCode,
            { code: adapterError.code, message: adapterError.message, type: adapterError.code },
            undefined,
            { updateAccountState: shouldUpdateAccountStateFromRequest },
          );
          updateSelectedProviderHealth(
            providerHealthSuccessForUpstreamResult(adapterError.statusCode, adapterError.code, adapterError.message),
            latencyMs,
            adapterError.message,
          );
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        updateSelectedProviderHealth(true, latencyMs, null);
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
          firstByteMs: firstByteMsForLog(),
          errorCode: null,
          errorMessage: null,
          usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, adaptedResponse),
        }));
        setSelectedProviderHeaders();
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if (useCodexAccountImageGenerationAdapter && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          adaptedResponse = buildImagesApiResponseFromResponsesText(
            responseText,
            codexImageGenerationRequest?.responseFormat || "b64_json",
          );
        } catch (error) {
          const adapterError = isModelGatewayServiceError(error)
            ? error
            : new ModelGatewayServiceError(
              "model_gateway_images_response_invalid",
              error instanceof Error ? error.message : "OpenAI Images adapter could not parse the Responses image output.",
              502,
            );
          updateCodexAccountAfterUpstreamFailure(
            provider,
            selectedAccountForRequest,
            adapterError.statusCode,
            { code: adapterError.code, message: adapterError.message, type: adapterError.code },
            undefined,
            { updateAccountState: shouldUpdateAccountStateFromRequest },
          );
          updateSelectedProviderHealth(false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        updateSelectedProviderHealth(true, latencyMs, null);
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          firstByteMs: firstByteMsForLog(),
          errorCode: null,
          errorMessage: null,
          usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, adaptedResponse),
        }));
        setSelectedProviderHeaders();
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if (useChatResponsesAdapter && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          adaptedResponse = adaptResponsesToChatCompletion(
            parseOpenAIResponsesUpstreamBody(responseText, { codexAccountSse: useCodexAccountResponsesUpstream }),
            requestModelForLog,
            {
              stopSequences: responsesAdapterStopSequences,
              allowToolCalls: responsesAdapterAllowToolCalls,
              legacyFunctionCalls: chatAdapterLegacyFunctionCalls,
            },
          );
        } catch (error) {
          const adapterError = error instanceof OpenAIResponsesChatAdapterError
            ? error
            : new OpenAIResponsesChatAdapterError(
              "model_gateway_responses_chat_response_invalid",
              error instanceof Error ? error.message : "OpenAI Chat adapter could not parse the Responses response.",
              502,
            );
          updateSelectedProviderHealth(false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        updateSelectedProviderHealth(true, latencyMs, null);
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          firstByteMs: firstByteMsForLog(),
          errorCode: null,
          errorMessage: null,
          usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, adaptedResponse),
        }));
        setSelectedProviderHeaders();
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if ((useAnthropicMessagesChatAdapter || useCodexResponsesAnthropicAdapter) && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          const chatCompletion = adaptAnthropicMessagesResponseToChatCompletion(
            JSON.parse(responseText) as unknown,
            requestModelForLog,
            { legacyFunctionCalls: chatAdapterLegacyFunctionCalls },
          );
          adaptedResponse = useCodexResponsesAnthropicAdapter
            ? adaptChatCompletionToCodexResponse(chatCompletion, requestModelForLog, {
              customToolNames: codexResponsesChatCustomToolNames,
              namespaceToolNamesByChatName: codexResponsesChatNamespaceToolNamesByChatName,
            })
            : chatCompletion;
        } catch (error) {
          const adapterError = error instanceof AnthropicMessagesChatAdapterError || error instanceof CodexResponsesChatAdapterError
            ? error
            : new AnthropicMessagesChatAdapterError(
              "model_gateway_anthropic_chat_response_invalid",
              error instanceof Error ? error.message : "Model Gateway adapter could not parse the Anthropic Messages response.",
              502,
            );
          updateSelectedProviderHealth(false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        updateSelectedProviderHealth(true, latencyMs, null);
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
          firstByteMs: firstByteMsForLog(),
          errorCode: null,
          errorMessage: null,
          usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, adaptedResponse),
        }));
        setSelectedProviderHeaders();
        if (useCodexResponsesAnthropicSyntheticStreamingAdapter) {
          setCorsHeaders(res);
          res.statusCode = upstream.status;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          writeCodexResponsesSseFromResponse(adaptedResponse, res, requestModelForLog);
          res.end();
          return;
        }
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
          const upstreamJson = parseOpenAIResponsesUpstreamBody(responseText, {
            codexAccountSse: useCodexAccountResponsesUpstream && useAnthropicMessagesResponsesProviderAdapter,
          });
          const chatCompletion = useAnthropicMessagesResponsesProviderAdapter
            ? adaptResponsesToChatCompletion(upstreamJson, requestModelForLog, {
              preserveMcpToolCalls: true,
              allowToolCalls: responsesAdapterAllowToolCalls,
            })
            : upstreamJson;
          adaptedResponse = adaptChatCompletionResponseToAnthropicMessages(chatCompletion, requestModelForLog, {
            stopSequences: responsesAdapterStopSequences,
          });
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
          updateSelectedProviderHealth(false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        updateSelectedProviderHealth(true, latencyMs, null);
        appendRequestLog(requestLogEntry({
          kind: "gateway-request",
          startedAt,
          route: decision,
          model: requestModelForLog,
          statusCode: upstream.status,
          outcome: "success",
          firstByteMs: firstByteMsForLog(),
          errorCode: null,
          errorMessage: null,
          usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, adaptedResponse),
        }));
        setSelectedProviderHeaders();
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }
      if (useCodexResponsesChatAdapter && upstream.status >= 200 && upstream.status < 300) {
        let adaptedResponse: Record<string, unknown>;
        try {
          adaptedResponse = adaptChatCompletionToCodexResponse(JSON.parse(responseText) as unknown, requestModelForLog, {
            customToolNames: codexResponsesChatCustomToolNames,
            namespaceToolNamesByChatName: codexResponsesChatNamespaceToolNamesByChatName,
          });
        } catch (error) {
          const adapterError = error instanceof CodexResponsesChatAdapterError
            ? error
            : new CodexResponsesChatAdapterError(
              "model_gateway_codex_chat_response_invalid",
              error instanceof Error ? error.message : "Codex Responses adapter could not parse the Chat response.",
              502,
            );
          updateSelectedProviderHealth(false, latencyMs, adapterError.message);
          appendRequestLog(requestLogEntry({
            kind: "gateway-request",
            startedAt,
            route: decision,
            model: requestModelForLog,
            statusCode: adapterError.statusCode,
            outcome: "failure",
            firstByteMs: firstByteMsForLog(),
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
        updateSelectedProviderHealth(true, latencyMs, null);
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
          firstByteMs: firstByteMsForLog(),
          errorCode: null,
          errorMessage: null,
          usage: runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, adaptedResponse),
        }));
        setSelectedProviderHeaders();
        sendJson(res, upstream.status, adaptedResponse);
        return;
      }

      const passthroughErrorMessage = passthroughUpstreamError?.error.message || errorMessage;
      updateSelectedProviderHealth(
        healthSuccess,
        latencyMs,
        passthroughErrorMessage,
        healthSuccess ? null : upstreamRetryAfterUntil,
      );
      appendRequestLog(requestLogEntry({
        kind: "gateway-request",
        startedAt,
        route: decision,
        model: requestModelForLog,
        statusCode: upstream.status,
        outcome: requestOutcomeFromStatus(upstream.status, null, healthSuccess),
        firstByteMs: firstByteMsForLog(),
        errorCode: healthSuccess ? null : String(passthroughUpstreamError?.error.code || "model_gateway_upstream_status"),
        errorMessage: passthroughErrorMessage,
        usage: upstream.status >= 200 && upstream.status < 300
          ? runtimeUsageForSuccessfulRequest(decision.routeId, requestBodyTextForUsage, responseText)
          : runtimeUsageForAttemptedRequest(decision.routeId, requestBodyTextForUsage, responseText),
      }));
      setCorsHeaders(res);
      res.statusCode = upstream.status;
      for (const [key, value] of Object.entries(safeResponseHeaders(upstream.headers))) {
        res.setHeader(key, value);
      }
      if (!res.hasHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      setSelectedProviderHeaders();
      res.end(responseBody);
    } catch (error) {
      const latencyMs = Math.max(0, Date.now() - Date.parse(startedAt));
      const rawMessage = error instanceof Error ? error.message : "Model Gateway upstream request failed.";
      const diagnostics = networkErrorDiagnostics(
        error,
        gatewayUpstreamProxySelection(provider, decision.upstreamUrl || provider.baseUrl, selectedAccountForRequest),
      );
      const message = errorMessageWithNetworkDiagnostics(rawMessage, diagnostics);
      updateSelectedProviderHealth(false, latencyMs, message);
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
          diagnostics,
          decision,
        },
      });
    }
  }

  repairManagedCodexAccountProviderCatalogs();

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
    listAppConnectionBackups,
    readAppConnectionBackup,
    listGatewayModels,
    getGatewayModel,
    listGatewayAnthropicModels,
    getGatewayAnthropicModel,
    getRuntime,
    getUsageLedger,
    getDaemonService,
    manageDaemonService,
    detectProvider,
    startCodexAccountLogin,
    pollCodexAccountLogin,
    upsertProvider,
    updateProviderAccount,
    refreshProviderAccount,
    deleteProvider,
    setActiveProvider,
    getProviderSecret,
    setProviderSecret,
    resetProviderHealth,
    generateText,
    testActiveRoute,
    testProvider,
    resolveRouteDecision,
    handleGatewayRequest,
  };
}
