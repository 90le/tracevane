<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="chat-slash-help-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section
          class="chat-slash-help-dialog"
          :aria-label="text('斜杠命令总览', 'Slash command catalog')"
        >
        <header class="chat-slash-help-head">
          <div class="chat-slash-help-copy">
            <strong>{{ text('斜杠命令', 'Slash commands') }}</strong>
            <span>
              {{
                text(
                  '这里汇总 Studio Chat 当前可识别的 slash 命令。点击任一命令可直接插入到输入框。',
                  'This lists the slash commands currently recognized by Studio Chat. Click a command to insert it into the composer.',
                )
              }}
            </span>
          </div>
          <DialogClose as-child>
            <button
              type="button"
              class="chat-slash-help-close"
              :aria-label="text('关闭斜杠命令总览', 'Close slash command catalog')"
            >
              ×
            </button>
          </DialogClose>
        </header>

        <div class="chat-slash-help-toolbar">
          <div class="chat-slash-help-summary">
            <span v-if="normalizedFilter">
              {{
                text(
                  `当前筛选：/${normalizedFilter} · 共 ${filteredCommands.length} 条`,
                  `Filter: /${normalizedFilter} · ${filteredCommands.length} commands`,
                )
              }}
            </span>
            <span v-else>
              {{ text(`共 ${filteredCommands.length} 条命令`, `${filteredCommands.length} commands`) }}
            </span>
          </div>
          <div class="chat-slash-help-legend">
            <span class="chat-slash-help-badge local">{{ text('本地', 'Local') }}</span>
            <span class="chat-slash-help-legend-text">
              {{ text('直接由 Studio 处理', 'Handled directly by Studio') }}
            </span>
            <span class="chat-slash-help-badge send">{{ text('发送', 'Send') }}</span>
            <span class="chat-slash-help-legend-text">
              {{ text('作为 slash 文本发送给宿主 agent', 'Sent through chat for the host agent to handle') }}
            </span>
          </div>
        </div>

        <div class="chat-slash-help-body">
          <template v-if="groupedCommands.length">
            <section
              v-for="group in groupedCommands"
              :key="group.category"
              class="chat-slash-help-group"
            >
              <div class="chat-slash-help-group-label">
                {{ getStudioSlashCommandCategoryLabel(group.category, locale) }}
              </div>

              <button
                v-for="command in group.items"
                :key="command.key"
                type="button"
                class="chat-slash-help-row"
                @click="$emit('insert-command', command)"
              >
                <div class="chat-slash-help-row-main">
                  <div class="chat-slash-help-row-head">
                    <span class="chat-slash-help-name">/{{ command.name }}</span>
                    <span v-if="command.args" class="chat-slash-help-args">{{ command.args }}</span>
                    <span
                      class="chat-slash-help-badge"
                      :class="command.executeMode === 'local' ? 'local' : 'send'"
                    >
                      {{ command.executeMode === 'local' ? text('本地', 'Local') : text('发送', 'Send') }}
                    </span>
                  </div>
                  <div class="chat-slash-help-row-copy">
                    <span>{{ getStudioSlashCommandDescription(command, locale) }}</span>
                    <span v-if="command.aliases?.length">
                      {{ text(`别名：${command.aliases.map((item) => `/${item}`).join('、')}`, `Aliases: ${command.aliases.map((item) => `/${item}`).join(', ')}`) }}
                    </span>
                  </div>
                </div>
                <span class="chat-slash-help-insert">
                  {{ text('插入命令', 'Insert command') }}
                </span>
              </button>
            </section>
          </template>

          <div v-else class="chat-slash-help-empty">
            <strong>{{ text('没有匹配的 slash 命令', 'No matching slash commands') }}</strong>
            <span>{{ text('换一个关键字，或直接清空筛选查看完整命令列表。', 'Try another filter, or clear it to view the full command catalog.') }}</span>
          </div>
        </div>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { useLocalePreference } from '../../shared/locale';
import {
  getStudioSlashCommandCategoryLabel,
  getStudioSlashCommandCompletions,
  getStudioSlashCommandDescription,
  type StudioSlashCommandCategory,
  type StudioSlashCommandDef,
} from './slash-commands';

const props = defineProps<{
  open: boolean;
  filter: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'insert-command', command: StudioSlashCommandDef): void;
}>();

const { locale, text } = useLocalePreference();

const normalizedFilter = computed(() => props.filter.trim().replace(/^\/+/u, ''));
const filteredCommands = computed(() => getStudioSlashCommandCompletions(normalizedFilter.value));
const groupedCommands = computed(() => {
  const groups = new Map<StudioSlashCommandCategory, StudioSlashCommandDef[]>();
  filteredCommands.value.forEach((command) => {
    const existing = groups.get(command.category) || [];
    existing.push(command);
    groups.set(command.category, existing);
  });
  return Array.from(groups.entries()).map(([category, items]) => ({
    category,
    items,
  }));
});

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    emit('close');
  }
}
</script>

<style scoped>
.chat-slash-help-mask {
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

.chat-slash-help-mask[data-state='open'] {
  animation: chat-slash-help-mask-in 0.2s ease;
}

.chat-slash-help-dialog {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(920px, calc(100vw - 24px));
  max-height: min(82vh, 760px);
  overflow: hidden;
  border: 1px solid var(--chat-line);
  border-radius: 12px;
  background: var(--chat-modal-bg);
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.18);
}

.chat-slash-help-dialog[data-state='open'] {
  animation: chat-slash-help-dialog-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes chat-slash-help-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-slash-help-dialog-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.chat-slash-help-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--chat-line);
}

.chat-slash-help-copy {
  display: grid;
  gap: 6px;
}

.chat-slash-help-copy strong {
  font-size: 16px;
  font-weight: 800;
  color: var(--chat-text);
}

.chat-slash-help-copy span {
  font-size: 13px;
  line-height: 1.55;
  color: var(--chat-text-soft);
}

.chat-slash-help-close {
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

.chat-slash-help-close:hover,
.chat-slash-help-close:focus-visible {
  border-color: color-mix(in srgb, var(--chat-accent) 30%, var(--chat-line) 70%);
  background: color-mix(in srgb, var(--chat-modal-row) 68%, var(--chat-hover));
}

.chat-slash-help-toolbar {
  display: grid;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 72%, transparent);
}

.chat-slash-help-summary {
  font-size: 12px;
  color: var(--chat-text-soft);
}

.chat-slash-help-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.chat-slash-help-legend-text {
  margin-right: 10px;
  font-size: 12px;
  color: var(--chat-text-soft);
}

.chat-slash-help-body {
  overflow: auto;
  padding: 16px 20px 20px;
}

.chat-slash-help-group {
  display: grid;
  gap: 8px;
}

.chat-slash-help-group + .chat-slash-help-group {
  margin-top: 18px;
}

.chat-slash-help-group-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--chat-text-soft);
}

.chat-slash-help-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 86%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
  color: var(--chat-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.chat-slash-help-row:hover,
.chat-slash-help-row:focus-visible {
  border-color: color-mix(in srgb, var(--chat-accent) 30%, var(--chat-line) 70%);
  background: color-mix(in srgb, var(--chat-hover) 70%, transparent 30%);
  transform: translateY(-1px);
}

.chat-slash-help-row-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.chat-slash-help-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.chat-slash-help-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--chat-text);
}

.chat-slash-help-args {
  font-size: 12px;
  color: var(--chat-text-soft);
}

.chat-slash-help-row-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
  color: var(--chat-text-soft);
}

.chat-slash-help-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
}

.chat-slash-help-badge.local {
  background: color-mix(in srgb, var(--chat-accent) 16%, transparent 84%);
  color: var(--chat-text);
}

.chat-slash-help-badge.send {
  background: color-mix(in srgb, var(--chat-modal-row) 90%, transparent 10%);
  color: var(--chat-text-soft);
}

.chat-slash-help-insert {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--chat-accent);
}

.chat-slash-help-empty {
  display: grid;
  gap: 8px;
  padding: 24px 0 4px;
  text-align: center;
}

.chat-slash-help-empty strong {
  font-size: 14px;
  color: var(--chat-text);
}

.chat-slash-help-empty span {
  font-size: 12px;
  color: var(--chat-text-soft);
}

@media (max-width: 760px) {
  .chat-slash-help-mask {
    padding: 12px;
    align-items: flex-end;
  }

  .chat-slash-help-dialog {
    width: 100%;
    max-height: min(88vh, 860px);
    border-radius: 12px 12px 10px 10px;
  }

  .chat-slash-help-head,
  .chat-slash-help-toolbar,
  .chat-slash-help-body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .chat-slash-help-row {
    align-items: flex-start;
  }

  .chat-slash-help-insert {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-slash-help-mask[data-state='open'],
  .chat-slash-help-dialog[data-state='open'] {
    animation: none;
  }
}
</style>
