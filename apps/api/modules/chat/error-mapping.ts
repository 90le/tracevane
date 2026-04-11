import type { ChatContractErrorCode } from '../../../../types/chat.js';

export const CHAT_GATEWAY_ERROR_CODE_MAP: Record<string, ChatContractErrorCode> = {
  AUTH_REQUIRED: 'auth_failure',
  AUTH_UNAUTHORIZED: 'auth_failure',
  AUTH_TOKEN_MISSING: 'auth_failure',
  AUTH_TOKEN_MISMATCH: 'auth_failure',
  AUTH_PASSWORD_MISSING: 'auth_failure',
  AUTH_PASSWORD_MISMATCH: 'auth_failure',
  PAIRING_REQUIRED: 'auth_failure',
  DEVICE_IDENTITY_REQUIRED: 'auth_failure',
  CONTROL_UI_DEVICE_IDENTITY_REQUIRED: 'auth_failure',
  INVALID_REQUEST: 'invalid_request',
} as const;

export const CHAT_GATEWAY_CLOSE_CODE_MAP: Record<number, ChatContractErrorCode> = {
  1000: 'gateway_down',
  1008: 'auth_failure',
};

export const CHAT_GATEWAY_ERROR_MESSAGE_RULES: Array<{
  pattern: RegExp;
  code: ChatContractErrorCode;
}> = [
  { pattern: /session not found/i, code: 'session_not_found' },
  { pattern: /not writable|read-only|read only/i, code: 'session_not_writable' },
  { pattern: /must have required property 'idempotencyKey'/i, code: 'invalid_request' },
  { pattern: /no active run|no matching run/i, code: 'no_active_run' },
  { pattern: /in_flight/i, code: 'duplicate_in_flight' },
  { pattern: /gateway closed|connect failed|not connected/i, code: 'gateway_down' },
];

export const CHAT_HISTORY_TRUNCATION_MARKERS = [
  '[chat.history omitted: message too large]',
  '...(truncated)...',
] as const;
