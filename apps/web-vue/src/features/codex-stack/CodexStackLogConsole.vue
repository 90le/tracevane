<template>
  <section class="cs-log-console">
    <header class="cs-log-guide-panel">
      <div>
        <p class="cs-section-kicker">{{ labels.guideLabel }}</p>
        <h4>{{ labels.guideService }} → {{ labels.guideScope }} → {{ labels.guideRead }}</h4>
      </div>
      <ol class="cs-log-guide" :aria-label="labels.guideLabel">
        <li>
          <strong>{{ labels.guideService }}</strong>
          <span>{{ labels.guideServiceCopy }}</span>
        </li>
        <li>
          <strong>{{ labels.guideScope }}</strong>
          <span>{{ labels.guideScopeCopy }}</span>
        </li>
        <li>
          <strong>{{ labels.guideRead }}</strong>
          <span>{{ labels.guideReadCopy }}</span>
        </li>
      </ol>
    </header>
    <div class="cs-log-workbench">
      <section class="cs-log-pane cs-log-service-pane">
        <p class="cs-section-kicker">{{ labels.targetService }}</p>
        <div class="cs-log-service-list">
          <button
            v-for="service in services"
            :key="service.id"
            type="button"
            class="cs-log-service-button"
            :class="{ 'cs-log-service-button-active': selectedService === service.id }"
            @click="emit('update:selectedService', service.id)"
          >
            <span :class="`cs-dot tone-${service.tone}`"></span>
            <strong>{{ service.label }}</strong>
            <small>{{ service.rawState }}</small>
          </button>
        </div>
      </section>
      <section class="cs-log-pane cs-log-read-pane">
        <p class="cs-section-kicker">{{ labels.readPerformance }}</p>
        <div class="cs-log-mode-list">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            class="cs-log-mode-button"
            :class="{ 'cs-log-mode-button-active': mode === option.id }"
            @click="emit('update:mode', option.id)"
          >
            <strong>{{ option.label }}</strong>
            <span>{{ option.lines }} {{ labels.lines }}</span>
          </button>
        </div>
        <p class="cs-field-hint">{{ modeHelp }}</p>
        <label class="cs-switch-row cs-log-auto">
          <input
            :checked="autoRefresh"
            type="checkbox"
            @change="onAutoRefreshChange"
          />
          {{ labels.autoRefresh }}
        </label>
        <div class="cs-log-toolbar">
          <div class="cs-chip-row">
            <span class="cs-info-chip">{{ labels.requested }} {{ requestedLines }}</span>
            <span v-if="meta" class="cs-info-chip">{{ labels.returned }} {{ meta.returnedLines }}</span>
            <span v-if="meta" class="cs-info-chip">{{ labels.sources }} {{ meta.sources.map((source) => source.label).join(" + ") }}</span>
            <span v-if="meta" class="cs-info-chip">{{ labels.fetched }} {{ fetchedAtLabel }}</span>
            <span v-if="meta?.truncated" class="cs-status-pill tone-accent">{{ labels.truncated }}</span>
          </div>
          <div class="cs-actions">
            <button type="button" class="primary-button" :disabled="refreshing" @click="emit('load', selectedService)">
              {{ refreshing ? labels.loading : labels.load }}
            </button>
            <p v-if="refreshing && refreshingDisabledHelp" class="cs-disabled-help">
              {{ refreshingDisabledHelp }}
            </p>
          </div>
        </div>
      </section>
    </div>
    <section class="cs-log-output-shell">
      <header class="cs-log-output-bar">
        <div>
          <p class="cs-section-kicker">{{ labels.readPerformance }}</p>
          <strong>{{ services.find((service) => service.id === selectedService)?.label || selectedService }}</strong>
        </div>
        <span>{{ requestedLines }} {{ labels.lines }}</span>
      </header>
      <pre class="cs-log">{{ output || labels.empty }}</pre>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { CodexStackLogResponse, CodexStackServiceId } from "../../../../../types/codex-stack";
import type { CodexStackTone } from "./codex-stack-view-model";
import "./codex-stack-workspace.css";

export type CodexStackLogLineMode = "light" | "balanced" | "deep";

export interface CodexStackLogServiceOption {
  id: CodexStackServiceId;
  label: string;
  tone: CodexStackTone;
  rawState: string;
}

export interface CodexStackLogLineOption {
  id: CodexStackLogLineMode;
  label: string;
  lines: number;
  help: string;
}

export interface CodexStackLogConsoleLabels {
  guideLabel: string;
  guideService: string;
  guideServiceCopy: string;
  guideScope: string;
  guideScopeCopy: string;
  guideRead: string;
  guideReadCopy: string;
  targetService: string;
  readPerformance: string;
  lines: string;
  autoRefresh: string;
  requested: string;
  returned: string;
  sources: string;
  fetched: string;
  truncated: string;
  load: string;
  loading: string;
  empty: string;
}

defineProps<{
  services: CodexStackLogServiceOption[];
  selectedService: CodexStackServiceId;
  mode: CodexStackLogLineMode;
  options: CodexStackLogLineOption[];
  modeHelp: string;
  autoRefresh: boolean;
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

function onAutoRefreshChange(event: Event): void {
  emit("update:autoRefresh", (event.target as HTMLInputElement).checked);
}
</script>
