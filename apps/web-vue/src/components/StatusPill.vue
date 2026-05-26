<template>
  <span class="status-pill" :class="`tone-${tone}`">
    <span class="status-pill-dot"></span>
    <span>{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import './status-pill.css';

withDefaults(defineProps<{
  label: string;
  tone?: 'neutral' | 'accent' | 'sage' | 'danger';
}>(), {
  tone: 'neutral',
});
</script>
