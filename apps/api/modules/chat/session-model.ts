import crypto from 'node:crypto';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type { ChatRuntimeState, ChatSessionPresentation, ChatSessionRow } from '../../../../types/chat.js';
import { ensureDir, readJsonFile, readOpenClawConfig, writeJsonFile } from '../../core/state.js';
import {
  CHAT_POLICY_DEFAULTS,
  CHAT_SESSION_POLICIES,
  buildChatSessionPermissions,
  classifyChatSessionKind,
} from './session-policy.js';
import { normalizeDate, normalizeString } from './shared.js';

export interface StudioSessionRegistryEntry {
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

export function resolveStudioChatRegistryPath(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, 'studio', 'chat-sessions.json');
}

export function readStudioChatRegistry(config: StudioServerConfig): Record<string, StudioSessionRegistryEntry> {
  return readJsonFile<Record<string, StudioSessionRegistryEntry>>(resolveStudioChatRegistryPath(config), {});
}

export function writeStudioChatRegistry(config: StudioServerConfig, value: Record<string, StudioSessionRegistryEntry>): void {
  ensureDir(path.dirname(resolveStudioChatRegistryPath(config)));
  writeJsonFile(resolveStudioChatRegistryPath(config), value);
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
  entry?: Pick<StudioSessionRegistryEntry, 'customLabel' | 'autoLabel' | 'archivedAt'> | null
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

export function buildStudioManagedSessionRow(agentId: string, label: string, gatewayConnected: boolean): ChatSessionRow {
  const key = `agent:${agentId}:${CHAT_POLICY_DEFAULTS.defaultChannel}:direct:studio-${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  return {
    key,
    agentId,
    sessionId,
    kind: 'studio_managed',
    label,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: new Date().toISOString(),
    presentation: buildSessionPresentation(),
    source: {
      source: 'studio',
      channel: CHAT_POLICY_DEFAULTS.defaultChannel,
      surface: CHAT_POLICY_DEFAULTS.defaultSurface,
      originLabel: 'Tracevane managed',
    },
    deliveryContext: {
      channel: CHAT_POLICY_DEFAULTS.defaultChannel,
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: buildChatSessionPermissions('studio_managed'),
    runtime: buildRuntimeState(gatewayConnected, true),
  };
}

export function buildStudioManagedRowFromRegistry(
  entry: StudioSessionRegistryEntry,
  gatewayConnected: boolean
): ChatSessionRow {
  return {
    key: entry.key,
    agentId: entry.agentId,
    sessionId: normalizeString(entry.sessionId) || null,
    kind: 'studio_managed',
    label: normalizeString(entry.customLabel, entry.label),
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: entry.updatedAt,
    presentation: buildSessionPresentation(entry),
    source: {
      source: 'studio',
      channel: CHAT_POLICY_DEFAULTS.defaultChannel,
      surface: CHAT_POLICY_DEFAULTS.defaultSurface,
      originLabel: 'Tracevane managed',
    },
    deliveryContext: {
      channel: CHAT_POLICY_DEFAULTS.defaultChannel,
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: buildChatSessionPermissions('studio_managed'),
    runtime: buildRuntimeState(gatewayConnected, true),
  };
}

export function mapLocalSessionRow(
  agentId: string,
  key: string,
  record: LocalSessionRecord,
  gatewayConnected: boolean,
  registryEntry?: StudioSessionRegistryEntry | null
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
    label: kind === 'studio_managed'
      ? normalizeString(
        registryEntry?.customLabel,
        normalizeString(registryEntry?.label, normalizeString(record.label, normalizeString(record.displayName, fallbackLabel)))
      )
      : normalizeString(record.label, normalizeString(record.displayName, fallbackLabel)),
    derivedTitle: kind === 'studio_managed' ? null : normalizeString(record.displayName || record.label) || null,
    lastMessagePreview: null,
    updatedAt: normalizeDate(record.updatedAtMs || record.updatedAt || record.lastMessageAt),
    presentation: kind === 'studio_managed' ? buildSessionPresentation(registryEntry) : buildSessionPresentation(),
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
  };
}

export function resolveAgentSessionsStorePath(config: StudioServerConfig, agentId: string): string {
  return path.join(config.openclawRoot, 'agents', agentId, 'sessions', 'sessions.json');
}

export function resolveAvailableAgentIds(config: StudioServerConfig): string[] {
  const openclawConfig = readOpenClawConfig(config);
  return Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
      .map((agent: Record<string, unknown>) => normalizeString(agent.id))
      .filter(Boolean)
    : [];
}
