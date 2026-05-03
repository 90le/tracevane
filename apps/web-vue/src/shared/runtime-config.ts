export type StudioRealtimeTransportKind = 'raw-ws' | 'gateway-rpc' | 'disabled';
export type StudioExposureKind = 'standalone' | 'gateway';

export interface StudioRuntimeConfig {
  exposureKind: StudioExposureKind;
  appBasePath: string;
  apiBasePath: string;
  webSocketBasePath: string;
  gatewayAuthStorageScopePath: string;
  terminalDirectWebSocketPort?: number | null;
  realtimeTransport: StudioRealtimeTransportKind;
  features: {
    chatRealtime: boolean;
    terminalRealtime: boolean;
  };
}

declare global {
  interface Window {
    __OPENCLAW_STUDIO_RUNTIME__?: StudioRuntimeConfig;
  }
}

function normalizeBasePath(value: string | undefined | null): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '/') return '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
}

function readBuildBasePath(): string {
  return normalizeBasePath(import.meta.env.STUDIO_BASE_PATH || '');
}

function createDefaultRuntimeConfig(): StudioRuntimeConfig {
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

export function getStudioRuntimeConfig(): StudioRuntimeConfig {
  if (typeof window === 'undefined') return createDefaultRuntimeConfig();
  const injected = window.__OPENCLAW_STUDIO_RUNTIME__;
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

export function getStudioExposureKind(): StudioExposureKind {
  return getStudioRuntimeConfig().exposureKind;
}

export function getStudioAppBasePath(): string {
  return getStudioRuntimeConfig().appBasePath;
}

export function getStudioApiBasePath(): string {
  return getStudioRuntimeConfig().apiBasePath;
}

export function getStudioWebSocketBasePath(): string {
  return getStudioRuntimeConfig().webSocketBasePath;
}

export function getStudioGatewayAuthStorageScopePath(): string {
  return getStudioRuntimeConfig().gatewayAuthStorageScopePath;
}

export function getStudioTerminalDirectWebSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  const port = getStudioRuntimeConfig().terminalDirectWebSocketPort;
  if (!port) return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:${port}/ws/terminal`;
}

export function getStudioRealtimeTransport(): StudioRealtimeTransportKind {
  return getStudioRuntimeConfig().realtimeTransport;
}

export function isChatRealtimeEnabled(): boolean {
  return getStudioRuntimeConfig().features.chatRealtime;
}

export function isTerminalRealtimeEnabled(): boolean {
  return getStudioRuntimeConfig().features.terminalRealtime;
}
