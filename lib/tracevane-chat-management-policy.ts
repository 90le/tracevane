const sessionHostManagementExecEnabled = new Map<string, boolean>();

let globalHostManagementExecEnabled = false;

function normalizeSessionKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resetTracevaneChatManagementPolicyState(): void {
  globalHostManagementExecEnabled = false;
  sessionHostManagementExecEnabled.clear();
}

export function setTracevaneChatGlobalHostManagementExecEnabled(enabled: boolean): void {
  globalHostManagementExecEnabled = enabled === true;
}

export function getTracevaneChatGlobalHostManagementExecEnabled(): boolean {
  return globalHostManagementExecEnabled;
}

export function setTracevaneChatSessionHostManagementExecEnabled(sessionKey: string, enabled: boolean): void {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return;
  }
  if (enabled) {
    sessionHostManagementExecEnabled.set(normalized, true);
    return;
  }
  sessionHostManagementExecEnabled.delete(normalized);
}

export function clearTracevaneChatSessionHostManagementExecEnabled(sessionKey: string): void {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return;
  }
  sessionHostManagementExecEnabled.delete(normalized);
}

export function getTracevaneChatSessionHostManagementExecEnabled(sessionKey: string): boolean {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return false;
  }
  return sessionHostManagementExecEnabled.get(normalized) === true;
}

export function isTracevaneChatHostManagementExecAllowed(sessionKey?: string | null): boolean {
  if (!globalHostManagementExecEnabled) {
    return false;
  }
  return getTracevaneChatSessionHostManagementExecEnabled(sessionKey || '');
}
