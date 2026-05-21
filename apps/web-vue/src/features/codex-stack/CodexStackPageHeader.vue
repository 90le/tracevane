<template>
  <header class="page-header-row cs-page-header">
    <div>
      <p class="eyebrow">{{ eyebrow }}</p>
      <h2 class="page-title">{{ title }}</h2>
      <p class="cs-page-subtitle">
        {{ subtitle }}
      </p>
    </div>
    <div class="page-actions">
      <button type="button" class="secondary-button" :disabled="refreshDisabled" @click="$emit('refresh')">
        {{ refreshLabel }}
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  subtitle: string;
  refreshLabel: string;
  refreshDisabled: boolean;
}>();

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.cs-page-subtitle {
  margin: 6px 0 0;
  color: var(--text-soft);
  max-width: 980px;
}
</style>
