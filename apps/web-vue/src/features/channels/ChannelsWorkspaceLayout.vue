<template>
  <section class="page-shell channels-page operate-workspace-shell">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ text('CHANNEL SETTINGS', 'CHANNEL SETTINGS') }}</p>
        <h2 class="page-title">{{ text('频道管理', 'Channels') }}</h2>
        <p class="page-copy">
          {{ text(
            '频道页现在先展示高密度索引和快捷动作。复杂编辑会进入右侧专门工作区，不再把所有字段堆在一个页面里。',
            'Channels now starts with a dense index and quick actions. Complex editing moves into dedicated right-side workspaces instead of one giant page.'
          ) }}
        </p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="workspace.loading.value" @click="workspace.refreshSummary()">
          {{ workspace.loading.value ? text('刷新中...', 'Refreshing...') : text('刷新数据', 'Refresh Data') }}
        </button>
      </div>
    </header>

    <div v-if="workspace.errorMessage.value" class="status-banner status-banner-error">{{ workspace.errorMessage.value }}</div>
    <div v-else-if="workspace.successMessage.value" class="status-banner status-banner-success">{{ workspace.successMessage.value }}</div>

    <section class="channels-workbench">
      <aside class="channels-sidebar operate-resource-rail mobile-resource-drawer">
        <article class="panel-card channels-sidebar-panel">
          <div class="channels-sidebar-head">
            <div>
              <p class="eyebrow">{{ text('PROVIDERS', 'PROVIDERS') }}</p>
              <h3 class="channels-sidebar-title">{{ text('频道列表', 'Provider List') }}</h3>
              <p class="panel-muted">
                {{ workspace.checkedAtLabel.value
                  ? text(`已同步 ${workspace.checkedAtLabel.value}`, `Synced ${workspace.checkedAtLabel.value}`)
                  : text('选择一个渠道开始。', 'Select a provider to begin.') }}
              </p>
            </div>

            <button type="button" class="secondary-button compact-button" @click="workspace.createChannelExpanded.value = !workspace.createChannelExpanded.value">
              {{ workspace.createChannelExpanded.value ? text('收起', 'Hide') : text('新增频道', 'Add Provider') }}
            </button>
          </div>

          <div v-if="workspace.createChannelExpanded.value" class="channels-create-panel">
            <div class="form-field">
              <label class="form-label">{{ text('渠道类型', 'Provider Type') }}</label>
              <GlassSelect
                v-model="workspace.createChannelDraft.type"
                :options="workspace.availableCreateTypeOptions.value"
                :placeholder="text('请选择渠道类型', 'Select provider type')"
              />
            </div>

            <label class="toggle-card">
              <input v-model="workspace.createChannelDraft.enabled" class="form-checkbox" type="checkbox" />
              <div>
                <strong>{{ text('创建后立即启用', 'Enable after create') }}</strong>
                <span>{{ text('这里仍保留轻量创建入口，但不会自动展开完整编辑器。', 'This keeps lightweight provider creation in the rail without opening a full editor immediately.') }}</span>
              </div>
            </label>

            <button
              type="button"
              class="primary-button compact-button"
              :disabled="!workspace.createChannelDraft.type || workspace.busyKey.value === 'create-channel'"
              @click="workspace.submitCreateChannel()"
            >
              {{ workspace.busyKey.value === 'create-channel' ? text('创建中...', 'Creating...') : text('创建频道', 'Create Provider') }}
            </button>
          </div>

          <div v-if="workspace.summary.value?.channels.length" class="channel-rail-list">
            <button
              v-for="channel in workspace.summary.value.channels"
              :key="channel.type"
              type="button"
              class="channel-rail-item"
              :class="{ active: channel.type === workspace.selectedChannelType.value }"
              @click="workspace.selectChannel(channel.type)"
            >
              <div class="channel-rail-head">
                <span class="channel-rail-icon" aria-hidden="true">{{ workspace.channelIcon(channel.type) }}</span>
                <div>
                  <strong>{{ workspace.channelLabel(channel.type) }}</strong>
                  <p>{{ channel.type }}</p>
                </div>
              </div>

              <div class="channel-rail-meta">
                <span>{{ text('账号', 'Accounts') }} {{ channel.accountCount }}</span>
                <span>{{ text('绑定', 'Bindings') }} {{ channel.bindingCount }}</span>
              </div>

              <StatusPill :label="channel.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled')" :tone="channel.enabled ? 'sage' : 'neutral'" />
            </button>
          </div>

          <div v-else-if="!workspace.loading.value" class="empty-inline">
            {{ text('当前还没有任何频道入口。先创建一个 provider。', 'No providers exist yet. Create one to get started.') }}
          </div>
        </article>
      </aside>

      <section class="channels-stage operate-stage">
        <article v-if="workspace.selectedChannel.value" class="panel-card channels-stage-header">
          <div class="channels-stage-head operate-stage-task-head">
            <div class="channels-stage-ident">
              <span class="channels-stage-icon" aria-hidden="true">{{ workspace.channelIcon(workspace.selectedChannel.value.type) }}</span>
              <div>
                <p class="eyebrow">{{ selectedAccount ? `${workspace.selectedChannel.value.type} · ${selectedAccount.id}` : workspace.selectedChannel.value.type }}</p>
                <h3 class="channels-stage-title">{{ workspace.channelLabel(workspace.selectedChannel.value.type) }}</h3>
                <p class="panel-muted">
                  {{
                    selectedAccount
                      ? text(
                          `${selectedAccountKindLabel}。账号配置只影响当前账号，不影响其它账号。`,
                          `${selectedAccountKindLabel}. Account settings only affect this account, not the other accounts.`
                        )
                      : text('当前 provider 的概览、设置和绑定会在这里切换；账号配置请从下方账号索引进入。', 'This stage switches between provider overview, settings, and bindings. Open account settings from the account index below.')
                  }}
                </p>
              </div>
            </div>

            <div class="channels-stage-badges">
              <span class="channels-stage-badge">{{ workspace.selectedChannel.value.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
              <span class="channels-stage-badge">{{ text(`${workspace.selectedChannel.value.accountCount} 个账号`, `${workspace.selectedChannel.value.accountCount} accounts`) }}</span>
              <span class="channels-stage-badge">{{ text(`${workspace.selectedChannel.value.bindingCount} 条绑定`, `${workspace.selectedChannel.value.bindingCount} bindings`) }}</span>
              <span v-if="workspace.selectedChannel.value.defaultAccount" class="channels-stage-badge">
                {{ text(`默认账号 ${workspace.selectedChannel.value.defaultAccount}`, `Default ${workspace.selectedChannel.value.defaultAccount}`) }}
              </span>
            </div>
          </div>

          <nav class="channels-top-tabs mobile-stage-tabs" :aria-label="text('频道工作区页面', 'Channel workspace pages')">
            <button
              v-for="tab in topTabs"
              :key="tab.id"
              type="button"
              class="channels-top-tab"
              :class="{ active: activeTopTab === tab.id }"
              @click="openStageTab(tab.id)"
            >
              <span class="channels-top-tab-icon" aria-hidden="true">{{ tab.icon }}</span>
              <span>{{ tab.label }}</span>
            </button>
          </nav>

          <div v-if="activeTopTab === 'overview'" class="channels-stage-actions">
            <button type="button" class="channels-stage-task-card primary" @click="openStageTab('settings')">
              <span>{{ text('Provider 设置', 'Provider settings') }}</span>
              <strong>{{ text('编辑 provider 默认值和高级 JSON。', 'Edit provider defaults and advanced JSON.') }}</strong>
            </button>
            <button type="button" class="channels-stage-task-card" @click="openStageTab('bindings')">
              <span>{{ text('绑定规则', 'Binding rules') }}</span>
              <strong>{{ text('把频道或账号入口绑定到 Agent。', 'Bind channel or account entrypoints to agents.') }}</strong>
            </button>
            <button type="button" class="channels-stage-task-card" :disabled="!primaryActionAccountId" @click="openPrimaryAccess">
              <span>{{ text('默认账号权限', 'Default account access') }}</span>
              <strong>{{ text('进入默认账号的白名单与访问控制。', 'Open allowlists and access control for the default account.') }}</strong>
            </button>
            <button type="button" class="channels-stage-task-card" :disabled="!primaryActionAccountId" @click="openPrimaryPairing">
              <span>{{ text('待配对', 'Pairing') }}</span>
              <strong>{{ text('审批默认账号的 pairing 请求。', 'Review pairing requests for the default account.') }}</strong>
            </button>
          </div>

          <nav
            v-if="selectedAccount"
            class="channels-subtabs"
            :aria-label="text('账号工作区页面', 'Account workspace pages')"
          >
            <button
              v-for="tab in accountTabs"
              :key="tab.id"
              type="button"
              class="channels-subtab"
              :class="{ active: activeAccountTab === tab.id }"
              @click="openAccountStageTab(tab.id)"
            >
              <span>{{ tab.label }}</span>
            </button>
          </nav>
        </article>

        <RouterView />
      </section>
    </section>

    <ChannelAccountCreateDrawer
      :open="activeOverlay === 'new-account' && Boolean(workspace.selectedChannel.value)"
      :busy="workspace.busyKey.value === 'create-account-quick'"
      :channel-label="workspace.selectedChannel.value ? workspace.channelLabel(workspace.selectedChannel.value.type) : ''"
      :catalog="workspace.selectedCatalog.value"
      :initial="accountCreateSeed"
      :dm-policy-options="dmPolicyOptions"
      :group-policy-options="groupPolicyOptions"
      :context-visibility-options="contextVisibilityOptions"
      :streaming-options="streamingOptions"
      :connection-mode-options="connectionModeOptions"
      :render-mode-options="renderModeOptions"
      @close="workspace.closeOverlay()"
      @save="createAccountQuickly"
    />

    <ChannelCredentialDrawer
      :open="activeOverlay === 'credentials' && Boolean(overlayAccount)"
      :busy="workspace.busyKey.value === 'save-credentials'"
      :channel-label="workspace.selectedChannel.value ? workspace.channelLabel(workspace.selectedChannel.value.type) : ''"
      :account-id="overlayAccount?.id || ''"
      :catalog="workspace.selectedCatalog.value"
      :values="credentialValues"
      :configured-keys="configuredCredentialKeys"
      @close="workspace.closeOverlay()"
      @save="saveAccountCredentials"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import type { ChannelAccountInput } from '../../../../../types/channels';
import StatusPill from '../../components/StatusPill.vue';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  createChannelAccount,
  fetchChannelAccountCredentials,
  updateChannelAccount,
} from './api';
import ChannelAccountCreateDrawer from './ChannelAccountCreateDrawer.vue';
import ChannelCredentialDrawer from './ChannelCredentialDrawer.vue';
import {
  buildConnectionModeOptions,
  buildContextVisibilityOptions,
  buildDmPolicyOptions,
  buildGroupPolicyOptions,
  buildRenderModeOptions,
  buildStreamingOptions,
  buildDynamicFieldPayload,
  createBlankAccountDraft,
} from './channel-ui';
import { provideChannelsWorkspace } from './workspace';

defineOptions({ name: 'ChannelsWorkspaceLayout' });

const workspace = provideChannelsWorkspace();
const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const activeOverlay = computed(() => {
  const value = route.query.overlay;
  return typeof value === 'string' ? value : '';
});

const overlayAccountId = computed(() => {
  const value = route.query.accountId;
  return typeof value === 'string' ? value : '';
});

const overlayAccount = computed(() => {
  return workspace.selectedChannel.value?.accounts.find((account) => account.id === overlayAccountId.value) || null;
});

const selectedAccount = computed(() => {
  const accountId = route.params.accountId;
  if (typeof accountId !== 'string' || !accountId) return null;
  return workspace.selectedChannel.value?.accounts.find((account) => account.id === accountId) || null;
});

const primaryActionAccountId = computed(() => {
  const channel = workspace.selectedChannel.value;
  if (!channel) return '';
  if (channel.defaultAccount && channel.accounts.some((account) => account.id === channel.defaultAccount)) {
    return channel.defaultAccount;
  }
  return channel.accounts[0]?.id || '';
});

const activeTopTab = computed<'overview' | 'settings' | 'bindings' | 'accounts'>(() => {
  if (/\/settings$/.test(route.path)) return 'settings';
  if (/\/bindings$/.test(route.path)) return 'bindings';
  if (/\/accounts\//.test(route.path)) return 'accounts';
  return 'overview';
});

const activeAccountTab = computed<'account' | 'access' | 'pairing'>(() => {
  if (/\/access$/.test(route.path)) return 'access';
  if (/\/pairing$/.test(route.path)) return 'pairing';
  return 'account';
});

const topTabs = computed(() => [
  { id: 'overview' as const, label: text('概览', 'Overview'), icon: '◌' },
  { id: 'settings' as const, label: text('设置', 'Settings'), icon: '⋯' },
  { id: 'bindings' as const, label: text('绑定', 'Bindings'), icon: '⇄' },
]);

const accountTabs = computed(() => [
  { id: 'account' as const, label: text('账号详情', 'Account') },
  { id: 'access' as const, label: text('访问控制', 'Access') },
  { id: 'pairing' as const, label: text('配对审批', 'Pairing') },
]);

const selectedAccountKindLabel = computed(() => {
  if (!selectedAccount.value) return '';
  return selectedAccount.value.kind === 'default'
    ? text('当前是默认账号', 'This is the default account')
    : text('当前是命名账号', 'This is a named account');
});

const accountCreateSeed = computed<ChannelAccountInput | null>(() => {
  const channel = workspace.selectedChannel.value;
  if (!channel) return null;
  return {
    id: '',
    enabled: true,
    dmPolicy: channel.dmPolicy,
    groupPolicy: channel.groupPolicy,
    contextVisibility: channel.contextVisibility,
    streaming: channel.streaming,
    connectionMode: channel.connectionMode,
    renderMode: channel.renderMode,
    proxy: channel.proxy,
  };
});

const dmPolicyOptions = computed(() => buildDmPolicyOptions(text));
const groupPolicyOptions = computed(() => buildGroupPolicyOptions(text));
const contextVisibilityOptions = computed(() => buildContextVisibilityOptions(text));
const streamingOptions = computed(() => buildStreamingOptions(text));
const connectionModeOptions = computed(() => buildConnectionModeOptions(text));
const renderModeOptions = computed(() => buildRenderModeOptions(text));

const credentialValues = reactive<Record<string, string>>({});

const configuredCredentialKeys = computed(() => {
  return new Set(
    overlayAccount.value?.credentialStates.filter((credential) => credential.configured).map((credential) => credential.key) || [],
  );
});

function providerBasePath(channelType: string): string {
  return `/channels/${encodeURIComponent(channelType)}`;
}

function accountBasePath(channelType: string, accountId: string): string {
  return `${providerBasePath(channelType)}/accounts/${encodeURIComponent(accountId)}`;
}

function openStageTab(tabId: 'overview' | 'settings' | 'bindings' | 'accounts'): void {
  const channel = workspace.selectedChannel.value;
  if (!channel) return;
  if (tabId === 'overview') {
    void router.push(providerBasePath(channel.type));
    return;
  }
  if (tabId === 'settings') {
    void router.push(`${providerBasePath(channel.type)}/settings`);
    return;
  }
  if (tabId === 'bindings') {
    void router.push(`${providerBasePath(channel.type)}/bindings`);
    return;
  }
  const targetAccount = selectedAccount.value || channel.accounts[0];
  if (!targetAccount) return;
  void router.push(accountBasePath(channel.type, targetAccount.id));
}

function openAccountStageTab(tabId: 'account' | 'access' | 'pairing'): void {
  const channel = workspace.selectedChannel.value;
  const account = selectedAccount.value;
  if (!channel || !account) return;
  const basePath = accountBasePath(channel.type, account.id);
  if (tabId === 'account') {
    void router.push(basePath);
    return;
  }
  if (tabId === 'access') {
    void router.push(`${basePath}/access`);
    return;
  }
  void router.push(`${basePath}/pairing`);
}

function openPrimaryAccess(): void {
  const channel = workspace.selectedChannel.value;
  if (!channel || !primaryActionAccountId.value) return;
  void router.push(`${accountBasePath(channel.type, primaryActionAccountId.value)}/access`);
}

function openPrimaryPairing(): void {
  const channel = workspace.selectedChannel.value;
  if (!channel || !primaryActionAccountId.value) return;
  void router.push(`${accountBasePath(channel.type, primaryActionAccountId.value)}/pairing`);
}

watch(
  () => [activeOverlay.value, overlayAccount.value?.id, workspace.selectedChannel.value?.type] as const,
  async ([overlay, accountId, channelType]) => {
    if (overlay !== 'credentials' || !accountId || !channelType) return;
    workspace.busyKey.value = 'load-credentials';
    try {
      const payload = await fetchChannelAccountCredentials(channelType, accountId);
      for (const key of Object.keys(credentialValues)) {
        delete credentialValues[key];
      }
      for (const [key, value] of Object.entries(payload.values)) {
        credentialValues[key] = value;
      }
    } catch (error) {
      workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
    } finally {
      workspace.busyKey.value = '';
    }
  },
  { immediate: true },
);

async function createAccountQuickly(payload: ChannelAccountInput): Promise<void> {
  if (!workspace.selectedChannel.value || !workspace.selectedCatalog.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'create-account-quick';
  try {
    const response = await createChannelAccount(workspace.selectedChannel.value.type, {
      ...payload,
      fieldValues: {
        ...payload.fieldValues,
      },
    });
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.closeOverlay();
    await workspace.refreshSummary(workspace.selectedChannel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

async function saveAccountCredentials(values: Record<string, string>): Promise<void> {
  if (!workspace.selectedChannel.value || !overlayAccount.value || !workspace.selectedCatalog.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-credentials';
  try {
    const draft = createBlankAccountDraft();
    Object.assign(draft, {
      id: overlayAccount.value.id,
      enabled: overlayAccount.value.enabled,
      dmPolicy: overlayAccount.value.dmPolicy || '',
      groupPolicy: overlayAccount.value.groupPolicy || '',
      contextVisibility: overlayAccount.value.contextVisibility || '',
      streaming: overlayAccount.value.streaming || '',
      proxy: overlayAccount.value.proxy || '',
      connectionMode: overlayAccount.value.connectionMode || '',
      renderMode: overlayAccount.value.renderMode || '',
      domain: overlayAccount.value.domain || '',
      responsePrefix: overlayAccount.value.responsePrefix || '',
      credentialValues: { ...values },
      fieldValues: { ...overlayAccount.value.fieldValues },
    });
    const response = await updateChannelAccount(workspace.selectedChannel.value.type, overlayAccount.value.id, {
      id: overlayAccount.value.id,
      enabled: overlayAccount.value.enabled,
      fieldValues: buildDynamicFieldPayload(draft, workspace.selectedCatalog.value),
      dmPolicy: overlayAccount.value.dmPolicy,
      groupPolicy: overlayAccount.value.groupPolicy,
      contextVisibility: overlayAccount.value.contextVisibility,
      streaming: overlayAccount.value.streaming,
      proxy: overlayAccount.value.proxy,
      connectionMode: overlayAccount.value.connectionMode,
      renderMode: overlayAccount.value.renderMode,
      domain: overlayAccount.value.domain,
      responsePrefix: overlayAccount.value.responsePrefix,
    });
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.closeOverlay();
    await workspace.refreshSummary(workspace.selectedChannel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}
</script>
