<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="studio-command-palette"
      role="presentation"
      @keydown.esc.prevent="closePalette"
    >
      <button
        type="button"
        class="studio-command-palette__backdrop"
        :aria-label="text('关闭命令面板', 'Close command palette')"
        @click="closePalette"
      ></button>

      <section
        class="studio-command-palette__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="text('命令面板', 'Command palette')"
      >
        <header class="studio-command-palette__header">
          <Command class="studio-command-palette__mark" aria-hidden="true" />
          <label class="studio-command-palette__search">
            <span class="sr-only">{{ text('搜索命令', 'Search commands') }}</span>
            <input
              ref="searchInput"
              v-model="query"
              type="search"
              autocomplete="off"
              :placeholder="text('搜索全局命令', 'Search global commands')"
              @keydown.down.prevent="moveSelection(1)"
              @keydown.up.prevent="moveSelection(-1)"
              @keydown.enter.prevent="runSelectedCommand"
            />
          </label>
          <button
            type="button"
            class="studio-command-palette__close"
            :aria-label="text('关闭', 'Close')"
            @click="closePalette"
          >
            <X class="studio-command-palette__close-icon" aria-hidden="true" />
          </button>
        </header>

        <div class="studio-command-palette__body">
          <section
            v-if="visibleCommands.length"
            class="studio-command-palette__section"
          >
            <h2>{{ text('全局操作', 'Global actions') }}</h2>
            <button
              v-for="command in visibleCommands"
              :key="command.id"
              type="button"
              class="studio-command-palette__item"
              :class="{ active: command.id === activeCommandId }"
              @mouseenter="activeCommandId = command.id"
              @click="runCommand(command)"
          >
              <span class="studio-command-palette__item-icon" aria-hidden="true">
                <component :is="resolveCommandIcon(command.icon)" />
              </span>
              <span class="studio-command-palette__item-main">
                <strong>{{ command.label }}</strong>
                <small>{{ command.detail }}</small>
              </span>
              <span class="studio-command-palette__path">{{ command.category }}</span>
            </button>
          </section>

          <p v-if="!visibleCommands.length" class="studio-command-palette__empty">
            {{ text('没有匹配的命令。', 'No matching command.') }}
          </p>
        </div>

        <footer class="studio-command-palette__footer">
          <span>{{ text('↑↓ 选择', '↑↓ Select') }}</span>
          <span>{{ text('Enter 执行', 'Enter Run') }}</span>
          <span>Esc {{ text('关闭', 'Close') }}</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Command,
  ExternalLink,
  Languages,
  Monitor,
  Moon,
  Sun,
  X,
} from '@lucide/vue';
import { useLocalePreference } from '../shared/locale';
import { useThemePreference, type ThemeMode } from '../shared/theme';
import './studio-command-palette.css';

type CommandIcon = 'sun' | 'moon' | 'monitor' | 'language' | 'external';

type CommandItem = {
  id: string;
  category: string;
  icon: CommandIcon;
  label: string;
  detail: string;
  run: () => void;
};

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const { locale, setLocale, text } = useLocalePreference();
const { setThemeMode } = useThemePreference();
const query = ref('');
const activeCommandId = ref<string>('');
const searchInput = ref<HTMLInputElement | null>(null);

const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());

const actionCommands = computed<CommandItem[]>(() => {
  const themeCategory = text('主题', 'Theme');
  const languageCategory = text('语言', 'Language');
  const supportCategory = text('支持', 'Support');

  return [
    buildThemeCommand('light', text('切换浅色模式', 'Switch to light theme'), text('使用明亮工作台配色', 'Use the light workspace palette'), 'sun', themeCategory),
    buildThemeCommand('dark', text('切换深色模式', 'Switch to dark theme'), text('使用低眩光深色工作台配色', 'Use the low-glare dark workspace palette'), 'moon', themeCategory),
    buildThemeCommand('system', text('跟随系统主题', 'Follow system theme'), text('按系统外观自动切换', 'Follow the operating system appearance'), 'monitor', themeCategory),
    {
      id: 'locale:zh',
      category: languageCategory,
      icon: 'language',
      label: text('切换到中文', 'Switch to Chinese'),
      detail: locale.value === 'zh' ? text('当前已是中文', 'Chinese is already active') : text('界面语言切换为中文', 'Change the interface language to Chinese'),
      run: () => setLocale('zh'),
    },
    {
      id: 'locale:en',
      category: languageCategory,
      icon: 'language',
      label: text('切换到 English', 'Switch to English'),
      detail: locale.value === 'en' ? text('当前已是 English', 'English is already active') : text('界面语言切换为 English', 'Change the interface language to English'),
      run: () => setLocale('en'),
    },
    {
      id: 'support:docs',
      category: supportCategory,
      icon: 'external',
      label: text('打开官方文档', 'Open official docs'),
      detail: 'studio.90le.cn',
      run: () => {
        if (typeof window !== 'undefined') {
          window.open('https://studio.90le.cn', '_blank', 'noreferrer');
        }
      },
    },
  ];
});

function buildThemeCommand(
  mode: ThemeMode,
  label: string,
  detail: string,
  icon: CommandIcon,
  category: string,
): CommandItem {
  return {
    id: `theme:${mode}`,
    category,
    icon,
    label,
    detail,
    run: () => setThemeMode(mode),
  };
}

function matchesCommand(command: CommandItem): boolean {
  const queryText = normalizedQuery.value;
  if (!queryText) return true;
  return [command.label, command.detail, command.category]
    .join(' ')
    .toLocaleLowerCase()
    .includes(queryText);
}

const visibleCommands = computed<CommandItem[]>(() => actionCommands.value.filter(matchesCommand).slice(0, 10));

watch(visibleCommands, (commands) => {
  if (!commands.length) {
    activeCommandId.value = '';
    return;
  }
  if (!commands.some((command) => command.id === activeCommandId.value)) {
    activeCommandId.value = commands[0].id;
  }
}, { immediate: true });

watch(() => props.open, async (open) => {
  if (!open) {
    query.value = '';
    return;
  }
  await nextTick();
  searchInput.value?.focus();
  activeCommandId.value = visibleCommands.value[0]?.id ?? '';
});

function closePalette() {
  emit('update:open', false);
}

function moveSelection(delta: number) {
  const commands = visibleCommands.value;
  if (!commands.length) return;
  const currentIndex = commands.findIndex((command) => command.id === activeCommandId.value);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + delta + commands.length) % commands.length;
  activeCommandId.value = commands[nextIndex].id;
}

function runSelectedCommand() {
  const command = visibleCommands.value.find((item) => item.id === activeCommandId.value);
  if (command) runCommand(command);
}

function runCommand(command: CommandItem) {
  closePalette();
  command.run();
}

function resolveCommandIcon(icon: CommandIcon) {
  const icons = {
    sun: Sun,
    moon: Moon,
    monitor: Monitor,
    language: Languages,
    external: ExternalLink,
  };
  return icons[icon] ?? Command;
}
</script>
