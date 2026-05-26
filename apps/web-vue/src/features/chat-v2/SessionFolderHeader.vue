<template>
  <section class="chat-shell-session-subheader">
    <div class="chat-shell-session-subheader__topline">
      <button type="button" class="chat-shell-link-button" @click="$emit('leave-folder')">
        {{ text('← 返回根目录', '← Back to root') }}
      </button>

      <nav class="chat-shell-session-list__breadcrumb">
        <button type="button" class="chat-shell-link-button" @click="$emit('leave-folder')">
          {{ text('会话', 'Chats') }}
        </button>
        <template v-if="archiveViewOpen">
          <span>/</span>
          <strong>{{ currentFolderLabel }}</strong>
        </template>
        <template v-else>
          <template v-for="(folder, index) in currentFolderPath" :key="folder.id">
            <span>/</span>
            <strong v-if="index === currentFolderPath.length - 1">{{ folder.title }}</strong>
            <button
              v-else
              type="button"
              class="chat-shell-link-button"
              @click="$emit('enter-folder', folder.id)"
            >
              {{ folder.title }}
            </button>
          </template>
        </template>
      </nav>
    </div>

    <div class="chat-shell-session-subheader__main">
      <div class="chat-shell-session-subheader__copy">
        <span class="chat-shell-session-subheader__badge">
          {{ archiveViewOpen ? text('归档视图', 'Archive view') : text('文件夹视图', 'Folder view') }}
        </span>

        <form
          v-if="renamingCurrentFolder"
          class="chat-shell-folder-rename-form chat-shell-folder-rename-form--header"
          @submit.prevent="$emit('submit-folder-rename')"
        >
          <input
            :value="folderRenameDraft"
            class="chat-shell-session-field"
            type="text"
            :placeholder="text('输入文件夹名称', 'Enter a folder name')"
            @input="$emit('update:folder-rename-draft', ($event.target as HTMLInputElement).value)"
            @keydown.escape.prevent="$emit('cancel-folder-rename')"
          />
          <div class="chat-shell-folder-rename-form__actions">
            <button
              type="submit"
              class="secondary-button compact-button"
              :disabled="!folderRenameDraft.trim()"
            >
              {{ text('保存', 'Save') }}
            </button>
            <button type="button" class="chat-shell-link-button" @click="$emit('cancel-folder-rename')">
              {{ text('取消', 'Cancel') }}
            </button>
          </div>
        </form>

        <template v-else>
          <h3>{{ currentFolderLabel }}</h3>
          <p>{{ currentViewSummary }}</p>
        </template>
      </div>

      <div class="chat-shell-session-subheader__actions">
        <button
          v-if="canRename && !renamingCurrentFolder"
          type="button"
          class="chat-shell-link-button"
          @click="$emit('start-folder-rename')"
        >
          {{ text('重命名', 'Rename') }}
        </button>
        <button
          v-if="canRename"
          type="button"
          class="secondary-button compact-button"
          @click="$emit('open-create-folder')"
        >
          {{ text('新建子文件夹', 'New subfolder') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ChatSessionFolder } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import './session-list-shared.css';

defineProps<{
  archiveViewOpen: boolean;
  currentFolderLabel: string;
  currentFolderPath: ChatSessionFolder[];
  renamingCurrentFolder: boolean;
  folderRenameDraft: string;
  currentViewSummary: string;
  canRename: boolean;
}>();

defineEmits<{
  (event: 'leave-folder'): void;
  (event: 'enter-folder', folderId: string): void;
  (event: 'start-folder-rename'): void;
  (event: 'update:folder-rename-draft', value: string): void;
  (event: 'cancel-folder-rename'): void;
  (event: 'submit-folder-rename'): void;
  (event: 'open-create-folder'): void;
}>();

const { text } = useLocalePreference();
</script>
