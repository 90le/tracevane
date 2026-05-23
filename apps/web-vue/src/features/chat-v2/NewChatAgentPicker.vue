<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="chat-agent-picker-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section class="chat-agent-picker">
        <header class="chat-agent-picker__header">
          <div>
            <p class="chat-agent-picker__eyebrow">{{ text('NEW CHAT', 'NEW CHAT') }}</p>
            <h3>{{ text('选择 Agent', 'Choose an agent') }}</h3>
            <p>
              {{
                text(
                  '新建会话时再选择 Agent。搜索、筛选和高密度列表会优先服务大量 Agent 的快速查找。',
                  'Choose the agent only when starting a new chat. Search, filtering, and a denser list are tuned for large agent rosters.'
                )
              }}
            </p>
          </div>
          <DialogClose as-child>
            <button type="button" class="chat-agent-picker__close" :aria-label="text('关闭', 'Close')">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </DialogClose>
        </header>

        <div class="chat-agent-picker__controls">
          <label class="chat-agent-picker__search">
            <Search class="chat-agent-picker__search-icon" aria-hidden="true" />
            <input
              ref="searchInput"
              v-model.trim="searchText"
              type="search"
              :placeholder="text('搜索 Agent 名称、ID、角色、模型', 'Search agent name, id, role, model')"
            />
          </label>

          <div class="chat-agent-picker__filters">
            <button
              v-for="filter in filters"
              :key="filter.id"
              type="button"
              class="chat-agent-picker__filter"
              :class="{ active: filterId === filter.id }"
              @click="filterId = filter.id"
            >
              {{ filter.label }}
            </button>
          </div>

          <div class="chat-agent-picker__summary">
            <strong>{{ filteredAgents.length }}</strong>
            <span>{{ filteredAgents.length === 1 ? text('个候选 Agent', 'matching agent') : text('个候选 Agent', 'matching agents') }}</span>
          </div>
        </div>

        <div v-if="!agents.length" class="chat-agent-picker__empty">
          {{ text('当前没有可用 Agent。', 'No agents are available.') }}
        </div>

        <div v-else-if="!filteredAgents.length" class="chat-agent-picker__empty">
          {{ text('没有匹配当前搜索或筛选的 Agent。', 'No agents match the current search or filter.') }}
        </div>

        <div v-else class="chat-agent-picker__list">
          <button
            v-for="agent in filteredAgents"
            :key="agent.id"
            type="button"
            class="chat-agent-picker-option"
            :disabled="creating"
            @click="$emit('select', agent.id)"
          >
            <div class="chat-agent-picker-option__avatar">
              <AgentAvatarContent
                :avatar="agent.identity.avatar"
                :emoji="agent.identity.emoji"
                :fallback="agent.name || agent.identity.name || agent.id"
                :alt="agent.name || agent.identity.name || agent.id"
              />
            </div>
            <div class="chat-agent-picker-option__body">
              <div class="chat-agent-picker-option__heading">
                <strong>{{ primaryLabel(agent) }}</strong>
                <span class="chat-agent-picker-option__activity">{{ lastActiveLabel(agent) }}</span>
              </div>
              <div class="chat-agent-picker-option__subline">
                <span>{{ agent.identity.role || text('默认角色', 'Default role') }}</span>
                <span class="chat-agent-picker-option__dot"></span>
                <span>{{ agent.id }}</span>
              </div>
              <div class="chat-agent-picker-option__meta">
                <span v-if="agent.isDefault" class="chat-agent-picker-option__tag is-accent">{{ text('默认', 'Default') }}</span>
                <span v-if="!agent.enabled" class="chat-agent-picker-option__tag is-muted">{{ text('已停用', 'Disabled') }}</span>
                <span class="chat-agent-picker-option__tag">{{ agent.model || text('系统默认', 'System default') }}</span>
                <span class="chat-agent-picker-option__tag">{{ agent.runtime.type.toUpperCase() }}</span>
                <span class="chat-agent-picker-option__tag">{{ sessionCountLabel(agent) }}</span>
              </div>
            </div>
          </button>
        </div>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { Search, X } from '@lucide/vue';
import type { AgentSummary } from '../../../../../types/agents';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { useLocalePreference } from '../../shared/locale';

const props = defineProps<{
  open: boolean;
  creating: boolean;
  agents: AgentSummary[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'select', agentId: string): void;
}>();

const { text } = useLocalePreference();
const searchText = ref('');
const filterId = ref<'all' | 'enabled' | 'default' | 'recent'>('all');
const searchInput = ref<HTMLInputElement | null>(null);

const filters = computed(() => [
  { id: 'all' as const, label: text('全部', 'All') },
  { id: 'enabled' as const, label: text('已启用', 'Enabled') },
  { id: 'default' as const, label: text('默认', 'Default') },
  { id: 'recent' as const, label: text('最近活跃', 'Recent') },
]);

const sortedAgents = computed(() =>
  props.agents.slice().sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    const leftActive = Date.parse(left.lastActiveAt || '') || 0;
    const rightActive = Date.parse(right.lastActiveAt || '') || 0;
    if (leftActive !== rightActive) return rightActive - leftActive;
    if (left.sessionCount !== right.sessionCount) return right.sessionCount - left.sessionCount;
    return primaryLabel(left).localeCompare(primaryLabel(right), 'zh-CN');
  }),
);

const filteredAgents = computed(() =>
  sortedAgents.value.filter((agent) => {
    if (filterId.value === 'enabled' && !agent.enabled) return false;
    if (filterId.value === 'default' && !agent.isDefault) return false;
    if (filterId.value === 'recent' && !agent.lastActiveAt) return false;

    const query = searchText.value.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
      primaryLabel(agent),
      agent.id,
      agent.identity.role,
      agent.identity.mission,
      agent.model,
      agent.runtime.backend,
      agent.workspace,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }),
);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    searchText.value = '';
    filterId.value = 'all';
    await nextTick();
    searchInput.value?.focus();
  },
);

function primaryLabel(agent: AgentSummary): string {
  return agent.name || agent.identity.name || agent.id;
}

function lastActiveLabel(agent: AgentSummary): string {
  if (!agent.lastActiveAt) return text('未活跃', 'No activity');
  try {
    return new Date(agent.lastActiveAt).toLocaleString([], {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return agent.lastActiveAt;
  }
}

function sessionCountLabel(agent: AgentSummary): string {
  return text(`${agent.sessionCount} 个会话`, `${agent.sessionCount} sessions`);
}

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    emit('close');
  }
}
</script>

<style scoped>
.chat-agent-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 1500;
  opacity: 1;
  display: grid;
  place-items: center;
  background: var(--chat-picker-mask);
  backdrop-filter: blur(12px);
  padding: 18px;
}

.chat-agent-picker-mask[data-state='open'] {
  animation: chat-agent-picker-mask-in 160ms ease;
  animation-fill-mode: both;
}

.chat-agent-picker {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1501;
  opacity: 1;
  width: min(760px, 100%);
  max-height: min(720px, calc(100dvh - 36px));
  overflow: hidden;
  border-radius: 12px;
  background: var(--chat-modal-bg);
  border: 1px solid var(--chat-line);
  box-shadow: var(--chat-picker-shadow);
  padding: 22px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 16px;
  transform: translate(-50%, -50%);
}

.chat-agent-picker[data-state='open'] {
  animation: chat-agent-picker-enter 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
  animation-fill-mode: both;
}

@keyframes chat-agent-picker-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-agent-picker-enter {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 12px)) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.chat-agent-picker__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.chat-agent-picker__eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--chat-accent);
}

.chat-agent-picker__header h3 {
  margin: 0;
  color: var(--chat-text);
}

.chat-agent-picker__header p:last-child {
  margin: 8px 0 0;
  color: var(--chat-text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.chat-agent-picker__close {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: var(--chat-modal-row);
  color: var(--chat-text);
}

.chat-agent-picker__controls {
  display: grid;
  gap: 12px;
}

.chat-agent-picker__search {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: var(--chat-modal-row);
  color: var(--chat-text-soft);
}

.chat-agent-picker__search input {
  border: 0;
  outline: 0;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: var(--chat-text);
  font: inherit;
}

.chat-agent-picker__search input::placeholder {
  color: var(--chat-text-soft);
}

.chat-agent-picker__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-agent-picker__filter {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--chat-line);
  background: var(--chat-picker-chip-bg);
  color: var(--chat-text-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.chat-agent-picker__filter.active {
  border-color: color-mix(in srgb, var(--chat-accent) 42%, var(--chat-line));
  background: var(--chat-picker-chip-active-bg);
  color: var(--chat-text);
}

.chat-agent-picker__summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-agent-picker__summary strong {
  color: var(--chat-text);
  font-size: 18px;
}

.chat-agent-picker__list {
  display: grid;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.chat-agent-picker-option {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: var(--chat-modal-row);
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.chat-agent-picker-option:hover:not(:disabled) {
  background: var(--chat-hover);
  transform: translateY(-1px);
}

.chat-agent-picker-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-agent-picker-option__avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--chat-avatar-bg);
  color: var(--chat-avatar-text);
  font-weight: 700;
}

.chat-agent-picker-option__body {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.chat-agent-picker-option__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.chat-agent-picker-option__body strong {
  color: var(--chat-text);
  font-size: 15px;
  min-width: 0;
}

.chat-agent-picker-option__activity {
  flex-shrink: 0;
  color: var(--chat-text-soft);
  font-size: 11px;
}

.chat-agent-picker-option__subline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-agent-picker-option__dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--chat-text-soft);
  opacity: 0.5;
}

.chat-agent-picker-option__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-agent-picker-option__tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--chat-picker-chip-bg);
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-agent-picker-option__tag.is-accent {
  background: var(--chat-picker-chip-active-bg);
  color: var(--chat-text);
}

.chat-agent-picker-option__tag.is-muted {
  background: color-mix(in srgb, var(--chat-modal-row) 70%, var(--chat-line));
}

.chat-agent-picker__empty {
  padding: 18px;
  border-radius: 12px;
  background: var(--chat-modal-row);
  color: var(--chat-text-soft);
  text-align: center;
}

@keyframes chat-agent-picker-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-agent-picker-enter {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 12px)) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@media (max-width: 720px) {
  .chat-agent-picker {
    width: 100%;
    max-height: min(100dvh - 16px, 100%);
    border-radius: 12px;
    padding: 18px;
  }

  .chat-agent-picker__header {
    gap: 12px;
  }

  .chat-agent-picker__heading {
    align-items: flex-start;
  }
}
</style>

<style>
.chat-agent-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: grid;
  place-items: center;
  background: var(--chat-picker-mask);
  backdrop-filter: blur(12px);
  padding: 18px;
}

.chat-agent-picker-mask[data-state='open'] {
  animation: chat-agent-picker-mask-in 160ms ease;
  animation-fill-mode: both;
}

.chat-agent-picker {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1501;
  width: min(760px, 100%);
  max-height: min(720px, calc(100dvh - 36px));
  overflow: hidden;
  border-radius: 12px;
  background: var(--chat-modal-bg);
  border: 1px solid var(--chat-line);
  box-shadow: var(--chat-picker-shadow);
  padding: 22px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 16px;
  transform: translate(-50%, -50%);
}

.chat-agent-picker[data-state='open'] {
  animation: chat-agent-picker-enter 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
  animation-fill-mode: both;
}

@media (max-width: 720px) {
  .chat-agent-picker {
    width: calc(100vw - 16px);
    max-height: min(100dvh - 16px, 100%);
    border-radius: 12px;
    padding: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-agent-picker-mask[data-state='open'],
  .chat-agent-picker[data-state='open'] {
    animation: none;
  }
}
</style>
