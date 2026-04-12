<template>
  <TooltipProvider :delay-duration="140" :skip-delay-duration="80" :disable-hoverable-content="true">
    <div
      class="app-container"
      :class="{ mobile: isMobile, 'sidebar-collapsed': !isMobile && sidebarCollapsed, 'chat-shell': isChatSurface }"
    >
      <div class="ambient-orb ambient-orb-a" aria-hidden="true" :style="ambientStyles[0]"></div>
      <div class="ambient-orb ambient-orb-b" aria-hidden="true" :style="ambientStyles[1]"></div>
      <div class="ambient-orb ambient-orb-c" aria-hidden="true" :style="ambientStyles[2]"></div>

      <DialogRoot v-if="isMobile" v-model:open="mobileSidebarOpen">
        <DialogTrigger as-child>
          <button
            v-if="!mobileSidebarOpen"
            type="button"
            class="mobile-nav-trigger"
            :aria-label="text('打开导航', 'Open navigation')"
            :title="text('打开导航', 'Open navigation')"
          >
            ☰
          </button>
        </DialogTrigger>
        <DialogPortal>
          <DialogOverlay class="mobile-sidebar-mask" />
          <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
            <aside class="sidebar sidebar-rail mobile mobile-open">
              <StudioSidebarRail
                :is-mobile="true"
                :sidebar-collapsed="false"
                :subtitle="text('管理控制台', 'Management Console')"
                :theme-switch-label="text('主题模式', 'Theme mode')"
                :locale-switch-label="text('语言模式', 'Language mode')"
                :docs-label="text('官方文档', 'Official docs')"
                :toggle-title="text('折叠侧边栏', 'Collapse sidebar')"
                :nav-groups="navGroups"
                :theme-mode="themeMode"
                :theme-options="themeOptions"
                :locale="locale"
                :locale-options="localeOptions"
                :version-info-class="versionInfoClass"
                :version-title="versionTitle"
                :version-label="versionLabel"
                :version-meta-label="versionMetaLabel"
                :version-action-class="versionActionClass"
                :version-action-title="versionActionTitle"
                :version-action-label="versionActionLabel"
                :version-status-dot-class="versionStatusDotClass"
                :version-action-busy="versionActionBusy"
                @navigate="handleSidebarNavigate"
                @toggle-sidebar="toggleSidebar"
                @set-theme-mode="setThemeMode"
                @set-locale="setLocale"
                @upgrade-action="handleStudioUpgradeAction"
              />
            </aside>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <aside
        v-else
        class="sidebar sidebar-rail"
        :class="{ collapsed: sidebarCollapsed }"
      >
        <StudioSidebarRail
          :is-mobile="false"
          :sidebar-collapsed="sidebarCollapsed"
          :subtitle="text('管理控制台', 'Management Console')"
          :theme-switch-label="text('主题模式', 'Theme mode')"
          :locale-switch-label="text('语言模式', 'Language mode')"
          :docs-label="text('官方文档', 'Official docs')"
          :toggle-title="sidebarCollapsed ? text('展开侧边栏', 'Expand sidebar') : text('折叠侧边栏', 'Collapse sidebar')"
          :nav-groups="navGroups"
          :theme-mode="themeMode"
          :theme-options="themeOptions"
          :locale="locale"
          :locale-options="localeOptions"
          :version-info-class="versionInfoClass"
          :version-title="versionTitle"
          :version-label="versionLabel"
          :version-meta-label="versionMetaLabel"
          :version-action-class="versionActionClass"
          :version-action-title="versionActionTitle"
          :version-action-label="versionActionLabel"
          :version-status-dot-class="versionStatusDotClass"
          :version-action-busy="versionActionBusy"
          @navigate="handleSidebarNavigate"
          @toggle-sidebar="toggleSidebar"
          @set-theme-mode="setThemeMode"
          @set-locale="setLocale"
          @upgrade-action="handleStudioUpgradeAction"
        />
      </aside>

      <main class="main-content shell-main" :class="{ 'chat-surface-route': isChatSurface, 'shell-main-chat': isChatSurface }">
        <div class="shell-layout" :class="{ 'shell-layout-chat': isChatSurface }">
          <section class="shell-main-stage" :class="{ 'shell-main-stage-chat': isChatSurface }">
            <RouterView v-slot="{ Component }">
              <section
                class="shell-route-stage"
                :class="{ 'shell-route-stage-chat': isChatSurface }"
              >
                <component :is="Component" />
              </section>
            </RouterView>
          </section>
          <StudioContextPanel v-if="!isChatSurface && !isMobile" class="shell-context-panel" />
        </div>
      </main>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTrigger, TooltipProvider } from 'reka-ui';
import { RouterView, useRoute } from 'vue-router';
import StudioContextPanel from './components/StudioContextPanel.vue';
import StudioSidebarRail from './components/StudioSidebarRail.vue';
import { useShellChrome } from './features/shell/use-shell-chrome';
import { useShellNavigation } from './features/shell/use-shell-navigation';
import { useShellRelease } from './features/shell/use-shell-release';
import { useLocalePreference, type Locale } from './shared/locale';
import { useThemePreference, type ThemeMode } from './shared/theme';

const route = useRoute();
const buildVersion = typeof import.meta.env.STUDIO_APP_VERSION === 'string'
  ? import.meta.env.STUDIO_APP_VERSION
  : '';
const {
  sidebarCollapsed,
  isMobile,
  mobileSidebarOpen,
  toggleSidebar,
  handleSidebarNavigate,
} = useShellChrome();
const {
  versionInfoClass,
  versionTitle,
  versionLabel,
  versionMetaLabel,
  versionActionClass,
  versionActionTitle,
  versionActionLabel,
  versionStatusDotClass,
  versionActionBusy,
  handleStudioUpgradeAction,
} = useShellRelease(buildVersion);
const ambientStyles = [
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
];
const { locale, setLocale, text } = useLocalePreference();
const { navGroups } = useShellNavigation();
const isChatSurface = computed(() => route.path === '/chat' || route.path.startsWith('/chat/'));
const { themeMode, setThemeMode } = useThemePreference();
const themeOptions: Array<{ value: ThemeMode; icon: string; label: string; shortLabel: string }> = [
  { value: 'light', icon: '☀️', label: text('浅色模式', 'Light theme'), shortLabel: text('浅色', 'Light') },
  { value: 'dark', icon: '🌙', label: text('深色模式', 'Dark theme'), shortLabel: text('深色', 'Dark') },
  { value: 'system', icon: '🖥️', label: text('跟随系统', 'Follow system'), shortLabel: text('系统', 'System') },
];
const localeOptions: Array<{ value: Locale; icon: string; label: string; shortLabel: string }> = [
  { value: 'zh', icon: '中', label: '中文', shortLabel: '中' },
  { value: 'en', icon: 'EN', label: 'English', shortLabel: 'EN' },
];
</script>
