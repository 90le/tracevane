import fs from 'node:fs';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type { ChatSessionOrganizerState } from '../../../../types/chat.js';
import { createEmptyChatSessionOrganizerState, normalizeChatSessionOrganizerState } from '../../../../lib/chat-session-organizer.js';
import { ensureDir, readJsonFile, writeJsonFile } from '../../core/state.js';
import { openStudioChatSqliteDatabase } from './chat-sqlite.js';

export function resolveStudioChatOrganizerPath(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, 'studio', 'chat-organizer.json');
}

export function readStudioChatOrganizerState(config: StudioServerConfig): ChatSessionOrganizerState {
  return normalizeChatSessionOrganizerState(
    readJsonFile<ChatSessionOrganizerState>(resolveStudioChatOrganizerPath(config), createEmptyChatSessionOrganizerState()),
  );
}

export function writeStudioChatOrganizerState(config: StudioServerConfig, value: ChatSessionOrganizerState): void {
  const file = resolveStudioChatOrganizerPath(config);
  ensureDir(path.dirname(file));
  writeJsonFile(file, normalizeChatSessionOrganizerState(value));
}

function loadSqliteDatabase(config: StudioServerConfig): any | null {
  const database = openStudioChatSqliteDatabase(config);
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

export function createStudioChatOrganizerStore(config: StudioServerConfig) {
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
      return readStudioChatOrganizerState(config);
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
        writeStudioChatOrganizerState(config, normalized);
        jsonHealthy = true;
      } catch {
        jsonHealthy = false;
      }
      return normalized;
    },
  };
}
