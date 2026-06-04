export type CodexStackChannel = "official" | "dmwork" | "octo";

export type CodexStackComponentId =
  | "codex"
  | "studio-gateway"
  | "cc-connect";

export type CodexStackManualServiceId =
  | "openclaw-studio-model-gateway.service"
  | "cc-connect.service";

export type CodexStackManagedServiceId = never;

export type CodexStackServiceId = CodexStackManualServiceId | CodexStackManagedServiceId;

export type CodexStackServiceAction = "restart" | "start" | "stop" | "enable";

export type CodexStackStatus =
  | "ready"
  | "needs-setup"
  | "degraded"
  | "failed"
  | "binding-required"
  | "running-action";

export type CodexStackComponentStatus =
  | "ok"
  | "missing"
  | "degraded"
  | "failed"
  | "unknown";

export type CodexStackInstallerSourceKind =
  | "configured"
  | "bundled"
  | "development-fallback"
  | "missing";

export type CodexStackModelSource = "live" | "config" | "fallback";

export type CodexStackRecommendationKind =
  | "install"
  | "bind-cc-connect"
  | "watch-job"
  | "repair"
  | "review-proxy"
  | "review-smoke"
  | "run-check";

export type CodexStackRecommendationAction =
  | "open-install"
  | "open-cc-connect"
  | "open-logs"
  | "repair-recommended"
  | "open-settings"
  | "run-check";

export interface CodexStackRecommendation {
  kind: CodexStackRecommendationKind;
  severity: "info" | "success" | "warning" | "danger";
  section: "dashboard" | "install" | "cc-connect" | "settings" | "logs";
  primaryAction: CodexStackRecommendationAction;
  requiresManagement: boolean;
  reasonCodes: string[];
}

export type CodexStackContextMode = "default" | "codex-1m" | "custom";

export type CodexStackRunReadinessLevel = "ready" | "attention" | "blocked";
export type CodexStackRunReadinessCheckStatus = "pass" | "warn" | "fail";
export type CodexStackRunReadinessModeId = "chat" | "long-task" | "compaction" | "cc-agent-task";
export type CodexStackRunReadinessActionKind = "open-section" | "repair" | "run-check";

export interface CodexStackRunReadinessActionHint {
  kind: CodexStackRunReadinessActionKind;
  label: string;
  section?: "dashboard" | "install" | "cc-connect" | "settings" | "logs";
  repairActions?: CodexStackRepairAction[];
}

export interface CodexStackRunReadinessCheck {
  id: string;
  label: string;
  status: CodexStackRunReadinessCheckStatus;
  detail: string;
  section: "dashboard" | "install" | "cc-connect" | "settings" | "logs";
  actionHint: CodexStackRunReadinessActionHint;
}

export interface CodexStackRunReadinessModeDependency {
  checkId: string;
  label: string;
  status: CodexStackRunReadinessCheckStatus;
}

export interface CodexStackRunReadinessMode {
  id: CodexStackRunReadinessModeId;
  label: string;
  ready: boolean;
  detail: string;
  actionHint?: CodexStackRunReadinessActionHint;
  dependencies?: CodexStackRunReadinessModeDependency[];
}

export interface CodexStackRunReadiness {
  level: CodexStackRunReadinessLevel;
  title: string;
  summary: string;
  checks: CodexStackRunReadinessCheck[];
  modes: CodexStackRunReadinessMode[];
}

export interface CodexStackMaskedSecret {
  hasSecret: boolean;
  masked: string | null;
  source: string | null;
  length: number | null;
}

export interface CodexStackInstallerSource {
  channel: CodexStackChannel;
  kind: CodexStackInstallerSourceKind;
  root: string | null;
  version: string | null;
  cpaVersion: string | null;
  cpaLatestVersion: string | null;
  ccConnectSource: string | null;
  scripts: {
    autoSetup: string | null;
    healthCheck: string | null;
    ccConnectFinalizer: string | null;
  };
  requiredFilesPresent: boolean;
  missingFiles: string[];
}

export interface CodexStackManagementAccess {
  enabled: boolean;
  reason: "enabled" | "disabled" | "not-loopback" | "gateway-auth-required";
  loopback: boolean;
  gatewayAuthorized: boolean;
  configPath: string;
}

export interface CodexStackServiceStatus {
  id: CodexStackServiceId;
  installed: boolean;
  enabled: boolean;
  active: boolean;
  rawActiveState: string;
  rawEnabledState: string;
}

export interface CodexStackComponentSummary {
  id: CodexStackComponentId;
  label: string;
  status: CodexStackComponentStatus;
  installed: boolean;
  version: string | null;
  notes: string[];
  paths: Record<string, string | null>;
}

export interface CodexStackProfile {
  updatedAt: string;
  channel: CodexStackChannel;
  installerSource?: string | null;
  cpaPort: number;
  compactPort: number;
  defaultModel: string;
  contextMode?: CodexStackContextMode;
  contextWindowTokens?: number | null;
  ccConnectProject: string;
  hasCpaProxyKey: boolean;
  upstreamOverride?: {
    hasBaseUrl: boolean;
    hasApiKey: boolean;
  };
  providerProxy?: {
    mode: "direct" | "proxy";
    url: string | null;
    source: string | null;
  };
  lastSmokeMatrix?: CodexStackSmokeMatrixResult | null;
  lastInstallAt?: string | null;
  lastCheckAt?: string | null;
  lastRepairAt?: string | null;
}

export type CodexStackSmokeCheckId =
  | "cpa-health"
  | "compact-health"
  | "cpa-chat"
  | "compact-non-stream"
  | "compact-stream"
  | "compact-compact";

export const CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS = [
  "cpa-health",
  "compact-health",
  "cpa-chat",
  "compact-non-stream",
  "compact-stream",
  "compact-compact",
] as const satisfies readonly CodexStackSmokeCheckId[];

export type CodexStackSmokeStatus = "passed" | "failed";

export interface CodexStackSmokeCheckResult {
  id: CodexStackSmokeCheckId;
  label: string;
  status: CodexStackSmokeStatus;
  startedAt: string;
  finishedAt: string;
  durationMs?: number;
  error: string | null;
}

export interface CodexStackSmokeModelResult {
  model: string;
  status: CodexStackSmokeStatus;
  startedAt: string;
  finishedAt: string;
  durationMs?: number;
  checks: CodexStackSmokeCheckResult[];
  error: string | null;
}

export interface CodexStackSmokeMatrixResult {
  status: CodexStackSmokeStatus;
  checkedAt: string;
  durationMs?: number;
  requiredModels: string[];
  models: CodexStackSmokeModelResult[];
  attachEligible: boolean;
}

export interface CodexStackSummaryPayload {
  checkedAt: string;
  overallStatus: CodexStackStatus;
  homeDir: string;
  profilePath: string;
  profile: CodexStackProfile;
  installer: CodexStackInstallerSource;
  management: CodexStackManagementAccess;
  components: CodexStackComponentSummary[];
  services: CodexStackServiceStatus[];
  ports: {
    cpa: number;
    compact: number;
    detectedCpa: number | null;
    detectedCompact: number | null;
  };
  proxyPolicy: {
    providerMode: "direct" | "proxy";
    providerProxyUrl: string | null;
    providerProxySource: string | null;
    noProxy: string;
    noProxyLoopbackReady: boolean;
    noProxyLoopbackMissing: string[];
    cpaConfigProxyUrls: string[];
    upstreamBaseUrl: string | null;
    upstreamApiKeyConfigured: boolean;
  };
  models: {
    current: string;
    defaultModel: string;
    recommendedFrontier: string;
    available: string[];
    source: CodexStackModelSource;
    endpoint: string;
    live: boolean;
    refreshedAt: string;
    error: string | null;
  };
  codexRoute: {
    active: "official-chatgpt" | "cpa";
    currentModel: string;
    cpaTargetModel: string;
    officialModel: string;
  };
  gateway: {
    serviceName: string;
    baseUrl: string;
    statusEndpoint: string;
    live: boolean;
    protocols: {
      openaiChatCompletions: boolean;
      openaiResponses: boolean;
      openaiResponsesCompact: boolean;
      anthropicMessages: boolean;
      anthropicMessagesStreaming: boolean;
    };
    protocolCatalog: Array<{
      id: string;
      label: string;
      endpoint: string;
      upstream: string;
      adapter: "passthrough" | "chat-adapter" | "local-compact";
      streaming: boolean;
      clients: string[];
    }>;
    clientAdapters: Array<{
      id: string;
      label: string;
      protocol: string;
      baseUrl: string;
      authEnv: string;
      modelEnv: string;
      notes: string[];
    }>;
    providerRoutes: Array<{
      id: string;
      label: string;
      baseUrl: string;
      model: string;
      protocol: string;
      source: "cc-connect" | "gateway-default";
      agentTypes: string[];
      modelCount: number;
      channelCount: number;
      codexWireApi: string | null;
    }>;
    modelRoutes: Array<{
      id: string;
      label: string;
      provider: string;
      protocol: string;
      alias: string | null;
    }>;
    channelTemplates: Array<{
      id: string;
      label: string;
      setupCommand: string | null;
      requiredOptions: string[];
      optionalOptions: string[];
    }>;
    integrations: {
      codexCliBaseUrl: string;
      claudeCliBaseUrl: string;
      ccConnectProviderBaseUrl: string;
      ccConnectSourcePath: string | null;
      ccConnectSourceReady: boolean;
      ccConnectSourceAgentTypes: string[];
      ccConnectSourcePlatforms: string[];
      channelSurfaces: string[];
    };
  };
  context: {
    mode: CodexStackContextMode;
    tokens: number | null;
    codexOneMillionEnabled: boolean;
    recommendedTokens: number;
    maxTokens: number;
    source: string | null;
  };
  secrets: {
    cpaProxyKey: CodexStackMaskedSecret;
    codexAuth: CodexStackMaskedSecret & {
      mode: string | null;
      matchesProxyKey: boolean | null;
    };
    officialChatGptAuthBackup: CodexStackMaskedSecret & {
      mode: string | null;
      restorable: boolean;
    };
    cpaManagementKey: CodexStackMaskedSecret;
    upstreamKeys: CodexStackMaskedSecret[];
  };
  ccConnect: {
    installed: boolean;
    configured: boolean;
    project: string;
    bindingPresent: boolean;
    socketPath: string;
    socketPresent: boolean;
    setupCommands: string[];
    finalizerAvailable: boolean;
    canFinalize: boolean;
  };
  cpaManagement: {
    dashboardUrl: string;
    enabled: boolean;
    controlPanelEnabled: boolean;
    remoteAllowed: boolean;
    secretConfigured: boolean;
  };
  runReadiness: CodexStackRunReadiness;
  recommendation: CodexStackRecommendation;
  warnings: string[];
}

export interface CodexStackInstallRequest {
  env?: {
    CODEX_MODEL?: string;
    CODEX_CONTEXT_MODE?: CodexStackContextMode;
    CODEX_CONTEXT_WINDOW?: number;
    OPENCLAW_UPSTREAM_BASE_URL?: string;
    OPENCLAW_UPSTREAM_API_KEY?: string;
    OPENCLAW_PROVIDER_PROXY_URL?: string;
    OPENCLAW_NO_PROXY?: string;
  };
  flags?: {
    skipNpm?: boolean;
    skipCcConnect?: boolean;
    noStart?: boolean;
    skipExisting?: boolean;
    forceReinstall?: boolean;
    skipComponents?: string[];
    forceReinstallComponents?: string[];
    channel?: CodexStackChannel;
  };
}

export type CodexStackRepairAction =
  | "restart-cc-connect"
  | "repair-auth-json"
  | "repair-no-proxy-loopback"
  | "disable-legacy-healthcheck"
  | "run-smoke-matrix"
  | "apply-codex-studio-after-smoke"
  | "restore-official-chatgpt"
  | "disable-conflicting-units"
  | "rerun-install-no-start";

export interface CodexStackRepairRequest {
  actions: CodexStackRepairAction[];
}

export interface CodexStackConfigPatchRequest {
  defaultModel?: string;
  contextMode?: CodexStackContextMode;
  contextWindowTokens?: number | null;
  ccConnectProject?: string;
  upstreamBaseUrl?: string | null;
  upstreamApiKey?: string | null;
  providerProxyUrl?: string | null;
  noProxy?: string | null;
}

export interface CodexStackFinalizeRequest {
  project?: string;
  noAdminAll?: boolean;
}

export interface CcConnectProvider {
  name: string;
  apiKey: string;
  baseUrl: string;
  codexEnvKey: string;
  model?: string;
  models?: CcConnectProviderModel[];
  agentTypes?: string[];
  endpoints?: Record<string, string>;
  agentModels?: Record<string, string>;
  codex?: {
    envKey?: string;
    wireApi?: string;
    httpHeaders?: Record<string, string>;
  };
}

export interface CcConnectProviderModel {
  model: string;
  alias?: string;
}

export interface CcConnectAgentOptions {
  workDir: string;
  mode: string;
  model: string;
}

export interface CcConnectPlatform {
  type: string;
  options: Record<string, string>;
}

export interface CcConnectProject {
  name: string;
  adminFrom: string;
  agentType: string;
  providerRefs?: string[];
  agentOptions: CcConnectAgentOptions;
  platforms: CcConnectPlatform[];
}

export interface CcConnectConfig {
  language: string;
  providers: CcConnectProvider[];
  projects: CcConnectProject[];
  raw: string;
}

export interface CodexStackCcConnectConfigPatchRequest {
  raw?: string;
  language?: string;
  providers?: CcConnectProvider[];
  projects?: CcConnectProject[];
}

export type CodexStackJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted";

export interface CodexStackJob {
  id: string;
  kind: "install" | "repair" | "finalize";
  status: CodexStackJobStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  pid: number | null;
  commandLabel: string;
  logPath: string;
  logTail: string;
  error: string | null;
}

export interface CodexStackJobResponse {
  ok: boolean;
  job: CodexStackJob;
}

export interface CodexStackCheckItem {
  level: "ok" | "warn" | "fail" | "info";
  message: string;
}

export interface CodexStackCheckResponse {
  checkedAt: string;
  ok: boolean;
  items: CodexStackCheckItem[];
  outputTail: string;
}

export interface CodexStackMutationResponse {
  ok: boolean;
  message: string;
  summary?: CodexStackSummaryPayload;
  job?: CodexStackJob;
  restartRequiredUnits?: CodexStackManualServiceId[];
}

export interface CodexStackLogResponse {
  unitId: string;
  output: string;
  sources: Array<{
    kind: "journal" | "file";
    label: string;
    path?: string;
  }>;
  requestedLines: number;
  returnedLines: number;
  truncated: boolean;
  fetchedAt: string;
}
