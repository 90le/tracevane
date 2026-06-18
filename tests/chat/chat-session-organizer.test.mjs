import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArchivedOrganizerEntry,
  CHAT_BUILT_IN_ARCHIVED_FOLDER_ID,
  assignSessionsToFolderInOrganizer,
  createEmptyChatSessionOrganizerState,
  createFolderInOrganizer,
  deleteFolderFromOrganizer,
  deriveOrganizerChildFolders,
  deriveOrganizerRootSessions,
  deriveOrganizerFolderTree,
  deriveOrganizerFolderPath,
  isArchivedBuiltInFolderId,
  canMoveOrganizerEntryId,
  canRenameOrganizerEntryId,
  canUseOrganizerEntryAsParent,
  patchFolderInOrganizer,
  pruneOrganizerStateSessionKeys,
  removeSessionsFromOrganizer,
} from '../../dist/lib/chat-session-organizer.js';

test('create folder inserts it at the top of organizer order', () => {
  const base = createEmptyChatSessionOrganizerState();
  const first = createFolderInOrganizer(base, 'Alpha', null, '2026-03-23T10:00:00.000Z');
  const second = createFolderInOrganizer(first.organizer, 'Beta', null, '2026-03-23T10:01:00.000Z');

  assert.deepEqual(second.organizer.folderOrder, [second.folder.id, first.folder.id]);
  assert.equal(second.organizer.folders[0]?.id, second.folder.id);
  assert.equal(second.folder.collapsed, true);
});

test('folder sort move_up / move_down / move_top updates folderOrder', () => {
  const one = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'One', null, '2026-03-23T10:00:00.000Z');
  const two = createFolderInOrganizer(one.organizer, 'Two', null, '2026-03-23T10:01:00.000Z');
  const three = createFolderInOrganizer(two.organizer, 'Three', null, '2026-03-23T10:02:00.000Z');

  const movedDown = patchFolderInOrganizer(three.organizer, three.folder.id, { move: 'down' }, '2026-03-23T10:03:00.000Z');
  assert.deepEqual(movedDown.organizer.folderOrder, [two.folder.id, three.folder.id, one.folder.id]);

  const movedUp = patchFolderInOrganizer(movedDown.organizer, one.folder.id, { move: 'up' }, '2026-03-23T10:04:00.000Z');
  assert.deepEqual(movedUp.organizer.folderOrder, [two.folder.id, one.folder.id, three.folder.id]);

  const movedTop = patchFolderInOrganizer(movedUp.organizer, one.folder.id, { move: 'top' }, '2026-03-23T10:05:00.000Z');
  assert.deepEqual(movedTop.organizer.folderOrder, [one.folder.id, two.folder.id, three.folder.id]);
});

test('create child folder and sibling sort keeps parent-scoped order', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const childA = createFolderInOrganizer(root.organizer, 'Child A', root.folder.id, '2026-03-24T10:01:00.000Z');
  const childB = createFolderInOrganizer(childA.organizer, 'Child B', root.folder.id, '2026-03-24T10:02:00.000Z');

  assert.equal(childA.folder.parentId, root.folder.id);
  assert.equal(childB.folder.parentId, root.folder.id);
  assert.deepEqual(childB.organizer.childFolderOrder[root.folder.id], [childB.folder.id, childA.folder.id]);

  const movedDown = patchFolderInOrganizer(childB.organizer, childB.folder.id, { move: 'down' }, '2026-03-24T10:03:00.000Z');
  assert.deepEqual(movedDown.organizer.childFolderOrder[root.folder.id], [childA.folder.id, childB.folder.id]);

  const orderedChildren = deriveOrganizerChildFolders(movedDown.organizer, root.folder.id);
  assert.deepEqual(orderedChildren.map((folder) => folder.id), [childA.folder.id, childB.folder.id]);
});

test('assignSessionsToFolderInOrganizer supports child folders as valid targets', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const child = createFolderInOrganizer(root.organizer, 'Child', root.folder.id, '2026-03-24T10:01:00.000Z');

  const assigned = assignSessionsToFolderInOrganizer(child.organizer, ['s1'], child.folder.id);

  assert.equal(assigned.sessionFolderMap.s1, child.folder.id);
  assert.deepEqual(assigned.folderSessionOrder[child.folder.id], ['s1']);
});

test('deriveOrganizerRootSessions excludes sessions that belong to child folders', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const child = createFolderInOrganizer(root.organizer, 'Child', root.folder.id, '2026-03-24T10:01:00.000Z');
  const assigned = assignSessionsToFolderInOrganizer(child.organizer, ['nested'], child.folder.id);

  const rootSessions = deriveOrganizerRootSessions([
    {
      key: 'nested',
      agentId: 'main',
      sessionId: 'nested',
      kind: 'tracevane_managed',
      label: 'Nested',
      derivedTitle: null,
      lastMessagePreview: null,
      updatedAt: '2026-03-24T10:02:00.000Z',
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
    },
  ], assigned);

  assert.deepEqual(rootSessions, []);
});

test('assign sessions into and out of folders updates root and folder order', () => {
  const created = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Alpha', null, '2026-03-23T10:00:00.000Z');
  const assigned = assignSessionsToFolderInOrganizer(created.organizer, ['s1', 's2'], created.folder.id);
  assert.deepEqual(assigned.folderSessionOrder[created.folder.id], ['s1', 's2']);
  assert.equal(assigned.sessionFolderMap.s1, created.folder.id);
  assert.equal(assigned.sessionFolderMap.s2, created.folder.id);

  const removed = assignSessionsToFolderInOrganizer(assigned, ['s2'], null);
  assert.deepEqual(removed.rootSessionOrder, ['s2']);
  assert.deepEqual(removed.folderSessionOrder[created.folder.id], ['s1']);
  assert.equal(removed.sessionFolderMap.s2, null);
});

test('delete folder returns its sessions to root without deleting them', () => {
  const created = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Alpha', null, '2026-03-23T10:00:00.000Z');
  const assigned = assignSessionsToFolderInOrganizer(created.organizer, ['s1', 's2'], created.folder.id);
  const deleted = deleteFolderFromOrganizer(assigned, created.folder.id);

  assert.deepEqual(deleted.folderOrder, []);
  assert.deepEqual(deleted.rootSessionOrder, ['s1', 's2']);
  assert.equal(deleted.sessionFolderMap.s1, null);
  assert.equal(deleted.sessionFolderMap.s2, null);
});

test('deleteFolderFromOrganizer also removes child folders and returns their sessions to parent scope', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const child = createFolderInOrganizer(root.organizer, 'Child', root.folder.id, '2026-03-24T10:01:00.000Z');
  const assigned = assignSessionsToFolderInOrganizer(child.organizer, ['s1'], child.folder.id);

  const deleted = deleteFolderFromOrganizer(assigned, child.folder.id);

  assert.equal(deleted.folders.some((folder) => folder.id === child.folder.id), false);
  assert.equal(deleted.sessionFolderMap.s1, null);
  assert.deepEqual(deleted.rootSessionOrder, ['s1']);
});

test('removeSessionsFromOrganizer clears root and folder membership for deleted sessions', () => {
  const created = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Alpha', null, '2026-03-23T10:00:00.000Z');
  const assigned = assignSessionsToFolderInOrganizer(created.organizer, ['s1', 's2'], created.folder.id);
  const withRoot = assignSessionsToFolderInOrganizer(assigned, ['s3'], null);
  const removed = removeSessionsFromOrganizer(withRoot, ['s1', 's3']);

  assert.deepEqual(removed.folderSessionOrder[created.folder.id], ['s2']);
  assert.deepEqual(removed.rootSessionOrder, []);
  assert.equal(removed.sessionFolderMap.s1, undefined);
  assert.equal(removed.sessionFolderMap.s3, undefined);
});

test('built-in archived organizer entry is stable and summarizes archived sessions', () => {
  const entry = buildArchivedOrganizerEntry([
    {
      key: 'archived-1',
      agentId: 'main',
      sessionId: 'archived-1',
      kind: 'tracevane_managed',
      label: 'Archived 1',
      derivedTitle: null,
      lastMessagePreview: null,
      updatedAt: '2026-03-24T10:00:00.000Z',
      presentation: {
        archived: true,
        archivedAt: '2026-03-24T10:00:00.000Z',
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
    },
  ]);

  assert.equal(entry.id, CHAT_BUILT_IN_ARCHIVED_FOLDER_ID);
  assert.equal(entry.kind, 'archived');
  assert.equal(entry.sessionCount, 1);
  assert.equal(isArchivedBuiltInFolderId(entry.id), true);
});

test('system entry rules keep archived built-in entry out of rename, move, and parent targets', () => {
  assert.equal(canRenameOrganizerEntryId(CHAT_BUILT_IN_ARCHIVED_FOLDER_ID), false);
  assert.equal(canMoveOrganizerEntryId(CHAT_BUILT_IN_ARCHIVED_FOLDER_ID), false);
  assert.equal(canUseOrganizerEntryAsParent(CHAT_BUILT_IN_ARCHIVED_FOLDER_ID), false);
});

test('pruneOrganizerStateSessionKeys removes stale session ids from root and folder buckets', () => {
  const created = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Alpha', null, '2026-03-23T10:00:00.000Z');
  const assigned = assignSessionsToFolderInOrganizer(created.organizer, ['keep-folder', 'drop-folder'], created.folder.id);
  const withRoot = assignSessionsToFolderInOrganizer(assigned, ['keep-root', 'drop-root'], null);

  const pruned = pruneOrganizerStateSessionKeys(withRoot, ['keep-folder', 'keep-root']);

  assert.deepEqual(pruned.folderSessionOrder[created.folder.id], ['keep-folder']);
  assert.deepEqual(pruned.rootSessionOrder, ['keep-root']);
  assert.equal(pruned.sessionFolderMap['drop-folder'], undefined);
  assert.equal(pruned.sessionFolderMap['drop-root'], undefined);
});

test('deriveOrganizerFolderPath returns breadcrumb hierarchy from root to leaf', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const child = createFolderInOrganizer(root.organizer, 'Child', root.folder.id, '2026-03-24T10:01:00.000Z');
  const grandChild = createFolderInOrganizer(child.organizer, 'Grand Child', child.folder.id, '2026-03-24T10:02:00.000Z');

  const path = deriveOrganizerFolderPath(grandChild.organizer, grandChild.folder.id);
  assert.deepEqual(path.map((folder) => folder.title), ['Root', 'Child', 'Grand Child']);
});

test('deriveOrganizerFolderTree preserves nested folder hierarchy for menu and picker reuse', () => {
  const root = createFolderInOrganizer(createEmptyChatSessionOrganizerState(), 'Root', null, '2026-03-24T10:00:00.000Z');
  const sibling = createFolderInOrganizer(root.organizer, 'Sibling', null, '2026-03-24T10:01:00.000Z');
  const child = createFolderInOrganizer(sibling.organizer, 'Child', root.folder.id, '2026-03-24T10:02:00.000Z');
  const grandChild = createFolderInOrganizer(child.organizer, 'Grand Child', child.folder.id, '2026-03-24T10:03:00.000Z');

  const tree = deriveOrganizerFolderTree(grandChild.organizer);

  assert.deepEqual(tree.map((node) => node.title), ['Sibling', 'Root']);
  assert.deepEqual(tree[1], {
    id: root.folder.id,
    title: 'Root',
    parentId: null,
    children: [{
      id: child.folder.id,
      title: 'Child',
      parentId: root.folder.id,
      children: [{
        id: grandChild.folder.id,
        title: 'Grand Child',
        parentId: child.folder.id,
        children: [],
      }],
    }],
  });
});
