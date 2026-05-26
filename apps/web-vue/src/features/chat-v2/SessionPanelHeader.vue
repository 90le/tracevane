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
import './session-list-shared.css';

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
