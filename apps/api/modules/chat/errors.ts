import type { ChatContractError, ChatContractErrorCode } from '../../../../types/chat.js';
import { CHAT_GATEWAY_ERROR_MESSAGE_RULES } from './error-mapping.js';

export function buildChatError(
  code: ChatContractErrorCode,
  message: string,
  source: ChatContractError['source'] = 'studio',
  retryable = false
): ChatContractError {
  return {
    code,
    message,
    source,
    retryable,
  };
}

export class ChatServiceError extends Error {
  readonly statusCode: number;
  readonly contractError: ChatContractError;

  constructor(statusCode: number, contractError: ChatContractError) {
    super(contractError.message);
    this.statusCode = statusCode;
    this.contractError = contractError;
  }

  toShape(): { statusCode: number; error: ChatContractError } {
    return {
      statusCode: this.statusCode,
      error: this.contractError,
    };
  }
}

export function isChatServiceError(error: unknown): error is ChatServiceError {
  return error instanceof ChatServiceError;
}

export function mapGatewayContractError(error: unknown, fallbackMessage: string): ChatContractError {
  const text = error instanceof Error ? error.message : String(error || fallbackMessage);

  for (const rule of CHAT_GATEWAY_ERROR_MESSAGE_RULES) {
    if (rule.pattern.test(text)) {
      return buildChatError(rule.code, text, 'gateway', rule.code === 'gateway_down');
    }
  }

  return buildChatError('internal_error', text || fallbackMessage, 'gateway', false);
}
