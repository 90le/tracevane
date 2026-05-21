<template>
  <article class="panel-card cs-chain-map">
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
  </article>
</template>

<script setup lang="ts">
import type { CodexStackTone } from "./codex-stack-view-model";

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
}

defineProps<{
  labels: CodexStackChainMapLabels;
  overallTone: CodexStackTone;
  nodes: CodexStackChainNode[];
  gates: CodexStackChainGate[];
}>();
</script>

<style scoped>
.cs-chain-map {
  display: grid;
  gap: 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 96%, #0f1c1f 4%), var(--surface)),
    var(--surface);
}

.cs-chain-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.cs-chain-head h4 {
  margin: 0;
}

.cs-chain-head p:not(.cs-section-kicker) {
  margin: 6px 0 0;
  color: var(--text-soft);
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-chain-line {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.cs-chain-node-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cs-chain-node {
  min-height: 118px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.cs-chain-node span,
.cs-chain-gate span {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
}

.cs-chain-node strong,
.cs-chain-gate strong {
  color: var(--text);
  word-break: break-word;
}

.cs-chain-node small,
.cs-chain-gate small {
  color: var(--text-soft);
  line-height: 1.4;
}

.cs-chain-arrow {
  color: var(--muted);
  font-weight: 700;
}

.cs-chain-gates {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.cs-chain-gate {
  display: grid;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 12px;
  background: color-mix(in srgb, var(--code-bg) 28%, transparent);
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
  flex: 0 0 auto;
}

.tone-sage {
  border-color: color-mix(in srgb, var(--success) 50%, var(--line));
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
}

.tone-accent {
  border-color: color-mix(in srgb, var(--acc) 50%, var(--line));
  background: color-mix(in srgb, var(--acc) 10%, var(--surface));
}

.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 48%, var(--line));
  background: color-mix(in srgb, var(--danger) 9%, var(--surface));
}

.tone-neutral {
  border-color: var(--line);
}

@media (max-width: 1100px) {
  .cs-chain-line,
  .cs-chain-gates {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cs-chain-node-wrap:nth-child(2n) {
    grid-template-columns: minmax(0, 1fr);
  }

  .cs-chain-node-wrap:nth-child(2n) .cs-chain-arrow {
    display: none;
  }
}

@media (max-width: 720px) {
  .cs-chain-head {
    flex-direction: column;
  }

  .cs-chain-line,
  .cs-chain-gates,
  .cs-chain-node-wrap {
    grid-template-columns: 1fr;
  }

  .cs-chain-arrow {
    display: none;
  }
}
</style>
