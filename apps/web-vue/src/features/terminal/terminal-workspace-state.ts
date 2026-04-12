import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
  createTerminalSessionRegistry,
  sortTerminalSessionsByUpdatedAtDesc,
  type TerminalSessionDescriptor,
  type TerminalSessionRegistry,
} from "./terminal-session-registry";

export interface TerminalWorkspaceState {
  sessions: ComputedRef<Record<string, TerminalSessionDescriptor>>;
  tabs: ComputedRef<TerminalSessionDescriptor[]>;
  tabOrder: Ref<string[]>;
  activeSessionId: Ref<string | null>;
  recoverableSessions: ComputedRef<TerminalSessionDescriptor[]>;
  registerSession(session: TerminalSessionDescriptor): void;
  hydrateSessions(sessions: TerminalSessionDescriptor[]): void;
  setActiveSession(sessionId: string | null): void;
  closeTab(sessionId: string): void;
}

function normalizeSessionId(sessionId: string | null | undefined): string {
  return String(sessionId || "").trim();
}

export function createTerminalWorkspaceState(
  options: {
    registry?: TerminalSessionRegistry;
    initialActiveSessionId?: string | null;
  } = {},
): TerminalWorkspaceState {
  const registry = options.registry || createTerminalSessionRegistry();
  const tabOrder = ref<string[]>([]);
  const activeSessionId = ref<string | null>(
    normalizeSessionId(options.initialActiveSessionId || "") || null,
  );

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
      .filter((session) => session.canResume)
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  function ensureTab(sessionId: string): void {
    if (!tabOrder.value.includes(sessionId)) {
      tabOrder.value = [...tabOrder.value, sessionId];
    }
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
  }

  function hydrateSessions(summaries: TerminalSessionDescriptor[]): void {
    for (const summary of summaries) {
      const sessionId = normalizeSessionId(summary.sessionId);
      if (!sessionId) continue;
      registry.upsertSession({
        ...summary,
        sessionId,
      });
    }

    const orderedIds = summaries
      .map((summary) => normalizeSessionId(summary.sessionId))
      .filter((sessionId) => Boolean(registry.getSession(sessionId)));

    tabOrder.value = orderedIds;

    const currentActive = normalizeSessionId(activeSessionId.value || "");
    if (currentActive && registry.getSession(currentActive)) {
      ensureTab(currentActive);
      activeSessionId.value = currentActive;
      return;
    }

    activeSessionId.value = tabOrder.value[0] || null;
  }

  function setActiveSession(sessionId: string | null): void {
    const normalized = normalizeSessionId(sessionId || "");
    if (!normalized) {
      activeSessionId.value = null;
      return;
    }

    if (!registry.getSession(normalized)) {
      return;
    }

    ensureTab(normalized);
    activeSessionId.value = normalized;
  }

  function closeTab(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized) return;

    tabOrder.value = tabOrder.value.filter((tabId) => tabId !== normalized);

    if (activeSessionId.value !== normalized) return;

    if (!tabOrder.value.length) {
      activeSessionId.value = null;
      return;
    }

    activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
  }

  return {
    sessions,
    tabs,
    tabOrder,
    activeSessionId,
    recoverableSessions,
    registerSession,
    hydrateSessions,
    setActiveSession,
    closeTab,
  };
}
