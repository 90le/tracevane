<template>
  <article class="chat-message-group" :class="[`role-${group.role}`]">
    <div class="chat-message-avatar" aria-hidden="true">
      <AgentAvatarContent
        v-if="group.role === 'assistant'"
        :avatar="agentAvatar"
        :emoji="agentEmoji"
        :fallback="agentInitial"
        :alt="agentName"
      />
      <template v-else>{{ avatarLabel }}</template>
    </div>
    <div class="chat-message-stack">
      <div class="chat-message-meta">
        <strong>{{ senderLabel }}</strong>
        <span>{{ timeLabel }}</span>
      </div>

      <div class="chat-message-bubbles">
        <div
          v-for="message in group.messages"
          :key="message.id"
          class="chat-message-bubble"
          :class="bubbleClass(message)"
        >
          <details v-if="displayFor(message).toolHints.length" class="chat-message-tools-collapse">
            <summary class="chat-message-tools-summary">
              <Braces class="chat-message-tools-icon" aria-hidden="true" />
              <span>{{ toolSummary(message) }}</span>
            </summary>
            <div class="chat-message-tool-row">
              <div
                v-for="tool in displayFor(message).toolHints"
                :key="tool.id"
                class="chat-message-tool-chip"
                :class="`status-${tool.status}`"
              >
                <span class="chat-message-tool-chip-label">{{ text('工具', 'Tool') }}</span>
                <strong>{{ tool.name }}</strong>
                <span>{{ tool.status === 'running' ? text('执行中', 'Running') : tool.status === 'completed' ? text('已完成', 'Completed') : text('错误', 'Error') }}</span>
                <em v-if="tool.detail">{{ tool.detail }}</em>
              </div>
            </div>
          </details>

          <div v-if="bubbleText(message)" class="chat-message-bubble-body" v-html="renderChatMarkdown(bubbleText(message))"></div>

          <div class="chat-message-bubble-foot">
            <span v-if="message.aborted">{{ text('已中止', 'Aborted') }}</span>
            <span v-if="message.omitted">{{ text('历史省略', 'Omitted') }}</span>
            <span v-else-if="message.truncated">{{ text('已截断', 'Truncated') }}</span>
            <span v-if="message.source === 'stream' && activeRunId === message.runId">{{ text('生成中', 'Streaming') }}</span>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Braces } from '@lucide/vue';
import type { ChatMessageGroup } from './message-groups';
import { renderChatMarkdown } from './markdown';
import { useLocalePreference } from '../../shared/locale';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { deriveChatDisplayMessage } from './display-adapter';

const props = defineProps<{
  group: ChatMessageGroup;
  agentName: string;
  agentAvatar: string;
  agentEmoji: string;
  agentInitial: string;
  activeRunId: string | null;
}>();

const { text } = useLocalePreference();

const senderLabel = computed(() => {
  if (props.group.role === 'assistant') return props.agentName;
  if (props.group.role === 'user') return text('你', 'You');
  if (props.group.role === 'tool') return text('工具', 'Tool');
  if (props.group.role === 'system') return text('系统', 'System');
  return text('消息', 'Message');
});

const avatarLabel = computed(() => {
  if (props.group.role === 'assistant') return props.agentInitial;
  if (props.group.role === 'user') return '你';
  if (props.group.role === 'tool') return 'T';
  if (props.group.role === 'system') return 'S';
  return '·';
});

const timeLabel = computed(() => {
  const timestamp = props.group.messages[props.group.messages.length - 1]?.createdAt || null;
  if (!timestamp) return text('刚刚', 'Just now');
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
});

function displayFor(message: ChatMessageGroup['messages'][number]) {
  return deriveChatDisplayMessage(message);
}

function bubbleText(message: ChatMessageGroup['messages'][number]): string {
  const display = displayFor(message);
  if (display.text) return display.text;
  return '';
}

function toolSummary(message: ChatMessageGroup['messages'][number]): string {
  const count = displayFor(message).toolHints.length;
  if (count === 1) return text('1 个工具步骤', '1 tool step');
  return text(`${count} 个工具步骤`, `${count} tool steps`);
}

function bubbleClass(message: ChatMessageGroup['messages'][number]): Record<string, boolean> {
  const display = displayFor(message);
  return {
    streaming: message.source === 'stream' && props.activeRunId === message.runId,
    'tool-only': !display.text && display.toolHints.length > 0,
  };
}
</script>

<style scoped>
.chat-message-group {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.chat-message-group.role-user {
  grid-template-columns: minmax(0, 1fr) 40px;
}

.chat-message-group.role-user .chat-message-avatar {
  order: 2;
}

.chat-message-group.role-user .chat-message-stack {
  order: 1;
  justify-items: end;
}

.chat-message-avatar {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  background: var(--chat-surface-elevated);
  border: 1px solid var(--chat-border);
  color: var(--chat-text);
  font-size: 12px;
  font-weight: 700;
}

.chat-message-group.role-user .chat-message-avatar {
  background: var(--chat-user-bubble);
  color: var(--chat-user-bubble-soft);
  border-color: transparent;
}

.chat-message-stack {
  display: grid;
  gap: 6px;
}

.chat-message-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-message-group.role-user .chat-message-meta {
  justify-content: flex-end;
}

.chat-message-meta strong {
  color: var(--chat-text);
  font-size: 13px;
}

.chat-message-meta span {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-message-bubbles {
  display: grid;
  gap: 10px;
}

.chat-message-bubble {
  max-width: min(76ch, 100%);
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid var(--chat-border);
  background: var(--chat-assistant-bubble);
  color: var(--chat-text);
  box-shadow: 0 6px 18px rgba(19, 34, 56, 0.06);
}

.chat-message-group.role-user .chat-message-bubble {
  background: var(--chat-user-bubble);
  border-color: transparent;
  color: var(--chat-user-bubble-soft);
}

.chat-message-group.role-system .chat-message-bubble,
.chat-message-group.role-tool .chat-message-bubble {
  background: var(--chat-system-bubble);
}

.chat-message-bubble.streaming {
  border-color: rgba(37, 99, 235, 0.28);
}

:global(html:not([data-theme='light'])) .chat-message-bubble.streaming {
  border-color: rgba(115, 168, 255, 0.34);
}

.chat-message-bubble.tool-only {
  padding-top: 10px;
}

.chat-message-tools-collapse {
  margin-bottom: 8px;
}

.chat-message-tools-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--chat-text-soft);
  font-size: 12px;
  list-style: none;
}

.chat-message-tools-summary::-webkit-details-marker {
  display: none;
}

.chat-message-tools-icon {
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--chat-surface-muted);
  border: 1px solid var(--chat-border);
}

.chat-message-tool-row {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.chat-message-tool-chip {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--chat-surface-muted);
  border: 1px solid var(--chat-border);
}

.chat-message-group.role-user .chat-message-tool-chip {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.18);
}

.chat-message-tool-chip.status-running {
  background: var(--chat-tool-running);
}

.chat-message-tool-chip.status-completed {
  background: var(--chat-tool-success);
}

.chat-message-tool-chip.status-error {
  background: var(--chat-tool-error);
}

.chat-message-tool-chip-label,
.chat-message-tool-chip span,
.chat-message-tool-chip em {
  font-size: 12px;
  line-height: 1.5;
  color: var(--chat-text-soft);
  font-style: normal;
}

.chat-message-tool-chip strong {
  color: var(--chat-text);
  font-size: 13px;
}

.chat-message-group.role-user .chat-message-tool-chip strong,
.chat-message-group.role-user .chat-message-tool-chip span,
.chat-message-group.role-user .chat-message-tool-chip em,
.chat-message-group.role-user .chat-message-tools-summary {
  color: var(--chat-user-bubble-soft);
}

.chat-message-bubble-body {
  margin-top: 4px;
}

.chat-message-bubble-body :deep(p) {
  margin: 0;
}

.chat-message-bubble-body :deep(p + p),
.chat-message-bubble-body :deep(ul + p),
.chat-message-bubble-body :deep(p + ul),
.chat-message-bubble-body :deep(figure + p) {
  margin-top: 12px;
}

.chat-message-bubble-body :deep(ul),
.chat-message-bubble-body :deep(ol) {
  margin: 0;
  padding-left: 18px;
}

.chat-message-bubble-body :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.08);
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.chat-message-group.role-user .chat-message-bubble-body :deep(code) {
  background: rgba(255, 255, 255, 0.14);
}

.chat-message-bubble-body :deep(.chat-md-code) {
  margin: 0;
  display: grid;
  gap: 8px;
}

.chat-message-bubble-body :deep(.chat-md-code figcaption) {
  color: var(--chat-text-soft);
  font-size: 12px;
  text-transform: uppercase;
}

.chat-message-bubble-body :deep(.chat-md-code pre) {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: #0f172a;
  overflow: auto;
}

.chat-message-group.role-user .chat-message-bubble-body :deep(.chat-md-code pre) {
  background: rgba(12, 24, 46, 0.45);
}

.chat-message-bubble-body :deep(.chat-md-code pre code) {
  padding: 0;
  background: transparent;
  color: #f8fbff;
}

.chat-message-bubble-body :deep(.chat-math) {
  max-width: 100%;
  color: inherit;
}

.chat-message-bubble-body :deep(.chat-math-block) {
  display: block;
  margin: 8px 0 12px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  text-align: center;
}

.chat-message-bubble-body :deep(.chat-math-inline) {
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  vertical-align: -0.15em;
  -webkit-overflow-scrolling: touch;
}

.chat-message-bubble-body :deep(.chat-math-source) {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(.chat-math .katex) {
  font-size: 1.04em;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(a) {
  color: var(--chat-accent);
  text-decoration: underline;
}

.chat-message-group.role-user .chat-message-bubble-body :deep(a) {
  color: #ffffff;
}

.chat-message-bubble-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.chat-message-bubble-foot span {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-message-group.role-user .chat-message-bubble-foot span {
  color: rgba(255, 255, 255, 0.82);
}

@media (max-width: 720px) {
  .chat-message-group,
  .chat-message-group.role-user {
    grid-template-columns: 1fr;
  }

  .chat-message-group.role-user .chat-message-avatar,
  .chat-message-group.role-user .chat-message-stack {
    order: initial;
  }

  .chat-message-bubble {
    max-width: 100%;
  }
}
</style>
