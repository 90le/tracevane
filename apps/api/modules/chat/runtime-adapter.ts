import type { ChatRuntimeAdapterKind, ChatSendAttachment, ChatSendStatus } from '../../../../types/chat.js';
import { CHAT_SEND_STATUS_MAP } from './contract.js';
import { normalizeString } from './shared.js';


export interface ChatRuntimeSendInput {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver: boolean;
  idempotencyKey: string;
  attachments: ChatSendAttachment[];
}

export interface ChatRuntimeSendResult {
  status: ChatSendStatus;
  runId: string;
  raw: Record<string, unknown>;
}

export interface ChatRuntimeAbortInput {
  sessionKey: string;
}

export interface ChatRuntimeAbortResult {
  aborted: boolean;
  runIds: string[];
  raw: Record<string, unknown>;
}

export interface ChatRuntimeResetInput {
  sessionKey: string;
  reason: string;
}

export interface ChatRuntimeResetResult {
  ok: boolean;
  raw: Record<string, unknown>;
}

export interface ChatRuntimeDeleteInput {
  sessionKey: string;
  deleteTranscript: boolean;
}

export interface ChatRuntimeDeleteResult {
  ok: boolean;
  raw: Record<string, unknown>;
}

export interface ChatRuntimeListSessionsInput {
  agentId: string;
  limit: number;
  includeDerivedTitles: boolean;
  includeLastMessage: boolean;
}

export interface ChatRuntimeListSessionsResult {
  sessions: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

export interface ChatRuntimeHistoryInput {
  sessionKey: string;
  limit: number;
}

export interface ChatRuntimeHistoryResult {
  messages: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

export interface ChatRuntimeAdapter {
  kind: ChatRuntimeAdapterKind;
  send(input: ChatRuntimeSendInput): Promise<ChatRuntimeSendResult>;
  abort(input: ChatRuntimeAbortInput): Promise<ChatRuntimeAbortResult>;
  reset(input: ChatRuntimeResetInput): Promise<ChatRuntimeResetResult>;
  deleteSession(input: ChatRuntimeDeleteInput): Promise<ChatRuntimeDeleteResult>;
  listSessions(input: ChatRuntimeListSessionsInput): Promise<ChatRuntimeListSessionsResult>;
  readHistory(input: ChatRuntimeHistoryInput): Promise<ChatRuntimeHistoryResult>;
}

export function normalizeChatRuntimeSendResult(
  raw: Record<string, unknown>,
  fallbackRunId: string,
): ChatRuntimeSendResult {
  const rawStatus = normalizeString(raw.status, 'started');
  return {
    status: (CHAT_SEND_STATUS_MAP as Record<string, ChatSendStatus>)[rawStatus] || 'started',
    runId: normalizeString(raw.runId, fallbackRunId),
    raw,
  };
}

export function normalizeChatRuntimeAbortResult(raw: Record<string, unknown>): ChatRuntimeAbortResult {
  const runIds = Array.isArray(raw.runIds)
    ? raw.runIds.map((item: unknown) => String(item)).filter(Boolean)
    : [];
  return {
    aborted: raw.aborted === true || runIds.length > 0,
    runIds,
    raw,
  };
}

export function normalizeChatRuntimeResetResult(raw: Record<string, unknown>): ChatRuntimeResetResult {
  return {
    ok: raw.ok !== false,
    raw,
  };
}

export function normalizeChatRuntimeDeleteResult(raw: Record<string, unknown>): ChatRuntimeDeleteResult {
  return {
    ok: raw.ok !== false,
    raw,
  };
}

export function normalizeChatRuntimeListSessionsResult(raw: Record<string, unknown>): ChatRuntimeListSessionsResult {
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  return {
    sessions,
    raw,
  };
}

export function normalizeChatRuntimeHistoryResult(raw: Record<string, unknown>): ChatRuntimeHistoryResult {
  const messages = Array.isArray(raw.messages)
    ? raw.messages.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  return {
    messages,
    raw,
  };
}
