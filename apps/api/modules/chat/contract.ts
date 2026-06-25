import type {
  ChatContractErrorCode,
  ChatProtocolMode,
  ChatSendStatus,
  ChatSessionKind,
  ChatStreamEvent,
} from '../../../../types/chat.js';

export const CHAT_API_PATHS = {
  health: '/api/chat/health',
  sessionsByAgent: '/api/chat/agents/:agentId/sessions',
  createSessionByAgent: '/api/chat/agents/:agentId/sessions',
  historyBySession: '/api/chat/sessions/:sessionKey/history',
  searchBySession: '/api/chat/sessions/:sessionKey/search',
  datesBySession: '/api/chat/sessions/:sessionKey/dates',
  queueBySession: '/api/chat/sessions/:sessionKey/queue',
  queueEntryBySession: '/api/chat/sessions/:sessionKey/queue/:entryId',
  sendBySession: '/api/chat/sessions/:sessionKey/send',
  resourcesResolveBySession: '/api/chat/sessions/:sessionKey/resources/resolve',
  mediaBySession: '/api/chat/sessions/:sessionKey/media/:mediaId',
  abortBySession: '/api/chat/sessions/:sessionKey/abort',
  resetBySession: '/api/chat/sessions/:sessionKey/reset',
  stream: '/ws/chat',
} as const;

export const CHAT_SESSION_KINDS: readonly ChatSessionKind[] = [
  'tracevane_managed',
  'observed_external',
  'system_internal',
] as const;

export const CHAT_PROTOCOL_MODES: readonly ChatProtocolMode[] = [
  'legacy',
  'dual_write',
  'canonical_v1',
] as const;

export const CHAT_PROTOCOL_MODE_DEFAULT: ChatProtocolMode = 'canonical_v1';

export const CHAT_MVP_STREAM_EVENT_KINDS: ReadonlyArray<ChatStreamEvent['kind']> = [
  'queue.state',
  'side_result',
  'ack',
  'run_overlay',
  'delta',
  'final',
  'aborted',
  'error',
  'runtime',
] as const;

export const CHAT_PHASE2_STREAM_EVENT_KINDS: ReadonlyArray<ChatStreamEvent['kind']> = [
  'canonical.snapshot',
  'canonical.message',
  'queue.state',
  'side_result',
  'temporary.assistant',
  'temporary.tool',
  'runtime.state',
  'agent_lifecycle',
  'agent_assistant',
  'agent_tool_call',
  'agent_tool_result',
] as const;

export const CHAT_PHASE2_GATEWAY_STREAMS = [
  'lifecycle',
  'assistant',
  'tool',
  'item',
  'command_output',
] as const;

export const CHAT_SEND_STATUS_MAP = {
  started: 'started',
  in_flight: 'duplicate_in_flight',
  ok: 'duplicate_completed',
} as const satisfies Record<string, ChatSendStatus>;

export const CHAT_ERROR_CODES: readonly ChatContractErrorCode[] = [
  'gateway_down',
  'auth_failure',
  'session_not_found',
  'session_not_writable',
  'history_truncated',
  'duplicate_in_flight',
  'no_active_run',
  'invalid_request',
  'internal_error',
] as const;
