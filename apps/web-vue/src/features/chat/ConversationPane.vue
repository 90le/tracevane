<template>
  <section class="chat-conversation-pane">
    <div v-if="gatewayWarning" class="status-banner status-banner-error">{{ gatewayWarning }}</div>

    <div class="chat-conversation-body">
      <section class="chat-conversation-thread" ref="threadBody">
        <div v-if="accessError" class="chat-conversation-empty chat-conversation-empty-error">
          <h3>{{ text('这个会话当前不在开放聊天面里', 'This session is not open in the main chat surface') }}</h3>
          <p>{{ accessError }}</p>
          <button type="button" class="secondary-button compact-button" @click="$emit('toggle-inspect')">
            {{ text('改用调试台查看', 'Open workbench instead') }}
          </button>
        </div>
        <div v-else-if="!selectedSession" class="chat-conversation-empty chat-conversation-empty-idle">
          <div class="chat-conversation-empty-hero">
            <div class="chat-conversation-empty-avatar">
              <AgentAvatarContent
                :avatar="agentAvatar"
                :emoji="agentEmoji"
                :fallback="agentInitial"
                :alt="agentName"
              />
            </div>
            <div>
              <h3>{{ text('开始新的聊天', 'Start a new chat') }}</h3>
              <p>{{ text('左侧固定保留你的会话列表。点击“新建会话”后再选择 Agent。', 'Your conversation list stays fixed on the left. Click “New chat” and choose an agent inside the flow.') }}</p>
            </div>
          </div>
          <div class="chat-conversation-empty-actions">
            <button type="button" class="primary-button compact-button" @click="$emit('new-chat')">
              {{ text('新建会话', 'New chat') }}
            </button>
          </div>
        </div>
        <div v-else-if="historyLoading" class="chat-conversation-empty">
          {{ text('正在读取对话...', 'Loading conversation...') }}
        </div>
        <div v-else-if="historyErrorMessage" class="chat-conversation-empty chat-conversation-empty-error">
          {{ historyErrorMessage }}
        </div>
        <div v-else-if="!messageGroups.length" class="chat-conversation-empty">
          <h3>{{ text('这里还没有消息', 'No messages yet') }}</h3>
          <p>{{ text('从底部输入框开始，新的消息会在这里展开。', 'Use the composer below and the conversation will start here.') }}</p>
        </div>
        <div v-else class="chat-conversation-groups">
          <MessageBubble
            v-for="group in messageGroups"
            :key="group.id"
            :group="group"
            :agent-name="agentName"
            :agent-avatar="agentAvatar"
            :agent-emoji="agentEmoji"
            :agent-initial="agentInitial"
            :active-run-id="activeRunId"
          />
        </div>
      </section>

      <ComposerBar
        v-model="draft"
        :placeholder="placeholder"
        :disabled="composerDisabled"
        :can-send="canSend"
        :can-abort="canAbort"
        :send-busy="sendBusy"
        :abort-busy="abortBusy"
        :inline-tools="inlineTools"
        @send="$emit('send')"
        @abort="$emit('abort')"
        @keydown="$emit('composer-keydown', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { ChatMessageGroup } from './message-groups';
import type { ChatSessionRow, ChatToolCard } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import ComposerBar from './ComposerBar.vue';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import MessageBubble from './MessageBubble.vue';

const props = defineProps<{
  selectedSession: ChatSessionRow | null;
  title: string;
  subtitle: string;
  agentName: string;
  agentAvatar: string;
  agentEmoji: string;
  agentInitial: string;
  messageGroups: ChatMessageGroup[];
  historyLoading: boolean;
  historyErrorMessage: string;
  accessError: string;
  gatewayWarning: string;
  draft: string;
  placeholder: string;
  composerDisabled: boolean;
  canSend: boolean;
  canAbort: boolean;
  canReset: boolean;
  sendBusy: boolean;
  abortBusy: boolean;
  inspectOpen: boolean;
  inspectPinned: boolean;
  activeRunId: string | null;
  inlineTools: ChatToolCard[];
}>();

const emit = defineEmits<{
  (event: 'update:draft', value: string): void;
  (event: 'send'): void;
  (event: 'abort'): void;
  (event: 'reset'): void;
  (event: 'new-chat'): void;
  (event: 'toggle-inspect'): void;
  (event: 'open-session-list'): void;
  (event: 'composer-keydown', payload: KeyboardEvent): void;
}>();

const { text } = useLocalePreference();
const threadBody = ref<HTMLElement | null>(null);

const draft = computed({
  get: () => props.draft,
  set: (value: string) => emit('update:draft', value),
});

watch(
  () => props.messageGroups.length,
  async () => {
    await nextTick();
    threadBody.value?.scrollTo({ top: threadBody.value.scrollHeight, behavior: 'smooth' });
  },
);
</script>

<style scoped>
.chat-conversation-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  min-height: calc(100vh - 64px);
  height: calc(100vh - 64px);
  padding: 12px 16px 16px;
  border: 1px solid var(--chat-border);
  border-radius: 24px;
  background: var(--chat-panel-bg);
  box-shadow: var(--chat-shadow);
  overflow: hidden;
}

.chat-conversation-body {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
  overflow: hidden;
}

.chat-conversation-thread {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 16px;
  padding: 10px 12px 0;
  border: 1px solid var(--chat-border);
  border-radius: 22px;
  background: var(--chat-thread-bg);
  overscroll-behavior: contain;
}

.chat-conversation-groups {
  display: grid;
  gap: 18px;
  align-content: start;
  padding-bottom: 12px;
}

.chat-conversation-empty {
  min-height: 300px;
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 28px;
  border: 1px dashed var(--chat-border-strong);
  border-radius: 22px;
  color: var(--chat-text-soft);
  text-align: center;
  background: var(--chat-surface-muted);
}

.chat-conversation-empty h3 {
  margin: 0;
  color: var(--chat-text);
}

.chat-conversation-empty-error {
  color: #dc2626;
}

.chat-conversation-empty-idle {
  align-content: center;
}

.chat-conversation-empty-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
}

.chat-conversation-empty-avatar {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  background: var(--chat-surface-muted);
  border: 1px solid var(--chat-border);
  color: var(--chat-text);
  font-weight: 700;
}

.chat-conversation-empty-hero p {
  margin: 4px 0 0;
}

.chat-conversation-empty-actions {
  display: flex;
  justify-content: center;
}

@media (max-width: 980px) {
  .chat-conversation-pane {
    min-height: auto;
    height: auto;
  }
}

@media (max-width: 760px) {
  .chat-conversation-empty-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
