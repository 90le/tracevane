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

export type ChannelConnectorReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type ChannelConnectorOctoChannelType = 1 | 2 | 5;

export interface ChannelConnectorOctoMentionPayload {
  uids?: string[];
  all?: number;
}

export interface ChannelConnectorOctoReplyPayload {
  messageId?: string;
  message_id?: string;
}

export type ChannelConnectorInboundAttachmentKind =
  | "image"
  | "file"
  | "audio"
  | "video"
  | "sticker"
  | "unknown";

export interface ChannelConnectorInboundAttachment {
  kind: ChannelConnectorInboundAttachmentKind;
  platform: ChannelConnectorPlatformId;
  key?: string | null;
  imageKey?: string | null;
  fileKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  durationMs?: number | null;
  url?: string | null;
  file_url?: string | null;
  fileUrl?: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  download_url?: string | null;
  downloadUrl?: string | null;
  cdn_url?: string | null;
  cdnUrl?: string | null;
  origin_url?: string | null;
  originUrl?: string | null;
  src?: string | null;
  href?: string | null;
  localPath?: string | null;
  stagedAt?: string | null;
  stagingError?: string | null;
}

export interface ChannelConnectorOctoMessagePayload {
  type?: number;
  content?: string | ChannelConnectorOctoRichTextBlock[];
  plain?: string;
  url?: string;
  file_url?: string;
  fileUrl?: string;
  media_url?: string;
  mediaUrl?: string;
  media_urls?: string[];
  mediaUrls?: string[];
  download_url?: string;
  downloadUrl?: string;
  cdn_url?: string;
  cdnUrl?: string;
  origin_url?: string;
  originUrl?: string;
  src?: string;
  href?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  mention?: ChannelConnectorOctoMentionPayload | null;
  reply?: ChannelConnectorOctoReplyPayload | null;
}

export interface ChannelConnectorOctoRichTextBlock {
  type?: string;
  text?: string;
  url?: string;
  file_url?: string;
  fileUrl?: string;
  media_url?: string;
  mediaUrl?: string;
  download_url?: string;
  downloadUrl?: string;
  cdn_url?: string;
  cdnUrl?: string;
  origin_url?: string;
  originUrl?: string;
  src?: string;
  href?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
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
  attachments?: ChannelConnectorInboundAttachment[];
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
  cosUploadBaseUrl?: string | null;
  uploadStrategy?: "auto" | "direct" | "multipart" | null;
  directUploadMinBytes?: number | null;
}

export interface ChannelConnectorOctoTransportResult {
  attempted: boolean;
  ok: boolean | null;
  action:
    | "none"
    | "register"
    | "heartbeat"
    | "typing"
    | "send-message"
    | "upload-credentials"
    | "direct-upload-file"
    | "upload-file"
    | "send-media"
    | "direct-upload-and-send-media"
    | "upload-and-send-media";
  apiUrl: string | null;
  statusCode: number | null;
  error: string | null;
  requestCount: number;
  robotId?: string | null;
  imToken?: string | null;
  wsUrl?: string | null;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  uploadBucket?: string | null;
  uploadRegion?: string | null;
  uploadKey?: string | null;
  uploadCdnBaseUrl?: string | null;
  uploadExpiredTime?: number | null;
  uploadCredentialKeys?: string[] | null;
}

export interface ChannelConnectorOctoTransportSmokeRequest {
  bindingId?: string | null;
  action?:
    | "register"
    | "typing"
    | "send-message"
    | "upload-credentials"
    | "direct-upload-file"
    | "upload-file"
    | "direct-upload-and-send-media"
    | "upload-and-send-media";
  channelId?: string | null;
  channelType?: ChannelConnectorOctoChannelType;
  content?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
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
    messageType: number | null;
    attachments: ChannelConnectorInboundAttachment[];
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
  commandAction?: ChannelConnectorCommandActionResponse | null;
  transport: ChannelConnectorOctoTransportResult;
  replyPlan: ChannelConnectorOctoReplyPlan | null;
  eventStored: {
    path: string;
    written: boolean;
  };
}

export type ChannelConnectorCommandSurfaceRenderer = "text" | "feishu" | "all";
export type ChannelConnectorCommandSurfaceTone = "default" | "primary" | "danger";
export type ChannelConnectorCommandSurfaceActionKind = "nav" | "act";

export interface ChannelConnectorCommandSurfaceAction {
  id: string;
  label: string;
  command: string;
  actionKind: ChannelConnectorCommandSurfaceActionKind;
  tone: ChannelConnectorCommandSurfaceTone;
  description: string | null;
  requiresAdmin: boolean;
  nativePassthrough: boolean;
}

export interface ChannelConnectorCommandSurfaceSection {
  id: string;
  title: string;
  summary: string | null;
  actions: ChannelConnectorCommandSurfaceAction[];
}

export interface ChannelConnectorCommandSurface {
  version: 1;
  title: string;
  selectedSectionId: string | null;
  selectedViewId: string | null;
  current: {
    bindingId: string;
    sessionKey: string | null;
    projectId: string;
    agent: ChannelConnectorAgentId;
    model: string | null;
    reasoningEffort?: ChannelConnectorReasoningEffort | null;
    permissionMode: ChannelConnectorPermissionMode;
    workDir: string;
    workDirHistory: string[];
    streamMessages: boolean;
    toolMessages: boolean;
  };
  session: {
    started: boolean;
    id?: string | null;
    name?: string | null;
    turnCount: number;
    agentNativeSessionId: string | null;
    codexThreadId: string | null;
    lastStatus: string | null;
    lastMessageId: string | null;
    createdAt?: string | null;
    updatedAt: string | null;
  } | null;
  sessionList: Array<{
    id: string;
    name?: string | null;
    projectId: string;
    agent: ChannelConnectorAgentId;
    model: string | null;
    workDir: string;
    agentNativeSessionId: string | null;
    codexThreadId: string | null;
    turnCount: number;
    createdAt: string;
    updatedAt: string;
    lastMessageId: string | null;
    lastStatus: string | null;
    active: boolean;
  }>;
  history: Array<{
    role: "user" | "assistant";
    text: string | null;
    attachmentSummaries: string[];
    status: string | null;
    createdAt: string;
    messageId: string | null;
  }>;
  sections: ChannelConnectorCommandSurfaceSection[];
  textFallback: string;
}

export interface ChannelConnectorContextBudgetSummary {
  modelId: string | null;
  matchedModelId: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  autoCompactTokenLimit: number | null;
  usedTokens: number | null;
  remainingTokens: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  usageSource: "gateway-runtime-window" | "history-estimate" | "none";
  estimatedTokens: number | null;
  shouldCompact: boolean | null;
  compactStrategy: "agent-native-first";
  note: string | null;
}

export interface ChannelConnectorFeishuInteractiveCard {
  config: {
    wide_screen_mode: true;
  };
  header?: {
    title: {
      tag: "plain_text";
      content: string;
    };
    template: string;
  };
  elements: Array<Record<string, unknown>>;
}

export interface ChannelConnectorCommandSurfaceRequest {
  bindingId?: string | null;
  sessionKey?: string | null;
  section?: string | null;
  view?: string | null;
  renderer?: ChannelConnectorCommandSurfaceRenderer;
  models?: string[];
}

export interface ChannelConnectorCommandSurfaceResponse {
  ok: true;
  checkedAt: string;
  renderer: ChannelConnectorCommandSurfaceRenderer;
  binding: ChannelConnectorPlatformBinding | null;
  agentProfile: ChannelConnectorAgentProfile | null;
  surface: ChannelConnectorCommandSurface | null;
  textFallback: string | null;
  feishuCard: ChannelConnectorFeishuInteractiveCard | null;
}

export interface ChannelConnectorCommandActionRequest {
  bindingId?: string | null;
  sessionKey?: string | null;
  fromUid?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  actionValue?: unknown;
  eventKey?: string | null;
  view?: string | null;
  renderer?: ChannelConnectorCommandSurfaceRenderer;
  models?: string[];
  dryRun?: boolean;
}

export interface ChannelConnectorCommandActionResponse {
  ok: true;
  checkedAt: string;
  accepted: boolean;
  skippedReason: string | null;
  binding: ChannelConnectorPlatformBinding | null;
  agentProfile: ChannelConnectorAgentProfile | null;
  sessionKey: string | null;
  command: string | null;
  commandResult: {
    handled: boolean;
    command: string | null;
    action: string | null;
    ok: boolean | null;
    replyText: string | null;
    passthroughText: string | null;
  } | null;
  surface: ChannelConnectorCommandSurface | null;
  textFallback: string | null;
  feishuCard: ChannelConnectorFeishuInteractiveCard | null;
}

export type ChannelConnectorFeishuWebhookEventKind =
  | "url-verification"
  | "card-action"
  | "bot-menu"
  | "message"
  | "unsupported";

export interface ChannelConnectorFeishuWebhookRequest {
  bindingId?: string | null;
  renderer?: ChannelConnectorCommandSurfaceRenderer;
  models?: string[];
  dryRun?: boolean;
  sendReply?: boolean;
  studioDebugResponse?: boolean;
  token?: string | null;
  challenge?: string | null;
  type?: string | null;
  schema?: string | null;
  header?: Record<string, unknown>;
  event?: Record<string, unknown>;
  actionValue?: unknown;
  eventKey?: string | null;
}

export interface ChannelConnectorFeishuTransportConfig {
  apiUrl: string;
  appId: string;
  appSecret: string;
}

export interface ChannelConnectorFeishuTransportResult {
  attempted: boolean;
  ok: boolean | null;
  action:
    | "none"
    | "tenant-token"
    | "send-message"
    | "send-post"
    | "send-card"
    | "patch-card"
    | "add-reaction"
    | "remove-reaction"
    | "upload-image"
    | "upload-file"
    | "send-image"
    | "send-file"
    | "upload-and-send-media";
  apiUrl: string | null;
  statusCode: number | null;
  error: string | null;
  requestCount: number;
  tokenCache: "disabled" | "hit" | "miss" | "refresh" | null;
  messageId?: string | null;
  messageIds?: string[] | null;
  chunkCount?: number | null;
  reactionId?: string | null;
  imageKey?: string | null;
  fileKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
}

export interface ChannelConnectorFeishuTransportSmokeRequest {
  bindingId?: string | null;
  action?: "tenant-token" | "send-message" | "send-post" | "send-card" | "patch-card" | "upload-and-send-media";
  channelId?: string | null;
  messageId?: string | null;
  content?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface ChannelConnectorFeishuTransportSmokeResponse {
  ok: true;
  checkedAt: string;
  adapter: "feishu";
  binding: ChannelConnectorPlatformBinding | null;
  transport: ChannelConnectorFeishuTransportResult;
}

export interface ChannelConnectorFeishuWebhookResponse {
  ok: true;
  checkedAt: string;
  adapter: "feishu";
  eventKind: ChannelConnectorFeishuWebhookEventKind;
  eventType: string | null;
  eventId: string | null;
  accepted: boolean;
  skippedReason: string | null;
  verification: {
    configured: boolean;
    checked: boolean;
    ok: boolean | null;
  };
  challenge: string | null;
  binding: ChannelConnectorPlatformBinding | null;
  agentProfile: ChannelConnectorAgentProfile | null;
  sessionKey: string | null;
  incoming: {
    messageId: string;
    platform: "feishu";
    channelId: string;
    chatType: string | null;
    fromUid: string;
    rootId: string | null;
    parentId: string | null;
    threadId: string | null;
    messageType: string | null;
    attachments: ChannelConnectorInboundAttachment[];
    content: string;
    directed: boolean;
  } | null;
  commandAction: ChannelConnectorCommandActionResponse | null;
  agentDispatch: {
    status: "dry-run" | "not-ready" | "skipped";
    agent: ChannelConnectorAgentId | null;
    model: string | null;
    workDir: string | null;
    gatewayEndpoint: string | null;
    gatewayKeyRef: "studio-gateway-client-key" | null;
  };
  transport: ChannelConnectorFeishuTransportResult;
  feishuResponse: Record<string, unknown> | null;
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
    feishuEvents: string;
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
    reasoningEffort?: ChannelConnectorReasoningEffort | null;
    permissionMode: ChannelConnectorPermissionMode;
    gatewayEndpoint: string;
    gatewayKeyRef: "studio-gateway-client-key";
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
  reasoningEffort?: ChannelConnectorReasoningEffort | null;
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

export interface ChannelConnectorAgentSessionDriverBindingStatus {
  projectId: string;
  bindingId: string;
  platform: string;
  accountId: string;
  botId: string | null;
  agent: ChannelConnectorAgentId | string;
  model: string | null;
  requestedMode: "one-shot" | "persistent";
  effectiveMode: "one-shot" | "persistent";
  reason: "default" | "codex-app-server-experimental" | "unsupported-agent";
}

export interface ChannelConnectorAgentSessionRuntimeStatus {
  poolKey: string;
  sessionId: string;
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  permissionMode: ChannelConnectorPermissionMode | null;
  workDir: string;
  createdAt: string;
  lastUsedAt: string;
  running: number;
  turnCount: number;
  idleMs: number;
  lastError: string | null;
}

export type ChannelConnectorAgentSessionDriverRuntimeEventType =
  | "session.created"
  | "session.stopped"
  | "session.killed"
  | "session.disposed"
  | "session.reaped"
  | "turn.started"
  | "turn.finished"
  | "turn.failed"
  | "turn.fallback";

export interface ChannelConnectorAgentSessionDriverRuntimeEvent {
  checkedAt: string;
  type: ChannelConnectorAgentSessionDriverRuntimeEventType;
  poolKey: string;
  sessionId: string | null;
  bindingId: string;
  projectId: string;
  sessionKey: string;
  agent: ChannelConnectorAgentId;
  model: string | null;
  workDir: string;
  messageId: string | null;
  reason: string | null;
  error: string | null;
}

export interface ChannelConnectorAgentSessionDriverStatusResponse {
  ok: true;
  checkedAt: string;
  defaultMode: "one-shot";
  implementation: "codex-app-server-experimental";
  persistentDriverReady: true;
  policy: {
    idleTimeoutMs: number;
    maxSessions: number;
    fallbackOnCrash: boolean;
  };
  requestedPersistentBindings: ChannelConnectorAgentSessionDriverBindingStatus[];
  bindings: ChannelConnectorAgentSessionDriverBindingStatus[];
  activeSessions: ChannelConnectorAgentSessionRuntimeStatus[];
  recentEvents: ChannelConnectorAgentSessionDriverRuntimeEvent[];
  reaped?: number;
  killed?: {
    requested: boolean;
    killed: boolean;
    sessionId: string | null;
    poolKey: string | null;
  } | null;
}

export interface ChannelConnectorAgentSessionActionRequest {
  action?: "status" | "reap-idle" | "kill";
  poolKey?: string | null;
  reason?: string | null;
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
