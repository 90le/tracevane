export const CHANNEL_CONNECTORS_CC_BRIDGE_SERVICE_NAME = "openclaw-studio-cc-bridge.service";

export type ChannelConnectorsPhase = "f1-service-control";

export type ChannelConnectorAgentId = "codex" | "claude-code" | "opencode";
export type ChannelConnectorPlatformId = "octo" | "feishu" | "wechat" | "wecom";

export type CcBridgeSupervisorKind =
  | "systemd-user"
  | "launchd-user"
  | "windows-service"
  | "scheduled-task"
  | "none"
  | "unknown";

export type CcBridgeServiceAction =
  | "preview"
  | "install"
  | "ensure-running"
  | "start"
  | "stop"
  | "restart"
  | "status";

export interface CcBridgeServiceCommand {
  label: string;
  command: string;
  args: string[];
}

export interface CcBridgeServiceCommandResult extends CcBridgeServiceCommand {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export interface CcBridgeServiceManagerStatus {
  checked: boolean;
  reachable: boolean | null;
  active: boolean | null;
  enabled: boolean | null;
  lastError: string | null;
}

export interface CcBridgeBinaryStatus {
  command: string;
  path: string | null;
  available: boolean;
  source: "env" | "path" | "missing";
}

export interface CcBridgeServiceTemplate {
  supervisor: CcBridgeSupervisorKind;
  platform: "linux" | "macos" | "windows" | "unknown";
  serviceName: string;
  servicePath: string;
  template: string;
  commands: Partial<Record<CcBridgeServiceAction, CcBridgeServiceCommand[]>>;
}

export interface CcBridgeServicePlan {
  platform: string;
  supported: boolean;
  supervisor: CcBridgeSupervisorKind;
  serviceName: string;
  binary: CcBridgeBinaryStatus;
  rootDir: string;
  configPath: string;
  stateDir: string;
  logFile: string;
  runtimeFile: string;
  selectedTemplate: CcBridgeServiceTemplate;
  templates: CcBridgeServiceTemplate[];
  notes: string[];
}

export interface CcBridgeConfigPreviewResponse {
  ok: true;
  checkedAt: string;
  ready: boolean;
  configPath: string;
  gatewayEndpoint: string;
  preview: string;
  missing: string[];
}

export interface CcBridgeServiceRequest {
  action?: CcBridgeServiceAction;
  apply?: boolean;
  runCommands?: boolean;
}

export interface CcBridgeServiceResponse {
  ok: boolean;
  checkedAt: string;
  action: CcBridgeServiceAction;
  applied: boolean;
  templateWritten: boolean;
  configWritten: boolean;
  templateCurrent: boolean;
  configCurrent: boolean;
  installed: boolean;
  skippedReason: string | null;
  plan: CcBridgeServicePlan;
  config: CcBridgeConfigPreviewResponse;
  commandsRun: CcBridgeServiceCommandResult[];
  serviceManager: CcBridgeServiceManagerStatus;
  diagnostics: string[];
}

export interface CcBridgeLogsResponse {
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
    ccBridgeOwner: "cc-bridge-daemon";
  };
  service: CcBridgeServiceResponse;
}
