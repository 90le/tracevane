import {
  getStudioApiBasePath,
  getStudioGatewayAuthStorageScopePath,
  getStudioWebSocketBasePath,
} from './runtime-config';

const API_BASE_STORAGE_KEY = 'openclaw-studio.api-base';
const API_DISCOVERY_PATH = '/api/system/health';
const API_DISCOVERY_TIMEOUT_MS = 1200;
const SETTINGS_KEY_PREFIX = 'openclaw.control.settings.v1:';
const LEGACY_SETTINGS_KEY = 'openclaw.control.settings.v1';
const LEGACY_TOKEN_SESSION_KEY = 'openclaw.control.token.v1';
const TOKEN_SESSION_KEY_PREFIX = 'openclaw.control.token.v1:';
const TOKEN_LOCAL_STORAGE_KEY_PREFIX = 'openclaw.control.token.persisted.v1:';

let resolvedApiBase: string | null = null;
let resolveApiBasePromise: Promise<string> | null = null;

function isAbsoluteUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}

function getInjectedApiBase(): string | null {
  const runtimeBase = getStudioApiBasePath();
  return runtimeBase || null;
}

function getStoredApiBase(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(API_BASE_STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function setStoredApiBase(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(API_BASE_STORAGE_KEY, value);
  } catch {
    // ignore storage failure
  }
}

function clearStoredApiBase(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(API_BASE_STORAGE_KEY);
  } catch {
    // ignore storage failure
  }
}

function buildCandidateApiBases(): string[] {
  if (typeof window === 'undefined') return [''];

  const override = getInjectedApiBase();
  if (override !== null) {
    return [override];
  }

  const hostname = window.location.hostname || '127.0.0.1';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const directHostBase = `${protocol}//${hostname}:3760`;
  const localhostBase = `${protocol}//127.0.0.1:3760`;

  if (window.location.protocol === 'file:') {
    return [localhostBase];
  }

  if (import.meta.env.DEV && window.location.port === '5176') {
    // The Vite dev server already mounts the Studio API middleware locally.
    // Probing :3760 in parallel creates split-brain state when an unrelated
    // standalone API is also running on the same machine.
    return [''];
  }

  return ['', directHostBase, localhostBase]
    .filter((value, index, list) => list.indexOf(value) === index);
}

async function probeApiBase(base: string): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_DISCOVERY_TIMEOUT_MS);
  const target = `${base}${API_DISCOVERY_PATH}`;

  try {
    const response = await fetch(target, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`health check failed for ${base || 'same-origin'}`);
    }
    return base;
  } finally {
    window.clearTimeout(timer);
  }
}

async function resolveApiBase(): Promise<string> {
  if (resolvedApiBase !== null) return resolvedApiBase;

  const override = getInjectedApiBase();
  if (override !== null) {
    clearStoredApiBase();
    resolvedApiBase = override;
    return override;
  }

  const stored = getStoredApiBase();
  if (stored) {
    resolvedApiBase = stored;
    return stored;
  }

  if (resolveApiBasePromise) return resolveApiBasePromise;

  resolveApiBasePromise = (async () => {
    const candidates = buildCandidateApiBases();
    const probeTasks = candidates.map((candidate) =>
      probeApiBase(candidate).then((base) => {
        resolvedApiBase = base;
        setStoredApiBase(base);
        return base;
      })
    );

    try {
      return await Promise.any(probeTasks);
    } catch {
      throw new Error('无法连接 Studio API，请确认 Gateway 插件服务或本地开发 API 已启动');
    }
  })();

  try {
    return await resolveApiBasePromise;
  } finally {
    resolveApiBasePromise = null;
  }
}

function joinApiUrl(base: string, input: string): string {
  if (isAbsoluteUrl(input)) return input;
  if (!base) return input;
  if (input === base || input.startsWith(`${base}/`)) return input;
  return `${base}${input}`;
}

function normalizeGatewayTokenScope(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim();
  if (!trimmed) {
    return 'default';
  }
  try {
    const parsed = new URL(trimmed, window.location.href);
    const pathname =
      parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/g, '') || parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return trimmed;
  }
}

function tokenSessionKeyForGateway(gatewayUrl: string): string {
  return `${TOKEN_SESSION_KEY_PREFIX}${normalizeGatewayTokenScope(gatewayUrl)}`;
}

function tokenLocalStorageKeyForGateway(gatewayUrl: string): string {
  return `${TOKEN_LOCAL_STORAGE_KEY_PREFIX}${normalizeGatewayTokenScope(gatewayUrl)}`;
}

function buildGatewayAuthScopeUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (!getStudioApiBasePath()) return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const scopePath = getStudioGatewayAuthStorageScopePath();
  return `${protocol}//${window.location.host}${scopePath}`;
}

function readSessionToken(scopeUrl: string): string {
  try {
    const sessionStorage = window.sessionStorage;
    const localStorage = window.localStorage;
    const scopedSession = sessionStorage.getItem(tokenSessionKeyForGateway(scopeUrl)) || '';
    if (scopedSession.trim()) return scopedSession.trim();
    const scopedLocal = localStorage.getItem(tokenLocalStorageKeyForGateway(scopeUrl)) || '';
    if (scopedLocal.trim()) return scopedLocal.trim();
    const legacy = sessionStorage.getItem(LEGACY_TOKEN_SESSION_KEY) || '';
    return legacy.trim();
  } catch {
    return '';
  }
}

function persistSessionToken(scopeUrl: string, token: string): void {
  try {
    const normalized = token.trim();
    if (!normalized) return;
    window.sessionStorage.setItem(tokenSessionKeyForGateway(scopeUrl), normalized);
    window.localStorage.setItem(tokenLocalStorageKeyForGateway(scopeUrl), normalized);
  } catch {
    // ignore storage failure
  }
}

function readTokenOverrideFromLocation(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  return (
    hashParams.get('token')
    || url.searchParams.get('token')
    || ''
  ).trim();
}

function stripTokenOverrideFromLocation(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.has('token')) {
    url.searchParams.delete('token');
    changed = true;
  }
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    if (hashParams.has('token')) {
      hashParams.delete('token');
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : '';
      changed = true;
    }
  }
  if (!changed) return;
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function readLegacyGatewaySettings(scopeUrl: string): { token?: string; password?: string } {
  try {
    const storage = window.localStorage;
    const scopedKey = `${SETTINGS_KEY_PREFIX}${normalizeGatewayTokenScope(scopeUrl)}`;
    const raw = storage.getItem(scopedKey) || storage.getItem(LEGACY_SETTINGS_KEY) || '';
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { token?: unknown; password?: unknown };
    return {
      token: typeof parsed.token === 'string' ? parsed.token.trim() : undefined,
      password: typeof parsed.password === 'string' ? parsed.password.trim() : undefined,
    };
  } catch {
    return {};
  }
}

export function resolveStudioAuthorizationHeader(): string | null {
  if (typeof window === 'undefined') return null;
  const scopeUrl = buildGatewayAuthScopeUrl();
  if (!scopeUrl) return null;

  const sessionToken = readSessionToken(scopeUrl);
  if (sessionToken) {
    return `Bearer ${sessionToken}`;
  }
  const locationToken = readTokenOverrideFromLocation();
  if (locationToken) {
    persistSessionToken(scopeUrl, locationToken);
    stripTokenOverrideFromLocation();
    return `Bearer ${locationToken}`;
  }
  const settings = readLegacyGatewaySettings(scopeUrl);
  if (settings.token) {
    return `Bearer ${settings.token}`;
  }
  if (settings.password) {
    return `Bearer ${settings.password}`;
  }
  return null;
}

export function resolveStudioGatewayClientAuth(): {
  gatewayUrl: string | null;
  token?: string;
  password?: string;
} {
  const gatewayUrl = buildGatewayAuthScopeUrl();
  if (!gatewayUrl) {
    return { gatewayUrl: null };
  }
  const settings = readLegacyGatewaySettings(gatewayUrl);

  const sessionToken = readSessionToken(gatewayUrl);
  if (sessionToken) {
    return {
      gatewayUrl,
      token: sessionToken,
      password: settings.password,
    };
  }

  const locationToken = readTokenOverrideFromLocation();
  if (locationToken) {
    persistSessionToken(gatewayUrl, locationToken);
    stripTokenOverrideFromLocation();
    return {
      gatewayUrl,
      token: locationToken,
      password: settings.password,
    };
  }
  return {
    gatewayUrl,
    token: settings.token,
    password: settings.password,
  };
}

export function withStudioAuthorization(init?: RequestInit): RequestInit {
  const auth = resolveStudioAuthorizationHeader();
  if (!auth) return init || {};

  const headers = new Headers(init?.headers || {});
  if (!headers.has('Authorization')) {
    headers.set('Authorization', auth);
  }
  return {
    ...(init || {}),
    headers,
  };
}

export async function fetchStudioResponse(input: string, init?: RequestInit): Promise<Response> {
  const requestInit = withStudioAuthorization(init);
  if (isAbsoluteUrl(input)) {
    return fetch(input, requestInit);
  }

  let apiBase = await resolveApiBase();
  try {
    return await fetch(joinApiUrl(apiBase, input), requestInit);
  } catch (error) {
    if (apiBase !== '') {
      resolvedApiBase = null;
      clearStoredApiBase();
      apiBase = await resolveApiBase();
      return fetch(joinApiUrl(apiBase, input), requestInit);
    }
    throw error;
  }
}

export function getApiBase(): string {
  return getStudioApiBasePath();
}

export function getWebSocketBasePath(): string {
  return getStudioWebSocketBasePath();
}

export function joinApiPath(path: string): string {
  if (!path) return '';
  const base = getApiBase();
  return joinApiUrl(base, path);
}

export async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetchStudioResponse(input, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}
