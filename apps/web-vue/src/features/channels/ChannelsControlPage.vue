<template>
  <section v-if="channel" class="channels-overview-surface">
    <ChannelProviderOverview
      :channel="channel"
      :issues="issues"
      :bindings="bindings"
      :busy-account-id="busyAccountId"
      @open-create-account="workspace.openOverlay('new-account')"
      @update-provider-enabled="updateProviderEnabled"
      @update-provider-default-account="updateProviderDefaultAccount"
      @toggle-account-enabled="toggleAccountEnabled"
      @open-account="openAccountDetail"
      @open-access="openAccessPage"
      @open-pairing="openPairingPage"
      @open-credentials="openCredentialDrawer"
      @open-bindings="openBindingsPage"
      @delete-account="deleteAccount"
      @delete-channel="deleteProvider"
      @activate-issue="activateIssue"
    />
  </section>
  <article v-else class="channels-overview-empty">
    <p class="eyebrow">{{ text('CHANNELS', 'CHANNELS') }}</p>
    <h3>{{ text('请选择一个频道', 'Select a provider') }}</h3>
    <p class="panel-muted">
      {{ text('左侧索引只负责选对象。右侧会根据当前 provider 展示概览、快捷动作和专门编辑页入口。', 'The left rail selects the current object. The right workspace then shows overview, quick actions, and dedicated deep-edit entry points.') }}
    </p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { useLocalePreference } from '../../shared/locale';
import { deleteChannel, deleteChannelAccount, updateChannel, updateChannelAccount } from './api';
import { buildAccountMutationInput, buildChannelIssues } from './channel-ui';
import type { ChannelIssue } from './channel-ui';
import ChannelProviderOverview from './ChannelProviderOverview.vue';
import { useChannelsWorkspace } from './workspace';
import './channels-pages.css';

defineOptions({ name: 'ChannelsControlPage' });

const workspace = useChannelsWorkspace();
const router = useRouter();
const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();

const channel = computed(() => workspace.selectedChannel.value);
const bindings = computed(() => workspace.selectedBindings.value);
const issues = computed(() => buildChannelIssues(channel.value, text));
const busyAccountId = computed(() => {
  const toggleMatch = /^toggle-account:(.+)$/.exec(workspace.busyKey.value || '');
  if (toggleMatch) return toggleMatch[1] || '';
  const deleteMatch = /^delete-account:(.+)$/.exec(workspace.busyKey.value || '');
  if (deleteMatch) return deleteMatch[1] || '';
  if (
    workspace.busyKey.value === 'update-provider-enabled'
    || workspace.busyKey.value === 'update-provider-default-account'
    || workspace.busyKey.value === 'delete-channel'
  ) {
    return '__provider__';
  }
  return '';
});

function openAccountDetail(accountId: string): void {
  if (!channel.value) return;
  void router.push(`/channels/${encodeURIComponent(channel.value.type)}/accounts/${encodeURIComponent(accountId)}`);
}

function openAccessPage(accountId: string): void {
  if (!channel.value) return;
  void router.push(`/channels/${encodeURIComponent(channel.value.type)}/accounts/${encodeURIComponent(accountId)}/access`);
}

function openPairingPage(accountId: string): void {
  if (!channel.value) return;
  void router.push(`/channels/${encodeURIComponent(channel.value.type)}/accounts/${encodeURIComponent(accountId)}/pairing`);
}

function openBindingsPage(accountId: string): void {
  if (!channel.value) return;
  void router.push({
    path: `/channels/${encodeURIComponent(channel.value.type)}/bindings`,
    query: {
      accountId,
      intent: 'create',
    },
  });
}

function openCredentialDrawer(accountId: string): void {
  void workspace.openOverlay('credentials', accountId);
}

async function deleteAccount(accountId: string): Promise<void> {
  if (!channel.value) return;
  const account = channel.value.accounts.find((entry) => entry.id === accountId);
  if (!account || account.kind === 'default') return;
  const channelType = channel.value.type;
  const accepted = await confirm({
    title: text('确认删除账号', 'Confirm delete account'),
    message: text(
      `确定删除账号 ${accountId} 吗？该账号相关绑定也会一起移除。`,
      `Delete account ${accountId}? Related bindings for this account will also be removed.`
    ),
    confirmText: text('删除账号', 'Delete account'),
    cancelText: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!accepted) {
    return;
  }

  workspace.clearMessages();
  workspace.busyKey.value = `delete-account:${accountId}`;
  try {
    const response = await deleteChannelAccount(channelType, accountId);
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.refreshSummary(channelType);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

async function deleteProvider(): Promise<void> {
  if (!channel.value) return;
  const channelType = channel.value.type;
  const accepted = await confirm({
    title: text('确认删除频道', 'Confirm delete provider'),
    message: text(
      `确定删除频道 ${channelType} 吗？该频道的账号和绑定也会一起移除。`,
      `Delete provider ${channelType}? Its accounts and bindings will also be removed.`
    ),
    confirmText: text('删除频道', 'Delete provider'),
    cancelText: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!accepted) {
    return;
  }

  workspace.clearMessages();
  workspace.busyKey.value = 'delete-channel';
  try {
    const response = await deleteChannel(channelType);
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.refreshSummary();
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

function activateIssue(issue: ChannelIssue): void {
  if (!issue.accountId) return;
  if (issue.action === 'credentials') {
    openCredentialDrawer(issue.accountId);
    return;
  }
  if (issue.action === 'access') {
    openAccessPage(issue.accountId);
    return;
  }
  if (issue.action === 'pairing') {
    openPairingPage(issue.accountId);
    return;
  }
  openAccountDetail(issue.accountId);
}

function buildProviderSettingsPatch(next: { enabled?: boolean; defaultAccount?: string | null }) {
  if (!channel.value) return null;
  return {
    enabled: next.enabled ?? channel.value.enabled,
    defaultAccount: next.defaultAccount ?? channel.value.defaultAccount,
    dmPolicy: channel.value.dmPolicy,
    groupPolicy: channel.value.groupPolicy,
    contextVisibility: channel.value.contextVisibility,
    streaming: channel.value.streaming,
    proxy: channel.value.proxy,
    connectionMode: channel.value.connectionMode,
    renderMode: channel.value.renderMode,
    domain: channel.value.domain,
    responsePrefix: channel.value.responsePrefix,
    configWrites: channel.value.configWrites,
    healthMonitor: channel.value.healthMonitor,
    dm: channel.value.dmConfig,
    groups: channel.value.groupsConfig,
    guilds: channel.value.guildsConfig,
    execApprovals: channel.value.execApprovalsConfig,
    threadBindings: channel.value.threadBindings,
  };
}

async function toggleAccountEnabled(accountId: string): Promise<void> {
  if (!channel.value) return;
  const account = channel.value.accounts.find((entry) => entry.id === accountId);
  if (!account) return;

  workspace.clearMessages();
  workspace.busyKey.value = `toggle-account:${accountId}`;
  try {
    const response = await updateChannelAccount(
      channel.value.type,
      accountId,
      buildAccountMutationInput(account, {
        enabled: !account.enabled,
      }),
    );
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

async function updateProviderEnabled(enabled: boolean): Promise<void> {
  const payload = buildProviderSettingsPatch({ enabled });
  if (!channel.value || !payload) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'update-provider-enabled';
  try {
    const response = await updateChannel(channel.value.type, payload);
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

async function updateProviderDefaultAccount(defaultAccount: string | null): Promise<void> {
  const payload = buildProviderSettingsPatch({ defaultAccount });
  if (!channel.value || !payload) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'update-provider-default-account';
  try {
    const response = await updateChannel(channel.value.type, payload);
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}
</script>
