const CHAT_SESSION_REF_PREFIX = 'r1_';

function toBase64Url(value: string): string {
  const encoded = typeof window !== 'undefined'
    ? window.btoa(unescape(encodeURIComponent(value)))
    : Buffer.from(value, 'utf-8').toString('base64');
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  try {
    const decoded = typeof window !== 'undefined'
      ? decodeURIComponent(escape(window.atob(`${normalized}${padding}`)))
      : Buffer.from(`${normalized}${padding}`, 'base64').toString('utf-8');
    return decoded.trim() ? decoded : null;
  } catch {
    return null;
  }
}

export function encodeChatSessionRef(sessionKey: string): string {
  return `${CHAT_SESSION_REF_PREFIX}${toBase64Url(sessionKey)}`;
}

export function decodeChatSessionRef(sessionRef: string): string | null {
  if (!sessionRef.startsWith(CHAT_SESSION_REF_PREFIX)) return null;
  return fromBase64Url(sessionRef.slice(CHAT_SESSION_REF_PREFIX.length));
}

export function isChatSessionRef(sessionRef: string): boolean {
  return sessionRef.startsWith(CHAT_SESSION_REF_PREFIX) && decodeChatSessionRef(sessionRef) !== null;
}

export function deriveAgentIdFromChatSessionKey(sessionKey: string): string | null {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match?.[1] || null;
}
