<template>
  <section class="cs-install-entry" aria-labelledby="cs-install-entry-title">
    <div class="cs-install-entry-copy">
      <h4 id="cs-install-entry-title">{{ recommendedTitle }}</h4>
      <div class="cs-install-highlights">
        <span v-for="item in highlights" :key="item">{{ item }}</span>
      </div>
    </div>

    <div class="cs-install-decision" :class="`tone-${recommendedTone}`" aria-label="Codex Stack recommended action">
      <div class="cs-install-decision-actions">
        <button type="button" class="primary-button cs-install-primary-action" :disabled="recommendedDisabled" @click="$emit('run-recommended')">
          {{ recommendedButton }}
        </button>
        <p v-if="recommendedDisabled && recommendedDisabledHelp" class="cs-disabled-help">
          {{ recommendedDisabledHelp }}
        </p>
      </div>

      <details class="cs-install-secondary-drawer">
        <summary>
          <span>{{ text("其它动作", "Other actions") }}</span>
        </summary>
        <div class="cs-install-action-rail" aria-label="Codex Stack install actions">
          <section class="cs-install-action-row">
            <span class="cs-install-step-mark">1</span>
            <div>
              <strong>{{ text("完整安装", "Full install") }}</strong>
            </div>
            <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-full')">
              {{ text("一键安装全部组件", "Install Full Stack") }}
            </button>
          </section>

          <section class="cs-install-action-row">
            <span class="cs-install-step-mark">2</span>
            <div>
              <strong>{{ text("修复或覆盖", "Repair or overwrite") }}</strong>
            </div>
            <div class="cs-install-secondary-actions">
              <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
                {{ text("推荐修复", "Recommended Repair") }}
              </button>
              <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('reinstall-full')">
                {{ text("重新安装", "Reinstall") }}
              </button>
              <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-base')">
                {{ text("仅基础组件", "Base Only") }}
              </button>
            </div>
          </section>
        </div>
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import "./codex-stack-install.css";
import { useLocalePreference } from "../../shared/locale";

defineProps<{
  highlights: string[];
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  recommendedTitle: string;
  recommendedCopy: string;
  recommendedButton: string;
  recommendedDisabled: boolean;
  recommendedDisabledHelp: string;
  recommendedTone: "sage" | "accent" | "danger" | "neutral";
}>();

defineEmits<{
  "run-recommended": [];
  "install-full": [];
  "install-base": [];
  "reinstall-full": [];
  repair: [];
}>();

const { text } = useLocalePreference();
</script>
