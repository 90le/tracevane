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
            <button type="button" class="secondary-button compact-button ccx-icon-button" @click="newProfileDraft">
              <Plus :size="16" />
              {{ text('新建', 'New') }}
            </button>
          </div>
          <div class="ccx-split">
            <form class="ccx-form" @submit.prevent="saveProfileDraft">
              <label>
                <span>Profile ID</span>
                <input v-model.trim="profileDraft.id" autocomplete="off" />
              </label>
              <label>
                <span>{{ text('名称', 'Name') }}</span>
                <input v-model.trim="profileDraft.name" autocomplete="off" />
              </label>
              <label>
                <span>Agent</span>
                <select v-model="profileDraft.agent">
                  <option v-for="agent in supportedAgents" :key="agent" :value="agent">{{ agent }}</option>
                </select>
              </label>
              <label>
                <span>{{ text('模型', 'Model') }}</span>
                <input v-model.trim="profileDraft.model" placeholder="gpt-5" autocomplete="off" />
              </label>
              <label class="ccx-wide-field">
                <span>{{ text('工作目录', 'Work directory') }}</span>
                <input v-model.trim="profileDraft.workDir" autocomplete="off" />
              </label>
              <label>
                <span>{{ text('权限', 'Permission') }}</span>
                <select v-model="profileDraft.permissionMode">
                  <option v-for="mode in permissionModes" :key="mode" :value="mode">{{ mode }}</option>
                </select>
              </label>
              <label>
                <span>App Profile</span>
                <input v-model.trim="profileDraft.appProfileRef" autocomplete="off" />
              </label>
              <label class="ccx-wide-field">
                <span>Gateway</span>
                <input v-model.trim="profileDraft.gatewayEndpoint" autocomplete="off" />
              </label>
              <div class="ccx-form-actions">
                <button type="submit" class="primary-button compact-button ccx-icon-button" :disabled="savingConfig">
                  <Save :size="16" />
                  {{ savingConfig ? text('保存中...', 'Saving...') : text('保存 Profile', 'Save profile') }}
                </button>
                <button type="button" class="secondary-button compact-button ccx-icon-button" :disabled="savingConfig" @click="setDefaultProfile">
                  <Star :size="16" />
                  {{ text('设为默认', 'Set default') }}
                </button>
              </div>
            </form>

            <div class="ccx-list">
              <button
                v-for="profile in nativeConfig?.config.agentProfiles || []"
                :key="profile.id"
                type="button"
                class="ccx-select-row"
                :class="{ active: profileDraft.id === profile.id }"
                @click="selectProfile(profile)"
              >
                <small>{{ profile.agent }} · {{ profile.permissionMode }}</small>
                <strong>{{ profile.name }}</strong>
                <span>{{ profile.model || 'default model' }} · {{ profile.workDir }}</span>
              </button>
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
            <div class="ccx-platform-actions">
              <button type="button" class="secondary-button compact-button ccx-icon-button" @click="newBindingDraft('octo')">
                <Plus :size="16" />
                Octo
              </button>
              <button type="button" class="secondary-button compact-button ccx-icon-button" @click="newBindingDraft('feishu')">
                <Plus :size="16" />
                {{ text('飞书', 'Feishu') }}
              </button>
            </div>
          </div>
          <div class="ccx-split">
            <form class="ccx-form" @submit.prevent="saveBindingDraft">
              <label>
                <span>Binding ID</span>
                <input v-model.trim="bindingDraft.id" autocomplete="off" />
              </label>
              <label>
                <span>{{ text('平台', 'Platform') }}</span>
                <select v-model="bindingDraft.platform">
                  <option v-for="platform in supportedPlatforms" :key="platform" :value="platform">{{ platform }}</option>
                </select>
              </label>
              <label>
                <span>{{ text('账号', 'Account') }}</span>
                <input v-model.trim="bindingDraft.accountId" autocomplete="off" />
              </label>
              <label>
                <span>Bot ID</span>
                <input v-model.trim="bindingDraft.botId" autocomplete="off" />
              </label>
              <label>
                <span>{{ text('显示名', 'Display name') }}</span>
                <input v-model.trim="bindingDraft.displayName" autocomplete="off" />
              </label>
              <label>
                <span>Agent Profile</span>
                <select v-model="bindingDraft.agentProfileId">
                  <option v-for="profile in nativeConfig?.config.agentProfiles || []" :key="profile.id" :value="profile.id">
                    {{ profile.name }}
                  </option>
                </select>
              </label>
              <label class="ccx-check-field">
                <input v-model="bindingDraft.enabled" type="checkbox" />
                <span>{{ text('启用', 'Enabled') }}</span>
              </label>
              <fieldset v-if="bindingDraft.platform === 'octo'" class="ccx-credential-box">
                <legend>Octo(dmwork)</legend>
                <label>
                  <span>API Server</span>
                  <input v-model.trim="bindingDraft.metadataApiUrl" placeholder="https://im.deepminer.com.cn/api" autocomplete="off" />
                </label>
                <label>
                  <span>Bot Token</span>
                  <input v-model.trim="bindingDraft.metadataBotToken" type="password" autocomplete="off" />
                </label>
                <label class="ccx-wide-field">
                  <span>WS URL</span>
                  <input v-model.trim="bindingDraft.metadataWsUrl" autocomplete="off" />
                </label>
                <label>
                  <span>{{ text('附件上限', 'Attachment max') }}</span>
                  <input v-model.trim="bindingDraft.metadataAttachmentMaxBytes" placeholder="128mb" autocomplete="off" />
                </label>
                <label class="ccx-check-field">
                  <input v-model="bindingDraft.metadataStageOctoUrlAttachments" type="checkbox" />
                  <span>Stage URL attachments</span>
                </label>
                <label class="ccx-check-field">
                  <input v-model="bindingDraft.metadataAllowPrivateAttachmentUrls" type="checkbox" />
                  <span>Private attachment URLs</span>
                </label>
              </fieldset>
              <fieldset v-else-if="bindingDraft.platform === 'feishu'" class="ccx-credential-box">
                <legend>{{ text('飞书', 'Feishu') }}</legend>
                <label>
                  <span>API URL</span>
                  <input v-model.trim="bindingDraft.metadataApiUrl" placeholder="https://open.feishu.cn" autocomplete="off" />
                </label>
                <label>
                  <span>App Secret</span>
                  <input v-model.trim="bindingDraft.metadataAppSecret" type="password" autocomplete="off" />
                </label>
                <label class="ccx-wide-field">
                  <span>Verification Token</span>
                  <input v-model.trim="bindingDraft.metadataVerificationToken" type="password" autocomplete="off" />
                </label>
                <label class="ccx-wide-field">
                  <span>Chat IDs</span>
                  <textarea v-model="bindingDraft.metadataChatIdsText" rows="2" placeholder="oc_xxx&#10;oc_yyy" />
                </label>
              </fieldset>
              <label class="ccx-wide-field">
                <span>{{ text('白名单', 'Allowlist') }}</span>
                <textarea v-model="bindingDraft.allowlistText" rows="3" placeholder="user-a&#10;user-b" />
              </label>
              <label class="ccx-wide-field">
                <span>{{ text('管理员', 'Admins') }}</span>
                <textarea v-model="bindingDraft.adminUsersText" rows="3" placeholder="admin-a&#10;admin-b" />
              </label>
              <div class="ccx-form-actions">
                <button type="submit" class="primary-button compact-button ccx-icon-button" :disabled="savingConfig">
                  <Save :size="16" />
                  {{ savingConfig ? text('保存中...', 'Saving...') : text('保存绑定', 'Save binding') }}
                </button>
                <button
                  v-if="bindingDraft.platform === 'octo' || bindingDraft.platform === 'feishu'"
                  type="button"
                  class="secondary-button compact-button ccx-icon-button"
                  :disabled="savingConfig || platformSmokeBusy"
                  @click="testBindingDraft"
                >
                  <Activity :size="16" />
                  {{ platformSmokeBusy ? text('测试中...', 'Testing...') : text('测试连接', 'Test') }}
                </button>
                <button
                  type="button"
                  class="secondary-button compact-button ccx-icon-button"
                  :disabled="savingConfig || !bindingExists"
                  @click="deleteBindingDraft"
                >
                  <Trash2 :size="16" />
                  {{ text('删除', 'Delete') }}
                </button>
              </div>
              <div v-if="platformSmoke" class="ccx-output ccx-platform-smoke" :class="{ failure: platformSmoke.transport.ok !== true }">
                <div class="ccx-output__head">
                  <strong>{{ platformSmoke.adapter }} {{ platformSmoke.transport.action }}</strong>
                  <span>{{ formatTimestamp(platformSmoke.checkedAt) }}</span>
                </div>
                <pre>{{ platformSmokeOutput }}</pre>
              </div>
            </form>

            <div class="ccx-list">
              <button
                v-for="binding in nativeConfig?.config.platformBindings || []"
                :key="binding.id"
                type="button"
                class="ccx-select-row"
                :class="{ active: bindingDraft.id === binding.id }"
                @click="selectBinding(binding)"
              >
                <small>{{ binding.platform }} · {{ binding.enabled ? text('启用', 'Enabled') : text('停用', 'Disabled') }}</small>
                <strong>{{ binding.displayName }}</strong>
                <span>{{ binding.accountId }}{{ binding.botId ? ` / ${binding.botId}` : '' }} -> {{ binding.agentProfileId }}</span>
              </button>
              <div v-if="!(nativeConfig?.config.platformBindings || []).length" class="ccx-empty compact">
                {{ text('暂无平台绑定', 'No platform bindings') }}
              </div>
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
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Save,
  Square,
  Star,
  Trash2,
} from '@lucide/vue';
import type {
  ChannelConnectorAgentId,
  ChannelConnectorAgentProfile,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeResponse,
  ChannelConnectorPermissionMode,
  ChannelConnectorPlatformBinding,
  ChannelConnectorPlatformId,
  ChannelConnectorsDaemonAction,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsNativeConfig,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchChannelConnectorsDaemonConfig,
  fetchChannelConnectorsDaemonLogs,
  fetchChannelConnectorsDaemonService,
  fetchChannelConnectorsNativeConfig,
  fetchChannelConnectorsStatus,
  manageChannelConnectorsDaemonService,
  runFeishuTransportSmoke,
  runOctoTransportSmoke,
  saveChannelConnectorsNativeConfig,
} from './api';
import './channel-connectors-workspace.css';

defineOptions({ name: 'ChannelConnectorsControlPage' });

type WorkspaceTab = 'runtime' | 'projects' | 'platforms' | 'sessions';
type BindingDraft = Omit<ChannelConnectorPlatformBinding, 'allowlist' | 'adminUsers' | 'metadata'> & {
  allowlistText: string;
  adminUsersText: string;
  metadata: Record<string, unknown>;
  metadataApiUrl: string;
  metadataBotToken: string;
  metadataWsUrl: string;
  metadataAppSecret: string;
  metadataVerificationToken: string;
  metadataChatIdsText: string;
  metadataAttachmentMaxBytes: string;
  metadataAllowPrivateAttachmentUrls: boolean;
  metadataStageOctoUrlAttachments: boolean;
};

const { text } = useLocalePreference();
const tabs: Array<{ id: WorkspaceTab; zh: string; en: string }> = [
  { id: 'runtime', zh: '运行', en: 'Runtime' },
  { id: 'projects', zh: '项目', en: 'Projects' },
  { id: 'platforms', zh: '平台', en: 'Platforms' },
  { id: 'sessions', zh: '会话', en: 'Sessions' },
];

const loading = ref(false);
const busy = ref(false);
const savingConfig = ref(false);
const loaded = ref(false);
const activeTab = ref<WorkspaceTab>('runtime');
const status = ref<ChannelConnectorsStatusResponse | null>(null);
const service = ref<ChannelConnectorsDaemonResponse | null>(null);
const nativeConfig = ref<ChannelConnectorsNativeConfigResponse | null>(null);
const configPreview = ref<ChannelConnectorsDaemonConfigResponse | null>(null);
const logs = ref<ChannelConnectorsLogsResponse | null>(null);
const actionResult = ref<ChannelConnectorsDaemonResponse | null>(null);
const platformSmoke = ref<ChannelConnectorOctoTransportSmokeResponse | ChannelConnectorFeishuTransportSmokeResponse | null>(null);
const platformSmokeBusy = ref(false);
const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);

const profileDraft = ref<ChannelConnectorAgentProfile>(emptyProfileDraft());
const bindingDraft = ref<BindingDraft>(emptyBindingDraft());

const runtimeChain = computed(() => status.value?.runtimeChain || [
  'IM channel',
  'Studio native Channel daemon',
  'local CLI Agent bot',
  'Studio Gateway daemon',
  'upstream provider',
]);

const supportedAgents = computed<ChannelConnectorAgentId[]>(() =>
  nativeConfig.value?.supportedAgents || status.value?.bindingPolicy.supportedAgents || ['codex', 'claude-code', 'opencode'] as ChannelConnectorAgentId[],
);

const supportedPlatforms = computed<ChannelConnectorPlatformId[]>(() =>
  nativeConfig.value?.supportedPlatforms || status.value?.bindingPolicy.supportedPlatforms || ['octo', 'feishu', 'wechat', 'wecom'] as ChannelConnectorPlatformId[],
);

const permissionModes = computed<ChannelConnectorPermissionMode[]>(() =>
  nativeConfig.value?.permissionModes || ['suggest', 'read-only', 'auto-edit', 'full-auto', 'plan', 'yolo'] as ChannelConnectorPermissionMode[],
);

const bindingExists = computed(() =>
  (nativeConfig.value?.config.platformBindings || []).some((binding) => binding.id === bindingDraft.value.id),
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

const platformSmokeOutput = computed(() => {
  const result = platformSmoke.value;
  if (!result) return '';
  const transport = result.transport;
  return [
    `Binding: ${result.binding?.id || '-'}`,
    `Action: ${transport.action}`,
    `OK: ${String(transport.ok)}`,
    `HTTP: ${transport.statusCode ?? '-'}`,
    `Requests: ${transport.requestCount}`,
    transport.error ? `Error: ${transport.error}` : '',
    'tokenCache' in transport && transport.tokenCache ? `Token cache: ${transport.tokenCache}` : '',
    'robotId' in transport && transport.robotId ? `Robot ID: ${transport.robotId}` : '',
    'wsUrl' in transport && transport.wsUrl ? `WS URL: ${transport.wsUrl}` : '',
    'messageId' in transport && transport.messageId ? `Message ID: ${transport.messageId}` : '',
  ].filter(Boolean).join('\n');
});

const logText = computed(() => (logs.value?.lines || []).join('\n'));

function emptyProfileDraft(): ChannelConnectorAgentProfile {
  return {
    id: 'default-codex',
    name: 'Default Codex',
    agent: 'codex',
    model: '',
    workDir: '',
    permissionMode: 'suggest',
    gatewayEndpoint: 'http://127.0.0.1:18796/v1',
    gatewayKeyRef: 'studio-gateway-client-key',
    appProfileRef: 'default',
  };
}

function emptyBindingDraft(): BindingDraft {
  return {
    id: '',
    platform: 'octo',
    accountId: '',
    botId: '',
    displayName: '',
    agentProfileId: '',
    enabled: true,
    allowlistText: '',
    adminUsersText: '',
    metadata: {},
    metadataApiUrl: '',
    metadataBotToken: '',
    metadataWsUrl: '',
    metadataAppSecret: '',
    metadataVerificationToken: '',
    metadataChatIdsText: '',
    metadataAttachmentMaxBytes: '',
    metadataAllowPrivateAttachmentUrls: false,
    metadataStageOctoUrlAttachments: true,
  };
}

function defaultApiUrl(platform: ChannelConnectorPlatformId): string {
  if (platform === 'feishu') return 'https://open.feishu.cn';
  if (platform === 'octo') return 'https://im.deepminer.com.cn/api';
  return '';
}

function textToList(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);
}

function listToText(value: string[]): string {
  return value.join('\n');
}

function cloneMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = Array.isArray(item) ? [...item] : item;
  }
  return output;
}

function metadataString(metadata: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function metadataBoolean(metadata: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
  }
  return fallback;
}

function metadataListText(metadata: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join('\n');
    if (typeof value === 'string' && value.trim()) return value.split(/[\n,]/g).map((item) => item.trim()).filter(Boolean).join('\n');
  }
  return '';
}

function cloneNativeConfig(): ChannelConnectorsNativeConfig | null {
  if (!nativeConfig.value) return null;
  return {
    ...nativeConfig.value.config,
    agentProfiles: nativeConfig.value.config.agentProfiles.map((profile) => ({ ...profile })),
    platformBindings: nativeConfig.value.config.platformBindings.map((binding) => {
      const next: ChannelConnectorPlatformBinding = {
        ...binding,
        allowlist: [...binding.allowlist],
        adminUsers: [...binding.adminUsers],
      };
      if (binding.metadata) next.metadata = cloneMetadata(binding.metadata);
      return next;
    }),
  };
}

function selectProfile(profile: ChannelConnectorAgentProfile): void {
  profileDraft.value = {
    ...profile,
    model: profile.model || '',
  };
}

function selectBinding(binding: ChannelConnectorPlatformBinding): void {
  const metadata = cloneMetadata(binding.metadata);
  bindingDraft.value = {
    id: binding.id,
    platform: binding.platform,
    accountId: binding.accountId,
    botId: binding.botId || '',
    displayName: binding.displayName,
    agentProfileId: binding.agentProfileId,
    enabled: binding.enabled,
    allowlistText: listToText(binding.allowlist),
    adminUsersText: listToText(binding.adminUsers),
    metadata,
    metadataApiUrl: metadataString(metadata, ['apiUrl', 'api_url', 'baseUrl', 'base_url', 'domain'], defaultApiUrl(binding.platform)),
    metadataBotToken: metadataString(metadata, ['botToken', 'bot_token', 'token']),
    metadataWsUrl: metadataString(metadata, ['wsUrl', 'ws_url']),
    metadataAppSecret: metadataString(metadata, ['appSecret', 'app_secret', 'feishuAppSecret', 'feishu_app_secret']),
    metadataVerificationToken: metadataString(metadata, ['verificationToken', 'verification_token', 'feishuVerificationToken', 'feishu_verification_token']),
    metadataChatIdsText: metadataListText(metadata, ['chatIds', 'chat_ids', 'chatId', 'chat_id', 'openChatIds', 'open_chat_ids']),
    metadataAttachmentMaxBytes: metadataString(metadata, ['attachmentMaxBytes', 'attachment_max_bytes', 'maxAttachmentBytes', 'max_attachment_bytes']),
    metadataAllowPrivateAttachmentUrls: metadataBoolean(metadata, ['allowPrivateAttachmentUrls', 'allow_private_attachment_urls', 'allowOctoPrivateAttachmentUrls', 'allow_octo_private_attachment_urls'], false),
    metadataStageOctoUrlAttachments: metadataBoolean(metadata, ['stageOctoUrlAttachments', 'stage_octo_url_attachments', 'stageUrlAttachments', 'stage_url_attachments'], true),
  };
  platformSmoke.value = null;
}

function newProfileDraft(): void {
  const profiles = nativeConfig.value?.config.agentProfiles || [];
  const base = profiles[0] || emptyProfileDraft();
  const nextNumber = profiles.length + 1;
  profileDraft.value = {
    ...base,
    id: `profile-${nextNumber}`,
    name: `Agent Profile ${nextNumber}`,
    model: '',
  };
}

function newBindingDraft(platform: ChannelConnectorPlatformId = 'octo'): void {
  const firstProfile = nativeConfig.value?.config.agentProfiles[0];
  const displayName = platform === 'feishu' ? 'Feishu Bot' : platform === 'octo' ? 'Octo Bot' : 'Platform Bot';
  bindingDraft.value = {
    ...emptyBindingDraft(),
    id: `${platform}-${Date.now().toString(36)}`,
    platform,
    displayName,
    agentProfileId: firstProfile?.id || '',
    metadataApiUrl: defaultApiUrl(platform),
  };
  platformSmoke.value = null;
}

function hydrateConfigDrafts(): void {
  const config = nativeConfig.value?.config;
  if (!config) return;
  const selectedProfile = config.agentProfiles.find((profile) => profile.id === profileDraft.value.id)
    || config.agentProfiles.find((profile) => profile.id === config.defaultAgentProfileId)
    || config.agentProfiles[0];
  if (selectedProfile) selectProfile(selectedProfile);

  const selectedBinding = config.platformBindings.find((binding) => binding.id === bindingDraft.value.id)
    || config.platformBindings[0];
  if (selectedBinding) {
    selectBinding(selectedBinding);
  } else {
    newBindingDraft();
  }
}

async function persistNativeConfig(config: ChannelConnectorsNativeConfig, message: string): Promise<void> {
  savingConfig.value = true;
  notice.value = null;
  try {
    const saved = await saveChannelConnectorsNativeConfig({ config });
    nativeConfig.value = saved;
    configPreview.value = await fetchChannelConnectorsDaemonConfig();
    hydrateConfigDrafts();
    notice.value = { kind: 'success', message };
  } catch (error) {
    reportError(error, text('保存 Channel Connectors 配置失败', 'Failed to save Channel Connectors config'));
  } finally {
    savingConfig.value = false;
  }
}

function profileFromDraft(): ChannelConnectorAgentProfile {
  return {
    ...profileDraft.value,
    id: profileDraft.value.id.trim(),
    name: profileDraft.value.name.trim() || profileDraft.value.id.trim(),
    model: profileDraft.value.model ? profileDraft.value.model.trim() : null,
    workDir: profileDraft.value.workDir.trim(),
    gatewayEndpoint: profileDraft.value.gatewayEndpoint.trim() || 'http://127.0.0.1:18796/v1',
    gatewayKeyRef: 'studio-gateway-client-key',
    appProfileRef: profileDraft.value.appProfileRef.trim() || 'default',
  };
}

async function saveProfileDraft(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  const profile = profileFromDraft();
  if (!profile.id || !profile.workDir) {
    notice.value = { kind: 'error', message: text('Profile ID 和工作目录必填', 'Profile ID and work directory are required') };
    return;
  }
  const index = config.agentProfiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) config.agentProfiles.splice(index, 1, profile);
  else config.agentProfiles.push(profile);
  if (!config.agentProfiles.some((item) => item.id === config.defaultAgentProfileId)) {
    config.defaultAgentProfileId = profile.id;
  }
  await persistNativeConfig(config, text('Profile 已保存', 'Profile saved'));
}

async function setDefaultProfile(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  const profile = profileFromDraft();
  const index = config.agentProfiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) config.agentProfiles.splice(index, 1, profile);
  else config.agentProfiles.push(profile);
  config.defaultAgentProfileId = profile.id;
  await persistNativeConfig(config, text('默认 Profile 已更新', 'Default profile updated'));
}

function bindingFromDraft(): ChannelConnectorPlatformBinding {
  const id = bindingDraft.value.id.trim()
    || `${bindingDraft.value.platform}-${bindingDraft.value.accountId.trim()}-${bindingDraft.value.botId.trim() || 'default'}`;
  const metadata = metadataFromBindingDraft();
  return {
    id,
    platform: bindingDraft.value.platform,
    accountId: bindingDraft.value.accountId.trim(),
    botId: bindingDraft.value.botId.trim() || null,
    displayName: bindingDraft.value.displayName.trim() || id,
    agentProfileId: bindingDraft.value.agentProfileId,
    enabled: bindingDraft.value.enabled,
    allowlist: textToList(bindingDraft.value.allowlistText),
    adminUsers: textToList(bindingDraft.value.adminUsersText),
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

function setMetadataString(metadata: Record<string, unknown>, key: string, value: string): void {
  const normalized = value.trim();
  if (normalized) metadata[key] = normalized;
  else delete metadata[key];
}

function setMetadataList(metadata: Record<string, unknown>, key: string, value: string): void {
  const items = textToList(value);
  if (items.length) metadata[key] = items;
  else delete metadata[key];
}

function metadataFromBindingDraft(): Record<string, unknown> {
  const metadata = cloneMetadata(bindingDraft.value.metadata);
  setMetadataString(metadata, 'apiUrl', bindingDraft.value.metadataApiUrl || defaultApiUrl(bindingDraft.value.platform));
  if (bindingDraft.value.platform === 'octo') {
    setMetadataString(metadata, 'botToken', bindingDraft.value.metadataBotToken);
    setMetadataString(metadata, 'wsUrl', bindingDraft.value.metadataWsUrl);
    setMetadataString(metadata, 'attachmentMaxBytes', bindingDraft.value.metadataAttachmentMaxBytes);
    metadata.stageOctoUrlAttachments = bindingDraft.value.metadataStageOctoUrlAttachments;
    metadata.allowPrivateAttachmentUrls = bindingDraft.value.metadataAllowPrivateAttachmentUrls;
    delete metadata.appSecret;
    delete metadata.verificationToken;
    delete metadata.chatIds;
  } else if (bindingDraft.value.platform === 'feishu') {
    setMetadataString(metadata, 'appSecret', bindingDraft.value.metadataAppSecret);
    setMetadataString(metadata, 'verificationToken', bindingDraft.value.metadataVerificationToken);
    setMetadataList(metadata, 'chatIds', bindingDraft.value.metadataChatIdsText);
    delete metadata.botToken;
    delete metadata.wsUrl;
    delete metadata.stageOctoUrlAttachments;
    delete metadata.allowPrivateAttachmentUrls;
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (value === '' || value === null || typeof value === 'undefined') delete metadata[key];
  }
  return metadata;
}

async function persistBindingDraft(message: string): Promise<ChannelConnectorPlatformBinding | null> {
  const config = cloneNativeConfig();
  if (!config) return null;
  const binding = bindingFromDraft();
  if (!binding.accountId || !binding.agentProfileId) {
    notice.value = { kind: 'error', message: text('账号和 Agent Profile 必填', 'Account and Agent Profile are required') };
    return null;
  }
  const index = config.platformBindings.findIndex((item) => item.id === binding.id);
  if (index >= 0) config.platformBindings.splice(index, 1, binding);
  else config.platformBindings.push(binding);
  await persistNativeConfig(config, message);
  return binding;
}

async function saveBindingDraft(): Promise<void> {
  await persistBindingDraft(text('平台绑定已保存', 'Platform binding saved'));
}

async function deleteBindingDraft(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  config.platformBindings = config.platformBindings.filter((binding) => binding.id !== bindingDraft.value.id);
  await persistNativeConfig(config, text('平台绑定已删除', 'Platform binding deleted'));
  platformSmoke.value = null;
}

async function testBindingDraft(): Promise<void> {
  platformSmokeBusy.value = true;
  platformSmoke.value = null;
  notice.value = null;
  try {
    const binding = await persistBindingDraft(text('平台绑定已保存，开始测试', 'Binding saved, testing'));
    if (!binding) return;
    if (binding.platform === 'octo') {
      platformSmoke.value = await runOctoTransportSmoke({
        bindingId: binding.id,
        action: 'register',
      });
    } else if (binding.platform === 'feishu') {
      platformSmoke.value = await runFeishuTransportSmoke({
        bindingId: binding.id,
        action: 'tenant-token',
      });
    }
    if (platformSmoke.value) {
      notice.value = {
        kind: platformSmoke.value.transport.ok === true ? 'success' : 'error',
        message: platformSmoke.value.transport.ok === true
          ? text('连接测试通过', 'Connection test passed')
          : platformSmoke.value.transport.error || text('连接测试失败', 'Connection test failed'),
      };
    }
  } catch (error) {
    reportError(error, text('连接测试失败', 'Connection test failed'));
  } finally {
    platformSmokeBusy.value = false;
  }
}

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
    const [nextStatus, nextNativeConfig, nextService, nextConfig, nextLogs] = await Promise.all([
      fetchChannelConnectorsStatus(),
      fetchChannelConnectorsNativeConfig(),
      fetchChannelConnectorsDaemonService(),
      fetchChannelConnectorsDaemonConfig(),
      fetchChannelConnectorsDaemonLogs(),
    ]);
    status.value = nextStatus;
    nativeConfig.value = nextNativeConfig;
    service.value = nextService;
    configPreview.value = nextConfig;
    logs.value = nextLogs;
    hydrateConfigDrafts();
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
