import { reactive } from "vue";
import type {
  TerminalHandoffContext as SharedTerminalHandoffContext,
  TerminalRecentOutputSummary as SharedTerminalRecentOutputSummary,
  TerminalSessionControlState,
  TerminalSessionDescriptor as SharedTerminalSessionDescriptor,
  TerminalSessionSource,
  TerminalSessionStatus,
} from "../../../../../types/terminal";

export type TerminalSessionHandoffContext = SharedTerminalHandoffContext;
export type TerminalRecentOutputSummary = SharedTerminalRecentOutputSummary;

export interface TerminalSessionDescriptor extends Pick<
  SharedTerminalSessionDescriptor,
  | "sessionId"
  | "title"
  | "profileId"
  | "targetKind"
  | "cwd"
  | "pinned"
  | "status"
  | "source"
  | "canResume"
  | "updatedAt"
  | "handoffContext"
  | "recentOutputSummary"
  | "controlState"
> {}

export interface TerminalSessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TerminalSessionRegistry {
  sessionsById: Record<string, TerminalSessionDescriptor>;
  upsertSession(session: TerminalSessionDescriptor): void;
  removeSession(sessionId: string): void;
  renameSession(sessionId: string, title: string): void;
  getSession(sessionId: string): TerminalSessionDescriptor | null;
}

function normalizeSessionId(sessionId: string): string {
  return String(sessionId || "").trim();
}

function normalizeSessionDescriptor(
  session: TerminalSessionDescriptor,
): TerminalSessionDescriptor {
  const sessionId = normalizeSessionId(session.sessionId);
  return {
    sessionId,
    title: String(session.title || sessionId).trim() || sessionId,
    profileId: session.profileId ? String(session.profileId).trim() || null : null,
    targetKind: session.targetKind || "local",
    cwd: session.cwd ? String(session.cwd).trim() || null : null,
    pinned: Boolean(session.pinned),
    status: session.status || "detached",
    source: session.source || "manual",
    canResume: Boolean(session.canResume),
    controlState: session.controlState || "observer",
    updatedAt: String(session.updatedAt || new Date().toISOString()),
    handoffContext: session.handoffContext || null,
    recentOutputSummary: session.recentOutputSummary || null,
  };
}

export function sortTerminalSessionsByUpdatedAtDesc(
  left: TerminalSessionDescriptor,
  right: TerminalSessionDescriptor,
): number {
  const leftTs = Date.parse(left.updatedAt);
  const rightTs = Date.parse(right.updatedAt);

  if (
    Number.isFinite(leftTs) &&
    Number.isFinite(rightTs) &&
    leftTs !== rightTs
  ) {
    return rightTs - leftTs;
  }

  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  return right.sessionId.localeCompare(left.sessionId);
}

export function createTerminalSessionRegistry(
  initialSessions: TerminalSessionDescriptor[] = [],
): TerminalSessionRegistry {
  const sessionsById = reactive<Record<string, TerminalSessionDescriptor>>({});

  const registry: TerminalSessionRegistry = {
    sessionsById,
    upsertSession(session) {
      const sessionId = normalizeSessionId(session.sessionId);
      if (!sessionId) return;
      sessionsById[sessionId] = normalizeSessionDescriptor({
        ...session,
        sessionId,
      });
    },
    removeSession(sessionId) {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return;
      delete sessionsById[normalized];
    },
    renameSession(sessionId, title) {
      const normalized = normalizeSessionId(sessionId);
      const current = sessionsById[normalized];
      if (!current) return;
      const nextTitle = String(title || "").trim() || normalized;
      sessionsById[normalized] = normalizeSessionDescriptor({
        ...current,
        title: nextTitle,
      });
    },
    getSession(sessionId) {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return null;
      return sessionsById[normalized] || null;
    },
  };

  for (const session of initialSessions) {
    registry.upsertSession(session);
  }

  return registry;
}

export function loadTerminalSessionRegistryFromStorage(
  storage: TerminalSessionStorageLike | null | undefined,
  storageKey: string,
): TerminalSessionRegistry {
  if (!storage) {
    return createTerminalSessionRegistry();
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return createTerminalSessionRegistry();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return createTerminalSessionRegistry();
    }
    return createTerminalSessionRegistry(
      parsed.filter((item): item is TerminalSessionDescriptor => {
        return (
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as TerminalSessionDescriptor).sessionId === "string"
        );
      }),
    );
  } catch {
    return createTerminalSessionRegistry();
  }
}

export function persistTerminalSessionRegistryToStorage(
  registry: TerminalSessionRegistry,
  storage: TerminalSessionStorageLike | null | undefined,
  storageKey: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      storageKey,
      JSON.stringify(Object.values(registry.sessionsById)),
    );
  } catch {
    // ignore storage write failures
  }
}
