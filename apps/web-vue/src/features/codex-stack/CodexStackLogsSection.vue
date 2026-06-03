<template>
  <CodexStackSectionStack>
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
import CodexStackLogConsole from "./CodexStackLogConsole.vue";
import type {
  CodexStackLogConsoleLabels,
  CodexStackLogLineMode,
  CodexStackLogLineOption,
  CodexStackLogServiceOption,
} from "./CodexStackLogConsole.vue";
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
</script>
