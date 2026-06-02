import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'tsx/esm';
import { computed, ref } from 'vue';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const sessionListPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SessionListPanel.vue'),
  'utf8',
);
const sessionListSharedCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/session-list-shared.css'),
  'utf8',
);
const sessionFilterBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SessionFilterBar.vue'),
  'utf8',
);

const sessionFilterCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/session-filter.css'),
  'utf8',
);

const sessionRowList = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SessionRowList.vue'),
  'utf8',
);
const sessionListComponentFiles = [
  'SessionListPanel.vue',
  'SessionPanelHeader.vue',
  'SessionFolderHeader.vue',
  'SessionFolderList.vue',
  'SessionRowList.vue',
  'SessionBatchBar.vue',
];
const sessionListComponentSources = new Map(sessionListComponentFiles.map((file) => [
  file,
  fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/features/chat', file), 'utf8'),
]));
const sessionListFilters = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/session-list-filters.ts'),
  'utf8',
);
const sessionListActions = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/session-list-actions.ts'),
  'utf8',
);
const sessionListViewModel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/session-list-view-model.ts'),
  'utf8',
);
const sessionListScopeTabs = fs.existsSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SessionListScopeTabs.vue'),
) ? fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SessionListScopeTabs.vue'),
  'utf8',
) : '';
const { deriveOrganizerChildFolders } = await import('../../dist/lib/chat-session-organizer.js');
const {
  useSessionListFilters,
} = await import('../../apps/web-vue/src/features/chat/session-list-filters.ts');
const {
  useSessionListViewModel,
  useSessionListWindows,
} = await import('../../apps/web-vue/src/features/chat/session-list-view-model.ts');
const {
  useSessionListSelection,
} = await import('../../apps/web-vue/src/features/chat/session-list-selection.ts');

function createSession(key, agentId, source, overrides = {}) {
  return {
    key,
    agentId,
    sessionId: `${key}-id`,
    kind: 'studio_managed',
    label: key,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: '2026-03-24T10:00:00.000Z',
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
    },
    source: {
      source,
      channel: 'webchat',
      surface: 'studio-chat',
      originLabel: `${source} origin`,
    },
    deliveryContext: {
      channel: 'webchat',
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: {
      writable: true,
      canSend: true,
      canAbort: true,
      canReset: true,
      canDelete: true,
      canInject: false,
      visibleInFrontend: true,
      visibleInMvpRail: true,
    },
    runtime: {
      gatewayConnected: true,
      sessionWritable: true,
      activeRunId: null,
      state: 'idle',
      lastEventAt: null,
      lastAckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    ...overrides,
  };
}

function createOrganizerState() {
  return {
    folders: [
      {
        id: 'folder-root',
        title: 'Root',
        parentId: null,
        createdAt: '2026-03-24T10:00:00.000Z',
        updatedAt: '2026-03-24T10:00:00.000Z',
        collapsed: true,
      },
      {
        id: 'folder-child',
        title: 'Child',
        parentId: 'folder-root',
        createdAt: '2026-03-24T10:00:00.000Z',
        updatedAt: '2026-03-24T10:00:00.000Z',
        collapsed: true,
      },
    ],
    folderOrder: ['folder-root'],
    childFolderOrder: {
      'folder-root': ['folder-child'],
    },
    rootSessionOrder: ['root-session'],
    folderSessionOrder: {
      'folder-root': ['root-session'],
      'folder-child': ['child-session'],
    },
    sessionFolderMap: {
      'root-session': 'folder-root',
      'child-session': 'folder-child',
      'archived-session': null,
      'observed-session': null,
    },
  };
}

function makeText(chinese, english) {
  return english || chinese;
}

test('session list exposes all folders archived scope tabs and metadata search', () => {
  assert.match(sessionListPanel, /<SessionListScopeTabs/);
  assert.match(sessionFilterBar, /Search title, agent, preview, source/);
  assert.match(sessionFilterBar, /Agent \+ Source/);
  assert.match(sessionListScopeTabs, /全部/);
  assert.match(sessionListScopeTabs, /文件夹/);
  assert.match(sessionListScopeTabs, /归档/);
  assert.match(sessionListPanel, /@open-create-folder="openCreateFolderFromHeader"/);
  assert.match(sessionListPanel, /async function openCreateFolderFromHeader\(\): Promise<void> \{[\s\S]*viewModel\.setListScope\('folders'\);[\s\S]*await nextTick\(\);[\s\S]*actions\.emitCreateFolder\(\);/);
  assert.match(sessionListPanel, /@new-chat="openNewChatFromHeader"/);
  assert.match(sessionListPanel, /function openNewChatFromHeader\(\): void \{[\s\S]*viewModel\.archiveViewOpen\.value[\s\S]*viewModel\.setListScope\('all'\);[\s\S]*emit\('new-chat'\);/);
  assert.match(sessionListPanel, /const sessionDisplayMetaCache = new Map/);
  assert.match(sessionListPanel, /const SESSION_DISPLAY_META_CACHE_LIMIT = 240;/);
  assert.match(sessionListPanel, /function buildSessionDisplayMetaSignature/);
  assert.doesNotMatch(sessionListPanel, /const sessionDisplayMetaByKey = computed/);
  assert.doesNotMatch(sessionListPanel, /const displaySessions = computed/);
  assert.match(sessionListPanel, /function agentNameFor\(session: ChatSessionRow\): string \{\n\s+return sessionDisplayMeta\(session\)\.agentName;/);
  assert.match(sessionRowList, /const props = defineProps<\{/);
  assert.match(sessionRowList, /v-memo="sessionRowMemoKey\(session\)"/);
  assert.match(sessionRowList, /v-memo="sessionRowMemoKey\(session, true\)"/);
  assert.match(sessionRowList, /function sessionRowMemoKey\(session: ChatSessionRow, observed = false\): unknown\[] \{/);
  assert.match(sessionRowList, /locale\.value/);
  assert.match(sessionRowList, /props\.agentNameFor\(session\)/);
  assert.match(sessionRowList, /props\.agentAvatarFor\(session\)/);
  assert.match(sessionRowList, /props\.isSessionSelected\(session\.key\)/);
  assert.match(sessionListPanel, /selectionMode: selection\.selectionMode,/);
  assert.match(sessionListActions, /selectionMode: ReadonlyRef<boolean>;/);
  assert.match(sessionListActions, /if \(!params\.selectionMode\.value\) \{\n\s+return \[\];\n\s+\}/);
  assert.match(sessionListActions, /watch\(\(\) => params\.selectionMode\.value, \(active\) => \{[\s\S]*if \(!active\) \{[\s\S]*closeFolderPicker\(\);/);
});

test('session list components keep styling in the shared feature stylesheet', () => {
  for (const [file, source] of sessionListComponentSources) {
    assert.match(source, /import '\.\/session-list-shared\.css';/, `${file} imports session-list-shared.css`);
    assert.doesNotMatch(source, /<style scoped>/, `${file} does not keep local scoped CSS`);
  }

  assert.match(sessionListSharedCss, /\.chat-shell-session-list\s*\{/);
  assert.match(sessionListSharedCss, /\.chat-shell-session-list__header\s*\{/);
  assert.match(sessionListSharedCss, /\.chat-shell-session-subheader\s*\{/);
  assert.match(sessionListSharedCss, /\.chat-shell-folder-row\s*\{/);
  assert.match(sessionListSharedCss, /\.chat-shell-session-row\s*\{/);
  assert.match(sessionListSharedCss, /\.chat-shell-session-batchbar\s*\{/);
  assert.doesNotMatch(sessionListSharedCss, /:deep|:global/);
  assert.match(sessionFilterBar, /import '\.\/session-filter\.css';/);
  assert.doesNotMatch(sessionFilterBar, /<style(?:\s|>)/);
  assert.match(sessionFilterCss, /\.chat-shell-session-filter-layer\s*\{/);
  assert.doesNotMatch(sessionFilterCss, /:deep|:global/);
});

test('folder scope keeps agent/source filter options from descendant sessions and archived mode stays isolated', () => {
  const organizer = ref(createOrganizerState());
  const activeSessions = ref([
    createSession('root-session', 'alpha', 'studio'),
    createSession('child-session', 'beta', 'external'),
    createSession('loose-root-session', 'gamma', 'studio'),
  ]);
  const archivedSessions = ref([
    createSession('archived-session', 'delta', 'system', {
      presentation: {
        archived: true,
        archivedAt: '2026-03-24T11:00:00.000Z',
        customLabel: null,
      },
    }),
  ]);
  const observedSessions = ref([
    createSession('observed-session', 'omega', 'studio', {
      kind: 'observed_external',
      permissions: {
        writable: false,
        canSend: false,
        canAbort: false,
        canReset: false,
        canDelete: false,
        canInject: false,
        visibleInFrontend: true,
        visibleInMvpRail: true,
      },
    }),
  ]);

  const viewModel = useSessionListViewModel({
    organizer,
    activeSessions,
    archivedSessions,
    observedSessions,
    text: makeText,
  });

  const filters = useSessionListFilters({
    baseActiveSessions: viewModel.baseActiveSessions,
    baseArchivedSessions: viewModel.baseArchivedSessions,
    archivedSessions,
    baseObservedSessions: viewModel.baseObservedSessions,
    orderedFolders: viewModel.orderedFolders,
    archivedEntry: viewModel.archivedEntry,
    currentFolder: viewModel.currentFolder,
    listScope: viewModel.listScope,
    archiveViewOpen: viewModel.archiveViewOpen,
    text: makeText,
    agentNameFor: (session) => session.agentId.toUpperCase(),
    sessionTitle: (session) => session.label,
    sessionPreview: (session) => session.lastMessagePreview || '',
    organizerFolderForSession: viewModel.organizerFolderForSession,
    collectFolderBranchSessions: viewModel.collectFolderBranchSessions,
    collectFolderBranchTitles: viewModel.collectFolderBranchTitles,
  });

  const visibleChildFolders = computed(() => (
    viewModel.currentFolder.value
      ? deriveOrganizerChildFolders(viewModel.prunedOrganizer.value, viewModel.currentFolder.value.id)
        .filter((folder) => filters.matchesFolderFilter(folder))
      : []
  ));

  const windows = useSessionListWindows({
    filteredActiveSessions: filters.filteredActiveSessions,
    filteredArchivedSessions: filters.filteredArchivedSessions,
    filteredObservedSessions: filters.filteredObservedSessions,
    visibleFolderEntries: filters.visibleFolderEntries,
    visibleChildFolders,
    currentFolder: viewModel.currentFolder,
    archiveViewOpen: viewModel.archiveViewOpen,
    showObserved: ref(false),
    searchActive: filters.searchActive,
    loading: ref(false),
    text: makeText,
  });

  assert.deepEqual(viewModel.baseActiveSessions.value.map((session) => session.key), ['loose-root-session']);

  viewModel.setListScope('folders');
  assert.deepEqual(viewModel.baseActiveSessions.value.map((session) => session.key), ['loose-root-session']);
  assert.deepEqual(filters.availableAgentOptions.value.map((option) => option.id), ['alpha', 'beta', 'delta', 'gamma']);
  assert.deepEqual(filters.availableSourceOptions.value.map((option) => option.id), ['external', 'studio', 'system']);
  assert.deepEqual(filters.visibleFolderEntries.value.map((entry) => entry.id), ['folder-root', 'folder-child', 'built-in:archived']);
  assert.equal(windows.hasVisibleContent.value, true);
  assert.equal(windows.currentViewSummary.value, '');

  viewModel.enterFolder('folder-root');
  assert.equal(viewModel.archiveViewOpen.value, false);
  assert.equal(viewModel.currentFolder.value?.id, 'folder-root');
  assert.deepEqual([...new Set(filters.availableAgentOptions.value.map((option) => option.id))], ['alpha', 'beta']);
  assert.deepEqual([...new Set(filters.availableSourceOptions.value.map((option) => option.id))], ['external', 'studio']);
  assert.deepEqual(filters.filteredActiveSessions.value.map((session) => session.key), ['root-session']);
  assert.match(windows.currentViewSummary.value, /1 subfolders/);
  assert.match(windows.currentViewSummary.value, /1 chats/);

  viewModel.setListScope('archived');
  assert.equal(viewModel.archiveViewOpen.value, true);
  assert.equal(viewModel.currentFolder.value, null);
  assert.deepEqual(filters.availableAgentOptions.value.map((option) => option.id), ['delta']);
  assert.deepEqual(filters.availableSourceOptions.value.map((option) => option.id), ['system']);
  assert.deepEqual(windows.visibleArchivedSessions.value.map((session) => session.key), ['archived-session']);
  assert.match(windows.currentViewSummary.value, /1 archived chats/);
});

test('session filtering avoids full searchable text construction until a query is present', () => {
  const activeSessions = ref([
    createSession('plain-session', 'alpha', 'studio'),
  ]);
  let titleCalls = 0;
  let previewCalls = 0;

  const filters = useSessionListFilters({
    baseActiveSessions: activeSessions,
    baseArchivedSessions: ref([]),
    archivedSessions: ref([]),
    baseObservedSessions: ref([]),
    orderedFolders: ref([]),
    archivedEntry: ref(null),
    currentFolder: ref(null),
    listScope: ref('all'),
    archiveViewOpen: ref(false),
    text: makeText,
    agentNameFor: (session) => session.agentId,
    sessionTitle: () => {
      titleCalls += 1;
      return 'Needle title';
    },
    sessionPreview: () => {
      previewCalls += 1;
      return 'Needle preview';
    },
    organizerFolderForSession: () => null,
    collectFolderBranchSessions: () => [],
    collectFolderBranchTitles: () => [],
  });

  assert.equal(filters.filteredActiveSessions.value.length, 1);
  assert.equal(titleCalls, 0);
  assert.equal(previewCalls, 0);

  filters.searchText.value = 'needle';
  assert.equal(filters.filteredActiveSessions.value.length, 1);
  assert.equal(titleCalls > 0, true);
  assert.equal(previewCalls > 0, true);
});

test('session selection summary stays cold until selection mode opens', () => {
  const visibleSessions = ref([
    createSession('selection-a', 'alpha', 'studio'),
    createSession('selection-b', 'beta', 'studio'),
  ]);
  let canManageCalls = 0;
  const selection = useSessionListSelection({
    visibleActiveSessions: visibleSessions,
    visibleArchivedSessions: ref([]),
    allOrganizerSessions: visibleSessions,
    organizer: ref({
      folders: [],
      folderOrder: [],
      rootSessionOrder: [],
      folderSessionOrder: {},
      sessionFolderMap: {},
    }),
    canManageSession: (session) => {
      canManageCalls += 1;
      return session.permissions.writable;
    },
  });

  assert.deepEqual(selection.manageableVisibleSessionKeys.value, []);
  assert.deepEqual(selection.selectedManageableSessionKeys.value, []);
  assert.equal(selection.allVisibleSessionsSelected.value, false);
  assert.equal(canManageCalls, 0);

  selection.setSelectionMode(true);
  assert.deepEqual(selection.manageableVisibleSessionKeys.value, ['selection-a', 'selection-b']);
  assert.equal(canManageCalls, 2);
});
