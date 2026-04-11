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

<style scoped>
.chat-shell-session-batchbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 18px 12px;
  border-bottom: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-hover) 82%, transparent 18%);
}

.chat-shell-session-batchbar__summary {
  font-size: 12px;
  font-weight: 600;
  color: var(--chat-text-soft);
  margin-right: auto;
}

.chat-shell-session-batchbar__group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-shell-session-batchbar__group.danger {
  margin-left: auto;
}

.chat-shell-session-batchbar__toggle-all {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--chat-accent) 36%, var(--chat-line) 64%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--chat-accent) 12%, var(--chat-modal-row) 88%);
  color: var(--chat-text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.chat-shell-session-batchbar__toggle-all:hover {
  background: color-mix(in srgb, var(--chat-accent) 18%, var(--chat-hover) 82%);
  border-color: color-mix(in srgb, var(--chat-accent) 52%, var(--chat-line) 48%);
}

.chat-shell-session-batchbar__toggle-all.active {
  background: color-mix(in srgb, var(--chat-accent) 24%, var(--chat-hover) 76%);
  border-color: color-mix(in srgb, var(--chat-accent) 72%, var(--chat-line) 28%);
  color: var(--chat-accent);
}

.chat-shell-session-batchbar :deep(.compact-button.danger) {
  border-color: color-mix(in srgb, #c2410c 36%, var(--chat-line) 64%);
  color: #c2410c;
  background: color-mix(in srgb, #c2410c 10%, var(--chat-modal-row) 90%);
}

@media (max-width: 1040px) {
  .chat-shell-session-batchbar {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
