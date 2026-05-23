<template>
  <section class="page-shell config-section-grid">
    <article class="panel-card config-sheet">
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('频道管理', 'Channel Management') }}</span></h3>
        </div>

        <div v-if="!channelIds.length" class="empty-inline">
          {{ text('当前未配置任何频道。', 'No channels configured.') }}
        </div>

        <div v-for="channelId in channelIds" :key="channelId" class="config-subsection-grid" style="margin-bottom: 1.5rem;">
          <section class="config-subsection">
            <details class="config-collapsible" :open="expandedChannels.has(channelId)">
              <summary class="config-collapsible-summary" @click.prevent="toggleChannel(channelId)">
                <span style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                  <strong>{{ channelId }}</strong>
                  <label class="toggle-inline" @click.stop>
                    <input
                      type="checkbox"
                      class="form-checkbox"
                      :checked="getChannel(channelId).enabled"
                      @change="getChannel(channelId).enabled = ($event.target as HTMLInputElement).checked"
                    />
                    <span class="form-label-inline">{{ getChannel(channelId).enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
                  </label>
                </span>
                <span class="config-collapsible-meta">
                  {{ Object.keys(getChannel(channelId).accounts).length }} {{ text('个账号', 'accounts') }}
                </span>
              </summary>

              <div class="settings-stack" style="padding: 1rem 0;">
                <!-- Channel-level settings -->
                <div class="config-subsection-head">
                  <h4>{{ text('频道级别设置', 'Channel Settings') }}</h4>
                  <p>{{ text('控制此频道的全局行为策略。', 'Control the global behavior policy for this channel.') }}</p>
                </div>

                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('群组策略', 'Group Policy') }}</span>
                    <GlassSelect
                      v-model="getChannel(channelId).groupPolicy"
                      :options="groupPolicyOptions"
                      :placeholder="text('选择策略', 'Select policy')"
                    />
                    <span class="field-hint">{{ text('控制哪些群组可以使用此频道', 'Control which groups can use this channel') }}</span>
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('流式输出', 'Streaming') }}</span>
                    <GlassSelect
                      v-model="getChannel(channelId).streaming"
                      :options="streamingOptions"
                      :placeholder="text('选择模式', 'Select mode')"
                    />
                    <span class="field-hint">{{ text('消息流式推送模式', 'Message streaming mode') }}</span>
                  </label>
                </div>

                <!-- Thread Bindings -->
                <details class="config-collapsible" style="margin-top: 1rem;">
                  <summary class="config-collapsible-summary">
                    <span>{{ text('线程绑定', 'Thread Bindings') }}</span>
                    <span class="config-collapsible-meta">
                      {{ getChannel(channelId).threadBindings.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}
                    </span>
                  </summary>
                  <div class="settings-stack" style="padding: 0.75rem 0;">
                    <div class="toggle-grid">
                      <label class="toggle-card">
                        <input v-model="getChannel(channelId).threadBindings.enabled" class="form-checkbox" type="checkbox" />
                        <div>
                          <strong>{{ text('启用线程绑定', 'Enable Thread Bindings') }}</strong>
                          <span>{{ text('将对话绑定到频道线程中', 'Bind conversations to channel threads') }}</span>
                        </div>
                      </label>
                    </div>
                    <div class="form-grid">
                      <label class="form-field">
                        <span class="form-label">{{ text('空闲超时 (小时)', 'Idle Hours') }}</span>
                        <input v-model.number="getChannel(channelId).threadBindings.idleHours" class="form-input" type="number" min="0" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('最大存活时间 (小时)', 'Max Age Hours') }}</span>
                        <input v-model.number="getChannel(channelId).threadBindings.maxAgeHours" class="form-input" type="number" min="0" />
                        <span class="field-hint">{{ text('0 表示不限制', '0 means no limit') }}</span>
                      </label>
                    </div>
                    <div class="toggle-grid">
                      <label class="toggle-card">
                        <input v-model="getChannel(channelId).threadBindings.spawnSubagentSessions" class="form-checkbox" type="checkbox" />
                        <div>
                          <strong>{{ text('派生子代理会话', 'Spawn Subagent Sessions') }}</strong>
                          <span>{{ text('在线程中自动创建子代理会话', 'Automatically create subagent sessions in threads') }}</span>
                        </div>
                      </label>
                      <label class="toggle-card">
                        <input v-model="getChannel(channelId).threadBindings.spawnAcpSessions" class="form-checkbox" type="checkbox" />
                        <div>
                          <strong>{{ text('派生 ACP 会话', 'Spawn ACP Sessions') }}</strong>
                          <span>{{ text('在线程中自动创建 ACP 会话', 'Automatically create ACP sessions in threads') }}</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </details>

                <!-- Accounts -->
                <div style="margin-top: 1.5rem;">
                  <div class="config-subsection-head">
                    <h4>{{ text('账号管理', 'Account Management') }}</h4>
                    <p>{{ text('管理此频道下的 Bot 账号配置。', 'Manage bot account configurations under this channel.') }}</p>
                  </div>

                  <div v-for="accountId in getAccountIds(channelId)" :key="accountId" class="config-subsection" style="margin-top: 0.75rem;">
                    <details class="config-collapsible">
                      <summary class="config-collapsible-summary">
                        <span style="display: flex; align-items: center; gap: 0.75rem;">
                          <strong>{{ accountId }}</strong>
                          <label class="toggle-inline" @click.stop>
                            <input
                              type="checkbox"
                              class="form-checkbox"
                              :checked="getAccount(channelId, accountId).enabled"
                              @change="getAccount(channelId, accountId).enabled = ($event.target as HTMLInputElement).checked"
                            />
                            <span class="form-label-inline">{{ getAccount(channelId, accountId).enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
                          </label>
                        </span>
                      </summary>
                      <div class="settings-stack" style="padding: 0.75rem 0;">
                        <!-- Token -->
                        <label class="form-field">
                          <span class="form-label">Token</span>
                          <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input
                              :type="isTokenVisible(channelId, accountId) ? 'text' : 'password'"
                              class="form-input"
                              style="flex: 1;"
                              :value="tokenDisplay(channelId, accountId)"
                              :placeholder="text('未设置', 'Not set')"
                              @input="onTokenInput(channelId, accountId, ($event.target as HTMLInputElement).value)"
                            />
                            <button
                              class="secondary-button compact-button"
                              type="button"
                              :disabled="isTokenLoading(channelId, accountId)"
                              @click="toggleTokenVisibility(channelId, accountId)"
                            >
                              {{ isTokenLoading(channelId, accountId)
                                ? text('加载中...', 'Loading...')
                                : isTokenVisible(channelId, accountId)
                                  ? text('隐藏', 'Hide')
                                  : text('查看', 'Reveal')
                              }}
                            </button>
                          </div>
                        </label>

                        <!-- Proxy -->
                        <label class="form-field">
                          <span class="form-label">{{ text('代理', 'Proxy') }}</span>
                          <input v-model="getAccount(channelId, accountId).proxy" class="form-input" type="url" :placeholder="text('例如 http://127.0.0.1:9981', 'e.g. http://127.0.0.1:9981')" />
                        </label>

                        <div class="form-grid">
                          <label class="form-field">
                            <span class="form-label">{{ text('群组策略', 'Group Policy') }}</span>
                            <GlassSelect
                              v-model="getAccount(channelId, accountId).groupPolicy"
                              :options="groupPolicyOptions"
                              :placeholder="text('选择策略', 'Select policy')"
                            />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('流式输出', 'Streaming') }}</span>
                            <GlassSelect
                              v-model="getAccount(channelId, accountId).streaming"
                              :options="streamingOptions"
                              :placeholder="text('选择模式', 'Select mode')"
                            />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('私聊策略', 'DM Policy') }}</span>
                            <GlassSelect
                              v-model="getAccount(channelId, accountId).dmPolicy"
                              :options="dmPolicyOptions"
                              :placeholder="text('选择策略', 'Select policy')"
                            />
                          </label>
                        </div>
                      </div>
                    </details>
                  </div>

                  <div v-if="!getAccountIds(channelId).length" class="empty-inline" style="margin-top: 0.5rem;">
                    {{ text('此频道下无账号配置。', 'No accounts configured for this channel.') }}
                  </div>
                </div>
              </div>
            </details>
          </section>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import { fetchChannelSecret } from './api';
import type { ConfigSummaryPayload } from '../../../../../types/config';

interface ChannelFormAccount {
  enabled: boolean;
  hasToken: boolean;
  maskedToken: string;
  tokenLoaded: boolean;
  tokenVisible: boolean;
  tokenLoading: boolean;
  tokenValue: string;
  proxy: string;
  groupPolicy: string;
  streaming: string;
  dmPolicy: string;
}

interface ChannelFormState {
  enabled: boolean;
  groupPolicy: string;
  streaming: string;
  threadBindings: {
    enabled: boolean;
    idleHours: number;
    maxAgeHours: number;
    spawnSubagentSessions: boolean;
    spawnAcpSessions: boolean;
  };
  accounts: Record<string, ChannelFormAccount>;
}

const props = defineProps<{
  summary: ConfigSummaryPayload | null;
}>();

const { text } = useLocalePreference();

const channelForm = reactive<Record<string, ChannelFormState>>({});
const expandedChannels = reactive(new Set<string>());

const groupPolicyOptions = computed<GlassSelectOption[]>(() => [
  { value: 'allowlist', label: text('白名单', 'Allowlist') },
  { value: 'denylist', label: text('黑名单', 'Denylist') },
  { value: 'all', label: text('全部允许', 'All') },
]);

const streamingOptions = computed<GlassSelectOption[]>(() => [
  { value: 'partial', label: text('分段推送', 'Partial') },
  { value: 'full', label: text('完整推送', 'Full') },
  { value: 'off', label: text('关闭', 'Off') },
]);

const dmPolicyOptions = computed<GlassSelectOption[]>(() => [
  { value: 'pairing', label: text('配对模式', 'Pairing') },
  { value: 'open', label: text('开放模式', 'Open') },
]);

const channelIds = computed(() => Object.keys(channelForm).sort());

function hydrateFromSummary(summary: ConfigSummaryPayload) {
  if (!summary.channels) return;
  const channels = summary.channels || {};
  for (const key of Object.keys(channelForm)) {
    if (!(key in channels)) delete channelForm[key];
  }
  for (const [channelId, channel] of Object.entries(channels)) {
    const accounts: Record<string, ChannelFormAccount> = {};
    for (const [accountId, account] of Object.entries(channel.accounts || {})) {
      accounts[accountId] = {
        enabled: account.enabled !== false,
        hasToken: account.hasToken,
        maskedToken: account.maskedToken,
        tokenLoaded: false,
        tokenVisible: false,
        tokenLoading: false,
        tokenValue: '',
        proxy: account.proxy || '',
        groupPolicy: account.groupPolicy || 'allowlist',
        streaming: account.streaming || 'partial',
        dmPolicy: account.dmPolicy || 'pairing',
      };
    }
    const tb = channel.threadBindings;
    channelForm[channelId] = {
      enabled: channel.enabled,
      groupPolicy: channel.groupPolicy,
      streaming: channel.streaming,
      threadBindings: {
        enabled: tb?.enabled === true,
        idleHours: tb?.idleHours ?? 24,
        maxAgeHours: tb?.maxAgeHours ?? 0,
        spawnSubagentSessions: (tb as Record<string, unknown>)?.spawnSubagentSessions === true,
        spawnAcpSessions: (tb as Record<string, unknown>)?.spawnAcpSessions === true,
      },
      accounts,
    };
  }
}

watch(() => props.summary, (summary) => {
  if (summary) hydrateFromSummary(summary);
}, { immediate: true });

function getChannel(channelId: string): ChannelFormState {
  return channelForm[channelId];
}

function getAccountIds(channelId: string): string[] {
  return Object.keys(channelForm[channelId]?.accounts || {}).sort();
}

function getAccount(channelId: string, accountId: string): ChannelFormAccount {
  return channelForm[channelId].accounts[accountId];
}

function toggleChannel(channelId: string) {
  if (expandedChannels.has(channelId)) {
    expandedChannels.delete(channelId);
  } else {
    expandedChannels.add(channelId);
  }
}

function tokenDisplay(channelId: string, accountId: string): string {
  const account = getAccount(channelId, accountId);
  if (account.tokenLoaded) return account.tokenValue;
  return account.hasToken ? account.maskedToken : '';
}

function isTokenVisible(channelId: string, accountId: string): boolean {
  return getAccount(channelId, accountId).tokenVisible;
}

function isTokenLoading(channelId: string, accountId: string): boolean {
  return getAccount(channelId, accountId).tokenLoading;
}

async function toggleTokenVisibility(channelId: string, accountId: string): Promise<void> {
  const account = getAccount(channelId, accountId);
  if (!account.tokenLoaded && account.hasToken) {
    account.tokenLoading = true;
    try {
      const payload = await fetchChannelSecret(channelId, accountId);
      account.tokenValue = payload.token;
      account.tokenLoaded = true;
    } finally {
      account.tokenLoading = false;
    }
  }
  account.tokenVisible = !account.tokenVisible;
}

function onTokenInput(channelId: string, accountId: string, value: string): void {
  const account = getAccount(channelId, accountId);
  account.tokenValue = value;
  account.tokenLoaded = true;
}

function buildChannelsPayload(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [channelId, channel] of Object.entries(channelForm)) {
    const accounts: Record<string, Record<string, unknown>> = {};
    for (const [accountId, account] of Object.entries(channel.accounts)) {
      const accountPayload: Record<string, unknown> = {
        enabled: account.enabled,
        proxy: account.proxy,
        groupPolicy: account.groupPolicy,
        streaming: account.streaming,
        dmPolicy: account.dmPolicy,
      };
      if (account.tokenLoaded && account.tokenValue.trim()) {
        accountPayload.token = account.tokenValue.trim();
      }
      accounts[accountId] = accountPayload;
    }
    result[channelId] = {
      enabled: channel.enabled,
      groupPolicy: channel.groupPolicy,
      streaming: channel.streaming,
      threadBindings: {
        enabled: channel.threadBindings.enabled,
        idleHours: Number(channel.threadBindings.idleHours),
        maxAgeHours: Number(channel.threadBindings.maxAgeHours),
        spawnSubagentSessions: channel.threadBindings.spawnSubagentSessions,
        spawnAcpSessions: channel.threadBindings.spawnAcpSessions,
      },
      accounts,
    };
  }
  return result;
}

defineExpose({ buildChannelsPayload });
</script>
