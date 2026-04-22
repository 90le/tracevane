<template>
  <section class="terminal-session-pane" data-testid="terminal-session-pane">
    <header class="terminal-stage-header">
      <div class="terminal-stage-header-main">
        <TerminalTabRail
          :tabs="props.tabs"
          :active-session-id="props.activeSessionId"
          @select="emit('selectSession', $event)"
          @close="emit('closeSession', $event)"
          @rename="emit('renameSession', $event)"
          @end="emit('endSession', $event)"
          @delete="emit('deleteSession', $event)"
          @create="emit('createSession')"
        />
      </div>
      <div class="terminal-stage-header-actions">
        <button
          type="button"
          class="secondary-button compact-button terminal-stage-action terminal-stage-action--focus"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="focusTerminal"
        >
          {{ text('聚焦', 'Focus') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button terminal-stage-action terminal-stage-action--control"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="sendShortcut('c')"
        >
          Ctrl+C
        </button>
        <button
          type="button"
          class="secondary-button compact-button terminal-stage-action terminal-stage-action--control"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="sendShortcut('l')"
        >
          Ctrl+L
        </button>
        <button
          type="button"
          class="secondary-button compact-button terminal-stage-action terminal-stage-action--control"
          :disabled="!resolvedActiveSession?.sessionId"
          :title="text('发送 EOF / 结束输入', 'Send EOF / end input')"
          @click="sendShortcut('d')"
        >
          Ctrl+D
        </button>
        <details class="terminal-shortcut-menu">
          <summary class="secondary-button compact-button terminal-stage-action terminal-stage-action--menu">
            {{ text('快捷键', 'Keys') }}
          </summary>
          <div class="terminal-shortcut-menu__panel">
            <button type="button" :disabled="!resolvedActiveSession?.sessionId" @click="sendShortcut('z')">Ctrl+Z</button>
            <button type="button" :disabled="!resolvedActiveSession?.sessionId" @click="sendShortcut('u')">Ctrl+U</button>
            <button type="button" :disabled="!resolvedActiveSession?.sessionId" @click="sendShortcut('k')">Ctrl+K</button>
            <button type="button" :disabled="!resolvedActiveSession?.sessionId" @click="sendShortcut('a')">Ctrl+A</button>
            <button type="button" :disabled="!resolvedActiveSession?.sessionId" @click="sendShortcut('e')">Ctrl+E</button>
            <button type="button" :disabled="!resolvedActiveSession?.sessionId" @click="pasteClipboard">
              {{ text('粘贴', 'Paste') }}
            </button>
          </div>
        </details>
        <button
          type="button"
          class="secondary-button compact-button terminal-stage-action terminal-stage-action--clear"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="clearTerminal"
        >
          {{ text('清屏', 'Clear') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button terminal-stage-action terminal-stage-action--danger"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="endActiveSession"
        >
          {{ text('强制结束', 'Force End') }}
        </button>
      </div>
    </header>

    <div v-if="resolvedActiveSession?.handoffContext" class="terminal-session-context">
      <strong>{{ text('交接上下文', 'Handoff Context') }}</strong>
      <div>{{ text('来源模块', 'Source Module') }}：{{ resolvedActiveSession.handoffContext.fromModule || text('未知', 'Unknown') }}</div>
      <div>{{ text('来源路由', 'Source Route') }}：{{ resolvedActiveSession.handoffContext.fromRoute || text('未知', 'Unknown') }}</div>
      <div>{{ text('触发动作', 'Trigger') }}：{{ resolvedActiveSession.handoffContext.triggerLabel || text('未知', 'Unknown') }}</div>
      <div>{{ text('目标对象', 'Target') }}：{{ resolvedActiveSession.handoffContext.targetEntity || text('未知', 'Unknown') }}</div>
      <div>{{ text('推荐命令', 'Suggested Command') }}：{{ resolvedActiveSession.handoffContext.recommendedCommand || text('未知', 'Unknown') }}</div>
    </div>

    <TerminalConsolePage
      ref="consolePage"
      :session-id="resolvedActiveSession?.sessionId || ''"
      :queued-command="props.queuedCommand"
      :show-toolbar="false"
      :embedded="true"
      :restore-transcript="shouldRestoreTranscript"
      @consume-queued-command="emit('consumeQueuedCommand', resolvedActiveSession?.sessionId || '')"
      @session-attached="emit('sessionAttached', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import TerminalConsolePage from './TerminalConsolePage.vue';
import TerminalTabRail from './TerminalTabRail.vue';
import { fetchPersistedTerminalSessionDescriptor } from './api';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import type { TerminalQueuedCommand } from './terminal-workspace-state';

const props = defineProps<{
  tabs: TerminalSessionDescriptor[];
  activeSessionId: string | null;
  activeSession: TerminalSessionDescriptor | null;
  queuedCommand: TerminalQueuedCommand | null;
}>();

const emit = defineEmits<{
  (e: 'selectSession', sessionId: string): void;
  (e: 'closeSession', sessionId: string): void;
  (e: 'createSession'): void;
  (e: 'renameSession', payload: { sessionId: string; title: string }): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
  (e: 'consumeQueuedCommand', sessionId: string): void;
  (e: 'sessionAttached', session: TerminalSessionDescriptor): void;
}>();
const { text } = useLocalePreference();
const consolePage = ref<null | {
  clearTerminal: () => void;
  focusTerminal: () => void;
  sendTerminalShortcut: (key: string) => boolean;
  pasteClipboard: () => Promise<boolean>;
}>(null);

const activeSession = ref<TerminalSessionDescriptor | null>(null);
const resolvedActiveSession = computed(() => props.activeSession ?? activeSession.value);
const shouldRestoreTranscript = computed(() => {
  const session = resolvedActiveSession.value;
  if (!session) return false;
  return session.status !== 'running' || Boolean(session.recentOutputSummary?.tailText);
});
let descriptorRequestSeq = 0;

watch(
  () => [props.activeSessionId, props.activeSession?.sessionId || ''] as const,
  ([sessionId, providedSessionId]) => {
    const normalized = String(sessionId || '').trim();
    const requestSeq = ++descriptorRequestSeq;
    if (!normalized) {
      activeSession.value = null;
      return;
    }
    if (providedSessionId === normalized) {
      activeSession.value = null;
      return;
    }

    void fetchPersistedTerminalSessionDescriptor(normalized)
      .then((descriptor) => {
        if (requestSeq !== descriptorRequestSeq) {
          return;
        }
        activeSession.value = descriptor || null;
      })
      .catch(() => {
        if (requestSeq !== descriptorRequestSeq) {
          return;
        }
        activeSession.value = null;
      });
  },
  { immediate: true },
);

function focusTerminal(): void {
  consolePage.value?.focusTerminal();
}

function clearTerminal(): void {
  consolePage.value?.clearTerminal();
}

function sendShortcut(key: string): void {
  consolePage.value?.sendTerminalShortcut(key);
}

function pasteClipboard(): void {
  void consolePage.value?.pasteClipboard();
}

function endActiveSession(): void {
  const sessionId = String(resolvedActiveSession.value?.sessionId || '').trim();
  if (!sessionId) return;
  emit('endSession', sessionId);
}

</script>
