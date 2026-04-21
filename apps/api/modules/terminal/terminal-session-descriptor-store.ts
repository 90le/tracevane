import fs from "node:fs";
import path from "node:path";
import type { TerminalSessionDescriptor } from "../../../../types/terminal.js";
import { isRecoverableTerminalStatus } from "../../../../types/terminal.js";

export interface TerminalSessionDescriptorStoreOptions {
  stateDir: string;
  maxCompleted?: number;
}

export interface TerminalSessionDescriptorStore {
  upsert(descriptor: TerminalSessionDescriptor): void;
  rename(sessionId: string, title: string): TerminalSessionDescriptor | null;
  remove(sessionId: string): boolean;
  listRecent(): TerminalSessionDescriptor[];
  get(sessionId: string): TerminalSessionDescriptor | null;
}

interface PersistedDescriptorState {
  items: TerminalSessionDescriptor[];
  updatedAt: string;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value ?? 0) < 0) {
    return fallback;
  }
  return Math.floor(value as number);
}

function toTimestamp(value: string | undefined): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDescriptor(
  descriptor: TerminalSessionDescriptor,
): TerminalSessionDescriptor {
  const updatedAt =
    descriptor.updatedAt || descriptor.lastActiveAt || new Date().toISOString();
  return {
    ...descriptor,
    sessionId: String(descriptor.sessionId || "").trim(),
    title: String(descriptor.title || descriptor.sessionId || "").trim(),
    updatedAt,
  };
}

function sortRecent(
  descriptors: TerminalSessionDescriptor[],
): TerminalSessionDescriptor[] {
  return descriptors
    .slice()
    .sort(
      (left, right) =>
        toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt),
    );
}

function applyRetention(
  descriptors: TerminalSessionDescriptor[],
  maxCompleted: number,
): TerminalSessionDescriptor[] {
  const sorted = sortRecent(descriptors);
  const result: TerminalSessionDescriptor[] = [];
  let completedCount = 0;

  for (const descriptor of sorted) {
    if (!descriptor.sessionId) {
      continue;
    }
    if (isRecoverableTerminalStatus(descriptor.status)) {
      result.push(descriptor);
      continue;
    }
    if (completedCount < maxCompleted) {
      result.push(descriptor);
      completedCount += 1;
    }
  }

  return result;
}

function stateFilePath(stateDir: string): string {
  return path.join(stateDir, "terminal-sessions.json");
}

function readExisting(filePath: string): {
  items: TerminalSessionDescriptor[];
  readable: boolean;
} {
  if (!fs.existsSync(filePath)) {
    return { items: [], readable: true };
  }
  try {
    const parsed = JSON.parse(
      fs.readFileSync(filePath, "utf8"),
    ) as Partial<PersistedDescriptorState>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      return { items: [], readable: false };
    }
    return {
      readable: true,
      items: parsed.items
        .filter((item) => item && typeof item === "object")
        .map((item) => normalizeDescriptor(item as TerminalSessionDescriptor))
        .filter((item) => item.sessionId),
    };
  } catch {
    return { items: [], readable: false };
  }
}

function writeState(
  filePath: string,
  items: TerminalSessionDescriptor[],
): void {
  const state: PersistedDescriptorState = {
    items,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export function createTerminalSessionDescriptorStore(
  options: TerminalSessionDescriptorStoreOptions,
): TerminalSessionDescriptorStore {
  const maxCompleted = normalizeLimit(options.maxCompleted, 50);
  const filePath = stateFilePath(options.stateDir);

  fs.mkdirSync(options.stateDir, { recursive: true });

  const initial = readExisting(filePath);
  const deduped = new Map<string, TerminalSessionDescriptor>();
  for (const descriptor of initial.items) {
    const previous = deduped.get(descriptor.sessionId);
    if (
      !previous ||
      toTimestamp(descriptor.updatedAt) >= toTimestamp(previous.updatedAt)
    ) {
      deduped.set(descriptor.sessionId, descriptor);
    }
  }

  const records = new Map<string, TerminalSessionDescriptor>();
  for (const descriptor of applyRetention(
    Array.from(deduped.values()),
    maxCompleted,
  )) {
    records.set(descriptor.sessionId, descriptor);
  }
  if (initial.readable) {
    writeState(filePath, sortRecent(Array.from(records.values())));
  }

  function flush(): void {
    const retained = applyRetention(Array.from(records.values()), maxCompleted);
    records.clear();
    for (const descriptor of retained) {
      records.set(descriptor.sessionId, descriptor);
    }
    writeState(filePath, sortRecent(Array.from(records.values())));
  }

  return {
    upsert(descriptor: TerminalSessionDescriptor): void {
      const normalized = normalizeDescriptor(descriptor);
      if (!normalized.sessionId) {
        return;
      }
      records.set(normalized.sessionId, normalized);
      flush();
    },
    rename(sessionId: string, title: string): TerminalSessionDescriptor | null {
      const normalizedId = String(sessionId || "").trim();
      if (!normalizedId) {
        return null;
      }
      const current = records.get(normalizedId);
      if (!current) {
        return null;
      }
      const nextTitle = String(title || "").trim() || normalizedId;
      const next = normalizeDescriptor({
        ...current,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
      });
      records.set(normalizedId, next);
      flush();
      return next;
    },
    remove(sessionId: string): boolean {
      const normalizedId = String(sessionId || "").trim();
      if (!normalizedId) {
        return false;
      }
      const existed = records.delete(normalizedId);
      if (existed) {
        flush();
      }
      return existed;
    },
    listRecent(): TerminalSessionDescriptor[] {
      return sortRecent(Array.from(records.values()));
    },
    get(sessionId: string): TerminalSessionDescriptor | null {
      return records.get(String(sessionId || "").trim()) || null;
    },
  };
}
