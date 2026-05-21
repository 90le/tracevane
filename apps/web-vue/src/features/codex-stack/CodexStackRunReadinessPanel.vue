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
    <div class="cs-run-mode-grid">
      <button
        v-for="mode in readiness.modes"
        :key="mode.id"
        type="button"
        class="cs-run-mode"
        :class="runReadinessModeTone(mode.ready, readiness.level)"
        :disabled="isActionDisabled(mode.actionHint)"
        @click="$emit('mode-action', mode)"
      >
        <div>
          <strong>{{ mode.label }}</strong>
          <p>{{ mode.detail }}</p>
          <div v-if="mode.dependencies?.length" class="cs-run-mode-deps" :aria-label="text('依赖检查', 'Dependency checks')">
            <span
              v-for="dependency in mode.dependencies"
              :key="dependency.checkId"
              class="cs-run-mode-dep"
              :class="`tone-${runReadinessCheckTone(dependency.status)}`"
            >
              {{ dependency.label }}
            </span>
          </div>
          <em v-if="mode.actionHint">{{ isActionDisabled(mode.actionHint) ? disabledLabel : mode.actionHint.label }}</em>
        </div>
        <span>{{ runReadinessModeLabel(mode.ready, readiness.level) }}</span>
      </button>
    </div>
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
  </article>
</template>

<script setup lang="ts">
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

defineEmits<{
  "check-action": [check: CodexStackRunReadinessCheck];
  "mode-action": [mode: CodexStackRunReadinessMode];
}>();

const { text } = useLocalePreference();

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

.cs-run-mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.cs-run-mode {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: 92px;
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

.cs-run-mode span,
.cs-run-check strong {
  flex: none;
  color: currentColor;
  font-size: 0.78rem;
  text-transform: uppercase;
}

.cs-run-check-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
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

.cs-run-mode-deps {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.cs-run-mode-dep {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 7px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  color: var(--text-soft);
  font-size: 0.7rem;
  line-height: 1.2;
}

.cs-run-mode-dep.tone-sage {
  border-color: color-mix(in srgb, var(--success) 44%, var(--line));
  color: var(--success);
}

.cs-run-mode-dep.tone-accent {
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  color: var(--acc);
}

.cs-run-mode-dep.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 44%, var(--line));
  color: var(--danger);
}

.cs-run-check em {
  display: inline-flex;
  margin-top: 10px;
  color: currentColor;
  font-style: normal;
  font-weight: 700;
}

@media (max-width: 1200px) {
  .cs-run-check-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .cs-run-readiness-head {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-run-mode-grid,
  .cs-run-check-grid {
    grid-template-columns: 1fr;
  }
}
</style>
