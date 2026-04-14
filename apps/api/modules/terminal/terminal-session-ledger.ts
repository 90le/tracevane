import fs from "node:fs";
import path from "node:path";
import type { TerminalSessionLedgerEvent } from "../../../../types/terminal.js";

export interface TerminalSessionLedgerOptions {
  stateDir: string;
}

export interface TerminalSessionLedger {
  append(event: TerminalSessionLedgerEvent): TerminalSessionLedgerEvent;
  listBySession(sessionId: string): TerminalSessionLedgerEvent[];
}

const LEDGER_FILE_NAME = "terminal-session-ledger.jsonl";

function ledgerFilePath(stateDir: string): string {
  return path.join(stateDir, LEDGER_FILE_NAME);
}

function toTimestamp(value: string | undefined): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEvent(
  input: TerminalSessionLedgerEvent,
): TerminalSessionLedgerEvent | null {
  const sessionId = String(input.sessionId || "").trim();
  const eventId = String(input.eventId || "").trim();
  const type = String(input.type || "").trim();
  if (!sessionId || !eventId || !type) {
    return null;
  }

  return {
    eventId,
    sessionId,
    type,
    timestamp: String(input.timestamp || new Date().toISOString()),
    actorClientId: input.actorClientId ? String(input.actorClientId) : null,
    detail:
      input.detail && typeof input.detail === "object"
        ? input.detail
        : ({} as Record<string, unknown>),
  };
}

function readExisting(filePath: string): TerminalSessionLedgerEvent[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }

  const parsed: TerminalSessionLedgerEvent[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const value = JSON.parse(trimmed) as TerminalSessionLedgerEvent;
      const normalized = normalizeEvent(value);
      if (normalized) {
        parsed.push(normalized);
      }
    } catch {
      // ignore corrupted line
    }
  }

  return parsed;
}

export function createTerminalSessionLedger(
  options: TerminalSessionLedgerOptions,
): TerminalSessionLedger {
  fs.mkdirSync(options.stateDir, { recursive: true });
  const filePath = ledgerFilePath(options.stateDir);
  const records = readExisting(filePath);

  return {
    append(event: TerminalSessionLedgerEvent): TerminalSessionLedgerEvent {
      const normalized = normalizeEvent(event);
      if (!normalized) {
        throw new Error("invalid terminal ledger event");
      }
      records.push(normalized);
      fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`, "utf8");
      return normalized;
    },
    listBySession(sessionId: string): TerminalSessionLedgerEvent[] {
      const normalizedSessionId = String(sessionId || "").trim();
      if (!normalizedSessionId) {
        return [];
      }
      return records
        .filter((item) => item.sessionId === normalizedSessionId)
        .slice()
        .sort(
          (left, right) =>
            toTimestamp(left.timestamp) - toTimestamp(right.timestamp),
        );
    },
  };
}
