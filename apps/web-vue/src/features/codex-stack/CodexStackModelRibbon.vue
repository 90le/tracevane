<template>
  <article class="cs-surface cs-model-ribbon">
    <div>
      <p class="cs-section-kicker">{{ text("模型目录", "Model Catalog") }}</p>
      <h3>{{ currentModel || "--" }}</h3>
      <p>{{ sourceHelp }}</p>
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

<style scoped>
.cs-model-ribbon {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-color: color-mix(in srgb, var(--acc) 22%, var(--line));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--sky) 16%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 94%, #132132 6%), var(--surface));
}

.cs-model-ribbon h3 {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.8rem);
}

.cs-model-ribbon p {
  margin: 8px 0 0;
  color: var(--text-soft);
}

.cs-model-ribbon-side {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.cs-disabled-help {
  flex-basis: 100%;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
  text-align: right;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-info-chip,
.cs-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 0.85rem;
}

.cs-status-pill {
  font-weight: 600;
  color: var(--text);
}

.cs-status-pill.tone-sage {
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-status-pill.tone-accent {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
}

.cs-status-pill.tone-danger {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
}

.cs-status-pill.tone-neutral {
  color: #263241;
  border-color: #c5ced8;
  background: #eef2f6;
}

@media (max-width: 960px) {
  .cs-model-ribbon {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-model-ribbon-side {
    justify-content: flex-start;
  }
}
</style>
