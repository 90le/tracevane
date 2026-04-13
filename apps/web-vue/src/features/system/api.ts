import { requestJson } from "../../shared/api";
import type {
  SystemBootstrapPayload,
  SystemBootstrapRepairResponse,
  SystemDiagnosticsPayload,
  SystemDeviceTrustApproveRequest,
  SystemDeviceTrustApproveResponse,
  SystemDeviceTrustPayload,
  SystemDeviceTrustRepairResponse,
  SystemDeviceTrustSettingsPatchRequest,
  SystemDeviceTrustSettingsPatchResponse,
  SystemEventRecord,
  SystemEventSummaryPayload,
  SystemHealthPayload,
  SystemStudioReleasePayload,
  SystemStudioUpgradeRequest,
  SystemStudioUpgradeResponse,
  SystemStudioUpgradeStatusPayload,
} from "../../../../../types/system";

export function fetchSystemHealth(): Promise<SystemHealthPayload> {
  return requestJson<SystemHealthPayload>("/api/system/health");
}

export function fetchSystemDiagnostics(): Promise<SystemDiagnosticsPayload> {
  return requestJson<SystemDiagnosticsPayload>("/api/system/diagnostics");
}

export function fetchSystemBootstrap(): Promise<SystemBootstrapPayload> {
  return requestJson<SystemBootstrapPayload>("/api/system/bootstrap");
}

export function repairSystemBootstrapConfig(): Promise<SystemBootstrapRepairResponse> {
  return requestJson<SystemBootstrapRepairResponse>(
    "/api/system/bootstrap/repair",
    {
      method: "POST",
    },
  );
}

export function fetchStudioRelease(): Promise<SystemStudioReleasePayload> {
  return requestJson<SystemStudioReleasePayload>("/api/system/studio-release");
}

export function fetchStudioUpgradeStatus(): Promise<SystemStudioUpgradeStatusPayload> {
  return requestJson<SystemStudioUpgradeStatusPayload>(
    "/api/system/studio-upgrade",
  );
}

export function startStudioUpgrade(
  payload: SystemStudioUpgradeRequest = {},
): Promise<SystemStudioUpgradeResponse> {
  return requestJson<SystemStudioUpgradeResponse>(
    "/api/system/studio-upgrade",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

export function fetchSystemDeviceTrust(): Promise<SystemDeviceTrustPayload> {
  return requestJson<SystemDeviceTrustPayload>("/api/system/device-trust");
}

export function approveSystemDeviceTrust(
  payload: SystemDeviceTrustApproveRequest,
): Promise<SystemDeviceTrustApproveResponse> {
  return requestJson<SystemDeviceTrustApproveResponse>(
    "/api/system/device-trust/approve",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

export function repairSystemDeviceTrustHelper(): Promise<SystemDeviceTrustRepairResponse> {
  return requestJson<SystemDeviceTrustRepairResponse>(
    "/api/system/device-trust/repair-helper",
    {
      method: "POST",
    },
  );
}

export function patchSystemDeviceTrustSettings(
  payload: SystemDeviceTrustSettingsPatchRequest,
): Promise<SystemDeviceTrustSettingsPatchResponse> {
  return requestJson<SystemDeviceTrustSettingsPatchResponse>(
    "/api/system/device-trust/settings",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

export function fetchSystemEventCenterSnapshot(): Promise<SystemEventRecord[]> {
  return requestJson<SystemEventRecord[]>("/api/system/events");
}

export function fetchSystemEventCenterSummary(): Promise<SystemEventSummaryPayload> {
  return requestJson<SystemEventSummaryPayload>("/api/system/events/summary");
}
