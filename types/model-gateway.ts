export const MODEL_GATEWAY_DEFAULT_HOST = "127.0.0.1";
export const MODEL_GATEWAY_DEFAULT_PORT = 18796;
export const MODEL_GATEWAY_DAEMON_SERVICE_NAME = "openclaw-studio-model-gateway.service";

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

export type ModelGatewayRuntimeRequestKind = "gateway-request" | "provider-test";
export type ModelGatewayRuntimeRequestOutcome = "success" | "failure" | "adapter-required" | "missing-provider";

export interface ModelGatewayRuntimeRequestLogEntry {
  id: string;
  kind: ModelGatewayRuntimeRequestKind;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  routeId: ModelGatewayRouteId | null;
  appScope: ModelGatewayAppScope | null;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  method: string;
  requestedPath: string;
  upstreamUrl: string | null;
  statusCode: number | null;
  outcome: ModelGatewayRuntimeRequestOutcome;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ModelGatewayRuntimeState {
  version: 1;
  updatedAt: string;
  requestLog: ModelGatewayRuntimeRequestLogEntry[];
}

export type ModelGatewaySupervisorKind =
  | "systemd-user"
  | "launchd-user"
  | "windows-service"
  | "scheduled-task"
  | "none"
  | "unknown";

export type ModelGatewayLocalDaemonState =
  | "not-installed"
  | "running"
  | "stale"
  | "stopped"
  | "unknown";

export type ModelGatewayRuntimeHostMode = "studio-api-embedded" | "local-daemon";
export type ModelGatewayDaemonImplementationStatus = "contract-only" | "available";

export interface ModelGatewayDaemonRuntimeMetadata {
  version: 1;
  updatedAt: string;
  pid: number | null;
  startedAt: string | null;
  host: string;
  port: number;
  endpoint: string;
  supervisor: ModelGatewaySupervisorKind;
  serviceName: string;
  lockFile: string | null;
}

export interface ModelGatewayLifecycleStatus {
  controlPlane: {
    state: "running";
    mode: "studio-api";
    pid: number;
    endpoint: string;
    embeddedGatewayActive: boolean;
  };
  openclawMount: {
    state: "configured" | "disabled";
    basePath: string | null;
    endpoint: string | null;
    role: "control-ui-ingress";
    ownsModelRelay: false;
  };
  localDaemon: {
    required: true;
    implementationStatus: ModelGatewayDaemonImplementationStatus;
    state: ModelGatewayLocalDaemonState;
    runtimeMode: ModelGatewayRuntimeHostMode;
    endpoint: string;
    pid: number | null;
    startedAt: string | null;
    supervisor: {
      expected: ModelGatewaySupervisorKind;
      active: ModelGatewaySupervisorKind | null;
      serviceName: string;
      restartPolicyRequired: true;
    };
    paths: {
      runtime: string;
      pid: string;
      lock: string;
    };
    survivesControlPlaneCrash: boolean;
    notes: string[];
  };
  endpointPolicy: {
    preferredCliEndpoint: string;
    openclawSinglePortEndpoint: string | null;
    directDaemonFallbackRequired: true;
    targetModelRelayOwner: "local-daemon";
  };
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

export interface ModelGatewaySetActiveProviderRequest {
  scope: ModelGatewayAppScope;
  providerId: string | null;
}

export interface ModelGatewayProviderTestRequest {
  routeId?: ModelGatewayRouteId;
  appScope?: ModelGatewayAppScope;
  model?: string;
  input?: string;
  timeoutMs?: number;
}

export interface ModelGatewayProviderTestResponse {
  ok: boolean;
  providerId: string;
  checkedAt: string;
  statusCode: number | null;
  latencyMs: number;
  route: ModelGatewayRouteDecision;
  responsePreview: string | null;
  error: {
    code: string;
    message: string;
  } | null;
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
  runtime: {
    requestLogSize: number;
    latestRequestAt: string | null;
  };
  lifecycle: ModelGatewayLifecycleStatus;
  healthSummary: {
    okProviders: number;
    degradedProviders: number;
    openCircuits: number;
  };
}

export interface ModelGatewayRuntimeResponse {
  ok: true;
  runtime: ModelGatewayRuntimeState;
  paths: {
    runtime: string;
    logs: string;
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
  failoverReason: string | null;
}
