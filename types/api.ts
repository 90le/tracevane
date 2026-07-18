export interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface TracevaneStandaloneTransportConfig {
  enabled: boolean;
  port: number;
}

export interface TracevaneGatewayTransportConfig {
  enabled: boolean;
  basePath: string;
}

export interface TracevaneTransportConfig {
  preferredMode?: TracevaneExposureKind;
  standalone: TracevaneStandaloneTransportConfig;
  gateway: TracevaneGatewayTransportConfig;
}

export type TracevaneRealtimeTransportKind = 'raw-ws' | 'gateway-rpc' | 'disabled';
export type TracevaneExposureKind = 'standalone' | 'gateway';

export type TracevaneStandaloneAuthMode = 'on' | 'off';

export interface TracevaneSecurityConfig {
  /**
   * Standalone HTTP auth gate. When 'on', every /api/** request (except
   * /api/auth/status and /api/auth/unlock) and every raw WebSocket upgrade
   * requires a valid tracevane_session cookie. Gateway exposure is not
   * affected; the OpenClaw host auth covers it.
   */
  auth: TracevaneStandaloneAuthMode;
  /**
   * Standalone HTTP bind host. Defaults to 127.0.0.1 (loopback only);
   * 0.0.0.0 is an explicit LAN opt-in.
   */
  bindHost: string;
}

export interface TracevaneClientRuntimeConfig {
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

export interface TracevaneServerConfig {
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
  transport: TracevaneTransportConfig;
  security: TracevaneSecurityConfig;
}
