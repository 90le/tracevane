<template>
  <section class="page-shell codex-stack-page">
    <CodexStackPageHeader
      :eyebrow="text('CODEX STACK', 'CODEX STACK')"
      :title="text('Codex Stack 管理中心', 'Codex Stack Management Center')"
      :subtitle="text('按“状态判断 → 安装修复 → 模型上游 → Agent 管理 → 日志诊断”的顺序管理 codex-docs 服务。Studio 只做控制面，服务本身保持 systemd 独立运行。', 'Manage codex-docs through status, install/repair, model upstreams, agent management, and diagnostics. Studio stays the control plane while services keep running independently under systemd.')"
      :refresh-label="loading ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh')"
      :refresh-disabled="loading || ccConnectLoading"
      :refresh-disabled-help="refreshDisabledHelp"
      @refresh="loadAll"
    />

    <div
      v-if="notice"
      class="status-banner"
      :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'"
    >
      {{ notice.text }}
    </div>

    <CodexStackCheckOutputDialog
      v-if="checkDialogOpen"
      :output="checkOutput"
      :running="healthCheckRunning"
      :busy-disabled-help="actionBusyDisabledHelp"
      @rerun="runCheck"
      @close="checkDialogOpen = false"
    />

    <CodexStackManagementLockCard
      v-if="summary && !summary.management.enabled"
      :title="text('管理动作未启用', 'Management actions are disabled')"
      :copy="text('安装、修复、保存配置和服务控制需要显式启用。', 'Install, repair, config writes, and service control require explicit enablement.')"
      :action-label="text('启用管理', 'Enable Management')"
      :busy="busy"
      :busy-disabled-help="managementBusyDisabledHelp"
      @enable="enableManagement"
    />

    <CodexStackLoadingCard
      v-if="!summary"
      :message="text('正在读取 Codex 栈状态...', 'Loading Codex Stack status...')"
    />

    <template v-else>
      <CodexStackJobBanner
        v-if="activeJob"
        :title="activeJobTitle"
        :command-label="activeJob.commandLabel"
        :status="activeJob.status"
        :status-label="jobStatusLabel(activeJob.status)"
        :updated-at-label="formatTimestamp(activeJob.updatedAt)"
        :running="isCodexStackJobRunning(activeJob)"
        @open-logs="setWorkspaceSection('logs', focusHintForAction(text('查看后台任务输出', 'Watch background job output'), text('安装、修复或配置动作正在执行；先跟踪日志和结果。', 'An install, repair, or config action is running; track logs and result first.')))"
        @dismiss="activeJob = null"
      />

      <CodexStackModelRibbon
        v-if="activeSection !== 'dashboard'"
        :current-model="summary.models.current || summary.profile.defaultModel || '--'"
        :source-help="modelSourceHelp"
        :source-tone="modelSourceTone"
        :source-label="modelSourceLabel"
        :model-count="modelOptions.length"
        :context-tokens-display="contextTokensDisplay"
        :loading="loading"
        :loading-disabled-help="summaryRefreshDisabledHelp"
        @reload="loadSummary"
      />

      <CodexStackWorkspaceShell
        :sections="navSections"
        :active-section="activeSection"
        :focus-hint="workspaceFocusHint"
        @select="selectWorkspaceSection"
      >
        <template v-if="activeSection === 'dashboard'">
          <CodexStackSectionStack>
            <CodexStackDashboardCommandCenter
              :status-label="statusLabel"
              :status-tone="statusTone"
              :active-service-count="activeServiceCount"
              :service-count="serviceCount"
              :current-model="summary.models.current"
              :codex-route-label="codexRouteLabel"
              :context-tokens-display="contextTokensDisplay"
              :channel-label="channelLabel(summary.installer.channel)"
              :checked-at-label="formatTimestamp(summary.checkedAt)"
              :busy="actionBusy"
              :busy-disabled-help="actionBusyDisabledHelp"
              :can-run-mutation="canRunMutation"
              :mutation-disabled-help="mutationDisabledHelp"
              :sync-disabled="loading || ccConnectLoading"
              :sync-disabled-help="refreshDisabledHelp"
              :ready-component-count="readyComponentCount"
              :component-count="summary.components.length"
              :issue-count="issueCount"
              :readiness-percent="readinessPercent"
              :next-action-title="nextActionTitle"
              :next-action-copy="nextActionCopy"
              :next-action-button="nextActionButton"
              :next-action-requires-mutation="nextActionRequiresMutation"
              :next-action-disabled-help="nextActionDisabledHelp"
              :model-source-label="modelSourceLabel"
              :model-source-help="modelSourceHelp"
              :model-catalog-preview="modelCatalogPreview"
              @primary="nextActionPrimary"
              @open-section="setWorkspaceSection(nextActionSection, focusHintForAction(nextActionTitle, nextActionCopy))"
              @run-check="runCheck"
              @repair="repairRecommended"
              @sync="loadAll"
            />

            <details class="cs-dashboard-details-panel">
              <summary>
                <span>{{ text('高级状态详情', 'Advanced Status Details') }}</span>
                <small>{{ text('技术链路、服务单元、组件健康和健康检查入口默认收起；检查结果会用悬浮窗口展示。', 'Technical chain, service units, component health, and the health-check entry stay collapsed; check results open in a floating dialog.') }}</small>
              </summary>
              <div class="cs-dashboard-details-body">
                <CodexStackRunReadinessPanel
                  v-if="summary.runReadiness"
                  :readiness="summary.runReadiness"
                  :tone="runReadinessTone"
                  :actions-disabled="runReadinessActionsDisabled"
                  :disabled-label="runReadinessDisabledLabel"
                  @check-action="runReadinessCheckAction"
                  @mode-action="runReadinessModeAction"
                />

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
                  @service-action="serviceAction"
                />

                <CodexStackDashboardInsights
                  :labels="dashboardInsightsLabels"
                  :runtime-rows="runtimeSummaryRows"
                  :network-policy="networkPolicyCard"
                  :smoke-matrix="smokeMatrixCard"
                  :components="componentHealthCards"
                />

                <CodexStackDiagnosticsPanel
                  :warnings="summary.warnings"
                  :busy="actionBusy"
                  :busy-disabled-help="actionBusyDisabledHelp"
                  @run-check="runCheck"
                />
              </div>
            </details>
          </CodexStackSectionStack>
        </template>

        <template v-else-if="activeSection === 'install'">
          <CodexStackSectionStack>
            <CodexStackSectionIntro
              :kicker="text('安装', 'Install')"
              :title="text('安装/修复指挥台', 'Install/Repair Command Center')"
              :copy="text('第一次使用先走新手入口；日常异常只按“推荐修复 → 只验证 → 验证并切换”三步。安装参数和高级维护默认收起，只有需要改模型、端口或处理冲突时再打开。', 'First-time users start with the beginner entry. Daily recovery follows Recommended Repair, Verify Only, then Smoke & Attach. Install parameters and advanced maintenance stay collapsed until a model, port, or conflict needs manual handling.')"
            />

            <CodexStackInstallPlanCard
              :highlights="installPlanHighlights"
              :can-run-mutation="canRunMutation"
              :mutation-disabled-help="mutationDisabledHelp"
              @install-full="installFullStack"
              @install-base="installBaseOnly"
              @reinstall-full="reinstallFullStack"
              @repair="repairRecommended"
            />

            <CodexStackInstallShell :busy="Boolean(activeJob && isCodexStackJobRunning(activeJob))">
              <CodexStackRepairBoard
                :can-run-mutation="canRunMutation"
                :mutation-disabled-help="mutationDisabledHelp"
                :can-attach-codex-cpa="canAttachCodexCpa"
                :attach-codex-cpa-help="attachCodexCpaHelp"
                :attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"
                :attach-preflight-items="attachPreflightItems"
                @repair-recommended="repairRecommended"
                @repair-conflicts="repairConflictingUnits"
                @repair-config-only="repairConfigOnly"
                @pause-stack="pauseStack"
                @resume-stack="resumeStack"
                @run-smoke-matrix="runSmokeMatrix"
                @attach-codex-cpa="applyCodexCpaAfterSmoke"
                @restore-official-chatgpt="restoreOfficialChatGpt"
              />

              <details class="cs-install-options-panel">
                <summary>
                  <span>{{ text('安装参数和高级安装策略', 'Install Parameters and Advanced Strategy') }}</span>
                  <small>{{ text('一般不用改；需要换模型、端口、上游或强制重装时再打开。', 'Usually leave this closed; open only for model, port, upstream, or reinstall changes.') }}</small>
                </summary>
                <div class="cs-install-options-body">
                  <CodexStackInstallConfigPanel
                    :form="installForm"
                    :model-options="modelOptions"
                    :model-source-label="modelSourceLabel"
                    :context-tokens-disabled="installContextTokensDisabled"
                    :context-tokens-disabled-help="installContextTokensDisabledHelp"
                    @update-field="updateInstallFormField"
                  />

                  <CodexStackInstallStrategyPanel
                    :components="installComponentStrategies"
                    :can-run-mutation="canRunMutation"
                    :mutation-disabled-help="mutationDisabledHelp"
                    @set-component-mode="setComponentMode"
                    @install-full="installFullStack"
                    @install-base="installBaseOnly"
                    @reinstall-full="reinstallFullStack"
                    @repair="repairRecommended"
                  />
                </div>
              </details>
            </CodexStackInstallShell>
          </CodexStackSectionStack>
        </template>

        <template v-else-if="activeSection === 'cc-connect'">
          <CodexStackSectionStack>
            <CodexStackCcConnectCommandBar
              :installed="summary.ccConnect.installed"
              :configured="summary.ccConnect.configured"
              :binding-present="summary.ccConnect.bindingPresent"
              :finalizer-available="summary.ccConnect.finalizerAvailable"
              :project-name="primaryCcConnectProjectName"
              :provider-count="ccConnectProviderDraftCount"
              :project-count="ccConnectProjectDraftCount"
              :has-structured-changes="hasCcConnectStructuredChanges"
              :has-raw-changes="hasCcConnectRawChanges"
              :can-run-mutation="canRunMutation"
              :mutation-disabled-help="mutationDisabledHelp"
              @save-structured="saveCcConnectStructured"
              @save-raw="saveCcConnectRaw"
            />

            <CodexStackCcConnectStage
              :panes="agentPanes"
              :active-pane="activeAgentPane"
              :projects="ccConnectProjectRailItems"
              :selected-project-id="selectedProjectDraft?.id || ''"
              :busy="busy"
              :busy-disabled-help="busyDisabledHelp"
              @set-active-pane="setActiveAgentPane"
              @select-project="selectCcConnectProject"
              @add-project="addCcConnectProject"
            >
              <template v-if="activeAgentPane === 'projects'">
                <CodexStackCcConnectProjectPanel
                  :project="selectedProjectDraft"
                  :project-summary="selectedProjectSummary"
                  :presets="projectPresetCards"
                  :platform-templates="platformTemplates"
                  :model-options="modelOptions"
                  :loading="ccConnectLoading && !ccConnectConfig"
                  :busy="busy"
                  :busy-disabled-help="busyDisabledHelp"
                  @sync-default-model="applyDefaultModelToCcConnectProjects"
                  @remove-project="removeCcConnectProject"
                  @add-preset="addCcConnectProjectPreset"
                  @add-project="addCcConnectProject"
                  @update-project-field="updateCcConnectProjectField"
                  @update-agent-option="updateCcConnectAgentOption"
                  @add-platform="addPlatformToSelectedProject"
                  @remove-platform="removePlatformFromSelectedProject"
                  @update-platform-type="updateCcConnectPlatformType"
                  @update-platform-option="updateCcConnectPlatformOption"
                  @add-platform-option="addCcConnectPlatformOptionById"
                  @remove-platform-option="removeCcConnectPlatformOptionById"
                />
              </template>

              <template v-else-if="activeAgentPane === 'providers'">
                <CodexStackCcConnectProviderPanel
                  :language="ccConnectLanguageDraft"
                  :providers="ccConnectProviderDrafts"
                  :compact-proxy-base-url="compactProxyBaseUrl"
                  :loading="ccConnectLoading && !ccConnectConfig"
                  :busy="busy"
                  :busy-disabled-help="busyDisabledHelp"
                  @update-language="updateCcConnectLanguage"
                  @update-provider-field="updateCcConnectProviderField"
                  @ensure-cpa-provider="ensureCpaProviderDraft"
                  @add-provider="addCcConnectProvider"
                  @remove-provider="removeCcConnectProvider"
                />
              </template>

              <template v-else-if="activeAgentPane === 'setup'">
                <CodexStackCcConnectSetupPanel
                  :commands="ccConnectSetupCommands"
                  :busy="busy"
                  :busy-disabled-help="busyDisabledHelp"
                  :can-run-mutation="canRunMutation"
                  :mutation-disabled-help="mutationDisabledHelp"
                  :can-finalize="summary.ccConnect.canFinalize"
                  @copy-setup="copySetupCommand"
                  @finalize="finalizeCcConnect"
                />
              </template>

              <template v-else>
                <CodexStackCcConnectRawPanel
                  :raw-draft="ccConnectRawDraft"
                  :has-raw-changes="hasCcConnectRawChanges"
                  :can-run-mutation="canRunMutation"
                  :mutation-disabled-help="mutationDisabledHelp"
                  @update-raw="updateCcConnectRawDraft"
                  @save-raw="saveCcConnectRaw"
                />
              </template>
            </CodexStackCcConnectStage>
          </CodexStackSectionStack>
        </template>

        <template v-else-if="activeSection === 'settings'">
          <CodexStackSectionStack>
            <CodexStackSectionIntro
              :kicker="text('模型与上游', 'Models and Upstreams')"
              :title="text('统一模型、端口与上游配置', 'Unified Model, Port, and Upstream Config')"
              :copy="text('这里是所有模型选择器的来源。优先读取本地 Compact /v1/models；不可达时显示配置回退列表。cc-connect Provider 推荐统一指向本地 Compact。', 'This is the source for every model selector. It prefers local Compact /v1/models and falls back to parsed config when unavailable. cc-connect providers should point to local Compact.')"
              :chips="settingsSectionIntroChips"
            />

            <CodexStackModelCatalogCard
              :models="modelOptions"
              :current-model="summary.models.current"
              :source-help="modelSourceHelp"
              :loading="loading"
              :loading-disabled-help="summaryRefreshDisabledHelp"
              @reload="loadSummary"
            />

            <CodexStackUpstreamMap
              :default-model="configForm.defaultModel || summary.models.current || '--'"
              :compact-proxy-base-url="compactProxyBaseUrl"
              :provider-name="canonicalCcConnectProvider.name"
              :provider-base-url="canonicalCcConnectProvider.baseUrl"
              :provider-model="canonicalCcConnectProvider.model"
            />

            <CodexStackResponsiveGrid>
              <CodexStackRuntimeConfigCard
                :form="configForm"
                :model-options="modelOptions"
                :context-tokens-disabled="configContextTokensDisabled"
                :context-tokens-disabled-help="configContextTokensDisabledHelp"
                :restart-required-units="restartRequiredUnits"
                :impact-items="configImpactItems"
                :codex-route-active="summary.codexRoute.active"
                :codex-route-current-model="summary.codexRoute.currentModel"
                :codex-route-cpa-target-model="summary.codexRoute.cpaTargetModel"
                :codex-route-official-model="summary.codexRoute.officialModel"
                :can-attach-codex-cpa="canAttachCodexCpa"
                :attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"
                :can-run-mutation="canRunMutation"
                :has-changes="hasConfigPatchChanges"
                :mutation-disabled-help="mutationDisabledHelp"
                @update-field="updateConfigFormField"
                @save="saveConfigPatch"
                @save-and-attach-cpa="saveConfigThenAttachCpa"
                @save-and-force-cpa="saveConfigThenForceCpa"
                @save-and-use-official="saveConfigThenUseOfficial"
              />

              <CodexStackEnvironmentReferenceCard
                :home-dir="summary.homeDir"
                :profile-path="summary.profilePath"
                :installer-root="summary.installer.root"
                :installer-kind="summary.installer.kind"
                :auto-setup-script="summary.installer.scripts.autoSetup"
                :health-check-script="summary.installer.scripts.healthCheck"
                :finalizer-script="summary.installer.scripts.ccConnectFinalizer"
                :proxy-key-masked="summary.secrets.cpaProxyKey.masked"
                :codex-auth-status="codexAuthStatus"
                :context-mode="summary.context.mode"
                :context-tokens-display="contextTokensDisplay"
                :cpa-dashboard-enabled="summary.cpaManagement.controlPanelEnabled"
                :cpa-dashboard-url="summary.cpaManagement.dashboardUrl"
                :missing-files="summary.installer.missingFiles"
              />
            </CodexStackResponsiveGrid>
          </CodexStackSectionStack>
        </template>

        <template v-else-if="activeSection === 'logs'">
          <CodexStackSectionStack>
            <CodexStackSectionIntro
              :kicker="text('日志', 'Logs')"
              :title="text('控制台与日志诊断', 'Console and Log Diagnostics')"
              :copy="text('按“选服务 → 定范围 → 读取日志”排查。任务执行时先看上方任务输出，再决定是否切到完整上下文。', 'Debug with Pick Service, Choose Scope, then Load Logs. When a job is running, read the job output first before switching to deeper context.')"
            />

            <CodexStackLogConsole
              v-model:selected-service="selectedLogService"
              v-model:mode="logLineMode"
              v-model:auto-refresh="logAutoRefresh"
              :services="logServices"
              :options="logLineOptions"
              :mode-help="logModeHelp"
              :requested-lines="logLineLimit"
              :meta="logMeta"
              :fetched-at-label="logFetchedAtLabel"
              :output="logOutput"
              :refreshing="logRefreshing"
              :labels="logConsoleLabels"
              :refreshing-disabled-help="logRefreshingDisabledHelp"
              @load="loadLogs"
            />
          </CodexStackSectionStack>
        </template>
      </CodexStackWorkspaceShell>

      <CodexStackJobProgressPanel
        v-if="activeJob"
        surface="panel"
        :job="activeJob"
        :title="activeJobTitle"
        :status-label="jobStatusLabel(activeJob.status)"
        :steps="jobProgressSteps"
        :progress-percent="jobProgressPercent"
        :running="isCodexStackJobRunning(activeJob)"
        :empty-log="text('等待输出...', 'Waiting for output...')"
        @dismiss="activeJob = null"
      />
    </template>

    <datalist id="cc-platform-options">
      <option value="dmwork">dmwork</option>
      <option value="octo">octo</option>
      <option value="feishu">feishu</option>
      <option value="weixin">weixin</option>
      <option value="wecom">wecom</option>
      <option value="dingtalk">dingtalk</option>
      <option value="telegram">telegram</option>
    </datalist>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { confirm } from "../../composables/useConfirmDialog";
import { copyTextToClipboard } from "../../shared/clipboard";
import { useLocalePreference } from "../../shared/locale";
import {
  CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS,
} from "../../../../../types/codex-stack";
import type {
  CcConnectConfig,
  CcConnectPlatform,
  CcConnectProject,
  CcConnectProvider,
  CodexStackChannel,
  CodexStackComponentId,
  CodexStackComponentStatus,
  CodexStackComponentSummary,
  CodexStackConfigPatchRequest,
  CodexStackJob,
  CodexStackLogResponse,
  CodexStackRepairAction,
  CodexStackRunReadinessCheck,
  CodexStackRunReadinessCheckStatus,
  CodexStackRunReadinessMode,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackSmokeMatrixResult,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";
import {
  controlCodexStackService,
  enableCodexStackManagement,
  fetchCcConnectConfig,
  fetchCodexStackJob,
  fetchCodexStackLogs,
  fetchCodexStackSummary,
  finalizeCodexStackCcConnect,
  patchCcConnectConfig,
  patchCodexStackConfig,
  runCodexStackCheck,
  startCodexStackInstall,
  startCodexStackRepair,
} from "./api";
import {
  buildCodexStackRepairActions,
  codexStackComponentTone,
  codexStackStatusTone,
  countActiveServices,
  DEFAULT_NO_PROXY,
  isCodexStackJobRunning,
  normalizeProxyPolicy,
} from "./codex-stack-view-model";
import type { CodexStackTone } from "./codex-stack-view-model";
import {
  normalizeCodexStackRunReadinessCheck,
  normalizeCodexStackRunReadinessMode,
  resolveCodexStackRunReadinessAction,
  resolveCodexStackRunReadinessModeAction,
} from "./readiness-action";
import CodexStackDashboardInsights from "./CodexStackDashboardInsights.vue";
import CodexStackDashboardCommandCenter from "./CodexStackDashboardCommandCenter.vue";
import type {
  CodexStackComponentHealthCard,
  CodexStackNetworkPolicyCard,
  CodexStackRuntimeSummaryRow,
  CodexStackSmokeMatrixCard,
} from "./CodexStackDashboardInsights.vue";
import CodexStackDiagnosticsPanel from "./CodexStackDiagnosticsPanel.vue";
import CodexStackChainMap from "./CodexStackChainMap.vue";
import type { CodexStackChainGate, CodexStackChainNode } from "./CodexStackChainMap.vue";
import CodexStackCheckOutputDialog from "./CodexStackCheckOutputDialog.vue";
import CodexStackEnvironmentReferenceCard from "./CodexStackEnvironmentReferenceCard.vue";
import CodexStackCcConnectCommandBar from "./CodexStackCcConnectCommandBar.vue";
import type {
  CodexStackCcConnectPaneId,
  CodexStackCcConnectPaneOption,
  CodexStackCcConnectProjectRailItem,
} from "./CodexStackCcConnectRail.vue";
import CodexStackCcConnectStage from "./CodexStackCcConnectStage.vue";
import CodexStackCcConnectProviderPanel from "./CodexStackCcConnectProviderPanel.vue";
import type {
  CodexStackCcConnectProviderDraft,
  CodexStackCcConnectProviderField,
} from "./CodexStackCcConnectProviderPanel.vue";
import CodexStackCcConnectProjectPanel from "./CodexStackCcConnectProjectPanel.vue";
import type {
  CodexStackCcConnectAgentOptionField,
  CodexStackCcConnectPlatformDraft,
  CodexStackCcConnectPlatformOptionDraft,
  CodexStackCcConnectPlatformOptionField,
  CodexStackCcConnectPlatformTemplate,
  CodexStackCcConnectPlatformTemplateId,
  CodexStackCcConnectProjectDraft,
  CodexStackCcConnectProjectField,
  CodexStackCcConnectProjectPresetCard,
  CodexStackCcConnectProjectPresetId,
} from "./CodexStackCcConnectProjectPanel.vue";
import CodexStackCcConnectRawPanel from "./CodexStackCcConnectRawPanel.vue";
import CodexStackCcConnectSetupPanel from "./CodexStackCcConnectSetupPanel.vue";
import type { CodexStackCcConnectSetupPlatform } from "./CodexStackCcConnectSetupPanel.vue";
import CodexStackInstallPlanCard from "./CodexStackInstallPlanCard.vue";
import CodexStackInstallConfigPanel from "./CodexStackInstallConfigPanel.vue";
import type {
  CodexStackInstallConfigDraft,
  CodexStackInstallConfigField,
} from "./CodexStackInstallConfigPanel.vue";
import CodexStackInstallStrategyPanel from "./CodexStackInstallStrategyPanel.vue";
import CodexStackInstallShell from "./CodexStackInstallShell.vue";
import type {
  CodexStackComponentInstallMode,
  CodexStackInstallComponentStrategy,
} from "./CodexStackInstallStrategyPanel.vue";
import CodexStackJobBanner from "./CodexStackJobBanner.vue";
import CodexStackJobProgressPanel from "./CodexStackJobProgressPanel.vue";
import CodexStackLoadingCard from "./CodexStackLoadingCard.vue";
import CodexStackLogConsole from "./CodexStackLogConsole.vue";
import CodexStackManagementLockCard from "./CodexStackManagementLockCard.vue";
import CodexStackModelCatalogCard from "./CodexStackModelCatalogCard.vue";
import CodexStackModelRibbon from "./CodexStackModelRibbon.vue";
import CodexStackPageHeader from "./CodexStackPageHeader.vue";
import CodexStackRepairBoard from "./CodexStackRepairBoard.vue";
import type { CodexStackAttachPreflightItem } from "./CodexStackRepairBoard.vue";
import CodexStackResponsiveGrid from "./CodexStackResponsiveGrid.vue";
import CodexStackRuntimeConfigCard from "./CodexStackRuntimeConfigCard.vue";
import type {
  CodexStackRuntimeConfigDraft,
  CodexStackRuntimeConfigField,
  CodexStackRuntimeConfigImpactItem,
  CodexStackRuntimeContextMode,
} from "./CodexStackRuntimeConfigCard.vue";
import type {
  CodexStackLogLineMode,
  CodexStackLogLineOption,
  CodexStackLogServiceOption,
} from "./CodexStackLogConsole.vue";
import CodexStackRunReadinessPanel from "./CodexStackRunReadinessPanel.vue";
import CodexStackSectionIntro from "./CodexStackSectionIntro.vue";
import type { CodexStackSectionIntroChip } from "./CodexStackSectionIntro.vue";
import type { CodexStackSectionId, CodexStackSectionNavItem } from "./CodexStackSectionNav.vue";
import CodexStackSectionStack from "./CodexStackSectionStack.vue";
import CodexStackServiceGrid from "./CodexStackServiceGrid.vue";
import CodexStackUpstreamMap from "./CodexStackUpstreamMap.vue";
import CodexStackWorkspaceShell from "./CodexStackWorkspaceShell.vue";
import type { CodexStackWorkspaceFocusHint } from "./CodexStackWorkspaceShell.vue";

const { text } = useLocalePreference();

type SectionId = CodexStackSectionId;
type AgentPaneId = CodexStackCcConnectPaneId;
type LogLineMode = CodexStackLogLineMode;
type ComponentInstallMode = CodexStackComponentInstallMode;
type AgentProjectPreset = CodexStackCcConnectProjectPresetId;
type PlatformTemplateId = CodexStackCcConnectPlatformTemplateId;
type ContextMode = CodexStackRuntimeContextMode;
type CcConnectProviderDraft = CodexStackCcConnectProviderDraft;
type CcConnectPlatformOptionDraft = CodexStackCcConnectPlatformOptionDraft;
type CcConnectPlatformDraft = CodexStackCcConnectPlatformDraft;
type CcConnectProjectDraft = CodexStackCcConnectProjectDraft;

type ApplySummaryOptions = {
  preserveDirtyConfigDraft?: boolean;
  preserveDirtyInstallDraft?: boolean;
};

type CcConnectLoadOptions = {
  preserveDirtyDrafts?: boolean;
};

const summary = ref<CodexStackSummaryPayload | null>(null);
const ccConnectConfig = ref<CcConnectConfig | null>(null);
const ccConnectRawDraft = ref("");
const ccConnectLanguageDraft = ref("zh");
const ccConnectProviderDrafts = ref<CcConnectProviderDraft[]>([]);
const ccConnectProjectDrafts = ref<CcConnectProjectDraft[]>([]);
const ccConnectStructuredBaseline = ref("");
const activeJob = ref<CodexStackJob | null>(null);
const checkOutput = ref("");
const checkDialogOpen = ref(false);
const healthCheckRunning = ref(false);
const logOutput = ref("");
const loading = ref(false);
const ccConnectLoading = ref(false);
const busy = ref(false);
const restartRequiredUnits = ref<CodexStackServiceId[]>([]);
const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);
const activeSection = ref<SectionId>("dashboard");
const workspaceFocusHint = ref<CodexStackWorkspaceFocusHint | null>(null);
const activeAgentPane = ref<AgentPaneId>("projects");
const selectedProjectDraftId = ref("");
const selectedLogService = ref<CodexStackServiceId>("cli-proxy-api.service");
const primaryServiceIds: CodexStackServiceId[] = [
  "cli-proxy-api.service",
  "cpa-compact-proxy.service",
  "cc-connect.service",
];
const logServices = computed<CodexStackLogServiceOption[]>(() => {
  const services: CodexStackLogServiceOption[] = [
    { id: "cli-proxy-api.service", label: text("CPA", "CPA"), tone: "neutral", rawState: "--" },
    { id: "cpa-compact-proxy.service", label: text("Compact", "Compact"), tone: "neutral", rawState: "--" },
    { id: "cc-connect.service", label: text("cc-connect", "cc-connect"), tone: "neutral", rawState: "--" },
    { id: "codex-stack-watchdog.timer", label: text("后台守护", "Background Watchdog"), tone: "neutral", rawState: "--" },
  ];
  
  if (summary.value) {
    return services.map((service) => {
      const summaryService = summary.value!.services.find((s) => s.id === service.id);
      if (summaryService) {
        return {
          ...service,
          tone: summaryService.active ? "sage" : "danger",
          rawState: `${summaryService.rawActiveState} / ${summaryService.rawEnabledState}`,
        };
      }
      return service;
    });
  }
  return services;
});
const logMeta = ref<CodexStackLogResponse | null>(null);
const logLineMode = ref<LogLineMode>("balanced");
const logAutoRefresh = ref(false);
const logRefreshing = ref(false);
let pollTimer: number | null = null;
let logPollTimer: number | null = null;
let logRequestInFlight = false;
let queuedLogRequest: { serviceId: CodexStackServiceId; silent: boolean } | null = null;
let draftIdCounter = 0;

const installForm = reactive<CodexStackInstallConfigDraft & { skipComponents: string[]; forceComponents: string[] }>({
  model: "kimi-k2.6",
  contextMode: "default" as ContextMode,
  contextWindowTokens: 1050000,
  cpaPort: 18795,
  compactPort: 18796,
  cpaKey: "",
  upstreamBaseUrl: "",
  upstreamApiKey: "",
  providerProxyUrl: "",
  noProxy: DEFAULT_NO_PROXY,
  skipNpm: false,
  skipCcConnect: false,
  noStart: false,
  skipExisting: false,
  forceReinstall: false,
  skipComponents: [] as string[],
  forceComponents: [] as string[],
  channel: "dmwork" as CodexStackChannel,
});

function updateInstallFormField(field: CodexStackInstallConfigField, value: string | number | boolean): void {
  switch (field) {
    case "contextWindowTokens":
    case "cpaPort":
    case "compactPort":
      installForm[field] = Number(value) || 0;
      return;
    case "skipNpm":
    case "skipCcConnect":
    case "noStart":
    case "skipExisting":
    case "forceReinstall":
      installForm[field] = Boolean(value);
      return;
    case "contextMode":
      installForm.contextMode = value === "codex-1m" || value === "custom" ? value : "default";
      return;
    case "channel":
      installForm.channel = value === "official" || value === "octo" ? value : "dmwork";
      return;
    default:
      installForm[field] = String(value);
  }
}

const configForm = reactive<CodexStackRuntimeConfigDraft>({
  defaultModel: "kimi-k2.6",
  contextMode: "default",
  contextWindowTokens: 1050000,
  cpaPort: 18795,
  compactPort: 18796,
  ccConnectProject: "main",
  cpaProxyKey: "",
  upstreamBaseUrl: "",
  upstreamApiKey: "",
  providerProxyUrl: "",
  noProxy: DEFAULT_NO_PROXY,
});

function updateConfigFormField(field: CodexStackRuntimeConfigField, value: string | number): void {
  switch (field) {
    case "contextWindowTokens":
    case "cpaPort":
    case "compactPort":
      configForm[field] = Number(value) || 0;
      return;
    case "contextMode":
      configForm.contextMode = value === "codex-1m" || value === "custom" ? value : "default";
      return;
    default:
      configForm[field] = String(value);
  }
}

const SMOKE_MATRIX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUIRED_CPA_SMOKE_CHECKS = CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS;

const serviceCatalog: Record<
  CodexStackServiceId,
  {
    labelKey: [string, string];
    blurbKey: [string, string];
  }
> = {
  "cli-proxy-api.service": {
    labelKey: ["CPA", "CPA"],
    blurbKey: ["Codex Proxy API 服务", "Codex Proxy API service"],
  },
  "cli-proxy-api-healthcheck.timer": {
    labelKey: ["旧巡检", "Legacy Healthcheck"],
    blurbKey: ["旧版 CPA 巡检定时器，应保持停用", "Legacy CPA healthcheck timer; should stay disabled"],
  },
  "cpa-compact-proxy.service": {
    labelKey: ["Compact", "Compact"],
    blurbKey: ["Compact 代理转发服务", "Compact proxy forwarding service"],
  },
  "cc-connect.service": {
    labelKey: ["cc-connect", "cc-connect"],
    blurbKey: ["即时通讯桥接服务", "Instant messaging bridge service"],
  },
  "codex-stack-watchdog.timer": {
    labelKey: ["Watchdog", "Watchdog"],
    blurbKey: ["周期巡检定时器", "Periodic watchdog timer"],
  },
};

const canMutate = computed(() => summary.value?.management.enabled === true);
const jobRunning = computed(() => activeJob.value ? isCodexStackJobRunning(activeJob.value) : false);
const actionBusy = computed(() => busy.value || jobRunning.value);
const canRunMutation = computed(() => canMutate.value && !busy.value && !jobRunning.value);
const statusTone = computed(() => codexStackStatusTone(summary.value?.overallStatus || "needs-setup"));
const statusLabel = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  const labels: Record<string, string> = {
    ready: text("运行就绪", "Ready"),
    "needs-setup": text("需要安装", "Needs Setup"),
    degraded: text("部分异常", "Degraded"),
    failed: text("运行失败", "Failed"),
    "binding-required": text("等待 cc-connect 绑定", "Binding Required"),
    "running-action": text("操作执行中", "Action Running"),
  };
  return labels[status] || status;
});
const readyComponentCount = computed(
  () => summary.value?.components.filter((component) => component.status === "ok").length || 0,
);
const issueCount = computed(
  () => summary.value?.components.filter((component) => component.status !== "ok").length || 0,
);
const readinessPercent = computed(() => {
  const total = summary.value?.components.length || 1;
  return `${Math.round((readyComponentCount.value / total) * 100)}%`;
});
const runReadinessTone = computed<CodexStackTone>(() => {
  const level = summary.value?.runReadiness.level || "blocked";
  if (level === "ready") return "sage";
  if (level === "attention") return "accent";
  return "danger";
});
const runReadinessActionsDisabled = computed(() => busy.value || jobRunning.value);
const runReadinessDisabledLabel = computed(() => {
  if (jobRunning.value) {
    return text("任务执行中，先看日志", "Job running; view logs first");
  }
  if (busy.value) {
    return text("操作进行中", "Action in progress");
  }
  return "";
});
const actionBusyDisabledHelp = computed(() => {
  if (jobRunning.value) return text("已有后台任务执行中，先查看日志并等待完成。", "A background job is running; view logs and wait for it to finish.");
  if (busy.value) return text("当前操作仍在进行中。", "The current action is still in progress.");
  return "";
});
const summaryRefreshDisabledHelp = computed(() => (
  loading.value ? text("状态正在刷新中，请等待本轮读取完成。", "Status is refreshing; wait for this read to finish.") : ""
));
const refreshDisabledHelp = computed(() => {
  if (loading.value && ccConnectLoading.value) return text("状态和 Agent 配置正在同步，请等待完成后再刷新。", "Status and Agent config are syncing; wait for them to finish before refreshing.");
  if (loading.value) return summaryRefreshDisabledHelp.value;
  if (ccConnectLoading.value) return text("Agent 配置正在同步，请等待完成后再刷新。", "Agent config is syncing; wait for it to finish before refreshing.");
  return "";
});
const modelSourceTone = computed<CodexStackTone>(() => {
  if (summary.value?.models.live) return "sage";
  return summary.value?.models.source === "config" ? "accent" : "neutral";
});
const modelSourceLabel = computed(() => {
  const source = summary.value?.models.source || "fallback";
  if (source === "live") return text("来自 CPA /v1/models", "From CPA /v1/models");
  if (source === "config") return text("使用本地配置回退", "Using config fallback");
  return text("使用默认回退", "Using default fallback");
});
const modelSourceHelp = computed(() => {
  const models = summary.value?.models;
  if (!models) return text("正在读取模型列表。", "Loading model catalog.");
  if (models.live) {
    return text(
      `已连接 ${models.endpoint}，模型选择器会跟随 CPA 实际可用列表。`,
      `Connected to ${models.endpoint}; selectors follow the actual CPA model catalog.`,
    );
  }
  return text(
    `无法读取 ${models.endpoint}，当前使用本地配置回退。原因：${models.error || "未知"}`,
    `Could not read ${models.endpoint}; using local config fallback. Reason: ${models.error || "unknown"}`,
  );
});
const modelOptions = computed(() => Array.from(new Set([
  ...(summary.value?.models.available || []),
  "kimi-k2.6",
  "glm-5.1",
  "gpt-5.5",
])));
const modelCatalogPreview = computed(() => modelOptions.value.slice(0, 6));
const codexProviderCheck = computed(() => (
  summary.value?.runReadiness.checks.find((check) => check.id === "codex-provider") || null
));
const codexRouteLabel = computed(() => {
  const route = summary.value?.codexRoute.active;
  if (route === "cpa") return text("CPA 已接入", "CPA attached");
  if (route === "official-chatgpt") return text("官方 GPT 路径", "Official GPT route");
  const status = codexProviderCheck.value?.status;
  if (status === "pass") return text("CPA 已接入", "CPA attached");
  if (status === "fail") return text("CPA 接入异常", "CPA route blocked");
  return text("官方 GPT 路径", "Official GPT route");
});
const settingsSectionIntroChips = computed<CodexStackSectionIntroChip[]>(() => [
  { label: modelSourceLabel.value, variant: "status", tone: modelSourceTone.value },
  { label: summary.value?.models.endpoint || "--", variant: "info" },
]);
const activeRecommendation = computed(() => summary.value?.recommendation || null);
const navSections = computed<CodexStackSectionNavItem[]>(() => {
  const current = summary.value;
  const recommendedSection = activeRecommendation.value?.section || "dashboard";
  const nextLabel = text("下一步", "Next");
  const componentIssues = current?.components.filter((component) => component.status !== "ok").length || 0;
  const warningsCount = current?.warnings.length || 0;
  const policy = current ? normalizeProxyPolicy(current.proxyPolicy) : null;
  const matrix = current?.profile.lastSmokeMatrix;
  const targetModel = current?.profile.defaultModel || current?.models.current || current?.models.defaultModel || "";
  const settingsNeedsReview = Boolean(current && (
    !current.models.live
    || !policy?.noProxyLoopbackReady
    || !isSmokeMatrixFreshAndComplete(matrix, targetModel)
  ));
  const ccConnectNeedsReview = Boolean(current?.ccConnect.installed && (
    !current.ccConnect.bindingPresent
    || !current.ccConnect.configured
    || !current.ccConnect.socketPresent
  ));
  return [
    {
      id: "dashboard" as const,
      label: text("控制台", "Console"),
      icon: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
      meta: current ? statusLabel.value : text("读取中", "Loading"),
      badge: current?.runReadiness.level === "ready" ? text("OK", "OK") : runReadinessLevelShortLabel(current?.runReadiness.level),
      tone: runReadinessTone.value,
      recommended: recommendedSection === "dashboard",
      recommendedLabel: nextLabel,
    },
    {
      id: "install" as const,
      label: text("安装/修复", "Install/Repair"),
      icon: "M12 3 4 8v8c0 4.42 3.58 8 8 8s8-3.58 8-8V8l-8-5Zm1 13h3l-4 4-4-4h3V9h2v7Z",
      meta: componentIssues
        ? text(`${componentIssues} 个组件待处理`, `${componentIssues} components need work`)
        : text("组件完整", "Components complete"),
      badge: componentIssues ? String(componentIssues) : text("OK", "OK"),
      tone: componentIssues ? "accent" : "sage",
      recommended: recommendedSection === "install",
      recommendedLabel: nextLabel,
    },
    {
      id: "cc-connect" as const,
      label: text("Agent", "Agents"),
      icon: "M6 7h12v10H6zM4 5v14h16V5H4Zm4 4h8v2H8V9Zm0 4h5v2H8v-2Z",
      meta: current?.ccConnect.bindingPresent
        ? text("平台已绑定", "Platform bound")
        : current?.ccConnect.installed
          ? text("等待绑定", "Binding pending")
          : text("未安装", "Not installed"),
      badge: current?.ccConnect.bindingPresent ? text("OK", "OK") : text("待", "Todo"),
      tone: ccConnectNeedsReview ? "accent" : current?.ccConnect.bindingPresent ? "sage" : "neutral",
      recommended: recommendedSection === "cc-connect",
      recommendedLabel: nextLabel,
    },
    {
      id: "settings" as const,
      label: text("模型上游", "Models"),
      icon: "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 13.9 2h-3.8a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
      meta: current?.models.live
        ? text("模型目录在线", "Model catalog live")
        : text("使用配置回退", "Using config fallback"),
      badge: settingsNeedsReview ? text("查", "Check") : text("OK", "OK"),
      tone: settingsNeedsReview ? "accent" : "sage",
      recommended: recommendedSection === "settings",
      recommendedLabel: nextLabel,
    },
    {
      id: "logs" as const,
      label: text("日志", "Logs"),
      icon: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h10V8H7Zm0 4v2h10v-2H7Z",
      meta: activeJob.value
        ? `${activeJob.value.commandLabel} · ${jobStatusLabel(activeJob.value.status)}`
        : warningsCount ? text(`${warningsCount} 条告警`, `${warningsCount} warnings`) : text("轻量预览", "Light preview"),
      badge: activeJob.value ? text("跑", "Run") : warningsCount ? String(warningsCount) : "",
      tone: activeJob.value ? "accent" : warningsCount ? "accent" : "neutral",
      recommended: recommendedSection === "logs",
      recommendedLabel: nextLabel,
    },
  ];
});
const nextActionSection = computed<SectionId>(() => {
  return activeRecommendation.value?.section || "dashboard";
});
const nextActionTitle = computed(() => {
  switch (activeRecommendation.value?.kind) {
    case "run-check":
      return text("运行健康检查确认状态", "Run a health check to confirm");
    case "bind-cc-connect":
      return text("完成 cc-connect 绑定", "Complete cc-connect binding");
    case "watch-job":
      return text("查看后台任务输出", "Watch background job output");
    case "repair":
      return text("执行推荐修复", "Run recommended repair");
    case "review-proxy":
      return text("检查系统代理与国内直连", "Review proxy and domestic direct access");
    case "review-smoke":
      return text("重新验证模型矩阵", "Recheck the model smoke matrix");
    default:
      return text("选择安装范围并开始", "Choose install scope and start");
  }
});
const nextActionCopy = computed(() => {
  switch (activeRecommendation.value?.kind) {
    case "run-check":
      return text("服务已就绪，建议定期运行健康检查或查看日志。", "Services are ready; run checks or inspect logs when needed.");
    case "bind-cc-connect":
      return text("cc-connect 已安装但还需要平台绑定或收尾。", "cc-connect is installed but still needs platform binding or finalization.");
    case "watch-job":
      return text("安装或修复正在执行，先跟踪输出和结果。", "An install or repair is running; track output and result first.");
    case "repair":
      return text("有组件未运行或端点不可达，推荐先执行修复。", "Some components are stopped or unreachable; run repair first.");
    case "review-proxy":
      if (activeRecommendation.value?.reasonCodes.includes("no-proxy-loopback-missing")) {
        return text(
          "先补齐 NO_PROXY 的 localhost、127.0.0.1 和 ::1，避免系统代理或 VPN 网卡/TUN 模式截获本机 CPA/Compact 请求。",
          "First add localhost, 127.0.0.1, and ::1 to NO_PROXY so a system proxy or VPN TUN mode cannot capture local CPA/Compact calls.",
        );
      }
      return text("检测到系统代理，但 CPA provider 仍是 direct。国内网关应直连；若 TUN 模式劫持流量，请在模型上游页检查代理和 NO_PROXY。", "A system proxy is present while CPA providers are direct. Domestic gateways should stay direct; if TUN mode hijacks traffic, review proxy and NO_PROXY in Models.");
    case "review-smoke":
      if (activeRecommendation.value?.reasonCodes.includes("smoke-matrix-stale")) {
        return text(
          "上次目标模型矩阵已超过 24 小时；先重新只验证，避免把过期结果当成当前 CPA 可用状态。",
          "The last target-model matrix is older than 24 hours. Run Verify Only again so stale results are not treated as current CPA readiness.",
        );
      }
      return text("上次目标模型矩阵失败，Codex 不会自动切到 CPA。先在安装页重新跑 smoke gate。", "The last target-model matrix failed, so Codex will not attach to CPA. Re-run the smoke gate from Install.");
    default:
      return text("首次使用从 DMWork 增强版开始；已有环境可选择跳过或强制重装组件。", "Start with the DMWork enhanced channel; existing environments can skip or force reinstall components.");
  }
});
const nextActionButton = computed(() => {
  switch (activeRecommendation.value?.primaryAction) {
    case "run-check":
      return text("运行检查", "Run Check");
    case "open-cc-connect":
      return text("去绑定", "Bind Now");
    case "open-logs":
      return text("看日志", "View Logs");
    case "repair-recommended":
      return text("自动修复", "Auto Repair");
    case "open-settings":
      return text("检查模型上游", "Review Models");
    default:
      return text("打开安装页", "Open Install");
  }
});
const nextActionRequiresMutation = computed(() => {
  return activeRecommendation.value?.requiresManagement === true;
});
const mutationDisabledHelp = computed(() => {
  if (!canMutate.value) return text("先启用管理动作，才能执行安装、修复或配置写入。", "Enable management actions before install, repair, or config writes.");
  if (jobRunning.value) return text("已有后台任务执行中，先查看日志并等待完成。", "A background job is running; view logs and wait for it to finish.");
  if (busy.value) return text("当前操作仍在进行中。", "The current action is still in progress.");
  return "";
});
const busyDisabledHelp = computed(() => (
  busy.value
    ? text("当前操作仍在进行中，完成后再编辑 Agent 配置。", "The current action is still in progress; edit Agent config after it finishes.")
    : ""
));
const managementBusyDisabledHelp = computed(() => (
  busy.value ? text("正在启用或执行管理动作，请等待当前操作完成。", "A management action is running; wait for it to finish.") : ""
));
const logRefreshingDisabledHelp = computed(() => (
  logRefreshing.value ? text("日志正在读取中，新的读取请求会排队执行。", "Logs are loading; the next read request will be queued.") : ""
));
const nextActionDisabledHelp = computed(() => {
  if (nextActionRequiresMutation.value) {
    return mutationDisabledHelp.value;
  }
  if (actionBusy.value) return actionBusyDisabledHelp.value;
  return "";
});
const activeJobTitle = computed(() => {
  if (!activeJob.value) return "";
  const labels: Record<CodexStackJob["kind"], string> = {
    install: text("安装任务", "Install Job"),
    repair: text("修复任务", "Repair Job"),
    finalize: text("cc-connect 收尾任务", "cc-connect Finalizer"),
  };
  return labels[activeJob.value.kind];
});
const primaryServices = computed(() => summary.value?.services.filter((service) => primaryServiceIds.includes(service.id)) || []);
const activeServiceCount = computed(() => countActiveServices(primaryServices.value));
const serviceCount = computed(() => primaryServices.value.length);
const ccConnectProjects = computed(() => ccConnectConfig.value?.projects || []);
const ccConnectProviderDraftCount = computed(() => ccConnectProviderDrafts.value.length);
const ccConnectProjectDraftCount = computed(() => ccConnectProjectDrafts.value.length);
const primaryCcConnectProjectName = computed(
  () => ccConnectProjectDrafts.value[0]?.name || ccConnectProjects.value[0]?.name || summary.value?.ccConnect.project || "main",
);
const compactProxyBaseUrl = computed(() => `http://127.0.0.1:${configForm.compactPort || summary.value?.ports.compact || 18796}/v1`);
const contextTokensDisplay = computed(() => {
  if (summary.value?.context.mode === "default" && !summary.value.context.tokens) {
    return text("默认", "Default");
  }
  const tokens = summary.value?.context.tokens || summary.value?.context.recommendedTokens || 1050000;
  return tokens >= 1000000 ? `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 2)}M` : `${Math.round(tokens / 1000)}K`;
});
const codexAuthStatus = computed(() => {
  const auth = summary.value?.secrets.codexAuth;
  if (!auth?.hasSecret) return text("缺失", "Missing");
  return auth.matchesProxyKey ? "ok" : "mismatch";
});
const proxyPolicyLabel = computed(() => {
  const current = summary.value;
  if (!current) return text("未知", "Unknown");
  const policy = normalizeProxyPolicy(current.proxyPolicy);
  if (!policy.noProxyLoopbackReady) {
    return text(
      `NO_PROXY 缺少 ${policy.noProxyLoopbackMissing.join(", ")}`,
      `NO_PROXY missing ${policy.noProxyLoopbackMissing.join(", ")}`,
    );
  }
  if (policy.providerMode === "proxy" && policy.providerProxyUrl) {
    return text(`海外代理 ${policy.providerProxyUrl}`, `Foreign proxy ${policy.providerProxyUrl}`);
  }
  return text("国内网关直连", "Domestic gateways direct");
});
const smokeMatrixLabel = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) return text("未验证", "Not verified");
  const models = matrix.models.map((item) => `${item.model}:${item.status}`).join(" ");
  if (matrix.attachEligible && !isSmokeMatrixFreshAndComplete(matrix, currentCpaTargetModel.value)) {
    return text(`需复验 ${models}`, `Recheck ${models}`);
  }
  return matrix.attachEligible
    ? text(`通过 ${models}`, `Passed ${models}`)
    : text(`失败 ${models}`, `Failed ${models}`);
});
const currentCpaTargetModel = computed(() => summary.value?.profile.defaultModel || summary.value?.models.current || summary.value?.models.defaultModel || "");
const isSmokeMatrixAttachReady = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  return isSmokeMatrixFreshAndComplete(matrix, currentCpaTargetModel.value);
});
const canAttachCodexCpa = computed(() => canRunMutation.value && isSmokeMatrixAttachReady.value);
const attachCodexCpaHelp = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) {
    return text("先运行“只验证”，让当前默认 CPA 模型完成完整矩阵。", "Run Verify Only first so the current default CPA model completes the full matrix.");
  }
  if (isSmokeMatrixStale(matrix)) {
    return text("上次矩阵已超过 24 小时，先重新只验证；切换动作仍会再次烟测。", "The last matrix is older than 24 hours; verify again first. The attach action will still rerun smoke checks.");
  }
  if (matrix.attachEligible && !smokeMatrixCoversTarget(matrix, currentCpaTargetModel.value)) {
    return text(
      `上次矩阵未覆盖当前目标模型 ${currentCpaTargetModel.value || "--"}，先重新只验证。`,
      `The last matrix does not cover the current target model ${currentCpaTargetModel.value || "--"}; run Verify Only again.`,
    );
  }
  if (matrix.attachEligible && !isSmokeMatrixComplete(matrix, currentCpaTargetModel.value)) {
    return text("上次矩阵记录不完整，先重新只验证；必须覆盖目标模型、普通请求、流式、非流式和压缩上下文。", "The last matrix record is incomplete. Run Verify Only again; it must cover the target model, ordinary, streaming, non-streaming, and compaction checks.");
  }
  if (!matrix.attachEligible) {
    return text("上次矩阵未全部通过，Codex 保持官方路径；修复后重新只验证。", "The last matrix did not fully pass, so Codex stays on the official path. Fix it and verify again.");
  }
  return text("已有新鲜通过矩阵；点击后仍会重新烟测，全部通过才写入 Codex。", "A fresh passing matrix exists; clicking still reruns smoke checks before writing Codex.");
});
const attachCodexCpaDisabledHelp = computed(() => {
  if (canAttachCodexCpa.value) return "";
  if (!canRunMutation.value) return mutationDisabledHelp.value;
  return attachCodexCpaHelp.value;
});
const attachPreflightItems = computed<CodexStackAttachPreflightItem[]>(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  const targetModel = currentCpaTargetModel.value || "--";
  const requiredModels = matrix?.requiredModels.length ? matrix.requiredModels.join(", ") : targetModel;
  const requiredChecks = REQUIRED_CPA_SMOKE_CHECKS.join(", ");
  const matrixTone: CodexStackTone = isSmokeMatrixFreshAndComplete(matrix, targetModel)
    ? "sage"
    : matrix?.attachEligible ? "accent" : "danger";
  const matrixValue = matrix
    ? `${smokeMatrixLabel.value} · ${formatTimestamp(matrix.checkedAt)}`
    : text(`尚未运行 ${targetModel} smoke matrix`, `${targetModel} smoke matrix has not run yet`);
  return [
    {
      id: "required-models",
      label: text("必测模型", "Required models"),
      value: requiredModels,
      tone: "sage",
    },
    {
      id: "required-checks",
      label: text("必测检查", "Required checks"),
      value: requiredChecks,
      tone: "sage",
    },
    {
      id: "last-matrix",
      label: text("上次矩阵", "Last matrix"),
      value: matrixValue,
      tone: matrixTone,
    },
    {
      id: "attach-action",
      label: text("切换动作", "Attach action"),
      value: isSmokeMatrixFreshAndComplete(matrix, targetModel)
        ? text("可点击；仍会重新烟测，全部通过才写 Codex。", "Enabled; still reruns smoke checks before writing Codex.")
        : text("不可点击；先只验证，不会切换 Codex。", "Disabled; run Verify Only first without attaching Codex."),
      tone: isSmokeMatrixFreshAndComplete(matrix, targetModel) ? "sage" : "accent",
    },
  ];
});
const dashboardInsightsLabels = computed(() => ({
  runtimeKicker: text("速览", "Quick Info"),
  runtimeTitle: text("运行摘要", "Runtime Summary"),
  componentsKicker: text("组件", "Components"),
  componentsTitle: text("组件健康", "Component Health"),
}));
const runtimeSummaryRows = computed<CodexStackRuntimeSummaryRow[]>(() => {
  const current = summary.value;
  if (!current) return [];
  return [
    {
      id: "model",
      label: text("模型", "Model"),
      value: current.models.current || current.profile.defaultModel || "--",
    },
    {
      id: "channel",
      label: text("渠道", "Channel"),
      value: channelLabel(current.installer.channel),
    },
    {
      id: "cpa",
      label: "CPA",
      value: portDisplay(current.ports.cpa, current.ports.detectedCpa),
    },
    {
      id: "compact",
      label: "Compact",
      value: portDisplay(current.ports.compact, current.ports.detectedCompact),
    },
    {
      id: "watchdog",
      label: text("后台守护", "Background Watchdog"),
      value: (() => {
        const watchdog = current.services.find((service) => service.id === "codex-stack-watchdog.timer");
        if (!watchdog?.installed) return text("未安装；安装/修复会补齐", "Not installed; install/repair will add it");
        return watchdog.active
          ? text("已启用；异常自动恢复", "Enabled; auto-recovers issues")
          : text("已暂停；推荐修复会恢复", "Paused; Recommended Repair will resume it");
      })(),
    },
    {
      id: "proxy",
      label: text("上游代理", "Upstream Proxy"),
      value: proxyPolicyLabel.value,
    },
    {
      id: "smoke",
      label: text("模型矩阵", "Smoke Matrix"),
      value: smokeMatrixLabel.value,
    },
    {
      id: "cc-connect",
      label: text("cc-connect 项目", "cc-connect Project"),
      value: current.ccConnect.project || "main",
    },
    {
      id: "installer",
      label: text("安装器版本", "Installer Version"),
      value: current.installer.version || "--",
    },
  ];
});
const networkPolicyCard = computed<CodexStackNetworkPolicyCard | null>(() => {
  const current = summary.value;
  if (!current) return null;
  const policy = normalizeProxyPolicy(current.proxyPolicy);
  const directWithSystemProxy = policy.providerMode === "direct" && Boolean(policy.providerProxyUrl);
  const proxyMode = policy.providerMode === "proxy" && Boolean(policy.providerProxyUrl);
  const tone: CodexStackTone = !policy.noProxyLoopbackReady
    ? "danger"
    : directWithSystemProxy || proxyMode ? "accent" : "sage";
  const modeValue = !policy.noProxyLoopbackReady
    ? text("本机绕过缺失", "Loopback bypass missing")
    : proxyMode
      ? text("海外代理", "Foreign proxy")
      : directWithSystemProxy
        ? text("国内直连 + 系统代理提示", "Domestic direct + system proxy noticed")
        : text("国内网关直连", "Domestic gateway direct");
  const modeHelp = !policy.noProxyLoopbackReady
    ? text("网卡/TUN 模式或系统代理可能截获 CPA/Compact 的本机请求，先补齐 NO_PROXY 再跑 Codex 对话、长任务和压缩上下文。", "TUN mode or a system proxy can capture local CPA/Compact calls; fix NO_PROXY before Codex chats, long jobs, and compaction.")
    : proxyMode
      ? text(`CPA provider 使用 ${policy.providerProxyUrl}；仅海外/OpenAI 上游需要这样配置。`, `CPA providers use ${policy.providerProxyUrl}; keep this for foreign/OpenAI upstreams only.`)
      : directWithSystemProxy
        ? text("检测到系统代理，但 CPA provider 仍是 direct；国内网关不会继承系统代理，若 TUN 劫持流量请在 VPN 里为国内网关配置直连。", "A system proxy is present while CPA providers stay direct; domestic gateways will not inherit it, so configure direct routing for domestic gateways if TUN captures traffic.")
        : text("国内兼容网关保持直连；OpenAI 官方 Codex 访问仍由 Codex/系统代理路径处理。", "Domestic compatible gateways stay direct; official OpenAI Codex access still follows the Codex/system proxy path.");
  const loopbackValue = policy.noProxyLoopbackReady
    ? text("localhost / 127.0.0.1 / ::1 已绕过", "localhost / 127.0.0.1 / ::1 bypassed")
    : text(`缺少 ${policy.noProxyLoopbackMissing.join(", ")}`, `Missing ${policy.noProxyLoopbackMissing.join(", ")}`);
  const loopbackHelp = policy.noProxyLoopbackReady
    ? text(`NO_PROXY=${policy.noProxy}`, `NO_PROXY=${policy.noProxy}`)
    : text("把 localhost,127.0.0.1,::1 写入 NO_PROXY，避免本机 CPA/Compact 请求被系统代理或 VPN 网卡模式转走。", "Add localhost,127.0.0.1,::1 to NO_PROXY so local CPA/Compact calls are not routed through a system proxy or VPN TUN mode.");
  const upstreamValue = policy.upstreamBaseUrl
    ? `${policy.upstreamBaseUrl} · ${policy.upstreamApiKeyConfigured ? text("密钥已配置", "key configured") : text("缺少密钥", "key missing")}`
    : text("使用安装器默认上游", "Using installer default upstream");
  return {
    kicker: text("网络策略", "Network Policy"),
    title: text("代理与直连诊断", "Proxy and Direct Routing"),
    modeValue,
    modeHelp,
    loopbackLabel: "NO_PROXY",
    loopbackValue,
    loopbackHelp,
    upstreamLabel: text("上游", "Upstream"),
    upstreamValue,
    tone,
  };
});
const chainMapLabels = computed(() => ({
  kicker: text("链路", "Chain"),
  title: text("CPA / Compact / Codex 请求链路", "CPA / Compact / Codex Request Chain"),
  copy: text(
    "把运行链路、代理策略、上下文和 smoke gate 放到同一张图里，避免安装、修改或长任务时误判当前 Codex 状态。",
    "The runtime chain, proxy policy, context, and smoke gate stay in one view so install, edits, and long jobs do not hide the current Codex state.",
  ),
  status: jobRunning.value ? text("写操作锁定", "Writes locked") : statusLabel.value,
  warningKicker: text("风险", "Risks"),
  warningTitle: text("需要先处理的链路告警", "Chain warnings to resolve first"),
}));
const chainWarnings = computed(() => summary.value?.warnings.slice(0, 3) || []);
const chainNodes = computed<CodexStackChainNode[]>(() => {
  const current = summary.value;
  if (!current) return [];
  return [
    {
      id: "cpa",
      label: "CPA",
      value: portDisplay(current.ports.cpa, current.ports.detectedCpa),
      meta: current.services.find((service) => service.id === "cli-proxy-api.service")?.active
        ? text("OpenAI 兼容入口运行中", "OpenAI-compatible ingress is running")
        : text("入口未运行或未安装", "Ingress is stopped or missing"),
      tone: current.components.find((component) => component.id === "cpa")?.status === "ok" ? "sage" : "danger",
    },
    {
      id: "compact",
      label: "Compact",
      value: `:${current.ports.compact}`,
      meta: current.models.live
        ? text("模型目录来自 /v1/models", "Model catalog comes from /v1/models")
        : text("模型目录使用本地回退", "Model catalog is using fallback data"),
      tone: current.models.live ? "sage" : "accent",
    },
    {
      id: "codex",
      label: "Codex CLI",
      value: current.models.current || current.profile.defaultModel || "--",
      meta: `${text("上下文", "Context")} ${contextTokensDisplay.value}`,
      tone: current.secrets.codexAuth.matchesProxyKey === false ? "danger" : "sage",
    },
    {
      id: "cc-connect",
      label: "cc-connect",
      value: current.ccConnect.project || "main",
      meta: current.ccConnect.bindingPresent
        ? text("平台绑定已检测", "Platform binding detected")
        : text("等待平台绑定或 finalizer", "Waiting for binding or finalizer"),
      tone: current.ccConnect.bindingPresent ? "sage" : "accent",
    },
  ];
});
const chainGates = computed<CodexStackChainGate[]>(() => {
  const current = summary.value;
  if (!current) return [];
  const matrix = current.profile.lastSmokeMatrix;
  const targetModel = current.profile.defaultModel || current.models.current || current.models.defaultModel;
  const matrixFresh = isSmokeMatrixFreshAndComplete(matrix, targetModel);
  const policy = normalizeProxyPolicy(current.proxyPolicy);
  return [
    {
      id: "proxy",
      label: text("代理策略", "Proxy Policy"),
      value: !policy.noProxyLoopbackReady
        ? text("本地绕过缺失", "Loopback bypass missing")
        : policy.providerMode === "proxy" ? text("海外代理", "Foreign proxy") : text("国内直连", "Domestic direct"),
      help: proxyPolicyLabel.value,
      tone: !policy.noProxyLoopbackReady
        ? "danger"
        : policy.providerMode === "proxy" ? "accent" : "sage",
    },
    {
      id: "smoke",
      label: text("Smoke Gate", "Smoke Gate"),
      value: matrix
        ? (matrixFresh ? text("可切 Codex", "Attach ready") : matrix.attachEligible ? text("需复验", "Recheck") : text("禁止切换", "Blocked"))
        : text("未验证", "Not verified"),
      help: smokeMatrixLabel.value,
      tone: matrix ? (matrixFresh ? "sage" : matrix.attachEligible ? "accent" : "danger") : "accent",
    },
    {
      id: "job-lock",
      label: text("后台任务锁", "Job Lock"),
      value: jobRunning.value ? text("锁定写操作", "Writes locked") : text("可操作", "Writable"),
      help: activeJob.value
        ? `${activeJob.value.commandLabel} · ${jobStatusLabel(activeJob.value.status)}`
        : text("没有安装、修复或 finalizer 正在运行", "No install, repair, or finalizer is running"),
      tone: jobRunning.value ? "accent" : "sage",
    },
  ];
});
const smokeMatrixCard = computed<CodexStackSmokeMatrixCard | null>(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) return null;
  const targetModel = currentCpaTargetModel.value;
  const smokeFresh = isSmokeMatrixFreshAndComplete(matrix, targetModel);
  const smokeComplete = isSmokeMatrixComplete(matrix, targetModel);
  const smokeStale = isSmokeMatrixStale(matrix);
  const freshnessTone: CodexStackTone = smokeFresh ? "sage" : matrix.attachEligible ? "accent" : "danger";
  const freshness = smokeFresh
    ? text("24 小时内完整通过", "Fresh complete pass within 24h")
    : smokeStale
      ? text("已超过 24 小时，需复验", "Older than 24h; recheck")
      : matrix.attachEligible && !smokeMatrixCoversTarget(matrix, targetModel)
        ? text("未覆盖当前目标模型，需复验", "Does not cover current target; recheck")
      : matrix.attachEligible && !smokeComplete
        ? text("记录不完整，需复验", "Incomplete record; recheck")
        : matrix.attachEligible
          ? text("需复验", "Recheck")
          : text("未通过，禁止切换", "Failed; blocked");
  return {
    requiredModelsLabel: text("必测模型", "Required Models"),
    requiredModels: matrix.requiredModels.join(", "),
    attachEligibleLabel: text("可切换", "Attach Eligible"),
    attachEligible: smokeFresh ? text("是", "Yes") : matrix.attachEligible ? text("需复验", "Recheck") : text("否", "No"),
    statusLabel: text("矩阵状态", "Matrix Status"),
    statusValue: matrix.status === "passed" ? text("通过", "Passed") : text("失败", "Failed"),
    checkedAtLabel: text("验证时间", "Checked At"),
    checkedAt: formatTimestamp(matrix.checkedAt),
    durationLabel: text("矩阵耗时", "Matrix Duration"),
    duration: formatDurationMs(matrix.durationMs),
    freshnessLabel: text("时效", "Freshness"),
    freshness,
    freshnessTone,
    models: matrix.models.map((model) => {
      const passed = model.checks.filter((check) => check.status === "passed").length;
      const failedChecks = model.checks.filter((check) => check.status === "failed").map((check) => check.label || check.id);
      const timedChecks = model.checks.filter((check) => typeof check.durationMs === "number");
      const slowestCheck = timedChecks.reduce<(typeof timedChecks)[number] | null>(
        (slowest, check) => (slowest && (slowest.durationMs || 0) >= (check.durationMs || 0) ? slowest : check),
        null,
      );
      const total = model.checks.length;
      return {
        model: model.model,
        status: model.status,
        checksLabel: text(`检查 ${passed}/${total} 通过`, `${passed}/${total} checks passed`),
        durationLabel: text(`耗时 ${formatDurationMs(model.durationMs)}`, `Duration ${formatDurationMs(model.durationMs)}`),
        slowestCheck: slowestCheck
          ? text(
            `最慢：${slowestCheck.label || slowestCheck.id} ${formatDurationMs(slowestCheck.durationMs)}`,
            `Slowest: ${slowestCheck.label || slowestCheck.id} ${formatDurationMs(slowestCheck.durationMs)}`,
          )
          : "",
        failedChecks: failedChecks.length
          ? text(`失败检查：${failedChecks.join("、")}`, `Failed checks: ${failedChecks.join(", ")}`)
          : "",
        error: model.error,
      };
    }),
  };
});
const componentHealthCards = computed<CodexStackComponentHealthCard[]>(() => {
  const current = summary.value;
  if (!current) return [];
  return current.components.map((component) => ({
    id: component.id,
    label: component.label,
    statusLabel: componentStatusLabel(component),
    versionLabel: `${text("版本", "Version")} ${
      component.version || (component.installed ? text("已安装", "Installed") : text("缺失", "Missing"))
    }`,
    notes: component.notes.join(" · "),
    tone: componentTone(component.status),
  }));
});
const configContextTokensDisabled = computed(() => configForm.contextMode !== "custom");
const installContextTokensDisabled = computed(() => installForm.contextMode !== "custom");
function contextTokensDisabledHelp(mode: ContextMode): string {
  if (mode === "default") {
    return text("默认上下文不会写 model_context_window；选择自定义 token 后可编辑。", "Default context does not write model_context_window; choose custom tokens to edit this field.");
  }
  if (mode === "codex-1m") {
    return text("1M 上下文会自动使用推荐窗口；选择自定义 token 后可手动输入。", "1M context uses the recommended window automatically; choose custom tokens to enter a value manually.");
  }
  return "";
}
const configContextTokensDisabledHelp = computed(() => (
  configContextTokensDisabled.value ? contextTokensDisabledHelp(configForm.contextMode) : ""
));
const installContextTokensDisabledHelp = computed(() => (
  installContextTokensDisabled.value ? contextTokensDisabledHelp(installForm.contextMode) : ""
));
const hasInstallDraftChanges = computed(() => {
  const current = summary.value;
  if (!current) return false;
  const policy = normalizeProxyPolicy(current.proxyPolicy);

  const currentModel = current.profile.defaultModel || current.models.current || current.models.defaultModel || "kimi-k2.6";
  if ((installForm.model || "") !== currentModel) return true;
  if (installForm.contextMode !== (current.context.mode || "default")) return true;
  if (installForm.contextMode === "custom" && Number(installForm.contextWindowTokens) !== (current.context.tokens || current.context.recommendedTokens)) return true;
  if (Number(installForm.cpaPort) !== current.ports.cpa) return true;
  if (Number(installForm.compactPort) !== current.ports.compact) return true;
  if (installForm.channel !== current.installer.channel) return true;
  if (installForm.cpaKey.trim()) return true;
  if (installForm.upstreamBaseUrl.trim() !== (policy.upstreamBaseUrl || "")) return true;
  if (installForm.upstreamApiKey.trim()) return true;
  if (installForm.providerProxyUrl.trim() !== (policy.providerProxyUrl || "")) return true;
  if ((installForm.noProxy.trim() || DEFAULT_NO_PROXY) !== (policy.noProxy || DEFAULT_NO_PROXY)) return true;
  return installForm.skipNpm
    || installForm.skipCcConnect
    || installForm.noStart
    || installForm.skipExisting
    || installForm.forceReinstall
    || installForm.skipComponents.length > 0
    || installForm.forceComponents.length > 0;
});
const configPatchPayload = computed<CodexStackConfigPatchRequest>(() => {
  const current = summary.value;
  if (!current) return {};
  const policy = normalizeProxyPolicy(current.proxyPolicy);

  const payload: CodexStackConfigPatchRequest = {};
  const nextModel = configForm.defaultModel.trim();
  const currentModel = current.profile.defaultModel || current.models.current || current.models.defaultModel || "";
  if (nextModel && nextModel !== currentModel) {
    payload.defaultModel = nextModel;
  }

  if (configForm.contextMode !== current.context.mode) {
    payload.contextMode = configForm.contextMode;
  }
  if (configForm.contextMode === "custom") {
    const nextTokens = Number(configForm.contextWindowTokens) || undefined;
    if (nextTokens && nextTokens !== (current.context.tokens || undefined)) {
      payload.contextMode = "custom";
      payload.contextWindowTokens = nextTokens;
    }
  }

  const nextCpaPort = Number(configForm.cpaPort) || undefined;
  if (nextCpaPort && nextCpaPort !== current.ports.cpa) {
    payload.cpaPort = nextCpaPort;
  }
  const nextCompactPort = Number(configForm.compactPort) || undefined;
  if (nextCompactPort && nextCompactPort !== current.ports.compact) {
    payload.compactPort = nextCompactPort;
  }

  const nextCcProject = configForm.ccConnectProject.trim();
  const currentCcProject = current.ccConnect.project || current.profile.ccConnectProject || "main";
  if (nextCcProject && nextCcProject !== currentCcProject) {
    payload.ccConnectProject = nextCcProject;
  }

  const nextCpaProxyKey = configForm.cpaProxyKey.trim();
  if (nextCpaProxyKey) {
    payload.cpaProxyKey = nextCpaProxyKey;
  }

  const nextUpstreamBaseUrl = configForm.upstreamBaseUrl.trim();
  if (nextUpstreamBaseUrl !== (policy.upstreamBaseUrl || "")) {
    payload.upstreamBaseUrl = nextUpstreamBaseUrl;
  }

  const nextUpstreamApiKey = configForm.upstreamApiKey.trim();
  if (nextUpstreamApiKey) {
    payload.upstreamApiKey = nextUpstreamApiKey;
  }

  const nextProviderProxyUrl = configForm.providerProxyUrl.trim();
  if (nextProviderProxyUrl !== (policy.providerProxyUrl || "")) {
    payload.providerProxyUrl = nextProviderProxyUrl;
  }

  const nextNoProxy = configForm.noProxy.trim() || DEFAULT_NO_PROXY;
  if (nextNoProxy !== (policy.noProxy || DEFAULT_NO_PROXY)) {
    payload.noProxy = nextNoProxy;
  }

  return payload;
});
const hasConfigPatchChanges = computed(() => Object.keys(configPatchPayload.value).length > 0);
const configImpactItems = computed<CodexStackRuntimeConfigImpactItem[]>(() => {
  const payload = configPatchPayload.value;
  const items: CodexStackRuntimeConfigImpactItem[] = [];
  const hasServiceRouteChange = Boolean(
    payload.defaultModel
    || payload.cpaPort
    || payload.compactPort
    || payload.cpaProxyKey
    || Object.prototype.hasOwnProperty.call(payload, "upstreamBaseUrl")
    || payload.upstreamApiKey
    || Object.prototype.hasOwnProperty.call(payload, "providerProxyUrl")
    || Object.prototype.hasOwnProperty.call(payload, "noProxy")
  );

  if (hasServiceRouteChange) {
    items.push({
      id: "smoke-invalidated",
      label: text("保存后需要重新 smoke", "Smoke recheck required after save"),
      detail: text(
        "模型、端口、密钥、上游、代理或 NO_PROXY 变化会清空旧的目标模型 smoke 结果；重新验证前不会把 CPA 当作可接入状态。",
        "Model, port, key, upstream, proxy, or NO_PROXY changes clear the old target-model smoke result; CPA will not be treated as attach-ready until rechecked.",
      ),
      tone: "warning",
    });
  }

  if (payload.cpaPort || payload.compactPort || payload.defaultModel || payload.cpaProxyKey) {
    items.push({
      id: "service-restart",
      label: text("影响本地服务路由", "Local service route changes"),
      detail: text(
        "保存会更新 CPA/Compact、Codex provider 或 cc-connect 配置；仅重启当前 active 的服务，已暂停的栈不会被自动拉起。",
        "Saving updates CPA/Compact, the Codex provider, or cc-connect config; only currently active services restart, and a paused stack is not started automatically.",
      ),
      tone: "info",
    });
  }

  if (payload.cpaProxyKey) {
    items.push({
      id: "auth-key",
      label: text("会写入本地 CPA key", "Local CPA key will be written"),
      detail: text(
        "新的 proxy key 会同步到 Codex auth、CPA 配置和 cc-connect provider；官方 GPT 路径仍需显式 smoke gate 才会切到 CPA。",
        "The new proxy key is synced to Codex auth, CPA config, and the cc-connect provider; the official GPT route still switches to CPA only through the explicit smoke gate.",
      ),
      tone: "danger",
    });
  }

  if (payload.contextMode || payload.contextWindowTokens) {
    items.push({
      id: "context",
      label: text("影响长任务和压缩上下文", "Affects long tasks and compaction"),
      detail: text(
        "上下文变化会写入 ~/.codex/config.toml，并影响长任务与压缩上下文就绪判断。",
        "Context changes are written to ~/.codex/config.toml and affect long-task and compaction readiness.",
      ),
      tone: "info",
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "providerProxyUrl") || Object.prototype.hasOwnProperty.call(payload, "noProxy")) {
    items.push({
      id: "network",
      label: text("影响系统代理和 TUN 绕过", "Affects proxy and TUN bypass"),
      detail: text(
        "国内网关建议 direct；NO_PROXY 必须保留 localhost,127.0.0.1,::1，避免本机 CPA/Compact 请求被系统代理或 VPN 网卡模式截获。",
        "Domestic gateways should stay direct; NO_PROXY must keep localhost,127.0.0.1,::1 so local CPA/Compact calls are not captured by a system proxy or VPN TUN mode.",
      ),
      tone: "warning",
    });
  }

  if (payload.ccConnectProject) {
    items.push({
      id: "cc-connect",
      label: text("影响 cc-connect Agent 项目", "Affects cc-connect agent project"),
      detail: text(
        "保存会更新 cc-connect 项目名；绑定与 finalizer 仍在 Agent 面板处理。",
        "Saving updates the cc-connect project name; binding and finalizer steps still run from the Agent panel.",
      ),
      tone: "info",
    });
  }

  return items;
});
const canonicalCcConnectProvider = computed(() => {
  const provider = ccConnectProviderDrafts.value.find((item) => item.name === "cpa") || ccConnectProviderDrafts.value[0];
  return {
    name: provider?.name || "cpa",
    baseUrl: provider?.baseUrl || compactProxyBaseUrl.value,
    model: configForm.defaultModel || installForm.model || summary.value?.models.current || "--",
  };
});
const ccConnectSetupCommands = computed(() => {
  const commands = summary.value?.ccConnect.setupCommands || [];
  if (commands.length) return commands;
  return [
    `cc-connect feishu setup --project ${primaryCcConnectProjectName.value}`,
    `cc-connect weixin setup --project ${primaryCcConnectProjectName.value}`,
  ];
});
const hasCcConnectRawChanges = computed(() => ccConnectRawDraft.value !== (ccConnectConfig.value?.raw || ""));
const hasCcConnectStructuredChanges = computed(
  () => serializeCcConnectStructuredDraft() !== ccConnectStructuredBaseline.value,
);
const serviceCards = computed(() => {
  if (!summary.value) return [];
  return primaryServices.value.map((service) => {
    const serviceMeta = serviceCatalog[service.id];
    const label = text(serviceMeta.labelKey[0], serviceMeta.labelKey[1]);
    const blurb = text(serviceMeta.blurbKey[0], serviceMeta.blurbKey[1]);
    return {
      ...service,
      label,
      blurb,
      tone: service.active ? "sage" : "danger",
      stateLabel: service.active ? text("服务运行正常", "Service is running") : text("服务当前未运行", "Service is currently stopped"),
      enabledLabel: service.enabled ? text("已启用", "Enabled") : text("未启用", "Disabled"),
      rawState: `${service.rawActiveState} / ${service.rawEnabledState}`,
      ...serviceEndpointInfo(service.id, summary.value),
    };
  });
});
const serviceGridLabels = computed(() => ({
  running: text("运行中", "Running"),
  stopped: text("已停止", "Stopped"),
  enabled: text("启用状态", "Enabled"),
  systemd: text("systemd 状态", "Systemd"),
  start: text("启动", "Start"),
  stop: text("停止", "Stop"),
  restart: text("重启", "Restart"),
}));
const componentOptions = computed(() => [
  { id: "codex" as const, label: text("Codex CLI", "Codex CLI") },
  { id: "cpa" as const, label: text("CPA 代理", "CPA Proxy") },
  { id: "compact-proxy" as const, label: text("Compact 代理", "Compact Proxy") },
  { id: "cc-connect" as const, label: "cc-connect" },
  { id: "watchdog" as const, label: text("看门狗", "Watchdog") },
]);
const installComponentStrategies = computed<CodexStackInstallComponentStrategy[]>(() => componentOptions.value.map((component) => ({
  id: component.id,
  label: component.label,
  mode: installMode(component.id),
  modeLabel: installModeLabel(component.id),
})));
const agentPanes = computed<CodexStackCcConnectPaneOption[]>(() => [
  { id: "projects" as const, label: text("Agent 项目", "Agent Projects") },
  { id: "providers" as const, label: "Provider" },
  { id: "setup" as const, label: text("绑定与动作", "Setup & Actions") },
  { id: "raw" as const, label: "TOML" },
]);
const ccConnectProjectRailItems = computed<CodexStackCcConnectProjectRailItem[]>(() => ccConnectProjectDrafts.value.map((project) => ({
  id: project.id,
  name: project.name,
  model: project.agentOptions.model,
  platformCount: project.platforms.length,
})));
const platformTemplates = computed<CodexStackCcConnectPlatformTemplate[]>(() => [
  {
    id: "dmwork",
    label: "DMWork",
    copy: text("token / api_url / account_id", "token / api_url / account_id"),
  },
  {
    id: "octo",
    label: "Octo",
    copy: text("token / api_url / account_id", "token / api_url / account_id"),
  },
  {
    id: "feishu",
    label: text("飞书", "Feishu"),
    copy: text("app_id / app_secret", "app_id / app_secret"),
  },
  {
    id: "weixin",
    label: text("微信", "Weixin"),
    copy: text("setup 绑定后自动补齐", "Filled by setup binding"),
  },
]);
const projectPresetCards = computed<CodexStackCcConnectProjectPresetCard[]>(() => [
  {
    id: "admin",
    label: text("管理员 Agent", "Admin Agent"),
    copy: text("suggest 模式，默认工作目录指向 ~/.openclaw，适合主控 Bot。", "Suggest mode with ~/.openclaw as work dir, suitable for the primary bot."),
    action: text("新建管理员", "New Admin"),
  },
  {
    id: "worker",
    label: text("工作 Agent", "Worker Agent"),
    copy: text("yolo 模式，默认使用独立 workspace，适合多 Agent 分流。", "Yolo mode with an isolated workspace, suitable for multi-agent routing."),
    action: text("新建工作 Agent", "New Worker"),
  },
]);
const selectedProjectDraft = computed(() => {
  if (!ccConnectProjectDrafts.value.length) return null;
  return ccConnectProjectDrafts.value.find((project) => project.id === selectedProjectDraftId.value) || ccConnectProjectDrafts.value[0];
});
const selectedProjectSummary = computed(() => {
  const project = selectedProjectDraft.value;
  if (!project) return text("暂无项目", "No project");
  return `${project.agentType || "codex"} · ${project.agentOptions.mode || "--"} · ${project.agentOptions.model || "--"}`;
});
const installPlanHighlights = computed(() => {
  const skip = componentOptions.value
    .filter((component) => installMode(component.id) === "skip")
    .map((component) => component.label);
  const force = componentOptions.value
    .filter((component) => installMode(component.id) === "force")
    .map((component) => component.label);
  return [
    `${text("渠道", "Channel")}: ${channelLabel(installForm.channel)}`,
    `${text("模型", "Model")}: ${installForm.model || "--"}`,
    `${text("上下文", "Context")}: ${installForm.contextMode === "default" ? text("默认", "Default") : `${installForm.contextMode === "codex-1m" ? "1M" : installForm.contextWindowTokens} tokens`}`,
    `${text("端口", "Ports")}: CPA ${installForm.cpaPort} / Compact ${installForm.compactPort}`,
    `${text("上游代理", "Upstream Proxy")}: ${installForm.providerProxyUrl ? installForm.providerProxyUrl : text("自动；国内直连", "Auto; domestic direct")}`,
    `${text("跳过", "Skip")}: ${skip.length ? skip.join(", ") : text("无", "None")}`,
    `${text("强制", "Force")}: ${force.length ? force.join(", ") : text("无", "None")}`,
  ];
});
const logLineOptions = computed<CodexStackLogLineOption[]>(() => [
  { id: "light", label: text("轻量", "Light"), lines: 80, help: text("最快，只看最近错误。", "Fastest, recent errors only.") },
  { id: "balanced", label: text("标准", "Balanced"), lines: 160, help: text("默认预览，适合日常排障。", "Default preview for daily diagnosis.") },
  { id: "deep", label: text("完整", "Deep"), lines: 500, help: text("更多上下文，读取更慢。", "More context, slower fetch.") },
]);
const logLineLimit = computed(() => logLineOptions.value.find((option) => option.id === logLineMode.value)?.lines || 160);
const logModeHelp = computed(() => logLineOptions.value.find((option) => option.id === logLineMode.value)?.help || "");
const logFetchedAtLabel = computed(() => formatTimestamp(logMeta.value?.fetchedAt));
const logConsoleLabels = computed(() => ({
  guideLabel: text("日志查看流程", "Log reading flow"),
  guideService: text("选服务", "Pick Service"),
  guideServiceCopy: text("先看正在失败或刚执行任务的服务。", "Start with the service that failed or just ran a job."),
  guideScope: text("定范围", "Choose Scope"),
  guideScopeCopy: text("默认轻量；只有排查长错误时再用完整上下文。", "Use light by default; switch deeper only for long failures."),
  guideRead: text("读输出", "Read Output"),
  guideReadCopy: text("点击读取日志；任务执行中会持续展示最新尾部。", "Click Load Logs; running jobs show their latest tail."),
  targetService: text("目标服务", "Target Service"),
  readPerformance: text("读取性能", "Read Performance"),
  lines: text("行", "lines"),
  autoRefresh: text("自动刷新当前服务", "Auto-refresh current service"),
  requested: text("请求行数", "Requested"),
  returned: text("返回行数", "Returned"),
  sources: text("来源", "Sources"),
  fetched: text("读取时间", "Fetched"),
  truncated: text("内容已截断", "Output truncated"),
  load: text("读取日志", "Load Logs"),
  loading: text("读取中...", "Loading..."),
  empty: text("选择一个服务查看日志。", "Select a service to view logs."),
}));
const jobProgressDefinitions = computed(() => {
  const kind = activeJob.value?.kind;
  if (kind === "repair") {
    return [
      { label: text("确认修复项", "Resolve actions"), patterns: ["repair", "修复"] },
      { label: text("执行服务动作", "Run service actions"), patterns: ["systemctl", "restart", "start", "disable"] },
      { label: text("刷新状态", "Refresh status"), patterns: ["summary", "health", "检查"] },
      { label: text("完成", "Done"), patterns: ["succeeded", "completed", "完成"] },
    ];
  }
  if (kind === "finalize") {
    return [
      { label: text("读取绑定", "Read binding"), patterns: ["cc-connect", "binding", "绑定"] },
      { label: text("写入配置", "Write config"), patterns: ["config", "配置"] },
      { label: text("重启服务", "Restart service"), patterns: ["restart", "systemctl"] },
      { label: text("完成", "Done"), patterns: ["succeeded", "completed", "完成"] },
    ];
  }
  return [
    { label: text("预检环境", "Preflight"), patterns: ["node.js", "npm", "openclaw.json", "step 1/8"] },
    { label: text("安装 CLI", "Install CLI"), patterns: ["step 2/8", "codex cli", "oh-my-codex"] },
    { label: text("部署 cc-connect", "Deploy cc-connect"), patterns: ["step 3/8", "cc-connect"] },
    { label: text("部署 CPA / Compact", "Deploy CPA / Compact"), patterns: ["step 4/8", "compact proxy"] },
    { label: text("写入配置", "Write configs"), patterns: ["step 5/8", "step 6/8"] },
    { label: text("创建守护", "Create daemons"), patterns: ["step 7/8", "systemd"] },
    { label: text("启动与验证", "Start and verify"), patterns: ["step 8/8", "安装完成", "install succeeded"] },
  ];
});
const jobProgressSteps = computed(() => {
  const job = activeJob.value;
  const definitions = jobProgressDefinitions.value;
  if (!job) return [];
  const log = `${job.commandLabel}\n${job.logTail || ""}\n${job.error || ""}`.toLowerCase();
  let activeIndex = job.status === "queued" ? 0 : -1;
  definitions.forEach((step, index) => {
    if (step.patterns.some((pattern) => log.includes(pattern.toLowerCase()))) {
      activeIndex = index;
    }
  });
  if (job.status === "succeeded") activeIndex = definitions.length - 1;
  if ((job.status === "failed" || job.status === "interrupted") && activeIndex < 0) activeIndex = 0;
  return definitions.map((step, index) => {
    let state: "done" | "active" | "failed" | "pending" = "pending";
    if (job.status === "succeeded" || index < activeIndex) state = "done";
    else if (index === activeIndex && (job.status === "failed" || job.status === "interrupted")) state = "failed";
    else if (index === activeIndex) state = "active";
    return { ...step, state };
  });
});
const jobProgressPercent = computed(() => {
  const steps = jobProgressSteps.value;
  if (!steps.length) return "0%";
  const score = steps.reduce((total, step) => {
    if (step.state === "done") return total + 1;
    if (step.state === "active") return total + 0.55;
    return total;
  }, 0);
  return `${Math.max(6, Math.round((score / steps.length) * 100))}%`;
});

function nextDraftId(prefix: string): string {
  draftIdCounter += 1;
  return `${prefix}-${draftIdCounter}`;
}

function createProviderDraft(provider?: Partial<CcConnectProvider>): CcConnectProviderDraft {
  return {
    id: nextDraftId("provider"),
    name: provider?.name || "cpa",
    apiKey: provider?.apiKey || "",
    baseUrl: provider?.baseUrl || compactProxyBaseUrl.value,
    codexEnvKey: provider?.codexEnvKey || "OPENAI_API_KEY",
  };
}

function createPlatformOptionDraft(key = "", value = ""): CcConnectPlatformOptionDraft {
  return {
    id: nextDraftId("platform-option"),
    key,
    value,
  };
}

function defaultPlatformOptionRows(type: string): CcConnectPlatformOptionDraft[] {
  if (type === "feishu") {
    return [
      createPlatformOptionDraft("app_id", ""),
      createPlatformOptionDraft("app_secret", ""),
    ];
  }
  if (type === "weixin") {
    return [
      createPlatformOptionDraft("app_id", ""),
      createPlatformOptionDraft("app_secret", ""),
    ];
  }
  return [
    createPlatformOptionDraft("bot_token", ""),
    createPlatformOptionDraft("api_url", "https://im.deepminer.com.cn/api"),
    createPlatformOptionDraft("account_id", ""),
  ];
}

function createPlatformDraft(platform?: Partial<CcConnectPlatform>, preferredType: PlatformTemplateId = "octo"): CcConnectPlatformDraft {
  const options = Object.entries(platform?.options || {});
  const type = platform?.type || preferredType;
  return {
    id: nextDraftId("platform"),
    type,
    optionRows: options.length
      ? options.map(([key, value]) => createPlatformOptionDraft(key, value))
      : defaultPlatformOptionRows(type),
  };
}

function createProjectDraft(project?: Partial<CcConnectProject>): CcConnectProjectDraft {
  return {
    id: nextDraftId("project"),
    name: project?.name || "main",
    adminFrom: project?.adminFrom || "",
    agentType: project?.agentType || "codex",
    agentOptions: {
      workDir: project?.agentOptions?.workDir || summary.value?.homeDir || "",
      mode: project?.agentOptions?.mode || "suggest",
      model: project?.agentOptions?.model || configForm.defaultModel || "kimi-k2.6",
    },
    platforms: project?.platforms?.length
      ? project.platforms.map((platform) => createPlatformDraft(platform))
      : [createPlatformDraft()],
  };
}

function normalizeProviderDrafts(): CcConnectProvider[] {
  return ccConnectProviderDrafts.value
    .map((provider) => ({
      name: provider.name.trim(),
      apiKey: provider.apiKey.trim(),
      baseUrl: provider.baseUrl.trim(),
      codexEnvKey: provider.codexEnvKey.trim(),
    }))
    .filter((provider) => provider.name || provider.baseUrl || provider.apiKey || provider.codexEnvKey);
}

function normalizePlatformDraft(platform: CcConnectPlatformDraft): CcConnectPlatform {
  const options: Record<string, string> = {};
  for (const row of platform.optionRows) {
    const key = row.key.trim();
    if (!key) continue;
    options[key] = row.value.trim();
  }
  return {
    type: platform.type.trim(),
    options,
  };
}

function normalizeProjectDrafts(): CcConnectProject[] {
  return ccConnectProjectDrafts.value
    .map((project) => ({
      name: project.name.trim(),
      adminFrom: project.adminFrom.trim(),
      agentType: project.agentType.trim() || "codex",
      agentOptions: {
        workDir: project.agentOptions.workDir.trim(),
        mode: project.agentOptions.mode.trim(),
        model: project.agentOptions.model.trim(),
      },
      platforms: project.platforms
        .map((platform) => normalizePlatformDraft(platform))
        .filter((platform) => platform.type || Object.keys(platform.options).length),
    }))
    .filter((project) => project.name || project.agentOptions.workDir || project.platforms.length);
}

function serializeCcConnectStructuredDraft(): string {
  return JSON.stringify({
    language: ccConnectLanguageDraft.value.trim() || "zh",
    providers: normalizeProviderDrafts(),
    projects: normalizeProjectDrafts(),
  });
}

function hydrateCcConnectStructuredDraft(config: CcConnectConfig): void {
  ccConnectLanguageDraft.value = config.language || "zh";
  ccConnectProviderDrafts.value = config.providers.map((provider) => createProviderDraft(provider));
  ccConnectProjectDrafts.value = config.projects.map((project) => createProjectDraft(project));
  selectedProjectDraftId.value = ccConnectProjectDrafts.value[0]?.id || "";
  ccConnectStructuredBaseline.value = serializeCcConnectStructuredDraft();
}

function componentTone(status: CodexStackComponentStatus) {
  return codexStackComponentTone(status);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDurationMs(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return text("耗时未记录", "Duration not recorded");
  const ms = Math.max(0, Math.round(value));
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)} s`;
}

function channelLabel(channel: CodexStackChannel): string {
  if (channel === "dmwork") return "DMWork";
  if (channel === "octo") return "Octo";
  return text("官方版", "Official");
}

function installChannelDefaultModel(channel: CodexStackChannel): string {
  return channel === "official" ? "glm-5.1" : "kimi-k2.6";
}

function installChannelDefaultCpaPort(channel: CodexStackChannel): number {
  return channel === "official" ? 8317 : 18795;
}

function syncInstallChannelDefaults(nextChannel: CodexStackChannel, previousChannel: CodexStackChannel): void {
  const previousDefaultModel = installChannelDefaultModel(previousChannel);
  if (!installForm.model || installForm.model === previousDefaultModel) {
    installForm.model = installChannelDefaultModel(nextChannel);
  }

  const previousDefaultPort = installChannelDefaultCpaPort(previousChannel);
  if (!Number(installForm.cpaPort) || Number(installForm.cpaPort) === previousDefaultPort) {
    installForm.cpaPort = installChannelDefaultCpaPort(nextChannel);
  }
}

function yesNo(value: boolean): string {
  return value ? text("是", "Yes") : text("否", "No");
}

function portDisplay(port: number, live: number | null): string {
  if (live && live !== port) return `:${port} (live :${live})`;
  return `:${port}`;
}

function normalizeCodexStackSummary(next: CodexStackSummaryPayload): CodexStackSummaryPayload {
  const cpaAttached = next.codexRoute?.active === "cpa"
    || next.runReadiness?.checks.some((check) => check.id === "codex-provider" && check.status === "pass");
  return {
    ...next,
    codexRoute: next.codexRoute || {
      active: cpaAttached ? "cpa" : "official-chatgpt",
      currentModel: next.models.current || next.models.defaultModel || "gpt-5.5",
      cpaTargetModel: next.profile.defaultModel || next.models.current || next.models.defaultModel || "",
      officialModel: next.models.recommendedFrontier || "gpt-5.5",
    },
    proxyPolicy: normalizeProxyPolicy(next.proxyPolicy),
    runReadiness: next.runReadiness
      ? {
        ...next.runReadiness,
        checks: next.runReadiness.checks.map((check) => normalizeCodexStackRunReadinessCheck(
          check,
          text("查看详情", "View details"),
        )),
        modes: next.runReadiness.modes.map((mode) => normalizeCodexStackRunReadinessMode(
          mode,
          text("查看详情", "View details"),
        )),
      }
      : next.runReadiness,
  };
}

function isSmokeMatrixStale(matrix: CodexStackSmokeMatrixResult | null | undefined): boolean {
  if (!matrix?.attachEligible) return false;
  const checkedAt = Date.parse(matrix.checkedAt);
  if (!Number.isFinite(checkedAt)) return true;
  return Date.now() - checkedAt > SMOKE_MATRIX_MAX_AGE_MS;
}

function normalizeSmokeModel(model: string | null | undefined): string {
  return (model || "").trim();
}

function smokeMatrixCoversTarget(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): boolean {
  const target = normalizeSmokeModel(targetModel);
  if (!target) return true;
  return Boolean(matrix?.requiredModels.some((model) => normalizeSmokeModel(model) === target));
}

function isSmokeMatrixComplete(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): boolean {
  if (!matrix?.attachEligible || matrix.status !== "passed") return false;
  const requiredModels = matrix.requiredModels.map((model) => normalizeSmokeModel(model)).filter(Boolean);
  if (!requiredModels.length) return false;
  if (!smokeMatrixCoversTarget(matrix, targetModel)) return false;
  const declaredRequired = new Set(requiredModels);
  const results = new Map(matrix.models.map((result) => [normalizeSmokeModel(result.model), result]));
  return requiredModels.every((model) => {
    if (!declaredRequired.has(model)) return false;
    const result = results.get(model);
    if (result?.status !== "passed") return false;
    const passedChecks = new Set(result.checks.filter((check) => check.status === "passed").map((check) => check.id));
    return REQUIRED_CPA_SMOKE_CHECKS.every((checkId) => passedChecks.has(checkId));
  });
}

function isSmokeMatrixFreshAndComplete(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): boolean {
  return isSmokeMatrixComplete(matrix, targetModel) && !isSmokeMatrixStale(matrix);
}

function serviceEndpointInfo(serviceId: CodexStackServiceId, currentSummary: CodexStackSummaryPayload) {
  if (serviceId === "cli-proxy-api.service") {
    return {
      endpointLabel: text("端口", "Port"),
      endpointValue: portDisplay(currentSummary.ports.cpa, currentSummary.ports.detectedCpa),
    };
  }
  if (serviceId === "cpa-compact-proxy.service") {
    return {
      endpointLabel: text("端口", "Port"),
      endpointValue: portDisplay(currentSummary.ports.compact, currentSummary.ports.detectedCompact),
    };
  }
  if (serviceId === "cc-connect.service") {
    return {
      endpointLabel: text("套接字", "Socket"),
      endpointValue: currentSummary.ccConnect.socketPath || "--",
    };
  }
  return {
    endpointLabel: text("类型", "Type"),
    endpointValue: text("systemd 定时器", "systemd timer"),
  };
}

function isSummaryServiceActive(serviceId: CodexStackServiceId): boolean {
  return summary.value?.services.find((service) => service.id === serviceId)?.active === true;
}

function componentStatusLabel(component: CodexStackComponentSummary): string {
  const statusLabels: Record<CodexStackComponentStatus, string> = {
    ok: text("健康", "Healthy"),
    missing: text("缺失", "Missing"),
    degraded: text("降级", "Degraded"),
    failed: text("失败", "Failed"),
    unknown: text("未知", "Unknown"),
  };
  return statusLabels[component.status];
}

function jobStatusLabel(status: CodexStackJob["status"]): string {
  const labels: Record<CodexStackJob["status"], string> = {
    queued: text("排队中", "Queued"),
    running: text("执行中", "Running"),
    succeeded: text("已完成", "Succeeded"),
    failed: text("失败", "Failed"),
    interrupted: text("已中断", "Interrupted"),
  };
  return labels[status];
}

function runReadinessLevelShortLabel(level: CodexStackSummaryPayload["runReadiness"]["level"] | undefined): string {
  if (level === "ready") return text("OK", "OK");
  if (level === "attention") return text("复验", "Review");
  if (level === "blocked") return text("阻断", "Block");
  return text("...", "...");
}

function runReadinessCheckTone(status: CodexStackRunReadinessCheckStatus): CodexStackTone {
  if (status === "pass") return "sage";
  if (status === "warn") return "accent";
  return "danger";
}

function setWorkspaceSection(section: SectionId, focusHint: CodexStackWorkspaceFocusHint | null = null): void {
  activeSection.value = section;
  workspaceFocusHint.value = focusHint;
}

function selectWorkspaceSection(section: SectionId): void {
  setWorkspaceSection(section, null);
}

function focusHintForAction(
  title: string,
  copy: string,
  tone: CodexStackTone = "accent",
): CodexStackWorkspaceFocusHint {
  return {
    kicker: text("导航焦点", "Navigation Focus"),
    title,
    copy,
    tone,
  };
}

function guardMutation(): boolean {
  if (!canMutate.value) {
    notice.value = {
      kind: "error",
      text: text("请先启用管理动作。", "Enable management actions first."),
    };
    return false;
  }
  if (jobRunning.value) {
    setWorkspaceSection("logs", focusHintForAction(
      text("已有后台任务正在执行", "Background job is running"),
      text("先查看任务日志，等待安装、修复或配置动作结束后再继续操作。", "Open the job log first and wait for the install, repair, or config action to finish before continuing."),
      "accent",
    ));
    notice.value = {
      kind: "error",
      text: text("已有后台任务正在执行，请等待完成后再操作。", "A background job is already running. Wait for it to finish before making another change."),
    };
    return false;
  }
  return !busy.value;
}

function nextActionPrimary(): void {
  switch (activeRecommendation.value?.primaryAction) {
    case "run-check":
      void runCheck();
      return;
    case "repair-recommended":
      void repairRecommended();
      return;
    case "open-install":
      setWorkspaceSection("install", focusHintForAction(nextActionTitle.value, nextActionCopy.value));
      return;
    case "open-cc-connect":
      setWorkspaceSection("cc-connect", focusHintForAction(nextActionTitle.value, nextActionCopy.value));
      return;
    case "open-logs":
      setWorkspaceSection("logs", focusHintForAction(nextActionTitle.value, nextActionCopy.value));
      return;
    case "open-settings":
      setWorkspaceSection("settings", focusHintForAction(nextActionTitle.value, nextActionCopy.value));
      return;
    default:
      setWorkspaceSection(nextActionSection.value, focusHintForAction(nextActionTitle.value, nextActionCopy.value));
  }
}

function runReadinessCheckAction(check: CodexStackRunReadinessCheck): void {
  const command = resolveCodexStackRunReadinessAction(check, text("查看详情", "View details"));
  if (command.type === "run-check") {
    void runCheck();
    return;
  }
  if (command.type === "repair") {
    void startRepairWithActions(command.actions, text("就绪检查修复任务已启动。", "Readiness repair job started."));
    return;
  }
  setWorkspaceSection(command.section, focusHintForAction(
    text(`检查项：${check.label}`, `Check: ${check.label}`),
    check.detail,
    runReadinessCheckTone(check.status),
  ));
}

function runReadinessModeAction(mode: CodexStackRunReadinessMode): void {
  const command = resolveCodexStackRunReadinessModeAction(mode, text("查看详情", "View details"));
  if (command.type === "run-check") {
    void runCheck();
    return;
  }
  if (command.type === "repair") {
    void startRepairWithActions(command.actions, text("运行模式修复任务已启动。", "Run mode repair job started."));
    return;
  }
  setWorkspaceSection(command.section, focusHintForAction(
    text(`运行模式：${mode.label}`, `Run mode: ${mode.label}`),
    mode.detail,
    mode.ready ? "sage" : runReadinessTone.value,
  ));
}

function hydrateConfigFormFromSummary(normalized: CodexStackSummaryPayload): void {
  configForm.defaultModel = normalized.profile.defaultModel || normalized.models.current || normalized.models.defaultModel || "kimi-k2.6";
  configForm.contextMode = normalized.context.mode || "default";
  configForm.contextWindowTokens = normalized.context.tokens || normalized.context.recommendedTokens;
  configForm.cpaPort = normalized.ports.cpa;
  configForm.compactPort = normalized.ports.compact;
  configForm.ccConnectProject = normalized.ccConnect.project || normalized.profile.ccConnectProject || "main";
  configForm.upstreamBaseUrl = normalized.proxyPolicy.upstreamBaseUrl || "";
  configForm.upstreamApiKey = "";
  configForm.providerProxyUrl = normalized.proxyPolicy.providerProxyUrl || "";
  configForm.noProxy = normalized.proxyPolicy.noProxy || DEFAULT_NO_PROXY;
}

function hydrateInstallFormFromSummary(normalized: CodexStackSummaryPayload): void {
  installForm.model = normalized.profile.defaultModel || normalized.models.current || normalized.models.defaultModel || "kimi-k2.6";
  installForm.contextMode = normalized.context.mode || "default";
  installForm.contextWindowTokens = normalized.context.tokens || normalized.context.recommendedTokens;
  installForm.cpaPort = normalized.ports.cpa;
  installForm.compactPort = normalized.ports.compact;
  installForm.channel = normalized.installer.channel;
  installForm.cpaKey = "";
  installForm.upstreamBaseUrl = normalized.proxyPolicy.upstreamBaseUrl || "";
  installForm.upstreamApiKey = "";
  installForm.providerProxyUrl = normalized.proxyPolicy.providerProxyUrl || "";
  installForm.noProxy = normalized.proxyPolicy.noProxy || DEFAULT_NO_PROXY;
  installForm.skipNpm = false;
  installForm.skipCcConnect = false;
  installForm.noStart = false;
  installForm.skipExisting = false;
  installForm.forceReinstall = false;
  installForm.skipComponents = [];
  installForm.forceComponents = [];
}

function applySummary(next: CodexStackSummaryPayload, options: ApplySummaryOptions = {}): void {
  const keepConfigDraft = (options.preserveDirtyConfigDraft ?? true)
    && Boolean(summary.value)
    && hasConfigPatchChanges.value;
  const keepInstallDraft = (options.preserveDirtyInstallDraft ?? true)
    && Boolean(summary.value)
    && hasInstallDraftChanges.value;
  const normalized = normalizeCodexStackSummary(next);
  summary.value = normalized;
  if (!keepInstallDraft) hydrateInstallFormFromSummary(normalized);
  if (!keepConfigDraft) hydrateConfigFormFromSummary(normalized);
}

async function loadSummary(): Promise<void> {
  loading.value = true;
  try {
    applySummary(await fetchCodexStackSummary());
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("读取状态失败", "Failed to load status"),
    };
  } finally {
    loading.value = false;
  }
}

async function loadCcConnectConfig(silent = false, options: CcConnectLoadOptions = {}): Promise<void> {
  const preserveDirtyDrafts = options.preserveDirtyDrafts ?? true;
  const keepRawDraft = preserveDirtyDrafts
    && Boolean(ccConnectConfig.value)
    && hasCcConnectRawChanges.value;
  const keepStructuredDraft = preserveDirtyDrafts
    && Boolean(ccConnectConfig.value)
    && hasCcConnectStructuredChanges.value;
  ccConnectLoading.value = true;
  try {
    const config = await fetchCcConnectConfig();
    ccConnectConfig.value = config;
    if (!keepRawDraft) ccConnectRawDraft.value = config.raw;
    if (!keepStructuredDraft) hydrateCcConnectStructuredDraft(config);
  } catch (error) {
    if (!silent) {
      notice.value = {
        kind: "error",
        text: error instanceof Error ? error.message : text("读取 cc-connect 配置失败", "Failed to load cc-connect config"),
      };
    }
  } finally {
    ccConnectLoading.value = false;
  }
}

async function loadAll(silent = false, ccConnectOptions: CcConnectLoadOptions = {}): Promise<void> {
  await Promise.all([loadSummary(), loadCcConnectConfig(silent, ccConnectOptions)]);
}

async function enableManagement(): Promise<void> {
  busy.value = true;
  try {
    const response = await enableCodexStackManagement();
    if (response.summary) applySummary(response.summary);
    notice.value = { kind: "success", text: text("已启用 Codex 栈管理动作。", "Codex Stack management actions enabled.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("启用失败", "Enable failed") };
  } finally {
    busy.value = false;
  }
}

function buildInstallPayload(
  skipCcConnect = installForm.skipCcConnect,
  flagOverrides: Partial<{
    skipExisting: boolean;
    forceReinstall: boolean;
  }> = {},
) {
  return {
    env: {
      CODEX_MODEL: installForm.model || undefined,
      CODEX_CONTEXT_MODE: installForm.contextMode,
      CODEX_CONTEXT_WINDOW: installForm.contextMode === "custom" ? Number(installForm.contextWindowTokens) || undefined : undefined,
      CPA_PORT: Number(installForm.cpaPort) || undefined,
      COMPACT_PORT: Number(installForm.compactPort) || undefined,
      CPA_PROXY_KEY: installForm.cpaKey || undefined,
      OPENCLAW_UPSTREAM_BASE_URL: installForm.upstreamBaseUrl || undefined,
      OPENCLAW_UPSTREAM_API_KEY: installForm.upstreamApiKey || undefined,
      OPENCLAW_PROVIDER_PROXY_URL: installForm.providerProxyUrl || undefined,
      OPENCLAW_NO_PROXY: installForm.noProxy || undefined,
    },
    flags: {
      skipNpm: installForm.skipNpm,
      skipCcConnect,
      noStart: installForm.noStart,
      skipExisting: flagOverrides.skipExisting ?? installForm.skipExisting,
      forceReinstall: flagOverrides.forceReinstall ?? installForm.forceReinstall,
      skipComponents: installForm.skipComponents.length ? installForm.skipComponents : undefined,
      forceReinstallComponents: installForm.forceComponents.length ? installForm.forceComponents : undefined,
      channel: installForm.channel,
    },
  };
}

function stopPollingJob(): void {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function stopLogPolling(): void {
  if (logPollTimer) {
    window.clearInterval(logPollTimer);
    logPollTimer = null;
  }
}

function syncLogPolling(): void {
  stopLogPolling();
  if (!logAutoRefresh.value) return;
  logPollTimer = window.setInterval(() => {
    void loadLogs(selectedLogService.value, true);
  }, logLineMode.value === "deep" ? 6000 : 3500);
}

function startPollingJob(job: CodexStackJob): void {
  activeJob.value = job;
  stopPollingJob();
  pollTimer = window.setInterval(async () => {
    if (!activeJob.value) return;
    try {
      const response = await fetchCodexStackJob(activeJob.value.id);
      activeJob.value = response.job;
      if (!isCodexStackJobRunning(response.job)) {
        const finishedJob = response.job;
        stopPollingJob();
        await loadAll(true);
        if (finishedJob.kind === "install" && finishedJob.status === "succeeded" && summary.value) {
          hydrateInstallFormFromSummary(summary.value);
        }
        if (finishedJob.kind === "install" && finishedJob.status === "succeeded") {
          notice.value = {
            kind: "success",
            text: summary.value?.ccConnect.bindingPresent
              ? text("安装完成，cc-connect 已检测到绑定，可运行检查确认。", "Install completed. cc-connect binding was detected; run checks to confirm.")
              : text("安装完成。下一步在 cc-connect 面板执行 Feishu/Weixin 扫码绑定，绑定后点击 finalizer。", "Install completed. Next, run Feishu/Weixin QR binding in the cc-connect panel, then click the finalizer."),
          };
        }
      }
    } catch (error) {
      stopPollingJob();
      notice.value = {
        kind: "error",
        text: error instanceof Error ? error.message : text("任务状态轮询失败", "Failed to poll job status"),
      };
    }
  }, 2000);
}

async function installFullStack(): Promise<void> {
  if (!guardMutation()) return;
  
  if (installForm.cpaKey && installForm.cpaKey.length > 72) {
    notice.value = { kind: "error", text: text("代理密钥长度不能超过 72 个字符。", "Proxy key length cannot exceed 72 characters.") };
    return;
  }
  
  busy.value = true;
  try {
    const response = await startCodexStackInstall(buildInstallPayload(false));
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("安装任务已启动。", "Install job started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("安装启动失败", "Install failed to start") };
  } finally {
    busy.value = false;
  }
}

async function installBaseOnly(): Promise<void> {
  if (!guardMutation()) return;
  
  if (installForm.cpaKey && installForm.cpaKey.length > 72) {
    notice.value = { kind: "error", text: text("代理密钥长度不能超过 72 个字符。", "Proxy key length cannot exceed 72 characters.") };
    return;
  }
  
  busy.value = true;
  try {
    const response = await startCodexStackInstall(buildInstallPayload(true));
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("基础安装任务已启动。", "Base install job started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("安装启动失败", "Install failed to start") };
  } finally {
    busy.value = false;
  }
}

async function reinstallFullStack(): Promise<void> {
  if (!guardMutation()) return;

  if (installForm.cpaKey && installForm.cpaKey.length > 72) {
    notice.value = { kind: "error", text: text("代理密钥长度不能超过 72 个字符。", "Proxy key length cannot exceed 72 characters.") };
    return;
  }

  busy.value = true;
  try {
    const response = await startCodexStackInstall(buildInstallPayload(false, {
      forceReinstall: true,
      skipExisting: false,
    }));
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("重新安装任务已启动。", "Reinstall job started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("重新安装启动失败", "Reinstall failed to start") };
  } finally {
    busy.value = false;
  }
}

async function runCheck(): Promise<void> {
  if (jobRunning.value) {
    setWorkspaceSection("logs", focusHintForAction(
      text("已有后台任务正在执行", "Background job is running"),
      text("先查看任务日志，等待当前任务结束后再运行健康检查。", "Open the job log first and wait for the current task to finish before running a health check."),
      "accent",
    ));
    notice.value = {
      kind: "error",
      text: text("已有后台任务正在执行，请等待完成后再运行健康检查。", "A background job is already running. Wait for it to finish before running a health check."),
    };
    return;
  }
  if (busy.value) return;
  checkDialogOpen.value = true;
  healthCheckRunning.value = true;
  busy.value = true;
  try {
    const response = await runCodexStackCheck();
    checkOutput.value = response.outputTail;
    notice.value = {
      kind: response.ok ? "success" : "error",
      text: response.ok ? text("检查完成。", "Check completed.") : text("检查发现失败项。", "Check found failures."),
    };
    await loadSummary();
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("检查失败", "Check failed") };
  } finally {
    healthCheckRunning.value = false;
    busy.value = false;
  }
}

async function repairRecommended(): Promise<void> {
  if (!summary.value) return;
  await startRepairWithActions(
    buildCodexStackRepairActions(summary.value),
    text("修复任务已启动。", "Repair job started."),
  );
}

async function repairConflictingUnits(): Promise<void> {
  await startRepairWithActions(
    ["disable-conflicting-units", "restart-cpa", "restart-compact-proxy"],
    text("冲突服务清理任务已启动。", "Conflict cleanup repair job started."),
  );
}

async function repairConfigOnly(): Promise<void> {
  await startRepairWithActions(
    ["rerun-install-no-start"],
    text("配置修复任务已启动。", "Config repair job started."),
  );
}

async function pauseStack(): Promise<void> {
  await startRepairWithActions(
    ["pause-stack"],
    text("CPA 栈暂停任务已启动。", "CPA stack pause job started."),
  );
}

async function resumeStack(): Promise<void> {
  await startRepairWithActions(
    ["resume-stack"],
    text("CPA 栈恢复任务已启动。", "CPA stack resume job started."),
  );
}

async function runSmokeMatrix(): Promise<void> {
  await startRepairWithActions(
    ["run-smoke-matrix"],
    text("CPA 模型矩阵验证已启动；不会切换 Codex。", "CPA smoke matrix started; Codex will not be attached."),
  );
}

async function applyCodexCpaAfterSmoke(): Promise<void> {
  await startRepairWithActions(
    ["apply-codex-cpa-after-smoke"],
    text("CPA smoke matrix 任务已启动；全部通过后才会切换 Codex。", "CPA smoke matrix started; Codex will attach only if every check passes."),
  );
}

async function forceAttachCodexCpa(): Promise<void> {
  await startRepairWithActions(
    ["force-apply-codex-cpa"],
    text("已启动强制 CPA 切换；未通过 smoke 时 Codex 请求可能失败。", "Forced CPA attach started; Codex requests may fail without a passing smoke gate."),
  );
}

async function restoreOfficialChatGpt(): Promise<void> {
  await startRepairWithActions(
    ["restore-official-chatgpt"],
    text("已启动切回官方 ChatGPT 路径。", "Official ChatGPT route restore started."),
  );
}

async function startRepairWithActions(actions: CodexStackRepairAction[], successText: string): Promise<void> {
  if (!actions.length) return;
  if (!guardMutation()) return;
  busy.value = true;
  try {
    const response = await startCodexStackRepair({ actions });
    startPollingJob(response.job);
    notice.value = { kind: "success", text: successText };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("修复启动失败", "Repair failed to start") };
  } finally {
    busy.value = false;
  }
}

async function serviceAction(serviceId: CodexStackServiceId, action: CodexStackServiceAction): Promise<void> {
  if (!guardMutation()) return;
  if ((action === "start" || action === "restart") && serviceId === "cpa-compact-proxy.service" && !isSummaryServiceActive("cli-proxy-api.service")) {
    await resumeStack();
    return;
  }
  if ((action === "start" || action === "restart") && serviceId === "codex-stack-watchdog.timer" && (
    !isSummaryServiceActive("cli-proxy-api.service") || !isSummaryServiceActive("cpa-compact-proxy.service")
  )) {
    await resumeStack();
    return;
  }
  busy.value = true;
  try {
    const response = await controlCodexStackService(serviceId, action);
    if (response.summary) applySummary(response.summary);
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("服务操作失败", "Service action failed") };
  } finally {
    busy.value = false;
  }
}

async function saveConfigPatch(): Promise<void> {
  if (!guardMutation()) return;
  await saveConfigPatchInternal();
}

async function saveConfigPatchInternal(): Promise<boolean> {
  const payload = configPatchPayload.value;
  if (!Object.keys(payload).length) {
    notice.value = { kind: "success", text: text("运行配置没有变化。", "Runtime config has no changes.") };
    return true;
  }
  busy.value = true;
  try {
    const response = await patchCodexStackConfig(payload);
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    configForm.cpaProxyKey = "";
    configForm.upstreamApiKey = "";
    if (response.summary) applySummary(response.summary, { preserveDirtyConfigDraft: false });
    notice.value = { kind: "success", text: response.message };
    return true;
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("配置保存失败", "Config save failed") };
    return false;
  } finally {
    busy.value = false;
  }
}

async function confirmRouteChange(kind: "official" | "cpa" | "force-cpa"): Promise<boolean> {
  const targetModel = configForm.defaultModel || currentCpaTargetModel.value || "--";
  if (kind === "official") {
    return confirm({
      title: text("保存并使用官方 ChatGPT", "Save and use Official ChatGPT"),
      message: text(
        "将先保存当前运行配置，然后把 Codex 切回官方 ChatGPT 登录路径。CPA 上游配置会保留，但不会作为当前 Codex 路径；如果之前备份过 ChatGPT 登录态，会自动恢复。",
        "Studio will save the current runtime config, then switch Codex back to the official ChatGPT login route. CPA upstream config remains saved but inactive; a preserved ChatGPT login is restored when available.",
      ),
      confirmText: text("保存并切回官方", "Save and switch official"),
      cancelText: text("取消", "Cancel"),
      tone: "safe",
    });
  }
  if (kind === "force-cpa") {
    return confirm({
      title: text("强制使用 CPA", "Force CPA"),
      message: text(
        `将先保存配置，然后不等待 smoke 通过，直接把 Codex 切到 CPA 目标模型 ${targetModel}。如果上游、代理、流式或压缩上下文不稳定，Codex 普通请求、长任务和压缩上下文可能失败。`,
        `Studio will save config, then switch Codex directly to CPA target model ${targetModel} without waiting for smoke to pass. If upstream, proxy, streaming, or compaction is unstable, ordinary Codex requests, long tasks, and compaction may fail.`,
      ),
      confirmText: text("知道风险，强制切换", "Force switch"),
      cancelText: text("取消", "Cancel"),
      tone: "danger",
    });
  }
  return confirm({
    title: text("保存并验证 CPA", "Save and verify CPA"),
    message: text(
      `将先保存模型/上游配置，然后用目标模型 ${targetModel} 运行 CPA smoke。只有普通请求、非流式、流式和压缩上下文全部通过，才会把 Codex 切到 CPA；失败时保持当前路径不变。`,
      `Studio will save the model/upstream config, then run CPA smoke with target model ${targetModel}. Codex switches to CPA only if ordinary, non-streaming, streaming, and compaction checks all pass; failures leave the current route unchanged.`,
    ),
    confirmText: text("保存并验证切换", "Save and verify"),
    cancelText: text("取消", "Cancel"),
    tone: "safe",
  });
}

async function saveConfigThenAttachCpa(): Promise<void> {
  if (!guardMutation()) return;
  if (!await confirmRouteChange("cpa")) return;
  if (!await saveConfigPatchInternal()) return;
  await applyCodexCpaAfterSmoke();
}

async function saveConfigThenForceCpa(): Promise<void> {
  if (!guardMutation()) return;
  if (!await confirmRouteChange("force-cpa")) return;
  if (!await saveConfigPatchInternal()) return;
  await forceAttachCodexCpa();
}

async function saveConfigThenUseOfficial(): Promise<void> {
  if (!guardMutation()) return;
  if (!await confirmRouteChange("official")) return;
  if (!await saveConfigPatchInternal()) return;
  await restoreOfficialChatGpt();
}

function addCcConnectProvider(): void {
  ccConnectProviderDrafts.value.push(createProviderDraft({
    name: ccConnectProviderDrafts.value.some((provider) => provider.name === "cpa")
      ? `provider-${ccConnectProviderDrafts.value.length + 1}`
      : "cpa",
  }));
}

function removeCcConnectProvider(providerId: string): void {
  ccConnectProviderDrafts.value = ccConnectProviderDrafts.value.filter((provider) => provider.id !== providerId);
}

function updateCcConnectLanguage(language: string): void {
  ccConnectLanguageDraft.value = language;
}

function updateCcConnectProviderField(providerId: string, field: CodexStackCcConnectProviderField, value: string): void {
  const provider = ccConnectProviderDrafts.value.find((item) => item.id === providerId);
  if (provider) provider[field] = value;
}

function updateCcConnectRawDraft(raw: string): void {
  ccConnectRawDraft.value = raw;
}

function addCcConnectProject(): void {
  const project = createProjectDraft({
    name: `project-${ccConnectProjectDrafts.value.length + 1}`,
  });
  ccConnectProjectDrafts.value.push(project);
  selectedProjectDraftId.value = project.id;
  activeAgentPane.value = "projects";
}

function addCcConnectProjectPreset(preset: AgentProjectPreset): void {
  const index = ccConnectProjectDrafts.value.length + 1;
  const homeDir = summary.value?.homeDir || "~";
  const project = createProjectDraft({
    name: preset === "admin" && !ccConnectProjectDrafts.value.some((item) => item.name === "main") ? "main" : `${preset}-agent-${index}`,
    adminFrom: "",
    agentType: "codex",
    agentOptions: {
      workDir: preset === "admin" ? `${homeDir}/.openclaw` : `${homeDir}/.openclaw/workspace/${preset}-agent-${index}`,
      mode: preset === "admin" ? "suggest" : "yolo",
      model: configForm.defaultModel || installForm.model || summary.value?.models.current || "kimi-k2.6",
    },
    platforms: [{ type: installForm.channel === "official" ? "dmwork" : (installForm.channel === "octo" ? "octo" : "dmwork"), options: { api_url: "https://im.deepminer.com.cn/api" } }],
  });
  ccConnectProjectDrafts.value.push(project);
  selectedProjectDraftId.value = project.id;
  activeAgentPane.value = "projects";
}

function removeCcConnectProject(projectId: string): void {
  ccConnectProjectDrafts.value = ccConnectProjectDrafts.value.filter((project) => project.id !== projectId);
  if (selectedProjectDraftId.value === projectId) {
    selectedProjectDraftId.value = ccConnectProjectDrafts.value[0]?.id || "";
  }
}

function selectCcConnectProject(projectId: string): void {
  selectedProjectDraftId.value = projectId;
  activeAgentPane.value = "projects";
}

function setActiveAgentPane(paneId: AgentPaneId): void {
  activeAgentPane.value = paneId;
}

function findCcConnectProjectDraft(projectId: string): CcConnectProjectDraft | undefined {
  return ccConnectProjectDrafts.value.find((project) => project.id === projectId);
}

function findCcConnectPlatformDraft(platformId: string): CcConnectPlatformDraft | undefined {
  return selectedProjectDraft.value?.platforms.find((platform) => platform.id === platformId);
}

function updateCcConnectProjectField(
  projectId: string,
  field: CodexStackCcConnectProjectField,
  value: string,
): void {
  const project = findCcConnectProjectDraft(projectId);
  if (project) project[field] = value;
}

function updateCcConnectAgentOption(
  projectId: string,
  field: CodexStackCcConnectAgentOptionField,
  value: string,
): void {
  const project = findCcConnectProjectDraft(projectId);
  if (project) project.agentOptions[field] = value;
}

function removeCcConnectPlatform(project: CcConnectProjectDraft, platformId: string): void {
  project.platforms = project.platforms.filter((platform) => platform.id !== platformId);
}

function addPlatformToSelectedProject(type: PlatformTemplateId = "octo"): void {
  if (!selectedProjectDraft.value) return;
  selectedProjectDraft.value.platforms.push(createPlatformDraft(undefined, type));
}

function removePlatformFromSelectedProject(platformId: string): void {
  if (!selectedProjectDraft.value) return;
  removeCcConnectPlatform(selectedProjectDraft.value, platformId);
}

function addCcConnectPlatformOption(platform: CcConnectPlatformDraft): void {
  platform.optionRows.push(createPlatformOptionDraft());
}

function addCcConnectPlatformOptionById(platformId: string): void {
  const platform = findCcConnectPlatformDraft(platformId);
  if (platform) addCcConnectPlatformOption(platform);
}

function removeCcConnectPlatformOption(platform: CcConnectPlatformDraft, optionId: string): void {
  platform.optionRows = platform.optionRows.filter((row) => row.id !== optionId);
}

function removeCcConnectPlatformOptionById(platformId: string, optionId: string): void {
  const platform = findCcConnectPlatformDraft(platformId);
  if (platform) removeCcConnectPlatformOption(platform, optionId);
}

function updateCcConnectPlatformType(platformId: string, value: string): void {
  const platform = findCcConnectPlatformDraft(platformId);
  if (platform) platform.type = value;
}

function updateCcConnectPlatformOption(
  platformId: string,
  optionId: string,
  field: CodexStackCcConnectPlatformOptionField,
  value: string,
): void {
  const platform = findCcConnectPlatformDraft(platformId);
  const option = platform?.optionRows.find((row) => row.id === optionId);
  if (option) option[field] = value;
}

function applyDefaultModelToCcConnectProjects(): void {
  const nextModel = configForm.defaultModel || installForm.model || summary.value?.models.current || "";
  if (!nextModel) return;
  for (const project of ccConnectProjectDrafts.value) {
    project.agentOptions.model = nextModel;
  }
}

function ensureCpaProviderDraft(): void {
  const existing = ccConnectProviderDrafts.value.find((provider) => provider.name === "cpa");
  if (existing) {
    existing.baseUrl = existing.baseUrl || compactProxyBaseUrl.value;
    existing.codexEnvKey = existing.codexEnvKey || "OPENAI_API_KEY";
    return;
  }
  ccConnectProviderDrafts.value.unshift(createProviderDraft({ name: "cpa", baseUrl: compactProxyBaseUrl.value }));
}

async function saveCcConnectStructured(): Promise<void> {
  if (!hasCcConnectStructuredChanges.value) {
    notice.value = { kind: "success", text: text("cc-connect 可视化配置没有变化。", "cc-connect visual config has no changes.") };
    return;
  }
  if (!guardMutation()) return;
  const confirmed = await confirm({
    title: text("保存 cc-connect 可视化配置", "Save cc-connect visual config"),
    message: text(
      "保存后会重写 providers/projects 区块；原始 TOML 的其它全局段会尽量保留，cc-connect.service 如在运行会自动重启。继续吗？",
      "Saving rewrites providers/projects sections while preserving other global TOML blocks where possible. cc-connect.service restarts if it is running. Continue?",
    ),
    confirmText: text("保存并应用", "Save and apply"),
    cancelText: text("取消", "Cancel"),
    tone: "safe",
  });
  if (!confirmed) return;

  busy.value = true;
  try {
    const response = await patchCcConnectConfig({
      language: ccConnectLanguageDraft.value.trim() || "zh",
      providers: normalizeProviderDrafts(),
      projects: normalizeProjectDrafts(),
    });
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    if (response.summary) applySummary(response.summary);
    await loadCcConnectConfig(true, { preserveDirtyDrafts: false });
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("保存 cc-connect 可视化配置失败", "Failed to save cc-connect visual config"),
    };
  } finally {
    busy.value = false;
  }
}

async function saveCcConnectRaw(): Promise<void> {
  if (!hasCcConnectRawChanges.value) {
    notice.value = { kind: "success", text: text("cc-connect 配置没有变化。", "cc-connect config has no changes.") };
    return;
  }
  if (!guardMutation()) return;
  const confirmed = await confirm({
    title: text("保存 cc-connect 配置", "Save cc-connect config"),
    message: text(
      "保存后如果 cc-connect.service 正在运行会自动重启。继续吗？",
      "Saving will restart cc-connect.service if it is running. Continue?",
    ),
    confirmText: text("保存并应用", "Save and apply"),
    cancelText: text("取消", "Cancel"),
    tone: "safe",
  });
  if (!confirmed) return;

  busy.value = true;
  try {
    const response = await patchCcConnectConfig({ raw: ccConnectRawDraft.value });
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    if (response.summary) applySummary(response.summary);
    await loadCcConnectConfig(true, { preserveDirtyDrafts: false });
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("保存 cc-connect 配置失败", "Failed to save cc-connect config"),
    };
  } finally {
    busy.value = false;
  }
}

async function copySetupCommand(platform: CodexStackCcConnectSetupPlatform): Promise<void> {
  const command = `cc-connect ${platform} setup --project ${primaryCcConnectProjectName.value}`;
  const copied = await copyTextToClipboard(command);
  notice.value = copied
    ? { kind: "success", text: text(`已复制命令: ${command}`, `Copied command: ${command}`) }
    : { kind: "error", text: text(`复制失败，请手动执行: ${command}`, `Copy failed. Run manually: ${command}`) };
}

async function finalizeCcConnect(): Promise<void> {
  if (!guardMutation()) return;
  busy.value = true;
  try {
    const response = await finalizeCodexStackCcConnect({ project: summary.value?.ccConnect.project || "main" });
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("cc-connect finalizer 已启动。", "cc-connect finalizer started.") };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("cc-connect finalizer 失败", "cc-connect finalizer failed"),
    };
  } finally {
    busy.value = false;
  }
}

async function loadLogs(serviceId: CodexStackServiceId, silent = false): Promise<void> {
  if (logRequestInFlight) {
    queuedLogRequest = { serviceId, silent };
    return;
  }
  logRequestInFlight = true;
  selectedLogService.value = serviceId;
  logRefreshing.value = true;
  try {
    const response = await fetchCodexStackLogs(serviceId, logLineLimit.value);
    logOutput.value = response.output;
    logMeta.value = response;
  } catch (error) {
    if (!silent) {
      notice.value = { kind: "error", text: error instanceof Error ? error.message : text("读取日志失败", "Failed to load logs") };
    }
  } finally {
    logRefreshing.value = false;
    logRequestInFlight = false;
    const nextRequest = queuedLogRequest;
    queuedLogRequest = null;
    if (nextRequest) {
      void loadLogs(nextRequest.serviceId, nextRequest.silent);
    }
  }
}

function installMode(componentId: CodexStackComponentId): ComponentInstallMode {
  if (installForm.skipComponents.includes(componentId)) return "skip";
  if (installForm.forceComponents.includes(componentId)) return "force";
  return "default";
}

function setComponentMode(componentId: CodexStackComponentId, mode: ComponentInstallMode): void {
  removeFromArray(installForm.skipComponents, componentId);
  removeFromArray(installForm.forceComponents, componentId);
  if (mode === "skip") installForm.skipComponents.push(componentId);
  if (mode === "force") installForm.forceComponents.push(componentId);
}

function installModeLabel(componentId: CodexStackComponentId): string {
  const mode = installMode(componentId);
  if (mode === "skip") return text("当前将跳过安装或覆盖。", "This component will be skipped.");
  if (mode === "force") return text("当前将强制重新安装。", "This component will be force reinstalled.");
  return text("保持默认安装策略。", "Default install behavior.");
}

function removeFromArray(list: string[], value: string): void {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
}

onMounted(() => {
  void loadAll(true);
  void loadLogs(selectedLogService.value);
});

onUnmounted(() => {
  stopPollingJob();
  stopLogPolling();
});

watch([logAutoRefresh, logLineMode, selectedLogService], () => {
  syncLogPolling();
  void loadLogs(selectedLogService.value, true);
});

watch(() => installForm.channel, (nextChannel, previousChannel) => {
  syncInstallChannelDefaults(nextChannel, previousChannel);
});
</script>

<style scoped>
.codex-stack-page {
  gap: 18px;
}

.cs-install-options-panel {
  border: 1px solid color-mix(in srgb, var(--line) 86%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
}

.cs-dashboard-details-panel {
  border: 1px solid color-mix(in srgb, var(--line) 86%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
}

.cs-install-options-panel summary {
  display: flex;
  gap: 8px 14px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  color: var(--text);
  font-weight: 700;
}

.cs-dashboard-details-panel summary {
  display: flex;
  gap: 8px 14px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  color: var(--text);
  font-weight: 700;
}

.cs-install-options-panel summary small {
  max-width: 560px;
  color: var(--text-soft);
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.4;
  text-align: right;
}

.cs-dashboard-details-panel summary small {
  max-width: 640px;
  color: var(--text-soft);
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.4;
  text-align: right;
}

.cs-install-options-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  border-top: 1px solid var(--line);
  padding: 18px;
}

.cs-dashboard-details-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  border-top: 1px solid var(--line);
  padding: 18px;
}

@media (max-width: 760px) {
  .cs-install-options-panel summary,
  .cs-dashboard-details-panel summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .cs-install-options-panel summary small,
  .cs-dashboard-details-panel summary small {
    text-align: left;
  }
}
</style>
