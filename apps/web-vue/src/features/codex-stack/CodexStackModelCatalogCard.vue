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
import "./codex-stack-settings.css";

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
