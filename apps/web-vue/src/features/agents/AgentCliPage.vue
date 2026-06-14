<template>
  <section v-if="agentId" class="agents-stage-view agents-cli-page">
    <div class="agents-stage-task-head operate-stage-task-head">
      <div>
        <p class="eyebrow">{{ agentId }}</p>
        <h3>{{ text('CLI Agent', 'CLI Agent') }}</h3>
        <p>{{ text('集中管理 Codex、Claude Code、OpenCode 的运行 Profile、Gateway 模型、IM 绑定和持久会话。', 'Manage Codex, Claude Code, and OpenCode runtime profiles, Gateway models, IM bindings, and persistent sessions in one place.') }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button compact-button" :disabled="loading" @click="loadAll">
          <RefreshCw :size="16" />
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新', 'Refresh') }}
        </button>
        <button type="button" class="primary-button compact-button" :disabled="saving || loading" @click="saveProfile">
          <Save :size="16" />
          {{ saving ? text('保存中...', 'Saving...') : text('保存 Profile', 'Save profile') }}
        </button>
      </div>
    </div>

    <div v-if="noticeMessage" class="status-banner" :class="noticeTone === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage }}
    </div>
    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-if="loading && !loaded" class="empty-inline">{{ text('正在读取 CLI Agent 配置...', 'Loading CLI Agent configuration...') }}</div>

    <template v-else>
      <section class="agents-cli-layout">
        <article class="agents-profile-panel agents-cli-profile-list">
          <header class="agents-profile-panel__head">
            <div>
              <p class="eyebrow">Profiles</p>
              <h3>{{ text('CLI Profiles', 'CLI profiles') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" @click="newProfile">
              <Plus :size="16" />
              {{ text('新建', 'New') }}
            </button>
          </header>

          <div v-if="profiles.length" class="agents-compact-list agents-cli-profile-list__rows">
            <button
              v-for="profile in profiles"
              :key="profile.id"
              type="button"
              class="agents-cli-select-row"
              :class="{ active: profile.id === selectedProfileId }"
              @click="selectProfile(profile)"
            >
              <small>{{ profile.agent }} · {{ profile.permissionMode }}</small>
              <strong>{{ profile.name || profile.id }}</strong>
              <span>{{ profile.model || text('默认模型', 'default model') }}</span>
              <span>{{ compactPath(profile.workDir) }}</span>
            </button>
          </div>
          <div v-else class="empty-inline">
            {{ text('还没有 CLI Profile。可以基于当前 Agent 创建一个。', 'No CLI profiles yet. Create one from the current agent.') }}
          </div>
        </article>

        <article class="agents-runtime-panel agents-cli-editor">
          <header class="agents-runtime-panel__head">
            <div>
              <p class="eyebrow">Run Profile</p>
              <h3>{{ text('运行配置', 'Runtime profile') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" :disabled="saving || !profileDraft.id" @click="setDefaultProfile">
              <Star :size="16" />
              {{ text('设为默认', 'Set default') }}
            </button>
          </header>

          <dl class="agents-fact-grid agents-cli-facts">
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

          <div class="agents-form-grid">
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
            <div class="form-field form-field-full">
              <label class="form-label">{{ text('模型', 'Model') }}</label>
              <StudioSelect
                v-model="profileDraft.model"
                :options="modelOptions"
                :placeholder="text('跟随默认模型', 'Inherit default model')"
              />
              <span class="field-hint">{{ text('模型列表来自 Studio Gateway 的可用模型目录。', 'The model list is read from the Studio Gateway catalog.') }}</span>
            </div>
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
              <input v-model.trim="profileDraft.appProfileRef" class="form-input" autocomplete="off" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('推理强度', 'Reasoning effort') }}</label>
              <StudioSelect v-model="reasoningEffortDraft" :options="reasoningOptions" />
            </div>
          </div>
        </article>

        <article class="agents-data-panel agents-cli-binding-panel">
          <header class="agents-data-panel__head">
            <div>
              <p class="eyebrow">IM Bindings</p>
              <h3>{{ text('渠道绑定', 'Channel bindings') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" @click="openChannelConnectors">
              <ExternalLink :size="16" />
              {{ text('完整配置', 'Full config') }}
            </button>
          </header>

          <div v-if="relatedBindings.length" class="agents-compact-list">
            <article v-for="binding in relatedBindings" :key="binding.id" class="agents-compact-list-row agents-cli-binding-row">
              <div>
                <strong>{{ binding.displayName || binding.id }}</strong>
                <p>{{ binding.platform }} · {{ binding.accountId }}{{ binding.botId ? ` / ${binding.botId}` : '' }}</p>
              </div>
              <div>
                <span>{{ binding.enabled ? text('启用', 'Enabled') : text('停用', 'Disabled') }}</span>
                <span>{{ bindingHealthLabel(binding.id) }}</span>
              </div>
              <strong>{{ binding.agentProfileId }}</strong>
            </article>
          </div>
          <div v-else class="empty-inline">
            {{ text('当前 Profile 还没有 IM 绑定。', 'This profile has no IM binding yet.') }}
          </div>
        </article>

        <article class="agents-data-panel agents-cli-session-panel">
          <header class="agents-data-panel__head">
            <div>
              <p class="eyebrow">Sessions</p>
              <h3>{{ text('持久会话与记录', 'Persistent sessions and records') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" :disabled="sessionBusy" @click="refreshSessions">
              <RefreshCw :size="16" />
              {{ text('刷新会话', 'Refresh sessions') }}
            </button>
          </header>

          <dl class="agents-metric-strip agents-cli-session-metrics">
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
              <dd>{{ relatedSessionEvents.length }}</dd>
            </div>
            <div>
              <dt>{{ text('空闲超时', 'Idle timeout') }}</dt>
              <dd>{{ agentSessions ? formatDuration(agentSessions.policy.idleTimeoutMs) : '-' }}</dd>
            </div>
          </dl>

          <div v-if="activeSessions.length" class="agents-compact-list">
            <article v-for="session in activeSessions" :key="session.poolKey" class="agents-compact-list-row agents-cli-session-row">
              <div>
                <strong>{{ session.model || text('默认模型', 'default model') }}</strong>
                <p>{{ session.agent }} · {{ session.bindingId }} · {{ session.permissionMode || '-' }}</p>
                <p>{{ compactPath(session.workDir) }}</p>
              </div>
              <div>
                <span>{{ text('运行中', 'running') }} {{ session.running }}</span>
                <span>{{ text('最近使用', 'Last used') }} {{ formatTimestamp(session.lastUsedAt) }}</span>
                <span v-if="session.lastError" class="agents-cli-danger">{{ session.lastError }}</span>
              </div>
              <button
                type="button"
                class="secondary-button compact-button"
                :disabled="sessionBusy"
                @click="killSession(session.poolKey)"
              >
                <Square :size="15" />
                {{ text('停止', 'Stop') }}
              </button>
            </article>
          </div>
          <div v-else class="empty-inline">
            {{ text('当前 Profile 没有活动持久会话。', 'No active persistent session for this profile.') }}
          </div>

          <div v-if="relatedSessionEvents.length" class="agents-cli-events">
            <article v-for="event in relatedSessionEvents" :key="`${event.checkedAt}:${event.type}:${event.poolKey}:${event.messageId || ''}`" class="agents-cli-event-row">
              <small>{{ formatTimestamp(event.checkedAt) }} · {{ event.bindingId }}</small>
              <strong>{{ event.type }}</strong>
              <span v-if="event.reason || event.error" :class="{ 'agents-cli-danger': Boolean(event.error) }">
                {{ [event.reason, event.error].filter(Boolean).join(' · ') }}
              </span>
            </article>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ExternalLink, Plus, RefreshCw, Save, Square, Star } from '@lucide/vue';
import type { AgentDetailPayload } from '../../../../../types/agents';
import type {
  ChannelConnectorAgentId,
  ChannelConnectorAgentProfile,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorPermissionMode,
  ChannelConnectorsNativeConfig,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import type { ModelGatewayProviderView } from '../../../../../types/model-gateway';
import StudioSelect from '../../shared/components/StudioSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchChannelConnectorAgentSessions,
  fetchChannelConnectorsNativeConfig,
  fetchChannelConnectorsStatus,
  manageChannelConnectorAgentSessions,
  saveChannelConnectorsNativeConfig,
} from '../channel-connectors/api';
import { fetchModelGatewayAppConnections, fetchModelGatewayProviders } from '../model-gateway/api';
import { fetchAgentDetail, fetchAgentsSummary } from './api';

defineOptions({ name: 'AgentCliPage' });

type NoticeTone = 'success' | 'error';

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const agentId = computed(() => String(route.params.agentId || ''));
const detail = ref<AgentDetailPayload | null>(null);
const nativeConfig = ref<ChannelConnectorsNativeConfigResponse | null>(null);
const status = ref<ChannelConnectorsStatusResponse | null>(null);
const agentSessions = ref<ChannelConnectorAgentSessionDriverStatusResponse | null>(null);
const gatewayModels = ref<string[]>([]);
const selectedProfileId = ref('');
const reasoningEffortDraft = ref('');
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

const relatedBindings = computed(() =>
  bindings.value.filter((binding) => binding.agentProfileId === profileDraft.id),
);

const relatedBindingIds = computed(() => new Set(relatedBindings.value.map((binding) => binding.id)));

const activeSessions = computed(() => {
  const bindingIds = relatedBindingIds.value;
  return (agentSessions.value?.activeSessions || []).filter((session) =>
    session.projectId === profileDraft.id
    || bindingIds.has(session.bindingId)
    || Boolean(profileDraft.workDir && session.workDir === profileDraft.workDir),
  );
});

const requestedSessions = computed(() => {
  const bindingIds = relatedBindingIds.value;
  return (agentSessions.value?.requestedPersistentBindings || []).filter((session) =>
    session.projectId === profileDraft.id
    || bindingIds.has(session.bindingId)
    || Boolean(profileDraft.workDir && session.workDir === profileDraft.workDir),
  );
});

const relatedSessionEvents = computed(() => {
  const bindingIds = relatedBindingIds.value;
  return (agentSessions.value?.recentEvents || []).filter((event) =>
    event.projectId === profileDraft.id
    || bindingIds.has(event.bindingId)
    || Boolean(profileDraft.workDir && event.workDir === profileDraft.workDir),
  ).slice(0, 8);
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

function addModelOption(target: Set<string>, value: unknown): void {
  const normalized = String(value || '').trim();
  if (normalized) target.add(normalized);
}

function collectGatewayProviderModelNames(providers: ModelGatewayProviderView[]): string[] {
  const names = new Set<string>();
  const collectCatalog = (catalog: ModelGatewayProviderView['models'] | null | undefined) => {
    if (!catalog) return;
    addModelOption(names, catalog.defaultModel);
    for (const model of catalog.models || []) {
      addModelOption(names, model.id);
      for (const alias of model.aliases || []) addModelOption(names, alias);
    }
    for (const [alias, target] of Object.entries(catalog.aliases || {})) {
      addModelOption(names, alias);
      addModelOption(names, target);
    }
  };
  for (const provider of providers) {
    if (!provider.enabled) continue;
    collectCatalog(provider.models);
    for (const endpointProfile of provider.endpointProfiles || []) {
      if (endpointProfile.enabled) collectCatalog(endpointProfile.models);
    }
  }
  return Array.from(names);
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
  profileDraft.workDir = profile.workDir || detail.value?.agent.workspace || '';
  profileDraft.permissionMode = profile.permissionMode || 'suggest';
  profileDraft.gatewayEndpoint = profile.gatewayEndpoint || 'http://127.0.0.1:18796/v1';
  profileDraft.gatewayKeyRef = 'studio-gateway-client-key';
  profileDraft.appProfileRef = profile.appProfileRef || 'default';
  reasoningEffortDraft.value = profile.reasoningEffort || '';
}

function bestProfileForCurrentAgent(): ChannelConnectorAgentProfile | null {
  const items = profiles.value;
  if (!items.length) return null;
  const currentId = agentId.value.toLowerCase();
  const currentWorkspace = detail.value?.agent.workspace || '';
  const defaultId = nativeConfig.value?.config.defaultAgentProfileId || '';
  return [...items].sort((left, right) => scoreProfile(right) - scoreProfile(left))[0] || items.find((profile) => profile.id === defaultId) || items[0];

  function scoreProfile(profile: ChannelConnectorAgentProfile): number {
    const id = profile.id.toLowerCase();
    const name = profile.name.toLowerCase();
    let score = 0;
    if (id === currentId) score += 100;
    if (id.includes(currentId) || name.includes(currentId)) score += 35;
    if (profile.workDir && currentWorkspace && profile.workDir === currentWorkspace) score += 15;
    if (profile.id === defaultId) score += 10;
    return score;
  }
}

function selectInitialProfile(): void {
  const existing = profiles.value.find((profile) => profile.id === selectedProfileId.value);
  if (existing) {
    selectProfile(existing);
    return;
  }
  const best = bestProfileForCurrentAgent();
  if (best) selectProfile(best);
  else newProfile();
}

function newProfile(): void {
  const baseId = agentId.value || 'agent';
  const existing = new Set(profiles.value.map((profile) => profile.id));
  let id = `${baseId}-cli`;
  let suffix = 2;
  while (existing.has(id)) {
    id = `${baseId}-cli-${suffix}`;
    suffix += 1;
  }
  selectProfile({
    id,
    name: `${detail.value?.agent.identity.name || detail.value?.agent.name || baseId} CLI`,
    agent: 'codex',
    model: '',
    workDir: detail.value?.agent.workspace || '',
    permissionMode: 'suggest',
    gatewayEndpoint: 'http://127.0.0.1:18796/v1',
    gatewayKeyRef: 'studio-gateway-client-key',
    appProfileRef: 'default',
  });
}

async function saveProfile(): Promise<void> {
  const config = cloneNativeConfig();
  if (!config) return;
  const profile = profileFromDraft();
  if (!profile.id || !profile.workDir) {
    setNotice(text('Profile ID 和工作目录必填。', 'Profile ID and work directory are required.'), 'error');
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const index = config.agentProfiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) config.agentProfiles.splice(index, 1, profile);
    else config.agentProfiles.push(profile);
    if (!config.defaultAgentProfileId || !config.agentProfiles.some((item) => item.id === config.defaultAgentProfileId)) {
      config.defaultAgentProfileId = profile.id;
    }
    nativeConfig.value = await saveChannelConnectorsNativeConfig({ config });
    selectProfile(profile);
    setNotice(text('CLI Profile 已保存。', 'CLI profile saved.'));
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
  saving.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const index = config.agentProfiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) config.agentProfiles.splice(index, 1, profile);
    else config.agentProfiles.push(profile);
    config.defaultAgentProfileId = profile.id;
    nativeConfig.value = await saveChannelConnectorsNativeConfig({ config });
    selectProfile(profile);
    setNotice(text('默认 CLI Profile 已更新。', 'Default CLI profile updated.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('更新默认 CLI Profile 失败。', 'Failed to update default CLI profile.');
  } finally {
    saving.value = false;
  }
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
      reason: 'agent-cli-page-stop',
    });
    setNotice(text('已请求停止 CLI 会话。', 'CLI session stop requested.'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('停止 CLI 会话失败。', 'Failed to stop CLI session.');
  } finally {
    sessionBusy.value = false;
  }
}

function openChannelConnectors(): void {
  void router.push('/channel-connectors');
}

async function loadAll(): Promise<void> {
  if (!agentId.value) return;
  loading.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const [nextDetail, agentsSummary, nextNativeConfig, nextStatus, nextSessions] = await Promise.all([
      fetchAgentDetail(agentId.value),
      fetchAgentsSummary(),
      fetchChannelConnectorsNativeConfig(),
      fetchChannelConnectorsStatus(),
      fetchChannelConnectorAgentSessions(),
    ]);
    let gatewayModelCatalog: string[] = [];
    try {
      const [appConnections, providers] = await Promise.all([
        fetchModelGatewayAppConnections(),
        fetchModelGatewayProviders(),
      ]);
      gatewayModelCatalog = [
        ...(appConnections.availableModels || []),
        ...collectGatewayProviderModelNames(providers.providers || []),
      ];
    } catch {
      setNotice(text('Gateway 模型目录暂不可用，已使用 Agent 本地模型列表。', 'Gateway model catalog is unavailable; using the local Agent model list.'), 'error');
    }
    detail.value = nextDetail;
    nativeConfig.value = nextNativeConfig;
    status.value = nextStatus;
    agentSessions.value = nextSessions;
    gatewayModels.value = Array.from(new Set([
      ...gatewayModelCatalog,
      ...(agentsSummary.availableModels || []),
    ].map((model) => String(model || '').trim()).filter(Boolean)));
    selectInitialProfile();
    loaded.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('读取 CLI Agent 配置失败。', 'Failed to load CLI Agent configuration.');
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.agentId,
  async () => {
    loaded.value = false;
    selectedProfileId.value = '';
    if (!agentId.value) return;
    await loadAll();
  },
  { immediate: true },
);

onActivated(async () => {
  if (!agentId.value || loading.value || saving.value) return;
  await loadAll();
});
</script>
