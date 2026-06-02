import {
  computed,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  deriveSessionAgentOptions,
  normalizeSessionFilterQuery,
  sessionMatchesListFilter,
} from '../../../../../lib/chat-session-list-state';
import type { ChatSessionFolder, ChatSessionRow } from '../../../../../types/chat';
import type { OrganizerEntry, SessionListScope } from './session-list-view-model';

type ReadonlyRef<T> = Ref<T> | ComputedRef<T>;
type TextFn = (chinese: string, english: string) => string;

type SessionFilterChip = {
  id: string;
  label: string;
};

type SessionSourceFilter = 'all' | ChatSessionRow['source']['source'];

type SessionSourceOption = {
  id: SessionSourceFilter;
  label: string;
};

function deriveSessionSourceOptions(
  sessions: ChatSessionRow[],
  text: TextFn,
): SessionSourceOption[] {
  const seen = new Set<string>();
  const labels: Record<ChatSessionRow['source']['source'], string> = {
    studio: text('Studio', 'Studio'),
    external: text('外部', 'External'),
    system: text('系统', 'System'),
  };

  const options = sessions
    .filter((session) => {
      if (seen.has(session.source.source)) {
        return false;
      }
      seen.add(session.source.source);
      return true;
    })
    .map((session) => ({
      id: session.source.source,
      label: labels[session.source.source],
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));

  return options;
}

function formatFilterLabel(text: TextFn, kind: 'agent' | 'source', label: string): string {
  return kind === 'agent'
    ? text(`Agent: ${label}`, `Agent: ${label}`)
    : text(`Source: ${label}`, `Source: ${label}`);
}

export function useSessionListFilters(params: {
  baseActiveSessions: ReadonlyRef<ChatSessionRow[]>;
  baseArchivedSessions: ReadonlyRef<ChatSessionRow[]>;
  archivedSessions: ReadonlyRef<ChatSessionRow[]>;
  baseObservedSessions: ReadonlyRef<ChatSessionRow[]>;
  orderedFolders: ReadonlyRef<ChatSessionFolder[]>;
  archivedEntry: ReadonlyRef<OrganizerEntry | null>;
  currentFolder: ReadonlyRef<ChatSessionFolder | null>;
  listScope: ReadonlyRef<SessionListScope>;
  archiveViewOpen: ReadonlyRef<boolean>;
  text: TextFn;
  agentNameFor: (session: ChatSessionRow) => string;
  sessionTitle: (session: ChatSessionRow) => string;
  sessionPreview: (session: ChatSessionRow, observed?: boolean) => string;
  organizerFolderForSession: (sessionKey: string) => string | null;
  collectFolderBranchSessions: (folderId: string) => ChatSessionRow[];
  collectFolderBranchTitles: (folderId: string) => string[];
}) {
  const searchText = ref('');
  const selectedAgentFilter = ref('all');
  const selectedSourceFilter = ref<SessionSourceFilter>('all');
  const filterPanelOpen = ref(false);

  const normalizedQuery = computed(() => normalizeSessionFilterQuery(searchText.value));
  const searchActive = computed(() => Boolean(
    normalizedQuery.value
    || selectedAgentFilter.value !== 'all'
    || selectedSourceFilter.value !== 'all'
  ));
  const scopeFilterSessions = computed(() => {
    if (params.listScope.value === 'archived') {
      return params.baseArchivedSessions.value;
    }

    if (params.listScope.value === 'folders') {
      if (params.currentFolder.value) {
        return params.collectFolderBranchSessions(params.currentFolder.value.id);
      }

      const rootFolders = params.orderedFolders.value.filter((folder) => !folder.parentId);
      const branchSessions = rootFolders.flatMap((folder) => params.collectFolderBranchSessions(folder.id));
      return Array.from(new Map([
        ...params.baseActiveSessions.value,
        ...branchSessions,
        ...params.archivedSessions.value,
      ].map((session) => [session.key, session])).values());
    }

    return [
      ...params.baseActiveSessions.value,
      ...params.baseArchivedSessions.value,
      ...params.baseObservedSessions.value,
    ];
  });
  const availableAgentOptions = computed(() => deriveSessionAgentOptions(
    scopeFilterSessions.value,
    params.agentNameFor,
  ));
  const availableSourceOptions = computed(() => deriveSessionSourceOptions(
    scopeFilterSessions.value,
    params.text,
  ));
  const activeAgentLabel = computed(() => (
    availableAgentOptions.value.find((agent) => agent.id === selectedAgentFilter.value)?.label
    || selectedAgentFilter.value
  ));
  const activeSourceLabel = computed(() => (
    availableSourceOptions.value.find((source) => source.id === selectedSourceFilter.value)?.label
    || selectedSourceFilter.value
  ));
  const activeFilterChips = computed<SessionFilterChip[]>(() => {
    const chips: SessionFilterChip[] = [];
    if (selectedAgentFilter.value !== 'all') {
      chips.push({
        id: 'agent',
        label: formatFilterLabel(params.text, 'agent', activeAgentLabel.value),
      });
    }
    if (selectedSourceFilter.value !== 'all') {
      chips.push({
        id: 'source',
        label: formatFilterLabel(params.text, 'source', activeSourceLabel.value),
      });
    }
    return chips;
  });
  const hasActiveFilters = computed(() => activeFilterChips.value.length > 0);

  const folderTitleById = computed(() => new Map(
    params.orderedFolders.value.map((folder) => [folder.id, folder.title]),
  ));

  function resolveSessionFolderLabel(sessionKey: string): string | null {
    const folderId = params.organizerFolderForSession(sessionKey);
    if (!folderId) {
      return null;
    }
    return folderTitleById.value.get(folderId) || null;
  }

  function buildSearchableText(session: ChatSessionRow, observed: boolean): string {
    return [
      params.sessionTitle(session),
      params.agentNameFor(session),
      params.sessionPreview(session, observed),
      session.source.originLabel,
      session.source.surface,
      session.source.channel,
      resolveSessionFolderLabel(session.key),
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' ');
  }

  function matchesSessionFilter(session: ChatSessionRow, observed: boolean): boolean {
    if (selectedAgentFilter.value !== 'all' && session.agentId !== selectedAgentFilter.value) {
      return false;
    }
    if (selectedSourceFilter.value !== 'all' && session.source.source !== selectedSourceFilter.value) {
      return false;
    }
    if (!normalizedQuery.value) {
      return true;
    }
    return sessionMatchesListFilter({
      selectedAgentId: selectedAgentFilter.value,
      selectedSourceId: selectedSourceFilter.value,
      sessionAgentId: session.agentId,
      sessionSourceId: session.source.source,
      normalizedQuery: normalizedQuery.value,
      searchableText: buildSearchableText(session, observed),
    });
  }

  function matchesFolderFilter(folder: ChatSessionFolder): boolean {
    const folderSessions = params.collectFolderBranchSessions(folder.id);
    if (
      selectedAgentFilter.value !== 'all'
      && !folderSessions.some((session) => session.agentId === selectedAgentFilter.value)
    ) {
      return false;
    }
    if (
      selectedSourceFilter.value !== 'all'
      && !folderSessions.some((session) => session.source.source === selectedSourceFilter.value)
    ) {
      return false;
    }
    if (!normalizedQuery.value) {
      return true;
    }
    if (
      [folder.title, ...params.collectFolderBranchTitles(folder.id)]
        .some((title) => title.toLowerCase().includes(normalizedQuery.value))
    ) {
      return true;
    }
    return folderSessions.some((session) => matchesSessionFilter(session, false));
  }

  function matchesArchivedEntryFilter(entry: OrganizerEntry): boolean {
    const archivedSessions = params.archivedSessions.value;
    if (
      selectedAgentFilter.value !== 'all'
      && !archivedSessions.some((session) => session.agentId === selectedAgentFilter.value)
    ) {
      return false;
    }
    if (
      selectedSourceFilter.value !== 'all'
      && !archivedSessions.some((session) => session.source.source === selectedSourceFilter.value)
    ) {
      return false;
    }
    if (!normalizedQuery.value) {
      return true;
    }
    if (entry.title.toLowerCase().includes(normalizedQuery.value)) {
      return true;
    }
    return archivedSessions.some((session) => matchesSessionFilter(session, false));
  }

  const filteredFolders = computed(() => {
    if (params.listScope.value !== 'folders' || params.currentFolder.value || params.archiveViewOpen.value) {
      return [];
    }
    return params.orderedFolders.value.filter((folder) => matchesFolderFilter(folder));
  });
  const visibleFolderEntries = computed<OrganizerEntry[]>(() => {
    if (params.listScope.value !== 'folders' || params.currentFolder.value || params.archiveViewOpen.value) {
      return [];
    }
    const entries: OrganizerEntry[] = [...filteredFolders.value];
    if (params.archivedEntry.value && matchesArchivedEntryFilter(params.archivedEntry.value)) {
      entries.push(params.archivedEntry.value);
    }
    return entries;
  });

  const filteredActiveSessions = computed(() => params.baseActiveSessions.value
    .filter((session) => matchesSessionFilter(session, false)));
  const filteredArchivedSessions = computed(() => params.baseArchivedSessions.value
    .filter((session) => matchesSessionFilter(session, false)));
  const filteredObservedSessions = computed(() => params.baseObservedSessions.value
    .filter((session) => matchesSessionFilter(session, true)));

  function clearFilters(): void {
    selectedAgentFilter.value = 'all';
    selectedSourceFilter.value = 'all';
    filterPanelOpen.value = false;
  }

  function clearFilterChip(chipId: string): void {
    if (chipId === 'agent') {
      selectedAgentFilter.value = 'all';
      return;
    }
    if (chipId === 'source') {
      selectedSourceFilter.value = 'all';
    }
  }

  function setFilterPanelOpen(open: boolean): void {
    filterPanelOpen.value = open;
  }

  return {
    searchText,
    selectedAgentFilter,
    selectedSourceFilter,
    filterPanelOpen,
    normalizedQuery,
    searchActive,
    availableAgentOptions,
    availableSourceOptions,
    activeFilterChips,
    hasActiveFilters,
    filteredFolders,
    visibleFolderEntries,
    filteredActiveSessions,
    filteredArchivedSessions,
    filteredObservedSessions,
    matchesSessionFilter,
    matchesFolderFilter,
    setFilterPanelOpen,
    clearFilters,
    clearFilterChip,
  };
}
