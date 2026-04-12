<template>
  <section class="terminal-session-pane" data-testid="terminal-session-pane">
    <TerminalConsolePage :key="sessionRouteKey" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TerminalConsolePage from './TerminalConsolePage.vue';

const props = defineProps<{
  activeSessionId: string | null;
}>();

const sessionRouteKey = computed(() => {
  const sessionId = String(props.activeSessionId || '').trim();
  return sessionId ? `terminal-session:${sessionId}` : 'terminal-session:default';
});
</script>
