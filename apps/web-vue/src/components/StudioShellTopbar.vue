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
      ☰
    </button>

    <button
      type="button"
      class="studio-shell-topbar__search"
      :title="searchLabel"
      :aria-label="searchLabel"
    >
      <span class="studio-shell-topbar__search-label">{{ searchLabel }}</span>
      <span class="studio-shell-topbar__search-shortcut">{{ searchShortcutLabel }}</span>
    </button>

    <div class="studio-shell-topbar__summary" aria-live="polite">
      <span class="studio-shell-topbar__badge">
        {{ riskSummaryLabel }} · {{ riskSummaryValue }}
      </span>
      <span class="studio-shell-topbar__badge">
        {{ pendingSummaryLabel }} · {{ pendingSummaryValue }}
      </span>
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
    </div>

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
          <span class="theme-switch-emoji" aria-hidden="true">{{ option.icon }}</span>
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
import type { Locale } from '../shared/locale';
import type { ThemeMode } from '../shared/theme';

type ThemeOption = {
  value: ThemeMode;
  icon: string;
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
  searchLabel: string;
  searchShortcutLabel: string;
  riskSummaryLabel: string;
  riskSummaryValue: string;
  pendingSummaryLabel: string;
  pendingSummaryValue: string;
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
  (event: 'set-theme-mode', value: ThemeMode): void;
  (event: 'set-locale', value: Locale): void;
}>();

</script>
