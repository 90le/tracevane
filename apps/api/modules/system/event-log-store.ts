import fs from "node:fs";
import type { SystemPersistedEventRecord } from "./event-types.js";
import { resolveSystemEventStorePaths } from "./event-store-paths.js";
import type { SystemEventRecord } from "./event-types.js";

export interface SystemEventLogStoreOptions {
  stateDir?: string;
  maxRecords?: number;
  maxAgeDays?: number;
}

export interface SystemEventLogStore {
  append(events: SystemEventRecord[]): void;
  list(limit?: number): SystemEventRecord[];
}

interface SystemEventLogState {
  totalRecords: number;
  updatedAt: string;
  dedupeState?: Record<string, string>;
}

function readExistingState(filePath: string): Partial<SystemEventLogState> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (!Number.isFinite(limit) || (limit ?? 0) <= 0) {
    return fallback;
  }
  return Math.floor(limit as number);
}

function safeParseEvent(line: string): SystemEventRecord | null {
  if (!line.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as SystemEventRecord;
  } catch {
    return null;
  }
}

function toTime(value: string | undefined): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function trimByAge(
  records: SystemEventRecord[],
  maxAgeDays: number,
): SystemEventRecord[] {
  const ageMs = Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ageMs;
  return records.filter((event) => toTime(event.occurredAt) >= cutoff);
}

function normalizeRecords(
  input: SystemEventRecord[],
  maxRecords: number,
  maxAgeDays: number,
): SystemEventRecord[] {
  return trimByAge(input, maxAgeDays)
    .slice()
    .sort((left, right) => toTime(right.occurredAt) - toTime(left.occurredAt))
    .slice(0, maxRecords);
}

export function createSystemEventLogStore(
  options: SystemEventLogStoreOptions = {},
): SystemEventLogStore {
  const maxRecords = normalizeLimit(options.maxRecords, 1000);
  const maxAgeDays = normalizeLimit(options.maxAgeDays, 7);
  const records: SystemEventRecord[] = [];
  const stateDir = options.stateDir;

  let eventsJsonlPath: string | null = null;
  let eventStatePath: string | null = null;

  if (stateDir) {
    const resolvedPaths = resolveSystemEventStorePaths({ stateDir });
    eventsJsonlPath = resolvedPaths.eventsJsonlPath;
    eventStatePath = resolvedPaths.eventStatePath;

    fs.mkdirSync(stateDir, { recursive: true });

    if (fs.existsSync(eventsJsonlPath)) {
      const raw = fs.readFileSync(eventsJsonlPath, "utf8");
      const lines = raw.split("\n");
      for (const line of lines) {
        const event = safeParseEvent(line);
        if (event) {
          records.push(event);
        }
      }
    }

    const normalized = normalizeRecords(records, maxRecords, maxAgeDays);
    records.splice(0, records.length, ...normalized);

    fs.writeFileSync(
      eventsJsonlPath,
      records.map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8",
    );
    const previousState = readExistingState(eventStatePath);
    const state: SystemEventLogState = {
      ...previousState,
      totalRecords: records.length,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      eventStatePath,
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    append(events: SystemEventRecord[]): void {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }

      const normalized = normalizeRecords(
        [...events, ...records],
        maxRecords,
        maxAgeDays,
      );
      records.splice(0, records.length, ...normalized);

      if (!eventsJsonlPath || !eventStatePath) {
        return;
      }

      fs.writeFileSync(
        eventsJsonlPath,
        records.map((event) => `${JSON.stringify(event)}\n`).join(""),
        "utf8",
      );
      const previousState = readExistingState(eventStatePath);
      const state: SystemEventLogState = {
        ...previousState,
        totalRecords: records.length,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        eventStatePath,
        `${JSON.stringify(state, null, 2)}\n`,
        "utf8",
      );
    },
    list(limit = 100): SystemEventRecord[] {
      const normalizedLimit = normalizeLimit(limit, 100);
      return records.slice(0, normalizedLimit);
    },
  };
}
