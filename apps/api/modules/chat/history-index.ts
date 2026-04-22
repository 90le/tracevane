import fs from 'node:fs';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type {
  ChatHistoryDateBucket,
  ChatHistorySearchContentFilter,
  ChatHistorySearchRoleFilter,
  ChatMessageItem,
} from '../../../../types/chat.js';
import { clipPreview, LruMap, normalizeDate } from './shared.js';
import { openStudioChatSqliteDatabase } from './chat-sqlite.js';
const CHAT_HISTORY_INDEX_SCHEMA_VERSION = 3;

export interface ChatHistoryIndexItem {
  id: string;
  role: string;
  createdAt: string | null;
  dayKey: string | null;
  previewText: string;
  snippetText: string;
  runId: string | null;
  messageIndex: number;
  hasText: boolean;
  hasResources: boolean;
  hasCode: boolean;
}

export interface ChatHistoryIndex {
  sessionKey: string;
  sourceSessionFile: string | null;
  sourceMtimeMs: number | null;
  totalMessages: number;
  signature: string;
  items: ChatHistoryIndexItem[];
  searchIndex: {
    terms: Record<string, number[]>;
    roles: Record<ChatHistorySearchRoleFilter, number[]>;
    contentFilters: Record<ChatHistorySearchContentFilter, number[]>;
  };
}

function encodeSessionKey(sessionKey: string): string {
  return Buffer.from(sessionKey, 'utf-8').toString('base64url');
}

function historyIndexPath(config: StudioServerConfig, sessionKey: string): string {
  return path.join(config.openclawRoot, 'studio', 'chat-index', `${encodeSessionKey(sessionKey)}.json`);
}

function readHistoryIndex(config: StudioServerConfig, sessionKey: string): ChatHistoryIndex | null {
  try {
    return JSON.parse(fs.readFileSync(historyIndexPath(config, sessionKey), 'utf-8')) as ChatHistoryIndex;
  } catch {
    return null;
  }
}

function writeHistoryIndex(config: StudioServerConfig, index: ChatHistoryIndex): void {
  const file = historyIndexPath(config, index.sessionKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`);
}

function loadSqliteDatabase(config: StudioServerConfig): any | null {
  const database = openStudioChatSqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS history_indexes (
        session_key TEXT PRIMARY KEY,
        signature TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    return database;
  } catch {
    return null;
  }
}

function normalizeIndexText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeIndexText(value: string): string[] {
  return normalizeIndexText(value).match(/[\p{L}\p{N}]+/gu) || [];
}

function containsCJK(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/u.test(text);
}

function buildPreviewText(message: ChatMessageItem): string {
  const resourceNames = (message.resources || []).map((item) => item.fileName || item.relativePath || item.originalPath || '').filter(Boolean);
  const toolNames = (message.toolCalls || []).map((item) => item.name).filter(Boolean);
  return clipPreview(
    [
      message.text || '',
      ...resourceNames,
      ...toolNames,
    ].filter(Boolean).join('\n').trim(),
    280,
  );
}

function hasCodeFormatting(text: string): boolean {
  return /```/.test(text) || /^\s{4,}\S/m.test(text);
}

function hasMessageText(message: ChatMessageItem): boolean {
  return normalizeIndexText(message.text || '').length > 0;
}

function buildHistorySignature(messages: ChatMessageItem[], sourceSessionFile: string | null, sourceMtimeMs: number | null): string {
  const last = messages[messages.length - 1] || null;
  return [
    String(CHAT_HISTORY_INDEX_SCHEMA_VERSION),
    sourceSessionFile || '',
    String(sourceMtimeMs || 0),
    String(messages.length),
    last?.id || '',
    last?.createdAt || '',
    last?.runId || '',
  ].join('|');
}

function buildIndex(params: {
  sessionKey: string;
  messages: ChatMessageItem[];
  sourceSessionFile: string | null;
  sourceMtimeMs: number | null;
}): ChatHistoryIndex {
  const items: ChatHistoryIndexItem[] = params.messages.map((message, index) => {
    const createdAt = normalizeDate(message.createdAt) || null;
    const snippetText = buildPreviewText(message);
    return {
      id: message.id,
      role: message.role,
      createdAt,
      dayKey: createdAt ? createdAt.slice(0, 10) : null,
      previewText: snippetText,
      snippetText,
      runId: message.runId || null,
      messageIndex: index,
      hasText: hasMessageText(message),
      hasResources: (message.resources || []).length > 0,
      hasCode: hasCodeFormatting(message.text || ''),
    };
  });

  const termMap = new Map<string, number[]>();
  const roleMap: Record<ChatHistorySearchRoleFilter, number[]> = {
    all: [],
    user: [],
    assistant: [],
    tool: [],
  };
  const contentFilterMap: Record<ChatHistorySearchContentFilter, number[]> = {
    all: [],
    text: [],
    resource: [],
    code: [],
  };
  items.forEach((item, index) => {
    roleMap.all.push(index);
    contentFilterMap.all.push(index);
    if (item.role === 'user' || item.role === 'assistant' || item.role === 'tool') {
      roleMap[item.role].push(index);
    }
    if (item.hasText) {
      contentFilterMap.text.push(index);
    }
    if (item.hasResources) {
      contentFilterMap.resource.push(index);
    }
    if (item.hasCode) {
      contentFilterMap.code.push(index);
    }
    const terms = new Set(tokenizeIndexText(item.previewText));
    for (const term of terms) {
      const positions = termMap.get(term) || [];
      positions.push(index);
      termMap.set(term, positions);
    }
  });

  return {
    sessionKey: params.sessionKey,
    sourceSessionFile: params.sourceSessionFile,
    sourceMtimeMs: params.sourceMtimeMs,
    totalMessages: params.messages.length,
    signature: buildHistorySignature(params.messages, params.sourceSessionFile, params.sourceMtimeMs),
    items,
    searchIndex: {
      terms: Object.fromEntries(termMap.entries()),
      roles: roleMap,
      contentFilters: contentFilterMap,
    },
  };
}

function intersectSortedPositions(groups: number[][]): number[] {
  if (!groups.length) {
    return [];
  }
  let current = groups[0]!.slice();
  for (const group of groups.slice(1)) {
    const set = new Set(group);
    current = current.filter((value) => set.has(value));
    if (!current.length) {
      break;
    }
  }
  return current;
}

export function createStudioChatHistoryIndexStore(config: StudioServerConfig) {
  const database = loadSqliteDatabase(config);
  let sqliteHealthy = Boolean(database);
  let jsonHealthy = true;
  const memoryCache = new LruMap<string, ChatHistoryIndex>(50);

  return {
    backend: database ? 'sqlite' as const : 'json' as const,

    ensureIndex(params: {
      sessionKey: string;
      messages: ChatMessageItem[];
      sourceSessionFile: string | null;
      sourceMtimeMs: number | null;
    }): ChatHistoryIndex {
      const nextSignature = buildHistorySignature(params.messages, params.sourceSessionFile, params.sourceMtimeMs);
      const cached = memoryCache.get(params.sessionKey);
      if (cached && cached.signature === nextSignature) {
        return cached;
      }

      if (database && sqliteHealthy) {
        try {
          const row = database.prepare(`
            SELECT payload_json
            FROM history_indexes
            WHERE session_key = ? AND signature = ?
          `).get(params.sessionKey, nextSignature);
          if (row) {
            const parsed = JSON.parse(String(row.payload_json || '{}')) as ChatHistoryIndex;
            memoryCache.set(params.sessionKey, parsed);
            return parsed;
          }
        } catch {
          sqliteHealthy = false;
        }
      }

      const disk = jsonHealthy ? readHistoryIndex(config, params.sessionKey) : null;
      if (disk && disk.signature === nextSignature) {
        memoryCache.set(params.sessionKey, disk);
        if (database && sqliteHealthy) {
          try {
            database.prepare(`
              INSERT INTO history_indexes (session_key, signature, updated_at, payload_json)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(session_key) DO UPDATE SET
                signature = excluded.signature,
                updated_at = excluded.updated_at,
                payload_json = excluded.payload_json
            `).run(
              disk.sessionKey,
              disk.signature,
              new Date().toISOString(),
              JSON.stringify(disk),
            );
          } catch {
            sqliteHealthy = false;
          }
        }
        return disk;
      }

      const built = buildIndex(params);
      memoryCache.set(params.sessionKey, built);
      if (database && sqliteHealthy) {
        try {
          database.prepare(`
            INSERT INTO history_indexes (session_key, signature, updated_at, payload_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              signature = excluded.signature,
              updated_at = excluded.updated_at,
              payload_json = excluded.payload_json
          `).run(
            built.sessionKey,
            built.signature,
            new Date().toISOString(),
            JSON.stringify(built),
          );
        } catch {
          sqliteHealthy = false;
        }
      }
      try {
        writeHistoryIndex(config, built);
        jsonHealthy = true;
      } catch {
        jsonHealthy = false;
      }
      return built;
    },

    clearSession(sessionKey: string): void {
      memoryCache.delete(sessionKey);
      if (database && sqliteHealthy) {
        try {
          database.prepare('DELETE FROM history_indexes WHERE session_key = ?').run(sessionKey);
        } catch {
          sqliteHealthy = false;
        }
      }
      if (!jsonHealthy) {
        return;
      }
      try {
        fs.rmSync(historyIndexPath(config, sessionKey), { force: true });
        jsonHealthy = true;
      } catch {
        jsonHealthy = false;
      }
    },

    searchPositions(index: ChatHistoryIndex, query: string, filters: {
      roleFilter?: ChatHistorySearchRoleFilter | null;
      contentFilter?: ChatHistorySearchContentFilter | null;
    } = {}): number[] {
      const roleFilter = filters.roleFilter || 'all';
      const contentFilter = filters.contentFilter || 'all';
      const normalizedQuery = normalizeIndexText(query);
      if (!normalizedQuery) {
        return [];
      }

      const candidatePositions = (() => {
        const rolePositions = index.searchIndex.roles[roleFilter] || index.searchIndex.roles.all;
        const contentPositions = index.searchIndex.contentFilters[contentFilter] || index.searchIndex.contentFilters.all;
        if (roleFilter === 'all' && contentFilter === 'all') {
          return null;
        }
        if (roleFilter === 'all') {
          return new Set(contentPositions);
        }
        if (contentFilter === 'all') {
          return new Set(rolePositions);
        }
        const contentSet = new Set(contentPositions);
        return new Set(rolePositions.filter((position) => contentSet.has(position)));
      })();

      const filterPositions = (positions: number[]): number[] => {
        if (!candidatePositions) {
          return positions;
        }
        return positions.filter((position) => candidatePositions.has(position));
      };

      const terms = [...new Set(tokenizeIndexText(normalizedQuery))];
      if (!terms.length) {
        return [];
      }

      const groups = terms.map((term) => filterPositions(index.searchIndex.terms[term] || []));
      if (groups.some((group) => group.length === 0)) {
        // Fallback: if term-based lookup failed and query contains CJK chars,
        // do a linear substring scan
        if (containsCJK(normalizedQuery)) {
          const fallbackPositions: number[] = [];
          for (let i = 0; i < index.items.length; i++) {
            if (candidatePositions && !candidatePositions.has(i)) {
              continue;
            }
            const haystack = normalizeIndexText(index.items[i]?.previewText || '');
            if (haystack.includes(normalizedQuery) || terms.every((term) => haystack.includes(term))) {
              fallbackPositions.push(i);
            }
          }
          return fallbackPositions;
        }

        // Non-CJK fallback: try prefix matching for partial word queries
        const prefixGroups = terms.map((term) => {
          const exact = filterPositions(index.searchIndex.terms[term] || []);
          if (exact && exact.length > 0) return exact;
          const matched = new Set<number>();
          for (const [key, positions] of Object.entries(index.searchIndex.terms)) {
            if (key.startsWith(term)) {
              for (const pos of positions) {
                if (!candidatePositions || candidatePositions.has(pos)) {
                  matched.add(pos);
                }
              }
            }
          }
          return [...matched].sort((left, right) => left - right);
        });
        if (prefixGroups.every((group) => group.length > 0)) {
          return intersectSortedPositions(prefixGroups).filter((position) => {
            const haystack = normalizeIndexText(index.items[position]?.previewText || '');
            return haystack.includes(normalizedQuery) || terms.every((term) => haystack.includes(term));
          });
        }

        return [];
      }

      return intersectSortedPositions(groups).filter((position) => {
        const haystack = normalizeIndexText(index.items[position]?.previewText || '');
        return haystack.includes(normalizedQuery) || terms.every((term) => haystack.includes(term));
      });
    },

    buildDateBuckets(index: ChatHistoryIndex): ChatHistoryDateBucket[] {
      const buckets = new Map<string, ChatHistoryDateBucket>();
      for (const item of index.items) {
        if (!item.dayKey) {
          continue;
        }
        const current = buckets.get(item.dayKey);
        if (!current) {
          buckets.set(item.dayKey, {
            day: item.dayKey,
            count: 1,
            firstMessageId: item.id,
            lastMessageId: item.id,
          });
          continue;
        }
        current.count += 1;
        current.lastMessageId = item.id;
      }
      return [...buckets.values()].sort((left, right) => right.day.localeCompare(left.day));
    },
  };
}
