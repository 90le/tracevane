<template>
  <section class="page-shell agents-workspace-shell operate-workspace-shell">
    <header class="page-header-row agents-workspace-head">
      <div>
        <p class="eyebrow">{{ managementEntry?.label || 'Agents' }}</p>
        <h2 class="page-title">{{ text(`${managementEntry?.label || 'Agent'} 工作台`, `${managementEntry?.label || 'Agents'} Workspace`) }}</h2>
        <p class="page-copy">
          {{ text('左侧持续保留 Agent rail，右侧切换概览、文档、绑定、会话和高级配置，避免页面跳转后丢失上下文。', 'Keep the agent rail persistent on the left while the right stage switches between overview, docs, bindings, sessions, and advanced settings.') }}
        </p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="summaryLoading" @click="refreshSummary(routeAgentId)">
          {{ summaryLoading ? text('刷新中...', 'Refreshing...') : text('刷新 Agents', 'Refresh Agents') }}
        </button>
        <button type="button" class="primary-button" @click="openCreateModal">
          {{ text('新增 Agent', 'Add Agent') }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div
      v-else-if="noticeMessage"
      class="status-banner"
      :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'"
    >
      {{ noticeMessage.text }}
    </div>

    <div class="agents-workspace-layout">
      <aside class="panel-card agents-workspace-sidebar operate-resource-rail operate-workspace-surface mobile-resource-drawer">
        <div class="agents-workspace-sidebar__head">
          <div>
            <p class="eyebrow">{{ text('ROSTER', 'ROSTER') }}</p>
            <h3>{{ text('Agent 列表', 'Agent roster') }}</h3>
            <p class="panel-muted">
              {{
                summary?.count
                  ? text(`共 ${summary.count} 个 Agent`, `${summary.count} agents`)
                  : text('先选择一个 Agent 进入右侧工作台。', 'Select an agent to open the workspace.')
              }}
            </p>
          </div>
        </div>

        <label class="form-field">
          <span class="form-label">{{ text('搜索', 'Search') }}</span>
          <input
            v-model="searchQuery"
            class="form-input"
            type="search"
            :placeholder="text('按名称、ID、角色、模型搜索', 'Search by name, id, role, or model')"
          />
        </label>

        <div class="agents-workspace-filters">
          <button
            v-for="chip in statusFilterChips"
            :key="chip.value"
            type="button"
            class="agent-filter-chip"
            :class="{ active: statusFilter === chip.value }"
            :aria-pressed="String(statusFilter === chip.value)"
            @click="statusFilter = chip.value"
          >
            {{ chip.label }}
            <span class="agent-filter-chip__count">{{ chip.count }}</span>
          </button>
        </div>

        <div v-if="filteredAgents.length" class="agent-rail-list">
          <section v-if="defaultRailAgents.length" class="agent-rail-group">
            <div class="agent-rail-group__head">
              <strong>{{ text('默认入口 Agent', 'Default entry agent') }}</strong>
              <span>{{ text('这是一个真实 Agent，不是 agents.defaults 配置模板。未指定目标的会话会优先落到这里。', 'This is a real agent, not the agents.defaults template. Untargeted sessions land here first.') }}</span>
            </div>
            <AgentRailItem
              v-for="agent in defaultRailAgents"
              :key="agent.id"
              :agent="agent"
              :selected="agent.id === routeAgentId"
              @select="openAgent(agent.id)"
            />
          </section>

          <section v-if="regularRailAgents.length" class="agent-rail-group">
            <div class="agent-rail-group__head">
              <strong>{{ text('其它 Agent', 'Other agents') }}</strong>
              <span>{{ text('按角色、频道绑定或手动选择进入。', 'Reached by role, channel binding, or manual selection.') }}</span>
            </div>
            <AgentRailItem
              v-for="agent in regularRailAgents"
              :key="agent.id"
              :agent="agent"
              :selected="agent.id === routeAgentId"
              @select="openAgent(agent.id)"
            />
          </section>
        </div>
        <div v-else-if="summaryLoading" class="empty-inline">
          {{ text('正在读取 Agent 列表…', 'Loading agents...') }}
        </div>
        <div v-else class="empty-inline">
          {{ text('没有符合当前筛选条件的 Agent。', 'No agents match the current filters.') }}
        </div>
      </aside>

      <section class="agents-workspace-stage operate-stage">
        <article class="panel-card agents-stage-header operate-workspace-surface">
          <div v-if="selectedAgent" class="agents-stage-header__body operate-stage-task-head">
            <div class="agents-stage-header__identity">
              <span class="agents-stage-header__avatar" aria-hidden="true">
                <AgentAvatarContent
                  :avatar="selectedAgent.identity.avatar"
                  :emoji="selectedAgent.identity.emoji"
                  :fallback="selectedAgent.identity.name || selectedAgent.name || selectedAgent.id"
                  :alt="selectedAgent.identity.name || selectedAgent.name || selectedAgent.id"
                />
              </span>

              <div class="agents-stage-header__copy">
                <p class="eyebrow">{{ selectedAgent.id }}</p>
                <h3>{{ selectedAgent.identity.name || selectedAgent.name || selectedAgent.id }}</h3>
                <p class="agents-stage-header__role">
                  {{ selectedAgent.identity.role || text('这个 Agent 还没有填写角色说明。', 'This agent does not have a role description yet.') }}
                </p>
                <p v-if="selectedAgent.identity.mission" class="agents-stage-header__mission">
                  {{ selectedAgent.identity.mission }}
                </p>
              </div>
            </div>

            <div class="agents-stage-header__actions">
              <button type="button" class="secondary-button compact-button" @click="openQuickConfig()">
                {{ text('快速配置', 'Quick Config') }}
              </button>
              <button type="button" class="primary-button compact-button" @click="startAgentSession(routeAgentId)">
                {{ text('发起会话', 'Start Session') }}
              </button>
            </div>

            <div class="agents-stage-header__facts operate-fact-strip">
              <span class="agents-summary-pill operate-summary-pill">{{ selectedAgent.model || text('系统默认模型', 'System model') }}</span>
              <span class="agents-summary-pill operate-summary-pill">{{ selectedAgent.runtime.type === 'acp' ? 'ACP' : text('默认运行时', 'Default runtime') }}</span>
              <span class="agents-summary-pill operate-summary-pill">{{ text(`${selectedAgent.sessionCount} 个会话`, `${selectedAgent.sessionCount} sessions`) }}</span>
              <span class="agents-summary-pill operate-summary-pill">{{ text(`${selectedAgent.bindingCount} 条绑定`, `${selectedAgent.bindingCount} bindings`) }}</span>
              <span class="agents-summary-pill operate-summary-pill operate-badge">{{ selectedAgent.workspace || text('未设置工作区', 'Workspace unset') }}</span>
            </div>
          </div>
          <div v-else class="agents-stage-empty">
            <strong>{{ text('请选择一个 Agent', 'Select an agent') }}</strong>
                <p>{{ text('左侧 rail 会一直保留，右侧 stage 根据当前 Agent 切换概览和工作区标签。', 'The left rail stays persistent while the right stage switches between overview and workspace tabs for the selected agent.') }}</p>
          </div>

          <nav v-if="selectedAgent" class="agents-stage-tabs mobile-stage-tabs" :aria-label="text('Agent 页面', 'Agent pages')">
            <button
              v-for="tab in stageTabs"
              :key="tab.value"
              type="button"
              class="agents-stage-tab"
              :class="{ active: activeSection === tab.value }"
              @click="openAgent(routeAgentId, tab.value)"
            >
              <component :is="tab.icon" class="agents-stage-tab-icon" aria-hidden="true" />
              <span>{{ tab.label }}</span>
            </button>
          </nav>
        </article>

        <RouterView v-slot="{ Component, route: childRoute }">
          <component
            v-if="Component"
            :is="Component"
            :key="childRoute.path"
          />
        </RouterView>
      </section>
    </div>

    <AgentQuickConfigDialog
      :quick-config-open="activeOverlay === 'quick-config' && Boolean(detail?.agent.id)"
      :busy="saveBusy"
      :agent-id="detail?.agent.id || routeAgentId"
      :fallback-name="detail?.agent.identity.name || detail?.agent.name || ''"
      :initial="quickConfigInitial"
      :model-options="modelOptions"
      :runtime-type-options="runtimeTypeOptions"
      :sandbox-mode-options="sandboxModeOptions"
      :workspace-access-options="workspaceAccessOptions"
      :tools-profile-options="toolsProfileOptions"
      @close="closeOverlay"
      @save="saveQuickConfig"
      @open-docs="closeOverlay(); openAgent(routeAgentId, 'docs')"
      @open-bindings="closeOverlay(); openAgent(routeAgentId, 'bindings')"
      @open-advanced="closeOverlay(); openAgent(routeAgentId, 'advanced')"
    />

    <Teleport to="body">
      <div v-if="activeOverlay === 'create'" class="agents-modal-mask" @click.self="closeOverlay">
        <div class="agents-modal" role="dialog" aria-modal="true" :aria-label="text('新增 Agent', 'Create Agent')">
          <div class="agents-modal-head">
            <div>
              <h3>{{ text('新增 Agent', 'Create Agent') }}</h3>
              <p>{{ text('先创建一个最小可用 Agent，再去右侧 stage 补全文档、绑定和高级配置。', 'Create a minimum viable agent first, then use the right stage to complete docs, bindings, and advanced settings.') }}</p>
            </div>
            <button type="button" class="agents-modal-close" :aria-label="text('关闭', 'Close')" @click="closeOverlay">✕</button>
          </div>

          <div class="agents-modal-body">
            <div class="agents-form-grid">
              <div class="form-field">
                <label class="form-label">{{ text('Agent ID', 'Agent ID') }}</label>
                <input v-model="createForm.id" class="form-input" :placeholder="text('例如 frontend', 'For example frontend')" />
                <span class="field-hint">{{ text('仅允许小写字母、数字、下划线和连字符。', 'Only lowercase letters, numbers, underscores, and hyphens are allowed.') }}</span>
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('显示名称', 'Display Name') }}</label>
                <input v-model="createForm.name" class="form-input" :placeholder="text('例如 像素', 'For example Pixel')" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('模型', 'Model') }}</label>
                <GlassSelect v-model="createForm.model" :options="modelOptions" :placeholder="text('跟随系统默认', 'Inherit system default')" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('Emoji', 'Emoji') }}</label>
                <input v-model="createForm.identityEmoji" class="form-input" :placeholder="text('例如 agent-mark', 'For example agent-mark')" />
              </div>

              <AvatarFieldEditor
                v-model="createForm.identityAvatar"
                class="form-field-full"
                :label="text('Avatar', 'Avatar')"
                :placeholder="text('emoji / 短文本 / 图片 URL / data URI', 'emoji / short text / image URL / data URI')"
                :preview-fallback="createForm.name || createForm.id || 'A'"
              />

              <div class="form-field form-field-full">
                <label class="form-label">{{ text('工作区路径', 'Workspace Path') }}</label>
                <input v-model="createForm.workspace" class="form-input" :placeholder="text('默认会自动使用 workspace-{agentId}', 'Defaults to workspace-{agentId}')" />
              </div>
            </div>

            <details class="config-collapsible">
              <summary class="config-collapsible-summary">
                <strong>{{ text('高级选项', 'Advanced Options') }}</strong>
                <span class="config-collapsible-meta">{{ text('需要时再展开，避免第一次创建就看到过多字段。', 'Expand only when needed so the first-run form stays compact.') }}</span>
              </summary>

              <div class="settings-stack settings-stack-spaced">
                <div class="agents-form-grid">
                  <div class="form-field">
                    <label class="form-label">{{ text('角色', 'Role') }}</label>
                    <input v-model="createForm.identityRole" class="form-input" :placeholder="text('例如 前端实现 agent', 'For example Frontend implementation agent')" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('风格', 'Style') }}</label>
                    <input v-model="createForm.identityStyle" class="form-input" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('主题', 'Theme') }}</label>
                    <input v-model="createForm.identityTheme" class="form-input" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('沙盒模式', 'Sandbox Mode') }}</label>
                    <GlassSelect v-model="createForm.sandboxMode" :options="sandboxModeOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('工作区访问', 'Workspace Access') }}</label>
                    <GlassSelect v-model="createForm.workspaceAccess" :options="workspaceAccessOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('工具配置', 'Tools Profile') }}</label>
                    <GlassSelect v-model="createForm.toolsProfile" :options="toolsProfileOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('Thinking 默认值', 'Thinking Default') }}</label>
                    <GlassSelect v-model="createForm.thinkingDefault" :options="thinkingDefaultOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('Verbose 默认值', 'Verbose Default') }}</label>
                    <GlassSelect v-model="createForm.verboseDefault" :options="verboseDefaultOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('Reasoning 默认值', 'Reasoning Default') }}</label>
                    <GlassSelect v-model="createForm.reasoningDefault" :options="reasoningDefaultOptions" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('Fast Mode 默认值', 'Fast Mode Default') }}</label>
                    <GlassSelect v-model="createForm.fastModeDefault" :options="fastModeDefaultOptions" />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('使命说明', 'Mission') }}</label>
                    <textarea v-model="createForm.identityMission" class="form-textarea" rows="4" />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('System Prompt Override', 'System Prompt Override') }}</label>
                    <textarea v-model="createForm.systemPromptOverride" class="form-textarea" rows="4" />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('Skills', 'Skills') }}</label>
                    <textarea v-model="createForm.skillsText" class="form-textarea" rows="3" :placeholder="text('每行一个 skill，留空表示继承默认值。', 'One skill per line. Leave empty to inherit defaults.')" />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('模型 JSON 覆盖', 'Model JSON Override') }}</label>
                    <textarea v-model="createForm.modelRawText" class="form-textarea agents-json-textarea" rows="6" :placeholder="text('需要对象型模型配置时填写；留空则使用上方简单模型选择。', 'Use this when you need object-style model config; leave empty to use the simple model selector above.')" />
                  </div>
                  <label class="toggle-card">
                    <input v-model="createForm.fsWorkspaceOnly" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('仅限工作区文件访问', 'Workspace-only FS access') }}</strong>
                      <span>{{ text('为新 Agent 保守起见，默认建议开启。', 'Recommended as a conservative default for new agents.') }}</span>
                    </div>
                  </label>
                  <div class="form-field">
                    <label class="form-label">{{ text('运行时类型', 'Runtime Type') }}</label>
                    <GlassSelect v-model="createForm.runtimeType" :options="runtimeTypeOptions" />
                  </div>
                  <template v-if="createForm.runtimeType === 'acp'">
                    <div class="form-field">
                      <label class="form-label">{{ text('ACP 后端', 'ACP Backend') }}</label>
                      <GlassSelect v-model="createForm.runtimeBackend" :options="runtimeBackendOptions" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">{{ text('ACP Agent', 'ACP Agent') }}</label>
                      <GlassSelect
                        v-model="createForm.runtimeAgent"
                        :options="createRuntimeAgentOptions"
                        :disabled="!hasConfiguredAcpAgents && !createForm.runtimeAgent"
                        :placeholder="hasConfiguredAcpAgents ? text('选择允许的 ACP Agent', 'Select an allowed ACP agent') : text('先到系统配置 > ACP 设置允许的执行器', 'Configure allowed harnesses in System Config > ACP first')"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label">{{ text('模式', 'Mode') }}</label>
                      <GlassSelect v-model="createForm.runtimeMode" :options="runtimeModeOptions" />
                    </div>
                    <div class="form-field form-field-full">
                      <label class="form-label">{{ text('运行目录', 'Runtime CWD') }}</label>
                      <input v-model="createForm.runtimeCwd" class="form-input" :placeholder="createForm.workspace" />
                    </div>
                  </template>
                </div>
              </div>
            </details>
          </div>

          <div class="agents-modal-foot">
            <button type="button" class="secondary-button" :disabled="createBusy" @click="closeOverlay">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="createBusy" @click="submitCreateAgent">
              {{ createBusy ? text('创建中...', 'Creating...') : text('创建 Agent', 'Create Agent') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { BookOpen, Braces, Link2, MessageSquare, SlidersHorizontal } from '@lucide/vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import type { AgentCreatePayload, AgentDetailPayload, AgentsSummaryPayload } from '../../../../../types/agents';
import type { ConfigSummaryPayload } from '../../../../../types/config';
import type { ManagementDomainDefinition } from '../management/management-domain-manifest';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import AvatarFieldEditor from '../../shared/components/AvatarFieldEditor.vue';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { createAgent, fetchAgentDetail, fetchAgentsSummary, updateAgent } from './api';
import { buildAgentRosterSummary } from './agent-workspace-summary';
import AgentQuickConfigDialog from './AgentQuickConfigDialog.vue';
import AgentRailItem from './AgentRailItem.vue';
import { fetchConfigSummary } from '../config/api';

interface NoticeMessage {
  kind: 'success' | 'error';
  text: string;
}

const VALID_TOOLS_PROFILES = ['minimal', 'coding', 'messaging', 'full'] as const;
type ToolProfileValue = typeof VALID_TOOLS_PROFILES[number];

function normalizeToolsProfile(value: string | null | undefined, fallback: ToolProfileValue = 'full'): ToolProfileValue {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'standard') return 'full';
  return (VALID_TOOLS_PROFILES as readonly string[]).includes(normalized)
    ? normalized as ToolProfileValue
    : fallback;
}

defineOptions({ name: 'AgentsWorkspaceLayout' });

const props = defineProps<{
  managementEntry?: ManagementDomainDefinition;
}>();

const router = useRouter();
const route = useRoute();
const { text } = useLocalePreference();
const managementEntry = computed(() => props.managementEntry);

const summary = ref<AgentsSummaryPayload | null>(null);
const configSummary = ref<ConfigSummaryPayload | null>(null);
const detail = ref<AgentDetailPayload | null>(null);
const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'default' | 'disabled' | 'acp'>('all');
const summaryLoading = ref(false);
const detailLoading = ref(false);
const saveBusy = ref(false);
const createBusy = ref(false);
const errorMessage = ref('');
const noticeMessage = ref<NoticeMessage | null>(null);
let detailRequestSequence = 0;

const routeAgentId = computed(() => {
  const value = route.params.agentId;
  return typeof value === 'string' ? value : '';
});
const isAgentsRouteActive = computed(() => route.path === '/agents' || route.path.startsWith('/agents/'));

const selectedAgentId = computed(() => routeAgentId.value);

const activeOverlay = computed(() => {
  const value = route.query.overlay;
  return typeof value === 'string' ? value : '';
});

const activeSection = computed<'overview' | 'docs' | 'bindings' | 'sessions' | 'advanced'>(() => {
  if (/\/docs$/.test(route.path)) return 'docs';
  if (/\/bindings$/.test(route.path)) return 'bindings';
  if (/\/sessions$/.test(route.path)) return 'sessions';
  if (/\/advanced$/.test(route.path)) return 'advanced';
  return 'overview';
});

const stageTabs = computed(() => [
  { value: 'overview' as const, label: text('概览', 'Overview'), icon: SlidersHorizontal },
  { value: 'docs' as const, label: text('文档', 'Docs'), icon: BookOpen },
  { value: 'bindings' as const, label: text('绑定', 'Bindings'), icon: Link2 },
  { value: 'sessions' as const, label: text('会话', 'Sessions'), icon: MessageSquare },
  { value: 'advanced' as const, label: text('高级', 'Advanced'), icon: Braces },
]);

const selectedAgent = computed(() => {
  return (summary.value?.agents || []).find((agent) => agent.id === selectedAgentId.value) || null;
});

const statusFilterCounts = computed(() => {
  const agents = summary.value?.agents || [];
  return {
    all: agents.length,
    active: agents.filter((agent) => agent.sessionCount > 0 && agent.enabled !== false).length,
    default: agents.filter((agent) => agent.isDefault).length,
    disabled: agents.filter((agent) => agent.enabled === false).length,
    acp: agents.filter((agent) => agent.runtime.type === 'acp').length,
  };
});

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value || 0);
}

const statusFilterChips = computed(() => [
  { value: 'all' as const, label: text('全部', 'All'), count: formatNumber(statusFilterCounts.value.all) },
  { value: 'active' as const, label: text('活跃', 'Active'), count: formatNumber(statusFilterCounts.value.active) },
  { value: 'default' as const, label: text('默认', 'Default'), count: formatNumber(statusFilterCounts.value.default) },
  { value: 'disabled' as const, label: text('停用', 'Disabled'), count: formatNumber(statusFilterCounts.value.disabled) },
  { value: 'acp' as const, label: 'ACP', count: formatNumber(statusFilterCounts.value.acp) },
]);

const filteredAgents = computed(() => {
  let items = [...(summary.value?.agents || [])];
  const keyword = searchQuery.value.trim().toLowerCase();
  if (keyword) {
    items = items.filter((agent) => {
      return [
        agent.id,
        agent.name,
        agent.identity.name,
        agent.identity.role,
        agent.model,
      ].some((field) => String(field || '').toLowerCase().includes(keyword));
    });
  }

  if (statusFilter.value === 'active') {
    items = items.filter((agent) => agent.sessionCount > 0 && agent.enabled !== false);
  } else if (statusFilter.value === 'default') {
    items = items.filter((agent) => agent.isDefault);
  } else if (statusFilter.value === 'disabled') {
    items = items.filter((agent) => agent.enabled === false);
  } else if (statusFilter.value === 'acp') {
    items = items.filter((agent) => agent.runtime.type === 'acp');
  }

  items.sort((a, b) => {
    const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return bTime - aTime;
  });
  return items;
});

const rosterSummary = computed(() =>
  buildAgentRosterSummary({
    agents: filteredAgents.value,
    defaultAgentId: summary.value?.defaultAgentId,
  }),
);

const defaultRailAgents = computed(() => rosterSummary.value.defaultRailAgents);
const regularRailAgents = computed(() => rosterSummary.value.regularRailAgents);

const modelOptions = computed(() => {
  const options = [{ value: '', label: text('跟随系统默认', 'Inherit system default') }];
  for (const model of summary.value?.availableModels || []) {
    options.push({ value: model, label: model });
  }
  return options;
});

const sandboxModeOptions = computed(() => [
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'agent', label: text('仅 Agent', 'Agent only') },
  { value: 'all', label: text('全部会话', 'All sessions') },
  { value: 'non-main', label: text('仅非主会话', 'Non-main only') },
]);

const workspaceAccessOptions = computed(() => [
  { value: 'ro', label: text('只读', 'Read-only') },
  { value: 'rw', label: text('读写', 'Read-write') },
]);

const toolsProfileOptions = computed(() => [
  { value: 'full', label: text('完整', 'Full') },
  { value: 'coding', label: text('编码', 'Coding') },
  { value: 'messaging', label: text('消息', 'Messaging') },
  { value: 'minimal', label: text('极简', 'Minimal') },
]);

const thinkingDefaultOptions = computed(() => [
  { value: '', label: text('跟随系统默认', 'Inherit system default') },
  { value: 'off', label: 'off' },
  { value: 'minimal', label: 'minimal' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'xhigh', label: 'xhigh' },
  { value: 'adaptive', label: 'adaptive' },
]);

const verboseDefaultOptions = computed(() => [
  { value: '', label: text('跟随系统默认', 'Inherit system default') },
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on' },
  { value: 'full', label: 'full' },
]);

const reasoningDefaultOptions = computed(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on' },
  { value: 'stream', label: 'stream' },
]);

const fastModeDefaultOptions = computed(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on' },
]);

const runtimeTypeOptions = computed(() => [
  { value: 'default', label: text('默认运行时', 'Default runtime') },
  { value: 'acp', label: text('ACP 运行时', 'ACP runtime') },
]);

const runtimeBackendOptions = computed(() => [{ value: 'acpx', label: 'acpx' }]);
const runtimeModeOptions = computed(() => [
  { value: 'persistent', label: text('持久', 'Persistent') },
  { value: 'oneshot', label: text('单次', 'Oneshot') },
]);

function buildAcpAgentOptions(current = ''): Array<{ value: string; label: string }> {
  const configured = configSummary.value?.acp?.allowedAgents || [];
  const values = Array.from(new Set([...configured, current].map((item) => String(item || '').trim()).filter(Boolean)));
  return values.map((value) => ({
    value,
    label: configured.includes(value)
      ? value
      : text(`${value}（当前值，未在允许列表中）`, `${value} (current, not in allowlist)`),
  }));
}

const createRuntimeAgentOptions = computed(() => buildAcpAgentOptions(createForm.runtimeAgent));
const hasConfiguredAcpAgents = computed(() => (configSummary.value?.acp?.allowedAgents || []).length > 0);

const quickConfigInitial = computed(() => {
  if (!detail.value) return null;
  return {
    name: detail.value.editor.name || detail.value.agent.identity.name || detail.value.agent.name || '',
    model: detail.value.editor.model || detail.value.agent.model || '',
    runtimeType: detail.value.editor.runtime.type === 'acp' ? 'acp' : 'default',
    workspace: detail.value.editor.workspace || detail.value.agent.workspace || '',
    role: detail.value.editor.identity.role || detail.value.agent.identity.role || '',
    emoji: detail.value.editor.identity.emoji || detail.value.agent.identity.emoji || '',
    avatar: detail.value.editor.identity.avatar || detail.value.agent.identity.avatar || '',
    sandboxMode: detail.value.editor.sandboxMode || detail.value.agent.sandboxMode || 'off',
    workspaceAccess: detail.value.editor.workspaceAccess || detail.value.agent.workspaceAccess || 'rw',
    toolsProfile: normalizeToolsProfile(detail.value.editor.toolsProfile || detail.value.agent.toolsProfile || ''),
    fsWorkspaceOnly: detail.value.editor.fsWorkspaceOnly === true || detail.value.agent.fsWorkspaceOnly === true,
  };
});

const createForm = reactive({
  id: '',
  name: '',
  model: '',
  modelRawText: '',
  workspace: '',
  sandboxMode: 'off',
  workspaceAccess: 'rw',
  toolsProfile: 'full',
  fsWorkspaceOnly: false,
  thinkingDefault: '',
  verboseDefault: '',
  reasoningDefault: '',
  fastModeDefault: '',
  systemPromptOverride: '',
  skillsText: '',
  runtimeType: 'default',
  runtimeBackend: 'acpx',
  runtimeAgent: '',
  runtimeMode: 'persistent',
  runtimeCwd: '',
  identityEmoji: '',
  identityAvatar: '',
  identityRole: '',
  identityStyle: '',
  identityTheme: '',
  identityMission: '',
});

function setNotice(kind: NoticeMessage['kind'], message: string): void {
  noticeMessage.value = { kind, text: message };
}

function parseSkillsText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseOptionalJsonObject(label: string, value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(text(`${label} 不是合法 JSON。`, `${label} is not valid JSON.`));
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(text(`${label} 必须是 JSON 对象。`, `${label} must be a JSON object.`));
  }
  return parsed as Record<string, unknown>;
}

function buildAgentPath(agentId: string, section: 'overview' | 'docs' | 'bindings' | 'sessions' | 'advanced' = activeSection.value): string {
  const encoded = encodeURIComponent(agentId);
  if (section === 'docs') return `/agents/${encoded}/docs`;
  if (section === 'bindings') return `/agents/${encoded}/bindings`;
  if (section === 'sessions') return `/agents/${encoded}/sessions`;
  if (section === 'advanced') return `/agents/${encoded}/advanced`;
  return `/agents/${encoded}`;
}

function closeOverlay(): void {
  const query = { ...route.query };
  delete query.overlay;
  void router.replace({ path: route.path, query });
}

function openCreateModal(): void {
  resetCreateForm();
  void router.replace({
    path: route.path,
    query: { ...route.query, overlay: 'create' },
  });
}

function openQuickConfig(): void {
  if (!routeAgentId.value) return;
  void router.replace({
    path: route.path,
    query: { ...route.query, overlay: 'quick-config' },
  });
}

function openAgent(agentId: string, section: 'overview' | 'docs' | 'bindings' | 'sessions' | 'advanced' = 'overview'): void {
  if (!agentId) return;
  const query = { ...route.query };
  delete query.overlay;
  void router.push({ path: buildAgentPath(agentId, section), query });
}

function startAgentSession(agentId: string): void {
  if (!agentId) return;
  void router.push({ path: '/chat', query: { agentId } });
}

function resetCreateForm(): void {
  createForm.id = '';
  createForm.name = '';
  createForm.model = '';
  createForm.modelRawText = '';
  createForm.workspace = '';
  createForm.sandboxMode = configSummary.value?.sandbox.mode || 'off';
  createForm.workspaceAccess = 'rw';
  createForm.toolsProfile = configSummary.value?.tools.profile || 'full';
  createForm.fsWorkspaceOnly = configSummary.value?.tools.fsWorkspaceOnly === true;
  createForm.thinkingDefault = '';
  createForm.verboseDefault = '';
  createForm.reasoningDefault = '';
  createForm.fastModeDefault = '';
  createForm.systemPromptOverride = '';
  createForm.skillsText = '';
  createForm.runtimeType = 'default';
  createForm.runtimeBackend = 'acpx';
  createForm.runtimeAgent = '';
  createForm.runtimeMode = 'persistent';
  createForm.runtimeCwd = '';
  createForm.identityEmoji = '';
  createForm.identityAvatar = '';
  createForm.identityRole = '';
  createForm.identityStyle = '';
  createForm.identityTheme = '';
  createForm.identityMission = '';
}

function buildCreatePayload(): AgentCreatePayload {
  const workspace = createForm.workspace.trim();
  const name = createForm.name.trim();
  const model = createForm.model.trim();
  const modelRaw = parseOptionalJsonObject('Model JSON', createForm.modelRawText);
  const skills = parseSkillsText(createForm.skillsText);

  const payload: AgentCreatePayload = {
    id: createForm.id.trim(),
    sandboxMode: createForm.sandboxMode,
    workspaceAccess: createForm.workspaceAccess,
    toolsProfile: normalizeToolsProfile(createForm.toolsProfile, 'full'),
    fsWorkspaceOnly: createForm.fsWorkspaceOnly,
    thinkingDefault: createForm.thinkingDefault,
    verboseDefault: createForm.verboseDefault,
    reasoningDefault: createForm.reasoningDefault,
    fastModeDefault: createForm.fastModeDefault,
    modelRaw,
    systemPromptOverride: createForm.systemPromptOverride.trim(),
    skills,
  };

  if (name) payload.name = name;
  if (model && !modelRaw) payload.model = model;
  if (workspace) payload.workspace = workspace;

  if (createForm.runtimeType === 'acp') {
    const runtime: NonNullable<AgentCreatePayload['runtime']> = {
      type: 'acp',
    };
    const backend = createForm.runtimeBackend.trim();
    const agent = createForm.runtimeAgent.trim();
    const mode = createForm.runtimeMode.trim();
    const cwd = createForm.runtimeCwd.trim() || workspace;
    if (backend) runtime.backend = backend;
    if (agent) runtime.agent = agent;
    if (mode) runtime.mode = mode;
    if (cwd) runtime.cwd = cwd;
    payload.runtime = runtime;
  }

  const identity: NonNullable<AgentCreatePayload['identity']> = {};
  if (name) identity.name = name;
  const emoji = createForm.identityEmoji.trim();
  const avatar = createForm.identityAvatar.trim();
  const role = createForm.identityRole.trim();
  const style = createForm.identityStyle.trim();
  const theme = createForm.identityTheme.trim();
  const mission = createForm.identityMission.trim();
  if (emoji) identity.emoji = emoji;
  if (avatar) identity.avatar = avatar;
  if (role) identity.role = role;
  if (style) identity.style = style;
  if (theme) identity.theme = theme;
  if (mission) identity.mission = mission;
  if (Object.keys(identity).length) payload.identity = identity;

  return payload;
}

async function loadSelectedDetail(agentId: string): Promise<void> {
  if (!isAgentsRouteActive.value) return;
  if (!agentId) {
    detail.value = null;
    return;
  }
  const requestSequence = ++detailRequestSequence;
  detailLoading.value = true;
  try {
    const payload = await fetchAgentDetail(agentId);
    if (requestSequence !== detailRequestSequence || routeAgentId.value !== agentId) return;
    detail.value = payload;
  } catch (error) {
    if (requestSequence !== detailRequestSequence || routeAgentId.value !== agentId) return;
    detail.value = null;
    setNotice('error', error instanceof Error ? error.message : text('无法读取 Agent 详情。', 'Failed to load agent detail.'));
  } finally {
    if (requestSequence !== detailRequestSequence || routeAgentId.value !== agentId) return;
    detailLoading.value = false;
  }
}

async function refreshSummary(preferredAgentId = ''): Promise<void> {
  if (!isAgentsRouteActive.value) return;
  summaryLoading.value = true;
  errorMessage.value = '';

  try {
    const [nextSummary, nextConfigSummary] = await Promise.all([
      fetchAgentsSummary(),
      fetchConfigSummary().catch(() => null),
    ]);
    if (!isAgentsRouteActive.value) return;
    summary.value = nextSummary;
    configSummary.value = nextConfigSummary;

    const availableIds = nextSummary.agents.map((agent) => agent.id);
    const nextAgentId = preferredAgentId && availableIds.includes(preferredAgentId)
      ? preferredAgentId
      : routeAgentId.value && availableIds.includes(routeAgentId.value)
        ? routeAgentId.value
        : nextSummary.defaultAgentId || nextSummary.agents[0]?.id || '';

    if (!nextAgentId) {
      detail.value = null;
      return;
    }

    if (routeAgentId.value !== nextAgentId || route.path === '/agents') {
      const nextSection = routeAgentId.value === nextAgentId && route.path !== '/agents'
        ? activeSection.value
        : 'overview';
      await router.replace({
        path: buildAgentPath(nextAgentId, nextSection),
        query: route.query,
      });
      return;
    }

    await loadSelectedDetail(nextAgentId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('无法读取 Agent 列表。', 'Failed to load agents.');
  } finally {
    summaryLoading.value = false;
  }
}

async function saveQuickConfig(payload: {
  name?: string;
  model?: string;
  runtimeType: 'default' | 'acp';
  workspace?: string;
  sandboxMode?: string;
  workspaceAccess?: string;
  toolsProfile?: string;
  fsWorkspaceOnly?: boolean;
  identity?: {
    name?: string;
    role?: string;
    emoji?: string;
    avatar?: string;
  };
}): Promise<void> {
  if (!routeAgentId.value || !detail.value) return;
  saveBusy.value = true;

  try {
    const preservedRuntime = {
      type: payload.runtimeType,
      backend: detail.value.editor.runtime.backend,
      agent: detail.value.editor.runtime.agent,
      mode: detail.value.editor.runtime.mode,
      cwd: detail.value.editor.runtime.cwd,
    };
    const response = await updateAgent(routeAgentId.value, {
      name: payload.name,
      model: payload.model,
      workspace: payload.workspace,
      sandboxMode: payload.sandboxMode,
      workspaceAccess: payload.workspaceAccess,
      toolsProfile: payload.toolsProfile,
      fsWorkspaceOnly: payload.fsWorkspaceOnly,
      identity: payload.identity,
      runtime: preservedRuntime,
    });
    closeOverlay();
    if (response.detail) {
      detail.value = response.detail;
    }
    await refreshSummary(routeAgentId.value);
    setNotice('success', response.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('保存快速配置失败。', 'Failed to save quick config.'));
  } finally {
    saveBusy.value = false;
  }
}

async function submitCreateAgent(): Promise<void> {
  const agentId = createForm.id.trim();
  if (!agentId) {
    setNotice('error', text('请先填写 Agent ID。', 'Please enter an agent id.'));
    return;
  }

  createBusy.value = true;
  try {
    const payload = await createAgent(buildCreatePayload());
    closeOverlay();
    await refreshSummary(payload.agent?.id || agentId);
    setNotice('success', payload.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('创建 Agent 失败。', 'Failed to create agent.'));
  } finally {
    createBusy.value = false;
  }
}

watch(
  () => route.params.agentId,
  async () => {
    if (!isAgentsRouteActive.value) return;
    if (!routeAgentId.value) {
      detail.value = null;
      if (summary.value?.agents.length) {
        await refreshSummary();
      }
      return;
    }
    await loadSelectedDetail(routeAgentId.value);
  },
  { immediate: true },
);

watch(
  () => createForm.id,
  (value) => {
    if (!createForm.workspace.trim()) return;
    if (value.trim() && /workspace-[a-z0-9_-]*$/.test(createForm.workspace)) {
      createForm.workspace = createForm.id === 'main'
        ? '/home/binbin/.openclaw/workspace'
        : `/home/binbin/.openclaw/workspace-${value.trim()}`;
    }
  },
);

watch(
  () => createForm.runtimeType,
  (value) => {
    if (value !== 'acp') return;
    if (createForm.runtimeAgent.trim()) return;
    const preferredAgent = String(configSummary.value?.acp?.defaultAgent || '').trim();
    if (preferredAgent) createForm.runtimeAgent = preferredAgent;
  },
);

onMounted(async () => {
  if (!isAgentsRouteActive.value) return;
  await refreshSummary(routeAgentId.value);
});
</script>
