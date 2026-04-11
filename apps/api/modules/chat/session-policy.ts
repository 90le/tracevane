import type { ChatSessionKind, ChatSessionPermissions } from '../../../../types/chat.js';

export type ChatSessionAction = 'send' | 'abort' | 'reset' | 'delete' | 'inject';

export interface ChatSessionPolicy {
  kind: ChatSessionKind;
  source: 'studio' | 'external' | 'system';
  description: string;
  defaultWritable: boolean;
  allow: Record<ChatSessionAction, boolean>;
  visibleInFrontend: boolean;
  visibleInMvpRail: boolean;
}

export const CHAT_SESSION_POLICIES: Record<ChatSessionKind, ChatSessionPolicy> = {
  studio_managed: {
    kind: 'studio_managed',
    source: 'studio',
    description: 'Studio-created webchat sessions intended for text-first chat.',
    defaultWritable: true,
    allow: {
      send: true,
      abort: true,
      reset: true,
      delete: true,
      inject: false,
    },
    visibleInFrontend: true,
    visibleInMvpRail: true,
  },
  observed_external: {
    kind: 'observed_external',
    source: 'external',
    description: 'Existing gateway sessions not owned by Studio; read-only by default.',
    defaultWritable: false,
    allow: {
      send: false,
      abort: false,
      reset: false,
      delete: false,
      inject: false,
    },
    visibleInFrontend: true,
    visibleInMvpRail: false,
  },
  system_internal: {
    kind: 'system_internal',
    source: 'system',
    description: 'Internal heartbeat, cron, or orchestration sessions hidden from MVP rail.',
    defaultWritable: false,
    allow: {
      send: false,
      abort: false,
      reset: false,
      delete: false,
      inject: false,
    },
    visibleInFrontend: false,
    visibleInMvpRail: false,
  },
};

export const CHAT_POLICY_DEFAULTS = {
  defaultTransport: 'studio_bff',
  defaultChannel: 'webchat',
  defaultSurface: 'studio-chat',
  defaultDeliver: false,
  defaultSameOriginRequired: true,
} as const;

export function classifyChatSessionKind(params: {
  sessionKey: string;
  originProvider?: string | null;
  lastChannel?: string | null;
  lastTo?: string | null;
}): ChatSessionKind {
  const key = params.sessionKey.trim().toLowerCase();
  const originProvider = String(params.originProvider || '').trim().toLowerCase();
  const lastChannel = String(params.lastChannel || '').trim().toLowerCase();
  const lastTo = String(params.lastTo || '').trim().toLowerCase();

  if (key.includes(':webchat:direct:studio-')) return 'studio_managed';
  if (key.includes(':cron:')) return 'system_internal';
  if (originProvider === 'heartbeat' || lastTo === 'heartbeat') return 'system_internal';
  if (originProvider === 'cron' || lastChannel === 'cron') return 'system_internal';

  return 'observed_external';
}

export function buildChatSessionPermissions(kind: ChatSessionKind): ChatSessionPermissions {
  const policy = CHAT_SESSION_POLICIES[kind];
  return {
    writable: policy.defaultWritable,
    canSend: policy.allow.send,
    canAbort: policy.allow.abort,
    canReset: policy.allow.reset,
    canDelete: policy.allow.delete,
    canInject: policy.allow.inject,
    visibleInFrontend: policy.visibleInFrontend,
    visibleInMvpRail: policy.visibleInMvpRail,
  };
}
