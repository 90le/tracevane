import { requestJson } from '../../shared/api';
import type {
  ChannelAccessMutationResponse,
  ChannelAccessUpdatePayload,
  ChannelAccountAccessPayload,
  ChannelAccountCredentialsPayload,
  ChannelAccountInput,
  ChannelBindingInput,
  ChannelPairingApprovePayload,
  ChannelPairingApproveResponse,
  ChannelPairingPayload,
  ChannelSettingsInput,
  ChannelsMutationResponse,
  ChannelsSummaryPayload,
} from '../../../../../types/channels';

function jsonRequest<T>(input: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  return requestJson<T>(input, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function fetchChannelsSummary(): Promise<ChannelsSummaryPayload> {
  return requestJson<ChannelsSummaryPayload>('/api/channels');
}

export function createChannel(type: string, enabled = true): Promise<ChannelsMutationResponse> {
  return jsonRequest<ChannelsMutationResponse>('/api/channels', 'POST', { type, enabled });
}

export function updateChannel(channelType: string, payload: ChannelSettingsInput): Promise<ChannelsMutationResponse> {
  return jsonRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(channelType)}`, 'PUT', payload);
}

export function deleteChannel(channelType: string): Promise<ChannelsMutationResponse> {
  return requestJson<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(channelType)}`, {
    method: 'DELETE',
  });
}

export function createChannelAccount(channelType: string, payload: ChannelAccountInput): Promise<ChannelsMutationResponse> {
  return jsonRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(channelType)}/accounts`, 'POST', payload);
}

export function updateChannelAccount(channelType: string, accountId: string, payload: ChannelAccountInput): Promise<ChannelsMutationResponse> {
  return jsonRequest<ChannelsMutationResponse>(
    `/api/channels/${encodeURIComponent(channelType)}/accounts/${encodeURIComponent(accountId)}`,
    'PUT',
    payload
  );
}

export function deleteChannelAccount(channelType: string, accountId: string): Promise<ChannelsMutationResponse> {
  return requestJson<ChannelsMutationResponse>(
    `/api/channels/${encodeURIComponent(channelType)}/accounts/${encodeURIComponent(accountId)}`,
    {
      method: 'DELETE',
    }
  );
}

export function fetchChannelAccountAccess(channelType: string, accountId: string): Promise<ChannelAccountAccessPayload> {
  return requestJson<ChannelAccountAccessPayload>(
    `/api/channels/${encodeURIComponent(channelType)}/accounts/${encodeURIComponent(accountId)}/access`
  );
}

export function fetchChannelAccountCredentials(channelType: string, accountId: string): Promise<ChannelAccountCredentialsPayload> {
  return requestJson<ChannelAccountCredentialsPayload>(
    `/api/channels/${encodeURIComponent(channelType)}/accounts/${encodeURIComponent(accountId)}/credentials`
  );
}

export function saveChannelAccountAccess(
  channelType: string,
  accountId: string,
  payload: ChannelAccessUpdatePayload
): Promise<ChannelAccessMutationResponse> {
  return jsonRequest<ChannelAccessMutationResponse>(
    `/api/channels/${encodeURIComponent(channelType)}/accounts/${encodeURIComponent(accountId)}/access`,
    'PUT',
    payload
  );
}

export function fetchChannelPairing(channelType: string, accountId?: string | null): Promise<ChannelPairingPayload> {
  const search = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  return requestJson<ChannelPairingPayload>(`/api/channels/${encodeURIComponent(channelType)}/pairing${search}`);
}

export function approveChannelPairing(
  channelType: string,
  payload: ChannelPairingApprovePayload
): Promise<ChannelPairingApproveResponse> {
  return jsonRequest<ChannelPairingApproveResponse>(
    `/api/channels/${encodeURIComponent(channelType)}/pairing/approve`,
    'POST',
    payload
  );
}

export function createChannelBinding(payload: ChannelBindingInput): Promise<ChannelsMutationResponse> {
  return jsonRequest<ChannelsMutationResponse>('/api/channels/bindings', 'POST', payload);
}

export function updateChannelBinding(bindingId: string, payload: ChannelBindingInput): Promise<ChannelsMutationResponse> {
  return jsonRequest<ChannelsMutationResponse>(`/api/channels/bindings/${encodeURIComponent(bindingId)}`, 'PUT', payload);
}

export function deleteChannelBinding(bindingId: string): Promise<ChannelsMutationResponse> {
  return requestJson<ChannelsMutationResponse>(`/api/channels/bindings/${encodeURIComponent(bindingId)}`, {
    method: 'DELETE',
  });
}
