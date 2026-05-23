<template>
  <section class="cs-command-center">
    <div class="cs-command-main">
      <p class="cs-section-kicker">{{ text("控制台", "Console") }}</p>
      <div class="cs-command-status-row">
        <h3>{{ statusLabel }}</h3>
        <span class="cs-status-pill" :class="`tone-${statusTone}`">{{ text("当前状态", "Current state") }}</span>
      </div>
      <p class="cs-command-copy">
        {{ text("先看运行状态和推荐动作；健康检查、日志和高级链路保持在浮层或折叠区里。", "Review state and the suggested action first; health checks, logs, and deep chain details stay in floating or collapsed views.") }}
      </p>

      <div class="cs-command-facts" aria-label="Codex Stack facts">
        <span>{{ text("服务", "Services") }} <strong>{{ activeServiceCount }}/{{ serviceCount }}</strong></span>
        <span>{{ text("模型", "Model") }} <strong>{{ currentModel || "--" }}</strong></span>
        <span>{{ text("路径", "Route") }} <strong>{{ codexRouteLabel }}</strong></span>
        <span>{{ text("上下文", "Context") }} <strong>{{ contextTokensDisplay }}</strong></span>
        <span>{{ text("渠道", "Channel") }} <strong>{{ channelLabel }}</strong></span>
        <span>{{ text("检查", "Checked") }} <strong>{{ checkedAtLabel }}</strong></span>
      </div>
    </div>

    <div class="cs-command-side">
      <div class="cs-readiness-strip">
        <span>{{ text("就绪度", "Readiness") }}</span>
        <strong>{{ readyComponentCount }}/{{ componentCount }}</strong>
        <div class="cs-readiness-bar"><i :style="{ width: readinessPercent }"></i></div>
        <small>
          {{ issueCount ? text(`${issueCount} 个组件需要处理`, `${issueCount} components need attention`) : text("组件和服务稳定", "Components and services are stable") }}
        </small>
      </div>

      <div class="cs-next-action-pane">
        <span class="cs-section-kicker">{{ text("下一步", "Next step") }}</span>
        <h4>{{ nextActionTitle }}</h4>
        <p>{{ nextActionCopy }}</p>
        <div class="cs-command-actions">
          <UButton type="button" color="primary" :disabled="nextActionPrimaryDisabled" @click="$emit('primary')">
            {{ nextActionButton }}
          </UButton>
          <UButton type="button" color="neutral" variant="soft" @click="$emit('open-section')">
            {{ text("打开页面", "Open Section") }}
          </UButton>
        </div>
        <small v-if="nextActionDisabledHelp" class="cs-disabled-help">{{ nextActionDisabledHelp }}</small>
      </div>
    </div>

    <div class="cs-command-footer">
      <div>
        <span>{{ text("模型来源", "Model source") }}</span>
        <strong>{{ modelSourceLabel }}</strong>
        <small>{{ modelSourceHelp }}</small>
      </div>
      <div class="cs-model-preview">
        <span v-for="model in modelCatalogPreview" :key="model">{{ model }}</span>
      </div>
      <div class="cs-command-actions cs-command-actions-secondary">
        <UButton type="button" color="neutral" variant="soft" :disabled="busy" @click="$emit('run-check')">
          {{ text("健康检查", "Health Check") }}
        </UButton>
        <UButton type="button" color="neutral" variant="soft" :disabled="!canRunMutation" @click="$emit('repair')">
          {{ text("自动修复", "Auto Repair") }}
        </UButton>
        <UButton type="button" color="neutral" variant="ghost" :disabled="syncDisabled" @click="$emit('sync')">
          {{ text("同步", "Sync") }}
        </UButton>
      </div>
      <small v-if="busy && busyDisabledHelp" class="cs-command-footer-help">{{ busyDisabledHelp }}</small>
      <small v-else-if="!canRunMutation && mutationDisabledHelp" class="cs-command-footer-help">{{ mutationDisabledHelp }}</small>
      <small v-else-if="syncDisabled && syncDisabledHelp" class="cs-command-footer-help">{{ syncDisabledHelp }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackTone } from "./codex-stack-view-model";

const props = defineProps<{
  statusLabel: string;
  statusTone: CodexStackTone;
  activeServiceCount: number;
  serviceCount: number;
  currentModel: string;
  codexRouteLabel: string;
  contextTokensDisplay: string;
  channelLabel: string;
  checkedAtLabel: string;
  busy: boolean;
  busyDisabledHelp: string;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  syncDisabled: boolean;
  syncDisabledHelp: string;
  readyComponentCount: number;
  componentCount: number;
  issueCount: number;
  readinessPercent: string;
  nextActionTitle: string;
  nextActionCopy: string;
  nextActionButton: string;
  nextActionRequiresMutation: boolean;
  nextActionDisabledHelp: string;
  modelSourceLabel: string;
  modelSourceHelp: string;
  modelCatalogPreview: string[];
}>();

defineEmits<{
  primary: [];
  "open-section": [];
  "run-check": [];
  repair: [];
  sync: [];
}>();

const { text } = useLocalePreference();

const nextActionPrimaryDisabled = computed(() => (
  props.nextActionRequiresMutation ? !props.canRunMutation : props.busy
));
</script>

<style scoped>
.cs-command-center {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background:
    radial-gradient(720px 320px at 0% 0%, color-mix(in srgb, var(--acc) 13%, transparent), transparent 68%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 76%, transparent), color-mix(in srgb, var(--code-bg) 22%, transparent));
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(18px) saturate(122%);
  animation: csCommandEnter 0.36s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.cs-command-main,
.cs-command-side,
.cs-command-footer {
  background: color-mix(in srgb, var(--surface) 44%, transparent);
}

.cs-command-main {
  padding: 24px;
}

.cs-command-side {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 1px;
}

.cs-readiness-strip,
.cs-next-action-pane {
  padding: 20px;
  background: color-mix(in srgb, var(--surface) 40%, transparent);
}

.cs-command-status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cs-command-status-row h3 {
  margin: 0;
  font-size: clamp(1.7rem, 3vw, 2.45rem);
  line-height: 1;
}

.cs-command-copy {
  max-width: 760px;
  color: var(--text-soft);
  line-height: 1.58;
}

.cs-section-kicker {
  display: inline-flex;
  margin: 0 0 8px;
  color: var(--acc);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.cs-command-facts {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  margin-top: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.cs-command-facts span {
  min-width: 0;
  padding: 12px;
  background: color-mix(in srgb, var(--code-bg) 24%, transparent);
  color: var(--text-soft);
  font-size: 0.78rem;
}

.cs-command-facts strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--text);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-readiness-strip {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px 14px;
}

.cs-readiness-strip > span,
.cs-command-footer span {
  color: var(--text-soft);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cs-readiness-strip strong {
  font-size: 2.2rem;
  line-height: 1;
}

.cs-readiness-strip small,
.cs-command-footer small,
.cs-next-action-pane p,
.cs-disabled-help {
  color: var(--text-soft);
  line-height: 1.5;
}

.cs-readiness-bar {
  grid-column: 1 / -1;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 54%, transparent);
}

.cs-readiness-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--success), var(--mint));
}

.cs-next-action-pane h4 {
  margin: 0;
  font-size: 1.3rem;
}

.cs-command-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.cs-command-footer {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(240px, 0.7fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid var(--line);
}

.cs-command-footer-help {
  grid-column: 1 / -1;
  color: var(--warning);
}

.cs-command-footer strong {
  display: block;
  margin: 4px 0;
  font-size: 1.02rem;
}

.cs-model-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-model-preview span,
.cs-status-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--code-bg) 38%, transparent);
  color: var(--text);
  font-size: 0.82rem;
}

.cs-status-pill {
  font-weight: 700;
}

.cs-command-actions-secondary {
  justify-content: flex-end;
  margin-top: 0;
}

@media (max-width: 1180px) {
  .cs-command-center,
  .cs-command-footer {
    grid-template-columns: 1fr;
  }

  .cs-command-side {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto;
  }

  .cs-command-footer {
    align-items: stretch;
  }

  .cs-command-actions-secondary {
    justify-content: flex-start;
  }
}

@keyframes csCommandEnter {
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0) scale(0.995);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (max-width: 760px) {
  .cs-command-main,
  .cs-readiness-strip,
  .cs-next-action-pane,
  .cs-command-footer {
    padding: 16px;
  }

  .cs-command-facts,
  .cs-command-side {
    grid-template-columns: 1fr;
  }
}
</style>
