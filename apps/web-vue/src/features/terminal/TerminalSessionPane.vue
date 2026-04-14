<template>
  <section class="terminal-session-pane" data-testid="terminal-session-pane">
    <div v-if="activeSession?.handoffContext" class="terminal-session-context">
      <strong>交接上下文</strong>
      <div>来源模块：{{ activeSession.handoffContext.fromModule || 'unknown' }}</div>
      <div>来源路由：{{ activeSession.handoffContext.fromRoute || 'unknown' }}</div>
      <div>触发动作：{{ activeSession.handoffContext.triggerLabel || 'unknown' }}</div>
      <div>目标对象：{{ activeSession.handoffContext.targetEntity || 'unknown' }}</div>
      <div>推荐命令：{{ activeSession.handoffContext.recommendedCommand || 'unknown' }}</div>
    </div>

    <div
      v-if="recentOutputSummaryLabel && activeSession?.recentOutputSummary?.tailText"
      class="terminal-session-context"
      :data-tone="activeSession?.status === 'failed' ? 'warning' : 'muted'"
    >
      <strong>{{ recentOutputSummaryLabel }}</strong>
      <pre>{{ activeSession.recentOutputSummary.tailText }}</pre>
      <div v-if="activeSession.recentOutputSummary.lastError">最近错误：{{ activeSession.recentOutputSummary.lastError }}</div>
      <div v-if="activeSession.recentOutputSummary.lastCommandHint">最近命令：{{ activeSession.recentOutputSummary.lastCommandHint }}</div>
      <div v-if="activeSession.recentOutputSummary.exitSummary">退出摘要：{{ activeSession.recentOutputSummary.exitSummary }}</div>
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
  if (!activeSession.value?.recentOutputSummary?.tailText) return null;
  if (activeSession.value.status === 'completed') return '最近输出（已完成）';
  if (activeSession.value.status === 'failed') return '最近输出（失败）';
  return '最近输出';
});
</script>
