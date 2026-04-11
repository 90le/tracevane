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
              ×
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
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
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

<style scoped>
.chat-slash-status-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 14, 20, 0.42);
  backdrop-filter: blur(12px);
}

.chat-slash-status-mask[data-state='open'] {
  animation: chat-slash-status-mask-in 0.2s ease;
}

.chat-slash-status-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(920px, calc(100vw - 24px));
  max-height: min(82vh, 760px);
  overflow: hidden;
  border: 1px solid var(--chat-line);
  border-radius: 12px;
  background: var(--chat-modal-bg);
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.18);
}

.chat-slash-status-dialog[data-state='open'] {
  animation: chat-slash-status-dialog-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes chat-slash-status-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-slash-status-dialog-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.chat-slash-status-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--chat-line);
}

.chat-slash-status-copy {
  display: grid;
  gap: 6px;
}

.chat-slash-status-copy strong {
  font-size: 16px;
  font-weight: 800;
  color: var(--chat-text);
}

.chat-slash-status-copy span {
  font-size: 13px;
  line-height: 1.55;
  color: var(--chat-text-soft);
}

.chat-slash-status-close {
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--chat-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--chat-modal-row) 88%, transparent);
  color: var(--chat-text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.chat-slash-status-close:hover,
.chat-slash-status-close:focus-visible {
  border-color: color-mix(in srgb, var(--chat-accent) 30%, var(--chat-line) 70%);
  background: color-mix(in srgb, var(--chat-modal-row) 68%, var(--chat-hover));
}

.chat-slash-status-body {
  display: grid;
  gap: 18px;
  overflow: auto;
  padding: 18px 20px 20px;
}

.chat-slash-status-group {
  display: grid;
  gap: 10px;
}

.chat-slash-status-group-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--chat-text-soft);
}

.chat-slash-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.chat-slash-status-card {
  display: grid;
  gap: 6px;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 86%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
}

.chat-slash-status-card-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--chat-text-soft);
}

.chat-slash-status-card strong {
  font-size: 13px;
  color: var(--chat-text);
}

.chat-slash-status-card strong.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.chat-slash-status-warning {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, #d7825c 34%, var(--chat-line) 66%);
  border-radius: 10px;
  background: color-mix(in srgb, #d7825c 10%, transparent 90%);
}

.chat-slash-status-warning strong {
  font-size: 12px;
  color: var(--chat-text);
}

.chat-slash-status-warning span {
  font-size: 12px;
  color: var(--chat-text-soft);
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .chat-slash-status-mask {
    padding: 12px;
    align-items: flex-end;
  }

  .chat-slash-status-dialog {
    width: 100%;
    max-height: min(88vh, 860px);
    border-radius: 12px 12px 10px 10px;
  }

  .chat-slash-status-head,
  .chat-slash-status-body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .chat-slash-status-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-slash-status-mask[data-state='open'],
  .chat-slash-status-dialog[data-state='open'] {
    animation: none;
  }
}
</style>
