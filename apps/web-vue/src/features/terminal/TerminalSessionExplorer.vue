<template>
  <section class="terminal-session-explorer" aria-label="Terminal session explorer">
    <section class="terminal-session-group">
      <div class="terminal-session-group__header">
        <h3>{{ text('运行中 / 已打开', 'Live / Open') }}</h3>
        <span>{{ openSessions.length }}</span>
      </div>
      <ul v-if="openSessions.length">
        <li v-for="session in openSessions" :key="session.sessionId">
          <div class="terminal-session-item-row">
            <button
              type="button"
              class="terminal-session-item"
              :class="{ active: session.sessionId === activeSessionId }"
              @click="$emit('select', session.sessionId)"
            >
              <span class="terminal-session-item__title">{{ text(buildDisplayTitle(session).labelZh, buildDisplayTitle(session).labelEn) }}</span>
              <span class="terminal-session-item__meta">
                {{ text(buildTerminalSessionSourceSummary(session.source).labelZh, buildTerminalSessionSourceSummary(session.source).labelEn) }} ·
                {{ text(buildTerminalSessionStatusSummary({
                  status: session.status,
                  controlState: session.controlState,
                  canResume: session.canResume,
                }).labelZh, buildTerminalSessionStatusSummary({
                  status: session.status,
                  controlState: session.controlState,
                  canResume: session.canResume,
                }).labelEn) }}
              </span>
              <span v-if="session.recentOutputSummary?.tailText" class="terminal-session-item__snippet">
                {{ session.recentOutputSummary.tailText }}
              </span>
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('endSession', session.sessionId)"
            >
              {{ text('结束', 'End') }}
            </button>
          </div>
        </li>
      </ul>
      <div v-else class="terminal-empty-state">{{ text('当前没有已打开的终端标签。', 'There are no open terminal tabs right now.') }}</div>
    </section>

    <section class="terminal-session-group">
      <div class="terminal-session-group__header">
        <h3>{{ text('可恢复 / 最近', 'Recoverable / Recent') }}</h3>
        <span>{{ recentSessions.length }}</span>
      </div>
      <ul v-if="recentSessions.length">
        <li v-for="session in recentSessions" :key="session.sessionId">
          <div class="terminal-session-item-row">
            <button
              type="button"
              class="terminal-session-item"
              @click="$emit('select', session.sessionId)"
            >
              <span class="terminal-session-item__title">{{ text(buildDisplayTitle(session).labelZh, buildDisplayTitle(session).labelEn) }}</span>
              <span class="terminal-session-item__meta">
                {{ text(buildTerminalSessionSourceSummary(session.source).labelZh, buildTerminalSessionSourceSummary(session.source).labelEn) }} ·
                {{ text(buildTerminalSessionStatusSummary({
                  status: session.status,
                  controlState: session.controlState,
                  canResume: session.canResume,
                }).labelZh, buildTerminalSessionStatusSummary({
                  status: session.status,
                  controlState: session.controlState,
                  canResume: session.canResume,
                }).labelEn) }}
              </span>
              <span v-if="session.recentOutputSummary?.tailText" class="terminal-session-item__snippet">
                {{ session.recentOutputSummary.tailText }}
              </span>
            </button>
            <button
              v-if="session.status === 'running' || session.status === 'detached'"
              type="button"
              class="terminal-session-item-action"
              @click="$emit('endSession', session.sessionId)"
            >
              {{ text('结束', 'End') }}
            </button>
          </div>
        </li>
      </ul>
      <div v-else class="terminal-empty-state">{{ text('没有需要恢复的会话。', 'No sessions need recovery.') }}</div>
    </section>

    <section class="terminal-session-group">
      <div class="terminal-session-group__header">
        <h3>{{ text('已结束', 'Ended') }}</h3>
        <span>{{ endedSessions.length }}</span>
      </div>
      <ul v-if="endedSessions.length">
        <li v-for="session in endedSessions" :key="session.sessionId">
          <div class="terminal-session-item-row">
            <button
              type="button"
              class="terminal-session-item"
              @click="$emit('select', session.sessionId)"
            >
              <span class="terminal-session-item__title">{{ text(buildDisplayTitle(session).labelZh, buildDisplayTitle(session).labelEn) }}</span>
              <span class="terminal-session-item__meta">
                {{ text(buildTerminalSessionSourceSummary(session.source).labelZh, buildTerminalSessionSourceSummary(session.source).labelEn) }} ·
                {{ text(buildTerminalSessionStatusSummary({
                  status: session.status,
                  controlState: session.controlState,
                  canResume: session.canResume,
                }).labelZh, buildTerminalSessionStatusSummary({
                  status: session.status,
                  controlState: session.controlState,
                  canResume: session.canResume,
                }).labelEn) }}
              </span>
              <span v-if="session.recentOutputSummary?.tailText" class="terminal-session-item__snippet">
                {{ session.recentOutputSummary.tailText }}
              </span>
            </button>
            <button
              type="button"
              class="terminal-session-item-action"
              @click="$emit('deleteSession', session.sessionId)"
            >
              {{ text('删除', 'Delete') }}
            </button>
          </div>
        </li>
      </ul>
      <div v-else class="terminal-empty-state">{{ text('还没有已结束的会话记录。', 'There are no finished sessions yet.') }}</div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import {
  buildTerminalSessionDisplayTitle,
  buildTerminalSessionSourceSummary,
  buildTerminalSessionStatusSummary,
} from './terminal-session-selectors';

const { text } = useLocalePreference();

defineProps<{
  openSessions: TerminalSessionDescriptor[];
  recentSessions: TerminalSessionDescriptor[];
  endedSessions: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

defineEmits<{
  (e: 'select', sessionId: string): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
}>();

function buildDisplayTitle(session: TerminalSessionDescriptor) {
  return buildTerminalSessionDisplayTitle({
    title: session.title,
    sessionId: session.sessionId,
  });
}
</script>
