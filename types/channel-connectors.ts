export const CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME = "openclaw-studio-channel-connectors.service";

export type ChannelConnectorsPhase = "native-daemon-f1";

export type ChannelConnectorAgentId = "codex" | "claude-code" | "opencode";
export type ChannelConnectorPlatformId = "octo" | "feishu" | "wechat" | "wecom";

export type ChannelConnectorsSupervisorKind =
  | "systemd-user"
  | "launchd-user"
  | "windows-service"
  | "scheduled-task"
  | "none"
  | "unknown";

export type ChannelConnectorsDaemonAction =
  | "preview"
  | "install"
  | "ensure-running"
  | "start"
  | "stop"
  | "restart"
  | "status";

export interface ChannelConnectorsDaemonCommand {
  label: string;
  command: string;
  args: string[];
}

export interface ChannelConnectorsDaemonCommandResult extends ChannelConnectorsDaemonCommand {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export interface ChannelConnectorsDaemonManagerStatus {
  checked: boolean;
  reachable: boolean | null;
  active: boolean | null;
  enabled: boolean | null;
  lastError: string | null;
}

export interface ChannelConnectorsDaemonRuntimeConfig {
  version: 1;
  management: {
    host: string;
    port: number;
  };
  paths: {
    root: string;
    state: string;
    log: string;
    runtime: string;
  };
  gateway: {
    endpoint: string;
    clientKeyRef: "studio-gateway-client-key";
  };
  projects: Array<{
    id: string;
    name: string;
    workDir: string;
    agent: ChannelConnectorAgentId;
    model: string | null;
    platformBindings: Array<{
      platform: ChannelConnectorPlatformId;
      accountId: string;
      botId: string | null;
      agent: ChannelConnectorAgentId;
    }>;
  }>;
}

export interface ChannelConnectorsDaemonTemplate {
  supervisor: ChannelConnectorsSupervisorKind;
  platform: "linux" | "macos" | "windows" | "unknown";
  serviceName: string;
  servicePath: string;
  template: string;
  commands: Partial<Record<ChannelConnectorsDaemonAction, ChannelConnectorsDaemonCommand[]>>;
}

export interface ChannelConnectorsDaemonPlan {
  platform: string;
  supported: boolean;
  supervisor: ChannelConnectorsSupervisorKind;
  serviceName: string;
  nodePath: string;
  daemonEntry: string;
  rootDir: string;
  configPath: string;
  stateDir: string;
  logFile: string;
  runtimeFile: string;
  managementEndpoint: string;
  selectedTemplate: ChannelConnectorsDaemonTemplate;
  templates: ChannelConnectorsDaemonTemplate[];
  notes: string[];
}

export interface ChannelConnectorsDaemonConfigResponse {
  ok: true;
  checkedAt: string;
  ready: boolean;
  configPath: string;
  gatewayEndpoint: string;
  managementEndpoint: string;
  config: ChannelConnectorsDaemonRuntimeConfig;
  preview: string;
  missing: string[];
}

export interface ChannelConnectorsDaemonRequest {
  action?: ChannelConnectorsDaemonAction;
  apply?: boolean;
  runCommands?: boolean;
}

export interface ChannelConnectorsDaemonResponse {
  ok: boolean;
  checkedAt: string;
  action: ChannelConnectorsDaemonAction;
  applied: boolean;
  templateWritten: boolean;
  configWritten: boolean;
  templateCurrent: boolean;
  configCurrent: boolean;
  installed: boolean;
  skippedReason: string | null;
  plan: ChannelConnectorsDaemonPlan;
  config: ChannelConnectorsDaemonConfigResponse;
  commandsRun: ChannelConnectorsDaemonCommandResult[];
  serviceManager: ChannelConnectorsDaemonManagerStatus;
  diagnostics: string[];
}

export interface ChannelConnectorsLogsResponse {
  ok: true;
  checkedAt: string;
  logFile: string;
  exists: boolean;
  lines: string[];
}

export interface ChannelConnectorsBindingPolicy {
  model: "platform-account-or-bot-to-agent";
  supportedAgents: ChannelConnectorAgentId[];
  supportedPlatforms: ChannelConnectorPlatformId[];
  multiBot: {
    allowed: true;
    unit: "platform-account-or-bot";
  };
  wechatPersonal: {
    maxAgentsPerAccount: 1;
  };
}

export interface ChannelConnectorsStatusResponse {
  ok: true;
  checkedAt: string;
  phase: ChannelConnectorsPhase;
  implementation: "studio-native";
  referenceSources: string[];
  runtimeChain: string[];
  bindingPolicy: ChannelConnectorsBindingPolicy;
  paths: {
    root: string;
    config: string;
    state: string;
    log: string;
    runtime: string;
  };
  lifecycle: {
    studioRuntimeDependency: false;
    openclawRuntimeDependency: false;
    modelRelayOwner: "studio-gateway-daemon";
    channelDaemonOwner: "studio-native-channel-daemon";
  };
  service: ChannelConnectorsDaemonResponse;
}
