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
import "./codex-stack-workspace.css";

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
