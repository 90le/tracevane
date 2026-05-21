<template>
  <div class="cs-cc-provider-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("Provider", "Provider") }}</p>
        <h4>{{ text("上游 Provider 可视化编辑", "Visual Upstream Provider Editor") }}</h4>
        <p class="cs-field-hint">
          {{ text("cc-connect 通常不需要单独配置上游，推荐统一指向本地 Compact Proxy。", "cc-connect usually does not need a separate upstream; point providers to the local Compact Proxy.") }}
        </p>
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
      </div>
    </div>

    <div v-if="loading" class="cs-empty-lite">
      {{ text("正在读取 cc-connect 配置...", "Loading cc-connect config...") }}
    </div>
    <div v-else-if="!providers.length" class="cs-empty-lite">
      <p>
        {{ text("当前配置没有 providers。cc-connect 可以依赖环境变量运行，但建议显式新增 cpa provider，指向本地 Compact Proxy。", "No providers are declared. cc-connect can rely on environment variables, but adding an explicit cpa provider pointing to the local Compact Proxy is recommended.") }}
      </p>
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
          <label class="form-field cs-form-span-2">
            <span class="form-label">base_url</span>
            <input
              :value="provider.baseUrl"
              class="form-input"
              :placeholder="compactProxyBaseUrl"
              @input="$emit('update-provider-field', provider.id, 'baseUrl', inputValue($event))"
            />
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
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

export type CodexStackCcConnectProviderField = "name" | "codexEnvKey" | "baseUrl" | "apiKey";

export interface CodexStackCcConnectProviderDraft {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  codexEnvKey: string;
}

defineProps<{
  language: string;
  providers: CodexStackCcConnectProviderDraft[];
  compactProxyBaseUrl: string;
  loading: boolean;
  busy: boolean;
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

<style scoped>
.cs-cc-provider-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cs-card-header,
.cs-provider-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4,
.cs-provider-head strong {
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

.cs-provider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-provider-grid-roomy {
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  margin-top: 2px;
}

.cs-provider-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  padding: 14px;
}

.cs-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-form-grid-compact {
  margin-top: 12px;
}

.cs-form-span-2 {
  grid-column: 1 / -1;
}

.cs-language-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.86rem;
}

.cs-language-field .form-input {
  width: 84px;
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

.danger-text {
  color: var(--danger);
}

@media (max-width: 960px) {
  .cs-card-header,
  .cs-provider-head {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-provider-grid,
  .cs-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
