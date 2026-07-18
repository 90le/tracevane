import crypto from 'node:crypto';
import type http from 'node:http';
import bcrypt from 'bcryptjs';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import {
  loadOrCreateTracevaneAuthState,
  saveTracevaneAuthState,
  type TracevaneAuthState,
} from './state.js';

export const TRACEVANE_SESSION_COOKIE_NAME = 'tracevane_session';

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_VERSION = 'v1';
const BCRYPT_ROUNDS = 10;
const MAX_PASSWORD_LENGTH = 128;

export interface TracevaneAuthStatus {
  required: boolean;
  hasPassword: boolean;
  methods: ['token', 'password'];
}

export interface TracevaneAuthService {
  isEnabled(): boolean;
  getStatus(): TracevaneAuthStatus;
  verifyCredential(credential: string): boolean;
  hasValidSession(req: http.IncomingMessage): boolean;
  issueSessionCookie(res: http.ServerResponse): void;
  clearSessionCookie(res: http.ServerResponse): void;
  setPassword(newPassword: string): void;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf-8');
  const rightBuffer = Buffer.from(right, 'utf-8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeSessionCookiePath(): string {
  const raw = (process.env.TRACEVANE_BASE_PATH || '').trim();
  if (!raw || raw === '/') return '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/+$/g, '') || '/';
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

function readSessionCookieValue(req: http.IncomingMessage): string {
  const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
  if (!cookieHeader.trim()) return '';
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    const key = (separator >= 0 ? pair.slice(0, separator) : pair).trim();
    if (key !== TRACEVANE_SESSION_COOKIE_NAME) continue;
    const rawValue = separator >= 0 ? pair.slice(separator + 1).trim() : '';
    if (!rawValue) return '';
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return '';
}

export function createTracevaneAuthService(config: TracevaneServerConfig): TracevaneAuthService {
  let cachedState: TracevaneAuthState | null = null;

  function isEnabled(): boolean {
    return config.security?.auth === 'on';
  }

  function getState(): TracevaneAuthState {
    if (!cachedState) {
      cachedState = loadOrCreateTracevaneAuthState(config);
    }
    return cachedState;
  }

  // The session secret derives from the password hash when one is set (so
  // changing the password invalidates existing sessions) and from the access
  // token otherwise.
  function sessionSecret(state: TracevaneAuthState): Buffer {
    return crypto
      .createHmac('sha256', 'tracevane-session-secret-v1')
      .update(state.passwordHash || state.token)
      .digest();
  }

  function signSessionPayload(payloadEncoded: string, secret: Buffer): string {
    return base64UrlEncode(crypto.createHmac('sha256', secret).update(payloadEncoded).digest());
  }

  function createSessionValue(state: TracevaneAuthState): string {
    const now = Date.now();
    const payload = {
      v: 1,
      iat: now,
      exp: now + SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
    };
    const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
    const signature = signSessionPayload(payloadEncoded, sessionSecret(state));
    return `${SESSION_VERSION}.${payloadEncoded}.${signature}`;
  }

  function verifySessionValue(value: string): boolean {
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return false;
    const [, payloadEncoded, signature] = parts;
    if (!payloadEncoded || !signature) return false;
    const state = getState();
    const expected = signSessionPayload(payloadEncoded, sessionSecret(state));
    if (!timingSafeEqualString(signature, expected)) return false;
    try {
      const payload = JSON.parse(base64UrlDecode(payloadEncoded).toString('utf-8')) as {
        exp?: unknown;
      };
      const exp = Number(payload.exp);
      return Number.isFinite(exp) && exp > Date.now();
    } catch {
      return false;
    }
  }

  return {
    isEnabled,

    getStatus(): TracevaneAuthStatus {
      if (!isEnabled()) {
        return { required: false, hasPassword: false, methods: ['token', 'password'] };
      }
      const state = getState();
      return {
        required: true,
        hasPassword: Boolean(state.passwordHash),
        methods: ['token', 'password'],
      };
    },

    verifyCredential(credential: string): boolean {
      if (!isEnabled()) return false;
      const candidate = String(credential || '');
      if (!candidate) return false;
      const state = getState();
      if (timingSafeEqualString(candidate, state.token)) return true;
      if (state.passwordHash) {
        try {
          if (bcrypt.compareSync(candidate, state.passwordHash)) return true;
        } catch {
          // Malformed stored hash: fall through to rejection.
        }
      }
      return false;
    },

    hasValidSession(req: http.IncomingMessage): boolean {
      if (!isEnabled()) return false;
      const value = readSessionCookieValue(req);
      return value ? verifySessionValue(value) : false;
    },

    issueSessionCookie(res: http.ServerResponse): void {
      const value = createSessionValue(getState());
      appendSetCookieHeader(
        res,
        [
          `${TRACEVANE_SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
          `Path=${normalizeSessionCookiePath()}`,
          `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
          'HttpOnly',
          'SameSite=Lax',
        ].join('; '),
      );
    },

    clearSessionCookie(res: http.ServerResponse): void {
      appendSetCookieHeader(
        res,
        [
          `${TRACEVANE_SESSION_COOKIE_NAME}=`,
          `Path=${normalizeSessionCookiePath()}`,
          'Max-Age=0',
          'HttpOnly',
          'SameSite=Lax',
        ].join('; '),
      );
    },

    setPassword(newPassword: string): void {
      const password = String(newPassword || '');
      if (!password.trim() || password.length > MAX_PASSWORD_LENGTH) {
        throw new Error('invalid_password');
      }
      const state = getState();
      const next: TracevaneAuthState = {
        ...state,
        passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
      };
      saveTracevaneAuthState(config, next);
      cachedState = next;
    },
  };
}
