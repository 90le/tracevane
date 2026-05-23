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

<style scoped>
.cs-log-console {
  display: grid;
  gap: 16px;
  padding: clamp(14px, 2vw, 20px);
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 24px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 82%, transparent), color-mix(in srgb, var(--code-bg) 12%, transparent)),
    color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow:
    0 24px 68px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
  backdrop-filter: blur(16px) saturate(1.04);
}

.cs-log-guide-panel {
  display: grid;
  grid-template-columns: minmax(210px, 0.42fr) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  padding: 0 0 14px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--acc) 8%, transparent), transparent 34%),
    transparent;
}

.cs-log-guide-panel h4 {
  margin: 0;
  color: var(--text);
}

.cs-log-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cs-log-guide li {
  display: grid;
  gap: 4px;
  border-left: 2px solid color-mix(in srgb, var(--acc) 42%, var(--line));
  padding: 1px 10px;
}

.cs-log-guide strong {
  color: var(--text);
  font-size: 0.86rem;
}

.cs-log-guide span {
  color: var(--text-soft);
  font-size: 0.78rem;
  line-height: 1.35;
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

.cs-log-workbench {
  display: grid;
  grid-template-columns: minmax(240px, 0.34fr) minmax(0, 1fr);
  gap: 0;
  align-items: start;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 62%, transparent);
}

.cs-log-pane {
  min-height: 100%;
  padding: 16px;
  background: transparent;
}

.cs-log-service-pane {
  border-right: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  background: color-mix(in srgb, var(--code-bg) 16%, transparent);
}

.cs-log-service-list,
.cs-log-mode-list {
  display: grid;
  gap: 8px;
}

.cs-log-service-list {
  grid-template-columns: 1fr;
}

.cs-log-mode-list {
  grid-template-columns: repeat(3, minmax(90px, 1fr));
}

.cs-log-service-button,
.cs-log-mode-button {
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  background: color-mix(in srgb, var(--surface) 58%, transparent);
  color: var(--text-soft);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.cs-log-service-button-active,
.cs-log-mode-button-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--acc) 16%, transparent), color-mix(in srgb, var(--surface) 74%, transparent)),
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
  border-top: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
  margin-top: 14px;
  padding-top: 14px;
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
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 62%, transparent);
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
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

.cs-log-output-shell {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 5%, transparent), transparent 20%),
    var(--code-bg);
}

.cs-log-output-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  padding: 11px 14px;
  color: var(--muted);
}

.cs-log-output-bar p {
  margin-bottom: 2px;
}

.cs-log-output-bar strong {
  color: var(--text);
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
  .cs-log-guide-panel,
  .cs-log-guide,
  .cs-log-workbench,
  .cs-log-service-list,
  .cs-log-mode-list {
    grid-template-columns: 1fr;
  }

  .cs-log-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-log-service-pane {
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  }
}
</style>
