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
            <dl class="chat-slash-status-row-list">
              <div class="chat-slash-status-row">
                <dt>{{ text('标题', 'Title') }}</dt>
                <dd>{{ title || text('未命名会话', 'Untitled session') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('Agent', 'Agent') }}</dt>
                <dd>{{ agentName || agentId || '—' }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('会话键', 'Session key') }}</dt>
                <dd class="mono">{{ sessionKey || '—' }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('可写', 'Writable') }}</dt>
                <dd>{{ writable ? text('是', 'Yes') : text('否', 'No') }}</dd>
              </div>
            </dl>
          </section>

          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('Runtime', 'Runtime') }}</div>
            <dl class="chat-slash-status-row-list">
              <div class="chat-slash-status-row">
                <dt>{{ text('运行状态', 'Run state') }}</dt>
                <dd>{{ runtime?.state || text('未知', 'Unknown') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('活跃 Run', 'Active run') }}</dt>
                <dd class="mono">{{ runtime?.activeRunId || '—' }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('最后事件', 'Last event') }}</dt>
                <dd>{{ runtime?.lastEventAt || '—' }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('最后确认', 'Last ack') }}</dt>
                <dd>{{ runtime?.lastAckAt || '—' }}</dd>
              </div>
            </dl>
            <div v-if="runtime?.lastErrorMessage || gatewayWarning || accessError" class="chat-slash-status-warning">
              <strong>{{ text('最近告警', 'Recent warning') }}</strong>
              <span>{{ runtime?.lastErrorMessage || gatewayWarning || accessError }}</span>
            </div>
          </section>

          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('Queue', 'Queue') }}</div>
            <dl class="chat-slash-status-row-list">
              <div class="chat-slash-status-row">
                <dt>{{ text('待发送数量', 'Queued items') }}</dt>
                <dd>{{ queueLength }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('实时连接就绪', 'Realtime ready') }}</dt>
                <dd>{{ realtimeReady ? text('是', 'Yes') : text('否', 'No') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('Gateway 已连接', 'Gateway connected') }}</dt>
                <dd>{{ runtime?.gatewayConnected ? text('是', 'Yes') : text('否', 'No') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('正在查看历史位置', 'Viewing history') }}</dt>
                <dd>{{ viewingHistoricalPosition ? text('是', 'Yes') : text('否', 'No') }}</dd>
              </div>
            </dl>
          </section>

          <section class="chat-slash-status-group">
            <div class="chat-slash-status-group-label">{{ text('Controls', 'Controls') }}</div>
            <dl class="chat-slash-status-row-list">
              <div class="chat-slash-status-row">
                <dt>{{ text('全局宿主管理 Exec', 'Global host-management Exec') }}</dt>
                <dd>{{ globalHostManagementExecEnabled ? text('开启', 'Enabled') : text('关闭', 'Disabled') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('本会话宿主管理 Exec', 'Session host-management Exec') }}</dt>
                <dd>{{ sessionHostManagementExecEnabled ? text('开启', 'Enabled') : text('关闭', 'Disabled') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('更多历史向前', 'Has more before') }}</dt>
                <dd>{{ hasMoreBefore ? text('是', 'Yes') : text('否', 'No') }}</dd>
              </div>
              <div class="chat-slash-status-row">
                <dt>{{ text('更多历史向后', 'Has more after') }}</dt>
                <dd>{{ hasMoreAfter ? text('是', 'Yes') : text('否', 'No') }}</dd>
              </div>
            </dl>
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
