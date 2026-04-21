<template>
  <aside class="terminal-session-explorer" aria-label="Terminal session explorer">
    <section class="terminal-session-group">
      <h3>Open</h3>
      <ul>
        <li v-for="session in openSessions" :key="session.sessionId">
          <div class="terminal-session-item-row">
            <button
              type="button"
              class="terminal-session-item"
              :class="{ active: session.sessionId === activeSessionId }"
              @click="$emit('select', session.sessionId)"
            >
              <span class="terminal-session-item__title">{{ session.title }}</span>
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('renameSession', session.sessionId)"
            >
              重命名
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('endSession', session.sessionId)"
            >
              结束
            </button>
          </div>
        </li>
      </ul>
    </section>
    <section class="terminal-session-group">
      <h3>Recent</h3>
      <ul>
        <li v-for="session in recentSessions" :key="session.sessionId">
          <div class="terminal-session-item-row">
            <button
              type="button"
              class="terminal-session-item"
              @click="$emit('select', session.sessionId)"
            >
              <span class="terminal-session-item__title">{{ session.title }}</span>
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('renameSession', session.sessionId)"
            >
              重命名
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('endSession', session.sessionId)"
            >
              结束
            </button>
          </div>
        </li>
      </ul>
    </section>
    <section class="terminal-session-group">
      <h3>Ended</h3>
      <ul>
        <li v-for="session in endedSessions" :key="session.sessionId">
          <div class="terminal-session-item-row">
            <button
              type="button"
              class="terminal-session-item"
              @click="$emit('select', session.sessionId)"
            >
              <span class="terminal-session-item__title">{{ session.title }}</span>
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('renameSession', session.sessionId)"
            >
              重命名
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('deleteSession', session.sessionId)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { TerminalSessionDescriptor } from './terminal-session-registry';

defineProps<{
  openSessions: TerminalSessionDescriptor[];
  recentSessions: TerminalSessionDescriptor[];
  endedSessions: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

defineEmits<{
  (e: 'select', sessionId: string): void;
  (e: 'renameSession', sessionId: string): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
}>();
</script>
