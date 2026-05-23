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

<style>
.chat-shell-session-filter-layer {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 12px 18px 14px;
  border-bottom: 1px solid var(--chat-line);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-sidebar-bg) 98%, white 2%), color-mix(in srgb, var(--chat-sidebar-bg) 94%, transparent 6%));
}

.chat-shell-session-filter-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.chat-shell-session-search {
  min-width: 0;
}

.chat-shell-session-filter-state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
}

.chat-shell-session-filter-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-shell-session-filter-button {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-modal-row) 80%, transparent 20%);
  color: var(--chat-text-soft);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.chat-shell-session-filter-button:hover {
  color: var(--chat-text);
  transform: translateY(-1px);
}

.chat-shell-session-filter-button.active {
  background: color-mix(in srgb, var(--chat-accent) 15%, var(--chat-modal-row) 85%);
  color: var(--chat-text);
  border-color: color-mix(in srgb, var(--chat-accent) 36%, var(--chat-line) 64%);
}

.chat-shell-session-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--chat-accent) 18%, var(--chat-line) 82%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-hover) 70%, transparent 30%);
  color: var(--chat-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.chat-shell-session-filter-popover.theme-light,
.chat-shell-session-filter-mobile-sheet.theme-light,
.chat-shell-session-filter-arrow.theme-light {
  --chat-modal-row: rgba(23, 38, 56, 0.04);
  --chat-popover-bg: rgba(255, 255, 255, 0.988);
  --chat-menu-surface: linear-gradient(180deg, rgba(255, 255, 255, 0.995), rgba(246, 249, 253, 0.992));
  --chat-line: rgba(23, 38, 56, 0.08);
  --chat-line-strong: rgba(23, 38, 56, 0.14);
  --chat-text: #172638;
  --chat-text-soft: #5a7087;
  --chat-accent: #4d81f7;
  --chat-hover: rgba(77, 129, 247, 0.06);
}

.chat-shell-session-filter-popover.theme-dark,
.chat-shell-session-filter-mobile-sheet.theme-dark,
.chat-shell-session-filter-arrow.theme-dark {
  --chat-modal-row: rgba(255, 255, 255, 0.05);
  --chat-popover-bg: rgba(11, 22, 35, 0.98);
  --chat-menu-surface: linear-gradient(180deg, rgba(14, 27, 42, 0.996), rgba(10, 21, 34, 0.992));
  --chat-line: rgba(255, 255, 255, 0.09);
  --chat-line-strong: rgba(255, 255, 255, 0.14);
  --chat-text: #f5f8fc;
  --chat-text-soft: #c9d7e6;
  --chat-accent: #5b96ff;
  --chat-hover: rgba(255, 255, 255, 0.07);
}

.chat-shell-session-filter-popover {
  min-width: 240px;
  width: min(320px, calc(100vw - 32px));
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--chat-line-strong);
  border-radius: 16px;
  background: var(--chat-menu-surface);
  box-shadow: 0 18px 44px rgba(3, 8, 14, 0.28);
  backdrop-filter: blur(24px) saturate(140%);
  box-sizing: border-box;
  z-index: 1600;
  transform-origin: top right;
}

.chat-shell-session-filter-popover[data-state='open'] {
  animation: chat-session-filter-popover-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.chat-shell-session-filter-arrow {
  fill: color-mix(in srgb, var(--chat-popover-bg) 98%, black 2%);
  stroke: var(--chat-line-strong);
  stroke-width: 1px;
}

@keyframes chat-session-filter-popover-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.chat-shell-session-filter-field {
  display: grid;
  gap: 6px;
}

.chat-shell-session-filter-legend {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--chat-text-soft);
}

.chat-shell-session-filter-field span {
  font-size: 12px;
  font-weight: 600;
  color: var(--chat-text-soft);
}

.chat-shell-session-filter-agent-list {
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow: auto;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--chat-line-strong) 84%, transparent 16%);
  border-radius: 14px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--chat-menu-surface) 96%, var(--chat-modal-row) 4%),
      color-mix(in srgb, var(--chat-menu-surface) 88%, var(--chat-modal-row) 12%)
    );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  scrollbar-width: thin;
}

.chat-shell-session-filter-agent-option {
  min-height: 40px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 72%, transparent 28%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--chat-menu-surface) 92%, var(--chat-modal-row) 8%);
  color: color-mix(in srgb, var(--chat-text) 84%, var(--chat-text-soft) 16%);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.chat-shell-session-filter-agent-option:hover {
  background: color-mix(in srgb, var(--chat-hover) 62%, var(--chat-menu-surface) 38%);
  border-color: color-mix(in srgb, var(--chat-accent) 28%, var(--chat-line-strong) 72%);
  color: var(--chat-text);
  transform: translateY(-1px);
}

.chat-shell-session-filter-agent-option.active {
  background: color-mix(in srgb, var(--chat-accent) 18%, var(--chat-menu-surface) 82%);
  border-color: color-mix(in srgb, var(--chat-accent) 44%, var(--chat-line-strong) 56%);
  color: var(--chat-text);
}

.chat-shell-session-filter-popover__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-shell-session-filter-mobile-sheet {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--chat-line-strong);
  border-radius: 16px;
  background: var(--chat-menu-surface);
  box-shadow: 0 24px 58px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(14px);
  box-sizing: border-box;
}

.chat-shell-session-filter-mobile-sheet .chat-shell-session-filter-agent-list {
  max-height: min(38dvh, 260px);
}

.chat-shell-session-filter-mobile-sheet .chat-shell-session-filter-agent-option {
  min-height: 38px;
}

.chat-shell-session-filter-mobile-sheet .chat-shell-session-filter-popover__actions {
  position: sticky;
  bottom: 0;
  gap: 6px;
  padding-top: 2px;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--chat-menu-surface) 86%, transparent 14%));
}

@media (max-width: 1040px) {
  .chat-shell-session-filter-layer {
    gap: 8px;
    padding-left: 14px;
    padding-right: 14px;
    background: color-mix(in srgb, var(--chat-sidebar-bg) 99%, transparent 1%);
  }

  .chat-shell-session-filter-main {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .chat-shell-session-filter-state {
    gap: 8px;
  }

  .chat-shell-session-filter-chips {
    gap: 6px;
  }

  .chat-shell-session-filter-button {
    min-height: 36px;
    padding: 0 12px;
  }

  .chat-shell-session-filter-chip {
    min-height: 28px;
    padding: 0 10px;
    font-size: 11px;
  }

  .chat-shell-session-filter-popover__actions {
    flex-wrap: wrap;
  }

  .chat-shell-session-filter-popover {
    min-width: 0;
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 108px);
    overflow: hidden;
    border-radius: 16px;
    box-shadow: 0 28px 64px rgba(0, 0, 0, 0.24);
  }

  .chat-shell-session-filter-agent-list {
    max-height: min(46dvh, 320px);
    padding: 3px;
  }

  .chat-shell-session-filter-agent-option {
    min-height: 38px;
    padding: 8px 10px;
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-shell-session-filter-popover[data-state='open'] {
    animation: none;
  }
}
</style>
