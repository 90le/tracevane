import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { TracevaneServerConfig } from '../../../../types/api.js';

const require = createRequire(import.meta.url);

const databaseCache = new Map<string, any>();

export function resolveTracevaneChatSqlitePath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, 'tracevane', 'chat.sqlite');
}

export function openTracevaneChatSqliteDatabase(config: TracevaneServerConfig): any | null {
  try {
    const sqlite = require('node:sqlite');
    const DatabaseSync = sqlite?.DatabaseSync;
    if (!DatabaseSync) {
      return null;
    }
    const file = resolveTracevaneChatSqlitePath(config);
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
