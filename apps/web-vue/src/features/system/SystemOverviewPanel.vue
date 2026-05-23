<template>
  <article class="system-stage-panel system-overview-command-panel">
    <section class="system-section">
      <div class="system-section-head">
        <div>
          <h3>{{ healthTitle }}</h3>
          <p>{{ healthCopy }}</p>
        </div>
      </div>

      <div class="system-overview-grid">
        <div v-for="card in healthCards" :key="`${card.group}-${card.label}`" class="system-overview-item">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </div>
      </div>
    </section>

    <section class="system-section">
      <div class="system-section-head">
        <div>
          <h3>{{ runtimeTitle }}</h3>
          <p>{{ runtimeCopy }}</p>
        </div>
      </div>

      <div class="system-overview-grid">
        <div v-for="card in runtimeCards" :key="`${card.group}-${card.label}`" class="system-overview-item">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </div>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import type { SystemOverviewCard } from './system-overview-recipe';

defineProps<{
  healthTitle: string;
  healthCopy: string;
  runtimeTitle: string;
  runtimeCopy: string;
  healthCards: SystemOverviewCard[];
  runtimeCards: SystemOverviewCard[];
}>();
</script>

<style scoped>
.system-stage-panel,
.system-section {
  display: grid;
  gap: 16px;
}

.system-overview-command-panel {
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--sky) 8%, transparent), transparent 48%),
    color-mix(in srgb, var(--shell-panel-fill) 82%, transparent);
}

.system-section + .system-section {
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.system-section-head p {
  margin: 6px 0 0 0;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.system-overview-grid {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 48%, transparent);
}

.system-overview-item {
  border: none;
  border-right: 1px solid color-mix(in srgb, var(--line) 74%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--line) 74%, transparent);
  background: transparent;
  border-radius: 0;
  min-width: 128px;
  padding: 12px 14px;
  display: grid;
  gap: 6px;
}

.system-overview-item:nth-child(3n) {
  border-right: none;
}

.system-overview-item span {
  color: var(--text-soft);
  font-size: 12px;
}

.system-overview-item strong {
  color: var(--text);
}

@media (max-width: 880px) {
  .system-overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
