export const CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME = "openclaw-studio-channel-connectors.service";

export type ChannelConnectorsPhase = "native-daemon-f1" | "native-config-f2";

export const CHANNEL_CONNECTOR_AGENT_IDS = [
  "codex",
  "claude-code",
  "opencode",
  "gemini",
  "kimi",
  "cursor",
  "qoder",
  "iflow",
  "devin",
  "acp",
] as const;

export const CHANNEL_CONNECTOR_PLATFORM_IDS = [
  "octo",
  "feishu",
  "wechat",
  "wecom",
  "dingtalk",
  "telegram",
  "slack",
  "discord",
  "qq",
  "qqbot",
  "line",
] as const;

export type ChannelConnectorAgentId = typeof CHANNEL_CONNECTOR_AGENT_IDS[number];
export type ChannelConnectorPlatformId = typeof CHANNEL_CONNECTOR_PLATFORM_IDS[number];

export type ChannelConnectorPermissionMode =
  | "suggest"
  | "read-only"
  | "auto-edit"
  | "full-auto"
  | "plan"
  | "yolo";

export type ChannelConnectorOctoChannelType = 1 | 2 | 5;

export interface ChannelConnectorOctoMentionPayload {
  uids?: string[];
  all?: number;
}

export interface ChannelConnectorOctoReplyPayload {
  messageId?: string;
  message_id?: string;
}

export interface ChannelConnectorOctoMessagePayload {
  type?: number;
  content?: string;
  url?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  mention?: ChannelConnectorOctoMentionPayload | null;
  reply?: ChannelConnectorOctoReplyPayload | null;
}

export interface ChannelConnectorOctoGroupMember {
  uid: string;
  name: string;
}

export interface ChannelConnectorOctoInboundMessage {
  messageId: string;
  fromUid: string;
  channelId: string;
  channelType: ChannelConnectorOctoChannelType;
  timestamp?: number | null;
  payload: ChannelConnectorOctoMessagePayload;
  members?: ChannelConnectorOctoGroupMember[];
}

export interface ChannelConnectorOctoInboundRequest {
  bindingId?: string | null;
  accountId?: string | null;
  botId?: string | null;
  dryRun?: boolean;
  sendReply?: boolean;
  replyText?: string | null;
  message: ChannelConnectorOctoInboundMessage;
}

export interface ChannelConnectorOctoTransportConfig {
  apiUrl: string;
  botToken: string;
  wsUrl?: string | null;
}

export interface ChannelConnectorOctoTransportResult {
  attempted: boolean;
  ok: boolean | null;
  action: "none" | "register" | "typing" | "send-message";
  apiUrl: string | null;
  statusCode: number | null;
  error: string | null;
  requestCount: number;
  robotId?: string | null;
  imToken?: string | null;
  wsUrl?: string | null;
}

export interface ChannelConnectorOctoTransportSmokeRequest {
  bindingId?: string | null;
  action?: "register" | "typing" | "send-message";
  channelId?: string | null;
  channelType?: ChannelConnectorOctoChannelType;
  content?: string | null;
}

export interface ChannelConnectorOctoTransportSmokeResponse {
  ok: true;
  checkedAt: string;
  adapter: "octo";
  binding: ChannelConnectorPlatformBinding | null;
  transport: ChannelConnectorOctoTransportResult;
}

export interface ChannelConnectorOctoReplyPlan {
  channelId: string;
  channelType: ChannelConnectorOctoChannelType;
  chunks: string[];
  mentionUids: string[];
  payloads: Array<{
    channel_id: string;
    channel_type: ChannelConnectorOctoChannelType;
    payload: {
      type: 1;
      content: string;
      mention?: {
        uids: string[];
      };
    };
  }>;
}

export interface ChannelConnectorOctoDispatchResponse {
  ok: true;
  checkedAt: string;
  adapter: "octo";
  accepted: boolean;
  skippedReason: string | null;
  dryRun: boolean;
  sessionKey: string | null;
  binding: ChannelConnectorPlatformBinding | null;
  agentProfile: ChannelConnectorAgentProfile | null;
  incoming: {
    messageId: string;
    platform: "octo";
    channelId: string;
    channelType: ChannelConnectorOctoChannelType;
    fromUid: string;
    content: string;
    directed: boolean;
  } | null;
  agentDispatch: {
    status: "dry-run" | "queued" | "not-ready" | "skipped";
    agent: ChannelConnectorAgentId | null;
    model: string | null;
    workDir: string | null;
    gatewayEndpoint: string | null;
    gatewayKeyRef: "studio-gateway-client-key" | null;
  };
  transport: ChannelConnectorOctoTransportResult;
  replyPlan: ChannelConnectorOctoReplyPlan | null;
  eventStored: {
    path: string;
    written: boolean;
  };
}

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
    octoEvents: string;
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
    permissionMode: ChannelConnectorPermissionMode;
    appProfileRef: string;
    platformBindings: Array<{
      id: string;
      platform: ChannelConnectorPlatformId;
      accountId: string;
      botId: string | null;
      displayName: string;
      agent: ChannelConnectorAgentId;
      enabled: boolean;
      allowlist: string[];
      adminUsers: string[];
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

export interface ChannelConnectorAgentProfile {
  id: string;
  name: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  workDir: string;
  permissionMode: ChannelConnectorPermissionMode;
  gatewayEndpoint: string;
  gatewayKeyRef: "studio-gateway-client-key";
  appProfileRef: string;
}

export interface ChannelConnectorPlatformBinding {
  id: string;
  platform: ChannelConnectorPlatformId;
  accountId: string;
  botId: string | null;
  displayName: string;
  agentProfileId: string;
  enabled: boolean;
  allowlist: string[];
  adminUsers: string[];
  metadata?: Record<string, unknown>;
}

export interface ChannelConnectorsNativeConfig {
  version: 1;
  updatedAt: string;
  defaultAgentProfileId: string;
  agentProfiles: ChannelConnectorAgentProfile[];
  platformBindings: ChannelConnectorPlatformBinding[];
}

export interface ChannelConnectorsNativeConfigResponse {
  ok: true;
  checkedAt: string;
  configPath: string;
  config: ChannelConnectorsNativeConfig;
  supportedAgents: ChannelConnectorAgentId[];
  supportedPlatforms: ChannelConnectorPlatformId[];
  permissionModes: ChannelConnectorPermissionMode[];
}

export interface ChannelConnectorsSaveNativeConfigRequest {
  config?: ChannelConnectorsNativeConfig;
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
  nativeConfigPath: string;
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
    nativeConfig: string;
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
