<template>
  <section class="terminal-workspace-shell" data-testid="terminal-workspace-shell">
    <TerminalConsolePage :key="sessionRouteKey" />
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import TerminalConsolePage from './TerminalConsolePage.vue';
import './terminal-workspace.css';

const route = useRoute();

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';

const sessionRouteKey = computed(() => {
  const sessionId = typeof route.params.sessionId === 'string'
    ? route.params.sessionId.trim()
    : '';
  return sessionId ? `terminal-session:${sessionId}` : 'terminal-session:default';
});

watch(
  () => route.params.sessionId,
  (sessionId) => {
    if (typeof window === 'undefined') return;
    if (typeof sessionId !== 'string') return;
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) return;

    try {
      sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, normalizedSessionId);
    } catch {
      // ignore storage errors
    }
  },
  { immediate: true },
);
</script>
