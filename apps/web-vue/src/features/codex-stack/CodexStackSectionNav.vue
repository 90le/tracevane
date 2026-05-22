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

<style scoped>
.cs-section-tabs {
  position: sticky;
  top: 14px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 88%, #0b1018 12%), color-mix(in srgb, var(--surface) 94%, transparent)),
    var(--surface);
}

.cs-tab-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 14px;
  min-width: 168px;
  padding: 10px 12px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  flex: 1 0 168px;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.cs-tab-button svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.cs-tab-button span {
  font-size: 0.82rem;
  line-height: 1.2;
  text-align: left;
}

.cs-nav-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.cs-nav-label-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.cs-nav-label-row > span:first-child,
.cs-nav-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-nav-copy small {
  color: var(--text-soft);
  font-size: 0.72rem;
}

.cs-nav-recommended,
.cs-nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 0.68rem;
  line-height: 1.15;
  white-space: nowrap;
}

.cs-nav-recommended {
  color: var(--acc);
  border-color: color-mix(in srgb, var(--acc) 42%, var(--line));
  background: color-mix(in srgb, var(--acc) 10%, transparent);
}

.cs-nav-badge {
  color: var(--text-soft);
  min-width: 10px;
}

.cs-nav-badge.tone-sage {
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-nav-badge.tone-accent {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
}

.cs-nav-badge.tone-danger {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
}

.cs-tab-button:hover,
.cs-tab-button-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 40%, var(--line));
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 92%, transparent));
  transform: translateY(-1px);
}

@media (max-width: 960px) {
  .cs-section-tabs {
    position: static;
  }

  .cs-tab-button {
    min-width: 154px;
    flex-basis: 154px;
  }
}
</style>
