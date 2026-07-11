import type {
  TracevaneServiceManagerStatus,
  TracevaneSupervisorKind,
} from "./supervisor.js";

export const CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME = "tracevane-channel-connectors.service";

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

export const CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS = [
  "codex",
  "claude-code",
  "opencode",
  "gemini",
] as const satisfies readonly (typeof CHANNEL_CONNECTOR_AGENT_IDS[number])[];

export type ChannelConnectorRuntimeAgentId = typeof CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS[number];

export interface ChannelConnectorRuntimeAgentMetadata {
  id: ChannelConnectorRuntimeAgentId;
  label: string;
  binaryId: "codex" | "claude" | "opencode" | "gemini";
  binaryName: string;
  description: string;
  runnerContract: "codex-app-server" | "claude-code-stream-json" | "opencode-run-session" | "gemini-prompt-stream-json";
  modelSource: "gateway" | "native";
  defaultModelLabel?: string | null;
}

export const CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA = {
  codex: {
    id: "codex",
    label: "Codex CLI",
    binaryId: "codex",
    binaryName: "codex",
    description: "本地 Codex 会话，使用模型网关与当前工作区",
    runnerContract: "codex-app-server",
    modelSource: "gateway",
    defaultModelLabel: "模型网关默认路由",
  },
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    binaryId: "claude",
    binaryName: "claude",
    description: "本地 Claude Code 会话，适合代码库任务",
    runnerContract: "claude-code-stream-json",
    modelSource: "gateway",
    defaultModelLabel: "模型网关默认路由",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    binaryId: "opencode",
    binaryName: "opencode",
    description: "本地 OpenCode 会话，适合开源 CLI 工作流",
    runnerContract: "opencode-run-session",
    modelSource: "gateway",
    defaultModelLabel: "模型网关默认路由",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    binaryId: "gemini",
    binaryName: "gemini",
    description: "本地 Gemini CLI non-interactive 会话，使用 Gemini CLI 自身认证",
    runnerContract: "gemini-prompt-stream-json",
    modelSource: "native",
    defaultModelLabel: "Gemini CLI 默认模型",
  },
} as const satisfies Record<ChannelConnectorRuntimeAgentId, ChannelConnectorRuntimeAgentMetadata>;


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

export const CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL = "https://open.feishu.cn";
export const CHANNEL_CONNECTOR_DEFAULT_LARK_API_URL = "https://open.larksuite.com";
export const CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL = "https://im.deepminer.com.cn/api";

export type ChannelConnectorPermissionMode =
  | "suggest"
  | "read-only"
  | "auto-edit"
  | "full-auto"
  | "plan"
  | "yolo";

export type ChannelConnectorReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type ChannelConnectorThinkingLiveStatus =
  | "observed"
  | "not-observed"
  | "model-dependent"
  | "unknown"
  | "unsupported";

export interface ChannelConnectorThinkingSupport {
  parserSupported: boolean;
  parserLabel: "ready" | "unsupported";
  liveStatus: ChannelConnectorThinkingLiveStatus;
  liveLabel: string;
  liveNote: string | null;
}

export type ChannelConnectorOctoChannelType = 1 | 2 | 5;

export interface ChannelConnectorOctoMentionEntity {
  uid: string;
  offset: number;
  length: number;
}

export interface ChannelConnectorOctoMentionPayload {
  uids?: string[];
  entities?: ChannelConnectorOctoMentionEntity[];
  all?: number | boolean;
  ais?: number | boolean;
  humans?: number | boolean;
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
  file_path?: string | null;
  filePath?: string | null;
  download_path?: string | null;
  downloadPath?: string | null;
  object_key?: string | null;
  objectKey?: string | null;
  storage_key?: string | null;
  storageKey?: string | null;
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
  file_path?: string;
  filePath?: string;
  download_path?: string;
  downloadPath?: string;
  object_key?: string;
  objectKey?: string;
  storage_key?: string;
  storageKey?: string;
  src?: string;
  href?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  mention?: ChannelConnectorOctoMentionPayload | null;
  reply?: ChannelConnectorOctoReplyPayload | null;
  obo_origin_channel_id?: string;
  obo_origin_channel_type?: ChannelConnectorOctoChannelType | number;
  obo_origin_from_uid?: string;
  obo_respond_as?: string;
  obo_grantor_uid?: string;
  obo_system_hint?: string;
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
  file_path?: string;
  filePath?: string;
  download_path?: string;
  downloadPath?: string;
  object_key?: string;
  objectKey?: string;
  storage_key?: string;
  storageKey?: string;
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
  robot?: number | boolean | null;
  role?: number | string | null;
}

export interface ChannelConnectorOctoInboundMessage {
  messageId: string;
  messageSeq?: number | null;
  fromUid: string;
  channelId: string;
  channelType: ChannelConnectorOctoChannelType;
  timestamp?: number | null;
  payload: ChannelConnectorOctoMessagePayload;
  attachments?: ChannelConnectorInboundAttachment[];
  members?: ChannelConnectorOctoGroupMember[];
  replyChannelId?: string | null;
  replyChannelType?: ChannelConnectorOctoChannelType | null;
  replyOnBehalfOf?: string | null;
  personaSystemPrompt?: string | null;
  personaTriggered?: boolean | null;
  oboTrusted?: boolean | null;
  oboRejectedReason?: string | null;
  metadata?: Record<string, unknown>;
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
    | "upload-and-send-media"
    | "read-receipt"
    | "list-groups"
    | "group-info"
    | "group-members"
    | "space-members"
    | "create-group"
    | "update-group"
    | "add-group-members"
    | "remove-group-members"
    | "list-threads"
    | "thread-info"
    | "thread-members"
    | "create-thread"
    | "delete-thread"
    | "join-thread"
    | "leave-thread"
    | "group-md-read"
    | "group-md-update"
    | "thread-md-read"
    | "thread-md-update"
    | "voice-context-read"
    | "voice-context-update"
    | "voice-context-delete"
    | "event-ack"
    | "sync-messages"
    | "file-download-url"
    | "message-edit";
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
  data?: unknown;
  itemCount?: number | null;
}

export interface ChannelConnectorOctoTransportSmokeRequest {
  bindingId?: string | null;
  binding?: ChannelConnectorPlatformBinding | null;
  action?:
    | "register"
    | "typing"
    | "send-message"
    | "upload-credentials"
    | "direct-upload-file"
    | "upload-file"
    | "direct-upload-and-send-media"
    | "upload-and-send-media"
    | "read-receipt"
    | "list-groups"
    | "group-info"
    | "group-members"
    | "search-members"
    | "space-members"
    | "create-group"
    | "update-group"
    | "add-members"
    | "add-group-members"
    | "remove-members"
    | "remove-group-members"
    | "list-threads"
    | "get-thread"
    | "thread-info"
    | "list-thread-members"
    | "thread-members"
    | "create-thread"
    | "delete-thread"
    | "join-thread"
    | "leave-thread"
    | "group-md-read"
    | "group-md-update"
    | "thread-md-read"
    | "thread-md-update"
    | "voice-context-read"
    | "voice-context-update"
    | "voice-context-delete"
    | "event-ack"
    | "history"
    | "sync-messages"
    | "file-download-url"
    | "message-edit";
  channelId?: string | null;
  channelType?: ChannelConnectorOctoChannelType;
  content?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  groupNo?: string | null;
  shortId?: string | null;
  eventId?: string | number | null;
  keyword?: string | null;
  limit?: number | null;
  members?: string[] | null;
  creator?: string | null;
  name?: string | null;
  notice?: string | null;
  spaceId?: string | null;
  startMessageSeq?: number | null;
  endMessageSeq?: number | null;
  pullMode?: 0 | 1 | null;
  filePath?: string | null;
  messageId?: string | null;
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
  mentionEntities: ChannelConnectorOctoMentionEntity[];
  onBehalfOf?: string | null;
  payloads: Array<{
    channel_id: string;
    channel_type: ChannelConnectorOctoChannelType;
    payload: {
      type: 1;
      content: string;
      mention?: {
        uids?: string[];
        entities?: ChannelConnectorOctoMentionEntity[];
        all?: true;
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
    gatewayKeyRef: "tracevane-gateway-client-key" | null;
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

export interface ChannelConnectorCommandSurfaceSkillAction {
  id: string;
  label: string;
  manifest: string;
  tool?: string | null;
  action?: string | null;
  approval: "none" | "required" | "managed";
  notes?: string | null;
}

export interface ChannelConnectorCommandSurfaceSkill {
  name: string;
  displayName: string;
  description: string;
  source: string;
  scope: "agent" | "binding" | "platform";
  platform?: string | null;
  actions?: ChannelConnectorCommandSurfaceSkillAction[];
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
    workDirPage: number;
    workDirSearch: string | null;
    workDirChildCount: number;
    workDirChildPageCount: number;
    thinkingMessages: boolean;
    processMessages: boolean;
    toolMessages: boolean;
    feishuProgressCardEntryLimit: number;
    autoVisionModel: boolean;
    autoVisionModelSource: "session" | "binding";
    visionModel: string | null;
    visionModelSource: "session" | "binding" | "auto";
    thinkingSupport: ChannelConnectorThinkingSupport;
    modelCount: number;
    modelOptionCount: number;
    visionModelCount: number;
    visionModelOptionCount: number;
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
  skills: ChannelConnectorCommandSurfaceSkill[];
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
  channelType?: ChannelConnectorOctoChannelType | null;
  messageId?: string | null;
  messageSeq?: number | null;
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
  tracevaneDebugResponse?: boolean;
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
    | "reply-message"
    | "send-post"
    | "reply-post"
    | "send-card"
    | "reply-card"
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
  binding?: ChannelConnectorPlatformBinding | null;
  action?: "tenant-token" | "send-message" | "send-post" | "send-card" | "patch-card" | "upload-and-send-media";
  channelId?: string | null;
  receiveId?: string | null;
  receiveIdType?: "chat_id" | "open_id" | "user_id" | null;
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
    gatewayKeyRef: "tracevane-gateway-client-key" | null;
  };
  transport: ChannelConnectorFeishuTransportResult;
  feishuResponse: Record<string, unknown> | null;
  eventStored: {
    path: string;
    written: boolean;
  };
}

export type ChannelConnectorsSupervisorKind =
  | TracevaneSupervisorKind
  | "windows-service";

export type ChannelConnectorsDaemonAction =
  | "preview"
  | "install"
  | "ensure-running"
  | "start"
  | "stop"
  | "restart"
  | "reload"
  | "status";

export type ChannelConnectorsDaemonReloadMode = "when-idle" | "immediate";

export type ChannelConnectorsDaemonReloadStatus =
  | "idle"
  | "pending"
  | "applying"
  | "applied"
  | "restart-required"
  | "failed";

export interface ChannelConnectorsDaemonReloadState {
  status: ChannelConnectorsDaemonReloadStatus;
  mode: ChannelConnectorsDaemonReloadMode | null;
  requestedAt: string | null;
  appliedAt: string | null;
  activeRunsAtRequest: number | null;
  activeTurnsAtRequest: number | null;
  configUpdatedAt: string | null;
  error: string | null;
}

export interface ChannelConnectorsDaemonReloadResponse {
  ok: boolean;
  checkedAt: string;
  status: Exclude<ChannelConnectorsDaemonReloadStatus, "idle" | "applying">;
  mode: ChannelConnectorsDaemonReloadMode;
  activeRuns: number;
  activeTurns: number;
  configUpdatedAt: string | null;
  appliedAt: string | null;
  restartRequiredReason: string | null;
  error: string | null;
}

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

export interface ChannelConnectorsDaemonManagerStatus
  extends Partial<
    Omit<TracevaneServiceManagerStatus, "active" | "enabled">
  > {
  checked: boolean;
  reachable: boolean | null;
  active: boolean | null;
  enabled: boolean | null;
  lastError: string | null;
}


export type ChannelConnectorBusyStrategy = "reject" | "queue";

export interface ChannelConnectorAgentSessionPolicyConfig {
  maxSessions: number;
  maxConcurrentTurns: number;
  idleTimeoutMs: number;
  busyStrategy: ChannelConnectorBusyStrategy;
  queueMaxRecords: number;
  queueMaxAgeMs: number;
}

export interface ChannelConnectorsDaemonRuntimeConfig {
  version: 1;
  /** The v3 control-plane snapshot used by the deterministic data-plane resolver. */
  deliveryConfig: ChannelConnectorsV3Config;
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
    clientKeyRef: "tracevane-gateway-client-key";
  };
  agentSessionPolicy: ChannelConnectorAgentSessionPolicyConfig;
  /** Runtime-only projection of v3 targets and account routes. It is never persisted as product config. */
  projects: Array<{
    id: string;
    name: string;
    workDir: string;
    agent: ChannelConnectorAgentId;
    model: string | null;
    reasoningEffort?: ChannelConnectorReasoningEffort | null;
    permissionMode: ChannelConnectorPermissionMode;
    gatewayEndpoint: string;
    gatewayKeyRef: "tracevane-gateway-client-key";
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
      disabledCommands: string[];
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
  gatewayKeyRef: "tracevane-gateway-client-key";
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
  disabledCommands: string[];
  metadata?: Record<string, unknown>;
}

export type ChannelConnectorAccountLifecycle = "draft" | "enabled" | "disabled";
export type ChannelConnectorDeliveryPeerKind = "private" | "group" | "channel";
export type ChannelConnectorDeliverySessionMode = "persistent" | "one-shot";

export interface ChannelConnectorAccountSecurityPolicy {
  allowPrivateAttachmentUrls: boolean;
  allowedAttachmentHosts: string[];
}

/** Platform identity and transport state. Agent execution fields must not live here. */
export interface ChannelConnectorAccount {
  id: string;
  platform: ChannelConnectorPlatformId;
  displayName: string;
  lifecycle: ChannelConnectorAccountLifecycle;
  externalAccountId: string | null;
  botId: string | null;
  credentials: Record<string, unknown>;
  transport: Record<string, unknown>;
  security: ChannelConnectorAccountSecurityPolicy;
  advanced: Record<string, unknown>;
}

/** A reusable Agent runtime plus one explicit workspace and execution policy. */
export interface ChannelConnectorDeliveryTarget {
  id: string;
  name: string;
  enabled: boolean;
  runtime: {
    agent: ChannelConnectorRuntimeAgentId;
    appProfileRef: string;
    gatewayEndpoint: string;
    gatewayKeyRef: "tracevane-gateway-client-key";
  };
  workspace: {
    workDir: string;
  };
  execution: {
    model: string | null;
    reasoningEffort: ChannelConnectorReasoningEffort | null;
    permissionMode: ChannelConnectorPermissionMode;
    workspaceConcurrency: number;
    queueLimit: number;
  };
  governance: {
    disabledCommands: string[];
  };
}

export interface ChannelConnectorDeliverySessionPolicy {
  mode: ChannelConnectorDeliverySessionMode;
  busyGuard: boolean;
  attachmentStaging: boolean;
}

export interface ChannelConnectorDeliveryAccessPolicy {
  allowlist: string[];
  adminUsers: string[];
  disabledCommands: string[];
  mentionRequired: boolean;
}

/** Rule overrides may only narrow access and add denied commands. */
export interface ChannelConnectorRestrictiveAccessPolicy {
  allowlist?: string[];
  disabledCommands?: string[];
  mentionRequired?: true;
}

export interface ChannelConnectorSourceRule {
  id: string;
  name: string;
  enabled: boolean;
  match: {
    peer: {
      kind: ChannelConnectorDeliveryPeerKind;
      id?: string;
    };
    threadId?: string;
    senderId?: string;
    mentionRequired?: true;
  };
  targetRef: string;
  sessionPolicy?: Partial<ChannelConnectorDeliverySessionPolicy>;
  accessPolicy?: ChannelConnectorRestrictiveAccessPolicy;
}

export interface ChannelConnectorDeliveryPolicy {
  id: string;
  accountRef: string;
  defaultTargetRef: string;
  defaultSessionPolicy: ChannelConnectorDeliverySessionPolicy;
  defaultAccessPolicy: ChannelConnectorDeliveryAccessPolicy;
  rules: ChannelConnectorSourceRule[];
}

export interface ChannelConnectorsV3Config {
  version: 3;
  updatedAt: string;
  agentSessionPolicy: ChannelConnectorAgentSessionPolicyConfig;
  accounts: ChannelConnectorAccount[];
  targets: ChannelConnectorDeliveryTarget[];
  deliveryPolicies: ChannelConnectorDeliveryPolicy[];
}

export interface ChannelConnectorIngressRoutingContext {
  accountId: string;
  peer: {
    kind: ChannelConnectorDeliveryPeerKind;
    id: string;
  };
  senderId: string;
  threadId: string | null;
  botMentioned: boolean;
}

export interface ChannelConnectorIngressEnvelope {
  eventId: string;
  eventType: string;
  messageId: string | null;
  accountId: string;
  platform: "feishu" | "octo";
  peer: {
    kind: ChannelConnectorDeliveryPeerKind;
    id: string;
  };
  senderId: string;
  threadId: string | null;
  mentions: string[];
  content: {
    text: string;
  };
  attachments: ChannelConnectorInboundAttachment[];
  receivedAt: string;
  rawRef: string | null;
}

export interface ChannelConnectorDeliveryAccessDecision {
  allowed: boolean;
  reason: "allowed" | "sender_not_allowed" | "mention_required";
  admin: boolean;
  allowlist: string[];
  disabledCommands: string[];
  mentionRequired: boolean;
}

export interface ChannelConnectorDeliveryResolution {
  accountId: string;
  policyId: string;
  matchedBy: "default" | "rule";
  ruleId: string | null;
  targetId: string;
  targetRevision: string;
  sessionPolicy: ChannelConnectorDeliverySessionPolicy;
  accessDecision: ChannelConnectorDeliveryAccessDecision;
  explanation: string;
}

export type ChannelConnectorDeliveryResolutionErrorCode =
  | "account_not_found"
  | "account_disabled"
  | "policy_not_found"
  | "target_not_found"
  | "target_disabled";

export type ChannelConnectorDeliveryResolutionResult =
  | {
      ok: true;
      resolution: ChannelConnectorDeliveryResolution;
    }
  | {
      ok: false;
      code: ChannelConnectorDeliveryResolutionErrorCode;
      message: string;
    };

export type ChannelConnectorV3ValidationIssueCode =
  | "duplicate_id"
  | "duplicate_account_identity"
  | "duplicate_rule_match"
  | "enabled_account_missing_identity"
  | "enabled_account_missing_policy"
  | "invalid_value"
  | "invalid_reference"
  | "invalid_rule_match"
  | "invalid_target"
  | "non_restrictive_access_override"
  | "secret_outside_account";

export interface ChannelConnectorV3ValidationIssue {
  code: ChannelConnectorV3ValidationIssueCode;
  path: string;
  message: string;
}

export interface ChannelConnectorsV3ConfigResponse {
  ok: true;
  checkedAt: string;
  configPath: string;
  revision: string;
  config: ChannelConnectorsV3Config;
  validationIssues: ChannelConnectorV3ValidationIssue[];
  canApply: boolean;
}

export interface ChannelConnectorsV3SemanticDiff {
  accountsAdded: string[];
  accountsRemoved: string[];
  accountsReconnected: string[];
  resolverAccountsChanged: string[];
  targetsAdded: string[];
  targetsRemoved: string[];
  targetsChanged: string[];
  existingSessionsAffected: number;
  requiresDaemonReload: boolean;
}

export interface ChannelConnectorsV3ConfigPlanRequest {
  config?: ChannelConnectorsV3Config;
  expectedRevision?: string | null;
}

export interface ChannelConnectorsV3ConfigPlanResponse {
  ok: boolean;
  checkedAt: string;
  planId: string | null;
  currentRevision: string;
  expiresAt: string | null;
  config: ChannelConnectorsV3Config;
  validationIssues: ChannelConnectorV3ValidationIssue[];
  diff: ChannelConnectorsV3SemanticDiff;
}

export interface ChannelConnectorsV3ConfigApplyRequest {
  planId?: string | null;
  config?: ChannelConnectorsV3Config;
  reloadMode?: ChannelConnectorsDaemonReloadMode;
  rollbackOnFailure?: boolean;
}

export interface ChannelConnectorsV3ConfigApplyResponse {
  ok: boolean;
  checkedAt: string;
  accepted: boolean;
  persisted: boolean;
  rolledBack: boolean;
  config: ChannelConnectorsV3Config;
  revision: string;
  reload: ChannelConnectorsDaemonReloadResponse;
  rollbackReload: ChannelConnectorsDaemonReloadResponse | null;
  error: string | null;
}

export interface ChannelConnectorV3RoutingPreviewRequest {
  context?: ChannelConnectorIngressRoutingContext;
  config?: ChannelConnectorsV3Config;
}

export interface ChannelConnectorV3RoutingPreviewResponse {
  ok: true;
  checkedAt: string;
  result: ChannelConnectorDeliveryResolutionResult;
}

export interface ChannelConnectorAccountSecretsResponse {
  ok: true;
  checkedAt: string;
  accountId: string;
  secrets: Record<string, string>;
}

export type ChannelConnectorFeishuAppRegistrationTenant = "feishu" | "lark";

export type ChannelConnectorFeishuAppRegistrationStatus =
  | "qr-ready"
  | "polling"
  | "slow-down"
  | "domain-switched"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export interface ChannelConnectorFeishuAppRegistrationStartRequest {
  tenant?: ChannelConnectorFeishuAppRegistrationTenant;
  appName?: string | null;
  appDescription?: string | null;
}

export interface ChannelConnectorFeishuAppRegistrationResult {
  appId: string;
  appSecret: string;
  tenant: ChannelConnectorFeishuAppRegistrationTenant;
  apiUrl: string;
  userOpenId: string | null;
}

export interface ChannelConnectorFeishuAppRegistrationSessionResponse {
  ok: true;
  checkedAt: string;
  sessionId: string;
  status: ChannelConnectorFeishuAppRegistrationStatus;
  tenant: ChannelConnectorFeishuAppRegistrationTenant;
  qrUrl: string | null;
  expiresAt: string | null;
  intervalSeconds: number | null;
  result: ChannelConnectorFeishuAppRegistrationResult | null;
  error: string | null;
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
  reloadMode?: ChannelConnectorsDaemonReloadMode;
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
  reload: ChannelConnectorsDaemonReloadResponse | null;
  diagnostics: string[];
}

export interface ChannelConnectorAgentSessionDriverBindingStatus {
  projectId: string;
  bindingId: string;
  platform: string;
  accountId: string;
  botId: string | null;
  peerKind: string | null;
  peerId: string | null;
  agent: ChannelConnectorAgentId | string;
  model: string | null;
  permissionMode: ChannelConnectorPermissionMode | null;
  workDir: string;
  requestedMode: "one-shot" | "persistent";
  effectiveMode: "one-shot" | "persistent";
  reason: "default" | "codex-app-server" | "claude-code-stream-json" | "opencode-run-session" | "unsupported-agent";
}


export interface ChannelConnectorAgentSessionControlStatus {
  activeProjectId: string | null;
  sessionName: string | null;
  model: string | null;
  reasoningEffort: ChannelConnectorReasoningEffort | null;
  permissionMode: ChannelConnectorPermissionMode | null;
  workDir: string | null;
  workDirHistory: string[];
  thinkingMessages: boolean | null;
  processMessages: boolean | null;
  toolMessages: boolean | null;
  autoVisionModel: boolean | null;
  visionModel: string | null;
  updatedAt: string;
  lastCommand: string | null;
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
  sessionControl: ChannelConnectorAgentSessionControlStatus | null;
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
  defaultMode: "persistent";
  implementation: "native-cli-session-drivers";
  persistentDriverReady: true;
  policy: {
    idleTimeoutMs: number;
    maxSessions: number;
    maxConcurrentTurns?: number;
    activeTurns?: number;
    queuedTurns?: number;
    fallbackOnCrash: boolean;
    busyStrategy?: ChannelConnectorBusyStrategy;
    queueMaxRecords?: number;
    queueMaxAgeMs?: number;
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
  reset?: {
    requested: boolean;
    bindingId: string;
    sessionKey: string;
    controlsCleared: boolean;
    sessionsCleared: number;
    historyCleared: number;
    killed: boolean;
    poolKey: string | null;
  } | null;
}

export interface ChannelConnectorsDaemonRuntimeAutoCompactRecord {
  checkedAt: string;
  bindingId: string;
  sessionKey: string;
  projectId: string;
  agent: string;
  model: string | null;
  workDir: string;
  messageId: string;
  action: "native" | "fallback" | "skipped";
  ok: boolean | null;
  reason: "threshold-reached" | "cooldown" | "native-blocked" | "fallback-failed";
  usageSource: ChannelConnectorContextBudgetSummary["usageSource"];
  usedTokens: number | null;
  effectiveUsedTokens: number | null;
  contextWindow: number | null;
  autoCompactTokenLimit: number | null;
  remainingTokens: number | null;
  nativeAttempted: boolean;
  fallbackAttempted: boolean;
  beforeEntries: number | null;
  afterEntries: number | null;
  sessionsCleared: number | null;
  summaryPreview: string | null;
  error: string | null;
  cooldownStartedAt: string | null;
  cooldownUntil: string | null;
}

export interface ChannelConnectorsDaemonRuntimeFeishuConnectionStatus {
  key: string;
  accountId: string;
  externalAccountId: string;
  bindingIds: string[];
  connected: boolean;
  state: string;
  ingressState: string;
  ingressVerified: boolean;
  transportVerified: boolean;
  pongWaitingForMs: number;
  pongOverdue: boolean;
  sdkConnected?: boolean;
  transportStaleForMs?: number;
  transportStaleAfterMs?: number;
  transportStale?: boolean;
  botOpenId: string | null;
  botName: string | null;
  botIdentityResolvedAt: string | null;
  botIdentityLastError: string | null;
  botIdentityRequestCount: number;
  botIdentityStatusCode: number | null;
  botIdentityTokenCache: "disabled" | "hit" | "miss" | "refresh" | null;
  lastPingAt: string | null;
  lastPongAt: string | null;
  lastReceivedAt: string | null;
  lastRawEventFrameAt: string | null;
  lastError: string | null;
}

export interface ChannelConnectorsDaemonRuntimeOctoConnectionStatus {
  bindingId: string;
  bindingIds: string[];
  accountId: string;
  externalAccountId: string;
  botId: string | null;
  robotId: string | null;
  connected: boolean;
  state: string;
  lastError: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  reconnects: number;
  receivedMessages: number;
  credentialSource: "register" | "cache" | null;
  restHeartbeatIntervalMs: number;
  restHeartbeatSuccesses: number;
  restHeartbeatFailures: number;
  restHeartbeatLastOkAt: string | null;
  restHeartbeatLastErrorAt: string | null;
  restHeartbeatLastError: string | null;
}

export interface ChannelConnectorsDaemonRuntimePendingAgentRunRecord {
  id: string;
  adapter: "octo" | "feishu";
  bindingId: string;
  projectId: string;
  sessionKey: string;
  messageId: string;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  ageMs: number | null;
}

export interface ChannelConnectorsDaemonRuntimePendingAgentRunEvent {
  checkedAt: string;
  eventKind: "channel.agent.pending_replay" | "channel.agent.pending_replay_failed" | "channel.agent.pending_dropped";
  adapter: "octo" | "feishu";
  bindingId: string;
  projectId: string | null;
  sessionKey: string | null;
  messageId: string | null;
  pendingRunId: string | null;
  attempt: number | null;
  queuedAt: string | null;
  reason: string | null;
  error: string | null;
}

export interface ChannelConnectorsDaemonRuntimePendingAgentRunStatus {
  count: number;
  oldestQueuedAt: string | null;
  records: ChannelConnectorsDaemonRuntimePendingAgentRunRecord[];
  recentEvents: ChannelConnectorsDaemonRuntimePendingAgentRunEvent[];
}

export interface ChannelConnectorsDaemonRuntimeReplyOutboxDeadLetter {
  id: string;
  platform: "feishu" | "octo";
  accountId: string;
  sourceMessageId: string;
  attempts: number;
  updatedAt: string;
  lastError: string | null;
}

export interface ChannelConnectorsDaemonRuntimeReplyOutboxStatus {
  pending: number;
  delivered: number;
  deadLetter: number;
  oldestPendingAt: string | null;
  recentDeadLetters: ChannelConnectorsDaemonRuntimeReplyOutboxDeadLetter[];
}

export interface ChannelConnectorsDaemonRuntimeStatus {
  ok: boolean;
  checkedAt: string;
  reachable: boolean;
  implementation: "tracevane-native" | string | null;
  pid: number | null;
  projects: number | null;
  platformBindings: number | null;
  octoConnections: number | null;
  octoConnectionDetails: ChannelConnectorsDaemonRuntimeOctoConnectionStatus[];
  feishuConnections: number | null;
  feishuConnectionDetails: ChannelConnectorsDaemonRuntimeFeishuConnectionStatus[];
  activeRuns: number | null;
  agentRuns: number | null;
  autoCompacts: ChannelConnectorsDaemonRuntimeAutoCompactRecord[];
  pendingAgentRuns: ChannelConnectorsDaemonRuntimePendingAgentRunStatus;
  replyOutbox: ChannelConnectorsDaemonRuntimeReplyOutboxStatus;
  ingressQueue: {
    activeAccounts: number;
    queued: number;
    completed: number;
    failed: number;
    duplicates: number;
  } | null;
  reload: ChannelConnectorsDaemonReloadState | null;
  error: string | null;
}

export interface ChannelConnectorAgentSessionActionRequest {
  action?: "status" | "reap-idle" | "kill" | "reset-conversation";
  poolKey?: string | null;
  bindingId?: string | null;
  sessionKey?: string | null;
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
  implementation: "tracevane-native";
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
    tracevaneRuntimeDependency: false;
    openclawRuntimeDependency: false;
    modelRelayOwner: "tracevane-gateway-daemon";
    channelDaemonOwner: "tracevane-native-channel-daemon";
  };
  service: ChannelConnectorsDaemonResponse;
  runtime: ChannelConnectorsDaemonRuntimeStatus;
}
