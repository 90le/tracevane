import fs from 'node:fs';
import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import type { ChatMessageBlock, ChatMessageItem, ChatResourceItem, ChatSendFileRef } from '../../../../types/chat.js';
import { normalizeChatHistoryText } from '../../../../lib/chat-history-normalization.js';
import { normalizeDate, normalizeString } from './shared.js';

export interface TracevaneUserMessageShadow {
  sessionKey: string;
  requestId: string | null;
  runId: string | null;
  transportText: string;
  text: string;
  blocks?: ChatMessageBlock[];
  fileRefs?: ChatSendFileRef[];
  resources?: ChatResourceItem[];
  createdAt: string;
}

type ShadowStoreShape = {
  sessions: Record<string, TracevaneUserMessageShadow[]>;
};

function shadowStorePath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, 'tracevane', 'chat-message-shadows.json');
}

function readShadowStore(config: TracevaneServerConfig): ShadowStoreShape {
  const file = shadowStorePath(config);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as ShadowStoreShape;
    if (!parsed || typeof parsed !== 'object' || !parsed.sessions || typeof parsed.sessions !== 'object') {
      return { sessions: {} };
    }
    return parsed;
  } catch {
    return { sessions: {} };
  }
}

function writeShadowStore(config: TracevaneServerConfig, payload: ShadowStoreShape): void {
  const file = shadowStorePath(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function dedupeResources(resources: ChatResourceItem[] | undefined): ChatResourceItem[] | undefined {
  if (!resources?.length) {
    return undefined;
  }
  const seen = new Set<string>();
  const next = resources.filter((item) => {
    const key = `${item.kind}:${item.url}:${item.downloadUrl}:${item.id}:${item.relativePath || item.fileName}:${item.source}:${item.status}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return next.length ? next : undefined;
}

function dedupeFileRefs(fileRefs: ChatSendFileRef[] | undefined): ChatSendFileRef[] | undefined {
  if (!fileRefs?.length) {
    return undefined;
  }
  const seen = new Set<string>();
  const next = fileRefs.filter((item, index) => {
    const relativePath = normalizeString(item.relativePath);
    if (!relativePath) {
      return false;
    }
    const key = `${normalizeString(item.id, `file-ref-${index + 1}`)}:${relativePath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).map((item, index) => ({
    id: normalizeString(item.id, `file-ref-${index + 1}`),
    relativePath: normalizeString(item.relativePath),
    fileName: normalizeString(item.fileName) || path.basename(normalizeString(item.relativePath)),
    kind: item.kind,
    mimeType: normalizeString(item.mimeType) || null,
  }));
  return next.length ? next : undefined;
}

function normalizeBlocks(blocks: ChatMessageBlock[] | undefined): ChatMessageBlock[] | undefined {
  if (!blocks?.length) {
    return undefined;
  }
  const normalized = blocks.filter((block): block is ChatMessageBlock => Boolean(block && typeof block === 'object'));
  return normalized.length ? normalized : undefined;
}

function normalizeShadow(entry: TracevaneUserMessageShadow): TracevaneUserMessageShadow {
  return {
    sessionKey: entry.sessionKey,
    requestId: normalizeString(entry.requestId) || null,
    runId: normalizeString(entry.runId) || null,
    transportText: String(entry.transportText || ''),
    text: String(entry.text || ''),
    blocks: normalizeBlocks(entry.blocks),
    fileRefs: dedupeFileRefs(entry.fileRefs),
    resources: dedupeResources(entry.resources),
    createdAt: normalizeDate(entry.createdAt) || new Date().toISOString(),
  };
}

function pickShadowCandidate(
  entries: TracevaneUserMessageShadow[],
  raw: Record<string, unknown>,
  rawText: string,
): TracevaneUserMessageShadow | null {
  if (!entries.length) {
    return null;
  }

  const pickClosestByCreatedAt = (candidates: TracevaneUserMessageShadow[]): TracevaneUserMessageShadow | null => {
    if (!candidates.length) {
      return null;
    }
    const rawCreatedAt = normalizeDate(raw.timestamp || raw.createdAt || raw.updatedAt);
    if (rawCreatedAt) {
      const rawTs = Date.parse(rawCreatedAt) || 0;
      return candidates
        .slice()
        .sort((left, right) => Math.abs((Date.parse(left.createdAt) || 0) - rawTs) - Math.abs((Date.parse(right.createdAt) || 0) - rawTs))[0] || null;
    }
    return candidates[candidates.length - 1] || null;
  };

  const rawRunId = normalizeString(raw.runId) || null;
  if (rawRunId) {
    const byRunId = [...entries].reverse().find((entry) => entry.runId === rawRunId || entry.requestId === rawRunId) || null;
    if (byRunId) {
      return byRunId;
    }
  }

  const normalizedRawText = String(rawText || '');
  const textMatches = entries.filter((entry) => entry.transportText === normalizedRawText);
  if (textMatches.length > 0) {
    return pickClosestByCreatedAt(textMatches);
  }

  const normalizedVisibleRawText = normalizeChatHistoryText(normalizedRawText, 'user');
  if (normalizedVisibleRawText) {
    const normalizedMatches = entries.filter((entry) => (
      normalizeChatHistoryText(entry.transportText, 'user') === normalizedVisibleRawText
      || entry.text === normalizedVisibleRawText
    ));
    if (normalizedMatches.length > 0) {
      return pickClosestByCreatedAt(normalizedMatches);
    }
  }

  return null;
}

export function createTracevaneChatMessageShadowStore(config: TracevaneServerConfig) {
  // In-memory cache with stat-based invalidation and debounced writes.
  let memoryStore: ShadowStoreShape | null = null;
  let cachedMtimeMs: number | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_DELAY_MS = 500;
  const MAX_SESSIONS = 500;

  function getFileMtimeMs(): number | null {
    try {
      return fs.statSync(shadowStorePath(config)).mtimeMs;
    } catch {
      return null;
    }
  }

  function ensureLoaded(): ShadowStoreShape {
    const diskMtime = getFileMtimeMs();
    if (memoryStore && diskMtime === cachedMtimeMs) {
      return memoryStore;
    }
    memoryStore = readShadowStore(config);
    cachedMtimeMs = diskMtime;
    return memoryStore;
  }

  function flushToDisk(): void {
    if (memoryStore) {
      writeShadowStore(config, memoryStore);
      cachedMtimeMs = getFileMtimeMs();
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToDisk();
    }, FLUSH_DELAY_MS);
  }

  function pruneOldSessions(store: ShadowStoreShape): void {
    const keys = Object.keys(store.sessions);
    if (keys.length <= MAX_SESSIONS) return;
    // Sort sessions by their most recent entry's createdAt, prune the oldest.
    const ranked = keys.map((key) => {
      const entries = store.sessions[key] || [];
      const latest = entries.length ? entries[entries.length - 1]!.createdAt : '';
      return { key, latest };
    }).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
    for (const { key } of ranked.slice(MAX_SESSIONS)) {
      delete store.sessions[key];
    }
  }

  return {
    saveUserMessageShadow(entry: TracevaneUserMessageShadow): void {
      const store = ensureLoaded();
      const normalized = normalizeShadow(entry);
      const current = store.sessions[normalized.sessionKey] || [];
      const filtered = current.filter((item) => {
        if (normalized.runId && item.runId === normalized.runId) {
          return false;
        }
        if (normalized.requestId && item.requestId === normalized.requestId) {
          return false;
        }
        if (item.transportText === normalized.transportText && item.createdAt === normalized.createdAt) {
          return false;
        }
        return true;
      });
      filtered.push(normalized);
      filtered.sort((left, right) => (left.createdAt || '').localeCompare(right.createdAt || ''));
      store.sessions[normalized.sessionKey] = filtered.slice(-120);
      pruneOldSessions(store);
      scheduleFlush();
    },

    restoreUserMessageShadow(
      sessionKey: string,
      raw: Record<string, unknown>,
      rawText: string,
    ): (Pick<ChatMessageItem, 'text' | 'resources' | 'blocks'> & {
      fileRefs?: ChatSendFileRef[];
      requestId: string | null;
      runId: string | null;
      createdAt: string;
    }) | null {
      const store = ensureLoaded();
      const entries = store.sessions[sessionKey] || [];
      const matched = pickShadowCandidate(entries, raw, rawText);
      if (!matched) {
        return null;
      }
      return {
        text: matched.text,
        blocks: matched.blocks,
        fileRefs: matched.fileRefs,
        resources: matched.resources,
        requestId: matched.requestId,
        runId: matched.runId,
        createdAt: matched.createdAt,
      };
    },

    clearSession(sessionKey: string): void {
      const store = ensureLoaded();
      if (!store.sessions[sessionKey]) {
        return;
      }
      delete store.sessions[sessionKey];
      // Flush immediately on delete — this is infrequent and should be durable.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushToDisk();
    },
  };
}
