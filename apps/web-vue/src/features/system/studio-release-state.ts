import type {
  SystemStudioReleasePayload,
  SystemStudioUpgradeStatusPayload,
} from "../../../../../types/system";

function normalizeVersion(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().replace(/^v/i, "") : "";
}

export function compareStudioVersions(
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

export function isStudioUpgradeTargetSatisfied(params: {
  studioRelease: SystemStudioReleasePayload | null;
  studioUpgrade: SystemStudioUpgradeStatusPayload | null;
  buildVersion?: string;
}): boolean {
  const currentVersion =
    normalizeVersion(params.studioRelease?.currentVersion) ||
    normalizeVersion(params.buildVersion);
  const targetVersion = normalizeVersion(params.studioUpgrade?.targetVersion);
  const comparison = compareStudioVersions(currentVersion, targetVersion);
  return comparison !== null && comparison >= 0;
}

export function isStudioUpgradeEffectivelyFailed(params: {
  studioRelease: SystemStudioReleasePayload | null;
  studioUpgrade: SystemStudioUpgradeStatusPayload | null;
  buildVersion?: string;
}): boolean {
  if (params.studioUpgrade?.status !== "failed") return false;
  return !isStudioUpgradeTargetSatisfied(params);
}
