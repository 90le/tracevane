import { requestJson } from "../../shared/api";
import type { ConfigSummaryPayload } from "../../../../../types/config";
import type {
  PluginActionResponse,
  PluginBulkActionResponse,
  PluginBulkTogglePayload,
  PluginBulkToggleResponse,
  PluginBulkUninstallPayload,
  PluginBulkUpdatePayload,
  PluginInstallPayload,
  PluginPreflightPayload,
  PluginPreflightResult,
  PluginUploadInstallPayload,
  PluginUploadInstallResponse,
  PluginUploadPreflightPayload,
  PluginUploadPreflightResult,
  PluginsSummaryPayload,
  PluginToggleResponse,
  PluginUninstallPayload,
  PluginUpdatePayload,
} from "../../../../../types/plugins";

export function fetchPluginsSummary(): Promise<PluginsSummaryPayload> {
  return requestJson<PluginsSummaryPayload>("/api/plugins/summary");
}

export function savePluginsConfig(
  payload: Partial<NonNullable<ConfigSummaryPayload["plugins"]>>,
): Promise<ConfigSummaryPayload> {
  return requestJson<ConfigSummaryPayload>("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugins: payload }),
  });
}

export function togglePluginEntry(
  id: string,
  enabled: boolean,
): Promise<PluginToggleResponse> {
  return requestJson<PluginToggleResponse>(`/api/plugins/${encodeURIComponent(id)}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function bulkTogglePluginEntries(
  payload: PluginBulkTogglePayload,
): Promise<PluginBulkToggleResponse> {
  return requestJson<PluginBulkToggleResponse>("/api/plugins/bulk-toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function installPlugin(
  payload: PluginInstallPayload,
): Promise<PluginActionResponse> {
  return requestJson<PluginActionResponse>("/api/plugins/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function preflightPlugin(
  payload: PluginPreflightPayload,
): Promise<PluginPreflightResult> {
  return requestJson<PluginPreflightResult>("/api/plugins/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function preflightUploadedPluginArchive(
  payload: PluginUploadPreflightPayload,
): Promise<PluginUploadPreflightResult> {
  return requestJson<PluginUploadPreflightResult>("/api/plugins/upload/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function installUploadedPluginArchive(
  payload: PluginUploadInstallPayload,
): Promise<PluginUploadInstallResponse> {
  return requestJson<PluginUploadInstallResponse>("/api/plugins/upload/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updatePlugins(
  payload: PluginUpdatePayload,
): Promise<PluginActionResponse> {
  return requestJson<PluginActionResponse>("/api/plugins/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function bulkUpdatePluginInstalls(
  payload: PluginBulkUpdatePayload,
): Promise<PluginBulkActionResponse> {
  return requestJson<PluginBulkActionResponse>("/api/plugins/bulk-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function uninstallPlugin(
  payload: PluginUninstallPayload,
): Promise<PluginActionResponse> {
  return requestJson<PluginActionResponse>("/api/plugins/uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function bulkUninstallPluginInstalls(
  payload: PluginBulkUninstallPayload,
): Promise<PluginBulkActionResponse> {
  return requestJson<PluginBulkActionResponse>("/api/plugins/bulk-uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
