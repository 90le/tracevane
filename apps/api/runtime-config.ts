import type {
  StudioClientRuntimeConfig,
  StudioExposureKind,
  StudioServerConfig,
} from '../../types/api.js';

function normalizeBasePath(value: string): string {
  if (!value || value === '/') return '';
  return value.startsWith('/') ? value : `/${value}`;
}

export function buildStudioClientRuntimeConfig(
  config: StudioServerConfig,
  exposureKind: StudioExposureKind
): StudioClientRuntimeConfig {
  const gatewayAuthStorageScopePath = config.gatewayControlUiBasePath || '';
  if (exposureKind === 'gateway') {
    const basePath = normalizeBasePath(config.transport.gateway.basePath);
    return {
      exposureKind,
      appBasePath: basePath,
      apiBasePath: basePath,
      webSocketBasePath: basePath,
      gatewayAuthStorageScopePath,
      realtimeTransport: 'gateway-rpc',
      features: {
        chatRealtime: true,
        terminalRealtime: true,
      },
    };
  }

  return {
    exposureKind,
    appBasePath: '',
    apiBasePath: '',
    webSocketBasePath: '',
    gatewayAuthStorageScopePath,
    realtimeTransport: 'raw-ws',
    features: {
      chatRealtime: true,
      terminalRealtime: true,
    },
  };
}
