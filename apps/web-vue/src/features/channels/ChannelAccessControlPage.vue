<template>
  <section v-if="channel && account" class="channels-stage-view">
    <article class="panel-card channels-form-panel">
      <div class="channels-stage-task-head operate-stage-task-head">
        <div>
          <p class="eyebrow">{{ channel.type }} · {{ account.id }}</p>
          <h3>{{ text('访问控制', 'Access Control') }}</h3>
          <p>{{ text('这里专门维护私聊和群组白名单。保存状态固定在底部，顶部只保留当前任务说明。', 'This page is dedicated to DM and group allowlists. Save state stays pinned at the bottom, so the top only explains the current task.') }}</p>
        </div>
      </div>

      <div class="capability-row">
        <span class="capability-chip active">{{ text('私聊策略', 'DM policy') }} · {{ account.dmPolicy || text('未指定', 'Unset') }}</span>
        <span class="capability-chip">{{ text('群组策略', 'Group policy') }} · {{ account.groupPolicy || text('未指定', 'Unset') }}</span>
      </div>

      <div class="channels-access-grid">
        <section class="channels-access-card">
          <div class="channels-access-card__head">
            <strong>{{ text('私聊白名单', 'DM allowlist') }}</strong>
            <span>{{ text('允许这些用户或私聊来源触发当前账号。', 'Allow these users or direct-message sources to trigger this account.') }}</span>
          </div>

          <div v-if="draft.allowFrom.length" class="tag-grid">
            <span v-for="value in draft.allowFrom" :key="value" class="tag-chip">
              {{ value }}
              <button type="button" class="danger-link" :aria-label="text('移除', 'Remove')" @click="removeEntry('allow', value)">
                <X class="drawer-close-icon" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div v-else class="empty-inline">
            {{ text('当前没有私聊白名单。', 'No DM allowlist entries yet.') }}
          </div>

          <div class="inline-entry-row">
            <input v-model="allowEntry" class="form-input" :placeholder="text('输入用户平台 ID', 'Enter peer id')" @keyup.enter="appendEntry('allow')" />
            <button type="button" class="secondary-button compact-button" @click="appendEntry('allow')">{{ text('添加', 'Add') }}</button>
          </div>
        </section>

        <section class="channels-access-card">
          <div class="channels-access-card__head">
            <strong>{{ text('群组白名单', 'Group allowlist') }}</strong>
            <span>{{ text('允许这些群组、频道或发送者入口触发当前账号。', 'Allow these groups, channels, or sender entrypoints to trigger this account.') }}</span>
          </div>

          <div v-if="draft.groupAllowFrom.length" class="tag-grid">
            <span v-for="value in draft.groupAllowFrom" :key="value" class="tag-chip">
              {{ value }}
              <button type="button" class="danger-link" :aria-label="text('移除', 'Remove')" @click="removeEntry('group', value)">
                <X class="drawer-close-icon" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div v-else class="empty-inline">
            {{ text('当前没有群组白名单。', 'No group allowlist entries yet.') }}
          </div>

          <div class="inline-entry-row">
            <input v-model="groupEntry" class="form-input" :placeholder="text('输入群组 / 发送者 ID', 'Enter group or sender id')" @keyup.enter="appendEntry('group')" />
            <button type="button" class="secondary-button compact-button" @click="appendEntry('group')">{{ text('添加', 'Add') }}</button>
          </div>
        </section>
      </div>
    </article>

    <footer class="panel-card channels-save-bar" :class="{ dirty: hasUnsavedChanges, saving }">
      <div class="channels-save-bar__status">
        <strong>{{ saveStateTitle }}</strong>
        <p>{{ saveStateCopy }}</p>
      </div>

      <div class="channels-save-bar__actions">
        <button type="button" class="primary-button" :disabled="saving || !hasUnsavedChanges" @click="save">
          {{ saving ? text('保存中...', 'Saving...') : text('保存白名单', 'Save allowlists') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { X } from '@lucide/vue';
import { fetchChannelAccountAccess, saveChannelAccountAccess } from './api';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { useLocalePreference } from '../../shared/locale';
import { stableStringify } from './channel-ui';
import { useChannelsWorkspace } from './workspace';

defineOptions({ name: 'ChannelAccessControlPage' });

const workspace = useChannelsWorkspace();
const route = useRoute();
const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();

const channel = computed(() => workspace.selectedChannel.value);
const account = computed(() => {
  return channel.value?.accounts.find((entry) => entry.id === String(route.params.accountId || '')) || null;
});

const draft = reactive({
  allowFrom: [] as string[],
  groupAllowFrom: [] as string[],
});
const allowEntry = ref('');
const groupEntry = ref('');
const saving = computed(() => workspace.busyKey.value === 'save-access');
const lastSavedSnapshot = ref('');

function captureDraftSnapshot(): string {
  return stableStringify({
    allowFrom: draft.allowFrom,
    groupAllowFrom: draft.groupAllowFrom,
  });
}

watch(
  () => [channel.value?.type, account.value?.id] as const,
  async ([channelType, accountId]) => {
    if (!channelType || !accountId) return;
    try {
      const payload = await fetchChannelAccountAccess(channelType, accountId);
      draft.allowFrom = [...payload.allowFrom];
      draft.groupAllowFrom = [...payload.groupAllowFrom];
      lastSavedSnapshot.value = captureDraftSnapshot();
    } catch (error) {
      workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
    }
  },
  { immediate: true },
);

const hasUnsavedChanges = computed(() => captureDraftSnapshot() !== lastSavedSnapshot.value);
const saveStateTitle = computed(() => {
  if (saving.value) return text('保存中', 'Saving');
  if (hasUnsavedChanges.value) return text('有未保存更改', 'Unsaved changes');
  return text('已保存', 'Saved');
});
const saveStateCopy = computed(() => {
  if (saving.value) {
    return text('白名单改动正在写入配置文件。', 'Allowlist changes are being written to config files.');
  }
  if (hasUnsavedChanges.value) {
    return text('权限名单经常需要连续微调，保存状态会一直固定在底部。', 'Allowlist edits often happen in small bursts, so the save state stays pinned at the bottom.');
  }
  return text('当前白名单草稿和已保存配置一致。', 'The current allowlist draft matches the saved configuration.');
});

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) return true;
  return await confirm({
    title: text('确认离开页面', 'Confirm leaving page'),
    message: text('当前还有未保存更改，确定要离开这个页面吗？', 'You have unsaved changes. Leave this page anyway?'),
    confirmText: text('离开', 'Leave'),
    cancelText: text('继续编辑', 'Keep editing'),
  });
});

function appendEntry(scope: 'allow' | 'group'): void {
  const source = scope === 'allow' ? allowEntry : groupEntry;
  const target = scope === 'allow' ? draft.allowFrom : draft.groupAllowFrom;
  const value = source.value.trim();
  if (!value || target.includes(value)) return;
  target.push(value);
  source.value = '';
}

function removeEntry(scope: 'allow' | 'group', value: string): void {
  const target = scope === 'allow' ? draft.allowFrom : draft.groupAllowFrom;
  const index = target.indexOf(value);
  if (index >= 0) target.splice(index, 1);
}

async function save(): Promise<void> {
  if (!channel.value || !account.value) return;
  workspace.clearMessages();
  workspace.busyKey.value = 'save-access';
  try {
    const response = await saveChannelAccountAccess(channel.value.type, account.value.id, {
      allowFrom: draft.allowFrom,
      groupAllowFrom: draft.groupAllowFrom,
    });
    workspace.setSuccessMessage(response.message);
    lastSavedSnapshot.value = captureDraftSnapshot();
    await workspace.refreshSummary(channel.value.type);
  } catch (error) {
    workspace.setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
  } finally {
    workspace.busyKey.value = '';
  }
}
</script>

<style scoped>
.channels-access-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.channels-access-card {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--shell-panel-fill) 84%, transparent);
}

.channels-access-card__head {
  display: grid;
  gap: 4px;
}

.channels-access-card__head strong {
  color: var(--text);
  font-size: 13px;
}

.channels-access-card__head span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.channels-save-bar {
  position: sticky;
  bottom: 16px;
  z-index: 4;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 94%, rgba(255, 255, 255, 0.02));
}

.channels-save-bar.dirty {
  border-color: rgba(255, 190, 122, 0.3);
}

.channels-save-bar__status {
  display: grid;
  gap: 4px;
}

.channels-save-bar__status strong {
  color: var(--text);
}

.channels-save-bar__status p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.channels-save-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 920px) {
  .channels-access-grid {
    grid-template-columns: 1fr;
  }

  .channels-save-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .channels-save-bar__actions {
    width: 100%;
  }

  .channels-save-bar__actions > * {
    flex: 1 1 0;
  }
}
</style>
