import type {
  SystemEventRecord,
  SystemPersistedEventRecord,
} from "./event-types.js";

export interface MergeSystemEventHistoryInput {
  persistedEvents: SystemEventRecord[];
  liveSnapshotEvents: SystemEventRecord[];
  limit?: number;
}

function toTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || (limit ?? 0) <= 0) {
    return 100;
  }
  return Math.floor(limit as number);
}

function isSnapshotEvent(event: SystemEventRecord): boolean {
  return (
    typeof (event as Partial<SystemPersistedEventRecord>).action === "string" &&
    (event as SystemPersistedEventRecord).action === "snapshot"
  );
}

function readDedupeKey(event: SystemEventRecord): string {
  const dedupeKey = (event as Partial<SystemPersistedEventRecord>).dedupeKey;
  return typeof dedupeKey === "string" ? dedupeKey : "";
}

function keepLatestByDedupe(events: SystemEventRecord[]): SystemEventRecord[] {
  const latestByKey = new Map<string, SystemEventRecord>();
  const withoutKey: SystemEventRecord[] = [];

  for (const event of events) {
    const dedupeKey = readDedupeKey(event);
    if (!dedupeKey) {
      withoutKey.push(event);
      continue;
    }
    const previous = latestByKey.get(dedupeKey);
    if (!previous || toTime(event.occurredAt) >= toTime(previous.occurredAt)) {
      latestByKey.set(dedupeKey, event);
    }
  }

  return [...latestByKey.values(), ...withoutKey];
}

export function mergeSystemEventHistory({
  persistedEvents,
  liveSnapshotEvents,
  limit,
}: MergeSystemEventHistoryInput): SystemEventRecord[] {
  const liveSnapshots = keepLatestByDedupe(liveSnapshotEvents || []);
  const liveDedupeKeys = new Set(
    liveSnapshots.map((event) => readDedupeKey(event)).filter(Boolean),
  );

  const persistedActionEvents = (persistedEvents || []).filter(
    (event) => !isSnapshotEvent(event),
  );
  const persistedSnapshotEvents = keepLatestByDedupe(
    (persistedEvents || []).filter((event) => {
      if (!isSnapshotEvent(event)) {
        return false;
      }
      const dedupeKey = readDedupeKey(event);
      return dedupeKey ? !liveDedupeKeys.has(dedupeKey) : true;
    }),
  );

  return [
    ...persistedActionEvents,
    ...persistedSnapshotEvents,
    ...liveSnapshots,
  ]
    .sort((left, right) => toTime(right.occurredAt) - toTime(left.occurredAt))
    .slice(0, normalizeLimit(limit));
}
