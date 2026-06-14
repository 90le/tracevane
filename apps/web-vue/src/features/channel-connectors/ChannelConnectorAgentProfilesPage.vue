<template>
  <section class="page-shell channel-connectors-profile-page ccx-agent-profile-page">
    <header class="page-header-row ccx-agent-profile-head">
      <div>
        <p class="eyebrow">Channel Connectors</p>
        <h2 class="page-title">{{ text('CLI Profile 管理', 'CLI Profile management') }}</h2>
        <p class="page-copy">{{ text('集中管理 Studio 原生 CLI Agent Bot 的 Profile、Gateway 模型、IM 绑定和持久会话；不依赖 OpenClaw Agent 管理。', 'Manage Studio-native CLI Agent Bot profiles, Gateway models, IM bindings, and persistent sessions without depending on OpenClaw Agent management.') }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button compact-button" @click="openChannelConnectors()">
          <ExternalLink :size="16" />
          {{ text('渠道连接', 'Channel Connectors') }}
        </button>
        <button type="button" class="secondary-button compact-button" :disabled="loading" @click="loadAll">
          <RefreshCw :size="16" />
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新', 'Refresh') }}
        </button>
        <button type="button" class="secondary-button compact-button" :disabled="saving || loading || !hasUnsavedProfileChanges" @click="discardProfileChanges">
          <RotateCcw :size="16" />
          {{ text('撤销', 'Discard') }}
        </button>
        <button
          type="button"
          class="primary-button compact-button"
          :disabled="saving || loading || !canSaveProfile"
          :title="saveProfileDisabledReason"
          @click="saveProfile"
        >
          <Save :size="16" />
          {{ saving ? text('保存中...', 'Saving...') : text('保存 Profile', 'Save profile') }}
        </button>
      </div>
    </header>

    <div v-if="noticeMessage" class="status-banner" :class="noticeTone === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage }}
    </div>
    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-if="loading && !loaded" class="empty-inline">{{ text('正在读取 Channel Connectors Profile 配置...', 'Loading Channel Connectors profile configuration...') }}</div>

    <template v-else>
      <section class="ccx-agent-profile-layout">
        <aside class="ccx-agent-profile-rail">
          <article class="ccx-panel ccx-agent-profile-list">
            <header class="ccx-panel-head">
              <div>
                <p class="eyebrow">Profiles</p>
                <h3>{{ text('CLI Profiles', 'CLI profiles') }}</h3>
              </div>
              <button type="button" class="secondary-button compact-button" @click="newProfile">
                <Plus :size="16" />
                {{ text('新建', 'New') }}
              </button>
            </header>

            <div v-if="profiles.length" class="ccx-list ccx-agent-profile-list__rows">
              <button
                v-for="profile in profiles"
                :key="profile.id"
                type="button"
                class="ccx-select-row ccx-agent-profile-select-row"
                :class="{ active: profile.id === selectedProfileId }"
                @click="selectProfile(profile)"
              >
                <small>{{ profile.agent }} · {{ profile.permissionMode }}</small>
                <strong>{{ profile.name || profile.id }}</strong>
                <span>{{ profileModelLabel(profile) }}</span>
                <span>{{ compactPath(profile.workDir) }}</span>
              </button>
            </div>
            <div v-else class="empty-inline">
              {{ text('还没有 CLI Profile。先创建一个 Studio Channel Profile。', 'No CLI profiles yet. Create a Studio Channel profile first.') }}
            </div>
          </article>

          <article class="ccx-panel ccx-agent-profile-binding-panel">
            <header class="ccx-panel-head">
              <div>
                <p class="eyebrow">IM Bindings</p>
                <h3>{{ text('渠道绑定', 'Channel bindings') }}</h3>
              </div>
              <button type="button" class="secondary-button compact-button" @click="openSelectedProfileConfig">
                <ExternalLink :size="16" />
                {{ text('完整配置', 'Full config') }}
              </button>
            </header>

            <div v-if="relatedBindings.length" class="ccx-list">
              <article v-for="binding in relatedBindings" :key="binding.id" class="ccx-list-row ccx-agent-profile-binding-row">
                <div class="ccx-agent-profile-binding-main">
                  <div>
                    <strong>{{ binding.displayName || binding.id }}</strong>
                    <p>{{ binding.platform }} · {{ binding.accountId }}{{ binding.botId ? ` / ${binding.botId}` : '' }}</p>
                  </div>
                  <button type="button" class="secondary-button compact-button" @click="openBindingConfig(binding)">
                    <ExternalLink :size="16" />
                    {{ text('配置', 'Config') }}
                  </button>
                </div>
                <div>
                  <span>{{ binding.enabled ? text('启用', 'Enabled') : text('停用', 'Disabled') }}</span>
                  <span>{{ bindingHealthLabel(binding.id) }}</span>
                  <span>{{ sessionDriverLabel(binding.id) }}</span>
                </div>
                <strong>{{ binding.agentProfileId }}</strong>
              </article>
            </div>
            <div v-else class="empty-inline">
              {{ text('当前 Profile 还没有 IM 绑定。', 'This profile has no IM binding yet.') }}
            </div>
          </article>
        </aside>

        <main class="ccx-agent-profile-main">
          <article class="ccx-panel ccx-agent-profile-editor">
            <header class="ccx-panel-head">
              <div>
                <p class="eyebrow">Run Profile</p>
                <h3>{{ text('运行配置', 'Runtime profile') }}</h3>
              </div>
              <div class="ccx-platform-actions ccx-agent-profile-editor-actions">
                <button type="button" class="secondary-button compact-button" :disabled="saving || !profileDraft.id" @click="duplicateProfile">
                  <Copy :size="16" />
                  {{ text('复制', 'Duplicate') }}
                </button>
                <button type="button" class="secondary-button compact-button" :disabled="saving || !profileDraft.id" @click="setDefaultProfile">
                  <Star :size="16" />
                  {{ text('设为默认', 'Set default') }}
                </button>
                <button
                  type="button"
                  class="secondary-button compact-button ccx-danger-button"
                  :disabled="saving || !canDeleteSelectedProfile"
                  :title="deleteProfileDisabledReason"
                  @click="deleteProfile"
                >
                  <Trash2 :size="16" />
                  {{ text('删除', 'Delete') }}
                </button>
              </div>
            </header>

            <dl class="ccx-facts ccx-agent-profile-facts">
              <div>
                <dt>{{ text('默认 Profile', 'Default profile') }}</dt>
                <dd>{{ nativeConfig?.config.defaultAgentProfileId || '-' }}</dd>
              </div>
              <div>
                <dt>{{ text('Gateway 模型', 'Gateway models') }}</dt>
                <dd>{{ modelOptionsCount }}</dd>
              </div>
              <div>
                <dt>{{ text('绑定', 'Bindings') }}</dt>
                <dd>{{ relatedBindings.length }}</dd>
              </div>
            </dl>

            <div
              v-if="hasUnsavedProfileChanges || profileIdConflict"
              class="ccx-agent-profile-edit-state"
              :class="{ warning: profileIdConflict }"
            >
              <strong>{{ profileIdConflict ? text('Profile ID 已存在', 'Profile ID already exists') : text('有未保存更改', 'Unsaved changes') }}</strong>
              <span>
                {{
                  profileIdConflict
                    ? text('换一个唯一 ID 后再保存。', 'Use a unique ID before saving.')
                    : profileIdChanged
                      ? text('保存后会迁移当前 Profile 的 IM 绑定。', 'Saving will migrate this Profile IM bindings.')
                      : text('保存或撤销当前编辑。', 'Save or discard the current edit.')
                }}
              </span>
            </div>

            <div class="ccx-agent-profile-editor-sections">
              <section class="ccx-agent-profile-config-section">
                <div class="ccx-agent-profile-config-section__head">
                  <h4>{{ text('身份与权限', 'Identity and permission') }}</h4>
                  <span>{{ text('决定这个 Profile 调用哪个 CLI Agent，以及默认执行权限。', 'Choose which CLI Agent this profile runs and its default permission mode.') }}</span>
                </div>
                <div class="ccx-profile-form-grid">
                  <div class="form-field">
                    <label class="form-label">Profile ID</label>
                    <input v-model.trim="profileDraft.id" class="form-input" autocomplete="off" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('名称', 'Name') }}</label>
                    <input v-model.trim="profileDraft.name" class="form-input" autocomplete="off" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">CLI Agent</label>
                    <StudioSelect v-model="profileDraft.agent" :options="agentOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('权限', 'Permission') }}</label>
                    <StudioSelect v-model="profileDraft.permissionMode" :options="permissionOptions" />
                  </div>
                </div>
              </section>

              <section class="ccx-agent-profile-config-section">
                <div class="ccx-agent-profile-config-section__head">
                  <h4>{{ text('模型与上下文', 'Model and context') }}</h4>
                  <span>{{ text('模型来自 Gateway；上下文预算用于判断 compact 阈值。', 'Models come from Gateway; context budget is used to reason about compact thresholds.') }}</span>
                </div>
                <div class="ccx-profile-form-grid">
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('模型', 'Model') }}</label>
                    <StudioSelect
                      v-model="profileDraft.model"
                      :options="modelOptions"
                      :placeholder="text('跟随默认模型', 'Inherit default model')"
                    />
                    <span class="field-hint">{{ text('模型列表来自 Studio Gateway 的可用模型目录。', 'The model list is read from the Studio Gateway catalog.') }}</span>
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('模型网关', 'Model Gateway') }}</label>
                    <button type="button" class="secondary-button compact-button ccx-icon-button ccx-field-button" @click="openModelGateway">
                      <ExternalLink :size="16" />
                      {{ text('打开配置', 'Open config') }}
                    </button>
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('推理强度', 'Reasoning effort') }}</label>
                    <StudioSelect v-model="reasoningEffortDraft" :options="reasoningOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('预算来源', 'Budget source') }}</label>
                    <input class="form-input" :value="selectedBudgetSourceLabel" readonly />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('CLI App 连接', 'CLI App connection') }}</label>
                    <div class="ccx-agent-profile-app-connection">
                      <div>
                        <strong>{{ selectedAppConnection?.label || profileDraft.agent }}</strong>
                        <span>{{ selectedAppConnectionState }}</span>
                      </div>
                      <p>{{ selectedAppConnectionDetail }}</p>
                      <dl class="ccx-agent-profile-app-facts">
                        <div>
                          <dt>{{ text('配置文件', 'Config file') }}</dt>
                          <dd>{{ selectedAppConnection?.target.path || '-' }}</dd>
                        </div>
                        <div>
                          <dt>{{ text('最近备份', 'Latest backup') }}</dt>
                          <dd>{{ selectedAppConnection?.lastBackupPath || '-' }}</dd>
                        </div>
                      </dl>
                      <button type="button" class="secondary-button compact-button ccx-icon-button ccx-field-button" @click="openModelGateway">
                        <ExternalLink :size="16" />
                        {{ text('App 连接', 'App connection') }}
                      </button>
                    </div>
                  </div>
                </div>
                <dl class="ccx-metric-strip ccx-agent-profile-budget-strip">
                  <div>
                    <dt>{{ text('上下文窗口', 'Context window') }}</dt>
                    <dd>{{ formatTokenBudget(resolvedContextWindow) }}</dd>
                    <span>{{ selectedEffectiveModel || '-' }}</span>
                  </div>
                  <div>
                    <dt>{{ text('输出预算', 'Output budget') }}</dt>
                    <dd>{{ formatTokenBudget(resolvedMaxOutputTokens) }}</dd>
                    <span>{{ text('用于保留响应空间', 'reserved for responses') }}</span>
                  </div>
                  <div>
                    <dt>{{ text('Auto compact', 'Auto compact') }}</dt>
                    <dd>{{ formatTokenBudget(resolvedAutoCompactTokenLimit) }}</dd>
                    <span>{{ compactRatioLabel }}</span>
                  </div>
                </dl>
              </section>

              <section class="ccx-agent-profile-config-section">
                <div class="ccx-agent-profile-config-section__head">
                  <h4>{{ text('目录与连接', 'Directory and connection') }}</h4>
                  <span>{{ text('工作目录影响 Agent 会话隔离；Gateway Endpoint 供 CLI 直连本地 daemon。', 'Work directory isolates Agent sessions; Gateway Endpoint lets CLIs connect to the local daemon.') }}</span>
                </div>
                <div class="ccx-profile-form-grid">
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('工作目录', 'Work directory') }}</label>
                    <input v-model.trim="profileDraft.workDir" class="form-input" autocomplete="off" />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">Gateway Endpoint</label>
                    <input v-model.trim="profileDraft.gatewayEndpoint" class="form-input" autocomplete="off" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">App Profile</label>
                    <StudioSelect v-model="profileDraft.appProfileRef" :options="appProfileOptions" />
                    <span class="field-hint">{{ text('当前 Gateway 只提供 default App Connection Profile；已有自定义值会保留为兼容选项。', 'Gateway currently exposes only the default App Connection Profile; existing custom values are kept as compatibility options.') }}</span>
                  </div>
                </div>
              </section>
            </div>
          </article>
        </main>

        <aside class="ccx-agent-profile-activity">
          <article class="ccx-panel ccx-agent-profile-session-panel">
            <header class="ccx-panel-head">
              <div>
                <p class="eyebrow">Sessions</p>
                <h3>{{ text('会话与记录', 'Sessions and records') }}</h3>
              </div>
              <div class="ccx-platform-actions">
                <button type="button" class="secondary-button compact-button" :disabled="sessionBusy" @click="refreshSessions">
                  <RefreshCw :size="16" />
                  {{ text('刷新', 'Refresh') }}
                </button>
                <button
                  type="button"
                  class="secondary-button compact-button ccx-danger-button"
                  :disabled="sessionBusy || !activeSessions.length"
                  @click="killActiveSessions"
                >
                  <Square :size="16" />
                  {{ text('停止全部', 'Stop all') }}
                </button>
              </div>
            </header>

            <dl class="ccx-metric-strip ccx-agent-profile-session-metrics">
              <div>
                <dt>{{ text('请求持久化', 'Requested') }}</dt>
                <dd>{{ requestedSessions.length }}</dd>
              </div>
              <div>
                <dt>{{ text('活动会话', 'Active') }}</dt>
                <dd>{{ activeSessions.length }}</dd>
              </div>
              <div>
                <dt>{{ text('事件', 'Events') }}</dt>
                <dd>{{ allRelatedSessionEvents.length }}</dd>
              </div>
              <div>
                <dt>{{ text('空闲超时', 'Idle timeout') }}</dt>
                <dd>{{ agentSessions ? formatDuration(agentSessions.policy.idleTimeoutMs) : '-' }}</dd>
              </div>
            </dl>

            <div class="ccx-agent-profile-session-toolbar">
              <label class="form-field">
                <span class="form-label">{{ text('事件筛选', 'Event filter') }}</span>
                <StudioSelect v-model="eventFilter" :options="eventFilterOptions" />
              </label>
              <span>{{ text(`当前显示 ${relatedSessionEvents.length} 条`, `Showing ${relatedSessionEvents.length} events`) }}</span>
            </div>

            <div v-if="requestedSessions.length" class="ccx-list ccx-agent-profile-requested-list">
              <article
                v-for="session in requestedSessions"
                :key="`${session.platform}:${session.bindingId}:${session.accountId}:${session.botId || ''}`"
                class="ccx-list-row ccx-agent-profile-session-row ccx-agent-profile-requested-row"
              >
                <div>
                  <small>{{ session.platform }} · {{ session.bindingId }}</small>
                  <strong>{{ session.agent }} · {{ session.effectiveMode }}</strong>
                  <p>{{ session.model || text('默认模型', 'default model') }}</p>
                </div>
                <div>
                  <span>{{ text('请求', 'Requested') }} {{ session.requestedMode }}</span>
                  <span>{{ text('生效', 'Effective') }} {{ session.effectiveMode }}</span>
                  <span>{{ session.reason }}</span>
                </div>
                <div class="ccx-agent-profile-row-actions">
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="openBindingConfigById(session.bindingId)"
                  >
                    <ExternalLink :size="15" />
                    {{ text('绑定', 'Binding') }}
                  </button>
                </div>
              </article>
            </div>

            <div v-if="activeSessions.length" class="ccx-list">
              <article v-for="session in activeSessions" :key="session.poolKey" class="ccx-list-row ccx-agent-profile-session-row">
                <div>
                  <strong>{{ session.model || text('默认模型', 'default model') }}</strong>
                  <p>{{ session.agent }} · {{ session.bindingId }} · {{ session.permissionMode || '-' }}</p>
                  <p>{{ compactPath(session.workDir) }}</p>
                  <dl class="ccx-agent-profile-session-trace">
                    <div>
                      <dt>Profile</dt>
                      <dd>{{ session.projectId || '-' }}</dd>
                    </div>
                    <div>
                      <dt>Session</dt>
                      <dd>{{ session.sessionKey || '-' }}</dd>
                    </div>
                    <div>
                      <dt>Pool</dt>
                      <dd>{{ session.poolKey || '-' }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('轮次 / 空闲', 'Turns / idle') }}</dt>
                      <dd>{{ session.turnCount }} · {{ formatDuration(session.idleMs) }}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <span>{{ text('运行中', 'running') }} {{ session.running }}</span>
                  <span>{{ text('最近使用', 'Last used') }} {{ formatTimestamp(session.lastUsedAt) }}</span>
                  <span v-if="session.lastError" class="ccx-danger-text">{{ session.lastError }}</span>
                </div>
                <div class="ccx-agent-profile-row-actions">
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="openBindingConfigById(session.bindingId)"
                  >
                    <ExternalLink :size="15" />
                    {{ text('绑定', 'Binding') }}
                  </button>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    :disabled="sessionBusy"
                    @click="killSession(session.poolKey)"
                  >
                    <Square :size="15" />
                    {{ text('停止', 'Stop') }}
                  </button>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">
              {{ text('当前 Profile 没有活动持久会话。', 'No active persistent session for this profile.') }}
            </div>

            <div v-if="relatedSessionEvents.length" class="ccx-event-list ccx-agent-profile-events">
              <article
                v-for="event in relatedSessionEvents"
                :key="`${event.checkedAt}:${event.type}:${event.poolKey}:${event.messageId || ''}`"
                class="ccx-list-row ccx-agent-profile-event-row"
                :class="{ danger: Boolean(event.error) }"
              >
                <div class="ccx-agent-profile-linked-row">
                  <div>
                    <small>{{ formatTimestamp(event.checkedAt) }} · {{ event.bindingId }}</small>
                    <strong>{{ event.type }}</strong>
                    <dl class="ccx-agent-profile-event-trace">
                      <div>
                        <dt>Agent</dt>
                        <dd>{{ event.agent }} · {{ event.model || text('默认模型', 'default model') }}</dd>
                      </div>
                      <div>
                        <dt>Session</dt>
                        <dd>{{ event.sessionKey || '-' }}</dd>
                      </div>
                      <div>
                        <dt>Message</dt>
                        <dd>{{ event.messageId || '-' }}</dd>
                      </div>
                      <div>
                        <dt>Workdir</dt>
                        <dd>{{ compactPath(event.workDir) }}</dd>
                      </div>
                    </dl>
                    <span v-if="event.reason || event.error" :class="{ 'ccx-danger-text': Boolean(event.error) }">
                      {{ [event.reason, event.error].filter(Boolean).join(' · ') }}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="openBindingConfigById(event.bindingId)"
                  >
                    <ExternalLink :size="15" />
                    {{ text('绑定', 'Binding') }}
                  </button>
                </div>
              </article>
            </div>
          </article>
        </aside>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import './channel-connectors-workspace.css';
import { computed, onActivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Copy, ExternalLink, Plus, RefreshCw, RotateCcw, Save, Square, Star, Trash2 } from '@lucide/vue';
import type {
  ChannelConnectorAgentId,
  ChannelConnectorAgentProfile,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorPermissionMode,
  ChannelConnectorPlatformBinding,
  ChannelConnectorsNativeConfig,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import type {
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionId,
  ModelGatewayAppConnectionProfile,
  ModelGatewayProviderModel,
  ModelGatewayProviderView,
} from '../../../../../types/model-gateway';
import StudioSelect from '../../shared/components/StudioSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchChannelConnectorAgentSessions,
  fetchChannelConnectorsNativeConfig,
  fetchChannelConnectorsStatus,
  manageChannelConnectorAgentSessions,
  saveChannelConnectorsNativeConfig,
} from './api';
import { fetchModelGatewayAppConnections, fetchModelGatewayProviders } from '../model-gateway/api';

defineOptions({ name: 'ChannelConnectorAgentProfilesPage' });

type NoticeTone = 'success' | 'error';
type GatewayModelBudget = {
  id: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  source: string;
};

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const routeProfileId = computed(() => {
  const value = route.query.profileId;
  return typeof value === 'string' ? value : '';
});
const nativeConfig = ref<ChannelConnectorsNativeConfigResponse | null>(null);
const status = ref<ChannelConnectorsStatusResponse | null>(null);
const agentSessions = ref<ChannelConnectorAgentSessionDriverStatusResponse | null>(null);
const appConnectionProfile = ref<ModelGatewayAppConnectionProfile | null>(null);
const appConnections = ref<ModelGatewayAppConnection[]>([]);
const gatewayModels = ref<string[]>([]);
const gatewayModelBudgetIndex = ref<Record<string, GatewayModelBudget>>({});
const selectedProfileId = ref('');
const reasoningEffortDraft = ref('');
const eventFilter = ref('all');
const loading = ref(false);
const loaded = ref(false);
const saving = ref(false);
const sessionBusy = ref(false);
const errorMessage = ref('');
const noticeMessage = ref('');
const noticeTone = ref<NoticeTone>('success');

const profileDraft = reactive<ChannelConnectorAgentProfile>({
  id: '',
  name: '',
  agent: 'codex',
  model: null,
  workDir: '',
  permissionMode: 'suggest',
  gatewayEndpoint: 'http://127.0.0.1:18796/v1',
  gatewayKeyRef: 'studio-gateway-client-key',
  appProfileRef: 'default',
});

const profiles = computed(() => nativeConfig.value?.config.agentProfiles || []);
const bindings = computed(() => nativeConfig.value?.config.platformBindings || []);
const modelOptionsCount = computed(() => Math.max(0, modelOptions.value.length - 1));
const selectedProfileFromConfig = computed(() =>
  profiles.value.find((profile) => profile.id === selectedProfileId.value) || null,
);

const agentOptions = computed(() => {
  const agents = nativeConfig.value?.supportedAgents || (['codex', 'claude-code', 'opencode'] as ChannelConnectorAgentId[]);
  return agents.map((agent) => ({ value: agent, label: agent }));
});

const permissionOptions = computed(() => {
  const modes = nativeConfig.value?.permissionModes || (['suggest', 'read-only', 'auto-edit', 'full-auto', 'plan', 'yolo'] as ChannelConnectorPermissionMode[]);
  return modes.map((mode) => ({ value: mode, label: mode }));
});

const reasoningOptions = computed(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'xhigh', label: 'xhigh' },
]);

const appProfileOptions = computed(() => {
  const options = [{ value: 'default', label: text('default · Gateway App Connections', 'default · Gateway App Connections') }];
  const current = profileDraft.appProfileRef.trim();
  if (current && current !== 'default') options.push({ value: current, label: text(`${current} · 保留值`, `${current} · existing value`) });
  return options;
});

const modelOptions = computed(() => {
  const models = new Set<string>();
  for (const model of gatewayModels.value) {
    const normalized = String(model || '').trim();
    if (normalized) models.add(normalized);
  }
  if (profileDraft.model) models.add(profileDraft.model);
  return [
    { value: '', label: text('跟随默认模型', 'Inherit default model') },
    ...Array.from(models).sort().map((model) => ({ value: model, label: model })),
  ];
});

const selectedAppConnectionId = computed<ModelGatewayAppConnectionId | null>(() =>
  modelGatewayAppConnectionIdForAgent(profileDraft.agent),
);

const selectedAppConnection = computed(() => {
  const appId = selectedAppConnectionId.value;
  if (!appId) return null;
  return appConnections.value.find((connection) => connection.id === appId) || null;
});

const selectedAppConnectionModel = computed(() => {
  const appId = selectedAppConnectionId.value;
  if (!appId) return '';
  return String(appConnectionProfile.value?.appModels?.[appId] || selectedAppConnection.value?.model || '').trim();
});

const selectedEffectiveModel = computed(() => {
  return String(profileDraft.model || selectedAppConnectionModel.value || appConnectionProfile.value?.model || '').trim();
});

const selectedModelBudget = computed(() => findGatewayModelBudget(selectedEffectiveModel.value));

const resolvedContextWindow = computed(() => {
  return selectedModelBudget.value?.contextWindow
    || positiveNumberOrNull(appConnectionProfile.value?.contextWindow)
    || null;
});

const resolvedMaxOutputTokens = computed(() => {
  return selectedModelBudget.value?.maxOutputTokens
    || positiveNumberOrNull(appConnectionProfile.value?.maxOutputTokens)
    || null;
});

const resolvedAutoCompactTokenLimit = computed(() => {
  return positiveNumberOrNull(appConnectionProfile.value?.autoCompactTokenLimit)
    || deriveAutoCompactTokenLimit(resolvedContextWindow.value, resolvedMaxOutputTokens.value);
});

const selectedBudgetSourceLabel = computed(() => {
  if (selectedModelBudget.value?.source) return selectedModelBudget.value.source;
  if (appConnectionProfile.value?.contextWindow || appConnectionProfile.value?.maxOutputTokens) {
    return text('App Connections Profile', 'App Connections profile');
  }
  return text('未识别', 'Unknown');
});

const compactRatioLabel = computed(() => {
  const context = resolvedContextWindow.value;
  const limit = resolvedAutoCompactTokenLimit.value;
  if (!context || !limit) return text('等待 Gateway 预算', 'waiting for Gateway budget');
  return `${Math.round((limit / context) * 100)}%`;
});

const selectedAppConnectionState = computed(() => {
  const connection = selectedAppConnection.value;
  if (!connection) return text('未找到 Gateway app connection', 'Gateway app connection not found');
  if (connection.configured) return text('已应用配置', 'Applied');
  if (connection.canApply) return text('可应用', 'Ready to apply');
  return text('需要先完善 Gateway 配置', 'Gateway configuration required');
});

const selectedAppConnectionDetail = computed(() => {
  const connection = selectedAppConnection.value;
  const model = selectedEffectiveModel.value || text('默认模型', 'default model');
  if (!connection) return text(`模型 ${model}`, `Model ${model}`);
  return `${connection.protocol} · ${connection.endpoint} · ${model}`;
});

const selectedProfileLookupIds = computed(() => {
  const ids = new Set<string>();
  const selectedId = selectedProfileId.value.trim();
  const draftId = profileDraft.id.trim();
  if (selectedId) ids.add(selectedId);
  if (draftId) ids.add(draftId);
  return ids;
});

const relatedBindings = computed(() => {
  const profileIds = selectedProfileLookupIds.value;
  return bindings.value.filter((binding) => profileIds.has(binding.agentProfileId));
});

const relatedBindingIds = computed(() => new Set(relatedBindings.value.map((binding) => binding.id)));

const activeSessions = computed(() => {
  const bindingIds = relatedBindingIds.value;
  const profileIds = selectedProfileLookupIds.value;
  return (agentSessions.value?.activeSessions || []).filter((session) =>
    profileIds.has(session.projectId)
    || bindingIds.has(session.bindingId)
    || Boolean(profileDraft.workDir && session.workDir === profileDraft.workDir),
  );
});

const requestedSessions = computed(() => {
  const bindingIds = relatedBindingIds.value;
  const profileIds = selectedProfileLookupIds.value;
  return (agentSessions.value?.requestedPersistentBindings || []).filter((session) =>
    profileIds.has(session.projectId)
    || bindingIds.has(session.bindingId)
    || Boolean(profileDraft.workDir && session.workDir === profileDraft.workDir),
  );
});

const allRelatedSessionEvents = computed(() => {
  const bindingIds = relatedBindingIds.value;
  const profileIds = selectedProfileLookupIds.value;
  return (agentSessions.value?.recentEvents || []).filter((event) =>
    profileIds.has(event.projectId)
    || bindingIds.has(event.bindingId)
    || Boolean(profileDraft.workDir && event.workDir === profileDraft.workDir),
  );
});

const eventFilterOptions = computed(() => {
  const types = Array.from(new Set(allRelatedSessionEvents.value.map((event) => event.type))).sort();
  return [
    { value: 'all', label: text('全部事件', 'All events') },
    { value: 'failures', label: text('失败事件', 'Failures') },
    ...types.map((type) => ({ value: type, label: type })),
  ];
});

const relatedSessionEvents = computed(() => {
  const filtered = allRelatedSessionEvents.value.filter((event) => {
    if (eventFilter.value === 'all') return true;
    if (eventFilter.value === 'failures') return Boolean(event.error) || event.type === 'turn.failed';
    return event.type === eventFilter.value;
  });
  return filtered.slice(0, 8);
});

const canDeleteSelectedProfile = computed(() =>
  Boolean(profileDraft.id)
  && !hasUnsavedProfileChanges.value
  && profiles.value.length > 1
  && relatedBindings.value.length === 0
  && activeSessions.value.length === 0,
);

const deleteProfileDisabledReason = computed(() => {
  if (!profileDraft.id) return text('先选择 Profile', 'Select a profile first');
  if (hasUnsavedProfileChanges.value) return text('先保存或撤销当前编辑', 'Save or discard the current edit first');
  if (profiles.value.length <= 1) return text('至少保留一个 Profile', 'Keep at least one profile');
  if (relatedBindings.value.length > 0) return text('先迁移或删除 IM 绑定', 'Move or delete IM bindings first');
  if (activeSessions.value.length > 0) return text('先停止活动会话', 'Stop active sessions first');
  return '';
});

const profileIdConflict = computed(() => {
  const id = profileDraft.id.trim();
  if (!id) return false;
  return profiles.value.some((profile) => profile.id === id && profile.id !== selectedProfileId.value);
});

const profileIdChanged = computed(() =>
  Boolean(selectedProfileFromConfig.value && profileDraft.id.trim() && profileDraft.id.trim() !== selectedProfileId.value),
);

const hasUnsavedProfileChanges = computed(() => {
  const original = selectedProfileFromConfig.value;
  const draft = normalizeProfileForCompare(profileFromDraft());
  if (!original) {
    return Boolean(draft.id || draft.name || draft.model || draft.workDir);
  }
  return JSON.stringify(normalizeProfileForCompare(original)) !== JSON.stringify(draft);
});

const canSaveProfile = computed(() =>
  Boolean(profileDraft.id.trim() && profileDraft.workDir.trim())
  && !profileIdConflict.value,
);

const saveProfileDisabledReason = computed(() => {
  if (!profileDraft.id.trim()) return text('Profile ID 必填', 'Profile ID is required');
  if (!profileDraft.workDir.trim()) return text('工作目录必填', 'Work directory is required');
  if (profileIdConflict.value) return text('Profile ID 已存在', 'Profile ID already exists');
  return '';
});

function setNotice(message: string, tone: NoticeTone = 'success'): void {
  noticeMessage.value = message;
  noticeTone.value = tone;
}

function compactPath(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw.replace(/^\/home\/[^/]+/, '~');
}

function formatTimestamp(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDuration(valueMs: number): string {
  if (!Number.isFinite(valueMs) || valueMs < 0) return '-';
  if (valueMs < 1000) return `${Math.round(valueMs)} ms`;
  const seconds = Math.round(valueMs / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function bindingHealthLabel(bindingId: string): string {
  for (const connection of status.value?.runtime.feishuConnectionDetails || []) {
    if (!connection.bindingIds.includes(bindingId)) continue;
    if (connection.connected && !connection.transportStale && !connection.pongOverdue) {
      return text('飞书在线', 'Feishu online');
    }
    return text('飞书异常', 'Feishu unhealthy');
  }
  return text('未连接状态', 'No connection status');
}

function sessionDriverLabel(bindingId: string): string {
  const status = agentSessions.value?.bindings.find((item) => item.bindingId === bindingId);
  if (!status) return text('会话模式未知', 'Session mode unknown');
  const mode = status.requestedMode === status.effectiveMode
    ? status.effectiveMode
    : `${status.requestedMode} -> ${status.effectiveMode}`;
  return `${mode} · ${status.reason}`;
}

function effectiveModelForProfile(profile: ChannelConnectorAgentProfile): string {
  const explicit = String(profile.model || '').trim();
  if (explicit) return explicit;
  const appId = modelGatewayAppConnectionIdForAgent(profile.agent);
  const appModel = appId ? String(appConnectionProfile.value?.appModels?.[appId] || '').trim() : '';
  return appModel || String(appConnectionProfile.value?.model || '').trim();
}

function profileModelLabel(profile: ChannelConnectorAgentProfile): string {
  const model = effectiveModelForProfile(profile);
  if (!model) return text('默认模型', 'default model');
  return profile.model
    ? model
    : text(`继承 ${model}`, `inherits ${model}`);
}

function addModelOption(target: Set<string>, value: unknown): void {
  const normalized = String(value || '').trim();
  if (normalized) target.add(normalized);
}

function positiveNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function mergeBudgetMinimum(current: number | null, next: number | null | undefined): number | null {
  const normalized = positiveNumberOrNull(next);
  if (!normalized) return current || null;
  if (!current) return normalized;
  return Math.min(current, normalized);
}

function normalizeBudgetLookup(value: string): string {
  return value.trim().toLowerCase();
}

function modelGatewayAppConnectionIdForAgent(agent: ChannelConnectorAgentId): ModelGatewayAppConnectionId | null {
  if (agent === 'codex' || agent === 'claude-code' || agent === 'opencode') return agent;
  return null;
}

function findGatewayModelBudget(modelId: string): GatewayModelBudget | null {
  const normalized = normalizeBudgetLookup(modelId);
  if (!normalized) return null;
  return gatewayModelBudgetIndex.value[normalized] || null;
}

function deriveAutoCompactTokenLimit(contextWindow: number | null, maxOutputTokens: number | null): number | null {
  if (!contextWindow) return null;
  const defaultOutputReserve = 8192;
  const outputReserve = Math.min(
    Math.max(maxOutputTokens || defaultOutputReserve, defaultOutputReserve),
    Math.floor(contextWindow * 0.5),
  );
  const usableInputWindow = Math.max(1024, contextWindow - outputReserve);
  return Math.max(1024, Math.floor(usableInputWindow * 0.85));
}

function formatTokenBudget(value: number | null): string {
  if (!value) return '-';
  if (value >= 1_000_000) {
    const rounded = value % 1_000_000 === 0 ? String(value / 1_000_000) : (value / 1_000_000).toFixed(1);
    return `${rounded}M`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

function normalizeProfileForCompare(profile: ChannelConnectorAgentProfile): ChannelConnectorAgentProfile {
  const id = profile.id.trim();
  return {
    ...profile,
    id,
    name: profile.name.trim() || id,
    model: profile.model ? profile.model.trim() : null,
    reasoningEffort: profile.reasoningEffort || null,
    workDir: profile.workDir.trim(),
    gatewayEndpoint: profile.gatewayEndpoint.trim() || 'http://127.0.0.1:18796/v1',
    gatewayKeyRef: 'studio-gateway-client-key',
    appProfileRef: profile.appProfileRef.trim() || 'default',
  };
}

function collectGatewayProviderModelNames(providers: ModelGatewayProviderView[]): { models: string[]; budgets: Record<string, GatewayModelBudget> } {
  const names = new Set<string>();
  const budgets: Record<string, GatewayModelBudget> = {};
  const lookupTarget = new Map<string, GatewayModelBudget>();

  const upsertBudget = (name: string, model: ModelGatewayProviderModel, source: string): GatewayModelBudget | null => {
    const normalized = String(name || '').trim();
    if (!normalized) return null;
    const lookup = normalizeBudgetLookup(normalized);
    const existing = budgets[lookup] || {
      id: normalized,
      contextWindow: null,
      maxOutputTokens: null,
      source,
    };
    existing.contextWindow = mergeBudgetMinimum(existing.contextWindow, model.contextWindow);
    existing.maxOutputTokens = mergeBudgetMinimum(existing.maxOutputTokens, model.maxOutputTokens);
    existing.source = existing.source || source;
    budgets[lookup] = existing;
    return existing;
  };

  const collectCatalog = (catalog: ModelGatewayProviderView['models'] | null | undefined) => {
    if (!catalog) return;
    addModelOption(names, catalog.defaultModel);
    for (const model of catalog.models || []) {
      addModelOption(names, model.id);
      const source = model.label || model.id;
      const modelBudget = upsertBudget(model.id, model, source);
      if (modelBudget) lookupTarget.set(normalizeBudgetLookup(model.id), modelBudget);
      for (const alias of model.aliases || []) {
        addModelOption(names, alias);
        const aliasBudget = upsertBudget(alias, model, source);
        if (aliasBudget) lookupTarget.set(normalizeBudgetLookup(alias), aliasBudget);
      }
    }
    for (const [alias, target] of Object.entries(catalog.aliases || {})) {
      addModelOption(names, alias);
      addModelOption(names, target);
      const targetBudget = lookupTarget.get(normalizeBudgetLookup(target));
      if (targetBudget) budgets[normalizeBudgetLookup(alias)] = { ...targetBudget, id: alias };
    }
  };
  for (const provider of providers) {
    if (!provider.enabled) continue;
    collectCatalog(provider.models);
    for (const endpointProfile of provider.endpointProfiles || []) {
      if (endpointProfile.enabled) collectCatalog(endpointProfile.models);
    }
  }
  return { models: Array.from(names), budgets };
}

function cloneNativeConfig(): ChannelConnectorsNativeConfig | null {
  const config = nativeConfig.value?.config;
  if (!config) return null;
  return {
    ...config,
    agentProfiles: config.agentProfiles.map((profile) => ({ ...profile })),
    platformBindings: config.platformBindings.map((binding) => ({
      ...binding,
      allowlist: [...binding.allowlist],
      adminUsers: [...binding.adminUsers],
      disabledCommands: [...(binding.disabledCommands || [])],
      ...(binding.metadata ? { metadata: { ...binding.metadata } } : {}),
    })),
  };
}

function profileFromDraft(): ChannelConnectorAgentProfile {
  return {
    ...profileDraft,
    id: profileDraft.id.trim(),
    name: profileDraft.name.trim() || profileDraft.id.trim(),
    model: profileDraft.model ? profileDraft.model.trim() : null,
    workDir: profileDraft.workDir.trim(),
    gatewayEndpoint: profileDraft.gatewayEndpoint.trim() || 'http://127.0.0.1:18796/v1',
    gatewayKeyRef: 'studio-gateway-client-key',
    appProfileRef: profileDraft.appProfileRef.trim() || 'default',
    reasoningEffort: reasoningEffortDraft.value ? reasoningEffortDraft.value as ChannelConnectorAgentProfile['reasoningEffort'] : null,
  };
}

function selectProfile(profile: ChannelConnectorAgentProfile): void {
  selectedProfileId.value = profile.id;
  profileDraft.id = profile.id;
  profileDraft.name = profile.name || profile.id;
  profileDraft.agent = profile.agent;
  profileDraft.model = profile.model || '';
  profileDraft.workDir = profile.workDir || '';
  profileDraft.permissionMode = profile.permissionMode || 'suggest';
  profileDraft.gatewayEndpoint = profile.gatewayEndpoint || 'http://127.0.0.1:18796/v1';
  profileDraft.gatewayKeyRef = 'studio-gateway-client-key';
  profileDraft.appProfileRef = profile.appProfileRef || 'default';
  reasoningEffortDraft.value = profile.reasoningEffort || '';
  eventFilter.value = 'all';
}

function bestProfileForRoute(): ChannelConnectorAgentProfile | null {
  const items = profiles.value;
  if (!items.length) return null;
  const requestedId = routeProfileId.value;
  const defaultId = nativeConfig.value?.config.defaultAgentProfileId || '';
  return items.find((profile) => profile.id === requestedId)
    || items.find((profile) => profile.id === defaultId)
    || items[0];
}

function selectInitialProfile(): void {
  const existing = profiles.value.find((profile) => profile.id === selectedProfileId.value);
  if (existing) {
    selectProfile(existing);
    return;
  }
  const best = bestProfileForRoute();
  if (best) selectProfile(best);
  else newProfile();
}

function newProfile(): void {
  const base = profiles.value[0] || null;
  const existing = new Set(profiles.value.map((profile) => profile.id));
  let id = 'cli-profile';
  let suffix = 2;
  while (existing.has(id)) {
    id = `cli-profile-${suffix}`;
    suffix += 1;
  }
  selectProfile({
    id,
    name: `CLI Profile ${suffix === 2 ? 1 : suffix - 1}`,
    agent: base?.agent || 'codex',
    model: '',
    workDir: base?.workDir || '',
    permissionMode: base?.permissionMode || 'suggest',
    gatewayEndpoint: base?.gatewayEndpoint || 'http://127.0.0.1:18796/v1',
    gatewayKeyRef: 'studio-gateway-client-key',
    appProfileRef: base?.appProfileRef || 'default',
  });
}

function discardProfileChanges(): void {
  const original = selectedProfileFromConfig.value;
  if (original) {
    selectProfile(original);
    setNotice(text('已撤销当前 Profile 编辑。', 'Profile edits discarded.'));
    return;
  }
  selectInitialProfile();
  setNotice(text('已撤销新建 Profile。', 'New Profile draft discarded.'));
}

function uniqueProfileId(baseId: string, existingIds = new Set(profiles.value.map((profile) => profile.id))): string {
  const normalizedBase = baseId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'cli-profile';
  let nextId = normalizedBase;
  let suffix = 2;
  while (existingIds.has(nextId)) {
    nextId = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }
  return nextId;
}

async function duplicateProfile(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  const source = profileFromDraft();
  if (!source.id || !source.workDir) {
    setNotice(text('复制前需要有效的 Profile ID 和工作目录。', 'A valid Profile ID and work directory are required before duplicating.'), 'error');
    return;
  }
  const existingIds = new Set(config.agentProfiles.map((profile) => profile.id));
  const nextId = uniqueProfileId(`${source.id}-copy`, existingIds);
  const nextProfile: ChannelConnectorAgentProfile = {
    ...source,
    id: nextId,
    name: `${source.name || source.id} Copy`,
  };
  saving.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    config.agentProfiles.push(nextProfile);
    nativeConfig.value = await saveChannelConnectorsNativeConfig({ config });
    selectProfile(nextProfile);
    setNotice(text('CLI Profile 副本已创建。', 'CLI profile duplicate created.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('复制 CLI Profile 失败。', 'Failed to duplicate CLI profile.');
  } finally {
    saving.value = false;
  }
}

async function deleteProfile(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  if (!canDeleteSelectedProfile.value) {
    setNotice(deleteProfileDisabledReason.value || text('当前 Profile 暂不能删除。', 'This profile cannot be deleted yet.'), 'error');
    return;
  }
  const profileId = selectedProfileId.value || profileDraft.id;
  const confirmed = window.confirm(text(`删除 CLI Profile "${profileId}"？`, `Delete CLI profile "${profileId}"?`));
  if (!confirmed) return;
  saving.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    config.agentProfiles = config.agentProfiles.filter((profile) => profile.id !== profileId);
    if (config.defaultAgentProfileId === profileId || !config.agentProfiles.some((profile) => profile.id === config.defaultAgentProfileId)) {
      config.defaultAgentProfileId = config.agentProfiles[0]?.id || '';
    }
    nativeConfig.value = await saveChannelConnectorsNativeConfig({ config });
    const nextProfile = config.agentProfiles.find((profile) => profile.id === config.defaultAgentProfileId) || config.agentProfiles[0];
    if (nextProfile) selectProfile(nextProfile);
    else newProfile();
    setNotice(text('CLI Profile 已删除。', 'CLI profile deleted.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('删除 CLI Profile 失败。', 'Failed to delete CLI profile.');
  } finally {
    saving.value = false;
  }
}

async function saveProfile(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  const profile = profileFromDraft();
  if (!canSaveProfile.value) {
    setNotice(saveProfileDisabledReason.value || text('Profile 配置不可保存。', 'Profile configuration cannot be saved.'), 'error');
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const migratedBindings = persistProfileDraftToConfig(config, profile, false);
    nativeConfig.value = await saveChannelConnectorsNativeConfig({ config });
    selectProfile(profile);
    setNotice(migratedBindings > 0
      ? text(`CLI Profile 已保存，并迁移 ${migratedBindings} 个 IM 绑定。`, `CLI profile saved and ${migratedBindings} IM bindings migrated.`)
      : text('CLI Profile 已保存。', 'CLI profile saved.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('保存 CLI Profile 失败。', 'Failed to save CLI profile.');
  } finally {
    saving.value = false;
  }
}

async function setDefaultProfile(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  const profile = profileFromDraft();
  if (!canSaveProfile.value) {
    setNotice(saveProfileDisabledReason.value || text('Profile 配置不可保存。', 'Profile configuration cannot be saved.'), 'error');
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const migratedBindings = persistProfileDraftToConfig(config, profile, true);
    nativeConfig.value = await saveChannelConnectorsNativeConfig({ config });
    selectProfile(profile);
    setNotice(migratedBindings > 0
      ? text(`默认 CLI Profile 已更新，并迁移 ${migratedBindings} 个 IM 绑定。`, `Default CLI profile updated and ${migratedBindings} IM bindings migrated.`)
      : text('默认 CLI Profile 已更新。', 'Default CLI profile updated.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('更新默认 CLI Profile 失败。', 'Failed to update default CLI profile.');
  } finally {
    saving.value = false;
  }
}

function persistProfileDraftToConfig(config: ChannelConnectorsNativeConfig, profile: ChannelConnectorAgentProfile, makeDefault: boolean): number {
  const previousProfileId = selectedProfileId.value;
  const previousIndex = previousProfileId
    ? config.agentProfiles.findIndex((item) => item.id === previousProfileId)
    : -1;
  const currentIndex = config.agentProfiles.findIndex((item) => item.id === profile.id);
  if (previousIndex >= 0) {
    config.agentProfiles.splice(previousIndex, 1, profile);
  } else if (currentIndex >= 0) {
    config.agentProfiles.splice(currentIndex, 1, profile);
  } else {
    config.agentProfiles.push(profile);
  }

  let migratedBindings = 0;
  if (previousProfileId && previousProfileId !== profile.id) {
    for (const binding of config.platformBindings) {
      if (binding.agentProfileId !== previousProfileId) continue;
      binding.agentProfileId = profile.id;
      migratedBindings += 1;
    }
    if (config.defaultAgentProfileId === previousProfileId) {
      config.defaultAgentProfileId = profile.id;
    }
  }

  if (makeDefault || !config.defaultAgentProfileId || !config.agentProfiles.some((item) => item.id === config.defaultAgentProfileId)) {
    config.defaultAgentProfileId = profile.id;
  }
  return migratedBindings;
}

async function refreshSessions(): Promise<void> {
  sessionBusy.value = true;
  errorMessage.value = '';
  try {
    agentSessions.value = await fetchChannelConnectorAgentSessions();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('刷新 CLI 会话失败。', 'Failed to refresh CLI sessions.');
  } finally {
    sessionBusy.value = false;
  }
}

async function killSession(poolKey: string): Promise<void> {
  sessionBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    agentSessions.value = await manageChannelConnectorAgentSessions({
      action: 'kill',
      poolKey,
      reason: 'channel-connectors-profile-stop',
    });
    setNotice(text('已请求停止 CLI 会话。', 'CLI session stop requested.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('停止 CLI 会话失败。', 'Failed to stop CLI session.');
  } finally {
    sessionBusy.value = false;
  }
}

async function killActiveSessions(): Promise<void> {
  const sessions = [...activeSessions.value];
  if (!sessions.length) {
    setNotice(text('当前 Profile 没有活动会话。', 'This profile has no active sessions.'), 'error');
    return;
  }
  sessionBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    let latestStatus: ChannelConnectorAgentSessionDriverStatusResponse | null = null;
    for (const session of sessions) {
      latestStatus = await manageChannelConnectorAgentSessions({
        action: 'kill',
        poolKey: session.poolKey,
        reason: 'channel-connectors-profile-stop-all',
      });
    }
    agentSessions.value = latestStatus || await fetchChannelConnectorAgentSessions();
    setNotice(text(`已请求停止 ${sessions.length} 个 CLI 会话。`, `${sessions.length} CLI sessions stop requested.`));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('批量停止 CLI 会话失败。', 'Failed to stop CLI sessions.');
  } finally {
    sessionBusy.value = false;
  }
}

function openChannelConnectors(query: Record<string, string> = {}): void {
  void router.push({ path: '/channel-connectors', query });
}

function openSelectedProfileConfig(): void {
  const profileId = selectedProfileId.value || profileDraft.id;
  openChannelConnectors(profileId ? { profileId } : {});
}

function openBindingConfig(binding: ChannelConnectorPlatformBinding): void {
  openChannelConnectors({
    bindingId: binding.id,
    profileId: binding.agentProfileId || selectedProfileId.value || profileDraft.id,
  });
}

function openBindingConfigById(bindingId: string): void {
  const normalized = String(bindingId || '').trim();
  if (!normalized) return;
  const binding = bindings.value.find((item) => item.id === normalized);
  openChannelConnectors({
    bindingId: normalized,
    profileId: binding?.agentProfileId || selectedProfileId.value || profileDraft.id,
  });
}

function openModelGateway(): void {
  const appId = selectedAppConnectionId.value;
  void router.push({
    path: '/model-gateway',
    query: appId ? { tab: 'connections', app: appId } : { tab: 'connections' },
  });
}

async function loadAll(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const [nextNativeConfig, nextStatus, nextSessions] = await Promise.all([
      fetchChannelConnectorsNativeConfig(),
      fetchChannelConnectorsStatus(),
      fetchChannelConnectorAgentSessions(),
    ]);
    let gatewayModelCatalog: string[] = [];
    let gatewayBudgetCatalog: Record<string, GatewayModelBudget> = {};
    try {
      const [appConnectionsResponse, providers] = await Promise.all([
        fetchModelGatewayAppConnections(),
        fetchModelGatewayProviders(),
      ]);
      const providerCatalog = collectGatewayProviderModelNames(providers.providers || []);
      gatewayModelCatalog = [
        ...(appConnectionsResponse.availableModels || []),
        ...providerCatalog.models,
      ];
      gatewayBudgetCatalog = providerCatalog.budgets;
      appConnectionProfile.value = appConnectionsResponse.profile;
      appConnections.value = appConnectionsResponse.connections || [];
    } catch {
      setNotice(text('Gateway 模型目录暂不可用，模型下拉只保留当前 Profile 值。', 'Gateway model catalog is unavailable; the model picker only keeps the current profile value.'), 'error');
      appConnectionProfile.value = null;
      appConnections.value = [];
    }
    nativeConfig.value = nextNativeConfig;
    status.value = nextStatus;
    agentSessions.value = nextSessions;
    gatewayModelBudgetIndex.value = gatewayBudgetCatalog;
    gatewayModels.value = Array.from(new Set(gatewayModelCatalog.map((model) => String(model || '').trim()).filter(Boolean)));
    selectInitialProfile();
    loaded.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('读取 Channel Connectors Profile 配置失败。', 'Failed to load Channel Connectors profile configuration.');
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.query.profileId,
  async () => {
    loaded.value = false;
    selectedProfileId.value = '';
    await loadAll();
  },
  { immediate: true },
);

onActivated(async () => {
  if (loading.value || saving.value) return;
  await loadAll();
});
</script>
