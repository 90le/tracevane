import type {
  SystemStudioReleasePayload,
  SystemStudioUpgradeStatusPayload,
} from "../../../../../types/system";

type SystemText = (zh: string, en: string) => string;

export interface SystemRuntimeViewModel {
  studioUpgradeStatusLabel: string;
  studioUpgradeActionLabel: string;
}

export function buildSystemRuntimeViewModel(params: {
  studioRelease: SystemStudioReleasePayload | null;
  studioUpgrade: SystemStudioUpgradeStatusPayload | null;
  releaseUpgradeRunning: boolean;
  text: SystemText;
}): SystemRuntimeViewModel {
  const { studioRelease, studioUpgrade, releaseUpgradeRunning, text } = params;

  const studioUpgradeStatusLabel = (() => {
    if (studioUpgrade?.running) return text("升级中", "Running");
    if (studioUpgrade?.status === "failed") return text("失败", "Failed");
    if (studioUpgrade?.status === "succeeded")
      return text("已完成", "Completed");
    if (studioRelease?.updateAvailable)
      return text("可升级", "Update available");
    return text("已最新", "Up to date");
  })();

  const studioUpgradeActionLabel = (() => {
    if (releaseUpgradeRunning) return text("处理中...", "Working...");
    if (studioUpgrade?.running) return text("刷新状态", "Refresh status");
    if (studioUpgrade?.status === "failed")
      return text("重试升级", "Retry upgrade");
    if (studioRelease?.updateAvailable) return text("一键升级", "Upgrade now");
    return text("刷新状态", "Refresh status");
  })();

  return {
    studioUpgradeStatusLabel,
    studioUpgradeActionLabel,
  };
}
