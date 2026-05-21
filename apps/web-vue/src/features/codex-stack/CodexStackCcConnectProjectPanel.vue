<template>
  <div class="cs-cc-project-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("Agent 项目", "Agent Projects") }}</p>
        <h4>{{ project?.name || text("选择或创建项目", "Select or Create a Project") }}</h4>
        <p class="cs-field-hint">{{ projectSummary }}</p>
      </div>
      <div class="cs-actions">
        <button type="button" class="secondary-button" :disabled="busy || !project" @click="$emit('sync-default-model')">
          {{ text("同步默认模型到全部项目", "Sync Default Model to All") }}
        </button>
        <button
          v-if="project"
          type="button"
          class="text-button danger-text"
          :disabled="busy"
          @click="$emit('remove-project', project.id)"
        >
          {{ text("删除当前项目", "Delete Current Project") }}
        </button>
        <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
          {{ busyDisabledHelp }}
        </p>
      </div>
    </div>

    <div class="cs-agent-template-row">
      <article v-for="preset in presets" :key="preset.id" class="cs-agent-template-card">
        <div>
          <strong>{{ preset.label }}</strong>
          <p>{{ preset.copy }}</p>
        </div>
        <button type="button" class="secondary-button" :disabled="busy" @click="$emit('add-preset', preset.id)">
          {{ preset.action }}
        </button>
      </article>
    </div>

    <div v-if="loading" class="cs-empty-lite">
      {{ text("正在读取项目配置...", "Loading project config...") }}
    </div>
    <div v-else-if="!project" class="cs-empty-lite">
      <p>{{ text("当前配置没有 projects。新增项目后选择工作目录、模型和平台即可。", "No projects are declared. Add a project, then choose work directory, model, and platforms.") }}</p>
      <button type="button" class="secondary-button" :disabled="busy" @click="$emit('add-project')">
        {{ text("创建第一个项目", "Create First Project") }}
      </button>
    </div>
    <template v-else>
      <div class="cs-agent-editor-grid">
        <section class="cs-agent-editor-main">
          <div class="cs-form-grid cs-project-meta">
            <label class="form-field">
              <span class="form-label">{{ text("项目名", "Project Name") }}</span>
              <input
                :value="project.name"
                class="form-input"
                placeholder="main"
                @input="$emit('update-project-field', project.id, 'name', inputValue($event))"
              />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text("Agent 类型", "Agent Type") }}</span>
              <input
                :value="project.agentType"
                class="form-input"
                placeholder="codex"
                @input="$emit('update-project-field', project.id, 'agentType', inputValue($event))"
              />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text("模式", "Mode") }}</span>
              <select
                :value="project.agentOptions.mode"
                class="form-input"
                @change="$emit('update-agent-option', project.id, 'mode', inputValue($event))"
              >
                <option value="suggest">suggest</option>
                <option value="yolo">yolo</option>
                <option value="read-only">read-only</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text("模型", "Model") }}</span>
              <select
                :value="project.agentOptions.model"
                class="form-input"
                @change="$emit('update-agent-option', project.id, 'model', inputValue($event))"
              >
                <option v-for="model in modelOptions" :key="`${project.id}-${model}`" :value="model">{{ model }}</option>
              </select>
              <span class="form-help">{{ text("模型列表来自 CPA /v1/models。", "Model list comes from CPA /v1/models.") }}</span>
            </label>
            <label class="form-field cs-form-span-2">
              <span class="form-label">{{ text("工作目录", "Work Directory") }}</span>
              <input
                :value="project.agentOptions.workDir"
                class="form-input"
                placeholder="/home/user/.openclaw"
                @input="$emit('update-agent-option', project.id, 'workDir', inputValue($event))"
              />
            </label>
            <label class="form-field cs-form-span-2">
              <span class="form-label">{{ text("管理员来源", "Admin From") }}</span>
              <textarea
                :value="project.adminFrom"
                class="form-input cs-inline-textarea"
                :placeholder="text('多个来源用逗号分隔；留空会禁用管理命令', 'Comma-separated sources; leave empty to disable privileged commands')"
                @input="$emit('update-project-field', project.id, 'adminFrom', inputValue($event))"
              />
            </label>
          </div>
        </section>
        <aside class="cs-agent-editor-side">
          <p class="cs-section-kicker">{{ text("渠道预览", "Channel Preview") }}</p>
          <div class="cs-platform-badges">
            <span v-for="platform in project.platforms" :key="platform.id" class="cs-chip">
              {{ platform.type || text("未命名平台", "Unnamed Platform") }}
            </span>
            <span v-if="!project.platforms.length" class="cs-chip">
              {{ text("暂无平台", "No Platforms") }}
            </span>
          </div>
          <p class="cs-field-hint">
            {{ text("一个项目可以绑定多个平台。DMWork 通常手填 token，Feishu/Weixin 建议先保存项目再执行 setup。", "One project can bind multiple platforms. DMWork usually uses token fields; Feishu/Weixin should be saved before setup.") }}
          </p>
        </aside>
      </div>

      <div class="cs-subsection-header cs-subsection-header-tight">
        <div>
          <strong>{{ text("平台渠道", "Platform Channels") }}</strong>
          <p>{{ text("平台参数单独成卡片，避免和 Agent 基础参数挤在一起。", "Platform options are isolated cards instead of being crowded with base agent fields.") }}</p>
        </div>
        <div class="cs-platform-template-actions">
          <button
            v-for="template in platformTemplates"
            :key="template.id"
            type="button"
            class="secondary-button"
            :disabled="busy"
            :title="template.copy"
            @click="$emit('add-platform', template.id)"
          >
            {{ text("新增", "Add") }} {{ template.label }}
          </button>
        </div>
      </div>

      <div class="cs-platform-grid cs-platform-grid-roomy">
        <article
          v-for="platform in project.platforms"
          :key="platform.id"
          class="cs-platform-card"
        >
          <div class="cs-platform-head">
            <strong>{{ platform.type || text("未命名平台", "Unnamed Platform") }}</strong>
            <button type="button" class="text-button danger-text" :disabled="busy" @click="$emit('remove-platform', platform.id)">
              {{ text("删除平台", "Delete Platform") }}
            </button>
          </div>
          <label class="form-field">
            <span class="form-label">type</span>
            <input
              :value="platform.type"
              class="form-input"
              list="cc-platform-options"
              placeholder="octo"
              @input="$emit('update-platform-type', platform.id, inputValue($event))"
            />
          </label>
          <div class="cs-option-list">
            <div v-for="row in platform.optionRows" :key="row.id" class="cs-option-row">
              <input
                :value="row.key"
                class="form-input"
                placeholder="key"
                @input="$emit('update-platform-option', platform.id, row.id, 'key', inputValue($event))"
              />
              <input
                :value="row.value"
                class="form-input"
                :type="isSensitiveKey(row.key) ? 'password' : 'text'"
                placeholder="value"
                @input="$emit('update-platform-option', platform.id, row.id, 'value', inputValue($event))"
              />
              <button type="button" class="text-button danger-text" :disabled="busy" @click="$emit('remove-platform-option', platform.id, row.id)">
                {{ text("删除", "Delete") }}
              </button>
            </div>
            <button type="button" class="secondary-button" :disabled="busy" @click="$emit('add-platform-option', platform.id)">
              {{ text("新增参数", "Add Option") }}
            </button>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

export type CodexStackCcConnectProjectField = "name" | "adminFrom" | "agentType";
export type CodexStackCcConnectAgentOptionField = "workDir" | "mode" | "model";
export type CodexStackCcConnectPlatformOptionField = "key" | "value";
export type CodexStackCcConnectProjectPresetId = "admin" | "worker";
export type CodexStackCcConnectPlatformTemplateId = "dmwork" | "octo" | "feishu" | "weixin";

export interface CodexStackCcConnectPlatformOptionDraft {
  id: string;
  key: string;
  value: string;
}

export interface CodexStackCcConnectPlatformDraft {
  id: string;
  type: string;
  optionRows: CodexStackCcConnectPlatformOptionDraft[];
}

export interface CodexStackCcConnectProjectDraft {
  id: string;
  name: string;
  adminFrom: string;
  agentType: string;
  agentOptions: {
    workDir: string;
    mode: string;
    model: string;
  };
  platforms: CodexStackCcConnectPlatformDraft[];
}

export interface CodexStackCcConnectProjectPresetCard {
  id: CodexStackCcConnectProjectPresetId;
  label: string;
  copy: string;
  action: string;
}

export interface CodexStackCcConnectPlatformTemplate {
  id: CodexStackCcConnectPlatformTemplateId;
  label: string;
  copy: string;
}

defineProps<{
  project: CodexStackCcConnectProjectDraft | null;
  projectSummary: string;
  presets: CodexStackCcConnectProjectPresetCard[];
  platformTemplates: CodexStackCcConnectPlatformTemplate[];
  modelOptions: string[];
  loading: boolean;
  busy: boolean;
  busyDisabledHelp: string;
}>();

defineEmits<{
  "sync-default-model": [];
  "remove-project": [projectId: string];
  "add-preset": [preset: CodexStackCcConnectProjectPresetId];
  "add-project": [];
  "update-project-field": [projectId: string, field: CodexStackCcConnectProjectField, value: string];
  "update-agent-option": [projectId: string, field: CodexStackCcConnectAgentOptionField, value: string];
  "add-platform": [type: CodexStackCcConnectPlatformTemplateId];
  "remove-platform": [platformId: string];
  "update-platform-type": [platformId: string, value: string];
  "update-platform-option": [platformId: string, optionId: string, field: CodexStackCcConnectPlatformOptionField, value: string];
  "add-platform-option": [platformId: string];
  "remove-platform-option": [platformId: string, optionId: string];
}>();

const { text } = useLocalePreference();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function isSensitiveKey(key: string): boolean {
  return /key|token|secret|password/i.test(key);
}
</script>

<style scoped>
.cs-cc-project-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cs-card-header,
.cs-platform-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4,
.cs-platform-head strong {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-empty-lite {
  padding: 18px 0 0;
  color: var(--text-soft);
}

.cs-agent-template-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 2px;
}

.cs-agent-template-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  border: 1px solid color-mix(in srgb, var(--acc) 22%, var(--line));
  border-radius: var(--radius-lg);
  padding: 14px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 10%, transparent), transparent 34%),
    color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-agent-template-card p {
  margin: 6px 0 0;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.cs-agent-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.32fr);
  gap: 18px;
  align-items: start;
}

.cs-agent-editor-main,
.cs-agent-editor-side {
  min-width: 0;
}

.cs-agent-editor-side {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--sky) 14%, transparent), transparent 36%),
    color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-platform-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 0.85rem;
}

.cs-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-form-span-2 {
  grid-column: 1 / -1;
}

.cs-project-meta {
  display: grid;
  gap: 10px;
}

.cs-inline-textarea {
  min-height: 86px;
  resize: vertical;
}

.cs-subsection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 18px 0 0;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
}

.cs-subsection-header-tight {
  margin-top: 8px;
}

.cs-subsection-header strong {
  display: block;
  color: var(--text);
}

.cs-subsection-header p {
  margin: 4px 0 0;
  color: var(--text-soft);
}

.cs-platform-template-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.cs-platform-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-platform-grid-roomy {
  grid-template-columns: repeat(2, minmax(280px, 1fr));
}

.cs-platform-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  padding: 14px;
}

.cs-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.cs-option-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(160px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.text-button {
  border: none;
  background: transparent;
  color: var(--acc);
  cursor: pointer;
  padding: 4px 0;
  font: inherit;
  font-size: 0.86rem;
}

.text-button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.cs-disabled-help {
  flex-basis: 100%;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.danger-text {
  color: var(--danger);
}

@media (max-width: 960px) {
  .cs-card-header,
  .cs-platform-head,
  .cs-agent-template-card,
  .cs-subsection-header {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-form-grid,
  .cs-platform-grid,
  .cs-agent-editor-grid,
  .cs-agent-template-row,
  .cs-option-row {
    grid-template-columns: 1fr;
  }
}
</style>
