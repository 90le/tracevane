<template>
  <section class="channel-provider-overview">
    <article class="channel-command-center">
      <section class="channel-command-center__main">
        <header class="channel-provider-overview__quick-head">
          <div>
            <p class="eyebrow">{{ text('CHANNEL COMMAND', 'CHANNEL COMMAND') }}</p>
            <h3>{{ channel.type }}</h3>
            <p>{{ text('先处理启用状态、默认账号和待办；高级策略留在专门设置页。', 'Handle enablement, default account, and attention items first; keep advanced policy in dedicated settings.') }}</p>
          </div>

          <StatusPill
            :label="channel.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled')"
            :tone="channel.enabled ? 'sage' : 'neutral'"
          />
        </header>

        <div class="channel-command-facts" :aria-label="text('频道摘要', 'Provider summary')">
          <div class="channel-command-fact">
            <span>{{ text('默认账号', 'Default account') }}</span>
            <strong>{{ channel.defaultAccount || text('未指定', 'Unset') }}</strong>
          </div>
          <div class="channel-command-fact">
            <span>{{ text('账号', 'Accounts') }}</span>
            <strong>{{ channel.accountCount }}</strong>
          </div>
          <div class="channel-command-fact">
            <span>{{ text('绑定', 'Bindings') }}</span>
            <strong>{{ bindings.length }}</strong>
          </div>
          <div class="channel-command-fact">
            <span>{{ text('策略', 'Policy') }}</span>
            <strong>{{ policyLabel(channel.dmPolicy, 'dm', text) }} / {{ policyLabel(channel.groupPolicy, 'group', text) }}</strong>
          </div>
          <div class="channel-command-fact">
            <span>{{ text('连接', 'Connection') }}</span>
            <strong>{{ channel.connectionMode || text('未指定', 'Unset') }}</strong>
          </div>
        </div>
      </section>

      <aside class="channel-command-center__edit" :aria-label="text('高频快改', 'High-frequency quick edits')">
        <div class="channel-command-edit-head">
          <p class="eyebrow">{{ text('FAST PATH', 'FAST PATH') }}</p>
          <button type="button" class="secondary-button compact-button channel-danger-button" :disabled="quickEditBusy" @click="$emit('delete-channel')">
            {{ text('删除频道', 'Delete provider') }}
          </button>
        </div>

        <div class="channel-provider-overview__quick-grid">
          <label class="toggle-card channel-command-toggle">
          <input :checked="channel.enabled" class="form-checkbox" type="checkbox" :disabled="quickEditBusy" @change="emitEnabledChange" />
          <div>
            <strong>{{ text('频道启用状态', 'Provider enabled') }}</strong>
            <span>{{ text('关闭后该渠道不会接收和发送任务。', 'When disabled, this provider will not receive or send work.') }}</span>
          </div>
        </label>

        <div class="form-field">
          <label class="form-label">{{ text('默认账号', 'Default account') }}</label>
          <select v-model="defaultAccountDraft" class="form-input select-input" :disabled="quickEditBusy" @change="emitDefaultAccountChange">
            <option value="">{{ text('未指定', 'Unset') }}</option>
            <option v-for="account in channel.accounts" :key="account.id" :value="account.id">
              {{ account.id }}
            </option>
          </select>
        </div>
      </div>
      </aside>
    </article>

    <ChannelIssueList :issues="issues" @activate-issue="$emit('activate-issue', $event)" />

    <ChannelAccountIndex
      :accounts="channel.accounts"
      :binding-count-by-account="bindingCountByAccount"
      :busy-account-id="busyAccountId"
      @create-account="$emit('open-create-account')"
      @toggle-account-enabled="$emit('toggle-account-enabled', $event)"
      @open-account="$emit('open-account', $event)"
      @open-credentials="$emit('open-credentials', $event)"
      @open-access="$emit('open-access', $event)"
      @open-pairing="$emit('open-pairing', $event)"
      @open-bindings="$emit('open-bindings', $event)"
      @delete-account="$emit('delete-account', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ChannelBindingSummary, ChannelSummary } from '../../../../../types/channels';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import ChannelAccountIndex from './ChannelAccountIndex.vue';
import ChannelIssueList from './ChannelIssueList.vue';
import { policyLabel, type ChannelIssue } from './channel-ui';
import './channels-pages.css';

defineOptions({ name: 'ChannelProviderOverview' });

const emit = defineEmits<{
  (event: 'open-create-account'): void;
  (event: 'update-provider-enabled', enabled: boolean): void;
  (event: 'update-provider-default-account', defaultAccount: string | null): void;
  (event: 'toggle-account-enabled', accountId: string): void;
  (event: 'open-account', accountId: string): void;
  (event: 'open-access', accountId: string): void;
  (event: 'open-pairing', accountId: string): void;
  (event: 'open-credentials', accountId: string): void;
  (event: 'open-bindings', accountId: string): void;
  (event: 'delete-account', accountId: string): void;
  (event: 'delete-channel'): void;
  (event: 'activate-issue', issue: ChannelIssue): void;
}>();

const props = defineProps<{
  channel: ChannelSummary;
  issues: ChannelIssue[];
  bindings: ChannelBindingSummary[];
  busyAccountId?: string;
}>();

const { text } = useLocalePreference();
const defaultAccountDraft = ref('');

const bindingCountByAccount = computed<Record<string, number>>(() => {
  return props.bindings.reduce<Record<string, number>>((acc, binding) => {
    const accountId = binding.accountId || '';
    if (!accountId) return acc;
    acc[accountId] = (acc[accountId] || 0) + 1;
    return acc;
  }, {});
});

const quickEditBusy = computed(() => props.busyAccountId === '__provider__');

function emitEnabledChange(event: Event): void {
  const nextEnabled = (event.target as HTMLInputElement).checked;
  emit('update-provider-enabled', nextEnabled);
}

function emitDefaultAccountChange(): void {
  emit('update-provider-default-account', defaultAccountDraft.value || null);
}

watch(
  () => [props.channel.enabled, props.channel.defaultAccount, props.channel.type] as const,
  () => {
    defaultAccountDraft.value = props.channel.defaultAccount || '';
  },
  { immediate: true },
);
</script>
