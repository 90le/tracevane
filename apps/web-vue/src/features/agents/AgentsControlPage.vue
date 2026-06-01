<template>
  <section v-if="detail && agentId" class="agents-overview-page">
    <div v-if="overviewMessage" class="status-banner">{{ overviewMessage }}</div>

    <div class="agents-overview-workbench">
      <article class="agents-identity-strip agents-overview-block">
        <div class="agents-section-head">
          <div>
            <h3>{{ text('当前 Agent', 'Current agent') }}</h3>
            <p>{{ text('先看清它是谁、负责什么，再决定是继续快速配置还是切换顶部任务条。', 'Read who this agent is and what it owns first, then decide whether to stay in quick config or switch the top task bar.') }}</p>
          </div>
          <div class="page-actions">
            <button type="button" class="secondary-button compact-button" @click="openQuickConfig">
              {{ text('快速配置', 'Quick Config') }}
            </button>
            <button type="button" class="secondary-button compact-button" @click="openRuntime">
              {{ text('运行配置', 'Runtime') }}
            </button>
          </div>
        </div>

        <div class="agents-overview-identity">
          <div class="agents-overview-identity__copy">
            <p class="eyebrow">{{ text('OPERATOR SNAPSHOT', 'OPERATOR SNAPSHOT') }}</p>
            <h4>{{ detail.agent.identity.role || detail.agent.identity.name || detail.agent.name || detail.agent.id }}</h4>
            <p>
              {{
                detail.agent.identity.mission
                  || detail.agent.identity.style
                  || detail.agent.identity.theme
                  || text('当前还没有补充使命、风格或主题说明。', 'This agent does not have a mission, style, or theme note yet.')
              }}
            </p>
          </div>

          <div class="agents-overview-identity__facts">
            <span v-if="detail.agent.identity.style" class="agents-summary-pill">
              {{ text('风格', 'Style') }} · {{ detail.agent.identity.style }}
            </span>
            <span v-if="detail.agent.identity.theme" class="agents-summary-pill">
              {{ text('主题', 'Theme') }} · {{ detail.agent.identity.theme }}
            </span>
            <span class="agents-summary-pill">
              {{ detail.agent.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}
            </span>
            <span class="agents-summary-pill">
              {{ detail.agent.runtime.type === 'acp' ? 'ACP' : text('默认运行时', 'Default runtime') }}
            </span>
            <span v-if="detail.agent.isDefault" class="agents-summary-pill">
              {{ text('默认入口 Agent', 'Default entry agent') }}
            </span>
          </div>
        </div>

        <div class="agents-overview-quick-edit">
          <div class="agents-stage-task-head operate-stage-task-head">
            <div>
              <p class="eyebrow">{{ text('QUICK EDIT', 'QUICK EDIT') }}</p>
              <h3>{{ text('高频快改', 'High-frequency quick edits') }}</h3>
              <p>{{ text('概览页保留启用、模型、工作区和 HEARTBEAT 这几项高频字段。', 'The overview keeps enabled state, model, workspace, and HEARTBEAT as high-frequency edits.') }}</p>
            </div>

            <div class="page-actions">
              <button type="button" class="secondary-button compact-button" :disabled="overviewBusy" @click="resetQuickEditFromDetail(detail)">
                {{ text('重置', 'Reset') }}
              </button>
              <button type="button" class="primary-button compact-button" :disabled="overviewBusy" @click="saveOverviewQuickEdit">
                {{ overviewBusy ? text('保存中...', 'Saving...') : text('保存快改', 'Save quick edits') }}
              </button>
            </div>
          </div>

          <div class="agents-form-grid">
            <label class="option-row form-field-full">
              <input v-model="quickEdit.enabled" class="form-checkbox" type="checkbox" />
              <div>
                <strong>{{ text('启用状态', 'Enabled') }}</strong>
                <span>{{ text('高频启用切换保留在概览页，复杂运行策略继续留在运行配置。', 'High-frequency enablement stays on the overview, while complex runtime policy remains in Runtime.') }}</span>
              </div>
            </label>

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

            <section class="config-subsection form-field-full agents-heartbeat-config">
              <div class="config-subsection-head">
                <h4>{{ text('内置 HEARTBEAT', 'Built-in HEARTBEAT') }}</h4>
                <p>{{ text('Heartbeat 不是 cron。继承会移除这个 Agent 的 heartbeat 块；禁用会写入 every: "0m"。', 'Heartbeat is not cron. Inherit removes this agent heartbeat block; disabled writes every: "0m".') }}</p>
              </div>
              <div class="agents-form-grid">
                <div class="form-field">
                  <label class="form-label">{{ text('心跳策略', 'Heartbeat policy') }}</label>
                  <StudioSelect v-model="quickEdit.heartbeatMode" :options="heartbeatModeOptions" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('心跳周期', 'Heartbeat interval') }}</label>
                  <input v-model="quickEdit.heartbeatEvery" class="form-input" :disabled="quickEdit.heartbeatMode !== 'enabled'" placeholder="30m" />
                  <span class="field-hint">{{ text('例如 10m / 30m / 1h。target: none 不会关闭模型心跳消耗。', 'For example 10m / 30m / 1h. target: none does not stop model-consuming heartbeat turns.') }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>

      </article>

      <article class="agents-insight-pane agents-overview-block">
        <div class="agents-section-head">
          <div>
            <h3>{{ text('会话热度', 'Session Heat') }}</h3>
            <p>{{ text('概览页只显示热度与入口，清理和逐条查看放在会话页。', 'The overview only shows heat and entry points; cleanup and item-by-item inspection stay on the sessions page.') }}</p>
          </div>
          <div class="page-actions">
            <button type="button" class="secondary-button compact-button" @click="openSessions">
              {{ text('打开会话页', 'Open Sessions') }}
            </button>
          </div>
        </div>

        <div class="agents-metrics-grid compact">
          <div class="agents-stat-cell">
            <span>{{ text('会话数', 'Sessions') }}</span>
            <strong>{{ detail.sessions.count }}</strong>
          </div>
          <div class="agents-stat-cell">
            <span>{{ text('输入 Tokens', 'Input tokens') }}</span>
            <strong>{{ detail.sessions.inputTokens }}</strong>
          </div>
          <div class="agents-stat-cell">
            <span>{{ text('输出 Tokens', 'Output tokens') }}</span>
            <strong>{{ detail.sessions.outputTokens }}</strong>
          </div>
          <div class="agents-stat-cell">
            <span>{{ text('最后路由', 'Last Route') }}</span>
            <strong>{{ detail.sessions.lastRoute || text('暂无', 'None yet') }}</strong>
          </div>
        </div>

        <div v-if="detail.recentSessions.length" class="agents-binding-session-list">
          <article
            v-for="session in detail.recentSessions.slice(0, 3)"
            :key="session.id"
            class="agents-binding-session-row"
          >
            <div>
              <strong>{{ session.lastRoute || session.routeKey || text('暂无路由', 'No route yet') }}</strong>
              <p>{{ session.model || text('未记录模型', 'Model unknown') }}</p>
            </div>
            <div>
              <strong>{{ text(`总 ${session.totalTokens}`, `Total ${session.totalTokens}`) }}</strong>
              <p>{{ formatDate(session.updatedAt) }}</p>
            </div>
          </article>
        </div>
        <div v-else class="empty-inline">
          {{ text('当前还没有最近会话。', 'No recent sessions for this agent yet.') }}
        </div>
      </article>

      <article class="agents-insight-pane agents-overview-block">
        <div class="agents-section-head">
          <div>
            <h3>{{ text('路由总览', 'Routing Summary') }}</h3>
            <p>{{ text('这里只看入口是否接对、接到了哪个频道和账号；真正的增删改继续放在路由页。', 'This overview only confirms whether routes point to the right channels and accounts; actual create, edit, and delete work stays on the routing page.') }}</p>
          </div>
          <div class="page-actions">
            <button type="button" class="secondary-button compact-button" @click="openBindings">
              {{ text('打开路由页', 'Open Routing') }}
            </button>
          </div>
        </div>

        <div class="agents-overview-binding-stats">
          <span class="agents-summary-pill">
            {{ text(`显式路由 ${detail.bindings.length}`, `Explicit routes ${detail.bindings.length}`) }}
          </span>
          <span class="agents-summary-pill">
            {{
              text(
                `频道 ${new Set(detail.bindings.map((binding) => binding.channel).filter(Boolean)).size}`,
                `Channels ${new Set(detail.bindings.map((binding) => binding.channel).filter(Boolean)).size}`,
              )
            }}
          </span>
          <span class="agents-summary-pill">
            {{ detail.bindings.some((binding) => binding.type === 'acp') ? 'ACP' : text('无 ACP', 'No ACP') }}
          </span>
        </div>

        <div v-if="detail.bindings.length" class="agents-binding-list">
          <article v-for="binding in detail.bindings.slice(0, 4)" :key="binding.id" class="agents-binding-row">
            <div class="agents-binding-main">
              <strong>{{ binding.description || binding.label || binding.id }}</strong>
              <p>{{ binding.comment || text('没有额外备注。', 'No extra comment.') }}</p>
              <div class="agents-binding-main__facts">
                <span>{{ text('频道', 'Channel') }}: {{ binding.channel || text('未设置', 'Unset') }}</span>
                <span>{{ text('账号', 'Account') }}: {{ binding.accountId || text('默认', 'Default') }}</span>
                <span v-if="binding.peerKind || binding.peerId">{{ text('目标', 'Peer') }}: {{ binding.peerKind || text('未设置', 'Unset') }} {{ binding.peerId || '' }}</span>
              </div>
            </div>
            <div class="agents-binding-meta">
              <span>{{ binding.type === 'acp' ? 'ACP' : text('普通路由', 'Standard') }}</span>
              <span v-if="binding.roles.length">{{ text('角色', 'Roles') }}: {{ binding.roles.join(', ') }}</span>
              <span v-if="binding.mode">{{ text('模式', 'Mode') }}: {{ binding.mode }}</span>
              <span v-if="binding.backend">{{ text('后端', 'Backend') }}: {{ binding.backend }}</span>
            </div>
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

const modelOptions = computed(() => [
  { value: '', label: text('跟随系统默认', 'Inherit system default') },
  ...availableModels.value.map((model) => ({ value: model, label: model })),
]);
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
