import type {
  ModelGatewayActiveRouteSmokeRequest,
  ModelGatewayClientAuthResponse,
  ModelGatewayClientAuthUpdateRequest,
  ModelGatewayCodexAccountLoginPollRequest,
  ModelGatewayCodexAccountLoginPollResponse,
  ModelGatewayCodexAccountLoginStartRequest,
  ModelGatewayCodexAccountLoginStartResponse,
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceRequest,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayAppConnectionId,
  ModelGatewayAppConnectionProfile,
  ModelGatewayAppConnectionsResponse,
  ModelGatewayApplyAppConnectionsResponse,
  ModelGatewayApplyAppConnectionResponse,
  ModelGatewayRollbackAppConnectionResponse,
  ModelGatewayUpdateAppConnectionProfileResponse,
  ModelGatewayProviderAccountRefreshResponse,
  ModelGatewayProviderAccountUpdateRequest,
  ModelGatewayProviderAccountUpdateResponse,
  ModelGatewayProviderDetectRequest,
  ModelGatewayProviderDetectResponse,
  ModelGatewayProviderView,
  ModelGatewayProviderTestRequest,
  ModelGatewayProviderTestResponse,
  ModelGatewayProvidersResponse,
  ModelGatewayRuntimeResponse,
  ModelGatewaySetActiveProviderRequest,
  ModelGatewayStatusResponse,
  ModelGatewayUpsertProviderRequest,
  ModelGatewayUsageLedgerResponse,
} from '../../../../../types/model-gateway';
import { fetchStudioResponse, requestJson } from '../../shared/api';

async function requestModelGatewayJson<T>(
  input: string,
  init?: RequestInit,
  options: { allowErrorBody?: boolean } = {},
): Promise<T> {
  const response = await fetchStudioResponse(input, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) as T : {} as T;

  if (!response.ok && !options.allowErrorBody) {
    const shaped = body as { message?: string; error?: string };
    throw new Error(shaped.message || shaped.error || `${response.status} ${response.statusText}`);
  }

  return body;
}

function jsonBody(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export function fetchModelGatewayStatus(): Promise<ModelGatewayStatusResponse> {
  return requestJson<ModelGatewayStatusResponse>('/api/model-gateway/status');
}

export function fetchModelGatewayRuntime(): Promise<ModelGatewayRuntimeResponse> {
  return requestJson<ModelGatewayRuntimeResponse>('/api/model-gateway/runtime');
}

export function fetchModelGatewayUsageLedger(): Promise<ModelGatewayUsageLedgerResponse> {
  return requestJson<ModelGatewayUsageLedgerResponse>('/api/model-gateway/usage');
}

export function fetchModelGatewayClientAuth(): Promise<ModelGatewayClientAuthResponse> {
  return requestJson<ModelGatewayClientAuthResponse>('/api/model-gateway/client-auth');
}

export function updateModelGatewayClientAuth(payload: ModelGatewayClientAuthUpdateRequest): Promise<ModelGatewayClientAuthResponse> {
  return requestJson<ModelGatewayClientAuthResponse>('/api/model-gateway/client-auth', jsonBody(payload));
}

export function fetchModelGatewayAppConnections(): Promise<ModelGatewayAppConnectionsResponse> {
  return requestJson<ModelGatewayAppConnectionsResponse>('/api/model-gateway/app-connections');
}

export function updateModelGatewayAppConnectionProfile(profile: Partial<ModelGatewayAppConnectionProfile>): Promise<ModelGatewayUpdateAppConnectionProfileResponse> {
  return requestJson<ModelGatewayUpdateAppConnectionProfileResponse>(
    '/api/model-gateway/app-connections/profile',
    jsonBody({ profile }),
  );
}

export function applyModelGatewayAppConnection(
  appId: ModelGatewayAppConnectionId,
  profile?: Partial<ModelGatewayAppConnectionProfile>,
): Promise<ModelGatewayApplyAppConnectionResponse> {
  return requestJson<ModelGatewayApplyAppConnectionResponse>(
    `/api/model-gateway/app-connections/${encodeURIComponent(appId)}/apply`,
    jsonBody({ appId, profile }),
  );
}

export function applyAllModelGatewayAppConnections(profile?: Partial<ModelGatewayAppConnectionProfile>): Promise<ModelGatewayApplyAppConnectionsResponse> {
  return requestJson<ModelGatewayApplyAppConnectionsResponse>(
    '/api/model-gateway/app-connections/apply',
    jsonBody({ profile }),
  );
}

export function rollbackModelGatewayAppConnection(appId: ModelGatewayAppConnectionId): Promise<ModelGatewayRollbackAppConnectionResponse> {
  return requestJson<ModelGatewayRollbackAppConnectionResponse>(
    `/api/model-gateway/app-connections/${encodeURIComponent(appId)}/rollback`,
    jsonBody({ appId }),
  );
}

export function fetchModelGatewayDaemonService(): Promise<ModelGatewayDaemonServiceResponse> {
  return requestJson<ModelGatewayDaemonServiceResponse>('/api/model-gateway/daemon-service');
}

export function manageModelGatewayDaemonService(
  action: ModelGatewayDaemonServiceAction,
  request: Omit<ModelGatewayDaemonServiceRequest, 'action'> = {},
): Promise<ModelGatewayDaemonServiceResponse> {
  return requestJson<ModelGatewayDaemonServiceResponse>(
    '/api/model-gateway/daemon-service',
    jsonBody({ ...request, action }),
  );
}

export function fetchModelGatewayProviders(): Promise<ModelGatewayProvidersResponse> {
  return requestJson<ModelGatewayProvidersResponse>('/api/model-gateway/providers');
}

export function detectModelGatewayProvider(payload: ModelGatewayProviderDetectRequest): Promise<ModelGatewayProviderDetectResponse> {
  return requestJson<ModelGatewayProviderDetectResponse>('/api/model-gateway/detect-provider', jsonBody(payload));
}

export function startModelGatewayCodexAccountLogin(
  payload: ModelGatewayCodexAccountLoginStartRequest = {},
): Promise<ModelGatewayCodexAccountLoginStartResponse> {
  return requestJson<ModelGatewayCodexAccountLoginStartResponse>(
    '/api/model-gateway/account-providers/codex/login/start',
    jsonBody(payload),
  );
}

export function pollModelGatewayCodexAccountLogin(
  payload: ModelGatewayCodexAccountLoginPollRequest,
): Promise<ModelGatewayCodexAccountLoginPollResponse> {
  return requestJson<ModelGatewayCodexAccountLoginPollResponse>(
    '/api/model-gateway/account-providers/codex/login/poll',
    jsonBody(payload),
  );
}

export function updateModelGatewayProviderAccount(
  providerId: string,
  accountId: string,
  payload: ModelGatewayProviderAccountUpdateRequest,
): Promise<ModelGatewayProviderAccountUpdateResponse> {
  return requestJson<ModelGatewayProviderAccountUpdateResponse>(
    `/api/model-gateway/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}`,
    jsonBody(payload),
  );
}

export function refreshModelGatewayProviderAccount(
  providerId: string,
  accountId: string,
): Promise<ModelGatewayProviderAccountRefreshResponse> {
  return requestJson<ModelGatewayProviderAccountRefreshResponse>(
    `/api/model-gateway/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}/refresh`,
    jsonBody({}),
  );
}

export function upsertModelGatewayProvider(payload: ModelGatewayUpsertProviderRequest): Promise<{
  ok: true;
  provider: ModelGatewayProviderView;
}> {
  return requestJson<{ ok: true; provider: ModelGatewayProviderView }>('/api/model-gateway/providers', jsonBody(payload));
}

export function deleteModelGatewayProvider(providerId: string): Promise<ModelGatewayProvidersResponse> {
  return requestJson<ModelGatewayProvidersResponse>(
    `/api/model-gateway/providers/${encodeURIComponent(providerId)}`,
    { method: 'DELETE' },
  );
}

export function setModelGatewayActiveProvider(payload: ModelGatewaySetActiveProviderRequest): Promise<ModelGatewayProvidersResponse> {
  return requestJson<ModelGatewayProvidersResponse>('/api/model-gateway/active-provider', jsonBody(payload));
}

export function smokeModelGatewayActiveRoute(payload: ModelGatewayActiveRouteSmokeRequest): Promise<ModelGatewayProviderTestResponse> {
  return requestModelGatewayJson<ModelGatewayProviderTestResponse>(
    '/api/model-gateway/active-route-smoke',
    jsonBody(payload),
    { allowErrorBody: true },
  );
}

export function testModelGatewayProvider(
  providerId: string,
  payload: ModelGatewayProviderTestRequest,
): Promise<ModelGatewayProviderTestResponse> {
  return requestModelGatewayJson<ModelGatewayProviderTestResponse>(
    `/api/model-gateway/providers/${encodeURIComponent(providerId)}/test`,
    jsonBody(payload),
    { allowErrorBody: true },
  );
}
