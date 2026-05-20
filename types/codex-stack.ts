export type CodexStackChannel = "official" | "dmwork";

export type CodexStackComponentId =
  | "codex"
  | "cpa"
  | "compact-proxy"
  | "cc-connect"
  | "watchdog";

export type CodexStackServiceId =
  | "cli-proxy-api.service"
  | "cpa-compact-proxy.service"
  | "cc-connect.service"
  | "codex-stack-watchdog.timer";

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

export type CodexStackContextMode = "default" | "codex-1m" | "custom";

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
  lastInstallAt?: string | null;
  lastCheckAt?: string | null;
  lastRepairAt?: string | null;
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
  warnings: string[];
}

export interface CodexStackInstallRequest {
  env?: {
    CODEX_MODEL?: string;
    CPA_PORT?: number;
    COMPACT_PORT?: number;
    CPA_PROXY_KEY?: string;
    CODEX_CONTEXT_MODE?: CodexStackContextMode;
    CODEX_CONTEXT_WINDOW?: number;
    OPENCLAW_UPSTREAM_BASE_URL?: string;
    OPENCLAW_UPSTREAM_API_KEY?: string;
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
  | "restart-cpa"
  | "restart-compact-proxy"
  | "restart-watchdog"
  | "restart-cc-connect"
  | "repair-auth-json"
  | "repair-cpa-management"
  | "disable-conflicting-units"
  | "rerun-install-no-start";

export interface CodexStackRepairRequest {
  actions: CodexStackRepairAction[];
}

export interface CodexStackConfigPatchRequest {
  defaultModel?: string;
  contextMode?: CodexStackContextMode;
  contextWindowTokens?: number | null;
  cpaPort?: number;
  compactPort?: number;
  cpaProxyKey?: string;
  ccConnectProject?: string;
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
  restartRequiredUnits?: CodexStackServiceId[];
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
