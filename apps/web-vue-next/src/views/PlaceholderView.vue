<!-- views/PlaceholderView.vue -->
<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="placeholder">
    <div class="placeholder__card">
      <h1 class="placeholder__title">{{ title }}</h1>
      <p class="placeholder__hint">该页面待从旧壳迁移。地基完成后按逐页迁移计划填充。</p>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  padding: 24px;
}
.placeholder__card {
  background: var(--material-thin);
  border: 0.5px solid var(--hairline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  padding: 20px 24px;
}
.placeholder__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.placeholder__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
