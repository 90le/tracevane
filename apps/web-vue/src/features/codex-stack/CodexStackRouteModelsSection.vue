<template>
  <CodexStackSectionStack class="cs-route-models-section">
    <CodexStackSectionIntro
      :kicker="text('模型与上游', 'Models and Upstreams')"
      :title="text('统一模型、端口与上游配置', 'Unified Model, Port, and Upstream Config')"
      :copy="text('这里是所有模型选择器的来源。优先读取本地 Compact /v1/models；不可达时显示配置回退列表。cc-connect Provider 推荐统一指向本地 Compact。', 'This is the source for every model selector. It prefers local Compact /v1/models and falls back to parsed config when unavailable. cc-connect providers should point to local Compact.')"
      :chips="introChips"
    />

    <CodexStackModelCatalogCard
      :models="modelOptions"
      :current-model="summary.models.current"
      :source-help="modelSourceHelp"
      :loading="loading"
      :loading-disabled-help="summaryRefreshDisabledHelp"
      @reload="emit('reload')"
    />

    <CodexStackUpstreamMap
      :default-model="defaultModel"
      :compact-proxy-base-url="compactProxyBaseUrl"
      :provider-name="canonicalProvider.name"
      :provider-base-url="canonicalProvider.baseUrl"
      :provider-model="canonicalProvider.model"
    />

    <CodexStackResponsiveGrid>
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
    </CodexStackResponsiveGrid>
  </CodexStackSectionStack>
</template>

<script setup lang="ts">
import type { CodexStackSummaryPayload } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import CodexStackEnvironmentReferenceCard from "./CodexStackEnvironmentReferenceCard.vue";
import CodexStackModelCatalogCard from "./CodexStackModelCatalogCard.vue";
import CodexStackResponsiveGrid from "./CodexStackResponsiveGrid.vue";
import CodexStackRuntimeConfigCard from "./CodexStackRuntimeConfigCard.vue";
import type {
  CodexStackRuntimeConfigDraft,
  CodexStackRuntimeConfigField,
  CodexStackRuntimeConfigImpactItem,
} from "./CodexStackRuntimeConfigCard.vue";
import CodexStackSectionIntro from "./CodexStackSectionIntro.vue";
import type { CodexStackSectionIntroChip } from "./CodexStackSectionIntro.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";
import CodexStackUpstreamMap from "./CodexStackUpstreamMap.vue";

interface CodexStackCanonicalProvider {
  name: string;
  baseUrl: string;
  model: string;
}

defineProps<{
  summary: CodexStackSummaryPayload;
  introChips: CodexStackSectionIntroChip[];
  modelOptions: string[];
  modelSourceHelp: string;
  loading: boolean;
  summaryRefreshDisabledHelp: string;
  defaultModel: string;
  compactProxyBaseUrl: string;
  canonicalProvider: CodexStackCanonicalProvider;
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
