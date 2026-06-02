import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChatSessionDestinationItems,
  buildChatSessionDestinationItemsFromOrganizer,
  CHAT_SESSION_SEARCH_VISIBLE_LIMIT,
  CHAT_SESSION_VISIBLE_LIMITS,
  clampSessionContextMenuPosition,
  deriveSessionFilterChips,
  mergeSessionRowsForAgent,
  prioritizeAgentsForSessionLoad,
  resolveObservedSessionsForRail,
  resolveSessionSectionWindow,
  shouldRevealMoreSessionRowsOnScroll,
} from '../../dist/lib/chat-session-catalog.js';
import { createEmptyChatSessionOrganizerState, createFolderInOrganizer, deriveOrganizerFolderTree } from '../../dist/lib/chat-session-organizer.js';

function createAgent(id, overrides = {}) {
  return {
    id,
    name: id,
    model: 'gpt-5',
    workspace: '/tmp',
    agentDir: `/tmp/${id}`,
    enabled: true,
    isDefault: false,
    sessionCount: 0,
    totalTokens: 0,
    lastActiveAt: null,
    sandboxMode: 'workspace-write',
    workspaceAccess: 'full',
    toolsProfile: 'default',
    fsWorkspaceOnly: false,
    bindingCount: 0,
    docCount: 0,
    identity: {
      name: id,
      emoji: 'A',
      role: '',
      style: '',
      theme: '',
      avatar: '',
      mission: '',
    },
    runtime: {
      type: 'default',
      backend: 'openai',
      agent: id,
      mode: 'chat',
      cwd: '/tmp',
      label: id,
    },
    ...overrides,
  };
}

function createSession(key, agentId, updatedAt, overrides = {}) {
  return {
    key,
    agentId,
    sessionId: `${key}-id`,
    kind: 'studio_managed',
    label: key,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt,
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
    },
    source: {
      source: 'studio',
      channel: 'webchat',
      surface: 'studio-chat',
      originLabel: 'Studio managed',
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

test('prioritizeAgentsForSessionLoad prefers selected, recent, then default agent', () => {
  const agents = [
    createAgent('alpha'),
    createAgent('beta', { isDefault: true }),
    createAgent('gamma'),
    createAgent('delta'),
  ];

  const ordered = prioritizeAgentsForSessionLoad(agents, {
    selectedAgentId: 'gamma',
    recentAgentId: 'alpha',
  });

  assert.deepEqual(ordered.map((agent) => agent.id), ['gamma', 'alpha', 'beta', 'delta']);
});

test('session visible limits stay tightened to 20 for main and archive views', () => {
  assert.deepEqual(CHAT_SESSION_VISIBLE_LIMITS, {
    active: 20,
    archived: 20,
    observed: 20,
  });
  assert.equal(CHAT_SESSION_SEARCH_VISIBLE_LIMIT, 60);
});

test('mergeSessionRowsForAgent replaces one agent slice without losing others', () => {
  const currentRows = [
    createSession('alpha-old', 'alpha', '2026-03-23T10:00:00.000Z'),
    createSession('beta-keep', 'beta', '2026-03-23T09:00:00.000Z'),
  ];
  const nextRows = [
    createSession('alpha-new', 'alpha', '2026-03-23T11:00:00.000Z'),
    createSession('alpha-fresh', 'alpha', '2026-03-23T08:00:00.000Z'),
  ];

  const merged = mergeSessionRowsForAgent(currentRows, 'alpha', nextRows);

  assert.deepEqual(merged.map((row) => row.key), ['alpha-new', 'beta-keep', 'alpha-fresh']);
  assert.equal(merged.some((row) => row.key === 'alpha-old'), false);
  assert.equal(merged.some((row) => row.key === 'beta-keep'), true);
});

test('mergeSessionRowsForAgent can preserve explicitly protected missing rows during eventual consistency', () => {
  const currentRows = [
    createSession('alpha-pending', 'alpha', '2026-03-23T10:30:00.000Z'),
    createSession('beta-keep', 'beta', '2026-03-23T09:00:00.000Z'),
  ];
  const nextRows = [
    createSession('alpha-new', 'alpha', '2026-03-23T11:00:00.000Z'),
  ];

  const merged = mergeSessionRowsForAgent(currentRows, 'alpha', nextRows, {
    preserveMissingRows: [currentRows[0]],
  });

  assert.deepEqual(merged.map((row) => row.key), ['alpha-new', 'alpha-pending', 'beta-keep']);
});

test('mergeSessionRowsForAgent preserves fresher local active runtime over stale incoming rows', () => {
  const localActive = createSession('alpha-active', 'alpha', '2026-03-23T10:30:00.000Z', {
    runtime: {
      gatewayConnected: true,
      sessionWritable: true,
      activeRunId: 'run-active',
      state: 'running',
      lastEventAt: '2026-03-23T10:30:00.000Z',
      lastAckAt: '2026-03-23T10:30:00.000Z',
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  const staleIncoming = createSession('alpha-active', 'alpha', '2026-03-23T10:00:00.000Z');

  const merged = mergeSessionRowsForAgent([localActive], 'alpha', [staleIncoming]);

  assert.equal(merged[0]?.key, 'alpha-active');
  assert.equal(merged[0]?.runtime.activeRunId, 'run-active');
  assert.equal(merged[0]?.runtime.state, 'running');
});

test('resolveSessionSectionWindow enforces initial caps and keeps large searches windowed', () => {
  const rows = Array.from({ length: CHAT_SESSION_SEARCH_VISIBLE_LIMIT + 5 }, (_, index) =>
    createSession(`row-${index + 1}`, 'main', `2026-03-23T10:${String(index).padStart(2, '0')}:00.000Z`),
  );

  const limited = resolveSessionSectionWindow(rows, {
    visibleCount: CHAT_SESSION_VISIBLE_LIMITS.active,
    searchActive: false,
  });
  assert.equal(limited.rows.length, CHAT_SESSION_VISIBLE_LIMITS.active);
  assert.equal(limited.hiddenCount, rows.length - CHAT_SESSION_VISIBLE_LIMITS.active);

  const searched = resolveSessionSectionWindow(rows, {
    visibleCount: CHAT_SESSION_VISIBLE_LIMITS.active,
    searchActive: true,
  });
  assert.equal(searched.rows.length, CHAT_SESSION_SEARCH_VISIBLE_LIMIT);
  assert.equal(searched.hiddenCount, 5);
});

test('shouldRevealMoreSessionRowsOnScroll only triggers near the rail bottom', () => {
  assert.equal(shouldRevealMoreSessionRowsOnScroll({
    scrollTop: 900,
    scrollHeight: 1600,
    clientHeight: 400,
  }, 360), true);

  assert.equal(shouldRevealMoreSessionRowsOnScroll({
    scrollTop: 500,
    scrollHeight: 1600,
    clientHeight: 400,
  }, 360), false);
});

test('shouldRevealMoreSessionRowsOnScroll fills a rail that has hidden rows but no scrollbar yet', () => {
  assert.equal(shouldRevealMoreSessionRowsOnScroll({
    scrollTop: 0,
    scrollHeight: 300,
    clientHeight: 400,
  }, 360), true);

  assert.equal(shouldRevealMoreSessionRowsOnScroll({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 400,
  }, 360), false);
});

test('resolveObservedSessionsForRail only returns observed rows in inspect mode', () => {
  const observedRows = [
    createSession('observed-1', 'main', '2026-03-23T10:00:00.000Z', {
      kind: 'observed_external',
      permissions: {
        writable: false,
        canSend: false,
        canAbort: false,
        canReset: false,
        canDelete: false,
        canInject: false,
        visibleInFrontend: true,
        visibleInMvpRail: false,
      },
    }),
  ];

  assert.equal(resolveObservedSessionsForRail(observedRows, false).length, 0);
  assert.equal(resolveObservedSessionsForRail(observedRows, true).length, 1);
});

test('buildChatSessionDestinationItems keeps nested children for context menus and batch pickers', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const child = createFolderInOrganizer(root.organizer, 'Child', root.folder.id, '2026-03-24T10:01:00.000Z');
  const tree = deriveOrganizerFolderTree(child.organizer);

  const items = buildChatSessionDestinationItems(tree, {
    rootId: '__root__',
    rootLabel: 'Root rail',
    idPrefix: 'session:move:',
    disabledIds: [root.folder.id],
  });

  assert.deepEqual(items, [
    {
      id: 'session:move:__root__',
      label: 'Root rail',
      disabled: false,
    },
    {
      id: `session:move:${root.folder.id}`,
      label: 'Root',
      disabled: true,
      children: [{
        id: `session:move:${child.folder.id}`,
        label: 'Child',
        disabled: false,
      }],
    },
  ]);
});

test('buildChatSessionDestinationItemsFromOrganizer reuses organizer tree derive and exclusion rules', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const child = createFolderInOrganizer(root.organizer, 'Child', root.folder.id, '2026-03-24T10:01:00.000Z');

  const items = buildChatSessionDestinationItemsFromOrganizer(child.organizer, {
    rootId: '__root__',
    rootLabel: 'Root rail',
    excludeFolderIds: [root.folder.id],
  });

  assert.deepEqual(items, [
    {
      id: '__root__',
      label: 'Root rail',
      disabled: false,
    },
  ]);
});

test('deriveSessionFilterChips clears chip state when filters reset to all', () => {
  assert.deepEqual(deriveSessionFilterChips({
    selectedAgentId: 'main',
    agentChipLabel: 'Agent: Main',
  }), [{
    id: 'agent',
    label: 'Agent: Main',
  }]);

  assert.deepEqual(deriveSessionFilterChips({
    selectedAgentId: 'all',
    agentChipLabel: 'Agent: Main',
  }), []);
});

test('clampSessionContextMenuPosition keeps fixed menu inside viewport', () => {
  const clamped = clampSessionContextMenuPosition(
    { x: 980, y: 760 },
    { width: 1024, height: 768 },
  );

  assert.deepEqual(clamped, {
    x: 816,
    y: 592,
  });
});
