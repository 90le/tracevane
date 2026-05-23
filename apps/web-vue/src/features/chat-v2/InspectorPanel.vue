<template>
  <section class="chat-inspector-panel">
    <header class="chat-inspector-panel__header">
      <div class="chat-inspector-panel__copy">
        <p class="chat-inspector-panel__eyebrow">{{ text('INSPECT', 'INSPECT') }}</p>
        <h3>{{ panelTitle }}</h3>
        <p>{{ panelSubtitle }}</p>
      </div>
      <button type="button" class="chat-inspector-panel__close" :aria-label="text('关闭', 'Close')" @click="$emit('close')">
        <X class="drawer-close-icon" aria-hidden="true" />
      </button>
    </header>

    <TabsRoot :model-value="tab" class="chat-inspector-panel__workspace" @update:model-value="handleTabChange">
      <TabsList class="chat-inspector-panel__tabs" aria-label="Inspect workbench tabs">
        <TabsTrigger
          v-for="item in tabs"
          :key="item.value"
          :value="item.value"
          class="chat-inspector-panel__tab"
        >
          {{ item.label }}
        </TabsTrigger>
      </TabsList>

      <div class="chat-inspector-panel__body">
      <TabsContent value="overview" as-child>
        <div class="chat-inspector-summary-grid">
          <article class="chat-inspector-summary-card">
            <span>{{ text('会话状态', 'Session state') }}</span>
            <strong>{{ runtime?.state || text('未知', 'Unknown') }}</strong>
          </article>
          <article class="chat-inspector-summary-card">
            <span>{{ text('连接状态', 'Gateway') }}</span>
            <strong>{{ runtime?.gatewayConnected ? text('已连接', 'Connected') : text('未连接', 'Disconnected') }}</strong>
          </article>
          <article class="chat-inspector-summary-card">
            <span>{{ text('可写状态', 'Writable') }}</span>
            <strong>{{ runtime?.sessionWritable ? text('可写', 'Writable') : text('只读', 'Read-only') }}</strong>
          </article>
          <article class="chat-inspector-summary-card">
            <span>{{ text('活跃 Run', 'Active run') }}</span>
            <strong>{{ shortRunId(runtime?.activeRunId) }}</strong>
          </article>
        </div>

        <article v-if="warningMessage" class="chat-inspector-spotlight is-warning">
          <span>{{ text('当前提醒', 'Current warning') }}</span>
          <strong>{{ warningMessage }}</strong>
        </article>

        <article class="chat-inspector-spotlight">
          <span>{{ text('当前会话', 'Current session') }}</span>
          <strong>{{ sessionTitle }}</strong>
          <div class="chat-inspector-inline-meta">
            <span>{{ text('Agent', 'Agent') }} · {{ agentName }}</span>
            <span>{{ text('类型', 'Kind') }} · {{ session?.kind || text('未知', 'Unknown') }}</span>
            <span>{{ text('更新时间', 'Updated') }} · {{ formatDate(session?.updatedAt || runtime?.lastEventAt || null) }}</span>
          </div>
        </article>

        <article v-if="observability.lifecycle" class="chat-inspector-spotlight">
          <span>{{ text('最近运行阶段', 'Latest lifecycle') }}</span>
          <strong>{{ lifecycleLabel }}</strong>
          <div class="chat-inspector-inline-meta">
            <span>{{ formatDate(observability.lifecycle.emittedAt) }}</span>
            <span v-if="observability.lifecycle.runId">{{ shortRunId(observability.lifecycle.runId) }}</span>
          </div>
        </article>

        <article v-if="observability.usage" class="chat-inspector-usage">
          <header>
            <span>{{ text('Token 使用', 'Token usage') }}</span>
            <strong>{{ observability.usage.totalTokens }}</strong>
          </header>
          <div class="chat-inspector-usage-grid">
            <div>
              <span>Input</span>
              <strong>{{ observability.usage.inputTokens }}</strong>
            </div>
            <div>
              <span>Output</span>
              <strong>{{ observability.usage.outputTokens }}</strong>
            </div>
            <div>
              <span>Cache Read</span>
              <strong>{{ observability.usage.cacheReadTokens }}</strong>
            </div>
            <div>
              <span>Cache Write</span>
              <strong>{{ observability.usage.cacheWriteTokens }}</strong>
            </div>
          </div>
        </article>

        <article v-if="topToolCards.length" class="chat-inspector-section">
          <header class="chat-inspector-section__header">
            <strong>{{ text('当前工具摘要', 'Current tool summary') }}</strong>
            <span>{{ text('只显示最近 3 个最重要步骤', 'Showing the latest 3 meaningful steps') }}</span>
          </header>
          <div class="chat-inspector-tool-stack compact">
            <article
              v-for="tool in topToolCards"
              :key="tool.toolCallId"
              class="chat-inspector-tool-item"
              :class="toolToneClass(tool)"
            >
              <div class="chat-inspector-tool-item__topline">
                <strong>{{ tool.name }}</strong>
                <span>{{ toolStatusLabel(tool) }}</span>
              </div>
              <p v-if="tool.resultPreview || tool.argsPreview">{{ shortToolDetail(tool) }}</p>
            </article>
          </div>
        </article>
      </TabsContent>

      <TabsContent value="tools" as-child>
        <div v-if="orderedToolCards.length" class="chat-inspector-tool-stack">
          <details
            v-for="tool in orderedToolCards"
            :key="tool.toolCallId"
            class="chat-inspector-tool-item"
            :class="toolToneClass(tool)"
          >
            <summary class="chat-inspector-tool-item__summary">
              <div>
                <strong>{{ tool.name }}</strong>
                <p>{{ toolSummary(tool) }}</p>
              </div>
              <span>{{ toolStatusLabel(tool) }}</span>
            </summary>
            <div class="chat-inspector-tool-item__detail">
              <div v-if="tool.argsPreview" class="chat-inspector-tool-item__detail-block">
                <span>{{ text('参数', 'Arguments') }}</span>
                <pre>{{ tool.argsPreview }}</pre>
              </div>
              <div v-if="tool.resultPreview" class="chat-inspector-tool-item__detail-block">
                <span>{{ tool.isError ? text('错误', 'Error') : text('结果', 'Result') }}</span>
                <pre>{{ tool.resultPreview }}</pre>
              </div>
            </div>
          </details>
        </div>
        <div v-else class="chat-inspector-empty">{{ text('当前没有值得查看的工具过程。', 'No meaningful tool activity yet.') }}</div>
      </TabsContent>

      <TabsContent value="activity" as-child>
        <div v-if="recentTimeline.length" class="chat-inspector-activity-list">
          <article
            v-for="item in recentTimeline"
            :key="item.id"
            class="chat-inspector-activity-item"
            :class="`level-${item.level}`"
          >
            <div class="chat-inspector-activity-item__topline">
              <strong>{{ item.title }}</strong>
              <span>{{ formatDate(item.emittedAt) }}</span>
            </div>
            <p v-if="item.detail">{{ item.detail }}</p>
          </article>
        </div>
        <div v-else class="chat-inspector-empty">{{ text('当前还没有可读的运行活动。', 'No readable activity yet.') }}</div>
      </TabsContent>

      <TabsContent value="diagnostics" as-child>
        <div class="chat-inspector-diagnostics">
          <article class="chat-inspector-diagnostics__item">
            <span>Transport</span>
            <strong>{{ diagnostics?.transport || text('未知', 'Unknown') }}</strong>
          </article>
          <article class="chat-inspector-diagnostics__item">
            <span>Auth</span>
            <strong>{{ diagnostics?.authMode || text('未知', 'Unknown') }}</strong>
          </article>
          <article class="chat-inspector-diagnostics__item">
            <span>same-origin</span>
            <strong>{{ diagnostics?.sameOriginRequired ? text('必需', 'Required') : text('否', 'No') }}</strong>
          </article>
          <article class="chat-inspector-diagnostics__item">
            <span>{{ text('截断策略', 'Truncation') }}</span>
            <strong>{{ diagnostics?.truncationMode || text('未知', 'Unknown') }}</strong>
          </article>
        </div>

        <article v-if="diagnosticNotes.length" class="chat-inspector-section">
          <header class="chat-inspector-section__header">
            <strong>{{ text('诊断备注', 'Diagnostic notes') }}</strong>
            <span>{{ text('只保留会影响会话判断的备注', 'Only notes that affect session decisions are kept here') }}</span>
          </header>
          <ul class="chat-inspector-note-list">
            <li v-for="note in diagnosticNotes" :key="note">{{ note }}</li>
          </ul>
        </article>

        <div v-else class="chat-inspector-empty">{{ text('当前没有额外诊断备注。', 'No extra diagnostic notes right now.') }}</div>
      </TabsContent>
      </div>
    </TabsRoot>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from '@lucide/vue';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import type { ChatDiagnostics, ChatObservabilityState, ChatRuntimeState, ChatSessionRow, ChatToolCard } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import { deriveChatSessionTitle } from './display-adapter';

const props = defineProps<{
  tab: 'overview' | 'tools' | 'activity' | 'diagnostics';
  session: ChatSessionRow | null;
  agentName: string;
  runtime: ChatRuntimeState | null;
  diagnostics: ChatDiagnostics | null;
  observability: ChatObservabilityState;
  warningMessage: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'update:tab', tab: 'overview' | 'tools' | 'activity' | 'diagnostics'): void;
}>();

const { text } = useLocalePreference();

const tabs = computed(() => [
  { value: 'overview' as const, label: text('概览', 'Overview') },
  { value: 'tools' as const, label: text('工具', 'Tools') },
  { value: 'activity' as const, label: text('活动', 'Activity') },
  { value: 'diagnostics' as const, label: text('诊断', 'Diagnostics') },
]);

function handleTabChange(nextTab: string | number): void {
  if (nextTab === 'overview' || nextTab === 'tools' || nextTab === 'activity' || nextTab === 'diagnostics') {
    emit('update:tab', nextTab);
  }
}

const panelTitle = computed(() => text('调试台', 'Inspect mode'));
const panelSubtitle = computed(() =>
  props.session
    ? text('保留必要观测能力，不再把所有运行细节平铺到主聊天面。', 'Keeps only the useful observability details instead of flattening everything into the main chat surface.')
    : text('先选择一个会话，再查看更有价值的运行信息。', 'Choose a session first to inspect meaningful run details.')
);

const sessionTitle = computed(() => (
  props.session ? deriveChatSessionTitle(props.session, props.agentName) : text('当前未选中会话', 'No session selected')
));

const lifecycleLabel = computed(() => {
  const lifecycle = props.observability.lifecycle;
  if (!lifecycle) return text('暂无', 'None');
  if (lifecycle.phase === 'start') return text('开始执行', 'Run started');
  if (lifecycle.phase === 'end') return text('执行完成', 'Run completed');
  return lifecycle.errorMessage || text('执行出错', 'Run failed');
});

const orderedToolCards = computed(() =>
  (props.observability.toolCards || []).slice().sort((left, right) => {
    const leftTs = Date.parse(left.updatedAt || left.startedAt || '') || 0;
    const rightTs = Date.parse(right.updatedAt || right.startedAt || '') || 0;
    if (leftTs !== rightTs) return rightTs - leftTs;
    return left.toolCallId.localeCompare(right.toolCallId);
  }),
);

const topToolCards = computed(() => orderedToolCards.value.slice(0, 3));
const recentTimeline = computed(() => (props.observability.timeline || []).slice().sort((left, right) => {
  const leftTs = Date.parse(left.emittedAt || '') || 0;
  const rightTs = Date.parse(right.emittedAt || '') || 0;
  if (leftTs !== rightTs) return rightTs - leftTs;
  return right.id.localeCompare(left.id);
}).slice(0, 12));
const diagnosticNotes = computed(() => (props.diagnostics?.notes || []).filter(Boolean).slice(0, 6));

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None');
  try {
    return new Date(value).toLocaleString([], {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function shortRunId(value: string | null | undefined): string {
  if (!value) return text('无', 'None');
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function toolStatusLabel(tool: ChatToolCard): string {
  if (tool.status === 'completed') return text('已完成', 'Done');
  if (tool.status === 'error') return text('失败', 'Error');
  return text('执行中', 'Running');
}

function toolToneClass(tool: ChatToolCard): string {
  if (tool.status === 'completed') return 'tone-success';
  if (tool.status === 'error') return 'tone-error';
  return 'tone-running';
}

function shortToolDetail(tool: ChatToolCard): string {
  const source = tool.resultPreview || tool.argsPreview || '';
  return source.length > 140 ? `${source.slice(0, 140)}…` : source;
}

function toolSummary(tool: ChatToolCard): string {
  const time = formatDate(tool.updatedAt || tool.startedAt || null);
  const detail = shortToolDetail(tool);
  return [toolStatusLabel(tool), time, detail].filter(Boolean).join(' · ');
}
</script>

<style scoped>
.chat-inspector-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  padding: 22px 22px 20px;
  background: var(--chat-inspector-bg);
  transform-origin: top right;
  animation: chat-inspector-panel-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.chat-inspector-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--chat-line);
}

.chat-inspector-panel__copy {
  display: grid;
  gap: 6px;
}

.chat-inspector-panel__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--chat-accent);
}

.chat-inspector-panel__header h3 {
  margin: 0;
  color: var(--chat-text);
}

.chat-inspector-panel__header p {
  margin: 0;
  color: var(--chat-text-soft);
  font-size: 13px;
  line-height: 1.5;
}

.chat-inspector-panel__close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text);
}

.chat-inspector-panel__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--chat-line);
}

.chat-inspector-panel__tab {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.chat-inspector-panel__tab[data-state='active'] {
  color: var(--chat-text);
  background: var(--chat-muted-chip);
}

.chat-inspector-panel__body {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 14px;
  padding-right: 6px;
}

.chat-inspector-summary-grid,
.chat-inspector-usage-grid,
.chat-inspector-diagnostics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chat-inspector-summary-card,
.chat-inspector-spotlight,
.chat-inspector-usage,
.chat-inspector-section,
.chat-inspector-diagnostics__item,
.chat-inspector-tool-item,
.chat-inspector-activity-item,
.chat-inspector-empty {
  border: 1px solid var(--chat-line);
  border-radius: 12px;
  background: var(--chat-inspector-card-bg);
}

.chat-inspector-summary-card,
.chat-inspector-diagnostics__item {
  display: grid;
  gap: 6px;
  padding: 16px 18px;
}

.chat-inspector-summary-card span,
.chat-inspector-diagnostics__item span {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-inspector-summary-card strong,
.chat-inspector-diagnostics__item strong {
  color: var(--chat-text);
}

.chat-inspector-spotlight,
.chat-inspector-usage,
.chat-inspector-section {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.chat-inspector-spotlight.is-warning {
  background: color-mix(in srgb, var(--chat-tool-error) 64%, var(--chat-inspector-card-bg));
}

.chat-inspector-spotlight > span,
.chat-inspector-usage > header span,
.chat-inspector-section__header span {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-inspector-spotlight > strong,
.chat-inspector-usage > header strong,
.chat-inspector-section__header strong {
  color: var(--chat-text);
}

.chat-inspector-inline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-inspector-usage > header,
.chat-inspector-section__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.chat-inspector-usage-grid > div {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-inspector-card-bg) 82%, var(--chat-muted-chip));
}

.chat-inspector-usage-grid span {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-inspector-usage-grid strong {
  color: var(--chat-text);
}

.chat-inspector-tool-stack,
.chat-inspector-activity-list,
.chat-inspector-note-list {
  display: grid;
  gap: 12px;
}

.chat-inspector-tool-stack.compact {
  gap: 8px;
}

.chat-inspector-tool-item {
  overflow: hidden;
}

.chat-inspector-tool-item.tone-success {
  background: color-mix(in srgb, var(--chat-tool-success) 78%, var(--chat-inspector-card-bg));
}

.chat-inspector-tool-item.tone-error {
  background: color-mix(in srgb, var(--chat-tool-error) 72%, var(--chat-inspector-card-bg));
}

.chat-inspector-tool-item.tone-running {
  background: color-mix(in srgb, var(--chat-tool-running) 72%, var(--chat-inspector-card-bg));
}

.chat-inspector-tool-item__summary,
.chat-inspector-tool-item__topline,
.chat-inspector-activity-item__topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.chat-inspector-tool-item__summary {
  list-style: none;
  cursor: pointer;
  padding: 16px 18px;
}

.chat-inspector-tool-item__summary::-webkit-details-marker {
  display: none;
}

.chat-inspector-tool-item__summary p,
.chat-inspector-tool-item__detail-block span,
.chat-inspector-activity-item p,
.chat-inspector-note-list li {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.55;
}

.chat-inspector-tool-item__topline {
  padding: 16px 18px;
}

.chat-inspector-tool-item__topline strong,
.chat-inspector-tool-item__summary strong,
.chat-inspector-activity-item strong {
  color: var(--chat-text);
}

.chat-inspector-tool-item__topline span,
.chat-inspector-tool-item__summary span,
.chat-inspector-activity-item__topline span {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-inspector-tool-item__detail {
  display: grid;
  gap: 12px;
  padding: 0 18px 18px;
}

.chat-inspector-tool-item__detail-block {
  display: grid;
  gap: 6px;
}

.chat-inspector-tool-item__detail-block pre {
  margin: 0;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--chat-code-bg);
  color: var(--chat-code-text);
  font-size: 12px;
  line-height: 1.5;
}

.chat-inspector-activity-item {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
}

.chat-inspector-activity-item.level-success {
  border-color: color-mix(in srgb, var(--chat-success) 35%, var(--chat-line));
}

.chat-inspector-activity-item.level-error {
  border-color: color-mix(in srgb, #ef4444 35%, var(--chat-line));
}

.chat-inspector-note-list {
  margin: 0;
  padding-left: 18px;
}

.chat-inspector-empty {
  padding: 22px;
  color: var(--chat-text-soft);
  text-align: center;
}

@keyframes chat-inspector-panel-in {
  from {
    opacity: 0;
    transform: translate3d(14px, 0, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-inspector-panel {
    animation: none;
  }
}

@media (max-width: 760px) {
  .chat-inspector-panel {
    padding: 16px;
  }

  .chat-inspector-summary-grid,
  .chat-inspector-usage-grid,
  .chat-inspector-diagnostics {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
