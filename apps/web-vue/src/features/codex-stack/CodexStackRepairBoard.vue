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
          <strong>{{ text("切到 Studio Gateway", "Attach Studio Gateway") }}</strong>
          <button type="button" class="primary-button" :disabled="!canAttachCodexStudio" @click="$emit('attach-codex-studio')">
            {{ text("切到 Studio", "Attach Studio") }}
          </button>
        </article>
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </div>
      <details class="cs-attach-summary">
        <summary>{{ text("切换前检查", "Before attach") }}</summary>
        <dl class="cs-attach-preflight-list">
          <div v-for="item in studioGatewayPreflightItems" :key="item.id" class="cs-attach-preflight-row" :class="`tone-${item.tone}`">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
        <p v-if="!canAttachCodexStudio && attachCodexStudioDisabledHelp" class="cs-disabled-help">
          {{ attachCodexStudioDisabledHelp }}
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
      </div>
    </details>
    <details class="cs-daemon-service-panel cs-advanced-repair">
      <summary>{{ text("Studio Gateway daemon", "Studio Gateway daemon") }}</summary>
      <dl class="cs-attach-preflight-list">
        <div v-for="item in studioGatewayPreflightItems" :key="`daemon-${item.id}`" class="cs-attach-preflight-row" :class="`tone-${item.tone}`">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>
      <div class="cs-attach-route-actions">
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('preview-model-gateway-daemon-service')">
          {{ text("预览 service", "Preview service") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('status-model-gateway-daemon-service')">
          {{ text("运行 status", "Run status") }}
        </button>
        <button type="button" class="primary-button" :disabled="!canRunMutation" @click="$emit('ensure-model-gateway-daemon')">
          {{ text("确保 daemon 运行", "Ensure daemon") }}
        </button>
      </div>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
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
  canAttachCodexStudio: boolean;
  attachCodexStudioDisabledHelp: string;
  studioGatewayPreflightItems: CodexStackAttachPreflightItem[];
}>();

defineEmits<{
  "repair-recommended": [];
  "repair-conflicts": [];
  "repair-config-only": [];
  "run-smoke-matrix": [];
  "attach-codex-studio": [];
  "preview-model-gateway-daemon-service": [];
  "status-model-gateway-daemon-service": [];
  "ensure-model-gateway-daemon": [];
  "restore-official-chatgpt": [];
}>();

const { text } = useLocalePreference();
</script>
