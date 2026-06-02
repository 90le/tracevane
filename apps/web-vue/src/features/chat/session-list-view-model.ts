import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  CHAT_SESSION_SEARCH_VISIBLE_LIMIT,
  CHAT_SESSION_VISIBLE_LIMITS,
  resolveSessionSectionWindow,
} from '../../../../../lib/chat-session-catalog';
import {
  buildArchivedOrganizerEntry,
  deriveOrganizerChildFolders,
  type ChatBuiltInOrganizerEntry,
  deriveOrganizerFolderPath,
  deriveOrganizerFolderSessions,
  isArchivedBuiltInFolderId,
  deriveOrganizerRootSessions,
  orderOrganizerFolders,
  pruneOrganizerStateSessionKeys,
} from '../../../../../lib/chat-session-organizer';
import type {
  ChatSessionFolder,
  ChatSessionOrganizerState,
  ChatSessionRow,
} from '../../../../../types/chat';

type ReadonlyRef<T> = Ref<T> | ComputedRef<T>;
type TextFn = (chinese: string, english: string) => string;

export type OrganizerEntry = ChatSessionFolder | ChatBuiltInOrganizerEntry;
export type SessionListScope = 'all' | 'folders' | 'archived';

export function useSessionListViewModel(params: {
  organizer: ReadonlyRef<ChatSessionOrganizerState>;
  activeSessions: ReadonlyRef<ChatSessionRow[]>;
  archivedSessions: ReadonlyRef<ChatSessionRow[]>;
  observedSessions: ReadonlyRef<ChatSessionRow[]>;
  text: TextFn;
}) {
  const currentFolderId = ref('');
  const listScope = ref<SessionListScope>('all');
  const allOrganizerSessions = computed(() => [
    ...params.activeSessions.value,
    ...params.archivedSessions.value,
  ]);
  const validOrganizerSessionKeys = computed(() => allOrganizerSessions.value.map((session) => session.key));
  const prunedOrganizer = computed(() => pruneOrganizerStateSessionKeys(
    params.organizer.value,
    validOrganizerSessionKeys.value,
  ));
  const orderedFolders = computed(() => orderOrganizerFolders(prunedOrganizer.value));
  const archivedEntry = computed<ChatBuiltInOrganizerEntry | null>(() => (
    params.archivedSessions.value.length ? buildArchivedOrganizerEntry(params.archivedSessions.value) : null
  ));
  const archiveViewOpen = computed(() => listScope.value === 'archived');
  const currentFolder = computed(() => (
    listScope.value === 'folders'
      ? orderedFolders.value.find((folder) => folder.id === currentFolderId.value) || null
      : null
  ));
  const currentFolderPath = computed(() => currentFolder.value
    ? deriveOrganizerFolderPath(prunedOrganizer.value, currentFolder.value.id)
    : []);
  const currentFolderLabel = computed(() => {
    if (archiveViewOpen.value) {
      return params.text('已归档', 'Archived');
    }
    return currentFolder.value?.title || params.text('会话', 'Chats');
  });
  const rootActiveSessions = computed(() => deriveOrganizerRootSessions(
    params.activeSessions.value,
    prunedOrganizer.value,
  ));
  const folderActiveSessions = computed(() => currentFolder.value
    ? deriveOrganizerFolderSessions(params.activeSessions.value, prunedOrganizer.value, currentFolder.value.id)
    : []);
  const baseActiveSessions = computed(() => {
    if (listScope.value === 'archived') {
      return [];
    }
    if (listScope.value === 'folders') {
      return currentFolder.value ? folderActiveSessions.value : rootActiveSessions.value;
    }
    return rootActiveSessions.value;
  });
  const baseArchivedSessions = computed(() => listScope.value === 'archived' ? params.archivedSessions.value : []);
  const baseObservedSessions = computed(() => listScope.value === 'all' ? params.observedSessions.value : []);

  function collectFolderBranchSessions(folderId: string): ChatSessionRow[] {
    const directSessions = deriveOrganizerFolderSessions(
      params.activeSessions.value,
      prunedOrganizer.value,
      folderId,
    );
    const childSessions = deriveOrganizerChildFolders(prunedOrganizer.value, folderId)
      .flatMap((folder) => collectFolderBranchSessions(folder.id));
    return [...directSessions, ...childSessions];
  }

  function collectFolderBranchTitles(folderId: string): string[] {
    const childFolders = deriveOrganizerChildFolders(prunedOrganizer.value, folderId);
    return childFolders.flatMap((folder) => [folder.title, ...collectFolderBranchTitles(folder.id)]);
  }

  function folderSessionCount(folderId: string): number {
    return collectFolderBranchSessions(folderId).length;
  }

  function folderChildCount(folderId: string): number {
    return deriveOrganizerChildFolders(prunedOrganizer.value, folderId).length;
  }

  function isBuiltInArchivedEntry(entry: OrganizerEntry): entry is ChatBuiltInOrganizerEntry {
    return 'kind' in entry && entry.kind === 'archived';
  }

  function isUserFolder(entry: OrganizerEntry): entry is ChatSessionFolder {
    return !isBuiltInArchivedEntry(entry);
  }

  function folderTitle(entry: OrganizerEntry): string {
    return isBuiltInArchivedEntry(entry) ? params.text('已归档', 'Archived') : entry.title;
  }

  function organizerFolderForSession(sessionKey: string): string | null {
    return prunedOrganizer.value.sessionFolderMap[sessionKey] || null;
  }

  function enterFolder(folderId: string): void {
    if (isArchivedBuiltInFolderId(folderId)) {
      currentFolderId.value = '';
      listScope.value = 'archived';
      return;
    }
    currentFolderId.value = folderId;
  }

  function leaveFolder(): void {
    currentFolderId.value = '';
    listScope.value = listScope.value === 'archived' ? 'all' : 'folders';
  }

  function setListScope(nextScope: SessionListScope): void {
    listScope.value = nextScope;
    if (nextScope !== 'folders') {
      currentFolderId.value = '';
    }
  }

  watch(orderedFolders, (folders) => {
    if (
      currentFolderId.value
      && listScope.value === 'folders'
      && !folders.some((folder) => folder.id === currentFolderId.value)
    ) {
      currentFolderId.value = '';
    }
  });

  return {
    currentFolderId,
    allOrganizerSessions,
    prunedOrganizer,
    orderedFolders,
    archivedEntry,
    archiveViewOpen,
    currentFolder,
    currentFolderPath,
    currentFolderLabel,
    listScope,
    rootActiveSessions,
    folderActiveSessions,
    baseActiveSessions,
    baseArchivedSessions,
    baseObservedSessions,
    collectFolderBranchSessions,
    collectFolderBranchTitles,
    folderSessionCount,
    folderChildCount,
    isBuiltInArchivedEntry,
    isUserFolder,
    folderTitle,
    organizerFolderForSession,
    enterFolder,
    leaveFolder,
    setListScope,
  };
}

export function useSessionListWindows(params: {
  filteredActiveSessions: ReadonlyRef<ChatSessionRow[]>;
  filteredArchivedSessions: ReadonlyRef<ChatSessionRow[]>;
  filteredObservedSessions: ReadonlyRef<ChatSessionRow[]>;
  visibleFolderEntries: ReadonlyRef<OrganizerEntry[]>;
  visibleChildFolders: ReadonlyRef<ChatSessionFolder[]>;
  currentFolder: ReadonlyRef<ChatSessionFolder | null>;
  archiveViewOpen: ReadonlyRef<boolean>;
  showObserved: ReadonlyRef<boolean>;
  searchActive: ReadonlyRef<boolean>;
  loading: ReadonlyRef<boolean>;
  text: TextFn;
}) {
  const activeVisibleCount = ref<number>(CHAT_SESSION_VISIBLE_LIMITS.active);
  const archivedVisibleCount = ref<number>(CHAT_SESSION_VISIBLE_LIMITS.archived);
  const observedVisibleCount = ref<number>(CHAT_SESSION_VISIBLE_LIMITS.observed);

  const activeWindow = computed(() => resolveSessionSectionWindow(params.filteredActiveSessions.value, {
    visibleCount: activeVisibleCount.value,
    searchActive: params.searchActive.value,
  }));
  const archivedWindow = computed(() => resolveSessionSectionWindow(params.filteredArchivedSessions.value, {
    visibleCount: archivedVisibleCount.value,
    searchActive: params.searchActive.value,
  }));
  const observedWindow = computed(() => {
    if (!params.showObserved.value) {
      return {
        rows: [],
        hiddenCount: 0,
      };
    }
    return resolveSessionSectionWindow(params.filteredObservedSessions.value, {
      visibleCount: observedVisibleCount.value,
      searchActive: params.searchActive.value,
    });
  });

  const visibleActiveSessions = computed(() => activeWindow.value.rows);
  const visibleArchivedSessions = computed(() => archivedWindow.value.rows);
  const visibleObservedSessions = computed(() => observedWindow.value.rows);
  const activeHiddenCount = computed(() => activeWindow.value.hiddenCount);
  const archivedHiddenCount = computed(() => archivedWindow.value.hiddenCount);
  const observedHiddenCount = computed(() => observedWindow.value.hiddenCount);
  const hasHiddenRows = computed(() => (
    activeHiddenCount.value
    + archivedHiddenCount.value
    + observedHiddenCount.value
  ) > 0);
  const hasVisibleContent = computed(() => (
    params.visibleFolderEntries.value.length
    + params.visibleChildFolders.value.length
    + visibleActiveSessions.value.length
    + visibleArchivedSessions.value.length
    + visibleObservedSessions.value.length
  ) > 0);
  const showInitialLoading = computed(() => params.loading.value && !hasVisibleContent.value);
  const currentViewSummary = computed(() => {
    if (params.archiveViewOpen.value) {
      return params.text(
        `${params.filteredArchivedSessions.value.length} 个归档会话`,
        `${params.filteredArchivedSessions.value.length} archived chats`,
      );
    }
    if (!params.currentFolder.value) {
      return '';
    }
    return params.text(
      `${params.visibleChildFolders.value.length} 个子文件夹 · ${params.filteredActiveSessions.value.length} 个会话`,
      `${params.visibleChildFolders.value.length} subfolders · ${params.filteredActiveSessions.value.length} chats`,
    );
  });

  function nextVisibleCount(current: number, increment: number): number {
    if (params.searchActive.value && current < CHAT_SESSION_SEARCH_VISIBLE_LIMIT) {
      return CHAT_SESSION_SEARCH_VISIBLE_LIMIT + increment;
    }
    return current + increment;
  }

  function showMore(section: 'active' | 'archived' | 'observed'): void {
    if (section === 'active') {
      activeVisibleCount.value = nextVisibleCount(activeVisibleCount.value, CHAT_SESSION_VISIBLE_LIMITS.active);
      return;
    }
    if (section === 'archived') {
      archivedVisibleCount.value = nextVisibleCount(archivedVisibleCount.value, CHAT_SESSION_VISIBLE_LIMITS.archived);
      return;
    }
    observedVisibleCount.value = nextVisibleCount(observedVisibleCount.value, CHAT_SESSION_VISIBLE_LIMITS.observed);
  }

  function showMoreVisibleSections(): void {
    if (params.archiveViewOpen.value) {
      if (archivedHiddenCount.value > 0) {
        showMore('archived');
      }
      return;
    }
    if (activeHiddenCount.value > 0) {
      showMore('active');
    }
    if (params.showObserved.value && observedHiddenCount.value > 0) {
      showMore('observed');
    }
  }

  function resetVisibleCounts(): void {
    activeVisibleCount.value = CHAT_SESSION_VISIBLE_LIMITS.active;
    archivedVisibleCount.value = CHAT_SESSION_VISIBLE_LIMITS.archived;
    observedVisibleCount.value = CHAT_SESSION_VISIBLE_LIMITS.observed;
  }

  return {
    activeVisibleCount,
    archivedVisibleCount,
    observedVisibleCount,
    visibleActiveSessions,
    visibleArchivedSessions,
    visibleObservedSessions,
    activeHiddenCount,
    archivedHiddenCount,
    observedHiddenCount,
    hasHiddenRows,
    hasVisibleContent,
    showInitialLoading,
    currentViewSummary,
    showMore,
    showMoreVisibleSections,
    resetVisibleCounts,
  };
}
