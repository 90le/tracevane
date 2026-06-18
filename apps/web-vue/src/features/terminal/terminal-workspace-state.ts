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

export interface TerminalQueuedCommand {
  sessionId: string;
  command: string;
}

export type TerminalPaneLayout = "single" | "columns" | "rows" | "grid";

export interface TerminalWorkspaceState {
  sessions: ComputedRef<Record<string, TerminalSessionDescriptor>>;
  tabs: ComputedRef<TerminalSessionDescriptor[]>;
  openSessions: ComputedRef<TerminalSessionDescriptor[]>;
  recentSessions: ComputedRef<TerminalSessionDescriptor[]>;
  endedSessions: ComputedRef<TerminalSessionDescriptor[]>;
  tabOrder: Ref<string[]>;
  activeSessionId: Ref<string | null>;
  activeProfileId: Ref<string | null>;
  paneSessionIds: Ref<string[]>;
  paneLayout: Ref<TerminalPaneLayout>;
  queuedCommand: Ref<TerminalQueuedCommand | null>;
  recoverableSessions: ComputedRef<TerminalSessionDescriptor[]>;
  registerSession(session: TerminalSessionDescriptor): void;
  hydrateSessions(sessions: TerminalSessionDescriptor[]): void;
  persistSessions(): void;
  setActiveSession(sessionId: string | null): void;
  setQueuedCommand(sessionId: string, command: string): void;
  consumeQueuedCommand(sessionId?: string | null): string;
  openTab(sessionId: string): void;
  moveTab(sessionId: string, targetIndex: number): void;
  setPaneLayout(layout: TerminalPaneLayout): void;
  setPaneSessions(sessionIds: string[]): void;
  splitSession(sessionId: string, layout: Exclude<TerminalPaneLayout, "single">): void;
  closePane(sessionId: string): void;
  pinSession(sessionId: string, pinned: boolean): void;
  setActiveProfile(profileId: string | null): void;
  renameSession(sessionId: string, title: string): void;
  endSession(sessionId: string): void;
  deleteSession(sessionId: string): void;
  closeTab(sessionId: string): void;
}

function normalizeSessionId(sessionId: string | null | undefined): string {
  return String(sessionId || "").trim();
}

function normalizePaneLayout(layout: unknown): TerminalPaneLayout {
  if (layout === "columns" || layout === "rows" || layout === "grid") {
    return layout;
  }
  return "single";
}

function isOpenTerminalSession(session: TerminalSessionDescriptor): boolean {
  return (
    session.status === "running" ||
    session.status === "detached"
  );
}

function mergeTerminalSessionMetadata(
  existing: TerminalSessionDescriptor | null,
  incoming: TerminalSessionDescriptor,
): TerminalSessionDescriptor {
  if (!existing) {
    return incoming;
  }

  const incomingProfileId = incoming.profileId
    ? String(incoming.profileId).trim()
    : "";
  const existingProfileId = existing.profileId
    ? String(existing.profileId).trim()
    : "";
  const preferExistingProfileMetadata =
    !incomingProfileId && Boolean(existingProfileId);

  return {
    ...incoming,
    profileId: preferExistingProfileMetadata
      ? existing.profileId
      : incoming.profileId || existing.profileId || null,
    targetKind: preferExistingProfileMetadata
      ? existing.targetKind || incoming.targetKind || "local"
      : incoming.targetKind || existing.targetKind || "local",
    cwd: incoming.cwd || existing.cwd || null,
    pinned: existing.pinned,
  };
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
    options.storageKey || "tracevane.terminal.descriptors";
  const workspaceUiStorageKey = `${storageKey}.workspace`;
  const storage =
    options.storage === undefined ? globalThis.localStorage : options.storage;
  const registry =
    options.registry ||
    loadTerminalSessionRegistryFromStorage(storage, storageKey);

  let restoredTabOrder: string[] = [];
  let restoredActiveSessionId: string | null = null;
  let restoredActiveProfileId: string | null = null;
  let restoredPaneSessionIds: string[] = [];
  let restoredPaneLayout: TerminalPaneLayout = "single";
  if (storage) {
    try {
      const raw = storage.getItem(workspaceUiStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          tabOrder?: unknown;
          activeSessionId?: unknown;
          activeProfileId?: unknown;
          paneSessionIds?: unknown;
          paneLayout?: unknown;
        };
        if (Array.isArray(parsed.tabOrder)) {
          restoredTabOrder = parsed.tabOrder
            .map((value) => normalizeSessionId(String(value || "")))
            .filter(Boolean);
        }
        if (Array.isArray(parsed.paneSessionIds)) {
          restoredPaneSessionIds = parsed.paneSessionIds
            .map((value) => normalizeSessionId(String(value || "")))
            .filter(Boolean);
        }
        restoredActiveSessionId =
          normalizeSessionId(String(parsed.activeSessionId || "")) || null;
        restoredActiveProfileId =
          String(parsed.activeProfileId || "").trim() || null;
        restoredPaneLayout = normalizePaneLayout(parsed.paneLayout);
      }
    } catch {
      restoredTabOrder = [];
      restoredActiveSessionId = null;
      restoredPaneSessionIds = [];
      restoredPaneLayout = "single";
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
  const activeProfileId = ref<string | null>(restoredActiveProfileId);
  const paneSessionIds = ref<string[]>(
    restoredPaneSessionIds
      .filter((sessionId) => Boolean(registry.getSession(sessionId)))
      .slice(0, 4),
  );
  const paneLayout = ref<TerminalPaneLayout>(
    paneSessionIds.value.length > 1 ? restoredPaneLayout : "single",
  );
  const queuedCommand = ref<TerminalQueuedCommand | null>(null);

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
      .filter((session) => isOpenTerminalSession(session) && session.canResume)
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  const openSessions = computed(() =>
    tabs.value.filter(isOpenTerminalSession),
  );

  const recentSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter(
        (session) =>
          !tabOrder.value.includes(session.sessionId) &&
          isOpenTerminalSession(session),
      )
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  const endedSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter(
        (session) =>
          session.status === "completed" ||
          session.status === "failed" ||
          session.status === "lost",
      )
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  function ensureTab(sessionId: string): void {
    if (!tabOrder.value.includes(sessionId)) {
      tabOrder.value = [...tabOrder.value, sessionId];
    }
  }

  function normalizePaneSessions(sessionIds: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const sessionId of sessionIds) {
      const candidate = normalizeSessionId(sessionId);
      if (!candidate || seen.has(candidate) || !registry.getSession(candidate)) {
        continue;
      }
      seen.add(candidate);
      normalized.push(candidate);
      if (normalized.length >= 4) {
        break;
      }
    }
    return normalized;
  }

  function reconcilePaneState(): void {
    const active = normalizeSessionId(activeSessionId.value || "");
    let nextPaneSessionIds = normalizePaneSessions(paneSessionIds.value);

    if (active && registry.getSession(active) && !nextPaneSessionIds.includes(active)) {
      nextPaneSessionIds = [active, ...nextPaneSessionIds].slice(0, 4);
    }

    paneSessionIds.value = nextPaneSessionIds;
    if (paneSessionIds.value.length <= 1) {
      paneLayout.value = "single";
    } else if (paneLayout.value === "single") {
      paneLayout.value = "columns";
    }
  }

  function syncPanesToActiveSession(sessionId: string | null): void {
    const normalized = normalizeSessionId(sessionId || "");
    if (!normalized || !registry.getSession(normalized)) {
      reconcilePaneState();
      return;
    }

    if (paneLayout.value === "single" || paneSessionIds.value.length <= 1) {
      paneSessionIds.value = [normalized];
      paneLayout.value = "single";
      return;
    }

    if (!paneSessionIds.value.includes(normalized)) {
      paneSessionIds.value = [normalized, ...paneSessionIds.value].slice(0, 4);
    }
    reconcilePaneState();
  }

  function persistWorkspaceUiState(): void {
    if (!storage) return;
    try {
      storage.setItem(
        workspaceUiStorageKey,
        JSON.stringify({
          tabOrder: tabOrder.value,
          activeSessionId: activeSessionId.value,
          activeProfileId: activeProfileId.value,
          paneSessionIds: paneSessionIds.value,
          paneLayout: paneLayout.value,
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

    const existing = registry.getSession(sessionId);
    registry.upsertSession(
      mergeTerminalSessionMetadata(existing, {
        ...session,
        sessionId,
      }),
    );

    ensureTab(sessionId);

    if (!activeSessionId.value) {
      activeSessionId.value = sessionId;
    }

    syncPanesToActiveSession(activeSessionId.value);
    persistSessions();
  }

  function hydrateSessions(summaries: TerminalSessionDescriptor[]): void {
    const persistedSessionIds = new Set<string>();

    for (const summary of summaries) {
      const sessionId = normalizeSessionId(summary.sessionId);
      if (!sessionId) continue;
      if (!isOpenTerminalSession(summary)) continue;
      persistedSessionIds.add(sessionId);
      const existing = registry.getSession(sessionId);
      registry.upsertSession(
        mergeTerminalSessionMetadata(existing, {
          ...summary,
          sessionId,
        }),
      );
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
      syncPanesToActiveSession(currentActive);
      persistSessions();
      return;
    }

    const preferredSession = Object.values(registry.sessionsById)
      .filter((session) => isOpenTerminalSession(session) && session.canResume)
      .sort(sortTerminalSessionsByUpdatedAtDesc)[0]
      || Object.values(registry.sessionsById)
        .filter(isOpenTerminalSession)
        .sort(sortTerminalSessionsByUpdatedAtDesc)[0]
      || null;

    if (preferredSession?.sessionId) {
      ensureTab(preferredSession.sessionId);
      activeSessionId.value = preferredSession.sessionId;
    } else {
      activeSessionId.value = null;
    }
    syncPanesToActiveSession(activeSessionId.value);
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
    syncPanesToActiveSession(normalized);
    persistWorkspaceUiState();
  }

  function setQueuedCommand(sessionId: string, command: string): void {
    const normalizedSessionId = normalizeSessionId(sessionId);
    const normalizedCommand = String(command || "");
    if (!normalizedSessionId || !normalizedCommand) {
      queuedCommand.value = null;
      return;
    }
    queuedCommand.value = {
      sessionId: normalizedSessionId,
      command: normalizedCommand,
    };
  }

  function consumeQueuedCommand(sessionId?: string | null): string {
    if (!queuedCommand.value) return "";
    const normalizedSessionId = normalizeSessionId(sessionId || "");
    if (
      normalizedSessionId &&
      queuedCommand.value.sessionId !== normalizedSessionId
    ) {
      return "";
    }
    const value = queuedCommand.value.command;
    queuedCommand.value = null;
    return value;
  }

  function openTab(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized || !registry.getSession(normalized)) return;
    ensureTab(normalized);
    activeSessionId.value = normalized;
    syncPanesToActiveSession(normalized);
    persistWorkspaceUiState();
  }

  function moveTab(sessionId: string, targetIndex: number): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized || !registry.getSession(normalized)) return;
    const currentOrder = tabOrder.value.filter((tabId) => tabId !== normalized);
    const boundedIndex = Math.max(
      0,
      Math.min(currentOrder.length, Math.floor(Number(targetIndex) || 0)),
    );
    tabOrder.value = [
      ...currentOrder.slice(0, boundedIndex),
      normalized,
      ...currentOrder.slice(boundedIndex),
    ];
    persistWorkspaceUiState();
  }

  function setPaneLayout(layout: TerminalPaneLayout): void {
    const normalizedLayout = normalizePaneLayout(layout);
    paneLayout.value =
      normalizedLayout === "single" || paneSessionIds.value.length <= 1
        ? "single"
        : normalizedLayout;
    persistWorkspaceUiState();
  }

  function setPaneSessions(sessionIds: string[]): void {
    const normalized = normalizePaneSessions(sessionIds);
    for (const sessionId of normalized) {
      ensureTab(sessionId);
    }
    paneSessionIds.value = normalized;
    if (normalized.length <= 1) {
      paneLayout.value = "single";
    } else if (paneLayout.value === "single") {
      paneLayout.value = "columns";
    }
    if (
      activeSessionId.value &&
      !paneSessionIds.value.includes(activeSessionId.value)
    ) {
      activeSessionId.value = paneSessionIds.value[0] || activeSessionId.value;
    }
    persistWorkspaceUiState();
  }

  function splitSession(
    sessionId: string,
    layout: Exclude<TerminalPaneLayout, "single">,
  ): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized || !registry.getSession(normalized)) return;

    ensureTab(normalized);
    activeSessionId.value = normalized;

    const companionIds = [
      ...paneSessionIds.value,
      ...tabOrder.value,
      ...Object.keys(registry.sessionsById),
    ].filter((candidate) => candidate !== normalized);
    const nextPaneSessionIds = normalizePaneSessions([
      normalized,
      ...companionIds,
    ]);
    paneSessionIds.value = nextPaneSessionIds;
    paneLayout.value = nextPaneSessionIds.length > 1 ? normalizePaneLayout(layout) : "single";
    persistWorkspaceUiState();
  }

  function closePane(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized) return;

    paneSessionIds.value = paneSessionIds.value.filter((paneId) => paneId !== normalized);
    if (activeSessionId.value === normalized) {
      activeSessionId.value =
        paneSessionIds.value[0] ||
        tabOrder.value.find((tabId) => registry.getSession(tabId)) ||
        null;
      if (activeSessionId.value) {
        ensureTab(activeSessionId.value);
      }
    }
    reconcilePaneState();
    persistWorkspaceUiState();
  }

  function pinSession(sessionId: string, pinned: boolean): void {
    const normalized = normalizeSessionId(sessionId);
    const current = registry.getSession(normalized);
    if (!current) return;
    registry.upsertSession({
      ...current,
      pinned,
      updatedAt: new Date().toISOString(),
    });
    persistSessions();
  }

  function setActiveProfile(profileId: string | null): void {
    activeProfileId.value = String(profileId || "").trim() || null;
    persistWorkspaceUiState();
  }

  function renameSession(sessionId: string, title: string): void {
    registry.renameSession(sessionId, title);
    persistSessions();
  }

  function endSession(sessionId: string): void {
    removeSessionFromWorkspace(sessionId);
  }

  function removeSessionFromWorkspace(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized) return;

    registry.removeSession(sessionId);
    tabOrder.value = tabOrder.value.filter((tabId) => tabId !== normalized);
    paneSessionIds.value = paneSessionIds.value.filter((paneId) => paneId !== normalized);
    if (activeSessionId.value === normalized) {
      activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
    }
    syncPanesToActiveSession(activeSessionId.value);
    persistSessions();
  }

  function deleteSession(sessionId: string): void {
    removeSessionFromWorkspace(sessionId);
  }

  function closeTab(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized) return;

    tabOrder.value = tabOrder.value.filter((tabId) => tabId !== normalized);
    paneSessionIds.value = paneSessionIds.value.filter((paneId) => paneId !== normalized);

    if (activeSessionId.value !== normalized) {
      reconcilePaneState();
      persistSessions();
      return;
    }

    if (!tabOrder.value.length) {
      activeSessionId.value = null;
      syncPanesToActiveSession(null);
      persistSessions();
      return;
    }

    activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
    syncPanesToActiveSession(activeSessionId.value);
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
    activeProfileId,
    paneSessionIds,
    paneLayout,
    queuedCommand,
    recoverableSessions,
    registerSession,
    hydrateSessions,
    persistSessions,
    setActiveSession,
    setQueuedCommand,
    consumeQueuedCommand,
    openTab,
    moveTab,
    setPaneLayout,
    setPaneSessions,
    splitSession,
    closePane,
    pinSession,
    setActiveProfile,
    renameSession,
    endSession,
    deleteSession,
    closeTab,
  };
}
