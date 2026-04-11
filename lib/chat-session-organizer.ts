import type {
  ChatSessionFolder,
  ChatSessionFolderMove,
  ChatSessionOrganizerState,
  ChatSessionRow,
} from '../types/chat.js';

export const CHAT_BUILT_IN_ARCHIVED_FOLDER_ID = 'built-in:archived';

export interface ChatBuiltInOrganizerEntry {
  id: string;
  kind: 'archived';
  title: string;
  system: true;
  updatedAt: string | null;
  sessionCount: number;
}

export interface ChatSessionFolderTreeNode {
  id: string;
  title: string;
  parentId: string | null;
  children: ChatSessionFolderTreeNode[];
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function normalizeDate(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return fallback;
}

function generateFolderId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return `folder-${randomUuid}`;
  }
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortSessionsByUpdatedAt(left: ChatSessionRow, right: ChatSessionRow): number {
  const leftTs = Date.parse(left.updatedAt || '') || 0;
  const rightTs = Date.parse(right.updatedAt || '') || 0;
  return rightTs - leftTs;
}

function moveIdInList(order: string[], id: string, move: ChatSessionFolderMove): string[] {
  const currentIndex = order.indexOf(id);
  if (currentIndex === -1) {
    return order;
  }
  const next = order.slice();
  if (move === 'top') {
    next.splice(currentIndex, 1);
    next.unshift(id);
    return next;
  }
  if (move === 'up' && currentIndex > 0) {
    [next[currentIndex - 1], next[currentIndex]] = [next[currentIndex], next[currentIndex - 1]];
  }
  if (move === 'down' && currentIndex < next.length - 1) {
    [next[currentIndex], next[currentIndex + 1]] = [next[currentIndex + 1], next[currentIndex]];
  }
  return next;
}

function orderSessionsWithManualOrder(sessions: ChatSessionRow[], order: string[]): ChatSessionRow[] {
  const indexMap = new Map(order.map((key, index) => [key, index]));
  return sessions
    .slice()
    .sort((left, right) => {
      const leftIndex = indexMap.get(left.key);
      const rightIndex = indexMap.get(right.key);
      if (leftIndex != null && rightIndex != null) {
        return leftIndex - rightIndex;
      }
      if (leftIndex != null) {
        return -1;
      }
      if (rightIndex != null) {
        return 1;
      }
      return sortSessionsByUpdatedAt(left, right);
    });
}

export function createEmptyChatSessionOrganizerState(): ChatSessionOrganizerState {
  return {
    folders: [],
    folderOrder: [],
    childFolderOrder: {},
    rootSessionOrder: [],
    folderSessionOrder: {},
    sessionFolderMap: {},
  };
}

export function normalizeChatSessionOrganizerState(input: unknown): ChatSessionOrganizerState {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const fallbackNow = new Date().toISOString();

  const normalizedFolders = Array.isArray(raw.folders)
    ? raw.folders
      .filter((folder): folder is Record<string, unknown> => Boolean(folder) && typeof folder === 'object')
      .map((folder) => {
        const id = normalizeString(folder.id);
        const title = normalizeString(folder.title);
        if (!id || !title) {
          return null;
        }
        const createdAt = normalizeDate(folder.createdAt, fallbackNow);
        const updatedAt = normalizeDate(folder.updatedAt, createdAt);
        return {
          id,
          title,
          parentId: normalizeString(folder.parentId) || null,
          createdAt,
          updatedAt,
          collapsed: folder.collapsed !== false,
        } satisfies ChatSessionFolder;
      })
      .filter((folder): folder is ChatSessionFolder => Boolean(folder))
    : [];

  const folders = normalizedFolders.filter((folder, index, all) => all.findIndex((item) => item.id === folder.id) === index);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const parentByFolderId = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const folderOrder = uniqueStrings(Array.isArray(raw.folderOrder) ? raw.folderOrder.map(String) : [])
    .filter((folderId) => folderIds.has(folderId) && !parentByFolderId.get(folderId));
  for (const folder of folders) {
    if (!folder.parentId && !folderOrder.includes(folder.id)) {
      folderOrder.push(folder.id);
    }
  }

  const childFolderOrder: Record<string, string[]> = {};
  if (raw.childFolderOrder && typeof raw.childFolderOrder === 'object') {
    for (const [parentId, value] of Object.entries(raw.childFolderOrder as Record<string, unknown>)) {
      if (!folderIds.has(parentId)) {
        continue;
      }
      childFolderOrder[parentId] = uniqueStrings(Array.isArray(value) ? value.map(String) : [])
        .filter((folderId) => folderIds.has(folderId) && parentByFolderId.get(folderId) === parentId);
    }
  }
  for (const folder of folders) {
    if (!folder.parentId) {
      continue;
    }
    const current = childFolderOrder[folder.parentId] || [];
    if (!current.includes(folder.id)) {
      childFolderOrder[folder.parentId] = [...current, folder.id];
    }
  }

  const folderSessionOrder: Record<string, string[]> = {};
  if (raw.folderSessionOrder && typeof raw.folderSessionOrder === 'object') {
    for (const [folderId, value] of Object.entries(raw.folderSessionOrder as Record<string, unknown>)) {
      if (!folderIds.has(folderId)) {
        continue;
      }
      folderSessionOrder[folderId] = uniqueStrings(Array.isArray(value) ? value.map(String) : []);
    }
  }

  const sessionFolderMap: Record<string, string | null> = {};
  if (raw.sessionFolderMap && typeof raw.sessionFolderMap === 'object') {
    for (const [sessionKey, folderIdValue] of Object.entries(raw.sessionFolderMap as Record<string, unknown>)) {
      const sessionKeyNormalized = normalizeString(sessionKey);
      if (!sessionKeyNormalized) {
        continue;
      }
      const folderId = normalizeString(folderIdValue);
      sessionFolderMap[sessionKeyNormalized] = folderId && folderIds.has(folderId) ? folderId : null;
    }
  }

  return {
    folders,
    folderOrder,
    childFolderOrder,
    rootSessionOrder: uniqueStrings(Array.isArray(raw.rootSessionOrder) ? raw.rootSessionOrder.map(String) : []),
    folderSessionOrder,
    sessionFolderMap,
  };
}

export function orderOrganizerFolders(organizer: ChatSessionOrganizerState): ChatSessionFolder[] {
  const indexMap = new Map(organizer.folderOrder.map((folderId, index) => [folderId, index]));
  return organizer.folders
    .slice()
    .sort((left, right) => {
      const leftIndex = indexMap.get(left.id);
      const rightIndex = indexMap.get(right.id);
      if (leftIndex != null && rightIndex != null) {
        return leftIndex - rightIndex;
      }
      if (leftIndex != null) {
        return -1;
      }
      if (rightIndex != null) {
        return 1;
      }
      return (right.updatedAt || '').localeCompare(left.updatedAt || '');
    });
}

export function createChatSessionFolder(title: string, now = new Date().toISOString()): ChatSessionFolder {
  return {
    id: generateFolderId(),
    title: normalizeString(title) || 'Untitled folder',
    parentId: null,
    createdAt: now,
    updatedAt: now,
    collapsed: true,
  };
}

export function createFolderInOrganizer(
  organizer: ChatSessionOrganizerState,
  title: string,
  parentId: string | null = null,
  now = new Date().toISOString(),
): {
  organizer: ChatSessionOrganizerState;
  folder: ChatSessionFolder;
} {
  const current = normalizeChatSessionOrganizerState(organizer);
  const folder = {
    ...createChatSessionFolder(title, now),
    parentId: parentId || null,
  };
  const nextFolderOrder = folder.parentId
    ? current.folderOrder
    : uniqueStrings([folder.id, ...current.folderOrder]);
  const nextChildFolderOrder = { ...current.childFolderOrder };
  if (folder.parentId) {
    nextChildFolderOrder[folder.parentId] = uniqueStrings([folder.id, ...(nextChildFolderOrder[folder.parentId] || [])]);
  }
  return {
    folder,
    organizer: {
      ...current,
      folders: [folder, ...current.folders],
      folderOrder: nextFolderOrder,
      childFolderOrder: nextChildFolderOrder,
      folderSessionOrder: {
        ...current.folderSessionOrder,
        [folder.id]: [],
      },
    },
  };
}

export function patchFolderInOrganizer(
  organizer: ChatSessionOrganizerState,
  folderId: string,
  patch: {
    title?: string | null;
    collapsed?: boolean;
    move?: ChatSessionFolderMove;
  },
  now = new Date().toISOString(),
): {
  organizer: ChatSessionOrganizerState;
  folder: ChatSessionFolder | null;
} {
  const current = normalizeChatSessionOrganizerState(organizer);
  const folderIndex = current.folders.findIndex((folder) => folder.id === folderId);
  if (folderIndex === -1) {
    return { organizer: current, folder: null };
  }
  const currentFolder = current.folders[folderIndex]!;
  const nextFolder: ChatSessionFolder = {
    ...currentFolder,
    title: patch.title == null ? currentFolder.title : normalizeString(patch.title) || currentFolder.title,
    collapsed: typeof patch.collapsed === 'boolean' ? patch.collapsed : currentFolder.collapsed,
    updatedAt: now,
  };
  const folders = current.folders.slice();
  folders[folderIndex] = nextFolder;
  const nextFolderOrder = patch.move
    ? (!currentFolder.parentId
      ? moveIdInList(current.folderOrder, folderId, patch.move)
      : current.folderOrder)
    : current.folderOrder;
  const nextChildFolderOrder = { ...current.childFolderOrder };
  if (patch.move && currentFolder.parentId) {
    nextChildFolderOrder[currentFolder.parentId] = moveIdInList(nextChildFolderOrder[currentFolder.parentId] || [], folderId, patch.move);
  }
  return {
    folder: nextFolder,
    organizer: {
      ...current,
      folders,
      folderOrder: nextFolderOrder,
      childFolderOrder: nextChildFolderOrder,
    },
  };
}

export function assignSessionsToFolderInOrganizer(
  organizer: ChatSessionOrganizerState,
  sessionKeys: string[],
  folderId: string | null,
): ChatSessionOrganizerState {
  const current = normalizeChatSessionOrganizerState(organizer);
  const folderIds = new Set(current.folders.map((folder) => folder.id));
  const keys = uniqueStrings(sessionKeys);
  if (!keys.length) {
    return current;
  }

  const nextRootOrder = current.rootSessionOrder.filter((key) => !keys.includes(key));
  const nextFolderSessionOrder: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(current.folderSessionOrder)) {
    nextFolderSessionOrder[key] = value.filter((sessionKey) => !keys.includes(sessionKey));
  }

  if (folderId && folderIds.has(folderId)) {
    nextFolderSessionOrder[folderId] = uniqueStrings([...keys, ...(nextFolderSessionOrder[folderId] || [])]);
  }

  const nextSessionFolderMap = { ...current.sessionFolderMap };
  for (const sessionKey of keys) {
    nextSessionFolderMap[sessionKey] = folderId && folderIds.has(folderId) ? folderId : null;
  }

  return {
    ...current,
    rootSessionOrder: folderId ? nextRootOrder : uniqueStrings([...keys, ...nextRootOrder]),
    folderSessionOrder: nextFolderSessionOrder,
    sessionFolderMap: nextSessionFolderMap,
  };
}

export function deleteFolderFromOrganizer(
  organizer: ChatSessionOrganizerState,
  folderId: string,
): ChatSessionOrganizerState {
  const current = normalizeChatSessionOrganizerState(organizer);
  const folderIds = new Set(current.folders.map((folder) => folder.id));
  if (!folderIds.has(folderId)) {
    return current;
  }
  const movedSessionKeys = uniqueStrings([
    ...(current.folderSessionOrder[folderId] || []),
    ...Object.entries(current.sessionFolderMap)
      .filter(([, mappedFolderId]) => mappedFolderId === folderId)
      .map(([sessionKey]) => sessionKey),
  ]);

  const nextSessionFolderMap = { ...current.sessionFolderMap };
  for (const sessionKey of movedSessionKeys) {
    nextSessionFolderMap[sessionKey] = null;
  }

  const nextFolderSessionOrder = { ...current.folderSessionOrder };
  delete nextFolderSessionOrder[folderId];
  const deletedFolder = current.folders.find((folder) => folder.id === folderId) || null;
  const nextChildFolderOrder = { ...current.childFolderOrder };
  const childIds = nextChildFolderOrder[folderId] || [];
  delete nextChildFolderOrder[folderId];
  const reparentTarget = deletedFolder?.parentId || null;
  if (childIds.length) {
    const parentBucket = reparentTarget ? (nextChildFolderOrder[reparentTarget] || []) : current.folderOrder.filter((id) => id !== folderId);
    const reparented = uniqueStrings([...childIds, ...parentBucket]);
    if (reparentTarget) {
      nextChildFolderOrder[reparentTarget] = reparented;
    }
  }
  const nextFolders = current.folders
    .filter((folder) => folder.id !== folderId)
    .map((folder) => folder.parentId === folderId ? { ...folder, parentId: reparentTarget } : folder);

  return {
    ...current,
    folders: nextFolders,
    folderOrder: reparentTarget
      ? current.folderOrder.filter((id) => id !== folderId)
      : uniqueStrings([
        ...childIds,
        ...current.folderOrder.filter((id) => id !== folderId && !childIds.includes(id)),
      ]),
    childFolderOrder: nextChildFolderOrder,
    folderSessionOrder: nextFolderSessionOrder,
    rootSessionOrder: uniqueStrings([...movedSessionKeys, ...current.rootSessionOrder]),
    sessionFolderMap: nextSessionFolderMap,
  };
}

export function removeSessionsFromOrganizer(
  organizer: ChatSessionOrganizerState,
  sessionKeys: string[],
): ChatSessionOrganizerState {
  const current = normalizeChatSessionOrganizerState(organizer);
  const keys = uniqueStrings(sessionKeys);
  if (!keys.length) {
    return current;
  }

  const nextSessionFolderMap = { ...current.sessionFolderMap };
  for (const key of keys) {
    delete nextSessionFolderMap[key];
  }

  const nextFolderSessionOrder: Record<string, string[]> = {};
  for (const [folderId, order] of Object.entries(current.folderSessionOrder)) {
    nextFolderSessionOrder[folderId] = order.filter((sessionKey) => !keys.includes(sessionKey));
  }

  return {
    ...current,
    rootSessionOrder: current.rootSessionOrder.filter((sessionKey) => !keys.includes(sessionKey)),
    folderSessionOrder: nextFolderSessionOrder,
    sessionFolderMap: nextSessionFolderMap,
  };
}

export function deriveOrganizerRootSessions(
  sessions: ChatSessionRow[],
  organizer: ChatSessionOrganizerState,
): ChatSessionRow[] {
  const current = normalizeChatSessionOrganizerState(organizer);
  const folderIds = new Set(current.folders.map((folder) => folder.id));
  const rootSessions = sessions.filter((session) => {
    const mappedFolderId = current.sessionFolderMap[session.key];
    return !mappedFolderId || !folderIds.has(mappedFolderId);
  });
  return orderSessionsWithManualOrder(rootSessions, current.rootSessionOrder);
}

export function deriveOrganizerChildFolders(
  organizer: ChatSessionOrganizerState,
  parentId: string | null,
): ChatSessionFolder[] {
  const current = normalizeChatSessionOrganizerState(organizer);
  const targetIds = parentId
    ? current.childFolderOrder[parentId] || []
    : current.folderOrder;
  const indexMap = new Map(targetIds.map((folderId, index) => [folderId, index]));
  return current.folders
    .filter((folder) => (folder.parentId || null) === (parentId || null))
    .sort((left, right) => {
      const leftIndex = indexMap.get(left.id);
      const rightIndex = indexMap.get(right.id);
      if (leftIndex != null && rightIndex != null) {
        return leftIndex - rightIndex;
      }
      if (leftIndex != null) {
        return -1;
      }
      if (rightIndex != null) {
        return 1;
      }
      return (right.updatedAt || '').localeCompare(left.updatedAt || '');
    });
}

export function deriveOrganizerFolderTree(
  organizer: ChatSessionOrganizerState,
  parentId: string | null = null,
): ChatSessionFolderTreeNode[] {
  return deriveOrganizerChildFolders(organizer, parentId).map((folder) => ({
    id: folder.id,
    title: folder.title,
    parentId: folder.parentId,
    children: deriveOrganizerFolderTree(organizer, folder.id),
  }));
}

export function deriveOrganizerFolderSessions(
  sessions: ChatSessionRow[],
  organizer: ChatSessionOrganizerState,
  folderId: string,
): ChatSessionRow[] {
  const current = normalizeChatSessionOrganizerState(organizer);
  if (!current.folders.some((folder) => folder.id === folderId)) {
    return [];
  }
  const folderSessions = sessions.filter((session) => current.sessionFolderMap[session.key] === folderId);
  return orderSessionsWithManualOrder(folderSessions, current.folderSessionOrder[folderId] || []);
}

export function countOrganizerFolderSessions(
  sessions: ChatSessionRow[],
  organizer: ChatSessionOrganizerState,
  folderId: string,
): number {
  return deriveOrganizerFolderSessions(sessions, organizer, folderId).length;
}

export function buildArchivedOrganizerEntry(sessions: ChatSessionRow[]): ChatBuiltInOrganizerEntry {
  const ordered = sessions.slice().sort(sortSessionsByUpdatedAt);
  return {
    id: CHAT_BUILT_IN_ARCHIVED_FOLDER_ID,
    kind: 'archived',
    title: 'Archived',
    system: true,
    updatedAt: ordered[0]?.updatedAt || null,
    sessionCount: sessions.length,
  };
}

export function isArchivedBuiltInFolderId(folderId: string | null | undefined): boolean {
  return normalizeString(folderId) === CHAT_BUILT_IN_ARCHIVED_FOLDER_ID;
}

export function isOrganizerSystemEntryId(entryId: string | null | undefined): boolean {
  return isArchivedBuiltInFolderId(entryId);
}

export function canRenameOrganizerEntryId(entryId: string | null | undefined): boolean {
  return !isOrganizerSystemEntryId(entryId);
}

export function canMoveOrganizerEntryId(entryId: string | null | undefined): boolean {
  return !isOrganizerSystemEntryId(entryId);
}

export function canUseOrganizerEntryAsParent(entryId: string | null | undefined): boolean {
  return !isOrganizerSystemEntryId(entryId);
}

export function pruneOrganizerStateSessionKeys(
  organizer: ChatSessionOrganizerState,
  validSessionKeys: Iterable<string>,
): ChatSessionOrganizerState {
  const current = normalizeChatSessionOrganizerState(organizer);
  const valid = new Set(uniqueStrings(validSessionKeys));

  const nextSessionFolderMap: Record<string, string | null> = {};
  for (const [sessionKey, folderId] of Object.entries(current.sessionFolderMap)) {
    if (!valid.has(sessionKey)) {
      continue;
    }
    nextSessionFolderMap[sessionKey] = folderId;
  }

  const nextFolderSessionOrder: Record<string, string[]> = {};
  for (const [folderId, sessionKeys] of Object.entries(current.folderSessionOrder)) {
    nextFolderSessionOrder[folderId] = sessionKeys.filter((sessionKey) => valid.has(sessionKey));
  }

  return {
    ...current,
    rootSessionOrder: current.rootSessionOrder.filter((sessionKey) => valid.has(sessionKey)),
    folderSessionOrder: nextFolderSessionOrder,
    sessionFolderMap: nextSessionFolderMap,
  };
}

export function deriveOrganizerFolderPath(
  organizer: ChatSessionOrganizerState,
  folderId: string,
): ChatSessionFolder[] {
  const current = normalizeChatSessionOrganizerState(organizer);
  const byId = new Map(current.folders.map((folder) => [folder.id, folder]));
  const path: ChatSessionFolder[] = [];
  let cursor = byId.get(folderId) || null;
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path;
}
