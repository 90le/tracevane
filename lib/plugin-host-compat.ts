import { isTracevaneManagedWebchatSession } from './tracevane-delivery.js';

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

  if (isTracevaneManagedWebchatSession({ sessionKey, messageChannel: undefined })) {
    return {
      sessionKey,
      channelId: 'webchat',
      source: 'sessionKey',
    };
  }

  return {
    sessionKey,
    channelId: null,
    source: 'none',
  };
}

export function isTracevaneManagedWebchatHostContext(ctx: unknown): boolean {
  const resolved = resolvePluginHostContext(ctx);
  return isTracevaneManagedWebchatSession({
    sessionKey: resolved.sessionKey,
    messageChannel: resolved.channelId,
  });
}
