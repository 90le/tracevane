<template>
  <div class="cs-check-dialog-backdrop" role="dialog" aria-modal="true" :aria-label="text('健康检查结果', 'Health Check Result')">
    <section class="cs-check-dialog">
      <div class="cs-console-header">
        <div>
          <p class="cs-section-kicker">
            <Activity :size="14" aria-hidden="true" />
            {{ text("健康检查", "Health Check") }}
          </p>
          <h4>{{ running ? text("正在运行检查", "Running Check") : text("检查输出", "Check Output") }}</h4>
        </div>
        <div class="cs-check-actions">
          <button type="button" class="secondary-button" :disabled="running" @click="$emit('rerun')">
            <RefreshCw :size="15" aria-hidden="true" />
            {{ text("重新运行", "Run Again") }}
          </button>
          <button type="button" class="secondary-button" @click="$emit('close')">
            <X :size="15" aria-hidden="true" />
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
      <section class="cs-check-terminal">
        <header class="cs-check-terminal-bar">
          <span>
            <Terminal :size="14" aria-hidden="true" />
            {{ text("检查输出", "Check Output") }}
          </span>
          <span>{{ running ? text("运行中", "Running") : text("已完成", "Finished") }}</span>
        </header>
        <pre class="cs-check-output">{{ displayOutput }}</pre>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Activity, RefreshCw, Terminal, X } from "@lucide/vue";
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-workspace.css";

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
