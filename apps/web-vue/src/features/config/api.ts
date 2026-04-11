import { requestJson } from '../../shared/api';
import type { ChannelsSummaryPayload } from '../../../../../types/channels';
import type { ConfigChannelSecretPayload, ConfigProviderSecretPayload, ConfigSaveResponse, ConfigSummaryPayload, ConfigUpdatePayload } from '../../../../../types/config';

export function fetchConfigSummary(): Promise<ConfigSummaryPayload> {
  return requestJson<ConfigSummaryPayload>('/api/config');
}

export function fetchConfigChannelSummary(): Promise<ChannelsSummaryPayload> {
  return requestJson<ChannelsSummaryPayload>('/api/channels');
}

export function saveConfig(payload: ConfigUpdatePayload): Promise<ConfigSaveResponse> {
  return requestJson<ConfigSaveResponse>('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function fetchProviderSecret(providerId: string): Promise<ConfigProviderSecretPayload> {
  return requestJson<ConfigProviderSecretPayload>(`/api/config/providers/${encodeURIComponent(providerId)}/secret`);
}

export function fetchChannelSecret(channelId: string, accountId: string): Promise<ConfigChannelSecretPayload> {
  return requestJson<ConfigChannelSecretPayload>(`/api/config/channel-secret/${encodeURIComponent(channelId)}/${encodeURIComponent(accountId)}`);
}
