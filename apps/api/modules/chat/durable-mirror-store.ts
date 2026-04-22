import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type { ChatMessageItem, ChatObservabilityState } from '../../../../types/chat.js';
import { openStudioChatSqliteDatabase } from './chat-sqlite.js';

const require = createRequire(import.meta.url);

type MirrorBackend = 'sqlite' | 'json';

interface MirrorCheckpointRecord {
  version: string;
  source: string;
  baseMessageSeq: number;
  savedAt: string;
  sourceSignature?: string | null;
  sourceSessionFile?: string | null;
  sourceMtimeMs?: number | null;
  observability?: ChatObservabilityState | null;
  messages: ChatMessageItem[];
}

interface MirrorOpRecord {
  version: string;
  source: string;
  messageSeq: number;
  savedAt: string;
  message: ChatMessageItem;
}

interface JsonMirrorRecord {
  checkpoint: MirrorCheckpointRecord | null;
  oplog: MirrorOpRecord[];
}

export interface DurableMirrorSnapshot {
  sessionKey: string;
  version: string;
  source: string;
  messages: ChatMessageItem[];
  lastMessageSeq: number;
  savedAt: string;
  backend: MirrorBackend;
  sourceSignature: string | null;
  sourceSessionFile: string | null;
  sourceMtimeMs: number | null;
  observability: ChatObservabilityState | null;
}

function encodeSessionKey(sessionKey: string): string {
  return Buffer.from(sessionKey, 'utf-8').toString('base64url');
}

function ensureMirrorDir(config: StudioServerConfig): string {
  const dir = path.join(config.openclawRoot, 'studio', 'chat-durable-mirror');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonMirrorPath(config: StudioServerConfig, sessionKey: string): string {
  return path.join(ensureMirrorDir(config), `${encodeSessionKey(sessionKey)}.json`);
}

function sqliteMirrorPath(config: StudioServerConfig): string {
  return path.join(ensureMirrorDir(config), 'mirror.sqlite');
}

const legacyDatabaseCache = new Map<string, any>();

function cloneMessage<T extends ChatMessageItem>(message: T): T {
  return {
    ...message,
    toolCalls: message.toolCalls?.map((item) => ({
      ...item,
      artifacts: item.artifacts?.map((artifact) => ({ ...artifact })),
    })),
    blocks: message.blocks?.map((item) => ({ ...item })),
    processBlocks: message.processBlocks?.map((item) => ({ ...item })),
    resources: message.resources?.map((item) => ({ ...item })),
    media: message.media?.map((item) => ({ ...item })),
  } as T;
}

function cloneMessages(messages: ChatMessageItem[]): ChatMessageItem[] {
  return messages.map((message) => cloneMessage(message));
}

function cloneObservability<T extends ChatObservabilityState | null | undefined>(value: T): T {
  if (!value) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function readJsonMirrorRecord(config: StudioServerConfig, sessionKey: string): JsonMirrorRecord | null {
  try {
    return JSON.parse(fs.readFileSync(jsonMirrorPath(config, sessionKey), 'utf-8')) as JsonMirrorRecord;
  } catch {
    return null;
  }
}

function writeJsonMirrorRecord(config: StudioServerConfig, sessionKey: string, record: JsonMirrorRecord): void {
  fs.writeFileSync(jsonMirrorPath(config, sessionKey), `${JSON.stringify(record, null, 2)}\n`);
}

function buildSnapshotFromJson(
  sessionKey: string,
  record: JsonMirrorRecord | null,
): DurableMirrorSnapshot | null {
  if (!record?.checkpoint) {
    return null;
  }
  const checkpointMessages = cloneMessages(record.checkpoint.messages || []);
  const oplog = (record.oplog || [])
    .filter((entry) => entry.version === record.checkpoint?.version)
    .sort((left, right) => left.messageSeq - right.messageSeq);
  const oplogMessages = oplog.map((entry) => cloneMessage(entry.message));
  const lastMessageSeq = oplog[oplog.length - 1]?.messageSeq || record.checkpoint.baseMessageSeq || 0;
  return {
    sessionKey,
    version: record.checkpoint.version,
    source: record.checkpoint.source,
    messages: [...checkpointMessages, ...oplogMessages],
    lastMessageSeq,
    savedAt: oplog[oplog.length - 1]?.savedAt || record.checkpoint.savedAt,
    backend: 'json',
    sourceSignature: record.checkpoint.sourceSignature || null,
    sourceSessionFile: record.checkpoint.sourceSessionFile || null,
    sourceMtimeMs: typeof record.checkpoint.sourceMtimeMs === 'number'
      ? record.checkpoint.sourceMtimeMs
      : null,
    observability: cloneObservability(record.checkpoint.observability || null),
  };
}

function ensureSqliteColumn(database: any, table: string, column: string, definition: string): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  if (rows.some((row) => row?.name === column)) {
    return;
  }
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function loadSqliteDatabase(config: StudioServerConfig): any | null {
  const database = openStudioChatSqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS mirror_checkpoint (
        session_key TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        base_message_seq INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        source_signature TEXT,
        source_session_file TEXT,
        source_mtime_ms REAL,
        observability_json TEXT,
        payload_json TEXT NOT NULL
      );
    `);
    ensureSqliteColumn(database, 'mirror_checkpoint', 'observability_json', 'TEXT');
    database.exec(`
      CREATE TABLE IF NOT EXISTS mirror_oplog (
        session_key TEXT NOT NULL,
        version TEXT NOT NULL,
        message_seq INTEGER NOT NULL,
        source TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (session_key, version, message_seq)
      );
    `);
    database.exec(`
      CREATE TABLE IF NOT EXISTS mirror_tombstones (
        session_key TEXT PRIMARY KEY,
        cleared_at TEXT NOT NULL
      );
    `);
    return database;
  } catch {
    return null;
  }
}

function openLegacySqliteDatabase(config: StudioServerConfig): any | null {
  try {
    const sqlite = require('node:sqlite');
    const DatabaseSync = sqlite?.DatabaseSync;
    if (!DatabaseSync) {
      return null;
    }
    const file = sqliteMirrorPath(config);
    if (!fs.existsSync(file)) {
      return null;
    }
    const cached = legacyDatabaseCache.get(file);
    if (cached) {
      return cached;
    }
    const database = new DatabaseSync(file);
    database.exec('PRAGMA busy_timeout = 5000;');
    legacyDatabaseCache.set(file, database);
    return database;
  } catch {
    return null;
  }
}

function buildSnapshotFromSqliteRow(
  sessionKey: string,
  checkpoint: Record<string, unknown> | null | undefined,
  oplogRows: Array<Record<string, unknown>>,
  backend: MirrorBackend,
): DurableMirrorSnapshot | null {
  if (!checkpoint) {
    return null;
  }
  const checkpointMessages = cloneMessages(JSON.parse(String(checkpoint.payload_json || '[]')) as ChatMessageItem[]);
  const oplogMessages = oplogRows.map((row) => cloneMessage(JSON.parse(String(row.payload_json || '{}')) as ChatMessageItem));
  const lastMessageSeq = Number(oplogRows[oplogRows.length - 1]?.message_seq || checkpoint.base_message_seq || 0);
  return {
    sessionKey,
    version: String(checkpoint.version || ''),
    source: String(checkpoint.source || ''),
    messages: [...checkpointMessages, ...oplogMessages],
    lastMessageSeq,
    savedAt: String(oplogRows[oplogRows.length - 1]?.saved_at || checkpoint.saved_at || ''),
    backend,
    sourceSignature: typeof checkpoint.source_signature === 'string' ? checkpoint.source_signature : null,
    sourceSessionFile: typeof checkpoint.source_session_file === 'string' ? checkpoint.source_session_file : null,
    sourceMtimeMs: typeof checkpoint.source_mtime_ms === 'number'
      ? checkpoint.source_mtime_ms
      : (checkpoint.source_mtime_ms ? Number(checkpoint.source_mtime_ms) || null : null),
    observability: checkpoint.observability_json
      ? cloneObservability(JSON.parse(String(checkpoint.observability_json || 'null')) as ChatObservabilityState | null)
      : null,
  };
}

function readLegacySqliteSnapshot(config: StudioServerConfig, sessionKey: string): DurableMirrorSnapshot | null {
  const database = openLegacySqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    const checkpoint = database.prepare(`
      SELECT version, source, base_message_seq, saved_at, payload_json
      FROM mirror_checkpoint
      WHERE session_key = ?
    `).get(sessionKey);
    if (!checkpoint) {
      return null;
    }
    const oplogRows = database.prepare(`
      SELECT message_seq, saved_at, payload_json
      FROM mirror_oplog
      WHERE session_key = ? AND version = ?
      ORDER BY message_seq ASC
    `).all(sessionKey, checkpoint.version) as Array<Record<string, unknown>>;
    return buildSnapshotFromSqliteRow(sessionKey, checkpoint as Record<string, unknown>, oplogRows, 'sqlite');
  } catch {
    return null;
  }
}

function clearLegacySqliteSession(config: StudioServerConfig, sessionKey: string): void {
  const database = openLegacySqliteDatabase(config);
  if (!database) {
    return;
  }
  try {
    database.exec('BEGIN');
    database.prepare('DELETE FROM mirror_oplog WHERE session_key = ?').run(sessionKey);
    database.prepare('DELETE FROM mirror_checkpoint WHERE session_key = ?').run(sessionKey);
    database.exec('COMMIT');
  } catch {
    try {
      database.exec('ROLLBACK');
    } catch {}
  }
}

function writeSqliteSnapshot(database: any, params: {
  sessionKey: string;
  version: string;
  source: string;
  messages: ChatMessageItem[];
  baseMessageSeq: number;
  savedAt: string;
  sourceSignature?: string | null;
  sourceSessionFile?: string | null;
  sourceMtimeMs?: number | null;
  observability?: ChatObservabilityState | null;
}): void {
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM mirror_tombstones WHERE session_key = ?').run(params.sessionKey);
    database.prepare('DELETE FROM mirror_oplog WHERE session_key = ?').run(params.sessionKey);
    database.prepare(`
      INSERT INTO mirror_checkpoint (
        session_key,
        version,
        source,
        base_message_seq,
        saved_at,
        source_signature,
        source_session_file,
        source_mtime_ms,
        observability_json,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        version = excluded.version,
        source = excluded.source,
        base_message_seq = excluded.base_message_seq,
        saved_at = excluded.saved_at,
        source_signature = excluded.source_signature,
        source_session_file = excluded.source_session_file,
        source_mtime_ms = excluded.source_mtime_ms,
        observability_json = excluded.observability_json,
        payload_json = excluded.payload_json
    `).run(
      params.sessionKey,
      params.version,
      params.source,
      params.baseMessageSeq,
      params.savedAt,
      params.sourceSignature || null,
      params.sourceSessionFile || null,
      params.sourceMtimeMs ?? null,
      params.observability ? JSON.stringify(cloneObservability(params.observability)) : null,
      JSON.stringify(cloneMessages(params.messages)),
    );
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function hasSqliteTombstone(database: any, sessionKey: string): boolean {
  const row = database.prepare(`
    SELECT 1
    FROM mirror_tombstones
    WHERE session_key = ?
  `).get(sessionKey);
  return Boolean(row);
}

export function createStudioChatDurableMirrorStore(config: StudioServerConfig) {
  const database = loadSqliteDatabase(config);
  const backend: MirrorBackend = database ? 'sqlite' : 'json';

  return {
    backend,

    readSession(sessionKey: string): DurableMirrorSnapshot | null {
      if (database) {
        const checkpoint = database.prepare(`
          SELECT version, source, base_message_seq, saved_at, source_signature, source_session_file, source_mtime_ms, payload_json
          , observability_json
          FROM mirror_checkpoint
          WHERE session_key = ?
        `).get(sessionKey) as Record<string, unknown> | undefined;
        if (checkpoint) {
          const oplogRows = database.prepare(`
            SELECT message_seq, saved_at, payload_json
            FROM mirror_oplog
            WHERE session_key = ? AND version = ?
            ORDER BY message_seq ASC
          `).all(sessionKey, checkpoint.version) as Array<Record<string, unknown>>;
          return buildSnapshotFromSqliteRow(sessionKey, checkpoint, oplogRows, 'sqlite');
        }
        if (hasSqliteTombstone(database, sessionKey)) {
          return null;
        }
        const legacySnapshot = readLegacySqliteSnapshot(config, sessionKey);
        if (legacySnapshot) {
          writeSqliteSnapshot(database, {
            sessionKey,
            version: legacySnapshot.version,
            source: legacySnapshot.source,
            messages: legacySnapshot.messages,
            baseMessageSeq: legacySnapshot.lastMessageSeq,
            savedAt: legacySnapshot.savedAt,
            sourceSignature: legacySnapshot.sourceSignature,
            sourceSessionFile: legacySnapshot.sourceSessionFile,
            sourceMtimeMs: legacySnapshot.sourceMtimeMs,
            observability: legacySnapshot.observability,
          });
          return legacySnapshot;
        }
        return null;
      }
      return buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
    },

    replaceSnapshot(params: {
      sessionKey: string;
      version: string;
      source: string;
      messages: ChatMessageItem[];
      baseMessageSeq: number;
      savedAt: string;
      sourceSignature?: string | null;
      sourceSessionFile?: string | null;
      sourceMtimeMs?: number | null;
      observability?: ChatObservabilityState | null;
    }): void {
      if (database) {
        writeSqliteSnapshot(database, params);
        return;
      }

      writeJsonMirrorRecord(config, params.sessionKey, {
        checkpoint: {
          version: params.version,
          source: params.source,
          baseMessageSeq: params.baseMessageSeq,
          savedAt: params.savedAt,
          sourceSignature: params.sourceSignature || null,
          sourceSessionFile: params.sourceSessionFile || null,
          sourceMtimeMs: params.sourceMtimeMs ?? null,
          observability: cloneObservability(params.observability || null),
          messages: cloneMessages(params.messages),
        },
        oplog: [],
      });
    },

    appendMessage(params: {
      sessionKey: string;
      version: string;
      source: string;
      messageSeq: number;
      savedAt: string;
      message: ChatMessageItem;
    }): void {
      if (database) {
        database.prepare('DELETE FROM mirror_tombstones WHERE session_key = ?').run(params.sessionKey);
        database.prepare(`
          INSERT OR REPLACE INTO mirror_oplog (session_key, version, message_seq, source, saved_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          params.sessionKey,
          params.version,
          params.messageSeq,
          params.source,
          params.savedAt,
          JSON.stringify(cloneMessage(params.message)),
        );
        return;
      }

      const current = readJsonMirrorRecord(config, params.sessionKey) || {
        checkpoint: null,
        oplog: [],
      };
      current.oplog = (current.oplog || [])
        .filter((entry) => !(entry.version === params.version && entry.messageSeq === params.messageSeq))
        .concat({
          version: params.version,
          source: params.source,
          messageSeq: params.messageSeq,
          savedAt: params.savedAt,
          message: cloneMessage(params.message),
        })
        .sort((left, right) => left.messageSeq - right.messageSeq);
      writeJsonMirrorRecord(config, params.sessionKey, current);
    },

    clearSession(sessionKey: string): void {
      if (database) {
        database.exec('BEGIN');
        try {
          database.prepare('DELETE FROM mirror_oplog WHERE session_key = ?').run(sessionKey);
          database.prepare('DELETE FROM mirror_checkpoint WHERE session_key = ?').run(sessionKey);
          database.prepare(`
            INSERT INTO mirror_tombstones (session_key, cleared_at)
            VALUES (?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              cleared_at = excluded.cleared_at
          `).run(sessionKey, new Date().toISOString());
          database.exec('COMMIT');
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }
      clearLegacySqliteSession(config, sessionKey);
      try {
        fs.rmSync(jsonMirrorPath(config, sessionKey), { force: true });
      } catch {}
    },
  };
}
