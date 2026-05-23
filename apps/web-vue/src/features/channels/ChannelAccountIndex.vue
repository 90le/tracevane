<template>
  <section class="channel-account-index">
    <header class="channel-account-index__head">
      <div>
        <p class="eyebrow">{{ text('ACCOUNTS', 'ACCOUNTS') }}</p>
        <h3>{{ text('账号', 'Accounts') }}</h3>
        <p class="panel-muted">{{ text('这里创建账号，并从账号入口进入凭据、权限、配对和绑定。', 'Create accounts here, then open credentials, access, pairing, and bindings from each account entry.') }}</p>
      </div>
      <button type="button" class="primary-button compact-button" @click="$emit('create-account')">
        {{ text('新建账号', 'Create account') }}
      </button>
    </header>

    <div v-if="accounts.length" class="channel-account-index__groups">
      <section v-if="defaultAccounts.length" class="channel-account-index__group">
        <div class="channel-account-index__group-head">
          <strong>{{ text('默认账号', 'Default account') }}</strong>
          <span>{{ text('Provider 的默认入口。顶部快捷权限和配对也会优先指向这里。', 'The provider default entrypoint. Header access and pairing shortcuts point here first.') }}</span>
        </div>

        <div class="channel-account-index__list">
          <ChannelAccountCard
            v-for="account in defaultAccounts"
            :key="account.id"
            :account="account"
            :binding-count="bindingCountByAccount[account.id] || 0"
            :busy="busyAccountId === account.id"
            @toggle-enabled="$emit('toggle-account-enabled', account.id)"
            @edit="$emit('open-account', account.id)"
            @credentials="$emit('open-credentials', account.id)"
            @access="$emit('open-access', account.id)"
            @pairing="$emit('open-pairing', account.id)"
            @bindings="$emit('open-bindings', account.id)"
            @delete="$emit('delete-account', account.id)"
          />
        </div>
      </section>

      <section v-if="namedAccounts.length" class="channel-account-index__group">
        <div class="channel-account-index__group-head">
          <strong>{{ text('命名账号', 'Named accounts') }}</strong>
          <span>{{ text('多个机器人、团队或场景独立配置时放在这里。', 'Use these for independent bots, teams, or scenarios.') }}</span>
        </div>

        <div class="channel-account-index__list">
          <ChannelAccountCard
            v-for="account in namedAccounts"
            :key="account.id"
            :account="account"
            :binding-count="bindingCountByAccount[account.id] || 0"
            :busy="busyAccountId === account.id"
            @toggle-enabled="$emit('toggle-account-enabled', account.id)"
            @edit="$emit('open-account', account.id)"
            @credentials="$emit('open-credentials', account.id)"
            @access="$emit('open-access', account.id)"
            @pairing="$emit('open-pairing', account.id)"
            @bindings="$emit('open-bindings', account.id)"
            @delete="$emit('delete-account', account.id)"
          />
        </div>
      </section>
    </div>
    <div v-else class="empty-inline">
      {{ text('当前渠道还没有账号。先创建一个账号。', 'This provider has no accounts yet. Create one first.') }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChannelAccountSummary } from '../../../../../types/channels';
import { useLocalePreference } from '../../shared/locale';
import ChannelAccountCard from './ChannelAccountCard.vue';

defineOptions({ name: 'ChannelAccountIndex' });

defineEmits<{
  (event: 'create-account'): void;
  (event: 'toggle-account-enabled', accountId: string): void;
  (event: 'open-account', accountId: string): void;
  (event: 'open-credentials', accountId: string): void;
  (event: 'open-access', accountId: string): void;
  (event: 'open-pairing', accountId: string): void;
  (event: 'open-bindings', accountId: string): void;
  (event: 'delete-account', accountId: string): void;
}>();

const props = defineProps<{
  accounts: ChannelAccountSummary[];
  bindingCountByAccount: Record<string, number>;
  busyAccountId?: string;
}>();

const { text } = useLocalePreference();

const defaultAccounts = computed(() => props.accounts.filter((account) => account.kind === 'default' || account.id === 'default'));
const namedAccounts = computed(() => props.accounts.filter((account) => account.kind !== 'default' && account.id !== 'default'));
</script>

<style scoped>
.channel-account-index {
  display: grid;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
}

.channel-account-index__head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.channel-account-index__head h3 {
  margin: 4px 0 6px 0;
  color: var(--text);
}

.channel-account-index__groups {
  display: grid;
  gap: 14px;
}

.channel-account-index__group {
  display: grid;
  gap: 10px;
}

.channel-account-index__group-head {
  display: grid;
  gap: 4px;
}

.channel-account-index__group-head strong {
  color: var(--text);
  font-size: 13px;
}

.channel-account-index__group-head span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.channel-account-index__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}

@media (max-width: 920px) {
  .channel-account-index__head {
    flex-direction: column;
  }

  .channel-account-index__list {
    grid-template-columns: 1fr;
  }
}
</style>
