<template>
  <section class="channel-provider-overview">
    <ChannelSummaryStrip :channel="channel" :binding-count="bindings.length" />

    <article class="panel-card channel-provider-overview__quick-edit">
      <header class="channel-provider-overview__quick-head">
        <div>
          <p class="eyebrow">{{ text('QUICK EDIT', 'QUICK EDIT') }}</p>
          <h3>{{ text('高频快改', 'High-frequency quick edits') }}</h3>
          <p>{{ text('概览页只保留 provider 启用状态和默认账号，复杂策略继续进入设置页。', 'The overview keeps only provider enabled state and default account, while complex policy stays in Settings.') }}</p>
        </div>

        <div class="channel-provider-overview__quick-actions">
          <button type="button" class="secondary-button compact-button channel-danger-button" :disabled="quickEditBusy" @click="$emit('delete-channel')">
            {{ text('删除频道', 'Delete provider') }}
          </button>
        </div>
      </header>

      <div class="channel-provider-overview__quick-grid">
        <label class="toggle-card">
          <input :checked="channel.enabled" class="form-checkbox" type="checkbox" :disabled="quickEditBusy" @change="emitEnabledChange" />
          <div>
            <strong>{{ text('频道启用状态', 'Provider enabled') }}</strong>
            <span>{{ text('这里只保留最常用的启停操作，避免概览页变成第二个设置页。', 'Only the most common enable/disable control stays here so the overview does not turn into a second settings page.') }}</span>
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
import { useLocalePreference } from '../../shared/locale';
import ChannelAccountIndex from './ChannelAccountIndex.vue';
import ChannelIssueList from './ChannelIssueList.vue';
import ChannelSummaryStrip from './ChannelSummaryStrip.vue';
import type { ChannelIssue } from './channel-ui';

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

<style scoped>
.channel-provider-overview {
  display: grid;
  gap: 14px;
}

.channel-provider-overview__quick-edit {
  display: grid;
  gap: 14px;
  border-radius: 12px;
}

.channel-provider-overview__quick-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.channel-provider-overview__quick-head h3 {
  margin: 4px 0 6px;
  color: var(--text);
}

.channel-provider-overview__quick-head p:last-child {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.channel-provider-overview__quick-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
  gap: 12px;
}

.channel-provider-overview__quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.channel-danger-button {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 28%, var(--line));
}

@media (max-width: 920px) {
  .channel-provider-overview__quick-head {
    flex-direction: column;
  }

  .channel-provider-overview__quick-grid {
    grid-template-columns: 1fr;
  }

  .channel-provider-overview__quick-actions {
    justify-content: flex-start;
  }
}
</style>
