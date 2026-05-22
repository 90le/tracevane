<template>
  <article class="panel-card cs-repair-board">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("推荐路径", "Recommended Path") }}</p>
        <h4>{{ text("先修复，再验证，最后切换", "Repair, Verify, Then Attach") }}</h4>
        <p class="cs-field-hint">
          {{ text("大多数情况下只需要按下面 3 步走。高级操作只在端口冲突、配置损坏或需要手动暂停时使用。", "Most cases only need the three steps below. Advanced actions are for port conflicts, damaged config, or manual pause/resume.") }}
        </p>
      </div>
    </div>
    <div class="cs-repair-guide-layout">
      <div class="cs-repair-flow">
        <article class="cs-repair-card cs-repair-card-primary">
          <span class="cs-step-number">1</span>
          <strong>{{ text("推荐修复", "Recommended Repair") }}</strong>
          <p>{{ text("根据当前状态自动处理未运行的 CPA、Compact、watchdog 或 cc-connect。", "Automatically handle inactive CPA, Compact, watchdog, or cc-connect based on current status.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair-recommended')">
            {{ text("执行推荐修复", "Run Recommended") }}
          </button>
        </article>
        <article class="cs-repair-card cs-repair-card-primary">
          <span class="cs-step-number">2</span>
          <strong>{{ text("运行模型矩阵", "Run Smoke Matrix") }}</strong>
          <p>{{ text("只验证不切换 Codex：当前默认 CPA 模型必须通过普通、非流式、流式和压缩上下文。", "Verify without attaching Codex: the current default CPA model must pass chat, non-stream, stream, and compact checks.") }}</p>
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('run-smoke-matrix')">
            {{ text("只验证", "Verify Only") }}
          </button>
        </article>
        <article class="cs-repair-card cs-repair-card-primary">
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
      </aside>
    </div>
    <details class="cs-advanced-repair">
      <summary>{{ text("高级操作：冲突、重写配置、暂停/恢复", "Advanced: conflicts, config rewrite, pause/resume") }}</summary>
      <div class="cs-repair-grid">
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
      </div>
    </details>
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
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-repair-board {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--warning) 12%, transparent), transparent 34%),
    var(--surface);
}

.cs-field-hint {
  max-width: 760px;
  margin: 6px 0 0;
  color: var(--text-soft);
  line-height: 1.45;
}

.cs-repair-guide-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);
  gap: 14px;
  align-items: stretch;
}

.cs-repair-flow {
  display: grid;
  gap: 10px;
}

.cs-repair-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.cs-repair-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: start;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-repair-card-primary {
  border-color: color-mix(in srgb, var(--acc) 34%, var(--line));
}

.cs-step-number {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--acc) 15%, transparent);
  color: var(--acc);
  font-weight: 800;
}

.cs-repair-card strong {
  padding-right: 30px;
  color: var(--text);
}

.cs-repair-card p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-soft);
}

.cs-repair-card button {
  grid-column: 1 / -1;
  justify-self: start;
}

.cs-repair-card-note {
  border-left: 3px solid var(--warning);
  padding-left: 10px;
  font-size: 0.86rem;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-advanced-repair {
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: color-mix(in srgb, var(--code-bg) 20%, transparent);
}

.cs-attach-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--acc) 28%, var(--line));
  border-radius: var(--radius-lg);
  padding: 14px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 12%, transparent), transparent 34%),
    color-mix(in srgb, var(--surface) 92%, transparent);
}

.cs-attach-summary strong {
  color: var(--text);
}

.cs-advanced-repair summary {
  cursor: pointer;
  color: var(--text);
  font-weight: 700;
}

.cs-advanced-repair .cs-repair-grid {
  margin-top: 12px;
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
  .cs-repair-guide-layout,
  .cs-repair-flow,
  .cs-repair-grid {
    grid-template-columns: 1fr;
  }
}
</style>
