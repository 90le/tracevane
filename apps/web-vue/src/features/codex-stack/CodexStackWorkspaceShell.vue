<template>
  <section class="studio-workbench studio-workbench--guided cs-workbench-frame">
    <div class="cs-workspace">
      <aside class="cs-stack-task-rail studio-workbench-task-rail" aria-label="Codex Stack task rail">
        <CodexStackSectionNav
          :sections="sections"
          :active-section="activeSection"
          @select="$emit('select', $event)"
        />
      </aside>

      <main class="cs-content" aria-live="polite">
        <slot name="context" />
        <aside v-if="draftHint" class="cs-workspace-draft-guard" :class="`tone-${draftHint.tone}`">
          <span>{{ draftHint.kicker }}</span>
          <strong>{{ draftHint.title }}</strong>
          <p>{{ draftHint.copy }}</p>
        </aside>
        <aside v-if="focusHint" class="cs-workspace-focus" :class="`tone-${focusHint.tone}`">
          <span>{{ focusHint.kicker }}</span>
          <strong>{{ focusHint.title }}</strong>
          <p>{{ focusHint.copy }}</p>
        </aside>
        <slot />
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import CodexStackSectionNav from "./CodexStackSectionNav.vue";
import type { CodexStackTone } from "./codex-stack-view-model";
import type { CodexStackSectionId, CodexStackSectionNavItem } from "./CodexStackSectionNav.vue";
import "./codex-stack-shared-primitives.css";
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
  draftHint?: CodexStackWorkspaceFocusHint | null;
}>();

defineEmits<{
  select: [sectionId: CodexStackSectionId];
}>();
</script>
