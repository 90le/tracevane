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
    <p class="cs-field-hint">
      {{ text("检查结果会以悬浮窗口展示，不占用页面内容区。", "Health check results open in a floating dialog instead of taking over this page.") }}
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

<style scoped>
.cs-diagnostics-panel {
  display: grid;
  gap: 12px;
}

.cs-warning-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-warning-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--line));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.cs-warning-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 18%, transparent);
  color: var(--warning);
  font-weight: 700;
  flex: 0 0 auto;
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

.cs-field-hint {
  margin: 0;
  color: var(--text-soft);
  line-height: 1.45;
}
</style>
