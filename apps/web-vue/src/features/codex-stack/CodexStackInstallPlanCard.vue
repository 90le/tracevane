<template>
  <section class="cs-install-entry" aria-labelledby="cs-install-entry-title">
    <div class="cs-install-entry-copy">
      <p class="cs-section-kicker">{{ text("当前计划", "Current Plan") }}</p>
      <h4 id="cs-install-entry-title">{{ text("新手入口", "Beginner Entry") }}</h4>
      <p class="cs-field-hint">
        {{ text("不用先理解所有组件：先按 Studio 的推荐动作走，安装参数、重装和基础安装都收在高级入口里。", "You do not need to understand every component first: follow Studio's recommended action, with install parameters, reinstall, and base install kept behind advanced entry points.") }}
      </p>
      <div class="cs-install-highlights">
        <span v-for="item in highlights" :key="item">{{ item }}</span>
      </div>
    </div>

    <div class="cs-install-decision" :class="`tone-${recommendedTone}`" aria-label="Codex Stack recommended action">
      <div class="cs-install-decision-copy">
        <p class="cs-section-kicker">{{ text("现在先做", "Do this first") }}</p>
        <h4>{{ recommendedTitle }}</h4>
        <p>{{ recommendedCopy }}</p>
      </div>
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
          <span>{{ text("其它入口", "Other entries") }}</span>
          <small>{{ text("仅在推荐动作不适合时使用", "Use only when the recommendation does not fit") }}</small>
        </summary>
        <div class="cs-install-action-rail" aria-label="Codex Stack install actions">
          <section class="cs-install-action-row">
            <span class="cs-install-step-mark">1</span>
            <div>
              <small>{{ text("第一次使用", "First Time") }}</small>
              <strong>{{ text("直接安装完整链路", "Install the full route") }}</strong>
              <p>{{ text("安装 CPA、Compact、cc-connect 和必要守护，安装日志会进入浮层。", "Install CPA, Compact, cc-connect, and required guards; logs stay in the floating output panel.") }}</p>
            </div>
            <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-full')">
              {{ text("一键安装全部组件", "Install Full Stack") }}
            </button>
          </section>

          <section class="cs-install-action-row">
            <span class="cs-install-step-mark">2</span>
            <div>
              <small>{{ text("已经安装", "Already Installed") }}</small>
              <strong>{{ text("修复或覆盖", "Repair or overwrite") }}</strong>
              <p>{{ text("优先推荐修复；只有版本损坏或需要覆盖时再重新安装。", "Use recommended repair first; reinstall only when the version is damaged or needs overwrite.") }}</p>
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
