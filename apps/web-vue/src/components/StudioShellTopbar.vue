<template>
  <header class="studio-shell-topbar" role="banner">
    <button
      v-if="isMobile"
      type="button"
      class="topbar-mobile-nav"
      :aria-label="mobileNavLabel"
      :title="mobileNavLabel"
      :aria-expanded="String(mobileNavOpen)"
      @click="$emit('toggle-mobile-nav')"
    >
      <Menu class="studio-shell-topbar__icon" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="studio-shell-topbar__search"
      :title="searchLabel"
      :aria-label="searchLabel"
      @click="$emit('open-command-palette')"
    >
      <Search class="studio-shell-topbar__icon" aria-hidden="true" />
      <span class="studio-shell-topbar__search-label">{{ searchLabel }}</span>
      <span class="studio-shell-topbar__search-shortcut">{{ searchShortcutLabel }}</span>
    </button>

    <nav class="studio-shell-topbar__switchboard" :aria-label="switchboardLabel">
      <RouterLink
        v-for="item in switchboardItems"
        :key="item.to"
        :to="item.to"
        class="studio-shell-topbar__switch"
        :class="{ active: isActiveRoute(item.to) }"
      >
        <SidebarIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="studio-shell-topbar__controls">
      <button
        v-if="showContextToggle"
        type="button"
        class="studio-shell-topbar__context-toggle"
        :aria-pressed="String(contextPanelOpen)"
        :aria-label="contextToggleLabel"
        :title="contextToggleLabel"
        @click="$emit('toggle-context-panel')"
      >
        {{ contextToggleLabel }}
      </button>

      <div class="theme-switch" role="group" :aria-label="themeSwitchLabel">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="theme-switch-button"
          :class="{ active: themeMode === option.value }"
          :title="option.label"
          :aria-pressed="String(themeMode === option.value)"
          @click="$emit('set-theme-mode', option.value)"
        >
          <component :is="resolveThemeIcon(option.value)" class="theme-switch-icon" aria-hidden="true" />
          <span>{{ option.shortLabel }}</span>
        </button>
      </div>

      <div class="theme-switch" role="group" :aria-label="localeSwitchLabel">
        <button
          v-for="option in localeOptions"
          :key="option.value"
          type="button"
          class="theme-switch-button locale-switch-button"
          :class="{ active: locale === option.value }"
          :title="option.label"
          :aria-pressed="String(locale === option.value)"
          @click="$emit('set-locale', option.value)"
        >
          <span>{{ option.shortLabel }}</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Monitor, Moon, Search, Sun, Menu } from '@lucide/vue';
import { RouterLink, useRoute } from 'vue-router';
import type { Locale } from '../shared/locale';
import type { ThemeMode } from '../shared/theme';
import SidebarIcon from './SidebarIcon.vue';

type ThemeOption = {
  value: ThemeMode;
  label: string;
  shortLabel: string;
};

type LocaleOption = {
  value: Locale;
  label: string;
  shortLabel: string;
};

type ShellNavIconName =
  | 'dashboard'
  | 'agents'
  | 'chat'
  | 'channels'
  | 'cron'
  | 'dreaming'
  | 'skills'
  | 'files'
  | 'plugins'
  | 'terminal'
  | 'config'
  | 'system';

type ShellNavGroup = {
  title: string;
  items: Array<{
    to: string;
    label: string;
    icon: ShellNavIconName;
  }>;
};

const props = defineProps<{
  isMobile: boolean;
  mobileNavOpen: boolean;
  searchLabel: string;
  searchShortcutLabel: string;
  switchboardLabel: string;
  navGroups: ShellNavGroup[];
  mobileNavLabel: string;
  showContextToggle: boolean;
  contextPanelOpen: boolean;
  contextToggleLabel: string;
  themeSwitchLabel: string;
  localeSwitchLabel: string;
  themeMode: ThemeMode;
  themeOptions: ThemeOption[];
  locale: Locale;
  localeOptions: LocaleOption[];
}>();

defineEmits<{
  (event: 'toggle-mobile-nav'): void;
  (event: 'toggle-context-panel'): void;
  (event: 'open-command-palette'): void;
  (event: 'set-theme-mode', value: ThemeMode): void;
  (event: 'set-locale', value: Locale): void;
}>();

const resolveThemeIcon = (value: ThemeMode) => {
  if (value === 'light') return Sun;
  if (value === 'dark') return Moon;
  return Monitor;
};

const route = useRoute();

const switchboardItems = computed(() =>
  props.navGroups.flatMap((group) => group.items).filter((item) => item.to !== '/dashboard'),
);

const isActiveRoute = (target: string) => route.path === target || route.path.startsWith(`${target}/`);
</script>
