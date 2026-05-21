<template>
  <div class="cs-dashboard-grid">
    <article class="panel-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ labels.runtimeKicker }}</p>
          <h4>{{ labels.runtimeTitle }}</h4>
        </div>
      </div>
      <dl class="cs-kv-list cs-kv-list-spacious">
        <div v-for="row in runtimeRows" :key="row.id" class="cs-kv-row">
          <span>{{ row.label }}</span>
          <code>{{ row.value }}</code>
        </div>
        <div v-if="smokeMatrix" class="cs-smoke-matrix-detail">
          <div class="cs-smoke-matrix-head">
            <span>{{ smokeMatrix.requiredModelsLabel }}</span>
            <strong>{{ smokeMatrix.requiredModels }}</strong>
          </div>
          <div class="cs-smoke-matrix-head">
            <span>{{ smokeMatrix.attachEligibleLabel }}</span>
            <strong>{{ smokeMatrix.attachEligible }}</strong>
          </div>
          <article v-for="model in smokeMatrix.models" :key="model.model" class="cs-smoke-model-row">
            <div>
              <strong>{{ model.model }} · {{ model.status }}</strong>
              <p>{{ model.checksLabel }}</p>
              <p v-if="model.error" class="cs-smoke-error">{{ model.error }}</p>
            </div>
          </article>
        </div>
      </dl>
    </article>

    <article class="panel-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ labels.componentsKicker }}</p>
          <h4>{{ labels.componentsTitle }}</h4>
        </div>
      </div>
      <div class="cs-component-list">
        <article v-for="component in components" :key="component.id" class="cs-component-card">
          <div class="cs-component-head">
            <div>
              <strong>{{ component.label }}</strong>
              <p>{{ component.statusLabel }}</p>
            </div>
            <span class="cs-status-pill" :class="`tone-${component.tone}`">
              {{ component.statusLabel }}
            </span>
          </div>
          <p class="cs-component-version">{{ component.versionLabel }}</p>
          <p v-if="component.notes" class="cs-component-notes">{{ component.notes }}</p>
        </article>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { CodexStackComponentId } from "../../../../../types/codex-stack";
import type { CodexStackTone } from "./codex-stack-view-model";

export interface CodexStackRuntimeSummaryRow {
  id: string;
  label: string;
  value: string;
}

export interface CodexStackSmokeModelCard {
  model: string;
  status: string;
  checksLabel: string;
  error: string | null;
}

export interface CodexStackSmokeMatrixCard {
  requiredModelsLabel: string;
  requiredModels: string;
  attachEligibleLabel: string;
  attachEligible: string;
  models: CodexStackSmokeModelCard[];
}

export interface CodexStackComponentHealthCard {
  id: CodexStackComponentId;
  label: string;
  statusLabel: string;
  versionLabel: string;
  notes: string;
  tone: CodexStackTone;
}

export interface CodexStackDashboardInsightsLabels {
  runtimeKicker: string;
  runtimeTitle: string;
  componentsKicker: string;
  componentsTitle: string;
}

defineProps<{
  labels: CodexStackDashboardInsightsLabels;
  runtimeRows: CodexStackRuntimeSummaryRow[];
  smokeMatrix: CodexStackSmokeMatrixCard | null;
  components: CodexStackComponentHealthCard[];
}>();
</script>

<style scoped>
.cs-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
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

.cs-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
}

.cs-status-pill.tone-sage {
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-status-pill.tone-accent {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
}

.cs-status-pill.tone-danger {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
}

.cs-status-pill.tone-neutral {
  color: #263241;
  border-color: #c5ced8;
  background: #eef2f6;
}

.cs-kv-list {
  display: grid;
  gap: 10px;
}

.cs-kv-list-spacious {
  gap: 14px;
}

.cs-kv-row {
  display: grid;
  grid-template-columns: minmax(120px, 180px) 1fr;
  gap: 12px;
  align-items: start;
}

.cs-kv-row span {
  color: var(--muted);
  font-size: 0.9rem;
}

.cs-kv-row code {
  color: var(--text);
  background: color-mix(in srgb, var(--code-bg) 84%, transparent);
  border-radius: 10px;
  padding: 6px 10px;
  word-break: break-word;
}

.cs-smoke-matrix-detail {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-smoke-matrix-head,
.cs-smoke-model-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.cs-smoke-matrix-head span,
.cs-smoke-model-row p {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
}

.cs-smoke-model-row {
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.cs-smoke-error {
  color: var(--danger) !important;
  word-break: break-word;
}

.cs-component-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-component-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  padding: 14px;
}

.cs-component-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-component-head p {
  margin: 4px 0 0;
}

.cs-component-version,
.cs-component-notes {
  color: var(--text-soft);
}

@media (max-width: 980px) {
  .cs-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-kv-row {
    grid-template-columns: 1fr;
  }
}
</style>
