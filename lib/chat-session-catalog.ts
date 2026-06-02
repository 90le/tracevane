import type { AgentSummary } from '../types/agents.js';
import type { ChatSessionOrganizerState, ChatSessionRow } from '../types/chat.js';
import {
  deriveOrganizerFolderTree,
  type ChatSessionFolderTreeNode,
} from './chat-session-organizer.js';

export const CHAT_SESSION_LOAD_CONCURRENCY = 3;

export const CHAT_SESSION_VISIBLE_LIMITS = {
  active: 20,
  archived: 20,
  observed: 20,
} as const;

export const CHAT_SESSION_SEARCH_VISIBLE_LIMIT = 60;

export const CHAT_SESSION_CONTEXT_MENU_SIZE = {
  width: 196,
  height: 164,
  padding: 12,
} as const;

export const CHAT_SESSION_RAIL_AUTO_REVEAL_THRESHOLD_PX = 360;

export interface ChatSessionDestinationItem {
  id: string;
  label: string;
  disabled?: boolean;
  children?: ChatSessionDestinationItem[];
}

export interface ChatSessionFilterChip {
  id: string;
  label: string;
}

function sessionRecencyTimestamp(session: ChatSessionRow): number {
  return Math.max(
    Date.parse(session.updatedAt || '') || 0,
    Date.parse(session.runtime.lastEventAt || '') || 0,
    Date.parse(session.runtime.lastAckAt || '') || 0,
  );
}

function compareChatSessionFreshness(left: ChatSessionRow, right: ChatSessionRow): number {
  return sessionRecencyTimestamp(right) - sessionRecencyTimestamp(left);
}

function sessionRuntimeSortRank(session: ChatSessionRow): number {
  const runtime = session.runtime;
  if (
    runtime.activeRunId
    || runtime.state === 'streaming'
    || runtime.state === 'running'
  ) {
    return 0;
  }
  if (runtime.state === 'error') {
    return 1;
  }
  return 2;
}

export function sortChatSessionsByUpdatedAt(left: ChatSessionRow, right: ChatSessionRow): number {
  return sessionRuntimeSortRank(left) - sessionRuntimeSortRank(right)
    || compareChatSessionFreshness(left, right)
    || left.key.localeCompare(right.key);
}

export function prioritizeAgentsForSessionLoad(
  agents: AgentSummary[],
  options: {
    selectedAgentId?: string | null;
    recentAgentId?: string | null;
  } = {},
): AgentSummary[] {
  const selectedAgentId = String(options.selectedAgentId || '').trim();
  const recentAgentId = String(options.recentAgentId || '').trim();
  const defaultAgentId = agents.find((agent) => agent.isDefault)?.id || '';

  const priorityMap = new Map<string, number>();
  let nextPriority = 0;
  for (const agentId of [selectedAgentId, recentAgentId, defaultAgentId]) {
    if (!agentId || priorityMap.has(agentId)) {
      continue;
    }
    priorityMap.set(agentId, nextPriority);
    nextPriority += 1;
  }

  return agents
    .map((agent, index) => ({
      agent,
      index,
      priority: priorityMap.has(agent.id) ? priorityMap.get(agent.id)! : Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map((entry) => entry.agent);
}

export function mergeSessionRowsForAgent(
  currentRows: ChatSessionRow[],
  agentId: string,
  incomingRows: ChatSessionRow[],
  options: {
    preserveMissingRows?: ChatSessionRow[];
  } = {},
): ChatSessionRow[] {
  const incomingKeys = new Set(incomingRows.map((row) => row.key));
  const currentByKey = new Map(currentRows.map((row) => [row.key, row] as const));
  const merged = new Map<string, ChatSessionRow>();
  for (const row of currentRows) {
    if (row.agentId === agentId) {
      continue;
    }
    merged.set(row.key, row);
  }
  for (const row of options.preserveMissingRows || []) {
    if (
      row.agentId !== agentId
      || incomingKeys.has(row.key)
    ) {
      continue;
    }
    merged.set(row.key, row);
  }
  for (const row of incomingRows) {
    const existingCurrent = currentByKey.get(row.key);
    const existing = existingCurrent?.agentId === agentId
      ? existingCurrent
      : merged.get(row.key);
    if (!existing || compareChatSessionFreshness(row, existing) < 0) {
      merged.set(row.key, row);
    } else {
      merged.set(row.key, existing);
    }
  }
  return [...merged.values()].sort(sortChatSessionsByUpdatedAt);
}

export function resolveSessionSectionWindow<T>(
  rows: T[],
  options: {
    visibleCount: number;
    searchActive: boolean;
  },
): {
  rows: T[];
  hiddenCount: number;
} {
  const baseVisibleCount = Math.max(0, Math.trunc(options.visibleCount));
  const visibleCount = options.searchActive
    ? Math.max(baseVisibleCount, CHAT_SESSION_SEARCH_VISIBLE_LIMIT)
    : baseVisibleCount;
  return {
    rows: rows.slice(0, visibleCount),
    hiddenCount: Math.max(0, rows.length - visibleCount),
  };
}

export function shouldRevealMoreSessionRowsOnScroll(metrics: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}, thresholdPx = CHAT_SESSION_RAIL_AUTO_REVEAL_THRESHOLD_PX): boolean {
  const scrollHeight = Math.max(0, Number(metrics.scrollHeight) || 0);
  const clientHeight = Math.max(0, Number(metrics.clientHeight) || 0);
  if (scrollHeight > 0 && clientHeight > 0 && scrollHeight <= clientHeight) {
    return true;
  }
  if (scrollHeight <= clientHeight) {
    return false;
  }
  const bottomDistance = scrollHeight - clientHeight - Math.max(0, Number(metrics.scrollTop) || 0);
  return bottomDistance <= Math.max(0, Number(thresholdPx) || 0);
}

export function resolveObservedSessionsForRail<T>(rows: T[], inspectMode: boolean): T[] {
  return inspectMode ? rows : [];
}

export function buildChatSessionDestinationItems(
  folderTree: ChatSessionFolderTreeNode[],
  options: {
    rootId: string;
    rootLabel: string;
    idPrefix?: string;
    disabledIds?: Iterable<string>;
    disableRoot?: boolean;
  },
): ChatSessionDestinationItem[] {
  const prefix = options.idPrefix || '';
  const disabledIds = new Set(options.disabledIds || []);
  const mapNode = (node: ChatSessionFolderTreeNode): ChatSessionDestinationItem => ({
    id: `${prefix}${node.id}`,
    label: node.title,
    disabled: disabledIds.has(node.id),
    ...(node.children.length ? { children: node.children.map(mapNode) } : {}),
  });
  return [
    {
      id: `${prefix}${options.rootId}`,
      label: options.rootLabel,
      disabled: Boolean(options.disableRoot),
    },
    ...folderTree.map(mapNode),
  ];
}

export function buildChatSessionDestinationItemsFromOrganizer(
  organizer: ChatSessionOrganizerState,
  options: {
    rootId: string;
    rootLabel: string;
    idPrefix?: string;
    disabledIds?: Iterable<string>;
    disableRoot?: boolean;
    excludeFolderIds?: Iterable<string>;
  },
): ChatSessionDestinationItem[] {
  const excludedIds = new Set(options.excludeFolderIds || []);
  const filterTree = (nodes: ChatSessionFolderTreeNode[]): ChatSessionFolderTreeNode[] => (
    nodes
      .filter((node) => !excludedIds.has(node.id))
      .map((node) => ({
        ...node,
        children: filterTree(node.children),
      }))
  );
  return buildChatSessionDestinationItems(
    filterTree(deriveOrganizerFolderTree(organizer)),
    options,
  );
}

export function deriveSessionFilterChips(options: {
  selectedAgentId: string;
  agentChipLabel: string | null | undefined;
}): ChatSessionFilterChip[] {
  const selectedAgentId = String(options.selectedAgentId || '').trim();
  if (!selectedAgentId || selectedAgentId === 'all') {
    return [];
  }
  return [
    {
      id: 'agent',
      label: String(options.agentChipLabel || '').trim() || selectedAgentId,
    },
  ];
}

export function clampSessionContextMenuPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  menuSize: { width?: number; height?: number; padding?: number } = {},
): { x: number; y: number } {
  const width = Math.max(0, Math.trunc(menuSize.width ?? CHAT_SESSION_CONTEXT_MENU_SIZE.width));
  const height = Math.max(0, Math.trunc(menuSize.height ?? CHAT_SESSION_CONTEXT_MENU_SIZE.height));
  const padding = Math.max(0, Math.trunc(menuSize.padding ?? CHAT_SESSION_CONTEXT_MENU_SIZE.padding));

  const maxX = Math.max(padding, viewport.width - width - padding);
  const maxY = Math.max(padding, viewport.height - height - padding);

  return {
    x: Math.min(Math.max(point.x, padding), maxX),
    y: Math.min(Math.max(point.y, padding), maxY),
  };
}
