export const MODEL_GATEWAY_DEFAULT_HOST = "127.0.0.1";
export const MODEL_GATEWAY_DEFAULT_PORT = 18796;

export const MODEL_GATEWAY_APP_SCOPES = [
  "codex",
  "claude-code",
  "opencode",
  "openclaw",
] as const;

export type ModelGatewayAppScope = (typeof MODEL_GATEWAY_APP_SCOPES)[number];

export const MODEL_GATEWAY_PROVIDER_CATEGORIES = [
  "official",
  "openai-compatible",
  "aggregator",
  "local",
  "custom",
] as const;

export type ModelGatewayProviderCategory = (typeof MODEL_GATEWAY_PROVIDER_CATEGORIES)[number];

export const MODEL_GATEWAY_API_FORMATS = [
  "openai_chat",
  "openai_responses",
  "anthropic_messages",
  "gemini_native",
] as const;

export type ModelGatewayApiFormat = (typeof MODEL_GATEWAY_API_FORMATS)[number];

export const MODEL_GATEWAY_AUTH_STRATEGIES = [
  "bearer",
  "anthropic_api_key",
  "openrouter",
  "oauth_proxy",
  "none",
] as const;

export type ModelGatewayAuthStrategy = (typeof MODEL_GATEWAY_AUTH_STRATEGIES)[number];

export const MODEL_GATEWAY_ROUTE_IDS = [
  "openai_chat_completions",
  "openai_responses",
  "openai_responses_compact",
  "anthropic_messages",
] as const;

export type ModelGatewayRouteId = (typeof MODEL_GATEWAY_ROUTE_IDS)[number];

export type ModelGatewayRouteMode =
  | "passthrough"
  | "adapter-required"
  | "missing-provider"
  | "unsupported";

export type ModelGatewayCircuitState = "closed" | "open" | "half-open";

export interface ModelGatewayProviderModel {
  id: string;
  label?: string;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  aliases?: string[];
  features?: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    reasoning?: boolean;
    responses?: boolean;
  };
}

export interface ModelGatewayProviderModelCatalog {
  defaultModel: string | null;
  models: ModelGatewayProviderModel[];
  aliases: Record<string, string>;
}

export interface ModelGatewayProviderHealth {
  circuitState: ModelGatewayCircuitState;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface ModelGatewayProviderFailover {
  enabled: boolean;
  priority: number;
  maxRetries: number;
}

export interface ModelGatewayProviderNetwork {
  proxyUrl: string | null;
  noProxy: string[];
  tlsVerify: boolean;
  timeoutMs: number;
  streamingFirstByteTimeoutMs: number;
  streamingIdleTimeoutMs: number;
}

export interface ModelGatewayProviderMetadata {
  website?: string;
  notes?: string;
  icon?: string;
  tags?: string[];
  importedFrom?: string;
}

export interface ModelGatewayProvider {
  id: string;
  name: string;
  enabled: boolean;
  category: ModelGatewayProviderCategory;
  appScopes: ModelGatewayAppScope[];
  baseUrl: string;
  apiKeyRef: string | null;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  models: ModelGatewayProviderModelCatalog;
  reasoning: Record<string, unknown>;
  endpoints: Partial<Record<ModelGatewayRouteId, string>>;
  network: ModelGatewayProviderNetwork;
  health: ModelGatewayProviderHealth;
  failover: ModelGatewayProviderFailover;
  projectRefs: string[];
  metadata: ModelGatewayProviderMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ModelGatewaySecretSummary {
  ref: string;
  hasSecret: boolean;
  masked: string | null;
  length: number | null;
  updatedAt: string | null;
}

export interface ModelGatewayProviderView extends ModelGatewayProvider {
  secret: ModelGatewaySecretSummary | null;
}

export interface ModelGatewayRegistryState {
  version: 1;
  updatedAt: string;
  activeProviders: Partial<Record<ModelGatewayAppScope, string>>;
  providers: ModelGatewayProvider[];
}

export interface ModelGatewaySecretState {
  version: 1;
  updatedAt: string;
  secrets: Record<string, {
    value: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface ModelGatewayProviderInput {
  id?: string;
  name?: string;
  enabled?: boolean;
  category?: ModelGatewayProviderCategory;
  appScopes?: ModelGatewayAppScope[];
  baseUrl?: string;
  apiKeyRef?: string | null;
  apiFormat?: ModelGatewayApiFormat;
  authStrategy?: ModelGatewayAuthStrategy;
  models?: Partial<ModelGatewayProviderModelCatalog>;
  reasoning?: Record<string, unknown>;
  endpoints?: Partial<Record<ModelGatewayRouteId, string>>;
  network?: Partial<ModelGatewayProviderNetwork>;
  health?: Partial<ModelGatewayProviderHealth>;
  failover?: Partial<ModelGatewayProviderFailover>;
  projectRefs?: string[];
  metadata?: ModelGatewayProviderMetadata;
}

export interface ModelGatewayUpsertProviderRequest {
  provider: ModelGatewayProviderInput;
  secret?: {
    apiKey?: string | null;
  };
  setActiveScopes?: ModelGatewayAppScope[];
}

export interface ModelGatewaySetProviderSecretRequest {
  apiKey: string | null;
}

export interface ModelGatewayProvidersResponse {
  ok: true;
  providers: ModelGatewayProviderView[];
  activeProviders: Partial<Record<ModelGatewayAppScope, string>>;
  paths: {
    registry: string;
    secrets: string;
    runtime: string;
  };
}

export interface ModelGatewayStatusResponse {
  ok: true;
  checkedAt: string;
  phase: "phase-1-control-plane";
  listener: {
    host: string;
    port: number;
  };
  capabilities: {
    status: string[];
    providers: string[];
    openaiChatCompletions: string[];
    openaiResponses: string[];
    openaiResponsesCompact: string[];
    anthropicMessages: string[];
  };
  registry: {
    providerCount: number;
    activeProviders: Partial<Record<ModelGatewayAppScope, string>>;
    paths: {
      registry: string;
      secrets: string;
      runtime: string;
    };
  };
  healthSummary: {
    okProviders: number;
    degradedProviders: number;
    openCircuits: number;
  };
}

export interface ModelGatewayRouteDecision {
  routeId: ModelGatewayRouteId | null;
  method: string;
  requestedPath: string;
  appScope: ModelGatewayAppScope | null;
  mode: ModelGatewayRouteMode;
  provider: Pick<ModelGatewayProvider, "id" | "name" | "apiFormat" | "authStrategy" | "baseUrl"> | null;
  upstreamPath: string | null;
  upstreamUrl: string | null;
  reason: string | null;
}
