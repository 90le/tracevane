<template>
  <aside class="studio-shell-context-rail" aria-label="Studio shell context rail">
    <header class="studio-shell-context-rail__head">
      <h2>{{ title }}</h2>
    </header>

    <section class="studio-shell-context-rail__section">
      <h3>{{ alertsTitle }}</h3>
      <ul class="studio-shell-context-rail__list">
        <li v-for="alert in alerts" :key="alert.label" class="studio-shell-context-rail__item">
          <StatusPill :label="alert.label" :tone="alert.tone" />
        </li>
      </ul>
    </section>

    <section class="studio-shell-context-rail__section">
      <h3>{{ pendingTitle }}</h3>
      <ul class="studio-shell-context-rail__pending-list">
        <li
          v-for="item in pendingItems"
          :key="item.id"
          class="studio-shell-context-rail__pending-item"
        >
          <strong>{{ item.title }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import StatusPill from './StatusPill.vue';

type StatusTone = 'neutral' | 'accent' | 'sage';

defineProps<{
  title: string;
  alertsTitle: string;
  pendingTitle: string;
  alerts: Array<{
    label: string;
    tone: StatusTone;
  }>;
  pendingItems: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
}>();
</script>
