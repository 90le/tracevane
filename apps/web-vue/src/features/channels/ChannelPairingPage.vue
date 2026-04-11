<template>
  <section v-if="channel && account" class="channels-stage-view">
    <article class="panel-card channels-form-panel">
      <div class="channels-stage-task-head">
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

      <div class="inline-entry-row">
        <input v-model="manualCode" class="form-input" :placeholder="text('手动输入配对码', 'Enter pairing code manually')" />
        <button type="button" class="primary-button compact-button" :disabled="!manualCode.trim() || approving" @click="approve(manualCode.trim())">
          {{ approving ? text('审批中...', 'Approving...') : text('批准', 'Approve') }}
        </button>
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
      <div v-else class="empty-inline">
        {{ text('当前没有待审批配对请求。', 'There are no pending pairing requests right now.') }}
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { ChannelPairingPayload } from '../../../../../types/channels';
import { approveChannelPairing, fetchChannelPairing } from './api';
import { formatDate } from './channel-ui';
import { useLocalePreference } from '../../shared/locale';
import { useChannelsWorkspace } from './workspace';

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
</script>
