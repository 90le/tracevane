<template>
  <div class="cs-workspace">
    <CodexStackSectionNav
      :sections="sections"
      :active-section="activeSection"
      @select="$emit('select', $event)"
    />

    <div class="cs-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import CodexStackSectionNav from "./CodexStackSectionNav.vue";
import type { CodexStackSectionId, CodexStackSectionNavItem } from "./CodexStackSectionNav.vue";

defineProps<{
  sections: CodexStackSectionNavItem[];
  activeSection: CodexStackSectionId;
}>();

defineEmits<{
  select: [sectionId: CodexStackSectionId];
}>();
</script>

<style scoped>
.cs-workspace {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.cs-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

@media (max-width: 960px) {
  .cs-workspace {
    grid-template-columns: 1fr;
  }
}
</style>
