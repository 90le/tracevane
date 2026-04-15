<template>
  <DialogRoot :open="confirmOpen" @update:open="handleConfirmOpenChange">
    <DialogPortal>
      <DialogOverlay class="agents-confirm-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section v-if="confirmOpen && confirmState" class="agents-confirm-dialog">
          <header class="agents-confirm-head">
            <div class="agents-confirm-copy">
              <DialogTitle as-child>
                <strong>{{ confirmState.title }}</strong>
              </DialogTitle>
              <DialogDescription as-child>
                <span>{{ confirmState.description }}</span>
              </DialogDescription>
            </div>
            <DialogClose as-child>
              <button type="button" class="agents-confirm-close" :aria-label="text('关闭确认窗口', 'Close confirmation dialog')">×</button>
            </DialogClose>
          </header>
          <footer class="agents-confirm-actions">
            <button type="button" class="agents-confirm-secondary" :disabled="bindingBusy" @click="closeConfirm">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="agents-confirm-primary" :disabled="bindingBusy" @click="confirmAction">
              {{ bindingBusy ? text('处理中...', 'Working...') : confirmState.confirmLabel }}
            </button>
          </footer>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <section v-if="detail && agentId" class="agents-stage-view">
    <div class="agents-stage-task-head">
      <div>
        <p class="eyebrow">{{ agentId }}</p>
        <h3>{{ text('绑定管理', 'Bindings') }}</h3>
        <p>{{ text('当前页面只负责入口绑定、目标账号和 ACP 路由。', 'This page only manages entry bindings, target accounts, and ACP routes.') }}</p>
      </div>

    </div>

    <article v-if="noticeMessage" class="panel-card">{{ noticeMessage }}</article>
    <article v-if="errorMessage" class="panel-card">{{ errorMessage }}</article>

    <article class="panel-card agents-stage-panel">
      <div class="agents-section-head">
        <div>
          <h3>{{ text('现有绑定', 'Existing bindings') }}</h3>
          <p>{{ text('这里直接查看和编辑当前 Agent 连接到哪些 channel / account。', 'Review and edit which channel or account routes into the current agent.') }}</p>
        </div>
        <div class="page-actions">
          <button type="button" class="secondary-button compact-button" :disabled="bindingBusy" @click="openCreateBindingDialog()">
            {{ text('新增绑定', 'Add binding') }}
          </button>
        </div>
      </div>

      <div class="agents-summary-strip agents-binding-summary-strip">
        <span class="agents-summary-pill">
          {{ text(`绑定 ${detail.bindings.length}`, `${detail.bindings.length} bindings`) }}
        </span>
        <span class="agents-summary-pill">
          {{ text(`可选频道 ${detail.bindingTargets.length}`, `${detail.bindingTargets.length} target channels`) }}
        </span>
        <span class="agents-summary-pill">
          {{
            text(
              `已用频道 ${new Set(detail.bindings.map((binding) => binding.channel).filter(Boolean)).size}`,
              `${new Set(detail.bindings.map((binding) => binding.channel).filter(Boolean)).size} linked channels`,
            )
          }}
        </span>
        <span class="agents-summary-pill">
          {{ detail.bindings.some((binding) => binding.type === 'acp') ? text('包含 ACP 路由', 'Includes ACP route') : text('无 ACP 路由', 'No ACP route') }}
        </span>
      </div>

      <div v-if="detail.bindings.length" class="agents-binding-list">
        <article v-for="binding in detail.bindings" :key="binding.id" class="agents-binding-row">
          <div class="agents-binding-main">
            <strong>{{ binding.description || binding.label || binding.id }}</strong>
            <p>{{ binding.comment || text('没有额外备注。', 'No extra comment.') }}</p>
            <div class="agents-binding-main__facts">
              <span>{{ text('绑定 ID', 'Binding ID') }}: {{ binding.id }}</span>
              <span>{{ binding.type === 'acp' ? 'ACP' : text('普通路由', 'Standard') }}</span>
            </div>
          </div>
          <div class="agents-binding-meta">
            <span>{{ binding.type === 'acp' ? 'ACP' : text('普通路由', 'Standard') }}</span>
            <span>{{ text('频道', 'Channel') }}: {{ binding.channel || text('未设置', 'Unset') }}</span>
            <span>{{ text('账号', 'Account') }}: {{ binding.accountId || text('默认', 'Default') }}</span>
            <span v-if="binding.peerKind || binding.peerId">{{ text('目标', 'Peer') }}: {{ binding.peerKind || text('未设置', 'Unset') }} {{ binding.peerId || '' }}</span>
            <span v-if="binding.guildId">{{ text('Guild', 'Guild') }}: {{ binding.guildId }}</span>
            <span v-if="binding.teamId">{{ text('Team', 'Team') }}: {{ binding.teamId }}</span>
            <span v-if="binding.roles.length">{{ text('角色', 'Roles') }}: {{ binding.roles.join(', ') }}</span>
            <span v-if="binding.label">{{ text('标识', 'Label') }}: {{ binding.label }}</span>
            <span v-if="binding.mode">{{ text('模式', 'Mode') }}: {{ binding.mode }}</span>
            <span v-if="binding.backend">{{ text('后端', 'Backend') }}: {{ binding.backend }}</span>
            <span v-if="binding.cwd">{{ text('运行目录', 'CWD') }}: {{ binding.cwd }}</span>
          </div>
          <div class="agents-binding-actions">
            <button type="button" class="secondary-button compact-button" @click="openChannelWorkspace(binding)">
              {{ text('打开频道', 'Open Channel') }}
            </button>
            <button type="button" class="secondary-button compact-button" @click="openChannelBindings(binding)">
              {{ text('频道绑定', 'Channel Bindings') }}
            </button>
            <button type="button" class="secondary-button compact-button" @click="openEditBindingDialog(binding.id)">
              {{ text('修改', 'Edit') }}
            </button>
            <button type="button" class="danger-link compact-button" :disabled="bindingBusy" @click="removeBinding(binding.id)">
              {{ text('删除', 'Delete') }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="empty-inline">
        {{ text('当前没有显式绑定。这个 Agent 可能只通过默认路由或手动指定进入。', 'No explicit bindings exist. This agent may only be reached through a default route or manual targeting.') }}
      </div>
    </article>

    <Teleport to="body">
      <div v-if="bindingDialogOpen" class="agents-modal-mask" @click.self="closeBindingDialog">
        <section class="agents-modal agents-binding-dialog" role="dialog" aria-modal="true" :aria-label="editingBindingId ? text('修改绑定', 'Edit binding') : text('新增绑定', 'Add binding')">
          <header class="agents-modal-head">
            <div>
              <h3>{{ editingBindingId ? text('修改绑定', 'Edit binding') : text('新增绑定', 'Add binding') }}</h3>
              <p>{{ text('在弹窗中完成绑定编辑，避免表单和下拉选项被页面卡片裁切。', 'Edit bindings in a modal so forms and dropdown menus are no longer clipped by neighboring cards.') }}</p>
            </div>
            <button type="button" class="agents-modal-close" :aria-label="text('关闭', 'Close')" @click="closeBindingDialog">✕</button>
          </header>

          <div class="agents-modal-body">
            <div class="agents-form-grid">
              <div class="form-field">
                <label class="form-label">{{ text('绑定类型', 'Binding type') }}</label>
                <GlassSelect v-model="bindingForm.type" :options="bindingTypeOptions" :placeholder="text('选择类型', 'Select type')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('频道', 'Channel') }}</label>
                <GlassSelect v-model="bindingForm.channel" :options="bindingChannelOptions" :placeholder="text('选择频道', 'Select channel')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('账号', 'Account') }}</label>
                <GlassSelect v-model="bindingForm.accountId" :options="bindingAccountOptions" :placeholder="text('默认账号 / 不指定', 'Default / unspecified')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('备注', 'Comment') }}</label>
                <input v-model="bindingForm.comment" class="form-input" :placeholder="text('例如 主入口 DM', 'For example Primary DM route')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('匹配类型', 'Peer kind') }}</label>
                <GlassSelect v-model="bindingForm.peerKind" :options="peerKindOptions" :placeholder="text('不指定', 'Unset')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('Peer ID', 'Peer ID') }}</label>
                <input v-model="bindingForm.peerId" class="form-input" :placeholder="text('例如频道或用户 ID', 'For example a channel or user id')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('Guild ID', 'Guild ID') }}</label>
                <input v-model="bindingForm.guildId" class="form-input" :placeholder="text('例如 Discord guild id', 'For example Discord guild id')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('Team ID', 'Team ID') }}</label>
                <input v-model="bindingForm.teamId" class="form-input" :placeholder="text('例如 Slack team id', 'For example Slack team id')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('标识', 'Label') }}</label>
                <input v-model="bindingForm.label" class="form-input" :placeholder="text('例如 frontend-codex-main', 'For example frontend-codex-main')" />
              </div>
              <div class="form-field form-field-full">
                <label class="form-label">{{ text('绑定角色', 'Binding roles') }}</label>
                <textarea
                  v-model="bindingRolesText"
                  class="form-textarea"
                  rows="3"
                  :placeholder="text('用逗号或换行分隔，例如：ops, triage', 'Use commas or new lines, for example: ops, triage')"
                />
              </div>
              <div class="form-field" v-if="bindingForm.type === 'acp'">
                <label class="form-label">{{ text('后端', 'Backend') }}</label>
                <GlassSelect v-model="bindingForm.backend" :options="runtimeBackendOptions" :placeholder="text('选择后端', 'Select backend')" />
              </div>
              <div class="form-field" v-if="bindingForm.type === 'acp'">
                <label class="form-label">{{ text('模式', 'Mode') }}</label>
                <GlassSelect v-model="bindingForm.mode" :options="runtimeModeOptions" :placeholder="text('选择模式', 'Select mode')" />
              </div>
              <div class="form-field form-field-full" v-if="bindingForm.type === 'acp'">
                <label class="form-label">{{ text('运行目录', 'CWD') }}</label>
                <input v-model="bindingForm.cwd" class="form-input" :placeholder="detail.agent.workspace" />
              </div>
            </div>
          </div>

          <footer class="agents-modal-foot">
            <button type="button" class="secondary-button" :disabled="bindingBusy" @click="closeBindingDialog">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="bindingBusy" @click="saveBinding">
              {{ bindingBusy ? text('保存中...', 'Saving...') : editingBindingId ? text('保存修改', 'Save Changes') : text('新增绑定', 'Add binding') }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import type { AgentBindingInput, AgentDetailPayload } from '../../../../../types/agents';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { createAgentBinding, deleteAgentBinding, fetchAgentDetail, updateAgentBinding } from './api';

defineOptions({ name: 'AgentBindingsPage' });

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const agentId = computed(() => String(route.params.agentId || ''));
const detail = ref<AgentDetailPayload | null>(null);
const bindingBusy = ref(false);
const bindingDialogOpen = ref(false);
const editingBindingId = ref('');
const errorMessage = ref('');
const noticeMessage = ref('');
const confirmOpen = ref(false);
const confirmState = ref<{ title: string; description: string; confirmLabel: string } | null>(null);
const confirmActionHandler = ref<(() => Promise<void>) | null>(null);

const bindingForm = reactive<AgentBindingInput>({
  type: 'route',
  channel: '',
  accountId: '',
  comment: '',
  peerKind: '',
  peerId: '',
  guildId: '',
  teamId: '',
  roles: [],
  backend: 'acpx',
  mode: 'persistent',
  cwd: '',
  label: '',
});
const bindingRolesText = ref('');

const bindingTypeOptions = computed(() => [
  { value: 'route', label: text('普通路由', 'Standard') },
  { value: 'acp', label: 'ACP' },
]);
const peerKindOptions = computed(() => [
  { value: '', label: text('不指定', 'Unset') },
  { value: 'user', label: 'user' },
  { value: 'channel', label: 'channel' },
  { value: 'thread', label: 'thread' },
  { value: 'guild', label: 'guild' },
]);
const runtimeBackendOptions = computed(() => [{ value: 'acpx', label: 'acpx' }]);
const runtimeModeOptions = computed(() => [
  { value: 'persistent', label: text('持久', 'Persistent') },
  { value: 'oneshot', label: text('单次', 'Oneshot') },
]);
const bindingChannelOptions = computed(() => {
  return (detail.value?.bindingTargets || []).map((target) => ({
    value: target.channel,
    label: target.label,
  }));
});
const selectedBindingTarget = computed(() => {
  return (detail.value?.bindingTargets || []).find((target) => target.channel === bindingForm.channel) || null;
});
const bindingAccountOptions = computed(() => {
  const options = [{ value: '', label: text('默认账号 / 不指定', 'Default / unspecified') }];
  for (const account of selectedBindingTarget.value?.accounts || []) {
    options.push({ value: account.id, label: account.label });
  }
  return options;
});

function openChannelWorkspace(binding: AgentDetailPayload['bindings'][number]): void {
  if (!binding.channel) return;
  if (binding.accountId) {
    void router.push(`/channels/${encodeURIComponent(binding.channel)}/accounts/${encodeURIComponent(binding.accountId)}`);
    return;
  }
  void router.push(`/channels/${encodeURIComponent(binding.channel)}`);
}

function openChannelBindings(binding: AgentDetailPayload['bindings'][number]): void {
  if (!binding.channel) return;
  if (binding.accountId) {
    void router.push({
      path: `/channels/${encodeURIComponent(binding.channel)}/bindings`,
      query: { accountId: binding.accountId },
    });
    return;
  }
  void router.push(`/channels/${encodeURIComponent(binding.channel)}/bindings`);
}

function resetBindingForm(seed?: Partial<AgentBindingInput>): void {
  bindingForm.type = seed?.type || 'route';
  bindingForm.channel = seed?.channel || detail.value?.bindingTargets[0]?.channel || '';
  bindingForm.accountId = seed?.accountId || '';
  bindingForm.comment = seed?.comment || '';
  bindingForm.peerKind = seed?.peerKind || '';
  bindingForm.peerId = seed?.peerId || '';
  bindingForm.guildId = seed?.guildId || '';
  bindingForm.teamId = seed?.teamId || '';
  bindingForm.roles = Array.isArray(seed?.roles) ? [...seed.roles] : [];
  bindingRolesText.value = bindingForm.roles.join(', ');
  bindingForm.backend = seed?.backend || 'acpx';
  bindingForm.mode = seed?.mode || 'persistent';
  bindingForm.cwd = seed?.cwd || detail.value?.agent.workspace || '';
  bindingForm.label = seed?.label || '';
}

function openCreateBindingDialog(): void {
  editingBindingId.value = '';
  resetBindingForm({ cwd: detail.value?.agent.workspace || '' });
  bindingDialogOpen.value = true;
}

function openEditBindingDialog(bindingId: string): void {
  const binding = detail.value?.bindings.find((item) => item.id === bindingId);
  if (!binding) return;
  editingBindingId.value = binding.id;
  resetBindingForm({
    type: binding.type,
    channel: binding.channel,
    accountId: binding.accountId,
    comment: binding.comment,
    peerKind: binding.peerKind,
    peerId: binding.peerId,
    guildId: binding.guildId,
    teamId: binding.teamId,
    roles: binding.roles,
    backend: binding.backend,
    mode: binding.mode,
    cwd: binding.cwd,
    label: binding.label,
  });
  bindingDialogOpen.value = true;
}

function closeBindingDialog(): void {
  bindingDialogOpen.value = false;
  editingBindingId.value = '';
}

function handleConfirmOpenChange(open: boolean): void {
  confirmOpen.value = open;
  if (!open) {
    confirmState.value = null;
    confirmActionHandler.value = null;
  }
}

function closeConfirm(): void {
  confirmOpen.value = false;
  confirmState.value = null;
  confirmActionHandler.value = null;
}

function openConfirm(options: { title: string; description: string; confirmLabel: string; action: () => Promise<void> }): void {
  confirmState.value = {
    title: options.title,
    description: options.description,
    confirmLabel: options.confirmLabel,
  };
  confirmActionHandler.value = options.action;
  confirmOpen.value = true;
}

async function confirmAction(): Promise<void> {
  if (!confirmActionHandler.value) return;
  const action = confirmActionHandler.value;
  closeConfirm();
  await action();
}

async function loadDetail(): Promise<void> {
  if (!agentId.value) return;
  errorMessage.value = '';
  const payload = await fetchAgentDetail(agentId.value);
  detail.value = payload;
  resetBindingForm({ cwd: payload.agent.workspace });
}

async function saveBinding(): Promise<void> {
  if (!agentId.value) return;
  if (!bindingForm.channel) {
    errorMessage.value = text('请先选择绑定频道。', 'Please select a channel first.');
    return;
  }

  bindingBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const payload = {
      type: bindingForm.type,
      channel: bindingForm.channel,
      accountId: bindingForm.accountId,
      comment: bindingForm.comment,
      peerKind: bindingForm.peerKind,
      peerId: bindingForm.peerId,
      guildId: bindingForm.guildId,
      teamId: bindingForm.teamId,
      roles: bindingRolesText.value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      backend: bindingForm.backend,
      mode: bindingForm.mode,
      cwd: bindingForm.cwd,
      label: bindingForm.label,
    };
    const response = editingBindingId.value
      ? await updateAgentBinding(agentId.value, editingBindingId.value, payload)
      : await createAgentBinding(agentId.value, payload);
    if (response.detail) {
      detail.value = response.detail;
      resetBindingForm({ cwd: response.detail.agent.workspace });
    }
    bindingDialogOpen.value = false;
    editingBindingId.value = '';
    noticeMessage.value = response.message;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('保存绑定失败。', 'Failed to save binding.');
  } finally {
    bindingBusy.value = false;
  }
}

async function removeBinding(bindingId: string): Promise<void> {
  if (!agentId.value || !bindingId) return;
  openConfirm({
    title: text('删除绑定', 'Delete binding'),
    description: text('确定删除这条绑定吗？', 'Delete this binding?'),
    confirmLabel: text('确认删除', 'Delete binding'),
    action: async () => {
      bindingBusy.value = true;
      errorMessage.value = '';
      noticeMessage.value = '';
      try {
        const response = await deleteAgentBinding(agentId.value, bindingId);
        if (response.detail) {
          detail.value = response.detail;
          resetBindingForm({ cwd: response.detail.agent.workspace });
        }
        noticeMessage.value = response.message;
      } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : text('删除绑定失败。', 'Failed to delete binding.');
      } finally {
        bindingBusy.value = false;
      }
    },
  });
}

watch(
  () => route.params.agentId,
  async () => {
    detail.value = null;
    if (!agentId.value) return;
    try {
      await loadDetail();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : text('读取 Agent 详情失败。', 'Failed to load agent detail.');
    }
  },
  { immediate: true },
);
</script>
