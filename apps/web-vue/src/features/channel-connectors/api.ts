import type {
  ChannelConnectorCommandActionRequest,
  ChannelConnectorCommandActionResponse,
  ChannelConnectorCommandSurfaceRequest,
  ChannelConnectorCommandSurfaceResponse,
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeResponse,
  ChannelConnectorsDaemonAction,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsSaveNativeConfigRequest,
  ChannelConnectorsStatusResponse,
} from '../../../../../types/channel-connectors';
import { requestJson } from '../../shared/api';

function jsonBody(payload: unknown, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export function fetchChannelConnectorsStatus(): Promise<ChannelConnectorsStatusResponse> {
  return requestJson<ChannelConnectorsStatusResponse>('/api/channel-connectors/status');
}

export function fetchChannelConnectorsNativeConfig(): Promise<ChannelConnectorsNativeConfigResponse> {
  return requestJson<ChannelConnectorsNativeConfigResponse>('/api/channel-connectors/config');
}

export function saveChannelConnectorsNativeConfig(
  payload: ChannelConnectorsSaveNativeConfigRequest,
): Promise<ChannelConnectorsNativeConfigResponse> {
  return requestJson<ChannelConnectorsNativeConfigResponse>(
    '/api/channel-connectors/config',
    jsonBody(payload, 'PUT'),
  );
}

export function previewChannelConnectorCommandSurface(
  payload: ChannelConnectorCommandSurfaceRequest = {},
): Promise<ChannelConnectorCommandSurfaceResponse> {
  return requestJson<ChannelConnectorCommandSurfaceResponse>(
    '/api/channel-connectors/commands/surface',
    jsonBody(payload),
  );
}

export function runChannelConnectorCommandAction(
  payload: ChannelConnectorCommandActionRequest = {},
): Promise<ChannelConnectorCommandActionResponse> {
  return requestJson<ChannelConnectorCommandActionResponse>(
    '/api/channel-connectors/commands/action',
    jsonBody(payload),
  );
}

export function runFeishuTransportSmoke(
  payload: ChannelConnectorFeishuTransportSmokeRequest = {},
): Promise<ChannelConnectorFeishuTransportSmokeResponse> {
  return requestJson<ChannelConnectorFeishuTransportSmokeResponse>(
    '/api/channel-connectors/adapters/feishu/transport-smoke',
    jsonBody(payload),
  );
}

export function runOctoTransportSmoke(
  payload: ChannelConnectorOctoTransportSmokeRequest = {},
): Promise<ChannelConnectorOctoTransportSmokeResponse> {
  return requestJson<ChannelConnectorOctoTransportSmokeResponse>(
    '/api/channel-connectors/adapters/octo/transport-smoke',
    jsonBody(payload),
  );
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

export function fetchChannelConnectorAgentSessions(): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
  return requestJson<ChannelConnectorAgentSessionDriverStatusResponse>('/api/channel-connectors/agent-sessions');
}

export function manageChannelConnectorAgentSessions(
  payload: ChannelConnectorAgentSessionActionRequest = {},
): Promise<ChannelConnectorAgentSessionDriverStatusResponse> {
  return requestJson<ChannelConnectorAgentSessionDriverStatusResponse>(
    '/api/channel-connectors/agent-sessions',
    jsonBody(payload),
  );
}
