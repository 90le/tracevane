<template>
    <div v-if="activeSessions.length" class="chat-shell-session-section">
      <div class="chat-shell-session-divider">
        <span>{{ text('活跃会话', 'Active') }}</span>
        <strong>{{ activeCount }}</strong>
      </div>
      <article
        v-for="session in activeSessions"
        :key="session.key"
        class="chat-shell-session-row"
        :class="{
          active: session.key === selectedSessionKey,
          'menu-open': isContextMenuOpenForSession(session),
          renaming: isRenamingSession(session.key),
          selecting: selectionMode && canManageSession(session),
        }"
        @contextmenu="$emit('open-row-context-menu', $event, session)"
      >
        <form
          v-if="isRenamingSession(session.key)"
          class="chat-shell-session-item chat-shell-session-item--rename"
          @submit.prevent="$emit('submit-session-rename')"
        >
          <div class="chat-shell-session-avatar" aria-hidden="true">
            <AgentAvatarContent
              :avatar="agentAvatarFor(session)"
              :emoji="agentEmojiFor(session)"
              :fallback="agentInitialFor(session)"
              :alt="agentNameFor(session)"
            />
          </div>
          <div class="chat-shell-session-content">
            <input
              :value="sessionRenameDraft"
              class="chat-shell-session-field"
              type="text"
              :placeholder="text('输入新的会话标题', 'Enter a new chat title')"
              @input="$emit('update:session-rename-draft', ($event.target as HTMLInputElement).value)"
              @keydown.escape.prevent="$emit('cancel-session-rename')"
            />
            <div class="chat-shell-folder-rename-form__actions">
              <button
                type="submit"
                class="secondary-button compact-button"
                :disabled="!sessionRenameDraft.trim()"
              >
                {{ text('保存', 'Save') }}
              </button>
              <button type="button" class="chat-shell-link-button" @click="$emit('cancel-session-rename')">
                {{ text('取消', 'Cancel') }}
              </button>
            </div>
          </div>
        </form>

        <button
          v-else
          type="button"
          class="chat-shell-session-item"
          :class="{ selecting: selectionMode && canManageSession(session) }"
          @click="$emit('session-primary-click', session)"
        >
          <label
            v-if="selectionMode && canManageSession(session)"
            class="chat-shell-session-check"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="isSessionSelected(session.key)"
              @change="$emit('toggle-session-selection', session.key)"
            />
          </label>
          <div class="chat-shell-session-avatar" aria-hidden="true">
            <AgentAvatarContent
              :avatar="agentAvatarFor(session)"
              :emoji="agentEmojiFor(session)"
              :fallback="agentInitialFor(session)"
              :alt="agentNameFor(session)"
            />
          </div>
          <div class="chat-shell-session-content">
            <div class="chat-shell-session-topline">
              <strong>{{ sessionTitle(session) }}</strong>
              <time class="chat-shell-session-time">{{ formatDate(session.updatedAt) }}</time>
            </div>
            <div class="chat-shell-session-subline">
              <span class="chat-shell-session-agent">{{ agentNameFor(session) }}</span>
              <span class="chat-shell-session-source">{{ sessionSourceLabel(session) }}</span>
              <span class="chat-shell-session-state" :class="sessionStateTone(session)">{{ sessionStateLabel(session) }}</span>
            </div>
            <div class="chat-shell-session-preview-line" :class="`tone-${sessionPreviewTone(session)}`">
              <span class="chat-shell-session-preview-badge" :class="`tone-${sessionPreviewTone(session)}`">
                {{ sessionPreviewBadge(session) }}
              </span>
              <p class="chat-shell-session-preview-text">{{ sessionPreview(session) }}</p>
            </div>
          </div>
        </button>

        <button
          v-if="!isRenamingSession(session.key)"
          type="button"
          class="chat-shell-session-more"
          :class="{ active: isContextMenuOpenForSession(session) }"
          :title="text('会话操作', 'Session actions')"
          @click="$emit('toggle-row-menu', $event, session)"
        >
          ⋯
        </button>
      </article>
      <button
        v-if="activeHiddenCount > 0"
        type="button"
        class="chat-shell-session-show-more"
        @click="$emit('show-more', 'active')"
      >
        {{ text(`显示更多（还有 ${activeHiddenCount} 个）`, `Show ${activeHiddenCount} more`) }}
      </button>
    </div>

    <div v-if="archiveViewOpen && archivedSessions.length" class="chat-shell-session-section">
      <div class="chat-shell-session-divider">
        <span>{{ text('归档会话', 'Archived') }}</span>
        <strong>{{ archivedCount }}</strong>
      </div>
      <article
        v-for="session in archivedSessions"
        :key="session.key"
        class="chat-shell-session-row"
        :class="{
          active: session.key === selectedSessionKey,
          'menu-open': isContextMenuOpenForSession(session),
          renaming: isRenamingSession(session.key),
          selecting: selectionMode && canManageSession(session),
        }"
        @contextmenu="$emit('open-row-context-menu', $event, session)"
      >
        <form
          v-if="isRenamingSession(session.key)"
          class="chat-shell-session-item chat-shell-session-item--rename"
          @submit.prevent="$emit('submit-session-rename')"
        >
          <div class="chat-shell-session-avatar" aria-hidden="true">
            <AgentAvatarContent
              :avatar="agentAvatarFor(session)"
              :emoji="agentEmojiFor(session)"
              :fallback="agentInitialFor(session)"
              :alt="agentNameFor(session)"
            />
          </div>
          <div class="chat-shell-session-content">
            <input
              :value="sessionRenameDraft"
              class="chat-shell-session-field"
              type="text"
              :placeholder="text('输入新的会话标题', 'Enter a new chat title')"
              @input="$emit('update:session-rename-draft', ($event.target as HTMLInputElement).value)"
              @keydown.escape.prevent="$emit('cancel-session-rename')"
            />
            <div class="chat-shell-folder-rename-form__actions">
              <button
                type="submit"
                class="secondary-button compact-button"
                :disabled="!sessionRenameDraft.trim()"
              >
                {{ text('保存', 'Save') }}
              </button>
              <button type="button" class="chat-shell-link-button" @click="$emit('cancel-session-rename')">
                {{ text('取消', 'Cancel') }}
              </button>
            </div>
          </div>
        </form>

        <button
          v-else
          type="button"
          class="chat-shell-session-item"
          :class="{ selecting: selectionMode && canManageSession(session) }"
          @click="$emit('session-primary-click', session)"
        >
          <label
            v-if="selectionMode && canManageSession(session)"
            class="chat-shell-session-check"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="isSessionSelected(session.key)"
              @change="$emit('toggle-session-selection', session.key)"
            />
          </label>
          <div class="chat-shell-session-avatar" aria-hidden="true">
            <AgentAvatarContent
              :avatar="agentAvatarFor(session)"
              :emoji="agentEmojiFor(session)"
              :fallback="agentInitialFor(session)"
              :alt="agentNameFor(session)"
            />
          </div>
          <div class="chat-shell-session-content">
            <div class="chat-shell-session-topline">
              <strong>{{ sessionTitle(session) }}</strong>
              <time class="chat-shell-session-time">{{ formatDate(session.updatedAt) }}</time>
            </div>
            <div class="chat-shell-session-subline">
              <span class="chat-shell-session-agent">{{ agentNameFor(session) }}</span>
              <span class="chat-shell-session-source">{{ sessionSourceLabel(session) }}</span>
              <span class="chat-shell-session-state" :class="sessionStateTone(session)">{{ sessionStateLabel(session) }}</span>
            </div>
            <div class="chat-shell-session-preview-line" :class="`tone-${sessionPreviewTone(session)}`">
              <span class="chat-shell-session-preview-badge" :class="`tone-${sessionPreviewTone(session)}`">
                {{ sessionPreviewBadge(session) }}
              </span>
              <p class="chat-shell-session-preview-text">{{ sessionPreview(session) }}</p>
            </div>
          </div>
        </button>

        <button
          v-if="!isRenamingSession(session.key)"
          type="button"
          class="chat-shell-session-more"
          :class="{ active: isContextMenuOpenForSession(session) }"
          :title="text('会话操作', 'Session actions')"
          @click="$emit('toggle-row-menu', $event, session)"
        >
          ⋯
        </button>
      </article>
      <button
        v-if="archivedHiddenCount > 0"
        type="button"
        class="chat-shell-session-show-more"
        @click="$emit('show-more', 'archived')"
      >
        {{ text(`显示更多（还有 ${archivedHiddenCount} 个）`, `Show ${archivedHiddenCount} more`) }}
      </button>
    </div>

    <div v-if="showObserved && observedSessions.length" class="chat-shell-observed-section">
      <div class="chat-shell-session-divider">
        <span>{{ text('只读观察', 'Observed') }}</span>
        <strong>{{ observedCount }}</strong>
      </div>
      <article
        v-for="session in observedSessions"
        :key="session.key"
        class="chat-shell-session-row observed"
        :class="{ active: session.key === selectedSessionKey }"
      >
        <button
          type="button"
          class="chat-shell-session-item observed"
          @click="$emit('select-observed-session', session.key)"
        >
          <div class="chat-shell-session-avatar observed" aria-hidden="true">
            <AgentAvatarContent
              :avatar="agentAvatarFor(session)"
              :emoji="agentEmojiFor(session)"
              :fallback="agentInitialFor(session)"
              :alt="agentNameFor(session)"
            />
          </div>
          <div class="chat-shell-session-content">
            <div class="chat-shell-session-topline">
              <strong>{{ sessionTitle(session) }}</strong>
              <time class="chat-shell-session-time">{{ formatDate(session.updatedAt) }}</time>
            </div>
            <div class="chat-shell-session-subline">
              <span class="chat-shell-session-agent">{{ agentNameFor(session) }}</span>
              <span class="chat-shell-session-source">{{ sessionSourceLabel(session) }}</span>
              <span class="chat-shell-session-state readonly">{{ text('只读', 'Read-only') }}</span>
            </div>
            <div class="chat-shell-session-preview-line" :class="`tone-${sessionPreviewTone(session, true)}`">
              <span class="chat-shell-session-preview-badge" :class="`tone-${sessionPreviewTone(session, true)}`">
                {{ sessionPreviewBadge(session, true) }}
              </span>
              <p class="chat-shell-session-preview-text">{{ sessionPreview(session, true) }}</p>
            </div>
          </div>
        </button>
      </article>
      <button
        v-if="observedHiddenCount > 0"
        type="button"
        class="chat-shell-session-show-more"
        @click="$emit('show-more', 'observed')"
      >
        {{ text(`显示更多（还有 ${observedHiddenCount} 个）`, `Show ${observedHiddenCount} more`) }}
      </button>
    </div>
</template>

<script setup lang="ts">
import type { ChatSessionRow } from '../../../../../types/chat';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  activeSessions: ChatSessionRow[];
  archivedSessions: ChatSessionRow[];
  observedSessions: ChatSessionRow[];
  activeCount: number;
  archivedCount: number;
  observedCount: number;
  activeHiddenCount: number;
  archivedHiddenCount: number;
  observedHiddenCount: number;
  archiveViewOpen: boolean;
  showObserved: boolean;
  selectionMode: boolean;
  selectedSessionKey: string;
  sessionRenameDraft: string;
  canManageSession: (session: ChatSessionRow) => boolean;
  isSessionSelected: (sessionKey: string) => boolean;
  isContextMenuOpenForSession: (session: ChatSessionRow) => boolean;
  isRenamingSession: (sessionKey: string) => boolean;
  agentAvatarFor: (session: ChatSessionRow) => string;
  agentEmojiFor: (session: ChatSessionRow) => string;
  agentInitialFor: (session: ChatSessionRow) => string;
  agentNameFor: (session: ChatSessionRow) => string;
  sessionTitle: (session: ChatSessionRow) => string;
  sessionPreview: (session: ChatSessionRow, observed?: boolean) => string;
  formatDate: (value: string | null) => string;
  sessionStateTone: (session: ChatSessionRow) => string;
  sessionStateLabel: (session: ChatSessionRow) => string;
}>();

defineEmits<{
  (event: 'open-row-context-menu', mouseEvent: MouseEvent, session: ChatSessionRow): void;
  (event: 'toggle-row-menu', mouseEvent: MouseEvent, session: ChatSessionRow): void;
  (event: 'session-primary-click', session: ChatSessionRow): void;
  (event: 'toggle-session-selection', sessionKey: string): void;
  (event: 'update:session-rename-draft', value: string): void;
  (event: 'cancel-session-rename'): void;
  (event: 'submit-session-rename'): void;
  (event: 'show-more', section: 'active' | 'archived' | 'observed'): void;
  (event: 'select-observed-session', sessionKey: string): void;
}>();

const { text } = useLocalePreference();

function sessionSourceLabel(session: ChatSessionRow): string {
  if (session.source.source === 'studio') {
    return text('Studio', 'Studio');
  }
  if (session.source.source === 'system') {
    return text('系统', 'System');
  }
  const channel = String(session.source.channel || '').trim();
  if (channel) {
    return text(`外部 · ${channel}`, `External · ${channel}`);
  }
  return text('外部', 'External');
}

function sessionPreviewTone(session: ChatSessionRow, observed = false): 'running' | 'error' | 'observed' | 'readonly' | 'empty' | 'live' {
  if (observed) {
    return 'observed';
  }
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
  if (session.runtime.state === 'error') {
    return 'error';
  }
  if (!session.lastMessagePreview) {
    return 'empty';
  }
  return 'live';
}

function sessionPreviewBadge(session: ChatSessionRow, observed = false): string {
  const tone = sessionPreviewTone(session, observed);
  if (tone === 'running') {
    return text('进行中', 'Running');
  }
  if (tone === 'error') {
    return text('异常', 'Issue');
  }
  if (tone === 'observed') {
    return text('观察', 'Observe');
  }
  if (tone === 'readonly') {
    return text('只读', 'Read-only');
  }
  if (tone === 'empty') {
    return text('新建', 'New');
  }
  return text('最近', 'Latest');
}
</script>

<style scoped>
.chat-shell-session-section,
.chat-shell-observed-section {
  display: grid;
  gap: 8px;
}

.chat-shell-session-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--chat-line) 84%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-sidebar-row) 97%, white 3%), color-mix(in srgb, var(--chat-sidebar-row) 100%, transparent));
  box-shadow:
    0 10px 20px rgba(15, 23, 42, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  overflow: hidden;
  backdrop-filter: blur(12px);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.chat-shell-session-row::before {
  content: '';
  position: absolute;
  inset: 10px auto 10px 0;
  width: 3px;
  border-radius: 999px;
  background: transparent;
  transition: background 0.18s ease, opacity 0.18s ease;
}

.chat-shell-session-row:hover {
  background: var(--chat-sidebar-row-hover);
  border-color: var(--chat-line);
  transform: translateY(-1px);
}

.chat-shell-session-row.active,
.chat-shell-session-row.menu-open,
.chat-shell-session-row.renaming {
  background: color-mix(in srgb, var(--chat-sidebar-row-active) 84%, var(--chat-sidebar-row));
  border-color: color-mix(in srgb, var(--chat-accent) 18%, var(--chat-line));
  box-shadow:
    0 14px 26px rgba(37, 99, 235, 0.13),
    inset 0 0 0 1px color-mix(in srgb, var(--chat-accent) 18%, transparent);
}

.chat-shell-session-row.active::before,
.chat-shell-session-row.menu-open::before,
.chat-shell-session-row.renaming::before {
  background: color-mix(in srgb, var(--chat-accent) 82%, white 18%);
}

.chat-shell-session-item {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px 48px 12px 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.chat-shell-session-item--rename {
  width: 100%;
  padding-right: 46px;
  cursor: default;
}

.chat-shell-session-item--rename .chat-shell-session-content {
  gap: 8px;
}

.chat-shell-session-item.selecting {
  grid-template-columns: 24px 40px minmax(0, 1fr);
}

.chat-shell-session-item.observed {
  width: 100%;
}

.chat-shell-session-item:hover {
  background: color-mix(in srgb, var(--chat-hover) 54%, transparent);
}

.chat-shell-session-check {
  display: grid;
  place-items: center;
}

.chat-shell-session-check input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.chat-shell-session-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--chat-avatar-bg);
  color: var(--chat-avatar-text);
  font-weight: 700;
  font-size: 13px;
}

.chat-shell-session-avatar.observed {
  background: var(--chat-muted-chip);
  color: var(--chat-text-soft);
}

.chat-shell-session-content {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.chat-shell-session-topline,
.chat-shell-session-subline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chat-shell-session-subline {
  flex-wrap: wrap;
  row-gap: 6px;
}

.chat-shell-session-topline strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chat-text);
  font-size: 14px;
  line-height: 1.32;
}

.chat-shell-session-time {
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  min-height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-muted-chip) 80%, transparent);
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  flex-shrink: 0;
}

.chat-shell-session-topline time,
.chat-shell-session-subline,
.chat-shell-session-preview-text {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.chat-shell-session-topline time {
  margin-left: auto;
  flex-shrink: 0;
}

.chat-shell-session-agent {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  max-width: min(14rem, 100%);
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-muted-chip) 72%, transparent);
  color: var(--chat-text);
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-shell-session-source {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  max-width: min(12rem, 100%);
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-hover) 70%, transparent 30%);
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-shell-session-state {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-muted-chip) 72%, transparent);
  color: var(--chat-text-soft);
  font-weight: 600;
  white-space: nowrap;
}

.chat-shell-session-state.live {
  background: color-mix(in srgb, var(--chat-success) 16%, transparent);
  color: var(--chat-success);
}

.chat-shell-session-state.running {
  background: color-mix(in srgb, var(--chat-accent) 16%, transparent);
  color: var(--chat-accent);
}

.chat-shell-session-state.readonly {
  color: var(--chat-text-soft);
}

.chat-shell-session-preview-line {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.chat-shell-session-preview-badge {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--chat-line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-muted-chip) 84%, transparent);
  color: var(--chat-text-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.chat-shell-session-preview-badge.tone-running {
  border-color: color-mix(in srgb, var(--chat-accent) 28%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 12%, transparent);
  color: var(--chat-accent);
}

.chat-shell-session-preview-badge.tone-error {
  border-color: color-mix(in srgb, #ef4444 36%, var(--chat-line));
  background: color-mix(in srgb, #ef4444 10%, transparent);
  color: #d9475c;
}

.chat-shell-session-preview-badge.tone-observed,
.chat-shell-session-preview-badge.tone-readonly {
  background: color-mix(in srgb, var(--chat-muted-chip) 92%, transparent);
}

.chat-shell-session-preview-text {
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chat-shell-session-show-more {
  min-height: 36px;
  margin: 6px 8px 0;
  border: 1px solid color-mix(in srgb, var(--chat-line) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-sidebar-row) 92%, transparent 8%);
  color: var(--chat-text-soft);
  font: inherit;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.chat-shell-session-show-more:hover {
  background: var(--chat-sidebar-row-hover);
  color: var(--chat-text);
  transform: translateY(-1px);
}

@media (max-width: 1040px) {
  .chat-shell-session-row {
    backdrop-filter: none;
    box-shadow:
      0 8px 16px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .chat-shell-session-item {
    padding: 11px 44px 11px 11px;
  }

  .chat-shell-session-time,
  .chat-shell-session-agent,
  .chat-shell-session-source,
  .chat-shell-session-state {
    min-height: 20px;
    padding-inline: 7px;
    font-size: 10px;
  }

  .chat-shell-session-preview-line {
    gap: 6px;
  }
}
</style>
