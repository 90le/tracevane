import path from "node:path";

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
    eventsJsonlPath: path.join(stateDir, "system-events.jsonl"),
    eventStatePath: path.join(stateDir, "system-events.state.json"),
  };
}
