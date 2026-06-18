import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import { TRACEVANE_CHAT_GATEWAY_METHODS } from '../../../../types/chat.js';
import type {
  ChatAbortResponse,
  ChatGatewayAckResponse,
  ChatGatewayAttachPayload,
  ChatGatewayAttachResponse,
  ChatGatewayDetachPayload,
  ChatGatewayHeartbeatPayload,
  ChatAssignSessionsToFolderRequest,
  ChatAssignSessionsToFolderResponse,
  ChatCreateOrganizerFolderRequest,
  ChatCreateOrganizerFolderResponse,
  ChatCreateSessionRequest,
  ChatCreateSessionResponse,
  ChatBootstrapPayload,
  ChatDeleteSessionResponse,
  ChatDeleteOrganizerFolderResponse,
  ChatDiagnostics,
  ChatFileUploadRequest,
  ChatFileUploadResponse,
  ChatHistoryCursor,
  ChatHistoryDateBucket,
  ChatHistoryDatesPayload,
  ChatHistoryPayload,
  ChatHistorySearchContentFilter,
  ChatHistorySearchMatch,
  ChatHistorySearchRoleFilter,
  ChatHistorySearchPayload,
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatObservabilityState,
  ChatOrganizerPayload,
  ChatPatchQueueEntryRequest,
  ChatPatchOrganizerFolderRequest,
  ChatPatchOrganizerFolderResponse,
  ChatPatchSessionRequest,
  ChatPatchSessionResponse,
  ChatPatchSessionControlsRequest,
  ChatQueuePayload,
  ChatQueuedMessageItem,
  ChatResourceResolveRequest,
  ChatResourceResolveResponse,
  ChatResourceItem,
  ChatRunProjection,
  ChatRunOverlay,
  ChatResetResponse,
  ChatRuntimeState,
  ChatSendAck,
  ChatSendFileRef,
  ChatSendStatus,
  ChatSendRequest,
  ChatSessionControlState,
  ChatSessionControlsPayload,
  ChatSessionFolder,
  ChatSessionKind,
  ChatSessionOrganizerState,
  ChatSessionRow,
  ChatProtocolMode,
  ChatSessionsPayload,
  ChatStreamEvent,
  ChatToolCard,
} from '../../../../types/chat.js';
import type { SystemService } from '../system/service.js';
import { readJsonFile, writeJsonFile } from '../../core/state.js';
import { CHAT_API_PATHS, CHAT_PROTOCOL_MODE_DEFAULT, CHAT_SEND_STATUS_MAP } from './contract.js';
import {
  CHAT_POLICY_DEFAULTS,
  buildChatSessionPermissions,
  classifyChatSessionKind,
} from './session-policy.js';
import {
  isTracevaneChatWsPath,
  resolveTracevaneChatCorsOrigin,
  sendSseEvent,
  startSse,
} from '../../core/http.js';
import {
  appendTimelineItem,
  compactObservabilityState,
  cloneObservabilityState,
  createEmptyObservabilityState,
  deriveObservabilityFromHistory,
  normalizeUsageSummary,
  upsertToolCard,
} from './observability.js';
import {
  buildSessionPresentation,
  buildDefaultSessionLabel,
  buildRuntimeState,
  buildTracevaneManagedRowFromRegistry,
  buildTracevaneManagedSessionRow,
  deriveAgentIdFromSessionKey,
  mapLocalSessionRow,
  readTracevaneChatRegistry,
  resolveTracevaneChatRegistryPath,
  resolveAgentSessionsStorePath,
  resolveAvailableAgentIds,
  TracevaneSessionRegistryEntry,
  LocalSessionRecord,
  writeTracevaneChatRegistry,
} from './session-model.js';
import {
  extractTranscriptRecord,
  extractTranscriptRole,
  extractTranscriptToolName,
  extractMessageText,
  dedupeTranscriptReplayEntries,
  isAssistantNoReplyMessage,
  isAssistantTracevaneDeliveryToolUseEnvelope,
  mapCanonicalEntriesFromParsedEntries,
  mapMessagesFromParsedEntries,
  mapTranscriptCanonicalEntry,
  mapTranscriptMessage,
  readTranscriptMessages,
  shouldSkipTranscriptLine,
  type TranscriptMappingOptions,
  type TranscriptCanonicalEntry,
  type TranscriptOverrideResult,
} from './transcript.js';
import {
  createTracevaneChatMediaBridge,
  type ResolvedChatMedia,
  safeStatSync,
} from './media-bridge.js';
import { createTracevaneChatMessageShadowStore } from './message-shadow-store.js';
import {
  cloneChatMessageToolCallItem,
  cloneChatRunProjection,
  createTracevaneChatRunProjectionStore,
  isRunProjectionTerminal,
  type TracevaneAssistantRunShadow,
} from './run-projection-store.js';
import { mapGatewayAgentEventPayload } from './agent-event-mapper.js';
import {
  LruMap,
  clipPreview,
  normalizeDate,
  normalizeString,
  summarizeUnknown,
} from './shared.js';
import {
  createTracevaneChatHistoryIndexStore,
  type ChatHistoryIndexSeedItem,
} from './history-index.js';
import {
  listRunOverlaysForHistorySnapshot,
  supplementHistoryWithRunState as supplementHistoryWithRunStateSnapshot,
} from './history-snapshot.js';
import { mergeCanonicalMessageLedger, normalizeMessageLedger } from '../../../../lib/chat-runtime-state.js';
import {
  clearChatStreamReplaySession,
  createChatStreamReplayState,
  listChatStreamEventsAfter,
  normalizeChatStreamSeq,
  rememberChatStreamEvent,
} from '../../../../lib/chat-stream-replay.js';
import {
  assignSessionsToFolderInOrganizer,
  createEmptyChatSessionOrganizerState,
  createFolderInOrganizer,
  deleteFolderFromOrganizer,
  normalizeChatSessionOrganizerState,
  patchFolderInOrganizer,
  pruneOrganizerStateSessionKeys,
  removeSessionsFromOrganizer,
} from '../../../../lib/chat-session-organizer.js';
import {
  buildComposerMessageBlocks,
  extractComposerPlainText,
  normalizeComposerDocument,
  serializeComposerDocumentToMarkdown,
} from '../../../../lib/composer-model.js';
import { buildTracevaneResourceRefFromRelativePath } from '../../../../lib/tracevane-resource-refs.js';
import {
  buildGatewayConnectRequest,
  loadGatewayAuthContext,
} from './gateway-auth.js';
import { requestGateway } from './gateway-request.js';
import {
  createSessionGatewayBridge,
  rejectBridgePending,
  requestViaBridge,
  type SessionGatewayBridge,
} from './session-bridge-manager.js';
import {
  ChatServiceError,
  buildChatError,
  isChatServiceError,
  mapGatewayContractError,
} from './errors.js';
import { createTracevaneChatOrganizerStore } from './organizer-store.js';
import { createTracevaneChatDurableMirrorStore } from './durable-mirror-store.js';
import { createTracevaneChatSessionCatalogStore } from './session-catalog-store.js';
import { createTracevaneChatSessionStateStore } from './session-state-store.js';
import { applyDerivedAutoLabelToSessionRow } from '../../../../lib/chat-session-auto-title.js';
import { maybeAutoApproveTracevaneHelperPairing } from '../system/device-trust.js';
import {
  clearTracevaneChatSessionHostManagementExecEnabled,
  getTracevaneChatGlobalHostManagementExecEnabled,
  setTracevaneChatSessionHostManagementExecEnabled,
} from '../../../../lib/tracevane-chat-management-policy.js';
import {
  buildChatDiagnosticsSummary,
  buildChatSessionRuntimeSummary,
} from './runtime-summary.js';
import { buildHistorySearchSummary } from './history-search-summary.js';

interface TracevaneManagedSessionState {
  row: ChatSessionRow;
  messages: ChatMessageItem[];
  diagnosticsNotes: string[];
  observability: ChatObservabilityState;
  pendingQueue: ChatQueuedMessageItem[];
  controls: ChatSessionControlState;
  materialized?: boolean;
  resetPending?: boolean;
  clearedAt?: string | null;
}

interface ChatSubscriber {
  socket: WebSocket;
  sessionKey: string;
  closeBridge: () => void;
}

interface ChatGatewaySubscriber {
  connId: string;
  emit: (event: ChatStreamEvent) => boolean;
  lastLeaseAt: number;
}

interface ChatGatewayRuntime {
  connId: string;
  emit: (event: ChatStreamEvent) => boolean;
}

type ChatCanonicalSourceSelection =
  | {
    kind: 'local_transcript';
    agentId: string;
    record: LocalSessionRecord | null;
    sessionFile: string;
    sourceMtimeMs: number | null;
    priorSessionFiles: string[];
  }
  | {
    kind: 'official_canonical_stream';
    agentId: string;
    record: LocalSessionRecord | null;
    sessionFile: null;
    sourceMtimeMs: null;
    priorSessionFiles: string[];
  };

interface ChatCanonicalEntry {
  message: ChatMessageItem;
  messageId: string;
  messageSeq: number;
  identityKey: string;
}

interface ChatCanonicalState {
  sessionKey: string;
  version: string;
  source: 'local_transcript' | 'history_sse' | 'history_rpc' | 'tracevane_mirror';
  entries: ChatCanonicalEntry[];
  pageInfo?: ChatHistoryPayload['pageInfo'];
}

interface HistorySnapshotCacheEntry {
  signature: string;
  session: ChatSessionRow;
  messages: ChatMessageItem[];
  canonicalEntries: ChatCanonicalEntry[];
  canonicalSource: ChatCanonicalState['source'];
  observability: ChatObservabilityState;
  toolCards: ChatToolCard[];
  sourceSessionFile: string | null;
  sourceMtimeMs: number | null;
  historyTruncated: boolean;
  truncationMode: ChatDiagnostics['truncationMode'];
}

interface OfficialCanonicalStreamState {
  sessionKey: string;
  controller: AbortController | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  resyncPromise: Promise<void> | null;
  active: boolean;
}

function formatGatewayFileRef(relativePath: string): string {
  return /\s/.test(relativePath) ? `@"${relativePath}"` : `@${relativePath}`;
}

const CHAT_GATEWAY_LEASE_MS = 35_000;
const CHAT_GATEWAY_SWEEP_INTERVAL_MS = 10_000;
const CHAT_GATEWAY_HEALTH_CACHE_MS = 1_500;
const CHAT_GATEWAY_CONNECT_TIMEOUT_MS = 800;
const CHAT_CANONICAL_SNAPSHOT_WINDOW_LIMIT = 80;
const CHAT_CANONICAL_STATE_ENTRY_LIMIT = CHAT_CANONICAL_SNAPSHOT_WINDOW_LIMIT * 4;
const CHAT_CANONICAL_LOCAL_TAIL_RAW_LINE_LIMIT = 800;
const CHAT_STREAM_REPLAY_EVENT_LIMIT = 240;

function compileGatewayMessageText(text: string, fileRefs: ChatSendFileRef[]): string {
  const refs = fileRefs.map((item) => formatGatewayFileRef(item.relativePath));
  if (!refs.length) {
    return text;
  }
  if (!text) {
    return refs.join(' ');
  }
  return `${refs.join(' ')}\n---\n${text}`;
}

function mergeResources(
  ...groups: Array<ChatResourceItem[] | undefined>
): ChatResourceItem[] | undefined {
  const merged: ChatResourceItem[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group || []) {
      const key = `${item.kind}:${item.url}:${item.downloadUrl}:${item.id}:${item.relativePath || item.fileName}:${item.source}:${item.status}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.length ? merged : undefined;
}

function cloneChatMessageItem<T extends ChatMessageItem | null | undefined>(value: T): T {
  if (!value) {
    return value;
  }
  return {
    ...value,
    toolCalls: value.toolCalls?.map(cloneChatMessageToolCallItem),
    blocks: value.blocks?.map((item) => ({ ...item })),
    processBlocks: value.processBlocks?.map((item) => ({ ...item })),
    resources: value.resources?.map((item) => ({ ...item })),
    media: value.media?.map((item) => ({ ...item })),
  } as T;
}

function cloneChatToolCard<T extends ChatToolCard | null | undefined>(value: T): T {
  if (!value) {
    return value;
  }
  return {
    ...value,
    artifacts: value.artifacts?.map((item) => ({ ...item })),
  } as T;
}

function cloneCanonicalEntries(entries: ChatCanonicalEntry[]): ChatCanonicalEntry[] {
  return entries.map((entry) => ({
    ...entry,
    message: cloneChatMessageItem(entry.message)!,
  }));
}

function createDefaultSessionControls(): ChatSessionControlState {
  return {
    allowHostManagementExec: false,
    updatedAt: null,
  };
}

function cloneChatQueuedMessageItem<T extends ChatQueuedMessageItem | null | undefined>(value: T): T {
  if (!value) {
    return value;
  }
  return {
    ...value,
    composerDocument: value.composerDocument?.map((node) => ({ ...node })),
    fileRefs: value.fileRefs?.map((item) => ({ ...item })),
    attachments: value.attachments?.map((item) => ({ ...item })),
  } as T;
}

function cloneChatQueuedMessageList(items: ChatQueuedMessageItem[] | undefined): ChatQueuedMessageItem[] {
  return (items || []).map((item) => cloneChatQueuedMessageItem(item)!);
}

function cloneSessionControls(value: ChatSessionControlState | null | undefined): ChatSessionControlState {
  return {
    allowHostManagementExec: value?.allowHostManagementExec === true,
    updatedAt: normalizeDate(value?.updatedAt) || null,
  };
}

function cloneToolCalls(toolCalls: ChatMessageToolCallItem[] | undefined): ChatMessageToolCallItem[] | undefined {
  return toolCalls?.map(cloneChatMessageToolCallItem);
}

function sortToolCalls(toolCalls: ChatMessageToolCallItem[]): ChatMessageToolCallItem[] {
  return toolCalls.slice().sort((left, right) => {
    const leftTs = Date.parse(left.startedAt || left.updatedAt || '') || 0;
    const rightTs = Date.parse(right.startedAt || right.updatedAt || '') || 0;
    if (leftTs !== rightTs) {
      return leftTs - rightTs;
    }
    return left.toolCallId.localeCompare(right.toolCallId);
  });
}

function toolStatusRank(status: ChatMessageToolCallItem['status'] | ChatToolCard['status'] | null | undefined): number {
  if (status === 'error') return 3;
  if (status === 'completed') return 2;
  return 1;
}

function pickMonotonicToolStatus<T extends ChatMessageToolCallItem['status'] | ChatToolCard['status']>(
  current: T | null | undefined,
  next: T | null | undefined,
): T {
  return (toolStatusRank(next) >= toolStatusRank(current) ? next : current || next || 'running') as T;
}

function pickPreferredToolPreview(current: string | null | undefined, next: string | null | undefined): string | null {
  const normalizedCurrent = normalizeString(current) || null;
  const normalizedNext = normalizeString(next) || null;
  if (!normalizedCurrent) {
    return normalizedNext;
  }
  if (!normalizedNext) {
    return normalizedCurrent;
  }
  if (normalizedNext.length > normalizedCurrent.length + 12) {
    return normalizedNext;
  }
  if (normalizedCurrent.length > normalizedNext.length + 12) {
    return normalizedCurrent;
  }
  return normalizedNext.length >= normalizedCurrent.length ? normalizedNext : normalizedCurrent;
}

function projectionLifecycleRank(value: ChatRunProjection['lifecycle'] | null | undefined): number {
  if (value === 'error') return 5;
  if (value === 'completed') return 4;
  if (value === 'aborted') return 3;
  if (value === 'running') return 2;
  if (value === 'queued') return 1;
  return 0;
}

function pickProjectionLifecycle(
  current: ChatRunProjection['lifecycle'] | null | undefined,
  next: ChatRunProjection['lifecycle'] | null | undefined,
): ChatRunProjection['lifecycle'] {
  if (!next) {
    return current || 'queued';
  }
  return projectionLifecycleRank(next) >= projectionLifecycleRank(current) ? next : (current || next);
}

function mergeToolCallItem(
  previous: ChatMessageToolCallItem | ChatToolCard,
  next: ChatMessageToolCallItem | ChatToolCard,
): ChatMessageToolCallItem {
  const mergedStatus = pickMonotonicToolStatus(previous.status, next.status);
  const nextResultPreview = normalizeString(next.resultPreview) || null;
  const previousResultPreview = normalizeString(previous.resultPreview) || null;
  return {
    ...previous,
    ...next,
    toolCallId: previous.toolCallId || next.toolCallId,
    runId: previous.runId || next.runId,
    name: previous.name || next.name,
    status: mergedStatus,
    startedAt: previous.startedAt || next.startedAt,
    updatedAt: normalizeDate(next.updatedAt) || normalizeDate(previous.updatedAt) || null,
    argsPreview: pickPreferredToolPreview(previous.argsPreview, next.argsPreview),
    resultPreview: (
      toolStatusRank(next.status) > toolStatusRank(previous.status) && nextResultPreview
        ? nextResultPreview
        : pickPreferredToolPreview(previousResultPreview, nextResultPreview)
    ),
    isError: previous.isError || next.isError || mergedStatus === 'error',
    artifacts: next.artifacts?.length ? next.artifacts.map((item) => ({ ...item })) : previous.artifacts?.map((item) => ({ ...item })),
  };
}

function mergeToolCallLists(
  current: ChatMessageToolCallItem[] | undefined,
  incoming: ChatMessageToolCallItem[] | undefined,
): ChatMessageToolCallItem[] | undefined {
  if (!current?.length && !incoming?.length) {
    return undefined;
  }
  const merged = new Map<string, ChatMessageToolCallItem>();
  for (const item of current || []) {
    merged.set(item.toolCallId, cloneChatMessageToolCallItem(item));
  }
  for (const item of incoming || []) {
    const previous = merged.get(item.toolCallId);
    merged.set(item.toolCallId, previous ? mergeToolCallItem(previous, item) : cloneChatMessageToolCallItem(item));
  }
  return sortToolCalls([...merged.values()]);
}

function enrichMessagesWithToolCards(
  messages: ChatMessageItem[],
  toolCards: ChatToolCard[] | undefined,
): ChatMessageItem[] {
  if (!toolCards?.length) {
    return messages;
  }
  const byId = new Map(toolCards.map((item) => [item.toolCallId, item]));
  return messages.map((message) => {
    if (!message.toolCalls?.length) {
      return message;
    }
    const nextToolCalls = message.toolCalls.map((toolCall) => {
      const card = byId.get(toolCall.toolCallId);
      return card ? mergeToolCallItem(toolCall, card) : toolCall;
    });
    return {
      ...message,
      toolCalls: nextToolCalls,
    };
  });
}

function enrichOverlaysWithToolCards(
  overlays: ChatRunOverlay[],
  toolCards: ChatToolCard[] | undefined,
): ChatRunOverlay[] {
  if (!toolCards?.length) {
    return overlays;
  }
  const byId = new Map(toolCards.map((item) => [item.toolCallId, item]));
  return overlays.map((overlay) => ({
    ...overlay,
    toolCalls: overlay.toolCalls.map((toolCall) => {
      const card = byId.get(toolCall.toolCallId);
      return card ? mergeToolCallItem(toolCall, card) : toolCall;
    }),
  }));
}

function encodeHistoryCursor(cursor: ChatHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');
}

function normalizeHistorySearchRoleFilter(value: unknown): ChatHistorySearchRoleFilter {
  return value === 'user' || value === 'assistant' || value === 'tool'
    ? value
    : 'all';
}

function normalizeHistorySearchContentFilter(value: unknown): ChatHistorySearchContentFilter {
  return value === 'text' || value === 'resource' || value === 'code'
    ? value
    : 'all';
}

function decodeHistoryCursor(value: string | null | undefined): ChatHistoryCursor | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(normalized, 'base64url').toString('utf-8')) as ChatHistoryCursor;
    if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.anchorIndex)) {
      return null;
    }
    const roleFilter = normalizeHistorySearchRoleFilter((parsed as { roleFilter?: unknown }).roleFilter);
    const contentFilter = normalizeHistorySearchContentFilter((parsed as { contentFilter?: unknown }).contentFilter);
    return {
      source: parsed.source === 'history_search' ? 'history_search' : 'history_window',
      anchorIndex: Math.max(0, parsed.anchorIndex),
      anchorMessageId: normalizeString(parsed.anchorMessageId) || null,
      anchorCreatedAt: normalizeDate(parsed.anchorCreatedAt) || null,
      day: normalizeString(parsed.day) || null,
      query: normalizeString(parsed.query) || null,
      roleFilter: parsed.source === 'history_search' ? roleFilter : null,
      contentFilter: parsed.source === 'history_search' ? contentFilter : null,
    };
  } catch {
    return null;
  }
}

function upsertProjectionToolCallItem(
  toolCalls: ChatMessageToolCallItem[] | undefined,
  nextTool: ChatMessageToolCallItem,
): ChatMessageToolCallItem[] {
  const current = toolCalls?.map(cloneChatMessageToolCallItem) || [];
  const index = current.findIndex((item) => item.toolCallId === nextTool.toolCallId);
  if (index >= 0) {
    const previous = current[index]!;
    current[index] = mergeToolCallItem(previous, nextTool);
  } else {
    current.push(cloneChatMessageToolCallItem(nextTool));
  }
  return sortToolCalls(current);
}

function overlayHasVisibleContent(overlay: ChatRunOverlay | null | undefined): boolean {
  if (!overlay) {
    return false;
  }
  return Boolean(overlay.previewText.trim() || overlay.toolCalls.length);
}

function isCanonicalToolStepAssistantMessage(message: ChatMessageItem): boolean {
  if (message.role !== 'assistant' || !message.toolCalls?.length) {
    return false;
  }
  if (normalizeString(message.stopReason).toLowerCase() === 'tooluse') {
    return true;
  }
  return !normalizeString(message.text);
}

function filterRedundantTerminalOverlays(
  messages: ChatMessageItem[],
  overlays: ChatRunOverlay[],
): ChatRunOverlay[] {
  const canonicalToolStepToolCallIds = new Set(
    messages
      .filter((message) => isCanonicalToolStepAssistantMessage(message))
      .flatMap((message) => (message.toolCalls || []).map((toolCall) => normalizeString(toolCall.toolCallId)))
      .filter(Boolean),
  );
  if (!canonicalToolStepToolCallIds.size) {
    return overlays;
  }
  return overlays.filter((overlay) => {
    if (overlay.lifecycle === 'running' || overlay.lifecycle === 'queued') {
      return true;
    }
    if (!overlay.toolCalls.length) {
      return true;
    }
    return overlay.toolCalls.some((toolCall) => !canonicalToolStepToolCallIds.has(normalizeString(toolCall.toolCallId)));
  });
}

function mergeHistoryAssistantMessage(
  current: ChatMessageItem,
  supplement: {
    runId: string | null;
    toolCalls?: ChatMessageToolCallItem[] | undefined;
  },
): ChatMessageItem {
  return {
    ...current,
    runId: current.runId || supplement.runId,
    toolCalls: mergeToolCallLists(current.toolCalls, supplement.toolCalls),
  };
}

function deriveLastMessagePreview(message: ChatMessageItem | undefined, fallback: string | null): string | null {
  if (!message) {
    return fallback;
  }
  return message.text.slice(0, 160)
    || message.resources?.[0]?.fileName
    || message.toolCalls?.[message.toolCalls.length - 1]?.name
    || fallback;
}

const CHAT_SESSION_TRANSPORT_LABEL_LIMIT = 88;
const CHAT_SESSION_TRANSPORT_TITLE_LIMIT = 96;
const CHAT_SESSION_TRANSPORT_PREVIEW_LIMIT = 140;
const CHAT_SESSION_TRANSPORT_ORIGIN_LIMIT = 72;
const CHAT_HISTORY_ORPHAN_OVERLAY_LIMIT = 8;
const CHAT_HISTORY_ORPHAN_OVERLAY_CONTEXT_MS = 5 * 60 * 1000;

function compactSessionRowForTransport(row: ChatSessionRow): ChatSessionRow {
  return {
    ...row,
    label: clipPreview(row.label, CHAT_SESSION_TRANSPORT_LABEL_LIMIT),
    derivedTitle: row.derivedTitle ? clipPreview(row.derivedTitle, CHAT_SESSION_TRANSPORT_TITLE_LIMIT) : null,
    lastMessagePreview: row.lastMessagePreview ? clipPreview(row.lastMessagePreview, CHAT_SESSION_TRANSPORT_PREVIEW_LIMIT) : null,
    source: {
      ...row.source,
      originLabel: row.source.originLabel ? clipPreview(row.source.originLabel, CHAT_SESSION_TRANSPORT_ORIGIN_LIMIT) : null,
    },
  };
}

function compactSessionRowsForTransport(rows: ChatSessionRow[]): ChatSessionRow[] {
  return rows.map((row) => compactSessionRowForTransport(row));
}

function isGatewayHistoryStaleAfterLocalReset(
  inMemory: TracevaneManagedSessionState | null,
  gatewayMessages: ChatMessageItem[],
): boolean {
  if (!inMemory || inMemory.messages.length > 0 || !gatewayMessages.length) {
    return false;
  }

  const resetAt = Date.parse(inMemory.clearedAt || '') || 0;
  if (!resetAt) {
    return false;
  }

  return gatewayMessages.every((message) => (Date.parse(message.createdAt || '') || 0) < resetAt);
}

function isGatewayHistoryBehindInMemory(
  inMemory: TracevaneManagedSessionState | null,
  gatewayMessages: ChatMessageItem[],
): boolean {
  if (!inMemory) {
    return false;
  }
  const currentHistory = normalizeMessageLedger(inMemory.messages.slice());
  if (!currentHistory.length) {
    return false;
  }
  if (!gatewayMessages.length) {
    return true;
  }
  if (gatewayMessages.length < currentHistory.length) {
    return true;
  }
  const gatewayLastTs = Date.parse(gatewayMessages[gatewayMessages.length - 1]?.createdAt || '') || 0;
  const inMemoryLastTs = Date.parse(currentHistory[currentHistory.length - 1]?.createdAt || '') || 0;
  if (inMemoryLastTs && gatewayLastTs + 2_000 < inMemoryLastTs) {
    return true;
  }
  return false;
}


function createBaseDiagnostics(config: TracevaneServerConfig, gatewayReachable: boolean, notes: string[]): ChatDiagnostics {
  return {
    gatewayReachable,
    gatewayWsUrl: config.gatewayWsUrl,
    transport: 'tracevane_bff',
    authMode: 'tracevane_backend_token',
    rawGatewayFramesExposed: false,
    rawGatewayMethodsExposed: false,
    sameOriginRequired: CHAT_POLICY_DEFAULTS.defaultSameOriginRequired,
    historyTruncated: false,
    truncationMode: 'none',
    notes,
  };
}

function resolveGatewayProbeTarget(config: TracevaneServerConfig): { host: string; port: number } {
  try {
    const url = new URL(config.gatewayWsUrl);
    const parsedPort = Number(url.port);
    return {
      host: url.hostname || '127.0.0.1',
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : config.gatewayPort,
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: config.gatewayPort,
    };
  }
}

async function probeGatewaySocket(config: TracevaneServerConfig): Promise<boolean> {
  const target = resolveGatewayProbeTarget(config);
  if (!Number.isFinite(target.port) || target.port <= 0) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target.host, port: target.port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(CHAT_GATEWAY_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

export interface ChatSlashGatewayRequest {
  method: string;
  params?: Record<string, unknown> | null;
}

export interface ChatService {
  getHealth(): Promise<ChatDiagnostics>;
  getOrganizer(): Promise<ChatOrganizerPayload>;
  createFolder(payload: ChatCreateOrganizerFolderRequest): Promise<ChatCreateOrganizerFolderResponse>;
  patchFolder(folderId: string, payload: ChatPatchOrganizerFolderRequest): Promise<ChatPatchOrganizerFolderResponse>;
  deleteFolder(folderId: string): Promise<ChatDeleteOrganizerFolderResponse>;
  assignSessionsToFolder(payload: ChatAssignSessionsToFolderRequest): Promise<ChatAssignSessionsToFolderResponse>;
  getBootstrap(options?: {
    sessionKey?: string | null;
    recentLimit?: number;
    historyLimit?: number;
  }): Promise<ChatBootstrapPayload>;
  listSessions(agentId: string, options?: {
    limit?: number;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
    localOnly?: boolean;
  }): Promise<ChatSessionsPayload>;
  getHistory(
    sessionKey: string,
    options?: {
      before?: string | null;
      after?: string | null;
      anchor?: string | null;
      limit?: number;
      day?: string | null;
    },
  ): Promise<ChatHistoryPayload>;
  searchHistory(
    sessionKey: string,
    options: {
      query: string;
      role?: ChatHistorySearchRoleFilter | null;
      content?: ChatHistorySearchContentFilter | null;
      day?: string | null;
      before?: string | null;
      after?: string | null;
      limit?: number;
    },
  ): Promise<ChatHistorySearchPayload>;
  getHistoryDates(sessionKey: string): Promise<ChatHistoryDatesPayload>;
  createSession(agentId: string, payload: ChatCreateSessionRequest): Promise<ChatCreateSessionResponse>;
  patchSession(sessionKey: string, payload: ChatPatchSessionRequest): Promise<ChatPatchSessionResponse>;
  getQueue(sessionKey: string): Promise<ChatQueuePayload>;
  enqueue(sessionKey: string, payload: ChatSendRequest): Promise<ChatQueuePayload>;
  patchQueueEntry(sessionKey: string, entryId: string, payload: ChatPatchQueueEntryRequest): Promise<ChatQueuePayload>;
  deleteQueueEntry(sessionKey: string, entryId: string): Promise<ChatQueuePayload>;
  getControls(sessionKey: string): Promise<ChatSessionControlsPayload>;
  patchControls(sessionKey: string, payload: ChatPatchSessionControlsRequest): Promise<ChatSessionControlsPayload>;
  requestSlashGateway(sessionKey: string, payload: ChatSlashGatewayRequest): Promise<unknown>;
  send(sessionKey: string, payload: ChatSendRequest): Promise<ChatSendAck>;
  resolveResourceRefs(sessionKey: string, payload: ChatResourceResolveRequest): Promise<ChatResourceResolveResponse>;
  resolveMedia(sessionKey: string, mediaId: string): Promise<ResolvedChatMedia>;
  deleteSession(sessionKey: string): Promise<ChatDeleteSessionResponse>;
  abort(sessionKey: string): Promise<ChatAbortResponse>;
  reset(sessionKey: string): Promise<ChatResetResponse>;
  uploadFile(sessionKey: string, payload: ChatFileUploadRequest): Promise<ChatFileUploadResponse>;
  uploadFileBytes(sessionKey: string, payload: { fileName: string; content: Buffer; mimeType?: string }): Promise<ChatFileUploadResponse>;
  attachGatewayClient(
    payload: ChatGatewayAttachPayload,
    runtime: ChatGatewayRuntime,
  ): Promise<ChatGatewayAttachResponse>;
  heartbeatGatewayClient(
    payload: ChatGatewayHeartbeatPayload,
    runtime: Pick<ChatGatewayRuntime, 'connId'>,
  ): ChatGatewayAckResponse;
  detachGatewayClient(
    payload: ChatGatewayDetachPayload,
    runtime: Pick<ChatGatewayRuntime, 'connId'>,
  ): ChatGatewayAckResponse;
  openEventStream(sessionKey: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
  dispose(): void;
}

export interface CreateChatServiceOptions {
  config: TracevaneServerConfig;
  system: SystemService;
}

export function createChatService(options: CreateChatServiceOptions): ChatService {
  const mediaBridge = createTracevaneChatMediaBridge(options.config);
  const shadowStore = createTracevaneChatMessageShadowStore(options.config);
  const runShadowStore = createTracevaneChatRunProjectionStore(options.config);
  const durableMirrorStore = createTracevaneChatDurableMirrorStore(options.config);
  const sessionCatalogStore = createTracevaneChatSessionCatalogStore(options.config);
  const sessionStateStore = createTracevaneChatSessionStateStore(options.config);
  const historyIndexStore = createTracevaneChatHistoryIndexStore(options.config);
  const organizerStore = createTracevaneChatOrganizerStore(options.config);
  const tracevaneSessions = new LruMap<string, TracevaneManagedSessionState>(200);
  const historySnapshotCache = new LruMap<string, HistorySnapshotCacheEntry>(120);
  const transcriptContentCache = new LruMap<string, string>(12);
  const canonicalStates = new LruMap<string, ChatCanonicalState>(150);
  const officialCanonicalStreams = new Map<string, OfficialCanonicalStreamState>();
  const runProjections = new LruMap<string, Map<string, ChatRunProjection>>(200);
  const frontendSubscribers = new Map<string, Set<WebSocket>>();
  const frontendSseSubscribers = new Map<string, Set<http.ServerResponse>>();
  const gatewaySubscribers = new Map<string, Map<string, ChatGatewaySubscriber>>();
  const sessionBridges = new Map<string, SessionGatewayBridge>();
  const streamReplayState = createChatStreamReplayState();
  const queueFlushSessions = new Set<string>();
  const queueFlushRerunSessions = new Set<string>();
  const streamSnapshots = new Map<string, string>();
  const suppressedGatewayRunIds = new Map<string, Set<string>>();
  let gatewayConnectedCache: { value: boolean; checkedAt: number } | null = null;
  let projectionSequence = 0;
  const wss = new WebSocketServer({ noServer: true });
  const gatewaySweepTimer = setInterval(() => {
    const now = Date.now();
    for (const sessionKey of Array.from(gatewaySubscribers.keys())) {
      pruneExpiredGatewaySubscribers(sessionKey, now);
    }
  }, CHAT_GATEWAY_SWEEP_INTERVAL_MS);
  gatewaySweepTimer.unref?.();

  async function isGatewayConnected(): Promise<boolean> {
    const now = Date.now();
    if (gatewayConnectedCache && now - gatewayConnectedCache.checkedAt < CHAT_GATEWAY_HEALTH_CACHE_MS) {
      return gatewayConnectedCache.value;
    }
    try {
      // Chat availability follows the effective Gateway socket check, not the
      // full System diagnostics path. Local/dev runs can have an online Gateway
      // while the user service unit is failed, bypassed, or slow to inspect.
      const value = await probeGatewaySocket(options.config);
      gatewayConnectedCache = {
        value,
        checkedAt: now,
      };
      return value;
    } catch {
      gatewayConnectedCache = {
        value: false,
        checkedAt: now,
      };
      return false;
    }
  }

  async function buildHealth(
    notes: string[] = [],
    gatewayReachableHint: boolean | null = null,
  ): Promise<ChatDiagnostics> {
    return createBaseDiagnostics(
      options.config,
      gatewayReachableHint ?? await isGatewayConnected(),
      notes,
    );
  }

  function getChatProtocolMode(): ChatProtocolMode {
    return CHAT_PROTOCOL_MODE_DEFAULT;
  }

  function selectCanonicalSource(sessionKey: string): ChatCanonicalSourceSelection {
    const localSource = resolveLocalSessionSource(sessionKey);
    if (localSource.sessionFile) {
      return {
        kind: 'local_transcript',
        agentId: localSource.agentId,
        record: localSource.record,
        sessionFile: localSource.sessionFile,
        sourceMtimeMs: localSource.sourceMtimeMs,
        priorSessionFiles: localSource.priorSessionFiles,
      };
    }
    return {
      kind: 'official_canonical_stream',
      agentId: localSource.agentId,
      record: localSource.record,
      sessionFile: null,
      sourceMtimeMs: null,
      priorSessionFiles: localSource.priorSessionFiles,
    };
  }

  function mergeCanonicalHistoryWithLocalOptimism(
    current: ChatMessageItem[] | undefined,
    canonical: ChatMessageItem[],
  ): ChatMessageItem[] {
    return mergeCanonicalMessageLedger(current || [], canonical, 'replace', {
      preserveLocalMessages: true,
    });
  }

  function shouldEmitLegacyProtocol(): boolean {
    const mode = getChatProtocolMode();
    return mode === 'legacy' || mode === 'dual_write';
  }

  function shouldEmitCanonicalProtocol(): boolean {
    const mode = getChatProtocolMode();
    return mode === 'dual_write' || mode === 'canonical_v1';
  }

  function buildCanonicalEntryFromMapped(
    mapped: TranscriptCanonicalEntry,
  ): ChatCanonicalEntry {
    return {
      message: cloneChatMessageItem(mapped.message)!,
      messageId: mapped.messageId,
      messageSeq: mapped.messageSeq,
      identityKey: mapped.identityKey,
    };
  }

  function buildCanonicalEntryFromRaw(
    raw: Record<string, unknown>,
    index: number,
    options: TranscriptMappingOptions = {},
    overrides: Partial<Pick<ChatCanonicalEntry, 'messageId' | 'messageSeq'>> = {},
  ): ChatCanonicalEntry | null {
    const mapped = mapTranscriptCanonicalEntry(raw, index, options);
    if (!mapped) {
      return null;
    }
    const messageSeq = overrides.messageSeq && overrides.messageSeq > 0
      ? overrides.messageSeq
      : mapped.messageSeq;
    const messageId = normalizeString(overrides.messageId, mapped.messageId);
    return {
      message: cloneChatMessageItem(mapped.message)!,
      messageId,
      messageSeq,
      identityKey: `${messageSeq}|${mapped.identityKey}`,
    };
  }

  function buildCanonicalEntriesFromMessages(messages: ChatMessageItem[]): ChatCanonicalEntry[] {
    return messages.map((message, index) => ({
      message: cloneChatMessageItem(message)!,
      messageId: message.id,
      messageSeq: index + 1,
      identityKey: [
        String(index + 1),
        message.role,
        normalizeString(message.text).replace(/\s+/g, ' '),
        (message.toolCalls || []).map((item) => item.toolCallId).filter(Boolean).sort().join(','),
      ].join('|'),
    }));
  }

  function buildCanonicalEntryIdentityKey(message: ChatMessageItem, messageSeq: number): string {
    return [
      String(messageSeq),
      message.role,
      normalizeString(message.text).replace(/\s+/g, ' '),
      (message.toolCalls || []).map((item) => item.toolCallId).filter(Boolean).sort().join(','),
    ].join('|');
  }

  function resequenceCanonicalEntries(
    entries: ChatCanonicalEntry[],
    firstMessageSeq: number,
  ): ChatCanonicalEntry[] {
    return entries.map((entry, index) => {
      const messageSeq = firstMessageSeq + index;
      const message = cloneChatMessageItem(entry.message)!;
      return {
        ...entry,
        message,
        messageSeq,
        identityKey: buildCanonicalEntryIdentityKey(message, messageSeq),
      };
    });
  }

  function cloneHistoryPageInfo(pageInfo: ChatHistoryPayload['pageInfo']): ChatHistoryPayload['pageInfo'] {
    return {
      hasMoreBefore: pageInfo.hasMoreBefore,
      beforeCursor: pageInfo.beforeCursor,
      hasMoreAfter: pageInfo.hasMoreAfter,
      afterCursor: pageInfo.afterCursor,
    };
  }

  function canonicalEntriesRepresentSameMessage(
    left: ChatCanonicalEntry,
    right: ChatCanonicalEntry,
  ): boolean {
    return left.messageId === right.messageId;
  }

  function findCanonicalTailOverlapIndex(
    entries: ChatCanonicalEntry[],
    target: ChatCanonicalEntry,
  ): number {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (canonicalEntriesRepresentSameMessage(entries[index]!, target)) {
        return index;
      }
    }
    return -1;
  }

  function compactLocalCanonicalEntries(entries: ChatCanonicalEntry[]): ChatCanonicalEntry[] {
    return entries.length > CHAT_CANONICAL_STATE_ENTRY_LIMIT
      ? entries.slice(-CHAT_CANONICAL_STATE_ENTRY_LIMIT)
      : entries;
  }

  function buildCanonicalEntriesSignature(entries: ChatCanonicalEntry[]): string {
    return entries
      .map((entry) => `${entry.messageSeq}:${entry.identityKey}:${entry.messageId}`)
      .join('\n');
  }

  function entriesShareStablePrefix(
    previous: ChatCanonicalEntry[],
    next: ChatCanonicalEntry[],
  ): boolean {
    if (next.length < previous.length) {
      return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
      if (previous[index]?.identityKey !== next[index]?.identityKey) {
        return false;
      }
    }
    return true;
  }

  function nextCanonicalVersion(sessionKey: string, source: ChatCanonicalState['source']): string {
    const previous = canonicalStates.get(sessionKey);
    const revision = previous && previous.source === source
      ? (Number(previous.version.split(':').pop()) || 0) + 1
      : 1;
    return `${source}:${revision}`;
  }

  function resolveCanonicalRuntime(sessionKey: string): ChatRuntimeState {
    return getTracevaneSession(sessionKey)?.row.runtime
      || buildRuntimeState(false, Boolean(getTracevaneSession(sessionKey)?.row.permissions.writable));
  }

  function buildCanonicalSnapshotWindow(
    entries: ChatCanonicalEntry[],
    overlays: ChatRunOverlay[],
    pageInfoOverride?: ChatHistoryPayload['pageInfo'] | null,
  ): {
    messages: ChatMessageItem[];
    overlays: ChatRunOverlay[];
    pageInfo: ChatHistoryPayload['pageInfo'];
  } {
    const limit = CHAT_CANONICAL_SNAPSHOT_WINDOW_LIMIT;
    const end = entries.length;
    const start = Math.max(0, end - limit);
    const pageEntries = entries.slice(start, end);
    const pageMessages = pageEntries.map((entry) => cloneChatMessageItem(entry.message)!);
    const firstMessage = pageMessages[0] || null;
    const pageInfo = pageInfoOverride && entries.length <= limit
      ? cloneHistoryPageInfo(pageInfoOverride)
      : {
        hasMoreBefore: start > 0,
        beforeCursor: firstMessage && start > 0
          ? encodeHistoryCursor({
            source: 'history_window',
            anchorIndex: start,
            anchorMessageId: firstMessage.id,
            anchorCreatedAt: firstMessage.createdAt,
            day: null,
            query: null,
            roleFilter: null,
            contentFilter: null,
          })
          : null,
        hasMoreAfter: false,
        afterCursor: null,
      };
    const allMessagesForOverlayContext = overlays.length
      ? entries.map((entry) => cloneChatMessageItem(entry.message)!)
      : pageMessages;
    return {
      messages: pageMessages,
      overlays: buildPageOverlaysForMessageWindow(
        overlays,
        allMessagesForOverlayContext,
        pageMessages,
        pageInfo,
      ),
      pageInfo,
    };
  }

  function emitCanonicalSnapshot(
    sessionKey: string,
    source: ChatCanonicalState['source'],
    entries: ChatCanonicalEntry[],
    version: string,
    overlays: ChatRunOverlay[],
    pageInfoOverride?: ChatHistoryPayload['pageInfo'] | null,
  ): void {
    const snapshotWindow = buildCanonicalSnapshotWindow(entries, overlays, pageInfoOverride);
    canonicalStates.set(sessionKey, {
      sessionKey,
      version,
      source,
      entries: entries.map((entry) => ({
        ...entry,
        message: cloneChatMessageItem(entry.message)!,
      })),
      pageInfo: snapshotWindow.pageInfo,
    });
    if (!shouldEmitCanonicalProtocol()) {
      return;
    }
    broadcastToSession(sessionKey, {
      kind: 'canonical.snapshot',
      sessionKey,
      emittedAt: new Date().toISOString(),
      version,
      messages: snapshotWindow.messages,
      overlays: snapshotWindow.overlays,
      pageInfo: snapshotWindow.pageInfo,
      runtime: resolveCanonicalRuntime(sessionKey),
      source,
    });
  }

  function emitCanonicalMessages(
    sessionKey: string,
    source: 'local_transcript' | 'history_sse',
    entries: ChatCanonicalEntry[],
    version: string,
  ): void {
    const current = canonicalStates.get(sessionKey);
    canonicalStates.set(sessionKey, {
      sessionKey,
      version,
      source,
      entries: [
        ...(current?.entries || []),
        ...entries.map((entry) => ({
          ...entry,
          message: cloneChatMessageItem(entry.message)!,
        })),
      ],
      pageInfo: current?.pageInfo,
    });
    if (!shouldEmitCanonicalProtocol()) {
      return;
    }
    for (const entry of entries) {
      broadcastToSession(sessionKey, {
        kind: 'canonical.message',
        sessionKey,
        emittedAt: new Date().toISOString(),
        message: cloneChatMessageItem(entry.message)!,
        messageId: entry.messageId,
        messageSeq: entry.messageSeq,
        version,
        source,
      });
    }
  }

  function broadcastRuntimeUpdate(
    sessionKey: string,
    runId: string | null,
    runtime: ChatRuntimeState,
    emittedAt = new Date().toISOString(),
  ): void {
    broadcastToSession(sessionKey, {
      kind: 'runtime',
      sessionKey,
      runId,
      emittedAt,
      runtime,
    });
    if (shouldEmitCanonicalProtocol()) {
      broadcastToSession(sessionKey, {
        kind: 'runtime.state',
        sessionKey,
        runId,
        emittedAt,
        runtime,
      });
    }
  }

  async function buildQueuePayload(sessionKey: string): Promise<ChatQueuePayload> {
    const session = await requireSession(sessionKey);
    requireFrontendVisible(session);
    const state = ensureTracevaneSessionState(session);
    return {
      checkedAt: new Date().toISOString(),
      session: state.row,
      items: cloneChatQueuedMessageList(state.pendingQueue),
    };
  }

  async function buildSessionControlsPayload(sessionKey: string): Promise<ChatSessionControlsPayload> {
    const session = await requireSession(sessionKey);
    requireFrontendVisible(session);
    const state = ensureTracevaneSessionState(session);
    return {
      checkedAt: new Date().toISOString(),
      session: state.row,
      globalHostManagementExecEnabled: getTracevaneChatGlobalHostManagementExecEnabled(),
      controls: cloneSessionControls(state.controls),
    };
  }

  async function syncSessionControlsToGatewayPolicy(
    sessionKey: string,
    controls: ChatSessionControlState,
  ): Promise<void> {
    try {
      await requestGateway(options.config, TRACEVANE_CHAT_GATEWAY_METHODS.policySync, {
        sessionKey,
        allowHostManagementExec: controls.allowHostManagementExec === true,
        globalHostManagementExecEnabled: getTracevaneChatGlobalHostManagementExecEnabled(),
      }, { timeoutMs: 2_000 });
    } catch {
      // The standalone API remains the source of truth. Older gateways or
      // temporarily disconnected gateways will resync on the next toggle.
    }
  }

  function buildSessionControlsEvent(
    sessionKey: string,
    controls: ChatSessionControlState,
    emittedAt = new Date().toISOString(),
  ): ChatStreamEvent {
    return {
      kind: 'session.controls',
      sessionKey,
      emittedAt,
      globalHostManagementExecEnabled: getTracevaneChatGlobalHostManagementExecEnabled(),
      controls: cloneSessionControls(controls),
    };
  }

  async function resolveSessionStateForAttachEvents(sessionKey: string): Promise<TracevaneManagedSessionState | null> {
    const existing = getTracevaneSession(sessionKey);
    if (existing) {
      return existing;
    }
    try {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);
      return ensureTracevaneSessionState(session);
    } catch {
      return null;
    }
  }

  function broadcastQueueState(sessionKey: string, emittedAt = new Date().toISOString()): void {
    const current = getTracevaneSession(sessionKey);
    if (!current) {
      return;
    }
    broadcastToSession(sessionKey, {
      kind: 'queue.state',
      sessionKey,
      emittedAt,
      items: cloneChatQueuedMessageList(current.pendingQueue),
    });
  }

  function broadcastSessionControls(sessionKey: string, emittedAt = new Date().toISOString()): void {
    const current = getTracevaneSession(sessionKey);
    if (!current) {
      return;
    }
    broadcastToSession(sessionKey, buildSessionControlsEvent(sessionKey, current.controls, emittedAt));
  }

  function readOrganizerState(): ChatSessionOrganizerState {
    return organizerStore.read();
  }

  function writeOrganizerState(organizer: ChatSessionOrganizerState): ChatSessionOrganizerState {
    return organizerStore.write(organizer);
  }

  function buildOrganizerPayload(organizer: ChatSessionOrganizerState): ChatOrganizerPayload {
    return {
      checkedAt: new Date().toISOString(),
      organizer: normalizeChatSessionOrganizerState(organizer),
    };
  }

  function findOrganizerFolder(organizer: ChatSessionOrganizerState, folderId: string): ChatSessionFolder | null {
    return organizer.folders.find((folder) => folder.id === folderId) || null;
  }

  function overrideTranscriptMessage(
    sessionKey: string,
    raw: Record<string, unknown>,
    fallbackText: string,
    index: number,
  ): TranscriptOverrideResult {
    const record = extractTranscriptRecord(raw);
    const role = normalizeString(record.role || raw.role).toLowerCase();
    if (role === 'user') {
      const restored = shadowStore.restoreUserMessageShadow(sessionKey, raw, fallbackText);
      if (!restored) {
        return null;
      }
      const restoredResources = restored.fileRefs?.length
        ? mediaBridge.buildSendResources(sessionKey, restored.fileRefs, undefined)
        : restored.resources;
      return {
        kind: 'replace',
        message: {
          id: normalizeString(raw.id || record.id, `history-${index}`),
          role: 'user',
          text: restored.text,
          createdAt: normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt)
            || restored.createdAt,
          source: 'history',
          runId: normalizeString(raw.runId || record.runId || restored.runId || restored.requestId) || null,
          truncated: false,
          omitted: false,
          aborted: false,
          stopReason: normalizeString(raw.stopReason || record.stopReason) || null,
          blocks: restored.blocks,
          resources: mergeResources(restoredResources, restored.resources),
        },
      };
    }
    if (role === 'assistant' && isAssistantTracevaneDeliveryToolUseEnvelope(raw)) {
      return { kind: 'skip' };
    }
    if (role === 'assistant' && isAssistantNoReplyMessage(raw)) {
      return { kind: 'skip' };
    }
    if (role === 'assistant') {
      const message = mediaBridge.buildAssistantMarkdownMessage(sessionKey, fallbackText, {
        id: normalizeString(raw.id || record.id, `history-${index}`),
        createdAt: normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt),
        source: 'history',
        runId: normalizeString(raw.runId || record.runId) || null,
        stopReason: normalizeString(raw.stopReason || record.stopReason) || null,
      });
      if (message) {
        return {
          kind: 'replace',
          message,
        };
      }
    }
    const delivery = mediaBridge.extractTracevaneDelivery(raw) || mediaBridge.extractTracevaneDelivery(fallbackText);
    if (role !== 'assistant' && delivery) {
      const message = mediaBridge.buildAssistantMessageFromTracevaneDelivery(sessionKey, delivery, {
        id: normalizeString(raw.id || record.id, `tracevane-delivery-${index}`),
        createdAt: normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt),
        source: 'history',
        runId: normalizeString(raw.runId || record.runId) || null,
      });
      if (!message) {
        return { kind: 'skip' };
      }
      return {
        kind: 'replace',
        message,
      };
    }
    if (role === 'toolresult' && extractTranscriptToolName(raw) === 'tracevane_delivery') {
      return { kind: 'skip' };
    }
    return null;
  }

  function buildAssistantStreamPreviewMessage(
    sessionKey: string,
    text: string,
    meta: {
      id: string;
      createdAt: string | null;
      source: ChatMessageItem['source'];
      runId: string | null;
    },
    rawMessage: Record<string, unknown> | null = null,
  ): ChatMessageItem | null {
    const mapped = rawMessage
      ? mapTranscriptMessage(rawMessage, 0, {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      })
      : null;
    const markdownMessage = mediaBridge.buildAssistantMarkdownMessage(sessionKey, text, meta);
    if (markdownMessage) {
      return markdownMessage;
    }
    const normalizedText = String(text || '');
    if (mapped && mapped.role === 'assistant') {
      return {
        ...mapped,
        id: meta.id || mapped.id,
        text: normalizedText || mapped.text || '',
        createdAt: meta.createdAt || mapped.createdAt,
        source: meta.source,
        runId: meta.runId || mapped.runId,
      };
    }
    if (!normalizedText.trim()) {
      return null;
    }
    return {
      id: meta.id,
      role: 'assistant',
      text: normalizedText,
      createdAt: meta.createdAt,
      source: meta.source,
      runId: meta.runId,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    };
  }

  // Registry reads are cached for hot paths, but writes always merge against
  // disk first so a stale Tracevane/API process cannot overwrite sessions that
  // another process registered after this context started.
  let registryCache: Record<string, TracevaneSessionRegistryEntry> | null = null;

  function readRegistryFromDisk(): Record<string, TracevaneSessionRegistryEntry> {
    registryCache = readTracevaneChatRegistry(options.config);
    return registryCache;
  }

  function ensureRegistryLoaded(): Record<string, TracevaneSessionRegistryEntry> {
    if (!registryCache) {
      return readRegistryFromDisk();
    }
    return registryCache;
  }

  function getRegistryEntry(sessionKey: string): TracevaneSessionRegistryEntry | null {
    const registry = ensureRegistryLoaded();
    return registry[sessionKey] || null;
  }

  function saveRegistryEntry(entry: TracevaneSessionRegistryEntry): void {
    const registry = readRegistryFromDisk();
    const current = registry[entry.key] || null;
    const priorSessionIds = [
      ...(current?.priorSessionIds || []),
      ...(entry.priorSessionIds || []),
    ].filter((sessionId, index, all) => normalizeString(sessionId) && all.indexOf(sessionId) === index);
    registry[entry.key] = {
      ...current,
      ...entry,
      createdAt: entry.createdAt || current?.createdAt || new Date().toISOString(),
      priorSessionIds: priorSessionIds.length > 0 ? priorSessionIds : undefined,
    };
    writeTracevaneChatRegistry(options.config, registry);
    registryCache = registry;
    const currentSession = sessionCatalogStore.readSession(entry.key);
    if (currentSession) {
      sessionCatalogStore.writeSession({
        ...currentSession,
        label: normalizeString(entry.customLabel, entry.label),
        presentation: buildSessionPresentation(entry),
        updatedAt: entry.updatedAt,
      });
      return;
    }
    sessionCatalogStore.writeSession(buildTracevaneManagedRowFromRegistry(entry, false));
  }

  function deleteRegistryEntry(sessionKey: string): void {
    const registry = readRegistryFromDisk();
    if (!registry[sessionKey]) return;
    delete registry[sessionKey];
    writeTracevaneChatRegistry(options.config, registry);
    registryCache = registry;
    sessionCatalogStore.clearSession(sessionKey);
  }

  function buildRegistryEntryFromRow(
    row: ChatSessionRow,
    current: TracevaneSessionRegistryEntry | null = getRegistryEntry(row.key),
  ): TracevaneSessionRegistryEntry {
    const now = normalizeDate(row.updatedAt) || new Date().toISOString();
    const nextSessionId = normalizeString(row.sessionId, normalizeString(current?.sessionId) || '') || null;
    // Detect session ID change and track the prior ID for history recovery
    const priorSessionIds = current?.priorSessionIds?.slice() || [];
    const prevSessionId = normalizeString(current?.sessionId) || null;
    if (prevSessionId && nextSessionId && prevSessionId !== nextSessionId && !priorSessionIds.includes(prevSessionId)) {
      priorSessionIds.push(prevSessionId);
    }
    return {
      key: row.key,
      agentId: row.agentId,
      sessionId: nextSessionId,
      label: normalizeString(row.label, normalizeString(current?.label, buildDefaultSessionLabel(row.agentId))),
      customLabel: normalizeString(row.presentation.customLabel) || null,
      autoLabel: normalizeString(row.presentation.autoLabel) || null,
      archivedAt: normalizeDate(row.presentation.archivedAt) || null,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      priorSessionIds: priorSessionIds.length > 0 ? priorSessionIds : undefined,
    };
  }

  function removeLocalSessionRecord(sessionKey: string): void {
    const agentId = deriveAgentIdFromSessionKey(sessionKey);
    const storePath = resolveAgentSessionsStorePath(options.config, agentId);
    const store = readJsonFile<Record<string, LocalSessionRecord>>(storePath, {});
    const record = store[sessionKey];
    if (!record) {
      return;
    }
    const sessionFile = normalizeString(record.sessionFile) || null;
    if (sessionFile) {
      try {
        fs.rmSync(sessionFile, { force: true });
      } catch {}
    }
    delete store[sessionKey];
    writeJsonFile(storePath, store);
  }

  function clearStreamSnapshotsForSession(sessionKey: string): void {
    const liveRunIds = listRunProjections(sessionKey).map((projection) => projection.runId);
    for (const runId of liveRunIds) {
      streamSnapshots.delete(runId);
    }
    const inMemory = getTracevaneSession(sessionKey);
    for (const message of inMemory?.messages || []) {
      if (message.runId) {
        streamSnapshots.delete(message.runId);
      }
    }
  }

  function suppressGatewayRunId(sessionKey: string, runId: string | null | undefined): void {
    const normalizedRunId = normalizeString(runId);
    if (!normalizedRunId) {
      return;
    }
    const current = suppressedGatewayRunIds.get(sessionKey) || new Set<string>();
    current.add(normalizedRunId);
    suppressedGatewayRunIds.set(sessionKey, current);
    streamSnapshots.delete(normalizedRunId);
  }

  function unsuppressGatewayRunId(sessionKey: string, runId: string | null | undefined): void {
    const normalizedRunId = normalizeString(runId);
    if (!normalizedRunId) {
      return;
    }
    const current = suppressedGatewayRunIds.get(sessionKey);
    if (!current) {
      return;
    }
    current.delete(normalizedRunId);
    if (current.size === 0) {
      suppressedGatewayRunIds.delete(sessionKey);
    }
  }

  function isSuppressedGatewayRunId(sessionKey: string, runId: string | null | undefined): boolean {
    const normalizedRunId = normalizeString(runId);
    if (!normalizedRunId) {
      return false;
    }
    return suppressedGatewayRunIds.get(sessionKey)?.has(normalizedRunId) === true;
  }

  function clearSessionCaches(sessionKey: string): void {
    clearStreamSnapshotsForSession(sessionKey);
    shadowStore.clearSession(sessionKey);
    runShadowStore.clearSession(sessionKey);
    durableMirrorStore.clearSession(sessionKey);
    historyIndexStore.clearSession(sessionKey);
    historySnapshotCache.delete(sessionKey);
    clearRunProjections(sessionKey);
    writeOrganizerState(removeSessionsFromOrganizer(readOrganizerState(), [sessionKey]));
    deleteRegistryEntry(sessionKey);
    sessionStateStore.clear(sessionKey);
    tracevaneSessions.delete(sessionKey);
    clearTracevaneChatSessionHostManagementExecEnabled(sessionKey);
    canonicalStates.delete(sessionKey);
    suppressedGatewayRunIds.delete(sessionKey);
    clearChatStreamReplaySession(streamReplayState, sessionKey, { resetSequence: true });
    disposeOfficialCanonicalStream(sessionKey);
    disposeSessionBridge(sessionKey);
  }

  async function isTracevaneSessionMaterialized(session: ChatSessionRow): Promise<boolean> {
    const localSource = resolveLocalSessionSource(session.key);
    if (localSource.record || localSource.sessionFile) {
      return true;
    }
    const inMemory = getTracevaneSession(session.key);
    if (typeof inMemory?.materialized === 'boolean') {
      return inMemory.materialized;
    }
    try {
      const payload = await requestGateway<Record<string, unknown>>(options.config, 'sessions.list', {
        agentId: session.agentId,
        limit: 200,
        includeDerivedTitles: false,
        includeLastMessage: false,
      });
      const rows = Array.isArray(payload.sessions) ? payload.sessions : [];
      return rows.some((row) => normalizeString((row as Record<string, unknown>)?.key) === session.key);
    } catch {
      return false;
    }
  }

  function getTracevaneSession(sessionKey: string): TracevaneManagedSessionState | null {
    return tracevaneSessions.get(sessionKey) || null;
  }

  function syncSessionControlState(state: TracevaneManagedSessionState): void {
    setTracevaneChatSessionHostManagementExecEnabled(
      state.row.key,
      state.controls.allowHostManagementExec === true,
    );
  }

  function setTracevaneSession(state: TracevaneManagedSessionState): void {
    state.pendingQueue = cloneChatQueuedMessageList(state.pendingQueue);
    state.controls = cloneSessionControls(state.controls);
    syncSessionControlState(state);
    tracevaneSessions.set(state.row.key, state);
    sessionCatalogStore.writeSession(state.row);
    sessionStateStore.write(state.row.key, {
      pendingQueue: state.pendingQueue,
      controls: state.controls,
    });
  }

  function ensureTracevaneSessionState(
    session: ChatSessionRow,
    overrides: Partial<TracevaneManagedSessionState> = {},
  ): TracevaneManagedSessionState {
    const existing = getTracevaneSession(session.key);
    if (existing) {
      return existing;
    }
    const persistedState = sessionStateStore.read(session.key);
    const state: TracevaneManagedSessionState = {
      row: session,
      messages: [],
      diagnosticsNotes: [],
      observability: createEmptyObservabilityState(),
      pendingQueue: persistedState?.pendingQueue || [],
      controls: persistedState?.controls || createDefaultSessionControls(),
      materialized: false,
      resetPending: false,
      clearedAt: null,
      ...overrides,
    };
    setTracevaneSession(state);
    return state;
  }

  function refreshTracevaneAutoLabel(state: TracevaneManagedSessionState): boolean {
    const nextRow = applyDerivedAutoLabelToSessionRow(state.row, state.messages);
    if (nextRow === state.row) {
      return false;
    }
    state.row = nextRow;
    return true;
  }

  function clearTracevaneAutoLabel(row: ChatSessionRow): ChatSessionRow {
    if (row.kind !== 'tracevane_managed' || !normalizeString(row.presentation.autoLabel)) {
      return row;
    }
    return {
      ...row,
      presentation: {
        ...row.presentation,
        autoLabel: null,
      },
    };
  }

  function getRunProjectionMap(sessionKey: string, create = false): Map<string, ChatRunProjection> | null {
    const current = runProjections.get(sessionKey);
    if (current || !create) {
      return current || null;
    }
    const created = new Map<string, ChatRunProjection>();
    runProjections.set(sessionKey, created);
    return created;
  }

  function getRunProjection(sessionKey: string, runId: string | null | undefined): ChatRunProjection | null {
    const normalizedRunId = normalizeString(runId);
    if (!normalizedRunId) {
      return null;
    }
    return getRunProjectionMap(sessionKey)?.get(normalizedRunId) || null;
  }

  function listRunProjections(sessionKey: string): ChatRunProjection[] {
    return [...(getRunProjectionMap(sessionKey)?.values() || [])]
      .map(cloneChatRunProjection)
      .sort((left, right) => left.sequence - right.sequence || (left.startedAt || '').localeCompare(right.startedAt || ''));
  }

  function touchRunProjection(projection: ChatRunProjection, emittedAt: string): ChatRunProjection {
    projection.updatedAt = emittedAt;
    projection.sequence = ++projectionSequence;
    return projection;
  }

  function ensureRunProjection(
    sessionKey: string,
    runId: string,
    emittedAt: string,
    overrides: Partial<Pick<ChatRunProjection, 'lifecycle'>> = {},
  ): ChatRunProjection {
    const projectionMap = getRunProjectionMap(sessionKey, true)!;
    const current = projectionMap.get(runId);
    if (current) {
      const next = cloneChatRunProjection(current);
      if (overrides.lifecycle) {
        next.lifecycle = pickProjectionLifecycle(next.lifecycle, overrides.lifecycle);
      }
      touchRunProjection(next, emittedAt);
      projectionMap.set(runId, next);
      return next;
    }

    const created: ChatRunProjection = {
      sessionKey,
      runId,
      startedAt: emittedAt,
      updatedAt: emittedAt,
      lifecycle: overrides.lifecycle || 'running',
      previewText: '',
      toolCalls: [],
      finalMessageId: null,
      finalCreatedAt: null,
      firstAssistantSeenAt: null,
      firstToolStartedAt: null,
      sequence: ++projectionSequence,
    };
    projectionMap.set(runId, created);
    return cloneChatRunProjection(created);
  }

  function saveRunProjection(sessionKey: string, projection: ChatRunProjection): void {
    const projectionMap = getRunProjectionMap(sessionKey, true)!;
    projectionMap.set(projection.runId, cloneChatRunProjection(projection));
  }

  function settleProjectionRunningToolsBeforeAssistant(projection: ChatRunProjection, emittedAt: string): void {
    let changed = false;
    projection.toolCalls = projection.toolCalls.map((toolCall) => {
      if (toolCall.status !== 'running') {
        return cloneChatMessageToolCallItem(toolCall);
      }
      changed = true;
      return {
        ...cloneChatMessageToolCallItem(toolCall),
        status: 'completed',
        updatedAt: normalizeDate(emittedAt) || normalizeDate(toolCall.updatedAt) || null,
      };
    });
    if (changed) {
      projection.updatedAt = emittedAt;
    }
  }

  function clearRunProjections(sessionKey: string): void {
    runProjections.delete(sessionKey);
  }

  function buildRunOverlay(
    sessionKey: string,
    projection: Pick<
      ChatRunProjection,
      | 'runId'
      | 'startedAt'
      | 'updatedAt'
      | 'lifecycle'
      | 'previewText'
      | 'toolCalls'
      | 'finalMessageId'
      | 'finalCreatedAt'
      | 'firstAssistantSeenAt'
      | 'firstToolStartedAt'
      | 'sequence'
    >,
  ): ChatRunOverlay {
    const toolCalls = mediaBridge.rehydrateToolCalls(sessionKey, projection.toolCalls) || cloneToolCalls(projection.toolCalls) || [];
    return {
      runId: projection.runId,
      startedAt: projection.startedAt,
      updatedAt: projection.updatedAt,
      lifecycle: projection.lifecycle,
      previewText: projection.previewText || '',
      toolCalls,
      finalMessageId: projection.finalMessageId || null,
      finalCreatedAt: projection.finalCreatedAt || null,
      firstAssistantSeenAt: projection.firstAssistantSeenAt || null,
      firstToolStartedAt: projection.firstToolStartedAt || null,
      sequence: projection.sequence || 0,
    };
  }

  function buildRunOverlayEvent(
    sessionKey: string,
    projection: ChatRunProjection,
    emittedAt: string,
    terminal: boolean,
  ): ChatStreamEvent | null {
    const overlay = buildRunOverlay(sessionKey, projection);
    if (!overlayHasVisibleContent(overlay)) {
      return null;
    }
    return {
      kind: 'run_overlay',
      sessionKey,
      runId: projection.runId,
      emittedAt,
      overlay,
      terminal,
    };
  }

  function persistProjectionIfTerminal(projection: ChatRunProjection): void {
    if (!isRunProjectionTerminal(projection.lifecycle)) {
      return;
    }
    runShadowStore.saveRunProjectionShadow(projection);
  }

  function supplementHistoryWithRunState(sessionKey: string, messages: ChatMessageItem[]): ChatMessageItem[] {
    const liveProjections = listRunProjections(sessionKey);
    const liveRunIds = new Set(liveProjections.map((projection) => projection.runId));
    return supplementHistoryWithRunStateSnapshot({
      sessionKey,
      messages: messages.map((message) => cloneChatMessageItem(message)!),
      liveRunIds,
      liveSupplements: liveProjections.map((projection) => ({
        runId: projection.runId,
        finalMessageId: projection.finalMessageId || null,
        finalCreatedAt: projection.finalCreatedAt || null,
        toolCalls: mediaBridge.rehydrateToolCalls(sessionKey, projection.toolCalls),
      })),
      shadowSupplements: runShadowStore.listRunProjectionShadows(sessionKey),
      rehydrateToolCalls: (targetSessionKey, toolCalls) => mediaBridge.rehydrateToolCalls(targetSessionKey, toolCalls),
      mergeHistoryAssistantMessage,
    });
  }

  function listRunOverlaysForSession(sessionKey: string): ChatRunOverlay[] {
    const liveProjections = listRunProjections(sessionKey);
    return listRunOverlaysForHistorySnapshot({
      sessionKey,
      liveProjections,
      shadowProjections: runShadowStore.listRunProjectionShadows(sessionKey),
      buildLiveOverlay: (projection) => buildRunOverlay(sessionKey, projection),
      buildShadowOverlay: (shadow) => buildRunOverlay(sessionKey, {
        runId: shadow.runId,
        startedAt: shadow.finalCreatedAt || shadow.savedAt,
        updatedAt: shadow.savedAt,
        lifecycle: shadow.lifecycle,
        previewText: shadow.lastAssistantText || '',
        toolCalls: shadow.toolCalls,
        finalMessageId: shadow.finalMessageId || null,
        finalCreatedAt: shadow.finalCreatedAt || null,
        firstAssistantSeenAt: shadow.finalCreatedAt || null,
        firstToolStartedAt: shadow.toolCalls[0]?.startedAt || null,
        sequence: Date.parse(shadow.savedAt || '') || 0,
      }),
    });
  }

  function countGatewaySubscribers(sessionKey: string): number {
    return gatewaySubscribers.get(sessionKey)?.size || 0;
  }

  function countRealtimeSubscribers(sessionKey: string): number {
    return (frontendSubscribers.get(sessionKey)?.size || 0)
      + (frontendSseSubscribers.get(sessionKey)?.size || 0)
      + countGatewaySubscribers(sessionKey);
  }

  function syncBridgeSubscriberCount(sessionKey: string): void {
    const bridge = sessionBridges.get(sessionKey);
    if (!bridge) {
      return;
    }
    bridge.subscribers = countRealtimeSubscribers(sessionKey);
  }

  function emitGatewayEvent(subscriber: ChatGatewaySubscriber, event: ChatStreamEvent): boolean {
    try {
      return subscriber.emit(event);
    } catch {
      return false;
    }
  }

  function pruneExpiredGatewaySubscribers(sessionKey: string, now = Date.now()): void {
    const subscribers = gatewaySubscribers.get(sessionKey);
    if (!subscribers?.size) {
      if (subscribers && subscribers.size === 0) {
        gatewaySubscribers.delete(sessionKey);
      }
      syncBridgeSubscriberCount(sessionKey);
      return;
    }
    for (const [connId, subscriber] of Array.from(subscribers.entries())) {
      if (now - subscriber.lastLeaseAt <= CHAT_GATEWAY_LEASE_MS) {
        continue;
      }
      subscribers.delete(connId);
    }
    if (subscribers.size === 0) {
      gatewaySubscribers.delete(sessionKey);
    }
    syncBridgeSubscriberCount(sessionKey);
    if (!countRealtimeSubscribers(sessionKey)) {
      disposeOfficialCanonicalStream(sessionKey);
      maybeDisposeSessionBridge(sessionKey);
    }
  }

  function broadcastGatewaySubscribers(sessionKey: string, event: ChatStreamEvent): void {
    pruneExpiredGatewaySubscribers(sessionKey);
    const subscribers = gatewaySubscribers.get(sessionKey);
    if (!subscribers?.size) {
      return;
    }
    for (const [connId, subscriber] of Array.from(subscribers.entries())) {
      if (emitGatewayEvent(subscriber, event)) {
        continue;
      }
      subscribers.delete(connId);
    }
    if (subscribers.size === 0) {
      gatewaySubscribers.delete(sessionKey);
    }
    syncBridgeSubscriberCount(sessionKey);
    if (!countRealtimeSubscribers(sessionKey)) {
      disposeOfficialCanonicalStream(sessionKey);
      maybeDisposeSessionBridge(sessionKey);
    }
  }

  function detachGatewayConnId(connId: string, targetSessionKey?: string | null): string | null {
    const normalizedSessionKey = normalizeString(targetSessionKey) || null;
    let detachedSessionKey: string | null = null;
    for (const [sessionKey, subscribers] of Array.from(gatewaySubscribers.entries())) {
      if (normalizedSessionKey && sessionKey !== normalizedSessionKey) {
        continue;
      }
      if (!subscribers.delete(connId)) {
        continue;
      }
      detachedSessionKey = sessionKey;
      if (subscribers.size === 0) {
        gatewaySubscribers.delete(sessionKey);
      }
      syncBridgeSubscriberCount(sessionKey);
      if (!countRealtimeSubscribers(sessionKey)) {
        disposeOfficialCanonicalStream(sessionKey);
        maybeDisposeSessionBridge(sessionKey);
      }
    }
    return detachedSessionKey;
  }

  function touchGatewaySubscriber(sessionKey: string, connId: string): boolean {
    pruneExpiredGatewaySubscribers(sessionKey);
    const subscriber = gatewaySubscribers.get(sessionKey)?.get(connId);
    if (!subscriber) {
      return false;
    }
    subscriber.lastLeaseAt = Date.now();
    return true;
  }

  function requireGatewaySubscriber(sessionKey: string, connId: string): void {
    if (touchGatewaySubscriber(sessionKey, connId)) {
      return;
    }
    throw new Error('chat_gateway_client_not_attached');
  }

  function registerGatewaySubscriber(sessionKey: string, runtime: ChatGatewayRuntime): void {
    detachGatewayConnId(runtime.connId);
    const subscribers = gatewaySubscribers.get(sessionKey) || new Map<string, ChatGatewaySubscriber>();
    subscribers.set(runtime.connId, {
      connId: runtime.connId,
      emit: runtime.emit,
      lastLeaseAt: Date.now(),
    });
    gatewaySubscribers.set(sessionKey, subscribers);
    syncBridgeSubscriberCount(sessionKey);
  }

  function registerFrontendSseSubscriber(sessionKey: string, res: http.ServerResponse): void {
    const subscribers = frontendSseSubscribers.get(sessionKey) || new Set<http.ServerResponse>();
    subscribers.add(res);
    frontendSseSubscribers.set(sessionKey, subscribers);
    syncBridgeSubscriberCount(sessionKey);
  }

  function unregisterFrontendSseSubscriber(sessionKey: string, res: http.ServerResponse): void {
    const subscribers = frontendSseSubscribers.get(sessionKey);
    if (!subscribers) {
      return;
    }
    subscribers.delete(res);
    if (subscribers.size === 0) {
      frontendSseSubscribers.delete(sessionKey);
    }
    syncBridgeSubscriberCount(sessionKey);
  }

  function replayBufferedEventsToWebSocket(
    socket: WebSocket,
    sessionKey: string,
    lastStreamSeq: number | null,
  ): void {
    for (const event of listChatStreamEventsAfter(streamReplayState, sessionKey, lastStreamSeq)) {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify(event));
    }
  }

  function replayBufferedEventsToSse(
    res: http.ServerResponse,
    sessionKey: string,
    lastStreamSeq: number | null,
  ): void {
    for (const event of listChatStreamEventsAfter(streamReplayState, sessionKey, lastStreamSeq)) {
      if (res.writableEnded || res.destroyed) {
        return;
      }
      sendSseEvent(res, 'chat-stream', event);
    }
  }

  function sequenceChatStreamEvent(sessionKey: string, event: ChatStreamEvent): ChatStreamEvent {
    return rememberChatStreamEvent(
      streamReplayState,
      sessionKey,
      event,
      CHAT_STREAM_REPLAY_EVENT_LIMIT,
    );
  }

  function sendSequencedWebSocketEvent(
    socket: WebSocket,
    sessionKey: string,
    event: ChatStreamEvent,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(sequenceChatStreamEvent(sessionKey, event)));
  }

  function sendSequencedSseEvent(
    res: http.ServerResponse,
    sessionKey: string,
    event: ChatStreamEvent,
  ): void {
    if (res.writableEnded || res.destroyed) {
      return;
    }
    sendSseEvent(res, 'chat-stream', sequenceChatStreamEvent(sessionKey, event));
  }

  function broadcastToSession(sessionKey: string, event: ChatStreamEvent): void {
    const sequencedEvent = sequenceChatStreamEvent(sessionKey, event);
    const targets = frontendSubscribers.get(sessionKey);
    if (targets?.size) {
      const payload = JSON.stringify(sequencedEvent);
      for (const socket of Array.from(targets)) {
        if (socket.readyState !== WebSocket.OPEN) {
          targets.delete(socket);
          continue;
        }
        socket.send(payload);
      }

      if (targets.size === 0) {
        frontendSubscribers.delete(sessionKey);
        syncBridgeSubscriberCount(sessionKey);
      }
    }
    const sseTargets = frontendSseSubscribers.get(sessionKey);
    if (sseTargets?.size) {
      for (const res of Array.from(sseTargets)) {
        if (res.writableEnded || res.destroyed) {
          sseTargets.delete(res);
          continue;
        }
        sendSseEvent(res, 'chat-stream', sequencedEvent);
      }
      if (sseTargets.size === 0) {
        frontendSseSubscribers.delete(sessionKey);
        syncBridgeSubscriberCount(sessionKey);
      }
    }
    broadcastGatewaySubscribers(sessionKey, sequencedEvent);
  }

  function updateRuntimeCache(sessionKey: string, nextRuntime: ChatRuntimeState): void {
    const current = getTracevaneSession(sessionKey);
    if (!current) return;
    setTracevaneSession({
      ...current,
      row: {
        ...current.row,
        runtime: nextRuntime,
      },
    });
  }

  function updateObservabilityCache(
    sessionKey: string,
    updater: (current: ChatObservabilityState) => ChatObservabilityState
  ): ChatObservabilityState | null {
    const current = getTracevaneSession(sessionKey);
    if (!current) return null;
    const nextObservability = updater(cloneObservabilityState(current.observability));
    setTracevaneSession({
      ...current,
      observability: nextObservability,
    });
    return nextObservability;
  }

  function appendTracevaneMessage(sessionKey: string, message: ChatMessageItem): void {
    const current = getTracevaneSession(sessionKey);
    if (!current) return;
    current.messages = normalizeMessageLedger([...current.messages, message]);
    const lastMessage = current.messages[current.messages.length - 1];
    const lastMessagePreview = deriveLastMessagePreview(lastMessage, current.row.lastMessagePreview);
    current.row = {
      ...current.row,
      updatedAt: lastMessage?.createdAt || message.createdAt || current.row.updatedAt,
      lastMessagePreview,
    };
    refreshTracevaneAutoLabel(current);
    setTracevaneSession(current);
    saveRegistryEntry(buildRegistryEntryFromRow(current.row));
  }

  function upsertTracevaneMessage(sessionKey: string, message: ChatMessageItem): void {
    const current = getTracevaneSession(sessionKey);
    if (!current) return;
    const index = current.messages.findIndex((entry) => entry.id === message.id);
    if (index >= 0) {
      current.messages[index] = message;
    } else {
      current.messages.push(message);
    }
    current.messages = normalizeMessageLedger(current.messages);
    const lastMessage = current.messages[current.messages.length - 1];
    const lastMessagePreview = deriveLastMessagePreview(lastMessage, current.row.lastMessagePreview);
    current.row = {
      ...current.row,
      updatedAt: lastMessage?.createdAt || message.createdAt || current.row.updatedAt,
      lastMessagePreview,
    };
    refreshTracevaneAutoLabel(current);
    setTracevaneSession(current);
    saveRegistryEntry(buildRegistryEntryFromRow(current.row));
  }

  function mapGatewaySessionRow(
    agentId: string,
    row: Record<string, unknown>,
    gatewayConnected: boolean
  ): ChatSessionRow {
    const key = normalizeString(row.key);
    const registryEntry = getRegistryEntry(key);
    const kind = classifyChatSessionKind({
      sessionKey: key,
      originProvider: normalizeString((row.origin as Record<string, unknown> | undefined)?.provider),
      lastChannel: normalizeString(row.lastChannel || row.channel),
      lastTo: normalizeString(row.lastTo),
    });
    const fallbackLabel = kind === 'observed_external'
      ? normalizeString(row.derivedTitle, key)
      : buildDefaultSessionLabel(agentId);
    const permissions = buildChatSessionPermissions(kind);
    const cachedRuntime = getTracevaneSession(key)?.row.runtime;

    return {
      key,
      agentId,
      sessionId: normalizeString(row.sessionId, normalizeString(registryEntry?.sessionId) || '') || null,
      kind,
      label: kind === 'tracevane_managed'
        ? normalizeString(registryEntry?.customLabel, normalizeString(registryEntry?.label, normalizeString(row.label, fallbackLabel)))
        : normalizeString(row.label, fallbackLabel),
      derivedTitle: kind === 'tracevane_managed' ? null : normalizeString(row.derivedTitle) || null,
      lastMessagePreview: normalizeString(row.lastMessagePreview) || null,
      updatedAt: normalizeDate(row.updatedAt),
      presentation: kind === 'tracevane_managed' ? buildSessionPresentation(registryEntry) : buildSessionPresentation(),
      source: {
        source: kind === 'tracevane_managed' ? 'tracevane' : kind === 'system_internal' ? 'system' : 'external',
        channel: normalizeString(row.channel || row.lastChannel) || null,
        surface: normalizeString((row.origin as Record<string, unknown> | undefined)?.surface || row.channel) || null,
        originLabel: normalizeString((row.origin as Record<string, unknown> | undefined)?.label || row.displayName) || null,
      },
      deliveryContext: {
        channel: normalizeString((row.deliveryContext as Record<string, unknown> | undefined)?.channel || row.lastChannel) || null,
        accountId: normalizeString((row.deliveryContext as Record<string, unknown> | undefined)?.accountId || row.lastAccountId) || null,
        to: normalizeString((row.deliveryContext as Record<string, unknown> | undefined)?.to || row.lastTo) || null,
        threadId: normalizeString((row.deliveryContext as Record<string, unknown> | undefined)?.threadId) || null,
      },
      permissions,
      runtime: cachedRuntime || buildRuntimeState(gatewayConnected, permissions.writable, {
        state: 'unknown',
      }),
    };
  }

  async function requireSession(sessionKey: string, gatewayConnectedHint?: boolean | null): Promise<ChatSessionRow> {
    const inMemory = getTracevaneSession(sessionKey);
    if (inMemory) return inMemory.row;

    const registryEntry = getRegistryEntry(sessionKey);
    if (registryEntry) {
      return buildTracevaneManagedRowFromRegistry(
        registryEntry,
        gatewayConnectedHint ?? await isGatewayConnected(),
      );
    }

    const agentId = deriveAgentIdFromSessionKey(sessionKey);
    const store = readJsonFile<Record<string, LocalSessionRecord>>(resolveAgentSessionsStorePath(options.config, agentId), {});
    const record = store[sessionKey];
    if (record) {
      const mapped = mapLocalSessionRow(
        agentId,
        sessionKey,
        record,
        gatewayConnectedHint ?? await isGatewayConnected(),
        registryEntry,
      );
      if (mapped.kind === 'tracevane_managed' && !registryEntry) {
        saveRegistryEntry(buildRegistryEntryFromRow(mapped));
      }
      return mapped;
    }

    throw new ChatServiceError(404, buildChatError('session_not_found', `Session '${sessionKey}' not found`));
  }

  function requireFrontendVisible(session: ChatSessionRow): void {
    if (session.permissions.visibleInFrontend) {
      return;
    }
    throw new ChatServiceError(403, buildChatError('auth_failure', `Session '${session.key}' is not accessible from Tracevane chat`));
  }

  function requireWritable(session: ChatSessionRow, action: 'send' | 'abort' | 'reset' | 'delete' | 'inject'): void {
    const allowMap = {
      send: session.permissions.canSend,
      abort: session.permissions.canAbort,
      reset: session.permissions.canReset,
      delete: session.permissions.canDelete,
      inject: session.permissions.canInject,
    } as const;

    if (allowMap[action]) return;
    throw new ChatServiceError(403, buildChatError('session_not_writable', `Session '${session.key}' is not writable`));
  }

  function normalizeSlashGatewayParams(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }

  function resolveSlashGatewayTargetKey(
    currentSession: ChatSessionRow,
    params: Record<string, unknown>,
  ): string {
    const targetKey = normalizeString(params.key || params.sessionKey || currentSession.key, currentSession.key);
    if (deriveAgentIdFromSessionKey(targetKey) !== currentSession.agentId) {
      throw new ChatServiceError(
        400,
        buildChatError('invalid_request', `Slash command target '${targetKey}' is outside the current agent scope`),
      );
    }
    return targetKey;
  }

  function currentTracevaneHistory(state: TracevaneManagedSessionState): ChatMessageItem[] {
    return normalizeMessageLedger(supplementHistoryWithRunState(state.row.key, state.messages.slice()));
  }

  function compareSessionRowRecency(left: ChatSessionRow, right: ChatSessionRow): number {
    const leftTs = Math.max(
      Date.parse(left.updatedAt || '') || 0,
      Date.parse(left.runtime.lastEventAt || '') || 0,
      Date.parse(left.runtime.lastAckAt || '') || 0,
    );
    const rightTs = Math.max(
      Date.parse(right.updatedAt || '') || 0,
      Date.parse(right.runtime.lastEventAt || '') || 0,
      Date.parse(right.runtime.lastAckAt || '') || 0,
    );
    if (leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return left.key.localeCompare(right.key);
  }

  function bootstrapSessionRank(session: ChatSessionRow): number {
    const runtimeActive = Boolean(
      session.runtime.activeRunId
      || session.runtime.state === 'running'
      || session.runtime.state === 'streaming',
    );
    if (runtimeActive) {
      return 0;
    }
    if (session.permissions.canSend && session.kind === 'tracevane_managed') {
      return 1;
    }
    if (session.permissions.canSend) {
      return 2;
    }
    if (session.kind === 'tracevane_managed') {
      return 3;
    }
    return 4;
  }

  function compareBootstrapSessionPreference(left: ChatSessionRow, right: ChatSessionRow): number {
    return bootstrapSessionRank(left) - bootstrapSessionRank(right)
      || compareSessionRowRecency(left, right);
  }

  function readJsonObjectStrict<T extends Record<string, unknown>>(
    filePath: string,
  ): { ok: boolean; exists: boolean; value: T } {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as T;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, exists: true, value: {} as T };
      }
      return { ok: true, exists: true, value: parsed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        return { ok: true, exists: false, value: {} as T };
      }
      return { ok: false, exists: true, value: {} as T };
    }
  }

  function buildLocalSessionRowsForAgent(
    agentId: string,
    gatewayConnected: boolean,
    registry: Record<string, TracevaneSessionRegistryEntry> = ensureRegistryLoaded(),
    localStore: Record<string, LocalSessionRecord> = readJsonFile<Record<string, LocalSessionRecord>>(
      resolveAgentSessionsStorePath(options.config, agentId),
      {},
    ),
  ): ChatSessionRow[] {
    const rows: ChatSessionRow[] = [];
    const seenKeys = new Set<string>();
    for (const [key, record] of Object.entries(localStore)) {
      const row = mapLocalSessionRow(agentId, key, record, gatewayConnected, registry[key] || null);
      if (!row.permissions.visibleInFrontend) {
        continue;
      }
      rows.push(row);
      seenKeys.add(row.key);
    }

    for (const entry of Object.values(registry)) {
      if (entry.agentId !== agentId || seenKeys.has(entry.key)) {
        continue;
      }
      const row = getTracevaneSession(entry.key)?.row || buildTracevaneManagedRowFromRegistry(entry, gatewayConnected);
      if (!row.permissions.visibleInFrontend) {
        continue;
      }
      rows.push(row);
      seenKeys.add(row.key);
    }

    return rows.sort(compareSessionRowRecency);
  }

  function computeLocalSessionCatalogSignature(): string {
    const parts: string[] = [];
    const registryPath = resolveTracevaneChatRegistryPath(options.config);
    const registryStat = safeStatSync(registryPath);
    parts.push(`registry:${registryPath}:${registryStat?.ino || 0}:${registryStat?.size || 0}:${registryStat?.mtimeMs || 0}`);

    const agentsRoot = path.join(options.config.openclawRoot, 'agents');
    let agentIds: string[] = [];
    try {
      agentIds = fs.readdirSync(agentsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      agentIds = [];
    }

    for (const agentId of agentIds) {
      const storePath = resolveAgentSessionsStorePath(options.config, agentId);
      const stat = safeStatSync(storePath);
      parts.push(`agent:${agentId}:${stat?.ino || 0}:${stat?.size || 0}:${stat?.mtimeMs || 0}`);
    }

    return parts.join('|');
  }

  function buildLocalSessionCatalog(params: {
    preferredSessionKey?: string | null;
    recentLimit?: number;
  }): ChatSessionRow[] {
    const recentLimit = normalizeHistoryLimit(params.recentLimit, 40);
    const localCatalogSignature = computeLocalSessionCatalogSignature();
    const strictRegistryResult = readJsonObjectStrict<Record<string, TracevaneSessionRegistryEntry>>(
      resolveTracevaneChatRegistryPath(options.config),
    );
    const registry = strictRegistryResult.ok ? strictRegistryResult.value : ensureRegistryLoaded();
    const registryMinimumRows = Object.values(registry)
      .filter((entry) => normalizeString(entry?.key) && normalizeString(entry?.agentId))
      .length;
    const catalogSnapshot = sessionCatalogStore.readSnapshot();
    const catalogRows = catalogSnapshot.sessions
      .filter((row) => row.permissions.visibleInFrontend)
      .sort(compareSessionRowRecency);
    const catalogSnapshotLooksComplete = registryMinimumRows === 0 || catalogRows.length >= registryMinimumRows;
    if (
      catalogRows.length > 0
      && catalogSnapshot.signature === localCatalogSignature
      && catalogSnapshotLooksComplete
    ) {
      const preferredSessionKey = normalizeString(params.preferredSessionKey) || null;
      if (!preferredSessionKey) {
        return catalogRows.slice(0, recentLimit);
      }
      const preferredRow = catalogRows.find((row) => row.key === preferredSessionKey) || null;
      if (!preferredRow) {
        return catalogRows.slice(0, recentLimit);
      }
      const trimmed = catalogRows.slice(0, recentLimit).filter((row) => row.key !== preferredSessionKey);
      return [preferredRow, ...trimmed].slice(0, recentLimit);
    }

    const agentIds = new Set<string>(resolveAvailableAgentIds(options.config));
    let catalogSourcesHealthy = strictRegistryResult.ok;
    for (const entry of Object.values(registry)) {
      if (entry.agentId) {
        agentIds.add(entry.agentId);
      }
    }
    if (params.preferredSessionKey) {
      agentIds.add(deriveAgentIdFromSessionKey(params.preferredSessionKey));
    }

    const deduped = new Map<string, ChatSessionRow>();
    for (const agentId of agentIds) {
      const strictStoreResult = readJsonObjectStrict<Record<string, LocalSessionRecord>>(
        resolveAgentSessionsStorePath(options.config, agentId),
      );
      catalogSourcesHealthy = catalogSourcesHealthy && strictStoreResult.ok;
      for (const row of buildLocalSessionRowsForAgent(
        agentId,
        false,
        registry,
        strictStoreResult.ok ? strictStoreResult.value : {},
      )) {
        const current = deduped.get(row.key);
        if (!current || compareSessionRowRecency(row, current) < 0) {
          deduped.set(row.key, row);
        }
      }
    }

    const rows = [...deduped.values()].sort(compareSessionRowRecency);
    if (catalogSourcesHealthy && sessionCatalogStore.replaceAllSessions(rows)) {
      sessionCatalogStore.setSignature(localCatalogSignature);
    }
    const preferredSessionKey = normalizeString(params.preferredSessionKey) || null;
    if (!preferredSessionKey) {
      return rows.slice(0, recentLimit);
    }
    const preferredRow = rows.find((row) => row.key === preferredSessionKey) || null;
    if (!preferredRow) {
      return rows.slice(0, recentLimit);
    }
    const trimmed = rows.slice(0, recentLimit).filter((row) => row.key !== preferredSessionKey);
    return [preferredRow, ...trimmed].slice(0, recentLimit);
  }

  function isLocalTranscriptBehindInMemory(
    inMemory: TracevaneManagedSessionState | null,
    transcriptMessages: ChatMessageItem[],
  ): boolean {
    if (!inMemory) {
      return false;
    }
    const currentHistory = currentTracevaneHistory(inMemory);
    if (!currentHistory.length) {
      return false;
    }
    if (transcriptMessages.length < currentHistory.length) {
      return true;
    }
    const transcriptLastTs = Date.parse(transcriptMessages[transcriptMessages.length - 1]?.createdAt || '') || 0;
    const inMemoryLastTs = Date.parse(currentHistory[currentHistory.length - 1]?.createdAt || '') || 0;
    if (inMemoryLastTs && transcriptLastTs + 2_000 < inMemoryLastTs) {
      return true;
    }
    return false;
  }

  function normalizeHistoryLimit(value: number | null | undefined, fallback = 50): number {
    const numeric = Number.isFinite(value) ? Math.trunc(Number(value)) : fallback;
    return Math.min(100, Math.max(1, numeric || fallback));
  }

  function transcriptContentCacheKey(sessionFile: string, sourceMtimeMs: number | null): string {
    return `${sessionFile}::${sourceMtimeMs ?? 'none'}`;
  }

  function readTranscriptContentCached(sessionFile: string, sourceMtimeMs: number | null): string {
    const key = transcriptContentCacheKey(sessionFile, sourceMtimeMs);
    const cached = transcriptContentCache.get(key);
    if (typeof cached === 'string') {
      return cached;
    }
    const content = fs.readFileSync(sessionFile, 'utf-8');
    transcriptContentCache.set(key, content);
    return content;
  }

  function resolveLocalSessionSource(sessionKey: string): {
    agentId: string;
    record: LocalSessionRecord | null;
    sessionFile: string | null;
    sourceMtimeMs: number | null;
    priorSessionFiles: string[];
  } {
    const agentId = deriveAgentIdFromSessionKey(sessionKey);
    const store = readJsonFile<Record<string, LocalSessionRecord>>(resolveAgentSessionsStorePath(options.config, agentId), {});
    const record = store[sessionKey] || null;
    const sessionFile = normalizeString(record?.sessionFile) || null;
    const sourceMtimeMs = (() => {
      if (!sessionFile) {
        return null;
      }
      try {
        return fs.statSync(sessionFile).mtimeMs;
      } catch {
        return null;
      }
    })();

    // Detect gateway session resets by comparing the per-agent sessionId
    // with the Tracevane registry's sessionId. When they differ, the gateway
    // re-materialized the session and renamed the old JSONL to .reset.*.
    const priorSessionFiles: string[] = [];
    if (sessionFile && record?.sessionId) {
      const registryEntry = getRegistryEntry(sessionKey);
      if (registryEntry) {
        const registrySessionId = normalizeString(registryEntry.sessionId) || null;
        const currentSessionId = normalizeString(record.sessionId) || null;
        if (registrySessionId && currentSessionId && registrySessionId !== currentSessionId) {
          // Session was reset — track the old sessionId
          const priorIds = [...(registryEntry.priorSessionIds || [])];
          if (!priorIds.includes(registrySessionId)) {
            priorIds.push(registrySessionId);
          }
          saveRegistryEntry({
            ...registryEntry,
            sessionId: currentSessionId,
            priorSessionIds: priorIds,
          });
        }

        // Resolve .reset.* backup files for all known prior session IDs
        const allPriorIds = getRegistryEntry(sessionKey)?.priorSessionIds || [];
        if (allPriorIds.length > 0) {
          const sessionsDir = path.dirname(sessionFile);
          for (const priorId of allPriorIds) {
            try {
              const candidates = fs.readdirSync(sessionsDir)
                .filter((name) => name.startsWith(`${priorId}.jsonl.reset.`))
                .sort()
                .reverse(); // newest reset first (but we want chronological, so reverse later)
              for (const candidate of candidates) {
                const fullPath = path.join(sessionsDir, candidate);
                priorSessionFiles.push(fullPath);
              }
            } catch {}
          }
          // Sort prior files chronologically (oldest first) by the reset timestamp in filename
          priorSessionFiles.sort();
        }
      }
    }

    return {
      agentId,
      record,
      sessionFile,
      sourceMtimeMs,
      priorSessionFiles,
    };
  }

  function buildHistorySnapshotCacheSignature(params: {
    sessionKey: string;
    sourceSelection: ChatCanonicalSourceSelection;
    inMemory: TracevaneManagedSessionState | null;
    session: ChatSessionRow;
  }): string {
    const currentHistory = params.inMemory?.messages || [];
    const lastMessage = currentHistory[currentHistory.length - 1] || null;
    const runtime = params.inMemory?.row.runtime || params.session.runtime;
    const priorFileSignature = params.sourceSelection.priorSessionFiles
      .map((file) => {
        const stat = safeStatSync(file);
        return `${file}:${stat?.ino || 0}:${stat?.size || 0}:${stat?.mtimeMs || 0}`;
      })
      .join('|');
    return [
      params.sessionKey,
      params.sourceSelection.kind,
      params.sourceSelection.sessionFile || '',
      String(params.sourceSelection.sourceMtimeMs || 0),
      priorFileSignature,
      params.session.label || '',
      params.session.derivedTitle || '',
      params.session.updatedAt || '',
      String(currentHistory.length),
      lastMessage?.id || '',
      lastMessage?.createdAt || '',
      runtime.activeRunId || '',
      runtime.lastEventAt || '',
      runtime.lastAckAt || '',
      params.inMemory?.clearedAt || '',
      params.inMemory?.resetPending ? '1' : '0',
    ].join('::');
  }

  function buildTranscriptMirrorSignature(
    selection: Extract<ChatCanonicalSourceSelection, { kind: 'local_transcript' }>,
  ): string {
    const currentStat = safeStatSync(selection.sessionFile);
    const priorFileSignature = selection.priorSessionFiles
      .map((file) => {
        const stat = safeStatSync(file);
        return `${file}:${stat?.ino || 0}:${stat?.size || 0}:${stat?.mtimeMs || 0}`;
      })
      .join('|');
    return [
      selection.sessionFile,
      String(currentStat?.ino || 0),
      String(currentStat?.size || 0),
      String(currentStat?.mtimeMs || 0),
      priorFileSignature,
    ].join('::');
  }

  function cloneHistorySnapshotCacheEntry(entry: HistorySnapshotCacheEntry): HistorySnapshotCacheEntry {
    return {
      ...entry,
      session: JSON.parse(JSON.stringify(entry.session)) as ChatSessionRow,
      messages: entry.messages.map((message) => cloneChatMessageItem(message)!),
      canonicalEntries: cloneCanonicalEntries(entry.canonicalEntries),
      observability: cloneObservabilityState(entry.observability),
      toolCards: entry.toolCards.map((item) => cloneChatToolCard(item)!),
    };
  }

  function readTranscriptRawEntries(sessionFile: string): Record<string, unknown>[] {
    try {
      return fs.readFileSync(sessionFile, 'utf-8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            return parsed && typeof parsed === 'object' ? [parsed] : [];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  function parseTranscriptRawEntriesFromContent(content: string): Record<string, unknown>[] {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          return parsed && typeof parsed === 'object' ? [parsed] : [];
        } catch {
          return [];
        }
      });
  }

  function readTranscriptRawTailEntries(sessionFile: string, rawLineLimit: number): {
    entries: Record<string, unknown>[];
    hasMoreBefore: boolean;
  } {
    const limit = Math.max(1, Math.trunc(rawLineLimit || 1));
    let stat: fs.Stats;
    try {
      stat = fs.statSync(sessionFile);
    } catch {
      return { entries: [], hasMoreBefore: false };
    }
    if (stat.size <= 0) {
      return { entries: [], hasMoreBefore: false };
    }

    const blockSize = 64 * 1024;
    const maxReadBytes = 8 * 1024 * 1024;
    const chunks: Buffer[] = [];
    let position = stat.size;
    let readBytes = 0;
    let completeLineCount = 0;
    let fd: number | null = null;
    try {
      fd = fs.openSync(sessionFile, 'r');
      while (position > 0 && completeLineCount < limit && readBytes < maxReadBytes) {
        const size = Math.min(blockSize, position, maxReadBytes - readBytes);
        position -= size;
        const buffer = Buffer.allocUnsafe(size);
        const bytesRead = fs.readSync(fd, buffer, 0, size, position);
        if (bytesRead <= 0) {
          break;
        }
        const chunk = bytesRead === size ? buffer : buffer.subarray(0, bytesRead);
        chunks.unshift(chunk);
        readBytes += bytesRead;
        const text = Buffer.concat(chunks).toString('utf-8');
        const parts = text.split(/\r?\n/);
        const completeParts = position > 0 ? parts.slice(1) : parts;
        completeLineCount = completeParts.map((line) => line.trim()).filter(Boolean).length;
      }
    } catch {
      return { entries: [], hasMoreBefore: false };
    } finally {
      if (fd != null) {
        try { fs.closeSync(fd); } catch {}
      }
    }

    const text = Buffer.concat(chunks).toString('utf-8');
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const selectedLines = lines.slice(-limit);
    const entries = dedupeTranscriptReplayEntries(parseTranscriptRawEntriesFromContent(selectedLines.join('\n')));
    return {
      entries,
      hasMoreBefore: position > 0 || lines.length > selectedLines.length,
    };
  }

  function readLocalTranscriptCanonicalTailWindow(
    sessionKey: string,
    sourceSelection: Extract<ChatCanonicalSourceSelection, { kind: 'local_transcript' }>,
  ): {
    entries: ChatCanonicalEntry[];
    pageInfo: ChatHistoryPayload['pageInfo'];
  } {
    const rawTail = readTranscriptRawTailEntries(
      sourceSelection.sessionFile,
      CHAT_CANONICAL_LOCAL_TAIL_RAW_LINE_LIMIT,
    );
    const mappingOptions: TranscriptMappingOptions = {
      sessionKey,
      collectMessageResources: mediaBridge.collectMessageResources,
      overrideMessage: overrideTranscriptMessage,
    };
    const mappedEntries = mapCanonicalEntriesFromParsedEntries(rawTail.entries, mappingOptions)
      .map(buildCanonicalEntryFromMapped);
    const derivedObservability = deriveObservabilityFromHistory(rawTail.entries, {
      sessionKey,
      collectToolArtifacts: mediaBridge.collectToolArtifacts,
      toolCardLimit: 12,
    });
    const enrichedMessages = enrichMessagesWithToolCards(
      mappedEntries.map((entry) => entry.message),
      derivedObservability.toolCards,
    );
    const enrichedEntries = mappedEntries.map((entry, index) => ({
      ...entry,
      message: cloneChatMessageItem(enrichedMessages[index] || entry.message)!,
    }));
    const windowEntries = resequenceCanonicalEntries(
      enrichedEntries.slice(-CHAT_CANONICAL_SNAPSHOT_WINDOW_LIMIT),
      1,
    );
    const hasMoreBefore = Boolean(
      sourceSelection.priorSessionFiles.length > 0
      || rawTail.hasMoreBefore
      || enrichedEntries.length > windowEntries.length,
    );
    const firstMessage = windowEntries[0]?.message || null;
    return {
      entries: windowEntries,
      pageInfo: {
        hasMoreBefore,
        beforeCursor: firstMessage && hasMoreBefore
          ? encodeHistoryCursor({
            source: 'history_window',
            anchorIndex: 0,
            anchorMessageId: firstMessage.id,
            anchorCreatedAt: firstMessage.createdAt,
            day: null,
            query: null,
            roleFilter: null,
            contentFilter: null,
          })
          : null,
        hasMoreAfter: false,
        afterCursor: null,
      },
    };
  }

  function extractTranscriptLineTimestamp(raw: Record<string, unknown>): string | null {
    const record = extractTranscriptRecord(raw);
    return normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt || record.timestamp || record.createdAt || record.updatedAt) || null;
  }

  function readTranscriptDateBucketsFast(sessionFile: string): ChatHistoryDateBucket[] | null {
    let content: string;
    try {
      content = fs.readFileSync(sessionFile, 'utf-8');
    } catch {
      return null;
    }
    const buckets = new Map<string, ChatHistoryDateBucket>();
    let visibleIndex = 0;
    for (const raw of dedupeTranscriptReplayEntries(parseTranscriptRawEntriesFromContent(content))) {
      if (!raw || typeof raw !== 'object' || shouldSkipTranscriptLine(raw)) {
        continue;
      }
      const day = extractTranscriptLineTimestamp(raw)?.slice(0, 10) || null;
      if (!day) {
        continue;
      }
      const record = extractTranscriptRecord(raw);
      const messageId = normalizeString(raw.id || record.id, `history-${visibleIndex}`);
      visibleIndex += 1;
      const current = buckets.get(day);
      if (!current) {
        buckets.set(day, {
          day,
          count: 1,
          firstMessageId: messageId,
          lastMessageId: messageId,
        });
        continue;
      }
      current.count += 1;
      current.lastMessageId = messageId;
    }
    return [...buckets.values()].sort((left, right) => right.day.localeCompare(left.day));
  }

  function normalizeTranscriptSearchText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function transcriptRawHasResource(raw: Record<string, unknown>): boolean {
    const record = extractTranscriptRecord(raw);
    if (
      Array.isArray(record.resources)
      || Array.isArray(record.media)
      || Array.isArray(record.blocks)
      || Array.isArray(raw.resources)
      || Array.isArray(raw.media)
      || Array.isArray(raw.blocks)
    ) {
      return true;
    }
    const content = Array.isArray(record.content) ? record.content : [];
    return content.some((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const type = normalizeString((item as Record<string, unknown>).type).toLowerCase();
      return type === 'image'
        || type === 'video'
        || type === 'file'
        || type === 'resource'
        || type === 'canvas';
    });
  }

  function transcriptRawHasCode(raw: Record<string, unknown>, textValue: string): boolean {
    if (/```/.test(textValue) || /^\s{4,}\S/m.test(textValue)) {
      return true;
    }
    const record = extractTranscriptRecord(raw);
    const content = Array.isArray(record.content) ? record.content : [];
    return content.some((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const type = normalizeString((item as Record<string, unknown>).type).toLowerCase();
      return type === 'code' || type === 'pre';
    });
  }

  function transcriptRawMatchesSearchFilters(params: {
    raw: Record<string, unknown>;
    textValue: string;
    query: string;
    roleFilter: ChatHistorySearchRoleFilter;
    contentFilter: ChatHistorySearchContentFilter;
    day: string | null;
  }): boolean {
    if (shouldSkipTranscriptLine(params.raw)) {
      return false;
    }
    const role = extractTranscriptRole(params.raw);
    if (params.roleFilter !== 'all' && role !== params.roleFilter) {
      return false;
    }
    if (params.day && extractTranscriptLineTimestamp(params.raw)?.slice(0, 10) !== params.day) {
      return false;
    }
    if (params.contentFilter === 'text' && !normalizeTranscriptSearchText(params.textValue)) {
      return false;
    }
    if (params.contentFilter === 'resource' && !transcriptRawHasResource(params.raw)) {
      return false;
    }
    if (params.contentFilter === 'code' && !transcriptRawHasCode(params.raw, params.textValue)) {
      return false;
    }
    if (!params.query) {
      return true;
    }
    const haystack = normalizeTranscriptSearchText(params.textValue);
    const normalizedQuery = normalizeTranscriptSearchText(params.query);
    if (!normalizedQuery) {
      return true;
    }
    if (haystack.includes(normalizedQuery)) {
      return true;
    }
    const terms = normalizedQuery.match(/[\p{L}\p{N}]+/gu) || [];
    return terms.length > 0 && terms.every((term) => haystack.includes(term));
  }

  function scanTranscriptIndexSeedItemsFastFromContent(content: string): ChatHistoryIndexSeedItem[] {
    const items: ChatHistoryIndexSeedItem[] = [];
    let visibleIndex = 0;
    for (const raw of dedupeTranscriptReplayEntries(parseTranscriptRawEntriesFromContent(content))) {
      if (!raw || typeof raw !== 'object' || shouldSkipTranscriptLine(raw)) {
        continue;
      }
      const record = extractTranscriptRecord(raw);
      const textValue = extractMessageText(raw);
      const messageId = normalizeString(raw.id || record.id, `history-${visibleIndex}`);
      const createdAt = extractTranscriptLineTimestamp(raw);
      const previewText = clipPreview(textValue, 280);
      items.push({
        id: messageId,
        role: extractTranscriptRole(raw),
        createdAt,
        previewText,
        snippetText: previewText,
        runId: normalizeString(raw.runId || record.runId) || null,
        messageIndex: visibleIndex,
        hasText: Boolean(normalizeTranscriptSearchText(textValue)),
        hasResources: transcriptRawHasResource(raw),
        hasCode: transcriptRawHasCode(raw, textValue),
      });
      visibleIndex += 1;
    }
    return items;
  }

  function scanTranscriptIndexSeedItemsFast(sessionFile: string): ChatHistoryIndexSeedItem[] | null {
    let content: string;
    try {
      content = fs.readFileSync(sessionFile, 'utf-8');
    } catch {
      return null;
    }
    return scanTranscriptIndexSeedItemsFastFromContent(content);
  }

  function mapTranscriptMessagesByIdsFastFromContent(
    content: string,
    sessionKey: string,
    messageIds: string[],
  ): ChatMessageItem[] {
    if (!messageIds.length) {
      return [];
    }
    const targetIds = new Set(messageIds);
    const messagesById = new Map<string, ChatMessageItem>();
    let visibleIndex = 0;
    for (const raw of dedupeTranscriptReplayEntries(parseTranscriptRawEntriesFromContent(content))) {
      if (!raw || typeof raw !== 'object' || shouldSkipTranscriptLine(raw)) {
        continue;
      }
      const record = extractTranscriptRecord(raw);
      const messageId = normalizeString(raw.id || record.id, `history-${visibleIndex}`);
      if (targetIds.has(messageId)) {
        const message = mapTranscriptMessage(raw, visibleIndex, {
          sessionKey,
          collectMessageResources: mediaBridge.collectMessageResources,
          overrideMessage: overrideTranscriptMessage,
        });
        if (message) {
          messagesById.set(messageId, message);
        }
      }
      visibleIndex += 1;
      if (messagesById.size === targetIds.size) {
        break;
      }
    }
    return messageIds
      .map((messageId) => messagesById.get(messageId))
      .filter((message): message is ChatMessageItem => Boolean(message));
  }

  interface TranscriptStatCacheEntry {
    ino: number;
    size: number;
    mtimeMs: number;
    entries: Record<string, unknown>[];
  }

  const transcriptStatCache = new LruMap<string, TranscriptStatCacheEntry>(200);

  function readTranscriptEntriesIncremental(sessionFile: string): Record<string, unknown>[] {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(sessionFile);
    } catch {
      return [];
    }

    const cached = transcriptStatCache.get(sessionFile);

    if (cached && cached.ino === stat.ino && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return cached.entries;
    }

    const entries = dedupeTranscriptReplayEntries(readTranscriptRawEntries(sessionFile));
    transcriptStatCache.set(sessionFile, {
      ino: stat.ino,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      entries,
    });
    return entries;
  }

  async function loadHistorySnapshot(
    sessionKey: string,
    loadOptions: {
      localOnly?: boolean;
    } = {},
  ): Promise<{
    checkedAt: string;
    session: ChatSessionRow;
    messages: ChatMessageItem[];
    canonicalEntries: ChatCanonicalEntry[];
    canonicalSource: ChatCanonicalState['source'];
    overlays: ChatRunOverlay[];
    runtime: ChatRuntimeState;
    diagnostics: ChatDiagnostics;
    observability: ChatObservabilityState;
    sourceSessionFile: string | null;
    sourceMtimeMs: number | null;
  }> {
    const gatewayConnected = await isGatewayConnected();
    let session = await requireSession(sessionKey, gatewayConnected);
    const diagnostics = await buildHealth([], gatewayConnected);
    let messages: ChatMessageItem[] = [];
    let canonicalEntries: ChatCanonicalEntry[] = [];
    let canonicalSource: ChatCanonicalState['source'] = 'history_rpc';
    let historyToolCards: ChatToolCard[] = [];
    let sourceSessionFile: string | null = null;
    let sourceMtimeMs: number | null = null;
    const inMemory = getTracevaneSession(sessionKey);
    const observability = inMemory ? cloneObservabilityState(inMemory.observability) : createEmptyObservabilityState();

    if (inMemory?.resetPending) {
      diagnostics.notes.push('Tracevane reset is still being finalized by the backend adapter; returning cleared in-memory history.');
      return {
        checkedAt: new Date().toISOString(),
        session: inMemory.row,
        messages: [],
        canonicalEntries: [],
        canonicalSource: 'history_rpc',
        overlays: [],
        runtime: inMemory.row.runtime,
        diagnostics,
        observability,
        sourceSessionFile: null,
        sourceMtimeMs: null,
      };
    }

    const sourceSelection = selectCanonicalSource(sessionKey);
    sourceSessionFile = sourceSelection.sessionFile;
    sourceMtimeMs = sourceSelection.sourceMtimeMs;
    const historySnapshotCacheSignature = buildHistorySnapshotCacheSignature({
      sessionKey,
      sourceSelection,
      inMemory,
      session,
    });
    const cachedSnapshot = sourceSelection.kind === 'local_transcript'
      ? historySnapshotCache.get(sessionKey)
      : null;
    if (cachedSnapshot && cachedSnapshot.signature === historySnapshotCacheSignature) {
      const restored = cloneHistorySnapshotCacheEntry(cachedSnapshot);
      diagnostics.historyTruncated = restored.historyTruncated;
      diagnostics.truncationMode = restored.truncationMode;
      diagnostics.notes.push('History snapshot reused from Tracevane in-process cache; transcript remap skipped for this request.');
      return {
        checkedAt: new Date().toISOString(),
        session: restored.session,
        messages: restored.messages,
        canonicalEntries: restored.canonicalEntries,
        canonicalSource: restored.canonicalSource,
        overlays: filterRedundantTerminalOverlays(
          restored.messages,
          enrichOverlaysWithToolCards(listRunOverlaysForSession(sessionKey), restored.toolCards),
        ),
        runtime: restored.session.runtime,
        diagnostics,
        observability: restored.observability,
        sourceSessionFile: restored.sourceSessionFile,
        sourceMtimeMs: restored.sourceMtimeMs,
      };
    }

    const transcriptMirrorSignature = sourceSelection.kind === 'local_transcript'
      ? buildTranscriptMirrorSignature(sourceSelection)
      : null;
    let reusedTranscriptMirror = false;
    if (sourceSelection.kind === 'local_transcript' && transcriptMirrorSignature && !inMemory) {
      const mirrorSnapshot = durableMirrorStore.readSession(sessionKey);
      if (
        mirrorSnapshot
        && mirrorSnapshot.source === 'local_transcript'
        && mirrorSnapshot.sourceSignature === transcriptMirrorSignature
        && mirrorSnapshot.observability
      ) {
        messages = mirrorSnapshot.messages.map((message) => cloneChatMessageItem(message)!);
        canonicalEntries = buildCanonicalEntriesFromMessages(mirrorSnapshot.messages);
        canonicalSource = 'local_transcript';
        const restoredObservability = cloneObservabilityState(mirrorSnapshot.observability);
        observability.lifecycle = restoredObservability.lifecycle;
        observability.usage = restoredObservability.usage;
        observability.toolCards = restoredObservability.toolCards;
        observability.timeline = restoredObservability.timeline;
        historyToolCards = restoredObservability.toolCards;
        reusedTranscriptMirror = true;
        diagnostics.notes.push(
          loadOptions.localOnly
            ? `Local bootstrap reused transcript-aligned Tracevane durable mirror (${mirrorSnapshot.backend}) without remapping local transcript history.`
            : `History reused transcript-aligned Tracevane durable mirror (${mirrorSnapshot.backend}) without remapping local transcript history.`,
        );
      }
    }

    if (sourceSelection.kind === 'local_transcript' && !reusedTranscriptMirror) {
      // Load entries from prior (reset backup) session files first, then current
      const priorRawEntries: Record<string, unknown>[] = [];
      for (const priorFile of sourceSelection.priorSessionFiles) {
        const entries = readTranscriptRawEntries(priorFile);
        priorRawEntries.push(...entries);
      }
      const currentRawEntries = readTranscriptEntriesIncremental(sourceSelection.sessionFile);
      const transcriptRawMessages = priorRawEntries.length > 0
        ? dedupeTranscriptReplayEntries([...priorRawEntries, ...currentRawEntries])
        : currentRawEntries;
      const mappingOptions: TranscriptMappingOptions = {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      };
      canonicalEntries = mapCanonicalEntriesFromParsedEntries(transcriptRawMessages, mappingOptions)
        .map(buildCanonicalEntryFromMapped);
      canonicalSource = 'local_transcript';
      const transcriptMessages = mapMessagesFromParsedEntries(transcriptRawMessages, mappingOptions);
      messages = mergeCanonicalHistoryWithLocalOptimism(inMemory?.messages, transcriptMessages);
      const derivedObservability = deriveObservabilityFromHistory(transcriptRawMessages, {
        sessionKey,
        collectToolArtifacts: mediaBridge.collectToolArtifacts,
        toolCardLimit: Number.POSITIVE_INFINITY,
      });
      historyToolCards = derivedObservability.toolCards;
      if (derivedObservability.usage) {
        observability.usage = derivedObservability.usage;
      }
      if (historyToolCards.length > 0) {
        const mergedToolCards = new Map<string, ChatToolCard>();
        for (const item of observability.toolCards) {
          mergedToolCards.set(item.toolCallId, item);
        }
        for (const item of historyToolCards.slice(0, 12)) {
          const current = mergedToolCards.get(item.toolCallId);
          mergedToolCards.set(item.toolCallId, current ? mergeToolCallItem(current, item) : item);
        }
        observability.toolCards = [...mergedToolCards.values()]
          .sort((left, right) => (right.updatedAt || right.startedAt || '').localeCompare(left.updatedAt || left.startedAt || ''))
          .slice(0, 12);
      }
      if (derivedObservability.timeline.length > 0) {
        const seenTimelineIds = new Set(observability.timeline.map((item) => item.id));
        observability.timeline = [
          ...derivedObservability.timeline.filter((item) => !seenTimelineIds.has(item.id)),
          ...observability.timeline,
        ].slice(-40);
      }
      diagnostics.notes.push('History is sourced from local transcript canonical authority and paged by the Tracevane BFF.');
    } else if (loadOptions.localOnly) {
      const mirrorSnapshot = durableMirrorStore.readSession(sessionKey);
      if (mirrorSnapshot) {
        messages = mirrorSnapshot.messages.map((message) => cloneChatMessageItem(message)!);
        canonicalEntries = buildCanonicalEntriesFromMessages(mirrorSnapshot.messages);
        canonicalSource = 'tracevane_mirror';
        if (mirrorSnapshot.observability) {
          const restoredObservability = cloneObservabilityState(mirrorSnapshot.observability);
          observability.lifecycle = restoredObservability.lifecycle;
          observability.usage = restoredObservability.usage;
          observability.toolCards = restoredObservability.toolCards;
          observability.timeline = restoredObservability.timeline;
          historyToolCards = restoredObservability.toolCards;
        }
        diagnostics.notes.push(`Local bootstrap used Tracevane durable mirror (${mirrorSnapshot.backend}) without a gateway roundtrip.`);
      } else if (inMemory) {
        messages = currentTracevaneHistory(inMemory);
        canonicalEntries = buildCanonicalEntriesFromMessages(messages.filter((message) => message.source !== 'inject'));
        canonicalSource = 'history_rpc';
        diagnostics.notes.push('Local bootstrap used in-memory Tracevane history without a gateway roundtrip.');
      } else {
        messages = [];
        canonicalEntries = [];
        canonicalSource = 'history_rpc';
        diagnostics.notes.push('Local bootstrap found no transcript or durable mirror, so it returned an empty history window.');
      }
    } else {
      try {
        const payload = await requestGateway<Record<string, unknown>>(options.config, 'chat.history', {
          sessionKey,
          limit: 200,
        });
        const gatewayRawMessages = Array.isArray(payload.messages)
          ? payload.messages.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') as Record<string, unknown>[]
          : [];
        const gatewayCanonicalEntries = gatewayRawMessages.length
          ? gatewayRawMessages.flatMap((item, index) => {
            const mapped = buildCanonicalEntryFromRaw(item, index, {
              sessionKey,
              collectMessageResources: mediaBridge.collectMessageResources,
              overrideMessage: overrideTranscriptMessage,
            });
            return mapped ? [mapped] : [];
          })
          : [];
        const gatewayMessages = gatewayCanonicalEntries.map((entry) => cloneChatMessageItem(entry.message)!);
        const mirrorSnapshot = durableMirrorStore.readSession(sessionKey);
        const derivedObservability = deriveObservabilityFromHistory(gatewayRawMessages, {
          sessionKey,
          collectToolArtifacts: mediaBridge.collectToolArtifacts,
          toolCardLimit: Number.POSITIVE_INFINITY,
        });
        historyToolCards = derivedObservability.toolCards;
        if (derivedObservability.usage) observability.usage = derivedObservability.usage;
        if (historyToolCards.length > 0) {
          const mergedToolCards = new Map<string, ChatToolCard>();
          for (const item of observability.toolCards) {
            mergedToolCards.set(item.toolCallId, item);
          }
          for (const item of historyToolCards.slice(0, 12)) {
            const current = mergedToolCards.get(item.toolCallId);
            mergedToolCards.set(item.toolCallId, current ? mergeToolCallItem(current, item) : item);
          }
          observability.toolCards = [...mergedToolCards.values()]
            .sort((left, right) => (right.updatedAt || right.startedAt || '').localeCompare(left.updatedAt || left.startedAt || ''))
            .slice(0, 12);
        }
        if (derivedObservability.timeline.length > 0) {
          const seenTimelineIds = new Set(observability.timeline.map((item) => item.id));
          observability.timeline = [
            ...derivedObservability.timeline.filter((item) => !seenTimelineIds.has(item.id)),
            ...observability.timeline,
          ].slice(-40);
        }
        if (
          mirrorSnapshot
          && (
            gatewayMessages.length < mirrorSnapshot.messages.length
            || buildCanonicalEntriesSignature(gatewayCanonicalEntries) === ''
          )
        ) {
          canonicalEntries = buildCanonicalEntriesFromMessages(mirrorSnapshot.messages);
          canonicalSource = 'tracevane_mirror';
          messages = mirrorSnapshot.messages.map((message) => cloneChatMessageItem(message)!);
          diagnostics.notes.push(`Gateway chat.history shrank behind Tracevane durable mirror (${mirrorSnapshot.backend}); keeping protected canonical history.`);
        } else if (
          inMemory
          && isGatewayHistoryBehindInMemory(inMemory, gatewayMessages)
        ) {
          messages = mergeCanonicalHistoryWithLocalOptimism(currentTracevaneHistory(inMemory), gatewayMessages);
          canonicalEntries = gatewayCanonicalEntries;
          canonicalSource = 'history_rpc';
          diagnostics.notes.push('Gateway chat.history is temporarily behind the Tracevane in-memory session state; preserving local confirmed messages until history catches up.');
        } else if (
          inMemory
          && isGatewayHistoryStaleAfterLocalReset(inMemory, gatewayMessages)
        ) {
          messages = currentTracevaneHistory(inMemory);
          canonicalEntries = buildCanonicalEntriesFromMessages(messages.filter((message) => message.source !== 'inject'));
          canonicalSource = 'history_rpc';
          diagnostics.notes.push('Gateway chat.history is behind the in-memory Tracevane session state after reset; returning in-memory fallback.');
        } else {
          messages = gatewayMessages;
          canonicalEntries = gatewayCanonicalEntries;
          canonicalSource = 'history_rpc';
          durableMirrorStore.replaceSnapshot({
            sessionKey,
            version: nextCanonicalVersion(sessionKey, 'history_rpc'),
            source: 'history_rpc',
            messages: gatewayMessages,
            baseMessageSeq: gatewayCanonicalEntries[gatewayCanonicalEntries.length - 1]?.messageSeq || gatewayMessages.length,
            savedAt: new Date().toISOString(),
          });
          diagnostics.notes.push(`History is sourced from Gateway chat.history and mirrored to Tracevane durable store (${durableMirrorStore.backend}).`);
        }
      } catch (error) {
        const mirrorSnapshot = durableMirrorStore.readSession(sessionKey);
        if (mirrorSnapshot) {
          messages = mirrorSnapshot.messages.map((message) => cloneChatMessageItem(message)!);
          canonicalEntries = buildCanonicalEntriesFromMessages(mirrorSnapshot.messages);
          canonicalSource = 'tracevane_mirror';
          diagnostics.notes.push(`Gateway chat.history unavailable; using Tracevane durable mirror (${mirrorSnapshot.backend}) (${error instanceof Error ? error.message : String(error)}).`);
        } else if (inMemory) {
          messages = currentTracevaneHistory(inMemory);
          canonicalEntries = buildCanonicalEntriesFromMessages(messages.filter((message) => message.source !== 'inject'));
          canonicalSource = 'history_rpc';
          diagnostics.notes.push(`Gateway chat.history unavailable; using Tracevane in-memory history fallback (${error instanceof Error ? error.message : String(error)}).`);
        } else {
          messages = [];
          canonicalEntries = [];
          canonicalSource = 'history_rpc';
          diagnostics.notes.push(`Gateway chat.history unavailable and no transcript file is present (${error instanceof Error ? error.message : String(error)}).`);
        }
      }
    }

    if (sourceSelection.kind !== 'local_transcript') {
      messages = supplementHistoryWithRunState(sessionKey, messages);
    }
    messages = normalizeMessageLedger(messages);
    const toolCardsForHistory = historyToolCards.length ? historyToolCards : observability.toolCards;
    messages = enrichMessagesWithToolCards(messages, toolCardsForHistory);
    const overlays = filterRedundantTerminalOverlays(
      messages,
      enrichOverlaysWithToolCards(listRunOverlaysForSession(sessionKey), toolCardsForHistory),
    );
    const nextSession = applyDerivedAutoLabelToSessionRow(inMemory?.row || session, messages);
    const autoLabelChanged = nextSession !== (inMemory?.row || session);
    session = nextSession;

    if (
      messages.length
      && (
        !inMemory
        || messages.length > inMemory.messages.length
        || autoLabelChanged
      )
    ) {
      setTracevaneSession({
        row: session,
        messages: messages.map((message) => cloneChatMessageItem(message)!),
        diagnosticsNotes: inMemory?.diagnosticsNotes || [],
        observability,
        pendingQueue: inMemory?.pendingQueue || [],
        controls: inMemory?.controls || createDefaultSessionControls(),
        materialized: inMemory?.materialized,
        resetPending: inMemory?.resetPending,
        clearedAt: inMemory?.clearedAt || null,
      });
    } else if (autoLabelChanged && inMemory) {
      inMemory.row = session;
      setTracevaneSession(inMemory);
    }

    if (autoLabelChanged && session.kind === 'tracevane_managed') {
      saveRegistryEntry(buildRegistryEntryFromRow(session));
    }
    diagnostics.historyTruncated = messages.some((message) => message.truncated || message.omitted);
    diagnostics.truncationMode = messages.some((message) => message.omitted)
      ? 'omitted_placeholder'
      : diagnostics.historyTruncated
        ? 'tail_marked'
        : 'none';

    if (sourceSelection.kind === 'local_transcript') {
      historySnapshotCache.set(sessionKey, {
        signature: historySnapshotCacheSignature,
        session: JSON.parse(JSON.stringify(session)) as ChatSessionRow,
        messages: messages.map((message) => cloneChatMessageItem(message)!),
        canonicalEntries: cloneCanonicalEntries(canonicalEntries),
        canonicalSource,
        observability: cloneObservabilityState(observability),
        toolCards: toolCardsForHistory.map((item) => cloneChatToolCard(item)!),
        sourceSessionFile,
        sourceMtimeMs,
        historyTruncated: diagnostics.historyTruncated,
        truncationMode: diagnostics.truncationMode,
      });
      if (!reusedTranscriptMirror && transcriptMirrorSignature) {
        durableMirrorStore.replaceSnapshot({
          sessionKey,
          version: nextCanonicalVersion(sessionKey, 'local_transcript'),
          source: 'local_transcript',
          messages,
          baseMessageSeq: canonicalEntries[canonicalEntries.length - 1]?.messageSeq || messages.length,
          savedAt: new Date().toISOString(),
          sourceSignature: transcriptMirrorSignature,
          sourceSessionFile,
          sourceMtimeMs,
          observability,
        });
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      session,
      messages,
      canonicalEntries,
      canonicalSource,
      overlays,
      runtime: session.runtime,
      diagnostics,
      observability,
      sourceSessionFile,
      sourceMtimeMs,
    };
  }

  async function loadLocalTranscriptBootstrapHistoryWindow(
    sessionKey: string,
    params: {
      limit?: number;
      gatewayConnected: boolean;
    },
  ): Promise<ChatHistoryPayload | null> {
    const sourceSelection = selectCanonicalSource(sessionKey);
    if (
      sourceSelection.kind !== 'local_transcript'
      || sourceSelection.priorSessionFiles.length > 0
    ) {
      return null;
    }

    const limit = normalizeHistoryLimit(params.limit, 12);
    const rawTail = readTranscriptRawTailEntries(
      sourceSelection.sessionFile,
      Math.max(limit * 8, limit + 40),
    );
    const mappingOptions: TranscriptMappingOptions = {
      sessionKey,
      collectMessageResources: mediaBridge.collectMessageResources,
      overrideMessage: overrideTranscriptMessage,
    };
    const tailMessages = normalizeMessageLedger(mapMessagesFromParsedEntries(rawTail.entries, mappingOptions));
    const derivedObservability = deriveObservabilityFromHistory(rawTail.entries, {
      sessionKey,
      collectToolArtifacts: mediaBridge.collectToolArtifacts,
      toolCardLimit: 12,
    });
    const messages = enrichMessagesWithToolCards(tailMessages.slice(-limit), derivedObservability.toolCards);
    const session = await requireSession(sessionKey, params.gatewayConnected);
    const diagnostics = await buildHealth([], params.gatewayConnected);
    diagnostics.notes.push('Local bootstrap read only the transcript tail window; full transcript remap is deferred until explicit history/search access.');

    const hasMoreBefore = Boolean(rawTail.hasMoreBefore || tailMessages.length > messages.length);
    const firstMessage = messages[0] || null;
    const pageInfo: ChatHistoryPayload['pageInfo'] = {
      hasMoreBefore,
      beforeCursor: firstMessage && hasMoreBefore
        ? encodeHistoryCursor({
          source: 'history_window',
          anchorIndex: 0,
          anchorMessageId: firstMessage.id,
          anchorCreatedAt: firstMessage.createdAt,
          day: null,
          query: null,
          roleFilter: null,
          contentFilter: null,
        })
        : null,
      hasMoreAfter: false,
      afterCursor: null,
    };
    const overlays = buildPageOverlaysForMessageWindow(
      filterRedundantTerminalOverlays(
        messages,
        enrichOverlaysWithToolCards(listRunOverlaysForSession(sessionKey), derivedObservability.toolCards),
      ),
      messages,
      messages,
      pageInfo,
    );
    const runtimeSummary = buildChatSessionRuntimeSummary(session.runtime);
    const diagnosticsSummary = buildChatDiagnosticsSummary(diagnostics);
    return {
      checkedAt: new Date().toISOString(),
      session,
      messages,
      overlays,
      runtime: {
        ...session.runtime,
        state: runtimeSummary.state,
        activeRunId: runtimeSummary.activeRunId,
        gatewayConnected: runtimeSummary.gatewayConnected,
        sessionWritable: runtimeSummary.sessionWritable,
        lastEventAt: runtimeSummary.lastEventAt,
        lastAckAt: runtimeSummary.lastAckAt,
        lastErrorCode: runtimeSummary.lastErrorCode,
      },
      diagnostics: {
        ...diagnostics,
        gatewayReachable: diagnosticsSummary.gatewayReachable,
        historyTruncated: diagnosticsSummary.historyTruncated,
        truncationMode: diagnosticsSummary.truncationMode,
      },
      observability: compactObservabilityState(derivedObservability, {
        toolCardLimit: 6,
        timelineLimit: 8,
        toolDetailLimit: 180,
        timelineDetailLimit: 220,
      }),
      pageInfo,
      day: null,
    };
  }

  function ensureLocalTranscriptHistoryIndexFromMirror(
    sessionKey: string,
    params: {
      sourceSessionFile: string;
      sourceMtimeMs: number | null;
    },
    existingSnapshot?: ReturnType<typeof historyIndexStore.readSnapshot> | null,
  ) {
    if (existingSnapshot) {
      return existingSnapshot;
    }
    const mirrorItems = durableMirrorStore.listSearchStubs(sessionKey);
    if (!mirrorItems.length) {
      return null;
    }
    return historyIndexStore.ensureIndexFromItems({
      sessionKey,
      items: mirrorItems.map((item) => ({
        id: item.id,
        role: item.role,
        createdAt: item.createdAt,
        previewText: item.previewText,
        snippetText: item.previewText,
        runId: item.runId,
        messageIndex: item.messageIndex,
        hasText: item.hasText,
        hasResources: item.hasResources,
        hasCode: item.hasCode,
      })),
      totalMessages: mirrorItems.length,
      sourceSessionFile: params.sourceSessionFile,
      sourceMtimeMs: params.sourceMtimeMs,
    });
  }

  async function loadLocalTranscriptHistoryWindowFast(
    sessionKey: string,
    options: {
      before?: string | null;
      after?: string | null;
      anchor?: string | null;
      limit?: number;
      day?: string | null;
    },
    gatewayConnected: boolean,
  ): Promise<ChatHistoryPayload | null> {
    const sourceSelection = selectCanonicalSource(sessionKey);
    if (
      sourceSelection.kind !== 'local_transcript'
      || sourceSelection.priorSessionFiles.length > 0
    ) {
      return null;
    }
    const indexSnapshot = historyIndexStore.readSnapshot({
      sessionKey,
      sourceSessionFile: sourceSelection.sessionFile,
      sourceMtimeMs: sourceSelection.sourceMtimeMs,
    });
    const mirrorMeta = durableMirrorStore.readSessionMeta(sessionKey);
    const mirrorAligned = Boolean(
      mirrorMeta
      && mirrorMeta.sourceSessionFile === sourceSelection.sessionFile
      && (mirrorMeta.sourceMtimeMs ?? null) === (sourceSelection.sourceMtimeMs ?? null),
    );

    let allMessages: ChatMessageItem[] = [];
    let pageMessages: ChatMessageItem[];
    let pageInfo: ChatHistoryPayload['pageInfo'];
    let pageDay: string | null;
    let transcriptContent: string | null = null;
    if (mirrorAligned) {
      const day = normalizeString(options.day) || null;
      const beforeCursor = decodeHistoryCursor(options.before);
      const afterCursor = decodeHistoryCursor(options.after);
      const normalizedBefore = beforeCursor?.source === 'history_window' && (beforeCursor.day || null) === day
        ? beforeCursor
        : null;
      const normalizedAfter = afterCursor?.source === 'history_window' && (afterCursor.day || null) === day
        ? afterCursor
        : null;
      const window = durableMirrorStore.readMessageWindow(sessionKey, {
        before: normalizedBefore
          ? {
            anchorIndex: normalizedBefore.anchorIndex,
            anchorMessageId: normalizedBefore.anchorMessageId,
          }
          : null,
        after: normalizedAfter
          ? {
            anchorIndex: normalizedAfter.anchorIndex,
            anchorMessageId: normalizedAfter.anchorMessageId,
          }
          : null,
        anchor: normalizeString(options.anchor) || null,
        limit: options.limit,
        day,
      });
      if (!window) {
        return null;
      }
      pageMessages = window.messages;
      pageDay = window.day;
      allMessages = indexSnapshot
        ? indexSnapshot.items.map((item) => buildIndexStubMessage(item))
        : pageMessages;
      pageInfo = {
        hasMoreBefore: window.hasMoreBefore,
        beforeCursor: window.beforeBoundary
          ? encodeHistoryCursor({
            source: 'history_window',
            anchorIndex: window.beforeBoundary.anchorIndex,
            anchorMessageId: window.beforeBoundary.anchorMessageId,
            anchorCreatedAt: window.beforeBoundary.anchorCreatedAt,
            day: pageDay,
            query: null,
            roleFilter: null,
            contentFilter: null,
          })
          : null,
        hasMoreAfter: window.hasMoreAfter,
        afterCursor: window.afterBoundary
          ? encodeHistoryCursor({
            source: 'history_window',
            anchorIndex: window.afterBoundary.anchorIndex,
            anchorMessageId: window.afterBoundary.anchorMessageId,
            anchorCreatedAt: window.afterBoundary.anchorCreatedAt,
            day: pageDay,
            query: null,
            roleFilter: null,
            contentFilter: null,
          })
          : null,
      };
    } else {
      let effectiveIndex = indexSnapshot;
      if (!effectiveIndex) {
        try {
          transcriptContent = readTranscriptContentCached(sourceSelection.sessionFile, sourceSelection.sourceMtimeMs);
        } catch {
          return null;
        }
        const seedItems = scanTranscriptIndexSeedItemsFastFromContent(transcriptContent);
        if (!seedItems.length) {
          return null;
        }
        effectiveIndex = historyIndexStore.ensureIndexFromItems({
          sessionKey,
          items: seedItems,
          totalMessages: seedItems.length,
          sourceSessionFile: sourceSelection.sessionFile,
          sourceMtimeMs: sourceSelection.sourceMtimeMs,
        });
      }
      if (!effectiveIndex) {
        return null;
      }
      allMessages = effectiveIndex.items.map((item) => buildIndexStubMessage(item));
      const page = paginateMessageList(allMessages, {
        before: options.before,
        after: options.after,
        anchor: options.anchor,
        day: options.day,
        limit: options.limit,
        source: 'history_window',
      });
      const pageMessageIds = page.messages.map((message) => message.id);
      if (transcriptContent == null) {
        try {
          transcriptContent = readTranscriptContentCached(sourceSelection.sessionFile, sourceSelection.sourceMtimeMs);
        } catch {
          return null;
        }
      }
      const fetchedMessages = mapTranscriptMessagesByIdsFastFromContent(
        transcriptContent,
        sessionKey,
        pageMessageIds,
      );
      if (fetchedMessages.length !== pageMessageIds.length) {
        return null;
      }
      const byId = new Map(fetchedMessages.map((message) => [message.id, message]));
      pageMessages = pageMessageIds
        .map((messageId) => byId.get(messageId))
        .filter((message): message is ChatMessageItem => Boolean(message));
      pageInfo = page.pageInfo;
      pageDay = page.day;
    }
    const session = await requireSession(sessionKey, gatewayConnected);
    const diagnostics = await buildHealth([], gatewayConnected);
    diagnostics.notes.push(mirrorAligned
      ? indexSnapshot
        ? 'History window reused sqlite durable mirror page queries with existing persisted history index metadata.'
        : 'History window reused sqlite durable mirror page queries without rebuilding the persisted history index or remapping the transcript.'
      : 'History window rebuilt a persisted sqlite/json history index from a lightweight transcript scan and mapped only the requested page messages.');
    const runtimeSummary = buildChatSessionRuntimeSummary(session.runtime);
    const diagnosticsSummary = buildChatDiagnosticsSummary(diagnostics);
    const allOverlays = filterRedundantTerminalOverlays(
      pageMessages,
      enrichOverlaysWithToolCards(
        listRunOverlaysForSession(sessionKey),
        mirrorMeta?.observability?.toolCards || [],
      ),
    );

    return {
      checkedAt: new Date().toISOString(),
      session,
      messages: pageMessages,
      overlays: buildPageOverlaysForMessageWindow(allOverlays, allMessages, pageMessages, pageInfo),
      runtime: {
        ...session.runtime,
        state: runtimeSummary.state,
        activeRunId: runtimeSummary.activeRunId,
        gatewayConnected: runtimeSummary.gatewayConnected,
        sessionWritable: runtimeSummary.sessionWritable,
        lastEventAt: runtimeSummary.lastEventAt,
        lastAckAt: runtimeSummary.lastAckAt,
        lastErrorCode: runtimeSummary.lastErrorCode,
      },
      diagnostics: {
        ...diagnostics,
        gatewayReachable: diagnosticsSummary.gatewayReachable,
        historyTruncated: diagnosticsSummary.historyTruncated,
        truncationMode: diagnosticsSummary.truncationMode,
      },
      observability: cloneObservabilityState(
        (mirrorAligned ? mirrorMeta?.observability : getTracevaneSession(sessionKey)?.observability)
        || createEmptyObservabilityState(),
      ),
      pageInfo,
      day: pageDay,
    };
  }

  async function searchLocalTranscriptHistoryFast(
    sessionKey: string,
    options: {
      query: string;
      role?: ChatHistorySearchRoleFilter | null;
      content?: ChatHistorySearchContentFilter | null;
      day?: string | null;
      before?: string | null;
      after?: string | null;
      limit?: number;
    },
    gatewayConnected: boolean,
  ): Promise<ChatHistorySearchPayload | null> {
    const sourceSelection = selectCanonicalSource(sessionKey);
    if (
      sourceSelection.kind !== 'local_transcript'
      || sourceSelection.priorSessionFiles.length > 0
      || historySnapshotCache.has(sessionKey)
    ) {
      return null;
    }
    const query = normalizeString(options.query);
    const roleFilter = normalizeHistorySearchRoleFilter(options.role);
    const contentFilter = normalizeHistorySearchContentFilter(options.content);
    const day = normalizeString(options.day) || null;
    const indexSnapshot = historyIndexStore.readSnapshot({
      sessionKey,
      sourceSessionFile: sourceSelection.sessionFile,
      sourceMtimeMs: sourceSelection.sourceMtimeMs,
    });
    const mirrorMeta = durableMirrorStore.readSessionMeta(sessionKey);
    if (
      mirrorMeta
      && mirrorMeta.sourceSessionFile === sourceSelection.sessionFile
      && (mirrorMeta.sourceMtimeMs ?? null) === (sourceSelection.sourceMtimeMs ?? null)
    ) {
      const effectiveIndex = indexSnapshot
        ? ensureLocalTranscriptHistoryIndexFromMirror(
          sessionKey,
          {
            sourceSessionFile: sourceSelection.sessionFile,
            sourceMtimeMs: sourceSelection.sourceMtimeMs,
          },
          indexSnapshot,
        )
        : null;
      const searchCursorMatchesContext = (cursor: ChatHistoryCursor | null): boolean => {
        if (!cursor) return false;
        return cursor.source === 'history_search'
          && (cursor.day || null) === day
          && (cursor.query || null) === query
          && (cursor.roleFilter || null) === roleFilter
          && (cursor.contentFilter || null) === contentFilter;
      };
      const decodedBeforeCursor = decodeHistoryCursor(options.before);
      const decodedAfterCursor = decodeHistoryCursor(options.after);
      const searchWindow = indexSnapshot
        ? null
        : durableMirrorStore.readSearchMessageWindow(sessionKey, {
          query,
          day,
          roleFilter,
          contentFilter,
          before: searchCursorMatchesContext(decodedBeforeCursor)
            ? {
              anchorIndex: decodedBeforeCursor!.anchorIndex,
              anchorMessageId: decodedBeforeCursor!.anchorMessageId,
            }
            : null,
          after: searchCursorMatchesContext(decodedAfterCursor)
            ? {
              anchorIndex: decodedAfterCursor!.anchorIndex,
              anchorMessageId: decodedAfterCursor!.anchorMessageId,
            }
            : null,
          limit: options.limit,
        });
      const ftsMatchedStubs = indexSnapshot || searchWindow
        ? null
        : durableMirrorStore.searchMessageStubs(sessionKey, {
          query,
          day,
          roleFilter,
          contentFilter,
        });
      const matchedItems = indexSnapshot
        ? historyIndexStore
          .searchPositions(effectiveIndex!, query, {
            roleFilter,
            contentFilter,
          })
          .map((position) => effectiveIndex!.items[position]!)
          .filter(Boolean)
        : searchWindow
          ? searchWindow.stubs
            .map((item) => ({
              id: item.id,
              role: item.role,
              createdAt: item.createdAt,
              dayKey: item.createdAt ? item.createdAt.slice(0, 10) : null,
              previewText: item.previewText,
              snippetText: item.previewText,
              runId: item.runId,
            }))
            .filter(Boolean)
          : ftsMatchedStubs
            ? ftsMatchedStubs
              .map((item) => ({
                id: item.id,
                role: item.role,
                createdAt: item.createdAt,
                dayKey: item.createdAt ? item.createdAt.slice(0, 10) : null,
                previewText: item.previewText,
                snippetText: item.previewText,
                runId: item.runId,
              }))
              .filter(Boolean)
            : [];
      const page = searchWindow
        ? null
        : paginateMessageList(
          matchedItems.map((item) => buildIndexStubMessage(item)),
          {
            before: options.before,
            after: options.after,
            day,
            limit: options.limit,
            source: 'history_search',
            query,
            roleFilter,
            contentFilter,
          },
        );
      const pageInfo = searchWindow
        ? {
          hasMoreBefore: searchWindow.hasMoreBefore,
          beforeCursor: searchWindow.beforeBoundary
            ? encodeHistoryCursor({
              source: 'history_search',
              anchorIndex: searchWindow.beforeBoundary.anchorIndex,
              anchorMessageId: searchWindow.beforeBoundary.anchorMessageId,
              anchorCreatedAt: searchWindow.beforeBoundary.anchorCreatedAt,
              day: searchWindow.day,
              query,
              roleFilter,
              contentFilter,
            })
            : null,
          hasMoreAfter: searchWindow.hasMoreAfter,
          afterCursor: searchWindow.afterBoundary
            ? encodeHistoryCursor({
              source: 'history_search',
              anchorIndex: searchWindow.afterBoundary.anchorIndex,
              anchorMessageId: searchWindow.afterBoundary.anchorMessageId,
              anchorCreatedAt: searchWindow.afterBoundary.anchorCreatedAt,
              day: searchWindow.day,
              query,
              roleFilter,
              contentFilter,
            })
            : null,
        }
        : page!.pageInfo;
      const pageDay = searchWindow ? searchWindow.day : page!.day;
      const pageMessageIds = searchWindow
        ? searchWindow.stubs.map((message) => message.id)
        : page!.messages.map((message) => message.id);
      const fetchedMessages = durableMirrorStore.readMessagesByIds(sessionKey, pageMessageIds);
      if (fetchedMessages.length === pageMessageIds.length) {
        const fetchedById = new Map(fetchedMessages.map((message) => [message.id, message]));
        const pageMessages = pageMessageIds
          .map((messageId) => fetchedById.get(messageId))
          .filter((message): message is ChatMessageItem => Boolean(message));
        const itemByMessageId = new Map((effectiveIndex ? effectiveIndex.items : matchedItems).map((item) => [item.id, item]));
        const matches: ChatHistorySearchMatch[] = pageMessages.map((message) => {
          const item = itemByMessageId.get(message.id);
          return {
            messageId: message.id,
            role: message.role,
            createdAt: message.createdAt || item?.createdAt || null,
            day: item?.dayKey || (normalizeDate(message.createdAt) || '').slice(0, 10) || null,
            snippet: item?.snippetText || item?.previewText || message.text.slice(0, 280),
          };
        });
        const session = await requireSession(sessionKey, gatewayConnected);
        const diagnostics = await buildHealth([], gatewayConnected);
        diagnostics.notes.push(indexSnapshot
          ? 'History search reused the persisted sqlite/json history index and transcript-aligned durable mirror.'
          : searchWindow
            ? 'History search reused a paged sqlite FTS durable mirror window without rebuilding the persisted history index or remapping the transcript.'
            : ftsMatchedStubs
            ? 'History search reused sqlite FTS candidates from the durable mirror without rebuilding the persisted history index or remapping the transcript.'
            : effectiveIndex
              ? 'History search rebuilt a persisted sqlite/json history index from durable mirror row metadata without remapping the transcript.'
              : 'History search reused sqlite/json durable mirror row metadata without remapping the transcript.');
        const runtimeSummary = buildChatSessionRuntimeSummary(session.runtime);
        const diagnosticsSummary = buildChatDiagnosticsSummary(diagnostics);
        const searchSummary = buildHistorySearchSummary({
          query,
          day: pageDay,
          roleFilter,
          contentFilter,
          matches,
        });
        return {
          checkedAt: new Date().toISOString(),
          session,
          query: searchSummary.query,
          roleFilter,
          contentFilter,
          day: searchSummary.day,
          matches,
          messages: pageMessages,
          overlays: buildPageOverlaysForMessageWindow(
            filterRedundantTerminalOverlays(pageMessages, listRunOverlaysForSession(sessionKey)),
            pageMessages,
            pageMessages,
            pageInfo,
          ),
          runtime: {
            ...session.runtime,
            state: runtimeSummary.state,
            activeRunId: runtimeSummary.activeRunId,
            gatewayConnected: runtimeSummary.gatewayConnected,
            sessionWritable: runtimeSummary.sessionWritable,
            lastEventAt: runtimeSummary.lastEventAt,
            lastAckAt: runtimeSummary.lastAckAt,
            lastErrorCode: runtimeSummary.lastErrorCode,
          },
          diagnostics: {
            ...diagnostics,
            gatewayReachable: diagnosticsSummary.gatewayReachable,
            historyTruncated: diagnosticsSummary.historyTruncated,
            truncationMode: diagnosticsSummary.truncationMode,
            notes: [
              ...diagnostics.notes,
              `History search summary: ${searchSummary.totalMatches} matches across ${searchSummary.days.length} day(s).`,
            ],
          },
          pageInfo,
        };
      }
    }

    let content: string;
    try {
      content = readTranscriptContentCached(sourceSelection.sessionFile, sourceSelection.sourceMtimeMs);
    } catch {
      return null;
    }
    const seedItems = scanTranscriptIndexSeedItemsFastFromContent(content);
    if (seedItems?.length) {
      const index = historyIndexStore.ensureIndexFromItems({
        sessionKey,
        items: seedItems,
        totalMessages: seedItems.length,
        sourceSessionFile: sourceSelection.sessionFile,
        sourceMtimeMs: sourceSelection.sourceMtimeMs,
      });
      const positions = historyIndexStore.searchPositions(index, query, {
        roleFilter,
        contentFilter,
      });
      const matchedItems = positions.map((position) => index.items[position]!).filter(Boolean);
      const page = paginateMessageList(
        matchedItems.map((item) => buildIndexStubMessage(item)),
        {
          before: options.before,
          after: options.after,
          day,
          limit: options.limit,
          source: 'history_search',
          query,
          roleFilter,
          contentFilter,
        },
      );
      const targetIds = new Set(page.messages.map((message) => message.id));
      const pageMessagesById = new Map<string, ChatMessageItem>();
      let visibleIndex = 0;
      for (const raw of dedupeTranscriptReplayEntries(parseTranscriptRawEntriesFromContent(content))) {
        if (!raw || typeof raw !== 'object' || shouldSkipTranscriptLine(raw)) {
          continue;
        }
        const record = extractTranscriptRecord(raw);
        const messageId = normalizeString(raw.id || record.id, `history-${visibleIndex}`);
        if (targetIds.has(messageId)) {
          const message = mapTranscriptMessage(raw, visibleIndex, {
            sessionKey,
            collectMessageResources: mediaBridge.collectMessageResources,
            overrideMessage: overrideTranscriptMessage,
          });
          if (message) {
            pageMessagesById.set(messageId, message);
          }
        }
        visibleIndex += 1;
      }

      const pageMessages = page.messages
        .map((message) => pageMessagesById.get(message.id))
        .filter((message): message is ChatMessageItem => Boolean(message));
      if (pageMessages.length === page.messages.length) {
        const itemByMessageId = new Map(index.items.map((item) => [item.id, item]));
        const matches: ChatHistorySearchMatch[] = pageMessages.map((message) => {
          const item = itemByMessageId.get(message.id);
          return {
            messageId: message.id,
            role: message.role,
            createdAt: message.createdAt || item?.createdAt || null,
            day: item?.dayKey || (normalizeDate(message.createdAt) || '').slice(0, 10) || null,
            snippet: item?.snippetText || item?.previewText || message.text.slice(0, 280),
          };
        });
        const session = await requireSession(sessionKey, gatewayConnected);
        const diagnostics = await buildHealth([], gatewayConnected);
        diagnostics.notes.push('History search rebuilt a persisted sqlite/json history index from a lightweight transcript scan and mapped only the requested page messages.');
        const runtimeSummary = buildChatSessionRuntimeSummary(session.runtime);
        const diagnosticsSummary = buildChatDiagnosticsSummary(diagnostics);
        const searchSummary = buildHistorySearchSummary({
          query,
          day: page.day,
          roleFilter,
          contentFilter,
          matches,
        });
        const enrichedPageMessages = enrichMessagesWithToolCards(pageMessages, []);
        const pageOverlays = buildPageOverlaysForMessageWindow(
          filterRedundantTerminalOverlays(
            enrichedPageMessages,
            listRunOverlaysForSession(sessionKey),
          ),
          enrichedPageMessages,
          enrichedPageMessages,
          page.pageInfo,
        );
        return {
          checkedAt: new Date().toISOString(),
          session,
          query: searchSummary.query,
          roleFilter,
          contentFilter,
          day: searchSummary.day,
          matches,
          messages: enrichedPageMessages,
          overlays: pageOverlays,
          runtime: {
            ...session.runtime,
            state: runtimeSummary.state,
            activeRunId: runtimeSummary.activeRunId,
            gatewayConnected: runtimeSummary.gatewayConnected,
            sessionWritable: runtimeSummary.sessionWritable,
            lastEventAt: runtimeSummary.lastEventAt,
            lastAckAt: runtimeSummary.lastAckAt,
            lastErrorCode: runtimeSummary.lastErrorCode,
          },
          diagnostics: {
            ...diagnostics,
            gatewayReachable: diagnosticsSummary.gatewayReachable,
            historyTruncated: diagnosticsSummary.historyTruncated,
            truncationMode: diagnosticsSummary.truncationMode,
            notes: [
              ...diagnostics.notes,
              `History search summary: ${searchSummary.totalMatches} matches across ${searchSummary.days.length} day(s).`,
            ],
          },
          pageInfo: page.pageInfo,
        };
      }
    }
    const rawMatches: Array<{
      raw: Record<string, unknown>;
      message: ChatMessageItem;
      snippet: string;
      day: string | null;
    }> = [];
    let rawIndex = 0;
    for (const raw of dedupeTranscriptReplayEntries(parseTranscriptRawEntriesFromContent(content))) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const textValue = extractMessageText(raw);
      if (!transcriptRawMatchesSearchFilters({ raw, textValue, query, roleFilter, contentFilter, day })) {
        rawIndex += 1;
        continue;
      }
      const message = mapTranscriptMessage(raw, rawIndex, {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      });
      rawIndex += 1;
      if (!message) {
        continue;
      }
      rawMatches.push({
        raw,
        message,
        snippet: clipPreview(textValue, 280),
        day: extractTranscriptLineTimestamp(raw)?.slice(0, 10) || null,
      });
    }

    const matchedMessages = rawMatches.map((item) => item.message);
    const page = paginateMessageList(matchedMessages, {
      before: options.before,
      after: options.after,
      day,
      limit: options.limit,
      source: 'history_search',
      query,
      roleFilter,
      contentFilter,
    });
    const rawByMessageId = new Map(rawMatches.map((item) => [item.message.id, item]));
    const matches: ChatHistorySearchMatch[] = page.messages.map((message) => {
      const match = rawByMessageId.get(message.id);
      return {
        messageId: message.id,
        role: message.role,
        createdAt: message.createdAt || extractTranscriptLineTimestamp(match?.raw || {}) || null,
        day: match?.day || (normalizeDate(message.createdAt) || '').slice(0, 10) || null,
        snippet: match?.snippet || message.text.slice(0, 280),
      };
    });
    const session = await requireSession(sessionKey, gatewayConnected);
    const diagnostics = await buildHealth([], gatewayConnected);
    diagnostics.notes.push('History search used a lightweight transcript line scan; full transcript remap/index is deferred.');
    const runtimeSummary = buildChatSessionRuntimeSummary(session.runtime);
    const diagnosticsSummary = buildChatDiagnosticsSummary(diagnostics);
    const searchSummary = buildHistorySearchSummary({
      query,
      day: page.day,
      roleFilter,
      contentFilter,
      matches,
    });
    const pageMessages = enrichMessagesWithToolCards(page.messages, []);
    const pageOverlays = buildPageOverlaysForMessageWindow(
      filterRedundantTerminalOverlays(
        pageMessages,
        listRunOverlaysForSession(sessionKey),
      ),
      pageMessages,
      pageMessages,
      page.pageInfo,
    );
    return {
      checkedAt: new Date().toISOString(),
      session,
      query: searchSummary.query,
      roleFilter,
      contentFilter,
      day: searchSummary.day,
      matches,
      messages: pageMessages,
      overlays: pageOverlays,
      runtime: {
        ...session.runtime,
        state: runtimeSummary.state,
        activeRunId: runtimeSummary.activeRunId,
        gatewayConnected: runtimeSummary.gatewayConnected,
        sessionWritable: runtimeSummary.sessionWritable,
        lastEventAt: runtimeSummary.lastEventAt,
        lastAckAt: runtimeSummary.lastAckAt,
        lastErrorCode: runtimeSummary.lastErrorCode,
      },
      diagnostics: {
        ...diagnostics,
        gatewayReachable: diagnosticsSummary.gatewayReachable,
        historyTruncated: diagnosticsSummary.historyTruncated,
        truncationMode: diagnosticsSummary.truncationMode,
        notes: [
          ...diagnostics.notes,
          `History search summary: ${searchSummary.totalMatches} matches across ${searchSummary.days.length} day(s).`,
        ],
      },
      pageInfo: page.pageInfo,
    };
  }

  function applyCanonicalStateUpdate(params: {
    sessionKey: string;
    source: ChatCanonicalState['source'];
    entries: ChatCanonicalEntry[];
    overlays: ChatRunOverlay[];
    forceSnapshot?: boolean;
    allowAppend?: boolean;
  }): void {
    const current = canonicalStates.get(params.sessionKey);
    if (
      !params.forceSnapshot
      && params.allowAppend
      && current
      && current.source === params.source
      && current.entries.length < params.entries.length
      && entriesShareStablePrefix(current.entries, params.entries)
    ) {
      emitCanonicalMessages(
        params.sessionKey,
        params.source === 'local_transcript' || params.source === 'history_sse'
          ? params.source
          : 'history_sse',
        params.entries.slice(current.entries.length),
        current.version,
      );
      return;
    }

    const nextVersion = (
      current
      && !params.forceSnapshot
      && current.source === params.source
      && buildCanonicalEntriesSignature(current.entries) === buildCanonicalEntriesSignature(params.entries)
    )
      ? current.version
      : nextCanonicalVersion(params.sessionKey, params.source);

    emitCanonicalSnapshot(params.sessionKey, params.source, params.entries, nextVersion, params.overlays);
  }

  async function buildCanonicalSnapshotEvent(
    sessionKey: string,
  ): Promise<Extract<ChatStreamEvent, { kind: 'canonical.snapshot' }> | null> {
    const current = canonicalStates.get(sessionKey);
    let version = current?.version || null;
    let source = current?.source || null;
    let pageInfo = current?.pageInfo ? cloneHistoryPageInfo(current.pageInfo) : null;
    let entries = current?.entries.map((entry) => ({
      ...entry,
      message: cloneChatMessageItem(entry.message)!,
    })) || [];
    let overlays = listRunOverlaysForSession(sessionKey);
    let runtime = resolveCanonicalRuntime(sessionKey);

    if (!current) {
      if (selectCanonicalSource(sessionKey).kind === 'official_canonical_stream') {
        try {
          await resyncOfficialCanonicalHistory(sessionKey, 'bootstrap');
        } catch {}
        const refreshed = canonicalStates.get(sessionKey);
        if (refreshed) {
          version = refreshed.version;
          source = refreshed.source;
          entries = refreshed.entries.map((entry) => ({
            ...entry,
            message: cloneChatMessageItem(entry.message)!,
          }));
          pageInfo = refreshed.pageInfo ? cloneHistoryPageInfo(refreshed.pageInfo) : null;
        }
      }
      if (!version || !source) {
        const sourceSelection = selectCanonicalSource(sessionKey);
        if (sourceSelection.kind === 'local_transcript') {
          const localTail = readLocalTranscriptCanonicalTailWindow(sessionKey, sourceSelection);
          entries = localTail.entries;
          pageInfo = localTail.pageInfo;
          version = nextCanonicalVersion(sessionKey, 'local_transcript');
          source = 'local_transcript';
          try {
            runtime = (await requireSession(sessionKey)).runtime;
          } catch {}
          canonicalStates.set(sessionKey, {
            sessionKey,
            version,
            source,
            entries: entries.map((entry) => ({
              ...entry,
              message: cloneChatMessageItem(entry.message)!,
            })),
            pageInfo: cloneHistoryPageInfo(pageInfo),
          });
        } else {
          const snapshot = await loadHistorySnapshot(sessionKey);
          entries = snapshot.canonicalEntries.length
            ? snapshot.canonicalEntries
            : buildCanonicalEntriesFromMessages(snapshot.messages.filter((message) => message.source !== 'inject'));
          version = nextCanonicalVersion(sessionKey, snapshot.canonicalSource);
          source = snapshot.canonicalSource;
          overlays = snapshot.overlays;
          runtime = snapshot.runtime;
          pageInfo = null;
          const snapshotWindow = buildCanonicalSnapshotWindow(entries, overlays);
          canonicalStates.set(sessionKey, {
            sessionKey,
            version,
            source,
            entries: entries.map((entry) => ({
              ...entry,
              message: cloneChatMessageItem(entry.message)!,
            })),
            pageInfo: snapshotWindow.pageInfo,
          });
          pageInfo = snapshotWindow.pageInfo;
        }
      }
    }
    if (!shouldEmitCanonicalProtocol()) {
      return null;
    }
    const snapshotWindow = buildCanonicalSnapshotWindow(entries, overlays, pageInfo);
    let snapshotMessages = snapshotWindow.messages;
    let snapshotOverlays = snapshotWindow.overlays;
    const snapshotPageInfo = snapshotWindow.pageInfo;
    // Collect enrichment tool cards from bounded live sources.
    // The canonical cache may hold stale 'running' statuses from streaming events
    // that were cached before tool results arrived (e.g. page refresh mid-stream).
    // Avoid reparsing the full transcript here; local transcript snapshots are already
    // built from the tail window and full history remains behind explicit pagination.
    const enrichmentMap = new Map<string, ChatToolCard>();
    // Source 1: Overlay tool calls from run projections/shadows.
    for (const overlay of snapshotOverlays) {
      for (const tc of overlay.toolCalls) {
        if (tc.toolCallId) {
          const existing = enrichmentMap.get(tc.toolCallId);
          enrichmentMap.set(tc.toolCallId, existing ? mergeToolCallItem(existing, tc) : tc);
        }
      }
    }
    // Source 2: Runtime in-memory tool cards (may have richer artifacts data).
    const sessionData = getTracevaneSession(sessionKey);
    const snapshotToolCards = sessionData?.observability?.toolCards;
    if (snapshotToolCards?.length) {
      for (const tc of snapshotToolCards) {
        if (tc.toolCallId) {
          const existing = enrichmentMap.get(tc.toolCallId);
          enrichmentMap.set(tc.toolCallId, existing ? mergeToolCallItem(existing, tc) : tc);
        }
      }
    }
    const allSnapshotToolCards = [...enrichmentMap.values()];
    if (allSnapshotToolCards.length) {
      snapshotMessages = enrichMessagesWithToolCards(snapshotMessages, allSnapshotToolCards);
      snapshotOverlays = filterRedundantTerminalOverlays(
        snapshotMessages,
        enrichOverlaysWithToolCards(snapshotOverlays, allSnapshotToolCards),
      );
    }
    const payload: ChatStreamEvent = {
      kind: 'canonical.snapshot',
      sessionKey,
      emittedAt: new Date().toISOString(),
      version: version || nextCanonicalVersion(sessionKey, 'history_rpc'),
      messages: snapshotMessages,
      overlays: snapshotOverlays,
      pageInfo: snapshotPageInfo,
      runtime,
      source: source || 'history_rpc',
    };
    return payload;
  }

  async function bootstrapCanonicalSnapshotForSession(
    sessionKey: string,
    socket?: WebSocket,
  ): Promise<void> {
    const payload = await buildCanonicalSnapshotEvent(sessionKey);
    if (!payload) {
      return;
    }
    if (socket) {
      sendSequencedWebSocketEvent(socket, sessionKey, payload);
      return;
    }
    broadcastToSession(sessionKey, payload);
  }

  async function emitBootstrapEventsToSse(
    sessionKey: string,
    res: http.ServerResponse,
    options: {
      includeSnapshot?: boolean;
    } = {},
  ): Promise<void> {
    const state = sessionKey ? await resolveSessionStateForAttachEvents(sessionKey) : null;
    const session = state?.row || null;
    const runtime = session?.runtime || buildRuntimeState(await isGatewayConnected(), Boolean(session?.permissions.writable));
    sendSequencedSseEvent(res, sessionKey, {
      kind: 'runtime',
      sessionKey,
      runId: null,
      emittedAt: new Date().toISOString(),
      runtime,
    } satisfies ChatStreamEvent);
    const queueState = state?.pendingQueue || [];
    sendSequencedSseEvent(res, sessionKey, {
      kind: 'queue.state',
      sessionKey,
      emittedAt: new Date().toISOString(),
      items: cloneChatQueuedMessageList(queueState),
    } satisfies ChatStreamEvent);
    const controls = state?.controls || createDefaultSessionControls();
    sendSequencedSseEvent(res, sessionKey, buildSessionControlsEvent(sessionKey, controls));
    for (const overlay of listRunOverlaysForSession(sessionKey)) {
      sendSequencedSseEvent(res, sessionKey, {
        kind: 'run_overlay',
        sessionKey,
        runId: overlay.runId,
        emittedAt: overlay.updatedAt || new Date().toISOString(),
        overlay,
        terminal: isRunProjectionTerminal(overlay.lifecycle),
      } satisfies ChatStreamEvent);
    }
    if (options.includeSnapshot !== false) {
      const snapshot = await buildCanonicalSnapshotEvent(sessionKey);
      if (snapshot) {
        sendSequencedSseEvent(res, sessionKey, snapshot);
      }
    }
  }

  async function buildGatewayAttachEvents(
    sessionKey: string,
    options: { includeSnapshot?: boolean } = {},
  ): Promise<ChatStreamEvent[]> {
    const state = await resolveSessionStateForAttachEvents(sessionKey);
    const session = state?.row || await requireSession(sessionKey);
    const runtime = state?.row.runtime
      || session.runtime
      || buildRuntimeState(await isGatewayConnected(), Boolean(session.permissions.writable));
    const emittedAt = new Date().toISOString();
    const events: ChatStreamEvent[] = [{
      kind: 'runtime',
      sessionKey,
      runId: null,
      emittedAt,
      runtime,
    }, {
      kind: 'queue.state',
      sessionKey,
      emittedAt,
      items: cloneChatQueuedMessageList(state?.pendingQueue || []),
    }, buildSessionControlsEvent(sessionKey, state?.controls || createDefaultSessionControls(), emittedAt)];

    if (shouldEmitCanonicalProtocol()) {
      events.push({
        kind: 'runtime.state',
        sessionKey,
        runId: null,
        emittedAt,
        runtime,
      });
    }

    for (const overlay of listRunOverlaysForSession(sessionKey)) {
      events.push({
        kind: 'run_overlay',
        sessionKey,
        runId: overlay.runId,
        emittedAt: overlay.updatedAt || emittedAt,
        overlay,
        terminal: isRunProjectionTerminal(overlay.lifecycle),
      });
    }

    if (options.includeSnapshot !== false) {
      const snapshotEvent = await buildCanonicalSnapshotEvent(sessionKey);
      if (snapshotEvent) {
        events.push(snapshotEvent);
      }
    }
    return events.map((event) => sequenceChatStreamEvent(sessionKey, event));
  }

  async function syncLocalTranscriptCanonicalSource(sessionKey: string): Promise<void> {
    const selection = selectCanonicalSource(sessionKey);
    if (selection.kind !== 'local_transcript') {
      return;
    }
    const localTail = readLocalTranscriptCanonicalTailWindow(sessionKey, selection);
    const overlays = listRunOverlaysForSession(sessionKey);
    const current = canonicalStates.get(sessionKey);

    if (current?.source === 'local_transcript') {
      const lastCurrentEntry = current.entries[current.entries.length - 1] || null;
      const overlapIndex = lastCurrentEntry
        ? findCanonicalTailOverlapIndex(localTail.entries, lastCurrentEntry)
        : -1;
      if (lastCurrentEntry && overlapIndex >= 0) {
        if (overlapIndex >= localTail.entries.length - 1) {
          return;
        }
        const appendEntries = resequenceCanonicalEntries(
          localTail.entries.slice(overlapIndex + 1),
          lastCurrentEntry.messageSeq + 1,
        );
        emitCanonicalMessages(sessionKey, 'local_transcript', appendEntries, current.version);
        const updated = canonicalStates.get(sessionKey);
        if (updated?.source === 'local_transcript') {
          updated.entries = compactLocalCanonicalEntries(updated.entries);
          updated.pageInfo = buildCanonicalSnapshotWindow(
            updated.entries,
            overlays,
            current.pageInfo || localTail.pageInfo,
          ).pageInfo;
          canonicalStates.set(sessionKey, updated);
        }
        return;
      }
    }

    const nextVersion = current?.source === 'local_transcript'
      && buildCanonicalEntriesSignature(current.entries) === buildCanonicalEntriesSignature(localTail.entries)
      ? current.version
      : nextCanonicalVersion(sessionKey, 'local_transcript');
    emitCanonicalSnapshot(
      sessionKey,
      'local_transcript',
      localTail.entries,
      nextVersion,
      overlays,
      localTail.pageInfo,
    );
  }

  function paginateMessageList(
    messages: ChatMessageItem[],
    options: {
      before?: string | null;
      after?: string | null;
      anchor?: string | null;
      limit?: number;
      day?: string | null;
      source: ChatHistoryCursor['source'];
      query?: string | null;
      roleFilter?: ChatHistorySearchRoleFilter | null;
      contentFilter?: ChatHistorySearchContentFilter | null;
    },
  ): {
    messages: ChatMessageItem[];
    pageInfo: ChatHistoryPayload['pageInfo'];
    day: string | null;
  } {
    const day = normalizeString(options.day) || null;
    const filtered = day
      ? messages.filter((message) => (normalizeDate(message.createdAt) || '').slice(0, 10) === day)
      : messages.slice();
    const limit = normalizeHistoryLimit(options.limit, 50);
    const queryNormalized = normalizeString(options.query) || null;
    const roleFilter = options.source === 'history_search'
      ? normalizeHistorySearchRoleFilter(options.roleFilter)
      : null;
    const contentFilter = options.source === 'history_search'
      ? normalizeHistorySearchContentFilter(options.contentFilter)
      : null;

    const cursorMatchesContext = (cursor: ChatHistoryCursor | null): boolean => {
      if (!cursor) return false;
      return cursor.source === options.source
        && (cursor.day || null) === day
        && (cursor.query || null) === queryNormalized
        && (cursor.roleFilter || null) === roleFilter
        && (cursor.contentFilter || null) === contentFilter;
    };

    let start: number;
    let end: number;

    const anchorId = normalizeString(options.anchor) || null;
    if (anchorId) {
      // Anchor mode: center a window around the message with the given ID
      const anchorIdx = filtered.findIndex((m) => m.id === anchorId);
      if (anchorIdx === -1) {
        // Anchor message not found — fall back to tail
        end = filtered.length;
        start = Math.max(0, end - limit);
      } else {
        const before = Math.floor(limit / 2);
        const after = Math.ceil(limit / 2);
        start = Math.max(0, anchorIdx - before);
        end = Math.min(filtered.length, anchorIdx + after + 1);
        // Redistribute if clamped at boundaries
        if (start === 0) {
          end = Math.min(filtered.length, start + limit + 1);
        } else if (end === filtered.length) {
          start = Math.max(0, end - limit - 1);
        }
      }
    } else {
      const afterCursor = decodeHistoryCursor(options.after);
      if (afterCursor && cursorMatchesContext(afterCursor)) {
        // After mode: load messages forward from cursor position
        const anchorById = afterCursor.anchorMessageId
          ? filtered.findIndex((message) => message.id === afterCursor.anchorMessageId)
          : -1;
        const startInclusive = Math.min(
          filtered.length,
          anchorById >= 0 ? anchorById : afterCursor.anchorIndex,
        );
        start = startInclusive;
        end = Math.min(filtered.length, start + limit);
      } else {
        const beforeCursor = decodeHistoryCursor(options.before);
        if (beforeCursor && cursorMatchesContext(beforeCursor)) {
          // Before mode (existing behavior): load messages before cursor position
          const anchorById = beforeCursor.anchorMessageId
            ? filtered.findIndex((message) => message.id === beforeCursor.anchorMessageId)
            : -1;
          end = Math.min(
            filtered.length,
            anchorById >= 0 ? anchorById : beforeCursor.anchorIndex,
          );
          start = Math.max(0, end - limit);
        } else {
          // Default: load the last N messages
          end = filtered.length;
          start = Math.max(0, end - limit);
        }
      }
    }

    const pageMessages = filtered.slice(start, end);

    const beforeCursorValue = start > 0
      ? encodeHistoryCursor({
        source: options.source,
        anchorIndex: start,
        anchorMessageId: filtered[start]?.id || null,
        anchorCreatedAt: filtered[start]?.createdAt || null,
        day,
        query: queryNormalized,
        roleFilter,
        contentFilter,
      })
      : null;

    const afterCursorValue = end < filtered.length
      ? encodeHistoryCursor({
        source: options.source,
        anchorIndex: end,
        anchorMessageId: filtered[end]?.id || null,
        anchorCreatedAt: filtered[end]?.createdAt || null,
        day,
        query: queryNormalized,
        roleFilter,
        contentFilter,
      })
      : null;

    return {
      messages: pageMessages,
      pageInfo: {
        hasMoreBefore: start > 0,
        beforeCursor: beforeCursorValue,
        hasMoreAfter: end < filtered.length,
        afterCursor: afterCursorValue,
      },
      day,
    };
  }

  function filterOverlaysForMessageWindow(
    overlays: ChatRunOverlay[],
    messages: ChatMessageItem[],
  ): ChatRunOverlay[] {
    if (!overlays.length || !messages.length) {
      return [];
    }
    const runIds = new Set(
      messages
        .map((message) => normalizeString(message.runId))
        .filter(Boolean),
    );
    const toolCallIds = new Set(
      messages.flatMap((message) => (message.toolCalls || []).map((toolCall) => normalizeString(toolCall.toolCallId))).filter(Boolean),
    );
    return overlays.filter((overlay) => (
      runIds.has(normalizeString(overlay.runId))
      || overlay.toolCalls.some((toolCall) => toolCallIds.has(normalizeString(toolCall.toolCallId)))
    ));
  }

  function overlayTimestampMs(overlay: ChatRunOverlay): number {
    return Date.parse(
      overlay.firstToolStartedAt
      || overlay.firstAssistantSeenAt
      || overlay.finalCreatedAt
      || overlay.startedAt
      || overlay.updatedAt
      || '',
    ) || 0;
  }

  function messageTimestampMs(message: ChatMessageItem): number {
    return Date.parse(message.createdAt || '') || 0;
  }

  function collectOrphanOverlaysForMessageWindow(
    overlays: ChatRunOverlay[],
    allMessages: ChatMessageItem[],
    pageMessages: ChatMessageItem[],
    pageInfo: ChatHistoryPayload['pageInfo'],
    alreadyIncluded: ChatRunOverlay[],
  ): ChatRunOverlay[] {
    if (!overlays.length) {
      return [];
    }
    const allRunIds = new Set(allMessages.map((message) => normalizeString(message.runId)).filter(Boolean));
    const allToolCallIds = new Set(
      allMessages
        .flatMap((message) => (message.toolCalls || []).map((toolCall) => normalizeString(toolCall.toolCallId)))
        .filter(Boolean),
    );
    const includedRunIds = new Set(alreadyIncluded.map((overlay) => normalizeString(overlay.runId)).filter(Boolean));
    const orphanOverlays = overlays
      .filter((overlay) => {
        const runId = normalizeString(overlay.runId);
        if (!runId || includedRunIds.has(runId) || allRunIds.has(runId)) {
          return false;
        }
        return !overlay.toolCalls.some((toolCall) => allToolCallIds.has(normalizeString(toolCall.toolCallId)));
      })
      .sort((left, right) => overlayTimestampMs(left) - overlayTimestampMs(right));
    if (!orphanOverlays.length) {
      return [];
    }

    const pageTimestamps = pageMessages.map(messageTimestampMs).filter(Boolean);
    if (pageTimestamps.length) {
      const start = Math.min(...pageTimestamps) - CHAT_HISTORY_ORPHAN_OVERLAY_CONTEXT_MS;
      const end = Math.max(...pageTimestamps) + CHAT_HISTORY_ORPHAN_OVERLAY_CONTEXT_MS;
      const contextual = orphanOverlays
        .filter((overlay) => {
          const ts = overlayTimestampMs(overlay);
          return ts >= start && ts <= end;
        })
        .slice(-CHAT_HISTORY_ORPHAN_OVERLAY_LIMIT);
      if (contextual.length) {
        return contextual;
      }
    }

    return pageInfo.hasMoreAfter
      ? []
      : orphanOverlays.slice(-CHAT_HISTORY_ORPHAN_OVERLAY_LIMIT);
  }

  function buildPageOverlaysForMessageWindow(
    overlays: ChatRunOverlay[],
    allMessages: ChatMessageItem[],
    pageMessages: ChatMessageItem[],
    pageInfo: ChatHistoryPayload['pageInfo'],
  ): ChatRunOverlay[] {
    const pageOverlays = filterOverlaysForMessageWindow(overlays, pageMessages);
    return [
      ...pageOverlays,
      ...collectOrphanOverlaysForMessageWindow(overlays, allMessages, pageMessages, pageInfo, pageOverlays),
    ];
  }

  function buildIndexStubMessage(item: {
    id: string;
    role: string;
    createdAt: string | null;
    runId: string | null;
    previewText: string;
  }): ChatMessageItem {
    return {
      id: item.id,
      role: item.role as ChatMessageItem['role'],
      text: item.previewText,
      createdAt: item.createdAt,
      source: 'history',
      runId: item.runId,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    };
  }

  function buildGatewayRuntime(sessionKey: string, writable: boolean, overrides: Partial<ChatRuntimeState> = {}): ChatRuntimeState {
    const current = getTracevaneSession(sessionKey)?.row.runtime;
    return {
      gatewayConnected: true,
      sessionWritable: writable,
      activeRunId: current?.activeRunId || null,
      state: current?.state || 'idle',
      lastEventAt: current?.lastEventAt || null,
      lastAckAt: current?.lastAckAt || null,
      lastErrorCode: current?.lastErrorCode || null,
      lastErrorMessage: current?.lastErrorMessage || null,
      ...overrides,
    };
  }

  function buildRuntimeForTerminalChatEvent(params: {
    sessionKey: string;
    runId: string;
    writable: boolean;
    emittedAt: string;
    overrides: Partial<ChatRuntimeState>;
  }): ChatRuntimeState {
    const current = getTracevaneSession(params.sessionKey)?.row.runtime || null;
    const currentActiveRunId = normalizeString(current?.activeRunId) || null;
    if (currentActiveRunId && currentActiveRunId !== params.runId) {
      return {
        gatewayConnected: true,
        sessionWritable: params.writable,
        activeRunId: currentActiveRunId,
        state: current?.state === 'streaming' ? 'streaming' : 'running',
        lastEventAt: params.emittedAt,
        lastAckAt: current?.lastAckAt || null,
        lastErrorCode: current?.lastErrorCode || null,
        lastErrorMessage: current?.lastErrorMessage || null,
      };
    }
    return buildGatewayRuntime(params.sessionKey, params.writable, params.overrides);
  }

  function buildQueuedMessageItem(
    sessionKey: string,
    payload: ChatSendRequest,
    createdAt = new Date().toISOString(),
  ): ChatQueuedMessageItem {
    const fileRefs = mediaBridge.normalizeSendFileRefs(payload.fileRefs);
    const attachments = mediaBridge.normalizeSendAttachments(payload.attachments);
    const composerDocument = normalizeComposerDocument(payload.composerDocument);
    const composerText = composerDocument.length
      ? serializeComposerDocumentToMarkdown(composerDocument, fileRefs)
      : '';
    const text = normalizeString(composerText) || normalizeString(payload.text);
    if (!text && fileRefs.length === 0 && attachments.length === 0) {
      throw new ChatServiceError(400, buildChatError('invalid_request', 'Message text or attachment is required'));
    }
    const previewText = extractComposerPlainText(composerDocument).trim()
      || text
      || fileRefs[0]?.fileName
      || attachments[0]?.fileName
      || '';
    return {
      id: `queue-${crypto.randomUUID()}`,
      sessionKey,
      clientRequestId: normalizeString(payload.clientRequestId) || null,
      deliveryRequestId: normalizeString(payload.clientRequestId, `tracevane-${crypto.randomUUID()}`),
      text,
      previewText,
      composerDocument: composerDocument.length ? composerDocument : undefined,
      fileRefs: fileRefs.length ? fileRefs : undefined,
      attachments: attachments.length ? attachments : undefined,
      createdAt,
      updatedAt: createdAt,
      status: 'queued',
      blockedReason: null,
    };
  }

  async function flushQueueIfIdle(sessionKey: string): Promise<void> {
    if (queueFlushSessions.has(sessionKey)) {
      queueFlushRerunSessions.add(sessionKey);
      return;
    }
    queueFlushSessions.add(sessionKey);
    try {
      while (true) {
        const current = getTracevaneSession(sessionKey);
        if (!current || current.row.runtime.activeRunId || current.pendingQueue.length === 0) {
          return;
        }
        const [nextEntry, ...rest] = current.pendingQueue;
        if (!nextEntry) {
          return;
        }

        current.pendingQueue = rest;
        setTracevaneSession(current);
        broadcastQueueState(sessionKey);

        try {
          await performDirectSend(sessionKey, {
            text: nextEntry.text,
            clientRequestId: nextEntry.deliveryRequestId,
            composerDocument: nextEntry.composerDocument,
            fileRefs: nextEntry.fileRefs,
            attachments: nextEntry.attachments,
          }, {
            publishCanonicalUserMessageImmediately: true,
          });
        } catch (error) {
          const latest = getTracevaneSession(sessionKey);
          if (latest) {
            const blockedEntry: ChatQueuedMessageItem = {
              ...cloneChatQueuedMessageItem(nextEntry)!,
              status: 'blocked',
              blockedReason: error instanceof Error ? error.message : 'Queue flush failed',
              updatedAt: new Date().toISOString(),
            };
            latest.pendingQueue = [blockedEntry, ...latest.pendingQueue];
            setTracevaneSession(latest);
            broadcastQueueState(sessionKey);
          }
          return;
        }

        const latest = getTracevaneSession(sessionKey);
        if (latest?.row.runtime.activeRunId) {
          return;
        }
      }
    } finally {
      queueFlushSessions.delete(sessionKey);
      if (queueFlushRerunSessions.delete(sessionKey)) {
        void Promise.resolve().then(() => flushQueueIfIdle(sessionKey));
      }
    }
  }

  function mapGatewayChatEvent(sessionKey: string, payload: Record<string, unknown>): ChatStreamEvent[] {
    const state = normalizeString(payload.state);
    const runId = normalizeString(payload.runId) || null;
    const emittedAt = new Date().toISOString();
    const writable = buildChatSessionPermissions('tracevane_managed').writable;
    const protocolMode = getChatProtocolMode();
    const canonicalSource = selectCanonicalSource(sessionKey);
    const allowLegacyCanonicalWrite = protocolMode === 'legacy' && canonicalSource.kind !== 'local_transcript';

    if (!runId) return [];
    if (isSuppressedGatewayRunId(sessionKey, runId)) {
      streamSnapshots.delete(runId);
      return [];
    }

    if (state === 'delta') {
      const rawText = extractMessageText((payload.message as Record<string, unknown>) || {});
      const previous = streamSnapshots.get(runId) || '';
      const accumulatedText = rawText;
      const textDelta = accumulatedText.startsWith(previous)
        ? accumulatedText.slice(previous.length)
        : accumulatedText;
      streamSnapshots.set(runId, accumulatedText);
      const previewMessage = buildAssistantStreamPreviewMessage(sessionKey, accumulatedText, {
        id: `stream-${runId}`,
        createdAt: emittedAt,
        source: 'stream',
        runId,
      }, (payload.message as Record<string, unknown>) || null);
      const runtime = buildGatewayRuntime(sessionKey, writable, {
        activeRunId: runId,
        state: 'streaming',
        lastEventAt: emittedAt,
      });
      updateRuntimeCache(sessionKey, runtime);
      const projection = ensureRunProjection(sessionKey, runId, emittedAt, { lifecycle: 'running' });
      projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, 'running');
      projection.previewText = accumulatedText || projection.previewText;
      if (accumulatedText && !projection.firstAssistantSeenAt) {
        projection.firstAssistantSeenAt = emittedAt;
      }
      saveRunProjection(sessionKey, projection);

      const events: ChatStreamEvent[] = [];
      if (shouldEmitLegacyProtocol()) {
        const overlayEvent = buildRunOverlayEvent(sessionKey, projection, emittedAt, false);
        if (overlayEvent) {
          events.push(overlayEvent);
        }
        events.push({
          kind: 'delta',
          sessionKey,
          runId,
          emittedAt,
          textDelta,
          accumulatedText,
          message: previewMessage,
        });
      }
      if (shouldEmitCanonicalProtocol()) {
        events.push({
          kind: 'temporary.assistant',
          sessionKey,
          runId,
          emittedAt,
          textDelta,
          accumulatedText,
        });
        events.push({
          kind: 'runtime.state',
          sessionKey,
          runId,
          emittedAt,
          runtime,
        });
      }
      return events;
    }

    if (state === 'final') {
      const rawFinalMessage = (payload.message as Record<string, unknown>) || {};
      const skippedTracevaneEnvelope = isAssistantTracevaneDeliveryToolUseEnvelope(rawFinalMessage);
      const skippedNoReply = isAssistantNoReplyMessage(rawFinalMessage);
      const message = mapTranscriptMessage(rawFinalMessage, 0, {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      });
      const usage = normalizeUsageSummary(payload.usage);
      const projection = ensureRunProjection(sessionKey, runId, emittedAt, { lifecycle: 'completed' });
      projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, 'completed');
      const runtime = skippedTracevaneEnvelope
        ? buildGatewayRuntime(sessionKey, writable, {
          activeRunId: runId,
          state: 'running',
          lastEventAt: emittedAt,
        })
        : buildRuntimeForTerminalChatEvent({
          sessionKey,
          runId,
          writable,
          emittedAt,
          overrides: {
            activeRunId: null,
            state: 'completed',
            lastEventAt: emittedAt,
          },
        });
      updateRuntimeCache(sessionKey, runtime);
      if (!runtime.activeRunId) {
        void flushQueueIfIdle(sessionKey);
      }
      updateObservabilityCache(sessionKey, (current) => {
        let next = cloneObservabilityState(current);
        if (usage) {
          next.usage = usage;
          next = appendTimelineItem(next, {
            id: `usage-${runId}`,
            kind: 'usage',
            runId,
            toolCallId: null,
            emittedAt,
            title: `Usage · ${usage.totalTokens} tokens`,
            detail: `in ${usage.inputTokens} / out ${usage.outputTokens}`,
            level: 'info',
          }, `usage-${runId}`);
        }
        return next;
      });
      streamSnapshots.delete(runId);
      if (message) {
        projection.previewText = message.text || projection.previewText;
        projection.finalMessageId = message.id;
        projection.finalCreatedAt = message.createdAt || emittedAt;
        if (message.text && !projection.firstAssistantSeenAt) {
          projection.firstAssistantSeenAt = message.createdAt || emittedAt;
        }
      }
      saveRunProjection(sessionKey, projection);
      persistProjectionIfTerminal(projection);
      if (canonicalSource.kind === 'local_transcript') {
        void syncLocalTranscriptCanonicalSource(sessionKey);
      }

      const events: ChatStreamEvent[] = [];
      if (shouldEmitLegacyProtocol()) {
        const overlayEvent = buildRunOverlayEvent(sessionKey, projection, emittedAt, true);
        if (overlayEvent) {
          events.push(overlayEvent);
        }
      }
      if (message && shouldEmitLegacyProtocol()) {
        const canonicalMessage = {
          ...message,
          source: 'stream',
          runId,
        } satisfies ChatMessageItem;
        if (allowLegacyCanonicalWrite) {
          upsertTracevaneMessage(sessionKey, canonicalMessage);
        }
        events.push({
          kind: 'final',
          sessionKey,
          runId,
          emittedAt,
          message: canonicalMessage,
          runtime,
          usage,
        });
      } else if (shouldEmitLegacyProtocol() && !(skippedTracevaneEnvelope && !skippedNoReply)) {
        events.push({
          kind: 'runtime',
          sessionKey,
          runId,
          emittedAt,
          runtime,
        });
      }
      if (shouldEmitCanonicalProtocol()) {
        events.push({
          kind: 'runtime.state',
          sessionKey,
          runId,
          emittedAt,
          runtime,
        });
      }
      return events;
    }

    if (state === 'aborted') {
      const partialRaw = payload.message && typeof payload.message === 'object'
        ? payload.message as Record<string, unknown>
        : { text: typeof payload.message === 'string' ? payload.message : '', role: 'assistant' };
      const partialMapped = mapTranscriptMessage({
        ...partialRaw,
        role: 'assistant',
        state: 'aborted',
        stopReason: normalizeString(payload.stopReason) || null,
        timestamp: emittedAt,
      }, 0, {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      });
      const partialMessage = partialMapped && (partialMapped.text || partialMapped.resources?.length)
        ? {
          ...partialMapped,
          id: `aborted-${runId}`,
          source: 'stream',
          runId,
          createdAt: emittedAt,
          aborted: true,
          stopReason: normalizeString(payload.stopReason) || null,
        } satisfies ChatMessageItem
        : null;
      const runtime = buildRuntimeForTerminalChatEvent({
        sessionKey,
        runId,
        writable,
        emittedAt,
        overrides: {
          activeRunId: null,
          state: 'aborted',
          lastEventAt: emittedAt,
        },
      });
      updateRuntimeCache(sessionKey, runtime);
      void flushQueueIfIdle(sessionKey);
      const projection = ensureRunProjection(sessionKey, runId, emittedAt, { lifecycle: 'aborted' });
      projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, 'aborted');
      if (partialMessage) {
        projection.previewText = partialMessage.text || projection.previewText;
        projection.finalMessageId = partialMessage.id;
        projection.finalCreatedAt = partialMessage.createdAt || emittedAt;
        if (partialMessage.text && !projection.firstAssistantSeenAt) {
          projection.firstAssistantSeenAt = partialMessage.createdAt || emittedAt;
        }
        if (allowLegacyCanonicalWrite) {
          upsertTracevaneMessage(sessionKey, partialMessage);
        }
      }
      saveRunProjection(sessionKey, projection);
      persistProjectionIfTerminal(projection);
      streamSnapshots.delete(runId);
      if (canonicalSource.kind === 'local_transcript') {
        void syncLocalTranscriptCanonicalSource(sessionKey);
      }
      const events: ChatStreamEvent[] = [];
      if (shouldEmitLegacyProtocol()) {
        const overlayEvent = buildRunOverlayEvent(sessionKey, projection, emittedAt, true);
        if (overlayEvent) {
          events.push(overlayEvent);
        }
        events.push({
          kind: 'aborted',
          sessionKey,
          runId,
          emittedAt,
          stopReason: normalizeString(payload.stopReason) || null,
          partialMessage,
          runtime,
        });
      }
      if (shouldEmitCanonicalProtocol()) {
        events.push({
          kind: 'runtime.state',
          sessionKey,
          runId,
          emittedAt,
          runtime,
        });
      }
      return events;
    }

    if (state === 'error') {
      const error = buildChatError(
        'internal_error',
        normalizeString(payload.errorMessage, 'Gateway chat error'),
        'gateway',
        false
      );
      const runtime = buildRuntimeForTerminalChatEvent({
        sessionKey,
        runId,
        writable,
        emittedAt,
        overrides: {
          activeRunId: null,
          state: 'error',
          lastEventAt: emittedAt,
          lastErrorCode: error.code,
          lastErrorMessage: error.message,
        },
      });
      updateRuntimeCache(sessionKey, runtime);
      void flushQueueIfIdle(sessionKey);
      const projection = getRunProjection(sessionKey, runId);
      if (projection) {
        projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, 'error');
        saveRunProjection(sessionKey, projection);
        persistProjectionIfTerminal(projection);
      }
      streamSnapshots.delete(runId);
      const events: ChatStreamEvent[] = [];
      if (projection && shouldEmitLegacyProtocol()) {
        const overlayEvent = buildRunOverlayEvent(sessionKey, projection, emittedAt, true);
        if (overlayEvent) {
          events.push(overlayEvent);
        }
      }
      if (shouldEmitLegacyProtocol()) {
        events.push({
          kind: 'error',
          sessionKey,
          runId,
          emittedAt,
          error,
          runtime,
        });
      }
      if (shouldEmitCanonicalProtocol()) {
        events.push({
          kind: 'runtime.state',
          sessionKey,
          runId,
          emittedAt,
          runtime,
        });
      }
      return events;
    }

    return [];
  }

  function mapGatewayChatSideResultEvent(sessionKey: string, payload: Record<string, unknown>): ChatStreamEvent[] {
    const runId = normalizeString(payload.runId);
    const sideKind = normalizeString(payload.kind).toLowerCase();
    const question = normalizeString(payload.question);
    const text = normalizeString(payload.text);
    const emittedAt = normalizeDate(payload.ts) || new Date().toISOString();
    if (!runId || sideKind !== 'btw' || !question || !text) {
      return [];
    }
    return [{
      kind: 'side_result',
      sessionKey,
      runId,
      emittedAt,
      result: {
        kind: 'btw',
        question,
        text,
        isError: payload.isError === true,
      },
    }];
  }

  function maybeBuildAssistantDeliveryMessage(
    sessionKey: string,
    payload: Record<string, unknown>,
    mapped: Extract<ChatStreamEvent, { kind: 'agent_tool_result' }>,
  ): ChatMessageItem | null {
    if (mapped.partial || mapped.tool.name !== 'tracevane_delivery') {
      return null;
    }
    const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : null;
    if (!data) {
      return null;
    }
    const resultSource = data.result ?? data.output ?? data.text ?? data.partialResult ?? data.error ?? data.details ?? null;
    const delivery = mediaBridge.extractTracevaneDelivery(resultSource) || mediaBridge.extractTracevaneDelivery(data);
    if (!delivery) {
      return null;
    }
    const message = mediaBridge.buildAssistantMessageFromTracevaneDelivery(sessionKey, delivery, {
      id: `tracevane-delivery-${mapped.tool.toolCallId}`,
      createdAt: mapped.emittedAt,
      source: 'stream',
      runId: mapped.runId,
    });
    if (!message) {
      return null;
    }
    return message;
  }

  function mapGatewayAgentEvents(sessionKey: string, payload: Record<string, unknown>): ChatStreamEvent[] {
    const previousToolCard = (() => {
      const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : null;
      const toolCallId = normalizeString(data?.toolCallId);
      if (!toolCallId) return null;
      return getTracevaneSession(sessionKey)?.observability.toolCards.find((entry) => entry.toolCallId === toolCallId) || null;
    })();
    const mapped = mapGatewayAgentEventPayload({
      sessionKey,
      payload,
      previousToolCard,
      collectToolArtifacts: mediaBridge.collectToolArtifacts,
    });
    if (!mapped) return [];

    if (mapped.kind === 'agent_lifecycle') {
      updateObservabilityCache(sessionKey, (current) => appendTimelineItem({
        ...cloneObservabilityState(current),
        lifecycle: mapped.lifecycle,
      }, {
        id: `lifecycle-${mapped.runId || 'none'}-${mapped.lifecycle.phase}-${mapped.emittedAt}`,
        kind: 'lifecycle',
        runId: mapped.runId,
        toolCallId: null,
        emittedAt: mapped.emittedAt,
        title: `Lifecycle · ${mapped.lifecycle.phase}`,
        detail: mapped.lifecycle.errorMessage,
        level: mapped.lifecycle.phase === 'error' ? 'error' : mapped.lifecycle.phase === 'end' ? 'success' : 'info',
      }));
      if (mapped.runId) {
        const nextLifecycle = mapped.lifecycle.phase === 'start'
          ? 'running'
          : mapped.lifecycle.phase === 'end'
            ? 'completed'
            : 'error';
        const projection = ensureRunProjection(sessionKey, mapped.runId, mapped.emittedAt, { lifecycle: nextLifecycle });
        projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, nextLifecycle);
        saveRunProjection(sessionKey, projection);
        persistProjectionIfTerminal(projection);
        const overlayEvent = buildRunOverlayEvent(sessionKey, projection, mapped.emittedAt, isRunProjectionTerminal(projection.lifecycle));
        return overlayEvent ? [mapped, overlayEvent] : [mapped];
      }
      return [mapped];
    }

    if (mapped.kind === 'agent_assistant') {
      const existingProjection = mapped.runId
        ? getRunProjectionMap(sessionKey, false)?.get(mapped.runId)
        : null;
      const previousText = existingProjection?.previewText || '';
      const nextAssistantText = (() => {
        if (!previousText) return mapped.text;
        if (mapped.text.startsWith(previousText)) return mapped.text;
        if (previousText.startsWith(mapped.text) && !mapped.deltaText) return previousText;
        if (mapped.deltaText) return `${previousText}${mapped.deltaText}`;
        return mapped.text || previousText;
      })();
      updateObservabilityCache(sessionKey, (current) => appendTimelineItem(current, {
        id: `assistant-${mapped.runId}`,
        kind: 'assistant',
        runId: mapped.runId,
        toolCallId: null,
        emittedAt: mapped.emittedAt,
        title: 'Assistant stream',
        detail: summarizeUnknown(nextAssistantText, 220) || mapped.textPreview,
        level: 'info',
      }, `assistant-${mapped.runId}`));
      const projection = ensureRunProjection(sessionKey, mapped.runId, mapped.emittedAt, { lifecycle: 'running' });
      projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, 'running');
      settleProjectionRunningToolsBeforeAssistant(projection, mapped.emittedAt);
      projection.previewText = nextAssistantText || projection.previewText;
      if (nextAssistantText && !projection.firstAssistantSeenAt) {
        projection.firstAssistantSeenAt = mapped.emittedAt;
      }
      saveRunProjection(sessionKey, projection);
      const overlayEvent = buildRunOverlayEvent(sessionKey, projection, mapped.emittedAt, false);
      const events: ChatStreamEvent[] = [mapped];
      if (shouldEmitCanonicalProtocol()) {
        events.push({
          kind: 'temporary.assistant',
          sessionKey,
          runId: mapped.runId,
          emittedAt: mapped.emittedAt,
          textDelta: mapped.deltaText || mapped.text,
          accumulatedText: nextAssistantText,
        });
      }
      if (overlayEvent) {
        events.push(overlayEvent);
      }
      return events;
    }

    if (mapped.kind === 'agent_tool_call' || mapped.kind === 'agent_tool_result') {
      const toolStreamRunId = mapped.runId || `tool:${mapped.tool.toolCallId}`;
      const normalizedMapped = mapped.runId ? mapped : {
        ...mapped,
        runId: toolStreamRunId,
      };
      updateObservabilityCache(sessionKey, (current) => {
        let next = upsertToolCard(current, normalizedMapped.tool);
        const shouldAppendTimeline = normalizedMapped.kind === 'agent_tool_call' || !normalizedMapped.partial;
        if (shouldAppendTimeline) {
          next = appendTimelineItem(next, {
            id: normalizedMapped.kind === 'agent_tool_call'
              ? `start-${normalizedMapped.tool.toolCallId}-${normalizedMapped.emittedAt}`
              : `result-${normalizedMapped.tool.toolCallId}-${normalizedMapped.emittedAt}`,
            kind: normalizedMapped.kind === 'agent_tool_call' ? 'tool_call' : 'tool_result',
            runId: normalizedMapped.runId,
            toolCallId: normalizedMapped.tool.toolCallId,
            emittedAt: normalizedMapped.emittedAt,
            title: normalizedMapped.kind === 'agent_tool_call'
              ? `Tool start · ${normalizedMapped.tool.name}`
              : `Tool result · ${normalizedMapped.tool.name}`,
            detail: normalizedMapped.kind === 'agent_tool_call' ? normalizedMapped.tool.argsPreview : normalizedMapped.tool.resultPreview,
            level: normalizedMapped.tool.isError ? 'error' : normalizedMapped.kind === 'agent_tool_result' ? 'success' : 'info',
          });
        }
        return next;
      });
      if (normalizedMapped.runId) {
        const projection = ensureRunProjection(sessionKey, normalizedMapped.runId, normalizedMapped.emittedAt, { lifecycle: 'running' });
        projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, 'running');
        projection.toolCalls = upsertProjectionToolCallItem(projection.toolCalls, normalizedMapped.tool);
        const projectedTool = projection.toolCalls.find((item) => item.toolCallId === normalizedMapped.tool.toolCallId) || normalizedMapped.tool;
        const projectedMapped = projectedTool === normalizedMapped.tool
          ? normalizedMapped
          : {
            ...normalizedMapped,
            tool: projectedTool,
          };
        if (!projection.firstToolStartedAt) {
          projection.firstToolStartedAt = projectedTool.startedAt || normalizedMapped.emittedAt;
        }
        if (projectedMapped.kind === 'agent_tool_result') {
          const deliveryMessage = maybeBuildAssistantDeliveryMessage(sessionKey, payload, projectedMapped);
          if (deliveryMessage) {
            projection.previewText = deliveryMessage.text || projection.previewText;
          }
        }
        saveRunProjection(sessionKey, projection);
        persistProjectionIfTerminal(projection);
        const events: ChatStreamEvent[] = [projectedMapped];
        if (shouldEmitCanonicalProtocol()) {
          events.push({
            kind: 'temporary.tool',
            sessionKey,
            runId: toolStreamRunId,
            emittedAt: projectedMapped.emittedAt,
            partial: projectedMapped.kind === 'agent_tool_result' ? projectedMapped.partial : false,
            tool: projectedMapped.tool,
            source: 'agent.tool',
          });
        }
        if (shouldEmitLegacyProtocol()) {
          const overlayEvent = buildRunOverlayEvent(sessionKey, projection, normalizedMapped.emittedAt, isRunProjectionTerminal(projection.lifecycle));
          if (overlayEvent) {
            events.push(overlayEvent);
          }
        }
        return events;
      }
      const events: ChatStreamEvent[] = [normalizedMapped];
      if (shouldEmitCanonicalProtocol()) {
        events.push({
          kind: 'temporary.tool',
          sessionKey,
          runId: toolStreamRunId,
          emittedAt: normalizedMapped.emittedAt,
          partial: normalizedMapped.kind === 'agent_tool_result' ? normalizedMapped.partial : false,
          tool: normalizedMapped.tool,
          source: 'agent.tool',
        });
      }
      return events;
    }

    return [mapped];
  }

  function hasFrontendSubscribers(sessionKey: string): boolean {
    return countRealtimeSubscribers(sessionKey) > 0;
  }

  function buildGatewayHistoryFollowUrl(sessionKey: string): URL {
    const url = new URL(options.config.gatewayWsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = `/sessions/${encodeURIComponent(sessionKey)}/history`;
    url.search = '';
    return url;
  }

  async function fetchOfficialCanonicalHistoryEntries(sessionKey: string): Promise<ChatCanonicalEntry[]> {
    const auth = loadGatewayAuthContext(options.config);
    const response = await fetch(buildGatewayHistoryFollowUrl(sessionKey), {
      headers: {
        Authorization: `Bearer ${auth.gatewayToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`history fetch failed with ${response.status}`);
    }
    const payload = await response.json() as Record<string, unknown>;
    const messages = Array.isArray(payload.messages)
      ? payload.messages.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : [];
    return messages.flatMap((item, index) => {
      const mapped = buildCanonicalEntryFromRaw(item, index, {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      });
      return mapped ? [mapped] : [];
    });
  }

  function isUnexpectedHistorySseMessageSeq(
    current: ChatCanonicalState | null | undefined,
    nextEntry: ChatCanonicalEntry,
  ): boolean {
    if (!current || current.source !== 'history_sse') {
      return true;
    }
    const previousSeq = current.entries[current.entries.length - 1]?.messageSeq || 0;
    return nextEntry.messageSeq !== previousSeq + 1;
  }

  async function resyncOfficialCanonicalHistory(
    sessionKey: string,
    reason: 'bootstrap' | 'seq_gap' | 'seq_rollback' | 'unexpected_message',
  ): Promise<void> {
    const stream = officialCanonicalStreams.get(sessionKey);
    if (stream?.resyncPromise) {
      await stream.resyncPromise;
      return;
    }
    const task = (async () => {
      const entries = await fetchOfficialCanonicalHistoryEntries(sessionKey);
      const current = canonicalStates.get(sessionKey);
      const signature = buildCanonicalEntriesSignature(entries);
      const version = (
        current
        && current.source === 'history_sse'
        && buildCanonicalEntriesSignature(current.entries) === signature
      )
        ? current.version
        : nextCanonicalVersion(sessionKey, 'history_sse');
      durableMirrorStore.replaceSnapshot({
        sessionKey,
        version,
        source: 'history_sse',
        messages: entries.map((entry) => cloneChatMessageItem(entry.message)!),
        baseMessageSeq: entries[entries.length - 1]?.messageSeq || 0,
        savedAt: new Date().toISOString(),
      });
      emitCanonicalSnapshot(sessionKey, 'history_sse', entries, version, listRunOverlaysForSession(sessionKey));
    })();
    if (stream) {
      const trackedTask = task.finally(() => {
        if (stream.resyncPromise === trackedTask) {
          stream.resyncPromise = null;
        }
      });
      stream.resyncPromise = trackedTask;
      await trackedTask;
      return;
    }
    await task;
  }

  function shouldKeepOfficialCanonicalStream(sessionKey: string): boolean {
    return hasFrontendSubscribers(sessionKey);
  }

  function disposeOfficialCanonicalStream(sessionKey: string): void {
    const current = officialCanonicalStreams.get(sessionKey);
    if (!current) {
      return;
    }
    current.active = false;
    if (current.reconnectTimer) {
      clearTimeout(current.reconnectTimer);
      current.reconnectTimer = null;
    }
    current.controller?.abort();
    current.resyncPromise = null;
    current.controller = null;
    officialCanonicalStreams.delete(sessionKey);
  }

  function scheduleOfficialCanonicalStreamReconnect(state: OfficialCanonicalStreamState): void {
    if (state.reconnectTimer || !state.active || !shouldKeepOfficialCanonicalStream(state.sessionKey)) {
      return;
    }
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (!state.active || !shouldKeepOfficialCanonicalStream(state.sessionKey)) {
        return;
      }
      void connectOfficialCanonicalStream(state);
    }, 1000);
  }

  function parseSseFrames(buffer: string): {
    rest: string;
    frames: Array<{ event: string; data: string }>;
  } {
    const frames: Array<{ event: string; data: string }> = [];
    let cursor = buffer;
    while (true) {
      const boundary = cursor.indexOf('\n\n');
      if (boundary < 0) {
        break;
      }
      const rawFrame = cursor.slice(0, boundary);
      cursor = cursor.slice(boundary + 2);
      if (!rawFrame.trim()) {
        continue;
      }
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of rawFrame.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim() || event;
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trim());
        }
      }
      frames.push({
        event,
        data: dataLines.join('\n'),
      });
    }
    return {
      rest: cursor,
      frames,
    };
  }

  function handleOfficialCanonicalHistoryEvent(
    sessionKey: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (event === 'history') {
      const messages = Array.isArray(payload.messages)
        ? payload.messages.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        : [];
      const entries = messages.flatMap((item, index) => {
        const mapped = buildCanonicalEntryFromRaw(item, index, {
          sessionKey,
          collectMessageResources: mediaBridge.collectMessageResources,
          overrideMessage: overrideTranscriptMessage,
        });
        return mapped ? [mapped] : [];
      });
      const current = canonicalStates.get(sessionKey);
      const nextSignature = buildCanonicalEntriesSignature(entries);
      const version = (
        current
        && current.source === 'history_sse'
        && buildCanonicalEntriesSignature(current.entries) === nextSignature
      )
        ? current.version
        : nextCanonicalVersion(sessionKey, 'history_sse');
      durableMirrorStore.replaceSnapshot({
        sessionKey,
        version,
        source: 'history_sse',
        messages: entries.map((entry) => cloneChatMessageItem(entry.message)!),
        baseMessageSeq: entries[entries.length - 1]?.messageSeq || 0,
        savedAt: new Date().toISOString(),
      });
      emitCanonicalSnapshot(sessionKey, 'history_sse', entries, version, listRunOverlaysForSession(sessionKey));
      return;
    }

    if (event === 'message' && payload.message && typeof payload.message === 'object') {
      const entry = buildCanonicalEntryFromRaw(payload.message as Record<string, unknown>, 0, {
        sessionKey,
        collectMessageResources: mediaBridge.collectMessageResources,
        overrideMessage: overrideTranscriptMessage,
      }, {
        messageId: normalizeString(payload.messageId) || undefined,
        messageSeq: Number(payload.messageSeq) || undefined,
      });
      if (!entry) {
        return;
      }
      const current = canonicalStates.get(sessionKey);
      if (!current || current.source !== 'history_sse') {
        void resyncOfficialCanonicalHistory(sessionKey, 'bootstrap').catch(() => {});
        return;
      }
      const previousSeq = current.entries[current.entries.length - 1]?.messageSeq || 0;
      if (entry.messageSeq <= previousSeq) {
        void resyncOfficialCanonicalHistory(sessionKey, 'seq_rollback').catch(() => {});
        return;
      }
      if (isUnexpectedHistorySseMessageSeq(current, entry)) {
        void resyncOfficialCanonicalHistory(sessionKey, 'seq_gap').catch(() => {});
        return;
      }
      durableMirrorStore.appendMessage({
        sessionKey,
        version: current.version,
        source: 'history_sse',
        messageSeq: entry.messageSeq,
        savedAt: new Date().toISOString(),
        message: entry.message,
      });
      emitCanonicalMessages(sessionKey, 'history_sse', [entry], current.version);
    }
  }

  async function connectOfficialCanonicalStream(state: OfficialCanonicalStreamState): Promise<void> {
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;

    try {
      const auth = loadGatewayAuthContext(options.config);
      const response = await fetch(buildGatewayHistoryFollowUrl(state.sessionKey), {
        headers: {
          Authorization: `Bearer ${auth.gatewayToken}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`history SSE failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (state.active && shouldKeepOfficialCanonicalStream(state.sessionKey)) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          if (!frame.data) {
            continue;
          }
          try {
            handleOfficialCanonicalHistoryEvent(state.sessionKey, frame.event, JSON.parse(frame.data) as Record<string, unknown>);
          } catch {}
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && state.active) {
        scheduleOfficialCanonicalStreamReconnect(state);
      }
      return;
    }

    if (state.active && shouldKeepOfficialCanonicalStream(state.sessionKey)) {
      scheduleOfficialCanonicalStreamReconnect(state);
    }
  }

  function ensureOfficialCanonicalStream(sessionKey: string): void {
    if (selectCanonicalSource(sessionKey).kind === 'local_transcript') {
      disposeOfficialCanonicalStream(sessionKey);
      return;
    }
    const existing = officialCanonicalStreams.get(sessionKey);
    if (existing) {
      existing.active = true;
      return;
    }
    const state: OfficialCanonicalStreamState = {
      sessionKey,
      controller: null,
      reconnectTimer: null,
      resyncPromise: null,
      active: true,
    };
    officialCanonicalStreams.set(sessionKey, state);
    void connectOfficialCanonicalStream(state);
  }

  function shouldKeepBridgeAlive(sessionKey: string): boolean {
    const bridge = sessionBridges.get(sessionKey);
    if (!bridge) return false;
    if (bridge.subscribers > 0) return true;
    return Boolean(getTracevaneSession(sessionKey)?.row.runtime.activeRunId);
  }

  function bridgeSessionOwnsRunId(sessionKey: string, runId: unknown): boolean {
    const normalizedRunId = normalizeString(runId);
    if (!normalizedRunId) {
      return false;
    }
    const session = getTracevaneSession(sessionKey);
    if (normalizeString(session?.row.runtime.activeRunId) === normalizedRunId) {
      return true;
    }
    return Boolean(getRunProjection(sessionKey, normalizedRunId));
  }

  function gatewayEventMatchesBridgeSession(bridge: SessionGatewayBridge, payload: Record<string, unknown>): boolean {
    const eventSessionKey = normalizeString(payload?.sessionKey);
    if (eventSessionKey) {
      return eventSessionKey === bridge.sessionKey;
    }
    return bridgeSessionOwnsRunId(bridge.sessionKey, payload?.runId);
  }

  function disposeSessionBridge(sessionKey: string): void {
    const bridge = sessionBridges.get(sessionKey);
    if (!bridge) return;
    bridge.manualClose = true;
    if (bridge.reconnectTimer) {
      clearTimeout(bridge.reconnectTimer);
      bridge.reconnectTimer = null;
    }
    rejectBridgePending(bridge, new Error(`Gateway bridge for ${sessionKey} disposed.`));
    try { bridge.ws?.close(); } catch {}
    bridge.ws = null;
    bridge.readyPromise = null;
    bridge.resolveReady = null;
    bridge.rejectReady = null;
    bridge.connectRequestId = null;
    sessionBridges.delete(sessionKey);
  }

  function maybeDisposeSessionBridge(sessionKey: string): void {
    if (shouldKeepBridgeAlive(sessionKey)) return;
    disposeSessionBridge(sessionKey);
  }

  function scheduleBridgeReconnect(bridge: SessionGatewayBridge): void {
    if (bridge.reconnectTimer || bridge.manualClose) return;
    if (!shouldKeepBridgeAlive(bridge.sessionKey)) {
      maybeDisposeSessionBridge(bridge.sessionKey);
      return;
    }
    bridge.reconnectTimer = setTimeout(() => {
      bridge.reconnectTimer = null;
      void connectSessionBridge(bridge).catch(() => {
        scheduleBridgeReconnect(bridge);
      });
    }, 1000);
  }

  async function connectSessionBridge(bridge: SessionGatewayBridge): Promise<void> {
    if (bridge.readyPromise) return await bridge.readyPromise;

    const auth = loadGatewayAuthContext(options.config);
    const role = 'operator';
    const scopes = auth.scopes;
    bridge.manualClose = false;
    bridge.readyPromise = new Promise<void>((resolve, reject) => {
      bridge.resolveReady = resolve;
      bridge.rejectReady = reject;
    });
    bridge.connectRequestId = `connect-${crypto.randomUUID()}`;
    const ws = new WebSocket(options.config.gatewayWsUrl);
    bridge.ws = ws;

    const resolveReady = (): void => {
      const session = getTracevaneSession(bridge.sessionKey)?.row;
      const runtime = session?.runtime || buildRuntimeState(true, false);
      updateRuntimeCache(bridge.sessionKey, {
        ...runtime,
        gatewayConnected: true,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
      broadcastRuntimeUpdate(
        bridge.sessionKey,
        runtime.activeRunId,
        {
          ...runtime,
          gatewayConnected: true,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      );
      const subscriptions: Array<Promise<unknown>> = [
        requestViaBridge<Record<string, unknown>>(bridge, 'sessions.subscribe', {}).catch(() => null),
      ];
      if (selectCanonicalSource(bridge.sessionKey).kind === 'official_canonical_stream') {
        subscriptions.push(
          requestViaBridge<Record<string, unknown>>(bridge, 'sessions.messages.subscribe', { key: bridge.sessionKey }).catch(() => null),
        );
      }
      void Promise.allSettled(subscriptions).then(() => {
        if (!bridge.resolveReady) {
          return;
        }
        bridge.resolveReady();
        bridge.resolveReady = null;
        bridge.rejectReady = null;
        bridge.pendingSignatureRetry = false;
        bridge.signatureRetryBudgetUsed = false;
        bridge.pendingPairingRetry = false;
        bridge.pairingRetryBudgetUsed = false;
      });
    };

    const failReady = (error: unknown): void => {
      if (bridge.readyPromise) {
        bridge.rejectReady?.(error);
        bridge.readyPromise = null;
        bridge.resolveReady = null;
        bridge.rejectReady = null;
      }
    };

    ws.on('message', (raw) => {
      let frame: Record<string, any>;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        ws.send(JSON.stringify(buildGatewayConnectRequest({
          auth,
          connectRequestId: bridge.connectRequestId!,
          nonce: normalizeString(frame.payload?.nonce),
          role,
          scopes,
          signatureVersion: bridge.signatureVersion,
        })));
        return;
      }

      if (frame.type === 'res' && frame.id === bridge.connectRequestId) {
        if (!frame.ok) {
          const connectErrorCode = normalizeString(frame.error?.details?.code || frame.error?.code).toUpperCase();
          bridge.pendingSignatureRetry = false;
          bridge.pendingPairingRetry = false;
          if (connectErrorCode === 'DEVICE_AUTH_SIGNATURE_INVALID' && !bridge.signatureRetryBudgetUsed) {
            bridge.signatureVersion = bridge.signatureVersion === 'v2' ? 'v3' : 'v2';
            bridge.pendingSignatureRetry = true;
            bridge.signatureRetryBudgetUsed = true;
          } else if (connectErrorCode === 'PAIRING_REQUIRED' && !bridge.pairingRetryBudgetUsed) {
            bridge.pairingRetryBudgetUsed = true;
            void maybeAutoApproveTracevaneHelperPairing(options.config)
              .then((approved) => {
                bridge.pendingPairingRetry = approved;
                const error = new ChatServiceError(502, mapGatewayContractError(
                  new Error(normalizeString(frame.error?.message, 'Gateway connect failed')),
                  'Gateway connect failed'
                ));
                failReady(error);
                try { ws.close(); } catch {}
              })
              .catch(() => {
                const error = new ChatServiceError(502, mapGatewayContractError(
                  new Error(normalizeString(frame.error?.message, 'Gateway connect failed')),
                  'Gateway connect failed'
                ));
                failReady(error);
                try { ws.close(); } catch {}
              });
            return;
          }
          const error = new ChatServiceError(502, mapGatewayContractError(
            new Error(normalizeString(frame.error?.message, 'Gateway connect failed')),
            'Gateway connect failed'
          ));
          failReady(error);
          try { ws.close(); } catch {}
          return;
        }
        resolveReady();
        return;
      }

      if (frame.type === 'res' && typeof frame.id === 'string') {
        const pending = bridge.pending.get(frame.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        bridge.pending.delete(frame.id);
        if (!frame.ok) {
          pending.reject(new ChatServiceError(400, mapGatewayContractError(
            new Error(normalizeString(frame.error?.message, 'Gateway request failed')),
            'Gateway request failed'
          )));
          return;
        }
        pending.resolve(frame.payload);
        return;
      }

      if (frame.type === 'event' && frame.event === 'chat') {
        const payload = frame.payload as Record<string, unknown>;
        if (normalizeString(payload?.sessionKey) !== bridge.sessionKey) return;
        const mappedEvents = mapGatewayChatEvent(bridge.sessionKey, payload);
        for (const mapped of mappedEvents) {
          broadcastToSession(bridge.sessionKey, mapped);
        }
        if (
          mappedEvents.some((mapped) => mapped.kind === 'final' || mapped.kind === 'aborted' || mapped.kind === 'error')
          && !shouldKeepBridgeAlive(bridge.sessionKey)
        ) {
          maybeDisposeSessionBridge(bridge.sessionKey);
        }
        return;
      }

      if (frame.type === 'event' && frame.event === 'chat.side_result') {
        const payload = frame.payload as Record<string, unknown>;
        if (normalizeString(payload?.sessionKey) !== bridge.sessionKey) return;
        const mappedEvents = mapGatewayChatSideResultEvent(bridge.sessionKey, payload);
        for (const mapped of mappedEvents) {
          broadcastToSession(bridge.sessionKey, mapped);
        }
        return;
      }

      if (frame.type === 'event' && (frame.event === 'agent' || frame.event === 'session.tool')) {
        const payload = frame.payload as Record<string, unknown>;
        if (!gatewayEventMatchesBridgeSession(bridge, payload)) return;
        const mappedEvents = mapGatewayAgentEvents(bridge.sessionKey, payload);
        for (const mapped of mappedEvents) {
          broadcastToSession(bridge.sessionKey, mapped);
        }
        return;
      }

      if (frame.type === 'event' && frame.event === 'sessions.changed') {
        const payload = frame.payload as Record<string, unknown>;
        if (normalizeString(payload?.sessionKey) !== bridge.sessionKey) return;
        const reason = normalizeString(payload.reason).toLowerCase();
        if (reason !== 'reset' && reason !== 'delete') {
          return;
        }
        const now = new Date().toISOString();
        const current = getTracevaneSession(bridge.sessionKey);
        if (current) {
          current.messages = [];
          current.resetPending = false;
          current.clearedAt = now;
          current.observability = createEmptyObservabilityState();
          current.row = {
            ...clearTracevaneAutoLabel(current.row),
            updatedAt: now,
            lastMessagePreview: null,
            runtime: {
              ...current.row.runtime,
              activeRunId: null,
              state: 'idle',
              lastEventAt: now,
            },
          };
          setTracevaneSession(current);
          saveRegistryEntry(buildRegistryEntryFromRow(current.row));
        }
        historyIndexStore.clearSession(bridge.sessionKey);
        clearRunProjections(bridge.sessionKey);
        shadowStore.clearSession(bridge.sessionKey);
        runShadowStore.clearSession(bridge.sessionKey);
        durableMirrorStore.clearSession(bridge.sessionKey);
        canonicalStates.delete(bridge.sessionKey);
        clearChatStreamReplaySession(streamReplayState, bridge.sessionKey, {
          resetSequence: reason === 'delete',
        });
        if (shouldEmitCanonicalProtocol()) {
          broadcastToSession(bridge.sessionKey, {
            kind: 'canonical.snapshot',
            sessionKey: bridge.sessionKey,
            emittedAt: new Date().toISOString(),
            version: nextCanonicalVersion(bridge.sessionKey, 'history_sse'),
            messages: [],
            overlays: [],
            pageInfo: {
              hasMoreBefore: false,
              beforeCursor: null,
              hasMoreAfter: false,
              afterCursor: null,
            },
            runtime: resolveCanonicalRuntime(bridge.sessionKey),
            source: 'history_sse',
          });
        }
      }

      if (frame.type === 'event' && frame.event === 'session.message') {
        const payload = frame.payload as Record<string, unknown>;
        if (normalizeString(payload?.sessionKey) !== bridge.sessionKey) return;
        handleOfficialCanonicalHistoryEvent(bridge.sessionKey, 'message', payload);
        return;
      }
    });

    const handleDisconnect = (source: 'close' | 'error'): void => {
      const error = new ChatServiceError(502, buildChatError(
        'gateway_down',
        source === 'close' ? 'Gateway bridge disconnected.' : 'Gateway bridge errored.',
        'gateway',
        true
      ));
      rejectBridgePending(bridge, error);
      if (bridge.readyPromise) failReady(error);
      bridge.readyPromise = null;
      bridge.ws = null;
      bridge.connectRequestId = null;
      const runtime = buildRuntimeState(false, Boolean(getTracevaneSession(bridge.sessionKey)?.row.permissions.writable), {
        state: getTracevaneSession(bridge.sessionKey)?.row.runtime.state || 'idle',
        lastErrorCode: 'gateway_down',
        lastErrorMessage: 'Gateway bridge disconnected.',
      });
      updateRuntimeCache(bridge.sessionKey, runtime);
      broadcastRuntimeUpdate(bridge.sessionKey, runtime.activeRunId, runtime);
      const signatureRetryExhausted = bridge.signatureRetryBudgetUsed && !bridge.pendingSignatureRetry;
      const pairingRetryExhausted = bridge.pairingRetryBudgetUsed && !bridge.pendingPairingRetry;
      if (!bridge.manualClose && !signatureRetryExhausted && !pairingRetryExhausted) scheduleBridgeReconnect(bridge);
      else maybeDisposeSessionBridge(bridge.sessionKey);
    };

    ws.on('close', () => handleDisconnect('close'));
    ws.on('error', () => handleDisconnect('error'));

    return await bridge.readyPromise;
  }

  async function ensureSessionBridge(sessionKey: string): Promise<SessionGatewayBridge> {
    const existing = sessionBridges.get(sessionKey);
    if (existing) {
      await connectSessionBridge(existing);
      return existing;
    }
    const bridge = createSessionGatewayBridge(sessionKey);
    sessionBridges.set(sessionKey, bridge);
    try {
      await connectSessionBridge(bridge);
      return bridge;
    } catch (error) {
      sessionBridges.delete(sessionKey);
      throw error;
    }
  }

  async function requestViaSessionBridge<T>(
    sessionKey: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const bridge = await ensureSessionBridge(sessionKey);
    return await requestViaBridge<T>(bridge, method, params);
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || CHAT_API_PATHS.stream, `http://${req.headers.host || '127.0.0.1'}`);
    const sessionKey = url.searchParams.get('sessionKey') || '';
    const bootstrapSnapshotParam = url.searchParams.get('bootstrapSnapshot');
    const includeBootstrapSnapshot = bootstrapSnapshotParam === '1';
    const lastStreamSeq = normalizeChatStreamSeq(url.searchParams.get('lastStreamSeq'));
    const subscribers = frontendSubscribers.get(sessionKey) || new Set<WebSocket>();
    subscribers.add(ws);
    frontendSubscribers.set(sessionKey, subscribers);
    replayBufferedEventsToWebSocket(ws, sessionKey, lastStreamSeq);
    const existingBridge = sessionBridges.get(sessionKey) || createSessionGatewayBridge(sessionKey);
    sessionBridges.set(sessionKey, existingBridge);
    syncBridgeSubscriberCount(sessionKey);
    void ensureSessionBridge(sessionKey).catch(() => {
      // Runtime downgrade will be broadcast by the bridge connect/disconnect handlers.
    });
    ensureOfficialCanonicalStream(sessionKey);

    void (async () => {
      const state = sessionKey ? await resolveSessionStateForAttachEvents(sessionKey) : null;
      const session = state?.row || null;
      const runtime = session?.runtime || buildRuntimeState(await isGatewayConnected(), Boolean(session?.permissions.writable));
      const runtimeEvent: ChatStreamEvent = {
        kind: 'runtime',
        sessionKey,
        runId: null,
        emittedAt: new Date().toISOString(),
        runtime,
      };
      if (ws.readyState === WebSocket.OPEN) {
        const queueEvent: ChatStreamEvent = {
          kind: 'queue.state',
          sessionKey,
          emittedAt: runtimeEvent.emittedAt,
          items: cloneChatQueuedMessageList(state?.pendingQueue || []),
        };
        const controlsEvent = buildSessionControlsEvent(
          sessionKey,
          state?.controls || createDefaultSessionControls(),
          runtimeEvent.emittedAt,
        );
        sendSequencedWebSocketEvent(ws, sessionKey, runtimeEvent);
        sendSequencedWebSocketEvent(ws, sessionKey, queueEvent);
        sendSequencedWebSocketEvent(ws, sessionKey, controlsEvent);
        if (shouldEmitCanonicalProtocol()) {
          const runtimeStateEvent: ChatStreamEvent = {
            kind: 'runtime.state',
            sessionKey,
            runId: null,
            emittedAt: runtimeEvent.emittedAt,
            runtime,
          };
          sendSequencedWebSocketEvent(ws, sessionKey, runtimeStateEvent);
        }
        for (const overlay of listRunOverlaysForSession(sessionKey)) {
          const overlayEvent: ChatStreamEvent = {
            kind: 'run_overlay',
            sessionKey,
            runId: overlay.runId,
            emittedAt: overlay.updatedAt || runtimeEvent.emittedAt,
            overlay,
            terminal: isRunProjectionTerminal(overlay.lifecycle),
          };
          sendSequencedWebSocketEvent(ws, sessionKey, overlayEvent);
        }
        if (
          shouldEmitCanonicalProtocol()
          && (
            includeBootstrapSnapshot
            || (bootstrapSnapshotParam == null && canonicalStates.has(sessionKey))
          )
        ) {
          await bootstrapCanonicalSnapshotForSession(sessionKey, ws);
        }
      }
    })();

    ws.on('close', () => {
      const targets = frontendSubscribers.get(sessionKey);
      if (targets) {
        targets.delete(ws);
        if (targets.size === 0) frontendSubscribers.delete(sessionKey);
      }
      const bridge = sessionBridges.get(sessionKey);
      if (bridge) {
        syncBridgeSubscriberCount(sessionKey);
      }
      if (!shouldKeepOfficialCanonicalStream(sessionKey)) {
        disposeOfficialCanonicalStream(sessionKey);
      }
      maybeDisposeSessionBridge(sessionKey);
    });
  });

  function broadcastImmediateCanonicalUserMessage(
    sessionKey: string,
    message: ChatMessageItem,
    messageSeq: number,
  ): void {
    if (!shouldEmitCanonicalProtocol()) {
      return;
    }
    const currentVersion = canonicalStates.get(sessionKey)?.version;
    broadcastToSession(sessionKey, {
      kind: 'canonical.message',
      sessionKey,
      emittedAt: new Date().toISOString(),
      message: cloneChatMessageItem(message)!,
      messageId: message.id,
      messageSeq,
      version: currentVersion || nextCanonicalVersion(sessionKey, 'tracevane_mirror'),
      source: 'tracevane_bff',
    });
  }

  async function performDirectSend(
    sessionKey: string,
    payload: ChatSendRequest,
    options: {
      publishCanonicalUserMessageImmediately?: boolean;
    } = {},
  ): Promise<ChatSendAck> {
    const session = await requireSession(sessionKey);
    requireWritable(session, 'send');

    const now = new Date().toISOString();
    const requestId = normalizeString(payload.clientRequestId, `tracevane-${crypto.randomUUID()}`);
    const fileRefs = mediaBridge.normalizeSendFileRefs(payload.fileRefs);
    const attachments = mediaBridge.normalizeSendAttachments(payload.attachments);
    const composerDocument = normalizeComposerDocument(payload.composerDocument);
    const composerText = composerDocument.length
      ? serializeComposerDocumentToMarkdown(composerDocument, fileRefs)
      : '';
    const normalizedText = normalizeString(composerText) || normalizeString(payload.text);
    const composerBlocks = composerDocument.length
      ? buildComposerMessageBlocks(composerDocument, fileRefs)
      : [];
    if (!normalizedText && fileRefs.length === 0 && attachments.length === 0) {
      throw new ChatServiceError(400, buildChatError('invalid_request', 'Message text or attachment is required'));
    }
    const transportText = compileGatewayMessageText(normalizedText, fileRefs);
    const sendResources = mediaBridge.buildSendResources(sessionKey, fileRefs, attachments);
    const inMemory = ensureTracevaneSessionState(session, {
      row: session,
      diagnosticsNotes: [],
      materialized: false,
      clearedAt: null,
    });
    const optimisticProjection = ensureRunProjection(sessionKey, requestId, now, {
      lifecycle: 'queued',
    });
    optimisticProjection.lifecycle = pickProjectionLifecycle(optimisticProjection.lifecycle, 'queued');
    optimisticProjection.updatedAt = now;
    saveRunProjection(sessionKey, optimisticProjection);
    const raw = await requestViaSessionBridge<Record<string, unknown>>(sessionKey, 'chat.send', {
      sessionKey,
      message: transportText,
      thinking: normalizeString(payload.thinking || undefined),
      deliver: CHAT_POLICY_DEFAULTS.defaultDeliver,
      idempotencyKey: requestId,
      attachments,
    });
    const rawStatus = normalizeString(raw.status, 'started');
    const status = (CHAT_SEND_STATUS_MAP as Record<string, ChatSendStatus>)[rawStatus] || 'started';
    const ackRunId = normalizeString(raw.runId, requestId);
    unsuppressGatewayRunId(sessionKey, ackRunId);
    const runtime = buildGatewayRuntime(sessionKey, true, {
      activeRunId: status === 'duplicate_completed' ? null : ackRunId,
      state: status === 'duplicate_completed' ? 'completed' : 'running',
      lastAckAt: now,
      lastEventAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    const projection = ensureRunProjection(sessionKey, ackRunId, now, {
      lifecycle: status === 'duplicate_completed' ? 'completed' : 'queued',
    });
    projection.lifecycle = pickProjectionLifecycle(projection.lifecycle, status === 'duplicate_completed' ? 'completed' : 'queued');
    projection.updatedAt = now;
    saveRunProjection(sessionKey, projection);
    persistProjectionIfTerminal(projection);

    shadowStore.saveUserMessageShadow({
      sessionKey,
      requestId,
      runId: ackRunId,
      transportText,
      text: normalizedText,
      blocks: composerBlocks.length ? composerBlocks : undefined,
      fileRefs: fileRefs.length ? fileRefs : undefined,
      resources: sendResources.length ? sendResources : undefined,
      createdAt: now,
    });

    const previewText = extractComposerPlainText(composerDocument).trim() || normalizedText;
    inMemory.messages = normalizeMessageLedger([...inMemory.messages, {
      id: `msg-${crypto.randomUUID()}`,
      role: 'user',
      text: normalizedText,
      createdAt: now,
      source: 'inject',
      runId: ackRunId,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
      blocks: composerBlocks.length ? composerBlocks : undefined,
      resources: sendResources.length ? sendResources : undefined,
    }]);
    const lastMessagePreview = previewText.slice(0, 160)
      || sendResources[0]?.fileName
      || null;
    inMemory.row = {
      ...inMemory.row,
      updatedAt: now,
      lastMessagePreview,
      runtime,
    };
    inMemory.materialized = true;
    inMemory.clearedAt = null;
    refreshTracevaneAutoLabel(inMemory);
    setTracevaneSession(inMemory);
    saveRegistryEntry(buildRegistryEntryFromRow(inMemory.row));
    durableMirrorStore.replaceSnapshot({
      sessionKey,
      version: nextCanonicalVersion(sessionKey, 'tracevane_mirror'),
      source: 'tracevane_mirror',
      messages: currentTracevaneHistory(inMemory),
      baseMessageSeq: inMemory.messages.length,
      savedAt: now,
    });
    if (options.publishCanonicalUserMessageImmediately) {
      const currentMessages = currentTracevaneHistory(inMemory);
      const latestUserMessage = currentMessages[currentMessages.length - 1] || null;
      if (latestUserMessage?.role === 'user') {
        broadcastImmediateCanonicalUserMessage(inMemory.row.key, latestUserMessage, currentMessages.length);
      }
    }

    const ackEvent: ChatStreamEvent = {
      kind: 'ack',
      sessionKey: inMemory.row.key,
      runId: ackRunId,
      requestId,
      emittedAt: now,
      status,
      runtime,
    };
    broadcastToSession(inMemory.row.key, ackEvent);
    broadcastRuntimeUpdate(inMemory.row.key, ackEvent.runId, runtime, now);
    if (selectCanonicalSource(sessionKey).kind === 'local_transcript') {
      setTimeout(() => {
        void syncLocalTranscriptCanonicalSource(sessionKey);
      }, 80);
    }

    return {
      accepted: true,
      sessionKey: inMemory.row.key,
      sessionId: inMemory.row.sessionId,
      requestId,
      runId: ackRunId,
      status,
      runtime,
    };
  }

  async function uploadFileBytesImpl(
    sessionKey: string,
    payload: { fileName: string; content: Buffer; mimeType?: string },
  ): Promise<ChatFileUploadResponse> {
    const session = await requireSession(sessionKey);
    requireWritable(session, 'send');

    const { relativePath, absolutePath } = mediaBridge.saveBufferToWorkspace(
      sessionKey,
      payload.fileName,
      payload.content,
    );

    const stat = safeStatSync(absolutePath);
    if (!stat) {
      throw new ChatServiceError(500, buildChatError('internal_error', 'Failed to save file'));
    }
    const resource = mediaBridge.buildUserUploadResource(sessionKey, relativePath);

    return {
      ok: true,
      relativePath,
      resourceRef: buildTracevaneResourceRefFromRelativePath(resource.relativePath || relativePath) || `workspace:${relativePath}`,
      resource,
      absolutePath,
      fileName: payload.fileName,
      mimeType: payload.mimeType || resource.mimeType,
      kind: resource.kind,
      size: stat.size,
    };
  }

  return {
    async getHealth(): Promise<ChatDiagnostics> {
      return buildHealth([
        'Tracevane backend typed adapter contract is active.',
        'Gateway adapter is wired for tracevane-managed send / abort / reset / ws stream.',
        'Observed external history still falls back to local transcript parsing when gateway history is unavailable.',
      ]);
    },

    async getBootstrap(params: {
      sessionKey?: string | null;
      recentLimit?: number;
      historyLimit?: number;
    } = {}): Promise<ChatBootstrapPayload> {
      const gatewayConnected = await isGatewayConnected();
      const selectedSessionKeyHint = normalizeString(params.sessionKey) || null;
      const sessions = buildLocalSessionCatalog({
        preferredSessionKey: selectedSessionKeyHint,
        recentLimit: params.recentLimit,
      });
      let selectedSessionKey = (
        selectedSessionKeyHint
          ? (sessions.some((row) => row.key === selectedSessionKeyHint) ? selectedSessionKeyHint : null)
          : (sessions.slice().sort(compareBootstrapSessionPreference)[0]?.key || null)
      );
      let bootstrapSessions = sessions;
      if (selectedSessionKeyHint && !selectedSessionKey) {
        try {
          const requestedSession = await requireSession(selectedSessionKeyHint);
          if (requestedSession.permissions.visibleInFrontend) {
            bootstrapSessions = [requestedSession, ...sessions.filter((row) => row.key !== requestedSession.key)];
            selectedSessionKey = requestedSession.key;
          }
        } catch {}
      }
      if (selectedSessionKey) {
        const selectedRow = bootstrapSessions.find((row) => row.key === selectedSessionKey) || null;
        if (selectedRow) {
          bootstrapSessions = [selectedRow, ...bootstrapSessions.filter((row) => row.key !== selectedSessionKey)];
        }
      }
      const diagnostics = createBaseDiagnostics(options.config, gatewayConnected, [
        'Bootstrap payload is local-first and does not wait for gateway session enumeration.',
      ]);
      const organizer = pruneOrganizerStateSessionKeys(
        readOrganizerState(),
        bootstrapSessions
          .filter((row) => row.kind === 'tracevane_managed')
          .map((row) => row.key),
      );

      let history: ChatHistoryPayload | null = null;
      let queue: ChatQueuePayload | null = null;
      let controls: ChatSessionControlsPayload | null = null;

      if (selectedSessionKey) {
        try {
          history = await loadLocalTranscriptBootstrapHistoryWindow(selectedSessionKey, {
            limit: params.historyLimit,
            gatewayConnected,
          });
          if (!history) {
            const snapshot = await loadHistorySnapshot(selectedSessionKey, { localOnly: true });
            const page = paginateMessageList(snapshot.messages, {
              limit: params.historyLimit,
              source: 'history_window',
            });
            const pageOverlays = buildPageOverlaysForMessageWindow(snapshot.overlays, snapshot.messages, page.messages, page.pageInfo);
            const runtimeSummary = buildChatSessionRuntimeSummary(snapshot.runtime);
            const diagnosticsSummary = buildChatDiagnosticsSummary(snapshot.diagnostics);
            history = {
              checkedAt: snapshot.checkedAt,
              session: snapshot.session,
              messages: page.messages,
              overlays: pageOverlays,
              runtime: {
                ...snapshot.runtime,
                state: runtimeSummary.state,
                activeRunId: runtimeSummary.activeRunId,
                gatewayConnected: runtimeSummary.gatewayConnected,
                sessionWritable: runtimeSummary.sessionWritable,
                lastEventAt: runtimeSummary.lastEventAt,
                lastAckAt: runtimeSummary.lastAckAt,
                lastErrorCode: runtimeSummary.lastErrorCode,
              },
              diagnostics: {
                ...snapshot.diagnostics,
                gatewayReachable: diagnosticsSummary.gatewayReachable,
                historyTruncated: diagnosticsSummary.historyTruncated,
                truncationMode: diagnosticsSummary.truncationMode,
              },
              observability: compactObservabilityState(snapshot.observability, {
                toolCardLimit: 6,
                timelineLimit: 8,
                toolDetailLimit: 180,
                timelineDetailLimit: 220,
              }),
              pageInfo: page.pageInfo,
              day: page.day,
            };
          }
          const sessionState = ensureTracevaneSessionState(history.session);
          queue = {
            checkedAt: new Date().toISOString(),
            session: sessionState.row,
            items: cloneChatQueuedMessageList(sessionState.pendingQueue),
          };
          controls = {
            checkedAt: new Date().toISOString(),
            session: sessionState.row,
            globalHostManagementExecEnabled: getTracevaneChatGlobalHostManagementExecEnabled(),
            controls: cloneSessionControls(sessionState.controls),
          };
        } catch (error) {
          diagnostics.notes.push(
            `Local bootstrap could not preload session '${selectedSessionKey}' (${error instanceof Error ? error.message : String(error)}).`,
          );
        }
      }

      return {
        checkedAt: new Date().toISOString(),
        organizer,
        sessions: compactSessionRowsForTransport(bootstrapSessions),
        selectedSessionKey,
        history,
        queue,
        controls,
        diagnostics,
      };
    },

    async getOrganizer(): Promise<ChatOrganizerPayload> {
      return buildOrganizerPayload(readOrganizerState());
    },

    async createFolder(payload: ChatCreateOrganizerFolderRequest): Promise<ChatCreateOrganizerFolderResponse> {
      const title = normalizeString(payload.title);
      if (!title) {
        throw new ChatServiceError(400, buildChatError('invalid_request', 'Folder title must be a non-empty string'));
      }
      const parentId = normalizeString(payload.parentId) || null;
      const currentOrganizer = readOrganizerState();
      if (parentId && !findOrganizerFolder(currentOrganizer, parentId)) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Folder '${parentId}' not found`));
      }
      const created = createFolderInOrganizer(currentOrganizer, title, parentId);
      const organizer = writeOrganizerState(created.organizer);
      const folder = findOrganizerFolder(organizer, created.folder.id);
      if (!folder) {
        throw new ChatServiceError(500, buildChatError('internal_error', 'Folder creation failed'));
      }
      return {
        ok: true,
        folder,
        ...buildOrganizerPayload(organizer),
      };
    },

    async patchFolder(folderId: string, payload: ChatPatchOrganizerFolderRequest): Promise<ChatPatchOrganizerFolderResponse> {
      const organizer = readOrganizerState();
      const existingFolder = findOrganizerFolder(organizer, folderId);
      if (!existingFolder) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Folder '${folderId}' not found`));
      }
      if (
        !Object.prototype.hasOwnProperty.call(payload, 'title')
        && !Object.prototype.hasOwnProperty.call(payload, 'collapsed')
        && !Object.prototype.hasOwnProperty.call(payload, 'move')
      ) {
        throw new ChatServiceError(400, buildChatError('invalid_request', 'Folder patch requires title, collapsed, or move'));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'title') && !normalizeString(payload.title)) {
        throw new ChatServiceError(400, buildChatError('invalid_request', 'Folder title must be a non-empty string'));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'move')) {
        const move = normalizeString(payload.move);
        if (move && !['up', 'down', 'top'].includes(move)) {
          throw new ChatServiceError(400, buildChatError('invalid_request', 'Folder move must be up, down, or top'));
        }
      }
      const patched = patchFolderInOrganizer(organizer, folderId, payload);
      if (!patched.folder) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Folder '${folderId}' not found`));
      }
      const saved = writeOrganizerState(patched.organizer);
      return {
        ok: true,
        folder: patched.folder,
        ...buildOrganizerPayload(saved),
      };
    },

    async deleteFolder(folderId: string): Promise<ChatDeleteOrganizerFolderResponse> {
      const organizer = readOrganizerState();
      const existingFolder = findOrganizerFolder(organizer, folderId);
      if (!existingFolder) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Folder '${folderId}' not found`));
      }
      const saved = writeOrganizerState(deleteFolderFromOrganizer(organizer, folderId));
      return {
        ok: true,
        folderId,
        ...buildOrganizerPayload(saved),
      };
    },

    async assignSessionsToFolder(payload: ChatAssignSessionsToFolderRequest): Promise<ChatAssignSessionsToFolderResponse> {
      const sessionKeys = [...new Set(payload.sessionKeys.map((sessionKey) => normalizeString(sessionKey)).filter(Boolean))];
      if (!sessionKeys.length) {
        throw new ChatServiceError(400, buildChatError('invalid_request', 'At least one session key is required'));
      }
      const folderId = normalizeString(payload.folderId) || null;
      const organizer = readOrganizerState();
      if (folderId && !findOrganizerFolder(organizer, folderId)) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Folder '${folderId}' not found`));
      }
      for (const sessionKey of sessionKeys) {
        const session = await requireSession(sessionKey);
        requireFrontendVisible(session);
        if (session.kind !== 'tracevane_managed' || !session.permissions.writable) {
          throw new ChatServiceError(403, buildChatError('session_not_writable', `Session '${sessionKey}' cannot be organized`));
        }
      }
      const saved = writeOrganizerState(assignSessionsToFolderInOrganizer(organizer, sessionKeys, folderId));
      return {
        ok: true,
        sessionKeys,
        folderId,
        ...buildOrganizerPayload(saved),
      };
    },

    async listSessions(agentId: string, queryOptions: {
      limit?: number;
      includeDerivedTitles?: boolean;
      includeLastMessage?: boolean;
      localOnly?: boolean;
    } = {}): Promise<ChatSessionsPayload> {
      const gatewayConnected = await isGatewayConnected();
      const diagnostics = createBaseDiagnostics(options.config, gatewayConnected, []);
      const sessionListLimit = normalizeHistoryLimit(queryOptions.limit, 200);
      const includeDerivedTitles = queryOptions.includeDerivedTitles !== false;
      const includeLastMessage = queryOptions.includeLastMessage !== false;
      const localOnly = queryOptions.localOnly === true;

      const rows: ChatSessionRow[] = [];
      const seenKeys = new Set<string>();

      if (!localOnly) {
        try {
          const payload = await requestGateway<Record<string, unknown>>(options.config, 'sessions.list', {
            agentId,
            limit: sessionListLimit,
            includeDerivedTitles,
            includeLastMessage,
          });
          const gatewayRows = Array.isArray(payload.sessions) ? payload.sessions : [];
          for (const row of gatewayRows) {
            if (!row || typeof row !== 'object') continue;
            const mapped = mapGatewaySessionRow(agentId, row as Record<string, unknown>, gatewayConnected);
            const registryEntry = getRegistryEntry(mapped.key);
            if (
              mapped.kind === 'tracevane_managed'
            ) {
              if (!registryEntry) {
                saveRegistryEntry(buildRegistryEntryFromRow(mapped));
              } else if (normalizeString(mapped.sessionId) !== normalizeString(registryEntry.sessionId)) {
                saveRegistryEntry(buildRegistryEntryFromRow({
                  ...mapped,
                  updatedAt: mapped.updatedAt || registryEntry.updatedAt,
                }, registryEntry));
              }
            }
            if (mapped.permissions.visibleInFrontend) {
              rows.push(mapped);
              seenKeys.add(mapped.key);
            }
          }
          diagnostics.notes.push('Session list is sourced from Gateway sessions.list and merged with Tracevane draft registry.');
        } catch (error) {
          diagnostics.notes.push(`Gateway sessions.list unavailable; falling back to local session store (${error instanceof Error ? error.message : String(error)}).`);
        }
      } else {
        diagnostics.notes.push('Session list is sourced from Tracevane local session catalog without waiting for Gateway sessions.list.');
      }

      {
        const localCatalogSignature = computeLocalSessionCatalogSignature();
        const catalogSnapshot = sessionCatalogStore.readSnapshot();
        const registry = ensureRegistryLoaded();
        const registryAgentRowCount = Object.values(registry)
          .filter((entry) => normalizeString(entry?.key) && normalizeString(entry?.agentId) === agentId)
          .length;
        const snapshotAgentRows = catalogSnapshot.signature === localCatalogSignature
          ? sessionCatalogStore.readAgentSessions(agentId)
            .filter((row) => row.permissions.visibleInFrontend)
            .sort(compareSessionRowRecency)
          : [];
        const catalogRows = (
          catalogSnapshot.signature === localCatalogSignature
          && (registryAgentRowCount === 0 || snapshotAgentRows.length >= registryAgentRowCount)
        )
          ? snapshotAgentRows
          : buildLocalSessionRowsForAgent(agentId, gatewayConnected);
        for (const row of catalogRows) {
          if (seenKeys.has(row.key)) {
            continue;
          }
          rows.push(row);
          seenKeys.add(row.key);
        }
        if (!localOnly) {
          diagnostics.notes.push('Session list is merged with Tracevane local session catalog so locally registered chats are not dropped by partial Gateway enumeration.');
        }
      }

      rows.sort((left, right) => (right.updatedAt || '').localeCompare(left.updatedAt || ''));
      sessionCatalogStore.replaceAgentSessions(agentId, rows);

      return {
        checkedAt: new Date().toISOString(),
        agentId,
        sessions: compactSessionRowsForTransport(rows),
        diagnostics,
      };
    },

    async getHistory(
      sessionKey: string,
      options: {
        before?: string | null;
        after?: string | null;
        anchor?: string | null;
        limit?: number;
        day?: string | null;
      } = {},
    ): Promise<ChatHistoryPayload> {
      const gatewayConnected = await isGatewayConnected();
      const fastWindow = await loadLocalTranscriptHistoryWindowFast(sessionKey, options, gatewayConnected);
      if (fastWindow) {
        return fastWindow;
      }
      const snapshot = await loadHistorySnapshot(sessionKey);
      historyIndexStore.ensureIndex({
        sessionKey,
        messages: snapshot.messages,
        sourceSessionFile: snapshot.sourceSessionFile,
        sourceMtimeMs: snapshot.sourceMtimeMs,
      });
      const page = paginateMessageList(snapshot.messages, {
        before: options.before,
        after: options.after,
        anchor: options.anchor,
        limit: options.limit,
        day: options.day,
        source: 'history_window',
      });
      const pageOverlays = buildPageOverlaysForMessageWindow(snapshot.overlays, snapshot.messages, page.messages, page.pageInfo);
      const runtimeSummary = buildChatSessionRuntimeSummary(snapshot.runtime);
      const diagnosticsSummary = buildChatDiagnosticsSummary(snapshot.diagnostics);
      return {
        checkedAt: snapshot.checkedAt,
        session: snapshot.session,
        messages: page.messages,
        overlays: pageOverlays,
        runtime: {
          ...snapshot.runtime,
          state: runtimeSummary.state,
          activeRunId: runtimeSummary.activeRunId,
          gatewayConnected: runtimeSummary.gatewayConnected,
          sessionWritable: runtimeSummary.sessionWritable,
          lastEventAt: runtimeSummary.lastEventAt,
          lastAckAt: runtimeSummary.lastAckAt,
          lastErrorCode: runtimeSummary.lastErrorCode,
        },
        diagnostics: {
          ...snapshot.diagnostics,
          gatewayReachable: diagnosticsSummary.gatewayReachable,
          historyTruncated: diagnosticsSummary.historyTruncated,
          truncationMode: diagnosticsSummary.truncationMode,
        },
        observability: snapshot.observability,
        pageInfo: page.pageInfo,
        day: page.day,
      };
    },

    async searchHistory(
      sessionKey: string,
      options: {
        query: string;
        role?: ChatHistorySearchRoleFilter | null;
        content?: ChatHistorySearchContentFilter | null;
        day?: string | null;
        before?: string | null;
        after?: string | null;
        limit?: number;
      },
    ): Promise<ChatHistorySearchPayload> {
      const gatewayConnected = await isGatewayConnected();
      const fastSearch = await searchLocalTranscriptHistoryFast(sessionKey, options, gatewayConnected);
      if (fastSearch) {
        return fastSearch;
      }
      const snapshot = await loadHistorySnapshot(sessionKey);
      const query = normalizeString(options.query);
      const roleFilter = normalizeHistorySearchRoleFilter(options.role);
      const contentFilter = normalizeHistorySearchContentFilter(options.content);
      const index = historyIndexStore.ensureIndex({
        sessionKey,
        messages: snapshot.messages,
        sourceSessionFile: snapshot.sourceSessionFile,
        sourceMtimeMs: snapshot.sourceMtimeMs,
      });
      const positions = historyIndexStore.searchPositions(index, query, {
        roleFilter,
        contentFilter,
      });
      const matchedMessages = positions.map((position) => snapshot.messages[position]!).filter(Boolean);
      const itemByMessageId = new Map(index.items.map((item) => [item.id, item]));
      const page = paginateMessageList(matchedMessages, {
        before: options.before,
        after: options.after,
        day: options.day,
        limit: options.limit,
        source: 'history_search',
        query,
        roleFilter,
        contentFilter,
      });
      const matches: ChatHistorySearchMatch[] = page.messages.map((message) => {
        const item = itemByMessageId.get(message.id);
        return {
          messageId: message.id,
          role: message.role,
          createdAt: message.createdAt || item?.createdAt || null,
          day: item?.dayKey || (normalizeDate(message.createdAt) || '').slice(0, 10) || null,
          snippet: item?.snippetText || item?.previewText || message.text.slice(0, 280),
        };
      });
      const runtimeSummary = buildChatSessionRuntimeSummary(snapshot.runtime);
      const diagnosticsSummary = buildChatDiagnosticsSummary(snapshot.diagnostics);
      const searchSummary = buildHistorySearchSummary({
        query,
        day: page.day,
        roleFilter,
        contentFilter,
        matches,
      });
      return {
        checkedAt: snapshot.checkedAt,
        session: snapshot.session,
        query: searchSummary.query,
        roleFilter,
        contentFilter,
        day: searchSummary.day,
        matches,
        messages: page.messages,
        overlays: buildPageOverlaysForMessageWindow(snapshot.overlays, snapshot.messages, page.messages, page.pageInfo),
        runtime: {
          ...snapshot.runtime,
          state: runtimeSummary.state,
          activeRunId: runtimeSummary.activeRunId,
          gatewayConnected: runtimeSummary.gatewayConnected,
          sessionWritable: runtimeSummary.sessionWritable,
          lastEventAt: runtimeSummary.lastEventAt,
          lastAckAt: runtimeSummary.lastAckAt,
          lastErrorCode: runtimeSummary.lastErrorCode,
        },
        diagnostics: {
          ...snapshot.diagnostics,
          gatewayReachable: diagnosticsSummary.gatewayReachable,
          historyTruncated: diagnosticsSummary.historyTruncated,
          truncationMode: diagnosticsSummary.truncationMode,
          notes: [
            ...snapshot.diagnostics.notes,
            `History search summary: ${searchSummary.totalMatches} matches across ${searchSummary.days.length} day(s).`,
          ],
        },
        pageInfo: page.pageInfo,
      };
    },

    async getHistoryDates(sessionKey: string): Promise<ChatHistoryDatesPayload> {
      const sourceSelection = selectCanonicalSource(sessionKey);
      if (
        sourceSelection.kind === 'local_transcript'
        && sourceSelection.priorSessionFiles.length === 0
      ) {
        const indexSnapshot = historyIndexStore.readSnapshot({
          sessionKey,
          sourceSessionFile: sourceSelection.sessionFile,
          sourceMtimeMs: sourceSelection.sourceMtimeMs,
        });
        if (indexSnapshot) {
          const gatewayConnected = await isGatewayConnected();
          const session = await requireSession(sessionKey, gatewayConnected);
          const diagnostics = await buildHealth([], gatewayConnected);
          diagnostics.notes.push('History dates reused the persisted sqlite/json history index without remapping the transcript.');
          return {
            checkedAt: new Date().toISOString(),
            session,
            diagnostics,
            days: historyIndexStore.buildDateBuckets(indexSnapshot),
          };
        }
        const mirrorMeta = durableMirrorStore.readSessionMeta(sessionKey);
        if (
          mirrorMeta
          && mirrorMeta.sourceSessionFile === sourceSelection.sessionFile
          && (mirrorMeta.sourceMtimeMs ?? null) === (sourceSelection.sourceMtimeMs ?? null)
        ) {
          const days = durableMirrorStore.readDateBuckets(sessionKey)
            .map((bucket) => ({
              day: bucket.day,
              count: bucket.count,
              firstMessageId: bucket.firstMessageId || '',
              lastMessageId: bucket.lastMessageId || '',
            }))
            .filter((bucket) => bucket.firstMessageId && bucket.lastMessageId);
          if (days.length) {
            const gatewayConnected = await isGatewayConnected();
            const session = await requireSession(sessionKey, gatewayConnected);
            const diagnostics = await buildHealth([], gatewayConnected);
            diagnostics.notes.push('History dates reused sqlite durable mirror date buckets without rebuilding the persisted history index or remapping the transcript.');
            return {
              checkedAt: new Date().toISOString(),
              session,
              diagnostics,
              days,
            };
          }
        }
        const seedItems = scanTranscriptIndexSeedItemsFast(sourceSelection.sessionFile);
        if (seedItems?.length) {
          const index = historyIndexStore.ensureIndexFromItems({
            sessionKey,
            items: seedItems,
            totalMessages: seedItems.length,
            sourceSessionFile: sourceSelection.sessionFile,
            sourceMtimeMs: sourceSelection.sourceMtimeMs,
          });
          const gatewayConnected = await isGatewayConnected();
          const session = await requireSession(sessionKey, gatewayConnected);
          const diagnostics = await buildHealth([], gatewayConnected);
          diagnostics.notes.push('History dates rebuilt a persisted sqlite/json history index from a lightweight transcript scan.');
          return {
            checkedAt: new Date().toISOString(),
            session,
            diagnostics,
            days: historyIndexStore.buildDateBuckets(index),
          };
        }
      }
      const snapshot = await loadHistorySnapshot(sessionKey);
      const index = historyIndexStore.ensureIndex({
        sessionKey,
        messages: snapshot.messages,
        sourceSessionFile: snapshot.sourceSessionFile,
        sourceMtimeMs: snapshot.sourceMtimeMs,
      });
      return {
        checkedAt: snapshot.checkedAt,
        session: snapshot.session,
        diagnostics: snapshot.diagnostics,
        days: historyIndexStore.buildDateBuckets(index),
      };
    },

    async createSession(agentId: string, payload: ChatCreateSessionRequest): Promise<ChatCreateSessionResponse> {
      const availableAgents = resolveAvailableAgentIds(options.config);
      if (!availableAgents.includes(agentId)) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Agent '${agentId}' not found`));
      }

      const row = buildTracevaneManagedSessionRow(
        agentId,
        normalizeString(payload.label, buildDefaultSessionLabel(agentId)),
        await isGatewayConnected()
      );

      setTracevaneSession({
        row,
        messages: [],
        diagnosticsNotes: ['Session created by Tracevane shell registry. Gateway session is materialized on first send.'],
        observability: createEmptyObservabilityState(),
        pendingQueue: [],
        controls: createDefaultSessionControls(),
        materialized: false,
        resetPending: false,
        clearedAt: null,
      });
      saveRegistryEntry(buildRegistryEntryFromRow(row));

      return {
        ok: true,
        session: row,
        runtime: row.runtime,
      };
    },

    async patchSession(sessionKey: string, payload: ChatPatchSessionRequest): Promise<ChatPatchSessionResponse> {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);
      if (session.kind !== 'tracevane_managed' || !session.permissions.writable) {
        throw new ChatServiceError(403, buildChatError('session_not_writable', `Session '${session.key}' is not writable`));
      }

      const hasLabel = Object.prototype.hasOwnProperty.call(payload, 'label');
      const hasArchived = Object.prototype.hasOwnProperty.call(payload, 'archived');
      if (!hasLabel && !hasArchived) {
        throw new ChatServiceError(400, buildChatError('invalid_request', 'Session metadata patch requires label or archived'));
      }

      const now = new Date().toISOString();
      let nextLabel = session.label;
      let nextCustomLabel = session.presentation.customLabel;
      if (hasLabel) {
        const normalizedLabel = normalizeString(payload.label);
        if (!normalizedLabel) {
          throw new ChatServiceError(400, buildChatError('invalid_request', 'Session label must be a non-empty string'));
        }
        nextLabel = normalizedLabel;
        nextCustomLabel = normalizedLabel;
      }

      let nextArchivedAt = session.presentation.archivedAt;
      if (hasArchived) {
        if (typeof payload.archived !== 'boolean') {
          throw new ChatServiceError(400, buildChatError('invalid_request', 'Session archived must be a boolean'));
        }
        nextArchivedAt = payload.archived ? now : null;
      }

      const nextSession: ChatSessionRow = {
        ...session,
        label: nextLabel,
        updatedAt: now,
        presentation: {
          archived: Boolean(nextArchivedAt),
          archivedAt: nextArchivedAt,
          customLabel: nextCustomLabel,
          autoLabel: session.presentation.autoLabel ?? null,
        },
      };

      const inMemory = getTracevaneSession(sessionKey);
      if (inMemory) {
        inMemory.row = nextSession;
        setTracevaneSession(inMemory);
      }
      saveRegistryEntry(buildRegistryEntryFromRow(nextSession));

      return {
        ok: true,
        session: nextSession,
      };
    },

    async getQueue(sessionKey: string): Promise<ChatQueuePayload> {
      return await buildQueuePayload(sessionKey);
    },

    async enqueue(sessionKey: string, payload: ChatSendRequest): Promise<ChatQueuePayload> {
      const session = await requireSession(sessionKey);
      requireWritable(session, 'send');
      const state = ensureTracevaneSessionState(session);
      const flushWhenIdle = payload.flushWhenIdle === true;
      state.pendingQueue = [
        ...state.pendingQueue,
        buildQueuedMessageItem(sessionKey, payload),
      ];
      setTracevaneSession(state);
      broadcastQueueState(sessionKey);
      if (flushWhenIdle) {
        void flushQueueIfIdle(sessionKey);
      }
      return await buildQueuePayload(sessionKey);
    },

    async patchQueueEntry(
      sessionKey: string,
      entryId: string,
      payload: ChatPatchQueueEntryRequest,
    ): Promise<ChatQueuePayload> {
      const session = await requireSession(sessionKey);
      requireWritable(session, 'send');
      const normalizedEntryId = normalizeString(entryId);
      if (!normalizedEntryId) {
        throw new ChatServiceError(400, buildChatError('invalid_request', 'Queue entry id is required'));
      }
      const state = ensureTracevaneSessionState(session);
      const index = state.pendingQueue.findIndex((item) => item.id === normalizedEntryId);
      if (index === -1) {
        throw new ChatServiceError(404, buildChatError('session_not_found', `Queue entry '${normalizedEntryId}' not found`));
      }
      const current = state.pendingQueue[index]!;
      const hasTextOverride = Object.prototype.hasOwnProperty.call(payload, 'text');
      const hasComposerOverride = Object.prototype.hasOwnProperty.call(payload, 'composerDocument');
      const next = buildQueuedMessageItem(sessionKey, {
        text: hasTextOverride ? (payload.text || '') : current.text,
        clientRequestId: payload.clientRequestId || current.clientRequestId || undefined,
        composerDocument: hasComposerOverride
          ? payload.composerDocument
          : (hasTextOverride ? undefined : current.composerDocument),
        fileRefs: payload.fileRefs ?? current.fileRefs,
        attachments: payload.attachments ?? current.attachments,
      }, current.createdAt);
      next.id = current.id;
      next.createdAt = current.createdAt;
      next.updatedAt = new Date().toISOString();
      state.pendingQueue = [
        ...state.pendingQueue.slice(0, index),
        next,
        ...state.pendingQueue.slice(index + 1),
      ];
      setTracevaneSession(state);
      broadcastQueueState(sessionKey);
      if (payload.flushWhenIdle === true) {
        void flushQueueIfIdle(sessionKey);
      }
      return await buildQueuePayload(sessionKey);
    },

    async deleteQueueEntry(sessionKey: string, entryId: string): Promise<ChatQueuePayload> {
      const session = await requireSession(sessionKey);
      requireWritable(session, 'send');
      const normalizedEntryId = normalizeString(entryId);
      const state = ensureTracevaneSessionState(session);
      state.pendingQueue = state.pendingQueue.filter((item) => item.id !== normalizedEntryId);
      setTracevaneSession(state);
      broadcastQueueState(sessionKey);
      return await buildQueuePayload(sessionKey);
    },

    async getControls(sessionKey: string): Promise<ChatSessionControlsPayload> {
      return await buildSessionControlsPayload(sessionKey);
    },

    async patchControls(
      sessionKey: string,
      payload: ChatPatchSessionControlsRequest,
    ): Promise<ChatSessionControlsPayload> {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);
      const state = ensureTracevaneSessionState(session);
      state.controls = {
        allowHostManagementExec: payload.allowHostManagementExec === true,
        updatedAt: new Date().toISOString(),
      };
      setTracevaneSession(state);
      await syncSessionControlsToGatewayPolicy(sessionKey, state.controls);
      broadcastSessionControls(sessionKey);
      return await buildSessionControlsPayload(sessionKey);
    },

    async requestSlashGateway(sessionKey: string, payload: ChatSlashGatewayRequest): Promise<unknown> {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);

      const method = normalizeString(payload?.method).toLowerCase();
      const params = normalizeSlashGatewayParams(payload?.params);

      switch (method) {
        case 'models.list':
          return await requestGateway<Record<string, unknown>>(options.config, 'models.list', {});
        case 'skills.status':
          return await requestGateway<Record<string, unknown>>(options.config, 'skills.status', {
            agentId: normalizeString(params.agentId),
          });
        case 'agents.list':
          return await requestGateway<Record<string, unknown>>(options.config, 'agents.list', {});
        case 'sessions.list':
          return await requestGateway<Record<string, unknown>>(options.config, 'sessions.list', {});
        case 'config.get':
          return await requestGateway<Record<string, unknown>>(options.config, 'config.get', {});
        case 'config.schema.lookup':
          return await requestGateway<Record<string, unknown>>(options.config, 'config.schema.lookup', {
            path: normalizeString(params.path),
          });
        case 'exec.approvals.get':
          return await requestGateway<Record<string, unknown>>(options.config, 'exec.approvals.get', {});
        case 'exec.approvals.set':
          return await requestGateway<Record<string, unknown>>(options.config, 'exec.approvals.set', {
            baseHash: normalizeString(params.baseHash),
            file: params.file,
          });
        case 'exec.approvals.node.get':
          return await requestGateway<Record<string, unknown>>(options.config, 'exec.approvals.node.get', {
            nodeId: normalizeString(params.nodeId),
          });
        case 'exec.approvals.node.set':
          return await requestGateway<Record<string, unknown>>(options.config, 'exec.approvals.node.set', {
            nodeId: normalizeString(params.nodeId),
            baseHash: normalizeString(params.baseHash),
            file: params.file,
          });
        case 'tools.effective':
          return await requestGateway<Record<string, unknown>>(options.config, 'tools.effective', {
            sessionKey,
          });
        case 'sessions.compact':
          requireWritable(session, 'send');
          return await requestGateway<Record<string, unknown>>(options.config, 'sessions.compact', {
            key: sessionKey,
          });
        case 'sessions.patch': {
          requireWritable(session, 'send');
          return await requestGateway<Record<string, unknown>>(options.config, 'sessions.patch', {
            ...params,
            key: sessionKey,
          });
        }
        case 'sessions.steer': {
          requireWritable(session, 'send');
          const targetKey = resolveSlashGatewayTargetKey(session, params);
          return await requestGateway<Record<string, unknown>>(options.config, 'sessions.steer', {
            ...params,
            key: targetKey,
          });
        }
        case 'chat.abort': {
          requireWritable(session, 'abort');
          const targetKey = resolveSlashGatewayTargetKey(session, params);
          return await requestGateway<Record<string, unknown>>(options.config, 'chat.abort', {
            sessionKey: targetKey,
          });
        }
        case 'chat.send': {
          requireWritable(session, 'send');
          const targetKey = resolveSlashGatewayTargetKey(session, params);
          return await requestGateway<Record<string, unknown>>(options.config, 'chat.send', {
            ...params,
            sessionKey: targetKey,
          });
        }
        default:
          throw new ChatServiceError(
            400,
            buildChatError('invalid_request', `Unsupported Tracevane slash gateway method '${method || '<empty>'}'`),
          );
      }
    },

    async send(sessionKey: string, payload: ChatSendRequest): Promise<ChatSendAck> {
      return await performDirectSend(sessionKey, payload);
    },

    async resolveResourceRefs(sessionKey: string, payload: ChatResourceResolveRequest): Promise<ChatResourceResolveResponse> {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);

      const refs = Array.isArray(payload.refs)
        ? payload.refs
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
          .slice(0, 100)
        : [];

      return {
        ok: true,
        sessionKey: session.key,
        resources: refs.map((ref) => ({
          ref,
          ...mediaBridge.resolveResourceRef(sessionKey, ref),
        })),
      };
    },

    async resolveMedia(sessionKey: string, mediaId: string): Promise<ResolvedChatMedia> {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);

      const resolved = mediaBridge.resolveMedia(sessionKey, mediaId);
      if (!resolved) {
        throw new ChatServiceError(404, buildChatError('session_not_found', 'Media resource not found'));
      }

      return resolved;
    },

    async deleteSession(sessionKey: string): Promise<ChatDeleteSessionResponse> {
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);
      requireWritable(session, 'delete');
      if (session.kind !== 'tracevane_managed') {
        throw new ChatServiceError(403, buildChatError('session_not_writable', `Session '${session.key}' is not writable`));
      }

      const materialized = await isTracevaneSessionMaterialized(session);
      if (materialized) {
        await requestGateway(options.config, 'sessions.delete', {
          key: session.key,
          deleteTranscript: true,
          emitLifecycleHooks: false,
        });
      }

      removeLocalSessionRecord(session.key);
      clearSessionCaches(session.key);

      return {
        ok: true,
        sessionKey: session.key,
      };
    },

    async abort(sessionKey: string): Promise<ChatAbortResponse> {
      const session = await requireSession(sessionKey);
      requireWritable(session, 'abort');

      const inMemory = getTracevaneSession(sessionKey);
      if (!inMemory) {
        throw new ChatServiceError(403, buildChatError('session_not_writable', 'Only tracevane-managed sessions can be aborted in the current backend gate'));
      }

      const raw = await requestViaSessionBridge<Record<string, unknown>>(sessionKey, 'chat.abort', {
        sessionKey,
      });
      const runIds = Array.isArray(raw.runIds) ? raw.runIds.map((item: unknown) => String(item)) : [];
      const localActiveRunId = inMemory.row.runtime.activeRunId || session.runtime.activeRunId || null;
      const hadActiveRun = runIds.length > 0 || raw.aborted === true || Boolean(localActiveRunId);
      const abortRunId = runIds[0] || localActiveRunId;
      inMemory.row = {
        ...inMemory.row,
        runtime: buildGatewayRuntime(sessionKey, true, {
          activeRunId: null,
          state: hadActiveRun ? 'aborted' : 'idle',
          lastEventAt: new Date().toISOString(),
          lastErrorCode: hadActiveRun ? null : 'no_active_run',
          lastErrorMessage: hadActiveRun ? null : 'No active run to abort.',
        }),
      };
      setTracevaneSession(inMemory);
      broadcastRuntimeUpdate(sessionKey, abortRunId, inMemory.row.runtime);
      if (hadActiveRun) {
        void flushQueueIfIdle(sessionKey);
      }

      return {
        ok: true,
        sessionKey: inMemory.row.key,
        hadActiveRun,
        aborted: hadActiveRun,
        runIds,
        runtime: inMemory.row.runtime,
      };
    },

    async reset(sessionKey: string): Promise<ChatResetResponse> {
      const session = await requireSession(sessionKey);
      requireWritable(session, 'reset');

      const inMemory = getTracevaneSession(sessionKey);
      if (!inMemory) {
        throw new ChatServiceError(403, buildChatError('session_not_writable', 'Only tracevane-managed sessions can be reset in the current backend gate'));
      }

      const runtimeBeforeReset = {
        ...inMemory.row.runtime,
      };
      const activeRunIdBeforeReset = normalizeString(runtimeBeforeReset.activeRunId || session.runtime.activeRunId) || null;
      suppressGatewayRunId(sessionKey, activeRunIdBeforeReset);

      inMemory.messages = [];
      inMemory.resetPending = true;
      inMemory.clearedAt = new Date().toISOString();
      inMemory.observability = createEmptyObservabilityState();
      inMemory.pendingQueue = [];
      shadowStore.clearSession(sessionKey);
      runShadowStore.clearSession(sessionKey);
      durableMirrorStore.clearSession(sessionKey);
      historyIndexStore.clearSession(sessionKey);
      clearRunProjections(sessionKey);
      canonicalStates.delete(sessionKey);
      clearChatStreamReplaySession(streamReplayState, sessionKey);
      inMemory.row = {
        ...clearTracevaneAutoLabel(inMemory.row),
        updatedAt: new Date().toISOString(),
        lastMessagePreview: null,
        runtime: buildGatewayRuntime(sessionKey, true, {
          activeRunId: null,
          state: 'idle',
          lastEventAt: null,
          lastAckAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        }),
      };
      setTracevaneSession(inMemory);
      broadcastQueueState(sessionKey);
      saveRegistryEntry({
        ...buildRegistryEntryFromRow(inMemory.row),
        createdAt: getRegistryEntry(inMemory.row.key)?.createdAt || inMemory.row.updatedAt || new Date().toISOString(),
      });
      broadcastRuntimeUpdate(sessionKey, null, inMemory.row.runtime);

      const shouldAttemptAbort = Boolean(
        activeRunIdBeforeReset
        || runtimeBeforeReset.state === 'running'
        || runtimeBeforeReset.state === 'streaming'
        || session.runtime.state === 'running'
        || session.runtime.state === 'streaming'
      );
      if (shouldAttemptAbort) {
        try {
          await requestViaSessionBridge<Record<string, unknown>>(sessionKey, 'chat.abort', {
            sessionKey,
          });
        } catch (error) {
          const code = mapGatewayContractError(error, 'chat.abort failed before sessions.reset').code;
          if (code !== 'no_active_run' && code !== 'session_not_found' && code !== 'gateway_down') {
            inMemory.resetPending = false;
            setTracevaneSession(inMemory);
            throw error;
          }
        }
      }

      try {
        await requestGateway(options.config, 'sessions.reset', {
          key: sessionKey,
          reason: 'reset',
        }, {
          // Gateway reset can spend up to 15s waiting for run cleanup before responding.
          timeoutMs: 30_000,
        });
      } catch (error) {
        if (mapGatewayContractError(error, 'sessions.reset failed').code !== 'session_not_found') {
          inMemory.resetPending = false;
          setTracevaneSession(inMemory);
          throw error;
        }
      }

      inMemory.resetPending = false;
      setTracevaneSession(inMemory);

      return {
        ok: true,
        session: inMemory.row,
        runtime: inMemory.row.runtime,
      };
    },

    async uploadFile(sessionKey: string, payload: ChatFileUploadRequest): Promise<ChatFileUploadResponse> {
      return uploadFileBytesImpl(sessionKey, {
        fileName: payload.fileName,
        content: Buffer.from(payload.content.replace(/^data:[^;]+;base64,/i, ''), 'base64'),
        mimeType: payload.mimeType,
      });
    },

    async uploadFileBytes(sessionKey: string, payload: { fileName: string; content: Buffer; mimeType?: string }): Promise<ChatFileUploadResponse> {
      return uploadFileBytesImpl(sessionKey, payload);
    },

    async attachGatewayClient(
      payload: ChatGatewayAttachPayload,
      runtime: ChatGatewayRuntime,
    ): Promise<ChatGatewayAttachResponse> {
      const sessionKey = normalizeString(payload.sessionKey);
      if (!sessionKey) {
        throw new Error('sessionKey is required');
      }
      const session = await requireSession(sessionKey);
      requireFrontendVisible(session);
      registerGatewaySubscriber(sessionKey, runtime);
      ensureOfficialCanonicalStream(sessionKey);
      void ensureSessionBridge(sessionKey).catch(() => {
        // Runtime downgrade will be broadcast by the bridge connect/disconnect handlers.
      });
      return {
        sessionKey,
        leaseTtlMs: CHAT_GATEWAY_LEASE_MS,
        events: [
          ...listChatStreamEventsAfter(
            streamReplayState,
            sessionKey,
            normalizeChatStreamSeq(payload.lastStreamSeq),
          ),
          ...await buildGatewayAttachEvents(sessionKey, {
            includeSnapshot: payload.bootstrapSnapshot === true,
          }),
        ],
      };
    },

    heartbeatGatewayClient(
      payload: ChatGatewayHeartbeatPayload,
      runtime: Pick<ChatGatewayRuntime, 'connId'>,
    ): ChatGatewayAckResponse {
      const sessionKey = normalizeString(payload.sessionKey);
      if (!sessionKey) {
        throw new Error('sessionKey is required');
      }
      requireGatewaySubscriber(sessionKey, runtime.connId);
      return {
        ok: true,
        sessionKey,
      };
    },

    detachGatewayClient(
      payload: ChatGatewayDetachPayload,
      runtime: Pick<ChatGatewayRuntime, 'connId'>,
    ): ChatGatewayAckResponse {
      const sessionKey = normalizeString(payload.sessionKey) || detachGatewayConnId(runtime.connId) || '';
      if (payload.sessionKey) {
        detachGatewayConnId(runtime.connId, sessionKey);
      }
      return {
        ok: true,
        sessionKey,
      };
    },

    async openEventStream(
      sessionKey: string,
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ): Promise<void> {
      const normalizedSessionKey = normalizeString(sessionKey);
      if (!normalizedSessionKey) {
        throw new Error('sessionKey is required');
      }
      const session = await requireSession(normalizedSessionKey);
      requireFrontendVisible(session);

      startSse(res);
      registerFrontendSseSubscriber(normalizedSessionKey, res);
      ensureOfficialCanonicalStream(normalizedSessionKey);
      void ensureSessionBridge(normalizedSessionKey).catch(() => {
        // Runtime downgrade will be broadcast by the bridge connect/disconnect handlers.
      });
      sendSseEvent(res, 'ready', {
        ok: true,
        sessionKey: normalizedSessionKey,
        connectedAt: new Date().toISOString(),
      });
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      replayBufferedEventsToSse(
        res,
        normalizedSessionKey,
        normalizeChatStreamSeq(url.searchParams.get('lastStreamSeq')),
      );
      await emitBootstrapEventsToSse(normalizedSessionKey, res, {
        includeSnapshot: url.searchParams.get('bootstrapSnapshot') === '1',
      });

      const heartbeat = setInterval(() => {
        if (res.writableEnded || res.destroyed) {
          clearInterval(heartbeat);
          return;
        }
        res.write(': ping\n\n');
      }, 15_000);
      heartbeat.unref?.();

      const cleanup = () => {
        clearInterval(heartbeat);
        unregisterFrontendSseSubscriber(normalizedSessionKey, res);
        if (!shouldKeepOfficialCanonicalStream(normalizedSessionKey)) {
          disposeOfficialCanonicalStream(normalizedSessionKey);
        }
        maybeDisposeSessionBridge(normalizedSessionKey);
      };
      req.on('close', cleanup);
      req.on('aborted', cleanup);
      res.on('close', cleanup);
    },

    handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean {
      const url = new URL(req.url || CHAT_API_PATHS.stream, `http://${req.headers.host || '127.0.0.1'}`);
      if (!isTracevaneChatWsPath(url.pathname)) return false;
      const sessionKey = normalizeString(url.searchParams.get('sessionKey'));
      if (!sessionKey) {
        try { socket.destroy(); } catch {}
        return true;
      }

      if (req.headers.origin && !resolveTracevaneChatCorsOrigin(req)) {
        try { socket.destroy(); } catch {}
        return true;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return true;
    },

    dispose(): void {
      clearInterval(gatewaySweepTimer);
      gatewaySubscribers.clear();
      for (const subscribers of frontendSseSubscribers.values()) {
        for (const res of subscribers) {
          try { res.end(); } catch {}
        }
      }
      frontendSseSubscribers.clear();
      for (const sessionKey of Array.from(officialCanonicalStreams.keys())) {
        disposeOfficialCanonicalStream(sessionKey);
      }
      for (const sessionKey of Array.from(sessionBridges.keys())) {
        disposeSessionBridge(sessionKey);
      }
      try { wss.close(); } catch {}
    },
  };
}
