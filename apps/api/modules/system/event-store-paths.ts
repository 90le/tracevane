import path from "node:path";

export const SYSTEM_EVENTS_JSONL_FILE = "system-events.jsonl";
export const SYSTEM_EVENTS_STATE_FILE = "system-events.state.json";

export interface ResolveSystemEventStorePathsInput {
  stateDir: string;
}

export interface SystemEventStorePaths {
  eventsJsonlPath: string;
  eventStatePath: string;
}

export function resolveSystemEventStorePaths({
  stateDir,
}: ResolveSystemEventStorePathsInput): SystemEventStorePaths {
  return {
    eventsJsonlPath: path.join(stateDir, SYSTEM_EVENTS_JSONL_FILE),
    eventStatePath: path.join(stateDir, SYSTEM_EVENTS_STATE_FILE),
  };
}
