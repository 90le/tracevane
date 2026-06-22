export const MODEL_GATEWAY_DEFAULT_HOST = "127.0.0.1";
export const MODEL_GATEWAY_DEFAULT_PORT = 18796;
export const MODEL_GATEWAY_DAEMON_SERVICE_NAME = "tracevane-model-gateway.service";

export const MODEL_GATEWAY_APP_SCOPES = [
  "codex",
  "claude-code",
  "opencode",
  "openclaw",
] as const;

export type ModelGatewayAppScope = (typeof MODEL_GATEWAY_APP_SCOPES)[number];

export const MODEL_GATEWAY_APP_CONNECTION_IDS = [
  "codex",
  "claude-code",
  "opencode",
  "openclaw",
] as const;

export type ModelGatewayAppConnectionId = (typeof MODEL_GATEWAY_APP_CONNECTION_IDS)[number];

export const MODEL_GATEWAY_PROVIDER_CATEGORIES = [
  "official",
  "openai-compatible",
  "aggregator",
  "local",
  "custom",
] as const;

export type ModelGatewayProviderCategory = (typeof MODEL_GATEWAY_PROVIDER_CATEGORIES)[number];

export const MODEL_GATEWAY_PROVIDER_SOURCE_TYPES = [
  "api-key",
  "account-backed",
  "external-relay",
] as const;

export type ModelGatewayProviderSourceType = (typeof MODEL_GATEWAY_PROVIDER_SOURCE_TYPES)[number];

export const MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS = [
  "codex",
  "chatgpt",
  "claude-code",
  "gemini-cli",
  "custom",
] as const;

export type ModelGatewayAccountProviderKind = (typeof MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS)[number];

export const MODEL_GATEWAY_ACCOUNT_CREDENTIAL_SOURCES = [
  "codex-device-auth",
  "codex-browser-auth",
  "codex-auth-json",
  "manual-token-ref",
  "unknown",
] as const;

export type ModelGatewayAccountCredentialSource = (typeof MODEL_GATEWAY_ACCOUNT_CREDENTIAL_SOURCES)[number];

export const MODEL_GATEWAY_ACCOUNT_STATES = [
  "ready",
  "needs-login",
  "refreshing",
  "cooldown",
  "disabled",
  "error",
] as const;

export type ModelGatewayAccountState = (typeof MODEL_GATEWAY_ACCOUNT_STATES)[number];

export const MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES = [
  "round-robin",
  "fill-first",
] as const;

export type ModelGatewayAccountRoutingStrategy = (typeof MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES)[number];

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

export const MODEL_GATEWAY_REASONING_THINKING_PARAMS = [
  "none",
  "thinking",
  "enable_thinking",
  "reasoning_split",
] as const;

export type ModelGatewayReasoningThinkingParam = (typeof MODEL_GATEWAY_REASONING_THINKING_PARAMS)[number];

export const MODEL_GATEWAY_REASONING_EFFORT_PARAMS = [
  "none",
  "reasoning_effort",
  "reasoning.effort",
] as const;

export type ModelGatewayReasoningEffortParam = (typeof MODEL_GATEWAY_REASONING_EFFORT_PARAMS)[number];

export const MODEL_GATEWAY_REASONING_EFFORT_VALUE_MODES = [
  "passthrough",
  "deepseek",
  "low_high",
  "openrouter",
] as const;

export type ModelGatewayReasoningEffortValueMode = (typeof MODEL_GATEWAY_REASONING_EFFORT_VALUE_MODES)[number];

export const MODEL_GATEWAY_REASONING_OUTPUT_FORMATS = [
  "auto",
  "reasoning_content",
] as const;

export type ModelGatewayReasoningOutputFormat = (typeof MODEL_GATEWAY_REASONING_OUTPUT_FORMATS)[number];

export const MODEL_GATEWAY_ROUTE_IDS = [
  "openai_chat_completions",
  "openai_responses",
  "openai_responses_compact",
  "openai_images_generations",
  "openai_images_edits",
  "openai_audio_transcriptions",
  "openai_audio_translations",
  "openai_audio_speech",
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
  features?: ModelGatewayModelFeatures;
  pricing?: ModelGatewayProviderModelPricing;
}

export interface ModelGatewayProviderModelPricing {
  currency?: string;
  inputPer1M?: number | null;
  outputPer1M?: number | null;
  cacheReadPer1M?: number | null;
  cacheCreationPer1M?: number | null;
  longContextInputThreshold?: number | null;
  longContextInputMultiplier?: number | null;
  longContextOutputMultiplier?: number | null;
  imageGenerationPerImage?: number | null;
  imageEditPerRequest?: number | null;
  audioInputPerRequest?: number | null;
  audioOutputPerRequest?: number | null;
}

export interface ModelGatewayModelFeatures {
  text?: boolean;
  streaming?: boolean;
  tools?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  responses?: boolean;
  imageGeneration?: boolean;
  audioInput?: boolean;
  audioOutput?: boolean;
}

export interface ModelGatewayUnsupportedRoute {
  routeId?: ModelGatewayRouteId;
  endpoint?: string;
  code: string;
  reason: string;
}

export interface ModelGatewayRouteSupport {
  supported: ModelGatewayRouteId[];
  unsupported: ModelGatewayUnsupportedRoute[];
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
  retryAfterUntil: string | null;
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
  openaiChatMetadataPassthrough?: boolean;
  openai_chat_metadata_passthrough?: boolean;
}

export interface ModelGatewayProviderReasoning {
  supportsThinking?: boolean;
  supportsEffort?: boolean;
  thinkingParam?: ModelGatewayReasoningThinkingParam;
  effortParam?: ModelGatewayReasoningEffortParam;
  effortValueMode?: ModelGatewayReasoningEffortValueMode;
  outputFormat?: ModelGatewayReasoningOutputFormat;
}

export interface ModelGatewayAccountEntry {
  id: string;
  kind: ModelGatewayAccountProviderKind;
  enabled: boolean;
  state: ModelGatewayAccountState;
  authRef: string;
  credentialSource: ModelGatewayAccountCredentialSource;
  accountHash: string | null;
  emailMasked: string | null;
  plan: string | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  cooldownUntil: string | null;
  proxyUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelGatewayAccountProviderRouting {
  strategy: ModelGatewayAccountRoutingStrategy;
  sessionAffinity: boolean;
  maxConcurrentPerAccount: number | null;
}

export interface ModelGatewayAccountProviderConfig {
  kind: ModelGatewayAccountProviderKind;
  routing: ModelGatewayAccountProviderRouting;
  accounts: ModelGatewayAccountEntry[];
}

export interface ModelGatewayProviderEndpointProfile {
  id: string;
  name: string;
  enabled: boolean;
  appScopes: ModelGatewayAppScope[];
  baseUrl: string;
  apiKeyRef: string | null;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  models: ModelGatewayProviderModelCatalog | null;
  reasoning: ModelGatewayProviderReasoning;
  endpoints: Partial<Record<ModelGatewayRouteId, string>>;
  network: ModelGatewayProviderNetwork;
  health: ModelGatewayProviderHealth;
  failover: ModelGatewayProviderFailover;
  metadata: ModelGatewayProviderMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ModelGatewayProvider {
  id: string;
  name: string;
  enabled: boolean;
  category: ModelGatewayProviderCategory;
  sourceType: ModelGatewayProviderSourceType;
  appScopes: ModelGatewayAppScope[];
  baseUrl: string;
  apiKeyRef: string | null;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  models: ModelGatewayProviderModelCatalog;
  reasoning: ModelGatewayProviderReasoning;
  endpoints: Partial<Record<ModelGatewayRouteId, string>>;
  endpointProfiles: ModelGatewayProviderEndpointProfile[];
  network: ModelGatewayProviderNetwork;
  health: ModelGatewayProviderHealth;
  failover: ModelGatewayProviderFailover;
  accountProvider: ModelGatewayAccountProviderConfig | null;
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

export interface ModelGatewayClientAuthConfig {
  enabled: boolean;
  apiKeyRef: string;
  updatedAt: string | null;
}

export interface ModelGatewayClientAuthView extends ModelGatewayClientAuthConfig {
  secret: ModelGatewaySecretSummary;
  acceptedHeaders: string[];
  protectedRoutes: string[];
}

export interface ModelGatewayProviderView extends ModelGatewayProvider {
  secret: ModelGatewaySecretSummary | null;
}

export interface ModelGatewayModelListItem {
  id: string;
  slug: string;
  object: "model";
  created: number;
  owned_by: string;
  label: string | null;
  display_name: string;
  description: string;
  default_reasoning_level: string;
  visibility: "list";
  shell_type: "shell_command";
  supported_in_api: boolean;
  priority: number;
  additional_speed_tiers: string[];
  service_tiers: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  availability_nux: { message: string } | null;
  upgrade: { model: string; migration_markdown: string } | null;
  base_instructions: string;
  model_messages: {
    instructions_template: string;
    instructions_variables: {
      personality_default: string;
      personality_friendly: string;
      personality_pragmatic: string;
    };
  };
  supports_reasoning_summaries: boolean;
  default_reasoning_summary: string;
  support_verbosity: boolean;
  default_verbosity: string;
  apply_patch_tool_type: string;
  web_search_tool_type: string;
  truncation_policy: {
    mode: string;
    limit: number;
  };
  supports_parallel_tool_calls: boolean;
  supports_image_detail_original: boolean;
  effective_context_window_percent: number;
  experimental_supported_tools: string[];
  supports_search_tool: boolean;
  use_responses_lite: boolean;
  supported_reasoning_levels: Array<{
    effort: string;
    description: string;
    limit: number;
  }>;
  input_modalities: string[];
  context_window: number;
  max_context_window: number;
  max_output_tokens: number;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  aliases: string[];
  providerIds: string[];
  healthyProviderIds?: string[];
  openCircuitProviderIds?: string[];
  features: ModelGatewayModelFeatures;
  agentSelectable?: boolean;
  endpointOnly?: boolean;
  routeSupport?: ModelGatewayRouteSupport;
  supportedGatewayRoutes?: ModelGatewayRouteId[];
  unsupportedGatewayRoutes?: ModelGatewayUnsupportedRoute[];
  pricing?: ModelGatewayProviderModelPricing;
}

export interface ModelGatewayModelListResponse {
  object: "list";
  data: ModelGatewayModelListItem[];
  models: ModelGatewayModelListItem[];
}

export interface ModelGatewayRegistryState {
  version: 1;
  updatedAt: string;
  clientAuth: ModelGatewayClientAuthConfig;
  appConnectionProfile: ModelGatewayAppConnectionProfile;
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

export interface ModelGatewayRuntimeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  imageGenerationRequests: number;
  imagesGenerated: number;
  imageEditRequests: number;
  audioInputRequests: number;
  audioOutputRequests: number;
}

export interface ModelGatewayRuntimeUsageSummaryBucket {
  key: string;
  label: string;
  providerId: string | null;
  providerName: string | null;
  accountId: string | null;
  accountHash: string | null;
  model: string | null;
  requestCount: number;
  meteredRequestCount: number;
  latestRequestAt: string | null;
  usage: ModelGatewayRuntimeUsage;
}

export interface ModelGatewayRuntimeUsageSummary {
  requestCount: number;
  meteredRequestCount: number;
  latestRequestAt: string | null;
  usage: ModelGatewayRuntimeUsage;
  latency: ModelGatewayRuntimeLatencySummary;
  byProvider: ModelGatewayRuntimeUsageSummaryBucket[];
  byModel: ModelGatewayRuntimeUsageSummaryBucket[];
  byAccount: ModelGatewayRuntimeUsageSummaryBucket[];
}

export interface ModelGatewayRuntimeLatencyDistribution {
  requestCount: number;
  averageMs: number | null;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

export interface ModelGatewayRuntimeLatencySummary extends ModelGatewayRuntimeLatencyDistribution {
  firstByte: ModelGatewayRuntimeLatencyDistribution;
}

export interface ModelGatewayRuntimeRequestLogEntry {
  id: string;
  kind: ModelGatewayRuntimeRequestKind;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  firstByteMs: number | null;
  routeId: ModelGatewayRouteId | null;
  appScope: ModelGatewayAppScope | null;
  providerId: string | null;
  providerName: string | null;
  accountId?: string | null;
  accountHash?: string | null;
  accountRouting?: ModelGatewayAccountRoutingDiagnostics | null;
  clientKeyHash?: string | null;
  endpointProfileId?: string | null;
  endpointProfileName?: string | null;
  model: string | null;
  method: string;
  requestedPath: string;
  upstreamUrl: string | null;
  statusCode: number | null;
  outcome: ModelGatewayRuntimeRequestOutcome;
  errorCode: string | null;
  errorMessage: string | null;
  usage: ModelGatewayRuntimeUsage | null;
}

export interface ModelGatewayModelUsageRow {
  model: string;
  requestCount: number;
  meteredRequestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestRequestAt: string | null;
}

export interface ModelGatewayRuntimeState {
  version: 1;
  updatedAt: string;
  requestLog: ModelGatewayRuntimeRequestLogEntry[];
  accountRouting: {
    codexCursors: Record<string, number>;
    codexAffinities: Record<string, string>;
  };
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

export type ModelGatewayRuntimeHostMode = "tracevane-api-embedded" | "local-daemon";
export type ModelGatewayDaemonImplementationStatus = "contract-only" | "available";

export type ModelGatewayDaemonServiceAction =
  | "preview"
  | "install"
  | "ensure-running"
  | "start"
  | "stop"
  | "restart"
  | "status";

export interface ModelGatewayDaemonServiceCommand {
  label: string;
  command: string;
  args: string[];
}

export interface ModelGatewayDaemonServiceCommandResult extends ModelGatewayDaemonServiceCommand {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export interface ModelGatewayDaemonServiceManagerStatus {
  checked: boolean;
  reachable: boolean | null;
  active: boolean | null;
  enabled: boolean | null;
  lastError: string | null;
}

export type ModelGatewayDaemonBootstrapMode =
  | "not-needed"
  | "supervisor"
  | "detached"
  | "blocked";

export interface ModelGatewayDaemonBootstrapStatus {
  mode: ModelGatewayDaemonBootstrapMode;
  allowed: boolean;
  attempted: boolean;
  started: boolean;
  temporary: boolean;
  pid: number | null;
  endpoint: string | null;
  error: string | null;
  notes: string[];
}

export interface ModelGatewayDaemonServiceTemplate {
  supervisor: ModelGatewaySupervisorKind;
  platform: "linux" | "macos" | "windows";
  serviceName: string;
  configPath: string;
  template: string;
  commands: Partial<Record<ModelGatewayDaemonServiceAction, ModelGatewayDaemonServiceCommand[]>>;
}

export interface ModelGatewayDaemonServicePlan {
  platform: string;
  supported: boolean;
  supervisor: ModelGatewaySupervisorKind;
  serviceName: string;
  nodePath: string;
  daemonEntry: string;
  stateDir: string;
  selectedTemplate: ModelGatewayDaemonServiceTemplate;
  templates: ModelGatewayDaemonServiceTemplate[];
  notes: string[];
}

export interface ModelGatewayDaemonServiceRequest {
  action?: ModelGatewayDaemonServiceAction;
  apply?: boolean;
  runCommands?: boolean;
  allowBootstrap?: boolean;
}

export interface ModelGatewayDaemonServiceResponse {
  ok: true;
  checkedAt: string;
  action: ModelGatewayDaemonServiceAction;
  applied: boolean;
  templateWritten: boolean;
  templateCurrent: boolean;
  installed: boolean;
  plan: ModelGatewayDaemonServicePlan;
  lifecycle: ModelGatewayLifecycleStatus;
  commandsRun: ModelGatewayDaemonServiceCommandResult[];
  serviceManager: ModelGatewayDaemonServiceManagerStatus;
  bootstrap: ModelGatewayDaemonBootstrapStatus;
}

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
    state: "running" | "not-attached";
    mode: "tracevane-api" | "daemon-local-control";
    pid: number | null;
    endpoint: string | null;
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
  sourceType?: ModelGatewayProviderSourceType;
  appScopes?: ModelGatewayAppScope[];
  baseUrl?: string;
  apiKeyRef?: string | null;
  apiFormat?: ModelGatewayApiFormat;
  authStrategy?: ModelGatewayAuthStrategy;
  models?: Partial<ModelGatewayProviderModelCatalog>;
  reasoning?: ModelGatewayProviderReasoning | Record<string, unknown>;
  endpoints?: Partial<Record<ModelGatewayRouteId, string>>;
  endpointProfiles?: ModelGatewayProviderEndpointProfileInput[];
  network?: Partial<ModelGatewayProviderNetwork>;
  health?: Partial<ModelGatewayProviderHealth>;
  failover?: Partial<ModelGatewayProviderFailover>;
  accountProvider?: Partial<ModelGatewayAccountProviderConfig> | null;
  projectRefs?: string[];
  metadata?: ModelGatewayProviderMetadata;
}

export interface ModelGatewayProviderEndpointProfileInput {
  id?: string;
  name?: string;
  enabled?: boolean;
  appScopes?: ModelGatewayAppScope[];
  baseUrl?: string;
  apiKeyRef?: string | null;
  apiFormat?: ModelGatewayApiFormat;
  authStrategy?: ModelGatewayAuthStrategy;
  models?: Partial<ModelGatewayProviderModelCatalog> | null;
  reasoning?: ModelGatewayProviderReasoning | Record<string, unknown>;
  endpoints?: Partial<Record<ModelGatewayRouteId, string>>;
  network?: Partial<ModelGatewayProviderNetwork>;
  health?: Partial<ModelGatewayProviderHealth>;
  failover?: Partial<ModelGatewayProviderFailover>;
  metadata?: ModelGatewayProviderMetadata;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelGatewayUpsertProviderRequest {
  provider: ModelGatewayProviderInput;
  secret?: {
    apiKey?: string | null;
  };
  setActiveScopes?: ModelGatewayAppScope[];
}

export interface ModelGatewayCodexAccountLoginStartRequest {
  providerId?: string;
  providerName?: string;
  setActiveScopes?: ModelGatewayAppScope[];
}

export interface ModelGatewayCodexAccountLoginStartResponse {
  ok: true;
  loginId: string;
  verificationUrl: string;
  userCode: string;
  expiresAt: string;
  pollIntervalSeconds: number;
}

export interface ModelGatewayCodexAccountLoginPollRequest {
  loginId: string;
}

export interface ModelGatewayCodexAccountLoginPollResponse {
  ok: true;
  status: "pending" | "completed" | "expired" | "failed";
  message: string | null;
  provider: ModelGatewayProviderView | null;
}

export interface ModelGatewayProviderAccountUpdateRequest {
  enabled?: boolean;
  proxyUrl?: string | null;
  clearCooldown?: boolean;
}

export interface ModelGatewayProviderAccountUpdateResponse {
  ok: true;
  provider: ModelGatewayProviderView;
  account: ModelGatewayAccountEntry;
}

export interface ModelGatewayProviderAccountRefreshResponse {
  ok: true;
  provider: ModelGatewayProviderView;
  account: ModelGatewayAccountEntry;
  refreshed: true;
}

export interface ModelGatewaySetProviderSecretRequest {
  apiKey: string | null;
}

export interface ModelGatewayProviderSecretResponse {
  ok: true;
  providerId: string;
  secret: ModelGatewaySecretSummary | null;
  apiKey: string | null;
}

export interface ModelGatewayClientAuthUpdateRequest {
  enabled?: boolean;
  apiKey?: string | null;
  generate?: boolean;
}

export interface ModelGatewayClientAuthResponse {
  ok: true;
  clientAuth: ModelGatewayClientAuthView;
  revealedKey: string | null;
}

export interface ModelGatewayAppConnectionProfile {
  model: string | null;
  appModels: Partial<Record<ModelGatewayAppConnectionId, string | null>>;
  contextWindow: number | null;
  autoCompactTokenLimit: number | null;
  maxOutputTokens: number | null;
  reasoningEffort: string | null;
  protocolOptions: {
    codexResponsesWebsockets: boolean;
    codexResponsesWebsocketsV2: boolean;
    codexRequestCompression: boolean;
  };
}

export interface ModelGatewayAppConnectionTarget {
  path: string;
  exists: boolean;
  format: "json" | "toml";
}

export interface ModelGatewayAppConnectionPreview {
  targetPath: string;
  format: "json" | "toml";
  content: string;
  redacted: true;
}

export interface ModelGatewayAppConnection {
  id: ModelGatewayAppConnectionId;
  label: string;
  appScope: ModelGatewayAppScope;
  protocol: ModelGatewayApiFormat;
  endpoint: string;
  model: string | null;
  target: ModelGatewayAppConnectionTarget;
  configured: boolean;
  canApply: boolean;
  canRollback: boolean;
  lastBackupPath: string | null;
  issues: string[];
  launchHint: string | null;
  preview: ModelGatewayAppConnectionPreview;
}

export interface ModelGatewayAppConnectionsResponse {
  ok: true;
  checkedAt: string;
  profile: ModelGatewayAppConnectionProfile;
  availableModels: string[];
  connections: ModelGatewayAppConnection[];
}

export interface ModelGatewayUpdateAppConnectionProfileRequest {
  profile?: Partial<ModelGatewayAppConnectionProfile>;
}

export interface ModelGatewayUpdateAppConnectionProfileResponse {
  ok: true;
  checkedAt: string;
  profile: ModelGatewayAppConnectionProfile;
  connections: ModelGatewayAppConnection[];
}

export interface ModelGatewayApplyAppConnectionRequest {
  appId?: ModelGatewayAppConnectionId;
  profile?: Partial<ModelGatewayAppConnectionProfile>;
}

export interface ModelGatewayApplyAppConnectionResponse {
  ok: true;
  checkedAt: string;
  connection: ModelGatewayAppConnection;
  applied: boolean;
  backupPath: string | null;
}

export interface ModelGatewayApplyAppConnectionsResponse {
  ok: true;
  checkedAt: string;
  applied: ModelGatewayApplyAppConnectionResponse[];
}

export interface ModelGatewayRollbackAppConnectionRequest {
  appId?: ModelGatewayAppConnectionId;
}

export interface ModelGatewayRollbackAppConnectionResponse {
  ok: true;
  checkedAt: string;
  connection: ModelGatewayAppConnection;
  rolledBack: boolean;
  restoredFrom: string | null;
  backupPath: string | null;
}

export interface ModelGatewaySetActiveProviderRequest {
  scope: ModelGatewayAppScope;
  providerId: string | null;
}

export interface ModelGatewayProviderTestRequest {
  kind?: "protocol" | "vision";
  routeId?: ModelGatewayRouteId;
  endpointProfileId?: string;
  appScope?: ModelGatewayAppScope;
  model?: string;
  input?: string;
  timeoutMs?: number;
}

export interface ModelGatewayActiveRouteSmokeRequest {
  scope?: ModelGatewayAppScope;
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

export interface ModelGatewayProviderDetectRequest {
  baseUrl?: string;
  apiKey?: string | null;
  model?: string;
  timeoutMs?: number;
}

export interface ModelGatewayProviderDetectModelResult {
  ok: boolean;
  authStrategy: ModelGatewayAuthStrategy;
  endpoint: string;
  statusCode: number | null;
  latencyMs: number;
  models: ModelGatewayProviderModel[];
  error: {
    code: string;
    message: string;
  } | null;
}

export interface ModelGatewayProviderDetectProtocolResult {
  ok: boolean;
  skipped: boolean;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  routeId: ModelGatewayRouteId;
  statusCode: number | null;
  latencyMs: number;
  model: string | null;
  upstreamUrl: string | null;
  responsePreview: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface ModelGatewayProviderDetectRecommendation {
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  routeId: ModelGatewayRouteId;
  defaultModel: string | null;
}

export interface ModelGatewayProviderDetectResponse {
  ok: true;
  checkedAt: string;
  baseUrl: string;
  selectedModel: string | null;
  models: ModelGatewayProviderModel[];
  modelProbes: ModelGatewayProviderDetectModelResult[];
  protocols: ModelGatewayProviderDetectProtocolResult[];
  recommendations: ModelGatewayProviderDetectRecommendation[];
}

export type ModelGatewayActiveRouteState =
  | "fixed"
  | "auto"
  | "fallback"
  | "missing";

export interface ModelGatewayActiveRouteStatus {
  scope: ModelGatewayAppScope;
  selectedProviderId: string | null;
  resolvedProviderId: string | null;
  resolvedProviderName: string | null;
  resolvedEndpointProfileId: string | null;
  resolvedEndpointProfileName: string | null;
  resolvedModel: string | null;
  routeId: ModelGatewayRouteId;
  routeMode: ModelGatewayRouteMode | null;
  resolvedApiFormat: ModelGatewayApiFormat | null;
  resolvedBaseUrl: string | null;
  upstreamUrl: string | null;
  state: ModelGatewayActiveRouteState;
  message: string;
  warning: string | null;
}

export interface ModelGatewayProvidersResponse {
  ok: true;
  providers: ModelGatewayProviderView[];
  activeProviders: Partial<Record<ModelGatewayAppScope, string>>;
  activeRoutes: ModelGatewayActiveRouteStatus[];
  activeRouteAlerts: string[];
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
    models: string[];
    openaiChatCompletions: string[];
    openaiResponses: string[];
    openaiResponsesCompact: string[];
    openaiImagesGenerations: string[];
    openaiImagesEdits: string[];
    openaiAudioTranscriptions: string[];
    openaiAudioTranslations: string[];
    openaiAudioSpeech: string[];
    anthropicMessages: string[];
    unsupportedEndpoints: Array<{
      method: string;
      path: string;
      endpoint: string;
      code: string;
      reason: string;
    }>;
  };
  registry: {
    providerCount: number;
    activeProviders: Partial<Record<ModelGatewayAppScope, string>>;
    clientAuth: ModelGatewayClientAuthView;
    paths: {
      registry: string;
      secrets: string;
      runtime: string;
      usageLedger: string;
    };
  };
  runtime: {
    requestLogSize: number;
    latestRequestAt: string | null;
    usageSummary: ModelGatewayRuntimeUsageSummary;
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
  usageSummary: ModelGatewayRuntimeUsageSummary;
  paths: {
    runtime: string;
    logs: string;
  };
}

export interface ModelGatewayUsageLedgerResponse {
  ok: true;
  checkedAt: string;
  totals: {
    requestCount: number;
    meteredRequestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  models: ModelGatewayModelUsageRow[];
  readWindow: {
    entryCount: number;
    readLimit: number;
    readByteLimit: number;
    readBytes: number;
    ledgerSizeBytes: number;
    truncated: boolean;
  };
  paths: {
    ledger: string;
  };
}

export interface ModelGatewayRouteDecision {
  routeId: ModelGatewayRouteId | null;
  method: string;
  requestedPath: string;
  appScope: ModelGatewayAppScope | null;
  mode: ModelGatewayRouteMode;
  provider: Pick<ModelGatewayProvider, "id" | "name" | "apiFormat" | "authStrategy" | "baseUrl"> | null;
  endpointProfile: Pick<ModelGatewayProviderEndpointProfile, "id" | "name" | "apiFormat" | "authStrategy" | "baseUrl"> | null;
  account?: Pick<ModelGatewayAccountEntry, "id" | "accountHash"> | null;
  accountRouting?: ModelGatewayAccountRoutingDiagnostics | null;
  clientKeyHash?: string | null;
  model: {
    requested: string | null;
    resolved: string | null;
  } | null;
  upstreamPath: string | null;
  upstreamUrl: string | null;
  reason: string | null;
  failoverReason: string | null;
}

export interface ModelGatewayAccountRoutingSkip {
  accountId: string;
  accountHash: string | null;
  state: ModelGatewayAccountState;
  reason: string;
  cooldownUntil: string | null;
  inFlight: number;
  capacityLimit: number | null;
}

export interface ModelGatewayAccountRoutingDiagnostics {
  providerId: string;
  kind: ModelGatewayAccountProviderKind;
  strategy: ModelGatewayAccountRoutingStrategy;
  sessionAffinity: boolean;
  affinityKeyHash: string | null;
  affinityHit: boolean;
  selectedAccountId: string | null;
  selectedReason: string | null;
  selectedWasCooldownRetry: boolean;
  selectedCooldownUntil: string | null;
  failureReason: string | null;
  accountCount: number;
  readyCount: number;
  capacityAvailableCount: number;
  busyCount: number;
  cooldownCount: number;
  needsLoginCount: number;
  cursorBefore: number | null;
  cursorAfter: number | null;
  skipped: ModelGatewayAccountRoutingSkip[];
}
