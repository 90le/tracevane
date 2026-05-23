<template>
  <article class="cs-surface cs-model-catalog-card">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("CPA 模型列表", "CPA Model List") }}</p>
        <h4>{{ text("从 /v1/models 读取的可用模型", "Models discovered from /v1/models") }}</h4>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="$emit('reload')">
        {{ text("重新读取", "Reload") }}
      </button>
    </div>
    <p v-if="loading && loadingDisabledHelp" class="cs-disabled-help">
      {{ loadingDisabledHelp }}
    </p>
    <p class="cs-field-hint">{{ sourceHelp }}</p>
    <div class="cs-model-list">
      <span v-for="model in models" :key="`catalog-${model}`" :class="{ 'cs-model-current': model === currentModel }">
        {{ model }}
      </span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

defineProps<{
  models: string[];
  currentModel: string;
  sourceHelp: string;
  loading: boolean;
  loadingDisabledHelp: string;
}>();

defineEmits<{
  reload: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-model-catalog-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--code-bg) 18%, transparent)),
    var(--surface);
}

.cs-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4 {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-field-hint {
  color: var(--text-soft);
  font-size: 0.84rem;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  max-height: 220px;
  overflow: auto;
}

.cs-model-list span {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 7px 10px;
  background: color-mix(in srgb, var(--code-bg) 42%, transparent);
  color: var(--text);
  font-size: 0.84rem;
}

.cs-model-list .cs-model-current {
  border-color: color-mix(in srgb, var(--success) 48%, var(--line));
  background: color-mix(in srgb, var(--success) 18%, var(--surface));
  font-weight: 700;
}

@media (max-width: 960px) {
  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
