<template>
  <section class="chat-session-list" @click="closeMenus">
    <header class="chat-session-list__header">
      <div class="chat-session-list__heading">
        <p class="chat-session-list__eyebrow">{{ text('消息', 'Messages') }}</p>
        <div class="chat-session-list__title-row">
          <h2>{{ text('会话', 'Chats') }}</h2>
          <span class="chat-session-list__count">{{ filteredSessions.length }}</span>
        </div>
      </div>
      <button type="button" class="primary-button compact-button chat-session-list__new" @click.stop="$emit('new-chat')">
        {{ text('新建会话', 'New chat') }}
      </button>
    </header>

    <section class="chat-session-list__controls">
      <label class="chat-session-list__search">
        <input v-model.trim="searchText" type="search" :placeholder="text('搜索标题、Agent、摘要', 'Search title, agent, preview')" />
      </label>

      <div class="chat-session-list__filter-row">
        <div class="chat-session-list__filters">
          <button
            v-for="item in filterTabs"
            :key="item.value"
            type="button"
            class="chat-session-list__filter-chip"
            :class="{ active: activeFilter === item.value }"
            @click.stop="activeFilter = item.value"
          >
            {{ item.label }}
          </button>
        </div>

        <label class="chat-session-list__agent-filter">
          <select v-model="selectedAgentFilter" @click.stop>
            <option value="all">{{ text('全部 Agent', 'All agents') }}</option>
            <option v-for="agent in availableAgentOptions" :key="agent.id" :value="agent.id">
              {{ agent.label }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <div class="chat-session-list__body-wrap">
      <div v-if="loading" class="chat-session-list__empty">{{ text('正在读取会话...', 'Loading conversations...') }}</div>
      <div v-else-if="!filteredSessions.length" class="chat-session-list__empty chat-session-list__empty-card">
        <strong>{{ text('没有匹配会话', 'No matching chats') }}</strong>
        <span>{{ text('尝试修改筛选条件，或新建一个会话。', 'Try another filter, or create a new chat.') }}</span>
      </div>
      <div v-else class="chat-session-list__items">
        <article
          v-for="session in filteredSessions"
          :key="session.key"
          class="chat-session-list__item"
          :class="{ active: session.key === selectedSessionKey }"
          @click="$emit('select-session', session.key)"
          @contextmenu.prevent.stop="openContextMenu($event, session)"
        >
          <div class="chat-session-list__avatar" :class="{ observed: !isPrimarySession(session) }" aria-hidden="true">
            <AgentAvatarContent
              :avatar="agentAvatarFor(session)"
              :emoji="agentEmojiFor(session)"
              :fallback="agentInitialFor(session)"
              :alt="agentNameFor(session)"
            />
          </div>
          <div class="chat-session-list__body">
            <div class="chat-session-list__topline">
              <strong>{{ sessionTitle(session) }}</strong>
              <time>{{ formatDate(session.updatedAt) }}</time>
            </div>
            <div class="chat-session-list__subline">
              <span class="chat-session-list__agent">{{ agentNameFor(session) }}</span>
              <div class="chat-session-list__badges">
                <span v-if="!isPrimarySession(session)" class="chat-session-list__tag observed">{{ text('观察', 'Observed') }}</span>
                <span v-if="session.permissions.writable" class="chat-session-list__state live">{{ text('在线', 'Live') }}</span>
                <span v-else class="chat-session-list__state muted">{{ text('只读', 'Read-only') }}</span>
              </div>
            </div>
            <p>{{ sessionPreview(session, !isPrimarySession(session)) }}</p>
          </div>
          <button
            type="button"
            class="chat-session-list__more"
            :title="text('更多操作', 'More actions')"
            @click.stop="toggleInlineMenu(session.key)"
          >
            <MoreHorizontal class="chat-shell-session-more-icon" aria-hidden="true" />
          </button>

          <div v-if="inlineMenuKey === session.key" class="chat-session-list__inline-menu" @click.stop>
            <button type="button" @click="emitSessionAction('rename', session)">{{ text('重命名', 'Rename') }}</button>
            <button type="button" @click="emitSessionAction('archive', session)">{{ text('归档', 'Archive') }}</button>
            <button type="button" @click="emitSessionAction('delete', session)" class="danger">{{ text('删除', 'Delete') }}</button>
          </div>
        </article>
      </div>
    </div>

    <footer class="chat-session-list__footer">
      <button type="button" class="secondary-button compact-button" @click.stop="$emit('toggle-inspect')">
        {{ inspectPinned ? text('已在调试模式', 'Debug open') : text('打开调试台', 'Open workbench') }}
      </button>
    </footer>

    <Teleport to="body">
      <div
        v-if="contextMenu.open"
        class="chat-session-list__context-mask"
        @click="closeMenus"
        @contextmenu.prevent="closeMenus"
      >
        <div
          class="chat-session-list__context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button type="button" @click="emitSessionAction('rename', contextMenu.session)">{{ text('重命名', 'Rename') }}</button>
          <button type="button" @click="emitSessionAction('archive', contextMenu.session)">{{ text('归档', 'Archive') }}</button>
          <button type="button" @click="emitSessionAction('delete', contextMenu.session)" class="danger">{{ text('删除', 'Delete') }}</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MoreHorizontal } from '@lucide/vue';
import type { AgentSummary } from '../../../../../types/agents';
import type { ChatSessionRow } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { deriveChatPreview, deriveChatSessionTitle } from './display-adapter';

type SessionAction = 'rename' | 'archive' | 'delete';
type SessionFilter = 'all' | 'live' | 'empty';

const props = defineProps<{
  primarySessions: ChatSessionRow[];
  observedSessions: ChatSessionRow[];
  selectedSessionKey: string;
  loading: boolean;
  inspectMode: boolean;
  inspectPinned: boolean;
  agents: AgentSummary[];
}>();

const emit = defineEmits<{
  (event: 'select-session', sessionKey: string): void;
  (event: 'new-chat'): void;
  (event: 'toggle-inspect'): void;
  (event: 'session-action', payload: { action: SessionAction; sessionKey: string }): void;
}>();

const { text } = useLocalePreference();
const searchText = ref('');
const activeFilter = ref<SessionFilter>('all');
const selectedAgentFilter = ref('all');
const inlineMenuKey = ref('');
const contextMenu = ref<{ open: boolean; x: number; y: number; session: ChatSessionRow | null }>({
  open: false,
  x: 0,
  y: 0,
  session: null,
});

const allSessions = computed(() => [...props.primarySessions, ...(props.inspectMode ? props.observedSessions : [])]);

const filterTabs = computed(() => [
  { value: 'all', label: text('全部', 'All') },
  { value: 'live', label: text('在线', 'Live') },
  { value: 'empty', label: text('空会话', 'Empty') },
]);

const availableAgentOptions = computed(() => {
  const seen = new Set<string>();
  return allSessions.value
    .filter((session) => {
      if (seen.has(session.agentId)) return false;
      seen.add(session.agentId);
      return true;
    })
    .map((session) => ({ id: session.agentId, label: agentNameFor(session) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
});

const filteredSessions = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  return allSessions.value.filter((session) => {
    if (selectedAgentFilter.value !== 'all' && session.agentId !== selectedAgentFilter.value) return false;
    if (activeFilter.value === 'live' && !session.permissions.writable) return false;
    if (activeFilter.value === 'empty' && deriveChatPreview(session.lastMessagePreview) !== null) return false;

    if (!query) return true;

    const haystack = [
      sessionTitle(session),
      agentNameFor(session),
      sessionPreview(session, !isPrimarySession(session)),
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
});

function isPrimarySession(session: ChatSessionRow): boolean {
  return session.kind === 'studio_managed';
}

function formatDate(value: string | null): string {
  if (!value) return text('刚刚', 'Just now');
  try {
    return new Date(value).toLocaleDateString([], {
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function agentNameFor(session: ChatSessionRow): string {
  const agent = props.agents.find((item) => item.id === session.agentId) || null;
  return agent?.name || agent?.identity.name || session.agentId;
}

function agentAvatarFor(session: ChatSessionRow): string {
  const agent = props.agents.find((item) => item.id === session.agentId) || null;
  return agent?.identity.avatar || '';
}

function agentEmojiFor(session: ChatSessionRow): string {
  const agent = props.agents.find((item) => item.id === session.agentId) || null;
  return agent?.identity.emoji || '';
}

function agentInitialFor(session: ChatSessionRow): string {
  return agentNameFor(session).trim().charAt(0).toUpperCase() || 'A';
}

function sessionTitle(session: ChatSessionRow): string {
  return deriveChatSessionTitle(session, agentNameFor(session));
}

function sessionPreview(session: ChatSessionRow, observed = false): string {
  return deriveChatPreview(session.lastMessagePreview) || (observed ? text('历史观察会话', 'Observed history session') : text('还没有消息', 'No messages yet'));
}

function openContextMenu(event: MouseEvent, session: ChatSessionRow): void {
  inlineMenuKey.value = '';
  contextMenu.value = {
    open: true,
    x: Math.min(event.clientX, window.innerWidth - 168),
    y: Math.min(event.clientY, window.innerHeight - 144),
    session,
  };
}

function toggleInlineMenu(sessionKey: string): void {
  contextMenu.value.open = false;
  inlineMenuKey.value = inlineMenuKey.value === sessionKey ? '' : sessionKey;
}

function closeMenus(): void {
  inlineMenuKey.value = '';
  contextMenu.value = { open: false, x: 0, y: 0, session: null };
}

function emitSessionAction(action: SessionAction, session: ChatSessionRow | null): void {
  if (!session) return;
  emit('session-action', { action, sessionKey: session.key });
  closeMenus();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeMenus();
}

onMounted(() => {
  window.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape);
});
</script>

<style scoped>
.chat-session-list {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.chat-session-list__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chat-session-list__heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.chat-session-list__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-session-list__heading h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.1;
  color: var(--chat-text);
}

.chat-session-list__eyebrow,
.chat-session-list__count {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-session-list__controls {
  display: grid;
  gap: 10px;
}

.chat-session-list__search input,
.chat-session-list__agent-filter select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--chat-border);
  background: var(--chat-surface-elevated);
  color: var(--chat-text);
}

.chat-session-list__filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  gap: 8px;
  align-items: center;
}

.chat-session-list__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-session-list__filter-chip {
  border: 1px solid var(--chat-border);
  border-radius: 999px;
  background: var(--chat-surface-elevated);
  color: var(--chat-text-soft);
  font-size: 12px;
  padding: 6px 10px;
}

.chat-session-list__filter-chip.active {
  color: var(--chat-text);
  background: var(--chat-accent-soft);
  border-color: rgba(37, 99, 235, 0.22);
}

.chat-session-list__body-wrap {
  min-height: 0;
  overflow: hidden;
  display: grid;
}

.chat-session-list__items {
  display: grid;
  gap: 4px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
  align-content: start;
}

.chat-session-list__item {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 26px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 8px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.chat-session-list__item:hover {
  background: var(--chat-surface-muted);
  border-color: var(--chat-border);
}

.chat-session-list__item.active {
  background: var(--chat-accent-soft);
  border-color: rgba(37, 99, 235, 0.22);
}

:global(html:not([data-theme='light'])) .chat-session-list__item.active {
  border-color: rgba(115, 168, 255, 0.28);
}

.chat-session-list__avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--chat-surface-elevated);
  border: 1px solid var(--chat-border);
  color: var(--chat-text);
  font-size: 13px;
  font-weight: 700;
}

.chat-session-list__avatar.observed {
  background: var(--chat-surface-muted);
}

.chat-session-list__body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.chat-session-list__topline,
.chat-session-list__subline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-session-list__badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.chat-session-list__topline strong,
.chat-session-list__subline span,
.chat-session-list__body p,
.chat-session-list__topline time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-session-list__topline strong {
  color: var(--chat-text);
  font-size: 14px;
  line-height: 1.35;
}

.chat-session-list__topline time,
.chat-session-list__subline span,
.chat-session-list__body p,
.chat-session-list__more {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
}

.chat-session-list__body p {
  margin: 0;
}

.chat-session-list__agent {
  max-width: 50%;
}

.chat-session-list__state,
.chat-session-list__tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-weight: 600;
}

.chat-session-list__state.live {
  background: rgba(16, 185, 129, 0.12);
  color: #0f8d67;
}

.chat-session-list__state.readonly,
.chat-session-list__state.muted,
.chat-session-list__tag.observed {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

:global(html:not([data-theme='light'])) .chat-session-list__state.live {
  color: #7ef0c3;
}

:global(html:not([data-theme='light'])) .chat-session-list__state.readonly,
:global(html:not([data-theme='light'])) .chat-session-list__state.muted,
:global(html:not([data-theme='light'])) .chat-session-list__tag.observed {
  color: #8db7ff;
}

.chat-session-list__more {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 999px;
  background: transparent;
}

.chat-session-list__inline-menu,
.chat-session-list__context-menu {
  position: absolute;
  z-index: 20;
  display: grid;
  gap: 4px;
  min-width: 140px;
  padding: 8px;
  border: 1px solid var(--chat-border);
  border-radius: 14px;
  background: var(--chat-surface-elevated);
  box-shadow: var(--chat-shadow);
}

.chat-session-list__inline-menu {
  top: calc(100% - 6px);
  right: 4px;
}

.chat-session-list__inline-menu button,
.chat-session-list__context-menu button {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--chat-text);
  padding: 8px 10px;
  border-radius: 10px;
}

.chat-session-list__inline-menu button:hover,
.chat-session-list__context-menu button:hover {
  background: var(--chat-surface-muted);
}

.chat-session-list__inline-menu .danger,
.chat-session-list__context-menu .danger {
  color: #dc2626;
}

.chat-session-list__context-mask {
  position: fixed;
  inset: 0;
  z-index: 1500;
}

.chat-session-list__context-menu {
  position: fixed;
}

.chat-session-list__footer {
  padding-top: 12px;
  border-top: 1px solid var(--chat-border);
}

.chat-session-list__empty {
  color: var(--chat-text-soft);
  font-size: 13px;
}

.chat-session-list__empty-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px dashed var(--chat-border-strong);
  border-radius: 16px;
  background: var(--chat-surface-muted);
}

.chat-session-list__empty-card strong {
  color: var(--chat-text);
}

@media (max-width: 760px) {
  .chat-session-list__header,
  .chat-session-list__topline,
  .chat-session-list__subline,
  .chat-session-list__filter-row {
    align-items: flex-start;
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .chat-session-list__item {
    grid-template-columns: 40px minmax(0, 1fr) 26px;
  }
}
</style>
