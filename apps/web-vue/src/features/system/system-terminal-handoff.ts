const TERMINAL_SESSION_PREFIX = "term-";

export interface SystemTerminalHandoffContext {
  fromModule: string;
  fromRoute: string;
  triggerType: string;
  triggerLabel: string;
  targetEntity: string;
  recommendedCommand: string;
  relatedEventId: string | null;
}

export interface SystemTerminalHandoff {
  sessionId: string;
  to: `/terminal/${string}` | `/terminal/${string}?${string}`;
  context: SystemTerminalHandoffContext;
}

export interface BuildSystemTerminalHandoffOptions {
  sessionId?: string | null;
  createSessionId?: () => string;
  context?: Partial<SystemTerminalHandoffContext>;
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
  const context: SystemTerminalHandoffContext = {
    fromModule: options.context?.fromModule || "system",
    fromRoute: options.context?.fromRoute || "/system",
    triggerType: options.context?.triggerType || "system-handoff",
    triggerLabel: options.context?.triggerLabel || "System handoff",
    targetEntity: options.context?.targetEntity || "terminal-session",
    recommendedCommand: options.context?.recommendedCommand || "",
    relatedEventId: options.context?.relatedEventId || null,
  };
  const query = new URLSearchParams();
  query.set("fromModule", context.fromModule);
  query.set("fromRoute", context.fromRoute);
  query.set("triggerType", context.triggerType);
  query.set("triggerLabel", context.triggerLabel);
  query.set("targetEntity", context.targetEntity);
  if (context.recommendedCommand) {
    query.set("recommendedCommand", context.recommendedCommand);
  }
  if (context.relatedEventId) {
    query.set("relatedEventId", context.relatedEventId);
  }

  return {
    sessionId,
    to: `/terminal/${encodeURIComponent(sessionId)}?${query.toString()}`,
    context,
  };
}

function createRuntimeSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${TERMINAL_SESSION_PREFIX}${Date.now().toString(36)}`;
}
