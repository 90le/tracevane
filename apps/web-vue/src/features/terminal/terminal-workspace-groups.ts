import type { TerminalSessionDescriptor } from './terminal-session-registry';

export const TERMINAL_WORKSPACE_ALL_GROUP_ID = 'all';
export const TERMINAL_WORKSPACE_DEFAULT_GROUP_ID = 'cwd:';

export interface TerminalWorkspaceGroup {
  id: string;
  label: string;
  cwd: string | null;
  sessionIds: string[];
  count: number;
}

export function buildTerminalWorkspaceGroups(
  sessions: readonly TerminalSessionDescriptor[],
): TerminalWorkspaceGroup[] {
  const groupsById = new Map<string, TerminalWorkspaceGroup>();
  const allSessionIds: string[] = [];

  for (const session of sessions) {
    const sessionId = String(session?.sessionId || '').trim();
    if (!sessionId) continue;

    const cwd = normalizeTerminalWorkspaceCwd(session.cwd);
    const groupId = buildTerminalWorkspaceGroupId(cwd);
    let group = groupsById.get(groupId);
    if (!group) {
      group = {
        id: groupId,
        label: formatTerminalWorkspaceGroupLabel(cwd),
        cwd: cwd || null,
        sessionIds: [],
        count: 0,
      };
      groupsById.set(groupId, group);
    }
    group.sessionIds.push(sessionId);
    group.count += 1;
    allSessionIds.push(sessionId);
  }

  const groups = Array.from(groupsById.values()).sort((left, right) => {
    if (!left.cwd && right.cwd) return 1;
    if (left.cwd && !right.cwd) return -1;
    return left.label.localeCompare(right.label);
  });

  return [
    {
      id: TERMINAL_WORKSPACE_ALL_GROUP_ID,
      label: 'All',
      cwd: null,
      sessionIds: allSessionIds,
      count: allSessionIds.length,
    },
    ...groups,
  ];
}

export function filterTerminalSessionsByWorkspaceGroup(
  sessions: readonly TerminalSessionDescriptor[],
  groupId: string,
): TerminalSessionDescriptor[] {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || normalizedGroupId === TERMINAL_WORKSPACE_ALL_GROUP_ID) {
    return [...sessions];
  }
  return sessions.filter((session) =>
    resolveTerminalSessionWorkspaceGroupId(session) === normalizedGroupId,
  );
}

export function resolveTerminalSessionWorkspaceGroupId(
  session: Pick<TerminalSessionDescriptor, 'cwd'> | null | undefined,
): string {
  return buildTerminalWorkspaceGroupId(normalizeTerminalWorkspaceCwd(session?.cwd));
}

export function normalizeTerminalWorkspaceCwd(cwd: string | null | undefined): string {
  return String(cwd || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '');
}

function buildTerminalWorkspaceGroupId(cwd: string): string {
  return `cwd:${cwd}`;
}

function formatTerminalWorkspaceGroupLabel(cwd: string): string {
  if (!cwd) return 'Default';
  const parts = cwd.split('/').filter(Boolean);
  return parts.at(-1) || cwd;
}
