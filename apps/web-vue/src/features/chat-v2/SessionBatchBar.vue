<template>
  <div class="chat-shell-session-batchbar">
    <span class="chat-shell-session-batchbar__summary">
      {{ text(`已选 ${selectedCount} 个会话`, `${selectedCount} chats selected`) }}
    </span>

    <div class="chat-shell-session-batchbar__group">
      <button
        type="button"
        class="chat-shell-session-batchbar__toggle-all"
        :class="{ active: allVisibleSessionsSelected }"
        @click="$emit('toggle-select-all-visible')"
      >
        {{ allVisibleSessionsSelected ? text('反选', 'Invert') : text('全选', 'Select all') }}
      </button>
    </div>

    <div v-if="!archiveViewOpen" class="chat-shell-session-batchbar__group">
      <button
        type="button"
        class="secondary-button compact-button"
        :disabled="!selectedCount || !hasBatchDestinationTarget"
        @click="$emit('open-batch-folder-picker', $event)"
      >
        {{ text('移动到…', 'Move to...') }}
      </button>
      <button
        type="button"
        class="secondary-button compact-button"
        :disabled="!selectedCount || !selectedSessionsHaveFolderMembership"
        @click="$emit('remove-from-folder')"
      >
        {{ text('移出文件夹', 'Remove from folder') }}
      </button>
    </div>

    <div class="chat-shell-session-batchbar__group">
      <button
        type="button"
        class="secondary-button compact-button"
        :disabled="!selectedCount"
        @click="$emit('batch-action', archiveViewOpen ? 'unarchive' : 'archive')"
      >
        {{ archiveViewOpen ? text('取消归档', 'Unarchive') : text('归档', 'Archive') }}
      </button>
    </div>

    <div class="chat-shell-session-batchbar__group danger">
      <button
        type="button"
        class="secondary-button compact-button danger"
        :disabled="!selectedCount"
        @click="$emit('batch-action', 'delete')"
      >
        {{ text('删除', 'Delete') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';
import './session-list-shared.css';

defineProps<{
  selectedCount: number;
  archiveViewOpen: boolean;
  allVisibleSessionsSelected: boolean;
  hasBatchDestinationTarget: boolean;
  selectedSessionsHaveFolderMembership: boolean;
}>();

defineEmits<{
  (event: 'toggle-select-all-visible'): void;
  (event: 'open-batch-folder-picker', mouseEvent: MouseEvent): void;
  (event: 'remove-from-folder'): void;
  (event: 'batch-action', action: 'archive' | 'unarchive' | 'delete'): void;
}>();

const { text } = useLocalePreference();
</script>
