<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="chat-slash-status-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section
          class="chat-slash-status-dialog"
          :aria-label="text('当前状态', 'Current status')"
        >
        <header class="chat-slash-status-head">
          <div class="chat-slash-status-copy">
            <strong>{{ text('当前状态', 'Current status') }}</strong>
            <span>
              {{
                text(
                  '这里展示当前会话在 Studio 前端已知的运行态、连接态和控制开关，便于在不离开 chat 的情况下快速判断状态。',
                  'This shows the runtime, connectivity, and control state currently known to Studio so you can inspect the chat state without leaving the conversation.',
                )
              }}
            </span>
          </div>
          <DialogClose as-child>
            <button
              type="button"
              class="chat-slash-status-close"
              :aria-label="text('关闭当前状态', 'Close current status')"
            >
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </DialogClose>
        </header>

        <div class="chat-slash-status-body">
          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('会话', 'Session') }}</div>
            <div class="chat-slash-status-grid">
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('标题', 'Title') }}</span>
                <strong>{{ title || text('未命名会话', 'Untitled session') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('Agent', 'Agent') }}</span>
                <strong>{{ agentName || agentId || '—' }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('会话键', 'Session key') }}</span>
                <strong class="mono">{{ sessionKey || '—' }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('可写', 'Writable') }}</span>
                <strong>{{ writable ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </article>
            </div>
          </section>

          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('Runtime', 'Runtime') }}</div>
            <div class="chat-slash-status-grid">
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('运行状态', 'Run state') }}</span>
                <strong>{{ runtime?.state || text('未知', 'Unknown') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('活跃 Run', 'Active run') }}</span>
                <strong class="mono">{{ runtime?.activeRunId || '—' }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('最后事件', 'Last event') }}</span>
                <strong>{{ runtime?.lastEventAt || '—' }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('最后确认', 'Last ack') }}</span>
                <strong>{{ runtime?.lastAckAt || '—' }}</strong>
              </article>
            </div>
            <div v-if="runtime?.lastErrorMessage || gatewayWarning || accessError" class="chat-slash-status-warning">
              <strong>{{ text('最近告警', 'Recent warning') }}</strong>
              <span>{{ runtime?.lastErrorMessage || gatewayWarning || accessError }}</span>
            </div>
          </section>

          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('Queue', 'Queue') }}</div>
            <div class="chat-slash-status-grid">
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('待发送数量', 'Queued items') }}</span>
                <strong>{{ queueLength }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('实时连接就绪', 'Realtime ready') }}</span>
                <strong>{{ realtimeReady ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('Gateway 已连接', 'Gateway connected') }}</span>
                <strong>{{ runtime?.gatewayConnected ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('正在查看历史位置', 'Viewing history') }}</span>
                <strong>{{ viewingHistoricalPosition ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </article>
            </div>
          </section>

          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('Controls', 'Controls') }}</div>
            <div class="chat-slash-status-grid">
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('全局宿主管理 Exec', 'Global host-management Exec') }}</span>
                <strong>{{ globalHostManagementExecEnabled ? text('开启', 'Enabled') : text('关闭', 'Disabled') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('本会话宿主管理 Exec', 'Session host-management Exec') }}</span>
                <strong>{{ sessionHostManagementExecEnabled ? text('开启', 'Enabled') : text('关闭', 'Disabled') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('更多历史向前', 'Has more before') }}</span>
                <strong>{{ hasMoreBefore ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </article>
              <article class="chat-slash-status-card">
                <span class="chat-slash-status-card-label">{{ text('更多历史向后', 'Has more after') }}</span>
                <strong>{{ hasMoreAfter ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </article>
            </div>
          </section>
        </div>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import './slash-command.css';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { X } from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';
import type { ChatRuntimeState } from '../../../../../types/chat';

defineProps<{
  open: boolean;
  title: string;
  sessionKey: string;
  agentName: string;
  agentId: string;
  writable: boolean;
  runtime: ChatRuntimeState | null;
  queueLength: number;
  realtimeReady: boolean;
  globalHostManagementExecEnabled: boolean;
  sessionHostManagementExecEnabled: boolean;
  viewingHistoricalPosition: boolean;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  gatewayWarning: string;
  accessError: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const { text } = useLocalePreference();

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    emit('close');
  }
}
</script>
