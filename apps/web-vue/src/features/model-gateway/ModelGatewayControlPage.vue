<template>
  <section class="page-shell model-gateway-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">Studio Gateway</p>
        <h2 class="page-title">{{ text('模型网关', 'Model Gateway') }}</h2>
        <p class="page-copy">
          {{ text('统一管理本地 Gateway daemon、provider、路由和 smoke，供 Codex、Claude Code、OpenCode、OpenClaw 等客户端接入。', 'Manage the local Gateway daemon, providers, routing, and smoke checks for Codex, Claude Code, OpenCode, OpenClaw, and other clients.') }}
        </p>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="loading" @click="loadAll">
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh') }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="status-banner" :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ notice.message }}
    </div>
    <div v-else-if="loading && !loaded" class="status-banner">
      {{ text('正在加载 Studio Gateway 状态...', 'Loading Studio Gateway state...') }}
    </div>

    <section class="mgw-layout">
      <aside class="mgw-runtime-rail">
        <article class="mgw-panel mgw-runtime-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Runtime</p>
              <h3>{{ text('Gateway daemon', 'Gateway daemon') }}</h3>
            </div>
            <StatusPill :label="daemonStateLabel" :tone="daemonStateTone" />
          </div>

          <div class="mgw-facts">
            <div>
              <span>{{ text('CLI Endpoint', 'CLI Endpoint') }}</span>
              <strong>{{ preferredEndpoint }}</strong>
            </div>
            <div>
              <span>{{ text('Supervisor', 'Supervisor') }}</span>
              <strong>{{ supervisorLabel }}</strong>
            </div>
            <div>
              <span>{{ text('服务模板', 'Service template') }}</span>
              <strong>{{ daemonService?.templateWritten ? text('已写入', 'Written') : text('未写入', 'Not written') }}</strong>
            </div>
            <div>
              <span>{{ text('请求日志', 'Request log') }}</span>
              <strong>{{ runtimeEntries.length }}</strong>
            </div>
          </div>

          <div class="mgw-button-row">
            <button type="button" class="secondary-button compact-button" :disabled="daemonBusy" @click="runDaemonAction('preview')">
              {{ text('预览 service', 'Preview service') }}
            </button>
            <button type="button" class="secondary-button compact-button" :disabled="daemonBusy" @click="runDaemonAction('status')">
              {{ text('运行 status', 'Run status') }}
            </button>
            <button type="button" class="primary-button compact-button" :disabled="daemonBusy" @click="runDaemonAction('ensure-running')">
              {{ text('确保 daemon 运行', 'Ensure daemon') }}
            </button>
          </div>

          <p class="mgw-note">
            {{ text('正式稳定性依赖 OS/user supervisor；Studio 或 OpenClaw 崩溃时，客户端应继续直连 daemon endpoint。', 'Production stability depends on the OS/user supervisor; clients should keep using the daemon endpoint if Studio or OpenClaw crashes.') }}
          </p>
        </article>

        <article class="mgw-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Routes</p>
              <h3>{{ text('Active routing', 'Active routing') }}</h3>
            </div>
          </div>

          <div class="mgw-route-list">
            <label v-for="scope in appScopeOptions" :key="scope.id" class="mgw-route-row">
              <span>
                <strong>{{ text(scope.zh, scope.en) }}</strong>
                <small>{{ scopeHint(scope.id) }}</small>
              </span>
              <select class="form-input" :value="activeProviderForScope(scope.id)" :disabled="busy" @change="updateActiveProvider(scope.id, $event)">
                <option value="">{{ text('自动选择 / 未设置', 'Auto / unset') }}</option>
                <option v-for="provider in providersForScope(scope.id)" :key="provider.id" :value="provider.id">
                  {{ provider.name }}
                </option>
              </select>
            </label>
          </div>
        </article>
      </aside>

      <main class="mgw-main">
        <article class="mgw-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Provider Center</p>
              <h3>{{ text('Provider 配置', 'Provider configuration') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" @click="resetDraft">
              {{ text('新建', 'New') }}
            </button>
          </div>

          <div class="mgw-preset-strip" aria-label="Provider presets">
            <button
              v-for="preset in providerPresets"
              :key="preset.id"
              type="button"
              class="surface-tab"
              :class="{ active: draft.presetId === preset.id }"
              @click="applyPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>

          <div class="mgw-provider-grid">
            <section class="mgw-provider-list" :aria-label="text('Provider 列表', 'Provider list')">
              <button
                v-for="provider in providers"
                :key="provider.id"
                type="button"
                class="mgw-provider-card"
                :class="{ active: draft.id === provider.id }"
                @click="editProvider(provider)"
              >
                <span class="mgw-provider-card__main">
                  <strong>{{ provider.name }}</strong>
                  <small>{{ apiFormatLabel(provider.apiFormat) }} / {{ provider.models.defaultModel || '-' }}</small>
                </span>
                <span class="mgw-provider-card__meta">
                  <StatusPill :label="provider.enabled ? text('启用', 'Enabled') : text('停用', 'Disabled')" :tone="provider.enabled ? 'sage' : 'neutral'" />
                  <small>{{ provider.secret?.hasSecret ? provider.secret.masked : text('无密钥', 'No key') }}</small>
                </span>
              </button>
              <div v-if="!providers.length" class="mgw-empty">
                {{ text('还没有 provider。选择预设后保存即可创建。', 'No provider yet. Pick a preset and save it to create one.') }}
              </div>
            </section>

            <form class="mgw-provider-form" @submit.prevent="saveProvider">
              <div class="mgw-form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('Provider ID', 'Provider ID') }}</span>
                  <input v-model.trim="draft.id" class="form-input" placeholder="bigmodel-chat" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('名称', 'Name') }}</span>
                  <input v-model.trim="draft.name" class="form-input" placeholder="BigModel Chat" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('原生协议', 'Native protocol') }}</span>
                  <select v-model="draft.apiFormat" class="form-input">
                    <option v-for="format in apiFormatOptions" :key="format.id" :value="format.id">{{ format.label }}</option>
                  </select>
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('认证方式', 'Auth') }}</span>
                  <select v-model="draft.authStrategy" class="form-input">
                    <option v-for="strategy in authStrategyOptions" :key="strategy.id" :value="strategy.id">{{ strategy.label }}</option>
                  </select>
                </label>
                <label class="form-field form-field-full">
                  <span class="form-label">Base URL</span>
                  <input v-model.trim="draft.baseUrl" class="form-input" placeholder="https://api.example.com/v1" />
                  <span class="field-hint">{{ text('这里是上游 API 前缀，Gateway 不会自动追加 /v1。', 'This is the upstream API prefix; Gateway will not append /v1 automatically.') }}</span>
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('默认模型', 'Default model') }}</span>
                  <input v-model.trim="draft.defaultModel" class="form-input" placeholder="gpt-5.4" />
                </label>
                <label class="form-field">
                  <span class="form-label">API Key</span>
                  <input v-model="draft.apiKey" class="form-input" type="password" :placeholder="secretPlaceholder" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('Anthropic endpoint override', 'Anthropic endpoint override') }}</span>
                  <input v-model.trim="draft.anthropicEndpoint" class="form-input" placeholder="/messages" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('Compact endpoint override', 'Compact endpoint override') }}</span>
                  <input v-model.trim="draft.compactEndpoint" class="form-input" placeholder="/responses/compact" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('代理 URL', 'Proxy URL') }}</span>
                  <input v-model.trim="draft.proxyUrl" class="form-input" placeholder="http://127.0.0.1:7890" />
                </label>
                <label class="form-field">
                  <span class="form-label">NO_PROXY</span>
                  <input v-model.trim="draft.noProxy" class="form-input" placeholder="localhost,127.0.0.1" />
                </label>
              </div>

              <div class="mgw-scope-picker">
                <span class="form-label">{{ text('可用范围', 'Available scopes') }}</span>
                <label v-for="scope in appScopeOptions" :key="scope.id" class="mgw-check">
                  <input v-model="draft.appScopes[scope.id]" type="checkbox" />
                  <span>{{ text(scope.zh, scope.en) }}</span>
                </label>
              </div>

              <div class="mgw-button-row mgw-form-actions">
                <button type="submit" class="primary-button" :disabled="busy || !canSaveProvider">
                  {{ busy ? text('保存中...', 'Saving...') : text('保存 Provider', 'Save provider') }}
                </button>
                <button v-if="draft.id && providerExists(draft.id)" type="button" class="danger-link" :disabled="busy" @click="removeProvider(draft.id)">
                  {{ text('删除', 'Delete') }}
                </button>
              </div>
            </form>
          </div>
        </article>

        <article class="mgw-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Smoke</p>
              <h3>{{ text('协议 smoke', 'Protocol smoke') }}</h3>
            </div>
            <button type="button" class="primary-button compact-button" :disabled="smokeBusy || !smokeProviderId" @click="runSmoke">
              {{ smokeBusy ? text('测试中...', 'Testing...') : text('运行 smoke', 'Run smoke') }}
            </button>
          </div>

          <div class="mgw-smoke-grid">
            <label class="form-field">
              <span class="form-label">Provider</span>
              <select v-model="smokeProviderId" class="form-input">
                <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('客户端协议', 'Client protocol') }}</span>
              <select v-model="smokeRouteId" class="form-input">
                <option v-for="route in routeOptions" :key="route.id" :value="route.id">{{ route.label }}</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('模型', 'Model') }}</span>
              <input v-model.trim="smokeModel" class="form-input" :placeholder="selectedSmokeProvider?.models.defaultModel || 'gpt-5.4'" />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('输入', 'Input') }}</span>
              <input v-model.trim="smokeInput" class="form-input" placeholder="Reply with GATEWAY_OK" />
            </label>
          </div>

          <div v-if="smokeResult" class="mgw-smoke-result" :class="smokeResult.ok ? 'success' : 'failure'">
            <div>
              <strong>{{ smokeResult.ok ? text('通过', 'Passed') : text('失败', 'Failed') }}</strong>
              <span>{{ smokeResult.statusCode || '-' }} · {{ smokeResult.latencyMs }} ms · {{ smokeResult.route.upstreamUrl || '-' }}</span>
            </div>
            <pre>{{ smokeResult.responsePreview || smokeResult.error?.message || '-' }}</pre>
          </div>

          <div class="mgw-request-log">
            <div class="mgw-log-head">
              <strong>{{ text('最近请求', 'Recent requests') }}</strong>
              <span>{{ runtime?.runtime.updatedAt ? formatTimestamp(runtime.runtime.updatedAt) : '-' }}</span>
            </div>
            <div v-for="entry in runtimeEntries" :key="entry.id" class="mgw-log-row" :class="entry.outcome">
              <span>{{ entry.outcome }}</span>
              <strong>{{ entry.providerName || entry.providerId || '-' }}</strong>
              <small>{{ entry.requestedPath }} · {{ entry.model || '-' }} · {{ entry.durationMs }} ms</small>
            </div>
            <div v-if="!runtimeEntries.length" class="mgw-empty">
              {{ text('暂无请求记录。', 'No request log yet.') }}
            </div>
          </div>
        </article>
      </main>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import type {
  ModelGatewayApiFormat,
  ModelGatewayAppScope,
  ModelGatewayAuthStrategy,
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayProviderCategory,
  ModelGatewayProviderInput,
  ModelGatewayProviderTestResponse,
  ModelGatewayProviderView,
  ModelGatewayRouteId,
  ModelGatewayRuntimeRequestLogEntry,
  ModelGatewayRuntimeResponse,
  ModelGatewayStatusResponse,
  ModelGatewayUpsertProviderRequest,
} from '../../../../../types/model-gateway';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  deleteModelGatewayProvider,
  fetchModelGatewayDaemonService,
  fetchModelGatewayProviders,
  fetchModelGatewayRuntime,
  fetchModelGatewayStatus,
  manageModelGatewayDaemonService,
  setModelGatewayActiveProvider,
  testModelGatewayProvider,
  upsertModelGatewayProvider,
} from './api';
import './model-gateway-workspace.css';

defineOptions({ name: 'ModelGatewayControlPage' });

type ProviderDraft = {
  presetId: string;
  id: string;
  name: string;
  enabled: boolean;
  category: ModelGatewayProviderCategory;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
  anthropicEndpoint: string;
  compactEndpoint: string;
  proxyUrl: string;
  noProxy: string;
  appScopes: Record<ModelGatewayAppScope, boolean>;
};

type ProviderPreset = {
  id: string;
  label: string;
  draft: Partial<ProviderDraft>;
};

const { text } = useLocalePreference();

const appScopeOptions: Array<{ id: ModelGatewayAppScope; zh: string; en: string }> = [
  { id: 'codex', zh: 'Codex', en: 'Codex' },
  { id: 'claude-code', zh: 'Claude Code', en: 'Claude Code' },
  { id: 'opencode', zh: 'OpenCode', en: 'OpenCode' },
  { id: 'openclaw', zh: 'OpenClaw', en: 'OpenClaw' },
];

const apiFormatOptions: Array<{ id: ModelGatewayApiFormat; label: string }> = [
  { id: 'openai_chat', label: 'OpenAI Chat Completions' },
  { id: 'openai_responses', label: 'OpenAI Responses API' },
  { id: 'anthropic_messages', label: 'Anthropic Messages' },
];

const authStrategyOptions: Array<{ id: ModelGatewayAuthStrategy; label: string }> = [
  { id: 'bearer', label: 'Bearer' },
  { id: 'anthropic_api_key', label: 'Anthropic x-api-key' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'oauth_proxy', label: 'OAuth proxy' },
  { id: 'none', label: 'None' },
];

const routeOptions: Array<{ id: ModelGatewayRouteId; label: string }> = [
  { id: 'openai_chat_completions', label: 'OpenAI Chat Completions' },
  { id: 'openai_responses', label: 'OpenAI Responses' },
  { id: 'openai_responses_compact', label: 'OpenAI Responses compact' },
  { id: 'anthropic_messages', label: 'Anthropic Messages' },
];

const providerPresets: ProviderPreset[] = [
  {
    id: 'bigmodel-chat',
    label: 'BigModel Chat',
    draft: {
      id: 'bigmodel-chat',
      name: 'BigModel Chat',
      category: 'openai-compatible',
      apiFormat: 'openai_chat',
      authStrategy: 'bearer',
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      defaultModel: 'glm-4.6',
      anthropicEndpoint: '',
      compactEndpoint: '',
    },
  },
  {
    id: 'bigmodel-anthropic',
    label: 'BigModel Anthropic',
    draft: {
      id: 'bigmodel-anthropic',
      name: 'BigModel Anthropic',
      category: 'openai-compatible',
      apiFormat: 'anthropic_messages',
      authStrategy: 'anthropic_api_key',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      defaultModel: 'glm-4.6',
      anthropicEndpoint: '/v1/messages',
      compactEndpoint: '',
    },
  },
  {
    id: 'gmn-responses',
    label: 'GMN Responses',
    draft: {
      id: 'gmn-responses',
      name: 'GMN Responses',
      category: 'aggregator',
      apiFormat: 'openai_responses',
      authStrategy: 'bearer',
      baseUrl: 'https://gmn.chuangzuoli.com/v1',
      defaultModel: 'gpt-5.4',
      anthropicEndpoint: '',
      compactEndpoint: '/responses/compact',
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    draft: {
      id: 'custom-provider',
      name: 'Custom Provider',
      category: 'custom',
      apiFormat: 'openai_chat',
      authStrategy: 'bearer',
      baseUrl: '',
      defaultModel: '',
    },
  },
];

const loading = ref(false);
const loaded = ref(false);
const busy = ref(false);
const daemonBusy = ref(false);
const smokeBusy = ref(false);
const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);
const status = ref<ModelGatewayStatusResponse | null>(null);
const runtime = ref<ModelGatewayRuntimeResponse | null>(null);
const daemonService = ref<ModelGatewayDaemonServiceResponse | null>(null);
const providers = ref<ModelGatewayProviderView[]>([]);
const activeProviders = ref<Partial<Record<ModelGatewayAppScope, string>>>({});
const smokeProviderId = ref('');
const smokeRouteId = ref<ModelGatewayRouteId>('openai_responses');
const smokeModel = ref('');
const smokeInput = ref('Reply with GATEWAY_OK');
const smokeResult = ref<ModelGatewayProviderTestResponse | null>(null);

const draft = reactive<ProviderDraft>(createEmptyDraft());

const runtimeEntries = computed<ModelGatewayRuntimeRequestLogEntry[]>(() =>
  [...(runtime.value?.runtime.requestLog || [])].reverse().slice(0, 8),
);

const selectedSmokeProvider = computed(() =>
  providers.value.find((provider) => provider.id === smokeProviderId.value) || null,
);

const preferredEndpoint = computed(() =>
  status.value?.lifecycle.endpointPolicy.preferredCliEndpoint
  || daemonService.value?.lifecycle.endpointPolicy.preferredCliEndpoint
  || 'http://127.0.0.1:18796/v1',
);

const daemonState = computed(() =>
  daemonService.value?.lifecycle.localDaemon.state
  || status.value?.lifecycle.localDaemon.state
  || 'unknown',
);

const daemonStateLabel = computed(() => {
  if (daemonState.value === 'running') return text('运行中', 'Running');
  if (daemonState.value === 'not-installed') return text('未安装', 'Not installed');
  if (daemonState.value === 'stale') return text('状态过期', 'Stale');
  if (daemonState.value === 'stopped') return text('已停止', 'Stopped');
  return text('未知', 'Unknown');
});

const daemonStateTone = computed<'neutral' | 'accent' | 'sage' | 'danger'>(() => {
  if (daemonState.value === 'running') return 'sage';
  if (daemonState.value === 'not-installed' || daemonState.value === 'stopped') return 'danger';
  if (daemonState.value === 'stale') return 'accent';
  return 'neutral';
});

const supervisorLabel = computed(() =>
  daemonService.value?.plan.supervisor
  || status.value?.lifecycle.localDaemon.supervisor.expected
  || 'unknown',
);

const canSaveProvider = computed(() => Boolean(draft.id.trim() && draft.name.trim() && draft.baseUrl.trim()));
const secretPlaceholder = computed(() => {
  const provider = providers.value.find((entry) => entry.id === draft.id);
  return provider?.secret?.hasSecret
    ? text('留空保留现有密钥', 'Leave empty to keep current key')
    : text('粘贴 API Key', 'Paste API key');
});

function createEmptyScopes(enabled = true): Record<ModelGatewayAppScope, boolean> {
  return {
    codex: enabled,
    'claude-code': enabled,
    opencode: enabled,
    openclaw: enabled,
  };
}

function createEmptyDraft(): ProviderDraft {
  return {
    presetId: '',
    id: '',
    name: '',
    enabled: true,
    category: 'custom',
    apiFormat: 'openai_chat',
    authStrategy: 'bearer',
    baseUrl: '',
    defaultModel: '',
    apiKey: '',
    anthropicEndpoint: '',
    compactEndpoint: '',
    proxyUrl: '',
    noProxy: '',
    appScopes: createEmptyScopes(true),
  };
}

function resetDraft(): void {
  Object.assign(draft, createEmptyDraft());
}

function applyPreset(preset: ProviderPreset): void {
  Object.assign(draft, createEmptyDraft(), preset.draft, {
    presetId: preset.id,
    enabled: true,
    apiKey: '',
    appScopes: createEmptyScopes(true),
  });
  smokeModel.value = draft.defaultModel;
  smokeRouteId.value = draft.apiFormat === 'anthropic_messages'
    ? 'anthropic_messages'
    : draft.apiFormat === 'openai_responses'
      ? 'openai_responses'
      : 'openai_chat_completions';
}

function editProvider(provider: ModelGatewayProviderView): void {
  Object.assign(draft, createEmptyDraft(), {
    presetId: '',
    id: provider.id,
    name: provider.name,
    enabled: provider.enabled,
    category: provider.category,
    apiFormat: provider.apiFormat,
    authStrategy: provider.authStrategy,
    baseUrl: provider.baseUrl,
    defaultModel: provider.models.defaultModel || provider.models.models[0]?.id || '',
    apiKey: '',
    anthropicEndpoint: provider.endpoints.anthropic_messages || '',
    compactEndpoint: provider.endpoints.openai_responses_compact || '',
    proxyUrl: provider.network.proxyUrl || '',
    noProxy: provider.network.noProxy.join(','),
    appScopes: Object.fromEntries(
      appScopeOptions.map((scope) => [scope.id, provider.appScopes.includes(scope.id)]),
    ) as Record<ModelGatewayAppScope, boolean>,
  });
  smokeProviderId.value = provider.id;
  smokeModel.value = draft.defaultModel;
}

function providerExists(providerId: string): boolean {
  return providers.value.some((provider) => provider.id === providerId);
}

function selectedScopes(): ModelGatewayAppScope[] {
  const scopes = appScopeOptions
    .filter((scope) => draft.appScopes[scope.id])
    .map((scope) => scope.id);
  return scopes.length ? scopes : appScopeOptions.map((scope) => scope.id);
}

function buildEndpointOverrides(): Partial<Record<ModelGatewayRouteId, string>> {
  const endpoints: Partial<Record<ModelGatewayRouteId, string>> = {};
  if (draft.anthropicEndpoint.trim()) endpoints.anthropic_messages = draft.anthropicEndpoint.trim();
  if (draft.compactEndpoint.trim()) endpoints.openai_responses_compact = draft.compactEndpoint.trim();
  return endpoints;
}

function parseNoProxy(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

async function loadAll(): Promise<void> {
  loading.value = true;
  notice.value = null;
  try {
    const [nextStatus, nextProviders, nextRuntime, nextDaemon] = await Promise.all([
      fetchModelGatewayStatus(),
      fetchModelGatewayProviders(),
      fetchModelGatewayRuntime(),
      fetchModelGatewayDaemonService(),
    ]);
    status.value = nextStatus;
    runtime.value = nextRuntime;
    daemonService.value = nextDaemon;
    providers.value = nextProviders.providers;
    activeProviders.value = nextProviders.activeProviders;
    ensureSelectedProvider();
    loaded.value = true;
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('加载 Studio Gateway 失败', 'Failed to load Studio Gateway'),
    };
  } finally {
    loading.value = false;
  }
}

function ensureSelectedProvider(): void {
  if (!providers.value.length) return;
  if (!smokeProviderId.value || !providers.value.some((provider) => provider.id === smokeProviderId.value)) {
    const activeId = activeProviders.value.codex || activeProviders.value['claude-code'] || providers.value[0]?.id || '';
    smokeProviderId.value = activeId;
  }
  const provider = selectedSmokeProvider.value;
  if (provider && !smokeModel.value) {
    smokeModel.value = provider.models.defaultModel || provider.models.models[0]?.id || '';
  }
}

async function runDaemonAction(action: ModelGatewayDaemonServiceAction): Promise<void> {
  daemonBusy.value = true;
  notice.value = null;
  try {
    daemonService.value = await manageModelGatewayDaemonService(action, {
      apply: action === 'install' || action === 'ensure-running',
      runCommands: action !== 'preview',
      allowBootstrap: action === 'ensure-running',
    });
    await loadAll();
    notice.value = {
      kind: 'success',
      message: text('daemon service 操作完成', 'Daemon service action completed'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('daemon service 操作失败', 'Daemon service action failed'),
    };
  } finally {
    daemonBusy.value = false;
  }
}

async function saveProvider(): Promise<void> {
  if (!canSaveProvider.value) return;
  busy.value = true;
  notice.value = null;
  const model = draft.defaultModel.trim();
  const provider: ModelGatewayProviderInput = {
    id: draft.id.trim(),
    name: draft.name.trim(),
    enabled: draft.enabled,
    category: draft.category,
    appScopes: selectedScopes(),
    baseUrl: draft.baseUrl.trim(),
    apiFormat: draft.apiFormat,
    authStrategy: draft.authStrategy,
    models: {
      defaultModel: model || null,
      models: model ? [{ id: model }] : [],
      aliases: {},
    },
    endpoints: buildEndpointOverrides(),
    network: {
      proxyUrl: draft.proxyUrl.trim() || null,
      noProxy: parseNoProxy(draft.noProxy),
    },
    metadata: {
      importedFrom: draft.presetId || undefined,
    },
  };
  const payload: ModelGatewayUpsertProviderRequest = {
    provider,
    ...(draft.apiKey.trim() ? { secret: { apiKey: draft.apiKey.trim() } } : {}),
  };
  try {
    await upsertModelGatewayProvider(payload);
    const response = await fetchModelGatewayProviders();
    providers.value = response.providers;
    activeProviders.value = response.activeProviders;
    smokeProviderId.value = provider.id || smokeProviderId.value;
    smokeModel.value = model || smokeModel.value;
    draft.apiKey = '';
    notice.value = {
      kind: 'success',
      message: text('Provider 已保存', 'Provider saved'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Provider 保存失败', 'Provider save failed'),
    };
  } finally {
    busy.value = false;
  }
}

async function removeProvider(providerId: string): Promise<void> {
  if (!providerId) return;
  if (!window.confirm(text(`删除 provider ${providerId}？`, `Delete provider ${providerId}?`))) return;
  busy.value = true;
  try {
    const response = await deleteModelGatewayProvider(providerId);
    providers.value = response.providers;
    activeProviders.value = response.activeProviders;
    resetDraft();
    ensureSelectedProvider();
    notice.value = {
      kind: 'success',
      message: text('Provider 已删除', 'Provider deleted'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Provider 删除失败', 'Provider delete failed'),
    };
  } finally {
    busy.value = false;
  }
}

function activeProviderForScope(scope: ModelGatewayAppScope): string {
  return activeProviders.value[scope] || '';
}

function providersForScope(scope: ModelGatewayAppScope): ModelGatewayProviderView[] {
  return providers.value.filter((provider) => provider.appScopes.includes(scope));
}

async function updateActiveProvider(scope: ModelGatewayAppScope, event: Event): Promise<void> {
  const providerId = (event.target as HTMLSelectElement).value || null;
  busy.value = true;
  notice.value = null;
  try {
    const response = await setModelGatewayActiveProvider({ scope, providerId });
    providers.value = response.providers;
    activeProviders.value = response.activeProviders;
    notice.value = {
      kind: 'success',
      message: text('路由已更新', 'Route updated'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('路由更新失败', 'Route update failed'),
    };
  } finally {
    busy.value = false;
  }
}

async function runSmoke(): Promise<void> {
  if (!smokeProviderId.value) return;
  smokeBusy.value = true;
  smokeResult.value = null;
  notice.value = null;
  try {
    const response = await testModelGatewayProvider(smokeProviderId.value, {
      routeId: smokeRouteId.value,
      model: smokeModel.value || selectedSmokeProvider.value?.models.defaultModel || undefined,
      input: smokeInput.value,
      timeoutMs: 60000,
    });
    smokeResult.value = response;
    await loadRuntimeOnly();
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Smoke 运行失败', 'Smoke failed'),
    };
  } finally {
    smokeBusy.value = false;
  }
}

async function loadRuntimeOnly(): Promise<void> {
  try {
    runtime.value = await fetchModelGatewayRuntime();
  } catch {
    // Runtime refresh is secondary to the smoke result.
  }
}

function apiFormatLabel(format: ModelGatewayApiFormat): string {
  return apiFormatOptions.find((item) => item.id === format)?.label || format;
}

function scopeHint(scope: ModelGatewayAppScope): string {
  if (scope === 'codex') return '/v1/responses';
  if (scope === 'claude-code') return '/v1/messages';
  if (scope === 'opencode') return '/v1/chat/completions';
  return '/v1/chat/completions';
}

function formatTimestamp(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

watch(selectedSmokeProvider, (provider) => {
  if (!provider) return;
  if (!smokeModel.value) {
    smokeModel.value = provider.models.defaultModel || provider.models.models[0]?.id || '';
  }
});

onMounted(loadAll);
onActivated(loadAll);
</script>
