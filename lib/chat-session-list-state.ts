import type { ChatSessionOrganizerState, ChatSessionRow } from '../types/chat.js';

export type ChatSessionAgentOption = {
  id: string;
  label: string;
};

export function deriveSessionAgentOptions(
  sessions: ChatSessionRow[],
  resolveAgentLabel: (session: ChatSessionRow) => string,
): ChatSessionAgentOption[] {
  const seen = new Set<string>();

  return sessions
    .filter((session) => {
      if (seen.has(session.agentId)) {
        return false;
      }
      seen.add(session.agentId);
      return true;
    })
    .map((session) => ({
      id: session.agentId,
      label: resolveAgentLabel(session),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

export function normalizeSessionFilterQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function sessionMatchesListFilter(params: {
  selectedAgentId: string;
  selectedSourceId?: string;
  sessionAgentId: string;
  sessionSourceId?: string;
  normalizedQuery: string;
  searchableText: string;
}): boolean {
  if (params.selectedAgentId !== 'all' && params.sessionAgentId !== params.selectedAgentId) {
    return false;
  }
  if (
    params.selectedSourceId
    && params.selectedSourceId !== 'all'
    && params.sessionSourceId !== params.selectedSourceId
  ) {
    return false;
  }
  if (!params.normalizedQuery) {
    return true;
  }
  return params.searchableText.toLowerCase().includes(params.normalizedQuery);
}

export function pruneSelectedSessionKeys(selectedKeys: string[], validKeys: string[]): string[] {
  const validKeySet = new Set(validKeys);
  return selectedKeys.filter((key) => validKeySet.has(key));
}

export function toggleSessionSelectionKeys(selectedKeys: string[], sessionKey: string): string[] {
  if (selectedKeys.includes(sessionKey)) {
    return selectedKeys.filter((key) => key !== sessionKey);
  }
  return [...selectedKeys, sessionKey];
}

export function toggleSelectAllVisibleSessionKeys(
  selectedKeys: string[],
  visibleSessionKeys: string[],
  allVisibleSelected: boolean,
): string[] {
  if (allVisibleSelected) {
    return selectedKeys.filter((key) => !visibleSessionKeys.includes(key));
  }
  return Array.from(new Set([...selectedKeys, ...visibleSessionKeys]));
}

export function deriveSessionSelectionState(params: {
  selectedKeys: string[];
  visibleSessions: ChatSessionRow[];
  organizerSessions: ChatSessionRow[];
  organizer: ChatSessionOrganizerState;
  canManageSession: (session: ChatSessionRow) => boolean;
}): {
  manageableVisibleSessionKeys: string[];
  selectedManageableSessionKeys: string[];
  allVisibleSessionsSelected: boolean;
  selectedSessionsHaveFolderMembership: boolean;
} {
  const selectedKeySet = new Set(params.selectedKeys);
  const organizerSessionKeys = new Set(params.organizerSessions.map((session) => session.key));
  const manageableVisibleSessionKeys = params.visibleSessions
    .filter((session) => params.canManageSession(session))
    .map((session) => session.key);
  const selectedManageableSessionKeys = params.selectedKeys
    .filter((sessionKey) => organizerSessionKeys.has(sessionKey));
  const allVisibleSessionsSelected = manageableVisibleSessionKeys.length > 0
    && manageableVisibleSessionKeys.every((sessionKey) => selectedKeySet.has(sessionKey));
  const selectedSessionsHaveFolderMembership = selectedManageableSessionKeys
    .some((sessionKey) => Boolean(params.organizer.sessionFolderMap[sessionKey]));

  return {
    manageableVisibleSessionKeys,
    selectedManageableSessionKeys,
    allVisibleSessionsSelected,
    selectedSessionsHaveFolderMembership,
  };
}
