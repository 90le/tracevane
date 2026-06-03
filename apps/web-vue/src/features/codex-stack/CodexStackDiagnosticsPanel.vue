<template>
  <article class="cs-surface cs-diagnostics-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("诊断", "Diagnostics") }}</p>
        <h4>{{ text("健康检查与提醒", "Health Check and Signals") }}</h4>
      </div>
      <button type="button" class="secondary-button" :disabled="busy" @click="$emit('run-check')">
        {{ text("运行健康检查", "Run Health Check") }}
      </button>
    </div>
    <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
      {{ busyDisabledHelp }}
    </p>

    <div v-if="warnings.length" class="cs-warning-list">
      <div v-for="warning in warnings" :key="warning" class="cs-warning-row">
        <span class="cs-warning-icon">!</span>
        <span>{{ warning }}</span>
      </div>
    </div>
    <div v-else class="cs-empty-lite">
      {{ text("当前没有额外告警。", "No additional warnings right now.") }}
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-workspace.css";

defineProps<{
  warnings: string[];
  busy: boolean;
  busyDisabledHelp: string;
}>();

defineEmits<{
  "run-check": [];
}>();

const { text } = useLocalePreference();
</script>
