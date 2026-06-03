<template>
  <CodexStackSectionStack class="cs-route-models-section">
    <div class="cs-route-models-console-grid">
      <CodexStackRuntimeConfigCard
        :form="form"
        :model-options="modelOptions"
        :context-tokens-disabled="contextTokensDisabled"
        :context-tokens-disabled-help="contextTokensDisabledHelp"
        :restart-required-units="restartRequiredUnits"
        :impact-items="impactItems"
        :codex-route-active="summary.codexRoute.active"
        :codex-route-current-model="summary.codexRoute.currentModel"
        :codex-route-cpa-target-model="summary.codexRoute.cpaTargetModel"
        :codex-route-official-model="summary.codexRoute.officialModel"
        :codex-auth-mode="summary.secrets.codexAuth.mode"
        :official-auth-backup-ready="summary.secrets.officialChatGptAuthBackup?.restorable === true"
        :can-attach-codex-cpa="canAttachCodexCpa"
        :attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"
        :can-run-mutation="canRunMutation"
        :has-changes="hasChanges"
        :mutation-disabled-help="mutationDisabledHelp"
        @update-field="(field, value) => emit('update-field', field, value)"
        @save="emit('save')"
        @save-and-attach-cpa="emit('save-and-attach-cpa')"
        @save-and-force-cpa="emit('save-and-force-cpa')"
        @save-and-use-official="emit('save-and-use-official')"
      />

      <CodexStackModelCatalogCard
        :models="modelOptions"
        :current-model="summary.models.current"
        :source-help="modelSourceHelp"
        :loading="loading"
        :loading-disabled-help="summaryRefreshDisabledHelp"
      />
    </div>

    <details class="cs-route-advanced-panel">
      <summary>
        <span>{{ text("协议与环境详情", "Protocol and environment details") }}</span>
        <small>{{ text("Gateway / 路径", "Gateway / paths") }}</small>
      </summary>
      <div class="cs-route-advanced-body">
        <CodexStackGatewayRoutePanel
          :summary="summary"
          :default-model="defaultModel"
        />

        <CodexStackEnvironmentReferenceCard
          :home-dir="summary.homeDir"
          :profile-path="summary.profilePath"
          :installer-root="summary.installer.root"
          :installer-kind="summary.installer.kind"
          :auto-setup-script="summary.installer.scripts.autoSetup"
          :health-check-script="summary.installer.scripts.healthCheck"
          :finalizer-script="summary.installer.scripts.ccConnectFinalizer"
          :proxy-key-masked="summary.secrets.cpaProxyKey.masked"
          :codex-auth-status="codexAuthStatus"
          :context-mode="summary.context.mode"
          :context-tokens-display="contextTokensDisplay"
          :cpa-dashboard-enabled="summary.cpaManagement.controlPanelEnabled"
          :cpa-dashboard-url="summary.cpaManagement.dashboardUrl"
          :missing-files="summary.installer.missingFiles"
        />
      </div>
    </details>
  </CodexStackSectionStack>
</template>

<script setup lang="ts">
import type { CodexStackSummaryPayload } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import CodexStackEnvironmentReferenceCard from "./CodexStackEnvironmentReferenceCard.vue";
import CodexStackModelCatalogCard from "./CodexStackModelCatalogCard.vue";
import CodexStackRuntimeConfigCard from "./CodexStackRuntimeConfigCard.vue";
import type {
  CodexStackRuntimeConfigDraft,
  CodexStackRuntimeConfigField,
  CodexStackRuntimeConfigImpactItem,
} from "./CodexStackRuntimeConfigCard.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";
import CodexStackGatewayRoutePanel from "./CodexStackGatewayRoutePanel.vue";

export interface CodexStackRouteModelChip {
  label: string;
  value?: string;
  variant?: "status" | "info";
  tone?: string;
}

defineProps<{
  summary: CodexStackSummaryPayload;
  introChips: CodexStackRouteModelChip[];
  modelOptions: string[];
  modelSourceHelp: string;
  loading: boolean;
  summaryRefreshDisabledHelp: string;
  defaultModel: string;
  form: CodexStackRuntimeConfigDraft;
  contextTokensDisabled: boolean;
  contextTokensDisabledHelp: string;
  restartRequiredUnits: string[];
  impactItems: CodexStackRuntimeConfigImpactItem[];
  canAttachCodexCpa: boolean;
  attachCodexCpaDisabledHelp: string;
  canRunMutation: boolean;
  hasChanges: boolean;
  mutationDisabledHelp: string;
  codexAuthStatus: string;
  contextTokensDisplay: string;
}>();

const emit = defineEmits<{
  reload: [];
  "update-field": [field: CodexStackRuntimeConfigField, value: string | number];
  save: [];
  "save-and-attach-cpa": [];
  "save-and-force-cpa": [];
  "save-and-use-official": [];
}>();

const { text } = useLocalePreference();
</script>
