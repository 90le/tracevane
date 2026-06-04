import { requestJson } from "../../shared/api";
import type {
  CcConnectConfig,
  CodexStackCcConnectConfigPatchRequest,
  CodexStackCheckResponse,
  CodexStackConfigPatchRequest,
  CodexStackFinalizeRequest,
  CodexStackInstallRequest,
  CodexStackJobResponse,
  CodexStackLogResponse,
  CodexStackManualServiceId,
  CodexStackMutationResponse,
  CodexStackRepairRequest,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";
import type {
  ModelGatewayDaemonServiceRequest,
  ModelGatewayDaemonServiceResponse,
} from "../../../../../types/model-gateway";

export function fetchCodexStackSummary(): Promise<CodexStackSummaryPayload> {
  return requestJson<CodexStackSummaryPayload>("/api/codex-stack/summary");
}

export function enableCodexStackManagement(): Promise<CodexStackMutationResponse> {
  return requestJson<CodexStackMutationResponse>("/api/codex-stack/management/enable", {
    method: "POST",
  });
}

export function runCodexStackCheck(): Promise<CodexStackCheckResponse> {
  return requestJson<CodexStackCheckResponse>("/api/codex-stack/check", {
    method: "POST",
  });
}

export function startCodexStackInstall(payload: CodexStackInstallRequest): Promise<CodexStackJobResponse> {
  return requestJson<CodexStackJobResponse>("/api/codex-stack/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function startCodexStackRepair(payload: CodexStackRepairRequest): Promise<CodexStackJobResponse> {
  return requestJson<CodexStackJobResponse>("/api/codex-stack/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchModelGatewayDaemonService(): Promise<ModelGatewayDaemonServiceResponse> {
  return requestJson<ModelGatewayDaemonServiceResponse>("/api/codex-stack/model-gateway/daemon-service");
}

export function manageModelGatewayDaemonService(
  payload: ModelGatewayDaemonServiceRequest,
): Promise<ModelGatewayDaemonServiceResponse> {
  return requestJson<ModelGatewayDaemonServiceResponse>("/api/codex-stack/model-gateway/daemon-service", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchCodexStackJob(jobId: string): Promise<CodexStackJobResponse> {
  return requestJson<CodexStackJobResponse>(`/api/codex-stack/jobs/${encodeURIComponent(jobId)}`);
}

export function controlCodexStackService(
  serviceId: CodexStackManualServiceId,
  action: CodexStackServiceAction,
): Promise<CodexStackMutationResponse> {
  return requestJson<CodexStackMutationResponse>(
    `/api/codex-stack/services/${encodeURIComponent(serviceId)}/${encodeURIComponent(action)}`,
    { method: "POST" },
  );
}

export function patchCodexStackConfig(payload: CodexStackConfigPatchRequest): Promise<CodexStackMutationResponse> {
  return requestJson<CodexStackMutationResponse>("/api/codex-stack/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchCcConnectConfig(): Promise<CcConnectConfig> {
  return requestJson<CcConnectConfig>("/api/codex-stack/cc-connect/config");
}

export function patchCcConnectConfig(
  payload: CodexStackCcConnectConfigPatchRequest,
): Promise<CodexStackMutationResponse> {
  return requestJson<CodexStackMutationResponse>("/api/codex-stack/cc-connect/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function finalizeCodexStackCcConnect(payload: CodexStackFinalizeRequest): Promise<CodexStackJobResponse> {
  return requestJson<CodexStackJobResponse>("/api/codex-stack/cc-connect/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchCodexStackLogs(
  serviceId: CodexStackServiceId,
  lines = 160,
): Promise<CodexStackLogResponse> {
  return requestJson<CodexStackLogResponse>(
    `/api/codex-stack/logs/${encodeURIComponent(serviceId)}?lines=${encodeURIComponent(String(lines))}`,
  );
}
