<template>
  <div class="cs-check-dialog-backdrop" role="dialog" aria-modal="true" :aria-label="text('健康检查结果', 'Health Check Result')">
    <article class="panel-card cs-check-dialog">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("健康检查", "Health Check") }}</p>
          <h4>{{ running ? text("正在运行检查", "Running Check") : text("检查结果", "Check Result") }}</h4>
        </div>
        <div class="cs-check-actions">
          <button type="button" class="secondary-button" :disabled="running" @click="$emit('rerun')">
            {{ text("重新运行", "Run Again") }}
          </button>
          <button type="button" class="secondary-button" @click="$emit('close')">
            {{ text("关闭", "Close") }}
          </button>
        </div>
      </div>
      <p v-if="running" class="cs-check-hint">
        {{ text("健康检查正在执行，结果会在这里更新。", "The health check is running; results will update here.") }}
      </p>
      <p v-else-if="busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
      <pre class="cs-check-output">{{ displayOutput }}</pre>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";

const props = defineProps<{
  output: string;
  running: boolean;
  busyDisabledHelp: string;
}>();

defineEmits<{
  close: [];
  rerun: [];
}>();

const { text } = useLocalePreference();

const displayOutput = computed(() => (
  stripAnsi(props.output || text("等待健康检查输出...", "Waiting for health check output..."))
));

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
</script>

<style scoped>
.cs-check-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, #071018 52%, transparent);
  backdrop-filter: blur(6px);
}

.cs-check-dialog {
  width: min(980px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.28);
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

.cs-check-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.cs-check-hint,
.cs-disabled-help {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.9rem;
  line-height: 1.45;
}

.cs-disabled-help {
  color: var(--warning);
}

.cs-check-output {
  flex: 1 1 auto;
  min-height: 360px;
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  background: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

@media (max-width: 720px) {
  .cs-check-dialog-backdrop {
    padding: 12px;
  }

  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-check-actions {
    justify-content: flex-start;
  }

  .cs-check-output {
    min-height: 260px;
  }
}
</style>
