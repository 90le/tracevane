import type {
  SystemTracevaneReleasePayload,
  SystemTracevaneUpgradeStatusPayload,
} from "../../../../../types/system";

function normalizeVersion(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().replace(/^v/i, "") : "";
}

export function compareTracevaneVersions(
  left: string | null | undefined,
  right: string | null | undefined,
): number | null {
  const normalizedLeft = normalizeVersion(left);
  const normalizedRight = normalizeVersion(right);
  if (!normalizedLeft || !normalizedRight) return null;

  const leftSegments = (normalizedLeft.match(/\d+/g) || []).map(Number);
  const rightSegments = (normalizedRight.match(/\d+/g) || []).map(Number);
  const size = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < size; index += 1) {
    const a = leftSegments[index] ?? 0;
    const b = rightSegments[index] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export function isTracevaneUpgradeTargetSatisfied(params: {
  tracevaneRelease: SystemTracevaneReleasePayload | null;
  tracevaneUpgrade: SystemTracevaneUpgradeStatusPayload | null;
  buildVersion?: string;
}): boolean {
  const currentVersion =
    normalizeVersion(params.tracevaneRelease?.currentVersion) ||
    normalizeVersion(params.buildVersion);
  const targetVersion = normalizeVersion(params.tracevaneUpgrade?.targetVersion);
  const comparison = compareTracevaneVersions(currentVersion, targetVersion);
  return comparison !== null && comparison >= 0;
}

export function isTracevaneUpgradeEffectivelyFailed(params: {
  tracevaneRelease: SystemTracevaneReleasePayload | null;
  tracevaneUpgrade: SystemTracevaneUpgradeStatusPayload | null;
  buildVersion?: string;
}): boolean {
  if (params.tracevaneUpgrade?.status !== "failed") return false;
  return !isTracevaneUpgradeTargetSatisfied(params);
}
