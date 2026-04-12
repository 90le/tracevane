<template>
  <nav class="terminal-tab-rail" aria-label="Terminal sessions">
    <div
      v-for="tab in tabs"
      :key="tab.sessionId"
      class="terminal-tab"
      :class="{ active: tab.sessionId === activeSessionId }"
    >
      <button type="button" class="terminal-tab-select" @click="$emit('select', tab.sessionId)">
        <span class="terminal-tab-title">{{ tab.title || tab.sessionId }}</span>
        <span class="terminal-tab-status" :data-tone="buildTerminalSessionStatusSummary({
          status: tab.status,
          controlState: tab.controlState,
          canResume: tab.canResume,
        }).tone">
          {{ buildTerminalSessionStatusSummary({
            status: tab.status,
            controlState: tab.controlState,
            canResume: tab.canResume,
          }).labelZh }}
        </span>
      </button>
      <button
        type="button"
        class="terminal-tab-close"
        aria-label="Close tab"
        @click="$emit('close', tab.sessionId)"
      >
        ×
      </button>
    </div>

    <button type="button" class="terminal-tab terminal-tab-add" @click="$emit('create')">
      +
    </button>
  </nav>
</template>

<script setup lang="ts">
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import { buildTerminalSessionStatusSummary } from './terminal-session-selectors';

defineProps<{
  tabs: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

defineEmits<{
  (e: 'select', sessionId: string): void;
  (e: 'close', sessionId: string): void;
  (e: 'create'): void;
}>();
</script>
