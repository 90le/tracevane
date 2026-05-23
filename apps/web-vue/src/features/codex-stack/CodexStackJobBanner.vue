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
      <button type="button" class="secondary-button" @click="$emit('open-logs')">
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

const props = defineProps<{
  title: string;
  commandLabel: string;
  status: CodexStackJobStatus;
  statusLabel: string;
  updatedAtLabel: string;
  running: boolean;
}>();

defineEmits<{
  "open-logs": [];
  dismiss: [];
}>();

const { text } = useLocalePreference();

const jobStateClass = computed(() => {
  if (props.status === "succeeded") return "cs-job-banner-ok";
  if (props.status === "failed" || props.status === "interrupted") return "cs-job-banner-fail";
  return "cs-job-banner-live";
});
</script>

<style scoped>
.cs-job-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-color: color-mix(in srgb, var(--line) 72%, transparent);
}

.cs-job-banner-live {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--acc) 30%, transparent);
}

.cs-job-banner-ok {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--success) 34%, transparent);
}

.cs-job-banner-fail {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 34%, transparent);
}

.cs-job-eyebrow {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-job-meta {
  color: var(--text-soft);
}

.cs-job-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .cs-job-banner {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
