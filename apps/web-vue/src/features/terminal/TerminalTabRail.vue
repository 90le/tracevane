<template>
  <nav class="terminal-tab-rail" aria-label="Terminal sessions">
    <div
      v-for="tab in visibleTabs"
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
          {{ text('保存', 'Save') }}
        </button>
        <button
          type="button"
          class="terminal-tab-rename-cancel"
          @click="cancelRename"
        >
          {{ text('取消', 'Cancel') }}
        </button>
      </template>

      <template v-else>
        <button type="button" class="terminal-tab-select" @click="$emit('select', tab.sessionId)">
          <span class="terminal-tab-title-row">
            <span class="terminal-tab-title">{{ text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn) }}</span>
            <span class="terminal-tab-source">{{ text(buildTerminalSessionSourceSummary(tab.source).labelZh, buildTerminalSessionSourceSummary(tab.source).labelEn) }}</span>
          </span>
          <span class="terminal-tab-status" :data-tone="getStatusSummary(tab).tone">
            {{ text(getStatusSummary(tab).labelZh, getStatusSummary(tab).labelEn) }}
          </span>
        </button>
        <div v-if="tab.sessionId === activeSessionId" class="terminal-tab-actions">
          <button
            type="button"
            class="terminal-tab-rename"
            :aria-label="text('重命名标签', 'Rename tab')"
            @click="startRename(tab)"
          >
            ⋯
          </button>
          <button
            type="button"
            class="terminal-tab-close"
            :aria-label="text('关闭标签', 'Close tab')"
            @click="$emit('close', tab.sessionId)"
          >
            ×
          </button>
          <button
            v-if="tab.status === 'running' || tab.status === 'detached'"
            type="button"
            class="terminal-tab-end"
            :aria-label="text('结束会话', 'End session')"
            @click="$emit('end', tab.sessionId)"
          >
            {{ text('结束', 'End') }}
          </button>
          <button
            v-if="tab.status === 'completed' || tab.status === 'failed' || tab.status === 'lost'"
            type="button"
            class="terminal-tab-delete"
            :aria-label="text('删除会话', 'Delete session')"
            @click="$emit('delete', tab.sessionId)"
          >
            {{ text('删除', 'Delete') }}
          </button>
        </div>
      </template>
    </div>

    <details v-if="hiddenTabs.length" class="terminal-tab-overflow">
      <summary class="terminal-tab-overflow__trigger">
        {{ text('更多', 'More') }} {{ hiddenTabs.length }}
      </summary>
      <div class="terminal-tab-overflow__menu">
        <button
          v-for="tab in hiddenTabs"
          :key="tab.sessionId"
          type="button"
          class="terminal-tab-overflow__item"
          @click="$emit('select', tab.sessionId)"
        >
          <strong>{{ text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn) }}</strong>
          <span>{{ text(getStatusSummary(tab).labelZh, getStatusSummary(tab).labelEn) }}</span>
        </button>
      </div>
    </details>

    <button type="button" class="terminal-tab terminal-tab-add" @click="$emit('create')">
      <span class="terminal-tab-title">{{ text('终端', 'Shell') }}</span>
      <span class="terminal-tab-status">{{ text('空白', 'Blank') }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import {
  buildTerminalSessionDisplayTitle,
  buildTerminalSessionSourceSummary,
  buildTerminalSessionStatusSummary,
} from './terminal-session-selectors';
const { text } = useLocalePreference();

const props = defineProps<{
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
const compactMode = ref(false);

function updateCompactMode(): void {
  compactMode.value = typeof window !== 'undefined' && window.innerWidth <= 720;
}

const visibleTabs = computed(() => {
  if (!compactMode.value || props.tabs.length <= 2) {
    return props.tabs;
  }

  const keep = new Set<string>();
  if (props.activeSessionId) {
    keep.add(props.activeSessionId);
  }

  for (let index = props.tabs.length - 1; index >= 0 && keep.size < 2; index -= 1) {
    keep.add(props.tabs[index].sessionId);
  }

  return props.tabs.filter((tab) => keep.has(tab.sessionId));
});

const hiddenTabs = computed(() => {
  const visibleIds = new Set(visibleTabs.value.map((tab) => tab.sessionId));
  return props.tabs.filter((tab) => !visibleIds.has(tab.sessionId));
});

onMounted(() => {
  updateCompactMode();
  window.addEventListener('resize', updateCompactMode);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateCompactMode);
});

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

function getStatusSummary(tab: TerminalSessionDescriptor) {
  return buildTerminalSessionStatusSummary({
    status: tab.status,
    controlState: tab.controlState,
    canResume: tab.canResume,
  });
}

function buildDisplayTitle(tab: TerminalSessionDescriptor) {
  return buildTerminalSessionDisplayTitle({
    title: tab.title,
    sessionId: tab.sessionId,
  });
}
</script>
