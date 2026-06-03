<template>
  <section class="cs-log-console">
    <div class="cs-log-workbench">
      <section class="cs-log-pane cs-log-service-pane" :aria-label="labels.targetService">
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
      <section class="cs-log-pane cs-log-read-pane" :aria-label="labels.readPerformance">
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
        <label class="cs-switch-row cs-log-auto">
          <input
            :checked="autoRefresh"
            type="checkbox"
            @change="onAutoRefreshChange"
          />
          {{ labels.autoRefresh }}
        </label>
        <div class="cs-log-toolbar">
          <p class="cs-field-hint">{{ modeHelp }}</p>
          <div class="cs-chip-row">
            <span class="cs-info-chip">{{ labels.requested }} {{ requestedLines }}</span>
            <span v-if="meta" class="cs-info-chip">{{ labels.returned }} {{ meta.returnedLines }}</span>
            <span v-if="meta" class="cs-info-chip">{{ labels.sources }} {{ meta.sources.map((source) => source.label).join(" + ") }}</span>
            <span v-if="meta" class="cs-info-chip">{{ labels.fetched }} {{ fetchedAtLabel }}</span>
            <span v-if="meta?.truncated" class="cs-status-pill tone-accent">{{ labels.truncated }}</span>
          </div>
          <div class="cs-actions">
            <button type="button" class="primary-button" :disabled="refreshing" @click="requestLoad">
              {{ refreshing ? labels.loading : labels.load }}
            </button>
            <button type="button" class="secondary-button" @click="openOutputSheet">
              <Terminal :size="15" aria-hidden="true" />
              {{ labels.openOutput }}
            </button>
            <p v-if="refreshing && refreshingDisabledHelp" class="cs-disabled-help">
              {{ refreshingDisabledHelp }}
            </p>
          </div>
        </div>
      </section>
    </div>
    <Teleport v-if="outputSheetOpen" to="body">
      <div class="floating-output-dock cs-log-output-dock">
        <section
          class="floating-output-sheet cs-log-output-shell cs-log-output-sheet"
          role="dialog"
          aria-live="polite"
          :aria-label="labels.outputWindow"
        >
          <header class="floating-output-sheet__head cs-log-output-bar">
            <div>
              <p class="cs-section-kicker">{{ labels.outputWindow }}</p>
              <strong>{{ currentServiceLabel }}</strong>
            </div>
            <div class="floating-output-sheet__actions cs-log-output-actions">
              <span>{{ requestedLines }} {{ labels.lines }}</span>
              <button type="button" class="secondary-button" @click="copyOutput">
                <Copy :size="15" aria-hidden="true" />
                {{ copied ? labels.copied : labels.copyOutput }}
              </button>
              <button type="button" class="secondary-button" @click="outputSheetOpen = false">
                <X :size="15" aria-hidden="true" />
                {{ labels.closeOutput }}
              </button>
            </div>
          </header>
          <pre class="floating-output-sheet__log cs-log">{{ displayOutput }}</pre>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { Copy, Terminal, X } from "@lucide/vue";
import { computed, ref } from "vue";
import type { CodexStackLogResponse, CodexStackServiceId } from "../../../../../types/codex-stack";
import { copyTextToClipboard } from "../../shared/clipboard";
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
  openOutput: string;
  outputWindow: string;
  copyOutput: string;
  copied: string;
  closeOutput: string;
}

const props = defineProps<{
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

const outputSheetOpen = ref(false);
const copied = ref(false);

const currentServiceLabel = computed(() => (
  props.services.find((service) => service.id === props.selectedService)?.label || props.selectedService
));
const displayOutput = computed(() => stripAnsi(props.output || props.labels.empty));

function onAutoRefreshChange(event: Event): void {
  emit("update:autoRefresh", (event.target as HTMLInputElement).checked);
}

function requestLoad(): void {
  outputSheetOpen.value = true;
  emit("load", props.selectedService);
}

function openOutputSheet(): void {
  outputSheetOpen.value = true;
}

async function copyOutput(): Promise<void> {
  const ok = await copyTextToClipboard(displayOutput.value);
  if (!ok) return;
  copied.value = true;
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      copied.value = false;
    }, 1400);
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
</script>
