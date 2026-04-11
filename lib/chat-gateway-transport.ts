import type {
  ChatAbortResponse,
  ChatRuntimeState,
  ChatSendAck,
  ChatSendFileRef,
  ChatSendStatus,
} from '../types/chat.js';

const CHAT_SEND_STATUS_MAP: Record<string, ChatSendStatus> = {
  started: 'started',
  in_flight: 'duplicate_in_flight',
  ok: 'duplicate_completed',
};

export function formatGatewayFileRef(relativePath: string): string {
  return /\s/.test(relativePath) ? `@"${relativePath}"` : `@${relativePath}`;
}

export function compileGatewayMessageText(textValue: string, fileRefs: ChatSendFileRef[]): string {
  const refs = fileRefs
    .map((item) => item.relativePath?.trim())
    .filter((value): value is string => Boolean(value))
    .map((relativePath) => formatGatewayFileRef(relativePath));
  if (!refs.length) {
    return textValue;
  }
  if (!textValue) {
    return refs.join(' ');
  }
  return `${refs.join(' ')}\n---\n${textValue}`;
}

export function buildGatewayDirectSendAck(params: {
  sessionKey: string;
  sessionId: string | null;
  requestId: string;
  createdAt: string;
  rawStatus?: string | null;
  rawRunId?: string | null;
  sessionWritable?: boolean;
}): ChatSendAck {
  const status = CHAT_SEND_STATUS_MAP[String(params.rawStatus || '').trim()] || 'started';
  const runId = String(params.rawRunId || '').trim() || params.requestId;
  return {
    accepted: true,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    requestId: params.requestId,
    runId,
    status,
    runtime: {
      gatewayConnected: true,
      sessionWritable: params.sessionWritable !== false,
      activeRunId: status === 'duplicate_completed' ? null : runId,
      state: status === 'duplicate_completed' ? 'completed' : 'running',
      lastEventAt: params.createdAt,
      lastAckAt: params.createdAt,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  };
}

export function buildGatewayDirectAbortResponse(params: {
  sessionKey: string;
  runIds?: string[];
  aborted?: boolean;
  emittedAt: string;
  lastAckAt?: string | null;
  sessionWritable?: boolean;
}): ChatAbortResponse {
  const runIds = Array.isArray(params.runIds) ? params.runIds.filter(Boolean) : [];
  const hadActiveRun = runIds.length > 0 || params.aborted === true;
  const runtime: ChatRuntimeState = {
    gatewayConnected: true,
    sessionWritable: params.sessionWritable !== false,
    activeRunId: null,
    state: hadActiveRun ? 'aborted' : 'idle',
    lastEventAt: params.emittedAt,
    lastAckAt: params.lastAckAt || null,
    lastErrorCode: hadActiveRun ? null : 'no_active_run',
    lastErrorMessage: hadActiveRun ? null : 'There is no active run to abort.',
  };
  return {
    ok: true,
    sessionKey: params.sessionKey,
    hadActiveRun,
    aborted: hadActiveRun,
    runIds,
    runtime,
  };
}
