<template>
  <UApp>
  <TooltipProvider :delay-duration="140" :skip-delay-duration="80" :disable-hoverable-content="true">
    <div
      class="app-container"
      :class="{ mobile: isMobile, 'sidebar-collapsed': !isMobile && sidebarCollapsed, 'chat-shell': isChatSurface, 'files-shell': isFilesSurface }"
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
                :docs-label="text('官方文档', 'Official docs')"
                :toggle-title="text('折叠侧边栏', 'Collapse sidebar')"
                :nav-groups="navGroups"
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
          :docs-label="text('官方文档', 'Official docs')"
          :toggle-title="sidebarCollapsed ? text('展开侧边栏', 'Expand sidebar') : text('折叠侧边栏', 'Collapse sidebar')"
          :nav-groups="navGroups"
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
          @upgrade-action="handleStudioUpgradeAction"
        />
      </aside>

      <main
        class="main-content shell-main"
        :class="{
          'chat-surface-route': isChatSurface,
          'shell-main-chat': isChatSurface,
          'terminal-surface-route': isTerminalSurface,
          'file-surface-route': isFilesSurface,
          'standard-scroll-route': !isChatSurface && !isTerminalSurface && !isFilesSurface,
        }"
      >
        <button
          v-if="isMobile && (isChatSurface || isFilesSurface) && !mobileSidebarOpen"
          type="button"
          class="mobile-nav-trigger"
          :aria-label="text('打开导航', 'Open navigation')"
          :title="text('打开导航', 'Open navigation')"
          @click="toggleSidebar"
        >
          <Menu class="mobile-nav-trigger__icon" aria-hidden="true" />
        </button>

        <div class="shell-layout" :class="{ 'shell-layout-chat': isChatSurface, 'shell-layout-files': isFilesSurface }">
          <section class="shell-main-stage">
            <StudioShellTopbar
              v-if="!isChatSurface && !isFilesSurface"
              :is-mobile="isMobile"
              :mobile-nav-open="mobileSidebarOpen"
              :search-label="text('搜索页面与命令', 'Search pages and commands')"
              search-shortcut-label="Ctrl K"
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
              @open-command-palette="openCommandPalette"
              @set-theme-mode="setThemeMode"
              @set-locale="setLocale"
            />

            <RouterView v-slot="{ Component, route: routedView }">
              <section
                class="shell-route-stage"
                :theme-mode="themeMode"
                :class="[
                  routeSurfaceClass,
                  { 'shell-route-stage-chat': isChatSurface, 'shell-route-stage-files': isFilesSurface },
                ]"
              >
                <KeepAlive v-if="Component && shouldKeepRouteAlive(routedView)" :max="16">
                  <component :is="Component" />
                </KeepAlive>
                <component v-else-if="Component" :is="Component" />
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

      <StudioCommandPalette
        v-model:open="commandPaletteOpen"
        :nav-groups="navGroups"
        :context-items="contextPendingItems"
      />
    </div>
  </TooltipProvider>
  </UApp>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Menu } from '@lucide/vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, TooltipProvider } from 'reka-ui';
import { RouterView, useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import ConfirmDialog from './components/ConfirmDialog.vue';
import StudioCommandPalette from './components/StudioCommandPalette.vue';
import StudioContextPanel from './components/StudioContextPanel.vue';
import StudioShellTopbar from './components/StudioShellTopbar.vue';
import StudioSidebarRail from './components/StudioSidebarRail.vue';
import { preloadNonChatShellRouteChunks } from './features/shell/route-manifest';
import { useShellChrome } from './features/shell/use-shell-chrome';
import { useShellNavigation } from './features/shell/use-shell-navigation';
import { useShellRelease } from './features/shell/use-shell-release';
import { useLocalePreference, type Locale } from './shared/locale';
import { useThemePreference, type ThemeMode } from './shared/theme';

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
  deviceMemory?: number;
};

const route = useRoute();
const buildVersion = typeof import.meta.env.STUDIO_APP_VERSION === 'string'
  ? import.meta.env.STUDIO_APP_VERSION
  : '';

const ambientStyles = [
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
];
const ambientPointer = { x: 0, y: 0, frame: 0 };

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
const isFilesSurface = computed(() => route.path === '/files' || route.path.startsWith('/files/'));
const contextPanelEnabled = computed(() => contextPanelMode.value === 'default');
const routeSurfaceClass = computed(() => {
  const firstSegment = route.path.split('/').filter(Boolean)[0] || 'dashboard';
  const normalized = firstSegment.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `route-surface-${normalized}`;
});

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
const commandPaletteOpen = ref(false);

const openCommandPalette = () => {
  commandPaletteOpen.value = true;
};

const shouldKeepRouteAlive = (targetRoute: RouteLocationNormalizedLoaded) => (
  targetRoute.meta.keepAlive !== false
);

const canPreloadRouteChunks = () => {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as NavigatorWithConnection).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$/i.test(connection.effectiveType)) return false;
  return true;
};

const canPreloadExtendedRouteChunks = () => {
  if (!canPreloadRouteChunks()) return false;
  const navigatorInfo = navigator as NavigatorWithConnection;
  if (typeof navigatorInfo.deviceMemory === 'number' && navigatorInfo.deviceMemory < 4) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;
  return true;
};

const visualMotionEnabled = () => {
  if (typeof window === 'undefined') return false;
  if (isMobile.value) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const updateAmbientVisuals = (x: number, y: number) => {
  if (!visualMotionEnabled()) return;
  const { innerWidth, innerHeight } = window;
  const centeredX = innerWidth ? (x / innerWidth - 0.5) : 0;
  const centeredY = innerHeight ? (y / innerHeight - 0.5) : 0;
  ambientStyles[0].value = { transform: `translate3d(${centeredX * 42}px, ${centeredY * 32}px, 0)` };
  ambientStyles[1].value = { transform: `translate3d(${-centeredX * 34}px, ${centeredY * 24}px, 0)` };
  ambientStyles[2].value = { transform: `translate3d(${centeredX * 22}px, ${-centeredY * 28}px, 0)` };
};

const handlePointerMove = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse') return;
  ambientPointer.x = event.clientX;
  ambientPointer.y = event.clientY;
  if (ambientPointer.frame) return;
  ambientPointer.frame = window.requestAnimationFrame(() => {
    ambientPointer.frame = 0;
    updateAmbientVisuals(ambientPointer.x, ambientPointer.y);
  });
};

const scheduleNonChatRoutePreload = () => {
  if (typeof window === 'undefined' || !canPreloadRouteChunks()) return;

  const scheduleIdleTask = (callback: () => void, timeout: number, fallbackDelay: number) => {
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(callback, { timeout });
      return;
    }
    window.setTimeout(callback, fallbackDelay);
  };

  scheduleIdleTask(() => {
    void preloadNonChatShellRouteChunks('core');
  }, 3_500, 2_500);

  if (!canPreloadExtendedRouteChunks()) return;
  window.setTimeout(() => {
    scheduleIdleTask(() => {
      void preloadNonChatShellRouteChunks('extended');
    }, 8_000, 4_000);
  }, 10_000);
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'k') return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable="true"], .terminal-workspace-shell, .xterm')) {
    return;
  }
  event.preventDefault();
  openCommandPalette();
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  scheduleNonChatRoutePreload();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('pointermove', handlePointerMove);
  if (ambientPointer.frame) window.cancelAnimationFrame(ambientPointer.frame);
});

watch(() => route.fullPath, () => {
  closeContextPanel();
  commandPaletteOpen.value = false;
});

const { themeMode, setThemeMode } = useThemePreference();
const themeOptions = computed<Array<{ value: ThemeMode; label: string; shortLabel: string }>>(() => [
  { value: 'light', label: text('浅色模式', 'Light theme'), shortLabel: text('浅色', 'Light') },
  { value: 'dark', label: text('深色模式', 'Dark theme'), shortLabel: text('深色', 'Dark') },
  { value: 'system', label: text('跟随系统', 'Follow system'), shortLabel: text('系统', 'System') },
]);
const localeOptions: Array<{ value: Locale; icon: string; label: string; shortLabel: string }> = [
  { value: 'zh', icon: '中', label: '中文', shortLabel: '中' },
  { value: 'en', icon: 'EN', label: 'English', shortLabel: 'EN' },
];
</script>
