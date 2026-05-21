<template>
  <div class="cs-diagnostics-grid">
    <article class="panel-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("健康检查", "Health Check") }}</p>
          <h4>{{ text("检查输出", "Check Output") }}</h4>
        </div>
        <button type="button" class="secondary-button" :disabled="busy" @click="$emit('run-check')">
          {{ text("重新运行", "Run Again") }}
        </button>
      </div>
      <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
      <pre class="cs-code">{{ output || text("尚未运行健康检查。", "Health check output will appear here after you run it.") }}</pre>
    </article>

    <article class="panel-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("信号", "Signals") }}</p>
          <h4>{{ text("提醒与风险", "Warnings and Risks") }}</h4>
        </div>
      </div>
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
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

defineProps<{
  output: string;
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
.cs-diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.cs-warning-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cs-disabled-help {
  margin: 0 0 10px;
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

@media (max-width: 960px) {
  .cs-diagnostics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
