export interface DashboardDomainSummary {
  key: 'config' | 'skills' | 'terminal' | 'channels' | 'cron' | 'agents' | 'system';
  label: string;
  status: 'ready' | 'partial' | 'planned';
  value: string;
  note: string;
}

export interface DashboardTransportSummary {
  mode: 'standalone' | 'gateway';
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
  upgradeStatus: 'idle' | 'running' | 'succeeded' | 'failed';
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

export interface DashboardSummaryPayload {
  checkedAt: string;
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
  domains: DashboardDomainSummary[];
}
