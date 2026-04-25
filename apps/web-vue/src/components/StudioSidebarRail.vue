<template>
  <div class="sidebar-header">
    <TooltipRoot :disabled="!showRailTooltips">
      <TooltipTrigger as-child>
        <RouterLink to="/dashboard" class="logo" @click="$emit('navigate')">
          <span class="logo-icon">
            <LogoMark />
          </span>
          <div class="logo-text">
            <span class="logo-title">OpenClaw</span>
            <span class="logo-subtitle">{{ subtitle }}</span>
          </div>
        </RouterLink>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="sidebar-rail-tooltip"
          side="right"
          :side-offset="12"
        >
          OpenClaw
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>

    <TooltipRoot v-if="!isMobile">
      <TooltipTrigger as-child>
        <button
          type="button"
          class="sidebar-toggle"
          @click="$emit('toggle-sidebar')"
          :title="toggleTitle"
          :aria-label="toggleTitle"
          :aria-expanded="String(!sidebarCollapsed)"
        >
          <span class="toggle-icon">{{ sidebarCollapsed ? '›' : '‹' }}</span>
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="sidebar-rail-tooltip"
          side="right"
          :side-offset="12"
        >
          {{ toggleTitle }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </div>

  <nav class="sidebar-nav" @click="$emit('navigate')">
    <div v-for="group in navGroups" :key="group.title" class="sidebar-nav-group">
      <div class="sidebar-section-title">{{ group.title }}</div>

      <TooltipRoot
        v-for="item in group.items"
        :key="item.to"
        :disabled="!showRailTooltips"
      >
        <TooltipTrigger as-child>
          <RouterLink
            :to="item.to"
            class="nav-link"
            active-class="active"
          >
            <span class="icon">
              <SidebarIcon :name="item.icon" />
            </span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            class="sidebar-rail-tooltip"
            side="right"
            :side-offset="12"
          >
            {{ item.label }}
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </div>
  </nav>

  <div class="sidebar-footer">
    <div class="sidebar-utility-cluster">
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
      <div class="theme-switch sidebar-locale-switch" role="group" :aria-label="localeSwitchLabel">
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
    <div class="connection-status-bar">
      <a
        class="docs-link"
        href="https://studio.90le.cn"
        target="_blank"
        rel="noreferrer"
        :title="docsLabel"
        :aria-label="docsLabel"
      >
        <span class="docs-link-icon" aria-hidden="true">↗</span>
        <span>{{ docsLabel }}</span>
      </a>
      <div class="sidebar-footer-main">
        <div
          class="version-info"
          :class="versionInfoClass"
          :title="versionTitle"
          :aria-label="versionTitle"
        >
          <span class="version-info-current">{{ versionLabel }}</span>
          <span v-if="versionMetaLabel" class="version-info-meta">{{ versionMetaLabel }}</span>
        </div>

        <TooltipRoot :disabled="!showRailTooltips">
          <TooltipTrigger as-child>
            <button
              type="button"
              class="gateway-status"
              :class="versionActionClass"
              :title="versionActionTitle"
              :aria-label="versionActionTitle"
              :disabled="versionActionBusy"
              @click="$emit('upgrade-action')"
            >
              <span class="status-dot" :class="versionStatusDotClass"></span>
              <span class="gateway-status-label">{{ versionActionLabel }}</span>
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              class="sidebar-rail-tooltip"
              side="right"
              :side-offset="12"
            >
              {{ versionActionTitle }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui';
import type { Locale } from '../shared/locale';
import type { ThemeMode } from '../shared/theme';
import LogoMark from './LogoMark.vue';
import SidebarIcon from './SidebarIcon.vue';

type SidebarIconName = 'dashboard' | 'agents' | 'chat' | 'channels' | 'cron' | 'dreaming' | 'skills' | 'files' | 'plugins' | 'terminal' | 'config' | 'system';

type NavGroup = {
  title: string;
  items: Array<{
    to: string;
    label: string;
    icon: SidebarIconName;
  }>;
};

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

const props = defineProps<{
  isMobile: boolean;
  sidebarCollapsed: boolean;
  subtitle: string;
  themeSwitchLabel: string;
  localeSwitchLabel: string;
  docsLabel: string;
  toggleTitle: string;
  navGroups: NavGroup[];
  themeMode: ThemeMode;
  themeOptions: ThemeOption[];
  locale: Locale;
  localeOptions: LocaleOption[];
  versionInfoClass: Record<string, boolean>;
  versionTitle: string;
  versionLabel: string;
  versionMetaLabel: string;
  versionActionClass: Record<string, boolean>;
  versionActionTitle: string;
  versionActionLabel: string;
  versionStatusDotClass: string;
  versionActionBusy: boolean;
}>();

defineEmits<{
  (event: 'toggle-sidebar'): void;
  (event: 'navigate'): void;
  (event: 'set-theme-mode', value: ThemeMode): void;
  (event: 'set-locale', value: Locale): void;
  (event: 'upgrade-action'): void;
}>();

const showRailTooltips = computed(() => !props.isMobile && props.sidebarCollapsed);
</script>
