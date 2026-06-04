import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  MODEL_GATEWAY_API_FORMATS,
  MODEL_GATEWAY_APP_SCOPES,
  MODEL_GATEWAY_AUTH_STRATEGIES,
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  MODEL_GATEWAY_PROVIDER_CATEGORIES,
  MODEL_GATEWAY_ROUTE_IDS,
  type ModelGatewayApiFormat,
  type ModelGatewayAppScope,
  type ModelGatewayAuthStrategy,
  type ModelGatewayProvider,
  type ModelGatewayProviderCategory,
  type ModelGatewayProviderHealth,
  type ModelGatewayProviderInput,
  type ModelGatewayProviderModelCatalog,
  type ModelGatewayProviderNetwork,
  type ModelGatewayProviderView,
  type ModelGatewayProvidersResponse,
  type ModelGatewayRegistryState,
  type ModelGatewayRouteDecision,
  type ModelGatewayRouteId,
  type ModelGatewayRouteMode,
  type ModelGatewaySecretState,
  type ModelGatewaySecretSummary,
  type ModelGatewaySetProviderSecretRequest,
  type ModelGatewayStatusResponse,
  type ModelGatewayUpsertProviderRequest,
} from "../../../../types/model-gateway.js";
import { sendJson, setCorsHeaders } from "../../core/http.js";
import { readJsonFile } from "../../core/state.js";
import { isStudioGatewayHttpAuthorized } from "../../gateway-http-auth.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_STREAMING_FIRST_BYTE_TIMEOUT_MS = 30_000;
const DEFAULT_STREAMING_IDLE_TIMEOUT_MS = 120_000;

type HeaderMap = http.IncomingHttpHeaders | Record<string, string | string[] | undefined> | Headers;

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

  if (routeId === "openai_chat_completions") return "/v1/chat/completions";
  if (routeId === "openai_responses") {
    return provider.apiFormat === "openai_chat" ? "/v1/chat/completions" : "/v1/responses";
  }
  if (routeId === "openai_responses_compact") {
    return provider.apiFormat === "openai_chat" ? "/v1/chat/completions" : "/v1/responses/compact";
  }
  if (routeId === "anthropic_messages") {
    if (provider.apiFormat === "openai_chat") return "/v1/chat/completions";
    if (provider.apiFormat === "openai_responses") return "/v1/responses";
    return "/v1/messages";
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
    return "adapter-required";
  }
  if (routeId === "anthropic_messages") {
    return provider.apiFormat === "anthropic_messages" ? "passthrough" : "adapter-required";
  }
  return "unsupported";
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

export interface ModelGatewayService {
  getStatus(): ModelGatewayStatusResponse;
  listProviders(): ModelGatewayProvidersResponse;
  upsertProvider(req: http.IncomingMessage | undefined, payload: ModelGatewayUpsertProviderRequest): ModelGatewayProviderView;
  setProviderSecret(req: http.IncomingMessage | undefined, providerId: string, payload: ModelGatewaySetProviderSecretRequest): ModelGatewayProviderView;
  resolveRouteDecision(method: string, requestedPath: string, headers?: HeaderMap): ModelGatewayRouteDecision;
  handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
}

export function createModelGatewayService(config: StudioServerConfig): ModelGatewayService {
  const paths = resolveModelGatewayPaths(config);

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

  function resolveProvider(registry: ModelGatewayRegistryState, appScope: ModelGatewayAppScope): ModelGatewayProvider | null {
    const activeId = registry.activeProviders[appScope];
    if (activeId) {
      const active = findProvider(registry, activeId);
      if (active?.enabled && active.appScopes.includes(appScope)) return active;
    }

    return registry.providers
      .filter((provider) => provider.enabled)
      .filter((provider) => provider.appScopes.includes(appScope))
      .sort((left, right) => left.failover.priority - right.failover.priority || left.name.localeCompare(right.name))
      [0] || null;
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

  function getStatus(): ModelGatewayStatusResponse {
    const registry = readRegistry();
    const openCircuits = registry.providers.filter((provider) => provider.health.circuitState === "open").length;
    return {
      ok: true,
      checkedAt: nowIso(),
      phase: "phase-1-control-plane",
      listener: {
        host: MODEL_GATEWAY_DEFAULT_HOST,
        port: MODEL_GATEWAY_DEFAULT_PORT,
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
      healthSummary: {
        okProviders: registry.providers.filter((provider) => provider.enabled && provider.health.circuitState === "closed").length,
        degradedProviders: registry.providers.filter((provider) => provider.health.lastFailureAt || provider.health.circuitState !== "closed").length,
        openCircuits,
      },
    };
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
      };
    }

    const appScope = normalizeRequestAppScope(headers, route.appScope);
    const registry = readRegistry();
    const provider = resolveProvider(registry, appScope);
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
        reason: `No active Model Gateway provider is configured for ${appScope}.`,
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
    };
  }

  async function handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const decision = resolveRouteDecision(req.method || "GET", req.url || "/", req.headers);
    if (decision.mode === "unsupported") {
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
      sendJson(res, 503, {
        error: {
          code: "model_gateway_provider_missing",
          message: decision.reason,
          decision,
        },
      });
      return;
    }
    if (decision.mode === "adapter-required") {
      sendJson(res, 501, {
        error: {
          code: "model_gateway_adapter_required",
          message: decision.reason,
          decision,
        },
      });
      return;
    }

    const registry = readRegistry();
    const provider = findProvider(registry, decision.provider.id);
    if (!provider || !decision.upstreamUrl) {
      sendJson(res, 503, {
        error: {
          code: "model_gateway_provider_missing",
          message: "The selected Model Gateway provider is no longer available.",
          decision,
        },
      });
      return;
    }

    const secret = readProviderSecret(provider);
    if (provider.authStrategy !== "none" && !secret) {
      sendJson(res, 401, {
        error: {
          code: "model_gateway_provider_secret_missing",
          message: `Provider '${provider.id}' requires a secret before requests can be forwarded.`,
          decision,
        },
      });
      return;
    }

    const body = await readRequestBody(req);
    const bodyText = body.byteLength ? body.toString("utf8") : undefined;
    const headers = copyUpstreamRequestHeaders(req);
    applyProviderAuth(headers, provider, secret);
    try {
      const upstream = await fetch(decision.upstreamUrl, {
        method: req.method || "POST",
        headers,
        body: bodyText,
      });
      const responseBody = Buffer.from(await upstream.arrayBuffer());
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
      sendJson(res, 502, {
        error: {
          code: "model_gateway_upstream_failed",
          message: error instanceof Error ? error.message : "Model Gateway upstream request failed.",
          decision,
        },
      });
    }
  }

  return {
    getStatus,
    listProviders,
    upsertProvider,
    setProviderSecret,
    resolveRouteDecision,
    handleGatewayRequest,
  };
}
