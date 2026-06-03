<template>
  <div class="cs-cc-project-panel">
    <div class="cs-card-header cs-agent-panel-head">
      <div>
        <p class="cs-section-kicker">{{ text("Agent 项目", "Agent Projects") }}</p>
        <h4>{{ project?.name || text("选择或创建项目", "Select or Create a Project") }}</h4>
        <small v-if="project" class="cs-agent-panel-subtitle">{{ projectSummary }}</small>
      </div>
      <div class="cs-actions">
        <button type="button" class="secondary-button" :disabled="busy || !project" @click="$emit('sync-default-model')">
          {{ text("同步默认模型", "Sync Default Model") }}
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

    <details class="cs-agent-presets-drawer">
      <summary>
        <span>{{ text("快捷新增", "Quick add") }}</span>
        <small>{{ projectSummary }}</small>
      </summary>
      <div class="cs-agent-template-row">
        <article v-for="preset in presets" :key="preset.id" class="cs-agent-template-card">
          <div>
            <strong>{{ preset.label }}</strong>
          </div>
          <button type="button" class="secondary-button" :disabled="busy" @click="$emit('add-preset', preset.id)">
            {{ preset.action }}
          </button>
        </article>
      </div>
    </details>

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
      <div class="cs-agent-control-grid">
        <section class="cs-agent-config-block">
          <div class="cs-agent-config-block-head">
            <span>{{ text("项目路由", "Project Route") }}</span>
            <strong>{{ project.agentType || "codex" }}</strong>
          </div>
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
            <label class="form-field cs-form-span-2">
              <span class="form-label">provider_refs</span>
              <input
                :value="project.providerRefsText"
                class="form-input"
                placeholder="cpa, claude-relay"
                @input="$emit('update-project-field', project.id, 'providerRefsText', inputValue($event))"
              />
            </label>
          </div>
        </section>

        <section class="cs-agent-config-block">
          <div class="cs-agent-config-block-head">
            <span>{{ text("运行方式", "Run Profile") }}</span>
            <strong>{{ project.agentOptions.mode || "--" }}</strong>
          </div>
          <div class="cs-form-grid cs-project-meta">
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
                <option
                  v-if="project.agentOptions.model && !modelOptions.includes(project.agentOptions.model)"
                  :value="project.agentOptions.model"
                >
                  {{ project.agentOptions.model }}
                </option>
                <option v-for="model in modelOptions" :key="`${project.id}-${model}`" :value="model">{{ model }}</option>
              </select>
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
          </div>
        </section>

        <section class="cs-agent-config-block cs-agent-config-block-side">
          <div class="cs-agent-config-block-head">
            <span>{{ text("渠道与权限", "Channels and Access") }}</span>
            <strong>{{ project.platforms.length }}</strong>
          </div>
          <div class="cs-platform-badges">
            <span v-for="platform in project.platforms" :key="platform.id" class="cs-chip">
              {{ platform.type || text("未命名平台", "Unnamed Platform") }}
            </span>
            <span v-if="!project.platforms.length" class="cs-chip">
              {{ text("暂无平台", "No Platforms") }}
            </span>
          </div>
          <label class="form-field">
            <span class="form-label">{{ text("管理员来源", "Admin From") }}</span>
            <textarea
              :value="project.adminFrom"
              class="form-input cs-inline-textarea"
              :placeholder="text('多个来源用逗号分隔；留空会禁用管理命令', 'Comma-separated sources; leave empty to disable privileged commands')"
              @input="$emit('update-project-field', project.id, 'adminFrom', inputValue($event))"
            />
          </label>
        </section>
      </div>

      <details class="cs-agent-config-details">
        <summary>
          <span>{{ text("平台渠道配置", "Platform Channel Config") }}</span>
          <small>{{ text(`${project.platforms.length} 个渠道`, `${project.platforms.length} channels`) }}</small>
        </summary>
        <div class="cs-agent-config-details-body">
          <div class="cs-subsection-header cs-subsection-header-tight">
            <div>
              <strong>{{ text("渠道类型", "Channel Types") }}</strong>
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
            <div v-if="!project.platforms.length" class="cs-empty-lite">
              {{ text("暂无平台渠道。", "No platform channels yet.") }}
            </div>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-cc-connect.css";

export type CodexStackCcConnectProjectField = "name" | "adminFrom" | "agentType" | "providerRefsText";
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
  providerRefsText: string;
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
