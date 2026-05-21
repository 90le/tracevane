<template>
  <aside class="panel-card cs-agent-rail">
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

<style scoped>
.cs-agent-rail {
  position: sticky;
  top: 92px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cs-agent-pane-switch {
  display: grid;
  gap: 8px;
}

.cs-agent-pane-button,
.cs-agent-project-pill {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--text-soft);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.cs-agent-pane-button {
  border-radius: 16px;
  padding: 12px 14px;
  text-align: left;
  font-weight: 650;
}

.cs-agent-pane-button-active,
.cs-agent-project-pill-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 96%, transparent)),
    var(--surface);
}

.cs-agent-pane-button:hover,
.cs-agent-project-pill:hover {
  transform: translateY(-1px);
}

.cs-agent-project-rail {
  min-width: 0;
}

.cs-agent-rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.cs-agent-project-pill {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border-radius: 16px;
  padding: 12px;
  margin-top: 8px;
  text-align: left;
}

.cs-agent-project-pill span {
  color: var(--muted);
  font-size: 0.82rem;
}

.text-button {
  border: none;
  background: transparent;
  color: var(--acc);
  cursor: pointer;
  padding: 4px 0;
  font: inherit;
  font-size: 0.86rem;
}

.text-button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.cs-disabled-help {
  margin: 0 0 8px;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .cs-agent-rail {
    position: static;
  }

  .cs-agent-pane-switch {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
