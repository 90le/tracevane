<template>
  <section class="cs-repair-workflow" aria-labelledby="cs-repair-workflow-title">
    <div class="cs-repair-brief">
      <div>
        <p class="cs-section-kicker">{{ text("推荐路径", "Recommended Path") }}</p>
        <h4 id="cs-repair-workflow-title">{{ text("先修复，再验证，最后切换", "Repair, Verify, Then Attach") }}</h4>
        <p class="cs-field-hint">
          {{ text("大多数情况下只需要按下面 3 步走。高级操作只在端口冲突、配置损坏或需要手动暂停时使用。", "Most cases only need the three steps below. Advanced actions are for port conflicts, damaged config, or manual pause/resume.") }}
        </p>
      </div>
    </div>
    <div class="cs-repair-workflow-grid">
      <div class="cs-repair-timeline">
        <article class="cs-repair-step cs-repair-step-primary">
          <span class="cs-step-number">1</span>
          <strong>{{ text("推荐修复", "Recommended Repair") }}</strong>
          <p>{{ text("自动处理代理链路、后台守护、NO_PROXY/TUN 绕过、旧巡检清理和常见配置漂移。", "Automatically handles the proxy chain, background watchdog, NO_PROXY/TUN bypass, legacy check cleanup, and common config drift.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-recommended')">
            {{ text("执行推荐修复", "Run Recommended") }}
          </button>
        </article>
        <article class="cs-repair-step cs-repair-step-primary">
          <span class="cs-step-number">2</span>
          <strong>{{ text("运行模型矩阵", "Run Smoke Matrix") }}</strong>
          <p>{{ text("只验证不切换 Codex：当前默认 CPA 模型必须通过普通、非流式、流式和压缩上下文。", "Verify without attaching Codex: the current default CPA model must pass chat, non-stream, stream, and compact checks.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('run-smoke-matrix')">
            {{ text("只验证", "Verify Only") }}
          </button>
        </article>
        <article class="cs-repair-step cs-repair-step-primary">
          <span class="cs-step-number">3</span>
          <strong>{{ text("验证并切换 Codex", "Smoke and Attach Codex") }}</strong>
          <p>{{ text("重新跑目标模型完整矩阵；全部通过才写入 Codex active provider。用户可选择官方 GPT 登录路径，也可选择 GPT 或国内兼容模型走 CPA。", "Rerun the full target-model matrix and write the active Codex provider only if every check passes. Users can keep the official GPT login path or route GPT/domestic-compatible models through CPA.") }}</p>
          <button type="button" class="primary-button" :disabled="!canAttachCodexCpa" @click="$emit('attach-codex-cpa')">
            {{ text("验证并切换", "Smoke & Attach") }}
          </button>
        </article>
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </div>
      <aside class="cs-attach-summary">
        <p class="cs-section-kicker">{{ text("切换前检查", "Before Attach") }}</p>
        <strong>{{ text("按钮灰掉时先看这里", "Read this when the button is disabled") }}</strong>
        <p class="cs-repair-card-note">{{ attachCodexCpaHelp }}</p>
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
        <p class="cs-repair-card-note">
          {{ text("官方 ChatGPT 路径会使用 GPT 官方模型；CPA 路径可使用 GPT 或国内兼容模型，但必须先通过 smoke gate。", "The official ChatGPT route uses an official GPT model. The CPA route can use GPT or domestic-compatible models, but must pass the smoke gate first.") }}
        </p>
      </aside>
    </div>
    <details class="cs-advanced-repair">
      <summary>{{ text("高级操作：冲突、重写配置、暂停/恢复", "Advanced: conflicts, config rewrite, pause/resume") }}</summary>
      <div class="cs-repair-grid">
        <article class="cs-repair-step">
          <strong>{{ text("清理旧守护", "Clean Old Daemons") }}</strong>
          <p>{{ text("禁用可能抢端口的旧 cpa.service / cliproxyapi.service，再让当前服务接管。", "Disable old cpa.service / cliproxyapi.service units that may occupy ports.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-conflicts')">
            {{ text("清理冲突服务", "Clean Conflicts") }}
          </button>
        </article>
        <article class="cs-repair-step">
          <strong>{{ text("重写配置不启动", "Rewrite Config Only") }}</strong>
          <p>{{ text("重新跑安装器的配置阶段但不启动服务，适合修复损坏配置后手动启动。", "Rerun the installer config phase without starting services, then start manually.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-config-only')">
            {{ text("只修复配置", "Repair Config Only") }}
          </button>
        </article>
        <article class="cs-repair-step">
          <strong>{{ text("暂停 CPA 栈", "Pause CPA Stack") }}</strong>
          <p>{{ text("先停 watchdog，再停 Compact 和 CPA，避免你手动停用后又被自动拉起。", "Stop watchdog first, then Compact and CPA so manual pause stays paused.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('pause-stack')">
            {{ text("暂停链路", "Pause Stack") }}
          </button>
        </article>
        <article class="cs-repair-step">
          <strong>{{ text("恢复 CPA 栈", "Resume CPA Stack") }}</strong>
          <p>{{ text("按 CPA → Compact → watchdog 顺序恢复，并等待健康检查通过。", "Resume in CPA, Compact, watchdog order after health checks pass.") }}</p>
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
