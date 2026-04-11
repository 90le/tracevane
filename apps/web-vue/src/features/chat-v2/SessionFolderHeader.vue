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

<style scoped>
.chat-shell-session-subheader {
  display: grid;
  gap: 10px;
  margin: 2px 8px 0;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-hover) 74%, transparent 26%);
}

.chat-shell-session-subheader__topline,
.chat-shell-session-subheader__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.chat-shell-session-list__breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--chat-text-soft);
}

.chat-shell-session-list__breadcrumb strong {
  color: var(--chat-text);
}

.chat-shell-session-subheader__copy {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.chat-shell-session-subheader__copy h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.05;
  color: var(--chat-text);
}

.chat-shell-session-subheader__copy p {
  margin: 0;
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.chat-shell-session-subheader__badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent 86%);
  color: var(--chat-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.chat-shell-session-subheader__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
