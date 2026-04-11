type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
};

const STORAGE_KEY = 'openclaw.device.auth.v1';

function normalizeDeviceAuthRole(role: string): string {
  return role.trim();
}

function normalizeDeviceAuthScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) return [];
  const out = new Set<string>();
  for (const scope of scopes) {
    const trimmed = typeof scope === 'string' ? scope.trim() : '';
    if (!trimmed) continue;
    out.add(trimmed);
  }
  if (out.has('operator.admin')) {
    out.add('operator.read');
    out.add('operator.write');
  } else if (out.has('operator.write')) {
    out.add('operator.read');
  }
  return [...out].sort((left, right) => left.localeCompare(right));
}

function readStore(): DeviceAuthStore | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (parsed?.version !== 1) return null;
    if (typeof parsed.deviceId !== 'string' || !parsed.deviceId.trim()) return null;
    if (!parsed.tokens || typeof parsed.tokens !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(store: DeviceAuthStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best-effort only
  }
}

export function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
}): DeviceAuthEntry | null {
  const store = readStore();
  if (!store || store.deviceId !== params.deviceId) {
    return null;
  }
  const role = normalizeDeviceAuthRole(params.role);
  const entry = store.tokens[role];
  if (!entry || typeof entry.token !== 'string' || !entry.token.trim()) {
    return null;
  }
  return entry;
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): DeviceAuthEntry {
  const role = normalizeDeviceAuthRole(params.role);
  const existing = readStore();
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens:
      existing && existing.deviceId === params.deviceId && existing.tokens
        ? { ...existing.tokens }
        : {},
  };

  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeDeviceAuthScopes(params.scopes),
    updatedAtMs: Date.now(),
  };
  next.tokens[role] = entry;
  writeStore(next);
  return entry;
}

export function clearDeviceAuthToken(params: { deviceId: string; role: string }): void {
  const store = readStore();
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  const role = normalizeDeviceAuthRole(params.role);
  if (!store.tokens[role]) {
    return;
  }
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: store.deviceId,
    tokens: { ...store.tokens },
  };
  delete next.tokens[role];
  writeStore(next);
}
