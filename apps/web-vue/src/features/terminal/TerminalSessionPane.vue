<template>
  <section class="terminal-session-pane" data-testid="terminal-session-pane">
    <div v-if="activeSession?.handoffContext" class="terminal-session-context">
      <strong>交接上下文</strong>
      <div>
        来源：{{ activeSession.handoffContext.fromClientId || 'unknown' }}
        → 目标：{{ activeSession.handoffContext.toClientId || 'unknown' }}
      </div>
      <div>原因：{{ activeSession.handoffContext.reason || 'unknown' }}</div>
    </div>

    <div
      v-if="recentOutputSummaryLabel && activeSession?.recentOutputSummary?.sample"
      class="terminal-session-context"
      :data-tone="activeSession?.status === 'failed' ? 'warning' : 'muted'"
    >
      <strong>{{ recentOutputSummaryLabel }}</strong>
      <pre>{{ activeSession.recentOutputSummary.sample }}</pre>
    </div>

    <TerminalConsolePage :key="sessionRouteKey" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import TerminalConsolePage from './TerminalConsolePage.vue';
import { fetchPersistedTerminalSessionDescriptor } from './api';
import type { TerminalSessionDescriptor } from './terminal-session-registry';

const props = defineProps<{
  activeSessionId: string | null;
}>();

const sessionRouteKey = computed(() => {
  const sessionId = String(props.activeSessionId || '').trim();
  return sessionId ? `terminal-session:${sessionId}` : 'terminal-session:default';
});

const activeSession = ref<TerminalSessionDescriptor | null>(null);
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

const recentOutputSummaryLabel = computed(() => {
  if (!activeSession.value?.recentOutputSummary?.sample) return null;
  if (activeSession.value.status === 'completed') return '最近输出（已完成）';
  if (activeSession.value.status === 'failed') return '最近输出（失败）';
  return '最近输出';
});
</script>
