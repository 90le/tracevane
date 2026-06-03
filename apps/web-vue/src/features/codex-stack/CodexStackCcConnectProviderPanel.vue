<template>
  <div class="cs-cc-provider-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("Provider", "Provider") }}</p>
        <h4>{{ text("上游 Provider 可视化编辑", "Visual Upstream Provider Editor") }}</h4>
      </div>
      <div class="cs-actions">
        <label class="cs-language-field">
          <span>{{ text("语言", "Language") }}</span>
          <input
            :value="language"
            class="form-input"
            placeholder="zh"
            @input="$emit('update-language', inputValue($event))"
          />
        </label>
        <button type="button" class="secondary-button" :disabled="busy" @click="$emit('ensure-cpa-provider')">
          {{ text("补齐 CPA Provider", "Add CPA Provider") }}
        </button>
        <button type="button" class="secondary-button" :disabled="busy" @click="$emit('add-provider')">
          {{ text("新增 Provider", "Add Provider") }}
        </button>
        <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
          {{ busyDisabledHelp }}
        </p>
      </div>
    </div>

    <div v-if="loading" class="cs-empty-lite">
      {{ text("正在读取 cc-connect 配置...", "Loading cc-connect config...") }}
    </div>
    <div v-else-if="!providers.length" class="cs-empty-lite">
      <button type="button" class="secondary-button" :disabled="busy" @click="$emit('ensure-cpa-provider')">
        {{ text("创建推荐 Provider", "Create Recommended Provider") }}
      </button>
    </div>
    <div v-else class="cs-provider-grid cs-provider-grid-roomy">
      <article
        v-for="provider in providers"
        :key="provider.id"
        class="cs-provider-card"
      >
        <div class="cs-provider-head">
          <strong>{{ provider.name || text("未命名 Provider", "Unnamed Provider") }}</strong>
          <button type="button" class="text-button danger-text" :disabled="busy" @click="$emit('remove-provider', provider.id)">
            {{ text("删除", "Delete") }}
          </button>
        </div>
        <div class="cs-form-grid cs-form-grid-compact">
          <label class="form-field">
            <span class="form-label">name</span>
            <input
              :value="provider.name"
              class="form-input"
              placeholder="cpa"
              @input="$emit('update-provider-field', provider.id, 'name', inputValue($event))"
            />
          </label>
          <label class="form-field">
            <span class="form-label">codex.env_key</span>
            <input
              :value="provider.codexEnvKey"
              class="form-input"
              placeholder="OPENAI_API_KEY"
              @input="$emit('update-provider-field', provider.id, 'codexEnvKey', inputValue($event))"
            />
          </label>
          <label class="form-field">
            <span class="form-label">model</span>
            <input
              :value="provider.model"
              class="form-input"
              placeholder="gpt-5.4 / claude-sonnet-4-6"
              @input="$emit('update-provider-field', provider.id, 'model', inputValue($event))"
            />
          </label>
          <label class="form-field">
            <span class="form-label">agent_types</span>
            <input
              :value="provider.agentTypesText"
              class="form-input"
              placeholder="codex, claudecode"
              @input="$emit('update-provider-field', provider.id, 'agentTypesText', inputValue($event))"
            />
          </label>
          <label class="form-field cs-form-span-2">
            <span class="form-label">base_url</span>
            <input
              :value="provider.baseUrl"
              class="form-input"
              :placeholder="compactProxyBaseUrl"
              @input="$emit('update-provider-field', provider.id, 'baseUrl', inputValue($event))"
            />
          </label>
          <label class="form-field">
            <span class="form-label">endpoints.codex</span>
            <input
              :value="provider.codexBaseUrl"
              class="form-input"
              :placeholder="compactProxyBaseUrl"
              @input="$emit('update-provider-field', provider.id, 'codexBaseUrl', inputValue($event))"
            />
          </label>
          <label class="form-field">
            <span class="form-label">endpoints.claudecode</span>
            <input
              :value="provider.claudeBaseUrl"
              class="form-input"
              :placeholder="compactProxyBaseUrl.replace(/\/v1$/, '')"
              @input="$emit('update-provider-field', provider.id, 'claudeBaseUrl', inputValue($event))"
            />
          </label>
          <label class="form-field">
            <span class="form-label">codex.wire_api</span>
            <select
              :value="provider.codexWireApi"
              class="form-input"
              @change="$emit('update-provider-field', provider.id, 'codexWireApi', inputValue($event))"
            >
              <option value="">{{ text("继承", "Inherit") }}</option>
              <option value="responses">responses</option>
              <option value="chat">chat</option>
            </select>
          </label>
          <label class="form-field cs-form-span-2">
            <span class="form-label">api_key</span>
            <input
              :value="provider.apiKey"
              class="form-input"
              type="password"
              :placeholder="text('留空表示不写入或保留空值', 'Leave empty to write/keep an empty value')"
              @input="$emit('update-provider-field', provider.id, 'apiKey', inputValue($event))"
            />
          </label>
          <label class="form-field cs-form-span-2">
            <span class="form-label">models</span>
            <textarea
              :value="provider.modelListText"
              class="form-input cs-provider-model-list"
              :placeholder="text('每行一个模型；可写 alias=model', 'One model per line; alias=model is supported')"
              @input="$emit('update-provider-field', provider.id, 'modelListText', inputValue($event))"
            ></textarea>
          </label>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-cc-connect.css";

export type CodexStackCcConnectProviderField =
  | "name"
  | "codexEnvKey"
  | "baseUrl"
  | "apiKey"
  | "model"
  | "agentTypesText"
  | "codexBaseUrl"
  | "claudeBaseUrl"
  | "codexWireApi"
  | "modelListText";

export interface CodexStackCcConnectProviderDraft {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  codexEnvKey: string;
  model: string;
  agentTypesText: string;
  codexBaseUrl: string;
  claudeBaseUrl: string;
  codexWireApi: string;
  modelListText: string;
}

defineProps<{
  language: string;
  providers: CodexStackCcConnectProviderDraft[];
  compactProxyBaseUrl: string;
  loading: boolean;
  busy: boolean;
  busyDisabledHelp: string;
}>();

defineEmits<{
  "update-language": [language: string];
  "update-provider-field": [providerId: string, field: CodexStackCcConnectProviderField, value: string];
  "ensure-cpa-provider": [];
  "add-provider": [];
  "remove-provider": [providerId: string];
}>();

const { text } = useLocalePreference();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
</script>
