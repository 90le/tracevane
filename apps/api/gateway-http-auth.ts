import type http from 'node:http';
import type { StudioServerConfig } from '../../types/api.js';
import { sendJson, sendText } from './core/http.js';
import { readOpenClawConfig } from './core/state.js';

type GatewayHttpAuthShape = {
  mode?: unknown;
  token?: unknown;
  password?: unknown;
};

const STUDIO_GATEWAY_AUTH_COOKIE_NAME = 'openclaw_studio_gateway_auth';
const STUDIO_GATEWAY_AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function normalizeGatewayBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return '';
  return basePath.startsWith('/') ? basePath.replace(/\/+$/g, '') : `/${basePath.replace(/\/+$/g, '')}`;
}

function readRequestPath(req: http.IncomingMessage): string {
  try {
    return new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).pathname;
  } catch {
    return '/';
  }
}

function readGatewayRelativePath(config: StudioServerConfig, req: http.IncomingMessage): string {
  const pathname = readRequestPath(req);
  const basePath = normalizeGatewayBasePath(config.transport.gateway.basePath);
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (!pathname.startsWith(`${basePath}/`)) return pathname;
  return pathname.slice(basePath.length) || '/';
}

function isPublicGatewayAssetRequest(config: StudioServerConfig, req: http.IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }
  const relativePath = readGatewayRelativePath(config, req);
  return relativePath.startsWith('/assets/');
}

function readQuerySecret(req: http.IncomingMessage, key: string): string {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const value = url.searchParams.get(key) || '';
    return value.trim();
  } catch {
    return '';
  }
}

function decodeBasicSecret(authorizationHeader: string): string {
  if (!authorizationHeader.toLowerCase().startsWith('basic ')) return '';
  try {
    const decoded = Buffer.from(authorizationHeader.slice(6).trim(), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    return separatorIndex >= 0 ? decoded.slice(separatorIndex + 1).trim() : decoded.trim();
  } catch {
    return '';
  }
}

function readAuthorizationSecret(req: http.IncomingMessage): string {
  const raw = typeof req.headers.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) {
    return raw.slice(7).trim();
  }
  return decodeBasicSecret(raw);
}

function readCookieSecret(req: http.IncomingMessage): string {
  const cookieHeader = typeof req.headers.cookie === 'string'
    ? req.headers.cookie
    : '';
  if (!cookieHeader.trim()) {
    return '';
  }
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    const key = (separator >= 0 ? pair.slice(0, separator) : pair).trim();
    if (key !== STUDIO_GATEWAY_AUTH_COOKIE_NAME) {
      continue;
    }
    const rawValue = separator >= 0 ? pair.slice(separator + 1).trim() : '';
    if (!rawValue) {
      return '';
    }
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return '';
}

function readPresentedSecrets(req: http.IncomingMessage): string[] {
  return [
    readAuthorizationSecret(req),
    readCookieSecret(req),
    readQuerySecret(req, 'token'),
    readQuerySecret(req, 'password'),
  ].filter(Boolean);
}

function readExpectedSecrets(config: StudioServerConfig): {
  mode: string;
  secrets: string[];
} {
  const openclawConfig = readOpenClawConfig(config) as { gateway?: { auth?: GatewayHttpAuthShape } };
  const auth = openclawConfig.gateway?.auth || {};
  const mode = typeof auth.mode === 'string' ? auth.mode.trim() : '';
  const secrets = [
    typeof auth.token === 'string' ? auth.token.trim() : '',
    typeof auth.password === 'string' ? auth.password.trim() : '',
  ].filter(Boolean);
  return { mode, secrets };
}

function isHtmlNavigation(req: http.IncomingMessage): boolean {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    return req.method === 'GET' && !url.pathname.includes('/api/');
  } catch {
    return false;
  }
}

export function isStudioGatewayHttpAuthorized(
  config: StudioServerConfig,
  req: http.IncomingMessage,
): boolean {
  if (isPublicGatewayAssetRequest(config, req)) {
    return true;
  }
  const { mode, secrets } = readExpectedSecrets(config);
  if (!mode || mode === 'none' || secrets.length === 0) {
    return true;
  }
  const presentedSecrets = readPresentedSecrets(req);
  if (!presentedSecrets.length) {
    return false;
  }
  return presentedSecrets.some((value) => secrets.includes(value));
}

function normalizeCookiePath(config: StudioServerConfig): string {
  const basePath = normalizeGatewayBasePath(config.transport.gateway.basePath);
  return basePath || '/';
}

function readPresentedNavigationSecret(req: http.IncomingMessage): string {
  return readQuerySecret(req, 'token')
    || readQuerySecret(req, 'password')
    || readAuthorizationSecret(req)
    || '';
}

function shouldMarkCookieSecure(req: http.IncomingMessage): boolean {
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : '';
  if (forwardedProto.trim().toLowerCase() === 'https') {
    return true;
  }
  const encrypted = (req.socket as { encrypted?: boolean } | undefined)?.encrypted;
  return encrypted === true;
}

function appendSetCookieHeader(res: http.ServerResponse, value: string): void {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', value);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, value]);
    return;
  }
  res.setHeader('Set-Cookie', [String(current), value]);
}

export function syncStudioGatewayHttpAuthCookie(
  config: StudioServerConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const { mode, secrets } = readExpectedSecrets(config);
  if (!mode || mode === 'none' || secrets.length === 0) {
    return;
  }
  const presentedSecret = readPresentedNavigationSecret(req);
  if (!presentedSecret || !secrets.includes(presentedSecret)) {
    return;
  }
  const cookieParts = [
    `${STUDIO_GATEWAY_AUTH_COOKIE_NAME}=${encodeURIComponent(presentedSecret)}`,
    `Path=${normalizeCookiePath(config)}`,
    `Max-Age=${STUDIO_GATEWAY_AUTH_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (shouldMarkCookieSecure(req)) {
    cookieParts.push('Secure');
  }
  appendSetCookieHeader(res, cookieParts.join('; '));
}

export function rejectStudioGatewayHttpUnauthorized(res: http.ServerResponse, req: http.IncomingMessage): void {
  res.setHeader('WWW-Authenticate', 'Bearer realm="OpenClaw Studio"');
  if (isHtmlNavigation(req)) {
    sendText(res, 401, 'Unauthorized');
    return;
  }
  sendJson(res, 401, {
    error: {
      code: 'auth_failure',
      message: 'Unauthorized',
      retryable: false,
      source: 'studio',
    },
  });
}
