import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { StudioServerConfig } from '../../../../types/api.js';

const require = createRequire(import.meta.url);

const databaseCache = new Map<string, any>();

export function resolveStudioChatSqlitePath(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, 'studio', 'chat.sqlite');
}

export function openStudioChatSqliteDatabase(config: StudioServerConfig): any | null {
  try {
    const sqlite = require('node:sqlite');
    const DatabaseSync = sqlite?.DatabaseSync;
    if (!DatabaseSync) {
      return null;
    }
    const file = resolveStudioChatSqlitePath(config);
    const cached = databaseCache.get(file);
    if (cached) {
      return cached;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const database = new DatabaseSync(file);
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec('PRAGMA journal_mode = WAL;');
    databaseCache.set(file, database);
    return database;
  } catch {
    return null;
  }
}
