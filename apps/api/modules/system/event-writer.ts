import fs from "node:fs";
import path from "node:path";
import { createSystemEventLogStore } from "./event-log-store.js";
import type { SystemPersistedEventRecord } from "./event-types.js";

export interface CreateSystemEventWriterInput {
  stateDir?: string;
  maxRecords?: number;
  maxAgeDays?: number;
}

export interface SystemEventWriter {
  persistActionEvent(event: SystemPersistedEventRecord): void;
  persistStateChanges(events: SystemPersistedEventRecord[]): void;
  listPersistedEvents(limit?: number): SystemPersistedEventRecord[];
}

const DEDUPE_STATE_FILE = "system-events.dedupe-state.json";

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
    const output: DedupeState = {};
    for (const [key, value] of Object.entries(parsed)) {
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
  });

  const dedupeStatePath = input.stateDir
    ? path.join(input.stateDir, DEDUPE_STATE_FILE)
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
    fs.writeFileSync(
      dedupeStatePath,
      `${JSON.stringify(dedupeState, null, 2)}\n`,
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

      const changedEvents: SystemPersistedEventRecord[] = [];
      for (const event of events) {
        if (!event?.dedupeKey) {
          continue;
        }

        const previousStatus = dedupeState[event.dedupeKey];
        if (previousStatus === event.status) {
          continue;
        }

        changedEvents.push(event);
      }

      if (changedEvents.length === 0) {
        return;
      }

      store.append(changedEvents);
      for (const event of changedEvents) {
        dedupeState[event.dedupeKey] = event.status;
      }
      persistDedupeState();
    },

    listPersistedEvents(limit = 100): SystemPersistedEventRecord[] {
      return store.list(limit) as SystemPersistedEventRecord[];
    },
  };
}
