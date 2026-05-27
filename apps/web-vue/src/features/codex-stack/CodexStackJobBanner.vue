<template>
  <article class="cs-surface cs-job-banner" :class="jobStateClass">
    <div>
      <p class="cs-job-eyebrow">{{ text("后台任务", "Background Job") }}</p>
      <h3>{{ title }}</h3>
      <p class="cs-job-meta">
        {{ commandLabel }} · {{ statusLabel }} · {{ updatedAtLabel }}
      </p>
    </div>
    <div class="cs-job-actions">
      <button type="button" class="secondary-button" @click="$emit('open-output')">
        {{ text("查看输出", "View Output") }}
      </button>
      <button
        v-if="!running"
        type="button"
        class="secondary-button"
        @click="$emit('dismiss')"
      >
        {{ text("关闭", "Dismiss") }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CodexStackJobStatus } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-workspace.css";

const props = defineProps<{
  title: string;
  commandLabel: string;
  status: CodexStackJobStatus;
  statusLabel: string;
  updatedAtLabel: string;
  running: boolean;
}>();

defineEmits<{
  "open-output": [];
  dismiss: [];
}>();

const { text } = useLocalePreference();

const jobStateClass = computed(() => {
  if (props.status === "succeeded") return "cs-job-banner-ok";
  if (props.status === "failed" || props.status === "interrupted") return "cs-job-banner-fail";
  return "cs-job-banner-live";
});
</script>
