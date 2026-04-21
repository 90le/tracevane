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
    </header>

    <div v-if="resolvedActiveSession?.handoffContext" class="terminal-session-context">
      <strong>交接上下文</strong>
      <div>来源模块：{{ resolvedActiveSession.handoffContext.fromModule || 'unknown' }}</div>
      <div>来源路由：{{ resolvedActiveSession.handoffContext.fromRoute || 'unknown' }}</div>
      <div>触发动作：{{ resolvedActiveSession.handoffContext.triggerLabel || 'unknown' }}</div>
      <div>目标对象：{{ resolvedActiveSession.handoffContext.targetEntity || 'unknown' }}</div>
      <div>推荐命令：{{ resolvedActiveSession.handoffContext.recommendedCommand || 'unknown' }}</div>
    </div>

    <TerminalConsolePage
      :session-id="resolvedActiveSession?.sessionId || ''"
      :queued-command="props.queuedCommand"
      :show-toolbar="false"
      :embedded="true"
      @consume-queued-command="emit('consumeQueuedCommand')"
      @session-attached="emit('sessionAttached', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import TerminalConsolePage from './TerminalConsolePage.vue';
import TerminalTabRail from './TerminalTabRail.vue';
import { fetchPersistedTerminalSessionDescriptor } from './api';
import type { TerminalSessionDescriptor } from './terminal-session-registry';

const props = defineProps<{
  tabs: TerminalSessionDescriptor[];
  activeSessionId: string | null;
  activeSession: TerminalSessionDescriptor | null;
  headerControls: {
    canLaunch: (cli: 'claude' | 'codex' | 'opencode' | 'bash') => boolean;
    launchCli: (cli: 'claude' | 'codex' | 'opencode' | 'bash') => void;
  };
  queuedCommand: string;
}>();

const emit = defineEmits<{
  (e: 'selectSession', sessionId: string): void;
  (e: 'closeSession', sessionId: string): void;
  (e: 'createSession'): void;
  (e: 'renameSession', payload: { sessionId: string; title: string }): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
  (e: 'consumeQueuedCommand'): void;
  (e: 'sessionAttached', session: TerminalSessionDescriptor): void;
}>();

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

</script>
