<template>
  <section class="page-shell codex-stack-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ text('CODEX STACK', 'CODEX STACK') }}</p>
        <h2 class="page-title">{{ text('Codex 栈管理', 'Codex Stack Management') }}</h2>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="loading || ccConnectLoading" @click="loadAll">
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh') }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="status-banner" :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ notice.text }}
    </div>

    <section v-if="summary && !summary.management.enabled" class="panel-card cs-lock-card">
      <div>
        <h3>{{ text('管理动作未启用', 'Management actions are disabled') }}</h3>
        <p>{{ text('安装、修复和配置写入需要显式启用。', 'Install, repair, and config writes require explicit enablement.') }}</p>
      </div>
      <button type="button" class="primary-button" :disabled="busy" @click="enableManagement">
        {{ text('启用管理', 'Enable Management') }}
      </button>
    </section>

    <nav v-if="summary" class="cs-tabs">
      <button v-for="tab in tabs" :key="tab.id" class="cs-tab" :class="{ 'cs-tab-active': activeTab === tab.id }" @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </nav>

    <div v-if="!summary" class="panel-card cs-empty">
      {{ text('正在读取 Codex 栈状态...', 'Loading Codex Stack status...') }}
    </div>

    <!-- Tab: Status Overview -->
    <template v-if="summary && activeTab === 'status'">
      <div class="cs-hero panel-card">
        <div>
          <h3>{{ statusLabel }}</h3>
          <p>{{ text('CPA/Compact/cc-connect/watchdog 由 systemd 托管，Studio 只做控制面。', 'Services managed by systemd; Studio is the control plane.') }}</p>
        </div>
        <div class="cs-hero-metrics">
          <span :class="`tone-${statusTone}`">{{ summary.overallStatus }}</span>
          <span>{{ activeServiceCount }}/{{ summary.services.length }} {{ text('服务', 'svc') }}</span>
          <span>{{ text('模型', 'Model') }} {{ summary.models.current || '--' }}</span>
          <span>CPA :{{ summary.ports.cpa }}<template v-if="summary.ports.detectedCpa && summary.ports.detectedCpa !== summary.ports.cpa"> (live:{{ summary.ports.detectedCpa }})</template></span>
          <span>Compact :{{ summary.ports.compact }}<template v-if="summary.ports.detectedCompact && summary.ports.detectedCompact !== summary.ports.compact"> (live:{{ summary.ports.detectedCompact }})</template></span>
          <span>{{ text('渠道', 'Ch') }} {{ summary.installer.channel }}</span>
        </div>
      </div>

      <button type="button" class="secondary-button" :disabled="busy" @click="runCheck" style="margin-bottom:12px">
        {{ text('运行健康检查', 'Run Health Check') }}
      </button>

      <div class="cs-grid">
        <article class="panel-card">
          <h4>{{ text('组件健康', 'Component Health') }}</h4>
          <div class="cs-status-grid">
            <div v-for="c in summary.components" :key="c.id" class="cs-status-card">
              <span :class="`cs-dot tone-${componentTone(c.status)}`"></span>
              <div>
                <strong>{{ c.label }}</strong>
                <p>{{ c.status }} · {{ c.version || (c.installed ? text('已安装', 'installed') : text('缺失', 'missing')) }}</p>
                <small v-if="c.notes.length">{{ c.notes.join(' · ') }}</small>
              </div>
            </div>
          </div>
        </article>
        <article class="panel-card">
          <h4>{{ text('服务状态', 'Service Status') }}</h4>
          <div class="cs-service-list">
            <div v-for="svc in summary.services" :key="svc.id" class="cs-service-row">
              <span :class="`cs-dot tone-${svc.active ? 'sage' : 'danger'}`"></span>
              <span class="cs-service-name">{{ svc.id }}</span>
              <span class="cs-service-state">{{ svc.active ? text('运行中', 'active') : text('未运行', 'inactive') }}</span>
            </div>
          </div>
        </article>
      </div>

      <article v-if="checkOutput" class="panel-card">
        <h4>{{ text('检查输出', 'Check Output') }}</h4>
        <pre class="cs-code">{{ checkOutput }}</pre>
      </article>
    </template>

    <!-- Tab: Install -->
    <template v-if="summary && activeTab === 'install'">
      <!-- Install progress overlay -->
      <article v-if="activeJob && isCodexStackJobRunning(activeJob)" class="panel-card cs-progress-card">
        <div class="cs-progress-header">
          <h4>{{ text('安装进行中', 'Installing...') }}</h4>
          <span class="cs-progress-badge cs-progress-running">{{ activeJob.kind }}: {{ activeJob.status }}</span>
        </div>
        <p class="cs-progress-hint">{{ text('安装脚本正在后台执行，日志实时更新。', 'Install script is running in the background. Logs update in real time.') }}</p>
        <pre class="cs-progress-log">{{ activeJob.logTail || text('等待输出...', 'Waiting for output...') }}</pre>
      </article>

      <!-- Install completed summary -->
      <article v-if="activeJob && !isCodexStackJobRunning(activeJob)" class="panel-card" :class="activeJob.status === 'succeeded' ? 'cs-result-ok' : 'cs-result-fail'">
        <div class="cs-progress-header">
          <h4>{{ activeJob.status === 'succeeded' ? text('安装完成', 'Install Succeeded') : text('安装失败', 'Install Failed') }}</h4>
          <span class="cs-progress-badge" :class="activeJob.status === 'succeeded' ? 'cs-progress-ok' : 'cs-progress-fail'">{{ activeJob.kind }}: {{ activeJob.status }}</span>
        </div>
        <pre class="cs-progress-log" v-if="activeJob.error || activeJob.logTail">{{ activeJob.error || activeJob.logTail }}</pre>
        <button type="button" class="secondary-button" style="margin-top:10px" @click="activeJob = null">{{ text('关闭', 'Dismiss') }}</button>
      </article>

      <!-- Install form (hidden while job is running) -->
      <template v-if="!activeJob || !isCodexStackJobRunning(activeJob)">
        <article class="panel-card">
          <h4>{{ text('1. 选择安装渠道', '1. Select Channel') }}</h4>
          <p class="cs-field-hint">{{ text('不同渠道的 cc-connect 支持不同的即时通讯平台。', 'Different cc-connect builds support different IM platforms.') }}</p>
          <div class="cs-radio-group">
            <label class="cs-radio" :class="{ 'cs-radio-active': installForm.channel === 'dmwork' }">
              <input v-model="installForm.channel" type="radio" value="dmwork" />
              <strong>DMWork {{ text('增强版（推荐）', 'Enhanced (Recommended)') }}</strong>
              <span>{{ text('自编译二进制，支持 DMWork / 飞书 / 微信三渠道', 'Self-built binary: DMWork + Feishu + Weixin') }}</span>
            </label>
            <label class="cs-radio" :class="{ 'cs-radio-active': installForm.channel === 'official' }">
              <input v-model="installForm.channel" type="radio" value="official" />
              <strong>{{ text('官方版', 'Official') }}</strong>
              <span>{{ text('npm 安装 cc-connect，支持飞书 / 微信', 'npm cc-connect: Feishu + Weixin') }}</span>
            </label>
          </div>
        </article>

        <article class="panel-card">
          <h4>{{ text('2. 组件控制（可选）', '2. Component Control (Optional)') }}</h4>
          <p class="cs-field-hint">{{ text('默认安装全部组件。勾选「跳过」保留已安装版本，勾选「强制」强制重新安装。', 'All components are installed by default. Check Skip to keep existing, Force to reinstall.') }}</p>
          <div class="cs-comp-toggles">
            <div v-for="comp in componentOptions" :key="comp.id" class="cs-comp-row">
              <span class="cs-comp-label">{{ comp.label }}</span>
              <label class="cs-comp-action"><input type="checkbox" :checked="installForm.skipComponents.includes(comp.id)" @change="toggleSkip(comp.id)" /> {{ text('跳过', 'Skip') }}</label>
              <label class="cs-comp-action"><input type="checkbox" :checked="installForm.forceComponents.includes(comp.id)" @change="toggleForce(comp.id)" /> {{ text('强制', 'Force') }}</label>
            </div>
          </div>
          <div class="cs-checkboxes" style="margin-top:10px">
            <label><input v-model="installForm.skipNpm" type="checkbox" /> {{ text('跳过 npm 更新', 'Skip npm update') }}</label>
            <label><input v-model="installForm.skipCcConnect" type="checkbox" /> {{ text('跳过 cc-connect', 'Skip cc-connect') }}</label>
            <label><input v-model="installForm.noStart" type="checkbox" /> {{ text('只写配置不启动服务', 'Write config only') }}</label>
            <label><input v-model="installForm.skipExisting" type="checkbox" /> {{ text('自动跳过已安装组件', 'Auto-skip installed') }}</label>
            <label><input v-model="installForm.forceReinstall" type="checkbox" /> {{ text('强制全部重新安装', 'Force reinstall all') }}</label>
          </div>
        </article>

        <article class="panel-card">
          <h4>{{ text('3. 网络参数（可选）', '3. Network Settings (Optional)') }}</h4>
          <p class="cs-field-hint">{{ text('留空使用默认值。大多数情况无需修改。', 'Leave empty for defaults. Most setups do not need changes.') }}</p>
          <div class="cs-form-grid">
            <label class="form-field"><span class="form-label">{{ text('默认模型', 'Default model') }}</span>
              <input v-model="installForm.model" class="form-input" placeholder="kimi-k2.6" /></label>
            <label class="form-field"><span class="form-label">{{ text('CPA 端口', 'CPA port') }}</span>
              <input v-model.number="installForm.cpaPort" class="form-input" type="number" min="1" /></label>
            <label class="form-field"><span class="form-label">{{ text('Compact 端口', 'Compact port') }}</span>
              <input v-model.number="installForm.compactPort" class="form-input" type="number" min="1" /></label>
            <label class="form-field"><span class="form-label">{{ text('代理密钥', 'Proxy key') }}</span>
              <input v-model="installForm.cpaKey" class="form-input" type="password" /></label>
            <label class="form-field"><span class="form-label">{{ text('上游 URL', 'Upstream URL') }}</span>
              <input v-model="installForm.upstreamBaseUrl" class="form-input" placeholder="https://api.example.com/v1" /></label>
            <label class="form-field"><span class="form-label">{{ text('上游 API Key', 'Upstream API Key') }}</span>
              <input v-model="installForm.upstreamApiKey" class="form-input" type="password" /></label>
          </div>
        </article>

        <article class="panel-card cs-actions-card">
          <h4>{{ text('4. 开始安装', '4. Start Install') }}</h4>
          <p class="cs-field-hint">{{ text('安装通常需要 1-3 分钟。安装过程中可以看到实时日志。', 'Install typically takes 1-3 minutes. Real-time logs are shown during installation.') }}</p>
          <div class="cs-actions">
            <button type="button" class="primary-button" :disabled="busy || !canMutate" @click="installFullStack">
              {{ text('一键安装全部', 'Install Full Stack') }}
            </button>
            <button type="button" class="secondary-button" :disabled="busy || !canMutate" @click="installBaseOnly">
              {{ text('仅安装基础（不含 cc-connect）', 'Base Only (no cc-connect)') }}
            </button>
            <button type="button" class="secondary-button" :disabled="busy || !canMutate" @click="repairRecommended">
              {{ text('自动修复', 'Auto Repair') }}
            </button>
          </div>
        </article>
      </template>
    </template>

    <!-- Tab: Services -->
    <template v-if="summary && activeTab === 'services'">
      <article class="panel-card">
        <h4>{{ text('服务控制', 'Service Control') }}</h4>
        <div class="cs-service-ctrl-list">
          <div v-for="svc in summary.services" :key="svc.id" class="cs-service-ctrl-row">
            <span :class="`cs-dot tone-${svc.active ? 'sage' : 'danger'}`"></span>
            <div class="cs-service-info">
              <strong>{{ svc.id }}</strong>
              <p>{{ svc.active ? text('运行中', 'active') : text('未运行', 'inactive') }} · {{ svc.enabled ? text('已启用', 'enabled') : text('未启用', 'disabled') }}</p>
            </div>
            <div class="cs-service-actions">
              <button class="secondary-button" @click="serviceAction(svc.id, 'start')" :disabled="busy || !canMutate || svc.active">{{ text('启动', 'Start') }}</button>
              <button class="secondary-button" @click="serviceAction(svc.id, 'stop')" :disabled="busy || !canMutate || !svc.active">{{ text('停止', 'Stop') }}</button>
              <button class="secondary-button" @click="serviceAction(svc.id, 'restart')" :disabled="busy || !canMutate">{{ text('重启', 'Restart') }}</button>
            </div>
          </div>
        </div>
      </article>
    </template>

    <!-- Tab: cc-connect -->
    <template v-if="summary && activeTab === 'cc-connect'">
      <article class="panel-card">
        <div class="cs-section-head">
          <div>
            <h4>{{ text('cc-connect 配置概览', 'cc-connect Config Overview') }}</h4>
            <p class="cs-field-hint">{{ text('读取 ~/.cc-connect/config.toml 并展示解析后的项目、平台和原始 TOML。', 'Reads ~/.cc-connect/config.toml and shows parsed projects, platforms, and the raw TOML.') }}</p>
          </div>
        </div>
        <div class="cs-hero-metrics">
          <span>{{ text('语言', 'Language') }} {{ ccConnectConfig?.language || '--' }}</span>
          <span>{{ text('项目数', 'Projects') }} {{ ccConnectProjects.length }}</span>
          <span>{{ text('Provider 数', 'Providers') }} {{ ccConnectProviders.length }}</span>
          <span>{{ text('当前项目', 'Current Project') }} {{ primaryCcConnectProjectName }}</span>
        </div>
      </article>

      <article class="panel-card">
        <div class="cs-section-head">
          <div>
            <h4>{{ text('Provider 列表', 'Providers') }}</h4>
            <p class="cs-field-hint">{{ text('展示配置中声明的上游 Provider。敏感字段仅显示前后片段。', 'Shows configured upstream providers. Sensitive fields are masked.') }}</p>
          </div>
        </div>
        <div v-if="ccConnectLoading && !ccConnectConfig" class="cs-empty">
          {{ text('正在读取 cc-connect 配置...', 'Loading cc-connect config...') }}
        </div>
        <div v-else-if="!ccConnectProviders.length" class="cs-empty">
          {{ text('当前配置没有声明 providers。', 'No providers are declared in the current config.') }}
        </div>
        <div v-else class="cs-provider-grid">
          <article v-for="provider in ccConnectProviders" :key="provider.name || provider.codexEnvKey" class="cs-provider-card">
            <div class="cs-provider-head">
              <strong>{{ provider.name || text('未命名 Provider', 'Unnamed Provider') }}</strong>
              <span class="cs-chip">{{ provider.codexEnvKey || text('未设置环境变量', 'No env key') }}</span>
            </div>
            <div class="cs-kv-list">
              <div class="cs-kv-row">
                <span>base_url</span>
                <code>{{ provider.baseUrl || '--' }}</code>
              </div>
              <div class="cs-kv-row">
                <span>api_key</span>
                <code>{{ maskSecretValue(provider.apiKey) }}</code>
              </div>
              <div class="cs-kv-row">
                <span>codex_env_key</span>
                <code>{{ provider.codexEnvKey || '--' }}</code>
              </div>
            </div>
          </article>
        </div>
      </article>

      <article class="panel-card">
        <div class="cs-section-head">
          <div>
            <h4>{{ text('项目与平台', 'Projects and Platforms') }}</h4>
            <p class="cs-field-hint">{{ text('每个项目卡片展示 agent 配置、工作目录和平台绑定。', 'Each project card shows the agent config, work directory, and platform bindings.') }}</p>
          </div>
        </div>
        <div v-if="ccConnectLoading && !ccConnectConfig" class="cs-empty">
          {{ text('正在读取项目配置...', 'Loading project config...') }}
        </div>
        <div v-else-if="!ccConnectProjects.length" class="cs-empty">
          {{ text('当前配置没有 projects。', 'No projects are declared in the current config.') }}
        </div>
        <div v-else class="cs-project-list">
          <article v-for="project in ccConnectProjects" :key="project.name || project.agentOptions.workDir" class="cs-project-card">
            <div class="cs-project-head">
              <div>
                <h5>{{ project.name || text('未命名项目', 'Unnamed Project') }}</h5>
                <p>{{ project.agentType || '--' }} · {{ project.agentOptions.model || '--' }}</p>
              </div>
              <span class="cs-chip">{{ text('Admin From', 'Admin From') }} {{ project.adminFrom || '*' }}</span>
            </div>
            <div class="cs-project-meta">
              <div class="cs-kv-row">
                <span>{{ text('工作目录', 'Work Directory') }}</span>
                <code>{{ project.agentOptions.workDir || '--' }}</code>
              </div>
              <div class="cs-kv-row">
                <span>{{ text('模式', 'Mode') }}</span>
                <code>{{ project.agentOptions.mode || '--' }}</code>
              </div>
              <div class="cs-kv-row">
                <span>{{ text('Agent 类型', 'Agent Type') }}</span>
                <code>{{ project.agentType || '--' }}</code>
              </div>
              <div class="cs-kv-row">
                <span>{{ text('Admin From', 'Admin From') }}</span>
                <code>{{ project.adminFrom || '*' }}</code>
              </div>
            </div>
            <div class="cs-platform-section">
              <div class="cs-platform-title">{{ text('平台列表', 'Platforms') }}</div>
              <div v-if="!project.platforms.length" class="cs-empty cs-inline-empty">
                {{ text('该项目暂未配置平台。', 'This project has no platforms configured yet.') }}
              </div>
              <div v-else class="cs-platform-grid">
                <article v-for="platform in project.platforms" :key="`${project.name}-${platform.type}`" class="cs-platform-card">
                  <div class="cs-platform-head">
                    <strong>{{ platform.type || text('未命名平台', 'Unnamed Platform') }}</strong>
                  </div>
                  <div class="cs-kv-list">
                    <div v-for="entry in projectPlatformEntries(platform.options)" :key="`${platform.type}-${entry.key}`" class="cs-kv-row">
                      <span>{{ entry.key }}</span>
                      <code>{{ entry.value }}</code>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </article>
        </div>
      </article>

      <article class="panel-card">
        <div class="cs-section-head">
          <div>
            <h4>{{ text('Raw TOML 编辑器', 'Raw TOML Editor') }}</h4>
            <p class="cs-field-hint">{{ text('这里显示真实的 ~/.cc-connect/config.toml 内容，保存时会写回原文件。', 'This shows the real ~/.cc-connect/config.toml content and writes it back on save.') }}</p>
          </div>
        </div>
        <textarea
          v-model="ccConnectRawDraft"
          class="cs-raw-editor"
          spellcheck="false"
          :placeholder="text('cc-connect TOML 会显示在这里。', 'The cc-connect TOML will appear here.')"
        />
        <div class="cs-actions">
          <button type="button" class="primary-button" :disabled="busy || !canMutate || !hasCcConnectRawChanges" @click="saveCcConnectRaw">
            {{ text('保存 TOML 配置', 'Save TOML Config') }}
          </button>
        </div>
      </article>

      <article class="panel-card">
        <h4>{{ text('常用动作', 'Actions') }}</h4>
        <p class="cs-field-hint">{{ text('保存后如果 cc-connect.service 正在运行，会自动重启；未运行时会提示可重启。', 'If cc-connect.service is running it will be restarted after save; otherwise the UI will note that a restart is available.') }}</p>
        <div class="cs-actions cs-actions-wrap">
          <button type="button" class="primary-button" :disabled="busy || !canMutate || !hasCcConnectRawChanges" @click="saveCcConnectRaw">
            {{ text('保存配置', 'Save Config') }}
          </button>
          <button type="button" class="secondary-button" :disabled="busy" @click="copySetupCommand('feishu')">
            {{ text('cc-connect feishu setup', 'cc-connect feishu setup') }}
          </button>
          <button type="button" class="secondary-button" :disabled="busy" @click="copySetupCommand('weixin')">
            {{ text('cc-connect weixin setup', 'cc-connect weixin setup') }}
          </button>
          <button v-if="summary.ccConnect.canFinalize" type="button" class="secondary-button" :disabled="busy || !canMutate" @click="finalizeCcConnect">
            {{ text('完成 cc-connect 安装', 'Finalize cc-connect') }}
          </button>
        </div>
        <pre class="cs-code">{{ ccConnectSetupCommands.join('\n') }}</pre>
      </article>
    </template>

    <!-- Tab: Config -->
    <template v-if="summary && activeTab === 'config'">
      <article class="panel-card">
        <h4>{{ text('运行配置', 'Runtime Config') }}</h4>
        <div class="cs-form-grid">
          <label class="form-field"><span class="form-label">{{ text('默认模型', 'Default model') }}</span>
            <input v-model="configForm.defaultModel" class="form-input" /></label>
          <label class="form-field"><span class="form-label">{{ text('CPA 端口', 'CPA port') }}</span>
            <input v-model.number="configForm.cpaPort" class="form-input" type="number" min="1" /></label>
          <label class="form-field"><span class="form-label">{{ text('Compact 端口', 'Compact port') }}</span>
            <input v-model.number="configForm.compactPort" class="form-input" type="number" min="1" /></label>
          <label class="form-field"><span class="form-label">{{ text('cc-connect 项目', 'cc-connect project') }}</span>
            <input v-model="configForm.ccConnectProject" class="form-input" /></label>
          <label class="form-field"><span class="form-label">{{ text('代理密钥', 'Proxy key') }}</span>
            <input v-model="configForm.cpaProxyKey" class="form-input" type="password" :placeholder="text('留空不修改', 'Leave empty to keep')"/></label>
        </div>
        <div v-if="restartRequiredUnits.length" class="cs-restart-hint">
          {{ text('需要重启:', 'Restart required:') }} {{ restartRequiredUnits.join(', ') }}
        </div>
        <div class="cs-actions">
          <button type="button" class="primary-button" :disabled="busy || !canMutate" @click="saveConfigPatch">
            {{ text('保存配置', 'Save Config') }}
          </button>
        </div>
      </article>
    </template>

    <!-- Tab: Logs -->
    <template v-if="summary && activeTab === 'logs'">
      <article class="panel-card">
        <div class="cs-log-header">
          <h4>{{ text('服务日志', 'Service Logs') }}</h4>
          <div class="cs-log-svc-buttons">
            <button v-for="svc in loggableServices" :key="svc" class="secondary-button" @click="loadLogs(svc)">{{ svc }}</button>
          </div>
        </div>
        <pre class="cs-log">{{ logOutput || text('选择一个服务查看日志。', 'Select a service to view logs.') }}</pre>
      </article>

      <article v-if="activeJob" class="panel-card">
        <h4>{{ text('任务输出', 'Job Output') }} — {{ activeJob.kind }}: {{ activeJob.status }}</h4>
        <pre class="cs-log">{{ activeJob.logTail || text('等待输出...', 'Waiting for output...') }}</pre>
      </article>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { confirm } from "../../composables/useConfirmDialog";
import { copyTextToClipboard } from "../../shared/clipboard";
import { useLocalePreference } from "../../shared/locale";
import type {
  CcConnectConfig,
  CodexStackJob,
  CodexStackServiceAction,
  CodexStackServiceId,
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
  isCodexStackJobRunning,
} from "./codex-stack-view-model";

const { text } = useLocalePreference();

const summary = ref<CodexStackSummaryPayload | null>(null);
const ccConnectConfig = ref<CcConnectConfig | null>(null);
const ccConnectRawDraft = ref("");
const activeJob = ref<CodexStackJob | null>(null);
const checkOutput = ref("");
const logOutput = ref("");
const loading = ref(false);
const ccConnectLoading = ref(false);
const busy = ref(false);
const restartRequiredUnits = ref<CodexStackServiceId[]>([]);
const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);
const activeTab = ref<"status" | "install" | "services" | "cc-connect" | "config" | "logs">("status");
const tabs = [
  { id: "status" as const, label: text("状态总览", "Status") },
  { id: "install" as const, label: text("安装", "Install") },
  { id: "services" as const, label: text("服务控制", "Services") },
  { id: "cc-connect" as const, label: text("cc-connect", "cc-connect") },
  { id: "config" as const, label: text("配置", "Config") },
  { id: "logs" as const, label: text("日志", "Logs") },
];
let pollTimer: number | null = null;

const installForm = reactive({
  model: "kimi-k2.6",
  cpaPort: 18795,
  compactPort: 18796,
  cpaKey: "",
  upstreamBaseUrl: "",
  upstreamApiKey: "",
  skipNpm: false,
  skipCcConnect: false,
  noStart: false,
  skipExisting: false,
  forceReinstall: false,
  skipComponents: [] as string[],
  forceComponents: [] as string[],
  channel: "dmwork" as "official" | "dmwork",
});

const configForm = reactive({
  defaultModel: "kimi-k2.6",
  cpaPort: 18795,
  compactPort: 18796,
  ccConnectProject: "main",
  cpaProxyKey: "",
});

const canMutate = computed(() => summary.value?.management.enabled === true);
const statusTone = computed(() => codexStackStatusTone(summary.value?.overallStatus || "needs-setup"));
const statusLabel = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  const labels: Record<string, string> = {
    ready: text("运行就绪", "Ready"),
    "needs-setup": text("需要安装", "Needs setup"),
    degraded: text("部分异常", "Degraded"),
    failed: text("运行失败", "Failed"),
    "binding-required": text("等待 cc-connect 绑定", "cc-connect binding required"),
    "running-action": text("操作执行中", "Action running"),
  };
  return labels[status] || status;
});
const activeServiceCount = computed(() => countActiveServices(summary.value?.services || []));
const loggableServices: CodexStackServiceId[] = ["cli-proxy-api.service", "cpa-compact-proxy.service", "cc-connect.service", "codex-stack-watchdog.timer"];
const ccConnectProjects = computed(() => ccConnectConfig.value?.projects || []);
const ccConnectProviders = computed(() => ccConnectConfig.value?.providers || []);
const primaryCcConnectProjectName = computed(
  () => ccConnectProjects.value[0]?.name || summary.value?.ccConnect.project || "main",
);
const ccConnectSetupCommands = computed(() => [
  `cc-connect feishu setup --project ${primaryCcConnectProjectName.value}`,
  `cc-connect weixin setup --project ${primaryCcConnectProjectName.value}`,
]);
const hasCcConnectRawChanges = computed(
  () => ccConnectRawDraft.value !== (ccConnectConfig.value?.raw || ""),
);

const modelOptions = computed(() => summary.value?.models.available.length ? summary.value.models.available : ["kimi-k2.6"]);

function componentTone(status: Parameters<typeof codexStackComponentTone>[0]) {
  return codexStackComponentTone(status);
}

function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function isSensitiveKey(key: string): boolean {
  return /(api[_-]?key|bot[_-]?token|token|secret|password)/i.test(key);
}

function projectPlatformEntries(options: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(options || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      value: isSensitiveKey(key) ? maskSecretValue(value) : (value || "--"),
    }));
}

function applySummary(next: CodexStackSummaryPayload): void {
  summary.value = next;
  installForm.model = next.models.current || next.profile.defaultModel || "glm-5.1";
  installForm.cpaPort = next.ports.cpa;
  installForm.compactPort = next.ports.compact;
  configForm.defaultModel = next.models.current || next.profile.defaultModel || "glm-5.1";
  configForm.cpaPort = next.ports.cpa;
  configForm.compactPort = next.ports.compact;
  configForm.ccConnectProject = next.ccConnect.project || next.profile.ccConnectProject || "main";
}

async function loadSummary(): Promise<void> {
  loading.value = true;
  try {
    applySummary(await fetchCodexStackSummary());
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("读取状态失败", "Failed to load status") };
  } finally {
    loading.value = false;
  }
}

async function loadCcConnectConfig(silent = false): Promise<void> {
  ccConnectLoading.value = true;
  try {
    const config = await fetchCcConnectConfig();
    ccConnectConfig.value = config;
    ccConnectRawDraft.value = config.raw;
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

async function loadAll(silent = false): Promise<void> {
  await Promise.all([loadSummary(), loadCcConnectConfig(silent)]);
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

function buildInstallPayload(skipCcConnect = installForm.skipCcConnect) {
  return {
    env: {
      CODEX_MODEL: installForm.model || undefined,
      CPA_PORT: Number(installForm.cpaPort) || undefined,
      COMPACT_PORT: Number(installForm.compactPort) || undefined,
      CPA_PROXY_KEY: installForm.cpaKey || undefined,
      OPENCLAW_UPSTREAM_BASE_URL: installForm.upstreamBaseUrl || undefined,
      OPENCLAW_UPSTREAM_API_KEY: installForm.upstreamApiKey || undefined,
    },
    flags: {
      skipNpm: installForm.skipNpm,
      skipCcConnect,
      noStart: installForm.noStart,
      skipExisting: installForm.skipExisting,
      forceReinstall: installForm.forceReinstall,
      skipComponents: installForm.skipComponents.length ? installForm.skipComponents : undefined,
      forceReinstallComponents: installForm.forceComponents.length ? installForm.forceComponents : undefined,
      channel: installForm.channel,
    },
  };
}

function startPollingJob(job: CodexStackJob): void {
  activeJob.value = job;
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    if (!activeJob.value) return;
    const response = await fetchCodexStackJob(activeJob.value.id);
    activeJob.value = response.job;
    if (!isCodexStackJobRunning(response.job)) {
      const finishedJob = response.job;
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
      await loadSummary();
      if (finishedJob.kind === "install" && finishedJob.status === "succeeded") {
        notice.value = {
          kind: "success",
          text: summary.value?.ccConnect.bindingPresent
            ? text("安装完成，cc-connect 已检测到绑定，可运行检查确认。", "Install completed. cc-connect binding was detected; run checks to confirm.")
            : text("安装完成。下一步在 cc-connect 面板执行 Feishu/Weixin 扫码绑定，绑定后点击 finalizer。", "Install completed. Next, run Feishu/Weixin QR binding in the cc-connect panel, then click the finalizer."),
        };
      }
    }
  }, 2000);
}

async function installFullStack(): Promise<void> {
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

async function runCheck(): Promise<void> {
  busy.value = true;
  try {
    const response = await runCodexStackCheck();
    checkOutput.value = response.outputTail;
    notice.value = { kind: response.ok ? "success" : "error", text: response.ok ? text("检查完成。", "Check completed.") : text("检查发现失败项。", "Check found failures.") };
    await loadSummary();
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("检查失败", "Check failed") };
  } finally {
    busy.value = false;
  }
}

async function repairRecommended(): Promise<void> {
  if (!summary.value) return;
  busy.value = true;
  try {
    const response = await startCodexStackRepair({ actions: buildCodexStackRepairActions(summary.value) });
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("修复任务已启动。", "Repair job started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("修复启动失败", "Repair failed to start") };
  } finally {
    busy.value = false;
  }
}

async function serviceAction(serviceId: CodexStackServiceId, action: CodexStackServiceAction): Promise<void> {
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
  busy.value = true;
  try {
    const response = await patchCodexStackConfig({
      defaultModel: configForm.defaultModel,
      cpaPort: Number(configForm.cpaPort) || undefined,
      compactPort: Number(configForm.compactPort) || undefined,
      ccConnectProject: configForm.ccConnectProject || undefined,
      cpaProxyKey: configForm.cpaProxyKey || undefined,
    });
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    configForm.cpaProxyKey = "";
    if (response.summary) applySummary(response.summary);
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("配置保存失败", "Config save failed") };
  } finally {
    busy.value = false;
  }
}

async function saveCcConnectRaw(): Promise<void> {
  if (!hasCcConnectRawChanges.value) {
    notice.value = { kind: "success", text: text("cc-connect 配置没有变化。", "cc-connect config has no changes.") };
    return;
  }
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
    await loadCcConnectConfig(true);
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

async function copySetupCommand(platform: "feishu" | "weixin"): Promise<void> {
  const command = `cc-connect ${platform} setup --project ${primaryCcConnectProjectName.value}`;
  const copied = await copyTextToClipboard(command);
  notice.value = copied
    ? {
        kind: "success",
        text: text(`已复制命令: ${command}`, `Copied command: ${command}`),
      }
    : {
        kind: "error",
        text: text(`复制失败，请手动执行: ${command}`, `Copy failed. Run manually: ${command}`),
      };
}

async function finalizeCcConnect(): Promise<void> {
  busy.value = true;
  try {
    const response = await finalizeCodexStackCcConnect({ project: summary.value?.ccConnect.project || "main" });
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("cc-connect finalizer 已启动。", "cc-connect finalizer started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("cc-connect finalizer 失败", "cc-connect finalizer failed") };
  } finally {
    busy.value = false;
  }
}

async function loadLogs(serviceId: CodexStackServiceId): Promise<void> {
  try {
    const response = await fetchCodexStackLogs(serviceId);
    logOutput.value = response.output;
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("读取日志失败", "Failed to load logs") };
  }
}

const componentOptions = [
  { id: "codex", label: text("Codex CLI", "Codex CLI") },
  { id: "cpa", label: text("CPA 代理", "CPA Proxy") },
  { id: "compact-proxy", label: text("Compact 代理", "Compact Proxy") },
  { id: "cc-connect", label: "cc-connect" },
  { id: "watchdog", label: text("看门狗", "Watchdog") },
];

function toggleSkip(compId: string): void {
  const idx = installForm.skipComponents.indexOf(compId);
  if (idx >= 0) installForm.skipComponents.splice(idx, 1);
  else {
    installForm.skipComponents.push(compId);
    // Remove from force if adding to skip
    const forceIdx = installForm.forceComponents.indexOf(compId);
    if (forceIdx >= 0) installForm.forceComponents.splice(forceIdx, 1);
  }
}

function toggleForce(compId: string): void {
  const idx = installForm.forceComponents.indexOf(compId);
  if (idx >= 0) installForm.forceComponents.splice(idx, 1);
  else {
    installForm.forceComponents.push(compId);
    // Remove from skip if adding to force
    const skipIdx = installForm.skipComponents.indexOf(compId);
    if (skipIdx >= 0) installForm.skipComponents.splice(skipIdx, 1);
  }
}

onMounted(() => {
  void loadAll(true);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>
<style scoped>
.codex-stack-page { gap: 14px; }

.cs-lock-card, .cs-hero { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.cs-hero-metrics { display: flex; flex-wrap: wrap; gap: 8px; }
.cs-hero-metrics span, .cs-restart-hint {
  border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px;
  background: var(--surface); color: var(--text-soft); font-size: 0.9em;
}

.cs-tabs { display: flex; gap: 2px; border-bottom: 2px solid var(--line); }
.cs-tab {
  padding: 8px 16px; background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 0.95em; font-weight: 500;
  border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.cs-tab:hover { color: var(--text); }
.cs-tab-active { color: var(--acc); border-bottom-color: var(--acc); }

.cs-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }

.cs-status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cs-status-card {
  display: grid; grid-template-columns: auto 1fr; gap: 8px;
  border: 1px solid var(--line); border-radius: var(--radius-lg);
  padding: 10px; background: var(--surface);
}
.cs-status-card p, .cs-status-card small { margin: 2px 0 0; color: var(--muted); }

.cs-dot {
  width: 8px; height: 8px; margin-top: 5px; border-radius: 999px;
  background: var(--muted-soft); box-shadow: 0 0 12px currentColor;
}
.tone-sage { color: var(--success); background: var(--success); }
.tone-accent { color: var(--acc); background: var(--acc); }
.tone-danger { color: var(--danger); background: var(--danger); }
.tone-neutral { color: var(--muted-soft); background: var(--muted-soft); }

.cs-service-list, .cs-service-ctrl-list { display: flex; flex-direction: column; gap: 8px; }
.cs-service-row, .cs-service-ctrl-row {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--line); border-radius: var(--radius-lg);
  padding: 8px 12px; background: var(--surface);
}
.cs-service-name { font-weight: 500; }
.cs-service-state { color: var(--muted); font-size: 0.9em; }
.cs-service-info { flex: 1; }
.cs-service-info p { margin: 2px 0 0; color: var(--muted); font-size: 0.9em; }
.cs-service-actions { display: flex; gap: 6px; }

.cs-radio-group { display: flex; gap: 12px; }
.cs-radio {
  flex: 1; display: flex; flex-direction: column; gap: 4px;
  border: 2px solid var(--line); border-radius: var(--radius-lg);
  padding: 12px 16px; cursor: pointer; transition: border-color 0.2s;
}
.cs-radio input[type="radio"] { display: none; }
.cs-radio-active { border-color: var(--acc); background: color-mix(in srgb, var(--acc) 8%, transparent); }
.cs-radio span { color: var(--muted); font-size: 0.85em; }

.cs-comp-toggles { display: flex; flex-direction: column; gap: 4px; }
.cs-comp-row { display: flex; align-items: center; gap: 10px; }
.cs-comp-label { min-width: 110px; font-weight: 500; }
.cs-comp-action { display: inline-flex; align-items: center; gap: 3px; font-size: 0.9em; color: var(--muted); }

.cs-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cs-checkboxes { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.cs-checkboxes label { display: inline-flex; align-items: center; gap: 4px; font-size: 0.9em; }

.cs-actions { display: flex; gap: 8px; margin-top: 14px; }
.cs-actions-wrap { flex-wrap: wrap; }

.cs-log-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cs-log-svc-buttons { display: flex; gap: 4px; }

.cs-code, .cs-log {
  overflow: auto; border: 1px solid var(--line); border-radius: var(--radius-lg);
  padding: 10px; background: var(--code-bg); color: var(--text-soft);
  white-space: pre-wrap; font-size: 0.9em; margin: 0;
}
.cs-log { min-height: 200px; max-height: 400px; }
.cs-empty { padding: 24px; }

.cs-field-hint { color: var(--muted); font-size: 0.9em; margin: 2px 0 8px; }

.cs-progress-card { border: 2px solid var(--acc); }
.cs-progress-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cs-progress-badge { font-size: 0.85em; padding: 3px 10px; border-radius: 999px; font-weight: 600; }
.cs-progress-running { background: var(--acc); color: #fff; animation: cs-pulse 1.5s infinite; }
.cs-progress-ok { background: var(--success); color: #fff; }
.cs-progress-fail { background: var(--danger); color: #fff; }
.cs-progress-hint { color: var(--muted); font-size: 0.9em; }
.cs-progress-log { max-height: 300px; overflow: auto; margin-top: 10px; }
.cs-result-ok { border-color: var(--success); }
.cs-result-fail { border-color: var(--danger); }
.cs-actions-card { background: color-mix(in srgb, var(--surface) 60%, transparent); }
.cs-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cs-provider-grid, .cs-platform-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.cs-provider-card, .cs-platform-card, .cs-project-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: var(--surface);
}
.cs-provider-head, .cs-platform-head, .cs-project-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.cs-provider-head strong, .cs-platform-head strong, .cs-project-head h5 {
  margin: 0;
}
.cs-project-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.92em;
}
.cs-chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--text-soft);
  background: color-mix(in srgb, var(--surface) 75%, transparent);
  font-size: 0.85em;
  white-space: nowrap;
}
.cs-project-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cs-project-meta, .cs-kv-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.cs-kv-row {
  display: grid;
  grid-template-columns: minmax(110px, 180px) 1fr;
  gap: 10px;
  align-items: start;
}
.cs-kv-row span {
  color: var(--muted);
  font-size: 0.9em;
}
.cs-kv-row code {
  word-break: break-all;
}
.cs-platform-section {
  margin-top: 14px;
}
.cs-platform-title {
  margin-bottom: 10px;
  color: var(--text-soft);
  font-size: 0.9em;
  font-weight: 600;
}
.cs-inline-empty {
  padding: 10px 12px;
  min-height: 0;
}
.cs-raw-editor {
  width: 100%;
  min-height: 360px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: var(--code-bg);
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  line-height: 1.5;
  resize: vertical;
 }

@keyframes cs-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@media (max-width: 960px) {
  .cs-grid, .cs-status-grid, .cs-form-grid, .cs-provider-grid, .cs-platform-grid { grid-template-columns: 1fr; }
  .cs-hero, .cs-lock-card, .cs-service-row, .cs-service-ctrl-row { flex-direction: column; align-items: stretch; }
  .cs-radio-group { flex-direction: column; }
  .cs-kv-row { grid-template-columns: 1fr; }
  .cs-section-head, .cs-project-head, .cs-provider-head, .cs-platform-head { flex-direction: column; align-items: stretch; }
}
</style>
