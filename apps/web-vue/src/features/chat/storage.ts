const CHAT_LAST_AGENT_KEY = 'openclaw-studio.chat.last-agent';
const CHAT_LAST_SESSION_KEY = 'openclaw-studio.chat.last-session-key';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value && value.trim()) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function readLastChatAgentId(): string | null {
  return readStorage(CHAT_LAST_AGENT_KEY);
}

export function readLastChatSessionKey(): string | null {
  return readStorage(CHAT_LAST_SESSION_KEY);
}

export function rememberLastChatAgentId(agentId: string | null): void {
  writeStorage(CHAT_LAST_AGENT_KEY, agentId);
}

export function rememberLastChatSessionKey(sessionKey: string | null): void {
  writeStorage(CHAT_LAST_SESSION_KEY, sessionKey);
}
