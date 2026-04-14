<template>
  <aside class="terminal-recent-rail" aria-label="Recent terminal sessions">
    <h3>最近会话</h3>
    <ul>
      <li v-for="session in sessions" :key="session.sessionId">
        <button
          type="button"
          class="terminal-recent-item"
          :class="{ active: session.sessionId === activeSessionId }"
          @click="$emit('select', session.sessionId)"
        >
          <span class="terminal-recent-title">{{ session.title || session.sessionId }}</span>
          <span class="terminal-recent-meta">
            {{ buildTerminalSessionStatusSummary({
              status: session.status,
              controlState: session.controlState,
              canResume: session.canResume,
            }).labelZh }}
            ·
            {{ buildTerminalTakeoverSummary({ controlState: session.controlState }).labelZh }}
          </span>
          <span
            v-if="session.handoffContext?.triggerLabel || session.handoffContext?.fromModule"
            class="terminal-recent-extra"
          >
            交接：{{ session.handoffContext?.triggerLabel || session.handoffContext?.fromModule }}
          </span>
          <span
            v-if="session.recentOutputSummary?.tailText"
            class="terminal-recent-extra"
          >
            {{ session.status === 'completed' ? '最近输出（已完成）' : (session.status === 'failed' ? '最近输出（失败）' : '最近输出') }}
          </span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import {
  buildTerminalSessionStatusSummary,
  buildTerminalTakeoverSummary,
} from './terminal-session-selectors';

defineProps<{
  sessions: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

defineEmits<{
  (e: 'select', sessionId: string): void;
}>();
</script>
