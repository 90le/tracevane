<template>
  <article class="panel-card cs-dashboard-hero-card">
    <div class="cs-hero-copy">
      <p class="cs-section-kicker">{{ text("概览", "Dashboard") }}</p>
      <div class="cs-hero-title-row">
        <h3>{{ statusLabel }}</h3>
        <span class="cs-status-pill" :class="`tone-${statusTone}`">{{ statusLabel }}</span>
      </div>
      <p class="cs-hero-description">
        {{ text("先看当前状态，再按建议执行安装、修复或配置。主界面只保留 CPA、Compact、cc-connect 三个核心服务；旧巡检和后台守护由推荐修复自动处理。", "Start from the current state, then follow suggested install, repair, or config actions. The main view focuses on CPA, Compact, and cc-connect; legacy checks and background watchdog are handled by Recommended Repair.") }}
      </p>
      <div class="cs-chip-row">
        <span class="cs-info-chip">
          {{ text("核心服务", "Core services") }} {{ activeServiceCount }}/{{ serviceCount }}
        </span>
        <span class="cs-info-chip">
          {{ text("当前模型", "Current model") }} {{ currentModel || "--" }}
        </span>
        <span class="cs-info-chip">
          {{ text("Codex 路径", "Codex route") }} {{ codexRouteLabel }}
        </span>
        <span class="cs-info-chip">
          {{ text("Codex 上下文", "Codex context") }} {{ contextTokensDisplay }}
        </span>
        <span class="cs-info-chip">
          {{ text("安装渠道", "Channel") }} {{ channelLabel }}
        </span>
        <span class="cs-info-chip">
          {{ text("检查时间", "Checked") }} {{ checkedAtLabel }}
        </span>
      </div>
    </div>
    <div class="cs-hero-actions">
      <button type="button" class="primary-button" :disabled="busy" @click="$emit('run-check')">
        {{ text("运行健康检查", "Run Health Check") }}
      </button>
      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
        {{ text("自动修复", "Auto Repair") }}
      </button>
      <button type="button" class="secondary-button" :disabled="syncDisabled" @click="$emit('sync')">
        {{ text("重新同步", "Sync Now") }}
      </button>
      <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
      <p v-else-if="syncDisabled && syncDisabledHelp" class="cs-disabled-help">
        {{ syncDisabledHelp }}
      </p>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackTone } from "./codex-stack-view-model";

defineProps<{
  statusLabel: string;
  statusTone: CodexStackTone;
  activeServiceCount: number;
  serviceCount: number;
  currentModel: string;
  codexRouteLabel: string;
  contextTokensDisplay: string;
  channelLabel: string;
  checkedAtLabel: string;
  busy: boolean;
  busyDisabledHelp: string;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  syncDisabled: boolean;
  syncDisabledHelp: string;
}>();

defineEmits<{
  "run-check": [];
  repair: [];
  sync: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-dashboard-hero-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 18%, transparent), transparent 36%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, #071018 8%), var(--surface));
}

.cs-hero-copy {
  min-width: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-hero-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cs-hero-title-row h3 {
  margin: 0;
  font-size: clamp(1.35rem, 2vw, 1.8rem);
}

.cs-hero-description {
  color: var(--text-soft);
}

.cs-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
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
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-status-pill.tone-accent {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
}

.cs-status-pill.tone-danger {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
}

.cs-status-pill.tone-neutral {
  color: #263241;
  border-color: #c5ced8;
  background: #eef2f6;
}

.cs-hero-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .cs-dashboard-hero-card {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
