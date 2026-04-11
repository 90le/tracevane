<template>
  <div class="chat-composer-shell">
    <div class="chat-composer-frame">
      <button type="button" class="chat-composer-side-action" disabled :title="text('附件入口预留，当前未开放。', 'Attachment entry is reserved but not open yet.')">
        ＋
      </button>
      <textarea
        :value="modelValue"
        class="chat-composer-textarea"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown="$emit('keydown', $event)"
      ></textarea>
      <div class="chat-composer-main-actions">
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="!canAbort"
          @click="$emit('abort')"
        >
          {{ abortBusy ? text('停止中...', 'Stopping...') : text('停止', 'Stop') }}
        </button>
        <button
          type="button"
          class="primary-button compact-button"
          :disabled="!canSend"
          @click="$emit('send')"
        >
          {{ sendBusy ? text('发送中...', 'Sending...') : text('发送', 'Send') }}
        </button>
      </div>
    </div>

    <div class="chat-composer-hints">
      <span class="surface-note">{{ text('Enter 发送，Shift+Enter 换行。', 'Press Enter to send, Shift+Enter for newline.') }}</span>
      <span class="surface-note">{{ text('Agent 在“新建会话”动作里选择。', 'Choose the agent inside the new-chat action.') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatToolCard } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  modelValue: string;
  placeholder: string;
  disabled: boolean;
  canSend: boolean;
  canAbort: boolean;
  sendBusy: boolean;
  abortBusy: boolean;
  inlineTools: ChatToolCard[];
}>();

defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'send'): void;
  (event: 'abort'): void;
  (event: 'keydown', payload: KeyboardEvent): void;
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.chat-composer-shell {
  display: grid;
  gap: 8px;
  padding: 0;
  background: transparent;
  flex-shrink: 0;
}

.chat-composer-frame {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--chat-input-border);
  border-radius: 20px;
  background: var(--chat-input-bg);
  box-shadow: var(--chat-input-shadow);
}

.chat-composer-side-action {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid var(--chat-border);
  background: var(--chat-surface-muted);
  color: var(--chat-text-soft);
}

.chat-composer-textarea {
  min-height: 56px;
  max-height: 140px;
  overflow: auto;
  resize: none;
  border: none;
  background: transparent;
  color: var(--chat-text);
  padding: 4px 0;
  font: inherit;
  line-height: 1.55;
}

.chat-composer-textarea:focus {
  outline: none;
}

.chat-composer-textarea:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.chat-composer-main-actions {
  display: grid;
  gap: 8px;
}

.chat-composer-hints {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 4px;
}

@media (max-width: 760px) {
  .chat-composer-frame {
    grid-template-columns: 1fr;
  }

  .chat-composer-main-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
