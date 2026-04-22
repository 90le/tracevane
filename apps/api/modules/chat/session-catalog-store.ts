import fs from 'node:fs';
import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type { ChatSessionRow } from '../../../../types/chat.js';
import { openStudioChatSqliteDatabase } from './chat-sqlite.js';

type SessionCatalogBackend = 'sqlite' | 'json';

type JsonSessionCatalogRecord = {
  signature?: string | null;
  sessions: Record<string, ChatSessionRow>;
};

function ensureCatalogDir(config: StudioServerConfig): string {
  const dir = path.join(config.openclawRoot, 'studio', 'chat-session-catalog');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonCatalogPath(config: StudioServerConfig): string {
  return path.join(ensureCatalogDir(config), 'catalog.json');
}

function cloneSessionRow<T extends ChatSessionRow>(row: T): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

function cloneSessionRows(rows: ChatSessionRow[]): ChatSessionRow[] {
  return rows.map((row) => cloneSessionRow(row));
}

function readJsonCatalog(config: StudioServerConfig): JsonSessionCatalogRecord {
  try {
    return JSON.parse(fs.readFileSync(jsonCatalogPath(config), 'utf-8')) as JsonSessionCatalogRecord;
  } catch {
    return { sessions: {} };
  }
}

function writeJsonCatalog(config: StudioServerConfig, value: JsonSessionCatalogRecord): void {
  fs.writeFileSync(jsonCatalogPath(config), `${JSON.stringify(value, null, 2)}\n`);
}

function loadSqliteDatabase(config: StudioServerConfig): any | null {
  const database = openStudioChatSqliteDatabase(config);
  if (!database) {
    return null;
  }
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS session_rows (
        session_key TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        updated_at TEXT,
        saved_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    database.exec(`
      CREATE TABLE IF NOT EXISTS catalog_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS session_rows_agent_updated_idx
      ON session_rows (agent_id, updated_at DESC, saved_at DESC);
    `);
    return database;
  } catch {
    return null;
  }
}

export function createStudioChatSessionCatalogStore(config: StudioServerConfig) {
  const database = loadSqliteDatabase(config);
  const backend: SessionCatalogBackend = database ? 'sqlite' : 'json';

  function readSignature(): string | null {
    if (database) {
      try {
        const row = database.prepare(`
          SELECT value
          FROM catalog_meta
          WHERE key = 'signature'
        `).get();
        return row ? String(row.value || '') || null : null;
      } catch {
        return null;
      }
    }
    return readJsonCatalog(config).signature || null;
  }

  return {
    backend,

    readSnapshot(): { signature: string | null; sessions: ChatSessionRow[] } {
      return {
        signature: readSignature(),
        sessions: this.readAllSessions(),
      };
    },

    readAllSessions(): ChatSessionRow[] {
      if (database) {
        try {
          const rows = database.prepare(`
            SELECT payload_json
            FROM session_rows
            ORDER BY COALESCE(updated_at, '') DESC, saved_at DESC
          `).all();
          return rows.map((row: { payload_json: string }) => cloneSessionRow(JSON.parse(String(row.payload_json))));
        } catch {
          return [];
        }
      }
      return cloneSessionRows(Object.values(readJsonCatalog(config).sessions || {}));
    },

    readAgentSessions(agentId: string): ChatSessionRow[] {
      if (database) {
        try {
          const rows = database.prepare(`
            SELECT payload_json
            FROM session_rows
            WHERE agent_id = ?
            ORDER BY COALESCE(updated_at, '') DESC, saved_at DESC
          `).all(agentId);
          return rows.map((row: { payload_json: string }) => cloneSessionRow(JSON.parse(String(row.payload_json))));
        } catch {
          return [];
        }
      }
      return cloneSessionRows(
        Object.values(readJsonCatalog(config).sessions || {}).filter((row) => row.agentId === agentId),
      );
    },

    readSession(sessionKey: string): ChatSessionRow | null {
      if (database) {
        try {
          const row = database.prepare(`
            SELECT payload_json
            FROM session_rows
            WHERE session_key = ?
          `).get(sessionKey);
          return row ? cloneSessionRow(JSON.parse(String(row.payload_json))) : null;
        } catch {
          return null;
        }
      }
      const current = readJsonCatalog(config).sessions?.[sessionKey];
      return current ? cloneSessionRow(current) : null;
    },

    writeSession(session: ChatSessionRow): void {
      const cloned = cloneSessionRow(session);
      const savedAt = new Date().toISOString();
      if (database) {
        try {
          database.prepare(`
            INSERT INTO session_rows (session_key, agent_id, updated_at, saved_at, payload_json)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              agent_id = excluded.agent_id,
              updated_at = excluded.updated_at,
              saved_at = excluded.saved_at,
              payload_json = excluded.payload_json
          `).run(
            cloned.key,
            cloned.agentId,
            cloned.updatedAt || null,
            savedAt,
            JSON.stringify(cloned),
          );
        } catch {}
        return;
      }
      const current = readJsonCatalog(config);
      current.sessions[cloned.key] = cloned;
      writeJsonCatalog(config, current);
    },

    replaceAgentSessions(agentId: string, sessions: ChatSessionRow[]): void {
      const cloned = cloneSessionRows(sessions);
      const savedAt = new Date().toISOString();
      if (database) {
        try {
          database.exec('BEGIN');
          database.prepare('DELETE FROM session_rows WHERE agent_id = ?').run(agentId);
          const statement = database.prepare(`
            INSERT INTO session_rows (session_key, agent_id, updated_at, saved_at, payload_json)
            VALUES (?, ?, ?, ?, ?)
          `);
          for (const row of cloned) {
            statement.run(
              row.key,
              row.agentId,
              row.updatedAt || null,
              savedAt,
              JSON.stringify(row),
            );
          }
          database.exec('COMMIT');
          return;
        } catch {
          try {
            database.exec('ROLLBACK');
          } catch {}
          return;
        }
      }
      const current = readJsonCatalog(config);
      for (const [sessionKey, row] of Object.entries(current.sessions)) {
        if (row.agentId === agentId) {
          delete current.sessions[sessionKey];
        }
      }
      for (const row of cloned) {
        current.sessions[row.key] = row;
      }
      writeJsonCatalog(config, current);
    },

    replaceAllSessions(sessions: ChatSessionRow[]): boolean {
      const cloned = cloneSessionRows(sessions);
      const savedAt = new Date().toISOString();
      if (database) {
        try {
          database.exec('BEGIN');
          database.prepare('DELETE FROM session_rows').run();
          const statement = database.prepare(`
            INSERT INTO session_rows (session_key, agent_id, updated_at, saved_at, payload_json)
            VALUES (?, ?, ?, ?, ?)
          `);
          for (const row of cloned) {
            statement.run(
              row.key,
              row.agentId,
              row.updatedAt || null,
              savedAt,
              JSON.stringify(row),
            );
          }
          database.exec('COMMIT');
          return true;
        } catch {
          try {
            database.exec('ROLLBACK');
          } catch {}
          return false;
        }
      }
      const current = readJsonCatalog(config);
      current.sessions = Object.fromEntries(cloned.map((row) => [row.key, row]));
      writeJsonCatalog(config, current);
      return true;
    },

    clearSession(sessionKey: string): void {
      if (database) {
        try {
          database.prepare('DELETE FROM session_rows WHERE session_key = ?').run(sessionKey);
        } catch {}
        return;
      }
      const current = readJsonCatalog(config);
      if (current.sessions[sessionKey]) {
        delete current.sessions[sessionKey];
        writeJsonCatalog(config, current);
      }
    },

    setSignature(signature: string | null): void {
      if (database) {
        try {
          database.prepare(`
            INSERT INTO catalog_meta (key, value)
            VALUES ('signature', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).run(signature || '');
        } catch {}
        return;
      }
      const current = readJsonCatalog(config);
      current.signature = signature || null;
      writeJsonCatalog(config, current);
    },
  };
}
