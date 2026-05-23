<template>
  <section class="chat-inspector-panel">
    <header class="chat-inspector-head">
      <div>
        <p class="eyebrow">{{ inspectPinned ? text('INSPECT MODE', 'INSPECT MODE') : text('INSPECTOR', 'INSPECTOR') }}</p>
        <h3>{{ text('调试与观测', 'Inspect & Observe') }}</h3>
        <p class="surface-note">
          {{ text('diagnostics、runtime、lifecycle、tools、usage 与 activity 都继续保留，但退到辅助层。', 'Diagnostics, runtime, lifecycle, tools, usage, and activity remain available, but only as a secondary layer.') }}
        </p>
      </div>
      <button
        v-if="!inspectPinned"
        type="button"
        class="surface-drawer-close"
        :aria-label="text('关闭', 'Close')"
        @click="$emit('close')"
      >
        <X class="drawer-close-icon" aria-hidden="true" />
      </button>
    </header>

    <div class="surface-tabs">
      <button type="button" class="surface-tab" :class="{ active: tab === 'overview' }" @click="$emit('update:tab', 'overview')">
        {{ text('概览', 'Overview') }}
      </button>
      <button type="button" class="surface-tab" :class="{ active: tab === 'tools' }" @click="$emit('update:tab', 'tools')">
        {{ text('工具', 'Tools') }}
      </button>
      <button type="button" class="surface-tab" :class="{ active: tab === 'activity' }" @click="$emit('update:tab', 'activity')">
        {{ text('活动', 'Activity') }}
      </button>
      <button type="button" class="surface-tab" :class="{ active: tab === 'diagnostics' }" @click="$emit('update:tab', 'diagnostics')">
        {{ text('诊断', 'Diagnostics') }}
      </button>
    </div>

    <div v-if="tab === 'overview'" class="chat-inspector-body">
      <div v-if="runtime" class="chat-inspector-grid">
        <div class="chat-inspector-item">
          <span>{{ text('Gateway', 'Gateway') }}</span>
          <strong>{{ runtime.gatewayConnected ? text('已连接', 'Connected') : text('未连接', 'Disconnected') }}</strong>
        </div>
        <div class="chat-inspector-item">
          <span>{{ text('可写', 'Writable') }}</span>
          <strong>{{ runtime.sessionWritable ? text('是', 'Yes') : text('否', 'No') }}</strong>
        </div>
        <div class="chat-inspector-item">
          <span>{{ text('Run', 'Run') }}</span>
          <strong>{{ runtime.activeRunId || text('无', 'None') }}</strong>
        </div>
        <div class="chat-inspector-item">
          <span>{{ text('状态', 'State') }}</span>
          <strong>{{ runtime.state }}</strong>
        </div>
      </div>
      <div v-else class="empty-inline">{{ text('当前没有 runtime 数据。', 'No runtime data is available.') }}</div>

      <div v-if="observability.lifecycle" class="chat-inspector-block">
        <strong>{{ text('Lifecycle', 'Lifecycle') }}</strong>
        <span>{{ observability.lifecycle.phase }}</span>
        <span>{{ formatDate(observability.lifecycle.emittedAt) }}</span>
      </div>

      <div v-if="observability.usage" class="chat-inspector-grid compact">
        <div class="chat-inspector-item">
          <span>{{ text('Input', 'Input') }}</span>
          <strong>{{ observability.usage.inputTokens }}</strong>
        </div>
        <div class="chat-inspector-item">
          <span>{{ text('Output', 'Output') }}</span>
          <strong>{{ observability.usage.outputTokens }}</strong>
        </div>
        <div class="chat-inspector-item">
          <span>{{ text('Total', 'Total') }}</span>
          <strong>{{ observability.usage.totalTokens }}</strong>
        </div>
        <div class="chat-inspector-item">
          <span>{{ text('Cost', 'Cost') }}</span>
          <strong>{{ observability.usage.costUsd == null ? text('未知', 'N/A') : `$${observability.usage.costUsd.toFixed(4)}` }}</strong>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'tools'" class="chat-inspector-body">
      <div v-if="observability.toolCards.length" class="chat-inspector-list">
        <article v-for="tool in observability.toolCards" :key="tool.toolCallId" class="chat-inspector-list-item">
          <strong>{{ tool.name }}</strong>
          <span>{{ tool.status }}</span>
          <pre v-if="tool.argsPreview">{{ tool.argsPreview }}</pre>
          <pre v-if="tool.resultPreview">{{ tool.resultPreview }}</pre>
        </article>
      </div>
      <div v-else class="empty-inline">{{ text('当前还没有工具事件。', 'No tool events yet.') }}</div>
    </div>

    <div v-else-if="tab === 'activity'" class="chat-inspector-body">
      <div v-if="observability.timeline.length" class="chat-inspector-list">
        <article v-for="item in observability.timeline.slice().reverse().slice(0, 12)" :key="item.id" class="chat-inspector-list-item">
          <strong>{{ item.title }}</strong>
          <span>{{ formatDate(item.emittedAt) }}</span>
          <p v-if="item.detail">{{ item.detail }}</p>
        </article>
      </div>
      <div v-else class="empty-inline">{{ text('当前还没有 activity。', 'No activity yet.') }}</div>
    </div>

    <div v-else class="chat-inspector-body">
      <div v-if="diagnostics" class="chat-inspector-list">
        <article class="chat-inspector-list-item">
          <strong>Transport</strong>
          <span>{{ diagnostics.transport }}</span>
        </article>
        <article class="chat-inspector-list-item">
          <strong>Auth</strong>
          <span>{{ diagnostics.authMode }}</span>
        </article>
        <article class="chat-inspector-list-item">
          <strong>same-origin</strong>
          <span>{{ diagnostics.sameOriginRequired ? text('必需', 'Required') : text('否', 'No') }}</span>
        </article>
        <article class="chat-inspector-list-item">
          <strong>Gateway URL</strong>
          <span>{{ diagnostics.gatewayWsUrl }}</span>
        </article>
      </div>
      <div v-else class="empty-inline">{{ text('当前没有 diagnostics。', 'No diagnostics available.') }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import type { ChatDiagnostics, ChatObservabilityState, ChatRuntimeState } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  tab: 'overview' | 'tools' | 'activity' | 'diagnostics';
  inspectPinned: boolean;
  runtime: ChatRuntimeState | null;
  diagnostics: ChatDiagnostics | null;
  observability: ChatObservabilityState;
}>();

defineEmits<{
  (event: 'close'): void;
  (event: 'update:tab', tab: 'overview' | 'tools' | 'activity' | 'diagnostics'): void;
}>();

const { text } = useLocalePreference();

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None');
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
</script>

<style scoped>
.chat-inspector-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.chat-inspector-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chat-inspector-head h3 {
  margin: 0;
  color: var(--chat-text);
}

.chat-inspector-body,
.chat-inspector-list {
  display: grid;
  gap: 10px;
}

.chat-inspector-grid {
  display: grid;
  gap: 10px;
}

.chat-inspector-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chat-inspector-item,
.chat-inspector-block,
.chat-inspector-list-item {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--chat-border);
  border-radius: 14px;
  background: var(--chat-surface-muted);
}

.chat-inspector-item span,
.chat-inspector-block span,
.chat-inspector-list-item span,
.chat-inspector-list-item p {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.chat-inspector-item strong,
.chat-inspector-block strong,
.chat-inspector-list-item strong {
  color: var(--chat-text);
}

.chat-inspector-list-item pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--chat-text);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .chat-inspector-grid.compact {
    grid-template-columns: 1fr;
  }
}
</style>
