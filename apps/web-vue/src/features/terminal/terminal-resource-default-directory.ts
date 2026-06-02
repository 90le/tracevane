import type { TerminalResourceTransferPayload } from './terminal-resource-transfer';

export const RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY =
  'openclaw-studio.terminal.resourceExplorer.default';
export const TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID = 'all';

export interface TerminalResourceDefaultDirectory {
  rootId: string;
  path: string;
  absolutePath: string | null;
}

export interface TerminalResourceDefaultDirectoryState {
  version: 1;
  scopes: Record<string, TerminalResourceDefaultDirectory>;
}

export interface TerminalResourceDefaultDirectoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?: (key: string) => void;
}

export function readTerminalResourceDefaultDirectory(
  storage: TerminalResourceDefaultDirectoryStorage | null | undefined,
  scopeId: string | null | undefined = TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID,
  options: { fallbackToMain?: boolean } = {},
): TerminalResourceDefaultDirectory | null {
  if (!storage) return null;
  try {
    const state = parseTerminalResourceDefaultDirectoryState(
      storage.getItem(RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY),
    );
    if (!state) return null;
    const normalizedScopeId = normalizeScopeId(scopeId);
    return (
      state.scopes[normalizedScopeId] ||
      (options.fallbackToMain === false
        ? null
        : state.scopes[TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID]) ||
      null
    );
  } catch {
    return null;
  }
}

export function writeTerminalResourceDefaultDirectory(
  storage: TerminalResourceDefaultDirectoryStorage | null | undefined,
  payload: Pick<TerminalResourceTransferPayload, 'rootId' | 'path' | 'absolutePath'> | null | undefined,
  scopeId: string | null | undefined = TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID,
): TerminalResourceDefaultDirectory | null {
  if (!storage) return null;
  const snapshot = normalizeTerminalResourceDefaultDirectory(payload);
  if (!snapshot) return null;
  try {
    const state =
      parseTerminalResourceDefaultDirectoryState(
        storage.getItem(RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY),
      ) || createEmptyTerminalResourceDefaultDirectoryState();
    state.scopes[normalizeScopeId(scopeId)] = snapshot;
    storage.setItem(
      RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY,
      serializeTerminalResourceDefaultDirectoryState(state),
    );
    return snapshot;
  } catch {
    return null;
  }
}

export function clearTerminalResourceDefaultDirectory(
  storage: TerminalResourceDefaultDirectoryStorage | null | undefined,
  scopeId: string | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    const state =
      parseTerminalResourceDefaultDirectoryState(
        storage.getItem(RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY),
      ) || createEmptyTerminalResourceDefaultDirectoryState();
    delete state.scopes[normalizeScopeId(scopeId)];
    if (Object.keys(state.scopes).length) {
      storage.setItem(
        RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY,
        serializeTerminalResourceDefaultDirectoryState(state),
      );
    } else if (typeof storage.removeItem === 'function') {
      storage.removeItem(RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY);
    } else {
      storage.setItem(
        RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY,
        serializeTerminalResourceDefaultDirectoryState(state),
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function hasTerminalResourceDefaultDirectory(
  storage: TerminalResourceDefaultDirectoryStorage | null | undefined,
  scopeId: string | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    const state = parseTerminalResourceDefaultDirectoryState(
      storage.getItem(RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY),
    );
    return Boolean(state?.scopes[normalizeScopeId(scopeId)]);
  } catch {
    return false;
  }
}

export function parseTerminalResourceDefaultDirectorySnapshot(
  raw: string | null | undefined,
): TerminalResourceDefaultDirectory | null {
  return (
    parseTerminalResourceDefaultDirectoryState(raw)
      ?.scopes[TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID] || null
  );
}

export function parseTerminalResourceDefaultDirectoryState(
  raw: string | null | undefined,
): TerminalResourceDefaultDirectoryState | null {
  const normalizedRaw = String(raw || '').trim();
  if (!normalizedRaw) return null;
  try {
    return normalizeTerminalResourceDefaultDirectoryState(JSON.parse(normalizedRaw));
  } catch {
    return null;
  }
}

export function serializeTerminalResourceDefaultDirectorySnapshot(
  snapshot: TerminalResourceDefaultDirectory,
): string {
  return JSON.stringify(snapshot);
}

export function serializeTerminalResourceDefaultDirectoryState(
  state: TerminalResourceDefaultDirectoryState,
): string {
  return JSON.stringify({
    version: 1,
    scopes: normalizeTerminalResourceDefaultDirectoryScopes(state.scopes),
  });
}

function createEmptyTerminalResourceDefaultDirectoryState(): TerminalResourceDefaultDirectoryState {
  return {
    version: 1,
    scopes: {},
  };
}

function normalizeTerminalResourceDefaultDirectoryState(
  value: unknown,
): TerminalResourceDefaultDirectoryState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as { scopes?: unknown };
  if (record.scopes && typeof record.scopes === 'object' && !Array.isArray(record.scopes)) {
    const scopes = normalizeTerminalResourceDefaultDirectoryScopes(record.scopes);
    return {
      version: 1,
      scopes,
    };
  }
  const legacyDefaultDirectory = normalizeTerminalResourceDefaultDirectory(value);
  if (!legacyDefaultDirectory) return null;
  return {
    version: 1,
    scopes: {
      [TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID]: legacyDefaultDirectory,
    },
  };
}

function normalizeTerminalResourceDefaultDirectoryScopes(
  value: unknown,
): Record<string, TerminalResourceDefaultDirectory> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const scopes: Record<string, TerminalResourceDefaultDirectory> = {};
  for (const [rawScopeId, rawDirectory] of Object.entries(value)) {
    const scopeId = normalizeScopeId(rawScopeId);
    const directory = normalizeTerminalResourceDefaultDirectory(rawDirectory);
    if (directory) {
      scopes[scopeId] = directory;
    }
  }
  return scopes;
}

function normalizeTerminalResourceDefaultDirectory(
  value: unknown,
): TerminalResourceDefaultDirectory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<TerminalResourceDefaultDirectory>;
  const rootId = String(record.rootId || '').trim();
  if (!rootId) return null;
  return {
    rootId,
    path: normalizePath(record.path),
    absolutePath: String(record.absolutePath || '').trim() || null,
  };
}

function normalizePath(path: unknown): string {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function normalizeScopeId(scopeId: unknown): string {
  return String(scopeId || '').trim() || TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID;
}
