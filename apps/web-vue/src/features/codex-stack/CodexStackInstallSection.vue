<template>
  <CodexStackSectionStack>
    <CodexStackInstallPlanCard
      :highlights="highlights"
      :can-run-mutation="canRunMutation"
      :mutation-disabled-help="mutationDisabledHelp"
      :recommended-title="recommendedTitle"
      :recommended-copy="recommendedCopy"
      :recommended-button="recommendedButton"
      :recommended-disabled="recommendedDisabled"
      :recommended-disabled-help="recommendedDisabledHelp"
      :recommended-tone="recommendedTone"
      @run-recommended="emit('run-recommended')"
      @install-full="emit('install-full')"
      @install-base="emit('install-base')"
      @reinstall-full="emit('reinstall-full')"
      @repair="emit('repair')"
    />

    <CodexStackInstallShell>
      <CodexStackRepairBoard
        :can-run-mutation="canRunMutation"
        :mutation-disabled-help="mutationDisabledHelp"
        :can-attach-codex-cpa="canAttachCodexCpa"
        :attach-codex-cpa-help="attachCodexCpaHelp"
        :attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"
        :can-attach-codex-studio="canAttachCodexStudio"
        :attach-codex-studio-disabled-help="attachCodexStudioDisabledHelp"
        :attach-preflight-items="attachPreflightItems"
        :studio-gateway-preflight-items="studioGatewayPreflightItems"
        @repair-recommended="emit('repair-recommended')"
        @repair-conflicts="emit('repair-conflicts')"
        @repair-config-only="emit('repair-config-only')"
        @pause-stack="emit('pause-stack')"
        @resume-stack="emit('resume-stack')"
        @run-smoke-matrix="emit('run-smoke-matrix')"
        @attach-codex-cpa="emit('attach-codex-cpa')"
        @attach-codex-studio="emit('attach-codex-studio')"
        @preview-model-gateway-daemon-service="emit('preview-model-gateway-daemon-service')"
        @status-model-gateway-daemon-service="emit('status-model-gateway-daemon-service')"
        @ensure-model-gateway-daemon="emit('ensure-model-gateway-daemon')"
        @restore-official-chatgpt="emit('restore-official-chatgpt')"
      />

      <details class="cs-install-options-panel">
        <summary>
          <span>{{ text("安装参数和高级安装策略", "Install Parameters and Advanced Strategy") }}</span>
          <small>{{ text("模型 / 端口 / 上游 / 重装", "Model / ports / upstream / reinstall") }}</small>
        </summary>
        <div class="cs-install-options-body">
          <CodexStackInstallConfigPanel
            :form="form"
            :model-options="modelOptions"
            :model-source-label="modelSourceLabel"
            :context-tokens-disabled="contextTokensDisabled"
            :context-tokens-disabled-help="contextTokensDisabledHelp"
            @update-field="(field, value) => emit('update-field', field, value)"
          />

          <CodexStackInstallStrategyPanel
            :components="componentStrategies"
            :can-run-mutation="canRunMutation"
            :mutation-disabled-help="mutationDisabledHelp"
            @set-component-mode="(componentId, mode) => emit('set-component-mode', componentId, mode)"
            @install-full="emit('install-full')"
            @install-base="emit('install-base')"
            @reinstall-full="emit('reinstall-full')"
            @repair="emit('repair')"
          />
        </div>
      </details>
    </CodexStackInstallShell>
  </CodexStackSectionStack>
</template>

<script setup lang="ts">
import type { CodexStackComponentId } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import CodexStackInstallConfigPanel from "./CodexStackInstallConfigPanel.vue";
import type {
  CodexStackInstallConfigDraft,
  CodexStackInstallConfigField,
} from "./CodexStackInstallConfigPanel.vue";
import CodexStackInstallPlanCard from "./CodexStackInstallPlanCard.vue";
import CodexStackInstallShell from "./CodexStackInstallShell.vue";
import CodexStackInstallStrategyPanel from "./CodexStackInstallStrategyPanel.vue";
import type {
  CodexStackComponentInstallMode,
  CodexStackInstallComponentStrategy,
} from "./CodexStackInstallStrategyPanel.vue";
import CodexStackRepairBoard from "./CodexStackRepairBoard.vue";
import type { CodexStackAttachPreflightItem } from "./CodexStackRepairBoard.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";
import type { CodexStackTone } from "./codex-stack-view-model";

defineProps<{
  highlights: string[];
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  recommendedTitle: string;
  recommendedCopy: string;
  recommendedButton: string;
  recommendedDisabled: boolean;
  recommendedDisabledHelp: string;
  recommendedTone: CodexStackTone;
  canAttachCodexCpa: boolean;
  attachCodexCpaHelp: string;
  attachCodexCpaDisabledHelp: string;
  canAttachCodexStudio: boolean;
  attachCodexStudioDisabledHelp: string;
  attachPreflightItems: CodexStackAttachPreflightItem[];
  studioGatewayPreflightItems: CodexStackAttachPreflightItem[];
  form: CodexStackInstallConfigDraft;
  modelOptions: string[];
  modelSourceLabel: string;
  contextTokensDisabled: boolean;
  contextTokensDisabledHelp: string;
  componentStrategies: CodexStackInstallComponentStrategy[];
}>();

const emit = defineEmits<{
  "run-recommended": [];
  "install-full": [];
  "install-base": [];
  "reinstall-full": [];
  repair: [];
  "repair-recommended": [];
  "repair-conflicts": [];
  "repair-config-only": [];
  "pause-stack": [];
  "resume-stack": [];
  "run-smoke-matrix": [];
  "attach-codex-cpa": [];
  "attach-codex-studio": [];
  "preview-model-gateway-daemon-service": [];
  "status-model-gateway-daemon-service": [];
  "ensure-model-gateway-daemon": [];
  "restore-official-chatgpt": [];
  "update-field": [field: CodexStackInstallConfigField, value: string | number | boolean];
  "set-component-mode": [componentId: CodexStackComponentId, mode: CodexStackComponentInstallMode];
}>();

const { text } = useLocalePreference();
</script>
