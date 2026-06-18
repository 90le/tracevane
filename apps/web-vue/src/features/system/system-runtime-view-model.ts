import type {
  SystemTracevaneReleasePayload,
  SystemTracevaneUpgradeStatusPayload,
} from "../../../../../types/system";
import { isTracevaneUpgradeEffectivelyFailed } from "./tracevane-release-state";

type SystemText = (zh: string, en: string) => string;

export interface SystemRuntimeViewModel {
  tracevaneUpgradeStatusLabel: string;
  tracevaneUpgradeActionLabel: string;
}

export function buildSystemRuntimeViewModel(params: {
  tracevaneRelease: SystemTracevaneReleasePayload | null;
  tracevaneUpgrade: SystemTracevaneUpgradeStatusPayload | null;
  releaseUpgradeRunning: boolean;
  text: SystemText;
}): SystemRuntimeViewModel {
  const { tracevaneRelease, tracevaneUpgrade, releaseUpgradeRunning, text } = params;
  const upgradeFailed = isTracevaneUpgradeEffectivelyFailed({
    tracevaneRelease,
    tracevaneUpgrade,
  });

  const tracevaneUpgradeStatusLabel = (() => {
    if (tracevaneUpgrade?.running) return text("升级中", "Running");
    if (upgradeFailed) return text("失败", "Failed");
    if (tracevaneUpgrade?.status === "succeeded")
      return text("已完成", "Completed");
    if (tracevaneRelease?.updateAvailable)
      return text("可升级", "Update available");
    return text("已最新", "Up to date");
  })();

  const tracevaneUpgradeActionLabel = (() => {
    if (releaseUpgradeRunning) return text("处理中...", "Working...");
    if (tracevaneUpgrade?.running) return text("刷新状态", "Refresh status");
    if (upgradeFailed)
      return text("重试升级", "Retry upgrade");
    if (tracevaneRelease?.updateAvailable) return text("一键升级", "Upgrade now");
    return text("刷新状态", "Refresh status");
  })();

  return {
    tracevaneUpgradeStatusLabel,
    tracevaneUpgradeActionLabel,
  };
}
