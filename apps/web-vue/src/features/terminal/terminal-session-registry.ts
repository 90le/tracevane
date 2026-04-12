export type TerminalSessionStatus =
  | "running"
  | "detached"
  | "completed"
  | "failed"
  | "lost";

export type TerminalSessionSource =
  | "manual"
  | "system_action"
  | "linked_context";

export type TerminalSessionControlState = "controller" | "observer";

export interface TerminalSessionDescriptor {
  sessionId: string;
  title: string;
  status: TerminalSessionStatus;
  source: TerminalSessionSource;
  canResume: boolean;
  controlState: TerminalSessionControlState;
  updatedAt: string;
}

export interface TerminalSessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TerminalSessionRegistry {
  sessionsById: Record<string, TerminalSessionDescriptor>;
  upsertSession(session: TerminalSessionDescriptor): void;
  removeSession(sessionId: string): void;
  getSession(sessionId: string): TerminalSessionDescriptor | null;
  listSessions(): TerminalSessionDescriptor[];
  listRecoverableSessions(): TerminalSessionDescriptor[];
}

function normalizeSessionId(sessionId: string): string {
  return String(sessionId || "").trim();
}

function sortByUpdatedAtDesc(
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
  const sessionsById: Record<string, TerminalSessionDescriptor> = {};

  const registry: TerminalSessionRegistry = {
    sessionsById,
    upsertSession(session) {
      const sessionId = normalizeSessionId(session.sessionId);
      if (!sessionId) return;
      sessionsById[sessionId] = {
        ...session,
        sessionId,
      };
    },
    removeSession(sessionId) {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return;
      delete sessionsById[normalized];
    },
    getSession(sessionId) {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return null;
      return sessionsById[normalized] || null;
    },
    listSessions() {
      return Object.values(sessionsById);
    },
    listRecoverableSessions() {
      return Object.values(sessionsById)
        .filter((session) => session.canResume)
        .sort(sortByUpdatedAtDesc);
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
    storage.setItem(storageKey, JSON.stringify(registry.listSessions()));
  } catch {
    // ignore storage write failures
  }
}
