<!-- components/studio/StudioPanel.vue -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    material?: 'thin' | 'thick' | 'floating';
    radius?: 'panel' | 'card' | 'floating';
  }>(),
  { material: 'thin', radius: 'panel' },
);
</script>

<template>
  <div :class="['studio-panel', `studio-panel--${material}`, `studio-panel--r-${radius}`]">
    <slot />
  </div>
</template>

<style scoped>
.studio-panel {
  border: 0.5px solid var(--hairline);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}
.studio-panel--thin {
  background: var(--material-thin);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
}
.studio-panel--thick {
  background: var(--material-thick);
  backdrop-filter: var(--blur-thick);
  -webkit-backdrop-filter: var(--blur-thick);
}
.studio-panel--floating {
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  -webkit-backdrop-filter: var(--blur-floating);
  box-shadow: var(--shadow-3);
}
.studio-panel--r-panel {
  border-radius: var(--radius-panel);
}
.studio-panel--r-card {
  border-radius: var(--radius-card);
}
.studio-panel--r-floating {
  border-radius: var(--radius-floating);
}
</style>
