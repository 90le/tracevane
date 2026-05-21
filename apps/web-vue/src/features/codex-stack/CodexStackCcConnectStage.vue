<template>
  <div class="cs-agent-workbench">
    <CodexStackCcConnectRail
      :panes="panes"
      :active-pane="activePane"
      :projects="projects"
      :selected-project-id="selectedProjectId"
      :busy="busy"
      :busy-disabled-help="busyDisabledHelp"
      @set-active-pane="$emit('set-active-pane', $event)"
      @select-project="$emit('select-project', $event)"
      @add-project="$emit('add-project')"
    />

    <section class="panel-card cs-agent-stage">
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
import CodexStackCcConnectRail from "./CodexStackCcConnectRail.vue";
import type {
  CodexStackCcConnectPaneId,
  CodexStackCcConnectPaneOption,
  CodexStackCcConnectProjectRailItem,
} from "./CodexStackCcConnectRail.vue";

defineProps<{
  panes: CodexStackCcConnectPaneOption[];
  activePane: CodexStackCcConnectPaneId;
  projects: CodexStackCcConnectProjectRailItem[];
  selectedProjectId: string;
  busy: boolean;
  busyDisabledHelp: string;
}>();

defineEmits<{
  "set-active-pane": [paneId: CodexStackCcConnectPaneId];
  "select-project": [projectId: string];
  "add-project": [];
}>();
</script>

<style scoped>
.cs-agent-workbench {
  display: grid;
  grid-template-columns: minmax(240px, 0.34fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.cs-agent-stage {
  min-width: 0;
}

@media (max-width: 960px) {
  .cs-agent-workbench {
    grid-template-columns: 1fr;
  }
}
</style>
