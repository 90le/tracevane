<template>
  <article class="panel-card cs-run-readiness-card" :class="`tone-${tone}`">
    <div class="cs-run-readiness-head">
      <div>
        <p class="cs-section-kicker">{{ text("Codex 运行就绪", "Codex Run Readiness") }}</p>
        <h4>{{ readiness.title }}</h4>
        <p>{{ readiness.summary }}</p>
      </div>
      <span class="cs-status-pill" :class="`tone-${tone}`">
        {{ runReadinessLevelLabel(readiness.level) }}
      </span>
    </div>

    <section class="cs-run-focus">
      <div class="cs-run-focus-summary">
        <p class="cs-section-kicker">{{ text("当前结论", "Current Result") }}</p>
        <strong>{{ readiness.title }}</strong>
        <p>{{ readiness.summary }}</p>
        <div v-if="blockingChecks.length" class="cs-run-blockers">
          <span v-for="check in blockingChecks.slice(0, 3)" :key="check.id">
            {{ check.label }}
          </span>
        </div>
      </div>
      <div class="cs-run-focus-action">
        <p class="cs-section-kicker">{{ text("下一步", "Next Step") }}</p>
        <strong>{{ primaryActionTitle }}</strong>
        <p>{{ primaryActionCopy }}</p>
        <button
          v-if="primaryActionTarget"
          type="button"
          class="primary-button"
          :disabled="primaryActionDisabled"
          @click="runPrimaryAction"
        >
          {{ primaryActionLabel }}
        </button>
      </div>
    </section>

    <div class="cs-run-mode-strip">
      <button
        v-for="mode in readiness.modes"
        :key="mode.id"
        type="button"
        class="cs-run-mode"
        :class="runReadinessModeTone(mode.ready, readiness.level)"
        :disabled="isActionDisabled(mode.actionHint)"
        @click="$emit('mode-action', mode)"
      >
        <div class="cs-run-mode-copy">
          <strong>{{ mode.label }}</strong>
          <em v-if="mode.actionHint">{{ isActionDisabled(mode.actionHint) ? disabledLabel : mode.actionHint.label }}</em>
        </div>
        <span>{{ runReadinessModeLabel(mode.ready, readiness.level) }}</span>
      </button>
    </div>
    <details class="cs-run-check-details">
      <summary>
        <span>{{ text("技术检查", "Technical Checks") }}</span>
        <strong>{{ checkSummary }}</strong>
      </summary>
      <div class="cs-run-check-grid">
        <button
          v-for="check in readiness.checks"
          :key="check.id"
          type="button"
          class="cs-run-check"
          :class="`tone-${runReadinessCheckTone(check.status)}`"
          :disabled="isActionDisabled(check.actionHint)"
          @click="$emit('check-action', check)"
        >
          <span>{{ check.label }}</span>
          <strong>{{ runReadinessCheckLabel(check.status) }}</strong>
          <small>{{ check.detail }}</small>
          <em>{{ isActionDisabled(check.actionHint) ? disabledLabel : check.actionHint.label }}</em>
        </button>
      </div>
    </details>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import type {
  CodexStackRunReadiness,
  CodexStackRunReadinessActionHint,
  CodexStackRunReadinessCheck,
  CodexStackRunReadinessCheckStatus,
  CodexStackRunReadinessLevel,
  CodexStackRunReadinessMode,
} from "../../../../../types/codex-stack";
import type { CodexStackTone } from "./codex-stack-view-model";

const props = defineProps<{
  readiness: CodexStackRunReadiness;
  tone: CodexStackTone;
  actionsDisabled: boolean;
  disabledLabel: string;
}>();

const emit = defineEmits<{
  "check-action": [check: CodexStackRunReadinessCheck];
  "mode-action": [mode: CodexStackRunReadinessMode];
}>();

const { text } = useLocalePreference();

const blockingChecks = computed(() => props.readiness.checks.filter((check) => check.status === "fail"));
const reviewChecks = computed(() => props.readiness.checks.filter((check) => check.status === "warn"));
const primaryActionTarget = computed(() => (
  props.readiness.modes.find((mode) => !mode.ready && mode.actionHint)
    || blockingChecks.value.find((check) => check.actionHint)
    || reviewChecks.value.find((check) => check.actionHint)
));
const primaryActionLabel = computed(() => primaryActionTarget.value?.actionHint?.label || text("无需操作", "No action needed"));
const primaryActionTitle = computed(() => {
  if (props.readiness.level === "ready") return text("保持当前配置", "Keep Current Setup");
  if (primaryActionTarget.value) return text("按建议处理阻断项", "Resolve the blocking item");
  return text("查看详情", "Review details");
});
const primaryActionCopy = computed(() => {
  if (props.readiness.level === "ready") {
    return text("普通对话、长任务、压缩上下文和 Agent 链路当前可用。", "Chat, long tasks, compaction, and Agent routing are currently usable.");
  }
  if (blockingChecks.value.length) {
    return text(`先处理 ${blockingChecks.value[0].label}，其余检查保留在下方技术详情。`, `Resolve ${blockingChecks.value[0].label} first; the remaining checks stay in technical details below.`);
  }
  return text("没有硬阻断；如要接入 CPA，先重新运行目标模型矩阵。", "No hard block; rerun the target-model matrix before attaching CPA.");
});
const primaryActionDisabled = computed(() => (
  primaryActionTarget.value?.actionHint ? isActionDisabled(primaryActionTarget.value.actionHint) : true
));
const checkSummary = computed(() => {
  const failed = blockingChecks.value.length;
  const review = reviewChecks.value.length;
  const passed = props.readiness.checks.filter((check) => check.status === "pass").length;
  return failed
    ? text(`${failed} 个阻断 · ${passed} 个通过`, `${failed} blocked · ${passed} passed`)
    : review
      ? text(`${review} 个关注 · ${passed} 个通过`, `${review} review · ${passed} passed`)
      : text(`${passed} 个通过`, `${passed} passed`);
});

function runPrimaryAction(): void {
  const target = primaryActionTarget.value;
  if (!target) return;
  if ("ready" in target) {
    emit("mode-action", target);
    return;
  }
  emit("check-action", target);
}

function runReadinessLevelLabel(level: CodexStackRunReadinessLevel): string {
  const labels: Record<CodexStackRunReadinessLevel, string> = {
    ready: text("可运行", "Ready"),
    attention: text("需复验", "Needs Review"),
    blocked: text("暂不接入", "Blocked"),
  };
  return labels[level];
}

function runReadinessCheckTone(status: CodexStackRunReadinessCheckStatus): CodexStackTone {
  if (status === "pass") return "sage";
  if (status === "warn") return "accent";
  return "danger";
}

function runReadinessCheckLabel(status: CodexStackRunReadinessCheckStatus): string {
  const labels: Record<CodexStackRunReadinessCheckStatus, string> = {
    pass: text("通过", "Pass"),
    warn: text("关注", "Review"),
    fail: text("阻断", "Fail"),
  };
  return labels[status];
}

function runReadinessModeTone(ready: boolean, level: CodexStackRunReadinessLevel): string {
  if (ready) return "tone-sage";
  return level === "blocked" ? "tone-danger" : "tone-accent";
}

function runReadinessModeLabel(ready: boolean, level: CodexStackRunReadinessLevel): string {
  if (ready) return text("可用", "Ready");
  return level === "blocked" ? text("阻断", "Blocked") : text("待处理", "Pending");
}

function isActionDisabled(actionHint: CodexStackRunReadinessActionHint | undefined): boolean {
  return Boolean(actionHint && actionHint.kind !== "open-section" && props.actionsDisabled);
}
</script>

<style scoped>
.cs-run-readiness-card {
  display: grid;
  gap: 16px;
  border-color: color-mix(in srgb, currentColor 28%, var(--line));
}

.cs-run-readiness-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.cs-run-readiness-head h4,
.cs-run-readiness-head p,
.cs-run-mode p {
  margin: 0;
}

.cs-run-readiness-head h4 {
  color: var(--text);
  font-size: clamp(1.15rem, 1.7vw, 1.45rem);
}

.cs-run-readiness-head p,
.cs-run-mode p,
.cs-run-check small {
  color: var(--text-soft);
  line-height: 1.45;
}

.cs-run-focus {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
  gap: 12px;
}

.cs-run-focus-summary,
.cs-run-focus-action {
  display: grid;
  align-content: start;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}

.cs-run-focus-summary strong,
.cs-run-focus-action strong {
  color: var(--text);
  font-size: 1rem;
}

.cs-run-focus-summary p,
.cs-run-focus-action p {
  margin: 0;
  color: var(--text-soft);
  line-height: 1.45;
}

.cs-run-blockers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cs-run-blockers span {
  border: 1px solid color-mix(in srgb, var(--danger) 42%, var(--line));
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  font-size: 0.76rem;
  font-weight: 700;
}

.cs-run-mode-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.cs-run-mode {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: 72px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: inherit;
  font: inherit;
}

.cs-run-mode strong,
.cs-run-check span {
  display: block;
  margin-bottom: 4px;
  color: var(--text);
}

.cs-run-mode-copy {
  min-width: 0;
}

.cs-run-mode span,
.cs-run-check strong {
  flex: none;
  color: currentColor;
  font-size: 0.78rem;
  text-transform: uppercase;
}

.cs-run-check-details {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--code-bg) 20%, transparent);
}

.cs-run-check-details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.cs-run-check-details summary span {
  color: var(--text);
  font-weight: 700;
}

.cs-run-check-details summary strong {
  color: var(--text-soft);
  font-size: 0.86rem;
}

.cs-run-check-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 0 12px 12px;
}

.cs-run-check {
  min-height: 118px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  text-align: left;
  cursor: pointer;
}

.cs-run-check:hover {
  transform: translateY(-1px);
}

.cs-run-mode:disabled,
.cs-run-check:disabled {
  cursor: not-allowed;
  opacity: 0.72;
  transform: none;
}

.cs-run-mode:disabled em,
.cs-run-check:disabled em {
  color: var(--muted);
}

.cs-run-mode {
  text-align: left;
  cursor: pointer;
}

.cs-run-mode:hover {
  transform: translateY(-1px);
}

.cs-run-mode em {
  display: inline-flex;
  margin-top: 8px;
  color: currentColor;
  font-style: normal;
  font-weight: 700;
  font-size: 0.82rem;
}

.cs-run-check em {
  display: inline-flex;
  margin-top: 10px;
  color: currentColor;
  font-style: normal;
  font-weight: 700;
}

@media (max-width: 1200px) {
  .cs-run-mode-strip,
  .cs-run-check-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .cs-run-readiness-head {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-run-focus,
  .cs-run-mode-strip,
  .cs-run-check-grid {
    grid-template-columns: 1fr;
  }
}
</style>
