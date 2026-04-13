<template>
  <section class="system-event-timeline">
    <article v-for="group in groups" :key="group.date" class="system-event-timeline-group">
      <h4 class="system-event-timeline-date">{{ group.date }}</h4>

      <button
        v-for="item in group.items"
        :key="item.id"
        type="button"
        class="system-event-timeline-item"
        :class="{ 'is-active': activeEventId === item.id }"
        @click="emit('select', item.id)"
      >
        <div class="system-event-title-row">
          <strong>{{ item.title }}</strong>
          <span class="system-event-severity">{{ item.severity }}</span>
        </div>
        <p class="system-event-summary">{{ item.summary || '-' }}</p>
      </button>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { SystemEventTimelineGroup } from './system-event-types';

defineProps<{
  groups: SystemEventTimelineGroup[];
  activeEventId: string;
}>();

const emit = defineEmits<{
  select: [eventId: string];
}>();
</script>
