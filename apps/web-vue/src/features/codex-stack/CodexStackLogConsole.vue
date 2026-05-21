<template>
  <article class="panel-card cs-log-console">
    <div class="cs-log-control-grid">
      <div>
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
      </div>
      <div>
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
      </div>
    </div>
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
    <pre class="cs-log">{{ output || labels.empty }}</pre>
  </article>
</template>

<script setup lang="ts">
import type { CodexStackLogResponse, CodexStackServiceId } from "../../../../../types/codex-stack";
import type { CodexStackTone } from "./codex-stack-view-model";

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

<style scoped>
.cs-log-console {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-field-hint {
  color: var(--text-soft);
}

.cs-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-soft);
}

.cs-log-control-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(260px, 1fr);
  gap: 18px;
}

.cs-log-service-list,
.cs-log-mode-list {
  display: grid;
  gap: 8px;
}

.cs-log-service-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cs-log-mode-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cs-log-service-button,
.cs-log-mode-button {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--text-soft);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.cs-log-service-button-active,
.cs-log-mode-button-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 96%, transparent)),
    var(--surface);
}

.cs-log-service-button:hover,
.cs-log-mode-button:hover {
  transform: translateY(-1px);
}

.cs-log-service-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  align-items: center;
  border-radius: 16px;
  padding: 12px;
  text-align: left;
}

.cs-log-service-button .cs-dot {
  margin: 0;
}

.cs-log-service-button small {
  grid-column: 2;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-log-mode-button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  border-radius: 16px;
  padding: 12px;
  text-align: left;
}

.cs-log-mode-button span {
  color: var(--muted);
  font-size: 0.82rem;
}

.cs-log-auto {
  margin-top: 12px;
}

.cs-log-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 0;
}

.cs-chip-row,
.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-info-chip,
.cs-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 0.85rem;
}

.cs-status-pill {
  font-weight: 600;
  color: var(--text);
}

.cs-status-pill.tone-accent {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
}

.cs-log {
  width: 100%;
  min-height: 340px;
  max-height: 520px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

.cs-dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--muted);
  box-shadow: 0 0 14px currentColor;
  flex: 0 0 auto;
}

.cs-dot.tone-sage {
  color: var(--success);
  background: var(--success);
}

.cs-dot.tone-accent {
  color: var(--acc);
  background: var(--acc);
}

.cs-dot.tone-danger {
  color: var(--danger);
  background: var(--danger);
}

.cs-dot.tone-neutral {
  color: var(--muted);
}

@media (max-width: 980px) {
  .cs-log-control-grid,
  .cs-log-service-list,
  .cs-log-mode-list {
    grid-template-columns: 1fr;
  }

  .cs-log-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
