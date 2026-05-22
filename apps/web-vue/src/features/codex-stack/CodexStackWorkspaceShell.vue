<template>
  <div class="cs-workspace">
    <CodexStackSectionNav
      :sections="sections"
      :active-section="activeSection"
      @select="$emit('select', $event)"
    />

    <div class="cs-content">
      <aside v-if="focusHint" class="cs-workspace-focus" :class="`tone-${focusHint.tone}`">
        <span>{{ focusHint.kicker }}</span>
        <strong>{{ focusHint.title }}</strong>
        <p>{{ focusHint.copy }}</p>
      </aside>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import CodexStackSectionNav from "./CodexStackSectionNav.vue";
import type { CodexStackTone } from "./codex-stack-view-model";
import type { CodexStackSectionId, CodexStackSectionNavItem } from "./CodexStackSectionNav.vue";

export interface CodexStackWorkspaceFocusHint {
  kicker: string;
  title: string;
  copy: string;
  tone: CodexStackTone;
}

defineProps<{
  sections: CodexStackSectionNavItem[];
  activeSection: CodexStackSectionId;
  focusHint?: CodexStackWorkspaceFocusHint | null;
}>();

defineEmits<{
  select: [sectionId: CodexStackSectionId];
}>();
</script>

<style scoped>
.cs-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.cs-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.cs-workspace-focus {
  display: grid;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
}

.cs-workspace-focus span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cs-workspace-focus strong {
  color: var(--text);
  font-size: 0.98rem;
}

.cs-workspace-focus p {
  margin: 0;
  color: var(--text-soft);
  line-height: 1.45;
}

.cs-workspace-focus.tone-sage {
  border-color: color-mix(in srgb, var(--success) 46%, var(--line));
}

.cs-workspace-focus.tone-accent {
  border-color: color-mix(in srgb, var(--acc) 46%, var(--line));
}

.cs-workspace-focus.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 46%, var(--line));
}

</style>
