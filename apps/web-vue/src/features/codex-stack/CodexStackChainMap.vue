<template>
  <article class="cs-surface cs-chain-map">
    <div class="cs-chain-head">
      <div>
        <p class="cs-section-kicker">{{ labels.kicker }}</p>
        <h4>{{ labels.title }}</h4>
        <p>{{ labels.copy }}</p>
      </div>
      <span class="cs-status-pill" :class="`tone-${overallTone}`">
        {{ labels.status }}
      </span>
    </div>

    <div class="cs-chain-line" aria-label="Codex Stack request chain">
      <div v-for="(node, index) in nodes" :key="node.id" class="cs-chain-node-wrap">
        <div class="cs-chain-node" :class="`tone-${node.tone}`">
          <span>{{ node.label }}</span>
          <strong>{{ node.value }}</strong>
          <small>{{ node.meta }}</small>
        </div>
        <span v-if="index < nodes.length - 1" class="cs-chain-arrow" aria-hidden="true">→</span>
      </div>
    </div>

    <div class="cs-chain-gates">
      <div v-for="gate in gates" :key="gate.id" class="cs-chain-gate" :class="`tone-${gate.tone}`">
        <span>{{ gate.label }}</span>
        <strong>{{ gate.value }}</strong>
        <small>{{ gate.help }}</small>
      </div>
    </div>

    <div v-if="warnings.length" class="cs-chain-warning-strip">
      <div class="cs-chain-warning-head">
        <span>{{ labels.warningKicker }}</span>
        <strong>{{ labels.warningTitle }}</strong>
      </div>
      <ul>
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { CodexStackTone } from "./codex-stack-view-model";
import "./codex-stack-dashboard.css";

export interface CodexStackChainNode {
  id: string;
  label: string;
  value: string;
  meta: string;
  tone: CodexStackTone;
}

export interface CodexStackChainGate {
  id: string;
  label: string;
  value: string;
  help: string;
  tone: CodexStackTone;
}

export interface CodexStackChainMapLabels {
  kicker: string;
  title: string;
  copy: string;
  status: string;
  warningKicker: string;
  warningTitle: string;
}

defineProps<{
  labels: CodexStackChainMapLabels;
  overallTone: CodexStackTone;
  nodes: CodexStackChainNode[];
  gates: CodexStackChainGate[];
  warnings: string[];
}>();
</script>
