import type { ChatSendAttachment, ChatSendStatus } from '../../../../types/chat.js';
import { CHAT_SEND_STATUS_MAP } from './contract.js';
import { normalizeString } from './shared.js';

export type ChatRuntimeAdapterKind = 'openclaw-gateway' | 'native-cli';

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

export interface ChatRuntimeAdapter {
  kind: ChatRuntimeAdapterKind;
  send(input: ChatRuntimeSendInput): Promise<ChatRuntimeSendResult>;
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
