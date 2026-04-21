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
      await refreshStudioReleaseState();
      await refreshStudioUpgradeState();
    }
  }

  onMounted(() => {
    void refreshStudioReleaseState();
    void refreshStudioUpgradeState();
    if (typeof window !== "undefined") {
      releaseRefreshTimer = window.setInterval(() => {
        void refreshStudioReleaseState();
      }, 300_000);
      upgradePollTimer = window.setInterval(() => {
        void refreshStudioUpgradeState();
      }, 6_000);
    }
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
