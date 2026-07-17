import {
  deriveTracevaneManagedAgentChatChannel,
} from './tracevane-delivery.js';

export interface ResolvedPluginHostContext {
  sessionKey: string | null;
  channelId: string | null;
  source: 'explicit' | 'sessionKey' | 'none';
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeChannelId(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

export function resolvePluginHostContext(ctx: unknown): ResolvedPluginHostContext {
  const record = readRecord(ctx);
  const sessionKey = normalizeString(record.sessionKey);
  const explicitChannelId = [
    record.channelId,
    record.messageChannel,
    record.messageProvider,
  ]
    .map(normalizeChannelId)
    .find(Boolean) || null;

  if (explicitChannelId) {
    return {
      sessionKey,
      channelId: explicitChannelId,
      source: 'explicit',
    };
  }

  const inferredChannelId = deriveTracevaneManagedAgentChatChannel(sessionKey);
  if (inferredChannelId) {
    return {
      sessionKey,
      channelId: inferredChannelId,
      source: 'sessionKey',
    };
  }

  return {
    sessionKey,
    channelId: null,
    source: 'none',
  };
}
