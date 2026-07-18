import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../types/api.js';

export interface TracevaneAuthState {
  version: 1;
  token: string;
  passwordHash?: string;
}

const AUTH_STATE_RELATIVE_PATH = path.join('tracevane', 'auth.json');

export function resolveTracevaneAuthStatePath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, AUTH_STATE_RELATIVE_PATH);
}

function normalizeAuthState(value: unknown): TracevaneAuthState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const token = typeof record.token === 'string' ? record.token.trim() : '';
  if (!token) return null;
  const passwordHash = typeof record.passwordHash === 'string'
    ? record.passwordHash.trim()
    : '';
  return {
    version: 1,
    token,
    ...(passwordHash ? { passwordHash } : {}),
  };
}

function writeAuthStateFile(filePath: string, state: TracevaneAuthState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort on filesystems that do not honor chmod (e.g. Windows).
  }
}

export function loadOrCreateTracevaneAuthState(config: TracevaneServerConfig): TracevaneAuthState {
  const filePath = resolveTracevaneAuthStatePath(config);
  try {
    const parsed = normalizeAuthState(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    if (parsed) return parsed;
  } catch {
    // Missing or unreadable state file: regenerate a fresh token below.
  }
  const state: TracevaneAuthState = {
    version: 1,
    token: crypto.randomBytes(24).toString('hex'),
  };
  writeAuthStateFile(filePath, state);
  return state;
}

export function saveTracevaneAuthState(
  config: TracevaneServerConfig,
  state: TracevaneAuthState,
): void {
  writeAuthStateFile(resolveTracevaneAuthStatePath(config), state);
}
