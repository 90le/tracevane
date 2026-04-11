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
          {{ getStudioSlashCommandCategoryLabel(group.category, locale) }}
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
              {{ getStudioSlashCommandDescription(entry.command, locale) }}
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
          /{{ activeCommand.name }} {{ getStudioSlashCommandDescription(activeCommand, locale) }}
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
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import {
  getStudioSlashCommandCategoryLabel,
  getStudioSlashCommandDescription,
  type StudioSlashArgOptionDetail,
  type StudioSlashCommandCategory,
  type StudioSlashCommandDef,
} from './slash-commands';

const props = defineProps<{
  items: StudioSlashCommandDef[];
  activeIndex: number;
  mode: 'command' | 'args';
  activeCommand: StudioSlashCommandDef | null;
  argumentItems: StudioSlashArgOptionDetail[];
}>();

defineEmits<{
  (event: 'hover-command', index: number): void;
  (event: 'select-command', command: StudioSlashCommandDef): void;
  (event: 'hover-argument', index: number): void;
  (event: 'select-argument', value: string): void;
}>();

const { locale, text } = useLocalePreference();
const commandMode = computed(() => props.mode === 'command');
const argumentMode = computed(() => props.mode === 'args');

const groupedItems = computed(() => {
  const groups = new Map<StudioSlashCommandCategory, Array<{ command: StudioSlashCommandDef; index: number }>>();
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

<style scoped>
.chat-slash-menu {
  display: grid;
  gap: 10px;
  width: 100%;
  max-height: min(48vh, 420px);
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--chat-line-strong);
  border-radius: 12px;
  background: var(--chat-menu-surface);
  box-shadow: 0 26px 64px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(14px);
  scrollbar-width: thin;
}

.chat-slash-menu-group {
  display: grid;
  gap: 6px;
}

.chat-slash-menu-group-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--chat-text-soft);
}

.chat-slash-menu-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--chat-text);
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.chat-slash-menu-item:hover,
.chat-slash-menu-item.active {
  background: color-mix(in srgb, var(--chat-hover) 78%, transparent 22%);
  border-color: color-mix(in srgb, var(--chat-accent) 28%, var(--chat-line) 72%);
}

.chat-slash-menu-item.active {
  transform: translateY(-1px);
}

.chat-slash-menu-main,
.chat-slash-menu-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chat-slash-menu-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--chat-text);
}

.chat-slash-menu-args,
.chat-slash-menu-desc {
  min-width: 0;
  font-size: 12px;
  color: var(--chat-text-soft);
  overflow-wrap: anywhere;
}

.chat-slash-menu-desc {
  flex: 1;
}

.chat-slash-menu-badge {
  flex: none;
  padding: 2px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent 86%);
  color: var(--chat-text);
  font-size: 11px;
  font-weight: 700;
}

.chat-slash-menu-badge.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}

.chat-slash-menu-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 2px;
  font-size: 11px;
  color: var(--chat-text-soft);
}

.chat-slash-menu-footer kbd {
  padding: 1px 6px;
  border: 1px solid var(--chat-line);
  border-radius: 6px;
  background: var(--chat-modal-row);
  font: inherit;
  font-weight: 700;
  color: var(--chat-text);
}

@media (max-width: 760px) {
  .chat-slash-menu {
    max-height: min(46vh, 360px);
    padding: 10px;
  }

  .chat-slash-menu-item {
    padding: 9px 10px;
  }

  .chat-slash-menu-main,
  .chat-slash-menu-meta {
    flex-wrap: wrap;
  }
}
</style>
