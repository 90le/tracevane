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

      <main class="main-content shell-main" :class="{ 'chat-surface-route': isChatSurface, 'shell-main-chat': isChatSurface }">
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
        <div class="shell-main-grid" :class="{ 'shell-main-grid-chat': isChatSurface }">
          <section class="shell-center-stage">
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
              :theme-switch-label="text('主题模式', 'Theme mode')"
              :locale-switch-label="text('语言模式', 'Language mode')"
              :theme-mode="themeMode"
              :theme-options="themeOptions"
              :locale="locale"
              :locale-options="localeOptions"
              @toggle-mobile-nav="toggleSidebar"
              @set-theme-mode="setThemeMode"
              @set-locale="setLocale"
            />
            <RouterView v-slot="{ Component }">
              <section
                class="shell-route-stage"
                :class="{ 'shell-route-stage-chat': isChatSurface, }"
              >
                <component :is="Component" />
              </section>
            </RouterView>
          </section>
          <StudioShellContextRail
            v-if="!isChatSurface"
            :title="text('上下文', 'Context')"
            :alerts-title="text('提醒', 'Alerts')"
            :pending-title="text('待处理', 'Pending Work')"
            :alerts="topStatus"
            :pending-items="contextPendingItems"
          />
        </div>
      </main>
      <ConfirmDialog />
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, TooltipProvider } from 'reka-ui';
import { RouterView, useRoute } from 'vue-router';
import ConfirmDialog from './components/ConfirmDialog.vue';
import StudioShellContextRail from './components/StudioShellContextRail.vue';
import StudioShellTopbar from './components/StudioShellTopbar.vue';
import StudioSidebarRail from './components/StudioSidebarRail.vue';
import { useConfirmDialog } from './composables/useConfirmDialog';
import { useUiContent } from './data/mock';
import { useLocalePreference, type Locale } from './shared/locale';
import { useThemePreference, type ThemeMode } from './shared/theme';
import {
  fetchStudioRelease,
  fetchStudioUpgradeStatus,
  startStudioUpgrade,
} from './features/system/api';
import type {
  SystemStudioReleasePayload,
  SystemStudioUpgradeStatusPayload,
} from '../../../types/system';

const route = useRoute();
const buildVersion = typeof import.meta.env.STUDIO_APP_VERSION === 'string'
  ? import.meta.env.STUDIO_APP_VERSION
  : '';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'openclaw-studio.sidebar-collapsed';
const sidebarCollapsed = ref(false);
const isMobile = ref(false);
const mobileSidebarOpen = ref(false);
const studioRelease = ref<SystemStudioReleasePayload | null>(null);
const studioUpgradeStatus = ref<SystemStudioUpgradeStatusPayload | null>(null);
const studioUpgradeBusy = ref(false);
const studioReleaseCheckBusy = ref(false);
const ambientStyles = [
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
  ref<Record<string, string>>({}),
];
const { locale, setLocale, text } = useLocalePreference();
const { confirm } = useConfirmDialog();
const { navGroups, topStatus } = useUiContent();
const isChatSurface = computed(() => route.path === '/chat' || route.path.startsWith('/chat/'));
const riskSummaryValue = computed(() => text('2 项', '2 items'));
const pendingSummaryValue = computed(() => text('5 项', '5 items'));
const contextPendingItems = computed(() => [
  {
    id: 'operate-shell',
    title: text('Operate 语义入口', 'Operate semantic entry'),
    detail: text('通过 /agents 承载 Operate 分组入口。', 'Operate group entry is mapped to /agents.'),
  },
  {
    id: 'chat-shell',
    title: text('Chat 壳层保留', 'Chat shell continuity'),
    detail: text('Chat 路由继续保留现有工作台行为。', 'Chat routes keep current workbench behavior.'),
  },
  {
    id: 'mobile-nav',
    title: text('移动端导航守护', 'Mobile nav guardrail'),
    detail: text('移动端侧栏抽屉交互保持可用。', 'Mobile sidebar drawer interaction remains available.'),
  },
]);
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
let releaseRefreshTimer: number | null = null;
let upgradePollTimer: number | null = null;

const versionUpgradeFailed = computed(() => studioUpgradeStatus.value?.status === 'failed');
const versionIsLatest = computed(() => (
  !!studioRelease.value
  && !studioRelease.value.updateAvailable
  && !studioUpgradeStatus.value?.running
  && !versionUpgradeFailed.value
));
const versionActionBusy = computed(() => studioUpgradeBusy.value || studioReleaseCheckBusy.value);

const versionLabel = computed(() => {
  const version = studioRelease.value?.currentVersion || buildVersion;
  return version ? `v${version}` : 'v--';
});

const versionTitle = computed(() => {
  const current = studioRelease.value?.currentVersion || buildVersion || '--';
  const latest = studioRelease.value?.latestVersion || '--';
  if (studioUpgradeStatus.value?.running) {
    return text(`当前版本：v${current}，升级任务运行中`, `Current version: v${current}, upgrade task is running`);
  }
  if (studioReleaseCheckBusy.value) {
    return text(`当前版本：v${current}，正在检查更新`, `Current version: v${current}, checking for updates`);
  }
  if (versionUpgradeFailed.value) {
    return text(`当前版本：v${current}，升级失败，可重试`, `Current version: v${current}, upgrade failed and can be retried`);
  }
  if (studioRelease.value?.updateAvailable) {
    return text(`当前版本：v${current}，可升级到 v${latest}`, `Current version: v${current}, update available: v${latest}`);
  }
  if (versionIsLatest.value) {
    return text(`当前版本：v${current}，已是最新版本`, `Current version: v${current}, already up to date`);
  }
  return text(`当前版本：v${current}`, `Current version: v${current}`);
});

const versionActionTitle = computed(() => {
  if (studioReleaseCheckBusy.value) {
    return text('正在检查更新', 'Checking for updates');
  }
  if (studioUpgradeStatus.value?.running) {
    return text('升级任务运行中，点击刷新状态', 'Upgrade in progress, click to refresh status');
  }
  if (versionUpgradeFailed.value) {
    return text('升级失败，点击重试', 'Upgrade failed, click to retry');
  }
  if (studioRelease.value?.updateAvailable) {
    return text('检测到新版本，点击一键升级', 'Update available, click to upgrade');
  }
  if (versionIsLatest.value) {
    return text('当前已是最新版本，点击重新检查', 'Already up to date, click to check again');
  }
  return text('检查更新', 'Check updates');
});

const versionMetaLabel = computed(() => {
  if (studioReleaseCheckBusy.value) return text('检查中', 'Checking');
  if (studioUpgradeStatus.value?.running) return text('升级中', 'Running');
  if (versionUpgradeFailed.value) return text('失败', 'Failed');
  if (studioRelease.value?.updateAvailable && studioRelease.value.latestVersion) {
    return `→ v${studioRelease.value.latestVersion}`;
  }
  if (versionIsLatest.value) return text('已最新', 'Latest');
  return '';
});

const versionInfoClass = computed(() => ({
  'is-checking': studioReleaseCheckBusy.value,
  'is-running': studioUpgradeStatus.value?.running,
  'is-warning': versionUpgradeFailed.value,
  'is-latest': versionIsLatest.value,
  'is-upgrade-ready': !!studioRelease.value?.updateAvailable,
}));

const versionActionLabel = computed(() => {
  if (studioReleaseCheckBusy.value) {
    return text('检查中', 'Checking');
  }
  if (studioUpgradeStatus.value?.running) {
    return text('刷新', 'Refresh');
  }
  if (versionUpgradeFailed.value) {
    return text('重试', 'Retry');
  }
  if (studioRelease.value?.updateAvailable) {
    return text('升级', 'Upgrade');
  }
  if (versionIsLatest.value) {
    return text('已最新', 'Latest');
  }
  return text('检查', 'Check');
});

const versionActionClass = computed(() => ({
  'is-checking': studioReleaseCheckBusy.value,
  'is-running': studioUpgradeStatus.value?.running,
  'is-warning': versionUpgradeFailed.value,
  'is-latest': versionIsLatest.value,
  'is-upgrade-ready': !!studioRelease.value?.updateAvailable,
}));

const versionStatusDotClass = computed(() => {
  if (studioReleaseCheckBusy.value) return 'is-accent';
  if (studioUpgradeStatus.value?.running) return 'is-accent';
  if (versionUpgradeFailed.value) return 'is-warning';
  if (studioRelease.value?.updateAvailable) return 'is-success';
  if (versionIsLatest.value) return 'is-latest';
  return '';
});

async function refreshStudioReleaseState(): Promise<void> {
  try {
    studioRelease.value = await fetchStudioRelease();
  } catch {
    // keep UI usable when release endpoint is unavailable
  }
}

async function refreshStudioUpgradeState(): Promise<void> {
  try {
    studioUpgradeStatus.value = await fetchStudioUpgradeStatus();
  } catch {
    // keep UI usable when upgrade endpoint is unavailable
  }
}

async function handleStudioUpgradeAction(): Promise<void> {
  if (versionActionBusy.value) {
    return;
  }
  if (studioUpgradeStatus.value?.running) {
    await refreshStudioUpgradeState();
    return;
  }
  if (!studioRelease.value?.updateAvailable) {
    studioReleaseCheckBusy.value = true;
    try {
      await refreshStudioReleaseState();
      await refreshStudioUpgradeState();
    } finally {
      studioReleaseCheckBusy.value = false;
    }
    return;
  }

  const target = studioRelease.value.latestVersion || '';
  const confirmed = await confirm({
    title: text('确认升级 Studio', 'Confirm Studio upgrade'),
    message: text(
      `确认升级到 v${target}？升级期间 Gateway 可能会重启。`,
      `Upgrade to v${target}? Gateway may restart during upgrade.`,
    ),
    confirmText: text('确认升级', 'Upgrade now'),
    cancelText: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!confirmed) {
    return;
  }

  studioUpgradeBusy.value = true;
  try {
    const response = await startStudioUpgrade({
      version: target || undefined,
    });
    studioUpgradeStatus.value = response.status;
    if (typeof window !== 'undefined') {
      const message = response.ok
        ? text('升级任务已启动，可在系统页查看日志。', 'Upgrade started. You can monitor logs in System page.')
        : text('升级任务启动失败，请查看系统页日志。', 'Failed to start upgrade. Check logs in System page.');
      window.alert(message);
    }
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.alert(error instanceof Error ? error.message : text('升级请求失败。', 'Upgrade request failed.'));
    }
  } finally {
    studioUpgradeBusy.value = false;
    await refreshStudioReleaseState();
    await refreshStudioUpgradeState();
  }
}

function updateViewportState() {
  if (typeof window === 'undefined') return;
  const mobile = window.innerWidth <= 920;
  isMobile.value = mobile;
  if (!mobile) mobileSidebarOpen.value = false;
}

function syncSidebarPreference() {
  if (typeof window === 'undefined') return;
  const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
  sidebarCollapsed.value = saved === 'true';
}

function persistSidebarPreference(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value;
    return;
  }
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function handleSidebarNavigate() {
  if (isMobile.value) mobileSidebarOpen.value = false;
}

onMounted(() => {
  updateViewportState();
  syncSidebarPreference();
  void refreshStudioReleaseState();
  void refreshStudioUpgradeState();
  if (typeof window !== 'undefined') {
    releaseRefreshTimer = window.setInterval(() => {
      void refreshStudioReleaseState();
    }, 300_000);
    upgradePollTimer = window.setInterval(() => {
      void refreshStudioUpgradeState();
    }, 6_000);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateViewportState, { passive: true });
  }
});

watch(sidebarCollapsed, (value) => {
  if (isMobile.value) return;
  persistSidebarPreference(value);
});

onUnmounted(() => {
  if (releaseRefreshTimer !== null) {
    window.clearInterval(releaseRefreshTimer);
    releaseRefreshTimer = null;
  }
  if (upgradePollTimer !== null) {
    window.clearInterval(upgradePollTimer);
    upgradePollTimer = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateViewportState);
  }
});
</script>
