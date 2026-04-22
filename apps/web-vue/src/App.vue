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

      <main
        class="main-content shell-main"
        :class="{
          'chat-surface-route': isChatSurface,
          'shell-main-chat': isChatSurface,
          'terminal-surface-route': isTerminalSurface,
        }"
      >
        <button
          v-if="isMobile && isChatSurface && !mobileSidebarOpen"
          type="button"
          class="mobile-nav-trigger"
          :aria-label="text('打开导航', 'Open navigation')"
          :title="text('打开导航', 'Open navigation')"
          @click="toggleSidebar"
        >
          ☰
        </button>

        <div class="shell-layout" :class="{ 'shell-layout-chat': isChatSurface }">
          <section class="shell-main-stage">
            <StudioShellTopbar
              v-if="!isChatSurface"
              :is-mobile="isMobile"
              :mobile-nav-open="mobileSidebarOpen"
              :search-label="text('搜索与命令', 'Search and commands')"
              :search-shortcut-label="text('命令面板', 'Command palette')"
              :risk-summary-label="text('风险', 'Risk')"
              :risk-summary-value="riskSummaryValue"
              :pending-summary-label="text('待办', 'Pending')"
              :pending-summary-value="pendingSummaryValue"
              :mobile-nav-label="text('打开导航', 'Open navigation')"
              :show-context-toggle="canOpenContextPanel"
              :context-panel-open="contextPanelOpen"
              :context-toggle-label="contextToggleLabel"
              :theme-switch-label="text('主题模式', 'Theme mode')"
              :locale-switch-label="text('语言模式', 'Language mode')"
              :theme-mode="themeMode"
              :theme-options="themeOptions"
              :locale="locale"
              :locale-options="localeOptions"
              @toggle-mobile-nav="toggleSidebar"
              @toggle-context-panel="toggleContextPanel"
              @set-theme-mode="setThemeMode"
              @set-locale="setLocale"
            />

            <RouterView v-slot="{ Component }">
              <section
                class="shell-route-stage"
                :theme-mode="themeMode"
                :class="{ 'shell-route-stage-chat': isChatSurface }"
              >
                <component :is="Component" />
              </section>
            </RouterView>
          </section>
        </div>
      </main>

      <StudioContextPanel
        v-if="contextPanelEnabled"
        class="shell-context-panel"
        v-model:open="contextPanelOpen"
        :title="contextPanelTitle"
        :description="contextPanelDescription"
        :alerts-title="text('提醒', 'Alerts')"
        :pending-title="text('下一步', 'Next steps')"
        :alerts="topStatus"
        :pending-items="contextPendingItems"
      />

      <ConfirmDialog />
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, TooltipProvider } from 'reka-ui';
import { RouterView, useRoute } from 'vue-router';
import ConfirmDialog from './components/ConfirmDialog.vue';
import StudioContextPanel from './components/StudioContextPanel.vue';
import StudioShellTopbar from './components/StudioShellTopbar.vue';
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

const ambientStyles = [
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
];

const { locale, setLocale, text } = useLocalePreference();
const {
  navGroups,
  contextPanelTitle,
  contextPanelDescription,
  topStatus,
  contextPendingItems,
  riskSummaryValue,
  pendingSummaryValue,
} = useShellNavigation();

const contextPanelMode = computed<'default' | 'chat-inspector' | 'disabled'>(() => {
  const matched = [...route.matched].reverse();
  const metaMode = matched.find((record) => typeof record.meta?.contextPanel === 'string')?.meta?.contextPanel;
  return metaMode === 'chat-inspector' || metaMode === 'disabled' ? metaMode : 'default';
});
const isChatSurface = computed(() => contextPanelMode.value === 'chat-inspector');
const isTerminalSurface = computed(() => route.path === '/terminal' || route.path.startsWith('/terminal/'));
const contextPanelEnabled = computed(() => contextPanelMode.value === 'default');

const {
  sidebarCollapsed,
  isMobile,
  mobileSidebarOpen,
  contextPanelOpen,
  canOpenContextPanel,
  toggleSidebar,
  handleSidebarNavigate,
  closeContextPanel,
  toggleContextPanel,
} = useShellChrome(contextPanelEnabled);

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

const contextToggleLabel = computed(() => (
  contextPanelOpen.value
    ? text('关闭上下文', 'Hide context')
    : text('打开上下文', 'Show context')
));

watch(() => route.fullPath, () => {
  closeContextPanel();
});

const { themeMode, setThemeMode } = useThemePreference();
const themeOptions = computed<Array<{ value: ThemeMode; icon: string; label: string; shortLabel: string }>>(() => [
  { value: 'light', icon: '☀️', label: text('浅色模式', 'Light theme'), shortLabel: text('浅色', 'Light') },
  { value: 'dark', icon: '🌙', label: text('深色模式', 'Dark theme'), shortLabel: text('深色', 'Dark') },
  { value: 'system', icon: '🖥️', label: text('跟随系统', 'Follow system'), shortLabel: text('系统', 'System') },
]);
const localeOptions: Array<{ value: Locale; icon: string; label: string; shortLabel: string }> = [
  { value: 'zh', icon: '中', label: '中文', shortLabel: '中' },
  { value: 'en', icon: 'EN', label: 'English', shortLabel: 'EN' },
];
</script>
