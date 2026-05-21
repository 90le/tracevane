<template>
  <div class="cs-cc-command-bar">
    <article class="panel-card cs-section-intro">
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

    <article class="panel-card cs-config-action-strip cs-agent-savebar">
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
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

defineProps<{
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

<style scoped>
.cs-cc-command-bar {
  display: contents;
}

.cs-section-intro,
.cs-config-action-strip {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.cs-section-intro h3,
.cs-config-action-strip h4 {
  margin: 0;
}

.cs-section-intro h3 {
  font-size: clamp(1.35rem, 2vw, 1.8rem);
}

.cs-section-copy,
.cs-config-action-strip p:not(.cs-section-kicker) {
  margin: 6px 0 0;
  color: var(--text-soft);
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-chip-row,
.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-chip-row {
  margin-top: 14px;
}

.cs-info-chip,
.cs-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 0.85rem;
}

.cs-status-pill {
  font-weight: 600;
  color: var(--text);
}

.cs-status-pill.tone-sage {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 34%, var(--line));
  background: color-mix(in srgb, var(--success) 10%, transparent);
}

.cs-status-pill.tone-accent {
  color: var(--acc);
  border-color: color-mix(in srgb, var(--acc) 34%, var(--line));
  background: color-mix(in srgb, var(--acc) 10%, transparent);
}

.cs-config-action-strip {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--success) 12%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 92%, #101820 8%), var(--surface));
}

.cs-agent-savebar {
  position: sticky;
  top: 14px;
  z-index: 2;
}

@media (max-width: 960px) {
  .cs-agent-savebar {
    position: static;
  }

  .cs-section-intro,
  .cs-config-action-strip {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
