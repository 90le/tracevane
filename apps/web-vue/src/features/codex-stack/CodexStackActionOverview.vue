<template>
  <div class="cs-action-overview-grid">
    <article class="panel-card cs-readiness-card">
      <p class="cs-section-kicker">{{ text("就绪度", "Readiness") }}</p>
      <div class="cs-readiness-meter">
        <strong>{{ readyComponentCount }}/{{ componentCount }}</strong>
        <span>{{ text("组件健康", "healthy components") }}</span>
      </div>
      <div class="cs-readiness-bar">
        <span :style="{ width: readinessPercent }"></span>
      </div>
      <p class="cs-field-hint">
        {{ issueCount ? text(`还有 ${issueCount} 个组件需要处理。`, `${issueCount} components need attention.`) : text("组件和服务状态稳定。", "Components and services are stable.") }}
      </p>
    </article>

    <CodexStackRecommendationCard
      :kicker="text('建议下一步', 'Suggested Next Step')"
      :title="nextActionTitle"
      :copy="nextActionCopy"
      :primary-label="nextActionButton"
      :secondary-label="text('打开对应页面', 'Open Section')"
      :primary-disabled="nextActionPrimaryDisabled"
      @primary="$emit('primary')"
      @open-section="$emit('open-section')"
    />

    <article class="panel-card cs-next-card">
      <p class="cs-section-kicker">{{ text("模型来源", "Model Source") }}</p>
      <h4>{{ modelSourceLabel }}</h4>
      <p>{{ modelSourceHelp }}</p>
      <div class="cs-model-preview">
        <span v-for="model in modelCatalogPreview" :key="model">{{ model }}</span>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import CodexStackRecommendationCard from "./CodexStackRecommendationCard.vue";

const props = defineProps<{
  readyComponentCount: number;
  componentCount: number;
  issueCount: number;
  readinessPercent: string;
  nextActionTitle: string;
  nextActionCopy: string;
  nextActionButton: string;
  nextActionRequiresMutation: boolean;
  canRunMutation: boolean;
  busy: boolean;
  modelSourceLabel: string;
  modelSourceHelp: string;
  modelCatalogPreview: string[];
}>();

defineEmits<{
  primary: [];
  "open-section": [];
}>();

const { text } = useLocalePreference();

const nextActionPrimaryDisabled = computed(() => (
  props.nextActionRequiresMutation ? !props.canRunMutation : props.busy
));
</script>

<style scoped>
.cs-action-overview-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(320px, 1.1fr) minmax(280px, 1fr);
  gap: 16px;
}

.cs-readiness-card,
.cs-next-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--code-bg) 18%, transparent)),
    var(--surface);
}

.cs-readiness-meter {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cs-readiness-meter strong {
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 1;
}

.cs-readiness-meter span {
  color: var(--text-soft);
  font-size: 0.84rem;
}

.cs-readiness-bar {
  height: 12px;
  overflow: hidden;
  margin: 16px 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 52%, transparent);
}

.cs-readiness-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--success), color-mix(in srgb, var(--acc) 68%, var(--success)));
}

.cs-next-card h4 {
  margin: 0;
  font-size: 1.15rem;
}

.cs-next-card p {
  color: var(--text-soft);
}

.cs-model-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-model-preview span {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 7px 10px;
  background: color-mix(in srgb, var(--code-bg) 42%, transparent);
  color: var(--text);
  font-size: 0.84rem;
}

@media (max-width: 1200px) {
  .cs-action-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .cs-action-overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
