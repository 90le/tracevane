<template>
  <div class="cs-install-strategy-panel">
    <article class="panel-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("步骤 3", "Step 3") }}</p>
          <h4>{{ text("组件策略", "Component Strategy") }}</h4>
        </div>
      </div>
      <p class="cs-field-hint">
        {{ text("每个组件都可以保持默认、跳过，或强制重装。", "Each component can stay default, be skipped, or be force reinstalled.") }}
      </p>
      <div class="cs-component-mode-list">
        <article v-for="component in components" :key="component.id" class="cs-component-mode-card">
          <div>
            <strong>{{ component.label }}</strong>
            <p>{{ component.modeLabel }}</p>
          </div>
          <div class="cs-segmented">
            <button
              type="button"
              class="cs-segmented-button"
              :class="{ 'cs-segmented-button-active': component.mode === 'default' }"
              @click="$emit('set-component-mode', component.id, 'default')"
            >
              {{ text("默认", "Default") }}
            </button>
            <button
              type="button"
              class="cs-segmented-button"
              :class="{ 'cs-segmented-button-active': component.mode === 'skip' }"
              @click="$emit('set-component-mode', component.id, 'skip')"
            >
              {{ text("跳过", "Skip") }}
            </button>
            <button
              type="button"
              class="cs-segmented-button"
              :class="{ 'cs-segmented-button-active': component.mode === 'force' }"
              @click="$emit('set-component-mode', component.id, 'force')"
            >
              {{ text("强制", "Force") }}
            </button>
          </div>
        </article>
      </div>
    </article>

    <article class="panel-card cs-install-cta-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("步骤 4", "Step 4") }}</p>
          <h4>{{ text("执行安装", "Run Install") }}</h4>
        </div>
      </div>
      <p class="cs-field-hint">
        {{ text("完整安装会同时部署 cc-connect；基础安装只保留 Codex / CPA / Compact / watchdog。", "Full install includes cc-connect; base install keeps Codex / CPA / Compact / watchdog only.") }}
      </p>
      <div class="cs-install-cta-row">
        <button type="button" class="primary-button cs-big-button" :disabled="!canRunMutation" @click="$emit('install-full')">
          {{ text("一键安装全部组件", "Install Full Stack") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-base')">
          {{ text("仅安装基础组件", "Install Base Only") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
          {{ text("执行推荐修复", "Run Recommended Repair") }}
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { CodexStackComponentId } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";

export type CodexStackComponentInstallMode = "default" | "skip" | "force";

export interface CodexStackInstallComponentStrategy {
  id: CodexStackComponentId;
  label: string;
  mode: CodexStackComponentInstallMode;
  modeLabel: string;
}

defineProps<{
  components: CodexStackInstallComponentStrategy[];
  canRunMutation: boolean;
}>();

defineEmits<{
  "install-full": [];
  "install-base": [];
  repair: [];
  "set-component-mode": [componentId: CodexStackComponentId, mode: CodexStackComponentInstallMode];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-install-strategy-panel {
  display: contents;
}

.cs-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4 {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-component-mode-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-component-mode-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  padding: 14px;
}

.cs-segmented {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--code-bg) 36%, transparent);
  padding: 4px;
}

.cs-segmented-button {
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.88rem;
}

.cs-segmented-button-active {
  background: color-mix(in srgb, var(--acc) 18%, transparent);
  color: var(--text);
}

.cs-install-cta-card {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 16%, transparent), transparent 32%),
    var(--surface);
}

.cs-install-cta-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-big-button {
  min-width: 240px;
}

@media (max-width: 960px) {
  .cs-segmented {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .cs-segmented-button {
    padding: 8px 6px;
  }

  .cs-big-button {
    min-width: 0;
    width: 100%;
  }
}
</style>
