import type {
  TracevaneClientRuntimeConfig,
  TracevaneExposureKind,
  TracevaneServerConfig,
} from '../../types/api.js';

function normalizeBasePath(value: string): string {
  if (!value || value === '/') return '';
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
}

function getStandaloneBasePath(): string {
  return normalizeBasePath(process.env.TRACEVANE_BASE_PATH || '');
}

export function buildTracevaneClientRuntimeConfig(
  config: TracevaneServerConfig,
  exposureKind: TracevaneExposureKind
): TracevaneClientRuntimeConfig {
  const gatewayAuthStorageScopePath = config.gatewayControlUiBasePath || '';
  if (exposureKind === 'gateway') {
    const basePath = normalizeBasePath(config.transport.gateway.basePath);
    return {
      exposureKind,
      appBasePath: basePath,
      apiBasePath: basePath,
      webSocketBasePath: basePath,
      gatewayAuthStorageScopePath,
      terminalDirectWebSocketPort: null,
      realtimeTransport: 'gateway-rpc',
      features: {
        chatRealtime: true,
        terminalRealtime: true,
      },
    };
  }

  const basePath = getStandaloneBasePath();
  return {
    exposureKind,
    appBasePath: basePath,
    apiBasePath: basePath,
    webSocketBasePath: basePath,
    gatewayAuthStorageScopePath,
    terminalDirectWebSocketPort: null,
    realtimeTransport: 'raw-ws',
    features: {
      chatRealtime: true,
      terminalRealtime: true,
    },
  };
}
