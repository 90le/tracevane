<template>
  <section class="channel-summary-strip">
    <article class="channel-summary-strip__item">
      <span>{{ text('状态', 'Status') }}</span>
      <StatusPill :label="channel.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled')" :tone="channel.enabled ? 'sage' : 'neutral'" />
    </article>
    <article class="channel-summary-strip__item">
      <span>{{ text('默认账号', 'Default Account') }}</span>
      <strong>{{ channel.defaultAccount || text('未指定', 'Unset') }}</strong>
    </article>
    <article class="channel-summary-strip__item">
      <span>{{ text('账号', 'Accounts') }}</span>
      <strong>{{ channel.accountCount }}</strong>
    </article>
    <article class="channel-summary-strip__item">
      <span>{{ text('绑定', 'Bindings') }}</span>
      <strong>{{ bindingCount }}</strong>
    </article>
    <article class="channel-summary-strip__item">
      <span>{{ text('私聊策略', 'DM Policy') }}</span>
      <strong>{{ policyLabel(channel.dmPolicy, 'dm', text) }}</strong>
    </article>
    <article class="channel-summary-strip__item">
      <span>{{ text('群组策略', 'Group Policy') }}</span>
      <strong>{{ policyLabel(channel.groupPolicy, 'group', text) }}</strong>
    </article>
    <article class="channel-summary-strip__item">
      <span>{{ text('连接模式', 'Connection Mode') }}</span>
      <strong>{{ channel.connectionMode || text('未指定', 'Unset') }}</strong>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { ChannelSummary } from '../../../../../types/channels';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import { policyLabel } from './channel-ui';

defineOptions({ name: 'ChannelSummaryStrip' });

defineProps<{
  channel: ChannelSummary;
  bindingCount: number;
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.channel-summary-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.channel-summary-strip__item {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.channel-summary-strip__item span {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.channel-summary-strip__item strong {
  color: var(--text);
  font-size: 14px;
}
</style>
