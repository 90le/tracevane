<template>
  <div class="cs-dashboard-grid">
    <article class="cs-surface">
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
        <div v-if="networkPolicy" class="cs-network-policy-strip" :class="`tone-${networkPolicy.tone}`">
          <div class="cs-network-policy-head">
            <div>
              <span>{{ networkPolicy.kicker }}</span>
              <strong>{{ networkPolicy.title }}</strong>
            </div>
            <strong>{{ networkPolicy.modeValue }}</strong>
          </div>
          <div class="cs-network-policy-grid">
            <div>
              <span>{{ networkPolicy.loopbackLabel }}</span>
              <strong>{{ networkPolicy.loopbackValue }}</strong>
              <p>{{ networkPolicy.loopbackHelp }}</p>
            </div>
            <div>
              <span>{{ networkPolicy.upstreamLabel }}</span>
              <strong>{{ networkPolicy.upstreamValue }}</strong>
              <p>{{ networkPolicy.modeHelp }}</p>
            </div>
          </div>
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
          <div class="cs-smoke-matrix-head">
            <span>{{ smokeMatrix.statusLabel }}</span>
            <strong>{{ smokeMatrix.statusValue }}</strong>
          </div>
          <div class="cs-smoke-matrix-head">
            <span>{{ smokeMatrix.checkedAtLabel }}</span>
            <strong>{{ smokeMatrix.checkedAt }}</strong>
          </div>
          <div class="cs-smoke-matrix-head">
            <span>{{ smokeMatrix.durationLabel }}</span>
            <strong>{{ smokeMatrix.duration }}</strong>
          </div>
          <div class="cs-smoke-matrix-head" :class="`tone-${smokeMatrix.freshnessTone}`">
            <span>{{ smokeMatrix.freshnessLabel }}</span>
            <strong>{{ smokeMatrix.freshness }}</strong>
          </div>
          <article v-for="model in smokeMatrix.models" :key="model.model" class="cs-smoke-model-row">
            <div>
              <strong>{{ model.model }} · {{ model.status }}</strong>
              <p>{{ model.checksLabel }}</p>
              <p>{{ model.durationLabel }}</p>
              <p v-if="model.slowestCheck" class="cs-smoke-slowest-check">{{ model.slowestCheck }}</p>
              <p v-if="model.failedChecks" class="cs-smoke-failed-checks">{{ model.failedChecks }}</p>
              <p v-if="model.error" class="cs-smoke-error">{{ model.error }}</p>
            </div>
          </article>
        </div>
      </dl>
    </article>

    <article class="cs-surface">
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
  durationLabel: string;
  slowestCheck: string;
  failedChecks: string;
  error: string | null;
}

export interface CodexStackSmokeMatrixCard {
  requiredModelsLabel: string;
  requiredModels: string;
  attachEligibleLabel: string;
  attachEligible: string;
  statusLabel: string;
  statusValue: string;
  checkedAtLabel: string;
  checkedAt: string;
  durationLabel: string;
  duration: string;
  freshnessLabel: string;
  freshness: string;
  freshnessTone: CodexStackTone;
  models: CodexStackSmokeModelCard[];
}

export interface CodexStackNetworkPolicyCard {
  kicker: string;
  title: string;
  modeValue: string;
  modeHelp: string;
  loopbackLabel: string;
  loopbackValue: string;
  loopbackHelp: string;
  upstreamLabel: string;
  upstreamValue: string;
  tone: CodexStackTone;
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
  networkPolicy: CodexStackNetworkPolicyCard | null;
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

.cs-network-policy-strip {
  display: grid;
  gap: 12px;
  padding: 14px 0 2px;
  border-top: 1px solid var(--line);
}

.cs-network-policy-strip.tone-sage {
  --network-accent: #2f8b57;
}

.cs-network-policy-strip.tone-accent {
  --network-accent: #3264b5;
}

.cs-network-policy-strip.tone-danger {
  --network-accent: #c0392b;
}

.cs-network-policy-strip.tone-neutral {
  --network-accent: #64748b;
}

.cs-network-policy-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-network-policy-head div {
  display: grid;
  gap: 3px;
}

.cs-network-policy-head span,
.cs-network-policy-grid span {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0;
}

.cs-network-policy-head strong:last-child {
  color: var(--network-accent);
  white-space: nowrap;
}

.cs-network-policy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cs-network-policy-grid div {
  display: grid;
  gap: 4px;
}

.cs-network-policy-grid p {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.86rem;
  line-height: 1.45;
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

.cs-smoke-matrix-head.tone-sage strong {
  color: #2f8b57;
}

.cs-smoke-matrix-head.tone-accent strong {
  color: #3264b5;
}

.cs-smoke-matrix-head.tone-danger strong {
  color: var(--danger);
}

.cs-smoke-model-row {
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.cs-smoke-error {
  color: var(--danger) !important;
  word-break: break-word;
}

.cs-smoke-failed-checks {
  color: var(--warning) !important;
}

.cs-smoke-slowest-check {
  color: var(--text-soft) !important;
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

  .cs-network-policy-grid {
    grid-template-columns: 1fr;
  }

  .cs-network-policy-head {
    flex-direction: column;
  }
}
</style>
