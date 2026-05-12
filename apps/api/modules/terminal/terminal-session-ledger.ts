import fs from "node:fs";
import path from "node:path";
import type { TerminalSessionLedgerEvent } from "../../../../types/terminal.js";

export interface TerminalSessionLedgerOptions {
  stateDir: string;
  maxFileBytes?: number;
  maxReadBytes?: number;
  maxRetainedEvents?: number;
}

export interface TerminalSessionLedger {
  append(event: TerminalSessionLedgerEvent): TerminalSessionLedgerEvent;
  appendMany(events: TerminalSessionLedgerEvent[]): TerminalSessionLedgerEvent[];
  listBySession(sessionId: string): TerminalSessionLedgerEvent[];
}

const LEDGER_FILE_NAME = "terminal-session-ledger.jsonl";
const DEFAULT_MAX_LEDGER_FILE_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_LEDGER_READ_BYTES = DEFAULT_MAX_LEDGER_FILE_BYTES;
const DEFAULT_MAX_RETAINED_EVENTS = 10_000;
const HARD_MAX_LEDGER_READ_BYTES = 128 * 1024 * 1024;

interface TerminalSessionLedgerMaintenanceOptions {
  maxFileBytes: number;
  maxReadBytes: number;
  maxRetainedEvents: number;
}

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

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return fallback;
  }
  return Math.floor(Number(value));
}

function resolveMaintenanceOptions(
  options: TerminalSessionLedgerOptions,
): TerminalSessionLedgerMaintenanceOptions {
  const maxFileBytes = positiveInteger(
    options.maxFileBytes,
    DEFAULT_MAX_LEDGER_FILE_BYTES,
  );
  const maxReadBytes = Math.min(
    positiveInteger(options.maxReadBytes, DEFAULT_MAX_LEDGER_READ_BYTES),
    maxFileBytes,
    HARD_MAX_LEDGER_READ_BYTES,
  );
  return {
    maxFileBytes,
    maxReadBytes,
    maxRetainedEvents: positiveInteger(
      options.maxRetainedEvents,
      DEFAULT_MAX_RETAINED_EVENTS,
    ),
  };
}

function statFile(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function readTailText(
  filePath: string,
  fileSize: number,
  maxReadBytes: number,
): string {
  const bytesToRead = Math.min(fileSize, maxReadBytes);
  if (bytesToRead <= 0) {
    return "";
  }
  if (bytesToRead === fileSize) {
    return fs.readFileSync(filePath, "utf8");
  }

  const start = fileSize - bytesToRead;
  const buffer = Buffer.allocUnsafe(bytesToRead);
  const fd = fs.openSync(filePath, "r");
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, start);
    const raw = buffer.subarray(0, bytesRead).toString("utf8");
    const firstNewline = raw.indexOf("\n");
    return firstNewline >= 0 ? raw.slice(firstNewline + 1) : "";
  } finally {
    fs.closeSync(fd);
  }
}

function trimRecords(
  records: TerminalSessionLedgerEvent[],
  maxRetainedEvents: number,
): void {
  const excess = records.length - maxRetainedEvents;
  if (excess > 0) {
    records.splice(0, excess);
  }
}

function parseLedgerText(raw: string): TerminalSessionLedgerEvent[] {
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

function readExisting(
  filePath: string,
  maintenance: TerminalSessionLedgerMaintenanceOptions,
): TerminalSessionLedgerEvent[] {
  const stat = statFile(filePath);
  if (!stat || stat.size <= 0) {
    return [];
  }

  const records = parseLedgerText(
    readTailText(filePath, stat.size, maintenance.maxReadBytes),
  );
  trimRecords(records, maintenance.maxRetainedEvents);
  return records;
}

function snapshotRecentRecords(
  records: TerminalSessionLedgerEvent[],
  maintenance: TerminalSessionLedgerMaintenanceOptions,
): { payload: string; records: TerminalSessionLedgerEvent[] } {
  const lines: string[] = [];
  const retained: TerminalSessionLedgerEvent[] = [];
  let totalBytes = 0;

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (retained.length >= maintenance.maxRetainedEvents) {
      break;
    }

    const record = records[index];
    const line = `${JSON.stringify(record)}\n`;
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (
      retained.length > 0 &&
      totalBytes + lineBytes > maintenance.maxFileBytes
    ) {
      break;
    }

    lines.push(line);
    retained.push(record);
    totalBytes += lineBytes;

    if (lineBytes > maintenance.maxFileBytes) {
      break;
    }
  }

  lines.reverse();
  retained.reverse();
  return {
    payload: lines.join(""),
    records: retained,
  };
}

function writeLedgerSnapshot(filePath: string, payload: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, payload, "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best effort cleanup for a failed compaction write.
    }
    throw error;
  }
}

function compactLedgerFile(
  filePath: string,
  records: TerminalSessionLedgerEvent[],
  maintenance: TerminalSessionLedgerMaintenanceOptions,
): void {
  const snapshot = snapshotRecentRecords(records, maintenance);
  records.splice(0, records.length, ...snapshot.records);
  writeLedgerSnapshot(filePath, snapshot.payload);
}

function compactLedgerFileIfNeeded(
  filePath: string,
  records: TerminalSessionLedgerEvent[],
  maintenance: TerminalSessionLedgerMaintenanceOptions,
): void {
  const stat = statFile(filePath);
  if (!stat || stat.size <= maintenance.maxFileBytes) {
    return;
  }
  compactLedgerFile(filePath, records, maintenance);
}

export function createTerminalSessionLedger(
  options: TerminalSessionLedgerOptions,
): TerminalSessionLedger {
  fs.mkdirSync(options.stateDir, { recursive: true });
  const filePath = ledgerFilePath(options.stateDir);
  const maintenance = resolveMaintenanceOptions(options);
  const records = readExisting(filePath, maintenance);
  compactLedgerFileIfNeeded(filePath, records, maintenance);

  return {
    append(event: TerminalSessionLedgerEvent): TerminalSessionLedgerEvent {
      const normalized = normalizeEvent(event);
      if (!normalized) {
        throw new Error("invalid terminal ledger event");
      }
      records.push(normalized);
      trimRecords(records, maintenance.maxRetainedEvents);
      try {
        fs.mkdirSync(options.stateDir, { recursive: true });
        fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`, "utf8");
        compactLedgerFileIfNeeded(filePath, records, maintenance);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          throw error;
        }
      }
      return normalized;
    },
    appendMany(events: TerminalSessionLedgerEvent[]): TerminalSessionLedgerEvent[] {
      const normalizedEvents = (events || [])
        .map((event) => normalizeEvent(event))
        .filter((event): event is TerminalSessionLedgerEvent => Boolean(event));
      if (!normalizedEvents.length) {
        return [];
      }
      records.push(...normalizedEvents);
      trimRecords(records, maintenance.maxRetainedEvents);
      try {
        fs.mkdirSync(options.stateDir, { recursive: true });
        fs.appendFileSync(
          filePath,
          normalizedEvents
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n",
          "utf8",
        );
        compactLedgerFileIfNeeded(filePath, records, maintenance);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          throw error;
        }
      }
      return normalizedEvents;
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
