<template>
  <CodexStackSectionStack>
    <CodexStackSectionIntro
      :kicker="text('安装', 'Install')"
      :title="text('一键安装与修复', 'One-click Install and Repair')"
      :copy="text('第一次使用先走新手入口；日常异常只按“推荐修复 → 只验证 → 验证并切换”三步。安装参数和高级维护默认收起，只有需要改模型、端口或处理冲突时再打开。', 'First-time users start with the beginner entry. Daily recovery follows Recommended Repair, Verify Only, then Smoke & Attach. Install parameters and advanced maintenance stay collapsed until a model, port, or conflict needs manual handling.')"
    />

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

    <CodexStackInstallShell :busy="shellBusy">
      <CodexStackRepairBoard
        :can-run-mutation="canRunMutation"
        :mutation-disabled-help="mutationDisabledHelp"
        :can-attach-codex-cpa="canAttachCodexCpa"
        :attach-codex-cpa-help="attachCodexCpaHelp"
        :attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"
        :attach-preflight-items="attachPreflightItems"
        @repair-recommended="emit('repair-recommended')"
        @repair-conflicts="emit('repair-conflicts')"
        @repair-config-only="emit('repair-config-only')"
        @pause-stack="emit('pause-stack')"
        @resume-stack="emit('resume-stack')"
        @run-smoke-matrix="emit('run-smoke-matrix')"
        @attach-codex-cpa="emit('attach-codex-cpa')"
        @restore-official-chatgpt="emit('restore-official-chatgpt')"
      />

      <details class="cs-install-options-panel">
        <summary>
          <span>{{ text("安装参数和高级安装策略", "Install Parameters and Advanced Strategy") }}</span>
          <small>{{ text("一般不用改；需要换模型、端口、上游或强制重装时再打开。", "Usually leave this closed; open only for model, port, upstream, or reinstall changes.") }}</small>
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
import CodexStackSectionIntro from "./CodexStackSectionIntro.vue";
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
  shellBusy: boolean;
  canAttachCodexCpa: boolean;
  attachCodexCpaHelp: string;
  attachCodexCpaDisabledHelp: string;
  attachPreflightItems: CodexStackAttachPreflightItem[];
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
  "restore-official-chatgpt": [];
  "update-field": [field: CodexStackInstallConfigField, value: string | number | boolean];
  "set-component-mode": [componentId: CodexStackComponentId, mode: CodexStackComponentInstallMode];
}>();

const { text } = useLocalePreference();
</script>
