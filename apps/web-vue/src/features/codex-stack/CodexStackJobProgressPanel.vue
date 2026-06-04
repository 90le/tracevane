<template>
  <Teleport to="body">
    <div class="cs-job-progress-dock">
      <section
        class="cs-job-console cs-job-output-sheet"
        :class="!running && (job.status === 'succeeded' ? 'cs-result-ok' : 'cs-result-fail')"
        role="dialog"
        aria-live="polite"
        :aria-label="running ? text('任务执行输出', 'Task output') : text('任务执行结果', 'Task result')"
      >
        <div class="cs-console-header">
          <div>
            <p class="cs-section-kicker">{{ running ? text("进度", "Progress") : text("结果", "Result") }}</p>
            <h4>{{ running ? text("任务执行中", "Task Running") : job.status === "succeeded" ? text("任务完成", "Task Succeeded") : text("任务失败", "Task Failed") }}</h4>
          </div>
          <div class="cs-job-sheet-actions">
            <span
              class="cs-progress-badge"
              :class="running ? 'cs-progress-running' : job.status === 'succeeded' ? 'cs-progress-ok' : 'cs-progress-fail'"
            >
              {{ title }} · {{ statusLabel }}
            </span>
            <button type="button" class="secondary-button" @click="$emit('copy-output')">
              <Copy :size="15" aria-hidden="true" />
              {{ text("复制输出", "Copy Output") }}
            </button>
            <button type="button" class="secondary-button" @click="$emit('close')">
              <X :size="15" aria-hidden="true" />
              {{ text("隐藏窗口", "Hide") }}
            </button>
          </div>
        </div>

        <p v-if="running" class="cs-progress-hint">
          {{ text("安装或修复脚本正在后台执行，日志会持续刷新；隐藏窗口不会停止任务。", "The install or repair job is running in the background; hiding this sheet does not stop the job.") }}
        </p>

        <div class="cs-job-progress-meter">
          <div class="cs-job-progress-meta">
            <span>{{ text("任务进度", "Task Progress") }}</span>
            <strong>{{ progressValue }}%</strong>
          </div>
          <progress
            class="cs-job-progress-track"
            :value="progressValue"
            max="100"
            :aria-label="text('任务执行进度', 'Task progress')"
          >
            {{ progressValue }}%
          </progress>
        </div>
        <div class="cs-job-step-list">
          <span
            v-for="step in steps"
            :key="step.label"
            class="cs-job-step"
            :class="`cs-job-step-${step.state}`"
            :aria-current="step.state === 'active' ? 'step' : undefined"
          >
            <component :is="stepIcon(step.state)" :size="14" aria-hidden="true" />
            {{ step.label }}
          </span>
        </div>

        <div v-if="running || job.error || job.logTail" class="cs-progress-log-shell">
          <div class="cs-progress-log-bar">
            <span>{{ running ? text("实时输出", "Live Output") : job.status === "succeeded" ? text("完成摘要", "Completion Summary") : text("失败输出", "Failure Output") }}</span>
            <span>{{ statusLabel }}</span>
          </div>
          <pre class="cs-progress-log">{{ progressOutput }}</pre>
        </div>

        <div v-if="!running" class="cs-actions">
          <button type="button" class="secondary-button" @click="$emit('dismiss')">
            {{ text("关闭摘要", "Dismiss Summary") }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { CheckCircle2, Circle, Copy, LoaderCircle, X, XCircle } from "@lucide/vue";
import type { CodexStackJob } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-workspace.css";

export interface CodexStackJobProgressStep {
  label: string;
  state: "done" | "active" | "failed" | "pending";
}

defineEmits<{
  "copy-output": [];
  close: [];
  dismiss: [];
}>();

const { text } = useLocalePreference();
const props = defineProps<{
  job: CodexStackJob;
  title: string;
  statusLabel: string;
  steps: CodexStackJobProgressStep[];
  progressValue: number;
  running: boolean;
  emptyLog: string;
}>();

const progressOutput = computed(() => (
  props.running ? props.job.logTail || props.emptyLog : props.job.error || props.job.logTail || props.emptyLog
));

function stepIcon(state: CodexStackJobProgressStep["state"]): Component {
  if (state === "done") return CheckCircle2;
  if (state === "active") return LoaderCircle;
  if (state === "failed") return XCircle;
  return Circle;
}
</script>
