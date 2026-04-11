import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type { ChatMessageItem } from '../../../../types/chat.js';

const require = createRequire(import.meta.url);

type MirrorBackend = 'sqlite' | 'json';

interface MirrorCheckpointRecord {
  version: string;
  source: string;
  baseMessageSeq: number;
  savedAt: string;
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
  };
}

function loadSqliteDatabase(config: StudioServerConfig): any | null {
  try {
    const sqlite = require('node:sqlite');
    const DatabaseSync = sqlite?.DatabaseSync;
    if (!DatabaseSync) {
      return null;
    }
    const database = new DatabaseSync(sqliteMirrorPath(config));
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec(`
      CREATE TABLE IF NOT EXISTS mirror_checkpoint (
        session_key TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        base_message_seq INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
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
    return database;
  } catch {
    return null;
  }
}

export function createStudioChatDurableMirrorStore(config: StudioServerConfig) {
  const database = loadSqliteDatabase(config);
  const backend: MirrorBackend = database ? 'sqlite' : 'json';

  return {
    backend,

    readSession(sessionKey: string): DurableMirrorSnapshot | null {
      if (database) {
        const checkpoint = database.prepare(`
          SELECT version, source, base_message_seq, saved_at, payload_json
          FROM mirror_checkpoint
          WHERE session_key = ?
        `).get(sessionKey);
        if (!checkpoint) {
          return null;
        }
        const checkpointMessages = cloneMessages(JSON.parse(String(checkpoint.payload_json || '[]')) as ChatMessageItem[]);
        const oplogRows = database.prepare(`
          SELECT message_seq, saved_at, payload_json
          FROM mirror_oplog
          WHERE session_key = ? AND version = ?
          ORDER BY message_seq ASC
        `).all(sessionKey, checkpoint.version);
        const oplogMessages = oplogRows.map((row: any) => cloneMessage(JSON.parse(String(row.payload_json || '{}')) as ChatMessageItem));
        const lastMessageSeq = oplogRows[oplogRows.length - 1]?.message_seq || checkpoint.base_message_seq || 0;
        return {
          sessionKey,
          version: String(checkpoint.version),
          source: String(checkpoint.source),
          messages: [...checkpointMessages, ...oplogMessages],
          lastMessageSeq,
          savedAt: String(oplogRows[oplogRows.length - 1]?.saved_at || checkpoint.saved_at),
          backend: 'sqlite',
        };
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
    }): void {
      if (database) {
        database.exec('BEGIN');
        try {
          database.prepare('DELETE FROM mirror_oplog WHERE session_key = ?').run(params.sessionKey);
          database.prepare(`
            INSERT INTO mirror_checkpoint (session_key, version, source, base_message_seq, saved_at, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              version = excluded.version,
              source = excluded.source,
              base_message_seq = excluded.base_message_seq,
              saved_at = excluded.saved_at,
              payload_json = excluded.payload_json
          `).run(
            params.sessionKey,
            params.version,
            params.source,
            params.baseMessageSeq,
            params.savedAt,
            JSON.stringify(cloneMessages(params.messages)),
          );
          database.exec('COMMIT');
          return;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }

      writeJsonMirrorRecord(config, params.sessionKey, {
        checkpoint: {
          version: params.version,
          source: params.source,
          baseMessageSeq: params.baseMessageSeq,
          savedAt: params.savedAt,
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
          database.exec('COMMIT');
          return;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }
      try {
        fs.rmSync(jsonMirrorPath(config, sessionKey), { force: true });
      } catch {}
    },
  };
}
