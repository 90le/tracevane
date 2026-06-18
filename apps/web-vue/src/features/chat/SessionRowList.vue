<template>
    <div v-if="activeSessions.length" class="chat-shell-session-section">
      <div class="chat-shell-session-divider">
        <span>{{ text('活跃会话', 'Active') }}</span>
        <strong>{{ activeCount }}</strong>
      </div>
      <article
        v-for="session in activeSessions"
        :key="session.key"
        v-memo="sessionRowMemoKey(session)"
        class="chat-shell-session-row"
        :data-session-key="session.key"
        :aria-current="session.key === selectedSessionKey ? 'true' : undefined"
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
              :data-session-rename-key="session.key"
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
          data-session-primary-button="true"
          :class="{ selecting: selectionMode && canManageSession(session) }"
          @click="$emit('session-primary-click', session)"
          @keydown.down.prevent="focusRelativeSession($event, 1)"
          @keydown.up.prevent="focusRelativeSession($event, -1)"
          @keydown.home.prevent="focusSessionListEdge(false)"
          @keydown.end.prevent="focusSessionListEdge(true)"
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
          :aria-label="text('会话操作', 'Session actions')"
          aria-haspopup="menu"
          :aria-expanded="isContextMenuOpenForSession(session) ? 'true' : 'false'"
          :data-session-more-key="session.key"
          :title="text('会话操作', 'Session actions')"
          @click="$emit('toggle-row-menu', $event, session)"
        >
          <MoreHorizontal class="chat-shell-session-more-icon" aria-hidden="true" />
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
        v-memo="sessionRowMemoKey(session)"
        class="chat-shell-session-row"
        :data-session-key="session.key"
        :aria-current="session.key === selectedSessionKey ? 'true' : undefined"
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
              :data-session-rename-key="session.key"
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
          data-session-primary-button="true"
          :class="{ selecting: selectionMode && canManageSession(session) }"
          @click="$emit('session-primary-click', session)"
          @keydown.down.prevent="focusRelativeSession($event, 1)"
          @keydown.up.prevent="focusRelativeSession($event, -1)"
          @keydown.home.prevent="focusSessionListEdge(false)"
          @keydown.end.prevent="focusSessionListEdge(true)"
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
          :aria-label="text('会话操作', 'Session actions')"
          aria-haspopup="menu"
          :aria-expanded="isContextMenuOpenForSession(session) ? 'true' : 'false'"
          :data-session-more-key="session.key"
          :title="text('会话操作', 'Session actions')"
          @click="$emit('toggle-row-menu', $event, session)"
        >
          <MoreHorizontal class="chat-shell-session-more-icon" aria-hidden="true" />
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
        v-memo="sessionRowMemoKey(session, true)"
        class="chat-shell-session-row observed"
        :data-session-key="session.key"
        :aria-current="session.key === selectedSessionKey ? 'true' : undefined"
        :class="{ active: session.key === selectedSessionKey }"
      >
        <button
          type="button"
          class="chat-shell-session-item observed"
          data-session-primary-button="true"
          @click="$emit('select-observed-session', session.key)"
          @keydown.down.prevent="focusRelativeSession($event, 1)"
          @keydown.up.prevent="focusRelativeSession($event, -1)"
          @keydown.home.prevent="focusSessionListEdge(false)"
          @keydown.end.prevent="focusSessionListEdge(true)"
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
import { MoreHorizontal } from '@lucide/vue';
import type { ChatSessionRow } from '../../../../../types/chat';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { useLocalePreference } from '../../shared/locale';
import './session-list-shared.css';

const props = defineProps<{
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

const { locale, text } = useLocalePreference();

function sessionRowMemoKey(session: ChatSessionRow, observed = false): unknown[] {
  const renaming = props.isRenamingSession(session.key);
  const selectable = props.selectionMode && props.canManageSession(session);
  return [
    locale.value,
    observed,
    session.key === props.selectedSessionKey,
    props.isContextMenuOpenForSession(session),
    renaming,
    renaming ? props.sessionRenameDraft : '',
    selectable,
    selectable ? props.isSessionSelected(session.key) : false,
    props.agentNameFor(session),
    props.agentAvatarFor(session),
    props.agentEmojiFor(session),
    props.agentInitialFor(session),
    session.updatedAt,
    session.label,
    session.derivedTitle || '',
    session.lastMessagePreview || '',
    session.presentation.customLabel || '',
    session.presentation.autoLabel || '',
    session.permissions.writable,
    session.runtime.activeRunId || '',
    session.runtime.state || '',
    session.runtime.lastErrorCode || '',
    session.runtime.lastErrorMessage || '',
  ];
}

function sessionSourceLabel(session: ChatSessionRow): string {
  if (session.source.source === 'studio') {
    return text('Tracevane', 'Tracevane');
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

function visibleSessionPrimaryButtons(): HTMLButtonElement[] {
  if (typeof document === 'undefined') {
    return [];
  }
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      '.chat-shell-session-row .chat-shell-session-item[data-session-primary-button="true"]',
    ),
  ).filter((button) => (
    !button.disabled
    && button.offsetParent !== null
  ));
}

function focusSessionButton(button: HTMLButtonElement): void {
  button.focus({ preventScroll: true });
  button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function focusRelativeSession(event: KeyboardEvent, delta: number): void {
  const buttons = visibleSessionPrimaryButtons();
  if (buttons.length < 2) {
    return;
  }
  const currentButton = event.currentTarget instanceof HTMLButtonElement
    ? event.currentTarget
    : null;
  const currentIndex = currentButton ? buttons.indexOf(currentButton) : -1;
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (baseIndex + delta + buttons.length) % buttons.length;
  focusSessionButton(buttons[nextIndex]);
}

function focusSessionListEdge(focusLast: boolean): void {
  const buttons = visibleSessionPrimaryButtons();
  const nextButton = focusLast ? buttons.at(-1) : buttons[0];
  if (nextButton) {
    focusSessionButton(nextButton);
  }
}
</script>
