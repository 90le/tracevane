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
        :active-event-id="activeEventId"
        @select="activeEventId = $event"
      />
      <SystemEventDetailPanel :event-item="selectedEvent" />
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import { buildSystemEventTimeline } from './system-event-timeline';
import type { SystemEventItem } from './system-event-types';
import SystemEventDetailPanel from './SystemEventDetailPanel.vue';
import SystemEventFilterBar from './SystemEventFilterBar.vue';
import SystemEventSummaryBar from './SystemEventSummaryBar.vue';
import SystemEventTimeline from './SystemEventTimeline.vue';
import './system-events.css';

const { text } = useLocalePreference();

const rawEvents = ref<SystemEventItem[]>([
  {
    id: 'event-diagnostic-1',
    kind: 'diagnostic_issue',
    category: 'alerts',
    severity: 'error',
    occurredAt: '2026-04-13T10:10:00.000Z',
    title: text('Gateway RPC 探测失败', 'Gateway RPC probe failed'),
    summary: text('最近一次探测超时，建议检查 gateway service 与端口占用。', 'Latest probe timed out. Check gateway service and port usage.'),
    sourceModule: 'system.gateway',
  },
  {
    id: 'event-release-1',
    kind: 'release_update_available',
    category: 'operations',
    severity: 'info',
    occurredAt: '2026-04-13T09:40:00.000Z',
    title: text('检测到 Studio 新版本', 'New Studio version detected'),
    summary: text('存在可升级版本，等待维护窗口执行。', 'An update is available and waiting for maintenance window.'),
    sourceModule: 'system.release',
  },
  {
    id: 'event-trust-1',
    kind: 'device_trust_pending',
    category: 'recovery',
    severity: 'warning',
    occurredAt: '2026-04-12T18:20:00.000Z',
    title: text('Helper 设备信任待批准', 'Helper device trust pending'),
    summary: text('检测到待批准请求，可能影响自动修复流程。', 'Pending trust approval may block automated repair.'),
    sourceModule: 'system.device-trust',
  },
]);

const severityFilter = ref<string>('all');
const categoryFilter = ref<string>('all');
const activeEventId = ref<string>('event-diagnostic-1');

const filteredEvents = computed(() =>
  rawEvents.value.filter((event) => {
    const severityMatched =
      severityFilter.value === 'all' || event.severity === severityFilter.value;
    const categoryMatched =
      categoryFilter.value === 'all' || event.category === categoryFilter.value;
    return severityMatched && categoryMatched;
  }),
);

const timelineGroups = computed(() => buildSystemEventTimeline(filteredEvents.value));

const selectedEvent = computed<SystemEventItem | null>(() => {
  if (!filteredEvents.value.length) {
    return null;
  }
  const matched = filteredEvents.value.find((event) => event.id === activeEventId.value);
  return matched || filteredEvents.value[0];
});

const summaryItems = computed(() => {
  const total = filteredEvents.value.length;
  const errors = filteredEvents.value.filter((event) => event.severity === 'error').length;
  const warnings = filteredEvents.value.filter((event) => event.severity === 'warning').length;
  const today = filteredEvents.value.filter((event) => event.occurredAt.startsWith('2026-04-13')).length;

  return [
    { label: text('当前事件', 'Current Events'), value: String(total) },
    { label: text('错误', 'Errors'), value: String(errors) },
    { label: text('警告', 'Warnings'), value: String(warnings) },
    { label: text('今日新增', 'Today'), value: String(today) },
  ];
});
</script>
