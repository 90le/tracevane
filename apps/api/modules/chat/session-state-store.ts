import fs from 'node:fs';
import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import type { ChatQueuedMessageItem, ChatSessionControlState } from '../../../../types/chat.js';
import { openTracevaneChatSqliteDatabase } from './chat-sqlite.js';

type SessionStateBackend = 'sqlite' | 'json';

type JsonSessionStateRecord = Record<string, {
  pendingQueue: ChatQueuedMessageItem[];
  controls: ChatSessionControlState;
}>;

function ensureSessionStateDir(config: TracevaneServerConfig): string {
  const dir = path.join(config.openclawRoot, 'tracevane', 'chat-session-state');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonSessionStatePath(config: TracevaneServerConfig): string {
  return path.join(ensureSessionStateDir(config), 'state.json');
}

function cloneSessionControls(value: ChatSessionControlState): ChatSessionControlState {
  return {
    allowHostManagementExec: value.allowHostManagementExec === true,
    updatedAt: value.updatedAt || null,
  };
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

function loadSqliteDatabase(config: TracevaneServerConfig): any | null {
  const database = openTracevaneChatSqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        session_key TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        queue_json TEXT NOT NULL,
        controls_json TEXT NOT NULL
      );
    `);
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

    read(sessionKey: string): { pendingQueue: ChatQueuedMessageItem[]; controls: ChatSessionControlState } | null {
      if (database && sqliteHealthy) {
        try {
          const row = database.prepare(`
            SELECT queue_json, controls_json
            FROM session_state
            WHERE session_key = ?
          `).get(sessionKey);
          if (!row) {
            return null;
          }
          return {
            pendingQueue: cloneQueue(JSON.parse(String(row.queue_json || '[]')) as ChatQueuedMessageItem[]),
            controls: cloneSessionControls(JSON.parse(String(row.controls_json || '{}')) as ChatSessionControlState),
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
        controls: cloneSessionControls(current.controls || {
          allowHostManagementExec: false,
          updatedAt: null,
        }),
      } : null;
    },

    write(sessionKey: string, value: { pendingQueue: ChatQueuedMessageItem[]; controls: ChatSessionControlState }): void {
      const queue = cloneQueue(value.pendingQueue || []);
      const controls = cloneSessionControls(value.controls || {
        allowHostManagementExec: false,
        updatedAt: null,
      });
      const updatedAt = new Date().toISOString();
      if (database && sqliteHealthy) {
        try {
          database.prepare(`
            INSERT INTO session_state (session_key, updated_at, queue_json, controls_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              updated_at = excluded.updated_at,
              queue_json = excluded.queue_json,
              controls_json = excluded.controls_json
          `).run(
            sessionKey,
            updatedAt,
            JSON.stringify(queue),
            JSON.stringify(controls),
          );
        } catch {
          sqliteHealthy = false;
        }
      }
      const current = readJsonSessionState(config);
      current[sessionKey] = {
        pendingQueue: queue,
        controls,
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
