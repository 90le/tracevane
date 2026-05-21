<template>
  <article class="panel-card cs-runtime-config-card">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("运行时", "Runtime") }}</p>
        <h4>{{ text("运行配置", "Runtime Config") }}</h4>
      </div>
    </div>
    <div class="cs-form-grid">
      <label class="form-field">
        <span class="form-label">{{ text("默认模型", "Default Model") }}</span>
        <select :value="form.defaultModel" class="form-input" @change="updateSelectField('defaultModel', $event)">
          <option v-for="model in modelOptions" :key="`config-${model}`" :value="model">{{ model }}</option>
        </select>
        <span class="form-help">{{ text("保存后会写入 Codex，并可同步到 cc-connect Agent。", "Saving writes to Codex and can be synced to cc-connect agents.") }}</span>
      </label>
      <label class="form-field">
        <span class="form-label">{{ text("Codex 上下文", "Codex Context") }}</span>
        <select :value="form.contextMode" class="form-input" @change="updateSelectField('contextMode', $event)">
          <option value="default">{{ text("默认上下文", "Default context") }}</option>
          <option value="codex-1m">{{ text("1M 上下文", "1M context") }}</option>
          <option value="custom">{{ text("自定义 token", "Custom tokens") }}</option>
        </select>
        <span class="form-help">{{ text("保存后会更新 ~/.codex/config.toml。", "Saving updates ~/.codex/config.toml.") }}</span>
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
        <span class="form-label">{{ text("cc-connect 项目", "cc-connect Project") }}</span>
        <input :value="form.ccConnectProject" class="form-input" @input="updateStringField('ccConnectProject', $event)" />
      </label>
      <label class="form-field cs-form-span-2">
        <span class="form-label">{{ text("代理密钥", "Proxy Key") }}</span>
        <input
          :value="form.cpaProxyKey"
          class="form-input"
          type="password"
          :placeholder="text('留空不修改', 'Leave empty to keep current value')"
          @input="updateStringField('cpaProxyKey', $event)"
        />
      </label>
      <label class="form-field cs-form-span-2">
        <span class="form-label">{{ text("上游 Base URL", "Upstream Base URL") }}</span>
        <input
          :value="form.upstreamBaseUrl"
          class="form-input"
          placeholder="https://api.example.com/v1"
          @input="updateStringField('upstreamBaseUrl', $event)"
        />
        <span class="form-help">{{ text("glm-5.1 / kimi-k2.6 等第三方兼容端点写这里；国内网关建议保持直连。", "Use this for third-party compatible endpoints such as glm-5.1 / kimi-k2.6; domestic gateways should stay direct.") }}</span>
      </label>
      <label class="form-field cs-form-span-2">
        <span class="form-label">{{ text("上游 API Key", "Upstream API Key") }}</span>
        <input
          :value="form.upstreamApiKey"
          class="form-input"
          type="password"
          :placeholder="text('留空不修改现有上游密钥', 'Leave empty to keep the existing upstream key')"
          @input="updateStringField('upstreamApiKey', $event)"
        />
      </label>
      <label class="form-field cs-form-span-2">
        <span class="form-label">{{ text("海外上游代理", "Foreign Provider Proxy") }}</span>
        <input
          :value="form.providerProxyUrl"
          class="form-input"
          placeholder="http://127.0.0.1:7890"
          @input="updateStringField('providerProxyUrl', $event)"
        />
        <span class="form-help">{{ text("仅 OpenAI/海外上游需要代理；清空后 CPA provider proxy-url 会写回 direct。", "Only OpenAI/foreign upstreams need a proxy; clearing this writes CPA provider proxy-url back to direct.") }}</span>
      </label>
      <label class="form-field cs-form-span-2">
        <span class="form-label">NO_PROXY</span>
        <input
          :value="form.noProxy"
          class="form-input"
          placeholder="localhost,127.0.0.1,::1"
          @input="updateStringField('noProxy', $event)"
        />
        <span class="form-help">{{ text("网卡/TUN 模式可能劫持国内网关；这里用于服务环境绕过本机和内网地址。", "TUN mode can hijack domestic gateways; this keeps local and intranet addresses bypassed in service env.") }}</span>
      </label>
    </div>
    <div v-if="restartRequiredUnits.length" class="cs-restart-hint cs-restart-hint-block">
      <strong>{{ text("待应用重启", "Restart pending") }}</strong>
      <span>{{ restartRequiredUnits.join(", ") }}</span>
      <small>
        {{ text("保存配置不会拉起已暂停的 CPA 栈；需要启用时用“恢复 CPA 栈”按顺序启动。", "Saving config will not start a paused CPA stack; use Resume CPA Stack when you want to bring it back up in order.") }}
      </small>
    </div>
    <div v-if="impactItems.length" class="cs-impact-list">
      <div
        v-for="item in impactItems"
        :key="item.id"
        class="cs-impact-item"
        :class="`tone-${item.tone}`"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.detail }}</span>
      </div>
    </div>
    <div class="cs-actions">
      <button type="button" class="primary-button" :disabled="!canRunMutation || !hasChanges" @click="$emit('save')">
        {{ text("保存配置", "Save Config") }}
      </button>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

export type CodexStackRuntimeContextMode = "default" | "codex-1m" | "custom";

export interface CodexStackRuntimeConfigDraft {
  defaultModel: string;
  contextMode: CodexStackRuntimeContextMode;
  contextWindowTokens: number;
  cpaPort: number;
  compactPort: number;
  ccConnectProject: string;
  cpaProxyKey: string;
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  providerProxyUrl: string;
  noProxy: string;
}

export interface CodexStackRuntimeConfigImpactItem {
  id: string;
  label: string;
  detail: string;
  tone: "info" | "warning" | "danger";
}

export type CodexStackRuntimeConfigField = keyof CodexStackRuntimeConfigDraft;

defineProps<{
  form: CodexStackRuntimeConfigDraft;
  modelOptions: string[];
  contextTokensDisabled: boolean;
  restartRequiredUnits: string[];
  impactItems: CodexStackRuntimeConfigImpactItem[];
  canRunMutation: boolean;
  hasChanges: boolean;
  mutationDisabledHelp: string;
}>();

const emit = defineEmits<{
  save: [];
  updateField: [field: CodexStackRuntimeConfigField, value: string | number];
}>();

const { text } = useLocalePreference();

function eventValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : "";
}

function updateStringField(field: CodexStackRuntimeConfigField, event: Event): void {
  emit("updateField", field, eventValue(event));
}

function updateSelectField(field: CodexStackRuntimeConfigField, event: Event): void {
  emit("updateField", field, eventValue(event));
}

function updateNumberField(field: CodexStackRuntimeConfigField, event: Event): void {
  emit("updateField", field, Number(eventValue(event)) || 0);
}
</script>

<style scoped>
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

.cs-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-form-span-2 {
  grid-column: 1 / -1;
}

.form-help {
  color: var(--text-soft);
  font-size: 0.84rem;
}

.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-restart-hint {
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

.cs-restart-hint-block {
  align-items: flex-start;
  flex-direction: column;
  border-radius: 8px;
  width: 100%;
}

.cs-restart-hint-block small {
  color: var(--text-muted);
  line-height: 1.45;
}

.cs-impact-list {
  display: grid;
  gap: 8px;
}

.cs-impact-item {
  display: grid;
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
}

.cs-impact-item strong {
  color: var(--text);
  font-size: 0.92rem;
}

.cs-impact-item span {
  color: var(--text-soft);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-impact-item.tone-warning {
  border-color: color-mix(in srgb, #f59e0b 42%, var(--line));
}

.cs-impact-item.tone-danger {
  border-color: color-mix(in srgb, #ef4444 46%, var(--line));
}

@media (max-width: 960px) {
  .cs-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
