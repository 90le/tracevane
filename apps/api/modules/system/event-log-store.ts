import type { SystemEventRecord } from "./event-types.js";

export interface SystemEventLogStore {
  append(events: SystemEventRecord[]): void;
  list(limit?: number): SystemEventRecord[];
}

export function createSystemEventLogStore(): SystemEventLogStore {
  const records: SystemEventRecord[] = [];

  return {
    append(events: SystemEventRecord[]): void {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }
      records.unshift(...events);
    },
    list(limit = 100): SystemEventRecord[] {
      const normalizedLimit =
        Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
      return records.slice(0, normalizedLimit);
    },
  };
}
