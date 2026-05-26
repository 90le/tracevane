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
              <X class="drawer-close-icon" aria-hidden="true" />
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
import './slash-command.css';
import { computed } from 'vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { X } from '@lucide/vue';
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
