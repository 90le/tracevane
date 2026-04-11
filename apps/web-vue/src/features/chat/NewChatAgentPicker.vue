<template>
  <Teleport to="body">
    <div v-if="open" class="surface-drawer-mask" @click.self="$emit('close')">
      <section class="chat-agent-picker">
        <header class="chat-agent-picker-head">
          <div>
            <p class="eyebrow">{{ text('NEW CHAT', 'NEW CHAT') }}</p>
            <h3>{{ text('选择 Agent', 'Choose an Agent') }}</h3>
            <p class="surface-note">{{ text('Agent 选择放在动作里，而不是占据主聊天页。', 'Agent selection happens inside the action instead of taking over the main chat surface.') }}</p>
          </div>
          <button type="button" class="surface-drawer-close" @click="$emit('close')">✕</button>
        </header>

        <div v-if="!agents.length" class="empty-inline">{{ text('当前没有可用 Agent。', 'No agents are available.') }}</div>
        <div v-else class="chat-agent-picker-list">
          <button
            v-for="agent in agents"
            :key="agent.id"
            type="button"
            class="chat-agent-picker-option"
            :disabled="creating"
            @click="$emit('select', agent.id)"
          >
            <div class="chat-agent-picker-avatar" aria-hidden="true">
              <AgentAvatarContent
                :avatar="agent.identity.avatar"
                :emoji="agent.identity.emoji"
                :fallback="agent.name || agent.identity.name || agent.id"
                :alt="agent.name || agent.identity.name || agent.id"
              />
            </div>
            <div class="chat-agent-picker-copy">
              <strong>{{ agent.name || agent.identity.name || agent.id }}</strong>
              <span>{{ agent.id }}</span>
              <span>{{ agent.model || text('系统默认', 'System default') }}</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { AgentSummary } from '../../../../../types/agents';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  open: boolean;
  creating: boolean;
  agents: AgentSummary[];
}>();

defineEmits<{
  (event: 'close'): void;
  (event: 'select', agentId: string): void;
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.chat-agent-picker {
  width: min(560px, calc(100vw - 24px));
  margin: auto;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(10, 18, 29, 0.96), rgba(9, 22, 35, 0.9));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  display: grid;
  gap: 18px;
}

.chat-agent-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chat-agent-picker-head h3 {
  margin: 0;
  color: var(--text);
}

.chat-agent-picker-list {
  display: grid;
  gap: 12px;
}

.chat-agent-picker-option {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  text-align: left;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.chat-agent-picker-option:hover:not(:disabled) {
  border-color: rgba(120, 185, 255, 0.34);
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}

.chat-agent-picker-option:disabled {
  opacity: 0.68;
  cursor: not-allowed;
}

.chat-agent-picker-avatar {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255, 190, 122, 0.24), rgba(111, 211, 255, 0.18));
  color: var(--text);
  font-weight: 700;
}

.chat-agent-picker-copy {
  display: grid;
  gap: 4px;
}

.chat-agent-picker-copy strong {
  color: var(--text);
}

.chat-agent-picker-copy span {
  color: var(--text-soft);
  font-size: 12px;
}
</style>
