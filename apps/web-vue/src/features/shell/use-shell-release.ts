import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  fetchStudioRelease,
  fetchStudioUpgradeStatus,
  startStudioUpgrade,
} from "../system/api";
import { useLocalePreference } from "../../shared/locale";
import { useConfirmDialog } from "../../composables/useConfirmDialog";
import type {
  SystemStudioReleasePayload,
  SystemStudioUpgradeStatusPayload,
} from "../../../../../types/system";

const RELEASE_REFRESH_INTERVAL_MS = 300_000;
const UPGRADE_RUNNING_POLL_INTERVAL_MS = 6_000;
const UPGRADE_IDLE_POLL_INTERVAL_MS = 60_000;
const HIDDEN_TAB_POLL_INTERVAL_MS = 180_000;
const INITIAL_STATUS_IDLE_TIMEOUT_MS = 1_500;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function useShellRelease(buildVersion: string) {
  const { text } = useLocalePreference();
  const { confirm } = useConfirmDialog();
  const studioRelease = ref<SystemStudioReleasePayload | null>(null);
  const studioUpgradeStatus = ref<SystemStudioUpgradeStatusPayload | null>(
    null,
  );
  const studioUpgradeBusy = ref(false);
  const studioReleaseCheckBusy = ref(false);
  let releaseRefreshTimer: number | null = null;
  let upgradePollTimer: number | null = null;
  let initialIdleHandle: number | null = null;
  let initialIdleHandleKind: "idle" | "timeout" | null = null;
  let releaseRequestRunning = false;
  let upgradeRequestRunning = false;

  const versionUpgradeFailed = computed(
    () => studioUpgradeStatus.value?.status === "failed",
  );
  const versionIsLatest = computed(
    () =>
      !!studioRelease.value &&
      !studioRelease.value.updateAvailable &&
      !studioUpgradeStatus.value?.running &&
      !versionUpgradeFailed.value,
  );
  const versionActionBusy = computed(
    () => studioUpgradeBusy.value || studioReleaseCheckBusy.value,
  );

  const versionLabel = computed(() => {
    const version = studioRelease.value?.currentVersion || buildVersion;
    return version ? `v${version}` : "v--";
  });

  const versionTitle = computed(() => {
    const current = studioRelease.value?.currentVersion || buildVersion || "--";
    const latest = studioRelease.value?.latestVersion || "--";
    if (studioUpgradeStatus.value?.running) {
      return text(
        `当前版本：v${current}，升级任务运行中`,
        `Current version: v${current}, upgrade task is running`,
      );
    }
    if (studioReleaseCheckBusy.value) {
      return text(
        `当前版本：v${current}，正在检查更新`,
        `Current version: v${current}, checking for updates`,
      );
    }
    if (versionUpgradeFailed.value) {
      return text(
        `当前版本：v${current}，升级失败，可重试`,
        `Current version: v${current}, upgrade failed and can be retried`,
      );
    }
    if (studioRelease.value?.updateAvailable) {
      return text(
        `当前版本：v${current}，可升级到 v${latest}`,
        `Current version: v${current}, update available: v${latest}`,
      );
    }
    if (versionIsLatest.value) {
      return text(
        `当前版本：v${current}，已是最新版本`,
        `Current version: v${current}, already up to date`,
      );
    }
    return text(`当前版本：v${current}`, `Current version: v${current}`);
  });

  const versionActionTitle = computed(() => {
    if (studioReleaseCheckBusy.value) {
      return text("正在检查更新", "Checking for updates");
    }
    if (studioUpgradeStatus.value?.running) {
      return text(
        "升级任务运行中，点击刷新状态",
        "Upgrade in progress, click to refresh status",
      );
    }
    if (versionUpgradeFailed.value) {
      return text("升级失败，点击重试", "Upgrade failed, click to retry");
    }
    if (studioRelease.value?.updateAvailable) {
      return text(
        "检测到新版本，点击一键升级",
        "Update available, click to upgrade",
      );
    }
    if (versionIsLatest.value) {
      return text(
        "当前已是最新版本，点击重新检查",
        "Already up to date, click to check again",
      );
    }
    return text("检查更新", "Check updates");
  });

  const versionMetaLabel = computed(() => {
    if (studioReleaseCheckBusy.value) return text("检查中", "Checking");
    if (studioUpgradeStatus.value?.running) return text("升级中", "Running");
    if (versionUpgradeFailed.value) return text("失败", "Failed");
    if (
      studioRelease.value?.updateAvailable &&
      studioRelease.value.latestVersion
    ) {
      return `→ v${studioRelease.value.latestVersion}`;
    }
    if (versionIsLatest.value) return text("已最新", "Latest");
    return "";
  });

  const versionInfoClass = computed(() => ({
    "is-checking": studioReleaseCheckBusy.value,
    "is-running": studioUpgradeStatus.value?.running,
    "is-warning": versionUpgradeFailed.value,
    "is-latest": versionIsLatest.value,
    "is-upgrade-ready": !!studioRelease.value?.updateAvailable,
  }));

  const versionActionLabel = computed(() => {
    if (studioReleaseCheckBusy.value) {
      return text("检查中", "Checking");
    }
    if (studioUpgradeStatus.value?.running) {
      return text("刷新", "Refresh");
    }
    if (versionUpgradeFailed.value) {
      return text("重试", "Retry");
    }
    if (studioRelease.value?.updateAvailable) {
      return text("升级", "Upgrade");
    }
    if (versionIsLatest.value) {
      return text("已最新", "Latest");
    }
    return text("检查", "Check");
  });

  const versionActionClass = computed(() => ({
    "is-checking": studioReleaseCheckBusy.value,
    "is-running": studioUpgradeStatus.value?.running,
    "is-warning": versionUpgradeFailed.value,
    "is-latest": versionIsLatest.value,
    "is-upgrade-ready": !!studioRelease.value?.updateAvailable,
  }));

  const versionStatusDotClass = computed(() => {
    if (studioReleaseCheckBusy.value) return "is-accent";
    if (studioUpgradeStatus.value?.running) return "is-accent";
    if (versionUpgradeFailed.value) return "is-warning";
    if (studioRelease.value?.updateAvailable) return "is-success";
    if (versionIsLatest.value) return "is-latest";
    return "";
  });

  function isDocumentVisible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }

  function clearReleaseTimer(): void {
    if (typeof window === "undefined" || releaseRefreshTimer === null) return;
    window.clearTimeout(releaseRefreshTimer);
    releaseRefreshTimer = null;
  }

  function clearUpgradeTimer(): void {
    if (typeof window === "undefined" || upgradePollTimer === null) return;
    window.clearTimeout(upgradePollTimer);
    upgradePollTimer = null;
  }

  function clearInitialIdleRefresh(): void {
    if (typeof window === "undefined" || initialIdleHandle === null) return;
    const idleWindow = window as IdleWindow;
    if (initialIdleHandleKind === "idle" && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(initialIdleHandle);
    } else {
      window.clearTimeout(initialIdleHandle);
    }
    initialIdleHandle = null;
    initialIdleHandleKind = null;
  }

  async function refreshStudioReleaseState(options: { force?: boolean } = {}): Promise<void> {
    if (!options.force && !isDocumentVisible()) {
      return;
    }
    if (releaseRequestRunning) {
      return;
    }
    releaseRequestRunning = true;
    try {
      studioRelease.value = await fetchStudioRelease();
    } catch {
      // keep UI usable when release endpoint is unavailable
    } finally {
      releaseRequestRunning = false;
    }
  }

  async function refreshStudioUpgradeState(options: { force?: boolean } = {}): Promise<void> {
    if (!options.force && !isDocumentVisible()) {
      return;
    }
    if (upgradeRequestRunning) {
      return;
    }
    upgradeRequestRunning = true;
    try {
      studioUpgradeStatus.value = await fetchStudioUpgradeStatus();
    } catch {
      // keep UI usable when upgrade endpoint is unavailable
    } finally {
      upgradeRequestRunning = false;
    }
  }

  function nextUpgradePollDelay(): number {
    if (!isDocumentVisible()) return HIDDEN_TAB_POLL_INTERVAL_MS;
    return studioUpgradeStatus.value?.running
      ? UPGRADE_RUNNING_POLL_INTERVAL_MS
      : UPGRADE_IDLE_POLL_INTERVAL_MS;
  }

  function scheduleReleaseRefresh(delay = RELEASE_REFRESH_INTERVAL_MS): void {
    if (typeof window === "undefined") return;
    clearReleaseTimer();
    releaseRefreshTimer = window.setTimeout(() => {
      releaseRefreshTimer = null;
      void refreshStudioReleaseState().finally(() => {
        scheduleReleaseRefresh(RELEASE_REFRESH_INTERVAL_MS);
      });
    }, delay);
  }

  function scheduleUpgradePoll(delay = nextUpgradePollDelay()): void {
    if (typeof window === "undefined") return;
    clearUpgradeTimer();
    upgradePollTimer = window.setTimeout(() => {
      upgradePollTimer = null;
      void refreshStudioUpgradeState().finally(() => {
        scheduleUpgradePoll(nextUpgradePollDelay());
      });
    }, delay);
  }

  function scheduleInitialStatusRefresh(): void {
    if (typeof window === "undefined") return;
    clearInitialIdleRefresh();

    const runInitialRefresh = () => {
      initialIdleHandle = null;
      initialIdleHandleKind = null;
      void Promise.all([
        refreshStudioReleaseState(),
        refreshStudioUpgradeState(),
      ]).finally(() => {
        scheduleReleaseRefresh();
        scheduleUpgradePoll();
      });
    };

    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      initialIdleHandle = idleWindow.requestIdleCallback(runInitialRefresh, {
        timeout: INITIAL_STATUS_IDLE_TIMEOUT_MS,
      });
      initialIdleHandleKind = "idle";
      return;
    }
    initialIdleHandle = window.setTimeout(runInitialRefresh, INITIAL_STATUS_IDLE_TIMEOUT_MS);
    initialIdleHandleKind = "timeout";
  }

  function handleVisibilityChange(): void {
    if (!isDocumentVisible()) {
      scheduleReleaseRefresh(HIDDEN_TAB_POLL_INTERVAL_MS);
      scheduleUpgradePoll(HIDDEN_TAB_POLL_INTERVAL_MS);
      return;
    }

    void Promise.all([
      refreshStudioReleaseState({ force: true }),
      refreshStudioUpgradeState({ force: true }),
    ]).finally(() => {
      scheduleReleaseRefresh();
      scheduleUpgradePoll();
    });
  }

  async function handleStudioUpgradeAction(): Promise<void> {
    if (versionActionBusy.value) {
      return;
    }
    if (studioUpgradeStatus.value?.running) {
      await refreshStudioUpgradeState({ force: true });
      return;
    }
    if (!studioRelease.value?.updateAvailable) {
      studioReleaseCheckBusy.value = true;
      try {
        await refreshStudioReleaseState({ force: true });
        await refreshStudioUpgradeState({ force: true });
      } finally {
        studioReleaseCheckBusy.value = false;
      }
      return;
    }

    const target = studioRelease.value.latestVersion || "";
    const confirmed = await confirm({
      title: text("确认升级 Studio", "Confirm Studio upgrade"),
      message: text(
        `确认升级到 v${target}？升级期间 Gateway 可能会重启。`,
        `Upgrade to v${target}? Gateway may restart during upgrade.`,
      ),
      confirmText: text("确认升级", "Upgrade now"),
      cancelText: text("取消", "Cancel"),
      tone: "danger",
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
      if (!response.ok) {
        const message = text(
          "升级任务启动失败，请查看系统页日志。",
          "Failed to start upgrade. Check logs in System page.",
        );
        await confirm({
          title: text("升级任务未启动", "Upgrade did not start"),
          message,
          confirmText: text("知道了", "Got it"),
          cancelText: text("关闭", "Close"),
          tone: "danger",
        });
      }
    } catch (error) {
      await confirm({
        title: text("升级请求失败", "Upgrade request failed"),
        message:
          error instanceof Error
            ? error.message
            : text("升级请求失败。", "Upgrade request failed."),
        confirmText: text("知道了", "Got it"),
        cancelText: text("关闭", "Close"),
        tone: "danger",
      });
    } finally {
      studioUpgradeBusy.value = false;
      await refreshStudioReleaseState({ force: true });
      await refreshStudioUpgradeState({ force: true });
      scheduleUpgradePoll(UPGRADE_RUNNING_POLL_INTERVAL_MS);
      scheduleReleaseRefresh();
    }
  }

  onMounted(() => {
    if (typeof window !== "undefined") {
      scheduleInitialStatusRefresh();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  onUnmounted(() => {
    clearInitialIdleRefresh();
    clearReleaseTimer();
    clearUpgradeTimer();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  return {
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
  };
}
