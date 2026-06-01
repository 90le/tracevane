<template>
  <article class="channel-account-entry" :class="{ disabled: !account.enabled }">
    <header class="channel-account-entry__summary">
      <div>
        <strong>{{ account.id }}</strong>
        <p>{{ account.kind === 'default' ? text('默认配置档', 'Default profile') : text('命名账号', 'Named account') }}</p>
      </div>
      <StatusPill :label="account.enabled ? text('启用', 'Enabled') : text('禁用', 'Disabled')" :tone="account.enabled ? 'sage' : 'neutral'" />
    </header>

    <div class="channel-account-entry__facts">
      <span>{{ text('凭据', 'Secrets') }} {{ configuredCredentialCount }}</span>
      <span>{{ text('白名单', 'Allowlist') }} {{ account.allowFromCount }}</span>
      <span>{{ text('群白名单', 'Group allowlist') }} {{ account.groupAllowFromCount }}</span>
      <span>{{ text('待配对', 'Pending pairing') }} {{ account.pairingPendingCount }}</span>
      <span>{{ text('路由', 'Routes') }} {{ bindingCount }}</span>
    </div>

    <div class="channel-account-entry__tags">
      <span v-if="account.dmPolicy">{{ policyLabel(account.dmPolicy, 'dm', text) }}</span>
      <span v-if="account.groupPolicy">{{ policyLabel(account.groupPolicy, 'group', text) }}</span>
      <span v-if="account.streaming">{{ account.streaming }}</span>
      <span v-if="account.connectionMode">{{ account.connectionMode }}</span>
    </div>

    <footer class="channel-account-entry__footer">
      <div class="channel-account-entry__action-row">
        <button type="button" class="ghost-action ghost-action-primary channel-account-entry__primary-action" @click="$emit('edit')">
          {{ text('账号详情', 'Account') }}
        </button>

        <div class="channel-account-entry__manage-actions">
          <button type="button" class="ghost-action ghost-action-danger" :disabled="busy" @click="$emit('toggle-enabled')">
            {{ busy ? text('处理中...', 'Working...') : account.enabled ? text('禁用', 'Disable') : text('启用', 'Enable') }}
          </button>
          <button
            v-if="account.kind !== 'default'"
            type="button"
            class="ghost-action ghost-action-delete"
            :disabled="busy"
            @click="$emit('delete')"
          >
            {{ text('删除', 'Delete') }}
          </button>
        </div>
      </div>

      <section class="channel-account-entry__task-group" :aria-label="text('配置任务', 'Configuration tasks')">
        <span class="channel-account-entry__task-label">{{ text('配置任务', 'Tasks') }}</span>
        <div class="channel-account-entry__task-actions">
          <button type="button" class="ghost-action" @click="$emit('credentials')">{{ text(`凭据 ${configuredCredentialCount}`, `Credentials ${configuredCredentialCount}`) }}</button>
          <button type="button" class="ghost-action" @click="$emit('access')">{{ text(`权限 ${account.allowFromCount + account.groupAllowFromCount}`, `Access ${account.allowFromCount + account.groupAllowFromCount}`) }}</button>
          <button type="button" class="ghost-action" @click="$emit('pairing')">{{ text(`配对 ${account.pairingPendingCount}`, `Pairing ${account.pairingPendingCount}`) }}</button>
          <button type="button" class="ghost-action" @click="$emit('bindings')">{{ text(`路由 ${bindingCount}`, `Routes ${bindingCount}`) }}</button>
        </div>
      </section>
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
