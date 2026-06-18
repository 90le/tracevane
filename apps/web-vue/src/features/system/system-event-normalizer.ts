import type {
  SystemBootstrapPayload,
  SystemDiagnosticsPayload,
  SystemDeviceTrustPayload,
  SystemTracevaneReleasePayload,
} from "../../../../../types/system";
import type { SystemEventItem } from "./system-event-types";

function makeId(prefix: string, occurredAt: string) {
  return `${prefix}-${occurredAt}`;
}

export function buildSystemDerivedEvents(params: {
  diagnostics: Pick<
    SystemDiagnosticsPayload,
    "checkedAt" | "gateway" | "status"
  > | null;
  bootstrap: Pick<SystemBootstrapPayload, "checkedAt" | "ready"> | null;
  deviceTrust: Pick<SystemDeviceTrustPayload, "checkedAt" | "pending"> | null;
  tracevaneRelease: Pick<
    SystemTracevaneReleasePayload,
    "checkedAt" | "currentVersion" | "latestVersion" | "updateAvailable"
  > | null;
}): SystemEventItem[] {
  const { diagnostics, bootstrap, deviceTrust, tracevaneRelease } = params;
  const events: SystemEventItem[] = [];

  if (
    diagnostics &&
    diagnostics.gateway &&
    diagnostics.gateway.rpcOk === false
  ) {
    const occurredAt = diagnostics.checkedAt;
    events.push({
      id: makeId("diagnostic-gateway-rpc", occurredAt),
      kind: "diagnostic_issue",
      category: "alerts",
      severity: "error",
      occurredAt,
      title: "Gateway RPC 不可用",
      summary: "system diagnostics 显示 gateway rpc 不可用",
      sourceModule: "gateway",
    });
  }

  const bootstrapPending =
    Number(diagnostics?.status?.bootstrapPendingCount || 0) > 0;
  if ((bootstrap && bootstrap.ready === false) || bootstrapPending) {
    const occurredAt =
      bootstrap?.checkedAt ||
      diagnostics?.checkedAt ||
      new Date(0).toISOString();
    events.push({
      id: makeId("diagnostic-bootstrap", occurredAt),
      kind: "diagnostic_issue",
      category: "alerts",
      severity: "warning",
      occurredAt,
      title: "Bootstrap 待处理",
      summary: "bootstrap 未 ready 或存在 pending 项",
      sourceModule: "bootstrap",
    });
  }

  if (
    deviceTrust &&
    Array.isArray(deviceTrust.pending) &&
    deviceTrust.pending.length > 0
  ) {
    const occurredAt = deviceTrust.checkedAt;
    events.push({
      id: makeId("device-trust-pending", occurredAt),
      kind: "device_trust_pending",
      category: "recovery",
      severity: "warning",
      occurredAt,
      title: "设备信任待审批",
      summary: `存在 ${deviceTrust.pending.length} 条待审批请求`,
      sourceModule: "device-trust",
    });
  }

  if (tracevaneRelease && tracevaneRelease.updateAvailable) {
    const occurredAt = tracevaneRelease.checkedAt;
    events.push({
      id: makeId("release-update", occurredAt),
      kind: "release_update_available",
      category: "operations",
      severity: "info",
      occurredAt,
      title: "发现可用更新",
      summary: `${tracevaneRelease.currentVersion} -> ${tracevaneRelease.latestVersion || "unknown"}`,
      sourceModule: "release",
    });
  }

  return events;
}
