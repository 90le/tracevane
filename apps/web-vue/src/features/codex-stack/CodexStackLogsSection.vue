<template>
  <CodexStackSectionStack>
    <CodexStackSectionIntro
      :kicker="text('日志', 'Logs')"
      :title="text('控制台与日志诊断', 'Console and Log Diagnostics')"
      :copy="text('按“选服务 → 定范围 → 读取日志”排查。任务执行时先看上方任务输出，再决定是否切到完整上下文。', 'Debug with Pick Service, Choose Scope, then Load Logs. When a job is running, read the job output first before switching to deeper context.')"
    />

    <CodexStackLogConsole
      :selected-service="selectedService"
      :mode="mode"
      :auto-refresh="autoRefresh"
      :services="services"
      :options="options"
      :mode-help="modeHelp"
      :requested-lines="requestedLines"
      :meta="meta"
      :fetched-at-label="fetchedAtLabel"
      :output="output"
      :refreshing="refreshing"
      :labels="labels"
      :refreshing-disabled-help="refreshingDisabledHelp"
      @update:selected-service="(serviceId) => emit('update:selectedService', serviceId)"
      @update:mode="(nextMode) => emit('update:mode', nextMode)"
      @update:auto-refresh="(enabled) => emit('update:autoRefresh', enabled)"
      @load="(serviceId) => emit('load', serviceId)"
    />
  </CodexStackSectionStack>
</template>

<script setup lang="ts">
import type { CodexStackLogResponse, CodexStackServiceId } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import CodexStackLogConsole from "./CodexStackLogConsole.vue";
import type {
  CodexStackLogConsoleLabels,
  CodexStackLogLineMode,
  CodexStackLogLineOption,
  CodexStackLogServiceOption,
} from "./CodexStackLogConsole.vue";
import CodexStackSectionIntro from "./CodexStackSectionIntro.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";

defineProps<{
  selectedService: CodexStackServiceId;
  mode: CodexStackLogLineMode;
  autoRefresh: boolean;
  services: CodexStackLogServiceOption[];
  options: CodexStackLogLineOption[];
  modeHelp: string;
  requestedLines: number;
  meta: CodexStackLogResponse | null;
  fetchedAtLabel: string;
  output: string;
  refreshing: boolean;
  refreshingDisabledHelp: string;
  labels: CodexStackLogConsoleLabels;
}>();

const emit = defineEmits<{
  "update:selectedService": [serviceId: CodexStackServiceId];
  "update:mode": [mode: CodexStackLogLineMode];
  "update:autoRefresh": [enabled: boolean];
  load: [serviceId: CodexStackServiceId];
}>();

const { text } = useLocalePreference();
</script>
