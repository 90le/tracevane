import type {
  CcBridgeConfigPreviewResponse,
  CcBridgeLogsResponse,
  CcBridgeServiceAction,
  CcBridgeServiceRequest,
  CcBridgeServiceResponse,
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

export function fetchCcBridgeConfig(): Promise<CcBridgeConfigPreviewResponse> {
  return requestJson<CcBridgeConfigPreviewResponse>('/api/channel-connectors/cc-bridge/config');
}

export function fetchCcBridgeService(): Promise<CcBridgeServiceResponse> {
  return requestJson<CcBridgeServiceResponse>('/api/channel-connectors/cc-bridge/service');
}

export function manageCcBridgeService(
  action: CcBridgeServiceAction,
  request: Omit<CcBridgeServiceRequest, 'action'> = {},
): Promise<CcBridgeServiceResponse> {
  return requestJson<CcBridgeServiceResponse>(
    '/api/channel-connectors/cc-bridge/service',
    jsonBody({ ...request, action }),
  );
}

export function fetchCcBridgeLogs(): Promise<CcBridgeLogsResponse> {
  return requestJson<CcBridgeLogsResponse>('/api/channel-connectors/cc-bridge/logs');
}
