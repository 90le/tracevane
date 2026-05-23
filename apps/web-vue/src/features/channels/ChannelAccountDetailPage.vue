<template>
  <section v-if="account && catalog && channel" class="channels-stage-view">
    <article class="channels-form-panel channels-stage-section">
      <div class="channels-stage-task-head operate-stage-task-head">
        <div>
          <p class="eyebrow">{{ channel.type }} · {{ account.id }}</p>
          <h3>{{ text('账号详情', 'Account detail') }}</h3>
          <p>{{ text('这里维护账号级覆盖值；留空或继承时会继续使用 provider 默认配置。保存入口固定在底部。', 'Use this page for account-level overrides. Empty or inherited values keep using provider defaults. Saving stays pinned at the bottom.') }}</p>
        </div>
      </div>

      <section class="channels-account-detail-section channels-account-detail-section--identity">
        <div class="channels-account-detail-section__head">
          <strong>{{ text('账号身份', 'Account identity') }}</strong>
          <span>{{ text('Account ID 是配置键和日志排查入口，不能在这里改名。', 'Account ID is the config key and troubleshooting handle, so it cannot be renamed here.') }}</span>
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
      </section>

      <details class="config-collapsible" open>
        <summary>{{ text('凭据', 'Credentials') }}</summary>
        <div class="account-credential-summary">
          <div>
            <strong>{{ text('凭据由抽屉统一配置', 'Credentials are configured in the drawer') }}</strong>
            <p>{{ text('账号详情页只显示凭据状态，避免同一批密钥在两个表单里保存。', 'Account detail only shows credential state so the same secrets are not saved from two competing forms.') }}</p>
          </div>
          <div class="account-credential-summary__stats">
            <span>{{ text('已配置', 'Configured') }} {{ configuredCredentialCount }}</span>
            <span>{{ text('总字段', 'Total fields') }} {{ credentialFieldCount }}</span>
          </div>
          <button type="button" class="secondary-button compact-button" @click="openCredentialDrawer">
            {{ text('打开凭据抽屉', 'Open credentials drawer') }}
          </button>
        </div>
      </details>

      <details class="config-collapsible" open>
        <summary>{{ text('基础行为', 'Core behavior') }}</summary>
        <section class="channels-account-detail-section">
          <div class="channels-account-detail-section__head">
            <strong>{{ text('账号覆盖默认值', 'Account overrides') }}</strong>
            <span>{{ text('这些字段只影响当前账号；留空表示继续继承 provider 设置。', 'These fields only affect this account. Leave them empty to inherit provider settings.') }}</span>
          </div>

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
            <div class="form-field">
              <label class="form-label">{{ text('代理地址', 'Proxy URL') }}</label>
              <input v-model="draft.proxy" class="form-input" :placeholder="text('留空继承 provider 代理', 'Leave empty to inherit provider proxy')" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('域名', 'Domain') }}</label>
              <input v-model="draft.domain" class="form-input" :placeholder="text('留空继承 provider 域名', 'Leave empty to inherit provider domain')" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('回复前缀', 'Response prefix') }}</label>
              <input v-model="draft.responsePrefix" class="form-input" :placeholder="text('留空继承 provider 回复前缀', 'Leave empty to inherit provider response prefix')" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('配置写入', 'Config writes') }}</label>
              <GlassSelect v-model="draft.configWritesMode" :options="booleanInheritOptions" :placeholder="text('继承默认值', 'Inherit default')" />
            </div>
            <div class="form-field">
              <label class="form-label">{{ text('健康监控', 'Health monitor') }}</label>
              <GlassSelect v-model="draft.healthMonitorMode" :options="booleanInheritOptions" :placeholder="text('继承默认值', 'Inherit default')" />
            </div>
          </div>
        </section>
      </details>

      <details v-if="groupedAccountFields.length" class="config-collapsible" open>
        <summary>{{ text('Schema 字段', 'Schema fields') }}</summary>
        <div class="channels-account-schema-groups">
          <details
            v-for="fieldGroup in groupedAccountFields"
            :key="fieldGroup.id"
            class="config-collapsible channels-account-schema-group"
            :open="isPrimaryAccountFieldGroup(fieldGroup.id)"
          >
            <summary class="channels-account-schema-group__summary">
              <span>{{ accountFieldGroupLabel(fieldGroup.id) }}</span>
              <small>{{ text(`${fieldGroup.fields.length} 个字段`, `${fieldGroup.fields.length} fields`) }}</small>
            </summary>

            <section class="channels-account-detail-section">
              <div class="channels-account-detail-section__head">
                <strong>{{ accountFieldGroupLabel(fieldGroup.id) }}</strong>
                <span>{{ text('来自 provider schema 的账号级字段，按用途分组展示。', 'Account-level fields from the provider schema, grouped by purpose.') }}</span>
              </div>

              <div class="form-grid">
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
              </div>
            </section>
          </details>
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

    <footer class="channels-save-bar" :class="{ dirty: hasUnsavedChanges, saving }">
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
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { updateChannelAccount } from './api';
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
const { confirm } = useConfirmDialog();

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
    configWritesMode: draft.configWritesMode,
    healthMonitorMode: draft.healthMonitorMode,
    dmJson: draft.dmJson,
    groupsJson: draft.groupsJson,
    guildsJson: draft.guildsJson,
    execApprovalsJson: draft.execApprovalsJson,
    fieldValues: draft.fieldValues,
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
const configuredCredentialCount = computed(() => account.value?.credentialStates.filter((credential) => credential.configured).length || 0);
const credentialFieldCount = computed(() => catalog.value?.credentialFields.length || 0);
const hasUnsavedChanges = computed(() => captureDraftSnapshot() !== lastSavedSnapshot.value);
const saveStateTitle = computed(() => {
  if (saving.value) return text('保存中', 'Saving');
  if (hasUnsavedChanges.value) return text('有未保存更改', 'Unsaved changes');
  return text('已保存', 'Saved');
});
const saveStateCopy = computed(() => {
  if (saving.value) {
    return text('账号配置正在写入配置文件。凭据请通过凭据抽屉保存。', 'Account settings are being written to config files. Save credentials from the credential drawer.');
  }
  if (hasUnsavedChanges.value) {
    return text('账号字段改动会持续显示在底部保存栏；凭据不在本页保存。', 'Account field changes stay visible in the pinned save bar; credentials are not saved from this page.');
  }
  return text('当前草稿和已保存账号配置一致。', 'The current draft matches the saved account configuration.');
});

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) return true;
  return await confirm({
    title: text('确认离开页面', 'Confirm leaving page'),
    message: text('当前还有未保存更改，确定要离开这个页面吗？', 'You have unsaved changes. Leave this page anyway?'),
    confirmText: text('离开', 'Leave'),
    cancelText: text('继续编辑', 'Keep editing'),
  });
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

function isPrimaryAccountFieldGroup(groupId: ChannelFieldGroupId | ''): boolean {
  return groupId === 'connection';
}

function buildAccountDetailFieldPayload(): Record<string, unknown> {
  const values = buildDynamicFieldPayload(draft, catalog.value);
  for (const field of catalog.value?.credentialFields || []) {
    delete values[field.key];
  }
  return values;
}

async function openCredentialDrawer(): Promise<void> {
  if (!account.value) return;
  await workspace.openOverlay('credentials', account.value.id);
}

async function save(): Promise<void> {
  if (!channel.value || !account.value || !catalog.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-account-detail';
  try {
    const response = await updateChannelAccount(channel.value.type, account.value.id, {
      id: draft.id,
      enabled: draft.enabled,
      fieldValues: buildAccountDetailFieldPayload(),
      dmPolicy: draft.dmPolicy || null,
      groupPolicy: draft.groupPolicy || null,
      contextVisibility: draft.contextVisibility || null,
      streaming: draft.streaming || null,
      proxy: draft.proxy || null,
      connectionMode: draft.connectionMode || null,
      renderMode: draft.renderMode || null,
      domain: draft.domain || null,
      responsePrefix: draft.responsePrefix || null,
      configWrites: draft.configWritesMode === 'inherit' ? undefined : draft.configWritesMode === 'enabled',
      healthMonitor: draft.healthMonitorMode === 'inherit' ? undefined : draft.healthMonitorMode === 'enabled',
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
.channels-account-detail-section,
.channels-account-schema-groups {
  display: grid;
  gap: 12px;
}

.channels-account-schema-group {
  margin: 0;
}

.channels-account-schema-group__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.channels-account-schema-group__summary small {
  color: var(--muted);
  font-size: 11px;
}

.channels-account-detail-section {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--shell-panel-fill) 84%, transparent);
}

.channels-account-detail-section--identity {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--sky) 8%, transparent), transparent 58%),
    color-mix(in srgb, var(--shell-panel-fill) 88%, transparent);
}

.channels-account-detail-section__head {
  display: grid;
  gap: 4px;
}

.channels-account-detail-section__head strong {
  color: var(--text);
  font-size: 13px;
}

.channels-account-detail-section__head span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.account-credential-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--shell-panel-fill) 84%, transparent);
}

.account-credential-summary strong {
  color: var(--text);
  font-size: 13px;
}

.account-credential-summary p {
  margin: 5px 0 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.account-credential-summary__stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.account-credential-summary__stats span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 86%, transparent);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 11px;
  white-space: nowrap;
}

.channels-save-bar {
  position: sticky;
  bottom: 16px;
  z-index: 4;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
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
  .account-credential-summary {
    grid-template-columns: 1fr;
  }

  .account-credential-summary__stats {
    justify-content: flex-start;
  }

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
