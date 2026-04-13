<template>
  <section class="page-shell system-event-center-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">System</p>
        <h2 class="page-title">{{ text('系统事件中心', 'System Event Center') }}</h2>
        <p class="page-copy">
          {{ text('Phase 1 提供事件中心壳层：总览、筛选、时间线与详情。', 'Phase 1 delivers the event center shell: summary, filters, timeline, and details.') }}
        </p>
      </div>
    </header>

    <SystemEventSummaryBar :items="summaryItems" />

    <SystemEventFilterBar
      :severity="severityFilter"
      :category="categoryFilter"
      @update:severity="severityFilter = $event"
      @update:category="categoryFilter = $event"
    />

    <section class="system-event-workbench">
      <SystemEventTimeline
        :groups="timelineGroups"
        :active-event-id="store.selectedEventId.value"
        @select="store.selectedEventId.value = $event"
      />
      <SystemEventDetailPanel :event-item="selectedEvent" />
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import { fetchSystemEventCenterSnapshot } from './api';
import { buildSystemEventTimeline } from './system-event-timeline';
import { useSystemEventStore } from './system-event-store';
import type { SystemEventItem } from './system-event-types';
import SystemEventDetailPanel from './SystemEventDetailPanel.vue';
import SystemEventFilterBar from './SystemEventFilterBar.vue';
import SystemEventSummaryBar from './SystemEventSummaryBar.vue';
import SystemEventTimeline from './SystemEventTimeline.vue';
import './system-events.css';

const { text } = useLocalePreference();
const store = useSystemEventStore();

const severityFilter = ref<string>('all');
const categoryFilter = ref<string>('all');

const filteredEvents = computed(() =>
  store.events.value.filter((event) => {
    const severityMatched =
      severityFilter.value === 'all' || event.severity === severityFilter.value;
    const categoryMatched =
      categoryFilter.value === 'all' || event.category === categoryFilter.value;
    return severityMatched && categoryMatched;
  }),
);

const timelineGroups = computed(() => buildSystemEventTimeline(filteredEvents.value));

watch(
  filteredEvents,
  (events) => {
    if (!events.length) {
      store.selectedEventId.value = '';
      return;
    }
    if (!events.some((event) => event.id === store.selectedEventId.value)) {
      store.selectedEventId.value = events[0].id;
    }
  },
  { immediate: true },
);

const selectedEvent = computed<SystemEventItem | null>(() => {
  if (!filteredEvents.value.length) {
    return null;
  }
  return (
    filteredEvents.value.find((event) => event.id === store.selectedEventId.value) ||
    null
  );
});

const summaryItems = computed(() => {
  const total = filteredEvents.value.length;
  const errors = filteredEvents.value.filter((event) => event.severity === 'error').length;
  const warnings = filteredEvents.value.filter((event) => event.severity === 'warning').length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = filteredEvents.value.filter((event) => event.occurredAt.slice(0, 10) === todayKey).length;

  return [
    { label: text('当前事件', 'Current Events'), value: String(total) },
    { label: text('错误', 'Errors'), value: String(errors) },
    { label: text('警告', 'Warnings'), value: String(warnings) },
    { label: text('今日新增', 'Today'), value: String(today) },
  ];
});

onMounted(async () => {
  const snapshot = await fetchSystemEventCenterSnapshot();
  store.hydrate(snapshot);
});
</script>
