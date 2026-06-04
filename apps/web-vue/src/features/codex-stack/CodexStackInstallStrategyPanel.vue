<template>
  <div class="cs-install-strategy-workbench">
    <section class="cs-install-strategy-editor">
      <div class="cs-config-section-head">
        <div>
          <p class="cs-section-kicker">{{ text("可选策略", "Optional Strategy") }}</p>
          <h4>{{ text("组件策略", "Component Strategy") }}</h4>
        </div>
      </div>
      <p class="cs-field-hint">
        {{ text("小白用户保持默认即可。只有组件损坏、版本不一致或需要保留现状时，再改跳过或强制。", "New users can keep defaults. Change skip or force only for damaged components, version mismatch, or preserving the current state.") }}
      </p>
      <p class="cs-install-managed-note">
        {{ text("Studio Gateway daemon 由独立 service supervisor 托管；组件策略只影响安装准备，不替代 service manager 操作。", "The Studio Gateway daemon is owned by an independent service supervisor; component strategy only affects install preparation and does not replace service manager actions.") }}
      </p>
      <div class="cs-component-mode-list">
        <article v-for="component in components" :key="component.id" class="cs-component-mode-row">
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
    </section>

    <section class="cs-install-run-panel">
      <div class="cs-config-section-head">
        <div>
          <p class="cs-section-kicker">{{ text("改完后执行", "Run After Editing") }}</p>
          <h4>{{ text("安装入口", "Install Entry") }}</h4>
        </div>
      </div>
      <p class="cs-field-hint">
        {{ text("完整安装会同时准备 cc-connect；基础安装保留 Codex 与 Studio Gateway daemon，模型 relay 不再依赖 CPA/Compact。", "Full install also prepares cc-connect; base install keeps Codex and the Studio Gateway daemon, and model relay no longer depends on CPA/Compact.") }}
      </p>
      <div class="cs-install-run-actions">
        <button type="button" class="primary-button cs-big-button" :disabled="!canRunMutation" @click="$emit('install-full')">
          {{ text("一键安装全部组件", "Install Full Stack") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-base')">
          {{ text("仅安装基础组件", "Install Base Only") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
          {{ text("执行推荐修复", "Run Recommended Repair") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('reinstall-full')">
          {{ text("重新安装全部组件", "Reinstall Full Stack") }}
        </button>
      </div>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { CodexStackComponentId } from "../../../../../types/codex-stack";
import "./codex-stack-install.css";
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
  mutationDisabledHelp: string;
}>();

defineEmits<{
  "install-full": [];
  "install-base": [];
  "reinstall-full": [];
  repair: [];
  "set-component-mode": [componentId: CodexStackComponentId, mode: CodexStackComponentInstallMode];
}>();

const { text } = useLocalePreference();
</script>
