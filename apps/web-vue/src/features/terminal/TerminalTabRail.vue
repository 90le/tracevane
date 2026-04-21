<template>
  <nav class="terminal-tab-rail" aria-label="Terminal sessions">
    <div
      v-for="tab in tabs"
      :key="tab.sessionId"
      class="terminal-tab"
      :class="{ active: tab.sessionId === activeSessionId }"
    >
      <template v-if="editingSessionId === tab.sessionId">
        <input
          v-model="renameDraft"
          class="terminal-tab-rename-input"
          type="text"
          @keydown.enter.prevent="saveRename(tab.sessionId)"
          @keydown.esc.prevent="cancelRename"
        />
        <button
          type="button"
          class="terminal-tab-rename-save"
          @click="saveRename(tab.sessionId)"
        >
          保存
        </button>
        <button
          type="button"
          class="terminal-tab-rename-cancel"
          @click="cancelRename"
        >
          取消
        </button>
      </template>

      <template v-else>
        <button type="button" class="terminal-tab-select" @click="$emit('select', tab.sessionId)">
          <span class="terminal-tab-title">{{ tab.title || tab.sessionId }}</span>
          <span class="terminal-tab-status" :data-tone="buildTerminalSessionStatusSummary({
            status: tab.status,
            controlState: tab.controlState,
            canResume: tab.canResume,
          }).tone">
            {{ buildTerminalSessionStatusSummary({
              status: tab.status,
              controlState: tab.controlState,
              canResume: tab.canResume,
            }).labelZh }}
          </span>
        </button>
        <button
          type="button"
          class="terminal-tab-rename"
          aria-label="Rename tab"
          @click="startRename(tab)"
        >
          ⋯
        </button>
        <button
          type="button"
          class="terminal-tab-close"
          aria-label="Close tab"
          @click="$emit('close', tab.sessionId)"
        >
          ×
        </button>
        <button
          v-if="tab.status === 'running' || tab.status === 'detached'"
          type="button"
          class="terminal-tab-end"
          aria-label="End session"
          @click="$emit('end', tab.sessionId)"
        >
          结束
        </button>
        <button
          v-if="tab.status === 'completed' || tab.status === 'failed' || tab.status === 'lost'"
          type="button"
          class="terminal-tab-delete"
          aria-label="Delete session"
          @click="$emit('delete', tab.sessionId)"
        >
          删除
        </button>
      </template>
    </div>

    <button type="button" class="terminal-tab terminal-tab-add" @click="$emit('create')">
      +
    </button>
  </nav>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import { buildTerminalSessionStatusSummary } from './terminal-session-selectors';

defineProps<{
  tabs: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', sessionId: string): void;
  (e: 'close', sessionId: string): void;
  (e: 'rename', payload: { sessionId: string; title: string }): void;
  (e: 'end', sessionId: string): void;
  (e: 'delete', sessionId: string): void;
  (e: 'create'): void;
}>();

const editingSessionId = ref<string | null>(null);
const renameDraft = ref('');

function startRename(tab: TerminalSessionDescriptor): void {
  editingSessionId.value = tab.sessionId;
  renameDraft.value = tab.title || tab.sessionId;
}

function cancelRename(): void {
  editingSessionId.value = null;
  renameDraft.value = '';
}

function saveRename(sessionId: string): void {
  const normalizedTitle = String(renameDraft.value || '').trim();
  if (!normalizedTitle) {
    cancelRename();
    return;
  }
  emit('rename', { sessionId, title: normalizedTitle });
  cancelRename();
}
</script>
