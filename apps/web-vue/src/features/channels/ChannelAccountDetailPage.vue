<template>
  <section v-if="account && catalog && channel" class="channels-stage-view">
    <article class="panel-card channels-form-panel">
      <div class="channels-stage-task-head">
        <div>
          <p class="eyebrow">{{ channel.type }} · {{ account.id }}</p>
          <h3>{{ text('账号详情', 'Account detail') }}</h3>
          <p>{{ text('这里保留 schema 驱动字段和高级 JSON。保存入口固定在底部，不再重复出现在顶部。', 'This page keeps schema-driven fields and advanced JSON. Saving stays pinned at the bottom instead of repeating at the top.') }}</p>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">{{ text('账号 ID', 'Account ID') }}</label>
          <input v-model="draft.id" class="form-input" disabled />
        </div>
        <label class="toggle-card form-field-full">
          <input v-model="draft.enabled" class="form-checkbox" type="checkbox" />
          <div>
            <strong>{{ text('账号启用状态', 'Account enabled') }}</strong>
            <span>{{ text('这里是完整账号编辑入口，配置会显式保存。', 'This is the full account editor and changes are saved explicitly.') }}</span>
          </div>
        </label>
      </div>

      <details class="config-collapsible" open>
        <summary>{{ text('凭据', 'Credentials') }}</summary>
        <div class="form-grid">
          <div
            v-for="credentialField in catalog.credentialFields"
            :key="credentialField.key"
            class="form-field"
          >
            <label class="form-label">{{ credentialField.label }}</label>
            <input
              v-model="draft.credentialValues[credentialField.key]"
              class="form-input"
              :type="credentialField.secret ? 'password' : 'text'"
              :placeholder="credentialField.placeholder || text(`填写 ${credentialField.label}`, `Enter ${credentialField.label}`)"
            />
          </div>
        </div>
      </details>

      <details class="config-collapsible" open>
        <summary>{{ text('基础行为', 'Core behavior') }}</summary>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">{{ text('私聊策略', 'DM policy') }}</label>
            <GlassSelect v-model="draft.dmPolicy" :options="dmPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('群组策略', 'Group policy') }}</label>
            <GlassSelect v-model="draft.groupPolicy" :options="groupPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('上下文可见性', 'Context visibility') }}</label>
            <GlassSelect v-model="draft.contextVisibility" :options="contextVisibilityOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('流式响应', 'Streaming') }}</label>
            <GlassSelect v-model="draft.streaming" :options="streamingOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('连接模式', 'Connection mode') }}</label>
            <GlassSelect v-model="draft.connectionMode" :options="connectionModeOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('渲染模式', 'Render mode') }}</label>
            <GlassSelect v-model="draft.renderMode" :options="renderModeOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('代理地址', 'Proxy URL') }}</label>
            <input v-model="draft.proxy" class="form-input" />
          </div>
        </div>
      </details>

      <details v-if="groupedAccountFields.length" class="config-collapsible" open>
        <summary>{{ text('Schema 字段', 'Schema fields') }}</summary>
        <div class="form-grid">
          <template v-for="fieldGroup in groupedAccountFields" :key="fieldGroup.id">
            <div class="form-field form-field-full">
              <strong>{{ accountFieldGroupLabel(fieldGroup.id) }}</strong>
            </div>
            <template v-for="accountField in fieldGroup.fields" :key="accountField.key">
              <div v-if="accountField.input === 'boolean'" class="form-field">
                <label class="form-label">{{ accountField.label }}</label>
                <GlassSelect v-model="draft.fieldValues[accountField.key]" :options="booleanInheritOptions" :placeholder="text('继承默认值', 'Inherit default')" />
                <span v-if="accountField.helpText" class="field-hint">{{ accountField.helpText }}</span>
              </div>
              <div v-else-if="accountField.input === 'select'" class="form-field">
                <label class="form-label">{{ accountField.label }}</label>
                <GlassSelect
                  v-model="draft.fieldValues[accountField.key]"
                  :options="accountFieldOptions(accountField)"
                  :placeholder="accountFieldPlaceholder(accountField)"
                />
                <span v-if="accountField.helpText" class="field-hint">{{ accountField.helpText }}</span>
              </div>
              <div v-else-if="accountField.input === 'textarea' || accountField.input === 'stringList'" class="form-field form-field-full">
                <label class="form-label">{{ accountField.label }}</label>
                <textarea
                  v-model="draft.fieldValues[accountField.key]"
                  class="form-textarea"
                  rows="5"
                  :placeholder="accountFieldPlaceholder(accountField)"
                />
                <span v-if="accountField.helpText" class="field-hint">{{ accountField.helpText }}</span>
              </div>
              <div v-else class="form-field">
                <label class="form-label">{{ accountField.label }}</label>
                <input
                  v-model="draft.fieldValues[accountField.key]"
                  class="form-input"
                  :type="accountFieldInputType(accountField)"
                  :placeholder="accountFieldPlaceholder(accountField)"
                />
                <span v-if="accountField.helpText" class="field-hint">{{ accountField.helpText }}</span>
              </div>
            </template>
          </template>
        </div>
      </details>

      <details class="config-collapsible">
        <summary>{{ text('高级 JSON', 'Advanced JSON') }}</summary>
        <div class="form-grid">
          <div class="form-field form-field-full">
            <label class="form-label">DM JSON</label>
            <textarea v-model="draft.dmJson" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('群组 JSON', 'Groups JSON') }}</label>
            <textarea v-model="draft.groupsJson" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">Guilds JSON</label>
            <textarea v-model="draft.guildsJson" class="form-textarea" rows="5" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('执行审批 JSON', 'Exec Approvals JSON') }}</label>
            <textarea v-model="draft.execApprovalsJson" class="form-textarea" rows="5" />
          </div>
        </div>
      </details>
    </article>

    <footer class="panel-card channels-save-bar" :class="{ dirty: hasUnsavedChanges, saving }">
      <div class="channels-save-bar__status">
        <strong>{{ saveStateTitle }}</strong>
        <p>{{ saveStateCopy }}</p>
      </div>

      <div class="channels-save-bar__actions">
        <button type="button" class="primary-button" :disabled="saving || !hasUnsavedChanges" @click="save">
          {{ saving ? text('保存中...', 'Saving...') : text('保存账号', 'Save account') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import type { ChannelFieldDescriptor, ChannelFieldGroupId } from '../../../../../types/channels';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { fetchChannelAccountCredentials, updateChannelAccount } from './api';
import {
  assignAccountDraft,
  buildBooleanInheritOptions,
  buildConnectionModeOptions,
  buildContextVisibilityOptions,
  buildDmPolicyOptions,
  buildDynamicFieldPayload,
  buildGroupPolicyOptions,
  buildRenderModeOptions,
  buildStreamingOptions,
  createBlankAccountDraft,
  parseOptionalJsonObject,
  stableStringify,
  accountFieldGroupLabel as accountFieldGroupLabelForText,
  accountFieldInputType as accountFieldInputTypeForField,
  accountFieldOptions as accountFieldOptionsForField,
  accountFieldPlaceholder as accountFieldPlaceholderForText,
} from './channel-ui';
import { useChannelsWorkspace } from './workspace';
import type { GlassSelectOption } from '../../shared/components/GlassSelect.vue';

defineOptions({ name: 'ChannelAccountDetailPage' });

const workspace = useChannelsWorkspace();
const route = useRoute();
const { text } = useLocalePreference();

const channel = computed(() => workspace.selectedChannel.value);
const catalog = computed(() => workspace.selectedCatalog.value);
const account = computed(() => {
  return channel.value?.accounts.find((entry) => entry.id === String(route.params.accountId || '')) || null;
});

const draft = reactive(createBlankAccountDraft());
const saving = computed(() => workspace.busyKey.value === 'save-account-detail');
const lastSavedSnapshot = ref('');

function captureDraftSnapshot(): string {
  return stableStringify({
    id: draft.id,
    enabled: draft.enabled,
    dmPolicy: draft.dmPolicy,
    groupPolicy: draft.groupPolicy,
    contextVisibility: draft.contextVisibility,
    streaming: draft.streaming,
    proxy: draft.proxy,
    connectionMode: draft.connectionMode,
    renderMode: draft.renderMode,
    domain: draft.domain,
    responsePrefix: draft.responsePrefix,
    dmJson: draft.dmJson,
    groupsJson: draft.groupsJson,
    guildsJson: draft.guildsJson,
    execApprovalsJson: draft.execApprovalsJson,
    fieldValues: draft.fieldValues,
    credentialValues: draft.credentialValues,
  });
}

watch(
  () => [account.value, catalog.value] as const,
  ([nextAccount, nextCatalog]) => {
    if (!nextAccount || !nextCatalog) return;
    assignAccountDraft(draft, nextAccount, nextCatalog);
    lastSavedSnapshot.value = captureDraftSnapshot();
  },
  { immediate: true },
);

watch(
  () => [channel.value?.type, account.value?.id] as const,
  async ([channelType, accountId]) => {
    if (!channelType || !accountId) return;
    try {
      const payload = await fetchChannelAccountCredentials(channelType, accountId);
      draft.credentialValues = {
        ...draft.credentialValues,
        ...payload.values,
      };
      lastSavedSnapshot.value = captureDraftSnapshot();
    } catch (error) {
      workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
    }
  },
  { immediate: true },
);

const groupedAccountFields = computed(() => {
  const fields = catalog.value?.accountFields || [];
  const grouped = new Map<string, typeof fields>();
  const groupOrder: Array<string> = ['connection', 'identity', 'files', 'media', 'behavior', 'credentials', ''];

  for (const field of fields) {
    const groupId = field.group || '';
    const current = grouped.get(groupId) || [];
    current.push(field);
    grouped.set(groupId, current);
  }

  return groupOrder
    .map((groupId) => {
      const groupFields = grouped.get(groupId);
      return groupFields?.length ? { id: groupId, fields: groupFields } : null;
    })
    .filter(Boolean) as Array<{ id: string; fields: typeof fields }>;
});

const dmPolicyOptions = computed(() => buildDmPolicyOptions(text));
const groupPolicyOptions = computed(() => buildGroupPolicyOptions(text));
const contextVisibilityOptions = computed(() => buildContextVisibilityOptions(text));
const streamingOptions = computed(() => buildStreamingOptions(text));
const connectionModeOptions = computed(() => buildConnectionModeOptions(text));
const renderModeOptions = computed(() => buildRenderModeOptions(text));
const booleanInheritOptions = computed(() => buildBooleanInheritOptions(text));
const hasUnsavedChanges = computed(() => captureDraftSnapshot() !== lastSavedSnapshot.value);
const saveStateTitle = computed(() => {
  if (saving.value) return text('保存中', 'Saving');
  if (hasUnsavedChanges.value) return text('有未保存更改', 'Unsaved changes');
  return text('已保存', 'Saved');
});
const saveStateCopy = computed(() => {
  if (saving.value) {
    return text('账号配置和凭据正在写入配置文件。', 'Account settings and credentials are being written to config files.');
  }
  if (hasUnsavedChanges.value) {
    return text('账号字段和凭据改动会持续显示在底部保存栏。', 'Account field and credential changes stay visible in the pinned save bar.');
  }
  return text('当前草稿和已保存账号配置一致。', 'The current draft matches the saved account configuration.');
});

onBeforeRouteLeave(() => {
  if (!hasUnsavedChanges.value) return true;
  return window.confirm(
    text('当前还有未保存更改，确定要离开这个页面吗？', 'You have unsaved changes. Leave this page anyway?'),
  );
});

function accountFieldPlaceholder(field: ChannelFieldDescriptor) {
  return accountFieldPlaceholderForText(field, text);
}

function accountFieldOptions(field: ChannelFieldDescriptor): GlassSelectOption[] {
  return accountFieldOptionsForField(field);
}

function accountFieldInputType(field: ChannelFieldDescriptor): 'text' | 'url' {
  return field.semantic === 'url' ? 'url' : accountFieldInputTypeForField(field);
}

function accountFieldGroupLabel(groupId: ChannelFieldGroupId | ''): string {
  return accountFieldGroupLabelForText(groupId, text);
}

async function save(): Promise<void> {
  if (!channel.value || !account.value || !catalog.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-account-detail';
  try {
    const response = await updateChannelAccount(channel.value.type, account.value.id, {
      id: draft.id,
      enabled: draft.enabled,
      fieldValues: buildDynamicFieldPayload(draft, catalog.value),
      dmPolicy: draft.dmPolicy || null,
      groupPolicy: draft.groupPolicy || null,
      contextVisibility: draft.contextVisibility || null,
      streaming: draft.streaming || null,
      proxy: draft.proxy || null,
      connectionMode: draft.connectionMode || null,
      renderMode: draft.renderMode || null,
      domain: draft.domain || null,
      responsePrefix: draft.responsePrefix || null,
      dm: parseOptionalJsonObject('DM JSON', draft.dmJson, text),
      groups: parseOptionalJsonObject(text('群组 JSON', 'Groups JSON'), draft.groupsJson, text),
      guilds: parseOptionalJsonObject('Guilds JSON', draft.guildsJson, text),
      execApprovals: parseOptionalJsonObject(text('执行审批 JSON', 'Exec Approvals JSON'), draft.execApprovalsJson, text),
    });
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    lastSavedSnapshot.value = captureDraftSnapshot();
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}
</script>

<style scoped>
.channels-save-bar {
  position: sticky;
  bottom: 16px;
  z-index: 4;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 94%, rgba(255, 255, 255, 0.02));
}

.channels-save-bar.dirty {
  border-color: rgba(255, 190, 122, 0.3);
}

.channels-save-bar__status {
  display: grid;
  gap: 4px;
}

.channels-save-bar__status strong {
  color: var(--text);
}

.channels-save-bar__status p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.channels-save-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 920px) {
  .channels-save-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .channels-save-bar__actions {
    width: 100%;
  }

  .channels-save-bar__actions > * {
    flex: 1 1 0;
  }
}
</style>
