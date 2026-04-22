<template>
  <article class="channel-account-card" :class="{ disabled: !account.enabled }">
    <header class="channel-account-card__summary">
      <div>
        <strong>{{ account.id }}</strong>
        <p>{{ account.kind === 'default' ? text('默认配置档', 'Default profile') : text('命名账号', 'Named account') }}</p>
      </div>
      <StatusPill :label="account.enabled ? text('启用', 'Enabled') : text('禁用', 'Disabled')" :tone="account.enabled ? 'sage' : 'neutral'" />
    </header>

    <div class="channel-account-card__facts">
      <span>{{ text('凭据', 'Secrets') }} {{ configuredCredentialCount }}</span>
      <span>{{ text('白名单', 'Allowlist') }} {{ account.allowFromCount }}</span>
      <span>{{ text('群白名单', 'Group allowlist') }} {{ account.groupAllowFromCount }}</span>
      <span>{{ text('待配对', 'Pending pairing') }} {{ account.pairingPendingCount }}</span>
      <span>{{ text('绑定', 'Bindings') }} {{ bindingCount }}</span>
    </div>

    <div class="channel-account-card__tags">
      <span v-if="account.dmPolicy">{{ policyLabel(account.dmPolicy, 'dm', text) }}</span>
      <span v-if="account.groupPolicy">{{ policyLabel(account.groupPolicy, 'group', text) }}</span>
      <span v-if="account.streaming">{{ account.streaming }}</span>
      <span v-if="account.connectionMode">{{ account.connectionMode }}</span>
    </div>

    <footer class="channel-account-card__footer">
      <div class="channel-account-card__action-row">
        <button type="button" class="ghost-action ghost-action-primary channel-account-card__primary-action" @click="$emit('edit')">
          {{ text('账号详情', 'Account') }}
        </button>

        <div class="channel-account-card__manage-actions">
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

      <section class="channel-account-card__task-group" :aria-label="text('配置任务', 'Configuration tasks')">
        <span class="channel-account-card__task-label">{{ text('配置任务', 'Tasks') }}</span>
        <div class="channel-account-card__task-actions">
          <button type="button" class="ghost-action" @click="$emit('credentials')">{{ text(`凭据 ${configuredCredentialCount}`, `Credentials ${configuredCredentialCount}`) }}</button>
          <button type="button" class="ghost-action" @click="$emit('access')">{{ text(`权限 ${account.allowFromCount + account.groupAllowFromCount}`, `Access ${account.allowFromCount + account.groupAllowFromCount}`) }}</button>
          <button type="button" class="ghost-action" @click="$emit('pairing')">{{ text(`配对 ${account.pairingPendingCount}`, `Pairing ${account.pairingPendingCount}`) }}</button>
          <button type="button" class="ghost-action" @click="$emit('bindings')">{{ text(`绑定 ${bindingCount}`, `Bindings ${bindingCount}`) }}</button>
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

defineOptions({ name: 'ChannelAccountCard' });

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

<style scoped>
.channel-account-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.channel-account-card.disabled {
  opacity: 0.82;
}

.channel-account-card__summary {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.channel-account-card__summary strong {
  display: block;
  color: var(--text);
  font-size: 15px;
}

.channel-account-card__summary p {
  margin: 5px 0 0 0;
  color: var(--muted);
  font-size: 12px;
}

.channel-account-card__facts,
.channel-account-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.channel-account-card__footer {
  display: grid;
  gap: 10px;
}

.channel-account-card__action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.channel-account-card__primary-action {
  flex: 1 1 200px;
  min-width: 0;
}

.channel-account-card__task-group {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
  background: color-mix(in srgb, var(--shell-panel-fill) 78%, transparent);
}

.channel-account-card__task-label {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.channel-account-card__task-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 6px;
}

.channel-account-card__manage-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.channel-account-card__facts span,
.channel-account-card__tags span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-soft);
  font-size: 11px;
}

.ghost-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.ghost-action:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--sky) 24%, var(--line));
  background: color-mix(in srgb, var(--shell-panel-fill) 88%, transparent);
}

.ghost-action:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
}

.ghost-action-primary {
  background: color-mix(in srgb, var(--sky) 10%, var(--surface));
  border-color: color-mix(in srgb, var(--sky) 26%, var(--line));
  font-weight: 700;
}

.ghost-action-danger {
  color: #b45309;
  border-color: color-mix(in srgb, #f59e0b 24%, var(--line));
}

.ghost-action-delete {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 28%, var(--line));
}

@media (max-width: 720px) {
  .channel-account-card__action-row {
    align-items: stretch;
  }

  .channel-account-card__manage-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .channel-account-card__manage-actions .ghost-action {
    flex: 1 1 140px;
  }
}
</style>
