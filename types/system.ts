export interface SystemHealthPayload {
  checkedAt: string;
  gateway: "online" | "offline";
  gatewayConnected: boolean;
  pid: number;
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  hostname: string;
  uptime: number;
  port: number;
  gatewayPort: number;
  sseConnections: number;
  serviceState: string;
  serviceSubState: string;
  cpus: number;
  loadavg: number[];
  totalMemoryBytes: number;
  freeMemoryBytes: number;
}

export interface SystemCommandSnapshot {
  ok: boolean;
  durationMs: number;
  error: string;
  stdout: string;
  stderr: string;
  parsedJson: Record<string, any> | null;
}

export interface SystemServiceSnapshot {
  activeState: string;
  subState: string;
  unitFileState: string;
  execMainPid: number | null;
  fragmentPath: string;
}

export interface SystemGatewaySnapshot {
  bindMode: string;
  bindHost: string;
  probeUrl: string;
  rpcOk: boolean;
  rpcUrl: string;
  portStatus: string;
  portHints: string[];
}

export interface SystemStatusSummary {
  runtimeVersion: string;
  gatewayReachable: boolean;
  gatewayUrl: string;
  gatewayError: string;
  gatewayServiceLabel: string;
  gatewayServiceRuntime: string;
  agentsDefaultId: string;
  agentCount: number;
  sessionCount: number;
  bootstrapPendingCount: number;
  securityCritical: number;
  securityWarn: number;
  securityInfo: number;
  updateLatestVersion: string;
  updateInstallKind: string;
  updatePackageManager: string;
}

export interface SystemDeviceTrustSettings {
  autoApproveLocalHelper: boolean;
}

export interface SystemDeviceTrustPendingRequest {
  requestId: string;
  deviceId: string;
  publicKey: string;
  platform: string;
  deviceFamily: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  isRepair: boolean;
  silent: boolean;
  requestedAt: string | null;
}

export interface SystemDeviceTrustHelperStatus {
  deviceId: string;
  clientId: string;
  clientMode: string;
  paired: boolean;
  approvedScopes: string[];
  storedScopes: string[];
  pendingRequestId: string | null;
  pendingRepair: boolean;
  approvedAt: string | null;
  tokenInSync: boolean;
  canSyncLocalToken: boolean;
  storedTokenUpdatedAt: string | null;
  pairedTokenUpdatedAt: string | null;
  pairedPlatform: string;
  pairedDeviceFamily: string;
  pendingPlatform: string | null;
  pendingDeviceFamily: string | null;
  pendingClientMode: string | null;
  metadataRepairPending: boolean;
}

export interface SystemDeviceTrustPayload {
  checkedAt: string;
  settings: SystemDeviceTrustSettings;
  helper: SystemDeviceTrustHelperStatus;
  pending: SystemDeviceTrustPendingRequest[];
  pairedDeviceCount: number;
  notes: string[];
}

export interface SystemDeviceTrustApproveRequest {
  requestId: string;
}

export interface SystemDeviceTrustApproveResponse {
  ok: boolean;
  requestId: string;
  snapshot: SystemDeviceTrustPayload;
}

export interface SystemDeviceTrustRepairResponse {
  ok: boolean;
  approvedRequestId: string | null;
  synchronizedToken: boolean;
  snapshot: SystemDeviceTrustPayload;
}

export interface SystemDeviceTrustSettingsPatchRequest {
  autoApproveLocalHelper?: boolean;
}

export interface SystemDeviceTrustSettingsPatchResponse {
  ok: boolean;
  settings: SystemDeviceTrustSettings;
}

export type SystemBootstrapLevel = "ok" | "warn" | "error";

export interface SystemBootstrapCheck {
  id: string;
  label: string;
  level: SystemBootstrapLevel;
  summary: string;
  detail: string;
  detected: boolean;
  fixable: boolean;
}

export interface SystemBootstrapPayload {
  checkedAt: string;
  ready: boolean;
  autoApplied: boolean;
  configPath: string;
  stateDir: string;
  checks: SystemBootstrapCheck[];
  notes: string[];
}

export interface SystemBootstrapRepairResponse {
  ok: boolean;
  changed: boolean;
  changedKeys: string[];
  snapshot: SystemBootstrapPayload;
}

export interface SystemDiagnosticsPayload {
  checkedAt: string;
  config: {
    pluginId: string;
    pluginName: string;
    version: string;
    port: number;
    autoStart: boolean;
    openclawRoot: string;
    openclawConfigFile: string;
    projectRoot: string;
    webDistDir: string;
    gatewayPort: number;
    gatewayWsUrl: string;
    gatewayControlUiBasePath: string;
    transport: {
      standalone: {
        enabled: boolean;
        port: number;
      };
      gateway: {
        enabled: boolean;
        basePath: string;
      };
    };
  };
  runtime: {
    cwd: string;
    pid: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    hostname: string;
    uptime: number;
    sseConnections: number;
    cpus: number;
    loadavg: number[];
    totalMemoryBytes: number;
    freeMemoryBytes: number;
  };
  counts: {
    agents: number;
    channels: number;
    bindings: number;
    cronJobs: number;
    skills: number;
  };
  service: SystemServiceSnapshot;
  gateway: SystemGatewaySnapshot;
  status: SystemStatusSummary;
  commands: {
    gatewayStatus: SystemCommandSnapshot;
    status: SystemCommandSnapshot;
    doctor: SystemCommandSnapshot;
  };
  deviceTrust: SystemDeviceTrustPayload;
  bootstrap: SystemBootstrapPayload;
}

export interface SystemStudioReleasePayload {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  source: string | null;
  packageUrl: string | null;
  minOpenClawVersion: string | null;
  notes: string[];
}

export interface SystemStudioUpgradeStatusPayload {
  checkedAt: string;
  status: "idle" | "running" | "succeeded" | "failed";
  running: boolean;
  pid: number | null;
  mode: "standalone" | "gateway" | null;
  targetVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  logFile: string;
  lastError: string;
}

export interface SystemStudioUpgradeRequest {
  mode?: "standalone" | "gateway";
  version?: string;
  siteBase?: string;
  apiPort?: number;
  basePath?: string;
  skipUpgrade?: boolean;
}

export interface SystemStudioUpgradeResponse {
  ok: boolean;
  status: SystemStudioUpgradeStatusPayload;
}

export interface SystemRuntimeSummaryPayload {
  checkedAt: string;
  gatewayConnected: boolean;
  bootstrapPendingCount: number;
  updateLatestVersion: string;
  updateAvailable: boolean;
  studioUpgradeRunning: boolean;
  helperRepairPending: boolean;
  level: "ok" | "warn";
}

export interface SystemTerminalActionSuggestion {
  key: string;
  title: string;
  routePath: string;
  commandHint: string;
}

export type SystemEventSeverity = "info" | "warning" | "error" | "success";

export type SystemEventCategory =
  | "operations"
  | "audit"
  | "recovery"
  | "alerts";

export interface SystemEventRecord {
  id: string;
  kind: string;
  category: SystemEventCategory;
  severity: SystemEventSeverity;
  occurredAt: string;
  title: string;
  summary: string;
  status: string;
  sourceModule?: string;
}

export interface SystemEventSummaryCard {
  count: number;
  items: SystemEventRecord[];
}

export interface SystemEventSummaryPayload {
  recentFailures: SystemEventSummaryCard;
  pendingAuditItems: SystemEventSummaryCard;
  recentRecoveries: SystemEventSummaryCard;
}
