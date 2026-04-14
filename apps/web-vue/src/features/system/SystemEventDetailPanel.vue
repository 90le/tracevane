<template>
  <aside class="system-event-detail-panel">
    <template v-if="eventItem">
      <h3>{{ eventItem.title }}</h3>
      <div class="system-event-detail-list">
        <div class="system-event-detail-row">
          <span>{{ text('时间', 'Time') }}</span>
          <strong>{{ eventItem.occurredAt }}</strong>
        </div>
        <div class="system-event-detail-row">
          <span>{{ text('级别', 'Severity') }}</span>
          <strong>{{ eventItem.severity }}</strong>
        </div>
        <div class="system-event-detail-row">
          <span>{{ text('分类', 'Category') }}</span>
          <strong>{{ eventItem.category }}</strong>
        </div>
        <div class="system-event-detail-row">
          <span>{{ text('来源模块', 'Source Module') }}</span>
          <strong>{{ eventItem.sourceModule || '-' }}</strong>
        </div>
        <div class="system-event-detail-row">
          <span>{{ text('摘要', 'Summary') }}</span>
          <p>{{ eventItem.summary || '-' }}</p>
        </div>
        <template v-if="eventItem.kind === 'config_change'">
          <div class="system-event-detail-row">
            <span>{{ text('配置路径', 'Config Path') }}</span>
            <strong>{{ stringifyConfigValue(eventItem.details?.path) }}</strong>
          </div>
          <div class="system-event-detail-row">
            <span>{{ text('变更前', 'Before') }}</span>
            <strong>{{ stringifyConfigValue(eventItem.details?.before) }}</strong>
          </div>
          <div class="system-event-detail-row">
            <span>{{ text('变更后', 'After') }}</span>
            <strong>{{ stringifyConfigValue(eventItem.details?.after) }}</strong>
          </div>
        </template>
      </div>
      <div class="system-event-detail-actions">
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          class="secondary-button compact-button"
          @click="emit('trigger-action', action.intent)"
        >
          {{ action.label }}
        </button>
      </div>
    </template>
    <p v-else class="panel-muted">{{ text('暂无事件详情', 'No event details') }}</p>
  </aside>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';
import type { SystemEventActionDescriptor } from './system-event-actions';
import type { SystemEventItem } from './system-event-types';

defineProps<{
  eventItem: SystemEventItem | null;
  actions: SystemEventActionDescriptor[];
}>();

const emit = defineEmits<{
  'trigger-action': [intent: SystemEventActionDescriptor['intent']];
}>();

const { text } = useLocalePreference();

function stringifyConfigValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "-";
  }
}
</script>
