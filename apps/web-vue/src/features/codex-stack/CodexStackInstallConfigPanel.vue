<template>
  <div class="cs-install-config-panel">
    <div class="cs-install-grid">
    <article class="cs-surface">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("可选参数", "Optional Setup") }}</p>
          <h4>{{ text("选择渠道", "Choose Channel") }}</h4>
        </div>
      </div>
      <p class="cs-field-hint">
        {{ text("DMWork / Octo 版本支持多渠道；官方版通过 npm 安装 cc-connect。", "DMWork / Octo supports multi-channel, while Official installs cc-connect from npm.") }}
      </p>
      <div class="cs-channel-grid">
        <label class="cs-channel-card" :class="{ 'cs-channel-card-active': form.channel === 'dmwork' }">
          <input :checked="form.channel === 'dmwork'" type="radio" value="dmwork" @change="updateStringField('channel', $event)" />
          <strong>DMWork</strong>
          <span>{{ text("增强版", "Enhanced") }}</span>
          <p>{{ text("自编译二进制，三渠道支持。", "Self-built binary with three-channel support.") }}</p>
        </label>
        <label class="cs-channel-card" :class="{ 'cs-channel-card-active': form.channel === 'octo' }">
          <input :checked="form.channel === 'octo'" type="radio" value="octo" @change="updateStringField('channel', $event)" />
          <strong>Octo</strong>
          <span>{{ text("增强版（推荐）", "Enhanced (Recommended)") }}</span>
          <p>{{ text("DMWork 品牌升级版，后续主力维护。", "Rebranded DMWork, the primary channel going forward.") }}</p>
        </label>
        <label class="cs-channel-card" :class="{ 'cs-channel-card-active': form.channel === 'official' }">
          <input :checked="form.channel === 'official'" type="radio" value="official" @change="updateStringField('channel', $event)" />
          <strong>{{ text("官方版", "Official") }}</strong>
          <span>{{ text("走 npm 分发，适合标准环境。", "Distributed via npm for standard environments.") }}</span>
          <p>{{ text("支持飞书 / 微信。", "Supports Feishu / Weixin.") }}</p>
        </label>
      </div>
    </article>

    <article class="cs-surface cs-flow-card">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("统一配置", "Unified Config") }}</p>
          <h4>{{ text("模型与上游链路", "Model and Upstream Chain") }}</h4>
        </div>
      </div>
      <p class="cs-field-hint">
        {{ text("默认选择遵循 kimi-k2.6 → glm-5.1 → openclaw.json 默认模型；用户仍可手动改成任何 CPA 支持的模型。上游 API 进入 CPA，再由 Compact 暴露给 Codex 和 cc-connect。", "The default follows kimi-k2.6 → glm-5.1 → the openclaw.json default model, while users can still choose any model supported by CPA. Upstream API enters CPA, then Compact exposes it to Codex and cc-connect.") }}
      </p>
      <div class="cs-flow-steps">
        <span>{{ text("上游 API", "Upstream API") }}</span>
        <span>CPA :{{ form.cpaPort }}</span>
        <span>Compact :{{ form.compactPort }}</span>
        <span>{{ form.model || "--" }}</span>
        <span>cc-connect</span>
      </div>
    </article>

    <article class="cs-surface">
      <div class="cs-card-header">
        <div>
          <p class="cs-section-kicker">{{ text("连接参数", "Connection") }}</p>
          <h4>{{ text("基础参数", "Core Parameters") }}</h4>
        </div>
      </div>
      <div class="cs-form-grid">
        <label class="form-field">
          <span class="form-label">{{ text("默认模型", "Default Model") }}</span>
          <select :value="form.model" class="form-input" @change="updateStringField('model', $event)">
            <option v-for="model in modelOptions" :key="`install-${model}`" :value="model">{{ model }}</option>
          </select>
          <span class="form-help">{{ modelSourceLabel }}</span>
        </label>
        <label class="form-field">
          <span class="form-label">{{ text("CPA 端口", "CPA Port") }}</span>
          <input :value="form.cpaPort" class="form-input" type="number" min="1" @input="updateNumberField('cpaPort', $event)" />
        </label>
        <label class="form-field">
          <span class="form-label">{{ text("Compact 端口", "Compact Port") }}</span>
          <input :value="form.compactPort" class="form-input" type="number" min="1" @input="updateNumberField('compactPort', $event)" />
        </label>
        <label class="form-field">
          <span class="form-label">{{ text("代理密钥", "Proxy Key") }}</span>
          <input :value="form.cpaKey" class="form-input" type="password" :maxlength="72" @input="updateStringField('cpaKey', $event)" />
          <span class="form-hint">{{ text("建议使用 16-72 个字符", "Recommended 16-72 characters") }}</span>
        </label>
        <label class="form-field">
          <span class="form-label">{{ text("Codex 上下文", "Codex Context") }}</span>
          <select :value="form.contextMode" class="form-input" @change="updateStringField('contextMode', $event)">
            <option value="default">{{ text("默认上下文", "Default context") }}</option>
            <option value="codex-1m">{{ text("1M 上下文", "1M context") }}</option>
            <option value="custom">{{ text("自定义 token", "Custom tokens") }}</option>
          </select>
          <span class="form-help">{{ text("1M 适合支持大上下文的模型；默认模式不会写 model_context_window。", "1M is for large-context models; default mode does not write model_context_window.") }}</span>
        </label>
        <label class="form-field">
          <span class="form-label">{{ text("上下文 tokens", "Context tokens") }}</span>
          <input
            :value="form.contextWindowTokens"
            class="form-input"
            type="number"
            min="1000"
            max="1050000"
            step="1000"
            :disabled="contextTokensDisabled"
            @input="updateNumberField('contextWindowTokens', $event)"
          />
          <span v-if="contextTokensDisabled && contextTokensDisabledHelp" class="form-help">
            {{ contextTokensDisabledHelp }}
          </span>
        </label>
      </div>
    </article>
    </div>

    <details class="cs-surface cs-details">
      <summary>{{ text("高级选项", "Advanced Options") }}</summary>
      <div class="cs-details-body">
        <div class="cs-checkbox-grid">
          <label class="cs-switch-row">
            <input :checked="form.skipNpm" type="checkbox" @change="updateBooleanField('skipNpm', $event)" />
            {{ text("跳过 npm 更新", "Skip npm update") }}
          </label>
          <label class="cs-switch-row">
            <input :checked="form.skipCcConnect" type="checkbox" @change="updateBooleanField('skipCcConnect', $event)" />
            {{ text("跳过 cc-connect", "Skip cc-connect") }}
          </label>
          <label class="cs-switch-row">
            <input :checked="form.noStart" type="checkbox" @change="updateBooleanField('noStart', $event)" />
            {{ text("只写配置不启动服务", "Write config only") }}
          </label>
          <label class="cs-switch-row">
            <input :checked="form.skipExisting" type="checkbox" @change="updateBooleanField('skipExisting', $event)" />
            {{ text("自动跳过已安装组件", "Auto-skip installed") }}
          </label>
          <label class="cs-switch-row">
            <input :checked="form.forceReinstall" type="checkbox" @change="updateBooleanField('forceReinstall', $event)" />
            {{ text("强制全部重新安装", "Force reinstall all") }}
          </label>
        </div>
        <div class="cs-form-grid">
          <label class="form-field">
            <span class="form-label">{{ text("上游 URL", "Upstream URL") }}</span>
            <input :value="form.upstreamBaseUrl" class="form-input" placeholder="https://api.example.com/v1" @input="updateStringField('upstreamBaseUrl', $event)" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text("上游 API Key", "Upstream API Key") }}</span>
            <input :value="form.upstreamApiKey" class="form-input" type="password" @input="updateStringField('upstreamApiKey', $event)" />
          </label>
          <label class="form-field">
            <span class="form-label">{{ text("海外上游代理", "Foreign Provider Proxy") }}</span>
            <input :value="form.providerProxyUrl" class="form-input" placeholder="http://127.0.0.1:7897" @input="updateStringField('providerProxyUrl', $event)" />
            <span class="form-help">{{ text("留空则自动读取 OpenAI/海外上游代理；国内网关默认直连。", "Leave empty to auto-detect proxy for OpenAI/foreign providers; domestic gateways stay direct.") }}</span>
          </label>
          <label class="form-field">
            <span class="form-label">NO_PROXY</span>
            <input :value="form.noProxy" class="form-input" placeholder="localhost,127.0.0.1,::1" @input="updateStringField('noProxy', $event)" />
          </label>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import type { CodexStackChannel } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackRuntimeContextMode } from "./CodexStackRuntimeConfigCard.vue";

export interface CodexStackInstallConfigDraft {
  model: string;
  contextMode: CodexStackRuntimeContextMode;
  contextWindowTokens: number;
  cpaPort: number;
  compactPort: number;
  cpaKey: string;
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  providerProxyUrl: string;
  noProxy: string;
  skipNpm: boolean;
  skipCcConnect: boolean;
  noStart: boolean;
  skipExisting: boolean;
  forceReinstall: boolean;
  channel: CodexStackChannel;
}

export type CodexStackInstallConfigField = keyof CodexStackInstallConfigDraft;

defineProps<{
  form: CodexStackInstallConfigDraft;
  modelOptions: string[];
  modelSourceLabel: string;
  contextTokensDisabled: boolean;
  contextTokensDisabledHelp: string;
}>();

const emit = defineEmits<{
  updateField: [field: CodexStackInstallConfigField, value: string | number | boolean];
}>();

const { text } = useLocalePreference();

function eventValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : "";
}

function eventChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function updateStringField(field: CodexStackInstallConfigField, event: Event): void {
  emit("updateField", field, eventValue(event));
}

function updateNumberField(field: CodexStackInstallConfigField, event: Event): void {
  emit("updateField", field, Number(eventValue(event)) || 0);
}

function updateBooleanField(field: CodexStackInstallConfigField, event: Event): void {
  emit("updateField", field, eventChecked(event));
}
</script>

<style scoped>
.cs-install-config-panel {
  display: contents;
}

.cs-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4 {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-install-grid,
.cs-channel-grid,
.cs-form-grid,
.cs-checkbox-grid,
.cs-flow-steps {
  display: grid;
}

.cs-install-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.cs-channel-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cs-channel-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.cs-channel-card input {
  display: none;
}

.cs-channel-card p,
.cs-channel-card span {
  margin: 0;
  color: var(--text-soft);
}

.cs-channel-card-active {
  border-color: color-mix(in srgb, var(--acc) 42%, var(--line));
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 12%, transparent), color-mix(in srgb, var(--surface) 98%, transparent));
  transform: translateY(-1px);
}

.cs-flow-card {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--success) 12%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 92%, #101820 8%), var(--surface));
}

.cs-flow-steps {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.cs-flow-steps span {
  position: relative;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--acc) 26%, var(--line));
  border-radius: 16px;
  background: color-mix(in srgb, var(--acc) 10%, var(--surface));
  color: var(--text);
  font-weight: 650;
  text-align: center;
}

.cs-flow-steps span:not(:last-child)::after {
  content: ">";
  position: absolute;
  right: -10px;
  color: var(--muted);
  font-weight: 700;
}

.cs-form-grid,
.cs-checkbox-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-help {
  color: var(--text-soft);
  font-size: 0.84rem;
}

.cs-details summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text);
}

.cs-details-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.cs-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-soft);
}

@media (max-width: 960px) {
  .cs-channel-grid,
  .cs-install-grid,
  .cs-form-grid,
  .cs-checkbox-grid,
  .cs-flow-steps {
    grid-template-columns: 1fr;
  }

  .cs-flow-steps span:not(:last-child)::after {
    content: "v";
    right: auto;
    bottom: -13px;
  }
}
</style>
