import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  fetchTracevaneRelease,
  fetchTracevaneUpgradeStatus,
  startTracevaneUpgrade,
} from "../system/api";
import { useLocalePreference } from "../../shared/locale";
import { useConfirmDialog } from "../../composables/useConfirmDialog";
import type {
  SystemTracevaneReleasePayload,
  SystemTracevaneUpgradeStatusPayload,
} from "../../../../../types/system";
import { isTracevaneUpgradeEffectivelyFailed } from "../system/tracevane-release-state";

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
  const tracevaneRelease = ref<SystemTracevaneReleasePayload | null>(null);
  const tracevaneUpgradeStatus = ref<SystemTracevaneUpgradeStatusPayload | null>(
    null,
  );
  const tracevaneUpgradeBusy = ref(false);
  const tracevaneReleaseCheckBusy = ref(false);
  let releaseRefreshTimer: number | null = null;
  let upgradePollTimer: number | null = null;
  let initialIdleHandle: number | null = null;
  let initialIdleHandleKind: "idle" | "timeout" | null = null;
  let releaseRequestRunning = false;
  let upgradeRequestRunning = false;

  const versionUpgradeFailed = computed(
    () =>
      isTracevaneUpgradeEffectivelyFailed({
        tracevaneRelease: tracevaneRelease.value,
        tracevaneUpgrade: tracevaneUpgradeStatus.value,
        buildVersion,
      }),
  );
  const versionIsLatest = computed(
    () =>
      !!tracevaneRelease.value &&
      !tracevaneRelease.value.updateAvailable &&
      !tracevaneUpgradeStatus.value?.running &&
      !versionUpgradeFailed.value,
  );
  const versionActionBusy = computed(
    () => tracevaneUpgradeBusy.value || tracevaneReleaseCheckBusy.value,
  );

  const versionLabel = computed(() => {
    const version = tracevaneRelease.value?.currentVersion || buildVersion;
    return version ? `v${version}` : "v--";
  });

  const versionTitle = computed(() => {
    const current = tracevaneRelease.value?.currentVersion || buildVersion || "--";
    const latest = tracevaneRelease.value?.latestVersion || "--";
    if (tracevaneUpgradeStatus.value?.running) {
      return text(
        `当前版本：v${current}，升级任务运行中`,
        `Current version: v${current}, upgrade task is running`,
      );
    }
    if (tracevaneReleaseCheckBusy.value) {
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
    if (tracevaneRelease.value?.updateAvailable) {
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
    if (tracevaneReleaseCheckBusy.value) {
      return text("正在检查更新", "Checking for updates");
    }
    if (tracevaneUpgradeStatus.value?.running) {
      return text(
        "升级任务运行中，点击刷新状态",
        "Upgrade in progress, click to refresh status",
      );
    }
    if (versionUpgradeFailed.value) {
      return text("升级失败，点击重试", "Upgrade failed, click to retry");
    }
    if (tracevaneRelease.value?.updateAvailable) {
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
    if (tracevaneReleaseCheckBusy.value) return text("检查中", "Checking");
    if (tracevaneUpgradeStatus.value?.running) return text("升级中", "Running");
    if (versionUpgradeFailed.value) return text("失败", "Failed");
    if (
      tracevaneRelease.value?.updateAvailable &&
      tracevaneRelease.value.latestVersion
    ) {
      return `→ v${tracevaneRelease.value.latestVersion}`;
    }
    if (versionIsLatest.value) return text("已最新", "Latest");
    return "";
  });

  const versionInfoClass = computed(() => ({
    "is-checking": tracevaneReleaseCheckBusy.value,
    "is-running": tracevaneUpgradeStatus.value?.running,
    "is-warning": versionUpgradeFailed.value,
    "is-latest": versionIsLatest.value,
    "is-upgrade-ready": !!tracevaneRelease.value?.updateAvailable,
  }));

  const versionActionLabel = computed(() => {
    if (tracevaneReleaseCheckBusy.value) {
      return text("检查中", "Checking");
    }
    if (tracevaneUpgradeStatus.value?.running) {
      return text("刷新", "Refresh");
    }
    if (versionUpgradeFailed.value) {
      return text("重试", "Retry");
    }
    if (tracevaneRelease.value?.updateAvailable) {
      return text("升级", "Upgrade");
    }
    if (versionIsLatest.value) {
      return text("已最新", "Latest");
    }
    return text("检查", "Check");
  });

  const versionActionClass = computed(() => ({
    "is-checking": tracevaneReleaseCheckBusy.value,
    "is-running": tracevaneUpgradeStatus.value?.running,
    "is-warning": versionUpgradeFailed.value,
    "is-latest": versionIsLatest.value,
    "is-upgrade-ready": !!tracevaneRelease.value?.updateAvailable,
  }));

  const versionStatusDotClass = computed(() => {
    if (tracevaneReleaseCheckBusy.value) return "is-accent";
    if (tracevaneUpgradeStatus.value?.running) return "is-accent";
    if (versionUpgradeFailed.value) return "is-warning";
    if (tracevaneRelease.value?.updateAvailable) return "is-success";
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

  async function refreshTracevaneReleaseState(options: { force?: boolean } = {}): Promise<void> {
    if (!options.force && !isDocumentVisible()) {
      return;
    }
    if (releaseRequestRunning) {
      return;
    }
    releaseRequestRunning = true;
    try {
      tracevaneRelease.value = await fetchTracevaneRelease();
    } catch {
      // keep UI usable when release endpoint is unavailable
    } finally {
      releaseRequestRunning = false;
    }
  }

  async function refreshTracevaneUpgradeState(options: { force?: boolean } = {}): Promise<void> {
    if (!options.force && !isDocumentVisible()) {
      return;
    }
    if (upgradeRequestRunning) {
      return;
    }
    upgradeRequestRunning = true;
    try {
      tracevaneUpgradeStatus.value = await fetchTracevaneUpgradeStatus();
    } catch {
      // keep UI usable when upgrade endpoint is unavailable
    } finally {
      upgradeRequestRunning = false;
    }
  }

  function nextUpgradePollDelay(): number {
    if (!isDocumentVisible()) return HIDDEN_TAB_POLL_INTERVAL_MS;
    return tracevaneUpgradeStatus.value?.running
      ? UPGRADE_RUNNING_POLL_INTERVAL_MS
      : UPGRADE_IDLE_POLL_INTERVAL_MS;
  }

  function scheduleReleaseRefresh(delay = RELEASE_REFRESH_INTERVAL_MS): void {
    if (typeof window === "undefined") return;
    clearReleaseTimer();
    releaseRefreshTimer = window.setTimeout(() => {
      releaseRefreshTimer = null;
      void refreshTracevaneReleaseState().finally(() => {
        scheduleReleaseRefresh(RELEASE_REFRESH_INTERVAL_MS);
      });
    }, delay);
  }

  function scheduleUpgradePoll(delay = nextUpgradePollDelay()): void {
    if (typeof window === "undefined") return;
    clearUpgradeTimer();
    upgradePollTimer = window.setTimeout(() => {
      upgradePollTimer = null;
      void refreshTracevaneUpgradeState().finally(() => {
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
        refreshTracevaneReleaseState(),
        refreshTracevaneUpgradeState(),
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
      refreshTracevaneReleaseState({ force: true }),
      refreshTracevaneUpgradeState({ force: true }),
    ]).finally(() => {
      scheduleReleaseRefresh();
      scheduleUpgradePoll();
    });
  }

  async function handleTracevaneUpgradeAction(): Promise<void> {
    if (versionActionBusy.value) {
      return;
    }
    if (tracevaneUpgradeStatus.value?.running) {
      await refreshTracevaneUpgradeState({ force: true });
      return;
    }
    if (!tracevaneRelease.value?.updateAvailable) {
      tracevaneReleaseCheckBusy.value = true;
      try {
        await refreshTracevaneReleaseState({ force: true });
        await refreshTracevaneUpgradeState({ force: true });
      } finally {
        tracevaneReleaseCheckBusy.value = false;
      }
      return;
    }

    const target = tracevaneRelease.value.latestVersion || "";
    const confirmed = await confirm({
      title: text("确认升级 Tracevane", "Confirm Tracevane upgrade"),
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

    tracevaneUpgradeBusy.value = true;
    try {
      const response = await startTracevaneUpgrade({
        version: target || undefined,
      });
      tracevaneUpgradeStatus.value = response.status;
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
      tracevaneUpgradeBusy.value = false;
      await refreshTracevaneReleaseState({ force: true });
      await refreshTracevaneUpgradeState({ force: true });
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
    handleTracevaneUpgradeAction,
  };
}
