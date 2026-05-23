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
