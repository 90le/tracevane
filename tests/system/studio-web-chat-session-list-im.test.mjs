import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'tsx/esm';
import { computed, ref } from 'vue';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const sessionListPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionListPanel.vue'),
  'utf8',
);
const sessionFilterBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionFilterBar.vue'),
  'utf8',
);
const sessionRowList = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionRowList.vue'),
  'utf8',
);
const sessionListFilters = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/session-list-filters.ts'),
  'utf8',
);
const sessionListViewModel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/session-list-view-model.ts'),
  'utf8',
);
const sessionListScopeTabs = fs.existsSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionListScopeTabs.vue'),
) ? fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionListScopeTabs.vue'),
  'utf8',
) : '';
const { deriveOrganizerChildFolders } = await import('../../dist/lib/chat-session-organizer.js');
const {
  useSessionListFilters,
} = await import('../../apps/web-vue/src/features/chat-v2/session-list-filters.ts');
const {
  useSessionListViewModel,
  useSessionListWindows,
} = await import('../../apps/web-vue/src/features/chat-v2/session-list-view-model.ts');

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
});

test('folder scope keeps agent/source filter options from descendant sessions and archived mode stays isolated', () => {
  const organizer = ref(createOrganizerState());
  const activeSessions = ref([
    createSession('root-session', 'alpha', 'studio'),
    createSession('child-session', 'beta', 'external'),
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
    baseObservedSessions: viewModel.baseObservedSessions,
    orderedFolders: viewModel.orderedFolders,
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
    searchActive: filters.searchActive,
    loading: ref(false),
    text: makeText,
  });

  assert.equal(viewModel.baseActiveSessions.value.length, 0);

  viewModel.setListScope('folders');
  assert.deepEqual(filters.availableAgentOptions.value.map((option) => option.id), ['alpha', 'beta']);
  assert.deepEqual(filters.availableSourceOptions.value.map((option) => option.id), ['external', 'studio']);
  assert.deepEqual(filters.visibleFolderEntries.value.map((entry) => entry.id), ['folder-root', 'folder-child']);
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
