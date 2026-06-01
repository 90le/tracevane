<template>
  <section v-if="channel && account" class="channels-stage-view">
    <article class="channels-form-panel channels-stage-section">
      <div class="channels-stage-task-head operate-stage-task-head">
        <div>
          <p class="eyebrow">{{ channel.type }} · {{ account.id }}</p>
          <h3>{{ text('配对审批', 'Pairing') }}</h3>
          <p>{{ text('这里集中处理待审批的 pairing 请求，也支持手动输入配对码。', 'Review pending pairing requests here, or approve a pairing code manually.') }}</p>
        </div>

        <div class="page-actions">
          <button type="button" class="secondary-button compact-button" :disabled="loading" @click="loadPairing">
            {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新请求', 'Refresh requests') }}
          </button>
        </div>
      </div>

      <div v-if="pairing" class="channels-pairing-summary">
        <span>{{ pairing.supported ? text('支持配对', 'Pairing supported') : text('不支持配对', 'Pairing unsupported') }}</span>
        <span>{{ text('来源', 'Source') }} · {{ pairing.source }}</span>
        <span>{{ text('待处理', 'Pending') }} {{ pairing.requests.length }}</span>
        <span v-if="pairing.error">{{ text('错误', 'Error') }} · {{ pairing.error }}</span>
      </div>

      <section class="channels-pairing-section">
        <div class="channels-pairing-section__head">
          <strong>{{ text('手动批准', 'Manual approval') }}</strong>
          <span>{{ text('如果用户提供了配对码，可以直接在这里批准。', 'If a user provides a pairing code, approve it directly here.') }}</span>
        </div>

        <div class="inline-entry-row">
          <input v-model="manualCode" class="form-input" :placeholder="text('手动输入配对码', 'Enter pairing code manually')" />
          <button type="button" class="primary-button compact-button" :disabled="!manualCode.trim() || approving || pairing?.supported === false" @click="approve(manualCode.trim())">
            {{ approving ? text('审批中...', 'Approving...') : text('批准', 'Approve') }}
          </button>
        </div>
      </section>

      <section class="channels-pairing-section">
        <div class="channels-pairing-section__head">
          <strong>{{ text('待审批请求', 'Pending requests') }}</strong>
          <span>{{ text('来自设备或账号的 pairing 请求会集中显示在这里。', 'Pairing requests from devices or accounts are listed here.') }}</span>
        </div>

        <div v-if="pairing?.requests.length" class="binding-table">
          <div class="binding-table-head">
            <span>{{ text('配对码', 'Code') }}</span>
            <span>{{ text('请求者', 'Requester') }}</span>
            <span>{{ text('时间', 'Created') }}</span>
            <span></span>
          </div>

          <div v-for="request in pairing.requests" :key="request.code" class="binding-table-row">
            <div class="binding-table-cell">
              <strong>{{ request.code }}</strong>
            </div>
            <div class="binding-table-cell">
              <strong>{{ request.requester || request.peerId || '—' }}</strong>
              <p>{{ request.note || '—' }}</p>
            </div>
            <div class="binding-table-cell">
              <strong>{{ formatDate(request.createdAt) }}</strong>
            </div>
            <div class="binding-table-actions">
              <button type="button" class="primary-button compact-button" :disabled="approving" @click="approve(request.code)">
                {{ text('批准', 'Approve') }}
              </button>
            </div>
          </div>
        </div>
        <div v-else-if="pairing?.supported === false" class="empty-inline">
          {{ text('当前频道或账号不支持配对审批。', 'This provider or account does not support pairing approval.') }}
        </div>
        <div v-else class="empty-inline">
          {{ text('当前没有待审批配对请求。', 'There are no pending pairing requests right now.') }}
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { ChannelPairingPayload } from '../../../../../types/channels';
import { approveChannelPairing, fetchChannelPairing } from './api';
import { formatDate } from './channel-ui';
import { useLocalePreference } from '../../shared/locale';
import { useChannelsWorkspace } from './workspace';
import './channels-pages.css';

defineOptions({ name: 'ChannelPairingPage' });

const workspace = useChannelsWorkspace();
const route = useRoute();
const { text } = useLocalePreference();

const channel = computed(() => workspace.selectedChannel.value);
const account = computed(() => {
  return channel.value?.accounts.find((entry) => entry.id === String(route.params.accountId || '')) || null;
});

const pairing = ref<ChannelPairingPayload | null>(null);
const manualCode = ref('');
const loading = ref(false);
const approving = ref(false);

async function loadPairing(): Promise<void> {
  if (!channel.value || !account.value) return;
  loading.value = true;
  try {
    pairing.value = await fetchChannelPairing(channel.value.type, account.value.id);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    loading.value = false;
  }
}

async function approve(code: string): Promise<void> {
  if (!channel.value || !account.value || !code.trim()) return;
  approving.value = true;
  try {
    const response = await approveChannelPairing(channel.value.type, {
      accountId: account.value.id,
      code: code.trim(),
    });
    workspace.setSuccessMessage(response.message);
    manualCode.value = '';
    await workspace.refreshSummary(channel.value.type);
    await loadPairing();
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    approving.value = false;
  }
}

watch(
  () => [channel.value?.type, account.value?.id] as const,
  () => {
    void loadPairing();
  },
  { immediate: true },
);

onActivated(() => {
  if (loading.value || approving.value) return;
  void loadPairing();
});
</script>
