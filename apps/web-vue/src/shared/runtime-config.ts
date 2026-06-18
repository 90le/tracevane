export type TracevaneRealtimeTransportKind = 'raw-ws' | 'gateway-rpc' | 'disabled';
export type TracevaneExposureKind = 'standalone' | 'gateway';

export interface TracevaneRuntimeConfig {
  exposureKind: TracevaneExposureKind;
  appBasePath: string;
  apiBasePath: string;
  webSocketBasePath: string;
  gatewayAuthStorageScopePath: string;
  terminalDirectWebSocketPort?: number | null;
  realtimeTransport: TracevaneRealtimeTransportKind;
  features: {
    chatRealtime: boolean;
    terminalRealtime: boolean;
  };
}

declare global {
  interface Window {
    __TRACEVANE_RUNTIME__?: TracevaneRuntimeConfig;
  }
}

function normalizeBasePath(value: string | undefined | null): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '/') return '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
}

function readBuildBasePath(): string {
  return normalizeBasePath(import.meta.env.TRACEVANE_BASE_PATH || '');
}

function createDefaultRuntimeConfig(): TracevaneRuntimeConfig {
  const buildBasePath = readBuildBasePath();
  return {
    exposureKind: 'standalone',
    appBasePath: buildBasePath,
    apiBasePath: '',
    webSocketBasePath: buildBasePath,
    gatewayAuthStorageScopePath: '',
    terminalDirectWebSocketPort: null,
    realtimeTransport: 'raw-ws',
    features: {
      chatRealtime: true,
      terminalRealtime: true,
    },
  };
}

export function getTracevaneRuntimeConfig(): TracevaneRuntimeConfig {
  if (typeof window === 'undefined') return createDefaultRuntimeConfig();
  const injected = window.__TRACEVANE_RUNTIME__;
  if (!injected || typeof injected !== 'object') return createDefaultRuntimeConfig();

  const fallback = createDefaultRuntimeConfig();
  return {
    exposureKind: injected.exposureKind === 'gateway' ? 'gateway' : fallback.exposureKind,
    appBasePath: normalizeBasePath(injected.appBasePath) || fallback.appBasePath,
    apiBasePath: normalizeBasePath(injected.apiBasePath),
    webSocketBasePath: normalizeBasePath(injected.webSocketBasePath),
    gatewayAuthStorageScopePath:
      normalizeBasePath(injected.gatewayAuthStorageScopePath) || fallback.gatewayAuthStorageScopePath,
    terminalDirectWebSocketPort:
      typeof injected.terminalDirectWebSocketPort === 'number'
        && Number.isFinite(injected.terminalDirectWebSocketPort)
        && injected.terminalDirectWebSocketPort > 0
        ? Math.floor(injected.terminalDirectWebSocketPort)
        : fallback.terminalDirectWebSocketPort,
    realtimeTransport: injected.realtimeTransport || fallback.realtimeTransport,
    features: {
      chatRealtime: injected.features?.chatRealtime ?? fallback.features.chatRealtime,
      terminalRealtime: injected.features?.terminalRealtime ?? fallback.features.terminalRealtime,
    },
  };
}

export function getTracevaneExposureKind(): TracevaneExposureKind {
  return getTracevaneRuntimeConfig().exposureKind;
}

export function getTracevaneAppBasePath(): string {
  return getTracevaneRuntimeConfig().appBasePath;
}

export function getTracevaneApiBasePath(): string {
  return getTracevaneRuntimeConfig().apiBasePath;
}

export function getTracevaneWebSocketBasePath(): string {
  return getTracevaneRuntimeConfig().webSocketBasePath;
}

export function getTracevaneGatewayAuthStorageScopePath(): string {
  return getTracevaneRuntimeConfig().gatewayAuthStorageScopePath;
}

export function getTracevaneTerminalDirectWebSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  const port = getTracevaneRuntimeConfig().terminalDirectWebSocketPort;
  if (!port) return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:${port}/ws/terminal`;
}

export function getTracevaneRealtimeTransport(): TracevaneRealtimeTransportKind {
  return getTracevaneRuntimeConfig().realtimeTransport;
}

export function isChatRealtimeEnabled(): boolean {
  return getTracevaneRuntimeConfig().features.chatRealtime;
}

export function isTerminalRealtimeEnabled(): boolean {
  return getTracevaneRuntimeConfig().features.terminalRealtime;
}
