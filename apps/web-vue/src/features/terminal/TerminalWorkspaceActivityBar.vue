<template>
  <nav class="terminal-activity-bar" :aria-label="text('终端工作台侧边栏', 'Terminal workbench sidebar')">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="terminal-activity-button"
      :class="{ active: activePanel === item.id }"
      :title="item.label"
      :aria-label="item.label"
      :aria-pressed="activePanel === item.id && sidebarOpen"
      @click="emit('select', item.id)"
    >
      <component :is="item.icon" class="terminal-activity-button__icon" aria-hidden="true" />
      <span v-if="item.count > 0" class="terminal-activity-button__badge">{{ compactCount(item.count) }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Files, GitBranch, Search } from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';

export type TerminalSidebarPanel = 'files' | 'search' | 'git';

const props = withDefaults(
  defineProps<{
    activePanel: TerminalSidebarPanel;
    sidebarOpen: boolean;
    searchCount?: number;
    gitCount?: number;
  }>(),
  {
    searchCount: 0,
    gitCount: 0,
  },
);

const emit = defineEmits<{
  (event: 'select', panel: TerminalSidebarPanel): void;
}>();

const { text } = useLocalePreference();

const items = computed(() => [
  {
    id: 'files' as const,
    label: text('资源管理器', 'Explorer'),
    icon: Files,
    count: 0,
  },
  {
    id: 'search' as const,
    label: text('全局搜索', 'Search'),
    icon: Search,
    count: props.searchCount,
  },
  {
    id: 'git' as const,
    label: text('源代码管理', 'Source Control'),
    icon: GitBranch,
    count: props.gitCount,
  },
]);

function compactCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}
</script>
