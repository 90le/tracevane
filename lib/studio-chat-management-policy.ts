const sessionHostManagementExecEnabled = new Map<string, boolean>();

let globalHostManagementExecEnabled = false;

function normalizeSessionKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resetStudioChatManagementPolicyState(): void {
  globalHostManagementExecEnabled = false;
  sessionHostManagementExecEnabled.clear();
}

export function setStudioChatGlobalHostManagementExecEnabled(enabled: boolean): void {
  globalHostManagementExecEnabled = enabled === true;
}

export function getStudioChatGlobalHostManagementExecEnabled(): boolean {
  return globalHostManagementExecEnabled;
}

export function setStudioChatSessionHostManagementExecEnabled(sessionKey: string, enabled: boolean): void {
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

export function clearStudioChatSessionHostManagementExecEnabled(sessionKey: string): void {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return;
  }
  sessionHostManagementExecEnabled.delete(normalized);
}

export function getStudioChatSessionHostManagementExecEnabled(sessionKey: string): boolean {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return false;
  }
  return sessionHostManagementExecEnabled.get(normalized) === true;
}

export function isStudioChatHostManagementExecAllowed(sessionKey?: string | null): boolean {
  if (!globalHostManagementExecEnabled) {
    return false;
  }
  return getStudioChatSessionHostManagementExecEnabled(sessionKey || '');
}
