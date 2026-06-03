<template>
  <section class="cs-repair-workflow" aria-labelledby="cs-repair-workflow-title">
    <div class="cs-repair-brief">
      <div>
        <h4 id="cs-repair-workflow-title">{{ text("修复链路", "Repair route") }}</h4>
      </div>
    </div>
    <div class="cs-repair-workflow-grid">
      <div class="cs-repair-timeline">
        <article class="cs-repair-step cs-repair-step-primary">
          <span class="cs-step-number">1</span>
          <strong>{{ text("推荐修复", "Recommended Repair") }}</strong>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-recommended')">
            {{ text("执行推荐修复", "Run Recommended") }}
          </button>
        </article>
        <article class="cs-repair-step cs-repair-step-primary">
          <span class="cs-step-number">2</span>
          <strong>{{ text("运行模型矩阵", "Run Smoke Matrix") }}</strong>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('run-smoke-matrix')">
            {{ text("只验证", "Verify Only") }}
          </button>
        </article>
        <article class="cs-repair-step cs-repair-step-primary">
          <span class="cs-step-number">3</span>
          <strong>{{ text("验证并切换 Codex", "Smoke and Attach Codex") }}</strong>
          <button type="button" class="primary-button" :disabled="!canAttachCodexCpa" @click="$emit('attach-codex-cpa')">
            {{ text("验证并切换", "Smoke & Attach") }}
          </button>
        </article>
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </div>
      <details class="cs-attach-summary">
        <summary>{{ text("切换前检查", "Before attach") }}</summary>
        <dl class="cs-attach-preflight-list">
          <div v-for="item in attachPreflightItems" :key="item.id" class="cs-attach-preflight-row" :class="`tone-${item.tone}`">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
        <p v-if="!canAttachCodexCpa && attachCodexCpaDisabledHelp" class="cs-disabled-help">
          {{ attachCodexCpaDisabledHelp }}
        </p>
        <div class="cs-attach-route-actions">
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('restore-official-chatgpt')">
            {{ text("切回官方 ChatGPT", "Use Official ChatGPT") }}
          </button>
        </div>
      </details>
    </div>
    <details class="cs-advanced-repair">
      <summary>{{ text("高级操作", "Advanced actions") }}</summary>
      <div class="cs-repair-grid">
        <article class="cs-repair-step">
          <strong>{{ text("清理旧守护", "Clean Old Daemons") }}</strong>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-conflicts')">
            {{ text("清理冲突服务", "Clean Conflicts") }}
          </button>
        </article>
        <article class="cs-repair-step">
          <strong>{{ text("重写配置不启动", "Rewrite Config Only") }}</strong>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-config-only')">
            {{ text("只修复配置", "Repair Config Only") }}
          </button>
        </article>
        <article class="cs-repair-step">
          <strong>{{ text("暂停 CPA 栈", "Pause CPA Stack") }}</strong>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('pause-stack')">
            {{ text("暂停链路", "Pause Stack") }}
          </button>
        </article>
        <article class="cs-repair-step">
          <strong>{{ text("恢复 CPA 栈", "Resume CPA Stack") }}</strong>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('resume-stack')">
            {{ text("恢复链路", "Resume Stack") }}
          </button>
        </article>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import "./codex-stack-install.css";
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackTone } from "./codex-stack-view-model";

export interface CodexStackAttachPreflightItem {
  id: string;
  label: string;
  value: string;
  tone: CodexStackTone;
}

defineProps<{
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  canAttachCodexCpa: boolean;
  attachCodexCpaHelp: string;
  attachCodexCpaDisabledHelp: string;
  attachPreflightItems: CodexStackAttachPreflightItem[];
}>();

defineEmits<{
  "repair-recommended": [];
  "repair-conflicts": [];
  "repair-config-only": [];
  "pause-stack": [];
  "resume-stack": [];
  "run-smoke-matrix": [];
  "attach-codex-cpa": [];
  "restore-official-chatgpt": [];
}>();

const { text } = useLocalePreference();
</script>
