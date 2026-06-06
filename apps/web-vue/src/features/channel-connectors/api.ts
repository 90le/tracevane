import type {
  ChannelConnectorsDaemonAction,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import { requestJson } from '../../shared/api';

function jsonBody(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export function fetchChannelConnectorsStatus(): Promise<ChannelConnectorsStatusResponse> {
  return requestJson<ChannelConnectorsStatusResponse>('/api/channel-connectors/status');
}

export function fetchChannelConnectorsDaemonConfig(): Promise<ChannelConnectorsDaemonConfigResponse> {
  return requestJson<ChannelConnectorsDaemonConfigResponse>('/api/channel-connectors/daemon/config');
}

export function fetchChannelConnectorsDaemonService(): Promise<ChannelConnectorsDaemonResponse> {
  return requestJson<ChannelConnectorsDaemonResponse>('/api/channel-connectors/daemon/service');
}

export function manageChannelConnectorsDaemonService(
  action: ChannelConnectorsDaemonAction,
  request: Omit<ChannelConnectorsDaemonRequest, 'action'> = {},
): Promise<ChannelConnectorsDaemonResponse> {
  return requestJson<ChannelConnectorsDaemonResponse>(
    '/api/channel-connectors/daemon/service',
    jsonBody({ ...request, action }),
  );
}

export function fetchChannelConnectorsDaemonLogs(): Promise<ChannelConnectorsLogsResponse> {
  return requestJson<ChannelConnectorsLogsResponse>('/api/channel-connectors/daemon/logs');
}
