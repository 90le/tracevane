<template>
  <article class="channel-account-entry channel-account-inventory-row" :class="{ disabled: !account.enabled }">
    <header class="channel-account-entry__summary channel-account-inventory-row__identity">
      <div>
        <strong>{{ account.id }}</strong>
        <p>{{ account.kind === 'default' ? text('默认配置档', 'Default profile') : text('命名账号', 'Named account') }}</p>
      </div>
      <StatusPill :label="account.enabled ? text('启用', 'Enabled') : text('禁用', 'Disabled')" :tone="account.enabled ? 'sage' : 'neutral'" />
    </header>

    <div class="channel-account-entry__facts channel-account-inventory-row__metrics">
      <span><small>{{ text('凭据', 'Secrets') }}</small><strong>{{ configuredCredentialCount }}</strong></span>
      <span><small>{{ text('白名单', 'Allowlist') }}</small><strong>{{ account.allowFromCount }}</strong></span>
      <span><small>{{ text('群白名单', 'Groups') }}</small><strong>{{ account.groupAllowFromCount }}</strong></span>
      <span><small>{{ text('配对', 'Pairing') }}</small><strong>{{ account.pairingPendingCount }}</strong></span>
      <span><small>{{ text('路由', 'Routes') }}</small><strong>{{ bindingCount }}</strong></span>
    </div>

    <div class="channel-account-entry__tags channel-account-inventory-row__policy">
      <span v-if="account.dmPolicy">{{ policyLabel(account.dmPolicy, 'dm', text) }}</span>
      <span v-if="account.groupPolicy">{{ policyLabel(account.groupPolicy, 'group', text) }}</span>
      <span v-if="account.streaming">{{ account.streaming }}</span>
      <span v-if="account.connectionMode">{{ account.connectionMode }}</span>
      <span v-if="!account.dmPolicy && !account.groupPolicy && !account.streaming && !account.connectionMode">{{ text('未设置策略', 'Policy unset') }}</span>
    </div>

    <footer class="channel-account-entry__footer channel-account-inventory-row__actions">
      <button type="button" class="ghost-action ghost-action-primary" @click="$emit('edit')">
        {{ text('详情', 'Details') }}
      </button>
      <details class="channel-account-more">
        <summary>{{ text('更多', 'More') }}</summary>
        <div class="channel-account-more__menu">
          <button type="button" @click="$emit('credentials')">{{ text('凭据', 'Secrets') }}</button>
          <button type="button" @click="$emit('access')">{{ text('权限', 'Access') }}</button>
          <button type="button" @click="$emit('pairing')">{{ text('配对', 'Pairing') }}</button>
          <button type="button" @click="$emit('bindings')">{{ text('路由', 'Routes') }}</button>
          <button type="button" class="danger" :disabled="busy" @click="$emit('toggle-enabled')">
            {{ busy ? text('处理中...', 'Working...') : account.enabled ? text('禁用账号', 'Disable account') : text('启用账号', 'Enable account') }}
          </button>
          <button
            v-if="account.kind !== 'default'"
            type="button"
            class="delete"
            :disabled="busy"
            @click="$emit('delete')"
          >
            {{ text('删除账号', 'Delete account') }}
          </button>
        </div>
      </details>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChannelAccountSummary } from '../../../../../types/channels';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import { policyLabel } from './channel-ui';
import './channels-account.css';

defineOptions({ name: 'ChannelAccountEntry' });

defineEmits<{
  (event: 'toggle-enabled'): void;
  (event: 'edit'): void;
  (event: 'credentials'): void;
  (event: 'access'): void;
  (event: 'pairing'): void;
  (event: 'bindings'): void;
  (event: 'delete'): void;
}>();

const props = defineProps<{
  account: ChannelAccountSummary;
  bindingCount: number;
  busy?: boolean;
}>();

const { text } = useLocalePreference();

const configuredCredentialCount = computed(() => props.account.credentialStates.filter((credential) => credential.configured).length);
</script>
