import { requestJson } from "../../shared/api";
import type {
  OpenClawRecoveryBackupRecord,
  OpenClawRecoveryBackupsPayload,
  OpenClawRecoveryDaemonServiceAction,
  OpenClawRecoveryDaemonServiceResponse,
  OpenClawRecoveryEventRecord,
  OpenClawRecoveryEventsPayload,
  OpenClawRecoveryRestoreBackupResponse,
  OpenClawRecoveryRunRequest,
  OpenClawRecoveryRunResponse,
  OpenClawRecoveryStatusPayload,
} from "../../../../../types/openclaw-recovery";
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
  SystemEventSummaryPayload,
  SystemHealthPayload,
  SystemStudioReleasePayload,
  SystemStudioUpgradeRequest,
  SystemStudioUpgradeResponse,
  SystemStudioUpgradeStatusPayload,
} from "../../../../../types/system";
import type { PersistedSystemEventPayload } from "./system-event-types";

export function fetchSystemHealth(): Promise<SystemHealthPayload> {
  return requestJson<SystemHealthPayload>("/api/system/health");
}

export function fetchSystemDiagnostics(): Promise<SystemDiagnosticsPayload> {
  return requestJson<SystemDiagnosticsPayload>("/api/system/diagnostics");
}

export function fetchOpenClawRecoveryStatus(): Promise<OpenClawRecoveryStatusPayload> {
  return requestJson<OpenClawRecoveryStatusPayload>("/api/openclaw-recovery/status");
}

export function fetchOpenClawRecoveryEvents(): Promise<OpenClawRecoveryEventRecord[]> {
  return requestJson<OpenClawRecoveryEventRecord[]>("/api/openclaw-recovery/events");
}

export function fetchOpenClawRecoveryEventsPage(
  page = 1,
  pageSize = 10,
): Promise<OpenClawRecoveryEventsPayload> {
  return requestJson<OpenClawRecoveryEventsPayload>(
    `/api/openclaw-recovery/events?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`,
  );
}

export function fetchOpenClawRecoveryBackups(): Promise<OpenClawRecoveryBackupRecord[]> {
  return requestJson<OpenClawRecoveryBackupRecord[]>("/api/openclaw-recovery/backups");
}

export function fetchOpenClawRecoveryBackupsPage(
  page = 1,
  pageSize = 10,
): Promise<OpenClawRecoveryBackupsPayload> {
  return requestJson<OpenClawRecoveryBackupsPayload>(
    `/api/openclaw-recovery/backups?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`,
  );
}

export function runOpenClawRecovery(
  payload: OpenClawRecoveryRunRequest = {},
): Promise<OpenClawRecoveryRunResponse> {
  return requestJson<OpenClawRecoveryRunResponse>("/api/openclaw-recovery/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function restoreOpenClawRecoveryBackup(
  backupId: string,
): Promise<OpenClawRecoveryRestoreBackupResponse> {
  return requestJson<OpenClawRecoveryRestoreBackupResponse>(
    "/api/openclaw-recovery/restore-backup",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ backupId }),
    },
  );
}

export function applyOpenClawRecoveryDaemonServiceAction(
  action: OpenClawRecoveryDaemonServiceAction,
): Promise<OpenClawRecoveryDaemonServiceResponse> {
  return requestJson<OpenClawRecoveryDaemonServiceResponse>(
    "/api/openclaw-recovery/daemon-service",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, apply: true, runCommands: true }),
    },
  );
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

export function fetchSystemEventCenterSnapshot(): Promise<
  PersistedSystemEventPayload[]
> {
  return requestJson<PersistedSystemEventPayload[]>("/api/system/events");
}

export function fetchSystemEventCenterSummary(): Promise<SystemEventSummaryPayload> {
  return requestJson<SystemEventSummaryPayload>("/api/system/events/summary");
}
