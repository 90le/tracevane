import fs from 'node:fs';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type {
  ChatMessageToolCallItem,
  ChatRunProjection,
  ChatRunProjectionLifecycle,
} from '../../../../types/chat.js';
import { normalizeDate, normalizeString } from './shared.js';

export interface StudioAssistantRunShadow {
  sessionKey: string;
  runId: string;
  finalMessageId: string | null;
  finalCreatedAt: string | null;
  toolCalls: ChatMessageToolCallItem[];
  lastAssistantText: string;
  lifecycle: ChatRunProjectionLifecycle;
  savedAt: string;
}

type RunShadowStoreShape = {
  sessions: Record<string, StudioAssistantRunShadow[]>;
};

function runShadowStorePath(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, 'studio', 'chat-run-shadows.json');
}

function readRunShadowStore(config: StudioServerConfig): RunShadowStoreShape {
  const file = runShadowStorePath(config);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as RunShadowStoreShape;
    if (!parsed || typeof parsed !== 'object' || !parsed.sessions || typeof parsed.sessions !== 'object') {
      return { sessions: {} };
    }
    return parsed;
  } catch {
    return { sessions: {} };
  }
}

function writeRunShadowStore(config: StudioServerConfig, payload: RunShadowStoreShape): void {
  const file = runShadowStorePath(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

export function cloneChatMessageToolCallItem(value: ChatMessageToolCallItem): ChatMessageToolCallItem {
  return {
    ...value,
    artifacts: value.artifacts?.map((item) => ({ ...item })),
  };
}

export function cloneChatRunProjection(value: ChatRunProjection): ChatRunProjection {
  return {
    ...value,
    toolCalls: value.toolCalls.map(cloneChatMessageToolCallItem),
  };
}

export function isRunProjectionTerminal(lifecycle: ChatRunProjectionLifecycle): boolean {
  return lifecycle === 'completed' || lifecycle === 'aborted' || lifecycle === 'error';
}

function normalizeShadow(entry: StudioAssistantRunShadow): StudioAssistantRunShadow {
  return {
    sessionKey: normalizeString(entry.sessionKey),
    runId: normalizeString(entry.runId),
    finalMessageId: normalizeString(entry.finalMessageId) || null,
    finalCreatedAt: normalizeDate(entry.finalCreatedAt) || null,
    toolCalls: Array.isArray(entry.toolCalls)
      ? entry.toolCalls
        .filter((item): item is ChatMessageToolCallItem => Boolean(item && typeof item === 'object'))
        .map(cloneChatMessageToolCallItem)
      : [],
    lastAssistantText: String(entry.lastAssistantText || ''),
    lifecycle: entry.lifecycle,
    savedAt: normalizeDate(entry.savedAt) || new Date().toISOString(),
  };
}

function shadowFromProjection(projection: ChatRunProjection): StudioAssistantRunShadow {
  return normalizeShadow({
    sessionKey: projection.sessionKey,
    runId: projection.runId,
    finalMessageId: normalizeString(projection.finalMessageId) || null,
    finalCreatedAt: normalizeDate(projection.finalCreatedAt) || null,
    toolCalls: projection.toolCalls.map(cloneChatMessageToolCallItem),
    lastAssistantText: projection.previewText || '',
    lifecycle: projection.lifecycle,
    savedAt: projection.updatedAt,
  });
}

function pickRunShadowCandidate(
  entries: StudioAssistantRunShadow[],
  match: {
    runId?: string | null;
    finalMessageId?: string | null;
    createdAt?: string | null;
  },
): StudioAssistantRunShadow | null {
  if (!entries.length) {
    return null;
  }

  const runId = normalizeString(match.runId) || null;
  if (runId) {
    const byRunId = [...entries].reverse().find((entry) => entry.runId === runId) || null;
    if (byRunId) {
      return byRunId;
    }
  }

  const finalMessageId = normalizeString(match.finalMessageId) || null;
  if (finalMessageId) {
    const byMessageId = [...entries].reverse().find((entry) => entry.finalMessageId === finalMessageId) || null;
    if (byMessageId) {
      return byMessageId;
    }
  }

  const createdAt = normalizeDate(match.createdAt) || null;
  if (createdAt) {
    const createdAtTs = Date.parse(createdAt) || 0;
    const datedEntries = entries.filter((entry) => entry.finalCreatedAt);
    if (datedEntries.length) {
      return datedEntries
        .slice()
        .sort((left, right) =>
          Math.abs((Date.parse(left.finalCreatedAt || '') || 0) - createdAtTs)
          - Math.abs((Date.parse(right.finalCreatedAt || '') || 0) - createdAtTs))[0] || null;
    }
  }

  return null;
}

export function createStudioChatRunProjectionStore(config: StudioServerConfig) {
  // In-memory cache with stat-based invalidation and debounced writes.
  let memoryStore: RunShadowStoreShape | null = null;
  let cachedMtimeMs: number | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_DELAY_MS = 500;
  const MAX_SESSIONS = 500;

  function getFileMtimeMs(): number | null {
    try {
      return fs.statSync(runShadowStorePath(config)).mtimeMs;
    } catch {
      return null;
    }
  }

  function ensureLoaded(): RunShadowStoreShape {
    const diskMtime = getFileMtimeMs();
    if (memoryStore && diskMtime === cachedMtimeMs) {
      return memoryStore;
    }
    memoryStore = readRunShadowStore(config);
    cachedMtimeMs = diskMtime;
    return memoryStore;
  }

  function flushToDisk(): void {
    if (memoryStore) {
      writeRunShadowStore(config, memoryStore);
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

  function pruneOldSessions(store: RunShadowStoreShape): void {
    const keys = Object.keys(store.sessions);
    if (keys.length <= MAX_SESSIONS) return;
    const ranked = keys.map((key) => {
      const entries = store.sessions[key] || [];
      const latest = entries.length ? entries[entries.length - 1]!.savedAt : '';
      return { key, latest };
    }).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
    for (const { key } of ranked.slice(MAX_SESSIONS)) {
      delete store.sessions[key];
    }
  }

  return {
    saveRunProjectionShadow(projection: ChatRunProjection): void {
      const store = ensureLoaded();
      const shadow = shadowFromProjection(projection);
      const current = store.sessions[shadow.sessionKey] || [];
      const filtered = current.filter((item) => item.runId !== shadow.runId);
      filtered.push(shadow);
      filtered.sort((left, right) => (left.savedAt || '').localeCompare(right.savedAt || ''));
      store.sessions[shadow.sessionKey] = filtered.slice(-160);
      pruneOldSessions(store);
      scheduleFlush();
    },

    listRunProjectionShadows(sessionKey: string): StudioAssistantRunShadow[] {
      const store = ensureLoaded();
      return (store.sessions[sessionKey] || []).map(normalizeShadow);
    },

    findRunProjectionShadow(
      sessionKey: string,
      match: {
        runId?: string | null;
        finalMessageId?: string | null;
        createdAt?: string | null;
      },
    ): StudioAssistantRunShadow | null {
      const store = ensureLoaded();
      return pickRunShadowCandidate(store.sessions[sessionKey] || [], match);
    },

    clearSession(sessionKey: string): void {
      const store = ensureLoaded();
      if (!store.sessions[sessionKey]) {
        return;
      }
      delete store.sessions[sessionKey];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushToDisk();
    },
  };
}
