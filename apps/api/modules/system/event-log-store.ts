import fs from "node:fs";
import { resolveSystemEventStorePaths } from "./event-store-paths.js";
import type { SystemEventRecord } from "./event-types.js";

export interface SystemEventLogStoreOptions {
  stateDir?: string;
  maxRecords?: number;
}

export interface SystemEventLogStore {
  append(events: SystemEventRecord[]): void;
  list(limit?: number): SystemEventRecord[];
}

interface SystemEventLogState {
  totalRecords: number;
  updatedAt: string;
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

export function createSystemEventLogStore(
  options: SystemEventLogStoreOptions = {},
): SystemEventLogStore {
  const maxRecords = normalizeLimit(options.maxRecords, 1000);
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

    if (records.length > maxRecords) {
      records.splice(maxRecords);
    }

    fs.writeFileSync(
      eventsJsonlPath,
      records.map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8",
    );
    const state: SystemEventLogState = {
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

      records.unshift(...events);
      if (records.length > maxRecords) {
        records.splice(maxRecords);
      }

      if (!eventsJsonlPath || !eventStatePath) {
        return;
      }

      fs.writeFileSync(
        eventsJsonlPath,
        records.map((event) => `${JSON.stringify(event)}\n`).join(""),
        "utf8",
      );
      const state: SystemEventLogState = {
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
