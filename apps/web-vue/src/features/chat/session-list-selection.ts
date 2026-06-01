import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  pruneSelectedSessionKeys,
  toggleSelectAllVisibleSessionKeys,
  toggleSessionSelectionKeys,
} from '../../../../../lib/chat-session-list-state';
import type { ChatSessionOrganizerState, ChatSessionRow } from '../../../../../types/chat';
import { buildSessionListSelectionSummary } from './chat-session-list-selection';

type ReadonlyRef<T> = Ref<T> | ComputedRef<T>;

export function useSessionListSelection(params: {
  visibleActiveSessions: ReadonlyRef<ChatSessionRow[]>;
  visibleArchivedSessions: ReadonlyRef<ChatSessionRow[]>;
  allOrganizerSessions: ReadonlyRef<ChatSessionRow[]>;
  organizer: ReadonlyRef<ChatSessionOrganizerState>;
  canManageSession: (session: ChatSessionRow) => boolean;
}) {
  const selectionMode = ref(false);
  const selectedSessionKeys = ref<string[]>([]);
  const selectedSet = computed(() => new Set(selectedSessionKeys.value));
  const selectionSummary = computed(() => buildSessionListSelectionSummary({
    selectedKeys: selectedSessionKeys.value,
    visibleSessions: [
      ...params.visibleActiveSessions.value,
      ...params.visibleArchivedSessions.value,
    ],
    organizerSessions: params.allOrganizerSessions.value,
    organizer: params.organizer.value,
    canManageSession: params.canManageSession,
  }));
  const manageableVisibleSessionKeys = computed(() => selectionSummary.value.manageableVisibleSessionKeys);
  const selectedManageableSessionKeys = computed(() => selectionSummary.value.selectedManageableSessionKeys);
  const allVisibleSessionsSelected = computed(() => selectionSummary.value.allVisibleSessionsSelected);
  const organizerFolderSummary = computed(() => selectionSummary.value.organizerFolderSummary);

  function clearSelection(): void {
    selectedSessionKeys.value = [];
  }

  function setSelectionMode(next: boolean): void {
    selectionMode.value = next;
    if (!next) {
      clearSelection();
    }
  }

  function toggleSelectionMode(): void {
    setSelectionMode(!selectionMode.value);
  }

  function toggleSessionSelection(sessionKey: string): void {
    selectedSessionKeys.value = toggleSessionSelectionKeys(selectedSessionKeys.value, sessionKey);
  }

  function toggleSelectAllVisible(): void {
    selectedSessionKeys.value = toggleSelectAllVisibleSessionKeys(
      selectedSessionKeys.value,
      manageableVisibleSessionKeys.value,
      allVisibleSessionsSelected.value,
    );
  }

  watch(() => params.allOrganizerSessions.value, (sessions) => {
    selectedSessionKeys.value = pruneSelectedSessionKeys(
      selectedSessionKeys.value,
      sessions.map((session) => session.key),
    );
  });

  return {
    selectionMode,
    selectedSessionKeys,
    selectedSet,
    manageableVisibleSessionKeys,
    selectedManageableSessionKeys,
    allVisibleSessionsSelected,
    organizerFolderSummary,
    clearSelection,
    setSelectionMode,
    toggleSelectionMode,
    toggleSessionSelection,
    toggleSelectAllVisible,
  };
}
