<template>
  <article class="panel-card system-sidebar-panel">
    <div class="system-sidebar-head">
      <div>
        <p class="eyebrow">{{ title }}</p>
        <h3 class="system-sidebar-title">{{ subtitle }}</h3>
        <p class="panel-muted">{{ copy }}</p>
      </div>
    </div>

    <div class="system-status-stack">
      <div class="system-status-row">
        <StatusPill :label="healthSummary.statusLabel" :tone="healthSummary.statusTone" />
        <span class="system-chip">{{ healthSummary.serviceLabel }}</span>
      </div>
      <div class="system-status-row">
        <span class="system-chip">{{ healthSummary.nodeLabel }}</span>
        <span class="system-chip">{{ healthSummary.platformLabel }}</span>
      </div>
      <div class="system-status-row">
        <span class="system-chip">{{ healthSummary.hostLabel }}</span>
        <span class="system-chip">{{ healthSummary.sseLabel }}</span>
      </div>
    </div>

    <div class="system-sidebar-summary">
      <div v-for="item in eventSummaryItems" :key="item.label" class="system-summary-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>

    <div class="system-quick-links">
      <button
        v-for="action in quickActions"
        :key="action.to"
        type="button"
        class="secondary-button compact-button"
        @click="emit('navigate', action.to)"
      >
        {{ action.label }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import StatusPill from '../../components/StatusPill.vue';
import type { SystemEventSummaryItem, SystemQuickAction } from './system-overview-recipe';
import type { SystemHealthSummary } from './system-stage-selectors';

const emit = defineEmits<{
  navigate: [to: SystemQuickAction['to']];
}>();

defineProps<{
  title: string;
  subtitle: string;
  copy: string;
  healthSummary: SystemHealthSummary;
  eventSummaryItems: SystemEventSummaryItem[];
  quickActions: SystemQuickAction[];
}>();
</script>

<style scoped>
.system-sidebar-head p {
  margin: 6px 0 0 0;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.system-status-stack,
.system-sidebar-summary,
.system-quick-links {
  display: grid;
  gap: 10px;
}

.system-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.system-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-soft);
  font-size: 12px;
}

.system-sidebar-summary {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.system-summary-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.system-summary-item span {
  color: var(--text-soft);
  font-size: 12px;
}

.system-summary-item strong {
  color: var(--text);
}
</style>
