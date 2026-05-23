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
import "./codex-stack-workspace.css";

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
