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
      <p v-if="refreshDisabled && refreshDisabledHelp" class="cs-disabled-help">
        {{ refreshDisabledHelp }}
      </p>
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
  refreshDisabledHelp: string;
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

.page-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.cs-disabled-help {
  max-width: 280px;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
  text-align: right;
}
</style>
