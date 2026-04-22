<template>
  <section class="terminal-session-history-panel">
    <div class="terminal-inspector-section-header terminal-inspector-section-header--compact">
      <div>
        <h3>{{ text('历史交互', 'Session History') }}</h3>
        <p>{{ text('页面刷新或扩展重启后，至少保留最近的命令与输出片段，避免像“什么都没发生过”。', 'After a refresh or extension restart, keep recent commands and output snippets so the session does not look empty.') }}</p>
      </div>
      <button
        v-if="replayCommand"
        type="button"
        class="secondary-button compact-button"
        @click="$emit('replayLastCommand', replayCommand)"
      >
        {{ text('重放最近命令', 'Replay Last Command') }}
      </button>
    </div>

    <div v-if="busy" class="terminal-empty-state">
      {{ text('正在读取历史记录…', 'Loading session history...') }}
    </div>

    <template v-else-if="entries.length">
      <div
        v-if="sessionStatus === 'lost' || sessionStatus === 'completed' || sessionStatus === 'failed'"
        class="terminal-session-history-note"
      >
        {{ text('实时终端已不可恢复，下面保留的是之前的命令与输出片段。', 'The live terminal is no longer recoverable. The preserved command and output history is shown below.') }}
      </div>

      <ol class="terminal-session-history-list">
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="terminal-session-history-item"
        :data-kind="entry.kind"
      >
        <span class="terminal-session-history-item__kind">{{ kindLabel(entry.kind) }}</span>
        <pre>{{ entry.text }}</pre>
      </li>
      </ol>
    </template>

    <div v-else class="terminal-empty-state">
      {{ text('当前没有可恢复的终端历史。', 'No persisted terminal history is available for this session.') }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';
import type { TerminalSessionHistoryEntry } from './terminal-session-history';

const { text } = useLocalePreference();

defineProps<{
  busy: boolean;
  entries: TerminalSessionHistoryEntry[];
  replayCommand: string | null;
  sessionStatus: 'running' | 'detached' | 'completed' | 'failed' | 'lost' | null;
}>();

defineEmits<{
  (e: 'replayLastCommand', command: string): void;
}>();

function kindLabel(kind: TerminalSessionHistoryEntry["kind"]): string {
  switch (kind) {
    case "command":
      return text('命令', 'Command');
    case "error":
      return text('错误', 'Error');
    case "system":
      return text('系统', 'System');
    default:
      return text('输出', 'Output');
  }
}
</script>
