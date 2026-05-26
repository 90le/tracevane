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
import './overlay-surfaces.css';
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
