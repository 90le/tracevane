import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveSessionAgentOptions,
  deriveSessionSelectionState,
  normalizeSessionFilterQuery,
  pruneSelectedSessionKeys,
  sessionMatchesListFilter,
  toggleSelectAllVisibleSessionKeys,
  toggleSessionSelectionKeys,
} from '../../dist/lib/chat-session-list-state.js';

function createSession(key, agentId, overrides = {}) {
  return {
    key,
    agentId,
    sessionId: `${key}-id`,
    kind: 'tracevane_managed',
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
      source: 'tracevane',
      channel: 'webchat',
      surface: 'tracevane-chat',
      originLabel: 'Tracevane managed',
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

test('deriveSessionAgentOptions deduplicates and sorts visible agent labels', () => {
  const sessions = [
    createSession('beta-1', 'beta'),
    createSession('alpha-1', 'alpha'),
    createSession('beta-2', 'beta'),
  ];

  assert.deepEqual(
    deriveSessionAgentOptions(sessions, (session) => session.agentId.toUpperCase()),
    [
      { id: 'alpha', label: 'ALPHA' },
      { id: 'beta', label: 'BETA' },
    ],
  );
});

test('session filter helpers normalize search text and honor agent boundary', () => {
  const query = normalizeSessionFilterQuery('  Tracevane OPS  ');
  assert.equal(query, 'tracevane ops');
  assert.equal(sessionMatchesListFilter({
    selectedAgentId: 'alpha',
    sessionAgentId: 'beta',
    normalizedQuery: query,
    searchableText: 'Tracevane OPS',
  }), false);
  assert.equal(sessionMatchesListFilter({
    selectedAgentId: 'all',
    sessionAgentId: 'beta',
    normalizedQuery: query,
    searchableText: 'Tracevane OPS',
  }), true);
});

test('session filter helpers honor source boundaries before metadata search', () => {
  assert.equal(sessionMatchesListFilter({
    selectedAgentId: 'all',
    selectedSourceId: 'tracevane',
    sessionAgentId: 'alpha',
    sessionSourceId: 'external',
    normalizedQuery: '',
    searchableText: 'title agent preview source folder',
  }), false);
});

test('session filter helpers match metadata labels surfaced in searchable text', () => {
  assert.equal(sessionMatchesListFilter({
    selectedAgentId: 'all',
    selectedSourceId: 'all',
    sessionAgentId: 'alpha',
    sessionSourceId: 'external',
    normalizedQuery: 'external research folder',
    searchableText: 'Alpha team external research folder thread',
  }), true);
});

test('selection helpers toggle, prune, and select visible sessions deterministically', () => {
  assert.deepEqual(toggleSessionSelectionKeys(['a', 'b'], 'b'), ['a']);
  assert.deepEqual(toggleSessionSelectionKeys(['a'], 'c'), ['a', 'c']);
  assert.deepEqual(pruneSelectedSessionKeys(['a', 'ghost', 'b'], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(
    toggleSelectAllVisibleSessionKeys(['keep'], ['a', 'b'], false),
    ['keep', 'a', 'b'],
  );
  assert.deepEqual(
    toggleSelectAllVisibleSessionKeys(['keep', 'a', 'b'], ['a', 'b'], true),
    ['keep'],
  );
  assert.deepEqual(
    toggleSelectAllVisibleSessionKeys(['keep', 'a', 'tail'], ['a', 'a', 'b'], false),
    ['keep', 'a', 'tail', 'b'],
  );
  assert.deepEqual(
    toggleSelectAllVisibleSessionKeys(['keep', 'a', 'tail', 'b'], ['a', 'a', 'b'], true),
    ['keep', 'tail'],
  );
});

test('deriveSessionSelectionState tracks current view batch affordances', () => {
  const visibleSessions = [
    createSession('root-1', 'alpha'),
    createSession('root-2', 'beta', {
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
    createSession('root-3', 'alpha'),
  ];

  const selection = deriveSessionSelectionState({
    selectedKeys: ['root-1', 'root-3', 'ghost'],
    visibleSessions,
    organizerSessions: visibleSessions,
    organizer: {
      folders: [],
      folderOrder: [],
      rootSessionOrder: [],
      folderSessionOrder: {},
      sessionFolderMap: {
        'root-3': 'folder-a',
      },
    },
    canManageSession: (session) => session.permissions.writable,
  });

  assert.deepEqual(selection.manageableVisibleSessionKeys, ['root-1', 'root-3']);
  assert.deepEqual(selection.selectedManageableSessionKeys, ['root-1', 'root-3']);
  assert.equal(selection.allVisibleSessionsSelected, true);
  assert.equal(selection.selectedSessionsHaveFolderMembership, true);
});
