import { apiRequest } from "./client";
import type {
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorAccountSecretsResponse,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorCommandActionResponse,
  ChannelConnectorCommandSurfaceRequest,
  ChannelConnectorCommandSurfaceResponse,
  ChannelConnectorFeishuAppRegistrationSessionResponse,
  ChannelConnectorFeishuAppRegistrationStartRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeResponse,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsV3ConfigResponse,
  ChannelConnectorsV3ConfigPlanRequest,
  ChannelConnectorsV3ConfigPlanResponse,
  ChannelConnectorsV3ConfigApplyRequest,
  ChannelConnectorsV3ConfigApplyResponse,
  ChannelConnectorV3RoutingPreviewRequest,
  ChannelConnectorV3RoutingPreviewResponse,
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
// v3 resources (accounts + Agent workspaces + delivery policies)
// ---------------------------------------------------------------------------

/** GET /api/channel-connectors/config/v3 */
export function getChannelConnectorsV3Config(
  signal?: AbortSignal,
): Promise<ChannelConnectorsV3ConfigResponse> {
  return apiRequest<ChannelConnectorsV3ConfigResponse>(`${BASE}/config/v3`, { signal });
}

/** POST /api/channel-connectors/config/v3/plan */
export function planChannelConnectorsV3Config(
  payload: ChannelConnectorsV3ConfigPlanRequest,
): Promise<ChannelConnectorsV3ConfigPlanResponse> {
  return apiRequest<ChannelConnectorsV3ConfigPlanResponse>(`${BASE}/config/v3/plan`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** PUT /api/channel-connectors/config/v3/apply */
export function applyChannelConnectorsV3Config(
  payload: ChannelConnectorsV3ConfigApplyRequest,
): Promise<ChannelConnectorsV3ConfigApplyResponse> {
  return apiRequest<ChannelConnectorsV3ConfigApplyResponse>(`${BASE}/config/v3/apply`, {
    method: "PUT",
    body: jsonBody(payload),
  });
}

/** GET /api/channel-connectors/config/v3/accounts/:accountId/secrets */
export function getChannelConnectorAccountSecrets(
  accountId: string,
  signal?: AbortSignal,
): Promise<ChannelConnectorAccountSecretsResponse> {
  return apiRequest<ChannelConnectorAccountSecretsResponse>(
    `${BASE}/config/v3/accounts/${encodeURIComponent(accountId)}/secrets`,
    {
      signal,
      headers: { "X-Tracevane-Secret-Reveal": "account-editor" },
    },
  );
}

/** POST /api/channel-connectors/config/v3/routing-preview */
export function previewChannelConnectorV3Routing(
  payload: ChannelConnectorV3RoutingPreviewRequest,
): Promise<ChannelConnectorV3RoutingPreviewResponse> {
  return apiRequest<ChannelConnectorV3RoutingPreviewResponse>(
    `${BASE}/config/v3/routing-preview`,
    { method: "POST", body: jsonBody(payload) },
  );
}

/** POST /api/channel-connectors/accounts/feishu/registration/start */
export function startFeishuAppRegistration(
  payload: ChannelConnectorFeishuAppRegistrationStartRequest = {},
): Promise<ChannelConnectorFeishuAppRegistrationSessionResponse> {
  return apiRequest<ChannelConnectorFeishuAppRegistrationSessionResponse>(
    `${BASE}/accounts/feishu/registration/start`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** GET /api/channel-connectors/accounts/feishu/registration/:sessionId */
export function getFeishuAppRegistration(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChannelConnectorFeishuAppRegistrationSessionResponse> {
  return apiRequest<ChannelConnectorFeishuAppRegistrationSessionResponse>(
    `${BASE}/accounts/feishu/registration/${encodeURIComponent(sessionId)}`,
    { signal },
  );
}

/** POST /api/channel-connectors/accounts/feishu/registration/:sessionId/cancel */
export function cancelFeishuAppRegistration(
  sessionId: string,
): Promise<ChannelConnectorFeishuAppRegistrationSessionResponse> {
  return apiRequest<ChannelConnectorFeishuAppRegistrationSessionResponse>(
    `${BASE}/accounts/feishu/registration/${encodeURIComponent(sessionId)}/cancel`,
    { method: "POST", body: jsonBody({}) },
  );
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
