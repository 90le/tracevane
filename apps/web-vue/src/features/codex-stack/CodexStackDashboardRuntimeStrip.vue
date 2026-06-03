<template>
  <section class="cs-runtime-strip">
    <div class="cs-runtime-toolbar">
      <div class="cs-runtime-identity">
        <span class="cs-runtime-dot" :class="`tone-${statusTone}`" aria-hidden="true"></span>
        <div>
          <h3>{{ statusLabel }}</h3>
          <small>{{ currentModel || "--" }} · {{ codexRouteLabel }}</small>
        </div>
      </div>
      <div class="cs-runtime-toolbar-actions">
        <button type="button" class="primary-button" :disabled="nextActionPrimaryDisabled" @click="$emit('primary')">
          {{ nextActionButton }}
        </button>
        <details class="cs-runtime-more">
          <summary>{{ text("操作", "Actions") }}</summary>
          <div class="cs-runtime-more-panel">
            <button type="button" class="secondary-button" @click="$emit('open-section')">
              {{ text("打开相关页", "Open related page") }}
            </button>
            <button type="button" class="secondary-button" :disabled="busy" @click="$emit('run-check')">
              {{ text("健康检查", "Health Check") }}
            </button>
            <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
              {{ text("自动修复", "Auto Repair") }}
            </button>
            <button type="button" class="secondary-button" :disabled="syncDisabled" @click="$emit('sync')">
              {{ text("同步状态", "Sync") }}
            </button>
          </div>
        </details>
      </div>
    </div>

    <div class="cs-runtime-metrics" aria-label="Codex Stack facts">
      <span>{{ text("服务", "Services") }} <strong>{{ activeServiceCount }}/{{ serviceCount }}</strong></span>
      <span>{{ text("上下文", "Context") }} <strong>{{ contextTokensDisplay }}</strong></span>
      <span>{{ text("渠道", "Channel") }} <strong>{{ channelLabel }}</strong></span>
      <span>{{ text("模型来源", "Model source") }} <strong>{{ modelSourceLabel }}</strong></span>
      <span>{{ text("检查", "Checked") }} <strong>{{ checkedAtLabel }}</strong></span>
    </div>

    <div class="cs-next-action-pane">
      <div class="cs-next-action-meter">
        <span>{{ nextActionTitle }}</span>
        <strong>{{ readyComponentCount }}/{{ componentCount }}</strong>
        <progress
          class="cs-readiness-bar"
          :value="readinessValue"
          max="100"
          :aria-label="text('Codex Stack 就绪度', 'Codex Stack readiness')"
        >
          {{ readinessValue }}%
        </progress>
      </div>
      <p>{{ issueCount ? text(`${issueCount} 个组件待处理`, `${issueCount} components need attention`) : text("链路稳定", "Route stable") }}</p>
      <small v-if="nextActionDisabledHelp" class="cs-disabled-help">{{ nextActionDisabledHelp }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import "./codex-stack-dashboard.css";
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
  readinessValue: number;
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
