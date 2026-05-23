<template>
  <div class="cs-surface cs-loading-card">
    {{ message }}
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<style scoped>
.cs-loading-card {
  padding: 20px;
  color: var(--text-soft);
}
</style>
