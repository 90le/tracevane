<template>
  <article class="metric-card">
    <p class="metric-eyebrow">{{ eyebrow }}</p>
    <strong class="metric-value">{{ value }}</strong>
    <p class="metric-label">{{ label }}</p>
    <p class="metric-note">{{ note }}</p>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow: string;
  value: string;
  label: string;
  note: string;
}>();
</script>
