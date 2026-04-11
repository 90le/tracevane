<template>
  <button
    type="button"
    class="agent-rail-item"
    :class="{ active: selected }"
    :aria-pressed="String(selected)"
    @click="$emit('select')"
  >
    <span class="agent-rail-item__avatar" aria-hidden="true">
      <AgentAvatarContent
        :avatar="agent.identity.avatar"
        :emoji="agent.identity.emoji"
        :fallback="agent.identity.name || agent.name || agent.id"
        :alt="agent.identity.name || agent.name || agent.id"
      />
    </span>

    <span class="agent-rail-item__body">
      <span class="agent-rail-item__head">
        <strong>{{ agent.identity.name || agent.name || agent.id }}</strong>
        <span class="agent-rail-item__status" :class="healthToneClass">{{ healthLabel }}</span>
      </span>
      <span class="agent-rail-item__subline">{{ agent.id }}</span>
      <span class="agent-rail-item__copy">
        {{ agent.identity.role || text('未定义角色', 'No role summary yet') }}
      </span>
      <span class="agent-rail-item__meta">
        <span>{{ modelLabel }}</span>
        <span>{{ runtimeLabel }}</span>
        <span>{{ text(`${agent.sessionCount} 会话`, `${agent.sessionCount} sessions`) }}</span>
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentSummary } from '../../../../../types/agents';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { useLocalePreference } from '../../shared/locale';

const props = defineProps<{
  agent: AgentSummary;
  selected: boolean;
}>();

defineEmits<{
  (event: 'select'): void;
}>();

const { text } = useLocalePreference();

const runtimeLabel = computed(() =>
  props.agent.runtime.type === 'acp'
    ? text('ACP', 'ACP')
    : text('默认', 'Default'),
);

const modelLabel = computed(() =>
  props.agent.model || text('系统默认模型', 'System model'),
);

const healthLabel = computed(() => {
  if (!props.agent.enabled) return text('停用', 'Disabled');
  if (props.agent.sessionCount > 0) return text('活跃', 'Active');
  if (props.agent.isDefault) return text('默认', 'Default');
  return text('已配置', 'Ready');
});

const healthToneClass = computed(() => {
  if (!props.agent.enabled) return 'is-disabled';
  if (props.agent.sessionCount > 0) return 'is-active';
  if (props.agent.isDefault) return 'is-default';
  return 'is-ready';
});
</script>
