<template>
  <aside class="cs-agent-rail">
    <div class="cs-agent-pane-switch">
      <button
        v-for="pane in panes"
        :key="pane.id"
        type="button"
        class="cs-agent-pane-button"
        :class="{ 'cs-agent-pane-button-active': activePane === pane.id }"
        @click="$emit('set-active-pane', pane.id)"
      >
        {{ pane.label }}
      </button>
    </div>
    <div class="cs-agent-project-rail">
      <div class="cs-agent-rail-head">
        <strong>{{ text("项目列表", "Projects") }}</strong>
        <button type="button" class="text-button" :disabled="busy" @click="$emit('add-project')">
          {{ text("新增", "Add") }}
        </button>
      </div>
      <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
      <button
        v-for="project in projects"
        :key="project.id"
        type="button"
        class="cs-agent-project-pill"
        :class="{ 'cs-agent-project-pill-active': selectedProjectId === project.id }"
        @click="$emit('select-project', project.id)"
      >
        <strong>{{ project.name || text("未命名项目", "Unnamed Project") }}</strong>
        <span>{{ project.model || "--" }} · {{ project.platformCount }} {{ text("渠道", "channels") }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-cc-connect.css";

export type CodexStackCcConnectPaneId = "projects" | "providers" | "setup" | "raw";

export interface CodexStackCcConnectPaneOption {
  id: CodexStackCcConnectPaneId;
  label: string;
}

export interface CodexStackCcConnectProjectRailItem {
  id: string;
  name: string;
  model: string;
  platformCount: number;
}

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

const { text } = useLocalePreference();
</script>
