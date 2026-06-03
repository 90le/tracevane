<template>
  <CodexStackSectionStack class="cs-agent-bridge-section">
    <CodexStackCcConnectCommandBar
      :installed="summary.ccConnect.installed"
      :configured="summary.ccConnect.configured"
      :binding-present="summary.ccConnect.bindingPresent"
      :finalizer-available="summary.ccConnect.finalizerAvailable"
      :project-name="projectName"
      :provider-count="providerCount"
      :project-count="projectCount"
      :has-structured-changes="hasStructuredChanges"
      :has-raw-changes="hasRawChanges"
      :can-run-mutation="canRunMutation"
      :mutation-disabled-help="mutationDisabledHelp"
      @save-structured="emit('save-structured')"
      @save-raw="emit('save-raw')"
    />

    <CodexStackCcConnectStage
      :panes="panes"
      :active-pane="activePane"
      :projects="railProjects"
      :selected-project-id="selectedProjectId"
      :busy="busy"
      :busy-disabled-help="busyDisabledHelp"
      @set-active-pane="(paneId) => emit('set-active-pane', paneId)"
      @select-project="(projectId) => emit('select-project', projectId)"
      @add-project="emit('add-project')"
    >
      <template v-if="activePane === 'projects'">
        <CodexStackCcConnectProjectPanel
          :project="selectedProject"
          :project-summary="selectedProjectSummary"
          :presets="presets"
          :platform-templates="platformTemplates"
          :model-options="modelOptions"
          :loading="loading"
          :busy="busy"
          :busy-disabled-help="busyDisabledHelp"
          @sync-default-model="emit('sync-default-model')"
          @remove-project="(projectId) => emit('remove-project', projectId)"
          @add-preset="(preset) => emit('add-preset', preset)"
          @add-project="emit('add-project')"
          @update-project-field="(projectId, field, value) => emit('update-project-field', projectId, field, value)"
          @update-agent-option="(projectId, field, value) => emit('update-agent-option', projectId, field, value)"
          @add-platform="(type) => emit('add-platform', type)"
          @remove-platform="(platformId) => emit('remove-platform', platformId)"
          @update-platform-type="(platformId, value) => emit('update-platform-type', platformId, value)"
          @update-platform-option="(platformId, optionId, field, value) => emit('update-platform-option', platformId, optionId, field, value)"
          @add-platform-option="(platformId) => emit('add-platform-option', platformId)"
          @remove-platform-option="(platformId, optionId) => emit('remove-platform-option', platformId, optionId)"
        />
      </template>

      <template v-else-if="activePane === 'providers'">
        <CodexStackCcConnectProviderPanel
          :language="language"
          :providers="providers"
          :compact-proxy-base-url="compactProxyBaseUrl"
          :loading="loading"
          :busy="busy"
          :busy-disabled-help="busyDisabledHelp"
          @update-language="(nextLanguage) => emit('update-language', nextLanguage)"
          @update-provider-field="(providerId, field, value) => emit('update-provider-field', providerId, field, value)"
          @ensure-cpa-provider="emit('ensure-cpa-provider')"
          @add-provider="emit('add-provider')"
          @remove-provider="(providerId) => emit('remove-provider', providerId)"
        />
      </template>

      <template v-else-if="activePane === 'setup'">
        <CodexStackCcConnectSetupPanel
          :commands="commands"
          :busy="busy"
          :busy-disabled-help="busyDisabledHelp"
          :can-run-mutation="canRunMutation"
          :mutation-disabled-help="mutationDisabledHelp"
          :can-finalize="summary.ccConnect.canFinalize"
          @copy-setup="(platform) => emit('copy-setup', platform)"
          @finalize="emit('finalize')"
        />
      </template>

      <template v-else>
        <CodexStackCcConnectRawPanel
          :raw-draft="rawDraft"
          :has-raw-changes="hasRawChanges"
          :can-run-mutation="canRunMutation"
          :mutation-disabled-help="mutationDisabledHelp"
          @update-raw="(raw) => emit('update-raw', raw)"
          @save-raw="emit('save-raw')"
        />
      </template>
    </CodexStackCcConnectStage>
  </CodexStackSectionStack>
</template>

<script setup lang="ts">
import type { CodexStackSummaryPayload } from "../../../../../types/codex-stack";
import CodexStackCcConnectCommandBar from "./CodexStackCcConnectCommandBar.vue";
import CodexStackCcConnectProjectPanel from "./CodexStackCcConnectProjectPanel.vue";
import type {
  CodexStackCcConnectAgentOptionField,
  CodexStackCcConnectPlatformOptionField,
  CodexStackCcConnectPlatformTemplate,
  CodexStackCcConnectPlatformTemplateId,
  CodexStackCcConnectProjectDraft,
  CodexStackCcConnectProjectField,
  CodexStackCcConnectProjectPresetCard,
  CodexStackCcConnectProjectPresetId,
} from "./CodexStackCcConnectProjectPanel.vue";
import CodexStackCcConnectProviderPanel from "./CodexStackCcConnectProviderPanel.vue";
import type {
  CodexStackCcConnectProviderDraft,
  CodexStackCcConnectProviderField,
} from "./CodexStackCcConnectProviderPanel.vue";
import CodexStackCcConnectRawPanel from "./CodexStackCcConnectRawPanel.vue";
import type {
  CodexStackCcConnectPaneId,
  CodexStackCcConnectPaneOption,
  CodexStackCcConnectProjectRailItem,
} from "./CodexStackCcConnectRail.vue";
import CodexStackCcConnectSetupPanel from "./CodexStackCcConnectSetupPanel.vue";
import type { CodexStackCcConnectSetupPlatform } from "./CodexStackCcConnectSetupPanel.vue";
import CodexStackCcConnectStage from "./CodexStackCcConnectStage.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";

defineProps<{
  summary: CodexStackSummaryPayload;
  projectName: string;
  providerCount: number;
  projectCount: number;
  hasStructuredChanges: boolean;
  hasRawChanges: boolean;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  panes: CodexStackCcConnectPaneOption[];
  activePane: CodexStackCcConnectPaneId;
  railProjects: CodexStackCcConnectProjectRailItem[];
  selectedProjectId: string;
  busy: boolean;
  busyDisabledHelp: string;
  selectedProject: CodexStackCcConnectProjectDraft | null;
  selectedProjectSummary: string;
  presets: CodexStackCcConnectProjectPresetCard[];
  platformTemplates: CodexStackCcConnectPlatformTemplate[];
  modelOptions: string[];
  loading: boolean;
  language: string;
  providers: CodexStackCcConnectProviderDraft[];
  compactProxyBaseUrl: string;
  commands: string[];
  rawDraft: string;
}>();

const emit = defineEmits<{
  "save-structured": [];
  "save-raw": [];
  "set-active-pane": [paneId: CodexStackCcConnectPaneId];
  "select-project": [projectId: string];
  "add-project": [];
  "sync-default-model": [];
  "remove-project": [projectId: string];
  "add-preset": [preset: CodexStackCcConnectProjectPresetId];
  "update-project-field": [projectId: string, field: CodexStackCcConnectProjectField, value: string];
  "update-agent-option": [projectId: string, field: CodexStackCcConnectAgentOptionField, value: string];
  "add-platform": [type: CodexStackCcConnectPlatformTemplateId];
  "remove-platform": [platformId: string];
  "update-platform-type": [platformId: string, value: string];
  "update-platform-option": [platformId: string, optionId: string, field: CodexStackCcConnectPlatformOptionField, value: string];
  "add-platform-option": [platformId: string];
  "remove-platform-option": [platformId: string, optionId: string];
  "update-language": [language: string];
  "update-provider-field": [providerId: string, field: CodexStackCcConnectProviderField, value: string];
  "ensure-cpa-provider": [];
  "add-provider": [];
  "remove-provider": [providerId: string];
  "copy-setup": [platform: CodexStackCcConnectSetupPlatform];
  finalize: [];
  "update-raw": [raw: string];
}>();
</script>
