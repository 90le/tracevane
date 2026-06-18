<template>
  <section v-if="channel" class="channels-stage-view">
    <article class="channels-form-panel channels-stage-section">
      <div class="channels-stage-task-head operate-stage-task-head">
        <div>
          <p class="eyebrow">{{ channel.type }}</p>
          <h3>{{ text('频道高级设置', 'Provider Settings') }}</h3>
          <p>{{ text('这里维护 provider 级默认值、运行策略和高级 JSON。保存入口固定在底部，不再重复占用顶部。', 'Use this page for provider defaults, runtime policy, and advanced JSON. Saving stays pinned at the bottom instead of repeating at the top.') }}</p>
        </div>
      </div>

      <section class="channels-provider-settings-section channels-provider-settings-section--primary">
        <div class="channels-provider-settings-section__head">
          <strong>{{ text('常用默认值', 'Common defaults') }}</strong>
          <span>{{ text('这些字段会作为 provider 级默认值，账号未覆盖时会继承这里。', 'These provider-level defaults are inherited by accounts that do not override them.') }}</span>
        </div>

        <div class="form-grid">
          <label class="option-row form-field-full">
            <input v-model="draft.enabled" class="form-checkbox" type="checkbox" />
            <div>
              <strong>{{ text('频道启用状态', 'Provider enabled') }}</strong>
              <span>{{ text('禁用后保留配置，但不会启动该 provider。', 'Disabling keeps config but prevents the provider from starting.') }}</span>
            </div>
          </label>

          <div class="form-field">
            <label class="form-label">{{ text('默认账号', 'Default account') }}</label>
            <TracevaneSelect v-model="draft.defaultAccount" :options="defaultAccountOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('默认私聊策略', 'Default DM policy') }}</label>
            <TracevaneSelect v-model="draft.dmPolicy" :options="dmPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('默认群组策略', 'Default group policy') }}</label>
            <TracevaneSelect v-model="draft.groupPolicy" :options="groupPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('上下文可见性', 'Context visibility') }}</label>
            <TracevaneSelect v-model="draft.contextVisibility" :options="contextVisibilityOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('流式响应', 'Streaming') }}</label>
            <TracevaneSelect v-model="draft.streaming" :options="streamingOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('连接模式', 'Connection mode') }}</label>
            <TracevaneSelect v-model="draft.connectionMode" :options="connectionModeOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('渲染模式', 'Render mode') }}</label>
            <TracevaneSelect v-model="draft.renderMode" :options="renderModeOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('代理地址', 'Proxy URL') }}</label>
            <input v-model="draft.proxy" class="form-input" :placeholder="text('例如 http://127.0.0.1:9981', 'For example http://127.0.0.1:9981')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('域名', 'Domain') }}</label>
            <input v-model="draft.domain" class="form-input" :placeholder="text('例如 example.com', 'For example example.com')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('回复前缀', 'Response prefix') }}</label>
            <input v-model="draft.responsePrefix" class="form-input" :placeholder="text('例如 [bot]', 'For example [bot]')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('配置写入', 'Config writes') }}</label>
            <TracevaneSelect v-model="draft.configWritesMode" :options="booleanInheritOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('健康监控', 'Health monitor') }}</label>
            <TracevaneSelect v-model="draft.healthMonitorMode" :options="booleanInheritOptions" :placeholder="text('继承默认值', 'Inherit default')" />
          </div>
        </div>
      </section>

      <details class="config-collapsible" :open="catalog?.supportsThreadBindings === true">
        <summary>{{ text('Thread 路由运行态', 'Thread routing runtime') }}</summary>
        <div class="form-grid">
          <label class="option-row form-field-full">
            <input v-model="draft.threadBindings.enabled" class="form-checkbox" type="checkbox" />
            <div>
              <strong>{{ text('启用 Thread 路由', 'Enable thread routing') }}</strong>
              <span>{{ text('仅对支持 thread routing 的渠道生效。', 'Only used by channels that support thread routing.') }}</span>
            </div>
          </label>
          <div class="form-field">
            <label class="form-label">{{ text('空闲小时数', 'Idle hours') }}</label>
            <input v-model.number="draft.threadBindings.idleHours" class="form-input" type="number" min="0" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('最大保留小时数', 'Max age hours') }}</label>
            <input v-model.number="draft.threadBindings.maxAgeHours" class="form-input" type="number" min="0" />
          </div>
          <label class="option-row">
            <input v-model="draft.threadBindings.spawnSessions" class="form-checkbox" type="checkbox" />
            <div>
              <strong>{{ text('生成绑定会话', 'Spawn bound sessions') }}</strong>
              <span>{{ text('Thread 路由命中时允许创建 Agent 或 ACP 绑定会话。', 'Allow Agent or ACP bound sessions to be spawned when a thread route matches.') }}</span>
            </div>
          </label>
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
          {{ saving ? text('保存中...', 'Saving...') : text('保存设置', 'Save settings') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import TracevaneSelect from '../../shared/components/TracevaneSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { updateChannel } from './api';
import {
  assignChannelDraft,
  buildBooleanInheritOptions,
  buildConnectionModeOptions,
  buildContextVisibilityOptions,
  buildDmPolicyOptions,
  buildGroupPolicyOptions,
  buildRenderModeOptions,
  buildStreamingOptions,
  createBlankChannelDraft,
  fromBooleanSelectValue,
  parseOptionalJsonObject,
  stableStringify,
} from './channel-ui';
import { useChannelsWorkspace } from './workspace';
import './channels-pages.css';

defineOptions({ name: 'ChannelProviderSettingsPage' });

const workspace = useChannelsWorkspace();
const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();

const channel = computed(() => workspace.selectedChannel.value);
const catalog = computed(() => workspace.selectedCatalog.value);
const saving = computed(() => workspace.busyKey.value === 'save-provider-settings');
const draft = reactive(createBlankChannelDraft());
const lastSavedSnapshot = ref('');

function captureDraftSnapshot(): string {
  return stableStringify({
    enabled: draft.enabled,
    defaultAccount: draft.defaultAccount,
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
    threadBindings: {
      enabled: draft.threadBindings.enabled,
      idleHours: draft.threadBindings.idleHours,
      maxAgeHours: draft.threadBindings.maxAgeHours,
      spawnSessions: draft.threadBindings.spawnSessions,
    },
  });
}

watch(
  () => channel.value,
  (value) => {
    if (!value) return;
    assignChannelDraft(draft, value);
    lastSavedSnapshot.value = captureDraftSnapshot();
  },
  { immediate: true },
);

const defaultAccountOptions = computed(() => {
  const options = [{ value: '', label: text('未指定', 'Unset') }];
  for (const account of channel.value?.accounts || []) {
    options.push({ value: account.id, label: account.id });
  }
  return options;
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
    return text('配置正在写入 openclaw.json。', 'Changes are being written to openclaw.json.');
  }
  if (hasUnsavedChanges.value) {
    return text('滚动到任何位置都能直接保存，避免改完忘记提交。', 'Save from anywhere on the page so edits do not get lost.');
  }
  return text('当前草稿和已保存配置一致。', 'The current draft matches the saved configuration.');
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

async function save(): Promise<void> {
  if (!channel.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-provider-settings';
  try {
    const response = await updateChannel(channel.value.type, {
      enabled: draft.enabled,
      defaultAccount: draft.defaultAccount || null,
      dmPolicy: draft.dmPolicy || null,
      groupPolicy: draft.groupPolicy || null,
      contextVisibility: draft.contextVisibility || null,
      streaming: draft.streaming || null,
      proxy: draft.proxy || null,
      connectionMode: draft.connectionMode || null,
      renderMode: draft.renderMode || null,
      domain: draft.domain || null,
      responsePrefix: draft.responsePrefix || null,
      configWrites: fromBooleanSelectValue(draft.configWritesMode),
      healthMonitor: fromBooleanSelectValue(draft.healthMonitorMode),
      dm: parseOptionalJsonObject('DM JSON', draft.dmJson, text),
      groups: parseOptionalJsonObject(text('群组 JSON', 'Groups JSON'), draft.groupsJson, text),
      guilds: parseOptionalJsonObject('Guilds JSON', draft.guildsJson, text),
      execApprovals: parseOptionalJsonObject(text('执行审批 JSON', 'Exec Approvals JSON'), draft.execApprovalsJson, text),
      threadBindings: catalog.value?.supportsThreadBindings ? draft.threadBindings : undefined,
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
