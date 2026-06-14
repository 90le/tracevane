<template>
  <section class="page-shell channel-connectors-profile-page ccx-agent-profile-page">
    <header class="page-header-row ccx-agent-profile-head">
      <div>
        <p class="eyebrow">Channel Connectors</p>
        <h2 class="page-title">{{ text('CLI Profile 管理', 'CLI Profile management') }}</h2>
        <p class="page-copy">{{ text('集中管理 Studio 原生 CLI Agent Bot 的 Profile、Gateway 模型、IM 绑定和持久会话；不依赖 OpenClaw Agent 管理。', 'Manage Studio-native CLI Agent Bot profiles, Gateway models, IM bindings, and persistent sessions without depending on OpenClaw Agent management.') }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button compact-button" @click="openChannelConnectors">
          <ExternalLink :size="16" />
          {{ text('渠道连接', 'Channel Connectors') }}
        </button>
        <button type="button" class="secondary-button compact-button" :disabled="loading" @click="loadAll">
          <RefreshCw :size="16" />
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新', 'Refresh') }}
        </button>
        <button type="button" class="primary-button compact-button" :disabled="saving || loading" @click="saveProfile">
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
                <span>{{ profile.model || text('默认模型', 'default model') }}</span>
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
              <button type="button" class="secondary-button compact-button" @click="openChannelConnectors">
                <ExternalLink :size="16" />
                {{ text('完整配置', 'Full config') }}
              </button>
            </header>

            <div v-if="relatedBindings.length" class="ccx-list">
              <article v-for="binding in relatedBindings" :key="binding.id" class="ccx-list-row ccx-agent-profile-binding-row">
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
        </aside>

        <main class="ccx-agent-profile-main">
          <article class="ccx-panel ccx-agent-profile-editor">
            <header class="ccx-panel-head">
              <div>
                <p class="eyebrow">Run Profile</p>
                <h3>{{ text('运行配置', 'Runtime profile') }}</h3>
              </div>
              <button type="button" class="secondary-button compact-button" :disabled="saving || !profileDraft.id" @click="setDefaultProfile">
                <Star :size="16" />
                {{ text('设为默认', 'Set default') }}
              </button>
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
                    <label class="form-label">{{ text('推理强度', 'Reasoning effort') }}</label>
                    <StudioSelect v-model="reasoningEffortDraft" :options="reasoningOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('预算来源', 'Budget source') }}</label>
                    <input class="form-input" :value="selectedBudgetSourceLabel" readonly />
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
                    <input v-model.trim="profileDraft.appProfileRef" class="form-input" autocomplete="off" />
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
              <button type="button" class="secondary-button compact-button" :disabled="sessionBusy" @click="refreshSessions">
                <RefreshCw :size="16" />
                {{ text('刷新会话', 'Refresh sessions') }}
              </button>
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
                <dd>{{ relatedSessionEvents.length }}</dd>
              </div>
              <div>
                <dt>{{ text('空闲超时', 'Idle timeout') }}</dt>
                <dd>{{ agentSessions ? formatDuration(agentSessions.policy.idleTimeoutMs) : '-' }}</dd>
              </div>
            </dl>

            <div v-if="activeSessions.length" class="ccx-list">
              <article v-for="session in activeSessions" :key="session.poolKey" class="ccx-list-row ccx-agent-profile-session-row">
                <div>
                  <strong>{{ session.model || text('默认模型', 'default model') }}</strong>
                  <p>{{ session.agent }} · {{ session.bindingId }} · {{ session.permissionMode || '-' }}</p>
                  <p>{{ compactPath(session.workDir) }}</p>
                </div>
                <div>
                  <span>{{ text('运行中', 'running') }} {{ session.running }}</span>
                  <span>{{ text('最近使用', 'Last used') }} {{ formatTimestamp(session.lastUsedAt) }}</span>
                  <span v-if="session.lastError" class="ccx-danger-text">{{ session.lastError }}</span>
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

            <div v-if="relatedSessionEvents.length" class="ccx-event-list ccx-agent-profile-events">
              <article v-for="event in relatedSessionEvents" :key="`${event.checkedAt}:${event.type}:${event.poolKey}:${event.messageId || ''}`" class="ccx-list-row ccx-agent-profile-event-row">
                <small>{{ formatTimestamp(event.checkedAt) }} · {{ event.bindingId }}</small>
                <strong>{{ event.type }}</strong>
                <span v-if="event.reason || event.error" :class="{ 'ccx-danger-text': Boolean(event.error) }">
                  {{ [event.reason, event.error].filter(Boolean).join(' · ') }}
                </span>
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
import { ExternalLink, Plus, RefreshCw, Save, Square, Star } from '@lucide/vue';
import type {
  ChannelConnectorAgentId,
  ChannelConnectorAgentProfile,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorPermissionMode,
  ChannelConnectorsNativeConfig,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import type {
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
const gatewayModels = ref<string[]>([]);
const gatewayModelBudgetIndex = ref<Record<string, GatewayModelBudget>>({});
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

const selectedEffectiveModel = computed(() => {
  return String(profileDraft.model || appConnectionProfile.value?.model || '').trim();
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
      reason: 'channel-connectors-profile-stop',
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
      const [appConnections, providers] = await Promise.all([
        fetchModelGatewayAppConnections(),
        fetchModelGatewayProviders(),
      ]);
      const providerCatalog = collectGatewayProviderModelNames(providers.providers || []);
      gatewayModelCatalog = [
        ...(appConnections.availableModels || []),
        ...providerCatalog.models,
      ];
      gatewayBudgetCatalog = providerCatalog.budgets;
      appConnectionProfile.value = appConnections.profile;
    } catch {
      setNotice(text('Gateway 模型目录暂不可用，模型下拉只保留当前 Profile 值。', 'Gateway model catalog is unavailable; the model picker only keeps the current profile value.'), 'error');
      appConnectionProfile.value = null;
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
