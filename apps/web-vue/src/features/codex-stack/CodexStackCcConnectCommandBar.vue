<template>
  <div class="cs-cc-command-bar">
    <article class="cs-surface cs-config-action-strip cs-agent-savebar">
      <div>
        <p class="cs-section-kicker">cc-connect</p>
        <h4>{{ projectName || text("Agent 工作台", "Agent Workbench") }}</h4>
        <div class="cs-chip-row">
          <span class="cs-info-chip">{{ text("安装", "Installed") }} {{ yesNo(installed) }}</span>
          <span class="cs-info-chip">{{ text("配置", "Configured") }} {{ yesNo(configured) }}</span>
          <span class="cs-info-chip">{{ text("绑定", "Binding") }} {{ yesNo(bindingPresent) }}</span>
          <span class="cs-info-chip">{{ text("收尾", "Finalizer") }} {{ yesNo(finalizerAvailable) }}</span>
          <span class="cs-info-chip">Provider {{ providerCount }}</span>
          <span class="cs-info-chip">{{ text("项目", "Projects") }} {{ projectCount }}</span>
        </div>
      </div>
      <div class="cs-actions">
        <span class="cs-status-pill" :class="hasStructuredChanges ? 'tone-accent' : 'tone-sage'">
          {{ hasStructuredChanges ? text("可视化有修改", "Visual unsaved") : text("可视化已同步", "Visual synced") }}
        </span>
        <span class="cs-status-pill" :class="hasRawChanges ? 'tone-accent' : 'tone-sage'">
          {{ hasRawChanges ? text("TOML 有修改", "TOML unsaved") : text("TOML 已同步", "TOML synced") }}
        </span>
        <button
          type="button"
          class="primary-button"
          :disabled="!canRunMutation || !hasStructuredChanges"
          @click="$emit('save-structured')"
        >
          {{ text("保存可视化配置", "Save Visual Config") }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="!canRunMutation || !hasRawChanges"
          @click="$emit('save-raw')"
        >
          {{ text("保存 TOML", "Save TOML") }}
        </button>
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-cc-connect.css";

const props = defineProps<{
  installed: boolean;
  configured: boolean;
  bindingPresent: boolean;
  finalizerAvailable: boolean;
  projectName: string;
  providerCount: number;
  projectCount: number;
  hasStructuredChanges: boolean;
  hasRawChanges: boolean;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
}>();

defineEmits<{
  "save-structured": [];
  "save-raw": [];
}>();

const { text } = useLocalePreference();

function yesNo(value: boolean): string {
  return value ? text("是", "Yes") : text("否", "No");
}
</script>
