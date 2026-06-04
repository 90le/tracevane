<template>
  <article class="cs-surface cs-runtime-config-card cs-route-config-console">
    <div class="cs-card-header cs-route-config-head">
      <div>
        <p class="cs-section-kicker">{{ text("运行时", "Runtime") }}</p>
        <h4>{{ text("路由模型配置", "Route Model Config") }}</h4>
      </div>
      <span class="cs-status-pill" :class="codexRouteActive === 'cpa' ? 'tone-accent' : 'tone-neutral'">
        {{ codexRouteActive === "cpa" ? text("旧本地路由", "Legacy local route") : text("官方登录", "Official login") }}
      </span>
    </div>

    <section class="cs-route-selector" aria-labelledby="codex-route-title">
      <div>
        <span id="codex-route-title" class="form-label">{{ text("Codex 使用路径", "Codex Route") }}</span>
        <strong>{{ routeLabel }}</strong>
        <dl class="cs-route-facts" aria-label="Codex route authentication status">
          <div>
            <dt>{{ text("当前 auth.json", "Current auth.json") }}</dt>
            <dd>{{ codexAuthModeLabel }}</dd>
          </div>
          <div :class="officialAuthBackupReady ? 'tone-sage' : 'tone-warning'">
            <dt>{{ text("官方登录备份", "Official login backup") }}</dt>
            <dd>{{ officialBackupLabel }}</dd>
          </div>
        </dl>
      </div>
      <div class="cs-route-actions">
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('save-and-use-official')">
          {{ hasChanges ? text("保存并用官方 ChatGPT", "Save and Use Official ChatGPT") : text("用官方 ChatGPT", "Use Official ChatGPT") }}
        </button>
      </div>
      <p v-if="routeActionHelp" class="cs-disabled-help">
        {{ routeActionHelp }}
      </p>
    </section>

    <div class="cs-route-config-grid">
      <section class="cs-route-config-group">
        <div class="cs-route-config-group-head">
          <span>{{ text("模型", "Model") }}</span>
          <strong>{{ form.defaultModel || "--" }}</strong>
        </div>
        <div class="cs-form-grid">
          <label class="form-field cs-form-span-2">
            <span class="form-label">{{ text("默认模型", "Default Model") }}</span>
            <select :value="form.defaultModel" class="form-input" @change="updateSelectField('defaultModel', $event)">
              <option v-for="model in modelOptions" :key="`config-${model}`" :value="model">{{ model }}</option>
            </select>
          </label>
          <label class="form-field">
            <span class="form-label">{{ text("Codex 上下文", "Codex Context") }}</span>
            <select
              :value="form.contextMode"
              class="form-input"
              @change="updateSelectField('contextMode', $event)"
              @input="updateSelectField('contextMode', $event)"
            >
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

      <section class="cs-route-config-group">
        <div class="cs-route-config-group-head">
          <span>{{ text("项目", "Project") }}</span>
          <strong>{{ form.ccConnectProject || "main" }}</strong>
        </div>
        <div class="cs-form-grid">
          <label class="form-field cs-form-span-2">
            <span class="form-label">{{ text("cc-connect 项目", "cc-connect Project") }}</span>
            <input :value="form.ccConnectProject" class="form-input" @input="updateStringField('ccConnectProject', $event)" />
          </label>
        </div>
      </section>

      <section class="cs-route-config-group cs-route-config-group-wide">
        <div>
          <div class="cs-route-config-group-head">
            <span>{{ text("上游与代理", "Upstream and proxy") }}</span>
            <strong>{{ form.upstreamBaseUrl || text("使用默认上游", "Default upstream") }}</strong>
          </div>
          <div class="cs-form-grid">
            <label class="form-field cs-form-span-2">
              <span class="form-label">{{ text("上游 Base URL", "Upstream Base URL") }}</span>
              <input
                :value="form.upstreamBaseUrl"
                class="form-input"
                placeholder="https://api.example.com/v1"
                @input="updateStringField('upstreamBaseUrl', $event)"
              />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text("上游 API Key", "Upstream API Key") }}</span>
              <input
                :value="form.upstreamApiKey"
                class="form-input"
                type="password"
                :placeholder="text('留空不修改现有上游密钥', 'Leave empty to keep the existing upstream key')"
                @input="updateStringField('upstreamApiKey', $event)"
              />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text("海外上游代理", "Foreign Provider Proxy") }}</span>
              <input
                :value="form.providerProxyUrl"
                class="form-input"
                placeholder="http://127.0.0.1:7890"
                @input="updateStringField('providerProxyUrl', $event)"
              />
            </label>
            <label class="form-field">
              <span class="form-label">NO_PROXY</span>
              <input
                :value="form.noProxy"
                class="form-input"
                placeholder="localhost,127.0.0.1,::1"
                @input="updateStringField('noProxy', $event)"
              />
            </label>
          </div>
        </div>
      </section>
    </div>

    <div v-if="restartRequiredUnits.length" class="cs-restart-hint cs-restart-hint-block">
      <strong>{{ text("待应用重启", "Restart pending") }}</strong>
      <span>{{ restartRequiredUnits.join(", ") }}</span>
      <small>
        {{ text("保存配置不会拉起旧本地代理；Codex 接管改由 Studio Gateway daemon 完成。", "Saving config will not start the legacy local proxy; Codex takeover is handled by Studio Gateway daemon.") }}
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
        {{ text("只保存配置", "Save Config Only") }}
      </button>
      <p v-if="saveDisabledHelp" class="cs-disabled-help">
        {{ saveDisabledHelp }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-settings.css";

export type CodexStackRuntimeContextMode = "default" | "codex-1m" | "custom";
export type CodexStackRouteActive = "official-chatgpt" | "cpa";

export interface CodexStackRuntimeConfigDraft {
	  defaultModel: string;
	  contextMode: CodexStackRuntimeContextMode;
	  contextWindowTokens: number;
	  ccConnectProject: string;
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

const props = defineProps<{
  form: CodexStackRuntimeConfigDraft;
  modelOptions: string[];
  contextTokensDisabled: boolean;
  contextTokensDisabledHelp: string;
  restartRequiredUnits: string[];
  impactItems: CodexStackRuntimeConfigImpactItem[];
  codexRouteActive: CodexStackRouteActive;
  codexRouteCurrentModel: string;
  codexRouteCpaTargetModel: string;
  codexRouteOfficialModel: string;
  codexAuthMode: string | null;
  officialAuthBackupReady: boolean;
  canRunMutation: boolean;
  hasChanges: boolean;
  mutationDisabledHelp: string;
}>();

const emit = defineEmits<{
  save: [];
  "update-field": [field: CodexStackRuntimeConfigField, value: string | number];
  "save-and-use-official": [];
}>();

const { text } = useLocalePreference();

const saveDisabledHelp = computed(() => {
  if (!props.canRunMutation) return props.mutationDisabledHelp;
  if (!props.hasChanges) return text("当前运行配置没有变化；修改后才能保存。", "Runtime config has no changes; edit a field before saving.");
  return "";
});

const routeLabel = computed(() => props.codexRouteActive === "cpa"
  ? text("当前仍是旧本地兼容端点", "Currently using the legacy local compatible endpoint")
  : text("当前使用官方 ChatGPT 登录", "Currently using official ChatGPT login"));

const codexAuthModeLabel = computed(() => {
  if (!props.codexAuthMode) return text("未检测到认证文件", "No auth file detected");
  if (props.codexAuthMode === "apikey") return text("本地 API Key", "Local API key");
  if (props.codexAuthMode === "chatgpt") return text("ChatGPT 登录", "ChatGPT login");
  return props.codexAuthMode;
});

const officialBackupLabel = computed(() => props.officialAuthBackupReady
  ? text("可无损切回官方", "Official restore ready")
  : text("可能需要重新登录", "May require login"));

const routeActionHelp = computed(() => {
  if (!props.canRunMutation) return props.mutationDisabledHelp;
  if (props.codexRouteActive === "cpa" && !props.officialAuthBackupReady) {
    return text(
      "没有官方登录备份；切回官方后可能需要重新登录。",
      "No official login backup; switching back may require login.",
    );
  }
  return "";
});

function eventValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : "";
}

function updateStringField(field: CodexStackRuntimeConfigField, event: Event): void {
  emit("update-field", field, eventValue(event));
}

function updateSelectField(field: CodexStackRuntimeConfigField, event: Event): void {
  emit("update-field", field, eventValue(event));
}

function updateNumberField(field: CodexStackRuntimeConfigField, event: Event): void {
  emit("update-field", field, Number(eventValue(event)) || 0);
}
</script>
