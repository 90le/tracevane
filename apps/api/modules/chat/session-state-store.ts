import fs from 'node:fs';
import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import type { ChatQueuedMessageItem } from '../../../../types/chat.js';
import { openTracevaneChatSqliteDatabase } from './chat-sqlite.js';

type SessionStateBackend = 'sqlite' | 'json';

type JsonSessionStateRecord = Record<string, {
  pendingQueue: ChatQueuedMessageItem[];
}>;

function ensureSessionStateDir(config: TracevaneServerConfig): string {
  const dir = path.join(config.openclawRoot, 'tracevane', 'chat-session-state');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonSessionStatePath(config: TracevaneServerConfig): string {
  return path.join(ensureSessionStateDir(config), 'state.json');
}

function cloneQueueItem<T extends ChatQueuedMessageItem>(item: T): T {
  return {
    ...item,
    composerDocument: item.composerDocument?.map((node) => ({ ...node })),
    fileRefs: item.fileRefs?.map((entry) => ({ ...entry })),
    attachments: item.attachments?.map((entry) => ({ ...entry })),
  } as T;
}

function cloneQueue(items: ChatQueuedMessageItem[]): ChatQueuedMessageItem[] {
  return items.map((item) => cloneQueueItem(item));
}

function readJsonSessionState(config: TracevaneServerConfig): JsonSessionStateRecord {
  try {
    return JSON.parse(fs.readFileSync(jsonSessionStatePath(config), 'utf-8')) as JsonSessionStateRecord;
  } catch {
    return {};
  }
}

function writeJsonSessionState(config: TracevaneServerConfig, value: JsonSessionStateRecord): void {
  fs.writeFileSync(jsonSessionStatePath(config), `${JSON.stringify(value, null, 2)}\n`);
}

function hasLegacySessionStateColumn(database: any): boolean {
  const legacyColumnName = ['control', 's_json'].join('');
  try {
    const rows = database.prepare('PRAGMA table_info(session_state)').all() as Array<{ name?: unknown }>;
    return rows.some((row) => String(row.name || '') === legacyColumnName);
  } catch {
    return false;
  }
}

function ensureSessionStateSchema(database: any): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_state (
      session_key TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      queue_json TEXT NOT NULL
    );
  `);

  if (!hasLegacySessionStateColumn(database)) {
    return;
  }

  const legacyTable = `session_state_legacy_${Date.now()}`;
  database.exec(`
    ALTER TABLE session_state RENAME TO ${legacyTable};
    CREATE TABLE session_state (
      session_key TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      queue_json TEXT NOT NULL
    );
    INSERT INTO session_state (session_key, updated_at, queue_json)
      SELECT session_key, updated_at, queue_json FROM ${legacyTable};
    DROP TABLE ${legacyTable};
  `);
}

function loadSqliteDatabase(config: TracevaneServerConfig): any | null {
  const database = openTracevaneChatSqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    ensureSessionStateSchema(database);
    return database;
  } catch {
    return null;
  }
}

export function createTracevaneChatSessionStateStore(config: TracevaneServerConfig) {
  const database = loadSqliteDatabase(config);
  const backend: SessionStateBackend = database ? 'sqlite' : 'json';
  let sqliteHealthy = Boolean(database);
  let jsonHealthy = true;

  return {
    backend,

    read(sessionKey: string): { pendingQueue: ChatQueuedMessageItem[] } | null {
      if (database && sqliteHealthy) {
        try {
          const row = database.prepare(`
            SELECT queue_json
            FROM session_state
            WHERE session_key = ?
          `).get(sessionKey);
          if (!row) {
            return null;
          }
          return {
            pendingQueue: cloneQueue(JSON.parse(String(row.queue_json || '[]')) as ChatQueuedMessageItem[]),
          };
        } catch {
          sqliteHealthy = false;
        }
      }
      if (!jsonHealthy) {
        return null;
      }
      const current = readJsonSessionState(config)[sessionKey];
      return current ? {
        pendingQueue: cloneQueue(current.pendingQueue || []),
      } : null;
    },

    write(sessionKey: string, value: { pendingQueue: ChatQueuedMessageItem[] }): void {
      const queue = cloneQueue(value.pendingQueue || []);
      const updatedAt = new Date().toISOString();
      if (database && sqliteHealthy) {
        try {
          database.prepare(`
            INSERT INTO session_state (session_key, updated_at, queue_json)
            VALUES (?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              updated_at = excluded.updated_at,
              queue_json = excluded.queue_json
          `).run(
            sessionKey,
            updatedAt,
            JSON.stringify(queue),
          );
        } catch {
          sqliteHealthy = false;
        }
      }
      const current = readJsonSessionState(config);
      current[sessionKey] = {
        pendingQueue: queue,
      };
      try {
        writeJsonSessionState(config, current);
        jsonHealthy = true;
      } catch {
        jsonHealthy = false;
      }
    },

    clear(sessionKey: string): void {
      if (database && sqliteHealthy) {
        try {
          database.prepare('DELETE FROM session_state WHERE session_key = ?').run(sessionKey);
        } catch {
          sqliteHealthy = false;
        }
      }
      if (!jsonHealthy) {
        return;
      }
      const current = readJsonSessionState(config);
      if (current[sessionKey]) {
        delete current[sessionKey];
        try {
          writeJsonSessionState(config, current);
          jsonHealthy = true;
        } catch {
          jsonHealthy = false;
        }
      }
    },
  };
}
