<template>
  <aside class="cs-sidebar">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      class="cs-nav-button"
      :class="{ 'cs-nav-button-active': activeSection === section.id }"
      @click="$emit('select', section.id)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path :d="section.icon" />
      </svg>
      <span>{{ section.label }}</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
export type CodexStackSectionId = "dashboard" | "install" | "cc-connect" | "settings" | "logs";

export interface CodexStackSectionNavItem {
  id: CodexStackSectionId;
  label: string;
  icon: string;
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
.cs-sidebar {
  position: sticky;
  top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 88%, #0b1018 12%), color-mix(in srgb, var(--surface) 94%, transparent)),
    var(--surface);
}

.cs-nav-button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 18px;
  padding: 12px 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.cs-nav-button svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.cs-nav-button span {
  font-size: 0.82rem;
  line-height: 1.2;
  text-align: left;
}

.cs-nav-button:hover,
.cs-nav-button-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 40%, var(--line));
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 92%, transparent));
  transform: translateY(-1px);
}

@media (max-width: 960px) {
  .cs-sidebar {
    position: static;
    flex-direction: row;
    overflow: auto;
  }

  .cs-nav-button {
    min-width: 92px;
    justify-content: center;
  }
}
</style>
