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
            <span class="sr-only">{{ text('搜索页面或命令', 'Search pages or commands') }}</span>
            <input
              ref="searchInput"
              v-model="query"
              type="search"
              autocomplete="off"
              :placeholder="text('搜索页面和功能', 'Search pages and features')"
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
            v-if="filteredNavigationCommands.length"
            class="studio-command-palette__section"
          >
            <h2>{{ text('页面导航', 'Navigation') }}</h2>
            <button
              v-for="command in filteredNavigationCommands"
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
                <small>{{ command.group }}</small>
              </span>
              <span class="studio-command-palette__path">{{ command.to }}</span>
            </button>
          </section>

          <p v-if="!visibleCommands.length" class="studio-command-palette__empty">
            {{ text('没有匹配的页面或命令。', 'No matching page or command.') }}
          </p>
        </div>

        <footer class="studio-command-palette__footer">
          <span>{{ text('↑↓ 选择', '↑↓ Select') }}</span>
          <span>{{ text('Enter 打开', 'Enter Open') }}</span>
          <span>Esc {{ text('关闭', 'Close') }}</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Bot,
  Boxes,
  CalendarClock,
  Command,
  Compass,
  FileText,
  Gauge,
  LayoutGrid,
  MessageSquare,
  MoonStar,
  Network,
  Settings2,
  Terminal,
  X,
} from '@lucide/vue';
import { useRouter } from 'vue-router';
import { useLocalePreference } from '../shared/locale';

type NavCommand = {
  id: string;
  kind: 'navigation';
  group: string;
  icon: string;
  label: string;
  detail: string;
  to: string;
};

type CommandItem = NavCommand;

const props = defineProps<{
  open: boolean;
  navGroups: Array<{
    title: string;
    items: Array<{ to: string; icon: string; label: string }>;
  }>;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const router = useRouter();
const { text } = useLocalePreference();
const query = ref('');
const activeCommandId = ref<string>('');
const searchInput = ref<HTMLInputElement | null>(null);

const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());

const navigationCommands = computed<NavCommand[]>(() =>
  props.navGroups.flatMap((group) =>
    group.items.map((item) => ({
      id: `nav:${item.to}`,
      kind: 'navigation',
      group: group.title,
      icon: item.icon,
      label: item.label,
      detail: `${group.title} · ${item.to}`,
      to: item.to,
    })),
  ),
);

function matchesCommand(command: CommandItem): boolean {
  const queryText = normalizedQuery.value;
  if (!queryText) return true;
  return [command.label, command.detail, command.group, command.to]
    .join(' ')
    .toLocaleLowerCase()
    .includes(queryText);
}

const filteredNavigationCommands = computed(() =>
  navigationCommands.value.filter(matchesCommand).slice(0, 10),
);

const visibleCommands = computed<CommandItem[]>(() => [
  ...filteredNavigationCommands.value,
]);

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
  void router.push(command.to);
}

function resolveCommandIcon(icon: string) {
  const icons = {
    dashboard: LayoutGrid,
    chat: MessageSquare,
    skills: Compass,
    files: FileText,
    terminal: Terminal,
    system: Gauge,
    agents: Bot,
    channels: Network,
    cron: CalendarClock,
    config: Settings2,
    plugins: Boxes,
    dreaming: MoonStar,
  };
  return icons[icon as keyof typeof icons] ?? Boxes;
}
</script>
