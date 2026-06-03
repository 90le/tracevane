<template>
  <CodexStackSectionStack class="cs-dashboard-home">
    <CodexStackDashboardRuntimeStrip
      :status-label="statusLabel"
      :status-tone="statusTone"
      :active-service-count="activeServiceCount"
      :service-count="serviceCount"
      :current-model="summary.models.current"
      :codex-route-label="codexRouteLabel"
      :context-tokens-display="contextTokensDisplay"
      :channel-label="channelLabel"
      :checked-at-label="checkedAtLabel"
      :busy="actionBusy"
      :busy-disabled-help="actionBusyDisabledHelp"
      :can-run-mutation="canRunMutation"
      :mutation-disabled-help="mutationDisabledHelp"
      :sync-disabled="syncDisabled"
      :sync-disabled-help="syncDisabledHelp"
      :ready-component-count="readyComponentCount"
      :component-count="summary.components.length"
      :issue-count="issueCount"
      :readiness-value="readinessValue"
      :next-action-title="nextActionTitle"
      :next-action-copy="nextActionCopy"
      :next-action-button="nextActionButton"
      :next-action-requires-mutation="nextActionRequiresMutation"
      :next-action-disabled-help="nextActionDisabledHelp"
      :model-source-label="modelSourceLabel"
      :model-source-help="modelSourceHelp"
      :model-catalog-preview="modelCatalogPreview"
      @primary="emit('primary')"
      @open-section="emit('open-section')"
      @run-check="emit('run-check')"
      @repair="emit('repair')"
      @sync="emit('sync')"
    />

    <div class="cs-dashboard-home-grid">
      <CodexStackChainMap
        :labels="chainMapLabels"
        :overall-tone="statusTone"
        :nodes="chainNodes"
        :gates="chainGates"
        :warnings="chainWarnings"
      />

      <CodexStackServiceGrid
        :services="serviceCards"
        :can-run-mutation="canRunMutation"
        :mutation-disabled-help="mutationDisabledHelp"
        :labels="serviceGridLabels"
        @service-action="(serviceId, action) => emit('service-action', serviceId, action)"
      />
    </div>

    <details class="cs-dashboard-details-panel">
      <summary>
        <span>{{ text("高级诊断", "Advanced diagnostics") }}</span>
        <small>{{ text("运行就绪 / Smoke / 告警", "Readiness / smoke / warnings") }}</small>
      </summary>
      <div class="cs-dashboard-details-body">
        <div class="cs-dashboard-diagnostic-grid">
          <CodexStackRunReadinessPanel
            v-if="summary.runReadiness"
            :readiness="summary.runReadiness"
            :tone="runReadinessTone"
            :actions-disabled="runReadinessActionsDisabled"
            :disabled-label="runReadinessDisabledLabel"
            @check-action="(check) => emit('readiness-check-action', check)"
            @mode-action="(mode) => emit('readiness-mode-action', mode)"
          />

          <CodexStackDiagnosticsPanel
            :warnings="summary.warnings"
            :busy="actionBusy"
            :busy-disabled-help="actionBusyDisabledHelp"
            @run-check="emit('run-check')"
          />
        </div>

        <details class="cs-dashboard-insights-panel">
          <summary>
            <span>{{ text("运行矩阵与组件明细", "Runtime matrix and component details") }}</span>
            <small>{{ text("环境 / Smoke / 组件", "Environment / smoke / components") }}</small>
          </summary>
          <CodexStackDashboardInsights
            :labels="dashboardInsightsLabels"
            :runtime-rows="runtimeSummaryRows"
            :network-policy="networkPolicyCard"
            :smoke-matrix="smokeMatrixCard"
            :components="componentHealthCards"
          />
        </details>
      </div>
    </details>
  </CodexStackSectionStack>
</template>

<script setup lang="ts">
import type {
  CodexStackManualServiceId,
  CodexStackRunReadinessCheck,
  CodexStackRunReadinessMode,
  CodexStackServiceAction,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import CodexStackChainMap from "./CodexStackChainMap.vue";
import type { CodexStackChainGate, CodexStackChainMapLabels, CodexStackChainNode } from "./CodexStackChainMap.vue";
import CodexStackDashboardInsights from "./CodexStackDashboardInsights.vue";
import type {
  CodexStackComponentHealthCard,
  CodexStackDashboardInsightsLabels,
  CodexStackNetworkPolicyCard,
  CodexStackRuntimeSummaryRow,
  CodexStackSmokeMatrixCard,
} from "./CodexStackDashboardInsights.vue";
import CodexStackDashboardRuntimeStrip from "./CodexStackDashboardRuntimeStrip.vue";
import CodexStackDiagnosticsPanel from "./CodexStackDiagnosticsPanel.vue";
import CodexStackRunReadinessPanel from "./CodexStackRunReadinessPanel.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";
import CodexStackServiceGrid from "./CodexStackServiceGrid.vue";
import type { CodexStackServiceCard } from "./CodexStackServiceGrid.vue";
import type { CodexStackTone } from "./codex-stack-view-model";

interface CodexStackServiceGridLabels {
  running: string;
  stopped: string;
  enabled: string;
  systemd: string;
  start: string;
  stop: string;
  restart: string;
  enableAutostart: string;
}

defineProps<{
  summary: CodexStackSummaryPayload;
  statusLabel: string;
  statusTone: CodexStackTone;
  activeServiceCount: number;
  serviceCount: number;
  codexRouteLabel: string;
  contextTokensDisplay: string;
  channelLabel: string;
  checkedAtLabel: string;
  actionBusy: boolean;
  actionBusyDisabledHelp: string;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  syncDisabled: boolean;
  syncDisabledHelp: string;
  readyComponentCount: number;
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
  runReadinessTone: CodexStackTone;
  runReadinessActionsDisabled: boolean;
  runReadinessDisabledLabel: string;
  chainMapLabels: CodexStackChainMapLabels;
  chainNodes: CodexStackChainNode[];
  chainGates: CodexStackChainGate[];
  chainWarnings: string[];
  serviceCards: CodexStackServiceCard[];
  serviceGridLabels: CodexStackServiceGridLabels;
  dashboardInsightsLabels: CodexStackDashboardInsightsLabels;
  runtimeSummaryRows: CodexStackRuntimeSummaryRow[];
  networkPolicyCard: CodexStackNetworkPolicyCard | null;
  smokeMatrixCard: CodexStackSmokeMatrixCard | null;
  componentHealthCards: CodexStackComponentHealthCard[];
}>();

const emit = defineEmits<{
  primary: [];
  "open-section": [];
  "run-check": [];
  repair: [];
  sync: [];
  "readiness-check-action": [check: CodexStackRunReadinessCheck];
  "readiness-mode-action": [mode: CodexStackRunReadinessMode];
  "service-action": [
    serviceId: CodexStackManualServiceId,
    action: Extract<CodexStackServiceAction, "start" | "stop" | "restart" | "enable">,
  ];
}>();

const { text } = useLocalePreference();
</script>
