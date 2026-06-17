<!-- features/terminal/components/TerminalPanel.vue
     终端面板 —— 底部 IDE 终端。xterm + SSE 输出流。
     MVP：会话切换 + 显示输出。输入/resize 后续迭代。 -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../terminal-store';

const terminal = useTerminalStore();
const termContainer = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let consumedBufferLen = 0;

function initTerm() {
  if (!termContainer.value || term) return;
  term = new Terminal({
    fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
    fontSize: 12,
    theme: {
      background: '#08090a',
      foreground: '#d4ddd9',
      cursor: '#d4ddd9',
    },
    cursorBlink: true,
    convertEol: true,
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(termContainer.value);
  fitAddon.fit();
}

// 监听输出缓冲，把新增内容写入 xterm
watch(
  () => terminal.outputBuffer.length,
  async () => {
    await nextTick();
    if (!term) return;
    const buf = terminal.outputBuffer;
    while (consumedBufferLen < buf.length) {
      term.write(buf[consumedBufferLen]);
      consumedBufferLen++;
    }
  },
);

// 切换会话时重置 xterm
watch(
  () => terminal.activeSessionId,
  (id) => {
    if (!id || !term) return;
    term.reset();
    consumedBufferLen = 0;
  },
);

function selectSession(id: string) {
  consumedBufferLen = 0;
  terminal.selectSession(id);
}

onMounted(async () => {
  initTerm();
  await terminal.start();
  // 自动选第一个可恢复会话
  const first = terminal.sessions.find((s) => s.canResume) || terminal.sessions[0];
  if (first) selectSession(first.sessionId);
});

onBeforeUnmount(() => {
  terminal.stop();
  term?.dispose();
  term = null;
});
</script>

<template>
  <div class="term-panel">
    <div class="term-panel__tabs">
      <span class="term-panel__title">终端</span>
      <select
        v-if="terminal.sessions.length > 0"
        class="term-panel__select"
        :value="terminal.activeSessionId || ''"
        @change="selectSession(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="s in terminal.sessions" :key="s.sessionId" :value="s.sessionId">
          {{ s.title }} · {{ s.status }}
        </option>
      </select>
      <span v-else class="term-panel__none">无会话</span>
      <span class="term-panel__conn" :class="{ 'is-on': terminal.streamConnected }">
        {{ terminal.streamConnected ? '● 已连接' : '○ 未连接' }}
      </span>
    </div>
    <div ref="termContainer" class="term-panel__xterm"></div>
    <div v-if="terminal.errorMessage" class="term-panel__error">{{ terminal.errorMessage }}</div>
  </div>
</template>

<style scoped>
.term-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #08090a;
}
.term-panel__tabs {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  height: 32px;
  background: rgba(120, 120, 128, 0.14);
  border-bottom: 0.5px solid var(--hairline);
  flex-shrink: 0;
}
.term-panel__title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.term-panel__select {
  background: var(--fill);
  color: var(--text-primary);
  border: 0.5px solid var(--hairline);
  border-radius: 6px;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  max-width: 320px;
}
.term-panel__none {
  font-size: 12px;
  color: var(--text-tertiary);
}
.term-panel__conn {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
.term-panel__conn.is-on {
  color: var(--sys-green);
}
.term-panel__xterm {
  flex: 1;
  padding: 8px 10px;
  overflow: hidden;
}
.term-panel__error {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--sys-red);
  background: color-mix(in srgb, var(--sys-red) 10%, transparent);
}
</style>
