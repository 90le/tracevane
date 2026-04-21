export interface DashboardDomainSummary {
  key:
    | "config"
    | "skills"
    | "terminal"
    | "channels"
    | "cron"
    | "agents"
    | "system";
  label: string;
  status: "ready" | "partial" | "planned";
  value: string;
  note: string;
}

export interface DashboardTransportSummary {
  mode: "standalone" | "gateway";
  standalonePort: number;
  gatewayPort: number;
  basePath: string;
  entryUrl: string;
  healthUrl: string;
}

export interface DashboardReleaseSummary {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  upgradeRunning: boolean;
  upgradeStatus: "idle" | "running" | "succeeded" | "failed";
  targetVersion: string | null;
  source: string | null;
}

export interface DashboardBootstrapSummary {
  ready: boolean;
  errors: number;
  warnings: number;
  fixable: number;
}

export interface DashboardDeviceTrustSummary {
  helperConfigured: boolean;
  helperPaired: boolean;
  pendingRequests: number;
  autoApproveLocalHelper: boolean;
}

export interface DashboardRuntimeSummary {
  installedCliCount: number;
  expectedCliCount: number;
}

export interface DashboardEventSummary {
  recentFailures: number;
  pendingAuditItems: number;
  recentRecoveries: number;
  latestFailureTitle: string | null;
  latestAuditTitle: string | null;
  latestRecoveryTitle: string | null;
}

export interface DashboardTerminalWorkspaceSummary {
  totalSessions: number;
  recoverableSessions: number;
  detachedSessions: number;
  runningSessions: number;
  latestSessionId: string | null;
  latestSessionTitle: string | null;
  latestSessionUpdatedAt: string | null;
  latestCommandHint: string | null;
  latestError: string | null;
}

export interface DashboardRecoveryItem {
  id: string;
  title: string;
  note: string;
  severity: "high" | "medium" | "low";
  to: string;
}

export interface DashboardRecoverySummary {
  total: number;
  items: DashboardRecoveryItem[];
}

export interface DashboardTrendPoint {
  key: string;
  label: string;
  value: number;
  note: string;
}

export interface DashboardTrendPanel {
  key: string;
  title: string;
  stage: "risk" | "recovery" | "trend";
  points: DashboardTrendPoint[];
}

export interface DashboardTrendSummary {
  points: DashboardTrendPoint[];
  panels: DashboardTrendPanel[];
}

export interface DashboardContextSummary {
  riskStage: "low" | "medium" | "high";
  primaryHint: string;
  secondaryHint: string;
}

export interface DashboardSummaryPayload {
  checkedAt: string;
  summaryReady: boolean;
  server: {
    name: string;
    version: string;
    port: number;
    pid: number;
    nodeVersion: string;
    uptime: number;
  };
  gateway: {
    port: number;
    url: string;
    connected: boolean;
  };
  counts: {
    agents: number;
    channels: number;
    bindings: number;
    cronJobs: number;
    skills: number;
    enabledSkills: number;
  };
  transport: DashboardTransportSummary;
  release: DashboardReleaseSummary;
  bootstrap: DashboardBootstrapSummary;
  deviceTrust: DashboardDeviceTrustSummary;
  runtime: DashboardRuntimeSummary;
  events: DashboardEventSummary;
  terminalWorkspace: DashboardTerminalWorkspaceSummary;
  recovery: DashboardRecoverySummary;
  trends: DashboardTrendSummary;
  contextSummary: DashboardContextSummary;
  domains: DashboardDomainSummary[];
}
