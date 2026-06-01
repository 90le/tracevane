<template>
  <div class="chat-shell-session-filter-layer">
    <div class="chat-shell-session-filter-main">
      <label class="chat-shell-session-search">
        <input
          :value="searchText"
          class="chat-shell-session-field"
          type="search"
          :placeholder="text('搜索标题、Agent、摘要、来源', 'Search title, agent, preview, source')"
          @input="$emit('update:search-text', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <PopoverRoot v-if="!isCompactViewport" :open="filterPanelOpen" @update:open="handleFilterPanelOpenChange">
        <PopoverTrigger as-child>
          <button
            type="button"
            class="chat-shell-session-filter-button"
            :class="{ active: filterPanelOpen || hasActiveFilters }"
            :aria-expanded="String(filterPanelOpen)"
          >
            {{ text('筛选', 'Filter') }}
          </button>
        </PopoverTrigger>

        <PopoverPortal>
          <PopoverContent
            :class="['chat-shell-session-filter-popover', theme === 'light' ? 'theme-light' : 'theme-dark']"
            side="bottom"
            align="end"
            :side-offset="10"
            :collision-padding="16"
            @open-auto-focus.prevent
            @close-auto-focus.prevent
          >
            <div class="chat-shell-session-filter-legend">
              {{ text('Agent + Source', 'Agent + Source') }}
            </div>
            <div class="chat-shell-session-filter-field">
              <span>{{ text('Agent', 'Agent') }}</span>
              <div
                class="chat-shell-session-filter-agent-list"
                role="listbox"
                :aria-label="text('按 Agent 筛选', 'Filter by agent')"
              >
                <button
                  type="button"
                  class="chat-shell-session-filter-agent-option"
                  :class="{ active: selectedAgentFilter === 'all' }"
                  :aria-selected="selectedAgentFilter === 'all'"
                  @click="$emit('update:selected-agent-filter', 'all')"
                >
                  {{ text('全部 Agent', 'All agents') }}
                </button>
                <button
                  v-for="agent in availableAgentOptions"
                  :key="agent.id"
                  type="button"
                  class="chat-shell-session-filter-agent-option"
                  :class="{ active: selectedAgentFilter === agent.id }"
                  :aria-selected="selectedAgentFilter === agent.id"
                  @click="$emit('update:selected-agent-filter', agent.id)"
                >
                  {{ agent.label }}
                </button>
              </div>
            </div>
            <div class="chat-shell-session-filter-field">
              <span>{{ text('来源', 'Source') }}</span>
              <div
                class="chat-shell-session-filter-agent-list"
                role="listbox"
                :aria-label="text('按来源筛选', 'Filter by source')"
              >
                <button
                  type="button"
                  class="chat-shell-session-filter-agent-option"
                  :class="{ active: selectedSourceFilter === 'all' }"
                  :aria-selected="selectedSourceFilter === 'all'"
                  @click="$emit('update:selected-source-filter', 'all')"
                >
                  {{ text('全部来源', 'All sources') }}
                </button>
                <button
                  v-for="source in availableSourceOptions"
                  :key="source.id"
                  type="button"
                  class="chat-shell-session-filter-agent-option"
                  :class="{ active: selectedSourceFilter === source.id }"
                  :aria-selected="selectedSourceFilter === source.id"
                  @click="$emit('update:selected-source-filter', source.id)"
                >
                  {{ source.label }}
                </button>
              </div>
            </div>
            <div class="chat-shell-session-filter-popover__actions">
              <button type="button" class="chat-shell-link-button" @click="$emit('clear-filters')">
                {{ text('清空全部', 'Clear all') }}
              </button>
              <button
                type="button"
                class="secondary-button compact-button"
                @click="handleFilterPanelOpenChange(false)"
              >
                {{ text('完成', 'Done') }}
              </button>
            </div>
            <PopoverArrow
              :class="['chat-shell-session-filter-arrow', theme === 'light' ? 'theme-light' : 'theme-dark']"
              :width="16"
              :height="8"
            />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>

      <button
        v-else
        type="button"
        class="chat-shell-session-filter-button"
        :class="{ active: filterPanelOpen || hasActiveFilters }"
        :aria-expanded="String(filterPanelOpen)"
        @click="handleFilterPanelOpenChange(!filterPanelOpen)"
      >
        {{ text('筛选', 'Filter') }}
      </button>
    </div>

    <div
      v-if="isCompactViewport && filterPanelOpen"
      :class="['chat-shell-session-filter-mobile-sheet', theme === 'light' ? 'theme-light' : 'theme-dark']"
    >
      <div class="chat-shell-session-filter-legend">
        {{ text('Agent + Source', 'Agent + Source') }}
      </div>
      <div class="chat-shell-session-filter-field">
        <span>{{ text('Agent', 'Agent') }}</span>
        <div
          class="chat-shell-session-filter-agent-list"
          role="listbox"
          :aria-label="text('按 Agent 筛选', 'Filter by agent')"
        >
          <button
            type="button"
            class="chat-shell-session-filter-agent-option"
            :class="{ active: selectedAgentFilter === 'all' }"
            :aria-selected="selectedAgentFilter === 'all'"
            @click="$emit('update:selected-agent-filter', 'all')"
          >
            {{ text('全部 Agent', 'All agents') }}
          </button>
          <button
            v-for="agent in availableAgentOptions"
            :key="agent.id"
            type="button"
            class="chat-shell-session-filter-agent-option"
            :class="{ active: selectedAgentFilter === agent.id }"
            :aria-selected="selectedAgentFilter === agent.id"
            @click="$emit('update:selected-agent-filter', agent.id)"
          >
            {{ agent.label }}
          </button>
        </div>
      </div>
      <div class="chat-shell-session-filter-field">
        <span>{{ text('来源', 'Source') }}</span>
        <div
          class="chat-shell-session-filter-agent-list"
          role="listbox"
          :aria-label="text('按来源筛选', 'Filter by source')"
        >
          <button
            type="button"
            class="chat-shell-session-filter-agent-option"
            :class="{ active: selectedSourceFilter === 'all' }"
            :aria-selected="selectedSourceFilter === 'all'"
            @click="$emit('update:selected-source-filter', 'all')"
          >
            {{ text('全部来源', 'All sources') }}
          </button>
          <button
            v-for="source in availableSourceOptions"
            :key="source.id"
            type="button"
            class="chat-shell-session-filter-agent-option"
            :class="{ active: selectedSourceFilter === source.id }"
            :aria-selected="selectedSourceFilter === source.id"
            @click="$emit('update:selected-source-filter', source.id)"
          >
            {{ source.label }}
          </button>
        </div>
      </div>
      <div class="chat-shell-session-filter-popover__actions">
        <button type="button" class="chat-shell-link-button" @click="$emit('clear-filters')">
          {{ text('清空全部', 'Clear all') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button"
          @click="handleFilterPanelOpenChange(false)"
        >
          {{ text('完成', 'Done') }}
        </button>
      </div>
    </div>

    <div v-if="activeFilterChips.length" class="chat-shell-session-filter-state">
      <div class="chat-shell-session-filter-chips">
        <button
          v-for="chip in activeFilterChips"
          :key="chip.id"
          type="button"
          class="chat-shell-session-filter-chip"
          @click="$emit('clear-filter-chip', chip.id)"
        >
          <span>{{ chip.label }}</span>
          <X class="drawer-close-icon" aria-hidden="true" />
        </button>
      </div>

      <button
        v-if="hasActiveFilters"
        type="button"
        class="chat-shell-link-button"
        @click="$emit('clear-filters')"
      >
        {{ text('清空全部', 'Clear all') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import './session-filter.css';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';
import type { ChatSessionFilterChip } from '../../../../../lib/chat-session-catalog';
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  searchText: string;
  hasActiveFilters: boolean;
  activeFilterChips: ChatSessionFilterChip[];
  filterPanelOpen: boolean;
  availableAgentOptions: Array<{ id: string; label: string }>;
  availableSourceOptions: Array<{ id: string; label: string }>;
  selectedAgentFilter: string;
  selectedSourceFilter: string;
  theme: 'light' | 'dark';
}>();

const emit = defineEmits<{
  (event: 'update:search-text', value: string): void;
  (event: 'update:filter-panel-open', value: boolean): void;
  (event: 'clear-filters'): void;
  (event: 'clear-filter-chip', chipId: string): void;
  (event: 'update:selected-agent-filter', value: string): void;
  (event: 'update:selected-source-filter', value: string): void;
}>();

const { text } = useLocalePreference();
const isCompactViewport = ref(false);
let compactViewportMediaQuery: MediaQueryList | null = null;
let compactViewportListener: ((event: MediaQueryListEvent) => void) | null = null;

function syncCompactViewport(): void {
  if (!compactViewportMediaQuery) {
    isCompactViewport.value = false;
    return;
  }
  isCompactViewport.value = compactViewportMediaQuery.matches;
}

function bindCompactViewport(): void {
  if (typeof window === 'undefined') {
    return;
  }
  compactViewportMediaQuery = window.matchMedia('(max-width: 1040px)');
  compactViewportListener = () => {
    syncCompactViewport();
  };
  syncCompactViewport();
  if ('addEventListener' in compactViewportMediaQuery) {
    compactViewportMediaQuery.addEventListener('change', compactViewportListener);
  } else {
    compactViewportMediaQuery.addListener(compactViewportListener);
  }
}

function unbindCompactViewport(): void {
  if (!compactViewportMediaQuery || !compactViewportListener) {
    return;
  }
  if ('removeEventListener' in compactViewportMediaQuery) {
    compactViewportMediaQuery.removeEventListener('change', compactViewportListener);
  } else {
    compactViewportMediaQuery.removeListener(compactViewportListener);
  }
  compactViewportMediaQuery = null;
  compactViewportListener = null;
}

onMounted(bindCompactViewport);
onBeforeUnmount(unbindCompactViewport);

function handleFilterPanelOpenChange(open: boolean): void {
  emit('update:filter-panel-open', open);
}
</script>
