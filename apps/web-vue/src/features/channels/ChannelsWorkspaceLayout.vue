<template>
  <section class="page-shell channels-page operate-workspace-shell">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ text('CHANNEL SETTINGS', 'CHANNEL SETTINGS') }}</p>
        <h2 class="page-title">{{ text('频道管理', 'Channels') }}</h2>
        <p class="page-copy">
          {{ text(
            '先选 provider 或账号，再在主工作区顶部切换概览、设置、路由、权限和配对；复杂表单默认留在专门任务页。',
            'Pick a provider or account, then switch overview, settings, routing, access, and pairing from the top of the workspace; complex forms stay in focused task pages.'
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

    <section class="channels-workbench studio-workbench studio-workbench--object">
      <aside class="channels-sidebar operate-resource-rail mobile-resource-drawer studio-workbench-index">
        <section class="channels-sidebar-panel operate-workspace-surface operate-resource-panel">
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

            <div class="channels-sidebar-toolbar">
              <button
                v-if="showMobileRailToggle"
                type="button"
                class="secondary-button compact-button"
                @click="toggleMobileRail"
              >
                {{ showProviderRailBody ? text('收起列表', 'Hide providers') : text('切换频道', 'Switch provider') }}
              </button>
              <button type="button" class="secondary-button compact-button" @click="toggleCreateChannelPanel">
                {{ workspace.createChannelExpanded.value ? text('收起', 'Hide') : text('新增频道', 'Add Provider') }}
              </button>
            </div>
          </div>

          <p v-if="showMobileRailToggle" class="channels-sidebar-current">
            {{ text(`当前频道 ${currentProviderLabel}`, `Current ${currentProviderLabel}`) }}
          </p>

          <div v-if="showProviderRailBody" class="channels-sidebar-body">
            <div v-if="workspace.createChannelExpanded.value" class="channels-create-panel">
              <div class="form-field">
                <label class="form-label">{{ text('渠道类型', 'Provider Type') }}</label>
                <StudioSelect
                  v-model="workspace.createChannelDraft.type"
                  :options="workspace.availableCreateTypeOptions.value"
                  :placeholder="text('请选择渠道类型', 'Select provider type')"
                />
              </div>

              <label class="option-row">
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

            <div v-if="workspace.summary.value?.channels.length" class="channel-rail-list" :aria-label="text('频道和账号树', 'Provider and account tree')">
              <article
                v-for="channel in workspace.summary.value.channels"
                :key="channel.type"
                class="channel-rail-node"
                :class="{ active: channel.type === workspace.selectedChannelType.value }"
              >
                <button
                  type="button"
                  class="channel-rail-item"
                  :class="{ active: channel.type === workspace.selectedChannelType.value && !selectedAccount }"
                  @click="workspace.selectChannel(channel.type)"
                >
                  <div class="channel-rail-head">
                    <span class="channel-rail-icon" aria-hidden="true">
                      <MessageSquare class="channel-rail-svg" />
                    </span>
                    <div>
                      <strong>{{ workspace.channelLabel(channel.type) }}</strong>
                      <p>{{ channel.type }}</p>
                    </div>
                  </div>

                  <div class="channel-rail-meta">
                    <span>{{ text('账号', 'Accounts') }} {{ channel.accountCount }}</span>
                    <span>{{ text('路由', 'Routes') }} {{ channel.bindingCount }}</span>
                  </div>

                  <StatusPill :label="channel.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled')" :tone="channel.enabled ? 'sage' : 'neutral'" />
                </button>

                <div v-if="channel.accounts.length" class="channel-account-tree" :aria-label="text(`${workspace.channelLabel(channel.type)} 账号`, `${workspace.channelLabel(channel.type)} accounts`)">
                  <button
                    v-for="account in channel.accounts"
                    :key="`${channel.type}:${account.id}`"
                    type="button"
                    class="channel-account-node"
                    :class="{ active: isAccountSelected(channel.type, account.id), disabled: !account.enabled }"
                    @click="openAccountNode(channel.type, account.id)"
                  >
                    <span class="channel-account-node__name">{{ account.id }}</span>
                    <span class="channel-account-node__meta">
                      {{ account.kind === 'default' ? text('默认', 'Default') : text('命名', 'Named') }}
                      ·
                      {{ account.enabled ? text('启用', 'Enabled') : text('禁用', 'Disabled') }}
                    </span>
                    <span v-if="account.pairingPendingCount" class="channel-account-node__badge">
                      {{ text(`配对 ${account.pairingPendingCount}`, `Pairing ${account.pairingPendingCount}`) }}
                    </span>
                  </button>
                </div>
              </article>
            </div>

            <div v-else-if="!workspace.loading.value" class="empty-inline">
              {{ text('当前还没有任何频道入口。先创建一个 provider。', 'No providers exist yet. Create one to get started.') }}
            </div>
          </div>
        </section>
      </aside>

      <section class="channels-stage operate-stage studio-workbench-canvas">
        <div class="channels-task-workbench studio-workbench-task-shell" :class="{ 'is-empty': !workspace.selectedChannel.value }">
          <aside v-if="workspace.selectedChannel.value" class="channels-task-rail studio-workbench-task-rail" :aria-label="text('频道任务', 'Channel tasks')">
            <p class="eyebrow">{{ text('任务', 'Tasks') }}</p>
            <nav class="channels-task-nav studio-workbench-task-nav" :aria-label="text('频道任务页面', 'Channel task pages')">
              <button
                v-for="navItem in taskNavItems"
                :key="navItem.id"
                type="button"
                class="channels-task-nav-button studio-workbench-task-nav-button"
                :class="{ active: activeTaskNavId === navItem.id }"
                @click="openTaskNav(navItem.id)"
              >
                <component :is="navItem.icon" class="channels-task-nav-icon" aria-hidden="true" />
                <span>{{ navItem.label }}</span>
              </button>
            </nav>
          </aside>

          <section class="channels-task-canvas studio-workbench-active-canvas">
            <section v-if="workspace.selectedChannel.value" class="channels-stage-header operate-workspace-surface operate-stage-strip">
              <div class="channels-stage-head operate-stage-task-head">
                <div class="channels-stage-ident">
                  <span class="channels-stage-icon" aria-hidden="true">
                    <MessageSquare class="channels-stage-svg" />
                  </span>
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
                          : text('当前 provider 的概览、设置和路由规则会在这里切换；账号配置请从下方账号索引进入。', 'This stage switches between provider overview, settings, and routing rules. Open account settings from the account index below.')
                      }}
                    </p>
                  </div>
                </div>

                <div class="channels-stage-badges operate-fact-strip studio-fact-tape">
                  <span class="channels-stage-badge operate-summary-pill">{{ workspace.selectedChannel.value.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
                  <span class="channels-stage-badge operate-summary-pill">{{ text(`${workspace.selectedChannel.value.accountCount} 个账号`, `${workspace.selectedChannel.value.accountCount} accounts`) }}</span>
                  <span class="channels-stage-badge operate-summary-pill">{{ text(`${workspace.selectedChannel.value.bindingCount} 条路由`, `${workspace.selectedChannel.value.bindingCount} routes`) }}</span>
                  <span v-if="workspace.selectedChannel.value.defaultAccount" class="channels-stage-badge operate-summary-pill operate-badge">
                    {{ text(`默认账号 ${workspace.selectedChannel.value.defaultAccount}`, `Default ${workspace.selectedChannel.value.defaultAccount}`) }}
                  </span>
                </div>
              </div>

              <div v-if="!selectedAccount && activeTaskNavId === 'overview'" class="channels-stage-actions studio-command-lane">
                <button type="button" class="channels-stage-task primary" @click="openTaskNav('settings')">
                  <span>{{ text('Provider 设置', 'Provider settings') }}</span>
                  <strong>{{ text('编辑 provider 默认值和高级 JSON。', 'Edit provider defaults and advanced JSON.') }}</strong>
                </button>
                <button type="button" class="channels-stage-task" @click="openTaskNav('bindings')">
                  <span>{{ text('路由规则', 'Routing rules') }}</span>
                  <strong>{{ text('把频道或账号入口路由到 Agent。', 'Route channel or account entrypoints to agents.') }}</strong>
                </button>
                <button type="button" class="channels-stage-task" :disabled="!primaryActionAccountId" @click="openPrimaryAccess">
                  <span>{{ text('默认账号权限', 'Default account access') }}</span>
                  <strong>{{ text('进入默认账号的白名单与访问控制。', 'Open allowlists and access control for the default account.') }}</strong>
                </button>
                <button type="button" class="channels-stage-task" :disabled="!primaryActionAccountId" @click="openPrimaryPairing">
                  <span>{{ text('待配对', 'Pairing') }}</span>
                  <strong>{{ text('审批默认账号的 pairing 请求。', 'Review pairing requests for the default account.') }}</strong>
                </button>
              </div>
            </section>

            <RouterView />
          </section>
        </div>
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
import '../operate/operate-workspace.css';
import './channels-workspace.css';
import '../../shared/styles/studio-workbench.css';
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch, type Component } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { KeyRound, LayoutDashboard, MessageSquare, MoreHorizontal, Repeat2, ShieldCheck, UserRound } from '@lucide/vue';
import type { ChannelAccountInput } from '../../../../../types/channels';
import StatusPill from '../../components/StatusPill.vue';
import StudioSelect from '../../shared/components/StudioSelect.vue';
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

type ProviderTaskNavId = 'overview' | 'settings' | 'bindings';
type AccountTaskNavId = 'account' | 'access' | 'pairing';
type ChannelTaskNavId = ProviderTaskNavId | AccountTaskNavId;

interface ChannelTaskNavItem {
  id: ChannelTaskNavId;
  label: string;
  icon: Component;
}

const workspace = provideChannelsWorkspace();
const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();
const isMobileChannelsViewport = ref(false);
const mobileRailCollapsed = ref(false);
let resizeListenerRegistered = false;

const isChannelsRouteActive = computed(() => route.path === '/channels' || route.path.startsWith('/channels/'));

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

const activeTaskNavId = computed<ChannelTaskNavId>(() => {
  if (selectedAccount.value) {
    if (/\/access$/.test(route.path)) return 'access';
    if (/\/pairing$/.test(route.path)) return 'pairing';
    return 'account';
  }
  if (/\/settings$/.test(route.path)) return 'settings';
  if (/\/bindings$/.test(route.path)) return 'bindings';
  return 'overview';
});

const providerTaskNavItems = computed<ChannelTaskNavItem[]>(() => [
  { id: 'overview' as const, label: text('概览', 'Overview'), icon: LayoutDashboard },
  { id: 'settings' as const, label: text('设置', 'Settings'), icon: MoreHorizontal },
  { id: 'bindings' as const, label: text('路由', 'Routing'), icon: Repeat2 },
]);

const accountTaskNavItems = computed<ChannelTaskNavItem[]>(() => [
  { id: 'account' as const, label: text('账号', 'Account'), icon: UserRound },
  { id: 'access' as const, label: text('权限', 'Access'), icon: ShieldCheck },
  { id: 'pairing' as const, label: text('配对', 'Pairing'), icon: KeyRound },
]);

const taskNavItems = computed<ChannelTaskNavItem[]>(() => (selectedAccount.value ? accountTaskNavItems.value : providerTaskNavItems.value));

const selectedAccountKindLabel = computed(() => {
  if (!selectedAccount.value) return '';
  return selectedAccount.value.kind === 'default'
    ? text('当前是默认账号', 'This is the default account')
    : text('当前是命名账号', 'This is a named account');
});

const currentProviderLabel = computed(() => {
  return workspace.selectedChannel.value ? workspace.channelLabel(workspace.selectedChannel.value.type) : '';
});

const showMobileRailToggle = computed(() => {
  return isMobileChannelsViewport.value && Boolean(workspace.selectedChannel.value);
});

const showProviderRailBody = computed(() => {
  return !showMobileRailToggle.value || !mobileRailCollapsed.value || workspace.createChannelExpanded.value;
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

function isAccountSelected(channelType: string, accountId: string): boolean {
  return workspace.selectedChannelType.value === channelType && selectedAccount.value?.id === accountId;
}

function openAccountNode(channelType: string, accountId: string): void {
  void router.push(accountBasePath(channelType, accountId));
}

function openTaskNav(navId: ChannelTaskNavId): void {
  const channel = workspace.selectedChannel.value;
  if (!channel) return;
  if (navId === 'overview') {
    void router.push(providerBasePath(channel.type));
    return;
  }
  if (navId === 'settings') {
    void router.push(`${providerBasePath(channel.type)}/settings`);
    return;
  }
  if (navId === 'bindings') {
    void router.push(`${providerBasePath(channel.type)}/bindings`);
    return;
  }
  const account = selectedAccount.value;
  if (!channel || !account) return;
  const basePath = accountBasePath(channel.type, account.id);
  if (navId === 'account') {
    void router.push(basePath);
    return;
  }
  if (navId === 'access') {
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

function syncResponsiveRailState(): void {
  if (typeof window === 'undefined') return;
  const nextIsMobile = window.innerWidth <= 920;
  isMobileChannelsViewport.value = nextIsMobile;
  if (!nextIsMobile) {
    mobileRailCollapsed.value = false;
    return;
  }
  mobileRailCollapsed.value = Boolean(workspace.selectedChannel.value) && !workspace.createChannelExpanded.value;
}

function toggleMobileRail(): void {
  if (!showMobileRailToggle.value) return;
  if (showProviderRailBody.value) {
    workspace.createChannelExpanded.value = false;
    mobileRailCollapsed.value = true;
    return;
  }
  mobileRailCollapsed.value = false;
}

function toggleCreateChannelPanel(): void {
  const nextExpanded = !workspace.createChannelExpanded.value;
  workspace.createChannelExpanded.value = nextExpanded;
  if (nextExpanded) {
    mobileRailCollapsed.value = false;
  } else {
    syncResponsiveRailState();
  }
}

watch(
  () => [activeOverlay.value, overlayAccount.value?.id, workspace.selectedChannel.value?.type] as const,
  async ([overlay, accountId, channelType]) => {
    if (!isChannelsRouteActive.value) return;
    if (overlay !== 'credentials' || !accountId || !channelType) return;
    workspace.busyKey.value = 'load-credentials';
    try {
      const payload = await fetchChannelAccountCredentials(channelType, accountId);
      if (!isChannelsRouteActive.value) return;
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

watch(
  () => [workspace.selectedChannel.value?.type, workspace.createChannelExpanded.value] as const,
  () => {
    if (!isChannelsRouteActive.value) return;
    syncResponsiveRailState();
  },
  { immediate: true },
);

function registerResizeListener(): void {
  if (resizeListenerRegistered || typeof window === 'undefined') return;
  window.addEventListener('resize', syncResponsiveRailState);
  resizeListenerRegistered = true;
}

function unregisterResizeListener(): void {
  if (!resizeListenerRegistered || typeof window === 'undefined') return;
  window.removeEventListener('resize', syncResponsiveRailState);
  resizeListenerRegistered = false;
}

function activateChannelsWorkspaceChrome(): void {
  if (!isChannelsRouteActive.value) return;
  syncResponsiveRailState();
  registerResizeListener();
}

onMounted(() => {
  activateChannelsWorkspaceChrome();
});

onActivated(() => {
  activateChannelsWorkspaceChrome();
});

onDeactivated(() => {
  unregisterResizeListener();
});

onBeforeUnmount(() => {
  unregisterResizeListener();
});

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
