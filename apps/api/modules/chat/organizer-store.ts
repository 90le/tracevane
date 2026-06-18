import fs from 'node:fs';
import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import type { ChatSessionOrganizerState } from '../../../../types/chat.js';
import { createEmptyChatSessionOrganizerState, normalizeChatSessionOrganizerState } from '../../../../lib/chat-session-organizer.js';
import { ensureDir, readJsonFile, writeJsonFile } from '../../core/state.js';
import { openTracevaneChatSqliteDatabase } from './chat-sqlite.js';

export function resolveTracevaneChatOrganizerPath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, 'tracevane', 'chat-organizer.json');
}

export function readTracevaneChatOrganizerState(config: TracevaneServerConfig): ChatSessionOrganizerState {
  return normalizeChatSessionOrganizerState(
    readJsonFile<ChatSessionOrganizerState>(resolveTracevaneChatOrganizerPath(config), createEmptyChatSessionOrganizerState()),
  );
}

export function writeTracevaneChatOrganizerState(config: TracevaneServerConfig, value: ChatSessionOrganizerState): void {
  const file = resolveTracevaneChatOrganizerPath(config);
  ensureDir(path.dirname(file));
  writeJsonFile(file, normalizeChatSessionOrganizerState(value));
}

function loadSqliteDatabase(config: TracevaneServerConfig): any | null {
  const database = openTracevaneChatSqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS organizer_state (
        key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    return database;
  } catch {
    return null;
  }
}

export function createTracevaneChatOrganizerStore(config: TracevaneServerConfig) {
  const database = loadSqliteDatabase(config);
  let sqliteHealthy = Boolean(database);
  let jsonHealthy = true;
  return {
    read(): ChatSessionOrganizerState {
      if (database && sqliteHealthy) {
        try {
          const row = database.prepare(`
            SELECT payload_json
            FROM organizer_state
            WHERE key = 'organizer'
          `).get();
          if (row) {
            return normalizeChatSessionOrganizerState(JSON.parse(String(row.payload_json || '{}')));
          }
        } catch {
          sqliteHealthy = false;
        }
      }
      if (!jsonHealthy) {
        return createEmptyChatSessionOrganizerState();
      }
      return readTracevaneChatOrganizerState(config);
    },

    write(value: ChatSessionOrganizerState): ChatSessionOrganizerState {
      const normalized = normalizeChatSessionOrganizerState(value);
      if (database && sqliteHealthy) {
        try {
          database.prepare(`
            INSERT INTO organizer_state (key, payload_json, updated_at)
            VALUES ('organizer', ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
          `).run(
            JSON.stringify(normalized),
            new Date().toISOString(),
          );
        } catch {
          sqliteHealthy = false;
        }
      }
      try {
        writeTracevaneChatOrganizerState(config, normalized);
        jsonHealthy = true;
      } catch {
        jsonHealthy = false;
      }
      return normalized;
    },
  };
}
