<template>
  <div
    class="chat-slash-menu"
    role="listbox"
    :aria-label="commandMode ? text('斜杠命令', 'Slash commands') : text('命令参数', 'Command arguments')"
  >
    <template v-if="commandMode">
      <div
        v-for="group in groupedItems"
        :key="group.category"
        class="chat-slash-menu-group"
      >
        <div class="chat-slash-menu-group-label">
          {{ getTracevaneSlashCommandCategoryLabel(group.category, locale) }}
        </div>
        <button
          v-for="entry in group.items"
          :key="entry.command.key"
          type="button"
          class="chat-slash-menu-item"
          :class="{ active: entry.index === activeIndex }"
          role="option"
          :aria-selected="entry.index === activeIndex"
          @mousedown.prevent
          @mouseenter="$emit('hover-command', entry.index)"
          @click="$emit('select-command', entry.command)"
        >
          <div class="chat-slash-menu-main">
            <span class="chat-slash-menu-name">/{{ entry.command.name }}</span>
            <span v-if="entry.command.args" class="chat-slash-menu-args">{{ entry.command.args }}</span>
          </div>
          <div class="chat-slash-menu-meta">
            <span class="chat-slash-menu-desc">
              {{ getTracevaneSlashCommandDescription(entry.command, locale) }}
            </span>
            <span
              v-if="entry.command.executeMode === 'local'"
              class="chat-slash-menu-badge"
            >
              {{ text('本地', 'Local') }}
            </span>
            <span
              v-else-if="entry.command.argOptions?.length"
              class="chat-slash-menu-badge"
            >
              {{ text(`${entry.command.argOptions.length} 项`, `${entry.command.argOptions.length} options`) }}
            </span>
          </div>
        </button>
      </div>
    </template>

    <template v-else-if="argumentMode && activeCommand">
      <div class="chat-slash-menu-group">
        <div class="chat-slash-menu-group-label">
          /{{ activeCommand.name }} {{ getTracevaneSlashCommandDescription(activeCommand, locale) }}
        </div>
        <button
          v-for="(item, index) in argumentItems"
          :key="`${activeCommand.key}:${item.value}`"
          type="button"
          class="chat-slash-menu-item"
          :class="{ active: index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @mousedown.prevent
          @mouseenter="$emit('hover-argument', index)"
          @click="$emit('select-argument', item.value)"
        >
          <div class="chat-slash-menu-main">
            <span class="chat-slash-menu-name">{{ item.label }}</span>
          </div>
          <div class="chat-slash-menu-meta">
            <span class="chat-slash-menu-desc">{{ item.description }}</span>
            <span class="chat-slash-menu-badge mono">/{{ activeCommand.name }} {{ item.value }}</span>
          </div>
        </button>
      </div>
    </template>

    <div class="chat-slash-menu-footer">
      <span><kbd>↑↓</kbd> {{ text('切换', 'Move') }}</span>
      <span><kbd>Tab</kbd> {{ text('补全', 'Fill') }}</span>
      <span><kbd>Enter</kbd> {{ text('选择', 'Select') }}</span>
      <span><kbd>Esc</kbd> {{ text('关闭', 'Close') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import './slash-command.css';
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import {
  getTracevaneSlashCommandCategoryLabel,
  getTracevaneSlashCommandDescription,
  type TracevaneSlashArgOptionDetail,
  type TracevaneSlashCommandCategory,
  type TracevaneSlashCommandDef,
} from './slash-commands';

const props = defineProps<{
  items: TracevaneSlashCommandDef[];
  activeIndex: number;
  mode: 'command' | 'args';
  activeCommand: TracevaneSlashCommandDef | null;
  argumentItems: TracevaneSlashArgOptionDetail[];
}>();

defineEmits<{
  (event: 'hover-command', index: number): void;
  (event: 'select-command', command: TracevaneSlashCommandDef): void;
  (event: 'hover-argument', index: number): void;
  (event: 'select-argument', value: string): void;
}>();

const { locale, text } = useLocalePreference();
const commandMode = computed(() => props.mode === 'command');
const argumentMode = computed(() => props.mode === 'args');

const groupedItems = computed(() => {
  const groups = new Map<TracevaneSlashCommandCategory, Array<{ command: TracevaneSlashCommandDef; index: number }>>();
  props.items.forEach((command, index) => {
    const list = groups.get(command.category) || [];
    list.push({ command, index });
    groups.set(command.category, list);
  });
  return Array.from(groups.entries()).map(([category, items]) => ({
    category,
    items,
  }));
});
</script>
