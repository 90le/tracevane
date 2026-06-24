import { apiRequest } from "./client";
import type {
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorCommandActionResponse,
  ChannelConnectorCommandSurfaceRequest,
  ChannelConnectorCommandSurfaceResponse,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeResponse,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsSaveNativeConfigRequest,
  ChannelConnectorsStatusResponse,
} from "../../features/channel-connectors/types";

/**
 * Typed transport bindings for the Channel Connectors HTTP API.
 *
 * One function per browser-consumed route in
 * `apps/api/modules/channel-connectors/routes.ts`. Adapter webhook / inbound /
 * transport-smoke routes (feishu/octo) are server-to-server ingress endpoints,
 * not part of the control UI, so they are intentionally not bound here.
 *
 * Response shapes come from the shared contract (`types/channel-connectors.ts`).
 */

const BASE = "/api/channel-connectors";

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** GET /api/channel-connectors/status */
export function getChannelConnectorsStatus(
  signal?: AbortSignal,
): Promise<ChannelConnectorsStatusResponse> {
  return apiRequest<ChannelConnectorsStatusResponse>(`${BASE}/status`, { signal });
}

// ---------------------------------------------------------------------------
// Native config (bindings + agent profiles)
// ---------------------------------------------------------------------------

/** GET /api/channel-connectors/config */
export function getChannelConnectorsConfig(
  signal?: AbortSignal,
): Promise<ChannelConnectorsNativeConfigResponse> {
  return apiRequest<ChannelConnectorsNativeConfigResponse>(`${BASE}/config`, { signal });
}

/** PUT /api/channel-connectors/config — replace the native config document. */
export function saveChannelConnectorsConfig(
  payload: ChannelConnectorsSaveNativeConfigRequest,
): Promise<ChannelConnectorsNativeConfigResponse> {
  return apiRequest<ChannelConnectorsNativeConfigResponse>(`${BASE}/config`, {
    method: "PUT",
    body: jsonBody(payload),
  });
}

// ---------------------------------------------------------------------------
// Daemon config / service / logs
// ---------------------------------------------------------------------------

/** GET /api/channel-connectors/daemon/config */
export function getChannelConnectorsDaemonConfig(
  signal?: AbortSignal,
): Promise<ChannelConnectorsDaemonConfigResponse> {
  return apiRequest<ChannelConnectorsDaemonConfigResponse>(`${BASE}/daemon/config`, { signal });
}

/** GET /api/channel-connectors/daemon/service */
export function getChannelConnectorsDaemonService(
  signal?: AbortSignal,
): Promise<ChannelConnectorsDaemonResponse> {
  return apiRequest<ChannelConnectorsDaemonResponse>(`${BASE}/daemon/service`, { signal });
}

/** POST /api/channel-connectors/daemon/service — preview/install/lifecycle actions. */
export function manageChannelConnectorsDaemonService(
  payload: ChannelConnectorsDaemonRequest = {},
): Promise<ChannelConnectorsDaemonResponse> {
  return apiRequest<ChannelConnectorsDaemonResponse>(`${BASE}/daemon/service`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** GET /api/channel-connectors/daemon/logs */
export function getChannelConnectorsDaemonLogs(
  signal?: AbortSignal,
): Promise<ChannelConnectorsLogsResponse> {
  return apiRequest<ChannelConnectorsLogsResponse>(`${BASE}/daemon/logs`, { signal });
}

// ---------------------------------------------------------------------------
// Agent sessions
// ---------------------------------------------------------------------------

/** GET /api/channel-connectors/agent-sessions */
export function getChannelConnectorsAgentSessions(
  signal?: AbortSignal,
): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
  return apiRequest<ChannelConnectorAgentSessionDriverStatusResponse>(
    `${BASE}/agent-sessions`,
    { signal },
  );
}

/** POST /api/channel-connectors/agent-sessions — status / reap-idle / kill. */
export function manageChannelConnectorsAgentSessions(
  payload: ChannelConnectorAgentSessionActionRequest = {},
): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
  return apiRequest<ChannelConnectorAgentSessionDriverStatusResponse>(
    `${BASE}/agent-sessions`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

// ---------------------------------------------------------------------------
// Command surface / action
// ---------------------------------------------------------------------------

/** POST /api/channel-connectors/commands/surface — render the slash-command surface. */
export function getChannelConnectorsCommandSurface(
  payload: ChannelConnectorCommandSurfaceRequest = {},
): Promise<ChannelConnectorCommandSurfaceResponse> {
  return apiRequest<ChannelConnectorCommandSurfaceResponse>(`${BASE}/commands/surface`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** POST /api/channel-connectors/commands/action — execute a command surface action. */
export function runChannelConnectorsCommandAction(
  payload: ChannelConnectorCommandActionRequest,
): Promise<ChannelConnectorCommandActionResponse> {
  return apiRequest<ChannelConnectorCommandActionResponse>(`${BASE}/commands/action`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

// ---------------------------------------------------------------------------
// Transport smoke (explicit user-triggered checks)
// ---------------------------------------------------------------------------

/** POST /api/channel-connectors/adapters/feishu/transport-smoke */
export function runFeishuTransportSmoke(
  payload: ChannelConnectorFeishuTransportSmokeRequest,
): Promise<ChannelConnectorFeishuTransportSmokeResponse> {
  return apiRequest<ChannelConnectorFeishuTransportSmokeResponse>(
    `${BASE}/adapters/feishu/transport-smoke`,
    { method: "POST", body: jsonBody(payload) },
  );
}

/** POST /api/channel-connectors/adapters/octo/transport-smoke */
export function runOctoTransportSmoke(
  payload: ChannelConnectorOctoTransportSmokeRequest,
): Promise<ChannelConnectorOctoTransportSmokeResponse> {
  return apiRequest<ChannelConnectorOctoTransportSmokeResponse>(
    `${BASE}/adapters/octo/transport-smoke`,
    { method: "POST", body: jsonBody(payload) },
  );
}
