export const DEFAULT_GATEWAY_BROWSER_CLIENT_ID = 'openclaw-control-ui';

const KNOWN_GATEWAY_CLIENT_IDS = new Set([
  'webchat-ui',
  'openclaw-control-ui',
  'openclaw-tui',
  'webchat',
  'cli',
  'gateway-client',
  'openclaw-macos',
  'openclaw-ios',
  'openclaw-android',
  'node-host',
  'test',
  'fingerprint',
  'openclaw-probe',
]);

export function resolveGatewayBrowserClientId(raw?: string | null): string {
  const normalized = typeof raw === 'string' ? raw.trim() : '';
  if (!normalized) {
    return DEFAULT_GATEWAY_BROWSER_CLIENT_ID;
  }
  return KNOWN_GATEWAY_CLIENT_IDS.has(normalized)
    ? normalized
    : DEFAULT_GATEWAY_BROWSER_CLIENT_ID;
}
