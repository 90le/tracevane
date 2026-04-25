import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type {
  ChatHistorySearchContentFilter,
  ChatHistorySearchRoleFilter,
  ChatMessageItem,
  ChatObservabilityState,
} from '../../../../types/chat.js';
import { openStudioChatSqliteDatabase } from './chat-sqlite.js';
import { clipPreview } from './shared.js';

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

export interface DurableMirrorSessionMeta {
  sessionKey: string;
  version: string;
  source: string;
  savedAt: string;
  backend: MirrorBackend;
  sourceSignature: string | null;
  sourceSessionFile: string | null;
  sourceMtimeMs: number | null;
  observability: ChatObservabilityState | null;
}

export interface DurableMirrorMessageStub {
  id: string;
  role: string;
  createdAt: string | null;
  runId: string | null;
}

export interface DurableMirrorDateBucket {
  day: string;
  count: number;
  firstMessageId: string | null;
  lastMessageId: string | null;
}

export interface DurableMirrorSearchStub {
  id: string;
  role: string;
  createdAt: string | null;
  runId: string | null;
  messageIndex: number;
  previewText: string;
  hasText: boolean;
  hasResources: boolean;
  hasCode: boolean;
}

export interface DurableMirrorPageBoundary {
  anchorIndex: number;
  anchorMessageId: string | null;
  anchorCreatedAt: string | null;
}

export interface DurableMirrorMessageWindow {
  messages: ChatMessageItem[];
  day: string | null;
  totalCount: number;
  startOffset: number;
  endOffset: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  beforeBoundary: DurableMirrorPageBoundary | null;
  afterBoundary: DurableMirrorPageBoundary | null;
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

function buildFtsTokens(value: string): string[] {
  const normalized = normalizeIndexText(value);
  const baseTerms = tokenizeIndexText(normalized);
  const tokens: string[] = [];
  for (const term of baseTerms) {
    if (!containsCJK(term)) {
      tokens.push(term);
      continue;
    }
    const chars = [...term];
    if (chars.length <= 1) {
      tokens.push(term);
      continue;
    }
    for (let index = 0; index < chars.length - 1; index += 1) {
      tokens.push(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return [...new Set(tokens.filter(Boolean))];
}

function buildFtsSearchText(value: string): string {
  return buildFtsTokens(value).join(' ');
}

function buildFtsMatchExpression(value: string): string | null {
  const terms = buildFtsTokens(value);
  if (!terms.length) {
    return null;
  }
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ');
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

function normalizeDayKey(createdAt: string | null | undefined): string | null {
  if (!createdAt) {
    return null;
  }
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
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

function computeWindowRange(params: {
  totalCount: number;
  limit: number;
  anchorOffset: number | null;
  beforeOffset: number | null;
  afterOffset: number | null;
}): { start: number; end: number } {
  const total = Math.max(0, params.totalCount);
  const limit = Math.max(1, params.limit);
  let start: number;
  let end: number;

  if (params.anchorOffset != null && params.anchorOffset >= 0 && params.anchorOffset < total) {
    const before = Math.floor(limit / 2);
    const after = Math.ceil(limit / 2);
    start = Math.max(0, params.anchorOffset - before);
    end = Math.min(total, params.anchorOffset + after + 1);
    if (start === 0) {
      end = Math.min(total, start + limit + 1);
    } else if (end === total) {
      start = Math.max(0, end - limit - 1);
    }
    return { start, end };
  }

  if (params.afterOffset != null && params.afterOffset >= 0) {
    start = Math.min(total, params.afterOffset);
    end = Math.min(total, start + limit);
    return { start, end };
  }

  if (params.beforeOffset != null && params.beforeOffset >= 0) {
    end = Math.min(total, params.beforeOffset);
    start = Math.max(0, end - limit);
    return { start, end };
  }

  end = total;
  start = Math.max(0, end - limit);
  return { start, end };
}

function hasCodeFormatting(text: string): boolean {
  return /```/.test(text) || /^\s{4,}\S/m.test(text);
}

function hasMessageText(message: ChatMessageItem): boolean {
  return Boolean((message.text || '').trim());
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
      CREATE TABLE IF NOT EXISTS mirror_messages (
        session_key TEXT NOT NULL,
        message_id TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        role TEXT,
        created_at TEXT,
        day_key TEXT,
        run_id TEXT,
        search_text TEXT,
        preview_text TEXT,
        has_text INTEGER,
        has_resources INTEGER,
        has_code INTEGER,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (session_key, message_id)
      );
    `);
    ensureSqliteColumn(database, 'mirror_messages', 'role', 'TEXT');
    ensureSqliteColumn(database, 'mirror_messages', 'created_at', 'TEXT');
    ensureSqliteColumn(database, 'mirror_messages', 'day_key', 'TEXT');
    ensureSqliteColumn(database, 'mirror_messages', 'run_id', 'TEXT');
    ensureSqliteColumn(database, 'mirror_messages', 'search_text', 'TEXT');
    ensureSqliteColumn(database, 'mirror_messages', 'preview_text', 'TEXT');
    ensureSqliteColumn(database, 'mirror_messages', 'has_text', 'INTEGER');
    ensureSqliteColumn(database, 'mirror_messages', 'has_resources', 'INTEGER');
    ensureSqliteColumn(database, 'mirror_messages', 'has_code', 'INTEGER');
    database.exec(`
      CREATE INDEX IF NOT EXISTS mirror_messages_session_index
      ON mirror_messages (session_key, message_index);
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS mirror_messages_session_day_index
      ON mirror_messages (session_key, day_key, message_index);
    `);
    try {
      database.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS mirror_messages_fts
        USING fts5(
          session_key UNINDEXED,
          message_id UNINDEXED,
          message_index UNINDEXED,
          day_key UNINDEXED,
          role UNINDEXED,
          run_id UNINDEXED,
          has_text UNINDEXED,
          has_resources UNINDEXED,
          has_code UNINDEXED,
          preview_text UNINDEXED,
          search_text,
          tokenize='unicode61'
        );
      `);
    } catch {}
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

function buildSessionMetaFromCheckpointRow(
  sessionKey: string,
  checkpoint: Record<string, unknown> | null | undefined,
  backend: MirrorBackend,
): DurableMirrorSessionMeta | null {
  if (!checkpoint) {
    return null;
  }
  return {
    sessionKey,
    version: String(checkpoint.version || ''),
    source: String(checkpoint.source || ''),
    savedAt: String(checkpoint.saved_at || ''),
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

function readSqliteCheckpointRow(database: any, sessionKey: string): Record<string, unknown> | undefined {
  return database.prepare(`
    SELECT version, source, base_message_seq, saved_at, source_signature, source_session_file, source_mtime_ms, payload_json
    , observability_json
    FROM mirror_checkpoint
    WHERE session_key = ?
  `).get(sessionKey) as Record<string, unknown> | undefined;
}

function hydrateSqliteMessageRowsFromSnapshot(
  database: any,
  sessionKey: string,
  messages: ChatMessageItem[],
): void {
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM mirror_messages WHERE session_key = ?').run(sessionKey);
    const insertMessage = database.prepare(`
      INSERT INTO mirror_messages (session_key, message_id, message_index, role, created_at, day_key, run_id, search_text, preview_text, has_text, has_resources, has_code, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key, message_id) DO UPDATE SET
        message_index = excluded.message_index,
        role = excluded.role,
        created_at = excluded.created_at,
        day_key = excluded.day_key,
        run_id = excluded.run_id,
        search_text = excluded.search_text,
        preview_text = excluded.preview_text,
        has_text = excluded.has_text,
        has_resources = excluded.has_resources,
        has_code = excluded.has_code,
        payload_json = excluded.payload_json
    `);
    messages.forEach((message, index) => {
      insertMessage.run(
        sessionKey,
        message.id,
        index,
        message.role || null,
        message.createdAt || null,
        normalizeDayKey(message.createdAt),
        message.runId || null,
        normalizeIndexText(buildPreviewText(message)),
        buildPreviewText(message),
        hasMessageText(message) ? 1 : 0,
        (message.resources || []).length > 0 ? 1 : 0,
        hasCodeFormatting(message.text || '') ? 1 : 0,
        JSON.stringify(cloneMessage(message)),
      );
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function ensureSqliteMessageRowsLoaded(
  database: any,
  config: StudioServerConfig,
  sessionKey: string,
): boolean {
  const countRow = database.prepare(`
    SELECT COUNT(*) AS count
    FROM mirror_messages
    WHERE session_key = ?
  `).get(sessionKey) as { count?: number } | undefined;
  if (Number(countRow?.count || 0) > 0) {
    return true;
  }
  const checkpoint = readSqliteCheckpointRow(database, sessionKey);
  if (checkpoint) {
    const oplogRows = database.prepare(`
      SELECT message_seq, saved_at, payload_json
      FROM mirror_oplog
      WHERE session_key = ? AND version = ?
      ORDER BY message_seq ASC
    `).all(sessionKey, checkpoint.version) as Array<Record<string, unknown>>;
    const snapshot = buildSnapshotFromSqliteRow(sessionKey, checkpoint, oplogRows, 'sqlite');
    if (snapshot) {
      hydrateSqliteMessageRowsFromSnapshot(database, sessionKey, snapshot.messages);
      return true;
    }
  }
  if (!hasSqliteTombstone(database, sessionKey)) {
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
      return true;
    }
  }
  return false;
}

function sqliteHasMirrorFtsTable(database: any): boolean {
  try {
    const row = database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'mirror_messages_fts'
      LIMIT 1
    `).get() as { name?: string } | undefined;
    return Boolean(row?.name);
  } catch {
    return false;
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
    database.prepare('DELETE FROM mirror_messages WHERE session_key = ?').run(params.sessionKey);
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
    const insertMessage = database.prepare(`
      INSERT INTO mirror_messages (session_key, message_id, message_index, role, created_at, day_key, run_id, search_text, preview_text, has_text, has_resources, has_code, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key, message_id) DO UPDATE SET
        message_index = excluded.message_index,
        role = excluded.role,
        created_at = excluded.created_at,
        day_key = excluded.day_key,
        run_id = excluded.run_id,
        search_text = excluded.search_text,
        preview_text = excluded.preview_text,
        has_text = excluded.has_text,
        has_resources = excluded.has_resources,
        has_code = excluded.has_code,
        payload_json = excluded.payload_json
    `);
    params.messages.forEach((message, index) => {
      insertMessage.run(
        params.sessionKey,
        message.id,
        index,
        message.role || null,
        message.createdAt || null,
        normalizeDayKey(message.createdAt),
        message.runId || null,
        normalizeIndexText(buildPreviewText(message)),
        buildPreviewText(message),
        hasMessageText(message) ? 1 : 0,
        (message.resources || []).length > 0 ? 1 : 0,
        hasCodeFormatting(message.text || '') ? 1 : 0,
        JSON.stringify(cloneMessage(message)),
      );
    });
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
  let sqliteFtsHealthy = database ? sqliteHasMirrorFtsTable(database) : false;

  function syncSqliteFtsSnapshot(sessionKey: string, messages: ChatMessageItem[]): void {
    if (!database || !sqliteFtsHealthy) {
      return;
    }
    database.exec('BEGIN');
    try {
      database.prepare('DELETE FROM mirror_messages_fts WHERE session_key = ?').run(sessionKey);
      const insertFts = database.prepare(`
        INSERT INTO mirror_messages_fts (
          session_key,
          message_id,
          message_index,
          day_key,
          role,
          run_id,
          has_text,
          has_resources,
          has_code,
          preview_text,
          search_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      messages.forEach((message, index) => {
        insertFts.run(
          sessionKey,
          message.id,
          index,
          normalizeDayKey(message.createdAt),
          message.role || null,
          message.runId || null,
          hasMessageText(message) ? 1 : 0,
          (message.resources || []).length > 0 ? 1 : 0,
          hasCodeFormatting(message.text || '') ? 1 : 0,
          buildPreviewText(message),
          buildFtsSearchText(buildPreviewText(message)),
        );
      });
      database.exec('COMMIT');
    } catch {
      try { database.exec('ROLLBACK'); } catch {}
      sqliteFtsHealthy = false;
    }
  }

  function syncSqliteFtsRow(sessionKey: string, message: ChatMessageItem, messageIndex: number): void {
    if (!database || !sqliteFtsHealthy) {
      return;
    }
    try {
      database.prepare('DELETE FROM mirror_messages_fts WHERE session_key = ? AND message_id = ?').run(sessionKey, message.id);
      database.prepare(`
        INSERT INTO mirror_messages_fts (
          session_key,
          message_id,
          message_index,
          day_key,
          role,
          run_id,
          has_text,
          has_resources,
          has_code,
          preview_text,
          search_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionKey,
        message.id,
        messageIndex,
        normalizeDayKey(message.createdAt),
        message.role || null,
        message.runId || null,
        hasMessageText(message) ? 1 : 0,
        (message.resources || []).length > 0 ? 1 : 0,
        hasCodeFormatting(message.text || '') ? 1 : 0,
        buildPreviewText(message),
        buildFtsSearchText(buildPreviewText(message)),
      );
    } catch {
      sqliteFtsHealthy = false;
    }
  }

  function ensureSqliteFtsRowsLoaded(sessionKey: string): void {
    if (!database || !sqliteFtsHealthy) {
      return;
    }
    try {
      const messageCount = Number(
        database.prepare('SELECT COUNT(*) AS count FROM mirror_messages WHERE session_key = ?').get(sessionKey)?.count || 0,
      );
      if (messageCount <= 0) {
        return;
      }
      const ftsCount = Number(
        database.prepare('SELECT COUNT(*) AS count FROM mirror_messages_fts WHERE session_key = ?').get(sessionKey)?.count || 0,
      );
      if (ftsCount >= messageCount) {
        return;
      }
      const checkpoint = readSqliteCheckpointRow(database, sessionKey);
      if (checkpoint) {
        const oplogRows = database.prepare(`
          SELECT message_seq, saved_at, payload_json
          FROM mirror_oplog
          WHERE session_key = ? AND version = ?
          ORDER BY message_seq ASC
        `).all(sessionKey, checkpoint.version) as Array<Record<string, unknown>>;
        const snapshot = buildSnapshotFromSqliteRow(sessionKey, checkpoint, oplogRows, 'sqlite');
        if (snapshot) {
          syncSqliteFtsSnapshot(sessionKey, snapshot.messages);
        }
      }
    } catch {
      sqliteFtsHealthy = false;
    }
  }

  function readSqliteWindowBoundary(
    sessionKey: string,
    day: string | null,
    offset: number,
  ): DurableMirrorPageBoundary | null {
    if (!database || offset < 0) {
      return null;
    }
    ensureSqliteMessageRowsLoaded(database, config, sessionKey);
    const where = ['session_key = ?'];
    const params: unknown[] = [sessionKey];
    if (day) {
      where.push('day_key = ?');
      params.push(day);
    }
    const row = database.prepare(`
      SELECT message_id, created_at
      FROM mirror_messages
      WHERE ${where.join(' AND ')}
      ORDER BY message_index ASC
      LIMIT 1 OFFSET ?
    `).get(...params, offset) as { message_id?: string | null; created_at?: string | null } | undefined;
    if (!row) {
      return null;
    }
    return {
      anchorIndex: offset,
      anchorMessageId: typeof row.message_id === 'string' && row.message_id ? row.message_id : null,
      anchorCreatedAt: typeof row.created_at === 'string' && row.created_at ? row.created_at : null,
    };
  }

  function resolveSqliteFilteredOffset(params: {
    sessionKey: string;
    day: string | null;
    anchorMessageId?: string | null;
    anchorIndex?: number | null;
  }): number | null {
    if (!database) {
      return null;
    }
    ensureSqliteMessageRowsLoaded(database, config, params.sessionKey);
    if (params.anchorMessageId) {
      const where = ['m.session_key = ?'];
      const queryParams: unknown[] = [params.sessionKey];
      if (params.day) {
        where.push('m.day_key = ?');
        queryParams.push(params.day);
      }
      const row = database.prepare(`
        SELECT COUNT(*) AS offset
        FROM mirror_messages AS m
        WHERE ${where.join(' AND ')}
          AND m.message_index < (
            SELECT message_index
            FROM mirror_messages
            WHERE session_key = ? AND message_id = ?
            LIMIT 1
          )
      `).get(...queryParams, params.sessionKey, params.anchorMessageId) as { offset?: number } | undefined;
      if (row && Number.isFinite(row.offset)) {
        return Number(row.offset);
      }
    }
    if (typeof params.anchorIndex === 'number' && Number.isFinite(params.anchorIndex) && params.anchorIndex >= 0) {
      return params.anchorIndex;
    }
    return null;
  }

  function readSqliteMessageWindow(sessionKey: string, options: {
    before?: { anchorIndex?: number | null; anchorMessageId?: string | null } | null;
    after?: { anchorIndex?: number | null; anchorMessageId?: string | null } | null;
    anchor?: string | null;
    limit?: number;
    day?: string | null;
  }): DurableMirrorMessageWindow | null {
    if (!database) {
      return null;
    }
    ensureSqliteMessageRowsLoaded(database, config, sessionKey);
    const day = options.day || null;
    const where = ['session_key = ?'];
    const baseParams: unknown[] = [sessionKey];
    if (day) {
      where.push('day_key = ?');
      baseParams.push(day);
    }
    const countRow = database.prepare(`
      SELECT COUNT(*) AS count
      FROM mirror_messages
      WHERE ${where.join(' AND ')}
    `).get(...baseParams) as { count?: number } | undefined;
    const totalCount = Number(countRow?.count || 0);
    if (totalCount <= 0) {
      return {
        messages: [],
        day,
        totalCount: 0,
        startOffset: 0,
        endOffset: 0,
        hasMoreBefore: false,
        hasMoreAfter: false,
        beforeBoundary: null,
        afterBoundary: null,
      };
    }
    const limit = Math.max(1, Number(options.limit || 50));
    const anchorOffset = resolveSqliteFilteredOffset({
      sessionKey,
      day,
      anchorMessageId: options.anchor || null,
      anchorIndex: null,
    });
    const beforeOffset = resolveSqliteFilteredOffset({
      sessionKey,
      day,
      anchorMessageId: options.before?.anchorMessageId || null,
      anchorIndex: options.before?.anchorIndex ?? null,
    });
    const afterOffset = resolveSqliteFilteredOffset({
      sessionKey,
      day,
      anchorMessageId: options.after?.anchorMessageId || null,
      anchorIndex: options.after?.anchorIndex ?? null,
    });
    const { start, end } = computeWindowRange({
      totalCount,
      limit,
      anchorOffset,
      beforeOffset,
      afterOffset,
    });
    const rows = database.prepare(`
      SELECT payload_json
      FROM mirror_messages
      WHERE ${where.join(' AND ')}
      ORDER BY message_index ASC
      LIMIT ? OFFSET ?
    `).all(...baseParams, Math.max(0, end - start), start) as Array<{ payload_json: string }>;
    const messages = rows.map((row) => cloneMessage(JSON.parse(String(row.payload_json || '{}')) as ChatMessageItem));
    return {
      messages,
      day,
      totalCount,
      startOffset: start,
      endOffset: end,
      hasMoreBefore: start > 0,
      hasMoreAfter: end < totalCount,
      beforeBoundary: start > 0 ? readSqliteWindowBoundary(sessionKey, day, start) : null,
      afterBoundary: end < totalCount ? readSqliteWindowBoundary(sessionKey, day, end) : null,
    };
  }

  return {
    backend,

    readSessionMeta(sessionKey: string): DurableMirrorSessionMeta | null {
      if (database) {
        const checkpoint = readSqliteCheckpointRow(database, sessionKey);
        if (checkpoint) {
          return buildSessionMetaFromCheckpointRow(sessionKey, checkpoint, 'sqlite');
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
          return {
            sessionKey,
            version: legacySnapshot.version,
            source: legacySnapshot.source,
            savedAt: legacySnapshot.savedAt,
            backend: 'sqlite',
            sourceSignature: legacySnapshot.sourceSignature,
            sourceSessionFile: legacySnapshot.sourceSessionFile,
            sourceMtimeMs: legacySnapshot.sourceMtimeMs,
            observability: cloneObservability(legacySnapshot.observability),
          };
        }
        return null;
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return null;
      }
      return {
        sessionKey,
        version: snapshot.version,
        source: snapshot.source,
        savedAt: snapshot.savedAt,
        backend: 'json',
        sourceSignature: snapshot.sourceSignature,
        sourceSessionFile: snapshot.sourceSessionFile,
        sourceMtimeMs: snapshot.sourceMtimeMs,
        observability: cloneObservability(snapshot.observability),
      };
    },

    readMessagesByIds(sessionKey: string, messageIds: string[]): ChatMessageItem[] {
      if (!messageIds.length) {
        return [];
      }
      if (database) {
        const readRows = (): Array<{ message_id: string; payload_json: string }> => {
          const placeholders = messageIds.map(() => '?').join(', ');
          return database.prepare(`
            SELECT message_id, payload_json
            FROM mirror_messages
            WHERE session_key = ? AND message_id IN (${placeholders})
          `).all(sessionKey, ...messageIds) as Array<{ message_id: string; payload_json: string }>;
        };

        let rows = readRows();
        if (rows.length < messageIds.length) {
          if (ensureSqliteMessageRowsLoaded(database, config, sessionKey)) {
            rows = readRows();
          }
        }

        const byId = new Map(rows.map((row) => [
          String(row.message_id || ''),
          cloneMessage(JSON.parse(String(row.payload_json || '{}')) as ChatMessageItem),
        ]));
        return messageIds
          .map((messageId) => byId.get(messageId))
          .filter((message): message is ChatMessageItem => Boolean(message));
      }

      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return [];
      }
      const byId = new Map(snapshot.messages.map((message) => [message.id, cloneMessage(message)]));
      return messageIds
        .map((messageId) => byId.get(messageId))
        .filter((message): message is ChatMessageItem => Boolean(message));
    },

    readMessageCount(sessionKey: string): number | null {
      if (database) {
        const checkpoint = readSqliteCheckpointRow(database, sessionKey);
        if (!checkpoint) {
          if (hasSqliteTombstone(database, sessionKey)) {
            return 0;
          }
          const legacySnapshot = readLegacySqliteSnapshot(config, sessionKey);
          if (!legacySnapshot) {
            return null;
          }
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
        }
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        const row = database.prepare(`
          SELECT COUNT(*) AS count
          FROM mirror_messages
          WHERE session_key = ?
        `).get(sessionKey) as { count?: number } | undefined;
        return Number(row?.count || 0);
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      return snapshot ? snapshot.messages.length : null;
    },

    readMessageIndex(sessionKey: string, messageId: string): number | null {
      if (!messageId) {
        return null;
      }
      if (database) {
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        const row = database.prepare(`
          SELECT message_index
          FROM mirror_messages
          WHERE session_key = ? AND message_id = ?
        `).get(sessionKey, messageId) as { message_index?: number } | undefined;
        if (typeof row?.message_index === 'number') {
          return row.message_index;
        }
        return null;
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return null;
      }
      const index = snapshot.messages.findIndex((message) => message.id === messageId);
      return index >= 0 ? index : null;
    },

    readMessagesInIndexRange(sessionKey: string, startInclusive: number, endExclusive: number): ChatMessageItem[] {
      if (endExclusive <= startInclusive) {
        return [];
      }
      if (database) {
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        const rows = database.prepare(`
          SELECT payload_json
          FROM mirror_messages
          WHERE session_key = ? AND message_index >= ? AND message_index < ?
          ORDER BY message_index ASC
        `).all(sessionKey, startInclusive, endExclusive) as Array<{ payload_json: string }>;
        return rows.map((row) => cloneMessage(JSON.parse(String(row.payload_json || '{}')) as ChatMessageItem));
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return [];
      }
      return snapshot.messages.slice(startInclusive, endExclusive).map((message) => cloneMessage(message));
    },

    readMessageWindow(sessionKey: string, options: {
      before?: { anchorIndex?: number | null; anchorMessageId?: string | null } | null;
      after?: { anchorIndex?: number | null; anchorMessageId?: string | null } | null;
      anchor?: string | null;
      limit?: number;
      day?: string | null;
    }): DurableMirrorMessageWindow | null {
      if (database) {
        return readSqliteMessageWindow(sessionKey, options);
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return null;
      }
      const day = options.day || null;
      const filtered = day
        ? snapshot.messages.filter((message) => normalizeDayKey(message.createdAt) === day)
        : snapshot.messages.slice();
      const offsetById = new Map(filtered.map((message, index) => [message.id, index]));
      const { start, end } = computeWindowRange({
        totalCount: filtered.length,
        limit: Math.max(1, Number(options.limit || 50)),
        anchorOffset: options.anchor ? (offsetById.get(options.anchor) ?? null) : null,
        beforeOffset: options.before?.anchorMessageId
          ? (offsetById.get(options.before.anchorMessageId) ?? options.before.anchorIndex ?? null)
          : (options.before?.anchorIndex ?? null),
        afterOffset: options.after?.anchorMessageId
          ? (offsetById.get(options.after.anchorMessageId) ?? options.after.anchorIndex ?? null)
          : (options.after?.anchorIndex ?? null),
      });
      const messages = filtered.slice(start, end).map((message) => cloneMessage(message));
      const beforeBoundaryMessage = start > 0 ? filtered[start] : null;
      const afterBoundaryMessage = end < filtered.length ? filtered[end] : null;
      return {
        messages,
        day,
        totalCount: filtered.length,
        startOffset: start,
        endOffset: end,
        hasMoreBefore: start > 0,
        hasMoreAfter: end < filtered.length,
        beforeBoundary: beforeBoundaryMessage ? {
          anchorIndex: start,
          anchorMessageId: beforeBoundaryMessage.id,
          anchorCreatedAt: beforeBoundaryMessage.createdAt || null,
        } : null,
        afterBoundary: afterBoundaryMessage ? {
          anchorIndex: end,
          anchorMessageId: afterBoundaryMessage.id,
          anchorCreatedAt: afterBoundaryMessage.createdAt || null,
        } : null,
      };
    },

    readMessageStubsForDay(sessionKey: string, day: string): DurableMirrorMessageStub[] {
      if (!day) {
        return [];
      }
      if (database) {
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        const rows = database.prepare(`
          SELECT message_id, role, created_at, run_id
          FROM mirror_messages
          WHERE session_key = ? AND day_key = ?
          ORDER BY message_index ASC
        `).all(sessionKey, day) as Array<{
          message_id: string;
          role?: string | null;
          created_at?: string | null;
          run_id?: string | null;
        }>;
        return rows.map((row) => ({
          id: String(row.message_id || ''),
          role: typeof row.role === 'string' && row.role ? row.role : 'assistant',
          createdAt: typeof row.created_at === 'string' && row.created_at ? row.created_at : null,
          runId: typeof row.run_id === 'string' && row.run_id ? row.run_id : null,
        }));
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return [];
      }
      return snapshot.messages
        .filter((message) => normalizeDayKey(message.createdAt) === day)
        .map((message) => ({
          id: message.id,
          role: message.role,
          createdAt: message.createdAt || null,
          runId: message.runId || null,
        }));
    },

    readDateBuckets(sessionKey: string): DurableMirrorDateBucket[] {
      if (database) {
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        const rows = database.prepare(`
          SELECT
            day_key,
            COUNT(*) AS count,
            MIN(message_index) AS first_index,
            MAX(message_index) AS last_index
          FROM mirror_messages
          WHERE session_key = ? AND day_key IS NOT NULL
          GROUP BY day_key
          ORDER BY day_key DESC
        `).all(sessionKey) as Array<{
          day_key?: string | null;
          count?: number;
          first_index?: number;
          last_index?: number;
        }>;
        const lookupMessageId = database.prepare(`
          SELECT message_id
          FROM mirror_messages
          WHERE session_key = ? AND message_index = ?
          LIMIT 1
        `);
        return rows
          .map((row) => {
            const day = typeof row.day_key === 'string' ? row.day_key : '';
            if (!day) {
              return null;
            }
            const first = lookupMessageId.get(sessionKey, Number(row.first_index ?? -1)) as { message_id?: string } | undefined;
            const last = lookupMessageId.get(sessionKey, Number(row.last_index ?? -1)) as { message_id?: string } | undefined;
            return {
              day,
              count: Number(row.count || 0),
              firstMessageId: typeof first?.message_id === 'string' ? first.message_id : null,
              lastMessageId: typeof last?.message_id === 'string' ? last.message_id : null,
            } satisfies DurableMirrorDateBucket;
          })
          .filter((bucket): bucket is DurableMirrorDateBucket => Boolean(bucket));
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return [];
      }
      const byDay = new Map<string, DurableMirrorDateBucket>();
      for (const message of snapshot.messages) {
        const day = normalizeDayKey(message.createdAt);
        if (!day) {
          continue;
        }
        const current = byDay.get(day);
        if (!current) {
          byDay.set(day, {
            day,
            count: 1,
            firstMessageId: message.id,
            lastMessageId: message.id,
          });
          continue;
        }
        current.count += 1;
        current.lastMessageId = message.id;
      }
      return [...byDay.values()].sort((left, right) => right.day.localeCompare(left.day));
    },

    listSearchStubs(sessionKey: string): DurableMirrorSearchStub[] {
      if (database) {
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        const rows = database.prepare(`
          SELECT message_id, message_index, role, created_at, run_id, preview_text, has_text, has_resources, has_code
          FROM mirror_messages
          WHERE session_key = ?
          ORDER BY message_index ASC
        `).all(sessionKey) as Array<{
          message_id: string;
          message_index?: number | null;
          role?: string | null;
          created_at?: string | null;
          run_id?: string | null;
          preview_text?: string | null;
          has_text?: number | null;
          has_resources?: number | null;
          has_code?: number | null;
        }>;
        return rows.map((row) => ({
          id: String(row.message_id || ''),
          messageIndex: Number(row.message_index ?? 0),
          role: typeof row.role === 'string' && row.role ? row.role : 'assistant',
          createdAt: typeof row.created_at === 'string' && row.created_at ? row.created_at : null,
          runId: typeof row.run_id === 'string' && row.run_id ? row.run_id : null,
          previewText: typeof row.preview_text === 'string' ? row.preview_text : '',
          hasText: Boolean(row.has_text),
          hasResources: Boolean(row.has_resources),
          hasCode: Boolean(row.has_code),
        }));
      }
      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return [];
      }
      return snapshot.messages.map((message, index) => ({
        id: message.id,
        role: message.role,
        createdAt: message.createdAt || null,
        runId: message.runId || null,
        previewText: buildPreviewText(message),
        hasText: hasMessageText(message),
        hasResources: (message.resources || []).length > 0,
        hasCode: hasCodeFormatting(message.text || ''),
        messageIndex: index,
      })) as Array<DurableMirrorSearchStub>;
    },

    searchMessageStubs(sessionKey: string, options: {
      query: string;
      day?: string | null;
      roleFilter?: ChatHistorySearchRoleFilter | null;
      contentFilter?: ChatHistorySearchContentFilter | null;
    }): DurableMirrorSearchStub[] {
      const query = normalizeIndexText(options.query || '');
      if (!query) {
        return [];
      }
      const roleFilter = options.roleFilter || 'all';
      const contentFilter = options.contentFilter || 'all';
      const day = options.day || null;
      const terms = [...new Set(tokenizeIndexText(query))];
      const matchesQuery = (previewText: string): boolean => {
        const haystack = normalizeIndexText(previewText || '');
        if (!haystack) {
          return false;
        }
        if (haystack.includes(query)) {
          return true;
        }
        return containsCJK(query)
          ? terms.every((term) => haystack.includes(term))
          : terms.every((term) => haystack.includes(term));
      };

      if (database) {
        ensureSqliteMessageRowsLoaded(database, config, sessionKey);
        ensureSqliteFtsRowsLoaded(sessionKey);
        const normalizedQuery = normalizeIndexText(query);
        const ftsQuery = buildFtsMatchExpression(normalizedQuery);
        const queryTerms = [...new Set(tokenizeIndexText(normalizedQuery))];
        const useFts = sqliteFtsHealthy && Boolean(ftsQuery);
        const where: string[] = ['session_key = ?'];
        const params: unknown[] = [sessionKey];
        if (day) {
          where.push('day_key = ?');
          params.push(day);
        }
        if (roleFilter !== 'all') {
          where.push('role = ?');
          params.push(roleFilter);
        }
        if (contentFilter === 'text') {
          where.push('has_text = 1');
        } else if (contentFilter === 'resource') {
          where.push('has_resources = 1');
        } else if (contentFilter === 'code') {
          where.push('has_code = 1');
        }
        const sql = useFts
          ? `
            SELECT
              m.message_id,
              m.message_index,
              m.role,
              m.created_at,
              m.run_id,
              m.preview_text,
              m.search_text,
              m.has_text,
              m.has_resources,
              m.has_code
            FROM mirror_messages AS m
            JOIN mirror_messages_fts AS f
              ON f.session_key = m.session_key
             AND f.message_id = m.message_id
            WHERE ${where.map((clause) => clause.replaceAll('session_key', 'm.session_key').replaceAll('day_key', 'm.day_key').replaceAll('role =', 'm.role =').replaceAll('has_text', 'm.has_text').replaceAll('has_resources', 'm.has_resources').replaceAll('has_code', 'm.has_code')).join(' AND ')}
              AND mirror_messages_fts MATCH ?
            ORDER BY m.message_index ASC
          `
          : `
            SELECT message_id, message_index, role, created_at, run_id, preview_text, search_text, has_text, has_resources, has_code
            FROM mirror_messages
            WHERE ${where.join(' AND ')}
            ORDER BY message_index ASC
          `;
        if (useFts) {
          params.push(ftsQuery);
        } else if (containsCJK(normalizedQuery)) {
          where.push('search_text LIKE ?');
          params.push(`%${normalizedQuery}%`);
        } else if (queryTerms.length) {
          for (const term of queryTerms) {
            where.push('search_text LIKE ?');
            params.push(`%${term}%`);
          }
        }
        const rows = database.prepare(useFts ? sql : `
          SELECT message_id, message_index, role, created_at, run_id, preview_text, search_text, has_text, has_resources, has_code
          FROM mirror_messages
          WHERE ${where.join(' AND ')}
          ORDER BY message_index ASC
        `).all(...params) as Array<{
          message_id: string;
          message_index?: number | null;
          role?: string | null;
          created_at?: string | null;
          run_id?: string | null;
          preview_text?: string | null;
          search_text?: string | null;
          has_text?: number | null;
          has_resources?: number | null;
          has_code?: number | null;
        }>;
        const searchTextById = new Map(rows.map((row) => [
          String(row.message_id || ''),
          typeof row.search_text === 'string' ? row.search_text : '',
        ]));
        return rows
          .map((row) => ({
            id: String(row.message_id || ''),
            messageIndex: Number(row.message_index ?? 0),
            role: typeof row.role === 'string' && row.role ? row.role : 'assistant',
            createdAt: typeof row.created_at === 'string' && row.created_at ? row.created_at : null,
            runId: typeof row.run_id === 'string' && row.run_id ? row.run_id : null,
            previewText: typeof row.preview_text === 'string' ? row.preview_text : '',
            hasText: Boolean(row.has_text),
            hasResources: Boolean(row.has_resources),
            hasCode: Boolean(row.has_code),
          }))
          .filter((item) => matchesQuery(searchTextById.get(item.id) || item.previewText));
      }

      const snapshot = buildSnapshotFromJson(sessionKey, readJsonMirrorRecord(config, sessionKey));
      if (!snapshot) {
        return [];
      }
      return snapshot.messages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => {
          if (day && normalizeDayKey(message.createdAt) !== day) {
            return false;
          }
          if (roleFilter !== 'all' && message.role !== roleFilter) {
            return false;
          }
          if (contentFilter === 'text' && !hasMessageText(message)) {
            return false;
          }
          if (contentFilter === 'resource' && !(message.resources || []).length) {
            return false;
          }
          if (contentFilter === 'code' && !hasCodeFormatting(message.text || '')) {
            return false;
          }
          return matchesQuery(buildPreviewText(message));
        })
        .map(({ message, index }) => ({
          id: message.id,
          messageIndex: index,
          role: message.role,
          createdAt: message.createdAt || null,
          runId: message.runId || null,
          previewText: buildPreviewText(message),
          hasText: hasMessageText(message),
          hasResources: (message.resources || []).length > 0,
          hasCode: hasCodeFormatting(message.text || ''),
        }));
    },

    readSession(sessionKey: string): DurableMirrorSnapshot | null {
      if (database) {
        const checkpoint = readSqliteCheckpointRow(database, sessionKey);
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
          syncSqliteFtsSnapshot(sessionKey, legacySnapshot.messages);
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
        syncSqliteFtsSnapshot(params.sessionKey, params.messages);
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
        const existingRow = database.prepare(`
          SELECT message_index
          FROM mirror_messages
          WHERE session_key = ? AND message_id = ?
        `).get(params.sessionKey, params.message.id) as { message_index?: number } | undefined;
        const nextIndex = typeof existingRow?.message_index === 'number'
          ? existingRow.message_index
          : Number(
            database.prepare(`
              SELECT COALESCE(MAX(message_index), -1) + 1 AS next_index
              FROM mirror_messages
              WHERE session_key = ?
            `).get(params.sessionKey)?.next_index || 0,
          );
        database.prepare(`
          INSERT OR REPLACE INTO mirror_messages (session_key, message_id, message_index, role, created_at, day_key, run_id, search_text, preview_text, has_text, has_resources, has_code, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          params.sessionKey,
          params.message.id,
          nextIndex,
          params.message.role || null,
          params.message.createdAt || null,
          normalizeDayKey(params.message.createdAt),
          params.message.runId || null,
          normalizeIndexText(buildPreviewText(params.message)),
          buildPreviewText(params.message),
          hasMessageText(params.message) ? 1 : 0,
          (params.message.resources || []).length > 0 ? 1 : 0,
          hasCodeFormatting(params.message.text || '') ? 1 : 0,
          JSON.stringify(cloneMessage(params.message)),
        );
        syncSqliteFtsRow(params.sessionKey, params.message, nextIndex);
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
          if (sqliteFtsHealthy) {
            database.prepare('DELETE FROM mirror_messages_fts WHERE session_key = ?').run(sessionKey);
          }
          database.prepare('DELETE FROM mirror_oplog WHERE session_key = ?').run(sessionKey);
          database.prepare('DELETE FROM mirror_messages WHERE session_key = ?').run(sessionKey);
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
