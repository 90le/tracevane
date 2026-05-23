<template>
  <nav class="cs-section-tabs" aria-label="Codex Stack sections">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      class="cs-tab-button"
      :class="{ 'cs-tab-button-active': activeSection === section.id }"
      @click="$emit('select', section.id)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path :d="section.icon" />
      </svg>
      <span class="cs-nav-copy">
        <span class="cs-nav-label-row">
          <span>{{ section.label }}</span>
          <span v-if="section.recommended" class="cs-nav-recommended">{{ section.recommendedLabel }}</span>
        </span>
        <small v-if="section.meta">{{ section.meta }}</small>
      </span>
      <span v-if="section.badge" class="cs-nav-badge" :class="`tone-${section.tone}`">
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
