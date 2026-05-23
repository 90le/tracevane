<template>
  <div class="cs-dashboard-insights">
    <section class="cs-dashboard-runtime" aria-labelledby="cs-dashboard-runtime-title">
      <div class="cs-dashboard-section-head">
        <div>
          <p class="cs-section-kicker">{{ labels.runtimeKicker }}</p>
          <h4 id="cs-dashboard-runtime-title">{{ labels.runtimeTitle }}</h4>
        </div>
      </div>
      <dl class="cs-runtime-ledger">
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
    </section>

    <section class="cs-dashboard-components" aria-labelledby="cs-dashboard-components-title">
      <div class="cs-dashboard-section-head">
        <div>
          <p class="cs-section-kicker">{{ labels.componentsKicker }}</p>
          <h4 id="cs-dashboard-components-title">{{ labels.componentsTitle }}</h4>
        </div>
      </div>
      <div class="cs-component-list">
        <article v-for="component in components" :key="component.id" class="cs-component-row">
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
    </section>
  </div>
</template>

<script setup lang="ts">
import "./codex-stack-dashboard.css";
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
