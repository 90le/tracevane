<template>
  <section class="page-shell channel-connectors-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">Channel Connectors</p>
        <h2 class="page-title">{{ text('渠道连接', 'Channel Connectors') }}</h2>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button ccx-icon-button" :disabled="loading" @click="loadAll">
          <RefreshCw :size="16" />
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新', 'Refresh') }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="status-banner" :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ notice.message }}
    </div>
    <div v-else-if="loading && !loaded" class="status-banner">
      {{ text('正在加载 Channel Connectors...', 'Loading Channel Connectors...') }}
    </div>

    <section class="ccx-layout">
      <aside class="ccx-rail">
        <article class="ccx-panel">
          <div class="ccx-panel-head">
            <div>
              <p class="eyebrow">Runtime</p>
              <h3>Channel daemon</h3>
            </div>
            <StatusPill :label="daemonStateLabel" :tone="daemonStateTone" />
          </div>

          <div class="ccx-facts">
            <div>
              <span>{{ text('Service', 'Service') }}</span>
              <strong>{{ service?.plan.serviceName || '-' }}</strong>
            </div>
            <div>
              <span>{{ text('Supervisor', 'Supervisor') }}</span>
              <strong>{{ service?.plan.supervisor || '-' }}</strong>
            </div>
            <div>
              <span>{{ text('配置', 'Config') }}</span>
              <strong>{{ configPreview?.configPath || '-' }}</strong>
            </div>
            <div>
              <span>{{ text('日志', 'Log') }}</span>
              <strong>{{ logs?.logFile || '-' }}</strong>
            </div>
          </div>

          <div class="ccx-action-row">
            <button
              type="button"
              class="primary-button compact-button ccx-icon-button"
              :disabled="busy"
              @click="runServiceAction('ensure-running')"
            >
              <Power :size="16" />
              {{ busy ? text('执行中...', 'Running...') : text('确保运行', 'Ensure') }}
            </button>
            <button
              type="button"
              class="secondary-button compact-button ccx-icon-button"
              :disabled="busy"
              @click="runServiceAction('status')"
            >
              <Activity :size="16" />
              {{ text('状态', 'Status') }}
            </button>
            <details class="ccx-action-more">
              <summary class="secondary-button compact-button ccx-icon-button">
                <MoreHorizontal :size="16" />
                {{ text('操作', 'Actions') }}
              </summary>
              <div class="ccx-action-menu">
                <button type="button" :disabled="busy" @click="previewService">
                  <FileText :size="15" />
                  {{ text('预览配置', 'Preview config') }}
                </button>
                <button type="button" :disabled="busy" @click="runServiceAction('install')">
                  <Download :size="15" />
                  {{ text('安装/启用', 'Install / enable') }}
                </button>
                <button type="button" :disabled="busy" @click="runServiceAction('start')">
                  <Play :size="15" />
                  {{ text('启动', 'Start') }}
                </button>
                <button type="button" :disabled="busy" @click="runServiceAction('restart')">
                  <RotateCw :size="15" />
                  {{ text('重启', 'Restart') }}
                </button>
                <button type="button" :disabled="busy" @click="runServiceAction('stop')">
                  <Square :size="15" />
                  {{ text('停止', 'Stop') }}
                </button>
              </div>
            </details>
          </div>

          <div v-if="actionResult" class="ccx-output" :class="{ failure: !actionResult.ok }">
            <div class="ccx-output__head">
              <strong>{{ actionTitle }}</strong>
              <span>{{ formatTimestamp(actionResult.checkedAt) }}</span>
            </div>
            <pre>{{ actionOutput }}</pre>
          </div>
        </article>
      </aside>

      <main class="ccx-main">
        <nav class="ccx-tabs" role="tablist" aria-label="Channel Connectors workspace">
          <button
            v-for="tab in tabs"
            :id="`ccx-tab-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            class="surface-tab"
            :class="{ active: activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`ccx-panel-${tab.id}`"
            :tabindex="activeTab === tab.id ? 0 : -1"
            @click="activeTab = tab.id"
          >
            {{ text(tab.zh, tab.en) }}
          </button>
        </nav>

        <article
          v-show="activeTab === 'runtime'"
          id="ccx-panel-runtime"
          class="ccx-panel ccx-workspace-panel"
          role="tabpanel"
          aria-labelledby="ccx-tab-runtime"
        >
          <div class="ccx-panel-head">
            <div>
              <p class="eyebrow">Runtime</p>
              <h3>{{ text('运行链路', 'Runtime chain') }}</h3>
            </div>
          </div>
          <div class="ccx-chain">
            <div v-for="(item, index) in runtimeChain" :key="item" class="ccx-chain-row">
              <span>{{ index + 1 }}</span>
              <strong>{{ item }}</strong>
            </div>
          </div>
        </article>

        <article
          v-show="activeTab === 'projects'"
          id="ccx-panel-projects"
          class="ccx-panel ccx-workspace-panel"
          role="tabpanel"
          aria-labelledby="ccx-tab-projects"
        >
          <div class="ccx-panel-head">
            <div>
              <p class="eyebrow">Projects</p>
              <h3>{{ text('项目与 Agent', 'Projects and agents') }}</h3>
            </div>
          </div>
          <div class="ccx-list">
            <div class="ccx-list-row">
              <small>{{ text('默认项目', 'Default project') }}</small>
              <strong>default</strong>
            </div>
            <div class="ccx-list-row">
              <small>{{ text('首批 Agent', 'Initial agents') }}</small>
              <strong>{{ supportedAgentsLabel }}</strong>
            </div>
            <div class="ccx-list-row">
              <small>{{ text('模型中转', 'Model relay') }}</small>
              <strong>{{ status?.lifecycle.modelRelayOwner || 'studio-gateway-daemon' }}</strong>
            </div>
          </div>
        </article>

        <article
          v-show="activeTab === 'platforms'"
          id="ccx-panel-platforms"
          class="ccx-panel ccx-workspace-panel"
          role="tabpanel"
          aria-labelledby="ccx-tab-platforms"
        >
          <div class="ccx-panel-head">
            <div>
              <p class="eyebrow">Platforms</p>
              <h3>{{ text('平台绑定', 'Platform bindings') }}</h3>
            </div>
          </div>
          <div class="ccx-list">
            <div class="ccx-list-row">
              <small>{{ text('首批平台', 'Initial platforms') }}</small>
              <strong>{{ supportedPlatformsLabel }}</strong>
            </div>
            <div class="ccx-list-row">
              <small>{{ text('绑定粒度', 'Binding unit') }}</small>
              <strong>{{ status?.bindingPolicy.model || '-' }}</strong>
            </div>
            <div class="ccx-list-row">
              <small>{{ text('微信个人号', 'Personal WeChat') }}</small>
              <strong>{{ text('单账号单 Agent', 'One agent per account') }}</strong>
            </div>
          </div>
        </article>

        <article
          v-show="activeTab === 'sessions'"
          id="ccx-panel-sessions"
          class="ccx-panel ccx-workspace-panel"
          role="tabpanel"
          aria-labelledby="ccx-tab-sessions"
        >
          <div class="ccx-panel-head">
            <div>
              <p class="eyebrow">Sessions</p>
              <h3>{{ text('会话与日志', 'Sessions and logs') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button ccx-icon-button" :disabled="loading" @click="refreshLogs">
              <RefreshCw :size="16" />
              {{ text('刷新日志', 'Refresh logs') }}
            </button>
          </div>
          <pre v-if="logText" class="ccx-log">{{ logText }}</pre>
          <div v-else class="ccx-empty">
            {{ text('暂无 Channel daemon 日志', 'No Channel daemon logs yet') }}
          </div>
        </article>
      </main>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Activity,
  Download,
  FileText,
  MoreHorizontal,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Square,
} from '@lucide/vue';
import type {
  ChannelConnectorsDaemonAction,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchChannelConnectorsDaemonConfig,
  fetchChannelConnectorsDaemonLogs,
  fetchChannelConnectorsDaemonService,
  fetchChannelConnectorsStatus,
  manageChannelConnectorsDaemonService,
} from './api';
import './channel-connectors-workspace.css';

defineOptions({ name: 'ChannelConnectorsControlPage' });

type WorkspaceTab = 'runtime' | 'projects' | 'platforms' | 'sessions';

const { text } = useLocalePreference();
const tabs: Array<{ id: WorkspaceTab; zh: string; en: string }> = [
  { id: 'runtime', zh: '运行', en: 'Runtime' },
  { id: 'projects', zh: '项目', en: 'Projects' },
  { id: 'platforms', zh: '平台', en: 'Platforms' },
  { id: 'sessions', zh: '会话', en: 'Sessions' },
];

const loading = ref(false);
const busy = ref(false);
const loaded = ref(false);
const activeTab = ref<WorkspaceTab>('runtime');
const status = ref<ChannelConnectorsStatusResponse | null>(null);
const service = ref<ChannelConnectorsDaemonResponse | null>(null);
const configPreview = ref<ChannelConnectorsDaemonConfigResponse | null>(null);
const logs = ref<ChannelConnectorsLogsResponse | null>(null);
const actionResult = ref<ChannelConnectorsDaemonResponse | null>(null);
const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);

const runtimeChain = computed(() => status.value?.runtimeChain || [
  'IM channel',
  'Studio native Channel daemon',
  'local CLI Agent bot',
  'Studio Gateway daemon',
  'upstream provider',
]);

const supportedAgentsLabel = computed(() =>
  (status.value?.bindingPolicy.supportedAgents || ['codex', 'claude-code'])
    .join(' / '),
);

const supportedPlatformsLabel = computed(() =>
  (status.value?.bindingPolicy.supportedPlatforms || ['octo', 'feishu', 'wechat', 'wecom'])
    .join(' / '),
);

const daemonStateLabel = computed(() => {
  if (!service.value) return text('未知', 'Unknown');
  if (service.value.skippedReason === 'native_daemon_entry_missing') return text('需构建', 'Build needed');
  if (service.value.serviceManager.active === true) return text('运行中', 'Running');
  if (service.value.installed) return text('已安装', 'Installed');
  return text('未安装', 'Not installed');
});

const daemonStateTone = computed<'neutral' | 'accent' | 'sage' | 'danger'>(() => {
  if (!service.value) return 'neutral';
  if (service.value.skippedReason) return 'danger';
  if (service.value.serviceManager.active === true) return 'sage';
  if (service.value.installed) return 'accent';
  return 'neutral';
});

const actionTitle = computed(() => {
  if (!actionResult.value) return '';
  return `${actionResult.value.action} ${actionResult.value.ok ? 'ok' : 'blocked'}`;
});

const actionOutput = computed(() => {
  const result = actionResult.value;
  if (!result) return '';
  const lines = [
    `Service: ${result.plan.serviceName}`,
    `Supervisor: ${result.plan.supervisor}`,
    `Node: ${result.plan.nodePath}`,
    `Entry: ${result.plan.daemonEntry}`,
    `Config: ${result.plan.configPath}`,
    `Installed: ${String(result.installed)}`,
    `Template current: ${String(result.templateCurrent)}`,
    `Config current: ${String(result.configCurrent)}`,
  ];
  if (result.skippedReason) lines.push(`Blocked: ${result.skippedReason}`);
  for (const diagnostic of result.diagnostics) lines.push(diagnostic);
  for (const command of result.commandsRun) {
    lines.push(`${command.ok ? 'OK' : 'FAIL'} ${command.label}`);
    const stdout = command.stdout.trim();
    const stderr = command.stderr.trim();
    if (stdout) lines.push(stdout);
    if (stderr) lines.push(stderr);
    if (command.error && !stderr) lines.push(command.error);
  }
  if (result.action === 'preview') lines.push('', result.config.preview);
  return lines.join('\n');
});

const logText = computed(() => (logs.value?.lines || []).join('\n'));

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function reportError(error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback;
  notice.value = { kind: 'error', message };
}

async function refreshLogs(): Promise<void> {
  logs.value = await fetchChannelConnectorsDaemonLogs();
}

async function loadAll(): Promise<void> {
  loading.value = true;
  notice.value = null;
  try {
    const [nextStatus, nextService, nextConfig, nextLogs] = await Promise.all([
      fetchChannelConnectorsStatus(),
      fetchChannelConnectorsDaemonService(),
      fetchChannelConnectorsDaemonConfig(),
      fetchChannelConnectorsDaemonLogs(),
    ]);
    status.value = nextStatus;
    service.value = nextService;
    configPreview.value = nextConfig;
    logs.value = nextLogs;
    loaded.value = true;
  } catch (error) {
    reportError(error, text('加载 Channel Connectors 失败', 'Failed to load Channel Connectors'));
  } finally {
    loading.value = false;
  }
}

async function previewService(): Promise<void> {
  busy.value = true;
  notice.value = null;
  try {
    const result = await manageChannelConnectorsDaemonService('preview');
    actionResult.value = result;
    service.value = result;
    configPreview.value = result.config;
  } catch (error) {
    reportError(error, text('预览失败', 'Preview failed'));
  } finally {
    busy.value = false;
  }
}

async function runServiceAction(action: ChannelConnectorsDaemonAction): Promise<void> {
  busy.value = true;
  notice.value = null;
  try {
    const result = await manageChannelConnectorsDaemonService(action, {
      apply: action !== 'preview' && action !== 'status',
      runCommands: action !== 'preview',
    });
    actionResult.value = result;
    service.value = result;
    configPreview.value = result.config;
    notice.value = {
      kind: result.ok ? 'success' : 'error',
      message: result.ok
        ? text('操作已完成', 'Action completed')
        : result.skippedReason || text('操作被阻断', 'Action blocked'),
    };
    await refreshLogs();
  } catch (error) {
    reportError(error, text('操作失败', 'Action failed'));
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void loadAll();
});
</script>
