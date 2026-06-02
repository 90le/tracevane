import type { ChatComposerPersistedDraft } from '../../../../../lib/chat-composer-draft';
import { parsePersistedComposerDraft } from '../../../../../lib/chat-composer-draft';

const CHAT_LAST_AGENT_KEY = 'openclaw-studio.chat.last-agent';
const CHAT_LAST_SESSION_KEY = 'openclaw-studio.chat.last-session-key';
const CHAT_COMPOSER_DRAFT_PREFIX = 'openclaw-studio.chat.composer-draft:';
const CHAT_COMPOSER_DRAFT_STORAGE_LIMIT = 256_000;
const CHAT_LAST_STREAM_SEQ_PREFIX = 'openclaw-studio.chat.last-stream-seq:';
const CHAT_LAST_STREAM_SEQ_TTL_MS = 10 * 60 * 1000;
const CHAT_SESSION_VIEWPORT_PREFIX = 'openclaw-studio.chat.session-viewport:';
const CHAT_SESSION_VIEWPORT_TTL_MS = 30 * 60 * 1000;

export type ChatSessionViewportSnapshotStorage = {
  anchorItemId: string;
  anchorMessageId?: string | null;
  anchorOffset: number;
  bottomDistance: number | null;
  timelineItemCount: number;
  timelineVersion: string;
  capturedAtMs: number;
};

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value && value.trim()) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function readLastChatAgentId(): string | null {
  return readStorage(CHAT_LAST_AGENT_KEY);
}

export function readLastChatSessionKey(): string | null {
  return readStorage(CHAT_LAST_SESSION_KEY);
}

export function rememberLastChatAgentId(agentId: string | null): void {
  writeStorage(CHAT_LAST_AGENT_KEY, agentId);
}

export function rememberLastChatSessionKey(sessionKey: string | null): void {
  writeStorage(CHAT_LAST_SESSION_KEY, sessionKey);
}

function composerDraftStorageKey(sessionKey: string): string {
  return `${CHAT_COMPOSER_DRAFT_PREFIX}${sessionKey}`;
}

function streamSeqStorageKey(sessionKey: string): string {
  return `${CHAT_LAST_STREAM_SEQ_PREFIX}${sessionKey}`;
}

function sessionViewportStorageKey(sessionKey: string): string {
  return `${CHAT_SESSION_VIEWPORT_PREFIX}${sessionKey}`;
}

function normalizeStreamSeq(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function parseChatSessionViewportSnapshot(value: unknown): ChatSessionViewportSnapshotStorage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const anchorItemId = typeof record.anchorItemId === 'string' ? record.anchorItemId.trim() : '';
  if (!anchorItemId) {
    return null;
  }
  const anchorOffset = normalizeFiniteNumber(record.anchorOffset);
  const capturedAtMs = normalizeNonNegativeNumber(record.capturedAtMs);
  if (anchorOffset == null || capturedAtMs == null) {
    return null;
  }
  const bottomDistance = normalizeNonNegativeNumber(record.bottomDistance);
  const timelineItemCount = normalizeNonNegativeNumber(record.timelineItemCount);
  return {
    anchorItemId,
    anchorMessageId: typeof record.anchorMessageId === 'string' && record.anchorMessageId.trim()
      ? record.anchorMessageId.trim()
      : null,
    anchorOffset: Math.round(anchorOffset),
    bottomDistance: bottomDistance == null ? null : Math.round(bottomDistance),
    timelineItemCount: timelineItemCount == null ? 0 : Math.round(timelineItemCount),
    timelineVersion: typeof record.timelineVersion === 'string' ? record.timelineVersion : '',
    capturedAtMs: Math.round(capturedAtMs),
  };
}

export function readChatComposerDraft(sessionKey: string | null | undefined): ChatComposerPersistedDraft | null {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(composerDraftStorageKey(normalizedSessionKey));
    if (!raw) {
      return null;
    }
    const draft = parsePersistedComposerDraft(JSON.parse(raw));
    if (!draft) {
      window.localStorage.removeItem(composerDraftStorageKey(normalizedSessionKey));
      return null;
    }
    return draft;
  } catch {
    try { window.localStorage.removeItem(composerDraftStorageKey(normalizedSessionKey)); } catch {}
    return null;
  }
}

export function rememberChatComposerDraft(
  sessionKey: string | null | undefined,
  draft: ChatComposerPersistedDraft | null,
): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || typeof window === 'undefined') {
    return;
  }
  const key = composerDraftStorageKey(normalizedSessionKey);
  try {
    if (!draft) {
      window.localStorage.removeItem(key);
      return;
    }
    const payload = JSON.stringify(draft);
    if (payload.length > CHAT_COMPOSER_DRAFT_STORAGE_LIMIT) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, payload);
  } catch {
    // ignore
  }
}

export function readChatLastStreamSeq(
  sessionKey: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || typeof window === 'undefined') {
    return null;
  }
  const key = streamSeqStorageKey(normalizedSessionKey);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { streamSeq?: unknown; updatedAtMs?: unknown };
    const streamSeq = normalizeStreamSeq(parsed.streamSeq);
    const updatedAtMs = typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : Number(parsed.updatedAtMs);
    if (
      streamSeq == null
      || !Number.isFinite(updatedAtMs)
      || nowMs - updatedAtMs > CHAT_LAST_STREAM_SEQ_TTL_MS
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    return streamSeq;
  } catch {
    try { window.localStorage.removeItem(key); } catch {}
    return null;
  }
}

export function rememberChatLastStreamSeq(
  sessionKey: string | null | undefined,
  streamSeq: number | null | undefined,
  nowMs: number = Date.now(),
): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || typeof window === 'undefined') {
    return;
  }
  const key = streamSeqStorageKey(normalizedSessionKey);
  const normalizedSeq = normalizeStreamSeq(streamSeq);
  try {
    if (normalizedSeq == null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify({
      streamSeq: normalizedSeq,
      updatedAtMs: Math.max(0, Math.floor(nowMs)),
    }));
  } catch {
    // ignore
  }
}

export function clearChatLastStreamSeq(sessionKey: string | null | undefined): void {
  rememberChatLastStreamSeq(sessionKey, null);
}

export function readChatSessionViewportSnapshot(
  sessionKey: string | null | undefined,
  nowMs: number = Date.now(),
): ChatSessionViewportSnapshotStorage | null {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || typeof window === 'undefined') {
    return null;
  }
  const key = sessionViewportStorageKey(normalizedSessionKey);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const snapshot = parseChatSessionViewportSnapshot(JSON.parse(raw));
    if (
      !snapshot
      || nowMs - snapshot.capturedAtMs > CHAT_SESSION_VIEWPORT_TTL_MS
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    return snapshot;
  } catch {
    try { window.localStorage.removeItem(key); } catch {}
    return null;
  }
}

export function rememberChatSessionViewportSnapshot(
  sessionKey: string | null | undefined,
  snapshot: ChatSessionViewportSnapshotStorage | null,
): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || typeof window === 'undefined') {
    return;
  }
  const key = sessionViewportStorageKey(normalizedSessionKey);
  try {
    if (!snapshot) {
      window.localStorage.removeItem(key);
      return;
    }
    const normalizedSnapshot = parseChatSessionViewportSnapshot(snapshot);
    if (!normalizedSnapshot) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(normalizedSnapshot));
  } catch {
    // ignore
  }
}
