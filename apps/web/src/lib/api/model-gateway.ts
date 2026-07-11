import { apiRequest } from "./client";
import type {
  ModelGatewayActiveRouteSmokeRequest,
  ModelGatewayApplyAppConnectionRequest,
  ModelGatewayApplyAppConnectionResponse,
  ModelGatewayApplyAppConnectionsResponse,
  ModelGatewayAppConnectionId,
  ModelGatewayAppConnectionsResponse,
  ModelGatewayAppConnectionBackupsResponse,
  ModelGatewayAppConnectionBackupContentResponse,
  ModelGatewayClientAuthResponse,
  ModelGatewayClientAuthUpdateRequest,
  ModelGatewayCodexAccountLoginPollRequest,
  ModelGatewayCodexAccountLoginPollResponse,
  ModelGatewayCodexAccountLoginStartRequest,
  ModelGatewayCodexAccountLoginStartResponse,
  ModelGatewayDaemonServiceRequest,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayModelListResponse,
  ModelGatewayProviderAccountRefreshResponse,
  ModelGatewayProviderAccountUpdateRequest,
  ModelGatewayProviderAccountUpdateResponse,
  ModelGatewayProviderDetectRequest,
  ModelGatewayProviderDetectResponse,
  ModelGatewayProviderSecretResponse,
  ModelGatewayProviderTestRequest,
  ModelGatewayProviderTestResponse,
  ModelGatewayProvidersResponse,
  ModelGatewayRollbackAppConnectionRequest,
  ModelGatewayRollbackAppConnectionResponse,
  ModelGatewayRuntimeResponse,
  ModelGatewaySetActiveProviderRequest,
  ModelGatewaySetProviderSecretRequest,
  ModelGatewayStatusResponse,
  ModelGatewayUpdateAppConnectionProfileRequest,
  ModelGatewayUpdateAppConnectionProfileResponse,
  ModelGatewayUpsertProviderRequest,
  ModelGatewayUpsertProviderResponse,
  ModelGatewayUsageLedgerResponse,
} from "../../features/model-gateway/types";

/**
 * Typed transport bindings for the Model Gateway HTTP API.
 *
 * One function per backend route in `apps/api/modules/model-gateway/routes.ts`.
 * Only the `/api/model-gateway/*` variants are bound here because the web app
 * is mounted behind OpenClaw/Tracevane base paths. Browser requests to raw
 * `/v1/*` can miss the mounted backend and return 404, so UI model discovery
 * uses the namespaced alias below while gateway clients still use `/v1/*`.
 *
 * Response shapes come from the shared contract (`types/model-gateway.ts`).
 */

const BASE = "/api/model-gateway";

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

// ---------------------------------------------------------------------------
// Status / runtime / usage
// ---------------------------------------------------------------------------

/** GET /api/model-gateway/status */
export function getModelGatewayStatus(
  signal?: AbortSignal,
): Promise<ModelGatewayStatusResponse> {
  return apiRequest<ModelGatewayStatusResponse>(`${BASE}/status`, { signal });
}

/** GET /api/model-gateway/runtime */
export function getModelGatewayRuntime(
  signal?: AbortSignal,
): Promise<ModelGatewayRuntimeResponse> {
  return apiRequest<ModelGatewayRuntimeResponse>(`${BASE}/runtime`, { signal });
}

/** GET /api/model-gateway/usage */
export function getModelGatewayUsage(
  options?: { range?: "week" | "all" | "custom" | null; dateFrom?: string | null; dateTo?: string | null },
  signal?: AbortSignal,
): Promise<ModelGatewayUsageLedgerResponse> {
  const params = new URLSearchParams();
  if (options?.range) params.set("range", options.range);
  if (options?.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options?.dateTo) params.set("dateTo", options.dateTo);
  const query = params.toString();
  return apiRequest<ModelGatewayUsageLedgerResponse>(`${BASE}/usage${query ? `?${query}` : ""}`, { signal });
}

/** GET /api/model-gateway/models — browser-safe gateway model catalog. */
export function getModelGatewayModels(
  signal?: AbortSignal,
): Promise<ModelGatewayModelListResponse> {
  return apiRequest<ModelGatewayModelListResponse>(`${BASE}/models`, { signal });
}

// ---------------------------------------------------------------------------
// Client auth
// ---------------------------------------------------------------------------

/** GET /api/model-gateway/client-auth */
export function getModelGatewayClientAuth(
  signal?: AbortSignal,
): Promise<ModelGatewayClientAuthResponse> {
  return apiRequest<ModelGatewayClientAuthResponse>(`${BASE}/client-auth`, { signal });
}

/** POST /api/model-gateway/client-auth */
export function updateModelGatewayClientAuth(
  payload: ModelGatewayClientAuthUpdateRequest,
): Promise<ModelGatewayClientAuthResponse> {
  return apiRequest<ModelGatewayClientAuthResponse>(`${BASE}/client-auth`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** GET /api/model-gateway/providers */
export function listModelGatewayProviders(
  signal?: AbortSignal,
): Promise<ModelGatewayProvidersResponse> {
  return apiRequest<ModelGatewayProvidersResponse>(`${BASE}/providers`, { signal });
}

/** POST /api/model-gateway/providers — create (or upsert) a provider. */
export function createModelGatewayProvider(
  payload: ModelGatewayUpsertProviderRequest,
): Promise<ModelGatewayUpsertProviderResponse> {
  return apiRequest<ModelGatewayUpsertProviderResponse>(`${BASE}/providers`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** PUT /api/model-gateway/providers/:providerId — update an existing provider. */
export function updateModelGatewayProvider(
  providerId: string,
  payload: ModelGatewayUpsertProviderRequest,
): Promise<ModelGatewayUpsertProviderResponse> {
  return apiRequest<ModelGatewayUpsertProviderResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}`,
    {
      method: "PUT",
      body: jsonBody(payload),
    },
  );
}

/** DELETE /api/model-gateway/providers/:providerId — returns the refreshed provider list. */
export function deleteModelGatewayProvider(
  providerId: string,
): Promise<ModelGatewayProvidersResponse> {
  return apiRequest<ModelGatewayProvidersResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}`,
    { method: "DELETE" },
  );
}

/** POST /api/model-gateway/detect-provider — probe a base URL for models/protocols. */
export function detectModelGatewayProvider(
  payload: ModelGatewayProviderDetectRequest,
): Promise<ModelGatewayProviderDetectResponse> {
  return apiRequest<ModelGatewayProviderDetectResponse>(`${BASE}/detect-provider`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** POST /api/model-gateway/active-provider — set/clear the active provider for a scope. */
export function setModelGatewayActiveProvider(
  payload: ModelGatewaySetActiveProviderRequest,
): Promise<ModelGatewayProvidersResponse> {
  return apiRequest<ModelGatewayProvidersResponse>(`${BASE}/active-provider`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

// ---------------------------------------------------------------------------
// Provider secrets
// ---------------------------------------------------------------------------

/** GET /api/model-gateway/providers/:providerId/secret */
export function getModelGatewayProviderSecret(
  providerId: string,
  signal?: AbortSignal,
): Promise<ModelGatewayProviderSecretResponse> {
  return apiRequest<ModelGatewayProviderSecretResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}/secret`,
    { signal },
  );
}

/** POST /api/model-gateway/providers/:providerId/secret — set/clear the API key. */
export function setModelGatewayProviderSecret(
  providerId: string,
  payload: ModelGatewaySetProviderSecretRequest,
): Promise<ModelGatewayUpsertProviderResponse> {
  return apiRequest<ModelGatewayUpsertProviderResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}/secret`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

// ---------------------------------------------------------------------------
// Provider / route smoke tests
// ---------------------------------------------------------------------------

/** POST /api/model-gateway/providers/:providerId/test */
export function testModelGatewayProvider(
  providerId: string,
  payload: ModelGatewayProviderTestRequest = {},
): Promise<ModelGatewayProviderTestResponse> {
  return apiRequest<ModelGatewayProviderTestResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}/test`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** POST /api/model-gateway/active-route-smoke */
export function smokeModelGatewayActiveRoute(
  payload: ModelGatewayActiveRouteSmokeRequest = {},
): Promise<ModelGatewayProviderTestResponse> {
  return apiRequest<ModelGatewayProviderTestResponse>(`${BASE}/active-route-smoke`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

// ---------------------------------------------------------------------------
// Account providers (Codex login + per-account management)
// ---------------------------------------------------------------------------

/** POST /api/model-gateway/account-providers/codex/login/start */
export function startCodexAccountLogin(
  payload: ModelGatewayCodexAccountLoginStartRequest = {},
): Promise<ModelGatewayCodexAccountLoginStartResponse> {
  return apiRequest<ModelGatewayCodexAccountLoginStartResponse>(
    `${BASE}/account-providers/codex/login/start`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** POST /api/model-gateway/account-providers/codex/login/poll */
export function pollCodexAccountLogin(
  payload: ModelGatewayCodexAccountLoginPollRequest,
): Promise<ModelGatewayCodexAccountLoginPollResponse> {
  return apiRequest<ModelGatewayCodexAccountLoginPollResponse>(
    `${BASE}/account-providers/codex/login/poll`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/**
 * POST /api/model-gateway/providers/:providerId/accounts/:accountId
 *
 * Per-account update. Carries enable/disable (`enabled`), proxy override, and
 * cooldown clearing (`clearCooldown`) in the request body — there are no
 * separate enable/disable/clear-cooldown routes; they are fields here.
 */
export function updateModelGatewayProviderAccount(
  providerId: string,
  accountId: string,
  payload: ModelGatewayProviderAccountUpdateRequest,
): Promise<ModelGatewayProviderAccountUpdateResponse> {
  return apiRequest<ModelGatewayProviderAccountUpdateResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** POST /api/model-gateway/providers/:providerId/accounts/:accountId/refresh */
export function refreshModelGatewayProviderAccount(
  providerId: string,
  accountId: string,
): Promise<ModelGatewayProviderAccountRefreshResponse> {
  return apiRequest<ModelGatewayProviderAccountRefreshResponse>(
    `${BASE}/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}/refresh`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// App connections
// ---------------------------------------------------------------------------

/** GET /api/model-gateway/app-connections */
export function listModelGatewayAppConnections(
  signal?: AbortSignal,
): Promise<ModelGatewayAppConnectionsResponse> {
  return apiRequest<ModelGatewayAppConnectionsResponse>(`${BASE}/app-connections`, { signal });
}

/** POST /api/model-gateway/app-connections/profile — update the shared connection profile. */
export function updateModelGatewayAppConnectionProfile(
  payload: ModelGatewayUpdateAppConnectionProfileRequest,
): Promise<ModelGatewayUpdateAppConnectionProfileResponse> {
  return apiRequest<ModelGatewayUpdateAppConnectionProfileResponse>(
    `${BASE}/app-connections/profile`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** POST /api/model-gateway/app-connections/apply — apply all eligible connections. */
export function applyModelGatewayAppConnections(
  payload: ModelGatewayApplyAppConnectionRequest = {},
): Promise<ModelGatewayApplyAppConnectionsResponse> {
  return apiRequest<ModelGatewayApplyAppConnectionsResponse>(
    `${BASE}/app-connections/apply`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** POST /api/model-gateway/app-connections/:appId/apply — apply a single app's connection. */
export function applyModelGatewayAppConnection(
  appId: ModelGatewayAppConnectionId,
  payload: Omit<ModelGatewayApplyAppConnectionRequest, "appId"> = {},
): Promise<ModelGatewayApplyAppConnectionResponse> {
  return apiRequest<ModelGatewayApplyAppConnectionResponse>(
    `${BASE}/app-connections/${encodeURIComponent(appId)}/apply`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** POST /api/model-gateway/app-connections/:appId/rollback — restore a single app's backup. */
export function rollbackModelGatewayAppConnection(
  appId: ModelGatewayAppConnectionId,
  payload: Omit<ModelGatewayRollbackAppConnectionRequest, "appId"> = {},
): Promise<ModelGatewayRollbackAppConnectionResponse> {
  return apiRequest<ModelGatewayRollbackAppConnectionResponse>(
    `${BASE}/app-connections/${encodeURIComponent(appId)}/rollback`,
    {
      method: "POST",
      body: jsonBody(payload),
    },
  );
}

/** GET /api/model-gateway/app-connections/:appId/backups — list a single app's backup versions (newest-first). */
export function getAppConnectionBackups(
  appId: ModelGatewayAppConnectionId,
  signal?: AbortSignal,
): Promise<ModelGatewayAppConnectionBackupsResponse> {
  return apiRequest<ModelGatewayAppConnectionBackupsResponse>(
    `${BASE}/app-connections/${encodeURIComponent(appId)}/backups`,
    { signal },
  );
}

/** GET /api/model-gateway/app-connections/:appId/backups/:backupId — read a single backup's redacted content. */
export function getAppConnectionBackup(
  appId: ModelGatewayAppConnectionId,
  backupId: string,
  signal?: AbortSignal,
): Promise<ModelGatewayAppConnectionBackupContentResponse> {
  return apiRequest<ModelGatewayAppConnectionBackupContentResponse>(
    `${BASE}/app-connections/${encodeURIComponent(appId)}/backups/${encodeURIComponent(backupId)}`,
    { signal },
  );
}

// ---------------------------------------------------------------------------
// Daemon service
// ---------------------------------------------------------------------------

/** GET /api/model-gateway/daemon-service */
export function getModelGatewayDaemonService(
  signal?: AbortSignal,
): Promise<ModelGatewayDaemonServiceResponse> {
  return apiRequest<ModelGatewayDaemonServiceResponse>(`${BASE}/daemon-service`, { signal });
}

/** POST /api/model-gateway/daemon-service — preview/install/lifecycle actions. */
export function manageModelGatewayDaemonService(
  payload: ModelGatewayDaemonServiceRequest = {},
  signal?: AbortSignal,
): Promise<ModelGatewayDaemonServiceResponse> {
  return apiRequest<ModelGatewayDaemonServiceResponse>(`${BASE}/daemon-service`, {
    method: "POST",
    body: jsonBody(payload),
    signal,
  });
}
