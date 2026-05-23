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

    <div class="studio-shell-topbar__identity" aria-live="polite">
      <span class="studio-shell-topbar__group-label">{{ currentGroupTitle }}</span>
      <strong>{{ currentTitle }}</strong>
      <small>{{ currentPathLabel }}</small>
    </div>

    <button
      type="button"
      class="studio-shell-topbar__command"
      :aria-label="commandLabel"
      :title="commandLabel"
      @click="$emit('open-command-palette')"
    >
      <Command class="studio-shell-topbar__command-icon" aria-hidden="true" />
      <span>{{ commandLabel }}</span>
      <kbd>Ctrl K</kbd>
    </button>

    <div class="studio-shell-topbar__controls">
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
import { Command, Monitor, Moon, Sun, Menu } from '@lucide/vue';
import type { Locale } from '../shared/locale';
import type { ThemeMode } from '../shared/theme';

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

defineProps<{
  isMobile: boolean;
  mobileNavOpen: boolean;
  currentTitle: string;
  currentGroupTitle: string;
  currentPathLabel: string;
  commandLabel: string;
  mobileNavLabel: string;
  themeSwitchLabel: string;
  localeSwitchLabel: string;
  themeMode: ThemeMode;
  themeOptions: ThemeOption[];
  locale: Locale;
  localeOptions: LocaleOption[];
}>();

defineEmits<{
  (event: 'toggle-mobile-nav'): void;
  (event: 'open-command-palette'): void;
  (event: 'set-theme-mode', value: ThemeMode): void;
  (event: 'set-locale', value: Locale): void;
}>();

const resolveThemeIcon = (value: ThemeMode) => {
  if (value === 'light') return Sun;
  if (value === 'dark') return Moon;
  return Monitor;
};
</script>
