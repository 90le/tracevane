<template>
  <section v-if="agentId" class="agents-stage-view">
    <div class="agents-stage-task-head operate-stage-task-head">
      <div>
        <p class="eyebrow">{{ agentId }}</p>
        <h3>{{ text('高级配置', 'Advanced') }}</h3>
        <p>{{ text('当前页面只负责完整配置与高级 JSON。概览页只保留高频快改。', 'This page only handles full configuration and advanced JSON. The overview stays limited to high-frequency quick edits.') }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="primary-button" :disabled="saveBusy || loading" @click="saveAgentChanges">
          {{ saveBusy ? text('保存中...', 'Saving...') : text('保存配置', 'Save changes') }}
        </button>
      </div>
    </div>

    <article v-if="noticeMessage" class="panel-card">{{ noticeMessage }}</article>
    <article v-if="errorMessage" class="panel-card">{{ errorMessage }}</article>
    <div v-if="loading" class="empty-inline">{{ text('正在读取 Agent 详情…', 'Loading agent details...') }}</div>

    <template v-else>
      <div class="agents-summary-strip">
        <span class="agents-summary-pill">{{ draft.model || text('跟随系统默认模型', 'Inherit system model') }}</span>
        <span class="agents-summary-pill">{{ draft.runtime.type === 'acp' ? text('ACP 运行时', 'ACP runtime') : text('默认运行时', 'Default runtime') }}</span>
        <span class="agents-summary-pill">{{ draft.workspace || text('未设置工作区', 'Workspace unset') }}</span>
        <span class="agents-summary-pill">{{ draft.toolsProfile || text('完整工具集', 'Full tools profile') }}</span>
      </div>

      <article class="panel-card agents-stage-panel">
        <div class="agents-stage-task-head operate-stage-task-head">
          <div>
            <p class="eyebrow">{{ text('CORE', 'CORE') }}</p>
            <h3>{{ text('基础配置', 'Core configuration') }}</h3>
            <p>{{ text('先确认名称、模型和工作区，这三项会直接影响大多数会话入口。', 'Confirm name, model, and workspace first. These three fields shape most session entrypoints.') }}</p>
          </div>
        </div>

        <div class="agents-form-grid">
          <div class="form-field">
            <label class="form-label">{{ text('显示名称', 'Display Name') }}</label>
            <input v-model="draft.name" class="form-input" :placeholder="text('例如 小丘', 'For example Main')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('模型覆盖', 'Model Override') }}</label>
            <GlassSelect
              v-model="draft.model"
              :options="modelOptions"
              :placeholder="text('留空表示跟随系统默认', 'Leave empty to inherit the system default')"
            />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('工作区路径', 'Workspace Path') }}</label>
            <input v-model="draft.workspace" class="form-input" />
          </div>
        </div>
      </article>

      <article class="panel-card agents-stage-panel">
        <div class="agents-stage-task-head operate-stage-task-head">
          <div>
            <p class="eyebrow">{{ text('IDENTITY', 'IDENTITY') }}</p>
            <h3>{{ text('身份字段', 'Identity') }}</h3>
            <p>{{ text('这里维护头像、角色、风格、主题和使命。', 'Manage avatar, role, style, theme, and mission here.') }}</p>
          </div>
        </div>

        <div class="agents-form-grid">
          <AvatarFieldEditor
            v-model="draft.identity.avatar"
            class="form-field-full"
            :label="text('Avatar', 'Avatar')"
            :placeholder="text('emoji / 短文本 / 图片 URL / data URI', 'emoji / short text / image URL / data URI')"
            :preview-fallback="draft.name || agentId"
          />
          <div class="form-field">
            <label class="form-label">{{ text('Emoji', 'Emoji') }}</label>
            <input v-model="draft.identity.emoji" class="form-input" :placeholder="text('例如 🤖', 'For example 🤖')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('角色', 'Role') }}</label>
            <input v-model="draft.identity.role" class="form-input" :placeholder="text('例如 前端实现 agent', 'For example Frontend implementation agent')" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('风格', 'Style') }}</label>
            <input v-model="draft.identity.style" class="form-input" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('主题', 'Theme') }}</label>
            <input v-model="draft.identity.theme" class="form-input" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('使命说明', 'Mission') }}</label>
            <textarea v-model="draft.identity.mission" class="form-textarea" rows="4" />
          </div>
        </div>
      </article>

      <details class="panel-card agents-stage-panel agents-advanced-collapsible" open>
        <summary class="agents-stage-task-head agents-advanced-summary">
          <div>
            <p class="eyebrow">{{ text('RUNTIME', 'RUNTIME') }}</p>
            <h3>{{ text('运行时与默认行为', 'Runtime and behavior defaults') }}</h3>
            <p>{{ text('把 runtime、sandbox 和默认行为单独放一段，避免和身份字段混在一起。', 'Keep runtime, sandbox, and behavior defaults in their own section instead of mixing them with identity fields.') }}</p>
          </div>
          <span class="agents-summary-pill">{{ text('默认展开', 'Open by default') }}</span>
        </summary>

        <div class="agents-form-grid">
          <div class="form-field">
            <label class="form-label">{{ text('运行时类型', 'Runtime type') }}</label>
            <GlassSelect v-model="draft.runtime.type" :options="runtimeTypeOptions" />
          </div>
          <template v-if="draft.runtime.type === 'acp'">
            <div class="form-field">
              <label class="form-label">{{ text('后端', 'Backend') }}</label>
              <input v-model="draft.runtime.backend" class="form-input" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('ACP Agent', 'ACP Agent') }}</label>
              <input v-model="draft.runtime.agent" class="form-input" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('模式', 'Mode') }}</label>
              <GlassSelect v-model="draft.runtime.mode" :options="runtimeModeOptions" :placeholder="text('未设置', 'Unset')" />
            </div>
            <div class="form-field form-field-full">
              <label class="form-label">{{ text('运行目录', 'CWD') }}</label>
              <input v-model="draft.runtime.cwd" class="form-input" />
            </div>
          </template>
          <div class="form-field">
            <label class="form-label">{{ text('沙盒模式', 'Sandbox mode') }}</label>
            <GlassSelect v-model="draft.sandboxMode" :options="sandboxModeOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('工作区访问', 'Workspace access') }}</label>
            <GlassSelect v-model="draft.workspaceAccess" :options="workspaceAccessOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('工具配置', 'Tools profile') }}</label>
            <GlassSelect v-model="draft.toolsProfile" :options="toolsProfileOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('Thinking 默认值', 'Thinking default') }}</label>
            <GlassSelect v-model="draft.thinkingDefault" :options="thinkingDefaultOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('Verbose 默认值', 'Verbose default') }}</label>
            <GlassSelect v-model="draft.verboseDefault" :options="verboseDefaultOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('Reasoning 默认值', 'Reasoning default') }}</label>
            <GlassSelect v-model="draft.reasoningDefault" :options="reasoningDefaultOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('Fast Mode 默认值', 'Fast Mode default') }}</label>
            <GlassSelect v-model="draft.fastModeDefault" :options="fastModeDefaultOptions" />
          </div>
          <label class="toggle-card form-field-full">
            <input v-model="draft.fsWorkspaceOnly" class="form-checkbox" type="checkbox" />
            <div>
              <strong>{{ text('仅限工作区文件访问', 'Workspace-only FS access') }}</strong>
              <span>{{ text('限制文件系统访问在当前工作区内。', 'Restrict filesystem access to the current workspace.') }}</span>
            </div>
          </label>
          <section class="config-subsection form-field-full agents-heartbeat-config">
            <div class="config-subsection-head">
              <h4>{{ text('内置 HEARTBEAT', 'Built-in HEARTBEAT') }}</h4>
              <p>{{ text('单独控制这个 Agent 的 heartbeat。继承会删除这个 Agent 的 heartbeat 块；禁用会写入 every: "0m"。', 'Controls heartbeat for this agent. Inherit removes this agent heartbeat block; disabled writes every: "0m".') }}</p>
            </div>
            <div class="agents-form-grid">
              <div class="form-field">
                <label class="form-label">{{ text('心跳策略', 'Heartbeat policy') }}</label>
                <GlassSelect v-model="draft.heartbeatMode" :options="heartbeatModeOptions" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('心跳周期', 'Heartbeat interval') }}</label>
                <input v-model="draft.heartbeatEvery" class="form-input" :disabled="draft.heartbeatMode !== 'enabled'" placeholder="30m" />
                <span class="field-hint">{{ text('例如 10m / 30m / 1h。启用但留空时保存为 30m。', 'For example 10m / 30m / 1h. If enabled and empty, Studio saves 30m.') }}</span>
              </div>
            </div>
          </section>
        </div>
      </details>

      <details class="panel-card agents-stage-panel agents-advanced-collapsible">
        <summary class="agents-stage-task-head agents-advanced-summary">
          <div>
            <p class="eyebrow">{{ text('OVERRIDES', 'OVERRIDES') }}</p>
            <h3>{{ text('覆盖项', 'Overrides') }}</h3>
            <p>{{ text('先处理系统提示词和技能这些高频覆盖，再进入真正的原始 JSON。', 'Handle system prompt and skills overrides here before moving into raw JSON blocks.') }}</p>
          </div>
          <span class="agents-summary-pill">{{ text('按需展开', 'Open when needed') }}</span>
        </summary>

        <div class="agents-form-grid">
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('系统提示词覆盖', 'System Prompt Override') }}</label>
            <textarea v-model="draft.systemPromptOverride" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('技能', 'Skills') }}</label>
            <textarea v-model="draft.skillsText" class="form-textarea" rows="4" :placeholder="text('每行一个 skill 或用逗号分隔', 'One skill per line or comma-separated')" />
          </div>
        </div>
      </details>

      <details class="panel-card agents-stage-panel agents-advanced-collapsible">
        <summary class="agents-stage-task-head agents-advanced-summary">
          <div>
            <p class="eyebrow">{{ text('ADVANCED JSON', 'ADVANCED JSON') }}</p>
            <h3>{{ text('原始 JSON', 'Raw JSON') }}</h3>
            <p>{{ text('低频 JSON 字段集中在这里，便于和主配置分开处理。', 'Low-frequency JSON fields are grouped here so they stay separate from the core configuration flow.') }}</p>
          </div>
          <span class="agents-summary-pill">{{ text('低频字段', 'Low-frequency') }}</span>
        </summary>

        <div class="agents-form-grid">
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('沙盒 JSON', 'Sandbox JSON') }}</label>
            <textarea v-model="draft.sandboxJson" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('工具 JSON', 'Tools JSON') }}</label>
            <textarea v-model="draft.toolsJson" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('记忆检索 JSON', 'Memory Search JSON') }}</label>
            <textarea v-model="draft.memorySearchJson" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('Heartbeat JSON', 'Heartbeat JSON') }}</label>
            <textarea v-model="draft.heartbeatJson" class="form-textarea" rows="5" />
            <span class="field-hint">{{ text('every 由上方心跳策略控制；启用或禁用时会合并保留 includeReasoning 等低频字段，继承会删除整个 heartbeat 块。', 'every is controlled by the heartbeat policy above; enabled or disabled modes preserve low-frequency fields such as includeReasoning, while inherit removes the whole heartbeat block.') }}</span>
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('参数 JSON', 'Params JSON') }}</label>
            <textarea v-model="draft.paramsJson" class="form-textarea" rows="5" />
          </div>
        </div>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { AgentDetailPayload } from '../../../../../types/agents';
import AvatarFieldEditor from '../../shared/components/AvatarFieldEditor.vue';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { buildAgentHeartbeatConfig, resolveHeartbeatEvery, resolveHeartbeatMode, type HeartbeatMode } from '../../shared/heartbeat-config';
import { useLocalePreference } from '../../shared/locale';
import { fetchAgentDetail, fetchAgentsSummary, updateAgent } from './api';

defineOptions({ name: 'AgentAdvancedPage' });

const route = useRoute();
const { text } = useLocalePreference();

const agentId = computed(() => String(route.params.agentId || ''));
const loading = ref(false);
const saveBusy = ref(false);
const errorMessage = ref('');
const noticeMessage = ref('');
const detail = ref<AgentDetailPayload | null>(null);
const availableModels = ref<string[]>([]);

const draft = reactive({
  name: '',
  model: '',
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
  sandboxJson: '',
  toolsJson: '',
  memorySearchJson: '',
  heartbeatMode: 'inherit' as HeartbeatMode,
  heartbeatEvery: '',
  heartbeatJson: '',
  paramsJson: '',
  runtime: {
    type: 'default',
    backend: '',
    agent: '',
    mode: '',
    cwd: '',
  },
  identity: {
    emoji: '',
    avatar: '',
    role: '',
    style: '',
    theme: '',
    mission: '',
  },
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
const runtimeModeOptions = computed(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'persistent', label: text('持久', 'Persistent') },
  { value: 'oneshot', label: text('单次', 'Oneshot') },
]);
const heartbeatModeOptions = computed(() => [
  { value: 'inherit', label: text('继承全局', 'Inherit global') },
  { value: 'enabled', label: text('启用', 'Enabled') },
  { value: 'disabled', label: text('禁用', 'Disabled') },
]);
const modelOptions = computed(() => [
  { value: '', label: text('跟随系统默认', 'Inherit system default') },
  ...availableModels.value.map((model) => ({ value: model, label: model })),
]);

function normalizeToolsProfile(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'standard') return 'full';
  if (['minimal', 'coding', 'messaging', 'full'].includes(normalized)) return normalized;
  return 'full';
}

function formatJsonEditor(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return JSON.stringify(value, null, 2);
}

function parseSkillsText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
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

function resetDraftFromDetail(value: AgentDetailPayload): void {
  const editor = value.editor;
  draft.name = editor.name || value.agent.name || '';
  draft.model = editor.model || value.agent.model || '';
  draft.workspace = editor.workspace || value.agent.workspace || '';
  draft.sandboxMode = editor.sandboxMode || value.agent.sandboxMode || 'off';
  draft.workspaceAccess = editor.workspaceAccess || value.agent.workspaceAccess || 'rw';
  draft.toolsProfile = normalizeToolsProfile(editor.toolsProfile || value.agent.toolsProfile);
  draft.fsWorkspaceOnly = editor.fsWorkspaceOnly === true;
  draft.thinkingDefault = editor.thinkingDefault || '';
  draft.verboseDefault = editor.verboseDefault || '';
  draft.reasoningDefault = editor.reasoningDefault || '';
  draft.fastModeDefault = editor.fastModeDefault || '';
  draft.systemPromptOverride = editor.systemPromptOverride || '';
  draft.skillsText = Array.isArray(editor.skills) ? editor.skills.join('\n') : '';
  draft.sandboxJson = formatJsonEditor(editor.sandboxRaw ?? null);
  draft.toolsJson = formatJsonEditor(editor.toolsRaw ?? null);
  draft.memorySearchJson = formatJsonEditor(editor.memorySearch ?? null);
  draft.heartbeatMode = resolveHeartbeatMode(editor.heartbeat);
  draft.heartbeatEvery = resolveHeartbeatEvery(editor.heartbeat);
  draft.heartbeatJson = formatJsonEditor(editor.heartbeat ?? null);
  draft.paramsJson = formatJsonEditor(editor.params ?? null);
  draft.runtime.type = editor.runtime?.type === 'acp' ? 'acp' : 'default';
  draft.runtime.backend = editor.runtime?.backend || '';
  draft.runtime.agent = editor.runtime?.agent || '';
  draft.runtime.mode = editor.runtime?.mode || '';
  draft.runtime.cwd = editor.runtime?.cwd || '';
  draft.identity.emoji = editor.identity?.emoji || '';
  draft.identity.avatar = editor.identity?.avatar || '';
  draft.identity.role = editor.identity?.role || '';
  draft.identity.style = editor.identity?.style || '';
  draft.identity.theme = editor.identity?.theme || '';
  draft.identity.mission = editor.identity?.mission || '';
}

function clearAcpRuntimeFields(): void {
  draft.runtime.backend = '';
  draft.runtime.agent = '';
  draft.runtime.mode = '';
  draft.runtime.cwd = '';
}

async function loadDetail(): Promise<void> {
  if (!agentId.value) return;
  loading.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const [payload, summary] = await Promise.all([
      fetchAgentDetail(agentId.value),
      fetchAgentsSummary(),
    ]);
    detail.value = payload;
    availableModels.value = summary.availableModels || [];
    resetDraftFromDetail(payload);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('读取 Agent 详情失败。', 'Failed to load agent detail.');
  } finally {
    loading.value = false;
  }
}

async function saveAgentChanges(): Promise<void> {
  if (!agentId.value) return;
  saveBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const heartbeatRaw = parseOptionalJsonObject('Heartbeat JSON', draft.heartbeatJson);
    const payload = await updateAgent(agentId.value, {
      name: draft.name,
      model: draft.model,
      workspace: draft.workspace,
      sandboxMode: draft.sandboxMode,
      workspaceAccess: draft.workspaceAccess,
      toolsProfile: normalizeToolsProfile(draft.toolsProfile),
      fsWorkspaceOnly: draft.fsWorkspaceOnly,
      thinkingDefault: draft.thinkingDefault,
      verboseDefault: draft.verboseDefault,
      reasoningDefault: draft.reasoningDefault,
      fastModeDefault: draft.fastModeDefault,
      systemPromptOverride: draft.systemPromptOverride,
      skills: parseSkillsText(draft.skillsText),
      sandboxRaw: parseOptionalJsonObject('Sandbox JSON', draft.sandboxJson),
      toolsRaw: parseOptionalJsonObject('Tools JSON', draft.toolsJson),
      memorySearch: parseOptionalJsonObject('Memory Search JSON', draft.memorySearchJson),
      heartbeat: buildAgentHeartbeatConfig(heartbeatRaw, draft.heartbeatMode, draft.heartbeatEvery),
      params: parseOptionalJsonObject('Params JSON', draft.paramsJson),
      runtime: {
        type: draft.runtime.type as 'default' | 'acp',
        backend: draft.runtime.backend,
        agent: draft.runtime.agent,
        mode: draft.runtime.mode,
        cwd: draft.runtime.cwd,
      },
      identity: {
        name: draft.name,
        emoji: draft.identity.emoji,
        avatar: draft.identity.avatar,
        role: draft.identity.role,
        style: draft.identity.style,
        theme: draft.identity.theme,
        mission: draft.identity.mission,
      },
    });
    if (payload.detail) {
      detail.value = payload.detail;
      resetDraftFromDetail(payload.detail);
    }
    noticeMessage.value = payload.message;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('保存 Agent 配置失败。', 'Failed to save agent configuration.');
  } finally {
    saveBusy.value = false;
  }
}

watch(
  () => draft.runtime.type,
  (nextType, previousType) => {
    if (nextType !== 'acp' && previousType === 'acp') {
      clearAcpRuntimeFields();
    }
  },
);

watch(
  () => route.params.agentId,
  async () => {
    detail.value = null;
    if (!agentId.value) return;
    await loadDetail();
  },
  { immediate: true },
);
</script>
