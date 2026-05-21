<template>
  <div v-if="running" class="cs-install-overlay">
    <article class="panel-card cs-install-progress">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("进度", "Progress") }}</p>
          <h4>{{ text("任务执行中", "Task Running") }}</h4>
        </div>
        <span class="cs-progress-badge cs-progress-running">{{ title }} · {{ statusLabel }}</span>
      </div>
      <p class="cs-progress-hint">
        {{ text("安装或修复脚本正在后台执行，日志会持续刷新。", "The install or repair job is running in the background and the log tail is updating continuously.") }}
      </p>
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
      <pre class="cs-progress-log">{{ job.logTail || emptyLog }}</pre>
    </article>
  </div>

  <article
    v-else
    class="panel-card"
    :class="job.status === 'succeeded' ? 'cs-result-ok' : 'cs-result-fail'"
  >
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("结果", "Result") }}</p>
        <h4>{{ job.status === "succeeded" ? text("任务完成", "Task Succeeded") : text("任务失败", "Task Failed") }}</h4>
      </div>
      <span class="cs-progress-badge" :class="job.status === 'succeeded' ? 'cs-progress-ok' : 'cs-progress-fail'">
        {{ title }} · {{ statusLabel }}
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
    <pre v-if="job.error || job.logTail" class="cs-progress-log">{{ job.error || job.logTail }}</pre>
    <div class="cs-actions">
      <button type="button" class="secondary-button" @click="$emit('dismiss')">
        {{ text("关闭摘要", "Dismiss Summary") }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { CodexStackJob } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";

export interface CodexStackJobProgressStep {
  label: string;
  state: "done" | "active" | "failed" | "pending";
}

defineProps<{
  job: CodexStackJob;
  title: string;
  statusLabel: string;
  steps: CodexStackJobProgressStep[];
  progressPercent: string;
  running: boolean;
  emptyLog: string;
}>();

defineEmits<{
  dismiss: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-install-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, #081018 56%, transparent);
  backdrop-filter: blur(6px);
  border-radius: calc(var(--radius-lg) + 8px);
}

.cs-install-progress {
  width: min(920px, 100%);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
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

.cs-progress-running {
  background: var(--acc);
  color: #fff;
  border-color: transparent;
  animation: cs-pulse 1.5s infinite;
}

.cs-progress-ok {
  background: var(--success);
  color: #fff;
  border-color: transparent;
}

.cs-progress-fail {
  background: var(--danger);
  color: #fff;
  border-color: transparent;
}

.cs-progress-log {
  width: 100%;
  max-height: 320px;
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

.cs-result-ok {
  border-color: color-mix(in srgb, var(--success) 38%, var(--line));
}

.cs-result-fail {
  border-color: color-mix(in srgb, var(--danger) 38%, var(--line));
}

.cs-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@keyframes cs-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@media (max-width: 960px) {
  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
