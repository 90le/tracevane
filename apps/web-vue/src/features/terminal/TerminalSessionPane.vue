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
          class="secondary-button compact-button"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="focusTerminal"
        >
          {{ text('聚焦', 'Focus') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="sendShortcut('c')"
        >
          Ctrl+C
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="sendShortcut('l')"
        >
          Ctrl+L
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="!resolvedActiveSession?.sessionId"
          @click="clearTerminal"
        >
          {{ text('清屏', 'Clear') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
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
}>(null);

const activeSession = ref<TerminalSessionDescriptor | null>(null);
const resolvedActiveSession = computed(() => props.activeSession ?? activeSession.value);
let descriptorRequestSeq = 0;

watch(
  () => props.activeSessionId,
  (sessionId) => {
    const normalized = String(sessionId || '').trim();
    const requestSeq = ++descriptorRequestSeq;
    if (!normalized) {
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

function endActiveSession(): void {
  const sessionId = String(resolvedActiveSession.value?.sessionId || '').trim();
  if (!sessionId) return;
  emit('endSession', sessionId);
}

</script>
