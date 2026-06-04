<template>
  <section v-if="detail && agentId" class="agents-overview-page">
    <div v-if="overviewMessage" class="status-banner">{{ overviewMessage }}</div>

    <div class="agents-overview-workbench agents-overview-workbench--operational">
      <article class="agents-profile-panel">
        <header class="agents-profile-panel__head">
          <div>
            <p class="eyebrow">{{ text('OPERATOR PROFILE', 'OPERATOR PROFILE') }}</p>
            <h3>{{ text('职责与运行档案', 'Role and runtime profile') }}</h3>
            <p class="agents-profile-panel__role">
              {{ detail.agent.identity.role || text('未定义角色', 'No role summary yet') }}
            </p>
          </div>
        </header>

        <p class="agents-profile-panel__mission">
          {{
            detail.agent.identity.mission
              || detail.agent.identity.style
              || detail.agent.identity.theme
              || text('还没有补充使命、风格或主题说明。', 'No mission, style, or theme note has been added yet.')
          }}
        </p>

        <dl class="agents-fact-grid" :aria-label="text('Agent 运行摘要', 'Agent runtime summary')">
          <div>
            <dt>{{ text('状态', 'Status') }}</dt>
            <dd>{{ detail.agent.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</dd>
          </div>
          <div>
            <dt>{{ text('入口', 'Entry') }}</dt>
            <dd>{{ detail.agent.isDefault ? text('默认入口', 'Default entry') : text('手动/路由', 'Manual or routed') }}</dd>
          </div>
          <div>
            <dt>{{ text('运行时', 'Runtime') }}</dt>
            <dd>{{ detail.agent.runtime.type === 'acp' ? 'ACP' : text('默认运行时', 'Default runtime') }}</dd>
          </div>
          <div>
            <dt>{{ text('模型', 'Model') }}</dt>
            <dd>{{ detail.agent.model || detail.defaults.model || text('系统默认', 'System default') }}</dd>
          </div>
          <div>
            <dt>{{ text('工作区', 'Workspace') }}</dt>
            <dd>{{ detail.agent.workspace || detail.defaults.workspace || text('未设置', 'Unset') }}</dd>
          </div>
          <div>
            <dt>{{ text('最后活跃', 'Last active') }}</dt>
            <dd>{{ formatDate(detail.sessions.lastActiveAt) }}</dd>
          </div>
        </dl>
      </article>

      <aside class="agents-runtime-panel" :aria-label="text('运行快改', 'Runtime quick edit')">
        <header class="agents-runtime-panel__head">
          <div>
            <p class="eyebrow">{{ text('RUN CONTROL', 'RUN CONTROL') }}</p>
            <h3>{{ text('运行快改', 'Runtime quick edit') }}</h3>
          </div>
          <div class="page-actions">
            <button type="button" class="secondary-button compact-button" :disabled="overviewBusy" @click="resetQuickEditFromDetail(detail)">
              {{ text('重置', 'Reset') }}
            </button>
            <button type="button" class="primary-button compact-button" :disabled="overviewBusy" @click="saveOverviewQuickEdit">
              {{ overviewBusy ? text('保存中...', 'Saving...') : text('保存', 'Save') }}
            </button>
          </div>
        </header>

        <label class="agents-enable-row">
          <input v-model="quickEdit.enabled" class="form-checkbox" type="checkbox" />
          <span>
            <strong>{{ text('启用状态', 'Enabled') }}</strong>
            <small>{{ text('复杂运行策略在运行配置页维护。', 'Complex runtime policy stays in Runtime.') }}</small>
          </span>
        </label>

        <div class="agents-runtime-grid">
          <div class="form-field">
            <label class="form-label">{{ text('模型', 'Model') }}</label>
            <StudioSelect
              v-model="quickEdit.model"
              :options="modelOptions"
              :placeholder="text('跟随系统默认', 'Inherit system default')"
            />
          </div>

          <div class="form-field">
            <label class="form-label">{{ text('工作区', 'Workspace') }}</label>
            <input v-model="quickEdit.workspace" class="form-input" :placeholder="text('未设置工作区', 'Workspace unset')" />
          </div>
        </div>

        <section class="agents-heartbeat-compact">
          <div>
            <h4>{{ text('内置 HEARTBEAT', 'Built-in HEARTBEAT') }}</h4>
            <p>{{ text('继承会移除 Agent heartbeat；禁用会写入 every: "0m"。', 'Inherit removes the agent heartbeat; disabled writes every: "0m".') }}</p>
          </div>
          <div class="agents-runtime-grid">
            <div class="form-field">
              <label class="form-label">{{ text('策略', 'Policy') }}</label>
              <StudioSelect v-model="quickEdit.heartbeatMode" :options="heartbeatModeOptions" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('周期', 'Interval') }}</label>
              <input v-model="quickEdit.heartbeatEvery" class="form-input" :disabled="quickEdit.heartbeatMode !== 'enabled'" placeholder="30m" />
            </div>
          </div>
          <p class="field-hint">{{ text('例如 10m / 30m / 1h。target: none 不会关闭模型心跳消耗。', 'For example 10m / 30m / 1h. target: none does not stop model-consuming heartbeat turns.') }}</p>
        </section>
      </aside>

      <article class="agents-data-panel agents-session-panel">
        <header class="agents-data-panel__head">
          <div>
            <p class="eyebrow">{{ text('SESSION HEAT', 'SESSION HEAT') }}</p>
            <h3>{{ text('会话热度', 'Session heat') }}</h3>
          </div>
          <button type="button" class="secondary-button compact-button" @click="openSessions">
            {{ text('打开会话页', 'Open Sessions') }}
          </button>
        </header>

        <dl class="agents-metric-strip">
          <div>
            <dt>{{ text('会话数', 'Sessions') }}</dt>
            <dd>{{ detail.sessions.count }}</dd>
          </div>
          <div>
            <dt>{{ text('输入', 'Input') }}</dt>
            <dd>{{ detail.sessions.inputTokens }}</dd>
          </div>
          <div>
            <dt>{{ text('输出', 'Output') }}</dt>
            <dd>{{ detail.sessions.outputTokens }}</dd>
          </div>
          <div>
            <dt>{{ text('最后路由', 'Last route') }}</dt>
            <dd>{{ detail.sessions.lastRoute || text('暂无', 'None yet') }}</dd>
          </div>
        </dl>

        <div v-if="detail.recentSessions.length" class="agents-compact-list">
          <article
            v-for="session in detail.recentSessions.slice(0, 4)"
            :key="session.id"
            class="agents-compact-list-row agents-session-compact-row"
          >
            <div>
              <strong>{{ session.lastRoute || session.routeKey || text('暂无路由', 'No route yet') }}</strong>
              <p>{{ session.sessionId || session.id }}</p>
            </div>
            <div>
              <span>{{ session.model || text('未知模型', 'Model unknown') }}</span>
              <span>{{ formatDate(session.updatedAt) }}</span>
            </div>
            <strong>{{ text(`总 ${session.totalTokens}`, `Total ${session.totalTokens}`) }}</strong>
          </article>
        </div>
        <div v-else class="empty-inline">
          {{ text('当前还没有最近会话。', 'No recent sessions for this agent yet.') }}
        </div>
      </article>

      <article class="agents-data-panel agents-routing-panel">
        <header class="agents-data-panel__head">
          <div>
            <p class="eyebrow">{{ text('ROUTING', 'ROUTING') }}</p>
            <h3>{{ text('路由总览', 'Routing summary') }}</h3>
          </div>
          <button type="button" class="secondary-button compact-button" @click="openBindings">
            {{ text('打开路由页', 'Open Routing') }}
          </button>
        </header>

        <dl class="agents-metric-strip agents-metric-strip--three">
          <div>
            <dt>{{ text('显式路由', 'Explicit routes') }}</dt>
            <dd>{{ detail.bindings.length }}</dd>
          </div>
          <div>
            <dt>{{ text('频道', 'Channels') }}</dt>
            <dd>{{ new Set(detail.bindings.map((binding) => binding.channel).filter(Boolean)).size }}</dd>
          </div>
          <div>
            <dt>{{ text('ACP', 'ACP') }}</dt>
            <dd>{{ detail.bindings.some((binding) => binding.type === 'acp') ? text('有', 'Yes') : text('无', 'No') }}</dd>
          </div>
        </dl>

        <div v-if="detail.bindings.length" class="agents-compact-list agents-route-list">
          <article v-for="binding in detail.bindings.slice(0, 5)" :key="binding.id" class="agents-compact-list-row agents-route-row">
            <div>
              <strong>{{ binding.description || binding.label || binding.id }}</strong>
              <p>{{ binding.comment || binding.ref || text('没有额外备注。', 'No extra comment.') }}</p>
            </div>
            <div>
              <span>{{ binding.channel || text('未设置频道', 'Channel unset') }}</span>
              <span>{{ binding.accountId || text('默认账号', 'Default account') }}</span>
            </div>
            <strong>{{ binding.type === 'acp' ? 'ACP' : text('普通路由', 'Standard') }}</strong>
          </article>
        </div>
        <div v-else class="empty-inline">
          {{ text('当前没有显式路由。', 'No explicit routes yet.') }}
        </div>
      </article>
    </div>
  </section>

  <article v-else class="empty-inline agents-empty-stage">
    <strong>{{ text('请选择一个 Agent', 'Select an agent') }}</strong>
    <p>{{ text('对象列表会持续保留。选中后，顶部任务条会切换到概览、人设、路由、会话或运行任务。', 'The object list stays persistent. After selection, the top task bar switches to overview, persona, routing, sessions, or runtime tasks.') }}</p>
  </article>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AgentDetailPayload } from '../../../../../types/agents';
import StudioSelect from '../../shared/components/StudioSelect.vue';
import { buildAgentHeartbeatConfig, resolveHeartbeatEvery, resolveHeartbeatMode, type HeartbeatMode } from '../../shared/heartbeat-config';
import { useLocalePreference } from '../../shared/locale';
import { fetchAgentDetail, fetchAgentsSummary, updateAgent } from './api';

defineOptions({ name: 'AgentsControlPage' });

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const detail = ref<AgentDetailPayload | null>(null);
const overviewBusy = ref(false);
const overviewMessage = ref('');
const availableModels = ref<string[]>([]);
const quickEdit = reactive({
  enabled: true,
  model: '',
  workspace: '',
  heartbeatMode: 'inherit' as HeartbeatMode,
  heartbeatEvery: '',
});

const agentId = computed(() => {
  const value = route.params.agentId;
  return typeof value === 'string' ? value : '';
});

const modelOptions = computed(() => {
  const models = new Set(availableModels.value);
  if (quickEdit.model.trim()) models.add(quickEdit.model.trim());
  return [
    { value: '', label: text('跟随系统默认', 'Inherit system default') },
    ...Array.from(models).sort().map((model) => ({ value: model, label: model })),
  ];
});
const heartbeatModeOptions = computed(() => [
  { value: 'inherit', label: text('继承全局', 'Inherit global') },
  { value: 'enabled', label: text('启用', 'Enabled') },
  { value: 'disabled', label: text('禁用', 'Disabled') },
]);

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None yet');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function resetQuickEditFromDetail(payload: AgentDetailPayload): void {
  quickEdit.enabled = payload.agent.enabled;
  quickEdit.model = payload.agent.model || '';
  quickEdit.workspace = payload.agent.workspace || '';
  quickEdit.heartbeatMode = resolveHeartbeatMode(payload.editor.heartbeat);
  quickEdit.heartbeatEvery = resolveHeartbeatEvery(payload.editor.heartbeat);
}

async function saveOverviewQuickEdit(): Promise<void> {
  if (!agentId.value || !detail.value) return;
  overviewBusy.value = true;
  overviewMessage.value = '';
  try {
    const response = await updateAgent(agentId.value, {
      enabled: quickEdit.enabled,
      model: quickEdit.model,
      workspace: quickEdit.workspace,
      heartbeat: buildAgentHeartbeatConfig(detail.value.editor.heartbeat, quickEdit.heartbeatMode, quickEdit.heartbeatEvery),
    });
    if (response.detail) {
      detail.value = response.detail;
      resetQuickEditFromDetail(response.detail);
    }
    overviewMessage.value = response.message;
  } catch (error) {
    overviewMessage.value = error instanceof Error ? error.message : text('保存快速修改失败。', 'Failed to save quick edits.');
  } finally {
    overviewBusy.value = false;
  }
}

function openQuickConfig(): void {
  if (!agentId.value) return;
  void router.replace({
    path: route.path,
    query: { ...route.query, overlay: 'quick-config' },
  });
}

function openBindings(): void {
  if (!agentId.value) return;
  void router.push(`/agents/${encodeURIComponent(agentId.value)}/bindings`);
}

function openSessions(): void {
  if (!agentId.value) return;
  void router.push(`/agents/${encodeURIComponent(agentId.value)}/sessions`);
}

function openRuntime(): void {
  if (!agentId.value) return;
  void router.push(`/agents/${encodeURIComponent(agentId.value)}/advanced`);
}

async function loadOverviewDetail(): Promise<void> {
  if (!agentId.value) {
    detail.value = null;
    return;
  }
  const [detailPayload, summaryPayload] = await Promise.all([
    fetchAgentDetail(agentId.value),
    fetchAgentsSummary(),
  ]);
  detail.value = detailPayload;
  availableModels.value = summaryPayload.availableModels || [];
  resetQuickEditFromDetail(detailPayload);
}

watch(
  () => route.params.agentId,
  async () => {
    await loadOverviewDetail();
  },
  { immediate: true },
);

onActivated(async () => {
  await loadOverviewDetail();
});
</script>
