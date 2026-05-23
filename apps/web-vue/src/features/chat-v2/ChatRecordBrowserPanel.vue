<template>
  <DialogRoot v-if="isCompactViewport" :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay :class="['chat-record-browser-mask', `theme-${theme}`]" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section v-if="open" :class="['chat-record-browser', 'chat-record-browser--sheet', `theme-${theme}`]">
          <header class="chat-record-browser__header">
            <div class="chat-record-browser__copy">
              <p class="chat-record-browser__eyebrow">{{ text('CHAT RECORDS', 'CHAT RECORDS') }}</p>
              <strong>{{ text('聊天记录', 'Chat records') }}</strong>
              <span>{{ sessionSubtitle || text('当前会话的独立记录浏览器。', 'The current session has its own record browser.') }}</span>
            </div>
            <div class="chat-record-browser__header-actions">
              <div class="chat-record-browser__stats">
                <strong>{{ matchCount }}</strong>
                <span>{{ matchCount === 1 ? text('条记录', 'match') : text('条记录', 'matches') }}</span>
              </div>
              <DialogClose as-child>
                <button
                  type="button"
                  class="chat-record-browser__close"
                  :aria-label="text('关闭聊天记录', 'Close chat records')"
                >
                  <X class="drawer-close-icon" aria-hidden="true" />
                </button>
              </DialogClose>
            </div>
          </header>

          <div class="chat-record-browser__controls">
            <form class="chat-record-browser__search" @submit.prevent="emitSearch">
              <label class="chat-record-browser__search-field">
                <Search class="chat-record-browser__search-icon" aria-hidden="true" />
                <input
                  ref="searchInput"
                  :value="query"
                  type="search"
                  :placeholder="text('搜索关键词', 'Search keywords')"
                  @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
                >
              </label>
              <button type="submit" class="chat-record-browser__primary" :disabled="searchDisabled">
                {{ text('搜索', 'Search') }}
              </button>
            </form>

            <div class="chat-record-browser__filter-group">
              <span class="chat-record-browser__filter-label">{{ text('角色', 'Role') }}</span>
              <div class="chat-record-browser__chip-row">
                <button
                  v-for="option in roleOptions"
                  :key="option.id"
                  type="button"
                  class="chat-record-browser__chip"
                  :class="{ active: roleFilter === option.id }"
                  @click="setRoleFilter(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="chat-record-browser__filter-group">
              <span class="chat-record-browser__filter-label">{{ text('内容', 'Content') }}</span>
              <div class="chat-record-browser__chip-row">
                <button
                  v-for="option in contentOptions"
                  :key="option.id"
                  type="button"
                  class="chat-record-browser__chip"
                  :class="{ active: contentFilter === option.id }"
                  @click="setContentFilter(option.id)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="chat-record-browser__filter-group">
              <span class="chat-record-browser__filter-label">{{ text('日期', 'Date') }}</span>
              <div class="chat-record-browser__date-row">
                <label class="chat-record-browser__date-field">
                  <span aria-hidden="true">◷</span>
                  <input
                    :value="selectedDay || ''"
                    type="date"
                    class="chat-record-browser__date-input"
                    :min="earliestAvailableDay || undefined"
                    :max="latestAvailableDay || undefined"
                    @input="syncSelectedDayFromInput(($event.target as HTMLInputElement).value)"
                  >
                </label>
                <button
                  type="button"
                  class="chat-record-browser__primary chat-record-browser__primary--secondary"
                  :disabled="!selectedDayBucket"
                  @click="jumpToSelectedDay"
                >
                  {{ text('跳转', 'Jump') }}
                </button>
                <button
                  type="button"
                  class="chat-record-browser__link"
                  :disabled="!selectedDay"
                  @click="clearSelectedDay"
                >
                  {{ text('清空日期', 'Clear date') }}
                </button>
              </div>
              <span v-if="selectedDay" class="chat-record-browser__date-hint">
                {{ selectedDayBucket
                  ? text(`当天共有 ${selectedDayBucket.count} 条记录。`, `${selectedDayBucket.count} records on this day.`)
                  : text('这一天没有可跳转记录。', 'No records found for this day.') }}
              </span>
            </div>

            <div class="chat-record-browser__filter-actions">
              <button
                type="button"
                class="chat-record-browser__link"
                :disabled="!hasActiveFilters"
                @click="$emit('clear')"
              >
                {{ text('清空', 'Clear') }}
              </button>
              <button
                type="button"
                class="chat-record-browser__primary chat-record-browser__primary--secondary"
                :disabled="searchDisabled"
                @click="emitSearch"
              >
                {{ text('重新搜索', 'Search again') }}
              </button>
            </div>
          </div>

          <div class="chat-record-browser__body">
            <div v-if="loading" class="chat-record-browser__surface chat-record-browser__surface--loading">
              <span class="chat-record-browser__spinner" aria-hidden="true"></span>
              <strong>{{ text('正在检索记录...', 'Searching records...') }}</strong>
            </div>
            <div v-else-if="errorMessage" class="chat-record-browser__surface chat-record-browser__surface--error">
              <strong>{{ text('读取聊天记录失败', 'Failed to load records') }}</strong>
              <p>{{ errorMessage }}</p>
              <button type="button" class="chat-record-browser__primary" @click="emitSearch">
                {{ text('重试', 'Retry') }}
              </button>
            </div>
            <div v-else-if="!hasSearchCriteria" class="chat-record-browser__surface chat-record-browser__surface--empty">
              <strong>{{ text('输入关键词后即可搜索当前会话。', 'Enter a keyword to search the current session.') }}</strong>
              <p>{{ sessionTitle }}</p>
            </div>
            <div v-else-if="!hasQuery && !hasNonQueryFilters && selectedDay" class="chat-record-browser__surface chat-record-browser__surface--empty">
              <strong>{{ text(`已选择 ${formatDayLabel(selectedDay)}。`, `Selected ${formatDayLabel(selectedDay)}.`) }}</strong>
              <p>
                {{ selectedDayBucket
                  ? text('可以直接跳到这一天，或继续输入关键词缩小范围。', 'Jump to this day directly, or add keywords to narrow the results.')
                  : text('这一天没有记录，可更换日期后继续检索。', 'This day has no records. Pick another date to continue.') }}
              </p>
            </div>
            <div v-else-if="!visibleMatches.length" class="chat-record-browser__surface chat-record-browser__surface--empty">
              <strong>{{ text('没有找到匹配的聊天记录。', 'No matching chat records found.') }}</strong>
              <p>{{ selectedDay
                ? text('可以换一个关键词、角色、内容类型或日期。', 'Try another keyword, role, content type, or day.')
                : text('可以换一个关键词、角色或内容类型。', 'Try another keyword, role, or content type.') }}</p>
            </div>
            <div v-else class="chat-record-browser__groups">
              <section v-for="group in groupedVisibleMatches" :key="group.day || 'ungrouped'" class="chat-record-browser__group">
                <div class="chat-record-browser__group-label">{{ formatDayLabel(group.day) }}</div>
                <div class="chat-record-browser__match-list">
                  <button
                    v-for="match in group.matches"
                    :key="match.messageId"
                    type="button"
                    class="chat-record-browser__match"
                    :class="{ active: selectedResultMessageId === match.messageId }"
                    @click="selectResultAndJump(match.messageId)"
                  >
                    <div class="chat-record-browser__match-head">
                      <strong>{{ roleLabel(match.role) }}</strong>
                      <span class="chat-record-browser__match-meta">{{ formatMatchMeta(match) }}</span>
                    </div>
                    <div class="chat-record-browser__match-snippet">{{ match.snippet }}</div>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <aside v-else-if="open" :class="['chat-record-browser', 'chat-record-browser--dock', `theme-${theme}`]">
    <header class="chat-record-browser__header">
      <div class="chat-record-browser__copy">
        <p class="chat-record-browser__eyebrow">{{ text('CHAT RECORDS', 'CHAT RECORDS') }}</p>
        <strong>{{ text('聊天记录', 'Chat records') }}</strong>
        <span>{{ sessionSubtitle || text('当前会话的独立记录浏览器。', 'The current session has its own record browser.') }}</span>
      </div>
      <div class="chat-record-browser__header-actions">
        <div class="chat-record-browser__stats">
          <strong>{{ matchCount }}</strong>
          <span>{{ matchCount === 1 ? text('条记录', 'match') : text('条记录', 'matches') }}</span>
        </div>
        <button
          type="button"
          class="chat-record-browser__close"
          :aria-label="text('关闭聊天记录', 'Close chat records')"
          @click="handleOpenChange(false)"
        >
          <X class="drawer-close-icon" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="chat-record-browser__controls">
      <form class="chat-record-browser__search" @submit.prevent="emitSearch">
        <label class="chat-record-browser__search-field">
          <Search class="chat-record-browser__search-icon" aria-hidden="true" />
          <input
            ref="searchInput"
            :value="query"
            type="search"
            :placeholder="text('搜索关键词', 'Search keywords')"
            @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
          >
        </label>
        <button type="submit" class="chat-record-browser__primary" :disabled="searchDisabled">
          {{ text('搜索', 'Search') }}
        </button>
      </form>

      <div class="chat-record-browser__filter-group">
        <span class="chat-record-browser__filter-label">{{ text('角色', 'Role') }}</span>
        <div class="chat-record-browser__chip-row">
          <button
            v-for="option in roleOptions"
            :key="option.id"
            type="button"
            class="chat-record-browser__chip"
            :class="{ active: roleFilter === option.id }"
            @click="setRoleFilter(option.id)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="chat-record-browser__filter-group">
        <span class="chat-record-browser__filter-label">{{ text('内容', 'Content') }}</span>
        <div class="chat-record-browser__chip-row">
          <button
            v-for="option in contentOptions"
            :key="option.id"
            type="button"
            class="chat-record-browser__chip"
            :class="{ active: contentFilter === option.id }"
            @click="setContentFilter(option.id)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="chat-record-browser__filter-group">
        <span class="chat-record-browser__filter-label">{{ text('日期', 'Date') }}</span>
        <div class="chat-record-browser__date-row">
          <label class="chat-record-browser__date-field">
            <span aria-hidden="true">◷</span>
            <input
              :value="selectedDay || ''"
              type="date"
              class="chat-record-browser__date-input"
              :min="earliestAvailableDay || undefined"
              :max="latestAvailableDay || undefined"
              @input="syncSelectedDayFromInput(($event.target as HTMLInputElement).value)"
            >
          </label>
          <button
            type="button"
            class="chat-record-browser__primary chat-record-browser__primary--secondary"
            :disabled="!selectedDayBucket"
            @click="jumpToSelectedDay"
          >
            {{ text('跳转', 'Jump') }}
          </button>
          <button
            type="button"
            class="chat-record-browser__link"
            :disabled="!selectedDay"
            @click="clearSelectedDay"
          >
            {{ text('清空日期', 'Clear date') }}
          </button>
        </div>
        <span v-if="selectedDay" class="chat-record-browser__date-hint">
          {{ selectedDayBucket
            ? text(`当天共有 ${selectedDayBucket.count} 条记录。`, `${selectedDayBucket.count} records on this day.`)
            : text('这一天没有可跳转记录。', 'No records found for this day.') }}
        </span>
      </div>

      <div class="chat-record-browser__filter-actions">
        <button
          type="button"
          class="chat-record-browser__link"
          :disabled="!hasActiveFilters"
          @click="$emit('clear')"
        >
          {{ text('清空', 'Clear') }}
        </button>
        <button
          type="button"
          class="chat-record-browser__primary chat-record-browser__primary--secondary"
          :disabled="searchDisabled"
          @click="emitSearch"
        >
          {{ text('重新搜索', 'Search again') }}
        </button>
      </div>
    </div>

    <div class="chat-record-browser__body">
      <div v-if="loading" class="chat-record-browser__surface chat-record-browser__surface--loading">
        <span class="chat-record-browser__spinner" aria-hidden="true"></span>
        <strong>{{ text('正在检索记录...', 'Searching records...') }}</strong>
      </div>
      <div v-else-if="errorMessage" class="chat-record-browser__surface chat-record-browser__surface--error">
        <strong>{{ text('读取聊天记录失败', 'Failed to load records') }}</strong>
        <p>{{ errorMessage }}</p>
        <button type="button" class="chat-record-browser__primary" @click="emitSearch">
          {{ text('重试', 'Retry') }}
        </button>
      </div>
      <div v-else-if="!hasSearchCriteria" class="chat-record-browser__surface chat-record-browser__surface--empty">
        <strong>{{ text('输入关键词后即可搜索当前会话。', 'Enter a keyword to search the current session.') }}</strong>
        <p>{{ sessionTitle }}</p>
      </div>
      <div v-else-if="!hasQuery && !hasNonQueryFilters && selectedDay" class="chat-record-browser__surface chat-record-browser__surface--empty">
        <strong>{{ text(`已选择 ${formatDayLabel(selectedDay)}。`, `Selected ${formatDayLabel(selectedDay)}.`) }}</strong>
        <p>
          {{ selectedDayBucket
            ? text('可以直接跳到这一天，或继续输入关键词缩小范围。', 'Jump to this day directly, or add keywords to narrow the results.')
            : text('这一天没有记录，可更换日期后继续检索。', 'This day has no records. Pick another date to continue.') }}
        </p>
      </div>
      <div v-else-if="!visibleMatches.length" class="chat-record-browser__surface chat-record-browser__surface--empty">
        <strong>{{ text('没有找到匹配的聊天记录。', 'No matching chat records found.') }}</strong>
        <p>{{ selectedDay
          ? text('可以换一个关键词、角色、内容类型或日期。', 'Try another keyword, role, content type, or day.')
          : text('可以换一个关键词、角色或内容类型。', 'Try another keyword, role, or content type.') }}</p>
      </div>
      <div v-else class="chat-record-browser__groups">
        <section v-for="group in groupedVisibleMatches" :key="group.day || 'ungrouped'" class="chat-record-browser__group">
          <div class="chat-record-browser__group-label">{{ formatDayLabel(group.day) }}</div>
          <div class="chat-record-browser__match-list">
            <button
              v-for="match in group.matches"
              :key="match.messageId"
              type="button"
              class="chat-record-browser__match"
              :class="{ active: selectedResultMessageId === match.messageId }"
              @click="selectResultAndJump(match.messageId)"
            >
              <div class="chat-record-browser__match-head">
                <strong>{{ roleLabel(match.role) }}</strong>
                <span class="chat-record-browser__match-meta">{{ formatMatchMeta(match) }}</span>
              </div>
              <div class="chat-record-browser__match-snippet">{{ match.snippet }}</div>
            </button>
          </div>
        </section>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { Search, X } from '@lucide/vue';
import type {
  ChatHistoryDateBucket,
  ChatHistorySearchContentFilter,
  ChatHistorySearchMatch,
  ChatHistorySearchRoleFilter,
} from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import {
  normalizeChatRecordBrowserQuery,
  type ChatRecordBrowserMatchGroup,
} from './chat-record-browser-state';

const props = defineProps<{
  open: boolean;
  theme: 'light' | 'dark';
  sessionTitle: string;
  sessionSubtitle: string;
  query: string;
  roleFilter: ChatHistorySearchRoleFilter;
  contentFilter: ChatHistorySearchContentFilter;
  availableDays: ChatHistoryDateBucket[];
  selectedDay: string | null;
  loading: boolean;
  errorMessage: string;
  hasActiveFilters: boolean;
  matchCount: number;
  visibleMatches: ChatHistorySearchMatch[];
  groupedVisibleMatches: ChatRecordBrowserMatchGroup[];
  selectedResultMessageId: string | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'update:open', value: boolean): void;
  (event: 'update:query', value: string): void;
  (event: 'update:role-filter', value: ChatHistorySearchRoleFilter): void;
  (event: 'update:content-filter', value: ChatHistorySearchContentFilter): void;
  (event: 'update:selected-day', value: string | null): void;
  (event: 'search'): void;
  (event: 'clear'): void;
  (event: 'select-result', messageId: string): void;
  (event: 'jump-to-message', messageId: string): void;
  (event: 'jump-to-day', day: string): void;
}>();

const { text } = useLocalePreference();
const searchInput = ref<HTMLInputElement | null>(null);
const isCompactViewport = ref(false);
let compactViewportMediaQuery: MediaQueryList | null = null;
let compactViewportListener: ((event: MediaQueryListEvent) => void) | null = null;

const roleOptions = [
  { id: 'all' as const, label: text('全部角色', 'All roles') },
  { id: 'user' as const, label: text('用户', 'User') },
  { id: 'assistant' as const, label: text('助手', 'Assistant') },
  { id: 'tool' as const, label: text('工具', 'Tool') },
];

const contentOptions = [
  { id: 'all' as const, label: text('全部内容', 'All content') },
  { id: 'text' as const, label: text('纯文本', 'Text') },
  { id: 'resource' as const, label: text('资源', 'Resources') },
  { id: 'code' as const, label: text('代码', 'Code') },
];

const hasQuery = computed(() => Boolean(normalizeChatRecordBrowserQuery(props.query)));
const hasNonQueryFilters = computed(() => props.roleFilter !== 'all' || props.contentFilter !== 'all');
const hasSearchCriteria = computed(() => hasQuery.value || hasNonQueryFilters.value || Boolean(props.selectedDay));
const searchDisabled = computed(() => props.loading || !hasSearchCriteria.value);
const selectedDayBucket = computed(() => (
  props.selectedDay
    ? props.availableDays.find((bucket) => bucket.day === props.selectedDay) || null
    : null
));
const latestAvailableDay = computed(() => props.availableDays[0]?.day || '');
const earliestAvailableDay = computed(() => props.availableDays[props.availableDays.length - 1]?.day || '');

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
  compactViewportMediaQuery = window.matchMedia('(max-width: 920px)');
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

watch(
  () => props.open,
  async (nextOpen) => {
    if (!nextOpen) {
      return;
    }
    await nextTick();
    searchInput.value?.focus();
  },
);

function emitSearch(): void {
  if (searchDisabled.value) {
    return;
  }
  emit('search');
}

function setRoleFilter(nextValue: ChatHistorySearchRoleFilter): void {
  emit('update:role-filter', nextValue);
  emitSearch();
}

function setContentFilter(nextValue: ChatHistorySearchContentFilter): void {
  emit('update:content-filter', nextValue);
  emitSearch();
}

function syncSelectedDayFromInput(rawValue: string): void {
  emit('update:selected-day', rawValue || null);
}

function clearSelectedDay(): void {
  emit('update:selected-day', null);
}

function jumpToSelectedDay(): void {
  if (!props.selectedDay || !selectedDayBucket.value) {
    return;
  }
  emit('jump-to-day', props.selectedDay);
}

function formatDayLabel(day: string | null): string {
  if (!day) {
    return text('未分组', 'Ungrouped');
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === today) {
    return text('今天', 'Today');
  }
  if (day === yesterday) {
    return text('昨天', 'Yesterday');
  }
  return day;
}

function roleLabel(role: ChatHistorySearchMatch['role']): string {
  if (role === 'user') return text('用户', 'User');
  if (role === 'assistant') return text('助手', 'Assistant');
  if (role === 'tool') return text('工具', 'Tool');
  if (role === 'system') return text('系统', 'System');
  return text('未知', 'Unknown');
}

function formatMatchMeta(match: ChatHistorySearchMatch): string {
  const parts: string[] = [];
  if (match.createdAt) {
    parts.push(match.createdAt.slice(0, 19).replace('T', ' '));
  }
  if (match.day) {
    parts.push(match.day);
  }
  return parts.join(' · ');
}

function selectResultAndJump(messageId: string): void {
  emit('select-result', messageId);
  emit('jump-to-message', messageId);
}

function handleOpenChange(nextOpen: boolean): void {
  emit('update:open', nextOpen);
  if (!nextOpen) {
    emit('close');
  }
}

onMounted(() => {
  bindCompactViewport();
});

onBeforeUnmount(() => {
  unbindCompactViewport();
});
</script>

<style scoped>
.chat-record-browser-mask {
  position: fixed;
  inset: 0;
  z-index: 1430;
  backdrop-filter: blur(14px);
}

.chat-record-browser-mask[data-state='open'] {
  animation: chat-record-browser-mask-in 180ms ease;
}

.chat-record-browser {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--chat-record-browser-surface);
  color: var(--chat-record-browser-text);
  border: 1px solid var(--chat-record-browser-line);
  box-shadow: var(--chat-record-browser-shadow);
  backdrop-filter: blur(18px);
}

.chat-record-browser--dock {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 1431;
  width: min(520px, calc(100vw - 24px));
  height: calc(100dvh - 24px);
  border-radius: 14px;
}

.chat-record-browser--sheet {
  position: fixed;
  top: 10px;
  right: 10px;
  left: 10px;
  z-index: 1431;
  height: calc(100dvh - 20px);
  border-radius: 14px;
}

.chat-record-browser__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--chat-record-browser-line);
}

.chat-record-browser__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.chat-record-browser__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--chat-text-soft);
}

.chat-record-browser__copy strong {
  font-size: 16px;
}

.chat-record-browser__copy span {
  font-size: 13px;
  line-height: 1.45;
  color: var(--chat-text-soft);
}

.chat-record-browser__header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.chat-record-browser__stats {
  display: grid;
  gap: 2px;
  text-align: right;
}

.chat-record-browser__stats strong {
  font-size: 18px;
}

.chat-record-browser__stats span {
  font-size: 11px;
  color: var(--chat-text-soft);
}

.chat-record-browser__close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--chat-record-browser-line);
  border-radius: 999px;
  background: var(--chat-record-browser-chip);
  color: var(--chat-record-browser-text);
}

.chat-record-browser__controls {
  display: grid;
  gap: 14px;
  padding: 14px 16px 16px;
  border-bottom: 1px solid var(--chat-record-browser-line);
}

.chat-record-browser__search {
  display: flex;
  gap: 10px;
  align-items: center;
}

.chat-record-browser__search-field {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--chat-record-browser-line);
  background: var(--chat-record-browser-chip);
}

.chat-record-browser__search-field input,
.chat-record-browser__date-field input,
.chat-record-browser__select {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.chat-record-browser__select {
  width: 100%;
  padding: 0;
}

.chat-record-browser__date-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.chat-record-browser__date-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--chat-record-browser-line);
  background: var(--chat-record-browser-chip);
}

.chat-record-browser__date-input {
  width: 100%;
}

.chat-record-browser__date-hint {
  font-size: 11px;
  color: var(--chat-text-soft);
}

.chat-record-browser__primary,
.chat-record-browser__link,
.chat-record-browser__chip {
  border: 1px solid transparent;
  transition: transform 120ms ease, background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
}

.chat-record-browser__primary {
  height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--chat-record-browser-accent);
  color: white;
  font-weight: 700;
}

.chat-record-browser__primary--secondary {
  background: var(--chat-record-browser-chip);
  color: var(--chat-record-browser-text);
  border-color: var(--chat-record-browser-line);
}

.chat-record-browser__link {
  background: transparent;
  color: var(--chat-text-soft);
  padding: 0;
  height: 34px;
}

.chat-record-browser__filter-group {
  display: grid;
  gap: 8px;
}

.chat-record-browser__filter-label {
  font-size: 12px;
  color: var(--chat-text-soft);
  font-weight: 600;
}

.chat-record-browser__chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-record-browser__chip {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--chat-record-browser-chip);
  border-color: var(--chat-record-browser-line);
  color: var(--chat-record-browser-text);
}

.chat-record-browser__chip.active {
  background: var(--chat-record-browser-accent-soft);
  border-color: color-mix(in srgb, var(--chat-record-browser-accent) 58%, transparent);
  color: var(--chat-record-browser-text);
}

.chat-record-browser__filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-record-browser__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px 16px;
}

.chat-record-browser__surface {
  min-height: 160px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 10px;
  color: var(--chat-text-soft);
  padding: 20px;
}

.chat-record-browser__surface--loading {
  min-height: 180px;
}

.chat-record-browser__surface--error {
  color: var(--chat-error);
}

.chat-record-browser__surface--empty {
  color: var(--chat-text-soft);
}

.chat-record-browser__spinner {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--chat-record-browser-accent) 25%, transparent);
  border-top-color: var(--chat-record-browser-accent);
  animation: chat-record-browser-spin 0.8s linear infinite;
}

.chat-record-browser__groups {
  display: grid;
  gap: 14px;
}

.chat-record-browser__group {
  display: grid;
  gap: 8px;
}

.chat-record-browser__group-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--chat-text-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chat-record-browser__match-list {
  display: grid;
  gap: 8px;
}

.chat-record-browser__match {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--chat-record-browser-chip);
  border: 1px solid var(--chat-record-browser-line);
  text-align: left;
}

.chat-record-browser__match.active {
  border-color: color-mix(in srgb, var(--chat-record-browser-accent) 56%, var(--chat-record-browser-line));
  background: var(--chat-record-browser-accent-soft);
}

.chat-record-browser__match-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
}

.chat-record-browser__match-head strong {
  font-size: 13px;
}

.chat-record-browser__match-meta {
  font-size: 11px;
  color: var(--chat-text-soft);
}

.chat-record-browser__match-snippet {
  font-size: 13px;
  line-height: 1.5;
  color: var(--chat-record-browser-text);
  opacity: 0.92;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-record-browser__primary:disabled,
.chat-record-browser__link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-record-browser__match:hover,
.chat-record-browser__chip:hover,
.chat-record-browser__primary:hover,
.chat-record-browser__link:hover,
.chat-record-browser__close:hover {
  transform: translateY(-1px);
}

.chat-record-browser__primary:focus-visible,
.chat-record-browser__link:focus-visible,
.chat-record-browser__chip:focus-visible,
.chat-record-browser__close:focus-visible,
.chat-record-browser__match:focus-visible,
.chat-record-browser__select:focus-visible {
  outline: 2px solid var(--chat-record-browser-accent);
  outline-offset: 2px;
}

:global(.chat-record-browser.theme-dark),
:global(.chat-record-browser.theme-light),
.chat-record-browser {
  --chat-record-browser-surface: var(--chat-dialog-surface);
  --chat-record-browser-line: var(--chat-line-strong);
  --chat-record-browser-text: var(--chat-text);
  --chat-record-browser-chip: color-mix(in srgb, var(--chat-modal-row) 86%, var(--chat-shell-bg) 14%);
  --chat-record-browser-accent: var(--chat-accent);
  --chat-record-browser-accent-soft: color-mix(in srgb, var(--chat-accent) 14%, transparent);
  --chat-record-browser-shadow: 0 28px 88px rgba(3, 8, 14, 0.28);
}

:global(.chat-record-browser.theme-dark) {
  --chat-error: #ff8b8b;
}

:global(.chat-record-browser.theme-light) {
  --chat-error: #c62828;
}

:global(.chat-record-browser-mask.theme-dark) {
  background: rgba(6, 10, 18, 0.42);
}

:global(.chat-record-browser-mask.theme-light) {
  background: rgba(229, 237, 247, 0.72);
}

@media (max-width: 760px) {
  .chat-record-browser--sheet {
    top: 8px;
    right: 8px;
    left: 8px;
    height: calc(100dvh - 16px);
    border-radius: 16px;
  }

  .chat-record-browser__header,
  .chat-record-browser__controls,
  .chat-record-browser__body {
    padding-left: 14px;
    padding-right: 14px;
  }

  .chat-record-browser__search {
    flex-direction: column;
    align-items: stretch;
  }

  .chat-record-browser__date-row {
    grid-template-columns: 1fr;
  }

  .chat-record-browser__filter-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .chat-record-browser__primary,
  .chat-record-browser__link {
    width: 100%;
  }
}

@keyframes chat-record-browser-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes chat-record-browser-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
