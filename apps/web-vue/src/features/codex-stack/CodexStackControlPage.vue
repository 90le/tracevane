<template>
  <section class="page-shell codex-stack-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ text('CODEX STACK', 'CODEX STACK') }}</p>
        <h2 class="page-title">{{ text('Codex 栈管理', 'Codex Stack Management') }}</h2>
        <p class="page-copy">
          {{ text('从 Studio 选择性安装和管理 Codex、CPA、Compact Proxy 与 cc-connect。运行服务由 systemd 用户单元托管，Studio 崩溃不会带停运行面。', 'Selectively install and manage Codex, CPA, Compact Proxy, and cc-connect from Studio. Runtime services are owned by user systemd units, so Studio crashes do not stop the data plane.') }}
        </p>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="loading" @click="loadSummary">
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh') }}
        </button>
        <button type="button" class="secondary-button" :disabled="busy" @click="runCheck">
          {{ text('运行检查', 'Run Check') }}
        </button>
        <button type="button" class="primary-button" :disabled="busy || !canMutate" @click="installFullStack">
          {{ text('一键安装全部', 'Install Full Stack') }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="status-banner" :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ notice.text }}
    </div>

    <section v-if="summary" class="codex-stack-hero panel-card">
      <div>
        <p class="eyebrow">{{ text('CONTROL PLANE', 'CONTROL PLANE') }}</p>
        <h3>{{ statusLabel }}</h3>
        <p>
          {{ text('Studio 负责安装、检查、修复和配置；CPA/Compact/cc-connect/watchdog 继续由 systemd 管理。', 'Studio handles install, checks, repair, and configuration; CPA/Compact/cc-connect/watchdog continue under systemd.') }}
        </p>
      </div>
      <div class="codex-stack-hero-metrics">
        <span :class="`tone-${statusTone}`">{{ summary.overallStatus }}</span>
        <span>{{ text('服务', 'Services') }} {{ activeServiceCount }}/{{ summary.services.length }}</span>
        <span>{{ text('模型', 'Model') }} {{ summary.models.current || '--' }}</span>
        <span>{{ text('CPA', 'CPA') }} :{{ summary.ports.cpa }}</span>
        <span>{{ text('Compact', 'Compact') }} :{{ summary.ports.compact }}</span>
      </div>
    </section>

    <section v-if="summary && !summary.management.enabled" class="panel-card codex-stack-lock-card">
      <div>
        <p class="eyebrow">{{ text('LOCKED', 'LOCKED') }}</p>
        <h3>{{ text('宿主管理动作未启用', 'Host management actions are disabled') }}</h3>
        <p>
          {{ text('读取状态和运行检查可用；安装、修复、服务控制和配置写入需要显式开启 codexStack.allowManagementActions。', 'Read-only status and checks are available. Install, repair, service control, and config writes require explicit codexStack.allowManagementActions enablement.') }}
        </p>
      </div>
      <button type="button" class="primary-button" :disabled="busy" @click="enableManagement">
        {{ text('为本机启用管理', 'Enable Management Locally') }}
      </button>
    </section>

    <div v-if="summary" class="codex-stack-grid">
      <article class="panel-card codex-stack-card">
        <div class="codex-stack-section-head">
          <div>
            <p class="eyebrow">{{ text('STATUS', 'STATUS') }}</p>
            <h3>{{ text('组件健康', 'Component Health') }}</h3>
          </div>
        </div>
        <div class="codex-stack-status-grid">
          <article v-for="component in summary.components" :key="component.id" class="codex-stack-status-card">
            <span :class="`codex-stack-dot tone-${componentTone(component.status)}`"></span>
            <div>
              <strong>{{ component.label }}</strong>
              <p>{{ component.status }} · {{ component.version || (component.installed ? text('已安装', 'installed') : text('缺失', 'missing')) }}</p>
              <small v-if="component.notes.length">{{ component.notes.join(' · ') }}</small>
            </div>
          </article>
        </div>
      </article>

      <article class="panel-card codex-stack-card">
        <div class="codex-stack-section-head">
          <div>
            <p class="eyebrow">{{ text('INSTALL', 'INSTALL') }}</p>
            <h3>{{ text('选择性安装', 'Selective Install') }}</h3>
          </div>
        </div>
        <div class="codex-stack-form-grid">
          <label class="form-field">
            <span class="form-label">{{ text('默认模型', 'Default model') }}</span>
            <input v-model="installForm.model" class="form-input" placeholder="glm-5.1" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('CPA 端口', 'CPA port') }}</span>
            <input v-model.number="installForm.cpaPort" class="form-input" type="number" min="1" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('Compact 端口', 'Compact port') }}</span>
            <input v-model.number="installForm.compactPort" class="form-input" type="number" min="1" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('CPA Key 替换', 'Replace CPA key') }}</span>
            <input v-model="installForm.cpaKey" class="form-input" type="password" :placeholder="summary.secrets.cpaProxyKey.masked || 'openclaw-cpa-key'" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('上游 Base URL（可选）', 'Upstream base URL (optional)') }}</span>
            <input v-model="installForm.upstreamBaseUrl" class="form-input" placeholder="https://api.example.com/v1" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('上游 API Key（可选）', 'Upstream API key (optional)') }}</span>
            <input v-model="installForm.upstreamApiKey" class="form-input" type="password" :placeholder="text('仅用于本次安装写入 CPA 配置', 'Used only for this install to write CPA config')" />
          </label>
        </div>
        <div class="codex-stack-check-row">
          <label><input v-model="installForm.skipNpm" type="checkbox" /> {{ text('跳过 npm 安装', 'Skip npm install') }}</label>
          <label><input v-model="installForm.skipCcConnect" type="checkbox" /> {{ text('跳过 cc-connect', 'Skip cc-connect') }}</label>
          <label><input v-model="installForm.noStart" type="checkbox" /> {{ text('只写配置不启动', 'Write only') }}</label>
        </div>
        <div class="codex-stack-actions-row">
          <button type="button" class="primary-button" :disabled="busy || !canMutate" @click="installFullStack">
            {{ text('安装全部服务', 'Install all services') }}
          </button>
          <button type="button" class="secondary-button" :disabled="busy || !canMutate" @click="installBaseOnly">
            {{ text('仅安装 Codex/CPA/Compact', 'Install Codex/CPA/Compact only') }}
          </button>
        </div>
        <p class="field-hint">
          {{ text(`安装源：${summary.installer.kind} ${summary.installer.root || ''}`, `Installer source: ${summary.installer.kind} ${summary.installer.root || ''}`) }}
        </p>
      </article>

      <article class="panel-card codex-stack-card">
        <div class="codex-stack-section-head">
          <div>
            <p class="eyebrow">{{ text('MODEL / KEY', 'MODEL / KEY') }}</p>
            <h3>{{ text('运行配置', 'Runtime Config') }}</h3>
          </div>
        </div>
        <label class="form-field">
          <span class="form-label">{{ text('切换模型', 'Switch model') }}</span>
          <select v-model="configForm.defaultModel" class="form-input">
            <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
          </select>
        </label>
        <div class="codex-stack-form-grid">
          <label class="form-field">
            <span class="form-label">{{ text('CPA 端口', 'CPA port') }}</span>
            <input v-model.number="configForm.cpaPort" class="form-input" type="number" min="1" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('Compact 端口', 'Compact port') }}</span>
            <input v-model.number="configForm.compactPort" class="form-input" type="number" min="1" />
          </label>
        </div>
        <label class="form-field">
          <span class="form-label">{{ text('cc-connect Project', 'cc-connect project') }}</span>
          <input v-model="configForm.ccConnectProject" class="form-input" placeholder="main" />
        </label>
        <label class="form-field">
          <span class="form-label">{{ text('新 CPA Key', 'New CPA key') }}</span>
          <input v-model="configForm.cpaProxyKey" class="form-input" type="password" :placeholder="summary.secrets.cpaProxyKey.masked || text('仅替换，不展示当前值', 'Replace only; current value is hidden')" />
        </label>
        <button type="button" class="primary-button" :disabled="busy || !canMutate" @click="saveConfigPatch">
          {{ text('保存配置', 'Save config') }}
        </button>
        <p v-if="restartRequiredUnits.length" class="field-hint">
          {{ text(`需要重启：${restartRequiredUnits.join(', ')}`, `Restart required: ${restartRequiredUnits.join(', ')}`) }}
        </p>
      </article>

      <article class="panel-card codex-stack-card">
        <div class="codex-stack-section-head">
          <div>
            <p class="eyebrow">{{ text('CC-CONNECT', 'CC-CONNECT') }}</p>
            <h3>{{ summary.ccConnect.bindingPresent ? text('绑定已检测', 'Binding detected') : text('等待扫码绑定', 'QR binding required') }}</h3>
          </div>
        </div>
        <p>{{ text('安装脚本会完成包安装和配置生成；Feishu/Weixin 授权必须由用户扫码完成。', 'The installer can install the package and config; Feishu/Weixin authorization must be completed by QR scan.') }}</p>
        <pre class="codex-stack-code">{{ summary.ccConnect.setupCommands.join('\n') }}</pre>
        <button type="button" class="primary-button" :disabled="busy || !canMutate || !summary.ccConnect.canFinalize" @click="finalizeCcConnect">
          {{ text('完成 cc-connect 服务安装', 'Finish cc-connect service setup') }}
        </button>
      </article>

      <article class="panel-card codex-stack-card codex-stack-card-wide">
        <div class="codex-stack-section-head">
          <div>
            <p class="eyebrow">{{ text('SERVICES', 'SERVICES') }}</p>
            <h3>{{ text('服务管理', 'Service Management') }}</h3>
          </div>
          <button type="button" class="secondary-button compact-button" :disabled="busy || !canMutate" @click="repairRecommended">
            {{ text('推荐修复', 'Recommended repair') }}
          </button>
        </div>
        <div class="codex-stack-service-list">
          <div v-for="service in summary.services" :key="service.id" class="codex-stack-service-row">
            <span :class="`codex-stack-dot ${service.active ? 'tone-sage' : 'tone-accent'}`"></span>
            <strong>{{ service.id }}</strong>
            <span>{{ service.enabled ? text('已启用', 'enabled') : text('未启用', 'disabled') }}</span>
            <span>{{ service.active ? text('运行中', 'active') : service.rawActiveState }}</span>
            <div class="codex-stack-service-actions">
              <button type="button" class="secondary-button compact-button" :disabled="busy || !canMutate" @click="serviceAction(service.id, 'restart')">{{ text('重启', 'Restart') }}</button>
              <button type="button" class="secondary-button compact-button" :disabled="busy || !canMutate" @click="serviceAction(service.id, 'start')">{{ text('启动', 'Start') }}</button>
              <button type="button" class="secondary-button compact-button" :disabled="busy || !canMutate" @click="serviceAction(service.id, 'enable')">{{ text('启用', 'Enable') }}</button>
              <button type="button" class="secondary-button compact-button" :disabled="busy || !canMutate" @click="serviceAction(service.id, 'stop')">{{ text('停止', 'Stop') }}</button>
              <button type="button" class="secondary-button compact-button" :disabled="busy" @click="loadLogs(service.id)">{{ text('日志', 'Logs') }}</button>
            </div>
          </div>
        </div>
      </article>

      <article class="panel-card codex-stack-card codex-stack-card-wide">
        <div class="codex-stack-section-head">
          <div>
            <p class="eyebrow">{{ text('JOBS / LOGS', 'JOBS / LOGS') }}</p>
            <h3>{{ activeJob ? `${activeJob.kind}: ${activeJob.status}` : text('最近输出', 'Recent output') }}</h3>
          </div>
        </div>
        <pre class="codex-stack-log">{{ logOutput || activeJob?.logTail || checkOutput || text('暂无输出。', 'No output yet.') }}</pre>
      </article>
    </div>

    <section v-else class="panel-card codex-stack-empty">
      {{ text('正在读取 Codex 栈状态...', 'Loading Codex Stack status...') }}
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useLocalePreference } from "../../shared/locale";
import type {
  CodexStackJob,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";
import {
  controlCodexStackService,
  enableCodexStackManagement,
  fetchCodexStackJob,
  fetchCodexStackLogs,
  fetchCodexStackSummary,
  finalizeCodexStackCcConnect,
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
const activeJob = ref<CodexStackJob | null>(null);
const checkOutput = ref("");
const logOutput = ref("");
const loading = ref(false);
const busy = ref(false);
const restartRequiredUnits = ref<CodexStackServiceId[]>([]);
const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);
let pollTimer: number | null = null;

const installForm = reactive({
  model: "glm-5.1",
  cpaPort: 8317,
  compactPort: 18796,
  cpaKey: "",
  upstreamBaseUrl: "",
  upstreamApiKey: "",
  skipNpm: false,
  skipCcConnect: false,
  noStart: false,
});

const configForm = reactive({
  defaultModel: "glm-5.1",
  cpaPort: 8317,
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
const modelOptions = computed(() => summary.value?.models.available.length ? summary.value.models.available : ["glm-5.1"]);

function componentTone(status: Parameters<typeof codexStackComponentTone>[0]) {
  return codexStackComponentTone(status);
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

onMounted(() => {
  void loadSummary();
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<style scoped>
.codex-stack-page {
  gap: 18px;
}

.codex-stack-hero,
.codex-stack-lock-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.codex-stack-hero-metrics,
.codex-stack-actions-row,
.codex-stack-check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.codex-stack-hero-metrics span,
.codex-stack-check-row label {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 10px;
  background: var(--surface);
  color: var(--text-soft);
}

.codex-stack-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.codex-stack-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.codex-stack-card-wide {
  grid-column: 1 / -1;
}

.codex-stack-section-head,
.codex-stack-service-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.codex-stack-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.codex-stack-status-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: var(--surface);
}

.codex-stack-status-card p,
.codex-stack-status-card small {
  margin: 4px 0 0;
  color: var(--muted);
}

.codex-stack-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.codex-stack-service-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.codex-stack-service-row {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 10px;
  background: var(--surface);
}

.codex-stack-service-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.codex-stack-dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--muted-soft);
  box-shadow: 0 0 18px currentColor;
}

.tone-sage {
  color: var(--success);
  background: var(--success);
}

.tone-accent {
  color: var(--acc);
  background: var(--acc);
}

.tone-danger {
  color: var(--danger);
  background: var(--danger);
}

.tone-neutral {
  color: var(--muted-soft);
  background: var(--muted-soft);
}

.codex-stack-code,
.codex-stack-log {
  overflow: auto;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px;
  background: var(--code-bg);
  color: var(--text-soft);
  white-space: pre-wrap;
}

.codex-stack-log {
  min-height: 220px;
  max-height: 420px;
}

.codex-stack-empty {
  padding: 24px;
}

@media (max-width: 960px) {
  .codex-stack-grid,
  .codex-stack-status-grid,
  .codex-stack-form-grid {
    grid-template-columns: 1fr;
  }

  .codex-stack-hero,
  .codex-stack-lock-card,
  .codex-stack-section-head,
  .codex-stack-service-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
