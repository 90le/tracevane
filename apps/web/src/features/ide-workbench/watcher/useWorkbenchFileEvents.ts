import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getFilesWatchSnapshot } from "@/lib/api/files";
import { filesKeys } from "@/lib/query/files";
import { normalizeExplorerPath } from "@/shared/explorer-core";
import type { FileEntryKind, FilesWatchSnapshotEntry, FilesWatchSnapshotPayload } from "../../../../../../types/files";

export type WorkbenchFileEvent =
  | {
      id: string;
      type: "created";
      rootId: string;
      path: string;
      directoryPath: string;
      kind: FileEntryKind;
      entry: FilesWatchSnapshotEntry;
      timestamp: string;
    }
  | {
      id: string;
      type: "changed";
      rootId: string;
      path: string;
      directoryPath: string;
      kind: FileEntryKind;
      entry: FilesWatchSnapshotEntry;
      previous: FilesWatchSnapshotEntry;
      timestamp: string;
    }
  | {
      id: string;
      type: "deleted";
      rootId: string;
      path: string;
      directoryPath: string;
      kind: FileEntryKind;
      previous: FilesWatchSnapshotEntry;
      timestamp: string;
    };

export interface UseWorkbenchFileEventsOptions {
  rootId: string;
  directoryPath: string;
  enabled?: boolean;
  pollMs?: number;
  onEvent: (event: WorkbenchFileEvent) => void;
}

type SnapshotMap = Map<string, FilesWatchSnapshotEntry>;

const DEFAULT_POLL_MS = 1500;

export function useWorkbenchFileEvents({
  rootId,
  directoryPath,
  enabled = true,
  pollMs,
  onEvent,
}: UseWorkbenchFileEventsOptions): void {
  const queryClient = useQueryClient();
  const normalizedDirectory = React.useMemo(() => normalizeExplorerPath(directoryPath), [directoryPath]);
  const onEventRef = React.useRef(onEvent);
  const previousRef = React.useRef<SnapshotMap | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    previousRef.current = null;
  }, [rootId, normalizedDirectory]);

  React.useEffect(() => {
    if (!enabled || !rootId) return undefined;
    let disposed = false;
    let timer: number | undefined;
    const interval = pollMs ?? readRuntimePollMs() ?? DEFAULT_POLL_MS;

    const poll = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const snapshot = await getFilesWatchSnapshot(
          { rootId, path: normalizedDirectory, hidden: true },
          controller.signal,
        );
        if (disposed) return;
        const events = diffSnapshot(previousRef.current, snapshot);
        previousRef.current = snapshotToMap(snapshot);
        if (events.length) {
          void queryClient.invalidateQueries({
            queryKey: filesKeys.browse({ rootId, path: normalizedDirectory, hidden: true }),
          });
          void queryClient.invalidateQueries({ queryKey: filesKeys.summary() });
        }
        for (const event of events) onEventRef.current(event);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          // Watcher polling is opportunistic; UI surfaces keep their last known state.
          // A future M6 slice can expose this as an Output/Problems notification.
        }
      } finally {
        if (!disposed) timer = window.setTimeout(poll, interval);
      }
    };

    timer = window.setTimeout(poll, 0);
    return () => {
      disposed = true;
      if (timer != null) window.clearTimeout(timer);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, normalizedDirectory, pollMs, queryClient, rootId]);
}

function diffSnapshot(previous: SnapshotMap | null, snapshot: FilesWatchSnapshotPayload): WorkbenchFileEvent[] {
  if (!previous) return [];
  const next = snapshotToMap(snapshot);
  const timestamp = snapshot.checkedAt;
  const events: WorkbenchFileEvent[] = [];

  for (const [entryPath, entry] of next) {
    const old = previous.get(entryPath);
    if (!old) {
      events.push({
        id: eventId("created", snapshot.rootId, entryPath, timestamp),
        type: "created",
        rootId: snapshot.rootId,
        path: entryPath,
        directoryPath: snapshot.directoryPath,
        kind: entry.kind,
        entry,
        timestamp,
      });
      continue;
    }
    if (entryChanged(old, entry)) {
      events.push({
        id: eventId("changed", snapshot.rootId, entryPath, timestamp),
        type: "changed",
        rootId: snapshot.rootId,
        path: entryPath,
        directoryPath: snapshot.directoryPath,
        kind: entry.kind,
        entry,
        previous: old,
        timestamp,
      });
    }
  }

  for (const [entryPath, old] of previous) {
    if (next.has(entryPath)) continue;
    events.push({
      id: eventId("deleted", snapshot.rootId, entryPath, timestamp),
      type: "deleted",
      rootId: snapshot.rootId,
      path: entryPath,
      directoryPath: snapshot.directoryPath,
      kind: old.kind,
      previous: old,
      timestamp,
    });
  }

  return events;
}

function snapshotToMap(snapshot: FilesWatchSnapshotPayload): SnapshotMap {
  return new Map(snapshot.entries.map((entry) => [normalizeExplorerPath(entry.path), entry]));
}

function entryChanged(left: FilesWatchSnapshotEntry, right: FilesWatchSnapshotEntry): boolean {
  return left.kind !== right.kind || left.size !== right.size || left.mtimeMs !== right.mtimeMs || left.modifiedAt !== right.modifiedAt;
}

function eventId(type: WorkbenchFileEvent["type"], rootId: string, path: string, timestamp: string): string {
  return `${type}:${rootId}:${path}:${timestamp}`;
}

function readRuntimePollMs(): number | null {
  const value = (window as unknown as { __TRACEVANE_IDE_WATCH_POLL_MS?: unknown }).__TRACEVANE_IDE_WATCH_POLL_MS;
  const next = Number(value);
  return Number.isFinite(next) && next >= 100 ? next : null;
}
