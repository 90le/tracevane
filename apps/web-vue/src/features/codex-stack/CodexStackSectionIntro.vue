<template>
  <section class="cs-section-intro">
    <div>
      <p class="cs-section-kicker">{{ kicker }}</p>
      <h3>{{ title }}</h3>
      <p class="cs-section-copy">{{ copy }}</p>
    </div>
    <div v-if="chips.length" class="cs-chip-row">
      <span
        v-for="chip in chips"
        :key="`${chip.variant}-${chip.label}`"
        :class="chip.variant === 'status' ? ['cs-status-pill', `tone-${chip.tone || 'neutral'}`] : 'cs-info-chip'"
      >
        {{ chip.label }}
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CodexStackTone } from "./codex-stack-view-model";

export interface CodexStackSectionIntroChip {
  label: string;
  variant: "info" | "status";
  tone?: CodexStackTone;
}

withDefaults(defineProps<{
  kicker: string;
  title: string;
  copy: string;
  chips?: CodexStackSectionIntroChip[];
}>(), {
  chips: () => [],
});
</script>

<style scoped>
.cs-section-intro {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 74%, transparent);
  padding: 2px 0 16px;
  background: transparent;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-section-intro h3 {
  margin: 0;
  font-size: clamp(1.35rem, 2vw, 1.8rem);
}

.cs-section-copy {
  color: var(--text-soft);
}

.cs-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
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

.cs-status-pill.tone-sage {
  color: color-mix(in srgb, var(--success) 72%, var(--text));
  border-color: color-mix(in srgb, var(--success) 46%, var(--line));
  background: color-mix(in srgb, var(--success) 14%, var(--surface));
}

.cs-status-pill.tone-accent {
  color: color-mix(in srgb, var(--acc) 72%, var(--text));
  border-color: color-mix(in srgb, var(--acc) 46%, var(--line));
  background: color-mix(in srgb, var(--acc) 14%, var(--surface));
}

.cs-status-pill.tone-danger {
  color: color-mix(in srgb, var(--danger) 72%, var(--text));
  border-color: color-mix(in srgb, var(--danger) 46%, var(--line));
  background: color-mix(in srgb, var(--danger) 14%, var(--surface));
}

.cs-status-pill.tone-neutral {
  color: var(--text-soft);
  border-color: color-mix(in srgb, var(--line) 86%, transparent);
  background: color-mix(in srgb, var(--surface) 62%, transparent);
}

@media (max-width: 960px) {
  .cs-section-intro {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
