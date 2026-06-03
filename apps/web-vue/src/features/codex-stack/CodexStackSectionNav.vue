<template>
  <nav class="cs-stack-task-nav" aria-label="Codex Stack task steps">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      class="cs-stack-task-step"
      :class="{ 'cs-stack-task-step-active': activeSection === section.id }"
      :aria-current="activeSection === section.id ? 'step' : undefined"
      :aria-label="section.meta ? `${section.label}: ${section.meta}` : section.label"
      :title="section.meta ? `${section.label}: ${section.meta}` : section.label"
      :data-tone="section.tone"
      :data-recommended="section.recommended ? 'true' : undefined"
      @click="$emit('select', section.id)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path :d="section.icon" />
      </svg>
      <span class="cs-task-copy">
        <span class="cs-task-label-row">
          <span>{{ section.label }}</span>
          <span v-if="section.recommended" class="cs-task-recommended">{{ section.recommendedLabel }}</span>
        </span>
        <small v-if="section.meta">{{ section.meta }}</small>
      </span>
      <span v-if="section.badge" class="cs-task-badge" :class="`tone-${section.tone}`">
        {{ section.badge }}
      </span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import type { CodexStackTone } from "./codex-stack-view-model";
import "./codex-stack-workspace.css";

export type CodexStackSectionId = "dashboard" | "install" | "cc-connect" | "settings" | "logs";

export interface CodexStackSectionNavItem {
  id: CodexStackSectionId;
  label: string;
  icon: string;
  meta: string;
  badge: string;
  tone: CodexStackTone;
  recommended: boolean;
  recommendedLabel: string;
}

defineProps<{
  sections: CodexStackSectionNavItem[];
  activeSection: CodexStackSectionId;
}>();

defineEmits<{
  select: [sectionId: CodexStackSectionId];
}>();
</script>
