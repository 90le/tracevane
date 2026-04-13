<template>
  <section class="system-event-summary-bar">
    <article v-for="item in items" :key="item.label" class="system-event-summary-item">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </article>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  items: Array<{
    label: string;
    value: string;
  }>;
}>();
</script>
