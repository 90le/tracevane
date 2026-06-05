import type {
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceRequest,
  ModelGatewayDaemonServiceResponse,
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
