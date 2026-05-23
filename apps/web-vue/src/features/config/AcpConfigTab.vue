<template>
  <section class="page-shell config-section-grid">
    <article class="config-sheet">
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('ACPX 运行时状态', 'ACPX Runtime Status') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection" :class="{ 'is-risk': acpxExplicitlyDisabled, 'is-primary': !acpxExplicitlyDisabled }">
            <div class="settings-stack">
              <div class="field-hint">
                {{ acpxStatusMessage }}
              </div>
              <div class="field-hint">
                {{
                  text(
                    '当前宿主版本通常内置 bundled `acpx`，一般不需要单独安装。若保存后仍提示缺失，通常说明宿主安装损坏或被精简，需要重装 / 升级 OpenClaw。',
                    'This host version usually bundles `acpx`, so a separate install is normally unnecessary. If it still reports missing after save, the host install is likely damaged or stripped and should be reinstalled/upgraded.'
                  )
                }}
              </div>
              <div class="acpx-actions">
                <button type="button" class="secondary-button compact-button" :disabled="saving" @click="applyBundledAcpxAndSave">
                  {{ useBundledAcpxLabel }}
                </button>
              </div>
              <div v-if="actionMessage" class="field-hint acpx-action-message">
                {{ actionMessage }}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('ACP 基础设置', 'ACP Basic Settings') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection is-primary">
            <div class="config-subsection-head">
              <h4>{{ text('ACP 协议主开关', 'ACP protocol master switch') }}</h4>
              <p>{{ text('作用：控制 ACP 会话协议是否对宿主开放。配置方式：需要 ACP 常驻会话或远端执行编排时开启；不使用 ACP 可保持关闭。', 'Purpose: controls whether the ACP session protocol is exposed by the host. How to configure: enable it when you need ACP resident sessions or remote execution orchestration; keep it off if ACP is unused.') }}</p>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label class="toggle-card">
                  <input v-model="form.enabled" class="form-checkbox" type="checkbox" />
                  <span class="form-label">{{ text('启用 ACP', 'Enable ACP') }}</span>
                </label>
                <span class="field-hint">{{ text('启用或禁用 ACP 协议支持', 'Enable or disable ACP protocol support') }}</span>
              </div>
              <label class="form-field">
                <span class="form-label">{{ text('ACP 后端', 'ACP Backend') }}</span>
                <input v-model="form.backend" class="form-input" type="text" placeholder="acpx" />
                <span class="field-hint">{{ text('ACP 使用的后端实现', 'Backend implementation used by ACP') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('默认 Agent', 'Default Agent') }}</span>
                <input v-model="form.defaultAgent" class="form-input" type="text" />
                <span class="field-hint">{{ text('未指定时使用的默认 Agent', 'Default agent used when none is specified') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('最大并发会话', 'Max Concurrent Sessions') }}</span>
                <input v-model.number="form.maxConcurrentSessions" class="form-input" type="number" min="1" />
                <span class="field-hint">{{ text('允许的最大并发会话数量', 'Maximum number of concurrent sessions allowed') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('ACP 调度', 'ACP Dispatch') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('ACP 请求分发', 'ACP request dispatch') }}</h4>
              <p>{{ text('作用：控制 ACP 请求是否自动交给后端处理。配置方式：使用 ACP backend 时通常保持开启，仅在调试链路时临时关闭。', 'Purpose: controls whether ACP requests are automatically dispatched to the backend. How to configure: keep it enabled in normal ACP backend deployments and disable it only for debugging.') }}</p>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label class="toggle-card">
                  <input v-model="form.dispatchEnabled" class="form-checkbox" type="checkbox" />
                  <span class="form-label">{{ text('启用调度', 'Enable Dispatch') }}</span>
                </label>
                <span class="field-hint">{{ text('启用 ACP 请求的自动调度', 'Enable automatic dispatch of ACP requests') }}</span>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('允许的 Agent', 'Allowed Agents') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('允许接入的 Agent', 'Agents allowed to use ACP') }}</h4>
              <p>{{ text('作用：限制哪些 Agent 可以被 ACP 会话绑定或调度。配置方式：填写 Agent id；留空表示不做额外限制。', 'Purpose: restricts which agents may be targeted by ACP sessions or dispatch. How to configure: enter agent ids; leave empty to avoid extra restriction.') }}</p>
            </div>
            <div class="settings-stack">
              <div v-if="form.allowedAgents.length === 0" class="field-hint">
                {{ text('暂无允许的 Agent，点击下方按钮添加。', 'No allowed agents yet. Click the button below to add one.') }}
              </div>
              <div v-for="(_, index) in form.allowedAgents" :key="index" class="form-grid agent-entry">
                <label class="form-field agent-field">
                  <span class="form-label">{{ text('Agent ID', 'Agent ID') }}</span>
                  <div class="agent-input-row">
                    <input v-model="form.allowedAgents[index]" class="form-input" type="text" :placeholder="text('输入 Agent ID', 'Enter Agent ID')" />
                    <button type="button" class="agent-remove-btn" @click="removeAgent(index)" :title="text('移除', 'Remove')" :aria-label="text('移除', 'Remove')">
                      <X class="drawer-close-icon" aria-hidden="true" />
                    </button>
                  </div>
                </label>
              </div>
              <button type="button" class="agent-add-btn" @click="addAgent">
                <Plus class="button-inline-icon" aria-hidden="true" />
                {{ text('添加 Agent', 'Add Agent') }}
              </button>
            </div>
          </section>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { Plus, X } from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';
import type { ConfigSummaryPayload } from '../../../../../types/config';

const props = defineProps<{
  summary: ConfigSummaryPayload | null;
  saving?: boolean;
}>();
const emit = defineEmits<{
  (event: 'quick-save'): void;
}>();

const { text } = useLocalePreference();

interface AcpFormState {
  enabled: boolean;
  backend: string;
  defaultAgent: string;
  maxConcurrentSessions: number;
  dispatchEnabled: boolean;
  allowedAgents: string[];
}

const form = reactive<AcpFormState>({
  enabled: false,
  backend: 'acpx',
  defaultAgent: '',
  maxConcurrentSessions: 4,
  dispatchEnabled: false,
  allowedAgents: [],
});
const actionMessage = ref('');

const normalizedBackend = computed(() => form.backend.trim().toLowerCase());
const acpxEntry = computed(() => props.summary?.plugins?.entries?.acpx);
const acpxExplicitlyDisabled = computed(() => acpxEntry.value?.enabled === false);
const bundledAcpxReady = computed(() => normalizedBackend.value === 'acpx' && form.enabled && !acpxExplicitlyDisabled.value);
const shouldEnsureAcpx = computed(() => {
  return (form.enabled || form.dispatchEnabled || normalizedBackend.value === 'acpx') && (!normalizedBackend.value || normalizedBackend.value === 'acpx');
});
const useBundledAcpxLabel = computed(() => bundledAcpxReady.value
  ? text('重新应用内置 ACPX', 'Reapply bundled ACPX')
  : text('使用内置 ACPX', 'Use bundled ACPX'));
const acpxStatusMessage = computed(() => {
  if (normalizedBackend.value && normalizedBackend.value !== 'acpx') {
    return text(
      '当前 ACP 后端不是 `acpx`，系统不会自动修复 ACPX 插件配置。',
      'The current ACP backend is not `acpx`, so ACPX plugin auto-repair will not run.'
    );
  }
  if (acpxExplicitlyDisabled.value) {
    return text(
      '当前配置里 `acpx` 被显式禁用。保存本页时会自动重新启用它。',
      '`acpx` is explicitly disabled in the current config. Saving this page will automatically enable it again.'
    );
  }
  if (acpxEntry.value) {
    return text(
      '当前配置里已经存在 `acpx` 插件项，并且处于启用状态。',
      'The current config already has an `acpx` plugin entry and it is enabled.'
    );
  }
  return text(
    '当前配置里还没有显式写出 `acpx` 插件项；如果你使用 `acpx` 后端，保存本页时会自动写入并启用它。',
    'The current config does not explicitly declare an `acpx` plugin entry yet. If you use the `acpx` backend, saving this page will automatically write and enable it.'
  );
});

function addAgent() {
  form.allowedAgents.push('');
}

function removeAgent(index: number) {
  form.allowedAgents.splice(index, 1);
}

function hydrateFromSummary(summary: ConfigSummaryPayload) {
  const acp = (summary as any).acp;
  if (!acp) return;
  actionMessage.value = '';
  form.enabled = acp?.enabled ?? false;
  form.backend = acp?.backend ?? 'acpx';
  form.defaultAgent = acp?.defaultAgent ?? '';
  form.maxConcurrentSessions = acp?.maxConcurrentSessions ?? 4;
  form.dispatchEnabled = acp?.dispatch?.enabled ?? false;
  form.allowedAgents = Array.isArray(acp?.allowedAgents) ? [...acp.allowedAgents] : [];
}

function useBundledAcpx() {
  form.backend = 'acpx';
  form.enabled = true;
  actionMessage.value = text(
    '已切换为内置 ACPX，并启用 ACP。正在保存配置…',
    'Bundled ACPX is selected and ACP is enabled. Saving configuration now...'
  );
}

function applyBundledAcpxAndSave() {
  useBundledAcpx();
  void nextTick(() => emit('quick-save'));
}

function buildAcpPayload() {
  return {
    enabled: form.enabled,
    dispatch: { enabled: form.dispatchEnabled },
    backend: form.backend,
    defaultAgent: form.defaultAgent,
    allowedAgents: form.allowedAgents.filter((a) => a.trim() !== ''),
    maxConcurrentSessions: form.maxConcurrentSessions,
  };
}

function buildPluginsPayload() {
  if (!shouldEnsureAcpx.value) return undefined;
  const allow = Array.isArray(props.summary?.plugins?.allow)
    ? Array.from(new Set([...(props.summary?.plugins?.allow || []), 'acpx']))
    : undefined;
  return {
    ...(allow && allow.length > 0 ? { allow } : {}),
    entries: {
      acpx: {
        enabled: true,
      },
    },
  };
}

watch(() => props.summary, (summary) => {
  if (summary) hydrateFromSummary(summary);
}, { immediate: true });

defineExpose({ hydrateFromSummary, buildAcpPayload, buildPluginsPayload });
</script>

<style scoped>
.acpx-actions {
  display: flex;
  justify-content: flex-start;
}

.agent-entry {
  margin-bottom: 0.25rem;
}
.agent-field {
  flex: 1;
}
.agent-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.agent-input-row .form-input {
  flex: 1;
}
.agent-remove-btn {
  background: none;
  border: 1px solid var(--border-muted, rgba(255, 255, 255, 0.12));
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.35rem 0.55rem;
  opacity: 0.7;
  transition: opacity 0.15s;
  color: inherit;
}
.agent-remove-btn:hover {
  opacity: 1;
}
.agent-add-btn {
  background: none;
  border: 1px dashed var(--border-muted, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  cursor: pointer;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  opacity: 0.7;
  transition: opacity 0.15s;
  color: inherit;
  width: 100%;
  text-align: center;
}
.agent-add-btn:hover {
  opacity: 1;
}
</style>
