<template>
  <article class="panel-card cs-job-output-card">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("任务输出", "Job Output") }}</p>
        <h4>{{ title }} · {{ statusLabel }}</h4>
      </div>
      <span class="cs-status-pill" :class="`tone-${statusTone}`">
        {{ statusLabel }}
      </span>
    </div>
    <div class="cs-job-progress-track" :style="{ '--progress': progressPercent }">
      <span></span>
    </div>
    <div class="cs-job-step-list">
      <span
        v-for="step in steps"
        :key="step.label"
        class="cs-job-step"
        :class="`cs-job-step-${step.state}`"
      >
        {{ step.label }}
      </span>
    </div>
    <pre class="cs-log">{{ job.logTail || emptyLog }}</pre>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CodexStackJob } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackTone } from "./codex-stack-view-model";
import type { CodexStackJobProgressStep } from "./CodexStackJobProgressPanel.vue";

const props = defineProps<{
  job: CodexStackJob;
  title: string;
  statusLabel: string;
  steps: CodexStackJobProgressStep[];
  progressPercent: string;
  emptyLog: string;
}>();

const { text } = useLocalePreference();

const statusTone = computed<CodexStackTone>(() => {
  if (props.job.status === "succeeded") return "sage";
  if (props.job.status === "failed" || props.job.status === "interrupted") return "danger";
  return "accent";
});
</script>

<style scoped>
.cs-job-output-card {
  border-color: color-mix(in srgb, var(--acc) 22%, var(--line));
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

.cs-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
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

.cs-job-progress-track {
  --progress: 0%;
  height: 10px;
  overflow: hidden;
  margin: 12px 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  background: color-mix(in srgb, var(--code-bg) 58%, transparent);
}

.cs-job-progress-track span {
  display: block;
  width: var(--progress);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--acc), color-mix(in srgb, var(--success) 72%, var(--acc)));
  transition: width 0.28s ease;
}

.cs-job-step-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.cs-job-step {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 8px 10px;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  font-size: 0.82rem;
}

.cs-job-step-done {
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-job-step-active {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
  font-weight: 700;
}

.cs-job-step-failed {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
  font-weight: 700;
}

.cs-log {
  width: 100%;
  min-height: 340px;
  max-height: 520px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

@media (max-width: 960px) {
  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
