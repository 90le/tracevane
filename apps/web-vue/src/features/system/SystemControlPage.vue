<template>
  <section class="page-shell system-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">System</p>
        <h2 class="page-title">{{ text('系统诊断', 'System Diagnostics') }}</h2>
        <p class="page-copy">
          {{
            text(
              '把系统页改成真实诊断台：左侧只看当前运行态摘要，右侧按主题查看 gateway、runtime、doctor 和原始输出。',
              'The system page is now a real diagnostics workspace: the left side keeps the live summary, while the right side breaks gateway, runtime, doctor, and raw output into focused views.'
            )
          }}
        </p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="controlActionSummary.refreshing" @click="refreshAll">
          {{ controlActionSummary.refreshLabel }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-else-if="loading && !healthLoaded" class="status-banner">
      {{ text('正在加载系统健康状态…', 'Loading system health…') }}
    </div>
    <div v-else-if="notice" class="status-banner" :class="{ 'status-banner-error': notice.kind === 'error' }">{{ notice.text }}</div>
    <div v-else-if="diagnosticsLoading && healthLoaded && !diagnosticsLoaded" class="status-banner">
      {{ text('基础健康状态已就绪，深诊断仍在加载中…', 'Basic health is ready; deep diagnostics are still loading...') }}
    </div>

    <section class="system-workbench">
      <aside class="system-sidebar">
        <SystemSectionRail
          :title="text('HEALTH', 'HEALTH')"
          :subtitle="text('当前状态', 'Current Status')"
          :copy="text('优先看 Gateway、systemd、Node、内存和诊断摘要。', 'Start with Gateway, systemd, Node, memory, and the current diagnostic summary.')"
          :health-summary="healthSummary"
          :event-summary-items="eventSummaryItems"
          :quick-actions="quickActions"
          @navigate="handleSystemNavigate"
        />

        <SystemActionHandoffPanel
          :title="text('终端联动', 'Terminal Handoff')"
          :copy="text('系统侧动作交给终端会话执行，确保跳转指向稳定 session 路由。', 'System actions can continue in Terminal with a stable session route handoff.')"
          :action-label="text('进入终端会话', 'Open terminal session')"
          :route-label="text('路由', 'Route')"
          :route-target="terminalHandoff.to"
          @handoff="openTerminalHandoff"
        />
      </aside>

      <section class="system-stage">
        <article class="panel-card system-stage-header">
          <div class="system-stage-head">
            <div>
              <p class="eyebrow">{{ stageHeader.eyebrow }}</p>
              <h3 class="system-stage-title">{{ stageHeader.title }}</h3>
              <p class="panel-muted">{{ stageHeader.copy }}</p>
            </div>

            <div class="system-stage-facts">
              <div v-for="fact in stageHeader.facts" :key="fact.label" class="system-stage-fact">
                <span>{{ fact.label }}</span>
                <strong>{{ fact.value }}</strong>
              </div>
            </div>
          </div>

          <nav class="system-stage-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="system-stage-tab"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              <span aria-hidden="true">{{ tab.icon }}</span>
              <span>{{ tab.label }}</span>
            </button>
          </nav>
        </article>

        <SystemOverviewPanel
          v-if="activeTab === 'overview'"
          :health-title="text('快速健康', 'Quick Health')"
          :health-copy="text('这是最轻量的一层健康摘要，不依赖重型 CLI 诊断。', 'This is the lightest health summary layer and does not depend on heavyweight CLI diagnostics.')"
          :runtime-title="text('运行摘要', 'Runtime Summary')"
          :runtime-copy="text('这些值直接来自 `openclaw status --json` 与本地状态文件聚合。', 'These values come from `openclaw status --json` and local state file aggregation.')"
          :health-cards="overviewCards.healthCards"
          :runtime-cards="overviewCards.runtimeCards"
        />

        <article v-else-if="activeTab === 'release'" class="panel-card system-stage-panel">
          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('Studio 版本与升级', 'Studio Release and Upgrade') }}</h3>
                <p>{{ text('统一查看当前版本、站点最新版本、最低宿主要求，以及一键升级任务状态。', 'Review the current version, latest site release, minimum host requirement, and the one-click upgrade task in one place.') }}</p>
              </div>
              <div class="system-inline-actions">
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="releaseBusy"
                  @click="checkStudioRelease"
                >
                  {{ releaseCheckRunning ? text('检查中...', 'Checking...') : text('检查更新', 'Check updates') }}
                </button>
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="releaseBusy"
                  @click="handleStudioUpgradeAction"
                >
                  {{ studioUpgradeActionLabel }}
                </button>
              </div>
            </div>

            <div class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('当前版本', 'Current Version') }}</span>
                <strong>{{ studioRelease.currentVersion || diagnostics.config.version || text('未知', 'Unknown') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('最新版本', 'Latest Version') }}</span>
                <strong>{{ studioRelease.latestVersion || text('未知', 'Unknown') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('最低宿主版本', 'Minimum Host Version') }}</span>
                <strong>{{ studioRelease.minOpenClawVersion || text('未知', 'Unknown') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('升级状态', 'Upgrade Status') }}</span>
                <strong>{{ studioUpgradeStatusLabel }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('目标版本', 'Target Version') }}</span>
                <strong>{{ studioUpgrade.targetVersion || studioRelease.latestVersion || text('暂无', 'None') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('最近检查', 'Last Checked') }}</span>
                <strong>{{ formatDate(studioRelease.checkedAt) }}</strong>
              </div>
            </div>

            <div class="system-detail-list">
              <div class="system-detail-row">
                <span>{{ text('发布源', 'Release Source') }}</span>
                <strong>{{ studioRelease.source || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('安装包地址', 'Package URL') }}</span>
                <strong>{{ studioRelease.packageUrl || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('任务日志', 'Upgrade Log') }}</span>
                <strong>{{ studioUpgrade.logFile || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('开始时间', 'Started At') }}</span>
                <strong>{{ formatDate(studioUpgrade.startedAt) }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('结束时间', 'Finished At') }}</span>
                <strong>{{ formatDate(studioUpgrade.finishedAt) }}</strong>
              </div>
            </div>

            <div v-if="studioRelease.notes.length" class="system-callout">
              <strong>{{ text('发布说明', 'Release Notes') }}</strong>
              <ul class="system-callout-list">
                <li v-for="note in studioRelease.notes" :key="note">{{ note }}</li>
              </ul>
            </div>

            <div v-if="studioUpgrade.lastError" class="system-callout system-callout-error">
              <strong>{{ text('最近错误', 'Latest Error') }}</strong>
              <p>{{ studioUpgrade.lastError }}</p>
            </div>
          </section>
        </article>

        <article v-else-if="activeTab === 'gateway'" class="panel-card system-stage-panel">
          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('Gateway 与 service', 'Gateway and Service') }}</h3>
                <p>{{ text('聚合 systemd、gateway status 与端口探测信息。', 'Combines systemd, gateway status, and port-probe information.') }}</p>
              </div>
            </div>

            <div v-if="diagnostics" class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('Bind Mode', 'Bind Mode') }}</span>
                <strong>{{ diagnostics.gateway.bindMode || text('未知', 'Unknown') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Bind Host', 'Bind Host') }}</span>
                <strong>{{ diagnostics.gateway.bindHost || text('未知', 'Unknown') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>RPC</span>
                <strong>{{ diagnostics.gateway.rpcOk ? text('正常', 'OK') : text('异常', 'Error') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Unit 状态', 'Unit State') }}</span>
                <strong>{{ diagnostics.service.unitFileState }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Exec PID', 'Exec PID') }}</span>
                <strong>{{ diagnostics.service.execMainPid ?? text('未知', 'Unknown') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('端口状态', 'Port State') }}</span>
                <strong>{{ diagnostics.gateway.portStatus || text('未知', 'Unknown') }}</strong>
              </div>
            </div>

            <div v-if="diagnostics" class="system-detail-list">
              <div class="system-detail-row">
                <span>{{ text('Gateway Probe URL', 'Gateway Probe URL') }}</span>
                <strong>{{ diagnostics.gateway.probeUrl || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('Gateway WS URL', 'Gateway WS URL') }}</span>
                <strong>{{ diagnostics.config.gatewayWsUrl }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('Config File', 'Config File') }}</span>
                <strong>{{ diagnostics.config.openclawConfigFile }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('Unit Fragment', 'Unit Fragment') }}</span>
                <strong>{{ diagnostics.service.fragmentPath || '-' }}</strong>
              </div>
            </div>

            <div v-if="diagnostics?.gateway.portHints.length" class="system-callout">
              <strong>{{ text('端口提示', 'Port Hints') }}</strong>
              <ul class="system-callout-list">
                <li v-for="hint in diagnostics.gateway.portHints" :key="hint">{{ hint }}</li>
              </ul>
            </div>
          </section>
        </article>

        <article v-else-if="activeTab === 'bootstrap'" class="panel-card system-stage-panel">
          <section class="system-section">
            <div v-if="diagnostics" class="system-section-head system-section-head-tight">
              <div>
                <h3>{{ text('初始化与引导', 'Bootstrap and Repair') }}</h3>
                <p>{{ text('确保 Studio 在新的 OpenClaw 环境、不同配置或残缺配置下也能自检并补齐最低可用配置。', 'Ensure Studio can self-check and fill in the minimum required configuration on fresh or divergent OpenClaw installs.') }}</p>
              </div>
              <div class="system-inline-actions">
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="bootstrapRepairRunning"
                  @click="repairBootstrapConfig"
                >
                  {{ bootstrapRepairRunning ? text('初始化中...', 'Applying...') : text('应用推荐初始化', 'Apply recommended bootstrap') }}
                </button>
              </div>
            </div>

            <div v-if="diagnostics" class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('Bootstrap 状态', 'Bootstrap Status') }}</span>
                <strong>{{ diagnostics.bootstrap.ready ? text('就绪', 'Ready') : text('需处理', 'Needs repair') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('自动初始化', 'Auto Applied') }}</span>
                <strong>{{ diagnostics.bootstrap.autoApplied ? text('本轮已执行', 'Applied this run') : text('未触发', 'Not needed') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('配置文件', 'Config File') }}</span>
                <strong>{{ diagnostics.bootstrap.configPath }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('状态目录', 'State Dir') }}</span>
                <strong>{{ diagnostics.bootstrap.stateDir }}</strong>
              </div>
            </div>

            <div v-if="diagnostics.bootstrap.notes.length" class="system-callout">
              <strong>{{ text('引导说明', 'Bootstrap Notes') }}</strong>
              <ul class="system-callout-list">
                <li v-for="note in diagnostics.bootstrap.notes" :key="note">{{ note }}</li>
              </ul>
            </div>

            <div v-if="diagnostics" class="system-callout">
              <strong>{{ text('检查项', 'Checks') }}</strong>
              <div
                v-for="check in diagnostics.bootstrap.checks"
                :key="check.id"
                class="system-pending-request"
              >
                <div>
                  <strong>{{ check.label }}</strong>
                  <p>{{ bootstrapLevelLabel(check.level) }} · {{ check.summary }}</p>
                  <p>{{ check.detail }}</p>
                </div>
                <StatusPill
                  :label="bootstrapLevelLabel(check.level)"
                  :tone="bootstrapTone(check.level)"
                />
              </div>
            </div>
          </section>
        </article>

        <article v-else-if="activeTab === 'environment'" class="panel-card system-stage-panel">
          <section class="system-section">
            <div v-if="diagnostics" class="system-section-head system-section-head-tight">
              <div>
                <h3>{{ text('设备信任与环境', 'Device Trust and Environment') }}</h3>
                <p>{{ text('把 helper trust、待批准请求与当前环境状态独立成显式分区，避免继续挤在 bootstrap 面板里。', 'Expose helper trust, pending approvals, and current environment state as a dedicated seam instead of keeping them inside bootstrap.') }}</p>
              </div>
              <div class="system-inline-actions">
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="autoApproveSaving"
                  @click="toggleAutoApproveLocalHelper"
                >
                  {{
                    diagnostics.deviceTrust.settings.autoApproveLocalHelper
                      ? text('关闭 helper 自动批准', 'Disable helper auto-approve')
                      : text('开启 helper 自动批准', 'Enable helper auto-approve')
                  }}
                </button>
                <button
                  v-if="diagnostics.deviceTrust.helper.pendingRequestId"
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="Boolean(activeApproveRequestId)"
                  @click="approvePendingRequest(diagnostics.deviceTrust.helper.pendingRequestId)"
                >
                  {{ text('批准 helper repair', 'Approve helper repair') }}
                </button>
                <button
                  v-if="!diagnostics.deviceTrust.helper.tokenInSync || diagnostics.deviceTrust.helper.pendingRequestId"
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="helperRepairRunning"
                  @click="repairHelperTrust"
                >
                  {{ helperRepairRunning ? text('修复中...', 'Repairing...') : text('修复 helper token cache', 'Repair helper token cache') }}
                </button>
              </div>
            </div>

            <div v-if="diagnostics" class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('Helper 配对', 'Helper Pairing') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.paired ? text('已批准', 'Approved') : text('未批准', 'Pending') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Helper 待处理', 'Helper Pending') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.pendingRequestId || text('无', 'None') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('自动批准', 'Auto Approve') }}</span>
                <strong>{{ diagnostics.deviceTrust.settings.autoApproveLocalHelper ? text('开启', 'Enabled') : text('关闭', 'Disabled') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('已配对设备', 'Paired Devices') }}</span>
                <strong>{{ diagnostics.deviceTrust.pairedDeviceCount }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Helper approved scopes', 'Helper approved scopes') }}</span>
                <strong>{{ formatScopeList(diagnostics.deviceTrust.helper.approvedScopes) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('device-auth scopes', 'device-auth scopes') }}</span>
                <strong>{{ formatScopeList(diagnostics.deviceTrust.helper.storedScopes) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Token Cache', 'Token Cache') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.tokenInSync ? text('已同步', 'In sync') : text('已漂移', 'Drifted') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Metadata Repair', 'Metadata Repair') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.metadataRepairPending ? text('待修复', 'Pending') : text('正常', 'Healthy') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Node', 'Node') }}</span>
                <strong>{{ diagnostics.runtime.nodeVersion }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('平台', 'Platform') }}</span>
                <strong>{{ diagnostics.runtime.platform }} / {{ diagnostics.runtime.arch }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('主机名', 'Hostname') }}</span>
                <strong>{{ diagnostics.runtime.hostname }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('工作目录', 'Working Directory') }}</span>
                <strong>{{ diagnostics.runtime.cwd || '-' }}</strong>
              </div>
            </div>

            <div v-if="diagnostics.deviceTrust.notes.length" class="system-callout">
              <strong>{{ text('说明', 'Notes') }}</strong>
              <ul class="system-callout-list">
                <li v-for="note in diagnostics.deviceTrust.notes" :key="note">{{ note }}</li>
              </ul>
            </div>

            <div class="system-detail-list">
              <div class="system-detail-row">
                <span>{{ text('Helper Device ID', 'Helper Device ID') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.deviceId || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('Helper Client', 'Helper Client') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.clientId }} / {{ diagnostics.deviceTrust.helper.clientMode }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('最近批准时间', 'Last Approved At') }}</span>
                <strong>{{ formatDate(diagnostics.deviceTrust.helper.approvedAt) }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('device-auth 更新时间', 'device-auth updated') }}</span>
                <strong>{{ formatDate(diagnostics.deviceTrust.helper.storedTokenUpdatedAt) }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('paired token 更新时间', 'paired token updated') }}</span>
                <strong>{{ formatDate(diagnostics.deviceTrust.helper.pairedTokenUpdatedAt) }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('paired metadata', 'paired metadata') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.pairedPlatform || '-' }} / {{ diagnostics.deviceTrust.helper.pairedDeviceFamily || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('pending metadata', 'pending metadata') }}</span>
                <strong>{{ diagnostics.deviceTrust.helper.pendingPlatform || '-' }} / {{ diagnostics.deviceTrust.helper.pendingDeviceFamily || '-' }} / {{ diagnostics.deviceTrust.helper.pendingClientMode || '-' }}</strong>
              </div>
            </div>

            <div v-if="diagnostics.deviceTrust.pending.length" class="system-callout">
              <strong>{{ text('待批准请求', 'Pending Requests') }}</strong>
              <div v-for="request in diagnostics.deviceTrust.pending" :key="request.requestId" class="system-pending-request">
                <div>
                  <strong>{{ request.requestId }}</strong>
                  <p>{{ request.clientId }} / {{ request.clientMode }} · {{ request.role }} · {{ formatScopeList(request.scopes, text('无 scopes', 'No scopes')) }}</p>
                  <p>{{ request.deviceId }}</p>
                </div>
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="activeApproveRequestId === request.requestId"
                  @click="approvePendingRequest(request.requestId)"
                >
                  {{ activeApproveRequestId === request.requestId ? text('批准中...', 'Approving...') : text('批准', 'Approve') }}
                </button>
              </div>
            </div>
          </section>
        </article>

        <article v-else-if="activeTab === 'diagnostics'" class="panel-card system-stage-panel">
          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('原始诊断输出', 'Raw Diagnostic Output') }}</h3>
                <p>{{ text('这里直接保留 `openclaw gateway status --json`、`openclaw status --json` 和 `openclaw doctor` 的输出摘要。', 'This keeps the raw output snapshots from `openclaw gateway status --json`, `openclaw status --json`, and `openclaw doctor`.') }}</p>
              </div>
            </div>

            <details class="config-collapsible" open>
              <summary class="config-collapsible-summary">
                <strong>openclaw gateway status --json</strong>
                <span class="config-collapsible-meta">{{ diagnostics?.commands.gatewayStatus.ok ? text('读取成功', 'Loaded') : text('读取失败', 'Failed') }}</span>
              </summary>
              <pre class="system-code-block">{{ diagnostics?.commands.gatewayStatus.stdout || diagnostics?.commands.gatewayStatus.error || '' }}</pre>
            </details>

            <details class="config-collapsible">
              <summary class="config-collapsible-summary">
                <strong>openclaw status --json</strong>
                <span class="config-collapsible-meta">{{ diagnostics?.commands.status.ok ? text('读取成功', 'Loaded') : text('读取失败', 'Failed') }}</span>
              </summary>
              <pre class="system-code-block">{{ diagnostics?.commands.status.stdout || diagnostics?.commands.status.error || '' }}</pre>
            </details>

            <details class="config-collapsible">
              <summary class="config-collapsible-summary">
                <strong>openclaw doctor</strong>
                <span class="config-collapsible-meta">{{ diagnostics?.commands.doctor.ok ? text('读取成功', 'Loaded') : text('读取失败', 'Failed') }}</span>
              </summary>
              <pre class="system-code-block">{{ diagnostics?.commands.doctor.stdout || diagnostics?.commands.doctor.error || '' }}</pre>
            </details>
          </section>
        </article>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  SystemDiagnosticsPayload,
  SystemHealthPayload,
  SystemStudioReleasePayload,
  SystemStudioUpgradeStatusPayload,
} from '../../../../../types/system';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  approveSystemDeviceTrust,
  fetchSystemDiagnostics,
  fetchSystemHealth,
  fetchStudioRelease,
  fetchStudioUpgradeStatus,
  patchSystemDeviceTrustSettings,
  repairSystemBootstrapConfig,
  repairSystemDeviceTrustHelper,
  startStudioUpgrade,
} from './api';
import SystemActionHandoffPanel from './SystemActionHandoffPanel.vue';
import SystemOverviewPanel from './SystemOverviewPanel.vue';
import SystemSectionRail from './SystemSectionRail.vue';
import {
  buildSystemOverviewCards,
  buildSystemQuickActions,
} from './system-overview-recipe';
import { buildSystemTerminalHandoff } from './system-terminal-handoff';
import { buildSystemRuntimeViewModel } from './system-runtime-view-model';
import { buildSystemEventSummary } from './system-event-summary';
import {
  buildSystemControlActionSummary,
  buildSystemHealthSummary,
  buildSystemStageHeader,
} from './system-stage-selectors';

type SystemTab = 'overview' | 'bootstrap' | 'release' | 'gateway' | 'diagnostics' | 'environment';

interface NoticeLike {
  kind: 'success' | 'error';
  text: string;
}

const router = useRouter();
const { text } = useLocalePreference();

const health = ref<SystemHealthPayload>(normalizeHealth({}));
const diagnostics = ref<SystemDiagnosticsPayload>(normalizeDiagnostics({}));
const studioRelease = ref<SystemStudioReleasePayload>(normalizeStudioRelease({}));
const studioUpgrade = ref<SystemStudioUpgradeStatusPayload>(normalizeStudioUpgradeStatus({}));
const healthLoaded = ref(false);
const diagnosticsLoaded = ref(false);
const releaseLoaded = ref(false);
const loading = ref(false);
const diagnosticsLoading = ref(false);
const errorMessage = ref('');
const notice = ref<NoticeLike | null>(null);
const activeTab = ref<SystemTab>('bootstrap');
const autoApproveSaving = ref(false);
const activeApproveRequestId = ref('');
const helperRepairRunning = ref(false);
const bootstrapRepairRunning = ref(false);
const releaseCheckRunning = ref(false);
const releaseUpgradeRunning = ref(false);

const releaseBusy = computed(() => releaseCheckRunning.value || releaseUpgradeRunning.value);

const runtimeViewModel = computed(() => buildSystemRuntimeViewModel({
  studioRelease: studioRelease.value,
  studioUpgrade: studioUpgrade.value,
  releaseUpgradeRunning: releaseUpgradeRunning.value,
  text,
}));

const studioUpgradeStatusLabel = computed(() => runtimeViewModel.value.studioUpgradeStatusLabel);

const studioUpgradeActionLabel = computed(() => runtimeViewModel.value.studioUpgradeActionLabel);

const tabs = computed(() => [
  { id: 'bootstrap' as const, icon: '⚑', label: text('引导', 'Bootstrap') },
  { id: 'overview' as const, icon: '◉', label: text('概览', 'Overview') },
  { id: 'release' as const, icon: '⭮', label: text('升级', 'Release') },
  { id: 'gateway' as const, icon: '⛭', label: text('Gateway', 'Gateway') },
  { id: 'environment' as const, icon: '⌂', label: text('环境', 'Environment') },
  { id: 'diagnostics' as const, icon: '⌘', label: text('诊断输出', 'Diagnostics') },
]);

const controlActionSummary = computed(() => buildSystemControlActionSummary({
  loading: loading.value,
  diagnosticsLoading: diagnosticsLoading.value,
  text,
}));

const healthSummary = computed(() => buildSystemHealthSummary({
  health: health.value,
  text,
}));

const stageHeader = computed(() => buildSystemStageHeader({
  pluginId: diagnostics.value?.config.pluginId || 'studio',
  health: health.value,
  text,
  formatBytes,
}));

const quickActions = computed(() => buildSystemQuickActions(text));

const terminalHandoff = computed(() => buildSystemTerminalHandoff());

const eventSummaryItems = computed(() => buildSystemEventSummary({
  diagnostics: diagnostics.value,
  studioRelease: studioRelease.value,
  text,
}));

const overviewCards = computed(() => buildSystemOverviewCards({
  health: health.value,
  diagnostics: diagnostics.value,
  text,
  formatUptime,
  formatLoad,
}));

function openTerminalHandoff(): void {
  router.push(terminalHandoff.value.to);
}

function handleSystemNavigate(to: '/terminal' | '/cron'): void {
  if (to === '/terminal') {
    openTerminalHandoff();
    return;
  }
  router.push(to);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const total = Math.floor(seconds || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None yet');
  return new Date(value).toLocaleString();
}

function formatScopeList(scopes: unknown, emptyLabel = text('无', 'None')): string {
  if (!Array.isArray(scopes)) {
    return emptyLabel;
  }
  const joined = scopes
    .map((scope) => (typeof scope === 'string' ? scope.trim() : ''))
    .filter(Boolean)
    .join(', ');
  return joined || emptyLabel;
}

function formatLoad(load: number[]): string {
  return (load || []).map((value) => value.toFixed(2)).join(' / ');
}

function bootstrapLevelLabel(level: 'ok' | 'warn' | 'error'): string {
  switch (level) {
    case 'ok':
      return text('正常', 'OK');
    case 'warn':
      return text('警告', 'Warn');
    case 'error':
      return text('错误', 'Error');
    default:
      return level;
  }
}

function bootstrapTone(level: 'ok' | 'warn' | 'error'): 'sage' | 'accent' | 'neutral' {
  switch (level) {
    case 'ok':
      return 'sage';
    case 'error':
      return 'accent';
    default:
      return 'neutral';
  }
}

function normalizeHealth(payload: Record<string, any>): SystemHealthPayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    gateway: payload.gatewayConnected === true || payload.gateway === 'online' ? 'online' : 'offline',
    gatewayConnected: payload.gatewayConnected === true || payload.gateway === 'online',
    pid: Number(payload.pid || 0),
    version: String(payload.version || 'unknown'),
    nodeVersion: String(payload.nodeVersion || payload.node || 'unknown'),
    platform: String(payload.platform || 'unknown'),
    arch: String(payload.arch || 'unknown'),
    hostname: String(payload.hostname || 'localhost'),
    uptime: Number(payload.uptime || 0),
    port: Number(payload.port || 0),
    gatewayPort: Number(payload.gatewayPort || 0),
    sseConnections: Number(payload.sseConnections || 0),
    serviceState: String(payload.serviceState || 'unknown'),
    serviceSubState: String(payload.serviceSubState || 'unknown'),
    cpus: Number(payload.cpus || 0),
    loadavg: Array.isArray(payload.loadavg) ? payload.loadavg.map(Number) : [],
    totalMemoryBytes: Number(payload.totalMemoryBytes || 0),
    freeMemoryBytes: Number(payload.freeMemoryBytes || 0),
  };
}

function normalizeCommandSnapshot(value: unknown) {
  const snapshot = value && typeof value === 'object' ? value as Record<string, any> : {};
  return {
    ok: snapshot.ok === true,
    durationMs: Number(snapshot.durationMs || 0),
    error: String(snapshot.error || ''),
    stdout: String(snapshot.stdout || ''),
    stderr: String(snapshot.stderr || ''),
    parsedJson: snapshot.parsedJson && typeof snapshot.parsedJson === 'object' ? snapshot.parsedJson as Record<string, any> : null,
  };
}

function normalizeDiagnostics(payload: Record<string, any>): SystemDiagnosticsPayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    config: {
      pluginId: String(payload.config?.pluginId || 'studio'),
      pluginName: String(payload.config?.pluginName || 'OpenClaw Studio'),
      version: String(payload.config?.version || 'unknown'),
      port: Number(payload.config?.port || 0),
      autoStart: payload.config?.autoStart !== false,
      openclawRoot: String(payload.config?.openclawRoot || ''),
      openclawConfigFile: String(payload.config?.openclawConfigFile || ''),
      projectRoot: String(payload.config?.projectRoot || ''),
      webDistDir: String(payload.config?.webDistDir || ''),
      gatewayPort: Number(payload.config?.gatewayPort || 0),
      gatewayWsUrl: String(payload.config?.gatewayWsUrl || ''),
    },
    runtime: {
      cwd: String(payload.runtime?.cwd || ''),
      pid: Number(payload.runtime?.pid || 0),
      nodeVersion: String(payload.runtime?.nodeVersion || 'unknown'),
      platform: String(payload.runtime?.platform || 'unknown'),
      arch: String(payload.runtime?.arch || 'unknown'),
      hostname: String(payload.runtime?.hostname || 'localhost'),
      uptime: Number(payload.runtime?.uptime || 0),
      sseConnections: Number(payload.runtime?.sseConnections || 0),
      cpus: Number(payload.runtime?.cpus || 0),
      loadavg: Array.isArray(payload.runtime?.loadavg) ? payload.runtime.loadavg.map(Number) : [],
      totalMemoryBytes: Number(payload.runtime?.totalMemoryBytes || 0),
      freeMemoryBytes: Number(payload.runtime?.freeMemoryBytes || 0),
    },
    counts: {
      agents: Number(payload.counts?.agents || 0),
      channels: Number(payload.counts?.channels || 0),
      bindings: Number(payload.counts?.bindings || 0),
      cronJobs: Number(payload.counts?.cronJobs || 0),
      skills: Number(payload.counts?.skills || 0),
    },
    service: {
      activeState: String(payload.service?.activeState || 'unknown'),
      subState: String(payload.service?.subState || 'unknown'),
      unitFileState: String(payload.service?.unitFileState || 'unknown'),
      execMainPid: Number.isFinite(Number(payload.service?.execMainPid)) ? Number(payload.service?.execMainPid) : null,
      fragmentPath: String(payload.service?.fragmentPath || ''),
    },
    gateway: {
      bindMode: String(payload.gateway?.bindMode || ''),
      bindHost: String(payload.gateway?.bindHost || ''),
      probeUrl: String(payload.gateway?.probeUrl || ''),
      rpcOk: payload.gateway?.rpcOk === true,
      rpcUrl: String(payload.gateway?.rpcUrl || ''),
      portStatus: String(payload.gateway?.portStatus || ''),
      portHints: Array.isArray(payload.gateway?.portHints) ? payload.gateway.portHints.map(String) : [],
    },
    status: {
      runtimeVersion: String(payload.status?.runtimeVersion || ''),
      gatewayReachable: payload.status?.gatewayReachable === true,
      gatewayUrl: String(payload.status?.gatewayUrl || ''),
      gatewayError: String(payload.status?.gatewayError || ''),
      gatewayServiceLabel: String(payload.status?.gatewayServiceLabel || ''),
      gatewayServiceRuntime: String(payload.status?.gatewayServiceRuntime || ''),
      agentsDefaultId: String(payload.status?.agentsDefaultId || ''),
      agentCount: Number(payload.status?.agentCount || payload.counts?.agents || 0),
      sessionCount: Number(payload.status?.sessionCount || 0),
      bootstrapPendingCount: Number(payload.status?.bootstrapPendingCount || 0),
      securityCritical: Number(payload.status?.securityCritical || 0),
      securityWarn: Number(payload.status?.securityWarn || 0),
      securityInfo: Number(payload.status?.securityInfo || 0),
      updateLatestVersion: String(payload.status?.updateLatestVersion || ''),
      updateInstallKind: String(payload.status?.updateInstallKind || ''),
      updatePackageManager: String(payload.status?.updatePackageManager || ''),
    },
    commands: {
      gatewayStatus: normalizeCommandSnapshot(payload.commands?.gatewayStatus),
      status: normalizeCommandSnapshot(payload.commands?.status),
      doctor: normalizeCommandSnapshot(payload.commands?.doctor),
    },
    deviceTrust: {
      checkedAt: String(payload.deviceTrust?.checkedAt || new Date().toISOString()),
      settings: {
        autoApproveLocalHelper: payload.deviceTrust?.settings?.autoApproveLocalHelper !== false,
      },
      helper: {
        deviceId: String(payload.deviceTrust?.helper?.deviceId || ''),
        clientId: String(payload.deviceTrust?.helper?.clientId || 'cli'),
        clientMode: String(payload.deviceTrust?.helper?.clientMode || 'backend'),
        paired: payload.deviceTrust?.helper?.paired === true,
        approvedScopes: Array.isArray(payload.deviceTrust?.helper?.approvedScopes) ? payload.deviceTrust.helper.approvedScopes.map(String) : [],
        storedScopes: Array.isArray(payload.deviceTrust?.helper?.storedScopes) ? payload.deviceTrust.helper.storedScopes.map(String) : [],
        pendingRequestId: payload.deviceTrust?.helper?.pendingRequestId ? String(payload.deviceTrust.helper.pendingRequestId) : null,
        pendingRepair: payload.deviceTrust?.helper?.pendingRepair === true,
        approvedAt: payload.deviceTrust?.helper?.approvedAt ? String(payload.deviceTrust.helper.approvedAt) : null,
        tokenInSync: payload.deviceTrust?.helper?.tokenInSync === true,
        canSyncLocalToken: payload.deviceTrust?.helper?.canSyncLocalToken === true,
        storedTokenUpdatedAt: payload.deviceTrust?.helper?.storedTokenUpdatedAt ? String(payload.deviceTrust.helper.storedTokenUpdatedAt) : null,
        pairedTokenUpdatedAt: payload.deviceTrust?.helper?.pairedTokenUpdatedAt ? String(payload.deviceTrust.helper.pairedTokenUpdatedAt) : null,
        pairedPlatform: String(payload.deviceTrust?.helper?.pairedPlatform || ''),
        pairedDeviceFamily: String(payload.deviceTrust?.helper?.pairedDeviceFamily || ''),
        pendingPlatform: payload.deviceTrust?.helper?.pendingPlatform ? String(payload.deviceTrust.helper.pendingPlatform) : null,
        pendingDeviceFamily: payload.deviceTrust?.helper?.pendingDeviceFamily ? String(payload.deviceTrust.helper.pendingDeviceFamily) : null,
        pendingClientMode: payload.deviceTrust?.helper?.pendingClientMode ? String(payload.deviceTrust.helper.pendingClientMode) : null,
        metadataRepairPending: payload.deviceTrust?.helper?.metadataRepairPending === true,
      },
      pending: Array.isArray(payload.deviceTrust?.pending)
        ? payload.deviceTrust.pending.map((entry: Record<string, any>) => ({
          requestId: String(entry.requestId || ''),
          deviceId: String(entry.deviceId || ''),
          publicKey: String(entry.publicKey || ''),
          platform: String(entry.platform || ''),
          deviceFamily: String(entry.deviceFamily || ''),
          clientId: String(entry.clientId || ''),
          clientMode: String(entry.clientMode || ''),
          role: String(entry.role || ''),
          scopes: Array.isArray(entry.scopes) ? entry.scopes.map(String) : [],
          isRepair: entry.isRepair === true,
          silent: entry.silent === true,
          requestedAt: entry.requestedAt ? String(entry.requestedAt) : null,
        }))
        : [],
      pairedDeviceCount: Number(payload.deviceTrust?.pairedDeviceCount || 0),
      notes: Array.isArray(payload.deviceTrust?.notes) ? payload.deviceTrust.notes.map(String) : [],
    },
    bootstrap: {
      checkedAt: String(payload.bootstrap?.checkedAt || new Date().toISOString()),
      ready: payload.bootstrap?.ready === true,
      autoApplied: payload.bootstrap?.autoApplied === true,
      configPath: String(payload.bootstrap?.configPath || ''),
      stateDir: String(payload.bootstrap?.stateDir || ''),
      checks: Array.isArray(payload.bootstrap?.checks)
        ? payload.bootstrap.checks.map((check: Record<string, any>) => ({
          id: String(check.id || ''),
          label: String(check.label || ''),
          level: check.level === 'error' || check.level === 'warn' ? check.level : 'ok',
          summary: String(check.summary || ''),
          detail: String(check.detail || ''),
          detected: check.detected !== false,
          fixable: check.fixable === true,
        }))
        : [],
      notes: Array.isArray(payload.bootstrap?.notes) ? payload.bootstrap.notes.map(String) : [],
    },
  };
}

function normalizeStudioRelease(payload: Record<string, any>): SystemStudioReleasePayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    currentVersion: String(payload.currentVersion || ''),
    latestVersion: payload.latestVersion ? String(payload.latestVersion) : null,
    updateAvailable: payload.updateAvailable === true,
    source: payload.source ? String(payload.source) : null,
    packageUrl: payload.packageUrl ? String(payload.packageUrl) : null,
    minOpenClawVersion: payload.minOpenClawVersion ? String(payload.minOpenClawVersion) : null,
    notes: Array.isArray(payload.notes) ? payload.notes.map(String) : [],
  };
}

function normalizeStudioUpgradeStatus(payload: Record<string, any>): SystemStudioUpgradeStatusPayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    status: payload.status === 'running' || payload.status === 'succeeded' || payload.status === 'failed'
      ? payload.status
      : 'idle',
    running: payload.running === true,
    pid: Number.isFinite(Number(payload.pid)) ? Number(payload.pid) : null,
    mode: payload.mode === 'standalone' || payload.mode === 'gateway' ? payload.mode : null,
    targetVersion: payload.targetVersion ? String(payload.targetVersion) : null,
    startedAt: payload.startedAt ? String(payload.startedAt) : null,
    finishedAt: payload.finishedAt ? String(payload.finishedAt) : null,
    logFile: String(payload.logFile || ''),
    lastError: String(payload.lastError || ''),
  };
}

async function refreshStudioReleasePanel(): Promise<void> {
  const [nextRelease, nextUpgrade] = await Promise.all([
    fetchStudioRelease(),
    fetchStudioUpgradeStatus(),
  ]);
  studioRelease.value = normalizeStudioRelease(nextRelease as unknown as Record<string, any>);
  studioUpgrade.value = normalizeStudioUpgradeStatus(nextUpgrade as unknown as Record<string, any>);
  releaseLoaded.value = true;
}

async function checkStudioRelease(): Promise<void> {
  if (releaseCheckRunning.value) {
    return;
  }
  releaseCheckRunning.value = true;
  errorMessage.value = '';
  try {
    await refreshStudioReleasePanel();
    notice.value = {
      kind: 'success',
      text: studioRelease.value.updateAvailable
        ? text(`检测到 v${studioRelease.value.latestVersion} 可升级。`, `Update available: v${studioRelease.value.latestVersion}.`)
        : text('当前已是最新版本。', 'Studio is already up to date.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('检查版本失败。', 'Failed to check the Studio release.'),
    };
  } finally {
    releaseCheckRunning.value = false;
  }
}

async function handleStudioUpgradeAction(): Promise<void> {
  if (releaseUpgradeRunning.value) {
    return;
  }
  if (studioUpgrade.value.running || (!studioRelease.value.updateAvailable && studioUpgrade.value.status !== 'failed')) {
    await checkStudioRelease();
    return;
  }

  const targetVersion = studioRelease.value.latestVersion || '';
  const confirmed = typeof window !== 'undefined'
    ? window.confirm(
      text(
        `确认升级到 v${targetVersion}？升级期间 Gateway 可能会重启。`,
        `Upgrade to v${targetVersion}? Gateway may restart during the process.`,
      ),
    )
    : false;
  if (!confirmed) {
    return;
  }

  releaseUpgradeRunning.value = true;
  errorMessage.value = '';
  try {
    const response = await startStudioUpgrade({
      version: targetVersion || undefined,
    });
    studioUpgrade.value = normalizeStudioUpgradeStatus(response.status as unknown as Record<string, any>);
    await refreshStudioReleasePanel();
    notice.value = {
      kind: response.ok ? 'success' : 'error',
      text: response.ok
        ? text('升级任务已启动，可在这里持续刷新状态。', 'Upgrade started. Refresh this panel to track progress.')
        : text('升级任务启动失败，请查看日志路径。', 'Failed to start the upgrade. Check the log path.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('启动升级任务失败。', 'Failed to start the upgrade task.'),
    };
  } finally {
    releaseUpgradeRunning.value = false;
  }
}

async function repairBootstrapConfig(): Promise<void> {
  if (bootstrapRepairRunning.value) {
    return;
  }
  bootstrapRepairRunning.value = true;
  errorMessage.value = '';
  try {
    const response = await repairSystemBootstrapConfig();
    diagnostics.value = normalizeDiagnostics({ ...(diagnostics.value || {}), bootstrap: response.snapshot } as Record<string, any>);
    notice.value = {
      kind: 'success',
      text: response.changed
        ? text('已写入推荐初始化配置。', 'Recommended bootstrap defaults were applied.')
        : text('当前配置已满足推荐初始化要求。', 'Current config already satisfies the recommended bootstrap baseline.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('应用推荐初始化失败。', 'Failed to apply the recommended bootstrap defaults.'),
    };
  } finally {
    bootstrapRepairRunning.value = false;
  }
}

async function approvePendingRequest(requestId: string): Promise<void> {
  if (!requestId || activeApproveRequestId.value) {
    return;
  }
  activeApproveRequestId.value = requestId;
  errorMessage.value = '';
  try {
    const response = await approveSystemDeviceTrust({ requestId });
    diagnostics.value = normalizeDiagnostics({ ...(diagnostics.value || {}), deviceTrust: response.snapshot } as Record<string, any>);
    notice.value = {
      kind: 'success',
      text: text('设备请求已批准。', 'Device request approved.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('批准设备请求失败。', 'Failed to approve device request.'),
    };
  } finally {
    activeApproveRequestId.value = '';
  }
}

async function toggleAutoApproveLocalHelper(): Promise<void> {
  const current = diagnostics.value?.deviceTrust.settings.autoApproveLocalHelper !== false;
  autoApproveSaving.value = true;
  errorMessage.value = '';
  try {
    await patchSystemDeviceTrustSettings({
      autoApproveLocalHelper: !current,
    });
    notice.value = {
      kind: 'success',
      text: !current
        ? text('已开启 helper 自动批准。', 'Helper auto-approve enabled.')
        : text('已关闭 helper 自动批准。', 'Helper auto-approve disabled.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('更新 helper 自动批准设置失败。', 'Failed to update helper auto-approve.'),
    };
  } finally {
    autoApproveSaving.value = false;
  }
}

async function repairHelperTrust(): Promise<void> {
  if (helperRepairRunning.value) {
    return;
  }
  helperRepairRunning.value = true;
  errorMessage.value = '';
  try {
    const response = await repairSystemDeviceTrustHelper();
    diagnostics.value = normalizeDiagnostics({ ...(diagnostics.value || {}), deviceTrust: response.snapshot } as Record<string, any>);
    notice.value = {
      kind: 'success',
      text: response.synchronizedToken || response.approvedRequestId
        ? text('helper 配对/本地 token cache 已修复。', 'Helper pairing / local token cache repaired.')
        : text('helper 状态已检查，无需额外修复。', 'Helper state checked; no repair was needed.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('修复 helper 设备信任失败。', 'Failed to repair helper device trust.'),
    };
  } finally {
    helperRepairRunning.value = false;
  }
}

async function refreshAll(): Promise<void> {
  loading.value = true;
  diagnosticsLoading.value = true;
  errorMessage.value = '';
  const healthTask = fetchSystemHealth()
    .then((nextHealth) => {
      health.value = normalizeHealth(nextHealth as unknown as Record<string, any>);
      healthLoaded.value = true;
    })
    .catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : text('无法读取系统健康状态。', 'Failed to load system health.');
    });

  const diagnosticsTask = fetchSystemDiagnostics()
    .then((nextDiagnostics) => {
      diagnostics.value = normalizeDiagnostics(nextDiagnostics as unknown as Record<string, any>);
      diagnosticsLoaded.value = true;
      notice.value = null;
    })
    .catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : text('无法读取系统诊断。', 'Failed to load system diagnostics.');
    })
    .finally(() => {
      diagnosticsLoading.value = false;
    });

  const releaseTask = refreshStudioReleasePanel()
    .catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : text('无法读取 Studio 升级状态。', 'Failed to load Studio release status.');
    });

  await Promise.allSettled([healthTask, diagnosticsTask, releaseTask]);
  loading.value = false;
}

onMounted(async () => {
  await refreshAll();
});
</script>

<style scoped>
.system-page {
  gap: 18px;
}

.system-workbench {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.system-sidebar,
.system-stage {
  min-width: 0;
}

.system-sidebar-panel,
.system-stage-header,
.system-stage-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--soft-shadow);
}

.system-sidebar-panel,
.system-stage-panel {
  padding: 18px;
}

.system-sidebar-head,
.system-section-head,
.system-stage-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.system-sidebar-title,
.system-stage-title,
.system-section-head h3 {
  margin: 0;
  color: var(--text);
}

.system-section-head p,
.system-sidebar-head p,
.system-stage-head p {
  margin: 6px 0 0 0;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.system-section-head-tight {
  margin-top: 18px;
}

.system-inline-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.system-pending-request {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}

.system-pending-request:first-of-type {
  border-top: 0;
}

.system-pending-request p {
  margin: 4px 0 0 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.system-status-stack,
.system-sidebar-summary,
.system-quick-links,
.system-overview-grid,
.system-detail-list,
.system-callout-list {
  display: grid;
  gap: 10px;
}

.system-status-row,
.system-stage-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.system-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-soft);
  font-size: 12px;
}

.system-sidebar-summary {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.system-summary-item,
.system-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.system-summary-item span,
.system-detail-row span,
.system-stage-fact span,
.system-overview-item span {
  color: var(--text-soft);
  font-size: 12px;
}

.system-summary-item strong,
.system-detail-row strong,
.system-stage-fact strong,
.system-overview-item strong {
  color: var(--text);
}

.system-stage-header {
  padding: 18px 18px 0 18px;
}

.system-stage-facts {
  justify-content: flex-end;
}

.system-stage-fact,
.system-overview-item,
.system-callout,
.system-code-block {
  border: 1px solid var(--line);
  background: var(--surface-soft);
  border-radius: 12px;
}

.system-stage-fact,
.system-overview-item {
  min-width: 128px;
  padding: 12px 14px;
  display: grid;
  gap: 6px;
}

.system-stage-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px 0 18px 0;
  margin-top: 16px;
  border-top: 1px solid var(--line);
}

.system-stage-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 600;
}

.system-stage-tab.active {
  color: var(--text);
  border-color: rgba(120, 185, 255, 0.38);
  background: linear-gradient(135deg, rgba(120, 185, 255, 0.18), rgba(126, 217, 194, 0.16));
}

.system-stage-panel,
.system-section {
  display: grid;
  gap: 16px;
}

.system-section + .system-section {
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.system-overview-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.system-callout {
  padding: 14px 16px;
}

.system-callout strong {
  color: var(--text);
}

.system-callout p {
  margin: 10px 0 0 0;
  color: var(--text-soft);
  line-height: 1.6;
}

.system-callout-error {
  border-color: rgba(255, 122, 99, 0.32);
  background: linear-gradient(180deg, rgba(255, 122, 99, 0.12), rgba(255, 122, 99, 0.04));
}

.system-callout-list {
  margin: 10px 0 0 18px;
  color: var(--text-soft);
}

.system-code-block {
  padding: 14px;
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  overflow: auto;
}

@media (max-width: 1180px) {
  .system-workbench {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 880px) {
  .system-overview-grid {
    grid-template-columns: 1fr;
  }

  .system-stage-head,
  .system-summary-item,
  .system-detail-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .system-stage-facts {
    justify-content: flex-start;
  }
}
</style>
