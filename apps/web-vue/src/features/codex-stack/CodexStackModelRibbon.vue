<template>
  <article class="cs-surface cs-model-ribbon">
    <div class="cs-model-ribbon-main">
      <span class="cs-section-kicker">{{ text("模型目录", "Model Catalog") }}</span>
      <strong>{{ currentModel || "--" }}</strong>
      <small>{{ sourceHelp }}</small>
    </div>
    <div class="cs-model-ribbon-side">
      <span class="cs-status-pill" :class="`tone-${sourceTone}`">{{ sourceLabel }}</span>
      <span class="cs-info-chip">{{ text("可选模型", "Available models") }} {{ modelCount }}</span>
      <span class="cs-info-chip">{{ text("上下文", "Context") }} {{ contextTokensDisplay }}</span>
      <button type="button" class="secondary-button" :disabled="loading" @click="$emit('reload')">
        {{ text("刷新模型列表", "Refresh Models") }}
      </button>
      <p v-if="loading && loadingDisabledHelp" class="cs-disabled-help">
        {{ loadingDisabledHelp }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackTone } from "./codex-stack-view-model";
import "./codex-stack-dashboard.css";

defineProps<{
  currentModel: string;
  sourceHelp: string;
  sourceTone: CodexStackTone;
  sourceLabel: string;
  modelCount: number;
  contextTokensDisplay: string;
  loading: boolean;
  loadingDisabledHelp: string;
}>();

defineEmits<{
  reload: [];
}>();

const { text } = useLocalePreference();
</script>
