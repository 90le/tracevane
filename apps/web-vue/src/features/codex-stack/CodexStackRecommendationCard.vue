<template>
  <article class="cs-surface cs-recommendation-card">
    <p class="cs-section-kicker">{{ kicker }}</p>
    <h4>{{ title }}</h4>
    <p>{{ copy }}</p>
    <p v-if="primaryDisabled && disabledHelp" class="cs-disabled-help">{{ disabledHelp }}</p>
    <div class="cs-actions">
      <button type="button" class="primary-button" :disabled="primaryDisabled" @click="$emit('primary')">
        {{ primaryLabel }}
      </button>
      <button type="button" class="secondary-button" @click="$emit('open-section')">
        {{ secondaryLabel }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  kicker: string;
  title: string;
  copy: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryDisabled: boolean;
  disabledHelp: string;
}>();

defineEmits<{
  primary: [];
  "open-section": [];
}>();
</script>

<style scoped>
.cs-recommendation-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--code-bg) 18%, transparent)),
    var(--surface);
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-recommendation-card h4 {
  margin: 0;
  font-size: 1.15rem;
}

.cs-recommendation-card p {
  color: var(--text-soft);
}

.cs-disabled-help {
  color: var(--warning) !important;
  font-weight: 600;
}

.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
