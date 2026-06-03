<template>
  <div class="cs-install-config-workbench">
    <div class="cs-install-config-grid">
    <section class="cs-install-config-section">
      <div class="cs-config-section-head">
        <div>
          <p class="cs-section-kicker">{{ text("可选参数", "Optional Setup") }}</p>
          <h4>{{ text("选择渠道", "Choose Channel") }}</h4>
        </div>
      </div>
      <div class="cs-channel-grid">
        <label class="cs-channel-choice" :class="{ 'cs-channel-choice-active': form.channel === 'dmwork' }">
          <input :checked="form.channel === 'dmwork'" type="radio" value="dmwork" @change="updateStringField('channel', $event)" />
          <strong>DMWork</strong>
          <span>{{ text("增强版", "Enhanced") }}</span>
        </label>
        <label class="cs-channel-choice" :class="{ 'cs-channel-choice-active': form.channel === 'octo' }">
          <input :checked="form.channel === 'octo'" type="radio" value="octo" @change="updateStringField('channel', $event)" />
          <strong>Octo</strong>
          <span>{{ text("增强版（推荐）", "Enhanced (Recommended)") }}</span>
        </label>
        <label class="cs-channel-choice" :class="{ 'cs-channel-choice-active': form.channel === 'official' }">
          <input :checked="form.channel === 'official'" type="radio" value="official" @change="updateStringField('channel', $event)" />
          <strong>{{ text("官方版", "Official") }}</strong>
          <span>npm</span>
        </label>
      </div>
    </section>

    <section class="cs-install-flow-strip">
      <div class="cs-config-section-head">
        <div>
          <p class="cs-section-kicker">{{ text("统一配置", "Unified Config") }}</p>
          <h4>{{ text("模型与上游链路", "Model and Upstream Chain") }}</h4>
        </div>
      </div>
      <div class="cs-install-chain-steps">
        <span>{{ text("上游 API", "Upstream API") }}</span>
        <span>CPA :{{ form.cpaPort }}</span>
        <span>Compact :{{ form.compactPort }}</span>
        <span>{{ form.model || "--" }}</span>
        <span>cc-connect</span>
      </div>
    </section>

    <section class="cs-install-config-section">
      <div class="cs-config-section-head">
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
    </section>
    </div>

    <details class="cs-install-advanced-drawer">
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
import "./codex-stack-install.css";
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
