import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
  createTerminalSessionRegistry,
  loadTerminalSessionRegistryFromStorage,
  persistTerminalSessionRegistryToStorage,
  sortTerminalSessionsByUpdatedAtDesc,
  type TerminalSessionDescriptor,
  type TerminalSessionRegistry,
  type TerminalSessionStorageLike,
} from "./terminal-session-registry";

export interface TerminalWorkspaceState {
  sessions: ComputedRef<Record<string, TerminalSessionDescriptor>>;
  tabs: ComputedRef<TerminalSessionDescriptor[]>;
  openSessions: ComputedRef<TerminalSessionDescriptor[]>;
  recentSessions: ComputedRef<TerminalSessionDescriptor[]>;
  endedSessions: ComputedRef<TerminalSessionDescriptor[]>;
  tabOrder: Ref<string[]>;
  activeSessionId: Ref<string | null>;
  queuedCommand: Ref<string>;
  recoverableSessions: ComputedRef<TerminalSessionDescriptor[]>;
  registerSession(session: TerminalSessionDescriptor): void;
  hydrateSessions(sessions: TerminalSessionDescriptor[]): void;
  persistSessions(): void;
  setActiveSession(sessionId: string | null): void;
  setQueuedCommand(command: string): void;
  consumeQueuedCommand(): string;
  openTab(sessionId: string): void;
  renameSession(sessionId: string, title: string): void;
  endSession(sessionId: string): void;
  deleteSession(sessionId: string): void;
  closeTab(sessionId: string): void;
}

function normalizeSessionId(sessionId: string | null | undefined): string {
  return String(sessionId || "").trim();
}

export function createTerminalWorkspaceState(
  options: {
    registry?: TerminalSessionRegistry;
    storage?: TerminalSessionStorageLike | null;
    storageKey?: string;
    initialActiveSessionId?: string | null;
  } = {},
): TerminalWorkspaceState {
  const storageKey =
    options.storageKey || "openclaw-studio.terminal.descriptors";
  const workspaceUiStorageKey = `${storageKey}.workspace`;
  const storage =
    options.storage === undefined ? globalThis.localStorage : options.storage;
  const registry =
    options.registry ||
    loadTerminalSessionRegistryFromStorage(storage, storageKey);

  let restoredTabOrder: string[] = [];
  let restoredActiveSessionId: string | null = null;
  if (storage) {
    try {
      const raw = storage.getItem(workspaceUiStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          tabOrder?: unknown;
          activeSessionId?: unknown;
        };
        if (Array.isArray(parsed.tabOrder)) {
          restoredTabOrder = parsed.tabOrder
            .map((value) => normalizeSessionId(String(value || "")))
            .filter(Boolean);
        }
        restoredActiveSessionId =
          normalizeSessionId(String(parsed.activeSessionId || "")) || null;
      }
    } catch {
      restoredTabOrder = [];
      restoredActiveSessionId = null;
    }
  }

  const tabOrder = ref<string[]>(
    restoredTabOrder.filter((sessionId) =>
      Boolean(registry.getSession(sessionId)),
    ),
  );
  const activeSessionId = ref<string | null>(
    normalizeSessionId(options.initialActiveSessionId || "") ||
      restoredActiveSessionId ||
      null,
  );
  const queuedCommand = ref("");

  const sessions = computed(() => registry.sessionsById);

  const tabs = computed(() => {
    void Object.keys(registry.sessionsById).length;

    return tabOrder.value
      .map((sessionId) => registry.getSession(sessionId))
      .filter((session): session is TerminalSessionDescriptor =>
        Boolean(session),
      );
  });

  const recoverableSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter(
        (session) =>
          session.canResume ||
          (Boolean(session.recentOutputSummary?.tailText) &&
            (session.status === "completed" || session.status === "failed")),
      )
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  const openSessions = computed(() => tabs.value);

  const recentSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter(
        (session) =>
          !tabOrder.value.includes(session.sessionId) &&
          session.status !== "completed" &&
          session.status !== "failed" &&
          session.status !== "lost",
      )
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  const endedSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter(
        (session) =>
          !tabOrder.value.includes(session.sessionId) &&
          (session.status === "completed" ||
            session.status === "failed" ||
            session.status === "lost"),
      )
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  function ensureTab(sessionId: string): void {
    if (!tabOrder.value.includes(sessionId)) {
      tabOrder.value = [...tabOrder.value, sessionId];
    }
  }

  function persistWorkspaceUiState(): void {
    if (!storage) return;
    try {
      storage.setItem(
        workspaceUiStorageKey,
        JSON.stringify({
          tabOrder: tabOrder.value,
          activeSessionId: activeSessionId.value,
        }),
      );
    } catch {
      // ignore storage write failures
    }
  }

  function persistSessions(): void {
    persistTerminalSessionRegistryToStorage(registry, storage, storageKey);
    persistWorkspaceUiState();
  }

  function registerSession(session: TerminalSessionDescriptor): void {
    const sessionId = normalizeSessionId(session.sessionId);
    if (!sessionId) return;

    registry.upsertSession({
      ...session,
      sessionId,
    });

    ensureTab(sessionId);

    if (!activeSessionId.value) {
      activeSessionId.value = sessionId;
    }

    persistSessions();
  }

  function hydrateSessions(summaries: TerminalSessionDescriptor[]): void {
    const persistedSessionIds = new Set<string>();

    for (const summary of summaries) {
      const sessionId = normalizeSessionId(summary.sessionId);
      if (!sessionId) continue;
      persistedSessionIds.add(sessionId);
      registry.upsertSession({
        ...summary,
        sessionId,
      });
    }

    for (const sessionId of Object.keys(registry.sessionsById)) {
      if (!persistedSessionIds.has(sessionId)) {
        registry.removeSession(sessionId);
      }
    }

    tabOrder.value = tabOrder.value.filter((sessionId) =>
      Boolean(registry.getSession(sessionId)),
    );

    const currentActive = normalizeSessionId(activeSessionId.value || "");
    if (currentActive && registry.getSession(currentActive)) {
      ensureTab(currentActive);
      activeSessionId.value = currentActive;
      persistSessions();
      return;
    }

    activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
    persistSessions();
  }

  function setActiveSession(sessionId: string | null): void {
    const normalized = normalizeSessionId(sessionId || "");
    if (!normalized) {
      activeSessionId.value = null;
      persistWorkspaceUiState();
      return;
    }

    if (!registry.getSession(normalized)) {
      return;
    }

    ensureTab(normalized);
    activeSessionId.value = normalized;
    persistWorkspaceUiState();
  }

  function setQueuedCommand(command: string): void {
    queuedCommand.value = String(command || "");
  }

  function consumeQueuedCommand(): string {
    const value = queuedCommand.value;
    queuedCommand.value = "";
    return value;
  }

  function openTab(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized || !registry.getSession(normalized)) return;
    ensureTab(normalized);
    activeSessionId.value = normalized;
    persistWorkspaceUiState();
  }

  function renameSession(sessionId: string, title: string): void {
    registry.renameSession(sessionId, title);
    persistSessions();
  }

  function endSession(sessionId: string): void {
    const current = registry.getSession(sessionId);
    if (!current) return;
    registry.upsertSession({
      ...current,
      status: current.status === "failed" ? "failed" : "completed",
      canResume: false,
      updatedAt: new Date().toISOString(),
    });
    persistSessions();
  }

  function deleteSession(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    const current = registry.getSession(normalized);
    if (
      current &&
      (current.status === "running" || current.status === "detached")
    ) {
      throw new Error("terminal_session_delete_requires_ended_state");
    }

    registry.removeSession(sessionId);
    tabOrder.value = tabOrder.value.filter((tabId) => tabId !== normalized);
    if (activeSessionId.value === normalized) {
      activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
    }
    persistSessions();
  }

  function closeTab(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized) return;

    tabOrder.value = tabOrder.value.filter((tabId) => tabId !== normalized);

    if (activeSessionId.value !== normalized) {
      persistSessions();
      return;
    }

    if (!tabOrder.value.length) {
      activeSessionId.value = null;
      persistSessions();
      return;
    }

    activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
    persistSessions();
  }

  return {
    sessions,
    tabs,
    openSessions,
    recentSessions,
    endedSessions,
    tabOrder,
    activeSessionId,
    queuedCommand,
    recoverableSessions,
    registerSession,
    hydrateSessions,
    persistSessions,
    setActiveSession,
    setQueuedCommand,
    consumeQueuedCommand,
    openTab,
    renameSession,
    endSession,
    deleteSession,
    closeTab,
  };
}
