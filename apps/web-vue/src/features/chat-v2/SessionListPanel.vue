<template>
  <section class="chat-shell-session-list">
    <SessionPanelHeader
      :inspect-mode="inspectMode"
      :current-folder="Boolean(viewModel.currentFolder.value)"
      :selection-mode="selection.selectionMode.value"
      :creating-folder-open="actions.creatingFolderOpen.value"
      :create-folder-draft="actions.createFolderDraft.value"
      @toggle-inspect="$emit('toggle-inspect')"
      @open-create-folder="actions.emitCreateFolder"
      @update:create-folder-draft="actions.createFolderDraft.value = $event"
      @cancel-create-folder="actions.cancelCreateFolder"
      @submit-create-folder="actions.submitCreateFolder"
      @toggle-selection-mode="selection.toggleSelectionMode"
      @new-chat="$emit('new-chat')"
    />

    <SessionListScopeTabs
      :model-value="viewModel.listScope.value"
      @update:model-value="viewModel.setListScope"
    />

    <SessionFilterBar
      :search-text="filters.searchText.value"
      :has-active-filters="filters.hasActiveFilters.value"
      :active-filter-chips="filters.activeFilterChips.value"
      :filter-panel-open="filters.filterPanelOpen.value"
      :available-agent-options="filters.availableAgentOptions.value"
      :available-source-options="filters.availableSourceOptions.value"
      :selected-agent-filter="filters.selectedAgentFilter.value"
      :selected-source-filter="filters.selectedSourceFilter.value"
      :theme="theme"
      @update:search-text="filters.searchText.value = $event"
      @update:filter-panel-open="filters.setFilterPanelOpen"
      @clear-filters="filters.clearFilters"
      @clear-filter-chip="filters.clearFilterChip"
      @update:selected-agent-filter="filters.selectedAgentFilter.value = $event"
      @update:selected-source-filter="filters.selectedSourceFilter.value = $event"
    />

    <SessionBatchBar
      v-if="selection.selectionMode.value"
      :selected-count="selection.selectedManageableSessionKeys.value.length"
      :archive-view-open="viewModel.archiveViewOpen.value"
      :all-visible-sessions-selected="selection.allVisibleSessionsSelected.value"
      :has-batch-destination-target="actions.hasBatchDestinationTarget.value"
      :selected-sessions-have-folder-membership="selection.organizerFolderSummary.value.hasFolderMembership"
      @toggle-select-all-visible="selection.toggleSelectAllVisible"
      @open-batch-folder-picker="actions.openBatchFolderPicker"
      @remove-from-folder="actions.emitAssignSessions(selection.selectedManageableSessionKeys.value, null)"
      @batch-action="actions.emitBatchAction"
    />

    <div
      ref="sessionListBodyRef"
      class="chat-shell-session-list__body"
      @scroll.passive="handleSessionListBodyScroll"
      @contextmenu="actions.openSurfaceContextMenu"
    >
      <div v-if="windows.showInitialLoading.value" class="chat-shell-session-list__empty">
        {{ text('正在读取会话...', 'Loading chats...') }}
      </div>
      <template v-else>
        <div v-if="loading && windows.hasVisibleContent.value" class="chat-shell-session-list__loading-hint">
          {{ text('目录正在渐进加载，更多会话会继续补齐。', 'The list is loading progressively. More chats will appear shortly.') }}
        </div>

        <SessionFolderHeader
          v-if="viewModel.currentFolder.value || viewModel.archiveViewOpen.value"
          :archive-view-open="viewModel.archiveViewOpen.value"
          :current-folder-label="viewModel.currentFolderLabel.value"
          :current-folder-path="viewModel.currentFolderPath.value"
          :renaming-current-folder="actions.renamingCurrentFolder.value"
          :folder-rename-draft="actions.folderRenameDraft.value"
          :current-view-summary="windows.currentViewSummary.value"
          :can-rename="canRenameCurrentFolder"
          @leave-folder="leaveFolder"
          @enter-folder="enterFolder"
          @start-folder-rename="actions.startCurrentFolderRename"
          @update:folder-rename-draft="actions.folderRenameDraft.value = $event"
          @cancel-folder-rename="actions.cancelFolderRename"
          @submit-folder-rename="actions.submitFolderRename"
          @open-create-folder="actions.openCurrentFolderCreate"
        />

        <SessionFolderList
          :show-root-folders="viewModel.listScope.value === 'folders' && !viewModel.currentFolder.value && !viewModel.archiveViewOpen.value"
          :show-child-folders="Boolean(viewModel.currentFolder.value) && viewModel.listScope.value === 'folders'"
          :visible-folder-entries="filters.visibleFolderEntries.value"
          :visible-child-folders="visibleChildFolders"
          :current-folder-id="viewModel.currentFolderId.value"
          :folder-rename-draft="actions.folderRenameDraft.value"
          :folder-session-count="viewModel.folderSessionCount"
          :folder-child-count="viewModel.folderChildCount"
          :format-date="formatDate"
          :is-built-in-archived-entry="viewModel.isBuiltInArchivedEntry"
          :is-user-folder="viewModel.isUserFolder"
          :is-context-menu-open-for-folder="actions.isContextMenuOpenForFolder"
          :is-renaming-folder="actions.isRenamingFolder"
          :folder-title="viewModel.folderTitle"
          @enter-folder="enterFolder"
          @open-folder-context-menu="actions.openFolderContextMenu"
          @toggle-folder-menu="actions.toggleFolderMenu"
          @update:folder-rename-draft="actions.folderRenameDraft.value = $event"
          @cancel-folder-rename="actions.cancelFolderRename"
          @submit-folder-rename="actions.submitFolderRename"
        />

        <SessionRowList
          :active-sessions="windows.visibleActiveSessions.value"
          :archived-sessions="windows.visibleArchivedSessions.value"
          :observed-sessions="windows.visibleObservedSessions.value"
          :active-count="filters.filteredActiveSessions.value.length"
          :archived-count="filters.filteredArchivedSessions.value.length"
          :observed-count="filters.filteredObservedSessions.value.length"
          :active-hidden-count="windows.activeHiddenCount.value"
          :archived-hidden-count="windows.archivedHiddenCount.value"
          :observed-hidden-count="windows.observedHiddenCount.value"
          :archive-view-open="viewModel.archiveViewOpen.value"
          :show-observed="showObservedRail"
          :selection-mode="selection.selectionMode.value"
          :selected-session-key="selectedSessionKey"
          :session-rename-draft="actions.sessionRenameDraft.value"
          :can-manage-session="canManageSession"
          :is-session-selected="isSessionSelected"
          :is-context-menu-open-for-session="actions.isContextMenuOpenForSession"
          :is-renaming-session="actions.isRenamingSession"
          :agent-avatar-for="agentAvatarFor"
          :agent-emoji-for="agentEmojiFor"
          :agent-initial-for="agentInitialFor"
          :agent-name-for="agentNameFor"
          :session-title="sessionTitle"
          :session-preview="sessionPreview"
          :format-date="formatDate"
          :session-state-tone="sessionStateTone"
          :session-state-label="sessionStateLabel"
          @open-row-context-menu="actions.openRowContextMenu"
          @toggle-row-menu="actions.toggleRowMenu"
          @session-primary-click="handleSessionPrimaryClick"
          @toggle-session-selection="selection.toggleSessionSelection"
          @update:session-rename-draft="actions.sessionRenameDraft.value = $event"
          @cancel-session-rename="actions.cancelSessionRename"
          @submit-session-rename="actions.submitSessionRename"
          @show-more="windows.showMore"
          @select-observed-session="$emit('select-session', $event)"
        />

        <div v-if="!windows.hasVisibleContent.value" class="chat-shell-session-list__empty">
          {{
            viewModel.currentFolder.value || viewModel.archiveViewOpen.value
              ? text('这个文件夹里还没有会话。', 'This folder does not contain chats yet.')
              : text('还没有会话。点击“新建会话”开始。', 'No chats yet. Click “New chat” to start.')
          }}
        </div>
      </template>
    </div>

    <SessionContextMenu
      :open="actions.contextMenu.value.open"
      :x="actions.contextMenu.value.x"
      :y="actions.contextMenu.value.y"
      :items="actions.contextMenuItems.value"
      @close="actions.closeContextMenu"
      @action="actions.handleContextMenuAction"
    />

    <FolderPickerMenu
      :open="actions.folderPicker.value.open"
      :x="actions.folderPicker.value.x"
      :y="actions.folderPicker.value.y"
      :items="actions.folderPickerTree.value"
      @close="actions.closeFolderPicker"
      @select="actions.handleFolderPickerSelect"
    />
  </section>
</template>

<script setup lang="ts">
import './session-list-shared.css';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { shouldRevealMoreSessionRowsOnScroll } from '../../../../../lib/chat-session-catalog';
import {
  canRenameOrganizerEntryId,
  deriveOrganizerChildFolders,
} from '../../../../../lib/chat-session-organizer';
import type { AgentSummary } from '../../../../../types/agents';
import type {
  ChatSessionOrganizerState,
  ChatSessionRow,
} from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import { deriveChatPreview, deriveChatSessionTitle } from './display-adapter';
import FolderPickerMenu from './FolderPickerMenu.vue';
import SessionBatchBar from './SessionBatchBar.vue';
import SessionContextMenu from './SessionContextMenu.vue';
import SessionFilterBar from './SessionFilterBar.vue';
import SessionFolderHeader from './SessionFolderHeader.vue';
import SessionFolderList from './SessionFolderList.vue';
import SessionPanelHeader from './SessionPanelHeader.vue';
import SessionListScopeTabs from './SessionListScopeTabs.vue';
import SessionRowList from './SessionRowList.vue';
import {
  type BatchAction,
  type FolderAction,
  type SessionAction,
  useSessionListActions,
} from './session-list-actions';
import { useSessionListFilters } from './session-list-filters';
import { useSessionListSelection } from './session-list-selection';
import {
  useSessionListViewModel,
  useSessionListWindows,
} from './session-list-view-model';

const props = defineProps<{
  organizer: ChatSessionOrganizerState;
  activeSessions: ChatSessionRow[];
  archivedSessions: ChatSessionRow[];
  observedSessions: ChatSessionRow[];
  selectedSessionKey: string;
  loading: boolean;
  inspectMode: boolean;
  agents: AgentSummary[];
  theme: 'light' | 'dark';
}>();

const emit = defineEmits<{
  (event: 'select-session', sessionKey: string): void;
  (event: 'new-chat'): void;
  (event: 'create-folder', payload: { parentId: string | null; title: string }): void;
  (event: 'toggle-inspect'): void;
  (event: 'session-action', payload: { action: SessionAction; sessionKey: string; title?: string }): void;
  (event: 'folder-action', payload: { action: FolderAction; folderId: string; title?: string }): void;
  (event: 'assign-sessions', payload: { sessionKeys: string[]; folderId: string | null }): void;
  (event: 'batch-action', payload: { action: BatchAction; sessionKeys: string[] }): void;
}>();

const { locale, text } = useLocalePreference();
const sessionListBodyRef = ref<HTMLElement | null>(null);
let sessionListAutoRevealFrame = 0;

type SessionDisplayMeta = {
  agentName: string;
  agentAvatar: string;
  agentEmoji: string;
  agentInitial: string;
  title: string;
  preview: string;
  observedPreview: string;
  stateLabel: string;
  stateTone: string;
};

const agentById = computed(() => new Map(
  props.agents.map((agent) => [agent.id, agent]),
));

const displaySessions = computed(() => [
  ...props.activeSessions,
  ...props.archivedSessions,
  ...props.observedSessions,
]);

function resolveAgent(session: ChatSessionRow): AgentSummary | null {
  return agentById.value.get(session.agentId) || null;
}

function deriveAgentName(session: ChatSessionRow): string {
  const agent = resolveAgent(session);
  return agent?.name || agent?.identity.name || session.agentId;
}

function deriveSessionPreviewText(session: ChatSessionRow, observed = false): string {
  return deriveChatPreview(session.lastMessagePreview)
    || (observed ? text('只读观察会话', 'Observed history session') : text('还没有消息', 'No messages yet'));
}

function deriveSessionStateLabel(session: ChatSessionRow): string {
  if (!session.permissions.writable) {
    return text('只读', 'Read-only');
  }
  if (
    session.runtime.activeRunId
    || session.runtime.state === 'running'
    || session.runtime.state === 'streaming'
  ) {
    return text('进行中', 'Running');
  }
  return text('可聊', 'Live');
}

function deriveSessionStateTone(session: ChatSessionRow): string {
  if (!session.permissions.writable) {
    return 'readonly';
  }
  if (
    session.runtime.activeRunId
    || session.runtime.state === 'running'
    || session.runtime.state === 'streaming'
  ) {
    return 'running';
  }
  return 'live';
}

const sessionDisplayMetaByKey = computed(() => {
  const metaByKey = new Map<string, SessionDisplayMeta>();
  // Explicitly depend on locale so cached labels update immediately after language changes.
  void locale.value;
  for (const session of displaySessions.value) {
    if (metaByKey.has(session.key)) {
      continue;
    }
    const agent = resolveAgent(session);
    const agentName = deriveAgentName(session);
    metaByKey.set(session.key, {
      agentName,
      agentAvatar: agent?.identity.avatar || '',
      agentEmoji: agent?.identity.emoji || '',
      agentInitial: agentName.trim().charAt(0).toUpperCase() || 'A',
      title: deriveChatSessionTitle(session, agentName),
      preview: deriveSessionPreviewText(session, false),
      observedPreview: deriveSessionPreviewText(session, true),
      stateLabel: deriveSessionStateLabel(session),
      stateTone: deriveSessionStateTone(session),
    });
  }
  return metaByKey;
});

function sessionDisplayMeta(session: ChatSessionRow): SessionDisplayMeta {
  const cached = sessionDisplayMetaByKey.value.get(session.key);
  if (cached) {
    return cached;
  }
  const agent = resolveAgent(session);
  const agentName = deriveAgentName(session);
  return {
    agentName,
    agentAvatar: agent?.identity.avatar || '',
    agentEmoji: agent?.identity.emoji || '',
    agentInitial: agentName.trim().charAt(0).toUpperCase() || 'A',
    title: deriveChatSessionTitle(session, agentName),
    preview: deriveSessionPreviewText(session, false),
    observedPreview: deriveSessionPreviewText(session, true),
    stateLabel: deriveSessionStateLabel(session),
    stateTone: deriveSessionStateTone(session),
  };
}

function agentNameFor(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).agentName;
}

function agentAvatarFor(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).agentAvatar;
}

function agentEmojiFor(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).agentEmoji;
}

function agentInitialFor(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).agentInitial;
}

function sessionTitle(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).title;
}

function sessionPreview(session: ChatSessionRow, observed = false): string {
  const meta = sessionDisplayMeta(session);
  return observed ? meta.observedPreview : meta.preview;
}

function sessionStateLabel(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).stateLabel;
}

function sessionStateTone(session: ChatSessionRow): string {
  return sessionDisplayMeta(session).stateTone;
}

function formatDate(value: string | null): string {
  if (!value) {
    return text('刚刚', 'Just now');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const now = new Date();
  const sameYear = parsed.getFullYear() === now.getFullYear();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsedStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.round((todayStart.getTime() - parsedStart.getTime()) / 86400000);

  if (diffDays <= 0) {
    return parsed.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (diffDays === 1) {
    return text('昨天', 'Yesterday');
  }
  if (diffDays > 1 && diffDays < 7) {
    return parsed.toLocaleDateString([], {
      weekday: 'short',
    });
  }
  if (sameYear) {
    return parsed.toLocaleDateString([], {
      month: 'numeric',
      day: 'numeric',
    });
  }
  return parsed.toLocaleDateString([], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

function canManageSession(session: ChatSessionRow): boolean {
  return session.kind === 'studio_managed' && session.permissions.writable;
}

const organizerRef = computed(() => props.organizer);
const activeSessionsRef = computed(() => props.activeSessions);
const archivedSessionsRef = computed(() => props.archivedSessions);
const observedSessionsRef = computed(() => props.observedSessions);
const loadingRef = computed(() => props.loading);

const viewModel = useSessionListViewModel({
  organizer: organizerRef,
  activeSessions: activeSessionsRef,
  archivedSessions: archivedSessionsRef,
  observedSessions: observedSessionsRef,
  text,
});

const filters = useSessionListFilters({
  baseActiveSessions: viewModel.baseActiveSessions,
  baseArchivedSessions: viewModel.baseArchivedSessions,
  baseObservedSessions: viewModel.baseObservedSessions,
  orderedFolders: viewModel.orderedFolders,
  currentFolder: viewModel.currentFolder,
  listScope: viewModel.listScope,
  archiveViewOpen: viewModel.archiveViewOpen,
  text,
  agentNameFor,
  sessionTitle,
  sessionPreview,
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
const showObservedRail = computed(() => props.inspectMode && viewModel.listScope.value === 'all');

const windows = useSessionListWindows({
  filteredActiveSessions: filters.filteredActiveSessions,
  filteredArchivedSessions: filters.filteredArchivedSessions,
  filteredObservedSessions: filters.filteredObservedSessions,
  visibleFolderEntries: filters.visibleFolderEntries,
  visibleChildFolders,
  currentFolder: viewModel.currentFolder,
  archiveViewOpen: viewModel.archiveViewOpen,
  showObserved: showObservedRail,
  searchActive: filters.searchActive,
  loading: loadingRef,
  text,
});

const selection = useSessionListSelection({
  visibleActiveSessions: windows.visibleActiveSessions,
  visibleArchivedSessions: windows.visibleArchivedSessions,
  allOrganizerSessions: viewModel.allOrganizerSessions,
  organizer: viewModel.prunedOrganizer,
  canManageSession,
});

const actions = useSessionListActions({
  currentFolder: viewModel.currentFolder,
  orderedFolders: viewModel.orderedFolders,
  allOrganizerSessions: viewModel.allOrganizerSessions,
  archiveViewOpen: viewModel.archiveViewOpen,
  prunedOrganizer: viewModel.prunedOrganizer,
  selectedManageableSessionKeys: selection.selectedManageableSessionKeys,
  text,
  canManageSession,
  organizerFolderForSession: viewModel.organizerFolderForSession,
  enterFolder: viewModel.enterFolder,
  clearSelection: selection.clearSelection,
  setSelectionMode: selection.setSelectionMode,
  onCreateFolder: (payload) => emit('create-folder', payload),
  onFolderAction: (payload) => emit('folder-action', payload),
  onSessionAction: (payload) => emit('session-action', payload),
  onAssignSessions: (payload) => emit('assign-sessions', payload),
  onBatchAction: (payload) => emit('batch-action', payload),
});

const canRenameCurrentFolder = computed(() => Boolean(
  viewModel.currentFolder.value
  && canRenameOrganizerEntryId(viewModel.currentFolder.value.id),
));

function isSessionSelected(sessionKey: string): boolean {
  return selection.selectedSet.value.has(sessionKey);
}

function enterFolder(folderId: string): void {
  viewModel.enterFolder(folderId);
  actions.resetTransientState();
  selection.clearSelection();
}

function leaveFolder(): void {
  viewModel.leaveFolder();
  actions.resetTransientState();
  selection.clearSelection();
}

function handleSessionPrimaryClick(session: ChatSessionRow): void {
  if (selection.selectionMode.value && canManageSession(session)) {
    selection.toggleSessionSelection(session.key);
    return;
  }
  emit('select-session', session.key);
}

function revealMoreSessionsNearRailBottom(element: HTMLElement | null): void {
  if (!element || !windows.hasHiddenRows.value || !shouldRevealMoreSessionRowsOnScroll({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  })) {
    return;
  }
  windows.showMoreVisibleSections();
}

function scheduleRevealMoreSessionsNearRailBottom(element: HTMLElement | null): void {
  if (!element || sessionListAutoRevealFrame) {
    return;
  }
  sessionListAutoRevealFrame = window.requestAnimationFrame(() => {
    sessionListAutoRevealFrame = 0;
    revealMoreSessionsNearRailBottom(element);
  });
}

function handleSessionListBodyScroll(event: Event): void {
  if (!windows.hasHiddenRows.value || sessionListAutoRevealFrame) {
    return;
  }
  const element = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : sessionListBodyRef.value;
  if (!element || !shouldRevealMoreSessionRowsOnScroll({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  })) {
    return;
  }
  scheduleRevealMoreSessionsNearRailBottom(element);
}

watch(
  [
    filters.searchText,
    filters.selectedAgentFilter,
    filters.selectedSourceFilter,
    viewModel.listScope,
    viewModel.currentFolderId,
    () => props.inspectMode,
  ],
  () => {
    actions.resetTransientState();
    selection.clearSelection();
  },
);

watch(
  () => windows.hasHiddenRows.value,
  () => {
    scheduleRevealMoreSessionsNearRailBottom(sessionListBodyRef.value);
  },
);

onBeforeUnmount(() => {
  if (sessionListAutoRevealFrame) {
    window.cancelAnimationFrame(sessionListAutoRevealFrame);
    sessionListAutoRevealFrame = 0;
  }
});
</script>

<style scoped>
.chat-shell-session-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.chat-shell-session-list__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px 12px 20px;
  display: grid;
  align-content: start;
  gap: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-sidebar-bg) 96%, transparent 4%), transparent 18%),
    linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--chat-thread-bg) 10%, transparent 90%) 100%);
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 144, 170, 0.42) transparent;
}

.chat-shell-session-list__body::-webkit-scrollbar {
  width: 12px;
}

.chat-shell-session-list__body::-webkit-scrollbar-track {
  background: transparent;
}

.chat-shell-session-list__body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  border: 3px solid transparent;
  background: rgba(120, 144, 170, 0.22);
  background-clip: padding-box;
  transition: background 0.18s ease;
}

.chat-shell-session-list__body:hover::-webkit-scrollbar-thumb {
  background: rgba(86, 122, 168, 0.52);
  background-clip: padding-box;
}

.chat-shell-session-list__loading-hint {
  margin: 2px 4px -2px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-accent) 18%, var(--chat-line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-sidebar-row) 96%, transparent 4%), color-mix(in srgb, var(--chat-sidebar-row-hover) 98%, transparent 2%)),
    radial-gradient(circle at right top, color-mix(in srgb, var(--chat-accent) 12%, transparent), transparent 56%);
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.chat-shell-session-list__empty {
  min-height: 160px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--chat-text-soft);
  padding: 24px 20px;
  border: 1px dashed color-mix(in srgb, var(--chat-line-strong) 68%, transparent 32%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--chat-sidebar-row) 72%, transparent 28%);
}
</style>
