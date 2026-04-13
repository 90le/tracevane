const TERMINAL_SESSION_PREFIX = "term-";

export interface SystemTerminalHandoff {
  sessionId: string;
  to: `/terminal/${string}`;
}

export interface BuildSystemTerminalHandoffOptions {
  sessionId?: string | null;
  createSessionId?: () => string;
}

export function buildSystemTerminalHandoff(
  options: BuildSystemTerminalHandoffOptions = {},
): SystemTerminalHandoff {
  const requestedSessionId =
    typeof options.sessionId === "string" ? options.sessionId.trim() : "";
  const createdSessionId = options.createSessionId?.();
  const fallbackSessionId =
    typeof createdSessionId === "string" && createdSessionId.trim()
      ? createdSessionId.trim()
      : createRuntimeSessionId();
  const sessionId = requestedSessionId || fallbackSessionId;

  return {
    sessionId,
    to: `/terminal/${encodeURIComponent(sessionId)}`,
  };
}

function createRuntimeSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${TERMINAL_SESSION_PREFIX}${Date.now().toString(36)}`;
}
