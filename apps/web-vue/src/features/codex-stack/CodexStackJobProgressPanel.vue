<template>
  <div
    v-if="running"
    class="cs-job-progress-dock"
  >
    <section class="cs-job-console">
      <div class="cs-console-header">
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
      <div class="cs-progress-log-shell">
        <div class="cs-progress-log-bar">
          <span>{{ text("实时输出", "Live Output") }}</span>
          <span>{{ statusLabel }}</span>
        </div>
        <pre class="cs-progress-log">{{ job.logTail || emptyLog }}</pre>
      </div>
    </section>
  </div>

  <section
    v-else
    class="cs-job-console cs-job-result-console"
    :class="[
      job.status === 'succeeded' ? 'cs-result-ok' : 'cs-result-fail',
      'cs-job-progress-dock'
    ]"
  >
    <div class="cs-console-header">
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
    <div v-if="job.error || job.logTail" class="cs-progress-log-shell">
      <div class="cs-progress-log-bar">
        <span>{{ job.status === "succeeded" ? text("完成摘要", "Completion Summary") : text("失败输出", "Failure Output") }}</span>
        <span>{{ statusLabel }}</span>
      </div>
      <pre class="cs-progress-log">{{ job.error || job.logTail }}</pre>
    </div>
    <div class="cs-actions">
      <button type="button" class="secondary-button" @click="$emit('dismiss')">
        {{ text("关闭摘要", "Dismiss Summary") }}
      </button>
    </div>
  </section>
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
  surface?: "panel";
}>();

defineEmits<{
  dismiss: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-job-progress-dock {
  position: fixed;
  right: clamp(16px, 2.5vw, 30px);
  bottom: clamp(16px, 2.5vw, 30px);
  z-index: 70;
  width: min(680px, calc(100vw - 32px));
  max-height: min(720px, calc(100vh - 32px));
}

.cs-job-console {
  width: min(920px, 100%);
  display: grid;
  gap: 13px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
  border-radius: 22px;
  padding: 16px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--surface) 78%, transparent), color-mix(in srgb, var(--code-bg) 22%, transparent)),
    var(--surface);
  box-shadow:
    0 26px 72px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 color-mix(in srgb, #fff 15%, transparent);
  backdrop-filter: blur(18px) saturate(1.08);
}

.cs-job-progress-dock .cs-job-console {
  width: 100%;
  max-height: inherit;
  box-shadow:
    0 28px 78px rgba(0, 0, 0, 0.38),
    0 0 0 1px color-mix(in srgb, var(--acc) 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent);
}

.cs-console-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-console-header h4 {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-progress-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
  border-radius: 999px;
  padding: 6px 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
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
  max-height: min(360px, 42vh);
  overflow: auto;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

.cs-progress-log-shell {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 5%, transparent), transparent 22%),
    var(--code-bg);
}

.cs-progress-log-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  padding: 9px 12px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  border-radius: 12px;
  padding: 8px 10px;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  font-size: 0.82rem;
}

.cs-job-step-done {
  color: color-mix(in srgb, var(--success) 72%, var(--text));
  border-color: color-mix(in srgb, var(--success) 48%, var(--line));
  background: color-mix(in srgb, var(--success) 14%, var(--surface));
}

.cs-job-step-active {
  color: color-mix(in srgb, var(--acc) 72%, var(--text));
  border-color: color-mix(in srgb, var(--acc) 48%, var(--line));
  background: color-mix(in srgb, var(--acc) 14%, var(--surface));
  font-weight: 700;
}

.cs-job-step-failed {
  color: color-mix(in srgb, var(--danger) 74%, var(--text));
  border-color: color-mix(in srgb, var(--danger) 50%, var(--line));
  background: color-mix(in srgb, var(--danger) 14%, var(--surface));
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
  .cs-job-progress-dock {
    inset: auto 10px 10px;
    width: auto;
  }

  .cs-console-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
