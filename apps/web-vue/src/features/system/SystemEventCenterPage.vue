<template>
  <section class="page-shell system-event-center-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">System</p>
        <h2 class="page-title">{{ recipe.pageTitle }}</h2>
        <p class="page-copy">
          {{ recipe.pageCopy }}
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
import type { SystemEventSummaryPayload } from '../../../../../types/system';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchSystemEventCenterSnapshot,
  fetchSystemEventCenterSummary,
} from './api';
import {
  buildDefaultSystemEventCenterRecipe,
} from './system-event-center-recipe';
import {
  buildSystemEventSummaryItems,
} from './system-event-selectors';
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
const recipe = computed(() => buildDefaultSystemEventCenterRecipe(text));
const backendSummary = ref<SystemEventSummaryPayload | null>(null);

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

const summaryItems = computed(() => buildSystemEventSummaryItems({
  summary: backendSummary.value,
  filteredEvents: filteredEvents.value,
  summaryCards: recipe.value.summaryCards,
  text,
}));

onMounted(async () => {
  const [snapshot, summary] = await Promise.all([
    fetchSystemEventCenterSnapshot(),
    fetchSystemEventCenterSummary(),
  ]);
  store.hydrate(snapshot);
  backendSummary.value = summary;
});
</script>
