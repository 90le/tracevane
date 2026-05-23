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
import "./codex-stack-workspace.css";

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
