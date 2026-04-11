import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { buildChatSessionDestinationItemsFromOrganizer } from '../../../../../lib/chat-session-catalog';
import { resolveSessionEditableLabel } from '../../../../../lib/chat-session-auto-title';
import { deriveOrganizerChildFolders } from '../../../../../lib/chat-session-organizer';
import type {
  ChatSessionFolder,
  ChatSessionOrganizerState,
  ChatSessionRow,
} from '../../../../../types/chat';

type ReadonlyRef<T> = Ref<T> | ComputedRef<T>;
type TextFn = (chinese: string, english: string) => string;
type CascadeMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  submenuOnly?: boolean;
  children?: CascadeMenuItem[];
};

export type SessionAction = 'rename' | 'archive' | 'delete';
export type FolderAction = 'rename' | 'move_up' | 'move_down' | 'move_top' | 'delete';
export type BatchAction = 'archive' | 'unarchive' | 'delete';
type ContextMenuMode = 'surface' | 'session' | 'folder' | null;
type DestinationLike = {
  disabled?: boolean;
  children?: DestinationLike[];
};

export function useSessionListActions(params: {
  currentFolder: ReadonlyRef<ChatSessionFolder | null>;
  orderedFolders: ReadonlyRef<ChatSessionFolder[]>;
  allOrganizerSessions: ReadonlyRef<ChatSessionRow[]>;
  archiveViewOpen: ReadonlyRef<boolean>;
  prunedOrganizer: ReadonlyRef<ChatSessionOrganizerState>;
  selectedManageableSessionKeys: ReadonlyRef<string[]>;
  text: TextFn;
  canManageSession: (session: ChatSessionRow) => boolean;
  organizerFolderForSession: (sessionKey: string) => string | null;
  enterFolder: (folderId: string) => void;
  clearSelection: () => void;
  setSelectionMode: (next: boolean) => void;
  onCreateFolder: (payload: { parentId: string | null; title: string }) => void;
  onFolderAction: (payload: { action: FolderAction; folderId: string; title?: string }) => void;
  onSessionAction: (payload: { action: SessionAction; sessionKey: string; title?: string }) => void;
  onAssignSessions: (payload: { sessionKeys: string[]; folderId: string | null }) => void;
  onBatchAction: (payload: { action: BatchAction; sessionKeys: string[] }) => void;
}) {
  const creatingFolderOpen = ref(false);
  const creatingFolderParentId = ref<string | null>(null);
  const createFolderDraft = ref('');
  const renamingFolderId = ref('');
  const folderRenameDraft = ref('');
  const renamingSessionKey = ref('');
  const sessionRenameDraft = ref('');
  const contextMenu = ref<{
    open: boolean;
    x: number;
    y: number;
    mode: ContextMenuMode;
    session: ChatSessionRow | null;
    folder: ChatSessionFolder | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    mode: null,
    session: null,
    folder: null,
  });
  const folderPicker = ref<{
    open: boolean;
    x: number;
    y: number;
    sessionKeys: string[];
  }>({
    open: false,
    x: 0,
    y: 0,
    sessionKeys: [],
  });

  const renamingCurrentFolder = computed(() => Boolean(
    params.currentFolder.value && renamingFolderId.value === params.currentFolder.value.id,
  ));

  function hasSelectableDestination(items: DestinationLike[]): boolean {
    return items.some((item) => (
      !item.disabled
      || (Array.isArray(item.children) && hasSelectableDestination(item.children))
    ));
  }

  function resolveSharedFolderTarget(sessionKeys: string[]): string | null | undefined {
    const folderIds = Array.from(new Set(
      sessionKeys.map((sessionKey) => params.organizerFolderForSession(sessionKey)),
    ));
    if (folderIds.length !== 1) {
      return undefined;
    }
    return folderIds[0] ?? null;
  }

  function buildSessionMoveItems(sessionKeys: string[]): CascadeMenuItem[] {
    const sharedTarget = resolveSharedFolderTarget(sessionKeys);
    return buildChatSessionDestinationItemsFromOrganizer(params.prunedOrganizer.value, {
      rootId: '__root__',
      rootLabel: params.text('根目录', 'Root'),
      idPrefix: 'session:move:',
      disabledIds: sharedTarget && sharedTarget !== null ? [sharedTarget] : [],
      disableRoot: sharedTarget === null,
    });
  }

  const folderPickerTree = computed<CascadeMenuItem[]>(() => {
    const sharedTarget = resolveSharedFolderTarget(params.selectedManageableSessionKeys.value);
    return buildChatSessionDestinationItemsFromOrganizer(params.prunedOrganizer.value, {
      rootId: '__root__',
      rootLabel: params.text('根目录', 'Root'),
      disabledIds: sharedTarget && sharedTarget !== null ? [sharedTarget] : [],
      disableRoot: sharedTarget === null,
      excludeFolderIds: params.currentFolder.value ? [params.currentFolder.value.id] : [],
    });
  });
  const hasBatchDestinationTarget = computed(() => hasSelectableDestination(folderPickerTree.value));

  const contextMenuItems = computed<CascadeMenuItem[]>(() => {
    if (!contextMenu.value.open) {
      return [];
    }
    if (contextMenu.value.mode === 'surface') {
      return [{
        id: 'surface:create-folder',
        label: params.text('新建文件夹', 'New folder'),
      }];
    }
    if (contextMenu.value.mode === 'folder' && contextMenu.value.folder) {
      const siblingFolders = deriveOrganizerChildFolders(
        params.prunedOrganizer.value,
        contextMenu.value.folder.parentId || null,
      );
      const folderIndex = siblingFolders.findIndex((folder) => folder.id === contextMenu.value.folder?.id);
      return [
        {
          id: 'folder:open',
          label: params.text('进入文件夹', 'Open folder'),
        },
        {
          id: 'folder:rename',
          label: params.text('重命名', 'Rename'),
        },
        {
          id: 'folder:move-up',
          label: params.text('上移', 'Move up'),
          disabled: folderIndex <= 0,
        },
        {
          id: 'folder:move-down',
          label: params.text('下移', 'Move down'),
          disabled: folderIndex < 0 || folderIndex >= siblingFolders.length - 1,
        },
        {
          id: 'folder:move-top',
          label: params.text('移到最上方', 'Move to top'),
          disabled: folderIndex <= 0,
        },
        {
          id: 'folder:delete',
          label: params.text('删除文件夹', 'Delete folder'),
          danger: true,
        },
      ];
    }
    if (contextMenu.value.mode === 'session' && contextMenu.value.session) {
      const session = contextMenu.value.session;
      const sessionMoveItems = buildSessionMoveItems([session.key]);
      const items: CascadeMenuItem[] = [
        {
          id: 'session:rename',
          label: params.text('重命名', 'Rename'),
        },
        {
          id: 'session:archive',
          label: session.presentation.archived
            ? params.text('取消归档', 'Unarchive')
            : params.text('归档', 'Archive'),
        },
      ];
      if (params.archiveViewOpen.value) {
        items.push({
          id: 'session:delete',
          label: params.text('删除', 'Delete'),
          danger: true,
        });
        return items;
      }
      items.push({
        id: 'session:move',
        label: params.text('移动到文件夹', 'Move to folder'),
        disabled: !hasSelectableDestination(sessionMoveItems),
        submenuOnly: true,
        children: sessionMoveItems,
      });
      items.push({
        id: 'session:delete',
        label: params.text('删除', 'Delete'),
        danger: true,
      });
      return items;
    }
    return [];
  });

  function closeContextMenu(): void {
    contextMenu.value = {
      open: false,
      x: 0,
      y: 0,
      mode: null,
      session: null,
      folder: null,
    };
  }

  function closeFolderPicker(): void {
    folderPicker.value = {
      open: false,
      x: 0,
      y: 0,
      sessionKeys: [],
    };
  }

  function openContextMenuAt(paramsForMenu: {
    x: number;
    y: number;
    mode: ContextMenuMode;
    session?: ChatSessionRow | null;
    folder?: ChatSessionFolder | null;
  }): void {
    contextMenu.value = {
      open: true,
      x: paramsForMenu.x,
      y: paramsForMenu.y,
      mode: paramsForMenu.mode,
      session: paramsForMenu.session || null,
      folder: paramsForMenu.folder || null,
    };
  }

  function resetTransientState(): void {
    closeContextMenu();
    closeFolderPicker();
    cancelCreateFolder();
    cancelFolderRename();
    cancelSessionRename();
  }

  function startCreateFolder(parentId: string | null): void {
    creatingFolderOpen.value = true;
    creatingFolderParentId.value = parentId;
    createFolderDraft.value = '';
    closeContextMenu();
  }

  function emitCreateFolder(): void {
    startCreateFolder(params.currentFolder.value ? params.currentFolder.value.id : null);
  }

  function cancelCreateFolder(): void {
    creatingFolderOpen.value = false;
    creatingFolderParentId.value = null;
    createFolderDraft.value = '';
  }

  function openCurrentFolderCreate(): void {
    if (!params.currentFolder.value) {
      return;
    }
    startCreateFolder(params.currentFolder.value.id);
  }

  function submitCreateFolder(): void {
    const title = createFolderDraft.value.trim();
    if (!title) {
      return;
    }
    params.onCreateFolder({
      parentId: creatingFolderParentId.value,
      title,
    });
    cancelCreateFolder();
  }

  function isRenamingSession(sessionKey: string): boolean {
    return renamingSessionKey.value === sessionKey;
  }

  function startSessionRename(sessionKey: string): void {
    const session = params.allOrganizerSessions.value.find((item) => item.key === sessionKey) || null;
    if (!session) {
      return;
    }
    renamingSessionKey.value = sessionKey;
    sessionRenameDraft.value = resolveSessionEditableLabel(session);
    closeContextMenu();
  }

  function cancelSessionRename(): void {
    renamingSessionKey.value = '';
    sessionRenameDraft.value = '';
  }

  function submitSessionRename(): void {
    const sessionKey = renamingSessionKey.value;
    const session = params.allOrganizerSessions.value.find((item) => item.key === sessionKey) || null;
    const title = sessionRenameDraft.value.trim();
    if (!session || !title) {
      return;
    }
    if (title === resolveSessionEditableLabel(session)) {
      cancelSessionRename();
      return;
    }
    params.onSessionAction({
      action: 'rename',
      sessionKey,
      title,
    });
    cancelSessionRename();
  }

  function isRenamingFolder(folderId: string): boolean {
    return renamingFolderId.value === folderId;
  }

  function startFolderRename(folderId: string): void {
    const folder = params.orderedFolders.value.find((item) => item.id === folderId) || null;
    if (!folder) {
      return;
    }
    renamingFolderId.value = folderId;
    folderRenameDraft.value = folder.title;
    closeContextMenu();
  }

  function startCurrentFolderRename(): void {
    if (!params.currentFolder.value) {
      return;
    }
    startFolderRename(params.currentFolder.value.id);
  }

  function cancelFolderRename(): void {
    renamingFolderId.value = '';
    folderRenameDraft.value = '';
  }

  function submitFolderRename(): void {
    const folderId = renamingFolderId.value;
    const folder = params.orderedFolders.value.find((item) => item.id === folderId) || null;
    const title = folderRenameDraft.value.trim();
    if (!folder || !title) {
      return;
    }
    if (title === folder.title) {
      cancelFolderRename();
      return;
    }
    params.onFolderAction({
      action: 'rename',
      folderId,
      title,
    });
    cancelFolderRename();
  }

  function emitFolderAction(action: FolderAction, folderId: string, title?: string): void {
    params.onFolderAction({ action, folderId, title });
    closeContextMenu();
  }

  function emitBatchAction(action: BatchAction): void {
    if (!params.selectedManageableSessionKeys.value.length) {
      return;
    }
    params.onBatchAction({
      action,
      sessionKeys: params.selectedManageableSessionKeys.value,
    });
    params.clearSelection();
    params.setSelectionMode(false);
  }

  function emitAssignSessions(sessionKeys: string[], folderId: string | null): void {
    if (!sessionKeys.length) {
      return;
    }
    params.onAssignSessions({
      sessionKeys,
      folderId,
    });
    params.clearSelection();
    params.setSelectionMode(false);
    closeContextMenu();
    closeFolderPicker();
  }

  function openSurfaceContextMenu(event: MouseEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    openContextMenuAt({
      x: event.clientX,
      y: event.clientY,
      mode: 'surface',
    });
  }

  function openBatchFolderPicker(event: MouseEvent): void {
    const trigger = event.currentTarget as HTMLElement | null;
    const rect = trigger?.getBoundingClientRect();
    folderPicker.value = {
      open: true,
      x: rect ? rect.right - 16 : event.clientX,
      y: rect ? rect.bottom + 8 : event.clientY,
      sessionKeys: params.selectedManageableSessionKeys.value,
    };
  }

  function handleFolderPickerSelect(itemId: string): void {
    if (!folderPicker.value.sessionKeys.length) {
      closeFolderPicker();
      return;
    }
    emitAssignSessions(folderPicker.value.sessionKeys, itemId === '__root__' ? null : itemId);
  }

  function openRowContextMenu(event: MouseEvent, session: ChatSessionRow): void {
    if (!params.canManageSession(session)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt({
      x: event.clientX,
      y: event.clientY,
      mode: 'session',
      session,
    });
  }

  function openFolderContextMenu(event: MouseEvent, folder: ChatSessionFolder): void {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt({
      x: event.clientX,
      y: event.clientY,
      mode: 'folder',
      folder,
    });
  }

  function toggleRowMenu(event: MouseEvent, session: ChatSessionRow): void {
    if (!params.canManageSession(session)) {
      return;
    }
    event.stopPropagation();
    if (isContextMenuOpenForSession(session)) {
      closeContextMenu();
      return;
    }
    const trigger = event.currentTarget as HTMLElement | null;
    const rect = trigger?.getBoundingClientRect();
    openContextMenuAt({
      x: rect ? rect.right - 16 : event.clientX,
      y: rect ? rect.bottom + 8 : event.clientY,
      mode: 'session',
      session,
    });
  }

  function toggleFolderMenu(event: MouseEvent, folder: ChatSessionFolder): void {
    event.stopPropagation();
    if (isContextMenuOpenForFolder(folder)) {
      closeContextMenu();
      return;
    }
    const trigger = event.currentTarget as HTMLElement | null;
    const rect = trigger?.getBoundingClientRect();
    openContextMenuAt({
      x: rect ? rect.right - 16 : event.clientX,
      y: rect ? rect.bottom + 8 : event.clientY,
      mode: 'folder',
      folder,
    });
  }

  function isContextMenuOpenForSession(session: ChatSessionRow): boolean {
    return contextMenu.value.open
      && contextMenu.value.mode === 'session'
      && contextMenu.value.session?.key === session.key;
  }

  function isContextMenuOpenForFolder(folder: ChatSessionFolder): boolean {
    return contextMenu.value.open
      && contextMenu.value.mode === 'folder'
      && contextMenu.value.folder?.id === folder.id;
  }

  function handleContextMenuAction(actionId: string): void {
    if (actionId === 'surface:create-folder') {
      emitCreateFolder();
      closeContextMenu();
      return;
    }

    if (contextMenu.value.mode === 'folder' && contextMenu.value.folder) {
      const folderId = contextMenu.value.folder.id;
      if (actionId === 'folder:open') {
        params.enterFolder(folderId);
        closeContextMenu();
        return;
      }
      if (actionId === 'folder:rename') {
        startFolderRename(folderId);
        return;
      }
      if (actionId === 'folder:move-up') {
        emitFolderAction('move_up', folderId);
        return;
      }
      if (actionId === 'folder:move-down') {
        emitFolderAction('move_down', folderId);
        return;
      }
      if (actionId === 'folder:move-top') {
        emitFolderAction('move_top', folderId);
        return;
      }
      if (actionId === 'folder:delete') {
        emitFolderAction('delete', folderId);
      }
      return;
    }

    if (contextMenu.value.mode === 'session' && contextMenu.value.session) {
      const sessionKey = contextMenu.value.session.key;
      if (actionId === 'session:rename') {
        startSessionRename(sessionKey);
        return;
      }
      if (actionId === 'session:archive') {
        params.onSessionAction({ action: 'archive', sessionKey });
        closeContextMenu();
        return;
      }
      if (actionId === 'session:delete') {
        params.onSessionAction({ action: 'delete', sessionKey });
        closeContextMenu();
        return;
      }
      if (actionId.startsWith('session:move:')) {
        const folderId = actionId.slice('session:move:'.length);
        emitAssignSessions([sessionKey], folderId === '__root__' ? null : folderId);
      }
    }
  }

  watch(params.orderedFolders, (folders) => {
    if (renamingFolderId.value && !folders.some((folder) => folder.id === renamingFolderId.value)) {
      cancelFolderRename();
    }
  });

  watch(params.allOrganizerSessions, (sessions) => {
    if (renamingSessionKey.value && !sessions.some((session) => session.key === renamingSessionKey.value)) {
      cancelSessionRename();
    }
  });

  return {
    creatingFolderOpen,
    createFolderDraft,
    renamingFolderId,
    folderRenameDraft,
    renamingSessionKey,
    sessionRenameDraft,
    contextMenu,
    folderPicker,
    folderPickerTree,
    hasBatchDestinationTarget,
    renamingCurrentFolder,
    contextMenuItems,
    emitCreateFolder,
    cancelCreateFolder,
    openCurrentFolderCreate,
    submitCreateFolder,
    isRenamingSession,
    cancelSessionRename,
    submitSessionRename,
    isRenamingFolder,
    startCurrentFolderRename,
    cancelFolderRename,
    submitFolderRename,
    emitBatchAction,
    emitAssignSessions,
    openSurfaceContextMenu,
    openBatchFolderPicker,
    handleFolderPickerSelect,
    openRowContextMenu,
    openFolderContextMenu,
    toggleRowMenu,
    toggleFolderMenu,
    isContextMenuOpenForSession,
    isContextMenuOpenForFolder,
    handleContextMenuAction,
    closeContextMenu,
    closeFolderPicker,
    resetTransientState,
  };
}
