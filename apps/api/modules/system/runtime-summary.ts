import type { SystemRuntimeSummaryPayload } from "../../../../types/system.js";

export interface BuildSystemRuntimeSummaryInput {
  checkedAt: string;
  gatewayConnected: boolean;
  bootstrapPendingCount: number;
  updateLatestVersion: string;
  updateAvailable: boolean;
  tracevaneUpgradeRunning: boolean;
  helperRepairPending: boolean;
}

export function buildSystemRuntimeSummary(
  input: BuildSystemRuntimeSummaryInput,
): SystemRuntimeSummaryPayload {
  return {
    checkedAt: input.checkedAt,
    gatewayConnected: input.gatewayConnected,
    bootstrapPendingCount: input.bootstrapPendingCount,
    updateLatestVersion: input.updateLatestVersion,
    updateAvailable: input.updateAvailable,
    tracevaneUpgradeRunning: input.tracevaneUpgradeRunning,
    helperRepairPending: input.helperRepairPending,
    level:
      !input.gatewayConnected ||
      input.bootstrapPendingCount > 0 ||
      input.updateAvailable ||
      input.tracevaneUpgradeRunning ||
      input.helperRepairPending
        ? "warn"
        : "ok",
  };
}
