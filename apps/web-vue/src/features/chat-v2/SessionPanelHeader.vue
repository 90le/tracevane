<template>
  <header class="chat-shell-session-list__header">
    <div class="chat-shell-session-list__copy">
      <p class="chat-shell-session-list__eyebrow">{{ text('最近会话', 'Recent chats') }}</p>
      <strong class="chat-shell-session-list__title">{{ text('会话列表', 'Conversation rail') }}</strong>
      <span class="chat-shell-session-list__summary">
        {{
          currentFolder
            ? text('当前在文件夹中浏览会话。', 'Browsing chats inside a folder.')
            : selectionMode
              ? text('选择模式已开启，可以批量整理会话。', 'Selection mode is on for bulk organizing.')
              : text('最近会话按状态、更新时间和预览排序。', 'Recent chats are sorted by status, update time, and preview.')
        }}
      </span>
    </div>

    <div class="chat-shell-session-list__actions">
      <button
        v-if="inspectMode"
        type="button"
        class="chat-shell-link-button chat-shell-session-list__ghost-action"
        @click="$emit('toggle-inspect')"
      >
        {{ text('聊天', 'Chat') }}
      </button>
      <button type="button" class="secondary-button compact-button chat-shell-session-list__soft-action" @click="$emit('open-create-folder')">
        {{ currentFolder ? text('子文件夹', 'Subfolder') : text('文件夹', 'Folder') }}
      </button>
      <button
        type="button"
        class="secondary-button compact-button chat-shell-session-list__soft-action"
        @click="$emit('toggle-selection-mode')"
      >
        {{ selectionMode ? text('完成', 'Done') : text('选择', 'Select') }}
      </button>
      <button type="button" class="primary-button compact-button chat-new-chat-trigger chat-shell-session-list__primary-action" @click="$emit('new-chat')">
        {{ text('新建', 'New') }}
      </button>
    </div>
  </header>

  <div v-if="creatingFolderOpen" class="chat-shell-session-createbar">
    <form class="chat-shell-folder-rename-form chat-shell-folder-create-form" @submit.prevent="$emit('submit-create-folder')">
      <input
        :value="createFolderDraft"
        class="chat-shell-session-field"
        type="text"
        :placeholder="text('输入文件夹名称', 'Enter a folder name')"
        @input="$emit('update:create-folder-draft', ($event.target as HTMLInputElement).value)"
        @keydown.escape.prevent="$emit('cancel-create-folder')"
      />
      <div class="chat-shell-folder-rename-form__actions">
        <button
          type="submit"
          class="secondary-button compact-button"
          :disabled="!createFolderDraft.trim()"
        >
          {{ text('创建', 'Create') }}
        </button>
        <button type="button" class="chat-shell-link-button" @click="$emit('cancel-create-folder')">
          {{ text('取消', 'Cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  inspectMode: boolean;
  currentFolder: boolean;
  selectionMode: boolean;
  creatingFolderOpen: boolean;
  createFolderDraft: string;
}>();

defineEmits<{
  (event: 'toggle-inspect'): void;
  (event: 'open-create-folder'): void;
  (event: 'update:create-folder-draft', value: string): void;
  (event: 'cancel-create-folder'): void;
  (event: 'submit-create-folder'): void;
  (event: 'toggle-selection-mode'): void;
  (event: 'new-chat'): void;
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.chat-shell-session-list__header {
  display: grid;
  gap: 10px;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--chat-line);
}

.chat-shell-session-list__copy {
  display: grid;
  gap: 3px;
}

.chat-shell-session-list__eyebrow {
  margin: 0;
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.chat-shell-session-list__title {
  color: var(--chat-text);
  font-size: 16px;
  line-height: 1.25;
}

.chat-shell-session-list__summary {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.chat-shell-session-list__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
}

.chat-shell-session-list__ghost-action,
.chat-shell-session-list__soft-action,
.chat-shell-session-list__primary-action {
  min-height: 34px;
  border-radius: 999px;
}

.chat-shell-session-list__actions :deep(.compact-button),
.chat-shell-session-list__actions :deep(.chat-shell-link-button) {
  min-height: 34px;
  padding-inline: 12px;
  font-size: 12px;
  border-radius: 999px;
}

.chat-shell-session-list__actions :deep(.primary-button.compact-button) {
  padding-inline: 14px;
}

.chat-shell-session-createbar {
  padding: 10px 18px 0;
}

.chat-shell-folder-create-form {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-hover) 72%, transparent 28%);
}

@media (max-width: 1040px) {
  .chat-shell-session-list__header {
    padding: 14px 14px 10px;
  }

  .chat-shell-session-createbar {
    padding-left: 16px;
    padding-right: 16px;
  }

  .chat-shell-session-list__actions {
    gap: 6px;
  }

  .chat-shell-session-list__actions :deep(.compact-button),
  .chat-shell-session-list__actions :deep(.chat-shell-link-button) {
    min-height: 32px;
    padding-inline: 10px;
  }
}
</style>
