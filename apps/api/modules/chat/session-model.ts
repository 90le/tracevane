import crypto from 'node:crypto';
import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import type { ChatRuntimeAdapterKind, ChatRuntimeAgentId, ChatRuntimePermissionMode, ChatRuntimeState, ChatSessionPresentation, ChatSessionRow, ChatSessionRuntimeTarget } from '../../../../types/chat.js';
import { ensureDir, readJsonFile, readOpenClawConfig, writeJsonFile } from '../../core/state.js';
import {
  CHAT_POLICY_DEFAULTS,
  CHAT_SESSION_POLICIES,
  buildChatSessionPermissions,
  classifyChatSessionKind,
} from './session-policy.js';
import { normalizeDate, normalizeString } from './shared.js';

export interface TracevaneSessionRegistryEntry {
  key: string;
  agentId: string;
  sessionId?: string | null;
  label: string;
  customLabel?: string | null;
  autoLabel?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tracks gateway session IDs from prior resets so their .reset.* JSONL backup files can be found. */
  priorSessionIds?: string[];
  runtimeTarget?: Partial<ChatSessionRuntimeTarget>;
  runtimeSession?: {
    agentNativeSessionId?: string | null;
    codexThreadId?: string | null;
  };
}

export function buildDefaultRuntimeTarget(agentId: string): ChatSessionRuntimeTarget {
  return {
    adapterKind: 'openclaw-gateway',
    agent: agentId || 'openclaw',
    model: null,
    workDir: null,
    permissionMode: null,
  };
}

export function buildDefaultTracevaneManagedRuntimeTarget(): ChatSessionRuntimeTarget {
  return {
    adapterKind: 'native-cli',
    agent: 'codex',
    model: null,
    workDir: null,
    permissionMode: null,
  };
}


export function normalizeChatRuntimeAgentId(
  adapterKind: ChatRuntimeAdapterKind,
  agent: string | null | undefined,
  fallbackAgent: ChatRuntimeAgentId,
): ChatRuntimeAgentId {
  const normalized = normalizeString(agent) || normalizeString(fallbackAgent);
  if (adapterKind !== 'native-cli') {
    return (normalized || fallbackAgent) as ChatRuntimeAgentId;
  }
  if (normalized === 'claude' || normalized === 'claude-code-cli') return 'claude-code';
  if (normalized === 'open-code' || normalized === 'open_code') return 'opencode';
  if (normalized === 'openai-codex' || normalized === 'codex-cli') return 'codex';
  return (normalized || fallbackAgent) as ChatRuntimeAgentId;
}

export function normalizeChatSessionRuntimeTarget(
  target: Partial<ChatSessionRuntimeTarget> | undefined | null,
  fallbackAgentId: string,
  fallbackTarget: ChatSessionRuntimeTarget = buildDefaultRuntimeTarget(fallbackAgentId),
): ChatSessionRuntimeTarget {
  const fallback = fallbackTarget;
  const requestedAdapterKind = normalizeString(target?.adapterKind) as ChatRuntimeAdapterKind;
  const adapterKind = requestedAdapterKind === 'native-cli' || requestedAdapterKind === 'openclaw-gateway'
    ? requestedAdapterKind
    : fallback.adapterKind;
  return {
    adapterKind,
    agent: normalizeChatRuntimeAgentId(adapterKind, target?.agent, fallback.agent),
    model: normalizeString(target?.model) || null,
    workDir: normalizeString(target?.workDir) || null,
    permissionMode: (normalizeString(target?.permissionMode) || null) as ChatRuntimePermissionMode | null,
  };
}

export function normalizeTracevaneManagedRuntimeTarget(
  target: Partial<ChatSessionRuntimeTarget> | undefined | null,
  fallbackAgentId: string,
): ChatSessionRuntimeTarget {
  return normalizeChatSessionRuntimeTarget(target, fallbackAgentId, buildDefaultTracevaneManagedRuntimeTarget());
}

function isLegacyTracevaneWebchatKey(sessionKey: string): boolean {
  return normalizeString(sessionKey).toLowerCase().includes(':webchat:direct:tracevane-');
}

function normalizeTracevaneManagedRuntimeTargetForSession(
  sessionKey: string,
  target: Partial<ChatSessionRuntimeTarget> | undefined | null,
  fallbackAgentId: string,
): ChatSessionRuntimeTarget {
  if (target?.adapterKind) {
    return normalizeTracevaneManagedRuntimeTarget(target, fallbackAgentId);
  }
  if (isLegacyTracevaneWebchatKey(sessionKey)) {
    return normalizeChatSessionRuntimeTarget(target, fallbackAgentId, buildDefaultRuntimeTarget(fallbackAgentId));
  }
  return normalizeTracevaneManagedRuntimeTarget(target, fallbackAgentId);
}

export interface LocalSessionRecord {
  sessionId?: string;
  sessionFile?: string;
  label?: string;
  displayName?: string;
  updatedAt?: string | number;
  updatedAtMs?: number;
  lastMessageAt?: string | number;
  totalTokens?: number;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  deliveryContext?: Record<string, unknown>;
  origin?: Record<string, unknown>;
}

export function resolveTracevaneChatRegistryPath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, 'tracevane', 'chat-sessions.json');
}

export function readTracevaneChatRegistry(config: TracevaneServerConfig): Record<string, TracevaneSessionRegistryEntry> {
  return readJsonFile<Record<string, TracevaneSessionRegistryEntry>>(resolveTracevaneChatRegistryPath(config), {});
}

export function writeTracevaneChatRegistry(config: TracevaneServerConfig, value: Record<string, TracevaneSessionRegistryEntry>): void {
  ensureDir(path.dirname(resolveTracevaneChatRegistryPath(config)));
  writeJsonFile(resolveTracevaneChatRegistryPath(config), value);
}

export function deriveAgentIdFromSessionKey(sessionKey: string): string {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match?.[1] || 'main';
}

export function buildDefaultSessionLabel(agentId: string): string {
  return `Tracevane chat · ${agentId}`;
}

export function buildRuntimeState(
  gatewayConnected: boolean,
  writable: boolean,
  overrides: Partial<ChatRuntimeState> = {}
): ChatRuntimeState {
  return {
    gatewayConnected,
    sessionWritable: writable,
    activeRunId: null,
    state: 'idle',
    lastEventAt: null,
    lastAckAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

export function buildSessionPresentation(
  entry?: Pick<TracevaneSessionRegistryEntry, 'customLabel' | 'autoLabel' | 'archivedAt'> | null
): ChatSessionPresentation {
  const archivedAt = normalizeDate(entry?.archivedAt) || null;
  const customLabel = normalizeString(entry?.customLabel) || null;
  const autoLabel = normalizeString(entry?.autoLabel) || null;
  return {
    archived: Boolean(archivedAt),
    archivedAt,
    customLabel,
    autoLabel,
  };
}


function deriveTracevaneManagedChannelFromKey(sessionKey: string): string {
  const normalized = normalizeString(sessionKey).toLowerCase();
  if (normalized.includes(':webchat:direct:tracevane-')) return 'webchat';
  if (normalized.includes(':agent-chat:direct:tracevane-')) return 'agent-chat';
  return CHAT_POLICY_DEFAULTS.defaultChannel;
}

export function buildTracevaneManagedSessionRow(agentId: string, label: string, gatewayConnected: boolean, runtimeTarget?: Partial<ChatSessionRuntimeTarget> | null): ChatSessionRow {
  const channel = CHAT_POLICY_DEFAULTS.defaultChannel;
  const key = `agent:${agentId}:${channel}:direct:tracevane-${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  return {
    key,
    agentId,
    sessionId,
    kind: 'tracevane_managed',
    label,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: new Date().toISOString(),
    presentation: buildSessionPresentation(),
    source: {
      source: 'tracevane',
      channel,
      surface: CHAT_POLICY_DEFAULTS.defaultSurface,
      originLabel: 'Tracevane managed',
    },
    deliveryContext: {
      channel,
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: buildChatSessionPermissions('tracevane_managed'),
    runtime: buildRuntimeState(gatewayConnected, true),
    runtimeTarget: normalizeTracevaneManagedRuntimeTarget(
      runtimeTarget || buildDefaultTracevaneManagedRuntimeTarget(),
      agentId,
    ),
  };
}


export function buildTracevaneManagedRowFromRegistry(
  entry: TracevaneSessionRegistryEntry,
  gatewayConnected: boolean
): ChatSessionRow {
  const channel = deriveTracevaneManagedChannelFromKey(entry.key);
  return {
    key: entry.key,
    agentId: entry.agentId,
    sessionId: normalizeString(entry.sessionId) || null,
    kind: 'tracevane_managed',
    label: normalizeString(entry.customLabel, entry.label),
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: entry.updatedAt,
    presentation: buildSessionPresentation(entry),
    source: {
      source: 'tracevane',
      channel,
      surface: CHAT_POLICY_DEFAULTS.defaultSurface,
      originLabel: 'Tracevane managed',
    },
    deliveryContext: {
      channel,
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: buildChatSessionPermissions('tracevane_managed'),
    runtime: buildRuntimeState(gatewayConnected, true),
    runtimeTarget: normalizeTracevaneManagedRuntimeTargetForSession(entry.key, entry.runtimeTarget, entry.agentId),
  };
}

export function mapLocalSessionRow(
  agentId: string,
  key: string,
  record: LocalSessionRecord,
  gatewayConnected: boolean,
  registryEntry?: TracevaneSessionRegistryEntry | null
): ChatSessionRow {
  const kind = classifyChatSessionKind({
    sessionKey: key,
    originProvider: normalizeString(record.origin?.provider),
    lastChannel: normalizeString(record.lastChannel),
    lastTo: normalizeString(record.lastTo),
  });
  const policy = CHAT_SESSION_POLICIES[kind];

  const fallbackLabel = kind === 'system_internal'
    ? 'System session'
    : kind === 'observed_external'
      ? key
      : buildDefaultSessionLabel(agentId);

  return {
    key,
    agentId,
    sessionId: normalizeString(record.sessionId) || null,
    kind,
    label: kind === 'tracevane_managed'
      ? normalizeString(
        registryEntry?.customLabel,
        normalizeString(registryEntry?.label, normalizeString(record.label, normalizeString(record.displayName, fallbackLabel)))
      )
      : normalizeString(record.label, normalizeString(record.displayName, fallbackLabel)),
    derivedTitle: kind === 'tracevane_managed' ? null : normalizeString(record.displayName || record.label) || null,
    lastMessagePreview: null,
    updatedAt: normalizeDate(record.updatedAtMs || record.updatedAt || record.lastMessageAt),
    presentation: kind === 'tracevane_managed' ? buildSessionPresentation(registryEntry) : buildSessionPresentation(),
    source: {
      source: policy.source,
      channel: normalizeString(record.lastChannel || record.origin?.provider) || null,
      surface: normalizeString(record.origin?.surface) || null,
      originLabel: normalizeString(record.origin?.label || record.displayName) || null,
    },
    deliveryContext: {
      channel: normalizeString(record.deliveryContext?.channel || record.lastChannel) || null,
      accountId: normalizeString(record.deliveryContext?.accountId || record.lastAccountId) || null,
      to: normalizeString(record.deliveryContext?.to || record.lastTo) || null,
      threadId: normalizeString(record.deliveryContext?.threadId || record.lastThreadId) || null,
    },
    permissions: buildChatSessionPermissions(kind),
    runtime: buildRuntimeState(gatewayConnected, policy.defaultWritable, {
      state: 'unknown',
    }),
    runtimeTarget: kind === 'tracevane_managed'
      ? normalizeTracevaneManagedRuntimeTargetForSession(key, registryEntry?.runtimeTarget, agentId)
      : normalizeChatSessionRuntimeTarget(registryEntry?.runtimeTarget, agentId),
  };
}

export function resolveAgentSessionsStorePath(config: TracevaneServerConfig, agentId: string): string {
  return path.join(config.openclawRoot, 'agents', agentId, 'sessions', 'sessions.json');
}

export function resolveAvailableAgentIds(config: TracevaneServerConfig): string[] {
  const openclawConfig = readOpenClawConfig(config);
  return Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
      .map((agent: Record<string, unknown>) => normalizeString(agent.id))
      .filter(Boolean)
    : [];
}
