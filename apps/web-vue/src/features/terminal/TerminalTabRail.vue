<template>
  <nav class="terminal-tab-rail" aria-label="Terminal sessions" role="tablist">
    <div class="terminal-tab-scroll">
      <div
        v-for="tab in visibleTabs"
        :key="tab.sessionId"
        class="terminal-tab"
        :class="{ active: tab.sessionId === activeSessionId }"
        role="presentation"
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
          <button
            type="button"
            class="terminal-tab-select"
            role="tab"
            :aria-selected="tab.sessionId === activeSessionId"
            :title="tabTooltip(tab)"
            @click="$emit('select', tab.sessionId)"
            @dblclick="startRename(tab)"
            @keydown.enter.prevent="$emit('select', tab.sessionId)"
            @keydown.space.prevent="$emit('select', tab.sessionId)"
            @keydown.f2.prevent="startRename(tab)"
            @keydown.delete.prevent="$emit('close', tab.sessionId)"
          >
            <span class="terminal-tab-title-row">
              <span class="terminal-tab-dot" :data-tone="getStatusSummary(tab).tone"></span>
              <span class="terminal-tab-title">{{ text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn) }}</span>
            </span>
            <span class="terminal-tab-status" :data-tone="getStatusSummary(tab).tone">
              {{ text(getStatusSummary(tab).labelZh, getStatusSummary(tab).labelEn) }} · {{ shortSessionId(tab.sessionId) }}
            </span>
          </button>
          <div v-if="tab.sessionId === activeSessionId" class="terminal-tab-actions">
            <button
              type="button"
              class="terminal-tab-close"
              :aria-label="text('关闭标签', 'Close tab')"
              @click="$emit('close', tab.sessionId)"
            >
              ×
            </button>
            <details class="terminal-tab-menu">
              <summary class="terminal-tab-menu__trigger" :aria-label="text('标签操作', 'Tab actions')">⋯</summary>
              <div class="terminal-tab-menu__panel">
                <button type="button" @click="startRename(tab)">
                  {{ text('重命名', 'Rename') }}
                </button>
                <button
                  v-if="tab.status === 'running' || tab.status === 'detached'"
                  type="button"
                  @click="$emit('end', tab.sessionId)"
                >
                  {{ text('结束会话', 'End Session') }}
                </button>
                <button
                  v-if="tab.status === 'completed' || tab.status === 'failed' || tab.status === 'lost'"
                  type="button"
                  class="danger"
                  @click="$emit('delete', tab.sessionId)"
                >
                  {{ text('删除会话', 'Delete Session') }}
                </button>
              </div>
            </details>
          </div>
        </template>
      </div>
    </div>

    <div class="terminal-tab-rail-actions">
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

      <button
        type="button"
        class="terminal-tab-add"
        :title="text('新建终端标签', 'New terminal tab')"
        :aria-label="text('新建终端标签', 'New terminal tab')"
        @click="$emit('create')"
      >
        <span class="terminal-tab-add__icon">+</span>
        <span class="terminal-tab-add__copy">
          <strong>{{ text('终端', 'Shell') }}</strong>
          <small>{{ text('新建', 'New') }}</small>
        </span>
      </button>
    </div>
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

function shortSessionId(sessionId: string): string {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return '';
  return normalized.length <= 8 ? normalized : normalized.slice(0, 8);
}

function buildDisplayTitle(tab: TerminalSessionDescriptor) {
  return buildTerminalSessionDisplayTitle({
    title: tab.title,
    sessionId: tab.sessionId,
  });
}

function tabTooltip(tab: TerminalSessionDescriptor): string {
  const title = text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn);
  const source = text(buildTerminalSessionSourceSummary(tab.source).labelZh, buildTerminalSessionSourceSummary(tab.source).labelEn);
  const status = text(getStatusSummary(tab).labelZh, getStatusSummary(tab).labelEn);
  return `${title} · ${source} · ${status} · ${tab.sessionId}`;
}
</script>
