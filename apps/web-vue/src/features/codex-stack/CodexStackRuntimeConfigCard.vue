<template>
  <article class="cs-surface cs-runtime-config-card">
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
        <span class="form-help">{{ text("这是 CPA 目标模型；保存配置不会自动把 Codex 切到 CPA。", "This is the CPA target model; saving config does not automatically switch Codex to CPA.") }}</span>
      </label>
      <section class="form-field cs-form-span-2 cs-route-selector" aria-labelledby="codex-route-title">
        <div>
          <span id="codex-route-title" class="form-label">{{ text("Codex 使用路径", "Codex Route") }}</span>
          <strong>{{ routeLabel }}</strong>
          <span class="form-help">{{ routeDetail }}</span>
        </div>
        <div class="cs-route-actions">
          <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('save-and-use-official')">
            {{ hasChanges ? text("保存并用官方 ChatGPT", "Save and Use Official ChatGPT") : text("用官方 ChatGPT", "Use Official ChatGPT") }}
          </button>
          <button type="button" class="primary-button" :disabled="!canRunMutation" @click="$emit('save-and-attach-cpa')">
            {{ hasChanges ? text("保存并验证 CPA", "Save and Verify CPA") : text("验证后用 CPA", "Verify and Use CPA") }}
          </button>
          <button type="button" class="primary-button is-danger" :disabled="!canRunMutation" @click="$emit('save-and-force-cpa')">
            {{ hasChanges ? text("保存并强制 CPA", "Save and Force CPA") : text("强制用 CPA", "Force CPA") }}
          </button>
        </div>
        <p v-if="routeActionHelp" class="cs-disabled-help">
          {{ routeActionHelp }}
        </p>
      </section>
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
        <span v-if="contextTokensDisabled && contextTokensDisabledHelp" class="form-help">
          {{ contextTokensDisabledHelp }}
        </span>
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
  canAttachCodexCpa: boolean;
  attachCodexCpaDisabledHelp: string;
  canRunMutation: boolean;
  hasChanges: boolean;
  mutationDisabledHelp: string;
}>();

const emit = defineEmits<{
  save: [];
  updateField: [field: CodexStackRuntimeConfigField, value: string | number];
  "save-and-attach-cpa": [];
  "save-and-force-cpa": [];
  "save-and-use-official": [];
}>();

const { text } = useLocalePreference();

const saveDisabledHelp = computed(() => {
  if (!props.canRunMutation) return props.mutationDisabledHelp;
  if (!props.hasChanges) return text("当前运行配置没有变化；修改后才能保存。", "Runtime config has no changes; edit a field before saving.");
  return "";
});

const routeLabel = computed(() => props.codexRouteActive === "cpa"
  ? text("当前使用 CPA / Compact 兼容端点", "Currently using CPA / Compact compatible endpoint")
  : text("当前使用官方 ChatGPT 登录", "Currently using official ChatGPT login"));

const routeDetail = computed(() => props.codexRouteActive === "cpa"
  ? text(
    `Codex 会走本地 CPA，当前模型为 ${props.codexRouteCurrentModel || "--"}；运行配置里的模型和上游会影响这条路径。`,
    `Codex uses local CPA with ${props.codexRouteCurrentModel || "--"}; the model and upstream fields affect this route.`,
  )
  : text(
    `Codex 走官方账户登录，建议模型为 ${props.codexRouteOfficialModel || "gpt-5.5"}；运行配置里的第三方上游只作为 CPA 目标。`,
    `Codex uses the official account login, recommended model ${props.codexRouteOfficialModel || "gpt-5.5"}; third-party upstream settings are only CPA targets.`,
  ));

const routeActionHelp = computed(() => {
  if (!props.canRunMutation) return props.mutationDisabledHelp;
  if (props.hasChanges) {
    return text("推荐用上方“保存并验证 CPA”或“保存并用官方 ChatGPT”，避免保存后再去其它页面切换。", "Use Save and Verify CPA or Save and Use Official ChatGPT above so you do not need to switch pages after saving.");
  }
  if (!props.canAttachCodexCpa) {
    return text(
      `${props.attachCodexCpaDisabledHelp} 仍可强制 CPA，但 Codex 普通请求、流式、长任务或压缩上下文可能失败。`,
      `${props.attachCodexCpaDisabledHelp} You can still force CPA, but ordinary, streaming, long-task, or compaction requests may fail.`,
    );
  }
  return text(
    `CPA 将使用目标模型 ${props.codexRouteCpaTargetModel || props.form.defaultModel || "--"}；点击后会重新 smoke，通过后才切换。`,
    `CPA will use target model ${props.codexRouteCpaTargetModel || props.form.defaultModel || "--"}; clicking reruns smoke and switches only after it passes.`,
  );
});

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
