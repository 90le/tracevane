<template>
  <article class="panel-card cs-repair-board">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("修复策略", "Repair Strategy") }}</p>
        <h4>{{ text("从轻修复到重写配置", "From Light Repair to Config Rewrite") }}</h4>
      </div>
    </div>
    <div class="cs-repair-grid">
      <article class="cs-repair-card">
        <strong>{{ text("推荐修复", "Recommended Repair") }}</strong>
        <p>{{ text("根据当前状态重启未运行的 CPA、Compact、watchdog 或 cc-connect。", "Restart inactive CPA, Compact, watchdog, or cc-connect based on current status.") }}</p>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-recommended')">
          {{ text("执行推荐修复", "Run Recommended") }}
        </button>
      </article>
      <article class="cs-repair-card">
        <strong>{{ text("清理旧守护", "Clean Old Daemons") }}</strong>
        <p>{{ text("禁用可能抢端口的旧 cpa.service / cliproxyapi.service，再让当前服务接管。", "Disable old cpa.service / cliproxyapi.service units that may occupy ports.") }}</p>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-conflicts')">
          {{ text("清理冲突服务", "Clean Conflicts") }}
        </button>
      </article>
      <article class="cs-repair-card">
        <strong>{{ text("重写配置不启动", "Rewrite Config Only") }}</strong>
        <p>{{ text("重新跑安装器的配置阶段但不启动服务，适合修复损坏配置后手动启动。", "Rerun the installer config phase without starting services, then start manually.") }}</p>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-config-only')">
          {{ text("只修复配置", "Repair Config Only") }}
        </button>
      </article>
      <article class="cs-repair-card">
        <strong>{{ text("暂停 CPA 栈", "Pause CPA Stack") }}</strong>
        <p>{{ text("先停 watchdog，再停 Compact 和 CPA，避免你手动停用后又被自动拉起。", "Stop watchdog first, then Compact and CPA so manual pause stays paused.") }}</p>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('pause-stack')">
          {{ text("暂停链路", "Pause Stack") }}
        </button>
      </article>
      <article class="cs-repair-card">
        <strong>{{ text("恢复 CPA 栈", "Resume CPA Stack") }}</strong>
        <p>{{ text("按 CPA → Compact → watchdog 顺序恢复，并等待健康检查通过。", "Resume in CPA, Compact, watchdog order after health checks pass.") }}</p>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('resume-stack')">
          {{ text("恢复链路", "Resume Stack") }}
        </button>
      </article>
      <article class="cs-repair-card">
        <strong>{{ text("运行模型矩阵", "Run Smoke Matrix") }}</strong>
        <p>{{ text("只验证不切换 Codex：glm-5.1 与 kimi-k2.6 都要通过普通、非流式、流式和压缩上下文。", "Verify without attaching Codex: glm-5.1 and kimi-k2.6 must pass chat, non-stream, stream, and compact checks.") }}</p>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('run-smoke-matrix')">
          {{ text("只验证", "Verify Only") }}
        </button>
      </article>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
      <article class="cs-repair-card">
        <strong>{{ text("通过验证后切 Codex", "Attach Codex After Smoke") }}</strong>
        <p>{{ text("会重新跑完整模型矩阵；全部通过才写入 Codex active provider，并在当前模型不是 glm/kimi 时切到安全的国内模型。", "Reruns the full model matrix and writes the active Codex provider only if every check passes; if the current model is not glm/kimi, it switches to a CPA-safe domestic model.") }}</p>
        <p class="cs-repair-card-note">{{ attachCodexCpaHelp }}</p>
        <dl class="cs-attach-preflight-list">
          <div v-for="item in attachPreflightItems" :key="item.id" class="cs-attach-preflight-row" :class="`tone-${item.tone}`">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
        <button type="button" class="secondary-button" :disabled="!canAttachCodexCpa" @click="$emit('attach-codex-cpa')">
          {{ text("验证并切换", "Smoke & Attach") }}
        </button>
      </article>
    </div>
  </article>
</template>

<script setup lang="ts">
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
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-repair-board {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--warning) 12%, transparent), transparent 34%),
    var(--surface);
}

.cs-repair-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.cs-repair-card {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-repair-card strong {
  color: var(--text);
}

.cs-repair-card p {
  flex: 1;
  margin: 0;
  color: var(--text-soft);
}

.cs-repair-card-note {
  flex: 0 !important;
  border-left: 3px solid var(--warning);
  padding-left: 10px;
  font-size: 0.86rem;
}

.cs-disabled-help {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-attach-preflight-list {
  display: grid;
  gap: 7px;
  width: 100%;
  margin: 0;
}

.cs-attach-preflight-row {
  display: grid;
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--code-bg) 28%, transparent);
}

.cs-attach-preflight-row dt {
  color: var(--muted);
  font-size: 0.72rem;
  text-transform: uppercase;
}

.cs-attach-preflight-row dd {
  margin: 0;
  color: var(--text);
  font-size: 0.84rem;
  line-height: 1.35;
}

.cs-attach-preflight-row.tone-sage {
  border-color: color-mix(in srgb, var(--success) 42%, var(--line));
}

.cs-attach-preflight-row.tone-accent {
  border-color: color-mix(in srgb, var(--acc) 42%, var(--line));
}

.cs-attach-preflight-row.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
}

@media (max-width: 960px) {
  .cs-repair-grid {
    grid-template-columns: 1fr;
  }
}
</style>
