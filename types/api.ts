export interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface StudioStandaloneTransportConfig {
  enabled: boolean;
  port: number;
}

export interface StudioGatewayTransportConfig {
  enabled: boolean;
  basePath: string;
}

export interface StudioTransportConfig {
  standalone: StudioStandaloneTransportConfig;
  gateway: StudioGatewayTransportConfig;
}

export type StudioRealtimeTransportKind = 'raw-ws' | 'gateway-rpc' | 'disabled';
export type StudioExposureKind = 'standalone' | 'gateway';

export interface StudioClientRuntimeConfig {
  exposureKind: StudioExposureKind;
  appBasePath: string;
  apiBasePath: string;
  webSocketBasePath: string;
  gatewayAuthStorageScopePath: string;
  realtimeTransport: StudioRealtimeTransportKind;
  features: {
    chatRealtime: boolean;
    terminalRealtime: boolean;
  };
}

export interface StudioServerConfig {
  pluginId: string;
  pluginName: string;
  version: string;
  port: number;
  autoStart: boolean;
  openclawRoot: string;
  openclawConfigFile: string;
  projectRoot: string;
  webDistDir: string;
  gatewayPort: number;
  gatewayWsUrl: string;
  gatewayControlUiBasePath: string;
  transport: StudioTransportConfig;
}
