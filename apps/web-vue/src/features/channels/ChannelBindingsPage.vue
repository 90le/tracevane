<template>
  <section v-if="channel" class="channels-stage-view">
    <article v-if="focusedAccount" class="channels-focus-strip">
      <div>
        <p class="eyebrow">{{ text('FOCUS', 'FOCUS') }}</p>
        <strong>{{ text('当前聚焦账号', 'Focused account') }} · {{ focusedAccount.id }}</strong>
      </div>
      <button type="button" class="secondary-button compact-button" @click="clearAccountFocus">
        {{ text('查看全部绑定', 'Show all bindings') }}
      </button>
    </article>

    <article class="channels-stage-section binding-table-shell">
      <div class="channels-stage-task-head operate-stage-task-head">
        <div>
          <p class="eyebrow">{{ focusedAccount ? `${channel.type} · ${focusedAccount.id}` : channel.type }}</p>
          <h3>{{ text('绑定列表', 'Binding list') }}</h3>
          <p>{{ text('先看已有命中规则，再决定是否新增。账号聚焦时这里只显示该账号相关绑定。', 'Review existing routing rules first, then decide whether to add another. When an account is focused, only bindings for that account are shown here.') }}</p>
        </div>

        <div class="page-actions">
          <button type="button" class="primary-button compact-button" @click="startCreate">{{ text('新增绑定', 'Create binding') }}</button>
        </div>
      </div>

      <ChannelBindingEditorPanel
        v-if="isCreatingBinding"
        :eyebrow="editorEyebrow"
        :title="bindingTaskTitle"
        :description="bindingEditorDescription"
        :draft="draft"
        :binding-type-options="bindingTypeOptions"
        :peer-kind-options="peerKindOptions"
        :agent-options="agentOptions"
        :account-options="accountOptions"
        :saving="saving"
        @cancel="cancelEdit"
        @save="save"
      />

      <div v-if="visibleBindings.length" class="binding-table">
        <div class="binding-table-head">
          <span>{{ text('Agent', 'Agent') }}</span>
          <span>{{ text('匹配', 'Match') }}</span>
          <span>{{ text('账户', 'Account') }}</span>
          <span></span>
        </div>

        <div v-for="binding in visibleBindings" :key="binding.id" class="binding-table-item">
          <div
            class="binding-table-row"
            :class="{ active: editingBindingId === binding.id }"
          >
            <div class="binding-table-cell">
              <strong>{{ binding.agentId }}</strong>
              <p>{{ binding.type === 'acp' ? 'ACP' : text('普通绑定', 'Standard binding') }}</p>
            </div>
            <div class="binding-table-cell">
              <strong>{{ binding.match.peerKind || '—' }}</strong>
              <p>{{ binding.match.peerId || binding.match.guildId || binding.match.teamId || '—' }}</p>
            </div>
            <div class="binding-table-cell">
              <strong>{{ binding.accountId || text('整个渠道', 'Whole provider') }}</strong>
            </div>
            <div class="binding-table-actions">
              <button type="button" class="secondary-button compact-button" @click="startEdit(binding)">{{ text('编辑', 'Edit') }}</button>
              <button type="button" class="danger-link" @click="remove(binding.id)">{{ text('删除', 'Delete') }}</button>
            </div>
          </div>

          <div v-if="editingBindingId === binding.id" class="binding-table-editor-row">
            <ChannelBindingEditorPanel
              :eyebrow="editorEyebrow"
              :title="bindingTaskTitle"
              :description="bindingEditorDescription"
              :draft="draft"
              :binding-type-options="bindingTypeOptions"
              :peer-kind-options="peerKindOptions"
              :agent-options="agentOptions"
              :account-options="accountOptions"
              :saving="saving"
              inline
              @cancel="cancelEdit"
              @save="save"
            />
          </div>
        </div>
      </div>
      <div v-else class="empty-inline">
        {{
          focusedAccount
            ? text('这个账号还没有绑定。', 'This account does not have any bindings yet.')
            : text('当前 provider 还没有绑定。', 'This provider does not have any bindings yet.')
        }}
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ChannelBindingSummary } from '../../../../../types/channels';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { useLocalePreference } from '../../shared/locale';
import { createChannelBinding, deleteChannelBinding, updateChannelBinding } from './api';
import { buildBindingTypeOptions, buildPeerKindOptions } from './channel-ui';
import ChannelBindingEditorPanel from './ChannelBindingEditorPanel.vue';
import { useChannelsWorkspace } from './workspace';

defineOptions({ name: 'ChannelBindingsPage' });

const workspace = useChannelsWorkspace();
const router = useRouter();
const route = useRoute();
const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();

const channel = computed(() => workspace.selectedChannel.value);
const bindings = computed(() => workspace.selectedBindings.value);
const saving = computed(() => workspace.busyKey.value === 'save-binding');
const focusedAccountId = computed(() => {
  const value = route.query.accountId;
  if (typeof value !== 'string' || !value) return '';
  return channel.value?.accounts.some((account) => account.id === value) ? value : '';
});
const focusedAccount = computed(() => {
  return channel.value?.accounts.find((account) => account.id === focusedAccountId.value) || null;
});
const visibleBindings = computed(() => {
  if (!focusedAccountId.value) return bindings.value;
  return bindings.value.filter((binding) => (binding.accountId || '') === focusedAccountId.value);
});
const bindingTaskTitle = computed(() => {
  if (editingBindingId.value) {
    return focusedAccount.value
      ? text(`修改账号 ${focusedAccount.value.id} 的绑定`, `Edit binding for account ${focusedAccount.value.id}`)
      : text('修改绑定', 'Edit binding');
  }
  return focusedAccount.value
    ? text(`为账号 ${focusedAccount.value.id} 新增绑定`, `Create binding for account ${focusedAccount.value.id}`)
    : text('新增绑定', 'Create binding');
});
const editorEyebrow = computed(() => {
  return focusedAccount.value ? `${channel.value?.type || ''} · ${focusedAccount.value.id}` : channel.value?.type || '';
});
const bindingEditorDescription = computed(() => {
  return text('绑定编辑只保留匹配、账号和 ACP 路由字段，不再额外堆说明卡。', 'Binding editing now stays focused on match rules, target accounts, and ACP routing without extra explanatory cards.');
});
const isCreatingBinding = computed(() => editing.value && !editingBindingId.value);

const bindingTypeOptions = computed(() => buildBindingTypeOptions(text));
const peerKindOptions = computed(() => buildPeerKindOptions(text));
const agentOptions = computed(() => {
  return workspace.agents.value.map((agent) => ({
    value: agent.id,
    label: `${agent.name} · ${agent.id}`,
  }));
});
const accountOptions = computed(() => {
  const options = [{ value: '', label: text('未指定，作用于整个渠道', 'Unset for the whole provider') }];
  for (const account of channel.value?.accounts || []) {
    options.push({ value: account.id, label: account.id });
  }
  return options;
});

const editing = ref(false);
const editingBindingId = ref('');
const draft = reactive({
  type: 'agent',
  agentId: '',
  accountId: '',
  comment: '',
  peerKind: '',
  peerId: '',
  guildId: '',
  teamId: '',
  roles: '',
  acpMode: '',
  acpLabel: '',
  acpCwd: '',
  acpBackend: '',
});

function parseBindingRoles(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resetDraft(): void {
  editing.value = false;
  editingBindingId.value = '';
  draft.type = 'agent';
  draft.agentId = '';
  draft.accountId = focusedAccountId.value;
  draft.comment = '';
  draft.peerKind = '';
  draft.peerId = '';
  draft.guildId = '';
  draft.teamId = '';
  draft.roles = '';
  draft.acpMode = '';
  draft.acpLabel = '';
  draft.acpCwd = '';
  draft.acpBackend = '';
}

function startCreate(): void {
  resetDraft();
  editing.value = true;
  draft.accountId = focusedAccountId.value;
}

function startEdit(binding: ChannelBindingSummary): void {
  editing.value = true;
  editingBindingId.value = binding.id;
  draft.type = binding.type;
  draft.agentId = binding.agentId;
  draft.accountId = binding.accountId || '';
  draft.comment = binding.comment || '';
  draft.peerKind = binding.match.peerKind || '';
  draft.peerId = binding.match.peerId || '';
  draft.guildId = binding.match.guildId || '';
  draft.teamId = binding.match.teamId || '';
  draft.roles = binding.match.roles.join(', ');
  draft.acpMode = binding.acp?.mode || '';
  draft.acpLabel = binding.acp?.label || '';
  draft.acpCwd = binding.acp?.cwd || '';
  draft.acpBackend = binding.acp?.backend || '';
}

function cancelEdit(): void {
  resetDraft();
}

async function clearAccountFocus(): Promise<void> {
  const nextQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string' && key !== 'accountId' && key !== 'intent') {
      nextQuery[key] = value;
    }
  }
  await router.replace({ query: nextQuery });
}

async function consumeCreateIntent(): Promise<void> {
  if (route.query.intent !== 'create') return;
  const nextQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string' && key !== 'intent') {
      nextQuery[key] = value;
    }
  }
  await router.replace({ query: nextQuery });
}

async function save(): Promise<void> {
  if (!channel.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-binding';
  try {
    const payload = {
      type: draft.type as 'agent' | 'acp',
      agentId: draft.agentId,
      channel: channel.value.type,
      accountId: draft.accountId || null,
      comment: draft.comment || null,
      peerKind: draft.peerKind || null,
      peerId: draft.peerId || null,
      guildId: draft.guildId || null,
      teamId: draft.teamId || null,
      roles: parseBindingRoles(draft.roles),
      acpMode: draft.type === 'acp' ? draft.acpMode || null : null,
      acpLabel: draft.type === 'acp' ? draft.acpLabel || null : null,
      acpCwd: draft.type === 'acp' ? draft.acpCwd || null : null,
      acpBackend: draft.type === 'acp' ? draft.acpBackend || null : null,
    };
    const response = editingBindingId.value
      ? await updateChannelBinding(editingBindingId.value, payload)
      : await createChannelBinding(payload);
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    resetDraft();
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

async function remove(bindingId: string): Promise<void> {
  if (!channel.value) return;
  const accepted = await confirm({
    title: text('确认删除绑定', 'Confirm delete binding'),
    message: text('确定删除这条 binding 吗？', 'Delete this binding?'),
    confirmText: text('删除', 'Delete'),
    cancelText: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!accepted) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-binding';
  try {
    const response = await deleteChannelBinding(bindingId);
    workspace.summary.value = response.summary;
    workspace.setSuccessMessage(response.message);
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}

watch(
  () => [focusedAccountId.value, route.query.intent] as const,
  async ([accountId, intent]) => {
    if (!accountId || intent !== 'create') return;
    resetDraft();
    editing.value = true;
    draft.accountId = focusedAccountId.value;
    await consumeCreateIntent();
  },
  { immediate: true },
);
</script>
