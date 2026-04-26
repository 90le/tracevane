export type HeartbeatMode = 'inherit' | 'enabled' | 'disabled';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isHeartbeatEveryDisabled(value: unknown): boolean {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return true;
  return /^0(?:\s*(?:ms|s|m|h|d))?$/.test(normalized);
}

export function resolveHeartbeatMode(value: unknown): HeartbeatMode {
  if (!isPlainObject(value) || !hasOwn(value, 'every')) return 'inherit';
  return isHeartbeatEveryDisabled(value.every) ? 'disabled' : 'enabled';
}

export function resolveHeartbeatEvery(value: unknown): string {
  if (!isPlainObject(value) || typeof value.every !== 'string') return '';
  const normalized = value.every.trim();
  return isHeartbeatEveryDisabled(normalized) ? '' : normalized;
}

export function buildHeartbeatConfig(
  baseValue: unknown,
  mode: HeartbeatMode,
  every: string,
  fallbackEvery = '30m',
): Record<string, unknown> | null {
  const next = isPlainObject(baseValue)
    ? JSON.parse(JSON.stringify(baseValue)) as Record<string, unknown>
    : {};

  if (mode === 'inherit') {
    delete next.every;
  } else if (mode === 'disabled') {
    next.every = '0m';
  } else {
    next.every = every.trim() || fallbackEvery;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function buildAgentHeartbeatConfig(
  baseValue: unknown,
  mode: HeartbeatMode,
  every: string,
  fallbackEvery = '30m',
): Record<string, unknown> | null {
  if (mode === 'inherit') return null;
  return buildHeartbeatConfig(baseValue, mode, every, fallbackEvery);
}
