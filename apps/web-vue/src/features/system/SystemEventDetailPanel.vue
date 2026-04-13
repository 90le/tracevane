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
      </div>
      <div class="system-event-detail-actions">
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          class="secondary-button compact-button"
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

const { text } = useLocalePreference();
</script>
