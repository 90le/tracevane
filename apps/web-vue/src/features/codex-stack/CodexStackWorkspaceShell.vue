<template>
  <div class="studio-workbench studio-workbench--guided">
    <div class="cs-workspace">
      <aside class="cs-stack-task-rail studio-workbench-task-rail" aria-label="Codex Stack task rail">
        <CodexStackSectionNav
          :sections="sections"
          :active-section="activeSection"
          @select="$emit('select', $event)"
        />
      </aside>

      <div class="cs-content">
        <aside v-if="focusHint" class="cs-workspace-focus" :class="`tone-${focusHint.tone}`">
          <span>{{ focusHint.kicker }}</span>
          <strong>{{ focusHint.title }}</strong>
          <p>{{ focusHint.copy }}</p>
        </aside>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CodexStackSectionNav from "./CodexStackSectionNav.vue";
import type { CodexStackTone } from "./codex-stack-view-model";
import type { CodexStackSectionId, CodexStackSectionNavItem } from "./CodexStackSectionNav.vue";
import "./codex-stack-workspace.css";
import "../../shared/styles/studio-workbench.css";

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
