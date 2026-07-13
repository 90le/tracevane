import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { resolveProjectRoot } from '../../lib/project-root.js';
import type { TracevaneExposureKind, TracevaneServerConfig, TracevaneTransportConfig } from '../../types/api.js';

const DEFAULT_PORT = 3760;
const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_GATEWAY_BASE_PATH = '/tracevane';
const TRACEVANE_VERSION_FALLBACK = '0.1.72';

let cachedTracevaneVersion: string | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePort(value: unknown, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? Math.floor(port) : fallback;
}

function normalizeExposureKind(value: unknown): TracevaneExposureKind | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'gateway' || normalized === 'standalone' ? normalized : null;
}

function normalizeGatewayBasePath(value: unknown, fallback = DEFAULT_GATEWAY_BASE_PATH): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const withLeadingSlash = (raw || fallback).startsWith('/')
    ? (raw || fallback)
    : `/${raw || fallback}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/g, '') : collapsed;
  return trimmed === '/' ? fallback : trimmed;
}

function normalizeOptionalBasePath(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '/') return '';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
}

function buildGatewayWsUrl(port: number): string {
  return `ws://127.0.0.1:${port}`;
}

function resolveOpenClawRoot(api: OpenClawPluginApi): string {
  const envFallback =
    process.env.OPENCLAW_STATE_DIR
    || path.join(process.env.HOME || os.homedir(), '.openclaw');

  if (typeof api.resolvePath !== 'function') {
    return envFallback;
  }

  try {
    const resolved = api.resolvePath('~/.openclaw');
    return typeof resolved === 'string' && resolved.trim() ? resolved : envFallback;
  } catch {
    return envFallback;
  }
}

function resolveTracevaneVersion(projectRoot: string): string {
  if (cachedTracevaneVersion) {
    return cachedTracevaneVersion;
  }
  try {
    const packagePath = path.join(projectRoot, 'package.json');
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
    if (version) {
      cachedTracevaneVersion = version;
      return version;
    }
  } catch {
    // Fallback to built-in version when package metadata is unavailable.
  }
  cachedTracevaneVersion = TRACEVANE_VERSION_FALLBACK;
  return cachedTracevaneVersion;
}

function readGatewayPortFromOpenClawConfig(openclawConfigFile: string, fallback: number): number {
  try {
    const raw = fs.readFileSync(openclawConfigFile, 'utf-8');
    const parsed = JSON.parse(raw) as { gateway?: { port?: unknown } };
    return normalizePort(parsed?.gateway?.port, fallback);
  } catch {
    return fallback;
  }
}

function readGatewayRuntimeFromOpenClawConfig(
  openclawConfigFile: string,
  fallbackPort: number,
  fallbackControlUiBasePath = '',
): { port: number; controlUiBasePath: string } {
  try {
    const raw = fs.readFileSync(openclawConfigFile, 'utf-8');
    const parsed = JSON.parse(raw) as {
      gateway?: {
        port?: unknown;
        controlUi?: { basePath?: unknown };
      };
    };
    return {
      port: normalizePort(parsed?.gateway?.port, fallbackPort),
      controlUiBasePath: normalizeOptionalBasePath(parsed?.gateway?.controlUi?.basePath) || fallbackControlUiBasePath,
    };
  } catch {
    return {
      port: fallbackPort,
      controlUiBasePath: fallbackControlUiBasePath,
    };
  }
}

function resolveTransportConfig(
  pluginConfig: Record<string, unknown>,
  standalonePort: number
): TracevaneTransportConfig {
  const transport = isRecord(pluginConfig.transport) ? pluginConfig.transport : {};
  const standalone = isRecord(transport.standalone) ? transport.standalone : {};
  const gateway = isRecord(transport.gateway) ? transport.gateway : {};
  const gatewayEnabled = gateway.enabled !== false;
  const standaloneEnabled = standalone.enabled !== false;
  const preferredMode = normalizeExposureKind(transport.preferredMode)
    || normalizeExposureKind(pluginConfig.preferredMode)
    || normalizeExposureKind(pluginConfig.mode)
    || (gatewayEnabled && !standaloneEnabled ? 'gateway' : 'standalone');

  return {
    preferredMode,
    standalone: {
      enabled: standaloneEnabled,
      port: normalizePort(standalone.port, standalonePort),
    },
    gateway: {
      enabled: gatewayEnabled,
      basePath: normalizeGatewayBasePath(
        gateway.basePath,
        typeof pluginConfig.gatewayBasePath === 'string' ? pluginConfig.gatewayBasePath : DEFAULT_GATEWAY_BASE_PATH
      ),
    },
  };
}

export function isTracevaneStandaloneEnabled(config: TracevaneServerConfig): boolean {
  return config.autoStart && config.transport.standalone.enabled;
}

export function isTracevaneGatewayEnabled(config: TracevaneServerConfig): boolean {
  return config.autoStart && config.transport.gateway.enabled;
}

export function createTracevaneConfig(
  api: OpenClawPluginApi,
  pluginConfig: Record<string, unknown> = {}
): TracevaneServerConfig {
  const projectRoot = resolveProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
  const tracevaneVersion = resolveTracevaneVersion(projectRoot);
  const openclawRoot = resolveOpenClawRoot(api);
  const openclawConfigFile = path.join(openclawRoot, 'openclaw.json');
  const gatewayConfig = (api.config?.gateway || {}) as { port?: unknown; controlUi?: { basePath?: unknown } };
  const gatewayRuntime = readGatewayRuntimeFromOpenClawConfig(
    openclawConfigFile,
    normalizePort(gatewayConfig.port, DEFAULT_GATEWAY_PORT),
    normalizeOptionalBasePath(gatewayConfig.controlUi?.basePath),
  );
  const gatewayPort = gatewayRuntime.port;
  const standalonePort = normalizePort(pluginConfig.apiPort, DEFAULT_PORT);
  const transport = resolveTransportConfig(pluginConfig, standalonePort);

  return {
    pluginId: 'tracevane',
    pluginName: 'Tracevane',
    version: tracevaneVersion,
    port: transport.standalone.port,
    autoStart: pluginConfig.autoStart !== false,
    openclawRoot,
    openclawConfigFile,
    projectRoot,
    webDistDir: path.join(projectRoot, 'apps', 'web', 'dist'),
    gatewayPort,
    gatewayWsUrl: buildGatewayWsUrl(gatewayPort),
    gatewayControlUiBasePath: gatewayRuntime.controlUiBasePath,
    transport,
  };
}

export function createStandaloneTracevaneConfig(overrides: Partial<TracevaneServerConfig> = {}): TracevaneServerConfig {
  const projectRoot = path.resolve(overrides.projectRoot || resolveProjectRoot(path.dirname(fileURLToPath(import.meta.url))));
  const tracevaneVersion = resolveTracevaneVersion(projectRoot);
  const openclawRoot = overrides.openclawRoot
    || process.env.OPENCLAW_STATE_DIR
    || path.join(process.env.HOME || os.homedir(), '.openclaw');
  const openclawConfigFile = overrides.openclawConfigFile || path.join(openclawRoot, 'openclaw.json');
  const gatewayPort = overrides.gatewayPort === undefined
    ? readGatewayPortFromOpenClawConfig(openclawConfigFile, DEFAULT_GATEWAY_PORT)
    : normalizePort(overrides.gatewayPort, DEFAULT_GATEWAY_PORT);
  const standalonePort = normalizePort(overrides.port, DEFAULT_PORT);
  const transport = overrides.transport || {
    preferredMode: 'standalone',
    standalone: {
      enabled: true,
      port: standalonePort,
    },
    gateway: {
      enabled: false,
      basePath: DEFAULT_GATEWAY_BASE_PATH,
    },
  };

  return {
    pluginId: overrides.pluginId || 'tracevane',
    pluginName: overrides.pluginName || 'Tracevane',
    version: overrides.version || tracevaneVersion,
    port: standalonePort,
    autoStart: overrides.autoStart !== false,
    openclawRoot,
    openclawConfigFile,
    projectRoot,
    webDistDir: overrides.webDistDir || path.join(projectRoot, 'apps', 'web', 'dist'),
    gatewayPort,
    gatewayWsUrl: overrides.gatewayWsUrl || buildGatewayWsUrl(gatewayPort),
    gatewayControlUiBasePath: normalizeOptionalBasePath(overrides.gatewayControlUiBasePath),
    transport: {
      preferredMode: transport.preferredMode || (
        transport.gateway.enabled === true && transport.standalone.enabled === false
          ? 'gateway'
          : 'standalone'
      ),
      standalone: {
        enabled: transport.standalone.enabled !== false,
        port: normalizePort(transport.standalone.port, standalonePort),
      },
      gateway: {
        enabled: transport.gateway.enabled === true,
        basePath: normalizeGatewayBasePath(transport.gateway.basePath, DEFAULT_GATEWAY_BASE_PATH),
      },
    },
  };
}

export function syncStandaloneTracevaneConfig(config: TracevaneServerConfig): boolean {
  const nextGatewayPort = readGatewayPortFromOpenClawConfig(config.openclawConfigFile, DEFAULT_GATEWAY_PORT);
  const nextGatewayWsUrl = buildGatewayWsUrl(nextGatewayPort);
  const changed = config.gatewayPort !== nextGatewayPort || config.gatewayWsUrl !== nextGatewayWsUrl;

  config.gatewayPort = nextGatewayPort;
  config.gatewayWsUrl = nextGatewayWsUrl;

  return changed;
}
