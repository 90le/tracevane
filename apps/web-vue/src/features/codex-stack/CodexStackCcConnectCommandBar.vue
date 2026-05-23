<template>
  <div class="cs-cc-command-bar">
    <article class="cs-surface cs-section-intro">
      <div>
        <p class="cs-section-kicker">cc-connect</p>
        <h3>{{ text("Agent 工作台", "Agent Workbench") }}</h3>
        <p class="cs-section-copy">
          {{ text("项目、Provider、平台绑定和原始 TOML 分区管理。先选项目，再编辑 Agent 参数和渠道，避免多 Agent、多渠道配置挤在同一张表里。", "Projects, providers, platform binding, and raw TOML are separated. Pick a project first, then edit agent options and channels without crowding every multi-agent field into one table.") }}
        </p>
      </div>
      <div class="cs-chip-row">
        <span class="cs-info-chip">{{ text("已安装", "Installed") }} {{ yesNo(installed) }}</span>
        <span class="cs-info-chip">{{ text("已配置", "Configured") }} {{ yesNo(configured) }}</span>
        <span class="cs-info-chip">{{ text("已绑定", "Binding") }} {{ yesNo(bindingPresent) }}</span>
        <span class="cs-info-chip">{{ text("收尾脚本", "Finalizer") }} {{ yesNo(finalizerAvailable) }}</span>
        <span class="cs-info-chip">{{ text("项目", "Project") }} {{ projectName }}</span>
        <span class="cs-info-chip">Provider {{ providerCount }}</span>
        <span class="cs-info-chip">{{ text("项目数", "Projects") }} {{ projectCount }}</span>
      </div>
    </article>

    <article class="cs-surface cs-config-action-strip cs-agent-savebar">
      <div>
        <p class="cs-section-kicker">{{ text("保存与应用", "Save and Apply") }}</p>
        <h4>{{ text("配置保存入口固定在顶部", "Config Save Actions Stay Pinned") }}</h4>
        <p>
          {{ text("可视化配置负责 Provider、项目和平台；原始 TOML 负责高级字段。保存后如服务运行会自动重启。", "Visual config owns providers, projects, and platforms; raw TOML owns advanced fields. Saving restarts the service when it is running.") }}
        </p>
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
        <p v-else-if="saveDisabledHelp" class="cs-disabled-help">
          {{ saveDisabledHelp }}
        </p>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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

const saveDisabledHelp = computed(() => {
  if (!props.hasStructuredChanges && !props.hasRawChanges) {
    return text("可视化配置和 TOML 均已同步；修改后才能保存。", "Visual config and TOML are synced; edit them before saving.");
  }
  if (!props.hasStructuredChanges) {
    return text("可视化配置已同步；修改项目、Provider 或平台后才能保存。", "Visual config is synced; edit projects, providers, or platforms before saving.");
  }
  if (!props.hasRawChanges) {
    return text("TOML 已同步；修改原始配置后才能保存。", "TOML is synced; edit the raw config before saving.");
  }
  return "";
});

function yesNo(value: boolean): string {
  return value ? text("是", "Yes") : text("否", "No");
}
</script>
