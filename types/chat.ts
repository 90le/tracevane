export type ChatSessionKind = 'tracevane_managed' | 'observed_external' | 'system_internal';
export type ChatProtocolMode = 'legacy' | 'dual_write' | 'canonical_v1';

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';

export type ChatRunState = 'idle' | 'running' | 'streaming' | 'completed' | 'aborted' | 'error' | 'unknown';

export type ChatAgentLifecyclePhase = 'start' | 'end' | 'error';

export type ChatToolStatus = 'running' | 'completed' | 'error';
export type ChatRunProjectionLifecycle = 'queued' | 'running' | 'completed' | 'aborted' | 'error';
export type ChatQueuedMessageStatus = 'queued' | 'blocked';

export type ChatActivityKind = 'lifecycle' | 'assistant' | 'tool_call' | 'tool_result' | 'usage';

export type ChatActivityLevel = 'info' | 'success' | 'warning' | 'error';
export type ChatProcessBlockKind = 'thinking' | 'reasoning';

export type ChatAttachmentKind = 'image' | 'video' | 'file';
export type ChatResourceSource =
  | 'user_upload'
  | 'tool_artifact'
  | 'structured_message'
  | 'tracevane_delivery'
  | 'assistant_markdown'
  | 'tracevane_resource';
export type ChatResourceStatus = 'ready' | 'missing';
export type ChatResourcePlacement = 'append';
export type ChatInlineResourceDisplay =
  | 'inline-image'
  | 'inline-video'
  | 'inline-chip'
  | 'break-image'
  | 'break-video'
  | 'break-chip';
export type ChatResourceBlockDisplay = 'card';
export type ChatComposerResourceDisplay = ChatInlineResourceDisplay;

export type ChatContractErrorCode =
  | 'gateway_down'
  | 'auth_failure'
  | 'session_not_found'
  | 'session_not_writable'
  | 'history_truncated'
  | 'duplicate_in_flight'
  | 'no_active_run'
  | 'invalid_request'
  | 'internal_error';

export interface ChatContractError {
  code: ChatContractErrorCode;
  message: string;
  retryable: boolean;
  source: 'tracevane' | 'gateway';
}

export interface ChatRuntimeState {
  gatewayConnected: boolean;
  sessionWritable: boolean;
  activeRunId: string | null;
  state: ChatRunState;
  lastEventAt: string | null;
  lastAckAt: string | null;
  lastErrorCode: ChatContractErrorCode | null;
  lastErrorMessage: string | null;
}

export interface ChatSessionControlState {
  allowHostManagementExec: boolean;
  updatedAt: string | null;
}

export interface ChatUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
}

export interface ChatLifecycleSignal {
  phase: ChatAgentLifecyclePhase;
  runId: string | null;
  emittedAt: string;
  errorMessage: string | null;
}

export interface ChatResourceItem {
  id: string;
  kind: ChatAttachmentKind;
  url: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string | null;
  relativePath?: string;
  originalPath?: string;
  source: ChatResourceSource;
  status: ChatResourceStatus;
  placement: ChatResourcePlacement;
  toolCallId?: string | null;
}

export interface ChatToolArtifactItem extends ChatResourceItem {}

export interface ChatToolCard {
  toolCallId: string;
  runId: string | null;
  name: string;
  status: ChatToolStatus;
  startedAt: string | null;
  updatedAt: string | null;
  argsPreview: string | null;
  resultPreview: string | null;
  isError: boolean;
  artifacts?: ChatToolArtifactItem[];
}

export interface ChatMessageToolCallItem {
  toolCallId: string;
  runId: string | null;
  name: string;
  status: ChatToolStatus;
  startedAt: string | null;
  updatedAt: string | null;
  argsPreview: string | null;
  resultPreview: string | null;
  isError: boolean;
  artifacts?: ChatToolArtifactItem[];
}

export interface ChatActivityItem {
  id: string;
  kind: ChatActivityKind;
  runId: string | null;
  toolCallId: string | null;
  emittedAt: string;
  title: string;
  detail: string | null;
  level: ChatActivityLevel;
}

export interface ChatObservabilityState {
  lifecycle: ChatLifecycleSignal | null;
  toolCards: ChatToolCard[];
  usage: ChatUsageSummary | null;
  timeline: ChatActivityItem[];
}

export interface ChatSessionPermissions {
  writable: boolean;
  canSend: boolean;
  canAbort: boolean;
  canReset: boolean;
  canDelete: boolean;
  canInject: boolean;
  visibleInFrontend: boolean;
  visibleInMvpRail: boolean;
}

export interface ChatSessionSource {
  source: 'tracevane' | 'external' | 'system';
  channel: string | null;
  surface: string | null;
  originLabel: string | null;
}

export interface ChatDeliveryContext {
  channel: string | null;
  accountId: string | null;
  to: string | null;
  threadId: string | null;
}

export interface ChatSessionPresentation {
  archived: boolean;
  archivedAt: string | null;
  customLabel: string | null;
  autoLabel?: string | null;
}

export interface ChatSessionRow {
  key: string;
  agentId: string;
  sessionId: string | null;
  kind: ChatSessionKind;
  label: string;
  derivedTitle: string | null;
  lastMessagePreview: string | null;
  updatedAt: string | null;
  presentation: ChatSessionPresentation;
  source: ChatSessionSource;
  deliveryContext: ChatDeliveryContext;
  permissions: ChatSessionPermissions;
  runtime: ChatRuntimeState;
}

export type ChatSessionFolderMove = 'up' | 'down' | 'top';

export interface ChatSessionFolder {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  collapsed: boolean;
}

export interface ChatSessionOrganizerState {
  folders: ChatSessionFolder[];
  folderOrder: string[];
  childFolderOrder: Record<string, string[]>;
  rootSessionOrder: string[];
  folderSessionOrder: Record<string, string[]>;
  sessionFolderMap: Record<string, string | null>;
}

export interface ChatMessageMediaItem {
  id: string;
  kind: ChatAttachmentKind;
  url: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string | null;
  relativePath?: string;
  originalPath?: string;
  source: ChatResourceSource;
  status: ChatResourceStatus;
  placement: ChatResourcePlacement;
  toolCallId?: string | null;
}

export interface ChatMessageTextBlock {
  type: 'text';
  text: string;
}

export interface ChatMessageTextSegment {
  type: 'text';
  text: string;
}

export interface ChatMessageResourceSegment {
  type: 'resource';
  resourceId: string;
  display: ChatInlineResourceDisplay;
}

export type ChatInlineSegment = ChatMessageTextSegment | ChatMessageResourceSegment;

export interface ChatMessageParagraphBlock {
  type: 'paragraph';
  segments: ChatInlineSegment[];
}

export interface ChatMessageResourceBlock {
  type: 'resource';
  resourceId: string;
  display?: ChatResourceBlockDisplay;
}

export type ChatMessageBlock = ChatMessageTextBlock | ChatMessageParagraphBlock | ChatMessageResourceBlock;

export interface ChatProcessBlock {
  id: string;
  kind: ChatProcessBlockKind;
  text: string;
}

export interface ChatComposerTextNode {
  type: 'text';
  id: string;
  text: string;
}

export interface ChatComposerResourceRefNode {
  type: 'resource-ref';
  id: string;
  attachmentId: string;
  display: ChatComposerResourceDisplay;
}

export type ChatComposerNode = ChatComposerTextNode | ChatComposerResourceRefNode;
export type ChatComposerDocument = ChatComposerNode[];

export interface ChatSendFileRef {
  id: string;
  relativePath: string;
  resourceRef?: string;
  fileName: string;
  kind: ChatAttachmentKind;
  mimeType: string | null;
}

export interface ChatMessageItem {
  id: string;
  role: ChatMessageRole;
  text: string;
  createdAt: string | null;
  source: 'history' | 'stream' | 'inject';
  runId: string | null;
  truncated: boolean;
  omitted: boolean;
  aborted: boolean;
  stopReason: string | null;
  toolCalls?: ChatMessageToolCallItem[];
  blocks?: ChatMessageBlock[];
  processBlocks?: ChatProcessBlock[];
  resources?: ChatResourceItem[];
  // Deprecated compatibility field for older callers.
  media?: ChatMessageMediaItem[];
}

export interface ChatRunProjection {
  sessionKey: string;
  runId: string;
  startedAt: string;
  updatedAt: string;
  lifecycle: ChatRunProjectionLifecycle;
  previewText: string;
  toolCalls: ChatMessageToolCallItem[];
  finalMessageId: string | null;
  finalCreatedAt: string | null;
  firstAssistantSeenAt: string | null;
  firstToolStartedAt: string | null;
  sequence: number;
}

export interface ChatRunOverlay {
  runId: string;
  startedAt: string;
  updatedAt: string;
  lifecycle: ChatRunProjectionLifecycle;
  previewText: string;
  toolCalls: ChatMessageToolCallItem[];
  finalMessageId: string | null;
  finalCreatedAt: string | null;
  firstAssistantSeenAt: string | null;
  firstToolStartedAt: string | null;
  sequence: number;
}

export interface ChatDiagnostics {
  gatewayReachable: boolean;
  gatewayWsUrl: string;
  transport: 'tracevane_bff';
  authMode: 'tracevane_backend_token';
  rawGatewayFramesExposed: false;
  rawGatewayMethodsExposed: false;
  sameOriginRequired: boolean;
  historyTruncated: boolean;
  truncationMode: 'none' | 'tail_marked' | 'omitted_placeholder';
  notes: string[];
}

export type ChatHealthPayload = ChatDiagnostics;

export interface ChatHistoryCursor {
  source: 'history_window' | 'history_search';
  anchorIndex: number;
  anchorMessageId: string | null;
  anchorCreatedAt: string | null;
  day: string | null;
  query: string | null;
  roleFilter: ChatHistorySearchRoleFilter | null;
  contentFilter: ChatHistorySearchContentFilter | null;
}

export type ChatHistorySearchRoleFilter = 'all' | 'user' | 'assistant' | 'tool';
export type ChatHistorySearchContentFilter = 'all' | 'text' | 'resource' | 'code';

export interface ChatHistorySearchMatch {
  messageId: string;
  role: ChatMessageRole;
  createdAt: string | null;
  day: string | null;
  snippet: string;
}

export interface ChatHistoryPageInfo {
  hasMoreBefore: boolean;
  beforeCursor: string | null;
  hasMoreAfter: boolean;
  afterCursor: string | null;
}

export interface ChatHistoryDateBucket {
  day: string;
  count: number;
  firstMessageId: string;
  lastMessageId: string;
}

export interface ChatHistoryPagePayload {
  checkedAt: string;
  session: ChatSessionRow;
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
  runtime: ChatRuntimeState;
  diagnostics: ChatDiagnostics;
  observability: ChatObservabilityState;
  pageInfo: ChatHistoryPageInfo;
  day: string | null;
}

export interface ChatHistoryPayload extends ChatHistoryPagePayload {}

export interface ChatHistorySearchPayload {
  checkedAt: string;
  session: ChatSessionRow;
  query: string;
  roleFilter: ChatHistorySearchRoleFilter;
  contentFilter: ChatHistorySearchContentFilter;
  day: string | null;
  matches: ChatHistorySearchMatch[];
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
  runtime: ChatRuntimeState;
  diagnostics: ChatDiagnostics;
  pageInfo: ChatHistoryPageInfo;
}

export interface ChatHistoryDatesPayload {
  checkedAt: string;
  session: ChatSessionRow;
  diagnostics: ChatDiagnostics;
  days: ChatHistoryDateBucket[];
}

export interface ChatSessionsPayload {
  checkedAt: string;
  agentId: string;
  sessions: ChatSessionRow[];
  diagnostics: ChatDiagnostics;
}

export interface ChatBootstrapPayload {
  checkedAt: string;
  organizer: ChatSessionOrganizerState;
  sessions: ChatSessionRow[];
  selectedSessionKey: string | null;
  history: ChatHistoryPayload | null;
  queue: ChatQueuePayload | null;
  controls: ChatSessionControlsPayload | null;
  diagnostics: ChatDiagnostics;
}

export interface ChatOrganizerPayload {
  checkedAt: string;
  organizer: ChatSessionOrganizerState;
}

export interface ChatCreateSessionRequest {
  label?: string;
}

export interface ChatCreateSessionResponse {
  ok: boolean;
  session: ChatSessionRow;
  runtime: ChatRuntimeState;
}

export interface ChatPatchSessionRequest {
  label?: string | null;
  archived?: boolean;
}

export interface ChatPatchSessionResponse {
  ok: boolean;
  session: ChatSessionRow;
}

export interface ChatCreateOrganizerFolderRequest {
  title: string;
  parentId?: string | null;
}

export interface ChatCreateOrganizerFolderResponse extends ChatOrganizerPayload {
  ok: boolean;
  folder: ChatSessionFolder;
}

export interface ChatPatchOrganizerFolderRequest {
  title?: string | null;
  collapsed?: boolean;
  move?: ChatSessionFolderMove;
}

export interface ChatPatchOrganizerFolderResponse extends ChatOrganizerPayload {
  ok: boolean;
  folder: ChatSessionFolder;
}

export interface ChatDeleteOrganizerFolderResponse extends ChatOrganizerPayload {
  ok: boolean;
  folderId: string;
}

export interface ChatAssignSessionsToFolderRequest {
  sessionKeys: string[];
  folderId: string | null;
}

export interface ChatAssignSessionsToFolderResponse extends ChatOrganizerPayload {
  ok: boolean;
  sessionKeys: string[];
  folderId: string | null;
}

export interface ChatSendAttachment {
  type: ChatAttachmentKind;
  mimeType: string;
  fileName?: string;
  content: string;
}

export interface ChatSendRequest {
  text: string;
  clientRequestId?: string;
  flushWhenIdle?: boolean;
  thinking?: string | null;
  composerDocument?: ChatComposerDocument;
  fileRefs?: ChatSendFileRef[];
  attachments?: ChatSendAttachment[];
}

export interface ChatQueuedMessageItem {
  id: string;
  sessionKey: string;
  clientRequestId: string | null;
  deliveryRequestId: string;
  text: string;
  previewText: string;
  composerDocument?: ChatComposerDocument;
  fileRefs?: ChatSendFileRef[];
  attachments?: ChatSendAttachment[];
  createdAt: string;
  updatedAt: string;
  status: ChatQueuedMessageStatus;
  blockedReason: string | null;
}

export interface ChatQueuePayload {
  checkedAt: string;
  session: ChatSessionRow;
  items: ChatQueuedMessageItem[];
}

export interface ChatPatchQueueEntryRequest extends ChatSendRequest {}

export interface ChatSessionControlsPayload {
  checkedAt: string;
  session: ChatSessionRow;
  globalHostManagementExecEnabled: boolean;
  controls: ChatSessionControlState;
}

export interface ChatPatchSessionControlsRequest {
  allowHostManagementExec: boolean;
}

export type ChatSendStatus = 'started' | 'duplicate_in_flight' | 'duplicate_completed';

export interface ChatSendAck {
  accepted: boolean;
  sessionKey: string;
  sessionId: string | null;
  requestId: string;
  runId: string;
  status: ChatSendStatus;
  runtime: ChatRuntimeState;
}

export interface ChatAbortResponse {
  ok: boolean;
  sessionKey: string;
  hadActiveRun: boolean;
  aborted: boolean;
  runIds: string[];
  runtime: ChatRuntimeState;
}

export interface ChatResetResponse {
  ok: boolean;
  session: ChatSessionRow;
  runtime: ChatRuntimeState;
}

export interface ChatDeleteSessionResponse {
  ok: boolean;
  sessionKey: string;
}

export interface ChatFileUploadRequest {
  fileName: string;
  content: string; // base64 encoded
  mimeType?: string;
}

export interface ChatFileUploadResponse {
  ok: boolean;
  relativePath: string; // relative path from workspace root, for @path reference
  resourceRef: string;
  resource: ChatResourceItem;
  absolutePath: string;
  fileName: string;
  mimeType: string | null;
  kind: ChatAttachmentKind;
  size: number;
}

export interface ChatResourceResolveRequest {
  refs: string[];
}

export interface ChatResolvedResourceItem {
  ref: string;
  resourceRef: string | null;
  aiReadable: boolean;
  resource: ChatResourceItem | null;
}

export interface ChatResourceResolveResponse {
  ok: boolean;
  sessionKey: string;
  resources: ChatResolvedResourceItem[];
}

export type ChatCanonicalSnapshotSource = 'local_transcript' | 'history_sse' | 'history_rpc' | 'tracevane_mirror';
export type ChatCanonicalMessageSource = 'local_transcript' | 'history_sse' | 'session.message' | 'tracevane_bff';
export type ChatTemporaryToolSource = 'session.tool' | 'agent.tool' | 'tracevane_bff';
export type ChatSideResultKind = 'btw';

export interface ChatSideResult {
  kind: ChatSideResultKind;
  question: string;
  text: string;
  isError: boolean;
}

export type ChatStreamEvent = (
  {
    kind: 'queue.state';
    sessionKey: string;
    emittedAt: string;
    items: ChatQueuedMessageItem[];
  }
  | {
    kind: 'session.controls';
    sessionKey: string;
    emittedAt: string;
    globalHostManagementExecEnabled?: boolean;
    controls: ChatSessionControlState;
  }
  | {
    kind: 'side_result';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    result: ChatSideResult;
  }
  | {
    kind: 'ack';
    sessionKey: string;
    runId: string;
    requestId: string;
    emittedAt: string;
    status: ChatSendStatus;
    runtime: ChatRuntimeState;
  }
  | {
    kind: 'canonical.snapshot';
    sessionKey: string;
    emittedAt: string;
    version: string;
    messages: ChatMessageItem[];
    overlays: ChatRunOverlay[];
    pageInfo?: ChatHistoryPageInfo;
    runtime: ChatRuntimeState;
    source: ChatCanonicalSnapshotSource;
  }
  | {
    kind: 'canonical.message';
    sessionKey: string;
    emittedAt: string;
    message: ChatMessageItem;
    messageId: string;
    messageSeq: number;
    version: string;
    source: ChatCanonicalMessageSource;
  }
  | {
    kind: 'temporary.assistant';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    textDelta: string;
    accumulatedText: string;
  }
  | {
    kind: 'temporary.tool';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    partial: boolean;
    tool: ChatToolCard;
    source: ChatTemporaryToolSource;
  }
  | {
    kind: 'runtime.state';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    runtime: ChatRuntimeState;
  }
  | {
    kind: 'run_overlay';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    overlay: ChatRunOverlay;
    terminal: boolean;
  }
  | {
    kind: 'delta';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    textDelta: string;
    accumulatedText: string;
    message?: ChatMessageItem | null;
  }
  | {
    kind: 'final';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    message: ChatMessageItem;
    runtime: ChatRuntimeState;
    usage: ChatUsageSummary | null;
  }
  | {
    kind: 'aborted';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    stopReason: string | null;
    partialMessage: ChatMessageItem | null;
    runtime: ChatRuntimeState;
  }
  | {
    kind: 'error';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    error: ChatContractError;
    runtime: ChatRuntimeState;
  }
  | {
    kind: 'runtime';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    runtime: ChatRuntimeState;
  }
  | {
    kind: 'assistant_delivery';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    message: ChatMessageItem;
  }
  | {
    kind: 'agent_lifecycle';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    lifecycle: ChatLifecycleSignal;
  }
  | {
    kind: 'agent_assistant';
    sessionKey: string;
    runId: string;
    emittedAt: string;
    text: string;
    textPreview: string;
    deltaText: string | null;
  }
  | {
    kind: 'agent_tool_call';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    tool: ChatToolCard;
  }
  | {
    kind: 'agent_tool_result';
    sessionKey: string;
    runId: string | null;
    emittedAt: string;
    partial: boolean;
    tool: ChatToolCard;
  }
) & {
  streamSeq?: number;
};

export interface ChatGatewayAttachPayload {
  sessionKey: string;
  bootstrapSnapshot?: boolean;
  lastStreamSeq?: number | null;
}

export interface ChatGatewayHeartbeatPayload {
  sessionKey: string;
}

export interface ChatGatewayDetachPayload {
  sessionKey?: string | null;
}

export interface ChatGatewaySendPayload extends ChatSendRequest {
  sessionKey: string;
}

export interface ChatGatewayAbortPayload {
  sessionKey: string;
}

export interface ChatGatewayPolicySyncPayload {
  globalHostManagementExecEnabled?: boolean;
  sessionKey?: string | null;
  allowHostManagementExec?: boolean;
}

export interface ChatGatewayAttachResponse {
  sessionKey: string;
  leaseTtlMs: number;
  events: ChatStreamEvent[];
}

export interface ChatGatewayAckResponse {
  ok: true;
  sessionKey: string;
}

export const TRACEVANE_CHAT_GATEWAY_EVENT = 'tracevane.chat';

export const TRACEVANE_CHAT_GATEWAY_METHODS = {
  attach: 'tracevane.chat.attach',
  heartbeat: 'tracevane.chat.heartbeat',
  detach: 'tracevane.chat.detach',
  send: 'tracevane.chat.send',
  abort: 'tracevane.chat.abort',
  policySync: 'tracevane.chat.policy.sync',
} as const;
