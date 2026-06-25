import type { TracevaneServerConfig } from '../../../../../types/api.js';
import type {
  ChatRuntimeAdapter,
  ChatRuntimeAbortInput,
  ChatRuntimeDeleteInput,
  ChatRuntimeHistoryInput,
  ChatRuntimeListSessionsInput,
  ChatRuntimeResetInput,
  ChatRuntimeSendInput,
} from '../runtime-adapter.js';
import {
  normalizeChatRuntimeAbortResult,
  normalizeChatRuntimeDeleteResult,
  normalizeChatRuntimeHistoryResult,
  normalizeChatRuntimeListSessionsResult,
  normalizeChatRuntimeResetResult,
  normalizeChatRuntimeSendResult,
} from '../runtime-adapter.js';
import { requestGateway } from './gateway-request.js';

export type OpenClawSessionBridgeRequester = <T>(
  sessionKey: string,
  method: string,
  params: Record<string, unknown>,
) => Promise<T>;

export interface OpenClawGatewayRuntimeAdapterOptions {
  config: TracevaneServerConfig;
  requestViaSessionBridge: OpenClawSessionBridgeRequester;
}

/**
 * OpenClaw Gateway compatibility adapter for unified Chat.
 *
 * This is intentionally isolated from ChatService's generic orchestration so
 * native CLI runtimes and future platform runtimes do not accidentally depend
 * on OpenClaw raw RPCs or session bridge semantics.
 */
export function createOpenClawGatewayChatRuntimeAdapter(
  options: OpenClawGatewayRuntimeAdapterOptions,
): ChatRuntimeAdapter {
  return {
    kind: 'openclaw-gateway',
    async send(input: ChatRuntimeSendInput) {
      const raw = await options.requestViaSessionBridge<Record<string, unknown>>(input.sessionKey, 'chat.send', {
        sessionKey: input.sessionKey,
        message: input.message,
        thinking: input.thinking,
        deliver: input.deliver,
        idempotencyKey: input.idempotencyKey,
        attachments: input.attachments,
      });
      return normalizeChatRuntimeSendResult(raw, input.idempotencyKey);
    },
    async abort(input: ChatRuntimeAbortInput) {
      const raw = await options.requestViaSessionBridge<Record<string, unknown>>(input.sessionKey, 'chat.abort', {
        sessionKey: input.sessionKey,
      });
      return normalizeChatRuntimeAbortResult(raw);
    },
    async reset(input: ChatRuntimeResetInput) {
      const raw = await requestGateway(options.config, 'sessions.reset', {
        key: input.sessionKey,
        reason: input.reason,
      }, {
        // Gateway reset can spend up to 15s waiting for run cleanup before responding.
        timeoutMs: 30_000,
      });
      return normalizeChatRuntimeResetResult(raw as Record<string, unknown>);
    },
    async deleteSession(input: ChatRuntimeDeleteInput) {
      const raw = await requestGateway(options.config, 'sessions.delete', {
        key: input.sessionKey,
        deleteTranscript: input.deleteTranscript,
        emitLifecycleHooks: false,
      });
      return normalizeChatRuntimeDeleteResult(raw as Record<string, unknown>);
    },
    async listSessions(input: ChatRuntimeListSessionsInput) {
      const raw = await requestGateway<Record<string, unknown>>(options.config, 'sessions.list', {
        agentId: input.agentId,
        limit: input.limit,
        includeDerivedTitles: input.includeDerivedTitles,
        includeLastMessage: input.includeLastMessage,
      });
      return normalizeChatRuntimeListSessionsResult(raw);
    },
    async readHistory(input: ChatRuntimeHistoryInput) {
      const raw = await requestGateway<Record<string, unknown>>(options.config, 'chat.history', {
        sessionKey: input.sessionKey,
        limit: input.limit,
      });
      return normalizeChatRuntimeHistoryResult(raw);
    },
  };
}
