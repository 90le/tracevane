import fs from "node:fs";
import { createSystemEventLogStore } from "./event-log-store.js";
import type { SystemPersistedEventRecord } from "./event-types.js";
import { resolveSystemEventStorePaths } from "./event-store-paths.js";

export interface CreateSystemEventWriterInput {
  stateDir?: string;
  maxRecords?: number;
  maxAgeDays?: number;
}

export interface SystemEventWriter {
  persistActionEvent(event: SystemPersistedEventRecord): void;
  persistStateChanges(events: SystemPersistedEventRecord[]): void;
  persistConfigAuditEvents(events: SystemPersistedEventRecord[]): void;
  listPersistedEvents(limit?: number): SystemPersistedEventRecord[];
}

type DedupeState = Record<string, string>;

function safeParseDedupeState(content: string): DedupeState {
  if (!content.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const state =
      "dedupeState" in parsed &&
      parsed.dedupeState &&
      typeof parsed.dedupeState === "object"
        ? parsed.dedupeState
        : parsed;
    const output: DedupeState = {};
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === "string") {
        output[key] = value;
      }
    }
    return output;
  } catch {
    return {};
  }
}

export function createSystemEventWriter(
  input: CreateSystemEventWriterInput = {},
): SystemEventWriter {
  const store = createSystemEventLogStore({
    stateDir: input.stateDir,
    maxRecords: input.maxRecords,
    maxAgeDays: input.maxAgeDays,
  });

  const dedupeStatePath = input.stateDir
    ? resolveSystemEventStorePaths({ stateDir: input.stateDir }).eventStatePath
    : null;

  let dedupeState: DedupeState = {};
  if (dedupeStatePath && fs.existsSync(dedupeStatePath)) {
    dedupeState = safeParseDedupeState(
      fs.readFileSync(dedupeStatePath, "utf8"),
    );
  }

  function persistDedupeState(): void {
    if (!dedupeStatePath) {
      return;
    }
    const previousState = fs.existsSync(dedupeStatePath)
      ? JSON.parse(fs.readFileSync(dedupeStatePath, "utf8"))
      : {};
    fs.writeFileSync(
      dedupeStatePath,
      `${JSON.stringify(
        {
          ...previousState,
          dedupeState,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return {
    persistActionEvent(event: SystemPersistedEventRecord): void {
      store.append([event]);
    },

    persistStateChanges(events: SystemPersistedEventRecord[]): void {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }

      const nextDedupeState: DedupeState = { ...dedupeState };
      const changedEvents: SystemPersistedEventRecord[] = [];
      for (const event of events) {
        if (!event?.dedupeKey) {
          continue;
        }

        const previousStatus = nextDedupeState[event.dedupeKey];
        if (previousStatus === event.status) {
          continue;
        }

        changedEvents.push(event);
        nextDedupeState[event.dedupeKey] = event.status;
      }

      if (changedEvents.length === 0) {
        return;
      }

      store.append(changedEvents);
      dedupeState = nextDedupeState;
      persistDedupeState();
    },

    persistConfigAuditEvents(events: SystemPersistedEventRecord[]): void {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }
      store.append(events);
    },

    listPersistedEvents(limit = 100): SystemPersistedEventRecord[] {
      return store.list(limit) as SystemPersistedEventRecord[];
    },
  };
}
